import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { strToU8, unzipSync, zipSync } from "fflate";
import { CheckCircle2, Circle, GitCommitHorizontal, Loader2, Play, XCircle } from "lucide-react";
import { Panel, PanelHeader } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LogStream, type LogLine } from "../../components/LogStream";
import { SimulatedNotice } from "../../components/SimulatedNotice";
import { LiveNotice } from "../../components/LiveNotice";
import { ContainmentPanel } from "../../components/ContainmentPanel";
import { EmptyState } from "../../components/EmptyState";
import { ARTIFACTS_BUCKET, supabase } from "../../lib/supabase";
import { API_BASE, authHeader, fetchHealth, readNdjson, type BackendHealth, type ContainmentProof } from "../../lib/api";
import { buildSimulation } from "../../lib/simulation";
import { toAnalysisResult } from "../../lib/reconstruct";
import { useAudit, useLogs, useLatestExecution, usePatches, useVerification } from "../../lib/queries";
import {
  VERIFICATION_LEVELS,
  type Analysis,
  type AnalysisResult,
  type BlockerRow,
  type Environment,
  type EnvironmentSpec,
  type PlanStepRow,
  type Project,
} from "../../lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CAP_LINES = 1500;

/** Thrown before any output streamed: safe to fall back to the simulator. */
class PreStreamError extends Error {}

interface PatchOut { file_path: string; diff: string; rationale: string }
interface VerOut { level: number; name: string; criteria: string; status: "pass" | "fail" | "unknown"; evidence: string[] }
interface Outcome {
  live: boolean;
  status: "complete" | "partial" | "failed";
  iterations: number;
  budget: number;
  finalLevel: number;
  result: string;
  lines: LogLine[];
  patches: PatchOut[];
  verification: VerOut[];
  proof: ContainmentProof | null;
  env?: { base_image?: string; digest?: string };
  fixedFiles?: Record<string, string>;
  originalZip?: Blob;
}

export function ExecutionTab({
  project,
  analysis,
  plan,
  blockers,
  environment,
}: {
  project: Project;
  analysis: Analysis | null | undefined;
  plan: PlanStepRow[];
  blockers: BlockerRow[];
  environment: Environment | null | undefined;
}) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<BackendHealth | null | undefined>(undefined);
  const [proof, setProof] = useState<ContainmentProof | null>(null);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const cancelled = useRef(false);
  const ctrl = useRef<AbortController | null>(null);

  const { data: latestExec } = useLatestExecution(project.id);
  const { data: storedLogs } = useLogs(latestExec?.id);
  const { data: patches } = usePatches(project.id);
  const { data: verification } = useVerification(project.id);
  const { data: audit } = useAudit(project.id);

  useEffect(() => {
    fetchHealth().then(setHealth);
    return () => {
      cancelled.current = true;
      ctrl.current?.abort();
    };
  }, []);

  const result = toAnalysisResult(analysis, plan, blockers, environment);
  const spec = result?.suggestedEnvironment ?? null;
  const liveReady = Boolean(health?.docker && health?.inference);
  const canRun = Boolean(result && spec) && !running && health !== undefined;

  const persistedProof = [...(audit ?? [])].reverse().find((a) => a.type === "sandbox_proof")?.payload as unknown as ContainmentProof | undefined;
  const shownProof = proof ?? persistedProof ?? null;

  const displayLines: LogLine[] =
    running || lines.length > 0
      ? lines
      : (storedLogs ?? []).map((l) => ({ level: l.level, phase: l.phase, message: l.message, ts: l.ts }));

  /* ---------- simulated engine (fallback) ---------- */
  async function runSimulated(res: AnalysisResult, sp: EnvironmentSpec): Promise<Outcome> {
    const script = buildSimulation(project, res, sp);
    const shown: LogLine[] = [];
    for (const line of script.lines) {
      if (cancelled.current) break;
      await sleep(line.delay);
      if (cancelled.current) break;
      shown.push(line);
      setLines([...shown]);
    }
    return {
      live: false, status: script.finalStatus, iterations: script.iterations, budget: script.budget, finalLevel: script.finalLevel,
      result: script.result, lines: script.lines, patches: script.patches, verification: script.verification, proof: null,
    };
  }

  /* ---------- live engine: Vultr backend + Docker sandbox ---------- */
  async function runLive(res: AnalysisResult): Promise<Outcome> {
    const { data: art } = await supabase
      .from("artifacts")
      .select("storage_path, filename")
      .eq("project_id", project.id)
      .eq("kind", "zip")
      .not("storage_path", "is", null)
      .limit(1)
      .maybeSingle();
    if (!art?.storage_path) throw new PreStreamError("this project has no uploaded ZIP to execute");
    const dl = await supabase.storage.from(ARTIFACTS_BUCKET).download(art.storage_path);
    if (dl.error || !dl.data) throw new PreStreamError("the uploaded ZIP could not be downloaded");

    const form = new FormData();
    form.append(
      "meta",
      JSON.stringify({
        projectName: project.name,
        mode: project.recovery_mode,
        goals: project.goals,
        hints: { languages: res.languages.map((l) => l.name), era: res.era.label, baseImage: res.suggestedEnvironment.base_image },
      }),
    );
    form.append("zip", dl.data, art.filename);

    ctrl.current = new AbortController();
    let resp: Response;
    try {
      resp = await fetch(`${API_BASE}/run`, { method: "POST", headers: await authHeader(), body: form, signal: ctrl.current.signal });
    } catch {
      throw new PreStreamError("the Vultr backend is unreachable");
    }
    if (!resp.ok) {
      let msg = "";
      try { msg = String(((await resp.json()) as { error?: string }).error ?? ""); } catch { /* not json */ }
      throw new PreStreamError(msg || `the backend answered ${resp.status}`);
    }

    const out: Outcome = { live: true, status: "failed", iterations: 0, budget: 4, finalLevel: 0, result: "", lines: [], patches: [], verification: [], proof: null, originalZip: dl.data };
    const patchMap = new Map<string, PatchOut>();
    const ver = new Map<number, VerOut>();
    let finished = false;
    try {
      await readNdjson(resp, (e) => {
        switch (e.type) {
          case "log": {
            out.lines.push({ level: e.level as LogLine["level"], phase: String(e.phase ?? ""), message: String(e.message ?? ""), ts: new Date().toISOString() });
            setLines([...out.lines]);
            break;
          }
          case "patch": {
            patchMap.set(String(e.file_path), { file_path: String(e.file_path), diff: String(e.diff ?? ""), rationale: String(e.rationale ?? "") });
            break;
          }
          case "verification": {
            ver.set(Number(e.level), {
              level: Number(e.level), name: String(e.name ?? ""), criteria: String(e.criteria ?? ""),
              status: e.status as VerOut["status"], evidence: Array.isArray(e.evidence) ? (e.evidence as string[]) : [],
            });
            break;
          }
          case "containment": {
            const p: ContainmentProof = { controls: e.controls as ContainmentProof["controls"], probes: e.probes as ContainmentProof["probes"] };
            out.proof = p;
            setProof(p);
            break;
          }
          case "done": {
            finished = true;
            out.status = e.status as Outcome["status"];
            out.iterations = Number(e.iterations) || 0;
            out.budget = Number(e.budget) || 4;
            out.finalLevel = Number(e.finalLevel) || 0;
            out.result = String(e.result ?? "");
            const env = e.environment as { base_image?: string; digest?: string | null } | undefined;
            if (env) out.env = { base_image: env.base_image, digest: env.digest ?? undefined };
            if (e.fixedFiles && typeof e.fixedFiles === "object") out.fixedFiles = e.fixedFiles as Record<string, string>;
            break;
          }
          default:
            break;
        }
      });
    } catch (err) {
      if (!cancelled.current) {
        out.lines.push({ level: "error", phase: "recovery_report", message: `Connection to the backend was interrupted: ${err instanceof Error ? err.message : "unknown error"}` });
        setLines([...out.lines]);
      }
    }
    if (!finished) out.result = cancelled.current ? "Run cancelled." : "The backend connection ended before the run finished.";
    out.patches = [...patchMap.values()];
    out.verification = [...ver.values()].sort((a, b) => a.level - b.level);
    return out;
  }

  /* ---------- fixed project: original ZIP with the patched files swapped in ---------- */
  async function saveFixedProject(o: Outcome) {
    const path = `${project.user_id}/${project.id}/fixed-project.zip`;
    await supabase.storage.from(ARTIFACTS_BUCKET).remove([path]); // never leave a stale one behind
    if (!o.live || !o.originalZip || !o.fixedFiles || Object.keys(o.fixedFiles).length === 0) return;
    const entries = unzipSync(new Uint8Array(await o.originalZip.arrayBuffer()));
    const names = Object.keys(entries).filter((n) => !n.endsWith("/") && !n.startsWith("__MACOSX/"));
    const tops = new Set(names.map((n) => n.split("/")[0]));
    const prefix = tops.size === 1 && names.every((n) => n.includes("/")) ? `${[...tops][0]}/` : "";
    for (const [rel, content] of Object.entries(o.fixedFiles)) entries[prefix + rel] = strToU8(content);
    const blob = new Blob([zipSync(entries) as unknown as BlobPart], { type: "application/zip" });
    await supabase.storage.from(ARTIFACTS_BUCKET).upload(path, blob, { upsert: true, contentType: "application/zip" });
  }

  /* ---------- persistence (same tables for both engines) ---------- */
  async function persist(execId: string | undefined, o: Outcome) {
    try {
      await saveFixedProject(o);
    } catch {
      /* the fixed ZIP is a bonus: never block saving the run itself */
    }
    if (execId) {
      if (o.lines.length) {
        await supabase.from("execution_logs").insert(
          o.lines.slice(0, CAP_LINES).map((l) => ({ execution_id: execId, level: l.level, phase: l.phase ?? null, message: l.message })),
        );
      }
      await supabase.from("executions").update({
        status: o.status, ended_at: new Date().toISOString(), result: o.result, iterations_used: o.iterations, budget: o.budget,
      }).eq("id", execId);
    }

    await supabase.from("patches").delete().eq("project_id", project.id);
    if (o.patches.length) {
      await supabase.from("patches").insert(
        o.patches.map((p) => ({ project_id: project.id, file_path: p.file_path, diff: p.diff, rationale: p.rationale, reversible: true })),
      );
    }

    await supabase.from("verification_results").delete().eq("project_id", project.id);
    if (o.verification.length) {
      await supabase.from("verification_results").insert(
        o.verification.map((v) => ({ project_id: project.id, level: v.level, name: v.name, criteria: v.criteria, status: v.status, evidence: v.evidence })),
      );
    }

    const events: Record<string, unknown>[] = [
      { project_id: project.id, phase: "execution", type: "recovery_run", summary: o.result, payload: { iterations: o.iterations, budget: o.budget, live: o.live } },
      { project_id: project.id, phase: "verification", type: "verification", summary: `Verified to level ${o.finalLevel} of 5.`, payload: { level: o.finalLevel } },
    ];
    if (o.live && o.proof) {
      const passed = o.proof.probes.filter((p) => p.pass).length;
      events.push({
        project_id: project.id, phase: "containment", type: "sandbox_proof",
        summary: `${passed}/${o.proof.probes.length} containment probes passed before any project code ran.`,
        payload: { ...o.proof, base_image: o.env?.base_image ?? null },
      });
    }
    await supabase.from("audit_events").insert(events);

    if (o.env?.base_image && environment) {
      await supabase.from("environments").update({ base_image: o.env.base_image, base_image_digest: o.env.digest ?? "sha256:unavailable" }).eq("id", environment.id);
    }
    await supabase
      .from("projects")
      .update({ status: o.status === "complete" ? "complete" : o.status === "failed" ? "failed" : "partial", confidence_level: o.finalLevel })
      .eq("id", project.id);
  }

  async function run() {
    if (!result || !spec) return;
    cancelled.current = false;
    setRunning(true);
    setLines([]);
    setProof(null);
    setFallbackNote(null);

    const { data: execRow } = await supabase
      .from("executions")
      .insert({ project_id: project.id, status: "running", started_at: new Date().toISOString(), budget: liveReady ? 4 : 5 })
      .select()
      .single();
    await supabase.from("projects").update({ status: "building" }).eq("id", project.id);
    await qc.invalidateQueries({ queryKey: ["project", project.id] });

    let outcome: Outcome;
    try {
      if (liveReady) {
        try {
          outcome = await runLive(result);
        } catch (e) {
          if (!(e instanceof PreStreamError)) throw e;
          setFallbackNote(`Live sandbox not used: ${e.message}.`);
          outcome = await runSimulated(result, spec);
        }
      } else {
        outcome = await runSimulated(result, spec);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unexpected error";
      outcome = {
        live: false, status: "failed", iterations: 0, budget: 4, finalLevel: 0, result: `Run failed: ${msg}`,
        lines: [{ level: "error", phase: "recovery_report", message: `Run failed: ${msg}` }], patches: [], verification: [], proof: null,
      };
      setLines(outcome.lines);
    }

    try {
      await persist(execRow?.id, outcome);
    } catch {
      /* the on-screen result stays visible even if saving fails */
    }
    await qc.invalidateQueries();
    setRunning(false);
  }

  if (!analysis || !environment) {
    return (
      <EmptyState
        icon={<Play className="h-6 w-6" />}
        title="Nothing to execute yet"
        message="Once an environment has been reconstructed, you can run the recovery loop and watch it work."
      />
    );
  }

  const simReason = fallbackNote ?? (health === null ? "The Vultr backend is unreachable." : health && !health.docker ? "Docker is not available on the backend." : health && !health.inference ? "No Vultr Inference key is configured on the backend." : undefined);
  const usingLive = liveReady && !fallbackNote;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {health === undefined ? null : usingLive ? <LiveNotice model={health?.model} /> : <SimulatedNotice reason={simReason} />}
        <Panel>
          <PanelHeader
            title="Recovery loop"
            icon={<Play className="h-4 w-4" />}
            subtitle="BUILD_ATTEMPT → ERROR_ANALYSIS → RECOVERY_ACTION → retry"
            actions={
              <Button onClick={run} disabled={!canRun}>
                {running ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Play aria-hidden="true" className="h-4 w-4" />}
                {running ? "Running…" : liveReady ? (lines.length || storedLogs?.length ? "Re-run in sandbox" : "Run in Vultr sandbox") : lines.length || storedLogs?.length ? "Re-run" : "Run simulated recovery"}
              </Button>
            }
          />
          <div className="px-5 py-5">
            <LogStream lines={displayLines} live={running} className="h-[440px]" />
            <div className="mt-3 flex items-center justify-between text-[11px] text-faint">
              <span>
                Budget: {latestExec?.budget ?? (liveReady ? 4 : 5)} iterations · used {latestExec?.iterations_used ?? (running ? "…" : 0)}
              </span>
              {latestExec?.result && !running && <span className="truncate text-muted">{latestExec.result}</span>}
            </div>
          </div>
        </Panel>

        {patches && patches.length > 0 && (
          <Panel>
            <PanelHeader title="Patches applied" icon={<GitCommitHorizontal className="h-4 w-4" />} subtitle="Minimal, reversible — never silently applied." />
            <div className="space-y-3 px-5 py-4">
              {patches.map((p) => (
                <div key={p.id} className="rounded-lg border border-line bg-inset p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-accent">{p.file_path}</span>
                    <Badge tone="ok">reversible</Badge>
                  </div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted">{p.diff}</pre>
                  {p.rationale && <p className="mt-2 text-[11px] text-faint">{p.rationale}</p>}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Verification ladder" icon={<CheckCircle2 className="h-4 w-4" />} subtitle="Never claims more than the evidence." />
          <div className="px-5 py-4">
            <ol className="space-y-2">
              {VERIFICATION_LEVELS.map((v) => {
                const row = (verification ?? []).find((r) => r.level === v.level);
                const status = row?.status ?? "unknown";
                return (
                  <li key={v.level} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      {status === "pass" ? (
                        <CheckCircle2 className="h-4 w-4 text-ok" />
                      ) : status === "fail" ? (
                        <XCircle className="h-4 w-4 text-danger" />
                      ) : (
                        <Circle className="h-4 w-4 text-faint" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-fg">
                        <span className="mr-1.5 font-mono text-xs text-faint">{v.level}</span>
                        {v.name}
                      </p>
                      {row?.evidence?.[0] ? <p className="text-[11px] text-muted">{row.evidence[0]}</p> : row?.criteria && <p className="text-[11px] text-muted">{row.criteria}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </Panel>
        <ContainmentPanel proof={shownProof} />
      </div>
    </div>
  );
}
