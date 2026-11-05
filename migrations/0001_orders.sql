-- LADDU.CO orders. Additive only: this runs against the live database.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  view_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  items_json TEXT NOT NULL,
  items_total INTEGER NOT NULL,
  delivery INTEGER NOT NULL,
  total INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pin TEXT NOT NULL,
  gift_message TEXT NOT NULL DEFAULT '',
  rzp_order_id TEXT,
  rzp_payment_id TEXT,
  courier TEXT NOT NULL DEFAULT '',
  awb TEXT NOT NULL DEFAULT '',
  tracking_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  emails_sent INTEGER NOT NULL DEFAULT 0,
  shipped_email_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  shipped_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_rzp_order ON orders (rzp_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
