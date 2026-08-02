# Audit Remediation — Phase 1 (Correctness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the correctness holes from `docs/reviews/2026-07-31-app-audit.md` — stale-snapshot double-booking (BUG-1), data-row-limit truncation (BUG-2), series cancel/edit gaps (BUG-3/9), re-time clash writes (BUG-4), monthly weekend recurrence (BUG-10b), the four Rooms-timeline defects (BUG-5/6/7/22), wizard state leaks (BUG-13/14), and the two five-minute items (BUG-8, PERF-2).

**Architecture:** All edits are Power Fx formula changes inside `.pa.yaml` files in a scratch `sync_canvas` tree. The single structural idea: a `BookingsWindow` named formula becomes the one bounded, delegable source for the `colBookings` snapshot; clash gates and series mutations stop trusting the snapshot and re-read `Book_Bookings` server-side with delegation-safe predicates (`=`, `<`, `>=` server-side; `<>`, `Now()`, lookup-column refinement client-side on the small result).

**Tech Stack:** Power Apps Canvas (`.pa.yaml` via canvas-authoring MCP), SharePoint lists (`Book_Bookings`, `Book_Rooms`), pa-lint / pa-schema-validate / canvas-guard.

---

## Ground rules (rule IDs, not restatements — see `docs/RULES.md`)

- **Process:** P1, P2, P3, P6 (single publisher; workers NEVER `compile_canvas`), P4, P5, P7, P8 (record every rung with `guard.sh verified`), P9 (commit format), O1, O2, O3.
- **Authoring:** Y1 (formulas containing `: ` are `|-` block scalars), Y2, Y8. D4 (every reset site carries `// RESET-SITE[name]` and resets every registered var).
- **Anchors:** All "Before" blocks below were taken from the fresh sync of 2026-08-02 (`plan-sync-20260802`, pa-lint 0 errors / 20 advisory, rung 1). Per **O3**, anchor by the quoted code, never by line numbers. If a Before block does not match your fresh sync verbatim, STOP and report drift — do not improvise.
- **Delegation constraint (confirmed in-repo):** the comment at `myBookings.pa.yaml` `btn`…series-cancel already records that **`<>` and `Now()` predicates are not delegable to SharePoint**. Every server-side `Filter(Book_Bookings, …)` in this plan therefore uses only `=`, `<`, `<=`, `>`, `>=` on scalar columns; `<>`, `Now()`-relative and `RoomID.Id` refinements happen in a client-side outer `Filter` over the already-small server result.
- **Working model:** one scratch tree, tasks executed **in order** (later Before blocks assume earlier tasks are applied). Worker loop per task: edit → `node tools/pa-lint/lint.js --src <dir>` → `node tools/pa-schema-validate/validate.js --src <dir>` → acceptance grep → git commit. One publish at the end (Task 9, publisher only, guard lock held, human Studio session co-attached — P6/P7).

**Scope boundary:** This plan is items 1, 3 (state part), 4, 5, 8 of the audit's remediation table, i.e. every CRITICAL/HIGH *correctness* fix plus the XS quick wins. Items 2, 6, 7 (performance program) and 9, 10 (decoupling, naming) are deliberately separate plans — see "Follow-on plans" at the bottom. Medium bugs not listed in the remediation table (BUG-11/12/15–21/23/24) are tracked there too, except BUG-22 which rides along in Task 7.

---

## Task 0: Session open — connect, sync, reconcile, baseline

**Files:** none edited; produces the scratch tree every later task edits.

- [ ] **Step 1: Connect** (MCP `connect`, snake_case params)

```
environment_id = "Default-ecf69819-b595-4d54-b001-6a6efb5d9bfd"
app_id         = "498d4962-0b5f-4990-a400-1bf5de9a367c"
login_hint     = "harry@harry-burton.ai"
```

- [ ] **Step 2: Fresh sync into a NEW scratch dir** (never into `Src/`): `sync_canvas(directoryPath: <scratch>/fix-sync-<yyyymmdd-hhmm>)`. Expect 11 files.

- [ ] **Step 3: Reconcile git (P5).** As of 2026-08-02 the live server differs from git `Src/` on all 9 app files. Copy the fresh sync over `Src/` and commit:

```bash
git checkout -b fix/audit-phase1
```

```bash
cp -r "<scratch>/fix-sync-<stamp>/." Src/ && git add Src && git commit -m "sync: reconcile server drift before audit phase-1 fixes (P5)"
```

- [ ] **Step 4: Baseline lint + record rung 1**

Run: `node tools/pa-lint/lint.js --src <scratch-dir>`
Expected: `pa-lint: 0 error(s), 20 warning(s)` (all L3 advisory).
Record: `"C:/Program Files/Git/bin/bash.exe" tools/canvas-guard/guard.sh verified "rung 1 pa-lint clean on fix-sync-<stamp>"`

---

## Task 1: OnStart quick wins — seed Find globals, `Concurrent()` collects (BUG-8, PERF-2)

**Files:**
- Modify: `<scratch>/App.pa.yaml` — the `OnStart:` block

- [ ] **Step 1: Edit `App.OnStart`.** Before (current, abbreviated to the exact lines that change — the `Set(gblRoomsAvailableOnly, false);` line above and `Set(gblUserInitials, …)` below stay put):

```
                  ClearCollect(
                      colRoomsEquipmentFilter,
                      Filter(Table({Value: ""}), !IsBlank(Value))
                  );
                  /* 0 = create mode; >0 = booking being edited */
                  Set(gblEditingBookingID, 0);

                  ClearCollect(colRooms, Book_Rooms);
                  ClearCollect(colBookings, Book_Bookings);
```

After:

```
                  ClearCollect(
                      colRoomsEquipmentFilter,
                      Filter(Table({Value: ""}), !IsBlank(Value))
                  );
                  /* 0 = create mode; >0 = booking being edited */
                  Set(gblEditingBookingID, 0);
                  /* Seed the Find-screen globals the App-level named formulas
                     (varFindWindowStart/End, varFindWeekStart, WeekBookings) read —
                     without these, any consumer outside Find gets poisoned blanks (BUG-8). */
                  Set(varFindSelectedDate, Today());
                  Set(varFindViewMode, "Day");

                  Concurrent(
                      ClearCollect(colRooms, Book_Rooms),
                      ClearCollect(colBookings, Book_Bookings)
                  );
```

(The seeds copy Find's own OnVisible values verbatim: `Set(varFindViewMode, "Day"); Set(varFindSelectedDate, Today());` — Find.pa.yaml OnVisible, unchanged.)

- [ ] **Step 2: Lint + validate**

Run: `node tools/pa-lint/lint.js --src <scratch-dir>` → `0 error(s)`.
Run: `node tools/pa-schema-validate/validate.js --src <scratch-dir>` → clean.

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(app): seed Find globals in OnStart, Concurrent collects (BUG-8 PERF-2)"
```

---

## Task 2: Bound the `colBookings` pull — `BookingsWindow` named formula, 19-site swap (BUG-2, PERF-1 partial)

**Files:**
- Modify: `<scratch>/App.pa.yaml` (Formulas block + OnStart)
- Modify: all 19 `ClearCollect(colBookings, Book_Bookings)` sites: `App.pa.yaml` ×1, `Find.pa.yaml` ×2, `Home.pa.yaml` ×3, `myBookings.pa.yaml` ×2, `Rooms.pa.yaml` ×2, `bookingDetail.pa.yaml` ×6, `Components/cpt_BookingDetailModal.pa.yaml` ×3

- [ ] **Step 1: Add the named formula** in `App.pa.yaml` Formulas, directly under the existing constants block ending `MaxBookingMinutes = 240;`:

```
                  /* The one bounded source for the colBookings snapshot. Rolling window:
                     every consumer (MyBookings -90d, Find/Rooms day views, clash checks)
                     filters narrower than this. Both predicates are delegable to SharePoint
                     (>= / <= on DateTime), so the pull no longer truncates at the
                     data-row limit for in-window rows (BUG-2). */
                  BookingsWindowStart = DateAdd(Today(), -90, TimeUnit.Days);
                  /* End = 24 months (revised twice in review): +180d hid series tails;
                     12 months only covers series STARTING today — the date picker is
                     unbounded, so a 12-monthly series starting +2 months tails at +13. */
                  BookingsWindowEnd   = DateAdd(Today(), 24, TimeUnit.Months);
                  BookingsWindow = Filter(
                      Book_Bookings,
                      EndDateTime >= BookingsWindowStart,
                      StartDateTime <= BookingsWindowEnd
                  );
```

- [ ] **Step 2: Swap all 19 sites.** Mechanical, identical everywhere. Before / After (indentation varies per site — preserve it):

```
ClearCollect(colBookings, Book_Bookings)
```

```
ClearCollect(colBookings, BookingsWindow)
```

Note two sites have no trailing `;` (`myBookings.pa.yaml` OnVisible, last statement) — leave punctuation as found.

- [ ] **Step 3: Acceptance greps**

Run: `grep -rc "ClearCollect(colBookings, Book_Bookings)" <scratch-dir> | grep -v ":0"`
Expected: no output (0 sites left).
Run: `grep -ro "ClearCollect(colBookings, BookingsWindow)" <scratch-dir> | wc -l`
Expected: `19`.

- [ ] **Step 4: Delegation check.** Open the fresh App Checker via MCP `get_appchecker_errors` after publish (Task 9) — the 15 `CollectDelegatableDataSource` findings must not increase (P10 is the formal gate at deploy; here it is an acceptance signal). No new delegation warnings on `BookingsWindow`.

- [ ] **Step 5: Lint + validate + commit**

```bash
git commit -am "fix(bookings): bound colBookings to BookingsWindow rolling window (BUG-2 PERF-1)"
```

---

## Task 3: Fresh server re-read at the clash gates (BUG-1)

**Files:**
- Modify: `<scratch>/Components/cpt_Modal_.pa.yaml` — `btnConfirm.OnSelect`
- Modify: host `OnSubmit` handlers on `Home.pa.yaml`, `Find.pa.yaml`, `Rooms.pa.yaml` (the `cpt_Modal__book` instance property)

- [ ] **Step 1: Make the confirm-time overlap collection a server read.** In `cpt_Modal_.pa.yaml` `btnConfirm.OnSelect`, Before:

```
                          =Set(varSubmitting, true);
                          ClearCollect(
                              colOverlappingBookings,
                              Filter(
                                  colBookings,
                                  Status = "Active",
                                  fnOverlaps(StartDateTime, EndDateTime, varStartTime, varEndTime),
                                  ID <> gblEditingBookingID
                              )
                          );
```

After (server filter carries only delegable predicates — the overlap condition `StartDateTime < varEndTime && EndDateTime > varStartTime` is exactly `fnOverlaps` unrolled; `<>` moves to the client-side outer Filter):

```
                          =Set(varSubmitting, true);
                          /* BUG-1: re-read the server, not the colBookings snapshot, so a slot
                             taken by ANOTHER user since screen entry is caught here. */
                          ClearCollect(
                              colOverlappingBookings,
                              Filter(
                                  Filter(
                                      Book_Bookings,
                                      Status = "Active",
                                      StartDateTime < varEndTime,
                                      EndDateTime > varStartTime
                                  ),
                                  ID <> gblEditingBookingID
                              )
                          );
```

Everything downstream (`varConflict`, `varConflictingBooking`, `varAlternativeRooms`) reads `colOverlappingBookings` unchanged — same shape, now fresh. Leave the `varNextFreeSlot` block (advisory UI) on `colBookings`.

- [ ] **Step 2 (REVISED in Task-3 review): per-occurrence fresh reads, no big span pull.** A single collect spanning the whole series (up to ~11 months, all rooms) can exceed the data-row cap and silently truncate — reintroducing BUG-1. Instead each occurrence does its own slot-sized server read (a few hours wide → tiny result), mirroring the btnConfirm gate. The `ClearCollect(colPayloadSnapshot, …); Clear(colFailedBookings);` opening is left UNCHANGED.

- [ ] **Step 3: Swap the per-occurrence check to a fresh server read.** In `Home.pa.yaml` host `OnSubmit`, Before:

```
                              _hasClash: !IsBlank(
                                  LookUp(
                                      Filter(
                                          colBookings,
                                          Status = "Active",
                                          fnOverlaps(StartDateTime, EndDateTime, _occ.StartDateTime, _occ.EndDateTime)
                                      ),
                                      RoomID.Id = _occ.RoomIdNumber
                                  )
                              )
```

After:

```
                              /* BUG-1: fresh slot-sized server read per occurrence — the narrow
                                 window keeps the result far under the data-row cap; room
                                 narrowing stays client-side on that small set. */
                              _hasClash: !IsBlank(
                                  LookUp(
                                      Filter(
                                          Filter(
                                              Book_Bookings,
                                              Status = "Active",
                                              StartDateTime < _occ.EndDateTime,
                                              EndDateTime > _occ.StartDateTime
                                          ),
                                          ID <> gblEditingBookingID
                                      ),
                                      RoomID.Id = _occ.RoomIdNumber
                                  )
                              )
```

- [ ] **Step 4: Repeat Steps 2–3 on `Find.pa.yaml` and `Rooms.pa.yaml`** host `OnSubmit` handlers. They follow the same `ValidPayload → snapshot → ForAll(_occ …)` pattern; anchor each by the quoted `ClearCollect(colPayloadSnapshot, cpt_Modal__book.PatchPayload);` and `_hasClash: !IsBlank(` blocks (O3). If a host's `_hasClash` block differs from the quote, report drift instead of adapting.

- [ ] **Step 5: Acceptance grep**

Run: `grep -rn "colFreshRoomBookings" <scratch-dir>` → NO matches (the big-span pull was rejected in review).
Run: `grep -rn "_hasClash" <scratch-dir>` with `-A8` → all three hosts read the nested `Filter(Filter(Book_Bookings, …))` per-occurrence pattern; none reads `colBookings`.

- [ ] **Step 6: Lint + validate + commit**

```bash
git commit -am "fix(bookings): confirm-gate and per-occurrence clash checks re-read server (BUG-1)"
```

**D3 seed note:** two-browser race is the true test (rung 5): user A and user B both open the wizard for the same slot; A confirms, then B confirms → B must get the clash outcome, and the list must contain exactly one `Active` row for that slot (sharp acceptance: `CountRows(Filter(Book_Bookings, RoomID.Id = <room>, StartDateTime = <slot>, Status = "Active")) = 1`).

---

## Task 4: Series mutations — server-scoped, owned, failure-aware (BUG-2-series, BUG-3, BUG-9, PERF-6 partial)

**Files:**
- Modify: `<scratch>/myBookings.pa.yaml` — series-cancel confirm button
- Modify: `<scratch>/Components/cpt_BookingDetailModal.pa.yaml` — "Whole series" cancel
- Modify: `<scratch>/bookingDetail.pa.yaml` — series cancel + series edit-plan filter

The pattern everywhere: server-filter `SeriesID = _sid` (delegable `=`, result ≤ 12 rows regardless of table size — kills the truncation), client-filter `Now()`/`<>`/ownership on that small result, `Patch` the server record directly (drops the per-row `LookUp` N+1), collect per-row outcomes, branch the toast.

- [ ] **Step 1: myBookings.** Before (`OnSelect` of the series-cancel confirm button — quoted in full):

```
                                      =// PROD-REVERT[booking-cancel] soft delete via per-row Patch; matches single-cancel pattern in bookingDetail.
                                      // UpdateIf's <> and Now() predicates aren't delegable to SharePoint, so this iterates the
                                      // client-side colBookings copy (series capped at 12 rows) and patches each row by ID instead.
                                      ForAll(
                                          Filter(colBookings, SeriesID = gbl_UI_CancelSeriesConfirmID, StartDateTime >= Now(), Status <> "Cancelled") As _m,
                                          IfError(
                                              Patch(Book_Bookings, LookUp(Book_Bookings, ID = _m.ID), {Status: "Cancelled"});
                                              true,
                                              Notify("Couldn't cancel one or more occurrences.", NotificationType.Error);
                                              false
                                          )
                                      );
                                      Refresh(Book_Bookings);
                                      ClearCollect(colBookings, BookingsWindow);
                                      Set(gbl_UI_CancelSeriesConfirmID, Blank());
                                      Notify("Series cancelled", NotificationType.Success)
```

After:

```
                                      =// PROD-REVERT[booking-cancel] soft delete via Patch; Remove() retired per WS4
                                      // Server-filter SeriesID (delegable =, <=12 rows), then refine with the
                                      // non-delegable predicates client-side — immune to the data-row limit (BUG-2).
                                      // Ownership predicate mirrors the MyBookings named formula (BUG-3).
                                      With(
                                          {
                                              _results: ForAll(
                                                  Filter(
                                                      Filter(Book_Bookings, SeriesID = gbl_UI_CancelSeriesConfirmID),
                                                      StartDateTime >= Now(),
                                                      Status <> "Cancelled",
                                                      BookedByEmail = Lower(User().Email)
                                                  ) As _m,
                                                  IfError(
                                                      Patch(Book_Bookings, _m, {Status: "Cancelled"});
                                                      true,
                                                      false
                                                  )
                                              )
                                          },
                                          Refresh(Book_Bookings);
                                          ClearCollect(colBookings, BookingsWindow);
                                          Set(gbl_UI_CancelSeriesConfirmID, Blank());
                                          If(
                                              CountRows(Filter(_results, !Value)) = 0,
                                              Notify("Series cancelled", NotificationType.Success),
                                              Notify(
                                                  $"Couldn't cancel {CountRows(Filter(_results, !Value))} occurrence(s) — the series is only partially cancelled.",
                                                  NotificationType.Error
                                              )
                                          )
                                      )
```

- [ ] **Step 2: cpt_BookingDetailModal "Whole series".** Before (quoted in full):

```
                                      =// PROD-REVERT[booking-cancel] soft delete via Patch; Remove() retired per WS4
                                      /* Whole series: future, non-cancelled members (exceptions included;
                                         past occurrences untouched) - mirrors bookingDetail.btnScopeSeries. */
                                      With(
                                          {_sid: gblSelectedBooking.SeriesID},
                                          ForAll(
                                              Filter(colBookings, SeriesID = _sid, StartDateTime >= Now(), Status <> "Cancelled") As _m,
                                              IfError(
                                                  Patch(Book_Bookings, LookUp(Book_Bookings, ID = _m.ID), {Status: "Cancelled"});
                                                  true,
                                                  Notify("Couldn't cancel one or more occurrences.", NotificationType.Error);
                                                  false
                                              )
                                          );
                                          Refresh(Book_Bookings);
                                          ClearCollect(colBookings, BookingsWindow);
                                          Set(gblSelectedBooking, Blank());
                                          Notify("Series cancelled", NotificationType.Success);
                                          Set(gbl_FixCycleSeriesID, "");
                                          // RESET-SITE[detail-modal-close] cancel completed, dismiss the modal
                                          Set(gbl_UI_Detail_ConfirmMode, "");
                                          Set(gbl_UI_Detail_Modal, false)
                                      )
```

After:

```
                                      =// PROD-REVERT[booking-cancel] soft delete via Patch; Remove() retired per WS4
                                      /* Whole series: future, non-cancelled, OWNED members (exceptions included;
                                         past occurrences untouched). Server-filtered by SeriesID so the mutation
                                         set is immune to the data-row limit (BUG-2/BUG-3). */
                                      With(
                                          {_sid: gblSelectedBooking.SeriesID},
                                          With(
                                              {
                                                  _results: ForAll(
                                                      Filter(
                                                          Filter(Book_Bookings, SeriesID = _sid),
                                                          StartDateTime >= Now(),
                                                          Status <> "Cancelled",
                                                          BookedByEmail = Lower(User().Email)
                                                      ) As _m,
                                                      IfError(
                                                          Patch(Book_Bookings, _m, {Status: "Cancelled"});
                                                          true,
                                                          false
                                                      )
                                                  )
                                              },
                                              Refresh(Book_Bookings);
                                              ClearCollect(colBookings, BookingsWindow);
                                              Set(gblSelectedBooking, Blank());
                                              If(
                                                  CountRows(Filter(_results, !Value)) = 0,
                                                  Notify("Series cancelled", NotificationType.Success),
                                                  Notify(
                                                      $"Couldn't cancel {CountRows(Filter(_results, !Value))} occurrence(s) — the series is only partially cancelled.",
                                                      NotificationType.Error
                                                  )
                                              );
                                              Set(gbl_FixCycleSeriesID, "");
                                              // RESET-SITE[detail-modal-close] cancel completed, dismiss the modal
                                              Set(gbl_UI_Detail_ConfirmMode, "");
                                              Set(gbl_UI_Detail_Modal, false)
                                          )
                                      )
```

- [ ] **Step 3: bookingDetail series cancel.** Anchor by the quoted filter `Filter(colBookings, SeriesID = _sid, StartDateTime >= Now(), Status <> "Cancelled") As _m` inside the `With({_sid: gblSelectedBooking.SeriesID}, …)` block near the `btnScopeSeries` cancel path; apply the identical transformation as Step 2 (same before-shape, same after-shape, keeping that site's own trailing close/reset lines exactly as found).

- [ ] **Step 4: bookingDetail series edit-plan filter.** Before (single line, series re-time path):

```
                                                                  Filter(colBookings, SeriesID = _sid, StartDateTime >= Now(), Status <> "Cancelled", !IsException),
```

After:

```
                                                                  Filter(
                                                                      Filter(Book_Bookings, SeriesID = _sid),
                                                                      StartDateTime >= Now(), Status <> "Cancelled", !IsException,
                                                                      BookedByEmail = Lower(User().Email)
                                                                  ),
```

- [ ] **Step 5: Acceptance greps**

Run: `grep -rn "Filter(colBookings, SeriesID" <scratch-dir>` on mutation paths → the only remaining hits must be *display* reads (fix-cycle `_next` lookup, gallery items), no `Patch` within 10 lines.
Run: `grep -rn 'Filter(Book_Bookings, SeriesID' <scratch-dir> | wc -l` → `4`.

- [ ] **Step 6: Lint + validate + commit**

```bash
git commit -am "fix(series): server-scoped owned mutations, failure-aware toasts (BUG-2 BUG-3 BUG-9)"
```

**Assumption surfaced:** ownership = `BookedByEmail = Lower(User().Email)` (verbatim the `MyBookings` named formula predicate). A booker-on-behalf who is not the bookee can no longer series-cancel those rows — that is the audit's stated intent (defense-in-depth); flag to Harry if book-on-behalf cancel rights are wanted later.

---

## Task 5: Re-time "just this booking" — never write an overlapping Active (BUG-4)

**Files:**
- Modify: `<scratch>/bookingDetail.pa.yaml` — scope-prompt "edit / just this occurrence" button

- [ ] **Step 1: Status truth.** Before (inside the `IfError(Patch(…))`):

```
                                                                  {
                                                                      StartDateTime: gbl_PendingStart,
                                                                      EndDateTime: gbl_PendingEnd,
                                                                      IsException: true,
                                                                      Status: If(_free, "Active", gblSelectedBooking.Status)
                                                                  }
```

After:

```
                                                                  {
                                                                      StartDateTime: gbl_PendingStart,
                                                                      EndDateTime: gbl_PendingEnd,
                                                                      IsException: true,
                                                                      /* BUG-4: a busy target slot is a clash, whatever the row was before */
                                                                      Status: If(_free, "Active", "Clash")
                                                                  }
```

- [ ] **Step 2: Truthful "resolved" message.** Before (fix-cycle advance, same handler):

```
                                                                      If(
                                                                          IsBlank(_next),
                                                                          Set(gbl_FixCycleSeriesID, "");
                                                                          Notify("All clashes resolved", NotificationType.Success),
```

After:

```
                                                                      If(
                                                                          IsBlank(_next),
                                                                          Set(gbl_FixCycleSeriesID, "");
                                                                          If(
                                                                              _free,
                                                                              Notify("All clashes resolved", NotificationType.Success),
                                                                              Notify("No further clashes to fix — this booking is still clashed", NotificationType.Warning)
                                                                          ),
```

- [ ] **Step 3: Lint + validate + commit**

```bash
git commit -am "fix(bookings): re-time onto busy slot writes Clash, honest resolve toast (BUG-4)"
```

---

## Task 6: Monthly recurrence never lands on a weekend (BUG-10b)

**Files:**
- Modify: `<scratch>/Components/cpt_Modal_.pa.yaml` — payload builder in `btnConfirm.OnSelect`

- [ ] **Step 1: Shift start AND end by the same weekend offset.** Before (inner `With` of the `ForAll(Sequence(…) As _occ, …)`):

```
                                          With(
                                              {
                                                  vStart: Switch(
                                                      _recurrenceType,
                                                      "Weekly", DateAdd(varStartTime, 7 * (_occ.Value - 1), TimeUnit.Days),
                                                      "BiWeekly", DateAdd(varStartTime, 14 * (_occ.Value - 1), TimeUnit.Days),
                                                      "Monthly", DateAdd(varStartTime, _occ.Value - 1, TimeUnit.Months),
                                                      varStartTime
                                                  ),
                                                  vEnd: Switch(
                                                      _recurrenceType,
                                                      "Weekly", DateAdd(varEndTime, 7 * (_occ.Value - 1), TimeUnit.Days),
                                                      "BiWeekly", DateAdd(varEndTime, 14 * (_occ.Value - 1), TimeUnit.Days),
                                                      "Monthly", DateAdd(varEndTime, _occ.Value - 1, TimeUnit.Months),
                                                      varEndTime
                                                  )
                                              },
```

After (weekly/biweekly steps of 7/14 days preserve the weekday, so `_shiftDays` is 0 for them by construction; only Monthly can drift onto Sat/Sun — Sat→+2, Sun→+1, both land on Monday):

```
                                          With(
                                              {
                                                  _rawStart: Switch(
                                                      _recurrenceType,
                                                      "Weekly", DateAdd(varStartTime, 7 * (_occ.Value - 1), TimeUnit.Days),
                                                      "BiWeekly", DateAdd(varStartTime, 14 * (_occ.Value - 1), TimeUnit.Days),
                                                      "Monthly", DateAdd(varStartTime, _occ.Value - 1, TimeUnit.Months),
                                                      varStartTime
                                                  ),
                                                  _rawEnd: Switch(
                                                      _recurrenceType,
                                                      "Weekly", DateAdd(varEndTime, 7 * (_occ.Value - 1), TimeUnit.Days),
                                                      "BiWeekly", DateAdd(varEndTime, 14 * (_occ.Value - 1), TimeUnit.Days),
                                                      "Monthly", DateAdd(varEndTime, _occ.Value - 1, TimeUnit.Months),
                                                      varEndTime
                                                  )
                                              },
                                              With(
                                                  {
                                                      /* BUG-10b: Mon–Fri rule for every occurrence, not just #1 */
                                                      _shiftDays: Switch(
                                                          Weekday(_rawStart, StartOfWeek.Sunday),
                                                          7, 2,
                                                          1, 1,
                                                          0
                                                      )
                                                  },
                                                  With(
                                                      {
                                                          vStart: DateAdd(_rawStart, _shiftDays, TimeUnit.Days),
                                                          vEnd: DateAdd(_rawEnd, _shiftDays, TimeUnit.Days)
                                                      },
```

and close the two extra `With(` parens at the end of the occurrence record — the block that today ends:

```
                                              }
                                          )
                                      )
                                  )
                              );
```

becomes:

```
                                                  }
                                              )
                                          )
                                      )
                                  )
                              );
```

(The record body `{ OccIndex: _occ.Value, … RecurrenceType: _recurrenceType }` is unchanged; only its indentation deepens by one level and `vStart`/`vEnd` now refer to the shifted values.)

- [ ] **Step 2: Lint + validate** (paren balance is the risk here — pa-lint's parse will catch it; also eyeball with `grep -c "With(" `/`grep -c ")"` on the block if in doubt).

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(recurrence): monthly occurrences shift Sat/Sun to Monday (BUG-10b)"
```

---

## Task 7: Rooms timeline — real run ends, no phantom slots, no past bookings, live now-rule (BUG-5, BUG-6, BUG-7, BUG-22)

**Files:**
- Modify: `<scratch>/Rooms.pa.yaml` — `btnTLFree` (OnSelect + new DisplayMode), `btn_LoadTimeline.OnSelect` builder, `recTLNowRule.Y`
- Modify: `<scratch>/Components/cpt_Modal_.pa.yaml` — `btnNext.DisplayMode`

- [ ] **Step 1 (BUG-5): selection run-end = start of next booked row, not the hourly cell edge.** In `btnTLFree.OnSelect`, Before:

```
                                                                                    UpdateContext({
                                                                                        varTLSelStart: _start,
                                                                                        varTLSelRunStart: ThisItem.RowStart,
                                                                                        varTLSelRunEnd: _slotEnd,
```

After:

```
                                                                                    UpdateContext({
                                                                                        varTLSelStart: _start,
                                                                                        varTLSelRunStart: ThisItem.RowStart,
                                                                                        /* BUG-5: free rows are clipped to hour cells; the true contiguous
                                                                                           free run ends at the next BOOKED row (or day end), which is what
                                                                                           the 90m/120m duration chips must compare against. */
                                                                                        varTLSelRunEnd: With(
                                                                                            {_nextBooked: Min(Filter(colTimelineRows, RowType = "booked", RowStart >= _slotStart), RowStart)},
                                                                                            If(
                                                                                                IsBlank(_nextBooked),
                                                                                                DateAdd(Timeline_DayStart, (DayEndHour - DayStartHour) * 60, TimeUnit.Minutes),
                                                                                                _nextBooked
                                                                                            )
                                                                                        ),
```

Note `_fit` (used for `varTLSelMinutes`) still derives from `_slotEnd`; also update it so the pre-selected duration can use the full run — Before, two lines above the UpdateContext:

```
                                                                                {_fit: DateDiff(_start, _slotEnd, TimeUnit.Minutes)},
```

After:

```
                                                                                {
                                                                                    _fit: DateDiff(
                                                                                        _start,
                                                                                        With(
                                                                                            {_nb: Min(Filter(colTimelineRows, RowType = "booked", RowStart >= _slotStart), RowStart)},
                                                                                            If(IsBlank(_nb), DateAdd(Timeline_DayStart, (DayEndHour - DayStartHour) * 60, TimeUnit.Minutes), _nb)
                                                                                        ),
                                                                                        TimeUnit.Minutes
                                                                                    )
                                                                                },
```

- [ ] **Step 2 (BUG-7): disable past free rows.** `btnTLFree` currently has no `DisplayMode` property. Add one (alphabetical position: between `Color:` and `Fill:` — pa-schema-validate will flag misordering if the file convention is alphabetical; match siblings):

```
                                                                  DisplayMode: =If(fnIsPast(ThisItem.RowEnd), DisplayMode.Disabled, DisplayMode.Edit)
```

- [ ] **Step 3 (BUG-7): wizard step gate knows about past starts.** In `cpt_Modal_.pa.yaml` `btnNext.DisplayMode`, Before:

```
                        DisplayMode: =If(IsBlank(varSelectedRoom) || IsBlank(varStartTime) || IsBlank(varEndTime) || varEndTime <= varStartTime || IsBlank(varTitle) || varConflict || (!IsBlank(varSelectedDate) && (Weekday(varSelectedDate, StartOfWeek.Sunday) in [1,7] || varSelectedDate < Today())) || DateDiff(varStartTime, varEndTime, TimeUnit.Minutes) > MaxBookingMinutes, DisplayMode.Disabled, DisplayMode.Edit)
```

After (one added disjunct):

```
                        DisplayMode: =If(IsBlank(varSelectedRoom) || IsBlank(varStartTime) || IsBlank(varEndTime) || varEndTime <= varStartTime || IsBlank(varTitle) || varConflict || fnIsPast(varStartTime) || (!IsBlank(varSelectedDate) && (Weekday(varSelectedDate, StartOfWeek.Sunday) in [1,7] || varSelectedDate < Today())) || DateDiff(varStartTime, varEndTime, TimeUnit.Minutes) > MaxBookingMinutes, DisplayMode.Disabled, DisplayMode.Edit)
```

- [ ] **Step 4 (BUG-6): phantom-free guard in the builder.** In `btn_LoadTimeline.OnSelect`, the gap-after-booking emit, Before:

```
                                                                If(
                                                                    segStart < segEnd &&
                                                                        segStart >= cellStart &&
                                                                        segEnd <= cellEnd &&
                                                                        CountRows(Filter(overl, EndDateTime = b.EndDateTime, StartDateTime < b.StartDateTime)) = 0,
                                                                    Collect(colTimelineRows, {
```

After (final overlap guard — a still-running longer booking invisible to the `nb` lookup can no longer produce a bookable "free" row):

```
                                                                If(
                                                                    segStart < segEnd &&
                                                                        segStart >= cellStart &&
                                                                        segEnd <= cellEnd &&
                                                                        CountRows(Filter(overl, EndDateTime = b.EndDateTime, StartDateTime < b.StartDateTime)) = 0 &&
                                                                        IsEmpty(Filter(colRoomBookings, StartDateTime < segEnd, EndDateTime > segStart)),
                                                                    Collect(colTimelineRows, {
```

- [ ] **Step 5 (BUG-22): now-rule derives from time.** `recTLNowRule`, Before:

```
                                                            Y: =118
```

After (2 px/min — the same idiom as the sibling `Y: =DateDiff(ThisItem.RowStart, varTLSelStart, TimeUnit.Minutes) * 2 …` and the builder's `RowHeight … * 2`):

```
                                                            Y: =DateDiff(ThisItem.RowStart, varNowTick, TimeUnit.Minutes) * 2
```

- [ ] **Step 6: Acceptance.** Lint + validate clean. Manual (rung 5, at publish): pick a free run of 09:30–12:00 spanning hour cells → the 90m and 2h chips must enable (sharp check: with `MaxBookingMinutes = 240` a ≥2h free run must light all four chips); a fully-past row must render disabled; the red now-line must sit proportionally inside the current row.

- [ ] **Step 7: Commit**

```bash
git commit -am "fix(rooms): timeline run-ends, phantom guard, past-slot lock, live now-rule (BUG-5 BUG-6 BUG-7 BUG-22)"
```

---

## Task 8: Wizard clear-on-close + outcome-guarded resets (BUG-13, BUG-14, STATE-1 groundwork)

**Files:**
- Modify: `<scratch>/Components/cpt_Modal_.pa.yaml` — `scrimBackdrop.OnSelect`, `btnBack.OnSelect`, `btnClose.OnSelect`, `btnDiscardBooking.OnSelect`, `btnConfirm.OnSelect`

The component has `AccessAppScope: true`, so it can clear the app globals itself. Every close path gets the SAME canonical block; per **D4** each carries a `// RESET-SITE[…]` marker naming the site. (This is the audit's `fnOpenBookingWizard` intent inverted: App.Formulas currently has only pure `:Boolean` UDFs and behavior/`:Void` UDFs need a feature flag we have not verified, so the reset moves INTO the component's close paths instead — same end state: hosts can no longer leak stale wizard state, whatever they forget to seed.)

- [ ] **Step 1: Define the canonical close block** (for reference; each site embeds it after its existing `Reset(…)` lines, replacing nothing):

```
                                  // RESET-SITE[<site-name>] full wizard-state clear on close (BUG-13)
                                  // NOTE (final review): varSelectedRoom is NOT cleared — the Rooms
                                  // open-sites inherit the screen's room selection; blanking it here
                                  // dead-ends the timeline flow. gbl_FixCycleSeriesID IS cleared so
                                  // an abandoned wizard can't leave the fix cycle armed.
                                  Set(varTitle, Blank());
                                  Set(varSelectedDate, Blank());
                                  Set(varStartTime, Blank());
                                  Set(varEndTime, Blank());
                                  Set(varConflict, false);
                                  Set(varConflictingBooking, Blank());
                                  Set(varNextFreeSlot, Blank());
                                  Set(varBookingError, false);
                                  Set(varSubmitting, false);
                                  Set(gbl_Book_SubmitResult, "");
                                  Set(gbl_FixCycleSeriesID, "");
                                  Set(gbl_UI_Book_Modal_Step, WizardStep1);
                                  ClearCollect(varAlternativeRooms, Filter(colRooms, true = false));
```

- [ ] **Step 2: `scrimBackdrop.OnSelect`** — in the step-1 branch, insert the block (site name `wizard-scrim-close`) between `Set(gblEditingBookingID, 0);` and `Set(gbl_UI_Book_Modal, false),`. Before (tail of the branch):

```
                  Set(gbl_UI_Book_CancelConfirm, false);
                  Set(gblEditingBookingID, 0);
                  Set(gbl_UI_Book_Modal, false),
                  Set(gbl_UI_Book_CancelConfirm, true)
```

After:

```
                  Set(gbl_UI_Book_CancelConfirm, false);
                  Set(gblEditingBookingID, 0);
                  // RESET-SITE[wizard-scrim-close] full wizard-state clear on close (BUG-13)
                  Set(varTitle, Blank());
                  Set(varSelectedRoom, Blank());
                  Set(varSelectedDate, Blank());
                  Set(varStartTime, Blank());
                  Set(varEndTime, Blank());
                  Set(varConflict, false);
                  Set(varConflictingBooking, Blank());
                  Set(varNextFreeSlot, Blank());
                  Set(varBookingError, false);
                  Set(varSubmitting, false);
                  Set(gbl_Book_SubmitResult, "");
                  Set(gbl_UI_Book_Modal_Step, WizardStep1);
                  ClearCollect(varAlternativeRooms, Filter(colRooms, true = false));
                  Set(gbl_UI_Book_Modal, false),
                  Set(gbl_UI_Book_CancelConfirm, true)
```

- [ ] **Step 3: `btnClose.OnSelect`** — identical insertion point (after `Set(gblEditingBookingID, 0);`, before `Set(gbl_UI_Book_Modal, false),`), site name `wizard-btnclose`.

- [ ] **Step 4: `btnBack.OnSelect`** — its step-1 branch ends `…Set(gblEditingBookingID, 0); Set(gbl_UI_Book_Modal, false)` (no else-arm comma). Same insertion, site name `wizard-btnback-cancel`.

- [ ] **Step 5: `btnDiscardBooking.OnSelect`** — ends `…Set(gblEditingBookingID, 0); Set(gbl_UI_Book_Modal, false)`. Same insertion, site name `wizard-discard`.

- [ ] **Step 6 (BUG-14): WITHDRAWN in Task-8 review.** The audit's premise ("on the host's error path the modal stays open") is false — all three creation hosts close the modal unconditionally ("close the modal on all branches"), so guarding the resets on `gbl_Book_SubmitResult <> "error"` only creates stale control state (on-behalf toggle, title, repeats) that leaks into the next open, since host open-sites cannot `Reset()` controls inside the component. The post-submit resets stay UNCONDITIONAL (comment updated to record why). BUG-14's real fix — hosts keeping the modal open on error — is a host-behavior UX change, moved to the follow-on plans. Original (rejected) step for the record:

```
                              /* Host closes the modal on both outcomes; clear transient wizard state. */
                              Reset(drpRepeats);
                              Reset(drpOccurrences);
                              Reset(tglPrivate);
                              Reset(tglBookOnBehalf);
                              Reset(drpBookFor);
                              Set(varBookForEmail, "");
                              Set(varBookForName, "");
                              Reset(txtBookingTitle);
                              Set(varTitleTouched, false);
                              Set(gbl_UI_Book_CancelConfirm, false)
                          );
```

After:

```
                              /* BUG-14: on the host's "error" outcome the modal stays open —
                                 keep the user's inputs. Hosts set gbl_Book_SubmitResult
                                 synchronously inside OnSubmit()/OnSubmitEdit() above. */
                              If(
                                  gbl_Book_SubmitResult <> "error",
                                  Reset(drpRepeats);
                                  Reset(drpOccurrences);
                                  Reset(tglPrivate);
                                  Reset(tglBookOnBehalf);
                                  Reset(drpBookFor);
                                  Set(varBookForEmail, "");
                                  Set(varBookForName, "");
                                  Reset(txtBookingTitle);
                                  Set(varTitleTouched, false);
                                  Set(gbl_UI_Book_CancelConfirm, false)
                              )
                          );
```

- [ ] **Step 7: Acceptance.** `node tools/pa-lint/lint.js --src <scratch-dir>` — L6 (D4) checks the RESET-SITE registry; all four new sites must pass. Grep: `grep -c "RESET-SITE\[wizard-" <scratch>/Components/cpt_Modal_.pa.yaml` → `4`.

- [ ] **Step 8: Commit**

```bash
git commit -am "fix(wizard): clear-on-close at all four close paths, outcome-guarded resets (BUG-13 BUG-14 D4)"
```

---

## Task 9: Publish, verify, close (PUBLISHER ONLY — P6)

**Files:** none new. Requires `guard.sh lock`, a co-attached human Studio session (P7 — see memory: unsaved Studio edits silently revert), and all Task 1–8 commits present.

- [ ] **Step 1: Full gate locally**

Run: `node tools/pa-lint/lint.js --src <scratch-dir>` → `0 error(s)`.
Run: `node tools/pa-schema-validate/validate.js --src <scratch-dir>` → clean.

- [ ] **Step 2: Acquire lock + publish.** `"C:/Program Files/Git/bin/bash.exe" tools/canvas-guard/guard.sh lock`, then `compile_canvas(directoryPath: <scratch-dir>)`. The guard preflight re-syncs and blocks on freshness/lint (P1/P3). If blocked: read the reason, re-sync, re-apply, never retry unchanged.

- [ ] **Step 3: Rung 3 marker greps.** Fresh `sync_canvas` into a *second* scratch dir; `node tools/pa-lint/lint.js check-markers` against it (expect the four `RESET-SITE[wizard-*]` markers, `BookingsWindow`, `colFreshRoomBookings` to echo back). Record: `guard.sh verified "rung 3 marker greps"`.

- [ ] **Step 4: Rung 4.** `pac-verify` per its README (catalog-based, fork-immune). Record the rung.

- [ ] **Step 5: App Checker regression (P10 signal).** `get_appchecker_errors` via MCP; then `node tools/sarif-diff/sarif-diff.js` against `docs/APP-CHECKER-BASELINE.md`'s committed baseline. Expect: `CollectDelegatableDataSource` count ≤ 15 (should drop), zero NEW issue classes.

- [ ] **Step 6: Human save in Studio (rung 5, P7).** Harry saves the version in the co-attached Studio session; then run the Task 3 two-browser race check and the Task 7 chip/past-slot/now-line checks in the published player (rung 6).

- [ ] **Step 7: Close out (P4/P5).** Post-publish re-sync → commit any server normalization as `chore(sync): post-publish normalization`; push the branch; `guard.sh unlock`.

```bash
git push -u origin fix/audit-phase1
```

---

## Self-review notes (done while writing)

- **Type/name consistency:** `BookingsWindow` (Tasks 2, 4), `colFreshRoomBookings` (Task 3), `colOverlappingBookings` shape unchanged (Task 3 ↔ existing consumers), `_results`/`Value` boolean column (Task 4 both sites), `WizardStep1` constant exists in App.Formulas (Task 8).
- **Order dependency:** Task 4's Before blocks show `BookingsWindow` because Task 2 ran first. Task 3's `ID <> gblEditingBookingID` client-side filter preserves the edit-mode exclusion in both gates.
- **Known-trap checks:** no Rectangle `Radius*` introduced (memory: compile rejects); no controls re-parented or renamed (memory: re-parenting loses properties — relevant to Phase 2's screen split, not here); all multi-line formulas stay `|-` block scalars (Y1).
- **Not fixed here, by design:** BUG-10a (occurrences 2..N pre-submit warning — UX change), BUG-10c (Rooms reports clash-as-success to the host), BUG-11/12 (Find grid build), BUG-15–21, BUG-23/24 — see below.

## Follow-on plans (write each with a fresh sync + its own anchors)

1. **Phase 2 — performance program** (audit items 2, 6, 7): replace post-mutation `Refresh`+re-collect with local `Patch`/`UpdateIf` mirrors (PERF-1/6); split the Rooms timeline into its own screen — **every moved control must be recreated under a NEW name** (memory: re-parented controls publish default-constructed and render black; Y6 names are app-global) (PERF-3); precompute slot strips in `RoomsBrowseBase`/`RoomOccupancyToday` and batch `Collect(target, ForAll(...))` (PERF-4/5).
2. **Phase 3 — state hygiene** (audit items 9, 10): kill `bdmBtnChangeTime`'s 15-variable grab via component Input/Output properties (STATE-2); revisit-reset policy + `gbl*/ctx*/col*` naming sweep (STATE-3/4); wire-or-delete dead component inputs (BUG-20, STATE-5).
3. **Phase 1b — small bugs sweep:** BUG-11 (self-referential `ClearCollect(colFindRows, SortByColumns(colFindRows, …))`), BUG-12 (sort before gap derivation), BUG-15 (`varNextFreeSlot` unsorted LookUp), BUG-17 (series re-time date semantics), BUG-18 (IfError on entry reads), BUG-19 (Profile settings patch base), BUG-21 (case normalization), BUG-24 (double-encoded `&amp;`).
4. **Additions from Phase-1 execution reviews (2026-08-02):**
   - BUG-14 real fix: hosts keep the modal open on `"error"` + guarded resets + host-side control resets (audit premise "modal stays open" was false; see Task 8).
   - Dead `_isWeekend` branches in Home/Find/Rooms OnSubmit (unreachable after the Task-6 weekend shift) — remove or mark legacy-only.
   - Duplicate warning toast in bookingDetail's stuck fix-cycle case ("Slot still busy…" + "No further clashes…" back to back).
   - Per-row failure aggregation on the series-EDIT path (cancel paths got it in Task 4).
   - `bookingDetail.OnSubmitEdit` never sets `gbl_Book_SubmitResult = "error"` on its failure branches.
   - `_runEnd` day-end fallback in Rooms should reference `Timeline_DayEnd` instead of recomputing it.
   - `btnTLFree` disabled-state styling (no DisabledFill/DisabledColor — check in Studio).
   - Timeline browsing beyond the window shows "all free" (unbounded date pickers vs BookingsWindow); real fix = EndDate bound on `dtpBookingDate` and the timeline date pickers.
5. **From the final whole-implementation review (2026-08-02):**
   - Split authorization model: single-occurrence cancel has NO ownership gate while series cancel now does — same modal, two rules; on-behalf creators can no longer series-cancel their own on-behalf series (confirm intended). Phase-3 item.
   - `conTLPick` selection block renders clipped when the selection crosses the hour row (`Height = varTLSelMinutes * 2` inside a row-height container) — visual only, booking data correct.
   - `varNextFreeSlot` still reads the snapshot while `varConflict` in the same formula is fresh — the conflict banner can suggest a just-taken "next free" slot.
   - Comment overstatement in App.pa.yaml: delegation moves filtering server-side but does not lift ClearCollect's row cap (>2000 in-window rows still truncate).
   - Remaining un-cleared wizard-adjacent globals on close: `gbl_UI_ScopePrompt`, `gbl_PendingStart`, `gbl_PendingEnd`.
   - **Rung-6 player checks (required):** (a) cancel a series and confirm the list updates without navigating away (With-record eagerness + ForAll-over-live-query); (b) Rooms timeline: room → View timeline → slot → Book → close → slot → Book → Continue enabled, header still names the room.
   - **Task 9 Step 5 (required):** App Checker diff must specifically confirm NO new delegation warnings on the four new `Filter(Book_Bookings, …)` sites (`_occ.…` comparands) — the only remaining way BUG-1/2 could silently still be live.
