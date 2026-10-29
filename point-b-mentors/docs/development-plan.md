> **Update (backend added):** the app now runs on a real NestJS + Prisma + MongoDB API in `../point-b-api`. Bookings, accounts, applications and admin actions are persisted server-side; the localStorage store described below has been removed. Payment, email and video remain simulated. See the root `README.md` and `../point-b-api/README.md` for current status.

# POINT B Mentors — Development Plan

## Implemented in this prototype

A working Next.js + TypeScript + Tailwind application (`point-b-mentors/`), covering:

- Full public site: Home, Explore Mentors (with local/international, expertise and
  level filters), mentor profile, How It Works, Pricing & Packages, Become a Mentor
  landing, About, Academy (coming soon), Contact, Legal (tabbed terms/privacy/refunds/
  safeguarding).
- The complete booking journey end to end: slot selection → contact details → agenda →
  preparation questions → priced review → simulated payment → confirmation with a
  generated reference → appears in the student dashboard and admin bookings list.
- The complete mentor recruitment journey end to end: multi-step application → appears
  in the admin pipeline as `Submitted` → interview scorecard → status transitions
  through to `Active` or decline, exactly matching the status set and scoring weights
  in the brief.
- Student dashboard (upcoming/past bookings, cancel, leave feedback, saved mentors).
- Mentor dashboard (bookings with student prep notes, availability, illustrative
  earnings), with a demo mentor switcher since there are no individual mentor logins.
- Admin dashboard: Applications pipeline with scorecard editor and status transitions,
  Bookings table, Mentors table, Finance tab with an explicitly illustrative commission
  calculation.
- A lightweight demo "sign-in" (`/sign-in`) that sets a local, browser-only current
  user and role — not real authentication (see `technical-spec.md` §4).

Data persistence in this prototype is `localStorage`-backed (per browser, per device)
via `src/lib/store.tsx`, seeded with the demonstration mentors and applications in
`src/lib/data.ts`. All demonstration content is labelled as such in the UI (badges,
inline notes) wherever it could otherwise be mistaken for live data, per the brief's
non-negotiable rule against fabricated content.

## Explicitly not implemented (by design, in this prototype)

- Real authentication/authorisation, real payments, real video links, real transactional
  email/SMS — each is simulated and clearly labelled where it appears.
- A real database — see `technical-spec.md` §2 for the schema this UI is built toward.
- Age verification / guardian consent gating for under-18 bookings.
- Concurrent-booking protection (modelled conceptually in `technical-spec.md` §3, not
  needed in a single-browser demo).
- Multi-session bundles, credit wallets, referral programmes, mentor payout automation
  — all Phase 2/3 per the brief, intentionally excluded from this MVP build.

## Suggested backlog sequencing (beyond this prototype)

1. Stand up PostgreSQL + the schema in `technical-spec.md`; wire real auth with roles.
2. Replace mock data with real queries; move booking creation behind the transactional
   slot-locking path.
3. Integrate a verified payment provider per region behind a webhook-reconciled
   checkout; keep the existing review screen's UI, swap the "simulate payment" action.
4. Integrate a video provider to generate real meeting links on confirmation.
5. Wire transactional email (confirmation, cancellation, reminders, application status).
6. Add admin audit logging and identity-document handling for mentor interviews.
7. Add age/guardian-consent gating to the booking flow for under-18 students.
8. Phase 2: bundles, credit wallet, payout automation, reviews moderation, referrals.
9. Phase 3: additional languages, group sessions, corporate mentoring, more markets.

## Testing plan

- Unit tests around pricing/currency formatting, scorecard totals, and the booking
  state machine (`src/lib/format.ts`, `src/lib/store.tsx`) once a test runner is added
  (not included in this prototype to keep the initial build focused).
- The golden-path walkthrough used to verify this build (browse → filter → profile →
  book → confirm → dashboard, and apply → admin review → score → status change) should
  become an automated end-to-end test (e.g. Playwright) run in CI before each deploy.
- Manual QA checklist before any production cutover: empty states, mobile widths down
  to 360px, keyboard-only navigation through the booking modal, and screen-reader pass
  on the application form.

## Deployment notes

- `npm run build` currently produces a fully static/prerendered output for every route
  in this prototype (no server-side data dependency yet) — see the route list printed
  by `npm run build`.
- Once a real database and auth are introduced, routes that depend on signed-in state
  (dashboards, admin) will need to move to dynamic rendering; this is a straightforward
  change (removing the current client-only data fetching) rather than a restructure.
