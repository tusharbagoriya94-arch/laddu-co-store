import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";

import { Page, ProductArt, QtyStepper } from "../components/shell";
import { confirmPayment, startCheckout } from "../lib/api/checkout.functions";
import { useCart } from "../lib/cart";
import { BUSINESS, RAJASTHAN_ONLY, STATES, isRajasthanPin, normalizePhone, rs } from "../lib/store";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [{ title: "Checkout | LADDU.CO" }, { name: "robots", content: "noindex" }],
    links: [{ rel: "canonical", href: "/checkout" }],
  }),
  component: Checkout,
});

type Form = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  giftMessage: string;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: RAJASTHAN_ONLY ? "Rajasthan" : "",
  pin: "",
  giftMessage: "",
};

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.dataset.razorpay = "1";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (f.name.trim().length < 2) e.name = "Poora naam daaliye";
  if (!/^[6-9]\d{9}$/.test(normalizePhone(f.phone))) e.phone = "10 ankon ka mobile number";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Sahi email daaliye (confirmation isi par aayega)";
  if (f.address.trim().length < 8) e.address = "Ghar no., gali, mohalla aur landmark";
  if (f.city.trim().length < 2) e.city = "Shahar ya gaon";
  if (!f.state) e.state = "Rajya chuniye";
  if (!/^\d{6}$/.test(f.pin.trim())) e.pin = "6 ankon ka PIN code";
  else if (RAJASTHAN_ONLY && !isRajasthanPin(f.pin.trim())) e.pin = "Abhi delivery sirf Rajasthan ke PIN code par";
  return e;
}

function Field({
  id,
  label,
  error,
  children,
  wide = false,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "field field-wide" : "field"}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="field-error" id={`${id}-err`}>{error}</span> : null}
    </div>
  );
}

function Checkout() {
  const { cart, ready, priced, setQty, clear } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const set = (k: keyof Form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setMessage("");
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) {
      setMessage("Kripya laal rang wale fields theek kariye.");
      return;
    }
    if (!agree) {
      setMessage("Aage badhne ke liye terms aur refund policy maaniye.");
      return;
    }
    if (priced.itemsTotal <= 0) {
      setMessage("Cart khaali hai.");
      return;
    }
    setBusy(true);
    try {
      const res = await startCheckout({
        data: {
          cart: cart as Record<string, number>,
          customer: {
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            address: form.address.trim(),
            city: form.city.trim(),
            state: form.state,
            pin: form.pin.trim(),
            giftMessage: form.giftMessage.trim(),
          },
        },
      });
      if (!res.ok) {
        setMessage(res.message);
        setBusy(false);
        return;
      }
      const loaded = await loadRazorpay();
      if (!loaded || !window.Razorpay) {
        setMessage("Payment page load nahi hua. Internet check karke dobara try kariye.");
        setBusy(false);
        return;
      }
      const rzp = new window.Razorpay({
        key: res.keyId,
        amount: res.amount,
        currency: "INR",
        name: "LADDU.CO",
        description: `Order ${res.code}`,
        image: `${window.location.origin}/assets/logo.webp`,
        order_id: res.rzpOrderId,
        prefill: res.prefill,
        notes: { order_code: res.code },
        theme: { color: "#6F262D" },
        handler: async (r: RazorpayResponse) => {
          setMessage("Payment confirm ho raha hai...");
          try {
            const c = await confirmPayment({
              data: {
                code: res.code,
                token: res.token,
                rzpOrderId: r.razorpay_order_id,
                paymentId: r.razorpay_payment_id,
                signature: r.razorpay_signature,
                origin: window.location.origin,
              },
            });
            if (!c.ok) setMessage(`${c.message} Order number: ${res.code}`);
          } catch {
            // the webhook will still confirm the order
          }
          clear();
          void navigate({ to: "/order/$code", params: { code: res.code }, search: { t: res.token } });
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setMessage("Payment poora nahi hua. Jab chahein dobara \"Pay\" dabaiye.");
          },
        },
      });
      rzp.on("payment.failed", (resp) => {
        setMessage(`Payment fail ho gaya${resp.error?.description ? `: ${resp.error.description}` : ""}. Dobara try kariye.`);
      });
      rzp.open();
    } catch (error) {
      console.error(error);
      setMessage("Kuch gadbad ho gayi. Dobara try kariye.");
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <Page cartBar={false}>
        <section className="checkout-page"><div className="wrap"><p className="muted">Loading...</p></div></section>
      </Page>
    );
  }

  if (priced.lines.length === 0) {
    return (
      <Page cartBar={false}>
        <section className="checkout-page">
          <div className="wrap">
            <div className="notice-card">
              <h1>Aapka cart khaali hai</h1>
              <p>Laddu, mathri ya gift box chuniye aur yahan wapas aaiye.</p>
              <a href="/#products" className="btn-solid">Products dekhiye</a>
            </div>
          </div>
        </section>
      </Page>
    );
  }

  const err = (k: keyof Form) => errors[k];

  return (
    <Page cartBar={false}>
      <section className="checkout-page">
        <div className="wrap">
          <Link to="/" className="back-link">← Shopping jaari rakhein</Link>
          <h1 className="checkout-title">Checkout</h1>
          <form className="checkout-grid" onSubmit={onSubmit} noValidate>
            <div className="panel">
              <h2>Delivery ki jaankari</h2>
              <p className="muted small">Parcel isi pate par aayega. Gift bhej rahe hain? Jisko bhejna hai unka naam aur pata bhariye.</p>
              <div className="fields">
                <Field id="f-name" label="Poora naam" error={err("name")} wide>
                  <input id="f-name" autoComplete="name" value={form.name} onChange={(e) => set("name")(e.target.value)} aria-invalid={!!err("name")} />
                </Field>
                <Field id="f-phone" label="Mobile number" error={err("phone")}>
                  <input id="f-phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="98765 43210" value={form.phone} onChange={(e) => set("phone")(e.target.value)} aria-invalid={!!err("phone")} />
                </Field>
                <Field id="f-email" label="Email" error={err("email")}>
                  <input id="f-email" type="email" autoComplete="email" placeholder="aap@example.com" value={form.email} onChange={(e) => set("email")(e.target.value)} aria-invalid={!!err("email")} />
                </Field>
                <Field id="f-address" label="Pata (ghar no., gali, mohalla, landmark)" error={err("address")} wide>
                  <textarea id="f-address" autoComplete="street-address" rows={3} value={form.address} onChange={(e) => set("address")(e.target.value)} aria-invalid={!!err("address")} />
                </Field>
                <Field id="f-city" label="Shahar / gaon" error={err("city")}>
                  <input id="f-city" autoComplete="address-level2" value={form.city} onChange={(e) => set("city")(e.target.value)} aria-invalid={!!err("city")} />
                </Field>
                <Field id="f-pin" label="PIN code" error={err("pin")}>
                  <input id="f-pin" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={form.pin} onChange={(e) => set("pin")(e.target.value.replace(/\D/g, ""))} aria-invalid={!!err("pin")} />
                </Field>
                <Field id="f-state" label="Rajya" error={err("state")} wide>
                  <select id="f-state" autoComplete="address-level1" value={form.state} disabled={RAJASTHAN_ONLY} onChange={(e) => set("state")(e.target.value)}>
                    <option value="">Chuniye</option>
                    {STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field id="f-gift" label="Gift message (optional)" wide>
                  <input id="f-gift" maxLength={200} placeholder="Jaise: Diwali ki shubhkaamnayein, Priya ki taraf se" value={form.giftMessage} onChange={(e) => set("giftMessage")(e.target.value)} />
                </Field>
              </div>
              {RAJASTHAN_ONLY ? (
                <p className="area-note">Abhi online delivery sirf Rajasthan mein ho rahi hai. Jaldi hi poore India mein shuru karenge.</p>
              ) : null}
            </div>

            <aside className="panel summary">
              <h2>Aapka order</h2>
              <ul className="summary-lines">
                {priced.lines.map((l) => (
                  <li key={l.id}>
                    <div className="summary-thumb"><ProductArt id={l.id} /></div>
                    <div className="summary-info">
                      <b>{l.name}</b>
                      <small>{l.pack} · {rs(l.price)}</small>
                      <QtyStepper value={l.qty} onChange={(v) => setQty(l.id, v)} label={l.name} />
                    </div>
                    <span className="summary-sub">{rs(l.sub)}</span>
                  </li>
                ))}
              </ul>
              <div className="summary-row"><span>Products</span><span>{rs(priced.itemsTotal)}</span></div>
              <div className="summary-row"><span>Delivery</span><span>{rs(priced.delivery)}</span></div>
              <div className="summary-total"><span>Total</span><strong>{rs(priced.total)}</strong></div>

              <label className="agree">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>
                  Main <Link to="/policies" hash="terms" target="_blank">terms</Link> aur{" "}
                  <Link to="/policies" hash="refund" target="_blank">refund policy</Link> maanta/maanti hoon.
                </span>
              </label>

              <button type="submit" className="pay-btn" disabled={busy}>
                {busy ? "Please wait..." : `Pay ${rs(priced.total)}`}
              </button>
              {message ? <p className="form-message" role="alert">{message}</p> : null}
              <p className="secure-note">
                Payment Razorpay ke surakshit page par: UPI, card, netbanking ya wallet. Payment ke baad turant order confirmation milega.
              </p>
              <p className="secure-note">{BUSINESS.legalName} · FSSAI {BUSINESS.fssai}</p>
            </aside>
          </form>
        </div>
      </section>
    </Page>
  );
}
