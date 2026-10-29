"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Container, MentorPhoto, Skeleton, pastelFor } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useApi } from "@/lib/use-api";
import { CATEGORY_LABEL, LEVEL_LABEL } from "@/lib/constants";
import { formatMoney, initials } from "@/lib/format";
import type { MentorDetail } from "@/lib/types";
import { BookingPanel } from "./booking-flow";

export default function MentorProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: m, error, loading, reload } = useApi<MentorDetail>(`/mentors/${slug}`);

  if (loading) {
    return (
      <Container className="py-10">
        <Skeleton className="h-5 w-40" />
        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_400px]">
          <div className="flex gap-8"><Skeleton className="aspect-[4/5] w-52 rounded-[28px]" /><div className="flex-1 space-y-4 pt-10"><Skeleton className="h-14 w-3/4" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-20" /></div></div>
          <Skeleton className="h-[520px] rounded-[28px]" />
        </div>
      </Container>
    );
  }
  if (error || !m) {
    return (
      <Container className="py-24">
        <div className="mx-auto max-w-md text-center">
          <h1 className="font-display text-4xl text-ink">This mentor isn&rsquo;t available</h1>
          <p className="mt-3 text-ink-soft">{error ?? "The profile may have been paused or removed."}</p>
          <Link href="/mentors" className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper">Browse mentors</Link>
        </div>
      </Container>
    );
  }

  const first = m.name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "").split(" ")[0];
  const tint = pastelFor(m.name);

  return (
    <div className="relative pb-24 lg:pb-16">
      {/* Soft colour wash behind the hero, taken from the mentor's pastel */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px]" style={{ background: `linear-gradient(180deg, ${tint}73 0%, ${tint}26 55%, transparent 100%)` }} />

      <Container className="relative pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/mentors" className="group inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="transition-transform group-hover:-translate-x-0.5"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            All mentors
          </Link>
          {m.isDemo && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3.5 py-1.5 text-xs text-ink-soft ring-1 ring-ink/10 backdrop-blur" title="This mentor is sample content used to preview the product, not a real person available to book.">
              <span className="h-1.5 w-1.5 rounded-full bg-brass" />Demonstration profile · sample content
            </span>
          )}
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
          <div className="min-w-0">
            {/* Hero */}
            <header className="flex flex-col gap-8 sm:flex-row sm:items-end">
              <div className="animate-rise relative w-44 shrink-0 sm:w-52">
                <MentorPhoto name={m.name} photoUrl={m.photoUrl} className="aspect-[4/5] w-full rounded-[28px] shadow-[0_30px_60px_-30px_rgba(17,17,17,0.45)] ring-1 ring-ink/5" initialsClass="text-7xl" />
                {m.verified && (
                  <span className="absolute -bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-md ring-1 ring-ink/5">
                    <VerifiedIcon />Verified mentor
                  </span>
                )}
              </div>
              <div className="animate-rise min-w-0" style={{ ["--rise-delay" as string]: "80ms" }}>
                <p className="text-sm font-medium text-ink-soft">{LEVEL_LABEL[m.level]} · {CATEGORY_LABEL[m.category]} mentor</p>
                <h1 className="mt-2 font-display text-5xl leading-[0.98] text-ink sm:text-[4.25rem]">{m.name}</h1>
                <p className="mt-4 text-lg leading-snug text-ink">{m.title}</p>
                <p className="text-ink-soft">{m.organization}</p>
              </div>
            </header>

            {/* Key facts */}
            <dl className="animate-rise mt-10 grid grid-cols-2 overflow-hidden rounded-3xl bg-white/80 ring-1 ring-ink/5 backdrop-blur sm:grid-cols-4" style={{ ["--rise-delay" as string]: "160ms" }}>
              <Fact label="Rating" value={m.rating ? <span className="inline-flex items-center gap-1.5">{m.rating.toFixed(1)}<Star className="h-4 w-4 text-brass" /></span> : "New"} sub={m.reviewCount ? `${m.reviewCount} review${m.reviewCount === 1 ? "" : "s"}` : "No reviews yet"} />
              <Fact label="Sessions" value={m.sessionsCompleted} sub="completed" />
              <Fact label="Based in" value={m.country} small />
              <Fact label="Speaks" value={m.languages.join(", ")} small />
            </dl>

            <div className="mt-6 flex flex-wrap gap-2">
              {m.expertise.map((e) => <span key={e} className="rounded-full bg-white px-3.5 py-1.5 text-sm text-ink ring-1 ring-ink/10">{e}</span>)}
              {m.industries.map((e) => <span key={e} className="rounded-full px-3.5 py-1.5 text-sm text-ink-soft ring-1 ring-ink/10">{e}</span>)}
            </div>

            {/* In-page navigation */}
            <nav className="no-scrollbar mt-14 flex gap-1 overflow-x-auto border-b border-line" aria-label="Profile sections">
              {[["about", "About"], ["help", "How I can help"], ["session", "The session"], ["reviews", `Reviews${m.reviewCount ? ` (${m.reviewCount})` : ""}`]].map(([id, label]) => (
                <a key={id} href={`#${id}`} className="-mb-px shrink-0 border-b-2 border-transparent px-4 py-3 text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink">{label}</a>
              ))}
            </nav>

            {/* About */}
            <Section id="about" eyebrow="About" title={<>Meet {first}</>}>
              <p className="font-display text-[1.7rem] leading-[1.3] text-ink sm:text-[2rem]">&ldquo;{m.introduction}&rdquo;</p>
              {m.careerSummary && <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed text-ink-soft">{m.careerSummary}</p>}
              {(m.qualifications.length > 0 || m.achievements.length > 0) && (
                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  <InfoCard icon={<CapIcon />} tone="bg-sky" title="Qualifications" items={m.qualifications} />
                  <InfoCard icon={<AwardIcon />} tone="bg-mint" title="Achievements" items={m.achievements} />
                </div>
              )}
            </Section>

            {/* Help topics */}
            <Section id="help" eyebrow="How I can help" title="Bring me questions like these">
              <ol className="grid gap-3 sm:grid-cols-2">
                {m.helpTopics.map((t, i) => (
                  <Reveal as="li" key={t} delay={i * 60} className="flex gap-4 rounded-3xl bg-white p-5 ring-1 ring-ink/5">
                    <span className="font-display text-2xl leading-none text-ink-soft/60">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[0.95rem] leading-relaxed text-ink">{t}</span>
                  </Reveal>
                ))}
              </ol>
              {m.outsideScope.length > 0 && (
                <div className="mt-6 rounded-3xl bg-paper-dim/70 p-6">
                  <p className="text-sm font-medium text-ink">Outside the scope of a session</p>
                  <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    {m.outsideScope.map((t) => (
                      <li key={t} className="flex items-center gap-2 text-sm text-ink-soft"><span className="h-px w-3 bg-ink-soft/60" />{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            {/* What to expect */}
            <Section id="session" eyebrow="The session" title="What 30 minutes looks like">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["bg-peach", "Before", `Share your situation and goal when you book. ${first} reads it ahead of time.`],
                  ["bg-lilac", "During", "A private video call in your browser. No downloads, no small talk needed."],
                  ["bg-lemon", "After", "Leave with clear next steps, then rate the session to help other students."],
                ].map(([tone, label, text], i) => (
                  <Reveal key={label} delay={i * 80} className={`rounded-3xl ${tone} p-6`}>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">{label}</p>
                    <p className="mt-6 text-[0.95rem] leading-relaxed text-ink">{text}</p>
                  </Reveal>
                ))}
              </div>
            </Section>

            {/* Reviews */}
            <Section id="reviews" eyebrow="Reviews" title="From students who&rsquo;ve met with them">
              {m.reviews.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-ink/15 px-6 py-12 text-center">
                  <p className="font-display text-2xl text-ink">No reviews yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">Only students who complete a session can leave a review, so every rating here is from a real call.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-4">
                    <span className="font-display text-6xl leading-none text-ink">{(m.rating ?? 0).toFixed(1)}</span>
                    <div className="pb-1">
                      <Stars rating={m.rating ?? 0} />
                      <p className="mt-1 text-sm text-ink-soft">{m.reviewCount} verified review{m.reviewCount === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                  <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    {m.reviews.map((r, i) => (
                      <Reveal key={r.id} delay={i * 60} className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-ink/5">
                        <Stars rating={r.rating} />
                        <p className="mt-4 flex-1 text-[0.95rem] leading-relaxed text-ink">&ldquo;{r.comment}&rdquo;</p>
                        <div className="mt-6 flex items-center gap-3 border-t border-line pt-4">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-ink" style={{ backgroundColor: pastelFor(r.author) }}>{initials(r.author)}</span>
                          <div className="min-w-0 text-sm">
                            <p className="font-medium text-ink">{r.author}</p>
                            <p className="truncate text-xs text-ink-soft">{r.agenda} · {new Date(r.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</p>
                          </div>
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </>
              )}
            </Section>
          </div>

          {/* Booking */}
          <aside id="book" className="min-w-0 scroll-mt-28 lg:sticky lg:top-24 lg:self-start">
            <div className="animate-rise rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(17,17,17,0.35)] ring-1 ring-ink/5 sm:p-7" style={{ ["--rise-delay" as string]: "120ms" }}>
              <div className="flex items-center gap-3">
                <MentorPhoto name={m.name} photoUrl={m.photoUrl} className="h-11 w-11 rounded-full" initialsClass="text-base" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">Book a session with {first}</p>
                  <p className="text-xs text-ink-soft">30-minute video call</p>
                </div>
              </div>
              <BookingPanel mentor={m} onSlotTaken={reload} />
              <ul className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm text-ink-soft">
                <Assurance>Free rescheduling up to 2 days before</Assurance>
                <Assurance>Private video room, link on your dashboard</Assurance>
                <Assurance>Reminder by email 30 minutes before</Assurance>
              </ul>
              {m.linkedinUrl && (
                <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="mt-5 flex items-center justify-between rounded-2xl bg-paper px-4 py-3 text-sm text-ink hover:bg-paper-dim">
                  View LinkedIn profile<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M7 13L13 7M8 7h5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </a>
              )}
            </div>
          </aside>
        </div>
      </Container>

      {/* Mobile booking bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 px-5 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">{formatMoney(m.priceMinor, m.currency)} <span className="font-normal text-ink-soft">/ 30 min</span></p>
            <p className="text-xs text-ink-soft">Group from {formatMoney(m.groupPriceMinor, m.currency)}</p>
          </div>
          <a href="#book" className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper">See times</a>
        </div>
      </div>
    </div>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 pt-16">
      <Reveal>
        <p className="text-sm font-medium text-brass-dark">{eyebrow}</p>
        <h2 className="mt-2 font-display text-4xl leading-[1.05] text-ink sm:text-[2.75rem]">{title}</h2>
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Fact({ label, value, sub, small }: { label: string; value: ReactNode; sub?: string; small?: boolean }) {
  return (
    <div className="border-line px-5 py-4 [&:not(:first-child)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={`mt-1 text-ink ${small ? "text-[0.95rem] leading-snug" : "font-display text-3xl leading-none"}`}>{value}</dd>
      {sub && <dd className="mt-1 text-xs text-ink-soft">{sub}</dd>}
    </div>
  );
}

function InfoCard({ icon, tone, title, items }: { icon: ReactNode; tone: string; title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Reveal className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone} text-ink`}>{icon}</span>
      <p className="mt-5 text-sm font-medium text-ink">{title}</p>
      <ul className="mt-2 space-y-1.5 text-[0.95rem] leading-relaxed text-ink-soft">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </Reveal>
  );
}

function Assurance({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest-pale text-forest">
        <svg width="11" height="11" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {children}
    </li>
  );
}

function Star({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L10 1.5z" /></svg>;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= Math.round(rating) ? "text-brass" : "text-line"}`} />)}
    </span>
  );
}

function VerifiedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" className="text-forest" aria-hidden>
      <path fill="currentColor" d="M10 1l2.2 1.6 2.7-.2.8 2.6 2.3 1.5-.9 2.5.9 2.5-2.3 1.5-.8 2.6-2.7-.2L10 19l-2.2-1.6-2.7.2-.8-2.6L2 13.5l.9-2.5L2 8.5l2.3-1.5.8-2.6 2.7.2L10 1z" />
      <path d="M6.8 10.2l2.2 2.2 4.2-4.6" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CapIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden><path d="M2 9l10-5 10 5-10 5L2 9z" /><path d="M6 11v5c2 1.5 4 2 6 2s4-.5 6-2v-5" /></svg>;
}

function AwardIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden><circle cx="12" cy="9" r="6" /><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7" /></svg>;
}
