import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readKey() {
  if (process.env.VULTR_INFERENCE_KEY) return process.env.VULTR_INFERENCE_KEY.trim();
  const f = process.env.VKEY_FILE || path.join(os.homedir(), ".vkey");
  try { return fs.readFileSync(f, "utf8").trim(); } catch { return ""; }
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  inferenceBase: process.env.VULTR_INFERENCE_BASE || "https://api.vultrinference.com/v1",
  inferenceKey: readKey(),
  modelPrimary: process.env.MODEL_PRIMARY || "glm-5.3",
  modelFallback: process.env.MODEL_FALLBACK || "glm-5.3-flash",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
  authRequired: process.env.AUTH_REQUIRED !== "false",
  workRoot: process.env.WORK_ROOT || path.join(os.tmpdir(), "archaeologist-jobs"),
  maxZipBytes: 25 * 1024 * 1024,
  maxUnzipBytes: 120 * 1024 * 1024,
  maxFiles: 3000,
  maxAttempts: Number(process.env.MAX_ATTEMPTS) || 4,
  buildTimeoutSec: 300,
  runTimeoutSec: 25,
  concurrency: Number(process.env.CONCURRENCY) || 2,
};
