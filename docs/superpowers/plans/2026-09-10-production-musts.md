# Production MUSTs — Implementation Plan

**Execute with: `orchestrator-coding`** — never a superpowers execute skill.

**Budget:** 12 dispatches, ≤1.0M subagent tokens. 1.5× either (18 dispatches / 1.5M) → STOP and
report. Phase 2 is a separate budget, not an extension of this one.

**Source:** the 16 MUST rows in `docs/reviews/2026-09-10-production-readiness-actions.md`, produced
by a parallel six-reviewer session at 21:47 against `2718a70`.

**Base:** live == `Src` at `3ce7466`, 17 files, 7 screens. **One sync, one base, handed to every
worker** (O-rules) — workers who sync independently produce diffs that will not compose.

---

## The review is stale in one specific way

It was written **before M5 deleted `bookingDetail`**. Four rows (M-08, M-11, M-13, and part of
M-16) anchor on `bookingDetail.pa.yaml` line numbers that no longer exist. Their *defects* may
still be live in `cpt_BookingDetailModal`, which now owns those write paths — or may have died with
the screen. **Dispatching an implementer against those anchors would produce garbage.** T0 re-scopes
them first.

Already closed, do not re-do:
- **M-03** — both halves. `gbl_FixCycleSeriesID` seeded (`4e59bba`/`0243331`), and the
  `gbl_UI_CancelSeriesConfirmID` disarm shipped as `M-03b` (`2ede03a`).

Unverified, treat as suspect until T0 confirms:
- **M-06** — the cited `Weekday(RecurAnchorStart) = 7` gate on `adRecBtnDay6_pbm` did not match the
  code when spot-checked. Either the anchor drifted or the finding is wrong.

---

## Ground rules (rule IDs — see `docs/RULES.md`; do not restate)

- **Process:** P1–P10, O1–O3. Workers lint, never compile, never commit.
- **Authoring:** Y1, Y2, Y3, Y4, Y6, Y7, Y8, Y9, **Y10 (new — `""` gates need an `App.OnStart`
  seed; lint L9 enforces it)**.
- **DS1:** no raw hex outside the token block.
- **Semantics:** series-edit rules are **settled** — see the plan-level note in
  `2026-09-09-modal-components.md`. "Whole series" is future-only. Do not redesign it.

---

## Workstreams — grouped by FILE OWNERSHIP, not by MUST id

`App.pa.yaml` is touched by M-05, M-08, M-09, M-10, M-14, M-15; `cpt_Modal_` by M-04, M-05, M-13,
M-15. Grouping by MUST id would put several workers in the same file. Groups below own files
exclusively; groups touching a shared file are **serialized**.

| WS | Owns | MUSTs | Lane | Risk |
|---|---|---|---|---|
| **T0** | nothing (read-only scout) | re-scope M-08/M-11/M-13/M-16, verify M-06 | scout | — |
| **T1** | orchestrator self-edit | M-01, M-02, M-14 | trivial | each ≤2 files / ≤20 lines / no new logic |
| **T2** | `cpt_RoomEditModal`, `cpt_PermanentBookingModal`, `cpt_AdminSettingsModal` | M-12, M-06 | high-risk | `Risk: high` — input-state bleed already corrupts saves (edit A → cancel → edit B writes A's values onto B) |
| **T3** | `Admin.pa.yaml` | M-07 | high-risk | `Risk: high` — admin cancel is a one-click destructive write on another user's booking, and rewrites ownership |
| **T4** | `cpt_Modal_.pa.yaml` | M-04, M-13 | high-risk | `Risk: high` — M-04 writes fewer occurrences than the preview promises; M-13 silently discards a privacy toggle |
| **T5** | `App.pa.yaml` + pull sites | M-09 | novel | **probe compile** — one shared pull trigger is new wiring |
| **T6** | `App.pa.yaml`, `cpt_Modal_` | M-15, M-05 | batched | after T4 and T5 (shared files) |
| **T7** | modal + screens | M-08, M-11 | high-risk | `Risk: high` — series clash-checking against incomplete data; scope per T0 |
| **T8** | `Home/Find/Rooms/RoomsTimeline/myBookings` + modal | M-16 | novel then batched | **probe compile the first copy alone** — the one rewrite with delegation-warning risk |
| **T9** | `App.pa.yaml` + SharePoint | M-10 | deferred | `L` effort, needs SharePoint indexes — **Phase 2, not this budget** |

**Serialization:** T0 → T1 → {T2, T3, T4 parallel} → T5 (probe) → T6 → T7 → T8 (probe) → T9 next phase.

---

## Task T0: Re-scope the stale rows ⚠ SCOUT, GOES FIRST

**Lane:** scout (read-only). **Model:** opus-low. **Files:** none — reports only.

- [ ] For each of M-08, M-11, M-13 and M-16, determine whether the defect is still live now that
  `bookingDetail` is gone, and if so give the **current** file + control-name anchors.
- [ ] Verify M-06 against the actual code; report the correct anchor or that the finding is wrong.
- [ ] Report anchors by control name and quoted code, never line numbers (O3).

## Task T1: Un-hide the two dead entry points, fix AdminEmails

**Lane:** trivial (orchestrator self-edit). **MUSTs:** M-01, M-02, M-14.

- [ ] M-01 `btnFindSlot_f3` — drop `Visible: =false`. It is the only control that selects a slot,
  so the selection bar, Continue, the wizard instance and week→day drill-down are all unreachable
  while the legend says "click to book".
- [ ] M-02 `btn_Header_Avatar` — `DisplayMode.View` → `Edit`. It carries the app's only
  `Navigate(Profile)`, so theme, defaults, favourites and report-a-problem are unreachable.
- [ ] M-14 — drop the personal-domain address from `AdminEmails`, keep the org-domain bootstrap.
- [ ] **Both un-hides activate never-exercised flows.** Rung 5 is mandatory before the save:
  book a slot from Find end-to-end, and open Profile and change a setting.

## Tasks T2–T8

Specs are written at dispatch time from T0's output, using the task-spec template. Lanes and risk
above are **decided here and not re-litigated at dispatch**.

## Task T9: Narrow `BookingsWindow` — PHASE 2

**Deferred deliberately.** `L` effort, and it needs SharePoint indexes on `SeriesID` and
`StartDateTime` plus a decision on the render window. M-09 (the cap guard) makes the current
window safe to keep in the meantime; M-10 is the durability fix, not an emergency.

---

## Deliberately not in this plan

| Item | Why |
|---|---|
| The 38 SHOULD and 24 COULD rows | MUSTs first. Re-triage after, against a live app that has moved. |
| M6 (shared confirm) from the modal plan | Now actionable but it is consolidation, not a production risk. |
| Scoping lint L6 per marker | Real gap (D4 is toothless, `statefulVars: []` yields 148 errors if populated) but it is a tool change, not app work. |
| A SARIF baseline for P10 | Needs a Studio-side App Checker export; cannot be produced from this session. |
| Retiring the `user-settings-writes` contract entry | Evidence says the site moved to prod form, but retiring it asserts deployment state. |
