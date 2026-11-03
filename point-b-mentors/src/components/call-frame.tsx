"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui";

/** The embedded video call, shared by mentoring sessions and mentor interviews. */
export function CallFrame({ url, token, title, note, onLeave }: { url: string; token: string; title: ReactNode; note: string; onLeave: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const leave = useRef(onLeave);
  useEffect(() => { leave.current = onLeave; });

  useEffect(() => {
    let frame: import("@daily-co/daily-js").DailyCall | null = null;
    let cancelled = false;
    (async () => {
      try {
        const Daily = (await import("@daily-co/daily-js")).default;
        if (cancelled || !box.current) return;
        // Dev StrictMode mounts twice and Daily allows one call object per page: clear any leftover first.
        const stale = Daily.getCallInstance();
        if (stale) await stale.destroy();
        if (cancelled || !box.current) return;
        frame = Daily.createFrame(box.current, {
          iframeStyle: { width: "100%", height: "100%", border: "0", borderRadius: "16px" },
          showLeaveButton: true,
          showFullscreenButton: true,
        });
        let failed = false;
        // A failed join also emits left-meeting; only a deliberate leave should return to the dashboard.
        frame.on("left-meeting", () => { if (!cancelled && !failed) leave.current(); });
        frame.on("error", (e) => { failed = true; console.error("[daily]", e); setError(callError(e?.errorMsg)); });
        await frame.join({ url, token });
      } catch (e) {
        if (!cancelled) setError(callError((e as { errorMsg?: string })?.errorMsg) );
      }
    })();
    return () => {
      // Flag first so tearing the frame down is not mistaken for the user leaving.
      cancelled = true;
      frame?.destroy().catch(() => undefined);
    };
    // The join credentials are fixed for the life of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-ink/95 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-paper">
        <p className="text-sm">{title}</p>
        <p className="text-xs text-paper/60">{note}</p>
      </div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <div ref={box} className="min-h-0 flex-1" />
    </div>
  );
}

function callError(code?: string) {
  if (code === "account-missing-payment-method") return "Video calling isn't available yet: the platform's video account needs a payment method added. Please contact support.";
  return code ? `The call could not start (${code}). Please try again or contact support.` : "The call hit a problem. Please try again.";
}

