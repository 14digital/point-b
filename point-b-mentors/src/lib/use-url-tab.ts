"use client";

import { useCallback, useState } from "react";

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Tab state kept in the URL (?tab=user-tracking), so a refresh or a shared link opens the same tab.
 * For pages that only render in the browser, such as those behind RequireRole.
 */
export function useUrlTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const [tab, setTab] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    const wanted = new URLSearchParams(window.location.search).get("tab");
    return tabs.find((t) => slug(t) === wanted) ?? fallback;
  });
  const set = useCallback((t: T) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", slug(t));
    window.history.replaceState(null, "", url);
  }, []);
  return [tab, set];
}
