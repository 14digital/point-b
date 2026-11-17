# WhatsApp: wire official Meta number

**Status:** Audit only — do **not** put production secrets in chat or commit them. Wait for the user’s official number + Meta credentials before changing live env.

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

## What to change for the official number

1. **Meta Business / WhatsApp Manager**  
   - Add or migrate the official business phone onto the **WhatsApp Business Account (WABA)** that owns POINT B’s templates (or move templates to the WABA that owns the new number).  
   - Note the new **Phone number ID** (API Setup) and confirm display name / quality rating.

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

Before changing production/local secrets, collect:

1. Official WhatsApp **E.164** number (and confirmation it is registered on Meta).  
2. **Phone number ID** from Meta API Setup.  
3. **WABA** id / confirmation templates live on that WABA.  
4. **Access token** (system user) + confirmation of Meta **App** (for `APP_SECRET` / webhook).  
5. Whether this replaces the current `PHONE_NUMBER_ID` or is a second number (product decision: code supports one send-from id today).
