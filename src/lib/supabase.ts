import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined));

/**
 * Configure with VITE_SUPABASE_URL plus either VITE_SUPABASE_ANON_KEY or
 * VITE_SUPABASE_PUBLISHABLE_KEY (see .env.production). Both are PUBLISHABLE —
 * safe to ship to the browser.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "public-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Implicit flow so sign-in works inside the ephemeral preview iframe.
    flowType: "implicit",
  },
});

export const ARTIFACTS_BUCKET = "artifacts";
export const EXPORTS_BUCKET = "exports";
