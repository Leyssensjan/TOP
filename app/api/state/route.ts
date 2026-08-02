import { handle } from '@/lib/api';
import { STRENGTH } from '@/lib/config';
import { addDays, today as todayDate, weekStart } from '@/lib/dates';
import {
  assistedSlots,
  levelUpProposals,
  microProgress,
  rollingStatus,
  sessionsNeeded,
  sessionsUntilNextSlot,
  nextSlotToUnlock,
  unitOf,
} from '@/lib/rules';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(req, async () => {
    const date = todayDate();
    const week = weekStart(date);

    const store = getStore();
    const [slots, skills, strengthSkills, sessions, micros, microLog, assistLog] = await Promise.all([
      store.getSlots(),
      store.getSkills('movement'),
      store.getSkills('strength'),
      store.getSessionsSince(addDays(date, -1200)),
      store.getMicros(),
      store.getMicroLogSince(week),
      // The assist rule looks back further than this week's counts do.
      store.getMicroLogSince(addDays(date, -60)),
    ]);

    const assisted = assistedSlots(micros, assistLog, date);
    const nextSlot = nextSlotToUnlock(slots);
    const untilNextSlot = sessionsUntilNextSlot(slots, sessions);

    // Which strength ladder serves which slot. Notion wins, config is fallback.
    const servesOf = (family: string): number | null => {
      const row = strengthSkills.find((s) => s.family === family && s.servesSlot !== null);
      return row?.servesSlot ?? STRENGTH.serves[family] ?? null;
    };

    // The Form: twelve slots, the movement at each current level, locked ones flagged.
    const form = slots.map((slot) => {
      // Resolved by the stable slot id, displayed by Sequence.
      const slotId = slot.slotId || slot.sequence;
      const ladder = skills
        .filter((s) => s.slot === slotId)
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
      const current = ladder.find((s) => s.level === slot.currentLevel) ?? ladder[0] ?? null;
      const next = ladder.find((s) => s.level === slot.currentLevel + 1) ?? null;

      return {
        slot: slot.sequence,
        slotId,
        name: slot.name,
        active: slot.active,
        inShortForm: slot.inShortForm,
        currentLevel: slot.currentLevel,
        maxLevel: ladder.length,
        unlockOrder: slot.unlockOrder,
        unlockedOn: slot.unlockedOn,
        entryPosition: slot.entryPosition,
        exitPosition: slot.exitPosition,
        // Every node names what it serves and what it opens. Cross-links are
        // what turn eight screens into one app.
        micros: micros
          .filter((m) => m.feedsSlot === slotId && !m.retired)
          .map((m) => ({ id: m.id, name: m.name, active: m.active })),
        strengthFamilies: STRENGTH.ladders.filter((f) => servesOf(f) === slotId),
        assisted: assisted.has(slotId),
        sessionsNeeded: sessionsNeeded(slotId, assisted),
        // The next slot to arrive is the most motivating row on the screen and
        // must not look identical to the one arriving in two years.
        isNextToUnlock: nextSlot ? nextSlot.id === slot.id : false,
        sessionsAway: nextSlot && nextSlot.id === slot.id ? untilNextSlot : null,
        current: current && {
          id: current.id,
          name: current.name,
          level: current.level,
          cues: current.cues,
          referenceTerm: current.referenceTerm,
          whyBuilds: current.whyBuilds,
          whyUnlocks: current.whyUnlocks,
          whySkate: current.whySkate,
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

    // The five strength ladders, in the same shape as the Form rows, because
    // they expand into the same detail panel.
    const strength = STRENGTH.ladders.map((family) => {
      const ladder = strengthSkills
        .filter((s) => s.family === family)
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
      const current = ladder.find((s) => s.status === 'current') ?? ladder[0] ?? null;
      const next = current ? ladder.find((s) => (s.level ?? 0) === (current.level ?? 0) + 1) ?? null : null;
      const serves = servesOf(family);

      return {
        family,
        serves,
        servesName: slots.find((s) => (s.slotId || s.sequence) === serves)?.name ?? null,
        // A ladder that serves nothing in the Form needs its reason stated.
        note: serves === null ? (STRENGTH.notes[family] ?? '') : '',
        currentLevel: current?.level ?? 0,
        maxLevel: ladder.length,
        unit: current ? unitOf(current) : 'reps',
        current: current && {
          id: current.id,
          name: current.name,
          level: current.level,
          cues: current.cues,
          referenceTerm: current.referenceTerm,
          whyBuilds: current.whyBuilds,
          whyUnlocks: current.whyUnlocks,
          whySkate: current.whySkate,
          lastPracticed: current.lastPracticed,
        },
        next: next && { id: next.id, name: next.name, level: next.level },
        ladder: ladder.map((s) => ({ id: s.id, name: s.name, level: s.level, status: s.status })),
      };
    });

    return {
      date,
      weekStart: week,
      form,
      strength,
      activeSlots: form.filter((f) => f.active).length,
      horizon: nextSlot
        ? { slot: nextSlot.slotId || nextSlot.sequence, name: nextSlot.name, inSessions: untilNextSlot }
        : null,
      rolling: rollingStatus(sessions, date),
      micros: microProgress(micros, microLog, week).map((m) => {
        const slot = slots.find((s) => (s.slotId || s.sequence) === m.feedsSlot);
        return {
          ...m,
          feedsName: slot?.name ?? null,
          assisting: m.feedsSlot !== null && assisted.has(m.feedsSlot),
        };
      }),
      proposals: levelUpProposals(slots, skills, sessions, date, assisted),
      store: store.name,
    };
  });
}
