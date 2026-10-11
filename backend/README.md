# WhatsApp billing relay

Sends bills through the **WhatsApp Business Cloud API** and tracks delivery. No npm packages needed (Node 18+; Node 20.6+ for `--env-file`).

## 1. Meta setup (one time)
1. Create a Meta Business account and a WhatsApp app at developers.facebook.com → add the **WhatsApp** product.
2. Add and verify your business phone number. Copy the **Phone number ID** and create a **permanent access token** (System User).
3. Create a message template (category **Utility**), name `milk_bill`, language English, body:

   `Hello {{1}}, your milk bill for {{2}} is ready. Total milk: {{3}} at {{4}} per litre. Amount to pay: {{5}}. Thank you!`

   Wait until it is **Approved**. WhatsApp only allows business-started messages to customers with an approved template.
4. Webhook: set Callback URL to `https://YOUR-SERVER/webhook`, Verify token = `VERIFY_TOKEN`, subscribe to **messages**.
   Add the app secret as `APP_SECRET` so signatures are verified.

## 2. Run
```bash
cp .env.example .env      # fill in the values
node --env-file=.env server.js
```
Host it anywhere with HTTPS (Render, Railway, a VPS). Then in the app's `constants/business.js` set
`BILLING_API_URL` to the server URL and `BILLING_API_KEY` to the same value as `API_KEY`.

## API
- `POST /send-bill` (header `x-api-key`) – sends one bill. Safe to retry: an already-sent bill is not sent twice.
- `GET /status?ids=a,b` (header `x-api-key`) – `{ statuses: { id: { status, error } } }`
- `GET|POST /webhook` – used by Meta.
- `GET /health`
