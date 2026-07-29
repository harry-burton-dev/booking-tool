---
name: pa-process-init
description: Install the Process V2 toolkit into an environment-specific Power Apps Canvas App repo - pa-lint, pa-schema-validate, canvas-guard v2 with lint preflight, pac-verify, prod-revert, pack-msapp, sarif-diff, commit-msg-lint, session-close, the orchestrator-coding skill, hooks, rulebook, revert contract, and CLAUDE.md rules. Supersedes canvas-guard-init. Use when starting or onboarding a Canvas App project, or when the user asks to set up the PowerApps process, protect against clobbering, or initialise a deployment project for a Power Apps environment.
---

# pa-process-init

Installs the full Process V2 system (see `docs/02-PROCESS-V2.md` in the powerapps-process repo)
into a Canvas App repository. One app+environment pair per repo.

## Why this exists

Advisory context does not prevent failure; only mechanisms that fail closed work. V1's guard was
machine-local (gitignored `.claude/`), hardcoded to one repo path, and had no lint layer — so it
didn't travel, and correctness defects shipped 1.6-fixes-per-feature. V2 tools live in the app
repo's committed `tools/`, and the publish gate checks freshness AND correctness.

## How this gets invoked (per-project, from GitHub)

This toolkit is **not** installed machine-wide and does not auto-trigger anywhere. Each project
installs it deliberately, from GitHub, once. In the target Canvas App repo:

```bash
git clone --depth 1 https://github.com/harry-burton-dev/powerapps-process.git .pa-toolkit
```

Then ask Claude to *"install the PowerApps process from `.pa-toolkit`"*. `.pa-toolkit` is a
throwaway — the install vendors what it needs into the repo, records the source commit, and
step 9 deletes the clone. After the install, `pa-process-init` and `orchestrator-coding` live in
this project's `.claude/skills/`, so they are discoverable **in this project only** and can be
re-run to update. Nothing is written to `~/.claude/`.

To update later: re-clone `.pa-toolkit`, re-run, diff `tools/` — the vendored tools are committed,
so the update arrives as a reviewable diff rather than a silent change under you.

## Prerequisites

Detect or ask for:

1. **Repo root** — absolute path. Hooks need absolute paths; do not use `~` or relative.
2. **MCP server name** — from the actual tool list (`mcp__<SERVER>__compile_canvas`). Commonly
   `plugin_canvas-apps_canvas-authoring`. **Do not guess and do not trust skill prose** — the
   `configure-canvas-mcp` skill documents a `configure` tool that does not exist; `connect` takes
   snake_case `environment_id` / `app_id` / `environment_category`.
3. **Toolkit source** — the `.pa-toolkit` clone (this skill's sibling `tools/`, `skills/` and
   `references/`). Record its commit: `git -C .pa-toolkit rev-parse --short HEAD`.
4. **The target is a Canvas App source tree in git** — `Src/`, `Controls/`, `References/`,
   `Properties.json` present and committed (from `pac canvas unpack` or an MCP `sync_canvas`).
   If it is not, stop: there is nothing for the gates to guard. Say so rather than installing.
5. Node ≥ 20 on PATH (`node --version`) — the lint preflight needs it. pac CLI optional but
   strongly recommended (`pac --version`) for the fork-immune verification channel.

## Install steps

1. **Copy tools into the repo (committed — they travel with a clone):**
   `tools/pa-lint/`, `tools/pa-schema-validate/`, `tools/canvas-guard/`, `tools/pac-verify/`,
   `tools/prod-revert/`, `tools/pack-msapp/`, `tools/sarif-diff/`, `tools/commit-msg-lint/`,
   `tools/session-close/` → `<REPO>/tools/`. Copy **all nine** — a tool left behind is a gate that
   silently does not exist. Prove the copy works in place with
   `node --test "tools/**/*.test.js"` (quote the glob so Node expands it, not the shell; expect
   102 tests passing) plus `powershell -File tools/pack-msapp/test/run-tests.ps1`.
   Write `tools/TOOLKIT-VERSION` containing the toolkit commit from Prerequisite 3 and the install
   date. Vendored code with no recorded provenance makes "which version of the gates is this repo
   running" unanswerable — the same reason `pa-schema-validate` pins its upstream schema commit.
2. **Generate `<REPO>/.claude/settings.json`** from `references/settings.json.tmpl`,
   substituting `__REPO__` (forward slashes) and `__SERVER__`. **Read any existing file first
   and merge — never overwrite hooks or permissions.** Validate with
   `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`.
3. **Install the git `commit-msg` hook** (settings.json hooks cannot reach git — this one is
   separate, and it is why the history stays minable):

   ```bash
   printf '#!/bin/sh\nnode "$(git rev-parse --show-toplevel)/tools/commit-msg-lint/commit-msg-lint.js" "$1"\n' > .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg
   ```

   If `core.hooksPath` is set, write into that directory instead. Existing repos will have
   non-conforming history — the hook only governs new commits; do not offer to rewrite history.
4. **Seed the config and docs:**
   - `palint.config.json` from `references/palint.config.template.json` (fill `statefulVars`
     and `seedSchemas` as they become known — empty lists are valid day one)
   - `docs/RULES.md` from `references/RULES.md` (the versioned rulebook)
   - `docs/REVERT-CONTRACT.md` from `references/REVERT-CONTRACT-template.md`
   - `docs/PUBLISHING-PROTOCOL.md` from the V1 canvas-publishing-protocol (roles, worker report
     format, single-publisher flow — unchanged, it is proven)
   - `schema/` directory with a README pointing at the snapshot format in
     `tools/pa-lint/README.md`
   - **App Checker baseline** for `sarif-diff`: commit the current `AppCheckerResult.sarif` as
     `sarif-baseline.json` (or record that there is no baseline yet, so the first deploy
     establishes one). Without a committed baseline the gate has nothing to diff against and the
     "issues never increase" rule (P10) is unenforced.
5. **CLAUDE.md section** from `references/CLAUDE-section.md`. Also check for and correct stale
   workflow text (repos that predate a working MCP claim the push path is broken).
6. **Gitignore:** append `.claude/canvas-guard/state/`, `.claude/pac-verify/`, and `.pa-toolkit/`
   — do this *before* any commit, so a mid-install commit cannot swallow the clone (V1's history
   carries a 191,811-insertion accident of exactly this shape). If `.claude/` is wholesale-ignored,
   tell the user the hooks are machine-local and offer to un-ignore `.claude/settings.json`.
7. **Install the skills into the project** (project-scoped — never `~/.claude/skills/`):
   `skills/orchestrator-coding/` and `skills/pa-process-init/` (itself, so the install is
   re-runnable without re-cloning) → `<REPO>/.claude/skills/`. The delegation trigger ships in the
   CLAUDE.md section (step 5) — the skill without its trigger is the V1 failure mode: present, and
   never invoked. If `.claude/` is gitignored these skills are machine-local; offer to un-ignore
   `.claude/skills/` so they travel with the clone like the tools do.
8. **Memory seed:** copy the platform-truth memory notes (canvas-yaml-push-limits,
   publish-last-writer-wins, coauthoring-session-fork, mock-seed-schema-fidelity) into the
   project memory if a memory dir exists.
9. **Remove the clone — only after the verification below passes.** `rm -rf .pa-toolkit`, and
   confirm nothing installed still points into it: `grep -rn "pa-toolkit" .claude tools docs`
   must return nothing. A hook path into a deleted directory is a gate that fails as a crash
   instead of a block.

## Verify the install — do not skip

Broken hooks pipe-test as passing; prove each one:

```bash
G="<REPO>/tools/canvas-guard/guard.sh"
bash "$G" status                                     # no baseline, lock free, pa-lint found
echo '{"tool_input":{"directoryPath":"/x"}}' | bash "$G" preflight-from-hook   # deny, exit 2
# after a real sync_canvas:
bash "$G" status                                     # baseline hash present
# drift + lint checks per tools/canvas-guard tests; lock semantics with two CLAUDE_SESSION_IDs
bash "$G" verified-at "nothing"                       # exit 2 - unrecorded claims fail closed
node "<REPO>/tools/pa-lint/lint.js" --src "<REPO>/Src"   # expect findings or clean, not a crash
node "<REPO>/tools/pa-schema-validate/validate.js" --src "<REPO>/Src"   # same
node "<REPO>/tools/session-close/session-close.js"   # reports drift; exit 0 without --block

# the commit-msg hook - probe it directly, never by making a throwaway commit:
printf 'bad message\n' > /tmp/cm && .git/hooks/commit-msg /tmp/cm   # exit 1, names the rule
printf 'feat(x): good message\n' > /tmp/cm && .git/hooks/commit-msg /tmp/cm   # exit 0
```

Tell the user hooks may need a Claude Code restart (or `/hooks` opened once in an interactive
session) before a newly created settings.json is picked up — and that the `mcp_tool` hook type
has been observed to silently no-op: the guard fails closed on snapshot staleness precisely so
that failure is loud, with the manual `sync_canvas` fallback in the deny message.

## Report

State: files created/merged, server name used, tool test results, each verification's expected
vs actual exit code, and anything that did not behave — a guard believed to work but not
working converts caution into false confidence.
