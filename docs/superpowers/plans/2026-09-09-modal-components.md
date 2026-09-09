# Modal Components — Implementation Plan

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

## Deliberately not in this plan

| Item | Why |
|---|---|
| Splitting `cpt_Modal_` (121 controls, 2854 lines) | The booking wizard is the app's most load-bearing component and the one with the known `OnSubmit` evaluation-order trap. It deserves its own plan, not a subtask. |
| Retiring `cpt_Modal_`'s custom properties | Same reason. DM1 stops the bleeding by not adding more. |
| `RoomsTimeline` / `Find` timeline consolidation | Two timeline surfaces with shared engine code — a real question, but a different one. |
| B-5 (`RoomID` allocation) | Still open from the room-facilities pass. Unrelated. |
