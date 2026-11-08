import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";

export interface LogLine {
  level: "info" | "warn" | "error" | "cmd" | "ok";
  phase?: string | null;
  message: string;
  ts?: string;
}

const LEVEL_STYLES: Record<LogLine["level"], string> = {
  info: "text-muted",
  cmd: "text-accent",
  warn: "text-warn",
  error: "text-danger",
  ok: "text-ok",
};

const PREFIX: Record<LogLine["level"], string> = {
  info: "•",
  cmd: "$",
  warn: "!",
  error: "✗",
  ok: "✓",
};

export function LogStream({
  lines,
  className,
  live = false,
  ariaLive = "polite",
}: {
  lines: LogLine[];
  className?: string;
  live?: boolean;
  ariaLive?: "polite" | "off" | "assertive";
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full overflow-y-auto rounded-lg border border-line bg-inset p-3 font-mono text-xs leading-relaxed",
        className,
      )}
    >
      <div aria-live={ariaLive} aria-atomic="false" role="log">
        {lines.length === 0 ? (
          <p className="text-faint">// no output yet</p>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={cn("animate-log-in whitespace-pre-wrap break-words py-0.5", LEVEL_STYLES[line.level])}>
              <span className="mr-1.5 select-none text-faint">{PREFIX[line.level]}</span>
              {line.message}
            </div>
          ))
        )}
      </div>
      {live && (
        <span className="pointer-events-none absolute bottom-2 right-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
          live
        </span>
      )}
      <div ref={endRef} />
    </div>
  );
}
