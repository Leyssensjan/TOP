/**
 * Runs the pure rules against a snapshot of the real Notion rows.
 * Not part of the app. Run with: npx tsx scripts/verify-rules.ts
 */
import { readFileSync } from 'node:fs';
import { profileStats, planSession, levelUpProposals, rollingStatus, rotateMicros, microProgress, skateFocus, unlockableTricks, roundsForFlow, strengthLevelUpProposals, unitOf, levelUpTargetOf, slotUnlockProposal, buildSkateSession, skateProposals, chooseProposal, assistedSlots, sessionsNeeded, flowsSinceUnlock, sessionsUntilNextSlot, nextSlotToUnlock } from '../lib/rules';
import { MICRO_ASSIST, MICRO_ROTATION, PLANNER, PROFILE, ROUND_RAMP, SKATE_FOCUS, SKATE_SESSION, SLOT_UNLOCK, SOUND, STRENGTH, TARGET_MINUTES } from '../lib/config';
import { skateContent } from '../lib/skate-content';
import { renderWav } from '../lib/client/sound';
import { generateWeek } from '../lib/planner';
import { addDays, weekStart } from '../lib/dates';
import { parse, applyBaseline, SOURCE } from './skate-migration';
import type { Micro, MicroLogEntry, SessionLog, SkateSet, Skill, Slot, StrengthSet } from '../lib/types';

const fixture = JSON.parse(readFileSync(new URL('./notion-snapshot.json', import.meta.url), 'utf8')) as {
  slots: Slot[];
  skills: Skill[];
  micros: Micro[];
  microLog: MicroLogEntry[];
  sessions: SessionLog[];
  today: string;
};

const { slots, skills, micros, microLog, sessions, today } = fixture;
const week = weekStart(today);

/** The seven planned types in day order. */
function plannedTypes(week: ReturnType<typeof generateWeek>): string[] {
  return week.entries
    .slice()
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((e) => e.sessionType as string);
}

/** Local date arithmetic, so the checks do not depend on the app's helpers. */
function addDaysStr(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
let failures = 0;

function check(label: string, condition: boolean, detail: string) {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log(`Snapshot: ${slots.length} slots, ${skills.length} skills, ${micros.length} micros, ${sessions.length} sessions\n`);

// --- session composition on real rows ---
const flow = planSession(slots, skills, 'flow', today, 'default');
const short = planSession(slots, skills, 'flow short', today, 'default');
const roundSeconds = flow.movements.reduce((s, m) => s + m.seconds, 0);

console.log('Flow:', `${flow.movements.length} movements`, `${flow.rounds} rounds`, `${Math.round(flow.totalSeconds / 60)} min`);
console.log('Flow Short:', `${short.movements.length} movements`, `${short.rounds} rounds`, `${Math.round(short.totalSeconds / 60)} min`);
console.log('Round length:', `${Math.floor(roundSeconds / 60)}:${String(roundSeconds % 60).padStart(2, '0')}\n`);

check(
  'Flow uses only active slots',
  flow.movements.every((m) => slots.find((s) => (s.slotId || s.sequence) === m.slot)?.active === true),
  '',
);

// Sequence is position, Slot id is identity. They no longer agree, and every
// lookup must key on identity or a reorder silently repoints the movements.
const armBalance = slots.find((s) => s.name === 'Arm balance')!;
check(
  'Sequence and Slot id have genuinely diverged in the snapshot',
  armBalance.sequence !== armBalance.slotId,
  `Arm balance is sequence ${armBalance.sequence}, slot id ${armBalance.slotId}`,
);
const allTwelve = planSession(
  slots.map((s) => ({ ...s, active: true })),
  skills,
  'flow',
  today,
  'default',
  null,
  0,
);
check(
  'A reordered slot still resolves its own movements',
  allTwelve.movements[4]?.name === skills.find((s) => s.slot === 11 && s.level === 1)?.name,
  `position 5 is "${allTwelve.movements[4]?.name}"`,
);
check(
  'Movement order follows Sequence, not Slot id',
  allTwelve.movements.map((m) => m.slot).join(',') === '1,2,3,4,11,5,6,7,8,9,10,12',
  allTwelve.movements.map((m) => m.slot).join(','),
);

// The full twelve-slot chain should now close on itself with no seams.
const fullSeams = allTwelve.movements.filter((m, i, arr) => m.exitPosition !== arr[(i + 1) % arr.length].entryPosition);
check('The full twelve-slot Form is an unbroken loop', fullSeams.length === 0, `${fullSeams.length} seams`);
// The ramp starts short on purpose and only reaches the brief's 15-20 minute
// band once the habit is established.
const rampBands: Array<[number, number]> = [[1, 2], [6, 2], [7, 3], [14, 3], [15, 4], [99, 4]];
check(
  'Round ramp: 1-6 two rounds, 7-14 three, 15+ four',
  rampBands.every(([sessionNumber, rounds]) => roundsForFlow(sessionNumber - 1) === rounds),
  '',
);
const rampedFlow = planSession(slots, skills, 'flow', today, 'default', null, 20);
check(
  'A ramped Flow lands in the 15-20 min band',
  rampedFlow.totalSeconds >= 15 * 60 && rampedFlow.totalSeconds <= 21 * 60,
  `${Math.round(rampedFlow.totalSeconds / 60)} min at 4 rounds`,
);
check(
  'Flow Short never ramps',
  planSession(slots, skills, 'flow short', today, 'default', null, 50).rounds === 1,
  '',
);
check(
  'An empty Slot id falls back to Sequence rather than emptying the Form',
  planSession(slots.map((s) => ({ ...s, slotId: 0 })), skills, 'flow', today, 'default', null, 0).movements.length ===
    flow.movements.length,
  '',
);
check('Flow Short is one round', short.rounds === 1, `${short.rounds}`);
check('Every movement has a duration', flow.movements.every((m) => m.seconds > 0), '');

// Duration seconds from Notion must win over the config fallback.
const withOverride = skills.map((s) => (s.slot === 1 && s.level === 1 ? { ...s, durationSeconds: 999 } : s));
const overridden = planSession(slots, withOverride, 'flow', today, 'default');
check(
  'Duration seconds overrides the config fallback',
  overridden.movements.find((m) => m.slot === 1)?.seconds === 999,
  `${overridden.movements.find((m) => m.slot === 1)?.seconds}`,
);
check(
  'Empty Duration seconds falls back to config',
  flow.movements.find((m) => m.slot === 1)?.seconds === 60,
  `${flow.movements.find((m) => m.slot === 1)?.seconds}`,
);

// --- strength, against the 21 real ladder rows -----------------------------
const strengthPlan = planSession(slots, skills, 'strength', today, 'default');
const sBlocks = strengthPlan.strength?.blocks ?? [];
console.log(`\nStrength: ${sBlocks.length} blocks`);
sBlocks.forEach((b) =>
  console.log(
    `  ${b.fromMinute}-${b.toMinute} ${b.label}: ${b.movements.map((m) => `${m.family} ${m.name} L${m.level}`).join(' + ') || 'warm-up'}`,
  ),
);

check('Strength plans blocks', sBlocks.length === STRENGTH.blocks.length, `${sBlocks.length}`);
check(
  'Every ladder has exactly one current movement',
  STRENGTH.ladders.every(
    (f) => skills.filter((s) => s.domain === 'strength' && s.family === f && s.status === 'current').length === 1,
  ),
  STRENGTH.ladders.map((f) => `${f}:${skills.filter((s) => s.domain === 'strength' && s.family === f && s.status === 'current').length}`).join(' '),
);
check(
  'Every non-warm-up block resolves a movement per family',
  sBlocks.filter((b) => !b.warmUp).every((b) => b.movements.length === b.families.length),
  sBlocks.filter((b) => !b.warmUp).map((b) => `${b.movements.length}/${b.families.length}`).join(' '),
);
check(
  'Strength blocks cover the target minutes without gaps or overlap',
  sBlocks.every((b, i) => (i === 0 ? b.fromMinute === 0 : b.fromMinute === sBlocks[i - 1].toMinute)) &&
    sBlocks[sBlocks.length - 1].toMinute === strengthPlan.targetMinutes,
  `${sBlocks[sBlocks.length - 1]?.toMinute} of ${strengthPlan.targetMinutes}`,
);
// The Runner walks blocks, so an empty movement list on Strength is correct,
// but only as long as every block still carries a positive duration.
check(
  'Every strength block has a positive duration',
  sBlocks.every((b) => b.toMinute > b.fromMinute),
  '',
);
check('Strength has no Form movements to walk', strengthPlan.movements.length === 0, '');
check(
  'Strength names the movements the Close screen will log',
  sBlocks.flatMap((b) => b.movements.map((m) => m.id)).length === 5,
  `${sBlocks.flatMap((b) => b.movements).length} lifts`,
);

// --- strength set logging and its level-up rule ----------------------------
// Built on the real ladder rows, so the names and units are the live ones.
const pullCurrent = skills.find((s) => s.domain === 'strength' && s.family === 'Pull' && s.status === 'current')!;
const hangCurrent = skills.find((s) => s.domain === 'strength' && s.family === 'Hang' && s.status === 'current')!;

check(
  'Units come from Notion, not from a guess',
  unitOf(pullCurrent) === 'reps' && unitOf(hangCurrent) === 'seconds',
  `${pullCurrent.name} in ${unitOf(pullCurrent)}, ${hangCurrent.name} in ${unitOf(hangCurrent)}`,
);

const cleanSession: SessionLog = {
  id: 'sx', name: `strength ${today} [abc123]`, date: today, type: 'strength', plannedMinutes: 30,
  actualMinutes: 30, completed: true, difficulty: 'right', soreness: '', notes: '',
  skillsPracticed: [pullCurrent.name], distanceKm: null, route: '',
};
const hardSession: SessionLog = { ...cleanSession, id: 'sy', name: `strength ${today} [zzz999]`, difficulty: 'hard' };

const setsOf = (session: string, skill: string, values: number[], unit: 'reps' | 'seconds'): StrengthSet[] =>
  values.map((v, i) => ({
    id: `set-${session}-${i}`, name: '', date: today, skill, set: i + 1,
    reps: unit === 'reps' ? v : null, seconds: unit === 'seconds' ? v : null, session,
  }));

const threeOfEight = setsOf('abc123', pullCurrent.name, [8, 8, 8], 'reps');
check(
  'Three sets of eight in a clean session proposes a level-up',
  strengthLevelUpProposals(skills, threeOfEight, [cleanSession], today).some((p) => p.family === 'Pull'),
  '',
);
check(
  'Two sets of eight is not enough',
  strengthLevelUpProposals(skills, setsOf('abc123', pullCurrent.name, [8, 8], 'reps'), [cleanSession], today).length === 0,
  '',
);
check(
  'Three sets short of eight is not enough',
  strengthLevelUpProposals(skills, setsOf('abc123', pullCurrent.name, [7, 7, 7], 'reps'), [cleanSession], today).length === 0,
  '',
);
check(
  'A session closed as hard does not count, however good the sets',
  strengthLevelUpProposals(skills, setsOf('zzz999', pullCurrent.name, [12, 12, 12], 'reps'), [hardSession], today).length === 0,
  '',
);
// Three good sets spread over three separate sessions is not "three sets of
// eight" — that rule is about one session's work.
const spread = [
  ...setsOf('a1', pullCurrent.name, [8], 'reps'),
  ...setsOf('a2', pullCurrent.name, [8], 'reps'),
  ...setsOf('a3', pullCurrent.name, [8], 'reps'),
];
check(
  'Good sets spread across sessions do not add up to a level-up',
  strengthLevelUpProposals(
    skills,
    spread,
    ['a1', 'a2', 'a3'].map((id) => ({ ...cleanSession, id, name: `strength ${today} [${id}]` })),
    today,
  ).length === 0,
  '',
);
// Holds are judged on seconds, so a rep count must not accidentally clear them.
check(
  'A hold levels up on seconds, not on reps',
  strengthLevelUpProposals(skills, setsOf('abc123', hangCurrent.name, [60, 60, 60], 'seconds'), [cleanSession], today)
    .some((p) => p.family === 'Hang') &&
    strengthLevelUpProposals(skills, setsOf('abc123', hangCurrent.name, [8, 8, 8], 'reps'), [cleanSession], today).length === 0,
  '',
);
// A cue that says "five reps is a set" must not be judged against a global
// eight. Five of the twenty-one movements name their own count.
{
  const withTarget = skills.map((s) =>
    s.id === pullCurrent.id ? { ...s, levelUpTarget: 5 } : s,
  );
  const fives = setsOf('abc123', pullCurrent.name, [5, 5, 5], 'reps');
  check(
    'A movement with its own target is judged against that target',
    strengthLevelUpProposals(withTarget, fives, [cleanSession], today).some((p) => p.family === 'Pull'),
    `${levelUpTargetOf({ unit: 'reps', levelUpTarget: 5 })} instead of ${STRENGTH.levelUpReps}`,
  );
  check(
    'And without it the global default still applies',
    strengthLevelUpProposals(skills, fives, [cleanSession], today).length === 0,
    '',
  );
  check(
    'A hold with its own target uses seconds, not the global 45',
    levelUpTargetOf({ unit: 'seconds', levelUpTarget: 60 }) === 60 &&
      levelUpTargetOf({ unit: 'seconds', levelUpTarget: null }) === STRENGTH.levelUpSeconds,
    '',
  );
}

check(
  'A deferred strength level-up stays quiet',
  strengthLevelUpProposals(
    skills.map((s) => (s.id === pullCurrent.id ? { ...s, levelUpDeferred: today } : s)),
    threeOfEight,
    [cleanSession],
    today,
  ).length === 0,
  '',
);

// --- engine and skate are startable ----------------------------------------
const engine = planSession(slots, skills, 'engine', today, 'default');
const skate = planSession(slots, skills, 'skate', today, 'default');
check(
  'Engine and Skate carry a target and a note rather than an empty screen',
  engine.targetMinutes > 0 && skate.targetMinutes > 0 && Boolean(engine.note) && Boolean(skate.note),
  `engine ${engine.targetMinutes} min, skate ${skate.targetMinutes} min`,
);

// --- continuity of the real slot order ---
const chain = flow.movements;
const seams: string[] = [];
for (let i = 0; i < chain.length; i += 1) {
  const cur = chain[i];
  const next = chain[(i + 1) % chain.length];
  if (cur.exitPosition !== next.entryPosition) {
    seams.push(`slot ${cur.slot} exits "${cur.exitPosition}" but slot ${next.slot} enters "${next.entryPosition}"`);
  }
}
console.log(`\nContinuity seams in the current Form: ${seams.length}`);
seams.forEach((s) => console.log(`  ${s}`));

// --- rolling window and levelling ---
const rolling = rollingStatus(sessions, today);
console.log(`\nRolling: ${rolling.count}/${rolling.target}, streak ${rolling.streakWeeks} weeks`);
check('No level-up proposed with zero sessions banked', levelUpProposals(slots, skills, sessions, today).length === 0, '');

// Synthetic: eight sessions at level, last three easy, should propose.
const slot1Skill = skills.find((s) => s.slot === 1 && s.level === 1)!;
const primed = skills.map((s) => (s.id === slot1Skill.id ? { ...s, sessionsAtLevel: 8 } : s));
const easySessions: SessionLog[] = [0, 1, 2].map((i) => ({
  id: `s${i}`, name: 'x', date: `2026-07-2${7 + i}`, type: 'flow', plannedMinutes: 18,
  actualMinutes: 18, completed: true, difficulty: 'easy', soreness: '', notes: '',
  skillsPracticed: [slot1Skill.name], distanceKm: null, route: '',
}));
const primedSkills = primed;
const proposals = levelUpProposals(slots, primed, easySessions, today);
check('Level-up proposed after 8 sessions with 3 easy', proposals.some((p) => p.slot === 1), `${proposals.length} proposals`);

const hardSessions = easySessions.map((s) => ({ ...s, difficulty: 'right' as const }));
check('No level-up when the last three were not easy', levelUpProposals(slots, primed, hardSessions, today).every((p) => p.slot !== 1), '');

const deferred = primed.map((s) => (s.id === slot1Skill.id ? { ...s, levelUpDeferred: today } : s));
check('Deferring silences the proposal', levelUpProposals(slots, deferred, easySessions, today).every((p) => p.slot !== 1), '');

// --- the three axes: depth, breadth, volume --------------------------------
// Breadth is the axis worth the most and the one gated hardest.

const topRounds = ROUND_RAMP[ROUND_RAMP.length - 1].rounds;
const ready = (n: number): SessionLog[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `f${i}`, name: `flow d${i} [f${i}]`, date: addDaysStr(today, -(n - i)), type: 'flow' as const,
    plannedMinutes: 18, actualMinutes: 18, completed: true, difficulty: 'right' as const,
    soreness: '', notes: '', skillsPracticed: [], distanceKm: null, route: '',
  }));

// Exactly half the active slots at level 2 or above, which is the depth
// condition sitting right on its boundary.
const activeIds = slots.filter((s) => s.active).map((s) => s.id);
const toDeepen = new Set(activeIds.slice(0, Math.ceil(activeIds.length * SLOT_UNLOCK.depthFraction)));
const deepSlots = slots.map((s) => (toDeepen.has(s.id) ? { ...s, currentLevel: 2 } : s));
const manyFlows = ready(40);

check(
  'A slot unlock needs all four conditions together',
  slotUnlockProposal(deepSlots, manyFlows, today) !== null,
  `${slots.filter((s) => s.active).length} active`,
);
check(
  'Too few sessions blocks the unlock',
  slotUnlockProposal(deepSlots, ready(SLOT_UNLOCK.minSessions - 1), today) === null,
  '',
);
check(
  'A hard session in the recent window blocks the unlock',
  slotUnlockProposal(
    deepSlots,
    manyFlows.map((s, i) => (i === manyFlows.length - 1 ? { ...s, difficulty: 'hard' as const } : s)),
    today,
  ) === null,
  '',
);
check(
  'Shallow depth blocks the unlock even with the sessions banked',
  slotUnlockProposal(slots, manyFlows, today) === null,
  'all slots at level 1',
);
check(
  'Volume must be maxed before breadth increases',
  slotUnlockProposal(deepSlots, ready(SLOT_UNLOCK.minSessions), today) === null ||
    roundsForFlow(SLOT_UNLOCK.minSessions) === topRounds,
  '',
);

// The reset is the point: a longer sequence at fewer rounds is the same
// morning. It only works because the ramp counts flows since the last unlock.
const proposal = slotUnlockProposal(deepSlots, manyFlows, today)!;
check(
  'Unlocking resets rounds to the bottom band',
  proposal.roundsBefore === topRounds && proposal.roundsAfter === ROUND_RAMP[0].rounds,
  `${proposal.roundsBefore} to ${proposal.roundsAfter}`,
);
const afterUnlock = deepSlots.map((s) => (s.id === proposal.slotId ? { ...s, active: true, unlockedOn: today } : s));
check(
  'And the reset is real: the ramp counts flows since that unlock',
  roundsForFlow(flowsSinceUnlock(afterUnlock, manyFlows)) === ROUND_RAMP[0].rounds,
  `${flowsSinceUnlock(afterUnlock, manyFlows)} flows since`,
);
check(
  'The next slot to unlock is the one with the lowest unlock order',
  nextSlotToUnlock(slots)?.name === slots.filter((s) => !s.active).sort((a, b) => a.unlockOrder - b.unlockOrder)[0].name,
  `${nextSlotToUnlock(slots)?.name}`,
);
check(
  'The horizon counts down and never goes negative',
  (sessionsUntilNextSlot(slots, ready(3)) ?? -1) > 0 &&
    (sessionsUntilNextSlot(slots, manyFlows) ?? -1) === 0,
  `${sessionsUntilNextSlot(slots, ready(3))} then ${sessionsUntilNextSlot(slots, manyFlows)}`,
);
// The horizon has to survive the session it names: promising a slot in ten
// sessions and delivering it in fifteen is exactly the kind of small lie that
// makes the arc stop being believable.
check(
  'The horizon never lands before the unlock can actually fire',
  (() => {
    for (const n of [0, 3, 9, 10, 12, 13, 14]) {
      const at = sessionsUntilNextSlot(deepSlots, ready(n));
      if (at === null) continue;
      const banked = ready(n + at);
      if (slotUnlockProposal(deepSlots, banked, today) === null) return false;
    }
    return true;
  })(),
  '',
);
check(
  'And it accounts for the ramp, not only the session count',
  (sessionsUntilNextSlot(deepSlots, ready(0)) ?? 0) >= SLOT_UNLOCK.minSessions,
  `${sessionsUntilNextSlot(deepSlots, ready(0))} from a standing start`,
);

// One proposal, ever. Breadth beats depth beats strength.
const movementProposal = levelUpProposals(slots, primedSkills, easySessions, today);
const strengthProposal = strengthLevelUpProposals(skills, threeOfEight, [cleanSession], today);
check(
  'Only one proposal is ever offered',
  chooseProposal(proposal, movementProposal, strengthProposal)?.kind === 'slot',
  '',
);
check(
  'Depth is offered when there is no slot to unlock',
  chooseProposal(null, movementProposal, strengthProposal)?.kind === 'movement',
  '',
);
check(
  'Strength comes last',
  chooseProposal(null, [], strengthProposal)?.kind === 'strength',
  '',
);
check('Nothing due means no card at all', chooseProposal(null, [], []) === null, '');

// --- micros as accelerants -------------------------------------------------
const kettle = micros.find((m) => m.feedsSlot !== null && m.weeklyTarget)!;
const hitWeeks = (weeks: number): MicroLogEntry[] =>
  Array.from({ length: weeks }, (_, w) => ({
    id: `ml${w}`, name: kettle.name, date: addDaysStr(weekStart(today), -7 * (w + 1)),
    count: Math.ceil(kettle.weeklyTarget! * MICRO_ASSIST.threshold), weekStart: null,
  }));

check(
  'Two consecutive weeks at the threshold lowers the bar',
  assistedSlots([kettle], hitWeeks(MICRO_ASSIST.weeks), today).has(kettle.feedsSlot!),
  `${kettle.name} feeds slot ${kettle.feedsSlot}`,
);
check(
  'One week is not enough',
  !assistedSlots([kettle], hitWeeks(1), today).has(kettle.feedsSlot!),
  '',
);
check(
  'The lowered bar is the configured one',
  sessionsNeeded(kettle.feedsSlot!, assistedSlots([kettle], hitWeeks(MICRO_ASSIST.weeks), today)) ===
    MICRO_ASSIST.assistedSessions,
  `${MICRO_ASSIST.assistedSessions} instead of 8`,
);
check(
  'An assisted slot proposes sooner, and says it was assisted',
  levelUpProposals(
    slots,
    skills.map((s) => (s.slot === 1 && s.level === 1 ? { ...s, sessionsAtLevel: MICRO_ASSIST.assistedSessions } : s)),
    easySessions,
    today,
    new Set([1]),
  ).some((p) => p.slot === 1 && p.assisted),
  '',
);
check(
  'Without the assist, the same slot is not yet due',
  levelUpProposals(
    slots,
    skills.map((s) => (s.slot === 1 && s.level === 1 ? { ...s, sessionsAtLevel: MICRO_ASSIST.assistedSessions } : s)),
    easySessions,
    today,
  ).length === 0,
  '',
);

// --- the thread always shows the whole structure ---------------------------
check(
  'A short session still reports every unlocked slot to the thread',
  short.activeSlotIds.length === slots.filter((s) => s.active).length &&
    short.movements.length <= short.activeSlotIds.length,
  `${short.movements.length} in play of ${short.activeSlotIds.length} unlocked`,
);

// --- planning the week ------------------------------------------------------
// Sunday planning: the suggestion fills seven days with no inputs to type, and
// the result is a starting point to correct rather than an answer to accept.
const planned = generateWeek({ weekStart: today });
const plannedDays = plannedTypes(planned);
console.log(`\nWeek of ${planned.weekStart}: ${plannedDays.join(', ')}`);

check('A week is planned for all seven days', planned.entries.length === 7, `${planned.entries.length}`);
check(
  'One entry per distinct day',
  new Set(planned.entries.map((e) => e.day)).size === 7,
  '',
);
const sessionDays = planned.entries.filter((e) => e.sessionType !== 'rest');
check(
  'Sessions planned land between the target and the maximum',
  sessionDays.length >= PLANNER.sessions && sessionDays.length <= PLANNER.maxSessions,
  `${sessionDays.length} sessions, target ${PLANNER.sessions}, max ${PLANNER.maxSessions}`,
);
check(
  'At least one strength session, never more than the cap',
  plannedDays.filter((t) => t === 'strength').length >= PLANNER.strength &&
    plannedDays.filter((t) => t === 'strength').length <= PLANNER.maxStrength,
  `${plannedDays.filter((t) => t === 'strength').length}`,
);
check(
  'A run is planned',
  plannedDays.filter((t) => t === 'engine').length >= PLANNER.engine,
  `${plannedDays.filter((t) => t === 'engine').length} engine`,
);
check(
  'Strength never lands on back-to-back days',
  !plannedDays.some((t, i) => t === 'strength' && plannedDays[i + 1] === 'strength'),
  '',
);
check(
  'Enough rest days survive the plan',
  plannedDays.filter((t) => t === 'rest').length >= PLANNER.minRestDays,
  `${plannedDays.filter((t) => t === 'rest').length} rest days`,
);
check(
  'Every planned session carries its minutes, and rest carries none',
  planned.entries.every((e) =>
    e.sessionType === 'rest' ? e.plannedMinutes == null : (e.plannedMinutes ?? 0) > 0,
  ),
  '',
);
check(
  'The rationale describes the plan that came out',
  planned.rationale.some((line) => line.includes(`${sessionDays.length} sessions planned`)),
  '',
);

// --- the week against the mornings that actually work -----------------------
// Availability is marked by hand before generating. The planner owns those days
// and no others, which is the whole point: a plan laid over days Jan cannot
// train is a plan he rewrites by hand every Sunday.
const weekDays = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart(today), i));
const typeOn = (w: ReturnType<typeof generateWeek>, day: string): string =>
  (w.entries.find((e) => e.day === day)?.sessionType as string) ?? 'rest';

// Wed, Thu, Sat: two of them outside PLANNER.planDays entirely.
const awkward = [weekDays[2], weekDays[3], weekDays[5]];
const onAwkward = generateWeek({ weekStart: today, availableDays: awkward });
console.log(`Available ${awkward.join(', ')}: ${plannedTypes(onAwkward).join(', ')}`);

check(
  'Nothing is planned on a morning that was not marked available',
  weekDays.every((d) => awkward.includes(d) || typeOn(onAwkward, d) === 'rest'),
  plannedTypes(onAwkward).join(', '),
);
check(
  'Every marked morning is used',
  awkward.every((d) => typeOn(onAwkward, d) !== 'rest'),
  `${awkward.filter((d) => typeOn(onAwkward, d) !== 'rest').length} of ${awkward.length} used`,
);
check(
  'A marked weekend day is workable even though planDays excludes the weekend',
  typeOn(onAwkward, weekDays[5]) !== 'rest',
  `Sat is ${typeOn(onAwkward, weekDays[5])}`,
);
check(
  'Strength still lands when its preferred weekday is not available',
  plannedTypes(onAwkward).filter((t) => t === 'strength').length >= PLANNER.strength,
  `${plannedTypes(onAwkward).filter((t) => t === 'strength').length} strength`,
);
check(
  'The rationale opens on the week it was given',
  onAwkward.rationale.some((line) => line.includes(`${awkward.length} mornings marked available`)),
  onAwkward.rationale[0] ?? '',
);

// More mornings than the configured target. The target is an aim for a week the
// planner shaped itself, and it does not get to turn down a morning offered:
// SESSIONS_PER_WINDOW is a floor of three per seven days, not a ceiling.
const fiveDays = weekDays.slice(0, 5);
const onFive = generateWeek({ weekStart: today, availableDays: fiveDays });
check(
  'Five mornings marked plans five sessions, past the configured target of four',
  plannedTypes(onFive).filter((t) => t !== 'rest').length === 5 && 5 > PLANNER.sessions,
  `${plannedTypes(onFive).filter((t) => t !== 'rest').length} sessions, target ${PLANNER.sessions}`,
);

const wideOpen = generateWeek({ weekStart: today, availableDays: weekDays });
check(
  'Marking every morning available plans every morning',
  plannedTypes(wideOpen).every((t) => t !== 'rest'),
  `${plannedTypes(wideOpen).filter((t) => t !== 'rest').length} of 7 mornings filled`,
);
check(
  'The limits that are real limits survive a full week',
  plannedTypes(wideOpen).filter((t) => t === 'strength').length <= PLANNER.maxStrength &&
    !plannedTypes(wideOpen).some((t, i) => t === 'strength' && plannedTypes(wideOpen)[i + 1] === 'strength'),
  `${plannedTypes(wideOpen).filter((t) => t === 'strength').length} strength, cap ${PLANNER.maxStrength}`,
);
check(
  'The extra mornings past the target come in as Flow, not as more strength',
  plannedTypes(wideOpen).filter((t) => t === 'flow' || t === 'flow short').length >= 7 - PLANNER.maxStrength - PLANNER.engine,
  plannedTypes(wideOpen).join(', '),
);

// A single morning is still a week, not an error.
const oneDay = generateWeek({ weekStart: today, availableDays: [weekDays[3]] });
check(
  'One available morning plans exactly one session, on that morning',
  plannedTypes(oneDay).filter((t) => t !== 'rest').length === 1 && typeOn(oneDay, weekDays[3]) !== 'rest',
  `${typeOn(oneDay, weekDays[3])} on Thu`,
);

// Omitting availability must keep the old behaviour intact.
check(
  'Without availability the planner still falls back to its configured weekdays',
  weekDays.every((d, i) => PLANNER.planDays.includes(i) || typeOn(planned, d) === 'rest'),
  plannedTypes(planned).join(', '),
);

// Skate is no longer a session the week can hold.
check(
  'No generated week plans a skate day',
  [planned, onAwkward, wideOpen, oneDay].every((w) => !plannedTypes(w).includes('skate')),
  '',
);

// --- micro rotation on the real micros ---
const rot = rotateMicros(micros, microLog, slots, skills, week, false);
const activeAfter = micros.filter((m) => (m.active && !rot.deactivate.some((d) => d.id === m.id)) || rot.activate.some((a) => a.id === m.id));
console.log(`\nRotation from ${micros.filter((m) => m.active).length} active micros:`);
activeAfter.forEach((m) => console.log(`  keep/activate: ${m.name} — ${rot.reasons[m.name] ?? 'already active'}`));
console.log(`  deactivate: ${rot.deactivate.length}, retire: ${rot.retire.length}`);

check('Rotation lands within 3 to 5 active', activeAfter.length >= 3 && activeAfter.length <= 5, `${activeAfter.length}`);
check('Nothing retired while the log is younger than the window', rot.retire.length === 0, `${rot.retire.length}`);
check('Retired micros are never selected', rot.activate.every((m) => !m.retired), '');

// Retirement must engage for someone who was actually here every week of the
// window and ignored a micro throughout it anyway. That is the case the rule
// exists for, and the only one.
const everyWeek: MicroLogEntry[] = [1, 2, 3].map((w) => ({
  id: `w${w}`,
  name: micros[1].name,
  date: addDaysStr(week, -w * 7),
  count: 1,
  weekStart: addDaysStr(week, -w * 7),
}));
const rot2 = rotateMicros(micros, everyWeek, slots, skills, week, false);
check('Retirement engages when every week of the window was used', rot2.retire.length > 0, `${rot2.retire.length} retired`);

// One quiet week stops it. This is the case that bit Jan: a couple of taps in
// early August, one the night before, nothing in between, and the app retired
// four micros before he had trained with it once.
const gapped = everyWeek.filter((l) => l.id !== 'w2');
const rot2Gap = rotateMicros(micros, gapped, slots, skills, week, false);
check('A single unused week in the window stops retirement', rot2Gap.retire.length === 0, `${rot2Gap.retire.length}`);

// A month away is not a month of ignoring them.
const awayLog: MicroLogEntry[] = [{ id: 'old', name: micros[0].name, date: '2026-05-01', count: 1, weekStart: '2026-04-27' }];
const rot2b = rotateMicros(micros, awayLog, slots, skills, week, false);
check('Nothing is retired over a break with no activity at all', rot2b.retire.length === 0, `${rot2b.retire.length}`);

// --- finishing a micro brings in a new one ---------------------------------
{
  const target = micros.find((m) => m.active && m.weeklyTarget)!;
  const finished: MicroLogEntry[] = [
    { id: 'done-1', name: target.name, date: week, count: target.weeklyTarget!, weekStart: week },
  ];
  const before = rotateMicros(micros, [], slots, skills, week, false);
  const after = rotateMicros(micros, finished, slots, skills, week, false);

  // `reasons` carries one entry per chosen micro, which is the selection.
  const chosenOf = (d: typeof before) => Object.keys(d.reasons);
  const unfinishedOf = (d: typeof before) =>
    chosenOf(d).filter((name) => d.reasons[name] !== 'done this week');

  check(
    'A finished micro stays on the screen',
    after.reasons[target.name] === 'done this week',
    `${after.reasons[target.name] ?? 'missing'}`,
  );
  check(
    'And a new one comes in behind it',
    unfinishedOf(after).length >= unfinishedOf(before).length &&
      chosenOf(after).length > chosenOf(before).length,
    `${chosenOf(before).length} chosen before, ${chosenOf(after).length} after`,
  );
  check(
    'The unfinished ones still land inside the 3 to 5 band',
    unfinishedOf(after).length >= MICRO_ROTATION.minActive &&
      unfinishedOf(after).length <= MICRO_ROTATION.maxActive,
    `${unfinishedOf(after).length} unfinished, ${chosenOf(after).length} shown`,
  );
  check(
    'A finished micro is never counted as one of the active few',
    !unfinishedOf(after).includes(target.name),
    '',
  );
}

// --- rotation must not churn -------------------------------------------------
// Today reconciles micros on every load, so a rotation that does not settle
// rewrites Notion on every page view and keeps swapping the set under Jan. A
// freshly activated micro shows a week count of zero, which reads as the count
// resetting on reload. Stability inside the week is not a nicety here.
function settle(
  start: Micro[],
  atWeek: string,
  loads: number,
  withLog: MicroLogEntry[] = microLog,
): { micros: Micro[]; writes: number[] } {
  let current = start.map((m) => ({ ...m }));
  const writes: number[] = [];
  for (let i = 0; i < loads; i += 1) {
    const r = rotateMicros(current, withLog, slots, skills, atWeek, false);
    writes.push(r.activate.length + r.deactivate.length + r.retire.length);
    const want = new Map(current.map((m) => [m.id, { active: m.active, retired: m.retired }]));
    r.activate.forEach((m) => want.set(m.id, { active: true, retired: false }));
    r.deactivate.forEach((m) => want.set(m.id, { active: false, retired: false }));
    r.retire.forEach((m) => want.set(m.id, { active: false, retired: true }));
    current = current.map((m) => ({ ...m, ...want.get(m.id)! }));
  }
  return { micros: current, writes };
}

const settled = settle(micros, week, 6);
check(
  'Rotation settles: repeated Today loads stop writing to Notion',
  settled.writes.slice(1).every((w) => w === 0),
  `writes per load: ${settled.writes.join(', ')}`,
);
const activeNamesOf = (ms: Micro[]) => ms.filter((m) => m.active).map((m) => m.name).sort().join(' | ');
check(
  // Consecutive load counts, not 2 against 6: an alternating set is identical
  // every second load, so comparing two even counts sees a stable week that
  // is not there.
  'The active set is the same after two loads, three, and four',
  activeNamesOf(settle(micros, week, 2).micros) === activeNamesOf(settle(micros, week, 3).micros) &&
    activeNamesOf(settle(micros, week, 3).micros) === activeNamesOf(settle(micros, week, 4).micros),
  activeNamesOf(settled.micros),
);

// --- logging one must not evict it -------------------------------------------
// Tapping the micro the app had just introduced was what removed it: the tap
// made it no longer quiet, so it fell out of the wildcard candidates and
// something else took the place. The whole reason it was put there is to be
// used, so using it cannot be what costs it its slot.
{
  const shownBefore = activeNamesOf(settled.micros);
  const tapped = settled.micros.find((m) => m.active && (m.weeklyTarget ?? 0) > 1);
  check('There is an active micro to tap', Boolean(tapped), tapped?.name ?? 'none');
  if (tapped) {
    const afterOneTap = [
      ...microLog,
      { id: 'tap', name: tapped.name, date: week, count: 1, weekStart: week } as MicroLogEntry,
    ];
    const shownAfter = activeNamesOf(settle(settled.micros, week, 3, afterOneTap).micros);
    check(
      `Logging "${tapped.name}" leaves the same micros on the screen`,
      shownAfter === shownBefore,
      shownAfter === shownBefore ? shownAfter : `${shownBefore}  →  ${shownAfter}`,
    );

    // Every active micro, not just the one that happens to be the wildcard.
    const eachHolds = settled.micros
      .filter((m) => m.active)
      .every((m) => {
        const log = [...microLog, { id: 't', name: m.name, date: week, count: 1, weekStart: week } as MicroLogEntry];
        return activeNamesOf(settle(settled.micros, week, 3, log).micros) === shownBefore;
      });
    check('The same holds whichever of them is tapped', eachHolds, shownBefore);
  }
}

// --- and it must still move on when the week does ----------------------------
// Stability within the week is what stops the churn; changing between weeks is
// what makes them fresh. Both, or the fix for one breaks the other.
const wildcardOf = (ms: Micro[], atWeek: string): string | null => {
  const r = rotateMicros(ms, microLog, slots, skills, atWeek, false);
  const hit = Object.entries(r.reasons).find(([, why]) => why.startsWith('wildcard'));
  return hit ? hit[0] : null;
};
const weeklyPicks: string[] = [];
let carried = micros.map((m) => ({ ...m }));
for (let w = 0; w < 6; w += 1) {
  const atWeek = addDaysStr(week, w * 7);
  carried = settle(carried, atWeek, 4).micros;
  const pick = wildcardOf(carried, atWeek);
  if (pick) weeklyPicks.push(pick);
}
check(
  'The wildcard is a different micro from one week to the next',
  new Set(weeklyPicks).size > 1,
  weeklyPicks.join(' → '),
);

// --- the pacing cues, as playable audio --------------------------------------
// They are rendered to WAV and played through an <audio> element, because iOS
// mutes Web Audio with the ring/silent switch and a phone kept on silent runs
// the whole Form without a cue. A malformed header fails by the element quietly
// declining to play, which on that same phone is indistinguishable from the bug
// this replaced — so the bytes are checked rather than trusted.
for (const [name, spec] of Object.entries(SOUND.cues)) {
  const bytes = Buffer.from(renderWav(spec.tones).split(',')[1], 'base64');
  const wantMs = spec.tones.reduce((sum, t, i) => sum + t.ms + (i ? SOUND.gapMs : 0), 0);
  const samples = bytes.readUInt32LE(40) / 2;
  const gotMs = Math.round((samples / bytes.readUInt32LE(24)) * 1000);
  let peak = 0;
  for (let i = 0; i < samples; i += 1) peak = Math.max(peak, Math.abs(bytes.readInt16LE(44 + i * 2)));

  check(
    `Cue "${name}" renders a valid mono 16-bit WAV`,
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WAVE' &&
      bytes.readUInt16LE(22) === 1 &&
      bytes.readUInt16LE(34) === 16,
    `${bytes.toString('ascii', 0, 4)}/${bytes.toString('ascii', 8, 12)}, ${bytes.length} bytes`,
  );
  check(`Cue "${name}" is as long as it is configured to be`, gotMs === wantMs, `${gotMs}ms of ${wantMs}ms`);
  check(
    `Cue "${name}" carries sound, and never above the configured level`,
    peak > 0 && peak / 0x7fff <= SOUND.volume + 0.001,
    `peak ${(peak / 0x7fff).toFixed(3)}, cap ${SOUND.volume}`,
  );
}

// --- micro progress ---
const progress = microProgress(micros, microLog, week);
check('Micro progress covers only active micros', progress.every((p) => micros.find((m) => m.name === p.name)?.active === true), `${progress.length} rows`);


// --- the skate graph, against the real 190 tricks ---------------------------
{
  const raw = applyBaseline(parse(readFileSync(SOURCE, 'utf8')));
  const asSkills: Skill[] = raw.map((r) => ({
    id: `t-${r.skillId}`, name: r.name, domain: 'skate', slot: null, level: r.level,
    status: r.status, cues: '', referenceTerm: '', entryPosition: '', exitPosition: '',
    whyBuilds: '', whyUnlocks: '', whySkate: '', sessionsAtLevel: 0, lastPracticed: null,
    levelUpDeferred: null, durationSeconds: null, unit: null, servesSlot: null, levelUpTarget: null, skillId: r.skillId, family: r.family,
    prereqs: r.prereqs, attempts: 0,
  }));

  console.log(`\nSkate graph: ${asSkills.length} tricks, all ${asSkills[0].status}`);

  // From an all-locked start only the roots are reachable.
  const rootsOnly = unlockableTricks(asSkills);
  const roots = asSkills.filter((t) => t.prereqs.length === 0);
  check('From all-locked, only prerequisite-free tricks are unlockable', rootsOnly.size === roots.length, `${rootsOnly.size} unlockable, ${roots.length} roots`);
  check('Every trick is reachable by mastering its prerequisites', asSkills.every((t) => t.prereqs.every((p) => asSkills.some((x) => x.skillId === p))), '');

  // Master the roots and the frontier must grow.
  const afterRoots = asSkills.map((t) => (t.prereqs.length === 0 ? { ...t, status: 'mastered' as const } : t));
  check('Mastering the roots opens new tricks', unlockableTricks(afterRoots).size > rootsOnly.size, `${unlockableTricks(afterRoots).size} unlockable`);

  // Focus card on a plausible mid-game state.
  const mid = asSkills.map((t) => {
    if (['stance_discovery', 'static_balance', 'safe_bail_reflex', 'foot_placement_reset', 'one_push_glide', 'straight_roll_20m', 'repeated_pushing', 'fakie_roll_comfort'].includes(t.skillId))
      return { ...t, status: 'mastered' as const, lastPracticed: '2026-06-01' };
    if (['switch_push_intro', 'carve_turns'].includes(t.skillId)) return { ...t, status: 'current' as const };
    return t;
  });
  const focus = skateFocus(mid, today);
  console.log('Focus card:');
  focus.forEach((f) => console.log(`  ${f.name} — ${f.reason}`));
  check('Focus card is not empty', focus.length > 0, `${focus.length} items`);
  check('Focus card has no duplicates', new Set(focus.map((f) => f.id)).size === focus.length, '');
  check('Focus card includes rusty tricks', focus.some((f) => f.reason === 'rusty'), '');
  check('Focus card includes a live project', focus.some((f) => f.reason === 'project'), '');
  check('Rusty picks are all mastered', focus.filter((f) => f.reason === 'rusty').every((f) => f.status === 'mastered'), '');
  check('Stretch pick has every prerequisite mastered', focus.filter((f) => f.reason === 'stretch').every((f) => {
    const t = mid.find((x) => x.id === f.id)!;
    return t.prereqs.every((p) => mid.find((x) => x.skillId === p)?.status === 'mastered');
  }), '');

  // Freshly touched tricks must not read as rusty.
  const fresh = mid.map((t) => (t.status === 'mastered' ? { ...t, lastPracticed: today } : t));
  check('Nothing is rusty right after being confirmed', skateFocus(fresh, today).every((f) => f.reason !== 'rusty'), '');

// --- the skate session, against the real library ---------------------------

  const skateSkills: Skill[] = asSkills.map((t) =>
    t.skillId === 'carve_turns' || t.skillId === 'switch_push_intro'
      ? { ...t, status: 'current' as const }
      : t.skillId === 'stance_discovery' || t.skillId === 'static_balance' || t.skillId === 'safe_bail_reflex'
        ? { ...t, status: 'mastered' as const, lastPracticed: addDaysStr(today, -60) }
        : t,
  );

  check(
    'Every trick in the library has drills, mechanics and a gate',
    asSkills.every((t) => {
      const c = skateContent(t.skillId);
      return Boolean(c && c.drills.length && c.mechanics.length && c.gate);
    }),
    `${asSkills.length} tricks`,
  );

  const blocks = buildSkateSession(skateSkills, [], today);
  console.log(`\nSkate: ${blocks.length} blocks`);
  blocks.forEach((b) =>
    console.log(`  ${b.fromMinute}-${b.toMinute} ${b.label}: ${b.tricks.map((t) => t.name).join(', ') || '-'}`),
  );

  check('A skate session is planned in blocks', blocks.length > 1, `${blocks.length}`);
  check(
    'Blocks with nothing on their card are dropped, not run empty',
    blocks.every((b) => b.warmUp || b.tricks.length > 0),
    blocks.map((b) => `${b.label}:${b.tricks.length}`).join(' '),
  );

  // The cold start: everything locked is exactly Jan's real data today, and it
  // used to produce a session with five empty blocks and nothing to do.
  const allLocked: Skill[] = asSkills.map((t) => ({ ...t, status: 'locked' as const }));
  const cold = buildSkateSession(allLocked, [], today);
  const coldTricks = cold.flatMap((b) => b.tricks);
  console.log(`  cold start: ${coldTricks.map((t) => t.name).join(', ')}`);
  check(
    'An all-locked graph still produces a session',
    coldTricks.length === SKATE_FOCUS.coldStart,
    `${coldTricks.length} tricks over ${cold.length} blocks`,
  );
  check(
    'The cold start offers the bottom of the graph',
    coldTricks.every((t) => t.level === 0),
    coldTricks.map((t) => `L${t.level}`).join(' '),
  );
  check(
    'And it still fills the session with drills to do',
    coldTricks.every((t) => t.drills.length > 0) &&
      cold[cold.length - 1].toMinute === TARGET_MINUTES.skate,
    `ends at minute ${cold[cold.length - 1].toMinute}`,
  );
  check(
    'Blocks cover the target minutes without gaps or overlap',
    blocks.every((b, i) => (i === 0 ? b.fromMinute === 0 : b.fromMinute === blocks[i - 1].toMinute)) &&
      blocks[blocks.length - 1].toMinute === TARGET_MINUTES.skate,
    `${blocks[blocks.length - 1].toMinute} of ${TARGET_MINUTES.skate}`,
  );
  check(
    'Every trick on the card carries its drills',
    blocks.flatMap((b) => b.tricks).every((t) => t.drills.length > 0),
    `${blocks.flatMap((b) => b.tricks).length} tricks carded`,
  );
  check(
    'A trick appears in exactly one block',
    (() => {
      const ids = blocks.flatMap((b) => b.tricks.map((t) => t.id));
      return new Set(ids).size === ids.length;
    })(),
    '',
  );
  check(
    'The rusty block only holds mastered tricks, the projects block only current ones',
    blocks.find((b) => b.label.includes('rusty'))!.tricks.every((t) => t.status === 'mastered') &&
      blocks.find((b) => b.label === 'The projects')!.tricks.every((t) => t.status === 'current'),
    '',
  );

  // The mastery rule.
  const carve = skateSkills.find((t) => t.skillId === 'carve_turns')!;
  const sets = (session: string, attempts: number, landed: number, date = today): SkateSet[] => [
    { id: `ss-${session}`, name: '', date, trick: 'carve_turns', attempts, landed, session },
  ];

  check(
    'Landing it enough times in one session proposes mastery',
    skateProposals(skateSkills, sets('s1', 8, SKATE_SESSION.landsToPropose), today).some(
      (p) => p.skillId === 'carve_turns',
    ),
    '',
  );
  check(
    'One land short is not enough',
    skateProposals(skateSkills, sets('s1', 8, SKATE_SESSION.landsToPropose - 1), today).length === 0,
    '',
  );
  check(
    'Landing everything off two attempts is not enough evidence',
    skateProposals(skateSkills, sets('s1', SKATE_SESSION.minAttempts - 1, 99), today).length === 0,
    `needs ${SKATE_SESSION.minAttempts} attempts`,
  );
  check(
    'Lands spread across sessions do not add up',
    skateProposals(
      skateSkills,
      [
        ...sets('a', 5, 1, addDaysStr(today, -20)),
        ...sets('b', 5, 1, addDaysStr(today, -10)),
        ...sets('c', 5, 1, today),
      ],
      today,
    ).length === 0,
    '',
  );
  check(
    'A mastered trick is never proposed again',
    skateProposals(
      skateSkills.map((t) => (t.skillId === 'carve_turns' ? { ...t, status: 'mastered' as const } : t)),
      sets('s1', 8, 5),
      today,
    ).length === 0,
    '',
  );
  check(
    'A deferred trick stays quiet',
    skateProposals(
      skateSkills.map((t) => (t.skillId === 'carve_turns' ? { ...t, levelUpDeferred: today } : t)),
      sets('s1', 8, 5),
      today,
    ).length === 0,
    '',
  );
  check(
    'The proposal carries the gate verbatim, because the app cannot judge it',
    skateProposals(skateSkills, sets('s1', 8, 5), today)[0]?.gate === skateContent('carve_turns')?.gate,
    `"${skateContent('carve_turns')?.gate}"`,
  );
  check(
    'Skate sits last in the proposal order',
    chooseProposal(null, [], [], skateProposals(skateSkills, sets('s1', 8, 5), today))?.kind === 'skate' &&
      chooseProposal(null, movementProposal, [], skateProposals(skateSkills, sets('s1', 8, 5), today))?.kind ===
        'movement',
    '',
  );

  // --- the profile ---------------------------------------------------------
  console.log('');
  const movementSkills = skills.filter((s) => s.domain === 'movement');
  const strengthSkills = skills.filter((s) => s.domain === 'strength');

  // The partition is the thing that rots. A family added to the graph without
  // being assigned to a spoke would vanish from the profile in silence.
  const claimed = PROFILE.axes.flatMap((a) => a.skate);
  const families = [...new Set(asSkills.map((t) => t.family))];
  const unclaimed = families.filter((f) => !claimed.includes(f));
  const doubleClaimed = claimed.filter((f, i) => claimed.indexOf(f) !== i);
  const phantom = claimed.filter((f) => !families.includes(f));
  check('Every skate family belongs to a spoke', unclaimed.length === 0, unclaimed.join(', ') || `${families.length} families`);
  check('No family feeds two spokes', doubleClaimed.length === 0, doubleClaimed.join(', '));
  check('No spoke names a family that does not exist', phantom.length === 0, phantom.join(', '));

  const allLockedProfile = profileStats(slots, movementSkills, strengthSkills, allLocked, [], today);
  const skateOnly = PROFILE.axes.filter((a) => !a.slots.length && !a.strength.length).map((a) => a.key);
  console.log(`  all locked: ${allLockedProfile.axes.map((a) => `${a.label} ${a.level}`).join(', ')} — ${allLockedProfile.rank}`);
  check(
    'A graph with nothing mastered scores zero on the skate-only spokes',
    allLockedProfile.axes.filter((a) => skateOnly.includes(a.key)).every((a) => a.level === 0),
    skateOnly.join(', '),
  );

  const allMastered: Skill[] = asSkills.map((t) => ({ ...t, status: 'mastered' as const }));
  const toppedOut = profileStats(slots, movementSkills, strengthSkills, allMastered, [], today);
  check(
    'Mastering the whole graph tops out the skate-only spokes',
    toppedOut.axes.filter((a) => skateOnly.includes(a.key)).every((a) => a.level === 10),
    toppedOut.axes.filter((a) => skateOnly.includes(a.key)).map((a) => `${a.label} ${a.level}`).join(', '),
  );
  check(
    'Every spoke stays inside 0 to 10 and carries a name',
    toppedOut.axes.every((a) => a.level >= 0 && a.level <= 10 && a.tier.length > 0),
    '',
  );

  // Nerve is the one spoke that reads the risk rating, so the trick that moves
  // it must be the committing one and not merely the next one along.
  const nerveOf = (tricks: Skill[]) =>
    profileStats(slots, movementSkills, strengthSkills, tricks, [], today).axes.find((a) => a.key === 'nerve')!.level;
  const nerveFamilies = PROFILE.axes.find((a) => a.key === 'nerve')!.skate;
  const inNerve = asSkills.filter((t) => nerveFamilies.includes(t.family));
  const byRisk = inNerve
    .slice()
    .sort((a, b) => (skateContent(b.skillId)?.risk ?? 0) - (skateContent(a.skillId)?.risk ?? 0));
  const scariest = byRisk[0];
  const safest = byRisk[byRisk.length - 1];
  const withScariest = allLocked.map((t) => (t.skillId === scariest.skillId ? { ...t, status: 'mastered' as const } : t));
  const withSafest = allLocked.map((t) => (t.skillId === safest.skillId ? { ...t, status: 'mastered' as const } : t));
  check(
    'Nerve answers to the risk rating, not to the level',
    nerveOf(withScariest) > nerveOf(withSafest),
    `${scariest.name} (risk ${skateContent(scariest.skillId)?.risk}) gives ${nerveOf(withScariest)}, ${safest.name} (risk ${skateContent(safest.skillId)?.risk}) gives ${nerveOf(withSafest)}`,
  );

  // A trick still in progress is not evidence. Only mastery moves a spoke.
  const inProgress = allLocked.map((t) => (nerveFamilies.includes(t.family) ? { ...t, status: 'current' as const } : t));
  check('Work in progress does not move a spoke', nerveOf(inProgress) === 0, `${nerveOf(inProgress)}`);

  // Engine is counted rather than levelled, so it has to answer to runs.
  const runs: SessionLog[] = Array.from({ length: PROFILE.engineTarget }, (_, i) => ({
    id: `run-${i}`, name: `run ${i}`, date: addDaysStr(today, -i * 2), type: 'engine' as const,
    plannedMinutes: 30, actualMinutes: 30, completed: true, difficulty: 'right' as const,
    soreness: '', notes: '', skillsPracticed: [], distanceKm: 5, route: '',
  }));
  const engineOf = (log: SessionLog[]) =>
    profileStats(slots, movementSkills, strengthSkills, allLocked, log, today).axes.find((a) => a.key === 'engine')!.level;
  check('Runs move the Engine spoke', engineOf(runs) > engineOf([]), `${engineOf([])} with none, ${engineOf(runs)} with ${runs.length}`);

  // The profile reads state and writes none, which is the whole argument for
  // it being a safe screen to add. Freezing the inputs proves it.
  const before = JSON.stringify({ slots, skills, sessions });
  profileStats(slots, movementSkills, strengthSkills, asSkills, sessions, today);
  check('Reading the profile mutates nothing', JSON.stringify({ slots, skills, sessions }) === before, '');

  void carve;

}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
