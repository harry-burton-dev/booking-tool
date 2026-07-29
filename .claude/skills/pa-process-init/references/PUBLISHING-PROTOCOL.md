# Canvas publishing protocol — multi-agent, multi-session (V2)

**Problem this solves.** `compile_canvas` publishes a whole directory to the live Power Apps app
with no merge, no version check, and no lock. Last writer wins, silently. On 2026-07-25 two
sessions working the same review destroyed each other's work twice — once in each direction.

**Core principle: the live app is a deploy target, not a shared workspace.** Parallelism happens
in git, where conflicts are detectable. Publishing is serialised to one writer.

---

## Roles

| Role | May sync | May edit | May `compile_canvas` | May commit |
|---|---|---|---|---|
| **Worker** (subagent) | yes, to its own scratch dir | yes, in that dir only | **no** | no — reports ready |
| **Orchestrator** | yes | merges worker output | **only while holding the lock** | yes |
| **Integrator** (when 2+ orchestrators) | yes | resolves cross-orchestrator conflicts | yes, once, at the end | yes |
| **Human** | via Studio | Studio-only ops (see below) | saves the version | — |

The single rule that makes it work: **workers never publish.** A worker that publishes is
indistinguishable from a second uncoordinated session, which is the failure mode.

---

## Worker protocol

1. Receive: the task, **and the absolute path of the synced base directory** the orchestrator
   already produced. Workers do not sync their own base — they must all start from the *same*
   server snapshot, or their diffs won't compose.
2. Copy that base to a private scratch dir. Edit only there.
3. **Validate with pa-lint** (`node tools/pa-lint/lint.js --src <scratch>`) — this is the V2
   change: workers now have a real local validation layer. Fix findings before reporting.
   `compile_canvas` remains forbidden (it publishes).
4. Report — diff-shaped, not prose-shaped, so the orchestrator can merge mechanically:

```
STATUS: READY | BLOCKED | READY_WITH_CONCERNS
BASE:   <hash the orchestrator gave you>
FILES:  Src/Find.pa.yaml, Src/App.pa.yaml
LINT:   clean | <finding count + IDs>
DIFF:   <unified diff vs base>
UNVERIFIED: <anything you could not prove>
```

---

## Single-orchestrator flow

```
guard.sh status                     # confirm lock free
sync_canvas  -> base/               # PostToolUse hook records the baseline
                                    # (dispatch workers with base/ path)
                                    # collect READY reports (LINT: clean required)
merge worker diffs into base/       # in git or by patch; conflicts surface here
guard.sh lock "publishing phase N"
compile_canvas base/                # PreToolUse preflight: freshness + pa-lint, both blocking
git add -A && git commit            # SAME BREATH - never publish without committing
lint.js check-markers ...           # rung 3 against the post-publish sync
guard.sh unlock
pac-verify freshness                # rung 4 after each batch (fork detection)
```

If the guard blocks at `compile_canvas`, someone published while you were merging. Re-sync to a
**new** directory, rebase the merged result onto it, and push again. Never retry unchanged.

## Two-orchestrator flow

One sync produces shared base B (ONE hash). Each orchestrator branches (`work/A`, `work/B`),
runs its workers, merges, commits — **no publish**. A fresh-model **Integrator** then:
`git merge work/A work/B` → resolve in git → review the combined diff vs B for **semantic**
conflicts git merges cleanly but wrongly (same behavior changed two ways; dependencies on
schemas/collections/named formulas the other side changed; App Checker counts before/after;
duplicated fixes) → `guard.sh lock` → ONE `compile_canvas` → commit → unlock.

## The human workstream (first-class, not incidental)

Humans do the things the push path cannot, and they produce **evidence, not edits**:

- **Co-attach + save**: pushes persist as app versions only while a human Studio session is
  co-attached and the human saves after each publish checkpoint.
- **Studio-only operations**: real ComboBoxes, new component custom properties, new-control
  existence checks (tree view), visual/interactive verification, locale flips.
- **Published-player checklist** at phase ends (rung 6).

Plans carry these as explicit human workstream items with per-step verification lines.

---

## Non-negotiables

1. **Workers never publish.**
2. **One sync, one base, handed to everyone.**
3. **Publish and commit in the same breath.**
4. **A blocked push is information, not an obstacle.** Re-sync and rebase; never retry unchanged.
5. **`git` is the merge layer. `live` is the deploy target.** Never merge by pushing.
6. **Workers lint before READY.** (V2)

---

## Known gaps (V2 status)

- ~~Workers can't validate~~ → partially closed: pa-lint covers the recurring defect classes;
  full Power Fx validation still requires the lock holder's compile.
- **The lock is advisory and machine-local.** The hash guard catches cross-machine/human pushes
  at push time rather than preventing them.
- **Sync→push window** is seconds, not zero — same TOCTOU shape as ever; the fix remains
  serialising through one owner.
- **Fork detection** is post-hoc (`pac-verify freshness` after each batch), not automatic yet
  (Phase B6).
