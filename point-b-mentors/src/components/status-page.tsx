import type { ReactNode } from "react";
import { Container } from "@/components/ui";

/** Quiet full-page message for "not found" and errors, built on the logo's ring and dot. */
export function StatusPage({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children: ReactNode }) {
  return (
    <Container className="flex min-h-[62vh] items-center py-20">
      <div className="mx-auto max-w-lg text-center">
        <svg width="148" height="24" viewBox="0 0 148 24" fill="none" aria-hidden className="mx-auto text-ink">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M32 12h84" stroke="var(--color-brass)" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 9" />
          <circle cx="136" cy="12" r="11" fill="currentColor" />
        </svg>
        <p className="mt-8 text-sm font-medium text-brass-dark">{eyebrow}</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] text-ink sm:text-6xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-ink-soft">{body}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </Container>
  );
}
