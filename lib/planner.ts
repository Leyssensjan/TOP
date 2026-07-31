/**
 * Weekly plan generation. Section 5: the week is generated once and then
 * locks; each morning the app opens on today's session with zero decisions.
 *
 * This is the most speculative part of the brief, so it is a plain
 * deterministic pass with every number in PLANNER in config. It does not
 * reach for a calendar or a forecast itself — those arrive as inputs, because
 * the server has no credentials for either and pretending otherwise would
 * make the planner untestable.
 */

import { PLANNER, TARGET_MINUTES } from '@/lib/config';
import { addDays, weekStart } from '@/lib/dates';
import type { NewPlanEntry, PlanSessionType } from '@/lib/types';

export interface PlannerInput {
  weekStart: string;
  /** Days with little time available. They get the short fallback, not a skip. */
  busyDays?: string[];
  /** Evenings earmarked for skating, from the forecast. */
  skateWindows?: string[];
  /** Days that must stay empty. */
  blockedDays?: string[];
}

export interface PlannedWeek {
  weekStart: string;
  entries: NewPlanEntry[];
  /** Why the week looks like this, in plain sentences. */
  rationale: string[];
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

export function generateWeek(input: PlannerInput): PlannedWeek {
  const cfg = PLANNER;
  const start = weekStart(input.weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const busy = new Set(input.busyDays ?? []);
  const blocked = new Set(input.blockedDays ?? []);
  const skateWindows = new Set(input.skateWindows ?? []);

  const type: Record<string, PlanSessionType> = {};
  const note: Record<string, string> = {};
  const rationale: string[] = [];
  days.forEach((d) => {
    type[d] = 'rest';
  });

  const workable = (d: string) => !blocked.has(d);
  // The morning before a skate window stays light, so it cannot carry strength.
  const dayBeforeSkate = (d: string) => cfg.lightBeforeSkate && skateWindows.has(addDays(d, 1));

  // 1. Strength first: it is the part that keeps the system honest, and it has
  //    the tightest constraints.
  const strengthPlaced: string[] = [];
  for (const weekday of cfg.strengthDays) {
    if (strengthPlaced.length >= cfg.strength) break;
    const d = days[weekday];
    if (!workable(d) || busy.has(d) || dayBeforeSkate(d)) continue;
    if (cfg.strengthNeverConsecutive && strengthPlaced.some((p) => Math.abs(days.indexOf(p) - weekday) === 1)) continue;
    type[d] = 'strength';
    const winter = !cfg.outdoorMonths.includes(monthOf(d));
    note[d] = winter
      ? 'Rabotpark is dark and cold this month and no indoor fallback is written yet.'
      : '';
    strengthPlaced.push(d);
  }
  if (strengthPlaced.length) {
    rationale.push(
      `${strengthPlaced.length} strength ${strengthPlaced.length === 1 ? 'session' : 'sessions'}, the pulling the Form cannot give you.`,
    );
  }

  // 2. Engine.
  let enginePlaced = 0;
  for (const weekday of cfg.engineDays) {
    if (enginePlaced >= cfg.engine) break;
    const d = days[weekday];
    if (!workable(d) || type[d] !== 'rest' || busy.has(d) || dayBeforeSkate(d)) continue;
    type[d] = 'engine';
    enginePlaced += 1;
  }

  // 3. Fill up to the session target with Flow, leaving the rest days alone.
  const counted = () => days.filter((d) => type[d] !== 'rest').length;
  for (const d of days) {
    if (counted() >= cfg.sessions) break;
    if (!workable(d) || type[d] !== 'rest') continue;
    if (days.filter((x) => type[x] === 'rest' && workable(x)).length <= cfg.minRestDays) break;
    type[d] = 'flow';
  }

  // 4. Constraints that override whatever landed above. A rest day stays rest:
  //    never plan more than the agenda supports.
  let shortened = 0;
  let lightened = 0;
  for (const d of days) {
    if (type[d] === 'rest') continue;
    if (busy.has(d)) {
      type[d] = cfg.busyDayType;
      note[d] = 'Short day. This still counts as a full session.';
      shortened += 1;
    } else if (dayBeforeSkate(d) && type[d] === 'flow') {
      type[d] = cfg.busyDayType;
      note[d] = 'Light before tomorrow’s skate window.';
      lightened += 1;
    }
  }

  // The rationale describes the plan that came out, not the rules that ran.
  if (lightened) {
    rationale.push(`${lightened} light ${lightened === 1 ? 'morning' : 'mornings'} before a skate window, legs fresh.`);
  } else if (skateWindows.size) {
    rationale.push(
      `${skateWindows.size} skate ${skateWindows.size === 1 ? 'window' : 'windows'}; the mornings before ${skateWindows.size === 1 ? 'it was' : 'them were'} already free.`,
    );
  }
  if (shortened) {
    rationale.push(`${shortened} short ${shortened === 1 ? 'day' : 'days'} dropped to Flow Short rather than skipped.`);
  }
  const restCount = days.filter((d) => type[d] === 'rest').length;
  rationale.push(`${counted()} sessions planned against a target of ${cfg.sessions}, and ${restCount} rest days.`);
  rationale.push('An executed twenty minutes beats a skipped sixty.');

  const entries: NewPlanEntry[] = days.map((day, i) => {
    const t = type[day];
    const winter = !cfg.outdoorMonths.includes(monthOf(day));
    return {
      name: `${DAY_NAMES[i]} ${t}`,
      weekStart: start,
      day,
      sessionType: t,
      plannedMinutes: t === 'rest' ? null : (TARGET_MINUTES[t] ?? null),
      location:
        t === 'strength'
          ? winter
            ? cfg.winterLocation
            : cfg.outdoorLocation
          : t === 'engine'
            ? 'outside'
            : t === 'rest'
              ? ''
              : cfg.homeLocation,
      status: 'planned',
      reasonNote: note[day] ?? '',
    };
  });

  return { weekStart: start, entries, rationale };
}
