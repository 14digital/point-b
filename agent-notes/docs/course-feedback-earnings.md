# Course end-of-course feedback + admin earnings

`/cursor/stores/self/docs` was not writable on this agent; this plan lives under `agent-notes/docs/`.

## Goals

1. **One feedback per enrolment** after the **last class** finishes (not after every mid-course session).
2. **Student dashboard** surfaces the request immediately (stat tile, sidebar CTA, Past card auto-opens the form).
3. **Form**: overall stars + three Likert items (clarity / usefulness / recommend) + optional comment; stored on the enrolment’s `Review`, not per class.
4. **Admin Courses** list shows **earnings per course**: learner gross, mentor fixed fee, company share (gross − fee), plus feedback aggregates.

## Behaviour

| Case | Behaviour |
|------|-----------|
| Course in progress | `canReview` false until last class `endAt` **or** mentor marks final class complete |
| Mid-course leave (`/session`) | Honest copy (“thanks for joining” / opens after final class) — **no** “course has finished”, **no** form |
| Last class finished / marked complete | Working stars + Likert + comment on session page, Past, and profile |
| Last class finished (auto) | `canReview` true immediately; enrolment `COMPLETED` after **15 min** grace (or instantly when mentor marks final class complete), then email if no review |
| Already submitted | No second review; one edit allowed |
| Cancelled / no-show / unpaid | No feedback |
| Mentor fee not PKR | Company share shown as `—` (learner price is PKR) |

## API

- `Review.clarity|usefulness|recommend` (optional Int 1–5); required for course reviews.
- `POST/PATCH /bookings/:ref/review` validates Likert for course enrolments.
- `AvailabilitySlot.completedAt` — mentor/admin **Mark class complete**.
- `GET /courses/me/:id/classes` (+ admin) — per-class status, join times (`session_joined`), attendance counts.
- `POST /courses/me/:id/classes/:n/complete` (+ admin) — sets `completedAt`; final class runs `finishCourseEnrolments`.
- `GET /admin/courses` adds `companyRevenueMinor`, `feedback` averages (rating + Likert, pending count).

## FE

- Session `FeedbackPanel`: form only when `canReview`; mid-course messaging matches reality.
- `FeedbackForm` + student Past: clearer hierarchy; Past auto-opens when due.
- Mentor course card: Classes panel with attendance + **Mark class complete**; “under way” instead of false “starting now”.
- Admin courses: Show classes & attendance + mark complete.

## Ship

Continue on `cursor/course-revenue-model-0e54` and **update PR #1** (earnings UI is the same fixed-fee model; feedback is a small additive schema change). Open a stacked PR only if reviewers want feedback isolated.
