#!/bin/sh
# Doc-parity check for the per-agent support table. NOT shipped to end users — dev/CI-only tooling.
#
# WHAT IT PROVES. The same table is printed in two places a customer reads — `README.md` and
# `docs/index.html` — and the words in it are the FIRST thing a new user acts on: which tier they got, what
# to type to start a game, what to type to see their account. When an adapter changes what it installs, the
# two surfaces drift apart silently and the customer is told to type something that does not exist. (That is
# not hypothetical: Copilot CLI and Amp were both documented as "tools + guidance · just ask" for a release
# in which they shipped real commands.)
#
# So the agreed table is HARD-CODED below, and this fails loudly when either surface disagrees with it. It is
# deliberately not derived from the adapters: the point is that changing what an agent gets must be a
# conscious edit HERE too, in the same commit, rather than something the docs quietly miss. When an adapter's
# hint really changes, update EXPECTED and both documents together.
#
# Run:  sh test/doc_parity_test.sh
set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
README="${REPO_ROOT}/README.md"
SITE="${REPO_ROOT}/docs/index.html"

PASS=0
FAIL=0

assert_eq() {
  # $1 = label, $2 = expected, $3 = actual
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); printf 'ok   - %s\n' "$1"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL - %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"
  fi
}

for f in "$README" "$SITE"; do
  [ -f "$f" ] || { printf 'error: %s not found\n' "$f" >&2; exit 1; }
done

# The agreed table: agent|tier|how you start a game|how you reach your account.
# Every field is what the customer TYPES, verbatim.
# shellcheck disable=SC2016  # `$ongame-…` is Codex's literal prefix, not a shell expansion
EXPECTED='Claude Code|full|/make-game <idea>|/account
Codex|full|$ongame-make-game <idea>|$ongame-account
Gemini CLI|full|/make-game <idea>|/account
Cursor|full|/make-game <idea>|/account
Windsurf|commands|/make-game <idea>|/account
opencode|commands|/make-game <idea>|/account
Copilot CLI|full|/make-game <idea>|/account
Amp|commands|make-game: <idea>|account:'

# README row:  | Amp | **commands** | `make-game: <idea>` | `account:` |
# Markdown decoration (backticks, bold, the outer pipes) is stripped; the fields themselves are compared.
readme_row() {
  grep "^| $1 |" "$README" \
    | head -n1 \
    | sed -e 's/`//g' -e 's/\*\*//g' -e 's/^| *//' -e 's/ *|$//' -e 's/ *| */|/g'
}

# Site row:  <tr><td>Amp</td><td class="ok">commands</td><td><code>make-game: &lt;idea&gt;</code></td>…
# Cells become the separator, remaining tags are dropped, entities are decoded back to what is typed.
site_row() {
  grep "<td>$1</td>" "$SITE" \
    | head -n1 \
    | sed -e 's/<td[^>]*>/|/g' -e 's|</td>||g' -e 's/<[^>]*>//g' \
          -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&amp;/\&/g' -e 's/&nbsp;/ /g' \
          -e 's/^ *//' -e 's/^|//' -e 's/ *$//'
}

echo "=== per-agent table: README.md and docs/index.html against the agreed table ==="
printf '%s\n' "$EXPECTED" | while IFS= read -r want; do
  agent=${want%%|*}
  assert_eq "README row: ${agent}" "$want" "$(readme_row "$agent")"
  assert_eq "site row:   ${agent}" "$want" "$(site_row "$agent")"
done > "${TMPDIR:-/tmp}/doc_parity.$$"
# ^ the loop runs in a subshell (it is the right-hand side of a pipe), so the counters are recomputed from
#   its output rather than read out of it.
cat "${TMPDIR:-/tmp}/doc_parity.$$"
PASS=$(grep -c '^ok   - ' "${TMPDIR:-/tmp}/doc_parity.$$" || true)
FAIL=$(grep -c '^FAIL - ' "${TMPDIR:-/tmp}/doc_parity.$$" || true)
rm -f "${TMPDIR:-/tmp}/doc_parity.$$"

echo ""
echo "=== the retired tier must be gone from BOTH surfaces ==="
# "tools + guidance" described a tier no shipped agent is in any more. Left in one surface it contradicts the
# other, and contradicts the installer's own summary, which only ever prints "full" or "commands".
for f in "$README" "$SITE"; do
  name=$(basename "$f")
  if grep -q 'tools + guidance' "$f"; then
    FAIL=$((FAIL + 1)); printf 'FAIL - %s still describes the retired "tools + guidance" tier\n' "$name"
  else
    PASS=$((PASS + 1)); printf 'ok   - %s does not mention the retired tier\n' "$name"
  fi
done

echo ""
echo "=================================================="
echo "PASS: $PASS   FAIL: $FAIL"
echo "=================================================="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
