import { BadRequest, handle } from '@/lib/api';
import { MICRO_ROTATION, PLANNER, TARGET_MINUTES } from '@/lib/config';
import { addDays, isValidDate, today as todayDate, weekStart } from '@/lib/dates';
import { generateWeek } from '@/lib/planner';
import { rotateMicros } from '@/lib/rules';
import { getStore } from '@/lib/store';
import type { NewPlanEntry, PlanSessionType } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Skate is deliberately absent. Skating happens in the evening and is logged
// on the Skate screen; the week here is the morning training routine, and a
// skate day in it would be a session the Runner cannot run.
const PLAN_TYPES: PlanSessionType[] = ['flow', 'flow short', 'strength', 'engine', 'rest'];

export async function GET(req: Request) {
  return handle(req, async () => {
    const url = new URL(req.url);
    const param = url.searchParams.get('weekStart');
    const week = isValidDate(param) ? weekStart(param) : weekStart(todayDate());

    const store = getStore();
    const entries = await store.getPlanForWeek(week);
    return {
      weekStart: week,
      entries,
      locked: entries.length > 0,
      // The shape of the week, so the screen never has to recount it.
      sessions: entries.filter((e) => e.sessionType && e.sessionType !== 'rest').length,
      target: PLANNER.sessions,
      // The weekdays the planner owns by default, so the availability row can
      // open pre-marked on a normal week without the screen holding its own
      // copy of the config.
      planDays: PLANNER.planDays,
      store: store.name,
    };
  });
}

/**
 * Writes the week, either by generating it (generate: true) or by storing the
 * entries it is handed. Generating a week that already exists needs
 * replace: true, because the week is meant to lock once made.
 */
export async function POST(req: Request) {
  return handle(req, async (body) => {
    const week = isValidDate(body?.weekStart) ? weekStart(body.weekStart) : weekStart(todayDate());
    const store = getStore();

    // Generation reads the calendar and the forecast, which the server has no
    // credentials for, so they arrive as inputs. The week generates once and
    // then locks; it is never re-planned by the daily check-in.
    if (body?.generate === true) {
      const dates = (v: unknown) => (Array.isArray(v) ? v.filter(isValidDate) : []);
      const skateWindows = dates(body?.skateWindows);
      const planned = generateWeek({
        weekStart: week,
        availableDays: dates(body?.availableDays),
        busyDays: dates(body?.busyDays),
        skateWindows,
        blockedDays: dates(body?.blockedDays),
      });

      const existing = await store.getPlanForWeek(week);
      if (existing.length && body?.replace !== true) {
        throw new BadRequest('This week is already planned. Send replace: true to overwrite it.');
      }
      const priorByDay = new Map(existing.filter((e) => e.day).map((e) => [e.day as string, e]));

      const written = [];
      for (const entry of planned.entries) {
        const prior = priorByDay.get(entry.day);
        if (prior) {
          await store.updatePlanEntry(prior.id, entry);
          written.push({ ...prior, ...entry });
        } else {
          written.push(await store.createPlanEntry(entry));
        }
      }

      // Section 6: weekly plan generation is what selects the active micros.
      const [micros, microLog, slots, skills] = await Promise.all([
        store.getMicros(),
        store.getMicroLogSince(addDays(week, -MICRO_ROTATION.retireAfterUntouchedWeeks * 7)),
        store.getSlots(),
        store.getSkills('movement'),
      ]);
      // A skate project is driven by the evenings earmarked for skating, not by
      // a skate day in the plan: the week no longer holds one.
      const hasSkateProject = skateWindows.length > 0;
      const rotation = rotateMicros(micros, microLog, slots, skills, week, hasSkateProject);
      await Promise.all([
        ...rotation.activate.map((m) => store.updateMicro(m.id, { active: true })),
        ...rotation.deactivate.map((m) => store.updateMicro(m.id, { active: false })),
        ...rotation.retire.map((m) => store.updateMicro(m.id, { active: false, retired: true })),
      ]);

      return {
        weekStart: week,
        entries: written,
        rationale: planned.rationale,
        // The same count the manual write returns. Without these the header
        // reads "of planned" with two holes in it the moment a week is made.
        sessions: written.filter((e) => e.sessionType && e.sessionType !== 'rest').length,
        target: PLANNER.sessions,
        planDays: PLANNER.planDays,
        micros: {
          activated: rotation.activate.map((m) => m.name),
          deactivated: rotation.deactivate.length,
          retired: rotation.retire.map((m) => m.name),
          reasons: rotation.reasons,
        },
        store: store.name,
      };
    }

    const input = Array.isArray(body?.entries) ? body.entries : null;
    if (!input) throw new BadRequest('entries must be an array, or send generate: true');

    const existingManual = await store.getPlanForWeek(week);
    const byDay = new Map(existingManual.filter((e) => e.day).map((e) => [e.day as string, e]));

    const written = [];
    for (const raw of input) {
      if (!isValidDate(raw?.day)) throw new BadRequest('each entry needs a day as YYYY-MM-DD');
      if (!PLAN_TYPES.includes(raw?.sessionType)) {
        throw new BadRequest(`sessionType must be one of ${PLAN_TYPES.join(', ')}`);
      }

      const entry: NewPlanEntry = {
        weekStart: week,
        day: raw.day,
        sessionType: raw.sessionType,
        // Falls back to the type's target, so planning a day is one tap and
        // never a form asking how long the session should be.
        plannedMinutes:
          typeof raw.plannedMinutes === 'number'
            ? Math.round(raw.plannedMinutes)
            : (TARGET_MINUTES[raw.sessionType] ?? null),
        location: typeof raw.location === 'string' ? raw.location.slice(0, 200) : '',
        status: raw.status === 'done' || raw.status === 'skipped' ? raw.status : 'planned',
        reasonNote: typeof raw.reasonNote === 'string' ? raw.reasonNote.slice(0, 500) : '',
      };

      const prior = byDay.get(raw.day);
      if (prior) {
        await store.updatePlanEntry(prior.id, entry);
        written.push({ ...prior, ...entry });
      } else {
        written.push(await store.createPlanEntry(entry));
      }
    }

    const all = await store.getPlanForWeek(week);
    return {
      weekStart: week,
      entries: all.length ? all : written,
      sessions: all.filter((e) => e.sessionType && e.sessionType !== 'rest').length,
      target: PLANNER.sessions,
      store: store.name,
    };
  });
}
