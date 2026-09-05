#!/bin/sh
# End-to-end harness for install.sh. NOT shipped to end users — dev/CI-only tooling.
#
# WHAT IT PROVES. The download / checksum / PATH path of install.sh is exercised against
# test/mock-release-server.mjs; what nothing covered was the HAND-OFF — the one line where the script calls the
# binary it has just installed. That line acquired a job when the binary started asking which coding agents to
# wire: under `curl | sh` the script's stdin IS the pipe, and a child that inherits it reads the tail of the
# script instead of the user. So this harness runs the REAL script, PIPED, against the real mock server, with a
# stub standing in for the released binary that records (1) the argv it received and (2) whether its stdin was
# a terminal — the two facts the hand-off exists to get right. The stub is what the mock "release" serves, so
# the checksum chain is exercised too: a stub that did not match checksums.txt would never be run.
#
# The two terminal situations are FORCED, not assumed, so the results do not depend on where the harness runs:
#   - "no controlling terminal" (CI, cron, a detached agent): the run is placed in a NEW SESSION (python3
#     os.setsid, or util-linux setsid), where `: </dev/tty` fails with ENXIO even though /dev/tty exists.
#   - "a terminal, but stdin is the pipe" (a human running the one-liner): the run is placed under a fresh
#     PSEUDO-TERMINAL (python3 pty.fork), so /dev/tty is openable while sh's stdin is still the pipe.
#   A case is SKIPPED — reported, never counted as passed — when the tool needed to force it is missing.
#
# Nothing here touches the real home directory: every case gets a fresh $HOME with foreign config in it (an rc
# file, a Codex config) and the install root is pointed inside that HOME through ONGAME_INSTALL_DIR. The
# script must leave the foreign config byte-identical; that is asserted, not assumed.
#
# Run:  sh test/install_sh_test.sh                     (needs node + curl; python3 for the forced-terminal cases)
#       INSTALL_SHELL=dash sh test/install_sh_test.sh  (run the installer under a stricter POSIX sh)
set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
INSTALL_SH="${REPO_ROOT}/install.sh"
MOCK="${REPO_ROOT}/test/mock-release-server.mjs"
# The shell the piped installer runs under. `sh` is what the documented one-liner uses; `dash` is the
# strictest widely available POSIX sh and catches bashisms macOS's /bin/sh (bash in POSIX mode) forgives.
INSTALL_SHELL="${INSTALL_SHELL:-sh}"
TAG="cli-v9.9.9"

PASS=0
FAIL=0
SKIP=0

assert_eq() {
  # $1 = label, $2 = expected, $3 = actual
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); printf 'ok   - %s\n' "$1"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL - %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"
  fi
}

assert_contains() {
  # $1 = label, $2 = haystack, $3 = needle
  case "$2" in
    *"$3"*) PASS=$((PASS + 1)); printf 'ok   - %s\n' "$1" ;;
    *) FAIL=$((FAIL + 1)); printf 'FAIL - %s\n       expected to contain: %s\n       actual: %s\n' "$1" "$3" "$2" ;;
  esac
}

assert_not_contains() {
  # $1 = label, $2 = haystack, $3 = needle that must NOT appear
  case "$2" in
    *"$3"*) FAIL=$((FAIL + 1)); printf 'FAIL - %s\n       must NOT contain: %s\n       actual: %s\n' "$1" "$3" "$2" ;;
    *) PASS=$((PASS + 1)); printf 'ok   - %s\n' "$1" ;;
  esac
}

skip() { SKIP=$((SKIP + 1)); printf 'SKIP - %s\n' "$1"; }

for tool in node curl; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'error: %s is required to run this harness\n' "$tool" >&2; exit 1; }
done
command -v "$INSTALL_SHELL" >/dev/null 2>&1 || { printf 'error: INSTALL_SHELL=%s is not on PATH\n' "$INSTALL_SHELL" >&2; exit 1; }

WORK=$(mktemp -d)
FIXTURES="${WORK}/release"
mkdir -p "$FIXTURES"

# ---------------------------------------------------------------------------
# The stub "binary". It is served by the mock release under EVERY asset name install.sh can compute, so the
# harness is host-independent (macOS arm64/x64, Linux x64/arm64 all download "their" file and get this).
# It records argv one token per bracket — brackets, so a value containing a space or an empty value would be
# visible — plus whether fd 0 is a terminal, then exits 0 exactly like the real `install` subcommand (which
# ALWAYS exits 0 by contract). It never reads stdin: the only thing about stdin under test is what it IS.
# ---------------------------------------------------------------------------
cat > "${FIXTURES}/stub.sh" <<'STUB'
#!/bin/sh
{
  printf 'argv:'; for a in "$@"; do printf ' [%s]' "$a"; done; printf '\n'
  if [ -t 0 ]; then printf 'stdin_tty=yes\n'; else printf 'stdin_tty=no\n'; fi
} >> "${ONGAME_TEST_ARGV_LOG:?ONGAME_TEST_ARGV_LOG must be set}"
printf 'stub: ongame-cli %s\n' "$*" >&2
exit 0
STUB
for asset in ongame-cli-macos-arm64 ongame-cli-macos-x64 ongame-cli-linux-x64 ongame-cli-linux-arm64; do
  cp "${FIXTURES}/stub.sh" "${FIXTURES}/${asset}"
done
rm -f "${FIXTURES}/stub.sh"

# ---------------------------------------------------------------------------
# Mock release server on an ephemeral port (`--port 0`; it prints the bound port as `LISTENING <port>`).
# ---------------------------------------------------------------------------
SRV_OUT="${WORK}/server.out"
SRV_ERR="${WORK}/server.err"
node "$MOCK" --port 0 --dir "$FIXTURES" --tag "$TAG" >"$SRV_OUT" 2>"$SRV_ERR" &
SRV_PID=$!
trap 'kill "$SRV_PID" 2>/dev/null; wait "$SRV_PID" 2>/dev/null; rm -rf "$WORK"' EXIT
i=0
while ! grep -q '^LISTENING ' "$SRV_OUT" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 100 ]; then printf 'error: mock release server did not start\n' >&2; cat "$SRV_ERR" >&2; exit 1; fi
  sleep 0.1
done
PORT=$(sed -n 's/^LISTENING //p' "$SRV_OUT" | head -n1)
ROOT="http://127.0.0.1:${PORT}"
printf 'mock release server on %s (tag %s), installer shell: %s\n' "$ROOT" "$TAG" "$INSTALL_SHELL"

# ---------------------------------------------------------------------------
# Forcing the two terminal situations.
# ---------------------------------------------------------------------------
PTY_DRIVER="${WORK}/pty-run.py"
cat > "$PTY_DRIVER" <<'PY'
# Run argv[1:] as the session leader of a FRESH pseudo-terminal, relay everything it writes to our stdout,
# exit with its status. A hard deadline guarantees the harness can never hang on a prompt that should not
# have been shown — that failure mode is exactly what one of the cases is looking for.
import os, pty, select, signal, sys, time
cmd = sys.argv[1:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)
out = b''
status = None
deadline = time.time() + 60
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.1)
    if r:
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            chunk = b''
        if not chunk:
            break
        out += chunk
    wp, st = os.waitpid(pid, os.WNOHANG)
    if wp:
        status = st
        while True:
            r, _, _ = select.select([fd], [], [], 0.2)
            if not r:
                break
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            out += chunk
        break
if status is None:
    try:
        wp, st = os.waitpid(pid, os.WNOHANG)
        if wp:
            status = st
        else:
            os.kill(pid, signal.SIGKILL)
            _, status = os.waitpid(pid, 0)
            out += b'\n[pty-run: TIMEOUT, child killed]\n'
    except ChildProcessError:
        status = 0
sys.stdout.buffer.write(out)
sys.stdout.flush()
sys.exit(os.waitstatus_to_exitcode(status) if hasattr(os, 'waitstatus_to_exitcode') else (status >> 8))
PY

have_python=no; command -v python3 >/dev/null 2>&1 && have_python=yes
# "detached" = no controlling terminal at all. Prefer python3's os.setsid (portable to macOS, which has no
# setsid binary); fall back to util-linux `setsid -w` (waits and propagates the exit code); if neither exists
# but this very process has no controlling terminal either, plain execution is already that situation.
can_detach=no
if [ "$have_python" = yes ] || command -v setsid >/dev/null 2>&1; then can_detach=yes
elif ! ( : </dev/tty ) 2>/dev/null; then can_detach=yes
fi

# run_install <home> <mode> "<VAR=value ...>" [installer options...]
#   mode: detached — no controlling terminal (CI / cron shape)
#         pty      — a fresh pseudo-terminal, sh's stdin still the pipe (human one-liner shape)
#         plain    — whatever this harness process has (used only where the terminal state is irrelevant)
# The installer is always run the documented way — PIPED into `$INSTALL_SHELL -s -- <options>` — with a clean
# environment for the variables under test (CI, ONGAME_AGENTS) and with every path pointed inside <home>.
# Extra environment for a case is the third argument: a space-separated string of `VAR=value` words ("" for
# none) — env(1) syntax, kept separate from the options because env would otherwise try to EXECUTE `--all`.
# stdout → $OUT, stderr → $ERR (a pty merges the two into $OUT), exit code returned.
run_install() {
  rh=$1; mode=$2; extra_env=$3; shift 3
  OUT="${rh}/run.out"; ERR="${rh}/run.err"
  # $extra_env is deliberately UNQUOTED below: it is a space-separated list of `VAR=value` words for env(1)
  # (never values with spaces), and an empty string must expand to no words at all.
  # shellcheck disable=SC2086,SC2016
  set -- env -u CI -u ONGAME_AGENTS \
    HOME="$rh" ONGAME_INSTALL_DIR="${rh}/.ongame" ONGAME_TEST_ARGV_LOG="${rh}/argv.log" \
    ONGAME_LAUNCHER_API_ROOT="$ROOT" ONGAME_LAUNCHER_DOWNLOAD_ROOT="$ROOT" \
    $extra_env \
    sh -c 'f=$1; s=$2; shift 2; cat "$f" | "$s" -s -- "$@"' _ "$INSTALL_SH" "$INSTALL_SHELL" "$@"
  # ^ the command every mode wrapper runs: `cat install.sh | <shell> -s -- <options>` — the pipe is the point.
  #   (SC2016: the single quotes are deliberate — $1/$2/"$@" there belong to the INNER sh, not to this one.)
  case "$mode" in
    detached)
      if [ "$have_python" = yes ]; then
        python3 -c 'import os, sys; os.setsid(); os.execvp(sys.argv[1], sys.argv[1:])' "$@" >"$OUT" 2>"$ERR"
      elif command -v setsid >/dev/null 2>&1; then
        setsid -w "$@" >"$OUT" 2>"$ERR"
      else
        "$@" >"$OUT" 2>"$ERR"
      fi ;;
    pty)   python3 "$PTY_DRIVER" "$@" >"$OUT" 2>"$ERR" ;;
    plain) "$@" >"$OUT" 2>"$ERR" ;;
  esac
}

# A fresh HOME per case, with foreign config the installer must leave alone.
fresh_home() {
  fh=$(mktemp -d "${WORK}/home.XXXXXX")
  printf '# my zshrc\nexport EDITOR=vim\n' > "${fh}/.zshrc"
  mkdir -p "${fh}/.codex"
  printf 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "npx"\nargs = ["-y", "some-mcp"]\n' > "${fh}/.codex/config.toml"
  cp "${fh}/.codex/config.toml" "${fh}/.codex-config.orig"
  printf '%s' "$fh"
}

argv_of() { grep '^argv:' "$1/argv.log" 2>/dev/null | tail -n1; }
tty_of()  { grep '^stdin_tty=' "$1/argv.log" 2>/dev/null | tail -n1; }
count_marker() { grep -c '# ongame-cli (added by install.sh)' "$1" 2>/dev/null || true; }
# Every wiring call must start with the version hand-off; the selection controls come after it.
PREFIX="argv: [install] [--version] [${TAG}]"

# ===========================================================================
echo ""
echo "=== case 1: piped, NO controlling terminal -> installs, hands off with --yes, never blocks ==="
if [ "$can_detach" = yes ]; then
  h=$(fresh_home)
  run_install "$h" detached ""; code=$?
  argv=$(argv_of "$h")
  assert_eq       "1: exit code 0" "0" "$code"
  assert_contains "1: wiring call is 'install --version <tag> ...'" "$argv" "$PREFIX"
  assert_contains "1: --yes appended (nobody to ask)" "$argv" "[--yes]"
  assert_eq       "1: the binary's stdin is not a terminal" "stdin_tty=no" "$(tty_of "$h")"
  assert_contains "1: user told why no prompt appeared" "$(cat "$ERR")" "No terminal to ask on"
  assert_eq       "1: install.sh writes nothing to stdout" "" "$(cat "$OUT")"
  assert_eq       "1: binary installed and executable" "yes" "$([ -x "${h}/.ongame/bin/ongame-cli" ] && echo yes || echo no)"
  assert_eq       "1: version file records the release tag" "$TAG" "$(cat "${h}/.ongame/bin/.ongame-cli.version")"
  assert_eq       "1: rc file patched exactly once" "1" "$(count_marker "${h}/.zshrc")"
  assert_eq       "1: foreign Codex config left byte-identical" "yes" "$(cmp -s "${h}/.codex/config.toml" "${h}/.codex-config.orig" && echo yes || echo no)"
else
  skip "1: cannot force a no-terminal session here (needs python3 or setsid)"
fi

echo ""
echo "=== case 2: piped FROM A TERMINAL -> the binary gets /dev/tty on stdin, NO --yes (the prompt can happen) ==="
if [ "$have_python" = yes ]; then
  h=$(fresh_home)
  run_install "$h" pty ""; code=$?
  argv=$(argv_of "$h")
  assert_eq           "2: exit code 0" "0" "$code"
  assert_contains     "2: wiring call is 'install --version <tag> ...'" "$argv" "$PREFIX"
  assert_not_contains "2: --yes NOT appended" "$argv" "[--yes]"
  assert_eq           "2: the binary's stdin IS a terminal although sh's was the pipe" "stdin_tty=yes" "$(tty_of "$h")"
  assert_not_contains "2: no 'no terminal' message" "$(cat "$OUT")" "No terminal to ask on"
else
  skip "2: cannot allocate a pseudo-terminal here (needs python3)"
fi

echo ""
echo "=== case 3: ONGAME_AGENTS env -> forwarded as --agents, and no --yes (an explicit selection needs no prompt) ==="
if [ "$can_detach" = yes ]; then
  h=$(fresh_home)
  run_install "$h" detached "ONGAME_AGENTS=codex,gemini"; code=$?
  argv=$(argv_of "$h")
  assert_eq           "3: exit code 0" "0" "$code"
  assert_contains     "3: --agents codex,gemini forwarded" "$argv" "[--agents] [codex,gemini]"
  assert_not_contains "3: --yes NOT appended" "$argv" "[--yes]"
  assert_not_contains "3: no 'no terminal' message" "$(cat "$ERR")" "No terminal to ask on"
else
  skip "3: cannot force a no-terminal session here"
fi

echo ""
echo "=== case 4: sh -s -- --all reaches the binary ==="
if [ "$can_detach" = yes ]; then
  h=$(fresh_home)
  run_install "$h" detached "" --all; code=$?
  argv=$(argv_of "$h")
  assert_eq           "4: exit code 0" "0" "$code"
  assert_contains     "4: --all forwarded" "$argv" "[--all]"
  assert_not_contains "4: --yes NOT appended" "$argv" "[--yes]"
else
  skip "4: cannot force a no-terminal session here"
fi

echo ""
echo "=== case 5: an explicit --agents flag beats ONGAME_AGENTS ==="
if [ "$can_detach" = yes ]; then
  h=$(fresh_home)
  run_install "$h" detached "ONGAME_AGENTS=gemini" --agents claude,codex; code=$?
  argv=$(argv_of "$h")
  assert_eq           "5: exit code 0" "0" "$code"
  assert_contains     "5: flag value forwarded" "$argv" "[--agents] [claude,codex]"
  assert_not_contains "5: env value dropped" "$argv" "gemini"
else
  skip "5: cannot force a no-terminal session here"
fi

echo ""
echo "=== case 6: --agents=a,b is normalised to the two-token form; -y forwarded once; --no-agents forwarded ==="
if [ "$can_detach" = yes ]; then
  h=$(fresh_home)
  run_install "$h" detached "" --agents=claude,cursor -y --no-agents; code=$?
  argv=$(argv_of "$h")
  assert_eq           "6: exit code 0" "0" "$code"
  assert_contains     "6: --agents=… became '--agents a,b'" "$argv" "[--agents] [claude,cursor]"
  assert_not_contains "6: the = spelling never reaches the binary" "$argv" "[--agents=claude,cursor]"
  assert_eq           "6: -y forwarded as --yes exactly once (no second one from the no-terminal fallback)" "1" "$(printf '%s' "$argv" | grep -o '\[--yes\]' | wc -l | tr -d ' ')"
  assert_contains     "6: --no-agents forwarded" "$argv" "[--no-agents]"
  assert_eq           "6: order preserved" "${PREFIX} [--agents] [claude,cursor] [--yes] [--no-agents]" "$argv"
else
  skip "6: cannot force a no-terminal session here"
fi

echo ""
echo "=== case 7: an unknown option fails BEFORE any network call, with the option named ==="
h=$(fresh_home)
requests_before=$(grep -c '^\[mock\]' "$SRV_ERR" 2>/dev/null || true)
run_install "$h" plain "" --bogus; code=$?
requests_after=$(grep -c '^\[mock\]' "$SRV_ERR" 2>/dev/null || true)
assert_eq       "7: exit code 1" "1" "$code"
assert_contains "7: names the option" "$(cat "$ERR")" "unknown option: --bogus"
assert_eq       "7: no request reached the release server" "$requests_before" "$requests_after"
assert_eq       "7: nothing installed" "no" "$([ -e "${h}/.ongame/bin/ongame-cli" ] && echo yes || echo no)"
assert_eq       "7: rc file untouched" "0" "$(count_marker "${h}/.zshrc")"

echo ""
echo "=== case 8: --agents without a value is an error, not a silent prompt ==="
h=$(fresh_home)
run_install "$h" plain "" --agents; code=$?
assert_eq       "8: exit code 1" "1" "$code"
assert_contains "8: says what is missing" "$(cat "$ERR")" "--agents needs a value"
h=$(fresh_home)
run_install "$h" plain "" --agents=; code=$?
assert_eq       "8: --agents= (empty) also exit code 1" "1" "$code"

echo ""
echo "=== case 9: --help prints the options and downloads nothing ==="
h=$(fresh_home)
requests_before=$(grep -c '^\[mock\]' "$SRV_ERR" 2>/dev/null || true)
run_install "$h" plain "" --help; code=$?
requests_after=$(grep -c '^\[mock\]' "$SRV_ERR" 2>/dev/null || true)
assert_eq       "9: exit code 0" "0" "$code"
assert_contains "9: lists --agents" "$(cat "$ERR")" "--agents a,b"
assert_contains "9: documents the env form ON sh" "$(cat "$ERR")" "| ONGAME_AGENTS=codex,gemini sh"
assert_eq       "9: no request reached the release server" "$requests_before" "$requests_after"
assert_eq       "9: nothing installed" "no" "$([ -e "${h}/.ongame/bin/ongame-cli" ] && echo yes || echo no)"

echo ""
echo "=== case 10: re-run is a no-op on the rc file; the binary is re-invoked (it owns idempotency of the wiring) ==="
if [ "$can_detach" = yes ]; then
  h=$(fresh_home)
  run_install "$h" detached ""; code1=$?
  run_install "$h" detached ""; code2=$?
  assert_eq "10: first run exit 0" "0" "$code1"
  assert_eq "10: second run exit 0" "0" "$code2"
  assert_eq "10: rc marker present exactly once after two runs" "1" "$(count_marker "${h}/.zshrc")"
  assert_eq "10: original rc lines intact" "2" "$(grep -c -e '# my zshrc' -e 'export EDITOR=vim' "${h}/.zshrc")"
  assert_eq "10: binary invoked on both runs (re-detect and offer again is ITS job)" "2" "$(grep -c '^argv:' "${h}/argv.log")"
  assert_eq "10: foreign Codex config still byte-identical" "yes" "$(cmp -s "${h}/.codex/config.toml" "${h}/.codex-config.orig" && echo yes || echo no)"
  assert_contains "10: second run did not re-append the PATH line" "$(cat "$ERR")" "Done."
  assert_not_contains "10: second run did not announce a PATH edit" "$(cat "$ERR")" "Added ${h}/.ongame/bin to PATH"
else
  skip "10: cannot force a no-terminal session here"
fi

echo ""
echo "=== case 11: CI set -> --yes even WITH a terminal available (a CI runner with a pty must not hang) ==="
if [ "$have_python" = yes ]; then
  h=$(fresh_home)
  run_install "$h" pty "CI=true"; code=$?
  argv=$(argv_of "$h")
  assert_eq       "11: exit code 0" "0" "$code"
  assert_contains "11: --yes appended" "$argv" "[--yes]"
  assert_contains "11: says why" "$(cat "$OUT")" "CI is set"
  assert_eq       "11: /dev/tty NOT handed over — the binary is told, not asked" "stdin_tty=no" "$(tty_of "$h")"
else
  skip "11: cannot allocate a pseudo-terminal here (needs python3)"
fi

echo ""
echo "=================================================="
echo "PASS: $PASS   FAIL: $FAIL   SKIP: $SKIP"
echo "=================================================="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
