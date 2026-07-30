import { BadRequest, handle } from '@/lib/api';
import { addDays, isValidDate, today as todayDate } from '@/lib/dates';
import { levelUpProposals, rollingStatus } from '@/lib/rules';
import { getStore } from '@/lib/store';
import type { Difficulty, SessionType } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES: SessionType[] = ['flow', 'flow short', 'strength', 'engine', 'skate'];
const DIFFICULTIES: Difficulty[] = ['easy', 'right', 'hard'];

export async function POST(req: Request) {
  return handle(req, async (body) => {
    const date = isValidDate(body?.date) ? body.date : todayDate();
    const type: SessionType = TYPES.includes(body?.type) ? body.type : 'flow';
    const difficulty: Difficulty | null = DIFFICULTIES.includes(body?.difficulty) ? body.difficulty : null;
    const completed = body?.completed !== false;
    const actualMinutes =
      typeof body?.actualMinutes === 'number' ? Math.max(0, Math.round(body.actualMinutes)) : null;
    const plannedMinutes =
      typeof body?.plannedMinutes === 'number' ? Math.max(0, Math.round(body.plannedMinutes)) : null;
    const soreness = typeof body?.soreness === 'string' ? body.soreness.slice(0, 500) : '';
    const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 1500) : '';

    const skillIds: string[] = Array.isArray(body?.skillIds)
      ? body.skillIds.filter((s: unknown) => typeof s === 'string')
      : [];

    // The offline queue can retry the same write. The client id makes that safe.
    const clientId =
      typeof body?.clientId === 'string' ? body.clientId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 24) : '';

    const store = getStore();
    const [slots, skills, recent] = await Promise.all([
      store.getSlots(),
      store.getSkills('movement'),
      store.getSessionsSince(addDays(date, -120)),
    ]);

    if (clientId) {
      const existing = recent.find((s) => s.name.includes(`[${clientId}]`));
      if (existing) {
        return {
          session: existing,
          duplicate: true,
          rolling: rollingStatus(recent, date),
          proposals: levelUpProposals(slots, skills, recent, date),
          store: store.name,
        };
      }
    }

    const practiced = skills.filter((s) => skillIds.includes(s.id));
    if (skillIds.length && !practiced.length) {
      throw new BadRequest('None of the given skillIds matched a movement');
    }

    const session = await store.createSession({
      name: clientId ? `${type} ${date} [${clientId}]` : `${type} ${date}`,
      date,
      type,
      plannedMinutes,
      actualMinutes,
      completed,
      difficulty,
      soreness,
      notes,
      skillsPracticed: practiced.map((s) => s.name),
    });

    // Sessions at level is what drives the level-up proposal, so it only moves
    // when the session actually happened.
    if (completed) {
      await Promise.all(
        practiced.map((skill) =>
          store.updateSkill(skill.id, {
            sessionsAtLevel: (skill.sessionsAtLevel ?? 0) + 1,
            lastPracticed: date,
          }),
        ),
      );
    }

    const after = [...recent, { ...session }];
    const skillsAfter = skills.map((s) =>
      completed && practiced.some((p) => p.id === s.id)
        ? { ...s, sessionsAtLevel: (s.sessionsAtLevel ?? 0) + 1, lastPracticed: date }
        : s,
    );

    return {
      session,
      duplicate: false,
      rolling: rollingStatus(after, date),
      proposals: levelUpProposals(slots, skillsAfter, after, date),
      store: store.name,
    };
  });
}
