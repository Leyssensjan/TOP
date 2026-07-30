// In-memory store seeded with the real FlowQuest content, so the endpoints can
// be exercised with curl before a Notion token exists anywhere.
// Enabled only by FLOWQUEST_STORE=memory. Never used implicitly.

import type {
  Domain,
  Micro,
  MicroLogEntry,
  MicroPatch,
  NewPlanEntry,
  NewSession,
  PlanEntry,
  SessionLog,
  Skill,
  SkillPatch,
  Slot,
  SlotPatch,
  Store,
} from '@/lib/types';

type SlotSeed = [seq: number, name: string, active: boolean, short: boolean, unlock: number, entry: string, exit: string];

const SLOT_SEED: SlotSeed[] = [
  [1, 'Centering', true, true, 1, 'standing', 'standing'],
  [2, 'Spinal wave', true, true, 2, 'standing', 'forward fold'],
  [3, 'Hip opener', false, false, 7, 'forward fold', 'forward fold'],
  [4, 'Squat and ankle', true, true, 3, 'forward fold', 'deep squat'],
  [5, 'Quadruped load', true, true, 4, 'deep squat', 'beast'],
  [6, 'Ground push', true, true, 5, 'beast', 'beast'],
  [7, 'Transition', false, false, 10, 'beast', 'crab'],
  [8, 'Posterior chain', false, false, 9, 'crab', 'seated'],
  [9, 'Spinal extension', false, false, 11, 'seated', 'supine'],
  [10, 'Compression core', false, false, 8, 'supine', 'supine'],
  [11, 'Arm balance', false, false, 12, 'deep squat', 'deep squat'],
  [12, 'Rise', true, true, 6, 'floor', 'standing'],
];

type SkillSeed = [slot: number, level: number, name: string, cues: string, ref: string];

const SKILL_SEED: SkillSeed[] = [
  [1, 1, 'Standing breath', 'Feet hip width, weight even, breathe into the ribs not the chest. Six breaths.', 'standing diaphragmatic breathing'],
  [1, 2, 'Standing weight shifts', 'Slow, keep the breath rate from level 1.', 'standing weight shift drill'],
  [1, 3, 'Single-leg stance', '30 seconds each side, no wobbling the arms.', 'single leg balance hold'],
  [1, 4, 'Single-leg eyes closed', '20 seconds each side is already good.', 'single leg balance eyes closed'],
  [2, 1, 'Roll down', 'Chin to chest first, then unstack one vertebra at a time. Do not bounce.', 'standing spinal roll down'],
  [2, 2, 'Roll down with arm reach', 'One arm leads, eyes follow the hand.', 'roll down with thoracic rotation'],
  [2, 3, 'Segmented spinal wave', 'The wave should be visible from the side. Slow enough to be boring.', 'spinal wave movement drill'],
  [2, 4, 'Standing pike depth', 'Palms flat on the floor with straight legs is the marker.', 'standing pike compression'],
  [3, 1, 'Low lunge', 'Back knee down, tuck the tailbone, do not let the lower back arch.', 'low lunge hip flexor stretch'],
  [3, 2, 'Lunge with rotation', 'Rotate from the ribs, not the arm.', 'world greatest stretch'],
  [3, 3, 'Dragon lunge', 'Forearms down if you can. Front foot can turn out.', 'dragon pose hip opener'],
  [3, 4, 'Pigeon transition', 'The point is the transition in and out, not the hold.', 'pigeon pose transition'],
  [4, 1, 'Supported deep squat', 'Heels down if possible. Heels on a book is fine to start.', 'assisted deep squat'],
  [4, 2, 'Free deep squat hold', 'Elbows inside knees, chest tall, breathe. Aim for a comfortable minute.', 'deep squat hold'],
  [4, 3, 'Deep squat with rotation', 'Keep both heels down while you rotate.', 'deep squat thoracic rotation'],
  [4, 4, 'Deep squat heel-lift control', 'Rise onto the toes in the bottom of the squat and lower slowly.', 'deep squat heel raise'],
  [5, 1, 'Beast hold', 'Knees one centimetre off the floor, flat back, do not let the hips rise.', 'beast hold quadruped'],
  [5, 2, 'Beast shoulder taps', 'Hips should not sway. That is the whole exercise.', 'beast shoulder tap'],
  [5, 3, 'Beast leg lift', 'Lift from the glute, not the lower back.', 'beast hold leg lift'],
  [5, 4, 'Beast crawl', 'Opposite hand and foot. Slow. Keep the hips low.', 'beast crawl animal flow'],
  [6, 1, 'Knee push-up', 'Straight line from knee to head. Elbows back at 45 degrees, not flared.', 'knee push up form'],
  [6, 2, 'Full push-up', 'Chest to the floor or it does not count.', 'push up full range'],
  [6, 3, 'Archer push-up', 'The straight arm stays straight. Do not let it bend to help.', 'archer push up'],
  [6, 4, 'Pseudo-planche push-up', 'Hands by the waist, shoulders far forward of the wrists.', 'pseudo planche push up'],
  [7, 1, 'Slow under-switch', 'One leg threads under the body. Break it into pieces before you join it up.', 'underswitch animal flow'],
  [7, 2, 'Full under-switch', 'One continuous movement, no stopping halfway.', 'underswitch full'],
  [7, 3, 'Scorpion reach', 'The reaching leg goes long, not high.', 'scorpion reach animal flow'],
  [7, 4, 'Loaded beast switch', 'Hips stay low throughout. This is where the flow starts to look like flow.', 'animal flow travelling form'],
  [8, 1, 'Crab hold', 'Hips up, fingers pointing away from you, chest open.', 'crab position hold'],
  [8, 2, 'Crab reach', 'Reach over the head, let the head follow the hand.', 'crab reach animal flow'],
  [8, 3, 'Crab toe touch', 'Opposite hand to opposite foot without dropping the hips.', 'crab toe touch'],
  [8, 4, 'Crab walk', 'Hips never touch the floor. Four steps forward, four back.', 'crab walk exercise'],
  [9, 1, 'Glute bridge', 'Drive through the heels, ribs down, squeeze at the top.', 'glute bridge'],
  [9, 2, 'Shoulder bridge', 'Weight moves toward the upper back, not the neck. Never load the neck.', 'shoulder bridge pose'],
  [9, 3, 'Wheel prep', 'Press the floor away. If the shoulders will not open, stay here for months.', 'wheel pose preparation'],
  [9, 4, 'Full wheel', 'Straight arms, weight even between hands and feet. Come down slowly.', 'wheel pose urdhva dhanurasana'],
  [10, 1, 'Dead bug', 'Lower back stays flat on the floor. If it lifts, shorten the range.', 'dead bug exercise'],
  [10, 2, 'Hollow hold', 'Lower back pressed down, shoulders and heels off the floor.', 'hollow body hold'],
  [10, 3, 'Hollow rock', 'Rock from the whole body, not by pumping the legs.', 'hollow body rock'],
  [10, 4, 'L-sit progression', 'Tuck L-sit first. Push the floor down, do not just hang on the shoulders.', 'l sit progression tuck'],
  [11, 1, 'Crow prep', 'Put a cushion in front of your head. You will fall forward at some point.', 'crow pose preparation'],
  [11, 2, 'Crow hold 10s', 'Look forward, not down. Round the upper back.', 'crow pose bakasana'],
  [11, 3, 'Crow hold 30s', 'Breathe while holding. If you are holding your breath you are still fighting it.', 'crow pose hold'],
  [11, 4, 'Tuck handstand at wall', 'Stack shoulders over wrists. Come down before you are tired.', 'wall tuck handstand'],
  [12, 1, 'Roll to stand', 'Use momentum first. Fewer hands each week.', 'rolling to stand movnat'],
  [12, 2, 'Unassisted get-up', 'Slow it down until momentum stops helping you.', 'turkish get up bodyweight'],
  [12, 3, 'Shrimp squat', 'Knee to the floor gently. Do not bang it down.', 'shrimp squat progression'],
  [12, 4, 'Pistol squat', 'Heel stays down. Hold something light out front for counterbalance at first.', 'pistol squat progression'],
];

type MicroSeed = [name: string, domain: string, feeds: number | null, target: number, trigger: string, cue: string, duration: string, active: boolean];

const MICRO_SEED: MicroSeed[] = [
  ['Deep squat while the kettle boils', 'movement', 4, 10, 'Waiting for water, coffee or the microwave', 'Heels down if you can, elbows inside the knees. Get up slowly.', '60 seconds', true],
  ['Invisible chair', 'skate', null, 3, 'Any wall, any wait', '90 seconds. Phone goes on the floor.', '2 minutes', true],
  ['Doorway hip flexor stretch', 'movement', 3, 7, 'Getting up from your desk after a long stretch of sitting', 'Back knee down, tailbone tucked. This is the antidote to the train and the desk.', '45 seconds each side', true],
  ['Ankle circles on the train', 'skate', null, 5, 'Sitting on the train to Mechelen', 'Both directions, slow, feel the end range.', '45 seconds', true],
  ['Ghost switch', 'skate', null, 3, 'Any spare two minutes indoors', 'Stand in switch stance, eyes closed 30 seconds, then ten slow switch push motions.', '2 minutes', true],
  ['Tempo twenty', 'skate', 4, 3, 'Any excuse, anywhere', '20 slow squats: three seconds down, pause, up.', '2 minutes', true],
  ['Wrist prep at the desk', 'movement', 5, 5, 'Sitting down at your desk in the morning', 'Palms down, fingers back, rock gently. Your wrists carry the whole middle of the Form.', '45 seconds', true],
  ['Coffee calves', 'skate', null, 5, 'While the coffee brews', '25 slow single-leg calf raises per side.', '2 minutes', true],
  ['Kerb surfer', 'skate', 1, 3, 'Walking anywhere with a kerb', 'Balance-walk a kerb edge for two minutes total. Heel-to-toe on the way back.', '2 minutes', true],
  ['Hip circles', 'movement', 3, 5, 'Standing around waiting for anything', 'Five slow, max-range standing hip circles per side.', '2 minutes', true],
  ['Counter push-up', 'movement', 6, 7, 'Waiting at the kitchen counter', 'Chest to the counter, elbows back not flared. Ten slow reps.', '30 seconds', true],
  ['Snapdown x5', 'skate', null, 2, 'Before you leave the house', 'Five snapdowns: jump tall, land frozen in the ollie crouch, silent feet. Not on a plyo-rest morning.', '1 minute', true],
  ['Floor sit and rise', 'movement', 12, 5, 'Coming home, before you sit on the couch', 'Sit down on the floor and get back up. Use fewer hands each time.', '60 seconds', true],
  ['Dead hang', 'general', null, 3, 'Passing Rabotpark on foot or by bike', 'Passive hang, shoulders relaxed. This is the only pulling you get outside Strength sessions.', '30 seconds', false],
  ['One-leg stand while brushing teeth', 'movement', 1, 10, 'Brushing your teeth, twice a day', 'One leg, other foot off the floor. Swap halfway.', '60 seconds', true],
  ['Stair snack', 'skate', null, 5, 'Any staircase, all day', 'At least once, take three or more flights briskly, two steps at a time.', '2 minutes', true],
];

export class MemoryStore implements Store {
  readonly name = 'memory';

  private slots: Slot[] = SLOT_SEED.map(([sequence, name, active, inShortForm, unlockOrder, entryPosition, exitPosition]) => ({
    id: `slot-${sequence}`,
    name,
    sequence,
    active,
    inShortForm,
    currentLevel: 1,
    unlockOrder,
    entryPosition,
    exitPosition,
  }));

  private skills: Skill[] = SKILL_SEED.map(([slot, level, name, cues, referenceTerm]) => {
    const slotSeed = SLOT_SEED.find((s) => s[0] === slot)!;
    return {
      id: `skill-${slot}-${level}`,
      name,
      domain: 'movement' as Domain,
      slot,
      level,
      status: level === 1 ? ('current' as const) : ('locked' as const),
      cues,
      referenceTerm,
      entryPosition: slotSeed[5],
      exitPosition: slotSeed[6],
      whyBuilds: '',
      whyUnlocks: '',
      sessionsAtLevel: 0,
      lastPracticed: null,
      levelUpDeferred: null,
      durationSeconds: null,
    };
  });

  private micros: Micro[] = MICRO_SEED.map(([name, domain, feedsSlot, weeklyTarget, trigger, cue, duration, active], i) => ({
    id: `micro-${i}`,
    name,
    domain,
    feedsSlot,
    weeklyTarget,
    trigger,
    cue,
    duration,
    referenceTerm: '',
    active,
    retired: false,
    stat: [],
  }));

  private sessions: SessionLog[] = [];
  private plan: PlanEntry[] = [];
  private microLog: MicroLogEntry[] = [];
  private seq = 0;

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  async getSlots(): Promise<Slot[]> {
    return this.slots.map((s) => ({ ...s })).sort((a, b) => a.sequence - b.sequence);
  }

  async getSkills(domain?: Domain): Promise<Skill[]> {
    return this.skills.filter((s) => !domain || s.domain === domain).map((s) => ({ ...s }));
  }

  async updateSkill(id: string, patch: SkillPatch): Promise<void> {
    const skill = this.skills.find((s) => s.id === id);
    if (skill) Object.assign(skill, patch);
  }

  async updateSlot(id: string, patch: SlotPatch): Promise<void> {
    const slot = this.slots.find((s) => s.id === id);
    if (slot) Object.assign(slot, patch);
  }

  async getSessionsSince(since: string): Promise<SessionLog[]> {
    return this.sessions
      .filter((s) => s.date >= since)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((s) => ({ ...s }));
  }

  async createSession(input: NewSession): Promise<SessionLog> {
    const session: SessionLog = {
      id: this.nextId('session'),
      name: input.name ?? `${input.type} ${input.date}`,
      date: input.date,
      type: input.type,
      plannedMinutes: input.plannedMinutes ?? null,
      actualMinutes: input.actualMinutes ?? null,
      completed: input.completed,
      difficulty: input.difficulty ?? null,
      soreness: input.soreness ?? '',
      notes: input.notes ?? '',
      skillsPracticed: input.skillsPracticed,
    };
    this.sessions.push(session);
    return { ...session };
  }

  async getPlanForDay(day: string): Promise<PlanEntry | null> {
    const entries = this.plan.filter((p) => p.day === day);
    if (!entries.length) return null;
    return { ...(entries.find((e) => e.status !== 'done' && e.status !== 'skipped') ?? entries[0]) };
  }

  async getPlanForWeek(weekStart: string): Promise<PlanEntry[]> {
    return this.plan
      .filter((p) => p.weekStart === weekStart)
      .sort((a, b) => (a.day ?? '').localeCompare(b.day ?? ''))
      .map((p) => ({ ...p }));
  }

  async createPlanEntry(entry: NewPlanEntry): Promise<PlanEntry> {
    const created: PlanEntry = {
      id: this.nextId('plan'),
      name: entry.name ?? `${entry.sessionType} ${entry.day}`,
      weekStart: entry.weekStart,
      day: entry.day,
      sessionType: entry.sessionType,
      plannedMinutes: entry.plannedMinutes ?? null,
      location: entry.location ?? '',
      status: entry.status ?? 'planned',
      reasonNote: entry.reasonNote ?? '',
    };
    this.plan.push(created);
    return { ...created };
  }

  async updatePlanEntry(id: string, patch: Partial<NewPlanEntry>): Promise<void> {
    const entry = this.plan.find((p) => p.id === id);
    if (entry) Object.assign(entry, patch);
  }

  async getMicros(): Promise<Micro[]> {
    return this.micros.map((m) => ({ ...m }));
  }

  async updateMicro(id: string, patch: MicroPatch): Promise<void> {
    const micro = this.micros.find((m) => m.id === id);
    if (micro) Object.assign(micro, patch);
  }

  async getMicroLogSince(since: string): Promise<MicroLogEntry[]> {
    return this.microLog.filter((m) => m.date >= since).map((m) => ({ ...m }));
  }

  async createMicroLog(name: string, date: string, count: number, weekStart: string): Promise<MicroLogEntry> {
    const entry: MicroLogEntry = { id: this.nextId('microlog'), name, date, count, weekStart };
    this.microLog.push(entry);
    return { ...entry };
  }
}
