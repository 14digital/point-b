"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, Container, MentorPhoto, Skeleton } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { CourseCard, classesLabel, courseTone, enrolmentLabel } from "@/components/course-card";
import { EnrolModal } from "@/components/enrol-modal";
import { useApi, useNow } from "@/lib/use-api";
import { paymentChanged } from "@/lib/events";
import { fmtDate, fmtDay, fmtTime, formatMoney, TZ_LABEL } from "@/lib/format";
import { NoticeText } from "@/lib/policy";
import type { CourseDetail } from "@/lib/types";

export function CoursePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: c, error, loading, reload } = useApi<CourseDetail>(`/courses/${slug}`);
  const [open, setOpen] = useState(false);
  const now = useNow();

  if (loading) {
    return (
      <Container className="py-10">
        <Skeleton className="h-72 rounded-[2rem]" />
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]"><Skeleton className="h-96 rounded-3xl" /><Skeleton className="h-80 rounded-3xl" /></div>
      </Container>
    );
  }
  if (error || !c) {
    return (
      <Container className="py-24">
        <div className="mx-auto max-w-md text-center">
          <h1 className="font-display text-4xl text-ink">This course isn&rsquo;t available</h1>
          <p className="mt-3 text-ink-soft">{error ?? "It may have finished or been taken down."}</p>
          <Button href="/courses" className="mt-8">See all courses</Button>
        </div>
      </Container>
    );
  }

  const first = c.mentor.name.replace(/^(Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, "").split(" ")[0];
  const price = c.priceMinor != null ? formatMoney(c.priceMinor, "PKR") : "";
  const cta = c.open ? <Button size="lg" className="w-full" onClick={() => setOpen(true)}>Enrol now · {price}</Button>
    : <div className="rounded-2xl bg-paper px-4 py-3.5 text-center text-sm text-ink-soft">{c.ended ? "This course has finished." : c.full ? "This course is fully booked." : "Enrolment is closed."} <Link href="/courses" className="font-medium text-ink underline underline-offset-2">See other courses</Link></div>;

  return (
    <div className="pb-28 lg:pb-16">
      {/* Hero */}
      <section className={`${courseTone(c.slug)} pb-14 pt-8 sm:pb-20`}>
        <Container>
          <Link href="/courses" className="group inline-flex items-center gap-2 text-sm text-ink/70 hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="transition-transform group-hover:-translate-x-0.5"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            All courses
          </Link>
          <div className="mt-10 max-w-4xl">
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-ink">{enrolmentLabel(c)}</span>
            <h1 className="animate-rise mt-5 font-display text-[2.8rem] leading-[1.02] text-ink sm:text-[4.6rem]">{c.title}</h1>
            <p className="animate-rise mt-5 max-w-2xl text-lg leading-relaxed text-ink/75" style={{ ["--rise-delay" as string]: "100ms" }}>{c.summary}</p>
            <Link href={`/mentors/${c.mentor.slug}`} className="animate-rise mt-8 inline-flex items-center gap-3 rounded-full bg-white/80 py-1.5 pl-1.5 pr-5 ring-1 ring-ink/5 transition-colors hover:bg-white" style={{ ["--rise-delay" as string]: "180ms" }}>
              <MentorPhoto name={c.mentor.name} photoUrl={c.mentor.photoUrl} className="h-11 w-11 rounded-full" initialsClass="text-sm" />
              <span className="text-left"><span className="block text-sm font-medium text-ink">Taught by {c.mentor.name}</span><span className="block text-xs text-ink-soft">{c.mentor.title}{c.mentor.organization ? ` · ${c.mentor.organization}` : ""}</span></span>
            </Link>
          </div>
        </Container>
      </section>

      <Container className="relative">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
          <div className="min-w-0">
            {/* Key facts */}
            <dl className="-mt-8 grid grid-cols-2 overflow-hidden rounded-3xl bg-white ring-1 ring-ink/5 sm:grid-cols-4">
              <Fact label="When" value={c.schedule.replace(/^Every /, "")} sub={TZ_LABEL} />
              <Fact label="Classes" value={String(c.sessionsCount)} sub={classesLabel(c).split(" · ")[1]} />
              <Fact label="Starts" value={c.firstClassAt ? fmtDate(c.firstClassAt) : "—"} sub={c.classesHeld ? `${c.classesHeld} held so far` : "Live online"} />
              <Fact label="Fee" value={price} sub="whole course" />
            </dl>

            <Section eyebrow="What you’ll cover" title="The course, point by point">
              <ol className="grid gap-3 sm:grid-cols-2">
                {c.topics.map((t, i) => (
                  <Reveal as="li" key={t} delay={i * 50} className="flex gap-4 rounded-3xl bg-white p-5 ring-1 ring-ink/5">
                    <span className="font-display text-2xl leading-none text-ink-soft/60">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[0.95rem] leading-relaxed text-ink">{t}</span>
                  </Reveal>
                ))}
              </ol>
            </Section>

            {c.audience && (
              <Section eyebrow="Who it’s for" title="Is this course for you?">
                <p className="max-w-2xl rounded-3xl bg-mint/60 p-6 text-[1.05rem] leading-relaxed text-ink">{c.audience}</p>
              </Section>
            )}

            <Section eyebrow="Class dates" title={`${c.sessionsCount} live classes`}>
              <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
                {c.classes.map((k, i) => {
                  const past = new Date(k.endAt).getTime() < now;
                  return (
                    <div key={k.number} className={`flex items-center justify-between gap-4 px-5 py-4 sm:px-6 ${i ? "border-t border-line" : ""} ${past ? "opacity-55" : ""}`}>
                      <span className="flex items-center gap-4">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-dim font-display text-lg text-ink">{k.number}</span>
                        <span><span className="block text-sm font-medium text-ink">{fmtDay(k.startAt)}</span><span className="text-xs text-ink-soft">{fmtTime(k.startAt)} – {fmtTime(k.endAt)}</span></span>
                      </span>
                      {past ? <span className="text-xs text-ink-soft">Held</span> : c.nextClass?.number === k.number ? <span className="rounded-full bg-lemon px-2.5 py-1 text-xs font-medium text-ink">Next</span> : null}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-ink-soft">All times are {TZ_LABEL}. Each class opens in your browser 10 minutes before it starts; nothing to install.</p>
            </Section>

            <Section eyebrow="How it works" title="Simple from the first class">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["bg-peach", "Enrol", "Pay once for the whole course, by card, bank transfer or QR. Your place is confirmed by email."],
                  ["bg-sky", "Join live", `Every class is live with ${first}. Join from your dashboard; a reminder comes 30 minutes before.`],
                  ["bg-lilac", "Ask questions", "Classes are interactive: bring questions from your own work and hear how others approach them."],
                ].map(([tone, label, text], i) => (
                  <Reveal key={label} delay={i * 80} className={`rounded-3xl ${tone} p-6`}>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">{label}</p>
                    <p className="mt-6 text-[0.95rem] leading-relaxed text-ink">{text}</p>
                  </Reveal>
                ))}
              </div>
            </Section>

            <Section eyebrow="Your teacher" title={<>Meet {first}</>}>
              <Link href={`/mentors/${c.mentor.slug}`} className="group flex flex-col gap-5 rounded-3xl bg-white p-6 ring-1 ring-ink/5 transition-shadow hover:shadow-[0_18px_40px_-24px_rgba(17,17,17,0.35)] sm:flex-row sm:items-center">
                <MentorPhoto name={c.mentor.name} photoUrl={c.mentor.photoUrl} className="aspect-[4/5] w-28 shrink-0 rounded-2xl" initialsClass="text-4xl" />
                <span className="min-w-0">
                  <span className="block font-display text-3xl text-ink">{c.mentor.name}</span>
                  <span className="mt-1 block text-ink-soft">{c.mentor.title}{c.mentor.organization ? `, ${c.mentor.organization}` : ""}</span>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink">Read {first}&rsquo;s profile <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span></span>
                </span>
              </Link>
            </Section>

            {c.moreFromMentor.length > 0 && (
              <Section eyebrow={`More from ${first}`} title="Other courses">
                <div className="grid gap-5 sm:grid-cols-2">{c.moreFromMentor.map((o) => <CourseCard key={o.id} course={o} showMentor={false} />)}</div>
              </Section>
            )}
          </div>

          {/* Enrol */}
          <aside id="enrol" className="min-w-0 scroll-mt-28 lg:sticky lg:top-24 lg:mt-[-3rem] lg:self-start">
            <div className="rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(17,17,17,0.35)] ring-1 ring-ink/5 sm:p-7">
              <p className="text-sm text-ink-soft">Whole course</p>
              <p className="font-display text-5xl leading-none text-ink">{price}</p>
              <p className="mt-2 text-sm text-ink-soft">{classesLabel(c)}</p>
              <div className="mt-6 space-y-3 rounded-2xl bg-paper p-4 text-sm">
                <Line label="Schedule" value={c.schedule} />
                {c.nextClass && <Line label={c.classesHeld ? "Next class" : "First class"} value={`${fmtDay(c.nextClass.startAt)}`} />}
                <Line label="Seats" value={c.capacity == null ? "Open to everyone" : `${c.seatsLeft} of ${c.capacity} left`} />
              </div>
              <div className="mt-6">{cta}</div>
              <ul className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm text-ink-soft">
                <Assurance><NoticeText text="Full refund up to {notice} before the first class" /></Assurance>
                <Assurance>Live online classes in your browser</Assurance>
                <Assurance>Reminder 30 minutes before every class</Assurance>
              </ul>
            </div>
          </aside>
        </div>
      </Container>

      {/* Phone enrol bar */}
      {c.open && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 px-5 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="min-w-0"><p className="text-sm font-medium text-ink">{price} <span className="font-normal text-ink-soft">whole course</span></p><p className="truncate text-xs text-ink-soft">{c.schedule}</p></div>
            <button onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper">Enrol now</button>
          </div>
        </div>
      )}

      {open && <EnrolModal course={c} onClose={(changed) => { setOpen(false); paymentChanged(); if (changed) reload(); }} />}
    </div>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <section className="pt-16">
      <Reveal>
        <p className="text-sm font-medium text-brass-dark">{eyebrow}</p>
        <h2 className="mt-2 font-display text-4xl leading-[1.05] text-ink sm:text-[2.75rem]">{title}</h2>
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-line px-5 py-4 [&:not(:first-child)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-1 text-[0.95rem] font-medium leading-snug text-ink">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-ink-soft">{sub}</dd>}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-ink-soft">{label}</span><span className="text-right text-ink">{value}</span></div>;
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
