/** POINT B mark: a ring and a solid dot, "from here to point B". Text uses the display font. */
export function Logo({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const c = tone === "light" ? "#ffffff" : "var(--color-ink)";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} style={{ color: c }}>
      <svg width="30" height="20" viewBox="0 0 30 20" fill="none" aria-hidden>
        <circle cx="9" cy="10" r="7.5" stroke="currentColor" strokeWidth="2" />
        <circle cx="21" cy="10" r="7.5" fill="currentColor" />
      </svg>
      <span className="font-display text-[1.6rem] leading-none">
        POINT B <span style={{ color: tone === "light" ? "#e9c880" : "var(--color-brass-dark)" }}>Mentors</span>
      </span>
    </span>
  );
}
