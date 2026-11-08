import { useState } from "react";
import { zipSync } from "fflate";
import { CheckCircle2, Circle, Download, FileText, Loader2, XCircle } from "lucide-react";
import { Panel, PanelHeader } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ConfidenceGauge } from "../../components/ConfidenceGauge";
import { EmptyState } from "../../components/EmptyState";
import { supabase, EXPORTS_BUCKET, ARTIFACTS_BUCKET } from "../../lib/supabase";
import { buildRecoveryPackage, downloadZip } from "../../lib/exporter";
import { toAnalysisResult, toEnvironmentSpec } from "../../lib/reconstruct";
import { useAuth } from "../../context/AuthContext";
import {
  VERIFICATION_LEVELS,
  type Analysis,
  type AuditEvent,
  type BlockerRow,
  type Environment,
  type PatchRow,
  type PlanStepRow,
  type Project,
  type VerificationRow,
} from "../../lib/types";

export function ReportTab({
  project,
  analysis,
  plan,
  blockers,
  environment,
  patches,
  verification,
  audit,
}: {
  project: Project;
  analysis: Analysis | null | undefined;
  plan: PlanStepRow[];
  blockers: BlockerRow[];
  environment: Environment | null | undefined;
  patches: PatchRow[];
  verification: VerificationRow[];
  audit: AuditEvent[];
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fixedMsg, setFixedMsg] = useState<string | null>(null);

  const result = toAnalysisResult(analysis, plan, blockers, environment);
  const level = Math.max(0, Math.min(5, Math.round(project.confidence_level)));

  async function onDownloadFixed() {
    setFixedMsg(null);
    const { data, error } = await supabase.storage.from(ARTIFACTS_BUCKET).download(`${project.user_id}/${project.id}/fixed-project.zip`);
    if (error || !data) {
      setFixedMsg("No fixed project yet: run a live recovery that applies at least one patch first.");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"}-fixed.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onExport() {
    if (!result) return;
    setBusy(true);
    try {
      const { files, filename } = buildRecoveryPackage({
        project,
        analysis: result,
        environment: toEnvironmentSpec(environment),
        planSteps: plan,
        blockers,
        patches,
        verification,
        audit,
      });
      downloadZip(files, filename);
      setDone(true);

      // Best-effort archive to Storage (does not block the download).
      if (user) {
        try {
          const zipped = zipSync(files, { level: 6 });
          const path = `${user.id}/${project.id}/${filename}`;
          const { error } = await supabase.storage.from(EXPORTS_BUCKET).upload(path, new Blob([zipped as unknown as BlobPart]), { upsert: true });
          if (!error) await supabase.from("exports").insert({ project_id: project.id, format: "zip", storage_path: path });
        } catch {
          /* storage is optional */
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!result) {
    return (
      <EmptyState icon={<FileText className="h-6 w-6" />} title="No report yet" message="Run an archaeological scan and a recovery to generate the report and export bundle." />
    );
  }

  const passed = verification.filter((v) => v.status === "pass").length;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Panel>
          <PanelHeader
            title="Verification report"
            icon={<CheckCircle2 className="h-4 w-4" />}
            subtitle={`${passed} of ${verification.length || VERIFICATION_LEVELS.length} levels passed`}
          />
          <div className="px-5 py-5">
            {verification.length === 0 ? (
              <p className="text-sm text-muted">No verification has run yet. Run a recovery from the Execution tab.</p>
            ) : (
              <ol className="space-y-3">
                {[...verification].sort((a, b) => a.level - b.level).map((v) => (
                  <li key={v.id} className="rounded-lg border border-line bg-inset px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-fg">
                        <span className="mr-1.5 font-mono text-xs text-faint">{v.level}</span>
                        {v.name}
                      </p>
                      <span aria-hidden="true">
                        {v.status === "pass" ? (
                          <CheckCircle2 className="h-4 w-4 text-ok" />
                        ) : v.status === "fail" ? (
                          <XCircle className="h-4 w-4 text-danger" />
                        ) : (
                          <Circle className="h-4 w-4 text-faint" />
                        )}
                      </span>
                    </div>
                    {v.criteria && <p className="mt-0.5 text-[11px] text-muted">{v.criteria}</p>}
                    {(v.evidence ?? []).map((e, i) => (
                      <p key={i} className="mt-1 font-mono text-[11px] text-faint">
                        {e}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Panel>

        {patches.length > 0 && (
          <Panel>
            <PanelHeader title="Patch set" icon={<FileText className="h-4 w-4" />} subtitle="Every change is reversible and documented." />
            <div className="space-y-3 px-5 py-4">
              {patches.map((p) => (
                <div key={p.id} className="rounded-lg border border-line bg-inset p-3">
                  <span className="font-mono text-xs text-accent">{p.file_path}</span>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted">{p.diff}</pre>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Fixed project" icon={<Download className="h-4 w-4" />} />
          <div className="space-y-3 px-5 py-4">
            <p className="text-xs text-muted">
              Your original ZIP with every patch applied, ready to run. The original upload is never modified.
            </p>
            <Button onClick={onDownloadFixed} className="w-full">
              <Download aria-hidden="true" className="h-4 w-4" />
              Download fixed project
            </Button>
            {fixedMsg && <p className="text-xs text-muted" role="status">{fixedMsg}</p>}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Export recovery package" icon={<Download className="h-4 w-4" />} />
          <div className="space-y-3 px-5 py-4">
            <p className="text-xs text-muted">
              A self-contained bundle: Dockerfile, pinned environment manifest, dependency manifest, reversible patches,
              recovery + verification reports, and a README.
            </p>
            <Button onClick={onExport} disabled={busy} className="w-full">
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="h-4 w-4" />}
              {busy ? "Building bundle…" : "Download .zip"}
            </Button>
            {done && (
              <p className="flex items-center gap-1.5 text-xs text-ok" role="status">
                <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                Bundle generated. Check your downloads.
              </p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Confidence report" icon={<CheckCircle2 className="h-4 w-4" />} />
          <div className="px-5 py-5">
            <ConfidenceGauge level={level} />
            <div className="mt-4 space-y-2 text-xs">
              <Line label="Era confidence" value={`${Math.round((analysis?.era?.confidence ?? 0) * 100)}%`} />
              <Line label="Analysis confidence" value={`${Math.round((analysis?.confidence ?? 0) * 100)}%`} />
              <Line label="Blockers" value={`${blockers.length}`} />
              <Line label="Patches" value={`${patches.length}`} />
            </div>
            <p className="mt-4 text-[11px] text-faint">
              Levels 2 and 5 are not equivalent: “App Launched” only proves it starts; “Behavior Equivalence” proves it
              behaves the same. We never report a level the evidence doesn’t support.
            </p>
          </div>
        </Panel>

        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="flex items-center gap-2">
            <Badge tone={audit.some((a) => a.type === "sandbox_proof") ? "ok" : "warn"}>{audit.some((a) => a.type === "sandbox_proof") ? "Live sandbox" : "Simulated"}</Badge>
            <span className="text-xs text-muted">Execution layer</span>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            The exported Dockerfile is a best-effort recipe and has not itself been proven to build; live runs verify the commands in the sandbox.
          </p>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-fg">{value}</span>
    </div>
  );
}
