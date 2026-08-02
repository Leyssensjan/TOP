import { BadRequest, handle } from '@/lib/api';
import { ROUND_RAMP, SLOT_UNLOCK } from '@/lib/config';
import { today as todayDate } from '@/lib/dates';
import { nextSlotToUnlock } from '@/lib/rules';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Breadth: the Form gets longer. The single most motivating event in the
 * system, and until now it was a checkbox in Notion.
 *
 * Accepting also resets the round count to the bottom band, so a longer
 * sequence at fewer rounds is the same session length. That reset is the whole
 * point: the Form grows without the morning growing.
 */
export async function POST(req: Request) {
  return handle(req, async (body) => {
    const action = body?.action === 'defer' ? 'defer' : body?.action === 'accept' ? 'accept' : null;
    if (!action) throw new BadRequest('action must be "accept" or "defer"');

    const date = todayDate();
    const store = getStore();
    const slots = await store.getSlots();

    const next = nextSlotToUnlock(slots);
    if (!next) throw new BadRequest('Every slot is already in the Form');

    if (action === 'defer') {
      // A deferred unlock is silenced by dating it forward: the rule counts
      // Flow sessions since the last unlock, so this restarts that count.
      await store.updateSlot(next.id, { unlockedOn: date });
      return { action, slot: next.slotId || next.sequence, name: next.name, deferredOn: date };
    }

    await store.updateSlot(next.id, { active: true, unlockedOn: date });

    const roundsAfter = ROUND_RAMP[0].rounds;
    const detail = SLOT_UNLOCK.resetRounds
      ? `Added ${next.name}. Rounds reset to ${roundsAfter}.`
      : `Added ${next.name}.`;

    await store.createMilestone({
      date,
      kind: 'slot unlock',
      subject: next.name,
      detail,
    });

    return {
      action,
      slot: next.slotId || next.sequence,
      name: next.name,
      activeSlots: slots.filter((s) => s.active).length + 1,
      roundsAfter,
      detail,
    };
  });
}
