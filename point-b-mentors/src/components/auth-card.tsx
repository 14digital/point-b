import type { ReactNode } from "react";
import { Container } from "./ui";

/** Centred card used by the password pages, matching the sign-in page. */
export function AuthCard({ eyebrow, title, subtitle, children }: { eyebrow: string; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[420px] w-[420px] rounded-full bg-sky/50 blur-[120px]" />
      <Container className="relative py-16 sm:py-24">
        <div className="mx-auto max-w-md">
          <p className="animate-rise text-sm font-medium text-brass-dark">{eyebrow}</p>
          <h1 className="animate-rise mt-3 font-display text-5xl leading-[1.02] text-ink" style={{ ["--rise-delay" as string]: "60ms" }}>{title}</h1>
          {subtitle && <p className="animate-rise mt-4 leading-relaxed text-ink-soft" style={{ ["--rise-delay" as string]: "120ms" }}>{subtitle}</p>}
          <div className="animate-rise mt-8 rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-45px_rgba(17,17,17,0.35)] ring-1 ring-ink/5 sm:p-8" style={{ ["--rise-delay" as string]: "160ms" }}>
            {children}
          </div>
        </div>
      </Container>
    </div>
  );
}
