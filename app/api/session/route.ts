import { BadRequest, handle } from '@/lib/api';
import { addDays, isValidDate, today as todayDate } from '@/lib/dates';
import { flowsSinceUnlock, roundsForFlow, rollingStatus } from '@/lib/rules';
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

    const distanceKm =
      typeof body?.distanceKm === 'number' && body.distanceKm >= 0 ? body.distanceKm : null;
    const routeName = typeof body?.route === 'string' ? body.route.slice(0, 200) : '';

    // Logged sets arrive with the session rather than one write at a time, so
    // an offline morning queues exactly one item and lands whole or not at all.
    const sets: Array<{ skill: string; reps: number | null; seconds: number | null }> = Array.isArray(body?.sets)
      ? body.sets
          .filter((s: any) => s && typeof s.skill === 'string')
          .slice(0, 200)
          .map((s: any) => ({
            skill: s.skill.slice(0, 200),
            reps: typeof s.reps === 'number' ? Math.max(0, Math.round(s.reps)) : null,
            seconds: typeof s.seconds === 'number' ? Math.max(0, Math.round(s.seconds)) : null,
          }))
      : [];

    // The offline queue can retry the same write. The client id makes that safe.
    const clientId =
      typeof body?.clientId === 'string' ? body.clientId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 24) : '';

    const store = getStore();
    // Both domains: a Strength session practises ladder movements, which live
    // outside the Form, and its skill ids would otherwise match nothing here.
    const [slots, movementSkills, strengthSkills, recent] = await Promise.all([
      store.getSlots(),
      store.getSkills('movement'),
      store.getSkills('strength'),
      store.getSessionsSince(addDays(date, -120)),
    ]);
    const skills = [...movementSkills, ...strengthSkills];

    if (clientId) {
      const existing = recent.find((s) => s.name.includes(`[${clientId}]`));
      if (existing) {
        return {
          session: existing,
          duplicate: true,
          rolling: rollingStatus(recent, date),
          store: store.name,
        };
      }
    }

    const practiced = skills.filter((s) => skillIds.includes(s.id));
    if (skillIds.length && !practiced.length) {
      throw new BadRequest('None of the given skillIds matched a skill');
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
      distanceKm,
      route: routeName,
    });

    // Set numbers restart per movement, which is how the level-up rule counts
    // them: three sets of eight of one lift, not three across the session.
    if (sets.length) {
      const seen = new Map<string, number>();
      const numbered = sets.map((set) => {
        const n = (seen.get(set.skill) ?? 0) + 1;
        seen.set(set.skill, n);
        return { ...set, set: n };
      });
      await Promise.all(
        numbered.map((set) =>
          store.createStrengthSet({
            date,
            skill: set.skill,
            set: set.set,
            reps: set.reps,
            seconds: set.seconds,
            session: clientId,
          }),
        ),
      );
    }

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

    // A round-ramp crossing is never a proposal — it just happens, and gets
    // stated once. Only Flow advances the ramp.
    let roundsUp: number | null = null;
    if (completed && type === 'flow') {
      const before = roundsForFlow(flowsSinceUnlock(slots, recent));
      const now = roundsForFlow(flowsSinceUnlock(slots, after));
      if (now > before) {
        roundsUp = now;
        await store.createMilestone({
          date,
          kind: 'rounds up',
          subject: `Rounds up to ${now}`,
          detail: `The Form now runs ${now} times through.`,
          session: clientId,
        });
      }
    }

    return {
      session,
      duplicate: false,
      roundsUp,
      rolling: rollingStatus(after, date),
      store: store.name,
    };
  });
}
