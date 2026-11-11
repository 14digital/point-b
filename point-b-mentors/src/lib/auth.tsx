"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken } from "./api";
import { flushActivity, resetVisitor, track } from "./track";
import type { Role, SessionUser } from "./types";

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (input: Record<string, unknown>) => Promise<SessionUser>;
  loginWithGoogle: (credential: string) => Promise<SessionUser>;
  /** Second step for admins with two-step sign-in, after login threw TwoStepRequired. */
  loginWithCode: (mfaToken: string, code: string) => Promise<SessionUser>;
  logout: () => void;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

/** Thrown by login when the account needs a code from an authenticator app before it gets a session. */
export class TwoStepRequired extends Error {
  constructor(public mfaToken: string) { super("Enter the code from your authenticator app."); }
}

export const HOME_BY_ROLE: Record<Role, string> = { STUDENT: "/dashboard/student", MENTOR: "/dashboard/mentor", ADMIN: "/admin" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); return; }
    // Only an expired or revoked session signs the user out; a network blip retries once and keeps the token.
    for (let attempt = 0; ; attempt++) {
      try { setUser(await api<SessionUser>("/auth/me")); return; } catch (e) {
        if ((e instanceof ApiError && e.status === 401) || attempt >= 1) {
          if (e instanceof ApiError && e.status === 401) setToken(null);
          setUser(null); return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => { await refresh(); if (alive) setLoading(false); })();
    return () => { alive = false; };
  }, [refresh]);

  const start = useCallback(async (path: string, body: unknown) => {
    const res = await api<{ accessToken?: string; mfaRequired?: boolean; mfaToken?: string }>(path, { body });
    if (res.mfaRequired && res.mfaToken) throw new TwoStepRequired(res.mfaToken);
    setToken(res.accessToken!);
    const me = await api<SessionUser>("/auth/me");
    setUser(me);
    return me;
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user, loading, refresh,
    login: (email, password) => start("/auth/login", { email, password }),
    register: (input) => start("/auth/register", input),
    loginWithGoogle: (credential) => start("/auth/google", { credential, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    loginWithCode: (mfaToken, code) => start("/auth/login/code", { mfaToken, code }),
    logout: () => { track("signed_out"); flushActivity(); setToken(null); setUser(null); resetVisitor(); },
  }), [user, loading, refresh, start]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
