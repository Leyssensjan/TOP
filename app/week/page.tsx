'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, getKey } from '@/lib/client/store';
import { Header, HeaderAction, Section, TabBar } from '@/components/Chrome';
import { titleCase } from '@/lib/format';

interface PlanEntry {
  id: string;
  day: string | null;
  sessionType: string | null;
  plannedMinutes: number | null;
  location: string;
  status: string | null;
  reasonNote: string;
}

interface WeekPayload {
  weekStart: string;
  entries: PlanEntry[];
  sessions: number;
  target: number;
  planDays?: number[];
  rationale?: string[];
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Rest first, because clearing a day is the most common correction.
 *
 * Skate is not here. Skating happens in the evening and lives on the Skate
 * screen; this week is the morning routine, and mixing the two put a session
 * in the plan that Today could not open on.
 */
const CHOICES = ['rest', 'flow', 'flow short', 'strength', 'engine'] as const;

const COLOUR: Record<string, string> = {
  flow: 'var(--amber)',
  'flow short': 'var(--amber)',
  strength: 'var(--text)',
  engine: 'var(--text)',
  rest: 'var(--muted)',
};

/**
 * The week, laid out on Sunday for the days ahead.
 *
 * Three steps, in the order they are actually done: mark the mornings that
 * work, generate, then correct any single day by tapping it. The middle step
 * used to run on PLANNER.planDays — a guess that every week is Monday to
 * Friday — which made the result something to rewrite rather than something to
 * accept. Availability is still seven taps and nothing typed.
 *
 * A planned day always wins over the daily suggestion, so once this is set
 * Today simply opens on it.
 */
export default function WeekPage() {
  const router = useRouter();
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<WeekPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<Set<string>>(new Set());

  // Planning happens on Sunday for the week ahead, so on the last day of the
  // week the screen opens on next week rather than on the one that is ending.
  useEffect(() => {
    const now = new Date();
    const isSunday = now.getDay() === 0;
    void api<WeekPayload>(`/week${isSunday ? `?weekStart=${addDays(isoToday(), 1)}` : ''}`)
      .then((res) => {
        setWeek(res.weekStart);
        setData(res);
        setAvailable(availabilityFor(res));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace('/');
        else setError(err instanceof Error ? err.message : 'Could not load');
      });
  }, [router]);

  const load = useCallback(
    async (start: string) => {
      if (!getKey()) {
        router.replace('/');
        return;
      }
      try {
        const res = await api<WeekPayload>(`/week?weekStart=${start}`);
        setWeek(res.weekStart);
        setData(res);
        // Only on load. Generating must not fold the selection back to whatever
        // the planner managed to place, or a marked day the target left empty
        // would silently unmark itself.
        setAvailable(availabilityFor(res));
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) router.replace('/');
        else setError(err instanceof Error ? err.message : 'Could not load');
      }
    },
    [router],
  );

  const shift = (weeks: number) => {
    if (!week) return;
    void load(addDays(week, weeks * 7));
  };

  // One tap writes one day. No Save button to forget, and nothing is lost if
  // the phone is put down halfway through planning.
  const setDay = async (day: string, sessionType: string) => {
    if (!week) return;
    setBusy(true);
    setEditing(null);
    try {
      const res = await api<WeekPayload>('/week', {
        method: 'POST',
        body: { weekStart: week, entries: [{ day, sessionType }] },
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const toggleAvailable = (day: string) => {
    setAvailable((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const generate = async () => {
    if (!week || available.size === 0) return;
    setBusy(true);
    setEditing(null);
    try {
      const res = await api<WeekPayload>('/week', {
        method: 'POST',
        body: {
          weekStart: week,
          generate: true,
          replace: true,
          availableDays: [...available].sort(),
        },
      });
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate');
    } finally {
      setBusy(false);
    }
  };

  const days = week ? Array.from({ length: 7 }, (_, i) => addDays(week, i)) : [];
  const byDay = new Map((data?.entries ?? []).filter((e) => e.day).map((e) => [e.day as string, e]));

  return (
    <main className="app">
      <Header
        title="Week"
        right={
          /* The design put a fictional "Edit" here. Routes is real, and the
             week is where engine days get placed, so it earns the slot. */
          <HeaderAction onClick={() => router.push('/routes')}>Routes</HeaderAction>
        }
      />

      <div className="app-content" style={{ gap: 14 }}>
        {error && <div className="banner banner-warn">{error}</div>}
        {!data && !error && <p className="eyebrow">Loading</p>}

        {data && week && (
          <>
            {/* Three columns, so the date cannot wrap around the arrows. */}
            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', gap: 8 }}>
              <button className="btn" onClick={() => shift(-1)} style={STEP}>
                ‹
              </button>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Week of {shortDate(week)}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {data.sessions} of {available.size || data.target} planned
                </div>
              </div>
              <button className="btn" onClick={() => shift(1)} style={STEP}>
                ›
              </button>
            </div>

            <Section title="Mornings that work">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {days.map((day, i) => (
                  <button
                    key={day}
                    className="btn"
                    disabled={busy}
                    aria-pressed={available.has(day)}
                    onClick={() => toggleAvailable(day)}
                    style={{ minHeight: 46, height: 46, padding: 0, borderRadius: 12, fontSize: 13 }}
                  >
                    {DAY_NAMES[i]}
                  </button>
                ))}
              </div>
            </Section>

            <button
              className="btn btn-primary"
              disabled={busy || available.size === 0}
              onClick={() => void generate()}
            >
              {available.size === 0 ? 'Mark a morning first' : 'Generate week'}
            </button>

            {/* One 52px label column down the whole week, so Mon to Sun line
                up rather than each row starting wherever its name ends. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {days.map((day, i) => {
                const entry = byDay.get(day);
                const type = entry?.sessionType ?? 'rest';
                const isRest = type === 'rest';
                const isEditing = editing === day;

                return (
                  <div key={day}>
                    <button
                      disabled={busy}
                      aria-expanded={isEditing}
                      onClick={() => setEditing(isEditing ? null : day)}
                      className={`row${isRest ? ' row-quiet' : ''}`}
                      style={{ gridTemplateColumns: '52px 1fr auto', minHeight: 52, padding: '0 16px' }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          color: isRest ? 'var(--dimmer)' : 'var(--muted)',
                        }}
                      >
                        {DAY_NAMES[i]}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 16,
                            color: isRest ? 'var(--dimmer)' : (COLOUR[type] ?? 'var(--text)'),
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {titleCase(type)}
                        </span>
                        {(entry?.location || entry?.reasonNote) && (
                          <span className="row-sub" style={{ display: 'block' }}>
                            {[entry.location, entry.reasonNote].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      {/* The design shows a clock time here. The plan holds
                          minutes, not a time of day, so it shows the minutes. */}
                      <span style={{ fontSize: 13, color: isRest ? 'var(--dimmest)' : 'var(--dim)' }}>
                        {isRest || entry?.plannedMinutes == null ? '—' : `${entry.plannedMinutes} min`}
                      </span>
                    </button>

                    {isEditing && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '8px 0 2px' }}>
                        {CHOICES.map((c) => (
                          <button
                            key={c}
                            className="btn btn-inline"
                            disabled={busy}
                            aria-pressed={type === c}
                            onClick={() => void setDay(day, c)}
                          >
                            {titleCase(c)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="pinned" style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Tap any day to swap that one session. Skating stays on the Skate screen.
            </p>
          </>
        )}
      </div>

      <TabBar />
    </main>
  );
}

/** The week stepper's two arrow buttons. */
const STEP = { minHeight: 44, height: 44, padding: 0, borderRadius: 12, fontSize: 18 } as const;

/**
 * Which mornings open pre-marked: the days an already planned week uses, so
 * returning to a planned week shows the availability it was built from, and
 * otherwise the weekdays the planner owns by default. The literal is only a
 * fallback for a response that predates planDays.
 */
function availabilityFor(res: WeekPayload): Set<string> {
  const planned = res.entries
    .filter((e) => e.day && e.sessionType && e.sessionType !== 'rest')
    .map((e) => e.day as string);
  if (planned.length) return new Set(planned);
  return new Set((res.planDays ?? [0, 1, 2, 3, 4]).map((i) => addDays(res.weekStart, i)));
}

function isoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
}
