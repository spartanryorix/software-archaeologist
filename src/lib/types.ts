/* ============================================================
   Shared domain types — mirror the Postgres schema and the
   AnalyzerProvider contract (see specs/technical-architecture.md).
   ============================================================ */

export type RecoveryMode = "preserve" | "repair" | "modernize" | "research";
export type RecoveryGoal = "build" | "run" | "test" | "preserve" | "modernize";

export type ProjectStatus =
  | "draft"
  | "scanning"
  | "planned"
  | "reconstructing"
  | "building"
  | "verifying"
  | "complete"
  | "partial"
  | "failed"
  | "needs_artifacts";

export type ArtifactKind = "zip" | "manifest" | "doc" | "binary" | "screenshot" | "installer";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  recovery_mode: RecoveryMode;
  goals: RecoveryGoal[];
  status: ProjectStatus;
  confidence_level: number;
  source_type: "zip" | "folder" | "manifests" | "git_url" | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface Artifact {
  id: string;
  project_id: string;
  kind: ArtifactKind;
  filename: string;
  size_bytes: number;
  storage_path: string | null;
  content_text: string | null;
  created_at: string;
}

export interface Evidence {
  label: string;
  detail?: string;
}

export interface TechDetection {
  name: string;
  version?: string;
  evidence: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  kind: "language" | "framework" | "dependency" | "blocker" | "asset" | "runtime";
  status?: string;
  meta?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface MissingAsset {
  name: string;
  reason: string;
  evidence: string[];
}

export interface SafetyRisk {
  name: string;
  severity: "low" | "med" | "high";
  evidence: string[];
}

export interface EraReconstruction {
  label: string;
  confidence: number;
  evidence: string[];
  speculative: boolean;
}

export interface Blocker {
  title: string;
  category: string;
  severity: "low" | "med" | "high";
  evidence: string[];
}

export interface PlanStep {
  title: string;
  description: string;
  action_type: string;
  safety_guard: string;
}

export interface EnvironmentSpec {
  env_type: "docker" | "versioned_runtime" | "vm" | "emulator" | "compatibility_layer" | "remote";
  runtime: string;
  runtime_version: string;
  base_image: string;
  base_image_digest: string;
  packages: { name: string; version: string }[];
}

export interface VerificationTarget {
  level: number;
  name: string;
  criteria: string;
}

export interface AnalysisResult {
  languages: TechDetection[];
  frameworks: TechDetection[];
  buildSystems: TechDetection[];
  dependencyGraph: DependencyGraph;
  missingAssets: MissingAsset[];
  safetyRisks: SafetyRisk[];
  era: EraReconstruction;
  blockers: Blocker[];
  suggestedEnvironment: EnvironmentSpec;
  recoveryPlan: {
    steps: PlanStep[];
    safetyGuards: string[];
    verificationTargets: VerificationTarget[];
  };
  confidence: number;
}

export interface Analysis {
  id: string;
  project_id: string;
  detected_languages: TechDetection[];
  detected_frameworks: TechDetection[];
  build_systems: TechDetection[];
  dependency_graph: DependencyGraph;
  missing_assets: MissingAsset[];
  safety_risks: SafetyRisk[];
  era: EraReconstruction | null;
  confidence: number;
  created_at: string;
}

export interface Environment {
  id: string;
  project_id: string;
  env_type: EnvironmentSpec["env_type"] | null;
  runtime: string | null;
  runtime_version: string | null;
  base_image: string | null;
  base_image_digest: string | null;
  packages: { name: string; version: string }[];
  manifest: Record<string, unknown>;
  created_at: string;
}

export interface PlanStepRow extends PlanStep {
  id: string;
  project_id: string;
  step_order: number;
  status: "pending" | "approved" | "running" | "done" | "skipped";
  created_at: string;
}

export interface BlockerRow extends Blocker {
  id: string;
  project_id: string;
  status: "open" | "resolved" | "wontfix";
  resolution: string | null;
  created_at: string;
}

export interface Execution {
  id: string;
  project_id: string;
  status: "pending" | "running" | "complete" | "partial" | "failed" | "cancelled";
  started_at: string | null;
  ended_at: string | null;
  result: string | null;
  iterations_used: number;
  budget: number;
  created_at: string;
}

export interface ExecutionLog {
  id: string;
  execution_id: string;
  ts: string;
  level: "info" | "warn" | "error" | "cmd" | "ok";
  phase: string | null;
  message: string;
}

export interface PatchRow {
  id: string;
  project_id: string;
  file_path: string;
  diff: string;
  rationale: string | null;
  reversible: boolean;
  applied_at: string;
}

export interface VerificationRow {
  id: string;
  project_id: string;
  level: number;
  name: string;
  criteria: string | null;
  status: "pass" | "fail" | "unknown";
  evidence: string[];
  created_at: string;
}

export interface DependencyRow {
  id: string;
  project_id: string;
  name: string;
  version: string | null;
  source: string | null;
  checksum: string | null;
  license: string | null;
  redistributable: boolean;
  status: "recovered" | "missing" | "blocked";
  created_at: string;
}

export interface AuditEvent {
  id: string;
  project_id: string;
  ts: string;
  phase: string | null;
  type: string | null;
  summary: string;
  payload: Record<string, unknown>;
}

export interface ExportRow {
  id: string;
  project_id: string;
  created_at: string;
  storage_path: string | null;
  format: string;
}

/* ---------- Analyzer contract ---------- */

export interface AnalyzeInput {
  projectId: string;
  mode: RecoveryMode;
  goals: RecoveryGoal[];
  artifacts: { filename: string; kind: ArtifactKind; text?: string | null }[];
  fileTree?: string[];
}

export interface AnalyzerProvider {
  analyze(input: AnalyzeInput): Promise<AnalysisResult>;
}

export const VERIFICATION_LEVELS: { level: number; name: string; criteria: string }[] = [
  { level: 0, name: "Environment Created", criteria: "A runtime matching the project's era is provisioned and pinned." },
  { level: 1, name: "Build Completed", criteria: "The project compiles/builds without fatal errors." },
  { level: 2, name: "App Launched", criteria: "The primary entrypoint starts and stays running." },
  { level: 3, name: "Basic Functionality", criteria: "Core user-facing commands execute successfully." },
  { level: 4, name: "Tests Passed", criteria: "The project's own test suite runs green." },
  { level: 5, name: "Behavior Equivalence", criteria: "Outputs match known-good historical behavior." },
];

export const RECOVERY_MODES: { value: RecoveryMode; label: string; blurb: string }[] = [
  { value: "preserve", label: "Preserve", blurb: "Keep it exactly as it was — reconstruct the original environment, change nothing." },
  { value: "repair", label: "Repair", blurb: "Get it building and running again with the minimum necessary changes." },
  { value: "modernize", label: "Modernize", blurb: "Revive it and lift it toward a supported toolchain, keeping behavior intact." },
  { value: "research", label: "Research", blurb: "Understand it deeply — reconstruct the era and document findings without running." },
];

export const RECOVERY_GOALS: { value: RecoveryGoal; label: string }[] = [
  { value: "build", label: "Build" },
  { value: "run", label: "Run" },
  { value: "test", label: "Test" },
  { value: "preserve", label: "Preserve" },
  { value: "modernize", label: "Modernize" },
];
