-- 002_perf_indexes — indexes tuned for the P&L engine's hot queries (Epic 8 · S8.1).
-- Revenue and refunds are aggregated by month; these cover the range scans.
CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_daily (date);
CREATE INDEX IF NOT EXISTS idx_sales_refund_date ON sales (refund_date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
CREATE INDEX IF NOT EXISTS idx_costs_dates ON costs (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_fx_date ON fx_rates (date);
