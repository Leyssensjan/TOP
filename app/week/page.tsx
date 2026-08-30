'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, getKey } from '@/lib/client/store';
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
    <main className="screen" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">Week</span>
        <button className="label" onClick={() => router.push('/')} style={{ padding: '8px 0 8px 16px' }}>
          Today
        </button>
      </div>

      {error && <div className="banner banner-warn">{error}</div>}
      {!data && !error && <p className="label">Loading</p>}

      {data && week && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="label" onClick={() => shift(-1)} style={{ padding: '10px 6px' }}>
              ‹
            </button>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="num" style={{ fontSize: 30, color: 'var(--amber)' }}>
                {data.sessions}
              </span>
              <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                of {data.target} planned · week of {shortDate(week)}
              </span>
            </span>
            <button className="label" onClick={() => shift(1)} style={{ padding: '10px 6px' }}>
              ›
            </button>
          </div>

          <div>
            <span className="label">Mornings that work</span>
            <div style={{ display: 'flex', gap: 6, paddingTop: 10 }}>
              {days.map((day, i) => (
                <button
                  key={day}
                  className="btn"
                  disabled={busy}
                  aria-pressed={available.has(day)}
                  onClick={() => toggleAvailable(day)}
                  style={{ flex: 1, minWidth: 0, padding: '14px 0', fontSize: 15 }}
                >
                  {DAY_NAMES[i]}
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary"
            disabled={busy || available.size === 0}
            onClick={() => void generate()}
          >
            {available.size === 0 ? 'Mark a morning first' : 'Generate week'}
          </button>

          <div className="stack">
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      width: '100%',
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: isRest ? 'transparent' : 'var(--ink-raised)',
                      border: '1px solid var(--ink-line)',
                      opacity: isRest ? 0.55 : 1,
                      minHeight: 'var(--tap)',
                    }}
                  >
                    <span className="num" style={{ fontSize: 19, width: 42, flex: 'none', color: 'var(--muted)' }}>
                      {DAY_NAMES[i]}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', color: COLOUR[type] ?? 'var(--text)' }}>
                        {titleCase(type)}
                      </span>
                      {(entry?.location || entry?.reasonNote) && (
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>
                          {[entry.location, entry.reasonNote].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    {!isRest && entry?.plannedMinutes != null && (
                      <span className="num" style={{ fontSize: 21, color: 'var(--muted)', flex: 'none' }}>
                        {entry.plannedMinutes}
                      </span>
                    )}
                  </button>

                  {isEditing && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 0 4px' }}>
                      {CHOICES.map((c) => (
                        <button
                          key={c}
                          className="btn"
                          disabled={busy}
                          aria-pressed={type === c}
                          style={{ width: 'auto', flex: '1 1 30%', padding: '14px 8px', fontSize: 15 }}
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

          {data.rationale?.length ? (
            <div className="panel" style={{ padding: '4px 2px' }}>
              {data.rationale.map((line) => (
                <p key={line} style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: 15 }}>
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 'auto' }}>
            Tap any day to swap that one session. A planned day wins over the daily suggestion, so
            Today just opens on it. Skating stays on the Skate screen.
          </p>
        </>
      )}
    </main>
  );
}

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
