import Link from "next/link";
import { Badge, Container, SectionHeading, Button, Mark } from "@/components/ui";
import { Reveal } from "@/components/motion";

export const metadata = { title: "Become a Mentor — POINT B Mentors" };

const STAGES = [
  { tone: "bg-sky", title: "Apply", when: "About 10 minutes", text: "Tell us about your experience, what you can help with and when you're usually free.", statuses: ["Submitted"] },
  { tone: "bg-lilac", title: "Review", when: "Our team", text: "We read every application. If something needs clarifying, we'll email you a private link to update it.", statuses: ["Under review", "Shortlisted"] },
  { tone: "bg-peach", title: "Interview", when: "Video call", text: "A short conversation about your background, how you'd approach mentoring, and professional conduct.", statuses: ["Interview scheduled", "Interview completed"] },
  { tone: "bg-mint", title: "Go live", when: "Your profile", text: "Sign in, complete your profile, accept the mentor agreement and open your first times.", statuses: ["Approved", "Onboarding", "Active"] },
];

// Mirrors the admin interview scorecard.
const CRITERIA = [["Professional experience", 25], ["Subject expertise", 25], ["Communication", 20], ["Mentorship approach", 20], ["Professional conduct & safeguarding", 10]] as const;

const LEVELS = [["Professional", "Established in your field"], ["Senior Specialist", "Deep expertise, often leading others"], ["Executive / Industry Leader", "Senior leadership experience"]] as const;
export default function BecomeMentorPage() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="grid gap-10 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <Badge tone="forest">For professionals</Badge>
            <h1 className="mt-4 font-display text-5xl leading-[1.04] text-ink sm:text-6xl">
              Mentor on your own schedule, in 30-minute sessions.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">
              POINT B mentors are working professionals who set their own availability. There is
              no minimum commitment beyond the sessions you choose to accept, and every applicant
              goes through a short interview before being approved.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/become-a-mentor/apply" size="lg">
                Start your application
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border border-line bg-white p-8">
            <p className="font-display text-lg text-ink">Who we&rsquo;re looking for</p>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-soft">
              {[
                "Working professionals with genuine, recent experience in their field",
                "People who can explain their thinking clearly, not just their results",
                "A willingness to give direct, honest answers rather than general encouragement",
                "Comfort speaking with students and early-career professionals",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="relative overflow-x-clip border-b border-line py-20 sm:py-28">
        <div aria-hidden className="pointer-events-none absolute -left-40 top-20 h-[380px] w-[380px] rounded-full bg-mint/40 blur-[120px]" />
        <Container className="relative">
          <Reveal>
            <SectionHeading eyebrow="The process" title={<>From application to <Mark color="mint">active mentor</Mark></>} description="Four stages, each handled by a real person on our team. You'll get an email at every step, so you always know where you stand." />
          </Reveal>

          <ol className="relative mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STAGES.map((st, i) => (
              <Reveal as="li" key={st.title} delay={i * 90} className="relative flex flex-col rounded-3xl bg-white p-6 ring-1 ring-ink/5 transition-shadow hover:shadow-[0_20px_50px_-30px_rgba(17,17,17,0.35)]">
                <div className="flex items-center justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full font-display text-lg text-ink ${st.tone}`}>{i + 1}</span>
                  <span className="text-xs text-ink-soft">{st.when}</span>
                </div>
                <h3 className="mt-6 font-display text-3xl text-ink">{st.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{st.text}</p>
                <div className="mt-6 flex flex-wrap gap-1.5 border-t border-line pt-4">
                  {st.statuses.map((x) => (
                    <span key={x} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${x === "Active" ? "bg-forest text-white" : "bg-paper-dim text-ink-soft"}`}>{x}</span>
                  ))}
                </div>
              </Reveal>
            ))}
          </ol>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Reveal className="rounded-[2rem] bg-white p-8 ring-1 ring-ink/5 sm:p-10">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">How we assess applications</p>
              <h3 className="mt-3 font-display text-4xl leading-tight text-ink">A structured interview, scored out of 100</h3>
              <ul className="mt-8 space-y-4">
                {CRITERIA.map(([label, pts]) => (
                  <li key={label}>
                    <div className="flex items-baseline justify-between text-sm"><span className="text-ink">{label}</span><span className="text-ink-soft">{pts} pts</span></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-dim"><div className="h-full rounded-full bg-ink/80" style={{ width: `${(pts / 25) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
              <p className="mt-8 rounded-2xl bg-paper px-5 py-4 text-sm leading-relaxed text-ink-soft">
                A strong score never approves anyone on its own. We also verify identity and check suitability before a profile goes live.
              </p>
            </Reveal>

            <Reveal delay={90} className="flex flex-col rounded-[2rem] bg-ink p-8 text-white sm:p-10">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/50">Pricing and payouts</p>
              <h3 className="mt-3 font-display text-4xl leading-tight">Priced by experience, agreed with you</h3>
              <p className="mt-4 text-sm leading-relaxed text-white/65">
                Default session prices are set by mentor level, with room for individual adjustment. Commission and payout schedules are confirmed with you directly before your profile goes live.
              </p>
              <ul className="mt-8 flex-1 space-y-2">
                {LEVELS.map(([name, d], i) => (
                  <li key={name} className="flex items-center gap-4 rounded-2xl bg-white/[0.06] px-4 py-3.5">
                    <span className="font-display text-2xl text-white/40">0{i + 1}</span>
                    <span><span className="block text-sm text-white">{name}</span><span className="text-xs text-white/50">{d}</span></span>
                  </li>
                ))}
              </ul>
              <Link href="/pricing" className="group mt-8 inline-flex items-center gap-2 self-start text-sm font-medium text-white">
                See current session prices
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink transition-transform group-hover:translate-x-1">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </Link>
            </Reveal>
          </div>
        </Container>
      </section>

      <section className="py-16">
        <Container className="flex flex-col items-start gap-5 rounded-3xl bg-ink px-8 py-12 text-paper sm:px-12">
          <h2 className="font-display text-3xl tracking-tight">Ready to apply?</h2>
          <p className="max-w-xl text-paper/75">
            The application takes around ten minutes, and you can review everything before you send it.
          </p>
          <Button href="/become-a-mentor/apply" variant="secondary" className="border-paper/30 text-paper hover:border-paper/60">
            Start your application
          </Button>
        </Container>
      </section>
    </>
  );
}
