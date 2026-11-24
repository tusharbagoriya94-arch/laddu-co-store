import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../../lib/bindings.server";
import { stopReminders } from "../../lib/recovery.server";

// "Reminder nahi chahiye?" link in the payment-reminder emails.
// GET shows a confirm button (so email link scanners can't opt people out by prefetching);
// POST records the opt-out.
function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | LADDU.CO</title>
<style>body{margin:0;background:#FDF6E6;font-family:Arial,Helvetica,sans-serif;color:#2A1310;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}
.c{background:#FFFBF3;border:1px solid #EAD9C8;border-radius:10px;max-width:440px;padding:28px;text-align:center}
h1{font-family:Georgia,serif;font-weight:normal;color:#6F262D;font-size:24px;margin:0 0 12px}p{line-height:1.6}
button{background:#6F262D;color:#FDF6E6;border:0;border-radius:6px;padding:12px 22px;font-size:16px;cursor:pointer}a{color:#6F262D}</style></head>
<body><div class="c"><h1>${title}</h1>${body}</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function clean(v: string | null, max: number) {
  return (v ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, max);
}

export const Route = createFileRoute("/api/stop-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const c = clean(url.searchParams.get("c"), 40);
        const t = clean(url.searchParams.get("t"), 64);
        return page(
          "Reminder band karein?",
          `<p>Is order ke payment reminder emails ab nahi aayenge.</p>
<form method="post"><input type="hidden" name="c" value="${c}"><input type="hidden" name="t" value="${t}"><button type="submit">Haan, reminder band karein</button></form>
<p><a href="/">LADDU.CO par wapas jaayein</a></p>`,
        );
      },
      POST: async ({ request }) => {
        const { DB } = bindings();
        const form = await request.formData().catch(() => null);
        const c = clean(String(form?.get("c") ?? ""), 40);
        const t = clean(String(form?.get("t") ?? ""), 64);
        const ok = DB ? await stopReminders(DB, c, t) : false;
        return ok
          ? page("Theek hai", `<p>Ab aapko payment reminder emails nahi aayenge.</p><p><a href="/">LADDU.CO par wapas jaayein</a></p>`)
          : page("Link sahi nahi hai", `<p>Yeh link kaam nahi kar raha. Is email ka reply karke bataiye, hum band kar denge.</p>`);
      },
    },
  },
});
