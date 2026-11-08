import { Badge, type Tone } from "./ui/Badge";
import type { ProjectStatus } from "../lib/types";

const MAP: Record<ProjectStatus, { tone: Tone; label: string }> = {
  draft: { tone: "muted", label: "Draft" },
  scanning: { tone: "primary", label: "Scanning" },
  planned: { tone: "accent", label: "Planned" },
  reconstructing: { tone: "primary", label: "Reconstructing" },
  building: { tone: "primary", label: "Building" },
  verifying: { tone: "accent", label: "Verifying" },
  complete: { tone: "ok", label: "Complete" },
  partial: { tone: "warn", label: "Partial" },
  failed: { tone: "danger", label: "Failed" },
  needs_artifacts: { tone: "warn", label: "Needs artifacts" },
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const cfg = MAP[status] ?? MAP.draft;
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}
