#!/usr/bin/env bash
# PostToolUse(state_init) — persist the active make-game build deterministically
# (not model-dependent) so the inject hook can re-anchor the agent into ongame-cli
# pipeline mode every turn for the rest of the session. Fires only after state_init.
set -uo pipefail

IN="$(cat || true)"

# buildId is "b_<16 hex>". Try structured paths first, then a robust regex fallback
# on the raw payload (MCP results can be nested or string-wrapped).
BID="$(printf '%s' "$IN" | jq -r '
  (.tool_output.buildId // .tool_response.buildId // .tool_output.state.buildId // empty)
' 2>/dev/null || true)"
if [ -z "${BID:-}" ] || [ "$BID" = "null" ]; then
  BID="$(printf '%s' "$IN" | grep -oE 'b_[0-9a-f]{16}' | head -n1 || true)"
fi
[ -z "${BID:-}" ] && exit 0   # no buildId → nothing to anchor

GID="$(printf '%s' "$IN" | jq -r '
  (.tool_input.gameId // .tool_output.state.gameId // empty)
' 2>/dev/null || true)"
[ "$GID" = "null" ] && GID=""

DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.ongame"
mkdir -p "$DIR" 2>/dev/null || true

jq -n \
  --arg bid "$BID" \
  --arg gid "${GID:-}" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson ep "$(date +%s)" \
  '{buildId:$bid, gameId:$gid, startedAtEpoch:$ep, startedAt:$ts}' \
  > "$DIR/active-build.json" 2>/dev/null || true

exit 0
