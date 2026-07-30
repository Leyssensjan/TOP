'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearActive,
  enqueue,
  getActive,
  sync,
  type ActiveSession,
} from '@/lib/client/store';

type Difficulty = 'easy' | 'right' | 'hard';

const SORE = ['wrists', 'shoulders', 'back', 'hips', 'knees', 'ankles'];

/** Three taps: how it felt, anything sore, done. Under ten seconds. */
export default function ClosePage() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveSession | null | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [sore, setSore] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<'synced' | 'queued' | null>(null);

  useEffect(() => {
    const found = getActive();
    if (!found) router.replace('/');
    else setActive(found);
  }, [router]);

  const toggleSore = (part: string) =>
    setSore((prev) => (prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]));

  const elapsedMinutes = active ? Math.max(1, Math.round(active.elapsedMs / 60000)) : 0;

  const done = async () => {
    if (!active) return;
    setSaving(true);

    const skillIds = Array.from(new Set(active.plan.movements.map((m) => m.skillId)));

    // Queue first, then try to send. If the phone is still offline the write
    // survives in the outbox and Today says plainly that it has not landed.
    enqueue('/session', {
      date: active.date,
      type: active.plan.type,
      plannedMinutes: active.plan.targetMinutes,
      actualMinutes: elapsedMinutes,
      completed: true,
      difficulty,
      soreness: sore.join(', '),
      skillIds,
      clientId: active.clientId,
    });

    const res = await sync();
    clearActive();
    setResult(res.pending === 0 ? 'synced' : 'queued');
    setSaving(false);
  };

  if (!active) return <main className="screen" />;

  if (result) {
    return (
      <main className="screen" style={{ justifyContent: 'center', gap: 14 }}>
        <p className="num" style={{ fontSize: 84, color: 'var(--sage)', margin: 0 }}>
          {elapsedMinutes}
          <span style={{ fontSize: '0.3em', color: 'var(--muted)', marginLeft: 8 }}>MIN</span>
        </p>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          {result === 'synced' ? 'Logged.' : 'Saved on the phone. It will sync when there is a network.'}
        </p>
        <button className="btn btn-primary" onClick={() => router.replace('/')}>
          Done
        </button>
      </main>
    );
  }

  return (
    <main className="screen" style={{ gap: 26 }}>
      <div style={{ paddingTop: 8 }}>
        <p className="label" style={{ margin: 0 }}>
          Done
        </p>
        <p className="num" style={{ fontSize: 68, margin: '4px 0 0', color: 'var(--amber)' }}>
          {elapsedMinutes}
          <span style={{ fontSize: '0.3em', color: 'var(--muted)', marginLeft: 8 }}>MIN</span>
        </p>
      </div>

      <div>
        <p className="label" style={{ margin: '0 0 10px' }}>
          How it felt
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['easy', 'right', 'hard'] as const).map((d) => (
            <button
              key={d}
              className="btn"
              aria-pressed={difficulty === d}
              onClick={() => setDifficulty(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label" style={{ margin: '0 0 10px' }}>
          Anything sore
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {SORE.map((part) => (
            <button
              key={part}
              className="btn"
              aria-pressed={sore.includes(part)}
              style={{ width: 'auto', flex: '1 1 30%', padding: '14px 10px' }}
              onClick={() => toggleSore(part)}
            >
              {part}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 'auto' }}>
        <button className="btn btn-primary" disabled={saving} onClick={() => void done()}>
          {saving ? 'Saving' : 'Done'}
        </button>
      </div>
    </main>
  );
}
