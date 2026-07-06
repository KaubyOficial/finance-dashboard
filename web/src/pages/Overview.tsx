import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { PnlLine } from '../api';
import { useApi } from '../lib/useApi';
import { useFilters } from '../store';
import { money, pct, delta, num } from '../format';
import { KpiCard } from '../components/Kpi';
import { RevenueCostChart } from '../components/charts';
import { Spinner, ErrorState, EmptyState } from '../components/states';

type SortKey = 'revenue_total' | 'profit' | 'margin' | 'cost_total';

export function Overview() {
  const { from, to, currency } = useFilters();
  const { data, loading, error, reload } = useApi(() => api.pnl({ from, to, currency, groupBy: 'month' }), [from, to, currency]);
  const [sort, setSort] = useState<SortKey>('revenue_total');

  const channels = useMemo(() => {
    if (!data) return [];
    return [...data.byChannel].sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity));
  }, [data, sort]);

  if (loading) return <Spinner label="Calculando P&L…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || !data.network) return <EmptyState title="Sem dados no período" hint="Rode um sync ou ajuste o período." />;

  const n = data.network;
  const prev = data.previous;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Receita" value={money(n.revenue_total, currency)} delta={delta(n.revenue_total, prev?.revenue_total)} />
        <KpiCard label="Custo" value={money(n.cost_total, currency)} delta={delta(n.cost_total, prev?.cost_total)} positiveIsGood={false} />
        <KpiCard label="Lucro" value={money(n.profit, currency)} delta={delta(n.profit, prev?.profit)} />
        <KpiCard label="Margem" value={pct(n.margin)} hint={prev ? `vs ${pct(prev.margin)}` : undefined} />
      </div>

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">Receita × Custo × Lucro (mensal)</h2>
        <RevenueCostChart data={data.byMonth} currency={currency} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-sm font-semibold">Canais</h2>
          <div className="flex gap-1 text-xs">
            {(['revenue_total', 'profit', 'margin', 'cost_total'] as SortKey[]).map((k) => (
              <button key={k} onClick={() => setSort(k)} className="rounded px-2 py-1" style={{ background: sort === k ? 'var(--accent-soft)' : 'transparent', color: sort === k ? 'var(--accent)' : 'var(--text-muted)' }}>
                {{ revenue_total: 'Receita', profit: 'Lucro', margin: 'Margem', cost_total: 'Custo' }[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted text-left text-xs">
                <th className="px-4 py-2">Canal</th>
                <Th>AdSense</Th>
                <Th>Hotmart</Th>
                <Th>Custo</Th>
                <Th>Lucro</Th>
                <Th>Margem</Th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <ChannelRow key={c.channel_id ?? 'un'} line={c} currency={currency} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-right font-normal">{children}</th>;
}

function ChannelRow({ line, currency }: { line: PnlLine; currency: string }) {
  const isUn = line.channel_id == null;
  const name = line.channel_name || 'Não atribuído';
  return (
    <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
      <td className="px-4 py-2.5">
        {isUn ? (
          <span className="muted italic">{name}</span>
        ) : (
          <Link to={`/channel/${line.channel_id}`} className="hover:underline" style={{ color: 'var(--accent)' }}>
            {name}
          </Link>
        )}
        {line.views > 0 && <div className="muted text-xs">{num(line.views)} views</div>}
      </td>
      <Td>{money(line.revenue_youtube, currency as any)}</Td>
      <Td>{money(line.revenue_hotmart, currency as any)}</Td>
      <Td>{money(line.cost_total, currency as any)}</Td>
      <Td strong color={line.profit >= 0 ? 'var(--pos)' : 'var(--neg)'}>
        {money(line.profit, currency as any)}
      </Td>
      <Td>{pct(line.margin)}</Td>
    </tr>
  );
}

function Td({ children, strong, color }: { children: React.ReactNode; strong?: boolean; color?: string }) {
  return (
    <td className="tabular px-4 py-2.5 text-right" style={{ fontWeight: strong ? 600 : 400, color }}>
      {children}
    </td>
  );
}
