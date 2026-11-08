import fsp from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { config } from "./config.js";
import { safeRel } from "./util.js";

/** Safe extraction: path sanitising, size/count caps, regular files only (no symlinks). */
export async function extractTo(buf, destDir) {
  let total = 0, count = 0;
  const entries = unzipSync(new Uint8Array(buf), {
    filter(f) {
      if (f.name.endsWith("/")) return false;
      total += f.originalSize; count += 1;
      if (total > config.maxUnzipBytes) throw new Error("Archive too large when unpacked");
      if (count > config.maxFiles) throw new Error("Archive has too many files");
      return !f.name.startsWith("__MACOSX/");
    },
  });
  let names = Object.keys(entries);
  const tops = new Set(names.map((n) => n.split("/")[0]));
  const strip = tops.size === 1 && names.every((n) => n.includes("/")) ? [...tops][0] + "/" : "";
  const files = [];
  for (const name of names) {
    const rel = safeRel(strip ? name.slice(strip.length) : name);
    if (!rel) continue;
    const abs = path.join(destDir, rel);
    if (!abs.startsWith(destDir + path.sep)) continue;
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, entries[name], { mode: 0o644 });
    files.push({ path: rel, size: entries[name].length });
  }
  return files;
}

export async function readTextSafe(root, rel, max = 4000) {
  try {
    const abs = path.join(root, rel);
    if (!abs.startsWith(root + path.sep)) return null;
    const st = await fsp.lstat(abs);
    if (!st.isFile()) return null;
    const buf = await fsp.readFile(abs);
    if (buf.subarray(0, 2048).includes(0)) return null;
    return buf.toString("utf8").slice(0, max);
  } catch { return null; }
}
