import { cn } from "../lib/utils";
import { VERIFICATION_LEVELS } from "../lib/types";

function segmentColor(level: number, filled: boolean): string {
  if (!filled) return "bg-line";
  if (level >= 4) return "bg-ok";
  if (level >= 2) return "bg-accent";
  return "bg-warn";
}

export function ConfidenceGauge({
  level,
  showName = true,
  className,
}: {
  level: number;
  showName?: boolean;
  className?: string;
}) {
  const current = VERIFICATION_LEVELS.find((v) => v.level === level);
  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex gap-1"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={level}
        aria-label={`Verification level ${level} of 5`}
      >
        {VERIFICATION_LEVELS.map((v) => {
          const filled = v.level <= level;
          return (
            <div
              key={v.level}
              title={`Level ${v.level} — ${v.name}`}
              className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", segmentColor(level, filled))}
            />
          );
        })}
      </div>
      {showName && (
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="font-mono text-xs text-muted">
            Level <span className="text-fg">{level}</span>/5
          </span>
          <span className="truncate text-xs text-muted">{current?.name ?? "Not verified"}</span>
        </div>
      )}
    </div>
  );
}
