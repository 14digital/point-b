const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "pointb.token";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const getToken = () => {
  try { return typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t: string | null) => {
  try { if (t) window.localStorage.setItem(TOKEN_KEY, t); else window.localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
};

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "We couldn't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join(". ") : m ?? "Something went wrong. Please try again.");
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
