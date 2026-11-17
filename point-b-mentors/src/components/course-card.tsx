import Link from "next/link";
import type { Course } from "@/lib/types";
import { fmtDate, formatMoney } from "@/lib/format";
import { MentorPhoto, pastelFor } from "./ui";

const TONES = ["bg-peach", "bg-sky", "bg-mint", "bg-lilac"];
/** A softer treatment for cards on white: a colour wash in one corner and a matching accent dot. */
const ACCENTS = [
  { wash: "from-mint/70", dot: "bg-forest", chip: "bg-mint" },
  { wash: "from-sky/70", dot: "bg-[#2b7a9b]", chip: "bg-sky" },
  { wash: "from-lilac/70", dot: "bg-[#6b55b0]", chip: "bg-lilac" },
  { wash: "from-peach/70", dot: "bg-[#b5622a]", chip: "bg-peach" },
];
export const courseAccent = (slug: string) => ACCENTS[slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENTS.length];
/** A steady pastel per course, so the same course always wears the same colour. */
export const courseTone = (slug: string) => TONES[slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];

/** "4 classes · 90 min each" */
export const classesLabel = (c: { sessionsCount: number; sessionMinutes: number }) =>
  `${c.sessionsCount} class${c.sessionsCount === 1 ? "" : "es"} · ${c.sessionMinutes >= 60 && c.sessionMinutes % 60 === 0 ? `${c.sessionMinutes / 60} hr${c.sessionMinutes === 60 ? "" : "s"}` : `${c.sessionMinutes} min`} each`;

/** Where enrolment stands, in a few words. */
export function enrolmentLabel(c: Pick<Course, "open" | "full" | "ended" | "seatsLeft" | "classesHeld" | "firstClassAt">) {
  if (c.ended) return "Finished";
  if (c.full) return "Fully booked";
  if (!c.open) return "Enrolment closed";
  if (c.classesHeld > 0) return "Under way · still open";
  if (c.seatsLeft != null && c.seatsLeft <= 10) return `${c.seatsLeft} seat${c.seatsLeft === 1 ? "" : "s"} left`;
  return "Enrolling now";
}

/** A course on a pastel card: what it is, who teaches it, when it runs and what it costs. */
export function CourseCard({ course: c, showMentor = true, className = "" }: { course: Course; showMentor?: boolean; className?: string }) {
  return (
    <Link href={`/courses/${c.slug}`} className={`group flex flex-col overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-line transition-all hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgba(17,17,17,0.35)] ${className}`}>
      <div className={`${courseTone(c.slug)} relative px-6 pb-6 pt-5`}>
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-ink">{enrolmentLabel(c)}</span>
          <span className="text-xs font-medium text-ink/60">{classesLabel(c)}</span>
        </div>
        <h3 className="mt-8 font-display text-[1.75rem] leading-[1.08] text-ink">{c.title}</h3>
        <p className="mt-2 text-sm text-ink/70">{c.schedule}{c.firstClassAt ? ` · from ${fmtDate(c.firstClassAt)}` : ""}</p>
      </div>
      <div className="flex flex-1 flex-col px-6 py-5">
        <p className="line-clamp-3 text-sm leading-relaxed text-ink-soft">{c.summary}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          {showMentor ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <MentorPhoto name={c.mentor.name} photoUrl={c.mentor.photoUrl} className="h-9 w-9 shrink-0 rounded-full" initialsClass="text-xs" />
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{c.mentor.name}</span><span className="block truncate text-xs text-ink-soft">{c.mentor.title}</span></span>
            </span>
          ) : <span className="text-xs text-ink-soft">Live online · Pakistan time</span>}
          {c.priceMinor != null && <span className="shrink-0 text-right"><span className="block font-display text-2xl leading-none text-ink">{formatMoney(c.priceMinor, "PKR")}</span><span className="text-[11px] text-ink-soft">whole course</span></span>}
        </div>
      </div>
    </Link>
  );
}

/** A faculty member's portrait tile, used on the home page and the faculty page. */
export function FacultyTile({ m, className = "" }: { m: { slug: string; name: string; title: string; organization: string; photoUrl?: string | null; courses: unknown[] }; className?: string }) {
  return (
    <Link href={`/mentors/${m.slug}`} className={`group relative block overflow-hidden rounded-[1.75rem] ring-1 ring-line ${className}`} style={{ backgroundColor: pastelFor(m.name) }}>
      <MentorPhoto name={m.name} photoUrl={m.photoUrl} className="aspect-[4/5] w-full transition-transform duration-500 group-hover:scale-[1.03]" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-5 pb-5 pt-20 text-white">
        <p className="font-display text-[1.6rem] leading-tight">{m.name}</p>
        <p className="mt-1 line-clamp-1 text-sm text-white/80">{m.title}{m.organization ? ` · ${m.organization}` : ""}</p>
        {m.courses.length > 0 && <p className="mt-3 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs backdrop-blur">{m.courses.length} course{m.courses.length === 1 ? "" : "s"} open</p>}
      </div>
    </Link>
  );
}

/** Shown while no course is open yet: a warm "announcing soon" panel rather than an empty box. */
export function ComingSoon({ title, body, compact = false }: { title: string; body: string; compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[2rem] bg-white ring-1 ring-line ${compact ? "px-6 py-10 sm:px-10" : "px-6 py-14 sm:px-14 sm:py-20"}`}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lemon/70 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 right-32 h-48 w-48 rounded-full bg-sky/70 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-peach/60 blur-2xl" />
      <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_auto]">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-xs font-medium text-ink"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forest" />Announcing soon</span>
          <p className="mt-5 font-display text-[2.2rem] leading-[1.05] text-ink sm:text-5xl">{title}</p>
          <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-soft">{body}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-full bg-ink py-1.5 pl-5 pr-1.5 text-sm font-medium text-white transition-colors hover:bg-ink-soft">
              Tell me when it opens
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime text-ink"><svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            </Link>
            <Link href="/how-it-works" className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-medium text-ink ring-1 ring-line transition-colors hover:bg-paper">How it works</Link>
          </div>
        </div>
        {!compact && (
          <div aria-hidden className="hidden w-72 space-y-3 lg:block">
            {[["bg-lemon", "w-3/4"], ["bg-mint", "w-1/2"], ["bg-lilac", "w-2/3"]].map(([tone, w], i) => (
              <div key={tone} className="rounded-3xl bg-white/90 p-4 shadow-[0_18px_40px_-26px_rgba(17,17,17,0.4)] ring-1 ring-line" style={{ transform: `translateX(${i * 18}px) rotate(${i % 2 ? 1.5 : -1.5}deg)` }}>
                <div className={`h-16 rounded-2xl ${tone}`} />
                <div className={`mt-3 h-2.5 rounded-full bg-paper-dim ${w}`} />
                <div className="mt-2 h-2.5 w-1/3 rounded-full bg-paper-dim" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
