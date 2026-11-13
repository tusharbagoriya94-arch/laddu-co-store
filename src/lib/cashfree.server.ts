import { secret } from "./secrets.server";

// Cashfree Payment Gateway (hosted checkout).
// Flow: create an order on the server -> open Cashfree's page with the payment_session_id ->
// confirm with the Get Order API when the customer returns, and again from the webhook.
const API_VERSION = "2025-01-01";

export function cashfreeReady() {
  return Boolean(secret("CASHFREE_APP_ID") && secret("CASHFREE_SECRET_KEY"));
}

export function cashfreeMode(): "production" | "sandbox" {
  return secret("CASHFREE_ENV").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function base() {
  return cashfreeMode() === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
}

function headers() {
  return {
    "content-type": "application/json",
    "x-api-version": API_VERSION,
    "x-client-id": secret("CASHFREE_APP_ID"),
    "x-client-secret": secret("CASHFREE_SECRET_KEY"),
  };
}

export type CashfreeCustomer = { name: string; email: string; phone: string };

export async function createCashfreeOrder(opts: {
  code: string;
  amountRupees: number;
  customer: CashfreeCustomer;
  returnUrl: string;
  notifyUrl: string;
}) {
  const res = await fetch(`${base()}/orders`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      order_id: opts.code,
      order_amount: opts.amountRupees,
      order_currency: "INR",
      order_note: `LADDU.CO order ${opts.code}`,
      customer_details: {
        customer_id: `c${opts.customer.phone}`,
        customer_name: opts.customer.name,
        customer_email: opts.customer.email,
        customer_phone: opts.customer.phone,
      },
      order_meta: {
        ...(opts.returnUrl ? { return_url: opts.returnUrl } : {}),
        ...(opts.notifyUrl ? { notify_url: opts.notifyUrl } : {}),
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cashfree order failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as { payment_session_id?: string };
  if (!body.payment_session_id) throw new Error("Cashfree order response had no payment_session_id");
  return body.payment_session_id;
}

// Asks Cashfree whether the order is paid. Returns the successful payment id, or null.
// The amount is checked against our own total so a tampered order can never be confirmed.
export async function cashfreePaidPaymentId(code: string, expectedRupees: number): Promise<string | null> {
  const orderRes = await fetch(`${base()}/orders/${encodeURIComponent(code)}`, { headers: headers() });
  if (!orderRes.ok) return null;
  const order = (await orderRes.json()) as { order_status?: string; order_amount?: number };
  if (order.order_status !== "PAID") return null;
  if (Math.round(Number(order.order_amount) * 100) !== Math.round(expectedRupees * 100)) return null;

  const payRes = await fetch(`${base()}/orders/${encodeURIComponent(code)}/payments`, { headers: headers() });
  if (payRes.ok) {
    const payments = (await payRes.json()) as { cf_payment_id?: string | number; payment_status?: string }[];
    const paid = Array.isArray(payments) ? payments.find((p) => p.payment_status === "SUCCESS") : undefined;
    if (paid?.cf_payment_id != null) return String(paid.cf_payment_id);
  }
  return "cashfree";
}

// Webhook: signature = base64(HMAC_SHA256(timestamp + raw body, secret key))
export async function verifyCashfreeWebhook(timestamp: string, rawBody: string, signature: string) {
  const key = secret("CASHFREE_SECRET_KEY");
  if (!key || !timestamp || !signature) return false;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(timestamp + rawBody)));
  let binary = "";
  for (const b of sig) binary += String.fromCharCode(b);
  const expected = btoa(binary);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
