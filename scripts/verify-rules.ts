/**
 * Runs the pure rules against a snapshot of the real Notion rows.
 * Not part of the app. Run with: npx tsx scripts/verify-rules.ts
 */
import { readFileSync } from 'node:fs';
import { planSession, levelUpProposals, rollingStatus, rotateMicros, microProgress, skateFocus, unlockableTricks, roundsForFlow } from '../lib/rules';
import { STRENGTH } from '../lib/config';
import { weekStart } from '../lib/dates';
import { parse, applyBaseline, SOURCE } from './skate-migration';
import type { Micro, MicroLogEntry, SessionLog, Skill, Slot } from '../lib/types';

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
  skillsPracticed: [slot1Skill.name],
}));
const proposals = levelUpProposals(slots, primed, easySessions, today);
check('Level-up proposed after 8 sessions with 3 easy', proposals.some((p) => p.slot === 1), `${proposals.length} proposals`);

const hardSessions = easySessions.map((s) => ({ ...s, difficulty: 'right' as const }));
check('No level-up when the last three were not easy', levelUpProposals(slots, primed, hardSessions, today).every((p) => p.slot !== 1), '');

const deferred = primed.map((s) => (s.id === slot1Skill.id ? { ...s, levelUpDeferred: today } : s));
check('Deferring silences the proposal', levelUpProposals(slots, deferred, easySessions, today).every((p) => p.slot !== 1), '');

// --- micro rotation on the real micros ---
const rot = rotateMicros(micros, microLog, slots, skills, week, false);
const activeAfter = micros.filter((m) => (m.active && !rot.deactivate.some((d) => d.id === m.id)) || rot.activate.some((a) => a.id === m.id));
console.log(`\nRotation from ${micros.filter((m) => m.active).length} active micros:`);
activeAfter.forEach((m) => console.log(`  keep/activate: ${m.name} — ${rot.reasons[m.name] ?? 'already active'}`));
console.log(`  deactivate: ${rot.deactivate.length}, retire: ${rot.retire.length}`);

check('Rotation lands within 3 to 5 active', activeAfter.length >= 3 && activeAfter.length <= 5, `${activeAfter.length}`);
check('Nothing retired while the log is younger than the window', rot.retire.length === 0, `${rot.retire.length}`);
check('Retired micros are never selected', rot.activate.every((m) => !m.retired), '');

// Retirement must engage once the log is old enough.
const oldLog: MicroLogEntry[] = [{ id: 'old', name: micros[0].name, date: '2026-05-01', count: 1, weekStart: '2026-04-27' }];
const rot2 = rotateMicros(micros, oldLog, slots, skills, week, false);
check('Retirement engages once history is long enough', rot2.retire.length > 0, `${rot2.retire.length} retired`);

// --- micro progress ---
const progress = microProgress(micros, microLog, week);
check('Micro progress covers only active micros', progress.every((p) => micros.find((m) => m.name === p.name)?.active === true), `${progress.length} rows`);


// --- the skate graph, against the real 190 tricks ---------------------------
{
  const raw = applyBaseline(parse(readFileSync(SOURCE, 'utf8')));
  const asSkills: Skill[] = raw.map((r) => ({
    id: `t-${r.skillId}`, name: r.name, domain: 'skate', slot: null, level: r.level,
    status: r.status, cues: '', referenceTerm: '', entryPosition: '', exitPosition: '',
    whyBuilds: '', whyUnlocks: '', sessionsAtLevel: 0, lastPracticed: null,
    levelUpDeferred: null, durationSeconds: null, skillId: r.skillId, family: r.family,
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
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
