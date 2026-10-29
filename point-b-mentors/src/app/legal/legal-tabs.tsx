"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Container, Mark } from "@/components/ui";
import { Reveal } from "@/components/motion";

const ic = (d: ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;

const TABS = [
  { id: "terms", label: "Terms of Use", tone: "bg-sky", icon: ic(<><path d="M6 3h9l4 4v14H6z" /><path d="M10 11h6M10 15h6" /></>) },
  { id: "privacy", label: "Privacy Policy", tone: "bg-lilac", icon: ic(<><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>) },
  { id: "refunds", label: "Rescheduling & Refunds", tone: "bg-mint", icon: ic(<><path d="M4 12a8 8 0 0114-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 01-14 5.3L4 15" /><path d="M4 20v-5h5" /></>) },
  { id: "safeguarding", label: "Safeguarding", tone: "bg-peach", icon: ic(<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" />) },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CONTENT: Record<TabId, { title: string; summary: string; inShort: string[]; sections: { heading: string; body: string }[] }> = {
  terms: {
    title: "Terms of Use",
    summary: "The ground rules for using POINT B Mentors, for students and mentors alike.",
    inShort: ["Sessions are 30-minute video calls with screened mentors", "Accurate account details; under-18s need guardian consent", "Mentors follow a code of conduct"],
    sections: [
      {
        heading: "The service",
        body: "POINT B Mentors connects students and professionals with independent mentors for paid 30-minute video conversations. POINT B screens and approves mentors but does not guarantee specific outcomes from any session.",
      },
      {
        heading: "Accounts",
        body: "You must provide accurate information when registering. Users under 18 require parental or guardian consent, as described in our Safeguarding policy.",
      },
      {
        heading: "Mentor conduct",
        body: "Mentors agree to a code of conduct before their profile is activated, covering professionalism, honesty about their experience, and appropriate boundaries with students.",
      },
      {
        heading: "Changes to these terms",
        body: "We may update these terms as the platform develops. Material changes will be communicated before they take effect.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    summary: "What we collect, why we need it, and the control you have over it.",
    inShort: ["We never see or store your full card details", "Your notes are shared only with your mentor", "You can ask for a copy of your data or deletion"],
    sections: [
      {
        heading: "What we collect",
        body: "Account details, booking information, preparation notes you share with a mentor, and payment confirmation (not full card details, which are handled by our payment provider).",
      },
      {
        heading: "How it's used",
        body: "To operate bookings, facilitate sessions, process payments, and improve the platform. Preparation notes are visible only to you, your mentor, and authorised POINT B staff reviewing a dispute or safeguarding concern.",
      },
      {
        heading: "Data retention",
        body: "Booking and session records are retained for as long as needed for support, dispute resolution and safeguarding purposes, and no longer.",
      },
      {
        heading: "Your rights",
        body: "You may request a copy of your data or ask us to delete your account, subject to records we are required to keep.",
      },
    ],
  },
  refunds: {
    title: "Rescheduling & Refunds",
    summary: "What happens if your plans change, or a session doesn\u2019t go as expected.",
    inShort: ["Booked sessions can\u2019t be cancelled", "Reschedule free up to 2 days before; payment carries over", "If a mentor can\u2019t attend: a new time or a full refund"],
    sections: [
      {
        heading: "Rescheduling a session",
        body: "Booked sessions cannot be cancelled. Instead, a student can move a confirmed session to another available time with the same mentor, free of charge, up to 2 days (48 hours) before it starts. The original payment carries over. Within 2 days of the start, the session can no longer be moved.",
      },
      {
        heading: "If a mentor can\u2019t attend",
        body: "If a mentor cannot attend or does not join, our support team arranges a new time with the same or another mentor, or issues a full refund to the original payment method.",
      },
      {
        heading: "Disputed sessions",
        body: "If a session did not go as expected, contact support within 48 hours. Each case is reviewed individually rather than refunded automatically.",
      },
    ],
  },
  safeguarding: {
    title: "Safeguarding",
    summary: "How we keep every conversation safe, especially for students under 18.",
    inShort: ["Every mentor is interviewed before approval", "Sessions stay on the platform\u2019s video link", "Concerns go to the POINT B team and are treated as urgent"],
    sections: [
      {
        heading: "Users under 18",
        body: "Students under 18 require parental or guardian consent before booking, and bookings for minors are subject to additional review.",
      },
      {
        heading: "Mentor vetting",
        body: "Mentors are interviewed and formally approved before their profile is published, with professional conduct assessed as part of that process.",
      },
      {
        heading: "Communication boundaries",
        body: "Sessions take place through the platform's video link. Mentors and students are not expected to exchange personal contact details, particularly where a student is under 18.",
      },
      {
        heading: "Reporting a concern",
        body: "Use the Contact & Support page and select 'A safeguarding concern'. Reports are reviewed by the POINT B team, not by mentors, and are treated as urgent.",
      },
    ],
  },
};

export function LegalTabs() {
  const searchParams = useSearchParams();
  const initial = (searchParams.get("tab") as TabId) ?? "terms";
  const [active, setActive] = useState<TabId>(TABS.some((t) => t.id === initial) ? initial : "terms");
  const content = CONTENT[active];
  const tab = TABS.find((t) => t.id === active)!;

  function choose(id: TabId) {
    setActive(id);
    // Keep the URL shareable without a navigation.
    window.history.replaceState(null, "", `?tab=${id}`);
  }

  return (
    <div className="relative overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[440px] w-[440px] rounded-full bg-lilac/50 blur-[120px]" />

      <Container className="relative pb-24 pt-16 sm:pt-20">
        <p className="animate-rise text-sm font-medium text-brass-dark">Policies</p>
        <h1 className="animate-rise mt-3 max-w-3xl font-display text-[3.2rem] leading-[1] text-ink sm:text-7xl" style={{ ["--rise-delay" as string]: "60ms" }}>
          The fine print, <Mark color="lilac">made clear</Mark>
        </h1>
        <p className="animate-rise mt-6 max-w-xl text-[1.05rem] leading-relaxed text-ink-soft" style={{ ["--rise-delay" as string]: "120ms" }}>
          How POINT B works, how we look after your data, and how we keep every conversation safe, in plain language.
        </p>

        {/* Policy chooser */}
        <div role="tablist" aria-label="Policies" className="animate-rise mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ ["--rise-delay" as string]: "180ms" }}>
          {TABS.map((t) => {
            const on = t.id === active;
            return (
              <button key={t.id} role="tab" aria-selected={on} onClick={() => choose(t.id)}
                className={`flex flex-col items-start gap-6 rounded-3xl p-5 text-left transition-all ${on ? "bg-ink text-white shadow-[0_20px_50px_-30px_rgba(17,17,17,0.6)]" : "bg-white text-ink ring-1 ring-ink/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-28px_rgba(17,17,17,0.4)]"}`}>
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-ink ${t.tone}`}>{t.icon}</span>
                <span className="font-display text-xl leading-tight sm:text-2xl">{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          {/* On this page */}
          <aside className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">On this page</p>
            <ol className="mt-4 space-y-1 border-l border-line">
              {content.sections.map((s, i) => (
                <li key={s.heading}>
                  <a href={`#${active}-${i}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink">{s.heading}</a>
                </li>
              ))}
            </ol>
            <div className="mt-8 rounded-2xl bg-paper-dim/70 p-4 text-xs leading-relaxed text-ink-soft">
              Draft policies for this prototype, to be reviewed by legal counsel before public launch.
            </div>
          </aside>

          {/* Policy */}
          <article key={active} className="animate-rise min-w-0 rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-45px_rgba(17,17,17,0.3)] ring-1 ring-ink/5 sm:p-12">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-ink ${tab.tone}`}>{tab.label}</span>
            <h2 className="mt-5 font-display text-4xl leading-tight text-ink sm:text-5xl">{content.title}</h2>
            <p className="mt-3 max-w-xl text-[1.05rem] leading-relaxed text-ink-soft">{content.summary}</p>

            <div className="mt-8 rounded-2xl bg-paper p-5 sm:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">In short</p>
              <ul className="mt-3 space-y-2.5">
                {content.inShort.map((x) => (
                  <li key={x} className="flex gap-3 text-sm leading-relaxed text-ink">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-10 divide-y divide-line">
              {content.sections.map((s, i) => (
                <section key={s.heading} id={`${active}-${i}`} className="scroll-mt-28 grid gap-2 py-7 first:pt-0 last:pb-0 sm:grid-cols-[56px_1fr]">
                  <span className="font-display text-2xl leading-none text-ink-soft/50">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="font-display text-2xl text-ink">{s.heading}</h3>
                    <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{s.body}</p>
                  </div>
                </section>
              ))}
            </div>
          </article>
        </div>

        {/* Help */}
        <Reveal className="mt-16 grid gap-4 md:grid-cols-2">
          <Link href="/contact" className="group flex items-center justify-between gap-6 rounded-[2rem] bg-ink p-8 text-white sm:p-10">
            <div>
              <p className="font-display text-3xl">Questions about a policy?</p>
              <p className="mt-2 text-sm text-white/65">Our team will explain anything that isn&rsquo;t clear.</p>
            </div>
            <Circle dark />
          </Link>
          <Link href="/contact" className="group flex items-center justify-between gap-6 rounded-[2rem] bg-rust-pale p-8 sm:p-10">
            <div>
              <p className="font-display text-3xl text-ink">Report a concern</p>
              <p className="mt-2 text-sm text-ink-soft">Choose &ldquo;Safeguarding concern&rdquo; on the contact form. It&rsquo;s treated as urgent.</p>
            </div>
            <Circle />
          </Link>
        </Reveal>
        <p className="mt-8 text-xs text-ink-soft lg:hidden">Draft policies for this prototype, to be reviewed by legal counsel before public launch.</p>
      </Container>
    </div>
  );
}

function Circle({ dark }: { dark?: boolean }) {
  return (
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-1 ${dark ? "bg-white text-ink" : "bg-ink text-white"}`}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}
