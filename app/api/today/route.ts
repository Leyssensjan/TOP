import { handle } from '@/lib/api';
import { addDays, isValidDate, today as todayDate } from '@/lib/dates';
import {
  countFlowSessions,
  levelUpProposals,
  planSession,
  rollingStatus,
  skateFocus,
  strengthLevelUpProposals,
} from '@/lib/rules';
import { suggestNext } from '@/lib/planner';
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
    const [slots, movementSkills, strengthSkills, planEntry, sessions, sets] = await Promise.all([
      store.getSlots(),
      store.getSkills('movement'),
      store.getSkills('strength'),
      store.getPlanForDay(date),
      store.getSessionsSince(addDays(date, -120)),
      store.getStrengthSetsSince(addDays(date, -120)),
    ]);

    // A planned day wins. Otherwise the suggestion decides, so the big number
    // and the suggestion line can never contradict each other.
    const planned = planEntry?.sessionType;
    const suggestion = suggestNext(sessions, date);
    const type: SessionType =
      planned && planned !== 'rest'
        ? (planned as SessionType)
        : ((suggestion.type === 'rest' ? 'flow' : suggestion.type) as SessionType);
    const source = planEntry ? 'plan' : 'default';

    const skills = [...movementSkills, ...strengthSkills];
    const flowsDone = countFlowSessions(sessions);
    const session = planSession(
      slots,
      skills,
      type,
      date,
      source,
      planEntry?.plannedMinutes ?? null,
      flowsDone,
    );

    // Engine and Skate carry a reference card rather than a movement list. It
    // is fetched only for the type actually being run, so Today stays cheap.
    if (type === 'engine') {
      session.engine = { routes: await store.getRoutes() };
    } else if (type === 'skate') {
      session.skate = { focus: skateFocus(await store.getSkills('skate'), date) };
    }

    const loggedToday = sessions.filter((s) => s.date === date && s.completed);

    return {
      date,
      rest: planned === 'rest',
      session,
      alreadyLogged: loggedToday.length > 0,
      loggedToday: loggedToday.map((s) => ({ id: s.id, type: s.type, actualMinutes: s.actualMinutes })),
      rolling: rollingStatus(sessions, date),
      suggestion,
      flowSessionsCompleted: flowsDone,
      proposals: levelUpProposals(slots, skills, sessions, date),
      strengthProposals: strengthLevelUpProposals(strengthSkills, sets, sessions, date),
      store: store.name,
    };
  });
}
