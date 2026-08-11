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

Both actions are subcommands of the installed `ongame-cli` binary — no `jq`, no script to copy, nothing to
`chmod`. Use the path for the user's platform:

| platform | command for `on` | command for `off` |
| --- | --- | --- |
| macOS / Linux | `~/.ongame/bin/ongame-cli statusline install` | `~/.ongame/bin/ongame-cli statusline uninstall` |
| Windows | `"%USERPROFILE%\.ongame\bin\ongame-cli.exe" statusline install` | `"%USERPROFILE%\.ongame\bin\ongame-cli.exe" statusline uninstall` |

(If the user set `ONGAME_INSTALL_DIR` at install time, the binary lives under that directory's `bin/`
instead.)

Run it with Bash. **If the Bash tool is not available** — that is the normal state on Windows without Git
for Windows — do not try to work around it: print the one-line command above and ask the user to run it in
their terminal, then confirm what it printed.

The command safely edits `~/.claude/settings.json`: it takes a timestamped backup, saves the user's current
`statusLine.command` verbatim so the new one can delegate to it, points `statusLine.command` at the absolute
path of the installed binary (forward slashes, so the same string works under both Git Bash and PowerShell —
statusline is the one Claude Code surface that is always shell-executed), and preserves every other key.
`uninstall` restores their original command exactly, or removes the key if they had none. Both are
idempotent, and `install` doubles as a refresh if they changed their statusline while ours was on.

After `on`, tell the user in one line: it's on, it shows only during a build, their own statusline is
preserved, and they can turn it off anytime with `/ongame-statusline off`. **The change takes effect on the
next statusline refresh / next session** (like any Claude Code settings change).

Relay the command's own output honestly (it reports success, and warns if the install path contains a space
— which the statusline can't survive under PowerShell). This is a cosmetic, fully-reversible convenience —
never block anything on it.
