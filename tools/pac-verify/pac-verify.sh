#!/usr/bin/env bash
# pac-verify - the fork-immune verification channel (verification ladder rung 4).
#
# WHY THIS EXISTS
#   The canvas MCP coauthoring session can silently detach (fork). Inside a
#   fork, compile_canvas returns "Validation PASSED" and same-session
#   sync_canvas reads your own pushes back - while the real app never changed.
#   That failure class ate three publishes in one session (2026-07-26) and the
#   guard structurally cannot see it: its snapshot sync runs inside the same
#   fork. pac CLI reads the APP CATALOG, not the coauthoring session, so it
#   cannot share the fork's blind spot.
#
# STATUS: command structure verified against pac CLI 2.8.1 help text.
#   Live behavior is UNVERIFIED until first authenticated run (Phase B1) -
#   requires `pac auth create` once per machine.
#
# CONFIG (env vars, or KEY=VALUE lines in <repo>/.pac-verify.conf):
#   PAC_VERIFY_ENVIRONMENT   environment Guid or https org URL
#   PAC_VERIFY_APP           canvas app exact name or App ID
#
# Usage:
#   pac-verify.sh freshness [--dry-run]        app row from the catalog (modified time)
#   pac-verify.sh snapshot  [--dry-run]        download + extract live app to scratch
#   pac-verify.sh check [--dry-run] <marker...>  snapshot, then rung-3 marker grep in it
#
# Report every result as "rung 4 at HH:MM" - verification decays.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${CANVAS_GUARD_REPO:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || (cd "$SCRIPT_DIR/../.." && pwd))}"
CONF="$REPO/.pac-verify.conf"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"

ENVIRONMENT="${PAC_VERIFY_ENVIRONMENT:-}"
APP="${PAC_VERIFY_APP:-}"
SNAP_DIR="${PAC_VERIFY_SNAP_DIR:-$REPO/.claude/pac-verify/snapshot}"
PALINT="$REPO/tools/pa-lint/lint.js"

usage() {
  sed -n 's/^# Usage:$//p; s/^#   pac-verify.sh/  pac-verify.sh/p' "$0" >&2
  exit 1
}

need_config() {
  if [ -z "$ENVIRONMENT" ] || [ -z "$APP" ]; then
    echo "pac-verify: PAC_VERIFY_ENVIRONMENT and PAC_VERIFY_APP must be set (env or $CONF)." >&2
    echo "pac-verify: also ensure a pac auth profile exists: pac auth create --environment <url>" >&2
    exit 2
  fi
}

DRY=0
CMD="${1:-}"
shift || true
if [ "${1:-}" = "--dry-run" ]; then DRY=1; shift; fi

run() {
  if [ "$DRY" -eq 1 ]; then
    echo "DRY-RUN: $*"
    return 0
  fi
  "$@"
}

stamp() { date +%H:%M; }

case "$CMD" in
  freshness)
    need_config
    echo "pac-verify: catalog row for '$APP' (modified time is the fork-immune truth):"
    run pac canvas list --environment "$ENVIRONMENT"
    echo "rung 4 at $(stamp): compare the catalog modified time above to your last publish time."
    echo "If the catalog predates a 'successful' publish, you are in a forked coauthoring session:"
    echo "reconnect fresh, and have the human co-attach Studio + save."
    ;;

  snapshot)
    need_config
    run rm -rf "$SNAP_DIR"
    run mkdir -p "$SNAP_DIR"
    if ! run pac canvas download --environment "$ENVIRONMENT" --name "$APP" \
      --extract-to-directory "$SNAP_DIR" --overwrite; then
      # NEVER claim rung 4 on a failed download - a false verification here
      # recreates the exact failure class this tool exists to kill.
      echo "pac-verify: DOWNLOAD FAILED - no rung-4 claim can be made. Check pac auth (pac auth who), environment, and app name. The snapshot dir is NOT a valid copy of live." >&2
      exit 3
    fi
    echo "rung 4 at $(stamp): live app extracted to $SNAP_DIR (from the catalog, not the coauthoring session)."
    ;;

  check)
    need_config
    [ $# -ge 1 ] || { echo "pac-verify: check needs at least one marker string" >&2; exit 2; }
    if ! "$0" snapshot $([ "$DRY" -eq 1 ] && echo --dry-run); then
      echo "pac-verify: check aborted - the snapshot download failed, so 'marker missing' would be a MISDIAGNOSIS (the download never ran, not your push)." >&2
      exit 3
    fi
    if [ "$DRY" -eq 1 ]; then
      echo "DRY-RUN: node $PALINT check-markers --src $SNAP_DIR $*"
      exit 0
    fi
    # The extracted tree nests sources; search the whole snapshot.
    node "$PALINT" check-markers --src "$SNAP_DIR" "$@"
    rc=$?
    echo "rung 4 at $(stamp): markers checked against a catalog download - this DOES prove the push escaped the coauthoring fork."
    exit $rc
    ;;

  *)
    usage
    ;;
esac
