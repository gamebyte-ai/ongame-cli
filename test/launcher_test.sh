#!/bin/sh
# Test harness for bin/ongame-launcher. NOT shipped to end users — dev/CI-only tooling.
#
# SCOPE (deliberately small): the launcher is now a TRAMPOLINE. Self-update moved into the binary
# (cli/src/updater.ts) when Windows support landed, because the Windows twin — bin/ongame-launcher.exe, a ~10KB C
# trampoline — could never have run a shell updater. Everything this harness used to cover about downloading,
# verifying and swapping a release now lives in cli/test/updater.test.ts as real unit tests, which is a strict
# upgrade: they assert the win32 rename-aside swap and its crash recovery too, which no bash harness could.
#
# Moved to cli/test/updater.test.ts: the network-error, malformed-JSON, no-checksum-entry, checksum-mismatch,
# real-update, no-version-file and stale-temp-dir-sweep cases (plus new win32 swap / restore / recovery cases).
# Dropped outright: the "curl missing from PATH" case — the launcher no longer shells out to curl at all, and the
# binary's updater uses fetch(), so there is nothing left for that case to protect.
#
# Kept here: exactly what a trampoline still does — resolve the install path, hard-fail with the install hint
# when there is no binary, exec, and pass argv/stdio/exit code through untouched.
#
# Run: sh test/launcher_test.sh
set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
LAUNCHER="${REPO_ROOT}/bin/ongame-launcher"

PASS=0
FAIL=0

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

# A fresh $HOME per case, holding a stub that stands in for the compiled binary: it echoes its argv on stdout,
# writes to stderr, and exits with $STUB_EXIT_CODE.
fresh_home() {
  h=$(mktemp -d)
  mkdir -p "${h}/.ongame/bin"
  printf '#!/bin/sh\nprintf "REAL_CLI_STUB args:%%s\\n" "$*" >&1\nprintf "stub-stderr\\n" >&2\nexit "${STUB_EXIT_CODE:-0}"\n' > "${h}/.ongame/bin/ongame-cli"
  chmod +x "${h}/.ongame/bin/ongame-cli"
  printf '%s' "$h"
}

echo "=== test 1: binary not installed -> exits 1, prints the install command ==="
h=$(mktemp -d)
out=$(HOME="$h" sh "$LAUNCHER" mcp 2>&1)
code=$?
assert_eq "not-installed: exit code" "1" "$code"
assert_contains "not-installed: message" "$out" "is not installed"
assert_contains "not-installed: install command shown" "$out" "curl -fsSL"
rm -rf "$h"

echo ""
echo "=== test 2: binary present but not executable -> same hard fail (a half-finished install is not an install) ==="
h=$(mktemp -d)
mkdir -p "${h}/.ongame/bin"
printf 'not executable' > "${h}/.ongame/bin/ongame-cli"
out=$(HOME="$h" sh "$LAUNCHER" mcp 2>&1)
code=$?
assert_eq "not-executable: exit code" "1" "$code"
assert_contains "not-executable: message" "$out" "is not installed"
rm -rf "$h"

echo ""
echo "=== test 3: execs the binary, forwards argv, keeps stdout clean, passes stderr through ==="
h=$(fresh_home)
out=$(HOME="$h" sh "$LAUNCHER" mcp foo bar 2>/tmp/launcher_test_stderr.$$)
code=$?
err=$(cat "/tmp/launcher_test_stderr.$$"); rm -f "/tmp/launcher_test_stderr.$$"
assert_eq "exec: exit code" "0" "$code"
assert_contains "exec: argv forwarded" "$out" "REAL_CLI_STUB args:mcp foo bar"
assert_not_contains "exec: launcher logs never on stdout" "$out" "[ongame-launcher]"
assert_contains "exec: stub stderr passed through" "$err" "stub-stderr"
rm -rf "$h"

echo ""
echo "=== test 4: exit code passthrough (nonzero) ==="
h=$(fresh_home)
STUB_EXIT_CODE=42 HOME="$h" sh "$LAUNCHER" mcp >/dev/null 2>&1
code=$?
assert_eq "exit-code-passthrough" "42" "$code"
rm -rf "$h"

echo ""
echo "=== test 5: ONGAME_INSTALL_DIR overrides \$HOME/.ongame (mirrors install.sh and the .exe trampoline) ==="
h=$(fresh_home)
other=$(mktemp -d)
mkdir -p "${other}/bin"
printf '#!/bin/sh\nprintf "CUSTOM_DIR_STUB\\n"\n' > "${other}/bin/ongame-cli"
chmod +x "${other}/bin/ongame-cli"
out=$(HOME="$h" ONGAME_INSTALL_DIR="$other" sh "$LAUNCHER" mcp 2>&1)
code=$?
assert_eq "install-dir-override: exit code" "0" "$code"
assert_contains "install-dir-override: ran the binary from the override" "$out" "CUSTOM_DIR_STUB"
rm -rf "$h" "$other"

echo ""
echo "=== test 6: neither ONGAME_INSTALL_DIR nor HOME set -> explicit error, no silent guess ==="
out=$(env -u HOME sh "$LAUNCHER" mcp 2>&1)
code=$?
assert_eq "no-home: exit code" "1" "$code"
assert_contains "no-home: message" "$out" "cannot locate"

echo ""
echo "=================================================="
echo "PASS: $PASS   FAIL: $FAIL"
echo "=================================================="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
