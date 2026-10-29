"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Container } from "./ui";
import { Logo } from "./logo";
import { useAuth, HOME_BY_ROLE } from "@/lib/auth";
import { NotificationBell } from "./notification-bell";

const LINKS = [
  { href: "/mentors", label: "Explore Mentors" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/become-a-mentor", label: "Become a Mentor" },
  { href: "/about", label: "About" },
];

function HeaderSearch({ light }: { light: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); router.push(q.trim() ? `/mentors?q=${encodeURIComponent(q.trim())}` : "/mentors"); }}
      className={`flex w-full max-w-md items-center gap-2.5 rounded-full px-4 py-2.5 backdrop-blur-md transition-colors ${light ? "bg-white/20 text-white ring-1 ring-white/25" : "bg-paper-dim text-ink ring-1 ring-line"}`}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={light ? "text-white/80" : "text-ink-soft"} aria-hidden><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search mentors" placeholder="Search by topic, challenge or mentor…"
        className={`min-w-0 flex-1 bg-transparent text-sm focus:outline-none ${light ? "placeholder:text-white/75" : "placeholder:text-ink-soft"}`} />
    </form>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, logout } = useAuth();
  // Signed-in mentors and admins only need their workspace: no marketing links (and no search for mentors).
  const isMentor = user?.role === "MENTOR";
  const hideMarketing = isMentor || user?.role === "ADMIN";
  const links = hideMarketing ? [] : LINKS;
  const homeHref = user && isMentor ? HOME_BY_ROLE[user.role] : "/";

  // On the home page the header floats transparently over the hero until the page is scrolled.
  const onHome = pathname === "/";
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const overlay = onHome && !scrolled && !open;
  const text = overlay ? "text-white/85 hover:text-white" : "text-ink-soft hover:text-ink";

  return (
    <header className={`${onHome ? "fixed inset-x-0 top-0" : "sticky top-0"} z-40 transition-colors duration-200 ${overlay ? "bg-transparent" : "bg-paper/85 backdrop-blur-md"}`}>
      <Container className="flex h-[4.5rem] items-center gap-6">
        <Link href={homeHref} className="shrink-0 whitespace-nowrap"><Logo tone={overlay ? "light" : "dark"} /></Link>

        <div className="hidden flex-1 justify-center lg:flex">{!isMentor && <HeaderSearch light={overlay} />}</div>

        <div className="ml-auto hidden shrink-0 items-center gap-5 whitespace-nowrap lg:flex">
          {!hideMarketing && <Link href="/how-it-works" className={`text-sm ${text}`}>How it works</Link>}
          {!hideMarketing && <Link href="/become-a-mentor" className={`text-sm ${text}`}>Become a mentor</Link>}
          {user ? (
            <>
              <NotificationBell light={overlay} />
              <Link href={HOME_BY_ROLE[user.role]} className={`rounded-full px-4 py-2 text-sm font-medium ${overlay ? "bg-white/20 text-white backdrop-blur hover:bg-white/30" : "bg-ink text-white hover:bg-ink-soft"}`}>
                {user.role === "ADMIN" ? "Admin" : "Dashboard"}
              </Link>
              <button onClick={logout} className={`text-sm ${text}`}>Sign out</button>
            </>
          ) : (
            <Link href="/sign-in" className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${overlay ? "bg-white/20 text-white backdrop-blur hover:bg-white/30" : "bg-ink text-white hover:bg-ink-soft"}`}>Sign in</Link>
          )}
        </div>

        <button aria-label="Toggle menu" onClick={() => setOpen((v) => !v)}
          className={`ml-auto flex h-10 w-10 items-center justify-center rounded-full lg:hidden ${overlay ? "bg-white/20 text-white" : "bg-paper-dim text-ink"}`}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        </button>
      </Container>

      {open && (
        <div className="border-t border-line bg-paper lg:hidden">
          <Container className="flex flex-col gap-1 py-3">
            {!isMentor && <div className="mb-2"><HeaderSearch light={false} /></div>}
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 text-sm text-ink-soft hover:bg-paper-dim hover:text-ink">{link.label}</Link>
            ))}
            <div className="mt-2 flex gap-2 border-t border-line pt-3">
              <Link href={user ? HOME_BY_ROLE[user.role] : "/sign-in"} onClick={() => setOpen(false)} className="flex-1 rounded-full bg-ink px-4 py-2.5 text-center text-sm font-medium text-white">
                {user ? "Dashboard" : "Sign in"}
              </Link>
              {user && <button onClick={() => { setOpen(false); logout(); }} className="flex-1 rounded-full bg-paper-dim px-4 py-2.5 text-sm font-medium text-ink">Sign out</button>}
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
