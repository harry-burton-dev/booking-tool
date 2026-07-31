# Extended code review — booking-tool (fresh sync 2026-07-31)

- **Source reviewed:** `.scratch/overnight-20260731/sync` (fresh `sync_canvas` output; 8,506 lines across App, 6 screens, 2 components)
- **Rulebook:** `docs/RULES.md`; revert contract: `docs/REVERT-CONTRACT.md`; lint config: `palint.config.json`
- **Scope:** Power Fx correctness, delegation, error handling, naming, dead code, duplication, performance, RULES compliance (D1–D5, PROD-REVERT, RESET-SITE)
- **Method:** full read of every `.pa.yaml` plus cross-checks against the revert contract and the pa-lint check implementations (`tools/pa-lint/checks/l6-reset-sites.js`, `ds1-raw-values.js`). Static review only — nothing verified in Studio or the player (rung 0).

## Findings summary

| ID | Sev | Tag | File / site | One-line summary |
|----|-----|-----|-------------|------------------|
| C-1 | CRITICAL | RISKY | cpt_Modal_ `btnConfirm.OnSelect`; all 3 `OnSubmit` hosts | Conflict check runs against stale client cache — concurrent users can double-book |
| H-1 | HIGH | RISKY | App `OnStart` + every `ClearCollect(colBookings, …)` | Whole app reads a row-limit-capped snapshot of Book_Bookings; silent truncation as data grows |
| H-2 | HIGH | SAFE | Home.pa.yaml ~1043 (`cpt_Modal__book.OnSubmit`) | Home create site's `Refresh(Book_Bookings)` has no PROD-REVERT marker or contract entry (D5) |
| H-3 | HIGH | SAFE | whole app + `palint.config.json` | Zero `// RESET-SITE[…]` markers and `statefulVars: []` — D4/L6 is completely unenforced |
| H-4 | HIGH | RISKY | myBookings `btnConfirmCancelSeries.OnSelect` | Series-cancel error path leaves partial server writes invisible (no refresh in the IfError fallback) |
| M-1 | MEDIUM | RISKY | Home/Find/Rooms `cpt_Modal__book*.OnSubmit` | ~120-line create handler duplicated 3×; drift already real (H-2, wrong comment) |
| M-2 | MEDIUM | RISKY | cpt_Modal_ (btn_tile, drpStartTime, drpEndTime, btnConfirm) | Conflict-recheck block duplicated 4× inside the component |
| M-3 | MEDIUM | SAFE | cpt_Modal_ `drpStartTime.Items` / `drpEndTime.Items` | Slot values hardcode `8` where the display half uses `DayStartHour` |
| M-4 | MEDIUM | SAFE | App Formulas `IsSandbox`; Profile `valAboutEnvironment` | `IsSandbox = false` ("Production") while mock people/settings are live; sentinel unmarked |
| M-5 | MEDIUM | RISKY | cpt_Modal_ `tglPrivate` / `tglBookOnBehalf`; Profile toggles | Disabled toggles make "Show as busy", book-on-behalf and the mock people picker unreachable |
| M-6 | MEDIUM | SAFE | Rooms `btn_LoadTimeline.OnSelect` (IsMine) | Case-sensitive `BookedBy.Email = User().Email` — false-negative "mine" styling |
| M-7 | MEDIUM | RISKY | App named formulas (WeekBookings, FindBookings, FindRooms) | `fnOverlaps` / `in` predicates are non-delegable; "delegable after revert" comments are wrong as written |
| M-8 | MEDIUM | RISKY | app-wide | Four global prefixes (`gbl`, `gbl_`, `glb`, `var`); `var*` globals sit outside the lint's `globalPrefixes` |
| M-9 | MEDIUM | SAFE | app-wide + `palint.config.json` | DS1 disabled; raw hex/RGBA everywhere with zero `DS-EXEMPT` — enabling the kit later blocks publish wholesale |
| M-10 | MEDIUM | SAFE | Home tiles, `btnNextViewAll`, myBookings `btnEmptyBook` | Header tab highlight not updated on several navigations |
| M-11 | MEDIUM | RISKY | myBookings vs bookingDetail series-cancel | Same operation, two divergent error-handling shapes |
| M-12 | MEDIUM | SAFE | App, Find, bookingDetail (~7 sites) | `DateValue(Text(x,"yyyy-mm-dd"))` parse pattern vs Y5 "construct numerically" |
| L-1 | LOW | SAFE | App, Shell_Header, Rooms, Profile | Dead code inventory: dark theme, side-nav icon strings, Timeline_SlotCount/SlotMinutes, varShowDatePicker, hidden header buttons, placeholder button |
| L-2 | LOW | SAFE | Rooms `btnRoomsBook` | `Filter(colRooms, ID <> ID)` empty-table idiom (elsewhere `true = false`) |
| L-3 | LOW | SAFE | Find `cpt_Modal__book_find.OnSubmit` | Copy-paste comment says "Stay on Rooms" on the Find screen |
| L-4 | LOW | SAFE | Home galRoomChips, App varFindWindowEnd, prefill blocks | Magic numbers: `210.66666666666663`, `7*24*60-360`, `540`, `Sequence(41)` |
| L-5 | LOW | SAFE | Find `imgDateBack_1` / `imgDateForward_1` | AccessibleLabel "Previous/Next day" wrong in Week mode (moves ±7 days) |
| L-6 | LOW | RISKY | Shell_Header, cpt_Modal_ | Misleading control names (NavLink_Discover→Rooms, NavLink_Create→Bookings, conStartTimeField_1→Repeats) |
| L-7 | LOW | SAFE | myBookings gallery badges | "Past" and "Clash" badges overlap for a past clash row |
| L-8 | LOW | SAFE | App `TileProperties` / `ButtonProperties` | Interpolated text not XML-escaped — `&` in a room description breaks the tile SVG |
| L-9 | LOW | RISKY | cpt_Modal_ `btnSelectAltRoom.OnSelect` | Alt-room switch doesn't refresh varConflictingBooking / varAlternativeRooms |
| L-10 | LOW | SAFE | cpt_Modal_ `varSubmitting` / conProgressBar | Progress UI can never render (set true→false in one synchronous handler) |
| L-11 | LOW | SAFE | cpt_Modal_ time dropdowns; free-slot prefill | 18:00 selectable as a start with no valid end; prefill can fall back to a past slot start |
| L-12 | LOW | SAFE | Rooms `btnRoomsBook` vs Home tile | Wizard opened with blank date → empty time dropdowns (Home prefills Today) |
| L-13 | LOW | SAFE | Home→Find handoff `gblFindFocusRoomID` | Focus room never cleared on leaving Find; stale header highlight next visit |
| L-14 | LOW | SAFE | Shell_Header `rct_Header_Spacer`; Rooms OnVisible | Empty `Width: =` formula; `\|+` scalar keeps trailing newlines; trailing-space scalar in conStep2.Height |
| L-15 | LOW | RISKY | Find `btnLoadFindBookings` free-row builder | Overlapping Active bookings would generate "free" rows on top of booked time |
| L-16 | LOW | SAFE | Home `lblNextCountdown` | Uses `Now()` while the rest of the Home surface keys off `varNowTick` |

**Counts: 1 CRITICAL · 4 HIGH · 12 MEDIUM · 16 LOW (33 findings)**

---

## CRITICAL

### C-1 — Conflict detection reads a stale client cache; concurrent users can double-book
**Tag:** RISKY · **Files:** `Components/cpt_Modal_.pa.yaml` (`btnConfirm.OnSelect`, ~line 1737), `Home.pa.yaml` / `Find.pa.yaml` / `Rooms.pa.yaml` (`cpt_Modal__book*.OnSubmit`, `_hasClash`)

Every conflict check in the create path filters **`colBookings`**, the collection snapshotted in `App.OnStart` and only re-collected *after this user's own writes*:

```
ClearCollect(
    colOverlappingBookings,
    Filter(
        colBookings,
        Status = "Active",
        fnOverlaps(StartDateTime, EndDateTime, varStartTime, varEndTime),
        ID <> gblEditingBookingID
    )
);
Set(varConflict, !IsEmpty(Filter(colOverlappingBookings, RoomID.Id = varSelectedRoom.ID)));
```

and in the host `OnSubmit`:

```
_hasClash: !IsBlank(
    LookUp(
        Filter(colBookings, Status = "Active", fnOverlaps(...)),
        RoomID.Id = _occ.RoomIdNumber
    )
)
```

There is **no `Refresh(Book_Bookings)` / re-collect between the last check and the `Patch`**. Book_Bookings is a live shared SharePoint list (MS3): any booking made by another user (or another session) after this app's start is invisible to the check, so two users can both pass validation and both write "Active" rows for the same room/slot. The series path partially mitigates by writing `Status: "Clash"` when `_hasClash` — but `_hasClash` is computed from the same stale cache, so a true concurrent clash is written as `Active` anyway. This is the core invariant of a booking tool.

**Fix (concrete):** at the top of each host `OnSubmit`/`OnSubmitEdit` (before the `ForAll`), re-sync the window being written: `Refresh(Book_Bookings); ClearCollect(colBookings, Book_Bookings);` then run the `_hasClash`/conflict logic. Longer term (with H-1), replace the full-table re-collect with a date-bounded server query around the occurrence window. Note the edit paths in `bookingDetail.pa.yaml` (`btnScopeJust`/`btnScopeSeries`/standalone edit) have the same stale-cache check before their `Patch` calls.

---

## HIGH

### H-1 — `colBookings` is a row-limit-capped snapshot; every feature reads it
**Tag:** RISKY · **File:** `App.pa.yaml` `OnStart` (~line 611) plus every `Refresh(Book_Bookings); ClearCollect(colBookings, Book_Bookings)` site (Home 1043–1044, Find 764–765, Rooms 1326–1327, myBookings 722–723, bookingDetail ×4)

```
ClearCollect(colRooms, Book_Rooms);
ClearCollect(colBookings, Book_Bookings);
```

`ClearCollect` from a SharePoint source retrieves at most the data-row limit (default 500, max 2000). Today the list has 18 rows, so everything works; at ~500+ rows (a few months of real usage, since cancelled rows are soft-deleted and never purged) the snapshot silently truncates and **availability timelines, occupancy, MyBookings and every conflict check go quietly wrong** — the worst failure mode being C-1 compounding (missing rows = no conflict found). The `If(CountRows(FindBookings) >= 500, Notify(...))` warning in `Find.btnLoadFindBookings` shows the risk is known but only surfaces on one screen.

**Fix:** bound the snapshot by date at collect time (e.g. `ClearCollect(colBookings, Filter(Book_Bookings, EndDateTime >= DateAdd(Today(), -90, TimeUnit.Days)))` — `>=` on a DateTime column is delegable), and document the retention assumption; or move the read paths to date-bounded named formulas against Book_Bookings directly (see M-7 first). Add an explicit tripwire (`If(CountRows(colBookings) >= 500, Trace/Notify)`) in OnStart until then.

### H-2 — Home create site is an unmarked dev/prod-differing site (D5 violation)
**Tag:** SAFE · **File:** `Home.pa.yaml`, `cpt_Modal__book.OnSubmit` (~line 1043)

Find and Rooms both mark their post-create refresh:

```
// PROD-REVERT[booking-create-find] SharePoint round-trip after series create
Refresh(Book_Bookings);
```

Home has the identical `Refresh(Book_Bookings); ClearCollect(colBookings, Book_Bookings);` with **no marker**, and `docs/REVERT-CONTRACT.md` has no `booking-create-home` entry. Per D5 every dev-only/differing site carries `// PROD-REVERT[id]` with a contract entry; `revert-check` cross-checks both directions, so this site is invisible to the gate. (Same handler *does* carry `// PROD-REVERT[booked-by-actor]` at line 998, so the omission is clearly drift, not policy.)

**Fix:** add `// PROD-REVERT[booking-create-home]` above the Home refresh and a matching contract entry (mirroring booking-create-find), or fold Home into a widened `booking-create-*` entry. Contract edit + one comment line; no behavior change.

### H-3 — D4 (RESET-SITE) is entirely unenforced: zero markers, empty lint registry
**Tag:** SAFE · **Files:** all screens; `palint.config.json`

`grep -rn "RESET-SITE" sync/` → **0 hits**, and `palint.config.json` has `"statefulVars": []`. `tools/pa-lint/checks/l6-reset-sites.js` only validates sites that already carry a marker against the configured var list — with both empty, L6 passes vacuously. Meanwhile the wizard reset block (the exact defect class D4 exists for — "reset omissions fixed in 3 separate commits") is hand-duplicated at **six+ sites**: Home `btn_TileBook.OnSelect` (152–166), Find `btnFreeSlot_v2.OnSelect` (505–517), Rooms `btnFreeSlot.OnSelect` (941–952) and `btnRoomsBook.OnSelect` (1216–1229), myBookings `btnEmptyBook.OnSelect` (469–484), bookingDetail `btnChangeTimeDetail.OnSelect` (312–320) and the fix-cycle advance (593–601). The copies already diverge: `btnChangeTimeDetail` intentionally skips date/time vars, but nothing distinguishes intent from omission.

**Fix:** register the wizard vars (`varSelectedRoom, varSelectedDate, varStartTime, varEndTime, varTitle, varConflict, varBookingError, varSubmitting, varTitleTouched, varConflictingBooking, varNextFreeSlot, gblEditingBookingID, gbl_UI_Book_CancelConfirm, gbl_Book_SubmitResult`) in `statefulVars` and drop `// RESET-SITE[<name>]` into each of the sites above. Marker comments + config only; lint then fails closed on the next forgotten var.

### H-4 — Series-cancel error path hides partial server writes
**Tag:** RISKY · **File:** `myBookings.pa.yaml`, `btnConfirmCancelSeries.OnSelect` (~712–726)

```
IfError(
    ForAll(
        Filter(colBookings, SeriesID = gbl_UI_CancelSeriesConfirmID, StartDateTime >= Now(), Status <> "Cancelled") As _m,
        Patch(Book_Bookings, LookUp(Book_Bookings, ID = _m.ID), {Status: "Cancelled"})
    ),
    Notify("Couldn't cancel this series. Please try again.", NotificationType.Error),
    Refresh(Book_Bookings); ...
)
```

If the Nth `Patch` fails, occurrences 1..N-1 are already cancelled on the server, but the fallback branch does **not** refresh `Book_Bookings`/`colBookings` and does not clear `gbl_UI_CancelSeriesConfirmID` — the UI keeps showing the whole series as active and the confirm row stays open. "Try again" then re-patches already-cancelled rows (harmless) but the user has no way to see actual state. Contrast bookingDetail's whole-series cancel (`btnScopeSeries`, 728–744), which wraps each `Patch` in its own `IfError` and refreshes unconditionally afterwards.

**Fix:** move `Refresh(Book_Bookings); ClearCollect(colBookings, Book_Bookings)` outside the `IfError` (run on both branches), and clear `gbl_UI_CancelSeriesConfirmID` on the error branch too — or adopt the per-row-IfError + unconditional-refresh shape from bookingDetail (see M-11).

---

## MEDIUM

### M-1 — The ~120-line create handler is pasted 3× across screen hosts
**Tag:** RISKY · **Files:** `Home.pa.yaml` 958–1076, `Find.pa.yaml` 678–800, `Rooms.pa.yaml` 1240–1362

The whole `OnSubmit` body (payload snapshot, weekend/clash classification, `IfError(Patch(...))` loop, refresh, notify triage) is identical except for (a) the component instance name, (b) the PROD-REVERT marker (missing on Home — H-2), and (c) the tail action (`Navigate(Home)` vs `Select(btnLoadFindBookings)` vs `Select(btn_LoadTimeline)`). Drift is not hypothetical — H-2 and L-3 are drift. Because component event properties can't easily share a body, the standard consolidation is to move the write loop *into* `cpt_Modal_` behind a hidden button (or App-level UDF once UDF actions are available) and leave hosts with only their tail action. That is a behavioral/architectural change; at minimum, treat the three copies as one site in every future edit (RULES O3: anchor by quoted code).

### M-2 — Conflict-recheck block duplicated 4× inside cpt_Modal_
**Tag:** RISKY · **File:** `Components/cpt_Modal_.pa.yaml` — `btn_tile.OnSelect` (293–331), `drpStartTime.OnChange` (586–633), `drpEndTime.OnChange` (712–758), `btnConfirm.OnSelect` (1738–1776)

The `colOverlappingBookings` / `varConflict` / `varConflictingBooking` / `varNextFreeSlot` / `varAlternativeRooms` recompute is copied four times inside one component. A hidden `btnRecheckConflict` with `Select()` from the four call sites would make C-1's fix a one-place change instead of four.

### M-3 — Time-slot values hardcode 8 o'clock; display half uses DayStartHour
**Tag:** SAFE · **File:** `Components/cpt_Modal_.pa.yaml`, `drpStartTime.Items` (571–581) and `drpEndTime.Items` (697–707)

```
display: Text(DateAdd(DateAdd(Date(1900,1,1), DayStartHour, TimeUnit.Hours), (Value - 1) * 15, ...), "HH:mm"),
value:   DateAdd(DateTime(Year(varSelectedDate), Month(varSelectedDate), Day(varSelectedDate), 8, 0, 0), (Value - 1) * 15, TimeUnit.Minutes)
```

If `DayStartHour` ever changes from 8, the labels shift but the actual booked times don't (and `Sequence(41)` also encodes 8→18 — see L-4). **Fix:** `DateAdd(DateTime(..., 0, 0, 0), DayStartHour * 60 + (Value - 1) * 15, TimeUnit.Minutes)` in both dropdowns, and derive the sequence length from `(DayEndHour - DayStartHour) * 60 / SlotMinutes + 1`.

### M-4 — Environment badge lies: `IsSandbox = false` while mocks are live
**Tag:** SAFE · **Files:** `App.pa.yaml` 120–121, `Profile.pa.yaml` 486

```
/* Sandbox sentinel - the production revert flips this to false (MOCK_DATA.md) */
IsSandbox = false;
```

Profile then renders "Production". But this build still runs `MockPeopleSeed` (people-picker-mock, deferred MS2) and `colUserSettings` (user-settings-writes, deferred MS1) — by the contract's own Phase-0 note the app is *not* in production form. The sentinel also carries no `// PROD-REVERT[id]` even though its comment says the revert flips it (a dev/prod-differing site by its own description). **Fix:** set `IsSandbox = true` (or reword the Profile string to "Phase 0 — partial mock data") and give the flag a marker + contract entry so `revert-check` owns it.

### M-5 — Disabled toggles make privacy, book-on-behalf, and the mock people picker unreachable
**Tag:** RISKY · **Files:** `Components/cpt_Modal_.pa.yaml` `tglPrivate` (1313–1319) and `tglBookOnBehalf` (1360–1367); `Profile.pa.yaml` all four settings toggles

`tglPrivate` and `tglBookOnBehalf` are `DisplayMode.Disabled` with no `Checked:` binding, so "Show as busy" can never be set (payload `IsPrivate: tglPrivate.Checked` is always false) and `drpBookFor` (`Visible: =tglBookOnBehalf.Checked`) can never appear — which means the D5-tracked `people-picker-mock` dev path is dead UI: `colPeople`/`MockPeopleSeed`/`varBookForEmail` are seeded and validated (`ValidPayload` line 53) but unreachable. All the privacy-masking logic in Find/Rooms timelines (`If(b.IsPrivate && ...)`) is likewise untestable from the UI. Profile's four notification toggles are also Disabled while `drpReminderMinutes` is not (it is only hidden behind the disabled toggle's `Checked`). If this is a deliberate Phase-0 descope it is documented nowhere (no marker, no contract note — contrast MS1/MS2 which are). **Fix:** either bind and enable the toggles (`Checked: =varIsPrivate` etc. per Y4), or mark the disablement with a contract/manual-step note so the descope is auditable.

### M-6 — `IsMine` compares emails case-sensitively
**Tag:** SAFE · **File:** `Rooms.pa.yaml`, `btn_LoadTimeline.OnSelect` line 1056

```
IsMine: booking.BookedBy.Email = User().Email
```

Every other identity comparison in the app normalizes: `BookedByEmail = Lower(User().Email)` (App MyBookings, Find, Rooms privacy masks). SharePoint person-field `Email` casing is not guaranteed to match AAD casing, so "my" bookings can render as other people's (green accent lost). **Fix:** `Lower(booking.BookedBy.Email) = Lower(User().Email)` — or reuse the already-normalized `booking.BookedByEmail = Lower(User().Email)`.

### M-7 — Delegation debt behind "delegable after revert" comments
**Tag:** RISKY · **File:** `App.pa.yaml` Formulas (WeekBookings 337–340, FindBookings 418–436, FindRooms 440–443, MyBookings 401–408)

Comments claim the named formulas become delegable once pointed at SharePoint ("Date bounds first (delegable against SharePoint after revert)"), but as written several predicates are **not** delegable against SharePoint: `fnOverlaps(...)` is a user-defined function (never delegated), `varFindEquipment in Equipment` (substring `in`) is not delegable, and the Rooms equipment filter uses `CountRows(Filter(...)) = 0` row-scope logic. Only the date-bound `>=`/`<` and text-equality halves would delegate; the rest silently truncates at the row limit. Today everything targets `colBookings` (client-side), so this is latent — but it invalidates the documented revert plan and interacts with H-1. **Fix:** when repointing, split each formula into a delegable server prefilter (date window + Status equality) collected first, with `fnOverlaps`/`in` applied client-side to the bounded set; update the comments to describe that shape.

### M-8 — Global-variable naming: four prefixes, and `var*` globals evade the lint's model
**Tag:** RISKY · **Files:** app-wide; `palint.config.json` (`"globalPrefixes": ["gbl", "glb"]`)

App-scope globals appear as `gbl*` (`gblUserInitials`, `gblRoomsSearch`), `gbl_*` (`gbl_UI_Book_Modal`, `gbl_PendingStart`), `glb*` (`glbIsDarkMode`, `glbSelectedDate`), and `var*` (`varNowTick`, `varStartTime`, `varMyBookingsFilter`, `varFindSelectedDate`, `varSelectedRoom` — all `Set()` globals, not context vars). The lint config declares only `gbl`/`glb` as global prefixes, so the entire `var*` family sits outside whatever prefix-based reasoning the toolkit applies (Y2 coverage). Collections are mostly `col*` but `varAlternativeRooms` (a `ClearCollect` target) breaks that too. A mass rename in a live canvas app is high-risk churn; the pragmatic move is to (a) add `var` to `globalPrefixes` so tooling sees reality, and (b) fix only `varAlternativeRooms` → `colAlternativeRooms` opportunistically when its call sites are next touched.

### M-9 — DS1 is off and the codebase is full of un-exempted raw colors
**Tag:** SAFE · **Files:** all screens; `palint.config.json` (`designSystem.enabled: false`)

`ds1-raw-values.js` forbids raw `RGBA(`/hex outside `App.pa.yaml` once enabled; the sync contains zero `DS-EXEMPT` markers and hundreds of raw values, including semantic ones that clearly belong in the token block: `ColorValue("#0043ce")` (Home 481, 877 — hover blue), `ColorValue("#b81922")` / `ColorValue("#921620")` (danger hover/pressed, myBookings 711/728, bookingDetail 456/475), `RGBA(13,83,217,1)` / `RGBA(11,69,182,1)` (primary hover/pressed, repeated ~10×), and the leftover Fluent-blue `RGBA(0, 120, 212, 1)` on every screen's `LoadingSpinnerColor` and Rooms `btn_LoadTimeline`. The recent DS1 spec work (`docs/spec` commit 0525af8) implies the kit is coming; enabling it against this tree will hard-block publish. **Fix:** tokenize the recurring semantic values (ButtonPrimaryHoverSolid, ButtonDangerHoverSolid, …) screen-by-screen *before* flipping `designSystem.enabled`, and reserve `DS-EXEMPT` for genuine one-offs (base64 SVG chevrons, scrim).

### M-10 — Header tab highlight goes stale on several navigations
**Tag:** SAFE · **Files:** `Home.pa.yaml` `btn_TileView.OnSelect` (295), `btn_TileMyBook.OnSelect` (381), `btnNextViewAll.OnSelect` (485); `myBookings.pa.yaml` `btnEmptyBook.OnSelect` (500)

Shell_Header underlines the tab where `gblUI_Nav_currentTab` matches the button text, and its own buttons set it — but these four navigations call `Navigate(...)` without updating the var (`OnSelect: =Navigate(Rooms, ScreenTransition.Fade)`), so e.g. opening Rooms from the Home tile leaves "Home" underlined. Other sites do it right (`btnRoomsViewAll`: `Set(gblUI_Nav_currentTab, "Find"); ...`). Note the header's own tab for myBookings is labeled "Bookings", so the correct values are `"Rooms"`, `"Bookings"`, `"Bookings"`, `"Home"` respectively. Mechanical `Set(...)` additions.

### M-11 — Two divergent error-handling shapes for the same series-cancel operation
**Tag:** RISKY · **Files:** `myBookings.pa.yaml` 712–726 vs `bookingDetail.pa.yaml` 728–744

myBookings wraps the whole `ForAll` in one `IfError` (single notify, refresh only on success — H-4); bookingDetail wraps each `Patch` (`IfError(Patch(...); true, Notify(...); false)` — one notify **per failed row**, potential notify spam on an outage) and refreshes unconditionally. Same user action, different partial-failure semantics depending on which screen you started from. **Fix:** pick one shape (per-row IfError incrementing a failure count, single summary Notify, unconditional refresh) and use it at both sites — this also resolves H-4.

### M-12 — Y5 drift: `DateValue(Text(x, "yyyy-mm-dd"))` date-truncation idiom
**Tag:** SAFE · **Files:** `App.pa.yaml` (Timeline_DayStart/DayEnd 322–323, varFindWindowStart/End 334–335), `Find.pa.yaml` (`btnWeekCell_v2.OnSelect` 634), `bookingDetail.pa.yaml` (329, 603, 671–672)

Y5 (`[LINT:L7]`) says "Never parse date/time string literals — construct numerically." These sites round-trip a DateTime through `Text(...)`→`DateValue(...)` to strip the time. The ISO format makes it locale-safe in practice (presumably why L7 doesn't fire), but it is still parse-based and slower than the numeric form. **Fix (mechanical):** `Date(Year(x), Month(x), Day(x))` at each site.

---

## LOW

### L-1 — Dead code inventory
**Tag:** SAFE (report only — not deleted per surgical-change rules) · **Files:** as listed

- **Dark theme:** `glbIsDarkMode` is only ever `Set(..., false)` (App.OnStart 591); no toggle exists. The entire `ThemeMap.Dark` branch is unreachable — and broken anyway (`ColourTokens.Dark.Background: "#ffffff"`, `BorderSubtle: "#ffffff"`, `layer01Bg: "#f4f4f4"` are light values).
- **`glbSideNavIconStr` / `glbSideNavIconActiveStr`** (App 310–313): defined, referenced nowhere. Their inversion (`If(!glbIsDarkMode, <light-gray>, ...)`) looks backwards too, but it's moot while unused.
- **`Timeline_SlotMinutes`, `Timeline_SlotCount`** (App 324–325): defined, never referenced.
- **`varShowDatePicker`** (Rooms 730): written by invisible `lblCurrentDate` (`Visible: =false`), read nowhere.
- **Shell_Header hidden chrome:** `con_Header_MenuBtn`, `con_Header_Search`, `con_Header_Notification` all `Visible: =false`; `gblUI_SearchOpen`/`gblUI_NotifOpen`/`gblUI_Nav_sideNavExpanded` drive nothing visible.
- **`lblStep2Hint`** (cpt_Modal_ 897–925): fully computed hint, `Visible: =false`, but its Height still participates in conStep2's Height formula.
- **`btnReportProblem`** (Profile 537): `OnSelect: =false` placeholder — a visible, enabled button that does nothing.

### L-2 — Inconsistent empty-table idiom
**Tag:** SAFE · **File:** `Rooms.pa.yaml` `btnRoomsBook.OnSelect` (1229): `ClearCollect(varAlternativeRooms, Filter(colRooms, ID <> ID))` — `ID <> ID` is always false (self-comparison), so it works, but every sibling site writes `Filter(colRooms, true = false)`. Both should just be `Clear(varAlternativeRooms)`.

### L-3 — Wrong-screen comment in Find
**Tag:** SAFE · **File:** `Find.pa.yaml` 797–798: `/* Stay on Rooms — rebuild the timeline ... */` above `Select(btnLoadFindBookings)` on the **Find** screen — copy-paste from Rooms. Fix the comment.

### L-4 — Magic numbers
**Tag:** SAFE · Home `rectChipBg.Width: =210.66666666666663` / `lblChipRoom.Width: =192.33333333333334` (721–777, non-responsive frozen editor arithmetic — express in terms of `Parent.TemplateWidth`); App `varFindWindowEnd` week branch `7*24*60-360` (335 — encode as `6*24*60 + DayEndHour*60`); prefill cutoff `540` (Home 201, myBookings 492 — is `DayEndHour*60 - 60` in disguise); `Sequence(41)` in the time dropdowns (see M-3).

### L-5 — Stale accessibility labels in Week mode
**Tag:** SAFE · **File:** `Find.pa.yaml` `imgDateBack_1` (56) / `imgDateForward_1` (78): `AccessibleLabel: ="Previous day"` / `"Next day"` while `OnSelect` moves ±7 days when `varFindViewMode = "Week"`. Fix: `=If(varFindViewMode = "Week", "Previous week", "Previous day")`.

### L-6 — Misleading control names
**Tag:** RISKY (renames ripple through a live app; Y6/Y7 caution) · `Shell_Header`: `con_NavLink_Discover`/`btn_NavLink_Catalog` navigate to Rooms; `con_NavLink_Create`/`btn_NavLink_Create` navigate to myBookings ("Bookings"). `cpt_Modal_`: `conStartTimeField_1`/`conEndTimeField_1` actually hold the Repeats/Occurrences dropdowns. Rename only when those trees are next rebuilt.

### L-7 — Overlapping badges on past clash rows
**Tag:** SAFE · **File:** `myBookings.pa.yaml` `lblPastBadge` (X = Width−60, w44) and `lblClashBadge` (X = Width−192, w176) occupy overlapping X ranges; a Clash row whose EndDateTime has passed shows both, superimposed. Fix: offset the Past badge left when `Status = "Clash"`, or suppress Past on clash rows.

### L-8 — SVG text interpolation is unescaped
**Tag:** SAFE · **File:** `App.pa.yaml` `ButtonProperties`/`TileProperties`/`ContentSwitcherItem` splice `text`/`title`/`subtitle` straight into SVG markup. A room `Title`/`description` containing `&` or `<` (fed via `cpt_Modal_` `img_tile` and the Home tiles) makes the data-URI SVG invalid — the tile renders blank. The Home empty-state image already does `Substitute(wHeading, "&", "&amp;")`; apply the same (plus `<` → `&lt;`) inside the shared functions.

### L-9 — Alt-room selection leaves stale conflict context
**Tag:** RISKY · **File:** `Components/cpt_Modal_.pa.yaml` `btnSelectAltRoom.OnSelect` (1173–1185): sets `varSelectedRoom` and recomputes `varConflict` only; `varConflictingBooking`, `varNextFreeSlot`, `varAlternativeRooms` keep the old room's values, so if the "available" room was just taken the reopened conflict panel shows the previous room's timeline. Route it through the shared recheck (M-2).

### L-10 — Submitting progress UI can never render
**Tag:** SAFE · **File:** `Components/cpt_Modal_.pa.yaml` `btnConfirm.OnSelect` sets `varSubmitting` true at the top and false at the bottom of one synchronous handler; `conProgressBar` (`Visible: =varSubmitting`) never gets a frame. Either drop the flag/panel or set false from the host after the write completes.

### L-11 — Edge slots: 18:00 start; past-start fallback
**Tag:** SAFE · **File:** `Components/cpt_Modal_.pa.yaml`. `drpStartTime` offers 18:00 (slot 41) for which `drpEndTime` has no valid options — cap starts at slot 40. The free-slot prefill (Find 541, Rooms 976) falls back to the raw past `_slotStart` when the rounded-up now exceeds the slot end (`If(_clamped < _slotEnd, _clamped, _slotStart)`), leaving `varStartTime` in the past; Confirm is correctly blocked by `fnIsPast`, but the user sees a prefilled past time with a disabled button and no obvious reason (the reason label helps only on step 3).

### L-12 — Rooms "Book" opens the wizard with a blank date
**Tag:** SAFE · **File:** `Rooms.pa.yaml` `btnRoomsBook.OnSelect` (1216): `Set(varSelectedDate, Blank())` then straight to WizardStep2, so both time dropdowns are empty (their Items build `DateTime(Year(varSelectedDate), ...)` from blank) until the user picks a date. Home's equivalent prefills `Today()` + next slot. Align on the Home behavior.

### L-13 — `gblFindFocusRoomID` never cleared on leaving Find
**Tag:** SAFE · Set by Home (chip/view-all) and read by Find's header highlight; nothing clears it on Find's OnVisible or exit, so a later un-focused visit still highlights the old room. Clear it in `Find.OnVisible` unless freshly set (or clear on screen exit).

### L-14 — YAML/property hygiene
**Tag:** SAFE · `Shell_Header` `rct_Header_Spacer.Width: =` (empty formula, 288); `Rooms.OnVisible` uses `|+` (keeps trailing blank lines — the only screen that does); `cpt_Modal_` `conStep2.Height` is a single-quoted scalar with a trailing space (line 351). All round-trip noise for the guard's byte-hash freshness checks.

### L-15 — Find free-row builder assumes non-overlapping Active bookings
**Tag:** RISKY · **File:** `Find.pa.yaml` `btnLoadFindBookings.OnSelect` (184–196): the tail-gap rule collects a free row `b.End → windowEnd` whenever no booking *starts* at/after `b.End`. If two Active bookings ever overlap (e.g. B 10–11 inside A 9–12 — impossible via the app's own conflict gate but possible via direct list edits or clash-heal races), B generates a "free" row across A's booked time, rendering bookable free slots on top of a booking. Defensive fix: also require `b.EndDateTime = Max(room, EndDateTime)` for the tail row, or build gaps from a merged-interval sweep like Rooms' `btn_LoadTimeline` does.

### L-16 — Countdown label bypasses varNowTick
**Tag:** SAFE · **File:** `Home.pa.yaml` `lblNextCountdown.Text` (568) uses `DateDiff(Now(), NextBookingRecord.StartDateTime, ...)` while the surrounding surface (and `NextBookingRecord` itself) keys off `varNowTick` — the countdown can say "Now" for a record chosen from a stale tick. Use `varNowTick` for consistency.

---

## What was checked and found clean

- **Y1** (block scalars for `: `-bearing formulas): compliant everywhere sampled (e.g. `'RoomID: Title'` sites use `|-`).
- **Y3/Y4**: no `Classic/ComboBox`; visible Toggles use `Checked:`; no `AccessibleLabel` on `Classic/Button` (accessible names via `Text`, done consistently, including the long descriptive texts on invisible overlay buttons — good pattern).
- **Y2**: every referenced global has at least one `Set()` site (spot-checked `gbl_PendingStart/End`, `gbl_FixCycleSeriesID`, `gbl_SelectedSeriesID`, `gblFindFocusRoomID`).
- **App.OnError** exists and both traces and notifies.
- **Create/cancel/edit writes** are consistently wrapped in `IfError` with user-facing `Notify` (the gaps are the *shape* issues in H-4/M-11, not missing handlers).
- **PROD-REVERT markers** for `booking-cancel` (×2), `booking-edit`, `booked-by-actor` (×3), `booking-create-find`, `booking-create-rooms`, `user-settings-writes`, `people-picker-mock` all present and match the contract's dev patterns (sole orphan: H-2).
- **Privacy masking** (`IsPrivate` → "Busy"/blank booked-by) is applied at all three read surfaces (Find rows, Rooms timeline, conflict panel).
- **D1 seed shape**: `MockPeopleSeed` mirrors Office365Users (`DisplayName`/`Mail`); `MockUserSettingsSeed` mirrors the intended Book_UserSettings row shape.

## Suggested fix order

1. **C-1 + H-1 together** (fresh, date-bounded re-read before every conflict check/write) — one design, fixes both.
2. **H-2, H-3** — marker/config only, zero behavior risk, restores the D4/D5 gates.
3. **H-4 / M-11** — unify series-cancel error shape (unconditional refresh).
4. **M-3, M-6, M-10, M-4** — small SAFE correctness fixes.
5. **M-1/M-2 consolidation** — only as part of a planned refactor phase (O1/O3 protocol), after 1–4 land.
