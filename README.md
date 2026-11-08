# Software Archaeologist — Vultr Agent Rush · Blast Radius Zero

Drop in an abandoned legacy project (a ZIP). The agent works out its era, picks an era-correct Docker image,
builds and runs it **inside a locked-down sandbox on a Vultr VM**, and when something fails it asks
**Vultr Serverless Inference** for a minimal fix, applies it as a reversible patch, and retries.

## Architecture
```
Browser (React app, served by Caddy on the Vultr VM)
   └─ /api  ──► Node backend on the same VM (pm2)
                 ├─ Vultr Serverless Inference (OpenAI-compatible): analysis, environment plan, repair patches
                 └─ Docker sandbox: one throwaway container per attempt
Supabase: login + project records only (no code execution there)
```
Vultr services used: **Cloud Compute VM** (app, backend, Docker), **Serverless Inference** (glm-5.3, fallback glm-5.3-flash).

## Containment (every container, enforced and *probed*)
| Control | Setting |
|---|---|
| Identity | non-root uid, `--cap-drop ALL`, `no-new-privileges`, read-only root FS |
| Build phase | network on (dependency install only) · 1 GB · 1.5 CPU · 256 PIDs · 300 s |
| Run phase | **network none** · 512 MB, no swap · 1 CPU · 128 PIDs · 25 s |
| Secrets | the inference key lives only in the backend process; never mounted or passed in |
| Images | official Docker Hub images only (no registry/org prefix) |
| Lifecycle | `--rm` containers; workspace wiped after every task |
| Untrusted model output | file edits are path-validated; commands only ever run inside the sandbox |
| Fail closed | before any project code runs, a probe container checks user, capabilities, read-only FS, no network, no secrets, host files hidden; if any critical probe fails, nothing executes |

The UI shows that evidence in the **Containment proof** panel. `samples/hostile-agent-py27.zip` tries to exfiltrate data,
read host secrets, plant a cron backdoor and exhaust memory; the sandbox blocks all of it.

## Honest limits
- The build phase needs internet to install dependencies, so pip/npm install scripts run with network (but no secrets, capped resources).
- Verification claims only what evidence supports; level 5 (behaviour equivalence) is never claimed without a known-good reference.
- Login/data live in Supabase; the sandbox runner lives only on the Vultr VM.

## Demo samples (`samples/`)
- `legacy-inventory-py27.zip` — Python 2.7 report generator with a bad dependency pin **and** a data-parsing bug: two real failures, two AI patches.
- `hostile-agent-py27.zip` — the containment demo.

## Deploy
See `deploy/setup.sh` and `supabase/schema.sql`.
