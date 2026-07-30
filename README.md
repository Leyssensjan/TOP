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
| `GET`/`POST /api/week` | reads and writes the weekly plan |

## How it is put together

```
lib/types.ts        the Store interface: the whole persistence surface
lib/store/notion.ts the only file that knows Notion exists
lib/store/memory.ts the same interface over seeded fake data, for testing
lib/store/index.ts  the one line that picks between them
lib/rules.ts        session composition, rolling window, level-up rules
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

## Notes

- One field was added to the **Skills** database: `Level up deferred` (date).
  Deferring a level-up needs somewhere to persist, and no existing field fit.
  A deferred slot goes quiet for 14 days.
- Notion API version `2025-09-03`, required for data source IDs.
- Not built yet: the planner, the Form screen, the Micros screen, the skate
  migration. The `/api/micro` and `/api/week` endpoints exist and are tested,
  but nothing in the UI calls them.
- The Strength template is not written, so a planned Strength day shows a plain
  note rather than a movement list.
