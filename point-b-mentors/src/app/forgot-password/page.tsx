"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { Alert, Button, Field, Mark, Spinner } from "@/components/ui";
import { api, errMsg } from "@/lib/api";

export default function ForgotPasswordPage() {
  return <Suspense fallback={null}><Forgot /></Suspense>;
}

function Forgot() {
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api("/auth/forgot-password", { body: { email: email.trim() } }); setSent(true); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <AuthCard eyebrow="Reset password" title={<>Check your <Mark color="sky">inbox</Mark></>}>
        <p className="text-sm leading-relaxed text-ink-soft">
          If an account exists for <span className="font-medium text-ink">{email}</span>, we&rsquo;ve sent a link to choose a new password. It works once and expires in 1 hour.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">Nothing there after a few minutes? Check your spam folder, or try again.</p>
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" onClick={() => setSent(false)}>Try again</Button>
          <Button href="/sign-in">Back to sign in</Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard eyebrow="Reset password" title={<>Forgot your <Mark color="sky">password?</Mark></>} subtitle="Enter the email you signed up with and we'll send you a link to choose a new one.">
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email"><input className="input" type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" disabled={busy || !email.trim()}>{busy ? <Spinner /> : "Send reset link"}</Button>
        <p className="text-center text-sm text-ink-soft">Remembered it? <Link href="/sign-in" className="font-medium text-ink underline underline-offset-4">Sign in</Link></p>
      </form>
    </AuthCard>
  );
}
