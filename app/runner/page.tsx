'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Thread, { type ThreadNode } from '@/components/Thread';
import { mmss, titleCase } from '@/lib/format';
import type { Movement, SkateBlock, SkateTrickCard, StrengthBlock } from '@/lib/rules';
import { getActive, saveActive, type ActiveSession, type LoggedSet, type LoggedTrick } from '@/lib/client/store';
import { SKATE_SESSION, SOUND, STRENGTH } from '@/lib/config';
import { cue, isMuted, setMuted, unlockSound } from '@/lib/client/sound';

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
  // Skate walks blocks like Strength: rust, projects, one stretch, switch work.
  if (!active.plan.movements.length && active.plan.skate?.blocks.length) {
    return <SkateRunner active={active} />;
  }
  // Engine has no prescribed steps at all: a stopwatch and the routes.
  if (!active.plan.movements.length && (active.plan.type === 'engine' || active.plan.type === 'skate')) {
    return <OpenRunner active={active} />;
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

/** Sound is on by default and switched off from the Runner header. */
function SoundToggle() {
  const [muted, setLocal] = useState(false);
  useEffect(() => setLocal(isMuted()), []);
  return (
    <button
      className="label"
      aria-pressed={!muted}
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setLocal(next);
        if (!next) cue('next');
      }}
      style={{ padding: '8px 12px', color: muted ? 'var(--muted)' : 'var(--amber)' }}
    >
      {muted ? 'Sound off' : 'Sound on'}
    </button>
  );
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
  // One warning per movement, so pausing and resuming does not re-tick.
  const warnedRef = useRef(-1);

  // Elapsed comes from the stored start time, not from mount, so reloading
  // mid-session does not reset the session length that gets logged.
  const elapsed = () => Date.now() - active.startedAt;

  const step = timeline[index];

  useWakeLock();

  // Audio is unlocked by the Start tap on Today, which is a gesture this screen
  // never sees when a session is resumed or the phone reloads mid-Flow. The
  // first touch here stands in for it, so a recovered session is not a silent
  // one.
  useEffect(() => {
    const once = () => {
      unlockSound();
      window.removeEventListener('pointerdown', once);
    };
    window.addEventListener('pointerdown', once);
    return () => window.removeEventListener('pointerdown', once);
  }, []);

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
        // A cue three seconds out, so the change is not a surprise.
        if (left <= SOUND.warnSeconds * 1000 && warnedRef.current !== index) {
          warnedRef.current = index;
          cue('warn');
        }
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
    // A different cue for coming back to the top of the Form, because a round
    // boundary is worth noticing and a movement boundary is not.
    cue(timeline[next].round !== timeline[index].round ? 'round' : 'next');
    setIndex(next);
    setRemaining(timeline[next].seconds * 1000);
    persist(next);
  };

  const finish = () => {
    cue('done');
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
      active: active.plan.activeSlotIds?.includes(slot) ?? Boolean(movement),
      level: movement?.level ?? 1,
      done: orderInRound >= 0 && orderInRound < step.indexInRound,
      current: slot === step.slot,
    };
  });

  return (
    <main className="app">
      <header className="app-header">
        <span className="eyebrow">
          {titleCase(active.plan.type)}
          {active.plan.rounds > 1 && ` · round ${step.round}/${active.plan.rounds}`}
        </span>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <SoundToggle />
          <button className="eyebrow eyebrow-action" onClick={finish} style={{ padding: '10px 0 10px 12px' }}>
            End
          </button>
        </span>
      </header>

      {/* One segment per movement in a round, filled as the round is walked.
          The round used to be a phrase in the header and nothing else. */}
      {active.plan.movements.length > 1 && (
        <div
          style={{
            flex: 'none',
            display: 'grid',
            gridTemplateColumns: `repeat(${active.plan.movements.length}, 1fr)`,
            gap: 4,
            padding: '10px var(--pad) 0',
          }}
        >
          {active.plan.movements.map((m, i) => (
            <span
              key={`${m.slot}-${i}`}
              style={{
                height: 4,
                borderRadius: 2,
                background: i <= step.indexInRound ? 'var(--amber)' : 'var(--card-line)',
              }}
            />
          ))}
        </div>
      )}

      <div className="app-content" style={{ gap: 0 }}>
        {/* The thread is a rail beside the content rather than a column with
            the text floating somewhere to the right of it. */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '22px 1fr', gap: 20, minHeight: 0 }}>
          <Thread nodes={nodes} progress={progress} />

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
            <p className="eyebrow" style={{ margin: '0 0 8px' }}>
              {step.slotName} · level {step.level}
            </p>
            <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(28px, 8vw, 40px)', lineHeight: 1.08, fontWeight: 600 }}>
              {step.name}
            </h1>
            <p style={{ margin: '0 0 24px', color: 'var(--muted)', fontSize: 16, lineHeight: 1.4 }}>{step.cues}</p>

            <button
              onClick={() => setRunning((r) => !r)}
              aria-label={running ? 'Pause' : 'Resume'}
              style={{ textAlign: 'left', padding: 0 }}
            >
              <span
                className="num"
                style={{
                  fontSize: 'clamp(84px, 26vw, 104px)',
                  color: running ? 'var(--amber)' : 'var(--muted)',
                  display: 'block',
                  lineHeight: 0.9,
                }}
              >
                {mmss(remaining / 1000)}
              </span>
              <span className="eyebrow" style={{ display: 'block', marginTop: 10 }}>
                {running ? 'Tap to pause' : 'Paused · tap to resume'}
              </span>
            </button>
          </div>
        </div>

        {/* Two equal buttons. Skip used to be missing entirely, so a movement
            that could not be done meant sitting out its clock. */}
        <div className="pair" style={{ flex: 'none', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={advance}>
            Skip
          </button>
          <button className="btn btn-primary" onClick={advance}>
            {index + 1 >= timeline.length ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
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
 * express. The clock here is the block's own minute band from config, and each
 * set is logged as it happens, because the level-up rule is about work done
 * rather than sessions attended.
 */
function StrengthRunner({ active }: { active: ActiveSession }) {
  const router = useRouter();
  const blocks = active.plan.strength!.blocks;
  const prescription = active.plan.strength!.prescription;
  const [sets, setSets] = useState<LoggedSet[]>(() => active.sets ?? []);

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
    cue('done');
    saveActive({ ...active, step: blocks.length, elapsedMs: elapsed(), sets });
    router.replace('/close');
  };

  const advance = () => {
    const next = index + 1;
    if (next >= blocks.length) {
      finish();
      return;
    }
    cue('round');
    setIndex(next);
    setRemaining(seconds(blocks[next]) * 1000);
    saveActive({ ...active, step: next, elapsedMs: elapsed(), sets });
  };

  // Every set is persisted the moment it is tapped, so closing the app between
  // the last set and the Close screen does not lose the work.
  const logSet = (skill: string, unit: 'reps' | 'seconds', value: number) => {
    const next = [...sets, { skill, reps: unit === 'reps' ? value : null, seconds: unit === 'seconds' ? value : null }];
    setSets(next);
    saveActive({ ...active, step: index, elapsedMs: elapsed(), sets: next });
  };

  const undoSet = (skill: string) => {
    const last = sets.map((s) => s.skill).lastIndexOf(skill);
    if (last < 0) return;
    const next = sets.filter((_, i) => i !== last);
    setSets(next);
    saveActive({ ...active, step: index, elapsedMs: elapsed(), sets: next });
  };

  const block = blocks[index];
  if (!block) return <Empty note={active.plan.note} onClose={() => router.replace('/close')} />;

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">
          {titleCase(active.plan.type)} · block {index + 1} of {blocks.length}
        </span>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <SoundToggle />
          <button className="label" onClick={finish} style={{ padding: '8px 0 8px 12px' }}>
            End
          </button>
        </span>
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
          <div className="stack" style={{ margin: '0 0 14px', gap: 16 }}>
            {block.movements.map((m) => (
              <Lift
                key={m.id}
                name={m.name}
                family={m.family}
                level={m.level}
                cues={m.cues}
                unit={m.unit}
                logged={sets.filter((s) => s.skill === m.name)}
                targetSets={block.rounds}
                restSeconds={block.restSeconds}
                onLog={(value) => logSet(m.name, m.unit, value)}
                onUndo={() => undoSet(m.name)}
              />
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

/**
 * One strength movement with its set log. Tapping a number logs a set; the
 * chips above show what has been banked so far, so the count is readable at
 * arm's length without opening anything.
 *
 * Logging a set starts the rest countdown in place. Holding a block clock and a
 * mental rest timer at the same time, mid-superset, is exactly the friction
 * that gets strength sessions skipped.
 */
function Lift({
  name,
  family,
  level,
  cues,
  unit,
  logged,
  targetSets,
  restSeconds,
  onLog,
  onUndo,
}: {
  name: string;
  family: string;
  level: number | null;
  cues: string;
  unit: 'reps' | 'seconds';
  logged: LoggedSet[];
  targetSets: number;
  restSeconds: number;
  onLog: (value: number) => void;
  onUndo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [restUntil, setRestUntil] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const choices = unit === 'seconds' ? STRENGTH.secondChoices : STRENGTH.repChoices;
  const valueOf = (s: LoggedSet) => (unit === 'seconds' ? s.seconds : s.reps) ?? 0;

  // Numerals change without transition: nothing in the app animates except the
  // thread fill, and this must not become the exception.
  useEffect(() => {
    if (!restUntil) return;
    const tick = () => {
      const left = Math.max(0, restUntil - Date.now());
      setRestLeft(left);
      if (left <= 0) {
        setRestUntil(0);
        cue('rest');
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [restUntil]);

  const log = (value: number) => {
    onLog(value);
    setOpen(false);
    if (restSeconds > 0) setRestUntil(Date.now() + restSeconds * 1000);
  };

  return (
    <div>
      <p style={{ margin: 0, fontSize: 'clamp(21px, 5.5vw, 27px)', lineHeight: 1.1, fontWeight: 600 }}>{name}</p>
      <p style={{ margin: '2px 0 8px', color: 'var(--muted)', fontSize: 14 }}>
        {family}
        {level !== null && ` · level ${level}`}
        {cues && ` · ${cues}`}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {logged.map((s, i) => (
          <span
            key={i}
            className="num"
            style={{
              fontSize: 19,
              color: 'var(--sage)',
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid var(--ink-line)',
            }}
          >
            {valueOf(s)}
            {unit === 'seconds' && <span style={{ fontSize: '0.6em', color: 'var(--muted)' }}>s</span>}
          </span>
        ))}
        {Array.from({ length: Math.max(0, targetSets - logged.length) }).map((_, i) => (
          <span
            key={`todo-${i}`}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              border: '1px solid var(--ink-line)',
              display: 'inline-block',
            }}
          />
        ))}

        {restUntil ? (
          <span className="label" style={{ marginLeft: 'auto', color: 'var(--sage)', padding: '10px 0' }}>
            rest {mmss(restLeft / 1000)}
          </span>
        ) : (
          <button
            className="label"
            onClick={() => setOpen((v) => !v)}
            style={{ marginLeft: 'auto', color: 'var(--amber)', padding: '10px 0 10px 12px' }}
          >
            {open ? 'Close' : 'Log a set'}
          </button>
        )}
      </div>

      {open && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {choices.map((v) => (
            <button
              key={v}
              className="btn"
              style={{ width: 'auto', flex: '1 1 26%', padding: '12px 8px', minHeight: 48 }}
              onClick={() => log(v)}
            >
              <span className="num" style={{ fontSize: 20 }}>
                {v}
              </span>
            </button>
          ))}
          {logged.length > 0 && (
            <button
              className="btn btn-quiet"
              style={{ width: 'auto', flex: '1 1 26%', padding: '12px 8px', minHeight: 48 }}
              onClick={onUndo}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Engine has no prescribed steps, so the clock counts up rather than down and
 * the screen carries only the routes. Ending is the only decision.
 */
function OpenRunner({ active }: { active: ActiveSession }) {
  const router = useRouter();
  const routes = active.plan.engine?.routes ?? [];

  const [routeName, setRouteName] = useState(active.routeName ?? '');
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - active.startedAt);
  const [running, setRunning] = useState(true);

  useWakeLock();

  // Counting up from the stored start time, so a reload cannot lose minutes.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - active.startedAt), 250);
    return () => window.clearInterval(id);
  }, [running, active.startedAt]);

  const pick = (name: string) => {
    const next = name === routeName ? '' : name;
    setRouteName(next);
    saveActive({ ...active, routeName: next, elapsedMs: Date.now() - active.startedAt });
  };

  const finish = () => {
    saveActive({
      ...active,
      step: 1,
      elapsedMs: Date.now() - active.startedAt,
      routeName,
      distanceKm: routes.find((r) => r.name === routeName)?.distanceKm ?? null,
    });
    router.replace('/close');
  };

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">
          {titleCase(active.plan.type)} · target {active.plan.targetMinutes} min
        </span>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <SoundToggle />
          <button className="label" onClick={finish} style={{ padding: '8px 0 8px 12px' }}>
            End
          </button>
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, gap: 18 }}>
        <button
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? 'Pause' : 'Resume'}
          style={{ textAlign: 'left', padding: 0 }}
        >
          <span
            className="num"
            style={{
              fontSize: 'clamp(78px, 26vw, 120px)',
              color: running ? 'var(--amber)' : 'var(--muted)',
              display: 'block',
            }}
          >
            {mmss(elapsedMs / 1000)}
          </span>
          {!running && (
            <span className="label" style={{ display: 'block', marginTop: 8 }}>
              Paused · tap to resume
            </span>
          )}
        </button>

        <div className="stack">
            <p className="label" style={{ margin: 0 }}>
              Route
            </p>
            {routes
              .slice()
              .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
              .map((r) => (
                <button
                  key={r.id}
                  className="btn"
                  aria-pressed={routeName === r.name}
                  style={{ justifyContent: 'flex-start', gap: 12 }}
                  onClick={() => pick(r.name)}
                >
                  <span className="num" style={{ fontSize: 22, width: 46, textAlign: 'right' }}>
                    {r.distanceKm ?? '?'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>{r.name}</span>
                </button>
              ))}
            {routes.length === 0 && <div className="banner">No routes scouted yet. Just go; log the distance after.</div>}
        </div>
      </div>

      <button className="btn btn-primary" onClick={finish}>
        Finish
      </button>
    </main>
  );
}

/**
 * A skate session walks blocks the way Strength does, and for the same reason:
 * an hour at the park with a list of names is not a session. Rust first while
 * the legs are fresh, then the projects that need real attempts, then one
 * stretch, then the switch work that otherwise never happens.
 *
 * Each card carries the trick's own drills — what to actually do — and its
 * mastery gate, which is the thing being judged.
 */
function SkateRunner({ active }: { active: ActiveSession }) {
  const router = useRouter();
  const blocks = active.plan.skate!.blocks;
  const [tricks, setTricks] = useState<LoggedTrick[]>(() => active.tricks ?? []);

  const seconds = (b: SkateBlock) => Math.max(0, b.toMinute - b.fromMinute) * 60;

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

  const persist = (nextIndex: number, next: LoggedTrick[]) => {
    saveActive({ ...active, step: nextIndex, elapsedMs: elapsed(), tricks: next });
  };

  const finish = () => {
    cue('done');
    persist(blocks.length, tricks);
    router.replace('/close');
  };

  const advance = () => {
    const next = index + 1;
    if (next >= blocks.length) {
      finish();
      return;
    }
    cue('round');
    setIndex(next);
    setRemaining(seconds(blocks[next]) * 1000);
    persist(next, tricks);
  };

  // Every tap is persisted, because a session at the park is exactly where the
  // phone gets locked, dropped or run out of battery.
  const log = (trick: string, attempts: number, landed: number) => {
    const existing = tricks.find((t) => t.trick === trick);
    const next = existing
      ? tricks.map((t) =>
          t.trick === trick ? { ...t, attempts: t.attempts + attempts, landed: t.landed + landed } : t,
        )
      : [...tricks, { trick, attempts, landed }];
    setTricks(next);
    persist(index, next);
  };

  const block = blocks[index];
  if (!block) return <Empty note={active.plan.note} onClose={() => router.replace('/close')} />;

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">
          Skate · block {index + 1} of {blocks.length}
        </span>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <SoundToggle />
          <button className="label" onClick={finish} style={{ padding: '8px 0 8px 12px' }}>
            End
          </button>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {blocks.map((b, i) => (
          <span
            key={b.label}
            style={{
              flex: Math.max(1, b.toMinute - b.fromMinute),
              height: 4,
              borderRadius: 2,
              background: i === index ? 'var(--amber)' : i < index ? 'var(--sage)' : 'var(--ink-line)',
            }}
          />
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <p className="label" style={{ margin: '0 0 4px' }}>
          {block.label} · minute {block.fromMinute} to {block.toMinute}
        </p>

        <button
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? 'Pause' : 'Resume'}
          style={{ textAlign: 'left', padding: 0, marginBottom: 16 }}
        >
          <span
            className="num"
            style={{
              fontSize: 'clamp(56px, 18vw, 84px)',
              color: running ? 'var(--amber)' : 'var(--muted)',
              display: 'block',
            }}
          >
            {mmss(remaining / 1000)}
          </span>
          <span className="label" style={{ display: 'block', marginTop: 4 }}>
            {running ? 'tap to pause' : 'paused · tap to resume'}
          </span>
        </button>

        {block.tricks.length ? (
          <div className="stack" style={{ gap: 18 }}>
            {block.tricks.map((t) => (
              <TrickCard
                key={t.id}
                trick={t}
                logged={tricks.find((l) => l.trick === t.skillId) ?? null}
                onLog={(attempts, landed) => log(t.skillId, attempts, landed)}
              />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 16, lineHeight: 1.45 }}>
            {block.warmUp
              ? 'Roll around. Push, carve, get the feet used to the board.'
              : 'Nothing on the card for this block. Skate whatever you want.'}
          </p>
        )}
      </div>

      <button className="btn btn-primary" onClick={advance}>
        {index + 1 >= blocks.length ? 'Finish' : 'Next block'}
      </button>
    </main>
  );
}

/**
 * One trick: what it is, how it works, what to do, and what counts as having
 * it. Landed and missed are two taps, which is all the logging a cold hand at a
 * skatepark will tolerate.
 */
function TrickCard({
  trick,
  logged,
  onLog,
}: {
  trick: SkateTrickCard;
  logged: LoggedTrick | null;
  onLog: (attempts: number, landed: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const attempts = logged?.attempts ?? 0;
  const landed = logged?.landed ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'clamp(20px, 5.5vw, 26px)', fontWeight: 600 }}>
          {trick.name}
        </span>
        <span className="num" style={{ fontSize: 22, color: landed > 0 ? 'var(--sage)' : 'var(--muted)' }}>
          {landed}
          <span style={{ color: 'var(--muted)', fontSize: '0.65em' }}>/{attempts}</span>
        </span>
      </div>

      <p style={{ margin: '2px 0 8px', color: 'var(--muted)', fontSize: 14 }}>
        {trick.reason}
        {trick.risk >= SKATE_SESSION.highRisk && ' · high risk, pads'}
        {trick.terrain.length > 0 && ` · ${trick.terrain[0]}`}
      </p>

      {/* The drills are the point of the block: what to actually do. */}
      {trick.drills.length > 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.45 }}>{trick.drills.join(' · ')}</p>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="btn"
          style={{ width: 'auto', flex: '1 1 40%', padding: '14px 8px', borderColor: 'var(--sage)' }}
          onClick={() => onLog(1, 1)}
        >
          Landed
        </button>
        <button
          className="btn"
          style={{ width: 'auto', flex: '1 1 40%', padding: '14px 8px' }}
          onClick={() => onLog(1, 0)}
        >
          Missed
        </button>
        <button
          className="label"
          onClick={() => setOpen((v) => !v)}
          style={{ color: 'var(--amber)', padding: '14px 0 14px 10px' }}
        >
          {open ? 'Less' : 'How'}
        </button>
      </div>

      {open && (
        <div className="panel" style={{ paddingLeft: 0 }}>
          {trick.mechanics.length > 0 && (
            <div className="panel-row">
              <span className="panel-label">Mechanics</span>
              <span className="panel-value">{trick.mechanics.join(' ')}</span>
            </div>
          )}
          {trick.gate && (
            <div className="panel-row">
              <span className="panel-label">Gate</span>
              <span className="panel-value">{trick.gate}</span>
            </div>
          )}
          {trick.attemptsLast > 0 && (
            <div className="panel-row">
              <span className="panel-label">Last time</span>
              <span className="panel-value" style={{ color: 'var(--muted)' }}>
                {trick.landedLast} of {trick.attemptsLast}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
