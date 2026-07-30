import { BadRequest, handle } from '@/lib/api';
import { isValidDate, today as todayDate, weekStart } from '@/lib/dates';
import { getStore } from '@/lib/store';
import type { NewPlanEntry, PlanSessionType } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLAN_TYPES: PlanSessionType[] = ['flow', 'flow short', 'strength', 'engine', 'skate', 'rest'];

export async function GET(req: Request) {
  return handle(req, async () => {
    const url = new URL(req.url);
    const param = url.searchParams.get('weekStart');
    const week = isValidDate(param) ? weekStart(param) : weekStart(todayDate());

    const store = getStore();
    const entries = await store.getPlanForWeek(week);
    return { weekStart: week, entries, locked: entries.length > 0, store: store.name };
  });
}

/**
 * Writes the week. Generation (calendar and forecast) is step 6 of the build
 * order, so this endpoint takes the entries it is given and stores them.
 */
export async function POST(req: Request) {
  return handle(req, async (body) => {
    const week = isValidDate(body?.weekStart) ? weekStart(body.weekStart) : weekStart(todayDate());
    const input = Array.isArray(body?.entries) ? body.entries : null;
    if (!input) throw new BadRequest('entries must be an array');

    const store = getStore();
    const existing = await store.getPlanForWeek(week);
    const byDay = new Map(existing.filter((e) => e.day).map((e) => [e.day as string, e]));

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
        plannedMinutes: typeof raw.plannedMinutes === 'number' ? Math.round(raw.plannedMinutes) : null,
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

    return { weekStart: week, entries: written, store: store.name };
  });
}
