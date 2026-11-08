import { Boxes, Package, Repeat2, Server } from "lucide-react";
import { Panel, PanelHeader } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/EmptyState";
import type { Analysis, Environment } from "../../lib/types";

function CompareRow({ aspect, original, reconstructed }: { aspect: string; original: string; reconstructed: string }) {
  const differs = original !== reconstructed;
  return (
    <div className="grid grid-cols-[1fr_1.2fr_1.2fr] items-center gap-3 border-b border-line py-2.5 text-sm last:border-0">
      <span className="text-xs uppercase tracking-widest text-faint">{aspect}</span>
      <span className="truncate font-mono text-xs text-muted">{original || "—"}</span>
      <span className={`truncate font-mono text-xs ${differs ? "text-accent" : "text-fg"}`}>{reconstructed || "—"}</span>
    </div>
  );
}

export function EnvironmentTab({
  analysis,
  environment,
}: {
  analysis: Analysis | null | undefined;
  environment: Environment | null | undefined;
}) {
  if (!environment) {
    return (
      <EmptyState icon={<Server className="h-6 w-6" />} title="No environment yet" message="Reconstruct an environment to reproduce the project's original runtime." />
    );
  }

  const primary = analysis?.detected_languages?.[0];
  const build = analysis?.build_systems?.[0];
  const packages = environment.packages ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Panel>
          <PanelHeader title="Reconstructed environment" icon={<Server className="h-4 w-4" />} subtitle="Pinned by digest — never a mutable tag." />
          <div className="space-y-4 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{environment.env_type ?? "docker"}</Badge>
              <Badge tone="primary">{environment.runtime ?? "—"}</Badge>
              {environment.runtime_version && <Badge tone="muted">{environment.runtime_version}</Badge>}
            </div>
            <div className="rounded-lg border border-line bg-inset px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-widest text-faint">Base image + digest</p>
              <p className="mt-1 break-all font-mono text-xs text-fg">{environment.base_image ?? "—"}</p>
              <p className="mt-0.5 break-all font-mono text-[10px] text-faint">{environment.base_image_digest ?? "—"}</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Environment comparison"
            icon={<Repeat2 className="h-4 w-4" />}
            subtitle="Original (inferred from evidence) vs reconstructed"
          />
          <div className="px-5 py-3">
            <div className="grid grid-cols-[1fr_1.2fr_1.2fr] gap-3 border-b border-line-strong pb-2 text-[11px] uppercase tracking-widest text-faint">
              <span>Aspect</span>
              <span>Original (inferred)</span>
              <span>Reconstructed</span>
            </div>
            <CompareRow aspect="Runtime" original={primary?.name ?? "—"} reconstructed={environment.runtime ?? "—"} />
            <CompareRow aspect="Version" original={primary?.version ?? "—"} reconstructed={environment.runtime_version ?? "—"} />
            <CompareRow aspect="Build" original={build?.name ?? "—"} reconstructed={(environment.manifest?.build_systems as { name: string }[] | undefined)?.[0]?.name ?? "—"} />
            <CompareRow aspect="Packages" original={`${packages.length} declared`} reconstructed={`${packages.length} pinned`} />
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader
            title="Dependency vault"
            icon={<Package className="h-4 w-4" />}
            actions={<Badge tone="muted">{packages.length}</Badge>}
          />
          <div className="max-h-[420px] overflow-y-auto px-5 py-4">
            {packages.length === 0 ? (
              <p className="text-sm text-muted">No dependencies recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {packages.map((p) => (
                  <li key={`${p.name}-${p.version}`} className="flex items-center justify-between gap-3 rounded-md border border-line bg-inset px-3 py-1.5">
                    <span className="truncate font-mono text-xs text-fg">{p.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-accent">{p.version}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Safety guards" icon={<Boxes className="h-4 w-4" />} />
          <div className="px-5 py-4">
            <ul className="space-y-1.5 text-xs text-muted">
              {((environment.manifest?.safety_guards as string[] | undefined) ?? []).map((g, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ok" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
