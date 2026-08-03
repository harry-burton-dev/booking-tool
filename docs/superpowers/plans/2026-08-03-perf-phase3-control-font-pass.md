# Phase 3 — Control Optimisation & Font Fidelity Pass — Implementation Plan

> **Execute with: `orchestrator-coding`** — never a superpowers execute skill. Steps use checkbox (`- [ ]`) syntax for tracking. Lanes are declared per task below and are not re-litigated at dispatch time.

**Budget:** 8 dispatches, ≤800k subagent tokens. 1.5× either → STOP and report (skill hard rule).

> **STATUS (2026-08-03, CLOSED):** T0–T6 executed and PUBLISHED (branch `perf/phase3-control-font`, head `ba2eead`; 8 dispatches, ~781k subagent tokens — at budget, under ceiling). **Probe verdict (Harry): string-font Labels FALL BACK in the player; HtmlViewers render Plex** → T6 ran in HTML mode: 7 hero conversions (Find date, wizard step-1/3 titles, scope prompt, cancel-confirm + the 2 worker sites), with SideNavText/StatusWarnText lifted into ThemeMapHex. Final: **488 controls (from 511) / 92 Labels (from 123) / 47 HtmlViewers / 0 Font.Lato**; App Checker 14 = phase-2 baseline, zero new (P10 pass) after both publishes. One plan bug found by the compile gate and fixed (`132cfb7`): the T3 exemplar's ForAll/Concat paren structure. Remaining human item: rung-6 player checks on the T6 heroes at next convenience.

**Goal:** Finish what Phase 2's HTML consolidation started: convert the remaining static multi-Label stacks (including the two table headers wave 3 deferred), eliminate the one non-interactive gallery, kill all 70 remaining `Font.Lato` sites, and make IBM Plex Sans render everywhere it can — HTML controls where consolidation nets positive, string-font swaps where controls must stay native.

**Architecture:** Three levers. (1) **Consolidation, policy v2** — the Phase 2 HTML policy relaxed one notch: font fidelity is now a first-class driver, so 2→1 conversions (net −1) are allowed at static sites, and the two table headers convert using **shared width tokens** so HTML header and gallery rows can never drift apart. (2) **Gallery elimination** — `galConflictTimeline` has no `OnSelect`; a whole gallery + template (4 controls) becomes one `Concat`-built HtmlViewer. Interactive galleries keep their galleries (policy rule 2 stands). (3) **Font sweep** — every surviving `Font.Lato` becomes `Font: ="IBM Plex Sans"`, matching the 125 sites that already use the string form; controls that can never be HTML (inputs, buttons, gallery-template labels) get the best fidelity natively available.

**Tech Stack:** Power Apps Canvas (`.pa.yaml` via canvas-authoring MCP), pa-lint / pa-schema-validate / canvas-guard, App Checker SARIF diff (P10).

**Baseline (fresh sync 2026-08-03, `perf3-sync`, 12 files):** 511 controls, 123 Labels, 35 HtmlViewers, 70 `Font.Lato`, 125 `Font: ="IBM Plex Sans"`. Phase 2 (564→511) is published and live — `RoomsTimeline.pa.yaml` present on server.

---

## Ground rules (rule IDs — see `docs/RULES.md`; do not restate)

- **Process:** P1–P10 as in the Phase 2 plan; especially **P10** (App Checker issues never increase — SARIF diff is the acceptance gate), O1 (workers lint, never compile/commit), O2, O3.
- **Authoring:** Y1 (`: ` formulas are `|-` block scalars), Y2 (no orphaned readers), Y6 (fresh names for every new control), Y9 (empty spacer containers lose sizing — check parents when deleting labels). **DS1:** no raw hex outside the token block — HTML style strings reference `AppThemeHex`/`ThemeMapHex`-derived values only.
- **Anchors (O3):** anchor by control name + quoted code, never line numbers. Names below are from the 2026-08-03 fresh sync. Workers re-anchor against their own fresh sync; missing anchor → STOP and report drift.
- **Working model:** one scratch tree, one base sync handed to every worker; tasks in order (T1's tokens/UDFs are consumed by T2–T4). Worker loop: edit → `node tools/pa-lint/lint.js --src <dir>` → `node tools/pa-schema-validate/validate.js --src <dir>` → acceptance grep → READY report. One publish at the end (publisher only, guard lock, human co-attached — P6/P7).
- **Component watch-item:** after the first push touching `Components/*.pa.yaml` (T3), verify in the co-attached Studio session that `cpt_Modal_`'s custom properties still evaluate before continuing.

---

## HTML text policy v2 (delta from the Phase 2 policy — that document still governs everything not amended here)

1. **Net threshold relaxed to ≥1** (was ≥2): a 2-Label stack → 1 HtmlViewer is now a valid conversion, because font fidelity joined control count as a driver. 1→1 conversions remain banned **except** the optional T6 hero wave, which runs only if T0's font probe shows string-font Labels falling back in the player.
2. **Still never inside gallery templates** (rule 2 stands, re-confirmed by the T5-wave-2 revert of the Find week-cell HtmlViewer). Gallery-template font fidelity is handled by the string-font sweep (T5), not HTML.
3. **Whole-gallery replacement is a new, distinct move:** a gallery whose template has **no `OnSelect` and no interactive children** may be replaced by ONE HtmlViewer whose `HtmlText` is `Concat(...)` over the same table the gallery consumed. This is not a per-row HtmlViewer — it is one control, one parse, and it removes the gallery itself (galleries are among the heaviest containers). Only `galConflictTimeline` qualifies today; `galHDRoomsNow` (navigates to Find) and `mb2GalSeriesOcc` (opens detail modal) do NOT.
4. **Table headers convert with shared width tokens.** The wave-3 fear was header/row drift. Fix it structurally: column pixel widths move into an App.Formulas record consumed by BOTH the header HTML and the gallery-row label `Width`/`X` properties. One source of truth, drift impossible (T1/T2).
5. Everything else from the Phase 2 policy holds: `PaddingTop/Bottom/Left/Right: =0`, `DisplayMode: =DisplayMode.View`, styles from `CarbonHtmlType` + UDFs only, interpolated values through `fnHtmlEscape`, a11y reading order sensible, spot-check `get_accessibility_errors` on one converted screen.

---

## Task 0: Session open — connect, sync, reconcile, baseline, font probe

**Lane:** orchestrator-only (no dispatch). **Files:** none edited.

- [ ] **Step 1: Connect** (MCP `connect`, snake_case): `environment_id = "Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd"`, `app_id = "498d4962-0b5f-4990-a400-1bf5de9a367c"`, `login_hint = "harry@harry-burton.ai"`.
- [ ] **Step 2: Fresh sync into a NEW scratch dir** (never `Src/`): `sync_canvas(<scratch>/perf3-<yyyymmdd-hhmm>)`. Expect 12 files (11 + `RoomsTimeline.pa.yaml`).
- [ ] **Step 3: Reconcile git (P5):** copy sync over `Src/` on new branch `perf/phase3-control-font`, commit `sync: reconcile server drift before phase-3 control/font pass (P5)`.
- [ ] **Step 4: Baseline metrics:** pa-lint count; App Checker SARIF snapshot; per-file control counts (baseline table above); `grep -c "Font.Lato"` total (expect 70); `guard.sh verified "rung 1 baseline"`.
- [ ] **Step 5: Font-fidelity probe (human, 5 min, decides T6 only):** in the **published player** on a standard machine, screenshot side-by-side: (a) `mb2ConTableHead` labels (string-font "IBM Plex Sans") vs (b) any adjacent Phase-2 HtmlViewer (e.g. `htxHDOccHeader` region on Home). Three outcomes: **both render Plex** → T6 skipped. **HTML renders Plex, labels fall back** → T6 runs as written (HTML conversions). **Both fall back** (client has no Plex) → T6 runs in **SVG text-as-path mode** for static sites only (see creative-options table): glyph outlines are pre-baked offline with opentype tooling into static SVG data-URIs rendered by Image controls; dynamic text (dates, titles) stays HTML/native — outlines cannot be composed in Power Fx. Record the verdict + screenshot path in the T0 commit body. *The rest of the plan does not branch on this — HTML conversion sites were chosen for net control reduction independent of the probe.*

---

## Task 1: Token & kit extensions (enables T2–T4)

**Lane:** novel (formula-only, but App.Formulas breakage hits every screen — orchestrator probe-compiles this task ALONE before dispatching T2). **Risk flag:** none beyond the probe. **Files:** Modify `App.pa.yaml` (`Formulas:` block only).

- [ ] **Step 1: Lift two hex tokens** needed by T3's conflict-timeline HTML into `ThemeMapHex` (BOTH branches, keeping the KEEP-IN-SYNC comment discipline): `HeaderBackground` and `Layer01Bg`, values copied from the corresponding `ThemeMap`/`ColourTokens` entries (worker reads the current `ThemeMap` block to source the exact hex — anchor: the `ThemeMapHex = {` block, which today carries exactly ten tokens ending `SurfaceAlt`).
- [ ] **Step 2: Add positioning UDFs** after the existing `CarbonSwatch` (anchor: `CarbonSwatch(hex:Text, px:Number):Text`):

```
/* Phase-3 additions: absolute-positioned span + relative row wrapper, for the
   Home occupancy column header (fractional-width hour marks). leftCss is a full
   CSS length/calc() expression, e.g. "calc(170px + (100% - 218px)*0.2)". */
CarbonRelRow(hPx:Number, content:Text):Text = "<div style=""position: relative; height: " & hPx & "px;"">" & content & "</div>";
CarbonAbsSpan(leftCss:Text, css:Text, content:Text, hex:Text):Text = "<span style=""position: absolute; top: 2px; left: " & leftCss & "; " & css & " color: " & hex & ";"">" & content & "</span>";
CarbonAbsSpanRight(rightCss:Text, css:Text, content:Text, hex:Text):Text = "<span style=""position: absolute; top: 2px; right: " & rightCss & "; " & css & " color: " & hex & ";"">" & content & "</span>";
```

- [ ] **Step 3: Add one ramp entry** to `CarbonHtmlType` (the table headers render 10px uppercase, which no existing entry covers — DS1 forbids ad-hoc `font-size:` strings at sites):

```
TableHead: "font-size: 10px; font-family: " & CarbonFontFamily & "; font-weight: 400; letter-spacing: 0.32px;",
```

- [ ] **Step 4: Add the myBookings shared column-width record** (policy v2 rule 4) next to the other layout constants:

```
/* Single source of truth for the myBookings table columns - consumed by BOTH
   htxMb2TableHead's flex spans (T2) and the mb2GalBookings row-label Width/X
   properties. Change a width here, header and rows move together. */
MB2TableCols = { Room: 200, Date: 110, Time: 120, Status: 120, Action: 64 };
```

   Worker verifies `Action: 64` against the actual `mb2LblHeadAction`/row-action control widths in the fresh sync and corrects the record to match reality (anchor: `mb2LblHeadAction`).
- [ ] **Step 5: Acceptance** — pa-lint + schema-validate clean; grep: `CarbonRelRow`, `CarbonAbsSpan`, `MB2TableCols`, `TableHead`, `HeaderBackground` present in `App.pa.yaml`; no consumers yet, zero behavior change. Commit `feat(app): phase-3 kit - positional UDFs, TableHead ramp entry, MB2TableCols, lifted hex tokens`.
- [ ] **Step 6 (orchestrator): probe compile** — publish this commit alone under the lock per the Novel-lane rule; compiler verdict becomes a constraint for T2–T4.

---

## Task 2: Static-stack conversions on screens

**Lane:** batched (pattern proven in Phase 2 waves 1–2). **Files:** Modify `Home.pa.yaml`, `myBookings.pa.yaml`, `bookingDetail.pa.yaml`, `Rooms.pa.yaml`. One commit per file.

Six sites. Every replacement control is a **fresh name** (Y6), carries the standard HtmlViewer hygiene block (policy v2 rule 5), and the emptied labels are deleted in the same edit. Check each parent container after deletion (Y9).

- [ ] **Step 1 — myBookings table header (6→1, the wave-3 deferral, now with locked widths).** In `mb2ConTableHead` (AutoLayout horizontal, `PaddingLeft: =32`, `PaddingRight: =16`), delete `mb2LblHeadMeeting/Room/Date/Time/Status/Action` and insert:

```
- htxMb2TableHead:
    Control: HtmlViewer
    Properties:
      AlignInContainer: =AlignInContainer.Center
      DisplayMode: =DisplayMode.View
      FillPortions: =1
      Height: =16
      PaddingBottom: =0
      PaddingLeft: =0
      PaddingRight: =0
      PaddingTop: =0
      HtmlText: |-
        ="<div style=""display: flex; align-items: center;"">" &
         CarbonSpan("flex: 1 1 auto; " & CarbonHtmlType.TableHead, "MEETING", AppThemeHex.TextMuted) &
         CarbonSpan("flex: 0 0 " & MB2TableCols.Room & "px; " & CarbonHtmlType.TableHead, "ROOM", AppThemeHex.TextMuted) &
         CarbonSpan("flex: 0 0 " & MB2TableCols.Date & "px; " & CarbonHtmlType.TableHead, "DATE", AppThemeHex.TextMuted) &
         CarbonSpan("flex: 0 0 " & MB2TableCols.Time & "px; " & CarbonHtmlType.TableHead, "TIME", AppThemeHex.TextMuted) &
         CarbonSpan("flex: 0 0 " & MB2TableCols.Status & "px; " & CarbonHtmlType.TableHead, "STATUS", AppThemeHex.TextMuted) &
         CarbonSpan("flex: 0 0 " & MB2TableCols.Action & "px; " & CarbonHtmlType.TableHead, "ACTION", AppThemeHex.TextMuted) &
         "</div>"
```

   Then repoint the corresponding `mb2GalBookings` row-label `Width` properties at `MB2TableCols.*` (widths only — text/layout untouched; the row labels themselves are handled by T5's font sweep, not converted). Anchor rows: `mb2LblRowRoom` (`Width: =200` → `=MB2TableCols.Room`), `mb2LblRowDate` (110), `mb2LblRowTime` (120), `mb2LblRowStatus` (120), and the action control.
- [ ] **Step 2 — Home occupancy column header (8→1).** In `conHDOccColHeader` (ManualLayout, height 20), delete `lblHDOccColRoom`, `lblHDOccHour08/10/12/14/16/18`, `lblHDOccColUsed` and insert one HtmlViewer (`htxHDOccColHeader`, Width `=Parent.Width`, Height 20, hygiene block) whose `HtmlText` reproduces the exact current geometry — the labels sit at `X: =170 + (Parent.Width - 218) * f` which is calc-expressible:

```
HtmlText: |-
  =CarbonRelRow(20,
      CarbonAbsSpan("0px", CarbonHtmlType.Eyebrow, "ROOM", AppThemeHex.TextMuted) &
      CarbonAbsSpan("170px", CarbonHtmlType.Eyebrow, "08", AppThemeHex.TextMuted) &
      CarbonAbsSpan("calc(170px + (100% - 218px)*0.2)", CarbonHtmlType.Eyebrow, "10", AppThemeHex.TextMuted) &
      CarbonAbsSpan("calc(170px + (100% - 218px)*0.4)", CarbonHtmlType.Eyebrow, "12", AppThemeHex.TextMuted) &
      CarbonAbsSpan("calc(170px + (100% - 218px)*0.6)", CarbonHtmlType.Eyebrow, "14", AppThemeHex.TextMuted) &
      CarbonAbsSpan("calc(170px + (100% - 218px)*0.8)", CarbonHtmlType.Eyebrow, "16", AppThemeHex.TextMuted) &
      CarbonAbsSpanRight("48px", CarbonHtmlType.Eyebrow, "18", AppThemeHex.TextMuted) &
      CarbonAbsSpanRight("0px", CarbonHtmlType.Eyebrow, "USED", AppThemeHex.TextMuted)
  )
```

   Note the current labels render 11px sentence-case text, not the Eyebrow style — if `CarbonHtmlType.Eyebrow`'s uppercase transform changes appearance (texts are already uppercase literals, so it should not), use `CarbonHtmlType.Label01` with `font-size: 11px` semantics instead; match the current render, judgment call, note the choice.
- [ ] **Step 3 — Home occupancy legend (3→1).** `conHDOccLegend` still holds `htxHDOccLegendNow` + `lblHDOccLegendFree` + `lblHDOccLegendBooked`. Merge all three into one fresh HtmlViewer composing the existing now-marker fragment plus two `CarbonSwatch(...)`+text pairs (swatch colors: read the two labels'/their swatch rectangles' current fill tokens from the sync and route through `AppThemeHex`; if a needed hex token is not yet lifted, lift it in the same commit following the T1 Step-1 pattern). Delete the three originals.
- [ ] **Step 4 — myBookings breadcrumb tail (2→1).** `mb2ConBreadcrumb`: `mb2LblCrumbSep` + `mb2LblCrumbCurrent` → one `htxMb2CrumbTail` (`CarbonTextSecondary` sep + `CarbonText` current, inline spans). If either label carries an `OnSelect`, STOP conversion for this site and note it (policy rule 3 from Phase 2 still applies).
- [ ] **Step 5 — bookingDetail title/empty (2→1).** `conDetail`: `lblDetailTitle` / `lblDetailEmpty` have mutually exclusive `Visible`s → one `htxDetailTitle` with `If(<empty-state predicate>, CarbonTextSecondary(...empty text...), CarbonText(CarbonHtmlType.Heading03, ...title...))` — copy the predicate verbatim from `lblDetailEmpty.Visible`.
- [ ] **Step 6 — Rooms heading (2→1).** `conRoomsHeading`: `lblRoomsHeading` + `lblRoomsResultSummary` → one `htxRoomsHeading` (heading + secondary line, matching current sizes from the sync).
- [ ] **Step 7: Acceptance** — pa-lint + schema-validate clean per file; greps: deleted names return 0 hits app-wide (Y2 — includes any `Height`/`Y` formulas on siblings that referenced them, e.g. `conTitleField`-style height chains); control-count delta ≈ −17 across the four files. Player checks deferred to T7 rung 6: myBookings header/row column alignment at multiple window widths; Home occ header hour marks align with `galHDOccSegments` (`X: =170`, `Width: =Parent.TemplateWidth - 218` — same geometry the calc() mirrors).

---

## Task 3: Wizard component pass (`cpt_Modal_`) — gallery elimination + caption consolidation

**Lane:** high-risk — reason: first `Components/*` edit of the pass (compile watch-item) plus deletion of a gallery. ONE diff-scoped reviewer per the skill. **Files:** Modify `Components/cpt_Modal_.pa.yaml`.

- [ ] **Step 1 — `galConflictTimeline` → one HtmlViewer (policy v2 rule 3; −3 controls and −1 gallery).** The gallery's `Items` is a pure `ForAll(Sequence(7), ...)` over `varConflictingBooking` and its template (`rectSlotBg`, `lbl_textSlotStatus`, `lbl_textSlotStartTime`) has no interactivity. Replace the whole gallery with `htxConflictTimeline` (same Height 280, `BorderColor`/`BorderThickness` reproduced as a CSS `border: 1px solid` on the wrapper div using `AppThemeHex.Border`):

```
HtmlText: |-
  ="<div style=""border: 1px solid " & AppThemeHex.Border & ";"">" &
   Concat(
       ForAll(
           Sequence(7),
           With({ _s: DateAdd(varConflictingBooking.StartDateTime, (Value - 3) * 30, TimeUnit.Minutes),
                  _e: DateAdd(varConflictingBooking.StartDateTime, (Value - 2) * 30, TimeUnit.Minutes) },
             { Row:
                 "<div style=""display: flex; align-items: center; height: 40px; padding: 0 8px; background-color: " &
                 If(_s >= varConflictingBooking.StartDateTime && _e <= varConflictingBooking.EndDateTime,
                    AppThemeHex.HeaderBackground, AppThemeHex.Layer01Bg) &
                 ";"">" &
                 CarbonSpan("flex: 0 0 52px;" & CarbonHtmlType.Label01, Text(_s, "HH:mm"), AppThemeHex.TextMuted) &
                 CarbonSpan("flex: 1 1 auto; margin-left: 8px;" & CarbonHtmlType.Label01,
                     fnHtmlEscape(
                         If(_s >= varConflictingBooking.StartDateTime && _s < varConflictingBooking.EndDateTime,
                            If(_s = varConflictingBooking.StartDateTime,
                               If(varConflictingBooking.IsPrivate && varConflictingBooking.BookedByEmail <> Lower(User().Email),
                                  "Private booking",
                                  varConflictingBooking.Title & " - " & varConflictingBooking.BookedBy.DisplayName),
                               ""),
                            If(_s = varNextFreeSlot, "Next free slot", "Free"))),
                     If(_s >= varConflictingBooking.StartDateTime && _e <= varConflictingBooking.EndDateTime,
                        AppThemeHex.PrimaryText,
                        If(_s = varNextFreeSlot, AppThemeHex.StatusFreeText, AppThemeHex.TextSecondary))) &
                 "</div>" }),
       Row)
   & "</div>"
```

   The text/color predicates are copied verbatim from the current template (anchor: `rectSlotBg.Fill`, `lbl_textSlotStatus.Text`/`.Color`, `lbl_textSlotStartTime`) — copy, do not re-derive; the booking title goes through `fnHtmlEscape` (kit rule).
- [ ] **Step 2 — conflict-panel captions.** `lbl_textTimelineLabel` and `lbl_textAlternativeRoomsTime` are single caption labels between galleries — convert each 2-role site only where a sibling merge exists; otherwise leave for T5's font sweep. `lbl_textNoRoomsAvailable` (empty-state) stays a Label (conditionally visible, cheap). Judgment; note outcomes.
- [ ] **Step 3 — Step-2 title row.** `lbl_textStep2_chooseDate` (title) + `lbl_textRebuilding` (transient status) → one `htxStep2Title` with `If(<rebuilding predicate>, ...status..., ...title...)` ONLY if their `Visible`s are mutually exclusive in the sync; if they can show simultaneously, compose both lines in one HtmlViewer instead. `lblStep2Hint` stays (separate position in the layout).
- [ ] **Step 4:** Field caption labels (`lbl_textBookingTitleLabel`, start/end-time, repeats, occurrences, private, book-for) and error labels **stay native Labels** — an input control sits between caption and error, so no consolidation nets positive; their font is fixed by T5. Container height chains like `conTitleField.Height` reference the labels by name — they must keep working untouched.
- [ ] **Step 5: Acceptance** — pa-lint + schema-validate clean; grep: `galConflictTimeline|rectSlotBg|lbl_textSlotStatus|lbl_textSlotStartTime` → 0 hits; component custom properties intact in Studio after push (watch-item). Reviewer (high-risk lane) gets the diff + this spec; named risk points: predicate-copy fidelity in Step 1, Y2 orphan check for deleted names, component property evaluation. Commit `perf(bookModal): conflict timeline gallery to single HtmlViewer; step-2 title merge (phase-3 T3)`.

---

## Task 4: Shell wordmark (2→1, ×6 screen instances)

**Lane:** batched. **Files:** Modify `Components/Shell_Header.pa.yaml`.

`con_Header_Wordmark` holds `lbl_Header_Wordmark_Primary` ("MOC", semibold, `AppTheme.HeaderNavItemText`) + `lbl_Header_Wordmark_Secondary` (" | BOOK", tint borrows `AppTheme.ButtonDisabled` — see the T6 comment on its `Color`). Two labels on every screen = 12 runtime controls.

- [ ] **Step 1:** Replace both with one `htxHeaderWordmark` (Width 192, Height 48, hygiene block, X/positioning matching the container):

```
HtmlText: |-
  ="<div style=""display: flex; align-items: center; height: 48px; padding-left: 16px;"">" &
   CarbonSpan("font-size: 14px; font-family: " & CarbonFontFamily & "; font-weight: 600;", "MOC", AppThemeHex.HeaderNavItemText) &
   CarbonSpan("font-size: 14px; font-family: " & CarbonFontFamily & "; font-weight: 400;", "&nbsp;| BOOK", AppThemeHex.WordmarkSecondary) &
   "</div>"
```

   DS1: the two hex literals must NOT be inline — the header colors exist only as `ThemeHex.HeaderNavItemText` (URL-encoded, unusable in CSS) and the `ButtonDisabled` borrow. Lift `HeaderNavItemText: "#f4f4f4"` and `WordmarkSecondary: "#c6c6c6"` into `ThemeMapHex` (both branches; header renders on the dark header band in both themes, so both branches carry the same values — comment that) and reference `AppThemeHex.*`. Carry the borrow-note comment forward onto the new token.
- [ ] **Step 2: Acceptance** — grep: `lbl_Header_Wordmark` → 0 hits; header renders identically on all 6 screens + RoomsTimeline (Studio, rung 5). Commit `perf(shell): wordmark labels to single HtmlViewer with lifted header tokens (phase-3 T4)`.

*Deliberately skipped here:* `bdmStatusRow` (`bdmTag` has a filled pill background + live countdown — Phase 2 wave 3 already judged the fidelity risk not worth it; nothing has changed). Note it in the closing report as re-affirmed, not forgotten.

---

## Task 5: The Lato eradication sweep (70 → 0)

**Lane:** batched, mechanical (haiku-eligible). **Files:** Modify `bookingDetail.pa.yaml` (~13 sites), `Find.pa.yaml` (~6), `Profile.pa.yaml` (~7), `Components/cpt_Modal_.pa.yaml` (remaining after T3, ~40).

Every surviving `Font: =Font.Lato` becomes `Font: ="IBM Plex Sans"` — the string form the other 125 sites already use. This covers everything HTML can never reach: Classic buttons (`btnDetailBack`, `btnCancelStart`, `btnScope*`, wizard footer buttons, …), Classic inputs (`txtBookingTitle`, dropdowns, date picker), gallery-template labels (`lblBookingTitle_v2`, `lblWeekFree_v2`, wizard `galRooms`/`galAlternativeRooms` labels), and conditional error labels.

- [ ] **Step 1:** Pure textual replace of `Font: =Font.Lato` → `Font: ="IBM Plex Sans"` across the four files. NOTHING else changes — no size, weight, color, or layout edits ride along (surgical-change rule; wave-3 lesson).
- [ ] **Step 2: Acceptance** — `grep -c "Font.Lato"` across the tree → 0; git diff shows ONLY `Font:` lines changed (mechanical-diff check, O2); pa-lint clean. Commit `style(app): eradicate Font.Lato - string-font IBM Plex Sans everywhere (phase-3 T5)`.

---

## Task 6 (CONDITIONAL — runs only if T0 Step 5 probe showed string-font fallback): hero text 1→1 conversions

**Lane:** batched. **Files:** Modify `Find.pa.yaml`, `bookingDetail.pa.yaml`, `Components/cpt_Modal_.pa.yaml`.

If native string-fonts don't render Plex in the player, the T5 sweep fixes nothing visually and the most **prominent** single text controls justify 1→1 HtmlViewer conversion (policy v2 rule 1's stated exception). Candidates, largest-glyph-first: `lblFindDate` (Find header date), `lblDetailTitle`-replacement already covered by T2 Step 5, `lbl_textStep1_chooseRoom` / `lbl_textStep4_confirmBooking` (wizard step titles), `lblScopePromptTitle`, `lblCancelConfirm`. Body/meta/gallery text stays native regardless — per-instance HtmlViewer weight is not worth sub-heading text.

- [ ] **Step 1:** Convert the candidate list 1→1 (`CarbonText(CarbonHtmlType.Heading03/Heading02, ...)`, fresh `htx` names, hygiene block, delete originals, Y2 grep for name references in sibling size chains).
- [ ] **Step 2: Acceptance** — pa-lint clean; visual parity in Studio; net control count unchanged (1→1), HtmlViewer count +≈5. Commit `feat(type): hero text to HtmlViewer for font fidelity (phase-3 T6, probe-gated)`.
- [ ] **If the probe passed (fonts render):** mark this task SKIPPED in the plan file and the closing report — an acceptable outcome, not a gap.

---

## Task 7: Verify, publish, close out

**Lane:** orchestrator + publisher. 

- [ ] **Step 1:** Full-tree pa-lint + pa-schema-validate; re-run every task's acceptance grep against the final tree.
- [ ] **Step 2:** App Checker SARIF diff vs T0 baseline (P10): **zero new findings**; expect small decreases (one gallery removed, ~25 fewer controls).
- [ ] **Step 3:** Metrics table in the closing commit: control count (target ≈ 483–490 from 511), Label count (target ≈ 90–95 from 123), HtmlViewer count (~40, net +5–10 with the shell/wizard instance math in the commit body), `Font.Lato` count (0 from 70), gallery count (−1).
- [ ] **Step 4:** Publish per `PUBLISHING-PROTOCOL.md` (P6/P7): single publisher, guard lock, human co-attached, human save (rung 5), player checks (rung 6): myBookings table header/row alignment at ≥2 widths; Home occ header alignment against the segment gallery; conflict wizard path — force a conflict → timeline renders with correct highlight band, private-booking masking, next-free-slot green; wordmark on all screens; a full booking round-trip.
- [ ] **Step 5:** a11y spot-check (`get_accessibility_errors`) on myBookings + Home — count not worse than baseline.
- [ ] **Step 6:** Post-publish re-sync → `chore(sync): post-publish normalization`; push branch; `guard.sh unlock`.

---

## Creative options considered — and why they are (mostly) not in this plan

| Idea | Verdict | Reason |
|---|---|---|
| **Whole-gallery → Concat HtmlViewer** | **IN (T3)** for `galConflictTimeline` | No interactivity; kills a gallery + 3 template controls for one parse-once control. |
| Same for `galHDRoomsNow` / `mb2GalSeriesOcc` | OUT | Both templates have `OnSelect` (navigate to Find / open detail modal). HTML can't hit-test rows. |
| **Transparent overlay gallery for hit-testing** (HTML list + an empty-template gallery on top catching taps) | OUT, documented for the future | Works in principle, but couples two controls' geometry invisibly and breaks a11y focus order — the 546-error baseline doesn't need help. Revisit only if profiling shows row-label cost matters. |
| **Per-row HtmlViewer pilot with measurement gate** | OUT | The T5-wave-2 Find week-cell conversion was already tried and reverted in Phase 2 (`accb970`). Re-running the experiment without new evidence is churn. |
| **Shared width tokens for header/row lock-step** | **IN (T1/T2)** | Removes the drift risk that deferred both table headers in Phase 2 — structural fix, not a screenshot promise. |
| **calc()-based absolute HTML positioning** for the fractional occ header | **IN (T2)** | Exactly mirrors the existing `X` formulas; the only way one control can reproduce ManualLayout fractional geometry. |
| **SVG `<text>` via Image controls** (app already has the UDF machinery) | OUT for dynamic text | `font-family` inside SVG has the same client-font constraint as HTML/Labels, plus the audit's PERF-10 regeneration lesson. SVG stays for icons. |
| **SVG text-as-path via Image controls** (glyphs pre-converted to `<path>` outlines with opentype tooling, baked into static data-URIs) | **IN as probe-gated fallback (T6-alt)** | The ONLY mechanism that renders exact Plex glyphs regardless of client-installed fonts — Labels, HtmlViewers, and SVG `<text>` all fall back without the font installed. Static-text-only (outlines are pre-baked, not composable in Power Fx): wordmark, table-header words, step titles. Image controls are also lighter than HtmlViewers. If the T0 probe shows even HtmlViewers falling back, this replaces T6's HTML conversions for static sites; the wordmark (a logo — fixed text, brand-critical) is the first candidate either way. |
| **Modern controls / theme-level font** (PERF-9) | OUT, unchanged | Full control-migration program with its own risks; audit sequences it after this. A theme JSON font would only affect Modern controls the app doesn't use yet. |
| **@font-face / external font loading in HtmlViewer** | OUT | HtmlText sanitizes style blocks inconsistently across players and external fetches are CSP-hostile; nothing to build on. The kit's `CarbonFontFamily` fallback chain is the honest ceiling. |

## Expected impact (vs 2026-08-03 baseline)

| Lever | Expected effect |
|---|---|
| T2 static stacks | −17 controls across 4 screens; both deferred table headers finally converted, drift-proof |
| T3 gallery elimination | −3 controls, −1 gallery instance inside the busiest component; conflict timeline renders in one parse |
| T4 wordmark | −1 definition control = −6 runtime instances; header tokens finally in the token system |
| T5 sweep | `Font.Lato` 70 → 0; single consistent font story app-wide |
| T6 (conditional) | Plex guaranteed on hero text if native string-fonts prove broken |
| Whole plan | Controls 511 → ~483–490; Labels 123 → ~90; every text site either HTML-Plex or best-native-Plex |

*Plan written 2026-08-03 against fresh sync `perf3-sync` (12 files, Phase 2 confirmed live). Anchors are control names + quoted code per O3 — workers re-anchor against their own fresh sync.*
