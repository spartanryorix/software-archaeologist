import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, LayoutDashboard, Play, Search, Server } from "lucide-react";
import { Tabs } from "../components/ui/Tabs";
import { ConfidenceGauge } from "../components/ConfidenceGauge";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { LoadingBlock } from "../components/Loading";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/ui/Button";
import {
  useAudit,
  useBlockers,
  useEnvironment,
  useLatestAnalysis,
  usePatches,
  usePlanSteps,
  useProject,
  useVerification,
} from "../lib/queries";
import { RECOVERY_MODES } from "../lib/types";
import { OverviewTab } from "./tabs/OverviewTab";
import { InvestigationTab } from "./tabs/InvestigationTab";
import { EnvironmentTab } from "./tabs/EnvironmentTab";
import { ExecutionTab } from "./tabs/ExecutionTab";
import { ReportTab } from "./tabs/ReportTab";

const TAB_ITEMS = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard /> },
  { id: "investigation", label: "Investigation", icon: <Search /> },
  { id: "environment", label: "Environment", icon: <Server /> },
  { id: "execution", label: "Execution", icon: <Play /> },
  { id: "report", label: "Report & Export", icon: <FileText /> },
];

export function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState("overview");

  const { data: project, isLoading } = useProject(id);
  const { data: analysis } = useLatestAnalysis(id);
  const { data: plan } = usePlanSteps(id);
  const { data: blockers } = useBlockers(id);
  const { data: environment } = useEnvironment(id);
  const { data: patches } = usePatches(id);
  const { data: verification } = useVerification(id);
  const { data: audit } = useAudit(id);

  if (isLoading) return <LoadingBlock label="Loading mission…" />;
  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="Mission not found"
          message="This recovery mission doesn't exist, or it belongs to another account."
          action={
            <Link to="/">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const modeLabel = RECOVERY_MODES.find((m) => m.value === project.recovery_mode)?.label ?? project.recovery_mode;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
        All missions
      </Link>

      <header className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-xl font-semibold text-fg sm:text-2xl">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          {project.description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{project.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="primary">{modeLabel}</Badge>
            {(project.goals ?? []).map((g) => (
              <Badge key={g} tone="muted">
                {g}
              </Badge>
            ))}
          </div>
        </div>
        <div className="w-full max-w-xs shrink-0">
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="mb-2 text-[11px] uppercase tracking-widest text-faint">Verification confidence</p>
            <ConfidenceGauge level={Math.max(0, Math.min(5, Math.round(project.confidence_level)))} />
          </div>
        </div>
      </header>

      <div className="mt-6 border-b border-line">
        <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="mt-6 focus:outline-none"
      >
        {tab === "overview" && (
          <OverviewTab analysis={analysis} plan={plan ?? []} blockers={blockers ?? []} environment={environment} />
        )}
        {tab === "investigation" && <InvestigationTab analysis={analysis} audit={audit ?? []} blockers={blockers ?? []} />}
        {tab === "environment" && <EnvironmentTab analysis={analysis} environment={environment} />}
        {tab === "execution" && <ExecutionTab project={project} analysis={analysis} plan={plan ?? []} blockers={blockers ?? []} environment={environment} />}
        {tab === "report" && (
          <ReportTab
            project={project}
            analysis={analysis}
            plan={plan ?? []}
            blockers={blockers ?? []}
            environment={environment}
            patches={patches ?? []}
            verification={verification ?? []}
            audit={audit ?? []}
          />
        )}
      </div>
    </div>
  );
}
