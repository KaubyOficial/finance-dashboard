// Loading / empty / error primitives (S5.5).

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 muted p-6" role="status" aria-live="polite">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label || 'Carregando…'}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md ${className}`} style={{ background: 'var(--surface-2)' }} />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="muted text-sm">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <p className="font-medium" style={{ color: 'var(--neg)' }}>
        Falha ao carregar
      </p>
      <p className="muted text-sm">{message}</p>
      {onRetry && (
        <button className="rounded-lg px-3 py-1.5 text-sm text-white" style={{ background: 'var(--accent)' }} onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}
