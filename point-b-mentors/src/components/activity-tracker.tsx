"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { flushActivity, track } from "@/lib/track";

/** Records each page opened by guests and signed-in users. Admins aren't tracked. */
export function ActivityTracker() {
  const { user, loading } = useAuth();
  const path = usePathname();
  const tracked = !loading && user?.role !== "ADMIN";

  useEffect(() => {
    if (tracked) track("page_view");
  }, [tracked, path]);

  useEffect(() => {
    if (!tracked) return;
    const hidden = () => { if (document.visibilityState === "hidden") flushActivity(); };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [tracked]);

  return null;
}
