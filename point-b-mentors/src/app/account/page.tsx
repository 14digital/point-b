"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Container, Field, Mark, Skeleton, Spinner } from "@/components/ui";
import { Panel } from "@/components/dashboard";
import { MobileField } from "@/components/mobile-field";
import { isValidPhone, parsePhone, toE164, type CountryCode } from "@/components/phone-input";
import { api, errMsg, setToken } from "@/lib/api";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";

type Msg = { tone: "success" | "error"; text: string } | null;

export default function AccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/sign-in?next=/account"); }, [loading, user, router]);
  if (loading || !user) return <Container className="py-12"><Skeleton className="h-10 w-64" /><Skeleton className="mt-6 h-72 w-full rounded-3xl" /></Container>;
  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <a href={HOME_BY_ROLE[user.role]} className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline">← Back to dashboard</a>
        <h1 className="mt-4 font-display text-5xl leading-tight text-ink">Your <Mark color="sky">account</Mark></h1>
        <div className="mt-8 space-y-6">
          <Details user={user} />
          {user.role === "STUDENT" && <Mobile user={user} />}
          <Password />
        </div>
      </div>
    </Container>
  );
}

function Details({ user }: { user: SessionUser }) {
  const { refresh } = useAuth();
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const zones = useMemo(() => { const all = Intl.supportedValuesOf("timeZone"); return all.includes(user.timezone) ? all : [user.timezone, ...all]; }, [user.timezone]);
  const nameLocked = user.role === "MENTOR";
  const dirty = name.trim() !== user.name || timezone !== user.timezone;

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api("/auth/me", { method: "PATCH", body: { ...(!nameLocked && name.trim() !== user.name ? { name: name.trim() } : {}), ...(timezone !== user.timezone ? { timezone } : {}) } });
      await refresh(); setMsg({ tone: "success", text: "Saved." });
    } catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(false); }
  }

  return (
    <Panel title="Your details">
      <div className="space-y-5">
        <Field label="Full name" hint={nameLocked ? "Shown on your public profile. Contact support to change it." : undefined}><input className="input disabled:bg-paper disabled:text-ink-soft" disabled={nameLocked} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" hint="Contact support to change the email on your account."><input className="input bg-paper text-ink-soft" disabled value={user.email} /></Field>
        <Field label="Timezone" hint="Used for the times in your emails and WhatsApp reminders."><select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select></Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button disabled={busy || !dirty || name.trim().length < 2} onClick={save}>{busy ? <Spinner /> : "Save changes"}</Button>
      </div>
    </Panel>
  );
}

function Mobile({ user }: { user: SessionUser }) {
  const { refresh } = useAuth();
  const start = useMemo(() => (user.phone ? parsePhone(user.phone) : { iso: "PK" as CountryCode, national: "" }), [user.phone]);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [iso, setIso] = useState<CountryCode>(start.iso);
  const [whatsapp, setWhatsapp] = useState(!!user.whatsappAlerts);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const dirty = toE164(phone) !== (user.phone ?? "") || whatsapp !== !!user.whatsappAlerts;

  async function save() {
    if (!isValidPhone(phone)) { setErr("That number doesn't look right. Check the country code and digits."); return; }
    setBusy(true); setErr(null); setMsg(null);
    try { await api("/auth/me/contact", { method: "PATCH", body: { phone, whatsappAlerts: whatsapp } }); await refresh(); setMsg({ tone: "success", text: "Saved." }); }
    catch (e) { setMsg({ tone: "error", text: errMsg(e) }); } finally { setBusy(false); }
  }

  return (
    <Panel title="Mobile and alerts">
      <div className="space-y-5">
        <MobileField id="account-mobile" value={phone} onChange={(v) => { setPhone(v); setErr(null); setMsg(null); }} iso={iso} onIso={setIso} whatsapp={whatsapp} onWhatsapp={(v) => { setWhatsapp(v); setMsg(null); }} error={err} />
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button disabled={busy || !dirty} onClick={save}>{busy ? <Spinner /> : "Save changes"}</Button>
      </div>
    </Panel>
  );
}

function Password() {
  const { refresh } = useAuth();
  const empty = { currentPassword: "", newPassword: "", repeat: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const mismatch = !!f.repeat && f.repeat !== f.newPassword;
  const ready = !!f.currentPassword && f.newPassword.length >= 8 && f.repeat === f.newPassword;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ accessToken: string }>("/auth/change-password", { body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      // Other devices are signed out; this one carries on with a new session.
      setToken(r.accessToken); await refresh();
      setF(empty); setMsg({ tone: "success", text: "Password changed. Any other devices have been signed out." });
    } catch (err) { setMsg({ tone: "error", text: errMsg(err) }); } finally { setBusy(false); }
  }

  return (
    <Panel title="Password">
      <form className="space-y-5" onSubmit={save}>
        <Field label="Current password"><input className="input" type="password" required autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" hint="At least 8 characters"><input className="input" type="password" required minLength={8} autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
          <Field label="Repeat new password" hint={mismatch ? "These don't match yet" : undefined}><input className="input" type="password" required autoComplete="new-password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} /></Field>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" disabled={busy || !ready}>{busy ? <Spinner /> : "Change password"}</Button>
      </form>
    </Panel>
  );
}
