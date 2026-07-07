import { useState } from 'react';
import { api } from '../api';
import type { Cost, CsvImportResult, Currency } from '../api';
import { useApi } from '../lib/useApi';
import { money, dateBR } from '../format';
import { DateField } from '../components/DateField';
import { Spinner, ErrorState, EmptyState } from '../components/states';

const CURRENCIES: Currency[] = ['USD', 'BRL', 'EUR'];

export function Costs() {
  const costsQ = useApi(() => api.costs(), []);
  const cfg = useApi(() => api.config(), []);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);

  async function remove(id: number) {
    setDelErr(null);
    setBusy(true);
    try {
      await api.deleteCost(id);
      costsQ.reload();
    } catch (e) {
      setDelErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function add(form: Partial<Cost>) {
    setFormErr(null);
    setBusy(true);
    try {
      await api.createCost(form);
      costsQ.reload();
    } catch (e) {
      setFormErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">Custos</h1>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="card overflow-x-auto">
          <h2 className="p-4 pb-2 text-sm font-semibold">Lançamentos</h2>
          {delErr && <p className="px-4 pb-2 text-xs" style={{ color: 'var(--neg)' }}>Falha ao excluir: {delErr}</p>}
          {costsQ.loading ? (
            <Spinner />
          ) : costsQ.error ? (
            <ErrorState message={costsQ.error} onRetry={costsQ.reload} />
          ) : costsQ.data && costsQ.data.costs.length === 0 ? (
            <EmptyState title="Nenhum custo lançado" hint="Use o formulário ao lado ou importe um CSV." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="muted text-left text-xs">
                  <th className="px-4 py-2">Categoria</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Canal</th>
                  <th className="px-4 py-2">Vigência</th>
                  <th className="px-4 py-2 text-right font-normal">Valor</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {costsQ.data?.costs.map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2">
                      {c.category}
                      {c.description && <div className="muted text-xs">{c.description}</div>}
                    </td>
                    <td className="px-4 py-2 text-xs muted">{c.kind === 'recurring' ? 'recorrente' : 'avulso'}</td>
                    <td className="px-4 py-2 text-xs">{c.channel_id || <span className="muted italic">shared·{c.allocation_rule}</span>}</td>
                    <td className="px-4 py-2 text-xs muted">
                      {dateBR(c.start_date)}
                      {c.kind === 'recurring' ? ` → ${c.end_date ? dateBR(c.end_date) : 'aberto'}` : ''}
                    </td>
                    <td className="tabular px-4 py-2 text-right">{money(c.amount, c.currency)}</td>
                    <td className="px-4 py-2 text-right">
                      <button disabled={busy} onClick={() => remove(c.id)} className="text-xs muted hover:underline" style={{ color: 'var(--neg)' }}>
                        excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="flex flex-col gap-5">
          <CostForm channels={cfg.data?.channels || []} onSubmit={add} busy={busy} error={formErr} />
          <CsvImport onDone={costsQ.reload} />
        </div>
      </div>
    </div>
  );
}

function CostForm({ channels, onSubmit, busy, error }: { channels: { id: string; name: string }[]; onSubmit: (c: Partial<Cost>) => void; busy: boolean; error: string | null }) {
  const [kind, setKind] = useState<'recurring' | 'one_off'>('one_off');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [scope, setScope] = useState<string>('shared');
  const [rule, setRule] = useState<'equal' | 'by_revenue'>('by_revenue');
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      kind,
      category,
      description,
      amount: Number(amount),
      currency,
      channel_id: scope === 'shared' ? null : scope,
      allocation_rule: scope === 'shared' ? rule : null,
      start_date: start,
      end_date: kind === 'recurring' && end ? end : null,
    });
  }

  const input = 'w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm';
  const st = { borderColor: 'var(--border)' } as const;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-2.5 p-4">
      <h2 className="text-sm font-semibold">Novo custo</h2>
      <div className="flex gap-2">
        {(['one_off', 'recurring'] as const).map((k) => (
          <button type="button" key={k} onClick={() => setKind(k)} className="flex-1 rounded-lg border px-2 py-1 text-xs" style={{ ...st, background: kind === k ? 'var(--accent-soft)' : 'transparent', color: kind === k ? 'var(--accent)' : 'var(--text-muted)' }}>
            {k === 'recurring' ? 'Recorrente' : 'Avulso'}
          </button>
        ))}
      </div>
      <input required placeholder="Categoria (ex.: TTS)" className={input} style={st} value={category} onChange={(e) => setCategory(e.target.value)} />
      <input placeholder="Descrição" className={input} style={st} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex gap-2">
        <input required type="number" step="0.01" min="0.01" placeholder="Valor" className={input} style={st} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className={input} style={st} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <select className={input} style={st} value={scope} onChange={(e) => setScope(e.target.value)}>
        <option value="shared">Compartilhado (rateado)</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {scope === 'shared' && (
        <select className={input} style={st} value={rule} onChange={(e) => setRule(e.target.value as 'equal' | 'by_revenue')}>
          <option value="by_revenue">Rateio: por receita</option>
          <option value="equal">Rateio: igual</option>
        </select>
      )}
      <div className="flex items-center gap-2 text-xs">
        <label className="muted w-24">{kind === 'recurring' ? 'Início' : 'Data'}</label>
        <DateField required value={start} onChange={setStart} className="flex-1" />
      </div>
      {kind === 'recurring' && (
        <div className="flex items-center gap-2 text-xs">
          <label className="muted w-24">Fim (opcional)</label>
          <DateField allowEmpty value={end} onChange={setEnd} className="flex-1" />
        </div>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--neg)' }}>{error}</p>}
      <button disabled={busy} className="rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
        Lançar custo
      </button>
    </form>
  );
}

function CsvImport({ onDone }: { onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<CsvImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(commit: boolean) {
    setBusy(true);
    try {
      const r = await api.importCsv(csv, commit);
      setPreview(r);
      if (commit) {
        onDone();
        if (r.inserted) setCsv('');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold">Importar CSV</h2>
      <p className="muted text-xs">Colunas: kind;category;description;amount;currency;channel_id;allocation_rule;allocation_custom;start_date;end_date</p>
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} className="rounded-lg border bg-transparent p-2 font-mono text-xs" style={{ borderColor: 'var(--border)' }} placeholder="cole o CSV aqui" />
      <div className="flex gap-2">
        <button disabled={busy || !csv} onClick={() => run(false)} className="flex-1 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--border)' }}>
          Prévia
        </button>
        <button disabled={busy || !preview || preview.toInsert.length === 0} onClick={() => run(true)} className="flex-1 rounded-lg px-3 py-1.5 text-sm text-white" style={{ background: 'var(--accent)' }}>
          Importar {preview ? `(${preview.toInsert.length})` : ''}
        </button>
      </div>
      {preview && (
        <div className="text-xs">
          {preview.dryRun && <p className="muted">Prévia (nada gravado ainda):</p>}
          {!preview.dryRun && <p style={{ color: 'var(--pos)' }}>{preview.inserted} custo(s) importado(s).</p>}
          <p>✅ novos: {preview.toInsert.length} · ♻️ duplicados: {preview.duplicates.length} · ⚠️ erros: {preview.errors.length}</p>
          {preview.errors.map((e) => (
            <p key={e.line} style={{ color: 'var(--neg)' }}>
              linha {e.line}: {e.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
