import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../../lib/bindings.server";
import { cashfreePaidPaymentId, verifyCashfreeWebhook } from "../../lib/cashfree.server";
import { markPaid, type OrderRow } from "../../lib/orders.server";

// Cashfree webhook. It confirms orders even if the customer closes the browser right after paying.
export const Route = createFileRoute("/api/cashfree-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const timestamp = request.headers.get("x-webhook-timestamp") ?? "";
        const signature = request.headers.get("x-webhook-signature") ?? "";
        if (!(await verifyCashfreeWebhook(timestamp, raw, signature))) {
          return Response.json({ ok: false }, { status: 401 });
        }
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false }, { status: 503 });

        let event: {
          type?: string;
          data?: { order?: { order_id?: string }; payment?: { payment_status?: string } };
        };
        try {
          event = JSON.parse(raw);
        } catch {
          return Response.json({ ok: false }, { status: 400 });
        }

        const code = event.data?.order?.order_id;
        if (!code) return Response.json({ ok: true });

        if (event.type === "PAYMENT_SUCCESS_WEBHOOK" || event.data?.payment?.payment_status === "SUCCESS") {
          const row = await DB.prepare("SELECT total FROM orders WHERE code = ? AND rzp_order_id = ?")
            .bind(code, code)
            .first<Pick<OrderRow, "total">>();
          if (row) {
            // Re-check with Cashfree's API rather than trusting the webhook body alone.
            const paymentId = await cashfreePaidPaymentId(code, row.total);
            if (paymentId) await markPaid(DB, code, paymentId, new URL(request.url).origin);
          }
        } else if (event.type === "PAYMENT_FAILED_WEBHOOK") {
          await DB.prepare("UPDATE orders SET note = 'payment attempt failed' WHERE rzp_order_id = ? AND status = 'pending'")
            .bind(code)
            .run();
        }
        return Response.json({ ok: true });
      },
    },
  },
});
