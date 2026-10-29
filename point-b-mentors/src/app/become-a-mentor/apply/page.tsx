"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Container, Mark, Skeleton, Spinner } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { AGENDAS } from "@/lib/constants";

const INDUSTRIES = ["Banking & Financial Services", "Technology", "Marketing & Brand", "Entrepreneurship", "Operations & Supply Chain", "Human Resources", "Law & Compliance", "Healthcare", "Design", "Education", "Consulting", "Other"];

const STEPS = [
  { title: "About you", blurb: "How we can reach you, and where you're based." },
  { title: "Professional background", blurb: "The experience students will be learning from." },
  { title: "Mentoring preferences", blurb: "What you'd like to help with, and when." },
  { title: "Review & submit", blurb: "Check your details before sending." },
];

const NEXT = [
  ["Application", "You're here. It takes about 10 minutes."],
  ["Screening", "Our team reviews your experience and background."],
  ["Short interview", "A video call so we can get to know you."],
  ["Onboarding", "Set up your profile and open your first times."],
];

type Form = {
  fullName: string; email: string; phone: string; countryOfResidence: string; professionalLocation: string; linkedinUrl: string;
  headline: string; currentRole: string; organization: string; yearsExperience: string; industry: string;
  specialistAreas: string[]; qualifications: string; languages: string[]; previousMentorshipExperience: string;
  topicsOffered: string[]; preferredPricing: string; weeklyAvailability: string; motivation: string;
  participation: "Paid" | "Voluntary"; agreedToTerms: boolean;
};
type Errors = Partial<Record<keyof Form, string>>;

const withScheme = (u: string) => (u && !/^https?:\/\//i.test(u) ? `https://${u}` : u);

/** Same rules as the API, checked per step so problems surface where they are. */
function validate(step: number, f: Form): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (f.fullName.trim().length < 2) e.fullName = "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Please enter a valid email address.";
    if (f.phone.replace(/\D/g, "").length < 6) e.phone = "Please enter a phone number we can reach you on.";
    if (!/linkedin\.com\/.+/i.test(f.linkedinUrl)) e.linkedinUrl = "Please paste the link to your LinkedIn profile.";
    if (!f.countryOfResidence.trim()) e.countryOfResidence = "Required.";
    if (!f.professionalLocation.trim()) e.professionalLocation = "Required.";
  }
  if (step === 1) {
    if (f.headline.trim().length < 5) e.headline = "A short headline helps students understand your background.";
    if (!f.currentRole.trim()) e.currentRole = "Required.";
    if (!f.organization.trim()) e.organization = "Required.";
    const y = Number(f.yearsExperience);
    if (f.yearsExperience === "" || !Number.isInteger(y) || y < 0 || y > 60) e.yearsExperience = "Enter a whole number of years.";
    if (!f.specialistAreas.length) e.specialistAreas = "Add at least one area.";
    if (!f.languages.length) e.languages = "Add at least one language.";
  }
  if (step === 2) {
    if (!f.topicsOffered.length) e.topicsOffered = "Choose at least one topic.";
    if (!f.weeklyAvailability.trim()) e.weeklyAvailability = "Let us know roughly when you're free.";
    if (f.motivation.trim().length < 20) e.motivation = "Please write at least a couple of sentences (20+ characters).";
  }
  return e;
}

type UpdateInfo = Omit<Form, "yearsExperience" | "agreedToTerms"> & { yearsExperience: number; changesRequested: string | null; changesRequestedAt: string | null; expiresAt: string };

export default function ApplyPage() {
  return <Suspense fallback={null}><ApplyForm /></Suspense>;
}

function ApplyForm() {
  // ?update=<token> comes from the "Update your application" email the admin sends.
  const token = useSearchParams().get("update");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [form, setForm] = useState<Form>({
    fullName: "", email: "", phone: "", countryOfResidence: "", professionalLocation: "", linkedinUrl: "",
    headline: "", currentRole: "", organization: "", yearsExperience: "", industry: INDUSTRIES[0],
    specialistAreas: [], qualifications: "", languages: [], previousMentorshipExperience: "",
    topicsOffered: [], preferredPricing: "", weeklyAvailability: "", motivation: "", participation: "Paid", agreedToTerms: false,
  });
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<UpdateInfo>(`/applications/update/${encodeURIComponent(token)}`)
      .then((u) => {
        if (cancelled) return;
        setUpdate(u);
        const { changesRequested: _c, changesRequestedAt: _a, expiresAt: _e, ...fields } = u;
        void _c; void _a; void _e;
        setForm((f) => ({ ...f, ...fields, yearsExperience: String(fields.yearsExperience), agreedToTerms: false }));
      })
      .catch((e) => !cancelled && setLinkError(errMsg(e)));
    return () => { cancelled = true; };
  }, [token]);

  const errors = showErrors ? validate(step, form) : {};
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function go(to: number) {
    setStep(to); setShowErrors(false); setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function next() {
    if (Object.keys(validate(step, form)).length) { setShowErrors(true); return; }
    go(step + 1);
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = {
        ...form, linkedinUrl: withScheme(form.linkedinUrl.trim()), yearsExperience: Number(form.yearsExperience) || 0,
        preferredPricing: form.preferredPricing || "Standard rate",
      };
      if (token) {
        const { email: _email, ...rest } = body;
        void _email;
        await api(`/applications/update/${encodeURIComponent(token)}`, { method: "PUT", body: rest });
      } else {
        await api("/applications", { body });
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  if (token && linkError) {
    return (
      <Container className="py-24 sm:py-32">
        <div className="mx-auto max-w-lg text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-paper-dim text-ink-soft">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>
          </span>
          <h1 className="mt-8 font-display text-5xl text-ink">This link can&rsquo;t be used</h1>
          <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-soft">{linkError}</p>
          <div className="mt-10 flex justify-center gap-2">
            <Button href="/contact" variant="secondary">Contact the team</Button>
            <Button href="/">Back to home</Button>
          </div>
        </div>
      </Container>
    );
  }
  if (token && !update) {
    return <Container className="py-16"><Skeleton className="h-12 w-2/3" /><Skeleton className="mt-6 h-6 w-1/2" /><Skeleton className="mt-12 h-96 rounded-[28px]" /></Container>;
  }

  if (submitted && token) {
    return (
      <Container className="py-20 sm:py-28">
        <div className="mx-auto max-w-xl text-center">
          <span className="animate-rise mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest-pale text-forest">
            <svg width="28" height="28" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <h1 className="animate-rise mt-8 font-display text-5xl text-ink sm:text-6xl" style={{ ["--rise-delay" as string]: "80ms" }}>Updates sent</h1>
          <p className="animate-rise mt-5 text-[1.05rem] leading-relaxed text-ink-soft" style={{ ["--rise-delay" as string]: "140ms" }}>
            Thank you, {form.fullName.split(" ")[0]}. Your application is back with our team for review, and we&rsquo;ve emailed a confirmation to <span className="text-ink">{form.email}</span>. This update link has now been closed.
          </p>
          <div className="mt-10 flex justify-center"><Button href="/">Back to home</Button></div>
        </div>
      </Container>
    );
  }

  if (submitted) {
    return (
      <Container className="py-20 sm:py-28">
        <div className="mx-auto max-w-xl text-center">
          <span className="animate-rise mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest-pale text-forest">
            <svg width="28" height="28" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <h1 className="animate-rise mt-8 font-display text-5xl text-ink sm:text-6xl" style={{ ["--rise-delay" as string]: "80ms" }}>Application received</h1>
          <p className="animate-rise mt-5 text-[1.05rem] leading-relaxed text-ink-soft" style={{ ["--rise-delay" as string]: "140ms" }}>
            Thank you, {form.fullName.split(" ")[0]}. We&rsquo;ve emailed a confirmation to <span className="text-ink">{form.email}</span>. Here&rsquo;s what happens next.
          </p>
        </div>
        <ol className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-4">
          {NEXT.map(([t, d], i) => (
            <li key={t} className={`animate-rise rounded-3xl p-5 ${i === 0 ? "bg-mint" : "bg-white ring-1 ring-ink/5"}`} style={{ ["--rise-delay" as string]: `${200 + i * 60}ms` }}>
              <span className="text-xs font-medium text-ink-soft">{i === 0 ? "Done" : `Step ${i + 1}`}</span>
              <p className="mt-6 font-display text-2xl text-ink">{t}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{i === 0 ? "Received and in the queue." : d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex justify-center gap-2">
          <Button href="/" variant="secondary">Back to home</Button>
          <Button href="/mentors">Meet our mentors</Button>
        </div>
      </Container>
    );
  }

  return (
    <div className="relative overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[440px] w-[440px] rounded-full bg-mint/50 blur-[120px]" />
      <Container className="relative py-14 sm:py-16">
        <div className="max-w-2xl">
          <p className="animate-rise text-sm font-medium text-brass-dark">{update ? "Update your application" : "Mentor application"}</p>
          <h1 className="animate-rise mt-3 font-display text-5xl leading-[1.02] text-ink sm:text-6xl" style={{ ["--rise-delay" as string]: "60ms" }}>
            {update ? <>A few <Mark color="mint">quick changes</Mark></> : <>Share what <Mark color="mint">you&rsquo;ve learned</Mark></>}
          </h1>
          <p className="animate-rise mt-5 text-[1.05rem] leading-relaxed text-ink-soft" style={{ ["--rise-delay" as string]: "120ms" }}>
            {update
              ? "Your answers are filled in below. Make the changes our team asked for, check the review step, and send it back."
              : "Every mentor is screened and interviewed before their profile goes live, so students know they’re talking to someone who’s really been there."}
          </p>
        </div>

        {update?.changesRequested && (
          <div className="animate-rise mt-10 max-w-3xl rounded-3xl border-l-4 border-brass bg-white p-6 shadow-[0_20px_50px_-35px_rgba(17,17,17,0.35)] ring-1 ring-ink/5 sm:p-7" style={{ ["--rise-delay" as string]: "160ms" }}>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass-dark">What our team asked for{update.changesRequestedAt ? ` · ${new Date(update.changesRequestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : ""}</p>
            <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink">{update.changesRequested}</p>
            <p className="mt-4 text-xs text-ink-soft">This private link works once and expires on {new Date(update.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, or as soon as your application moves on.</p>
          </div>
        )}

        <div className="mt-12 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12">
          {/* Progress rail */}
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <ol className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
              {STEPS.map((s, i) => {
                const done = i < step, on = i === step;
                return (
                  <li key={s.title} className="shrink-0">
                    <button type="button" disabled={i > step} onClick={() => go(i)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors disabled:cursor-default ${on ? "bg-white shadow-sm ring-1 ring-ink/5" : done ? "hover:bg-white/60" : ""}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${done ? "bg-forest text-white" : on ? "bg-ink text-white" : "bg-paper-dim text-ink-soft"}`}>
                        {done ? <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}
                      </span>
                      <span className="whitespace-nowrap lg:whitespace-normal">
                        <span className={`block text-sm ${on ? "font-medium text-ink" : "text-ink-soft"}`}>{s.title}</span>
                        <span className="hidden text-xs text-ink-soft lg:block">{s.blurb}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mt-8 hidden rounded-3xl bg-paper-dim/70 p-6 lg:block">
              <p className="text-sm font-medium text-ink">After you apply</p>
              <ol className="mt-4 space-y-4 border-l border-ink/10 pl-4">
                {NEXT.slice(1).map(([t, d]) => (
                  <li key={t} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brass" />
                    <p className="text-sm text-ink">{t}</p>
                    <p className="text-xs leading-relaxed text-ink-soft">{d}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-xs leading-relaxed text-ink-soft">Questions? <Link href="/contact" className="underline underline-offset-2 hover:text-ink">Contact the team</Link>.</p>
            </div>
          </aside>

          {/* Step card */}
          <section className="min-w-0 rounded-[28px] bg-white shadow-[0_30px_80px_-45px_rgba(17,17,17,0.35)] ring-1 ring-ink/5">
            <header className="border-b border-line px-6 py-6 sm:px-10 sm:py-8">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass-dark">Step {step + 1} of {STEPS.length}</p>
              <h2 className="mt-2 font-display text-4xl leading-tight text-ink">{STEPS[step].title}</h2>
              <p className="mt-1 text-sm text-ink-soft">{STEPS[step].blurb}</p>
              <div className="mt-6 h-1 overflow-hidden rounded-full bg-paper-dim" aria-hidden>
                <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
              </div>
            </header>

            <div key={step} className="animate-rise space-y-6 px-6 py-8 sm:px-10">
              {step === 0 && (
                <>
                  <Grid2>
                    <F label="Full name" error={errors.fullName}><input className="input" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" placeholder="As you'd like it on your profile" /></F>
                    <F label="Email" error={errors.email} hint={update ? "Contact the team if this needs to change." : undefined}><input type="email" className="input disabled:bg-paper disabled:text-ink-soft" disabled={!!update} value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" placeholder="you@example.com" /></F>
                  </Grid2>
                  <Grid2>
                    <F label="Phone number" error={errors.phone} hint="Only used to arrange your interview."><input type="tel" className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" placeholder="+92 300 0000000" /></F>
                    <F label="LinkedIn profile" error={errors.linkedinUrl}><input className="input" value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="linkedin.com/in/your-name" /></F>
                  </Grid2>
                  <Grid2>
                    <F label="Country of residence" error={errors.countryOfResidence}><input className="input" value={form.countryOfResidence} onChange={(e) => set("countryOfResidence", e.target.value)} autoComplete="country-name" placeholder="e.g. Pakistan" /></F>
                    <F label="Where you work" error={errors.professionalLocation}><input className="input" value={form.professionalLocation} onChange={(e) => set("professionalLocation", e.target.value)} placeholder="e.g. Lahore, or remote for a UK company" /></F>
                  </Grid2>
                </>
              )}

              {step === 1 && (
                <>
                  <F label="Professional headline" error={errors.headline} hint="One line, shown under your name."><input className="input" value={form.headline} maxLength={140} onChange={(e) => set("headline", e.target.value)} placeholder="e.g. Finance Manager at a regional retail group" /></F>
                  <Grid2>
                    <F label="Current role" error={errors.currentRole}><input className="input" value={form.currentRole} onChange={(e) => set("currentRole", e.target.value)} placeholder="e.g. Head of Product" /></F>
                    <F label="Organisation" error={errors.organization}><input className="input" value={form.organization} onChange={(e) => set("organization", e.target.value)} placeholder="e.g. a Lahore-based fintech" /></F>
                  </Grid2>
                  <Grid2>
                    <F label="Years of experience" error={errors.yearsExperience}><input type="number" inputMode="numeric" min={0} max={60} className="input" value={form.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value)} placeholder="e.g. 8" /></F>
                    <F label="Primary industry">
                      <select className="input" value={form.industry} onChange={(e) => set("industry", e.target.value)}>
                        {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                      </select>
                    </F>
                  </Grid2>
                  <F label="Specialist areas" error={errors.specialistAreas} hint="Press Enter or comma after each one. Up to 10."><TagInput value={form.specialistAreas} max={10} onChange={(v) => set("specialistAreas", v)} placeholder="e.g. Product strategy" /></F>
                  <F label="Languages you can mentor in" error={errors.languages} hint="Press Enter or comma after each one."><TagInput value={form.languages} max={8} onChange={(v) => set("languages", v)} placeholder="e.g. English, Urdu" /></F>
                  <F label="Qualifications" hint="Optional. Degrees, certifications or professional memberships."><input className="input" value={form.qualifications} maxLength={500} onChange={(e) => set("qualifications", e.target.value)} placeholder="e.g. BSc Computer Science, FAST-NUCES" /></F>
                  <F label="Previous mentoring experience" hint="Optional. Formal or informal both count."><textarea className="input min-h-24 leading-relaxed" maxLength={1000} value={form.previousMentorshipExperience} onChange={(e) => set("previousMentorshipExperience", e.target.value)} placeholder="e.g. I've mentored junior engineers on my team for three years." /></F>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <div className="mb-2.5 flex items-baseline justify-between">
                      <p className="text-sm font-medium text-ink">Topics you can help with</p>
                      <p className="text-xs text-ink-soft">{form.topicsOffered.length} selected</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {AGENDAS.map((t) => {
                        const on = form.topicsOffered.includes(t);
                        return (
                          <button type="button" key={t} aria-pressed={on}
                            onClick={() => set("topicsOffered", on ? form.topicsOffered.filter((x) => x !== t) : [...form.topicsOffered, t])}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors ${on ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink/40"}`}>
                            {on && <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            {t}
                          </button>
                        );
                      })}
                    </div>
                    {errors.topicsOffered && <p className="mt-2 text-xs text-rust">{errors.topicsOffered}</p>}
                  </div>

                  <div>
                    <p className="mb-2.5 text-sm font-medium text-ink">How would you like to take part?</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([["Paid", "Earn a fee for each session, at the rate for your experience level."], ["Voluntary", "Give your time for free. Students still book and prepare the same way."]] as const).map(([opt, d]) => {
                        const on = form.participation === opt;
                        return (
                          <label key={opt} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${on ? "border-ink bg-paper" : "border-line hover:border-ink/40"}`}>
                            <input type="radio" name="participation" className="sr-only" checked={on} onChange={() => set("participation", opt)} />
                            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-ink" : "border-ink/30"}`}>{on && <span className="h-2 w-2 rounded-full bg-ink" />}</span>
                            <span><span className="block text-sm font-medium text-ink">{opt}</span><span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{d}</span></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <Grid2>
                    <F label="When are you usually free?" error={errors.weeklyAvailability}><input className="input" value={form.weeklyAvailability} maxLength={300} onChange={(e) => set("weeklyAvailability", e.target.value)} placeholder="e.g. Weekday evenings, Saturday mornings" /></F>
                    {form.participation === "Paid" ? (
                      <F label="Pricing preference" hint="Optional. Leave blank for the standard rate."><input className="input" value={form.preferredPricing} maxLength={200} onChange={(e) => set("preferredPricing", e.target.value)} placeholder="e.g. Standard rate" /></F>
                    ) : <div className="hidden sm:block" />}
                  </Grid2>
                  <F label="Why do you want to mentor?" error={errors.motivation} hint={`${form.motivation.trim().length}/2000 · at least 20 characters`}>
                    <textarea className="input min-h-32 leading-relaxed" maxLength={2000} value={form.motivation} onChange={(e) => set("motivation", e.target.value)} placeholder="What would you like students to take away from a conversation with you?" />
                  </F>
                </>
              )}

              {step === 3 && (
                <>
                  <Review title="About you" onEdit={() => go(0)} rows={[["Name", form.fullName], ["Email", form.email], ["Phone", form.phone], ["LinkedIn", withScheme(form.linkedinUrl)], ["Based in", `${form.professionalLocation} · ${form.countryOfResidence}`]]} />
                  <Review title="Professional background" onEdit={() => go(1)} rows={[["Headline", form.headline], ["Role", `${form.currentRole}, ${form.organization}`], ["Experience", `${form.yearsExperience} years · ${form.industry}`], ["Specialist areas", form.specialistAreas.join(", ")], ["Languages", form.languages.join(", ")], ["Qualifications", form.qualifications || "—"]]} />
                  <Review title="Mentoring preferences" onEdit={() => go(2)} rows={[["Topics", form.topicsOffered.join(", ")], ["Participation", form.participation], ["Availability", form.weeklyAvailability], ...(form.participation === "Paid" ? [["Pricing", form.preferredPricing || "Standard rate"] as [string, string]] : [])]} />

                  <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm leading-relaxed transition-colors ${form.agreedToTerms ? "border-ink bg-paper" : "border-line"}`}>
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-ink" checked={form.agreedToTerms} onChange={(e) => set("agreedToTerms", e.target.checked)} />
                    <span className="text-ink-soft">
                      I agree to the <Link href="/legal?tab=terms" target="_blank" className="text-ink underline underline-offset-2">POINT B mentor terms</Link> and confirm the information above is accurate. I understand approval depends on screening and an interview, and identity documents are only requested if I progress to interview.
                    </span>
                  </label>
                  {error && <Alert>{error}</Alert>}
                </>
              )}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-5 sm:px-10">
              {step > 0 ? <Button variant="secondary" onClick={() => go(step - 1)}>Back</Button> : <span className="text-xs text-ink-soft">About 10 minutes in total</span>}
              {step < STEPS.length - 1 ? (
                <Button onClick={next} className="min-w-36">Continue <Arrow /></Button>
              ) : (
                <Button disabled={busy || !form.agreedToTerms} onClick={submit} className="min-w-44">{busy ? <Spinner /> : <>{update ? "Send updated application" : "Submit application"} <Arrow /></>}</Button>
              )}
            </footer>
          </section>
        </div>
      </Container>
    </div>
  );
}

const Arrow = () => <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function Grid2({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 sm:grid-cols-2">{children}</div>;
}

function F({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className={`block ${error ? "[&_.input]:border-rust/60" : ""}`}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-rust">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

/** Free-text chips: Enter or comma adds, Backspace on an empty field removes the last one. */
function TagInput({ value, onChange, placeholder, max }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; max: number }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw.split(",").map((x) => x.trim()).filter(Boolean).filter((x) => !value.some((v) => v.toLowerCase() === x.toLowerCase()));
    if (items.length) onChange([...value, ...items].slice(0, max));
    setDraft("");
  };
  return (
    <div className="input flex min-h-[46px] flex-wrap items-center gap-1.5 py-1.5 focus-within:border-ink/50">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-paper-dim py-1 pl-3 pr-1.5 text-sm text-ink">
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="flex h-5 w-5 items-center justify-center rounded-full text-ink-soft hover:bg-line hover:text-ink">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </span>
      ))}
      {value.length < max && (
        <input className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-ink-soft/60" value={draft} placeholder={value.length ? "Add another" : placeholder}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(draft); }
            if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)} />
      )}
    </div>
  );
}

function Review({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return (
    <div className="rounded-2xl bg-paper p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">{title}</p>
        <button type="button" onClick={onEdit} className="text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink">Edit</button>
      </div>
      <dl className="mt-3 divide-y divide-line text-sm">
        {rows.map(([l, v]) => (
          <div key={l} className="grid grid-cols-[130px_1fr] gap-4 py-2">
            <dt className="text-ink-soft">{l}</dt>
            <dd className="break-words text-ink">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
