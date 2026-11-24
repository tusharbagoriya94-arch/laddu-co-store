import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "./bindings.server";
import { cashfreeAttempts, cashfreePaidPaymentId, cashfreeReady, type CashfreeAttempts } from "./cashfree.server";
import { emailReady, sendPaymentReminder } from "./email.server";
import { markPaid, toEmailOrder, type OrderRow } from "./orders.server";
import { ownerEmail } from "./secrets.server";
import { BUSINESS, normalizePhone } from "./store";

// Payment recovery: customers who filled checkout but left Cashfree's page without paying.
//  - The cron (every 15 min, see server.ts) emails them about 1 h and 24 h later, then stops.
//  - /admin → "Payment adhoore" lists them with a ready WhatsApp message and a call button.
//  - Every link opens /checkout?resume=<code>&t=<token>, which refills their cart and details.
//    An order placed from such a link records recovered_from / recovered_via.

export const SITE_ORIGIN = "https://ladduco.in";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export type RecoveryRow = OrderRow & {
  reminder1_at: string | null;
  reminder2_at: string | null;
  contacted_at: string | null;
  recovered_from: string | null;
  recovered_via: string | null;
  opted_out: number;
};

export function sqlTime(s: string | null) {
  return s ? Date.parse(s.replace(" ", "T") + "Z") : NaN;
}

export function resumeUrl(row: Pick<OrderRow, "code" | "view_token">, via: "e1" | "e2" | "wa") {
  return `${SITE_ORIGIN}/checkout?resume=${encodeURIComponent(row.code)}&t=${row.view_token}&src=${via}`;
}

export function stopUrl(row: Pick<OrderRow, "code" | "view_token">) {
  return `${SITE_ORIGIN}/api/stop-reminders?c=${encodeURIComponent(row.code)}&t=${row.view_token}`;
}

// Tushar's own test orders never get reminders or show up in the list.
function internalEmails() {
  return Array.from(new Set([ownerEmail(), BUSINESS.email, "tusharbagoriya94@gmail.com"].map((e) => e.toLowerCase())));
}

/**
 * Unpaid orders worth following up, newest first:
 * only the latest unpaid order of each customer (same email or phone), and only if
 * that customer has not paid for any order since (or within 2 hours before it).
 */
export async function unpaidOrders(DB: D1Database, days: number, limit = 60): Promise<RecoveryRow[]> {
  const internal = internalEmails();
  const { results } = await DB.prepare(
    `SELECT o.*,
       EXISTS (SELECT 1 FROM email_optout x WHERE x.email = lower(o.email)) AS opted_out
     FROM orders o
     WHERE o.status IN ('pending', 'failed')
       AND o.created_at >= datetime('now', ?)
       AND lower(o.email) NOT IN (${internal.map(() => "?").join(", ")})
       AND o.phone != ?
       AND NOT EXISTS (
         SELECT 1 FROM orders p
         WHERE p.status NOT IN ('pending', 'failed')
           AND (p.email = o.email OR p.phone = o.phone)
           AND (p.id > o.id OR p.created_at >= datetime(o.created_at, '-2 hours')))
       AND NOT EXISTS (
         SELECT 1 FROM orders n
         WHERE n.id > o.id AND n.status IN ('pending', 'failed')
           AND (n.email = o.email OR n.phone = o.phone))
     ORDER BY o.id DESC
     LIMIT ?`,
  )
    .bind(`-${days} days`, ...internal, normalizePhone(BUSINESS.phone), limit)
    .all<RecoveryRow>();
  return results ?? [];
}

/** Checks Cashfree; if the order was in fact paid (missed webhook), marks it paid. Returns the attempts. */
async function checkCashfree(DB: D1Database, row: OrderRow): Promise<{ paid: boolean; attempts: CashfreeAttempts | null }> {
  if (row.rzp_order_id !== row.code || !cashfreeReady()) return { paid: false, attempts: null };
  try {
    const attempts = await cashfreeAttempts(row.code);
    if (attempts?.paid) {
      const paymentId = await cashfreePaidPaymentId(row.code, row.total);
      if (paymentId) {
        await markPaid(DB, row.code, paymentId, SITE_ORIGIN);
        return { paid: true, attempts };
      }
    }
    return { paid: false, attempts };
  } catch (error) {
    console.error("cashfree check failed", row.code, error);
    return { paid: false, attempts: null };
  }
}

export type ReminderResult = { checked: number; sent1: number; sent2: number; foundPaid: number; skipped?: string };

/** Run by the cron every 15 minutes. Max 12 emails per run (keeps within Worker limits). */
export async function runPaymentReminders(nowMs = Date.now()): Promise<ReminderResult> {
  const result: ReminderResult = { checked: 0, sent1: 0, sent2: 0, foundPaid: 0 };
  const { DB } = bindings();
  if (!DB) return { ...result, skipped: "no database" };
  if (!emailReady()) return { ...result, skipped: "email not set up" };

  const rows = await unpaidOrders(DB, 5);
  const due: { row: RecoveryRow; stage: 1 | 2 }[] = [];
  for (const row of rows) {
    if (row.opted_out || !row.email) continue;
    const age = nowMs - sqlTime(row.created_at);
    if (!row.reminder1_at) {
      if (age >= 1 * HOUR && age <= 72 * HOUR) due.push({ row, stage: 1 });
    } else if (!row.reminder2_at) {
      const since1 = nowMs - sqlTime(row.reminder1_at);
      if (age >= 24 * HOUR && since1 >= 20 * HOUR && age <= 5 * 24 * HOUR) due.push({ row, stage: 2 });
    }
  }

  for (const { row, stage } of due.slice(0, 12)) {
    result.checked++;
    console.log("payment reminder due", row.code, `stage ${stage}`);
    if (stage === 1) {
      // A customer who already got reminders for an earlier attempt this week gets no new series.
      const recent = await DB.prepare(
        `SELECT 1 AS x FROM orders WHERE id != ? AND (email = ? OR phone = ?)
           AND reminder1_at >= datetime('now', '-3 days') LIMIT 1`,
      )
        .bind(row.id, row.email, row.phone)
        .first();
      if (recent) {
        await DB.prepare("UPDATE orders SET reminder1_at = datetime('now'), reminder2_at = datetime('now') WHERE id = ?")
          .bind(row.id)
          .run();
        continue;
      }
    }

    const cf = await checkCashfree(DB, row);
    if (cf.paid) {
      result.foundPaid++;
      continue;
    }

    const col = stage === 1 ? "reminder1_at" : "reminder2_at";
    const claim = await DB.prepare(
      `UPDATE orders SET ${col} = datetime('now') WHERE id = ? AND ${col} IS NULL AND status IN ('pending', 'failed')`,
    )
      .bind(row.id)
      .run();
    if ((claim.meta?.changes ?? 0) === 0) continue;

    const ok = await sendPaymentReminder(toEmailOrder(row), stage, resumeUrl(row, stage === 1 ? "e1" : "e2"), stopUrl(row));
    if (ok) {
      if (stage === 1) result.sent1++;
      else result.sent2++;
    } else {
      // Try again on the next run.
      await DB.prepare(`UPDATE orders SET ${col} = NULL WHERE id = ?`).bind(row.id).run();
    }
  }
  return result;
}

// ---------- admin list ----------

export type RecoveryItem = {
  code: string;
  status: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  items: { name: string; pack: string; qty: number; sub: number }[];
  total: number;
  createdAt: string;
  reminder1At: string | null;
  reminder2At: string | null;
  contactedAt: string | null;
  optedOut: boolean;
  /** What Cashfree saw: null = not checked / not reachable. */
  attempts: CashfreeAttempts | null;
  resumeLink: string;
};

export type RecoveryStats = {
  /** Orders placed from a reminder link in the last 30 days and paid. */
  recovered: { via: string; n: number; amount: number }[];
  emails30d: number;
};

export async function recoveryList(DB: D1Database): Promise<{ items: RecoveryItem[]; stats: RecoveryStats }> {
  const rows = await unpaidOrders(DB, 7, 40);
  // Ask Cashfree about the newest 20 (one API call each; Workers allow 50 per request).
  const checks = await Promise.all(rows.map((r, i) => (i < 20 ? checkCashfree(DB, r) : Promise.resolve({ paid: false, attempts: null }))));
  const items: RecoveryItem[] = [];
  rows.forEach((r, i) => {
    if (checks[i].paid) return;
    let lines: RecoveryItem["items"] = [];
    try {
      lines = JSON.parse(r.items_json);
    } catch {
      lines = [];
    }
    items.push({
      code: r.code,
      status: r.status,
      name: r.name,
      phone: r.phone,
      email: r.email,
      city: r.city,
      state: r.state,
      items: lines.map((l) => ({ name: l.name, pack: l.pack, qty: l.qty, sub: l.sub })),
      total: r.total,
      createdAt: r.created_at,
      reminder1At: r.reminder1_at,
      reminder2At: r.reminder2_at,
      contactedAt: r.contacted_at,
      optedOut: Boolean(r.opted_out),
      attempts: checks[i].attempts,
      resumeLink: resumeUrl(r, "wa"),
    });
  });

  const { results: rec } = await DB.prepare(
    `SELECT COALESCE(recovered_via, '') AS via, COUNT(*) AS n, COALESCE(SUM(total), 0) AS amount
     FROM orders
     WHERE recovered_from IS NOT NULL AND status NOT IN ('pending', 'failed', 'cancelled')
       AND created_at >= datetime('now', '-30 days')
     GROUP BY recovered_via`,
  ).all<{ via: string; n: number; amount: number }>();
  const sent = await DB.prepare(
    `SELECT (SELECT COUNT(*) FROM orders WHERE reminder1_at >= datetime('now', '-30 days'))
          + (SELECT COUNT(*) FROM orders WHERE reminder2_at >= datetime('now', '-30 days')) AS n`,
  ).first<{ n: number }>();

  return { items, stats: { recovered: rec ?? [], emails30d: sent?.n ?? 0 } };
}

// ---------- resume link ----------

export type ResumeData =
  | {
      ok: true;
      code: string;
      cart: Record<string, number>;
      customer: { name: string; phone: string; email: string; address: string; city: string; state: string; pin: string; giftMessage: string };
    }
  | { ok: false; reason: "not_found" | "paid"; orderUrl?: string };

export async function loadResume(DB: D1Database, code: string, token: string): Promise<ResumeData> {
  const row = await DB.prepare("SELECT * FROM orders WHERE code = ?").bind(code).first<OrderRow>();
  if (!row || !token || row.view_token !== token) return { ok: false, reason: "not_found" };
  if (!["pending", "failed"].includes(row.status)) {
    return { ok: false, reason: "paid", orderUrl: `/order/${row.code}?t=${row.view_token}` };
  }
  // Paid in the meantime (with this order or a newer one)?
  const cf = await checkCashfree(DB, row);
  if (cf.paid) return { ok: false, reason: "paid", orderUrl: `/order/${row.code}?t=${row.view_token}` };

  let lines: { id: string; qty: number }[] = [];
  try {
    lines = JSON.parse(row.items_json);
  } catch {
    lines = [];
  }
  const cart: Record<string, number> = {};
  for (const l of lines) if (l && typeof l.id === "string" && Number.isInteger(l.qty)) cart[l.id] = l.qty;
  return {
    ok: true,
    code: row.code,
    cart,
    customer: {
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      pin: row.pin,
      giftMessage: row.gift_message,
    },
  };
}

/** Opt the order's email out of reminder emails. */
export async function stopReminders(DB: D1Database, code: string, token: string) {
  const row = await DB.prepare("SELECT email, view_token FROM orders WHERE code = ?")
    .bind(code)
    .first<Pick<OrderRow, "email" | "view_token">>();
  if (!row || !token || row.view_token !== token) return false;
  await DB.prepare("INSERT OR IGNORE INTO email_optout (email) VALUES (lower(?))").bind(row.email).run();
  return true;
}
