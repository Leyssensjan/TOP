import { handle } from '@/lib/api';
import { addDays, today as todayDate } from '@/lib/dates';
import { nextUnlock, profileStats } from '@/lib/rules';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(req, async () => {
    const date = todayDate();
    const store = getStore();

    const [slots, movement, strength, skate, sessions] = await Promise.all([
      store.getSlots(),
      store.getSkills('movement'),
      store.getSkills('strength'),
      store.getSkills('skate'),
      store.getSessionsSince(addDays(date, -1200)),
    ]);

    return {
      date,
      ...profileStats(slots, movement, strength, skate, sessions, date),
      // The nearest closed door, resolved here rather than in the component:
      // the screen reads state, it does not walk the graph.
      nextUnlock: nextUnlock(skate),
      store: store.name,
    };
  });
}
