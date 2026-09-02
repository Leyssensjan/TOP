'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Detail from '@/components/Detail';
import { Cell, Cells, Header, HeaderAction, Segmented, TabBar } from '@/components/Chrome';
import { ApiError, api, getKey } from '@/lib/client/store';
import { SKATE_FIRST_RUN_TIERS } from '@/lib/config';

const FIRST_RUN_KEY = 'fq.skateFirstRun';

type Status = 'locked' | 'current' | 'mastered';

interface Trick {
  id: string;
  skillId: string;
  name: string;
  family: string;
  level: number;
  status: Status;
  prereqs: string[];
  attempts: number;
  lastPracticed: string | null;
  unlockable: boolean;
  whySkate: string;
  builtBy: { slots: string[]; families: string[] };
  mechanics: string[];
  drills: string[];
  gate: string;
  terrain: string[];
  risk: number;
}

interface FocusTrick {
  id: string;
  name: string;
  level: number | null;
  reason: string;
  lastPracticed: string | null;
}

interface SkatePayload {
  focus: FocusTrick[];
  counts: { total: number; locked: number; current: number; mastered: number };
  tricks: Trick[];
}

/** locked -> current -> mastered -> locked. One tap moves one step. */
const NEXT: Record<Status, Status> = { locked: 'current', current: 'mastered', mastered: 'locked' };
const COLOUR: Record<Status, string> = {
  locked: 'var(--muted)',
  current: 'var(--amber)',
  mastered: 'var(--sage)',
};

export default function SkatePage() {
  const router = useRouter();
  const [data, setData] = useState<SkatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [firstRun, setFirstRun] = useState(false);

  const load = useCallback(async () => {
    if (!getKey()) {
      router.replace('/');
      return;
    }
    try {
      const res = await api<SkatePayload>('/skate');
      setData(res);
      // Offered once, on a graph that is still entirely locked. After that the
      // tracker behaves normally and any trick can still be set by hand.
      const seen = typeof window !== 'undefined' && window.localStorage.getItem(FIRST_RUN_KEY) === 'done';
      setFirstRun(!seen && res.counts.mastered === 0 && res.counts.current === 0);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/');
      else setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const levels = useMemo(
    () =>
      [...new Set(data?.tricks.map((t) => t.level) ?? [])]
        .filter((l) => !firstRun || l < SKATE_FIRST_RUN_TIERS)
        .sort((a, b) => a - b),
    [data, firstRun],
  );
  const shown = data?.tricks.filter((t) => t.level === level) ?? [];

  const endFirstRun = () => {
    try {
      window.localStorage.setItem(FIRST_RUN_KEY, 'done');
    } catch {
      // A blocked localStorage only means the offer appears again.
    }
    setFirstRun(false);
  };

  const cycle = async (trick: Trick) => {
    const next = NEXT[trick.status];
    setBusy(trick.id);
    // Optimistic, because 190 rows is too much to refetch on every tap.
    setData((prev) =>
      prev
        ? {
            ...prev,
            tricks: prev.tricks.map((t) => (t.id === trick.id ? { ...t, status: next } : t)),
            counts: {
              ...prev.counts,
              [trick.status]: prev.counts[trick.status] - 1,
              [next]: prev.counts[next] + 1,
            },
          }
        : prev,
    );
    try {
      const res = await api<{ focus: FocusTrick[]; counts: SkatePayload['counts']; unlockable: string[] }>(
        '/trick',
        { method: 'POST', body: { id: trick.id, status: next } },
      );
      setData((prev) =>
        prev
          ? {
              ...prev,
              focus: res.focus,
              counts: res.counts,
              tricks: prev.tricks.map((t) => ({ ...t, unlockable: res.unlockable.includes(t.id) })),
            }
          : prev,
      );
    } catch {
      void load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="app">
      <Header
        title="Skate"
        right={<HeaderAction onClick={() => router.push('/')}>Session</HeaderAction>}
      />

      <div className="app-content" style={{ gap: 16 }}>
        {error && <div className="banner banner-warn">{error}</div>}
        {!data && !error && <p className="eyebrow">Loading</p>}

        {data && (
          <>
            {/* Three numbers strung along one line became three equal cells, so
                the counts read against each other rather than as a sentence. */}
            <Cells columns={3}>
              <Cell value={data.counts.mastered} caption="Mastered" tone="sage" />
              <Cell value={data.counts.current} caption="In progress" tone="amber" />
              <Cell value={data.counts.total} caption="Tricks" tone="text" />
            </Cells>

            {firstRun && (
              <div className="note" style={{ color: 'var(--text)' }}>
                <p style={{ margin: '0 0 8px' }}>Everything starts locked.</p>
                <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 14 }}>
                  Go through the first {SKATE_FIRST_RUN_TIERS} tiers and tap anything you can already do until
                  it reads mastered. Skip it and set them later if you would rather.
                </p>
                <div className="pair">
                  <button className="btn btn-inline" onClick={endFirstRun}>
                    Later
                  </button>
                  <button className="btn btn-inline btn-amber-outline" onClick={endFirstRun}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {!firstRun && data.focus.length > 0 && (
              <div className="note" style={{ color: 'var(--text)' }}>
                <p className="eyebrow" style={{ margin: '0 0 8px' }}>
                  Session focus
                </p>
                {data.focus.map((f) => (
                  <p key={f.id} style={{ margin: '0 0 4px', fontSize: 15 }}>
                    {f.name}
                    <span style={{ color: 'var(--muted)' }}> · {f.reason}</span>
                  </p>
                ))}
              </div>
            )}

            {/* The tier picker was three small pills adrift on the left. It is
                the full width now, so it reads as a choice over the list it
                filters rather than as decoration above it. */}
            {levels.length > 0 && (
              <Segmented
                options={levels.map((l) => ({ value: String(l), label: `Tier ${l}` }))}
                value={String(level)}
                onChange={(v) => setLevel(Number(v))}
              />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflowY: 'auto' }}>
              {shown.map((trick) => {
                const open_ = open === trick.id;
                const ready = trick.unlockable && trick.status === 'locked';
                return (
                  <div key={trick.id}>
                    <div
                      className={`row row-dense${ready ? ' row-live' : ''}`}
                      style={{ gridTemplateColumns: '1fr 96px', padding: 0 }}
                    >
                      {/* Tapping the name opens the detail; tapping the status
                          cycles it. Two targets, so neither is accidental. */}
                      <button
                        onClick={() => setOpen(open_ ? null : trick.id)}
                        aria-expanded={open_}
                        style={{ minWidth: 0, textAlign: 'left', padding: '10px 0 10px 16px', minHeight: 58 }}
                      >
                        <span
                          className="row-title"
                          style={{ display: 'block', color: trick.status === 'locked' ? 'var(--muted)' : 'var(--text)' }}
                        >
                          {trick.name}
                        </span>
                        <span className="row-sub" style={{ display: 'block' }}>
                          {trick.family}
                        </span>
                      </button>
                      <button
                        className="row-status"
                        disabled={busy === trick.id}
                        onClick={() => void cycle(trick)}
                        style={{
                          color: ready ? 'var(--amber)' : COLOUR[trick.status],
                          padding: '10px 16px 10px 0',
                          minHeight: 58,
                          justifyContent: 'flex-end',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {ready ? 'Start' : trick.status}
                      </button>
                    </div>

                    {open_ && (
                      <Detail
                        rows={[
                          { label: 'Mechanics', value: trick.mechanics.join(' ') },
                          // The drills are what turns a trick name into
                          // something you can go and do at the park.
                          { label: 'Drills', value: trick.drills.join(' · ') },
                          { label: 'Gate', value: trick.gate },
                          { label: 'Terrain', value: trick.terrain.join(', ') },
                          { label: 'Skate', value: trick.whySkate },
                          {
                            label: 'Built by',
                            links: [
                              ...trick.builtBy.slots.map((name) => ({ label: name, onClick: () => router.push('/form') })),
                              ...trick.builtBy.families.map((f) => ({ label: f, onClick: () => router.push('/strength') })),
                            ],
                          },
                          { label: 'Needs', value: trick.prereqs.join(', ') },
                        ]}
                        progress={`Level ${trick.level} · risk ${trick.risk} of 10${
                          trick.attempts ? ` · ${trick.attempts} attempts` : ''
                        }${trick.lastPracticed ? ` · last ${trick.lastPracticed}` : ''}`}
                        referenceTerm={trick.name}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <p className="pinned" style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Tap the status to move a trick on. An amber edge means every prerequisite is mastered.
            </p>
          </>
        )}
      </div>

      <TabBar />
    </main>
  );
}
