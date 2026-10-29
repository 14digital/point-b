"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "./api";

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);

  const load = useCallback(async () => {
    if (path === null) return;
    try { setData(await api<T>(path)); setError(null); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [path]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (path === null) return;
      try { const d = await api<T>(path); if (alive) { setData(d); setError(null); } } catch (e) { if (alive) setError(errMsg(e)); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [path]);

  return { data, error, loading, reload: load, setData };
}

/** Timestamp captured once per mount; keeps render pure. */
export function useNow() {
  const [now] = useState(() => Date.now());
  return now;
}
