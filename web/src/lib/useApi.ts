import { useCallback, useEffect, useState } from 'react';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Load an async resource with loading/error/reload (S5.5). `deps` re-fetches. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);

  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e.message || 'erro' }));
    return () => {
      alive = false;
    };
  }, deps); // deps are intentionally caller-controlled

  useEffect(() => run(), [run, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
