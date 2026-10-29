import { Container, SectionHeading, Button } from "@/components/ui";

export const metadata = { title: "About POINT B" };

export default function AboutPage() {
  return (
    <Container className="py-16">
      <SectionHeading
        eyebrow="About"
        title="POINT B is a professional development ecosystem, starting with mentorship."
        description="We're building two complementary services: POINT B Mentors, an online marketplace for 30-minute conversations with experienced professionals, and POINT B Academy, a physical learning institution opening in Lahore."
      />

      <div className="mt-14 grid gap-10 sm:grid-cols-2">
        <div>
          <p className="font-display text-lg text-ink">Why we started with mentorship</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Good advice is often available, but hard to reach — locked inside personal networks
            that not everyone has. POINT B Mentors makes a short, focused conversation with an
            experienced professional something anyone can book directly, at a transparent price.
          </p>
        </div>
        <div>
          <p className="font-display text-lg text-ink">Standards we hold ourselves to</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Every mentor is screened and interviewed before they can accept bookings. We don&rsquo;t
            publish fabricated testimonials or statistics, and we clearly label demonstration
            content wherever it appears on this platform.
          </p>
        </div>
      </div>

      <div className="mt-14 rounded-2xl border border-line bg-paper-dim/60 p-8">
        <p className="font-display text-lg text-ink">Where things stand today</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          POINT B Mentors is in pre-launch. The mentors shown across this site are illustrative
          profiles used to demonstrate the product, not live bookings. POINT B Academy has not yet
          opened — see its page for details.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button href="/mentors">Explore mentors</Button>
        <Button href="/contact" variant="secondary">
          Contact us
        </Button>
      </div>
    </Container>
  );
}
