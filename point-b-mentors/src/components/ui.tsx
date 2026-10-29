import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { initials } from "@/lib/format";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "light" | "glass";
type ButtonSize = "md" | "lg" | "sm";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-soft",
  light: "bg-white text-ink hover:bg-white/90",
  glass: "border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20",
  secondary: "border border-ink/20 text-ink hover:border-ink/50 bg-transparent",
  ghost: "text-ink hover:bg-paper-dim",
  danger: "border border-rust/30 text-rust hover:bg-rust-pale",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-[0.95rem]",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  href,
  ...props
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  href?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "brass" | "forest" | "rust";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-paper-dim text-ink-soft",
    brass: "bg-brass-pale text-brass-dark",
    forest: "bg-forest-pale text-forest",
    rust: "bg-rust-pale text-rust",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl border border-line bg-white ${className}`}>{children}</div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && (
        <p className="mb-3 text-sm font-medium text-brass-dark">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl">
        {title}
      </h2>
      {description && <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-soft">{description}</p>}
    </div>
  );
}

const AVATAR_PALETTE = ["#a8792a", "#16332e", "#9a3324", "#3a3d45"];

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const letters = initials(name);
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const color = AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-display text-white"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.36 }}
    >
      {letters}
    </div>
  );
}

export function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-brass">
        <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L10 1.5z" />
      </svg>
      <span className="font-medium">{rating.toFixed(1)}</span>
      {reviewCount !== undefined && <span className="text-ink-soft">({reviewCount})</span>}
    </span>
  );
}

export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-brass/30 bg-brass-pale/60 px-4 py-3 text-sm text-brass-dark">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="mt-0.5 shrink-0">
        <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10 6.2v4.4M10 13.6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-8 py-14 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{description}</p>
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-rust/30 bg-rust-pale text-rust",
    success: "border-forest/30 bg-forest-pale text-forest",
    info: "border-brass/30 bg-brass-pale/60 text-brass-dark",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-paper-dim ${className}`} />;
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

const MARK = { lemon: "bg-lemon", sky: "bg-sky", mint: "bg-mint", peach: "bg-peach", lilac: "bg-lilac" } as const;

/** Pastel marker highlight for a few words inside a headline. */
export function Mark({ children, color = "lemon" }: { children: ReactNode; color?: keyof typeof MARK }) {
  return <span className={`mark ${MARK[color]}`}>{children}</span>;
}

const PASTELS = ["#f7c9a2", "#bfe6f4", "#cdeec3", "#fdf1a2", "#ddd3f5"];
export const pastelFor = (name: string) => PASTELS[name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % PASTELS.length];

/** Mentor headshot, or a pastel panel with large initials when no photo has been added. */
export function MentorPhoto({ name, photoUrl, className = "", initialsClass = "text-7xl" }: { name: string; photoUrl?: string | null; className?: string; initialsClass?: string }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center ${className}`} style={{ backgroundColor: pastelFor(name) }} aria-label={name}>
      <span className={`font-display text-ink/80 ${initialsClass}`}>{initials(name)}</span>
    </div>
  );
}
