"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    } } };
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";
let loading: Promise<void> | null = null;

function loadGoogle() {
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; s.remove(); reject(new Error("Google sign-in could not load")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** "Continue with Google", shown only when the server has a Google client ID. Followed by an "or" line above the email form. */
export function GoogleButton({ showTerms, onCredential }: { showTerms: boolean; onCredential: (credential: string) => void }) {
  const [clientId, setClientId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(onCredential);
  useEffect(() => { latest.current = onCredential; });

  useEffect(() => {
    let alive = true;
    api<{ clientId: string | null }>("/auth/google/config").then((r) => { if (alive) setClientId(r.clientId); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    loadGoogle().then(() => {
      if (!alive || !box.current || !window.google) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => latest.current(r.credential) });
      window.google.accounts.id.renderButton(box.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: Math.min(box.current.clientWidth, 400) });
    }).catch(() => { if (alive) setClientId(null); });
    return () => { alive = false; };
  }, [clientId]);

  if (!clientId) return null;
  return (
    <div className="mt-7">
      <div ref={box} className="flex min-h-10 justify-center" />
      {showTerms && (
        <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-soft">
          New here? Continuing creates a free account and means you agree to our <Link className="underline underline-offset-2 hover:text-ink" href="/legal?tab=terms">terms</Link> and <Link className="underline underline-offset-2 hover:text-ink" href="/legal?tab=privacy">privacy policy</Link>.
        </p>
      )}
      <div className="mt-5 flex items-center gap-3 text-xs text-ink-soft" aria-hidden><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
    </div>
  );
}
