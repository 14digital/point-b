"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { Alert, Button, Field, Mark, Skeleton, Spinner } from "@/components/ui";
import { api, errMsg, setToken } from "@/lib/api";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><Reset /></Suspense>;
}

/** Strength hint only; the API enforces the 8-character minimum. */
function strength(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return s;
}
const LEVELS = [["Too short", "bg-rust/60"], ["Weak", "bg-rust/60"], ["Fair", "bg-brass"], ["Good", "bg-forest/70"], ["Strong", "bg-forest"]] as const;

function Reset() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const welcome = params.get("welcome") === "1";
  const router = useRouter();
  const { refresh } = useAuth();
  const [info, setInfo] = useState<{ email: string; name: string; firstTime: boolean } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(token ? null : "This link is incomplete. Please use the button in your email, or request a new link.");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<{ email: string; name: string; firstTime: boolean }>(`/auth/password-link/${encodeURIComponent(token)}`)
      .then((i) => !cancelled && setInfo(i))
      .catch((e) => !cancelled && setLinkError(errMsg(e)));
    return () => { cancelled = true; };
  }, [token]);

  const s = strength(pw);
  const mismatch = pw2.length > 0 && pw !== pw2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8 || pw !== pw2) return;
    setBusy(true); setError(null);
    try {
      const res = await api<{ accessToken: string; user: { role: Role } }>("/auth/reset-password", { body: { token, password: pw } });
      setToken(res.accessToken);
      await refresh();
      router.replace(HOME_BY_ROLE[res.user.role]);
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  }

  if (linkError) {
    return (
      <AuthCard eyebrow="Password link" title="This link can't be used">
        <p className="text-sm leading-relaxed text-ink-soft">{linkError}</p>
        <div className="mt-6 flex gap-2">
          <Button href="/forgot-password">Request a new link</Button>
          <Button href="/sign-in" variant="secondary">Sign in</Button>
        </div>
      </AuthCard>
    );
  }
  if (!info) return <AuthCard eyebrow="Password link" title="Just a moment…"><Skeleton className="h-40" /></AuthCard>;

  const setup = welcome || info.firstTime;
  return (
    <AuthCard
      eyebrow={setup ? "Welcome to POINT B Mentors" : "Reset password"}
      title={setup ? <>Set your <Mark color="mint">password</Mark></> : <>Choose a new <Mark color="sky">password</Mark></>}
      subtitle={setup ? `Hi ${info.name.split(" ")[0]}, choose a password to finish setting up your mentor account. You'll be signed in straight away.` : "Choose a new password. You'll be signed in straight away, and any other devices will be signed out."}
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Account"><input className="input bg-paper text-ink-soft" value={info.email} disabled readOnly /></Field>
        <div>
          <Field label="New password">
            <div className="relative">
              <input className="input pr-16" type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-soft hover:text-ink">{show ? "Hide" : "Show"}</button>
            </div>
          </Field>
          {pw && (
            <div className="mt-2">
              <div className="flex gap-1" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < s ? LEVELS[s][1] : "bg-paper-dim"}`} />)}</div>
              <p className="mt-1 text-xs text-ink-soft">{pw.length < 8 ? `At least 8 characters (${8 - pw.length} more)` : LEVELS[s][0]}</p>
            </div>
          )}
        </div>
        <Field label="Confirm password">
          <input className={`input ${mismatch ? "border-rust/60" : ""}`} type={show ? "text" : "password"} required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        {mismatch && <p className="-mt-3 text-xs text-rust">Passwords don&rsquo;t match.</p>}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" disabled={busy || pw.length < 8 || pw !== pw2}>{busy ? <Spinner /> : setup ? "Set password and continue" : "Save new password"}</Button>
      </form>
    </AuthCard>
  );
}
