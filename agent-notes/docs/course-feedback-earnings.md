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
| Course in progress | `canReview` false until last class `endAt` |
| Last class finished | `canReview` true immediately (in-app); enrolment marked `COMPLETED` after **15 min** grace, then email reminder if no review |
| Already submitted | No second review; one edit allowed |
| Cancelled / no-show / unpaid | No feedback |
| Mentor fee not PKR | Company share shown as `—` (learner price is PKR) |

## API

- `Review.clarity|usefulness|recommend` (optional Int 1–5); required for course reviews.
- `POST/PATCH /bookings/:ref/review` validates Likert for course enrolments.
- `GET /admin/courses` adds `companyRevenueMinor`, `feedback` averages (rating + Likert, pending count).
- Admin + mentor review lists expose Likert + course title.

## FE

- `FeedbackForm`: Likert only when `b.course`.
- Student Past: auto-open form when `canReview`.
- Admin courses: earnings trio in row header + expanded “Earnings from this course” panel.

## Ship

Continue on `cursor/course-revenue-model-0e54` and **update PR #1** (earnings UI is the same fixed-fee model; feedback is a small additive schema change). Open a stacked PR only if reviewers want feedback isolated.
