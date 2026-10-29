import type { ReactNode } from "react";
import { Button, Container, Mark } from "@/components/ui";
import { Reveal } from "@/components/motion";

export const metadata = { title: "How It Works — POINT B Mentors" };

type Step = { title: string; body: string; icon: ReactNode };

const ic = (d: ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;

const PHASES: { tone: string; label: string; title: string; text: string; steps: Step[] }[] = [
  {
    tone: "bg-sky",
    label: "01 · Choose",
    title: "Find the right person",
    text: "A few minutes of browsing, then you book straight into a mentor's real calendar. No messages back and forth.",
    steps: [
      { title: "Find a mentor", body: "Search by topic or challenge, or filter by local or international, expertise, industry, level and price. Profiles show background, what they can help with, reviews and next available time.", icon: ic(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>) },
      { title: "Pick a 1:1 or group time", body: "Times appear in your own timezone with exact start and end. A slot disappears the moment someone else books it, so what you see is genuinely free.", icon: ic(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>) },
      { title: "Choose your focus", body: "Career guidance, interview preparation, a CV review, industry advice and more. Your mentor sees this before the call.", icon: ic(<><path d="M12 3l2.5 5.5L20 9.5l-4 4 1 5.5-5-2.8L7 19l1-5.5-4-4 5.5-1L12 3z" /></>) },
      { title: "Share a few notes", body: "Tell your mentor where you are now, what would make the session useful, and anything to look at beforehand, like a CV or portfolio link.", icon: ic(<><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h4" /></>) },
    ],
  },
  {
    tone: "bg-mint",
    label: "02 · Book",
    title: "Confirm in one step",
    text: "The full price is shown before you pay. Your time is held for 15 minutes while you check out.",
    steps: [
      { title: "Pay securely", body: "Pay by card through Stripe. We never see or store your card details. Local sessions are priced in PKR, international sessions in GBP, with no hidden fees.", icon: ic(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>) },
      { title: "Get your confirmation", body: "You receive a booking reference by email, and the session is saved to your dashboard with your mentor, time and a private link to the call room.", icon: ic(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>) },
    ],
  },
  {
    tone: "bg-peach",
    label: "03 · Talk",
    title: "Have the conversation",
    text: "A focused 30 minutes in your browser. Nothing to install, nobody else in the room unless you chose a group session.",
    steps: [
      { title: "Join your session", body: "We email a reminder 30 minutes ahead. The room opens 10 minutes before the start, and your mentor hosts and lets you in.", icon: ic(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>) },
      { title: "Leave feedback", body: "Rate the session afterwards. Reviews come only from completed sessions, which keeps every rating on the platform genuine. Book the same mentor again any time.", icon: ic(<><path d="M4 5h16v11H8l-4 4z" /><path d="M9 10h6" /></>) },
    ],
  },
];

const TIMELINE = [
  ["When you book", "Confirmation email and dashboard entry"],
  ["Up to 2 days before", "Reschedule for free if plans change"],
  ["30 minutes before", "Email reminder with your link"],
  ["10 minutes before", "The call room opens"],
  ["After the call", "Leave a rating for the mentor"],
];

export default function HowItWorksPage() {
  return (
    <div className="relative overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-sky/50 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -left-40 top-[420px] h-[360px] w-[360px] rounded-full bg-peach/30 blur-[120px]" />

      {/* Hero */}
      <Container className="relative pb-16 pt-16 sm:pt-24">
        <p className="animate-rise text-sm font-medium text-brass-dark">How it works</p>
        <h1 className="animate-rise mt-4 max-w-4xl font-display text-[3.2rem] leading-[1] text-ink sm:text-7xl lg:text-[5.5rem]" style={{ ["--rise-delay" as string]: "60ms" }}>
          From a question to a <Mark color="sky">real conversation</Mark>
        </h1>
        <p className="animate-rise mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft" style={{ ["--rise-delay" as string]: "120ms" }}>
          Every session is 30 minutes with someone who has done what you&rsquo;re trying to do, booked straight into their real availability. Here&rsquo;s the whole journey, start to finish.
        </p>
        <div className="animate-rise mt-9 flex flex-wrap gap-3" style={{ ["--rise-delay" as string]: "180ms" }}>
          <Button href="/mentors" size="lg">Find a mentor</Button>
          <Button href="/pricing" variant="secondary" size="lg">See pricing</Button>
        </div>

        <dl className="animate-rise mt-16 grid grid-cols-2 overflow-hidden rounded-3xl bg-white/80 ring-1 ring-ink/5 backdrop-blur sm:grid-cols-4" style={{ ["--rise-delay" as string]: "240ms" }}>
          {[["30 min", "per session"], ["8 steps", "search to feedback"], ["2 days", "free rescheduling window"], ["PKR · GBP", "local and international"]].map(([v, l], i) => (
            <div key={l} className={`px-6 py-5 ${i ? "sm:border-l" : ""} ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t sm:border-t-0" : ""} border-line`}>
              <dt className="sr-only">{l}</dt>
              <dd className="font-display text-3xl text-ink">{v}</dd>
              <dd className="mt-1 text-xs text-ink-soft">{l}</dd>
            </div>
          ))}
        </dl>
      </Container>

      {/* Phases */}
      <Container className="relative space-y-20 py-12 sm:space-y-28">
        {PHASES.map((p, pi) => {
          const offset = PHASES.slice(0, pi).reduce((n, x) => n + x.steps.length, 0);
          return (
            <section key={p.label} className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
              <Reveal className="lg:sticky lg:top-28 lg:self-start">
                <span className={`inline-block rounded-full ${p.tone} px-3.5 py-1.5 text-xs font-medium text-ink`}>{p.label}</span>
                <h2 className="mt-5 font-display text-5xl leading-[1.02] text-ink sm:text-6xl">{p.title}</h2>
                <p className="mt-4 max-w-md text-[1.05rem] leading-relaxed text-ink-soft">{p.text}</p>
              </Reveal>
              <ol className="space-y-3">
                {p.steps.map((s, i) => (
                  <Reveal as="li" key={s.title} delay={i * 70} className="group flex gap-5 rounded-3xl bg-white p-6 ring-1 ring-ink/5 transition-shadow hover:shadow-[0_20px_50px_-30px_rgba(17,17,17,0.35)] sm:p-7">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${p.tone} text-ink`}>{s.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-soft">Step {offset + i + 1}</p>
                      <h3 className="mt-1 font-display text-2xl text-ink">{s.title}</h3>
                      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{s.body}</p>
                    </div>
                  </Reveal>
                ))}
              </ol>
            </section>
          );
        })}
      </Container>

      {/* Timeline */}
      <Container className="relative py-20 sm:py-28">
        <Reveal>
          <p className="text-sm font-medium text-brass-dark">Around your session</p>
          <h2 className="mt-3 max-w-2xl font-display text-5xl leading-[1.02] text-ink sm:text-6xl">What happens, and when</h2>
        </Reveal>
        <ol className="relative mt-12 grid gap-6 md:grid-cols-5 md:gap-4">
          <span aria-hidden className="absolute left-[7px] top-2 bottom-2 w-px bg-ink/10 md:left-0 md:right-0 md:top-[7px] md:bottom-auto md:h-px md:w-auto" />
          {TIMELINE.map(([when, what], i) => (
            <Reveal as="li" key={when} delay={i * 80} className="relative pl-8 md:pl-0 md:pt-8">
              <span className={`absolute left-0 top-0.5 h-[15px] w-[15px] rounded-full ring-4 ring-paper ${i === 3 ? "bg-forest" : "bg-ink"}`} />
              <p className="text-sm font-medium text-ink">{when}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{what}</p>
            </Reveal>
          ))}
        </ol>
      </Container>

      {/* 1:1 vs group */}
      <Container className="relative pb-20 sm:pb-28">
        <div className="grid gap-4 md:grid-cols-2">
          <Reveal className="flex h-full flex-col rounded-[2rem] bg-white p-8 ring-1 ring-ink/5 sm:p-10">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">1:1 session</p>
            <p className="mt-4 font-display text-4xl text-ink">Just you and the mentor</p>
            <p className="mt-3 flex-1 text-[0.95rem] leading-relaxed text-ink-soft">The full 30 minutes on your situation. Best for CV reviews, interview practice and decisions that are specific to you.</p>
            <ul className="mt-6 space-y-2 text-sm text-ink">
              {["Private call", "Your agenda, your pace", "Standard session price"].map((x) => <Check key={x}>{x}</Check>)}
            </ul>
          </Reveal>
          <Reveal delay={80} className="flex h-full flex-col rounded-[2rem] bg-lilac p-8 sm:p-10">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">Group session</p>
            <p className="mt-4 font-display text-4xl text-ink">Learn alongside others</p>
            <p className="mt-3 flex-1 text-[0.95rem] leading-relaxed text-ink/70">Share the call with a few other students. You hear other people&rsquo;s questions too, at a lower price per seat.</p>
            <ul className="mt-6 space-y-2 text-sm text-ink">
              {["Small groups", "Questions from different angles", "Lower price per seat"].map((x) => <Check key={x}>{x}</Check>)}
            </ul>
          </Reveal>
        </div>
      </Container>

      {/* Closing CTA */}
      <Container className="relative pb-8">
        <Reveal className="rounded-[2.25rem] bg-ink px-8 py-16 text-center text-white sm:px-16 sm:py-20">
          <h2 className="mx-auto max-w-2xl font-display text-5xl leading-[1.02] sm:text-6xl">Ready when you are</h2>
          <p className="mx-auto mt-5 max-w-lg text-white/65">Browse mentors, read their stories, and book a time that suits you.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button href="/mentors" variant="light" size="lg">Find my mentor</Button>
            <Button href="/become-a-mentor" variant="glass" size="lg">Become a mentor</Button>
          </div>
        </Reveal>
      </Container>
    </div>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white">
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {children}
    </li>
  );
}
