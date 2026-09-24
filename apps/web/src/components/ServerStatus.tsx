import { useEffect, useState } from 'react';
import { HealthResponseSchema, type HealthResponse } from '@magic-potion/shared';
import { API_URL } from '../config';

type State = { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error' };

const DB_LABEL: Record<HealthResponse['db'], string> = {
  ok: 'Database OK',
  down: 'Database not reachable',
  not_configured: 'Database not set up yet',
};

const DB_COLOUR: Record<HealthResponse['db'], string> = {
  ok: 'text-success',
  down: 'text-danger',
  not_configured: 'text-ink-muted',
};

async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/healthz`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return HealthResponseSchema.parse(await res.json());
}

export function ServerStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal).then(
      (health) => setState({ kind: 'ok', health }),
      () => {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }

  if (state.kind === 'loading') {
    return <p className="text-lg text-ink-muted">Checking server…</p>;
  }

  if (state.kind === 'error') {
    return (
      <div role="status">
        <p className="text-2xl font-bold text-danger">Server unreachable</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-lg bg-brand px-4 py-2 font-semibold hover:bg-brand-soft"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div role="status">
      <p className="text-2xl font-bold text-success">Server OK</p>
      <p className={`mt-2 ${DB_COLOUR[state.health.db]}`}>{DB_LABEL[state.health.db]}</p>
    </div>
  );
}
