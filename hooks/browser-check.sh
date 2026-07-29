#!/usr/bin/env bash
# browser-check.sh — SessionStart hook. ongame verifies a built game in a REAL browser (screenshot + console +
# window.__game) — a WebGL/Canvas game (PixiJS/Three.js) cannot be verified in bare node. The browser TOOLS ship with
# the plugin (the `playwright` MCP in plugin.json); the only thing that may be missing is a browser BINARY to drive.
# This hook DETECTS whether a usable browser is present and injects a status note so the agent knows, at /make-game
# time, whether it can verify — and, if not, that preflight §0.1 should OFFER to set it up (the hook never installs or
# prompts; consent is the agent's job — see the agentic principle). Always exit 0: never block a session start.
set -uo pipefail
cat >/dev/null 2>&1 || true   # drain the SessionStart stdin payload; we don't need it

# Emit the SessionStart additionalContext WITHOUT jq (jq is NOT preinstalled on stock macOS) — a portable JSON
# emitter that escapes backslash + double-quote so the one string field is always valid JSON. Always used, never
# depends on any external tool beyond printf.
emit_context() {
  local msg="$1"
  msg=${msg//\\/\\\\}   # escape backslashes first
  msg=${msg//\"/\\\"}   # then double-quotes
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$msg"
}

# ── Detect a usable browser the Playwright MCP can drive: a Playwright-managed browser cache, OR a system
#    Chrome/Chromium/Edge. Any hit = verification is available. ──
found=""

# 1) Playwright's own installed browsers (what `npx playwright install chromium` populates; reused across sessions).
PW_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-}"
if [ -z "$PW_CACHE" ] && [ -n "${HOME:-}" ]; then   # guard HOME: unset under `set -u` would abort before exit 0
  case "$(uname -s 2>/dev/null)" in
    Darwin) PW_CACHE="${HOME}/Library/Caches/ms-playwright" ;;
    *)      PW_CACHE="${HOME}/.cache/ms-playwright" ;;
  esac
fi
if [ -d "$PW_CACHE" ] && ls "$PW_CACHE" 2>/dev/null | grep -qiE 'chromium|chrome'; then
  found="playwright-managed browser"
fi

# 2) A system Chrome / Chromium / Edge (Playwright can drive it via channel, no download needed).
if [ -z "$found" ]; then
  for bin in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge msedge; do
    if command -v "$bin" >/dev/null 2>&1; then found="system $bin"; break; fi
  done
fi
if [ -z "$found" ] && [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then
  for app in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
             "/Applications/Chromium.app/Contents/MacOS/Chromium" \
             "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
    if [ -x "$app" ]; then found="system Chrome"; break; fi
  done
fi

# ── Emit context. When a browser is present we confirm ONCE (a marker in the persistent data dir keeps later sessions
#    quiet); when it is absent we say so EVERY session, because it stays actionable until the user sets it up. ──
DATA="${CLAUDE_PLUGIN_DATA:-}"
MARKER=""
[ -n "$DATA" ] && { mkdir -p "$DATA" 2>/dev/null || true; MARKER="$DATA/.browser-verify-ok"; }

if [ -n "$found" ]; then
  # Present → stay quiet after the first confirmation (avoid repeating a no-op note every session).
  if [ -n "$MARKER" ] && [ -f "$MARKER" ]; then exit 0; fi
  [ -n "$MARKER" ] && touch "$MARKER" 2>/dev/null || true
  MSG="ongame game verification is ready — a browser is available ($found). The code/polish gates can screenshot, read the console, and check window.__game for real."
  emit_context "$MSG"
  exit 0
fi

# Absent → remove any stale OK marker and tell the agent so /make-game preflight §0.1 offers setup.
[ -n "$MARKER" ] && rm -f "$MARKER" 2>/dev/null || true
MSG="ongame game verification is NOT yet enabled: no browser found for the bundled Playwright tool. A game can compile clean and still be a black screen with a silent console — without a browser, 'playable' can only be UNVERIFIED. In /make-game preflight (section 0.1), OFFER to set it up (one-time, consented: 'npx playwright install chromium --only-shell', or reuse the user's installed Chrome), and if the user declines, warn that verification is degraded (lower confidence/quality) and never claim the game is playable/working without having looked."
emit_context "$MSG"
exit 0
