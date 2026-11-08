import { spawn } from "node:child_process";

/** Run a command, stream lines, enforce a hard timeout (kills the named container too). */
export function exec(cmd, args, { timeoutMs = 60_000, onLine, containerName, signal } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", timedOut = false, aborted = false, done = false;
    const bufs = { stdout: "", stderr: "" };
    const push = (stream, chunk) => {
      const s = chunk.toString("utf8");
      out += s;
      if (out.length > 400_000) out = out.slice(-200_000);
      if (!onLine) return;
      bufs[stream] += s;
      let i;
      while ((i = bufs[stream].indexOf("\n")) >= 0) {
        onLine(stream, bufs[stream].slice(0, i).replace(/\r$/, ""));
        bufs[stream] = bufs[stream].slice(i + 1);
      }
    };
    p.stdout.on("data", (c) => push("stdout", c));
    p.stderr.on("data", (c) => push("stderr", c));
    const killIt = () => {
      if (containerName) spawn("docker", ["kill", containerName], { stdio: "ignore" });
      try { p.kill("SIGKILL"); } catch { /* already gone */ }
    };
    const timer = setTimeout(() => { timedOut = true; killIt(); }, timeoutMs);
    const onAbort = () => { aborted = true; killIt(); };
    signal?.addEventListener("abort", onAbort);
    const finish = (code, extra = "") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (onLine) for (const s of ["stdout", "stderr"]) if (bufs[s]) onLine(s, bufs[s]);
      resolve({ code, out: out + extra, timedOut, aborted });
    };
    p.on("error", (e) => finish(-1, String(e)));
    p.on("close", (code) => finish(code));
  });
}

export async function dockerAvailable() {
  const r = await exec("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 5000 });
  return r.code === 0;
}
