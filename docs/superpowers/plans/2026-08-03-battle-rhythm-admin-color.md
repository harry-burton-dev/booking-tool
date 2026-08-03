# Battle Rhythm, Owner-Coded Timelines, Admin Screen — Implementation Plan

> **Execute with: `orchestrator-coding`** — never a superpowers execute skill. Steps use checkbox
> (`- [ ]`) syntax for tracking. Lanes are declared per task below and are not re-litigated at
> dispatch time.

**Budget:** 12 dispatches, ≤1.2M subagent tokens. 1.5× either → STOP and report (skill hard rule).

**Spec:** `docs/superpowers/specs/2026-08-03-battle-rhythm-admin-color-design.md` (approved by
Harry 2026-08-03). Read it before dispatching anything — this plan implements it and does not
restate rationale.

**Goal:** (A) color timeline blocks on Find + RoomsTimeline by owner class (mine / past / other /
Battle Rhythm), (B) Battle Rhythm permanent bookings as one master row + read-time virtual
expansion + exception rows for deviating occurrences, (C) an admin-only screen (myBookings-style
chrome, 3 tabs: All bookings / Battle Rhythm / Rooms).

**Architecture:** All BR state lives in `Book_Bookings` with prefix-encoded `RecurrenceType`
(`BR-Weekly` / `BR-Fortnightly` / `BR-Monthly` masters, `BR-Exception` deviations) — no
SharePoint schema change. An App.Formulas expansion (`BRVirtual`) generates in-memory occurrence
records from `colBRMasters`, suppressed per-occurrence by exception rows; named formula
`AllBookings` unions reshaped real rows with virtual ones and becomes the read surface for
timelines and every conflict check. Color coding is a row-build field (`IsBR`) + render-time
predicates. Admin gating is `IsAdmin` in App.Formulas (UI-level only, per spec).

**Tech Stack:** Power Apps Canvas (`.pa.yaml` via canvas-authoring MCP), pa-lint /
pa-schema-validate / canvas-guard, App Checker SARIF diff (P10).

**Two publish checkpoints:** after T3 (Phase A ships alone — `br` class simply never matches
yet) and after T10 (Phases B+C land together; B without C has no authoring surface).

---

## Ground rules (rule IDs — see `docs/RULES.md`; do not restate)

- **Process:** P1–P10; especially P4 (commit with every publish), P5 (open/close sync
  reconcile), P6/P7 (single publisher, human co-attached), P10 (SARIF diff — App Checker
  baseline is **14**; new issues block). O1 (workers lint, never compile/commit), O2, O3.
- **Authoring:** Y1 (inline `UpdateContext`/`Set` in `: ` position → `|-` block scalars), Y2,
  Y4 (Classic/Button has no AccessibleLabel — accessible name goes in transparent `Text`),
  Y6 (fresh control names — new controls here use suffix `_ad` for Admin, `_br` for BR sites),
  Y9. **DS1:** no raw hex outside the token block.
- **Anchors (O3):** anchor by control name + quoted code, never line numbers. Names below are
  from the 2026-08-03 fresh sync. Workers re-anchor against their own fresh sync; missing
  anchor → STOP and report drift.
- **Fonts:** Plex renders only in HtmlViewers (2026-08-03 probe verdict). All new visible text
  on Admin uses HtmlViewer + `CarbonHtmlType`/`CarbonText*`; native controls only for inputs
  and hit-targets.
- **Probe-compile doctrine:** T4 (the `AllBookings` union) is THE type-risk of this plan. It is
  implemented and compiled ALONE before T5–T10 are dispatched; the compiler's verdict becomes a
  hard constraint in every later task spec.
- **Mirror convention (App.pa.yaml `MIRROR CONVENTION` comment):** every `Book_Bookings` write in
  this plan mirrors into `colBookings` (and refreshes `colBRMasters` when a master row changes).
  `BRVirtual` reads exceptions from `colBookings`, so the mirror is load-bearing, not cosmetic.

---

## Task 0: Session open — connect, sync, reconcile, baseline

**Lane:** orchestrator-only (no dispatch). **Files:** none edited.

- [ ] **Step 1: Connect** (MCP `connect`, snake_case): `environment_id =
  "Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd"`, `app_id =
  "498d4962-0b5f-4990-a400-1bf5de9a367c"`, `login_hint = "harry@harry-burton.ai"`.
- [ ] **Step 2: Fresh sync into a NEW scratch dir** (never `Src/`):
  `sync_canvas(<scratch>/brplan-<yyyymmdd-hhmm>)`. Expect 12 files.
- [ ] **Step 3: Reconcile git (P5):** byte-compare sync vs `Src/`; if drifted, copy sync over
  `Src/` on new branch `feat/br-admin-color` (branched from current head) and commit
  `sync: reconcile server drift before BR/admin/color pass (P5)`. If clean, just branch.
- [ ] **Step 4: Baseline:** pa-lint count, App Checker SARIF snapshot (expect 14),
  `guard.sh verified "rung 1 baseline"`.

---

## Phase A — owner-coded timelines (T1–T3, publishable alone)

### Task 1: Tokens + FindBookings projection field

**Lane:** novel (App.Formulas breakage hits every screen — orchestrator probe-compiles this task
alone before dispatching T2/T3). **Files:** Modify `App.pa.yaml` (`Formulas:` block only).

- [ ] **Step 1: Add two hex tokens to `ThemeMapHex`** (BOTH branches, keep-in-sync comment
  discipline; anchor: the `ThemeMapHex = {` block, each branch currently ends
  `StatusWarnText`):

```
Light branch:  BattleRhythm: "#8a3ffc", BattleRhythmText: "#ffffff"
Dark branch:   BattleRhythm: "#a56eff", BattleRhythmText: "#ffffff"
```

- [ ] **Step 2: Add the past-fade constant** beside the other `Timeline_*` constants (anchor:
  `Timeline_RoomColPx = 200;`). Text, not number — it is spliced into CSS and must not pick up
  locale decimal separators:

```
/* Owner-coded timelines: opacity applied to blocks/segments whose end is before
   varNowTick. Text so the CSS splice is locale-immune. */
Timeline_PastOpacityCss = "0.45";
```

- [ ] **Step 3: Carry `RecurrenceType` through the `FindBookings` projection** (anchor: the
  `FindBookings = Sort(ForAll(` named formula, record currently ends `EndDateTime: If(...)`).
  Add one field to the ForAll record:

```
RecurrenceType: Coalesce(b.RecurrenceType, "")
```

- [ ] **Step 4:** `node tools/pa-lint/lint.js --src <dir>` and
  `node tools/pa-schema-validate/validate.js --src <dir>` — clean. READY report.
- [ ] **Step 5 (orchestrator): probe-compile T1 alone**, then commit
  `feat(theme): BR + past-fade tokens, RecurrenceType in FindBookings projection`.

### Task 2: Find screen — day blocks, week segments, legend

**Lane:** pattern (mirrors existing block HTML; T1 tokens exist). **Files:** Modify
`Find.pa.yaml`.

- [ ] **Step 1: Extend `colFindRows` booked-row build** (anchor: `btnLoadFindBookings.OnSelect`,
  record containing `IsMine:    Lower(Coalesce(b.BookedByEmail, "")) = Lower(User().Email)`).
  Add after `IsMine`:

```
IsBR:      StartsWith(Coalesce(b.RecurrenceType, ""), "BR-")
```

  Also add `IsBR:false` to all four free-row `Collect` records in the same handler (schema
  union — a collection's columns must agree).
- [ ] **Step 2: Day-view block coloring** (anchor: the booked-block ForAll inside the lane
  HtmlViewer, quoted code `background:" & If(b.IsMine, AppThemeHex.Primary, AppThemeHex.Border)`).
  Replace the block's background/box-shadow/text-color logic with the 4-way form, and add the
  past fade on the outer block div:

```
background:" & If(b.IsBR, AppThemeHex.BattleRhythm, b.IsMine, AppThemeHex.Primary, AppThemeHex.Border) & ";
box-shadow:" & If(b.IsBR || b.IsMine, "none", "inset 3px 0 0 0 " & AppThemeHex.TextSecondary) & ";
opacity:" & If(b.RowEnd < varNowTick, Timeline_PastOpacityCss, "1") & ";
```

  Title color: `If(b.IsBR, AppThemeHex.BattleRhythmText, b.IsMine, AppThemeHex.PrimaryText,
  AppThemeHex.TextPrimary)`; meta-line color: `If(b.IsBR, AppThemeHex.BattleRhythmText,
  b.IsMine, ColourTokens.Light.Accent, AppThemeHex.TextMuted)` (existing Accent exception
  stands). Past fade uses `varNowTick`, evaluated at render so it stays live.
- [ ] **Step 3: Week-view segment coloring** (anchor: `btnLoadFindBookings.OnSelect` week
  builder, quoted code `Lower(Coalesce(_hit.BookedByEmail, "")) = Lower(User().Email),
  AppThemeHex.Primary,`). Extend the segment `If` to:

```
If(IsBlank(_hit), AppThemeHex.Border,
   StartsWith(Coalesce(_hit.RecurrenceType, ""), "BR-"), AppThemeHex.BattleRhythm,
   Lower(Coalesce(_hit.BookedByEmail, "")) = Lower(User().Email), AppThemeHex.Primary,
   AppThemeHex.TextSecondary)
```

  (`WeekBookings` rows are unprojected `colBookings` rows, so `RecurrenceType` is already
  available.) Add day-level past fade on the week cell div: `opacity:` spliced with
  `If(c.RowEnd < varNowTick, Timeline_PastOpacityCss, "1")`.
- [ ] **Step 4: Legend** (anchor: the legend HtmlViewer containing quoted text
  `Your booking</span>`). Insert two swatch spans, copying the existing swatch span structure
  verbatim with: `AppThemeHex.BattleRhythm` swatch labelled `Battle Rhythm`, and an
  `AppThemeHex.Border` swatch with inline `opacity:0.45` labelled `Past`.
- [ ] **Step 5:** lint + schema-validate clean; acceptance grep
  `grep -c "BattleRhythm" Find.pa.yaml` ≥ 4. READY report.

### Task 3: RoomsTimeline — blocks + legend

**Lane:** pattern. **Files:** Modify `RoomsTimeline.pa.yaml`.

- [ ] **Step 1: Extend the `colRoomBookings` build** (anchor: the record containing
  `IsMine: booking.BookedBy.Email = User().Email,`). Add:

```
IsBR: StartsWith(Coalesce(booking.RecurrenceType, ""), "BR-"),
```

  Add `IsBR: false` to every other record collected into `colRoomBookings` in the same handler
  (the free/gap records at the anchors containing `IsMine: false,`).
- [ ] **Step 2: Block coloring** — worker locates the lane render site(s) consuming
  `colRoomBookings` (`IsMine` is the search key) and applies the same 4-way background /
  text-color / `opacity` past-fade splice as Task 2 Step 2 (repeat the code from that step —
  same formulas, `ThisItem.`/lane-row prefix as found on site).
- [ ] **Step 3: Legend** — same two swatches as Task 2 Step 4 at this screen's legend site
  (search key: existing `Your booking` or equivalent legend text; if the screen has no legend,
  add none — do not invent chrome).
- [ ] **Step 4:** lint + schema-validate clean; acceptance grep
  `grep -c "IsBR" RoomsTimeline.pa.yaml` ≥ 3. READY report.

### Publish checkpoint 1 (orchestrator)

- [ ] pa-lint via gate, `compile_canvas`, fresh-sync marker greps
  (`BattleRhythm` present in server `App.pa.yaml`/`Find.pa.yaml`), SARIF diff vs baseline 14
  (P10), commit `feat(timeline): owner-coded blocks on Find + RoomsTimeline`, human saves in
  Studio (P7). Record rungs earned with timestamps (P8).

---

## Phase B — Battle Rhythm model (T4–T6)

### Task 4: Expansion formulas + `AllBookings` union — **PROBE TASK**

**Lane:** novel. **Risk: high** (type unification of reshaped SharePoint rows with fabricated
records; reviewer runs). Implemented and compiled ALONE before T5+ dispatch. **Files:** Modify
`App.pa.yaml` (`Formulas:` + `OnStart`).

- [ ] **Step 1: BR helper UDFs** (place after `fnIsPast`; anchor:
  `fnIsPast(d:DateTime):Boolean = d < Now();`):

```
/* Battle Rhythm (BR-*) helpers. Masters: RecurrenceType BR-Weekly|BR-Fortnightly|BR-Monthly,
   IsException=false. Exceptions: RecurrenceType "BR-Exception", IsException=true, OccIndex=k.
   k is cadence periods since the master anchor (OccIndex 0 = the anchor occurrence). */
fnIsBRRow(rt:Text):Boolean = StartsWith(Coalesce(rt, ""), "BR-");
fnBROccStart(anchor:DateTime, cadence:Text, k:Number):DateTime =
    Switch(cadence,
        "BR-Weekly",      DateAdd(anchor, 7 * k, TimeUnit.Days),
        "BR-Fortnightly", DateAdd(anchor, 14 * k, TimeUnit.Days),
        DateAdd(anchor, k, TimeUnit.Months));
fnBROccIndex(anchor:DateTime, cadence:Text, d:DateTime):Number =
    Switch(cadence,
        "BR-Weekly",      RoundDown(DateDiff(anchor, d, TimeUnit.Days) / 7, 0),
        "BR-Fortnightly", RoundDown(DateDiff(anchor, d, TimeUnit.Days) / 14, 0),
        DateDiff(anchor, d, TimeUnit.Months));
```

- [ ] **Step 2: `BRVirtual` named formula** (after the `BookingsWindow` block; anchor:
  `BookingsWindow = Filter(`):

```
/* Virtual BR occurrences over the bookings window. One in-memory record per non-deviated
   occurrence of each Active master; a (SeriesID, OccIndex) match against an exception row in
   colBookings suppresses that occurrence (the exception row itself renders, or not, on its own
   Status). Negative ID marks virtual rows un-Patchable; consumers detect them via IsVirtual. */
BRVirtual = Ungroup(
    ForAll(colBRMasters As m,
        With(
            {
                _dur: DateDiff(m.StartDateTime, m.EndDateTime, TimeUnit.Minutes),
                _maxK: Max(0, fnBROccIndex(m.StartDateTime, m.RecurrenceType, BookingsWindowEnd)),
                _exc: Filter(colBookings, SeriesID = m.SeriesID, IsException)
            },
            {
                occs: ForAll(
                    Filter(Sequence(_maxK + 1, 0) As _k,
                        fnBROccStart(m.StartDateTime, m.RecurrenceType, _k.Value) >= BookingsWindowStart,
                        IsBlank(LookUp(_exc, OccIndex = _k.Value))
                    ) As _kk,
                    With({_s: fnBROccStart(m.StartDateTime, m.RecurrenceType, _kk.Value)},
                        {
                            ID: -(m.ID * 10000 + _kk.Value),
                            Title: m.Title,
                            RoomID: {Id: m.RoomID.Id, Value: m.RoomID.Value},
                            BookedBy: m.BookedBy,
                            BookedByEmail: Coalesce(m.BookedByEmail, ""),
                            IsPrivate: false,
                            StartDateTime: _s,
                            EndDateTime: DateAdd(_s, _dur, TimeUnit.Minutes),
                            Status: "Active",
                            SeriesID: m.SeriesID,
                            RecurrenceType: m.RecurrenceType,
                            OccIndex: _kk.Value,
                            IsException: false,
                            IsVirtual: true
                        }
                    )
                )
            }
        )
    ),
    "occs"
);
```

- [ ] **Step 3: `AllBookings` union** (immediately after `BRVirtual`):

```
/* THE read surface for timelines and conflict checks: real rows (masters excluded — only their
   expansion renders/blocks) reshaped to the plain schema, unioned with BRVirtual. MyBookings
   deliberately stays on colBookings (with a master exclusion, see MyBookings). */
AllBookings = Ungroup(
    Table(
        {r: ForAll(
                Filter(colBookings, !(fnIsBRRow(RecurrenceType) && !IsException)) As b,
                {
                    ID: b.ID,
                    Title: b.Title,
                    RoomID: {Id: b.RoomID.Id, Value: b.RoomID.Value},
                    BookedBy: b.BookedBy,
                    BookedByEmail: Coalesce(b.BookedByEmail, ""),
                    IsPrivate: b.isPrivate,
                    StartDateTime: b.StartDateTime,
                    EndDateTime: b.EndDateTime,
                    Status: b.Status,
                    SeriesID: Coalesce(b.SeriesID, ""),
                    RecurrenceType: Coalesce(b.RecurrenceType, ""),
                    OccIndex: Coalesce(b.OccIndex, 0),
                    IsException: Coalesce(b.IsException, false),
                    IsVirtual: false
                }
            )},
        {r: BRVirtual}
    ),
    "r"
);
```

- [ ] **Step 4: Master exclusion in `MyBookings`** (anchor: `MyBookings = Sort(` — add one
  predicate to its Filter): `!(fnIsBRRow(RecurrenceType) && !IsException)`.
- [ ] **Step 5: `colBRMasters` pull in `OnStart`** — add a third argument inside the existing
  `Concurrent(` (anchor: `ClearCollect(colBookings, BookingsWindow)`):

```
ClearCollect(colBRMasters,
    Filter(Book_Bookings, StartsWith(RecurrenceType, "BR-"), IsException = false, Status = "Active"))
```

- [ ] **Step 6:** lint + schema-validate clean. READY report.
- [ ] **Step 7 (orchestrator): PROBE COMPILE — this task alone.** The compiler's verdict on the
  `Ungroup`/`Table` union (record-type unification, `BookedBy` person-record copy, delegation
  warnings on the `colBRMasters` pull) is recorded and becomes a hard constraint in T5–T10
  specs. If unification fails, fallback (decided now, not re-litigated): drop `BookedBy` from
  the plain schema and carry `BookedByName: b.BookedBy.DisplayName` instead — T5 then adapts the
  two `BookedBy.DisplayName` consumer sites it touches. Commit
  `feat(br): expansion formulas + AllBookings union (probe)`.

### Task 5: Switch read surfaces + conflict checks to `AllBookings`

**Lane:** pattern (mechanical swaps, but wide blast radius). **Risk: high** (conflict-check
correctness; reviewer runs). **Files:** Modify `App.pa.yaml`, `Find.pa.yaml`,
`RoomsTimeline.pa.yaml`, `Rooms.pa.yaml`, `Home.pa.yaml`, `Components/cpt_Modal_.pa.yaml`.

- [ ] **Step 1: App.Formulas consumers** — in `TodayBookings`, `FindBookings` (inner Filter),
  and `WeekBookings`, replace the `colBookings` source with `AllBookings`. (`FindBookings`'
  own reshape then re-projects; keep its added `RecurrenceType` field from T1. Its `IsPrivate`
  read changes from `b.isPrivate` to `b.IsPrivate` — the plain schema renamed it; worker
  verifies every downstream `.isPrivate` consumer it touches compiles against the new casing.)
- [ ] **Step 2: RoomsTimeline `colRoomBookings` build** — the source Filter over bookings for
  the selected room/day switches `colBookings` → `AllBookings` (anchor: the build handler from
  T3 Step 1; the `booking.isPrivate` reads become `booking.IsPrivate`).
- [ ] **Step 3: Conflict-check sites** — every `colOverlappingBookings` materialization.
  Enumerate by `grep -n "colOverlappingBookings" *.pa.yaml Components/*.pa.yaml`; expected
  sites: `cpt_Modal_.pa.yaml` (wizard room/time change + Confirm re-read) and the four screens'
  confirm handlers (`Find`, `Rooms`, `RoomsTimeline`, `Home`). Snapshot-based sites
  (`colBookings` source) switch to `AllBookings`. The Confirm-time **server re-read** sites
  (`Book_Bookings` source, BUG-1 comment) must ALSO union fresh BR state — replace the re-read
  source with:

```
Ungroup(Table({r: <existing Book_Bookings overlap Filter, reshaped as in AllBookings Step 3>},
              {r: Filter(BRVirtual, RoomID.Id = <site's room id>,
                         fnOverlaps(StartDateTime, EndDateTime, <site's start>, <site's end>))}), "r")
```

  (Exact splice per site; worker copies each site's existing overlap predicate verbatim.
  `BRVirtual` is snapshot-fresh via the exception mirror — acceptable within the app's existing
  snapshot-freshness model.)
- [ ] **Step 4: myBookings screen `OnVisible`** (anchor: `ClearCollect(colBookings,
  BookingsWindow)`) — append a `colBRMasters` re-pull (same formula as T4 Step 5) so admin
  writes made elsewhere are visible.
- [ ] **Step 5:** lint + schema-validate clean; acceptance greps: `grep -c "AllBookings"` ≥ 8
  across files; `grep -n "colBookings" Find.pa.yaml` shows no remaining read of the old source
  in the swapped sites. READY report.

### Task 6: bookingDetail — virtual occurrences + deviation writes

**Lane:** novel. **Risk: high** (write paths; reviewer runs). **Files:** Modify
`bookingDetail.pa.yaml`, `Components/cpt_BookingDetailModal.pa.yaml` if the same actions render
there (worker greps `gblSelectedBooking` consumers and mirrors changes at both sites).

- [ ] **Step 1: Detection.** `gblSelectedBooking` may now hold a virtual row (`ID < 0` /
  `IsVirtual = true`). Gate every existing `Patch`/`Remove` action on `!gblSelectedBooking.IsVirtual`
  (virtual rows are un-Patchable by design).
- [ ] **Step 2: "Edit this occurrence" (deviate)** — visible when
  `gblSelectedBooking.IsVirtual && (IsAdmin || Lower(gblSelectedBooking.BookedByEmail) = Lower(User().Email))`.
  Reuses the screen's existing edit affordances for new times; on confirm:

```
Patch(Book_Bookings, Defaults(Book_Bookings),
    {
        Title: gblSelectedBooking.Title,
        RoomID: {Id: gblSelectedBooking.RoomID.Id, Value: gblSelectedBooking.RoomID.Value},
        StartDateTime: <new start>, EndDateTime: <new end>,
        BookedByEmail: gblSelectedBooking.BookedByEmail,
        Status: "Active", SeriesID: gblSelectedBooking.SeriesID,
        RecurrenceType: "BR-Exception", OccIndex: gblSelectedBooking.OccIndex,
        IsException: true, isPrivate: false
    });
/* MIRROR CONVENTION: the exception row must be in colBookings for BRVirtual suppression */
Collect(colBookings, LookUp(Book_Bookings, SeriesID = gblSelectedBooking.SeriesID
    && IsException && OccIndex = gblSelectedBooking.OccIndex));
```

  (`RoomID` patch shape: worker copies the exact lookup-patch idiom from the existing wizard
  Patch in `Rooms.pa.yaml` — anchor `SeriesID: If(IsBlank(varNewSeriesID)` — and matches it.
  The new-times conflict pre-check runs against `AllBookings` before the Patch.)
- [ ] **Step 3: "Cancel this occurrence"** — same Patch with the *existing* selected times and
  `Status: "Cancelled"`, same mirror. Confirm affordance copies the existing cancel-confirm
  pattern on this screen.
- [ ] **Step 4: Series actions (admin only, `IsAdmin`)** — *End series*:
  `Patch(Book_Bookings, LookUp(Book_Bookings, ID = <master id>), {Status: "Cancelled"})`, then
  cancel future Active exceptions of that `SeriesID`
  (`UpdateIf(Book_Bookings, SeriesID = <sid> && IsException && Status = "Active" &&
  StartDateTime > Now(), {Status: "Cancelled"})`), then re-pull `colBRMasters` and
  `colBookings` (MIRROR-FALLBACK re-pull is acceptable here — multi-row write).
  Master id from a virtual row: `RoundDown(-gblSelectedBooking.ID / 10000, 0)`.
- [ ] **Step 5:** lint + schema-validate clean; acceptance grep
  `grep -c "BR-Exception" bookingDetail.pa.yaml` ≥ 2. READY report.

---

## Phase C — Admin screen (T7–T10)

### Task 7: `IsAdmin` + Admin screen shell + nav link

**Lane:** novel (new screen + component edit). **Files:** Modify `App.pa.yaml`,
`Components/Shell_Header.pa.yaml`; Create `Admin.pa.yaml`.

- [ ] **Step 1: Admin formulas** (App.Formulas, beside `AppVersionInfo`):

```
/* Admins are formula-declared by request — swap for a SharePoint list when needed.
   UI-level gating only: SharePoint list permissions are unchanged (see spec §3). */
AdminEmails = ["harry@harry-burton.ai"];
IsAdmin = Lower(User().Email) in AdminEmails;
```

- [ ] **Step 2: `Admin.pa.yaml` shell** — clone the myBookings chrome skeleton exactly
  (`mb2ConShell` → `adConShell_ad` etc.): Shell_Header instance, body container, page container,
  breadcrumb (`Home / Admin`), page header HtmlViewer
  (`CarbonText(CarbonHtmlType.Heading04, "Admin")`), stat-line HtmlViewer, and a tab row of
  three Classic/Buttons using the `ContentSwitcherItem` UDF (`All bookings` / `Battle Rhythm` /
  `Rooms`), driving `UpdateContext({adTab: "..."})` (default `"All"`; Y1 block scalars).
  `Screen.OnVisible`:

```
If(!IsAdmin, Navigate(Home));
Refresh(Book_Bookings);
ClearCollect(colBookings, BookingsWindow);
ClearCollect(colBRMasters,
    Filter(Book_Bookings, StartsWith(RecurrenceType, "BR-"), IsException = false, Status = "Active"))
```

- [ ] **Step 3: Nav link** — in `Shell_Header.pa.yaml`, clone the `con_NavLink_Find` container
  structure as `con_NavLink_Admin` (button `OnSelect: =Set(gblUI_Nav_currentTab, Self.Text);
  Navigate(Admin)`, `Text: ="Admin"`, indicator rect keyed on `gblUI_Nav_currentTab`), with
  `Visible: =IsAdmin` on the container.
- [ ] **Step 4:** lint + schema-validate clean. READY report.
- [ ] **Step 5 (orchestrator): component watch-item** — first push touching
  `Components/Shell_Header.pa.yaml`: verify in the co-attached Studio session that component
  custom properties still evaluate before dispatching further Admin tasks.

### Task 8: Admin tab 1 — All bookings table

**Lane:** pattern (myBookings table idiom). **Files:** Modify `Admin.pa.yaml`, `App.pa.yaml`
(one constant).

- [ ] **Step 1: Column record** (App.Formulas, beside `MB2TableCols` — same single-source-of-
  truth pattern):

```
AdminTableCols = { Room: 170, Date: 100, Time: 110, Owner: 180, Status: 100, Action: 110 };
```

- [ ] **Step 2: Filters row** — TextInput `adInpSearch_ad` (search title/owner), two
  DatePickers `adDteFrom_ad`/`adDteTo_ad` (defaults: today − 7d / today + 30d). All in-memory
  over the window snapshot; no delegation concerns.
- [ ] **Step 3: Table** — header HtmlViewer with `CarbonHtmlType.TableHead` flex spans sized by
  `AdminTableCols` (copy the `htxMb2TableHead` idiom), gallery `adGalBookings_ad` with:

```
Items: =SortByColumns(
    Filter(AllBookings,
        Status = "Active" || Status = "Clash",
        EndDateTime >= adDteFrom_ad.SelectedDate,
        StartDateTime <= DateAdd(adDteTo_ad.SelectedDate, 1, TimeUnit.Days),
        IsBlank(Trim(adInpSearch_ad.Text))
            || Lower(Trim(adInpSearch_ad.Text)) in Lower(Title)
            || Lower(Trim(adInpSearch_ad.Text)) in Lower(BookedByEmail)),
    "StartDateTime", SortOrder.Ascending)
```

  Row labels per `AdminTableCols` (native labels inside gallery templates — policy rule 2);
  Owner column shows `BookedByEmail`; BR rows show `RecurrenceType` in the Status cell when
  `fnIsBRRow(RecurrenceType)`. Row actions: *View* → `Set(gblSelectedBooking, ThisItem);
  Navigate(bookingDetail, ScreenTransition.Fade)`; *Cancel* (real rows only,
  `Visible: =!ThisItem.IsVirtual`) → copy the myBookings cancel Patch + mirror idiom (anchor in
  `myBookings.pa.yaml`: the cancel handler with the `MIRROR` comment).
- [ ] **Step 4: Stat line** — `CarbonTextSecondary(CarbonHtmlType.BodyCompact01,
  CountRows(adGalBookings_ad.AllItems) & " bookings · " & CountRows(colBRMasters) & " Battle Rhythm series")`.
- [ ] **Step 5:** lint + schema-validate clean; acceptance grep `grep -c "adGalBookings_ad"` ≥ 2.
  READY report.

### Task 9: Admin tab 2 — Battle Rhythm management

**Lane:** novel. **Risk: high** (master create writes; reviewer runs). **Files:** Modify
`Admin.pa.yaml`.

- [ ] **Step 1: Masters table** — gallery `adGalBRMasters_ad`, `Items: =SortByColumns(colBRMasters,
  "Title", SortOrder.Ascending)`, columns: Title, Room (`RoomID.Value`), cadence
  (strip prefix: `Mid(RecurrenceType, 4)`), time (`Text(StartDateTime, "HH:mm") & "–" &
  Text(EndDateTime, "HH:mm")`), next occurrence:

```
With({_k: Max(0, fnBROccIndex(ThisItem.StartDateTime, ThisItem.RecurrenceType, Now()) + 1)},
    Text(fnBROccStart(ThisItem.StartDateTime, ThisItem.RecurrenceType, _k), "ddd d mmm"))
```

  Row actions: *Occurrences* (expand: `UpdateContext({adBRSel: ThisItem.ID})` — Y1), *End
  series* (confirm two-step like the myBookings series-cancel idiom, then the T6 Step 4 write +
  re-pulls).
- [ ] **Step 2: Create form** (toggled by `adBRShowCreate`): TextInput title, Dropdown room
  (`Items: =colRooms`, show `Title`), Dropdown cadence
  (`Items: =["Weekly","Fortnightly","Monthly"]`), DatePicker first date, hour/minute dropdowns
  copying the wizard's time-select idiom. On *Create*:

```
With({_s: <composed first-occurrence start>, _e: <composed end>,
      _room: adDrpRoom_ad.Selected},
    If(!IsEmpty(Filter(AllBookings, RoomID.Id = _room.ID, Status = "Active",
            fnOverlaps(StartDateTime, EndDateTime, _s, _e))),
        Notify("First occurrence clashes with an existing booking.", NotificationType.Error),
        Patch(Book_Bookings, Defaults(Book_Bookings),
            {
                Title: adInpBRTitle_ad.Text,
                RoomID: {Id: _room.ID, Value: _room.Title},
                StartDateTime: _s, EndDateTime: _e,
                BookedByEmail: Lower(User().Email),
                Status: "Active", SeriesID: GUID(),
                RecurrenceType: "BR-" & adDrpBRCadence_ad.Selected.Value,
                OccIndex: 0, IsException: false, isPrivate: false
            });
        /* master changed → refresh the expansion inputs */
        ClearCollect(colBRMasters, Filter(Book_Bookings,
            StartsWith(RecurrenceType, "BR-"), IsException = false, Status = "Active"));
        UpdateContext({adBRShowCreate: false});
        Notify("Battle Rhythm created.", NotificationType.Success)
    )
)
```

  (Same `GUID()`-as-text handling as the existing wizard site if the compiler objects to
  direct `GUID()` into a text column — copy the `Text(varNewSeriesID)` idiom from
  `Rooms.pa.yaml`. Only the first occurrence is conflict-checked at create; later clashes
  surface on the timelines — spec-accepted.)
- [ ] **Step 3: Occurrence sub-list** (visible when `adBRSel` set) — HtmlViewer-headed gallery
  over the next 8 occurrences:

```
Items: =With({_m: LookUp(colBRMasters, ID = adBRSel)},
    With({_k0: Max(0, fnBROccIndex(_m.StartDateTime, _m.RecurrenceType, Now()) + 1)},
        ForAll(Sequence(8, _k0) As _k,
            With({_s: fnBROccStart(_m.StartDateTime, _m.RecurrenceType, _k.Value)},
                {K: _k.Value, OccStart: _s,
                 OccEnd: DateAdd(_s, DateDiff(_m.StartDateTime, _m.EndDateTime, TimeUnit.Minutes), TimeUnit.Minutes),
                 Exc: LookUp(colBookings, SeriesID = _m.SeriesID && IsException && OccIndex = _k.Value)}))))
```

  Each row shows date/time, a `Deviated` / `Cancelled` chip when `!IsBlank(Exc)` (from
  `Exc.Status`), and *Deviate* / *Cancel* actions for non-excepted rows — both write the T6
  Step 2/3 exception Patch (repeat the code; source fields from `_m` + row `K`). *Deviate*
  routes through `Set(gblSelectedBooking, <virtual-shaped record from this row>);
  Navigate(bookingDetail, ScreenTransition.Fade)` so the edit UI is not duplicated.
- [ ] **Step 4:** lint + schema-validate clean; acceptance greps: `grep -c "colBRMasters"
  Admin.pa.yaml` ≥ 4, `grep -c "BR-Exception" Admin.pa.yaml` ≥ 1. READY report.

### Task 10: Admin tab 3 — Rooms management

**Lane:** pattern (simple CRUD, no delete). **Files:** Modify `Admin.pa.yaml`.

- [ ] **Step 1: Rooms table** — gallery `adGalRooms_ad`, `Items: =SortByColumns(colRooms,
  "Title", SortOrder.Ascending)`, columns Title / Capacity / Equipment / description, row
  action *Edit* → `UpdateContext({adRoomSel: ThisItem.ID, adRoomShowForm: true})` (Y1).
- [ ] **Step 2: Add/Edit form** (toggled by `adRoomShowForm`; `adRoomSel = 0` means add):
  TextInputs title/equipment/description, capacity TextInput with `Format: =TextFormat.Number`.
  Defaults from `LookUp(colRooms, ID = adRoomSel)` when editing. On *Save*:

```
If(IsBlank(Trim(adInpRoomTitle_ad.Text)) || Value(adInpRoomCap_ad.Text) <= 0,
    Notify("Room name and a positive capacity are required.", NotificationType.Error),
    If(adRoomSel = 0,
        Patch(Book_Rooms, Defaults(Book_Rooms),
            {Title: Trim(adInpRoomTitle_ad.Text),
             Capacity: Value(adInpRoomCap_ad.Text),
             Equipment: Trim(adInpRoomEquip_ad.Text),
             description: Trim(adInpRoomDesc_ad.Text),
             RoomID: Max(colRooms, RoomID) + 1}),
        Patch(Book_Rooms, LookUp(Book_Rooms, ID = adRoomSel),
            {Title: Trim(adInpRoomTitle_ad.Text),
             Capacity: Value(adInpRoomCap_ad.Text),
             Equipment: Trim(adInpRoomEquip_ad.Text),
             description: Trim(adInpRoomDesc_ad.Text)})
    );
    ClearCollect(colRooms, Book_Rooms);
    UpdateContext({adRoomShowForm: false});
    Notify("Room saved.", NotificationType.Success)
)
```

- [ ] **Step 3:** lint + schema-validate clean; acceptance grep
  `grep -c "adGalRooms_ad" Admin.pa.yaml` ≥ 2. READY report.

### Publish checkpoint 2 (orchestrator)

- [ ] Full gate: pa-lint, `compile_canvas`, fresh-sync marker greps (`BRVirtual` and
  `AllBookings` in server `App.pa.yaml`; `Admin.pa.yaml` present — 13 files), SARIF diff vs
  baseline 14 (P10 — new screen may add checker rows; triage before accepting any increase),
  commit `feat(br+admin): Battle Rhythm model, AllBookings surface, Admin screen`, human saves
  in Studio (P7), record rungs (P8).

---

## Task 11: Human acceptance pass (rung 5–6, from the spec's Testing section)

**Lane:** orchestrator-only + human. No dispatch.

- [ ] Colors: mixed own/others'/past day on Find, both themes; RoomsTimeline matches; legends
  present.
- [ ] BR: create weekly master → purple occurrences on the right weekdays on Find +
  RoomsTimeline; booking over one is blocked; deviate one occurrence (only that date moves);
  cancel one (only that date frees); end series (future occurrences vanish; past exception
  rows remain).
- [ ] Admin: non-admin account sees no nav link and is bounced by `OnVisible`; room add/edit
  visible on Rooms/Find after save.
- [ ] `guard.sh verified "rung 5 <what was checked>"` per item confirmed; close-of-session
  reconcile commit (P5).

---

## Self-review notes (authoring time)

- Spec coverage: §1 → T1–T3; §2 data model/expansion → T4, consumers → T5, interaction → T6;
  §3 → T7–T10; spec Testing → publish checkpoints + T11. MyBookings master-exclusion → T4
  Step 4. Mirror-convention extension → T6/T9 write sites.
- Naming consistency: `fnIsBRRow` / `fnBROccStart` / `fnBROccIndex` / `BRVirtual` /
  `AllBookings` / `colBRMasters` / `Timeline_PastOpacityCss` / `AdminTableCols` used
  identically across tasks; new controls suffixed `_ad`, fields `IsBR` / `IsVirtual`.
- Known open risk: T4 union type-unification (fallback decided in T4 Step 7); `Sequence` size
  is bounded (`_maxK` ≤ ~108 weekly over the 24-month window).
