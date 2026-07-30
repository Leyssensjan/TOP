// Domain rules from sections 4, 5 and 6 of the brief. No storage, no Notion.

import {
  DEFAULT_SLOT_SECONDS,
  LEVELUP_DEFER_DAYS,
  LEVELUP_EASY_STREAK,
  LEVELUP_MIN_SESSIONS,
  MAX_LEVEL,
  ROLLING_WINDOW_DAYS,
  SESSIONS_PER_WINDOW,
  SLOT_SECONDS,
  TARGET_MINUTES,
} from '@/lib/config';
import { addDays, daysBetween } from '@/lib/dates';
import type { Micro, MicroLogEntry, SessionLog, SessionType, Skill, Slot } from '@/lib/types';

export interface Movement {
  slot: number;
  slotName: string;
  skillId: string;
  name: string;
  level: number;
  cues: string;
  referenceTerm: string;
  entryPosition: string;
  exitPosition: string;
  seconds: number;
}

export interface SessionPlan {
  date: string;
  type: SessionType;
  source: 'plan' | 'default';
  targetMinutes: number;
  totalSeconds: number;
  rounds: number;
  /** One pass through the Form. The Runner repeats it `rounds` times. */
  movements: Movement[];
  note: string | null;
}

export interface LevelUpProposal {
  slot: number;
  slotName: string;
  slotId: string;
  fromLevel: number;
  toLevel: number;
  currentSkillId: string;
  currentSkillName: string;
  nextSkillId: string;
  nextSkillName: string;
  sessionsAtLevel: number;
}

const FORM_TYPES: SessionType[] = ['flow', 'flow short'];

export function isFormSession(type: SessionType): boolean {
  return FORM_TYPES.includes(type);
}

function slotSeconds(sequence: number): number {
  return SLOT_SECONDS[sequence] ?? DEFAULT_SLOT_SECONDS;
}

/**
 * Resolve the slots that make up a session into the movement at each slot's
 * current level. Slot order is the Sequence field, so reordering the Form is
 * one number per row in Notion, as the brief asks.
 */
export function buildMovements(slots: Slot[], skills: Skill[], type: SessionType): Movement[] {
  const chosen = slots
    .filter((s) => s.active && (type !== 'flow short' || s.inShortForm))
    .sort((a, b) => a.sequence - b.sequence);

  const movements: Movement[] = [];
  for (const slot of chosen) {
    const skill =
      skills.find((s) => s.slot === slot.sequence && s.level === slot.currentLevel) ??
      skills.filter((s) => s.slot === slot.sequence).sort((a, b) => (a.level ?? 0) - (b.level ?? 0))[0];
    if (!skill) continue;
    movements.push({
      slot: slot.sequence,
      slotName: slot.name,
      skillId: skill.id,
      name: skill.name,
      level: skill.level ?? slot.currentLevel,
      cues: skill.cues,
      referenceTerm: skill.referenceTerm,
      entryPosition: slot.entryPosition,
      exitPosition: slot.exitPosition,
      seconds: slotSeconds(slot.sequence),
    });
  }
  return movements;
}

/**
 * The Form is a closed loop: slot 12 exits standing and slot 1 enters standing.
 * So a longer session is whole extra rounds rather than a padded part-round,
 * which keeps every transition intact.
 */
export function planSession(
  slots: Slot[],
  skills: Skill[],
  type: SessionType,
  date: string,
  source: 'plan' | 'default',
  targetMinutesOverride?: number | null,
): SessionPlan {
  const targetMinutes = targetMinutesOverride ?? TARGET_MINUTES[type] ?? 20;

  if (!isFormSession(type)) {
    return {
      date,
      type,
      source,
      targetMinutes,
      totalSeconds: targetMinutes * 60,
      rounds: 1,
      movements: [],
      note:
        type === 'strength'
          ? 'The Strength template is not written yet. Log it when you are done.'
          : 'No movement list for this type yet. Log it when you are done.',
    };
  }

  const movements = buildMovements(slots, skills, type);
  const roundSeconds = movements.reduce((sum, m) => sum + m.seconds, 0);

  if (!movements.length || roundSeconds === 0) {
    return {
      date,
      type,
      source,
      targetMinutes,
      totalSeconds: 0,
      rounds: 0,
      movements: [],
      note: 'No active slots. Tick Active on at least one slot in Notion.',
    };
  }

  const rounds = Math.max(1, Math.round((targetMinutes * 60) / roundSeconds));
  return {
    date,
    type,
    source,
    targetMinutes,
    totalSeconds: roundSeconds * rounds,
    rounds,
    movements,
    note: null,
  };
}

/** Check-in: minutes available and energy bend the session, never the week. */
export function adjustForCheckin(
  plan: SessionPlan,
  input: { minutes?: number | null; energy?: 'low' | 'ok' | 'good' | null; soreness?: string },
): SessionPlan {
  if (!isFormSession(plan.type)) return plan;

  let type = plan.type;
  let minutes = input.minutes ?? plan.targetMinutes;

  // Low energy or very little time drops to Flow Short, which still counts
  // as a full session. That is the whole point of it existing.
  if (input.energy === 'low' || minutes <= 8) {
    type = 'flow short';
    minutes = Math.min(minutes, TARGET_MINUTES['flow short']);
  }

  return { ...plan, type, targetMinutes: minutes };
}

export interface RollingStatus {
  count: number;
  target: number;
  windowDays: number;
  windowStart: string;
  /** Days until the session that currently holds up the third slot expires. */
  daysRemaining: number | null;
  short: number;
  streakWeeks: number;
}

export function rollingStatus(sessions: SessionLog[], today: string): RollingStatus {
  const windowStart = addDays(today, -(ROLLING_WINDOW_DAYS - 1));
  const inWindow = sessions
    .filter((s) => s.completed && s.date >= windowStart && s.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const count = inWindow.length;
  let daysRemaining: number | null = null;
  if (count >= SESSIONS_PER_WINDOW) {
    const holding = inWindow[SESSIONS_PER_WINDOW - 1];
    daysRemaining = Math.max(0, daysBetween(today, addDays(holding.date, ROLLING_WINDOW_DAYS)));
  }

  return {
    count,
    target: SESSIONS_PER_WINDOW,
    windowDays: ROLLING_WINDOW_DAYS,
    windowStart,
    daysRemaining,
    short: Math.max(0, SESSIONS_PER_WINDOW - count),
    streakWeeks: streakWeeks(sessions, today),
  };
}

/**
 * Weeks, not days. A week counts if three sessions landed in it. Counting runs
 * backwards in seven-day blocks from today, so missing a day costs nothing.
 */
export function streakWeeks(sessions: SessionLog[], today: string): number {
  const done = sessions.filter((s) => s.completed);
  if (!done.length) return 0;

  let weeks = 0;
  for (let i = 0; i < 104; i += 1) {
    const end = addDays(today, -i * ROLLING_WINDOW_DAYS);
    const start = addDays(end, -(ROLLING_WINDOW_DAYS - 1));
    const count = done.filter((s) => s.date >= start && s.date <= end).length;
    if (count >= SESSIONS_PER_WINDOW) weeks += 1;
    else break;
  }
  return weeks;
}

/**
 * A slot proposes a level-up after eight sessions at the current level with
 * "easy" on at least the last three. The app proposes; Jan decides.
 */
export function levelUpProposals(
  slots: Slot[],
  skills: Skill[],
  sessions: SessionLog[],
  today: string,
): LevelUpProposal[] {
  const proposals: LevelUpProposal[] = [];
  const history = sessions
    .filter((s) => s.completed)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const slot of slots) {
    if (!slot.active) continue;
    if (slot.currentLevel >= MAX_LEVEL) continue;

    const current = skills.find((s) => s.slot === slot.sequence && s.level === slot.currentLevel);
    const next = skills.find((s) => s.slot === slot.sequence && s.level === slot.currentLevel + 1);
    if (!current || !next) continue;
    if (current.sessionsAtLevel < LEVELUP_MIN_SESSIONS) continue;

    if (current.levelUpDeferred) {
      const since = daysBetween(current.levelUpDeferred, today);
      if (since < LEVELUP_DEFER_DAYS) continue;
    }

    const withSkill = history.filter((s) => s.skillsPracticed.includes(current.name));
    const recent = withSkill.slice(0, LEVELUP_EASY_STREAK);
    if (recent.length < LEVELUP_EASY_STREAK) continue;
    if (!recent.every((s) => s.difficulty === 'easy')) continue;

    proposals.push({
      slot: slot.sequence,
      slotName: slot.name,
      slotId: slot.id,
      fromLevel: slot.currentLevel,
      toLevel: slot.currentLevel + 1,
      currentSkillId: current.id,
      currentSkillName: current.name,
      nextSkillId: next.id,
      nextSkillName: next.name,
      sessionsAtLevel: current.sessionsAtLevel,
    });
  }
  return proposals;
}

export interface MicroProgress {
  id: string;
  name: string;
  trigger: string;
  cue: string;
  duration: string;
  feedsSlot: number | null;
  weeklyTarget: number | null;
  count: number;
}

export function microProgress(
  micros: Micro[],
  log: MicroLogEntry[],
  weekStartDate: string,
): MicroProgress[] {
  return micros
    .filter((m) => m.active)
    .map((m) => ({
      id: m.id,
      name: m.name,
      trigger: m.trigger,
      cue: m.cue,
      duration: m.duration,
      feedsSlot: m.feedsSlot,
      weeklyTarget: m.weeklyTarget,
      count: log
        .filter((l) => l.name === m.name && (l.weekStart === weekStartDate || l.date >= weekStartDate))
        .reduce((sum, l) => sum + (l.count || 0), 0),
    }));
}
