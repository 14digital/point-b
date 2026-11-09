import type { MetadataRoute } from "next";
import { serverApi, siteUrl } from "@/lib/server-api";
import type { MentorSummary } from "@/lib/types";

export const revalidate = 3600;
const PAGES = ["", "/mentors", "/how-it-works", "/pricing", "/match", "/become-a-mentor", "/about", "/academy", "/contact", "/legal"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const mentors = await serverApi<{ items: MentorSummary[] }>("/mentors?limit=50", 3600);
  return [
    ...PAGES.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : p === "/mentors" ? 0.9 : 0.6 })),
    ...(mentors?.items ?? []).filter((m) => !m.isDemo).map((m) => ({ url: `${base}/mentors/${m.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
