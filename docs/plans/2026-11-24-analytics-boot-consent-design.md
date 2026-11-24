# A saved Analytics off at boot

A web game with an **Analytics** switch stores the player's answer itself. Before this change it applied that
answer after `await app.initialize()`. The page runs the game's module first and the SDK's `sdk.js` after it. While
the SDK starts, it sends what an earlier visit could not deliver. So a player's saved "off" could reach the SDK
only after that send.

onGame PR 1350 (merged 2026-11-24, commit `ef48b04`) fixed the two onGame halves:

- The shim, `templates/gamelabs-base/src/telemetry.ts`: `setConsent(false)` called before the SDK exists sets
  `globalThis.__ongameConsent = false`. `setConsent(true)` at that point deletes it. It is never taken as a yes.
- The SDK, `telemetry-ingest/src/sdk.ts`: it reads that global before it collects or sends anything. It then
  stores `denied` and deletes what an earlier visit queued.
- The template's `src/main.ts` marks the place for the call: before `await app.initialize()`.

Measured there in Chromium: a call after an awaited 0 ms timer can come too late. This plugin must now tell the
agent the rule and check that a game follows it.

## What the game must do

1. In `src/main.ts`, before the first `await` of its boot: `if (saved === 'off') setConsent(false);`. With nothing
   saved, no call. A call such as `setConsent(stored === 'on')` would turn a first-time player's analytics off.
2. Never write the SDK's own storage keys: `ongame_consent:<gameId>` and `ongame_spool:<gameId>` (the names in
   `sdk.ts`). The game keeps its switch under its own key and tells the SDK only through `setConsent`.
3. Have a shim that keeps the early "no". A shim from before PR 1350 drops a `setConsent` call made before the SDK
   exists.

## Where it is checked

`upgrade.mjs --check` already keeps the privacy page true to the game. For a game whose maker said it has a switch
(`--opt-out yes`, kept as `optOut: true`), the page promises: "Turning it off deletes the records still waiting on
your device and stops all sending." Rule 1 and rule 3 are what make that true at boot. So `--check` adds two
problems, both only for a `general` game with `optOut: true` and a v2 shim:

- the shim has no `__ongameConsent` outside its comments: it predates the early "no";
- the boot module does not call `setConsent` before its first `await`;
- a game file the boot module imports, directly or through others, has a top-level `await`. The boot module's body
  runs only after it, and `sdk.js` may start in between.

The upgrade run (no `--check`) prints the same lines as `note:` lines and keeps its exit codes. The polish phase
and `/publish` run only the upgrade, so their steps now say to fix what a boot note names. `/make-game` and
`/analytics add` already require `--check` to pass.

Rule 2 is text only. Nothing in the game's code names those keys today, and a check would have to guess every way
of writing a string.

### The shim: require it, or tell the agent to take a fresh one

Two ways were open. Chosen: `--check` requires it, and the failure line names the fix: take
`src/telemetry.ts` from a fresh scaffold (`/analytics add` steps 1-2). The upgrade already replaces a shim that
differs from the fresh one.

Two guards keep the failure from trapping an agent:

- The failure line says to update the onGame CLI first, then take the fresh scaffold.
- An upgrade never swaps a shim that keeps the early "no" for one that drops it. An older CLI's scaffold would
  otherwise undo the fix on the next `/analytics add`.

Rejected: the shim's `setConsent` body pasted into the skill as a fallback patch. The scaffold is the one source of
that code. A second copy in the skill would drift from it.

Telling the agent alone was rejected too. A boot call through an old shim does nothing, so checking the call and not
the shim would pass a game whose saved "off" is still sent past.

The cost: the newest CLI release, `cli-v0.2.50` (2026-11-20), scaffolds the old shim. Measured: its
`templates/gamelabs-base/src/telemetry.ts` holds no `__ongameConsent`. Until the next CLI release, a fresh scaffold
cannot fix the failure. So this plugin version should reach makers only after a CLI release that holds `ef48b04`.
`keepsEarlyNo` looks for the global's name only, not `= false`, so an upstream rewrite of that line still passes.

## How the boot check reads the code

It reads a syntax tree, with the `@babel/parser` the gradients check already vendors
(`skills/gradients/vendor/babel-parser.cjs`). No new dependency.

- **Boot module:** the first `<script type="module" src>` in `index.html` that points at a local file. With none,
  `src/main.ts`.
- **The setConsent names:** from that module's imports of the shim: `setConsent`, an alias of it, or
  `T.setConsent` through `import * as T`. An import counts as the shim's the way the upgrade already decides it
  (`pointsAtShim`): an alias such as `@/telemetry` counts, a game helper such as `./utils/telemetry` does not.
- **The walk:** the module's top-level statements, in order, as the browser runs them. A function declaration is
  not run where it stands. A call to a function declared in the same module (a declaration, or a `const` arrow or
  function) is followed into its body. An immediately called function is followed too.
- **Where it stops:** an `await` ends the function it is in. A top-level `await` ends the walk. After a called
  function stops at its `await`, the caller goes on: the code after `void boot()` still runs before the SDK.
- **Both branches count:** an `if`, `? :`, `&&`, `try` or loop is read in source order, every branch. A call
  inside `if (!saved) setConsent(false)` counts. An `await` in any branch stops the walk there.
- **The answer:** a call counts when it has an argument and that argument is not the literal `true`. A literal
  `setConsent(true)` at start is not the player's answer. The check cannot tell a right condition from a wrong one,
  so the skill gives the one safe form.
- **Imports:** every game file the boot module imports by a relative path, followed through further imports, is read
  for a top-level `await`. `import type`, an import whose names are all `type`, dynamic `import()`, packages and
  path aliases are not followed. TypeScript drops a type-only import from the build, as the template compiles it
  (no `verbatimModuleSyntax`).

Not followed: functions imported from other modules, methods, and class constructors. A game that applies the
answer only inside one of those fails. The message says to call `setConsent` in the boot module itself, which is
always possible. A false failure costs one line; a false pass would send a player's data after they said no.

## Failure paths

- The boot module is missing: `--check` names the path it looked for.
- The parser cannot read the boot module: `--check` fails and names it. A file it cannot read is never a pass.
- `.ongame/analytics.json` has no `optOut: true`: neither check runs. A game without a switch has no saved "off".
- A children's game: neither check runs. It sends nothing.
- The shim is not v2: only the existing not-v2 line is shown; exit 4 stays as it was.
- A file the boot module imports cannot be parsed: `--check` names it.
- A game that turns on `verbatimModuleSyntax` keeps `import { type A } from './a'` as a load of `./a`. A top-level
  `await` there is then missed. The template does not turn it on.
- Accepted gaps, each a false pass that needs unusual code: a call only in a `catch` block, or under a test such as
  `import.meta.env.DEV`. False failures, each fixed with one line in the boot module: a call inside a `new Promise`
  executor or a class `static` block.
- `index.html` lists a polyfill module before the game's: the check reads the polyfill and fails. A hand-placed
  `sdk.js` tag before the game's script breaks the premise; `telemetry_inject` puts it just before `</body>`
  (onGame `cli/src/inject.ts`), after the template's game script.

## Tests

`test/analytics-upgrade.test.mjs` gets cases for: the template's boot with the call before the await (pass); the
call after the await (fail); a call through a helper declared in `main.ts` (pass) and through a helper called only
after the await (fail); `setConsent(true)` only (fail); a namespace import (pass); a top-level `await` before the
call (fail); a top-level `await` two imports down (fail) and in a type-only or dynamic import (pass); the old shim
(fail with the scaffold line); an older offered shim (kept out); no switch on file (no new check). Each failing case fails on the
code before this change.
