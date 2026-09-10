# Modal Components — Implementation Plan

> ## STATUS 2026-09-09 — M0–M3 shipped, M4 partial, M5–M6 NOT DONE
>
> | Task | State |
> |---|---|
> | M0 probe | ✅ PASS both directions, rung 5 |
> | M1 room form → `cpt_RoomEditModal` | ✅ **Verified at rung 5 in preview** — opened on Boardroom, seeded title/capacity and pre-selected the Screen + VC chips from `"Screen;VC"` via `fnHasTag` |
> | M2 `AdminPermanentNew` → modal + screen deleted | ✅ compiled, rung 3 |
> | M3 `AdminSettings` → modal + screen deleted | ✅ compiled, rung 3 |
> | **M3.5 `cpt_SeriesMigrationModal`** | ✅ **unplanned — see below** |
> | M4 scope-following port | ⚠️ **PARTIAL — cancel branch only** |
> | M5 retire `bookingDetail` | ❌ **NOT DONE — blocked, see below** |
> | M6 shared confirm | ❌ NOT DONE (was sequenced after M5) |
>
> **Numbers.** Admin **127 → 117** controls. Screens **10 → 8**. Components **4 → 8**.
> App Checker **19 → 19** with `ScreenHasManyControls` on Admin **eliminated** — that was M1's
> acceptance test. It transiently hit 23 while both old screens and new components existed;
> every extra was a duplicated handler and they cleared on deletion.
>
> ### The plan missed a whole pane
> `AdminSettings` had a **third** body section, `asMigConCard` — a legacy-series migration tool
> that patches `Book_Bookings`. I scoped the screen from its two obvious panes. `Book_Bookings`
> still holds **two rows in the old `"Weekly"` format**, so deleting that screen as planned would
> have destroyed the only tool that can convert them. It became `cpt_SeriesMigrationModal`, with
> its dry-run-then-confirm safety flow intact.
>
> ### Why M5 is not done, and what it needs first
> **`bdmBtnChangeTime` in the modal is `Visible: =false`.** The modal has no reachable change-time
> affordance, and no `gbl_UI_ScopePrompt = "edit"` equivalent. So M4 ported only the **cancel**
> branch of `btnScopeFollowing` — porting the edit branch would have added a path nothing can
> trigger. **Retiring the `bookingDetail` screen right now would remove "change time" from the app
> entirely.** M5 must be preceded by a task that makes `bdmBtnChangeTime` reachable and ports the
> edit-scope prompt. That was not in this plan and is not a safe thing to improvise.
>
> ### Components have no `OnVisible` — every reset moved to the open trigger
> The retired screens reset state on entry. Those resets now live in Admin's open handlers:
> collection seeding for the room form, `ClearCollect(colAppSettings, …)` for settings,
> scan/confirm clearing for migration, and the `Set(gblRecurMode, "permanent")` seed that
> `RecurAnchorStart` / `RecurRoomId` / `RecurClashCount` gate on. Miss one and the modal opens
> stale. This is the sharpest edge in the whole pattern.
>
> **Budget:** 6 dispatches, ~1.16M subagent tokens against a 1.0M ceiling — over, though under the
> 1.5× stop line. M5 + its prerequisite would have crossed it.

> **Execute with: `orchestrator-coding`** — never a superpowers execute skill. Steps use checkbox
> (`- [ ]`) syntax for tracking. Lanes are declared per task below and are not re-litigated at
> dispatch time.

**Budget:** 10 dispatches, ≤1.0M subagent tokens. 1.5× either → STOP and report.

**No separate spec.** The previous pass needed one because it introduced a data model. This pass
extends a pattern the app already ships (`cpt_Update`, `cpt_BookingDetailModal`), so the design
decisions are short enough to live here as DM1–DM5.

**Goal:** move surfaces that behave like dialogs out of screens and inline panes into global-driven
modal components, and collapse booking detail onto one surface.

---

## Why — the measured picture (2026-09-09, git `7636f56`)

| File | Controls | Lines | Inbound `Navigate` |
|---|---|---|---|
| **Admin** | **127** | 2583 | 4 |
| `cpt_Modal_` | 121 | 2854 | — component |
| **AdminSettings** | **71** | 1636 | **1**, from Admin |
| **AdminPermanentNew** | **45** | 1015 | **1**, from Admin |
| `cpt_BookingDetailModal` | 42 | 1052 | — component |
| **bookingDetail** | 32 | 1398 | 4 |

Admin is the only screen App Checker flags — `ScreenHasManyControls`, complexity **314** against a
300 threshold. The cause is structural: Admin has four sibling tabs, **three of them inline panes
and one a separate screen**, and every tab's controls exist in the tree simultaneously.

`AdminSettings` and `AdminPermanentNew` are each entered by exactly one `Navigate`, from Admin, and
return to it. They are Admin's dialogs wearing screen costumes.

## Design decisions

### DM1 — Global-driven components, **zero custom properties**

`cpt_Update` and `cpt_BookingDetailModal` both declare `AccessAppScope: true`, no
`CustomProperties`, and communicate entirely through globals. A screen instance is three lines.
Every component in this plan follows that shape, for two reasons:

- **Y3** makes new component custom properties Studio-first. Zero custom properties means the whole
  pass is authorable through the MCP.
- `cpt_Modal_` is the only component using a custom **Event** property (`OnSubmit`), and that is
  precisely the evaluation-order trap already diagnosed in the series spec. Do not add more of them.

### DM2 — One boolean global per modal, named `gbl_UI_<Name>_Modal`

Matching `gbl_UI_Book_Modal`, `gbl_UI_Detail_Modal`, `gbl_UI_Update`. **Y2:** every one needs a
`Set()` site in `App.OnStart`. Selection context (which room, which booking) travels in its own
global, as `adRmSel` does today.

### DM3 — The instance is the last child of the screen

So it paints above the page. Existing instances already do this (`cpt_Modal__book_rooms` is the
final child of `Rooms`). Scrim + card sizing copies `cpt_Update` verbatim.

### DM4 — Component *definitions* are the probe risk

**Y7 is explicit that a pushed control can validate, echo back on sync, and never materialise, and
that new-control existence is only provable in Studio's tree view (rung 5).** Whether
`compile_canvas` can create an entirely new `ComponentDefinition` — as opposed to editing an
existing one — **is unproven in this repo**. Every component here was created in Studio before it
was ever edited as YAML.

**This is the whole plan's load-bearing assumption and M0 exists to test it before anything else
is built.** If it fails, every task below changes shape: the component shell gets created in
Studio by hand first, and workers only fill it in.

### DM5 — Retiring a screen is a two-step, never one

Port the missing behaviour into the target surface and compile it **first**; delete the screen in a
**separate** commit. Never in the same change — a screen deletion is the one edit in this repo that
cannot be recovered by re-syncing, because the server no longer has it.

---

## Ground rules (rule IDs — see `docs/RULES.md`; do not restate)

- **Process:** P1–P10. O1 (workers lint, never compile/commit), O2, O3.
- **Authoring:** Y1, Y2 (DM2), **Y3 (no custom properties — DM1)**, Y4, **Y6 (control and
  component-instance names are app-global; every one fresh)**, Y7 (DM4), Y8, Y9.
- **DS1:** no raw hex outside the token block.
- **Anchors (O3):** by control name and quoted code, never line numbers. Re-anchor against a fresh
  sync; missing anchor → STOP and report drift.
- **MCP parameter casing:** `connect` is snake_case; `sync_canvas` takes `directoryPath` and
  `get_data_source_schema` takes `dataSourceName`, both camelCase. Per-tool, never generalised.

---

## Task M0: Probe — can `compile_canvas` create a new component at all? ⚠ PROBE

> ### ✅ VERDICT: PASS, both directions — 2026-09-09 23:0x, rung 5
>
> **Create.** `Src/Components/cpt_ProbeDelete_.pa.yaml` (`AccessAppScope: true`, zero custom
> properties, one Rectangle) → pa-lint clean → `compile_canvas` **PASSED, 17 files** → echoed back
> on a fresh sync → **appeared in Studio's Components tab with its child control `probeRect_m0`.**
> That last step is the one Y7 demands and the only one that counts.
>
> **Delete.** File removed → `compile_canvas` **PASSED, 16 files** → absent from a fresh sync →
> **gone from Studio's Components tab.** Deleting through the directory works, which is what M2b,
> M3b and M5 depend on.
>
> **DM4's assumption holds. The plan proceeds as written — no Studio-first shells needed.**
>
> **Watch item:** the create round-trip silently dropped `Height: =100` from the Rectangle, the
> same normalisation class as `Visible: =true` (nine of those came back in the P5 reconcile just
> before this probe). The server strips properties it considers default. Harmless here, but expect
> it on every component push and do not mistake it for a lost edit.

**Lane:** novel. **Risk: high** (invalidates the plan if it fails). **Files:** one throwaway component.

- [ ] Fresh sync into a new scratch dir. Reconcile `Src/` (P5).
- [ ] Add a minimal `ComponentDefinitions` entry — `cpt_ProbeDelete_` — with `AccessAppScope: true`,
  no custom properties, one Rectangle. Instance it on no screen.
- [ ] pa-lint, then **orchestrator compiles alone**.
- [ ] **Rung 5 is mandatory here, not optional:** open Studio's Components tab and confirm the
  component actually exists. Y7 says validation and sync echo are not proof.
- [ ] Delete it, compile, confirm gone. Record the verdict in this file.
- [ ] **If it fails:** STOP. Re-plan with Studio-first component shells.

## Task M1: Admin room form → `cpt_RoomEditModal`

**Lane:** high-risk (data-mutation path). **Files:** new component, `Admin.pa.yaml`, `App.pa.yaml`.

The 15 controls of `adRmConForm` are already a modal in everything but implementation — hidden by
`Visible: =adRmShowForm`, sitting in the tree at all times. Lifting them out takes Admin from 127
controls to ~112, which should clear the 300 complexity threshold this pass pushed it over.

- [ ] New `cpt_RoomEditModal`: the whole `adRmConForm` subtree, driven by `gbl_UI_RoomEdit_Modal`
  and the existing `adRmSel`.
- [ ] `adRmShowForm` (a screen context var) becomes `gbl_UI_RoomEdit_Modal` (a global) — a component
  cannot read screen context. Both `adRmBtnEdit` and `adRmBtnNew` set it.
- [ ] **Carry both `// RESET-SITE[adrm-form]` seeding sites across intact**, including the
  `colAdRmSystems` / `colAdRmEquip` seeding. This is where the conversion is most likely to
  silently break: collections have no `.Default`, so seeding is explicit and easy to drop.
- [ ] **Preserve verbatim:** the `IfError` wrapper, the BOOK-5 error branch that leaves the form
  open with the admin's input, and the `ClearCollect(colRooms, Book_Rooms)` mirror.
- [ ] Verify `ScreenHasManyControls` on Admin is **gone** after this task — that is the acceptance
  check, not a hope.

## Task M2: `AdminPermanentNew` screen → `cpt_PermanentBookingModal`

**Lane:** high-risk (create-booking write path). **Files:** new component, `Admin.pa.yaml`,
`AdminPermanentNew.pa.yaml` (deleted in M2b), `App.pa.yaml`.

- [ ] **M2a:** port the 45 controls into the component, instanced on Admin, driven by
  `gbl_UI_PermanentNew_Modal`. Replace `Navigate(AdminPermanentNew, ...)` with the global.
  Compile and verify at **rung 5** that the modal works.
- [ ] **M2b — separate commit (DM5):** delete the screen. Confirm zero remaining `Navigate` and
  zero references to its control names first.

## Task M3: `AdminSettings` screen → `cpt_AdminSettingsModal`

**Lane:** high-risk (settings write path + the AdminEmail list governs `IsAdmin`).
**Files:** new component, `Admin.pa.yaml`, `AdminSettings.pa.yaml` (deleted in M3b), `App.pa.yaml`.

Harry chose conversion over leaving it a screen, making all four Admin tabs consistent. **Trade-off
recorded honestly:** 71 controls is a large modal, and this moves weight into a component instanced
on Admin rather than removing it from the app. If M1 + M2 do not leave enough headroom under the
complexity threshold, M3 may need the split-in-two variant instead — decide with the number in
hand after M2, not now.

- [ ] **M3a:** port, instance, drive with `gbl_UI_AdminSettings_Modal`, compile, rung 5.
- [ ] **M3b — separate commit (DM5):** delete the screen.
- [ ] Watch the `asBtnSave` multi-`Patch` block and the `adSetGalAdmins` add/remove handlers — an
  admin locking themselves out is the worst failure mode on this screen.

## Task M4: Port "this and following" into the booking detail modal ⚠ BLOCKS M5

**Lane:** high-risk. **Reviewer runs.** **Files:** `Components/cpt_BookingDetailModal.pa.yaml`.

**The two booking-detail surfaces have drifted in both directions:**

| | bookingDetail screen | cpt_BookingDetailModal |
|---|---|---|
| Fields | Room, Date, Time, By | Date, Time, **Duration**, By, Room, **Series** |
| Status | badge | badge + **"starts in"** |
| Cancel scope | Just / **Following** / Series / Back | Just / Series / Back |

`"following"` appears **4 times in the screen and 0 times in the modal**. The screen also carries
the `gbl_UI_ScopePrompt` edit/cancel prompt the modal has no equivalent of. Each surface has also
needed its own privacy fix — BOOK-3 on the modal, BOOK-7 on the screen — which is the drift cost
already being paid.

- [ ] Port `btnScopeFollowing` and its handler into the modal as `bdmBtnScopeFollowing_mc`.
- [ ] Port the `gbl_UI_ScopePrompt` edit/cancel prompt behaviour.
- [ ] **Acceptance is behavioural, not structural:** cancelling "this and following" from the modal
  must affect the same set of occurrences as the screen does today. Verify against a real series
  before M5 is dispatched.

## Task M5: Retire the `bookingDetail` screen

**Lane:** high-risk. **Reviewer runs.** **Files:** `myBookings.pa.yaml`, `RoomsTimeline.pa.yaml`,
`Admin.pa.yaml`, `Components/cpt_BookingDetailModal.pa.yaml`, `bookingDetail.pa.yaml` (deleted).

**Do not start until M4 has compiled and been verified at rung 5.**

- [ ] Repoint all four `Navigate(bookingDetail, ...)` sites — in `myBookings`, `RoomsTimeline`,
  `Admin`, and **inside `cpt_BookingDetailModal` itself** (its "open full detail" link, which
  becomes meaningless) — to open the modal instead.
- [ ] The screen hosts a `cpt_Modal__book_detail` wizard instance for "change time". Confirm the
  modal's change-time path still reaches the wizard from whichever screen hosts it.
- [ ] **Separate commit (DM5):** delete the screen only once every reference is gone and compiled.

## Task M6: One shared confirm dialog

**Lane:** batched. **Files:** new component, `myBookings.pa.yaml`, `App.pa.yaml`.

Ad-hoc confirms exist in at least two places: `myBookings`'s cancel-series confirm
(`gbl_UI_CancelSeriesConfirmID`, three `Visible` sites **inside a gallery template**, so the confirm
state is per-row) and the confirm rows inside the booking-detail surfaces.

- [ ] **Sequence this last on purpose:** M4 and M5 change what confirms remain. Take the inventory
  *after* they land, then build `cpt_Confirm` against what is actually left.
- [ ] A confirm rendered inside a gallery template is the specific smell to remove — it duplicates
  per row and cannot overlay the page.

## Task M7: Close out

- [ ] `get_appchecker_errors` — **`ScreenHasManyControls` on Admin must be gone.**
- [ ] Screen and component control counts re-measured against the table at the top of this file.
- [ ] Record the verification rung with `guard.sh verified` (P8) and commit (P4/P5).

---

## bdmFooter blocker RESOLVED — 2026-09-10, rung 5

**The footer's `Visible` was never the problem.** The previous pass chased the wrong property and
declared static analysis exhausted; it was exhausted because the defect was not in that formula.

A diagnostic Label pushed into the component read the resolved values in preview:

```
FTRvis=Y FTRh=124 ACTvis=N RIGHTvis=N GRIDvis=Y CARDh=520
T1rec=Y T2notpast=Y T3notperm=Y T4mine=Y ADM=Y
ALL4=Y CM=[]
```

`bdmFooter.Visible` is **true** and all four of its terms resolve true. The footer rendered as a
**124px empty band**: `gbl_UI_Detail_ConfirmMode` had **no `App.OnStart` seed** (a Y2/DM2
violation), so it held `Blank()` rather than `""` — and **`Blank() = "" ` is false in Power Fx**.
That falsified `bdmFooterActions.Visible`, sized the footer for confirm mode via
`If(CM = "", 64, 124)`, and left the confirm/scope rows hidden too since they test for
`"confirm"`/`"scope"`.

**Why the screen never hit it:** `bookingDetail.OnVisible` runs `Set(gbl_UI_ScopePrompt, "")`.
Components have no `OnVisible` — precisely the edge this plan flagged as "the sharpest edge in the
whole pattern", missed for this one global.

**Why static analysis could not see it:** the bug is **first-open-only**. Both close handlers set a
real `""`, so the footer behaves correctly for the rest of the app session once dismissed.

**Fix (`4e59bba`):** `App.OnStart` seeds `gbl_UI_Detail_ConfirmMode` and `gbl_UI_Detail_Modal`;
the three `myBookings` open sites clear confirm state as `// RESET-SITE[detail-modal-open]` (D4),
which also fixes a stale prompt surviving nav-away-and-reopen. Verified rung 2 (compile 0 errors),
rung 3 (marker greps 4/4, byte-identical round-trip), rung 5 (probe readout above).

**Same latent defect elsewhere:** `gbl_UI_ScopePrompt` has three `= ""` comparisons and no
`OnStart` seed — safe today only because the screen's `OnVisible` covers it. If `bookingDetail`
is retired in M5, that cover disappears. Seed it as part of M5.

**Publish hazard observed:** the fix push silently dropped `PaddingTop: =32` from `con_body_home`
in `Home.pa.yaml`, **a file the push did not edit**, and a re-push of the identical directory
restored it. Marker greps would not have caught this — only a full pushed-vs-echoed `diff -rq`
did. Do that diff on every publish, not just greps.

### Change time made reachable — 2026-09-10 (`34b83b3`)

`bdmFooterRight` carried a hardcoded `Visible: =false`. Removing that one property is the whole
fix: every gate the screen applies to `btnChangeTimeDetail` is already applied by the modal's
ancestors — `bdmFooter` has the identical four-term owner/past/permanent gate, and
`bdmFooterActions` gates on `gbl_UI_Detail_ConfirmMode = ""`, which subsumes the screen's
`!varConfirmCancel && gbl_UI_ScopePrompt = ""`. Removed rather than set `=true` so the round-trip
stays byte-stable against default-stripping.

`bdmBtnChangeTime.OnSelect` was already complete and correct — it prefills the wizard and hands
off to `bookingDetail`, whose `cpt_Modal__book_detail.OnSubmitEdit` raises
`Set(gbl_UI_ScopePrompt, "edit")` for series members. Scope selection and the differential write
are intact (read, not assumed). Rung 2 compile clean, rung 3 whole-tree diff byte-identical.

**This does NOT unblock M5.** Change time now *works*, but it works **by depending on the
`bookingDetail` screen** — the handoff target, the only host of a wizard instance with a working
`OnSubmitEdit`, and the surface that owns the edit-scope prompt UI. Deleting that screen still
removes change time.

**M5's remaining prerequisite is unchanged in substance:** host a wizard instance on each screen
that opens the modal, port `OnSubmitEdit` to those instances, port the edit-scope prompt, and drop
the `Navigate(bookingDetail)` handoff. **That is exactly the work preserved on
`feat/detail-modal-selfsufficient`, whose only stated blocker was the non-rendering footer — now
fixed.** Re-evaluate that branch against current `main` rather than rewriting it; its
`OnSubmitEdit` ports were LCS-verified as pure ordered subsequences of the source.

**Seed `gbl_UI_ScopePrompt` as part of M5.** It has three bare `= ""` comparisons and no
`App.OnStart` seed, covered today only by `bookingDetail.OnVisible`. Retiring that screen removes
the cover and reproduces the exact bug just fixed on `gbl_UI_Detail_ConfirmMode`.

## M5 DONE, M6 open — 2026-09-10 end of session

**Live now carries the whole conversion.** Screens **8 → 7**; `bookingDetail` is deleted from the
server. `gbl_UI_ScopePrompt` retired with it (that screen was its sole consumer, so the seed added
earlier the same day would have become an orphan `Set` of an unread global).

**Verified:** rung 5 (all seven preview scenarios, incl. the series scope prompt and cancel from
both Admin and RoomsTimeline) *before* the deletion, per DM5. Then rung 2 (compile 0 errors, 17
files) and rung 3 (screen absent from a fresh sync, whole-tree pushed-vs-live diff byte-identical).
App Checker **19 — unchanged**: the edit path added `bdmBtnEditScopeSeries` but removing the dead
`mb2`/`ad` create bodies dropped two findings.

### Reviewer pass: what it cost and what it caught
Three parallel reviewers, ~552k subagent tokens against the plan's 1.0M ceiling. They found **two
blockers no tool in the chain could see**, both consequences of moving a screen-hosted prompt into
a component:

- series "Change time" short-circuited to the scope prompt without opening the wizard, so the
  scope buttons wrote blank times over live rows — at `k=0` that cancelled the master and inserted
  a null-time replacement, **destroying the series**;
- the wizard-raised prompt armed while the detail modal was closed, so the edit was silently
  dropped and a valid payload stayed armed for the next booking.

Plus `colSeriesEditPlan` missing the master exclusion its sibling cancel path carries (a master has
`IsException = false`, so Patching it to `"Clash"` dropped it out of `colBRMasters` and vanished
every occurrence), and destructive old-master writes not gated on the replacement insert landing.
**The reviewer pass paid for itself several times over — on this kind of change it is not optional.**

### New rule: Y10 / lint L9
`Blank() = ""` is **false** in Power Fx. L2 only asks whether a `Set()` exists *anywhere*, so this
class shipped **three times** (`gbl_UI_Detail_ConfirmMode`, `gbl_UI_ScopePrompt`,
`gbl_FixCycleSeriesID`). L9 requires an `App.OnStart` seed for any global gated on `""`, and is
regression-tested against `84fbca4`: it reports exactly those three there and zero on current `Src`.

**L6 remains toothless and `statefulVars` stays empty deliberately** — L6 demands every registered
var at every `RESET-SITE` app-wide, which yields **148 errors** on this app. Scoping L6 per marker
name is the prerequisite for giving D4 teeth.

### M6 is now actionable
Its inventory was deliberately deferred until M4/M5 landed. They have. The confirm surfaces left
are the cancel-confirm and cancel-scope rows inside `cpt_BookingDetailModal`, and myBookings'
per-row cancel-series confirm — which is a **global** gating three `Visible` sites inside a gallery
template, so it duplicates per row and cannot overlay the page. That global also had no disarm on
screen entry until `M-03b` today: an armed "Yes, cancel series" survived navigating away and back,
where one click cancelled the series.

## Series-edit semantics — SETTLED 2026-09-10 (Harry)

The question left open across four asks is closed. **"Whole series" means future-only**, matching
what the cancel path already did:

- A **started** series (master anchor in the past) **refuses** a whole-series retime and points the
  user at "This and following". Rewriting occurrences that have already happened is not wanted.
  Implemented as the third refusal on `bdmBtnEditScopeSeries`, alongside the existing room-change
  and date-change refusals. A series whose anchor is still in the future retimes normally, and
  legacy materialised series with no master row are unaffected.
- **"This and following" on a time change** keeps the ported behaviour: detach a new series from
  occurrence k, end-date the old master at `date(k) − 1` (or cancel it outright at `k = 0`), and
  cancel exceptions `>= k`. Confirmed correct, not just faithful.

Treat this as the reference for any future work on the series write paths — it is a product
decision, not something derivable from the code.

## Deliberately not in this plan

| Item | Why |
|---|---|
| Splitting `cpt_Modal_` (121 controls, 2854 lines) | The booking wizard is the app's most load-bearing component and the one with the known `OnSubmit` evaluation-order trap. It deserves its own plan, not a subtask. |
| Retiring `cpt_Modal_`'s custom properties | Same reason. DM1 stops the bleeding by not adding more. |
| `RoomsTimeline` / `Find` timeline consolidation | Two timeline surfaces with shared engine code — a real question, but a different one. |
| B-5 (`RoomID` allocation) | Still open from the room-facilities pass. Unrelated. |

---

## M4b/M4c/M5 attempt — 2026-09-10, REVERTED from production

**Production is on the pre-attempt baseline.** `Src` on `main` is byte-identical to live. The work
is preserved on branch `feat/detail-modal-selfsufficient` and must not be compiled as-is.

### What was built (and is good)
- `OnSubmitEdit` — the app's **only** working booking-edit save path, present on exactly one wizard
  instance (`cpt_Modal__book_detail`); every other instance is a `="Text"` stub — was ported to the
  `mb2` / `ad` / `tl2` instances. Verified by LCS diff: the source is a **pure ordered subsequence**
  of each port, so no row, field or ordering was altered. Two lines differ per instance: the
  mandated `gbl_UI_ScopePrompt` → `gbl_UI_Detail_ConfirmMode` swap, and the instance self-reference
  rename that `.ValidPayload` / `.PatchPayload` require.
- The modal's three edit-scope buttons, which previously ran identical bodies and wrote nothing,
  received the differential edit branches from the screen's scope buttons.
- Change-time made reachable, `Navigate(bookingDetail)` handoff removed, component instances added
  to every screen that opens booking detail.

### Why it was reverted
`bdmFooter` **does not render** — verified in Studio preview at rung 5, and confirmed structurally
(the footer is `FillPortions: =0, Height: =64` in a vertical AutoLayout; the grid absorbing its
space is exactly what an invisible sibling produces). With detail navigation repointed to the modal,
**RoomsTimeline and Admin users lost working cancel and change-time** — the screen still had them.
That regression was live and was rolled back.

### The blocker is PRE-EXISTING, not caused by this work
`git log -p` shows the footer's `Visible` was extended from
`!IsBlank(gblSelectedBooking) && !fnIsPast(...)` to its current four-term form in
**`55372a6 "fix: mask private bookings on the booking detail view (BOOK-3)"`**, before any of
today's work. Every term evaluates **true** for the booking tested (future, non-permanent — note
`MyBookings` filters `!IsPermanent` so that term always passes — owned by the caller, who is also
admin), yet the container renders hidden. Static analysis is exhausted; this needs the resolved
value read off `bdmFooter` in Studio.

**Consequence: the booking detail modal has no visible actions at all today.** Cancel is only
reachable from the myBookings list buttons, which is likely why nobody noticed.

### M5 stays blocked, M6 not started
M5 cannot proceed until the footer renders — retiring the screen while the modal shows no actions
removes cancel and change-time from the app. M6 was sequenced after M5 deliberately.

### Open product question for Harry — ANSWERED 2026-09-10
"This and following" applied to a **time change** (not a cancel) detaches a new series from
occurrence k, end-dates or cancels the old master, and cancels exceptions ≥ k. That was ported
faithfully rather than redesigned. Confirm it is the intended semantics before M5 ships.
