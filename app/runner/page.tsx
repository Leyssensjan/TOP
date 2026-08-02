'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Thread, { type ThreadNode } from '@/components/Thread';
import { mmss, titleCase } from '@/lib/format';
import type { Movement, StrengthBlock } from '@/lib/rules';
import { getActive, saveActive, type ActiveSession } from '@/lib/client/store';

interface Step extends Movement {
  round: number;
  indexInRound: number;
}

const ALL_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Runs entirely from localStorage. Once this screen has loaded, the network can
 * disappear for the whole session and nothing here notices or cares.
 */
export default function RunnerPage() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveSession | null | undefined>(undefined);

  useEffect(() => {
    const found = getActive();
    if (!found) router.replace('/');
    else setActive(found);
  }, [router]);

  if (active === undefined) return <main className="screen" />;
  if (active === null) return <main className="screen" />;
  // Strength has no Form movements to walk, so it runs block by block instead.
  if (!active.plan.movements.length && active.plan.strength?.blocks.length) {
    return <StrengthRunner active={active} />;
  }
  return <Runner active={active} />;
}

/**
 * The screen stays awake. Re-requested on return, because iOS drops the lock
 * whenever the page is hidden.
 */
function useWakeLock() {
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<any> } };
        if (nav.wakeLock) lock = await nav.wakeLock.request('screen');
      } catch {
        // Denied wake lock is not worth interrupting a session over.
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release?.().catch(() => {});
    };
  }, []);
}

function Runner({ active }: { active: ActiveSession }) {
  const router = useRouter();

  const timeline = useMemo<Step[]>(() => {
    const steps: Step[] = [];
    for (let r = 0; r < Math.max(1, active.plan.rounds); r += 1) {
      active.plan.movements.forEach((m, i) => steps.push({ ...m, round: r + 1, indexInRound: i }));
    }
    return steps;
  }, [active]);

  const [index, setIndex] = useState(() => Math.min(active.step, timeline.length - 1));
  const [running, setRunning] = useState(true);
  const [remaining, setRemaining] = useState(() => (timeline[Math.min(active.step, timeline.length - 1)]?.seconds ?? 0) * 1000);
  const endAtRef = useRef(0);

  // Elapsed comes from the stored start time, not from mount, so reloading
  // mid-session does not reset the session length that gets logged.
  const elapsed = () => Date.now() - active.startedAt;

  const step = timeline[index];

  useWakeLock();

  // Timing runs off a deadline, not off a tick count, so a backgrounded phone
  // does not silently stretch the session.
  useEffect(() => {
    if (!running) return;
    endAtRef.current = Date.now() + remaining;
    const id = window.setInterval(() => {
      const left = endAtRef.current - Date.now();
      if (left <= 0) {
        window.clearInterval(id);
        advance();
      } else {
        setRemaining(left);
      }
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, index]);

  const persist = (nextIndex: number) => {
    saveActive({ ...active, step: nextIndex, elapsedMs: elapsed() });
  };

  const advance = () => {
    const next = index + 1;
    if (next >= timeline.length) {
      finish();
      return;
    }
    setIndex(next);
    setRemaining(timeline[next].seconds * 1000);
    persist(next);
  };

  const finish = () => {
    saveActive({ ...active, step: timeline.length, elapsedMs: elapsed() });
    router.replace('/close');
  };

  // Nothing to walk. Rather than a blank screen, offer the log directly.
  if (!step) return <Empty note={active.plan.note} onClose={() => router.replace('/close')} />;

  // The thread is one pass through the Form, so it fills across the round and
  // the amber tip sits on the movement being done. Rounds are counted in words.
  const nodePos = (slot: number) => ALL_SLOTS.indexOf(slot) / (ALL_SLOTS.length - 1);
  const nextMovement = active.plan.movements[step.indexInRound + 1];
  const from = nodePos(step.slot);
  const to = nextMovement ? nodePos(nextMovement.slot) : 1;
  const throughStep = step.seconds > 0 ? 1 - remaining / 1000 / step.seconds : 0;
  const progress = from + Math.max(0, Math.min(1, throughStep)) * (to - from);

  const nodes: ThreadNode[] = ALL_SLOTS.map((slot) => {
    const movement = active.plan.movements.find((m) => m.slot === slot);
    const orderInRound = active.plan.movements.findIndex((m) => m.slot === slot);
    return {
      slot,
      inPlay: Boolean(movement),
      level: movement?.level ?? 1,
      done: orderInRound >= 0 && orderInRound < step.indexInRound,
      current: slot === step.slot,
    };
  });

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">
          {titleCase(active.plan.type)}
          {active.plan.rounds > 1 && ` · round ${step.round} of ${active.plan.rounds}`}
        </span>
        <button className="label" onClick={finish} style={{ padding: '8px 0 8px 16px' }}>
          End
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 18, minHeight: 0 }}>
        <Thread nodes={nodes} progress={progress} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          <p className="label" style={{ margin: '0 0 6px' }}>
            {step.slotName} · level {step.level}
          </p>
          <h1 style={{ margin: '0 0 14px', fontSize: 'clamp(30px, 8.5vw, 44px)', lineHeight: 1.08, fontWeight: 600 }}>
            {step.name}
          </h1>
          <p style={{ margin: '0 0 28px', color: 'var(--muted)', fontSize: 17, lineHeight: 1.4 }}>{step.cues}</p>

          <button
            onClick={() => setRunning((r) => !r)}
            aria-label={running ? 'Pause' : 'Resume'}
            style={{ textAlign: 'left', padding: 0 }}
          >
            <span
              className="num"
              style={{
                fontSize: 'clamp(96px, 30vw, 140px)',
                color: running ? 'var(--amber)' : 'var(--muted)',
                display: 'block',
              }}
            >
              {mmss(remaining / 1000)}
            </span>
            {!running && (
              <span className="label" style={{ display: 'block', marginTop: 8 }}>
                Paused · tap to resume
              </span>
            )}
          </button>
        </div>
      </div>

      <button className="btn btn-primary" onClick={advance}>
        {index + 1 >= timeline.length ? 'Finish' : 'Next'}
      </button>
    </main>
  );
}

function Empty({ note, onClose }: { note: string | null; onClose: () => void }) {
  return (
    <main className="screen" style={{ justifyContent: 'center', gap: 16 }}>
      <p className="label" style={{ margin: 0 }}>
        Nothing to run
      </p>
      <p style={{ margin: 0, color: 'var(--muted)' }}>{note ?? 'This session has no steps.'}</p>
      <button className="btn btn-primary" onClick={onClose}>
        Log it
      </button>
    </main>
  );
}

/**
 * Strength walks blocks, not slots: a superset is a pair of ladders repeated for
 * rounds with a rest between, which the Form's per-movement countdown cannot
 * express. The clock here is the block's own minute band from config, and the
 * sets inside it are read off the card rather than counted for him.
 */
function StrengthRunner({ active }: { active: ActiveSession }) {
  const router = useRouter();
  const blocks = active.plan.strength!.blocks;
  const prescription = active.plan.strength!.prescription;

  const seconds = (b: StrengthBlock) => Math.max(0, b.toMinute - b.fromMinute) * 60;

  const [index, setIndex] = useState(() => Math.min(active.step, blocks.length - 1));
  const [running, setRunning] = useState(true);
  const [remaining, setRemaining] = useState(() => seconds(blocks[Math.min(active.step, blocks.length - 1)]) * 1000);
  const endAtRef = useRef(0);

  const elapsed = () => Date.now() - active.startedAt;

  useWakeLock();

  useEffect(() => {
    if (!running) return;
    endAtRef.current = Date.now() + remaining;
    const id = window.setInterval(() => {
      const left = endAtRef.current - Date.now();
      if (left <= 0) {
        window.clearInterval(id);
        advance();
      } else {
        setRemaining(left);
      }
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, index]);

  const finish = () => {
    saveActive({ ...active, step: blocks.length, elapsedMs: elapsed() });
    router.replace('/close');
  };

  const advance = () => {
    const next = index + 1;
    if (next >= blocks.length) {
      finish();
      return;
    }
    setIndex(next);
    setRemaining(seconds(blocks[next]) * 1000);
    saveActive({ ...active, step: next, elapsedMs: elapsed() });
  };

  const block = blocks[index];
  if (!block) return <Empty note={active.plan.note} onClose={() => router.replace('/close')} />;

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">
          {titleCase(active.plan.type)} · block {index + 1} of {blocks.length}
        </span>
        <button className="label" onClick={finish} style={{ padding: '8px 0 8px 16px' }}>
          End
        </button>
      </div>

      {/* One bar per block, so the shape of the session is visible at a glance. */}
      <div style={{ display: 'flex', gap: 6 }}>
        {blocks.map((b, i) => (
          <span
            key={`${b.label}-${b.fromMinute}`}
            style={{
              flex: Math.max(1, b.toMinute - b.fromMinute),
              height: 4,
              borderRadius: 2,
              background: i === index ? 'var(--amber)' : i < index ? 'var(--sage)' : 'var(--ink-line)',
            }}
          />
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
        <p className="label" style={{ margin: '0 0 6px' }}>
          {block.label} · minute {block.fromMinute} to {block.toMinute}
        </p>

        {block.movements.length ? (
          <div className="stack" style={{ margin: '0 0 14px', gap: 12 }}>
            {block.movements.map((m) => (
              <div key={m.id}>
                <p style={{ margin: 0, fontSize: 'clamp(24px, 6.5vw, 32px)', lineHeight: 1.1, fontWeight: 600 }}>
                  {m.name}
                </p>
                <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 15 }}>
                  {m.family}
                  {m.level !== null && ` · level ${m.level}`}
                  {m.cues && ` · ${m.cues}`}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <h1 style={{ margin: '0 0 14px', fontSize: 'clamp(26px, 7vw, 36px)', lineHeight: 1.1, fontWeight: 600 }}>
            {block.label}
          </h1>
        )}

        <p style={{ margin: '0 0 18px', color: 'var(--muted)', fontSize: 15, lineHeight: 1.45 }}>
          {block.movements.length > 1
            ? `${block.rounds} rounds as a superset · ${block.restSeconds}s rest`
            : block.movements.length === 1
              ? `${block.rounds} sets · ${block.restSeconds}s rest`
              : 'Run the short Form to warm up.'}
          {block.movements.length > 0 && (
            <>
              <br />
              {prescription.reps}
              <br />
              Holds: {prescription.holds} · Negatives: {prescription.negatives}
            </>
          )}
        </p>

        <button
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? 'Pause' : 'Resume'}
          style={{ textAlign: 'left', padding: 0 }}
        >
          <span
            className="num"
            style={{
              fontSize: 'clamp(72px, 22vw, 110px)',
              color: running ? 'var(--amber)' : 'var(--muted)',
              display: 'block',
            }}
          >
            {mmss(remaining / 1000)}
          </span>
          {!running && (
            <span className="label" style={{ display: 'block', marginTop: 8 }}>
              Paused · tap to resume
            </span>
          )}
        </button>
      </div>

      <button className="btn btn-primary" onClick={advance}>
        {index + 1 >= blocks.length ? 'Finish' : 'Next block'}
      </button>
    </main>
  );
}
