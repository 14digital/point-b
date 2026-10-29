# POINT B Mentors — Product Blueprint

## 1. Vision

POINT B Mentors is a permanent, standalone online marketplace for private 30-minute
mentorship conversations. It launches before POINT B Academy (a separate physical
institution in Lahore) and continues operating independently after the Academy opens.
Online mentors and Academy trainers are separate talent pools with separate recruitment.

Two journeys are the operational foundation of the product:

1. **Booking journey** — Discover mentor → View profile → Select date & time → Choose
   agenda → Prepare questions → Pay → Confirm booking → Attend session → Leave feedback.
2. **Recruitment journey** — Apply → Screen → Interview → Score → Approve → Onboard →
   Publish profile → Accept bookings.

This repository implements both journeys as a working prototype with clearly labelled
demonstration data, described in full in `development-plan.md`.

## 2. User roles & permissions

| Role | Can do | Cannot do |
|---|---|---|
| **Visitor** (signed out) | Browse mentors, read profiles, start a booking | Confirm a booking without providing contact details |
| **Student** | Book sessions, manage own bookings, save mentors, leave feedback | View other students' bookings or another mentor's private notes |
| **Mentor** (applicant) | Submit and track an application | Publish a profile or accept bookings before approval |
| **Mentor** (active) | Manage own availability, view own bookings and students' prep notes, edit own profile | View another mentor's bookings, earnings or private notes |
| **Administrator** | Review/score/approve applications, manage bookings, set pricing, view finance and growth reporting, moderate content | — |

In production, these boundaries are enforced server-side (row-level access tied to
authenticated user ID and role), not just hidden in the UI. The prototype simulates this
with a lightweight client-side "current demo user" rather than real authentication —
see `technical-spec.md` §4.

Users under 18 require parental/guardian consent and additional booking review before a
session can be confirmed (see Safeguarding, `/legal?tab=safeguarding`); this is
documented as a launch requirement and is not yet enforced in the prototype's UI flow.

## 3. Information architecture

```
/                           Home
/mentors                    Explore Mentors (filterable directory)
/mentors?category=local     Local mentors
/mentors?category=international   International mentors
/mentors/[id]               Mentor profile + booking
/how-it-works               How It Works
/pricing                    Pricing & Packages
/become-a-mentor            Become a Mentor (landing)
/become-a-mentor/apply      Mentor application form
/about                      About POINT B
/academy                    POINT B Academy — Coming Soon
/contact                    Contact & Support
/sign-in                    Sign in / demo role switcher
/dashboard/student           Student Dashboard
/dashboard/mentor             Mentor Dashboard
/admin                       Administrator Dashboard
/legal                       Terms, Privacy, Refunds, Safeguarding (tabbed)
```

## 4. Core workflows

### 4.1 Booking workflow

1. Visitor filters mentors by location (local/international), expertise, industry,
   experience level and price (`/mentors`).
2. Visitor opens a mentor profile, reviews background, "How I can help", and reviews.
3. Visitor selects an available date and 30-minute time slot (shown in local time,
   exact start/end shown, no double-booking by construction since slots are removed
   once booked in a production system).
4. Visitor provides name and email if not already signed in.
5. Visitor selects an agenda category.
6. Visitor answers preparation questions (current situation, desired outcome, optional
   materials to review).
7. Visitor reviews mentor, date, time, agenda and full price breakdown, then confirms.
   Payment is simulated in this prototype and clearly labelled as such.
8. A booking reference and simulated meeting link are generated and appear in the
   student's dashboard and the admin's bookings list.
9. After the session, the student can cancel (before the session) or leave feedback
   (after), from their dashboard.

### 4.2 Mentor recruitment workflow

1. Applicant completes the multi-step application (`/become-a-mentor/apply`): personal
   details, professional background, mentoring preferences, review & consent.
2. Application enters the admin pipeline with status `Submitted`.
3. Administrator moves the application through: `Under Review` → `Shortlisted` →
   `Interview Scheduled` → `Interview Completed`, recording an interview scorecard
   (professional experience 25%, subject expertise 25%, communication 20%, mentorship
   approach 20%, professional conduct & safeguarding 10%; suggested approval threshold
   75/100 — **not** an automatic approval).
4. Administrator explicitly approves (`Approved` → `Onboarding` → `Active`) or declines
   (`Rejected`, `Waitlisted`, `Changes Requested`).
5. Only an `Active` mentor's profile is publicly bookable.
6. Active mentors can later be `Paused` or `Suspended` by an administrator.

## 5. Edge cases considered

- **No matching mentors**: directory shows an explicit empty state, not a blank screen.
- **No availability**: a mentor profile with no upcoming slots should state this rather
  than show a disabled, confusing picker (flagged as a follow-up — the prototype's
  seed mentors all carry upcoming availability).
- **Mentor cancels or is a no-show**: refund or free rescheduling, per
  `/legal?tab=refunds`. Not automated in this prototype; an administrator would process
  this manually from the Bookings tab in production.
- **Duplicate slot selection**: handled in production via a transactional booking write
  keyed on (mentor, date, time) so two students cannot double-book the same slot; the
  prototype does not yet model concurrent demand.
- **Under-18 booking**: requires guardian consent before confirmation — a policy
  requirement, not yet gated in the prototype UI (see §2).
- **Rejected/Waitlisted mentor reapplying**: supported by status transitions back to
  `Under Review` from `Waitlisted` or `Changes Requested`.
- **Currency mismatch**: category (local/international) determines display currency by
  the mentor's verified professional location, not the visitor's; both are always shown
  unambiguously on cards and profiles.

## 6. Acceptance criteria (Phase 1 MVP)

- A visitor can filter mentors by local/international, expertise and level, and the
  result count and empty state are both correct.
- A visitor can complete the full booking journey end to end and see a reference number,
  with the booking appearing in both the student dashboard and admin bookings list.
- A visitor can submit a mentor application and see it appear in the admin pipeline with
  status `Submitted`.
- An administrator can score an application, change its status along the defined
  transition graph, and the change is reflected immediately in the mentor list and (for
  `Active` mentors) on the public directory.
- All prices are shown with currency, and local vs. international labelling is
  unambiguous on every card, profile and checkout screen.
- No fabricated testimonials, statistics or partnerships appear; all demonstration data
  is labelled as such at least once per page where it could be mistaken for live data.
