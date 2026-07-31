/**
 * Parses references/skill_ids.md from the skatequest-coach skill into rows for
 * the Skills database, following section 7 of the brief exactly:
 *   Domain = skate, level -> Level, family -> Family, prereqs -> Prereqs,
 *   id -> Skill id, name -> Name. Slot stays empty.
 *
 * Baseline: rolling_ollie, frontside_180 and switch_roll_10m are `current`.
 * Everything transitively reachable by walking the prerequisite graph backward
 * from those three is `mastered`. Everything else stays `locked`.
 *
 * Run with:
 *   npx tsx scripts/skate-migration.ts               parse, validate, report
 *   npx tsx scripts/skate-migration.ts --json out    also dump the rows
 *   NOTION_TOKEN=... npx tsx scripts/skate-migration.ts --import   write them
 *
 * The import is idempotent: a trick whose Skill id is already in the database
 * is skipped, so re-running never duplicates a row.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { getStore } from '../lib/store';

export const SOURCE = '/root/.claude/skills/skatequest-coach/references/skill_ids.md';
export const BASELINE_CURRENT = ['rolling_ollie', 'frontside_180', 'switch_roll_10m'];

export interface SkateSkill {
  skillId: string;
  level: number;
  name: string;
  family: string;
  prereqs: string[];
  status: 'locked' | 'current' | 'mastered';
}

const LINE = /^-\s+`([^`]+)`\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*)$/;

export function parse(markdown: string): SkateSkill[] {
  const rows: SkateSkill[] = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('-')) continue;
    const m = LINE.exec(line);
    if (!m) throw new Error(`Unparsed line: ${line}`);
    const [, skillId, level, name, family, prereqRaw] = m;
    const prereqs =
      prereqRaw.trim() === '-' || prereqRaw.trim() === ''
        ? []
        : prereqRaw.split(',').map((p) => p.trim()).filter(Boolean);
    rows.push({ skillId, level: Number(level), name, family, prereqs, status: 'locked' });
  }
  return rows;
}

export function validate(rows: SkateSkill[]): string[] {
  const problems: string[] = [];
  const ids = new Set(rows.map((r) => r.skillId));

  if (ids.size !== rows.length) problems.push('Duplicate skill ids present');

  for (const row of rows) {
    for (const p of row.prereqs) {
      if (!ids.has(p)) problems.push(`${row.skillId} depends on missing ${p}`);
    }
  }

  // A cycle would make the backward walk non-terminating in a naive version
  // and would mean the graph cannot be learned in any order.
  const state = new Map<string, number>();
  const byId = new Map(rows.map((r) => [r.skillId, r]));
  const visit = (id: string, trail: string[]): void => {
    const s = state.get(id) ?? 0;
    if (s === 2) return;
    if (s === 1) {
      problems.push(`Cycle: ${[...trail, id].join(' -> ')}`);
      return;
    }
    state.set(id, 1);
    for (const p of byId.get(id)?.prereqs ?? []) visit(p, [...trail, id]);
    state.set(id, 2);
  };
  rows.forEach((r) => visit(r.skillId, []));

  return problems;
}

/** Everything transitively required by the seeds, seeds excluded. */
export function ancestorsOf(rows: SkateSkill[], seeds: string[]): Set<string> {
  const byId = new Map(rows.map((r) => [r.skillId, r]));
  const seen = new Set<string>();
  const stack = seeds.flatMap((s) => byId.get(s)?.prereqs ?? []);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of byId.get(id)?.prereqs ?? []) stack.push(p);
  }
  return seen;
}

export function applyBaseline(rows: SkateSkill[]): SkateSkill[] {
  const current = new Set(BASELINE_CURRENT);
  const mastered = ancestorsOf(rows, BASELINE_CURRENT);
  return rows.map((r) => ({
    ...r,
    status: current.has(r.skillId) ? 'current' : mastered.has(r.skillId) ? 'mastered' : 'locked',
  }));
}

if (process.argv[1]?.endsWith('skate-migration.ts')) {
  const rows = applyBaseline(parse(readFileSync(SOURCE, 'utf8')));
  const problems = validate(rows);

  console.log(`Parsed ${rows.length} tricks`);
  console.log(`Dangling or cyclic references: ${problems.length}`);
  problems.forEach((p) => console.log(`  ${p}`));

  const missingSeeds = BASELINE_CURRENT.filter((s) => !rows.some((r) => r.skillId === s));
  console.log(`Baseline seeds present: ${missingSeeds.length === 0 ? 'all three' : `MISSING ${missingSeeds.join(', ')}`}`);

  const by = (s: string) => rows.filter((r) => r.status === s);
  console.log(`\ncurrent  ${by('current').length}: ${by('current').map((r) => r.skillId).join(', ')}`);
  console.log(`mastered ${by('mastered').length}: ${by('mastered').map((r) => r.skillId).join(', ')}`);
  console.log(`locked   ${by('locked').length}`);

  // A mastered trick whose own prerequisites are not mastered would be a
  // baseline that contradicts itself.
  const statusOf = new Map(rows.map((r) => [r.skillId, r.status]));
  const inconsistent = rows.filter(
    (r) => r.status === 'mastered' && r.prereqs.some((p) => statusOf.get(p) !== 'mastered'),
  );
  console.log(`\nMastered tricks with a non-mastered prerequisite: ${inconsistent.length}`);
  inconsistent.forEach((r) => console.log(`  ${r.skillId}`));

  const levels = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  console.log(`Levels present: ${levels.join(', ')}`);
  console.log(`Families: ${[...new Set(rows.map((r) => r.family))].length}`);

  const outFlag = process.argv.indexOf('--json');
  if (outFlag > -1 && process.argv[outFlag + 1]) {
    writeFileSync(process.argv[outFlag + 1], JSON.stringify(rows, null, 1));
    console.log(`\nWrote ${process.argv[outFlag + 1]}`);
  }

  const healthy = problems.length === 0 && missingSeeds.length === 0 && inconsistent.length === 0;

  if (process.argv.includes('--import')) {
    if (!healthy) {
      console.error('\nRefusing to import: the graph did not validate.');
      process.exit(1);
    }
    void (async () => {
      const store = getStore();
      const existing = await store.getSkills('skate');
      const seen = new Set(existing.map((s) => s.name));
      let written = 0;
      for (const row of rows) {
        if (seen.has(row.name)) continue;
        await store.createSkill({
          name: row.name,
          domain: 'skate',
          skillId: row.skillId,
          level: row.level,
          family: row.family,
          prereqs: row.prereqs.join(','),
          status: row.status,
        });
        written += 1;
      }
      console.log(`\nImported ${written} tricks, skipped ${rows.length - written} already present.`);
    })();
  } else {
    process.exit(healthy ? 0 : 1);
  }
}
