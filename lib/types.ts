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
  sessionsAtLevel: number;
  lastPracticed: string | null;
  levelUpDeferred: string | null;
  /** Overrides the SLOT_SECONDS fallback in config when set. */
  durationSeconds: number | null;
}

export interface Slot {
  id: string;
  name: string;
  sequence: number;
  active: boolean;
  inShortForm: boolean;
  currentLevel: number;
  unlockOrder: number;
  entryPosition: string;
  exitPosition: string;
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
}

export interface MicroPatch {
  active?: boolean;
  retired?: boolean;
}

export interface MicroLogEntry {
  id: string;
  name: string;
  date: string;
  count: number;
  weekStart: string | null;
}

export interface SkillPatch {
  status?: SkillStatus;
  sessionsAtLevel?: number;
  lastPracticed?: string | null;
  levelUpDeferred?: string | null;
}

export interface SlotPatch {
  currentLevel?: number;
  active?: boolean;
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
  updateSkill(id: string, patch: SkillPatch): Promise<void>;
  updateSlot(id: string, patch: SlotPatch): Promise<void>;

  /** Sessions dated on or after `since` (YYYY-MM-DD), newest first. */
  getSessionsSince(since: string): Promise<SessionLog[]>;
  createSession(input: NewSession): Promise<SessionLog>;

  getPlanForDay(day: string): Promise<PlanEntry | null>;
  getPlanForWeek(weekStart: string): Promise<PlanEntry[]>;
  createPlanEntry(entry: NewPlanEntry): Promise<PlanEntry>;
  updatePlanEntry(id: string, patch: Partial<NewPlanEntry>): Promise<void>;

  getMicros(): Promise<Micro[]>;
  updateMicro(id: string, patch: MicroPatch): Promise<void>;
  getMicroLogSince(since: string): Promise<MicroLogEntry[]>;
  createMicroLog(name: string, date: string, count: number, weekStart: string): Promise<MicroLogEntry>;
}
