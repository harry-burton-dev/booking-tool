#!/usr/bin/env bash
# canvas-guard v2 - concurrency control for Power Apps Canvas MCP publishing.
#
# WHY THIS EXISTS
#   compile_canvas pushes a WHOLE DIRECTORY to the live app. It does not merge,
#   does not detect that the server moved, and has no version/etag. Two agents
#   pushing to one app is a silent lost-update race. On 2026-07-25 this cost a
#   full session's work twice.
#
# V2 CHANGES vs the moc-booking-tool original:
#   - No hardcoded repo paths: root is derived (git rev-parse), overridable via
#     CANVAS_GUARD_REPO; state dir overridable via CANVAS_GUARD_STATE.
#   - Lives in the app repo's committed tools/ so it travels with a clone.
#   - New `preflight` / `preflight-from-hook`: freshness+baseline check AND
#     pa-lint, so the publish gate checks freshness (guard) and correctness
#     (lint) in one fail-closed step.
#
# WHAT IT DOES
#   baseline <dir>       record the hash of server state we believe is current
#   check <dir>          deny if the server moved since we last looked
#   preflight <dir>      check + pa-lint on the directory about to be pushed
#   lock / unlock        single-publisher mutex
#   status               human/agent-readable summary
#
# Exit codes: 0 ok, 2 blocked (hook denies the tool call), 1 usage/internal.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${CANVAS_GUARD_REPO:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || (cd "$SCRIPT_DIR/../.." && pwd))}"
STATE="${CANVAS_GUARD_STATE:-$REPO/.claude/canvas-guard/state}"
BASELINE="$STATE/baseline.sha"
BASELINE_META="$STATE/baseline.meta"
LOCK="$STATE/publish.lock"
SERVER_NOW="$STATE/server-now"
LOCK_STALE_MIN=${CANVAS_GUARD_LOCK_STALE_MIN:-45}
VERIFIED="$STATE/verified"
VERIFY_TTL_MIN=${CANVAS_GUARD_VERIFY_TTL_MIN:-20}
PALINT="${CANVAS_GUARD_PALINT:-$REPO/tools/pa-lint/lint.js}"
PALINT_CONFIG="${CANVAS_GUARD_PALINT_CONFIG:-$REPO/palint.config.json}"

mkdir -p "$STATE"

# Deterministic hash of the canvas source in a directory.
# Only .pa.yaml files matter - those are what compile_canvas ships.
hash_dir() {
  local d="$1"
  [ -d "$d" ] || { echo "MISSING"; return 0; }
  # cd first so hashed paths are relative (./x.pa.yaml) - a backslash-style
  # Windows dir argument broke the old sed-strip and made the hash path-dependent.
  # shellcheck disable=SC2312
  (cd "$d" 2>/dev/null && find . -type f -name '*.pa.yaml' -print0 2>/dev/null \
    | sort -z \
    | xargs -0 -r sha256sum 2>/dev/null \
    | sha256sum \
    | cut -d' ' -f1)
}

# JSON string escape (message bodies contain quotes/newlines).
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'BEGIN{ORS="\\n"}{print}'; }

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$(esc "$1")"
  exit 2
}

note() { printf '{"systemMessage":"%s"}\n' "$(esc "$1")"; }

now_epoch() { date +%s; }

# --- verification decay (P8) -------------------------------------------------
# A claim like "pa-lint clean" is true when made and quietly false an hour
# later, after edits. V1 relied on workers remembering that; they did not.
# These commands give a claim an explicit age so a stale one fails closed
# instead of being re-asserted from memory.
claim_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g; s/^-//; s/-$//'
}

# Print "<age_seconds> <claim>" for a stamp file, or nothing if unreadable.
stamp_age() {
  local f="$1" ep
  ep="$(sed -n 's/^epoch=\([0-9]*\)$/\1/p' "$f" 2>/dev/null | head -1)"
  [ -n "$ep" ] || return 1
  echo $(( $(now_epoch) - ep ))
}

# Pull "directoryPath" out of the hook's stdin JSON WITHOUT jq.
# jq is not installed on every machine, and a hook that silently no-ops
# because a helper is missing is worse than no hook.
read_dir_from_stdin() {
  sed -n 's/.*"directoryPath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
}

run_lint() {
  # $1 = directory about to be pushed. Exit 0 clean, else deny with findings.
  local d="$1"
  if [ ! -f "$PALINT" ]; then
    deny "canvas-guard: pa-lint not found at $PALINT. The publish gate requires the lint layer (fail closed - a missing helper must not silently pass). Set CANVAS_GUARD_PALINT or install tools/pa-lint."
  fi
  local out
  local cfg_args=()
  [ -f "$PALINT_CONFIG" ] && cfg_args=(--config "$PALINT_CONFIG")
  out="$(node "$PALINT" --src "$d" "${cfg_args[@]}" 2>&1)"
  local rc=$?
  if [ $rc -eq 1 ]; then
    deny "canvas-guard: pa-lint BLOCKED the publish - the directory you are about to ship has known-defect-class findings:
$(printf '%s' "$out" | head -25)
Fix them locally, re-run: node $PALINT --src $d
Then retry the push. (Compile is publish - these would ship live.)"
  fi
  if [ $rc -ge 2 ]; then
    deny "canvas-guard: pa-lint could not run (exit $rc): $(printf '%s' "$out" | head -5). Refusing to push unvalidated. Fix the lint invocation, then retry."
  fi
  # Informational only - stderr, so a later deny's stdout stays pure JSON.
  echo "canvas-guard: pa-lint clean on $d" >&2
}

do_check() {
  # $1 = directory about to be pushed (informational)
  local push_dir="${1:-unknown}"

  if [ ! -s "$BASELINE" ]; then
    deny "canvas-guard: no baseline recorded. You have not synced the live app in this session, so a push would overwrite whatever is on the server with no idea what it is. Run sync_canvas first (that records a baseline automatically), then retry."
  fi

  if [ ! -d "$SERVER_NOW" ]; then
    deny "canvas-guard: the pre-publish sync did not produce $SERVER_NOW. Cannot prove the server has not moved. Refusing to push. Check that the sync_canvas hook ran, or run sync_canvas with directoryPath=$SERVER_NOW yourself."
  fi

  # The snapshot must be FRESH. On 2026-07-26 the hook's sync silently
  # failed to run, and a day-old server-now produced a false
  # "another session published" verdict. Fail closed with the true reason.
  local newest
  newest="$(find "$SERVER_NOW" -type f -name '*.pa.yaml' -printf '%T@\n' 2>/dev/null | sort -rn | head -1 | cut -d. -f1)"
  if [ -z "$newest" ] || [ $(( $(now_epoch) - newest )) -gt 300 ]; then
    deny "canvas-guard: $SERVER_NOW was last refreshed more than 5 minutes ago - the pre-publish sync hook did not run, so the server-vs-baseline comparison would be meaningless. Run sync_canvas with directoryPath=$SERVER_NOW yourself, then retry the push."
  fi

  local want got
  want="$(cat "$BASELINE")"
  got="$(hash_dir "$SERVER_NOW")"

  if [ "$want" != "$got" ]; then
    deny "canvas-guard: BLOCKED - the live app changed since you last synced.
Baseline: $want
Server:   $got
Another session published while you were working. Pushing $push_dir now would silently revert their work (this has already happened twice).
Do this instead: 1) sync_canvas to a fresh directory, 2) diff it against your working copy, 3) re-apply your edits on top of the new server state, 4) push again.
Do NOT retry the push unchanged."
  fi

  # Lock check - deny if another session holds a fresh lock.
  if [ -f "$LOCK" ]; then
    local holder lock_age
    holder="$(head -1 "$LOCK" 2>/dev/null)"
    if [ "$holder" != "${CLAUDE_SESSION_ID:-unknown}" ]; then
      lock_age=$(( ($(now_epoch) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0)) / 60 ))
      if [ "$lock_age" -lt "$LOCK_STALE_MIN" ]; then
        deny "canvas-guard: BLOCKED - the publish lock is held by another session ($holder, ${lock_age}m ago).
Single-publisher rule: only the holder may run compile_canvas.
Either wait for them to release it, or if you are the designated publisher run: guard.sh unlock --force"
      fi
      note "canvas-guard: found a STALE publish lock (${holder}, ${lock_age}m old, limit ${LOCK_STALE_MIN}m). Taking it over."
      # Actually take it over - a message that claims takeover without doing it
      # leaves every later check repeating the stale-lock dance.
      printf '%s\n%s\n%s\n' "${CLAUDE_SESSION_ID:-unknown}" "$(date -Iseconds)" "taken over from stale ${holder}" > "$LOCK"
    fi
  fi

  # Informational only - stderr, so hook stdout is exclusively JSON.
  # (A mixed plain-text+JSON stdout made Claude Code drop the deny reason.)
  echo "canvas-guard: server matches baseline ($got) - push allowed" >&2
}

case "${1:-}" in

  # Read hook JSON on stdin, baseline the directory it names.
  baseline-from-hook)
    d="$(read_dir_from_stdin)"
    [ -n "$d" ] || { echo "canvas-guard: no directoryPath in hook input; nothing to baseline"; exit 0; }
    exec "$0" baseline "$d"
    ;;

  # Read hook JSON on stdin, run the full pre-publish gate against it.
  preflight-from-hook)
    d="$(read_dir_from_stdin)"
    exec "$0" preflight "${d:-unknown}"
    ;;

  # Kept for compatibility with v1 hook wiring.
  check-from-hook)
    d="$(read_dir_from_stdin)"
    exec "$0" check "${d:-unknown}"
    ;;

  baseline)
    d="${2:-$SERVER_NOW}"
    h="$(hash_dir "$d")"
    printf '%s' "$h" > "$BASELINE"
    printf 'recorded=%s\nsource=%s\nsession=%s\n' "$(date -Iseconds)" "$d" "${CLAUDE_SESSION_ID:-unknown}" > "$BASELINE_META"
    echo "canvas-guard: baseline recorded ($h) from $d"
    ;;

  check)
    do_check "${2:-unknown}"
    ;;

  preflight)
    # Freshness first (cheap, most common failure), then correctness.
    do_check "${2:-unknown}"
    if [ -d "${2:-}" ]; then
      run_lint "$2"
    else
      # FAIL CLOSED: a hook-schema drift that stops directoryPath extraction
      # must not silently disable the correctness gate.
      deny "canvas-guard: preflight could not determine the directory being pushed (got '${2:-}'), so pa-lint cannot run. Run it yourself: node $PALINT --src <push-dir>  - then, if clean, retry. If this repeats, the hook input schema changed; check guard.sh read_dir_from_stdin."
    fi
    ;;

  # Record that a claim was verified NOW.
  verified)
    claim="${2:-}"
    if [ -z "$claim" ]; then
      echo "usage: guard.sh verified \"<what you verified>\"" >&2
      exit 1
    fi
    mkdir -p "$VERIFIED"
    slug="$(claim_slug "$claim")"
    if [ -z "$slug" ]; then
      echo "canvas-guard: claim \"$claim\" has no usable characters" >&2
      exit 1
    fi
    printf 'epoch=%s\niso=%s\nsession=%s\nclaim=%s\n' \
      "$(now_epoch)" "$(date -Iseconds)" "${CLAUDE_SESSION_ID:-unknown}" "$claim" \
      > "$VERIFIED/$slug"
    echo "canvas-guard: recorded verification \"$claim\" (valid ${VERIFY_TTL_MIN}m)"
    ;;

  # With a claim: assert it is still fresh (exit 2 if not). Without: list all.
  verified-at)
    claim="${2:-}"
    if [ -n "$claim" ]; then
      slug="$(claim_slug "$claim")"
      f="$VERIFIED/$slug"
      if [ ! -f "$f" ]; then
        echo "canvas-guard: no verification on record for \"$claim\". Nothing has been verified under that name in this repo, so the claim cannot be trusted. Verify it, then run: guard.sh verified \"$claim\"" >&2
        exit 2
      fi
      age="$(stamp_age "$f")" || {
        echo "canvas-guard: verification stamp for \"$claim\" is unreadable ($f). Treating as unverified." >&2
        exit 2
      }
      if [ "$age" -gt $(( VERIFY_TTL_MIN * 60 )) ]; then
        echo "canvas-guard: verification \"$claim\" is STALE - recorded $(( age / 60 ))m ago (${age}s), limit ${VERIFY_TTL_MIN}m. Work has almost certainly changed since. Re-verify, then: guard.sh verified \"$claim\"" >&2
        exit 2
      fi
      echo "canvas-guard: \"$claim\" verified $(( age / 60 ))m ago - FRESH (limit ${VERIFY_TTL_MIN}m)"
      exit 0
    fi
    if [ ! -d "$VERIFIED" ] || [ -z "$(ls -A "$VERIFIED" 2>/dev/null)" ]; then
      echo "canvas-guard: no verification stamps recorded"
      exit 0
    fi
    echo "=== verification stamps (TTL ${VERIFY_TTL_MIN}m) ==="
    for f in "$VERIFIED"/*; do
      [ -f "$f" ] || continue
      c="$(sed -n 's/^claim=//p' "$f" | head -1)"
      age="$(stamp_age "$f")" || { echo "  UNREADABLE  $(basename "$f")"; continue; }
      if [ "$age" -gt $(( VERIFY_TTL_MIN * 60 )) ]; then
        echo "  STALE  $(( age / 60 ))m  $c"
      else
        echo "  FRESH  $(( age / 60 ))m  $c"
      fi
    done
    ;;

  lock)
    if [ -f "$LOCK" ]; then
      holder="$(head -1 "$LOCK")"
      if [ "$holder" != "${CLAUDE_SESSION_ID:-unknown}" ]; then
        echo "canvas-guard: lock already held by $holder (since $(sed -n 2p "$LOCK"))" >&2
        exit 1
      fi
    fi
    printf '%s\n%s\n%s\n' "${CLAUDE_SESSION_ID:-unknown}" "$(date -Iseconds)" "${2:-publishing}" > "$LOCK"
    echo "canvas-guard: publish lock acquired by ${CLAUDE_SESSION_ID:-unknown}"
    ;;

  unlock)
    if [ ! -f "$LOCK" ]; then echo "canvas-guard: no lock held"; exit 0; fi
    holder="$(head -1 "$LOCK")"
    if [ "$holder" != "${CLAUDE_SESSION_ID:-unknown}" ] && [ "${2:-}" != "--force" ]; then
      echo "canvas-guard: lock held by $holder, not you. Use --force to override." >&2
      exit 1
    fi
    rm -f "$LOCK"
    echo "canvas-guard: publish lock released"
    ;;

  status)
    echo "=== canvas-guard v2 ==="
    echo "repo:  $REPO"
    echo "state: $STATE"
    if [ -s "$BASELINE" ]; then
      echo "baseline: $(cat "$BASELINE")"
      [ -f "$BASELINE_META" ] && sed 's/^/  /' "$BASELINE_META"
    else
      echo "baseline: NONE - sync_canvas before any push"
    fi
    if [ -f "$LOCK" ]; then
      echo "publish lock: HELD by $(head -1 "$LOCK") since $(sed -n 2p "$LOCK")"
    else
      echo "publish lock: free"
    fi
    if [ -f "$PALINT" ]; then
      echo "pa-lint: $PALINT"
    else
      echo "pa-lint: NOT FOUND at $PALINT - preflight will fail closed"
    fi
    if [ -d "$VERIFIED" ] && [ -n "$(ls -A "$VERIFIED" 2>/dev/null)" ]; then
      "$0" verified-at
    else
      echo "verification stamps: none (TTL ${VERIFY_TTL_MIN}m)"
    fi
    ;;

  *)
    echo "usage: guard.sh {baseline [dir]|check [pushdir]|preflight [pushdir]|lock [reason]|unlock [--force]|status}" >&2
    exit 1
    ;;
esac
