import { BadRequest, handle } from '@/lib/api';
import { isValidDate, today as todayDate, weekStart } from '@/lib/dates';
import { microProgress } from '@/lib/rules';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Micros never count toward the three weekly sessions. They only log here. */
export async function POST(req: Request) {
  return handle(req, async (body) => {
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) throw new BadRequest('name is required');

    const date = isValidDate(body?.date) ? body.date : todayDate();
    const count =
      typeof body?.count === 'number' && body.count > 0 ? Math.min(50, Math.round(body.count)) : 1;
    const week = weekStart(date);

    const store = getStore();
    const micros = await store.getMicros();
    const micro = micros.find((m) => m.name === name);
    if (!micro) throw new BadRequest(`No micro named "${name}"`);

    const entry = await store.createMicroLog(micro.name, date, count, week);
    const log = await store.getMicroLogSince(week);

    return {
      entry,
      weekStart: week,
      micros: microProgress(micros, log, week),
      store: store.name,
    };
  });
}
