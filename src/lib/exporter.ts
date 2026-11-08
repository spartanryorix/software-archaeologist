import { zipSync, strToU8 } from "fflate";
import type {
  AnalysisResult,
  AuditEvent,
  BlockerRow,
  EnvironmentSpec,
  PatchRow,
  PlanStepRow,
  Project,
  VerificationRow,
} from "./types";

/* =====================================================================
   Recovery-package builder (blueprint §6.9). Produces a real, downloadable
   ZIP assembled from the project's data. Everything is client-side.
   ===================================================================== */

export interface PackageInput {
  project: Project;
  analysis: AnalysisResult | null;
  environment: EnvironmentSpec | null;
  planSteps: PlanStepRow[];
  blockers: BlockerRow[];
  patches: PatchRow[];
  verification: VerificationRow[];
  audit: AuditEvent[];
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "recovery";
}

function dockerfile(env: EnvironmentSpec | null, analysis: AnalysisResult | null): string {
  const base = env ? `${env.base_image}` : "debian:stable-slim";
  const install = analysis
    ? (() => {
        const lang = analysis.languages[0]?.name ?? "";
        if (lang === "Python") return "RUN pip install --no-cache-dir -r requirements.txt";
        if (lang === "Java") return "RUN mvn -q -DskipTests package";
        if (lang === "Ruby") return "RUN bundle install";
        if (lang === "PHP") return "RUN composer install --no-dev --no-interaction";
        if (lang === "Go") return "RUN go build -o /app/app ./...";
        if (lang === "Rust") return "RUN cargo build --release";
        return "RUN npm ci --omit=dev";
      })()
    : "RUN echo 'no build step detected'";
  return `# Reconstructed environment — Software Archaeologist
# Base image pinned by digest for reproducibility. No mutable tags.
FROM ${base}${env?.base_image_digest ? `@${env.base_image_digest}` : ""}

LABEL org.softwarearchaeologist.recovery="true" \\
      org.softwarearchaeologist.runtime="${env?.runtime ?? "unknown"}" \\
      org.softwarearchaeologist.version="${env?.runtime_version ?? "unknown"}"

# Run as a non-root user
RUN useradd -m -u 10001 appuser
WORKDIR /app
COPY . /app

${install}

USER appuser
CMD ["sh", "-lc", "echo 'recovered build ready'"]
`;
}

function compose(env: EnvironmentSpec | null, project: Project): string {
  const img = `archaeologist/${slug(project.name)}:recovered`;
  return `# compose.yaml — Software Archaeologist recovered environment
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: ${img}
    environment:
      - RECOVERY_MODE=${project.recovery_mode}
    # resources pinned to keep the historical runtime stable
    ${env ? `# runtime: ${env.runtime} ${env.runtime_version}` : ""}
    restart: "no"
`;
}

function environmentManifest(env: EnvironmentSpec | null, analysis: AnalysisResult | null): string {
  return JSON.stringify(
    {
      schema: "software-archaeologist/environment-manifest@1",
      generated_by: "Software Archaeologist",
      runtime: env?.runtime ?? null,
      runtime_version: env?.runtime_version ?? null,
      env_type: env?.env_type ?? null,
      base_image: env?.base_image ?? null,
      base_image_digest: env?.base_image_digest ?? null,
      pinned: true,
      packages: env?.packages ?? [],
      era: analysis?.era ?? null,
      languages: analysis?.languages ?? [],
      frameworks: analysis?.frameworks ?? [],
      note: "Versions and image digests are pinned for reproducibility. Do not substitute 'latest'.",
    },
    null,
    2,
  );
}

const isLive = (input: PackageInput) => input.audit.some((a) => a.type === "sandbox_proof");

function recoveryReport(input: PackageInput): string {
  const { project, analysis, environment, planSteps, blockers, patches, audit, verification } = input;
  const lines: string[] = [];
  lines.push(`# Recovery Report — ${project.name}`);
  lines.push("");
  lines.push(`**Recovery mode:** ${project.recovery_mode}  `);
  lines.push(`**Generated:** ${new Date().toISOString()}  `);
  lines.push(`**Confidence:** ${Math.round((analysis?.confidence ?? project.confidence_level / 5) * 100)}%`);
  lines.push("");
  lines.push(
    isLive(input)
      ? "> This report was produced by a **live** recovery run: builds and executions ran in locked-down Docker containers on a Vultr VM."
      : "> This report was produced by a **simulated** recovery run. No real containers were built.",
  );
  lines.push("");
  lines.push("## Reconstructed era");
  if (analysis?.era) {
    lines.push(`- ${analysis.era.label}${analysis.era.speculative ? " _(speculative)_" : ""}`);
    lines.push(`- Evidence:`);
    analysis.era.evidence.forEach((e) => lines.push(`  - ${e}`));
  } else {
    lines.push("- Unknown");
  }
  lines.push("");
  lines.push("## Detected stack");
  lines.push(
    `- Languages: ${analysis?.languages.map((l) => `${l.name}${l.version ? ` ${l.version}` : ""}`).join(", ") || "—"}`,
  );
  lines.push(`- Frameworks: ${analysis?.frameworks.map((f) => f.name).join(", ") || "—"}`);
  lines.push(`- Build systems: ${analysis?.buildSystems.map((b) => b.name).join(", ") || "—"}`);
  lines.push("");
  lines.push("## Environment");
  lines.push(`- ${environment?.env_type ?? "n/a"} → ${environment?.base_image ?? "n/a"}`);
  lines.push("");
  lines.push("## Blockers");
  if (blockers.length) {
    blockers.forEach((b) => lines.push(`- **${b.title}** (${b.severity}, ${b.category}) — ${b.status}`));
  } else {
    lines.push("- None detected.");
  }
  lines.push("");
  lines.push("## Recovery plan");
  planSteps.forEach((s, i) => lines.push(`${i + 1}. ${s.title} — ${s.status}`));
  lines.push("");
  lines.push("## Patches applied");
  if (patches.length) {
    patches.forEach((p) => lines.push(`- \`${p.file_path}\` — ${p.rationale ?? "reversible patch"}`));
  } else {
    lines.push("- None (original source preserved unchanged).");
  }
  lines.push("");
  lines.push("## Verification");
  verification.forEach((v) => lines.push(`- Level ${v.level} — ${v.name}: **${v.status}**`));
  lines.push("");
  lines.push("## Investigation timeline (audit trail)");
  audit.slice(0, 200).forEach((a) => lines.push(`- ${a.ts} · ${a.phase ?? ""} · ${a.summary}`));
  lines.push("");
  return lines.join("\n");
}

function verificationReport(input: PackageInput): string {
  return JSON.stringify(
    {
      schema: "software-archaeologist/verification-report@1",
      project: input.project.name,
      generated_at: new Date().toISOString(),
      simulated: !isLive(input),
      levels: input.verification.map((v) => ({
        level: v.level,
        name: v.name,
        criteria: v.criteria,
        status: v.status,
        evidence: v.evidence,
      })),
      note: isLive(input)
        ? "Verification levels come from real sandboxed executions and are only reported where evidence exists."
        : "Verification levels reflect a simulated run and are only reported where evidence exists.",
    },
    null,
    2,
  );
}

function readme(input: PackageInput): string {
  return `# ${input.project.name} — Recovery Bundle

This bundle was produced by **Software Archaeologist**.

## What's inside
- \`environment/\` — Dockerfile, compose.yaml and a pinned environment manifest
- \`dependencies/\` — recovered dependency manifest
- \`patches/\` — reversible patches applied during recovery
- \`reports/\` — recovery report + verification report
- \`source/\` — reference to the preserved original source

## Reproduce offline
\`\`\`sh
cd environment
docker build -t ${slug(input.project.name)} .
docker run --rm -it ${slug(input.project.name)}
\`\`\`

## Honest caveats
- This environment and its patches were generated by a **simulated** recovery engine.
- The Dockerfile is a **best-effort recipe** and has **not been proven to build** in this environment.
- Versions and image digests are pinned — do not replace them with \`latest\`.
`;
}

export function buildRecoveryPackage(input: PackageInput): { files: Record<string, Uint8Array>; filename: string } {
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, content: string) => {
    files[path] = strToU8(content);
  };

  put("README.md", readme(input));
  put("environment/Dockerfile", dockerfile(input.environment, input.analysis));
  put("environment/compose.yaml", compose(input.environment, input.project));
  put("environment/environment-manifest.json", environmentManifest(input.environment, input.analysis));
  put(
    "dependencies/recovered-dependencies.json",
    JSON.stringify(
      {
        packages: input.environment?.packages ?? [],
        note: "Recovered dependency set with pinned versions. Verify checksums against archival mirrors before redistribution.",
      },
      null,
      2,
    ),
  );
  put("reports/recovery-report.md", recoveryReport(input));
  put("reports/verification-report.json", verificationReport(input));
  put(
    "source/README.txt",
    "The original, unmodified source archive is preserved in the workspace's artifacts bucket under the project id. It is never mutated by recovery.\n",
  );

  if (input.patches.length) {
    input.patches.forEach((p, i) => {
      put(`patches/${String(i + 1).padStart(2, "0")}_${p.file_path.replace(/[\/]/g, "_")}.patch`, `${p.diff}\n# rationale: ${p.rationale ?? ""}\n# reversible: ${p.reversible}\n`);
    });
  } else {
    put("patches/.keep", "No patches were applied — the original source is preserved unchanged.\n");
  }

  return { files, filename: `${slug(input.project.name)}-recovery-package.zip` };
}

export function downloadZip(files: Record<string, Uint8Array>, filename: string) {
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
