import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Boxes, Layers, Loader2, ScanSearch, ShieldCheck, Waves } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";

const BULLETS = [
  { icon: ScanSearch, title: "Archaeological scan", body: "Evidence-backed detection of languages, frameworks and the era a project was born in." },
  { icon: Layers, title: "Environment reconstruction", body: "Pinned, reproducible runtimes — never mutable tags." },
  { icon: ShieldCheck, title: "Honest verification", body: "A 0–5 confidence ladder that never claims more than the evidence supports." },
];

export function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email.trim(), password);
        if (error) setError(error);
        else navigate("/", { replace: true });
      } else {
        const { error, needsConfirmation } = await signUp(email.trim(), password, name.trim());
        if (error) setError(error);
        else if (needsConfirmation) setNotice("Check your inbox to confirm your email, then sign in.");
        else navigate("/", { replace: true });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ambient brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-panel p-10 blueprint-grid lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-primary/20 blur-[120px]"
        />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-accent/40 bg-[#072b33] text-accent">
            <Boxes aria-hidden="true" className="h-5 w-5" />
          </div>
          <span className="font-heading text-sm font-semibold tracking-wide text-fg">Software Archaeologist</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-heading text-3xl font-semibold leading-tight text-fg">
            Recover software the environment <span className="text-accent text-glow">left behind.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Upload a broken, abandoned, or inherited codebase. Walk a guided recovery mission: scan, reconstruct,
            build, verify — and export a reproducible bundle.
          </p>
          <ul className="mt-8 space-y-4">
            {BULLETS.map((b) => (
              <li key={b.title} className="flex gap-3">
                <b.icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-medium text-fg">{b.title}</p>
                  <p className="text-xs text-muted">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-[11px] text-faint">
          <Waves aria-hidden="true" className="h-3.5 w-3.5" />
          Contained by design: every recovery runs in a locked-down Docker sandbox on Vultr.
        </p>
      </div>

      {/* form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-[#072b33] text-accent">
              <Boxes aria-hidden="true" className="h-5 w-5" />
            </div>
            <span className="font-heading text-sm font-semibold text-fg">Software Archaeologist</span>
          </div>

          <h2 className="font-heading text-xl font-semibold text-fg">
            {mode === "signin" ? "Welcome back" : "Create your workspace"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {mode === "signin" ? "Sign in to continue your recovery missions." : "Start preserving software worth keeping."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            {mode === "signup" && (
              <Field label="Display name" htmlFor="name" hint="How should we address you?">
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" autoComplete="name" />
              </Field>
            )}
            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Password" htmlFor="password" required hint={mode === "signup" ? "At least 6 characters." : undefined}>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-[#7a2333] bg-[#2c0a12] px-3 py-2 text-xs text-[#ffc2cd]" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-lg border border-[#12564d] bg-[#062a26] px-3 py-2 text-xs text-[#8ff2e0]" role="status">
                {notice}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="cursor-pointer font-medium text-accent hover:underline"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
