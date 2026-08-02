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

Nine Notion databases. The app reads all of them and writes to six.

**Slots** (12 rows) — the twelve parts of the Form.
`Name`, `Slot id` (stable identity), `Sequence` (position in the loop, freely
reorderable), `Active`, `In short form`, `Current level`, `Unlock order`,
`Unlocked on`, `Entry position`, `Exit position`.

Slot id and Sequence are deliberately different numbers. Sequence decides order;
Slot id decides which movements belong to a slot. Arm balance is slot id 11 but
sequence 5.

**Skills** (69 rows: 48 movement + 21 strength) — the ladders.
`Name`, `Domain` (movement / strength / skate), `Slot`, `Level`, `Family`,
`Status` (locked / current / mastered), `Cues`, `Reference term`, `Why builds`,
`Why unlocks`, `Sessions at level`, `Last practiced`, `Level up deferred`,
`Duration seconds`, `Unit` (reps or seconds, strength only), `Serves slot`
(strength only), `Why skate`, `Entry position`, `Exit position`, `Prereqs`,
`Attempts`, `Skill id`.

**Sessions** — one row per completed session. `Date`, `Type`, `Planned minutes`,
`Actual minutes`, `Completed`, `Difficulty`, `Soreness`, `Skills practised`,
`Notes`, `Distance km` and `Route` (Engine only).

**Plan** — an optional weekly plan, one row per day. Read-only on the phone.

**Micros** (16 rows) — `Name`, `Trigger`, `Cue`, `Duration`, `Feeds slot`,
`Weekly target`, `Active`, `Retired`, `Assist streak weeks`.

**Micro log** — one row per logged micro, with a count.

**Strength log** — one row per set: `Date`, `Skill`, `Set`, `Reps`, `Seconds`,
`Session`. Written by the app during a Strength session. The `Session` column
holds the client id, so an offline retry cannot double-log.

**Milestones** — the app's memory. One row per advancement: `Date`, `Kind`
(level up / slot unlock / rounds up / trick mastered / strength level up),
`Subject`, `Detail`, `Session`. Written by the app, never edited by hand. This
is what makes a year of training legible.

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

### The Form grows on three axes

| Axis | What changes | Mechanic |
| --- | --- | --- |
| **Depth** | a slot's movement gets harder | level up, 1 to 4 |
| **Breadth** | the sequence gets longer | slot unlock, 6 to 12 |
| **Volume** | the session gets longer | round ramp, 1 to 4 |

**Volume — the rounds ramp:**

- Flow sessions 1–6 → 2 rounds
- 7–14 → 3 rounds
- 15+ → 4 rounds
- Flow Short is always 1 round

The count is of completed Flow sessions **since the last slot unlock**; Flow
Short never advances the ramp. Counting since the unlock rather than lifetime is
what makes the unlock's round reset real.

**Breadth — the slot unlock.** The Form grows when you have stopped struggling
with what you have, not on a schedule. All four must hold: 10 completed Flow
sessions since the last unlock; no session rated `hard` in the last 5; rounds
already at the top of the ramp, so volume is maxed before breadth increases; and
at least half the active slots at level 2 or above.

Accepting ticks `Active`, stamps `Unlocked on`, writes a milestone, and resets
the round count to the bottom band — so a longer sequence at fewer rounds is the
same session length. **That reset is the point: the Form gets longer without the
morning getting longer.** Deferring silences it for 14 days.

**One proposal, ever.** All three axes can come due at once, and three decisions
on a dark morning is a chore list. Priority: slot unlock, then Form level-up,
then strength level-up. Everything else waits. A round-ramp crossing is never a
proposal — it just happens and is stated once.
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

Each ladder names the Form slot it serves: Push → Ground push, Single leg →
Rise, Hinge → Spinal extension, Hang → Compression core. **Pull serves nothing
in the Form, and that is the point of it existing** — the Strength screen
carries the line `Nothing on the floor trains this.` permanently on that row.

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

The rotation is **reconciled every morning** from Today. It used to run only
when a week was generated, and week generation was removed — so it had never run
at all. It is deterministic for a given week, so running it daily converges and
then writes nothing.

**Micros lower the level-up bar.** A slot whose micros hit 80% of target for two
consecutive weeks drops from 8 sessions to 6, and the proposal says why: *"Six
sessions instead of eight. The micros did that."* That is the entire argument
for micros, made concrete once rather than asserted in a footer.

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

### Planning, and the suggestion

Two things, deliberately separate.

**The week** is laid out by hand on the Week screen, one tap per day. `Suggest a
week` offers a shape built from the constraint rules below, which is then
corrected by tapping. Nothing is ever typed: no busy-day form, no availability
questionnaire. A planner that asks you to describe your week defeats the point.

**The suggestion** covers every day the week does not. Today computes one line
from what the app already knows:

> *2 of 3 this week. Last was Flow. Suggest Strength.*

The rules behind it: after Flow prefer Strength, then Engine, then Flow; after
Strength prefer Flow; strength never on consecutive days; never more than two
strength sessions in a window; if the weekly target is already met, suggest the
gentler Flow Short rather than pushing for more.

A row in the Plan database always wins over the suggestion, so a planned week
takes precedence and an unplanned day still opens on something sensible.

---

## 6. The screens

Ten screens. Navigation is deliberately flat: **Today is the hub**, and every
other screen has a single `TODAY` link in the top right. There is no tab bar and
no back-stack to reason about at 6am.

```
Today ──Start──▶ Runner ──Finish──▶ Close ──Done──▶ Today
  │
  ├─ the four training domains, as buttons
  │  ├──▶ Form      (the twelve slots and their ladders)
  │  ├──▶ Strength  (the five ladders)
  │  ├──▶ Micros    (tap to count)
  │  └──▶ Skate     (190 tricks + focus card)
  │
  └─ the utilities, as a text strip
     ├──▶ Progress  (the log: milestones and sessions)
     ├──▶ Week      (the plan, read-only)
     └──▶ Routes    (running routes)
```

**Cross-links, not a tab bar.** Every reference to another node is a link: a
micro card points at the slot it feeds, a Form movement at the micros feeding it
and the strength family serving it, a strength ladder at the slot it serves, a
skate trick at what builds it, a route at an Engine session with that route
pre-selected. One tap out and back. That is what turns ten screens into one app,
and it costs no new navigation model.

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
   · 3 blocks`, or the reason there is nothing to run — **followed by the
   horizon, in amber: `slot 7 in 4 sessions`.** This is the most important small
   thing in the app. It is the only place the arc is stated every single
   morning, and it turns a multi-year climb into something happening next week.
4. **Start** — a 68px amber button, full width. Reads `Restart` if a session is
   already in progress, with a quiet `Resume` beneath it.

Below the fold, in a stack:

5. **Banners**, only when true:
   - `Showing the last saved copy. Not refreshed yet.` (offline, serving cache)
   - `2 sessions have not reached Notion yet.` (outbox not drained — amber)
   - `Already logged today.`
6. **One proposal**, never more. Three shapes, one card:
   - *slot unlock* — `THE FORM IS READY TO GROW` / `Slot 3: Hip opener` / `Ten
     sessions, nothing hard in the last five. Rounds go back to 2.` / `Add it` ·
     `Not yet`
   - *Form level-up* — `READY TO LEVEL UP` / `Squat and ankle: Deep squat hold`
     / `Level 1 to 2. Eight sessions, last three easy.` — or, when micros
     lowered the bar, `Six sessions instead of eight. The micros did that.`
   - *strength level-up* — `Pull: Horizontal body row` / `Level 1 to 2. 3 clean
     sets on Incline bar row.`

   The app proposes; Jan decides. Deferring is always the second button.
7. **The suggestion line**, one muted sentence.
8. **The rolling count**: a 30px numeral then `of 3 in the last 7 days · 4d of
   slack · 2 weeks`.
9. **Four domain buttons**, two per row: Form · Strength · Micros · Skate. At
   6am the question is "which of my four kinds of training", not "which of my
   ten screens". No icons — invented glyphs are more to decode, not less.
10. **A utility strip** in small uppercase text, not buttons: Adjust · Progress
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

Logging a set **starts an inline rest countdown in that lift's card**, at the
block's prescribed rest — 90s for the pull/push superset, 60s elsewhere. It sits
where `Log a set` was, reads `rest 1:24`, does not take over the screen, does not
interrupt the block clock and does not beep. At zero it reverts to `Log a set`.
Holding a block clock and a mental rest timer at once, mid-superset, is exactly
the friction that gets strength sessions skipped.

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
  - a node on the line whose **mass** shows the level: hollow ring at 1, 35%
    filled at 2, 75% at 3, solid with a faint halo at 4. A small flat dot for a
    slot that has not unlocked. Mass rather than colour depth, because colour is
    unreliable at low screen brightness — and because the Form screen after a
    year is then visibly denser in a way that cannot be faked
  - the sequence number, condensed, muted
  - the movement name (or the slot name if locked), with the slot name
    underneath. **The next slot to arrive is visually distinct from distant
    ones**: it shows its real name and `unlocks next · 4 sessions away` in
    amber-dim, where distant slots stay grey with `unlocks 9th`. It is the most
    motivating row on the screen and must not look identical to the one arriving
    in two years
  - the level, `2/4`, amber over muted

Header: `6` amber, then `of 12 slots · 6 levels deep · slot 7 in 4 sessions`.

Tapping a row expands the unified detail panel (see 6.14).

---

### 6.8 Strength — the five ladders

Same shape as the Form screen, because a strength lift and a Form movement are
the same kind of object.

- **Header**: `STRENGTH`, `TODAY`. Then `5` in amber, `ladders · 5 levels deep`.
- Five collapsed rows: a mass node showing the level, the current movement's
  name, then `Pull · serves Ground push` underneath, and `1/5` on the right.
- **The Pull row carries a permanent amber line, visible without expanding:
  `Nothing on the floor trains this.`** That sentence is the entire
  justification for Strength existing, and it belongs where it will be read on
  the morning the session is about to be skipped.
- Tapping a row expands the unified detail panel.

### 6.9 Progress — the log

Not a dashboard. No charts, no rings, no percentages, no streak graphics.

- **Header**: `PROGRESS`, `TODAY`.
- **The two numbers that matter**, side by side in condensed amber: total
  sessions, and weeks at target. Nothing else above the log.
- **Three filter chips**: `All` · `Milestones` · `Sessions`, default `All`.
- **The log**, reverse chronological, on the same continuous vertical line as
  everywhere else in the app:
  - *milestones* stand out — amber node, the subject at full size, the kind in
    amber-dim underneath (`slot unlock`, `level up`, `rounds up`), then one plain
    detail line: `Added Hip opener. Rounds reset to 2.`
  - *sessions* are quiet — a small muted node and one line: `Jul 26 · Flow · 10
    min · easy`, with distance and soreness appended when logged

Soreness on the session line matters more than it looks: a run of wrist entries
next to the weeks slots 6 and 7 were being drilled is exactly the signal worth
catching, and this is the only place that pattern will ever be visible.

Scrolling back through a year should read as a story with events in it, not as a
spreadsheet. The milestones are the events.

### 6.10 Micros — tap to count

- **Header**: `MICROS`, `TODAY`.
- A stack of cards, one per active micro:
  - the name, its trigger underneath in muted text (`while the kettle boils`),
    and a third line naming what it feeds: `feeds Squat and ankle`, tappable
    through to that slot. When the assist rule is live it reads `feeds Squat and
    ankle · assisting` in sage.
  - on the right, a 32px count over a smaller `/10` target. Amber below target,
    **sage once the target is met**.
- Footer: `Tap to log one. Tap again for several. Micros never count as
  sessions.`

Tapping increments immediately with no confirmation and no network wait. Taps
within 1.2 seconds of each other collapse into a single write, so tapping five
times is one row in Notion with a count of five, not five rows.

Only 3 to 5 cards should ever be on this screen — that is what makes it a focus
rather than a list.

If nothing is active: `No micros are active. The weekly plan picks them.`

---

### 6.11 Skate — 190 tricks

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

### 6.12 Week — laying out the week

The Sunday screen. This is where runs and strength sessions get placed on days,
and it is the one screen not designed for 6am.

- **Header**: `WEEK`, `TODAY`.
- **The count and the week picker**: `‹  3 of 3 planned · week of Aug 3  ›`. The
  arrows move a week at a time. **On a Sunday it opens on the week ahead**, not
  the one that is ending, because that is when the planning actually happens.
- **Seven rows**, Mon to Sun: the weekday in condensed muted type, the session
  type (amber for Flow and Flow Short, plain for everything else), a muted line
  with location and reason, and the planned minutes on the right. Rest days are
  dimmed to 55% and lose their card background.
- **Tapping a day opens six choices in place**: Rest · Flow · Flow Short ·
  Strength · Engine · Skate. Picking one writes that day immediately. There is
  no Save button to forget and nothing is lost if the phone goes down halfway
  through.
- **Suggest a week** fills all seven days from the constraint rules: three
  sessions, one strength, one run, strength never on back-to-back days, rest
  days protected, a light morning before any skate window. It is a starting
  point to correct by tapping, **not an answer to accept** — and it still asks
  for nothing to be typed.
- Below, the rationale — a few plain lines describing the plan that came out.

Planned minutes come from the type's target in config, so setting a day stays
one tap and never becomes a form.

**A planned day always wins over the daily suggestion**, so once the week is
laid out Today simply opens on it. Days left untouched fall back to the
suggestion rather than becoming rest — partial planning works.

On a planned **rest** day Today stays honest: the big number goes muted, the
detail line reads `Flow if you want it`, and the button becomes a quiet `Train
anyway`. The plan is a decision already made, not a lock.

---

### 6.13 Routes — read-only

- **Header**: `ROUTES`, `TODAY`.
- One card per route, sorted by distance:
  - the distance in 34px amber numerals with a small `KM`, then the name
  - the description, two or three muted lines
  - `from Berouw · Paved quay, some cobbles near Muide · quiet 5/5`
  - `Open the map` — an amber link to Google Maps

Three real routes, hand-scouted in Ghent: Oude Dokken loop (3.5km), Dampoort and
Ganda (5.5km), Voorhaven out and back (8km).

---

### 6.14 The unified detail panel

The visual expression of the one-grammar rule, and the single biggest thing that
makes the app feel like one app. **Every node in every domain expands into the
same panel, with the same rows in the same order.** A skate trick, a strength
lift and a Form movement must be recognisably the same object.

```
CUES       Heels down. Pry the knees open. Breathe low.
BUILDS     Ankle dorsiflexion and squat depth.
OPENS      Beast hold, level 2
MICROS     Deep squat while the kettle boils · Tempo twenty
STRENGTH   Single leg
SKATE      Landing depth on anything you pop.
CHAIN      forward fold to deep squat · in the short form
           ─────────────────────────────
           3 of 8 sessions at this level · last 2026-07-28
Look up →
```

Rules:

- The label column is fixed-width, 13px uppercase, muted. The value column is
  body text.
- **Rows with no content are omitted entirely**, never shown empty. A Pull
  ladder has no `Serves` row; it carries its one-line justification instead.
- **Every value naming another node is a link**, rendered amber, opening that
  node and returning.
- Progress at the current level always sits directly above `Look up`, separated
  by a hairline.

Three properties, in the same order, for every trainable thing in the app:
**where it sits** (its level or status), **what it serves** (the thing upstream
it feeds), **what it opens** (the thing downstream it unlocks).

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
| Lay out the week's sessions and runs | Week |

Notion holds the content — movement names, cues, explanations, routes, micro
definitions and the tuning numbers. Editing that is authoring, not logging, and
is expected to be rare.

| Grow the Form by a slot | Today, proposal card |
| Read the record of everything so far | Progress |

**Still Notion-only**: adding or rewording a micro, route or movement. That is
authoring, not logging.

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

The one place worth spending effort. **The thread always shows twelve nodes** —
not six, not the number in today's session. Twelve, always, because the point is
that a short session visibly sits inside the same structure as a long one, and
that the structure is a closed loop: slot 12 exits standing and slot 1 enters
standing.

Five states, told apart by **size and weight, not by colour alone**:

| State | Rendering |
| --- | --- |
| In today's session, current | 15px, solid amber |
| In today's session, done | 11px, solid sage |
| In today's session, ahead | 11px, ring in `--ink-line` |
| Unlocked, sitting out today | 8px, ring in `--ink-line` |
| Not yet unlocked | 5px, flat dot in `--ink-line` |

In the Runner it is a 22px column on the left with a gradient fill rising as the
session runs. On the Form screen it is the same thread laid out as a spine
behind twelve rows.

**Level reads as mass, not as colour.** Hollow ring at level 1, 35% filled at 2,
75% at 3, solid with a 1px halo at 4. Colour depth is unreliable at low screen
brightness; mass is not. The intent is that the Form screen after a year of work
is visibly denser than on day one, and that the density is unmistakably earned.

The line is continuous and unbroken through all twelve, always. It never renders
as a bar with a percentage and it never gains a label. It is the only element
carrying the app's identity.

### 9.3a Making a slow thing feel like it is moving

The sequence grows from six movements to twelve over roughly a year, then
deepens for years after that. On most mornings, nothing observable happens. Three
devices carry the arc without the gamification that is ruled out:

1. **The horizon.** The next arrival is always a countable number of sessions,
   never a date or a percentage. `slot 7 in 4 sessions`. A multi-year arc becomes
   a thing happening next week.
2. **Accumulated mass.** Levels are visual weight, not a score. After six months
   the Form screen is visibly heavier, and that weight cannot be rushed.
3. **The log.** Milestones sit on the same line as ordinary sessions, newest
   first. Scrolling back is reading a record, not viewing a dashboard.

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

### 9.5a Rejected, and why

Recorded so they do not get reintroduced:

| Proposal | Verdict |
| --- | --- |
| Warm the palette toward near-black | Rejected. Generic, and it collapses the card/border separation at low brightness. |
| Icons on the Today buttons | Rejected. Invented glyphs at 6am are more decoding, not less. |
| A bottom tab bar | Rejected. Invites accidental switches one-handed. Today as hub with push-and-return is right. |
| Level shown as colour depth | Replaced by mass. Colour depth is unreliable at low brightness. |
| A thread showing only the active slots | Rejected. Twelve always, so a short session sits inside the whole structure. |
| Charts, rings, percentages, badges, streak graphics | Rejected permanently. The three devices in 9.3a do this job instead. |

### 9.6 Motion

Almost none. The thread fill has a 400ms linear transition; nothing else
animates. `prefers-reduced-motion` disables everything globally. There are no
loading spinners — screens that are loading say `LOADING` and nothing more.

---

## 10. What is verified, and what is not

Jan is travelling for a month and cannot test any of this, so this section is
deliberately blunt.

**Verified against real Notion rows.** 67 automated checks run against a
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

**Known gap, stated rather than hidden.** The skate `Built by` mapping is
family-level and lives in config, because the source data has no per-trick
fitness mapping. It is the coarsest thing in the app and is expected to be
wrong in places.

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
