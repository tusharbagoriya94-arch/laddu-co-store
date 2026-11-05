import { secret, safeEqual } from "./secrets.server";

const API = "https://api.razorpay.com/v1";

export function razorpayReady() {
  return Boolean(secret("RAZORPAY_KEY_ID") && secret("RAZORPAY_KEY_SECRET"));
}

function authHeader() {
  return "Basic " + btoa(`${secret("RAZORPAY_KEY_ID")}:${secret("RAZORPAY_KEY_SECRET")}`);
}

export async function createRazorpayOrder(amountPaise: number, receipt: string) {
  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: authHeader() },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: { order_code: receipt },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Razorpay order failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error("Razorpay order response had no id");
  return body.id;
}

async function hmacHex(key: string, message: string) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Checkout success: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export async function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const keySecret = secret("RAZORPAY_KEY_SECRET");
  if (!keySecret) return false;
  const expected = await hmacHex(keySecret, `${orderId}|${paymentId}`);
  return safeEqual(expected, signature);
}

// Webhook: signature = HMAC_SHA256(raw body, webhook_secret)
export async function verifyWebhookSignature(rawBody: string, signature: string) {
  const webhookSecret = secret("RAZORPAY_WEBHOOK_SECRET");
  if (!webhookSecret) return false;
  const expected = await hmacHex(webhookSecret, rawBody);
  return safeEqual(expected, signature);
}
