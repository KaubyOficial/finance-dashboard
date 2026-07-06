// Typed client for the backend contract (S4.3). All money in the requested
// display currency.

export type Currency = 'USD' | 'BRL' | 'EUR';
export type GroupBy = 'month' | 'channel';

export interface PnlLine {
  key: string;
  month?: string;
  channel_id?: string | null;
  channel_name?: string;
  currency: Currency;
  revenue_youtube: number;
  revenue_hotmart: number;
  refunds: number;
  revenue_total: number;
  cost_direct: number;
  cost_allocated: number;
  cost_total: number;
  profit: number;
  margin: number | null;
  views: number;
  effective_rpm?: number | null;
  cost_per_1k_views?: number | null;
}

export interface PnlResponse {
  from: string;
  to: string;
  currency: Currency;
  groupBy: GroupBy;
  rows: PnlLine[];
  byMonth: PnlLine[];
  byChannel: PnlLine[];
  network: PnlLine | null;
  previous: (PnlLine & { from: string; to: string }) | null;
}

export interface Channel {
  id: string;
  name: string;
  youtube_channel_id: string | null;
  google_account: string | null;
  monetized: number | null;
  reference_currency: Currency;
  launch_date: string | null;
  revenue_until: string | null;
}

export interface Cost {
  id: number;
  kind: 'recurring' | 'one_off';
  category: string;
  description: string;
  amount: number;
  currency: Currency;
  channel_id: string | null;
  allocation_rule: 'equal' | 'by_revenue' | 'custom' | null;
  allocation_custom: Record<string, number> | null;
  start_date: string;
  end_date: string | null;
  source: 'manual' | 'csv';
}

export interface SyncStatus {
  state: { running: boolean; startedAt: string | null; finishedAt: string | null; error: string | null; lastResult: unknown };
  freshness: Freshness;
  tokens: TokenStatus[];
  recent: SyncRun[];
  healthy: boolean;
}
export interface Freshness {
  youtube: { dataUntil: string | null; lastRun: SyncRun | null; provisionalDays: number };
  hotmart: { dataUntil: string | null; lastRun: SyncRun | null; stale: boolean };
  fx: { dataUntil: string | null; lastRun: SyncRun | null; stale: boolean };
  all: SyncRun | null;
  today: { utc: string; la: string };
}
export interface SyncRun {
  id: number;
  source: string;
  scope: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  rows_upserted: number;
  message: string | null;
  detail: string | null;
}
export interface TokenStatus {
  account: string;
  email: string | null;
  revoked: boolean;
  obtainedAt: string;
  lastRefreshAt: string | null;
  daysSinceRefresh: number | null;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface PnlParams {
  from: string;
  to: string;
  currency: Currency;
  groupBy?: GroupBy;
  channels?: string[] | null;
}

export const api = {
  pnl: (p: PnlParams) => {
    const q = new URLSearchParams({ from: p.from, to: p.to, currency: p.currency, groupBy: p.groupBy || 'month' });
    if (p.channels?.length) q.set('channels', p.channels.join(','));
    return req<PnlResponse>(`/api/pnl?${q}`);
  },
  channels: () => req<{ channels: Channel[] }>('/api/channels'),
  channelDetail: (id: string, p: PnlParams) => {
    const q = new URLSearchParams({ from: p.from, to: p.to, currency: p.currency });
    return req<{ channel: Channel; pnl: PnlResponse; sales: Sale[]; costs: Cost[] }>(`/api/channels/${id}?${q}`);
  },
  costs: (params: Record<string, string> = {}) => req<{ costs: Cost[] }>(`/api/costs?${new URLSearchParams(params)}`),
  createCost: (c: Partial<Cost>) => req<{ cost: Cost }>('/api/costs', { method: 'POST', body: JSON.stringify(c) }),
  updateCost: (id: number, c: Partial<Cost>) => req<{ cost: Cost }>(`/api/costs/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  deleteCost: (id: number) => req<{ deleted: boolean }>(`/api/costs/${id}`, { method: 'DELETE' }),
  importCsv: (csv: string, commit: boolean) => req<CsvImportResult>('/api/costs/import', { method: 'POST', body: JSON.stringify({ csv, commit }) }),
  syncStatus: () => req<SyncStatus>('/api/sync/status'),
  triggerSync: (mode: 'incremental' | 'backfill' = 'incremental', only?: string[]) =>
    req<{ started: boolean; reason?: string }>('/api/sync', { method: 'POST', body: JSON.stringify({ mode, only }) }),
  config: () => req<{ channels: { id: string; name: string }[]; currencies: Currency[] }>('/api/config'),
};

export interface Sale {
  transaction_id: string;
  product: string | null;
  status: string;
  role: string | null;
  commission_amount: number;
  commission_currency: Currency;
  src: string | null;
  channel_id: string | null;
  attribution_source: string;
  order_date: string | null;
  refund_amount: number;
  refund_date: string | null;
}

export interface CsvImportResult {
  toInsert: { line: number; cost: Cost }[];
  duplicates: { line: number }[];
  errors: { line: number; message: string }[];
  inserted: number;
  dryRun: boolean;
}
