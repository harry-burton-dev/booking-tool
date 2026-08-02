---
name: orchestrator-coding
description: Use for ANY coding task that fails the trivial threshold (≤2 files, ≤20 changed lines, no new logic). Enforces the orchestrator pattern - the main session designs/orchestrates/advises, Sonnet implements, Opus-low handles heavy work and review, Haiku does mechanical work. Invoke BEFORE reading implementation files or writing code.
---

# Orchestrator Coding

The main session is for **design, orchestration, and advice — never high-context work**.
Implementation, verification, and bulk reading are always delegated.

## Trivial threshold (hard gate)

Self-edit directly ONLY if ALL three hold:
- ≤2 files changed
- ≤20 changed lines
- no new logic (config values, renames, copy tweaks, obvious one-line fixes)

Anything else follows the loop below. Do not rationalize around the gate.

## Effort lanes (pick one per task, before dispatch)

The trivial gate is binary; the work above it is not. A fresh agent burns 60–80k tokens just
orienting, so the lane choice dominates cost far more than the code does. Name the lane in every
task spec.

| Lane | Fits when | Process |
|---|---|---|
| **Batched** | several edits whose exact before/after is already known, no new logic | ONE Implementer does all of them in one dispatch; orchestrator runs the acceptance checks; no Reviewer |
| **Standard** | multi-file, known pattern, some judgment | one Implementer → orchestrator acceptance checks → ONE Reviewer |
| **Novel** | new data-source query, new control/component, new algorithm, anything the compiler has never seen | goes FIRST, alone, with a probe compile (below); its verdict constrains every later spec |

Never run two review agents over one task. Spec-compliance is mechanical and belongs to the
orchestrator (step 5); the Reviewer judges correctness and consequences, which is where the real
defects live. Don't spawn one worker per file when one worker can hold the whole edit set.

## Model routing table

| Role | Agent tool settings | Use for | Never |
|---|---|---|---|
| Orchestrator | main session | intake, design, task specs, dispatch, advice, synthesis, user comms | Read files >50 lines, implement non-trivial code, verify diffs |
| Implementer | `model: sonnet` | default for all code tasks | — |
| Heavy implementer | `model: opus` + prompt states "keep reasoning effort low" | visual/UI work, complex algorithms, gnarly debugging — orchestrator's discretion | — |
| Reviewer | `model: opus` (low effort) | read diff, run verification commands, spec-compliance verdict | fixing code — reports findings only |
| Mechanical | `model: haiku` | searches, renames, file inventory, log scans | any logic change |

## The loop

1. **Intake** — classify against the trivial threshold. Trivial → self-edit, done. Else continue.
2. **Design** — requirements unclear → invoke `superpowers:brainstorming`. Clear → state assumptions in 2–3 lines.
3. **Plan** — write per-task specs using the template below (`superpowers:writing-plans` for multi-task work). Every spec names its model from the routing table.
4. **Delegate** — dispatch via the Agent tool with the pinned model. Independent tasks: dispatch in parallel in one message. Workers return the structured report — never file dumps.
5. **Review gate** — the orchestrator first runs the spec's acceptance checks itself: `git show
   --stat`, the spec's grep counts, lint/validate tails. Those are bounded, small outputs; this is
   the one exception to "orchestrator never verifies diffs", and it replaces the spec-review agent
   entirely. Never pull the full diff into the main context — that is the Reviewer's job. Then, in
   Standard and Novel lanes only, ONE Reviewer agent gets the diff and the task spec. Verdict
   `PASS` or `FAIL(reasons)`.
   - FAIL, fix is ≤5 lines and mechanical → orchestrator applies it directly and re-runs the
     acceptance checks. No re-dispatch, no re-review.
   - FAIL, anything larger → SendMessage fix instructions to the SAME worker (persistent
     context). Max 2 retries. Re-review only if the fix changed the design.
   - Still failing → reassign to a Heavy implementer, or surface to the user.
6. **Advice channel** — worker questions come back in reports; answer from design knowledge WITHOUT loading the code yourself.
7. **Finish** — collect reviewer verification evidence, then invoke `superpowers:finishing-a-development-branch`.

## Context hygiene (non-negotiable)

- Never Read an implementation file >50 lines — dispatch an Explore or Haiku agent for a summary.
- Every handoff uses the task-spec template; workers must be self-contained.
- Iterate with SendMessage to the existing agent, not a fresh spawn.
- "Done" claims require reviewer-produced verification evidence (`superpowers:verification-before-completion`) — evidence is produced by the Reviewer, consumed by the orchestrator.

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
  same file; reserve parallelism for scouts and reviewers.
- **Reviewers prefer mechanical diffs over eyeballing** (O2) — extract, normalize, diff against
  the original. This is what caught the defects compile could not.
- **The orchestrator owns a probe compile (Novel lane).** Workers cannot compile, and pa-lint
  sees none of what the compiler rejects: delegation warnings (which fail the *whole* publish,
  not just warn), `ForAll` mutation rules, unknown control properties. So the first task
  introducing a new query/control/wiring pattern is implemented alone, compiled alone under the
  lock, and its verdict becomes a hard constraint in every later task spec. Compiling last
  instead of first on 2026-08-02 forced six rework loops and a four-attempt publish.

## Budget tripwire

A task changing <50 lines should cost one dispatch, not three. If one task passes ~300k subagent
tokens, or the run passes ~1M, stop and tell the user what is eating it before continuing. The
2026-08-02 phase-1 run spent ~4.4M tokens on ~400 changed lines (~11k per line): two review
agents per task, eight spec reviews that found nothing between them, and compile-last sequencing.

## Task-spec template

```
## Task: <name>
Goal: <one sentence outcome>
Files in scope: <paths>
Constraints: <style, patterns to follow, what NOT to touch>
Verification: <exact command(s) that must pass>
Model: <sonnet | opus-low | haiku>
Report back: changed files, verification output, blockers, questions.
Do not return file contents — return the structured report only.
```

## Reviewer prompt template

```
You are a reviewer. Do NOT fix code. Review the work for this task spec:
<task spec>
Diff/branch: <ref>
1. Read the diff.
2. Run: <verification command(s)>
3. Check each constraint in the spec.
Return exactly: VERDICT: PASS or VERDICT: FAIL, followed by numbered reasons
(file:line) for any failure, and the verification command output summary.
```
