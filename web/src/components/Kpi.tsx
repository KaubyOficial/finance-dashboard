import { pct } from '../format';

export function KpiCard({
  label,
  value,
  delta,
  positiveIsGood = true,
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  positiveIsGood?: boolean;
  hint?: string;
}) {
  const up = delta != null && delta >= 0;
  const good = delta == null ? false : positiveIsGood ? up : !up;
  return (
    <div className="card p-4">
      <p className="muted text-xs uppercase tracking-wide">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta != null ? (
          <span style={{ color: good ? 'var(--pos)' : 'var(--neg)' }}>
            {up ? '▲' : '▼'} {pct(Math.abs(delta))}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
        {hint && <span className="muted">{hint}</span>}
      </div>
    </div>
  );
}
