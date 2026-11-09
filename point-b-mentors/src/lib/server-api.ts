/** The public address of the site, for absolute links in previews and the sitemap. Set WEB_URL before building. */
export const siteUrl = () => (process.env.WEB_URL ?? process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "");

const apiBase = () => (process.env.NODE_ENV === "development" ? process.env.API_DEV_URL ?? "http://localhost:4000" : `http://127.0.0.1:${process.env.PORT || 3000}`);

/** Reads public API data on the server. Returns null if it can't, so a preview or sitemap never breaks a page. */
export async function serverApi<T>(path: string, revalidate = 300): Promise<T | null> {
  try {
    const res = await fetch(`${apiBase()}/api${path}`, { next: { revalidate }, signal: AbortSignal.timeout(2500) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch { return null; }
}
