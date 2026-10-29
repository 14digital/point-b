import Link from "next/link";
import { Container } from "./ui";
import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "/mentors?category=LOCAL", label: "Local mentors" },
      { href: "/mentors?category=INTERNATIONAL", label: "International mentors" },
      { href: "/pricing", label: "Pricing & packages" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Mentors",
    links: [
      { href: "/become-a-mentor", label: "Become a mentor" },
      { href: "/become-a-mentor/apply", label: "Apply now" },
      { href: "/sign-in", label: "Mentor sign in" },
    ],
  },
  {
    title: "POINT B",
    links: [
      { href: "/about", label: "About POINT B" },
      { href: "/academy", label: "POINT B Academy" },
      { href: "/contact", label: "Contact & support" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/legal?tab=terms", label: "Terms of use" },
      { href: "/legal?tab=privacy", label: "Privacy policy" },
      { href: "/legal?tab=refunds", label: "Rescheduling & refunds" },
      { href: "/legal?tab=safeguarding", label: "Safeguarding" },
    ],
  },
];

const PROMISES = ["Verified professionals", "Private video calls", "Free rescheduling up to 2 days before"];

export function Footer() {
  return (
    <footer className="px-3 pb-3 pt-16 sm:px-4 sm:pb-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-ink text-white sm:rounded-[2.5rem]">
        {/* Soft glow in the corner so the dark panel doesn't feel flat */}
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[420px] w-[420px] rounded-full bg-brass/25 blur-[120px]" />

        <Container className="relative pt-16 sm:pt-20">
          <div className="grid gap-12 lg:grid-cols-[300px_1fr] lg:gap-20">
            <div>
              <Logo tone="light" />
              <p className="mt-6 max-w-sm text-[0.95rem] leading-relaxed text-white/60">
                Private 30-minute conversations with experienced professionals. Part of the POINT B professional development ecosystem.
              </p>
              <ul className="mt-8 space-y-3">
                {PROMISES.map((p) => (
                  <li key={p} className="flex items-center gap-3 text-sm text-white/80">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10">
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="#e9c880" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <Link href="/mentors" className="group mt-10 inline-flex items-center gap-3 rounded-full bg-white py-2 pl-5 pr-2 text-sm font-medium text-ink transition-colors hover:bg-white/90">
                Find your mentor
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white transition-transform group-hover:translate-x-0.5">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </Link>
            </div>

            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
              {COLUMNS.map((col) => (
                <div key={col.title}>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/40">{col.title}</p>
                  <ul className="mt-5 space-y-3">
                    {col.links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="group inline-flex items-center gap-1 text-[0.95rem] text-white/75 transition-colors hover:text-white">
                          {l.label}
                          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden className="-translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"><path d="M7 13L13 7M8 7h5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-16 flex flex-col gap-4 border-t border-white/10 py-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} POINT B. All rights reserved.</p>
            <p className="sm:text-center">Prices shown in PKR for local mentors and GBP for international mentors.</p>
            <a href="#" className="inline-flex items-center gap-2 self-start text-white/60 transition-colors hover:text-white sm:self-auto">
              Back to top
              <span className="flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-white/20">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 16V4M5 9l5-5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            </a>
          </div>
        </Container>

        {/* Oversized wordmark, cropped by the panel's bottom edge */}
        <p aria-hidden className="relative -mb-[0.22em] select-none whitespace-nowrap text-center font-display text-[24vw] leading-none text-white/[0.06] lg:text-[17rem]">
          POINT B
        </p>
      </div>
    </footer>
  );
}
