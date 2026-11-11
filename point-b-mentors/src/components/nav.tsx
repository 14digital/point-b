"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Container } from "./ui";
import { Logo } from "./logo";
import { useAuth, HOME_BY_ROLE } from "@/lib/auth";
import { NotificationBell } from "./notification-bell";
import { pastelFor } from "./ui";
import { initials } from "@/lib/format";

const LINKS = [
  { href: "/mentors", label: "Explore Mentors" },
  { href: "/match", label: "Match Me" },
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

/** The signed-in person's avatar. Opens a small menu with who they are, their account and signing out. */
function ProfileMenu({ name, email, showAccount, light, onSignOut }: { name: string; email: string; showAccount: boolean; light: boolean; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-paper";
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Your account" onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full p-1 pr-2.5 transition-colors ${light ? "bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25" : "bg-white text-ink ring-1 ring-line hover:ring-ink/25"}`}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-ink" style={{ backgroundColor: pastelFor(name) }}>{initials(name)}</span>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-3 w-64 origin-top-right animate-[pop_160ms_ease-out] overflow-hidden rounded-3xl bg-white p-2 text-left shadow-[0_24px_60px_-20px_rgba(17,17,17,0.35)] ring-1 ring-ink/5">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-ink" style={{ backgroundColor: pastelFor(name) }}>{initials(name)}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{name}</span><span className="block truncate text-xs text-ink-soft">{email}</span></span>
          </div>
          <div className="border-t border-line pt-1.5">
            {showAccount && <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className={item}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden className="text-ink-soft"><circle cx="10" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.5" /><path d="M3.8 16.5c1.2-2.8 3.5-4 6.2-4s5 1.2 6.2 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>Account settings</Link>}
            <button role="menuitem" type="button" onClick={() => { setOpen(false); onSignOut(); }} className={item}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden className="text-ink-soft"><path d="M8 4H5.5A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8M12.5 13.5L16 10l-3.5-3.5M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>Sign out</button>
          </div>
        </div>
      )}
    </div>
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

        <div className="ml-auto hidden shrink-0 items-center gap-3 whitespace-nowrap lg:flex">
          {!hideMarketing && (
            <nav className={`items-center gap-1 ${user ? "hidden xl:flex" : "flex"}`} aria-label="Main">
              {[["/how-it-works", "How it works"], ["/become-a-mentor", "Become a mentor"]].map(([href, label]) => (
                <Link key={href} href={href} className={`rounded-full px-3 py-2 text-sm transition-colors ${pathname === href ? (overlay ? "text-white" : "text-ink") : text} ${overlay ? "hover:bg-white/10" : "hover:bg-ink/[0.04]"}`}>{label}</Link>
              ))}
            </nav>
          )}
          {user ? (
            <>
              {!hideMarketing && <span className={`mx-1 hidden h-6 w-px xl:block ${overlay ? "bg-white/25" : "bg-line"}`} aria-hidden />}
              <NotificationBell light={overlay} />
              <Link href={HOME_BY_ROLE[user.role]} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${overlay ? "bg-white text-ink hover:bg-white/90" : "bg-ink text-white hover:bg-ink-soft"}`}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" /></svg>
                {user.role === "ADMIN" ? "Admin" : "Dashboard"}
              </Link>
              <ProfileMenu name={user.name} email={user.email} showAccount={user.role !== "ADMIN"} light={overlay} onSignOut={logout} />
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
            {user && user.role !== "ADMIN" && <Link href="/account" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 text-sm text-ink-soft hover:bg-paper-dim hover:text-ink">Account</Link>}
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
