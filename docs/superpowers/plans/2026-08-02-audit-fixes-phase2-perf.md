# Audit Remediation — Phase 2 (Performance Program) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the performance program from `docs/reviews/2026-07-31-app-audit.md` (remediation items 2, 6, 7 = PERF-1/3/4/5/6), plus the typography/HTML standardisation pass Harry requested on 2026-08-02: adopt the IBM Carbon typography kit (`CarbonHtmlType` + `CarbonText` UDFs) as named formulas, and collapse multi-Label text stacks ("3 labels where 1 would work") into single HTML text controls where that nets out positive. Folds in PERF-7 (duplicated expressions → named formulas) and PERF-8 (shell HtmlViewers) because they share files with the other tasks.

**Architecture:** Three legs. (1) **Data weight** — post-mutation `ClearCollect(colBookings, BookingsWindow)` re-pulls become local mirror writes (`Patch`/`UpdateIf` into `colBookings` after the confirmed server write); `ForAll`+`Collect` row loops become single batched `Collect(target, ForAll(...))`. (2) **Render weight** — per-row `LookUp` strips are precomputed into the named formulas that already feed those galleries; the Rooms timeline tree moves to its own screen. (3) **Control weight** — a typography token layer (hex-string tokens feeding both `ColorValue()` theme tokens and HTML/CSS strings) enables one `HtmlViewer` to replace 2–8 stacked Labels at static text sites. 149 text controls currently sit in sibling stacks of ≥2; the in-scope subset removes ~55–75 controls net.

**Tech Stack:** Power Apps Canvas (`.pa.yaml` via canvas-authoring MCP), SharePoint lists (`Book_Bookings`, `Book_Rooms`), pa-lint / pa-schema-validate / canvas-guard, App Checker SARIF diff (P10).

**Source of the typography kit:** `My Drive\99 - Archive\ModernVault\Power Apps - IBM Carbon Design Kit\Layout\Typography.md` — adapted, not copied verbatim (it references `Theme.Active.*` tokens; this app uses `AppTheme.*`, and those are `ColorValue()` values that cannot be embedded in CSS strings — see Task 1).

---

## Ground rules (rule IDs, not restatements — see `docs/RULES.md`)

- **Process:** P1, P2, P3, P6 (single publisher; workers NEVER `compile_canvas`), P4, P5, P7, P8, P9, **P10 (App Checker issues never increase — this plan's whole point is to decrease them; SARIF diff is the acceptance gate)**, O1, O2, O3.
- **Authoring:** Y1 (formulas containing `: ` are `|-` block scalars), Y2, Y3, **Y6 (control names are app-global; every new control fresh — load-bearing for Task 8's screen split)**, Y7, Y8, **Y9 (empty spacer containers lose sizing — relevant when deleting spacer labels)**. **DS1:** no raw hex outside the token block — the new hex-string token record IS part of the token block; HTML `style` strings must reference it, never literal hex.
- **Anchors (O3):** this plan anchors by **control name and quoted code**, never line numbers. Control names below were taken from the fresh sync of 2026-08-02 (`perfpass-sync`, 11 files, Phase 1 fixes confirmed present: `BookingsWindow` ×19 sites, `Concurrent()` in OnStart, `RESET-SITE` markers). Workers re-anchor every edit against their own fresh sync; if a named control or quoted block is missing, STOP and report drift.
- **Working model:** one scratch tree, tasks executed **in order** (Task 1's formulas are consumed by Tasks 5–8; Task 5's consolidations shrink what Task 8 must recreate). Worker loop per task: edit → `node tools/pa-lint/lint.js --src <dir>` → `node tools/pa-schema-validate/validate.js --src <dir>` → acceptance grep → git commit. One publish at the end (publisher only, guard lock held, human Studio session co-attached — P6/P7).
- **Component caveat (watch-item):** a *different* app in this environment (old app `6f844ed8…`) had a hard MCP failure where `compile_canvas` blanked component custom-property self-references. Phase 1 on THIS app edited `cpt_Modal_` and published cleanly, so components are in scope — but after the first Task-5 push that touches a `Components/*.pa.yaml`, verify in the co-attached Studio session that `cpt_Modal_`'s custom properties (`PatchPayload`, `OnSubmit`, …) still evaluate before continuing.

**Scope boundary:** audit items 2, 6, 7 + the typography/HTML pass + PERF-7/8 rides. **Out of scope:** full Classic→Modern control migration (PERF-9 — audit says sequence after structural fixes), state hygiene / component decoupling / naming sweep (Phase 3), the Phase-1b small-bugs sweep (BUG-11/12/15–21/23/24) — except where a formula this plan already rewrites contains one of those bugs, in which case fix it in passing and note it in the commit.

---

## The HTML text policy (read before Tasks 5, 6, 8)

`HtmlViewer` is one of the heaviest control types (audit PERF-8 flagged the shell's). Consolidation is only a win when it **removes more layout/render weight than the HtmlViewer adds**. Hard rules for this plan:

1. **Net ≥2 controls removed per site.** One HtmlViewer replaces a stack of ≥2 Labels (often 3–8, plus their wrapping container when the container held only the stack). Never replace a single Label with an HtmlViewer.
2. **Never inside gallery templates.** An HtmlViewer in a template is instantiated per row and re-parses HTML on every scroll/redraw. Gallery-template stacks (`galHDRoomsNow`, `mb2GalBookings`, `mb2GalSeries`, `mb2GalSeriesOcc`, `galAlternativeRooms`, `galConflictTimeline`, Rooms `con_tile_view`, Find row templates) **stay as Labels** in this plan. Row-template weight is addressed by Task 4's precompute instead.
3. **No per-line interactivity.** If any label in a stack has its own `OnSelect`/hover behavior (e.g. `lblHDTileBookArrow` rows sit inside clickable tiles — fine; but `lblAboutPrivacy` if it navigates — check), it either stays a Label or the interaction moves to the parent container.
4. **Styles come from the kit.** Every HTML block is composed from `CarbonText*` UDFs + `CarbonHtmlType.*` styles + `AppThemeHex.*` colors (Task 1). No inline literal hex, no ad-hoc `font-size:` strings (DS1).
5. **HtmlViewer hygiene:** set `PaddingTop/Bottom/Left/Right: =0` (HtmlViewer default padding ≈5px breaks tight layouts), `AutoHeight` only where the old stack auto-sized, explicit `Height` otherwise; `DisplayMode: =DisplayMode.View`.
6. **Single-purpose HtmlViewers go the other way.** The shell wordmark/avatar HtmlViewers render one string each — they become Labels (Task 6). The policy is symmetric: HtmlViewer only where it consolidates.
7. **Accessibility note:** the platform a11y checker already reports 546 errors (see UX log). Converted blocks must keep reading order sensible (caption before value in the HTML source order) and must not bury actionable text inside HTML. Do not make the a11y count worse (spot-check with `get_accessibility_errors` before/after on one converted screen).

---

## Task 0: Session open — connect, sync, reconcile, baseline

**Files:** none edited; produces the scratch tree every later task edits.

- [ ] **Step 1: Connect** (MCP `connect`, snake_case params)

```
environment_id = "Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd"
app_id         = "498d4962-0b5f-4990-a400-1bf5de9a367c"
login_hint     = "harry@harry-burton.ai"
```

- [ ] **Step 2: Fresh sync into a NEW scratch dir** (never into `Src/`): `sync_canvas(directoryPath: <scratch>/perf-sync-<yyyymmdd-hhmm>)`. Expect 11 files.
- [ ] **Step 3: Reconcile git (P5):** copy the fresh sync over `Src/` on a new branch `perf/audit-phase2`, commit `sync: reconcile server drift before audit phase-2 perf pass (P5)`.
- [ ] **Step 4: Baseline metrics (the before-numbers this plan is judged against):**
  - pa-lint: expect `0 error(s)` (advisory count may have moved since Phase 1 — record it).
  - App Checker SARIF snapshot (P10 baseline): record Rooms complexity (audit value: 352), total performance findings (audit: 33), `CollectDelegatableDataSource` count.
  - Control counts per file: `grep -c "Control: " <file>` — record the table (audit totals: 564 controls, 207 Labels, 3 HtmlViewers).
  - Record rung 1: `guard.sh verified "rung 1 baseline on perf-sync-<stamp>"`.

---

## Task 1: Typography kit — hex tokens, `CarbonHtmlType`, `CarbonText*` UDFs (enables everything in Tasks 5–8)

**Files:** Modify `App.pa.yaml` — the `Formulas:` block only.

The kit from `Typography.md` needs three adaptations:

1. **Hex-string tokens.** `AppTheme.TextPrimary` is `ColorValue("#161616")` — a Color value cannot be concatenated into a CSS string. Restructure so hex strings are the source of truth and `ColorValue()` wraps them, keeping DS1 (one token block) and both theme branches (the light/dark blocks both define `TextPrimary`/`TextSecondary`/etc.):

```
// Before (pattern, both theme branches):
TextPrimary: ColorValue("#161616"),
TextSecondary: ColorValue("#525252"),

// After (shape): a parallel AppThemeHex record declared FIRST, same branch structure,
// then AppTheme built from it:
AppThemeHex = { ... TextPrimary: "#161616", TextSecondary: "#525252", ... };
AppTheme    = { ... TextPrimary: ColorValue(AppThemeHex.TextPrimary), ... };
```

   Only lift the tokens HTML actually needs (Text*, Link*, status text colors) into `AppThemeHex` — do not churn the whole block.

2. **Font family:** the app already has `CarbonFontFamily = "'IBM Plex Sans', 'Segoe UI', Arial";`. Keep it as the `Sans` value (do not introduce the kit's `CarbonFontFamilies` record unless Mono/Serif are actually used — YAGNI; nothing in the app uses them).

3. **The type ramp + UDFs**, adapted to this app's names:

```
CarbonHtmlType = {
    Label01:          "font-size: 12px; font-family: " & CarbonFontFamily & "; font-weight: 400; line-height: 1.33333; letter-spacing: 0.32px;",
    Body01:           "font-size: 14px; font-family: " & CarbonFontFamily & "; font-weight: 400; line-height: 1.42857; letter-spacing: 0.16px;",
    BodyCompact01:    "font-size: 14px; font-family: " & CarbonFontFamily & "; font-weight: 400; line-height: 1.28572; letter-spacing: 0.16px;",
    HeadingCompact01: "font-size: 14px; font-family: " & CarbonFontFamily & "; font-weight: 600; line-height: 1.28572; letter-spacing: 0.16px;",
    Heading02:        "font-size: 16px; font-family: " & CarbonFontFamily & "; font-weight: 600; line-height: 1.5; letter-spacing: 0px;",
    Heading03:        "font-size: 20px; font-family: " & CarbonFontFamily & "; font-weight: 400; line-height: 1.4; letter-spacing: 0px;",
    Heading04:        "font-size: 28px; font-family: " & CarbonFontFamily & "; font-weight: 400; line-height: 1.28572; letter-spacing: 0px;",
    Eyebrow:          "font-size: 11px; font-family: " & CarbonFontFamily & "; font-weight: 400; letter-spacing: 0.6px; text-transform: uppercase;"
};

CarbonText(css:Text, content:Text):Text          = "<div style='" & css & " color: " & AppThemeHex.TextPrimary & ";'>" & content & "</div>";
CarbonTextSecondary(css:Text, content:Text):Text = "<div style='" & css & " color: " & AppThemeHex.TextSecondary & ";'>" & content & "</div>";
CarbonTextColored(css:Text, content:Text, hex:Text):Text = "<div style='" & css & " color: " & hex & ";'>" & content & "</div>";
```

   Ship only the ramp entries the app's current Size histogram needs (11/12/14 px dominate — 228 of 277 `Size:` declarations; 16/20/24/28 cover the headings). Add `Eyebrow` because 6+ sites render uppercase 11px eyebrows. Skip the kit's Legal/Code/Fluid/Display entries — nothing maps to them (YAGNI). `CarbonTextColored` covers status text (green "Available", red errors) without minting a UDF per status.

- [ ] **Step 1:** Add `AppThemeHex` + rebuild the lifted `AppTheme` entries from it (both theme branches).
- [ ] **Step 2:** Add `CarbonHtmlType` + the three UDFs after the existing SVG UDFs.
- [ ] **Step 3:** Acceptance — pa-lint clean; grep: `AppThemeHex` referenced by `AppTheme`; no behavior change anywhere (formulas only, no consumers yet). Commit `feat(app): typography kit — AppThemeHex tokens, CarbonHtmlType ramp, CarbonText UDFs (perf-phase2 T1)`.

**Also in this task (font-drift decision, needed before Task 5 rewrites Text properties):** the app splits 177 `Font: ="IBM Plex Sans"` vs 100 `Font: =Font.Lato`. Every label REPLACED by HTML in Tasks 5/8 renders IBM Plex via the kit automatically. Labels that remain get `Font: ="IBM Plex Sans"` **only when the task already touches that control for another reason** — a blanket Lato sweep is Phase 3 hygiene, not this plan.

---

## Task 2: PERF-1/6 — kill the post-mutation full re-pulls (audit item 2)

**Files:** `Home.pa.yaml`, `Find.pa.yaml`, `Rooms.pa.yaml`, `myBookings.pa.yaml`, `bookingDetail.pa.yaml`, `Components/cpt_BookingDetailModal.pa.yaml`.

19 `ClearCollect(colBookings, BookingsWindow)` sites exist. **Keep 4:** `App.OnStart` (inside `Concurrent`) and the three screen-entry `OnVisible` pulls (Find, Rooms, myBookings — they are the freshness backstop for BUG-1's residual window). **Replace the ~15 post-mutation sites** with local mirror writes:

- **Single-row mutations** (cancel one booking, extend, edit one occurrence): after the `IfError(Patch(Book_Bookings, …), …)` succeeds, mirror with `Patch(colBookings, LookUp(colBookings, ID = <id>), {…same fields…})`. New rows (wizard submit): `Collect(colBookings, <the record Patch returned>)` — `Patch()` returns the written record including the server-assigned `ID`; capture it with `With()`.
- **Series mutations** (cancel/edit series): the server writes are already per-occurrence `ForAll` loops over an explicit plan collection (`colSeriesEditPlan` / the Phase-1 fresh server filter). Mirror once after the loop: `UpdateIf(colBookings, SeriesID = _sid && <same predicates as the server loop>, {Status: "Cancelled", …})`. **The mirror predicate must be copied from the server loop's predicate, not re-derived** — drift here recreates BUG-3's shape locally.
- **Failure branches:** only mirror on the success path. On partial series failure (the Phase-1 failure-aware toasts), fall back to one `ClearCollect(colBookings, BookingsWindow)` — correctness over cleverness when the local picture is uncertain.

- [ ] **Step 1:** Inventory the 19 sites in the fresh sync (grep `ClearCollect(colBookings`), classify keep/replace, and list each replacement site's enclosing handler in the task commit body.
- [ ] **Step 2:** Apply replacements handler-by-handler (each handler = one commit-reviewable hunk). Anchor each edit by the enclosing control's name + the quoted `IfError(Patch(` block above it.
- [ ] **Step 3:** Acceptance — grep count of `ClearCollect(colBookings, BookingsWindow)` drops to 4 (+ any explicit failure-branch fallbacks, each carrying a `// MIRROR-FALLBACK` comment); pa-lint clean. Player check (deferred to final rung 6): cancel a booking on myBookings → row updates without a visible full-list reload; create a booking → it appears in Home's next-booking card without renavigation.

---

## Task 3: PERF-5/6 — batch the `ForAll`+`Collect` row loops

**Files:** `Find.pa.yaml` (grid builder `btnLoadFindBookings.OnSelect`, week-mode pass), `Rooms.pa.yaml` (`btn_LoadTimeline.OnSelect` row builder), OnSubmit payload builders (Home/Find/Rooms).

The App-Checker-flagged pattern (8×) is `ForAll(src, Collect(target, {…}))` — one change notification per row. Rewrite each as `Collect(target, ForAll(src, {…}))` — the `ForAll` returns a table, `Collect` ingests it in one operation. Semantics are identical **when the loop body's only side effect is the `Collect`** — verify per site; any loop that also `Patch`es or `Set`s stays as-is (the OnSubmit server-write loops from Task 2 are NOT batching candidates — SharePoint `Patch` stays per-row).

- [ ] **Step 1:** Grep `ForAll(` across the scratch tree; classify each as pure-Collect (batch it) or side-effectful (leave it). Expected pure-Collect sites: the Find grid builders (2 passes), Rooms timeline row builder, payload snapshot builders.
- [ ] **Step 2:** Rewrite the pure sites. While inside the Find grid builder, do NOT fix the self-referential `ClearCollect(colFindRows, SortByColumns(colFindRows, …))` re-sort beyond what the batching forces — BUG-11/12 are Phase 1b; if batching removes the need for the re-sort naturally, take it and note it.
- [ ] **Step 3:** Acceptance — App Checker `ForAll`+`Collect` findings drop from 8 toward 0 on the SARIF diff; Find grid and Rooms timeline render identically (player check, rung 6).

---

## Task 4: PERF-4 — precompute per-row slot strips in the named formulas

**Files:** `App.pa.yaml` (`RoomsBrowseBase`, `RoomOccupancyToday` named formulas), `Rooms.pa.yaml` (`galRoomsAvailabilitySegments` template), `Home.pa.yaml` (`galHDOccSegments` template).

Today each visible room tile runs ~20 per-slot `LookUp`s per re-evaluation (~240 LookUps for 12 tiles; same shape on Home's occupancy grid). Move the per-slot state into the row records the galleries already consume:

- **`RoomsBrowseBase`:** it already runs one `Filter` per room. Extend each room record with a nested slot table: `Slots: ForAll(Sequence(20) As _s, {Idx: _s.Value, State: <derived from the room's filtered bookings>})`. The nested gallery's `Items` becomes `ThisItem.Slots` and its template rectangles read `ThisItem.State` — zero LookUps in the template.
- **`RoomOccupancyToday`:** same shape for Home's occupancy rows.
- **Do not** switch to the audit's SVG-image alternative — SVG regeneration cost was the wizard-tile lesson (audit PERF-10); nested-table precompute keeps the existing control structure.

- [ ] **Step 1:** Extend the two named formulas with the nested `Slots` tables, deriving state with the same `fnOverlaps` predicates the templates use today (copy the predicate, then delete it from the template).
- [ ] **Step 2:** Rewire `galRoomsAvailabilitySegments.Items` and `galHDOccSegments.Items` to `ThisItem.Slots`; template `Fill`/`Visible` formulas read `ThisItem.State`.
- [ ] **Step 3:** Acceptance — grep: zero `LookUp(` inside the two segment-gallery templates; visual parity on the browse tiles and occupancy grid (player check, rung 6, including the now-line still overlaying correctly).

---

## Task 5: The label consolidation pass (typography/HTML standardisation)

**Files:** `Home.pa.yaml`, `Profile.pa.yaml`, `bookingDetail.pa.yaml`, `myBookings.pa.yaml`, `Find.pa.yaml`, `Components/cpt_BookingDetailModal.pa.yaml`, `Components/cpt_Modal_.pa.yaml`. (Rooms' static stacks are deliberately deferred to Task 8 — its timeline tree is being recreated anyway; consolidating it twice is waste. Rooms browse-side stacks `conRoomsHeading` ride in Task 8 too, one Rooms diff instead of two.)

**Site inventory (fresh-sync scan, 2026-08-02; anchor by control names).** Stacks of sibling Labels/HtmlViewers under one parent; gallery-template stacks excluded per the HTML policy:

| # | Parent container | Stack (n) | Pattern | Action |
|---|---|---|---|---|
| 1 | Home `conHDHeaderText` | `lblHDEyebrow`, `lblHDGreeting` (2) | eyebrow+heading | → 1 HtmlViewer (`Eyebrow` + `Heading04`) |
| 2 | Home `conHDTileBookContent` / `conHDTileViewContent` / `conHDTileMyContent` | title+sub (2 each) | title+sub | → 1 HtmlViewer each (`HeadingCompact01` + `Label01`) |
| 3 | Home `conHDTileBookBottomRow` / `…View…` / `…My…` | meta+arrow (2 each) | meta+glyph | → 1 HtmlViewer each (meta text + `→` span); tile OnSelect lives on the tile container — verify before converting |
| 4 | Home `conHDNextStatus` | `lblHDNextDot`, `lblHDNextStatus` (2) | dot+status | → 1 HtmlViewer (`●` span via `CarbonTextColored` + status text) |
| 5 | Home `conHDNextBody` | `lblHDNextRoom`, `lblHDNextTimeRange`, `lblHDNextMeta` (3) | 3-line body | → 1 HtmlViewer |
| 6 | Home `conHDNextProgressLabels` | ProgStart/Remaining/End (3) | 3-up justified row | → 1 HtmlViewer (flex row, `justify-content: space-between`) |
| 7 | Home `conHDOccHeader` | `lblHDOccTitle`, `lblHDOccAvg` (2) | title+stat | → 1 HtmlViewer (flex row) |
| 8 | Home `conHDOccColHeader` | room+6 hours+used (8) | table header | **second wave** — pixel alignment with the grid below; convert only if the flex column widths can be locked to the gallery template's; else keep |
| 9 | Home `conHDOccLegend` | legend now+spacer (2) | legend | → 1 HtmlViewer (swatch spans via `background-color`) — also deletes the spacer label (Y9 check on the parent) |
| 10 | Profile `conProfileAvatarSlot` | `htxProfileAvatar`, `lblProfileName`, `lblProfileEmail` (3) | avatar+2 lines | → keep avatar decision for Task 6; name+email → 1 HtmlViewer |
| 11 | Profile `conProfileNotifications` | title+caption (2) | title+caption | → 1 HtmlViewer |
| 12 | Profile `conProfileAbout` | title + 3×(cap+val) + privacy (8) | def-list | → 1 HtmlViewer for the whole About block (biggest single win: −7). `lblAboutPrivacy`: if it has an OnSelect, render as `CarbonTextLink`-style anchor only if the link is a real URL; otherwise keep it as the one surviving Label |
| 13 | bookingDetail `fldRoom`/`fldDate`/`fldTime`/`fldBy` | cap+val (2 each) | caption+value | → 1 HtmlViewer each (exemplar below) |
| 14 | bookingDetail `conDetail` | `lblDetailTitle`, `lblDetailEmpty` (2) | title / empty-state | mutually exclusive Visibles — keep as-is (two states, not a stack) |
| 15 | myBookings `mb2ConBreadcrumb` | sep+current (2) | breadcrumb tail | → merge into the preceding crumb structure as 1 HtmlViewer if the crumb root is a Label; else skip |
| 16 | myBookings `mb2ConNextText` | eyebrow+title+sub (3) | eyebrow+title+sub | → 1 HtmlViewer |
| 17 | myBookings `mb2ConTableHead` | 6 column headers | table header | **second wave** — same alignment caveat as #8 |
| 18 | cpt_BookingDetailModal `bdmHeaderText` | eyebrow+title+subtitle (3) | eyebrow+title+sub | → 1 HtmlViewer |
| 19 | cpt_BookingDetailModal `bdmCellDate`/`Time`/`Duration`/`By`/`Room`/`Series` | cap+val (2 each ×6) | caption+value | → 1 HtmlViewer each (−6) |
| 20 | cpt_BookingDetailModal `bdmStatusRow` | `bdmTag`, `bdmStartsIn` (2) | tag+countdown | tag has a filled background — render as padded span with `background-color`+`border-radius`; if fidelity fails, keep |
| 21 | cpt_Modal_ `conSummaryCard` | 5 summary lines | summary block | → 1 HtmlViewer with conditional lines (`If(cond, CarbonTextSecondary(…), "")`) (−4) |
| 22 | cpt_Modal_ `conStep3` | 3 error labels (SlotTaken/Failed/DisabledReason) | mutually exclusive errors | → 1 HtmlViewer, `Switch()` on the active error, color `AppThemeHex.TextError`-equivalent (−2) |
| 23 | cpt_Modal_ `conConflictTitles` | 2 titles | title+sub | → 1 HtmlViewer |
| 24 | Find `conWeekBlock_v2` | count+free (2) | 2 stats | → 1 HtmlViewer (flex row) |

Excluded (gallery templates, per policy): `galHDRoomsNow` (4), `mb2GalBookings` (6), `mb2GalSeries` (3), `mb2GalSeriesOcc` (2), `galAlternativeRooms` (3), `galConflictTimeline` (2), Rooms `con_tile_view` (5+2), `conTLGutter`/`conTLBookedText` (timeline templates), Find row templates.

**Exemplar (pattern for every cap+val site — #13, bookingDetail `fldRoom`):**

Before (two Labels inside `fldRoom`):

```
- capRoom:
    Control: Label
    Properties:
      Color: =AppTheme.TextMuted
      Font: =Font.Lato
      Height: =16
      Size: =11
      Text: ="Room"
      Wrap: =false
- valRoom:
    Control: Label
    Properties:
      AutoHeight: =true
      Color: =AppTheme.TextPrimary
      Font: =Font.Lato
      FontWeight: =FontWeight.Semibold
      Size: =14
      Text: |-
        =gblSelectedBooking.'RoomID: Title'.Value
```

After (one HtmlViewer, **fresh name** — Y6):

```
- htxDetailFieldRoom:
    Control: HtmlViewer
    Properties:
      AutoHeight: =true
      DisplayMode: =DisplayMode.View
      PaddingBottom: =0
      PaddingLeft: =0
      PaddingRight: =0
      PaddingTop: =0
      HtmlText: |-
        =CarbonTextSecondary(CarbonHtmlType.Label01, "Room") &
         CarbonText(CarbonHtmlType.HeadingCompact01, gblSelectedBooking.'RoomID: Title'.Value)
```

(Task 1 must add a `TextMuted` entry to `AppThemeHex` and a matching UDF or use `CarbonTextColored(…, AppThemeHex.TextMuted)` — decide once, apply everywhere.)

- [ ] **Step 1 (wave 1):** #13, #19, #12, #21, #22 — the caption/value and mutually-exclusive sites; highest density, lowest layout risk. One commit per file. After the FIRST push containing a `Components/*` change, run the component watch-item check (ground rules).
- [ ] **Step 2 (wave 2):** #1–#7, #9–#11, #16, #18, #23, #24 — the eyebrow/title/sub and flex-row sites. Verify tile click targets (#3) still work.
- [ ] **Step 3 (wave 3, optional — judgment call):** #8, #17, #15, #20 — table headers and fidelity-risk sites. Convert only with pixel-parity screenshots; skipping is an acceptable outcome, note it.
- [ ] **Step 4:** Delete emptied wrapper containers ONLY where the stack was the container's sole child and the container carried no Fill/border (Y9: check surviving spacers still size correctly).
- [ ] **Step 5:** Acceptance — control-count table vs Task 0 baseline (expect −40 to −60 on this task alone); pa-lint clean; a11y spot-check on bookingDetail (policy rule 7); visual parity screenshots per screen in the co-attached Studio session.

---

## Task 6: PERF-8 — shell HtmlViewers become Labels

**Files:** `Components/Shell_Header.pa.yaml` (2 HtmlViewers × every screen instance), `Profile.pa.yaml` (`htxProfileAvatar`).

The wordmark and avatar-initials HtmlViewers each render one short string — policy rule 6 says they become Labels (avatar = Label in a circular container: `Fill` + wrapping GroupContainer; the header already sizes them). `htxProfileAvatar` additionally hardcodes font/colors outside the token system — the replacement Label uses `AppTheme` tokens.

- [ ] **Step 1:** Replace the two Shell_Header HtmlViewers with Labels under fresh names; delete the originals. Wordmark styling (weight/size) comes from Label properties, not HTML.
- [ ] **Step 2:** Replace `htxProfileAvatar` with the same circular-Label pattern (initials from `gblUserInitials`).
- [ ] **Step 3:** Acceptance — grep: `Control: HtmlViewer` count in `Shell_Header.pa.yaml` = 0; header renders identically on all 6 screens (Studio check); net HtmlViewer instances across the app DROP despite Task 5's additions (record the count: baseline 3 static + Task 5 adds ~25, Task 6 removes 3 that were multiplied per-screen — the per-screen instance math goes in the commit body).

---

## Task 7: PERF-7 — duplicated expressions → named formulas

**Files:** `App.pa.yaml` (new named formulas), `Home.pa.yaml`, `myBookings.pa.yaml`, `Components/cpt_Modal_.pa.yaml`.

- [ ] **Step 1:** `FreeNowCount` named formula; replace the two verbatim O(rooms×bookings) copies on Home (stat line + card).
- [ ] **Step 2:** The 40-line availability/alternative-rooms block duplicated ×4 in `cpt_Modal_` → one UDF `fnAlternativeRooms(start:DateTime, end:DateTime, excludeRoomId:Number):<table>` in App.Formulas (component reads it via AccessAppScope, which it already has). Each of the 4 sites becomes a one-liner.
- [ ] **Step 3:** myBookings tab counts: `MyBookingsUpcomingCount` etc. as named formulas replacing the ×4 `CountRows(Filter(MyBookings, …))`; leave the `mb2GalSeries` Sort-inside-Filter for Phase 3 unless trivially hoistable.
- [ ] **Step 4:** Acceptance — grep: zero remaining verbatim copies of the replaced expressions; pa-lint clean; wizard alternative-room suggestions behave identically (player check, rung 6).

---

## Task 8: PERF-3 — split the Rooms timeline into its own screen

**Files:** `Rooms.pa.yaml` (remove timeline tree + `varShowTimeline` switching), NEW `RoomsTimeline.pa.yaml`. **Do this LAST** — it is the largest diff, and Tasks 1–5 define the consolidated form the new screen is built in.

**The trap this task is designed around (memory + Phase-1 self-review):** re-parented/moved controls publish default-constructed and render black. Therefore NOTHING is moved: the new screen is **authored fresh**, every control under a **new name** (Y6 — old names stay unique app-wide until the old tree is deleted in the same push; still use fresh names to be safe: `tl2…` prefix).

- [ ] **Step 1:** Author `RoomsTimeline.pa.yaml` from the current timeline tree as reference, applying in the same breath: the Task 5 consolidation patterns to its static stacks (`conTLTitleRow`, `conTLCardHeader` legend (4→1), `conTLPick`, `conTLStatusRow` dot+text, `conTLRoomCard`, `conTLComposer` (4→1), and Rooms-browse `conRoomsHeading`) — gallery templates (`conTLGutter`, `conTLBookedText`) stay Labels; Task 3's batched row builder; fresh `tl2` control names throughout.
- [ ] **Step 2:** Navigation rewire: the browse-side "View timeline" path stops setting `varShowTimeline` and does `Navigate(RoomsTimeline, ScreenTransition.None)` after setting the existing timeline context (`glbSelectedDate`, selected room). Back button on the new screen → `Navigate(Rooms)`. `varShowTimeline` and its `Visible` gates are deleted; grep for every reader (Y2 — no orphaned readers).
- [ ] **Step 3:** Delete the old timeline tree from `Rooms.pa.yaml` in the same commit series (single push window — the app must never publish with both trees live and both nav paths wired).
- [ ] **Step 4:** OnVisible budget: `RoomsTimeline.OnVisible` gets the timeline-relevant subset of Rooms' current entry work (keep the guarded `colBookings` refresh decision made in Task 2 consistent here); Rooms' OnVisible sheds it.
- [ ] **Step 5:** Acceptance — App Checker SARIF: Rooms complexity < 300 (baseline 352); no new delegation warnings; timeline behavior parity player script (from Phase-1 rung-6 checks): room → View timeline → slot → chip states (BUG-5 fix intact) → Book → wizard prefill correct → back → browse state intact.

---

## Task 9: Verify, publish, close out

- [ ] **Step 1:** Full-tree pa-lint + pa-schema-validate clean; acceptance greps from every task re-run against the final tree.
- [ ] **Step 2:** App Checker SARIF diff vs Task 0 baseline (P10): performance findings ≤ baseline−15 (the 8 ForAll+Collect + 15 CollectDelegatableDataSource findings shrink), Rooms < 300 complexity, **zero new findings of any category**.
  - T7 expectations: CollectingReadOnlyTable −1 (varAlternativeRooms eliminated); verify no NEW App.Formulas findings on `AlternativeRoomsNow`/`TimelineCurrentBooking` (named formulas over imperatively-materialized collections not seeded in OnStart — watch the first probe compile). Rung-6 player addition: trigger a conflict → check alternatives list → tap an alt room → list should exclude it immediately.
- [ ] **Step 3:** Metrics table in the closing commit: control count (target ≈ 490–510 from 564), Label count, HtmlViewer count, `ClearCollect(colBookings` count (4), per-screen complexity.
- [ ] **Step 4:** Publish per PUBLISHING-PROTOCOL.md (P6/P7): single publisher, guard lock, human Studio session co-attached, human save (rung 5), player checks (rung 6): the Task 2/3/4/7/8 player scripts above + a full booking round-trip and series cancel.
- [ ] **Step 5:** Post-publish re-sync → `chore(sync): post-publish normalization`; push branch `perf/audit-phase2`; `guard.sh unlock`.

---

## Sequencing rationale & risk register

- **Order is load-bearing:** T1 (kit) → T2/T3/T4 (pure-formula perf, no layout risk, land early) → T5 (layout-touching consolidation) → T6/T7 (small rides) → T8 (structural split, consumes T1+T3+T5 patterns) → T9.
- **Biggest risks:** (1) T8 screen split — mitigated by fresh-names-only authoring and the single-push-window rule; (2) T5 visual regressions — mitigated by waves, per-file commits, Studio screenshots, and the explicit "skipping is acceptable" escape hatch on wave 3; (3) component compile watch-item — checked after the first component push; (4) T2 mirror drift — mitigated by copy-the-server-predicate rule and the `// MIRROR-FALLBACK` escape hatch.
- **What this plan deliberately does NOT do:** modernize Classic controls (PERF-9), touch state naming (Phase 3), fix Phase-1b bugs except in passing, convert gallery-template labels to HTML (policy rule 2 — revisit only if post-publish profiling shows template text is still a cost).

## Expected impact (against Task 0 baseline)

| Lever | Expected effect |
|---|---|
| T2 mirrors | ~15 full-window pulls per session of heavy use → ~3; every mutation loses its full-table network cost |
| T3 batching | 8 App Checker findings → ~0; grid/timeline builds emit 1 change notification instead of N |
| T4 precompute | ~240 per-tick LookUps (Rooms browse) + Home occupancy grid LookUps → 0 in templates |
| T5+T6 consolidation | −40 to −60 controls; Labels 207 → ~140; shell HtmlViewers (heaviest, ×6 screens) → 0 |
| T8 split | Rooms complexity 352 → <300 (threshold); Rooms OnVisible sheds the timeline half |
| Whole plan | Control total 564 → ~490–510; App Checker performance findings 33 → ≤18 |

*Plan written 2026-08-02 against fresh sync `perfpass-sync` (11 files; Phase-1 fixes confirmed live: `BookingsWindow`, `Concurrent()`, `RESET-SITE` markers present). Anchors are control names + quoted code per O3 — workers re-anchor against their own fresh sync.*
