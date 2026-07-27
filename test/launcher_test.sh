#!/bin/sh
# Test harness for bin/ongame-launcher. NOT shipped to end users — dev/CI-only tooling.
#
# Each test case gets a fresh $HOME (so ~/.ongame/bin state never leaks between cases) and a fresh
# local mock GitHub server (Python's stdlib http.server, rooted at a directory whose layout mirrors
# the exact URL paths the launcher requests) via the launcher's ONGAME_LAUNCHER_API_ROOT /
# ONGAME_LAUNCHER_DOWNLOAD_ROOT test-only overrides — production defaults to the real GitHub hosts
# and is never touched by these overrides.
#
# Run: sh test/launcher_test.sh
set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
LAUNCHER="${REPO_ROOT}/bin/ongame-launcher"

WORK=$(mktemp -d)
trap 'kill_server; rm -rf "$WORK"' EXIT INT TERM

PASS=0
FAIL=0
SERVER_PID=""

kill_server() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}

# Picks a free TCP port by asking the OS for one and immediately releasing it — a small race window
# exists (another process could grab it first) but is fine for a local, sequential test run.
free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}

# Sets globals MOCK_PORT and SERVER_PID rather than echoing (command-substitution capture) — a
# background job's fds get inherited by the capture pipe if invoked as `x=$(start_mock_server ..)`,
# and since http.server never exits, the pipe's write end never closes and the substitution hangs
# forever. Plain global-variable assignment sidesteps the whole class of bug.
start_mock_server() {
  # $1 = directory to serve
  MOCK_PORT=$(free_port)
  ( cd "$1" && exec python3 -m http.server "$MOCK_PORT" --bind 127.0.0.1 ) >"${WORK}/server.log" 2>&1 &
  SERVER_PID=$!
  i=0
  while [ "$i" -lt 50 ]; do
    if curl -fsS --max-time 1 "http://127.0.0.1:${MOCK_PORT}/" >/dev/null 2>&1; then
      break
    fi
    i=$((i + 1))
    sleep 0.1
  done
}

# Builds a fresh mock-root directory laid out to match the exact paths the launcher requests:
#   repos/gamebyte-ai/ongame-cli/releases/latest                       <- release JSON
#   gamebyte-ai/ongame-cli/releases/download/<tag>/<asset>             <- binary
#   gamebyte-ai/ongame-cli/releases/download/<tag>/checksums.txt       <- checksums
mock_root_with_release() {
  # $1 = target dir, $2 = tag, $3 = release JSON body (or empty to skip), $4 = asset filename
  # (or empty to skip asset+checksums files)
  dir="$1"; tag="$2"; json="$3"; asset="$4"
  mkdir -p "${dir}/repos/gamebyte-ai/ongame-cli/releases"
  if [ -n "$json" ]; then
    printf '%s' "$json" > "${dir}/repos/gamebyte-ai/ongame-cli/releases/latest"
  fi
  if [ -n "$asset" ]; then
    mkdir -p "${dir}/gamebyte-ai/ongame-cli/releases/download/${tag}"
    printf 'FAKE-BINARY-CONTENT-%s' "$tag" > "${dir}/gamebyte-ai/ongame-cli/releases/download/${tag}/${asset}"
    sha=$(shasum -a 256 "${dir}/gamebyte-ai/ongame-cli/releases/download/${tag}/${asset}" | awk '{print $1}')
    printf '%s  %s\n' "$sha" "$asset" > "${dir}/gamebyte-ai/ongame-cli/releases/download/${tag}/checksums.txt"
  fi
}

fresh_home() {
  h=$(mktemp -d)
  mkdir -p "${h}/.ongame/bin"
  printf '#!/bin/sh\nprintf "REAL_CLI_STUB args:%%s\\n" "$*" >&1\nprintf "stub-stderr\\n" >&2\nexit "${STUB_EXIT_CODE:-0}"\n' > "${h}/.ongame/bin/ongame-cli"
  chmod +x "${h}/.ongame/bin/ongame-cli"
  printf '%s' "$h"
}

assert_eq() {
  # $1 = label, $2 = expected, $3 = actual
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1))
    printf 'ok   - %s\n' "$1"
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL - %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"
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

# Real macOS/Linux platform for this test run (tests assume the CI/dev box is one of the two
# supported platforms — matches the launcher's own supported-platform assumption).
os_raw=$(uname -s)
case "$os_raw" in
  Darwin) ASSET_OS=macos ;;
  Linux) ASSET_OS=linux ;;
  *) echo "unsupported test-runner OS: $os_raw"; exit 1 ;;
esac
arch_raw=$(uname -m)
case "$arch_raw" in
  arm64|aarch64) ASSET_ARCH=arm64 ;;
  x86_64|amd64) ASSET_ARCH=x64 ;;
  *) echo "unsupported test-runner arch: $arch_raw"; exit 1 ;;
esac
ASSET_NAME="ongame-cli-${ASSET_OS}-${ASSET_ARCH}"

echo "=== test 1: binary not installed -> exits 1, prints install command, no self-update attempted ==="
h=$(mktemp -d)
out=$(HOME="$h" sh "$LAUNCHER" mcp 2>&1)
code=$?
assert_eq "not-installed: exit code" "1" "$code"
assert_contains "not-installed: message" "$out" "is not installed"
assert_contains "not-installed: install command shown" "$out" "curl -fsSL"
rm -rf "$h"

echo ""
echo "=== test 2: already up to date -> no download attempted, execs stub, forwards argv, forwards exit code ==="
h=$(fresh_home)
printf '%s' "cli-v9.9.9" > "${h}/.ongame/bin/.ongame-cli.version"
mock_dir="${WORK}/mock2"
mock_root_with_release "$mock_dir" "cli-v9.9.9" '{"tag_name":"cli-v9.9.9","assets":[]}' ""
start_mock_server "$mock_dir"; port="$MOCK_PORT"
out=$(HOME="$h" ONGAME_LAUNCHER_API_ROOT="http://127.0.0.1:${port}" ONGAME_LAUNCHER_DOWNLOAD_ROOT="http://127.0.0.1:${port}" sh "$LAUNCHER" mcp foo bar 2>/tmp/launcher_test_stderr.$$)
code=$?
err=$(cat "/tmp/launcher_test_stderr.$$"); rm -f "/tmp/launcher_test_stderr.$$"
kill_server
assert_eq "up-to-date: exit code" "0" "$code"
assert_contains "up-to-date: argv forwarded" "$out" "REAL_CLI_STUB args:mcp foo bar"
assert_not_contains "up-to-date: launcher logs never on stdout" "$out" "[ongame-launcher]"
assert_contains "up-to-date: stub stderr passed through" "$err" "stub-stderr"
rm -rf "$h"

echo ""
echo "=== test 3: exit code passthrough (nonzero) ==="
h=$(fresh_home)
printf '%s' "cli-v9.9.9" > "${h}/.ongame/bin/.ongame-cli.version"
mock_dir="${WORK}/mock3"
mock_root_with_release "$mock_dir" "cli-v9.9.9" '{"tag_name":"cli-v9.9.9","assets":[]}' ""
start_mock_server "$mock_dir"; port="$MOCK_PORT"
STUB_EXIT_CODE=42 HOME="$h" ONGAME_LAUNCHER_API_ROOT="http://127.0.0.1:${port}" ONGAME_LAUNCHER_DOWNLOAD_ROOT="http://127.0.0.1:${port}" sh "$LAUNCHER" mcp >/dev/null 2>&1
code=$?
kill_server
assert_eq "exit-code-passthrough" "42" "$code"
rm -rf "$h"

echo ""
echo "=== test 4: network error (unreachable API) -> falls through gracefully, still execs stub ==="
h=$(fresh_home)
out=$(HOME="$h" ONGAME_LAUNCHER_API_ROOT="http://127.0.0.1:1" ONGAME_LAUNCHER_DOWNLOAD_ROOT="http://127.0.0.1:1" sh "$LAUNCHER" mcp 2>/tmp/launcher_test_stderr.$$)
code=$?
err=$(cat "/tmp/launcher_test_stderr.$$"); rm -f "/tmp/launcher_test_stderr.$$"
assert_eq "network-error: exit code (still 0, execs stub)" "0" "$code"
assert_contains "network-error: stub still ran" "$out" "REAL_CLI_STUB"
assert_contains "network-error: logged the failure" "$err" "could not check for updates"
rm -rf "$h"

echo ""
echo "=== test 5: malformed release JSON (no tag_name) -> falls through gracefully ==="
h=$(fresh_home)
mock_dir="${WORK}/mock5"
mock_root_with_release "$mock_dir" "cli-vX" '{"not_a_tag":"whatever"}' ""
start_mock_server "$mock_dir"; port="$MOCK_PORT"
out=$(HOME="$h" ONGAME_LAUNCHER_API_ROOT="http://127.0.0.1:${port}" ONGAME_LAUNCHER_DOWNLOAD_ROOT="http://127.0.0.1:${port}" sh "$LAUNCHER" mcp 2>/tmp/launcher_test_stderr.$$)
code=$?
err=$(cat "/tmp/launcher_test_stderr.$$"); rm -f "/tmp/launcher_test_stderr.$$"
kill_server
assert_eq "malformed-json: exit code" "0" "$code"
assert_contains "malformed-json: stub still ran" "$out" "REAL_CLI_STUB"
assert_contains "malformed-json: logged the failure" "$err" "malformed release metadata"
rm -rf "$h"

echo ""
echo "=== test 6: update available but checksums.txt has no matching entry -> refuses, keeps old binary ==="
h=$(fresh_home)
printf '%s' "cli-v0.0.1" > "${h}/.ongame/bin/.ongame-cli.version"
old_content=$(cat "${h}/.ongame/bin/ongame-cli")
mock_dir="${WORK}/mock6"
mkdir -p "${mock_dir}/repos/gamebyte-ai/ongame-cli/releases"
printf '{"tag_name":"cli-v0.0.2","assets":[]}' > "${mock_dir}/repos/gamebyte-ai/ongame-cli/releases/latest"
mkdir -p "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2"
printf 'NEW-CONTENT' > "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2/${ASSET_NAME}"
printf 'deadbeef  some-other-asset\n' > "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2/checksums.txt"
start_mock_server "$mock_dir"; port="$MOCK_PORT"
out=$(HOME="$h" ONGAME_LAUNCHER_API_ROOT="http://127.0.0.1:${port}" ONGAME_LAUNCHER_DOWNLOAD_ROOT="http://127.0.0.1:${port}" sh "$LAUNCHER" mcp 2>/tmp/launcher_test_stderr.$$)
code=$?
err=$(cat "/tmp/launcher_test_stderr.$$"); rm -f "/tmp/launcher_test_stderr.$$"
kill_server
new_content=$(cat "${h}/.ongame/bin/ongame-cli")
assert_eq "no-checksum-entry: exit code" "0" "$code"
assert_contains "no-checksum-entry: logged skip" "$err" "no entry for"
assert_eq "no-checksum-entry: binary unchanged" "$old_content" "$new_content"
rm -rf "$h"

echo ""
echo "=== test 7: update available but checksum MISMATCH -> refuses, keeps old binary ==="
h=$(fresh_home)
printf '%s' "cli-v0.0.1" > "${h}/.ongame/bin/.ongame-cli.version"
old_content=$(cat "${h}/.ongame/bin/ongame-cli")
mock_dir="${WORK}/mock7"
mkdir -p "${mock_dir}/repos/gamebyte-ai/ongame-cli/releases"
printf '{"tag_name":"cli-v0.0.2","assets":[]}' > "${mock_dir}/repos/gamebyte-ai/ongame-cli/releases/latest"
mkdir -p "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2"
printf 'NEW-CONTENT' > "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2/${ASSET_NAME}"
printf 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef  %s\n' "$ASSET_NAME" > "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2/checksums.txt"
start_mock_server "$mock_dir"; port="$MOCK_PORT"
out=$(HOME="$h" ONGAME_LAUNCHER_API_ROOT="http://127.0.0.1:${port}" ONGAME_LAUNCHER_DOWNLOAD_ROOT="http://127.0.0.1:${port}" sh "$LAUNCHER" mcp 2>/tmp/launcher_test_stderr.$$)
code=$?
err=$(cat "/tmp/launcher_test_stderr.$$"); rm -f "/tmp/launcher_test_stderr.$$"
kill_server
new_content=$(cat "${h}/.ongame/bin/ongame-cli")
assert_eq "checksum-mismatch: exit code" "0" "$code"
assert_contains "checksum-mismatch: logged refusal" "$err" "checksum verification failed"
assert_eq "checksum-mismatch: binary unchanged" "$old_content" "$new_content"
rm -rf "$h"

echo ""
echo "=== test 8: real, valid update -> downloads, verifies, atomically swaps, updates version file, execs NEW binary ==="
h=$(fresh_home)
printf '%s' "cli-v0.0.1" > "${h}/.ongame/bin/.ongame-cli.version"
mock_dir="${WORK}/mock8"
mkdir -p "${mock_dir}/repos/gamebyte-ai/ongame-cli/releases"
printf '{"tag_name":"cli-v0.0.2","assets":[]}' > "${mock_dir}/repos/gamebyte-ai/ongame-cli/releases/latest"
mkdir -p "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2"
printf '#!/bin/sh\nprintf "NEW_STUB_RAN args:%%s\\n" "$*"\nexit 0\n' > "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2/${ASSET_NAME}"
sha=$(shasum -a 256 "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2/${ASSET_NAME}" | awk '{print $1}')
printf '%s  %s\n' "$sha" "$ASSET_NAME" > "${mock_dir}/gamebyte-ai/ongame-cli/releases/download/cli-v0.0.2/checksums.txt"
start_mock_server "$mock_dir"; port="$MOCK_PORT"
out=$(HOME="$h" ONGAME_LAUNCHER_API_ROOT="http://127.0.0.1:${port}" ONGAME_LAUNCHER_DOWNLOAD_ROOT="http://127.0.0.1:${port}" sh "$LAUNCHER" mcp hello 2>/tmp/launcher_test_stderr.$$)
code=$?
err=$(cat "/tmp/launcher_test_stderr.$$"); rm -f "/tmp/launcher_test_stderr.$$"
kill_server
new_version=$(cat "${h}/.ongame/bin/.ongame-cli.version")
leftover=$(find "${h}/.ongame/bin" -maxdepth 1 -name '.update-*' | wc -l | tr -d ' ')
assert_eq "real-update: exit code" "0" "$code"
assert_contains "real-update: NEW binary actually executed" "$out" "NEW_STUB_RAN args:mcp hello"
assert_contains "real-update: logged the update" "$err" "updated ongame-cli"
assert_eq "real-update: version file updated" "cli-v0.0.2" "$new_version"
assert_eq "real-update: no leftover temp dirs" "0" "$leftover"
rm -rf "$h"

echo ""
echo "=== test 9: curl missing from PATH -> self-update skipped cleanly, still execs stub ==="
h=$(fresh_home)
nopath=$(mktemp -d)
# minimal PATH with sh/uname/etc but no curl — copy the essential POSIX utilities the launcher
# itself needs (uname, sed, grep, awk, mktemp, mv, chmod, cat) so only curl is truly absent, not
# "every command is missing" (which would fail for reasons unrelated to what this test checks).
for tool in uname sed grep awk mktemp mv chmod cat sh dirname basename tr wc find kill sleep; do
  p=$(command -v "$tool" 2>/dev/null) && ln -sf "$p" "${nopath}/${tool}"
done
out=$(HOME="$h" PATH="$nopath" sh "$LAUNCHER" mcp 2>/tmp/launcher_test_stderr.$$)
code=$?
err=$(cat "/tmp/launcher_test_stderr.$$"); rm -f "/tmp/launcher_test_stderr.$$"
assert_eq "no-curl: exit code" "0" "$code"
assert_contains "no-curl: stub still ran" "$out" "REAL_CLI_STUB"
assert_contains "no-curl: logged the skip" "$err" "curl not found"
rm -rf "$h" "$nopath"

echo ""
echo "=== test 10: no version file yet (first launch after a fresh install) + up-to-date-equivalent (no assets) still execs cleanly ==="
h=$(fresh_home)
mock_dir="${WORK}/mock10"
mock_root_with_release "$mock_dir" "cli-v1.0.0" '{"tag_name":"cli-v1.0.0","assets":[]}' ""
start_mock_server "$mock_dir"; port="$MOCK_PORT"
out=$(HOME="$h" ONGAME_LAUNCHER_API_ROOT="http://127.0.0.1:${port}" ONGAME_LAUNCHER_DOWNLOAD_ROOT="http://127.0.0.1:${port}" sh "$LAUNCHER" mcp 2>/tmp/launcher_test_stderr.$$)
code=$?
err=$(cat "/tmp/launcher_test_stderr.$$"); rm -f "/tmp/launcher_test_stderr.$$"
kill_server
assert_eq "no-version-file: exit code" "0" "$code"
assert_contains "no-version-file: refused (no asset in mock) still falls through" "$out" "REAL_CLI_STUB"
rm -rf "$h"

echo ""
echo "=== test 11: stale .update-* temp dir from a hard-killed previous run is swept on the next launch ==="
h=$(fresh_home)
mkdir -p "${h}/.ongame/bin/.update-leftover123"
printf 'orphaned partial download' > "${h}/.ongame/bin/.update-leftover123/bin"
out=$(HOME="$h" ONGAME_LAUNCHER_API_ROOT="http://127.0.0.1:1" ONGAME_LAUNCHER_DOWNLOAD_ROOT="http://127.0.0.1:1" sh "$LAUNCHER" mcp 2>&1 >/dev/null)
code=$?
leftover_after=$(find "${h}/.ongame/bin" -maxdepth 1 -name '.update-*' | wc -l | tr -d ' ')
assert_eq "stale-sweep: exit code" "0" "$code"
assert_eq "stale-sweep: orphaned dir removed" "0" "$leftover_after"
rm -rf "$h"

echo ""
echo "=================================================="
echo "PASS: $PASS   FAIL: $FAIL"
echo "=================================================="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
