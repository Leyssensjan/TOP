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

/** Engine distances, in km. Quick picks only; the route seeds the real value. */
const DISTANCES = [3, 3.5, 5, 5.5, 8, 10];

/** Three taps: how it felt, anything sore, done. Under ten seconds. */
export default function ClosePage() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveSession | null | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [sore, setSore] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<'synced' | 'queued' | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  useEffect(() => {
    const found = getActive();
    if (!found) {
      router.replace('/');
      return;
    }
    setActive(found);
    // Seed the distance from the route picked in the Runner, so the common case
    // is already answered and only a different run needs a tap.
    if (found.distanceKm != null) setDistance(found.distanceKm);
  }, [router]);

  const toggleSore = (part: string) =>
    setSore((prev) => (prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]));

  const elapsedMinutes = active ? Math.max(1, Math.round(active.elapsedMs / 60000)) : 0;
  const isEngine = active?.plan.type === 'engine';

  const done = async () => {
    if (!active) return;
    setSaving(true);

    // Strength keeps its work in blocks rather than in movements, so both are
    // collected here. Otherwise a Strength session would log no skills at all.
    const skillIds = Array.from(
      new Set([
        ...active.plan.movements.map((m) => m.skillId),
        ...(active.plan.strength?.blocks.flatMap((b) => b.movements.map((m) => m.id)) ?? []),
      ]),
    );

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
      // The sets go with the session, so one queued write carries the whole
      // log and a retry cannot land half of it.
      sets: active.sets ?? [],
      distanceKm: isEngine ? distance : null,
      route: active.routeName ?? '',
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

      {isEngine && (
        <div>
          <p className="label" style={{ margin: '0 0 10px' }}>
            Distance
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DISTANCES.map((d) => (
              <button
                key={d}
                className="btn"
                aria-pressed={distance === d}
                style={{ width: 'auto', flex: '1 1 20%', padding: '14px 8px' }}
                onClick={() => setDistance(distance === d ? null : d)}
              >
                <span className="num" style={{ fontSize: 19 }}>
                  {d}
                </span>
              </button>
            ))}
          </div>
          {active.routeName && (
            <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14 }}>{active.routeName}</p>
          )}
        </div>
      )}

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
