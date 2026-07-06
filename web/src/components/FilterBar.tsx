import { useFilters, type Preset } from '../store';
import type { Currency } from '../api';

const PRESETS: { key: Preset; label: string }[] = [
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
  { key: 'ytd', label: 'YTD' },
];
const CURRENCIES: Currency[] = ['USD', 'BRL', 'EUR'];

export function FilterBar() {
  const { from, to, currency, set, setPreset } = useFilters();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} className="px-2.5 py-1 text-xs muted hover:opacity-100" style={{ borderRight: '1px solid var(--border)' }}>
            {p.label}
          </button>
        ))}
      </div>
      <input aria-label="de" type="date" value={from} onChange={(e) => set({ from: e.target.value })} className="rounded-lg border bg-transparent px-2 py-1 text-sm" style={{ borderColor: 'var(--border)' }} />
      <span className="muted">→</span>
      <input aria-label="até" type="date" value={to} onChange={(e) => set({ to: e.target.value })} className="rounded-lg border bg-transparent px-2 py-1 text-sm" style={{ borderColor: 'var(--border)' }} />
      <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        {CURRENCIES.map((c) => (
          <button
            key={c}
            onClick={() => set({ currency: c })}
            className="px-2.5 py-1 text-xs font-medium"
            style={{ background: currency === c ? 'var(--accent)' : 'transparent', color: currency === c ? '#fff' : 'var(--text-muted)' }}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
