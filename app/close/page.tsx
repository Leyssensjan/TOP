'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cell, Cells, Header, HeaderAction, Hero, Section, Segmented } from '@/components/Chrome';
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
  // What the session actually contained, read off the plan that just ran. The
  // two cells state it rather than leaving the screen to end on a bare button.
  const worked = active
    ? active.plan.movements.length ||
      (active.plan.strength?.blocks.reduce((n, b) => n + b.movements.length, 0) ?? 0) ||
      (active.plan.skate?.blocks.reduce((n, b) => n + b.tricks.length, 0) ?? 0)
    : 0;
  const workedLabel =
    active?.plan.type === 'strength' ? 'Lifts' : active?.plan.type === 'skate' ? 'Tricks' : 'Movements';

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
      tricks: active.tricks ?? [],
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
    <main className="app">
      <Header
        title="Session done"
        right={<HeaderAction onClick={() => router.replace('/')}>Skip</HeaderAction>}
      />

      <div className="app-content" style={{ gap: 20 }}>
        <Hero value={elapsedMinutes} unit="min" />

        <Section title="How it felt">
          <Segmented
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'right', label: 'Right' },
              { value: 'hard', label: 'Hard' },
            ]}
            value={difficulty}
            onChange={(v) => setDifficulty(v as 'easy' | 'right' | 'hard')}
          />
        </Section>

        {isEngine && (
          <Section title="Distance">
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DISTANCES.length}, 1fr)`, gap: 8 }}>
              {DISTANCES.map((d) => (
                <button
                  key={d}
                  className="btn btn-inline"
                  aria-pressed={distance === d}
                  onClick={() => setDistance(distance === d ? null : d)}
                >
                  <span className="num" style={{ fontSize: 18 }}>
                    {d}
                  </span>
                </button>
              ))}
            </div>
            {active.routeName && (
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>{active.routeName}</p>
            )}
          </Section>
        )}

        <Section
          title="Anything sore"
          action={<span className="eyebrow">Optional</span>}
        >
          {/* A grid of equal cells, not a wrapping row: multi-select chips that
              reflow put the last one on a line of its own at a different width
              from the rest. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {SORE.map((part) => (
              <button
                key={part}
                className="btn btn-inline"
                aria-pressed={sore.includes(part)}
                onClick={() => toggleSore(part)}
              >
                {part}
              </button>
            ))}
          </div>
        </Section>

        {/* Pinned, so the 400px of dead space between the chips and the button
            is gone and Done is always in the same place under the thumb. */}
        <div className="pinned" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Cells columns={2}>
            <Cell value={worked} caption={workedLabel} tone="amber" />
            <Cell value={active.plan.rounds || 1} caption="Rounds" tone="text" />
          </Cells>
          <button className="btn btn-primary" disabled={saving} onClick={() => void done()}>
            {saving ? 'Saving' : 'Log it'}
          </button>
        </div>
      </div>
    </main>
  );
}
