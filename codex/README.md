# ongame in Codex CLI

ongame gives OpenAI Codex CLI the same game-making flow it gives Claude Code: one `ongame` MCP server,
three skills you invoke by name (`$ongame-make-game`, `$ongame-account`, `$ongame-publish` — a Codex skill is
invoked by its folder name), a few session hooks, and a short section in your global `AGENTS.md`. This page
is everything a Codex user needs — how to install, what you get, where to type, how to see your account, and
how to remove it.

Verified against Codex CLI **0.153.4** (`codex --version`). Older versions that have `codex mcp add` still
get the MCP server and the skills; hooks need a version where `codex features list` shows `hooks`.

## Install

**macOS / Linux**

```
curl -fsSL https://cli.ongame.ai/install.sh | sh
```

**Windows** (PowerShell)

```
irm https://cli.ongame.ai/install.ps1 | iex
```

The installer downloads and checksum-verifies the `ongame-cli` binary, then detects the coding agents on your
machine and asks which to set up (Codex is pre-selected when it is found; in a non-interactive shell the
defaults are taken silently). For Codex it does four things, each safe to repeat:

1. **Registers the MCP server** — `codex mcp add ongame -- <absolute path to ongame-cli> mcp`. Codex writes the
   `[mcp_servers.ongame]` block into `~/.codex/config.toml` itself; see
   [`config-snippet.toml`](./config-snippet.toml) for what lands there.
2. **Installs the skills** into `~/.agents/skills/` — `ongame-make-game`, `ongame-account`, `ongame-publish` —
   plus the phase guides they read, under `~/.ongame/skills/`.
3. **Adds its hooks** to `~/.codex/hooks.json`, merged next to whatever is already there; your own hooks are
   never touched.
4. **Adds a short marked section** to `~/.codex/AGENTS.md` (between `<!-- ongame:start -->` and
   `<!-- ongame:end -->`) so every session knows the `$ongame-make-game` verb exists.

Nothing is created for an agent you do not have — no `~/.codex` is fabricated. To choose without the prompt:
`ongame-cli install --agents codex` (or `--all`, `--yes`, `--no-agents`); `ongame-cli install` alone
re-detects and offers again, which is also how you add Codex after installing it later.

## First run — two things only you can do

1. **Trust the hooks.** Codex skips a new or changed hook until you have reviewed it. Start `codex`, type
   `/hooks`, and trust the entries whose status message starts with `ongame ·`. Until then the build still
   works, but you lose the session-start notes (browser status, resuming an in-progress build) and the
   automatic review of generated art.
2. **Sign in.** Type `$ongame-make-game <your game idea>`. The agent opens your browser through the `login`
   tool; finish the sign-in there. If the cloud tools have not appeared in that same session afterwards,
   start a new `codex` session — Codex may not refresh a running session's tool list, and the sign-in is
   remembered.

## What you type

- **`$ongame-make-game <concept>`** — the one entrance. It starts a new game from a concept, and it is also
  how you come back to a game built here: `$ongame-make-game add a boss fight`,
  `$ongame-make-game fix the jump`, `$ongame-make-game make a playable ad from this`. Run it from inside the
  game's directory to continue; from an empty directory to start fresh. The skills also appear in Codex's
  `/skills` picker.
- **`$ongame-account`** — your plan, what is left this week and today, when it resets, and the link to
  manage or upgrade.
- **`$ongame-publish`** — build a game you made here, put it online, and verify the live page really serves this
  build before handing you the link.

Under the hood the ongame tools appear to Codex as `mcp__ongame__<tool>` (for example
`mcp__ongame__state_init`); the skills refer to them by their short names. During a build the agent keeps a
light `🎮 ongame` marker on phase headlines so you always know ongame is doing the work, and it narrates
what a paid plan would have added when the free tier falls back — that is how you learn what an upgrade buys
without a sales pitch.

### Browser verification

ongame checks a game in a real browser — screenshot, console, click-through — because a game can compile
clean and still be a black screen. Those browser tools come from a `playwright` MCP server registered
alongside `ongame`: the installer registers one, or reuses the one you already have. The first build asks
once for consent before downloading a browser (`npx playwright install chromium --only-shell`; an installed
Google Chrome is reused instead). Declining is fine; the agent then says "built, not yet runtime-verified"
rather than "playable".

## Your account

- In Codex: `$ongame-account`.
- In any terminal: `ongame-cli account` (prints the same block; if you are not signed in it tells you to run
  `ongame-cli login`).
- On the web: <https://account.ongame.ai> — plan, pay-as-you-go, spend cap, billing.

## Check the install

```
codex mcp get ongame                      # registered: command ends in ongame-cli, args ["mcp"]
ls ~/.agents/skills/ongame-*              # the three skills
grep -c 'ongame ·' ~/.codex/hooks.json    # the hook entries (6 handler status messages)
grep -c 'ongame:start' ~/.codex/AGENTS.md # 1
```

`codex mcp get ongame` exits non-zero with `No MCP server named 'ongame' found.` when the server is missing —
re-run the installer, or add it by hand as shown in [`config-snippet.toml`](./config-snippet.toml).

## Updates

The binary updates itself on launch, so the MCP server is always current. Re-run `ongame-cli install` at any
time to refresh the skills, hooks, and `AGENTS.md` section to the version you have; an unchanged file is
reported as already in place. If a hook's command changed, Codex will ask you to trust it again in `/hooks`.

## Setting it up by hand

If you would rather not let the installer touch Codex (`--no-agents`), the MCP registration is one command:

```
codex mcp add ongame -- /absolute/path/to/.ongame/bin/ongame-cli mcp
```

Use the absolute path (on Windows, the `.exe`: `%USERPROFILE%\.ongame\bin\ongame-cli.exe`). The skills, hooks
and `AGENTS.md` section are written by `ongame-cli install --agents codex`; there is no separate download for
them.

## Uninstall

```
codex mcp remove ongame
rm -rf ~/.agents/skills/ongame-make-game ~/.agents/skills/ongame-account ~/.agents/skills/ongame-publish
rm -rf ~/.ongame/skills
```

Then remove the ongame entries from `~/.codex/hooks.json` (the handlers whose `statusMessage` starts with
`ongame ·`; if the file holds nothing else, delete it), and delete the block between `<!-- ongame:start -->`
and `<!-- ongame:end -->` in `~/.codex/AGENTS.md`. To remove the binary as well, delete `~/.ongame` and the
`PATH` line the installer added to your shell profile.

## Windows notes

Codex keeps its files under `%USERPROFILE%\.codex` (or `%CODEX_HOME%` when set); the skills live in
`%USERPROFILE%\.agents\skills`. The MCP `command` must be the absolute path to `ongame-cli.exe` — Codex
resolves it with a plain lookup that does not apply `PATHEXT`, so a bare `ongame-cli` finds nothing there.
The installer writes the right path for your machine.
