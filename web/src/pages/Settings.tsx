import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SyncStatus } from '../api';
import { useApi } from '../lib/useApi';
import { dateBR } from '../format';
import { Spinner, ErrorState } from '../components/states';

export function Settings() {
  const { data, loading, error, reload } = useApi(() => api.syncStatus(), []);
  const [msg, setMsg] = useState<string | null>(null);

  // Poll while a sync is running so the UI updates without a manual refresh.
  useEffect(() => {
    if (!data?.state.running) return;
    const t = setInterval(reload, 2000);
    return () => clearInterval(t);
  }, [data?.state.running, reload]);

  async function sync(mode: 'incremental' | 'backfill') {
    const r = await api.triggerSync(mode);
    setMsg(r.started ? `Sync ${mode} iniciado…` : `Não iniciou: ${r.reason}`);
    setTimeout(reload, 500);
  }

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState message={error || 'sem dados'} onRetry={reload} />;

  const f = data.freshness;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Sync & Config</h1>
        <div className="flex gap-2">
          <button disabled={data.state.running} onClick={() => sync('incremental')} className="rounded-lg px-3 py-1.5 text-sm text-white" style={{ background: 'var(--accent)' }}>
            {data.state.running ? 'Sincronizando…' : 'Sync now'}
          </button>
          <button disabled={data.state.running} onClick={() => sync('backfill')} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--border)' }}>
            Backfill lifetime
          </button>
        </div>
      </div>
      {msg && <p className="muted text-sm">{msg}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        <SourceCard title="YouTube (AdSense)" until={f.youtube.dataUntil} ok={!!f.youtube.dataUntil} note={`${f.youtube.provisionalDays} dias provisórios`} last={f.youtube.lastRun?.status} />
        <SourceCard title="Hotmart (vendas)" until={f.hotmart.dataUntil} ok={!f.hotmart.stale} note={f.hotmart.stale ? '⚠️ sem sync há >48h' : 'em dia'} last={f.hotmart.lastRun?.status} />
        <SourceCard title="Câmbio (ECB)" until={f.fx.dataUntil} ok={!f.fx.stale} note={f.fx.stale ? '⚠️ desatualizado' : 'em dia'} last={f.fx.lastRun?.status} />
      </div>

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">Contas Google (OAuth)</h2>
        {data.tokens.length === 0 ? (
          <p className="muted text-sm">
            Nenhuma conta autorizada. No terminal: <code className="rounded bg-black/20 px-1">npm run auth -- --account &lt;nome&gt;</code>
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="muted text-left text-xs">
                <th className="py-1">Conta</th>
                <th className="py-1">E-mail</th>
                <th className="py-1">Refresh</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.tokens.map((t) => (
                <tr key={t.account} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-1.5">{t.account}</td>
                  <td className="py-1.5 muted">{t.email || '—'}</td>
                  <td className="py-1.5 muted">{t.daysSinceRefresh == null ? '—' : `há ${t.daysSinceRefresh}d`}</td>
                  <td className="py-1.5">
                    {t.revoked ? (
                      <span style={{ color: 'var(--neg)' }}>revogado — reautorize</span>
                    ) : (
                      <span style={{ color: 'var(--pos)' }}>ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-semibold">Execuções recentes</h2>
        <RecentRuns data={data} />
      </section>
    </div>
  );
}

function SourceCard({ title, until, ok, note, last }: { title: string; until: string | null; ok: boolean; note: string; last?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ok ? 'var(--pos)' : 'var(--neg)' }} />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="muted mt-2 text-xs">dados até {dateBR(until)}</p>
      <p className="muted text-xs">{note}</p>
      {last && <p className="muted text-xs">última execução: {last}</p>}
    </div>
  );
}

function RecentRuns({ data }: { data: SyncStatus }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="muted text-left text-xs">
          <th className="py-1">Fonte</th>
          <th className="py-1">Status</th>
          <th className="py-1">Linhas</th>
          <th className="py-1">Quando</th>
          <th className="py-1">Detalhe</th>
        </tr>
      </thead>
      <tbody>
        {data.recent.map((r) => (
          <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
            <td className="py-1.5">{r.source}{r.scope ? `·${r.scope}` : ''}</td>
            <td className="py-1.5" style={{ color: r.status === 'ok' ? 'var(--pos)' : r.status === 'error' ? 'var(--neg)' : 'var(--text-muted)' }}>{r.status}</td>
            <td className="tabular py-1.5">{r.rows_upserted}</td>
            <td className="py-1.5 muted">{(r.finished_at || r.started_at || '').replace('T', ' ').slice(0, 16)}</td>
            <td className="py-1.5 muted text-xs">{r.message || r.detail || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
