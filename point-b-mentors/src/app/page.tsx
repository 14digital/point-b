import Link from "next/link";
import { Container, SectionHeading, Button, Mark } from "@/components/ui";
import { HeroBadge, HeroTopics, MentorBubbles, MentorCarousel, TopicTiles } from "@/components/home-widgets";
import { Reveal, ScrollStatement } from "@/components/motion";
import { HeroVideo } from "@/components/hero-video";

const STEPS = [
  { dots: 1, bg: "bg-peach", title: "Find your mentor", body: "Search by topic, background or price. Every profile shows real experience, reviews and open times." },
  { dots: 2, bg: "bg-sky", title: "Book a 30-minute session", body: "Go private with a 1:1, or share a group session for a lower price. Pick a time in your own timezone." },
  { dots: 3, bg: "bg-mint", title: "Talk, then come back", body: "Join from your dashboard, leave feedback in a minute, and rebook the same mentor as you progress." },
];

const FAQ = [
  { q: "Who are the mentors on POINT B?", a: "Working professionals who applied, were screened, interviewed and formally approved before they could accept a booking. Each profile lists real experience, not just job titles." },
  { q: "How do I know who is right for me?", a: "Search by topic or challenge, then read the profile: background, what they can and cannot help with, and reviews from other students. You book directly, with no back and forth." },
  { q: "What is the difference between 1:1 and group sessions?", a: "A 1:1 session is a private 30-minute call. A group session is shared with a few other students, so each person pays a lower price and gets a smaller share of the time." },
  { q: "How much does a session cost?", a: "Local mentors cost Rs 1,000 to Rs 2,500 and international mentors £25 to £60 for a private session. Group seats cost less. The price is always shown before you book." },
  { q: "What if I can\u2019t make my session?", a: "Reschedule it from your dashboard up to 2 days before the start, for free, and your payment carries over. Booked sessions can\u2019t be cancelled. If a mentor can\u2019t attend, our team arranges a new time or a full refund." },
  { q: "How do the video calls work?", a: "Sessions run in your browser, with nothing to install. The room opens 10 minutes before the start, and we email you a reminder 30 minutes ahead." },
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
        {/* Readability overlay, above the video and below the text */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.18)_45%,rgba(0,0,0,0.7)_100%)]" />
        <Container className="pb-10 pt-32">
          <div className="animate-rise"><HeroBadge /></div>
          <h1 style={{ ["--rise-delay" as string]: "120ms" }} className="animate-rise mt-5 max-w-5xl font-display text-[3rem] leading-[0.98] sm:text-[5.2rem] lg:text-[6.6rem]">
            Talk to people who&rsquo;ve already been there
          </h1>
          <p style={{ ["--rise-delay" as string]: "260ms" }} className="animate-rise mt-6 max-w-lg text-lg leading-relaxed text-white/85">
            Book a 30-minute call and get honest, specific advice from a professional a few steps ahead of you.
          </p>
          <div style={{ ["--rise-delay" as string]: "380ms" }} className="animate-rise"><Button href="/mentors" variant="light" size="lg" className="mt-8 px-8">Find my mentor <span aria-hidden>→</span></Button></div>
          <div style={{ ["--rise-delay" as string]: "520ms" }} className="animate-rise mt-16"><HeroTopics /></div>
        </Container>
      </section>

      {/* Mentors */}
      <section className="overflow-hidden py-24 sm:py-28">
        <Container>
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading title={<>Mentors who&rsquo;ve <Mark>done the work</Mark>.</>} description="They have built careers, made the hard calls and learned from them. Now they share what worked, honestly and from lived experience." />
            <Link href="/mentors" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">Find your mentor <span aria-hidden>›</span></Link>
          </Reveal>
          <Reveal delay={120}><MentorCarousel /></Reveal>
        </Container>
      </section>

      {/* Topics */}
      <section className="pb-24 sm:pb-28">
        <Container>
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl">Not sure <Mark color="sky">where to begin</Mark>?</h2>
              <p className="mt-3 text-sm text-ink-soft">Pick a topic and see who can help</p>
            </div>
            <Link href="/mentors" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">View all mentors <span aria-hidden>›</span></Link>
          </Reveal>
          <TopicTiles />
        </Container>
      </section>

      {/* Don't go it alone */}
      <section className="bg-white py-24 sm:py-32">
        <Container className="text-center">
          <Reveal><h2 className="font-display text-[2.8rem] leading-[1.02] text-ink sm:text-7xl">Don&rsquo;t figure it out alone.</h2></Reveal>
          <Reveal delay={120}><p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            You&rsquo;re capable and driven, but generic articles and advice threads don&rsquo;t know your situation. You don&rsquo;t need more content. You need someone who has been there.
          </p></Reveal>
          <MentorBubbles />
        </Container>
      </section>

      {/* Statements */}
      <section className="py-24 sm:py-32">
        <Container className="space-y-16 text-center sm:space-y-24">
          <ScrollStatement className="font-display text-[2.2rem] leading-[1.1] text-ink sm:text-6xl" parts={["Hear it from someone who’s ", { mark: "done the job", color: "mint" }, "."]} />
          <ScrollStatement className="font-display text-[2.2rem] leading-[1.1] text-ink sm:text-6xl" parts={["Get ", { mark: "specific answers", color: "sky" }, " to your actual situation."]} />
          <ScrollStatement className="font-display text-[2.2rem] leading-[1.1] text-ink sm:text-6xl" parts={["Come back to the ", { mark: "same mentor", color: "peach" }, " as you grow."]} />
        </Container>
      </section>

      {/* How it works */}
      <section className="pb-24 sm:pb-32">
        <Container>
          <Reveal className="text-center">
            <p className="text-sm font-medium text-ink">How it works</p>
            <h2 className="mx-auto mt-2 max-w-xl font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl">Clarity starts with one good conversation.</h2>
          </Reveal>
          {/* Each card sticks a little lower than the last, so they stack up as you scroll. The spacer at
              the end keeps the finished stack on screen briefly before the section moves on. */}
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
              &ldquo;Thirty minutes with the right person can save you months of guessing. That is the whole idea behind POINT B.&rdquo;
            </p>
            <p className="mt-10 text-sm font-medium text-ink">The POINT B promise</p>
            <p className="text-sm text-ink/70">Screened mentors · Honest pricing · Full refund if your mentor can&rsquo;t make it</p>
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
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </details></Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Closing call to action */}
      <section className="pb-24">
        <Container>
          <Reveal className="rounded-[2.25rem] bg-ink px-8 py-16 text-center text-white sm:px-16 sm:py-24">
            <h2 className="mx-auto max-w-3xl font-display text-[2.6rem] leading-[1.02] sm:text-7xl">Your next step starts with <Mark color="lemon"><span className="text-ink">one conversation</span></Mark>.</h2>
            <p className="mx-auto mt-6 max-w-lg text-white/70">Find a mentor who has solved what you&rsquo;re facing, and get advice that actually helps.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button href="/mentors" variant="light" size="lg">Find my mentor</Button>
              <Button href="/become-a-mentor" variant="glass" size="lg">Become a mentor</Button>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
