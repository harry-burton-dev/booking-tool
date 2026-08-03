# Battle Rhythm bookings, owner-coded timelines, Admin screen — Design

**Date:** 2026-08-03 · **App:** live booking tool `498d4962-0b5f-4990-a400-1bf5de9a367c` ·
**Approved by:** Harry (chat, 2026-08-03)

Three features, one dependency chain:

1. **Owner-coded timeline colors** on Find and RoomsTimeline (mine / past / other / Battle Rhythm).
2. **Battle Rhythm bookings** — permanent recurring bookings stored as one master row, expanded
   virtually at read time, with real rows written only for deviating occurrences.
3. **Admin screen** — formula-declared admins get one screen (myBookings-style chrome, 3 tabs):
   all bookings, Battle Rhythm management, room management.

Decisions taken with Harry: virtual pattern + exceptions (no materialized instance rows); the
category keeps the name **Battle Rhythm** (UI label and code naming `BR`); color scope is Find +
RoomsTimeline only (not Home strips, not myBookings rows); Admin is a single screen with three
tabs.

---

## 1. Owner-coded timeline colors

Every rendered booking block/segment carries an `OwnerClass` computed **at row-build time** (in
`colFindRows`, the Find week `SegsHtml` builder, and RoomsTimeline's `colRoomBookings`), never in
render HTML. Precedence, first match wins:

| OwnerClass | Rule | Light | Dark |
|---|---|---|---|
| `past` | `RowEnd < varNowTick` | existing block color at 45% opacity, `TextMuted` text | same |
| `br` | `StartsWith(RecurrenceType, "BR-")` | `#8a3ffc` (Carbon purple 60), white text | `#a56eff` (purple 40) |
| `mine` | `Lower(BookedByEmail) = Lower(User().Email)` | `Primary` `#0f62fe` (unchanged) | same |
| `other` | fallback | `Border` gray + inset `TextSecondary` bar (unchanged) | same |

- New `ThemeMapHex` tokens (both branches, keep-in-sync discipline, DS1): `BattleRhythm`,
  `BattleRhythmText` (`#ffffff` both themes). Past is opacity, not a token: constant
  `Timeline_PastOpacity = 0.45` beside the other `Timeline_*` constants.
- `past` applies on top of the base class visually (a past mine-block is faded blue), so
  implementation is: base class (`br`/`mine`/`other`) + boolean `IsPast`; the table above is the
  user-facing reading of it.
- Find week view: the 30-min segment strip switch gains `br` (purple) and past-fade branches.
- Legends on Find and RoomsTimeline gain **Battle Rhythm** and **Past** swatches.
- Privacy masking is unchanged (`IsPrivate` others still render "Busy"); masking affects text,
  not OwnerClass.
- This feature is independent of §2: before Battle Rhythm ships, `br` simply never matches.

## 2. Battle Rhythm bookings

### Data model (no SharePoint schema change)

- **Master row** — one row in `Book_Bookings` per Battle Rhythm booking:
  - `RecurrenceType`: `"BR-Weekly"` | `"BR-Fortnightly"` | `"BR-Monthly"` (prefix-encoded
    cadence; matches the existing wizard's cadence set).
  - `SeriesID`: new GUID. `StartDateTime`/`EndDateTime`: the **first occurrence** — anchors
    weekday, time-of-day, and duration. `Status`: `"Active"` (`"Cancelled"` ends the series).
    `IsException: false`. `OccIndex: 0`. `isPrivate: false` (BR events are organizational).
  - Masters are **never rendered directly** and never block bookings directly — only their
    expansion does.
- **Exception row** — written only when one occurrence deviates:
  - Same `SeriesID`; `IsException: true`; `RecurrenceType: "BR-Exception"`;
    `OccIndex: k` where `k` = cadence periods between the master anchor and the occurrence date
    (deterministic date→index, UDF `fnBROccIndex`).
  - *Edited occurrence*: exception row carries the new times/title, `Status: "Active"` — it
    renders as a real booking and suppresses virtual occurrence *k*.
  - *Cancelled occurrence*: `Status: "Cancelled"` — suppresses virtual occurrence *k*, renders
    nothing.

### Read-time expansion

- **Predicate glossary** (used consistently below — note `"BR-Exception"` also matches the
  `"BR-"` prefix, so *master* tests must include `IsException = false`):
  - *is-BR row* (masters AND exceptions — drives `OwnerClass = br`):
    `StartsWith(RecurrenceType, "BR-")`.
  - *is-master*: `StartsWith(RecurrenceType, "BR-") && !IsException`.
- `colBRMasters`: pulled in `App.OnStart` (and refreshed by Admin writes) via delegable
  `Filter(Book_Bookings, StartsWith(RecurrenceType, "BR-"), IsException = false, Status = "Active")`
  — a separate pull because old masters' `EndDateTime` falls out of the −90d `BookingsWindow`.
- UDF `fnBRExpand` (App.Formulas): for each Active master, generate occurrences from the anchor
  forward, clamped to `BookingsWindowStart..BookingsWindowEnd` (~108 rows/master/2yrs, in-memory
  only), minus occurrences whose `(SeriesID, OccIndex)` matches an exception row.
- Virtual occurrence records are shaped to the **plain-record schema `FindBookings` already
  uses** (nested `RoomID: {Id: n}` preserved so `RoomID.Id` consumers don't change). Virtual rows
  get `ID = -(MasterID * 10000 + OccIndex)` — unique, negative marks them un-Patchable, and
  `IsVirtual: true`.
- Named formula **`AllBookings`** = (`colBookings` excluding master rows, Active-and-Clash as
  today) ∪ virtual occurrences, via the `Ungroup(Table({r: A}, {r: B}), "r")` union pattern.
- **Type-compatibility risk (flagged):** unioning reshaped SharePoint rows with fabricated
  records is the hot spot. The implementation plan front-loads a probe compile of
  `AllBookings` alone before anything is built on it.

### Consumers that switch from `colBookings` to `AllBookings`

Correctness set (BR occurrences must block bookings and appear on timelines):
`FindBookings`, `WeekBookings`, `TodayBookings` (feeds Rooms status/occupancy), RoomsTimeline's
`colRoomBookings` build, and **every conflict-check site** that materializes
`colOverlappingBookings` (cpt_Modal_ + the four screens' confirm handlers). `MyBookings` stays on
`colBookings` but gains the *is-master* exclusion so a master's anchor row never shows in the
creating admin's own list (deviated exception rows still appear via `BookedByEmail`).

Mirror convention (App.Formulas `MIRROR CONVENTION` comment) extends: BR master/exception writes
must refresh `colBRMasters` and mirror exception rows into `colBookings` (or re-pull behind a
`MIRROR-FALLBACK`).

### Interaction model

- **bookingDetail** learns virtual rows: negative `ID`/`IsVirtual` → actions become
  *Edit this occurrence* / *Cancel this occurrence* (each writes an exception row), plus
  admin-only *Edit series* / *End series* (Patch the master; ending the series also cancels its
  future Active exception rows).
- Regular users see BR blocks (purple, titled) but cannot edit them; slot taps on BR-occupied
  slots behave exactly like taps on other people's bookings today.

## 3. Admin screen

- **Declaration (formulas, by request):** `AdminEmails = ["harry@harry-burton.ai"]`;
  `IsAdmin = Lower(User().Email) in AdminEmails` — App.Formulas, swappable for a SharePoint list
  later. **Stated limitation:** UI-level gating only; SharePoint list permissions are unchanged,
  so this deters rather than enforces. Accepted for this app's trust level.
- **Nav:** `Shell_Header` gains an **Admin** link (`Visible: IsAdmin`), same pattern as existing
  links. Component watch-item applies (verify custom properties after first component push).
- **Screen `Admin`** — chrome cloned from myBookings (Shell_Header, breadcrumb, page header,
  stat line, Carbon table styling, `AppTheme`/`CarbonHtmlType` tokens throughout).
  `OnVisible`: bounce non-admins to Home; refresh `Book_Bookings`, `colBookings`, `colBRMasters`.
  Content-switcher tabs:
  1. **All bookings** — every row in the window (all users), search box + user + date-range
    filters (in-memory over the window snapshot), columns Room/Date/Time/Owner/Status/Action;
    row actions: open bookingDetail, cancel (existing cancel semantics).
  2. **Battle Rhythm** — table of masters (title, room, cadence, time, next occurrence date);
    *Create Battle Rhythm* opens an inline form (title, room dropdown, cadence, first date,
    start/end time) with a conflict pre-check against `AllBookings` before Patch; *End series*
    with confirm; expanding a master lists its next ~8 occurrences with per-occurrence
    *Deviate* (edit times → exception row) / *Cancel* actions.
  3. **Rooms** — table of `Book_Rooms` (Title, Capacity, Equipment, description); *Add room* and
    inline *Edit* forms Patch `Book_Rooms` then re-pull `colRooms`. No delete (per request).

## Out of scope

Home occupancy strip and myBookings row coloring; SharePoint-enforced admin permissions; BR
cadences beyond the existing Weekly/Fortnightly/Monthly set; notifications for BR changes;
room deletion/deactivation.

## Testing / verification

No local runtime — verification is the repo ladder (pa-lint → compile → marker greps →
pac-verify → Studio → published player, RULES P8/P10). Feature-level acceptance:

- **Colors:** on Find day view with a mix of own/others'/past bookings, blocks render per the
  §1 table in both themes; week segments and RoomsTimeline match; legends updated. App Checker
  count ≤ baseline (14).
- **BR:** create a weekly master in Admin → occurrences appear on Find/RoomsTimeline on the
  right weekdays, purple; attempting to book over one is blocked by the conflict panel; deviate
  one occurrence → only that date changes; cancel one → only that date frees; end series →
  future occurrences vanish, past real rows remain.
- **Admin:** non-admin sees no nav link and is bounced from the screen; rooms added/edited
  appear on Rooms/Find immediately after re-pull.
