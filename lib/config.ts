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
  strengthLog: 'e2e0df58-be03-4c5e-bcab-df20881b6d45',
  milestones: 'c4df4d86-0085-4aa7-8722-1e1302801b33',
  skateLog: '9ae58cb5-aaec-4b91-b4db-af77814165fe',
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

/**
 * Flow rounds ramp with experience, counted on completed Flow sessions.
 * Session n gets the rounds of the first band whose `throughSession` it is
 * still inside. Flow Short is always a single round.
 */
export const ROUND_RAMP: Array<{ throughSession: number; rounds: number }> = [
  { throughSession: 6, rounds: 2 },
  { throughSession: 14, rounds: 3 },
  { throughSession: Number.POSITIVE_INFINITY, rounds: 4 },
];
export const FLOW_SHORT_ROUNDS = 1;

/**
 * Strength, section 4. Five ladders grouped by the Family field on Skills,
 * run as supersets. Minutes are offsets from the start of the session.
 */
export const STRENGTH = {
  ladders: ['Pull', 'Push', 'Single leg', 'Hinge', 'Hang'],
  blocks: [
    { from: 0, to: 4, families: [], label: 'Flow Short as warm-up', rounds: 1, restSeconds: 0, warmUp: true },
    { from: 4, to: 16, families: ['Pull', 'Push'], label: 'Superset', rounds: 4, restSeconds: 90, warmUp: false },
    { from: 16, to: 26, families: ['Single leg', 'Hinge'], label: 'Superset', rounds: 3, restSeconds: 60, warmUp: false },
    { from: 26, to: 30, families: ['Hang'], label: 'Finisher', rounds: 3, restSeconds: 60, warmUp: false },
  ],
  prescription: {
    reps: '3 to 4 sets of 5 to 8, stopping two short of failure',
    holds: 'build to 30 to 60 seconds',
    negatives: '5 reps at 4 to 5 seconds down',
  },
  /** Level-up when three sets of eight are clean. Proposed, never automatic. */
  levelUpSets: 3,
  levelUpReps: 8,
  /**
   * "Clean" is not a separate tap. A set counts as clean when the session it
   * belongs to was closed at one of these difficulties, which Jan already
   * answers on the Close screen.
   */
  cleanDifficulties: ['easy', 'right'] as string[],
  /** Holds level up on time held rather than on reps. */
  levelUpSeconds: 45,
  /** How a set is counted when a movement's Notion "Unit" is empty. */
  defaultUnit: 'reps' as 'reps' | 'seconds',
  /** The quick-pick values on the set logger. Jan can still type any number. */
  repChoices: [3, 5, 6, 8, 10, 12],
  secondChoices: [15, 20, 30, 45, 60, 90],
  /**
   * Which Form slot each ladder serves. Notion's "Serves slot" wins; this is
   * the fallback. Pull deliberately serves nothing — see `notes` below.
   */
  serves: { Pull: null, Push: 6, 'Single leg': 12, Hinge: 9, Hang: 10 } as Record<string, number | null>,
  /**
   * A ladder that serves nothing in the Form needs its justification stated
   * where it will be read on the morning the session is about to be skipped.
   */
  notes: { Pull: 'Nothing on the floor trains this.' } as Record<string, string>,
};

/**
 * The Today suggestion. Replaces week generation: a single line computed from
 * the rolling count and the last session, never a form to fill in.
 */
export const SUGGESTION = {
  /** After this type, prefer these next, first available wins. */
  after: {
    flow: ['strength', 'engine', 'flow'],
    'flow short': ['strength', 'engine', 'flow'],
    strength: ['flow', 'engine'],
    engine: ['flow', 'strength'],
    skate: ['flow', 'strength'],
  } as Record<string, string[]>,
  /** With the weekly target already met, suggest the gentler option. */
  whenTargetMet: 'flow short',
  /** Nothing logged yet. */
  whenNoHistory: 'flow',
};

/**
 * Pacing cues in the Runner. The phone is propped up and the eyes are often
 * shut, so a movement ending needs to be audible. Soft sines, no alarms, and
 * nothing outside a running session.
 */
export const SOUND = {
  /** Master level. Quiet enough for a dim room at 6am. */
  volume: 0.16,
  /** Spacing between the tones of a two-tone cue. */
  gapMs: 130,
  /** Seconds of warning before a movement ends, so the change is not a surprise. */
  warnSeconds: 3,
  cues: {
    /** A quiet tick, three seconds out. */
    warn: { tones: [{ hz: 660, ms: 55, gain: 0.5 }] },
    /** Move on. */
    next: { tones: [{ hz: 880, ms: 110, gain: 1 }] },
    /** Back to the top of the Form. */
    round: { tones: [{ hz: 660, ms: 100, gain: 1 }, { hz: 990, ms: 140, gain: 1 }] },
    /** Rest is over, back on the bar. */
    rest: { tones: [{ hz: 780, ms: 90, gain: 0.8 }] },
    /** The session is finished. */
    done: { tones: [{ hz: 880, ms: 120, gain: 1 }, { hz: 587, ms: 260, gain: 1 }] },
  } as Record<string, { tones: Array<{ hz: number; ms: number; gain: number }> }>,
};

/** How many trick tiers the first run of the Skate screen offers. */
export const SKATE_FIRST_RUN_TIERS = 3;

/** Target minutes per session type, from section 4 of the brief. */
export const TARGET_MINUTES: Record<string, number> = {
  flow: 18,
  'flow short': 7,
  strength: 30,
  engine: 30,
  skate: 60,
};

/** Levelling rule: 8 sessions at level, "easy" on at least the last 3. */
export const LEVELUP_MIN_SESSIONS = 8;
export const LEVELUP_EASY_STREAK = 3;
/** A deferred level-up stays quiet for this long. */
export const LEVELUP_DEFER_DAYS = 14;

/**
 * The Form grows on three axes: depth (levels), breadth (slots) and volume
 * (rounds). Breadth is the one worth the most, so it is gated hardest: the
 * sequence only gets longer once you have stopped struggling with what you
 * already have.
 */
export const SLOT_UNLOCK = {
  /** Completed Flow sessions since the last unlock. */
  minSessions: 10,
  /** No session rated "hard" in this many most recent sessions. */
  noHardWindow: 5,
  /** This fraction of active slots must be at level 2 or above. */
  depthFraction: 0.5,
  /** Volume is maxed before breadth increases. */
  requireTopOfRamp: true,
  /**
   * On unlock the round count resets to the bottom band, so a longer sequence
   * at fewer rounds is the same session length. That reset is the point: the
   * Form gets longer without the morning getting longer.
   */
  resetRounds: true,
};

/**
 * Micros are accelerants. A slot whose micros have been hit consistently
 * levels up sooner, and the proposal says so rather than asserting it.
 */
export const MICRO_ASSIST = {
  /** Fraction of the weekly target that counts as hitting it. */
  threshold: 0.8,
  /** Consecutive weeks at that threshold. */
  weeks: 2,
  /** The reduced bar, replacing LEVELUP_MIN_SESSIONS for that slot. */
  assistedSessions: 6,
};

/**
 * At most one proposal on Today, ever. Three decisions on a dark morning is a
 * chore list. Breadth beats depth: a longer Form is worth more than a harder
 * one.
 */
export const PROPOSAL_PRIORITY = ['slot', 'movement', 'strength', 'skate'] as const;

/**
 * Which Form slots and strength families build each skate trick family, for
 * the "Built by" line. Only a fallback: a trick's own Why skate text wins.
 */
export const SKATE_BUILT_BY: Record<string, { slots: number[]; families: string[] }> = {
  Pop: { slots: [4, 12], families: ['Single leg'] },
  Rotation: { slots: [2, 10], families: ['Hang'] },
  Manual: { slots: [1, 10], families: ['Hinge'] },
  Balance: { slots: [1, 4], families: ['Single leg'] },
  Grind: { slots: [4, 6], families: ['Single leg'] },
  Slide: { slots: [3, 4], families: ['Single leg'] },
  Transition: { slots: [4, 12], families: ['Single leg', 'Hinge'] },
  Flip: { slots: [4, 12], families: ['Single leg'] },
};

/** Weekly target: three sessions per rolling seven days. */
export const ROLLING_WINDOW_DAYS = 7;
export const SESSIONS_PER_WINDOW = 3;
export const MAX_LEVEL = 4;

/**
 * How the skate migration sets initial trick status.
 *
 * 'none'  — everything starts locked and Jan promotes tricks himself.
 * 'graph' — the section 7 rule: SKATE_BASELINE_CURRENT are current and the
 *           transitive closure of their prerequisites is mastered.
 *
 * Jan chose 'none': the graph baseline computed 3 current and 14 mastered,
 * which understated what he can already do, and he preferred a clean zero.
 */
export const SKATE_BASELINE: 'none' | 'graph' = 'none';
export const SKATE_BASELINE_CURRENT = ['rolling_ollie', 'frontside_180', 'switch_roll_10m'];

/**
 * Weekly planning. The brief calls this the most speculative part, so it is a
 * deterministic scheduler with every number here and no cleverness anywhere.
 * Replacing it should mean rewriting one file.
 */
export const PLANNER = {
  /** Aim for this many sessions, never exceed the maximum. */
  sessions: 4,
  maxSessions: 4,
  strength: 1,
  maxStrength: 2,
  engine: 1,
  minRestDays: 1,
  /**
   * Weekdays the planner may use, Monday = 0. The weekend is deliberately
   * absent: it is left free so a spur-of-the-moment skate has somewhere to
   * land, and a planned session there would only be one more thing to skip.
   */
  planDays: [0, 1, 2, 3, 4],
  /** Strength carries the plyometric work, so it never runs on back-to-back days. */
  strengthNeverConsecutive: true,
  /** A light morning before any planned skate window, so the legs are fresh. */
  lightBeforeSkate: true,
  /**
   * Preferred weekday for each type, Monday = 0. First workable day wins.
   * Strength on Tuesday and the run on Thursday puts a clear day between
   * them; Flow takes Monday and Friday, which leaves Wednesday to recover in
   * the middle rather than at the end.
   */
  strengthDays: [1, 3],
  engineDays: [3, 4],
  flowDays: [0, 4, 2],
  /** Rabotpark works April to October. Winter is unsolved and says so. */
  outdoorMonths: [4, 5, 6, 7, 8, 9, 10],
  outdoorLocation: 'Rabotpark',
  winterLocation: 'indoor, unsolved',
  homeLocation: 'home',
  /** A day with little time gets the fallback that still counts as a session. */
  busyDayType: 'flow short' as const,
};

/**
 * The skate session focus card, section 9: two or three rusty tricks, one or
 * two current projects, one stretch attempt, one switch or fakie item.
 *
 * Rust is the retention mechanic carried over from SkateQuest: a trick you
 * have mastered but not touched for three weeks needs confirming again.
 */
export const SKATE_FOCUS = {
  rusty: 3,
  /**
   * Live projects shown per session. Three rather than two because coming back
   * after a long break leaves several things half-there at once: the card sorts
   * by level, so the shakiest fundamentals get the attention first and the
   * showier tricks surface once those are confirmed.
   */
  projects: 3,
  stretch: 1,
  switchOrFakie: 1,
  rustAfterDays: 21,
  /**
   * Every other pick needs something already mastered or current. Starting
   * everything locked — which Jan chose — means the card would otherwise be
   * empty until he had marked tricks by hand. So a graph that knows nothing
   * offers the bottom of itself instead, which is where anyone starts anyway.
   */
  coldStart: 5,
};

/** A trick counts as switch or fakie work if its id contains one of these. */
export const SWITCH_FAKIE_MARKERS = ['switch', 'fakie', 'nollie'];

/**
 * The shape of a skate session, in the same form as STRENGTH.blocks. A skate
 * session is not a free-for-all: rust first while the legs are fresh and the
 * stakes are low, then the projects that need real attempts, then one stretch,
 * then time left over to actually skate.
 *
 * Minutes are offsets from the start. Every number here is a guess.
 */
export const SKATE_SESSION = {
  blocks: [
    { from: 0, to: 5, label: 'Roll in', reasons: [] as string[], warmUp: true },
    { from: 5, to: 18, label: 'Confirm the rusty ones', reasons: ['rusty'] },
    { from: 18, to: 45, label: 'The projects', reasons: ['project', 'start here'] },
    { from: 45, to: 54, label: 'One stretch attempt', reasons: ['stretch'] },
    { from: 54, to: 60, label: 'Switch and fakie', reasons: ['switch or fakie'] },
  ],
  /**
   * A block with nothing on its card is dropped and its minutes handed to the
   * blocks that do have something. A young graph then gives a short honest
   * session rather than a full-length one with four idle stretches in it.
   */
  dropEmptyBlocks: true,
  /**
   * A trick proposes mastery once it has been landed this many times inside one
   * session. The gate text is what Jan actually judges against — most gates are
   * qualitative ("Can leave board calmly") and no rule can evaluate them.
   */
  landsToPropose: 3,
  /** And only once there is enough evidence to mean anything. */
  minAttempts: 5,
  /** Quick-pick counts on the attempt logger. */
  attemptChoices: [1, 2, 3, 5],
  /** A stretch attempt above this risk is offered with a warning, not silently. */
  highRisk: 7,
};

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
  /**
   * Hitting a weekly target brings in a new one rather than leaving a finished
   * row sitting there. The done micro stays visible for the rest of the week —
   * finishing it is the point — but it stops counting towards the active few.
   */
  replaceOnComplete: true,
};

/**
 * The profile, section 12: one screen that says where Jan is across everything
 * he trains, as seven spokes rather than three separate ladder screens.
 *
 * Two rules held the whole design:
 *
 * 1. A spoke is a *depth*, never a percentage of the graph. "34 of 190 tricks"
 *    reads as 18% and would still read 25% at Christmas — a number that cannot
 *    move in a month is decoration. Depth reached against depth available moves
 *    the moment something levels up, which is the thing he already does.
 * 2. Nothing here is a new measurement. Every spoke is derived from state that
 *    already exists, so this screen writes nothing and can be deleted without
 *    trace.
 *
 * Every family in the skate graph is assigned to exactly one spoke. Adding a
 * family to the graph without adding it here would silently drop it, so the
 * verify script asserts the partition covers all of them.
 */
export const PROFILE = {
  /** Level 0-10 maps to a name by the last threshold it clears. */
  tierThresholds: [0, 1, 3, 5, 7, 9],
  /** Weight given to a run count relative to a ladder, in ladder-steps. */
  engineWeight: 8,
  /** Engine sessions over this window that would count as a full spoke. */
  engineWindowDays: 90,
  engineTarget: 12,
  axes: [
    {
      key: 'balance',
      label: 'Balance',
      // Slot *ids*, not sequence: Centering, Squat and ankle, Arm balance.
      slots: [1, 4, 11],
      strength: [] as string[],
      skate: [
        'Foundation',
        'Balance',
        'Manual',
        'Rail / primo foundation',
        'Truck stand foundation',
        'Truck stand tricks',
        'Freestyle foundation',
      ],
      tiers: ['Wobbler', 'Steady', 'Planted', 'Poised', 'Unshakeable', 'Cat'],
    },
    {
      key: 'power',
      label: 'Power',
      // Quadruped load, Ground push, Posterior chain, Compression core.
      slots: [5, 6, 8, 10],
      strength: ['Pull', 'Push', 'Single leg', 'Hinge'],
      skate: [] as string[],
      tiers: ['Soft', 'Working', 'Solid', 'Strong', 'Powerful', 'Hydraulic'],
    },
    {
      key: 'mobility',
      label: 'Mobility',
      // Spinal wave, Hip opener, Spinal extension.
      slots: [2, 3, 9],
      strength: [] as string[],
      skate: [] as string[],
      tiers: ['Stiff', 'Loosening', 'Supple', 'Fluid', 'Elastic', 'Liquid'],
    },
    {
      key: 'pop',
      label: 'Pop',
      slots: [] as number[],
      strength: [] as string[],
      skate: ['Pop prep', 'Pop', 'Scoop', 'Flip', 'Freestyle flip foundation'],
      tiers: ['Flat', 'Scraping', 'Popping', 'Springy', 'Snappy', 'Detonator'],
    },
    {
      key: 'control',
      label: 'Board control',
      // Transition and Rise: the two slots that are about moving between
      // shapes rather than holding one.
      slots: [7, 12],
      strength: [] as string[],
      skate: ['Rolling', 'Turning', 'Stance', 'Stopping', 'Rotation', 'Freestyle footwork', 'Freestyle'],
      tiers: ['Passenger', 'Steering', 'Driving', 'Precise', 'Surgical', 'Telepathic'],
    },
    {
      key: 'nerve',
      label: 'Nerve',
      slots: [] as number[],
      strength: [] as string[],
      skate: ['Terrain', 'Terrain variant', 'Transition', 'Street', 'Old school'],
      /**
       * The one spoke measured by the risk rating rather than by level. Nerve
       * is not how far up the graph you are, it is how committed the hardest
       * thing you have actually landed was.
       */
      useRisk: true,
      tiers: ['Careful', 'Willing', 'Committed', 'Bold', 'Fearless', 'No Brakes'],
    },
    {
      key: 'engine',
      label: 'Engine',
      slots: [] as number[],
      strength: ['Hang'],
      skate: [] as string[],
      /** The only spoke fed by session count, because nothing else measures it. */
      useEngineSessions: true,
      tiers: ['Winded', 'Ticking', 'Steady', 'Deep', 'Relentless', 'Diesel'],
    },
  ],
  /** The headline, from the average of the spokes. */
  ranks: ['Kook', 'Roller', 'Park Regular', 'Local', 'Ripper', 'Legend'],
};
