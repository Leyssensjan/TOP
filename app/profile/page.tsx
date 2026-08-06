'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Detail from '@/components/Detail';
import { ApiError, api, getKey } from '@/lib/client/store';

interface Axis {
  key: string;
  label: string;
  level: number;
  tier: string;
  sources: Array<{ label: string; reached: number; available: number }>;
}

interface ProfilePayload {
  date: string;
  axes: Axis[];
  overall: number;
  rank: string;
}

const MAX = 10;
const SIZE = 300;
const CENTRE = SIZE / 2;
const RADIUS = 108;

/** Clockwise from the top, so the first spoke in config is the one at 12. */
function point(index: number, count: number, value: number) {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  const r = (value / MAX) * RADIUS;
  return { x: CENTRE + r * Math.cos(angle), y: CENTRE + r * Math.sin(angle) };
}

function polygon(values: number[]) {
  return values.map((v, i) => {
    const p = point(i, values.length, v);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
}

/**
 * The profile. Seven spokes over state that already exists — this screen reads
 * and never writes, which is what makes it safe to delete if it stops earning
 * its place.
 *
 * The web is drawn at whole levels rather than at percentages on purpose: a
 * level-up visibly moves one spoke, and nothing else does. See PROFILE in
 * config for why.
 */
export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getKey()) {
      router.replace('/');
      return;
    }
    try {
      setData(await api<ProfilePayload>('/profile'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/');
      else setError(err instanceof Error ? err.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const axes = data?.axes ?? [];
  const rings = [2, 4, 6, 8, 10];

  return (
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">Profile</span>
        <button className="label" onClick={() => router.push('/')} style={{ padding: '8px 0 8px 16px' }}>
          Today
        </button>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}
      {!data && !error && <p className="label">Loading</p>}

      {data && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="num" style={{ fontSize: 46, color: 'var(--amber)' }}>
              {data.overall}
            </span>
            <span style={{ color: 'var(--muted)' }}>overall · {data.rank}</span>
          </div>

          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            style={{ width: '100%', maxWidth: 340, alignSelf: 'center', overflow: 'visible' }}
            role="img"
            aria-label={axes.map((a) => `${a.label} ${a.level} of ${MAX}, ${a.tier}`).join('. ')}
          >
            {/* The web. Faint, because the shape is the subject, not the grid. */}
            {rings.map((r) => (
              <polygon
                key={r}
                points={polygon(axes.map(() => r))}
                fill="none"
                stroke="var(--ink-line)"
                strokeWidth={r === MAX ? 1.5 : 1}
              />
            ))}
            {axes.map((a, i) => {
              const p = point(i, axes.length, MAX);
              return <line key={a.key} x1={CENTRE} y1={CENTRE} x2={p.x} y2={p.y} stroke="var(--ink-line)" strokeWidth={1} />;
            })}

            <polygon
              points={polygon(axes.map((a) => a.level))}
              fill="var(--amber)"
              fillOpacity={0.22}
              stroke="var(--amber)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {axes.map((a, i) => {
              const p = point(i, axes.length, a.level);
              return <circle key={a.key} cx={p.x} cy={p.y} r={3.5} fill="var(--amber)" />;
            })}

            {/* Labels sit outside the web so a full spoke never covers its own name. */}
            {axes.map((a, i) => {
              const p = point(i, axes.length, MAX + 2.6);
              const dx = p.x - CENTRE;
              return (
                <text
                  key={a.key}
                  x={p.x}
                  y={p.y}
                  fill="var(--muted)"
                  fontSize={12}
                  textAnchor={Math.abs(dx) < 12 ? 'middle' : dx > 0 ? 'start' : 'end'}
                  dominantBaseline="middle"
                >
                  {a.label}
                </text>
              );
            })}
          </svg>

          <div className="stack">
            {axes.map((a) => {
              const isOpen = open === a.key;
              return (
                <div key={a.key}>
                  <button
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : a.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: 'var(--ink-raised)',
                      border: '1px solid var(--ink-line)',
                      minHeight: 'var(--tap)',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block' }}>{a.tier}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>{a.label}</span>
                    </span>
                    <span className="num" style={{ fontSize: 21, color: 'var(--amber)' }}>
                      {a.level}
                      <span style={{ color: 'var(--muted)', fontSize: '0.7em' }}>/{MAX}</span>
                    </span>
                  </button>

                  {/* A stat nobody can audit is a stat nobody believes. */}
                  {isOpen && (
                    <Detail
                      rows={a.sources.map((s) => ({
                        label: s.label,
                        value: `${s.reached} of ${s.available}`,
                      }))}
                      progress={
                        a.sources.length
                          ? 'Depth reached against depth available, weighted by how much there is to reach.'
                          : 'Nothing feeds this yet.'
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
