// Domain rules from sections 4, 5 and 6 of the brief. No storage, no Notion.

import {
  DEFAULT_SLOT_SECONDS,
  LEVELUP_DEFER_DAYS,
  LEVELUP_EASY_STREAK,
  LEVELUP_MIN_SESSIONS,
  MAX_LEVEL,
  FLOW_SHORT_ROUNDS,
  MICRO_ROTATION,
  ROUND_RAMP,
  SKATE_FOCUS,
  STRENGTH,
  SWITCH_FAKIE_MARKERS,
  ROLLING_WINDOW_DAYS,
  SESSIONS_PER_WINDOW,
  SLOT_SECONDS,
  TARGET_MINUTES,
} from '@/lib/config';
import { addDays, daysBetween } from '@/lib/dates';
import type { Micro, MicroLogEntry, Route, SessionLog, SessionType, Skill, Slot, StrengthSet } from '@/lib/types';

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

export interface StrengthBlock {
  label: string;
  families: string[];
  rounds: number;
  restSeconds: number;
  fromMinute: number;
  toMinute: number;
  warmUp: boolean;
  movements: Array<{
    id: string;
    name: string;
    family: string;
    level: number | null;
    cues: string;
    referenceTerm: string;
    unit: 'reps' | 'seconds';
  }>;
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
  /** Only for Strength: the ladders, grouped into supersets. */
  strength?: { blocks: StrengthBlock[]; prescription: typeof STRENGTH.prescription };
  /** Only for Engine: the scouted routes, so one can be picked and logged. */
  engine?: { routes: Route[] };
  /** Only for Skate: the session focus card. */
  skate?: { focus: FocusTrick[] };
  note: string | null;
}

/**
 * Rounds ramp with experience. Session n is the (completed + 1)th Flow, and
 * takes the rounds of the first band it still fits inside. All in config.
 */
export function roundsForFlow(flowSessionsCompleted: number): number {
  const sessionNumber = Math.max(0, flowSessionsCompleted) + 1;
  return ROUND_RAMP.find((band) => sessionNumber <= band.throughSession)?.rounds ?? ROUND_RAMP[ROUND_RAMP.length - 1].rounds;
}

/** Completed Flow sessions so far. Flow Short does not advance the ramp. */
export function countFlowSessions(sessions: SessionLog[]): number {
  return sessions.filter((s) => s.completed && s.type === 'flow').length;
}

/** Strength, section 4: five ladders at their current level, run as supersets. */
export function buildStrength(skills: Skill[]): StrengthBlock[] {
  const currentOf = (family: string) =>
    skills
      .filter((s) => s.domain === 'strength' && s.family === family)
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
      .find((s) => s.status === 'current') ??
    skills
      .filter((s) => s.domain === 'strength' && s.family === family)
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))[0];

  return STRENGTH.blocks.map((block) => ({
    label: block.label,
    families: [...block.families],
    rounds: block.rounds,
    restSeconds: block.restSeconds,
    fromMinute: block.from,
    toMinute: block.to,
    warmUp: block.warmUp,
    movements: block.families
      .map((family) => {
        const skill = currentOf(family);
        return skill
          ? {
              id: skill.id,
              name: skill.name,
              family,
              level: skill.level,
              cues: skill.cues,
              referenceTerm: skill.referenceTerm,
              unit: unitOf(skill),
            }
          : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
  }));
}

/** How a set of this movement is counted. Notion wins; config is the fallback. */
export function unitOf(skill: Pick<Skill, 'unit'>): 'reps' | 'seconds' {
  return skill.unit ?? STRENGTH.defaultUnit;
}

/** A set is good enough to count towards a level-up. */
export function setClears(set: StrengthSet, unit: 'reps' | 'seconds'): boolean {
  return unit === 'seconds'
    ? (set.seconds ?? 0) >= STRENGTH.levelUpSeconds
    : (set.reps ?? 0) >= STRENGTH.levelUpReps;
}

export interface StrengthProposal {
  family: string;
  fromLevel: number;
  toLevel: number;
  currentSkillId: string;
  currentSkillName: string;
  nextSkillId: string;
  nextSkillName: string;
  unit: 'reps' | 'seconds';
  clearedSets: number;
  onDate: string;
}

/**
 * Strength levels up on logged work rather than on sessions attended: three
 * sets of eight, in one session, closed at a difficulty that counts as clean.
 * Every number is in STRENGTH. Proposed, never automatic.
 */
export function strengthLevelUpProposals(
  skills: Skill[],
  sets: StrengthSet[],
  sessions: SessionLog[],
  today: string,
): StrengthProposal[] {
  // Sets carry the session's client id; the session carries it inside its name.
  // Matching on it keeps a set tied to the difficulty Jan actually reported.
  const cleanSessions = new Set(
    sessions
      .filter((s) => s.completed && STRENGTH.cleanDifficulties.includes(s.difficulty ?? ''))
      .map((s) => s.name.match(/\[([^\]]+)\]/)?.[1] ?? '')
      .filter(Boolean),
  );

  const proposals: StrengthProposal[] = [];

  for (const family of STRENGTH.ladders) {
    const ladder = skills
      .filter((s) => s.domain === 'strength' && s.family === family)
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

    const current = ladder.find((s) => s.status === 'current');
    if (!current) continue;
    const next = ladder.find((s) => (s.level ?? 0) === (current.level ?? 0) + 1);
    if (!next) continue;

    if (current.levelUpDeferred && daysBetween(current.levelUpDeferred, today) < LEVELUP_DEFER_DAYS) continue;

    const unit = unitOf(current);
    // Grouped by session, because three sets of eight means three in one
    // session, not three good sets accumulated over a month.
    const bySession = new Map<string, StrengthSet[]>();
    for (const set of sets) {
      if (set.skill !== current.name) continue;
      if (!cleanSessions.has(set.session)) continue;
      if (!setClears(set, unit)) continue;
      const list = bySession.get(set.session) ?? [];
      list.push(set);
      bySession.set(set.session, list);
    }

    const qualifying = [...bySession.values()]
      .filter((list) => list.length >= STRENGTH.levelUpSets)
      .sort((a, b) => (a[0].date < b[0].date ? 1 : -1))[0];
    if (!qualifying) continue;

    proposals.push({
      family,
      fromLevel: current.level ?? 0,
      toLevel: next.level ?? (current.level ?? 0) + 1,
      currentSkillId: current.id,
      currentSkillName: current.name,
      nextSkillId: next.id,
      nextSkillName: next.name,
      unit,
      clearedSets: qualifying.length,
      onDate: qualifying[0].date,
    });
  }

  return proposals;
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
    // Resolved by the stable slot id. Sequence only decides the order, so the
    // Form can be reordered without repointing a single movement. Falling back
    // to Sequence matters: an empty Slot id would otherwise empty the Form.
    const slotId = slot.slotId || slot.sequence;
    const skill =
      skills.find((s) => s.slot === slotId && s.level === slot.currentLevel) ??
      skills.filter((s) => s.slot === slotId).sort((a, b) => (a.level ?? 0) - (b.level ?? 0))[0];
    if (!skill) continue;
    movements.push({
      slot: slotId,
      slotName: slot.name,
      skillId: skill.id,
      name: skill.name,
      level: skill.level ?? slot.currentLevel,
      cues: skill.cues,
      referenceTerm: skill.referenceTerm,
      entryPosition: slot.entryPosition,
      exitPosition: slot.exitPosition,
      // The movement's own duration wins; the config table is only a fallback.
      seconds: skill.durationSeconds ?? slotSeconds(slotId),
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
  flowSessionsCompleted = 0,
): SessionPlan {
  const targetMinutes = targetMinutesOverride ?? TARGET_MINUTES[type] ?? 20;

  if (type === 'strength') {
    const blocks = buildStrength(skills);
    const hasContent = blocks.some((b) => b.movements.length > 0);
    return {
      date,
      type,
      source,
      targetMinutes,
      totalSeconds: targetMinutes * 60,
      rounds: 1,
      movements: [],
      strength: hasContent ? { blocks, prescription: STRENGTH.prescription } : undefined,
      note: hasContent ? null : 'No strength movements found in Notion for the five ladders.',
    };
  }

  if (!isFormSession(type)) {
    return {
      date,
      type,
      source,
      targetMinutes,
      totalSeconds: targetMinutes * 60,
      rounds: 1,
      movements: [],
      // Engine and Skate have no prescribed movement list by design. The Runner
      // gives them a stopwatch and the reference card they actually need.
      note:
        type === 'engine'
          ? 'Pick a route, or just go. The clock counts up.'
          : type === 'skate'
            ? 'Work the focus card. The clock counts up.'
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

  // Rounds ramp with experience rather than with the clock. Flow Short is
  // always one round, so a bad morning stays a bad morning's worth of work.
  const rounds =
    type === 'flow short' ? FLOW_SHORT_ROUNDS : roundsForFlow(flowSessionsCompleted);
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

    const slotId = slot.slotId || slot.sequence;
    const current = skills.find((s) => s.slot === slotId && s.level === slot.currentLevel);
    const next = skills.find((s) => s.slot === slotId && s.level === slot.currentLevel + 1);
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
      slot: slotId,
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

export interface FocusTrick {
  id: string;
  skillId: string;
  name: string;
  family: string;
  level: number | null;
  status: string;
  reason: 'rusty' | 'project' | 'stretch' | 'switch or fakie';
  lastPracticed: string | null;
  attempts: number;
}

/**
 * The session focus card from section 9. Everything about its shape lives in
 * SKATE_FOCUS in config, since these counts are guesses until Jan uses it.
 */
export function skateFocus(tricks: Skill[], today: string): FocusTrick[] {
  const cfg = SKATE_FOCUS;
  const picked: FocusTrick[] = [];
  const taken = new Set<string>();

  const add = (skill: Skill, reason: FocusTrick['reason']) => {
    if (taken.has(skill.id)) return;
    taken.add(skill.id);
    picked.push({
      id: skill.id,
      skillId: skill.skillId,
      name: skill.name,
      family: skill.family,
      level: skill.level,
      status: skill.status,
      reason,
      lastPracticed: skill.lastPracticed,
      attempts: skill.attempts,
    });
  };

  // Rusty: mastered, but not confirmed inside the rust window. Oldest first.
  const rusty = tricks
    .filter((t) => t.status === 'mastered')
    .filter((t) => !t.lastPracticed || daysBetween(t.lastPracticed, today) >= cfg.rustAfterDays)
    .sort((a, b) => (a.lastPracticed ?? '').localeCompare(b.lastPracticed ?? ''));
  rusty.slice(0, cfg.rusty).forEach((t) => add(t, 'rusty'));

  // The live projects.
  const projects = tricks.filter((t) => t.status === 'current').sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  projects.slice(0, cfg.projects).forEach((t) => add(t, 'project'));

  // One stretch attempt: a locked trick whose prerequisites are all mastered,
  // so it is the nearest thing that is actually reachable.
  const statusOf = new Map(tricks.map((t) => [t.skillId, t.status]));
  const reachable = tricks
    .filter((t) => t.status === 'locked')
    .filter((t) => t.prereqs.length > 0 && t.prereqs.every((p) => statusOf.get(p) === 'mastered'))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  reachable.slice(0, cfg.stretch).forEach((t) => add(t, 'stretch'));

  // One switch or fakie item, because that gap closes only if it is scheduled.
  const switched = tricks
    .filter((t) => t.status !== 'locked')
    .filter((t) => SWITCH_FAKIE_MARKERS.some((m) => t.skillId.includes(m)))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  switched.slice(0, cfg.switchOrFakie).forEach((t) => add(t, 'switch or fakie'));

  return picked;
}

/** Tricks whose prerequisites are all mastered, so they can be started. */
export function unlockableTricks(tricks: Skill[]): Set<string> {
  const statusOf = new Map(tricks.map((t) => [t.skillId, t.status]));
  return new Set(
    tricks
      .filter((t) => t.prereqs.length === 0 || t.prereqs.every((p) => statusOf.get(p) === 'mastered'))
      .map((t) => t.id),
  );
}

export interface RotationDecision {
  activate: Micro[];
  deactivate: Micro[];
  retire: Micro[];
  /** Why each chosen micro is in the set, so the reasoning stays inspectable. */
  reasons: Record<string, string>;
}

/**
 * Micro rotation, section 6. Chooses the three to five micros that carry a
 * weekly goal. Everything about the shape of the selection lives in
 * MICRO_ROTATION in config, because these weights are meant to be tuned.
 */
export function rotateMicros(
  micros: Micro[],
  log: MicroLogEntry[],
  slots: Slot[],
  skills: Skill[],
  weekStartDate: string,
  hasSkateProject: boolean,
): RotationDecision {
  const cfg = MICRO_ROTATION;
  const reasons: Record<string, string> = {};

  const countSince = (name: string, since: string) =>
    log.filter((l) => l.name === name && l.date >= since).reduce((sum, l) => sum + (l.count || 0), 0);

  // Retire anything that was carrying a goal and was ignored throughout the
  // window. This is the rule that stops a graveyard of dead targets forming.
  //
  // It only starts applying once the log itself is old enough to distinguish
  // "ignored for three weeks" from "the app is three days old". Without this
  // guard a fresh install retires every micro on its first rotation.
  const retireFrom = addDays(weekStartDate, -cfg.retireAfterUntouchedWeeks * ROLLING_WINDOW_DAYS);
  const firstLogged = log.map((l) => l.date).sort()[0];
  const historyIsLongEnough = Boolean(firstLogged && firstLogged <= retireFrom);
  const retire = historyIsLongEnough
    ? micros.filter((m) => m.active && !m.retired && countSince(m.name, retireFrom) === 0)
    : [];
  const retiredIds = new Set(retire.map((m) => m.id));

  const eligible = micros.filter((m) => !m.retired && !retiredIds.has(m.id));

  // The slot closest to levelling up is the one with the most sessions banked
  // at its current level.
  const activeSlots = slots.filter((s) => s.active);
  const progressOf = (slot: Slot) =>
    skills.find((s) => s.slot === (slot.slotId || slot.sequence) && s.level === slot.currentLevel)?.sessionsAtLevel ?? 0;
  const closestSlot = activeSlots
    .slice()
    .sort((a, b) => progressOf(b) - progressOf(a))[0];

  const chosen: Micro[] = [];
  const take = (m: Micro | undefined, why: string) => {
    if (!m || chosen.some((c) => c.id === m.id) || chosen.length >= cfg.maxActive) return;
    chosen.push(m);
    reasons[m.name] = why;
  };

  // At least two feeding the slot closest to levelling up.
  if (closestSlot) {
    eligible
      .filter((m) => m.feedsSlot === (closestSlot.slotId || closestSlot.sequence))
      .slice(0, cfg.feedingClosestSlot)
      .forEach((m) => take(m, `feeds slot ${closestSlot.slotId || closestSlot.sequence}, closest to levelling`));
  }

  // One tied to the live skate project, when there is one.
  if (hasSkateProject) {
    for (let i = 0; i < cfg.skateProject; i += 1) {
      take(eligible.find((m) => m.domain === 'skate'), 'live skate project');
    }
  }

  // One wildcard that has not been active recently.
  const quietFrom = addDays(weekStartDate, -cfg.wildcardQuietWeeks * ROLLING_WINDOW_DAYS);
  const wildcards = eligible
    .filter((m) => !m.active && countSince(m.name, quietFrom) === 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (let i = 0; i < cfg.wildcard; i += 1) {
    take(wildcards[i], 'wildcard, quiet lately');
  }

  // Top up to the minimum with whatever feeds an active slot.
  for (const m of eligible) {
    if (chosen.length >= cfg.minActive) break;
    take(m, 'filling the minimum');
  }

  const chosenIds = new Set(chosen.map((m) => m.id));
  return {
    activate: chosen.filter((m) => !m.active),
    deactivate: micros.filter((m) => m.active && !chosenIds.has(m.id) && !retiredIds.has(m.id)),
    retire,
    reasons,
  };
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
