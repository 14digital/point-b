"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Alert, Badge, Button, Skeleton, Spinner, pastelFor } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { api, errMsg } from "@/lib/api";
import { fmtDay, initials } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type StaffRole = "OWNER" | "OPERATIONS" | "FINANCE";
interface Member { id: string; name: string; email: string; staffRole: StaffRole; isActive: boolean; twoFactor: boolean; invitePending: boolean; createdAt: string; lastActionAt: string | null }

export const ROLE_INFO: Record<StaffRole, { label: string; text: string; tone: string }> = {
  OWNER: { label: "Owner", text: "Everything, including pricing, the team and erasing accounts.", tone: "bg-lilac" },
  OPERATIONS: { label: "Operations", text: "Applications, mentors, bookings, students, reviews and support.", tone: "bg-sky" },
  FINANCE: { label: "Finance", text: "Payments to verify, mentor payouts, exports and bookings.", tone: "bg-mint" },
};

/** Owners invite people to the admin, choose what they can do, and remove access. */
export function TeamSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const team = useApi<Member[]>("/admin/team");
  const [invite, setInvite] = useState<{ name: string; email: string; staffRole: StaffRole } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: "remove" | "reset" } | null>(null);

  async function run(key: string, fn: () => Promise<Member[]>, msg: string) {
    setBusy(key);
    try { team.setData(await fn()); toast(msg); setConfirm(null); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(null); }
  }

  if (team.loading) return <Skeleton className="h-48 rounded-3xl" />;
  if (team.error) return <Alert>{team.error}</Alert>;
  const active = (team.data ?? []).filter((m) => m.isActive);
  const withoutTwoStep = active.filter((m) => !m.twoFactor).length;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
        <ul className="divide-y divide-line">{active.map((m) => (
          <li key={m.id} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium text-ink" style={{ backgroundColor: pastelFor(m.name) }}>{initials(m.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">{m.name}{m.id === user?.id && <span className="text-xs font-normal text-ink-soft">(you)</span>}{m.invitePending && <Badge tone="brass">Invite sent</Badge>}</p>
                <p className="truncate text-xs text-ink-soft">{m.email} · {m.lastActionAt ? `last active ${fmtDay(m.lastActionAt).replace(/^\w+, /, "")}` : `added ${fmtDay(m.createdAt).replace(/^\w+, /, "")}`}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${m.twoFactor ? "bg-mint text-forest" : "bg-paper text-ink-soft"}`}>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.7" /></svg>
                {m.twoFactor ? "Two-step on" : "Two-step off"}
              </span>
              {m.id === user?.id ? <span className={`rounded-full px-3 py-1.5 text-xs font-medium text-ink ${ROLE_INFO[m.staffRole].tone}`}>{ROLE_INFO[m.staffRole].label}</span> : (
                <select className="input py-1.5 text-sm" style={{ width: "auto" }} value={m.staffRole} disabled={!!busy} aria-label={`Role for ${m.name}`}
                  onChange={(e) => run(`role-${m.id}`, () => api<Member[]>(`/admin/team/${m.id}`, { method: "PATCH", body: { staffRole: e.target.value } }), `${m.name.split(" ")[0]} is now ${ROLE_INFO[e.target.value as StaffRole].label}.`)}>
                  {(Object.keys(ROLE_INFO) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
                </select>
              )}
            </div>
            {m.id !== user?.id && (
              confirm?.id === m.id ? (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-2xl bg-paper px-3 py-2.5 text-sm">
                  <span className="mr-auto text-ink">{confirm.kind === "remove" ? `Remove ${m.name.split(" ")[0]}'s admin access? They're signed out straight away.` : `Turn off ${m.name.split(" ")[0]}'s two-step sign-in, for a lost phone? They can set it up again after signing in.`}</span>
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirm(null)}>Cancel</Button>
                  <Button size="sm" variant="danger" disabled={!!busy} onClick={() => confirm.kind === "remove"
                    ? run(`remove-${m.id}`, () => api<Member[]>(`/admin/team/${m.id}`, { method: "DELETE" }), `${m.name} no longer has admin access.`)
                    : run(`reset-${m.id}`, () => api<Member[]>(`/admin/team/${m.id}/reset-two-step`, { body: {} }), "Two-step sign-in turned off for them.")}>{busy ? <Spinner /> : confirm.kind === "remove" ? "Remove access" : "Turn off"}</Button>
                </div>
              ) : (
                <div className="mt-2 flex justify-end gap-3 text-xs">
                  {m.twoFactor && <button type="button" onClick={() => setConfirm({ id: m.id, kind: "reset" })} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">Reset two-step</button>}
                  <button type="button" onClick={() => setConfirm({ id: m.id, kind: "remove" })} className="text-ink-soft underline-offset-4 hover:text-rust hover:underline">Remove access</button>
                </div>
              )
            )}
          </li>
        ))}</ul>
        {invite ? (
          <div className="space-y-3 border-t border-line bg-paper/50 p-4 sm:p-5">
            <p className="text-sm font-medium text-ink">Invite someone</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input bg-white" placeholder="Full name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} aria-label="Full name" />
              <input className="input bg-white" type="email" placeholder="Work email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} aria-label="Email" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Role">
              {(Object.keys(ROLE_INFO) as StaffRole[]).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={invite.staffRole === r} onClick={() => setInvite({ ...invite, staffRole: r })} className={`rounded-2xl p-3 text-left text-sm transition-colors ${invite.staffRole === r ? "bg-white ring-2 ring-ink" : "bg-white ring-1 ring-line hover:ring-ink/40"}`}>
                  <span className="font-medium text-ink">{ROLE_INFO[r].label}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">{ROLE_INFO[r].text}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={busy === "invite"} onClick={() => setInvite(null)}>Cancel</Button>
              <Button size="sm" disabled={busy === "invite" || invite.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(invite.email)} onClick={() => run("invite", () => api<Member[]>("/admin/team", { body: invite }), `Invite emailed to ${invite.email}.`).then(() => setInvite(null))}>{busy === "invite" ? <Spinner /> : "Send invite"}</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 border-t border-line p-4 sm:p-5">
            <p className="text-xs text-ink-soft">{withoutTwoStep ? `${withoutTwoStep} of ${active.length} haven't turned on two-step sign-in.` : "Everyone on the team uses two-step sign-in."}</p>
            <Button size="sm" onClick={() => setInvite({ name: "", email: "", staffRole: "OPERATIONS" })}>Invite someone</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Each admin's own two-step sign-in: set up with an authenticator app, backup codes, or turn it off. */
export function SecuritySettings() {
  const toast = useToast();
  const { refresh } = useAuth();
  const status = useApi<{ enabled: boolean; enabledAt: string | null; backupCodesLeft: number }>("/auth/2fa");
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<null | "disable" | "codes">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setup) return;
    let alive = true;
    QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 360, color: { dark: "#111111", light: "#ffffff" } }).then((u) => alive && setQr(u)).catch(() => undefined);
    return () => { alive = false; };
  }, [setup]);

  async function go(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  if (status.loading) return <Skeleton className="h-40 rounded-3xl" />;
  const s = status.data;

  if (codes) return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
      <p className="font-display text-2xl text-ink">Save your backup codes</p>
      <p className="mt-1 text-sm text-ink-soft">Each code works once, if you can&rsquo;t use your phone. Keep them somewhere safe, like a password manager. You won&rsquo;t see them again.</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-paper p-4 font-mono text-sm text-ink sm:grid-cols-5">{codes.map((c) => <li key={c} className="rounded-lg bg-white px-2 py-1.5 text-center ring-1 ring-line">{c}</li>)}</ul>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(codes.join("\n")).then(() => toast("Backup codes copied.")).catch(() => undefined); }}>Copy codes</Button>
        <Button size="sm" onClick={() => { setCodes(null); status.reload(); refresh(); }}>I&rsquo;ve saved them</Button>
      </div>
    </div>
  );

  if (setup) return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
      <p className="font-display text-2xl text-ink">Set up two-step sign-in</p>
      <div className="mt-4 grid gap-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start">
        <div className="mx-auto w-44 rounded-2xl bg-white p-2 ring-1 ring-line sm:mx-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr ? <img src={qr} alt="QR code for your authenticator app" className="aspect-square w-full" /> : <Skeleton className="aspect-square w-full" />}
        </div>
        <ol className="space-y-3 text-sm text-ink-soft">
          <li><span className="font-medium text-ink">1.</span> Open an authenticator app: Google Authenticator, Microsoft Authenticator, 1Password or Authy.</li>
          <li><span className="font-medium text-ink">2.</span> Scan the code. Can&rsquo;t scan? Enter this key: <span className="mt-1 block break-all rounded-lg bg-paper px-2 py-1 font-mono text-xs text-ink">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</span></li>
          <li><span className="font-medium text-ink">3.</span> Enter the 6-digit code it shows.</li>
        </ol>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input className="input w-40 text-center font-mono text-lg tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" aria-label="6-digit code" />
        <Button disabled={busy || code.length !== 6} onClick={() => go(async () => { const r = await api<{ recoveryCodes: string[] }>("/auth/2fa/enable", { body: { code } }); setSetup(null); setCode(""); setCodes(r.recoveryCodes); toast("Two-step sign-in is on."); })}>{busy ? <Spinner /> : "Turn on"}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { setSetup(null); setCode(""); setError(null); }}>Cancel</Button>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </div>
  );

  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-ink">Two-step sign-in <Badge tone={s?.enabled ? "forest" : "brass"}>{s?.enabled ? "On" : "Off"}</Badge></p>
          <p className="mt-1 max-w-md text-sm text-ink-soft">{s?.enabled ? `On since ${fmtDay(s.enabledAt!)}. You'll be asked for a code from your authenticator app each time you sign in. ${s.backupCodesLeft} backup code${s.backupCodesLeft === 1 ? "" : "s"} left.` : "Admins can move money and see personal details, so protect your account with a code from your phone as well as your password."}</p>
        </div>
        {!s?.enabled && <Button onClick={() => go(async () => setSetup(await api<{ secret: string; otpauthUrl: string }>("/auth/2fa/setup", { body: {} })))} disabled={busy}>{busy ? <Spinner /> : "Set up"}</Button>}
      </div>
      {s?.enabled && (mode ? (
        <div className="mt-4 space-y-2 rounded-2xl bg-paper p-4">
          {mode === "disable" && <input className="input bg-white" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" aria-label="Your password" />}
          <input className="input bg-white font-mono" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Code from your app" aria-label="Authenticator code" />
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setMode(null); setCode(""); setPassword(""); setError(null); }}>Cancel</Button>
            {mode === "disable"
              ? <Button size="sm" variant="danger" disabled={busy || !password || code.length < 6} onClick={() => go(async () => { await api("/auth/2fa/disable", { body: { password, code } }); setMode(null); setCode(""); setPassword(""); status.reload(); refresh(); toast("Two-step sign-in is off."); })}>{busy ? <Spinner /> : "Turn off"}</Button>
              : <Button size="sm" disabled={busy || code.length !== 6} onClick={() => go(async () => { const r = await api<{ recoveryCodes: string[] }>("/auth/2fa/backup-codes", { body: { code } }); setMode(null); setCode(""); setCodes(r.recoveryCodes); })}>{busy ? <Spinner /> : "Get new codes"}</Button>}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button size="sm" variant="secondary" onClick={() => setMode("codes")}>New backup codes</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("disable")}>Turn off</Button>
        </div>
      ))}
    </div>
  );
}
