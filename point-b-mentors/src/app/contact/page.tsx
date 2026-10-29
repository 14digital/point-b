"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Alert, Button, Container, Mark, Spinner } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Must match CONTACT_TOPICS in the API.
const TOPICS = [
  { value: "A booking I’ve made", label: "A booking" },
  { value: "Payments and refunds", label: "Payments & refunds" },
  { value: "Becoming a mentor", label: "Becoming a mentor" },
  { value: "A safeguarding concern", label: "Safeguarding concern" },
  { value: "Something else", label: "Something else" },
];

const SHORTCUTS = [
  { tone: "bg-sky", title: "Manage a booking", text: "Reschedule a session or find your meeting link from your dashboard.", href: "/dashboard/student", cta: "Open dashboard" },
  { tone: "bg-mint", title: "Rescheduling", text: "Move your session to another time for free, up to 2 days before it starts.", href: "/legal?tab=refunds", cta: "Read the policy" },
  { tone: "bg-peach", title: "Mentor with us", text: "Share what you know with students who are a few steps behind you.", href: "/become-a-mentor", cta: "How it works" },
];

export default function ContactPage() {
  const { user } = useAuth();
  const [form, setF] = useState<{ name: string | null; email: string | null; topic: string; message: string }>({ name: null, email: null, topic: "", message: "" });
  // Signed-in users don't need to type their details again: untouched fields fall back to the account.
  const f = { ...form, name: form.name ?? user?.name ?? "", email: form.email ?? user?.email ?? "" };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const urgent = f.topic === "A safeguarding concern";
  const valid = f.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email) && f.topic && f.message.trim().length >= 10;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      await api("/contact", { body: { ...f, name: f.name.trim(), message: f.message.trim() } });
      setSentTo(f.email);
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-32 h-[420px] w-[420px] rounded-full bg-sky/50 blur-[110px]" />
      <div aria-hidden className="pointer-events-none absolute -right-32 top-40 h-[360px] w-[360px] rounded-full bg-peach/40 blur-[110px]" />

      <Container className="relative py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
          {/* Intro */}
          <div className="lg:pt-6">
            <p className="animate-rise text-sm font-medium text-brass-dark">Contact & support</p>
            <h1 className="animate-rise mt-3 font-display text-[3.2rem] leading-[1] text-ink sm:text-7xl" style={{ ["--rise-delay" as string]: "60ms" }}>
              We&rsquo;re here <Mark color="sky">to help</Mark>
            </h1>
            <p className="animate-rise mt-6 max-w-md text-[1.05rem] leading-relaxed text-ink-soft" style={{ ["--rise-delay" as string]: "120ms" }}>
              Questions about a booking, a payment or becoming a mentor? Send us a note and a real person from the POINT B team will reply by email.
            </p>

            <ul className="animate-rise mt-10 space-y-3" style={{ ["--rise-delay" as string]: "180ms" }}>
              <InfoRow icon={<ClockIcon />} title="Replies within two working days" text="Most messages are answered the same day, Monday to Friday." />
              <InfoRow icon={<ShieldIcon />} title="Safeguarding is always urgent" text="Reports are reviewed by the POINT B team as soon as they arrive, never by a mentor." tone="bg-rust-pale text-rust" />
              <InfoRow icon={<MailIcon />} title="Replies come by email" text="Use an address you check. We’ll send a confirmation straight away." />
            </ul>
          </div>

          {/* Form */}
          <div className="animate-rise" style={{ ["--rise-delay" as string]: "140ms" }}>
            <div className="rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(17,17,17,0.35)] ring-1 ring-ink/5 sm:p-9">
              {sentTo ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-forest-pale text-forest">
                    <svg width="28" height="28" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <h2 className="mt-6 font-display text-4xl text-ink">Message sent</h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
                    Thanks{f.name ? `, ${f.name.split(" ")[0]}` : ""}. We&rsquo;ve emailed a copy to <span className="font-medium text-ink">{sentTo}</span> and {urgent ? "a member of the team will review your report as a priority." : "will reply within two working days."}
                  </p>
                  <div className="mt-8 flex flex-wrap justify-center gap-2">
                    <Button variant="secondary" onClick={() => { setSentTo(null); setF((p) => ({ ...p, topic: "", message: "" })); }}>Send another</Button>
                    <Button href="/mentors">Browse mentors</Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <h2 className="font-display text-3xl text-ink">Send us a message</h2>
                  <p className="mt-1 text-sm text-ink-soft">All fields are required.</p>

                  <div className="mt-8 grid gap-5 sm:grid-cols-2">
                    <Labeled label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...form, name: e.target.value })} autoComplete="name" placeholder="Your name" /></Labeled>
                    <Labeled label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...form, email: e.target.value })} autoComplete="email" placeholder="you@example.com" /></Labeled>
                  </div>

                  <fieldset className="mt-6">
                    <legend className="mb-2.5 text-sm font-medium text-ink">What is this about?</legend>
                    <div className="flex flex-wrap gap-2">
                      {TOPICS.map((t) => {
                        const on = f.topic === t.value;
                        return (
                          <button key={t.value} type="button" aria-pressed={on} onClick={() => setF({ ...form, topic: t.value })}
                            className={`rounded-full border px-4 py-2 text-sm transition-colors ${on ? (t.value === "A safeguarding concern" ? "border-rust bg-rust text-white" : "border-ink bg-ink text-paper") : "border-line text-ink hover:border-ink/40"}`}>
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  {urgent && <div className="mt-4"><Alert tone="error">If someone is in immediate danger, contact local emergency services first. Then tell us what happened here and we&rsquo;ll act on it urgently.</Alert></div>}

                  <div className="mt-6">
                    <Labeled label="Message" hint={`${f.message.length}/3000`}>
                      <textarea className="input min-h-36 resize-y leading-relaxed" maxLength={3000} value={f.message} onChange={(e) => setF({ ...form, message: e.target.value })}
                        placeholder={f.topic.startsWith("A booking") || f.topic.startsWith("Payments") ? "Include your booking reference (e.g. PBM-1A2B3C4D) if you have one." : "Tell us a little about what you need."} />
                    </Labeled>
                  </div>

                  {error && <div className="mt-4"><Alert>{error}</Alert></div>}

                  <div className="mt-8 flex flex-col-reverse items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-relaxed text-ink-soft">By sending, you agree to our <Link href="/legal?tab=privacy" className="underline underline-offset-2 hover:text-ink">privacy policy</Link>.</p>
                    <Button type="submit" size="lg" disabled={!valid || busy} className="sm:min-w-44">
                      {busy ? <Spinner /> : <>Send message <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></>}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Shortcuts */}
        <section className="mt-24">
          <Reveal>
            <p className="text-sm font-medium text-brass-dark">Quick answers</p>
            <h2 className="mt-2 font-display text-4xl text-ink sm:text-5xl">You might not need to write</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {SHORTCUTS.map((s, i) => (
              <Reveal key={s.title} delay={i * 80}>
                <Link href={s.href} className={`group flex h-full flex-col rounded-3xl ${s.tone} p-7 transition-transform hover:-translate-y-1`}>
                  <p className="font-display text-2xl text-ink">{s.title}</p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-ink/70">{s.text}</p>
                  <span className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-ink">
                    {s.cta}
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white transition-transform group-hover:translate-x-1">
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      </Container>
    </div>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink">{label}{hint && <span className="text-xs font-normal text-ink-soft">{hint}</span>}</span>
      {children}
    </label>
  );
}

function InfoRow({ icon, title, text, tone = "bg-white text-ink" }: { icon: ReactNode; title: string; text: string; tone?: string }) {
  return (
    <li className="flex gap-4 rounded-2xl bg-white/60 p-4 ring-1 ring-ink/5 backdrop-blur">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-ink/5 ${tone}`}>{icon}</span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{text}</p>
      </div>
    </li>
  );
}

const ClockIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" /></svg>;
const ShieldIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" /></svg>;
const MailIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
