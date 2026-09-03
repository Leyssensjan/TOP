// Plain domain types. Nothing in here knows that Notion exists.

export type SessionType = 'flow' | 'flow short' | 'strength' | 'engine' | 'skate';
export type PlanSessionType = SessionType | 'rest';
export type Difficulty = 'easy' | 'right' | 'hard';
export type SkillStatus = 'locked' | 'current' | 'mastered';
export type Domain = 'movement' | 'strength' | 'skate';
export type PlanStatus = 'planned' | 'done' | 'skipped';

export interface Skill {
  id: string;
  name: string;
  domain: Domain | null;
  slot: number | null;
  level: number | null;
  status: SkillStatus;
  cues: string;
  referenceTerm: string;
  entryPosition: string;
  exitPosition: string;
  whyBuilds: string;
  whyUnlocks: string;
  /** What this movement does for skating. Empty when it does nothing. */
  whySkate: string;
  sessionsAtLevel: number;
  lastPracticed: string | null;
  levelUpDeferred: string | null;
  /** Overrides the SLOT_SECONDS fallback in config when set. */
  durationSeconds: number | null;
  /** Strength only: whether a set of this is counted in reps or in seconds. */
  unit: 'reps' | 'seconds' | null;
  /** Strength only: the Form slot id this ladder feeds. Null serves nothing. */
  servesSlot: number | null;
  /**
   * Reps or seconds per set that count towards a level-up, in this movement's
   * own Unit. Overrides the config default, because a cue that says "five reps
   * is a set" must not be judged against a global eight.
   */
  levelUpTarget: number | null;
  /** Skate fields. Empty for movement skills. */
  skillId: string;
  family: string;
  prereqs: string[];
  attempts: number;
}

export interface Slot {
  id: string;
  name: string;
  sequence: number;
  /**
   * Stable identifier matching Skills.Slot. Sequence is the position in the
   * Form and can be reordered freely; this must not move with it.
   */
  slotId: number;
  active: boolean;
  inShortForm: boolean;
  currentLevel: number;
  unlockOrder: number;
  entryPosition: string;
  exitPosition: string;
  /** When this slot joined the Form. Null for the ones that were there first. */
  unlockedOn: string | null;
}

export interface SessionLog {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: SessionType;
  plannedMinutes: number | null;
  actualMinutes: number | null;
  completed: boolean;
  difficulty: Difficulty | null;
  soreness: string;
  notes: string;
  skillsPracticed: string[];
  /** Engine only. */
  distanceKm: number | null;
  route: string;
}

export interface NewSession {
  /** Composed by the route so the store stays dumb. Carries the dedupe marker. */
  name?: string;
  date: string;
  type: SessionType;
  plannedMinutes?: number | null;
  actualMinutes?: number | null;
  completed: boolean;
  difficulty?: Difficulty | null;
  soreness?: string;
  notes?: string;
  skillsPracticed: string[];
  distanceKm?: number | null;
  route?: string;
}

/**
 * One logged set of a strength movement. Written by the app during a session;
 * this is what makes the "three sets of eight clean" rule possible without Jan
 * opening Notion.
 */
export interface StrengthSet {
  id: string;
  name: string;
  date: string;
  skill: string;
  set: number;
  reps: number | null;
  seconds: number | null;
  /** Client id of the session, so an offline retry cannot double-log. */
  session: string;
}

export interface NewStrengthSet {
  date: string;
  skill: string;
  set: number;
  reps?: number | null;
  seconds?: number | null;
  session: string;
}

/** One trick worked in a skate session. Attempts and lands, nothing else. */
export interface SkateSet {
  id: string;
  name: string;
  date: string;
  trick: string;
  attempts: number;
  landed: number;
  session: string;
}

export interface NewSkateSet {
  date: string;
  trick: string;
  attempts: number;
  landed: number;
  session: string;
}

export interface PlanEntry {
  id: string;
  name: string;
  weekStart: string | null;
  day: string | null;
  sessionType: PlanSessionType | null;
  plannedMinutes: number | null;
  location: string;
  status: PlanStatus | null;
  reasonNote: string;
}

export interface NewPlanEntry {
  name?: string;
  weekStart: string;
  day: string;
  sessionType: PlanSessionType;
  plannedMinutes?: number | null;
  location?: string;
  status?: PlanStatus;
  reasonNote?: string;
}

export interface Micro {
  id: string;
  name: string;
  domain: string | null;
  feedsSlot: number | null;
  weeklyTarget: number | null;
  trigger: string;
  cue: string;
  duration: string;
  referenceTerm: string;
  active: boolean;
  /** Ignored for three weeks while active, so it is not offered again. */
  retired: boolean;
  stat: string[];
  /** Consecutive weeks at the assist threshold. Written by the app. */
  assistStreakWeeks: number;
}

export interface MicroPatch {
  active?: boolean;
  retired?: boolean;
  assistStreakWeeks?: number;
}

export interface MicroLogEntry {
  id: string;
  name: string;
  date: string;
  count: number;
  weekStart: string | null;
}

export interface Route {
  id: string;
  name: string;
  distanceKm: number | null;
  startPoint: string;
  description: string;
  mapLink: string;
  surface: string;
  quietRating: number | null;
  /**
   * The bridges crossed, in order. On a route round a dock system the bridges
   * are the route's identity — which one you cross is the whole decision — and
   * a description cannot carry that at a glance.
   */
  bridges: string[];
  /** What two laps come to, when the loop is short enough to repeat. */
  lapHint: string;
}

export interface NewSkill {
  name: string;
  domain: Domain;
  skillId: string;
  level: number;
  family: string;
  prereqs: string;
  status: SkillStatus;
}

export interface SkillPatch {
  status?: SkillStatus;
  attempts?: number;
  sessionsAtLevel?: number;
  lastPracticed?: string | null;
  levelUpDeferred?: string | null;
}

export interface SlotPatch {
  currentLevel?: number;
  active?: boolean;
  unlockedOn?: string | null;
}

export type MilestoneKind =
  | 'level up'
  | 'slot unlock'
  | 'rounds up'
  | 'trick mastered'
  | 'strength level up';

/**
 * The app's memory. Every advancement writes one row, which is what makes a
 * year of training legible on the Progress screen.
 */
export interface Milestone {
  id: string;
  name: string;
  date: string;
  kind: MilestoneKind;
  subject: string;
  detail: string;
  session: string;
}

export interface NewMilestone {
  date: string;
  kind: MilestoneKind;
  subject: string;
  detail: string;
  session?: string;
}

/**
 * The whole persistence surface of the app. Swapping Notion for a real
 * database means writing one new file that satisfies this interface and
 * changing the single line in lib/store/index.ts that picks the driver.
 */
export interface Store {
  readonly name: string;

  getSlots(): Promise<Slot[]>;
  getSkills(domain?: Domain): Promise<Skill[]>;
  createSkill(input: NewSkill): Promise<Skill>;
  updateSkill(id: string, patch: SkillPatch): Promise<void>;
  updateSlot(id: string, patch: SlotPatch): Promise<void>;

  /** Sessions dated on or after `since` (YYYY-MM-DD), newest first. */
  getSessionsSince(since: string): Promise<SessionLog[]>;
  createSession(input: NewSession): Promise<SessionLog>;

  getStrengthSetsSince(since: string): Promise<StrengthSet[]>;
  createStrengthSet(input: NewStrengthSet): Promise<StrengthSet>;

  getSkateSetsSince(since: string): Promise<SkateSet[]>;
  createSkateSet(input: NewSkateSet): Promise<SkateSet>;

  getMilestonesSince(since: string): Promise<Milestone[]>;
  createMilestone(input: NewMilestone): Promise<Milestone>;

  getPlanForDay(day: string): Promise<PlanEntry | null>;
  getPlanForWeek(weekStart: string): Promise<PlanEntry[]>;
  createPlanEntry(entry: NewPlanEntry): Promise<PlanEntry>;
  updatePlanEntry(id: string, patch: Partial<NewPlanEntry>): Promise<void>;

  /** Stubbed: the Routes table is empty until Jan scouts them. */
  getRoutes(): Promise<Route[]>;

  getMicros(): Promise<Micro[]>;
  updateMicro(id: string, patch: MicroPatch): Promise<void>;
  getMicroLogSince(since: string): Promise<MicroLogEntry[]>;
  createMicroLog(name: string, date: string, count: number, weekStart: string): Promise<MicroLogEntry>;
}
