'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header, HeaderFact } from '@/components/Chrome';
import { ApiError, api, getKey, startSession, saveActive, getActive } from '@/lib/client/store';
import { TARGET_MINUTES } from '@/lib/config';
import { today as todayDate } from '@/lib/dates';

// The screen reads the store's shape rather than restating it, so a field
// added to a route reaches the screen instead of being quietly dropped here.
import type { Route } from '@/lib/types';

/** Engine routes, read-only. Scouted by hand and held in Notion. */
export default function RoutesPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getKey()) {
      router.replace('/');
      return;
    }
    try {
      const res = await api<{ routes: Route[]; note: string | null }>('/routes');
      setRoutes(res.routes);
      setNote(res.note);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/');
      else setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  // Starting from here pre-selects the route, so the Runner and the Close
  // screen already know which one it was and how far it is.
  const start = (route: Route) => {
    const date = todayDate();
    startSession(
      {
        date,
        type: 'engine',
        source: 'default',
        targetMinutes: TARGET_MINUTES.engine ?? 30,
        totalSeconds: (TARGET_MINUTES.engine ?? 30) * 60,
        rounds: 1,
        movements: [],
        activeSlotIds: [],
        engine: { routes: routes ?? [] },
        note: null,
      },
      date,
    );
    const active = getActive();
    if (active) saveActive({ ...active, routeName: route.name, distanceKm: route.distanceKm });
    router.push('/runner');
  };

  return (
    <main className="app">
      <Header title="Routes" back backTo="/week" right={<HeaderFact>Berouw 74</HeaderFact>} />

      <div className="app-content" style={{ gap: 14 }}>
        {error && <div className="banner banner-warn">{error}</div>}
        {!routes && !error && <p className="eyebrow">Loading</p>}
        {note && <div className="note">{note}</div>}

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span className="eyebrow" style={{ whiteSpace: 'nowrap' }}>
            From Berouw 74
          </span>
          {/* The handoff annotated these as door-to-door including 0.9km each
              way to the Bataviabrug. Jan's own distances do not fit that
              arithmetic, and his are the ones he ran. */}
          <span style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right', minWidth: 0 }}>
            estimates until a GPS run
          </span>
        </div>

        <div className="stack" style={{ gap: 10, minHeight: 0, overflowY: 'auto' }}>
          {routes
            ?.slice()
            .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
            .map((route) => (
              <div
                key={route.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  padding: '20px 18px',
                  borderRadius: 16,
                  background: 'var(--card)',
                  border: '1px solid var(--card-line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="num" style={{ fontSize: 38, color: 'var(--amber)', lineHeight: 0.9 }}>
                    {route.distanceKm ?? '?'}
                  </span>
                  <span className="hero-unit" style={{ fontSize: 15 }}>
                    km
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 17, fontWeight: 500, minWidth: 0 }}>{route.name}</span>
                </div>

                {/* The bridges are the route's identity: on a loop round the
                    docks, which one you cross is the whole decision. */}
                {route.bridges.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    {route.bridges.map((bridge, i) => (
                      <span key={bridge} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && <span style={{ color: 'var(--dimmest)' }}>›</span>}
                        <span
                          style={{
                            fontSize: 12,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            color: 'var(--amber)',
                          }}
                        >
                          {bridge}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {route.description && (
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.4 }}>
                    {route.description}
                  </p>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--dim)',
                      minWidth: 0,
                    }}
                  >
                    {[
                      route.quietRating !== null && `Quiet ${route.quietRating}/5`,
                      route.lapHint,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {/* One tap from reading a route to running it. */}
                  <button
                    className="btn btn-inline btn-amber-outline"
                    style={{ width: 'auto', minHeight: 44, padding: '10px 16px' }}
                    onClick={() => start(route)}
                  >
                    Run this
                  </button>
                </div>
              </div>
            ))}
        </div>

        <div
          className="pinned"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
        >
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Distances are estimates until your first GPS run.
          </span>
        </div>
      </div>
    </main>
  );
}
