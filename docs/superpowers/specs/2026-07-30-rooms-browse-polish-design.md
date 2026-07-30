# Rooms Browse Polish

**Date:** 2026-07-30

**Status:** Approved design

**Scope:** Visual and layout defects in the Rooms browse state

**Amends:** [`2026-07-30-rooms-selection-redesign-design.md`](2026-07-30-rooms-selection-redesign-design.md)

## Context

The rooms selection redesign shipped and is functionally complete: derived data, filters,
selection state, the Today transition, the disabled Week action, and the Book action all
behave as specified. A live `sync_canvas` at 2026-07-30 confirmed the server matches
`Src/` byte for byte, and `pa-lint` reports 0 errors and 18 warnings.

What did not land is the Carbon visual specification. The screen renders as a flat grey
slab with colliding text, invisible equipment pills, truncated controls, and the wrong
typeface. This amendment fixes those defects. It changes appearance and layout only.

### Relationship to the supplied reference design

The reference image contains a `STEP 1 OF 3` indicator, `Floor 1` / `Floor 2` labels, and
`Group by: Room type` section headers. All three remain **non-goals**, unchanged from the
parent spec: `Book_Rooms` has no floor or room-type column, and the parent spec rules out
a page-level stepper. This was reconfirmed with the requester on 2026-07-30. The reference
governs *surface treatment* here, not information architecture.

## Goals

- Restore correct Carbon layering so cards read as cards.
- Eliminate overlapping and clipped text in the card.
- Stop the duplicated capacity string.
- Make equipment pills visible on the card and legible in the filter row.
- Apply IBM Plex Sans to the Rooms screen.
- Remove the raw colour literals left over from the previous card design.

## Non-goals

- No stepper, Floor, or room-type grouping (see above).
- No change to `RoomsBrowse*` named formulas, filter semantics, selection behaviour, the
  Today transition, the Week placeholder, or the Book action.
- No change to `Src/App.pa.yaml`. Every fix is local to `Src/Rooms.pa.yaml`.
- No SharePoint schema or data change.
- No font migration outside the Rooms screen.
- No new screen, component, connector, or data source.

## Root causes

Two token collisions explain most of what the screenshot shows.

**Inverted layering.** `con_tile_view.Fill` is `AppTheme.layer01Bg` = `#f4f4f4`, while the
page behind it is `AppTheme.Background` = `#ffffff`. Cards are therefore grey on white —
the inverse of Carbon layering, and the reason the grid reads as one continuous slab
rather than as discrete cards.

**Identical fills.** `lblRoomsCardEquipmentTag.Fill` is `AppTheme.SurfaceAlt` = `#f4f4f4`,
the same value as the card fill. The pills are drawn, but they are invisible against their
own parent. Moving the card to `AppTheme.Surface` fixes the pills as a side effect; the tag
itself needs no colour change.

**AutoHeight inside ManualLayout.** `lbl_textID_Desc` sets `AutoHeight: =true` inside a
`ManualLayout` card. The label grows downward but does not displace its siblings, so a
two- or three-line description renders on top of the availability strip at `Y: =116`.

## Changes

### 1. Card surface and grid

| Control | Property | From | To |
|---|---|---|---|
| `con_tile_view` | `Fill` | `=AppTheme.layer01Bg` | `=AppTheme.Surface` |
| `gal_rooms_view` | `TemplatePadding` | `=0` | `=8` |
| `gal_rooms_view` | `BorderColor` | `=RGBA(245, 245, 245, 1)` | removed |

Cards become white, separated by 16px gutters, defined by the existing 1px
`AppTheme.Border`, square-cornered, with no shadow. Selection styling is unchanged: 2px
`ColorValue(AppTheme.Primary)`.

### 2. Card geometry

`lbl_textID_Desc` sets `AutoHeight: =false` and `Wrap: =false`. A description too long for
one line clips rather than overlapping the strip.

`gal_rooms_view.TemplateSize` goes `200` → `216`. `TemplateHeight` is a computed *output*
property, distinct from the `TemplateSize` input, and the `TemplatePadding: =8` added for
gutters reduces it — by 8 or by 16 depending on whether padding is applied to one edge or
both, which the control schema does not specify. At the original 200 the worst case leaves
184px of card for a 184px content stack, putting the equipment row exactly on the border.
216 guarantees at least 200px of usable card either way. If padding turns out to cost only
8, the card is 208 and simply sits slightly airier, which is closer to the reference
proportions regardless.

The card stack is re-laid on a fixed rhythm:

| Element | `Y` | `Height` |
|---|---|---|
| `lblRoomsCardStatusDot`, `lblRoomsCardStatus` | 16 | 18 |
| `lbl_textID_Card` | 44 | 26 |
| `lbl_textID_Desc` | 72 | 18 |
| `galRoomsAvailabilitySegments` | 112 | 8 |
| `lblRoomsStripStart`, `lblRoomsStripMid`, `lblRoomsStripEnd` | 124 | 14 |
| `galRoomsCardEquipment` | 160 | 24 |

Content ends at 184, inside a card of at least 200px. The three strip labels currently sit at
`Y: =126` with heights 16, 16, and 10; the 10px label clips its own `Size: =9` text. All
three become height 14 at `Y: =124`.

### 3. Duplicated capacity

`description` values already contain capacity (`"Huddle space · seats 4"`), and
`lbl_textID_Desc` appends it unconditionally, producing `"Huddle space · seats 4 · seats 4"`.
Replace the `Text` formula with a guarded form:

```powerfx
=With(
    {_d: Trim(Coalesce(ThisItem.Description, ""))},
    If(
        IsBlank(_d),
        "seats " & Text(ThisItem.Capacity),
        "seats" in Lower(_d),
        _d,
        _d & " · seats " & Text(ThisItem.Capacity)
    )
)
```

**Known data-quality issue, deliberately not fixed here.** Some descriptions also embed
equipment (`"Large boardroom · seats 14 · screen + VC"`), which then repeats in the chips
below the strip. The reference shows equipment only as chips. Correcting this means editing
the `description` values in the `Book_Rooms` SharePoint list. Pattern-matching a trailing
equipment clause out of free text would break the first time a description is reworded, so
this amendment leaves the text intact and records the cleanup as follow-up work.

### 4. Status dot

`lblRoomsCardStatus` currently renders `="● " & ThisItem.StatusText` under a single `Color`,
so the dot cannot differ from the text and the whole line reads flat.

Split into two controls at `Y: =16`:

- `lblRoomsCardStatusDot` — new. `Text: ="●"`, `Width: =12`, `X: =16`, and the existing
  `Switch(ThisItem.StatusKey, ...)` colour expression moved here verbatim.
- `lblRoomsCardStatus` — `Text: =ThisItem.StatusText`, `X: =32`,
  `Color: =AppTheme.TextSecondary`, `Width: =Parent.Width - 80`.

State stays carried by text, never by colour alone. `btn_Card.Text` continues to supply the
card's accessible name and already includes `StatusText`, so the split adds no
screen-reader noise.

### 5. Toolbar

| Control | Property | From | To |
|---|---|---|---|
| `conRoomsToolbar` | `LayoutGap` | unset | `=16` |
| `conRoomsToolbar` | `Height` | `=If(App.Width < 768, 208, 48)` | `=If(App.Width < 768, 240, 48)` |
| `txtRoomsSearch` | `Width` | `=If(App.Width < 768, Parent.Width, Parent.Width - 480)` | `=Parent.Width` |
| `txtRoomsSearch` | `FillPortions` | unset | `=If(App.Width < 768, 0, 1)` |
| `drpRoomsCapacity`, `drpRoomsSort`, `tglRoomsAvailable` | `FillPortions` | unset | `=0` |
| `tglRoomsAvailable` | `Width` | `=140` | `=200` |

The 480px search offset is already wrong and goes negative on narrow viewports; adding gaps
would make it worse. `FillPortions` lets AutoLayout absorb the remainder instead, and stays
correct if a control width changes later. `FillPortions` governs the *cross-axis* dimension,
so it must be 0 below 768px where the toolbar stacks vertically — otherwise the search box
would stretch to fill the column height.

The `240` height is required by the gap change: four 48px controls plus three 16px gaps is
240, so the existing `208` would clip the toolbar at narrow widths once `LayoutGap` applies.

### 6. Card equipment tags

`galRoomsCardEquipment.TemplateSize` `=72` → `=84`, and `lblRoomsCardEquipmentTag` gains
`Wrap: =false`. At `Size: =9` inside a 68px tag, `"Whiteboard"` currently wraps to two lines
and clips against the 20px tag height. At 84 the tag is 80px wide, which fits.

The filter-row gallery `galRoomsEquipmentFilters` is **not** changed. Its `TemplateSize: =98`
renders `"Whiteboard"` correctly today. The `"VC"` chip is wider than its content because
Power Apps horizontal galleries cannot size a template to content, but narrowing the
template to improve that would risk the same wrap defect being fixed on the card.

### 7. Typography

Every `Font: =Font.Lato` in `Src/Rooms.pa.yaml` becomes `Font: ="IBM Plex Sans"` — 26 sites:
18 in `con_rooms_view`, 5 in `con_timeline_view`, and 3 in `conRoomsSelectionBar`. The
timeline sites are included even though the timeline is otherwise untouched, because a
half-converted screen — Plex in browse, Lato in the Today view one click away — would look
more broken than either extreme.

This is the literal already used by `Src/Components/Shell_Header.pa.yaml`, not
`=CarbonFontFamily`. `CarbonFontFamily` is `"'IBM Plex Sans', 'Segoe UI', Arial"`, a CSS
font-*stack* built for SVG data-URIs; a native Canvas `Font` property expects a single font
name. `Src/Rooms.pa.yaml:1145` currently passes `=CarbonFontFamily` to a native `Font`
property and is very likely falling back silently. It moves to the same literal.

The other five screen bodies remain on `Font.Lato`. Rooms will visibly differ until they are
migrated; that migration is out of scope and is recorded as follow-up work. Whether
`"IBM Plex Sans"` resolves in the player rather than falling back cannot be settled
statically and must be confirmed in Studio.

### 8. Raw colour literals (RULES DS1)

Five sites, all inside the browse container:

| Line | Control | From | To |
|---|---|---|---|
| 252 | `gal_rooms_view.BorderColor` | `=RGBA(245, 245, 245, 1)` | removed |
| 279 | `lbl_textID_Card.BorderColor` | `=RGBA(0, 0, 0, 0)` | `=Color.Transparent` |
| 284 | `lbl_textID_Card.DisabledColor` | `=RGBA(161, 159, 157, 1)` | `=AppTheme.TextMuted` |
| 310 | `lbl_textID_Desc.BorderColor` | `=RGBA(0, 0, 0, 0)` | `=Color.Transparent` |
| 315 | `lbl_textID_Desc.DisabledColor` | `=RGBA(161, 159, 157, 1)` | `=AppTheme.TextMuted` |

`btn_Card` keeps its transparency values; these express transparency, not a themed colour,
so no token applies. `DisabledBorderColor: =RGBA(0, 0, 0, 0)` is likewise left as-is.

**Explicitly out of scope.** `con_timeline_view` contains roughly 40 further `RGBA(...)`
literals, and the screen itself sets `Fill: =RGBA(255, 255, 255, 1)` and
`LoadingSpinnerColor: =RGBA(0, 120, 212, 1)`. All are pre-existing and none affect the
browse surface. Converting them is separate work and is recorded as follow-up.

## Deliberately unchanged

- **Strip label format.** `08:00 / 13:00 / 18:00` stays 24-hour. The reference shows
  `8a / 1p / 6p`; the parent spec does not mandate a format, and 24-hour suits a UK
  business app.
- **Availability strip colours.** `AppTheme.HeaderAccent` (`#d0e2ff`) free and
  `AppTheme.TextMuted` (`#6f6f6f`) booked already match the reference.
- **"Outside booking hours · 0 available now" on every card.** Correct behaviour outside
  `DayStartHour`–`DayEndHour`, not a defect.
- **All `RoomsBrowse*` formulas, filter semantics, and the three selection actions.**

## Acceptance criteria

1. Cards render white on the page background, visually discrete, with ~16px gutters.
2. No card text overlaps the availability strip at any supported width, for the longest
   description in `Book_Rooms`.
3. No card shows a repeated `seats N`.
4. Equipment pills are visible on the card, and `"Whiteboard"` renders on one line on the
   card. The filter row is unchanged and still renders it on one line.
5. The status dot carries semantic colour; the status text is neutral and still states the
   status in words.
6. The `Available now` toggle label is not truncated, and toolbar controls are separated by
   16px at desktop width.
7. The toolbar does not clip below 768px.
8. Rooms renders in IBM Plex Sans, confirmed visually in Studio rather than inferred from
   the YAML.
9. The five `RGBA(...)` literals named in "Raw colour literals" below are replaced. The
   ~40 other literals in the file — almost all inside `con_timeline_view`, plus the
   screen-level `Fill` and `LoadingSpinnerColor` — are pre-existing, out of scope, and
   deliberately left alone.
10. Selection, Today, Week, and Book behaviour is unchanged from the parent spec.
11. Light and dark themes both remain readable.
12. `pa-lint` reports 0 errors and no increase over the 18-warning baseline;
    `pa-schema-validate` reports 0 findings; `compile_canvas` reports 0 errors.
13. App Checker shows no new issue against `docs/APP-CHECKER-BASELINE.md`.

## Follow-up work (not in this change)

- Clean equipment text out of `description` values in the `Book_Rooms` SharePoint list.
- Migrate the remaining five screen bodies and both components from `Font.Lato` to
  IBM Plex Sans.

## Delivery constraints

`Src/Rooms.pa.yaml` is the only file changed. Implementation and verification follow
RULES P1-P10, Y1-Y9, DS1, and O1-O3. Anchor edits by quoted YAML, not line numbers. The
live app is the source of truth; re-sync immediately before publishing.
