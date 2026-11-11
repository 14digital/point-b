"use client";

import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Container, EmptyState, Skeleton } from "@/components/ui";
import { MentorCard } from "@/components/mentor-card";
import { MatchTeaser } from "@/components/match-teaser";
import { track } from "@/lib/track";
import { useApi } from "@/lib/use-api";
import { PriceNote } from "@/components/price-note";
import type { Category, Level, MentorSummary } from "@/lib/types";

interface Facets {
  expertise: string[]; industries: string[]; languages: string[];
  topics?: { key: string; label: string; count: number }[];
  counts?: { total: number; expertise: Record<string, number>; languages: Record<string, number>; level: Record<string, number>; category: Record<string, number> };
}

const PAGE_SIZE = 24;

export function MentorsDirectory() {
  const sp = useSearchParams();
  const [category, setCategory] = useState<Category | "">((sp.get("category") as Category) ?? "");
  const [topic, setTopic] = useState(sp.get("topic") ?? "");
  // Older links (?expertise=...) still narrow the list until another filter is picked.
  const [expertise, setExpertise] = useState(sp.get("expertise") ?? "");
  const [level, setLevel] = useState<Level | "">("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState("soonest");
  const [query, setQuery] = useState(sp.get("q") ?? "");
  const q = useDeferredValue(query);

  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (topic) params.set("topic", topic);
  if (expertise) params.set("expertise", expertise);
  if (level) params.set("level", level);
  if (language) params.set("language", language);
  if (q.trim()) params.set("q", q.trim());
  params.set("sort", sort);
  // Any change of filter or sort goes back to the first page.
  const filterKey = params.toString();
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));
  const goToPage = (n: number) => { setPaging({ key: filterKey, page: n }); document.getElementById("mentor-results")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const facets = useApi<Facets>("/mentors/facets");
  const res = useApi<{ total: number; items: MentorSummary[] }>(`/mentors?${params}`);
  // Records what people look for, once they've paused typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => track("searched", { label: q }), 1200);
    return () => clearTimeout(t);
  }, [query]);

  const pages = Math.ceil((res.data?.total ?? 0) / PAGE_SIZE);
  const clear = () => { setCategory(""); setTopic(""); setExpertise(""); setLevel(""); setLanguage(""); setQuery(""); };
  const active = !!(category || topic || expertise || level || language || query);

  return (
    <Container className="py-12">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-brass-dark">Explore mentors</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.04] text-ink sm:text-6xl">Find the right conversation</h1>
        <p className="mt-3 text-ink-soft">
          Every mentor has been screened, interviewed and approved. Prices are shown in your own currency.
        </p>
        {(() => { const m = res.data?.items.find((x) => x.convertedFrom); return <PriceNote currency={m?.currency} from={m?.convertedFrom} className="mt-2" />; })()}
      </div>

      <MatchTeaser compact className="mt-8" />

      <div className="mt-10 grid gap-8 lg:grid-cols-[300px_1fr]">
        <FilterPanel
          facets={facets.data} query={query} setQuery={setQuery} category={category} setCategory={setCategory}
          topic={topic} setTopic={(t) => { setTopic(t); setExpertise(""); }} level={level} setLevel={setLevel}
          language={language} setLanguage={setLanguage} active={active} clear={clear}
        />

        <div id="mentor-results" className="scroll-mt-24">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-soft" aria-live="polite">
              {res.loading ? "Loading mentors…" : `${res.data?.total ?? 0} mentor${res.data?.total === 1 ? "" : "s"}`}
            </p>
            <select aria-label="Sort" className="rounded-full border border-line bg-white px-3 py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="soonest">Soonest available</option>
              <option value="rating">Highest rated</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
          {res.error && <Alert>{res.error}</Alert>}
          {res.loading && !res.data ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[28rem] rounded-[1.75rem]" />)}</div>
          ) : res.data && res.data.items.length === 0 ? (
            <EmptyState title="No mentors match these filters" description="Try another topic, or clear a filter to see more mentors." />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{res.data?.items.map((m) => <MentorCard key={m.id} mentor={m} />)}</div>
          )}
          {pages > 1 && (
            <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Mentor pages">
              <Button variant="secondary" size="sm" disabled={page <= 1 || res.loading} onClick={() => goToPage(page - 1)}>Previous</Button>
              <p className="text-sm text-ink-soft tabular-nums">Page {page} of {pages}</p>
              <Button variant="secondary" size="sm" disabled={page >= pages || res.loading} onClick={() => goToPage(page + 1)}>Next</Button>
            </nav>
          )}
        </div>
      </div>
    </Container>
  );
}

const LEVELS: [Level, string, string][] = [
  ["PROFESSIONAL", "Professional", "Established in their field"],
  ["SENIOR_SPECIALIST", "Senior specialist", "Deep expertise, often leading others"],
  ["EXECUTIVE", "Executive", "Senior leadership experience"],
];

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-5 first:border-t-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brass">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const Count = ({ n, on }: { n?: number; on?: boolean }) => n === undefined ? null : (
  <span className={`ml-auto rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-white/15 text-white/80" : "text-ink-soft/70"}`}>{n}</span>
);

/**
 * The filters beside the mentor list, laid out in full: no dropdowns. The main topics, levels and languages are
 * single-tap options, each with how many mentors fit.
 */
function FilterPanel(p: {
  facets: Facets | null; query: string; setQuery: (v: string) => void;
  category: Category | ""; setCategory: (v: Category | "") => void;
  topic: string; setTopic: (v: string) => void;
  level: Level | ""; setLevel: (v: Level | "") => void;
  language: string; setLanguage: (v: string) => void;
  active: boolean; clear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const used = [p.query.trim(), p.category, p.topic, p.level, p.language].filter(Boolean).length;
  const counts = p.facets?.counts;
  const languages = [...(p.facets?.languages ?? [])].sort((a, b) => (counts?.languages[b] ?? 0) - (counts?.languages[a] ?? 0) || a.localeCompare(b));
  const chip = (on: boolean) => `inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-left text-[13px] leading-tight transition-all duration-150 ${on ? "bg-ink text-white shadow-[0_6px_16px_-8px_rgba(17,17,17,0.6)]" : "bg-paper text-ink ring-1 ring-line hover:bg-white hover:ring-ink/25"}`;
  const row = (on: boolean) => `flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ${on ? "bg-ink text-white" : "text-ink hover:bg-paper"}`;

  return (
    <aside className="no-scrollbar overflow-hidden rounded-[1.75rem] bg-white shadow-[0_20px_50px_-40px_rgba(17,17,17,0.45)] ring-1 ring-line lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
      <div className="flex items-center justify-between gap-2 px-5 py-4 lg:pb-0 lg:pt-5">
        {/* On a phone the filters fold away behind this button, so the mentors come first. */}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-2 text-left lg:pointer-events-none">
          <span className="font-display text-xl text-ink">Filters</span>
          {used > 0 && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">{used}</span>}
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden className={`text-ink-soft transition-transform lg:hidden ${open ? "rotate-180" : ""}`}><path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {p.active && <button type="button" onClick={p.clear} className="rounded-full px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-line transition-colors hover:text-ink hover:ring-ink/30">Clear all</button>}
      </div>
      <div className={open ? "" : "max-lg:hidden"}>

      <Section title="Search">
        <label className="relative block">
          <span className="sr-only">Search mentors</span>
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <input className="input !rounded-full bg-paper/60 !pl-10" value={p.query} onChange={(e) => p.setQuery(e.target.value)} placeholder="Name, role or organisation" />
        </label>
      </Section>

      <Section title="Location">
        <div className="grid grid-cols-3 gap-1 rounded-full bg-paper p-1" role="radiogroup" aria-label="Location">
          {([["", "All"], ["LOCAL", "Pakistan"], ["INTERNATIONAL", "Abroad"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={p.category === v} onClick={() => p.setCategory(v)}
              className={`rounded-full px-2 py-1.5 text-[13px] font-medium transition-all ${p.category === v ? "bg-white text-ink shadow-sm ring-1 ring-ink/5" : "text-ink-soft hover:text-ink"}`}>{l}</button>
          ))}
        </div>
      </Section>

      <Section title="Topics" action={p.topic ? <button type="button" onClick={() => p.setTopic("")} className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline">Any topic</button> : null}>
        {!p.facets ? <div className="space-y-1.5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9 rounded-2xl" />)}</div> : (
          <div className="space-y-0.5" role="radiogroup" aria-label="Topic">
            {(p.facets.topics ?? []).map((t) => {
              const on = p.topic === t.key;
              return (
                <button key={t.key} type="button" role="radio" aria-checked={on} onClick={() => p.setTopic(on ? "" : t.key)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${on ? "bg-ink text-white" : "text-ink hover:bg-paper"}`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-lime" : "bg-brass/50"}`} />
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  <span className={`text-[11px] tabular-nums ${on ? "text-lime" : "text-ink-soft/60"}`}>{t.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Experience level">
        <div className="space-y-1" role="radiogroup" aria-label="Experience level">
          <button type="button" role="radio" aria-checked={!p.level} onClick={() => p.setLevel("")} className={row(!p.level)}>
            <Tier n={0} on={!p.level} /><span className="font-medium">All levels</span><Count n={counts?.total} on={!p.level} />
          </button>
          {LEVELS.map(([v, l, hint], i) => {
            const on = p.level === v;
            return (
              <button key={v} type="button" role="radio" aria-checked={on} onClick={() => p.setLevel(on ? "" : v)} className={row(on)}>
                <Tier n={i + 1} on={on} />
                <span className="min-w-0"><span className="block font-medium">{l}</span><span className={`block truncate text-xs ${on ? "text-white/65" : "text-ink-soft"}`}>{hint}</span></span>
                <Count n={counts?.level[v] ?? 0} on={on} />
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Language" action={p.language ? <button type="button" onClick={() => p.setLanguage("")} className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline">Any language</button> : null}>
        <div className="flex flex-wrap gap-1.5">
          {languages.map((l) => {
            const on = p.language === l;
            return (
              <button key={l} type="button" aria-pressed={on} onClick={() => p.setLanguage(on ? "" : l)} className={chip(on)}>
                {l}{counts?.languages[l] ? <span className={`text-[11px] tabular-nums ${on ? "text-lime" : "text-ink-soft/60"}`}>{counts.languages[l]}</span> : null}
              </button>
            );
          })}
        </div>
      </Section>
      </div>
    </aside>
  );
}

/** Three small bars that fill up with the level: an at-a-glance sense of seniority. */
function Tier({ n, on }: { n: number; on: boolean }) {
  return (
    <span aria-hidden className={`flex h-8 w-8 shrink-0 items-end justify-center gap-[3px] rounded-xl pb-2 ${on ? "bg-white/10" : "bg-paper"}`}>
      {[1, 2, 3].map((b) => (
        <span key={b} className={`w-[4px] rounded-full ${n === 0 ? (on ? "bg-lime" : "bg-brass/60") : b <= n ? (on ? "bg-lime" : "bg-brass") : on ? "bg-white/20" : "bg-line"}`} style={{ height: `${4 + b * 4}px` }} />
      ))}
    </span>
  );
}
