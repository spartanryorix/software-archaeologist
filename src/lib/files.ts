import { unzipSync, strFromU8 } from "fflate";
import type { ArtifactKind } from "./types";

export interface ExtractedFile {
  path: string;
  size: number;
  text: string | null;
}

export interface ArchiveContents {
  tree: string[];
  files: ExtractedFile[];
  manifests: ExtractedFile[];
}

const MAX_TEXT = 200_000;

const MANIFEST_NAMES = new Set([
  "package.json",
  "requirements.txt",
  "setup.py",
  "pyproject.toml",
  "pipfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "gemfile",
  "composer.json",
  "go.mod",
  "cargo.toml",
  "makefile",
  "cmakelists.txt",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  ".nvmrc",
  ".ruby-version",
  ".python-version",
  "packages.config",
  "build.xml",
  "configure.ac",
  "configure.in",
  "rakefile",
  "gradlew",
]);

export function isManifest(path: string): boolean {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  return MANIFEST_NAMES.has(base) || base.endsWith(".csproj");
}

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

function safeDecode(bytes: Uint8Array): string {
  try {
    const text = strFromU8(bytes);
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
  } catch {
    return "";
  }
}

/** Extract a ZIP archive into a file tree and text contents. */
export function extractZip(bytes: Uint8Array): ArchiveContents {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return { tree: [], files: [], manifests: [] };
  }
  const tree: string[] = [];
  const files: ExtractedFile[] = [];
  for (const [path, data] of Object.entries(entries)) {
    tree.push(path);
    if (path.endsWith("/")) continue;
    const text = looksBinary(data) ? null : safeDecode(data);
    files.push({ path, size: data.length, text });
  }
  const manifests = files.filter((f) => f.text && isManifest(f.path));
  return { tree, files, manifests };
}

/** Classify an uploaded file for the artifact record. */
export function classifyArtifact(filename: string): ArtifactKind {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (isManifest(filename)) return "manifest";
  if (/\.(png|jpe?g|gif|bmp|webp|tiff?)$/.test(lower)) return "screenshot";
  if (/\.(exe|msi|dmg|deb|rpm|apk|jar|bin|so|dll|iso|img)$/.test(lower)) return "installer";
  if (/\.(txt|md|rst|log|cfg|ini|yml|yaml|json|xml|toml|csv)$/.test(lower)) return "doc";
  return "binary";
}

/** readFileAsBytes + small helper for File inputs. */
export function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
