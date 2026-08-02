'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Detail from '@/components/Detail';
import { ApiError, api, getKey } from '@/lib/client/store';

interface LadderEntry {
  id: string;
  name: string;
  level: number | null;
  status: 'locked' | 'current' | 'mastered';
  referenceTerm: string;
}

export interface FormSlot {
  slot: number;
  slotId: number;
  name: string;
  active: boolean;
  inShortForm: boolean;
  currentLevel: number;
  maxLevel: number;
  unlockOrder: number;
  entryPosition: string;
  exitPosition: string;
  micros: Array<{ id: string; name: string; active: boolean }>;
  strengthFamilies: string[];
  assisted: boolean;
  sessionsNeeded: number;
  isNextToUnlock: boolean;
  sessionsAway: number | null;
  current: {
    id: string;
    name: string;
    level: number | null;
    cues: string;
    referenceTerm: string;
    whyBuilds: string;
    whyUnlocks: string;
    whySkate: string;
    sessionsAtLevel: number;
    lastPracticed: string | null;
  } | null;
  next: { id: string; name: string; level: number | null; cues: string } | null;
  ladder: LadderEntry[];
}

interface StatePayload {
  form: FormSlot[];
  activeSlots: number;
  horizon: { slot: number; name: string; inSessions: number | null } | null;
}

/**
 * The Form: twelve slots as one vertical thread, unbroken, because the
 * sequence is unbroken. This is the screen that shows years of progress at a
 * glance, so it stays quiet and does not animate.
 */
export default function FormPage() {
  const router = useRouter();
  const [state, setState] = useState<StatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!getKey()) {
      router.replace('/');
      return;
    }
    try {
      setState(await api<StatePayload>('/state'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/');
      else setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const form = state?.form;
  const active = form?.filter((f) => f.active).length ?? 0;
  const levels = form?.reduce((sum, f) => sum + (f.active ? f.currentLevel : 0), 0) ?? 0;
  const horizon = state?.horizon;

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">The Form</span>
        <button className="label" onClick={() => router.push('/')} style={{ padding: '8px 0 8px 16px' }}>
          Today
        </button>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}
      {!form && !error && <p className="label">Loading</p>}

      {form && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 46, color: 'var(--amber)' }}>
              {active}
            </span>
            <span style={{ color: 'var(--muted)' }}>
              of 12 slots · {levels} levels deep
              {horizon && horizon.inSessions !== null && (
                <span style={{ color: 'var(--amber)' }}> · slot {horizon.slot} in {horizon.inSessions} sessions</span>
              )}
            </span>
          </div>

          <div className="spine">
            {form.map((slot) => {
              const isOpen = open === slot.slot;
              return (
                <div key={slot.slot}>
                  <button
                    className="spine-row"
                    data-active={slot.active}
                    data-next={slot.isNextToUnlock}
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : slot.slot)}
                  >
                    <span className="spine-node mass" data-level={slot.active ? slot.currentLevel : 0} />
                    <span className="num spine-num" style={{ fontSize: 21 }}>
                      {slot.slot}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="spine-name" style={{ display: 'block' }}>
                        {slot.active && slot.current ? slot.current.name : slot.name}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          color: slot.isNextToUnlock ? 'var(--amber-dim)' : 'var(--muted)',
                        }}
                      >
                        {slot.active
                          ? slot.name
                          : slot.isNextToUnlock
                            ? `unlocks next${slot.sessionsAway !== null ? ` · ${slot.sessionsAway} sessions away` : ''}`
                            : `unlocks ${ordinal(slot.unlockOrder)}`}
                      </span>
                    </span>
                    {slot.active && (
                      <span className="num" style={{ fontSize: 21, color: 'var(--amber)' }}>
                        {slot.currentLevel}
                        <span style={{ color: 'var(--muted)', fontSize: '0.7em' }}>/{slot.maxLevel}</span>
                      </span>
                    )}
                  </button>
                  {isOpen && <SlotDetail slot={slot} onGo={(path) => router.push(path)} />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

function SlotDetail({ slot, onGo }: { slot: FormSlot; onGo: (path: string) => void }) {
  const current = slot.current;
  if (!current) return <div className="panel">No movement set for this slot.</div>;

  return (
    <Detail
      rows={[
        { label: 'Cues', value: current.cues },
        { label: 'Builds', value: current.whyBuilds },
        { label: 'Opens', value: slot.next ? `${slot.next.name}, level ${slot.next.level}` : 'Top of the ladder.' },
        {
          label: 'Micros',
          links: slot.micros.map((m) => ({ label: m.name, onClick: () => onGo('/micros') })),
        },
        {
          label: 'Strength',
          links: slot.strengthFamilies.map((f) => ({ label: f, onClick: () => onGo('/strength') })),
        },
        { label: 'Skate', value: current.whySkate },
        {
          label: 'Chain',
          value: `${slot.entryPosition} to ${slot.exitPosition}${slot.inShortForm ? ' · in the short form' : ''}`,
        },
      ]}
      footnote={
        slot.assisted ? (
          <>Micros have lowered the bar here: {slot.sessionsNeeded} sessions instead of 8.</>
        ) : null
      }
      progress={
        slot.active
          ? `${current.sessionsAtLevel} of ${slot.sessionsNeeded} sessions at this level${
              current.lastPracticed ? ` · last ${current.lastPracticed}` : ''
            }`
          : undefined
      }
      referenceTerm={current.referenceTerm}
    />
  );
}

function ordinal(n: number): string {
  if (!n) return 'later';
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
