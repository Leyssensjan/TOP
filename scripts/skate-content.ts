/**
 * Regenerates lib/skate-content.ts from the SkateQuest library.
 *
 * The original migration took only id, level, name, family and prereqs from
 * skill_ids.md and left the rest of the library on the floor: the mechanics,
 * the drills and the mastery gate for all 190 tricks. Those are what make a
 * skate session a session rather than a list of names.
 *
 * Run with: npx tsx scripts/skate-content.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = '/root/.claude/uploads/ffcd7e8e-9e19-5066-8fde-dbbca01d650b/c523d5da-skills_v0.5.json';
const OUT = new URL('../lib/skate-content.ts', import.meta.url);

interface LibrarySkill {
  id: string;
  mechanics?: string[];
  drills?: string[];
  mastery_gate?: string;
  terrain?: string[];
  obstacles?: string[];
  stances?: string[];
  risk?: number;
  level: number;
}

const library = JSON.parse(readFileSync(SOURCE, 'utf8')) as { skills: LibrarySkill[] };
const rows = [...library.skills].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));

const lines: string[] = [
  '// Generated from the SkateQuest library (skills_v0.5.json) by',
  '// scripts/skate-content.ts. Do not edit by hand — regenerate instead.',
  '//',
  '// This is reference content, not state: mechanics, drills and the mastery gate',
  '// for each trick, written when the library was built and not expected to',
  '// change. Progress lives in Notion; this does not.',
  '',
  'export interface SkateContent {',
  '  /** How the trick works. The cues. */',
  '  mechanics: string[];',
  '  /** What to actually do at the park to get it. */',
  '  drills: string[];',
  '  /** The criterion for calling it mastered. Judged by Jan, not by the app. */',
  '  gate: string;',
  '  terrain: string[];',
  '  obstacles: string[];',
  '  stances: string[];',
  '  /** 1 to 10. Used to keep a stretch attempt from being reckless. */',
  '  risk: number;',
  '}',
  '',
  'export const SKATE_CONTENT: Record<string, SkateContent> = {',
];

/**
 * The library mixes British and American spellings of the same piece of
 * concrete. Skating writes it "curb" everywhere — the trick names in this very
 * file are curb_ride_off and slappy_curb_grind — so the drills should not say
 * something else. Applied here rather than in the generated file, which is
 * overwritten on every run.
 */
const spell = (text: string): string => text.replace(/([Kk])erb/g, (_, k: string) => `${k === 'K' ? 'C' : 'c'}urb`);
const spellAll = (texts: string[]): string[] => texts.map(spell);

for (const s of rows) {
  lines.push(`  ${JSON.stringify(s.id)}: {`);
  lines.push(`    mechanics: ${JSON.stringify(spellAll(s.mechanics ?? []))},`);
  lines.push(`    drills: ${JSON.stringify(spellAll(s.drills ?? []))},`);
  lines.push(`    gate: ${JSON.stringify(spell(s.mastery_gate ?? ''))},`);
  lines.push(`    terrain: ${JSON.stringify(s.terrain ?? [])},`);
  lines.push(`    obstacles: ${JSON.stringify(s.obstacles ?? [])},`);
  lines.push(`    stances: ${JSON.stringify(s.stances ?? [])},`);
  lines.push(`    risk: ${s.risk ?? 0},`);
  lines.push('  },');
}

lines.push('};', '', 'export function skateContent(skillId: string): SkateContent | null {', '  return SKATE_CONTENT[skillId] ?? null;', '}', '');

writeFileSync(OUT, lines.join('\n'));
console.log(`Wrote ${rows.length} tricks.`);
console.log(`  with drills: ${rows.filter((r) => r.drills?.length).length}`);
console.log(`  with a gate: ${rows.filter((r) => r.mastery_gate).length}`);
