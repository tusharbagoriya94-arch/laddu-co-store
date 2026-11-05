import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../../lib/bindings.server";
import { markPaid } from "../../lib/orders.server";
import { verifyWebhookSignature } from "../../lib/razorpay.server";

// Razorpay webhook (events: payment.captured, order.paid). It confirms orders
// even if the customer closes the browser right after paying.
export const Route = createFileRoute("/api/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        if (!(await verifyWebhookSignature(raw, signature))) {
          return Response.json({ ok: false }, { status: 401 });
        }
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false }, { status: 503 });

        let event: {
          event?: string;
          payload?: {
            payment?: { entity?: { id?: string; order_id?: string } };
            order?: { entity?: { id?: string } };
          };
        };
        try {
          event = JSON.parse(raw);
        } catch {
          return Response.json({ ok: false }, { status: 400 });
        }

        if (event.event === "payment.captured" || event.event === "order.paid") {
          const payment = event.payload?.payment?.entity;
          const orderId = payment?.order_id ?? event.payload?.order?.entity?.id;
          if (orderId && payment?.id) {
            await markPaid(DB, orderId, payment.id, new URL(request.url).origin);
          }
        } else if (event.event === "payment.failed") {
          const orderId = event.payload?.payment?.entity?.order_id;
          if (orderId) {
            await DB.prepare("UPDATE orders SET note = 'payment attempt failed' WHERE rzp_order_id = ? AND status = 'pending'")
              .bind(orderId)
              .run();
          }
        }
        return Response.json({ ok: true });
      },
    },
  },
});
