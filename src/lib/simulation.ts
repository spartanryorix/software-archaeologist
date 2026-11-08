import type { AnalysisResult, EnvironmentSpec, Project } from "./types";
import { hashString, seededRandom } from "./utils";

/* =====================================================================
   Simulated execution engine (blueprint §9 state machine).

   IMPORTANT: this is a SIMULATION. No containers are created, no builds
   run, no VMs boot. It produces a realistic, deterministic script of log
   lines, reversible patches, and verification results that the Execution
   tab replays. The UI labels it as simulated everywhere.
   ===================================================================== */

export interface SimLine {
  delay: number;
  level: "info" | "warn" | "error" | "cmd" | "ok";
  phase: string;
  message: string;
}

export interface SimPatch {
  file_path: string;
  diff: string;
  rationale: string;
}

export interface SimVerification {
  level: number;
  name: string;
  criteria: string;
  status: "pass" | "fail" | "unknown";
  evidence: string[];
}

export interface SimScript {
  budget: number;
  iterations: number;
  finalLevel: number;
  finalStatus: "complete" | "partial";
  result: string;
  lines: SimLine[];
  patches: SimPatch[];
  verification: SimVerification[];
}

function buildCommand(analysis: AnalysisResult): string {
  const lang = analysis.languages[0]?.name ?? "";
  switch (lang) {
    case "Python":
      return "pip install -r requirements.txt && python setup.py build";
    case "Java":
      return "mvn -q -DskipTests package";
    case "Ruby":
      return "bundle install && bundle exec rake";
    case "PHP":
      return "composer install --no-dev";
    case "Go":
      return "go build ./...";
    case "Rust":
      return "cargo build --release";
    default:
      return "npm ci && npm run build";
  }
}

function runCommand(analysis: AnalysisResult): string {
  const lang = analysis.languages[0]?.name ?? "";
  switch (lang) {
    case "Python":
      return "python main.py";
    case "Java":
      return "java -jar target/app.jar";
    case "Ruby":
      return "bundle exec rails server";
    case "PHP":
      return "php -S 0.0.0.0:8000";
    case "Go":
      return "./app";
    case "Rust":
      return "./target/release/app";
    default:
      return "npm start";
  }
}

function samplePatch(analysis: AnalysisResult, i: number): SimPatch {
  const isPython = analysis.languages[0]?.name === "Python";
  if (isPython) {
    return {
      file_path: "requirements.txt",
      diff: `--- a/requirements.txt\n+++ b/requirements.txt\n@@ -1,2 +1,2 @@\n-Django==1.8.2\n+Django==1.8.19   # patch: last secure 1.8.x build\n`,
      rationale: "Pinned the final patched 1.8.x release so the historical Django API is preserved while a known CVE is closed.",
    };
  }
  const dep = analysis.dependencyGraph.nodes.find((n) => n.kind === "dependency")?.label ?? "a native dependency";
  return {
    file_path: "package.json",
    diff: `--- a/package.json\n+++ b/package.json\n@@ -12,1 +12,1 @@\n-    "${dep}": "old-range",\n+    "${dep}": "resolved-safe",   # patch #${i + 1}\n`,
    rationale: `Re-resolved ${dep} to a version compatible with the reconstructed runtime; captured as a reversible, reviewable patch.`,
  };
}

export function buildSimulation(
  project: Project,
  analysis: AnalysisResult,
  environment: EnvironmentSpec,
): SimScript {
  const rand = seededRandom(hashString(project.id));
  const d = () => 220 + Math.floor(rand() * 420);
  const lines: SimLine[] = [];
  const patches: SimPatch[] = [];
  const verification: SimVerification[] = [];
  const build = buildCommand(analysis);
  const run = runCommand(analysis);
  const blockers = analysis.blockers;
  const budget = 5;

  // ---- environment setup ----
  lines.push({ delay: d(), level: "info", phase: "environment_setup", message: "▶ PROJECT_RECEIVED — assembling recovery workspace" });
  lines.push({ delay: d(), level: "info", phase: "environment_setup", message: `Provisioning isolated environment (SIMULATED): ${environment.base_image}` });
  lines.push({ delay: d(), level: "cmd", phase: "environment_setup", message: `docker pull ${environment.base_image}@${environment.base_image_digest.slice(0, 19)}…` });
  lines.push({ delay: d(), level: "cmd", phase: "environment_setup", message: `docker run --rm -it -v $PWD:/src -w /src ${environment.base_image}` });
  lines.push({ delay: d(), level: "ok", phase: "environment_setup", message: "Environment ready — level 0 (Environment Created)" });
  verification.push({
    level: 0,
    name: "Environment Created",
    criteria: analysis.recoveryPlan.verificationTargets[0]?.criteria ?? "A pinned runtime is provisioned.",
    status: "pass",
    evidence: [`Base image ${environment.base_image} pinned by digest.`],
  });

  // ---- build loop ----
  const failingIterations = Math.min(blockers.length, 2);
  let built = false;

  for (let i = 0; i < failingIterations; i++) {
    const blocker = blockers[i];
    lines.push({ delay: d(), level: "info", phase: "build_attempt", message: `┌ BUILD_ATTEMPT #${i + 1}` });
    lines.push({ delay: d(), level: "cmd", phase: "build_attempt", message: build });
    lines.push({ delay: d(), level: "warn", phase: "build_attempt", message: `  resolving ${8 + i * 3} package(s) from archive mirror…` });
    lines.push({ delay: d(), level: "error", phase: "build_attempt", message: `Build failed: ${blocker.title}` });
    lines.push({ delay: d(), level: "info", phase: "error_analysis", message: `→ ERROR_ANALYSIS — cause: ${blocker.category} (severity ${blocker.severity})` });
    lines.push({ delay: d(), level: "info", phase: "error_analysis", message: `  evidence: ${blocker.evidence[0] ?? "recorded from scan"}` });
    const patch = samplePatch(analysis, i);
    patches.push(patch);
    lines.push({ delay: d(), level: "info", phase: "recovery_action", message: `→ RECOVERY_ACTION — applying reversible patch to ${patch.file_path}` });
    lines.push({ delay: d(), level: "cmd", phase: "recovery_action", message: `git apply patches/${String(i + 1).padStart(2, "0")}_${patch.file_path.replace(/[\/]/g, "_")}.patch  # reversible` });
  }

  if (failingIterations < blockers.length) {
    lines.push({ delay: d(), level: "warn", phase: "build_attempt", message: `${blockers.length - failingIterations} further blocker(s) resolved proactively via the same guarded strategy.` });
  }

  // final successful build
  lines.push({ delay: d(), level: "info", phase: "build_attempt", message: `┌ BUILD_ATTEMPT #${failingIterations + 1} (post-patch)` });
  lines.push({ delay: d(), level: "cmd", phase: "build_attempt", message: build });
  lines.push({ delay: d(), level: "ok", phase: "build_attempt", message: "Build completed successfully — level 1 (Build Completed)" });
  built = true;
  verification.push({
    level: 1,
    name: "Build Completed",
    criteria: analysis.recoveryPlan.verificationTargets.find((t) => t.level === 1)?.criteria ?? "Compiles without fatal errors.",
    status: "pass",
    evidence: [`\`${build}\` exited 0 (simulated).`],
  });

  const maxTarget = analysis.recoveryPlan.verificationTargets.reduce((m, t) => Math.max(m, t.level), 1);
  const lowConfidence = analysis.confidence < 0.42;

  if (built && maxTarget >= 2 && !lowConfidence) {
    lines.push({ delay: d(), level: "cmd", phase: "verification", message: run });
    lines.push({ delay: d(), level: "ok", phase: "verification", message: "Entrypoint launched and responded — level 2 (App Launched)" });
    verification.push({
      level: 2,
      name: "App Launched",
      criteria: analysis.recoveryPlan.verificationTargets.find((t) => t.level === 2)?.criteria ?? "Entrypoint starts and stays running.",
      status: "pass",
      evidence: ["Process stayed up through the health window (simulated)."],
    });
  } else if (maxTarget >= 2) {
    verification.push({
      level: 2,
      name: "App Launched",
      criteria: "Entrypoint starts and stays running.",
      status: "unknown",
      evidence: ["Not attempted — era reconstruction confidence too low to assert a launch."],
    });
  }

  let finalLevel = 1;
  for (let lvl = 3; lvl <= maxTarget; lvl++) {
    if (lowConfidence) {
      verification.push({
        level: lvl,
        name: analysis.recoveryPlan.verificationTargets.find((t) => t.level === lvl)?.name ?? `Level ${lvl}`,
        criteria: analysis.recoveryPlan.verificationTargets.find((t) => t.level === lvl)?.criteria ?? "",
        status: "unknown",
        evidence: ["Held back — insufficient evidence to claim this level."],
      });
      continue;
    }
    lines.push({ delay: d(), level: "cmd", phase: "verification", message: `verify --level ${lvl} (${analysis.recoveryPlan.verificationTargets.find((t) => t.level === lvl)?.name})` });
    lines.push({ delay: d(), level: "ok", phase: "verification", message: `Passed verification level ${lvl}.` });
    verification.push({
      level: lvl,
      name: analysis.recoveryPlan.verificationTargets.find((t) => t.level === lvl)?.name ?? `Level ${lvl}`,
      criteria: analysis.recoveryPlan.verificationTargets.find((t) => t.level === lvl)?.criteria ?? "",
      status: "pass",
      evidence: [`Checks for level ${lvl} passed (simulated).`],
    });
    finalLevel = lvl;
  }
  if (verification.some((v) => v.level === 2 && v.status === "pass")) finalLevel = Math.max(finalLevel, 2);

  const finalStatus: "complete" | "partial" = lowConfidence ? "partial" : "complete";
  lines.push({ delay: d(), level: "info", phase: "recovery_report", message: "▶ RECOVERY_REPORT — generating package manifest & reports" });
  lines.push({
    delay: d(),
    level: "ok",
    phase: "recovery_report",
    message: finalStatus === "complete"
      ? `Recovery complete — verified to level ${finalLevel}. (SIMULATED run)`
      : `Recovery partial — reached level ${finalLevel}; confidence insufficient to claim higher. (SIMULATED run)`,
  });

  return {
    budget,
    iterations: failingIterations + 1,
    finalLevel,
    finalStatus,
    result:
      finalStatus === "complete"
        ? `Simulated recovery reached verification level ${finalLevel}.`
        : `Simulated recovery reached level ${finalLevel} (partial — low era confidence).`,
    lines,
    patches,
    verification,
  };
}
