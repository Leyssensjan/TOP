import { handle } from '@/lib/api';
import { addDays, isValidDate, today as todayDate } from '@/lib/dates';
import { levelUpProposals, planSession, rollingStatus } from '@/lib/rules';
import { getStore } from '@/lib/store';
import type { SessionType } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(req, async () => {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const date = isValidDate(dateParam) ? dateParam : todayDate();

    const store = getStore();
    const [slots, skills, planEntry, sessions] = await Promise.all([
      store.getSlots(),
      store.getSkills('movement'),
      store.getPlanForDay(date),
      store.getSessionsSince(addDays(date, -120)),
    ]);

    // The week is not generated yet, so an unplanned morning defaults to Flow.
    const planned = planEntry?.sessionType;
    const type: SessionType =
      planned && planned !== 'rest' ? (planned as SessionType) : 'flow';
    const source = planEntry ? 'plan' : 'default';

    const session = planSession(
      slots,
      skills,
      type,
      date,
      source,
      planEntry?.plannedMinutes ?? null,
    );

    const loggedToday = sessions.filter((s) => s.date === date && s.completed);

    return {
      date,
      rest: planned === 'rest',
      session,
      alreadyLogged: loggedToday.length > 0,
      loggedToday: loggedToday.map((s) => ({ id: s.id, type: s.type, actualMinutes: s.actualMinutes })),
      rolling: rollingStatus(sessions, date),
      proposals: levelUpProposals(slots, skills, sessions, date),
      store: store.name,
    };
  });
}
