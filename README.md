# LADDU.CO online store

Seth ji ke laddu aur mathri: product pages, cart, Razorpay checkout, order emails and a password-protected orders page.
Runs on Cloudflare Workers (free plan) with a Cloudflare D1 database for orders.

## Deploy on Cloudflare (step by step)

### 1. Create the orders database
1. Log in at https://dash.cloudflare.com
2. Left menu: **Storage & databases → D1 SQL database → Create database**
3. Name: `laddu-co-db` → **Create**
4. Copy the **Database ID** shown on the next page.
5. In this repo, open `wrangler.jsonc` on GitHub (pencil icon to edit), replace `PASTE-YOUR-D1-DATABASE-ID-HERE` with that ID, and **Commit changes**.

The `orders` table is created automatically on the first visit, so no SQL step is needed.

### 2. Connect GitHub and deploy
1. Left menu: **Compute (Workers) → Workers & Pages → Create → Import a repository**
2. **Connect GitHub**, allow access to `laddu-co-store`, and select it.
3. Settings:
   - Project name: `laddu-co-store`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
4. **Deploy**. After 1–2 minutes the store is live at `https://laddu-co-store.<your-name>.workers.dev`.

Every later push to GitHub redeploys automatically.

### 3. Add the secrets
Worker → **Settings → Variables and secrets → Add** (type: **Secret**) for each:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | A strong password for `/admin` |
| `RAZORPAY_KEY_ID` | Razorpay Dashboard → Account & Settings → API Keys (start with test keys) |
| `RAZORPAY_KEY_SECRET` | Same place as the key ID |
| `RAZORPAY_WEBHOOK_SECRET` | Any long random text; the same text goes into Razorpay Webhooks (step 4) |
| `BREVO_API_KEY` | brevo.com (free) → SMTP & API → API keys |
| `MAIL_FROM` | The sender email you verified in Brevo |
| `OWNER_EMAIL` | Optional. Where new-order emails go (default tusharbagoriya94@gmail.com) |

Click **Deploy** after adding them.

### 4. Razorpay webhook
Razorpay Dashboard → **Account & Settings → Webhooks → Add new webhook**
- URL: `https://<your-site>/api/razorpay-webhook`
- Secret: the same text as `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured`, `order.paid`, `payment.failed`

### 5. Your own domain
Buy the domain (e.g. ladduco.in), add it to Cloudflare, then Worker → **Settings → Domains & Routes → Add → Custom domain**.
Update the webhook URL in Razorpay to the new domain.

### 6. Test
1. With Razorpay **test** keys, place an order and pay with a test card/UPI.
2. Check: "Order placed successfully" page, the customer email, your owner email, and the order in `/admin`.
3. Switch to **live** keys and do one small real payment.

## Things to change before launch (`src/lib/store.ts`)
- Prices and packs: ₹299 / ₹249 / ₹449 are placeholders
- `DELIVERY_FEE` (₹60 placeholder)
- `BUSINESS.phone`: customer-care number
- `RAJASTHAN_ONLY`: set to `false` after GST registration

## Run on your computer (optional)
```
npm install
npm run preview   # builds and starts a local Worker at http://localhost:8787
```
