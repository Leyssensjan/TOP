'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cell, Cells, Header, HeaderAction, Hero, Section, Segmented } from '@/components/Chrome';
import {
  api,
  clearActive,
  enqueue,
  getActive,
  sync,
  type ActiveSession,
} from '@/lib/client/store';
import type { Route } from '@/lib/types';

type Difficulty = 'easy' | 'right' | 'hard';

const SORE = ['wrists', 'shoulders', 'back', 'hips', 'knees', 'ankles'];

/**
 * Which route it was is a fact about the run that just happened, not a decision
 * to make before setting off. It is asked here, after, where the answer is
 * known — and a run that was not one of the three regulars just says how far it
 * went.
 */
const OTHER = '__other__';

/** Three taps: how it felt, anything sore, done. Under ten seconds. */
export default function ClosePage() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveSession | null | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [sore, setSore] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<'synced' | 'queued' | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [typedKm, setTypedKm] = useState('');

  useEffect(() => {
    const found = getActive();
    // A stored session with no plan is not a session. It should not be
    // possible, and this is the one screen where a crash costs the work that
    // was just done — so it fails back to Today rather than to an error page.
    if (!found?.plan) {
      router.replace('/');
      return;
    }
    setActive(found);
    // Seeded when the run was started from the Routes screen, which is still a
    // way in — it just is not the only one any more.
    if (found.distanceKm != null) setDistance(found.distanceKm);
    if (found.routeName) setPicked(found.routeName);

    if (found.plan.type === 'engine') {
      void api<{ routes: Route[] }>('/routes')
        .then((res) => setRoutes(res.routes))
        // Offline, the three regulars are simply not offered and the typed
        // distance carries the run on its own.
        .catch(() => setRoutes([]));
    }
  }, [router]);

  const pickRoute = (route: Route) => {
    setPicked(route.name);
    setDistance(route.distanceKm);
    setTypedKm('');
  };

  const pickOther = () => {
    setPicked(OTHER);
    setDistance(null);
  };

  const typeKm = (value: string) => {
    setTypedKm(value);
    const km = Number(value.replace(',', '.'));
    setDistance(Number.isFinite(km) && km > 0 ? km : null);
  };

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
  // A run has no movements and one round, so those two cells would state
  // nothing. Distance and pace are what a run is actually made of.
  const pace = distance && distance > 0 ? elapsedMinutes / distance : null;
  const paceLabel = pace ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')}` : '—';

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
      route: picked && picked !== OTHER ? picked : '',
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
          <Section title="Which route" gap={8}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {routes
                .slice()
                .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
                .map((route) => (
                  <button
                    key={route.id}
                    className={`row row-dense${picked === route.name ? ' row-live' : ''}`}
                    aria-pressed={picked === route.name}
                    onClick={() => pickRoute(route)}
                    style={{ gridTemplateColumns: '1fr 56px' }}
                  >
                    <span className="row-body">
                      <span className="row-title">{route.name}</span>
                      {route.bridges.length > 0 && (
                        <span className="row-sub">{route.bridges.join(' › ')}</span>
                      )}
                    </span>
                    <span
                      className="row-value"
                      style={{ fontSize: 22, color: picked === route.name ? 'var(--amber)' : 'var(--dimmer)' }}
                    >
                      {route.distanceKm ?? '?'}
                      <span>km</span>
                    </span>
                  </button>
                ))}

              <button
                className={`row row-dense${picked === OTHER ? ' row-live' : ''}`}
                aria-pressed={picked === OTHER}
                onClick={pickOther}
                style={{ gridTemplateColumns: '1fr 56px' }}
              >
                <span className="row-body">
                  <span className="row-title">Somewhere else</span>
                  <span className="row-sub">Say how far it was</span>
                </span>
                <span className="row-value" style={{ fontSize: 22, color: 'var(--dimmer)' }}>
                  ?
                </span>
              </button>
            </div>

            {picked === OTHER && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
                <input
                  className="btn"
                  value={typedKm}
                  onChange={(e) => typeKm(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.0"
                  aria-label="Distance in kilometres"
                  autoFocus
                  style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 22, padding: '0 16px' }}
                />
                <span className="eyebrow" style={{ flex: 'none' }}>
                  km
                </span>
              </div>
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
            {isEngine ? (
              <>
                <Cell value={distance ?? '—'} caption="Km" tone="amber" />
                <Cell value={paceLabel} caption="Min per km" tone="text" />
              </>
            ) : (
              <>
                <Cell value={worked} caption={workedLabel} tone="amber" />
                <Cell value={active.plan.rounds || 1} caption="Rounds" tone="text" />
              </>
            )}
          </Cells>
          <button className="btn btn-primary" disabled={saving} onClick={() => void done()}>
            {saving ? 'Saving' : 'Log it'}
          </button>
        </div>
      </div>
    </main>
  );
}
