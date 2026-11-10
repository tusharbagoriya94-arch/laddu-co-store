import { BUSINESS, INDEPENDENT_LINE, rs, type PricedLine } from "./store";
import { ownerEmail, secret } from "./secrets.server";

// Transactional email through Brevo (brevo.com). Needs BREVO_API_KEY and a
// verified sender address in MAIL_FROM. If either is missing, emails are
// skipped and the order still goes through.

export function emailReady() {
  return Boolean(secret("BREVO_API_KEY") && (secret("MAIL_FROM") || ownerEmail()));
}

export type OrderForEmail = {
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  gift_message: string;
  items: PricedLine[];
  items_total: number;
  delivery: number;
  total: number;
  rzp_payment_id?: string | null;
  courier?: string;
  awb?: string;
  tracking_url?: string;
};

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function send(to: { email: string; name?: string }, subject: string, html: string, replyTo?: string) {
  const apiKey = secret("BREVO_API_KEY");
  const from = secret("MAIL_FROM") || ownerEmail();
  if (!apiKey || !from) {
    console.warn("Email skipped: BREVO_API_KEY or MAIL_FROM not set");
    return false;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { name: BUSINESS.brand, email: from },
        to: [to],
        subject,
        htmlContent: html,
        ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      }),
    });
    if (!res.ok) {
      console.error("Brevo send failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return false;
    }
    return true;
  } catch (error) {
    console.error("Brevo send error", error);
    return false;
  }
}

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#FDF6E6;font-family:Arial,Helvetica,sans-serif;color:#2A1310">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF6E6;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFBF3;border:1px solid #EAD9C8;border-radius:10px">
<tr><td style="background:#6F262D;color:#FDF6E6;padding:18px 24px;border-radius:10px 10px 0 0;font-size:22px;font-family:Georgia,serif">LADDU.CO</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:normal;color:#6F262D;font-size:24px">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #EAD9C8;font-size:12px;color:#6E544A">
${esc(BUSINESS.legalName)} · FSSAI Reg. No. ${BUSINESS.fssai}<br>${esc(INDEPENDENT_LINE)}
</td></tr></table></td></tr></table></body></html>`;
}

function itemsTable(o: OrderForEmail) {
  const rows = o.items
    .map(
      (l) =>
        `<tr><td style="padding:6px 0">${l.qty} × ${esc(l.name)} <span style="color:#6E544A">(${esc(l.pack)})</span></td><td align="right" style="padding:6px 0">${rs(l.sub)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;border-top:1px solid #EAD9C8;border-bottom:1px solid #EAD9C8;margin:12px 0">
${rows}
<tr><td style="padding:6px 0;color:#6E544A">Delivery</td><td align="right" style="padding:6px 0">${o.delivery === 0 ? "Free" : rs(o.delivery)}</td></tr>
<tr><td style="padding:8px 0;font-weight:bold">Total paid</td><td align="right" style="padding:8px 0;font-weight:bold">${rs(o.total)}</td></tr>
</table>`;
}

function addressBlock(o: OrderForEmail) {
  return `<p style="margin:0;font-size:15px;line-height:1.5"><b>${esc(o.name)}</b><br>${esc(o.address)}<br>${esc(o.city)}, ${esc(o.state)} ${esc(o.pin)}<br>Phone: ${esc(o.phone)}</p>`;
}

export async function sendOrderEmails(o: OrderForEmail, siteOrigin: string) {
  const customerHtml = shell(
    "Aapka order place ho gaya!",
    `<p style="font-size:15px;line-height:1.6;margin:0 0 8px">Namaste ${esc(o.name)}, shukriya! Aapka payment mil gaya hai aur order <b>${esc(o.code)}</b> confirm hai.</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 8px">Hum aapke laddu aur mathri taaze bana kar 1 se 2 working din mein pack karke bhej denge. Dispatch hote hi tracking number isi email par aayega.</p>
${itemsTable(o)}
<p style="font-size:13px;color:#6E544A;margin:12px 0 4px">Delivery address</p>
${addressBlock(o)}
${o.gift_message ? `<p style="font-size:14px;margin:12px 0 0"><b>Gift message:</b> ${esc(o.gift_message)}</p>` : ""}
${siteOrigin ? `<p style="font-size:14px;margin:16px 0 0"><a href="${esc(siteOrigin)}" style="color:#6F262D">${esc(siteOrigin.replace(/^https?:\/\//, ""))}</a></p>` : ""}`,
  );

  const ownerHtml = shell(
    `Naya order ${o.code}: ${rs(o.total)}`,
    `<p style="font-size:15px;margin:0 0 8px">Payment received${o.rzp_payment_id ? ` (Razorpay ${esc(o.rzp_payment_id)})` : ""}.</p>
${itemsTable(o)}
<p style="font-size:13px;color:#6E544A;margin:12px 0 4px">Ship to</p>
${addressBlock(o)}
<p style="font-size:14px;margin:8px 0 0">Email: ${esc(o.email)}</p>
${o.gift_message ? `<p style="font-size:14px;margin:8px 0 0"><b>Gift message:</b> ${esc(o.gift_message)}</p>` : ""}
${siteOrigin ? `<p style="font-size:14px;margin:16px 0 0"><a href="${esc(siteOrigin)}/admin" style="color:#6F262D">Open orders page</a></p>` : ""}`,
  );

  const [customer, owner] = await Promise.all([
    send({ email: o.email, name: o.name }, `Order placed: ${o.code} | LADDU.CO`, customerHtml, BUSINESS.email),
    send({ email: ownerEmail(), name: "LADDU.CO orders" }, `Naya order ${o.code} · ${rs(o.total)} · ${o.name}, ${o.city}`, ownerHtml, o.email),
  ]);
  return { customer, owner };
}

export async function sendShippedEmail(o: OrderForEmail) {
  const tracking = o.tracking_url
    ? `<p style="font-size:15px;margin:12px 0"><a href="${esc(o.tracking_url)}" style="display:inline-block;background:#6F262D;color:#FDF6E6;padding:10px 18px;border-radius:6px;text-decoration:none">Track your parcel</a></p>`
    : "";
  const html = shell(
    "Aapka order nikal gaya hai!",
    `<p style="font-size:15px;line-height:1.6;margin:0 0 8px">Namaste ${esc(o.name)}, aapka order <b>${esc(o.code)}</b> pack karke bhej diya gaya hai.</p>
<p style="font-size:15px;line-height:1.6;margin:0">Courier: <b>${esc(o.courier || "Courier")}</b><br>Tracking number: <b>${esc(o.awb || "-")}</b></p>
${tracking}
<p style="font-size:14px;line-height:1.6;color:#6E544A;margin:12px 0 0">Parcel mein kuch toota ya galat mile toh delivery ke 24 ghante ke andar photo ke saath is email ka reply kariye.</p>`,
  );
  return send({ email: o.email, name: o.name }, `Shipped: ${o.code} | LADDU.CO`, html, BUSINESS.email);
}
