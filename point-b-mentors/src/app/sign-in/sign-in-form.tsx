"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Container, Field, Mark, Spinner } from "@/components/ui";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/api";

const age = (dob: string) => (Date.now() - new Date(dob).getTime()) / (365.25 * 86400_000);

export function SignInForm() {
  const { login, register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">(params.get("mode") === "register" ? "up" : "in");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
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

  const signingIn = mode === "in";

  return (
    <div className="relative overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute -left-40 top-10 h-[420px] w-[420px] rounded-full bg-sky/50 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -right-40 bottom-0 h-[380px] w-[380px] rounded-full bg-peach/40 blur-[120px]" />
      <Container className="relative py-12 sm:py-20">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-stretch lg:gap-12">
          {/* Brand panel */}
          <aside className="animate-rise relative hidden overflow-hidden rounded-[2rem] bg-ink p-10 text-white lg:flex lg:flex-col">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brass/30 blur-[90px]" />
            <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-sky/20 blur-[90px]" />
            <p className="relative text-sm font-medium text-white/60">POINT B Mentors</p>
            <h1 className="relative mt-4 font-display text-[3.4rem] leading-[1.02]">
              30 minutes with someone who&rsquo;s <span className="mark bg-white/15">been there.</span>
            </h1>
            <ul className="relative mt-10 space-y-4">
              {[
                ["Screened, interviewed mentors", "Every profile is reviewed by our team before it goes live."],
                ["Book straight into their calendar", "Private 1:1 calls or smaller-price group sessions."],
                ["Free rescheduling", "Move your session up to 2 days before it starts."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="#e9c880" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span><span className="block text-sm font-medium">{t}</span><span className="text-sm text-white/55">{d}</span></span>
                </li>
              ))}
            </ul>
            <div className="relative mt-auto pt-12">
              <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-4">
                <div className="flex -space-x-2">
                  {["#bfe6f4", "#cdeec3", "#f7c9a2", "#ddd3f5"].map((c, i) => <span key={c} className="h-8 w-8 rounded-full ring-2 ring-ink" style={{ backgroundColor: c, zIndex: 4 - i }} />)}
                </div>
                <p className="text-xs leading-relaxed text-white/65">Mentors from Pakistan and abroad, in product, finance, medicine, engineering and more.</p>
              </div>
            </div>
          </aside>

          {/* Form */}
          <div className="animate-rise flex flex-col justify-center" style={{ ["--rise-delay" as string]: "100ms" }}>
            <div className="rounded-[2rem] bg-white p-6 shadow-[0_30px_80px_-45px_rgba(17,17,17,0.35)] ring-1 ring-ink/5 sm:p-9">
              <p className="text-sm font-medium text-brass-dark">{signingIn ? "Welcome back" : "Join POINT B"}</p>
              <h2 className="mt-2 font-display text-4xl leading-tight text-ink">{signingIn ? <>Sign in to <Mark color="sky">continue</Mark></> : <>Create your <Mark color="mint">account</Mark></>}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {signingIn ? "Manage your sessions, join calls and pick up where you left off." : "It's free, and takes less than a minute. You only pay when you book a session."}
              </p>

              <div className="mt-7 grid grid-cols-2 rounded-full bg-paper p-1 text-sm font-medium" role="tablist">
                {(["in", "up"] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }}
                    className={`rounded-full py-2.5 transition-all ${mode === m ? "bg-white text-ink shadow-sm ring-1 ring-ink/5" : "text-ink-soft hover:text-ink"}`}>
                    {m === "in" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="mt-7 space-y-5">
                {mode === "up" && (
                  <Field label="Full name"><input className="input" required autoComplete="name" placeholder="Your name" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
                )}
                <Field label="Email"><input className="input" type="email" required autoComplete="email" placeholder="you@example.com" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <label htmlFor="password" className="text-sm font-medium text-ink">Password</label>
                    {signingIn && <Link href={`/forgot-password${f.email ? `?email=${encodeURIComponent(f.email)}` : ""}`} className="text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Forgot password?</Link>}
                  </div>
                  <div className="relative">
                    <input id="password" className="input pr-12" type={show ? "text" : "password"} required minLength={signingIn ? 1 : 8}
                      autoComplete={signingIn ? "current-password" : "new-password"} placeholder={signingIn ? "Your password" : "At least 8 characters"}
                      value={f.password} onChange={(e) => set("password", e.target.value)} />
                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-paper hover:text-ink">
                      {show
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.6M6.1 6.1C4.2 7.4 2.8 9.4 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3" /></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" /></svg>}
                    </button>
                  </div>
                </div>
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
                  {busy ? <Spinner /> : signingIn ? "Sign in" : "Create account"}
                </Button>
              </form>

              {signingIn ? (
                <p className="mt-6 rounded-2xl bg-paper px-4 py-3 text-xs leading-relaxed text-ink-soft">
                  <span className="font-medium text-ink">Approved mentor?</span> Use the password link in your approval email first, then sign in here.
                </p>
              ) : (
                <p className="mt-6 text-center text-xs leading-relaxed text-ink-soft">
                  By creating an account you agree to our <Link className="underline underline-offset-2 hover:text-ink" href="/legal?tab=terms">terms</Link> and{" "}
                  <Link className="underline underline-offset-2 hover:text-ink" href="/legal?tab=privacy">privacy policy</Link>.
                </p>
              )}
            </div>
            <p className="mt-6 text-center text-sm text-ink-soft">
              {signingIn ? <>New to POINT B? <button type="button" onClick={() => { setMode("up"); setError(null); }} className="font-medium text-ink underline underline-offset-4">Create a free account</button></>
                : <>Already have an account? <button type="button" onClick={() => { setMode("in"); setError(null); }} className="font-medium text-ink underline underline-offset-4">Sign in</button></>}
            </p>
          </div>
        </div>
      </Container>
    </div>
  );
}
