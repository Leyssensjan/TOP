import { handle } from '@/lib/api';
import { addDays, today as todayDate, weekStart } from '@/lib/dates';
import { levelUpProposals, microProgress, rollingStatus } from '@/lib/rules';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(req, async () => {
    const date = todayDate();
    const week = weekStart(date);

    const store = getStore();
    const [slots, skills, sessions, micros, microLog] = await Promise.all([
      store.getSlots(),
      store.getSkills('movement'),
      store.getSessionsSince(addDays(date, -120)),
      store.getMicros(),
      store.getMicroLogSince(week),
    ]);

    // The Form: twelve slots, the movement at each current level, locked ones flagged.
    const form = slots.map((slot) => {
      const ladder = skills
        .filter((s) => s.slot === slot.sequence)
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
      const current = ladder.find((s) => s.level === slot.currentLevel) ?? ladder[0] ?? null;
      const next = ladder.find((s) => s.level === slot.currentLevel + 1) ?? null;
      return {
        slot: slot.sequence,
        name: slot.name,
        active: slot.active,
        inShortForm: slot.inShortForm,
        currentLevel: slot.currentLevel,
        maxLevel: ladder.length,
        unlockOrder: slot.unlockOrder,
        entryPosition: slot.entryPosition,
        exitPosition: slot.exitPosition,
        current: current && {
          id: current.id,
          name: current.name,
          level: current.level,
          cues: current.cues,
          referenceTerm: current.referenceTerm,
          whyBuilds: current.whyBuilds,
          whyUnlocks: current.whyUnlocks,
          sessionsAtLevel: current.sessionsAtLevel,
          lastPracticed: current.lastPracticed,
          durationSeconds: current.durationSeconds,
        },
        next: next && { id: next.id, name: next.name, level: next.level, cues: next.cues },
        // The whole ladder, so the detail view can show what comes after next.
        ladder: ladder.map((s) => ({
          id: s.id,
          name: s.name,
          level: s.level,
          status: s.status,
          referenceTerm: s.referenceTerm,
        })),
      };
    });

    return {
      date,
      weekStart: week,
      form,
      activeSlots: form.filter((f) => f.active).length,
      rolling: rollingStatus(sessions, date),
      micros: microProgress(micros, microLog, week),
      proposals: levelUpProposals(slots, skills, sessions, date),
      store: store.name,
    };
  });
}
