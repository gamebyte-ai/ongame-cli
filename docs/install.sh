#!/bin/sh
# ongame-cli installer.
#
#   curl -fsSL https://cli.ongame.ai/install.sh | sh
#
# Job, in order:
#   1. Detect OS/arch, download the matching `ongame-cli` binary + `checksums.txt` from this repo's
#      latest GitHub Release, verify sha256, install to ~/.ongame/bin/, chmod +x.
#   2. Add ~/.ongame/bin to PATH by patching whichever shell rc file exists (idempotent — checks for
#      a marker before appending, so re-running this script is always safe).
#   3. Hand off to `ongame-cli install` — the freshly verified binary does the rest of the wiring
#      (Claude Code plugin registration, Codex `[mcp_servers.ongame]`, the version file), because
#      install.ps1 must do exactly the same thing and one implementation cannot drift from itself.
#
# Windows has its own installer: `irm https://cli.ongame.ai/install.ps1 | iex`.
#
# Structural pattern (fail loudly, one-line progress messages, HTTPS-only) follows the
# rustup/bun install.sh convention — `set -eu` (POSIX sh, not bash: no `pipefail`, so pipelines
# are checked stage-by-stage instead; see download_to below), OS/arch detection via `uname -s`/
# `uname -m`, no interactive prompts.
set -eu

REPO="gamebyte-ai/ongame-cli"
# TEST-ONLY SEAMS. Identical in name and meaning to the ones cli/src/updater.ts already honours, so the whole
# download path — release lookup, asset URL construction, checksum verification — can be exercised end to end
# against a local mock server in CI instead of being the one production path nothing ever tests. Production never
# sets them; unset, these are exactly the literals they always were.
#
# NOT a weakening of the trust chain: the sha256 check below is unconditional and is performed against
# checksums.txt fetched from the SAME root as the binary, so a redirected root must still produce an internally
# consistent pair — the seam moves the whole chain, it cannot skip a link. And anyone who can set env vars on
# this shell can already prepend to PATH, which is strictly more powerful than this.
GITHUB="${ONGAME_LAUNCHER_DOWNLOAD_ROOT:-https://github.com}"
API="${ONGAME_LAUNCHER_API_ROOT:-https://api.github.com}/repos/${REPO}/releases/latest"
INSTALL_DIR="${ONGAME_INSTALL_DIR:-$HOME/.ongame}"
BIN_DIR="${INSTALL_DIR}/bin"
BIN_NAME="ongame-cli"

info()  { printf '%s\n' "$*" >&2; }
error() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || error "curl is required to install ongame-cli"

# ---------------------------------------------------------------------------
# 1. OS/arch detection → this repo's release-asset naming convention.
#
# VERIFIED (not guessed) against `cli/package.json`'s build scripts + `.github/workflows/release-cli.yml`'s
# publish list: the release carries FIVE binaries — `ongame-cli-macos-arm64`, `ongame-cli-macos-x64`,
# `ongame-cli-linux-x64`, `ongame-cli-linux-arm64` and `ongame-cli-windows-x64.exe`. Only the first four are
# reachable from this script (the Windows one is served by install.ps1, which is what the unsupported-OS
# branch below points at) — note the OS segment is "macos", NOT "darwin", even though `uname -s` reports
# "Darwin". $OS below stays "darwin" (used for the Rosetta check, which cares about the actual platform) —
# a separate $ASSET_OS is what feeds ASSET_NAME.
# ---------------------------------------------------------------------------
os_raw=$(uname -s)
arch_raw=$(uname -m)

case "$os_raw" in
  Darwin) OS=darwin; ASSET_OS=macos ;;
  Linux)  OS=linux;  ASSET_OS=linux ;;
  # Windows is supported now, just not by THIS script — it lands here from Git Bash/MSYS, where `uname -s`
  # reports MINGW64_NT-*. PowerShell is the right host there (it is present on every Windows install, unlike
  # Git Bash), so point at install.ps1 rather than dead-ending.
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    error "this script is for macOS and Linux. On Windows, run this in PowerShell instead:  irm https://cli.ongame.ai/install.ps1 | iex" ;;
  *) error "unsupported OS: $os_raw (ongame-cli supports macOS, Linux and Windows; on Windows run in PowerShell:  irm https://cli.ongame.ai/install.ps1 | iex)" ;;
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
# Match on BASENAME, not exact suffix. VERIFIED by running the real thing: cli/package.json's `checksums`
# script is `cd dist-bin && shasum -a 256 ongame-cli-* > checksums.txt`, and release-cli.yml runs exactly
# that script — because it `cd`s into dist-bin first, the published checksums.txt records BARE basenames
# with no `dist-bin/` prefix. (An earlier version of this comment claimed the opposite; it described a
# variant of the script that no longer exists.) The awk below splits on "/" and compares only the last path
# segment anyway, so it keeps verifying correctly if the recording side ever grows a path prefix again —
# a cheap tolerance, not a live requirement. `sub(/^\*/…)` strips the binary-mode marker `sha256sum` emits
# and `shasum` does not.
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
# 4. Post-install wiring — HANDED TO THE BINARY.
#
# `ongame-cli install` registers the Claude Code plugin (marketplace + plugin, both list-then-act
# guarded so re-running never duplicates anything, and always via the full HTTPS marketplace URL —
# the bare `owner/repo` shorthand resolves to an SSH clone URL and fails without a GitHub SSH key),
# patches Codex CLI's `[mcp_servers.ongame]` if `$CODEX_HOME`/`~/.codex` exists, and records the
# installed release tag for the launcher's self-update check.
#
# Why it moved out of this script: there are now TWO installers — this one and install.ps1 for
# Windows — and that logic is identical on both except for one string (the Codex `command` value).
# Duplicating it in PowerShell would guarantee the two drift; the binary that both installers just
# finished verifying is the one place they can share. This script keeps only what genuinely differs
# per platform: arch detection, download, checksum verification, PATH.
#
# It reports every outcome on stderr and ALWAYS exits 0 by contract — an absent Codex, a missing or
# broken `claude` CLI must never turn an otherwise-successful install into a failure. `|| true` is
# belt-and-braces against `set -e` should that contract ever be violated.
# ---------------------------------------------------------------------------
info ""
"${BIN_DIR}/${BIN_NAME}" install --version "$tag_name" || true

info ""
info "Done. ongame-cli ${tag_name} is installed at ${BIN_DIR}/${BIN_NAME}."
