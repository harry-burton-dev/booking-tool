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
5. **Review gate** — every non-trivial task's diff goes to a Reviewer agent with the task spec. Verdict `PASS` or `FAIL(reasons)`.
   - FAIL → SendMessage fix instructions to the SAME worker (persistent context). Max 2 retries.
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
