#!/bin/sh
# ongame-cli installer.
#
#   curl -fsSL https://raw.githubusercontent.com/gamebyte-ai/ongame-cli/main/install.sh | sh
#
# Job, in order:
#   1. Detect OS/arch, download the matching `ongame-cli` binary + `checksums.txt` from this repo's
#      latest GitHub Release, verify sha256, install to ~/.ongame/bin/, chmod +x.
#   2. Add ~/.ongame/bin to PATH by patching whichever shell rc file exists (idempotent — checks for
#      a marker before appending, so re-running this script is always safe).
#   3. Detect `claude` on PATH: if found, print the exact in-session `/plugin marketplace add` +
#      `/plugin install` commands (NOT run automatically — see the note below on why).
#   4. Detect `~/.codex/`: if found, patch `~/.codex/config.toml`'s `[mcp_servers.ongame]` section
#      (append-only, checks for the section header first so re-running never duplicates it).
#
# Structural pattern (fail loudly, one-line progress messages, HTTPS-only) follows the
# rustup/bun install.sh convention — `set -eu` (POSIX sh, not bash: no `pipefail`, so pipelines
# are checked stage-by-stage instead; see download_to below), OS/arch detection via `uname -s`/
# `uname -m`, no interactive prompts.
set -eu

REPO="gamebyte-ai/ongame-cli"
GITHUB="https://github.com"
API="https://api.github.com/repos/${REPO}/releases/latest"
INSTALL_DIR="${ONGAME_INSTALL_DIR:-$HOME/.ongame}"
BIN_DIR="${INSTALL_DIR}/bin"
BIN_NAME="ongame-cli"

info()  { printf '%s\n' "$*" >&2; }
error() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || error "curl is required to install ongame-cli"

# ---------------------------------------------------------------------------
# 1. OS/arch detection → this repo's release-asset naming convention.
#
# VERIFIED (not guessed): the private repo's `cli/package.json` build scripts + `cli/BUILD.md`
# already produce four real binaries named `ongame-cli-macos-arm64`, `ongame-cli-macos-x64`,
# `ongame-cli-linux-x64`, `ongame-cli-linux-arm64` — note the OS segment is "macos", NOT "darwin",
# even though `uname -s` reports "Darwin". $OS below stays "darwin" (used for the Rosetta check,
# which cares about the actual platform) — a separate $ASSET_OS is what feeds ASSET_NAME.
# ---------------------------------------------------------------------------
os_raw=$(uname -s)
arch_raw=$(uname -m)

case "$os_raw" in
  Darwin) OS=darwin; ASSET_OS=macos ;;
  Linux)  OS=linux;  ASSET_OS=linux ;;
  *) error "unsupported OS: $os_raw (ongame-cli v1 supports macOS and Linux; Windows is a fast-follow — see the plan's Repo-topology section)" ;;
esac

case "$arch_raw" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64)  ARCH=x64 ;;
  *) error "unsupported architecture: $arch_raw" ;;
esac

# Rosetta 2 detection on Apple Silicon Macs running an x86_64 shell — same idiom bun's installer
# uses (sysctl.proc_translated == 1 means "this process is x86_64 code running under Rosetta on an
# arm64 host"), so we fetch the native arm64 binary instead of needlessly running under emulation.
if [ "$OS" = "darwin" ] && [ "$ARCH" = "x64" ]; then
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
    ARCH=arm64
    info "Detected Rosetta 2 — installing the native arm64 build instead."
  fi
fi

ASSET_NAME="${BIN_NAME}-${ASSET_OS}-${ARCH}"

info "Detected platform: ${OS}/${ARCH} (asset: ${ASSET_NAME})"

# ---------------------------------------------------------------------------
# 2. Resolve the latest release, download the binary + checksums.txt, verify.
# ---------------------------------------------------------------------------
mkdir -p "$BIN_DIR"

info "Looking up the latest release..."
release_json=$(curl -fsSL -H "user-agent: ongame-cli-install.sh" "$API") \
  || error "could not reach GitHub Releases API (${API})"

# POSIX-sh JSON field extraction without jq (jq is not a safe dependency to assume) — good enough
# for the two flat string fields we need out of a GitHub Releases API response.
extract_json_field() {
  # $1 = field name, reads $release_json
  printf '%s' "$release_json" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -n1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/'
}
tag_name=$(extract_json_field tag_name)
[ -n "$tag_name" ] || error "could not parse a release tag from the GitHub API response"
info "Latest release: ${tag_name}"

# BUG FIX (found via a real end-to-end install test — GitHub's Releases API returns fully MINIFIED
# JSON, "name":"x" with no space, all on ONE line): the original download_url_for() hand-rolled an
# awk state machine over "name"/"browser_download_url" field pairs, assuming a multi-line, spaced
# document. Neither assumption holds against the real API response, so it always came back empty —
# `install.sh` failed for every single asset on the very first real run. GitHub's release-download
# URLs follow a documented, stable convention (`.../releases/download/<tag>/<filename>`), so this
# constructs the URL directly instead of parsing it back out of the JSON at all — no assumption
# about whitespace or line structure left to break. A genuinely missing/renamed asset still fails
# loudly: the subsequent `curl -fsSL` download itself 404s with a clear "download failed" error.
download_url_for() {
  printf '%s/%s/releases/download/%s/%s' "$GITHUB" "$REPO" "$tag_name" "$1"
}

bin_url=$(download_url_for "$ASSET_NAME")
checksums_url=$(download_url_for "checksums.txt")

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

info "Downloading ${ASSET_NAME}..."
curl -fsSL -o "${tmp_dir}/${ASSET_NAME}" "$bin_url" || error "download failed: ${bin_url}"
curl -fsSL -o "${tmp_dir}/checksums.txt" "$checksums_url" || error "download failed: ${checksums_url}"

info "Verifying checksum..."
# Match on BASENAME, not exact suffix: cli/package.json's local `checksums` script
# (`shasum -a 256 dist-bin/ongame-cli-* > dist-bin/checksums.txt`, run from the `cli/` root) embeds a
# `dist-bin/` prefix on every recorded filename. If the not-yet-built release workflow
# (release-cli.yml) reuses that script as-is instead of `cd`-ing into `dist-bin/` first, the
# published checksums.txt would carry the same prefix — awk splitting on "/" and comparing only the
# last path segment means this still verifies correctly either way.
expected=$(awk -v want="$ASSET_NAME" '
  { n = split($2, parts, "/"); base = parts[n]; sub(/^\*/, "", base); if (base == want) { print $1; exit } }
' "${tmp_dir}/checksums.txt")
[ -n "$expected" ] || error "checksums.txt has no entry for ${ASSET_NAME}"

if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "${tmp_dir}/${ASSET_NAME}" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "${tmp_dir}/${ASSET_NAME}" | awk '{print $1}')
else
  error "neither sha256sum nor shasum is available to verify the download"
fi

[ "$expected" = "$actual" ] || error "checksum mismatch for ${ASSET_NAME} (expected ${expected}, got ${actual}) — refusing to install a binary that doesn't match its published checksum"

mv "${tmp_dir}/${ASSET_NAME}" "${BIN_DIR}/${BIN_NAME}"
chmod +x "${BIN_DIR}/${BIN_NAME}"
printf '%s' "$tag_name" > "${BIN_DIR}/.${BIN_NAME}.version"

info "Installed ongame-cli ${tag_name} -> ${BIN_DIR}/${BIN_NAME}"

# ---------------------------------------------------------------------------
# 3. PATH — patch whichever shell rc exists. Idempotent: checks for our marker comment before
#    appending, so re-running install.sh (e.g. to fix a broken install) never duplicates the line.
# ---------------------------------------------------------------------------
PATH_MARKER="# ongame-cli (added by install.sh)"
PATH_LINE="export PATH=\"${BIN_DIR}:\$PATH\""

patch_rc() {
  rc_file="$1"
  [ -f "$rc_file" ] || return 0
  if grep -qF "$PATH_MARKER" "$rc_file" 2>/dev/null; then
    return 0
  fi
  {
    printf '\n%s\n' "$PATH_MARKER"
    printf '%s\n' "$PATH_LINE"
  } >> "$rc_file"
  info "Added ${BIN_DIR} to PATH in ${rc_file}"
}

patched_any=0
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
  if [ -f "$rc" ]; then
    patch_rc "$rc"
    patched_any=1
  fi
done
if [ "$patched_any" = "0" ]; then
  # No known rc file exists yet — create ~/.profile, the most POSIX-portable default (sourced by
  # login shells across sh/bash/zsh when nothing more specific exists).
  patch_rc_create="$HOME/.profile"
  : > "$patch_rc_create"
  patch_rc "$patch_rc_create"
fi

info "Open a new shell (or run: export PATH=\"${BIN_DIR}:\$PATH\") to use ongame-cli directly."

# ---------------------------------------------------------------------------
# 4. Claude Code detection — register the marketplace + install the plugin AUTOMATICALLY.
#
# Both `claude plugin marketplace add` and `claude plugin install` are real, non-interactive
# top-level CLI subcommands (verified empirically in a clean container). Two hard-won specifics:
#   - The marketplace source MUST be the full HTTPS URL: the bare `owner/repo` shorthand resolves to
#     an SSH clone URL (git@github.com:...), which fails on any machine without a GitHub SSH key —
#     i.e. most end-user machines.
#   - Both steps are guarded idempotently (list-then-act), so re-running install.sh never duplicates
#     or errors on an already-registered marketplace / already-installed plugin.
# Any failure falls back to printing the in-session commands — never a hard stop this late in an
# otherwise-successful install.
# ---------------------------------------------------------------------------
if command -v claude >/dev/null 2>&1; then
  info ""
  info "Claude Code detected — registering the ongame plugin..."
  plugin_setup_failed=""
  if claude plugin marketplace list 2>/dev/null | grep -q "ongame-cli"; then
    info "Marketplace already registered."
  elif ! claude plugin marketplace add "https://github.com/${REPO}"; then
    plugin_setup_failed=1
  fi
  if [ -z "$plugin_setup_failed" ]; then
    if claude plugin list 2>/dev/null | grep -q "ongame@ongame-cli"; then
      info "Plugin already installed."
    elif ! claude plugin install ongame@ongame-cli; then
      plugin_setup_failed=1
    fi
  fi
  if [ -z "$plugin_setup_failed" ]; then
    info ""
    info "ongame is ready. Open a Claude Code session and run:  /make-game <your game idea>"
    info "(If a session is already open, run /reload-plugins there first.)"
    info "First cloud call will open a browser sign-in — the agent handles it."
  else
    info ""
    info "Automatic plugin setup didn't complete — run these inside a Claude Code session instead:"
    info ""
    info "  /plugin marketplace add ${REPO}"
    info "  /plugin install ongame@ongame-cli"
    info ""
  fi
fi

# ---------------------------------------------------------------------------
# 5. Codex CLI detection — patch ~/.codex/config.toml's [mcp_servers.ongame] section.
#    Append-only: checks for the section header first so re-running this script never duplicates it.
# ---------------------------------------------------------------------------
CODEX_DIR="$HOME/.codex"
if [ -d "$CODEX_DIR" ]; then
  CODEX_CONFIG="${CODEX_DIR}/config.toml"
  SNIPPET_URL="https://raw.githubusercontent.com/${REPO}/main/codex/config-snippet.toml"
  if [ -f "$CODEX_CONFIG" ] && grep -qF "[mcp_servers.ongame]" "$CODEX_CONFIG" 2>/dev/null; then
    info "Codex CLI detected — [mcp_servers.ongame] already present in ${CODEX_CONFIG}, leaving it untouched."
  else
    info "Codex CLI detected — adding [mcp_servers.ongame] to ${CODEX_CONFIG}"
    touch "$CODEX_CONFIG"
    # Bare "ongame-cli" (relying on the PATH patch from step 3) rather than an absolute path: unlike
    # a GUI-launched MCP client, Codex CLI is itself invoked from a shell, so it inherits the same
    # PATH a terminal session would — this matches codex/config-snippet.toml exactly (that file's
    # shape is verified against a real local ~/.codex/config.toml, not guessed), so the fallback
    # below (used only if the network fetch of that file fails) can never silently drift from it.
    {
      printf '\n# ongame-cli (added by install.sh)\n'
      curl -fsSL "$SNIPPET_URL" || printf '[mcp_servers.ongame]\ncommand = "ongame-cli"\nargs = ["mcp"]\nstartup_timeout_sec = 120.0\n'
    } >> "$CODEX_CONFIG"
  fi
fi

info ""
info "Done. ongame-cli ${tag_name} is installed at ${BIN_DIR}/${BIN_NAME}."
