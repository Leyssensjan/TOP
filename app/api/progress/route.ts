import { handle } from '@/lib/api';
import { addDays, today as todayDate } from '@/lib/dates';
import { streakWeeks } from '@/lib/rules';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The log. Milestones and sessions interleaved on one line, newest first,
 * because scrolling back through a year should read as a story with events in
 * it rather than as a spreadsheet.
 */
export async function GET(req: Request) {
  return handle(req, async () => {
    const date = todayDate();
    const store = getStore();
    const since = addDays(date, -1200);

    const [sessions, milestones] = await Promise.all([
      store.getSessionsSince(since),
      store.getMilestonesSince(since),
    ]);

    const done = sessions.filter((s) => s.completed);

    const entries = [
      ...milestones.map((m) => ({
        id: m.id,
        date: m.date,
        type: 'milestone' as const,
        kind: m.kind,
        subject: m.subject,
        detail: m.detail,
      })),
      ...done.map((s) => ({
        id: s.id,
        date: s.date,
        type: 'session' as const,
        sessionType: s.type,
        minutes: s.actualMinutes,
        difficulty: s.difficulty,
        soreness: s.soreness,
        distanceKm: s.distanceKm,
      })),
    ].sort((a, b) => (a.date === b.date ? (a.type === 'milestone' ? -1 : 1) : a.date < b.date ? 1 : -1));

    return {
      date,
      totalSessions: done.length,
      weeksAtTarget: streakWeeks(sessions, date),
      milestoneCount: milestones.length,
      entries,
      store: store.name,
    };
  });
}
