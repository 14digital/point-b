"use client";

import { useEffect, useRef, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { track } from "@/lib/track";
import { prepare } from "@/components/photo-upload";

/** What the API read from the profile. Empty strings and arrays mean "not on the profile". */
export interface LinkedInProfile {
  fullName: string; email: string; headline: string; currentRole: string; organization: string; yearsExperience: number | null;
  industry: string; country: string; city: string; languages: string[]; qualifications: string; specialistAreas: string[]; topicsOffered: string[];
  linkedinUrl: string; found: string[];
  /** The headshot, already converted to a JPEG data URL in the browser. */
  photo: string | null;
}

/** How long to keep asking while LinkedIn data is fetched for the first time (usually 2 to 3 minutes). */
const WAIT_LIMIT_MS = 6 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STAGES = ["Finding your profile", "Reading your experience", "Filling in your application"];
const LABEL: Record<string, string> = {
  photo: "Photo", fullName: "Name", headline: "Headline", currentRole: "Current role", organization: "Organisation", yearsExperience: "Years of experience",
  industry: "Industry", country: "Country", city: "City", languages: "Languages", qualifications: "Qualifications", specialistAreas: "Strengths", topicsOffered: "Topics", email: "Email",
};

const LinkedInMark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" /></svg>
);
const Check = ({ size = 12 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** Turns the photo the API sent into the same small JPEG a manual upload produces. */
async function asJpeg(dataUrl: string | null) {
  if (!dataUrl) return null;
  try { return await prepare(await (await fetch(dataUrl)).blob(), 100); } catch { return null; }
}

/**
 * "Start with LinkedIn": paste a profile link and the application fills itself in. Shown only when the API has a
 * profile-data service configured; the applicant can always skip it and type their details.
 */
export function LinkedInImport({ onImport }: { onImport: (p: LinkedInProfile) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<LinkedInProfile | null>(null);
  const [hidden, setHidden] = useState(false);
  // Set while the data service fetches a profile it hasn't seen before; the form keeps asking until it's ready.
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [, tick] = useState(0);
  const run_ = useRef(0);

  useEffect(() => {
    let live = true;
    api<{ enabled: boolean }>("/applications/linkedin/status").then((s) => live && setEnabled(s.enabled)).catch(() => {});
    return () => { live = false; };
  }, []);

  // The read takes 10 to 30 seconds; the stages move on so the wait feels like progress, and stop at the last one.
  useEffect(() => {
    if (!busy || waitingSince) return;
    const t = [setTimeout(() => setStage(1), 8000), setTimeout(() => setStage(2), 25000)];
    return () => t.forEach(clearTimeout);
  }, [busy, waitingSince]);

  // Redraws the "waiting" panel's clock every second.
  useEffect(() => {
    if (!waitingSince) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [waitingSince]);

  const valid = /linkedin\.com\/in\/[^/?#\s]+/i.test(url);

  async function run() {
    if (!valid || busy) return;
    const me = ++run_.current;
    setBusy(true); setStage(0); setError(null); setWaitingSince(null);
    track("linkedin_import_started");
    const started = Date.now();
    try {
      type Pending = { pending: true; ticket: string; retryInSeconds: number };
      let raw: LinkedInProfile | Pending;
      let ticket: string | undefined;
      for (;;) {
        raw = await api<LinkedInProfile | Pending>("/applications/linkedin", { body: { url: url.trim(), ...(ticket ? { ticket } : {}) } });
        if (me !== run_.current) return; // cancelled
        if (!("pending" in raw)) break;
        if (Date.now() - started > WAIT_LIMIT_MS) throw new Error("LinkedIn is taking longer than usual. Please try again in a few minutes, or fill in the form yourself.");
        ticket = raw.ticket;
        setWaitingSince((w) => w ?? started);
        await sleep(raw.retryInSeconds * 1000);
        if (me !== run_.current) return;
      }
      setWaitingSince(null); setStage(1);
      const profile = { ...raw, photo: await asJpeg(raw.photo) };
      if (!profile.photo) profile.found = profile.found.filter((f) => f !== "photo");
      onImport(profile);
      setDone(profile);
      track("linkedin_import_done", { label: String(profile.found.length) });
    } catch (e) {
      if (me === run_.current) setError(errMsg(e));
    } finally {
      if (me === run_.current) { setBusy(false); setWaitingSince(null); }
    }
  }

  function cancel() {
    run_.current++;
    setBusy(false); setWaitingSince(null);
  }

  if (!enabled || hidden) return null;

  if (done) {
    const missing = [!done.email && "email", "phone number"].filter(Boolean).join(" and ");
    return (
      <div className="animate-rise overflow-hidden rounded-3xl bg-mint/60 ring-1 ring-forest/15">
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <div className="relative shrink-0">
            {done.photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={done.photo} alt="" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white" />
              : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white font-display text-2xl text-ink">{done.fullName.charAt(0) || "?"}</span>}
            <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-forest text-white ring-2 ring-white"><Check /></span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-forest">Imported from LinkedIn</p>
            <p className="mt-1 truncate font-display text-2xl leading-tight text-ink">{done.fullName || "Your profile"}</p>
            {done.headline && <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{done.headline}</p>}
          </div>
          <button type="button" onClick={() => { setDone(null); setUrl(""); }} className="shrink-0 text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Use another</button>
        </div>
        <div className="border-t border-forest/10 bg-white/50 px-5 py-4 sm:px-6">
          <p className="text-sm text-ink">We filled in <span className="font-medium">{done.found.length} details</span> across all three steps. Check each one before you send.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {done.found.filter((f) => LABEL[f]).map((f) => (
              <span key={f} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-ink ring-1 ring-forest/15"><span className="text-forest"><Check size={10} /></span>{LABEL[f]}</span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">LinkedIn doesn&rsquo;t share your {missing}, so please add {missing.includes(" and ") ? "them" : "it"} below.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky/70 via-white to-mint/50 p-5 ring-1 ring-ink/5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/60 blur-2xl" />
      <div className="relative flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0A66C2] text-white shadow-[0_10px_24px_-12px_rgba(10,102,194,0.8)]"><LinkedInMark size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl leading-tight text-ink">Start with your LinkedIn profile</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">Paste your profile link and we&rsquo;ll fill in your photo, role, experience, qualifications and strengths. You can check and change everything before you send.</p>
        </div>
      </div>

      {busy && waitingSince ? (
        <div className="relative mt-5 rounded-2xl bg-white/80 p-4 ring-1 ring-ink/5" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#0A66C2]/25" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#0A66C2]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">LinkedIn is preparing your profile</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">Some profiles take a minute or two longer to collect. We&rsquo;ll keep checking and fill in your form the moment it&rsquo;s ready. Meanwhile you can add your email and phone number below.</p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-ink-soft">{(() => { const s = Math.floor((Date.now() - waitingSince) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; })()}</span>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-paper-dim"><div className="h-full rounded-full bg-[#0A66C2] transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(95, 30 + ((Date.now() - waitingSince) / 150_000) * 65)}%` }} /></div>
          <div className="mt-2.5 flex justify-end"><button type="button" onClick={cancel} className="text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Cancel</button></div>
        </div>
      ) : busy ? (
        <div className="relative mt-5 rounded-2xl bg-white/80 p-4 ring-1 ring-ink/5" role="status" aria-live="polite">
          <ol className="space-y-2.5">
            {STAGES.map((s, i) => (
              <li key={s} className={`flex items-center gap-3 text-sm transition-colors ${i <= stage ? "text-ink" : "text-ink-soft/50"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${i < stage ? "bg-forest text-white" : i === stage ? "border-2 border-ink/15 border-t-ink animate-spin" : "border border-ink/15"}`}>{i < stage && <Check size={10} />}</span>
                <span>{s}{i === stage ? "…" : ""}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-paper-dim"><div className="h-full rounded-full bg-[#0A66C2] transition-all duration-[4000ms] ease-out" style={{ width: `${[30, 65, 92][stage]}%` }} /></div>
          <p className="mt-2.5 text-xs text-ink-soft">This usually takes under a minute.</p>
        </div>
      ) : (
        <>
          <form className="relative mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run(); }}>
            <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-4 ring-1 ring-ink/10 transition-shadow focus-within:ring-2 focus-within:ring-[#0A66C2]/40">
              <span className="text-[#0A66C2]"><LinkedInMark size={16} /></span>
              <span className="sr-only">Your LinkedIn profile link</span>
              <input value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} inputMode="url" autoComplete="url" placeholder="linkedin.com/in/your-name"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft/60" />
            </label>
            <button type="submit" disabled={!valid} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-white transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink/30">
              Import profile
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </form>
          {error
            ? <p role="alert" className="relative mt-3 rounded-2xl bg-rust-pale px-4 py-2.5 text-xs leading-relaxed text-rust">{error}</p>
            : <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
                <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="4" y="9" width="12" height="8.5" rx="2" /><path d="M7 9V6.5a3 3 0 016 0V9" /></svg>Only your public profile is read. We never post or connect.</span>
                <button type="button" onClick={() => setHidden(true)} className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">I&rsquo;ll fill it in myself</button>
              </div>}
        </>
      )}
    </div>
  );
}
