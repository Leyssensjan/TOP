'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, getKey } from '@/lib/client/store';

interface Route {
  id: string;
  name: string;
  distanceKm: number | null;
  startPoint: string;
  description: string;
  mapLink: string;
  surface: string;
  quietRating: number | null;
}

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

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">Routes</span>
        <button className="label" onClick={() => router.push('/')} style={{ padding: '8px 0 8px 16px' }}>
          Today
        </button>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}
      {!routes && !error && <p className="label">Loading</p>}
      {note && <div className="banner">{note}</div>}

      <div className="stack">
        {routes
          ?.slice()
          .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
          .map((route) => (
            <div
              key={route.id}
              style={{
                padding: '16px 18px',
                borderRadius: 14,
                background: 'var(--ink-raised)',
                border: '1px solid var(--ink-line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <span className="num" style={{ fontSize: 34, color: 'var(--amber)' }}>
                  {route.distanceKm ?? '?'}
                  <span style={{ fontSize: '0.4em', color: 'var(--muted)', marginLeft: 4 }}>KM</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>{route.name}</span>
              </div>

              {route.description && (
                <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 15, lineHeight: 1.45 }}>
                  {route.description}
                </p>
              )}

              <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 13 }}>
                {[
                  route.startPoint && `from ${route.startPoint}`,
                  route.surface,
                  route.quietRating !== null && `quiet ${route.quietRating}/5`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              {route.mapLink && (
                <a
                  href={route.mapLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--amber)', fontSize: 15 }}
                >
                  Open the map
                </a>
              )}
            </div>
          ))}
      </div>
    </main>
  );
}
