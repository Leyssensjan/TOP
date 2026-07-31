'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionPlan } from '@/lib/rules';
import { minutes, titleCase } from '@/lib/format';
import {
  ApiError,
  api,
  cacheToday,
  cachedToday,
  getActive,
  getKey,
  setKey,
  startSession,
  sync,
  type TodayPayload,
} from '@/lib/client/store';

type Status = 'loading' | 'ready' | 'nokey' | 'error';

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
    startSession(plan, date);
    router.push('/runner');
  };

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

  return (
    <main className="screen">
      {/* Above the fold: type, duration, one button. Nothing else. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
        <p className="label" style={{ margin: 0 }}>
          {payload.rest ? 'Planned rest' : titleCase(session.type)}
        </p>
        <div className="num" style={{ fontSize: 'clamp(92px, 34vw, 150px)', color: 'var(--amber)' }}>
          {minutes(session.totalSeconds) || session.targetMinutes}
          <span style={{ fontSize: '0.28em', color: 'var(--muted)', marginLeft: 10 }}>MIN</span>
        </div>
        <p style={{ margin: '0 0 22px', color: 'var(--muted)' }}>
          {hasMovements
            ? `${session.movements.length} movements${session.rounds > 1 ? ` · ${session.rounds} rounds` : ''}`
            : (session.note ?? '')}
        </p>

        <button
          className="btn btn-primary"
          onClick={() => begin(session, payload.date)}
          disabled={!hasMovements}
          style={hasMovements ? undefined : { opacity: 0.4 }}
        >
          {resumable ? 'Restart' : 'Start'}
        </button>

        {resumable && (
          <button className="btn btn-quiet" onClick={() => router.push('/runner')}>
            Resume
          </button>
        )}
      </div>

      <div className="stack" style={{ paddingTop: 18 }}>
        {stale && <div className="banner">Showing the last saved copy. Not refreshed yet.</div>}
        {pending > 0 && (
          <div className="banner banner-warn">
            {pending} {pending === 1 ? 'session has' : 'sessions have'} not reached Notion yet.
          </div>
        )}
        {payload.alreadyLogged && <div className="banner">Already logged today.</div>}

        {payload.proposals.map((p) => (
          <Proposal key={p.slot} proposal={p} onDone={() => void load()} />
        ))}

        <Rolling rolling={rolling} />

        {!adjusting ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button className="btn btn-quiet" style={{ flex: '1 1 45%' }} onClick={() => setAdjusting(true)}>
              Adjust
            </button>
            <button className="btn btn-quiet" style={{ flex: '1 1 45%' }} onClick={() => router.push('/form')}>
              Form
            </button>
            <button className="btn btn-quiet" style={{ flex: '1 1 45%' }} onClick={() => router.push('/micros')}>
              Micros
            </button>
            <button className="btn btn-quiet" style={{ flex: '1 1 45%' }} onClick={() => router.push('/skate')}>
              Skate
            </button>
          </div>
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

function Proposal({
  proposal,
  onDone,
}: {
  proposal: TodayPayload['proposals'][number];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const send = async (action: 'accept' | 'defer') => {
    setBusy(true);
    try {
      await api('/levelup', { method: 'POST', body: { slot: proposal.slot, action } });
      onDone();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="banner" style={{ color: 'var(--text)' }}>
      <p style={{ margin: '0 0 4px' }}>
        {proposal.slotName}: {proposal.nextSkillName}
      </p>
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 15 }}>
        Level {proposal.fromLevel} to {proposal.toLevel}. Eight sessions, last three easy.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" disabled={busy} onClick={() => void send('accept')}>
          Level up
        </button>
        <button className="btn btn-quiet" disabled={busy} onClick={() => void send('defer')}>
          Not yet
        </button>
      </div>
    </div>
  );
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
