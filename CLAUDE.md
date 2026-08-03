## Editing workflow — READ THIS BEFORE PLANNING ANYTHING

There is no local runtime for a canvas app. **The live Power Apps app is the source of truth.
Git is history.** They are routinely out of sync. The rulebook is `docs/RULES.md` — plans cite
rule IDs, they do not restate rules.

### The two primitives, and why they bite

- `sync_canvas(directoryPath)` — server → directory. **Overwrites** that directory. Point it at
  a scratch dir, never at a tree with unsynced edits.
- `compile_canvas(directoryPath)` — directory → server. This is a **publish**, not a save. Whole
  directory, no merge, no version check, last writer wins.

### Required loop

1. `connect` — parameters are **snake_case**: `environment_id`, `app_id`,
   `environment_category`. Read the tool schema, not skill prose.
2. `sync_canvas` into a **scratch directory** and edit there.
3. `node tools/pa-lint/lint.js --src <dir>` and
   `node tools/pa-schema-validate/validate.js --src <dir>` — fix findings *before* pushing.
   Workers can and must run both; the publish gate runs lint again and blocks.
4. `compile_canvas` — the guard preflight (freshness + lint) runs automatically and blocks on
   either. Never retry a blocked push unchanged.
5. **Commit to git in the same breath** (RULES P4), while a human Studio session is co-attached;
   the human saves to persist a version (P7).

### Verification ladder (claim only the rung you earned, with a timestamp)

1. pa-lint clean → 2. compile 0 errors → 3. fresh-sync marker greps
(`lint.js check-markers`) → 4. `pac-verify` (fork-immune, catalog-based) → 5. human in Studio →
6. published player. "Verified" is always "rung N at HH:MM".

Record each rung as you earn it — `guard.sh verified "rung 3 marker greps"` — and re-check before
repeating the claim — `guard.sh verified-at "rung 3 marker greps"`. The guard fails closed on a
stale stamp *and* on an unrecorded one (RULES P8), so an unrecorded rung is not a claim you can
make: say what you actually ran.

### Single publisher

Workers sync, edit, lint, and stop at READY (diff-shaped report incl. `LINT:` line). Exactly one
session publishes, holding `tools/canvas-guard/guard.sh lock`. Merge in git, never by pushing.
Full protocol: `docs/PUBLISHING-PROTOCOL.md`.

### Sandbox & deploy

Mock data rules are D1–D5 in `docs/RULES.md`; every dev-only site carries `// PROD-REVERT[id]`
matched by an entry in `docs/REVERT-CONTRACT.md`. Before any production pack:
`node tools/prod-revert/revert-check.js --src Src --contract docs/REVERT-CONTRACT.md --require-prod`
then `node tools/sarif-diff/sarif-diff.js` against the committed App Checker baseline (new issues
block — RULES P10), then `tools/pack-msapp/pack-msapp.ps1`. Deployment runbook: `deploy/RUNBOOK.md`.

### Delegation

Any coding task that fails the trivial threshold (≤2 files, ≤20 changed lines, no new logic)
starts by invoking the `orchestrator-coding` skill — before reading implementation files or
writing code. That skill is **the** execution path here. Do **not** run
`superpowers:subagent-driven-development` or `superpowers:executing-plans` in this repo: they
mandate two review agents per task and know nothing about the compile gate. Running that path on
2026-08-02 cost ~4.4M subagent tokens for ~400 changed lines. `superpowers:writing-plans` is
still fine for authoring a multi-task plan — but **replace its boilerplate header**: every plan
here opens with `Execute with: orchestrator-coding`, carries a `Lane:` per task, `Risk: high`
flags decided at authoring time, and a plan-level `Budget:` line (expected dispatches + token
ceiling; 1.5× = stop and report). On 2026-08-03 a session obeyed a stale plan header over this
file and spent 5.9M tokens / 45 dispatches on work worth ~12 — the plan header wins fights with
this file, so the plan header must be right.

Default is **no reviewer**: the toolchain (pa-lint, schema-validate, the compiler, SARIF diff)
is the review, and a human fixes cosmetics in Studio faster than an agent dispatch. A reviewer
agent runs only on tasks the plan flagged `Risk: high`. Review findings ≤10 lines and mechanical
are applied by the orchestrator directly; **never resume an agent for comments, naming, or
style** — resuming replays its whole accumulated context.

On a Canvas App, workers lint but never compile and never commit (RULES O1). Because of that the
orchestrator owns a **probe compile**: the first task introducing a new data-source query,
control type, or component wiring is implemented and compiled *alone*, before any further task is
dispatched, and the compiler's verdict becomes a hard constraint in every later task spec.
pa-lint cannot see delegation warnings, `ForAll` mutation rules, or unknown properties — only
`compile_canvas` can, and it fails the entire publish on any one of them.

### Local environment notes (this machine)

- `bash` on PATH resolves to the **WSL** launcher (`C:\Windows\system32\bash.exe`), which cannot
  run a Windows-path `.sh`. The hooks in `.claude/settings.json` therefore invoke Git Bash by
  absolute path (`C:/Program Files/Git/bin/bash.exe`). Run `guard.sh` the same way, or put
  `C:\Program Files\Git\bin` ahead of system32 on PATH.
- `.gitattributes` pins `*.sh` and `*.pa.yaml` to LF. Do not remove it: CRLF breaks `guard.sh`,
  and it would desync the snapshot bytes the guard hashes for publish freshness.
- This repo's `Src/` came from MCP `sync_canvas`, so it has no `Controls/`, `References/`, or
  `Properties.json`. Those come only from `pac canvas unpack` of a `.msapp` and are required by
  `pack-msapp` for a production pack.
