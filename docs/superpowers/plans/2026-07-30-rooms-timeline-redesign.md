# Rooms Timeline Redesign Implementation Plan

> **Execute with: `orchestrator-coding`** — NEVER superpowers:subagent-driven-development or superpowers:executing-plans (they mandate two reviewers per task and re-created the 2026-08-03 5.9M-token blowout). Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repository override:** `CLAUDE.md` and `docs/PUBLISHING-PROTOCOL.md` govern Canvas execution and outrank the generic skill guidance. Workers edit and lint a scratch copy, **never** call `compile_canvas`, and **never** commit (RULES O1). The single publisher applies reviewed diffs, holds the guard lock, publishes once, and commits in the same breath.

**Goal:** Rebuild the Rooms single-day timeline as the reference design — white page, bordered timeline card with in-card day navigation, quiet booked blocks, a sidebar booking composer with duration chips, an in-row "Your booking" ghost block, a red now-marker, and tap-through to `bookingDetail` — while leaving the `btn_LoadTimeline` row engine mechanically intact.

**Architecture:** All changes live in `Src/Rooms.pa.yaml`. The `con_timeline_view` subtree is restructured (page header + two-column body + sidebar); the gallery row templates are rewritten; the row engine gains exactly two additive fields (`BookingID`, `IsMasked`). Selection state is four screen-scoped context variables. The Book CTA opens the existing wizard at `WizardStep3`.

**Tech Stack:** Power Apps Canvas YAML, Power Fx, IBM Carbon tokens in `AppTheme`, canvas-authoring MCP, Node.js validators (`pa-lint`, `pa-schema-validate`), Git Bash canvas-guard.

**Spec:** `docs/superpowers/specs/2026-07-30-rooms-timeline-redesign-design.md` — read it before starting.

---

## Why there are no unit tests

A canvas app has no local runtime, so "run the test" cannot mean executing the UI. This
repo's established substitute is a **static contract assertion**: a PowerShell snippet that
greps the YAML for anchors that must be present or absent, count-based wherever the anchor
already occurs elsewhere in the file. Each task follows: assert-fails → edit →
assert-passes → validators → report.

Anything a grep cannot prove (does the ghost block land at the right pixel? does the
wizard behave when opened at step 3?) is explicitly listed as `UNVERIFIED` and deferred to
the Studio rung. Do not claim it from a passing assertion.

## Global Constraints

- **Hard gate: the browse polish must be live first.** This plan's baseline is the
  published result of `2026-07-30-rooms-browse-polish.md`. Task 1 asserts it. If the gate
  fails, stop and report — do not implement against the pre-polish file.
- `Src/Rooms.pa.yaml` is the only file changed. If a task seems to need `App.pa.yaml`,
  stop and report.
- The `btn_LoadTimeline` `OnSelect` engine is untouched except the additive fields in
  Task 2. Do not alter interval maths, clamps, sorts, or `RowHeight` scaling.
- Do not touch the browse subtree (`con_rooms_view`) or `conRoomsSelectionBar` except the
  single `btnRoomsViewToday.OnSelect` edit in Task 2.
- The wizard component (`cpt_Modal_`) internals are untouched; only the
  `cpt_Modal__book_rooms.OnSubmit` instance property gains one selection clear (Task 2).
- Use `AppTheme` tokens and `Font: ="IBM Plex Sans"` on every written control. The only
  permitted `RGBA(...)` forms are hover/press overlays of the shape `RGBA(0, 0, 0, 0.0x)`
  (no theme token can express an alpha overlay).
- Token types differ: `AppTheme.TextPrimary`, `.TextSecondary`, `.TextMuted`, `.Border`,
  `.Surface`, `.SurfaceAlt`, `.StatusBusyText`, `.StatusFreeText` are **Colors** (use
  bare); `AppTheme.Primary`, `.PrimaryText`, `.ButtonPrimary`, `.ButtonDisabled`,
  `.ButtonDisabledText` are **strings** (wrap in `ColorValue(...)`). Copying the wrong
  form is a compile error.
- Anchor every edit by quoted YAML, never by line number.
- YAML blocks in this plan are shown at normalized indentation. On insertion, match the
  indentation of the named sibling anchor exactly; `pa-schema-validate` catches
  structural mistakes.
- The live app is the source of truth. App ID `498d4962-0b5f-4990-a400-1bf5de9a367c`,
  environment `Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd`, login hint
  `harry@harry-burton.ai`.
- Follow RULES P1-P10, Y1-Y9, DS1, O1-O3.

### File encoding (read before running any snippet)

`Rooms.pa.yaml` is UTF-8 **without a BOM** and contains meaningful non-ASCII glyphs:
`●` (status dots), `·` (separators), and `←` (back links). The day chevrons are base64
images, so those three glyphs are the ones at risk. Windows PowerShell 5.1 decodes
BOM-less files as CP1252, which silently corrupts them.

Without exception:

- **Read** with `[System.IO.File]::ReadAllText($path)` — never `Get-Content`.
- **Write** with `[System.IO.File]::WriteAllText($path, $text)` — never `Set-Content` or
  `Out-File`.

This plan adds *new* `●` and `·` glyphs (sidebar status dot, composer separators), so a
corrupted round-trip would not only destroy existing content but ship broken new content.
Every snippet below already follows the rule. Do not "simplify" one back to `Get-Content`.

## File Map

- **Modify:** `Src/Rooms.pa.yaml` — the only production change. Timeline subtree
  (Tasks 3-6), `btn_LoadTimeline` additive fields + three wiring sites (Task 2), DS1
  sweep (Task 7).
- **Read-only reference:** `docs/superpowers/specs/2026-07-30-rooms-timeline-redesign-design.md`.
- **Read-only reference:** `Src/App.pa.yaml` — `ThemeMap` token names and named formulas
  (`Timeline_DayStart`, `WorkingDayMinutes`, `WizardStep3`, `fnIsPast`, `fnOverlaps`). Do
  not edit.
- **Read-only reference:** `Src/myBookings.pa.yaml` — the
  `Set(gblSelectedBooking, ...); Navigate(bookingDetail, ...)` contract Task 4 copies.

## Execution Topology

One synced base, one working copy:

```powershell
$repoRoot = 'C:\Users\harry\Documents\dev\power-apps\booking-tool'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$baseDir = Join-Path $repoRoot ('.scratch\tl-redesign-base-' + $stamp)
$workDir = Join-Path $repoRoot ('.scratch\tl-redesign-work-' + $stamp)
New-Item -ItemType Directory -Path $baseDir,$workDir | Out-Null
```

After `connect`, `sync_canvas` into `$baseDir`, then:

```powershell
Get-ChildItem -Force -LiteralPath $baseDir | Copy-Item -Destination $workDir -Recurse
```

All edits happen in `$workDir\Rooms.pa.yaml`. Workers diff against `$baseDir`.

---

### Task 1: Baseline and the browse-polish gate

**Files:**
- Inspect: `$baseDir\Rooms.pa.yaml`
- Generate outside git: `$baseDir/**/*.pa.yaml`, `$workDir/**/*.pa.yaml`

**Interfaces:**
- Consumes: the live app IDs in Global Constraints.
- Produces: a gated, immutable synced base; the recorded counts every later assertion is
  relative to.

- [ ] **Step 1: Connect**

Call the `connect` tool. Parameters are snake_case:

```json
{
  "environment_id": "Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd",
  "app_id": "498d4962-0b5f-4990-a400-1bf5de9a367c",
  "login_hint": "harry@harry-burton.ai"
}
```

- [ ] **Step 2: Sync and copy**

Call `sync_canvas` with the absolute `$baseDir` path, then run the `Copy-Item` command
from Execution Topology.

- [ ] **Step 3: Enforce the browse-polish gate**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $baseDir 'Rooms.pa.yaml'))
$lato = ([regex]::Matches($rooms, [regex]::Escape('Font: =Font.Lato'))).Count
if ($lato -ne 0) { throw "GATE FAILED: $lato Font.Lato sites remain - browse polish has not published. Stop." }
if ($rooms -notmatch [regex]::Escape('lblRoomsCardStatusDot:')) { throw 'GATE FAILED: browse polish status dot absent - polish not published. Stop.' }
'gate passed: browse polish is live'
```

Expected: prints `gate passed: browse polish is live`. On failure, **stop the whole
plan** and report; do not proceed against a pre-polish base.

- [ ] **Step 4: Confirm live matches git**

```powershell
git diff --no-index -- Src\Rooms.pa.yaml (Join-Path $baseDir 'Rooms.pa.yaml')
git diff --no-index -- Src\App.pa.yaml (Join-Path $baseDir 'App.pa.yaml')
```

Expected: no output. If `Rooms.pa.yaml` differs, the polish publish was not committed or
live moved again — reconcile exactly as the polish plan's Task 1 Step 3 prescribes
(copy live into `Src`, commit `sync(canvas): reconcile live before timeline redesign (P5)`),
then recreate `$baseDir`/`$workDir`.

- [ ] **Step 5: Record the validator and count baseline**

```powershell
node tools/pa-lint/lint.js --src $baseDir
node tools/pa-schema-validate/validate.js --src $baseDir
$rooms = [System.IO.File]::ReadAllText((Join-Path $baseDir 'Rooms.pa.yaml'))
$rgbaTotal = ([regex]::Matches($rooms, 'RGBA\(')).Count
$start = $rooms.IndexOf('- con_timeline_view:')
$end = $rooms.IndexOf('- conRoomsSelectionBar:')
if ($start -lt 0 -or $end -le $start) { throw 'timeline region anchors not found' }
$tl = $rooms.Substring($start, $end - $start)
$rgbaTimeline = ([regex]::Matches($tl, 'RGBA\(')).Count
"whole-file RGBA: $rgbaTotal | timeline-region RGBA: $rgbaTimeline"
Get-FileHash (Join-Path $baseDir 'Rooms.pa.yaml') -Algorithm SHA256
```

Record: pa-lint errors (must be 0) and warning count; both RGBA counts; the SHA256.
Every later task must keep 0 lint errors and must not increase the warning count without
itemizing why. Quote the hash in every READY report.

---

### Task 2: Engine fields and selection-clear wiring

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: `booking.ID`, `booking.IsPrivate`, `booking.BookedByEmail`.
- Produces: `BookingID` and `IsMasked` on every `colTimelineRows` row; selection clears
  at the two wiring sites that exist before the rewrite (`btnRoomsViewToday`, wizard
  `OnSubmit`). The chevron/Today/date-picker clears are baked into their rewritten
  blocks in Task 3.

- [ ] **Step 1: Assert the pre-state**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
if ($rooms -match 'BookingID') { throw 'BookingID already present - baseline drifted.' }
if ($rooms -match 'IsMasked') { throw 'IsMasked already present - baseline drifted.' }
if ($rooms -match 'varTLSelStart') { throw 'varTLSelStart already present - baseline drifted.' }
'pre-state confirmed'
```

- [ ] **Step 2: Add the two fields to the booked-row Collect**

In `btn_LoadTimeline.OnSelect`, the first `ForAll` collects booked rows. Change:

```powerfx
        Title: If(booking.IsPrivate && booking.BookedByEmail <> Lower(User().Email), "Busy", booking.Title),
        BookedBy: If(booking.IsPrivate && booking.BookedByEmail <> Lower(User().Email), "", booking.BookedBy.DisplayName),
        IsMine: booking.BookedBy.Email = User().Email
```

to:

```powerfx
        Title: If(booking.IsPrivate && booking.BookedByEmail <> Lower(User().Email), "Busy", booking.Title),
        BookedBy: If(booking.IsPrivate && booking.BookedByEmail <> Lower(User().Email), "", booking.BookedBy.DisplayName),
        IsMine: booking.BookedBy.Email = User().Email,
        BookingID: booking.ID,
        IsMasked: booking.IsPrivate && booking.BookedByEmail <> Lower(User().Email)
```

- [ ] **Step 3: Add the two fields to all three free-row Collects**

There are exactly three free-row `Collect(colTimelineRows, {...})` blocks in the same
`OnSelect`, distinguishable by their `RowStart` lines: `RowStart: cellStart` (empty
hour), `RowStart: cellStart` with `RowEnd: First(overl).StartDateTime` (gap before first
booking), and `RowStart: segStart` (gap after a booking). In **each** of the three,
change:

```powerfx
        Title: "",
        BookedBy: "",
        IsMine: false
```

to:

```powerfx
        Title: "",
        BookedBy: "",
        IsMine: false,
        BookingID: 0,
        IsMasked: false
```

All four `Collect` sites must produce the same column set, or the collection schema
degrades to blank-filled columns.

- [ ] **Step 4: Clear selection on timeline entry**

On `btnRoomsViewToday` (inside `conRoomsSelectionBar` — the only browse-subtree touch in
this plan), change:

```powerfx
=Set(glbSelectedDate, Today());
UpdateContext({varShowTimeline: true});
Select(btn_LoadTimeline)
```

to:

```powerfx
=Set(glbSelectedDate, Today());
Set(varNowTick, Now());
UpdateContext({varTLSelStart: Blank(), varShowTimeline: true});
Select(btn_LoadTimeline)
```

The `varNowTick` refresh keeps the now-badge and sidebar status honest on entry.

- [ ] **Step 5: Clear selection on successful submit**

In `cpt_Modal__book_rooms.OnSubmit`, the success tail ends with:

```powerfx
                  /* Stay on Rooms — rebuild the timeline so the new booking(s) show up.
                     (Home navigates back to Home here instead.) */
                  Select(btn_LoadTimeline)
```

Change to:

```powerfx
                  /* Stay on Rooms — rebuild the timeline so the new booking(s) show up.
                     (Home navigates back to Home here instead.) */
                  UpdateContext({varTLSelStart: Blank()});
                  Select(btn_LoadTimeline)
```

Wizard cancel is deliberately not wired: a cancelled slot is still free and the ghost
still valid (spec §3).

- [ ] **Step 6: Assert the fix**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
$bid = ([regex]::Matches($rooms, 'BookingID: ')).Count
if ($bid -ne 4) { throw "Expected 4 BookingID collect sites (1 booked + 3 free), found $bid." }
$masked = ([regex]::Matches($rooms, 'IsMasked: ')).Count
if ($masked -ne 4) { throw "Expected 4 IsMasked collect sites, found $masked." }
$clears = ([regex]::Matches($rooms, [regex]::Escape('varTLSelStart: Blank()'))).Count
if ($clears -ne 2) { throw "Expected 2 varTLSelStart clears (entry + submit), found $clears." }
'task 2 contract passed'
```

Expected: prints `task 2 contract passed`.

- [ ] **Step 7: Validate and report**

```powershell
node tools/pa-lint/lint.js --src $workDir
node tools/pa-schema-validate/validate.js --src $workDir
```

Expected: 0 errors, warnings equal to the Task 1 baseline, 0 schema findings. Report
READY with `BASE:` hash, `LINT:` line, and the unified diff vs `$baseDir`.

---

### Task 3: Page skeleton — header, two-column body, card shell

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: `varSelectedRoom`, `colRoomBookings`, `WorkingDayMinutes`, `glbSelectedDate`,
  `varShowTimeline`, `varNowTick`.
- Produces: the new page structure. `galTimeline` and `lbl_textRoomsEmptyState` live
  inside the card; the sidebar exists as two empty styled cards for Tasks 5-6.

The whole `- con_timelineheader:` block (from `- con_timelineheader:` through the end of
`imgDateForward`'s properties, i.e. everything before `- galTimeline:`) is **deleted**
and replaced by the structure below. The removed controls are `con_timelineheader`,
`btnBackToRooms`, `conHeaderTitle`, `lblRoomName`, `lblHeaderSummary`, `btnToday`,
`imgDateBack`, `DatePicker2`, `lblCurrentDate`, `imgDateForward` — `btnToday`,
`imgDateBack`, `imgDateForward`, and `DatePicker2` are recreated inside the card header
with the same names and behaviour (plus selection clears).

- [ ] **Step 1: Assert the pre-state**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
if ($rooms -notmatch [regex]::Escape('con_timelineheader:')) { throw 'old header not found - baseline drifted.' }
if ($rooms -match 'conTLPageHeader:') { throw 'new header already present.' }
'pre-state confirmed'
```

- [ ] **Step 2: Restyle the outer container**

On `con_timeline_view` Properties, add (keeping every existing property):

```yaml
LayoutGap: =16
PaddingBottom: =24
PaddingLeft: =32
PaddingRight: =32
PaddingTop: =16
```

- [ ] **Step 3: Replace the header with the page header**

Delete the entire `- con_timelineheader:` block. In its place (first child of
`con_timeline_view`), insert:

```yaml
- conTLPageHeader:
    Control: GroupContainer
    Variant: AutoLayout
    Properties:
      DropShadow: =DropShadow.None
      Fill: =Color.Transparent
      FillPortions: =0
      Height: =76
      LayoutAlignItems: =LayoutAlignItems.Stretch
      LayoutDirection: =LayoutDirection.Vertical
      LayoutGap: =4
      LayoutMinHeight: =0
      LayoutMinWidth: =0
    Children:
      - btnTLBack:
          Control: Classic/Button
          Properties:
            Align: =Align.Left
            BorderStyle: =BorderStyle.None
            BorderThickness: =0
            Color: =ColorValue(AppTheme.Primary)
            Fill: =Color.Transparent
            FocusedBorderColor: =ColorValue(AppTheme.Primary)
            FocusedBorderThickness: =2
            Font: ="IBM Plex Sans"
            FontWeight: =FontWeight.Normal
            Height: =24
            HoverColor: =ColorValue(AppTheme.Primary)
            HoverFill: =Color.Transparent
            OnSelect: |-
              =Set(varNowTick, Now());
              UpdateContext({varTLSelStart: Blank(), varShowTimeline: false})
            PressedColor: =ColorValue(AppTheme.Primary)
            PressedFill: =Color.Transparent
            Size: =11
            Text: ="← All rooms"
            Width: =140
      - conTLTitleRow:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            DropShadow: =DropShadow.None
            Fill: =Color.Transparent
            LayoutAlignItems: =LayoutAlignItems.Center
            LayoutDirection: =LayoutDirection.Horizontal
            LayoutMinHeight: =0
            LayoutMinWidth: =0
          Children:
            - lblTLTitle:
                Control: Label
                Properties:
                  Color: =AppTheme.TextPrimary
                  FillPortions: =1
                  Font: ="IBM Plex Sans"
                  FontWeight: =FontWeight.Semibold
                  Size: =24
                  Text: ="Pick a time in " & varSelectedRoom.Title
            - lblTLStat:
                Control: Label
                Properties:
                  Align: =Align.Right
                  Color: =AppTheme.TextMuted
                  Font: ="IBM Plex Sans"
                  Size: =12
                  Text: |-
                    =With(
                        {freeMin: WorkingDayMinutes - Sum(colRoomBookings, DateDiff(StartDateTime, EndDateTime, TimeUnit.Minutes))},
                        If(
                            freeMin <= 0,
                            "fully booked",
                            If(freeMin >= 60, Text(RoundDown(freeMin / 60, 0)) & "h ", "") & If(Mod(freeMin, 60) > 0, Text(Mod(freeMin, 60)) & "m ", "") & "free"
                        )
                    ) & " · " & CountRows(colRoomBookings) & " booked"
                  Width: =260
```

- [ ] **Step 4: Insert the body shell and move the gallery**

After `conTLPageHeader` (and before `btn_LoadTimeline`), insert `conTLBody`. Then **move**
the entire existing `- galTimeline:` block (all of it, children included, unmodified
except the property changes below) and the `- lbl_textRoomsEmptyState:` block into
`conTLCard`'s `Children:` where marked, re-indenting every moved line to the new depth.

```yaml
- conTLBody:
    Control: GroupContainer
    Variant: AutoLayout
    Properties:
      DropShadow: =DropShadow.None
      Fill: =Color.Transparent
      FillPortions: =1
      LayoutAlignItems: =LayoutAlignItems.Stretch
      LayoutDirection: =If(App.Width < 1024, LayoutDirection.Vertical, LayoutDirection.Horizontal)
      LayoutGap: =16
      LayoutMinHeight: =0
      LayoutMinWidth: =0
    Children:
      - conTLCard:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            BorderColor: =AppTheme.Border
            BorderThickness: =1
            DropShadow: =DropShadow.None
            Fill: =AppTheme.Surface
            FillPortions: =1
            LayoutAlignItems: =LayoutAlignItems.Stretch
            LayoutDirection: =LayoutDirection.Vertical
            LayoutMinHeight: =0
            LayoutMinWidth: =0
          Children:
            - conTLCardHeader:
                Control: GroupContainer
                Variant: AutoLayout
                Properties:
                  DropShadow: =DropShadow.None
                  Fill: =Color.Transparent
                  FillPortions: =0
                  Height: =56
                  LayoutAlignItems: =LayoutAlignItems.Center
                  LayoutDirection: =LayoutDirection.Horizontal
                  LayoutGap: =8
                  LayoutMinHeight: =0
                  LayoutMinWidth: =0
                  PaddingLeft: =16
                  PaddingRight: =16
                Children:
                  - lblTLDate:
                      Control: Label
                      Properties:
                        Color: =AppTheme.TextPrimary
                        Font: ="IBM Plex Sans"
                        FontWeight: =FontWeight.Semibold
                        Size: =13
                        Text: =Text(glbSelectedDate, "ddd dd mmmm")
                        Width: =140
                  - imgDateBack:
                      Control: Image
                      Properties:
                        AccessibleLabel: ="Previous day"
                        AlignInContainer: =AlignInContainer.Center
                        Height: =32
                        Image: ="data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAzMiAzMic+PHBhdGggZD0nTTIwIDI0TDEyIDE2IDIwIDgnIHN0cm9rZT0nIzUyNTI1Micgc3Ryb2tlLXdpZHRoPScyJyBmaWxsPSdub25lJyBzdHJva2UtbGluZWNhcD0ncm91bmQnIHN0cm9rZS1saW5lam9pbj0ncm91bmQnLz48L3N2Zz4="
                        OnSelect: |-
                          =Set(glbSelectedDate, DateAdd(glbSelectedDate, -1, TimeUnit.Days));
                          UpdateContext({varTLSelStart: Blank()});
                          Select(btn_LoadTimeline)
                        TabIndex: =0
                        Width: =32
                  - imgDateForward:
                      Control: Image
                      Properties:
                        AccessibleLabel: ="Next day"
                        AlignInContainer: =AlignInContainer.Center
                        Height: =32
                        Image: ="data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAzMiAzMic+PHBhdGggZD0nTTEyIDI0TDIwIDE2IDEyIDgnIHN0cm9rZT0nIzUyNTI1Micgc3Ryb2tlLXdpZHRoPScyJyBmaWxsPSdub25lJyBzdHJva2UtbGluZWNhcD0ncm91bmQnIHN0cm9rZS1saW5lam9pbj0ncm91bmQnLz48L3N2Zz4="
                        OnSelect: |-
                          =Set(glbSelectedDate, DateAdd(glbSelectedDate, 1, TimeUnit.Days));
                          UpdateContext({varTLSelStart: Blank()});
                          Select(btn_LoadTimeline)
                        TabIndex: =0
                        Width: =32
                  - btnToday:
                      Control: Classic/Button
                      Properties:
                        BorderColor: =AppTheme.Border
                        BorderThickness: =1
                        Color: =AppTheme.TextPrimary
                        DisabledBorderColor: =AppTheme.Border
                        DisabledColor: =AppTheme.TextMuted
                        DisabledFill: =AppTheme.SurfaceAlt
                        DisplayMode: =If(glbSelectedDate = Today(), DisplayMode.Disabled, DisplayMode.Edit)
                        Fill: =AppTheme.Surface
                        FocusedBorderColor: =ColorValue(AppTheme.Primary)
                        FocusedBorderThickness: =2
                        Font: ="IBM Plex Sans"
                        FontWeight: =FontWeight.Normal
                        Height: =32
                        HoverColor: =AppTheme.TextPrimary
                        HoverFill: =AppTheme.SurfaceAlt
                        OnSelect: |-
                          =Set(glbSelectedDate, Today());
                          UpdateContext({varTLSelStart: Blank()});
                          Select(btn_LoadTimeline)
                        PressedColor: =AppTheme.TextPrimary
                        PressedFill: =AppTheme.SurfaceAlt
                        Size: =11
                        Text: ="Today"
                        Width: =64
                  - DatePicker2:
                      Control: ModernDatePicker
                      Properties:
                        Color: =AppTheme.TextPrimary
                        DefaultDate: =glbSelectedDate
                        Fill: =Color.Transparent
                        FontWeight: =FontWeight.Semibold
                        LayoutMinHeight: =16
                        LayoutMinWidth: =16
                        OnChange: |-
                          =Set(glbSelectedDate, DatePicker2.SelectedDate);
                          UpdateContext({varTLSelStart: Blank()});
                          Select(btn_LoadTimeline)
                        Width: =180
                  - conTLHeaderSpacer:
                      Control: GroupContainer
                      Variant: AutoLayout
                      Properties:
                        DropShadow: =DropShadow.None
                        Fill: =Color.Transparent
                        FillPortions: =1
                        LayoutMinHeight: =0
                        LayoutMinWidth: =0
                  - lblTLLegendFreeSwatch:
                      Control: Label
                      Properties:
                        AlignInContainer: =AlignInContainer.Center
                        BorderColor: =AppTheme.Border
                        BorderStyle: =BorderStyle.Solid
                        BorderThickness: =1
                        Fill: =AppTheme.Surface
                        Height: =12
                        Text: =""
                        Width: =12
                  - lblTLLegendFree:
                      Control: Label
                      Properties:
                        AlignInContainer: =AlignInContainer.Center
                        Color: =AppTheme.TextSecondary
                        Font: ="IBM Plex Sans"
                        Size: =10
                        Text: ="Free"
                        Width: =34
                  - lblTLLegendBookedSwatch:
                      Control: Label
                      Properties:
                        AlignInContainer: =AlignInContainer.Center
                        Fill: =AppTheme.SurfaceAlt
                        Height: =12
                        Text: =""
                        Width: =12
                  - lblTLLegendBooked:
                      Control: Label
                      Properties:
                        AlignInContainer: =AlignInContainer.Center
                        Color: =AppTheme.TextSecondary
                        Font: ="IBM Plex Sans"
                        Size: =10
                        Text: ="Booked"
                        Width: =52
            - conTLCardDivider:
                Control: GroupContainer
                Variant: AutoLayout
                Properties:
                  DropShadow: =DropShadow.None
                  Fill: =AppTheme.Border
                  FillPortions: =0
                  Height: =1
                  LayoutMinHeight: =0
                  LayoutMinWidth: =0
            # >>> MOVE the existing `- galTimeline:` block here (children intact) <<<
            # >>> MOVE the existing `- lbl_textRoomsEmptyState:` block here <<<
      - conTLSidebar:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            AlignInContainer: =AlignInContainer.Stretch
            DropShadow: =DropShadow.None
            Fill: =Color.Transparent
            FillPortions: =0
            Height: =If(App.Width < 1024, 448, Parent.Height)
            LayoutAlignItems: =LayoutAlignItems.Stretch
            LayoutDirection: =LayoutDirection.Vertical
            LayoutGap: =16
            LayoutMaxWidth: =If(App.Width < 1024, App.Width, 320)
            LayoutMinWidth: =0
            LayoutMinHeight: =0
            Width: =320
          Children:
            - conTLRoomCard:
                Control: GroupContainer
                Variant: AutoLayout
                Properties:
                  BorderColor: =AppTheme.Border
                  BorderThickness: =1
                  DropShadow: =DropShadow.None
                  Fill: =AppTheme.Surface
                  FillPortions: =0
                  Height: =If(glbSelectedDate = Today(), 172, 148)
                  LayoutAlignItems: =LayoutAlignItems.Stretch
                  LayoutDirection: =LayoutDirection.Vertical
                  LayoutGap: =8
                  LayoutMinHeight: =0
                  LayoutMinWidth: =0
                  PaddingBottom: =16
                  PaddingLeft: =16
                  PaddingRight: =16
                  PaddingTop: =16
            - conTLComposer:
                Control: GroupContainer
                Variant: AutoLayout
                Properties:
                  BorderColor: =AppTheme.Border
                  BorderThickness: =1
                  DropShadow: =DropShadow.None
                  Fill: =AppTheme.Surface
                  FillPortions: =0
                  Height: =260
                  LayoutAlignItems: =LayoutAlignItems.Stretch
                  LayoutDirection: =LayoutDirection.Vertical
                  LayoutGap: =12
                  LayoutMinHeight: =0
                  LayoutMinWidth: =0
                  PaddingBottom: =16
                  PaddingLeft: =16
                  PaddingRight: =16
                  PaddingTop: =16
```

- [ ] **Step 5: Adjust the moved gallery's sizing**

On the moved `galTimeline`, change:

```yaml
Height: =Parent.Height - 48
```

to:

```yaml
FillPortions: =1
```

(`Height` deleted, `FillPortions` added; `Items`, `TemplatePadding`, `Width` and all
children untouched in this task.) On the moved `lbl_textRoomsEmptyState`, no property
changes.

- [ ] **Step 6: Assert the fix**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
$gone = @('con_timelineheader:', 'btnBackToRooms:', 'conHeaderTitle:', 'lblRoomName:', 'lblHeaderSummary:', 'lblCurrentDate:', 'varShowDatePicker')
$gone | ForEach-Object { if ($rooms -match [regex]::Escape($_)) { throw "Removed control still present: $_" } }
$new = @('conTLPageHeader:', 'btnTLBack:', 'lblTLTitle:', 'lblTLStat:', 'conTLBody:', 'conTLCard:', 'conTLCardHeader:', 'lblTLDate:', 'conTLHeaderSpacer:', 'lblTLLegendBooked:', 'conTLCardDivider:', 'conTLSidebar:', 'conTLRoomCard:', 'conTLComposer:')
$missing = $new | Where-Object { $rooms -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing new controls: ' + ($missing -join ', ')) }
# btnToday / DatePicker2 / imgDateBack / imgDateForward recreated exactly once each
@('btnToday:', 'DatePicker2:', 'imgDateBack:', 'imgDateForward:', 'galTimeline:') | ForEach-Object {
  $count = ([regex]::Matches($rooms, [regex]::Escape($_))).Count
  if ($count -ne 1) { throw "Expected exactly 1 $_ found $count." }
}
if ($rooms -match [regex]::Escape('Height: =Parent.Height - 48')) { throw 'galTimeline still has the old fixed height.' }
'task 3 contract passed'
```

Expected: prints `task 3 contract passed`.

- [ ] **Step 7: Validate and report**

Run both validators. Expected: 0 errors, warnings ≤ Task 1 baseline (itemize any delta),
0 schema findings. Report READY. Note in the report:

```text
UNVERIFIED: two-column vs stacked layout behaviour at 1024px, and the
            sidebar's 320px width under LayoutMaxWidth, require Studio.
```

---

### Task 4: Row templates — gutter badge, booked restyle + tap, free selection + ghost, now line

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: `ThisItem.RowType/RowStart/RowEnd/RowHeight/RowMinutes/Title/BookedBy/BookingID/IsMasked`,
  `varTLSelStart/varTLSelMinutes/varTLSelRunStart/varTLSelRunEnd`, `varNowTick`,
  `fnIsPast`, `gblSelectedBooking`, `bookingDetail`.
- Produces: the complete new row rendering and both timeline interactions.

- [ ] **Step 1: Assert the pre-state**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
if ($rooms -notmatch [regex]::Escape('lblNowMarker:')) { throw 'old now marker not found - baseline drifted.' }
if ($rooms -match 'conTLGhost:') { throw 'ghost already present.' }
'pre-state confirmed'
```

- [ ] **Step 2: Replace the gutter now-marker**

Inside `conTimeLabel`, replace the whole `- lblNowMarker:` block with:

```yaml
- lblTLNowBadge:
    Control: Label
    Properties:
      Align: =Align.Center
      AlignInContainer: =AlignInContainer.End
      Color: =ColorValue(AppTheme.PrimaryText)
      Fill: =AppTheme.StatusBusyText
      Font: ="IBM Plex Sans"
      Height: =16
      LayoutMinHeight: =14
      Size: =10
      Text: =Text(varNowTick, "HH:mm")
      Visible: =varNowTick >= ThisItem.RowStart && varNowTick < ThisItem.RowEnd
      Width: =44
```

- [ ] **Step 3: Rewrite `conSlotBlock` as ManualLayout**

Replace the **entire** `- conSlotBlock:` block (it currently contains `conBookedCard`
and `conFreeSlot`) with the block below. The booked card's inner structure
(`recAccentBar`, `conBookedText`, `lblBookingTitle`, `lblBookedBy`) is carried over with
restyled fills and the new short-row text; the free slot is rebuilt around selection.

```yaml
- conSlotBlock:
    Control: GroupContainer
    Variant: ManualLayout
    Properties:
      FillPortions: =1
      Height: =Parent.Height
      LayoutMinHeight: =0
      LayoutMinWidth: =0
    Children:
      - conBookedCard:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            Fill: =AppTheme.SurfaceAlt
            Height: =Parent.Height - 4
            LayoutAlignItems: =LayoutAlignItems.Stretch
            LayoutDirection: =LayoutDirection.Horizontal
            Visible: =ThisItem.RowType = "booked"
            Width: =Parent.Width - 16
            X: =0
            Y: =2
          Children:
            - recAccentBar:
                Control: GroupContainer
                Variant: AutoLayout
                Properties:
                  Fill: =If(fnIsPast(ThisItem.RowEnd), AppTheme.TextMuted, AppTheme.TextSecondary)
                  FillPortions: =0
                  LayoutDirection: =LayoutDirection.Horizontal
                  LayoutMaxWidth: =3
                  LayoutMinWidth: =3
                  Width: =3
            - conBookedText:
                Control: GroupContainer
                Variant: AutoLayout
                Properties:
                  Fill: =Color.Transparent
                  LayoutAlignItems: =LayoutAlignItems.Stretch
                  LayoutDirection: =LayoutDirection.Vertical
                  PaddingBottom: =2
                  PaddingLeft: =12
                  PaddingTop: =4
                Children:
                  - lblBookingTitle:
                      Control: Label
                      Properties:
                        AutoHeight: =true
                        Color: =If(fnIsPast(ThisItem.RowEnd), AppTheme.TextMuted, AppTheme.TextPrimary)
                        FillPortions: =1
                        Font: ="IBM Plex Sans"
                        FontWeight: =FontWeight.Semibold
                        LayoutMinHeight: =18
                        LayoutMinWidth: =0
                        PaddingBottom: =0
                        PaddingLeft: =0
                        PaddingRight: =0
                        PaddingTop: =0
                        Size: =12
                        Text: =If(ThisItem.RowHeight < 48, ThisItem.Title & "  ·  " & Text(ThisItem.RowStart, "HH:mm") & " – " & Text(ThisItem.RowEnd, "HH:mm"), ThisItem.Title)
                        VerticalAlign: =VerticalAlign.Top
                  - lblBookedBy:
                      Control: Label
                      Properties:
                        AutoHeight: =true
                        Color: =If(fnIsPast(ThisItem.RowEnd), AppTheme.TextMuted, AppTheme.TextSecondary)
                        FillPortions: =1
                        Font: ="IBM Plex Sans"
                        LayoutMinHeight: =16
                        Size: =11
                        Text: =ThisItem.BookedBy & "  ·  " & Text(ThisItem.RowStart, "HH:mm") & " – " & Text(ThisItem.RowEnd, "HH:mm")
                        VerticalAlign: =VerticalAlign.Top
                        Visible: =ThisItem.RowHeight >= 48
      - btnTLBookedTap:
          Control: Classic/Button
          Properties:
            BorderColor: =Color.Transparent
            BorderStyle: =BorderStyle.None
            BorderThickness: =0
            Color: =Color.Transparent
            Fill: =Color.Transparent
            FocusedBorderColor: =ColorValue(AppTheme.Primary)
            FocusedBorderThickness: =2
            Font: ="IBM Plex Sans"
            Height: =Parent.Height - 4
            HoverColor: =Color.Transparent
            HoverFill: =RGBA(0, 0, 0, 0.04)
            OnSelect: |-
              =Set(gblSelectedBooking, LookUp(colBookings, ID = ThisItem.BookingID));
              Navigate(bookingDetail, ScreenTransition.Fade)
            PressedColor: =Color.Transparent
            PressedFill: =RGBA(0, 0, 0, 0.08)
            Text: |-
              ="Open booking details: " & ThisItem.Title
            Visible: =ThisItem.RowType = "booked" && !ThisItem.IsMasked
            Width: =Parent.Width - 16
            X: =0
            Y: =2
      - conFreeSlot:
          Control: GroupContainer
          Variant: ManualLayout
          Properties:
            Fill: =AppTheme.Surface
            Height: =Parent.Height - 4
            Visible: =ThisItem.RowType = "free"
            Width: =Parent.Width - 16
            X: =0
            Y: =2
          Children:
            - btnFreeSlot:
                Control: Classic/Button
                Properties:
                  BorderColor: =Color.Transparent
                  BorderStyle: =BorderStyle.None
                  BorderThickness: =0
                  Color: =AppTheme.TextMuted
                  Fill: =Color.Transparent
                  FocusedBorderColor: =ColorValue(AppTheme.Primary)
                  FocusedBorderThickness: =2
                  Font: ="IBM Plex Sans"
                  Height: =Parent.Height
                  HoverColor: =AppTheme.TextPrimary
                  HoverFill: =RGBA(0, 0, 0, 0.04)
                  OnSelect: |-
                    =With(
                        {_slotStart: ThisItem.RowStart, _slotEnd: ThisItem.RowEnd, _now: Now()},
                        With(
                            {
                                _clamped: If(
                                    _slotStart < _now,
                                    DateAdd(_now, Mod(15 - Mod(DateDiff(_slotStart, _now, TimeUnit.Minutes), 15), 15), TimeUnit.Minutes),
                                    _slotStart
                                )
                            },
                            With(
                                {_start: If(_clamped < _slotEnd, _clamped, _slotStart)},
                                With(
                                    {_fit: DateDiff(_start, _slotEnd, TimeUnit.Minutes)},
                                    UpdateContext({
                                        varTLSelStart: _start,
                                        varTLSelRunStart: ThisItem.RowStart,
                                        varTLSelRunEnd: _slotEnd,
                                        varTLSelMinutes: If(
                                            !IsBlank(varTLSelStart) && ThisItem.RowStart = varTLSelRunStart && varTLSelMinutes <= _fit,
                                            varTLSelMinutes,
                                            If(_fit >= 60, 60, _fit >= 30, 30, _fit)
                                        )
                                    })
                                )
                            )
                        )
                    )
                  PressedColor: =AppTheme.TextPrimary
                  PressedFill: =RGBA(0, 0, 0, 0.08)
                  Size: =11
                  Text: |-
                    =If(
                        !IsBlank(varTLSelStart) && ThisItem.RowStart = varTLSelRunStart,
                        "",
                        "Available " &
                        If(
                            ThisItem.RowMinutes >= 60,
                            Text(RoundDown(ThisItem.RowMinutes / 60, 0)) & "h" & If(Mod(ThisItem.RowMinutes, 60) > 0, " " & Text(Mod(ThisItem.RowMinutes, 60)) & "m", ""),
                            Text(ThisItem.RowMinutes) & "m"
                        )
                    )
                  Width: =Parent.Width
                  X: =0
                  Y: =0
            - conTLGhost:
                Control: GroupContainer
                Variant: ManualLayout
                Properties:
                  Fill: =ColorValue(AppTheme.Primary)
                  Height: =varTLSelMinutes * 2
                  Visible: =!IsBlank(varTLSelStart) && ThisItem.RowStart = varTLSelRunStart
                  Width: =Parent.Width
                  X: =0
                  Y: =DateDiff(ThisItem.RowStart, varTLSelStart, TimeUnit.Minutes) * 2
                Children:
                  - lblTLGhostTitle:
                      Control: Label
                      Properties:
                        Color: =ColorValue(AppTheme.PrimaryText)
                        Font: ="IBM Plex Sans"
                        FontWeight: =FontWeight.Semibold
                        Height: =18
                        OnSelect: =Select(btnFreeSlot)
                        Size: =12
                        Text: ="Your booking"
                        Width: =Parent.Width - 24
                        X: =12
                        Y: =6
                  - lblTLGhostTime:
                      Control: Label
                      Properties:
                        Color: =ColorValue(AppTheme.PrimaryText)
                        Font: ="IBM Plex Sans"
                        Height: =16
                        OnSelect: =Select(btnFreeSlot)
                        Size: =11
                        Text: |-
                          =Text(varTLSelStart, "HH:mm") & " – " & Text(DateAdd(varTLSelStart, varTLSelMinutes, TimeUnit.Minutes), "HH:mm") & " · " &
                          If(
                              varTLSelMinutes >= 60,
                              Text(RoundDown(varTLSelMinutes / 60, 0)) & "h" & If(Mod(varTLSelMinutes, 60) > 0, " " & Text(Mod(varTLSelMinutes, 60)) & "m", ""),
                              Text(varTLSelMinutes) & "m"
                          )
                        Visible: =varTLSelMinutes * 2 >= 48
                        Width: =Parent.Width - 24
                        X: =12
                        Y: =26
            - lblTLFreeResidue:
                Control: Label
                Properties:
                  Align: =Align.Center
                  Color: =AppTheme.TextMuted
                  Font: ="IBM Plex Sans"
                  Height: =Max(Parent.Height - (DateDiff(ThisItem.RowStart, varTLSelStart, TimeUnit.Minutes) * 2 + varTLSelMinutes * 2), 0)
                  OnSelect: =Select(btnFreeSlot)
                  Size: =11
                  Text: |-
                    =With(
                        {_res: DateDiff(DateAdd(varTLSelStart, varTLSelMinutes, TimeUnit.Minutes), ThisItem.RowEnd, TimeUnit.Minutes)},
                        If(
                            _res < 15,
                            "",
                            "Available " &
                            If(
                                _res >= 60,
                                Text(RoundDown(_res / 60, 0)) & "h" & If(Mod(_res, 60) > 0, " " & Text(Mod(_res, 60)) & "m", ""),
                                Text(_res) & "m"
                            )
                        )
                    )
                  VerticalAlign: =VerticalAlign.Middle
                  Visible: =!IsBlank(varTLSelStart) && ThisItem.RowStart = varTLSelRunStart
                  Width: =Parent.Width
                  X: =0
                  Y: =DateDiff(ThisItem.RowStart, varTLSelStart, TimeUnit.Minutes) * 2 + varTLSelMinutes * 2
      - recTLNowLine:
          Control: Rectangle
          Properties:
            Fill: =AppTheme.StatusBusyText
            Height: =2
            Visible: =varNowTick >= ThisItem.RowStart && varNowTick < ThisItem.RowEnd
            Width: =Parent.Width - 16
            X: =0
            Y: =DateDiff(ThisItem.RowStart, varNowTick, TimeUnit.Minutes) * 2
```

Notes for the reviewer, not edits: the `Available` duration string appears three times
(free label, ghost time, residue) because Power Fx has no template-scoped function and
`App.pa.yaml` is out of bounds — accepted duplication. The old `Book HH:mm - HH:mm`
button text, the `IsMine` green tint, and the modal-opening `OnSelect` are all
intentionally gone from this subtree; the modal now opens only from the sidebar CTA.

- [ ] **Step 4: Assert the fix**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
if ($rooms -match [regex]::Escape('lblNowMarker:')) { throw 'old now marker still present.' }
if ($rooms -match [regex]::Escape('"● now"')) { throw 'old now marker text still present.' }
# Count-based: btnRoomsBook in the browse selection bar legitimately keeps one
# WizardStep2 open. Only the free slot's copy must be gone.
$step2 = ([regex]::Matches($rooms, [regex]::Escape('Set(gbl_UI_Book_Modal_Step, WizardStep2)'))).Count
if ($step2 -ne 1) { throw "Expected exactly 1 WizardStep2 open left (btnRoomsBook), found $step2 - the free slot's old OnSelect survived." }
if ($rooms -match [regex]::Escape('AppTheme.StatusFreeBg, AppTheme.HeaderAccent')) { throw 'old booked-card conditional fill survived.' }
$new = @('lblTLNowBadge:', 'btnTLBookedTap:', 'conTLGhost:', 'lblTLGhostTitle:', 'lblTLGhostTime:', 'lblTLFreeResidue:', 'recTLNowLine:', 'varTLSelRunEnd')
$missing = $new | Where-Object { $rooms -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing: ' + ($missing -join ', ')) }
# The clamp formula must survive verbatim (moved, not modified)
if ($rooms -notmatch [regex]::Escape('Mod(15 - Mod(DateDiff(_slotStart, _now, TimeUnit.Minutes), 15), 15)')) { throw 'start-clamp formula lost.' }
'task 4 contract passed'
```

Expected: prints `task 4 contract passed`.

- [ ] **Step 5: Validate and report**

Run both validators. Expected: 0 errors, warnings ≤ baseline (itemized), 0 schema
findings. Report READY with:

```text
UNVERIFIED: ghost block pixel position, now-line offset, ManualLayout
            child sizing inside the flexible-height gallery row, and label
            OnSelect tap-through all require Studio.
```

---

### Task 5: Sidebar room card

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: `varSelectedRoom` (`Title`, `Capacity`, `description`, `Equipment`),
  `colRoomBookings`, `varNowTick`, `glbSelectedDate`.
- Produces: the populated `conTLRoomCard`.

- [ ] **Step 1: Assert the pre-state**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
if ($rooms -notmatch [regex]::Escape('conTLRoomCard:')) { throw 'Task 3 shell missing.' }
if ($rooms -match 'lblTLRoomName:') { throw 'room card already populated.' }
'pre-state confirmed'
```

- [ ] **Step 2: Populate the card**

Add a `Children:` block to `conTLRoomCard` (it has none yet):

```yaml
Children:
  - conTLStatusRow:
      Control: GroupContainer
      Variant: AutoLayout
      Properties:
        DropShadow: =DropShadow.None
        Fill: =Color.Transparent
        FillPortions: =0
        Height: =20
        LayoutAlignItems: =LayoutAlignItems.Center
        LayoutDirection: =LayoutDirection.Horizontal
        LayoutGap: =6
        LayoutMinHeight: =0
        LayoutMinWidth: =0
        Visible: =glbSelectedDate = Today()
      Children:
        - lblTLStatusDot:
            Control: Label
            Properties:
              Color: =If(!IsBlank(LookUp(colRoomBookings, StartDateTime <= varNowTick && EndDateTime > varNowTick)), AppTheme.StatusBusyText, AppTheme.StatusFreeText)
              Font: ="IBM Plex Sans"
              Height: =18
              Size: =10
              Text: ="●"
              Width: =12
        - lblTLStatusText:
            Control: Label
            Properties:
              Color: =AppTheme.TextSecondary
              FillPortions: =1
              Font: ="IBM Plex Sans"
              Size: =11
              Text: |-
                =With(
                    {_cur: LookUp(colRoomBookings, StartDateTime <= varNowTick && EndDateTime > varNowTick)},
                    If(
                        !IsBlank(_cur),
                        "Booked until " & Text(_cur.EndDateTime, "HH:mm"),
                        With(
                            {_next: First(Sort(Filter(colRoomBookings, StartDateTime > varNowTick), StartDateTime, SortOrder.Ascending))},
                            If(
                                IsBlank(_next),
                                "Free for the rest of the day",
                                "Free until " & Text(_next.StartDateTime, "HH:mm")
                            )
                        )
                    )
                )
  - lblTLRoomName:
      Control: Label
      Properties:
        Color: =AppTheme.TextPrimary
        Font: ="IBM Plex Sans"
        FontWeight: =FontWeight.Semibold
        Height: =26
        Size: =18
        Text: =varSelectedRoom.Title
  - lblTLRoomDesc:
      Control: Label
      Properties:
        Color: =AppTheme.TextSecondary
        Font: ="IBM Plex Sans"
        Height: =18
        Size: =11
        Text: |-
          =With(
              {_d: Trim(Coalesce(varSelectedRoom.description, ""))},
              If(
                  IsBlank(_d),
                  "seats " & Text(varSelectedRoom.Capacity),
                  "seats" in Lower(_d),
                  _d,
                  _d & " · seats " & Text(varSelectedRoom.Capacity)
              )
          )
        Wrap: =false
  - galTLRoomEquipment:
      Control: Gallery
      Variant: Horizontal
      Properties:
        Height: =24
        Items: |-
          =With(
              {_equipmentText: varSelectedRoom.Equipment},
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
        TemplateSize: =84
      Children:
        - lblTLRoomEquipTag:
            Control: Label
            Properties:
              Align: =Align.Center
              Color: =AppTheme.TextSecondary
              Fill: =AppTheme.SurfaceAlt
              Font: ="IBM Plex Sans"
              Height: =20
              Size: =9
              Text: =ThisItem.Value
              Width: =Parent.TemplateWidth - 4
              Wrap: =false
```

The description formula is the browse polish guarded form (spec §3 there) applied to
`varSelectedRoom` — note the lowercase `description` field name, which is what
`lblRoomsSelectedSummary` already uses for this record. The equipment `Items` formula is
the browse card's known-tag pattern with `varSelectedRoom.Equipment` substituted for
`ThisItem.Equipment`.

- [ ] **Step 3: Assert the fix**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
$new = @('conTLStatusRow:', 'lblTLStatusDot:', 'lblTLStatusText:', 'lblTLRoomName:', 'lblTLRoomDesc:', 'galTLRoomEquipment:', 'lblTLRoomEquipTag:', 'Booked until ', 'Free for the rest of the day')
$missing = $new | Where-Object { $rooms -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing: ' + ($missing -join ', ')) }
# guarded description formula now occurs twice: browse card (ThisItem) + sidebar (varSelectedRoom)
$guard = ([regex]::Matches($rooms, [regex]::Escape('"seats" in Lower(_d)'))).Count
if ($guard -ne 2) { throw "Expected 2 guarded description formulas, found $guard." }
'task 5 contract passed'
```

Expected: prints `task 5 contract passed`.

- [ ] **Step 4: Validate and report**

Run both validators. Expected: 0 errors, warnings ≤ baseline, 0 schema findings. Report
READY with:

```text
UNVERIFIED: whether varSelectedRoom.Equipment is the correct field name can
            only be proven by compile (the browse card reads ThisItem.Equipment
            from the same colRooms schema, so mismatch is unlikely).
```

---

### Task 6: Sidebar composer

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: `varTLSelStart/varTLSelMinutes/varTLSelRunEnd`, `glbSelectedDate`,
  `varSelectedRoom`, `WizardStep3`, the wizard state variables.
- Produces: the populated `conTLComposer` — chips and the Book CTA.

- [ ] **Step 1: Assert the pre-state**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
if ($rooms -notmatch [regex]::Escape('conTLComposer:')) { throw 'Task 3 shell missing.' }
if ($rooms -match 'btnTLBookCta:') { throw 'composer already populated.' }
'pre-state confirmed'
```

- [ ] **Step 2: Populate the composer**

Add a `Children:` block to `conTLComposer`. The four chips are identical except for
their minutes (30/60/90/120) and labels (`30m` / `1h` / `1h 30m` / `2h`); all four are
written out in full below — do not abbreviate them into a gallery, the fixed set is the
design.

```yaml
Children:
  - lblTLComposerEyebrow:
      Control: Label
      Properties:
        Color: =AppTheme.TextMuted
        Font: ="IBM Plex Sans"
        Height: =16
        Size: =10
        Text: ="YOUR BOOKING"
  - lblTLComposerTime:
      Control: Label
      Properties:
        Color: =If(IsBlank(varTLSelStart), AppTheme.TextMuted, AppTheme.TextPrimary)
        Font: ="IBM Plex Sans"
        FontWeight: =FontWeight.Semibold
        Height: =32
        Size: =24
        Text: =If(IsBlank(varTLSelStart), "-- : --", Text(varTLSelStart, "HH:mm") & " – " & Text(DateAdd(varTLSelStart, varTLSelMinutes, TimeUnit.Minutes), "HH:mm"))
  - lblTLComposerCaption:
      Control: Label
      Properties:
        Color: =AppTheme.TextSecondary
        Font: ="IBM Plex Sans"
        Height: =16
        Size: =11
        Text: =If(IsBlank(varTLSelStart), "Choose a start time on the timeline", Text(glbSelectedDate, "ddd dd mmmm") & " · " & varSelectedRoom.Title)
  - lblTLDurationLabel:
      Control: Label
      Properties:
        Color: =AppTheme.TextMuted
        Font: ="IBM Plex Sans"
        Height: =14
        Size: =10
        Text: ="Duration"
  - conTLChips:
      Control: GroupContainer
      Variant: AutoLayout
      Properties:
        DropShadow: =DropShadow.None
        Fill: =Color.Transparent
        FillPortions: =0
        Height: =40
        LayoutAlignItems: =LayoutAlignItems.Stretch
        LayoutDirection: =LayoutDirection.Horizontal
        LayoutGap: =8
        LayoutMinHeight: =0
        LayoutMinWidth: =0
      Children:
        - btnTLChip30:
            Control: Classic/Button
            Properties:
              BorderColor: =AppTheme.Border
              BorderThickness: =1
              Color: =If(varTLSelMinutes = 30, AppTheme.Surface, AppTheme.TextPrimary)
              DisabledBorderColor: =AppTheme.Border
              DisabledColor: =AppTheme.TextMuted
              DisabledFill: =AppTheme.SurfaceAlt
              DisplayMode: =If(IsBlank(varTLSelStart) || DateAdd(varTLSelStart, 30, TimeUnit.Minutes) > varTLSelRunEnd, DisplayMode.Disabled, DisplayMode.Edit)
              Fill: =If(varTLSelMinutes = 30, AppTheme.TextPrimary, AppTheme.Surface)
              FillPortions: =1
              FocusedBorderColor: =ColorValue(AppTheme.Primary)
              FocusedBorderThickness: =2
              Font: ="IBM Plex Sans"
              Height: =40
              HoverColor: =If(varTLSelMinutes = 30, AppTheme.Surface, AppTheme.TextPrimary)
              HoverFill: =If(varTLSelMinutes = 30, AppTheme.TextPrimary, AppTheme.SurfaceAlt)
              OnSelect: =UpdateContext({varTLSelMinutes: 30})
              PressedColor: =If(varTLSelMinutes = 30, AppTheme.Surface, AppTheme.TextPrimary)
              PressedFill: =If(varTLSelMinutes = 30, AppTheme.TextPrimary, AppTheme.SurfaceAlt)
              Size: =11
              Text: ="30m"
        - btnTLChip60:
            Control: Classic/Button
            Properties:
              BorderColor: =AppTheme.Border
              BorderThickness: =1
              Color: =If(varTLSelMinutes = 60, AppTheme.Surface, AppTheme.TextPrimary)
              DisabledBorderColor: =AppTheme.Border
              DisabledColor: =AppTheme.TextMuted
              DisabledFill: =AppTheme.SurfaceAlt
              DisplayMode: =If(IsBlank(varTLSelStart) || DateAdd(varTLSelStart, 60, TimeUnit.Minutes) > varTLSelRunEnd, DisplayMode.Disabled, DisplayMode.Edit)
              Fill: =If(varTLSelMinutes = 60, AppTheme.TextPrimary, AppTheme.Surface)
              FillPortions: =1
              FocusedBorderColor: =ColorValue(AppTheme.Primary)
              FocusedBorderThickness: =2
              Font: ="IBM Plex Sans"
              Height: =40
              HoverColor: =If(varTLSelMinutes = 60, AppTheme.Surface, AppTheme.TextPrimary)
              HoverFill: =If(varTLSelMinutes = 60, AppTheme.TextPrimary, AppTheme.SurfaceAlt)
              OnSelect: =UpdateContext({varTLSelMinutes: 60})
              PressedColor: =If(varTLSelMinutes = 60, AppTheme.Surface, AppTheme.TextPrimary)
              PressedFill: =If(varTLSelMinutes = 60, AppTheme.TextPrimary, AppTheme.SurfaceAlt)
              Size: =11
              Text: ="1h"
        - btnTLChip90:
            Control: Classic/Button
            Properties:
              BorderColor: =AppTheme.Border
              BorderThickness: =1
              Color: =If(varTLSelMinutes = 90, AppTheme.Surface, AppTheme.TextPrimary)
              DisabledBorderColor: =AppTheme.Border
              DisabledColor: =AppTheme.TextMuted
              DisabledFill: =AppTheme.SurfaceAlt
              DisplayMode: =If(IsBlank(varTLSelStart) || DateAdd(varTLSelStart, 90, TimeUnit.Minutes) > varTLSelRunEnd, DisplayMode.Disabled, DisplayMode.Edit)
              Fill: =If(varTLSelMinutes = 90, AppTheme.TextPrimary, AppTheme.Surface)
              FillPortions: =1
              FocusedBorderColor: =ColorValue(AppTheme.Primary)
              FocusedBorderThickness: =2
              Font: ="IBM Plex Sans"
              Height: =40
              HoverColor: =If(varTLSelMinutes = 90, AppTheme.Surface, AppTheme.TextPrimary)
              HoverFill: =If(varTLSelMinutes = 90, AppTheme.TextPrimary, AppTheme.SurfaceAlt)
              OnSelect: =UpdateContext({varTLSelMinutes: 90})
              PressedColor: =If(varTLSelMinutes = 90, AppTheme.Surface, AppTheme.TextPrimary)
              PressedFill: =If(varTLSelMinutes = 90, AppTheme.TextPrimary, AppTheme.SurfaceAlt)
              Size: =11
              Text: ="1h 30m"
        - btnTLChip120:
            Control: Classic/Button
            Properties:
              BorderColor: =AppTheme.Border
              BorderThickness: =1
              Color: =If(varTLSelMinutes = 120, AppTheme.Surface, AppTheme.TextPrimary)
              DisabledBorderColor: =AppTheme.Border
              DisabledColor: =AppTheme.TextMuted
              DisabledFill: =AppTheme.SurfaceAlt
              DisplayMode: =If(IsBlank(varTLSelStart) || DateAdd(varTLSelStart, 120, TimeUnit.Minutes) > varTLSelRunEnd, DisplayMode.Disabled, DisplayMode.Edit)
              Fill: =If(varTLSelMinutes = 120, AppTheme.TextPrimary, AppTheme.Surface)
              FillPortions: =1
              FocusedBorderColor: =ColorValue(AppTheme.Primary)
              FocusedBorderThickness: =2
              Font: ="IBM Plex Sans"
              Height: =40
              HoverColor: =If(varTLSelMinutes = 120, AppTheme.Surface, AppTheme.TextPrimary)
              HoverFill: =If(varTLSelMinutes = 120, AppTheme.TextPrimary, AppTheme.SurfaceAlt)
              OnSelect: =UpdateContext({varTLSelMinutes: 120})
              PressedColor: =If(varTLSelMinutes = 120, AppTheme.Surface, AppTheme.TextPrimary)
              PressedFill: =If(varTLSelMinutes = 120, AppTheme.TextPrimary, AppTheme.SurfaceAlt)
              Size: =11
              Text: ="2h"
  - btnTLBookCta:
      Control: Classic/Button
      Properties:
        BorderColor: =ColorValue(AppTheme.ButtonPrimary)
        BorderThickness: =1
        Color: =ColorValue(AppTheme.PrimaryText)
        DisabledBorderColor: =AppTheme.Border
        DisabledColor: =ColorValue(AppTheme.ButtonDisabledText)
        DisabledFill: =ColorValue(AppTheme.ButtonDisabled)
        DisplayMode: =If(IsBlank(varTLSelStart), DisplayMode.Disabled, DisplayMode.Edit)
        Fill: =ColorValue(AppTheme.ButtonPrimary)
        FocusedBorderColor: =ColorValue(AppTheme.Primary)
        FocusedBorderThickness: =2
        Font: ="IBM Plex Sans"
        Height: =48
        OnSelect: |-
          =Set(varSelectedDate, glbSelectedDate);
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
          ClearCollect(varAlternativeRooms, Filter(colRooms, true = false));
          Set(varStartTime, varTLSelStart);
          Set(varEndTime, DateAdd(varTLSelStart, varTLSelMinutes, TimeUnit.Minutes));
          Set(gbl_UI_Book_Modal_Step, WizardStep2);
          Set(gbl_UI_Book_Modal, true)
        Size: =12
        Text: =If(IsBlank(varTLSelStart), "Select a time", "Book " & Text(varTLSelStart, "HH:mm") & " – " & Text(DateAdd(varTLSelStart, varTLSelMinutes, TimeUnit.Minutes), "HH:mm"))
```

The CTA's `OnSelect` is the old `btnFreeSlot` initialisation block with the time
computation replaced by the selection variables. The step stays `WizardStep2` —
*amended after final review*: the wizard's step 3 is confirm-only (no title input) and
its Confirm gate requires a non-blank `varTitle`, so a direct `WizardStep3` jump
dead-ends. See the spec's amended Decision 1.

- [ ] **Step 3: Assert the fix**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
$new = @('lblTLComposerEyebrow:', 'lblTLComposerTime:', 'lblTLComposerCaption:', 'lblTLDurationLabel:', 'conTLChips:', 'btnTLChip30:', 'btnTLChip60:', 'btnTLChip90:', 'btnTLChip120:', 'btnTLBookCta:', '"-- : --"', 'Select a time')
$missing = $new | Where-Object { $rooms -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing: ' + ($missing -join ', ')) }
$step3 = ([regex]::Matches($rooms, [regex]::Escape('Set(gbl_UI_Book_Modal_Step, WizardStep3)'))).Count
if ($step3 -ne 0) { throw "Expected 0 WizardStep3 opens (amended Decision 1), found $step3." }
$step2 = ([regex]::Matches($rooms, [regex]::Escape('Set(gbl_UI_Book_Modal_Step, WizardStep2)'))).Count
if ($step2 -ne 2) { throw "Expected exactly 2 WizardStep2 opens (browse-bar Book + composer CTA), found $step2." }
'task 6 contract passed'
```

Expected: prints `task 6 contract passed`. (The browse selection bar's `btnRoomsBook`
legitimately keeps its `WizardStep2` open — it starts a booking with no time chosen.)

- [ ] **Step 4: Validate and report**

Run both validators. Expected: 0 errors, warnings ≤ baseline, 0 schema findings. Report
READY with:

```text
UNVERIFIED: whether the wizard renders correctly when opened directly at
            WizardStep3 (its step-2 controls never touched this session) is
            the highest-behaviour-risk item and MUST be exercised in Studio.
```

---

### Task 7: DS1 sweep and integrated contract

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: the Task 1 RGBA counts.
- Produces: a timeline region free of raw colour literals (alpha overlays excepted), and
  the whole-change integrated assertion.

- [ ] **Step 1: Convert the `btn_LoadTimeline` style literals**

The loader button is `Visible: =false`, so these are dead styles, but they are the last
raw colours in the region. Change its properties:

| From | To |
|---|---|
| `BorderColor: =RGBA(0, 0, 0, 0)` | `BorderColor: =Color.Transparent` |
| `Color: =RGBA(255, 255, 255, 1)` | `Color: =ColorValue(AppTheme.PrimaryText)` |
| `DisabledBorderColor: =RGBA(0, 0, 0, 0)` | `DisabledBorderColor: =Color.Transparent` |
| `DisabledColor: =RGBA(161, 159, 157, 1)` | `DisabledColor: =AppTheme.TextMuted` |
| `DisabledFill: =RGBA(242, 242, 241, 0)` | `DisabledFill: =Color.Transparent` |
| `Fill: =RGBA(0, 120, 212, 1)` | `Fill: =ColorValue(AppTheme.Primary)` |
| `HoverBorderColor: =RGBA(0, 0, 0, 0)` | `HoverBorderColor: =Color.Transparent` |
| `HoverColor: =RGBA(255, 255, 255, 1)` | `HoverColor: =ColorValue(AppTheme.PrimaryText)` |
| `HoverFill: =RGBA(16, 110, 190, 1)` | `HoverFill: =ColorValue(AppTheme.Primary)` |
| `PressedBorderColor: =RGBA(0, 69, 120, 1)` | `PressedBorderColor: =Color.Transparent` |
| `PressedColor: =RGBA(255, 255, 255, 1)` | `PressedColor: =ColorValue(AppTheme.PrimaryText)` |
| `PressedFill: =RGBA(16, 110, 190, 1)` | `PressedFill: =ColorValue(AppTheme.Primary)` |

`OnSelect`, `Visible`, `X`, `Y`, and the radius properties are untouched.

- [ ] **Step 2: Sweep the region for stragglers**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
$start = $rooms.IndexOf('- con_timeline_view:')
$end = $rooms.IndexOf('- conRoomsSelectionBar:')
$tl = $rooms.Substring($start, $end - $start)
[regex]::Matches($tl, '.*RGBA\(.*') | ForEach-Object { $_.Value.Trim() }
```

Every line printed must be an alpha overlay of the form `RGBA(0, 0, 0, 0.04)` or
`RGBA(0, 0, 0, 0.08)` (Task 4 added exactly 4: hover+press on `btnTLBookedTap` and
`btnFreeSlot`). Convert anything else to a token per the table above; if a token
genuinely cannot express it, stop and report rather than inventing a colour.

- [ ] **Step 3: Run the integrated contract**

```powershell
$rooms = [System.IO.File]::ReadAllText((Join-Path $workDir 'Rooms.pa.yaml'))
$start = $rooms.IndexOf('- con_timeline_view:')
$end = $rooms.IndexOf('- conRoomsSelectionBar:')
$tl = $rooms.Substring($start, $end - $start)
# Region cleanliness
$rgbaAll = ([regex]::Matches($tl, 'RGBA\(')).Count
$rgbaOverlay = ([regex]::Matches($tl, 'RGBA\(0, 0, 0, 0\.0')).Count
if ($rgbaAll -ne 4 -or $rgbaOverlay -ne 4) { throw "Timeline region RGBA: total $rgbaAll, overlays $rgbaOverlay - expected 4/4." }
if ($tl -match [regex]::Escape('Font: =Font.Lato')) { throw 'Lato survived in the timeline region.' }
# Structure: every new control present exactly once
@('conTLPageHeader:', 'btnTLBack:', 'lblTLTitle:', 'lblTLStat:', 'conTLBody:', 'conTLCard:',
  'conTLCardHeader:', 'lblTLDate:', 'conTLCardDivider:', 'lblTLNowBadge:', 'btnTLBookedTap:',
  'conTLGhost:', 'lblTLFreeResidue:', 'recTLNowLine:', 'conTLSidebar:', 'conTLRoomCard:',
  'lblTLRoomName:', 'galTLRoomEquipment:', 'conTLComposer:', 'btnTLChip30:', 'btnTLChip60:',
  'btnTLChip90:', 'btnTLChip120:', 'btnTLBookCta:') | ForEach-Object {
  $count = ([regex]::Matches($rooms, [regex]::Escape($_))).Count
  if ($count -ne 1) { throw "Expected exactly 1 $_ found $count." }
}
# Removed structures stay removed
@('con_timelineheader:', 'lblHeaderSummary:', 'lblCurrentDate:', 'lblNowMarker:', 'varShowDatePicker') |
  ForEach-Object { if ($rooms -match [regex]::Escape($_)) { throw "Forbidden: $_" } }
# Wiring counts across the whole file
if ((([regex]::Matches($rooms, [regex]::Escape('varTLSelStart: Blank()'))).Count) -ne 7) { throw 'Expected 7 selection clears (back, today, 2 chevrons, date picker, entry, submit).' }
if ((([regex]::Matches($rooms, 'BookingID: ')).Count) -ne 4) { throw 'Engine fields lost.' }
# Encoding canaries
if ($rooms -notmatch [regex]::Escape('●')) { throw 'Status dot glyph lost - encoding corrupted.' }
if ($rooms -notmatch [regex]::Escape('·')) { throw 'Middot glyph lost - encoding corrupted.' }
if ($rooms -notmatch [regex]::Escape('←')) { throw 'Back-arrow glyph lost - encoding corrupted.' }
'integrated contract passed'
```

Expected: prints `integrated contract passed`.

- [ ] **Step 4: Validate, diff, report**

```powershell
node tools/pa-lint/lint.js --src $workDir
node tools/pa-schema-validate/validate.js --src $workDir
git diff --no-index -- (Join-Path $baseDir 'Rooms.pa.yaml') (Join-Path $workDir 'Rooms.pa.yaml')
git diff --no-index -- (Join-Path $baseDir 'App.pa.yaml') (Join-Path $workDir 'App.pa.yaml')
```

Expected: 0 errors; warnings ≤ baseline with any delta itemized; 0 findings; the
`App.pa.yaml` diff is **empty**. Review the Rooms diff for: no `RoomsBrowse*` change, no
browse-subtree change beyond `btnRoomsViewToday`, no engine change beyond the additive
fields, and the wizard instance change limited to the one `UpdateContext` line. Report
READY with the full diff.

---

### Task 8: Publish once, commit, verify

> **Publisher only.** Workers stop at Task 7. This task requires the guard lock and a
> human co-attached in Studio.

**Files:**
- Publish from: a fresh publisher scratch directory based on a new `sync_canvas`
- Commit: `Src/Rooms.pa.yaml`
- Inspect: `docs/APP-CHECKER-BASELINE.md`

- [ ] **Step 1: Review the cumulative diff** (as produced in Task 7 Step 4).

- [ ] **Step 2: Acquire the lock**

The human opens the app in Power Apps Studio and stays co-attached.

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh status
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh lock "rooms timeline redesign"
```

If the lock is held, stop and coordinate. Do not bypass it.

- [ ] **Step 3: Re-sync immediately before publishing**

```powershell
$publishStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$publishDir = Join-Path $repoRoot ('.scratch\tl-redesign-publish-' + $publishStamp)
New-Item -ItemType Directory -Path $publishDir | Out-Null
```

Call `sync_canvas` into `$publishDir`, then:

```powershell
git diff --no-index -- (Join-Path $baseDir 'Rooms.pa.yaml') (Join-Path $publishDir 'Rooms.pa.yaml')
```

If live moved: release the lock, rebase the reviewed diff onto the new live file, rerun
the Task 2-7 assertions, then reacquire and re-sync. Never retry an unchanged blocked
publish (RULES P1). If live did not move:

```powershell
Copy-Item -LiteralPath (Join-Path $workDir 'Rooms.pa.yaml') -Destination (Join-Path $publishDir 'Rooms.pa.yaml') -Force
node tools/pa-lint/lint.js --src $publishDir
node tools/pa-schema-validate/validate.js --src $publishDir
```

Expected: 0 errors, warnings as reported in Task 7, 0 findings.

- [ ] **Step 4: Publish and commit in the same breath**

Call `compile_canvas` with the absolute `$publishDir`. Expected: 0 errors.

On any compile error: capture it in full, run `guard.sh unlock`, return to the owning
task. Do not copy into `Src`, do not commit, do not retry the same directory unchanged.

On success:

```powershell
Copy-Item -LiteralPath (Join-Path $publishDir 'Rooms.pa.yaml') -Destination (Join-Path $repoRoot 'Src\Rooms.pa.yaml') -Force
git add -- Src\Rooms.pa.yaml
git diff --cached --check
git commit -m "feat(rooms): timeline redesign with booking composer (DS1,P4)"
```

The human saves in Studio immediately so the version persists (RULES P7).

- [ ] **Step 5: Fresh-sync marker verification**

```powershell
$postStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$postDir = Join-Path $repoRoot ('.scratch\tl-redesign-postpublish-' + $postStamp)
New-Item -ItemType Directory -Path $postDir | Out-Null
```

Call `sync_canvas` into `$postDir`, then:

```powershell
node tools/pa-lint/lint.js check-markers "conTLSidebar:" --src $postDir
node tools/pa-lint/lint.js check-markers "btnTLBookCta:" --src $postDir
node tools/pa-lint/lint.js check-markers "conTLGhost:" --src $postDir
node tools/pa-lint/lint.js check-markers "IsMasked" --src $postDir
```

Expected: all four present. Then record the rung and release:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh verified "rung 3 marker greps"
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh unlock
& 'C:\Program Files\Git\bin\bash.exe' tools/pac-verify/pac-verify.sh freshness
```

- [ ] **Step 6: Studio behavioural acceptance**

This is where the change is actually judged. On today's date, light theme, 1366px:

1. Page header, card, and sidebar render per spec AC 1-2; no blue header, no stepper.
2. Free areas show only `Available Xh Ym`; booked blocks are grey with accent bar
   (AC 3-4).
3. Tap a free run → sidebar populates, ghost appears at the right position/height;
   chips reflect fit — find (or create) a run where only `30m` fits and confirm the
   other three chips are disabled (AC 5).
4. No selection → `-- : --`, prompt caption, chips and CTA disabled (AC 6).
5. **CTA → wizard opens at step 3 with the sidebar's exact times; complete a booking;
   timeline refreshes, new booking appears, selection cleared. Cancel path keeps the
   selection** (AC 7). This is the highest-risk behaviour — exercise it first.
6. Chevrons, Today, date picker, back, and re-entry each clear the selection (AC 8).
7. Now badge and line appear today at the right position; navigate to tomorrow —
   both gone, status line gone (AC 9-10).
8. Tap an unmasked booked block → `bookingDetail` opens for that booking; return
   restores the timeline. A `Busy` block does not respond (AC 11).
9. IBM Plex Sans everywhere in the timeline; compare against the shell header (AC 12).
10. Dark theme pass over all of the above (AC 13).
11. Stacked layout below 1024px: card first, sidebar below, nothing clipped.
12. Browse state unregressed: selection, filters, Book from the selection bar (AC 15).

- [ ] **Step 7: App Checker**

Run App Checker in Studio after saving and compare with `docs/APP-CHECKER-BASELINE.md`:
High stays 0, and no new Medium/Performance issue beyond the documented baseline. If it
increases, do not release to players — fix, revalidate, run a new guarded cycle.

- [ ] **Step 8: Report honestly**

State the highest rung actually observed with a timestamp and list anything still
unverified. If the wizard misbehaves at step 3, or the ghost lands off-position, say so —
the owning task gets the defect back; the publish does not get re-claimed as done.

---

## Completion Checklist

- [ ] Only `Src/Rooms.pa.yaml` changed. `App.pa.yaml` diff is empty.
- [ ] Browse-polish gate was verified before any edit.
- [ ] Page header + card + sidebar structure per spec; old blue header gone.
- [ ] Row engine untouched except `BookingID`/`IsMasked` on all four Collect sites.
- [ ] Free-run tap selects; chips disable when oversize; ghost renders in-row.
- [ ] CTA opens wizard at step 3; submit refreshes and clears; cancel keeps selection.
- [ ] All seven selection-clear sites present.
- [ ] Booked tap-through works; `Busy` blocks inert.
- [ ] Now badge + line today only; sidebar status line today only.
- [ ] Timeline region has no raw colour except the 4 alpha overlays; all Plex.
- [ ] `pa-lint` 0 errors, warnings ≤ baseline (delta itemized); schema 0 findings.
- [ ] `compile_canvas` 0 errors under the guard lock; commit matches published source.
- [ ] Markers verified from a fresh sync; App Checker not increased.
- [ ] Studio behavioural acceptance completed and reported as "rung N at HH:mm".
