'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header, HeaderFact, Hero } from '@/components/Chrome';
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
  const [weekStart, setWeekStart] = useState<string | null>(null);
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
      setWeekStart(state.weekStart);
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

  const logged = micros?.reduce((sum, m) => sum + m.count + (pendingTaps[m.name] ?? 0), 0) ?? 0;
  const target = micros?.reduce((sum, m) => sum + (m.weeklyTarget ?? 0), 0) ?? 0;

  return (
    <main className="app">
      <Header title="Micros" back right={<HeaderFact>{weekLabel(weekStart)}</HeaderFact>} />

      <div className="app-content" style={{ gap: 18 }}>
        {error && <div className="banner banner-warn">{error}</div>}
        {micros === null && !error && <p className="eyebrow">Loading</p>}
        {micros?.length === 0 && (
          <div className="note">No micros are active. The weekly plan picks them.</div>
        )}

        {micros !== null && micros.length > 0 && (
          <Hero value={logged} unit={`of ${target}`} meta="logged this week" />
        )}

        <div className="stack" style={{ gap: 8 }}>
          {micros?.map((row) => {
            const pending = pendingTaps[row.name] ?? 0;
            const shown = row.count + pending;
            const target = row.weeklyTarget ?? 0;
            const met = target > 0 && shown >= target;
            return (
              <button
                key={row.id}
                className="row"
                onClick={() => tap(row)}
                style={{ gridTemplateColumns: '1fr 60px', minHeight: 76 }}
              >
                <span className="row-body">
                  <span className="row-title" style={{ fontSize: 17 }}>
                    {row.name}
                  </span>
                  <span className="row-sub">{row.trigger}</span>
                  {/* What it feeds, which is the reason to do it at all. */}
                  {row.feedsName && (
                    <span
                      style={{
                        marginTop: 2,
                        fontSize: 12,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        color: row.assisting ? 'var(--sage)' : 'var(--dim)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      Feeds {row.feedsName}
                      {row.assisting && ' · assisting'}
                    </span>
                  )}
                </span>
                <span className="row-value" style={{ fontSize: 30, color: met ? 'var(--sage)' : undefined }}>
                  {shown}
                  <span>/{target || '-'}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="pinned" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="note">
            Tap to log one, tap again for several. Micros never count as sessions. The set is chosen
            when the week is generated and holds until the next one starts.
          </div>
          {/* The handoff puts "Swap this week's set" here. Nothing swaps a set
              on demand — the rotation is what the week generation decides — so
              the button goes where that decision is actually made. */}
          <button className="btn btn-secondary" onClick={() => router.push('/week')}>
            Plan the week
          </button>
        </div>
      </div>
    </main>
  );
}

/** "Week 36", from the Monday the set belongs to. */
function weekLabel(weekStart: string | null): string {
  if (!weekStart) return '';
  const d = new Date(`${weekStart}T12:00:00Z`);
  const firstJan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((d.getTime() - firstJan.getTime()) / 86400000);
  return `Week ${Math.floor(days / 7) + 1}`;
}
