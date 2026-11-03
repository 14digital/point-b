import { getToken } from "./api";

const BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
const VISITOR_KEY = "pointb.visitor";
const SEEN_KEY = "pointb.visit";

type TrackEvent = { type: string; page?: string; label?: string; reference?: string };

let queue: TrackEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let last: { type: string; page: string; label?: string; at: number } | null = null;

/** Random ID for this browser, holding no personal data. Lets a guest's steps be followed and later linked on sign-up. */
function visitorId(): string | undefined {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(VISITOR_KEY, id); }
    return id;
  } catch { return undefined; }
}

/** A new ID after signing out, so the next person on this browser isn't linked to the last one. */
export function resetVisitor() {
  try { localStorage.removeItem(VISITOR_KEY); sessionStorage.removeItem(SEEN_KEY); } catch { /* storage unavailable */ }
}

function device() {
  const ua = navigator.userAgent;
  const kind = /iPad|Tablet/i.test(ua) ? "Tablet" : /Mobi|Android/i.test(ua) ? "Mobile" : "Desktop";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other browser";
  return `${kind} · ${browser}`;
}

/** The other site this visit came from, once per visit: the host only, never the full address. */
function referrer() {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return undefined;
    sessionStorage.setItem(SEEN_KEY, "1");
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    return host && host !== location.hostname ? host.slice(0, 120) : undefined;
  } catch { return undefined; }
}

/** Sends queued events. keepalive lets the last batch finish even as the tab closes. */
export function flushActivity() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const token = getToken();
  const events = queue.slice(0, 30);
  queue = queue.slice(30);
  const id = visitorId();
  if (token || id) {
    fetch(`${BASE}/activity/track`, {
      method: "POST", keepalive: true,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ visitorId: id, device: device(), referrer: referrer(), events }),
    }).catch(() => undefined); // tracking must never get in the way of the page
  }
  if (queue.length) timer = setTimeout(flushActivity, 500);
}

/** Records something the user did. Only the page's path is sent, never its query string (which can hold tokens). */
export function track(type: string, details: { label?: string; reference?: string } = {}) {
  if (typeof window === "undefined") return;
  // Guests whose browser asks not to be tracked aren't.
  if (!getToken() && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  const page = window.location.pathname;
  // The same thing twice in a row within a moment is one action.
  const now = Date.now();
  if (last && last.type === type && last.page === page && last.label === details.label && now - last.at < 1000) return;
  last = { type, page, label: details.label, at: now };
  queue.push({ type, page, ...details });
  if (!timer) timer = setTimeout(flushActivity, 3000);
}
