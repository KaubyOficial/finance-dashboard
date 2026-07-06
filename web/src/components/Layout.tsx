import { NavLink, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useFilters } from '../store';
import { FilterBar } from './FilterBar';
import { api } from '../api';
import { useApi } from '../lib/useApi';
import { dateBR } from '../format';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/costs', label: 'Custos', end: false },
  { to: '/settings', label: 'Sync & Config', end: false },
];

export function Layout() {
  const { theme, toggleTheme } = useFilters();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-52 shrink-0 flex-col gap-1 border-r p-4 sm:flex" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="mb-4 flex items-center gap-2 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: 'var(--accent)' }}>₣</div>
          <span className="font-semibold">Finance</span>
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className="rounded-lg px-3 py-2 text-sm"
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: isActive ? 600 : 400,
            })}
          >
            {n.label}
          </NavLink>
        ))}
        <div className="mt-auto">
          <FreshnessBadge />
          <button onClick={toggleTheme} className="mt-3 w-full rounded-lg border px-3 py-1.5 text-xs muted" style={{ borderColor: 'var(--border)' }}>
            {theme === 'dark' ? '☀️ Claro' : '🌙 Escuro'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 backdrop-blur" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg) 85%, transparent)' }}>
          <FilterBar />
        </header>
        <main className="min-w-0 flex-1 p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function FreshnessBadge() {
  const { data } = useApi(() => api.syncStatus(), []);
  const until = data?.freshness?.youtube?.dataUntil;
  const healthy = data?.healthy;
  return (
    <div className="rounded-lg border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: healthy ? 'var(--pos)' : 'var(--neg)' }} />
        <span className="muted">{healthy ? 'sync saudável' : 'sync atrasado'}</span>
      </div>
      <div className="muted mt-1">dados YT até {dateBR(until ?? null)}</div>
    </div>
  );
}
