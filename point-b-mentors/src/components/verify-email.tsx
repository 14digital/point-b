"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Field, Spinner } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const WAIT_SECONDS = 30;

/** Enter the 6-digit code from the sign-up email, ask for another, or fix a mistyped address. */
export function VerifyEmail({ onDone, focus = true }: { onDone?: () => void; focus?: boolean }) {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [wait, setWait] = useState(WAIT_SECONDS);
  const [changing, setChanging] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNote(null);
    try { await api("/auth/verify-email", { body: { code } }); await refresh(); onDone?.(); }
    catch (err) { setError(errMsg(err)); setBusy(false); }
  }

  async function resend(newEmail?: string) {
    setBusy(true); setError(null); setNote(null);
    try {
      await api("/auth/verify-email/resend", { body: newEmail ? { email: newEmail } : {} });
      await refresh();
      setCode(""); setChanging(false); setWait(WAIT_SECONDS);
      setNote(newEmail ? `We sent a new code to ${newEmail}.` : "We sent you a new code.");
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  if (changing) {
    return (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); resend(email.trim()); }}>
        <Field label="Your email address"><input className="input" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || wait > 0}>{busy ? <Spinner /> : wait > 0 ? `Send code in ${wait}s` : "Send code"}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setChanging(false); setError(null); }}>Cancel</Button>
        </div>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={confirm}>
      <p className="text-sm leading-relaxed text-ink-soft">We sent a 6-digit code to <span className="break-all font-medium text-ink">{user?.email}</span>. It can take a minute to arrive, so check your spam folder too.</p>
      <Field label="Confirmation code">
        <input className="input text-center font-mono text-xl tracking-[0.3em]" autoFocus={focus} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </Field>
      {error && <Alert>{error}</Alert>}
      {note && <Alert tone="success">{note}</Alert>}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy ? <Spinner /> : "Confirm email"}</Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" disabled={busy || wait > 0} onClick={() => resend()} className="font-medium text-ink underline-offset-4 hover:underline disabled:text-ink-soft disabled:no-underline">{wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}</button>
        <button type="button" disabled={busy} onClick={() => { setEmail(user?.email ?? ""); setChanging(true); setError(null); setNote(null); }} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">Wrong address?</button>
      </div>
    </form>
  );
}
