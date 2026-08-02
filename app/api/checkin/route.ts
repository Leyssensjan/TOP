import { handle } from '@/lib/api';
import { addDays, isValidDate, today as todayDate } from '@/lib/dates';
import { adjustForCheckin, countFlowSessions, planSession, rollingStatus, skateFocus } from '@/lib/rules';
import { suggestNext } from '@/lib/planner';
import { getStore } from '@/lib/store';
import type { SessionType } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENERGY = ['low', 'ok', 'good'] as const;

export async function POST(req: Request) {
  return handle(req, async (body) => {
    const date = isValidDate(body?.date) ? body.date : todayDate();
    const minutes =
      typeof body?.minutes === 'number' && body.minutes > 0 ? Math.min(120, Math.round(body.minutes)) : null;
    const energy = ENERGY.includes(body?.energy) ? body.energy : null;
    const soreness = typeof body?.soreness === 'string' ? body.soreness.slice(0, 500) : '';

    const store = getStore();
    const [slots, movementSkills, strengthSkills, planEntry, sessions] = await Promise.all([
      store.getSlots(),
      store.getSkills('movement'),
      store.getSkills('strength'),
      store.getPlanForDay(date),
      store.getSessionsSince(addDays(date, -120)),
    ]);

    // Same resolution as Today, so tapping Adjust cannot silently turn a
    // suggested Strength day into a Flow day.
    const planned = planEntry?.sessionType;
    const suggestion = suggestNext(sessions, date);
    const type: SessionType =
      planned && planned !== 'rest'
        ? (planned as SessionType)
        : ((suggestion.type === 'rest' ? 'flow' : suggestion.type) as SessionType);

    const skills = [...movementSkills, ...strengthSkills];
    const flowsDone = countFlowSessions(sessions);
    const base = planSession(slots, skills, type, date, planEntry ? 'plan' : 'default', planEntry?.plannedMinutes ?? null, flowsDone);
    const adjustedTarget = adjustForCheckin(base, { minutes, energy, soreness });

    // Rebuild so a switch to Flow Short actually changes the movement list.
    const session = planSession(
      slots,
      skills,
      adjustedTarget.type,
      date,
      base.source,
      adjustedTarget.targetMinutes,
      flowsDone,
    );

    // Same reference cards Today attaches, so an adjusted session still starts.
    if (session.type === 'engine') {
      session.engine = { routes: await store.getRoutes() };
    } else if (session.type === 'skate') {
      session.skate = { focus: skateFocus(await store.getSkills('skate'), date) };
    }

    return {
      date,
      checkin: { minutes, energy, soreness },
      changed: session.type !== base.type || session.rounds !== base.rounds,
      was: { type: base.type, rounds: base.rounds, targetMinutes: base.targetMinutes },
      session,
      rolling: rollingStatus(sessions, date),
      store: store.name,
    };
  });
}
