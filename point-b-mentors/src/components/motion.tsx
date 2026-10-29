"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    // @ts-expect-error -- polymorphic tag shares the same ref type in practice
    <Tag ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** 0 when the element's top reaches the bottom of the screen, 1 once it has risen to the upper third. */
function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    if (reducedMotion()) { setP(1); return; }
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh * 0.92, end = vh * 0.38;
      setP(Math.min(1, Math.max(0, (start - r.top) / (start - end))));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, []);
  return [ref, p] as const;
}

const MARKS = { lemon: "var(--color-lemon)", sky: "var(--color-sky)", mint: "var(--color-mint)", peach: "var(--color-peach)", lilac: "var(--color-lilac)" } as const;
export type Part = string | { mark: string; color?: keyof typeof MARKS };

/**
 * A statement that "writes itself" as you scroll: words go from faint to solid one by one,
 * and the highlighted words get their marker swept in behind them.
 */
export function ScrollStatement({ parts, className = "" }: { parts: Part[]; className?: string }) {
  const [ref, p] = useScrollProgress<HTMLParagraphElement>();
  const words: { w: string; color?: keyof typeof MARKS; markIndex?: number }[] = [];
  parts.forEach((part) => {
    if (typeof part === "string") part.split(/(?<=\s)/).forEach((w) => w && words.push({ w }));
    else part.mark.split(/(?<=\s)/).forEach((w) => w && words.push({ w, color: part.color ?? "lemon" }));
  });
  const n = words.length;
  return (
    <p ref={ref} className={className}>
      {words.map((x, i) => {
        const local = Math.min(1, Math.max(0, p * (n + 2) - i));
        const style: CSSProperties = { opacity: 0.18 + 0.82 * local, transition: "opacity 0.15s linear" };
        if (x.color) {
          Object.assign(style, {
            backgroundImage: `linear-gradient(${MARKS[x.color]}, ${MARKS[x.color]})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${local * 100}% 100%`,
            WebkitBoxDecorationBreak: "clone",
            boxDecorationBreak: "clone",
          });
        }
        return <span key={i} style={style}>{x.w}</span>;
      })}
    </p>
  );
}
