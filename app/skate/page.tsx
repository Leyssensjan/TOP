'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Detail from '@/components/Detail';
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
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">Skate</span>
        <button className="label" onClick={() => router.push('/')} style={{ padding: '8px 0 8px 16px' }}>
          Today
        </button>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}
      {!data && !error && <p className="label">Loading</p>}

      {data && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="num" style={{ fontSize: 40, color: 'var(--sage)' }}>
              {data.counts.mastered}
            </span>
            <span style={{ color: 'var(--muted)' }}>
              mastered · {data.counts.current} in progress · {data.counts.total} tricks
            </span>
          </div>

          {firstRun && (
            <div className="banner" style={{ color: 'var(--text)' }}>
              <p style={{ margin: '0 0 8px' }}>Everything starts locked.</p>
              <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 15 }}>
                Go through the first {SKATE_FIRST_RUN_TIERS} tiers and tap anything you can already do until it
                reads mastered. Skip it and set them later if you would rather.
              </p>
              <button className="btn" onClick={endFirstRun}>
                Done, show everything
              </button>
            </div>
          )}

          {!firstRun && data.focus.length > 0 && (
            <div className="banner" style={{ color: 'var(--text)' }}>
              <p className="label" style={{ margin: '0 0 10px' }}>
                Session focus
              </p>
              {data.focus.map((f) => (
                <p key={f.id} style={{ margin: '0 0 6px', fontSize: 15 }}>
                  {f.name}
                  <span style={{ color: 'var(--muted)' }}> · {f.reason}</span>
                </p>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {levels.map((l) => (
              <button
                key={l}
                className="btn"
                aria-pressed={level === l}
                style={{ width: 'auto', flex: 'none', padding: '10px 16px', minHeight: 44 }}
                onClick={() => setLevel(l)}
              >
                <span className="num" style={{ fontSize: 18 }}>
                  {l}
                </span>
              </button>
            ))}
          </div>

          <div className="stack">
            {shown.map((trick) => (
              <div key={trick.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    borderRadius: 12,
                    background: 'var(--ink-raised)',
                    border: `1px solid ${trick.unlockable && trick.status === 'locked' ? 'var(--amber-dim)' : 'var(--ink-line)'}`,
                  }}
                >
                  {/* Tapping the name opens the detail; tapping the status
                      cycles it. Two targets, so neither is accidental. */}
                  <button
                    onClick={() => setOpen(open === trick.id ? null : trick.id)}
                    aria-expanded={open === trick.id}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '14px 0 14px 16px', minHeight: 'var(--tap)' }}
                  >
                    <span style={{ display: 'block', color: trick.status === 'locked' ? 'var(--muted)' : 'var(--text)' }}>
                      {trick.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>{trick.family}</span>
                  </button>
                  <button
                    className="label"
                    disabled={busy === trick.id}
                    onClick={() => void cycle(trick)}
                    style={{ color: COLOUR[trick.status], flex: 'none', padding: '18px 16px' }}
                  >
                    {trick.status}
                  </button>
                </div>

                {open === trick.id && (
                  <Detail
                    rows={[
                      { label: 'Mechanics', value: trick.mechanics.join(' ') },
                      // The drills are what turns a trick name into something
                      // you can actually go and do at the park.
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
            ))}
          </div>

          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 'auto' }}>
            Tap the status to move a trick on: locked, in progress, mastered. An amber edge means every
            prerequisite is mastered.
          </p>
        </>
      )}
    </main>
  );
}
