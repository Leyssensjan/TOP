// Data source IDs for the FlowQuest Notion page (3abb7198-2759-815e-a9d0-f7442bb557d5).
// These are IDs, not secrets. The token is the secret and lives only in env.
export const DATA_SOURCES = {
  skills: '87e9b644-7171-4925-b6ca-79288fb3043b',
  slots: '3b2191e5-3d14-48fa-9f97-66e3293fc6d4',
  sessions: '65542a98-6d9b-46f0-8cc6-acd14e515a58',
  plan: '4de06f07-e783-4991-a821-30d0c5e2cbb1',
  routes: '95b8e870-7fd2-4911-a80d-f317618827ee',
  micros: '13734eb0-cb98-4c1e-bbf2-9637f2831537',
  microLog: 'b45bc1c1-16e9-4516-aefe-3bbc0ffb63a6',
} as const;

// Data source IDs require 2025-09-03 or later.
export const NOTION_VERSION = '2025-09-03';

/**
 * Fallback seconds per slot for one pass through the Form. A movement's own
 * "Duration seconds" in Notion wins whenever it is set; this table only covers
 * the ones left empty. Chosen so that six active slots make a round of about
 * 4:50 and all twelve make about 9:35, which lets whole rounds land inside the
 * durations in the brief without odd part-rounds.
 */
export const SLOT_SECONDS: Record<number, number> = {
  1: 60, // Centering, breath-paced
  2: 40, // Spinal wave
  3: 60, // Hip opener, both sides
  4: 60, // Squat and ankle
  5: 45, // Quadruped load
  6: 45, // Ground push
  7: 45, // Transition
  8: 45, // Posterior chain
  9: 45, // Spinal extension
  10: 45, // Compression core
  11: 45, // Arm balance
  12: 40, // Rise
};

export const DEFAULT_SLOT_SECONDS = 45;

/** Target minutes per session type, from section 4 of the brief. */
export const TARGET_MINUTES: Record<string, number> = {
  flow: 18,
  'flow short': 7,
  strength: 30,
  engine: 30,
  skate: 45,
};

/** Levelling rule: 8 sessions at level, "easy" on at least the last 3. */
export const LEVELUP_MIN_SESSIONS = 8;
export const LEVELUP_EASY_STREAK = 3;
/** A deferred level-up stays quiet for this long. */
export const LEVELUP_DEFER_DAYS = 14;

/** Weekly target: three sessions per rolling seven days. */
export const ROLLING_WINDOW_DAYS = 7;
export const SESSIONS_PER_WINDOW = 3;
export const MAX_LEVEL = 4;

/**
 * Micro rotation, section 6. Only a few micros carry a weekly goal at a time,
 * and anything ignored for three weeks is retired rather than re-offered —
 * that last rule is what stops a graveyard of dead targets accumulating.
 */
export const MICRO_ROTATION = {
  minActive: 3,
  maxActive: 5,
  /** At least this many feeding the slot closest to levelling up. */
  feedingClosestSlot: 2,
  /** Tied to the live skate project, when there is one. */
  skateProject: 1,
  /** Not active recently. */
  wildcard: 1,
  /** Untouched this many consecutive weeks while active, then retired. */
  retireAfterUntouchedWeeks: 3,
  /** A micro counts as "not recent" once it has been quiet this long. */
  wildcardQuietWeeks: 3,
};
