#!/usr/bin/env bash
# canvas-guard v2 SessionStart - make the topology visible BEFORE the agent plans.
#
# The 2026-07-25 failure was a 400-line plan written against a git tree that was
# already 1,881 lines behind the live app. Every line number in it was fiction.
# This runs first so no session can form a plan on that assumption again.

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${CANVAS_GUARD_REPO:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || (cd "$SCRIPT_DIR/../.." && pwd))}"
STATE="${CANVAS_GUARD_STATE:-$REPO/.claude/canvas-guard/state}"

msg=""
add() { msg="${msg}$1\n"; }

add "CANVAS APP PROJECT - read before planning."
add ""
add "The LIVE Power Apps app is the source of truth, not this git tree."
add "compile_canvas PUBLISHES a whole directory: no merge, no version check, last writer wins."
add ""
add "Required first step in any session that will edit the app:"
add "  1. connect  (environment_id / app_id / environment_category - snake_case)"
add "  2. sync_canvas into a scratch dir, and EDIT THERE - never assume Src/ is current"
add ""
add "Before any push: node tools/pa-lint/lint.js --src <dir>  (workers can and must run this;"
add "the publish gate runs it again and BLOCKS on findings). Rules: docs/RULES.md."
add ""

if [ -f "$STATE/publish.lock" ]; then
  holder="$(head -1 "$STATE/publish.lock" 2>/dev/null)"
  since="$(sed -n 2p "$STATE/publish.lock" 2>/dev/null)"
  add "PUBLISH LOCK: HELD by ${holder} since ${since}."
  add "Another session owns publishing. Do NOT compile_canvas. Coordinate or wait."
else
  add "Publish lock: free."
fi

if [ -s "$STATE/baseline.sha" ]; then
  add "Last known server hash: $(cut -c1-16 "$STATE/baseline.sha")... (recorded $(sed -n 's/^recorded=//p' "$STATE/baseline.meta" 2>/dev/null))"
  add "NOTE: that is from a PREVIOUS session. It is not proof the server is unchanged now."
else
  add "No server baseline recorded - the guard will block any push until you sync_canvas."
fi

if command -v git >/dev/null 2>&1; then
  head_sha="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null)"
  dirty="$(git -C "$REPO" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  add "git: HEAD=${head_sha}, ${dirty} uncommitted file(s)."
  add "Git lags live whenever a session published without committing. Verify, do not assume."
fi

# Poisoned plan headers: superpowers execute skills mandate 2 reviewers/task and re-created the
# 2026-08-03 5.9M-token run by overriding CLAUDE.md from inside a plan file. Warn before planning.
if [ -d "$REPO/docs/superpowers/plans" ]; then
  bad="$(grep -l -E 'REQUIRED SUB-SKILL.*(subagent-driven-development|executing-plans)' "$REPO"/docs/superpowers/plans/*.md 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${bad:-0}" != "0" ]; then
    add ""
    add "WARNING: ${bad} plan file(s) in docs/superpowers/plans/ name a FORBIDDEN execute skill"
    add "(subagent-driven-development / executing-plans). Plans execute with orchestrator-coding"
    add "ONLY - fix the plan header before executing any of them."
  fi
fi

add ""
add "Guard is active: a PreToolUse hook re-syncs the server and BLOCKS compile_canvas if the"
add "live app moved since your last sync, or if pa-lint finds known-defect-class issues."
add "If it blocks, read the reason - never retry the push unchanged."
add "Verification decays: report every check as 'rung N at HH:MM', never bare 'verified'."

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
  "$(printf '%b' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'BEGIN{ORS="\\n"}{print}')"
