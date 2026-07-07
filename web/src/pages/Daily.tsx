// Receita diária (S-ajuste 2026-07-06): day-by-day revenue only (no costs) —
// AdSense + Hotmart − refunds, with a per-channel breakdown per day.
import { useMemo, useState } from 'react';
import { api } from '../api';
import type { Currency, DailyRevenueDay } from '../api';
import { useApi } from '../lib/useApi';
import { useFilters } from '../store';
import { money, num, dateBR } from '../format';
import { KpiCard } from '../components/Kpi';
import { DailyRevenueChart } from '../components/charts';
import { Spinner, ErrorState, EmptyState } from '../components/states';

export function Daily() {
  const { from, to, currency } = useFilters();
  const { data, loading, error, reload } = useApi(() => api.revenueDaily({ from, to, currency }), [from, to, currency]);

  // Table shows most recent day first; the chart keeps chronological order.
  const daysDesc = useMemo(() => (data ? [...data.days].reverse() : []), [data]);

  if (loading) return <Spinner label="Somando receitas por dia…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.days.length === 0) return <EmptyState title="Sem receitas no período" hint="Rode um sync ou ajuste o período." />;

  const t = data.totals;
  const avg = t.revenue_total / data.days.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Receita diária</h1>
        <p className="muted text-xs">Só receitas (sem custos) · dias sem movimento não aparecem</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Receita no período" value={money(t.revenue_total, currency)} hint={`${data.days.length} dias com movimento`} />
        <KpiCard label="AdSense" value={money(t.revenue_youtube, currency)} />
        <KpiCard label="Hotmart" value={money(t.revenue_hotmart, currency)} hint={t.refunds > 0 ? `reembolsos ${money(t.refunds, currency)}` : undefined} />
        <KpiCard label="Média por dia" value={money(avg, currency)} />
      </div>

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">AdSense × Hotmart (por dia)</h2>
        <DailyRevenueChart data={data.days} currency={currency} />
      </section>

      <section className="card overflow-hidden">
        <div className="p-4 pb-2">
          <h2 className="text-sm font-semibold">Dia a dia</h2>
          <p className="muted text-xs">Clique num dia para abrir a receita por canal.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted text-left text-xs">
                <th className="px-4 py-2">Data</th>
                <Th>AdSense</Th>
                <Th>Hotmart</Th>
                <Th>Reembolsos</Th>
                <Th>Total</Th>
                <Th>Views</Th>
              </tr>
            </thead>
            <tbody>
              {daysDesc.map((d) => (
                <DayRow key={d.date} day={d} currency={currency} />
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

function Td({ children, strong, color }: { children: React.ReactNode; strong?: boolean; color?: string }) {
  return (
    <td className="tabular px-4 py-2 text-right" style={{ fontWeight: strong ? 600 : 400, color }}>
      {children}
    </td>
  );
}

function DayRow({ day, currency }: { day: DailyRevenueDay; currency: Currency }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="cursor-pointer border-t hover:opacity-90" style={{ borderColor: 'var(--border)' }} onClick={() => setOpen((o) => !o)}>
        <td className="px-4 py-2">
          <span className="muted mr-1 inline-block w-3 text-xs">{open ? '▾' : '▸'}</span>
          {dateBR(day.date)}
          {day.provisional && (
            <span className="ml-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} title="Últimos dias podem ser revisados pelo YouTube">
              provisório
            </span>
          )}
        </td>
        <Td>{money(day.revenue_youtube, currency)}</Td>
        <Td>{money(day.revenue_hotmart, currency)}</Td>
        <Td color={day.refunds > 0 ? 'var(--neg)' : undefined}>{day.refunds > 0 ? `−${money(day.refunds, currency)}` : '—'}</Td>
        <Td strong color={day.revenue_total >= 0 ? 'var(--pos)' : 'var(--neg)'}>
          {money(day.revenue_total, currency)}
        </Td>
        <Td>{day.views > 0 ? num(day.views) : '—'}</Td>
      </tr>
      {open &&
        day.channels.map((c) => (
          <tr key={`${day.date}-${c.channel_id ?? 'un'}`} className="text-xs" style={{ background: 'var(--surface-2)' }}>
            <td className="py-1.5 pl-11 pr-4">{c.channel_id == null ? <span className="muted italic">{c.channel_name}</span> : c.channel_name}</td>
            <Td>{money(c.revenue_youtube, currency)}</Td>
            <Td>{money(c.revenue_hotmart, currency)}</Td>
            <Td color={c.refunds > 0 ? 'var(--neg)' : undefined}>{c.refunds > 0 ? `−${money(c.refunds, currency)}` : '—'}</Td>
            <Td>{money(c.revenue_total, currency)}</Td>
            <Td>{c.views > 0 ? num(c.views) : '—'}</Td>
          </tr>
        ))}
    </>
  );
}
