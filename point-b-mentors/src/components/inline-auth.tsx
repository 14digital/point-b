"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Field, Spinner } from "./ui";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/api";
import { localTz } from "@/lib/format";
import { MobileField } from "./mobile-field";
import { isPakistaniPhone, type CountryCode } from "./phone-input";

/** Create an account or sign in without leaving the page, e.g. inside the enrolment window. */
export function InlineAuth({ onDone }: { onDone: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"up" | "in">("up");
  const [f, setF] = useState({ name: "", email: "", password: "", phone: "" });
  const [phoneIso, setPhoneIso] = useState<CountryCode>("PK");
  const [whatsapp, setWhatsapp] = useState(true);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "up" && !isPakistaniPhone(f.phone)) { setPhoneError(f.phone ? "Please enter a Pakistani mobile number, e.g. 300 1234567." : "Please add your mobile number."); document.getElementById("inline-mobile")?.focus(); return; }
    setBusy(true); setError(null);
    try {
      if (mode === "in") await login(f.email, f.password);
      else await register({ ...f, whatsappAlerts: whatsapp, timezone: localTz() });
      onDone();
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-ink-soft">{mode === "up" ? "Create a free account to enrol. It takes a few seconds." : "Welcome back. Sign in to continue."}</p>
      {mode === "up" && <Field label="Full name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>}
      <Field label="Email"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
      {mode === "up" && <MobileField id="inline-mobile" value={f.phone} onChange={(v) => { setF((s) => ({ ...s, phone: v })); setPhoneError(null); }} iso={phoneIso} onIso={setPhoneIso} whatsapp={whatsapp} onWhatsapp={setWhatsapp} error={phoneError} />}
      <Field label="Password" hint={mode === "up" ? "At least 8 characters" : undefined}><input className="input" type="password" required minLength={mode === "up" ? 8 : 1} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === "up" ? "new-password" : "current-password"} /></Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? <Spinner /> : mode === "up" ? "Create account & continue" : "Sign in & continue"}</Button>
      <button type="button" className="w-full text-center text-sm text-ink-soft underline underline-offset-4" onClick={() => { setMode(mode === "up" ? "in" : "up"); setError(null); }}>
        {mode === "up" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
      <p className="text-center text-xs text-ink-soft">Under 18? Register on the <Link href="/sign-in?mode=register" className="underline">sign-up page</Link> so we can ask a parent or guardian for consent.</p>
    </form>
  );
}

