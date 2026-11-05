import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Page } from "../components/shell";
import { getPublicOrder } from "../lib/api/checkout.functions";
import { STATUS_LABEL, rs } from "../lib/store";

export const Route = createFileRoute("/order/$code")({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === "string" ? search.t : "",
  }),
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: ({ params, deps }) => getPublicOrder({ data: { code: params.code, t: deps.t } }),
  head: () => ({
    meta: [{ title: "Order | LADDU.CO" }, { name: "robots", content: "noindex" }],
  }),
  component: OrderPage,
});

function Tick() {
  return (
    <svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#2F7A4B" />
      <path d="M14 24.5l7 7L34.5 17" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OrderPage() {
  const res = Route.useLoaderData();
  const router = useRouter();
  const [checks, setChecks] = useState(0);
  const pending = res.ok && res.order.status === "pending";

  // If the payment is still being confirmed, re-check a few times.
  useEffect(() => {
    if (!pending || checks >= 6) return;
    const t = window.setTimeout(() => {
      setChecks((c) => c + 1);
      void router.invalidate();
    }, 4000);
    return () => window.clearTimeout(t);
  }, [pending, checks, router]);

  if (!res.ok) {
    return (
      <Page>
        <section className="checkout-page">
          <div className="wrap">
            <div className="notice-card">
              <h1>Order nahi mila</h1>
              <p>Yeh link sahi nahi lag raha. Order confirmation email mein diya gaya link kholiye.</p>
              <Link to="/" className="btn-solid">Home par jaayein</Link>
            </div>
          </div>
        </section>
      </Page>
    );
  }

  const o = res.order;

  return (
    <Page>
      <section className="checkout-page">
        <div className="wrap narrow">
          {pending ? (
            <div className="success-head">
              <div className="spinner" aria-hidden="true" />
              <h1>Payment confirm ho raha hai...</h1>
              <p>Bas kuch second. Yeh page apne aap update ho jayega. Agar paisa kat gaya hai toh chinta mat kariye, order confirm ho jayega.</p>
            </div>
          ) : o.status === "cancelled" ? (
            <div className="success-head">
              <h1>Yeh order cancel ho gaya hai</h1>
              <p>Refund 5 se 7 working din mein aapke original payment method mein aa jayega.</p>
            </div>
          ) : (
            <div className="success-head">
              <Tick />
              <h1>Order placed successfully!</h1>
              <p>
                Shukriya {o.name}! Aapka order <b>{o.code}</b> confirm hai. Confirmation email <b>{o.email}</b> par bhej di gayi hai.
              </p>
            </div>
          )}

          <div className="panel order-card">
            <div className="order-meta">
              <div><small>Order number</small><b>{o.code}</b></div>
              <div><small>Status</small><b>{STATUS_LABEL[o.status] ?? o.status}</b></div>
            </div>
            <ul className="order-lines">
              {o.items.map((l) => (
                <li key={l.id}>
                  <span>{l.qty} × {l.name} <small>({l.pack})</small></span>
                  <span>{rs(l.sub)}</span>
                </li>
              ))}
              <li><span>Delivery</span><span>{rs(o.delivery)}</span></li>
              <li className="order-total"><span>Total</span><span>{rs(o.total)}</span></li>
            </ul>
            <div className="order-address">
              <small>Delivery address</small>
              <p>{o.name}<br />{o.address}<br />{o.city}, {o.state} {o.pin}</p>
              {o.giftMessage ? <p><small>Gift message:</small> {o.giftMessage}</p> : null}
            </div>
            {o.awb ? (
              <div className="order-address">
                <small>Shipping</small>
                <p>{o.courier || "Courier"}: {o.awb}{" "}
                  {o.trackingUrl ? <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer">Track karein</a> : null}
                </p>
              </div>
            ) : null}
          </div>

          {!pending && o.status !== "cancelled" ? (
            <ol className="next-steps">
              <li><b>Aaj ya kal:</b> hum aapka order taaza pack karenge.</li>
              <li><b>Dispatch par:</b> tracking number aapke email par aayega.</li>
              <li><b>Delivery ke baad:</b> parcel mein kuch toota mile toh 24 ghante ke andar photo ke saath confirmation email ka reply kariye.</li>
            </ol>
          ) : null}

          <div className="center-actions">
            <Link to="/" className="btn-line">Aur shopping karein</Link>
          </div>
        </div>
      </section>
    </Page>
  );
}
