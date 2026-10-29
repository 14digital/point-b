"use client";

import { useDeferredValue, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Container, EmptyState, Skeleton } from "@/components/ui";
import { MentorCard } from "@/components/mentor-card";
import { useApi } from "@/lib/use-api";
import { LEVEL_LABEL } from "@/lib/constants";
import type { Category, Level, MentorSummary } from "@/lib/types";

interface Facets { expertise: string[]; industries: string[]; languages: string[] }

export function MentorsDirectory() {
  const sp = useSearchParams();
  const [category, setCategory] = useState<Category | "">((sp.get("category") as Category) ?? "");
  const [expertise, setExpertise] = useState(sp.get("expertise") ?? "");
  const [level, setLevel] = useState<Level | "">("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState("soonest");
  const [query, setQuery] = useState(sp.get("q") ?? "");
  const q = useDeferredValue(query);

  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (expertise) params.set("expertise", expertise);
  if (level) params.set("level", level);
  if (language) params.set("language", language);
  if (q.trim()) params.set("q", q.trim());
  params.set("sort", sort);

  const facets = useApi<Facets>("/mentors/facets");
  const res = useApi<{ total: number; items: MentorSummary[] }>(`/mentors?${params}`);
  const clear = () => { setCategory(""); setExpertise(""); setLevel(""); setLanguage(""); setQuery(""); };
  const active = !!(category || expertise || level || language || query);

  return (
    <Container className="py-12">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-brass-dark">Explore mentors</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.04] text-ink sm:text-6xl">Find the right conversation</h1>
        <p className="mt-3 text-ink-soft">
          Every mentor has been screened, interviewed and approved. Local mentors are priced in PKR, international mentors in GBP.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Search</span>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, role or organisation" />
          </label>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Location</p>
            <div className="grid gap-2">
              {([["", "All mentors"], ["LOCAL", "Local (Pakistan) · PKR"], ["INTERNATIONAL", "International · GBP"]] as const).map(([v, l]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3.5 py-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-paper-dim">
                  <input type="radio" name="category" className="accent-ink" checked={category === v} onChange={() => setCategory(v)} />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Expertise</span>
            <select className="input" value={expertise} onChange={(e) => setExpertise(e.target.value)}>
              <option value="">All areas</option>
              {facets.data?.expertise.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Experience level</span>
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value as Level | "")}>
              <option value="">All levels</option>
              {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Language</span>
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">Any language</option>
              {facets.data?.languages.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          {active && <button onClick={clear} className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink">Clear all filters</button>}
        </aside>

        <div>
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
            <EmptyState title="No mentors match these filters" description="Try another expertise area, or clear a filter to see more mentors." />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{res.data?.items.map((m) => <MentorCard key={m.id} mentor={m} />)}</div>
          )}
        </div>
      </div>
    </Container>
  );
}
