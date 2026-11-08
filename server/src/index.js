import express from "express";
import multer from "multer";
import { config } from "./config.js";
import { dockerAvailable } from "./docker.js";
import { inferenceConfigured } from "./llm.js";
import { runJob } from "./agent.js";
import { analyze } from "./analyze.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxZipBytes, files: 1 } });

/* ---- auth: every request must carry a valid Supabase session ---- */
const tokenCache = new Map(); // token -> { user, exp }
async function requireUser(req, res, next) {
  if (!config.authRequired) { req.user = { id: "anonymous" }; return next(); }
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in required" });
  const hit = tokenCache.get(token);
  if (hit && hit.exp > Date.now()) { req.user = hit.user; return next(); }
  try {
    const r = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.supabaseKey, Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(401).json({ error: "Invalid session" });
    const user = await r.json();
    tokenCache.set(token, { user, exp: Date.now() + 60_000 });
    if (tokenCache.size > 500) tokenCache.clear();
    req.user = user;
    next();
  } catch { res.status(502).json({ error: "Auth service unreachable" }); }
}

/* ---- health (public, no secrets) ---- */
let active = 0;
const userActive = new Set();
app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, docker: await dockerAvailable(), inference: inferenceConfigured(), model: config.modelPrimary, activeJobs: active });
});

/* ---- LLM-assisted analysis ---- */
app.post("/api/analyze", requireUser, async (req, res) => {
  try { res.json(await analyze(req.body || {})); }
  catch (e) { res.status(502).json({ error: String(e.message || e).slice(0, 200) }); }
});

/* ---- sandboxed recovery run (NDJSON stream) ---- */
app.post("/api/run", requireUser, upload.single("zip"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "zip file required" });
  if (active >= config.concurrency) return res.status(429).json({ error: "Sandbox busy — try again in a minute." });
  const uid = req.user.id;
  if (userActive.has(uid)) return res.status(429).json({ error: "You already have a run in progress." });
  let meta = {};
  try { meta = JSON.parse(req.body.meta || "{}"); } catch { /* ignore */ }

  active++; userActive.add(uid);
  res.status(200).set({ "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const ac = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ac.abort(); });
  const emit = (e) => { if (!res.writableEnded) res.write(JSON.stringify(e) + "\n"); };
  const ping = setInterval(() => emit({ type: "ping" }), 10_000);
  try {
    await runJob({ emit, zipBuf: req.file.buffer, meta: { projectName: String(meta.projectName || "").slice(0, 120), mode: meta.mode, goals: meta.goals, hints: meta.hints }, signal: ac.signal });
  } catch (e) {
    emit({ type: "log", level: "error", phase: "recovery_report", message: `Backend error: ${String(e.message || e).slice(0, 200)}` });
    emit({ type: "done", status: "failed", iterations: 0, budget: config.maxAttempts, finalLevel: 0, result: "Backend error", environment: {}, model: null, contained: false });
  } finally {
    clearInterval(ping); active--; userActive.delete(uid);
    res.end();
  }
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Zip too large (25 MB max)" });
  res.status(500).json({ error: "Server error" });
});

app.listen(config.port, "127.0.0.1", () => {
  console.log(`archaeologist-api on 127.0.0.1:${config.port} · model ${config.modelPrimary} · inference key ${inferenceConfigured() ? "present" : "MISSING"} · auth ${config.authRequired ? "on" : "OFF"}`);
});
