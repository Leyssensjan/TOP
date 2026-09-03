'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { titleCase } from '@/lib/format';
import { Cell, Cells, Header, HeaderFact, Segmented } from '@/components/Chrome';
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
    <main className="app">
      <Header
        title="Progress"
        back
        backTo="/profile"
        right={<HeaderFact>{data ? `${data.milestoneCount} milestones` : ''}</HeaderFact>}
      />

      <div className="app-content" style={{ gap: 16 }}>
        {error && <div className="banner banner-warn">{error}</div>}
        {!data && !error && <p className="eyebrow">Loading</p>}

        {data && (
          <>
            {/* Two bare numbers with tiny captions became two equal cells. */}
            <Cells columns={2}>
              <Cell value={data.totalSessions} caption="Sessions" tone="amber" />
              <Cell value={data.weeksAtTarget} caption="Weeks at target" tone="amber" />
            </Cells>

            <Segmented
              options={[
                { value: 'All', label: 'All' },
                { value: 'Milestones', label: 'Milestones' },
                { value: 'Sessions', label: 'Sessions' },
              ]}
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
            />

          {shown.length === 0 ? (
            /* The empty state fills the height it is given and offers the one
               action that ends it, rather than sitting as a grey line under a
               screen of nothing. */
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: 14,
              }}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: '2px solid var(--card-line)',
                }}
              />
              <span style={{ fontSize: 17, fontWeight: 600 }}>Nothing logged yet</span>
              <span style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 260 }}>
                Milestones land here as they happen: levels, slots, rounds, tricks.
              </span>
              <button
                className="btn btn-inline btn-amber-outline"
                style={{ width: 'auto', padding: '12px 20px' }}
                onClick={() => router.push('/')}
              >
                Start today&rsquo;s Flow
              </button>
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
      </div>
    </main>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function short(date: string): string {
  const [, m, d] = date.split('-');
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} ${Number(d)}` : date;
}
