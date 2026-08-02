import { BadRequest, handle } from '@/lib/api';
import { today as todayDate } from '@/lib/dates';
import { skateFocus, unlockableTricks } from '@/lib/rules';
import { getStore } from '@/lib/store';
import type { SkillStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: SkillStatus[] = ['locked', 'current', 'mastered'];

/**
 * Sets a trick's status, and stamps Last practiced so the rust clock restarts.
 *
 * Not in the endpoint list in section 8, which was written before the Skate
 * screen existed. A trick tracker has to be able to write, and overloading
 * /api/levelup, which is about slot ladders, would have been worse.
 *
 * Any trick can be set to any status, including locked ones. That is
 * deliberate: the migration starts everything locked, so nothing would ever
 * become reachable if the prerequisite gate were enforced here.
 */
export async function POST(req: Request) {
  return handle(req, async (body) => {
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) throw new BadRequest('id is required');

    const status: SkillStatus | null = STATUSES.includes(body?.status) ? body.status : null;
    const attempts = typeof body?.attempts === 'number' ? Math.max(0, Math.round(body.attempts)) : null;
    const defer = body?.defer === true;
    if (!status && attempts === null && !defer) throw new BadRequest('status, attempts or defer is required');

    const date = todayDate();
    const store = getStore();
    const tricks = await store.getSkills('skate');
    const trick = tricks.find((t) => t.id === id);
    if (!trick) throw new BadRequest('No skate trick with that id');

    // Deferring a mastery proposal silences it without touching the status.
    if (defer) {
      await store.updateSkill(id, { levelUpDeferred: date });
      return { id, status: trick.status, deferredOn: date, store: store.name };
    }

    await store.updateSkill(id, {
      ...(status ? { status } : {}),
      ...(attempts !== null ? { attempts } : {}),
      // Touching a trick confirms it, which is what clears the rust flag.
      lastPracticed: date,
    });

    // Only the crossing into mastered is an event. Cycling back through the
    // states while correcting a mistap must not litter the log.
    if (status === 'mastered' && trick.status !== 'mastered') {
      await store.createMilestone({
        date,
        kind: 'trick mastered',
        subject: trick.name,
        detail: trick.family ? `${trick.family}, level ${trick.level ?? '?'}.` : `Level ${trick.level ?? '?'}.`,
      });
    }

    const after = tricks.map((t) =>
      t.id === id
        ? { ...t, status: status ?? t.status, attempts: attempts ?? t.attempts, lastPracticed: date }
        : t,
    );
    const unlockable = unlockableTricks(after);

    return {
      id,
      status: status ?? trick.status,
      attempts: attempts ?? trick.attempts,
      lastPracticed: date,
      focus: skateFocus(after, date),
      counts: {
        total: after.length,
        locked: after.filter((t) => t.status === 'locked').length,
        current: after.filter((t) => t.status === 'current').length,
        mastered: after.filter((t) => t.status === 'mastered').length,
      },
      unlockable: after.filter((t) => unlockable.has(t.id)).map((t) => t.id),
      store: store.name,
    };
  });
}
