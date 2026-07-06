// Charts (recharts). Palette chosen for legibility in light + dark and
// colour-blind safety (dataviz): blue = revenue, amber = cost, teal/violet for
// sources. Values already in display currency.
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { PnlLine, Currency } from '../api';
import { money, monthLabel } from '../format';

const COLORS = { revenue: '#2f6df6', cost: '#e8a33d', youtube: '#14a3b8', hotmart: '#8b5cf6', profit: '#12855b' };

function axisStyle() {
  return { fontSize: 11, fill: 'var(--text-muted)' };
}

function TooltipBox({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card p-2 text-xs" style={{ boxShadow: '0 4px 16px rgb(0 0 0 / .18)' }}>
      <div className="mb-1 font-medium">{monthLabel(String(label))}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="tabular">{money(p.value, currency)}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueCostChart({ data, currency }: { data: PnlLine[]; currency: Currency }) {
  const rows = data.map((r) => ({ month: r.month, Receita: r.revenue_total, Custo: r.cost_total, Lucro: r.profit }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisStyle()} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
        <YAxis tick={axisStyle()} tickLine={false} axisLine={false} width={54} />
        <Tooltip content={<TooltipBox currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="Receita" stroke={COLORS.revenue} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Custo" stroke={COLORS.cost} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Lucro" stroke={COLORS.profit} strokeWidth={2} dot={false} strokeDasharray="4 3" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RevenueSourceChart({ data, currency }: { data: PnlLine[]; currency: Currency }) {
  const rows = data.map((r) => ({ month: r.month, AdSense: r.revenue_youtube, Hotmart: r.revenue_hotmart }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisStyle()} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
        <YAxis tick={axisStyle()} tickLine={false} axisLine={false} width={54} />
        <Tooltip content={<TooltipBox currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="AdSense" stackId="r" fill={COLORS.youtube} radius={[0, 0, 0, 0]} />
        <Bar dataKey="Hotmart" stackId="r" fill={COLORS.hotmart} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
