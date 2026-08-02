'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { titleCase } from '@/lib/format';
import { ApiError, api, getKey } from '@/lib/client/store';

type Entry =
  | {
      id: string;
      date: string;
      type: 'milestone';
      kind: string;
      subject: string;
      detail: string;
    }
  | {
      id: string;
      date: string;
      type: 'session';
      sessionType: string;
      minutes: number | null;
      difficulty: string | null;
      soreness: string;
      distanceKm: number | null;
    };

interface ProgressPayload {
  totalSessions: number;
  weeksAtTarget: number;
  milestoneCount: number;
  entries: Entry[];
}

type Filter = 'All' | 'Milestones' | 'Sessions';

/**
 * The log. Not a dashboard: no charts, no rings, no percentages. Milestones and
 * sessions sit on the same vertical line so that scrolling back through a year
 * reads as a record with events in it.
 */
export default function ProgressPage() {
  const router = useRouter();
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('All');

  const load = useCallback(async () => {
    if (!getKey()) {
      router.replace('/');
      return;
    }
    try {
      setData(await api<ProgressPayload>('/progress'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/');
      else setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown =
    data?.entries.filter((e) =>
      filter === 'All' ? true : filter === 'Milestones' ? e.type === 'milestone' : e.type === 'session',
    ) ?? [];

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">Progress</span>
        <button className="label" onClick={() => router.push('/')} style={{ padding: '8px 0 8px 16px' }}>
          Today
        </button>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}
      {!data && !error && <p className="label">Loading</p>}

      {data && (
        <>
          {/* The two numbers that matter. Nothing else above the log. */}
          <div style={{ display: 'flex', gap: 28 }}>
            <div>
              <span className="num" style={{ fontSize: 52, color: 'var(--amber)', display: 'block' }}>
                {data.totalSessions}
              </span>
              <span className="label">sessions</span>
            </div>
            <div>
              <span className="num" style={{ fontSize: 52, color: 'var(--amber)', display: 'block' }}>
                {data.weeksAtTarget}
              </span>
              <span className="label">weeks at target</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['All', 'Milestones', 'Sessions'] as const).map((f) => (
              <button
                key={f}
                className="btn btn-quiet"
                aria-pressed={filter === f}
                style={{ width: 'auto', flex: 'none', padding: '10px 16px', minHeight: 44, fontSize: 15 }}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="banner">
              Nothing logged yet. Milestones land here as they happen: levels, slots, rounds, tricks.
            </div>
          ) : (
            <div className="spine">
              {shown.map((entry) =>
                entry.type === 'milestone' ? (
                  <div className="spine-row" key={entry.id} style={{ alignItems: 'flex-start' }}>
                    <span className="spine-node" style={{ background: 'var(--amber)', borderColor: 'var(--amber)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 17 }}>{entry.subject}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--amber-dim)' }}>{entry.kind}</span>
                      <span style={{ display: 'block', fontSize: 14, color: 'var(--muted)', marginTop: 2 }}>
                        {entry.detail}
                      </span>
                    </span>
                    <span className="num" style={{ fontSize: 14, color: 'var(--muted)', flex: 'none' }}>
                      {short(entry.date)}
                    </span>
                  </div>
                ) : (
                  <div className="spine-row" key={entry.id}>
                    <span
                      className="spine-node"
                      style={{ width: 6, height: 6, marginTop: -3, left: -21.5, borderWidth: 0, background: 'var(--ink-line)' }}
                    />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: 'var(--muted)' }}>
                      {short(entry.date)} · {titleCase(entry.sessionType)}
                      {entry.minutes !== null && ` · ${entry.minutes} min`}
                      {entry.distanceKm !== null && ` · ${entry.distanceKm} km`}
                      {entry.difficulty && ` · ${entry.difficulty}`}
                      {/* Soreness sits on the session line on purpose: a run of
                          wrist entries next to the weeks a slot was drilled is
                          the only place that pattern will ever be visible. */}
                      {entry.soreness && ` · sore ${entry.soreness}`}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function short(date: string): string {
  const [, m, d] = date.split('-');
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} ${Number(d)}` : date;
}
