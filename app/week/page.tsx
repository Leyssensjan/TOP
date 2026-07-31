'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, getKey } from '@/lib/client/store';
import { titleCase } from '@/lib/format';

interface PlanEntry {
  id: string;
  day: string | null;
  sessionType: string | null;
  plannedMinutes: number | null;
  location: string;
  status: string | null;
  reasonNote: string;
}

interface WeekPayload {
  weekStart: string;
  entries: PlanEntry[];
  locked: boolean;
  rationale?: string[];
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const COLOUR: Record<string, string> = {
  flow: 'var(--amber)',
  'flow short': 'var(--amber)',
  strength: 'var(--text)',
  engine: 'var(--text)',
  skate: 'var(--text)',
  rest: 'var(--muted)',
};

/** The locked plan, read-only on the phone. Section 9. */
export default function WeekPage() {
  const router = useRouter();
  const [data, setData] = useState<WeekPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!getKey()) {
      router.replace('/');
      return;
    }
    try {
      setData(await api<WeekPayload>('/week'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/');
      else setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async (replace: boolean) => {
    setBusy(true);
    try {
      const res = await api<WeekPayload>('/week', { method: 'POST', body: { generate: true, replace } });
      setData({ ...res, locked: true });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">Week</span>
        <button className="label" onClick={() => router.push('/')} style={{ padding: '8px 0 8px 16px' }}>
          Today
        </button>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}
      {!data && !error && <p className="label">Loading</p>}

      {data && (
        <>
          <p style={{ margin: 0, color: 'var(--muted)' }}>Week of {data.weekStart}</p>

          {data.entries.length === 0 ? (
            <div className="stack">
              <div className="banner">No plan for this week yet.</div>
              <button className="btn btn-primary" disabled={busy} onClick={() => void generate(false)}>
                {busy ? 'Planning' : 'Generate the week'}
              </button>
            </div>
          ) : (
            <div className="stack">
              {data.entries.map((entry) => {
                const i = entry.day ? dayIndex(entry.day, data.weekStart) : 0;
                const rest = entry.sessionType === 'rest';
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: rest ? 'transparent' : 'var(--ink-raised)',
                      border: '1px solid var(--ink-line)',
                      opacity: rest ? 0.55 : 1,
                    }}
                  >
                    <span className="num" style={{ fontSize: 19, width: 42, flex: 'none', color: 'var(--muted)' }}>
                      {DAY_NAMES[i] ?? ''}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{ display: 'block', color: COLOUR[entry.sessionType ?? 'rest'] ?? 'var(--text)' }}
                      >
                        {titleCase(entry.sessionType ?? 'rest')}
                      </span>
                      {(entry.location || entry.reasonNote) && (
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>
                          {[entry.location, entry.reasonNote].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    {entry.plannedMinutes !== null && (
                      <span className="num" style={{ fontSize: 21, color: 'var(--muted)', flex: 'none' }}>
                        {entry.plannedMinutes}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {data.rationale?.length ? (
            <div className="detail" style={{ padding: '4px 2px' }}>
              {data.rationale.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}

          {data.entries.length > 0 && (
            <button
              className="btn btn-quiet"
              disabled={busy}
              style={{ marginTop: 'auto' }}
              onClick={() => void generate(true)}
            >
              {busy ? 'Planning' : 'Plan again'}
            </button>
          )}
        </>
      )}
    </main>
  );
}

function dayIndex(day: string, start: string): number {
  const a = Date.parse(`${start}T12:00:00Z`);
  const b = Date.parse(`${day}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}
