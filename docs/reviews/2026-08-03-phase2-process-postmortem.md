# Phase 2 execution — process post-mortem

**Date:** 2026-08-03. **Subject:** the subagent-driven execution of `docs/superpowers/plans/2026-08-02-audit-fixes-phase2-perf.md`.
**Verdict:** the output was correct and shipped; the process cost roughly 5× what the work warranted. The dominant waste is structural, not judgement, and it is fixable with three rule changes.

---

## 1. What it cost

| Measure | Value |
|---|---|
| Subagent dispatches | **45** |
| Subagent tokens | **5,865,339** |
| Subagent wall-clock (sequential) | **190 min** (3.2 h) |
| Elapsed session | 19:13 → 07:15 (~12 h, incl. 2 session-limit stalls + 1 credit exhaustion) |
| Commits | 43 |
| Net product | **2,416 insertions / 2,491 deletions across 12 files** |
| Cost per line of final diff | **~2,400 tokens** |

Note: the 5.87M figure counts *subagent* tokens only. Orchestrator turns (plan authoring, verification commands, dispatch prompts) are on top.

### Where the tokens went

| Category | Agents | Tokens | Share | Tool calls | Wall min |
|---|---:|---:|---:|---:|---:|
| Implementation | 11 | 1,689,014 | 28.8% | 437 | 92 |
| Spec review | 11 | 1,150,925 | 19.6% | 218 | 45 |
| Quality review | 13 | 1,231,481 | 21.0% | 129 | 34 |
| **Fix rounds (resumed agents)** | **10** | **1,793,919** | **30.6%** | **110** | **19** |

**Review was 40.6% of spend. Fix rounds were 30.6% — more than implementation itself, for a quarter of the tool calls and a fifth of the time.**

---

## 2. Root cause #1 — resuming an agent re-pays its whole context

`SendMessage` to a finished agent replays its accumulated transcript. An agent that has done 80+ tool calls is carrying ~200k of context; asking it to add one comment line costs that ~200k again.

| Task | Fix round | Tokens | Tool calls | Tokens/call | What it actually did |
|---|---|---:|---:|---:|---|
| T8a | fix | 213,526 | 4 | 53,382 | Reverted one control to two Labels |
| T6 | fix2 | 145,388 | 4 | 36,347 | **Added one comment line** |
| T6 | fix | 141,867 | 4 | 35,467 | **Added `FillPortions: =0` — one line** |
| T8a | fix2 | 220,309 | 9 | 24,479 | Dropped 2 statements, 2 comment edits |
| T7 | fix | 206,534 | 10 | 20,653 | Rename + move a formula block |
| T3 | fix | 184,350 | 16 | 11,522 | **Added 6 comment lines** |

Three of the ten fix rounds — ~470k tokens — were **comment text only**. Zero behavioural change.

The orchestrator could have made every one of these edits directly with `Edit` for ~1–2k tokens each. **The fix-round category should have cost ~30k, not 1.79M.**

## 3. Root cause #2 — two-stage review applied uniformly

Every task got a spec reviewer *and* a quality reviewer, each independently re-reading files, regardless of risk. Cost: 2.38M tokens across 24 agents.

What that bought — 4 material catches:

1. **Single-quote collision in the `CarbonText*` UDFs** — `style='…'` broke on the font stack's own quotes; would have silently killed styling on *every* HTML control. Caught before publish. Genuinely worth the whole review budget on its own.
2. **`Now()` race + duplicated predicate** in the series-cancel mirrors (T2).
3. **`htxWeekCell_v2` inside a gallery template** (T5 wave 2) — policy violation, reverted.
4. **`tl2HtxPick` same defect** (T8a) — reverted.

And ~15 cosmetic findings — comment wording, naming preference, formula grouping, block-scalar style — which produced most of the expensive fix rounds and changed no behaviour.

Reviewers were also told "do not trust the report, verify everything," which they took literally: the T5-wave-2 spec review alone ran 46 tool calls / 139k tokens re-reading files the diff never touched.

## 4. Root cause #3 — the plan's shape guaranteed the dispatch count

9 tasks × (1 implementer + 2 reviewers + ~1 fix round) ≈ 45 dispatches before any work began. Four of those tasks (T3 batching, T4 precompute, T6 shell labels, T7 formula dedup) were mechanical, independent, low-risk, and touched non-overlapping code — yet each carried the full ceremony and cost 264k–621k.

## 5. Friction that wasn't token spend but was wall-clock

- **3 agent deaths mid-task** (2 session limits, 1 credit exhaustion). One cost 104k tokens for zero output (T5w2 first attempt).
- **4 of 11 user turns were pure prodding** — "carry on", "carry on where you left off", "reconnect and push" ×2. No new information, but each required a full orchestrator turn to re-establish state.
- Long single agents (T1 impl 18.5 min, T8a impl 11.5 min) are the ones that hit limits.

---

## 6. What changes

### Rule A — the orchestrator applies small fixes itself. Never resume an agent for a comment.
If a review finding is **under ~10 lines and mechanical** (comment text, a single property, a rename, a block-scalar style fix), the orchestrator edits the file directly and re-runs lint. Resuming a subagent is reserved for fixes needing the agent's reasoning about code it wrote. *Projected saving on this run: ~1.7M tokens (29%).*

### Rule B — one review stage by default; two only for declared high-risk tasks.
The plan names which tasks are high-risk **at authoring time**. Here that would have been exactly two: T2 (mirror writes — correctness of every mutation path) and T8 (screen split — the re-parenting trap). Everything else gets a single combined review whose brief is: *does the diff do what was asked, and would it break anything?* *Projected saving: ~1.0M tokens (17%).*

### Rule C — reviewers review the diff, not the repository.
Dispatch prompts must scope verification to the changed hunks plus explicitly named risk points. Drop the blanket "verify everything independently." Add an explicit instruction: **report only findings that change behaviour or would materially mislead a maintainer; do not report style, naming, or comment-wording preferences.** Cosmetic observations go in a single end-of-task tidy list the orchestrator may action or drop.

### Rule D — batch mechanical tasks.
Independent, low-risk, non-overlapping tasks ship as one agent with one review. T3+T4+T6+T7 were exactly that shape: 2.02M actual → ~400k batched.

### Rule E — size tasks to survive.
Cap an implementer at roughly 30 tool calls / 10 minutes. Beyond that, split. Three agents died mid-run at this scale, and each death costs its full accumulated context.

---

## 7. What this run should have cost

| | Actual | With rules A–E |
|---|---:|---:|
| Dispatches | 45 | ~12 |
| Subagent tokens | 5.87M | **~1.2M** |
| Subagent wall-clock | 190 min | ~55 min |

The four material defects would still have been caught: three of them (the quote collision, the two gallery-template violations) surface from reading the diff alone, which is what Rule C mandates. The `Now()` race came from the T2 review, which stays two-stage under Rule B.

**The output was right. The process to get there was about 5× oversized, and ~80% of the excess is two habits: resuming expensive agents to edit comments, and reviewing cosmetics as if they were defects.**
