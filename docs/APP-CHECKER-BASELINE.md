# App Checker baseline — NOT YET ESTABLISHED

> ## ⚠ 2026-09-09 — the repo was bound to the wrong app
>
> The environment holds **two** canvas apps with near-identical names:
>
> | App | ID | Last modified |
> |---|---|---|
> | `MOC_Booking_Tool_Production` | `a5fe0780-88fa-4bc5-9e55-5a2e9850ecda` | 20 hours ago — **live** |
> | `MOC_Booking_Tool` | `498d4962-0b5f-4990-a400-1bf5de9a367c` | 1 month ago — stale |
>
> Every live-facing config in this repo named the **stale** app. `.pac-verify.conf` in
> particular means **`pac-verify` — rung 4 of the verification ladder — has been validating the
> wrong app** for up to a month. Any "rung 4" claim recorded in that window is void and should be
> re-earned, not trusted.
>
> Repointed 2026-09-09: `.pac-verify.conf`, `README.md`, `docs/audit/01-CURRENT-PICTURE.md`, and
> this file. Historical plans under `docs/superpowers/plans/` keep the old ID deliberately — they
> are a record of what was true when they ran.
>
> **App Checker count at 2026-09-09 21:2x** (`get_appchecker_errors` on the live app, not a SARIF
> export): **19 issues** — all Medium / Performance, 0 High, 0 errors. Up from 15 at Phase 0.
> The delta is `CollectDelegatableDataSource` and `ForAllWithMutation` sites added by the Admin,
> AdminSettings and Battle-Rhythm work. Still not a baseline: `sarif-diff` needs a real SARIF
> export, so **P10 remains unenforced.**

`sarif-diff` enforces RULES **P10** ("App Checker issues never increase") by diffing the current
App Checker SARIF against a committed baseline. **There is no baseline in this repo yet.**

Consequence: **P10 is currently unenforced.** `sarif-diff` has nothing to diff against, so no
deploy can be blocked on new App Checker issues.

To establish it, export App Checker results for app
`a5fe0780-88fa-4bc5-9e55-5a2e9850ecda` and commit them as `sarif-baseline.json` at the repo root,
then confirm the gate has teeth:

```bash
node tools/sarif-diff/sarif-diff.js --baseline sarif-baseline.json --current AppCheckerResult.sarif
```

Recorded at install (toolkit 84cfd20, 2026-07-29) so the gap is visible rather than assumed
covered. The first deploy should establish the baseline.

## Phase 0 snapshot (2026-07-30, `get_appchecker_errors` via MCP — not a SARIF export)

Post-publish state of the Phase 0 baseline (commit `aad0ea8`): **15 issues, all Medium /
Performance, 0 High, 0 errors.**

| Rule | Count | Sites |
|---|---|---|
| CollectDelegatableDataSource | 7 | App.OnStart ×2, btnConfirmCancel, cpt_Modal__book.OnSubmit, __book_detail.OnSubmitEdit, __book_find.OnSubmit, __book_rooms.OnSubmit |
| ForAllWithMutation | 5 | btn_LoadTimeline, btnLoadFindBookings, cpt_Modal__book/__book_find/__book_rooms OnSubmit |
| CollectingReadOnlyTable | 2 | App.OnStart (colRooms, colBookings) |
| UnusedVariables | 1 | Rooms.varShowDatePicker |

These are inherent to the snapshot-collection architecture (`ClearCollect(colBookings, …)`) and
the per-occurrence `ForAll`+`Patch` create pattern — candidate refactors for a later phase, not
Phase 0 defects. The SARIF-file baseline for `sarif-diff` still needs a Studio App Checker
export on the first production pack; until then this table is the comparison reference.

## Phase 1 snapshot (2026-08-02, `get_appchecker_errors` via MCP — not a SARIF export)

After the audit phase-1 publish (branch `fix/audit-phase1`, HEAD 32458d1): **14 findings, all
Medium/Performance** (down from 33 in the 2026-07-31 audit):

- `CollectDelegatableDataSource` ×1 (App.OnStart `colRooms` only — was ×15; every `colBookings`
  pull now goes through the filtered `BookingsWindow` named formula)
- `CollectingReadOnlyTable` ×4 (App.OnStart mock seeds ×2 — pre-existing; `btnConfirm`
  `colOverlappingBookings` and `btnScopeSeries` `colSeriesServerRows` — new instances of the
  pre-existing rule class, introduced by the delegation-clean materialize-then-refine pattern)
- `ForAllWithMutation` ×8 (same rule set as the audit; the three host OnSubmit pre-pass
  `ForAll`+`Collect` loops fold into properties already flagged for Patch-in-ForAll)
- `ScreenHasManyControls` ×1 (Rooms 352 — pre-existing, addressed by the Phase-2 screen split)

No new rule class. The SARIF baseline is STILL not established — export App Checker results from
Studio and commit as `sarif-baseline.json` to give P10 teeth.
