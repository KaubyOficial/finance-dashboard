-- 001_init — base schema for the Finance Dashboard.
-- All money is stored in its NATIVE currency; conversion happens on read (engine).

-- Channels mirror config/channels.json (synced by config loader) plus runtime flags.
CREATE TABLE IF NOT EXISTS channels (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  youtube_channel_id  TEXT,
  google_account      TEXT,
  launch_date         TEXT,                 -- YYYY-MM-DD
  reference_currency  TEXT NOT NULL DEFAULT 'USD',
  active              INTEGER NOT NULL DEFAULT 1,
  monetized           INTEGER,              -- NULL=unknown, 1=yes, 0=no (S1.3)
  monetized_checked_at TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- OAuth tokens keyed by the *authorized identity* (Brand Account aware — R2).
CREATE TABLE IF NOT EXISTS oauth_tokens (
  account            TEXT PRIMARY KEY,       -- human label of the authorized identity
  email              TEXT,
  refresh_token_enc  TEXT NOT NULL,          -- AES-256-GCM, base64
  scope              TEXT,
  obtained_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_refresh_at    TEXT,
  revoked            INTEGER NOT NULL DEFAULT 0
);

-- Daily AdSense revenue per channel. `date` is the YouTube Analytics day
-- (America/Los_Angeles — see S7.3). Stored in USD (YT native).
CREATE TABLE IF NOT EXISTS revenue_daily (
  channel_id               TEXT NOT NULL,
  date                     TEXT NOT NULL,     -- YYYY-MM-DD (LA)
  currency                 TEXT NOT NULL DEFAULT 'USD',
  estimated_revenue        REAL NOT NULL DEFAULT 0,
  estimated_ad_revenue     REAL NOT NULL DEFAULT 0,
  gross_revenue            REAL NOT NULL DEFAULT 0,
  views                    INTEGER NOT NULL DEFAULT 0,
  estimated_minutes_watched INTEGER NOT NULL DEFAULT 0,
  cpm                      REAL NOT NULL DEFAULT 0,
  provisional              INTEGER NOT NULL DEFAULT 0,  -- last ~3 days may be revised (R3)
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (channel_id, date)
);

-- Hotmart sales. Commission is the NET amount the user actually receives.
-- Refunds/chargebacks keep the original row and record the reversal event (S2.4).
CREATE TABLE IF NOT EXISTS sales (
  transaction_id      TEXT PRIMARY KEY,
  product             TEXT,
  product_id          TEXT,
  status              TEXT,                  -- APPROVED, COMPLETE, REFUNDED, CHARGEBACK, ...
  role                TEXT,                  -- PRODUCER / AFFILIATE / COPRODUCER
  commission_amount   REAL NOT NULL DEFAULT 0,  -- net, native currency
  commission_currency TEXT NOT NULL DEFAULT 'BRL',
  price_amount        REAL,
  price_currency      TEXT,
  src                 TEXT,                  -- tracking source (from description links)
  sck                 TEXT,
  channel_id          TEXT,                  -- NULL => "Não atribuído" bucket
  attribution_source  TEXT NOT NULL DEFAULT 'unmatched', -- auto | manual | unmatched
  order_date          TEXT,                  -- YYYY-MM-DD of the approved sale
  approved_date       TEXT,
  refund_amount       REAL NOT NULL DEFAULT 0,  -- positive = amount reversed
  refund_date         TEXT,                  -- YYYY-MM-DD of the reversal event
  raw                 TEXT,                  -- original JSON (audit)
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Operational costs. channel_id NULL => shared (allocated per allocation_rule).
CREATE TABLE IF NOT EXISTS costs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  kind               TEXT NOT NULL,          -- 'recurring' | 'one_off'
  category           TEXT NOT NULL,
  description        TEXT,
  amount             REAL NOT NULL,          -- native currency, per-month for recurring
  currency           TEXT NOT NULL,
  channel_id         TEXT,                   -- NULL => shared
  allocation_rule    TEXT,                   -- shared only: equal | by_revenue | custom
  allocation_custom  TEXT,                   -- JSON { channel_id: percent } for 'custom'
  start_date         TEXT NOT NULL,          -- YYYY-MM-DD (one_off: the date; recurring: first month)
  end_date           TEXT,                   -- recurring only; NULL = open-ended
  source             TEXT NOT NULL DEFAULT 'manual', -- manual | csv
  row_hash           TEXT,                   -- CSV de-dup key
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FX rates (ECB via Frankfurter). Stored EUR-based; engine crosses through EUR.
CREATE TABLE IF NOT EXISTS fx_rates (
  date   TEXT NOT NULL,   -- YYYY-MM-DD
  base   TEXT NOT NULL,   -- always 'EUR'
  quote  TEXT NOT NULL,   -- 'USD' | 'BRL' | 'EUR'
  rate   REAL NOT NULL,   -- 1 base = rate quote
  PRIMARY KEY (date, base, quote)
);

-- Every sync run leaves an auditable record (Settings/Sync page reads this).
CREATE TABLE IF NOT EXISTS sync_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,   -- youtube | hotmart | fx | all
  scope         TEXT,            -- optional detail (channel/account)
  status        TEXT NOT NULL,   -- running | ok | error | partial
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  cursor        TEXT,            -- resumable backfill cursor
  message       TEXT,
  detail        TEXT
);

-- Key/value for cursors, last-success timestamps, etc.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_revenue_channel_date ON revenue_daily (channel_id, date);
CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales (channel_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON sales (order_date);
CREATE INDEX IF NOT EXISTS idx_costs_channel ON costs (channel_id);
CREATE INDEX IF NOT EXISTS idx_synclog_source ON sync_log (source, started_at);
