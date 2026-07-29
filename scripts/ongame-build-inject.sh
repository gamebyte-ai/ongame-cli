#!/usr/bin/env bash
# UserPromptSubmit + SessionStart — if a make-game build is active (fresh marker),
# re-anchor the agent into ongame-cli pipeline mode. This is what makes a single
# /make-game stick for the whole session, surviving interruptions, manual phase
# stop/continue, resume and compaction. Kept lean (injected every turn).
set -uo pipefail

IN="$(cat || true)"

# One script serves both events — echo back whichever event fired.
EVT="$(printf '%s' "$IN" | jq -r '(.hook_event_name // "UserPromptSubmit")' 2>/dev/null || echo UserPromptSubmit)"
[ -z "$EVT" ] || [ "$EVT" = "null" ] && EVT="UserPromptSubmit"

MARKER="${CLAUDE_PROJECT_DIR:-$PWD}/.ongame/active-build.json"
[ -f "$MARKER" ] || exit 0   # no active build → inject nothing

BID="$(jq -r '(.buildId // empty)' "$MARKER" 2>/dev/null || true)"
[ -z "${BID:-}" ] || [ "$BID" = "null" ] && exit 0

# TTL guard: ignore a stale/abandoned marker (>36h) so it doesn't haunt later
# sessions if a build was never finalized.
EP="$(jq -r '(.startedAtEpoch // 0)' "$MARKER" 2>/dev/null || echo 0)"
NOW="$(date +%s)"
if [[ "$EP" =~ ^[0-9]+$ ]] && [ "$EP" -gt 0 ] && [ "$((NOW - EP))" -gt 129600 ]; then
  exit 0
fi

CTX="ACTIVE ongame-cli make-game build: ${BID}. This session is in ongame pipeline mode — keep using the ongame-cli skills + ongame MCP tools for ALL further work until the build finishes; the user should not have to invoke any skill (only /make-game).
- Self-route every request to the right ongame discipline (the matching skills/phases/<phase>/SKILL.md for code/docs work, the approval-gate flow) — do not free-hand outside the pipeline.
- BEFORE writing or debugging code, consult ongame first: call knowledge_get + brain_recall(buildId=${BID}) and apply the recalled lessons + framework knowledge.
- Read the live phase/gate state with state_get(buildId=${BID}); as work progresses, drive state_advance + trace_emit + brain_capture(buildId=${BID}); honor the gates.
- When the build is done, run the finalizer (profile_record_build, brain_capture, trace_emit name=build.done) — that auto-clears this marker."

jq -n --arg evt "$EVT" --arg ctx "$CTX" \
  '{hookSpecificOutput:{hookEventName:$evt, additionalContext:$ctx}}' 2>/dev/null || true

exit 0
