'use client';

// Local storage is a cache and an outbox. Notion is the source of truth.
// Nothing here is ever treated as authoritative; it exists so that a living
// room at 6am with no network still runs a whole session.

import type { SessionPlan } from '@/lib/rules';

const KEY = 'fq.key';
const TODAY = 'fq.today';
const ACTIVE = 'fq.active';
const OUTBOX = 'fq.outbox';

export interface TodayPayload {
  date: string;
  rest: boolean;
  session: SessionPlan;
  alreadyLogged: boolean;
  rolling: {
    count: number;
    target: number;
    windowDays: number;
    daysRemaining: number | null;
    short: number;
    streakWeeks: number;
  };
  suggestion?: { type: string; line: string; reasons: string[] };
  proposals: Array<{
    slot: number;
    slotName: string;
    fromLevel: number;
    toLevel: number;
    currentSkillName: string;
    nextSkillName: string;
  }>;
  strengthProposals?: Array<{
    family: string;
    fromLevel: number;
    toLevel: number;
    currentSkillName: string;
    nextSkillName: string;
    unit: 'reps' | 'seconds';
    clearedSets: number;
  }>;
}

/** One set logged during a Strength session, held locally until Close. */
export interface LoggedSet {
  skill: string;
  reps: number | null;
  seconds: number | null;
}

export interface ActiveSession {
  date: string;
  plan: SessionPlan;
  startedAt: number;
  /** Index into the flattened timeline, so a reload resumes where it stopped. */
  step: number;
  elapsedMs: number;
  clientId: string;
  /** Strength only. Written as the session runs, sent once at Close. */
  sets?: LoggedSet[];
  /** Engine only. */
  routeName?: string;
  distanceKm?: number | null;
}

export interface OutboxItem {
  id: string;
  path: string;
  body: unknown;
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or disabled localStorage must not break a session in progress.
  }
}

function remove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// --- the shared secret -------------------------------------------------------

export function getKey(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('k');
  if (fromUrl) {
    write(KEY, fromUrl);
    // Keep it out of the address bar and out of any screenshot.
    url.searchParams.delete('k');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    return fromUrl;
  }
  return read<string>(KEY);
}

export function setKey(value: string): void {
  write(KEY, value.trim());
}

// --- fetching ----------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const key = getKey();
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'x-flowquest-key': key } : {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status, json?.retryable === true || res.status >= 500);
  }
  return json as T;
}

// --- today cache -------------------------------------------------------------

export function cacheToday(payload: TodayPayload): void {
  write(TODAY, { payload, fetchedAt: Date.now() });
}

export function cachedToday(): { payload: TodayPayload; fetchedAt: number } | null {
  return read<{ payload: TodayPayload; fetchedAt: number }>(TODAY);
}

// --- the session in progress -------------------------------------------------

export function startSession(plan: SessionPlan, date: string): ActiveSession {
  const active: ActiveSession = {
    date,
    plan,
    startedAt: Date.now(),
    step: 0,
    elapsedMs: 0,
    clientId: newId(),
    sets: [],
  };
  write(ACTIVE, active);
  return active;
}

export function getActive(): ActiveSession | null {
  return read<ActiveSession>(ACTIVE);
}

export function saveActive(active: ActiveSession): void {
  write(ACTIVE, active);
}

export function clearActive(): void {
  remove(ACTIVE);
}

// --- the outbox --------------------------------------------------------------

export function newId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getOutbox(): OutboxItem[] {
  return read<OutboxItem[]>(OUTBOX) ?? [];
}

export function enqueue(path: string, body: unknown): OutboxItem {
  const item: OutboxItem = { id: newId(), path, body, createdAt: Date.now(), attempts: 0, lastError: null };
  write(OUTBOX, [...getOutbox(), item]);
  return item;
}

function saveOutbox(items: OutboxItem[]): void {
  write(OUTBOX, items);
}

export interface SyncResult {
  sent: number;
  pending: number;
  failed: OutboxItem[];
}

/**
 * Drain the queue. Writes carry a clientId, so a retry that actually landed
 * the first time comes back as a duplicate rather than a second row.
 */
export async function sync(): Promise<SyncResult> {
  let items = getOutbox();
  if (!items.length) return { sent: 0, pending: 0, failed: [] };

  let sent = 0;
  const keep: OutboxItem[] = [];
  const failed: OutboxItem[] = [];

  for (const item of items) {
    try {
      await api(item.path, { method: 'POST', body: item.body });
      sent += 1;
    } catch (err) {
      const attempts = item.attempts + 1;
      const message = err instanceof Error ? err.message : 'Unknown error';
      const retryable = err instanceof ApiError ? err.retryable : true;

      // Micro logs carry no dedupe marker, so once the server has answered at
      // all the write may have landed. Retrying could double the count, and a
      // lost tap is cheaper than a wrong one.
      const serverAnswered = err instanceof ApiError;
      const unsafeToRepeat = item.path === '/micro' && serverAnswered && (err as ApiError).status !== 401;

      // A rejected write will never succeed by repeating it. Anything else
      // stays queued so the next online moment picks it up.
      if (unsafeToRepeat || (!retryable && err instanceof ApiError && err.status !== 401)) {
        failed.push({ ...item, attempts, lastError: message });
      } else {
        keep.push({ ...item, attempts, lastError: message });
      }
    }
  }

  saveOutbox(keep);
  return { sent, pending: keep.length, failed };
}
