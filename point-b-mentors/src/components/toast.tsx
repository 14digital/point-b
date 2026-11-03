"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Tone = "success" | "error";
interface Toast { id: number; tone: Tone; text: string }
type Show = (text: string, tone?: Tone) => void;

const Ctx = createContext<Show>(() => undefined);

/** Shows a short confirmation in the corner of the screen. */
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback<Show>((text, tone = "success") => {
    const id = next.current++;
    setItems((all) => [...all.slice(-2), { id, tone, text }]);
    // Errors stay a little longer so there's time to read what went wrong.
    setTimeout(() => dismiss(id), tone === "error" ? 7000 : 3500);
  }, [dismiss]);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[110] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-[pop_160ms_ease-out] items-start gap-3 rounded-2xl bg-ink px-4 py-3.5 text-sm text-white shadow-[0_20px_50px_-20px_rgba(17,17,17,0.6)]">
            <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${t.tone === "success" ? "bg-mint text-ink" : "bg-rust text-white"}`}>
              {t.tone === "success"
                ? <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                : <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 4v7M10 15.5h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>}
            </span>
            <p className="min-w-0 flex-1 leading-snug">{t.text}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
              <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
