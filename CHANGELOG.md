# Changelog

## 1.7.104 — 2026-11-26

- A game with an **Analytics** switch applies a saved "off" at boot: `if (saved === 'off') setConsent(false);` in
  `src/main.ts`, before the first `await`. The deployed SDK starts after the game's code and sends what an earlier
  visit left queued, so an answer given after an `await` can come too late. `skills/analytics/SKILL.md` states the
  rule, and that a game never writes the SDK's own storage keys (`ongame_consent:*`, `ongame_spool:*`).
- `upgrade.mjs --check` fails such a game when its boot module calls no `setConsent` with an answer before its first
  `await`, when a game file it imports has a top-level `await`, or when its `src/telemetry.ts` drops a
  `setConsent(false)` made before the SDK starts. The upgrade run prints the same lines as notes and keeps its exit
  codes; `/publish` and the polish phase act on them. The boot check reads a syntax tree with the parser the
  gradients check already bundles.
- The shim that keeps that early answer is in onGame's scaffold from onGame commit `ef48b04`. `cli-v0.2.51`, the
  newest CLI release on 2026-11-25, still scaffolds the old shim, which fails the check. `/analytics add` takes the
  new one from a newer CLI. An upgrade never swaps the new shim for an older one.
- `test/analytics-upgrade.test.mjs` covers the call before and after the `await`, helpers, branches, callbacks,
  top-level `await` in the boot module and in what it imports, the boot module `index.html` names, and both shims.

## 1.7.103 — 2026-11-26

- `skills/game-verify/line-check.mjs` now prints a non-English file name in its "touched files differ" line as
  letters, `makegame/sahne-ğ.js`. Before, it printed octal codes in quotes, `"makegame/sahne-\304\237.js"`. That line
  came from `git diff --name-only`, which quotes such a name. The script now reads it with `git diff -z`, as 1.7.102
  did for `git log`.
- `test/game-verify-scripts.test.mjs`: the sub-folder case with `makegame/sahne-ğ.js` now also checks the printed
  name. It failed on 1.7.102.

## 1.7.102 — 2026-11-26

- `skills/game-verify/line-check.mjs` now lists an unmerged branch that changes a file with a non-English name, such
  as `sahne-ğ.js`. Before, it said "HEAD holds ... every other branch" and exited 0. `git log` printed the name in
  quotes with octal escapes, `"sahne-\304\237.js"`, and `git diff` matched no file for that text. The script now reads
  the names with `git log -z`. `core.quotePath=false` was not enough: git still quotes a name with a double quote.
- `test/game-verify-scripts.test.mjs` adds four cases. A branch changing `sahne-ğ.js`, the same with the game in
  `makegame/`, and a branch adding `say-"hi".js` (not on Windows) exit 1 and list the branch; all three exited 0 on
  1.7.101. A branch whose `sahne-ğ.js` change main already has still counts as squash-merged, exit 0.

## 1.7.101 — 2026-11-26

- `skills/game-verify/line-check.mjs` now lists unmerged branches when the game is in a sub-folder of its repository.
  Before, it said "HEAD holds ... every other branch" and exited 0 there. `git log` prints a branch's files from the
  repository root, and `git diff` read them from the game folder, so no file matched. The diff now reads them from the
  root (`:(top)`). Measured on a repository with its game in `makegame/`: the old script exited 0 there; the new one
  lists its unmerged 3-commit branch and exits 1, the same as a run on the repository root.
- `test/game-verify-scripts.test.mjs` adds three cases: a sub-folder game with an unmerged branch (exit 1), a
  sub-folder game whose branch main already has (exit 0), and a root game with an unmerged branch (exit 1).

## 1.7.100 — 2026-11-25

- A 2D web game can use the engine's ready-made main screen, settings popup, UI components and on-screen controls, and stay on the 2D frame with no three.js. The code, polish and audio phases no longer send such a game to the 3D frame. Its App file keeps `GamelabsApp` from `@gamebyte/gamelabsjs/core`; the modules are imported from `@gamebyte/gamelabsjs`.
- This needs gamelabs.js 4.2.4 or later, where the two entries share one copy of each class. On an older engine the phases say to upgrade first. New games get 4.2.4 from the CLI release that carries ongame PR 1356.
- `test/scaffold-dimension-text.test.mjs` checks the new text in the three phases, and that the old one-entry rule is gone.

## 1.7.99 — 2026-11-25

- `store-prep`, `store-build` and `store-submit` each get one line for onGame team members: when `playbook catalog`
  lists `ongame-game-launch`, the team's Google Play launch cycle, read the phase that matches the step (creatives;
  integrations and play-console; play-console and qa). Nothing from that skill is copied here. Without the `playbook`
  command, or before the skill is listed, the line does nothing. `store-build` and `store-submit` keep their limits:
  the agent still uploads nothing and never writes to a store.
- `test/launch-skill-pointer.test.mjs` checks the three lines, that each is conditional on the catalog, and this
  version.

## 1.7.98 — 2026-11-24

- New skill `skills/juice/SKILL.md`: feedback timings in milliseconds for a placement, a line clear, a combo, a big clear, game over and a refused move. They were measured frame by frame from 60 fps play video of a shipped grid puzzle game, with an error of one frame (17 ms). Each number is marked measured or inferred, says what it is for, and says how to scale it from a small event to a big one.
- `/make-game` and the polish phase, Sub-phase 5, point to the skill for timings and sizes. Sub-phase 5 now asks for a screen shake of one size that never grows: a combo makes it longer, not stronger. It no longer asks for a hit-stop on a match.
- `test/juice-skill.test.mjs` checks the marks, the scaling rules, the constants against the tables, the two links and this version. It also checks that the skill names no game.

## 1.7.97 — 2026-11-24

- The build panel's "Play here" link shows only for a preview of this build's game folder: the folder of its
  latest recorded `play_gate` run. A preview of another folder, or one started before this build's first
  recorded run, shows no link. Before, a preview of another game showed under this game's name.

## 1.7.96 — 2026-11-24

- A build panel in Claude Code shows the game being built: its name, its phase, the play check and the play link.
  It reads only what ongame's own tools answered. During a build it opens by itself as a sidebar when the terminal
  is at least 144 columns wide. On a narrower terminal, `/ongame-panel` opens it above the prompt.
  `/ongame-panel off` turns it off for every later session, and `/ongame-panel on` turns it back on.
- Claude Code 2.1.286 or later shows the panel where mods are allowed. An older Claude Code loads the plugin as
  before, without the panel: measured on 2.1.50, 2.1.100, 2.1.150, 2.1.250 and 2.1.280.
- `test/hooks-json.test.mjs` checks that the panel's module path stays inside the plugin, that its state belongs
  to the ongame plugin, and that `plugin.json` keeps to keys Claude Code 2.0.15 to 2.1.75 accept.

## 1.7.95 — 2026-11-24

- `skills/gradients/check.mjs` reads a game's code as a parsed syntax tree, not as text. Its rules are unchanged. Spacing, comments, semicolons, quotes, regex literals, type casts and `!` no longer change what it finds. Before, each new way of writing the same code needed its own fix.
- It parses with `@babel/parser` 7.29.14, bundled in `skills/gradients/vendor/` with its MIT license and listed in `NOTICE`. Nothing is installed: Node alone runs it.
- It now also reads `do ... while` loops, a `for` loop whose counter is declared before it (`for (; i < 20; i++)`), and Canvas styles set with a string key (`ctx['globalAlpha'] = ...`).
- A file it cannot parse is named and not checked. The run then exits 2, or 1 when it found a fade elsewhere. An unchecked file is never a pass.
- `test/gradients-syntax-tree.test.mjs` holds 13 cases the text check got wrong. The old tests and fixtures pass unchanged.

## 1.7.93 — 2026-11-24

- New game plans default to no needed-item coin shortage before 12 completed sessions and three full elapsed days, without purchases or rewarded ads. The starting planning assumption is four 5–6 minute sessions a day, about 66 minutes across 12 sessions.
- The shared economy runway checker rejects early shortages and insufficient simulation coverage for average and light players. A runnable example and tests cover both passing and failing plans.

## 1.7.91 — 2026-11-22

- The code phase asks the agent to pick a frame when it scaffolds a web game: `scaffold_materialize` takes `dimension`, `"2d"` or `"3d"`. A 2D game leaves three.js out. Measured on fresh scaffolds: 249.2 kB of gzipped JavaScript for 2D against 409.5 kB for 3D.
- The code phase states the rule a 2D frame needs: every file imports the engine from the same entry as the game's App file. The polish and audio phases say which ready-made engine modules stop a 2D frame at boot, and what to build instead.
- `dimension` needs the CLI release after `cli-v0.2.50`. An older CLI ignores it and writes the 3D frame, as before; the result then has no `dimension`.
- `test/scaffold-dimension-text.test.mjs` checks these lines and this version.

## 1.7.90 — 2026-11-21

Six skills from games that shipped to the web, Google Play and the App Store. Each rule comes from a failure seen on a
real release. Each script needs only Node and keeps one exit contract: 0 pass, 1 a finding, 2 bad usage or nothing
readable. The checks read the game; `chroma-key.mjs key` writes only the output it is given (atomically, never over
its input), and `line-check.mjs --fetch` updates remote-tracking refs, nothing else.

- `store-build`: turns a finished web game into the uploadable native package — Capacitor shell, native settings, an
  ad-free store build, the purchase key and package list, legal pages, an AAB and an emulator smoke run.
  `store-check.mjs` is the pre-upload gate: placeholder icon, empty purchase key, a remote `server.url`, an invalid or
  test-mode `build-info.json`, Android and iOS shipping different game files, target SDK below 36 (Play's requirement
  as of 2026-11), a missing Gradle wrapper, a release signed with the debug key, a debuggable build.
- `store-submit`: the review step. The agent never writes to a store; it prepares and the owner submits. Covers prices
  proven on the reviewed build, first in-app purchases sent with the version, privacy forms that match every SDK, the
  2.1 and 4.3 rejections, and click-by-click console steps. `check-text.mjs` fails a "no data collected" claim next
  to an analytics, ads or purchases SDK found in `package.json` or the native projects, and warns on level counts that
  go stale.
- `game-verify`: proof before "done" — test counts before and after, a proof run with real input on the built page,
  every screen at its fullest, a verdict only after the run ends. `line-check.mjs` finds local or remote branch work the
  checkout and the default branch lack, and a checkout behind the default branch, before a publish; `live-diff.mjs` hashes every built file against the live game.
- `mobile-ready`: the phone behaviour `/make-game`'s phone check does not list — pixel-ratio cap values, safe-area
  values that arrive after load, pause, backgrounding, the Android back-key order. `check.mjs` reads the source for
  what it can show.
- `forge-assets`: measure a generated asset before it goes in — painted checkerboards instead of alpha (key a flat
  magenta plate with `chroma-key.mjs`), sliced sprite sheets, the returned sound length, the character's pose and arm
  joints before and after rigging.
- `unity-port`: the release gates of a web-to-Unity port — visual and behaviour parity that block, save migration,
  the minimum Android API, per-face colour before theories.
- `/make-game` names `forge-assets`, `mobile-ready` and `game-verify` where their work starts; `/publish` runs
  `line-check.mjs` before and `live-diff.mjs` after a publish; `store-prep` hands off to `store-build` and
  `store-submit`; `unity` points to `unity-port`.
- `/publish` step 3 now uploads with `publish_upload({gameDir, publishId})`, as the polish phase already did. It
  told the agent to pass raw `uploads` and `source` by hand; on a build of about 100 files those slots are too large to
  pass on, which led to uploading to the signed URLs directly and skipping the boot check and the source copy. The
  slot form stays only for an older client that returns raw slots.
- `test/shipped-lessons-skills.test.mjs` checks the six skills load, are named and this version;
  `test/store-build-check.test.mjs`, `test/game-verify-scripts.test.mjs` and `test/check-scripts.test.mjs` hold each
  script's pass, finding and unreadable cases on fixtures (temporary git repos and a localhost server, no network).

## 1.7.89 — 2026-11-20

- `/make-game` says how to write the play script for a game played by dragging a finger, such as connect letters, draw a line or pull a slingshot: it uses a `drag` step through hit-area ids. The `drag` step needs the CLI release after `cli-v0.2.49`; that release is being prepared.
- `test/play-gate-text.test.mjs` checks the line and this version.

## 1.7.88 — 2026-11-20

- `/make-game` takes the flag `--no-concept`. It turns off the concept review default for a new game, and the agent judges the mode from the rest of the request. The flag stays out of the game's concept.
- `concept-to-game` now names its target: it registers `plan.target: "production"` with its phases.
- `test/concept-to-game-text.test.mjs` checks both lines and this version.

## 1.7.87 — 2026-11-20

- `/make-game` now tells the agent what to do with a teardown's `mechanics.json`. It copies the sheet into the game, starts the tuning from its numbers and writes `mechanics.bind.json`. `play_gate` then reports each bound number as `match`, `drift` or `unread`. It never blocks. The CLI release `cli-v0.2.49` has this `play_gate` result.
- The concept phase's look step names the file it writes, `docs/ART_DIRECTION.md`.
- The polish phase names the two session events the telemetry SDK sends, `session_start` and `session_end`.
- `test/source-parity-text.test.mjs` checks the three lines and this version.

## 1.7.86 — 2026-11-20

- The launch credit is now the onGame logo alone on a dark screen (`#0e121b`), with no caption and no motion: it holds for 1.2 s after the page loads, then fades. The "Built with" caption and the first-screen pill are gone, so nothing of onGame stays on the game's screens after the card.
- `/publish` and `skills/credit/apply.mjs` turn an older v1/v2 block into the v3 card in place and keep its `--wait` choice. A `--wait ready` card stays until the game calls `ready()` (whether or not the page has finished loading) and shows LOADING past 6 s, instead of lifting onto an empty stage on a slow first launch.
- If the card's script fails while setting up (a native bridge that throws), the CSS-only exit still lifts it at 6.5 s. `--check` now also fails a block that lost its logo or its `ready()` hook.
- `--badge` and `window.ongameCredit.leave()` are still accepted so older games keep building and running; neither does anything now.

## 1.7.85 — 2026-11-20

- `skills/gradients/check.mjs` keeps two canvases on one owner apart, such as `canvases.a` and `canvases.b`. A translucent fill on one no longer makes the other's shapes a fade. `test/fixtures/gradients/not-fades.ts` holds that case as a passing one.
- `skills/gradients/check.mjs` no longer flags a plain outline when the loop has a local named `alpha` or `color`. In `{ alpha: 1, color: 0xffffff }` both names are read as style keys. `test/fixtures/gradients/not-fades.ts` holds both loops as passing ones.

## 1.7.84 — 2026-11-20

- `/analytics add` no longer refuses a game that keeps its own helper named `telemetry`, such as `src/utils/telemetry.ts`. A relative import counts as an import from the shim only when it lands on `src/telemetry.ts`. An alias such as `@/telemetry` still counts as the shim.
- `test/analytics-upgrade.test.mjs` checks the helper, its re-exports, the alias and a `src/telemetry/` folder.
- Works with every ongame-cli release: the change is one script with no dependency.

## 1.7.83 — 2026-11-20

- `/make-game` starts a new game in the new `concept-to-game` mode unless the maker clearly asked for a prototype, a full game, a playable ad or docs only. The build researches the genre, makes concept screens, cuts them into game-ready assets and writes the docs. Then it stops for the maker's review before any code. The code work that follows is a continuation that keeps `concept-to-game`.
- Needs the ongame server that accepts `path: "concept-to-game"` (ongame card i_81m80wlu). Until then `state_init` refuses the new path.
- In `concept-to-game` the assets phase now cuts the concept screens into assets and wires no code. It runs before the docs and the code, so it builds its list from the concept screens, not `docs/GAME_DESIGN.md`. It records the cut assets in `docs/ASSETS.md`.
- The first code build after the concept review is a continuation with no game code yet. The build runner and the code phase now tell the agent to scaffold the engine in that case, then wire in the cut assets. A continuation of a game that has code still never scaffolds.
- First lessons: `genres/arrow-escape.md` (23 lessons on arrow escape puzzles: a fail state, sectioned levels, a schedule of new mechanics, late interstitials, purchases and launch ads), `studios/grand-games.md` (8 lessons) and `principles.md` (5 lessons for every genre). `TEMPLATE.md` is the shape for the next genre or studio.
- `genres/arrow-escape.md` also carries what our teardown of the Maze Out Android build shows, next to the podcast's lessons. Lessons 1, 2, 6, 7, 8 and 10 gain observed numbers: 5 lives at 30 minutes each, the obstacle levels, the hard-level beat and the timer. Each one keeps its label: *Observed:*, *Estimated by the source:* or *Our inference:*.
- Six new lessons, `arrow-escape/18` to `arrow-escape/23`: grow the board as the clock shrinks, boosters per fail state, rising continue prices, quick-clear combos, what plays after the last level, and a daily level with its own rules.
- `test/strategy-layer.test.mjs` checks every strategy file's shape, ids and wording, every lesson number's label, the `/make-game` section, the teardown's lessons and this version line.
- `skills/gradients/check.mjs` no longer reports a fill whose alpha changes just because shapes are drawn beside it on another object. A fill now counts as a fade only when a shape in the loop is drawn on the same object. Rings on one Graphics beside fading Canvas text pass.
- `test/fixtures/gradients/not-fades.ts` holds that case as a passing one.
- `skills/gradients/check.mjs` judges each growing shape only by the fills and Canvas style sets on its own drawing target, by its whole path. Plain rings beside see-through text on another object pass. `test/fixtures/gradients/not-fades.ts` holds that case as a passing one.
- `skills/gradients/check.mjs` no longer reports rings whose line width grows when their style is declared in a local variable. A style changed between its declaration and the drawing keeps the old handling, so a real fade is still reported.
- `/analytics add` now checks a game's own helper files named `telemetry`, such as `src/utils/telemetry.ts`. Only the shim itself, `src/telemetry.ts`, is skipped.
- The privacy page promises "you can turn analytics off in the game's settings" only when the maker says the player has that switch: `upgrade.mjs --opt-out yes`. The answer is kept in `.ongame/analytics.json`, and `--check` reads the page against it.
- A `setConsent` call in the game's code no longer counts as a switch. A game that calls `setConsent(true)` at start gets no such promise. When the code calls `setConsent` and no answer is on file, the run prints the `--opt-out` question.
- `test/analytics-upgrade.test.mjs` checks both cases and this version line.
- `skills/gradients/check.mjs` reads a call's object correctly when its name has a space before the bracket (`.stroke (`, `ctx.fillRect (`). Before, such a call matched no object, and a real fade was missed.
- `test/fixtures/gradients/strips.js` holds both spaced cases as reported fades.
- `/make-game` now reaches the game-making rules that lived only inside phase skills it does not open. They moved,
  word for word, into five skills Claude Code loads by their description, and `commands/make-game.md` points to each:
  `game-concept`, `game-code`, `difficulty-curve`, `asset-anchor` and `phone-layout`. The phase skills point to the
  same files, so a phase run reads the same text.
- `test/phase-rules-reachable.test.mjs` lists those 19 rules and checks that each is in a skill with a description
  that `/make-game` names.
- Works with every ongame-cli release: the change is skill text only.
- Works with every ongame-cli release: the change is one script with no dependency.

## 1.7.82 — 2026-11-20

- `/make-game` reads a strategy layer before designing a game: lessons on what made successful games work, by genre and by studio. Each lesson is applied, adapted or marked not used, and the decisions go to `docs/STRATEGY.md` before `docs/GAME_DESIGN.md`.
- The new `skills/strategy/SKILL.md` says how to pick the matching files, decide each lesson, check an existing game against them, and add a new source as lessons in our own words.
- First lessons: `genres/arrow-escape.md` (17 lessons on arrow escape puzzles: a fail state, sectioned levels, a schedule of new mechanics, late interstitials, purchases and launch ads), `studios/grand-games.md` (8 lessons) and `principles.md` (5 lessons for every genre). `TEMPLATE.md` is the shape for the next genre or studio.
- Every lesson number says where it came from: *Observed:* in the reviewed game, *Estimated by the source:*, or *Our inference:* when we chose it. Agents copy that label into `docs/STRATEGY.md` and `docs/GAME_DESIGN.md`, so our own thresholds never read as the source's facts.
- `test/strategy-layer.test.mjs` checks every strategy file's shape, ids and wording, the `/make-game` section and this version line.
- Works with every ongame-cli release: the change is skill text only.
- `skills/gradients/check.mjs` no longer reports rings whose line width grows while their colour stays the same. That is line art, not a fade. The check now looks only at a fill's colour and alpha for a fade; `width` and other style keys are ignored, and so is the width in a v7 `lineStyle(width, color, alpha)`.
- `test/fixtures/gradients/not-fades.ts` holds both ring cases as passing ones.
- Works with every ongame-cli release: the change is one script with no dependency.
- `skills/gradients/check.mjs` no longer reports a line whose alpha changes just because rings are drawn beside it on another object. A stroke now counts as a ring fade only when it strokes growing rings on its own object. Two Graphics kept on one owner (`layer.rings`, `layer.path`) count as two objects.
- `test/fixtures/gradients/not-fades.ts` holds both cases as passing ones.
- `skills/gradients/check.mjs` now reports a Canvas fade that sets a see-through `fillStyle` and then `globalAlpha = 1` before each growing shape. The check judges the two together, as the canvas paints with both; before, it read only the last one set.
- `test/fixtures/gradients/strips.js` holds it as a reported case.
- `skills/gradients/check.mjs` no longer blames one canvas for another canvas's colour. A growing shape is now judged only by the fills and Canvas style sets on its own object. Before, a see-through `a.fillStyle` made `b.fillRect` on another context count as a stacked fade.
- `test/fixtures/gradients/not-fades.ts` holds it as a passing case.
- `skills/gradients/check.mjs` no longer reports a Canvas line drawn in a loop with a changing `ctx.globalAlpha` and only `ctx.stroke()`. A tapered stroke along a path is line art. `globalAlpha` now counts as the fill or the stroke that the next paint call makes, so a stroke-only loop is a fade only when it strokes growing rings. Only paint calls on the same context count: a fill on another canvas beside the line does not make it a fill.
- `test/fixtures/gradients/not-fades.ts` holds the tapered stroke, alone and beside a fill on another context, as passing cases. `test/fixtures/gradients/strips.js` holds a `globalAlpha` glow on growing filled arcs and `globalAlpha` rings as reported cases.

## 1.7.81 — 2026-11-20

- New games report how they are played: `/make-game` and the code phase write analytics shim v2 calls (`screen()`, `levelStart()` / `levelEnd()`, `economy()`, a `label` on every interactive object). The polish phase checks them, as it checks level events.
- `/analytics add` upgrades an existing web game to shim v2. Every call the game already makes keeps working, and telemetry is wired into `index.html` again. A second run changes nothing.
- `skills/analytics/upgrade.mjs` does the file work: it swaps the shim (the old one is kept in `.ongame/archive/`), refuses when the game imports a name v2 lacks, and writes `public/privacy.html`.
- The maker is asked once whether the game is aimed at children. A children's game gets no analytics tag and no id; its privacy page says nothing is collected.
- The privacy page and `skills/analytics/store-labels.md` list exactly the 17 events in `skills/analytics/events.json`, with the App Store and Google Play answers.
- `/publish` writes the privacy page before it builds.
- Shim v2 itself comes from the bundled game template. With an older onGame CLI, `/analytics add` says to update it and leaves the shim as it was.
- `test/analytics-upgrade.test.mjs` checks these steps and this version line.

## 1.7.80 — 2026-11-20

- `skills/gradients/check.mjs` now finds two fades it missed. A Canvas glow that sets a see-through `fillStyle` and then calls a bare `ctx.fill()` on growing arcs is reported. A fade whose alpha is declared over two lines (`const t =` then `i / 20;`) is reported too.
- `test/fixtures/gradients/strips.js` holds both as reported cases.
- Works with every ongame-cli release: the change is one script with no dependency.
- Anything in a game that fades (a glow, light rays, a sky, a vignette, shading) is drawn as one shape with one gradient fill. The rule now has its own skill, `gradients`, which loads whenever a game draws one, in a new game or a change to a finished one. It gives the PixiJS v8 `FillGradient` code.
- `skills/gradients/check.mjs` finds fades faked with stacked rings, bands, strips or discs in a game's source and prints each as file:line. `/make-game` and the polish review run it before a game is called done. A colour picked per item (`palette[i]`, `colorOf(i)`, page dots, a segmented bar) and a new shape per pass are not fades and are not reported.
- `test/gradients-rule.test.mjs` checks it: stacked-ring rays fail, the same rays with one `FillGradient` pass.
- Works with every ongame-cli release: the change is skill text and one script with no dependency.

## 1.7.79 — 2026-11-20

- The audio phase adds a `music` row only when the game's design has a music slot, such as background music or an ambient track. A game without one gets no music.
- The music row calls `sound_request({ text, music: true, durationSeconds?, gameId? })`: one background track per game, 3–60 s. `text` names the mood, instruments and tempo.
- `test/music-row-rule.test.mjs` checks these lines and this version line.
- Needs ongame core with `music: true` on `sound_request`. Production core has it since 2026-11-20.

## 1.7.78 — 2026-11-20

- `/make-game` applies six game-design rules by default, to every new game and every change to a game's rules, levels, layout or economy: a capacity for every container, when a piece waits or is blocked, caps on what is in play, an odds model before the levels, phone sizes and readability, and a rival study of looks, sizes and economy that changes the game.
- The new `skills/game-design/SKILL.md` gives each rule's steps and defaults. The answers go to `docs/GAME_DESIGN.md` before the first level or game-rule code.
- `test/game-design-rules.test.mjs` checks these lines and this version line.
- Works with every ongame-cli release: the change is skill text only.

## 1.7.76 — 2026-11-19

- Light rays behind the end card now fade from bright at the centre to transparent at the edge. The polish phase's Sub-phase 8 gives the radial gradient code; `/make-game` points to it.
- The play review checks the win frame: rays that keep one flat colour out to their tips are a failed check. The maker adds the gradient, rebuilds and plays again.
- `test/end-card-rays-rule.test.mjs` checks these lines and this version line.
- Works with every ongame-cli release: the change is skill text only.

## 1.7.75 — 2026-11-19

- The assets skill's rig step says when a `forge_rig` job pays off: a character with no rig, or one missing a clip the game needs. It no longer calls `forge_rig` rig-only. The rigged GLB carries `idle`, `walk`, `run`, `attack`, `cast`, `hit` and `death`, and `clips: [names]` adds library clips.
- The step says to ask for every clip the game uses, because the rig builds a new skeleton. When the mesh cannot be rigged, the game code skips the missing clip.
- After the rig, the step compares `measurement.animations` with every clip the game needs, even when `warnings` is empty. A clip name the library does not know never reaches the warnings. The game code skips each missing clip.
- `test/rig-clip-gate.test.mjs` checks these lines and this version line.
- Works with every ongame-cli release: the change is skill text only.

## 1.7.74 — 2026-11-19

- The assets skill's rig step says to skip `forge_rig` when the delivered `measurement.animations` already has the clips the game needs. A 3d-char now arrives rigged with `idle`, `walk`, `run` and `jump`, so a rig job after every mesh cost a job for nothing.
- `test/rig-skip-when-animated.test.mjs` checks this line and this version line.
- Works with every ongame-cli release: the change is skill text only.

## 1.7.73 — 2026-11-19

- 3D character drafts are fast. In the assets phase, `charParams.speed: "fast"` gives a rigged character in about 45 s instead of about 3 minutes, at lower colour quality and with PBR off. The agent sets it for a preview, a draft or a placeholder, never for the hero the player looks at. `pbr: true` turns PBR back on for a draft.
- The same `charParams` entry says a 3d-char arrives rigged, and names the settings that give a static mesh instead: a `targetPolycount` under 30000, `shouldTexture: false` or a `poseMode`.
- The `3d-char` kind entry now says the same as ongame's: a character normally arrives rigged with `idle`, `walk`, `run` and `jump`, and `forge_rig` is for an empty `measurement.animations` or for more clips. The kind stays async-only.
- `test/char-speed-draft.test.mjs` checks these lines and this version line.
- Works with every ongame-cli release: ongame's server reads `charParams`, not the CLI.

## 1.7.72 — 2026-11-16

- `/make-game` and the polish phase say the phone layout is checked by `play_gate`'s `layout_fits` at 360x640 and 390x844. It fails cut-off or covered text and phone controls under 44x44 px, read from `window.__game.layout()`. The polish phase no longer restates those rules itself.
- A recalled lesson is reinforced with `brain_reinforce` only after its phase passes `phase_review`, or after `play_gate` passes. A `revise`, a `skip`, or a blocked or skipped play reinforces nothing. This is in `/make-game` and the code phase.
- `test/phone-layout-play.test.mjs` checks these lines and this version line.
- Needs ongame-cli 0.2.43 or later, the first release whose `play_gate` has `layout_fits`. On an older CLI, `play_gate` runs without the layout check.

## 1.7.71 — 2026-11-16

- `/make-game` plays a Unity game from its WebGL build in `{gameDir}/dist` (`-buildTarget WebGL`). The game prints `pass boot` when its first scene is ready, and taps use `tapAt`.
- `test/unity-webgl-play.test.mjs` checks the Unity play lines and this version line.
- Needs ongame-cli 0.2.42 or later, which plays Unity WebGL builds in `play_gate`.

## 1.7.70 — 2026-11-15

- Game icons get the icon model. The assets phase tells the agent to set `purpose: "icon"` on a 2d-static UI or HUD icon drawn from the prompt alone. ongame then draws it with the model that scored best on icons; an icon anchored with `editOf` keeps its anchor.
- `test/icon-purpose.test.mjs` checks that the assets skill carries the field and when to set it.

## 1.7.69 — 2026-11-13

- `/make-game`'s build workflow reads each builder's answer as a structured report. A phase counts as blocked only when a builder sets `ok` to false, or gives no report. The word "blocked" in a builder's text no longer marks a phase blocked. A blocked phase now names the ongame tool that failed.
- `test/build-report.test.mjs` runs `workflows/build.js` with fake builders and checks that rule.

## 1.7.68 — 2026-11-13

- Wins look rich and rewards look like the game. `/make-game` and the concept, assets and polish phases ask for layered, realistic celebration particles (glow, burst, confetti, sparkle, with depth, light and physical motion), never flat primitive particles. Coins and rewards are drawn in the game's own style with depth and shine, never a flat `$` coin, and the same coin art is used everywhere. Praise words sit tilted with their ribbon as one banner. The agent freezes the win celebration at its peak and looks at it before calling it done.
- `test/celebration-reward-rule.test.mjs` checks that all four files carry the rule.
- Sound effects fit the game and feel good. `/make-game` and the audio phase ask for soft, tactile, short sounds (taps, pops, slides, chimes) that name the game's material. 8-bit beeps and chiptune are used only for a retro or pixel game.
- The polish phase follows `skills/scene-transitions/SKILL.md` for the screen-to-screen edges. Its contact sheet can tap past a start menu. Publishing uses the `publishId` from `publish_game` instead of copying upload slots.
- New skills: `scene-transitions` (map and style every edge between big screens) and `store-prep` (get a finished game ready for the App Store and Google Play).
- Needs ongame-cli 0.2.40 or later, which has the contact sheet's `tap`.

## 1.7.67 — 2026-11-12

- The final `phase_review` of the code phase now names the source files for each engine: gamelabs, everything under `src/`; Unity, the C# scripts under `Assets/`; Godot, the `.gd` and `.cs` scripts under the folder that holds `project.godot`; native, the files the project's own build compiles. A Godot or native game no longer goes to review with an empty or partial artifact.
- `test/code-review-artifact.test.mjs` checks that rule: it names all four engines, and a Godot game with `project.godot` and `scripts/main.gd` sends that script, not zero files.

## 1.7.66 — 2026-11-12

- The code phase installs a new game's packages with `deps_install` instead of a shell `npm install`, so a sandboxed agent without network can still build. On a lost level the game now calls `trackLevelFail(n)`.
- At the end of a phase the agent confirms each recalled lesson that held up with `brain_reinforce`.
- `/make-game` asks for the scene-transitions procedure for games with more than one big screen. It writes `docs/TRANSITIONS.md`. Where `skills/scene-transitions/SKILL.md` is not on disk, the agent reads `pattern:scene-transitions` through `knowledge_get`.
- Needs ongame-cli 0.2.35 or later, which has `deps_install` and `brain_reinforce`.

## 1.7.65 — 2026-11-12

- In the code phase the agent no longer sends its own notes or a few picked files to `phase_review`. Each code write is already reviewed on the game's whole source. The agent calls `phase_review` once at the end, with every source file, only when code changed after the last feedback. `/make-game` asks for `phase_review` only for concept, docs and levels.

## 1.7.64 — 2026-11-12

- `/make-game` intake, the assets phase's art-style question and `/publish`'s game choice now ask with `ask_user`. The user picks from two to four options, with a picture beside each when one is on disk. A user with one game is asked Publish this game or Cancel. Needs ongame-cli 0.2.40 or later, which has `ask_user`.

## 1.7.63 — 2026-11-12

- A paying account that reached its daily limit of know-how entries is now told when the limit resets, instead of being told to retry shortly.

## 1.7.62 — 2026-11-12

- The phase skills are shorter. Tuned recipes (art prefix, asset sizes, sound timings, juice timings, level profiles, phone checks, Unity setup failures) now come from `knowledge_get` when a phase needs them. If that returns nothing, the agent continues with its own judgment.

## 1.7.61 — 2026-11-12

- When the user corrects a phase's work, the agent now reports that correction once with `friction_report`: what it did and what the user wanted instead. onGame learns from these reports. It skips a plain clarification, and it skips the report when the user objected to capture.

## 1.7.60 — 2026-11-12

- When a user says to stop only for critical things, the agent records it once and stops asking for routine approvals. It saves the wish with `brain_capture`, so later builds start with it. The asset manifest and the polish scope no longer wait for a yes while it holds.

## 1.7.59 — 2026-11-10

- The polish step's play gate line now names the public `ongame` server, like every other shipped line.

## 1.7.58 — 2026-11-10

- A game is now done only after it was played on record. `/make-game`, `/publish` and the polish step call `play_gate`: it plays the built game by keyboard as a desktop and by touch as a phone, to the win. The agent then looks at the footage and calls `play_review`. A new hook holds `build.done` and `profile_record_build` until that passed. Needs an ongame-cli release that has `play_gate`. An older one has no such hook: it logs a non-blocking hook error and the build finishes as before.

## 1.7.57 — 2026-11-10

- The polish step now plays every feature before the game is reviewed. It opens the built game with `?test=1` and reads one `pass` or `fail` line per feature. It fixes every failing feature and every feature with no line. Then it calls `contact_sheet`, so the review judges a working build as it plays.

## 1.7.56 — 2026-11-10

- The levels quality check now also reads the files that set prices, earnings and upgrade effects, not only the level curve. It can now tell when the levels and the economy do not fit together.

## 1.7.55 — 2026-10-31

- The design doc now says where each number came from: measured, set by the user, or a starting guess with the range to tune within. A guess no longer reads like a measurement, so it gets tuned.

## 1.7.54 — 2026-10-30

- The mascot player no longer stops a character for good. A tap on a character with no programme now ends on the idle still, a hold of 0 goes straight to the next clip, and a failed download tries again after a second. A clip whose download fails part way now frees the pages it did get.

## 1.7.53 — 2026-10-28

- A game's character can now perform on its menus and cards: `/make-game` follows a mascot video step that makes an idle still on a green screen, asks forge for short takes one at a time, checks each take (too still, cut off by the frame, no green screen), and packs the kept takes into transparent WebP pages with a ready player for Pixi. A video call that times out is no longer treated as failed: the step waits and looks in the library before anything is sent again.

## 1.7.52 — 2026-10-26

- Rigged characters, and asset requests that take longer than 45 seconds, now get the same quality review as every other generated asset. Needs ongame-cli 0.2.35 or newer, which updates itself at session start.

## 1.7.51 — 2026-10-26

- When the user asks to change work a phase already produced, the build now records the redo before repeating that phase.

## 1.7.50 — 2026-10-26

- New playable ads step: ask for playable ads for a game that already plays and the agent builds three short ads from the game's own code, art, sounds and mascot, checks with the game's own simulation that each one is a real challenge, shows them on a review page, and then makes one file per ad network (AppLovin, Unity Ads, Meta, Google) with your store link.

## 1.7.49 — 2026-10-22

- Before the agent hands game code over, it now reads and runs four code checks: layers kept apart, nothing allocated per frame, a core action that answers on three channels, and recalled lessons that show in the code. This holds for web and Unity games.

## 1.7.48 — 2026-10-20

- New art direction step: when an existing game should look like one consistent world, or you ask the agent to work as an art director, it audits every screen, writes the visual rules down before changing anything, and checks the result on phone and desktop, in every theme and on every screen.
- Animated mascots now breathe and blink while they wait between animations instead of freezing on a still frame.

## 1.7.47 — 2026-10-18

- After the browser check, the build now closes the game browser, so an open game no longer drains the battery.

## 1.7.45 — 2026-10-16

- Asset instructions now cover animated mascots made from video: either a crop of a finished screen, or the character on a green backdrop that is removed afterwards so the same clips play on every screen.
- Characters that move inside gameplay still use sprite animation.

## 1.7.44 — 2026-10-13

- Game-writing instructions now cover tap-triggered ads, delayed reward offers, privacy choices, store prices, pending purchases and restores.
- Older games check their helper exports before wiring these features. Reward readiness polling stops when its screen closes.
- This updates plugin instructions. The new scaffold watcher reaches makers in a future CLI release.

## 1.7.43 — 2026-10-13

- Web and Unity build instructions now provision shared GameAnalytics automatically, with each game identified by its title.
- Failed provisioning clears the previous config. Makers no longer supply analytics keys.

## 1.7.42 — 2026-10-12

- When a game upload fails or skips files, the agent now records it once, so failed publishes can be counted. Uploads work as before.
- Ships with CLI 0.2.27.

## 1.7.41 — 2026-10-09

- The publish texts now say who can read the kept copy of a game's source: every member of the gamebyte-ai organization. Before, they said it was kept "for your team".
- Ships with CLI 0.2.23.

## 1.7.40 — 2026-10-08

- `/ongame-statusline` now says the statusline also names a file the backup leaves out because it holds a key. Before, it said the marker shows only during a build. The file name shows from the first CLI release after 0.2.23.
- Ships with CLI 0.2.23.

## 1.7.39 — 2026-10-08

- In Claude Code, paid asset work started outside a build now really gets its jury review. 1.7.36 said so, but the plugin never ran the step that saves the review access after an image, 3D or sound request.
- Ships with CLI 0.2.23.

## 1.7.38 — 2026-10-08

- When an agent rigs or makes a 3D model, it now names the game when it starts the job, not only when it collects the result. The rig then counts toward that game's build.

## 1.7.37 — 2026-10-08

- Publishing a game with a large source folder no longer freezes. The source is packed as it is read and stops at the limit. A kept source may now be up to 400 MiB after compression (was 200 MiB).
- When a build's upload fails, publish no longer says the game is published. The result lists each failed file with its status. If the source upload failed too, its note says this build was not published. If the host refused index.html, that is true and the previous page stays live. If the connection dropped while sending index.html (status 0), the note can be wrong: either page may be live.
- On a Mac, login no longer hangs when the Keychain is unavailable. It stops and asks you to unlock or create your login Keychain.
- At a Mac desktop, login and tool startup wait up to 120 seconds while you type your Keychain password. Remote (SSH) sessions keep a 5-second limit. An SSH login waits while a desktop login on the same Mac unlocks the Keychain.
- A failed Mac Keychain write no longer prints your login tokens.
- When a source is over the limit, the source file is closed before the limit is reported, so Windows can clean it up.
- Ships with CLI 0.2.23.

## 1.7.36 — 2026-10-07

- A publish now boots the game first and refuses one that fails to start. It catches broken asset paths and boot errors; it does not judge whether a game is drawn. When the check cannot run, the game is published and you are told so.
- The publish boot check no longer refuses a real game drawn in two colours on one canvas. A hung page letterboxed in flat colours is still refused.
- A publish refuses a page whose HTML points at a file the build does not contain, before any file is sent.
- Paid asset work started outside a build now gets its jury review.
- Claude Code publishes keep the game source again.
- A kept game source never includes a file a .gitignore hides. A publish run from a folder inside the game no longer keeps only part of its source. Without git, no source is kept.
- Ships with CLI 0.2.22.

## 1.7.35 — 2026-10-07

- Glows, light rays, skies and ribbon shading in new games are now drawn as one shape with a smooth gradient fill, so they no longer show visible rings or bands. The polish phase reads the gradient guide before drawing the first one.

## 1.7.34 — 2026-10-06

- Every publish now records the game's GitHub repository on its build, or `none` when the game folder has no remote. Only the host and repository path are sent; a user name, token or port in the remote is dropped on your machine.
- The CLI now downloads a new release in the background and runs it on the next start, so a slow line no longer drops the update. A new release that fails to start falls back to the previous one.
- On Windows, a self-update now waits out a brief lock on the running `ongame` program instead of failing.
- Ships with CLI 0.2.21.

## 1.7.33 — 2026-10-04

- `/publish` and the polish phase now check before publishing: they confirm a build exists for the game and run `precheck.mjs` on `dist/`, which lists every file a publish would refuse at once.
- An imported game that still holds another maker's telemetry config is no longer published with it: the publish stops until that config is removed.
- Every unit of work in `/make-game` opens its build steps, so each build's time and review are recorded.
- Large Unity web games, including `.br` and `.gz` files, publish in one go. Unity builds start from the Unity project.
- A failed upload no longer puts a broken page live: `index.html` goes up last.
- Ships with CLI 0.2.20.

## 1.7.32 — 2026-10-02

- The "Built with onGame" credit is now checked as a phone: the pill leaves when play starts (`window.ongameCredit.leave()`), stays on one line at 360 px, and a game can place it above its own bottom bar. `/make-game` runs the credit and a phone check (pause, background audio, back key, pixel ratio, safe area) before calling a web game done.
- `/publish` and the polish phase pass the new `source` slot through and report it. Keeping a game's source is off for accounts unless it has been turned on for them; when it is off, nothing changes and nothing is said.

## 1.7.31 — 2026-10-02

- Before the levels of a level-based game (puzzle, casual or hybrid-casual stages) are generated or written, `/make-game` now runs a level design step: it decides where the game is hard, where it rests and where a booster is offered, measures the levels against that, has the result reviewed, and keeps it in `docs/LEVEL_DESIGN.md`.

## 1.7.30 — 2026-10-01

- Before writing a game rule (a hit, a match, a merge, a spawn, a jump, a state change), `/make-game` now looks in the mechanics library for verified code first, reads when each one does not fit, and carries the licence note with anything it copies.

## 1.7.29 — 2026-09-28

- Every published game now carries a "Built with onGame" credit: an animated card at launch and a small pill on the first screen that leaves on the first tap. `/publish` adds it before the build and checks the built page for it; `--badge top|off` moves the pill off a game's own UI, and `--wait ready` lets a game with a late first screen say when it is drawn.
- Ships with CLI 0.2.18.

## 1.7.28 — 2026-09-28

- Before writing movement for more than one moving thing (walkers, crowds, units, traffic), point the build at the agent-space guidance: what is floor, wall or a reserved zone, who collides with whom, how routes go round what they must not cross, and how to keep a crowd apart without changing the game's pace.

## 1.7.26 — 2026-09-24

- Add a storyboard step: before the first visual of a multi-scene game or a recurring character, settle the scenes and cast in `docs/STORYBOARD.md` and show it before generating anything. A replica fills it from the reference instead of skipping it.
- Point feel work at the game-feel guidance: which player moments need a response, the recipe for each, and how to check it frame by frame.
- Ships with CLI 0.2.18.

## 1.7.25 — 2026-09-16

- Temporarily suspend automatic workflow creation and phase routing; keep the phase definitions available.
- Let the agent clarify consequential ambiguity and contradictions one question at a time, then work from a structured brief and use a native goal when supported.
- Keep clear requests lightweight and preserve existing game identity and publishing.

All notable changes to `ongame-cli` are documented here. Distribution/plugin-manifest changes
(this repo) and CLI binary releases (tagged `cli-v*`) are both tracked in this one file since
they're released together conceptually, even though the CLI binary's own build lives in a
separate private repo.

## [1.7.24] - Mechanics guidance and instruction integrity

- The code phase and its implementation tasks now consult the mechanics library before writing
  gameplay rules, check each candidate's limits and evidence, and retain attribution when using it.
- Builds check the loaded plugin's instructions against its versioned content lock and report stale
  or incomplete installations with reinstall guidance that preserves the installation scope.
- Requires CLI binary `cli-v0.2.16` or newer; the launcher self-updates.

## [1.7.19] - Boot the build before publishing

Two generated games were published as a black page with a clean console, and no step in the
pipeline had ever opened the file being published. The dev server hides both causes by construction,
and the publish check compares bytes, not behaviour.

- **New:** the polish phase's deploy step now calls `verify_build({gameDir})` between `npm run build`
  and publish. It boots `dist/` in a real browser served from a sub-path, the way a published game is
  served, and answers `pass` / `fail` / `unverified` — three different things. `fail` blocks the
  publish; `unverified` ("we did not look") never counts as a failure and never authorises publishing
  either. Requires CLI binary `cli-v0.2.12` or newer (the launcher self-updates).

## [1.5.0] - Concept-driven assets

The `concept` phase already produced a menu mock and in-game frames with the HUD, and the `assets`
phase never looked at them — it built its manifest from the design doc and the approved pictures went
unused. The gap is now closed by asking.

- **New:** before building the asset manifest, the assets phase finds the concept visuals (reading
  `docs/CONCEPT.md`, checking the files exist and are real generations rather than gray-box
  placeholders) and asks whether the game should look like them. Plain language, in the agent's own
  voice — never pipeline vocabulary.
- Partial answers are honoured per group: "keep this menu" sources the menu from the concept and the
  rest from the doc. An unanswered question is unresolved, not consent — asked once more, then it
  falls back to the doc and says so, that being the cheaper and reversible path.
- When a group is sourced from the concept, the visual is copied into `assets/reference/`, uploaded
  via `forge_reference` / `reference_upload`, and the returned `assetId` becomes that group's `editOf`
  anchor — so "it will look like the concept" is wired, not just promised. Sprite sheets are carved
  out explicitly (they generate from the prompt and ignore `editOf`) and reported as style-matched by
  description.
- Backed by the gated `pattern:concept-deconstruction` knowledge: types and a placement table rather
  than one asset per visible object, and a shared frame extracted once instead of baked into every
  item.

## [1.4.x] - Not documented at the time

Shipped without changelog entries; recorded here for continuity: phase-skill sync from source (1.4.0),
the build-record instructions customers had never received (1.4.1), and the telemetry level-event
correction (1.4.2).

## [1.3.0] - Windows x64 support

First-class Windows support. Nothing in the payload is platform-specific any more: one manifest, one
launcher name, one implementation of every piece of logic.

- **New:** `install.ps1` (served at `https://cli.ongame.ai/install.ps1`, run with
  `irm https://cli.ongame.ai/install.ps1 | iex`). Windows PowerShell 5.1 and PowerShell 7, WoW64-correct
  architecture detection, checksum-verified download, rename-aside install over a running binary,
  non-truncating registry PATH update (never `setx`), then the same `ongame-cli install` handoff
  `install.sh` uses. `-NoPathUpdate` / `-NoPluginSetup` (also readable from `$env:ONGAME_NO_PATH_UPDATE` /
  `$env:ONGAME_NO_PLUGIN_SETUP`, since `irm | iex` cannot pass parameters).
- **New:** `bin/ongame-launcher.exe` — the Windows twin of `bin/ongame-launcher`, a ~10KB C trampoline
  built reproducibly from `bin/win/ongame-launcher.c`. Both are reached through the SAME manifest string:
  an extensionless spawn path resolves to its `.exe` sibling on Windows.
- **Changed:** `hooks/hooks.json` now uses Claude Code's **exec form** (`command` + `args`) and points every
  hook at `bin/ongame-launcher` with `["hook", "<name>"]`. Exec form spawns a real executable with no shell
  on any platform, which removes three whole failure classes at once: the Git-Bash-vs-PowerShell dispatch,
  `${CLAUDE_PLUGIN_ROOT}` backslashes eaten as shell escapes, and a space in the user's name splitting the
  command into words.
- **Changed:** the `playwright` MCP server now goes through `bin/ongame-launcher playwright` instead of bare
  `npx`. `npx` is `npx.cmd` on Windows and a `.cmd` shim cannot be spawned without a shell — and neither a
  plugin's `mcpServers` block nor Codex's `[mcp_servers]` has a per-platform override, so one command string
  has to work everywhere.
- **Removed:** `hooks/*.sh` and `scripts/*.sh`. Every one of them was silently dead on a Windows machine
  without Git for Windows, where Claude Code registers no Bash tool at all. They now live inside the binary
  as `ongame-cli hook <name>` / `ongame-cli statusline`, with real unit tests — one implementation, not a
  POSIX copy and a Windows copy.
- **New:** `test/mock-release-server.mjs` — a dependency-free stand-in for the two GitHub hosts the install
  path talks to, plus the `ONGAME_LAUNCHER_API_ROOT` / `ONGAME_LAUNCHER_DOWNLOAD_ROOT` seams in `install.sh`
  and `install.ps1` that reach it (the launcher and the binary's updater already honoured those two names).
  Both installers were previously the one production path nothing could test end to end; the release gate now
  runs each of them against a real HTTP server and asserts checksum verification, idempotency, and that a
  corrupt release leaves no partial install. Unset in production, the seams change nothing — and they cannot
  weaken the trust chain, because `checksums.txt` is fetched from the same root as the binary and the sha256
  check stays unconditional.

## [1.2.3] - CRLF install fix

- **Fix:** add `.gitattributes` (`* text=auto eol=lf`) so shell scripts are ALWAYS checked out with LF,
  regardless of the user's `git config core.autocrlf`. Without it, a user whose git has
  `core.autocrlf=true` received CRLF line endings on `claude plugin install`, which broke the script
  shebangs and silently killed the plugin:
  - `bin/ongame-launcher` → `bad interpreter: /bin/sh^M` — the MCP server never started, so **none of the
    ongame tools appeared** in the session.
  - `hooks/browser-check.sh` → `env: bash
: No such file or directory` — the SessionStart hook error.
  Repo blobs were already LF; the corruption happened at checkout on the user's machine. `.gitattributes`
  overrides `core.autocrlf`, fixing it at the source for every install. Version bumped so the version-gated
  auto-update pulls the fix into a fresh, LF-clean plugin cache.

## [1.0.0] - Unreleased

Initial public release of the ongame-cli distribution.

- `install.sh`: one-line curl\|sh installer — OS/arch detection, checksum-verified binary
  download, PATH setup, Claude Code + Codex CLI MCP registration.
- `.claude-plugin/plugin.json` + `marketplace.json`: static Claude Code plugin manifest — a thin
  shim (`bin/ongame-launcher`) in front of the self-updating `ongame-cli` binary.
- `bin/ongame-launcher`: dependency-free Node.js launcher — checks GitHub Releases for a newer
  `ongame-cli` build at every process start, verifies its checksum, swaps it in place, then execs
  into it.
- `codex/config-snippet.toml`: MCP server registration for OpenAI Codex CLI.
