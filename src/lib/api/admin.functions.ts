import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { emailReady } from "../email.server";
import { maybeSendShipped, trackingUrlFor, type OrderRow } from "../orders.server";
import { activeGateway } from "../gateway.server";
import { safeEqual, secret } from "../secrets.server";

type Fail = { ok: false; code: string; message: string };
const fail = (code: string, message: string): Fail => ({ ok: false, code, message });

function checkPassword(password: string): Fail | null {
  const expected = secret("ADMIN_PASSWORD");
  if (!expected) return fail("admin_off", "ADMIN_PASSWORD abhi set nahi hai. Cloudflare → Worker → Settings → Variables and secrets mein set kariye.");
  if (!safeEqual(password, expected)) return fail("bad_password", "Password galat hai.");
  return null;
}

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ password: z.string().max(200) }))
  .handler(async ({ data }) => {
    const bad = checkPassword(data.password);
    if (bad) return bad;
    return {
      ok: true as const,
      setup: {
        database: Boolean(bindings().DB),
        payments: activeGateway() !== null,
        gateway: activeGateway() ?? "none",
        webhook: activeGateway() === "cashfree" ? true : Boolean(secret("RAZORPAY_WEBHOOK_SECRET")),
        email: emailReady(),
      },
    };
  });

export type AdminOrder = Omit<OrderRow, "view_token" | "items_json"> & {
  items: { name: string; pack: string; qty: number; sub: number }[];
};

export const adminListOrders = createServerFn({ method: "POST" })
  .inputValidator(z.object({ password: z.string().max(200), show: z.enum(["active", "all"]) }))
  .handler(async ({ data }): Promise<{ ok: true; orders: AdminOrder[] } | Fail> => {
    const bad = checkPassword(data.password);
    if (bad) return bad;
    const { DB } = bindings();
    if (!DB) return fail("db_off", "Database abhi ready nahi hai.");
    const sql =
      data.show === "active"
        ? "SELECT * FROM orders WHERE status NOT IN ('pending', 'failed') ORDER BY id DESC LIMIT 300"
        : "SELECT * FROM orders ORDER BY id DESC LIMIT 300";
    const { results } = await DB.prepare(sql).all<OrderRow>();
    const orders = (results ?? []).map((r) => {
      let items: AdminOrder["items"] = [];
      try {
        items = JSON.parse(r.items_json);
      } catch {
        items = [];
      }
      const { view_token: _t, items_json: _j, ...rest } = r;
      return { ...rest, items };
    });
    return { ok: true, orders };
  });

export const adminUpdateOrder = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      password: z.string().max(200),
      code: z.string().max(40),
      status: z.enum(["paid", "packed", "shipped", "delivered", "cancelled"]),
      courier: z.string().trim().max(40),
      awb: z.string().trim().max(60),
      trackingUrl: z.string().trim().max(300),
      note: z.string().trim().max(500),
    }),
  )
  .handler(async ({ data }) => {
    const bad = checkPassword(data.password);
    if (bad) return bad;
    const { DB } = bindings();
    if (!DB) return fail("db_off", "Database abhi ready nahi hai.");
    const tracking = /^https?:\/\//i.test(data.trackingUrl) ? data.trackingUrl : trackingUrlFor(data.courier, data.awb);
    if (data.status === "shipped" && !data.awb) {
      return fail("awb", "Shipped karne ke liye tracking number (AWB) daaliye.");
    }
    await DB.prepare(
      `UPDATE orders SET status = ?, courier = ?, awb = ?, tracking_url = ?, note = ?,
         shipped_at = CASE WHEN ? = 'shipped' AND shipped_at IS NULL THEN datetime('now') ELSE shipped_at END
       WHERE code = ? AND status NOT IN ('pending', 'failed')`,
    )
      .bind(data.status, data.courier, data.awb, tracking, data.note, data.status, data.code)
      .run();
    let shippedEmail = false;
    if (data.status === "shipped") shippedEmail = await maybeSendShipped(DB, data.code);
    return { ok: true as const, shippedEmail };
  });
