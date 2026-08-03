/**
 * Works out a starting skate graph from a plain description of what Jan can do,
 * by taking the transitive closure of prerequisites. Prints the result for
 * checking; it does not write anything.
 *
 * Run with: npx tsx scripts/seed-skate.ts
 */
import { readFileSync } from 'node:fs';
import { parse, SOURCE } from './skate-migration';

/** Confident, so everything underneath these is implied. */
const MASTERED = [
  'drop_in_small_quarter',
  'rolling_ollie',
  'ollie_over_a_line',
  'switch_roll_10m',
  'powerslide',
  'roll_off_tiny_curb',
  'pancake_flip',
];

/** Landed but not reliably, or actively being worked on. These are projects. */
const CURRENT = [
  'frontside_180',
  'fakie_ollie',
  'strawberry_milkshake',
  'backside_boardslide',
];

const rows = parse(readFileSync(SOURCE, 'utf8'));
const byId = new Map(rows.map((r) => [r.skillId, r]));

/** Everything a trick rests on, all the way down. */
function closure(ids: string[]): Set<string> {
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    const row = byId.get(id);
    if (!row) {
      console.log(`  !! unknown id: ${id}`);
      return;
    }
    seen.add(id);
    row.prereqs.forEach(walk);
  };
  ids.forEach(walk);
  return seen;
}

const mastered = closure(MASTERED);
// A project's own prerequisites are implied too, but the project itself is not
// mastered — so it is removed after the closure is taken.
const viaProjects = closure(CURRENT);
CURRENT.forEach((id) => viaProjects.delete(id));
viaProjects.forEach((id) => mastered.add(id));
CURRENT.forEach((id) => mastered.delete(id));

console.log(`\nMASTERED: ${mastered.size}`);
const byLevel = new Map<number, string[]>();
for (const id of mastered) {
  const r = byId.get(id)!;
  byLevel.set(r.level, [...(byLevel.get(r.level) ?? []), r.name]);
}
[...byLevel.keys()].sort((a, b) => a - b).forEach((l) => {
  console.log(`  L${l}: ${byLevel.get(l)!.sort().join(', ')}`);
});

console.log(`\nCURRENT (projects): ${CURRENT.length}`);
CURRENT.forEach((id) => console.log(`  L${byId.get(id)?.level} ${byId.get(id)?.name}`));

const locked = rows.filter((r) => !mastered.has(r.skillId) && !CURRENT.includes(r.skillId));
console.log(`\nLOCKED: ${locked.length} of ${rows.length}`);

// What becomes reachable next is the most useful check: it is what the app will
// offer as a stretch attempt.
const statusOf = new Map(rows.map((r) => [r.skillId, mastered.has(r.skillId) ? 'mastered' : CURRENT.includes(r.skillId) ? 'current' : 'locked']));
const reachable = locked
  .filter((r) => r.prereqs.length > 0 && r.prereqs.every((p) => statusOf.get(p) === 'mastered'))
  .sort((a, b) => a.level - b.level);
console.log(`\nREACHABLE NEXT: ${reachable.length}`);
reachable.forEach((r) => console.log(`  L${r.level} ${r.name}`));
