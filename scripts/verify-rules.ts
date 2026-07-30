/**
 * Runs the pure rules against a snapshot of the real Notion rows.
 * Not part of the app. Run with: npx tsx scripts/verify-rules.ts
 */
import { readFileSync } from 'node:fs';
import { planSession, levelUpProposals, rollingStatus, rotateMicros, microProgress } from '../lib/rules';
import { weekStart } from '../lib/dates';
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

check('Flow uses only active slots', flow.movements.every((m) => slots.find((s) => s.sequence === m.slot)?.active === true), '');
check('Flow lands in the 15-20 min band', flow.totalSeconds >= 15 * 60 && flow.totalSeconds <= 21 * 60, `${Math.round(flow.totalSeconds / 60)} min`);
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

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
