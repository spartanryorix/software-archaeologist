import { AlertTriangle, Cpu, GitFork, Layers, Package, Quote, ShieldCheck } from "lucide-react";
import { Panel, PanelHeader } from "../../components/ui/Panel";
import { Badge, type Tone } from "../../components/ui/Badge";
import { EmptyState } from "../../components/EmptyState";
import type { Analysis, BlockerRow, Environment, PlanStepRow } from "../../lib/types";

function StackList({
  title,
  items,
}: {
  title: string;
  items: { name: string; version?: string; evidence: string[] }[];
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-widest text-faint">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-faint">None detected.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.name} className="rounded-lg border border-line bg-inset px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-fg">{it.name}</span>
                {it.version && <span className="font-mono text-xs text-accent">{it.version}</span>}
              </div>
              {it.evidence.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {it.evidence.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted">
                      <Quote aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-faint" />
                      <span className="font-mono">{e}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUS_TONE: Record<PlanStepRow["status"], Tone> = {
  pending: "muted",
  approved: "primary",
  running: "accent",
  done: "ok",
  skipped: "muted",
};

const SEV_TONE: Record<string, Tone> = { low: "muted", med: "warn", high: "danger" };

export function OverviewTab({
  analysis,
  plan,
  blockers,
  environment,
}: {
  analysis: Analysis | null | undefined;
  plan: PlanStepRow[];
  blockers: BlockerRow[];
  environment: Environment | null | undefined;
}) {
  if (!analysis) {
    return (
      <EmptyState
        icon={<Layers className="h-6 w-6" />}
        title="No scan recorded"
        message="This mission has no analysis yet. Add source material and run an archaeological scan."
      />
    );
  }

  const era = analysis.era;
  const spec = environment;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Panel>
          <PanelHeader title="Detected stack" icon={<Cpu className="h-4 w-4" />} subtitle="Every detection cites its supporting evidence." />
          <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
            <StackList title="Languages" items={analysis.detected_languages} />
            <StackList title="Frameworks" items={analysis.detected_frameworks} />
            <StackList title="Build systems" items={analysis.build_systems} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Recovery plan" icon={<GitFork className="h-4 w-4" />} subtitle={`${plan.length} ordered step(s)`} />
          <div className="px-5 py-5">
            {plan.length === 0 ? (
              <p className="text-sm text-muted">No plan steps recorded.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-6">
                {plan.map((s, i) => (
                  <li key={s.id} className="relative">
                    <span className="absolute -left-[1.65rem] grid h-6 w-6 place-items-center rounded-full border border-line bg-panel font-mono text-[11px] text-accent">
                      {i + 1}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-fg">{s.title}</p>
                      <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                    </div>
                    {s.description && <p className="mt-0.5 text-xs text-muted">{s.description}</p>}
                    {s.safety_guard && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ok">
                        <ShieldCheck aria-hidden="true" className="h-3 w-3" />
                        {s.safety_guard}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Reconstructed era" icon={<Layers className="h-4 w-4" />} />
          <div className="px-5 py-4">
            <p className="font-heading text-sm font-semibold text-fg">{era?.label}</p>
            {era?.speculative && (
              <p className="mt-1 text-[11px] text-warn">Speculative — evidence is thin.</p>
            )}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-faint">
                <span>Confidence</span>
                <span className="font-mono">{Math.round((era?.confidence ?? 0) * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.round((era?.confidence ?? 0) * 100)}%` }}
                />
              </div>
            </div>
            {era?.evidence?.length ? (
              <ul className="mt-3 space-y-1">
                {era.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted">
                    <Quote aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-faint" />
                    <span className="font-mono">{e}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Proposed environment" icon={<Package className="h-4 w-4" />} />
          <div className="space-y-2 px-5 py-4 text-sm">
            <Row label="Type" value={spec?.env_type ?? "—"} />
            <Row label="Runtime" value={`${spec?.runtime ?? "—"} ${spec?.runtime_version ?? ""}`} />
            <div>
              <p className="text-[11px] uppercase tracking-widest text-faint">Base image</p>
              <p className="mt-0.5 break-all font-mono text-xs text-fg">{spec?.base_image ?? "—"}</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Blockers"
            icon={<AlertTriangle className="h-4 w-4" />}
            actions={<Badge tone={blockers.length ? "warn" : "ok"}>{blockers.length}</Badge>}
          />
          <div className="px-5 py-4">
            {blockers.length === 0 ? (
              <p className="text-sm text-ok">No hard blockers detected.</p>
            ) : (
              <ul className="space-y-3">
                {blockers.map((b) => (
                  <li key={b.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-fg">{b.title}</p>
                      <Badge tone={SEV_TONE[b.severity] ?? "muted"}>{b.severity}</Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{b.category}</p>
                    {(b.evidence ?? []).map((e, i) => (
                      <p key={i} className="mt-1 font-mono text-[11px] text-muted">
                        {e}
                      </p>
                    ))}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] uppercase tracking-widest text-faint">{label}</span>
      <span className="truncate text-sm text-fg">{value}</span>
    </div>
  );
}
