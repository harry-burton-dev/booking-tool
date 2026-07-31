# Wake-up report — overnight run 2026-07-31 (03:34–05:05)

## TL;DR

- **Live app**: one publish only — the reviewed **SAFE batch** (markers, contrast/visibility fixes, nav-tab sync, availability refresh). Verified **rung 3 at 05:00** (post-publish sync byte-identical to what was pushed). Nothing else touched the server.
- **Three RISKY fixes are implemented, review-gated, and parked on local branches** — never published. Each is independent (branched from the savepoint) so you can push, reorder, or drop them one at a time.
- **Restore point**: tags `savepoint/pre-overnight-20260731` = `savepoint/pre-publish-0455` (both at f67d4e4, the exact pre-publish live state). `master` is untouched.
- Full task-by-task log with timestamps and rationale: [logs/overnight-20260731.md](logs/overnight-20260731.md).

## 1. What is LIVE (published at 04:58)

Branch `overnight/20260731`, four commits, each independently revertable:

| Commit | What | Why |
|---|---|---|
| 44e0c67 | `PROD-REVERT[booking-create-home]` + 7 `RESET-SITE` markers | H-2 orphan create site; H-3 zero reset markers (comment-only, zero runtime effect) |
| 4d4324c | Find week-count contrast (was 1.07:1 white-on-light), step-2 hint shows when Next disabled, dark tokens corrected | ui-ux F-16 (CRITICAL), F-42, F-01 (dark mode verified unreachable → token-value-only) |
| 310ff6a | 4 nav routes now set `gblUI_Nav_currentTab` | F-06 header-tab desync (strings verified against Shell_Header comparands) |
| 07a5e2e | `Refresh`+`ClearCollect` on Rooms/Find/myBookings `OnVisible` | Stale-availability HIGH: colleagues' writes were invisible until you wrote something |

Verification earned: pa-lint 0 errors (rung 1), compile PASSED 10 files 0 errors (rung 2 at 04:58), post-publish byte-identical round-trip (rung 3 at 05:00). Not verified: rungs 4–6 (pac-verify, Studio, player) — **the availability-refresh commit changes runtime behavior on 3 screens; worth a 2-minute player smoke test when you're up.**

**Suggested when awake:** `git merge overnight/20260731` into `master` (fast-forward-ish; master is at f67d4e4) so git matches live again.

## 2. RISKY branches — implemented, reviewed, NOT published (your call)

All branch from `savepoint/pre-overnight-20260731`, so each applies to the pre-overnight state independently. **They do not include each other or the SAFE batch** — merging any of them into your live baseline needs a normal git merge (SAFE batch touched some of the same files; expect small, tractable conflicts).

### R1 `overnight/20260731-risky-conflict` @ b827dbf — double-booking race (C-1, CRITICAL)
Server-side clash re-check (fresh delegable `Book_Bookings` query, `fnOverlaps` inlined) at the modal confirm gate and inside every host Patch loop; clashed writes blocked with notify + snapshot refresh. Race window drops from a whole session to milliseconds. Reviewer PASS — predicate fidelity hand-verified at all 7 sites.
**Why parked:** touches every booking write path; `cpt_Modal_` now references `Book_Bookings` directly and only a compile proves the binding. Open MEDIUMs recorded in the commit body (notify chain suppresses clash message when "taken" fires; `gbl_Book_SubmitResult` says success on all-taken).

### R2 `overnight/20260731-risky-delegation` @ eba28c7 — delegation-cap time bomb (H-1)
All 11 `colBookings` collects now read a named-formula `BookingWindow` (−90d … +730d, delegable shape). **Contains a deliberate product change: new bookings can't start more than 365 days ahead** (enforced at 5 wizard validation sites, mode-aware so editing app-created far-future occurrences still works). Took 2 review retries; final PASS + off-by-one at the window edge fixed.
**Why parked:** the 365-day cap is a product decision you never made, and whether SharePoint actually delegates both bounds needs App Checker + a >500-row list.

### R3 `overnight/20260731-risky-seriescancel` @ 02db474 — hidden partial cancel (H-4)
Series-cancel now refreshes the snapshot on every path (mirrors bookingDetail's per-row `IfError` house pattern exactly). Smallest of the three; arguably safe enough to merge first.
**Why parked:** tagged RISKY by review (error-path behavior change); also the mirrored house pattern still shows a success toast after partial failure at both sites (M-11, left open deliberately).

**To push any branch live:** merge it into your working branch in git, run `node tools/pa-lint/lint.js --src Src`, then follow the normal publish loop (fresh sync check → compile). Merge in git, never by pushing stale trees.

## 3. Restore / rollback

- Point-in-time restore to pre-overnight live state: `git checkout savepoint/pre-overnight-20260731 -- Src` on a branch, then compile `Src` (guard will demand a fresh `server-now` sync first — do what it says).
- To revert only one SAFE commit: `git revert <hash>` on `overnight/20260731`, lint, re-publish.

## 4. Reviews digest (full docs in `docs/reviews/20260731/`)

- **Code review** (33: 1C/4H/12M/16L): the C/H items are all addressed by R1/R2/R3 + SAFE markers except the M/L tail (dead code, duplicated formulas, perf niggles) — all catalogued with fixes.
- **Feature review**: flows work end-to-end; biggest unaddressed items are the **Notifications facade** (Profile promises emails; nothing sends — needs a Power Automate flow or the card should say "coming soon"), disabled private/on-behalf toggles, "View week" stub, and bookable-looking dead-end slots on past/weekend days in Find.
- **UI/UX** (48: 1C/8H/22M/17L): CRITICAL + 3 HIGHs fixed in SAFE batch; remaining HIGHs are the inert Notifications panel, the no-op "Report a problem" button, and 7 more stale-tab Navigate sites (listed in reviewer output, easy follow-up).
- **Opportunities** (ranked, with first steps): 1) productize `tools/` as "CI/guard rails for Canvas Apps"; 2) content series from RULES.md/toolchain; 3) Outlook calendar sync + QR door check-in (small, additive); 4) ship the already-specced recurrence feature; 5) read-only natural-language availability agent on top of the existing named formulas.

## 5. Needs a human call (deliberately not done)

1. Fold `docs/reviews/20260731/safe-extras/REVERT-CONTRACT-additions.md` into `docs/REVERT-CONTRACT.md` — flagged: the existing sibling entries' dev/prod patterns don't match live code, so a verbatim fold-in would encode a stale pattern. Until then `revert-check --require-prod` reports the new marker as ORPHAN (pre-existing gate was already FAILED via `booking-cancel UNKNOWN`).
2. Apply `safe-extras/palint.config.json.patch.md` (statefulVars) — as-is it fails L6 at 2 Rooms sites that legitimately don't set `varSelectedRoom`; needs a scoping decision.
3. The R2 365-day booking cap (product decision).
4. Notifications: build a sender or relabel the card.
5. Pre-existing uncommitted edit to `docs/superpowers/plans/2026-07-30-rooms-timeline-redesign.md` was left exactly as found (not mine, not committed).

## 6. Failures / friction (faithful record)

- R2 failed review twice (unbacked lookahead; then cap locking out legitimate edits) before passing — the review gate did its job.
- Guard blocked the first compile (its own freshness snapshot was >5 min old); resolved by the exact remediation it printed, then passed.
- Nothing else was blocked; no push was ever retried unchanged; publish lock held throughout, released at end of run.
