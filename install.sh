#!/bin/sh
# ongame-cli installer.
#
#   curl -fsSL https://cli.ongame.ai/install.sh | sh
#
# Job, in order:
#   1. Detect OS/arch, download the matching `ongame-cli` binary + `checksums.txt` from this repo's
#      latest GitHub Release, verify sha256, install to ~/.ongame/bin/, chmod +x.
#   2. Add ~/.ongame/bin to PATH by patching every shell startup file that exists — including bash's
#      ~/.bash_profile and a fish conf.d snippet (idempotent: keyed on the directory itself, so re-running
#      is always safe and installing somewhere new actually updates the line instead of doing nothing).
#   3. Hand off to `ongame-cli install` — the freshly verified binary does the rest: it detects the coding
#      agents present on this machine (Claude Code, Codex, Gemini CLI, Cursor, Windsurf, Copilot CLI,
#      opencode, Amp), asks which of them to set up when it can reach your terminal (the usual ones are
#      pre-selected; Enter accepts), wires each one, verifies the result by reading it back, and prints
#      per agent what to type to start. That step is ONE implementation shared with install.ps1, so the
#      two installers cannot drift.
#
# Choosing agents without the prompt. `curl … | sh` alone cannot take flags, so there are three forms:
#
#   curl -fsSL https://cli.ongame.ai/install.sh | ONGAME_AGENTS=codex,gemini sh   # env var — ON `sh`, see below
#   curl -fsSL https://cli.ongame.ai/install.sh | sh -s -- --all                   # flags, after `sh -s --`
#   ongame-cli install --agents codex,gemini                                       # re-run, any time later
#
#   --agents a,b    set up exactly these agents          --all         set up every agent detected
#   -y, --yes       accept the defaults, never ask       --no-agents   install the binary only
#   --no-path-update  leave every shell startup file alone (env form: ONGAME_NO_PATH_UPDATE=1)
#
# The flags are forwarded to `ongame-cli install` unchanged; a `--agents` flag beats ONGAME_AGENTS. The env
# assignment goes on `sh`, the LAST command of the pipeline: `ONGAME_AGENTS=x curl … | sh` binds the variable
# to curl only and `sh` never sees it (POSIX: a prefix assignment applies to that one command) — a mistake
# that silently produces the default selection. `sh -s --` is needed for flags: `-s` makes sh read the
# script from stdin and hand everything after `--` to it as "$@". Re-running `ongame-cli install` on its own
# re-detects and offers again — that is also how an agent installed later gets added.
#
# Windows has its own installer: `irm https://cli.ongame.ai/install.ps1 | iex`.
#
# Structural pattern (fail loudly, one-line progress messages, HTTPS-only) follows the
# rustup/bun install.sh convention — `set -eu` (POSIX sh, not bash: no `pipefail`, so pipelines
# are checked stage-by-stage instead; see download_to below), OS/arch detection via `uname -s`/
# `uname -m`. This script itself never prompts: the one interactive step belongs to the binary, and
# section 4 below only makes sure the binary can reach the terminal (or is told not to try).
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

# HOME is needed twice: for the default install root, and for the PATH step at the end. `env -i`, a systemd
# unit with no `User=`, `su` without `-l` and some container images all leave it unset. Decide it HERE, once,
# rather than tripping over it after the download and aborting on `set -u` with a bare "HOME: parameter not
# set" and a half-finished install (binary present, no PATH, no agents wired).
HOME_DIR="${HOME:-}"
if [ -z "$HOME_DIR" ] && [ -z "${ONGAME_INSTALL_DIR:-}" ]; then
  printf 'error: %s\n' "neither HOME nor ONGAME_INSTALL_DIR is set, so there is nowhere to install to. Set one and re-run, e.g.  ONGAME_INSTALL_DIR=/opt/ongame sh install.sh" >&2
  exit 1
fi
INSTALL_DIR="${ONGAME_INSTALL_DIR:-${HOME_DIR}/.ongame}"
BIN_DIR="${INSTALL_DIR}/bin"
BIN_NAME="ongame-cli"

# HTTPS-only, ENFORCED rather than asserted (rustup's guard). `-L` on its own follows a 30x ACROSS schemes, so
# a redirect to http:// — a captive portal, a misconfigured mirror, a hostile value of the two root vars above
# — is otherwise followed in silence. `--proto-redir` is unconditional: no request can ever DOWNGRADE to
# plaintext, whatever it started as. `--proto` (which constrains the FIRST request) and `--tlsv1.2` are added
# only when the URL already is https, because the test seams above legitimately point at a local http mock.
proto_args() {
  case "$1" in
    https://*) printf '%s' '--proto =https --proto-redir =https --tlsv1.2' ;;
    *)         printf '%s' '--proto-redir =https' ;;
  esac
}

info()  { printf '%s\n' "$*" >&2; }
error() { printf 'error: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. Options. Everything after `sh -s --` arrives as "$@". This script recognises ONLY the agent-selection
#    controls and forwards them to `ongame-cli install` unchanged — it does not interpret them; the binary
#    is the authority on agent ids and on what each flag means. Anything else is an error, raised BEFORE any
#    network call: a typo such as `--agent codex` must not "work" by silently falling through to the prompt.
#
#    `need_tty` (rustup-init.sh's name for the same variable) records whether the binary still has a question
#    to ask. Any explicit selection settles it, so no terminal is sought and none is needed — that is what
#    lets `sh -s -- --all` run unattended from a pipe with no controlling terminal at all.
#
#    POSIX sh has no arrays, so the forwarded list is rebuilt IN "$@" itself: each original is consumed off
#    the front (`shift`) and its normalised form appended to the back (`set -- "$@" …`); `n` counts the
#    originals still unread, so `$1` is guaranteed to be an original whenever a value is taken. After the
#    loop, "$@" holds exactly the arguments the binary gets, in the order given.
# ---------------------------------------------------------------------------
usage() {
  cat >&2 <<'USAGE'
ongame-cli installer

  curl -fsSL https://cli.ongame.ai/install.sh | sh                                # asks which coding agents to set up
  curl -fsSL https://cli.ongame.ai/install.sh | sh -s -- [options]
  curl -fsSL https://cli.ongame.ai/install.sh | ONGAME_AGENTS=codex,gemini sh     # the env var goes on `sh`

Options (forwarded to `ongame-cli install`):
  --agents a,b   set up exactly these coding agents, e.g. --agents claude,codex,gemini
  --all          set up every coding agent detected on this machine
  -y, --yes      accept the default selection without asking
  --no-agents    install the binary only; set up agents later with `ongame-cli install`

Options handled here (NOT forwarded):
  --no-path-update  do not touch any shell startup file; print the PATH line instead
  -h, --help        show this help

Environment:
  ONGAME_AGENTS=a,b    same as --agents (an explicit --agents flag wins over it)
  ONGAME_INSTALL_DIR   where to install (default: ~/.ongame)
  ONGAME_NO_PATH_UPDATE  set to any non-empty value: same as --no-path-update
  CI                   when set, never asks — same as --yes

Re-run `ongame-cli install` at any time to add a coding agent you installed later.
USAGE
}

need_tty=yes
agents_flag=no
# `--no-path-update` is the ONE option this script acts on itself instead of forwarding: the PATH edit is the
# installer's job, not the binary's (install.ps1's -NoPathUpdate is the same switch, kept in step with it).
no_path_update=no
n=$#
while [ "$n" -gt 0 ]; do
  arg=$1; shift; n=$((n - 1))
  case "$arg" in
    -y|--yes)     need_tty=no; set -- "$@" --yes ;;
    --all)        need_tty=no; set -- "$@" --all ;;
    --no-agents)  need_tty=no; set -- "$@" --no-agents ;;
    --no-path-update) no_path_update=yes ;;
    # Both spellings are accepted; the binary is handed the two-token form only, so it has ONE shape to parse.
    --agents=*)
      [ -n "${arg#--agents=}" ] || error "--agents needs a value, e.g. --agents claude,codex"
      need_tty=no; agents_flag=yes; set -- "$@" --agents "${arg#--agents=}" ;;
    --agents)
      { [ "$n" -gt 0 ] && [ -n "$1" ]; } || error "--agents needs a value, e.g. --agents claude,codex"
      need_tty=no; agents_flag=yes; set -- "$@" --agents "$1"; shift; n=$((n - 1)) ;;
    -h|--help)    usage; exit 0 ;;
    *)            error "unknown option: $arg (for the list:  curl -fsSL https://cli.ongame.ai/install.sh | sh -s -- --help)" ;;
  esac
done
# The env form of --agents, for the one-liner that cannot carry flags. An explicit --agents flag wins over it
# (flag > env > prompt > defaults — the Homebrew/deno precedence); any other flags are forwarded alongside it.
if [ "$agents_flag" = no ] && [ -n "${ONGAME_AGENTS:-}" ]; then
  need_tty=no; set -- "$@" --agents "$ONGAME_AGENTS"
fi
# The env form of --no-path-update, for the one-liner that cannot carry flags (install.ps1 reads exactly the
# same variable). The flag wins; the variable only fills in what was not passed.
if [ "$no_path_update" = no ] && [ -n "${ONGAME_NO_PATH_UPDATE:-}" ]; then
  no_path_update=yes
fi

command -v curl >/dev/null 2>&1 || error "curl is required to install ongame-cli"

# Running as root. `sudo` is the reflex the moment a one-liner prints a permission error, and with sudo's
# default env_reset HOME becomes /root: the binary lands in /root/.ongame/bin, root's shell profile is the one
# patched, and the coding agents are wired for root — while the user who typed it gets nothing and is told
# nothing. Not fatal (installing as root into a system-wide ONGAME_INSTALL_DIR is legitimate), so this names
# what is actually happening and moves on.
if [ "$(id -u 2>/dev/null || echo 1000)" = "0" ]; then
  info "Running as root: installing into ${INSTALL_DIR} and setting up coding agents for the root account."
  if [ -n "${SUDO_USER:-}" ]; then
    info "You ran this with sudo, so ${SUDO_USER} will NOT get ongame-cli. Nothing here needs root — run it as yourself:  curl -fsSL https://cli.ongame.ai/install.sh | sh"
  fi
fi

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
install_dir_existed=yes
[ -d "$INSTALL_DIR" ] || install_dir_existed=no
mkdir -p "$BIN_DIR"
# Explicit mode, NOT whatever the umask leaves behind: under `umask 000` (not exotic — CI images, some Docker
# bases, shared build boxes) a bare mkdir yields a world-WRITABLE directory holding an executable that is on
# the user's PATH, which is a local-privilege-escalation surface. Same reason as the chmod 755 on the binary
# below.
#
# The PARENT gets the same treatment, and it is not redundant: a world-writable ~/.ongame lets anyone who can
# reach it rename `bin` aside and put their own `bin/ongame-cli` there — the executable is captured without
# ever writing inside the 0755 directory. Applied when we just created it, and when an earlier run under a
# loose umask already left it other-writable (that install is still on this machine's PATH), but never to a
# pre-existing directory the user chose and set up themselves.
chmod 755 "$BIN_DIR" 2>/dev/null || true
if [ "$install_dir_existed" = no ] || [ -n "$(find "$INSTALL_DIR" -maxdepth 0 -perm -0002 2>/dev/null)" ]; then
  chmod 755 "$INSTALL_DIR" 2>/dev/null || true
fi

info "Looking up the latest release..."
# shellcheck disable=SC2046  # proto_args prints several flags that MUST word-split into separate arguments
release_json=$(curl -fsSL $(proto_args "$API") -H "user-agent: ongame-cli-install.sh" "$API") \
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

# Stage INSIDE $BIN_DIR, not in $TMPDIR. The final move must be a rename on the same volume — an atomic
# metadata operation — and not a cross-volume copy: /tmp is a separate filesystem on the systemd default
# (tmpfs) and in most containers, and there `mv` degrades to copy+unlink. That is how an interrupted or
# out-of-space run leaves a TRUNCATED ongame-cli that has already passed its checksum, and how a copy over a
# currently-running binary fails with ETXTBSY halfway. A rename has neither failure mode. `.update-` is the
# prefix the binary's own self-updater already sweeps, so an interrupted run leaves nothing that outlives it.
tmp_dir=$(mktemp -d "${BIN_DIR}/.update-XXXXXX") || error "could not create a staging directory in ${BIN_DIR} — is it writable?"
trap 'rm -rf "$tmp_dir"' EXIT

info "Downloading ${ASSET_NAME}..."
# shellcheck disable=SC2046  # see proto_args: the flags must word-split into separate arguments
curl -fsSL $(proto_args "$bin_url") -o "${tmp_dir}/${ASSET_NAME}" "$bin_url" || error "download failed: ${bin_url} (note: a redirect to a plain http:// URL is refused, not followed)"
# shellcheck disable=SC2046
curl -fsSL $(proto_args "$checksums_url") -o "${tmp_dir}/checksums.txt" "$checksums_url" || error "download failed: ${checksums_url} (note: a redirect to a plain http:// URL is refused, not followed)"

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

# Case-insensitively: sha256 is hex, and the recording side's case is not part of the guarantee (`shasum`
# and `sha256sum` emit lower case, but a checksums.txt produced by certutil/Get-FileHash — as install.ps1's
# `-ine` compare already allows for — is upper case). A case difference is not a mismatch; treating it as one
# would reject a perfectly good binary.
expected=$(printf '%s' "$expected" | tr 'ABCDEF' 'abcdef')
actual=$(printf '%s' "$actual" | tr 'ABCDEF' 'abcdef')
[ "$expected" = "$actual" ] || error "checksum mismatch for ${ASSET_NAME} (expected ${expected}, got ${actual}) — refusing to install a binary that doesn't match its published checksum"

# chmod BEFORE the move, so the file at its final path is never briefly non-executable, and 755 rather than
# `+x`, which only ADDS bits: `curl -o` creates the file 0666 & ~umask, so under `umask 000` a bare `chmod +x`
# leaves a world-writable executable on PATH.
chmod 755 "${tmp_dir}/${ASSET_NAME}"
mv -f "${tmp_dir}/${ASSET_NAME}" "${BIN_DIR}/${BIN_NAME}" \
  || error "could not install to ${BIN_DIR}/${BIN_NAME} — nothing was changed; check the directory's permissions"
printf '%s' "$tag_name" > "${BIN_DIR}/.${BIN_NAME}.version"

info "Installed ongame-cli ${tag_name} -> ${BIN_DIR}/${BIN_NAME}"

# ---------------------------------------------------------------------------
# 3. PATH — patch every shell startup file that already exists.
#
# Idempotency is keyed on the DIRECTORY, not on the marker comment: a second install into a different
# ONGAME_INSTALL_DIR must update the line, and the marker-only check silently left the user's `ongame-cli`
# resolving to the old install forever while still printing "open a new shell".
#
# The file list is every startup file a login shell of the shells we support actually reads. `~/.profile` is
# NOT a safe blanket default: bash reads `~/.bash_profile` (then `~/.bash_login`) and STOPS — `~/.profile` is
# read only when neither exists — and fish reads none of them, so writing `export PATH=…` there was both the
# wrong file and the wrong syntax while the script reported success. Fish gets its own conf.d snippet.
# ---------------------------------------------------------------------------
PATH_MARKER="# ongame-cli (added by install.sh)"
# The block is CLOSED as well as opened. Everything between the two markers is ours, so a re-install can
# remove exactly what a previous run wrote — no more, no less — and append the current one at the end.
PATH_MARKER_END="# ongame-cli end"

# Quote a directory as ONE literal word. `export PATH="${BIN_DIR}:$PATH"` looked right and was not: the rc
# file is re-read by a shell, so a directory containing $, `, \ or " is EXPANDED at that point (MEASURED: an
# install into a directory literally named `literal$FOO` produced a PATH entry the new shell could not find).
# Single quotes suppress every expansion; the only character that cannot appear inside them is the quote
# itself, which is spliced in as '\'' — end the string, an escaped quote, start it again. $PATH stays OUTSIDE
# the quotes so it still expands, which is the whole point of the line.
shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}
# fish needs one more step: inside its single quotes a backslash is an ESCAPE character (sh treats it as a
# literal), so a backslash in the path has to be doubled. `\'` outside quotes means a literal quote in fish
# exactly as it does in sh, so the splice itself carries over unchanged.
fish_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/'\\\\''/g")"
}

BIN_DIR_SQ=$(shell_quote "$BIN_DIR")
PATH_LINE="export PATH=${BIN_DIR_SQ}:\"\$PATH\""

patched_any=0

# strip_managed <file> — the file with every block we have ever written removed, on stdout.
#   Closed blocks (marker … end marker) go whole. A block from an OLDER install had no end marker, so the
#   skip also ends at the first line that is not one of the shapes this script writes — the user's own lines
#   are never in danger. A blank line immediately before a marker is dropped with it, so repeated re-installs
#   cannot accumulate blank lines.
strip_managed() {
  awk -v mark="$PATH_MARKER" -v endm="$PATH_MARKER_END" '
    function flush() { if (held) { print heldline; held = 0 } }
    {
      if (skip) {
        if ($0 == endm) { skip = 0; next }
        if ($0 ~ /^export PATH=/ || $0 ~ /^if type -q fish_add_path/ || $0 ~ /^[[:space:]]*fish_add_path / \
            || $0 == "else" || $0 ~ /^[[:space:]]*set -gx PATH / || $0 == "end") { next }
        skip = 0
      }
      if ($0 == mark) { held = 0; skip = 1; next }
      if ($0 ~ /^[[:space:]]*$/) { flush(); heldline = $0; held = 1; next }
      flush(); print
    }
    END { flush() }
  ' "$1"
}

# rc_warn <file> <what-to-add> — the file could not be written. NOT fatal, and this is the whole point:
# the binary is already installed and the agent hand-off below is the step the user actually came for, so a
# read-only or root-owned rc file (a managed dotfile, a stow/chezmoi symlink into a read-only store, an rc
# belonging to another shell) must cost them one line to paste, not the rest of the install.
rc_warn() {
  info "Warning: could not update ${1} (not writable), so PATH was left alone there. Add this to it yourself:  ${2}"
}

# patch_rc <file> <body>
#   Idempotency is keyed on an ACTIVE (uncommented) mention of the CURRENT bin directory — not on the marker,
#   and not on the directory appearing anywhere in the file. Both weaker tests were wrong in a way that left
#   the user with a working-looking install pointing at the wrong binary: the directory named only inside a
#   COMMENT counted as "already on PATH", and finding our marker for a DIFFERENT directory stopped the update,
#   so an A -> B -> A sequence left B's stale line last and B's binary winning. Anything else rewrites: our
#   previous block is removed and the current one appended at the end, where a later PATH entry wins in every
#   shell here.
patch_rc() {
  rc_file="$1"
  rc_body="$2"
  [ -f "$rc_file" ] || return 0

  rc_marker=no
  grep -qF "$PATH_MARKER" "$rc_file" 2>/dev/null && rc_marker=yes
  # Comment lines are stripped before looking for the directory, so a mention inside a comment (ours or the
  # user's) cannot pass for a live PATH entry.
  if grep -v '^[[:space:]]*#' "$rc_file" 2>/dev/null | grep -qF "$BIN_DIR"; then
    # Already live in this file — ours from an earlier run, or a line the user wrote. Either way, nothing to
    # do and nothing to announce.
    patched_any=1
    return 0
  fi

  if [ "$rc_marker" = yes ]; then
    rc_note="Updated the ongame-cli PATH line in ${rc_file} — it now points at ${BIN_DIR}."
  else
    rc_note="Added ${BIN_DIR} to PATH in ${rc_file}"
  fi

  if [ ! -w "$rc_file" ]; then
    rc_warn "$rc_file" "$rc_body"
    return 0
  fi

  # Built in full beside the file and then copied OVER it, rather than moved onto it: a move would replace
  # the user's rc file with a new inode, dropping its mode, its owner and — for the dotfile managers people
  # actually use — the symlink itself.
  rc_tmp="${rc_file}.ongame-tmp.$$"
  if ! strip_managed "$rc_file" > "$rc_tmp" 2>/dev/null; then
    rm -f "$rc_tmp"; rc_warn "$rc_file" "$rc_body"; return 0
  fi
  if ! { printf '\n%s\n' "$PATH_MARKER"; printf '%s\n' "$rc_body"; printf '%s\n' "$PATH_MARKER_END"; } >> "$rc_tmp" 2>/dev/null; then
    rm -f "$rc_tmp"; rc_warn "$rc_file" "$rc_body"; return 0
  fi
  if ! cat "$rc_tmp" > "$rc_file" 2>/dev/null; then
    rm -f "$rc_tmp"; rc_warn "$rc_file" "$rc_body"; return 0
  fi
  rm -f "$rc_tmp"
  patched_any=1
  info "$rc_note"
}

# fish reads neither the rc files above nor their syntax. Anything dropped in conf.d is sourced by every fish
# session (interactive or not), which is the officially documented place for exactly this.
patch_fish() {
  fish_conf_dir="${HOME_DIR}/.config/fish/conf.d"
  fish_file="${fish_conf_dir}/ongame.fish"
  fish_body="if type -q fish_add_path
    fish_add_path $(fish_quote "$BIN_DIR")
else
    set -gx PATH $(fish_quote "$BIN_DIR") \$PATH
end"
  if ! mkdir -p "$fish_conf_dir" 2>/dev/null; then
    rc_warn "$fish_file" "$fish_body"; return 0
  fi
  if [ ! -f "$fish_file" ] && ! : >> "$fish_file" 2>/dev/null; then
    rc_warn "$fish_file" "$fish_body"; return 0
  fi
  patch_rc "$fish_file" "$fish_body"
}

# create_rc <file> — create it empty first, so patch_rc (which only touches files that exist) will write it.
create_rc() {
  if [ ! -f "$1" ] && ! : >> "$1" 2>/dev/null; then
    rc_warn "$1" "$PATH_LINE"; return 1
  fi
  return 0
}

if [ "$no_path_update" = yes ]; then
  info "Skipping the PATH update (--no-path-update). Add this line yourself when you want it:  ${PATH_LINE}"
elif [ -z "$HOME_DIR" ]; then
  info "HOME is not set, so no shell startup file was changed. Add this to yours by hand:  ${PATH_LINE}"
else
  for rc in "$HOME_DIR/.zshrc" "$HOME_DIR/.bashrc" "$HOME_DIR/.bash_profile" "$HOME_DIR/.bash_login" "$HOME_DIR/.profile"; do
    patch_rc "$rc" "$PATH_LINE"
  done
  if [ -d "${HOME_DIR}/.config/fish" ]; then
    patch_fish
  fi
  if [ "$patched_any" = "0" ]; then
    # Nothing exists yet. Create the file THIS user's shell will actually READ — not ~/.profile, which zsh
    # does not read at all (MEASURED: `zsh -lic 'command -v ongame-cli'` still exited 1 after a "successful"
    # install that wrote ~/.profile) and which bash reads only when neither ~/.bash_profile nor ~/.bash_login
    # exists. For csh/tcsh there is nothing here we can write correctly, so say so instead of claiming a PATH
    # edit that will never take effect.
    case "${SHELL:-}" in
      */fish)       patch_fish ;;
      */zsh)        create_rc "${HOME_DIR}/.zshrc" && patch_rc "${HOME_DIR}/.zshrc" "$PATH_LINE" ;;
      # macOS Terminal/iTerm start every shell as a LOGIN shell, which reads ~/.bash_profile and never
      # ~/.bashrc; on Linux the terminal starts an interactive non-login shell, which is the other way round.
      # Whichever we create is then the only one that exists, so bash's own fallback chain does the rest.
      */bash)
        if [ "$OS" = "darwin" ]; then bash_rc="${HOME_DIR}/.bash_profile"; else bash_rc="${HOME_DIR}/.bashrc"; fi
        create_rc "$bash_rc" && patch_rc "$bash_rc" "$PATH_LINE" ;;
      */csh|*/tcsh) info "Your shell (${SHELL}) keeps its PATH in a file this installer does not edit. Add this line to it yourself:  setenv PATH ${BIN_DIR}:\$PATH" ;;
      *)            create_rc "${HOME_DIR}/.profile" && patch_rc "${HOME_DIR}/.profile" "$PATH_LINE" ;;
    esac
  fi
fi

if [ "$patched_any" = "1" ]; then
  info "Open a new shell (or run: ${PATH_LINE}) to use ongame-cli directly."
else
  info "PATH was not changed. To use ongame-cli directly, run:  ${PATH_LINE}"
fi

# ---------------------------------------------------------------------------
# 4. Post-install wiring — HANDED TO THE BINARY.
#
# `ongame-cli install` detects the coding agents on this machine, asks which to set up when it can reach a
# terminal (flags and ONGAME_AGENTS, forwarded in "$@", settle it without asking), wires each one — every
# write is read-first, so a re-run reports "already wired" and changes nothing — verifies by reading back,
# and prints per agent what to type. It also records the installed release tag for the self-update check.
#
# Why it lives in the binary and not here: install.ps1 must do exactly the same thing, and two copies of
# that logic (one sh, one PowerShell) would drift within a release or two. This script keeps only what
# genuinely differs per platform: arch detection, download, checksum verification, PATH — and, below, the
# one thing a `curl | sh` host must do for a child that wants to talk to the user.
#
# THE TERMINAL HAND-OFF (rustup-init.sh's idiom, with a real probe in place of its `[ -t 1 ]` proxy). Under
# `curl … | sh` this shell's stdin IS the pipe the script arrives on; a child that inherits it reads the
# tail of this very file, not the user. So when stdin is not a terminal, the binary's stdin is connected to
# /dev/tty explicitly. Existence tests cannot make that decision — MEASURED: with no controlling terminal
# (CI, cron, a detached agent) `[ -e /dev/tty ]` and `[ -c /dev/tty ]` are both TRUE and the open still
# fails with ENXIO — so the probe is an OPEN ATTEMPT, and it runs in a subshell because a failed redirection
# on `exec` exits dash/sh outright (POSIX: a redirection error on a special builtin), while `( : </dev/tty )`
# merely returns non-zero. If the open fails there is nobody to ask: `--yes` is appended so the binary takes
# the defaults and can never block. `CI` set → the same, without probing (the deno/Homebrew convention): a
# CI runner that allocates a pseudo-terminal would otherwise sit on the prompt until the job times out.
#
# When the binary has nothing to ask (a flag settled it) and stdin is not a terminal, it gets /dev/null —
# never the pipe. sh reads this script incrementally, so a child that read the pipe would eat the lines
# after its own invocation; /dev/null makes that impossible whatever the binary does.
#
# It reports every outcome on stderr and ALWAYS exits 0 by contract — an absent agent or a broken agent CLI
# must never turn an otherwise-successful install into a failure. `|| true` is belt-and-braces against
# `set -e` should that contract ever be violated.
# ---------------------------------------------------------------------------
run_wiring() {
  "${BIN_DIR}/${BIN_NAME}" install --version "$tag_name" "$@" || true
}

info ""
if [ "$need_tty" = yes ] && [ -n "${CI:-}" ]; then
  info "CI is set — using the default agent selection without asking. Change it any time with:  ongame-cli install"
  need_tty=no; set -- "$@" --yes
fi

if [ -t 0 ]; then
  # `sh install.sh`, or `bash -c "$(curl …)"`: stdin already is the terminal — inherit it.
  run_wiring "$@"
elif [ "$need_tty" = yes ] && ( : </dev/tty ) 2>/dev/null; then
  # `curl | sh` from a terminal: stdin is the pipe; hand the binary the terminal itself.
  run_wiring "$@" </dev/tty
else
  if [ "$need_tty" = yes ]; then
    info "No terminal to ask on — using the default agent selection. Change it any time with:  ongame-cli install"
    set -- "$@" --yes
  fi
  run_wiring "$@" </dev/null
fi

info ""
info "Done. ongame-cli ${tag_name} is installed at ${BIN_DIR}/${BIN_NAME}."
