import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type {
  Analysis,
  AuditEvent,
  BlockerRow,
  DependencyRow,
  Environment,
  Execution,
  ExecutionLog,
  PatchRow,
  PlanStepRow,
  Project,
  VerificationRow,
} from "./types";

export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  analysis: (id: string) => ["analysis", id] as const,
  plan: (id: string) => ["plan", id] as const,
  blockers: (id: string) => ["blockers", id] as const,
  environment: (id: string) => ["environment", id] as const,
  execution: (id: string) => ["execution", id] as const,
  logs: (id: string) => ["logs", id] as const,
  patches: (id: string) => ["patches", id] as const,
  verification: (id: string) => ["verification", id] as const,
  audit: (id: string) => ["audit", id] as const,
  dependencies: (id: string) => ["dependencies", id] as const,
};

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? ([] as unknown)) as T;
}

/* ----------------------- queries ----------------------- */

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () =>
      unwrap<Project[]>(
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
      ),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(id ?? ""),
    enabled: Boolean(id),
    queryFn: () =>
      unwrap<Project>(supabase.from("projects").select("*").eq("id", id!).single()),
  });
}

export function useLatestAnalysis(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.analysis(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () =>
      unwrap<Analysis[]>(
        supabase
          .from("analyses")
          .select("*")
          .eq("project_id", projectId!)
          .order("created_at", { ascending: false })
          .limit(1),
      ).then((rows) => rows[0] ?? null),
  });
}

export function usePlanSteps(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plan(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () =>
      unwrap<PlanStepRow[]>(
        supabase.from("plan_steps").select("*").eq("project_id", projectId!).order("step_order", { ascending: true }),
      ),
  });
}

export function useBlockers(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.blockers(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () => unwrap<BlockerRow[]>(supabase.from("blockers").select("*").eq("project_id", projectId!)),
  });
}

export function useEnvironment(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.environment(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () =>
      unwrap<Environment[]>(
        supabase.from("environments").select("*").eq("project_id", projectId!).order("created_at", { ascending: false }).limit(1),
      ).then((rows) => rows[0] ?? null),
  });
}

export function useLatestExecution(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.execution(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () =>
      unwrap<Execution[]>(
        supabase.from("executions").select("*").eq("project_id", projectId!).order("created_at", { ascending: false }).limit(1),
      ).then((rows) => rows[0] ?? null),
  });
}

export function useLogs(executionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.logs(executionId ?? ""),
    enabled: Boolean(executionId),
    queryFn: () =>
      unwrap<ExecutionLog[]>(
        supabase.from("execution_logs").select("*").eq("execution_id", executionId!).order("ts", { ascending: true }),
      ),
  });
}

export function usePatches(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.patches(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () => unwrap<PatchRow[]>(supabase.from("patches").select("*").eq("project_id", projectId!).order("applied_at", { ascending: true })),
  });
}

export function useVerification(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.verification(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () =>
      unwrap<VerificationRow[]>(supabase.from("verification_results").select("*").eq("project_id", projectId!).order("level", { ascending: true })),
  });
}

export function useAudit(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.audit(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () => unwrap<AuditEvent[]>(supabase.from("audit_events").select("*").eq("project_id", projectId!).order("ts", { ascending: true })),
  });
}

export function useDependencies(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dependencies(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () => unwrap<DependencyRow[]>(supabase.from("dependencies").select("*").eq("project_id", projectId!)),
  });
}
