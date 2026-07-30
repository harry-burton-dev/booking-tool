# Series Bookings Redesign — Design Spec

**Date:** 2026-07-30
**Status:** Approved in brainstorming (Approach A); awaiting implementation plan
**Supersedes:** the toggle + weeks-dropdown series mechanism in `cpt_Modal_`

## Problem

Series bookings created via the wizard produce one booking regardless of the selected
count. Root cause (confirmed 2026-07-30): the modal's confirm button raises the host's
`OnSubmit` event and then resets `tglRecurring`/`drpWeeks` in the same behaviour chain.
`PatchPayload` is a computed output property, evaluated when the host *reads* it — after
the resets — so the payload always describes a single occurrence.

Beyond the bug, the flat "N weekly rows" model has no linkage between occurrences: no
edit-all, no cancel-all, no series view, and only weekly repeats.

## Requirements (agreed)

- Recurrence patterns: **Weekly, Bi-weekly, Monthly** (same day-of-month).
- Series length: **number of occurrences, 2–12** (single cap for all patterns).
- Each occurrence is its own booking row, linked into a series.
- Edit and cancel prompt for scope: **just this booking** vs **whole series**.
- Clashing occurrences are **created anyway** in a non-active `Clash` status; the user
  is told the clash count at create time and resolves clashes afterwards.
- My Bookings gains a **Series** tab (series manager) with clash-resolution cycling.
- Clash rows are highlighted in Upcoming and never block other users' bookings.

## Data model (Approach A — flat columns, no second list)

New columns on `Book_Bookings` (plain text/number/boolean for SharePoint delegation,
matching the existing `Status` text convention):

| Column | Type | Meaning |
|---|---|---|
| `SeriesID` | Text | GUID stamped on every member of a series. Blank = standalone. |
| `RecurrenceType` | Text | `Weekly` \| `BiWeekly` \| `Monthly`. Blank on standalone. |
| `OccIndex` | Number | 1-based position within the series. Blank on standalone. |
| `IsException` | Yes/No | Member was individually edited; series-wide **edits** skip it. |

`Status` (existing text column) gains the value **`Clash`** alongside `Active` and
`Cancelled`. No schema change needed for this.

**Clash semantics — "exists but needs rescheduling":**

- Excluded from all conflict checks and from Find/Rooms timelines (both already filter
  `Status = "Active"`); a Clash row never blocks anyone.
- Visible to its owner in My Bookings (highlighted) and in the Series tab.
- Also used for **invalid-day landings**: a monthly occurrence falling on Sat/Sun
  (bookings are Mon–Fri) is created as Clash rather than silently skipped. One
  resolution mechanism covers both room conflicts and weekend landings.

**Occurrence generation:** weekly = +7 days, bi-weekly = +14 days, monthly =
`DateAdd(n, TimeUnit.Months)` on the same day-of-month (Power Fx clamps
Jan 31 → Feb 28). Time-of-day identical to the first occurrence for all members.

**Series derivation:** a series is the set of rows sharing a `SeriesID`. The Series tab
groups client-side (`GroupBy`) over the user's own bookings. Series-level facts
(pattern, room) are read from any member row; duplication across ≤12 rows is accepted
in exchange for single-list, delegable, transaction-free operations.

**Schema rollout:** add columns to the replica site's `Book_Bookings` now (m365 CLI);
the same field additions become a step in `deploy/RUNBOOK.md` for prod.

## Booking wizard (cpt_Modal_ step 2)

Replace the `Book a Series` toggle + `Weeks` dropdown with:

- **Repeats:** `Doesn't repeat` / `Weekly` / `Every 2 weeks` / `Monthly`
  (default: doesn't repeat)
- **Occurrences:** `2–12`, visible only when repeating

Step-2 hint becomes a live preview: *"10 bookings, every 2 weeks, last on 3 Dec 2026"*.
Step-3 confirm panel gains a pattern line ("Every 2 weeks × 10").

**Structural fix for the payload race (both measures, belt and braces):**

1. All wizard resets move to **modal-open initialization** (when `gbl_UI_Book_Modal`
   flips true / step-1 init). The confirm button only validates and raises `OnSubmit`;
   it resets nothing.
2. Each host handler's **first statement snapshots `PatchPayload`** into a local
   collection and works only from the snapshot.

## Create flow (Home / Find / Rooms — handlers stay line-identical)

1. Snapshot payload (rows carry `OccIndex`, shifted start/end, booking fields).
2. If repeating, mint one `SeriesID = GUID()` for the batch.
3. Per occurrence: weekday valid **and** no `fnOverlaps` hit against
   `Status = "Active"` → write `Status: "Active"`; otherwise write `Status: "Clash"`.
   Every occurrence is written — no skips.
4. Write failures (`IfError` around `Patch`) collect and notify, as today.
5. Refresh + notify with clash count:
   *"Created 10 bookings — 2 clash and need rescheduling. See My Bookings → Series."*

## Edit flow (bookingDetail times-only edit)

If the saved row has a `SeriesID`, prompt: **Just this booking** / **Whole series**.

- **Just this booking:** patch the row, set `IsException = true`. Conflict rules as
  today (cannot save into an occupied slot). A Clash row saved into a free slot
  becomes `Active`.
- **Whole series:** apply the new time-of-day to every *future, non-cancelled,
  non-exception* member (dates stay on the pattern). Re-evaluate each member: free →
  `Active`, occupied → `Clash`. Re-timing can both create and heal clashes in one
  pass. Past occurrences and exceptions untouched.

## Cancel flow

Same scope prompt.

- **This booking:** `Status: "Cancelled"` (valid on Clash rows).
- **Whole series:** all future members → `Cancelled`, **including exceptions** (an
  exception is still part of the series, just re-timed). Deliberate asymmetry:
  edit-all skips exceptions, cancel-all takes them. Past occurrences untouched.

## My Bookings — Series tab

The Upcoming/All content switcher gains a third segment, **Series**.

- One row per `SeriesID` (client-side `GroupBy` of the user's bookings): title, room,
  pattern label, next upcoming date, counts (*"8 active · 2 clash"*).
- Row actions: **Resolve clashes** (visible when clash count > 0; starts the Fix
  cycle at the series' first clash), **Cancel series**.
- Expanding a row lists its occurrences in the existing gallery style; clash rows are
  highlighted with a **Fix** action.
- **Fix / clash cycling:** Fix opens the times-only edit prefilled for that occurrence
  (single-scope; becomes an exception when saved free). On save, if the series has
  more clashes, the next clash's edit opens automatically — cycling until clean or the
  user closes.
- **Upcoming tab:** clash rows carry a *"Clash — needs rescheduling"* badge; tapping
  through to bookingDetail and saving a valid time activates them.

## Plumbing

- The `MyBookings` named formula (App.Formulas) widens from `Status = "Active"` to
  include `Clash` rows. Owner-facing surfaces only; Find/Rooms timelines and all
  conflict checks stay Active-only.
- All series-wide writes get `IfError` + partial-failure notify, matching create.
- Series operations are single-list (`Filter`/`UpdateIf` on `SeriesID`) — no
  cross-list writes, no transactions needed.

## Out of scope

- "This and following" edit scope (two-way split of a series).
- End-date-based series length; RRULE-style patterns (ordinal weekdays, yearly).
- A separate `Book_Series` list (rejected: two-list writes without transactions,
  extra prod provisioning, cross-list delegation pain — for ≤12-row groups).
- Series visibility for non-owners beyond what bookings already expose.

## Verification

1. Schema first on the replica site (m365 CLI), verified by reading the list fields
   back.
2. Project ladder: pa-lint → pa-schema-validate → compile → fresh-sync marker greps
   (claims recorded per RULES P8).
3. Manual (Studio/player):
   - Weekly ×3, bi-weekly ×2, monthly ×3 — row counts, dates, times, `OccIndex`.
   - Monthly series starting on a day that lands on a weekend → Clash row created.
   - Create with a known conflict → clash count in notify; row is `Clash`, not
     blocking the other booking.
   - Edit one (becomes exception) then edit-all (exception untouched).
   - Edit-all into a conflicted slot (member → Clash) and back out (member heals).
   - Cancel one; cancel series (exceptions included, past untouched).
   - Series tab counts; Fix cycling across 2+ clashes; Upcoming badge.
   - Standalone bookings unaffected end-to-end (blank `SeriesID`).
