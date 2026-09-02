'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Detail from '@/components/Detail';
import { Cell, Cells, Header, HeaderAction, Pips, Section, TabBar } from '@/components/Chrome';
import { ApiError, api, getKey } from '@/lib/client/store';

interface Axis {
  key: string;
  label: string;
  level: number;
  score: number;
  tier: string;
  sources: Array<{ label: string; reached: number; available: number }>;
}

interface ProfilePayload {
  date: string;
  axes: Axis[];
  overall: number;
  rank: string;
  xp: number;
  xpFloor: number;
  xpToNext: number;
  nextRank: string | null;
  rankIndex: number;
  rankCount: number;
  nextUnlock: { name: string; axis: string; have: number; need: number } | null;
}

const MAX = 10;

/**
 * The profile, as a character sheet.
 *
 * It was a radar chart, and a radar chart needs width on both sides of its
 * centre for the labels — which a 390px phone does not have, so "Mobility" and
 * "Nerve" were clipped off opposite edges. Seven bars on one grid carry the same
 * seven numbers, fit the width, and rank the weak axes for you, which the web
 * never did: reading which spoke was shortest meant comparing lengths radiating
 * in seven directions.
 *
 * Still no new measurement. Everything here is state that already exists
 * elsewhere, so the screen can be deleted without trace.
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
  // The bar fills between this rank's threshold and the next, not from zero:
  // from zero it would barely move for a year.
  const span = data ? Math.max(1, data.xp + data.xpToNext - data.xpFloor) : 1;
  const into = data ? Math.max(0, data.xp - data.xpFloor) : 0;

  return (
    <main className="app">
      <Header
        title="Profile"
        right={
          /* The design put a fictional "Edit" here. Progress is the history
             behind this sheet, and the tab bar leaves it with no way in. */
          <HeaderAction onClick={() => router.push('/progress')}>Progress</HeaderAction>
        }
      />

      <div className="app-content" style={{ gap: 18 }}>
        {error && <div className="banner banner-warn">{error}</div>}
        {!data && !error && <p className="eyebrow">Loading</p>}

        {data && (
          <>
            {/* Who you are, at a glance: the badge, the name, the bar. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    position: 'relative',
                    width: 76,
                    height: 76,
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid var(--amber)',
                    borderRadius: 20,
                    background: 'var(--card)',
                  }}
                >
                  <span className="num" style={{ fontSize: 52, lineHeight: 0.8, color: 'var(--amber)' }}>
                    {data.overall}
                  </span>
                  <span
                    style={{
                      position: 'absolute',
                      bottom: -9,
                      padding: '2px 8px',
                      background: 'var(--ink)',
                      border: '1px solid var(--ink-line)',
                      borderRadius: 6,
                      fontSize: 10,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      color: 'var(--muted)',
                    }}
                  >
                    Level
                  </span>
                </div>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em' }}>{data.rank}</div>
                  <div
                    style={{
                      fontSize: 13,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                    }}
                  >
                    Rank {data.rankIndex + 1} of {data.rankCount}
                    {data.nextRank && ` · Next: ${data.nextRank}`}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Pips filled={into} total={span} segments={20} height={12} gradient />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                  <span>{data.xp} XP</span>
                  <span>{data.nextRank ? `${data.xpToNext} to ${data.nextRank}` : 'Top rank'}</span>
                </div>
              </div>
            </div>

            {/* The seven spokes, as rows. Tapping one still says what fed it. */}
            <Section
              title="Attributes"
              action={
                <span className="eyebrow" style={{ color: 'var(--sage)' }}>
                  {axes.filter((a) => a.level > 0).length} of {axes.length} moving
                </span>
              }
              gap={8}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {axes.map((axis) => (
                  <div key={axis.key}>
                    <button
                      onClick={() => setOpen(open === axis.key ? null : axis.key)}
                      aria-expanded={open === axis.key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '104px 1fr 52px',
                        alignItems: 'center',
                        gap: 12,
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 0',
                        minHeight: 40,
                      }}
                    >
                      <span style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {axis.label}
                      </span>
                      <Pips filled={axis.level} total={MAX} />
                      <span
                        className="num"
                        style={{
                          fontSize: 22,
                          textAlign: 'right',
                          color: axis.level > 0 ? 'var(--amber)' : 'var(--dimmer)',
                        }}
                      >
                        {axis.level}
                      </span>
                    </button>

                    {open === axis.key && (
                      <Detail
                        rows={[
                          { label: 'Tier', value: axis.tier },
                          ...axis.sources.map((src) => ({
                            label: src.label,
                            value: `${src.reached} of ${src.available}`,
                          })),
                        ]}
                        footnote={
                          <>A spoke is depth reached against depth available, never a share of the graph.</>
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </Section>

            {/* The nearest closed door. */}
            {data.nextUnlock && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  background: 'var(--sunken)',
                  border: '1px solid var(--ink-line)',
                  borderRadius: 14,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow eyebrow-action" style={{ marginBottom: 4 }}>
                    Next unlock
                  </div>
                  <div style={{ fontSize: 15 }}>
                    {data.nextUnlock.axis ? `${data.nextUnlock.axis} opens ` : 'Opens '}
                    {data.nextUnlock.name}
                  </div>
                </div>
                <span className="row-value" style={{ fontSize: 24 }}>
                  {data.nextUnlock.have}
                  <span>/{data.nextUnlock.need}</span>
                </span>
              </div>
            )}

            <div className="pinned">
              <Cells columns={3}>
                <Cell value={data.overall} caption="Level" tone="amber" />
                <Cell
                  value={axes.reduce((sum, a) => sum + a.level, 0)}
                  caption="Levels deep"
                  tone="text"
                />
                <Cell value={data.xp} caption="XP" tone="sage" />
              </Cells>
            </div>
          </>
        )}
      </div>

      <TabBar />
    </main>
  );
}
