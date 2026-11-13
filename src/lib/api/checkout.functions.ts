import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { cashfreeMode, cashfreePaidPaymentId, cashfreeReady, createCashfreeOrder } from "../cashfree.server";
import { activeGateway } from "../gateway.server";
import { insertOrder, markPaid, type OrderRow } from "../orders.server";
import { createRazorpayOrder, verifyPaymentSignature } from "../razorpay.server";
import { secret } from "../secrets.server";
import {
  MAX_QTY,
  RAJASTHAN_ONLY,
  STATES,
  isRajasthanPin,
  normalizePhone,
  priceCart,
  sanitizeCart,
  type PricedLine,
} from "../store";

const SITE_ORIGIN = "https://ladduco.in";

type Fail = { ok: false; code: string; message: string };
const fail = (code: string, message: string): Fail => ({ ok: false, code, message });

function cleanOrigin(origin: string) {
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) ? origin : "";
}

const customerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(10).max(16),
  email: z.string().trim().max(120),
  address: z.string().trim().min(8).max(300),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pin: z.string().trim().min(6).max(6),
  giftMessage: z.string().trim().max(200).optional(),
});

const startSchema = z.object({
  cart: z.record(z.string(), z.number().int().min(0).max(MAX_QTY)),
  customer: customerSchema,
  origin: z.string().max(200).optional(),
});

export const startCheckout = createServerFn({ method: "POST" })
  .inputValidator(startSchema)
  .handler(async ({ data }) => {
    const { DB } = bindings();
    if (!DB) return fail("db_off", "Store abhi setup ho raha hai. Thodi der baad try kariye.");

    const cart = sanitizeCart(data.cart);
    const priced = priceCart(cart);
    if (priced.itemsTotal <= 0) return fail("empty", "Cart khaali hai. Pehle koi product chuniye.");

    const c = data.customer;
    const phone = normalizePhone(c.phone);
    if (!/^[6-9]\d{9}$/.test(phone)) return fail("phone", "Sahi 10 ankon ka mobile number daaliye.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return fail("email", "Sahi email address daaliye.");
    if (!/^\d{6}$/.test(c.pin)) return fail("pin", "Sahi 6 ankon ka PIN code daaliye.");
    if (!STATES.includes(c.state)) return fail("state", "Rajya chuniye.");
    if (RAJASTHAN_ONLY && (!isRajasthanPin(c.pin) || c.state !== "Rajasthan")) {
      return fail("area", "Abhi online delivery sirf Rajasthan mein ho rahi hai. Jaldi hi poore India mein shuru karenge.");
    }
    const gateway = activeGateway();
    if (!gateway) {
      return fail("payments_off", "Online payment abhi setup ho raha hai. Kripya thodi der baad try kariye.");
    }

    const { code, token } = await insertOrder(DB, {
      items: priced.lines,
      items_total: priced.itemsTotal,
      delivery: priced.delivery,
      total: priced.total,
      name: c.name,
      phone,
      email: c.email.toLowerCase(),
      address: c.address,
      city: c.city,
      state: c.state,
      pin: c.pin,
      gift_message: c.giftMessage ?? "",
    });

    if (gateway === "cashfree") {
      const origin = cleanOrigin(data.origin ?? "");
      let sessionId: string;
      try {
        sessionId = await createCashfreeOrder({
          code,
          amountRupees: priced.total,
          customer: { name: c.name, email: c.email.toLowerCase(), phone },
          returnUrl: origin ? `${origin}/order/${code}?t=${token}` : "",
          notifyUrl: origin.startsWith("https://") ? `${origin}/api/cashfree-webhook` : "",
        });
      } catch (error) {
        console.error(error);
        await DB.prepare("UPDATE orders SET status = 'failed', note = 'cashfree order create failed' WHERE code = ?")
          .bind(code)
          .run();
        return fail("cf", "Payment shuru nahi ho paya. Kripya dobara try kariye.");
      }
      // For Cashfree the gateway order id is our own order code.
      await DB.prepare("UPDATE orders SET rzp_order_id = ? WHERE code = ?").bind(code, code).run();
      return {
        ok: true as const,
        gateway: "cashfree" as const,
        code,
        token,
        sessionId,
        mode: cashfreeMode(),
      };
    }

    let rzpOrderId: string;
    try {
      rzpOrderId = await createRazorpayOrder(priced.total * 100, code);
    } catch (error) {
      console.error(error);
      await DB.prepare("UPDATE orders SET status = 'failed', note = 'razorpay order create failed' WHERE code = ?")
        .bind(code)
        .run();
      return fail("rzp", "Payment shuru nahi ho paya. Kripya dobara try kariye.");
    }
    await DB.prepare("UPDATE orders SET rzp_order_id = ? WHERE code = ?").bind(rzpOrderId, code).run();

    return {
      ok: true as const,
      gateway: "razorpay" as const,
      code,
      token,
      rzpOrderId,
      keyId: secret("RAZORPAY_KEY_ID"),
      amount: priced.total * 100,
      prefill: { name: c.name, email: c.email, contact: phone },
    };
  });

export const confirmPayment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string().max(40),
      token: z.string().max(64),
      rzpOrderId: z.string().max(64),
      paymentId: z.string().max(64),
      signature: z.string().max(200),
      origin: z.string().max(200),
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = bindings();
    if (!DB) return fail("db_off", "Store setup pending.");
    const row = await DB.prepare("SELECT code, view_token, rzp_order_id FROM orders WHERE code = ?")
      .bind(data.code)
      .first<Pick<OrderRow, "code" | "view_token" | "rzp_order_id">>();
    if (!row || row.view_token !== data.token || row.rzp_order_id !== data.rzpOrderId) {
      return fail("not_found", "Order nahi mila.");
    }
    const valid = await verifyPaymentSignature(data.rzpOrderId, data.paymentId, data.signature);
    if (!valid) return fail("signature", "Payment verify nahi ho paya. Agar paisa kat gaya hai toh chinta mat kariye, hum check karke confirm karenge.");
    await markPaid(DB, data.rzpOrderId, data.paymentId, cleanOrigin(data.origin));
    return { ok: true as const, code: row.code };
  });

export type PublicOrder = {
  code: string;
  status: string;
  items: PricedLine[];
  itemsTotal: number;
  delivery: number;
  total: number;
  name: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  giftMessage: string;
  courier: string;
  awb: string;
  trackingUrl: string;
  createdAt: string;
  /** True when the customer came back from the payment page without paying. */
  unpaid: boolean;
};

export const getPublicOrder = createServerFn({ method: "GET" })
  .inputValidator(z.object({ code: z.string().max(40), t: z.string().max(64) }))
  .handler(async ({ data }): Promise<{ ok: true; order: PublicOrder } | Fail> => {
    const { DB } = bindings();
    if (!DB || !data.t) return fail("not_found", "Order nahi mila.");
    let row = await DB.prepare("SELECT * FROM orders WHERE code = ?").bind(data.code).first<OrderRow>();
    if (!row || row.view_token !== data.t) return fail("not_found", "Order nahi mila.");

    // Cashfree sends the customer back to this page; confirm the payment with Cashfree here.
    let unpaid = false;
    if (row.status === "pending" && row.rzp_order_id === row.code && cashfreeReady()) {
      try {
        const paymentId = await cashfreePaidPaymentId(row.code, row.total);
        if (paymentId) {
          row = (await markPaid(DB, row.code, paymentId, SITE_ORIGIN)) ?? row;
        } else {
          unpaid = true;
        }
      } catch (error) {
        console.error(error);
      }
    }
    let items: PricedLine[] = [];
    try {
      items = JSON.parse(row.items_json) as PricedLine[];
    } catch {
      items = [];
    }
    return {
      ok: true,
      order: {
        code: row.code,
        status: row.status,
        items,
        itemsTotal: row.items_total,
        delivery: row.delivery,
        total: row.total,
        name: row.name,
        email: row.email,
        address: row.address,
        city: row.city,
        state: row.state,
        pin: row.pin,
        giftMessage: row.gift_message,
        courier: row.courier,
        awb: row.awb,
        trackingUrl: row.tracking_url,
        createdAt: row.created_at,
        unpaid,
      },
    };
  });
