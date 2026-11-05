import type { D1Database } from "@cloudflare/workers-types";

import { sendOrderEmails, sendShippedEmail, type OrderForEmail } from "./email.server";
import type { PricedLine } from "./store";

export type OrderRow = {
  id: number;
  code: string;
  view_token: string;
  status: string;
  items_json: string;
  items_total: number;
  delivery: number;
  total: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  gift_message: string;
  rzp_order_id: string | null;
  rzp_payment_id: string | null;
  courier: string;
  awb: string;
  tracking_url: string;
  note: string;
  emails_sent: number;
  shipped_email_sent: number;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
};

function istYmd() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  const y = String(d.getUTCFullYear()).slice(2);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function randomToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type NewOrder = {
  items: PricedLine[];
  items_total: number;
  delivery: number;
  total: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  gift_message: string;
};

// Inserts a pending order with a readable code like LC-261116-03.
export async function insertOrder(DB: D1Database, o: NewOrder) {
  const ymd = istYmd();
  const prefix = `LC-${ymd}-`;
  const countRow = await DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE code LIKE ?")
    .bind(`${prefix}%`)
    .first<{ n: number }>();
  let n = (countRow?.n ?? 0) + 1;
  const token = randomToken();
  for (let attempt = 0; attempt < 6; attempt++, n++) {
    const code = `${prefix}${String(n).padStart(2, "0")}`;
    try {
      await DB.prepare(
        `INSERT INTO orders (code, view_token, status, items_json, items_total, delivery, total,
          name, phone, email, address, city, state, pin, gift_message)
         VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          code, token, JSON.stringify(o.items), o.items_total, o.delivery, o.total,
          o.name, o.phone, o.email, o.address, o.city, o.state, o.pin, o.gift_message,
        )
        .run();
      return { code, token };
    } catch (error) {
      if (!String(error).includes("UNIQUE")) throw error;
    }
  }
  throw new Error("Could not allocate an order code");
}

export function toEmailOrder(row: OrderRow): OrderForEmail {
  let items: PricedLine[] = [];
  try {
    items = JSON.parse(row.items_json) as PricedLine[];
  } catch {
    items = [];
  }
  return {
    code: row.code,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    pin: row.pin,
    gift_message: row.gift_message,
    items,
    items_total: row.items_total,
    delivery: row.delivery,
    total: row.total,
    rzp_payment_id: row.rzp_payment_id,
    courier: row.courier,
    awb: row.awb,
    tracking_url: row.tracking_url,
  };
}

// Marks the order paid (idempotent) and sends the two emails exactly once,
// whether this is called from the checkout page or from the Razorpay webhook.
export async function markPaid(DB: D1Database, rzpOrderId: string, paymentId: string, siteOrigin: string) {
  await DB.prepare(
    `UPDATE orders SET status = 'paid', rzp_payment_id = ?, paid_at = datetime('now')
     WHERE rzp_order_id = ? AND status IN ('pending', 'failed')`,
  )
    .bind(paymentId, rzpOrderId)
    .run();

  const claim = await DB.prepare(
    `UPDATE orders SET emails_sent = 1
     WHERE rzp_order_id = ? AND emails_sent = 0 AND status NOT IN ('pending', 'failed')`,
  )
    .bind(rzpOrderId)
    .run();

  const row = await DB.prepare("SELECT * FROM orders WHERE rzp_order_id = ?")
    .bind(rzpOrderId)
    .first<OrderRow>();

  if (row && (claim.meta?.changes ?? 0) > 0) {
    try {
      await sendOrderEmails(toEmailOrder(row), siteOrigin);
    } catch (error) {
      console.error("Order emails failed", error);
    }
  }
  return row;
}

export async function maybeSendShipped(DB: D1Database, code: string) {
  const claim = await DB.prepare(
    `UPDATE orders SET shipped_email_sent = 1
     WHERE code = ? AND shipped_email_sent = 0 AND status = 'shipped' AND awb != ''`,
  )
    .bind(code)
    .run();
  if ((claim.meta?.changes ?? 0) === 0) return false;
  const row = await DB.prepare("SELECT * FROM orders WHERE code = ?").bind(code).first<OrderRow>();
  if (!row) return false;
  return sendShippedEmail(toEmailOrder(row));
}

export function trackingUrlFor(courier: string, awb: string) {
  if (!awb) return "";
  if (courier === "Delhivery") return `https://www.delhivery.com/track-v2/package/${encodeURIComponent(awb)}`;
  if (courier === "India Post") return "https://www.indiapost.gov.in/";
  return "";
}
