import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { applySecurityHeaders } from "./lib/security-headers.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

// Creates the orders table on the first request, so no manual SQL step is needed.
// The same SQL lives in migrations/0001_orders.sql.
let schemaReady: Promise<unknown> | undefined;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, view_token TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', items_json TEXT NOT NULL, items_total INTEGER NOT NULL, delivery INTEGER NOT NULL, total INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, pin TEXT NOT NULL, gift_message TEXT NOT NULL DEFAULT '', rzp_order_id TEXT, rzp_payment_id TEXT, courier TEXT NOT NULL DEFAULT '', awb TEXT NOT NULL DEFAULT '', tracking_url TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', emails_sent INTEGER NOT NULL DEFAULT 0, shipped_email_sent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), paid_at TEXT, shipped_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_rzp_order ON orders (rzp_order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)`,
];
type D1Like = { prepare: (sql: string) => { run: () => Promise<unknown> } };
function ensureSchema(env: unknown) {
  const db = (env as { DB?: D1Like } | undefined)?.DB;
  if (!db) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const sql of SCHEMA) await db.prepare(sql).run();
    })().catch((e) => {
      schemaReady = undefined;
      console.error("schema setup failed", e);
    });
  }
  return schemaReady;
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"}; try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // No trailing slash: /policies/ -> /policies
    const url = new URL(request.url);
    if (url.pathname.length > 1 && url.pathname.endsWith("/") && (request.method === "GET" || request.method === "HEAD")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
      return Response.redirect(url.toString(), 301);
    }
    try {
      await ensureSchema(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
