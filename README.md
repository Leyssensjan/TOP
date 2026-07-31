# FlowQuest

A private, single-user training app. Phone-first, Notion as the datastore,
Vercel as the host and API layer.

This repo covers steps 1 and 2 of the build order: the Notion module, the
endpoints, and the Today / Runner / Close screens.

## Setup

### 1. Notion

1. Settings → **Integrations** → open the integration → **Configuration** →
   copy the *Internal Integration Secret* (starts `ntn_`).
2. Open the **FlowQuest** page → `···` → **Connections** → **Add connections** →
   pick the integration. Without this step every call returns
   `object_not_found`. Access is scoped to that page and the databases inside it.

### 2. Vercel

Import this repo, then add two environment variables for all environments:

| Variable | Value |
|---|---|
| `NOTION_TOKEN` | the `ntn_` secret from step 1 |
| `FLOWQUEST_SECRET` | any string; it is the key that opens the app |

The token exists only here. It is never in the repo, never in a response body,
and never in the browser. Every Notion call runs inside a Vercel function.

Do **not** set `FLOWQUEST_STORE` in production. It only selects the in-memory
store used for local testing.

### 3. Open the app

Visit `https://<your-app>.vercel.app/?k=<FLOWQUEST_SECRET>` once. The key is
saved locally and stripped from the address bar. Bookmark it, or add it to the
home screen.

## Local development

```bash
npm install

# Endpoints against seeded fake data, no Notion token needed
printf 'FLOWQUEST_STORE=memory\nFLOWQUEST_SECRET=testkey123\n' > .env.local

# Or against the real Notion page
printf 'NOTION_TOKEN=ntn_...\nFLOWQUEST_SECRET=testkey123\n' > .env.local

npm run dev
curl -s -H 'x-flowquest-key: testkey123' localhost:3000/api/today
```

Hydration fails under `next dev` in some sandboxes. If the screens stay on
"loading", use `npm run build && npm start`.

## Endpoints

All require the key, as `x-flowquest-key` or `?k=`.

| Endpoint | Purpose |
|---|---|
| `GET /api/today` | today's session resolved to movements at their current levels |
| `GET /api/state` | the twelve slots, rolling count, streak weeks, active micros |
| `POST /api/checkin` | minutes, energy, soreness; returns the adjusted session |
| `POST /api/session` | logs a session, bumps `Sessions at level` on the movements done |
| `POST /api/micro` | logs a micro, with an optional count |
| `POST /api/levelup` | accepts or defers a proposed level-up |
| `GET`/`POST /api/week` | reads the plan; writes it, or generates it with `generate: true` |
| `GET /api/skate` | the 190 tricks and the session focus card |
| `POST /api/trick` | sets a trick's status |
| `GET /api/routes` | stubbed; the Routes table is empty until routes are scouted |

The last three are not in section 8 of the brief, which was written before
the Skate screen and the planner existed.

## How it is put together

```
lib/types.ts        the Store interface: the whole persistence surface
lib/store/notion.ts the only file that knows Notion exists
lib/store/memory.ts the same interface over seeded fake data, for testing
lib/store/index.ts  the one line that picks between them
lib/rules.ts        session composition, rolling window, level-up, micros, skate
lib/planner.ts      weekly plan generation, deliberately simple and replaceable
```

Swapping Notion for a real database means writing one file and changing one
line in `lib/store/index.ts`.

### Sessions

The Form is a closed loop: slot 12 exits standing and slot 1 enters standing.
A longer session is therefore whole extra rounds of the sequence rather than a
padded part-round, so every transition stays intact. Six active slots make a
round of about 4:50, which is four rounds for a Flow and one for a Flow Short.

Per-slot durations live in `SLOT_SECONDS` in `lib/config.ts`.

### Offline

The Runner loads everything it needs into `localStorage` before it starts, so
the network can disappear for a whole session. Closing a session queues the
write in an outbox and drains it on reconnect. Each write carries a `clientId`,
so a retry that already landed comes back as a duplicate rather than a second
row. Today says plainly when a write has not reached Notion.

Local storage is a cache and an outbox. Notion is the source of truth.

## Screens

Today, Runner, Close, Form, Micros, Skate, Week.

## Verifying

`npm run verify` runs the rules against a snapshot of the real Notion rows and
the real 190-trick graph: session composition, the rolling window, level-up
proposals, micro rotation and retirement, and the skate focus card.

`npx tsx scripts/skate-migration.ts` parses and validates the trick graph.
Add `--import` with `NOTION_TOKEN` set to write it.

## Notes

- One field was added to the **Skills** database: `Level up deferred` (date).
  Deferring a level-up needs somewhere to persist, and no existing field fit.
  A deferred slot goes quiet for 14 days.
- Notion API version `2025-09-03`, required for data source IDs.
- Three fields were added to Notion that the brief did not specify, each
  because a required behaviour had nowhere to persist: `Level up deferred`
  (date) and `Duration seconds` (number) on Skills, and `Retired` (checkbox)
  on Micros.
- The 190 skate tricks all start `locked`. `SKATE_BASELINE` in config switches
  between that and the section 7 graph baseline.
- The planner takes the calendar and forecast as inputs rather than fetching
  them; the server holds no credentials for either.
- The Strength template is not written, so a planned Strength day shows a plain
  note rather than a movement list.
- Winter is not solved. Strength from November to March is located
  "indoor, unsolved" and says so in the plan.
- Routes are stubbed. Nothing is scouted yet.
