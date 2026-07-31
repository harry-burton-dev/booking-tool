# Rooms Timeline Redesign

**Date:** 2026-07-30

**Status:** Approved design

**Scope:** Visual redesign and booking-composer features for the Rooms single-day timeline state

**Relates to:** [`2026-07-30-rooms-selection-redesign-design.md`](2026-07-30-rooms-selection-redesign-design.md) (parent),
[`2026-07-30-rooms-browse-polish-design.md`](2026-07-30-rooms-browse-polish-design.md) (sibling, in flight)

## Context

The timeline state (`con_timeline_view` in `Src/Rooms.pa.yaml`) is mechanically sound and
stays mechanically intact: `btn_LoadTimeline` builds `colTimelineRows` (booked and free
runs, `RowHeight = minutes × 2`), free-slot taps clamp the start to the next 15-minute
mark, and the wizard submit path already ends with `Select(btn_LoadTimeline)`. None of
that engine changes.

What changes is everything the user sees, plus one interaction model. The current view is
a blue takeover header over an edge-to-edge gallery whose free slots are giant buttons
reading `Book 08:00 - 09:00 · Available 1h`. The requester supplied two reference tiles
showing the target: a white page with a back link and title, a bordered timeline card with
in-card day navigation, quiet grey booked blocks, empty free space labelled only
`Available 2h`, a red now-marker, and a right sidebar that acts as a booking composer —
tap a slot, pick a duration chip, press one Book button.

A live `sync_canvas` at 2026-07-30 (this session) confirmed the server matches `Src/`
byte for byte at time of writing.

### Coordination with the browse polish (required reading)

A primary session is concurrently implementing
`docs/superpowers/plans/2026-07-30-rooms-browse-polish.md` in the same file. Its Task 6
font sweep touches 8 `Font:` sites inside `con_timeline_view`; the rest of its work is in
the browse subtree. **Implementation of this spec must not begin from today's sync.** It
begins with a fresh `sync_canvas` after the browse polish has published, merges in git
(RULES P4), and follows the single-publisher protocol (`docs/PUBLISHING-PROTOCOL.md`).
The font sweep overlap is benign — this redesign also lands IBM Plex Sans on every
timeline control.

## Decisions (confirmed with the requester, 2026-07-30)

1. **Book CTA opens the wizard with times preset.** *(Amended during implementation,
   2026-07-31.)* The original decision was to open at `WizardStep3`, but final review
   found the wizard's step 3 is confirm-only: the title input lives on step 2, and
   step 3's Confirm requires a non-blank title — a direct jump dead-ends with Confirm
   disabled and no field to satisfy it. Since wizard internals are out of scope and
   fabricating a default title was rejected, the CTA opens `WizardStep2` with
   `varStartTime`/`varEndTime` preset from the composer; the user enters a title there
   and proceeds. Follow-up (not in this change): add a title field to the sidebar
   composer, after which the direct `WizardStep3` jump becomes viable.
2. **Mockup page header, without the stepper.** The `STEP 2 OF 3` eyebrow in the
   reference is dropped, consistent with the parent spec's no-stepper ruling.
3. **Oversize duration chips are disabled**, never capped or warned. The range shown is
   always bookable.
4. **Start time = free-run start**, clamped to the next 15-minute mark if the run has
   begun — the exact current formula. No sub-slot picking.
5. **Ghost block renders in-row.** The selected free row draws the blue block internally;
   `colTimelineRows` is not rebuilt on selection or chip changes.
6. **Booked blocks are tappable → `bookingDetail`**, except privacy-masked ones.
7. **No floor line** (no such column in `Book_Rooms`); the sidebar status line shows only
   when viewing today.

## Goals

- Replace the blue takeover header with the reference page architecture.
- Restyle the timeline as a bordered card with in-card day navigation and a legend.
- Make free space quiet (text only) and booked blocks Carbon-grey with an accent bar.
- Add the sidebar booking composer: room card, duration chips, live range, one Book CTA.
- Render the tentative booking as a blue ghost block on the timeline.
- Add the red now-marker (gutter badge + line).
- Open existing bookings from the timeline.
- Retire the ~40 raw `RGBA(...)` literals inside `con_timeline_view` (RULES DS1) — the
  follow-up deferred by the browse polish spec lands here because the container is being
  rewritten anyway.

## Non-goals

- No change to the `btn_LoadTimeline` row engine beyond two additive row fields (§5).
- No change to wizard internals, payload shape, clash handling, or submit behaviour.
- No week view, no drag-to-resize, no sub-slot start picking.
- No change to the browse state, `RoomsBrowse*` formulas, or `conRoomsSelectionBar`
  beyond one selection-clear addition (§3).
- No `Src/App.pa.yaml` change: selection state is screen-scoped context variables.
- No SharePoint schema or data change. No new screen, component, or data source.
- No 12-hour time formats; `HH:mm` throughout, as in the parent spec.

## Design

### 1. Page architecture

`con_timeline_view` becomes a vertical stack on the page background (`AppTheme.Background`):

- **Page header** (transparent, no blue): `← All rooms` text link (replaces
  `btnBackToRooms`; same `OnSelect`, plus selection clear), page title
  `"Pick a time in " & varSelectedRoom.Title` (semibold, `Size: =24`), and a right-aligned
  muted stat reusing the existing `freeMin` calculation from `lblHeaderSummary`:
  `"{X}h {Y}m free · {N} booked"` (`fully booked` when free ≤ 0).
- **Two-column body**: timeline card (`FillPortions: 1`) and sidebar (fixed 320px).
  Below `App.Width < 1024` the body stacks vertically. Canvas AutoLayout cannot reorder
  children responsively, so the timeline card stays first and the sidebar stacks below
  it; the card keeps `FillPortions: 1` and its gallery scrolls internally, so the sidebar
  sits at a fixed position below the card rather than at the end of a long page.

### 2. Timeline card

White `AppTheme.Surface` card, 1px `AppTheme.Border`, square corners, no shadow.

**Card header row:** `Text(glbSelectedDate, "ddd dd mmmm")` semibold; `‹ ›` day chevrons
(existing handlers); `Today` button (existing disabled-when-today logic); the
`ModernDatePicker` restyled for a light surface (it remains the only arbitrary-date jump);
and a right-aligned legend — small `Free` swatch (Surface + Border) and `Booked` swatch
(`SurfaceAlt`). All existing `OnSelect` handlers gain a selection clear (§3).

**Rows** (existing gallery, existing heights):

- **Hour gutter** — unchanged mechanics; muted `HH:mm` top-aligned labels.
- **Booked blocks** — `AppTheme.SurfaceAlt` fill, 3px `AppTheme.TextSecondary` left
  accent bar. Short rows (`RowHeight < 48`): single line, `Title` semibold +
  `HH:mm – HH:mm` regular, inline. Tall rows: `Title` semibold, second line
  `BookedBy · HH:mm – HH:mm` in `TextSecondary`. Past bookings keep the existing dimmed
  treatment (`TextMuted` text, accent bar `TextMuted`). The green "my booking" tint is
  dropped — the reference shows uniform grey; ownership is visible via tap-through (§5).
- **Free areas** — borderless `Surface`, single centered `TextMuted` label:
  `Available {X}h {Y}m` for runs ≥ 30 minutes, `Available {Y}m` below. The `Book HH:mm`
  button text is gone; the whole area remains the tap target (transparent button).

**Now marker** (today only, replacing `● now`): in the gutter, a `StatusBusyText`-filled
badge with white `Text(Now(), "HH:mm")`; across the row containing now, a 2px
`StatusBusyText` line positioned `DateDiff(ThisItem.RowStart, Now(), Minutes) × 2` px
from the row top. Position refreshes with the existing `varNowTick` cadence; a
mid-row-static line between ticks is accepted.

### 3. Selection model

Four context variables on the Rooms screen (via `UpdateContext`), no globals:

| Variable | Meaning |
|---|---|
| `varTLSelStart` | Clamped start (`DateTime`); `Blank()` = no selection |
| `varTLSelMinutes` | Chip duration in minutes |
| `varTLSelRunStart` | `RowStart` of the tapped free row (ghost-row identity) |
| `varTLSelRunEnd` | `RowEnd` of the tapped free row (chip-fit bound) |

**On free-run tap:** `varTLSelStart` = run start clamped to the next 15-minute mark if
begun (the existing `btnFreeSlot` formula, moved verbatim); run bounds recorded;
`varTLSelMinutes` = 60 if it fits, else the longest chip that fits, else the full
remaining run (`DateDiff(varTLSelStart, varTLSelRunEnd, Minutes)`).

**Chip fit rule:** chip *m* is enabled iff
`DateAdd(varTLSelStart, m, TimeUnit.Minutes) <= varTLSelRunEnd`. When no chip fits, all
four are disabled and the duration is the full remaining run.

**Ghost block:** the free row where `RowType = "free" && RowStart = varTLSelRunStart`
renders internally: a spacer of `(varTLSelStart − RowStart) × 2` px (non-zero only for
the clamped in-progress run), then a `ColorValue(AppTheme.Primary)` block of
`varTLSelMinutes × 2` px with white text — `Your booking` semibold, plus
`HH:mm – HH:mm · {duration}` when the block is ≥ 48px tall — then the remaining free
space with its `Available` label recomputed for the residue. Tapping the ghost or the
residue re-runs the free-run tap on the same row (idempotent; residue tap is absorbed
into re-selecting the run, not a second selection).

**Selection clears** (`varTLSelStart` → `Blank()`): on day chevrons, `Today`, date-picker
change, `← All rooms`, timeline entry (`btnRoomsViewToday` in the browse selection bar),
and on successful wizard submit — one `UpdateContext` added beside the existing
`Select(btn_LoadTimeline)` in `cpt_Modal__book_rooms.OnSubmit`. Wizard cancel keeps the
selection: the slot is still free and the ghost still valid.

### 4. Sidebar

Fixed 320px column of two `Surface` cards (1px `Border`).

**Room card:**

- Status line, visible only when `glbSelectedDate = Today()`: dot + text.
  Free now → `StatusFreeText` dot, `"Free until " & Text(nextStart, "HH:mm")` from the
  first `colRoomBookings` row starting after now, or `"Free for the rest of the day"`
  when none. Booked now → `StatusBusyText` dot,
  `"Booked until " & Text(currentEnd, "HH:mm")` from the row containing now.
- `varSelectedRoom.Title` semibold.
- Description line using the browse polish spec's guarded formula (§3 there) applied to
  `varSelectedRoom` — no duplicated `seats N`, no floor.
- Equipment pills: the browse card's known-tag pattern
  (`Screen / VC / Whiteboard / Projector` filtered by `varSelectedRoom.Equipment`),
  `SurfaceAlt` fill on the `Surface` card so pills are visible.

**Composer card (`YOUR BOOKING`):**

- Eyebrow label `YOUR BOOKING` (`TextMuted`, tracked caps).
- Time display: `-- : --` placeholder in `TextMuted` when no selection; else
  `HH:mm – HH:mm` large (`Size: =24`) semibold.
- Caption: `Choose a start time on the timeline` → after selection,
  `Text(glbSelectedDate, "ddd dd mmmm") & " · " & varSelectedRoom.Title`.
- `Duration` label + four chips `30m / 1h / 1h 30m / 2h`. Selected chip: `TextPrimary`
  fill, `Surface` text (dark chip per the reference). Unselected: `Surface` fill, 1px
  `Border`. Disabled (oversize or no selection): `SurfaceAlt` fill, `TextMuted` text,
  `DisplayMode.Disabled`. Chip tap sets `varTLSelMinutes` only.
- CTA button, full width: no selection → `DisplayMode.Disabled`, `SurfaceAlt`/`TextMuted`,
  text `Select a time`. With selection → `ButtonPrimary` fill, white text,
  `"Book " & HH:mm & " – " & HH:mm`. `OnSelect` runs the current `btnFreeSlot`
  initialisation block (wizard state resets, `varSelectedDate`, alternative-rooms clear)
  with `Set(varStartTime, varTLSelStart)` and
  `Set(varEndTime, DateAdd(varTLSelStart, varTLSelMinutes, TimeUnit.Minutes))`; the step
  stays `WizardStep2` (see amended Decision 1 — step 3 has no title input).

### 5. Booked-block details

Two additive fields join the booked rows in `btn_LoadTimeline`'s first `Collect` (the
only engine touch): `BookingID: booking.ID` and
`IsMasked: booking.IsPrivate && booking.BookedByEmail <> Lower(User().Email)` (the same
expression already used to mask `Title`). Free rows collect both as `0` / `false`.

An unmasked booked block is tappable:
`Set(gblSelectedBooking, LookUp(colBookings, ID = ThisItem.BookingID)); Navigate(bookingDetail, ScreenTransition.Fade)`
— the exact contract `myBookings` uses. Masked (`Busy`) blocks are inert
(`DisplayMode.Disabled` on the tap target): navigating would leak the title via
`bookingDetail`. Return navigation lands back on Rooms with the timeline state intact.

### 6. Tokens and typography (RULES DS1)

Every control written or rewritten by this redesign uses `AppTheme` tokens and
`Font: ="IBM Plex Sans"` (the proven literal, not `CarbonFontFamily`). This retires the
~40 `RGBA(...)` literals inside `con_timeline_view` deferred by the browse polish spec.
Transparency-only values (`RGBA(0,0,0,0)`) become `Color.Transparent`. The screen-level
`Fill` and `LoadingSpinnerColor` literals remain out of scope, as before.

## Deliberately unchanged

- The `btn_LoadTimeline` engine: interval maths, free-run derivation, clamps, sort,
  `RowHeight = minutes × 2` — everything except the two additive fields in §5.
- The free-slot start-clamp formula (moved, not modified).
- Wizard internals, payload, clash/weekend handling, notifications, and its existing
  `Select(btn_LoadTimeline)` refresh.
- `bookingDetail` screen and the `gblSelectedBooking` contract.
- 24-hour `HH:mm` display throughout.
- Privacy masking rules (`Busy`, blank `BookedBy`).

## Acceptance criteria

1. Timeline state renders as: white page, back link, `Pick a time in {room}` title,
   free/booked stat right — no blue header, no stepper text.
2. Timeline card shows in-card date, chevrons, Today, date picker, and Free/Booked
   legend; card is bordered `Surface` on `Background`.
3. Free areas show only `Available Xh Ym` (no `Book HH:mm` text) and remain tappable
   across their full area.
4. Booked blocks are grey with a left accent bar; short rows show title + time on one
   line; tall rows show the booker; past bookings are dimmed; no green own-booking tint.
5. Tapping a free run selects it: sidebar shows the range, chips reflect fit (oversize
   chips disabled — with start 30 minutes before a booking, only `30m` is enabled), and
   the blue ghost block appears at the right position and height on the timeline.
6. With no selection, the sidebar shows `-- : --`, the prompt caption, all chips
   disabled, and a disabled `Select a time` CTA.
7. The CTA opens the wizard at step 2 with `varStartTime`/`varEndTime` equal to the
   sidebar range (amended Decision 1); completing the booking refreshes the timeline,
   shows the new booking, and clears the selection; cancelling keeps the selection.
8. Day navigation, Today, date-picker change, `← All rooms`, and timeline entry all
   clear the selection.
9. On today, the gutter shows the red `HH:mm` badge and the row containing now shows the
   red line at the proportional position; neither appears on other days.
10. Sidebar status line appears only when viewing today and correctly states
    `Free until HH:mm` / `Booked until HH:mm` / `Free for the rest of the day`.
11. Tapping an unmasked booked block opens `bookingDetail` for that booking; `Busy`
    blocks do not respond; returning restores the timeline state.
12. No `RGBA(...)` literal remains inside `con_timeline_view` except the out-of-scope
    screen-level properties; all timeline text renders in IBM Plex Sans.
13. Light and dark themes both remain readable (all colours via `AppTheme`).
14. `pa-lint` 0 errors and no warning increase over the post-browse-polish baseline;
    `pa-schema-validate` 0 findings; `compile_canvas` 0 errors; App Checker shows no new
    issue against `docs/APP-CHECKER-BASELINE.md`.
15. Browse state behaviour (selection, filters, Book, Week) is unchanged.

## Known cosmetic limitation (accepted)

When a selection's start is clamped past the run start (an in-progress run), the band
between the run start and the ghost renders empty — no `Available` label. Cosmetic,
today-only, accepted.

## Follow-up work (not in this change)

- Title field in the sidebar composer, enabling the direct `WizardStep3` jump
  (amended Decision 1).
- Week view (the disabled `View week` action remains a placeholder).
- Font migration for the remaining screens (carried from the browse polish spec).
- Equipment text cleanup in `Book_Rooms` descriptions (carried from the browse polish
  spec).

## Delivery constraints

Files changed: `Src/Rooms.pa.yaml` (the `con_timeline_view` subtree, one line-region in
`btn_LoadTimeline`, one clear in `btnRoomsViewToday`, one clear in
`cpt_Modal__book_rooms.OnSubmit`). Nothing else.

Implementation starts **after** the browse polish publishes: fresh `sync_canvas`, merge
in git, single publisher holding the guard lock (RULES P1–P10, Y1–Y9, DS1, O1–O3).
Anchor edits by quoted YAML, never line numbers. Verification claims follow the ladder —
every claim is "rung N at HH:mm".
