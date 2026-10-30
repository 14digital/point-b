"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Full-bleed background video for the home hero. Plays muted and looped, fades in once it can play,
 * and stays hidden (leaving the gradient behind it) if no video file exists. Respects reduced motion
 * and offers a pause control, since moving backgrounds can be distracting.
 *
 * Source: NEXT_PUBLIC_HERO_VIDEO_URL if set (e.g. a CDN), otherwise public/hero.mp4.
 */
const REMOTE = process.env.NEXT_PUBLIC_HERO_VIDEO_URL;

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // These events can fire before hydration attaches React's handlers, so check the element's state too.
    const sync = () => {
      if (v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) setFailed(true);
      else if (v.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) setReady(true);
    };
    sync();
    const late = setTimeout(sync, 1500);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (reduce.matches) { v.pause(); setPaused(true); } else { v.play().catch(() => setPaused(true)); }
    };
    apply();
    reduce.addEventListener("change", apply);
    return () => { clearTimeout(late); reduce.removeEventListener("change", apply); };
  }, []);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play().then(() => setPaused(false)).catch(() => undefined); } else { v.pause(); setPaused(true); }
  }

  if (failed) return null;

  return (
    <>
      <video
        ref={ref}
        aria-hidden
        className={`absolute inset-0 -z-10 h-full w-full object-cover transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/hero.jpg"
        onCanPlay={() => setReady(true)}
        onError={() => setFailed(true)}
      >
        {REMOTE ? <source src={REMOTE} onError={() => setFailed(true)} /> : (
          <source src="/hero.mp4" type="video/mp4" onError={() => setFailed(true)} />
        )}
      </video>
      {ready && (
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? "Play background video" : "Pause background video"}
          className="absolute right-6 top-24 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white backdrop-blur transition-colors hover:bg-black/40"
        >
          {paused
            ? <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M6 4l10 6-10 6V4z" /></svg>
            : <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden><rect x="5" y="4" width="3.5" height="12" rx="1" /><rect x="11.5" y="4" width="3.5" height="12" rx="1" /></svg>}
        </button>
      )}
    </>
  );
}
