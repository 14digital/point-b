"use client";

/**
 * A short, soft two-note chime for new chat messages, made with the Web Audio API so there's no file to load.
 * Browsers only allow sound after the person has interacted with the page, so the first tap or key press unlocks it.
 * Anyone can mute it; the choice is remembered in this browser.
 */

const MUTE_KEY = "pointb.sound.muted";
let ctx: AudioContext | null = null;
let lastPlayed = 0;

function audio() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  return (ctx ??= new Ctx());
}

// Unlock on the first interaction, so a message that arrives later can be heard.
if (typeof window !== "undefined") {
  const unlock = () => { const a = audio(); if (a?.state === "suspended") a.resume().catch(() => undefined); };
  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function soundMuted() {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}
export function setSoundMuted(muted: boolean) {
  try { if (muted) localStorage.setItem(MUTE_KEY, "1"); else localStorage.removeItem(MUTE_KEY); } catch { /* storage unavailable */ }
}

/** "incoming": a gentle rising chime. "sent": a quieter single tick when you send. */
export function playChime(kind: "incoming" | "sent" = "incoming") {
  if (soundMuted()) return;
  const now = Date.now();
  if (kind === "incoming" && now - lastPlayed < 900) return; // several messages at once make one sound
  lastPlayed = now;
  const a = audio();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + 0.01;
  const out = a.createGain();
  out.gain.value = kind === "incoming" ? 0.16 : 0.08;
  out.connect(a.destination);
  const notes = kind === "incoming" ? [[880, 0], [1318.5, 0.11]] : [[1046.5, 0]];
  for (const [freq, delay] of notes) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t + delay;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(1, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, start + (kind === "incoming" ? 0.42 : 0.16));
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + 0.5);
  }
}
