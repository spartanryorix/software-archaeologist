import { exec } from "./docker.js";
import { config } from "./config.js";
import { OFFICIAL_IMAGE } from "./util.js";

const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;

/** The containment contract. Every container the agent starts gets these limits. */
export const LIMITS = {
  build: { memory: "1g", cpus: "1.5", pids: 256, network: true, timeoutSec: config.buildTimeoutSec },
  run: { memory: "512m", cpus: "1", pids: 128, network: false, timeoutSec: config.runTimeoutSec },
};

export const CONTROLS = [
  { name: "Isolation", value: "One throwaway Docker container per attempt; official Docker Hub images only" },
  { name: "Identity", value: `Non-root user (uid ${uid}), --cap-drop ALL, no-new-privileges, read-only root filesystem` },
  { name: "Build phase", value: "Network allowed for dependency install only · 1 GB RAM · 1.5 CPU · 256 PIDs · 300 s limit" },
  { name: "Run phase", value: "Network NONE · 512 MB RAM (no swap) · 1 CPU · 128 PIDs · 25 s limit" },
  { name: "Secrets", value: "Vultr API key exists only in the backend process; never mounted or passed into a container" },
  { name: "Lifecycle", value: "Containers started with --rm; workspace wiped when the task ends" },
];

function dockerArgs({ phase, name, image, jobDir }) {
  const L = LIMITS[phase];
  return [
    "run", "--rm", "--init", "--name", name,
    "--user", `${uid}:${gid}`,
    "--network", L.network ? "bridge" : "none",
    "--memory", L.memory, "--memory-swap", L.memory, "--cpus", L.cpus, "--pids-limit", String(L.pids),
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--read-only", "--tmpfs", "/tmp:rw,size=64m",
    "--ulimit", "nofile=256:256", "--ulimit", "fsize=104857600:104857600", "--ulimit", "core=0",
    "-v", `${jobDir}:/work`, "-w", "/work/src",
    "-e", "HOME=/work/.home", "-e", "PIP_USER=1", "-e", "PYTHONUSERBASE=/work/.home/.local",
    "-e", "PYTHONDONTWRITEBYTECODE=1", "-e", "PIP_NO_CACHE_DIR=1", "-e", "PIP_DISABLE_PIP_VERSION_CHECK=1",
    "-e", "npm_config_cache=/work/.home/.npm", "-e", "GEM_HOME=/work/.home/gems",
    "-e", "GOCACHE=/work/.home/.gocache", "-e", "GOPATH=/work/.home/go", "-e", "TERM=dumb", "-e", "CI=1",
    image,
  ];
}

export function validImage(image) {
  return typeof image === "string" && OFFICIAL_IMAGE.test(image) && image.length < 80;
}

export async function pullImage(image, onLine) {
  const r = await exec("docker", ["pull", "--quiet", image], { timeoutMs: 300_000, onLine });
  return r.code === 0;
}

export async function imageDigest(image) {
  const r = await exec("docker", ["image", "inspect", "--format", "{{index .RepoDigests 0}}", image], { timeoutMs: 10_000 });
  const m = /@(sha256:[a-f0-9]{64})/.exec(r.out);
  return m ? m[1] : null;
}

/** Run one shell command inside a fresh, locked-down container. */
export function runSandboxed({ phase, image, cmd, jobDir, name, onLine, signal }) {
  const wrapped = `export PATH="/work/.home/.local/bin:/work/.home/bin:$PATH"; ${cmd}`;
  return exec("docker", [...dockerArgs({ phase, name, image, jobDir }), "sh", "-c", wrapped], {
    timeoutMs: LIMITS[phase].timeoutSec * 1000, onLine, containerName: name, signal,
  });
}

const PROBE_SCRIPT = `
echo "PROBE uid=$(id -u)"
echo "PROBE capeff=$(grep CapEff /proc/self/status | awk '{print $2}')"
(touch /etc/.probe 2>/dev/null && echo "PROBE rootfs=writable") || echo "PROBE rootfs=readonly"
(wget -T 3 -q -O /dev/null http://1.1.1.1 2>/dev/null && echo "PROBE network=reachable") || echo "PROBE network=blocked"
echo "PROBE secrets_env=$(env | grep -ciE 'key|token|secret|password')"
(ls /home/deploy /root >/dev/null 2>&1 && echo "PROBE hostfs=visible") || echo "PROBE hostfs=absent"
echo "PROBE mem=$(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo n/a)"
echo "PROBE pids=$(cat /sys/fs/cgroup/pids.max 2>/dev/null || echo n/a)"
`;

/** Evidence, not claims: run a probe container with the RUN-phase limits and report what it saw. */
export async function probeContainment(jobDir, signal) {
  const probeImage = "alpine:3.20";
  if (!(await pullImage(probeImage))) return null;
  const r = await runSandboxed({ phase: "run", image: probeImage, cmd: PROBE_SCRIPT, jobDir, name: `probe-${Date.now()}`, signal });
  const v = {};
  for (const m of r.out.matchAll(/PROBE (\w+)=(.*)/g)) v[m[1]] = m[2].trim();
  if (!Object.keys(v).length) return null;
  const mb = (s) => (/^\d+$/.test(s) ? `${Math.round(Number(s) / 1048576)} MB` : s);
  return [
    { name: "Runs as unprivileged user", pass: v.uid !== "0", detail: `uid ${v.uid}` },
    { name: "All Linux capabilities dropped", pass: /^0+$/.test(v.capeff || "x"), detail: `CapEff=${v.capeff}` },
    { name: "Root filesystem is read-only", pass: v.rootfs === "readonly", detail: `write to /etc → ${v.rootfs === "readonly" ? "denied" : "ALLOWED"}` },
    { name: "Network blocked in run phase", pass: v.network === "blocked", detail: `outbound request → ${v.network === "blocked" ? "blocked" : "REACHED"}` },
    { name: "No secrets in environment", pass: v.secrets_env === "0", detail: `${v.secrets_env} credential-like variables` },
    { name: "Host files not visible", pass: v.hostfs === "absent", detail: `/home/deploy, /root → ${v.hostfs}` },
    { name: "Memory cap enforced", pass: /^\d+$/.test(v.mem || ""), detail: mb(v.mem || "n/a") },
    { name: "Process cap enforced", pass: /^\d+$/.test(v.pids || ""), detail: `${v.pids} PIDs max` },
  ];
}
