import { handle } from '@/lib/api';
import { SKATE_FOCUS } from '@/lib/config';
import { today as todayDate } from '@/lib/dates';
import { skateFocus, unlockableTricks } from '@/lib/rules';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The Skate screen reads here rather than from /api/state, because 190 tricks
 * have no business loading on every Today screen.
 */
export async function GET(req: Request) {
  return handle(req, async () => {
    const date = todayDate();
    const store = getStore();
    const tricks = await store.getSkills('skate');
    const unlockable = unlockableTricks(tricks);

    return {
      date,
      focus: skateFocus(tricks, date),
      counts: {
        total: tricks.length,
        locked: tricks.filter((t) => t.status === 'locked').length,
        current: tricks.filter((t) => t.status === 'current').length,
        mastered: tricks.filter((t) => t.status === 'mastered').length,
      },
      rustAfterDays: SKATE_FOCUS.rustAfterDays,
      tricks: tricks
        .map((t) => ({
          id: t.id,
          skillId: t.skillId,
          name: t.name,
          family: t.family,
          level: t.level ?? 0,
          status: t.status,
          prereqs: t.prereqs,
          attempts: t.attempts,
          lastPracticed: t.lastPracticed,
          unlockable: unlockable.has(t.id),
        }))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
      store: store.name,
    };
  });
}
