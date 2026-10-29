# POINT B Mentors — Technical Specification

This describes the production architecture this prototype is built toward. The
prototype itself (this repository) implements the frontend and UI logic described
below against in-memory/mock data and browser `localStorage`, with every simulated
piece (payment, video link, email) explicitly labelled in the UI. Nothing here should
be read as "already built and load-bearing" beyond what `development-plan.md` lists as
done.

## 1. Architecture overview

- **Framework**: Next.js (App Router) + TypeScript, as scaffolded in this repository.
- **Styling**: Tailwind CSS v4 (CSS-first `@theme` configuration, no `tailwind.config.js`).
- **Database**: PostgreSQL in production (not present in this prototype).
- **Auth**: Email/password or OAuth via a managed auth provider (e.g. NextAuth /
  Clerk / Supabase Auth), issuing a session tied to a `users` row with a `role` enum.
- **File storage**: managed object storage (e.g. S3-compatible) for CVs, identity
  documents (access-restricted to authorised reviewers only) and mentor photos.
- **Scheduling**: slot generation and booking writes happen through a single
  transactional path to prevent double-booking (see §3).
- **Payments**: a licensed payment provider per region (see §5) — never raw card data
  touching POINT B servers.
- **Video**: a third-party meeting provider generating a unique link per booking.
- **Notifications**: transactional email (and optionally SMS) on booking confirmation,
  cancellation, reminders, and application status changes.

## 2. Data model (core tables)

```
users(id, email, name, role[student|mentor|admin], locale, created_at)

mentor_profiles(
  id, user_id, title, organization, country, category[local|international],
  level[professional|senior_specialist|executive], languages[], expertise[],
  industries[], introduction, career_summary, qualifications[], achievements[],
  help_topics[], outside_scope[], price_override_minor_units, verified, status,
  linkedin_url, created_at, updated_at
)

mentor_applications(
  id, user_id, full_name, email, phone, country_of_residence,
  professional_location, linkedin_url, headline, current_role, organization,
  years_experience, industry, specialist_areas[], qualifications, languages[],
  previous_mentorship_experience, topics_offered[], preferred_pricing,
  weekly_availability, motivation, participation[paid|voluntary], agreed_to_terms,
  status, submitted_at
)

interview_scorecards(
  id, application_id, experience, expertise, communication, approach, conduct,
  reviewer_id, created_at
)

availability_slots(
  id, mentor_id, start_at_utc, end_at_utc, is_booked, created_at
)

bookings(
  id, student_id, mentor_id, slot_id, agenda, current_situation, useful_outcome,
  materials_to_review, price_minor_units, currency[PKR|GBP], status, reference,
  meeting_link, created_at
)

booking_feedback(id, booking_id, rating, comment, created_at)

payments(
  id, booking_id, provider, provider_reference, amount_minor_units, currency,
  status, processed_at
)

payouts(id, mentor_id, period_start, period_end, amount_minor_units, currency, status)

admin_audit_log(id, admin_id, action, entity_type, entity_id, notes, created_at)
```

All monetary values are stored as integer minor units (paisa / pence) to avoid
floating-point rounding. All timestamps are stored in UTC; display timezone is resolved
client-side.

## 3. Scheduling & double-booking prevention

`availability_slots` rows are created by the mentor (or generated from a recurring
availability rule). Booking a slot is a single transaction:

```sql
UPDATE availability_slots
SET is_booked = true
WHERE id = :slot_id AND is_booked = false;
-- if 0 rows affected, the slot was already taken: abort and ask the user to pick another
INSERT INTO bookings (...) VALUES (...);
```

This guarantees at most one booking per slot even under concurrent requests, without
needing a separate locking layer.

## 4. Authentication & authorisation

- Session-based auth with a `role` claim (`student` / `mentor` / `admin`).
- Server-side checks on every mutating request: a mentor can only read/write their own
  `mentor_profiles`, `availability_slots` and the bookings that reference them; a
  student can only read/write their own `bookings` and `booking_feedback`.
- Admin-only routes (application review, pricing overrides, payouts) require `role =
  admin`, checked server-side, never only hidden in the UI.
- This prototype substitutes a client-side "demo user" (`src/lib/store.tsx`) with no
  real credential or server-side enforcement — explicitly a stand-in, not a security
  model.

## 5. Payments

- Candidate providers must be verified against the actual legal/merchant entity before
  integration — this spec does not assume a specific provider supports PKR settlement,
  GBP settlement, recurring billing and mentor payouts without that verification, per
  the brief's explicit instruction.
- Checkout always shows session fee, any discount, tax/processing fee and total before
  confirmation (implemented in the prototype's review step, with real amounts set to
  zero pending that provider decision).
- Payment state is reconciled via the provider's server-to-server webhook, not a
  client-side "success" redirect — a booking is only marked `Confirmed` once the
  webhook confirms the charge.
- No raw card data is ever stored on POINT B infrastructure.

## 6. Notifications

Triggered server-side on: booking confirmed, booking cancelled, booking reminder (e.g.
24h and 1h before), application status change, mentor approved. Each is a transactional
email at minimum; SMS is a Phase 2 option for reminders.

## 7. Security controls

- Input validation and rate limiting on all public mutation endpoints (booking
  creation, application submission, contact form).
- Audit logging (`admin_audit_log`) for every status change, pricing override and
  payout action taken by an administrator.
- Identity documents (where collected during mentor interview stages) are stored with
  restricted access limited to authorised reviewers, not general admin staff.
- Preparation notes and session content are visible only to the student, their mentor,
  and admins investigating a dispute or safeguarding report — not to other mentors or
  students.
- Video sessions are not recorded by default; recording would require explicit, logged
  consent from both participants and a defined retention period before being offered.

## 8. What this prototype actually implements

See `development-plan.md` §"Implemented in this prototype" for the precise, honest
boundary between working frontend logic and the production architecture above.
