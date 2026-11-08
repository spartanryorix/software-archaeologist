import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRight, Boxes, FileArchive, FileText, GitBranch, Loader2, UploadCloud } from "lucide-react";
import { supabase, ARTIFACTS_BUCKET } from "../lib/supabase";
import { analyzer, lastAnalysisInfo } from "../lib/analyzer";
import { extractZip, classifyArtifact, readFileBytes, readFileText } from "../lib/files";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Field, Input, Textarea } from "../components/ui/Field";
import { Panel, PanelHeader } from "../components/ui/Panel";
import { LiveNotice } from "../components/LiveNotice";
import { cn } from "../lib/utils";
import {
  RECOVERY_GOALS,
  RECOVERY_MODES,
  type ArtifactKind,
  type RecoveryGoal,
  type RecoveryMode,
} from "../lib/types";

const TEXT_EXT = /\.(txt|md|rst|json|xml|toml|ya?ml|ini|cfg|log|csv|js|ts|jsx|tsx|py|rb|php|java|go|rs|c|cpp|h|cs|sh|sql|properties|gradle|lock)$/i;

const STEPS = ["Basics", "Source", "Review"];

interface PreparedArtifact {
  filename: string;
  kind: ArtifactKind;
  size: number;
  bytes?: Uint8Array;
  text?: string | null;
  inArchive?: boolean;
}

export function NewProject() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<RecoveryMode>("repair");
  const [goals, setGoals] = useState<RecoveryGoal[]>(["build", "run"]);
  const [sourceType, setSourceType] = useState<"zip" | "folder" | "menifests" | "git_url">("zip");
  const [files, setFiles] = useState<File[]>([]);
  const [gitUrl, setGitUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");

  const canNext = useMemo(() => {
    if (step === 1) return name.trim().length > 1;
    if (step === 2) {
      if (sourceType === "git_url") return gitUrl.trim().length > 4;
      return files.length > 0;
    }
    return true;
  }, [step, name, sourceType, gitUrl, files]);

  function toggleGoal(g: RecoveryGoal) {
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function createMission() {
    if (!user) return;
    setError(null);
    setWorking(true);
    try {
      setProgress("Recording the recovery mission…");
      const { data: proj, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: name.trim(),
          description: description.trim() || null,
          recovery_mode: mode,
          goals,
          status: "scanning",
          source_type: sourceType,
          source_ref: sourceType === "git_url" ? gitUrl.trim() : null,
        })
        .select()
        .single();
      if (projErr || !proj) throw new Error(projErr?.message ?? "Could not create the project.");

      // ---- prepare artifacts (client-side extraction) ----
      setProgress("Preserving the submitted source…");
      const prepared: PreparedArtifact[] = [];
      let fileTree: string[] = [];

      for (const file of files) {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const bytes = await readFileBytes(file);
          const contents = extractZip(bytes);
          fileTree = fileTree.concat(contents.tree);
          prepared.push({ filename: file.name, kind: "zip", size: file.size, bytes });
          for (const m of contents.manifests.slice(0, 40)) {
            prepared.push({
              filename: m.path.split("/").pop() ?? m.path,
              kind: "manifest",
              size: m.size,
              text: m.text,
              inArchive: true,
            });
          }
        } else {
          fileTree.push(file.name);
          const isText = TEXT_EXT.test(file.name);
          const text = isText ? await readFileText(file) : null;
          prepared.push({
            filename: file.name,
            kind: classifyArtifact(file.name),
            size: file.size,
            bytes: isText ? undefined : await readFileBytes(file),
            text,
          });
        }
      }

      // ---- upload binary artifacts to Storage ----
      const uploadedPaths: Record<string, string> = {};
      for (const a of prepared) {
        if (!a.bytes) continue;
        const path = `${user.id}/${proj.id}/${a.filename}`;
        const { error: upErr } = await supabase.storage.from(ARTIFACTS_BUCKET).upload(path, a.bytes, { upsert: true });
        if (!upErr) uploadedPaths[a.filename] = path;
      }

      const artifactRows = prepared.map((a) => ({
        project_id: proj.id,
        kind: a.kind,
        filename: a.filename,
        size_bytes: a.size,
        storage_path: uploadedPaths[a.filename] ?? null,
        content_text: a.text ?? null,
      }));
      if (artifactRows.length) {
        const { error: artErr } = await supabase.from("artifacts").insert(artifactRows);
        if (artErr) throw new Error(artErr.message);
      }

      // ---- run the archaeologist ----
      setProgress("Scanning artifacts and reconstructing the era…");
      const result = await analyzer.analyze({
        projectId: proj.id,
        mode,
        goals,
        artifacts: prepared.map((a) => ({ filename: a.filename, kind: a.kind, text: a.text ?? null })),
        fileTree,
      });

      setProgress("Persisting findings, plan and environment…");
      await supabase.from("analyses").insert({
        project_id: proj.id,
        detected_languages: result.languages,
        detected_frameworks: result.frameworks,
        build_systems: result.buildSystems,
        dependency_graph: result.dependencyGraph,
        missing_assets: result.missingAssets,
        safety_risks: result.safetyRisks,
        era: result.era,
        confidence: result.confidence,
      });

      if (result.blockers.length) {
        await supabase.from("blockers").insert(
          result.blockers.map((b) => ({
            project_id: proj.id,
            title: b.title,
            category: b.category,
            severity: b.severity,
            evidence: b.evidence,
            status: "open",
          })),
        );
      }

      await supabase.from("plan_steps").insert(
        result.recoveryPlan.steps.map((s, i) => ({
          project_id: proj.id,
          step_order: i,
          title: s.title,
          description: s.description,
          action_type: s.action_type,
          safety_guard: s.safety_guard,
          status: i === 0 ? "approved" : "pending",
        })),
      );

      await supabase.from("environments").insert({
        project_id: proj.id,
        env_type: result.suggestedEnvironment.env_type,
        runtime: result.suggestedEnvironment.runtime,
        runtime_version: result.suggestedEnvironment.runtime_version,
        base_image: result.suggestedEnvironment.base_image,
        base_image_digest: result.suggestedEnvironment.base_image_digest,
        packages: result.suggestedEnvironment.packages,
        manifest: {
          schema: "software-archaeologist/environment-manifest@1",
          pinned: true,
          base_image: result.suggestedEnvironment.base_image,
          build_systems: result.buildSystems,
          safety_guards: result.recoveryPlan.safetyGuards,
          verification_targets: result.recoveryPlan.verificationTargets,
        },
      });

      if (result.suggestedEnvironment.packages.length) {
        await supabase.from("dependencies").insert(
          result.suggestedEnvironment.packages.slice(0, 60).map((p) => ({
            project_id: proj.id,
            name: p.name,
            version: p.version,
            source: "manifest analysis",
            status: "missing",
          })),
        );
      }

      await supabase.from("audit_events").insert([
        { project_id: proj.id, phase: "ingestion", type: "project_created", summary: `Mission “${name.trim()}” created in ${mode} mode.`, payload: { mode, goals } },
        { project_id: proj.id, phase: "static_analysis", type: "scan_complete", summary: `Detected ${result.languages.length} language(s), ${result.frameworks.length} framework(s), ${result.blockers.length} blocker(s).${lastAnalysisInfo.source === "vultr" ? ` Analysed by ${lastAnalysisInfo.model} on Vultr Serverless Inference.` : " (offline heuristic analysis)"}`, payload: { analyzer: lastAnalysisInfo.source, model: lastAnalysisInfo.model ?? null } },
        { project_id: proj.id, phase: "recovery_plan", type: "plan_generated", summary: `Recovery plan with ${result.recoveryPlan.steps.length} steps generated.`, payload: {} },
      ]);

      const level = Math.max(0, Math.min(5, Math.round(result.confidence * 5) - 2));
      await supabase
        .from("projects")
        .update({ status: "planned", confidence_level: Math.max(0, level) })
        .eq("id", proj.id);

      await qc.invalidateQueries();
      navigate(`/projects/${proj.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while creating the mission.");
      setWorking(false);
      setProgress("");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back
        </Button>
      </div>

      <h1 className="font-heading text-xl font-semibold text-fg sm:text-2xl">New Recovery Mission</h1>
      <p className="mt-1 text-sm text-muted">Bring a project back from the dead. A guided, evidence-driven recovery.</p>

      {/* stepper */}
      <ol className="mt-6 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <div className={cn("flex items-center gap-2", !active && !done && "opacity-60")}>
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold",
                    done ? "border-ok/50 bg-[#062a26] text-ok" : active ? "border-accent/60 bg-[#072b33] text-accent" : "border-line text-muted",
                  )}
                >
                  {n}
                </span>
                <span className={cn("text-xs font-medium", active ? "text-fg" : "text-muted")}>{label}</span>
              </div>
              {n < STEPS.length && <span className={cn("h-px flex-1", done ? "bg-ok/40" : "bg-line")} />}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 space-y-4">
        {step === 1 && (
          <Panel>
            <PanelHeader title="The basics" icon={<Boxes className="h-4 w-4" />} subtitle="What are we recovering, and how far should we go?" />
            <div className="space-y-5 px-5 py-5">
              <Field label="Project name" htmlFor="name" required hint="A recognisable name — e.g. “Acme Payroll 2007”.">
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Payroll (2007)" />
              </Field>
              <Field label="Description" htmlFor="desc" hint="What is it, and what's broken? Optional.">
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A legacy Python 2.7 invoicing tool we inherited and can no longer build." />
              </Field>

              <fieldset>
                <legend className="mb-2 text-xs font-medium tracking-wide text-muted">Recovery mode</legend>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Recovery mode">
                  {RECOVERY_MODES.map((m) => {
                    const selected = mode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setMode(m.value)}
                        className={cn(
                          "cursor-pointer rounded-lg border p-3 text-left transition-colors duration-150",
                          selected ? "border-accent/60 bg-[#072b33]" : "border-line bg-inset hover:border-line-strong",
                        )}
                      >
                        <span className={cn("text-sm font-semibold", selected ? "text-accent" : "text-fg")}>{m.label}</span>
                        <span className="mt-1 block text-xs text-muted">{m.blurb}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-xs font-medium tracking-wide text-muted">Recovery goals</legend>
                <div className="flex flex-wrap gap-2">
                  {RECOVERY_GOALS.map((g) => {
                    const selected = goals.includes(g.value);
                    return (
                      <button
                        key={g.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleGoal(g.value)}
                        className={cn(
                          "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                          selected ? "border-accent/60 bg-[#072b33] text-accent" : "border-line text-muted hover:text-fg",
                        )}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </Panel>
        )}

        {step === 2 && (
          <Panel>
            <PanelHeader title="Source material" icon={<FileArchive className="h-4 w-4" />} subtitle="Upload the project so we can read its fingerprints." />
            <div className="space-y-5 px-5 py-5">
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { value: "zip", label: "Archive", icon: FileArchive, hint: "ZIP of the project" },
                    { value: "menifests", label: "Manifests / files", icon: FileText, hint: "package.json, requirements.txt…" },
                    { value: "git_url", label: "Git URL", icon: GitBranch, hint: "Reference only" },
                  ] as const
                ).map((opt) => {
                  const selected = sourceType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSourceType(opt.value)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150",
                        selected ? "border-accent/60 bg-[#072b33] text-accent" : "border-line text-muted hover:border-line-strong hover:text-fg",
                      )}
                    >
                      <opt.icon aria-hidden="true" className="h-4 w-4" />
                      <span className="text-xs font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {sourceType === "git_url" ? (
                <Field label="Repository URL" htmlFor="git" hint="In this MVP the URL is stored as reference metadata only — we do not clone it. Upload an archive for full analysis.">
                  <Input id="git" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/org/legacy-repo" />
                </Field>
              ) : (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
                  }}
                  className="rounded-xl border border-dashed border-line-strong bg-inset px-6 py-8 text-center"
                >
                  <UploadCloud aria-hidden="true" className="mx-auto h-8 w-8 text-accent" />
                  <p className="mt-3 text-sm text-fg">Drag &amp; drop files here</p>
                  <p className="mt-1 text-xs text-muted">
                    {sourceType === "zip" ? "A .zip archive of the project" : "Individual source files or manifests"}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={sourceType === "zip" ? ".zip" : undefined}
                    className="hidden"
                    onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                  />
                  <Button variant="secondary" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                    Choose files
                  </Button>

                  {files.length > 0 && (
                    <ul className="mt-4 space-y-1 text-left">
                      {files.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-md bg-raised px-3 py-1.5 text-xs">
                          <span className="truncate font-mono text-muted">{f.name}</span>
                          <button
                            type="button"
                            className="ml-3 cursor-pointer text-faint hover:text-danger"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </Panel>
        )}

        {step === 3 && (
          <Panel>
            <PanelHeader title="Review & begin" icon={<Boxes className="h-4 w-4" />} subtitle="Confirm the mission, then let the archaeologist work." />
            <div className="space-y-4 px-5 py-5">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Summary label="Name" value={name || "—"} />
                <Summary label="Mode" value={RECOVERY_MODES.find((m) => m.value === mode)?.label ?? mode} />
                <Summary label="Goals" value={goals.length ? goals.join(", ") : "—"} />
                <Summary
                  label="Source"
                  value={sourceType === "git_url" ? gitUrl || "—" : `${files.length} file(s)`}
                />
              </dl>
              {description && <Summary label="Description" value={description} />}
              <LiveNotice />
              {error && (
                <p className="flex items-center gap-2 rounded-lg border border-[#7a2333] bg-[#2c0a12] px-3 py-2 text-xs text-[#ffc2cd]" role="alert">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}
            </div>
          </Panel>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="secondary" disabled={step === 1 || working} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back
        </Button>
        {step < 3 ? (
          <Button
            disabled={!canNext}
            onClick={() => {
              setError(null);
              setStep((s) => s + 1);
            }}
          >
            Continue
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={createMission} disabled={working} size="lg">
            {working ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Boxes aria-hidden="true" className="h-4 w-4" />}
            {working ? progress || "Working…" : "Begin recovery"}
          </Button>
        )}
      </div>

      {working && (
        <p className="mt-3 text-center text-xs text-muted" role="status" aria-live="polite">
          {progress}
        </p>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-inset px-3 py-2">
      <dt className="text-[11px] uppercase tracking-widest text-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{value}</dd>
    </div>
  );
}
