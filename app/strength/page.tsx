'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Detail from '@/components/Detail';
import { Header, HeaderFact, Hero } from '@/components/Chrome';
import { ApiError, api, getKey } from '@/lib/client/store';

interface Ladder {
  family: string;
  serves: number | null;
  servesName: string | null;
  /** Set when the ladder serves nothing in the Form, which is the point of it. */
  note: string;
  currentLevel: number;
  maxLevel: number;
  unit: 'reps' | 'seconds';
  levelUpTarget: number;
  current: {
    id: string;
    name: string;
    level: number | null;
    cues: string;
    referenceTerm: string;
    whyBuilds: string;
    whyUnlocks: string;
    whySkate: string;
    lastPracticed: string | null;
  } | null;
  next: { id: string; name: string; level: number | null } | null;
  ladder: Array<{ id: string; name: string; level: number | null; status: string }>;
}

/**
 * The five ladders, in the same shape as the Form screen. Twenty-one why-cards
 * were written into Notion and had no screen to be read on until now.
 */
export default function StrengthPage() {
  const router = useRouter();
  const [ladders, setLadders] = useState<Ladder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Same correction as the Form: a ladder set too high has to be reversible.
  const stepDown = async (family: string) => {
    setBusy(true);
    try {
      await api('/levelup', { method: 'POST', body: { family, action: 'down' } });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    if (!getKey()) {
      router.replace('/');
      return;
    }
    try {
      const state = await api<{ strength: Ladder[] }>('/state');
      setLadders(state.strength);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/');
      else setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const levels = ladders?.reduce((sum, l) => sum + l.currentLevel, 0) ?? 0;

  return (
    <main className="app">
      <Header title="Strength" back backTo="/form" right={<HeaderFact>{ladders?.length ?? 5} ladders</HeaderFact>} />

      <div className="app-content" style={{ gap: 16 }}>
        {error && <div className="banner banner-warn">{error}</div>}
        {!ladders && !error && <p className="eyebrow">Loading</p>}

        {ladders && (
          <>
            <Hero value={ladders.length} unit="ladders" meta={`${levels} levels deep`} />

            <div className="stack" style={{ gap: 8 }}>
            {ladders.map((l) => {
              const isOpen = open === l.family;
              return (
                <div key={l.family}>
                  <button
                    className="row"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : l.family)}
                    style={{ gridTemplateColumns: '11px 1fr 56px' }}
                  >
                    <span className="mass" data-level={l.currentLevel} style={{ width: 11, height: 11, flex: 'none' }} />
                    <span className="row-body">
                      <span className="row-title">{l.current?.name ?? l.family}</span>
                      {/* The justification for the whole domain lives inside
                          the row it belongs to. Loose between two cards it broke
                          the list's rhythm and read as a stray warning. */}
                      <span className="row-sub" style={{ color: l.note ? 'var(--amber-dim)' : undefined }}>
                        {l.note
                          ? l.note
                          : `${l.family}${l.servesName ? ` · serves ${l.servesName}` : ''}`}
                      </span>
                    </span>
                    <span className="row-value" style={{ fontSize: 22 }}>
                      {l.currentLevel}
                      <span>/{l.maxLevel}</span>
                    </span>
                  </button>

                  {isOpen && l.current && (
                    <Detail
                      rows={[
                        { label: 'Cues', value: l.current.cues },
                        { label: 'Builds', value: l.current.whyBuilds },
                        { label: 'Opens', value: l.next ? `${l.next.name}, level ${l.next.level}` : 'Top of the ladder.' },
                        {
                          label: 'Serves',
                          links: l.servesName
                            ? [{ label: l.servesName, onClick: () => router.push('/form') }]
                            : undefined,
                          value: l.servesName ? undefined : '',
                        },
                        { label: 'Skate', value: l.current.whySkate },
                      ]}
                      footnote={
                        l.currentLevel > 1 ? (
                          <button
                            className="label"
                            disabled={busy}
                            onClick={() => void stepDown(l.family)}
                            style={{ color: 'var(--muted)', padding: '6px 0' }}
                          >
                            Too hard · drop to level {l.currentLevel - 1}
                          </button>
                        ) : null
                      }
                      progress={`Levels up at 3 sets of ${l.levelUpTarget}${l.unit === 'seconds' ? ' seconds' : ''}${
                        l.current.lastPracticed ? ` · last ${l.current.lastPracticed}` : ''
                      }`}
                      referenceTerm={l.current.referenceTerm}
                    />
                  )}
                </div>
              );
            })}
            </div>

            <div className="pinned" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="note note-warn">
                <span className="eyebrow eyebrow-action" style={{ display: 'block', marginBottom: 4 }}>
                  Unsolved
                </span>
                Rabotpark is outdoors and works April to October. November to March has no indoor
                fallback written yet, and the pull ladder is the one that cannot move without it.
              </div>
              <button className="btn btn-secondary" onClick={() => router.push('/')}>
                Log a strength day
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
