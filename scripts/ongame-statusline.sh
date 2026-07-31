#!/usr/bin/env bash
# ongame-statusline.sh — a Claude Code statusLine WRAPPER.
#
# Two hard rules it exists to honor:
#   1. Show the ongame brand ONLY while a /make-game build is active (a build marker exists) — silent
#      otherwise, so it never clutters the user's statusline outside an ongame session.
#   2. NEVER clobber the user's own statusline — it DELEGATES to whatever statusLine command the user
#      had before ongame was turned on (its `command` string is saved by the toggle installer), runs it
#      with the SAME stdin, and only PREPENDS a small ongame segment during a build.
#
# Claude Code re-runs a statusLine on every assistant message (and on the optional refreshInterval), so
# the small glyph below cycles frame-to-frame — a subtle "animation" without any redraw tricks. This is
# the ONE place animation is possible: chat messages are static once posted; the statusline re-renders.
#
# Install/uninstall is handled by ongame-statusline-toggle.sh (invoked via /ongame-statusline on|off).
# This script is copied to a STABLE path (~/.ongame/statusline/wrapper.sh) so settings.json can point at
# an absolute path that survives plugin updates (plugin.json's ${CLAUDE_PLUGIN_ROOT} is NOT expanded
# inside settings.json).
set -u

ONGAME_DIR="${HOME}/.ongame/statusline"
ORIG_CMD_FILE="${ONGAME_DIR}/original-command"   # the user's pre-ongame statusLine command (may be absent)

# Read the full statusLine stdin JSON once; both the marker lookup and the delegated original need it.
STDIN_JSON="$(cat)"

# --- delegate to the user's original statusline first (its output is the base line) -----------------
ORIG_OUT=""
if [ -f "$ORIG_CMD_FILE" ]; then
  ORIG_CMD="$(cat "$ORIG_CMD_FILE" 2>/dev/null || true)"
  if [ -n "$ORIG_CMD" ]; then
    # Feed the exact same stdin the user's command expects; never let its failure break ours.
    ORIG_OUT="$(printf '%s' "$STDIN_JSON" | eval "$ORIG_CMD" 2>/dev/null || true)"
  fi
fi

# --- is an ongame build active? (project-scoped marker written by the state_init hook) --------------
# The statusLine stdin carries the working/project dir; check both, plus $PWD, for the marker.
proj_dir="$(printf '%s' "$STDIN_JSON" | jq -r '(.workspace.project_dir // .workspace.current_dir // .cwd // empty)' 2>/dev/null || true)"
cur_dir="$(printf '%s' "$STDIN_JSON" | jq -r '(.cwd // empty)' 2>/dev/null || true)"

marker=""
for d in "$proj_dir" "$cur_dir" "$PWD"; do
  [ -n "$d" ] || continue
  if [ -f "${d}/.ongame/active-build.json" ]; then marker="${d}/.ongame/active-build.json"; break; fi
done

if [ -z "$marker" ]; then
  # No active build → the user's original statusline, untouched. (Empty if they had none.)
  printf '%s' "$ORIG_OUT"
  exit 0
fi

# TTL guard: a marker older than 36h is stale/abandoned (mirrors the inject hook) — treat as inactive.
ep="$(jq -r '(.startedAtEpoch // 0)' "$marker" 2>/dev/null || echo 0)"
now="$(date +%s)"
case "$ep" in
  ''|*[!0-9]*) ep=0 ;;
esac
if [ "$ep" -gt 0 ] && [ "$((now - ep))" -gt 129600 ]; then
  printf '%s' "$ORIG_OUT"
  exit 0
fi

# --- active build → prepend the ongame segment (with a cycling frame) -------------------------------
gid="$(jq -r '(.gameId // empty)' "$marker" 2>/dev/null || true)"
[ "$gid" = "null" ] && gid=""

# A tiny 4-frame glyph cycle driven by wall-clock seconds — advances each re-render (bash array).
frames=(◐ ◓ ◑ ◒)
glyph="${frames[$(( now % 4 ))]}"

seg="🎮 ongame ${glyph}"
[ -n "$gid" ] && seg="${seg} ${gid}"

if [ -n "$ORIG_OUT" ]; then
  printf '%s | %s' "$seg" "$ORIG_OUT"
else
  printf '%s' "$seg"
fi
