export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function minutes(totalSeconds: number): number {
  return Math.round(totalSeconds / 60);
}

/** "flow" reads better as "Flow" in a heading, without shouting. */
export function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}
