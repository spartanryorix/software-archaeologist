# Software Archaeologist
### Vultr Agent Rush · Challenge 1: Blast Radius Zero

Revive abandoned legacy software, safely. Upload an old project (a ZIP) and an AI agent works out its era, builds and runs it inside a locked-down sandbox on a **Vultr VM**, repairs what breaks using **Vultr Serverless Inference**, and hands back a fixed project.

- **Live demo:** https://sw-archaeologist.duckdns.org (Sign up with any email)
- **Demo video:** Will be uploaded soon
- **Try these:** `samples/legacy-inventory-py27.zip` and `samples/hostile-agent-py27.zip`

## What it does
1. **Analyze:** reads the file tree and manifests, with the model refining era, blockers and a recovery plan.
2. **Provision:** the model picks an era-correct official Docker image (e.g. `python:2.7`).
3. **Self-check:** a probe container verifies the sandbox limits *before any project code runs*. If a critical probe fails, nothing executes.
4. **Build, run, repair loop:** commands run in throwaway containers. On failure the model diagnoses the error from the logs and proposes a minimal, reversible patch; the agent applies it and retries (up to 4 attempts).
5. **Verify:** a 6-level ladder reports only what the evidence supports (levels 4 and 5 stay unclaimed without tests or a reference output).
6. **Deliver:** "Download fixed project" returns your original ZIP with the patches applied. A recovery package (reports, diffs, environment manifest) is also exportable.

## How it meets the challenge
| Requirement | How |
|---|---|
| Vultr VM backend | Node backend + Docker run on a Vultr Cloud Compute instance |
| Web app on Vultr | The React app is served from the same VM (Caddy, automatic HTTPS) |
| Vultr Serverless Inference | Analysis, environment planning and repair patches (glm-5.3, fallback glm-5.3-flash) |
| Real isolated execution | One Docker container per attempt, real build and run output streamed live |
| Containment | See below |
| Containment moment | `hostile-agent-py27.zip` |

## Architecture
```
Browser (React) ── HTTPS ──► Caddy (Vultr VM)
                               ├─ static app
                               └─ /api ─► Node backend (pm2)
                                            ├─ Vultr Serverless Inference (LLM)
                                            └─ Docker sandbox (1 container / attempt)
Supabase: login and project records only (no code execution there)
```

## Containment (enforced on every container, and probed)
| Control | Setting |
|---|---|
| Identity | non-root user, `--cap-drop ALL`, `no-new-privileges`, read-only root filesystem |
| Build phase | network on (dependency install only) · 1 GB · 1.5 CPU · 256 PIDs · 300 s |
| Run phase | **no network** · 512 MB, no swap · 1 CPU · 128 PIDs · 25 s |
| Secrets | the inference key exists only in the backend process; never mounted or passed to a container |
| Images | official Docker Hub images only |
| Lifecycle | `--rm` containers; the workspace is wiped after every task |
| Untrusted model output | edits are path-validated; commands run only inside the sandbox |
| Fail closed | probe container checks user, capabilities, read-only FS, no network, no secrets, host files hidden before any project code runs |

**The hostile sample** tries to exfiltrate data, read host secrets and SSH keys, plant a cron backdoor, and exhaust memory. The sandbox blocks each attempt and the kernel kills the memory hog (exit 137).

## Demo samples
- `legacy-inventory-py27.zip`: a 2014 Python 2.7 report generator with a nonexistent dependency pin and a data-parsing bug (`"1,250"`). The agent picks `python:2.7`, installs a working version, patches `main.py` after the crash, and reaches verification level 3.
- `hostile-agent-py27.zip`: the containment demo.

## Run it yourself
1. Create a Supabase project; run `supabase/schema.sql` in the SQL editor; turn off email confirmation.
2. Create a Vultr Cloud Compute VM (Ubuntu 24.04), install Docker and Node 22, and create a Serverless Inference key. Save it to `~/.vkey` (chmod 600).
3. Copy the project to the VM and run `bash deploy/setup.sh` (builds the app, starts the backend with pm2, configures Caddy, pre-pulls images). Configuration lives in `deploy/ecosystem.config.cjs` and `.env.production`.

The Supabase URL and publishable key in the repo are public by design; data access is protected by row-level security.

## Honest limits
- The build phase needs internet to install dependencies, so install scripts run with network (but no secrets and capped resources).
- Verification claims only what evidence supports. Without tests or a known-good reference, levels 4 and 5 stay unverified.
- Best on Python and Node projects. Other stacks work only if the model plans them correctly.
- Concurrency is limited (2 jobs at once, 1 per user).

## Stack
React + Vite + TypeScript · Node/Express · Docker · Caddy · Supabase · Vultr Cloud Compute + Serverless Inference
