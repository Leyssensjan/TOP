'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, getKey } from '@/lib/client/store';
import { LEVELUP_MIN_SESSIONS } from '@/lib/config';

interface LadderEntry {
  id: string;
  name: string;
  level: number | null;
  status: 'locked' | 'current' | 'mastered';
  referenceTerm: string;
}

interface FormSlot {
  slot: number;
  name: string;
  active: boolean;
  inShortForm: boolean;
  currentLevel: number;
  maxLevel: number;
  unlockOrder: number;
  entryPosition: string;
  exitPosition: string;
  current: {
    id: string;
    name: string;
    level: number | null;
    cues: string;
    referenceTerm: string;
    whyBuilds: string;
    whyUnlocks: string;
    sessionsAtLevel: number;
    lastPracticed: string | null;
  } | null;
  next: { id: string; name: string; level: number | null; cues: string } | null;
  ladder: LadderEntry[];
}

interface StatePayload {
  form: FormSlot[];
  activeSlots: number;
}

/**
 * The Form: twelve slots as one vertical thread, unbroken, because the
 * sequence is unbroken. This is the screen that shows years of progress at a
 * glance, so it stays quiet and does not animate.
 */
export default function FormPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!getKey()) {
      router.replace('/');
      return;
    }
    try {
      const state = await api<StatePayload>('/state');
      setForm(state.form);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/');
      else setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = form?.filter((f) => f.active).length ?? 0;
  const levels = form?.reduce((sum, f) => sum + (f.active ? f.currentLevel : 0), 0) ?? 0;

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
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="num" style={{ fontSize: 46, color: 'var(--amber)' }}>
              {active}
            </span>
            <span style={{ color: 'var(--muted)' }}>of 12 slots · {levels} levels deep</span>
          </div>

          <div className="spine">
            {form.map((slot) => {
              const isOpen = open === slot.slot;
              return (
                <div key={slot.slot}>
                  <button
                    className="spine-row"
                    data-active={slot.active}
                    aria-expanded={isOpen}
                    style={{ ['--level' as string]: slot.currentLevel }}
                    onClick={() => setOpen(isOpen ? null : slot.slot)}
                  >
                    <span className="spine-node" />
                    <span className="num spine-num" style={{ fontSize: 21 }}>
                      {slot.slot}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="spine-name" style={{ display: 'block' }}>
                        {slot.active && slot.current ? slot.current.name : slot.name}
                      </span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>
                        {slot.active ? slot.name : `unlocks ${ordinal(slot.unlockOrder)}`}
                      </span>
                    </span>
                    {slot.active && (
                      <span className="num" style={{ fontSize: 21, color: 'var(--amber)' }}>
                        {slot.currentLevel}
                        <span style={{ color: 'var(--muted)', fontSize: '0.7em' }}>/{slot.maxLevel}</span>
                      </span>
                    )}
                  </button>
                  {isOpen && <Detail slot={slot} />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

function Detail({ slot }: { slot: FormSlot }) {
  const current = slot.current;
  return (
    <div className="detail">
      {current ? (
        <>
          {current.cues && <p style={{ color: 'var(--text)' }}>{current.cues}</p>}
          {current.whyBuilds && (
            <p>
              <strong>Builds</strong> {current.whyBuilds}
            </p>
          )}
          {current.whyUnlocks && (
            <p>
              <strong>Unlocks</strong> {current.whyUnlocks}
            </p>
          )}
          {current.referenceTerm && (
            <p>
              <strong>Look up</strong> {current.referenceTerm}
            </p>
          )}
          <p>
            {slot.entryPosition} to {slot.exitPosition}
            {slot.inShortForm && ' · in the short form'}
          </p>
          {slot.active && (
            <p>
              {current.sessionsAtLevel} of {LEVELUP_MIN_SESSIONS} sessions at this level
              {current.lastPracticed && ` · last ${current.lastPracticed}`}
            </p>
          )}
          {slot.next ? (
            <p>
              <strong>Next</strong> {slot.next.name} at level {slot.next.level}
            </p>
          ) : (
            <p>Top of the ladder.</p>
          )}
        </>
      ) : (
        <p>No movement set for this slot.</p>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  if (!n) return 'later';
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
