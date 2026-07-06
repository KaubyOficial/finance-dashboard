import type { Currency } from './api';

const LOCALE = 'pt-BR';

export function money(value: number | null | undefined, currency: Currency): string {
  if (value == null) return '—';
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

export function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat(LOCALE, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

export function num(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat(LOCALE).format(Math.round(value));
}

export function monthLabel(m: string): string {
  const [y, mm] = m.split('-');
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${names[Number(mm) - 1]}/${y.slice(2)}`;
}

export function dateBR(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Signed delta as a percentage vs a previous value (for KPI arrows). */
export function delta(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
