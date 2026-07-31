#!/usr/bin/env bash
# ongame-statusline-toggle.sh — opt-in installer/uninstaller for the ongame statusline wrapper.
#
#   ongame-statusline-toggle.sh on  <plugin_root>   # wrap the user's statusline (idempotent; also "refresh")
#   ongame-statusline-toggle.sh off                 # restore the user's original statusline exactly
#
# Design guarantees (this is why it's opt-in and safe):
#   - The user's ORIGINAL statusLine command is saved verbatim; the wrapper delegates to it, so their
#     statusline still renders. "off" restores it byte-for-byte (or removes the key if they had none).
#   - settings.json is edited in place with a timestamped backup; every other key is preserved.
#   - settings.json points at a STABLE absolute path (~/.ongame/statusline/wrapper.sh), not the versioned
#     plugin cache dir, so a plugin update never leaves a dangling statusLine command. "on" re-copies the
#     current wrapper there each time, so it also self-heals / picks up wrapper fixes.
#   - "on" is idempotent + doubles as "refresh": if the user replaced their statusline while ours was
#     active, "on" saves that new one as the original and re-wraps it.
set -uo pipefail

ACTION="${1:-}"
PLUGIN_ROOT="${2:-}"

SETTINGS="${HOME}/.claude/settings.json"
ONGAME_DIR="${HOME}/.ongame/statusline"
WRAPPER_STABLE="${ONGAME_DIR}/wrapper.sh"
ORIG_CMD_FILE="${ONGAME_DIR}/original-command"
HAD_NONE_FLAG="${ONGAME_DIR}/had-no-statusline"

command -v jq >/dev/null 2>&1 || { echo "ongame-statusline: jq is required (brew install jq)"; exit 1; }
mkdir -p "$ONGAME_DIR"

# Ensure ~/.claude/settings.json exists and is valid JSON (start from {} if absent/empty).
ensure_settings() {
  mkdir -p "$(dirname "$SETTINGS")"
  if [ ! -s "$SETTINGS" ] || ! jq -e . "$SETTINGS" >/dev/null 2>&1; then
    printf '{}\n' > "$SETTINGS"
  fi
}

backup_settings() {
  cp "$SETTINGS" "${SETTINGS}.ongame-bak.$(date +%s)" 2>/dev/null || true
}

case "$ACTION" in
  on)
    [ -n "$PLUGIN_ROOT" ] || { echo "ongame-statusline: 'on' needs the plugin root path as arg 2"; exit 1; }
    SRC_WRAPPER="${PLUGIN_ROOT}/scripts/ongame-statusline.sh"
    [ -f "$SRC_WRAPPER" ] || { echo "ongame-statusline: wrapper not found at ${SRC_WRAPPER}"; exit 1; }
    ensure_settings
    backup_settings

    # What is the current statusLine? Three cases:
    #  (a) already OURS  -> just re-copy the wrapper (self-heal), keep the saved original.
    #  (b) some other cmd -> save it as the original to delegate to (this also handles "refresh").
    #  (c) none          -> record that there was none, so "off" removes the key entirely.
    cur_cmd="$(jq -r '(.statusLine.command // empty)' "$SETTINGS" 2>/dev/null || true)"
    cur_type="$(jq -r '(.statusLine.type // empty)' "$SETTINGS" 2>/dev/null || true)"

    if [ "$cur_cmd" != "$WRAPPER_STABLE" ]; then
      if [ -n "$cur_cmd" ] && [ "$cur_type" = "command" ]; then
        printf '%s' "$cur_cmd" > "$ORIG_CMD_FILE"
        rm -f "$HAD_NONE_FLAG"
      elif [ -z "$cur_cmd" ]; then
        rm -f "$ORIG_CMD_FILE"
        : > "$HAD_NONE_FLAG"
      fi
      # (a non-command statusLine type is left recorded as "none" — we only delegate to command types)
    fi

    # Copy the current plugin wrapper to the stable path (self-heal on every "on").
    cp "$SRC_WRAPPER" "$WRAPPER_STABLE"
    chmod +x "$WRAPPER_STABLE"

    # Point settings.json at the stable wrapper. refreshInterval keeps the glyph cycling even when the
    # session is idle; the field is harmless if a Claude Code build ignores it.
    tmp="$(mktemp)"
    jq --arg cmd "$WRAPPER_STABLE" \
       '.statusLine = {type:"command", command:$cmd, refreshInterval:2000}' \
       "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
    echo "ongame statusline ON — shows only during a /make-game build; your own statusline is preserved. Turn off anytime with /ongame-statusline off."
    ;;

  off)
    ensure_settings
    backup_settings
    tmp="$(mktemp)"
    if [ -f "$HAD_NONE_FLAG" ]; then
      jq 'del(.statusLine)' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
    elif [ -f "$ORIG_CMD_FILE" ]; then
      orig="$(cat "$ORIG_CMD_FILE")"
      jq --arg cmd "$orig" '.statusLine = {type:"command", command:$cmd}' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
    else
      # No record of a prior state (edge: "off" before "on") — remove our wrapper if present, else leave as-is.
      cur_cmd="$(jq -r '(.statusLine.command // empty)' "$SETTINGS" 2>/dev/null || true)"
      if [ "$cur_cmd" = "$WRAPPER_STABLE" ]; then jq 'del(.statusLine)' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"; else rm -f "$tmp"; fi
    fi
    rm -f "$ORIG_CMD_FILE" "$HAD_NONE_FLAG"
    echo "ongame statusline OFF — your original statusline is restored."
    ;;

  *)
    echo "usage: ongame-statusline-toggle.sh on <plugin_root> | off"
    exit 1
    ;;
esac
