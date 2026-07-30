# Rooms Selection Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repository override:** `CLAUDE.md` and `docs/PUBLISHING-PROTOCOL.md` govern Canvas execution. Workers edit and lint a shared-baseline scratch copy, never call `compile_canvas`, and never commit. The single publisher applies reviewed diffs, holds the Canvas guard lock, publishes once, and commits in the same breath.

**Goal:** Replace the Rooms browse experience with the approved Carbon room-selection grid, filters, explicit selection actions, existing Today view, disabled Week placeholder, and existing booking modal.

**Architecture:** Shape room availability once in app-level named formulas, then bind the Rooms screen to that derived table. The existing `gal_rooms_view`, `con_timeline_view`, `btn_LoadTimeline`, and `cpt_Modal__book_rooms` remain the main integration points; the Rooms browse container gains filters, data-rich cards, an empty state, and a selection action bar.

**Tech Stack:** Power Apps Canvas YAML, Power Fx named formulas, SharePoint-backed `colRooms`/`colBookings`, IBM Carbon tokens in `AppTheme`, canvas-authoring MCP, Node.js repository validators, Git Bash Canvas guard.

## Global Constraints

- The Rooms page must not display a step indicator or “Step 1 of 3.”
- **View today** reuses the existing `con_timeline_view` and `btn_LoadTimeline`.
- **View week** exists with `DisplayMode.Disabled` and no state-changing `OnSelect`.
- **Book** opens `cpt_Modal__book_rooms` with `varSelectedRoom` populated and `varSelectedDate`, `varStartTime`, and `varEndTime` blank.
- Do not create a new screen, Canvas component, SharePoint column, list, connector, or room taxonomy.
- Do not modify `Src/Find.pa.yaml` or `Src/Components/cpt_Modal_.pa.yaml`.
- Do not change booking persistence, conflict detection, privacy masking, or Today free-slot booking.
- Use `AppTheme`, `ThemeHex`, and `CarbonFontFamily`; do not add raw colours to the new UI.
- Preserve the existing light and dark themes.
- Derived room data remains formula-driven; do not snapshot it into a browse collection.
- Follow RULES P1-P10, Y1-Y9, DS1, and O1-O3.
- The live Canvas app is the source of truth. Always sync a new scratch baseline before editing or publishing.
- App ID: `498d4962-0b5f-4990-a400-1bf5de9a367c`.
- Environment ID: `Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd`.
- Login hint: `harry@harry-burton.ai`.

---

## File Map

- Modify `Src/App.pa.yaml`: global filter defaults and the room-browse named formulas.
- Modify `Src/Rooms.pa.yaml`: browse-state initialization, toolbar, cards, availability strip, empty state, selection bar, Today action, disabled Week action, and Book action.
- Read-only reference `Src/Find.pa.yaml`: existing capacity/equipment filter conventions only.
- Read-only reference `Src/Components/cpt_Modal_.pa.yaml`: existing modal host-state contract only.
- Read-only reference `docs/superpowers/specs/2026-07-30-rooms-selection-redesign-design.md`: approved behaviour and acceptance criteria.

## Execution Topology

The implementation uses one synced base and one working scratch copy:

```powershell
$repoRoot = 'C:\Users\harry\Documents\dev\power-apps\booking-tool'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$baseDir = Join-Path $repoRoot ('.scratch\rooms-selection-base-' + $stamp)
$workDir = Join-Path $repoRoot ('.scratch\rooms-selection-work-' + $stamp)
New-Item -ItemType Directory -Path $baseDir,$workDir | Out-Null
```

After `connect`, call `sync_canvas` with `$baseDir`'s printed absolute path. Copy that complete base to `$workDir` using native PowerShell:

```powershell
Get-ChildItem -Force -LiteralPath $baseDir | Copy-Item -Destination $workDir -Recurse
```

All task edits occur in `$workDir`. Workers report unified diffs against `$baseDir`. The publisher applies reviewed diffs to a fresh publish scratch directory and copies the final `App.pa.yaml` and `Rooms.pa.yaml` into `Src` only after a successful publish.

---

### Task 1: Establish the live baseline and fail-first contracts

**Files:**
- Inspect: `Src/App.pa.yaml`
- Inspect: `Src/Rooms.pa.yaml`
- Generate outside git: `$baseDir/**/*.pa.yaml`
- Generate outside git: `$workDir/**/*.pa.yaml`

**Interfaces:**
- Consumes: the live Canvas app IDs in Global Constraints.
- Produces: one immutable synced base, one byte-identical working copy, and baseline validator evidence.

- [ ] **Step 1: Connect and sync the live app**

Call `connect` before any other canvas-authoring operation:

```json
{
  "environment_id": "Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd",
  "app_id": "498d4962-0b5f-4990-a400-1bf5de9a367c",
  "login_hint": "harry@harry-burton.ai"
}
```

Call `sync_canvas` with the absolute `$baseDir` created in Execution Topology, then copy the base to `$workDir`.

- [ ] **Step 2: Detect live-to-git drift before feature work**

Run:

```powershell
git diff --no-index -- Src\App.pa.yaml (Join-Path $baseDir 'App.pa.yaml')
git diff --no-index -- Src\Rooms.pa.yaml (Join-Path $baseDir 'Rooms.pa.yaml')
```

Expected: both commands produce no diff. If either differs, stop feature work, copy the complete live sync into `Src`, review the live changes, and create the required opening reconciliation commit:

```powershell
Get-ChildItem -Force -LiteralPath $baseDir | Copy-Item -Destination (Join-Path $repoRoot 'Src') -Recurse -Force
git add -- Src
git commit -m "sync(canvas): reconcile live before rooms redesign (P5)"
```

Create a new base and work directory after reconciliation; do not continue from the stale directories.

- [ ] **Step 3: Record baseline validation**

Run:

```powershell
node tools/pa-lint/lint.js --src $baseDir --json
node tools/pa-schema-validate/validate.js --src $baseDir --json
```

Expected:

- pa-lint: 0 errors; the known warning baseline may remain.
- pa-schema-validate: 0 findings.

- [ ] **Step 4: Run a fail-first feature contract**

Run:

```powershell
$appSource = Get-Content -Raw (Join-Path $workDir 'App.pa.yaml')
$roomsSource = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
$missing = @(
  'RoomsBrowseBase =',
  'RoomsBrowseData =',
  'txtRoomsSearch:',
  'galRoomsAvailabilitySegments:',
  'conRoomsSelectionBar:',
  'btnRoomsViewWeek:'
) | Where-Object { ($appSource + $roomsSource) -notmatch [regex]::Escape($_) }
if ($missing.Count -eq 0) { throw 'Fail-first contract unexpectedly passed before implementation.' }
$missing
```

Expected: all six feature anchors are reported missing.

- [ ] **Step 5: Preserve the baseline hash for worker reports**

Run:

```powershell
Get-FileHash (Join-Path $baseDir 'App.pa.yaml'),(Join-Path $baseDir 'Rooms.pa.yaml') -Algorithm SHA256
```

Record both hashes in every worker READY report.

---

### Task 2: Add room-browse state and derived data

**Files:**
- Modify in scratch: `$workDir/App.pa.yaml`
- Mirror after publisher approval: `Src/App.pa.yaml`

**Interfaces:**
- Consumes: `colRooms`, `TodayBookings`, `TodayWindowStart`, `TodayWindowEnd`, `varNowTick`, and `fnOverlaps`.
- Produces:
  - `RoomsBrowseBase: Table`
  - `RoomsBrowseData: Table`
  - `RoomsBrowseTotalCount: Number`
  - `RoomsBrowseFilteredCount: Number`
  - `RoomsBrowseAvailableCount: Number`
  - globals `gblRoomsSearch`, `gblRoomsMinCapacity`, `gblRoomsSort`, `gblRoomsAvailableOnly`
  - typed selection collection `colRoomsEquipmentFilter`

- [ ] **Step 1: Run the derived-data fail-first assertion**

Run:

```powershell
$appSource = Get-Content -Raw (Join-Path $workDir 'App.pa.yaml')
@('RoomsBrowseBase =','RoomsBrowseData =','RoomsBrowseAvailableCount =') |
  ForEach-Object {
    if ($appSource -match [regex]::Escape($_)) { throw "Unexpected pre-existing formula: $_" }
  }
```

Expected: exit 0 because none of the three formulas exists.

- [ ] **Step 2: Add global filter defaults to `App.OnStart`**

Anchor immediately after:

```powerfx
Set(varFindEquipment, "Any");
```

Insert:

```powerfx
Set(gblRoomsSearch, "");
Set(gblRoomsMinCapacity, 0);
Set(gblRoomsSort, "Name");
Set(gblRoomsAvailableOnly, false);
ClearCollect(
    colRoomsEquipmentFilter,
    Filter(Table({Value: ""}), false)
);
```

Keep the existing `Set(gblEditingBookingID, 0);` after this block.

- [ ] **Step 3: Add `RoomsBrowseBase` to `App.Formulas`**

Anchor after the existing `FindRooms = Filter(...)` formula and before the sandbox mock-data heading. Insert:

```powerfx
RoomsBrowseBase =
    ForAll(
        colRooms As _room,
        With(
            {
                _bookings: Sort(
                    Filter(TodayBookings, RoomID.Id = _room.ID),
                    StartDateTime,
                    SortOrder.Ascending
                )
            },
            With(
                {
                    _current: LookUp(
                        _bookings,
                        StartDateTime <= varNowTick && EndDateTime > varNowTick
                    ),
                    _next: First(
                        Filter(_bookings, StartDateTime > varNowTick)
                    )
                },
                {
                    ID: _room.ID,
                    RoomID: _room.RoomID,
                    Title: _room.Title,
                    Description: _room.description,
                    Capacity: _room.Capacity,
                    Equipment: Coalesce(_room.Equipment, ""),
                    StatusKey: If(
                        varNowTick < TodayWindowStart || varNowTick >= TodayWindowEnd,
                        "OutsideHours",
                        !IsBlank(_current),
                        "Busy",
                        IsBlank(_next),
                        "FreeAllDay",
                        "Free"
                    ),
                    StatusText: If(
                        varNowTick < TodayWindowStart || varNowTick >= TodayWindowEnd,
                        "Outside booking hours",
                        !IsBlank(_current),
                        "Busy until " & Text(_current.EndDateTime, "HH:mm"),
                        IsBlank(_next),
                        "Free all day",
                        "Free until " & Text(_next.StartDateTime, "HH:mm")
                    ),
                    IsAvailableNow:
                        varNowTick >= TodayWindowStart &&
                        varNowTick < TodayWindowEnd &&
                        IsBlank(_current),
                    BookedMinutes: Sum(
                        ForAll(
                            _bookings As _booking,
                            {
                                Minutes: Max(
                                    0,
                                    DateDiff(
                                        If(_booking.StartDateTime > TodayWindowStart, _booking.StartDateTime, TodayWindowStart),
                                        If(_booking.EndDateTime < TodayWindowEnd, _booking.EndDateTime, TodayWindowEnd),
                                        TimeUnit.Minutes
                                    )
                                )
                            }
                        ),
                        Minutes
                    ),
                    TodayRoomBookings: ForAll(
                        _bookings As _booking,
                        {
                            StartDateTime: _booking.StartDateTime,
                            EndDateTime: _booking.EndDateTime
                        }
                    )
                }
            )
        )
    );
```

The nested `TodayRoomBookings` table contains times only, so the card surface cannot expose private titles or organisers.

- [ ] **Step 4: Add filtered/sorted formulas**

Insert immediately after `RoomsBrowseBase`:

```powerfx
RoomsBrowseData =
    With(
        {
            _needle: Lower(Trim(gblRoomsSearch))
        },
        With(
            {
                _filtered: Filter(
                    RoomsBrowseBase As _room,
                    IsBlank(_needle) ||
                        _needle in Lower(_room.Title) ||
                        _needle in Lower(_room.Description) ||
                        _needle in Lower(_room.Equipment),
                    _room.Capacity >= gblRoomsMinCapacity,
                    !gblRoomsAvailableOnly || _room.IsAvailableNow,
                    CountRows(
                        Filter(
                            colRoomsEquipmentFilter As _required,
                            !(Lower(_required.Value) in Lower(_room.Equipment))
                        )
                    ) = 0
                )
            },
            Switch(
                gblRoomsSort,
                "Capacity: smallest",
                    Sort(_filtered, Capacity, SortOrder.Ascending),
                "Capacity: largest",
                    Sort(_filtered, Capacity, SortOrder.Descending),
                Sort(_filtered, Title, SortOrder.Ascending)
            )
        )
    );

RoomsBrowseTotalCount = CountRows(colRooms);
RoomsBrowseFilteredCount = CountRows(RoomsBrowseData);
RoomsBrowseAvailableCount = CountRows(Filter(RoomsBrowseData, IsAvailableNow));
```

- [ ] **Step 5: Run the derived-data contract**

Run:

```powershell
$appSource = Get-Content -Raw (Join-Path $workDir 'App.pa.yaml')
$required = @(
  'RoomsBrowseBase =',
  'RoomsBrowseData =',
  'RoomsBrowseTotalCount =',
  'RoomsBrowseFilteredCount =',
  'RoomsBrowseAvailableCount =',
  'Set(gblRoomsSearch, "")',
  'colRoomsEquipmentFilter'
)
$missing = $required | Where-Object { $appSource -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing App anchors: ' + ($missing -join ', ')) }
```

Expected: exit 0.

- [ ] **Step 6: Validate Task 2**

Run:

```powershell
node tools/pa-lint/lint.js --src $workDir --json
node tools/pa-schema-validate/validate.js --src $workDir --json
```

Expected: 0 lint errors, no new warnings attributable to `App.pa.yaml`, and 0 schema findings.

- [ ] **Step 7: Report the Task 2 checkpoint**

Workers report:

```text
STATUS: READY
FILES:  App.pa.yaml
LINT:   0 errors; no new warnings
DIFF:   unified diff of App.pa.yaml against the shared base
UNVERIFIED: Power Fx compile and runtime values require the publisher and Studio
```

The publisher reviews this diff but does not publish or commit yet.

---

### Task 3: Build the heading and filter toolbar

**Files:**
- Modify in scratch: `$workDir/Rooms.pa.yaml`
- Mirror after publisher approval: `Src/Rooms.pa.yaml`

**Interfaces:**
- Consumes: globals and counts produced by Task 2.
- Produces: filter controls `txtRoomsSearch`, `drpRoomsCapacity`, `drpRoomsSort`, `tglRoomsAvailable`, `galRoomsEquipmentFilters`, and a resettable Browse state.

- [ ] **Step 1: Update `Rooms.OnVisible`**

Replace the formula anchored by:

```yaml
OnVisible: |+
  =UpdateContext({varShowTimeline: false});
```

with:

```powerfx
=UpdateContext({varShowTimeline: false});
Set(varSelectedRoom, Blank());
Set(varNowTick, Now());
Set(gblRoomsSearch, "");
Set(gblRoomsMinCapacity, 0);
Set(gblRoomsSort, "Name");
Set(gblRoomsAvailableOnly, false);
ClearCollect(
    colRoomsEquipmentFilter,
    Filter(Table({Value: ""}), false)
)
```

Keep this as a block scalar because it is a multi-statement behaviour formula.

- [ ] **Step 2: Add the browse heading**

Inside `con_rooms_view`, before `gal_rooms_view`, add an AutoLayout horizontal container named `conRoomsHeading` with:

```yaml
Properties:
  FillPortions: =0
  Height: =64
  LayoutAlignItems: =LayoutAlignItems.Center
  LayoutDirection: =LayoutDirection.Horizontal
  Width: =Parent.Width
```

Add:

```yaml
- lblRoomsHeading:
    Control: Label
    Properties:
      Color: =AppTheme.TextPrimary
      FillPortions: =1
      Font: =Font.Lato
      FontWeight: =FontWeight.Semibold
      Size: =20
      Text: ="Choose a room"
- lblRoomsResultSummary:
    Control: Label
    Properties:
      Align: =Align.Right
      Color: =AppTheme.TextSecondary
      Font: =Font.Lato
      Size: =11
      Text: =RoomsBrowseFilteredCount & " of " & RoomsBrowseTotalCount & " rooms · " & RoomsBrowseAvailableCount & " available now"
      Width: =300
```

Do not add any step text.

- [ ] **Step 3: Add responsive search and filters**

Add `conRoomsToolbar` after `conRoomsHeading`:

```yaml
Properties:
  FillPortions: =0
  Height: =If(App.Width < 768, 208, 48)
  LayoutAlignItems: =LayoutAlignItems.Center
  LayoutDirection: =If(App.Width < 768, LayoutDirection.Vertical, LayoutDirection.Horizontal)
  LayoutGap: =0
  Width: =Parent.Width
```

Add `txtRoomsSearch`:

```yaml
Control: Classic/TextInput
Properties:
  AccessibleLabel: ="Search rooms and equipment"
  BorderColor: =AppTheme.Border
  BorderThickness: =0
  Color: =AppTheme.TextPrimary
  Default: =gblRoomsSearch
  DelayOutput: =true
  Fill: =AppTheme.layer01Bg
  FocusedBorderColor: =ColorValue(AppTheme.Primary)
  FocusedBorderThickness: =2
  Font: =Font.Lato
  Height: =48
  HintText: ="Search rooms and equipment"
  HoverBorderColor: =AppTheme.TextSecondary
  OnChange: =Set(gblRoomsSearch, Self.Text)
  RadiusBottomLeft: =0
  RadiusBottomRight: =0
  RadiusTopLeft: =0
  RadiusTopRight: =0
  Size: =11
  Width: =If(App.Width < 768, Parent.Width, Parent.Width - 480)
```

Add `drpRoomsCapacity`:

```yaml
Control: Classic/DropDown
Properties:
  AccessibleLabel: ="Filter by room capacity"
  BorderColor: =AppTheme.Border
  BorderThickness: =0
  ChevronBackground: =AppTheme.layer01Bg
  ChevronFill: =AppTheme.TextPrimary
  Color: =AppTheme.TextPrimary
  Default: ="Any size"
  Fill: =AppTheme.layer01Bg
  FocusedBorderColor: =ColorValue(AppTheme.Primary)
  FocusedBorderThickness: =2
  Font: =Font.Lato
  Height: =48
  Items: =["Any size","4+","8+","14+","20+"]
  Items.Value: =Value
  OnChange: =Set(gblRoomsMinCapacity, Switch(Self.Selected.Value, "4+", 4, "8+", 8, "14+", 14, "20+", 20, 0))
  Size: =11
  Width: =160
```

Add `drpRoomsSort`:

```yaml
Control: Classic/DropDown
Properties:
  AccessibleLabel: ="Sort rooms"
  BorderColor: =AppTheme.Border
  BorderThickness: =0
  ChevronBackground: =AppTheme.layer01Bg
  ChevronFill: =AppTheme.TextPrimary
  Color: =AppTheme.TextPrimary
  Default: ="Name"
  Fill: =AppTheme.layer01Bg
  FocusedBorderColor: =ColorValue(AppTheme.Primary)
  FocusedBorderThickness: =2
  Font: =Font.Lato
  Height: =48
  Items: =["Name","Capacity: smallest","Capacity: largest"]
  Items.Value: =Value
  OnChange: =Set(gblRoomsSort, Self.Selected.Value)
  Size: =11
  Width: =180
```

Add `tglRoomsAvailable`:

```yaml
Control: Toggle
Properties:
  Checked: =gblRoomsAvailableOnly
  DisplayMode: =DisplayMode.Edit
  Height: =48
  Label: ="Available now"
  OnCheck: =Set(gblRoomsAvailableOnly, true)
  OnUncheck: =Set(gblRoomsAvailableOnly, false)
  Width: =140
```

- [ ] **Step 4: Add multi-select equipment tags**

Add `conRoomsEquipmentFilters` below the toolbar:

```yaml
Control: GroupContainer
Variant: AutoLayout
Properties:
  FillPortions: =0
  Height: =40
  LayoutAlignItems: =LayoutAlignItems.Center
  LayoutDirection: =LayoutDirection.Horizontal
  LayoutGap: =8
  Width: =Parent.Width
```

Add its label:

```yaml
- lblRoomsEquipmentHeading:
    Control: Label
    Properties:
      Color: =AppTheme.TextMuted
      Font: =Font.Lato
      Height: =24
      Size: =9
      Text: ="Equipment"
      Width: =80
```

Add a horizontal gallery `galRoomsEquipmentFilters`:

```yaml
Control: Gallery
Variant: Horizontal
Properties:
  FillPortions: =1
  Height: =32
  Items: |-
    =Table(
        {Value: "Screen"},
        {Value: "VC"},
        {Value: "Whiteboard"},
        {Value: "Projector"}
    )
  ShowScrollbar: =false
  TemplatePadding: =2
  TemplateSize: =96
```

Add a `Classic/Button` named `btnRoomsEquipmentFilter` to the gallery template:

```yaml
Properties:
  BorderColor: =If(ThisItem.Value in colRoomsEquipmentFilter.Value, ColorValue(AppTheme.Primary), AppTheme.Border)
  BorderThickness: =1
  Color: =If(ThisItem.Value in colRoomsEquipmentFilter.Value, ColorValue(AppTheme.PrimaryText), AppTheme.TextPrimary)
  Fill: =If(ThisItem.Value in colRoomsEquipmentFilter.Value, ColorValue(AppTheme.ButtonPrimary), AppTheme.SurfaceAlt)
  FocusedBorderColor: =ColorValue(AppTheme.Primary)
  FocusedBorderThickness: =2
  Font: =Font.Lato
  Height: =24
  OnSelect: |-
    =If(
        ThisItem.Value in colRoomsEquipmentFilter.Value,
        RemoveIf(colRoomsEquipmentFilter, Value = ThisItem.Value),
        Collect(colRoomsEquipmentFilter, {Value: ThisItem.Value})
    )
  RadiusBottomLeft: =12
  RadiusBottomRight: =12
  RadiusTopLeft: =12
  RadiusTopRight: =12
  Size: =10
  Text: =ThisItem.Value
  Width: =Parent.TemplateWidth - 4
```

The button's `Text` supplies its accessible name; do not add `AccessibleLabel` to a Classic button (RULES Y4).

- [ ] **Step 5: Run the toolbar contract**

Run:

```powershell
$roomsSource = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
$required = @(
  'lblRoomsHeading:',
  'Text: ="Choose a room"',
  'txtRoomsSearch:',
  'DelayOutput: =true',
  'drpRoomsCapacity:',
  'drpRoomsSort:',
  'tglRoomsAvailable:',
  'galRoomsEquipmentFilters:'
)
$missing = $required | Where-Object { $roomsSource -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing toolbar anchors: ' + ($missing -join ', ')) }
if ($roomsSource -match 'Step 1 of 3') { throw 'Rooms must not contain stepper copy.' }
```

Expected: exit 0.

- [ ] **Step 6: Validate Task 3**

Run both validators against `$workDir`. Expected: 0 errors, 0 schema findings, and the same 17 known warnings as the baseline.

- [ ] **Step 7: Report the Task 3 checkpoint**

Report a unified `Rooms.pa.yaml` diff with `LINT: 0 errors; no unexplained new warnings`. Do not compile or commit.

---

### Task 4: Rebuild the cards and explicit selection state

**Files:**
- Modify in scratch: `$workDir/Rooms.pa.yaml`
- Mirror after publisher approval: `Src/Rooms.pa.yaml`

**Interfaces:**
- Consumes: `RoomsBrowseData` and its shaped fields from Task 2.
- Produces: responsive cards, privacy-safe 30-minute availability segments, equipment tags, and `varSelectedRoom` selection/deselection.

- [ ] **Step 1: Rebind and resize `gal_rooms_view`**

Change the existing gallery:

```yaml
Control: Gallery
Variant: Vertical
Properties:
  Items: =RoomsBrowseData
  TemplatePadding: =0
  TemplateSize: =200
  Visible: =!IsEmpty(RoomsBrowseData)
  WrapCount: =If(App.Width >= 1200, 4, App.Width >= 768, 2, 1)
```

Keep `AlignInContainer`, `Height`, and `Width` bound to the parent. Remove the old `Items: =colRooms` and fixed `WrapCount: =2`.

- [ ] **Step 2: Turn `con_tile_view` into the Carbon card surface**

Retain the existing control name and ManualLayout variant. Set:

```yaml
Properties:
  BorderColor: =If(!IsBlank(varSelectedRoom) && varSelectedRoom.ID = ThisItem.ID, ColorValue(AppTheme.Primary), AppTheme.Border)
  BorderThickness: =If(!IsBlank(varSelectedRoom) && varSelectedRoom.ID = ThisItem.ID, 2, 1)
  DropShadow: =DropShadow.None
  Fill: =AppTheme.layer01Bg
  Height: =Parent.TemplateHeight
  RadiusBottomLeft: =0
  RadiusBottomRight: =0
  RadiusTopLeft: =0
  RadiusTopRight: =0
  Width: =Parent.TemplateWidth
```

Delete the old full-card `img_Card` SVG control. Reuse `lbl_textID_Card` for the room name and `lbl_textID_Desc` for description/capacity rather than adding duplicate labels.

- [ ] **Step 3: Reconfigure the existing title and description labels**

`lbl_textID_Card`:

```yaml
Properties:
  Color: =AppTheme.TextPrimary
  Font: =Font.Lato
  FontWeight: =FontWeight.Semibold
  Height: =26
  Size: =14
  Text: =ThisItem.Title
  Visible: =true
  Width: =Parent.Width - 32
  X: =16
  Y: =42
```

`lbl_textID_Desc`:

```yaml
Properties:
  Color: =AppTheme.TextSecondary
  Font: =Font.Lato
  Height: =20
  Size: =11
  Text: |-
    =With(
        {_description: Coalesce(ThisItem.Description, "")},
        _description &
        If(!IsBlank(_description), " · ", "") &
        "seats " & Text(ThisItem.Capacity)
    )
  Visible: =true
  Width: =Parent.Width - 32
  X: =16
  Y: =68
```

- [ ] **Step 4: Add textual status and selected indicator**

Add `lblRoomsCardStatus`:

```yaml
Properties:
  Color: =Switch(ThisItem.StatusKey, "Busy", AppTheme.TextMuted, "OutsideHours", AppTheme.TextMuted, AppTheme.StatusFreeText)
  Font: =Font.Lato
  Height: =20
  Size: =10
  Text: ="● " & ThisItem.StatusText
  Width: =Parent.Width - 64
  X: =16
  Y: =14
```

Add `lblRoomsSelectedCheck`:

```yaml
Properties:
  Align: =Align.Center
  Color: =ColorValue(AppTheme.PrimaryText)
  Fill: =ColorValue(AppTheme.ButtonPrimary)
  Font: =Font.Lato
  FontWeight: =FontWeight.Semibold
  Height: =24
  RadiusBottomLeft: =12
  RadiusBottomRight: =12
  RadiusTopLeft: =12
  RadiusTopRight: =12
  Size: =11
  Text: ="✓"
  Visible: =!IsBlank(varSelectedRoom) && varSelectedRoom.ID = ThisItem.ID
  Width: =24
  X: =Parent.Width - 36
  Y: =12
```

The status text, not the dot colour, carries the semantic state.

- [ ] **Step 5: Add the 30-minute availability strip**

Add a horizontal gallery `galRoomsAvailabilitySegments` with:

```yaml
Properties:
  Height: =8
  Items: |-
    =With(
        {_roomBookings: ThisItem.TodayRoomBookings},
        ForAll(
            Sequence((DayEndHour - DayStartHour) * 2) As _slot,
            With(
                {
                    _start: DateAdd(
                        TodayWindowStart,
                        (_slot.Value - 1) * 30,
                        TimeUnit.Minutes
                    )
                },
                {
                    SlotStart: _start,
                    SlotEnd: DateAdd(_start, 30, TimeUnit.Minutes),
                    IsBooked: !IsBlank(
                        LookUp(
                            _roomBookings,
                            fnOverlaps(
                                StartDateTime,
                                EndDateTime,
                                _start,
                                DateAdd(_start, 30, TimeUnit.Minutes)
                            )
                        )
                    )
                }
            )
        )
    )
  ShowScrollbar: =false
  TemplatePadding: =1
  TemplateSize: =(Self.Width / ((DayEndHour - DayStartHour) * 2))
  Width: =Parent.Width - 32
  X: =16
  Y: =104
```

Add `rectRoomsAvailabilitySegment` inside its template:

```yaml
Control: Rectangle
Properties:
  Fill: =If(ThisItem.IsBooked, AppTheme.TextMuted, AppTheme.HeaderAccent)
  Height: =Parent.Height
  Width: =Parent.TemplateWidth - 2
```

Add three decorative time labels below the strip:

```powerfx
Text(TodayWindowStart, "HH:mm")
Text(DateAdd(TodayWindowStart, WorkingDayMinutes / 2, TimeUnit.Minutes), "HH:mm")
Text(TodayWindowEnd, "HH:mm")
```

Name them `lblRoomsStripStart`, `lblRoomsStripMid`, and `lblRoomsStripEnd`; align start, centre, and end respectively.

- [ ] **Step 6: Add card equipment tags**

Add a horizontal gallery `galRoomsCardEquipment`:

```yaml
Properties:
  Height: =24
  Items: |-
    =With(
        {_equipmentText: ThisItem.Equipment},
        Filter(
            Table(
                {Value: "Screen"},
                {Value: "VC"},
                {Value: "Whiteboard"},
                {Value: "Projector"}
            ),
            Lower(Value) in Lower(_equipmentText)
        )
    )
  ShowScrollbar: =false
  TemplatePadding: =2
  TemplateSize: =72
  Width: =Parent.Width - 32
  X: =16
  Y: =156
```

Add `lblRoomsCardEquipmentTag`:

```yaml
Properties:
  Align: =Align.Center
  Color: =AppTheme.TextSecondary
  Fill: =AppTheme.SurfaceAlt
  Font: =Font.Lato
  Height: =20
  RadiusBottomLeft: =10
  RadiusBottomRight: =10
  RadiusTopLeft: =10
  RadiusTopRight: =10
  Size: =9
  Text: =ThisItem.Value
  Width: =Parent.TemplateWidth - 4
```

- [ ] **Step 7: Change `btn_Card` from navigation to selection**

Replace its existing `OnSelect` with:

```powerfx
=If(
    !IsBlank(varSelectedRoom) && varSelectedRoom.ID = ThisItem.ID,
    Set(varSelectedRoom, Blank()),
    Set(varSelectedRoom, LookUp(colRooms, ID = ThisItem.ID))
)
```

Set its text, which is the Classic button's accessible name:

```powerfx
=If(
    !IsBlank(varSelectedRoom) && varSelectedRoom.ID = ThisItem.ID,
    "Deselect ",
    "Select "
) &
ThisItem.Title &
", capacity " & Text(ThisItem.Capacity) &
", " & ThisItem.StatusText
```

Keep the overlay transparent with `Color.Transparent`, use `ColorValue(AppTheme.Primary)` for its focused border, and keep it as the final child so the whole card is operable.

- [ ] **Step 8: Run the card contract**

Run:

```powershell
$roomsSource = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
$required = @(
  'Items: =RoomsBrowseData',
  'galRoomsAvailabilitySegments:',
  'rectRoomsAvailabilitySegment:',
  'galRoomsCardEquipment:',
  'lblRoomsSelectedCheck:',
  'Set(varSelectedRoom, LookUp(colRooms, ID = ThisItem.ID))'
)
$missing = $required | Where-Object { $roomsSource -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing card anchors: ' + ($missing -join ', ')) }
if ($roomsSource -match 'UpdateContext\\(\\{varShowTimeline: true\\}\\).*Set\\(varSelectedRoom, ThisItem\\)') {
  throw 'Card activation still contains immediate Today navigation.'
}
```

Expected: exit 0.

- [ ] **Step 9: Validate and report Task 4**

Run both validators. Report the card diff, validator output, and `UNVERIFIED: nested-gallery runtime rendering and keyboard focus require Studio`.

---

### Task 5: Add the empty state and selected-room actions

**Files:**
- Modify in scratch: `$workDir/Rooms.pa.yaml`
- Mirror after publisher approval: `Src/Rooms.pa.yaml`

**Interfaces:**
- Consumes: `varSelectedRoom`, Task 2 filter state, existing `varShowTimeline`, existing `btn_LoadTimeline`, and existing modal host globals.
- Produces: clear-filters action, fixed selection bar, Today transition, disabled Week placeholder, and modal launch with blank date/time.

- [ ] **Step 1: Add the filtered empty state**

Add `conRoomsEmptyState` as a sibling after `gal_rooms_view`:

```yaml
Properties:
  FillPortions: =1
  LayoutAlignItems: =LayoutAlignItems.Center
  LayoutDirection: =LayoutDirection.Vertical
  LayoutJustifyContent: =LayoutJustifyContent.Center
  Visible: =IsEmpty(RoomsBrowseData)
  Width: =Parent.Width
```

Add `lblRoomsNoMatches` with `Text: ="No rooms match these filters"` and a `Classic/Button` named `btnRoomsClearFilters` with:

```powerfx
=Set(gblRoomsSearch, "");
Set(gblRoomsMinCapacity, 0);
Set(gblRoomsSort, "Name");
Set(gblRoomsAvailableOnly, false);
ClearCollect(
    colRoomsEquipmentFilter,
    Filter(Table({Value: ""}), false)
);
Reset(txtRoomsSearch);
Reset(drpRoomsCapacity);
Reset(drpRoomsSort);
Reset(tglRoomsAvailable)
```

Set the button text to **Clear filters** and style it as a Carbon tertiary action using theme tokens.

- [ ] **Step 2: Add `conRoomsSelectionBar`**

Add it as the last sibling after `con_timeline_view` so its logical reading order follows the cards:

```yaml
Properties:
  BorderColor: =AppTheme.Border
  BorderThickness: =1
  Fill: =AppTheme.Surface
  FillPortions: =0
  Height: =If(App.Width < 768, 152, 64)
  LayoutAlignItems: =LayoutAlignItems.Center
  LayoutDirection: =If(App.Width < 768, LayoutDirection.Vertical, LayoutDirection.Horizontal)
  PaddingLeft: =32
  PaddingRight: =32
  Visible: =!varShowTimeline && !IsBlank(varSelectedRoom)
  Width: =Parent.Width
```

Add `lblRoomsSelectedSummary`:

```powerfx
=varSelectedRoom.Title &
" · seats " & Text(varSelectedRoom.Capacity) &
If(IsBlank(varSelectedRoom.description), "", " · " & varSelectedRoom.description)
```

Give the summary `FillPortions: =1`, Carbon text tokens, and IBM Plex font.

- [ ] **Step 3: Add **View today****

Add a `Classic/Button` named `btnRoomsViewToday`:

```yaml
Properties:
  BorderColor: =ColorValue(AppTheme.ButtonTertiary)
  BorderThickness: =1
  Color: =ColorValue(AppTheme.ButtonTertiary)
  Fill: =Color.Transparent
  FocusedBorderColor: =ColorValue(AppTheme.Primary)
  FocusedBorderThickness: =2
  Font: =Font.Lato
  Height: =48
  OnSelect: |-
    =Set(glbSelectedDate, Today());
    UpdateContext({varShowTimeline: true});
    Select(btn_LoadTimeline)
  Text: ="View today"
  Width: =144
```

Update the existing `btnBackToRooms.OnSelect` to refresh card status while preserving selection:

```powerfx
=Set(varNowTick, Now());
UpdateContext({varShowTimeline: false})
```

- [ ] **Step 4: Add disabled **View week****

Add `btnRoomsViewWeek`:

```yaml
Control: Classic/Button
Properties:
  BorderColor: =AppTheme.Border
  BorderThickness: =1
  Color: =ColorValue(AppTheme.ButtonDisabledText)
  DisabledBorderColor: =AppTheme.Border
  DisabledColor: =ColorValue(AppTheme.ButtonDisabledText)
  DisabledFill: =ColorValue(AppTheme.ButtonDisabled)
  DisplayMode: =DisplayMode.Disabled
  Fill: =ColorValue(AppTheme.ButtonDisabled)
  Font: =Font.Lato
  Height: =48
  OnSelect: =Blank()
  Text: ="View week"
  Tooltip: ="Week view is not available yet"
  Width: =144
```

`Text` is its accessible name. It must not set a view variable, navigate, or show a notification.

- [ ] **Step 5: Add **Book****

Add `btnRoomsBook`:

```yaml
Control: Classic/Button
Properties:
  BorderColor: =ColorValue(AppTheme.ButtonPrimary)
  BorderThickness: =1
  Color: =ColorValue(AppTheme.PrimaryText)
  Fill: =ColorValue(AppTheme.ButtonPrimary)
  FocusedBorderColor: =ColorValue(AppTheme.Primary)
  FocusedBorderThickness: =2
  Font: =Font.Lato
  Height: =48
  OnSelect: |-
    =Set(varSelectedDate, Blank());
    Set(varStartTime, Blank());
    Set(varEndTime, Blank());
    Set(varTitle, Blank());
    Set(varConflict, false);
    Set(varBookingError, false);
    Set(varSubmitting, false);
    Set(varTitleTouched, false);
    Set(gbl_UI_Book_CancelConfirm, false);
    Set(gbl_Book_SubmitResult, "");
    Set(varConflictingBooking, Blank());
    Set(varNextFreeSlot, Blank());
    Set(gblEditingBookingID, 0);
    ClearCollect(varAlternativeRooms, Filter(colRooms, false));
    Set(gbl_UI_Book_Modal_Step, WizardStep2);
    Set(gbl_UI_Book_Modal, true)
  Text: ="Book"
  Width: =144
```

`WizardStep2` is the existing modal's internal room-preselected entry state. No stepper is added to the Rooms page.

- [ ] **Step 6: Run action contracts**

Run:

```powershell
$roomsSource = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
$required = @(
  'conRoomsEmptyState:',
  'Text: ="No rooms match these filters"',
  'conRoomsSelectionBar:',
  'btnRoomsViewToday:',
  'btnRoomsViewWeek:',
  'DisplayMode: =DisplayMode.Disabled',
  'OnSelect: =Blank()',
  'btnRoomsBook:',
  'Set(varSelectedDate, Blank())',
  'Set(varStartTime, Blank())',
  'Set(varEndTime, Blank())',
  'Set(gbl_UI_Book_Modal, true)'
)
$missing = $required | Where-Object { $roomsSource -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing action anchors: ' + ($missing -join ', ')) }
if ($roomsSource -match 'Navigate\\([^\\r\\n]*Week') { throw 'Week placeholder must not navigate.' }
```

Expected: exit 0.

- [ ] **Step 7: Run responsive and accessibility static checks**

Run:

```powershell
$required = @(
  'WrapCount: =If(App.Width >= 1200, 4, App.Width >= 768, 2, 1)',
  'DelayOutput: =true',
  'FocusedBorderColor: =ColorValue(AppTheme.Primary)',
  'Tooltip: ="Week view is not available yet"',
  '"Deselect "',
  '"Select "'
)
$missing = $required | Where-Object { $roomsSource -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing responsive/accessibility anchors: ' + ($missing -join ', ')) }
```

Expected: exit 0.

- [ ] **Step 8: Validate and report Task 5**

Run both validators. The READY report must explicitly state:

```text
WEEK: disabled; OnSelect is Blank()
BOOK: room retained; date/start/end blanked before modal visible
TODAY: reuses btn_LoadTimeline; back preserves room selection
LINT: 0 errors; no unexplained new warnings
```

---

### Task 6: Integrate, publish once, and verify

**Files:**
- Publish from: a fresh publisher scratch directory based on a new `sync_canvas`
- Commit: `Src/App.pa.yaml`
- Commit: `Src/Rooms.pa.yaml`
- Inspect: `docs/APP-CHECKER-BASELINE.md`

**Interfaces:**
- Consumes: reviewed READY diffs from Tasks 2-5 and the current live Canvas snapshot.
- Produces: one guarded Canvas publish, one matching Git commit, post-publish marker evidence, and human Studio/player acceptance evidence.

- [ ] **Step 1: Review the cumulative diff against the shared base**

Run:

```powershell
git diff --no-index -- (Join-Path $baseDir 'App.pa.yaml') (Join-Path $workDir 'App.pa.yaml')
git diff --no-index -- (Join-Path $baseDir 'Rooms.pa.yaml') (Join-Path $workDir 'Rooms.pa.yaml')
```

Review for:

- only `App.pa.yaml` and `Rooms.pa.yaml` feature changes;
- no Floor, Group by, or page-stepper copy;
- no `Find.pa.yaml` or component changes;
- no raw colour literals in newly added controls;
- every new control name is globally unique.

- [ ] **Step 2: Run full local validation**

Run:

```powershell
node tools/pa-lint/lint.js --src $workDir --json
node tools/pa-schema-validate/validate.js --src $workDir --json
```

Expected:

- pa-lint: 0 errors and no unexplained increase from the known 17-warning baseline.
- pa-schema-validate: 0 findings.

- [ ] **Step 3: Run the integrated static acceptance contract**

Run:

```powershell
$appSource = Get-Content -Raw (Join-Path $workDir 'App.pa.yaml')
$roomsSource = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
$allSource = $appSource + $roomsSource
$required = @(
  'RoomsBrowseBase =',
  'RoomsBrowseData =',
  'Text: ="Choose a room"',
  'Items: =RoomsBrowseData',
  'galRoomsAvailabilitySegments:',
  'conRoomsSelectionBar:',
  'Text: ="View today"',
  'Text: ="View week"',
  'DisplayMode: =DisplayMode.Disabled',
  'Text: ="Book"',
  'Set(varSelectedDate, Blank())',
  'Set(varStartTime, Blank())',
  'Set(varEndTime, Blank())'
)
$missing = $required | Where-Object { $allSource -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Integrated contract missing: ' + ($missing -join ', ')) }
@('Step 1 of 3','Floor','Group by') | ForEach-Object {
  if ($roomsSource -match [regex]::Escape($_)) { throw "Forbidden Rooms copy found: $_" }
}
```

Expected: exit 0.

- [ ] **Step 4: Prepare the single-publisher window**

The human opens the target app in Power Apps Studio and remains co-attached.

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh status
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh lock "rooms selection redesign"
```

Expected: lock acquired by this publisher. If the lock is held, stop and coordinate; do not bypass it.

- [ ] **Step 5: Re-sync immediately before publish**

Create a new directory:

```powershell
$publishStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$publishDir = Join-Path $repoRoot ('.scratch\rooms-selection-publish-' + $publishStamp)
New-Item -ItemType Directory -Path $publishDir | Out-Null
```

Call `sync_canvas` into `$publishDir`. Compare the new live `App.pa.yaml` and `Rooms.pa.yaml` against `$baseDir`.

If live moved, release the lock, rebase the reviewed two-file feature diff onto the new live directory, rerun Tasks 2-5 validation, reacquire the lock, and sync again. Never retry an unchanged blocked publish (RULES P1).

If live did not move, copy the reviewed feature files into the fresh publish directory:

```powershell
Copy-Item -LiteralPath (Join-Path $workDir 'App.pa.yaml') -Destination (Join-Path $publishDir 'App.pa.yaml') -Force
Copy-Item -LiteralPath (Join-Path $workDir 'Rooms.pa.yaml') -Destination (Join-Path $publishDir 'Rooms.pa.yaml') -Force
node tools/pa-lint/lint.js --src $publishDir --json
node tools/pa-schema-validate/validate.js --src $publishDir --json
```

Expected: the same clean validation result as Step 2.

- [ ] **Step 6: Compile/publish and commit in the same breath**

Call `compile_canvas` with the absolute `$publishDir`.

Expected: zero compile errors. Do not claim runtime verification from compile alone.

If compilation reports an error, capture the complete error, unlock with `guard.sh unlock`, and return to the task that owns the failing formula or control. Do not copy files into `Src`, commit, or retry the same publish directory unchanged.

Immediately mirror the two published files into Git and commit:

```powershell
Copy-Item -LiteralPath (Join-Path $publishDir 'App.pa.yaml') -Destination (Join-Path $repoRoot 'Src\App.pa.yaml') -Force
Copy-Item -LiteralPath (Join-Path $publishDir 'Rooms.pa.yaml') -Destination (Join-Path $repoRoot 'Src\Rooms.pa.yaml') -Force
git add -- Src\App.pa.yaml Src\Rooms.pa.yaml
git diff --cached --check
git commit -m "feat(rooms): redesign room selection (P4,DS1,Y8)"
```

The human saves in Studio immediately after the publish so the app version persists (RULES P7).

- [ ] **Step 7: Perform post-publish source verification**

Create and sync into a new post-publish directory:

```powershell
$postPublishStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$postPublishDir = Join-Path $repoRoot ('.scratch\rooms-selection-postpublish-' + $postPublishStamp)
New-Item -ItemType Directory -Path $postPublishDir | Out-Null
```

Call `sync_canvas` with the absolute `$postPublishDir`, then run:

```powershell
node tools/pa-lint/lint.js check-markers "RoomsBrowseData =" --src $postPublishDir
node tools/pa-lint/lint.js check-markers "conRoomsSelectionBar:" --src $postPublishDir
node tools/pa-lint/lint.js check-markers "DisplayMode: =DisplayMode.Disabled" --src $postPublishDir
node tools/pa-lint/lint.js check-markers "Set(varSelectedDate, Blank())" --src $postPublishDir
```

Expected: every marker is present in the fresh server sync.

Release the lock and check catalog freshness:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh unlock
& 'C:\Program Files\Git\bin\bash.exe' tools/pac-verify/pac-verify.sh freshness
```

- [ ] **Step 8: Run Studio interaction acceptance**

At desktop width:

1. Open Rooms; verify **Choose a room**, no step text, no selection, and no action bar.
2. Search by a room-name fragment, description fragment, and equipment token.
3. Combine capacity, two equipment tags, and Available now; verify the summary equals the visible cards.
4. Sort by name, capacity ascending, and capacity descending.
5. Verify Busy, Free until, Free all day, or Outside booking hours text matches current bookings.
6. Verify the 30-minute strip contains only occupancy information.
7. Select a card, replace it with another, then deselect it; verify border, check, and action-bar state.
8. Select a room and activate **View today**; verify today's existing timeline loads for that room.
9. Return to Browse; verify selection remains.
10. Verify **View week** is disabled and cannot receive an action.
11. Activate **Book**; verify the modal opens with the selected room and blank date, start time, and end time.
12. Cancel the modal; verify Browse and selected-room state remain usable.

- [ ] **Step 9: Run responsive, theme, and keyboard acceptance**

In Studio, test:

- 1366px wide: four cards per row.
- 1024px wide: two cards per row.
- 767px wide: one card per row and vertically arranged toolbar/action bar.
- Light theme and dark theme: readable borders, text, statuses, tags, and disabled action.
- Keyboard: focus order is search, capacity, sort, available toggle, equipment tags, cards, then selection actions.
- Screen reader/accessibility tree: each card announces select/deselect, room name, capacity, status, and selected state through its button text.

- [ ] **Step 10: Check App Checker against the documented baseline**

Run App Checker in Studio after saving. Compare with `docs/APP-CHECKER-BASELINE.md`:

- High issues: remain at 0.
- Medium/Performance issues: no new issue or new site beyond the documented 15 baseline entries.

If App Checker increases, do not publish to players. Fix the new issue, repeat local validation, acquire the lock, and perform a new guarded publish/commit cycle.

- [ ] **Step 11: Verify the published player**

Open the published player and repeat the critical path:

1. Select a room.
2. View today and return.
3. Confirm Week is disabled.
4. Open Book and confirm date/time are blank.
5. Cancel without creating data.

Report verification precisely as the highest rung actually observed, with the timestamp and any remaining unverified behaviour.

---

## Completion Checklist

- [ ] Only `Src/App.pa.yaml` and `Src/Rooms.pa.yaml` changed for the feature.
- [ ] No stepper, Floor, Group by, new screen, new component, or data-source change.
- [ ] Named formulas drive cards, filters, summary counts, and availability.
- [ ] Cards select/deselect without immediately opening Today.
- [ ] Today reuses the existing timeline.
- [ ] Week is disabled and side-effect free.
- [ ] Book opens the existing modal with selected room and blank date/time.
- [ ] Empty, responsive, theme, keyboard, and privacy requirements pass.
- [ ] pa-lint has 0 errors and no unexplained new warnings.
- [ ] pa-schema-validate has 0 findings.
- [ ] compile_canvas reports 0 errors under the guard lock.
- [ ] Git commit matches the published source.
- [ ] Fresh-sync markers, Studio, App Checker, and published-player checks are recorded.
