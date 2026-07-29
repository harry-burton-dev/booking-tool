# commit-msg-lint

Enforces `type(scope): summary (IDs)` on the commit subject. Zero dependencies, Node ≥ 20.

**Why it exists:** the V1 process assessment (`docs/01-ASSESSMENT.md`) was mined for defect
classes almost entirely from commit history. That was only possible because the convention
held. A convention that holds *most* of the time is not a dataset — it is a guess. This is the
cheapest rule in the toolkit to mechanize, so it graduates from prose to a gate.

## Usage

As a git `commit-msg` hook (git passes the message file as `$1`):

```bash
node tools/commit-msg-lint/commit-msg-lint.js .git/COMMIT_EDITMSG
```

Install it in an app repo:

```bash
printf '#!/bin/sh\nnode "$(git rev-parse --show-toplevel)/tools/commit-msg-lint/commit-msg-lint.js" "$1"\n' > .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg
```

| Flag | Default | Meaning |
|------|---------|---------|
| `--max-subject N` | `72` | Subject length limit |
| `--require-ids` | off | Subject must end with a trailing `(IDs)` list |

Exit codes: `0` valid or skipped, `1` convention violation, `2` usage/IO error (unreadable
file, or an emptied buffer — which is how git aborts a commit, so it is deliberately *not*
reported as a violation).

## Rules

- Type must be one of `feat fix refactor docs test chore perf ci` (from
  `~/.claude/rules/common/git-workflow.md`).
- Scope is optional but must not be empty if the parentheses are present.
- Summary must be non-empty and the subject within `--max-subject`.
- A body must be separated from the subject by a blank line, or `git log --oneline` folds the
  first body line into the subject.
- Skipped entirely: `Merge`, `Revert`, `fixup!`, `squash!`, `amend!` subjects. Linting those
  would block ordinary merge/rebase flows for no benefit — the eventual squashed commit is
  what gets linted.

## Known behaviour worth knowing before you enable it

Run against this repo's own history at the time of writing, it rejected **5 of 13 commits —
every one of them on subject length alone** (74, 76, 92, 129 and 146 chars). The
`type(scope):` convention itself held on 13 of 13.

That is a real finding, not a false-positive class: a 146-character subject is genuinely a bad
subject. The default stays at git's conventional 72. If you would rather not rewrite habits,
raise it with `--max-subject` rather than dropping the hook — but note that the whole point of
the rule is that a subject is an index, not the story.

This differs deliberately from the pa-lint L3 case, where a rule was downgraded because it
asserted something *false* about legal source. Here the rule asserts something true.

## Limitation

The trailing-`(IDs)` convention is only enforced under `--require-ids`, and the check is
purely structural — it verifies a parenthesised list is present, not that the IDs inside
correspond to real rulebook or workstream entries. Cross-referencing them against
`docs/RULES.md` would need the app repo's rulebook and is not attempted.
