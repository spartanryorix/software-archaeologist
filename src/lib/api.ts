import { supabase } from "./supabase";

/** Same-origin by default: Caddy serves the app and proxies /api to the Vultr backend. */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface BackendHealth {
  ok: boolean;
  docker: boolean;
  inference: boolean;
  model: string;
  activeJobs: number;
}

export async function fetchHealth(): Promise<BackendHealth | null> {
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as BackendHealth;
    return typeof j.ok === "boolean" ? j : null;
  } catch {
    return null;
  }
}

export interface ContainmentProof {
  controls: { name: string; value: string }[];
  probes: { name: string; pass: boolean; detail: string }[];
  base_image?: string;
}

/** Read a newline-delimited JSON stream, calling onEvent for each complete line. */
export async function readNdjson(res: Response, onEvent: (e: Record<string, unknown>) => void): Promise<void> {
  if (!res.body) throw new Error("No response stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* ignore a malformed line */
      }
    }
  }
}
