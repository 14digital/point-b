# Deploying POINT B

The website (`point-b-mentors`, Next.js) and the API (`point-b-api`, NestJS) deploy together as **one Node.js app on one server and one domain**. There is no second deployment and no API URL to configure: the site calls `/api` on its own domain.

| Path | Served by |
|---|---|
| `/api/...` (and API docs at `/api/docs`) | NestJS API |
| everything else | Next.js website |

## Requirements

- Node.js 20.9 or newer
- A host that keeps a Node.js process running (cPanel "Setup Node.js App", a VPS, Railway, Render…). Serverless hosts such as Vercel are not supported: the API runs a background timer for reminder emails.
- MongoDB Atlas: allow the server's IP under Network Access.

## Steps

Run everything from the **project root**.

1. Create `.env` in the project root from `.env.example` and fill it in. At minimum: `DATABASE_URL`, `JWT_SECRET` (24+ characters), and `WEB_URL` and `CORS_ORIGIN` set to the site's address, e.g. `https://example.com`. Don't set `PORT` on cPanel; the host provides it.
2. Install (also installs both sub-projects):
   ```bash
   npm install
   ```
3. Build the API and the website:
   ```bash
   npm run build
   ```
4. Start:
   ```bash
   npm start
   ```
   On cPanel, set the application startup file to `server.js` and use Restart instead of `npm start`.

After a code update: pull, then `npm install`, `npm run build`, and restart.

## Notes

- WhatsApp alerts to students need `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and an approved template (see `.env.example`). Without them everything else works and WhatsApp messages are only logged.

- Stripe webhook endpoint: `https://<your-domain>/api/payments/stripe/webhook` (event `payment_intent.succeeded`).
- If `npm run build` runs out of memory on shared hosting, build on another machine and upload `point-b-mentors/.next` and `point-b-api/dist`, then restart.
- Local development is unchanged: `npm run dev:api` (port 4000) and `npm run dev:web` (port 3000) in two terminals.
