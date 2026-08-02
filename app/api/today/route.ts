import { handle } from '@/lib/api';
import { addDays, isValidDate, today as todayDate } from '@/lib/dates';
import {
  assistedSlots,
  chooseProposal,
  flowsSinceUnlock,
  levelUpProposals,
  nextSlotToUnlock,
  planSession,
  rollingStatus,
  sessionsUntilNextSlot,
  buildSkateSession,
  slotUnlockProposal,
  strengthLevelUpProposals,
  skateProposals,
  rotateMicros,
  assistStreaks,
  microProgress,
} from '@/lib/rules';
import { suggestNext } from '@/lib/planner';
import { MICRO_ROTATION, SKATE_SESSION } from '@/lib/config';
import { weekStart } from '@/lib/dates';
import { getStore } from '@/lib/store';
import type { SessionType } from '@/lib/types';

const TYPES: SessionType[] = ['flow', 'flow short', 'strength', 'engine', 'skate'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(req, async () => {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const date = isValidDate(dateParam) ? dateParam : todayDate();
    // "Give me a skate session" asks for a type outright, whatever the plan or
    // the suggestion says. Skating is opportunistic; the weather decides.
    const wanted = url.searchParams.get('type');
    const forced: SessionType | null = TYPES.includes(wanted as SessionType) ? (wanted as SessionType) : null;

    const store = getStore();
    const [slots, movementSkills, strengthSkills, planEntry, sessions, sets, micros, microLog] =
      await Promise.all([
        store.getSlots(),
        store.getSkills('movement'),
        store.getSkills('strength'),
        store.getPlanForDay(date),
        // Slot unlocks are counted over the whole history, not a rolling window.
        store.getSessionsSince(addDays(date, -1200)),
        store.getStrengthSetsSince(addDays(date, -400)),
        store.getMicros(),
        // Far enough back for both the assist streak and the retirement window.
        store.getMicroLogSince(addDays(date, -7 * (MICRO_ROTATION.retireAfterUntouchedWeeks + MICRO_ASSIST_LOOKBACK))),
      ]);

    // Rotation used to run only when a week was generated, and week generation
    // was removed — so it never ran at all. It is deterministic for a given
    // week, so running it every morning converges and then writes nothing.
    await reconcileMicros(store, micros, microLog, slots, movementSkills, date);

    // A planned day wins. Otherwise the suggestion decides, so the big number
    // and the suggestion line can never contradict each other.
    const planned = planEntry?.sessionType;
    const suggestion = suggestNext(sessions, date);
    const type: SessionType =
      forced ??
      (planned && planned !== 'rest'
        ? (planned as SessionType)
        : ((suggestion.type === 'rest' ? 'flow' : suggestion.type) as SessionType));
    const source = planEntry ? 'plan' : 'default';

    const skills = [...movementSkills, ...strengthSkills];
    const flowsDone = flowsSinceUnlock(slots, sessions);
    const session = planSession(
      slots,
      skills,
      type,
      date,
      source,
      planEntry?.plannedMinutes ?? null,
      flowsDone,
    );

    // The skate log is small; the 190 tricks are not. Read the log first and
    // only pay for the tricks when this is actually a skate day, or when the
    // log already looks like it might propose something.
    const skateSets = await store.getSkateSetsSince(addDays(date, -400));
    const needTricks = type === 'skate' || mightPropose(skateSets);
    const tricks = needTricks ? await store.getSkills('skate') : [];

    // Engine and Skate carry a reference card rather than a movement list.
    if (type === 'engine') {
      session.engine = { routes: await store.getRoutes() };
    } else if (type === 'skate') {
      session.skate = { blocks: buildSkateSession(tricks, skateSets, date) };
    }

    const assisted = assistedSlots(micros, microLog, date);
    const nextSlot = nextSlotToUnlock(slots);
    const untilNextSlot = sessionsUntilNextSlot(slots, sessions);
    const loggedToday = sessions.filter((s) => s.date === date && s.completed);

    return {
      date,
      rest: planned === 'rest' && !forced,
      session,
      alreadyLogged: loggedToday.length > 0,
      loggedToday: loggedToday.map((s) => ({ id: s.id, type: s.type, actualMinutes: s.actualMinutes })),
      rolling: rollingStatus(sessions, date),
      suggestion,
      flowSessionsCompleted: flowsDone,
      // At most one decision on a dark morning. Breadth beats depth.
      proposal: chooseProposal(
        slotUnlockProposal(slots, sessions, date),
        levelUpProposals(slots, skills, sessions, date, assisted),
        strengthLevelUpProposals(strengthSkills, sets, sessions, date),
        skateProposals(tricks, skateSets, date),
      ),
      // The horizon: the only place the arc is stated every single morning.
      horizon: nextSlot
        ? { slot: nextSlot.slotId || nextSlot.sequence, name: nextSlot.name, inSessions: untilNextSlot }
        : null,
      // The micros live on Today: they are tapped through the day, and making
      // that a trip to another screen is exactly the friction that loses them.
      micros: microProgress(micros, microLog, weekStart(date)).map((m) => {
        const slot = slots.find((s) => (s.slotId || s.sequence) === m.feedsSlot);
        return {
          ...m,
          feedsName: slot?.name ?? null,
          assisting: m.feedsSlot !== null && assisted.has(m.feedsSlot),
        };
      }),
      store: store.name,
    };
  });
}

/**
 * Could any trick possibly clear the bar? Answered from the log alone, so a
 * Flow morning never pays to read 190 rows it will not use.
 */
function mightPropose(sets: Awaited<ReturnType<ReturnType<typeof getStore>['getSkateSetsSince']>>): boolean {
  const byPair = new Map<string, { landed: number; attempts: number }>();
  for (const set of sets) {
    const key = `${set.trick}|${set.session}`;
    const prior = byPair.get(key) ?? { landed: 0, attempts: 0 };
    byPair.set(key, { landed: prior.landed + set.landed, attempts: prior.attempts + set.attempts });
  }
  return [...byPair.values()].some(
    (v) => v.landed >= SKATE_SESSION.landsToPropose && v.attempts >= SKATE_SESSION.minAttempts,
  );
}

/** Weeks of history the assist streak needs on top of the retirement window. */
const MICRO_ASSIST_LOOKBACK = 4;

/**
 * Bring Notion in line with what the rotation rule wants, writing only the rows
 * that actually differ. Idempotent, so calling it on every Today load is safe
 * and settles to zero writes once the week's set is correct.
 */
async function reconcileMicros(
  store: ReturnType<typeof getStore>,
  micros: Awaited<ReturnType<ReturnType<typeof getStore>['getMicros']>>,
  microLog: Awaited<ReturnType<ReturnType<typeof getStore>['getMicroLogSince']>>,
  slots: Awaited<ReturnType<ReturnType<typeof getStore>['getSlots']>>,
  skills: Awaited<ReturnType<ReturnType<typeof getStore>['getSkills']>>,
  date: string,
) {
  const week = weekStart(date);
  const rotation = rotateMicros(micros, microLog, slots, skills, week, false);
  const streaks = assistStreaks(micros, microLog, date);

  const wanted = new Map<string, { active: boolean; retired: boolean }>();
  for (const m of micros) wanted.set(m.id, { active: m.active, retired: m.retired });
  for (const m of rotation.activate) wanted.set(m.id, { active: true, retired: false });
  for (const m of rotation.deactivate) wanted.set(m.id, { active: false, retired: false });
  for (const m of rotation.retire) wanted.set(m.id, { active: false, retired: true });

  const writes = micros.flatMap((m) => {
    const want = wanted.get(m.id)!;
    const streak = streaks.get(m.id) ?? 0;
    const patch: { active?: boolean; retired?: boolean; assistStreakWeeks?: number } = {};
    if (want.active !== m.active) patch.active = want.active;
    if (want.retired !== m.retired) patch.retired = want.retired;
    if (streak !== m.assistStreakWeeks) patch.assistStreakWeeks = streak;
    return Object.keys(patch).length ? [store.updateMicro(m.id, patch)] : [];
  });

  await Promise.all(writes);
}
