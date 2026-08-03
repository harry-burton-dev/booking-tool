---
name: orchestrator-coding
description: Use for ANY coding task that fails the trivial threshold (≤2 files, ≤20 changed lines, no new logic). The main session designs and dispatches; implementation is delegated; a reviewer agent runs ONLY where the plan declared risk. Invoke BEFORE reading implementation files or writing code.
---

# Orchestrator Coding

The main session is for **design, orchestration, and advice — never high-context work**.
Implementation and bulk reading are delegated. Verification belongs to the toolchain first,
the orchestrator second, and a reviewer agent only by exception.

## Doctrine — proportionate verification

This is a Power Apps canvas app, not a codebase. The toolchain already reviews every change:
pa-lint, pa-schema-validate, the compiler (which hard-fails the whole publish on any delegation
warning), and the App Checker SARIF diff. Once a pattern has passed its probe compile, further
uses of it that lint clean **ship without review**. An error a human can fix in Studio in under
a minute is not worth an agent dispatch to prevent. Evidence: across the 2026-08-02/03 runs,
~65 reviewer dispatches (~3.5M tokens) produced 5 material catches — 4 of them visible from the
diff or the compiler alone. Review is the exception, not a stage.

## Trivial threshold (hard gate)

Self-edit directly ONLY if ALL three hold:
- ≤2 files changed
- ≤20 changed lines
- no new logic (config values, renames, copy tweaks, obvious one-line fixes)

Anything else follows the loop below. Do not rationalize around the gate.

## Lanes — declared per task in the plan, at authoring time

| Lane | Fits when | Process |
|---|---|---|
| **Batched** (default) | edits following a known or probe-proven pattern — any file count | ONE implementer for the whole set → orchestrator acceptance checks. **No reviewer.** |
| **High-risk** | plan says `Risk: high` + one-line reason — data-mutation paths, screen splits / re-parenting, anything whose failure loses user data or breaks every screen | implementer → acceptance checks → ONE diff-scoped Reviewer |
| **Novel** | first use of a new data-source query, control type, or component wiring | goes FIRST, alone, with a probe compile; the compiler's verdict becomes a hard constraint in every later spec |

Risk is decided when the plan is written, never re-litigated at dispatch time. If the plan did
not flag a task high-risk, it gets no reviewer — "it touches a lot of files" is not risk.
Never run two review agents over one task. Never spawn one worker per file when one worker can
hold the whole edit set.

## Model routing table

| Role | Agent tool settings | Use for | Never |
|---|---|---|---|
| Orchestrator | main session | intake, design, task specs, dispatch, advice, synthesis, user comms, small fixes | Read files >50 lines, implement non-trivial code |
| Implementer | `model: sonnet` | default for all code tasks | — |
| Heavy implementer | `model: opus` + prompt states "keep reasoning effort low" | visual/UI work, complex algorithms, gnarly debugging — orchestrator's discretion | — |
| Reviewer | `model: opus` (low effort) | High-risk lane only: read the diff, run verification commands, verdict | fixing code — reports findings only |
| Mechanical | `model: haiku` | searches, renames, file inventory, log scans | any logic change |

## The loop

1. **Intake** — classify against the trivial threshold. Trivial → self-edit, done. Else continue.
2. **Design** — requirements unclear → invoke `superpowers:brainstorming`. Clear → state assumptions in 2–3 lines.
3. **Plan** — per-task specs use the template below. Plans open with `Execute with:
   orchestrator-coding` — never a superpowers execute skill — and carry a `Lane:` per task plus
   a plan-level `Budget:` line (expected dispatches + subagent-token ceiling).
4. **Delegate** — dispatch via the Agent tool with the pinned model. Independent tasks: dispatch
   in parallel in one message. Workers return the structured report — never file dumps.
5. **Acceptance gate** — the orchestrator runs the spec's checks itself: `git show --stat`, the
   spec's greps, lint/validate tails. Bounded outputs only; never pull a full diff into the main
   context. This replaces spec review entirely. **High-risk lane only:** ONE Reviewer then gets
   the diff and the spec. On findings:
   - **≤10 lines and mechanical** → the orchestrator applies it directly with Edit and re-runs
     lint. No re-dispatch, no re-review.
   - **Larger, behavioural** → SendMessage fix instructions to the SAME worker. Max 2 retries.
     Re-review only if the fix changed the design.
   - **Cosmetic** (comment wording, naming, formatting, block-scalar style) → one end-of-run
     tidy list, default **dropped** unless the user asks for it.
   Resuming an agent replays its entire accumulated context (~200k tokens for a long task).
   **Never resume an agent for comments, naming, or style — ever.** On 2026-08-03 three
   comment-only fix rounds cost ~470k tokens for edits worth ~5k.
6. **Advice channel** — worker questions come back in reports; answer from design knowledge WITHOUT loading the code yourself.
7. **Finish** — collect verification evidence (toolchain output; reviewer verdicts where the lane had one), then invoke `superpowers:finishing-a-development-branch`.

## Hard budgets (mechanical, not judgement)

- The plan's `Budget:` line is a ceiling, not a forecast. Crossing **1.5×** its dispatch count
  or token ceiling → STOP, tell the user what is eating it, wait for direction. This applies in
  unattended/overnight runs especially — "carry on" momentum is how 5.9M happens.
- Rules of thumb: a phase-sized run ≈ **10–12 dispatches, ≤1M subagent tokens**. A task changing
  <50 lines costs ONE dispatch. ~2,400 tokens per changed line (Phase 2 actual) is the failure
  benchmark; ~500/line is acceptable.
- **Size implementers to survive:** ~30 tool calls / ~10 minutes max per dispatch. Bigger →
  split at plan time. Three agents died mid-task on 2026-08-03; each death costs its full
  accumulated context.

## Reviewer scope (High-risk lane only)

Reviewers review **the diff, not the repository** — the changed hunks plus risk points named in
the spec. No blanket "verify everything independently". Report only findings that change
behaviour or would materially mislead a maintainer; style, naming, and comment-wording
preferences are not findings.

## Context hygiene (non-negotiable)

- Never Read an implementation file >50 lines — dispatch an Explore or Haiku agent for a summary.
- Every handoff uses the task-spec template; workers must be self-contained.
- Iterate with SendMessage to the existing agent only for behavioural fixes (see loop step 5).
- "Done" claims cite toolchain evidence — lint/validate/compile/SARIF output with timestamps
  (`superpowers:verification-before-completion`) — plus reviewer verdicts where a lane had one.

## Canvas App specifics (this repo's process)

The generic loop above assumes workers can verify their own work. On a Canvas App they cannot —
`compile_canvas` **is** the publish, so validation is a privilege of the lock holder. The
O-rules in `docs/RULES.md` bind this skill to that constraint:

- **Workers never compile and never commit.** They stop at READY with a diff-shaped report
  (`STATUS / BASE hash / FILES / DIFF / UNVERIFIED`) — see `docs/PUBLISHING-PROTOCOL.md`.
- **Workers run `node tools/pa-lint/lint.js` before READY** and report `LINT: clean` (O1). That
  is the only pre-publish verification available to them; a spec's `Verification:` line should
  name it plus `pa-schema-validate`, not a compile.
- **One sync, one base, handed to everyone** — parallel workers who sync independently get
  different snapshots and their diffs will not compose. Serialize workstreams that touch the
  same file; reserve parallelism for scouts.
- **Reviewers prefer mechanical diffs over eyeballing** (O2) — extract, normalize, diff against
  the original.
- **The orchestrator owns the probe compile (Novel lane).** Workers cannot compile, and pa-lint
  sees none of what the compiler rejects: delegation warnings (which fail the *whole* publish),
  `ForAll` mutation rules, unknown control properties. The first task introducing a new
  query/control/wiring pattern is implemented alone, compiled alone under the lock, and its
  verdict becomes a hard constraint in every later task spec. Compiling last on 2026-08-02
  forced six rework loops and a four-attempt publish.

## Task-spec template

```
## Task: <name>
Lane: <batched | high-risk | novel>   (from the plan — do not upgrade at dispatch time)
Goal: <one sentence outcome>
Files in scope: <paths>
Constraints: <style, patterns to follow, what NOT to touch>
Verification: <exact command(s) that must pass>
Model: <sonnet | opus-low | haiku>
Report back: changed files, verification output, blockers, questions.
Do not return file contents — return the structured report only.
```

## Reviewer prompt template (High-risk lane only)

```
You are a reviewer. Do NOT fix code. Review the DIFF for this task spec — not the repository:
<task spec>
Diff/branch: <ref>
Named risk points: <from the plan's Risk line>
1. Read the diff hunks and the named risk points. Do not re-verify unchanged code.
2. Run: <verification command(s)>
3. Check each constraint in the spec.
Report ONLY findings that change behaviour or would materially mislead a maintainer.
Style, naming, and comment-wording preferences are NOT findings — list them separately
under "Cosmetic (optional)" at most.
Return exactly: VERDICT: PASS or VERDICT: FAIL, followed by numbered reasons
(file:line) for any failure, and the verification command output summary.
```
