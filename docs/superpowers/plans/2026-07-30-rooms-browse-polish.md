# Rooms Browse Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repository override:** `CLAUDE.md` and `docs/PUBLISHING-PROTOCOL.md` govern Canvas execution and outrank the generic skill guidance. Workers edit and lint a scratch copy, **never** call `compile_canvas`, and **never** commit (RULES O1). The single publisher applies reviewed diffs, holds the guard lock, publishes once, and commits in the same breath.

**Goal:** Fix the Carbon visual defects in the Rooms browse state — inverted card layering, colliding card text, invisible equipment pills, duplicated capacity, truncated toolbar controls, and Lato typography.

**Architecture:** Pure presentation change. Every edit is a property value inside `Src/Rooms.pa.yaml`. No named formula, no filter semantic, no selection/Today/Week/Book behaviour, and no data source is touched. `Src/App.pa.yaml` is not modified.

**Tech Stack:** Power Apps Canvas YAML, Power Fx, IBM Carbon tokens in `AppTheme`, canvas-authoring MCP, Node.js validators (`pa-lint`, `pa-schema-validate`), Git Bash canvas-guard.

---

## Why there are no unit tests

A canvas app has no local runtime, so "run the test" cannot mean executing the UI. This
repo's established substitute — used by the parent plan
`2026-07-30-rooms-selection-redesign.md` — is a **static contract assertion**: a PowerShell
snippet that greps the YAML for anchors that must be present or absent. Each task therefore
follows: assert-fails → edit → assert-passes → validators → report.

Anything a grep cannot prove (does the font actually render? does text still overlap at
1024px?) is explicitly listed as `UNVERIFIED` and deferred to the Studio rung. Do not
claim it from a passing assertion.

## Global Constraints

- `Src/Rooms.pa.yaml` is the only file changed. If a task seems to need `App.pa.yaml`, stop and report.
- Do not alter any `RoomsBrowse*` reference, filter expression, `OnSelect`, `Visible`, or `Items` formula.
- Do not touch `con_timeline_view` except for its 8 `Font: =Font.Lato` sites (Task 6).
- Do not add controls except the single new `lblRoomsCardStatusDot` (Task 4).
- Use `AppTheme` tokens; add no new raw colour.
- Anchor every edit by quoted YAML, never by line number — line numbers shift as you edit.
- The live app is the source of truth. App ID `498d4962-0b5f-4990-a400-1bf5de9a367c`, environment `Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd`, login hint `harry@harry-burton.ai`.
- Follow RULES P1-P10, Y1-Y9, DS1, O1-O3.

## File Map

- **Modify:** `Src/Rooms.pa.yaml` — the only production change. Browse container (`con_rooms_view` subtree) for Tasks 2-5 and 7; whole-file font sweep in Task 6.
- **Read-only reference:** `docs/superpowers/specs/2026-07-30-rooms-browse-polish-design.md` — approved behaviour and acceptance criteria.
- **Read-only reference:** `Src/App.pa.yaml` — `ThemeMap` token names only. Do not edit.
- **Read-only reference:** `Src/Components/Shell_Header.pa.yaml` — the proven `Font: ="IBM Plex Sans"` literal.

## Execution Topology

One synced base, one working copy:

```powershell
$repoRoot = 'C:\Users\harry\Documents\dev\power-apps\booking-tool'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$baseDir = Join-Path $repoRoot ('.scratch\rooms-polish-base-' + $stamp)
$workDir = Join-Path $repoRoot ('.scratch\rooms-polish-work-' + $stamp)
New-Item -ItemType Directory -Path $baseDir,$workDir | Out-Null
```

After `connect`, `sync_canvas` into `$baseDir`, then:

```powershell
Get-ChildItem -Force -LiteralPath $baseDir | Copy-Item -Destination $workDir -Recurse
```

All edits happen in `$workDir\Rooms.pa.yaml`. Workers diff against `$baseDir`.

---

### Task 1: Establish the live baseline

**Files:**
- Inspect: `Src/Rooms.pa.yaml`
- Generate outside git: `$baseDir/**/*.pa.yaml`, `$workDir/**/*.pa.yaml`

**Interfaces:**
- Consumes: the live app IDs in Global Constraints.
- Produces: an immutable synced base, a byte-identical working copy, and the validator baseline every later task compares against.

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

Call `sync_canvas` with the absolute `$baseDir` path, then run the `Copy-Item` command from Execution Topology.

- [ ] **Step 3: Confirm live matches git**

```powershell
git diff --no-index -- Src\Rooms.pa.yaml (Join-Path $baseDir 'Rooms.pa.yaml')
git diff --no-index -- Src\App.pa.yaml (Join-Path $baseDir 'App.pa.yaml')
```

Expected: no output from either.

If either differs, the live app moved since this plan was written. Stop feature work, copy the full live sync into `Src`, review, and commit a reconciliation:

```powershell
Get-ChildItem -Force -LiteralPath $baseDir | Copy-Item -Destination (Join-Path $repoRoot 'Src') -Recurse -Force
git add -- Src
git commit -m "sync(canvas): reconcile live before rooms polish (P5)"
```

Then create fresh base and work directories. Do not continue from stale ones.

- [ ] **Step 4: Record the validator baseline**

```powershell
node tools/pa-lint/lint.js --src $baseDir
node tools/pa-schema-validate/validate.js --src $baseDir
```

Expected: `pa-lint: 0 error(s), 18 warning(s)` and 0 schema findings. Every later task must match this, not merely "have no errors".

- [ ] **Step 5: Record the baseline hash**

```powershell
Get-FileHash (Join-Path $baseDir 'Rooms.pa.yaml') -Algorithm SHA256
```

Quote this hash in every READY report.

---

### Task 2: Card surface and grid gutters

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: `AppTheme.Surface`, `AppTheme.Border`.
- Produces: white discrete cards on the page background, separated by gutters. Also makes the `#f4f4f4` equipment pills visible, since they no longer sit on an identical fill.

- [ ] **Step 1: Assert the defect is present**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
if ($rooms -notmatch [regex]::Escape('Fill: =AppTheme.layer01Bg')) { throw 'Expected grey card fill not found - baseline drifted.' }
if ($rooms -notmatch [regex]::Escape('TemplatePadding: =0')) { throw 'Expected zero template padding not found - baseline drifted.' }
if ($rooms -notmatch [regex]::Escape('BorderColor: =RGBA(245, 245, 245, 1)')) { throw 'Expected raw gallery border not found - baseline drifted.' }
'defects confirmed present'
```

Expected: prints `defects confirmed present`.

- [ ] **Step 2: Turn the card white**

In the `con_tile_view` Properties block, change:

```yaml
                                    Fill: =AppTheme.layer01Bg
```

to:

```yaml
                                    Fill: =AppTheme.Surface
```

This is the only `Fill: =AppTheme.layer01Bg` inside `con_tile_view`. Leave the toolbar controls' `Fill: =AppTheme.layer01Bg` (on `txtRoomsSearch`, `drpRoomsCapacity`, `drpRoomsSort`) untouched — Carbon input fields are correctly layer-01.

- [ ] **Step 3: Add gutters and drop the raw border**

In `gal_rooms_view` Properties, change:

```yaml
                              TemplatePadding: =0
```

to:

```yaml
                              TemplatePadding: =8
```

and delete this whole line:

```yaml
                              BorderColor: =RGBA(245, 245, 245, 1)
```

- [ ] **Step 4: Assert the fix**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
# Count-based, NOT presence-based: 4 other controls already use AppTheme.Surface
# (in con_timeline_view and conRoomsSelectionBar), so a plain -match would pass
# even if this edit were never made. The line anchor also stops SurfaceAlt matching.
$surface = ([regex]::Matches($rooms, '(?m)^\s*Fill: =AppTheme\.Surface\s*$')).Count
if ($surface -ne 5) { throw "Expected 5 AppTheme.Surface fills (4 pre-existing + the card), found $surface." }
$layer = ([regex]::Matches($rooms, '(?m)^\s*Fill: =AppTheme\.layer01Bg\s*$')).Count
if ($layer -ne 3) { throw "Expected 3 layer01Bg fills left (the toolbar inputs), found $layer." }
if ($rooms -notmatch [regex]::Escape('TemplatePadding: =8')) { throw 'Gutter padding not applied.' }
if ($rooms -match [regex]::Escape('BorderColor: =RGBA(245, 245, 245, 1)')) { throw 'Raw gallery border still present.' }
'task 2 contract passed'
```

Expected: prints `task 2 contract passed`. If `$layer` is 0 you have wrongly converted the
three toolbar inputs as well — Carbon input fields are correctly layer-01.

- [ ] **Step 5: Validate**

```powershell
node tools/pa-lint/lint.js --src $workDir
node tools/pa-schema-validate/validate.js --src $workDir
```

Expected: `0 error(s), 18 warning(s)`, 0 schema findings.

- [ ] **Step 6: Report**

```text
STATUS: READY
FILES:  Rooms.pa.yaml
BASE:   <sha256 from Task 1 Step 5>
LINT:   0 errors, 18 warnings (matches baseline)
DIFF:   <unified diff vs $baseDir>
UNVERIFIED: gutter width and card contrast require Studio
```

Do not compile. Do not commit.

---

### Task 3: Card geometry — stop the text/strip collision

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: nothing new.
- Produces: a fixed, non-overlapping card stack inside the unchanged `TemplateSize: =200`.

The root cause: `lbl_textID_Desc` has `AutoHeight: =true` inside a **ManualLayout** container. It grows downward but does not displace siblings, so a wrapped description renders on top of the availability strip.

- [ ] **Step 1: Assert the defect**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
if ($rooms -notmatch [regex]::Escape('AutoHeight: =true')) { throw 'Expected AutoHeight defect not found - baseline drifted.' }
'defect confirmed present'
```

- [ ] **Step 2: Pin the description to one line**

In `lbl_textID_Desc`, change:

```yaml
                                          AutoHeight: =true
```

to:

```yaml
                                          AutoHeight: =false
```

and add this property to the same block, keeping alphabetical order (after `Text`, before `Width`):

```yaml
                                          Wrap: =false
```

- [ ] **Step 3: Re-lay the card stack**

Apply these exact `Y` and `Height` values. Each control already exists; change only these two properties on each, leaving `X`, `Width`, `Text`, `Color`, and everything else alone.

| Control | `Y` | `Height` |
|---|---|---|
| `lblRoomsCardStatus` | `=16` | `=18` |
| `lbl_textID_Card` | `=44` | `=26` |
| `lbl_textID_Desc` | `=72` | `=18` |
| `galRoomsAvailabilitySegments` | `=112` | `=8` |
| `lblRoomsStripStart` | `=124` | `=14` |
| `lblRoomsStripMid` | `=124` | `=14` |
| `lblRoomsStripEnd` | `=124` | `=14` |
| `galRoomsCardEquipment` | `=160` | `=24` |

`lblRoomsStripEnd` currently has `Height: =10`, which clips its own `Size: =9` text — that is why it must go to 14 along with the other two.

Content now ends at 184, leaving a 16px bottom margin inside the 200px template.

- [ ] **Step 4: Assert the fix**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
# Count-based, NOT presence-based. AutoHeight: =true occurs 3x in the base: the
# card's lbl_textID_Desc (the target) plus lblBookingTitle and lblBookedBy inside
# con_timeline_view, which are out of scope and MUST survive. A plain -match would
# fail here even when the edit is perfectly correct.
$ah = ([regex]::Matches($rooms, [regex]::Escape('AutoHeight: =true'))).Count
if ($ah -ne 2) { throw "Expected 2 AutoHeight: =true sites left (both in con_timeline_view), found $ah." }
if ($rooms -notmatch [regex]::Escape('AutoHeight: =false')) { throw 'Card AutoHeight not set to false.' }
if ($rooms -notmatch [regex]::Escape('Wrap: =false')) { throw 'Wrap: =false not added.' }
if ($rooms -match '(?m)^\s*Height: =10\s*$') { throw 'lblRoomsStripEnd still has clipping height 10.' }
if ($rooms -notmatch [regex]::Escape('TemplateSize: =200')) { throw 'Card template size must stay 200.' }
'task 3 contract passed'
```

Expected: prints `task 3 contract passed`.

- [ ] **Step 5: Verify the stack arithmetic by hand**

Confirm on paper that no row overlaps the next: 16+18=34 < 44; 44+26=70 < 72; 72+18=90 < 112; 112+8=120 < 124; 124+14=138 < 160; 160+24=184 < 200. Report this arithmetic in the READY report.

- [ ] **Step 6: Validate and report**

Run both validators (expect `0 error(s), 18 warning(s)`, 0 findings). Report:

```text
UNVERIFIED: actual rendered text height at 1366/1024/767px requires Studio.
            Wrap:=false clips long descriptions by design - confirm clipping
            is acceptable for the longest description in Book_Rooms.
```

---

### Task 4: Duplicated capacity, and the status dot split

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: `ThisItem.Description`, `ThisItem.Capacity`, `ThisItem.StatusKey`, `ThisItem.StatusText`, `AppTheme.TextSecondary`.
- Produces: a single `seats N`, and a semantically coloured dot beside neutral status text.

- [ ] **Step 1: Assert both defects**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
if ($rooms -notmatch [regex]::Escape('"seats " & Text(ThisItem.Capacity)')) { throw 'Expected unconditional capacity append not found.' }
if ($rooms -notmatch [regex]::Escape('Text: ="● " & ThisItem.StatusText')) { throw 'Expected combined dot+text label not found.' }
'defects confirmed present'
```

- [ ] **Step 2: Guard the capacity append**

`description` values already contain capacity (`"Huddle space · seats 4"`), so the current
formula produces `"Huddle space · seats 4 · seats 4"`. Replace the whole `Text` block on
`lbl_textID_Desc`:

```yaml
                                          Text: |-
                                            =With(
                                                {_description: Coalesce(ThisItem.Description, "")},
                                                _description &
                                                If(!IsBlank(_description), " · ", "") &
                                                "seats " & Text(ThisItem.Capacity)
                                            )
```

with:

```yaml
                                          Text: |-
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

`in` is Power Fx's case-insensitive substring operator, but `Lower()` is kept for explicitness and to survive a future switch to `exactin`.

- [ ] **Step 3: Strip the dot out of the status label**

On `lblRoomsCardStatus`, change:

```yaml
                                          Text: ="● " & ThisItem.StatusText
```

to:

```yaml
                                          Text: =ThisItem.StatusText
```

then change its `Color`, `X`, and `Width` to:

```yaml
                                          Color: =AppTheme.TextSecondary
                                          Width: =Parent.Width - 80
                                          X: =32
```

Its `Y: =16` and `Height: =18` were set in Task 3 — do not change them again.

- [ ] **Step 4: Add the dot control**

Insert a new control immediately **before** `- lblRoomsCardStatus:` in the `con_tile_view`
`Children:` list, at the same indentation as its siblings. It carries the semantic colour
expression that was previously on the combined label:

```yaml
                                    - lblRoomsCardStatusDot:
                                        Control: Label
                                        Properties:
                                          Color: =Switch(ThisItem.StatusKey, "Busy", AppTheme.TextMuted, "OutsideHours", AppTheme.TextMuted, AppTheme.StatusFreeText)
                                          Font: ="IBM Plex Sans"
                                          Height: =18
                                          Size: =10
                                          Text: ="●"
                                          Width: =12
                                          X: =16
                                          Y: =16
```

Width 12 at X 16 ends at 28; the status text starts at X 32. The text's
`Width: =Parent.Width - 80` ends at `Parent.Width - 48`, clearing `lblRoomsSelectedCheck`
which starts at `Parent.Width - 36`.

`btn_Card.Text` already includes `ThisItem.StatusText` and supplies the card's accessible
name, so splitting the visual label adds no screen-reader duplication. Do not add
`AccessibleLabel` to either label (RULES Y4) — they are decorative given the button name.

- [ ] **Step 5: Assert the fix**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
if ($rooms -match [regex]::Escape('Text: ="● " & ThisItem.StatusText')) { throw 'Combined dot+text label still present.' }
$required = @(
  'lblRoomsCardStatusDot:',
  'Text: ="●"',
  'Text: =ThisItem.StatusText',
  '"seats" in Lower(_d)'
)
$missing = $required | Where-Object { $rooms -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing: ' + ($missing -join ', ')) }
if ($rooms -match [regex]::Escape('_description & ')) { throw 'Old unconditional description formula still present.' }
'task 4 contract passed'
```

Expected: prints `task 4 contract passed`.

- [ ] **Step 6: Validate and report**

Run both validators (expect `0 error(s), 18 warning(s)`, 0 findings). Report:

```text
UNVERIFIED: the guarded formula is evaluated by the Power Fx engine, not by
            this grep. Confirm in Studio that no card shows a repeated
            "seats N" and that a description WITHOUT the word "seats" still
            gets one appended.
```

---

### Task 5: Toolbar gaps, fill, and the truncated toggle

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: AutoLayout `LayoutGap` / `FillPortions`.
- Produces: 16px-separated toolbar controls, an untruncated `Available now` label, and a search box that sizes itself instead of relying on a hardcoded offset.

- [ ] **Step 1: Assert the defects**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
if ($rooms -notmatch [regex]::Escape('Width: =If(App.Width < 768, Parent.Width, Parent.Width - 480)')) { throw 'Expected hardcoded 480 search offset not found.' }
if ($rooms -notmatch [regex]::Escape('Height: =If(App.Width < 768, 208, 48)')) { throw 'Expected 208 toolbar height not found.' }
'defects confirmed present'
```

- [ ] **Step 2: Add gaps and fix the stacked height**

In `conRoomsToolbar` Properties, change:

```yaml
                              Height: =If(App.Width < 768, 208, 48)
```

to:

```yaml
                              Height: =If(App.Width < 768, 240, 48)
                              LayoutGap: =16
```

Four 48px controls plus three 16px gaps is 240. The existing 208 was already tight and
would clip outright once `LayoutGap` applies.

- [ ] **Step 3: Let the search box fill**

On `txtRoomsSearch`, change:

```yaml
                                    Width: =If(App.Width < 768, Parent.Width, Parent.Width - 480)
```

to:

```yaml
                                    Width: =Parent.Width
```

and add, in alphabetical position (after `Font`, before `Height`):

```yaml
                                    FillPortions: =If(App.Width < 768, 0, 1)
```

`FillPortions` governs the dimension along the layout axis. The toolbar is horizontal above
768px (so portions size the width — correct) and vertical below (where a non-zero value
would stretch the search box down the column — hence the 0).

- [ ] **Step 4: Pin the other three**

Add `FillPortions: =0` to `drpRoomsCapacity`, `drpRoomsSort`, and `tglRoomsAvailable`, each
in alphabetical position within its Properties block. On `tglRoomsAvailable` also change:

```yaml
                                    Width: =140
```

to:

```yaml
                                    Width: =200
```

140px truncates the label to `Availabl...`.

- [ ] **Step 5: Widen the card equipment tags**

On `galRoomsCardEquipment`, change:

```yaml
                                          TemplateSize: =72
```

to:

```yaml
                                          TemplateSize: =84
```

and add `Wrap: =false` to `lblRoomsCardEquipmentTag` (after `Text`, before `Width`). At the
old 68px tag width, `"Whiteboard"` wrapped to two lines and clipped against the 20px height.

Do **not** touch `galRoomsEquipmentFilters.TemplateSize` — its 98 renders `"Whiteboard"`
correctly today, and narrowing it would risk reintroducing exactly this bug in the filter row.

- [ ] **Step 6: Assert the fix**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
$required = @(
  'Height: =If(App.Width < 768, 240, 48)',
  'FillPortions: =If(App.Width < 768, 0, 1)',
  'TemplateSize: =84'
)
$missing = $required | Where-Object { $rooms -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Missing: ' + ($missing -join ', ')) }
# Count-based. Both of these values ALREADY occur in the base file, so a plain
# presence check would pass even if neither edit were made:
#   Width: =200    once, inside con_timeline_view
#   LayoutGap: =16 once, on conRoomsEquipmentFilters
$w200 = ([regex]::Matches($rooms, '(?m)^\s*Width: =200\s*$')).Count
if ($w200 -ne 2) { throw "Expected 2 Width: =200 sites (1 pre-existing + the toggle), found $w200." }
$gap = ([regex]::Matches($rooms, '(?m)^\s*LayoutGap: =16\s*$')).Count
if ($gap -ne 2) { throw "Expected 2 LayoutGap: =16 sites (1 pre-existing + the toolbar), found $gap." }
if ($rooms -match [regex]::Escape('Parent.Width - 480')) { throw 'Hardcoded 480 offset still present.' }
if ($rooms -notmatch [regex]::Escape('TemplateSize: =98')) { throw 'Filter-row gallery must keep TemplateSize 98.' }
if ((([regex]::Matches($rooms, [regex]::Escape('FillPortions: =0'))).Count) -lt 3) { throw 'Expected at least 3 FillPortions: =0 entries.' }
'task 5 contract passed'
```

Expected: prints `task 5 contract passed`.

- [ ] **Step 7: Validate and report**

Run both validators (expect `0 error(s), 18 warning(s)`, 0 findings). Report:

```text
UNVERIFIED: FillPortions behaviour under the 768px LayoutDirection switch
            requires Studio at 1366, 1024, and 767px.
```

---

### Task 6: Typography sweep

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: the whole Rooms screen on IBM Plex Sans.

- [ ] **Step 1: Count the sites before changing anything**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
$lato = ([regex]::Matches($rooms, [regex]::Escape('Font: =Font.Lato'))).Count
if ($lato -ne 26) { throw "Expected 26 Font.Lato sites, found $lato - a prior task changed the count." }
'26 sites confirmed'
```

Expected: prints `26 sites confirmed`. Note Task 4 added one control already carrying
`Font: ="IBM Plex Sans"`, which is not counted here.

- [ ] **Step 2: Replace every Lato site**

```powershell
$path = Join-Path $workDir 'Rooms.pa.yaml'
$rooms = Get-Content -Raw $path
$rooms = $rooms.Replace('Font: =Font.Lato', 'Font: ="IBM Plex Sans"')
[System.IO.File]::WriteAllText($path, $rooms)
```

`WriteAllText` is used rather than `Set-Content` because `Set-Content` defaults to the
system ANSI codepage and would corrupt the `·` and `●` characters in this file.

All 26 are replaced, including the 8 inside `con_timeline_view`. A half-converted screen —
Plex in browse, Lato in the Today view one click away — would look worse than either extreme.

- [ ] **Step 3: Fix the CSS-stack font site**

`lblRoomsSelectedSummary` passes `=CarbonFontFamily` to a native `Font` property.
`CarbonFontFamily` is `"'IBM Plex Sans', 'Segoe UI', Arial"` — a CSS font *stack* built for
SVG data-URIs, not a font name — so it is very likely falling back silently. Change:

```yaml
                              Font: =CarbonFontFamily
```

to:

```yaml
                              Font: ="IBM Plex Sans"
```

- [ ] **Step 4: Assert the sweep**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
if ($rooms -match [regex]::Escape('Font: =Font.Lato')) { throw 'Font.Lato sites remain.' }
if ($rooms -match [regex]::Escape('Font: =CarbonFontFamily')) { throw 'CarbonFontFamily still used in a native Font property.' }
$plex = ([regex]::Matches($rooms, [regex]::Escape('Font: ="IBM Plex Sans"'))).Count
if ($plex -ne 28) { throw "Expected 28 IBM Plex Sans sites (26 swept + 1 CarbonFontFamily + 1 new dot), found $plex." }
if ($rooms -notmatch [regex]::Escape('·')) { throw 'Middot character lost - file encoding was corrupted.' }
if ($rooms -notmatch [regex]::Escape('●')) { throw 'Status dot character lost - file encoding was corrupted.' }
'task 6 contract passed'
```

Expected: prints `task 6 contract passed`. The encoding assertions are not optional — a
bulk rewrite is exactly where the `·` and `●` glyphs get destroyed.

- [ ] **Step 5: Validate and report**

Run both validators (expect `0 error(s), 18 warning(s)`, 0 findings). Report:

```text
UNVERIFIED: whether "IBM Plex Sans" resolves in the player or falls back to a
            default cannot be determined statically. This is the single
            highest-risk item in the change and MUST be confirmed visually in
            Studio before the change is called done.
```

---

### Task 7: Raw colour literals

**Files:**
- Modify in scratch: `$workDir\Rooms.pa.yaml`

**Interfaces:**
- Consumes: `AppTheme.TextMuted`, `Color.Transparent`.
- Produces: four token-based replacements on the two reused card labels (the fifth, the gallery border, was removed in Task 2).

- [ ] **Step 1: Assert the defects**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
$disabled = ([regex]::Matches($rooms, [regex]::Escape('DisabledColor: =RGBA(161, 159, 157, 1)'))).Count
if ($disabled -lt 2) { throw "Expected 2 card DisabledColor literals, found $disabled." }
'defects confirmed present'
```

- [ ] **Step 2: Replace on both card labels**

On **both** `lbl_textID_Card` and `lbl_textID_Desc`, change:

```yaml
                                          BorderColor: =RGBA(0, 0, 0, 0)
```

to:

```yaml
                                          BorderColor: =Color.Transparent
```

and:

```yaml
                                          DisabledColor: =RGBA(161, 159, 157, 1)
```

to:

```yaml
                                          DisabledColor: =AppTheme.TextMuted
```

Leave `DisabledBorderColor: =RGBA(0, 0, 0, 0)` on both — it expresses transparency, and no
theme token applies.

- [ ] **Step 3: Do not touch anything else**

`btn_Card`'s transparency values stay. `con_timeline_view` holds roughly 40 further `RGBA()`
literals and the screen sets `Fill: =RGBA(255, 255, 255, 1)` and
`LoadingSpinnerColor: =RGBA(0, 120, 212, 1)` — all pre-existing, all out of scope, all
recorded as follow-up in the spec.

- [ ] **Step 4: Assert the fix**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
if ($rooms -match [regex]::Escape('DisabledColor: =RGBA(161, 159, 157, 1)')) { throw 'Card DisabledColor literal remains.' }
# Count-based: DisabledColor: =AppTheme.TextMuted already occurs once in the base,
# so a plain presence check would pass even if neither card label were converted.
$muted = ([regex]::Matches($rooms, [regex]::Escape('DisabledColor: =AppTheme.TextMuted'))).Count
if ($muted -ne 3) { throw "Expected 3 DisabledColor: =AppTheme.TextMuted sites (1 pre-existing + 2 card labels), found $muted." }
if ($rooms -notmatch [regex]::Escape('Fill: =RGBA(255, 255, 255, 1)')) { throw 'Screen Fill was changed - it is out of scope.' }
'task 7 contract passed'
```

Expected: prints `task 7 contract passed`. The last assertion is a guard against scope
creep, not a defect check.

- [ ] **Step 5: Validate and report**

Run both validators (expect `0 error(s), 18 warning(s)`, 0 findings).

---

### Task 8: Publish once, commit, verify

> **Publisher only.** Workers stop at Task 7. This task requires the guard lock and a human co-attached in Studio.

**Files:**
- Publish from: a fresh publisher scratch directory based on a new `sync_canvas`
- Commit: `Src/Rooms.pa.yaml`
- Inspect: `docs/APP-CHECKER-BASELINE.md`

**Interfaces:**
- Consumes: the reviewed cumulative diff from Tasks 2-7.
- Produces: one guarded publish, one matching commit, marker evidence, and human acceptance evidence.

- [ ] **Step 1: Review the cumulative diff**

```powershell
git diff --no-index -- (Join-Path $baseDir 'Rooms.pa.yaml') (Join-Path $workDir 'Rooms.pa.yaml')
git diff --no-index -- (Join-Path $baseDir 'App.pa.yaml') (Join-Path $workDir 'App.pa.yaml')
```

Expected: the second command produces **no output**. If `App.pa.yaml` changed, a task
exceeded its scope — stop and investigate.

Review the first diff for: presentation properties only; no changed `Items`, `OnSelect`,
`Visible`, or `RoomsBrowse*` reference; exactly one new control (`lblRoomsCardStatusDot`);
no new raw colour.

- [ ] **Step 2: Run the integrated contract**

```powershell
$rooms = Get-Content -Raw (Join-Path $workDir 'Rooms.pa.yaml')
$required = @(
  'TemplatePadding: =8',
  'AutoHeight: =false',
  'lblRoomsCardStatusDot:',
  '"seats" in Lower(_d)',
  'TemplateSize: =84'
)
$missing = $required | Where-Object { $rooms -notmatch [regex]::Escape($_) }
if ($missing.Count -gt 0) { throw ('Integrated contract missing: ' + ($missing -join ', ')) }
# Count-based checks. Every value below ALREADY occurs in the base file, so plain
# presence proves nothing. Expected counts are (pre-existing + added by this change).
$counts = @{
  '(?m)^\s*Fill: =AppTheme\.Surface\s*$'                      = 5   # 4 pre-existing + card
  '(?m)^\s*Width: =200\s*$'                                   = 2   # 1 pre-existing + toggle
  '(?m)^\s*LayoutGap: =16\s*$'                                = 2   # 1 pre-existing + toolbar
  '(?m)^\s*DisabledColor: =AppTheme\.TextMuted\s*$'           = 3   # 1 pre-existing + 2 labels
  '(?m)^\s*AutoHeight: =true\s*$'                             = 2   # 2 timeline survivors
}
foreach ($pattern in $counts.Keys) {
  $actual = ([regex]::Matches($rooms, $pattern)).Count
  if ($actual -ne $counts[$pattern]) { throw "Count mismatch for /$pattern/: expected $($counts[$pattern]), found $actual." }
}
@('Font: =Font.Lato', 'Parent.Width - 480', 'Text: ="● " & ThisItem.StatusText', 'Step 1 of 3', 'Floor', 'Group by') |
  ForEach-Object { if ($rooms -match [regex]::Escape($_)) { throw "Forbidden content still present: $_" } }
'integrated contract passed'
```

Expected: prints `integrated contract passed`.

- [ ] **Step 3: Acquire the lock**

The human opens the app in Power Apps Studio and stays co-attached.

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh status
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh lock "rooms browse polish"
```

If the lock is held, stop and coordinate. Do not bypass it.

- [ ] **Step 4: Re-sync immediately before publishing**

```powershell
$publishStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$publishDir = Join-Path $repoRoot ('.scratch\rooms-polish-publish-' + $publishStamp)
New-Item -ItemType Directory -Path $publishDir | Out-Null
```

Call `sync_canvas` into `$publishDir`, then compare against `$baseDir`:

```powershell
git diff --no-index -- (Join-Path $baseDir 'Rooms.pa.yaml') (Join-Path $publishDir 'Rooms.pa.yaml')
```

If live moved: release the lock, rebase the reviewed diff onto the new live file, rerun
Tasks 2-7 assertions, then reacquire and re-sync. Never retry an unchanged blocked publish
(RULES P1).

If live did not move:

```powershell
Copy-Item -LiteralPath (Join-Path $workDir 'Rooms.pa.yaml') -Destination (Join-Path $publishDir 'Rooms.pa.yaml') -Force
node tools/pa-lint/lint.js --src $publishDir
node tools/pa-schema-validate/validate.js --src $publishDir
```

Expected: `0 error(s), 18 warning(s)`, 0 findings.

- [ ] **Step 5: Publish and commit in the same breath**

Call `compile_canvas` with the absolute `$publishDir`. Expected: 0 errors.

On any compile error: capture it in full, run `guard.sh unlock`, return to the owning task.
Do not copy into `Src`, do not commit, do not retry the same directory unchanged.

On success:

```powershell
Copy-Item -LiteralPath (Join-Path $publishDir 'Rooms.pa.yaml') -Destination (Join-Path $repoRoot 'Src\Rooms.pa.yaml') -Force
git add -- Src\Rooms.pa.yaml
git diff --cached --check
git commit -m "fix(rooms): carbon polish for browse cards and toolbar (DS1,P4)"
```

The human saves in Studio immediately so the version persists (RULES P7).

- [ ] **Step 6: Fresh-sync marker verification**

```powershell
$postStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$postDir = Join-Path $repoRoot ('.scratch\rooms-polish-postpublish-' + $postStamp)
New-Item -ItemType Directory -Path $postDir | Out-Null
```

Call `sync_canvas` into `$postDir`, then:

```powershell
node tools/pa-lint/lint.js check-markers "Fill: =AppTheme.Surface" --src $postDir
node tools/pa-lint/lint.js check-markers "lblRoomsCardStatusDot:" --src $postDir
node tools/pa-lint/lint.js check-markers "LayoutGap: =16" --src $postDir
node tools/pa-lint/lint.js check-markers "Font: =\"IBM Plex Sans\"" --src $postDir
```

Expected: all four present. Then record the rung and release:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh verified "rung 3 marker greps"
& 'C:\Program Files\Git\bin\bash.exe' tools/canvas-guard/guard.sh unlock
& 'C:\Program Files\Git\bin\bash.exe' tools/pac-verify/pac-verify.sh freshness
```

- [ ] **Step 7: Studio visual acceptance**

This is where the change is actually judged. At 1366px, light theme:

1. Cards are white, discrete, with visible gutters — not one grey slab.
2. No card's description touches or overlaps the availability strip.
3. No card shows a repeated `seats N`.
4. Equipment pills are visible grey chips, and `"Whiteboard"` is on one line.
5. The status dot is coloured and the status text is neutral grey.
6. **The typeface is IBM Plex Sans, not a fallback.** Compare a card title against the
   shell header nav, which already uses Plex. If they differ, the font is not resolving —
   report it rather than working around it.
7. `Available now` is fully readable; toolbar controls are 16px apart.

Then at 1024px (2 cards/row), 767px (1 card/row, stacked toolbar — confirm nothing clips),
and in dark theme.

- [ ] **Step 8: Confirm behaviour is unregressed**

Select a card, replace the selection, deselect. Open **View today** and return — the
selection must survive. Confirm **View week** is still disabled and **Book** still opens the
modal with blank date and time. None of this was touched, so any change here is a
regression.

- [ ] **Step 9: App Checker**

Run App Checker in Studio after saving and compare with `docs/APP-CHECKER-BASELINE.md`:
High stays 0, and no new Medium/Performance issue or site beyond the documented 15.

If it increases, do not release to players. Fix, revalidate, and run a new guarded cycle.

- [ ] **Step 10: Report honestly**

State the highest rung actually observed with a timestamp, and list anything still
unverified. If the font fell back, or text still clips at some width, say so — a partial
result reported accurately is worth more than a clean-sounding claim.

---

## Completion Checklist

- [ ] Only `Src/Rooms.pa.yaml` changed. `App.pa.yaml` diff is empty.
- [ ] Cards are white and discrete with gutters.
- [ ] No text overlaps the availability strip at any supported width.
- [ ] No duplicated `seats N`.
- [ ] Equipment pills visible; `"Whiteboard"` on one line.
- [ ] Status dot carries colour; status text is neutral and still worded.
- [ ] Toolbar gapped, `Available now` untruncated, nothing clipped below 768px.
- [ ] IBM Plex Sans confirmed **visually**, not inferred from YAML.
- [ ] The five in-scope RGBA literals replaced; timeline literals untouched.
- [ ] Selection, Today, Week, and Book behaviour unregressed.
- [ ] `pa-lint` 0 errors / 18 warnings; `pa-schema-validate` 0 findings.
- [ ] `compile_canvas` 0 errors under the guard lock.
- [ ] Commit matches published source; markers verified from a fresh sync.
- [ ] App Checker not increased.
- [ ] No stepper, Floor, or room-type grouping introduced.
