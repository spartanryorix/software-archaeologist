import type { AnalysisResult, AnalyzeInput, AnalyzerProvider, Blocker, PlanStep, SafetyRisk } from "../types";
import { API_BASE, authHeader } from "../api";

/** Where the last analysis came from (read by the UI for the audit trail). */
export const lastAnalysisInfo: { source: "mock" | "vultr"; model?: string; error?: string } = { source: "mock" };

interface Refinement {
  model?: string;
  era?: { label: string; confidence: number; evidence: string[]; speculative: boolean };
  blockers?: Blocker[];
  safetyRisks?: SafetyRisk[];
  planSteps?: PlanStep[];
  environment?: { runtime: string; runtime_version: string; base_image: string };
}

function summarize(b: AnalysisResult) {
  const name = (d: { name: string; version?: string }) => (d.version ? `${d.name} ${d.version}` : d.name);
  return {
    languages: b.languages.map(name),
    frameworks: b.frameworks.map(name),
    buildSystems: b.buildSystems.map(name),
    eraLabel: b.era.label,
    blockers: b.blockers.map((x) => x.title),
  };
}

function merge(base: AnalysisResult, ref: Refinement): AnalysisResult {
  const out: AnalysisResult = { ...base };
  if (ref.era) {
    out.era = ref.era;
    out.confidence = Math.round(((base.confidence + ref.era.confidence) / 2) * 100) / 100;
  }
  if (ref.blockers?.length) {
    out.blockers = ref.blockers;
    out.dependencyGraph = {
      nodes: [
        ...base.dependencyGraph.nodes.filter((n) => n.kind !== "blocker"),
        ...ref.blockers.map((b) => ({ id: `blocker:${b.title}`, label: b.title, kind: "blocker" as const, status: b.severity })),
      ],
      edges: [
        ...base.dependencyGraph.edges.filter((e) => e.label !== "blocker"),
        ...ref.blockers.map((b) => ({ source: "root", target: `blocker:${b.title}`, label: "blocker" })),
      ],
    };
  }
  if (ref.safetyRisks?.length) out.safetyRisks = ref.safetyRisks;
  if (ref.planSteps?.length) out.recoveryPlan = { ...base.recoveryPlan, steps: ref.planSteps };
  if (ref.environment?.base_image) {
    out.suggestedEnvironment = {
      ...base.suggestedEnvironment,
      runtime: ref.environment.runtime || base.suggestedEnvironment.runtime,
      runtime_version: ref.environment.runtime_version || base.suggestedEnvironment.runtime_version,
      base_image: ref.environment.base_image,
      base_image_digest: "sha256:resolved-at-first-run",
    };
  }
  return out;
}

/**
 * Heuristic baseline first (always works, offline), then ask the Vultr backend
 * (Serverless Inference) to refine era, blockers, risks, plan and environment.
 * Any failure silently falls back to the baseline so the app keeps working.
 */
export class RemoteAnalyzer implements AnalyzerProvider {
  private readonly fallback: AnalyzerProvider;
  constructor(fallback: AnalyzerProvider) {
    this.fallback = fallback;
  }

  async analyze(input: AnalyzeInput): Promise<AnalysisResult> {
    const baseline = await this.fallback.analyze(input);
    lastAnalysisInfo.source = "mock";
    delete lastAnalysisInfo.model;
    delete lastAnalysisInfo.error;
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          input: {
            mode: input.mode,
            goals: input.goals,
            fileTree: (input.fileTree ?? []).slice(0, 300),
            artifacts: input.artifacts
              .filter((a) => a.text)
              .slice(0, 12)
              .map((a) => ({ filename: a.filename, kind: a.kind, text: (a.text ?? "").slice(0, 4000) })),
          },
          baseline: summarize(baseline),
        }),
      });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const ref = (await res.json()) as Refinement;
      lastAnalysisInfo.source = "vultr";
      lastAnalysisInfo.model = ref.model;
      return merge(baseline, ref);
    } catch (e) {
      lastAnalysisInfo.error = e instanceof Error ? e.message : "analysis backend unavailable";
      return baseline;
    }
  }
}
