import { BadRequest, handle } from '@/lib/api';
import { MAX_LEVEL } from '@/lib/config';
import { today as todayDate } from '@/lib/dates';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The app proposes, Jan decides. Never automatic. */
export async function POST(req: Request) {
  return handle(req, async (body) => {
    const ACTIONS = ['accept', 'defer', 'down'] as const;
    const action = ACTIONS.includes(body?.action) ? (body.action as (typeof ACTIONS)[number]) : null;
    if (!action) throw new BadRequest('action must be "accept", "defer" or "down"');

    const date = todayDate();
    const store = getStore();

    // A strength ladder is identified by its family, not by a Form slot: it has
    // no slot at all. Everything else about the decision is the same.
    const family = typeof body?.family === 'string' ? body.family : null;
    if (family) return strength(store, family, action, date);

    // This is the stable Slot id, which is what levelUpProposals emits. It is
    // deliberately not the Sequence: the Form can be reordered at any time.
    const slotNumber = typeof body?.slot === 'number' ? body.slot : null;
    if (slotNumber === null) throw new BadRequest('slot must be a number, or family a string');

    const [slots, skills] = await Promise.all([store.getSlots(), store.getSkills('movement')]);

    const slot = slots.find((s) => (s.slotId || s.sequence) === slotNumber);
    if (!slot) throw new BadRequest(`No slot with id ${slotNumber}`);
    const slotId = slot.slotId || slot.sequence;

    const current = skills.find((s) => s.slot === slotId && s.level === slot.currentLevel);
    if (!current) throw new BadRequest(`No movement at slot ${slotNumber} level ${slot.currentLevel}`);

    if (action === 'defer') {
      await store.updateSkill(current.id, { levelUpDeferred: date });
      return { action, slot: slotId, level: slot.currentLevel, deferredOn: date };
    }

    // Stepping down. A level set too high is not a failure to record, it is a
    // correction — so it writes no milestone and resets the clock at the level
    // below, which is where the work now actually is.
    if (action === 'down') {
      if (slot.currentLevel <= 1) throw new BadRequest(`${slot.name} is already at the bottom`);
      const below = skills.find((s) => s.slot === slotId && s.level === slot.currentLevel - 1);
      if (!below) throw new BadRequest(`No movement at slot ${slotNumber} level ${slot.currentLevel - 1}`);

      await store.updateSkill(current.id, { status: 'locked', levelUpDeferred: null, sessionsAtLevel: 0 });
      await store.updateSkill(below.id, { status: 'current', levelUpDeferred: null, sessionsAtLevel: 0 });
      await store.updateSlot(slot.id, { currentLevel: below.level ?? slot.currentLevel - 1 });

      return {
        action,
        slot: slotId,
        slotName: slot.name,
        fromLevel: slot.currentLevel,
        toLevel: below.level,
        movement: { id: below.id, name: below.name, cues: below.cues, referenceTerm: below.referenceTerm },
      };
    }

    if (slot.currentLevel >= MAX_LEVEL) throw new BadRequest(`Slot ${slotNumber} is already at the top level`);

    const next = skills.find((s) => s.slot === slotId && s.level === slot.currentLevel + 1);
    if (!next) throw new BadRequest(`No movement at slot ${slotNumber} level ${slot.currentLevel + 1}`);

    await store.updateSkill(current.id, { status: 'mastered', levelUpDeferred: null });
    await store.updateSkill(next.id, { status: 'current', sessionsAtLevel: 0 });
    await store.updateSlot(slot.id, { currentLevel: next.level ?? slot.currentLevel + 1 });

    await store.createMilestone({
      date,
      kind: 'level up',
      subject: next.name,
      detail: `${slot.name} to level ${next.level}. ${current.name} is done.`,
    });

    return {
      action,
      slot: slotId,
      slotName: slot.name,
      fromLevel: slot.currentLevel,
      toLevel: next.level,
      movement: { id: next.id, name: next.name, cues: next.cues, referenceTerm: next.referenceTerm },
    };
  });
}

/**
 * Strength ladders have no Slot row to update, so the current level is simply
 * which movement in the family carries the "current" status.
 */
async function strength(
  store: ReturnType<typeof getStore>,
  family: string,
  action: 'accept' | 'defer' | 'down',
  date: string,
) {
  const skills = await store.getSkills('strength');
  const ladder = skills
    .filter((s) => s.family === family)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  if (!ladder.length) throw new BadRequest(`No strength ladder called "${family}"`);

  const current = ladder.find((s) => s.status === 'current');
  if (!current) throw new BadRequest(`No current movement in the ${family} ladder`);

  if (action === 'defer') {
    await store.updateSkill(current.id, { levelUpDeferred: date });
    return { action, family, level: current.level, deferredOn: date };
  }

  if (action === 'down') {
    const below = ladder.find((s) => (s.level ?? 0) === (current.level ?? 0) - 1);
    if (!below) throw new BadRequest(`${current.name} is already at the bottom of the ${family} ladder`);
    await store.updateSkill(current.id, { status: 'locked', levelUpDeferred: null, sessionsAtLevel: 0 });
    await store.updateSkill(below.id, { status: 'current', levelUpDeferred: null, sessionsAtLevel: 0 });
    return {
      action,
      family,
      fromLevel: current.level,
      toLevel: below.level,
      movement: { id: below.id, name: below.name, cues: below.cues, referenceTerm: below.referenceTerm },
    };
  }

  const next = ladder.find((s) => (s.level ?? 0) === (current.level ?? 0) + 1);
  if (!next) throw new BadRequest(`${current.name} is already at the top of the ${family} ladder`);

  await store.updateSkill(current.id, { status: 'mastered', levelUpDeferred: null });
  await store.updateSkill(next.id, { status: 'current', sessionsAtLevel: 0 });

  await store.createMilestone({
    date,
    kind: 'strength level up',
    subject: next.name,
    detail: `${family} to level ${next.level}. ${current.name} is done.`,
  });

  return {
    action,
    family,
    fromLevel: current.level,
    toLevel: next.level,
    movement: { id: next.id, name: next.name, cues: next.cues, referenceTerm: next.referenceTerm },
  };
}
