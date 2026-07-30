# Rooms Selection Redesign

**Date:** 2026-07-30

**Status:** Approved design

**Scope:** Rooms browse and room-selection experience

## Context

The Rooms screen currently presents a two-column gallery. Selecting a room immediately switches the screen to the existing single-day timeline. The approved redesign separates selection from action: users first select a room, then choose to view today, view the disabled week placeholder, or open the booking modal.

The supplied reference design is the visual baseline. The implementation must use the app's existing IBM Carbon-derived theme, controls, booking data, and modal rather than introducing unsupported reference fields such as Floor.

The live Canvas app is the source of truth. At design time, a fresh server sync matched the checked-in `Src/Rooms.pa.yaml`, `Src/Find.pa.yaml`, and `Src/App.pa.yaml`.

## Goals

- Recreate the supplied room-grid interaction using the IBM Carbon Design System.
- Make room selection an explicit state rather than immediately navigating.
- Expose three actions after selection: **View today**, **View week**, and **Book**.
- Reuse the existing Today container and existing booking modal.
- Show useful current availability, today's booking pattern, capacity, and equipment directly on each card.
- Support search and filtering using fields already present in `Book_Rooms`.
- Preserve keyboard, screen-reader, light-theme, and dark-theme usability.

## Non-goals

- Do not add a page-level stepper or display “Step 1 of 3.”
- Do not build the week view in this change.
- Do not add a Floor column, room-type taxonomy, new SharePoint list, or new connector.
- Do not modify the internal visual design of `cpt_Modal_`.
- Do not introduce a new screen or reusable Canvas component.
- Do not change booking persistence or conflict-detection behaviour.

## Chosen Approach

Use a faithful retrofit of the existing Rooms screen:

- Rebuild the browse container around the existing room gallery.
- Add a Carbon filter toolbar, data-rich cards, explicit selection state, and a fixed selection action bar.
- Keep the existing Today container and its `btn_LoadTimeline` data-building behaviour.
- Keep `cpt_Modal__book_rooms` as the booking surface.
- Add one app-level derived room-browse formula so cards, counts, filters, and sorting use the same shaped data.

This approach provides the closest match to the supplied design while limiting changes to `Src/Rooms.pa.yaml` and `Src/App.pa.yaml`.

## Information Architecture

### Browse state

The screen opens in Browse state with:

1. The existing application shell header.
2. The heading **Choose a room**.
3. A result summary in the form **“{filtered} of {total} rooms · {available} available now.”**
4. A Carbon filter toolbar.
5. Equipment filter tags.
6. A responsive room-card grid.
7. No selection action bar until a room is selected.

There is no step indicator.

### Selected state

Selecting a room:

- Sets the existing global `varSelectedRoom`.
- Adds a 2px Carbon interactive-blue border.
- Adds a checked indicator in the card's upper-right area.
- Shows the fixed selection action bar.

Only one room can be selected. Selecting another card replaces the selection. Activating the selected card again clears `varSelectedRoom` and hides the action bar.

### Today state

Choosing **View today**:

- Retains `varSelectedRoom`.
- Sets `glbSelectedDate` to `Today()`.
- Shows the existing Today container through `varShowTimeline`.
- Invokes the existing hidden `btn_LoadTimeline` loader.

The existing Today header, date navigation, free-slot booking actions, and privacy masking remain intact. Returning to Rooms restores Browse state with the room still selected and the selection action bar visible.

### Week placeholder

**View week** is rendered in the action bar with:

- `DisplayMode.Disabled`
- No `OnSelect` side effects
- An accessible name that identifies the action as currently unavailable

The future week view will occupy a separate Rooms container, but its content and navigation are outside this change.

### Book action

Choosing **Book**:

- Retains the selected room in `varSelectedRoom`.
- Resets the booking modal's create-state variables using the existing host reset sequence.
- Explicitly sets `varSelectedDate`, `varStartTime`, and `varEndTime` to `Blank()`.
- Opens `cpt_Modal__book_rooms`.

The Rooms page is not a stepper. Any internal modal navigation needed to display its room-preselected entry state remains an implementation detail of the existing modal contract.

## Filter Toolbar

The toolbar uses only fields available in `Book_Rooms`.

### Search

- Searches `Title`, `description`, and `Equipment`.
- Matches case-insensitively.
- Uses delayed input so filtering is not recomputed on every keystroke.
- Accessible label: **Search rooms and equipment**.

### Capacity

Options:

- Any size
- 4+
- 8+
- 14+
- 20+

A room matches when `Capacity` is greater than or equal to the selected minimum.

### Sort

Options:

- Name, ascending by default
- Capacity, smallest first
- Capacity, largest first

### Available now

When active, show only rooms with no active booking overlapping the current time inside the configured working day. Outside the configured working day, the available-now count is zero and cards use the status **Outside booking hours**.

### Equipment

Equipment values use the app's existing tokens, currently Screen, VC, Whiteboard, and Projector. Tags are multi-select. A room must contain every selected equipment token. Equipment parsing follows the delimiter already used by `Book_Rooms`; no schema change is introduced.

### Unsupported reference controls

Floor and Group by are omitted because the current room schema contains no grouping field. Adding decorative controls with no meaningful data would create a misleading experience.

## Room Browse Data

Add one named formula in `Src/App.pa.yaml` that shapes each row from `colRooms` with:

- Room identity and existing `Book_Rooms` fields.
- Active bookings for the room within today's working window.
- Current booking, if any.
- Next booking after the current time, if any.
- Current state: `Busy`, `Free`, `FreeAllDay`, or `OutsideHours`.
- Human-readable status text.
- Boolean availability-now value.
- The number of booked minutes in today's working window.
- Data required by the compact availability strip.

The formula then applies the current search, capacity, equipment, availability, and sort state. The filtered room count and available-now count come from this same result so the header cannot disagree with the grid.

Derived data must remain formula-driven rather than copied into a screen snapshot collection, following RULES Y8.

## Room Card

Each card shows:

1. A status dot and text such as **Busy until 10:30**, **Free until 11:00**, **Free all day**, or **Outside booking hours**.
2. The selected indicator when applicable.
3. Room name.
4. Description and capacity, without a fabricated room type or floor.
5. A compact availability strip for the configured working day.
6. Equipment tags.

### Availability strip

- Uses 30-minute segments between `DayStartHour` and `DayEndHour`.
- Uses `fnOverlaps` to mark a segment as booked when an active booking overlaps it.
- Shows free and booked segments using Carbon theme tokens.
- Includes start, midpoint, and end labels derived from the configured working day.
- Does not expose meeting titles, organisers, or other private booking details.

## Carbon Visual Specification

- Font: existing `CarbonFontFamily` / IBM Plex Sans.
- Screen background: existing Carbon background token.
- Cards: layer surface, 1px subtle border, square corners, no shadow.
- Selection: Carbon interactive blue, 2px border, blue checked indicator.
- Status: existing semantic status tokens; status is always repeated in text.
- Spacing: 8px base grid with 8, 16, 24, and 32px increments.
- Toolbar controls: 48px target height with Carbon underlines/borders.
- Equipment tags: compact Carbon tags with selected and unselected states.
- Action bar: fixed to the content area's bottom edge, separated by a subtle top border.
- **View today**: secondary or tertiary action.
- **View week**: disabled secondary or tertiary action.
- **Book**: primary action.

Do not introduce raw colour values where a theme token exists; follow RULES DS1.

## Responsive Layout

- Wide: four cards per row.
- Medium: two cards per row.
- Narrow: one card per row.
- The toolbar wraps into logical rows without changing control order.
- The fixed action bar keeps the selected-room summary visible and allows actions to wrap without horizontal clipping.
- The existing Today container continues to use the full available content width.

## Accessibility

- Cards are operable as buttons and expose room name, capacity, availability text, and selected state.
- Visible focus styling uses the existing focused-border token.
- Keyboard order follows heading, search, filters, equipment, cards, then actions.
- Availability is never communicated by colour alone.
- Availability strip segments are decorative; their detailed state is summarized in the card's accessible label.
- Equipment tags expose selected state.
- The disabled Week action remains readable and is announced as unavailable.
- The selection action bar appears after the selected card in the logical reading order.

## Empty and Error States

- No filtered results: **No rooms match these filters** with a **Clear filters** action.
- No Today timeline rows: retain the existing **No availability data for this day** state.
- Booking refresh or submit failures: retain existing app-level notifications and `App.OnError`.
- Private bookings: cards display occupancy only; the Today view retains its existing masking behaviour.

## File Boundaries

### `Src/Rooms.pa.yaml`

- Update screen initialization for Browse state and filter defaults.
- Replace the current browse layout with the approved header, toolbar, equipment tags, responsive cards, empty state, and action bar.
- Change card activation from immediate Today navigation to selection/deselection.
- Wire **View today** to the existing Today loader.
- Add disabled **View week**.
- Wire **Book** to the existing booking modal reset/open contract with blank date and time.
- Preserve the existing Today container and booking submit host.

### `Src/App.pa.yaml`

- Add the named formula that shapes, filters, sorts, and counts room browse data.
- Add only the global filter defaults required by that formula.
- Reuse `TodayBookings`, `varNowTick`, `DayStartHour`, `DayEndHour`, and `fnOverlaps`.

### Explicitly unchanged

- `Src/Find.pa.yaml`
- `Src/Components/cpt_Modal_.pa.yaml`
- SharePoint schemas and connections
- Booking write and conflict formulas

## Acceptance Criteria

1. Rooms opens with no step indicator, no selected room, and no action bar.
2. Search matches room name, description, and equipment.
3. Capacity, equipment, available-now, and sort controls combine correctly.
4. The result summary, room cards, and available-now count agree.
5. Every card displays a correct textual status and privacy-safe availability strip.
6. Selecting, replacing, and clearing selection updates the Carbon border, check, and action bar.
7. **View today** opens the existing Today container for the selected room and today's date.
8. Returning from Today preserves the selected room.
9. **View week** is visibly disabled and causes no state change.
10. **Book** opens `cpt_Modal__book_rooms` with the selected room and blank date/time.
11. No unsupported Floor or Group by UI is present.
12. Wide, medium, and narrow layouts remain usable without clipped controls.
13. Keyboard focus, selected state, disabled state, and accessible labels are correct.
14. App behaviour remains correct in the existing light and dark themes.
15. Local lint and schema validation pass, Canvas compilation reports zero errors, and App Checker issues do not increase.

## Delivery Constraints

Implementation and verification must follow RULES P1-P10, Y1-Y9, DS1, and O1-O3. The implementation plan must anchor changes by quoted YAML rather than unstable line numbers.
