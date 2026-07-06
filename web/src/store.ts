// Global filters (period + display currency) persisted to localStorage (S5.1).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Currency } from './api';

function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n, 1);
  return d.toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FiltersState {
  from: string;
  to: string;
  currency: Currency;
  theme: 'light' | 'dark';
  set: (patch: Partial<Pick<FiltersState, 'from' | 'to' | 'currency'>>) => void;
  toggleTheme: () => void;
  setPreset: (preset: Preset) => void;
}

export type Preset = '3m' | '6m' | '12m' | 'ytd';

export const useFilters = create<FiltersState>()(
  persist(
    (set) => ({
      from: monthsAgo(11),
      to: today(),
      currency: 'USD',
      theme: 'dark',
      set: (patch) => set(patch),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setPreset: (preset) => {
        if (preset === 'ytd') set({ from: `${new Date().getUTCFullYear()}-01-01`, to: today() });
        else set({ from: monthsAgo({ '3m': 2, '6m': 5, '12m': 11 }[preset]), to: today() });
      },
    }),
    { name: 'finance-filters' }
  )
);
