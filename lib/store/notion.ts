// The only file in the app that knows Notion exists.
// Everything above it talks to the Store interface in lib/types.ts.

import { DATA_SOURCES, NOTION_VERSION } from '@/lib/config';
import type {
  Domain,
  Micro,
  MicroLogEntry,
  MicroPatch,
  NewPlanEntry,
  NewSession,
  NewSkill,
  NewStrengthSet,
  NewMilestone,
  Milestone,
  NewSkateSet,
  SkateSet,
  PlanEntry,
  Route,
  SessionLog,
  Skill,
  SkillPatch,
  Slot,
  SlotPatch,
  Store,
  StrengthSet,
} from '@/lib/types';

const API = 'https://api.notion.com/v1';

type NotionPage = { id: string; properties: Record<string, any> };

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'NotionError';
  }
}

function token(): string {
  const t = process.env.NOTION_TOKEN;
  if (!t) throw new NotionError('NOTION_TOKEN is not set', 500, 'missing_token');
  return t;
}

type FetchInit = Omit<RequestInit, 'body'> & { body?: unknown };

async function notionFetch(path: string, init: FetchInit = {}): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // fall through to the error below
  }

  if (!res.ok) {
    const code = json?.code;
    const message =
      code === 'object_not_found'
        ? 'Notion returned object_not_found. The integration is probably not connected to the FlowQuest page.'
        : (json?.message ?? `Notion request failed with ${res.status}`);
    throw new NotionError(message, res.status, code);
  }
  return json;
}

/** Query every page of a data source. These tables are small (max ~200 rows). */
async function queryAll(dataSourceId: string, body: Record<string, any> = {}): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const json = await notionFetch(`/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body: { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    });
    pages.push(...(json.results ?? []));
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// --- readers -----------------------------------------------------------------

const rText = (p: any): string =>
  (p?.rich_text ?? []).map((t: any) => t.plain_text ?? '').join('') || '';
const rTitle = (p: any): string => (p?.title ?? []).map((t: any) => t.plain_text ?? '').join('') || '';
const rNum = (p: any): number | null => (typeof p?.number === 'number' ? p.number : null);
const rSelect = (p: any): string | null => p?.select?.name ?? null;
const rMulti = (p: any): string[] => (p?.multi_select ?? []).map((o: any) => o.name);
const rCheck = (p: any): boolean => p?.checkbox === true;
const rDate = (p: any): string | null => p?.date?.start ?? null;

// --- writers -----------------------------------------------------------------

const wTitle = (v: string) => ({ title: [{ type: 'text', text: { content: v.slice(0, 2000) } }] });
const wText = (v: string) => ({ rich_text: v ? [{ type: 'text', text: { content: v.slice(0, 2000) } }] : [] });
const wNum = (v: number | null | undefined) => ({ number: v ?? null });
const wSelect = (v: string | null | undefined) => ({ select: v ? { name: v } : null });
const wCheck = (v: boolean) => ({ checkbox: v });
const wDate = (v: string | null | undefined) => ({ date: v ? { start: v } : null });

// --- mappers -----------------------------------------------------------------

function toSkill(page: NotionPage): Skill {
  const p = page.properties;
  return {
    id: page.id,
    name: rTitle(p['Name']),
    domain: (rSelect(p['Domain']) as Domain | null) ?? null,
    slot: rNum(p['Slot']),
    level: rNum(p['Level']),
    status: (rSelect(p['Status']) as Skill['status']) ?? 'locked',
    cues: rText(p['Cues']),
    referenceTerm: rText(p['Reference term']),
    entryPosition: rText(p['Entry position']),
    exitPosition: rText(p['Exit position']),
    whyBuilds: rText(p['Why builds']),
    whyUnlocks: rText(p['Why unlocks']),
    whySkate: rText(p['Why skate']),
    sessionsAtLevel: rNum(p['Sessions at level']) ?? 0,
    lastPracticed: rDate(p['Last practiced']),
    levelUpDeferred: rDate(p['Level up deferred']),
    durationSeconds: rNum(p['Duration seconds']),
    unit: (rSelect(p['Unit']) as Skill['unit']) ?? null,
    servesSlot: rNum(p['Serves slot']),
    levelUpTarget: rNum(p['Level up target']),
    skillId: rText(p['Skill id']),
    family: rText(p['Family']),
    prereqs: rText(p['Prereqs'])
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    attempts: rNum(p['Attempts']) ?? 0,
  };
}

function toSlot(page: NotionPage): Slot {
  const p = page.properties;
  return {
    id: page.id,
    name: rTitle(p['Name']),
    sequence: rNum(p['Sequence']) ?? 0,
    // Falls back to Sequence so the app is correct both before and after the
    // reorder, whether or not Slot id has been filled in yet.
    slotId: rNum(p['Slot id']) ?? rNum(p['Sequence']) ?? 0,
    active: rCheck(p['Active']),
    inShortForm: rCheck(p['In short form']),
    currentLevel: rNum(p['Current level']) ?? 1,
    unlockOrder: rNum(p['Unlock order']) ?? 0,
    entryPosition: rText(p['Entry position']),
    exitPosition: rText(p['Exit position']),
    unlockedOn: rDate(p['Unlocked on']),
  };
}

function toSession(page: NotionPage): SessionLog {
  const p = page.properties;
  const skills = rText(p['Skills practiced']);
  return {
    id: page.id,
    name: rTitle(p['Name']),
    date: rDate(p['Date']) ?? '',
    type: (rSelect(p['Type']) as SessionLog['type']) ?? 'flow',
    plannedMinutes: rNum(p['Planned minutes']),
    actualMinutes: rNum(p['Actual minutes']),
    completed: rCheck(p['Completed']),
    difficulty: (rSelect(p['Difficulty']) as SessionLog['difficulty']) ?? null,
    soreness: rText(p['Soreness']),
    notes: rText(p['Notes']),
    skillsPracticed: skills
      ? skills.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    distanceKm: rNum(p['Distance km']),
    route: rText(p['Route']),
  };
}

function toStrengthSet(page: NotionPage): StrengthSet {
  const p = page.properties;
  return {
    id: page.id,
    name: rTitle(p['Name']),
    date: rDate(p['Date']) ?? '',
    skill: rText(p['Skill']),
    set: rNum(p['Set']) ?? 0,
    reps: rNum(p['Reps']),
    seconds: rNum(p['Seconds']),
    session: rText(p['Session']),
  };
}

function toSkateSet(page: NotionPage): SkateSet {
  const p = page.properties;
  return {
    id: page.id,
    name: rTitle(p['Name']),
    date: rDate(p['Date']) ?? '',
    trick: rText(p['Trick']),
    attempts: rNum(p['Attempts']) ?? 0,
    landed: rNum(p['Landed']) ?? 0,
    session: rText(p['Session']),
  };
}

function toMilestone(page: NotionPage): Milestone {
  const p = page.properties;
  return {
    id: page.id,
    name: rTitle(p['Name']),
    date: rDate(p['Date']) ?? '',
    kind: (rSelect(p['Kind']) as Milestone['kind']) ?? 'level up',
    subject: rText(p['Subject']),
    detail: rText(p['Detail']),
    session: rText(p['Session']),
  };
}

function toPlanEntry(page: NotionPage): PlanEntry {
  const p = page.properties;
  return {
    id: page.id,
    name: rTitle(p['Name']),
    weekStart: rDate(p['Week start']),
    day: rDate(p['Day']),
    sessionType: (rSelect(p['Session type']) as PlanEntry['sessionType']) ?? null,
    plannedMinutes: rNum(p['Planned minutes']),
    location: rText(p['Location']),
    status: (rSelect(p['Status']) as PlanEntry['status']) ?? null,
    reasonNote: rText(p['Reason note']),
  };
}

/** A multi-select, a comma-separated text field, or nothing at all. */
function rNames(prop: any): string[] {
  if (!prop) return [];
  if (Array.isArray(prop.multi_select)) return prop.multi_select.map((o: any) => o?.name).filter(Boolean);
  const text = rText(prop);
  return text ? text.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function toRoute(page: NotionPage): Route {
  const p = page.properties;
  return {
    id: page.id,
    name: rTitle(p['Name']),
    distanceKm: rNum(p['Distance km']),
    startPoint: rText(p['Start point']),
    description: rText(p['Description']),
    mapLink: rText(p['Map link']),
    surface: rText(p['Surface']),
    quietRating: rNum(p['Quiet rating']),
    // Either a multi-select or a comma string, and absent on a table that has
    // not been given the column yet — which must read as "no bridges known"
    // rather than as a crash.
    bridges: rNames(p['Bridges']),
    lapHint: rText(p['Lap hint']),
  };
}

function toMicro(page: NotionPage): Micro {
  const p = page.properties;
  return {
    id: page.id,
    name: rTitle(p['Name']),
    domain: rSelect(p['Domain']),
    feedsSlot: rNum(p['Feeds slot']),
    weeklyTarget: rNum(p['Weekly target']),
    trigger: rText(p['Trigger']),
    cue: rText(p['Cue']),
    duration: rText(p['Duration']),
    referenceTerm: rText(p['Reference term']),
    active: rCheck(p['Active']),
    retired: rCheck(p['Retired']),
    assistStreakWeeks: rNum(p['Assist streak weeks']) ?? 0,
    stat: rMulti(p['Stat']),
  };
}

function toMicroLog(page: NotionPage): MicroLogEntry {
  const p = page.properties;
  return {
    id: page.id,
    name: rTitle(p['Name']),
    date: rDate(p['Date']) ?? '',
    count: rNum(p['Count']) ?? 1,
    weekStart: rDate(p['Week start']),
  };
}

// --- the store ---------------------------------------------------------------

export class NotionStore implements Store {
  readonly name = 'notion';

  async getSlots(): Promise<Slot[]> {
    const pages = await queryAll(DATA_SOURCES.slots, {
      sorts: [{ property: 'Sequence', direction: 'ascending' }],
    });
    return pages.map(toSlot).sort((a, b) => a.sequence - b.sequence);
  }

  async getSkills(domain?: Domain): Promise<Skill[]> {
    const pages = await queryAll(DATA_SOURCES.skills, {
      ...(domain ? { filter: { property: 'Domain', select: { equals: domain } } } : {}),
    });
    return pages.map(toSkill);
  }

  async createSkill(input: NewSkill): Promise<Skill> {
    const page = await notionFetch('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.skills },
        properties: {
          Name: wTitle(input.name),
          Domain: wSelect(input.domain),
          'Skill id': wText(input.skillId),
          Level: wNum(input.level),
          Family: wText(input.family),
          Prereqs: wText(input.prereqs),
          Status: wSelect(input.status),
        },
      },
    });
    return toSkill(page);
  }

  async updateSkill(id: string, patch: SkillPatch): Promise<void> {
    const properties: Record<string, any> = {};
    if (patch.status !== undefined) properties['Status'] = wSelect(patch.status);
    if (patch.attempts !== undefined) properties['Attempts'] = wNum(patch.attempts);
    if (patch.sessionsAtLevel !== undefined) properties['Sessions at level'] = wNum(patch.sessionsAtLevel);
    if (patch.lastPracticed !== undefined) properties['Last practiced'] = wDate(patch.lastPracticed);
    if (patch.levelUpDeferred !== undefined) properties['Level up deferred'] = wDate(patch.levelUpDeferred);
    if (!Object.keys(properties).length) return;
    await notionFetch(`/pages/${id}`, { method: 'PATCH', body: { properties } });
  }

  async updateSlot(id: string, patch: SlotPatch): Promise<void> {
    const properties: Record<string, any> = {};
    if (patch.currentLevel !== undefined) properties['Current level'] = wNum(patch.currentLevel);
    if (patch.active !== undefined) properties['Active'] = wCheck(patch.active);
    if (!Object.keys(properties).length) return;
    await notionFetch(`/pages/${id}`, { method: 'PATCH', body: { properties } });
  }

  async getSessionsSince(since: string): Promise<SessionLog[]> {
    const pages = await queryAll(DATA_SOURCES.sessions, {
      filter: { property: 'Date', date: { on_or_after: since } },
      sorts: [{ property: 'Date', direction: 'descending' }],
    });
    return pages.map(toSession);
  }

  async createSession(input: NewSession): Promise<SessionLog> {
    const name = input.name ?? `${input.type} ${input.date}`;
    const page = await notionFetch('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.sessions },
        properties: {
          Name: wTitle(name),
          Date: wDate(input.date),
          Type: wSelect(input.type),
          'Planned minutes': wNum(input.plannedMinutes),
          'Actual minutes': wNum(input.actualMinutes),
          Completed: wCheck(input.completed),
          Difficulty: wSelect(input.difficulty ?? null),
          Soreness: wText(input.soreness ?? ''),
          Notes: wText(input.notes ?? ''),
          'Skills practiced': wText(input.skillsPracticed.join(', ')),
          'Distance km': wNum(input.distanceKm),
          Route: wText(input.route ?? ''),
        },
      },
    });
    return toSession(page);
  }

  async getStrengthSetsSince(since: string): Promise<StrengthSet[]> {
    const pages = await queryAll(DATA_SOURCES.strengthLog, {
      filter: { property: 'Date', date: { on_or_after: since } },
    });
    return pages.map(toStrengthSet);
  }

  async createStrengthSet(input: NewStrengthSet): Promise<StrengthSet> {
    const page = await notionFetch('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.strengthLog },
        properties: {
          Name: wTitle(`${input.skill} set ${input.set} ${input.date}`),
          Date: wDate(input.date),
          Skill: wText(input.skill),
          Set: wNum(input.set),
          Reps: wNum(input.reps ?? null),
          Seconds: wNum(input.seconds ?? null),
          Session: wText(input.session),
        },
      },
    });
    return toStrengthSet(page);
  }

  async getSkateSetsSince(since: string): Promise<SkateSet[]> {
    const pages = await queryAll(DATA_SOURCES.skateLog, {
      filter: { property: 'Date', date: { on_or_after: since } },
    });
    return pages.map(toSkateSet);
  }

  async createSkateSet(input: NewSkateSet): Promise<SkateSet> {
    const page = await notionFetch('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.skateLog },
        properties: {
          Name: wTitle(`${input.trick} ${input.date}`),
          Date: wDate(input.date),
          Trick: wText(input.trick),
          Attempts: wNum(input.attempts),
          Landed: wNum(input.landed),
          Session: wText(input.session),
        },
      },
    });
    return toSkateSet(page);
  }

  async getMilestonesSince(since: string): Promise<Milestone[]> {
    const pages = await queryAll(DATA_SOURCES.milestones, {
      filter: { property: 'Date', date: { on_or_after: since } },
    });
    return pages.map(toMilestone);
  }

  async createMilestone(input: NewMilestone): Promise<Milestone> {
    const page = await notionFetch('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.milestones },
        properties: {
          Name: wTitle(`${input.subject} — ${input.kind} ${input.date}`),
          Date: wDate(input.date),
          Kind: wSelect(input.kind),
          Subject: wText(input.subject),
          Detail: wText(input.detail),
          Session: wText(input.session ?? ''),
        },
      },
    });
    return toMilestone(page);
  }

  async getPlanForDay(day: string): Promise<PlanEntry | null> {
    const pages = await queryAll(DATA_SOURCES.plan, {
      filter: { property: 'Day', date: { equals: day } },
    });
    if (!pages.length) return null;
    // If more than one row exists for a day, an unfinished one wins.
    const entries = pages.map(toPlanEntry);
    return entries.find((e) => e.status !== 'done' && e.status !== 'skipped') ?? entries[0];
  }

  async getPlanForWeek(weekStartDate: string): Promise<PlanEntry[]> {
    const pages = await queryAll(DATA_SOURCES.plan, {
      filter: { property: 'Week start', date: { equals: weekStartDate } },
      sorts: [{ property: 'Day', direction: 'ascending' }],
    });
    return pages.map(toPlanEntry);
  }

  async createPlanEntry(entry: NewPlanEntry): Promise<PlanEntry> {
    const page = await notionFetch('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.plan },
        properties: {
          Name: wTitle(entry.name ?? `${entry.sessionType} ${entry.day}`),
          'Week start': wDate(entry.weekStart),
          Day: wDate(entry.day),
          'Session type': wSelect(entry.sessionType),
          'Planned minutes': wNum(entry.plannedMinutes),
          Location: wText(entry.location ?? ''),
          Status: wSelect(entry.status ?? 'planned'),
          'Reason note': wText(entry.reasonNote ?? ''),
        },
      },
    });
    return toPlanEntry(page);
  }

  async updatePlanEntry(id: string, patch: Partial<NewPlanEntry>): Promise<void> {
    const properties: Record<string, any> = {};
    if (patch.name !== undefined) properties['Name'] = wTitle(patch.name);
    if (patch.weekStart !== undefined) properties['Week start'] = wDate(patch.weekStart);
    if (patch.day !== undefined) properties['Day'] = wDate(patch.day);
    if (patch.sessionType !== undefined) properties['Session type'] = wSelect(patch.sessionType);
    if (patch.plannedMinutes !== undefined) properties['Planned minutes'] = wNum(patch.plannedMinutes);
    if (patch.location !== undefined) properties['Location'] = wText(patch.location);
    if (patch.status !== undefined) properties['Status'] = wSelect(patch.status);
    if (patch.reasonNote !== undefined) properties['Reason note'] = wText(patch.reasonNote);
    if (!Object.keys(properties).length) return;
    await notionFetch(`/pages/${id}`, { method: 'PATCH', body: { properties } });
  }

  async getRoutes(): Promise<Route[]> {
    const pages = await queryAll(DATA_SOURCES.routes);
    return pages.map(toRoute);
  }

  async getMicros(): Promise<Micro[]> {
    const pages = await queryAll(DATA_SOURCES.micros);
    return pages.map(toMicro);
  }

  async updateMicro(id: string, patch: MicroPatch): Promise<void> {
    const properties: Record<string, any> = {};
    if (patch.active !== undefined) properties['Active'] = wCheck(patch.active);
    if (patch.retired !== undefined) properties['Retired'] = wCheck(patch.retired);
    if (!Object.keys(properties).length) return;
    await notionFetch(`/pages/${id}`, { method: 'PATCH', body: { properties } });
  }

  async getMicroLogSince(since: string): Promise<MicroLogEntry[]> {
    const pages = await queryAll(DATA_SOURCES.microLog, {
      filter: { property: 'Date', date: { on_or_after: since } },
    });
    return pages.map(toMicroLog);
  }

  async createMicroLog(
    name: string,
    date: string,
    count: number,
    weekStartDate: string,
  ): Promise<MicroLogEntry> {
    const page = await notionFetch('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.microLog },
        properties: {
          Name: wTitle(name),
          Date: wDate(date),
          Count: wNum(count),
          'Week start': wDate(weekStartDate),
        },
      },
    });
    return toMicroLog(page);
  }
}
