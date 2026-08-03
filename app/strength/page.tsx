'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Detail from '@/components/Detail';
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
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">Strength</span>
        <button className="label" onClick={() => router.push('/')} style={{ padding: '8px 0 8px 16px' }}>
          Today
        </button>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}
      {!ladders && !error && <p className="label">Loading</p>}

      {ladders && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="num" style={{ fontSize: 46, color: 'var(--amber)' }}>
              {ladders.length}
            </span>
            <span style={{ color: 'var(--muted)' }}>ladders · {levels} levels deep</span>
          </div>

          <div className="stack">
            {ladders.map((l) => {
              const isOpen = open === l.family;
              return (
                <div key={l.family}>
                  <button
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : l.family)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: 'var(--ink-raised)',
                      border: '1px solid var(--ink-line)',
                      minHeight: 'var(--tap)',
                    }}
                  >
                    <span className="mass" data-level={l.currentLevel} style={{ width: 11, height: 11, flex: 'none' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block' }}>{l.current?.name ?? l.family}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>
                        {l.family}
                        {l.servesName && ` · serves ${l.servesName}`}
                      </span>
                    </span>
                    <span className="num" style={{ fontSize: 21, color: 'var(--amber)' }}>
                      {l.currentLevel}
                      <span style={{ color: 'var(--muted)', fontSize: '0.7em' }}>/{l.maxLevel}</span>
                    </span>
                  </button>

                  {/* The justification for the whole domain, where it will be
                      read on the morning the session is about to be skipped. */}
                  {l.note && (
                    <p style={{ margin: '6px 0 0 16px', color: 'var(--amber)', fontSize: 15 }}>{l.note}</p>
                  )}

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
        </>
      )}
    </main>
  );
}
