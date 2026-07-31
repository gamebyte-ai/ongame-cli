---
name: ongame-statusline
description: Turn the ongame statusline on/off. When on, a small "🎮 ongame" marker shows in your Claude Code statusline ONLY during an active /make-game build; your own statusline is preserved and restored.
---

# /ongame-statusline — opt-in build-time brand marker (on / off)

`$ARGUMENTS` is `on`, `off`, or empty. This adds a small `🎮 ongame` marker to the Claude Code statusline
that appears **only while a `/make-game` build is running**, and **never replaces the user's own
statusline** — it wraps and delegates to it, and restores it exactly on `off`.

**If `$ARGUMENTS` is empty:** briefly explain the two options and ask which they want (`on` or `off`) via
one `AskUserQuestion`. Do not run anything until they choose.

**If `on`:** run this with Bash (the toggle safely edits `~/.claude/settings.json`, backs it up, saves the
user's original statusline to delegate to, and points at a stable wrapper path):

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/ongame-statusline-toggle.sh" on "${CLAUDE_PLUGIN_ROOT}"
```

Then tell the user, in one line: it's on, it shows only during a build, their own statusline is preserved,
and they can turn it off anytime with `/ongame-statusline off`. **The change takes effect on the next
statusline refresh / next session** (like any Claude Code settings change).

**If `off`:** run

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/ongame-statusline-toggle.sh" off
```

and confirm their original statusline is restored.

Relay the script's own output honestly (it reports success or an error such as missing `jq`). This is a
cosmetic, fully-reversible convenience — never block anything on it.
