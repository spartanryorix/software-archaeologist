import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, GitFork, PackageSearch, Search } from "lucide-react";
import { Panel, PanelHeader } from "../../components/ui/Panel";
import { Badge, type Tone } from "../../components/ui/Badge";
import { EmptyState } from "../../components/EmptyState";
import type { Analysis, AuditEvent, BlockerRow } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";

const TYPE_ICON: Record<string, ReactNode> = {
  project_created: <FileSearch className="h-3.5 w-3.5" />,
  scan_complete: <Search className="h-3.5 w-3.5" />,
  plan_generated: <GitFork className="h-3.5 w-3.5" />,
  recovery_run: <PackageSearch className="h-3.5 w-3.5" />,
  verification: <CheckCircle2 className="h-3.5 w-3.5" />,
};

const PHASE_TONE: Record<string, Tone> = {
  ingestion: "muted",
  static_analysis: "primary",
  recovery_plan: "accent",
  execution: "warn",
  verification: "ok",
};

export function InvestigationTab({
  analysis,
  audit,
  blockers,
}: {
  analysis: Analysis | null | undefined;
  audit: AuditEvent[];
  blockers: BlockerRow[];
}) {
  const events = [...audit].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Panel>
          <PanelHeader
            title="Investigation timeline"
            icon={<Search className="h-4 w-4" />}
            subtitle="Every decision, scan and action — the full audit trail."
          />
          <div className="px-5 py-5">
            {events.length === 0 ? (
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="Nothing recorded yet"
                message="The audit trail fills up as the archaeologist scans, plans and builds. Start by reviewing the plan, or run a recovery."
              />
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-6">
                {events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[1.7rem] grid h-6 w-6 place-items-center rounded-full border border-line bg-panel text-accent">
                      {TYPE_ICON[e.type ?? ""] ?? <Search className="h-3.5 w-3.5" />}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {e.phase && <Badge tone={PHASE_TONE[e.phase] ?? "muted"}>{e.phase.replace("_", " ")}</Badge>}
                      <span className="text-[11px] text-faint">{formatDateTime(e.ts)}</span>
                    </div>
                    <p className="mt-1 text-sm text-fg">{e.summary}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Hypotheses" icon={<Search className="h-4 w-4" />} subtitle="What the evidence suggests." />
          <div className="space-y-3 px-5 py-4">
            <Hypothesis label="Operational era" value={analysis?.era?.label ?? "Unknown"} ok={Boolean(analysis?.era && !analysis.era.speculative)} />
            <Hypothesis
              label="Language count"
              value={`${analysis?.detected_languages?.length ?? 0} detected`}
              ok={(analysis?.detected_languages?.length ?? 0) > 0}
            />
            <Hypothesis
              label="Build reproducibility"
              value={(analysis?.missing_assets?.length ?? 0) ? `${analysis!.missing_assets.length} asset(s) missing` : "No missing assets"}
              ok={!analysis?.missing_assets?.length}
            />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Safety risks" icon={<AlertTriangle className="h-4 w-4" />} />
          <div className="px-5 py-4">
            {!analysis?.safety_risks?.length ? (
              <p className="text-sm text-muted">No risks flagged.</p>
            ) : (
              <ul className="space-y-3">
                {analysis.safety_risks.map((r, i) => (
                  <li key={i}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-fg">{r.name}</p>
                      <Badge tone={r.severity === "high" ? "danger" : r.severity === "med" ? "warn" : "muted"}>{r.severity}</Badge>
                    </div>
                    {(r.evidence ?? []).map((e, j) => (
                      <p key={j} className="mt-1 font-mono text-[11px] text-muted">
                        {e}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Blockers" icon={<AlertTriangle className="h-4 w-4" />} actions={<Badge tone={blockers.length ? "warn" : "ok"}>{blockers.length}</Badge>} />
          <div className="px-5 py-4">
            {blockers.length === 0 ? (
              <p className="text-sm text-ok">Clear — no blockers.</p>
            ) : (
              <ul className="space-y-2">
                {blockers.map((b) => (
                  <li key={b.id} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${b.severity === "high" ? "bg-danger" : b.severity === "med" ? "bg-warn" : "bg-faint"}`} />
                    <span className="text-fg">{b.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Hypothesis({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-inset px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-widest text-faint">{label}</p>
        <p className="truncate text-sm text-fg">{value}</p>
      </div>
      <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
    </div>
  );
}
