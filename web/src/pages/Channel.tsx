import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useApi } from '../lib/useApi';
import { useFilters } from '../store';
import { money, pct, monthLabel, dateBR } from '../format';
import { RevenueSourceChart } from '../components/charts';
import { Spinner, ErrorState, EmptyState } from '../components/states';

export function Channel() {
  const { id = '' } = useParams();
  const { from, to, currency } = useFilters();
  const { data, loading, error, reload } = useApi(() => api.channelDetail(id, { from, to, currency }), [id, from, to, currency]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Canal não encontrado" />;

  const { channel, pnl, sales } = data;
  const months = pnl.byMonth;
  const monetized = channel.monetized;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link to="/" className="muted text-sm hover:underline">← Overview</Link>
        <h1 className="text-lg font-semibold">{channel.name}</h1>
        {monetized === 0 && (
          <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            somente views (sem receita monetária)
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receita" value={money(pnl.network?.revenue_total ?? 0, currency)} />
        <Stat label="Custo" value={money(pnl.network?.cost_total ?? 0, currency)} />
        <Stat label="Lucro" value={money(pnl.network?.profit ?? 0, currency)} />
        <Stat label="Margem" value={pct(pnl.network?.margin ?? null)} />
      </div>

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">Receita por fonte (AdSense × Hotmart)</h2>
        <RevenueSourceChart data={months} currency={currency} />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="p-4 pb-2 text-sm font-semibold">P&L mensal</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="muted text-left text-xs">
              <th className="px-4 py-2">Mês</th>
              <th className="px-4 py-2 text-right font-normal">AdSense</th>
              <th className="px-4 py-2 text-right font-normal">Hotmart</th>
              <th className="px-4 py-2 text-right font-normal">Estornos</th>
              <th className="px-4 py-2 text-right font-normal">Custo</th>
              <th className="px-4 py-2 text-right font-normal">Lucro</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-4 py-2">{monthLabel(m.month!)}</td>
                <td className="tabular px-4 py-2 text-right">{money(m.revenue_youtube, currency)}</td>
                <td className="tabular px-4 py-2 text-right">{money(m.revenue_hotmart, currency)}</td>
                <td className="tabular px-4 py-2 text-right" style={{ color: m.refunds > 0 ? 'var(--neg)' : undefined }}>
                  {m.refunds > 0 ? `−${money(m.refunds, currency)}` : '—'}
                </td>
                <td className="tabular px-4 py-2 text-right">{money(m.cost_total, currency)}</td>
                <td className="tabular px-4 py-2 text-right font-semibold" style={{ color: m.profit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                  {money(m.profit, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="p-4 pb-2 text-sm font-semibold">Vendas Hotmart ({sales.length})</h2>
        {sales.length === 0 ? (
          <p className="muted px-4 pb-4 text-sm">Nenhuma venda atribuída a este canal no período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="muted text-left text-xs">
                <th className="px-4 py-2">Transação</th>
                <th className="px-4 py-2">Produto</th>
                <th className="px-4 py-2">src</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2 text-right font-normal">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.transaction_id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-2 font-mono text-xs">{s.transaction_id}</td>
                  <td className="px-4 py-2">{s.product}</td>
                  <td className="px-4 py-2 font-mono text-xs muted">{s.src || '—'}</td>
                  <td className="px-4 py-2">
                    <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--surface-2)', color: s.refund_amount > 0 ? 'var(--neg)' : 'var(--text-muted)' }}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">{dateBR(s.order_date)}</td>
                  <td className="tabular px-4 py-2 text-right">{money(s.commission_amount, s.commission_currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="muted text-xs uppercase tracking-wide">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
