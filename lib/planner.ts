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

import { PLANNER, SUGGESTION, TARGET_MINUTES } from '@/lib/config';
import { addDays, daysBetween, weekStart } from '@/lib/dates';
import { rollingStatus } from '@/lib/rules';
import type { NewPlanEntry, PlanSessionType, SessionLog } from '@/lib/types';

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

  // A day outside planDays is not a rest day the planner chose, it is a day
  // the planner does not own. Both look like rest in the output; only this one
  // can never be filled.
  const plannable = new Set(cfg.planDays.map((i) => days[i]));
  const workable = (d: string) => !blocked.has(d) && plannable.has(d);
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
  //    Preference order first, so the recovery day lands mid-week rather than
  //    wherever the calendar happens to run out.
  const counted = () => days.filter((d) => type[d] !== 'rest').length;
  const flowOrder = [...cfg.flowDays.map((i) => days[i]), ...days];
  for (const d of flowOrder) {
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
  // Rest days are counted only where the planner could have put something.
  // The days it never owned are free, which is a different thing to say.
  const restCount = days.filter((d) => type[d] === 'rest' && plannable.has(d)).length;
  const freeCount = days.length - plannable.size;
  rationale.push(
    `${counted()} sessions planned against a target of ${cfg.sessions}, ${restCount} rest ${restCount === 1 ? 'day' : 'days'}` +
      (freeCount ? `, and ${freeCount} days left free.` : '.'),
  );
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

/**
 * The Today suggestion. This replaces week generation: no form, no inputs Jan
 * has to type, just a read of what the app already knows. The constraint logic
 * above is not deleted — it becomes the rule set behind this one line.
 */
export interface Suggestion {
  type: PlanSessionType;
  line: string;
  reasons: string[];
}

export function suggestNext(sessions: SessionLog[], today: string): Suggestion {
  const cfg = SUGGESTION;
  const done = sessions
    .filter((s) => s.completed)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const rolling = rollingStatus(done, today);
  const last = done[0];
  const reasons: string[] = [];

  if (!last) {
    return {
      type: cfg.whenNoHistory as PlanSessionType,
      line: `Nothing logged yet. Suggest ${titleOf(cfg.whenNoHistory)}.`,
      reasons: ['no history'],
    };
  }

  // Constraints carried over from the planner, applied to a single choice.
  const strengthInWindow = done.filter(
    (s) => s.type === 'strength' && s.date >= rolling.windowStart,
  ).length;
  const strengthYesterday =
    PLANNER.strengthNeverConsecutive &&
    done.some((s) => s.type === 'strength' && daysBetween(s.date, today) <= 1);

  const blocked = (type: string) => {
    if (type !== 'strength') return false;
    if (strengthYesterday) {
      reasons.push('strength was yesterday');
      return true;
    }
    if (strengthInWindow >= PLANNER.maxStrength) {
      reasons.push('two strength sessions already this week');
      return true;
    }
    return false;
  };

  // Target already met: the gentler option, never a push for more.
  if (rolling.count >= rolling.target) {
    reasons.push('weekly target already met');
    return {
      type: cfg.whenTargetMet as PlanSessionType,
      line: `${rolling.count} of ${rolling.target} this week. Last was ${titleOf(last.type)}. Suggest ${titleOf(cfg.whenTargetMet)}.`,
      reasons,
    };
  }

  const candidates = cfg.after[last.type] ?? cfg.after.flow;
  const pick = (candidates.find((c) => !blocked(c)) ?? cfg.whenNoHistory) as PlanSessionType;

  return {
    type: pick,
    line: `${rolling.count} of ${rolling.target} this week. Last was ${titleOf(last.type)}. Suggest ${titleOf(pick)}.`,
    reasons,
  };
}

function titleOf(type: string): string {
  return type.replace(/\b\w/g, (c) => c.toUpperCase());
}
