import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { Panel, PanelHeader } from "./ui/Panel";
import type { ContainmentProof } from "../lib/api";

/** Evidence from the probe container that ran with the same limits as the project's code. */
export function ContainmentPanel({ proof }: { proof: ContainmentProof | null | undefined }) {
  if (!proof) return null;
  const passed = proof.probes.filter((p) => p.pass).length;
  return (
    <Panel>
      <PanelHeader title="Containment proof" icon={<ShieldCheck className="h-4 w-4" />} subtitle={`${passed}/${proof.probes.length} probes passed before any project code ran.`} />
      <div className="space-y-4 px-5 py-4">
        <ul className="space-y-2">
          {proof.probes.map((p) => (
            <li key={p.name} className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0" aria-hidden="true">
                {p.pass ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <XCircle className="h-4 w-4 text-danger" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-fg">{p.name}</p>
                <p className="font-mono text-[11px] text-muted">{p.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 border-t border-line pt-3">
          {proof.controls.map((c) => (
            <div key={c.name}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-faint">{c.name}</dt>
              <dd className="text-xs text-muted">{c.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}
