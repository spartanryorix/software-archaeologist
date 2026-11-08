import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Boxes, CheckCircle2, Gauge, Plus, ScanSearch } from "lucide-react";
import { useProjects } from "../lib/queries";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { ConfidenceGauge } from "../components/ConfidenceGauge";
import { EmptyState } from "../components/EmptyState";
import { LoadingBlock } from "../components/Loading";
import { RECOVERY_MODES, type Project } from "../lib/types";
import { timeAgo } from "../lib/utils";

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone: string }) {
  return (
    <Panel className="flex items-center gap-3 p-4">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-raised ${tone}`} aria-hidden="true">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-heading text-xl font-semibold text-fg">{value}</p>
        <p className="truncate text-xs text-muted">{label}</p>
      </div>
    </Panel>
  );
}

function modeLabel(p: Project) {
  return RECOVERY_MODES.find((m) => m.value === p.recovery_mode)?.label ?? p.recovery_mode;
}

function ProjectCard({ project }: { project: Project }) {
  const level = Math.max(0, Math.min(5, Math.round(project.confidence_level)));
  return (
    <Link to={`/projects/${project.id}`} className="group block focus:outline-none">
      <Panel className="flex h-full flex-col p-5 transition-colors duration-150 group-hover:border-line-strong group-focus-visible:border-accent">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate font-heading text-sm font-semibold text-fg">{project.name}</h3>
          <StatusBadge status={project.status} />
        </div>
        <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-xs text-muted">
          {project.description || "No description provided."}
        </p>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="rounded bg-raised px-2 py-0.5 text-[11px] text-muted">{modeLabel(project)}</span>
            <span className="text-[11px] text-faint">{timeAgo(project.updated_at)}</span>
          </div>
          <ConfidenceGauge level={level} />
        </div>
        <div className="mt-4 flex items-center gap-1 text-xs font-medium text-accent">
          Open mission
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Panel>
    </Link>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const { data: projects, isLoading } = useProjects();
  const navigate = useNavigate();

  const list = projects ?? [];
  const total = list.length;
  const complete = list.filter((p) => p.status === "complete").length;
  const inProgress = list.filter((p) => !["complete", "failed", "draft"].includes(p.status)).length;
  const avgLevel = total ? (list.reduce((s, p) => s + p.confidence_level, 0) / total).toFixed(1) : "0.0";
  const displayName = (user?.user_metadata?.display_name as string | undefined) || user?.email?.split("@")[0] || "Archaeologist";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6 blueprint-grid sm:p-8 animate-fade-up">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-[110px]" />
        <div className="relative">
          <p className="text-[11px] font-medium uppercase tracking-widest text-accent">Recovery workspace</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold text-fg sm:text-3xl">
            Welcome back, {displayName}.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Start a new recovery mission or continue where you left off. Analysis runs on Vultr Serverless Inference and
            recoveries execute in a locked-down Docker sandbox.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => navigate("/projects/new")} size="lg">
              <Plus aria-hidden="true" className="h-4 w-4" />
              New Recovery Mission
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Boxes className="h-5 w-5 text-primary" />} label="Total missions" value={total} tone="text-primary" />
        <StatCard icon={<Activity className="h-5 w-5 text-accent" />} label="In progress" value={inProgress} tone="text-accent" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5 text-ok" />} label="Completed" value={complete} tone="text-ok" />
        <StatCard icon={<Gauge className="h-5 w-5 text-warn" />} label="Avg. verification" value={`${avgLevel}/5`} tone="text-warn" />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold tracking-wide text-fg">Your missions</h2>
          {total > 0 && <span className="text-xs text-faint">{total} total</span>}
        </div>

        {isLoading ? (
          <LoadingBlock label="Loading your missions…" />
        ) : total === 0 ? (
          <EmptyState
            icon={<ScanSearch className="h-6 w-6" />}
            title="No recovery missions yet"
            message="Bring an old, broken, or abandoned project and let the workspace investigate what it is, why it's broken, and how to bring it back."
            action={
              <Button onClick={() => navigate("/projects/new")}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                Start your first recovery
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
