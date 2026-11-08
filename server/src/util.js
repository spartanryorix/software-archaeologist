export const tail = (s, n) => (s.length > n ? "…" + s.slice(-n) : s);
export const clip = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");
export const clamp01 = (x, d = 0.5) => (typeof x === "number" && isFinite(x) ? Math.max(0, Math.min(1, x)) : d);

/** Official Docker Hub images only (no registry/org part), no flag injection. */
export const OFFICIAL_IMAGE = /^[a-z0-9][a-z0-9._-]*:[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function safeRel(p) {
  if (typeof p !== "string" || !p || p.length > 300) return null;
  const n = p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/work\/src\//, "");
  if (n.startsWith("/") || n.split("/").some((s) => s === ".." || s === "") || n.startsWith(".git/")) return null;
  return n;
}
