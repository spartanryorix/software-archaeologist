import { ShieldCheck } from "lucide-react";
import { cn } from "../lib/utils";

/** Shown when runs execute for real inside the Vultr-hosted Docker sandbox. */
export function LiveNotice({ className, model }: { className?: string; model?: string }) {
  return (
    <div
      className={cn("flex items-start gap-2.5 rounded-lg border border-[#1d5a3a] bg-[#06231a]/70 px-3 py-2.5 text-xs text-[#9be7bd]", className)}
      role="note"
    >
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">Live sandbox</span> — builds and runs execute in throwaway, locked-down Docker containers on a
        Vultr VM; the agent reasons with Vultr Serverless Inference{model ? ` (${model})` : ""}. If the backend is offline, the app
        falls back to a clearly labelled simulation.
      </p>
    </div>
  );
}
