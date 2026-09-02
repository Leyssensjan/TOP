'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Detail from '@/components/Detail';
import { Header, HeaderAction, Hero, TabBar } from '@/components/Chrome';
import { ApiError, api, getKey } from '@/lib/client/store';
import { useState as useLocalState } from 'react';

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
    <main className="app">
      <Header
        title="The Form"
        right={
          /* The designed fact here — "6 of 12 slots" — is the hero repeated a
             line above it, so the slot goes to Strength, which the tab bar
             otherwise leaves with no way in. The two belong together anyway:
             Strength is what the Form cannot do. */
          <HeaderAction onClick={() => router.push('/strength')}>Strength</HeaderAction>
        }
      />

      <div className="app-content" style={{ gap: 18 }}>
        {error && <div className="banner banner-warn">{error}</div>}
        {!form && !error && <p className="eyebrow">Loading</p>}

        {form && (
          <>
            <Hero
              value={active}
              unit="of 12 slots"
              meta={
                <>
                  {levels} levels deep
                  {horizon && horizon.inSessions !== null && (
                    <span style={{ color: 'var(--amber)' }}>
                      {' · '}
                      slot {horizon.slot} in {horizon.inSessions} sessions
                    </span>
                  )}
                </>
              }
            />

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
                    <span className="num spine-num">{slot.slot}</span>
                    {/* Name and tag on one baseline. The tag is what truncates. */}
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span className="spine-name" style={{ fontSize: 16, whiteSpace: 'nowrap', flex: 'none' }}>
                        {slot.active && slot.current ? slot.current.name : slot.name}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          minWidth: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: slot.isNextToUnlock ? 'var(--amber-dim)' : 'var(--dim)',
                        }}
                      >
                        {slot.active ? slot.name : slot.isNextToUnlock ? 'unlocks next' : `unlocks ${ordinal(slot.unlockOrder)}`}
                      </span>
                    </span>
                    {slot.active ? (
                      <span className="row-value" style={{ fontSize: 22 }}>
                        {slot.currentLevel}
                        <span>/{slot.maxLevel}</span>
                      </span>
                    ) : slot.isNextToUnlock && slot.sessionsAway !== null ? (
                      <span className="row-status" style={{ color: 'var(--amber-dim)' }}>
                        {slot.sessionsAway} away
                      </span>
                    ) : (
                      <span className="row-status" style={{ color: 'var(--dimmest)' }}>
                        Locked
                      </span>
                    )}
                  </button>
                  {isOpen && (
                    <SlotDetail slot={slot} onGo={(path) => router.push(path)} onChanged={() => void load()} />
                  )}
                </div>
              );
            })}
            </div>
          </>
        )}
      </div>

      <TabBar />
    </main>
  );
}

function SlotDetail({
  slot,
  onGo,
  onChanged,
}: {
  slot: FormSlot;
  onGo: (path: string) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useLocalState(false);
  const current = slot.current;
  if (!current) return <div className="panel">No movement set for this slot.</div>;

  // Levelling only ever went up, which made a level set too high a trip back to
  // whoever set it. Correcting one is not a failure worth recording, so this
  // writes no milestone.
  const stepDown = async () => {
    setBusy(true);
    try {
      await api('/levelup', { method: 'POST', body: { slot: slot.slotId, action: 'down' } });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

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
        <>
          {slot.assisted && (
            <span style={{ display: 'block', marginBottom: 8 }}>
              Micros have lowered the bar here: {slot.sessionsNeeded} sessions instead of 8.
            </span>
          )}
          {slot.active && slot.currentLevel > 1 && (
            <button
              className="label"
              disabled={busy}
              onClick={() => void stepDown()}
              style={{ color: 'var(--muted)', padding: '6px 0' }}
            >
              Too hard · drop to level {slot.currentLevel - 1}
            </button>
          )}
        </>
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
