"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";
import type { Role, SessionUser } from "./types";

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (input: Record<string, unknown>) => Promise<SessionUser>;
  logout: () => void;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export const HOME_BY_ROLE: Record<Role, string> = { STUDENT: "/dashboard/student", MENTOR: "/dashboard/mentor", ADMIN: "/admin" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); return; }
    try { setUser(await api<SessionUser>("/auth/me")); } catch { setToken(null); setUser(null); }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => { await refresh(); if (alive) setLoading(false); })();
    return () => { alive = false; };
  }, [refresh]);

  const start = useCallback(async (path: string, body: unknown) => {
    const res = await api<{ accessToken: string }>(path, { body });
    setToken(res.accessToken);
    const me = await api<SessionUser>("/auth/me");
    setUser(me);
    return me;
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user, loading, refresh,
    login: (email, password) => start("/auth/login", { email, password }),
    register: (input) => start("/auth/register", input),
    logout: () => { setToken(null); setUser(null); },
  }), [user, loading, refresh, start]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
