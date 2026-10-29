# POINT B Mentors — web app (Next.js)

Customer-facing site, student/mentor dashboards and admin console. It talks to the
NestJS API in `../point-b-api` (MongoDB). Design and product docs live in `docs/`.

## Run locally

```bash
cp .env.local.example .env.local   # or create it: NEXT_PUBLIC_API_URL=http://localhost:4000/api
npm install
npm run dev                         # http://localhost:3000
```

Start the API first (see `../point-b-api/README.md`). Add the web origin to the API's `CORS_ORIGIN`.

## What is live vs. simulated

| Area | Status |
|---|---|
| Accounts, sessions, roles, bookings, availability, applications, admin pipeline, audit log | Real (API + Postgres) |
| Double-booking protection, 15-minute payment hold, cancellation + refund state | Real |
| Payment | **Demo checkout.** The booking is confirmed only via a signed webhook path; the demo button calls the same code. Replace with a licensed provider. |
| Video | Placeholder Jitsi links (`MEETING_BASE_URL`). Swap for the chosen provider. |
| Email | Recorded in an outbox table (visible to admins); no provider connected yet. |

Sample mentors are flagged `isDemo` and labelled "Demo profile" in the UI.
