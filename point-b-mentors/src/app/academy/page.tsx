import { Container, SectionHeading, Badge, Button } from "@/components/ui";

export const metadata = { title: "POINT B Academy — Coming Soon" };

export default function AcademyPage() {
  return (
    <Container className="py-16">
      <Badge tone="brass">Coming later</Badge>
      <h1 className="mt-4 max-w-2xl font-display text-5xl leading-[1.04] text-ink sm:text-6xl">
        POINT B Academy — a physical learning institution in Lahore.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
        Alongside POINT B Mentors, we are building a physical academy delivering structured,
        in-person professional development. The Academy is a separate initiative with its own
        trainers, curriculum and recruitment — mentors on this platform are not required to teach
        at the Academy, and Academy trainers are not required to mentor online.
      </p>

      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        <SectionHeading title="What stays the same" description="The POINT B name, our approach to screening instructors, and our focus on practical, honest advice over generic coursework." />
        <SectionHeading title="What's different" description="In-person, structured programmes delivered from a physical site in Lahore, with their own schedule and enrolment process." />
      </div>

      <div className="mt-12 rounded-3xl border border-line bg-white p-8">
        <p className="font-display text-lg text-ink">Register your interest</p>
        <p className="mt-2 max-w-md text-sm text-ink-soft">
          Leave your details and we&rsquo;ll contact you once enrolment opens. This is a demonstration
          form — no information is sent anywhere in this prototype.
        </p>
        <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input" placeholder="Full name" />
          <input className="input" placeholder="Email address" type="email" />
          <Button type="submit">Notify me</Button>
        </form>
      </div>
    </Container>
  );
}
