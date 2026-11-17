# WhatsApp: wire official Meta number

**Status:** Production cutover checklist ready — do **not** write real `WHATSAPP_*` values yet. Still waiting for Meta **Phone number ID** + **access token** (and WABA confirmation). Do not put secrets in chat, git, or PRs.

## Official number (recorded)

| Field | Value |
|-------|--------|
| Display (local PK) | `03001065161` |
| E.164 | `+923001065161` |
| Env cutover | **Blocked** — placeholders only until Phone number ID + token arrive |

This is the intended send-from business number once it is registered on the POINT B WABA and wired via **production** env.

## Verdict

Point B already sends student alerts through the **WhatsApp Business Cloud API (Meta Graph)**. There is **no Twilio** (or other SMS/WhatsApp provider) in this repo. Switching to an “official” number is mostly **Meta console + env swap** (`WHATSAPP_PHONE_NUMBER_ID` / token), not a rewrite of the send path.

## Where messages send today

```
notify.send(...)  →  NotificationsService.alsoWhatsApp(...)
                  →  WhatsAppService.sendAlert / .send
                  →  POST https://graph.facebook.com/{v}/{WHATSAPP_PHONE_NUMBER_ID}/messages
                     (Bearer WHATSAPP_TOKEN or WHATSAPP_ACCESS_TOKEN)
```

| Layer | Path | Role |
|--------|------|------|
| Send | `point-b-api/src/common/whatsapp.service.ts` | Template messages via Meta Cloud API |
| Templates | `point-b-api/src/common/whatsapp-templates.ts` | Alert → template name + body copy |
| Docs / paste kit | `point-b-api/WHATSAPP_TEMPLATES.md`, `npm run whatsapp:templates` | Utility template submission text |
| Webhook | `GET/POST /api/whatsapp/webhook` (`whatsapp.controller.ts`) | Meta verify + delivery status updates |
| Fan-out | `notifications.service.ts` `alsoWhatsApp` | After email; students only if `phone` + `whatsappAlerts` |
| Admin UI | `point-b-mentors` → Admin → WhatsApp delivery (`whatsapp-delivery.tsx`) | Recent rows + status counts (`GET /admin/whatsapp/messages`) |
| Opt-in UI | Sign-up / account / student dashboard mobile field | Collects E.164 phone + WhatsApp checkbox |

**Who gets WhatsApp:** `role === STUDENT`, non-null `phone`, `whatsappAlerts === true`. Mentors are not messaged on WhatsApp from this path. Welcome email and mentor promo emails set `whatsapp: false`.

## Alerts that send WhatsApp today

| Code key | Meta template name | Trigger |
|----------|--------------------|---------|
| `bookingConfirmed` | `pointb_booking_confirmed` | 1:1 booking or course enrolment paid |
| `sessionReminder` | `pointb_session_reminder` | ~30 min before session/class |
| `sessionRescheduled` | `pointb_session_rescheduled` | Student/admin reschedule |
| `bookingCancelled` | `pointb_booking_cancelled` | Cancel |
| `feedbackRequest` | `pointb_feedback_request` | After 1:1 complete (not course end-of-course path’s WA — course feedback ask is email-only today) |
| `paymentReceived` | `pointb_payment_received` | Bank transfer details submitted |
| `paymentNotVerified` | `pointb_payment_not_verified` | Bank payment rejected |

Fallback generic template env: `WHATSAPP_TEMPLATE` (default `pointb_alert`) if a named template returns Meta **132001** (missing/unapproved).

Language: `WHATSAPP_TEMPLATE_LANG` (default `en`). API version: `WHATSAPP_API_VERSION` (default `v21.0`).

## Env vars (names only)

Used by code:

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta **Phone number ID** (not the dial number) in the send URL |
| `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_TOKEN` | Permanent / system-user token with `whatsapp_business_messaging` |
| `WHATSAPP_APP_SECRET` | Verify `X-Hub-Signature-256` on webhook POSTs |
| `WHATSAPP_VERIFY_TOKEN` | Shared secret for webhook GET subscription challenge |
| `WHATSAPP_TEMPLATE` | Optional generic fallback template name |
| `WHATSAPP_TEMPLATE_LANG` | Template language code (default `en`) |
| `WHATSAPP_API_VERSION` | Graph API version (default `v21.0`) |

Root and API `.env.example` list **names only** (no secrets). Local/dev `.env` files may already have a different test number’s id + token (**values not recorded here**). Production must be updated separately when credentials arrive.

**Not used:** Twilio SID/Auth, MessageBird, etc.

## Where production secrets live (this stack)

POINT B is **one Node process** (`server.js`): Nest API under `/api`, Next site elsewhere. Secrets are **not** in git.

| Location | Role |
|----------|------|
| **`<project-root>/.env`** | **Primary** production env file (`DEPLOY.md` step 1). `server.js` loads it first. |
| **`point-b-api/.env`** | Optional fallback for keys missing from root (also loaded by `server.js`). Prefer putting WhatsApp keys in **root** `.env` so one file owns prod. |
| **Host / cPanel “Setup Node.js App” → Environment variables** | Optional. Real process env **wins** over both `.env` files (`server.js` comment: “Real env vars always win”). If WhatsApp keys are set here, edit them in the host UI and restart — do not also leave conflicting values in `.env`. |
| **`point-b-mentors/.env.local`** | **Not** used for WhatsApp send/webhook (API-only). |

**Deploy notes:** On cPanel, application startup file = `server.js`; after env edits, **Restart** the Node app so Nest re-reads env. No code redeploy required for a pure credential swap. If you change code, usual path: pull → `npm install` → `npm run build` → restart.

**Webhook URL (production):** `https://<WEB_URL>/api/whatsapp/webhook`  
(`WEB_URL` / `CORS_ORIGIN` are the public site origin, e.g. the value already set in prod root `.env`.)

## Finding Phone number ID (local docs + Meta UI)

Repo docs (`WHATSAPP_TEMPLATES.md`, `DEPLOY.md`, `.env.example`, code comments) only say you need `WHATSAPP_PHONE_NUMBER_ID` and that it comes from Meta **API Setup** — they do **not** document a click-path beyond that, and they do **not** map a dial number (e.g. `+923001065161`) to an ID automatically. There is no in-repo script to look it up.

Until credentials are provided, use Meta’s console (do not invent an ID):

1. [Meta for Developers](https://developers.facebook.com/) → the POINT B app → **WhatsApp** → **API Setup** (or **WhatsApp** → **Configuration**).  
2. Under **From** / phone numbers, select the number whose display matches **`+923001065161`** (`03001065161`).  
3. Copy **Phone number ID** (numeric Graph id — **not** the E.164 dial string).  
4. Confirm the number sits on the same **WABA** that owns the `pointb_*` templates (or plan template re-approval on the new WABA).

Optional Graph check (only after a valid token exists; do not run against production with guessed values):  
`GET https://graph.facebook.com/{version}/{WABA_ID}/phone_numbers` with the system-user token, then match `display_phone_number` to `+92 300 1065161` / `+923001065161` and read `id`.

## What to change for the official number

1. **Meta Business / WhatsApp Manager**  
   - Add or migrate **`+923001065161`** onto the **WhatsApp Business Account (WABA)** that owns POINT B’s templates (or move templates to the WABA that owns the new number).  
   - Note the new **Phone number ID** (API Setup — see above) and confirm display name / quality rating.

2. **Token**  
   - Prefer a **System User** permanent token on the same Meta app + WABA, with `whatsapp_business_messaging` (and usually `whatsapp_business_management`).  
   - If the number moves to a different WABA/app, mint a **new** token; do not reuse an old one.

3. **Templates**  
   - Templates are **per WABA**. Re-create/approve the seven Utility templates (see `WHATSAPP_TEMPLATES.md`) on the WABA attached to the official number if that WABA is different from today’s.  
   - Keep names exactly as in code (`pointb_*`) unless you also change `whatsapp-templates.ts`.

4. **App env (when user provides credentials)** — see production checklist below.  
5. **Smoke test** — see checklist.  
6. **Do not** invent or paste production secrets into the repo, PR, or chat. Rotate any token that may have been exposed in logs.

## Production cutover checklist (official `+923001065161`)

**Code / deploy:** No application code change is required to send from the official number. Cutover is Meta console + env + restart. Mentors UI already shows delivery at Admin → WhatsApp delivery.

### A. Meta (before touching prod env)

- [ ] `+923001065161` added/migrated onto the WABA that owns `pointb_*` templates (or templates re-created/approved on the new WABA with **identical** names).
- [ ] Display name / quality rating acceptable in WhatsApp Manager.
- [ ] Copy **Phone number ID** for that display number (API Setup) — leave blank in env until available: `________________`.
- [ ] Mint **system-user** permanent token (`whatsapp_business_messaging`; usually also `whatsapp_business_management`) — do not paste into git/chat: store only in host secret store / prod `.env`.
- [ ] Confirm Meta **App** for webhook: App Secret → maps to `WHATSAPP_APP_SECRET`; choose/confirm `WHATSAPP_VERIFY_TOKEN` (long random string you control).

### B. Production env (write values only after Phone number ID + token are in hand)

Edit **one** of: root `.env` (preferred) **or** cPanel Node env vars (if that is how prod is managed today). Do **not** commit the file.

```bash
# Names only — fill on the server when credentials arrive. Prefer ACCESS_TOKEN; TOKEN is an alias.
WHATSAPP_PHONE_NUMBER_ID=   # Meta Phone number ID for +923001065161 (NOT +923001065161 itself)
WHATSAPP_ACCESS_TOKEN=      # system-user token (or set WHATSAPP_TOKEN instead)
# WHATSAPP_TOKEN=           # alternate name; code accepts either
WHATSAPP_APP_SECRET=        # Meta app > Settings > Basic > App Secret
WHATSAPP_VERIFY_TOKEN=      # same string configured in Meta webhook Verify Token
# Optional (defaults already match code):
# WHATSAPP_TEMPLATE=pointb_alert
# WHATSAPP_TEMPLATE_LANG=en
# WHATSAPP_API_VERSION=v21.0
```

- [ ] Set/replace the keys above for the official number (replaces any previous send-from Phone number ID — code supports **one** id).
- [ ] Remove or avoid duplicate conflicting WhatsApp keys in the other location (root `.env` vs `point-b-api/.env` vs host UI).
- [ ] **Restart** the Node app (cPanel Restart, or stop/start `node server.js`) so Nest picks up env.
- [ ] Confirm process can see WhatsApp enabled: without id+token, API only **logs** WhatsApp and does not call Graph.

### C. Meta webhook verify

- [ ] In Meta app → WhatsApp → Configuration → Webhook:  
  Callback URL = `https://<production-WEB_URL>/api/whatsapp/webhook`  
  Verify token = exact `WHATSAPP_VERIFY_TOKEN` from prod env  
  Subscribe to field **`messages`** (delivery/read statuses).
- [ ] Click **Verify and save** (hits `GET /api/whatsapp/webhook`). If verify fails: wrong token, app not restarted, or URL not reaching Nest `/api`.
- [ ] After first real send, confirm `POST` delivery updates update Admin → WhatsApp delivery (`accepted` → `delivered` / `read`). Signature uses `WHATSAPP_APP_SECRET` + raw body.

### D. Smoke test (prod or staging with same Meta app)

- [ ] Student account: role student, phone in E.164, `whatsappAlerts` on.
- [ ] Trigger a low-risk template (e.g. booking confirmed after a test payment path, or session reminder in a controlled window).
- [ ] Recipient WhatsApp thread shows sender as **official** `+923001065161` / business display name.
- [ ] Admin → WhatsApp delivery row: template name `pointb_*`, status progresses; on Meta **132001**, code falls back to `WHATSAPP_TEMPLATE` (`pointb_alert`) — treat that as “named template missing on this WABA”.

### E. Rollback

- [ ] Restore previous `WHATSAPP_PHONE_NUMBER_ID` + token in the same secret location and restart.
- [ ] Or unset both → WhatsApp sends become log-only; email path unchanged.

## Optional follow-ups (code, after credentials)

- Course end-of-course feedback currently emails only — add `whatsapp: { alert: 'feedbackRequest', ... }` if product wants parity.  
- Consider a one-off “test message” admin action behind staff role for cutover day.

## Wait for user

| Item | Status |
|------|--------|
| Official WhatsApp **E.164** | **Received:** `+923001065161` (display `03001065161`) |
| Confirmation number is registered on Meta / WABA | **Pending** |
| **Phone number ID** from Meta API Setup | **Pending** — do not guess; see “Finding Phone number ID” |
| **WABA** id / templates live on that WABA | **Pending** |
| **Access token** (system user) + Meta **App** (for `APP_SECRET` / webhook) | **Pending** |
| Replace current send-from id vs second number | **Assumed replace** (one `WHATSAPP_PHONE_NUMBER_ID` in code) — confirm if product needs dual-number |

**Hold:** Do **not** write real production (or local) `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_TOKEN` values until Phone number ID + token are provided. Webhook verify/secret may stay as-is if the Meta **app** is unchanged; still confirm they match before Verify and save.
