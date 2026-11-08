import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type Tone = "default" | "primary" | "accent" | "ok" | "warn" | "danger" | "muted";

const tones: Record<Tone, string> = {
  default: "border-line text-fg bg-raised",
  primary: "border-[#2b4f8f] text-[#bfd6ff] bg-[#12244a]",
  accent: "border-[#155e6b] text-[#a9f0fb] bg-[#072b33]",
  ok: "border-[#12564d] text-[#8ff2e0] bg-[#062a26]",
  warn: "border-[#6b4a09] text-[#fbd38d] bg-[#2a1e04]",
  danger: "border-[#7a2333] text-[#ffc2cd] bg-[#2c0a12]",
  muted: "border-line text-muted bg-transparent",
};

export function Badge({
  tone = "default",
  children,
  className,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5 tracking-wide",
        tones[tone],
        className,
      )}
    >
      {icon && <span aria-hidden="true" className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {children}
    </span>
  );
}
