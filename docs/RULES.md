# RULES.md — the versioned rulebook

**This file replaces accreting "standing constraints" blocks in plans.** Plans reference rule
IDs; they do not restate rules. Every rule carries a status tag showing how it is enforced:

- `[LINT:Lx]` — pa-lint blocks it before publish (fail closed)
- `[HOOK]` — canvas-guard blocks it (fail closed)
- `[HOOK:<tool>]` — a named hook fires by itself; the tool's README states whether it blocks or
  only reports (`session-close` reports by default, blocks with `--block`)
- `[GATE:<tool>]` — a tool that must pass before the commit/publish/deploy it guards (fail closed)
- `[CHECKLIST:<doc>]` — gated by a named checklist
- `[ADVISORY]` — prose only; **the second recurrence of a defect promotes its rule one level**

Rule IDs are stable; do not renumber. Add new rules at the bottom of their section.

## Publishing (P-rules)

- **P1** `[HOOK]` Never push onto a moved server. The guard re-syncs and blocks `compile_canvas`
  if live changed since your last sync. On block: re-sync, diff, re-apply your edits, push.
  Never retry unchanged.
- **P2** `[HOOK]` No push without a baseline (sync first — your edit surface must equal live).
- **P3** `[HOOK]` The publish gate runs pa-lint; findings block the push.
- **P4** `[HOOK:session-close]` Commit to git in the same breath as every publish. Work that
  exists only on the server is invisible and will be erased. The Stop hook escalates the case
  where this session published and the source is still uncommitted.
- **P5** `[HOOK:session-close]` Open and close every session with a `sync:` reconciliation commit;
  post-publish, re-sync and commit server normalization as `chore:`. The hook covers the close
  (uncommitted / unpushed drift); the opening reconcile is still yours to remember.
- **P6** `[CHECKLIST:PUBLISHING-PROTOCOL.md]` Single publisher. Workers never compile; the
  publisher holds `guard.sh lock`; merge in git, never by pushing.
- **P7** `[ADVISORY]` Pushes persist as app versions only while a human Studio session is
  co-attached and the human saves. Same-session sync read-back is a smoke test, not proof.
- **P8** `[HOOK]` Verification decays: record every check with `guard.sh verified <rung>` and
  report it as "rung N at HH:MM" (ladder in docs/02-PROCESS-V2.md §3.4). The guard fails closed on
  a stale claim *and* on an unrecorded one — an unrecorded claim is someone asserting from memory.
  After any suspicious gap: `pac-verify freshness`.
- **P9** `[GATE:commit-msg-lint]` Commit subjects are `type(scope): summary (IDs)`. The git
  `commit-msg` hook rejects anything else — this convention is what makes the history minable.
- **P10** `[GATE:sarif-diff]` App Checker issues never increase. Diff the current SARIF against
  the committed baseline before any deploy; new issues block, and a deliberate baseline move is
  its own reviewable commit.

## YAML authoring (Y-rules)

- **Y1** `[LINT:L1]` Any formula containing `: ` must be a block scalar (`|-`).
- **Y2** `[LINT:L2]` Every referenced global needs a `Set()` site.
- **Y3** `[LINT:L3]` No `Classic/ComboBox` via YAML; no ManualLayout inside an AutoLayout tree;
  new component custom properties are Studio-first.
- **Y4** `[LINT:L5]` Toggle state is `Checked:` not `Default:`; `Classic/Button` has no
  `AccessibleLabel` (accessible name is `Text`).
- **Y5** `[LINT:L7]` Never parse date/time string literals — construct numerically.
- **Y6** `[LINT:L8]` Control and component-instance names are app-global; every one fresh.
- **Y7** `[ADVISORY]` Prefer extending existing controls over creating new ones — a pushed
  control can validate, echo back on sync, and never materialize. New-control existence is only
  provable in Studio's tree view (rung 5).
- **Y8** `[ADVISORY]` Named formulas over snapshot collections for derived data; `As`-alias
  outer rows in nested Filter/LookUp; `Set()` is illegal inside `ForAll`.
- **Y9** `[ADVISORY]` Empty spacer containers lose sizing on round-trip; fixed-size AutoLayout
  children need explicit Width/Height with `FillPortions: 0`.

## Sandbox & data (D-rules)

- **D1** `[LINT:L4]` Mock seeds mirror the live schema — names AND types, including lookup
  `.Value` shape. Snapshot the live schema into `schema/*.json` before writing seeds.
- **D2** `[ADVISORY]` Never touch connection declarations (`Properties.json`,
  `References/DataSources.json`): a connection stays exactly as generated, or is spoofed by a
  local collection. Zero rewiring on re-import.
- **D3** `[ADVISORY]` Seeds are hostile regression fixtures — every fixed bug gets a seed row
  that keeps it visible; acceptance checks are sharp numbers, not vibes.
- **D4** `[LINT:L6]` Every wizard/modal reset site carries `// RESET-SITE[name]` and resets
  every registered stateful var.
- **D5** `[CHECKLIST:REVERT-CONTRACT.md]` Every dev-only site carries `// PROD-REVERT[id]` with
  a contract entry; `revert-check --require-prod` must pass before any production pack.

## Design system (DS-rules) — active once the kit exists

- **DS1** `[LINT:DS1]` No raw hex/`RGBA(` outside the token block; exemptions carry
  `// DS-EXEMPT` and a RULES entry in the kit.
- **DS2** `[ADVISORY]` Screens are assembled from `design/patterns/*.yaml`; freehand control
  trees only for genuinely novel layouts, and they become pattern candidates.

## Orchestration (O-rules)

- **O1** `[ADVISORY]` Workers run pa-lint before READY and report `LINT: clean` with their
  diff-shaped report. Workers never compile (compile = publish).
- **O2** `[ADVISORY]` Implementer never reviews its own work; reviewers get fresh context and
  prefer mechanical diffs over eyeballing.
- **O3** `[ADVISORY]` Plans anchor by quoted code, never line numbers; re-anchor against a fresh
  sync; exact before/after code, no placeholders.
