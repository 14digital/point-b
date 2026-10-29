# POINT B Mentors — API (NestJS + Prisma + MongoDB)

## 1. Run locally

```bash
npm install
cp .env.example .env               # then set JWT_SECRET and PAYMENT_WEBHOOK_SECRET
npm run db:local                   # terminal 1: local MongoDB replica set on :27017 (data in .mongo-data)
npm run db:push                    # create collections and indexes
ADMIN_EMAIL=you@pointb.com ADMIN_PASSWORD='choose-a-strong-one' npm run db:seed
npm run db:seed:demo               # optional: 6 clearly flagged demo mentors (NOT for production)
npm run build && npm start         # API on :4000, Swagger at /api/docs
```

For MongoDB Atlas (or any hosted replica set), set `DATABASE_URL` to its connection string with the
database name included (e.g. `mongodb+srv://user:pass@cluster/pointb`). A replica set is required
because bookings use transactions. Authorisation is enforced in the NestJS guards.

## 2. Test

```bash
npm run build && node dist/main.js &      # API against a local database
npx ts-node --transpile-only test/e2e.ts  # 72 end-to-end checks over HTTP
```

Covers: auth and roles, concurrent double-booking (5 racers, 1 winner), webhook signature +
idempotency, cancel/refund/slot release, late-cancel window, completion + reviews, under-18
consent, the full mentor pipeline (scorecard gates, identity + agreement gates, onboarding
account creation), price overrides, commission not invented, audit log.

## 3. Key rules implemented

- Prices are integer minor units (paisa / pence). Local mentors → PKR, international → GBP, set by
  verified professional location. Tier prices and per-mentor overrides are editable by admins.
- A booking holds its slot for 15 minutes; unpaid holds are released automatically.
- A booking is confirmed only by a payment result (`POST /payments/webhook`, HMAC-signed).
  `POST /payments/mock/:ref/complete` exists only while `PAYMENTS_PROVIDER=mock` — set it to your
  provider name in production to disable it.
- Application stages follow a fixed transition graph. Approval needs a scorecard (and a written
  reason below 75/100). Activation needs verified identity and an accepted mentor agreement.
- Commission is unset until an admin configures it; no platform revenue is calculated before then.
- Every admin action is written to `AuditLog`.

## 4. Before launch

- Connect a payment provider that supports your merchant entity, PKR/GBP settlement and payouts;
  implement its checkout and map its webhook to `PaymentsService.applyResult`.
- Connect a transactional email provider in `NotificationsService.send`.
- Connect a video provider in `BookingsService.confirmPaid`.
- Move the web session token from localStorage to an httpOnly cookie (needs same-site API/web domains).
- Add password reset, email verification, and a guardian-consent link for under-18 students
  (admins can currently record consent via `PATCH /admin/users/:id/guardian-consent`).
- Legal review of terms, privacy, refunds and safeguarding copy.
