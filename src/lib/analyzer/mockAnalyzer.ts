import type {
  AnalysisResult,
  AnalyzeInput,
  AnalyzerProvider,
  Blocker,
  DependencyGraph,
  EnvironmentSpec,
  EraReconstruction,
  GraphEdge,
  GraphNode,
  MissingAsset,
  PlanStep,
  RecoveryGoal,
  RecoveryMode,
  SafetyRisk,
  TechDetection,
  VerificationTarget,
} from "../types";
import { VERIFICATION_LEVELS } from "../types";
import { hashString } from "../utils";
import { isManifest } from "../files";

/* =====================================================================
   Mock Analyzer — a deterministic, heuristic "archaeologist".

   Runs entirely client-side: no network, no keys. Produces an evidence-
   backed AnalysisResult with the exact same shape a real LLM-backed
   AnalyzerProvider (a Supabase Edge Function) will return later, so the
   UI/DB/flows never need to change when it is swapped in.
   ===================================================================== */

const EXT_LANG: Record<string, string> = {
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  ts: "TypeScript", tsx: "TypeScript",
  py: "Python", rb: "Ruby", php: "PHP", java: "Java", kt: "Kotlin", kts: "Kotlin",
  go: "Go", rs: "Rust", cs: "C#", cpp: "C++", cc: "C++", cxx: "C++", hpp: "C++",
  c: "C", h: "C", swift: "Swift", m: "Objective-C", mm: "Objective-C",
  pl: "Perl", pm: "Perl", pas: "Pascal", vb: "Visual Basic",
  f: "Fortran", f77: "Fortran", for: "Fortran", cob: "COBOL", cbl: "COBOL",
  lua: "Lua", scala: "Scala", dart: "Dart", asm: "Assembly", s: "Assembly",
};

const RUNTIME_FOR_LANG: Record<string, string> = {
  JavaScript: "node", TypeScript: "node", Python: "python", Ruby: "ruby",
  PHP: "php", Java: "openjdk", Kotlin: "openjdk", Go: "golang",
  Rust: "rust", "C#": "dotnet", "C++": "buildpack-deps", C: "buildpack-deps",
  Fortran: "gfortran", COBOL: "gnucobol", Perl: "perl", Lua: "lua",
};

const DEFAULT_VERSION_FOR_LANG: Record<string, string> = {
  JavaScript: "0.12.18", TypeScript: "3.9", Python: "2.7.18", Ruby: "2.3.8",
  PHP: "5.6.40", Java: "8", Go: "1.11", Rust: "1.30", "C#": "4.7",
  "C++": "gcc-4.8", C: "gcc-4.8",
};

/** Approximate era mapping for a runtime + version. */
function eraForRuntime(runtime: string, version?: string): { label: string; range: string } | null {
  if (!version) return null;
  const v = version.replace(/^[^0-9]*/, "");
  const [maj] = v.split(".");
  if (runtime === "python") {
    if (v.startsWith("2.6")) return { label: "Python 2.6 era", range: "≈2008–2013" };
    if (v.startsWith("2.7")) return { label: "Python 2.7 era", range: "≈2010–2020" };
    if (v.startsWith("2.")) return { label: `Python ${v} era`, range: "≈2005–2015" };
    if (v.startsWith("3.4") || v.startsWith("3.5")) return { label: `Python ${v} era`, range: "≈2014–2019" };
    if (v.startsWith("3.")) return { label: `Python ${v} era`, range: "≈2015–present" };
  }
  if (runtime === "node") {
    const n = Number(maj);
    if (n <= 0) return { label: `Node.js ${version} era`, range: "≈2011–2015" };
    if (n <= 4) return { label: `Node.js ${version} era`, range: "≈2013–2016" };
    if (n <= 8) return { label: `Node.js ${version} era`, range: "≈2016–2018" };
    return { label: `Node.js ${version} era`, range: "≈2018–present" };
  }
  if (runtime === "openjdk" || runtime === "java") {
    const n = Number(maj);
    if (n <= 6) return { label: `Java ${version} / Maven era`, range: "≈2006–2013" };
    if (n <= 8) return { label: `Java ${version} era`, range: "≈2014–2019" };
    return { label: `Java ${version} era`, range: "≈2018–present" };
  }
  if (runtime === "ruby") {
    const n = Number(maj);
    if (n <= 2) return { label: `Ruby ${version} era`, range: "≈2013–2018" };
  }
  return { label: `${runtime} ${version} era`, range: "" };
}

function digest(seed: string): string {
  let out = "";
  let h = hashString(seed);
  while (out.length < 64) {
    h = (h * 1664525 + 1013904223) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return "sha256:" + out.slice(0, 64);
}

function uniqPush<T>(arr: T[], item: T, key: (v: T) => string) {
  if (!arr.some((x) => key(x) === key(item))) arr.push(item);
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extCounts(tree: string[]): { lang: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const p of tree) {
    const m = /\.([a-z0-9]+)$/i.exec(p);
    if (!m) continue;
    const lang = EXT_LANG[m[1].toLowerCase()];
    if (lang) counts[lang] = (counts[lang] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count);
}

const FRAMEWORK_HINTS: { match: RegExp; name: string }[] = [
  { match: /^react(-dom)?$/, name: "React" },
  { match: /^@angular\//, name: "Angular" },
  { match: /^vue$/, name: "Vue" },
  { match: /^svelte$/, name: "Svelte" },
  { match: /^next$/, name: "Next.js" },
  { match: /^express$/, name: "Express" },
  { match: /^koa$/, name: "Koa" },
  { match: /^jquery$/, name: "jQuery" },
  { match: /^lodash$/, name: "Lodash" },
  { match: /^backbone$/, name: "Backbone.js" },
  { match: /^ember-source$/, name: "Ember" },
  { match: /^meteor$/, name: "Meteor" },
  { match: /^webpack$/, name: "Webpack" },
  { match: /^babel-core$/, name: "Babel" },
  { match: /^grunt$/, name: "Grunt" },
  { match: /^gulp$/, name: "Gulp" },
  { match: /^phantomjs/, name: "PhantomJS" },
  { match: /^jest$/, name: "Jest" },
  { match: /^mocha$/, name: "Mocha" },
];

function buildGraph(
  languages: TechDetection[],
  frameworks: TechDetection[],
  deps: { name: string; version?: string }[],
  blockers: Blocker[],
  missing: MissingAsset[],
): DependencyGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  nodes.push({ id: "root", label: "Recovery Target", kind: "runtime", status: "root" });

  for (const lang of languages) {
    const id = `lang:${lang.name}`;
    nodes.push({ id, label: lang.name, kind: "language", meta: lang.version });
    edges.push({ source: "root", target: id });
  }
  for (const fw of frameworks) {
    const id = `fw:${fw.name}`;
    nodes.push({ id, label: fw.name, kind: "framework", meta: fw.version });
    edges.push({ source: languages[0] ? `lang:${languages[0].name}` : "root", target: id });
  }
  for (const d of deps.slice(0, 30)) {
    const id = `dep:${d.name}`;
    nodes.push({ id, label: d.name, kind: "dependency", meta: d.version });
    edges.push({ source: languages[0] ? `lang:${languages[0].name}` : "root", target: id });
  }
  for (const m of missing) {
    const id = `asset:${m.name}`;
    nodes.push({ id, label: m.name, kind: "asset", status: "missing" });
    edges.push({ source: "root", target: id, label: "missing" });
  }
  for (const b of blockers) {
    const id = `blocker:${b.title}`;
    nodes.push({ id, label: b.title, kind: "blocker", status: b.severity });
    edges.push({ source: "root", target: id, label: "blocker" });
  }
  return { nodes, edges };
}

function targetsFor(mode: RecoveryMode, goals: RecoveryGoal[]): VerificationTarget[] {
  let max = 3;
  if (mode === "research") max = 2;
  else if (mode === "preserve") max = 3;
  else if (mode === "repair") max = 4;
  else if (mode === "modernize") max = 5;
  if (goals.includes("test")) max = Math.max(max, 4);
  if (goals.includes("modernize")) max = Math.max(max, 5);
  if (goals.includes("build") && !goals.includes("run")) max = Math.min(max, 2);
  const names: Record<number, string> = {};
  for (const v of VERIFICATION_LEVELS) names[v.level] = v.name;
  const out: VerificationTarget[] = [];
  for (const v of VERIFICATION_LEVELS) {
    if (v.level <= max) out.push({ level: v.level, name: names[v.level] ?? v.name, criteria: v.criteria });
  }
  return out;
}

export class MockAnalyzer implements AnalyzerProvider {
  async analyze(input: AnalyzeInput): Promise<AnalysisResult> {
    const manifests = input.artifacts.filter((a) => a.text && isManifest(a.filename));
    const anyText = input.artifacts.filter((a) => a.text);
    const tree = input.fileTree ?? input.artifacts.map((a) => a.filename);

    const languages: TechDetection[] = [];
    const frameworks: TechDetection[] = [];
    const buildSystems: TechDetection[] = [];
    const deps: { name: string; version?: string }[] = [];
    const missingAssets: MissingAsset[] = [];
    const safetyRisks: SafetyRisk[] = [];
    const blockers: Blocker[] = [];

    let eraRuntime = "";
    let eraVersion = "";
    const eraEvidence: string[] = [];

    const has = (needle: string) =>
      manifests.some((m) => m.filename.toLowerCase().endsWith(needle)) ||
      anyText.some((m) => m.filename.toLowerCase().endsWith(needle));

    /* ---------- package.json ---------- */
    const pkgManifest = manifests.find((m) => m.filename.toLowerCase().endsWith("package.json"));
    if (pkgManifest) {
      const pkg = parseJson(pkgManifest.text ?? "");
      const engines = (pkg?.engines ?? {}) as Record<string, string>;
      const nodeVer = engines.node?.replace(/[^0-9.]/g, "");
      const detectedDeps = {
        ...((pkg?.dependencies ?? {}) as Record<string, string>),
        ...((pkg?.devDependencies ?? {}) as Record<string, string>),
      };
      for (const [name, version] of Object.entries(detectedDeps)) {
        deps.push({ name, version: version.replace(/[\^~>=< ]/g, "") });
        for (const hint of FRAMEWORK_HINTS) {
          if (hint.match.test(name)) {
            uniqPush(
              frameworks,
              { name: hint.name, version: version.replace(/[\^~>=< ]/g, ""), evidence: [`Declared in ${pkgManifest.filename} dependencies`] },
              (f) => f.name,
            );
          }
        }
      }
      const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
      if (scripts.build) buildSystems.push({ name: "npm run build", evidence: [`scripts.build = "${scripts.build}"`] });
      if (scripts.test) buildSystems.push({ name: "npm test", evidence: [`scripts.test = "${scripts.test}"`] });

      uniqPush(
        languages,
        {
          name: "JavaScript",
          version: nodeVer || DEFAULT_VERSION_FOR_LANG.JavaScript,
          evidence: [`${pkgManifest.filename} present`, nodeVer ? `engines.node = "${engines.node}"` : "no engines.node pin — assumed historical default"],
        },
        (l) => l.name,
      );
      if (detectedDeps["typescript"]) {
        uniqPush(languages, { name: "TypeScript", version: detectedDeps["typescript"].replace(/[\^~>=< ]/g, ""), evidence: ["typescript in dependencies"] }, (l) => l.name);
      }
      eraRuntime = "node";
      eraVersion = nodeVer || DEFAULT_VERSION_FOR_LANG.JavaScript;
      eraEvidence.push(`Node ${eraVersion} inferred from ${pkgManifest.filename}`);
      if (detectedDeps["node-sass"] || detectedDeps["node-gyp"]) {
        blockers.push({
          title: "Native addon needs an ancient Python 2 toolchain",
          category: "native-build",
          severity: "high",
          evidence: [`node-gyp/node-sass present in ${pkgManifest.filename}; these require Python 2.x to compile.`],
        });
      }
      if (frameworks.some((f) => f.name === "PhantomJS")) {
        missingAssets.push({ name: "phantomjs binary", reason: "Headless browser binary no longer distributed by mirrors", evidence: ["phantomjs in devDependencies"] });
      }
    }

    /* ---------- requirements.txt / setup.py ---------- */
    const reqManifest = manifests.find((m) => /requirements.*\.txt$/i.test(m.filename)) ?? anyText.find((m) => /requirements.*\.txt$/i.test(m.filename));
    const setupManifest = manifests.find((m) => m.filename.toLowerCase().endsWith("setup.py"));
    if (reqManifest || setupManifest) {
      const source = reqManifest ?? setupManifest!;
      const text = source.text ?? "";
      const pinned = [...text.matchAll(/^\s*([A-Za-z0-9_.\-]+)\s*==\s*([0-9][0-9A-Za-z.\-]*)/gm)];
      for (const m of pinned) {
        deps.push({ name: m[1], version: m[2] });
        if (/^django$/i.test(m[1])) frameworks.push({ name: "Django", version: m[2], evidence: [`${m[1]}==${m[2]} in ${source.filename}`] });
        if (/^flask$/i.test(m[1])) frameworks.push({ name: "Flask", version: m[2], evidence: [`${m[1]}==${m[2]} in ${source.filename}`] });
        if (/^(pyqt5|pyside2|pyqt4)$/i.test(m[1])) frameworks.push({ name: "Qt", version: m[2], evidence: [`${m[1]}==${m[2]} in ${source.filename}`] });
      }
      const pyPin = pinned.find((m) => /^python_requires|^python$/i.test(m[1]));
      const pyVersion = text.match(/python_requires\s*=\s*['"]?>=?\s*([0-9.]+)/i)?.[1] ?? pyPin?.[2];
      const py2 = pinned.filter((m) => /^(django)$/i.test(m[1]) && /^1\./.test(m[2]));
      const version = pyVersion ?? (py2.length ? "2.7" : "3.8");
      uniqPush(languages, { name: "Python", version, evidence: [`${source.filename} present`, `version inferred as ${version}`] }, (l) => l.name);
      buildSystems.push({ name: "pip / setup.py", evidence: [`${source.filename} present`] });
      eraRuntime = "python";
      eraVersion = version;
      eraEvidence.push(`Python ${version} from ${source.filename} pins`);
      if (version.startsWith("2.")) {
        blockers.push({
          title: "Runtime reached end-of-life (Python 2)",
          category: "dead-runtime",
          severity: "high",
          evidence: [`Python ${version} is EOL; system package mirrors have removed default 2.x packages.`],
        });
        safetyRisks.push({ name: "Unmaintained runtime with no security patches", severity: "high", evidence: [`Python ${version} EOL`] });
      }
      if (frameworks.some((f) => f.name === "Qt")) {
        missingAssets.push({ name: "libGL / Qt system libraries", reason: "GUI runtime libraries not present in a slim base image", evidence: ["pyqt/pyside detected"] });
      }
    }

    /* ---------- pom.xml / build.gradle ---------- */
    const pom = manifests.find((m) => m.filename.toLowerCase().endsWith("pom.xml"));
    const gradle = manifests.find((m) => /build\.gradle(\.kts)?$/i.test(m.filename));
    if (pom || gradle) {
      const source = pom ?? gradle!;
      const text = source.text ?? "";
      const javaVersion =
        text.match(/<java\.version>\s*([0-9.]+)\s*<\/java\.version>/i)?.[1] ??
        text.match(/<source>\s*([0-9.]+)\s*<\/source>/i)?.[1] ??
        text.match(/sourceCompatibility\s*=?\s*['"]?([0-9.]+)/i)?.[1] ??
        "8";
      uniqPush(languages, { name: "Java", version: javaVersion, evidence: [`${source.filename} present`, `target/source compatibility ${javaVersion}`] }, (l) => l.name);
      buildSystems.push({ name: pom ? "Maven" : "Gradle", evidence: [`${source.filename} present`] });
      if (/spring/i.test(text)) frameworks.push({ name: "Spring", evidence: [`Spring references in ${source.filename}`] });
      const artifactMatches = [...text.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)].slice(0, 25);
      for (const m of artifactMatches) deps.push({ name: m[1] });
      eraRuntime = "openjdk";
      eraVersion = javaVersion;
      eraEvidence.push(`Java ${javaVersion} from ${source.filename}`);
      if (Number(javaVersion) <= 7) {
        blockers.push({ title: "Ancient JDK toolchain", category: "dead-runtime", severity: "med", evidence: [`Java ${javaVersion} is past end-of-life.`] });
      }
    }

    /* ---------- Gemfile ---------- */
    const gemfile = manifests.find((m) => m.filename.toLowerCase().endsWith("gemfile"));
    if (gemfile) {
      const text = gemfile.text ?? "";
      const rubyVersion = text.match(/ruby\s+['"]([0-9.]+)['"]/)?.[1] ?? "2.3";
      uniqPush(languages, { name: "Ruby", version: rubyVersion, evidence: ["Gemfile present"] }, (l) => l.name);
      buildSystems.push({ name: "Bundler", evidence: ["Gemfile present"] });
      if (/gem\s+['"]rails['"]/.test(text)) {
        const ver = text.match(/gem\s+['"]rails['"],\s*['"]~?>\s*([0-9.]+)/)?.[1];
        frameworks.push({ name: "Rails", version: ver, evidence: ["rails in Gemfile"] });
      }
      [...text.matchAll(/gem\s+['"]([A-Za-z0-9_.\-]+)['"]/g)].slice(0, 20).forEach((m) => deps.push({ name: m[1] }));
      eraRuntime = "ruby";
      eraVersion = rubyVersion;
      eraEvidence.push(`Ruby ${rubyVersion} from Gemfile`);
    }

    /* ---------- composer.json ---------- */
    const composer = manifests.find((m) => m.filename.toLowerCase().endsWith("composer.json"));
    if (composer) {
      const json = parseJson(composer.text ?? "");
      const phpVersion = (json?.require as Record<string, string> | undefined)?.php?.replace(/[^0-9.]/g, "") ?? "5.6";
      uniqPush(languages, { name: "PHP", version: phpVersion, evidence: ["composer.json present"] }, (l) => l.name);
      buildSystems.push({ name: "Composer", evidence: ["composer.json present"] });
      if ((json?.require as Record<string, string> | undefined)?.["laravel/framework"]) frameworks.push({ name: "Laravel", evidence: ["laravel/framework requirement"] });
      eraRuntime = "php";
      eraVersion = phpVersion;
      eraEvidence.push(`PHP ${phpVersion} from composer.json`);
    }

    /* ---------- go.mod / Cargo.toml ---------- */
    const gomod = manifests.find((m) => m.filename.toLowerCase().endsWith("go.mod"));
    if (gomod) {
      const ver = gomod.text?.match(/go\s+([0-9.]+)/)?.[1] ?? "1.11";
      uniqPush(languages, { name: "Go", version: ver, evidence: ["go.mod present"] }, (l) => l.name);
      eraRuntime = "golang";
      eraVersion = ver;
      eraEvidence.push(`Go ${ver} from go.mod`);
    }
    const cargo = manifests.find((m) => m.filename.toLowerCase().endsWith("cargo.toml"));
    if (cargo) {
      uniqPush(languages, { name: "Rust", version: "1.30", evidence: ["Cargo.toml present"] }, (l) => l.name);
      eraRuntime = "rust";
      eraVersion = "1.30";
    }

    /* ---------- build systems from filenames ---------- */
    if (has("makefile")) buildSystems.push({ name: "Make", evidence: ["Makefile present"] });
    if (has("cmakelists.txt")) buildSystems.push({ name: "CMake", evidence: ["CMakeLists.txt present"] });

    /* ---------- fall back to file-extension detection ---------- */
    const extLangs = extCounts(tree);
    for (const { lang, count } of extLangs.slice(0, 4)) {
      uniqPush(languages, { name: lang, evidence: [`${count} source file(s) with matching extension`] }, (l) => l.name);
    }

    /* ---------- missing assets ---------- */
    const hasLockfile = tree.some((p) => /(package-lock\.json|yarn\.lock|poetry\.lock|pipfile\.lock|gemfile\.lock|composer\.lock)$/i.test(p));
    if (languages.some((l) => l.name === "JavaScript") && !hasLockfile) {
      missingAssets.push({ name: "dependency lockfile", reason: "No lockfile — exact historical versions cannot be pinned from evidence alone", evidence: ["No package-lock.json / yarn.lock found"] });
    }
    if (tree.some((p) => /vendor\/|node_modules\//.test(p))) {
      safetyRisks.push({ name: "Vendored third-party code committed to source", severity: "med", evidence: ["node_modules/ or vendor/ present in the archive"] });
    }

    /* ---------- era reconstruction ---------- */
    let era: EraReconstruction;
    const mapped = eraRuntime ? eraForRuntime(eraRuntime, eraVersion) : null;
    if (mapped) {
      era = { label: `${mapped.label}${mapped.range ? ` (${mapped.range})` : ""}`, confidence: 0.78, evidence: eraEvidence.length ? eraEvidence : ["Inferred from manifest versions"], speculative: false };
    } else if (languages.length) {
      era = { label: `${languages[0].name} era (speculative)`, confidence: 0.34, evidence: ["No version pins found — era inferred from file extensions only"], speculative: true };
    } else {
      era = { label: "Unknown era (speculative)", confidence: 0.12, evidence: ["No recognisable manifests or source files"], speculative: true };
    }

    /* ---------- default blockers / env ---------- */
    if (!manifests.length) {
      blockers.push({ title: "No build manifests detected", category: "ingestion", severity: "high", evidence: ["No package manifest (package.json, requirements.txt, pom.xml, …) was found."] });
    }
    if (!languages.length) {
      blockers.push({ title: "Unable to identify source language", category: "detection", severity: "high", evidence: ["No recognised source files or manifests."] });
    }
    for (const fw of frameworks) {
      if (/phantomjs|meteor|backbone/i.test(fw.name)) {
        blockers.push({ title: `${fw.name} ecosystem is effectively dead`, category: "dead-dependency", severity: "med", evidence: [`${fw.name} tooling is no longer maintained upstream.`] });
      }
    }
    uniqPush(safetyRisks, { name: "Original archive preserved read-only; patches recorded, never silently applied", severity: "low", evidence: ["Recovery policy"] }, (r) => r.name);

    /* ---------- environment ---------- */
    const primaryLang = languages[0];
    const runtime = primaryLang ? RUNTIME_FOR_LANG[primaryLang.name] ?? eraRuntime ?? "debian" : eraRuntime || "debian";
    const runtimeVersion = primaryLang?.version ?? eraVersion ?? "latest-known";
    const baseImage = `${runtime}:${runtimeVersion}`;
    const environment: EnvironmentSpec = {
      env_type: "docker",
      runtime,
      runtime_version: runtimeVersion,
      base_image: baseImage,
      base_image_digest: digest(`${input.projectId}:${baseImage}`),
      packages: deps.slice(0, 40).map((d) => ({ name: d.name, version: d.version ?? "unpinned" })),
    };

    /* ---------- recovery plan ---------- */
    const steps: PlanStep[] = [
      {
        title: "Preserve the original archive",
        description: `Store the uploaded source unchanged as the reference copy before any recovery action.`,
        action_type: "preserve",
        safety_guard: "Read-only snapshot; recovery never mutates the original.",
      },
      {
        title: `Reconstruct the ${era.label} environment`,
        description: `Provision ${baseImage} (${environment.env_type}) matching the detected era and pin it by digest.`,
        action_type: "reconstruct-environment",
        safety_guard: "Deterministic, version-pinned base image — no mutable tags.",
      },
    ];
    if (input.mode === "preserve") {
      steps.push({ title: "Hold the environment at the original state", description: "No source changes. Validate only that the reconstructed environment matches the era.", action_type: "verify-only", safety_guard: "Zero source mutations in Preserve mode." });
    } else {
      steps.push({ title: "Resolve build blockers", description: blockers.length ? `Address ${blockers.length} blocker(s): ${blockers.map((b) => b.title).join("; ")}.` : "No hard blockers detected; proceed to build.", action_type: "resolve-blockers", safety_guard: "Each fix is captured as a reversible patch with a rationale." });
      steps.push({ title: "Run the recovery build loop", description: "Attempt build → analyse errors → apply a minimal patch → retry, bounded by the recovery budget.", action_type: "build-loop", safety_guard: "Bounded iterations; stops and reports if the budget is hit." });
    }
    if (input.goals.includes("run") || input.mode === "repair") {
      steps.push({ title: "Launch and verify", description: "Start the primary entrypoint and run the verification ladder up to the agreed level.", action_type: "verify", safety_guard: "Never claim a level beyond the recorded evidence." });
    }
    if (input.mode === "modernize") {
      steps.push({ title: "Lift the toolchain", description: "Propose forward migrations while preserving observable behavior.", action_type: "modernize", safety_guard: "Behavior-preserving; each lift is an isolated, reviewable patch." });
    }
    steps.push({ title: "Package the recovery bundle", description: "Emit Dockerfile, environment manifest, patches, and reports for offline reproduction.", action_type: "export", safety_guard: "Bundle is self-contained and reproducible." });

    const confidenceBase = 0.4 + Math.min(languages.length, 3) * 0.1 + Math.min(frameworks.length, 4) * 0.05 + (manifests.length ? 0.1 : 0);
    const confidence = Math.max(0.15, Math.min(0.92, era.speculative ? confidenceBase - 0.2 : confidenceBase));

    return {
      languages,
      frameworks,
      buildSystems,
      dependencyGraph: buildGraph(languages, frameworks, deps, blockers, missingAssets),
      missingAssets,
      safetyRisks,
      era,
      blockers,
      suggestedEnvironment: environment,
      recoveryPlan: {
        steps,
        safetyGuards: [
          "Original source is preserved and never mutated in place.",
          "Every change is recorded as a minimal, reversible patch with a rationale.",
          "Environment images are pinned by digest — never `latest`.",
          "Verification levels are only reported when backed by recorded evidence.",
        ],
        verificationTargets: targetsFor(input.mode, input.goals),
      },
      confidence,
    };
  }
}
