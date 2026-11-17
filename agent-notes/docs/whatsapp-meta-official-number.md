# WhatsApp: wire official Meta number

**Status:** Official display number recorded — do **not** change any `WHATSAPP_*` secrets yet. Still waiting for Meta **Phone number ID** + **access token** (and WABA confirmation) before env cutover. Do not put secrets in chat or commit them.

## Official number (recorded)

| Field | Value |
|-------|--------|
| Display (local PK) | `03001065161` |
| E.164 | `+923001065161` |
| Env cutover | **Blocked** — no `WHATSAPP_PHONE_NUMBER_ID` / token update until Meta credentials arrive |

This is the intended send-from business number once it is registered on the POINT B WABA and wired via env.

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

`.env.example` only documents verify token + app secret; local `.env` already has phone number id + access token + secret + verify token **set** (values not recorded here).

**Not used:** Twilio SID/Auth, MessageBird, etc.

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

4. **App env (when user provides credentials)**  
   - Set `WHATSAPP_PHONE_NUMBER_ID` = new phone number id.  
   - Set `WHATSAPP_ACCESS_TOKEN` = new token.  
   - Keep or refresh `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` for the same Meta app; re-point webhook if the app changes:  
     `https://<api-host>/api/whatsapp/webhook` → subscribe to **messages** (statuses).

5. **Smoke test**  
   - Opt-in test student with a real PK mobile.  
   - Trigger a low-risk alert (e.g. booking confirm in staging) or temporary admin test send if added later.  
   - Confirm Admin → WhatsApp delivery: `accepted` → `delivered` / `read`; sender shows the official number in WhatsApp.

6. **Do not** invent or paste production secrets into the repo, PR, or chat. Rotate any token that may have been exposed in logs.

## Optional follow-ups (code, after credentials)

- Document all `WHATSAPP_*` keys in `.env.example` (names + comments only).  
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
| Replace current send-from id vs second number | **Pending** (code supports **one** `WHATSAPP_PHONE_NUMBER_ID` today) |

**Hold:** Do **not** edit local or production `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, or `WHATSAPP_VERIFY_TOKEN` until Phone number ID + token are provided.
