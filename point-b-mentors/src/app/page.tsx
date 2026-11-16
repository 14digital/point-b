import Link from "next/link";
import { Container, SectionHeading, Button, Mark } from "@/components/ui";
import { FacultyBadge, HeroCourses, FacultyGrid, CourseGrid } from "@/components/home-faculty";
import { Reveal, ScrollStatement } from "@/components/motion";
import { HeroVideo } from "@/components/hero-video";
import { NoticeText } from "@/lib/policy";

const STEPS = [
  { dots: 1, bg: "bg-peach", title: "Browse the courses", body: "Each course has a clear syllabus, every class date, and one price in rupees. Pick the subject that fits where you are." },
  { dots: 2, bg: "bg-sky", title: "Enrol and join live", body: "Secure your place, then join each class from your dashboard. Classes run live online, on Pakistan time." },
  { dots: 3, bg: "bg-mint", title: "Learn from people who’ve done it", body: "Faculty are invited senior leaders. After the final class, leave one short review so we can keep improving." },
];

const FAQ = [
  { q: "Who teaches on POINT B?", a: "An invited faculty of senior leaders. Nobody lists themselves: we approach people who have led companies, institutions and teams, interview them, and review every course before it goes live." },
  { q: "How do courses work?", a: "Each course is a fixed set of live online classes on one subject, on a weekly schedule. The course page shows what it covers, who it is for, every class date and the single fee in Pakistani rupees." },
  { q: "How much does a course cost?", a: "One price for the whole course, always in rupees. You see the exact fee before you enrol — no subscriptions and no extras." },
  { q: "What if I miss a class?", a: "You can still enrol until the final class starts. Classes you miss are listed on your dashboard so you know where you stand." },
  { q: "What if I need to cancel?", a: "Up to {notice} before the first class, you can cancel from your dashboard for a full refund to your POINT B balance. After that there is no refund. Contact support if something goes wrong with a class." },
  { q: "How do the video classes work?", a: "Classes run in your browser, with nothing to install. The room opens 10 minutes before the start, and we remind you ahead of each class." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero. Background video from public/hero.mp4 (or NEXT_PUBLIC_HERO_VIDEO_URL); public/hero.jpg is the poster and fallback. */}
      <section
        className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden text-white"
        style={{
          backgroundImage:
            "url(/hero.jpg), radial-gradient(900px 600px at 72% 35%, #8a6a3e, transparent 70%), radial-gradient(700px 500px at 10% 90%, #3c4a3a, transparent 70%), linear-gradient(135deg, #2b2620, #15130f)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <HeroVideo />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.18)_45%,rgba(0,0,0,0.7)_100%)]" />
        <Container className="pb-10 pt-32">
          <div className="animate-rise"><FacultyBadge /></div>
          <h1 style={{ ["--rise-delay" as string]: "120ms" }} className="animate-rise mt-5 max-w-5xl font-display text-[3rem] leading-[0.98] sm:text-[5.2rem] lg:text-[6.6rem]">
            Learn from leaders who&rsquo;ve already been there
          </h1>
          <p style={{ ["--rise-delay" as string]: "260ms" }} className="animate-rise mt-6 max-w-lg text-lg leading-relaxed text-white/85">
            Live courses taught for Pakistan by an invited faculty — one clear syllabus, every class date, one price in rupees.
          </p>
          <div style={{ ["--rise-delay" as string]: "380ms" }} className="animate-rise"><Button href="/courses" variant="light" size="lg" className="mt-8 px-8">See the courses <span aria-hidden>→</span></Button></div>
          <div style={{ ["--rise-delay" as string]: "520ms" }} className="animate-rise mt-16"><HeroCourses /></div>
        </Container>
      </section>

      {/* Faculty */}
      <section className="overflow-hidden py-24 sm:py-28">
        <Container>
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading title={<>Faculty who&rsquo;ve <Mark>done the work</Mark>.</>} description="Senior leaders invited to teach. Real careers, clear courses, taught live for people working and studying in Pakistan." />
            <Link href="/mentors" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">Meet the faculty <span aria-hidden>›</span></Link>
          </Reveal>
          <FacultyGrid />
        </Container>
      </section>

      {/* Courses */}
      <section className="pb-24 sm:pb-28">
        <Container>
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl">Courses open <Mark color="sky">now</Mark></h2>
              <p className="mt-3 text-sm text-ink-soft">One fee for every class. Enrol, then join from your dashboard.</p>
            </div>
            <Link href="/courses" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">View all courses <span aria-hidden>›</span></Link>
          </Reveal>
          <CourseGrid />
        </Container>
      </section>

      {/* Don't go it alone */}
      <section className="bg-white py-24 sm:py-32">
        <Container className="text-center">
          <Reveal><h2 className="font-display text-[2.8rem] leading-[1.02] text-ink sm:text-7xl">Don&rsquo;t figure it out alone.</h2></Reveal>
          <Reveal delay={120}><p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            You&rsquo;re capable and driven, but generic articles don&rsquo;t know your situation. You need people who have led through what you&rsquo;re facing — teaching live, week by week.
          </p></Reveal>
          <Reveal delay={200} className="mt-10"><Button href="/courses" size="lg">Browse courses</Button></Reveal>
        </Container>
      </section>

      {/* Statements */}
      <section className="py-24 sm:py-32">
        <Container className="space-y-16 text-center sm:space-y-24">
          <ScrollStatement className="font-display text-[2.2rem] leading-[1.1] text-ink sm:text-6xl" parts={["Hear it from someone who’s ", { mark: "done the job", color: "mint" }, "."]} />
          <ScrollStatement className="font-display text-[2.2rem] leading-[1.1] text-ink sm:text-6xl" parts={["Get ", { mark: "specific answers", color: "sky" }, " in a live classroom."]} />
          <ScrollStatement className="font-display text-[2.2rem] leading-[1.1] text-ink sm:text-6xl" parts={["One price in ", { mark: "rupees", color: "peach" }, ", every class included."]} />
        </Container>
      </section>

      {/* How it works */}
      <section className="pb-24 sm:pb-32">
        <Container>
          <Reveal className="text-center">
            <p className="text-sm font-medium text-ink">How it works</p>
            <h2 className="mx-auto mt-2 max-w-xl font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl">Clarity starts with one good course.</h2>
          </Reveal>
          <div className="mx-auto mt-14 max-w-2xl">
            {STEPS.map((s, i) => (
              <div key={s.title} className={`${s.bg} sticky rounded-[2rem] px-8 py-14 text-center shadow-[0_-12px_40px_-24px_rgba(17,17,17,0.35)] sm:px-16 ${i < STEPS.length - 1 ? "mb-[22vh]" : ""}`} style={{ top: `${110 + i * 26}px`, zIndex: i + 1 }}>
                <div className="flex justify-center gap-1" aria-hidden>{Array.from({ length: s.dots }, (_, d) => <span key={d} className="h-5 w-5 rounded-full bg-ink" />)}</div>
                <p className="mt-6 font-display text-3xl text-ink sm:text-4xl">{s.title}</p>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink/75">{s.body}</p>
              </div>
            ))}
            <div className="h-[30vh]" aria-hidden />
          </div>
        </Container>
      </section>

      {/* Promise */}
      <section className="pb-24 sm:pb-32">
        <Container>
          <Reveal className="rounded-[2.25rem] bg-sky px-8 py-16 sm:px-16 sm:py-24">
            <p className="max-w-4xl font-display text-[2.2rem] leading-[1.12] text-ink sm:text-[3.6rem]">
              &ldquo;A course with the right teacher can change how you show up at work. That is the whole idea behind POINT B.&rdquo;
            </p>
            <p className="mt-10 text-sm font-medium text-ink">The POINT B promise</p>
            <p className="text-sm text-ink/70">Invited faculty · Honest pricing in rupees · Live classes on Pakistan time</p>
          </Reveal>
        </Container>
      </section>

      {/* FAQ */}
      <section className="pb-24 sm:pb-32">
        <Container className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal><h2 className="font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl">Frequently asked.<br />Clearly answered.</h2></Reveal>
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}><details className="group rounded-2xl bg-paper-dim px-6 py-5">
                <summary className="flex cursor-pointer items-center justify-between gap-6 text-[0.95rem] font-medium text-ink">
                  {f.q}
                  <span className="faq-plus text-xl font-light transition-transform" aria-hidden>+</span>
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft"><NoticeText text={f.a} /></p>
              </details></Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Closing call to action */}
      <section className="pb-24">
        <Container>
          <Reveal className="rounded-[2.25rem] bg-ink px-8 py-16 text-center text-white sm:px-16 sm:py-24">
            <h2 className="mx-auto max-w-3xl font-display text-[2.6rem] leading-[1.02] sm:text-7xl">Your next step starts with <Mark color="lemon"><span className="text-ink">one course</span></Mark>.</h2>
            <p className="mx-auto mt-6 max-w-lg text-white/70">Find a course taught by someone who has solved what you&rsquo;re facing, and learn it live.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button href="/courses" variant="light" size="lg">See the courses</Button>
              <Button href="/become-a-mentor" variant="glass" size="lg">Teach with us</Button>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
