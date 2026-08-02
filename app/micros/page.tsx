'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, enqueue, getKey, sync } from '@/lib/client/store';

interface MicroRow {
  id: string;
  name: string;
  trigger: string;
  cue: string;
  duration: string;
  feedsSlot: number | null;
  feedsName: string | null;
  /** The assist rule is live for this micro's slot. */
  assisting: boolean;
  weeklyTarget: number | null;
  count: number;
}

interface StatePayload {
  weekStart: string;
  micros: MicroRow[];
}

/** Taps inside this window collapse into a single row with a count. */
const COALESCE_MS = 1200;

export default function MicrosPage() {
  const router = useRouter();
  const [micros, setMicros] = useState<MicroRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingTaps, setPendingTaps] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!getKey()) {
      router.replace('/');
      return;
    }
    try {
      const state = await api<StatePayload>('/state');
      setMicros(state.micros);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/');
      else setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    void sync();
    void load();
  }, [load]);

  // Flush a micro's accumulated taps as one write.
  const flush = useCallback((name: string) => {
    setPendingTaps((prev) => {
      const count = prev[name] ?? 0;
      if (count > 0) {
        enqueue('/micro', { name, count });
        void sync().then(() => void load());
      }
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, [load]);

  const tap = (row: MicroRow) => {
    setPendingTaps((prev) => ({ ...prev, [row.name]: (prev[row.name] ?? 0) + 1 }));
    window.clearTimeout(timers.current[row.name]);
    timers.current[row.name] = window.setTimeout(() => flush(row.name), COALESCE_MS);
  };

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <main className="screen" style={{ gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">Micros</span>
        <button className="label" onClick={() => router.push('/')} style={{ padding: '8px 0 8px 16px' }}>
          Today
        </button>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}
      {micros === null && !error && <p className="label">Loading</p>}
      {micros?.length === 0 && (
        <div className="banner">No micros are active. The weekly plan picks them.</div>
      )}

      <div className="stack">
        {micros?.map((row) => {
          const pending = pendingTaps[row.name] ?? 0;
          const shown = row.count + pending;
          const target = row.weeklyTarget ?? 0;
          const met = target > 0 && shown >= target;
          return (
            <button
              key={row.id}
              onClick={() => tap(row)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                textAlign: 'left',
                padding: '16px 18px',
                borderRadius: 14,
                background: 'var(--ink-raised)',
                border: '1px solid var(--ink-line)',
                minHeight: 'var(--tap)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, marginBottom: 3 }}>{row.name}</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>{row.trigger}</div>
                {/* What it feeds, which is the reason to do it at all. */}
                {row.feedsName && (
                  <div
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push('/form');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        router.push('/form');
                      }
                    }}
                    style={{
                      fontSize: 14,
                      marginTop: 3,
                      color: row.assisting ? 'var(--sage)' : 'var(--muted)',
                    }}
                  >
                    feeds {row.feedsName}
                    {row.assisting && ' · assisting'}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <span
                  className="num"
                  style={{ fontSize: 32, color: met ? 'var(--sage)' : 'var(--amber)' }}
                >
                  {shown}
                </span>
                <span className="num" style={{ fontSize: 19, color: 'var(--muted)' }}>
                  /{target || '-'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 'auto' }}>
        Tap to log one. Tap again for several. Micros never count as sessions.
      </p>
    </main>
  );
}
