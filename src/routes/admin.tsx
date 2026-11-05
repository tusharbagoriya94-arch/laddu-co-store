import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Wordmark } from "../components/shell";
import { adminListOrders, adminLogin, adminUpdateOrder, type AdminOrder } from "../lib/api/admin.functions";
import { STATUS_LABEL, rs } from "../lib/store";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Orders | LADDU.CO" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Admin,
});

const PW_KEY = "ladduco-admin-pw";
type Setup = { database: boolean; payments: boolean; webhook: boolean; email: boolean };

function istTime(sqlUtc: string | null) {
  if (!sqlUtc) return "";
  const d = new Date(sqlUtc.replace(" ", "T") + "Z");
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Admin() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [show, setShow] = useState<"active" | "all">("active");
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (pw: string) => {
    setError("");
    const res = await adminLogin({ data: { password: pw } });
    if (!res.ok) {
      setError(res.message);
      try { window.sessionStorage.removeItem(PW_KEY); } catch { /* ignore */ }
      return false;
    }
    setSetup(res.setup);
    setAuthed(true);
    try { window.sessionStorage.setItem(PW_KEY, pw); } catch { /* ignore */ }
    return true;
  }, []);

  useEffect(() => {
    let saved = "";
    try { saved = window.sessionStorage.getItem(PW_KEY) ?? ""; } catch { /* ignore */ }
    if (saved) {
      setPassword(saved);
      void login(saved);
    }
  }, [login]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminListOrders({ data: { password, show } });
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOrders(res.orders);
  }, [password, show]);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  if (!authed) {
    return (
      <div className="admin-login">
        <form
          className="panel"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void login(password);
          }}
        >
          <Wordmark />
          <h1>Orders</h1>
          <div className="field">
            <label htmlFor="pw">Admin password</label>
            <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="pay-btn">Login</button>
          {error ? <p className="form-message" role="alert">{error}</p> : null}
        </form>
      </div>
    );
  }

  const toPack = orders.filter((o) => o.status === "paid").length;
  const revenue = orders.filter((o) => !["pending", "failed", "cancelled"].includes(o.status)).reduce((s, o) => s + o.total, 0);

  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="wrap admin-bar-inner">
          <a href="/" className="brand"><Wordmark /></a>
          <span className="admin-title">Orders</span>
          <button
            type="button"
            className="btn-line small"
            onClick={() => {
              try { window.sessionStorage.removeItem(PW_KEY); } catch { /* ignore */ }
              setAuthed(false);
              setPassword("");
            }}
          >
            Logout
          </button>
        </div>
      </header>
      <div className="wrap admin-body">
        {setup && (!setup.payments || !setup.email || !setup.webhook || !setup.database) ? (
          <div className="setup-box">
            <b>Setup baaki hai:</b>
            <ul>
              <li className={setup.database ? "ok" : "bad"}>Database {setup.database ? "ready" : "not ready (deploy again)"}</li>
              <li className={setup.payments ? "ok" : "bad"}>Razorpay keys {setup.payments ? "set" : "missing: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET"}</li>
              <li className={setup.webhook ? "ok" : "bad"}>Razorpay webhook {setup.webhook ? "set" : "missing: RAZORPAY_WEBHOOK_SECRET"}</li>
              <li className={setup.email ? "ok" : "bad"}>Order emails {setup.email ? "set" : "missing: BREVO_API_KEY, MAIL_FROM"}</li>
            </ul>
          </div>
        ) : null}

        <div className="admin-stats">
          <div><small>Pack karne hain</small><b>{toPack}</b></div>
          <div><small>Orders dikhaye gaye</small><b>{orders.length}</b></div>
          <div><small>Paid total</small><b>{rs(revenue)}</b></div>
        </div>

        <div className="admin-tools">
          <div className="seg" role="group" aria-label="Filter">
            <button type="button" className={show === "active" ? "on" : ""} onClick={() => setShow("active")}>Paid orders</button>
            <button type="button" className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>Sab (unpaid bhi)</button>
          </div>
          <button type="button" className="btn-line small" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {error ? <p className="form-message" role="alert">{error}</p> : null}
        {orders.length === 0 && !loading ? <p className="muted">Abhi koi order nahi hai.</p> : null}
        <div className="admin-list">
          {orders.map((o) => (
            <OrderCard key={o.code} order={o} password={password} onSaved={load} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, password, onSaved }: { order: AdminOrder; password: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(order.status === "paid");
  const [status, setStatus] = useState(order.status);
  const [courier, setCourier] = useState(order.courier || "Delhivery");
  const [awb, setAwb] = useState(order.awb);
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url);
  const [note, setNote] = useState(order.note);
  const [msg, setMsg] = useState("");
  const editable = !["pending", "failed"].includes(order.status);

  async function save() {
    setMsg("Saving...");
    const res = await adminUpdateOrder({
      data: {
        password,
        code: order.code,
        status: status as "paid" | "packed" | "shipped" | "delivered" | "cancelled",
        courier,
        awb,
        trackingUrl,
        note,
      },
    });
    if (!res.ok) {
      setMsg(res.message);
      return;
    }
    setMsg(res.shippedEmail ? "Saved. Customer ko tracking email bhej di." : "Saved.");
    await onSaved();
  }

  return (
    <article className={`admin-order status-${order.status}`}>
      <button type="button" className="admin-order-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="code">{order.code}</span>
        <span className="who">{order.name}, {order.city}</span>
        <span className="amt">{rs(order.total)}</span>
        <span className={`badge badge-${order.status}`}>{STATUS_LABEL[order.status] ?? order.status}</span>
        <span className="when">{istTime(order.paid_at ?? order.created_at)}</span>
      </button>
      {open ? (
        <div className="admin-order-body">
          <div className="admin-cols">
            <div>
              <small>Items</small>
              <ul>
                {order.items.map((l, i) => (
                  <li key={i}>{l.qty} × {l.name} ({l.pack}) = {rs(l.sub)}</li>
                ))}
                <li>Delivery {rs(order.delivery)}</li>
              </ul>
              {order.gift_message ? <p><small>Gift message:</small> {order.gift_message}</p> : null}
            </div>
            <div>
              <small>Ship to</small>
              <p className="addr">
                {order.name}<br />{order.address}<br />{order.city}, {order.state} {order.pin}<br />
                <a href={`tel:+91${order.phone}`}>{order.phone}</a> · <a href={`mailto:${order.email}`}>{order.email}</a>
              </p>
              <p className="muted small">Razorpay: {order.rzp_payment_id || "no payment yet"}</p>
            </div>
          </div>
          {editable ? (
            <div className="admin-edit">
              <div className="field">
                <label htmlFor={`st-${order.code}`}>Status</label>
                <select id={`st-${order.code}`} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="paid">Paid, to pack</option>
                  <option value="packed">Packed</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`co-${order.code}`}>Courier</label>
                <select id={`co-${order.code}`} value={courier} onChange={(e) => setCourier(e.target.value)}>
                  <option>Delhivery</option>
                  <option>India Post</option>
                  <option>Local delivery</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`awb-${order.code}`}>Tracking no. (AWB)</label>
                <input id={`awb-${order.code}`} value={awb} onChange={(e) => setAwb(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`tu-${order.code}`}>Tracking link (optional)</label>
                <input id={`tu-${order.code}`} value={trackingUrl} placeholder="Delhivery ke liye apne aap" onChange={(e) => setTrackingUrl(e.target.value)} />
              </div>
              <div className="field field-wide">
                <label htmlFor={`nt-${order.code}`}>Note (sirf aapke liye)</label>
                <input id={`nt-${order.code}`} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="admin-save">
                <button type="button" className="pay-btn" onClick={() => void save()}>Save</button>
                <span className="muted small">"Shipped" + tracking no. save karne par customer ko email jayega.</span>
                {msg ? <span className="small">{msg}</span> : null}
              </div>
            </div>
          ) : (
            <p className="muted small">Is order ka payment nahi hua hai, isliye ise pack mat kariye.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}
