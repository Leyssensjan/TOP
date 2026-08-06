import { handle } from '@/lib/api';
import { addDays, today as todayDate } from '@/lib/dates';
import { profileStats } from '@/lib/rules';
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

    return { date, ...profileStats(slots, movement, strength, skate, sessions, date), store: store.name };
  });
}
