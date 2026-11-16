"use client";

import Link from "next/link";
import { Container, EmptyState, Mark, MentorPhoto, Skeleton, pastelFor } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { ComingSoon, classesLabel, courseTone } from "@/components/course-card";
import { useApi } from "@/lib/use-api";
import { fmtDate, formatMoney } from "@/lib/format";
import type { FacultyMember } from "@/lib/types";

/** The faculty: the few people teaching this season, each with the courses they run. */
export function FacultyPage() {
  const { data, loading, error } = useApi<FacultyMember[]>("/courses/faculty");
  const list = data ?? [];
  return (
    <div className="pb-24">
      <section className="bg-sky/45 pb-14 pt-14 sm:pt-20">
        <Container>
          <p className="text-sm font-medium text-brass-dark">Our faculty</p>
          <h1 className="mt-3 max-w-4xl font-display text-[2.9rem] leading-[1.02] text-ink sm:text-7xl">{list.length > 0 && !loading ? <>{numberWord(list.length)} leaders.</> : <>The leaders.</>} <Mark color="mint">Coming to Pakistan</Mark>.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">A small, permanent faculty. Each of them has run teams, companies or institutions, and teaches what they know over a few weeks of live classes.</p>
        </Container>
      </section>

      <Container className="space-y-6 pt-12">
        {loading ? [0, 1].map((i) => <Skeleton key={i} className="h-80 rounded-[2rem]" />)
          : error ? <EmptyState title="The faculty couldn’t load" description={error} />
          : list.length === 0 ? <ComingSoon title="Our faculty is being announced" body="A small group of senior leaders is coming to Pakistan to teach. Each one appears here with their story and their courses as soon as dates are confirmed." />
          : list.map((m, i) => (
            <Reveal key={m.id} delay={60}>
              <article className="grid overflow-hidden rounded-[2rem] bg-white ring-1 ring-line lg:grid-cols-[320px_1fr]">
                <Link href={`/mentors/${m.slug}`} className="group relative block" style={{ backgroundColor: pastelFor(m.name) }}>
                  <MentorPhoto name={m.name} photoUrl={m.photoUrl} className="aspect-[4/5] h-full w-full transition-transform duration-500 group-hover:scale-[1.02] lg:aspect-auto" />
                  <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink">{String(i + 1).padStart(2, "0")}</span>
                </Link>
                <div className="flex flex-col p-6 sm:p-9">
                  <p className="text-sm text-ink-soft">{m.country}{m.languages.length ? ` · teaches in ${m.languages.join(", ")}` : ""}</p>
                  <Link href={`/mentors/${m.slug}`}><h2 className="mt-2 font-display text-4xl leading-tight text-ink hover:underline sm:text-5xl">{m.name}</h2></Link>
                  <p className="mt-2 text-lg text-ink">{m.title}{m.organization ? <span className="text-ink-soft"> · {m.organization}</span> : null}</p>
                  {m.introduction && <p className="mt-5 line-clamp-3 max-w-2xl leading-relaxed text-ink-soft">{m.introduction}</p>}
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    {m.courses.map((c) => (
                      <Link key={c.id} href={`/courses/${c.slug}`} className={`${courseTone(c.slug)} group flex flex-col rounded-3xl p-5 transition-transform hover:-translate-y-0.5`}>
                        <span className="text-xs font-medium text-ink/60">{classesLabel(c)}</span>
                        <span className="mt-3 font-display text-2xl leading-tight text-ink">{c.title}</span>
                        <span className="mt-2 text-sm text-ink/70">{c.schedule}{c.firstClassAt ? ` · from ${fmtDate(c.firstClassAt)}` : ""}</span>
                        <span className="mt-4 flex items-center justify-between text-sm"><span className="font-medium text-ink">{c.priceMinor != null ? formatMoney(c.priceMinor, "PKR") : ""}</span><span className="font-medium text-ink">View course <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span></span></span>
                      </Link>
                    ))}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
      </Container>
    </div>
  );
}

const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const numberWord = (n: number) => WORDS[n] ?? String(n);
