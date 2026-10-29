"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, HOME_BY_ROLE } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Container, Skeleton } from "./ui";

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
    else if (user.role !== role) router.replace(HOME_BY_ROLE[user.role]);
  }, [loading, user, role, router, path]);

  if (loading || !user || user.role !== role) {
    return (
      <Container className="py-12">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-6 h-40 w-full" />
      </Container>
    );
  }
  return <>{children}</>;
}
