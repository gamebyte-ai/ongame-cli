#!/usr/bin/env bash
# PostToolUse(trace_emit) — clear the active-build marker when the build finishes.
# Only acts on the build.done lifecycle event; every other trace_emit is a no-op.
set -uo pipefail

IN="$(cat || true)"

NAME="$(printf '%s' "$IN" | jq -r '(.tool_input.name // empty)' 2>/dev/null || true)"
if [ "$NAME" = "build.done" ]; then
  rm -f "${CLAUDE_PROJECT_DIR:-$PWD}/.ongame/active-build.json" 2>/dev/null || true
fi

exit 0
