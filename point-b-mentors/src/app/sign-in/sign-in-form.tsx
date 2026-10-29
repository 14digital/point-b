"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Container, Field, Spinner } from "@/components/ui";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/api";

const age = (dob: string) => (Date.now() - new Date(dob).getTime()) / (365.25 * 86400_000);

export function SignInForm() {
  const { login, register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">(params.get("mode") === "register" ? "up" : "in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", email: "", password: "", dob: "", guardianEmail: "" });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const isMinor = !!f.dob && age(f.dob) < 18;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const user = mode === "in"
        ? await login(f.email, f.password)
        : await register({
            name: f.name, email: f.email, password: f.password,
            ...(f.dob ? { dateOfBirth: f.dob } : {}),
            ...(isMinor ? { guardianEmail: f.guardianEmail } : {}),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
      const next = params.get("next");
      router.push(next && next.startsWith("/") ? next : HOME_BY_ROLE[user.role]);
    } catch (err) {
      setError(errMsg(err)); setBusy(false);
    }
  }

  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto grid max-w-4xl gap-12 lg:grid-cols-[1fr_420px] lg:items-center">
        <div className="hidden lg:block">
          <p className="text-sm font-medium text-brass-dark">POINT B Mentors</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.04] text-ink sm:text-6xl">
            30 minutes with someone who&rsquo;s been there.
          </h1>
          <p className="mt-5 max-w-sm leading-relaxed text-ink-soft">
            Sign in to manage your sessions, or create a free account to book your first conversation. Mentors sign in with
            the details sent when their application is approved.
          </p>
        </div>

        <div className="rounded-3xl border border-line bg-white p-6 sm:p-8">
          <div className="grid grid-cols-2 rounded-full bg-paper-dim p-1 text-sm font-medium">
            {(["in", "up"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                className={`rounded-full py-2 transition-colors ${mode === m ? "bg-white text-ink shadow-sm" : "text-ink-soft"}`}>
                {m === "in" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "up" && (
              <Field label="Full name"><input className="input" required autoComplete="name" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
            )}
            <Field label="Email"><input className="input" type="email" required autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Password" hint={mode === "up" ? "At least 8 characters." : undefined}>
              <input className="input" type="password" required minLength={mode === "up" ? 8 : 1} autoComplete={mode === "in" ? "current-password" : "new-password"} value={f.password} onChange={(e) => set("password", e.target.value)} />
            </Field>
            {mode === "in" && <div className="-mt-2 text-right"><Link href={`/forgot-password${f.email ? `?email=${encodeURIComponent(f.email)}` : ""}`} className="text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Forgot password?</Link></div>}
            {mode === "up" && (
              <>
                <Field label="Date of birth (optional)" hint="Students under 18 need a parent or guardian to give consent before booking.">
                  <input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={f.dob} onChange={(e) => set("dob", e.target.value)} />
                </Field>
                {isMinor && (
                  <Field label="Parent or guardian email" hint="We will email them to ask for consent.">
                    <input className="input" type="email" required value={f.guardianEmail} onChange={(e) => set("guardianEmail", e.target.value)} />
                  </Field>
                )}
              </>
            )}
            {error && <Alert>{error}</Alert>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Spinner /> : mode === "in" ? "Sign in" : "Create account"}
            </Button>
          </form>
          {mode === "up" && (
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              By creating an account you agree to our <a className="underline" href="/legal?tab=terms">terms</a> and{" "}
              <a className="underline" href="/legal?tab=privacy">privacy policy</a>.
            </p>
          )}
        </div>
      </div>
    </Container>
  );
}
