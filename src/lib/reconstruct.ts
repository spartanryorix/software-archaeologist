import type {
  Analysis,
  AnalysisResult,
  BlockerRow,
  Environment,
  EnvironmentSpec,
  PlanStepRow,
  VerificationTarget,
} from "./types";

/** Rebuild an EnvironmentSpec from its persisted row. */
export function toEnvironmentSpec(env: Environment | null | undefined): EnvironmentSpec | null {
  if (!env) return null;
  return {
    env_type: (env.env_type ?? "docker") as EnvironmentSpec["env_type"],
    runtime: env.runtime ?? "debian",
    runtime_version: env.runtime_version ?? "unknown",
    base_image: env.base_image ?? `${env.runtime ?? "debian"}:${env.runtime_version ?? "unknown"}`,
    base_image_digest: env.base_image_digest ?? "sha256:unpinned",
    packages: env.packages ?? [],
  };
}

/** Rebuild a full AnalysisResult from persisted rows (analysis + plan + blockers + env). */
export function toAnalysisResult(
  analysis: Analysis | null | undefined,
  planSteps: PlanStepRow[],
  blockers: BlockerRow[],
  env: Environment | null | undefined,
): AnalysisResult | null {
  if (!analysis) return null;
  const spec: EnvironmentSpec = toEnvironmentSpec(env) ?? {
    env_type: "docker",
    runtime: "debian",
    runtime_version: "unknown",
    base_image: "debian:stable-slim",
    base_image_digest: "sha256:unpinned",
    packages: [],
  };
  const manifestTargets = (env?.manifest?.verification_targets as VerificationTarget[] | undefined) ?? [];
  const guards = (env?.manifest?.safety_guards as string[] | undefined) ?? [];

  return {
    languages: analysis.detected_languages ?? [],
    frameworks: analysis.detected_frameworks ?? [],
    buildSystems: analysis.build_systems ?? [],
    dependencyGraph: analysis.dependency_graph ?? { nodes: [], edges: [] },
    missingAssets: analysis.missing_assets ?? [],
    safetyRisks: analysis.safety_risks ?? [],
    era: analysis.era ?? { label: "Unknown era", confidence: 0.1, evidence: [], speculative: true },
    blockers: blockers.map((b) => ({
      title: b.title,
      category: b.category ?? "general",
      severity: (b.severity as "low" | "med" | "high") ?? "med",
      evidence: b.evidence ?? [],
    })),
    suggestedEnvironment: spec,
    recoveryPlan: {
      steps: planSteps.map((s) => ({
        title: s.title,
        description: s.description ?? "",
        action_type: s.action_type ?? "",
        safety_guard: s.safety_guard ?? "",
      })),
      safetyGuards: guards,
      verificationTargets: manifestTargets,
    },
    confidence: analysis.confidence,
  };
}
