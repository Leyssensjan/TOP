'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Detail from '@/components/Detail';
import { unlockSound } from '@/lib/client/sound';
import type { SessionPlan } from '@/lib/rules';
import { minutes, titleCase } from '@/lib/format';
import {
  ApiError,
  api,
  cacheToday,
  enqueue,
  cachedToday,
  getActive,
  getKey,
  setKey,
  startSession,
  sync,
  type TodayPayload,
} from '@/lib/client/store';

type Status = 'loading' | 'ready' | 'nokey' | 'error';

/** No icons: eight invented glyphs at 6am is more to decode, not less. */
const DOMAINS = [
  { label: 'Form', path: '/form' },
  { label: 'Strength', path: '/strength' },
  { label: 'Skate', path: '/skate' },
];

const UTILITIES = [
  { label: 'Profile', path: '/profile' },
  { label: 'Progress', path: '/progress' },
  { label: 'Week', path: '/week' },
  { label: 'Routes', path: '/routes' },
];

export default function TodayPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [payload, setPayload] = useState<TodayPayload | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [resumable, setResumable] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [pendingTaps, setPendingTaps] = useState<Record<string, number>>({});
  const [openMicro, setOpenMicro] = useState<string | null>(null);
  const timers = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!getKey()) {
      setStatus('nokey');
      return;
    }
    const cached = cachedToday();
    if (cached) {
      setPayload(cached.payload);
      setStale(true);
      setStatus('ready');
    }
    try {
      const fresh = await api<TodayPayload>('/today');
      cacheToday(fresh);
      setPayload(fresh);
      setStale(false);
      setError(null);
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setStatus('nokey');
        return;
      }
      // Offline with a cache is a normal morning, not an error.
      if (!cached) {
        setError(err instanceof Error ? err.message : 'Could not reach the server');
        setStatus('error');
      }
    }
  }, []);

  // Drain the outbox first, then read. Otherwise a session that syncs on this
  // very load would not be counted in the numbers shown next to it.
  const refresh = useCallback(async () => {
    const result = await sync();
    setPending(result.pending);
    await load();
  }, [load]);

  useEffect(() => {
    setResumable(Boolean(getActive()));
    void refresh();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh]);

  const begin = (plan: SessionPlan, date: string) => {
    // iOS only lets audio start from inside a user gesture, and this tap is the
    // last one before the Runner exists. Unlocking here is what makes the first
    // cue of the session audible.
    unlockSound();
    startSession(plan, date);
    router.push('/runner');
  };

  // Skating is opportunistic: the weather decides, not the plan. This asks for
  // a skate session outright and starts it.
  const skateNow = async () => {
    try {
      const fresh = await api<TodayPayload>('/today?type=skate');
      begin(fresh.session, fresh.date);
    } catch {
      // Offline: nothing to start from, and Today already says so.
    }
  };

  // Taps inside this window collapse into one write, so five taps is one row
  // in Notion with a count of five rather than five rows.
  const flushMicro = useCallback(
    (name: string) => {
      setPendingTaps((prev) => {
        const count = prev[name] ?? 0;
        if (count > 0) {
          enqueue('/micro', { name, count });
          void sync().then(() => void load());
        }
        const next = { ...prev };
        delete next[name];
        return next;
      });
    },
    [load],
  );

  const tapMicro = (name: string) => {
    setPendingTaps((prev) => ({ ...prev, [name]: (prev[name] ?? 0) + 1 }));
    window.clearTimeout(timers.current[name]);
    timers.current[name] = window.setTimeout(() => flushMicro(name), 1200);
  };

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((t) => window.clearTimeout(t));
  }, []);

  if (status === 'nokey') {
    return (
      <main className="screen" style={{ justifyContent: 'center', gap: 16 }}>
        <p className="label">FlowQuest</p>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Open the bookmarked link, or paste the key.</p>
        <input
          className="btn"
          style={{ textAlign: 'center' }}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="Key"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          className="btn btn-primary"
          onClick={() => {
            if (!keyInput.trim()) return;
            setKey(keyInput);
            setStatus('loading');
            void load();
          }}
        >
          Open
        </button>
      </main>
    );
  }

  if (status === 'loading') {
    return (
      <main className="screen" style={{ justifyContent: 'center' }}>
        <p className="label">Loading</p>
      </main>
    );
  }

  if (status === 'error' || !payload) {
    return (
      <main className="screen" style={{ justifyContent: 'center', gap: 16 }}>
        <p className="label">Not loaded</p>
        <p style={{ color: 'var(--muted)' }}>{error}</p>
        <button className="btn" onClick={() => void load()}>
          Try again
        </button>
      </main>
    );
  }

  const { session, rolling } = payload;
  const hasMovements = session.movements.length > 0;
  const hasStrength = (session.strength?.blocks.length ?? 0) > 0;
  const strengthMovements =
    session.strength?.blocks.reduce((n, b) => n + b.movements.length, 0) ?? 0;
  // Engine and Skate are open sessions: no steps to prepare, but startable.
  const isOpen = session.type === 'engine' || session.type === 'skate';
  const canStart = hasMovements || hasStrength || isOpen;
  const skateTricks = session.skate?.blocks.reduce((n, b) => n + b.tricks.length, 0) ?? 0;
  const hasSkate = skateTricks > 0;
  const done = payload.alreadyLogged && !resumable;
  const loggedMinutes = payload.loggedToday.reduce((n, l) => n + (l.actualMinutes ?? 0), 0);

  return (
    <main className="screen">
      {/* Above the fold: type, duration, one button. Nothing else. */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, paddingTop: 8 }}>
        <p className="label" style={{ margin: 0 }}>
          {done ? 'Today' : payload.rest ? 'Planned rest' : titleCase(session.type)}
        </p>
        {/* Done for the day: the same card, just smaller and out of the way. */}
        <div
          className="num"
          style={{
            fontSize: done ? 'clamp(48px, 16vw, 68px)' : 'clamp(92px, 34vw, 150px)',
            color: done ? 'var(--sage)' : payload.rest ? 'var(--muted)' : 'var(--amber)',
          }}
        >
          {done ? loggedMinutes : minutes(session.totalSeconds) || session.targetMinutes}
          <span style={{ fontSize: '0.28em', color: 'var(--muted)', marginLeft: 10 }}>MIN</span>
        </div>
        {/* The most important small thing in the app: the only place the arc
            is stated every single morning. The horizon clause is amber. */}
        {done && <p style={{ margin: '0 0 18px', color: 'var(--muted)' }}>Done!</p>}

        {!done && (
        <p style={{ margin: '0 0 22px', color: 'var(--muted)' }}>
          {hasMovements
            ? `${session.movements.length} movements · ${session.rounds} ${session.rounds === 1 ? 'round' : 'rounds'}`
            : hasStrength
              ? `${strengthMovements} lifts · ${session.strength!.blocks.filter((b) => !b.warmUp).length} blocks`
              : hasSkate
                ? `${skateTricks} ${skateTricks === 1 ? 'trick' : 'tricks'} · ${session.skate!.blocks.length} blocks`
                : (session.note ?? '')}
          {payload.rest && `${titleCase(session.type)} if you want it · `}
          {payload.horizon && payload.horizon.inSessions !== null && (
            <span style={{ color: 'var(--amber)' }}>
              {' · '}
              slot {payload.horizon.slot} in {payload.horizon.inSessions} sessions
            </span>
          )}
        </p>
        )}

        {/* A planned rest day still offers the session, quietly. The plan is a
            decision already made, not a lock. */}
        <button
          className={payload.rest ? 'btn btn-quiet' : 'btn btn-primary'}
          onClick={() => begin(session, payload.date)}
          disabled={!canStart}
          style={canStart ? undefined : { opacity: 0.4 }}
        >
          {payload.rest ? 'Train anyway' : resumable ? 'Restart' : 'Start'}
        </button>

        {resumable && (
          <button className="btn btn-quiet" onClick={() => router.push('/runner')}>
            Resume
          </button>
        )}

        <div className="stack" style={{ paddingTop: 14 }}>
          {stale && <div className="banner">Showing the last saved copy. Not refreshed yet.</div>}
          {pending > 0 && (
            <div className="banner banner-warn">
              {pending} {pending === 1 ? 'session has' : 'sessions have'} not reached Notion yet.
            </div>
          )}

          {/* At most one proposal, ever, and it sits with the session because it
              is a decision rather than a number to glance at. */}
          {payload.proposal && <ProposalCard proposal={payload.proposal} onDone={() => void refresh()} />}
        </div>
      </div>

      {/* Micros sit here, below the session and above everything else: they are
          tapped through the day, so a trip to another screen loses them. */}
      {payload.micros.length > 0 && (
        <div style={{ paddingTop: 22 }}>
          {/* The section label is the way through to the full list, so micros
              no longer need a button of their own down in the nav. */}
          <button
            className="label"
            onClick={() => router.push('/micros')}
            style={{ margin: '0 0 10px', padding: '4px 0', display: 'block' }}
          >
            This week&rsquo;s micros
          </button>
          <div className="stack" style={{ gap: 8 }}>
            {payload.micros.map((m, i) => {
              const shown = m.count + (pendingTaps[m.name] ?? 0);
              const target = m.weeklyTarget ?? 0;
              const met = target > 0 && shown >= target;
              return (
                <div key={m.id}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      borderRadius: 12,
                      background: 'var(--ink-raised)',
                      border: '1px solid var(--ink-line)',
                      opacity: met ? 0.7 : 1,
                    }}
                  >
                    {/* Tapping the name explains it; tapping the count logs it. */}
                    <button
                      onClick={() => setOpenMicro(openMicro === m.id ? null : m.id)}
                      aria-expanded={openMicro === m.id}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '14px 0 14px 16px', minHeight: 'var(--tap)' }}
                    >
                      <span style={{ display: 'block', fontSize: 16 }}>
                        <span className="num" style={{ color: 'var(--muted)', marginRight: 8 }}>
                          {i + 1}
                        </span>
                        {m.name}
                      </span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginLeft: 22 }}>
                        {m.trigger}
                      </span>
                    </button>
                    <button
                      onClick={() => tapMicro(m.name)}
                      aria-label={`Log ${m.name}`}
                      style={{ flex: 'none', padding: '14px 16px', minHeight: 'var(--tap)' }}
                    >
                      <span className="num" style={{ fontSize: 30, color: met ? 'var(--sage)' : 'var(--amber)' }}>
                        {shown}
                      </span>
                      <span className="num" style={{ fontSize: 18, color: 'var(--muted)' }}>
                        /{target || '-'}
                      </span>
                    </button>
                  </div>

                  {openMicro === m.id && (
                    <Detail
                      rows={[
                        { label: 'Cue', value: m.cue },
                        { label: 'When', value: m.trigger },
                        { label: 'Takes', value: m.duration },
                        {
                          label: 'Feeds',
                          links: m.feedsName
                            ? [{ label: m.feedsName, onClick: () => router.push('/form') }]
                            : undefined,
                        },
                      ]}
                      footnote={met ? <>Done for this week. A new one has taken its place.</> : null}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skating is opportunistic, so it gets its own way in rather than
          waiting to be the suggested session. */}
      <button className="btn btn-quiet" style={{ marginTop: 18 }} onClick={() => void skateNow()}>
        Give me a skate session
      </button>

      <div className="stack" style={{ paddingTop: 18, marginTop: 'auto' }}>
        {payload.suggestion && (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 15 }}>{payload.suggestion.line}</p>
        )}

        <Rolling rolling={rolling} />

        {!adjusting ? (
          <>
            {/* The four training domains get buttons: at 6am the question is
                "which of my four kinds of training", not "which of my screens". */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {DOMAINS.map((d) => (
                <button
                  key={d.path}
                  className="btn btn-quiet"
                  style={{ flex: '1 1 0', padding: '16px 8px', minWidth: 0 }}
                  onClick={() => router.push(d.path)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* The utilities are a text strip, not buttons. */}
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', paddingTop: 2 }}>
              <button className="label" onClick={() => setAdjusting(true)} style={{ padding: '10px 0' }}>
                Adjust
              </button>
              {UTILITIES.map((u) => (
                <button
                  key={u.path}
                  className="label"
                  onClick={() => router.push(u.path)}
                  style={{ padding: '10px 0' }}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <Checkin
            onCancel={() => setAdjusting(false)}
            onAdjusted={(plan) => {
              setPayload({ ...payload, session: plan });
              setAdjusting(false);
            }}
          />
        )}
      </div>
    </main>
  );
}

function Rolling({ rolling }: { rolling: TodayPayload['rolling'] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, color: 'var(--muted)' }}>
      <span className="num" style={{ fontSize: 30, color: 'var(--text)' }}>
        {rolling.count}
      </span>
      <span style={{ fontSize: 15 }}>
        of {rolling.target} in the last {rolling.windowDays} days
        {rolling.daysRemaining !== null && ` · ${rolling.daysRemaining}d of slack`}
        {rolling.streakWeeks > 0 && ` · ${rolling.streakWeeks} weeks`}
      </span>
    </div>
  );
}

/**
 * One card for all three kinds of advancement, because they are the same
 * decision: the app proposes, Jan decides, and deferring is always available.
 */
function ProposalCard({
  proposal,
  onDone,
}: {
  proposal: NonNullable<TodayPayload['proposal']>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const send = async (action: 'accept' | 'defer') => {
    setBusy(true);
    try {
      if (proposal.kind === 'slot') {
        await api('/unlock', { method: 'POST', body: { action } });
      } else if (proposal.kind === 'movement') {
        await api('/levelup', { method: 'POST', body: { slot: proposal.movement.slot, action } });
      } else if (proposal.kind === 'strength') {
        await api('/levelup', { method: 'POST', body: { family: proposal.strength.family, action } });
      } else {
        await api('/trick', {
          method: 'POST',
          body: action === 'accept' ? { id: proposal.skate.id, status: 'mastered' } : { id: proposal.skate.id, defer: true },
        });
      }
      onDone();
    } catch {
      setBusy(false);
    }
  };

  const { title, subject, reason, accept } = describe(proposal);

  return (
    <div className="banner" style={{ color: 'var(--text)' }}>
      <p className="label" style={{ margin: '0 0 6px' }}>
        {title}
      </p>
      <p style={{ margin: '0 0 4px' }}>{subject}</p>
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 15 }}>{reason}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" disabled={busy} onClick={() => void send('accept')}>
          {accept}
        </button>
        <button className="btn btn-quiet" disabled={busy} onClick={() => void send('defer')}>
          Not yet
        </button>
      </div>
    </div>
  );
}

function describe(proposal: NonNullable<TodayPayload['proposal']>) {
  if (proposal.kind === 'slot') {
    const p = proposal.slot;
    return {
      title: 'The Form is ready to grow',
      subject: `Slot ${p.slot}: ${p.name}`,
      reason: `${p.sessionsSinceUnlock} sessions, nothing hard in the last five. Rounds go back to ${p.roundsAfter}.`,
      accept: 'Add it',
    };
  }
  if (proposal.kind === 'movement') {
    const p = proposal.movement;
    return {
      title: 'Ready to level up',
      subject: `${p.slotName}: ${p.nextSkillName}`,
      // The entire argument for micros, made concrete rather than asserted.
      reason: p.assisted
        ? `Level ${p.fromLevel} to ${p.toLevel}. ${p.needed} sessions instead of 8. The micros did that.`
        : `Level ${p.fromLevel} to ${p.toLevel}. ${p.needed} sessions, last three easy.`,
      accept: 'Level up',
    };
  }
  if (proposal.kind === 'strength') {
    const p = proposal.strength;
    return {
      title: 'Ready to level up',
      subject: `${p.family}: ${p.nextSkillName}`,
      reason: `Level ${p.fromLevel} to ${p.toLevel}. ${p.clearedSets} clean sets on ${p.currentSkillName}.`,
      accept: 'Level up',
    };
  }
  const p = proposal.skate;
  return {
    title: 'Call it mastered?',
    subject: p.name,
    // The gate is shown verbatim: most of them are judgements the app cannot
    // make, so it reports the evidence and asks.
    reason: `Landed ${p.landed} of ${p.attempts}. ${p.gate}`,
    accept: 'Mastered',
  };
}

function Checkin({
  onCancel,
  onAdjusted,
}: {
  onCancel: () => void;
  onAdjusted: (plan: SessionPlan) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [energy, setEnergy] = useState<'low' | 'ok' | 'good' | null>(null);
  const [mins, setMins] = useState<number | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api<{ session: SessionPlan }>('/checkin', {
        method: 'POST',
        body: { minutes: mins, energy },
      });
      onAdjusted(res.session);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="banner" style={{ color: 'var(--text)' }}>
      <p className="label" style={{ margin: '0 0 8px' }}>
        Minutes
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[7, 12, 18, 25].map((m) => (
          <button key={m} className="btn" aria-pressed={mins === m} onClick={() => setMins(m)}>
            {m}
          </button>
        ))}
      </div>
      <p className="label" style={{ margin: '0 0 8px' }}>
        Energy
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['low', 'ok', 'good'] as const).map((e) => (
          <button key={e} className="btn" aria-pressed={energy === e} onClick={() => setEnergy(e)}>
            {e}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          Apply
        </button>
        <button className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
