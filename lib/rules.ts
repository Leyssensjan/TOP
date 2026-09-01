// Domain rules from sections 4, 5 and 6 of the brief. No storage, no Notion.

import {
  DEFAULT_SLOT_SECONDS,
  LEVELUP_DEFER_DAYS,
  LEVELUP_EASY_STREAK,
  LEVELUP_MIN_SESSIONS,
  MAX_LEVEL,
  FLOW_SHORT_ROUNDS,
  MICRO_ASSIST,
  MICRO_ROTATION,
  PROFILE,
  PROPOSAL_PRIORITY,
  SLOT_UNLOCK,
  ROUND_RAMP,
  SKATE_FOCUS,
  SKATE_SESSION,
  STRENGTH,
  SWITCH_FAKIE_MARKERS,
  ROLLING_WINDOW_DAYS,
  SESSIONS_PER_WINDOW,
  SLOT_SECONDS,
  TARGET_MINUTES,
} from '@/lib/config';
import { addDays, daysBetween, weekStart } from '@/lib/dates';
import { skateContent } from '@/lib/skate-content';
import type { Micro, MicroLogEntry, Route, SessionLog, SessionType, SkateSet, Skill, Slot, StrengthSet } from '@/lib/types';

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
    /** Reps or seconds one set has to reach to count towards a level-up. */
    levelUpTarget: number;
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
  /**
   * Every unlocked slot, not just today's. The thread always draws twelve
   * nodes, and a Flow Short has to visibly sit inside the same structure as a
   * full Flow rather than looking like a different, smaller Form.
   */
  activeSlotIds: number[];
  /** Only for Strength: the ladders, grouped into supersets. */
  strength?: { blocks: StrengthBlock[]; prescription: typeof STRENGTH.prescription };
  /** Only for Engine: the scouted routes, so one can be picked and logged. */
  engine?: { routes: Route[] };
  /** Only for Skate: the focus card, grouped into blocks with its drills. */
  skate?: { blocks: SkateBlock[] };
  note: string | null;
}

/**
 * Rounds ramp with experience. Session n is the (completed + 1)th Flow, and
 * takes the rounds of the first band it still fits inside. All in config.
 *
 * The count fed in is Flow sessions *since the last slot unlock*, not the
 * lifetime total. That is what makes the unlock reset real: a longer sequence
 * at fewer rounds is the same session length.
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
              levelUpTarget: levelUpTargetOf(skill),
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

/**
 * What one set has to reach to count towards a level-up, in the movement's own
 * unit. Notion wins: several cues name a rep or second count of their own, and
 * judging "five reps is a set" against a global eight would be nonsense.
 */
export function levelUpTargetOf(skill: Pick<Skill, 'unit' | 'levelUpTarget'>): number {
  if (skill.levelUpTarget !== null && skill.levelUpTarget > 0) return skill.levelUpTarget;
  return unitOf(skill) === 'seconds' ? STRENGTH.levelUpSeconds : STRENGTH.levelUpReps;
}

/** A set is good enough to count towards a level-up. */
export function setClears(
  set: StrengthSet,
  skill: Pick<Skill, 'unit' | 'levelUpTarget'>,
): boolean {
  const target = levelUpTargetOf(skill);
  return unitOf(skill) === 'seconds' ? (set.seconds ?? 0) >= target : (set.reps ?? 0) >= target;
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
      if (!setClears(set, current)) continue;
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
  /** True when micros lowered the bar. The proposal says so rather than hiding it. */
  assisted: boolean;
  needed: number;
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
  const activeSlotIds = slots.filter((s) => s.active).map((s) => s.slotId || s.sequence);

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
      activeSlotIds,
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
      activeSlotIds,
      // Engine and Skate have no prescribed movement list by design. The Runner
      // gives them a stopwatch and the reference card they actually need.
      note:
        type === 'engine'
          ? 'Pick a route, or just go. The clock counts up.'
          : type === 'skate'
            ? 'Nothing on the card yet. Mark what you can already do on Skate.'
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
      activeSlotIds,
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
    activeSlotIds,
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
  assisted: Set<number> = new Set(),
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
    const needed = sessionsNeeded(slotId, assisted);
    if (current.sessionsAtLevel < needed) continue;

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
      assisted: assisted.has(slotId),
      needed,
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
  reason: 'rusty' | 'project' | 'stretch' | 'switch or fakie' | 'start here';
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

  // A graph where nothing is mastered and nothing is current knows nothing
  // about what Jan can already do, and every pick below would come back empty.
  // The bottom of the graph is the honest answer: it is where anyone starts.
  if (!tricks.some((t) => t.status !== 'locked')) {
    tricks
      .slice()
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.prereqs.length - b.prereqs.length)
      .slice(0, cfg.coldStart)
      .forEach((t) => add(t, 'start here'));
    return picked;
  }

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
  // so every ingredient has already been confirmed. Of those, the one sitting
  // closest to the current ceiling. Taking the lowest instead would offer a
  // beginner drill to someone who can drop in; taking the highest would offer
  // whatever happens to sit furthest out on one narrow branch. The ceiling is
  // where the next real attempt lives.
  const statusOf = new Map(tricks.map((t) => [t.skillId, t.status]));
  const ceiling = tricks
    .filter((t) => t.status === 'mastered')
    .reduce((max, t) => Math.max(max, t.level ?? 0), 0);
  const reachable = tricks
    .filter((t) => t.status === 'locked')
    .filter((t) => t.prereqs.length > 0 && t.prereqs.every((p) => statusOf.get(p) === 'mastered'))
    .sort(
      (a, b) =>
        Math.abs((a.level ?? 0) - ceiling) - Math.abs((b.level ?? 0) - ceiling) ||
        (a.level ?? 0) - (b.level ?? 0),
    );
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

  // A micro that has already hit its weekly target has done its job. It stays
  // on the screen — finishing it is the point — but it stops occupying one of
  // the few active places, so a new one comes in behind it.
  const doneThisWeek = new Set(
    cfg.replaceOnComplete
      ? micros
          .filter((m) => m.active && m.weeklyTarget)
          .filter(
            (m) =>
              log
                .filter((l) => l.name === m.name && l.date >= weekStartDate)
                .reduce((sum, l) => sum + (l.count || 0), 0) >= (m.weeklyTarget ?? 0),
          )
          .map((m) => m.id)
      : [],
  );

  const countSince = (name: string, since: string) =>
    log.filter((l) => l.name === name && l.date >= since).reduce((sum, l) => sum + (l.count || 0), 0);

  // Retire anything that was carrying a goal and was ignored throughout the
  // window. This is the rule that stops a graveyard of dead targets forming.
  //
  // It only applies to someone who was actually here for all of it. Asking
  // whether the log merely reaches back that far, and whether anything at all
  // landed inside it, is far too weak a test: two stray taps in early August
  // and one the night before satisfied both, and retired four micros on an app
  // that had been used, in earnest, for a single day.
  //
  // So every week of the window has to show activity of its own. A week with
  // nothing logged in it is a week nobody was asked, and it stops the clock
  // rather than counting against the micro. A month away is not a month of
  // ignoring these; neither is a fortnight of building the thing on holiday.
  const retireFrom = addDays(weekStartDate, -cfg.retireAfterUntouchedWeeks * ROLLING_WINDOW_DAYS);
  const askedEveryWeek = Array.from({ length: cfg.retireAfterUntouchedWeeks }, (_, i) =>
    addDays(weekStartDate, -(i + 1) * ROLLING_WINDOW_DAYS),
  ).every((start) => {
    const end = addDays(start, ROLLING_WINDOW_DAYS - 1);
    return log.some((l) => l.date >= start && l.date <= end);
  });
  const retire = askedEveryWeek
    ? micros.filter((m) => m.active && !m.retired && countSince(m.name, retireFrom) === 0)
    : [];
  const retiredIds = new Set(retire.map((m) => m.id));

  const eligible = micros.filter((m) => !m.retired && !retiredIds.has(m.id) && !doneThisWeek.has(m.id));

  // The slot closest to levelling up is the one with the most sessions banked
  // at its current level.
  const activeSlots = slots.filter((s) => s.active);
  const progressOf = (slot: Slot) =>
    skills.find((s) => s.slot === (slot.slotId || slot.sequence) && s.level === slot.currentLevel)?.sessionsAtLevel ?? 0;
  const closestSlot = activeSlots
    .slice()
    .sort((a, b) => progressOf(b) - progressOf(a))[0];

  // The finished ones keep their place on the screen without being counted.
  const chosen: Micro[] = micros.filter((m) => doneThisWeek.has(m.id));
  chosen.forEach((m) => {
    reasons[m.name] = 'done this week';
  });
  const counted = () => chosen.filter((m) => !doneThisWeek.has(m.id)).length;
  const take = (m: Micro | undefined, why: string) => {
    if (!m || chosen.some((c) => c.id === m.id) || counted() >= cfg.maxActive) return;
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
  //
  // Whether the micro is currently active is deliberately NOT a filter here.
  // It used to be (`!m.active`), and that made the rotation oscillate: Today
  // reconciles on every load, so the micro chosen last load was ineligible the
  // next one, a different one took its place, and the pair swapped forever —
  // two Notion writes per page load, and a week count that fell back to zero
  // every time a fresh micro arrived.
  //
  // The week decides instead. The pick holds for as long as the week does and
  // moves on when a new one starts, which is the rotation this was always
  // meant to be, rather than a coin flipped on every reload.
  // Quiet is judged on the weeks BEFORE this one, and the pool is drawn from
  // every micro rather than from `eligible`. Both exist to keep this week's own
  // activity out of a decision about this week. Counting today's taps made
  // logging the wildcard the very thing that evicted it — tap the micro the app
  // just introduced and it is no longer quiet, so it drops out of the
  // candidates and something else arrives in its place, which is precisely
  // backwards: using it is the point of putting it there. Drawing from
  // `eligible` had the same shape more quietly, since a micro finishing its
  // target elsewhere on the list shortened the pool and shifted the index.
  const quietFrom = addDays(weekStartDate, -cfg.wildcardQuietWeeks * ROLLING_WINDOW_DAYS);
  const quietBeforeThisWeek = (name: string) =>
    log
      .filter((l) => l.name === name && l.date >= quietFrom && l.date < weekStartDate)
      .reduce((sum, l) => sum + (l.count || 0), 0) === 0;
  const pool = micros
    .filter((m) => !m.retired && !retiredIds.has(m.id) && quietBeforeThisWeek(m.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const weekIndex = Math.floor(
    Date.parse(`${weekStartDate}T00:00:00Z`) / (ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000),
  );
  for (let i = 0; i < cfg.wildcard && pool.length; i += 1) {
    // Walk on from the week's index, so a candidate already chosen for another
    // reason costs a step rather than the week's wildcard.
    for (let n = 0; n < pool.length; n += 1) {
      const candidate = pool[(weekIndex + i + n) % pool.length];
      if (chosen.some((c) => c.id === candidate.id)) continue;
      take(candidate, 'wildcard, quiet lately');
      break;
    }
  }

  // Top up to the minimum with whatever feeds an active slot. Completed ones
  // do not count, so finishing a micro genuinely brings a new one in.
  for (const m of eligible) {
    if (counted() >= cfg.minActive) break;
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

// --- the three axes: depth, breadth, volume ---------------------------------

/**
 * Which slots have their level-up bar lowered because their micros have been
 * hit consistently. This is the entire argument for micros, made mechanical:
 * frequency work makes the movement come sooner, and the proposal says so.
 */
export function assistedSlots(micros: Micro[], logs: MicroLogEntry[], today: string): Set<number> {
  const assisted = new Set<number>();
  const thisWeek = weekStart(today);

  for (const micro of micros) {
    if (micro.feedsSlot === null) continue;
    if (!micro.weeklyTarget) continue;

    // Count backwards in whole weeks. A run is only a run if it is unbroken.
    let streak = 0;
    for (let w = 1; w <= MICRO_ASSIST.weeks; w += 1) {
      const start = addDays(thisWeek, -7 * w);
      const end = addDays(start, 6);
      const count = logs
        .filter((l) => l.name === micro.name && l.date >= start && l.date <= end)
        .reduce((sum, l) => sum + l.count, 0);
      if (count >= micro.weeklyTarget * MICRO_ASSIST.threshold) streak += 1;
      else break;
    }
    if (streak >= MICRO_ASSIST.weeks) assisted.add(micro.feedsSlot);
  }

  return assisted;
}

/** Consecutive weeks each micro has hit its assist threshold. */
export function assistStreaks(micros: Micro[], logs: MicroLogEntry[], today: string): Map<string, number> {
  const thisWeek = weekStart(today);
  const streaks = new Map<string, number>();

  for (const micro of micros) {
    if (!micro.weeklyTarget) {
      streaks.set(micro.id, 0);
      continue;
    }
    let streak = 0;
    // Capped, because an unbounded walk backwards would read the whole log.
    for (let w = 1; w <= 52; w += 1) {
      const start = addDays(thisWeek, -7 * w);
      const end = addDays(start, 6);
      const count = logs
        .filter((l) => l.name === micro.name && l.date >= start && l.date <= end)
        .reduce((sum, l) => sum + l.count, 0);
      if (count >= micro.weeklyTarget * MICRO_ASSIST.threshold) streak += 1;
      else break;
    }
    streaks.set(micro.id, streak);
  }

  return streaks;
}

/** The level-up bar for a slot, lowered when its micros have been feeding it. */
export function sessionsNeeded(slotId: number, assisted: Set<number>): number {
  return assisted.has(slotId) ? MICRO_ASSIST.assistedSessions : LEVELUP_MIN_SESSIONS;
}

export interface SlotUnlockProposal {
  slotId: string;
  slot: number;
  name: string;
  unlockOrder: number;
  sessionsSinceUnlock: number;
  /** Rounds drop back to the bottom band, so the morning stays the same length. */
  roundsAfter: number;
  roundsBefore: number;
}

/** Flow sessions completed since the most recent slot joined the Form. */
export function flowsSinceUnlock(slots: Slot[], sessions: SessionLog[]): number {
  const unlockDates = slots.map((s) => s.unlockedOn).filter((d): d is string => Boolean(d)).sort();
  const since = unlockDates[unlockDates.length - 1];
  const flows = sessions.filter((s) => s.completed && s.type === 'flow');
  return since ? flows.filter((s) => s.date >= since).length : flows.length;
}

/**
 * How many more Flow sessions before the next slot can be proposed.
 *
 * Both session gates count, not just the obvious one: volume has to be maxed
 * before breadth increases, and reaching the top of the round ramp usually
 * takes longer than the minimum session count. Reporting only the smaller of
 * the two would put a number on Today that nothing happens on.
 *
 * The depth condition is not forecast here — it is a state, not a countdown,
 * and it can be met or lost between now and then.
 */
export function sessionsUntilNextSlot(slots: Slot[], sessions: SessionLog[]): number | null {
  const next = nextSlotToUnlock(slots);
  if (!next) return null;

  const flows = flowsSinceUnlock(slots, sessions);
  const bySessionCount = Math.max(0, SLOT_UNLOCK.minSessions - flows);
  if (!SLOT_UNLOCK.requireTopOfRamp) return bySessionCount;

  const topRounds = ROUND_RAMP[ROUND_RAMP.length - 1].rounds;
  let byRamp = 0;
  while (roundsForFlow(flows + byRamp) < topRounds && byRamp <= 500) byRamp += 1;

  return Math.max(bySessionCount, byRamp);
}

/** The locked slot whose turn it is, by Unlock order. */
export function nextSlotToUnlock(slots: Slot[]): Slot | null {
  return (
    slots
      .filter((s) => !s.active)
      .sort((a, b) => a.unlockOrder - b.unlockOrder)[0] ?? null
  );
}

/**
 * The Form grows when you have stopped struggling with what you have. All four
 * conditions, all in config. Breadth is the axis worth the most, so it is the
 * one gated hardest.
 */
export function slotUnlockProposal(
  slots: Slot[],
  sessions: SessionLog[],
  today: string,
): SlotUnlockProposal | null {
  const next = nextSlotToUnlock(slots);
  if (!next) return null;

  const done = sessions.filter((s) => s.completed).sort((a, b) => (a.date < b.date ? 1 : -1));
  const flows = flowsSinceUnlock(slots, sessions);
  if (flows < SLOT_UNLOCK.minSessions) return null;

  // Nothing hard recently: the current Form has to feel settled first.
  if (done.slice(0, SLOT_UNLOCK.noHardWindow).some((s) => s.difficulty === 'hard')) return null;

  // Volume is maxed before breadth increases.
  const active = slots.filter((s) => s.active);
  const topRounds = ROUND_RAMP[ROUND_RAMP.length - 1].rounds;
  const roundsBefore = roundsForFlow(flows);
  if (SLOT_UNLOCK.requireTopOfRamp && roundsBefore < topRounds) return null;

  // And half the Form has to be past level one.
  const deep = active.filter((s) => s.currentLevel >= 2).length;
  if (active.length && deep / active.length < SLOT_UNLOCK.depthFraction) return null;

  return {
    slotId: next.id,
    slot: next.slotId || next.sequence,
    name: next.name,
    unlockOrder: next.unlockOrder,
    sessionsSinceUnlock: flows,
    roundsBefore,
    roundsAfter: SLOT_UNLOCK.resetRounds ? ROUND_RAMP[0].rounds : roundsBefore,
  };
}

export type Proposal =
  | { kind: 'slot'; slot: SlotUnlockProposal }
  | { kind: 'movement'; movement: LevelUpProposal }
  | { kind: 'strength'; strength: StrengthProposal }
  | { kind: 'skate'; skate: SkateProposal };

/**
 * At most one proposal, ever. Three decisions on a dark morning turns the app
 * into a chore list, and breadth is worth more than depth.
 */
export function chooseProposal(
  slot: SlotUnlockProposal | null,
  movements: LevelUpProposal[],
  strength: StrengthProposal[],
  skate: SkateProposal[] = [],
): Proposal | null {
  for (const kind of PROPOSAL_PRIORITY) {
    if (kind === 'slot' && slot) return { kind: 'slot', slot };
    if (kind === 'movement' && movements[0]) return { kind: 'movement', movement: movements[0] };
    if (kind === 'strength' && strength[0]) return { kind: 'strength', strength: strength[0] };
    if (kind === 'skate' && skate[0]) return { kind: 'skate', skate: skate[0] };
  }
  return null;
}

// --- the skate session ------------------------------------------------------

export interface SkateTrickCard extends FocusTrick {
  /** How it works, what to actually do, and what counts as having it. */
  mechanics: string[];
  drills: string[];
  gate: string;
  terrain: string[];
  risk: number;
  /** Landed this many times in the session that most recently worked it. */
  landedLast: number;
  attemptsLast: number;
}

export interface SkateBlock {
  label: string;
  fromMinute: number;
  toMinute: number;
  warmUp: boolean;
  tricks: SkateTrickCard[];
}

/**
 * A skate session is not a free-for-all. Rust first, while the legs are fresh
 * and the stakes are low; then the projects that need real attempts; then one
 * stretch; then the switch work that never happens otherwise.
 *
 * Each card carries the trick's own drills, which is the part that makes this a
 * session rather than a list of names.
 */
export function buildSkateSession(tricks: Skill[], sets: SkateSet[], today: string): SkateBlock[] {
  const focus = skateFocus(tricks, today);

  // The most recent session that worked each trick, for the running count.
  const lastOf = (skillId: string) => {
    const rows = sets.filter((s) => s.trick === skillId).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!rows.length) return { landed: 0, attempts: 0 };
    const session = rows[0].session;
    const same = rows.filter((r) => r.session === session);
    return {
      landed: same.reduce((n, r) => n + r.landed, 0),
      attempts: same.reduce((n, r) => n + r.attempts, 0),
    };
  };

  const card = (t: FocusTrick): SkateTrickCard => {
    const content = skateContent(t.skillId);
    const last = lastOf(t.skillId);
    return {
      ...t,
      mechanics: content?.mechanics ?? [],
      drills: content?.drills ?? [],
      gate: content?.gate ?? '',
      terrain: content?.terrain ?? [],
      risk: content?.risk ?? 0,
      landedLast: last.landed,
      attemptsLast: last.attempts,
    };
  };

  const built = SKATE_SESSION.blocks.map((block) => ({
    label: block.label,
    fromMinute: block.from,
    toMinute: block.to,
    warmUp: block.warmUp === true,
    tricks: focus.filter((f) => block.reasons.includes(f.reason)).map(card),
  }));

  if (!SKATE_SESSION.dropEmptyBlocks) return built;

  // Drop the blocks with nothing on their card, then hand their minutes to the
  // ones that remain in proportion to what they were already given. The warm-up
  // always survives and keeps its own length.
  const kept = built.filter((b) => b.warmUp || b.tricks.length > 0);
  if (kept.length === built.length) return built;

  const total = built[built.length - 1]?.toMinute ?? 0;
  const warmUpMinutes = kept.filter((b) => b.warmUp).reduce((n, b) => n + (b.toMinute - b.fromMinute), 0);
  const working = kept.filter((b) => !b.warmUp);
  const originalWorking = working.reduce((n, b) => n + (b.toMinute - b.fromMinute), 0);
  if (!working.length || originalWorking === 0) return kept;

  const available = total - warmUpMinutes;
  let cursor = 0;
  return kept.map((b, i) => {
    const original = b.toMinute - b.fromMinute;
    const share = b.warmUp
      ? original
      : // The last working block absorbs the rounding, so the session always
        // ends exactly on the target minute.
        i === kept.length - 1
        ? total - cursor
        : Math.round((original / originalWorking) * available);
    const from = cursor;
    cursor += share;
    return { ...b, fromMinute: from, toMinute: cursor };
  });
}

export interface SkateProposal {
  skillId: string;
  id: string;
  name: string;
  family: string;
  level: number | null;
  landed: number;
  attempts: number;
  /** The criterion, verbatim. Most gates are qualitative, so Jan judges it. */
  gate: string;
}

/**
 * A trick proposes mastery once it has been landed enough times in one session
 * to be worth asking about. The app cannot evaluate the gate — most of them are
 * judgements like "Can leave board calmly" — so it shows the gate and asks.
 */
export function skateProposals(tricks: Skill[], sets: SkateSet[], today: string): SkateProposal[] {
  const cfg = SKATE_SESSION;
  const proposals: SkateProposal[] = [];

  for (const trick of tricks) {
    if (trick.status !== 'current') continue;
    if (trick.levelUpDeferred && daysBetween(trick.levelUpDeferred, today) < LEVELUP_DEFER_DAYS) continue;

    // Grouped by session: landing it three times across three months is not the
    // same claim as landing it three times in one go.
    const bySession = new Map<string, { landed: number; attempts: number; date: string }>();
    for (const set of sets) {
      if (set.trick !== trick.skillId) continue;
      const prior = bySession.get(set.session) ?? { landed: 0, attempts: 0, date: set.date };
      bySession.set(set.session, {
        landed: prior.landed + set.landed,
        attempts: prior.attempts + set.attempts,
        date: set.date,
      });
    }

    const best = [...bySession.values()]
      .filter((s) => s.landed >= cfg.landsToPropose && s.attempts >= cfg.minAttempts)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!best) continue;

    proposals.push({
      skillId: trick.skillId,
      id: trick.id,
      name: trick.name,
      family: trick.family,
      level: trick.level,
      landed: best.landed,
      attempts: best.attempts,
      gate: skateContent(trick.skillId)?.gate ?? '',
    });
  }

  return proposals;
}

/** One spoke of the profile. */
export interface AxisStat {
  key: string;
  label: string;
  /** 0 to 10. */
  level: number;
  tier: string;
  /** Exactly what fed the number, so the screen never has to assert it. */
  sources: Array<{ label: string; reached: number; available: number }>;
}

export interface Profile {
  axes: AxisStat[];
  overall: number;
  rank: string;
}

/** The name for a level: the last tier whose threshold it clears. */
function tierOf(level: number, names: string[]): string {
  const bands = PROFILE.tierThresholds;
  let picked = 0;
  bands.forEach((min, i) => {
    if (level >= min && i < names.length) picked = i;
  });
  return names[picked] ?? names[0] ?? '';
}

/**
 * The profile, section 12. Seven spokes over state that already exists — no
 * new measurement, nothing written.
 *
 * Every spoke is a weighted average of "depth reached over depth available",
 * where the weight is how much there is to reach: a twelve-level ladder counts
 * for more than a three-level one, and a family of twenty-six tricks counts for
 * more than a family of one. Percent-of-graph-completed is deliberately not
 * used anywhere — see the note in PROFILE.
 */
export function profileStats(
  slots: Slot[],
  movement: Skill[],
  strength: Skill[],
  skate: Skill[],
  sessions: SessionLog[],
  today: string,
): Profile {
  const axes = PROFILE.axes.map((axis) => {
    const parts: Array<{ weight: number; score: number; label: string; reached: number; available: number }> = [];

    // Form slots: the level standing now, against the ladder that exists.
    for (const slotId of axis.slots) {
      const slot = slots.find((s) => (s.slotId || s.sequence) === slotId);
      if (!slot) continue;
      const available = movement.filter((s) => s.slot === slotId).length;
      if (!available) continue;
      parts.push({
        weight: available,
        score: Math.min(1, slot.currentLevel / available),
        label: slot.name,
        reached: slot.currentLevel,
        available,
      });
    }

    // Strength ladders: same shape, different table.
    for (const family of axis.strength) {
      const ladder = strength.filter((s) => s.family === family);
      if (!ladder.length) continue;
      const current = ladder.find((s) => s.status === 'current');
      const reached = current?.level ?? 0;
      parts.push({
        weight: ladder.length,
        score: Math.min(1, reached / ladder.length),
        label: family,
        reached,
        available: ladder.length,
      });
    }

    // Skate families. Depth is the deepest thing *confirmed* — a trick still
    // in progress is not evidence, which is the whole meaning of "mastered".
    const useRisk = 'useRisk' in axis && axis.useRisk === true;
    for (const family of axis.skate) {
      const tricks = skate.filter((s) => s.family === family);
      if (!tricks.length) continue;
      const value = (s: Skill) => (useRisk ? (skateContent(s.skillId)?.risk ?? 0) : (s.level ?? 0) + 1);
      const available = tricks.reduce((max, s) => Math.max(max, value(s)), 0);
      const mastered = tricks.filter((s) => s.status === 'mastered');
      const reached = mastered.reduce((max, s) => Math.max(max, value(s)), 0);
      if (!available) continue;
      parts.push({
        weight: tricks.length,
        score: Math.min(1, reached / available),
        label: family,
        reached,
        available,
      });
    }

    // Runs. The one spoke with no ladder behind it, so it is counted rather
    // than levelled, and it is honest about being coarse.
    if ('useEngineSessions' in axis && axis.useEngineSessions === true) {
      const since = addDays(today, -PROFILE.engineWindowDays);
      const runs = sessions.filter((s) => s.completed && s.type === 'engine' && s.date >= since).length;
      parts.push({
        weight: PROFILE.engineWeight,
        score: Math.min(1, runs / PROFILE.engineTarget),
        label: `Runs in ${PROFILE.engineWindowDays} days`,
        reached: runs,
        available: PROFILE.engineTarget,
      });
    }

    const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
    const level = totalWeight
      ? Math.round((10 * parts.reduce((sum, p) => sum + p.weight * p.score, 0)) / totalWeight)
      : 0;

    return {
      key: axis.key,
      label: axis.label,
      level,
      tier: tierOf(level, axis.tiers),
      sources: parts.map((p) => ({ label: p.label, reached: p.reached, available: p.available })),
    };
  });

  const overall = axes.length
    ? Math.round(axes.reduce((sum, a) => sum + a.level, 0) / axes.length)
    : 0;

  return { axes, overall, rank: tierOf(overall, PROFILE.ranks) };
}
