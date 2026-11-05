"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The admin's finance dialogs: a figure up top, details below, and an optional sticky footer for actions. */
export function FinanceModal({ label, eyebrow, title, total, totalNote, onClose, onBack, backLabel, footer, children }: {
  label: string; eyebrow: string; title: ReactNode; total: string; totalNote?: ReactNode;
  onClose: () => void; onBack?: () => void; backLabel?: string; footer?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-h-[86dvh] sm:rounded-[28px]">
        <header className="border-b border-line px-6 pb-5 pt-6 sm:px-8 sm:pt-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {onBack && (
                <button type="button" onClick={onBack} className="-ml-1 mb-3 inline-flex items-center gap-1 rounded-full px-1 text-xs font-medium text-ink-soft hover:text-ink">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {backLabel ?? "Back"}
                </button>
              )}
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass-dark">{eyebrow}</p>
              <h2 className="mt-1.5 text-sm text-ink-soft">{title}</h2>
            </div>
            <button autoFocus onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft hover:bg-paper-dim hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
          <p className="font-display text-[2.75rem] leading-tight text-ink tabular-nums">{total}</p>
          {totalNote && <div className="text-sm text-ink-soft">{totalNote}</div>}
        </header>
        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6 sm:px-8">{children}</div>
        {footer && <footer className="border-t border-line bg-white px-6 py-4 sm:px-8">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export const SectionTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">{children}</h3>
    {aside}
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-2xl bg-paper px-4 py-6 text-center text-sm text-ink-soft">{children}</p>;

/** A sum written out: each part, then the result. */
export function Sum({ lines }: { lines: [string, string, boolean?][] }) {
  return (
    <dl className="rounded-2xl bg-paper px-4 py-2 text-sm">
      {lines.map(([label, value, total]) => (
        <div key={label} className={`flex justify-between gap-4 py-2 ${total ? "border-t border-line font-medium text-ink" : "text-ink-soft"}`}>
          <dt>{label}</dt><dd className="whitespace-nowrap tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
