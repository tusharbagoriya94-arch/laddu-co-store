import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Wordmark } from "../components/shell";
import {
  adminListOrders,
  adminLogin,
  adminMarkContacted,
  adminRecovery,
  adminUpdateOrder,
  type AdminOrder,
  type RecoveryItem,
  type RecoveryStats,
} from "../lib/api/admin.functions";
import { STATUS_LABEL, rs } from "../lib/store";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Orders | LADDU.CO" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Admin,
});

const PW_KEY = "ladduco-admin-pw";
type Setup = { database: boolean; payments: boolean; gateway: string; webhook: boolean; email: boolean };

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
  const [show, setShow] = useState<"active" | "all" | "recover">("active");
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
    if (show === "recover") return;
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
              <li className={setup.payments ? "ok" : "bad"}>Payment gateway {setup.payments ? `active: ${setup.gateway}` : "missing: CASHFREE_APP_ID, CASHFREE_SECRET_KEY"}</li>
              <li className={setup.webhook ? "ok" : "bad"}>Payment webhook {setup.webhook ? "set" : "missing: RAZORPAY_WEBHOOK_SECRET"}</li>
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
            <button type="button" className={show === "recover" ? "on" : ""} onClick={() => setShow("recover")}>Payment adhoore</button>
          </div>
          {show !== "recover" ? (
            <button type="button" className="btn-line small" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          ) : null}
        </div>
        {error ? <p className="form-message" role="alert">{error}</p> : null}
        {show === "recover" ? (
          <RecoveryView password={password} />
        ) : (
          <>
            {orders.length === 0 && !loading ? <p className="muted">Abhi koi order nahi hai.</p> : null}
            <div className="admin-list">
              {orders.map((o) => (
                <OrderCard key={o.code} order={o} password={password} onSaved={load} />
              ))}
            </div>
          </>
        )}
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
              <p className="muted small">Payment ID: {order.rzp_payment_id || "no payment yet"}</p>
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

// ---------- Payment adhoore (recovery) ----------

function whyText(r: RecoveryItem) {
  if (r.status === "failed") return "Payment page khul hi nahi paya (store ya Cashfree ki galti).";
  const a = r.attempts;
  if (!a) return "Cashfree se pata nahi chal paya.";
  if (a.attempts === 0) return "Payment page par koi try nahi kiya, page chhod diya.";
  const method = a.lastMethod ? ` (${a.lastMethod.replace(/_/g, " ")})` : "";
  if (a.lastStatus === "USER_DROPPED") return `Payment shuru kiya${method}, beech mein chhod diya.`;
  if (a.lastStatus === "PENDING") return `Payment pending${method}: bank se confirm hona baaki ho sakta hai. Message se pehle Cashfree check kariye.`;
  if (a.lastStatus === "FAILED") return `Payment try kiya, fail hua${method}${a.lastError ? `: ${a.lastError}` : ""}.`;
  return `Last attempt: ${a.lastStatus}${method}.`;
}

function paymentFailed(r: RecoveryItem) {
  return r.status === "failed" || ((r.attempts?.attempts ?? 0) > 0 && r.attempts?.lastStatus === "FAILED");
}

function waMessage(r: RecoveryItem) {
  const first = r.name.trim().split(/\s+/)[0] || r.name;
  const items = r.items.map((l) => `${l.qty} × ${l.name}`).join(", ");
  const help = paymentFailed(r)
    ? "Lagta hai payment ke time koi dikkat aa gayi thi. Dobara try kar sakte hain, UPI ke alawa card ya netbanking se bhi ho jaata hai."
    : "Koi dikkat aayi kya? Batayiye, hum madad kar denge.";
  return `Namaste ${first} ji 🙏
LADDU.CO se bol rahe hain. Aapne Seth ji ke laddu aur mathri ka order${items ? ` (${items})` : ""} shuru kiya tha, par payment poora nahi hua.
${help}

Yahan se wahi order seedha pay kar sakte hain, aapka pata pehle se bhara hai:
${r.resumeLink}`;
}

function RecoveryView({ password }: { password: string }) {
  const [items, setItems] = useState<RecoveryItem[]>([]);
  const [stats, setStats] = useState<RecoveryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await adminRecovery({ data: { password } });
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setItems(res.items);
    setStats(res.stats);
  }, [password]);

  useEffect(() => {
    void load();
  }, [load]);

  const recoveredN = stats?.recovered.reduce((s, r) => s + r.n, 0) ?? 0;
  const recoveredAmt = stats?.recovered.reduce((s, r) => s + r.amount, 0) ?? 0;
  const open = items.filter((i) => !i.contactedAt).length;

  return (
    <>
      <div className="admin-stats">
        <div><small>Abhi follow-up baaki</small><b>{open}</b></div>
        <div><small>Reminder emails (30 din)</small><b>{stats?.emails30d ?? 0}</b></div>
        <div><small>Wapas aaye orders (30 din)</small><b>{recoveredN} · {rs(recoveredAmt)}</b></div>
      </div>
      <p className="recover-help">
        Pichle 7 din ke woh customers jinhone checkout bhara par payment nahi kiya (jo baad mein pay kar chuke, woh yahan nahi dikhte).
        Website inhe apne aap 1 ghante aur 24 ghante baad email bhejti hai. WhatsApp button dabane par message taiyaar milega: apne
        phone se ek-ek karke bhejiye, ek saath bulk mein nahi.
      </p>
      <div className="admin-tools">
        <span className="muted small">{loading ? "Cashfree se check ho raha hai..." : `${items.length} customers`}</span>
        <button type="button" className="btn-line small" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      {error ? <p className="form-message" role="alert">{error}</p> : null}
      {!loading && items.length === 0 ? <p className="muted">Koi adhoora payment nahi hai.</p> : null}
      <div className="admin-list">
        {items.map((r) => (
          <RecoveryCard key={r.code} item={r} password={password} onChange={load} />
        ))}
      </div>
    </>
  );
}

function RecoveryCard({ item: r, password, onChange }: { item: RecoveryItem; password: string; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const wa = `https://wa.me/91${r.phone}?text=${encodeURIComponent(waMessage(r))}`;
  const emails = r.optedOut
    ? "Customer ne reminder band kar diye"
    : r.reminder2At
      ? `2 email gaye (${istTime(r.reminder1At)}, ${istTime(r.reminder2At)})`
      : r.reminder1At
        ? `1 email gaya (${istTime(r.reminder1At)}), doosra 24 ghante par`
        : Date.now() - new Date(r.createdAt.replace(" ", "T") + "Z").getTime() > 72 * 3600 * 1000
          ? "Email nahi gaya (3 din se purana order)"
          : "Pehla email 1 ghante par jayega";

  async function toggle(contacted: boolean) {
    setBusy(true);
    await adminMarkContacted({ data: { password, code: r.code, contacted } });
    setBusy(false);
    await onChange();
  }

  return (
    <article className={r.contactedAt ? "recover-card done" : "recover-card"}>
      <div className="recover-top">
        <b>{r.name}</b>
        <span>{r.city}, {r.state}</span>
        <span className="muted small">{r.code} · {istTime(r.createdAt)}</span>
        <span className="amt">{rs(r.total)}</span>
      </div>
      <div className="recover-meta">
        <span>{r.items.map((l) => `${l.qty} × ${l.name}`).join(", ")}</span>
        <span>📞 {r.phone}</span>
        <span>✉️ {r.email}</span>
      </div>
      <div className="recover-why"><b>Kya hua:</b> {whyText(r)}</div>
      <div className="recover-meta"><span>Email: {emails}</span>{r.contactedAt ? <span>Contact kiya: {istTime(r.contactedAt)}</span> : null}</div>
      <div className="recover-actions">
        <a className="btn-wa" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp message</a>
        <a className="btn-line small" href={`tel:+91${r.phone}`}>Call</a>
        {r.contactedAt ? (
          <button type="button" className="btn-line small" disabled={busy} onClick={() => void toggle(false)}>Undo</button>
        ) : (
          <button type="button" className="btn-line small" disabled={busy} onClick={() => void toggle(true)}>Contact ho gaya ✓</button>
        )}
      </div>
    </article>
  );
}
