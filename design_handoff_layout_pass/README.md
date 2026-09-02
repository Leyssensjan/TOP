# Handoff: FlowQuest layout pass

## Overview
A full layout pass over all eleven FlowQuest phone screens, plus two content changes the
user asked for: the Profile screen becomes a game-style character sheet, and the Routes
screen becomes three named loops measured door to door from Berouw 74.

Nothing about the app's identity changes — same ink/amber palette, same condensed numerals,
same copy voice. What changes is the layout system: a consistent header, a single row shape
with a fixed-width value column, one button height, a real bottom tab bar, and footers
pinned to the bottom of the screen instead of floating in dead space.

## About the design files
The files in this bundle are **design references created in HTML**. They are prototypes of
the intended look and behaviour — not production code to copy.

The task is to **recreate these designs in the existing Next.js app** (`Leyssensjan/TOP`,
branch `claude/flowquest-mvp-qz8vq4`) using its established patterns: App Router client
components, `lib/client/store` for API access, the class utilities and CSS custom properties
in `app/globals.css`, and inline styles where the existing screens already use them.

Do not introduce a CSS framework, a component library, or a state manager. Every screen in
this pass can be built with the primitives already in the repo.

## Fidelity
**High fidelity.** Colours, type sizes, spacing, and radii below are the intended final
values. Recreate them exactly. Where a value conflicts with something already in
`globals.css`, the token in `globals.css` wins and the design should be adjusted to it —
the palette in the design was lifted from that file.

---

## Shared layout system

Apply these on every screen. Most of the "it feels ugly" problem was that each screen
invented its own version of these.

### Screen shell
```
screen            390 × 844 reference (iPhone 14/15 logical size)
header            height 52, flex-none, padding 0 20px,
                  space-between, border-bottom 1px #16202e
content           flex 1, min-height 0, padding 20px, flex column
bottom tab bar    height 68, flex-none, border-top 1px #16202e   (5 tabs; see below)
```
The content column must **fit** — nothing scrolls on these screens except long lists. When
content does not fit, cut a row or tighten a gap; never let a footer overlap the tab bar.

Footers ("Tap a day to swap…", counts, notes) get `margin-top: auto` so they sit at the
bottom of the content column, with `padding-top: 16px; border-top: 1px solid #16202e`.

### Header
- Left: screen name — 12px / uppercase / letter-spacing 0.16em / weight 600 / `--muted`.
  Sub-screens (Micros, Strength, Progress, Routes) prefix it with `‹ `.
- Right: one action or one fact, same type spec. Amber (`--amber`) when it is tappable,
  muted when it is a fact.
- The old pattern — a wrapping list of five text links (`ADJUST PROFILE PROGRESS WEEK
  ROUTES`) — is deleted.

### Bottom tab bar (new)
Five tabs, `display: grid; grid-template-columns: repeat(5, 1fr)`.
Each tab is a flex column, centred, `gap: 7px`:
- dot: 6 × 6 circle — `--amber` when active, `#2b384c` when not
- label: 10px / uppercase / letter-spacing 0.12em / weight 600 — `--amber` active,
  `#6f7d91` otherwise

Tabs: **Today · Week · Form · Skate · You**. `You` is the Profile screen; Micros, Strength,
Progress, Routes, Runner, Close are pushed screens with a `‹` back header and no tab bar.

### The list row — one shape everywhere
This is the single most important rule in the pass. Every list item on every screen uses it:

```
display: grid;
grid-template-columns: <optional 16px index> 1fr <fixed value column>;
align-items: center;
gap: 12px;
min-height: 64px;         /* 58 for dense lists, 44 for the Form spine */
padding: 12px 16px;
background: #141f2c;
border: 1px solid #1e2a3c;
border-radius: 14px;
```
- Body: title (16–17px, weight 500) над subtitle (13px, `#6f7d91`), `gap: 2px`,
  `min-width: 0` so it truncates rather than pushes.
- Value: **fixed-width column, right-aligned** — 56px or 60px depending on the screen.
  This is what makes the numbers line up down the page. Condensed numerals, 26px, `--amber`,
  with the denominator as a 15px `#6f7d91` span (`0` + `/3`).
- Status text instead of a number (LOCKED, 14 AWAY) sits in the *same* column, 11px
  uppercase 0.1em weight 600.

Rows never change height because a title wraps: single-line titles with truncation where
the design shows them on one line.

### Buttons
```
primary     height 56, radius 14, background --amber, colour #17120a, 17px/600
secondary   height 56, radius 14, transparent, 1px solid --ink-line, colour --text, 16px
inline      height 48, radius 12, transparent, 1px solid (--amber or --ink-line), 15px
```
`min-height: var(--tap)` (56) stays the floor for anything tappable. Two buttons side by
side use `grid-template-columns: 1fr 1fr; gap: 8px` — never one full-width and one inline.

### Segmented control (replaces loose pill groups)
Container: `display: flex; padding: 4px; gap: 4px; background: #111a26;
border: 1px solid #1e2a3c; border-radius: 14px`.
Segments: `flex: 1; height: 44–48; border-radius: 10px`; active segment
`background: --amber; colour: #17120a; weight 600`; inactive `colour: --muted`.

Used for: How-it-felt (easy/right/hard) on Close, Tier 0/1/2 on Skate, All/Milestones/
Sessions on Progress. Chip *sets* that are multi-select (sore areas, weekday picker) stay a
`grid` of equal cells instead: `repeat(3, 1fr)` / `repeat(7, 1fr)`, `gap: 8px`, height 46–48.

### Stat cells
Two or three equal cells in a grid, used wherever the old design had bare numbers with tiny
captions floating next to each other:
```
padding: 12–16px; background: #141f2c; border: 1px solid #1e2a3c; radius 14;
number: condensed, 28–44px, line-height 1
caption: 10–12px uppercase, letter-spacing 0.12em, weight 600, --muted
```

### Hero number + unit
The old screens put the unit on a different baseline from the number. Correct pattern:
```
display: flex; align-items: baseline; gap: 8px;
number: condensed 80px, line-height 0.8, --amber, tabular-nums
unit:   20px uppercase, letter-spacing 0.1em, weight 600, --muted
meta:   15px --muted on its own line below (never wrapping around the number)
```

---

## Screens

Reference file: `FlowQuest Screens.dc.html` — all eleven screens side by side, each with a
caption naming what changed. Frames are in this order: Today, Week, The Form, Runner, Close,
Micros, Skate, Strength, Progress, Profile, Routes.

### 1. Today — `app/page.tsx`
Hero (`10 MIN`, `6 movements · 2 rounds · slot 3 of 14`) → primary **Start** → *This week's
micros* section (3 rows, index column, value column) → secondary **Give me a skate session**
→ pinned rolling count (`0` + "of 3 sessions / in the last 7 days") → tab bar.
Section header carries a right-aligned amber `All` link to `/micros`.

### 2. Week — `app/week/page.tsx`
Week stepper is a **3-column grid** (`44px 1fr 44px`): bordered ‹ button, centred label
(`Week of 31 Aug` 16px/600 over `0 of 5 planned` 13px muted), bordered › button. The old
version let the date wrap around the arrows.
Then *Mornings that work* — 7-column grid of 46px day cells, amber border + amber text when
selected. Then primary **Generate week**. Then seven day rows sharing one **52px label
column** (`grid-template-columns: 52px 1fr auto`, height 52) so Mon–Sun align; planned days
are raised cards, Rest days are transparent with `#16202e` border and muted text, with the
time or `—` in the right column. Footer note pinned.

### 3. The Form — `app/form/page.tsx`, `components/Thread.tsx`
Twelve slot rows at height 44, `gap: 4`, on a spine: container
`position: relative; padding-left: 30px` with an absolutely positioned 2px `#22314a` line at
`left: 9px; top: 22px; bottom: 22px`. Node per row is absolutely positioned at `left: -25px`
(11 × 11, 2px amber border, ink fill); inactive slots get a 6 × 6 flat `#22314a` dot at
`left: -22px`.
Row grid: `22px 1fr 56px` — number (right-aligned, muted), then **name and tag on one
baseline row** (`display: flex; align-items: baseline; gap: 8px`, both `white-space: nowrap`,
tag truncating), then value/status. Keeping name+tag on one line is what makes all twelve
nodes evenly spaced.

### 4. Runner — `app/runner/page.tsx`
Header: `FLOW · ROUND 1/2` left, `SOUND` (amber) + `END` right.
Round progress: 6-column grid of 4px segment bars under the header (filled = done).
Body: `grid-template-columns: 22px 1fr; gap: 20px` — left rail carries the thread (2px line,
amber fill to current progress, 15px amber current node, 11px ring nodes) and the content
column is vertically centred beside it. The old version had the thread on the left and the
text floating in the middle of the screen with no relationship to it.
Content: eyebrow (`CENTERING · LEVEL 1`), movement name 40px/600, cue text 16px muted,
timer condensed 104px amber, `TAP TO PAUSE` 12px.
Footer: `Skip` (secondary) + `Next` (primary) as equal 56px buttons.

### 5. Close — `app/close/page.tsx`
Hero `11 MIN` → *How it felt* segmented control (easy/right/hard) → *Anything sore* 3 × 2
grid of 48px cells (`optional` label right-aligned in the section header) → pinned block:
two stat cells (`1 of 3 this week`, `6 slots trained`) + primary **Log it**.
The 400px of dead space in the old screen is gone.

### 6. Micros — `app/micros/page.tsx`
Hero `0 of 15 logged this week`. Three cards at `min-height: 76`, `grid-template-columns:
1fr 60px`: title 17px, trigger 13px muted, and a third line — feeds-which-axis — as 12px
uppercase `--sage`. Value column 30px condensed amber + `/3`.
Pinned: the explanatory sentence as a `#111a26` card, then secondary **Swap this week's set**.

### 7. Skate — `app/skate/page.tsx`
Three equal stat cells (`0 mastered` sage / `0 in progress` amber / `21 tricks` text) replace
the three numbers that were strung along the header line.
Onboarding card (`#111a26`, `--ink-line` border): title, body, then two 48px buttons
(`Later` muted / `Done` amber) in a `1fr 1fr` grid.
Tier picker is a **full-width segmented control** (Tier 0/1/2), not three small pills adrift
on the left.
Trick rows: height 58, `grid-template-columns: 1fr 96px`, name + category eyebrow, status
right-aligned in the fixed column. A trick whose prerequisites are all mastered gets an
`--amber` border and reads `Start` in amber instead of `LOCKED`.
Footer note pinned, one line.

### 8. Strength — `app/strength/page.tsx`
Five ladder rows, one shape, value column 56px. The amber warning "Nothing on the floor
trains this" moves **inside** the Pull row as its subtitle (`#8a6528`) instead of sitting
loose between two cards and breaking the list rhythm.
Pinned: an `Unsolved` note card (amber eyebrow, `#2a2113` border) about the November–March
pull gap, then secondary **Log a strength day**.

### 9. Progress — `app/progress/page.tsx`
Two equal stat cells (`Sessions`, `Weeks at target`) instead of two bare numbers with tiny
captions. Segmented filter (All / Milestones / Sessions).
Empty state **fills the remaining height** (`flex: 1`, centred): 44px ring, `Nothing logged
yet` 17px/600, explanation 14px muted, and a 48px amber outline button **Start today's Flow**
— the one action that ends the empty state.

### 10. Profile — `app/profile/page.tsx`  ← content change
The radar chart clipped "Mobility" and "Nerve" off both edges of a 390px screen. Replaced
with a character sheet, per the user's ask ("like a Tony Hawk Pro Skater profile — building
myself as a character, levelling up, seeing progress").

- **Level badge**: 76 × 76, `border: 2px solid --amber`, radius 20, `#141f2c` fill, condensed
  52px amber level inside; a small `LEVEL` chip (`#0e1621` fill, `--ink-line` border, radius
  6, 10px uppercase) overlaps its bottom edge at `bottom: -9px`.
- Beside it: rank name 26px/600 (`Roller`) over `RANK 1 OF 8 · NEXT: CRUISER` 13px uppercase.
- **XP bar**: 12px tall, radius 3, `#131d29` fill, `1px solid #1e2a3c`, with a
  `::after` overlay of `repeating-linear-gradient(90deg, transparent 0 calc(5% - 2px),
  #0e1621 calc(5% - 2px) 5%)` so it reads as 20 segments; fill is
  `linear-gradient(90deg, #8a6528, #e9a648)`. Under it: `120 XP` left, `280 TO CRUISER` right.
- **Attribute rows** — seven, `grid-template-columns: 104px 1fr 52px`, `gap: 12px`:
  name, then a **10-segment pip bar** (same construction as the XP bar but `10%` steps and
  14px tall), then the value (condensed 22px; amber when > 0, `#5d6b80` at 0).
  Section header carries `+3 THIS MONTH` in `--sage`.
- **Career strip**: three stat cells — Sessions, Tricks (`2/21`, sage), Week streak.
- **Next unlock card**: `#111a26`, `--ink-line` border, amber `NEXT UNLOCK` eyebrow,
  `Board control 2 opens the powerslide`, and a `1/2` progress value in the right column.

Data notes: level, rank, and XP need a source. `overall` and `rank` already come from
`/api/profile`; XP can be derived from the same weighted depth calculation (see `PROFILE` in
`lib/config.ts`) — expose `xp` and `xpToNext` from that endpoint rather than computing in the
component. The pip bars read `level` out of 10, which the endpoint already returns. The
"next unlock" line needs the skate graph's first trick whose only missing prerequisite is an
attribute level — `lib/rules.ts` already resolves prerequisites, so add a selector there.

### 11. Routes — `app/routes/page.tsx`  ← content change
The stubbed routes (Oude Dokken loop / Dampoort and Ganda / Voorhaven) are replaced by the
three loops the user actually runs. **Every distance is door to door**: it includes the
0.9 km from Berouw 74 to the Bataviabrug and the 0.9 km back.

| Name | km | Bridges | Description | Meta |
|---|---|---|---|---|
| Two Bridges | 3.3 | Bataviabrug › Matadibrug | Cross at Batavia, down the Koopvaardijlaan, back over Matadi. | Quiet 4/5 · 2 laps = 6.6 |
| Muidelaan Turn | 4.1 | Matadibrug › Verapazbrug | South to Matadi, north along the Nieuwe Dokken, back at Muidelaan. | Quiet 5/5 · 2 laps = 8.2 |
| The Big Tour | 5.5 | Matadibrug › Muidebrug › Bataviabrug | Full east quay, round Zeppospark, back down the west quay. | Longest · car-free |

Card layout: `padding: 20px 18px`, radius 16, `gap: 12`:
1. baseline row — condensed 38px distance + `KM` unit + route name (17px/500,
   `margin-left: auto`)
2. **bridge sequence** — the route's identity: bridge names as 12px uppercase 0.08em amber,
   separated by `›` in `#3f4c60`
3. description, 14px muted, one line
4. meta left (12px uppercase `#6f7d91`) + 44px amber outline **Run this** right
   (`grid-template-columns: 1fr auto`)

Screen header: `‹ ROUTES` / `BEROUW 74`. Above the cards: a `DOOR TO DOOR` eyebrow with
`incl. 0.9 km each way to Bataviabrug` right-aligned. Pinned footer: `Distances are
estimates until your first GPS run.` + amber `ADD ROUTE`.

**The map is deliberately not on this screen** — the user judged the traced routes not good
enough yet. `Routes Map.html` in this bundle is a working Leaflet implementation to keep for
later (see below).

Data: seed the Notion Routes table with the three rows above. Fields already exist
(`name`, `distanceKm`, `startPoint`, `description`, `surface`, `quietRating`, `mapLink`);
add `bridges` (multi-select or comma string) and `lapHint` (text) — or derive the lap hint in
`lib/rules.ts` from `distanceKm`. `startPoint` is `Berouw 74`.

---

## Interactions & behaviour
- Tab bar navigates between Today / Week / Form / Skate / Profile. Active tab is derived from
  the pathname.
- Sub-screens push and return via the `‹` header (existing behaviour: `router.push('/')`).
- Micro rows: tap logs one, tap again logs more (existing `/api/micro`).
- Trick rows: tap the status column to advance locked → in progress → mastered
  (existing `/api/trick`).
- Segmented controls and chip grids are `aria-pressed` buttons; the existing
  `.btn[aria-pressed='true']` rule already gives them the amber border treatment.
- `Run this` on a route keeps the current behaviour in `app/routes/page.tsx`
  (`startSession` + `saveActive` with `routeName` and `distanceKm`, then `/runner`).
- Nothing in this pass adds animation. `prefers-reduced-motion` handling in `globals.css`
  stays as is.

## State
No new client state beyond what the screens already fetch. The Profile screen needs two
extra fields from `/api/profile` (`xp`, `xpToNext`) and one selector for the next unlock.
Routes needs the two new fields per route. Everything else is presentation.

## Design tokens
Existing, from `app/globals.css` — use these names, do not re-declare the hex values:
```
--ink        #0e1621     --amber      #e9a648     --text   #ece9e3
--ink-raised #172231     --amber-dim  #8a6528     --muted  #8a94a4
--ink-line   #24324a     --sage       #93a98f
--tap 56px   --pad 20px  --condensed  Avenir Next Condensed / Arial Narrow stack
```
Additional values this pass uses that are **not** yet tokens — add them to `:root` rather
than sprinkling literals:
```
--card        #141f2c   /* card fill, slightly cooler than --ink-raised */
--card-line   #1e2a3c   /* card border */
--hairline    #16202e   /* header/footer rules */
--sunken      #111a26   /* segmented-control and note-card fill */
--dim         #6f7d91   /* subtitles */
--dimmer      #5d6b80   /* indices, zero values */
--dimmest     #3f4c60   /* separators, disabled */
--inactive    #2b384c   /* inactive tab dot */
```
Spacing scale: **4 / 8 / 12 / 16 / 20 / 24 / 32**. Radii: 10 (segments), 12 (inline
buttons, dense rows), 14 (rows, primary buttons), 16 (cards), 20 (level badge).
Type scale: 10, 11, 12, 13, 14, 15, 16, 17, 20, 26, 38, 40, 80 — condensed numerals for
every number.

## Assets
None. No images, no icon font, no SVG illustration. The only graphic elements are CSS: the
thread and spine, the pip bars (repeating-linear-gradient), and the tab dots.

## Files in this bundle
- `FlowQuest Screens.dc.html` — all eleven redesigned screens with per-screen change notes.
  Open it in a browser; it needs no build step. (It uses a small runtime, `support.js`,
  which is included.)
- `Routes Map.html` — standalone working map screen: Leaflet + OpenStreetMap tiles darkened
  into the app palette, three routes snapped to the real footpath network via OSRM, explicit
  bridge crossings, and a lap multiplier. Not part of the current Routes screen; keep it for
  when the route traces are good enough. Notes if you do ship it:
  - `'use client'`, and load Leaflet dynamically (`next/dynamic` with `ssr: false`) — it
    touches `window` at import time.
  - Construct the map only once its container has a non-zero size, and never with
    `fadeAnimation` on: constructing against a 0 × 0 box pins Leaflet's zoom and permanently
    breaks layer re-projection.
  - The public OSRM instance's map data predates the Bataviabrug and Verapazbrug, so it
    detours kilometres around them; the file works around this by drawing any leg that routes
    more than 2.6 × its straight-line length as a direct segment. If routes matter, self-host
    a router or store recorded GPS tracks instead.
  - `https://tile.openstreetmap.org` requires the `© OpenStreetMap contributors` attribution
    and rate-limits heavy use; use a proper tile provider in production.

## Suggested prompt for Claude Code
> Read `design_handoff_layout_pass/README.md`. Implement the layout system and the eleven
> screens it describes in this Next.js app, one screen per commit, starting with the shared
> pieces: add the new tokens to `app/globals.css`, then build the bottom tab bar component,
> then the list-row and segmented-control patterns. Keep every screen's existing data
> fetching and API calls untouched — this is a presentation change, except on Profile
> (needs `xp`/`xpToNext` from `/api/profile` and a next-unlock selector) and Routes (three
> seeded loops with `bridges` and `lapHint`). Open `design_handoff_layout_pass/FlowQuest
> Screens.dc.html` in a browser and match it frame by frame.
