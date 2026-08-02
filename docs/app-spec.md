# FlowQuest — what the app is, screen by screen

This describes the app as it is actually built, not as it was sketched. It is
written to be read cold, by someone with no prior context, and is detailed
enough to design a mockup from.

Two audiences:

1. **Jan**, checking it against the original brief.
2. **A design chat**, producing a full visual mockup. Section 9 is the visual
   language already in the code — a mockup should extend it, not replace it.

---

## 1. What it is

FlowQuest is a private, single-user training app for one person, Jan. It is not
a product. There are no other users, no accounts, no social features, no
marketplace, no coaching.

It tracks four things:

- **The Form** — a twelve-part bodyweight movement sequence practised most
  mornings, where each part has a ladder of harder variations.
- **Strength** — five bodyweight strength ladders (pull, push, single leg,
  hinge, hang) trained as supersets.
- **Skate** — a graph of 190 skateboarding tricks with prerequisites.
- **Micros** — one-minute habits attached to everyday triggers ("deep squat
  while the kettle boils").

It is used at 6am, on a phone, in a dim room, half awake, often with the phone
propped against something while both hands are busy. That single sentence is
the design constraint that outranks everything else.

**Non-goals, stated explicitly:** no gamification beyond level numbers, no
streak guilt, no notifications, no charts, no dashboards, no "insights", no
social anything, no AI coaching voice.

---

## 2. Conditions the app is built for

| Condition | Consequence in the design |
| --- | --- |
| 6am, dim room, half awake | Dark by default. One decision per screen. Enormous numerals. Nothing that requires reading a paragraph. |
| Phone propped up, hands busy | Every tap target ≥ 56px. The pause control is the timer itself — a 140px-tall number. |
| Often no network mid-session | The Runner loads once and then never touches the network. Everything queues locally and syncs later. |
| Notion is the source of truth | Local storage is a cache and an outbox, never the record. Content is edited in Notion, not in the app. |
| Single user, private | No login screen. One shared secret in the URL, stored once. |
| Jan will change all the numbers | Every behavioural parameter lives in one config file or in Notion. None are buried in logic. |

---

## 3. Architecture in one page

```
Notion (source of truth)
  ↑ server-side only, internal integration token in an env var
Next.js API routes  ──────────────────┐
  ↑ shared-secret header              │  all planning logic is pure functions
Browser (PWA on the home screen)      │  over plain data — Notion never leaks
  localStorage: cache + outbox        │  past one file
```

- **Notion API version 2025-09-03**, using data source IDs.
- **The token never reaches the browser.** All Notion calls happen in API
  routes.
- **Auth is a shared secret.** The bookmarked URL carries `?k=<secret>`; the app
  saves it to localStorage and sends it as a header from then on. There is no
  login screen. Opening the app without the key shows a single input.
- **Every Notion access goes through one file** implementing a plain `Store`
  interface. Swapping Notion for anything else is one line.
- **Offline**: the Runner is fully self-contained once loaded. Session logs are
  written to an outbox and retried; a `clientId` embedded in the row name makes
  retries idempotent. Today shows plainly when something hasn't reached Notion.

---

## 4. The data model

Eight Notion databases. The app reads all of them and writes to five.

**Slots** (12 rows) — the twelve parts of the Form.
`Name`, `Slot id` (stable identity), `Sequence` (position in the loop, freely
reorderable), `Active`, `In short form`, `Current level`, `Unlock order`,
`Entry position`, `Exit position`.

Slot id and Sequence are deliberately different numbers. Sequence decides order;
Slot id decides which movements belong to a slot. Arm balance is slot id 11 but
sequence 5.

**Skills** (69 rows: 48 movement + 21 strength) — the ladders.
`Name`, `Domain` (movement / strength / skate), `Slot`, `Level`, `Family`,
`Status` (locked / current / mastered), `Cues`, `Reference term`, `Why builds`,
`Why unlocks`, `Sessions at level`, `Last practiced`, `Level up deferred`,
`Duration seconds`, `Unit` (reps or seconds, strength only), `Entry position`,
`Exit position`, `Prereqs`, `Attempts`, `Skill id`.

**Sessions** — one row per completed session. `Date`, `Type`, `Planned minutes`,
`Actual minutes`, `Completed`, `Difficulty`, `Soreness`, `Skills practised`,
`Notes`, `Distance km` and `Route` (Engine only).

**Plan** — an optional weekly plan, one row per day. Read-only on the phone.

**Micros** (16 rows) — `Name`, `Trigger`, `Cue`, `Duration`, `Feeds slot`,
`Weekly target`, `Active`.

**Micro log** — one row per logged micro, with a count.

**Strength log** — one row per set: `Date`, `Skill`, `Set`, `Reps`, `Seconds`,
`Session`. Written by the app during a Strength session. The `Session` column
holds the client id, so an offline retry cannot double-log.

**Routes** (3 rows) — hand-scouted running routes. `Name`, `Distance km`,
`Start point`, `Description`, `Map link`, `Surface`, `Quiet rating`.

**Skate tricks** live in Skills with `Domain = skate`: 190 rows with a
prerequisite graph, all currently locked by choice.

---

## 5. The rules

Every number below lives in `lib/config.ts` or in Notion. None are hardcoded in
logic.

### The Form

Twelve slots in a fixed sequence. Each has an entry position and an exit
position, and the sequence is a **closed loop** — slot 12 exits standing, slot 1
enters standing. That is why longer sessions are whole extra rounds rather than
padded part-rounds: a part-round would break a transition.

Current order (sequence → slot id → name → entry/exit):

```
 1 → 1  Centering          standing → standing     active
 2 → 2  Spinal wave        standing → forward fold active
 3 → 3  Hip opener         fold → fold             locked, unlocks 7th
 4 → 4  Squat and ankle    fold → deep squat       active
 5 → 11 Arm balance        squat → squat           locked, unlocks 12th
 6 → 5  Quadruped load     squat → beast           active
 7 → 6  Ground push        beast → beast           active
 8 → 7  Transition         beast → crab            locked, unlocks 10th
 9 → 8  Posterior chain    crab → seated           locked, unlocks 9th
10 → 9  Spinal extension   seated → supine         locked, unlocks 11th
11 → 10 Compression core   supine → supine         locked, unlocks 8th
12 → 12 Rise               supine → standing       active
```

Six of twelve slots are active today. The other six unlock over time in the
`Unlock order` given.

**One deliberate gap:** with only the six active slots in play, Ground push
exits `beast` and Rise enters `supine`. That is intentional and is bridged by a
cue on Rise ("From beast, sit through and lie back"), not by reordering. The
full twelve-slot loop has no gaps at all.

**Rounds ramp with experience, not with the clock:**

- Flow sessions 1–6 → 2 rounds
- 7–14 → 3 rounds
- 15+ → 4 rounds
- Flow Short is always 1 round

The count is of *completed Flow sessions*; Flow Short never advances the ramp.
At six active slots one round is 4:50, so a beginner's Flow is ~10 minutes and a
seasoned one ~19.

**Durations:** each movement's own `Duration seconds` in Notion wins. A config
table (60/40/60/60/45/45/45/45/45/45/45/40 seconds per slot) is only a fallback
for rows left empty.

**Levels:** each slot has a ladder of four movements. Levelling up is
**proposed, never automatic** — after 8 sessions at the level with "easy" logged
on the last 3. Jan taps Level up or Not yet; deferring silences it for 14 days.

### Strength

Five ladders, grouped by the `Family` field: Pull (5 levels), Push (4), Single
leg (4), Hinge (4), Hang (4). 21 movements total. Each family has exactly one
movement marked `current`; that is what the session uses.

A 30-minute session is four blocks:

| Minutes | Block | Content | Rounds | Rest |
| --- | --- | --- | --- | --- |
| 0–4 | Flow Short as warm-up | — | 1 | — |
| 4–16 | Superset | Pull + Push | 4 | 90s |
| 16–26 | Superset | Single leg + Hinge | 3 | 60s |
| 26–30 | Finisher | Hang | 3 | 60s |

Prescription shown on the card: *3 to 4 sets of 5 to 8, stopping two short of
failure*; holds *build to 30–60 seconds*; negatives *5 reps at 4–5 seconds
down*.

**Strength level-up is "three sets of eight clean"**, and it is driven by sets
logged in the Runner. Three sets at eight or more reps of the same lift, inside
one session, where that session was closed as `easy` or `right`. Holds use
seconds instead — three sets of 45 or more. Deliberately strict: three good sets
spread over three sessions do not add up, because that is not what the rule
means. "Clean" costs no extra taps; it reads the difficulty already answered at
Close.

### The rolling window

Three sessions per rolling seven days. Not a calendar week, not a streak of
days. Today shows `2 of 3 in the last 7 days`, and once the target is met, how
many days of slack remain before the oldest qualifying session expires. Weeks
of hitting the target are counted as a streak.

Micros never count as sessions.

### Micros

Only 3–5 micros are active at once. The rotation rule picks:

- at least 2 that feed the slot closest to levelling up
- 1 tied to the live skate project
- 1 wildcard that has been quiet for 3+ weeks

Anything active but untouched for 3 consecutive weeks is retired rather than
re-offered, so dead targets do not accumulate. Retirement only engages once the
log is actually old enough to judge.

### Skate

190 tricks in a prerequisite graph. Every trick has three states: locked, in
progress, mastered. A locked trick whose prerequisites are all mastered is
"unlockable" and gets an amber edge.

**Everything starts locked** — Jan chose this over a computed baseline. On first
open the app offers a pass through the first three tiers to mark what he can
already do.

The **session focus card** picks: 2–3 rusty tricks (mastered but not confirmed
for 21+ days), 1–2 live projects, 1 stretch attempt (a locked trick with every
prerequisite mastered), 1 switch/fakie item. Rust is the retention mechanic: a
trick you have not touched in three weeks needs confirming again.

### The suggestion

There is **no week-generation button and no form to fill in**. A week planner
that asks you to type in your week defeats the point. Instead Today computes one
line from what the app already knows:

> *2 of 3 this week. Last was Flow. Suggest Strength.*

The rules behind it: after Flow prefer Strength, then Engine, then Flow; after
Strength prefer Flow; strength never on consecutive days; never more than two
strength sessions in a window; if the weekly target is already met, suggest the
gentler Flow Short rather than pushing for more.

A row in the Plan database, if one exists, always wins over the suggestion.

---

## 6. The screens

Eight screens. Navigation is deliberately flat: **Today is the hub**, and every
other screen has a single `TODAY` link in the top right. There is no tab bar and
no back-stack to reason about at 6am.

```
Today ──Start──▶ Runner ──Finish──▶ Close ──Done──▶ Today
  │
  ├──▶ Form      (the twelve slots and their ladders)
  ├──▶ Micros    (tap to count)
  ├──▶ Skate     (190 tricks + focus card)
  ├──▶ Week      (the plan, read-only)
  └──▶ Routes    (running routes, read-only)
```

---

### 6.1 Today — the hub

The only screen Jan sees on most mornings. Above the fold: **what, how long, one
button.** Nothing else.

**Layout, top to bottom:**

1. A small uppercase letter-spaced label: `FLOW` / `STRENGTH` / `FLOW SHORT` /
   `PLANNED REST`.
2. **The number.** Session minutes, in condensed numerals at `clamp(92px, 34vw,
   150px)`, amber. A small muted `MIN` beside it. This is the loudest thing on
   any screen in the app.
3. One muted line of detail: `6 movements · 2 rounds`, or for Strength `5 lifts
   · 3 blocks`, or the reason there is nothing to run.
4. **Start** — a 68px amber button, full width. Reads `Restart` if a session is
   already in progress, with a quiet `Resume` beneath it.

Below the fold, in a stack:

5. **Banners**, only when true:
   - `Showing the last saved copy. Not refreshed yet.` (offline, serving cache)
   - `2 sessions have not reached Notion yet.` (outbox not drained — amber)
   - `Already logged today.`
6. **Level-up proposals**, one card each: `Squat and ankle: Deep squat hold`,
   then `Level 1 to 2. Eight sessions, last three easy.`, then two buttons —
   `Level up` and `Not yet`. The app proposes; Jan decides.
7. **The suggestion line**, one muted sentence.
8. **The rolling count**: a 30px numeral then `of 3 in the last 7 days · 4d of
   slack · 2 weeks`.
9. **Six quiet buttons**, two per row, wrapping: Adjust · Form · Micros · Skate
   · Week · Routes.

**Adjust** replaces the button grid in place with a check-in: `Minutes`
(7/12/18/25) and `Energy` (low/ok/good), then Apply or Cancel. Low energy or ≤8
minutes drops the session to Flow Short — which still counts as a full session.
That is the entire point of Flow Short existing. The check-in bends today's
session and never the week.

**Other states:**

- *No key* — `FLOWQUEST`, `Open the bookmarked link, or paste the key.`, a
  centred input, `Open`.
- *Loading* — the word `LOADING`, centred. Nothing else, no spinner.
- *Error* — `NOT LOADED`, the message, `Try again`.

---

### 6.2 Runner — Form mode

The screen Jan actually looks at while training. **Once it has loaded, the
network can disappear for the whole session and nothing here notices.**

- Keeps the screen awake (and re-requests the wake lock when the phone comes
  back from being hidden, because iOS drops it).
- Times off a wall-clock deadline, not a tick count, so backgrounding the phone
  does not silently stretch the session.
- Persists position and elapsed time on every step, so a mid-session reload
  resumes exactly where it was with the correct elapsed time.

**Layout:**

- **Header**: `FLOW · ROUND 2 OF 3` on the left, `END` on the right.
- **The thread** down the left edge — a 22px column containing a 2px vertical
  line with twelve nodes. This is the app's one signature element; see 9.3.
- **The movement**, filling the rest:
  - `SQUAT AND ANKLE · LEVEL 1` (small, uppercase, muted)
  - the movement name at `clamp(30px, 8.5vw, 44px)`
  - its cues, one or two lines, muted
  - **the timer**: condensed numerals at `clamp(96px, 30vw, 140px)`, amber while
    running, muted when paused. **The timer is the pause button.** Tapping it
    toggles; when paused it shows `PAUSED · TAP TO RESUME` underneath.
- **Next** at the bottom, full-width amber. Reads `Finish` on the last step.

Each step auto-advances when its timer reaches zero. Finishing goes to Close.

### 6.3 Runner — Strength mode

Strength cannot use the movement timeline: a superset is a pair of ladders
repeated for rounds with a rest between, which a per-movement countdown cannot
express. So Strength walks **blocks**.

- **Header**: `STRENGTH · BLOCK 2 OF 4`, `END`.
- **A row of four bars** under the header, each sized to its block's duration —
  amber for the current block, sage for done, faint for ahead. It shows the
  shape of the session at a glance.
- **The block**:
  - `SUPERSET · MINUTE 4 TO 16`
  - each movement, name at `clamp(24px, 6.5vw, 32px)`, with a muted line under
    it: `Pull · level 1 · Bar at hip height, feet on the ground…`
  - `4 rounds as a superset · 90s rest`, then the prescription
- **The same tap-to-pause timer**, slightly smaller, counting the block's
  duration.
- **Next block** at the bottom, `Finish` on the last.

The warm-up block has no movements and reads `Run the short Form to warm up.`

**Each lift carries its own set logger.** Under the movement name is a row of
banked sets — sage numerals in outlined chips — followed by small hollow circles
for the sets still owed, and a `Log a set` link on the right. Tapping it opens a
row of quick-pick numbers (3 / 5 / 6 / 8 / 10 / 12 for reps, 15 / 20 / 30 / 45 /
60 / 90 for holds) plus `Undo`. One tap banks a set. That is the whole
interaction: no steppers, no keyboards, no per-rep tapping.

Which unit a movement uses comes from Notion, per movement. Dead hang and Bar
support hold are counted in seconds; the other nineteen in reps.

Sets are written to localStorage the instant they are tapped, so closing the app
between the last set and the Close screen loses nothing. They travel to Notion
as part of the single session write at Close.

### 6.4 Runner — nothing to run

If a session type has no steps at all, the Runner shows `NOTHING TO RUN`, the
reason (`No active slots. Tick Active on at least one slot in Notion.`), and a
`Log it` button. Never a blank screen.

---

### 6.5 Runner — Engine and Skate

Neither has prescribed steps, so the clock **counts up** rather than down and the
screen carries only the reference card that is actually useful.

- **Header**: `ENGINE · TARGET 30 MIN`, `END`.
- **The stopwatch**, tap to pause, same treatment as everywhere else.
- **Engine**: the three routes as a list, distance in condensed numerals then the
  name. Tapping one selects it, which seeds the distance on the Close screen.
  Selecting nothing is fine.
- **Skate**: the session focus card — the same rusty / project / stretch /
  switch-or-fakie list the Skate screen shows.
- **Finish** at the bottom.

### 6.6 Close — the log

Three taps, under ten seconds. Any longer and it will not get done.

- `DONE` and the elapsed minutes in 68px amber numerals.
- **How it felt**: `easy` / `right` / `hard`, three equal buttons. The selected
  one takes an amber border. This one field drives the entire level-up
  mechanic — eight sessions with "easy" on the last three is what triggers a
  proposal.
- **Distance** (Engine only): six quick picks in km — 3 / 3.5 / 5 / 5.5 / 8 / 10
  — pre-selected from the route picked in the Runner, with the route name
  underneath. Usually already correct and needs no tap.
- **Anything sore**: six wrapping chips — wrists, shoulders, back, hips, knees,
  ankles. Multi-select.
- **Done** at the bottom.

On submit the log is queued locally *first*, then sent. The confirmation screen
shows the minutes in large sage numerals and one of two lines:

- `Logged.`
- `Saved on the phone. It will sync when there is a network.`

Then `Done` returns to Today.

The log records: date, type, planned and actual minutes, difficulty, soreness,
distance and route for Engine, every set logged during a Strength session, and
the ids of every skill practised — movements for Flow, ladder lifts for
Strength. Practising a skill increments its `Sessions at level` and stamps `Last
practiced` in Notion.

---

### 6.7 Form — the twelve slots

The screen that shows years of progress at a glance. It stays quiet and does not
animate.

- **Header**: `THE FORM`, `TODAY`.
- **The count**: `6` in 46px amber, then `of 12 slots · 6 levels deep`.
- **The spine**: twelve rows on one unbroken vertical line, drawn behind them.
  Each row is:
  - a node on the line — filled and amber-bordered for an active slot, with the
    fill deepening as the slot levels up; a small faint dot for a slot that has
    not unlocked
  - the sequence number, condensed, muted
  - the movement name (or the slot name if locked), with the slot name (or
    `unlocks 7th`) underneath
  - the level, `2/4`, amber over muted

Tapping a row expands a detail panel in place:

- the cues
- **Builds** — what the movement develops
- **Unlocks** — what it leads to
- **Look up** — the reference term, as an amber link to a YouTube search for it
- `deep squat to beast · in the short form`
- `3 of 8 sessions at this level · last 2026-07-28`
- **Next** — the movement at the level above, or `Top of the ladder.`

---

### 6.8 Micros — tap to count

- **Header**: `MICROS`, `TODAY`.
- A stack of cards, one per active micro:
  - the name, and its trigger underneath in muted text (`while the kettle
    boils`)
  - on the right, a 32px count over a smaller `/10` target. Amber below target,
    **sage once the target is met**.
- Footer: `Tap to log one. Tap again for several. Micros never count as
  sessions.`

Tapping increments immediately with no confirmation and no network wait. Taps
within 1.2 seconds of each other collapse into a single write, so tapping five
times is one row in Notion with a count of five, not five rows.

If nothing is active: `No micros are active. The weekly plan picks them.`

---

### 6.9 Skate — 190 tricks

- **Header**: `SKATE`, `TODAY`.
- **The count**: `17` in 40px sage, then `mastered · 3 in progress · 190
  tricks`.
- **First run only** — a card: `Everything starts locked.` / `Go through the
  first 3 tiers and tap anything you can already do until it reads mastered.
  Skip it and set them later if you would rather.` / `Done, show everything`.
  While it is showing, only the first three tiers are listed. It appears once.
- **Session focus card** (after first run): `SESSION FOCUS` and up to seven
  lines, each a trick name with a muted reason — `rusty`, `project`, `stretch`,
  `switch or fakie`.
- **Level tabs**: a horizontally scrolling row of numbered buttons, one per
  tier. The selected one is amber-bordered.
- **The tricks** at the selected tier, one card each: name, family underneath,
  and the status word on the right — muted for locked, amber for in progress,
  sage for mastered. A locked trick whose prerequisites are all mastered gets a
  dim amber border.
- Footer: `Tap to move a trick on: locked, in progress, mastered. An amber edge
  means every prerequisite is mastered.`

Tapping cycles locked → in progress → mastered → locked. It updates instantly
and optimistically — 190 rows is too much to refetch on every tap — and the
focus card and unlockable edges refresh from the response.

---

### 6.10 Week — the plan, read-only

- **Header**: `WEEK`, `TODAY`. Then `Week of 2026-08-03`.
- One row per day: the weekday in condensed muted type, the session type
  (amber for Flow and Flow Short, plain for everything else), a muted line with
  location and reason, and the planned minutes on the right. Rest days are
  dimmed to 55% and lose their card background.
- Below, the rationale — a few plain lines explaining why the week looks like
  it does.
- If there is no plan row for the week: `No plan for this week. Today suggests
  the next session from what you have logged; there is nothing to fill in
  here.`

There is **no generate button and no input form on this screen**. It reads a
plan if one exists in Notion and otherwise says so.

---

### 6.11 Routes — read-only

- **Header**: `ROUTES`, `TODAY`.
- One card per route, sorted by distance:
  - the distance in 34px amber numerals with a small `KM`, then the name
  - the description, two or three muted lines
  - `from Berouw · Paved quay, some cobbles near Muide · quiet 5/5`
  - `Open the map` — an amber link to Google Maps

Three real routes, hand-scouted in Ghent: Oude Dokken loop (3.5km), Dampoort and
Ganda (5.5km), Voorhaven out and back (8km).

---

## 7. A morning, end to end

1. Jan opens the app from his home screen. The service worker serves the shell;
   the app drains any queued session logs from previous days, then loads Today.
2. Today shows `FLOW`, `10 MIN`, `6 movements · 2 rounds`, and **Start**.
   Under it: `1 of 3 this week. Last was Strength. Suggest Flow.`
3. If he is tired he taps **Adjust**, picks `low` energy, and the screen
   becomes `FLOW SHORT`, `5 MIN`, `6 movements · 1 round`.
4. He taps **Start**. The whole session — every movement, cue and duration — is
   written to localStorage before the Runner opens. From here, no network.
5. The Runner counts down each movement. The thread fills as he moves down the
   Form; the current node is a large amber dot, finished ones sage. Tapping the
   timer pauses. Round 2 begins automatically at the top of the Form.
6. On the last movement the button reads **Finish**.
7. Close asks how it felt and whether anything is sore. He taps `easy`, then
   `Done`.
8. The log is queued, then sent. If he is in a basement, it says so plainly and
   keeps it. Next time the app opens with a network, it lands in Notion.
9. Back on Today, the count reads `2 of 3 in the last 7 days`. If that was the
   eighth session at this level with the last three easy, a proposal card is
   now waiting: `Squat and ankle: Deep squat hold`.

---

## 7a. Nothing requires opening Notion

Every action needed to run and record training is in the app:

| Action | Where |
| --- | --- |
| Run and log a Flow or Flow Short session | Today → Runner → Close |
| Run and log a Strength session, set by set | Runner, Strength mode |
| Run and log an Engine session with route and distance | Runner → Close |
| Run and log a Skate session | Runner, Skate mode |
| Level up a Form movement | Today, proposal card |
| Level up a strength ladder | Today, proposal card |
| Move a skate trick between locked, in progress, mastered | Skate screen |
| Log micros | Micros screen |
| Shorten or soften today's session | Today → Adjust |

Notion holds the content — movement names, cues, explanations, routes, micro
definitions and the tuning numbers. Editing that is authoring, not logging, and
is expected to be rare.

**Still Notion-only**, both of them content decisions rather than logging:
unlocking a new Form slot (ticking `Active` when a seventh slot is ready), and
adding or rewording a micro, route or movement.

---

## 8. What is configurable

Everything below is a value in `lib/config.ts` or a field in Notion. Jan expects
to change all of it after his first real sessions, so nothing is welded shut:

round ramp thresholds · Flow Short round count · per-slot fallback durations ·
per-movement durations (Notion) · target minutes per session type · strength
block boundaries, families, rounds and rest · the strength prescription ·
strength level-up threshold · movement level-up thresholds and defer window ·
rolling window length and session target · max level · micro rotation weights
and retirement window · skate focus card composition and rust window ·
switch/fakie markers · skate baseline strategy · planner constraints and
preferred days · the suggestion's ordering rules · slot order, active flags and
short-form membership (Notion) · all cues, names, reference terms and
explanations (Notion).

---

## 9. Design direction

This is the visual language already implemented. A mockup should extend it
rather than invent a new one.

### 9.1 Colour

```
--ink          #0e1621   the background. deep ink blue, not black
--ink-raised   #172231   cards and buttons
--ink-line     #24324a   borders and the unlit thread
--amber        #e9a648   warm amber. now, active, the one thing to look at
--amber-dim    #8a6528   amber at rest
--sage         #93a98f   muted sage. done, mastered, met
--text         #ece9e3   warm off-white, never pure white
--muted        #8a94a4   secondary text
```

Three colours carry all meaning: **amber = now**, **sage = done**, **muted =
not yet**. There is no red, no green, no semantic colour beyond those three. A
6am room, not a dashboard.

### 9.2 Type

- **Numbers are the loudest thing on screen.** Condensed, semibold, tabular,
  tight line height. `Avenir Next Condensed` on iOS, falling back to a narrow
  grotesque. Session minutes and the timer are 92–150px. This is the app's
  strongest gesture.
- Body text is the system humanist sans at 17px / 1.45.
- Labels are 13px uppercase with 0.14em letter-spacing, muted. They name things
  without competing with them.
- Nothing is centred except the two dead-end states (no key, loading).

### 9.3 The thread

The one place worth spending effort. The Form is drawn as a single continuous
vertical line with twelve nodes — **unbroken, because the sequence itself is
unbroken**: slot 12 exits standing and slot 1 enters standing, so it closes into
a loop.

- In the **Runner** it is a 22px column on the left. A gradient fill rises
  through it as the session runs. The current node is a 15px amber dot;
  completed nodes are sage; slots not in today's session are 5px faint dots on
  the same line, so a short session visibly sits inside the same structure as a
  long one.
- On the **Form screen** it is the same thread laid out as a spine behind twelve
  rows. Each node's fill deepens with the slot's level — `color-mix(amber,
  level × 25%)` — so years of progress read as the line getting warmer.

It is the only element that carries the app's identity. It should not be
decorated, and it should not be turned into a progress bar with a percentage.

### 9.4 Layout

- One column, full-bleed, `--pad: 20px`, respecting the safe-area insets.
- Every screen is a flex column filling `100svh`. On Today and the Runner the
  main content is vertically centred and the primary action is pinned to the
  bottom.
- Tap targets: 56px minimum, 68px for the primary button.
- Cards are 12–14px radius, `--ink-raised` on a 1px `--ink-line` border.
- Secondary buttons wrap two per row at `flex: 1 1 45%`, which is what keeps six
  of them legible at 390px.

### 9.5 Copy

Plain verbs, lowercase where natural, no exclamation marks, no encouragement, no
personality. `Start`. `Next`. `End`. `Done, show everything`. `Not yet`.

Failure states say what happened and what it means, never apologise:
`Saved on the phone. It will sync when there is a network.`

Numbers are stated, never celebrated. `2 of 3 in the last 7 days` — not "Great
work!".

### 9.6 Motion

Almost none. The thread fill has a 400ms linear transition; nothing else
animates. `prefers-reduced-motion` disables everything globally. There are no
loading spinners — screens that are loading say `LOADING` and nothing more.

---

## 10. What is verified, and what is not

Jan is travelling for a month and cannot test any of this, so this section is
deliberately blunt.

**Verified against real Notion rows.** 48 automated checks run against a
snapshot of the actual database contents — the twelve slots, 48 movement skills,
21 strength movements, 16 micros, and the real 190-trick skate graph. They
cover: Form ordering by Sequence, movement resolution by Slot id, the closed
loop and its one intentional gap, the round ramp bands, duration override and
fallback, strength block composition and coverage, level-up proposal and defer
logic, the rolling window and streak, micro rotation and retirement, the skate
focus card, and graph reachability.

**Verified by hand.** The Notion data patch that separated Slot id from
Sequence, reordered the Form, and moved Rise's entry position to supine — read
back and checked link by link.

**Not verified.**

- **The deployed app has written to Notion successfully** — one real Flow
  session, logged from the phone, which landed correctly and was then deleted.
  So the connection, the token, the shared secret and the session write are all
  proven. What has *not* been exercised is everything built since: Strength,
  set logging, Engine, Skate, and the level-up writes.
- **Nothing can be run against Notion from the machine this was built on.** Its
  network policy blocks every host except github.com, so the Notion driver could
  not be exercised here. The rules are verified against real data; the wire calls
  that fetch that data are covered only by the one proven session write.
- **No real session has been run.** No one has held a phone at 6am and used
  this. Every duration, every threshold and the entire feel of the Runner are
  guesses until that happens.
- **The Strength runner has not been used.** It is new, and it is the least
  proven screen in the app.
- **Offline behaviour has not been exercised on a real phone.** The outbox,
  the wake lock and the service worker are implemented and reasoned about, not
  observed.

**Known gaps, stated rather than hidden.** Unlocking a seventh Form slot is
still a tick in Notion; the app has no screen for it. Micro rotation is computed
but not written back, so which micros are active is also set in Notion.

---

## 11. Notes for a mockup

**Make your own decisions.** Section 9 describes what exists, not a brief you
have to obey. Everything in it is one developer's first pass, built without a
single real session to learn from. If a different navigation model, a different
palette, or a different way of showing progress serves the actual conditions
better, propose it — that is the point of the exercise.

What follows is context for those decisions, not constraints:

- **Today and the Runner are the app.** Everything else is consulted
  occasionally. That is where the effort is worth spending.
- The current hierarchy on every screen is one enormous number, one clear
  action, and everything else quiet. It is built for someone half awake with
  the phone propped up and both hands busy.
- There is no bottom tab bar today; Today is the hub and every screen returns to
  it with one link. That was a 6am-simplicity call, not a considered
  information-architecture decision.
- Charts, rings, badges and confetti were left out deliberately — the user
  explicitly does not want streak guilt or gamification. The underlying
  preference is "quiet"; how you achieve it is open.
- The palette is dark because the app is read in a dark room before dawn. That
  constraint is real; the specific colours are not sacred.
- The thread — the continuous twelve-node line — is the one element carrying any
  identity. It is the most likely thing to be worth keeping and the most likely
  thing to be worth improving.

Two things are genuinely fixed, because they come from the user rather than from
the design: it is dark-room, phone-first, one-handed; and it must not nag,
score, or congratulate.
