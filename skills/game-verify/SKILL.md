---
name: game-verify
description: Before saying a game change is done, before a web publish and before a store build — prove the change works on the built game (test count before = after, a scripted proof run, screenshot sets you look at, rare outcomes forced deterministically), build from the game's latest line, and prove the live page serves every file of this build.
---

`/make-game` (Work and verify, `play_gate`), the polish phase (steps 1b-1e: `verify_build`, `?test=1` self-checks,
`contact_sheet`, `play_gate`) and `/publish` (live `index.html` byte check) already define the gates. This skill adds
what they leave open. Use those first; do not repeat them here.

```sh
node <this skill's dir>/line-check.mjs <gameDir> [--fetch]       # 0 = latest line, 1 = other work or BEHIND, 2 = error
node <this skill's dir>/live-diff.mjs <gameDir>/dist <liveUrl>   # 0 = all byte-identical live, 1 = differs, 2 = error
```

## 1. Rules did not break

- **Compare the test suite's pass and fail COUNTS before and after.** A truncated tail can hide a `N failed` line
  just above the cut; grep the summary line or read the whole output.
- **A visual or sound change leaves rule files untouched.** If the count moved, find out why first.
- **Assert every scripted edit.** A `str.replace` or `sed` whose anchor is gone changes nothing and raises nothing;
  build, type check and console stay clean. Anchor on structure (a signature), then `grep -c` the new symbol.

## 2. Prove it on the build, with a scripted player

This section and `references/proof-run.md` are the home of the verification traps; other skills point here.
- **Verify the built output, never the dev server**, built into its own folder: `vite build` empties its outDir.
- **Click with real input** (`mouse.click` / `touchscreen.tap` at the hit area's centre). `dispatchEvent` skips
  pointer capture and hides a button that a player cannot press.
- **On a stepped clock, render once before each click**: hit tests use the last drawn transforms.
- **Wait out transitions and drain delayed reward cards** before each tap, or the tap lands on the wrong screen.
- **Force rare outcomes with a deterministic driver** (`__game.drive.forceStuck()`, `forceLose()`). A random player
  rarely loses a forgiving game, so the lose and stuck cards go unchecked otherwise.
- **Console and `pageerror` count 0 for the whole run**: it catches silent errors (tweens on destroyed objects).

## 3. Look at every screen

`contact_sheet` judges the look over time. For a change, also take a **screenshot set per state** at the phone
sizes of the `/make-game` phone check and open every image before calling it passed.
- **Seed a save that unlocks everything** (`addInitScript` writing storage) and walk every screen and popup: text
  that wraps onto a bar or touches a close X is only seen this way.
- **Check the fullest case of each slot** (the reward row with the most items, the longest label). Icons enlarged
  on a one-item row overlapped a level badge on a three-item row.
- **When porting or rewriting, compare old and new side by side** on the same levels, and read the comparison. A
  port once shipped with its own side-by-side image showing the missing table and washed-out colours.

## 4. Give the verdict only when the run is over

- A signal at the start of a run is not the verdict: wait for the run to end, then check the evidence is from this
  run (timestamp), it ended cleanly, and later effects happened.
- **A failed or unmeasured gate blocks.** Say "this gate failed"; never recommend a publish over it, and never move
  it to "known deviations" silently.

## 5. Before a web publish or a store build: the latest line

Building from an older line overwrites newer live work, and a feature that lives on only one branch disappears
when another branch is published.
1. `game_summary({gameId})` and `line-check.mjs <gameDir>`. Read-only by default; `--fetch` first updates the
   remote-tracking refs (its only write) and exits 2 if the fetch fails. Local and remote branches are compared;
   ones merged into the default branch are collapsed. Exit 1 lists branches with work neither HEAD nor the default
   branch has, and the files that differ (`NEWER` = newer than HEAD); a `BEHIND` line means pull the default branch
   first. Merge the work or have the user confirm it is abandoned; never build past a `NEWER` line on your own.
2. Build, then `live-diff.mjs <gameDir>/dist <live url>` BEFORE publishing. Every differing file should be one
   your change explains. `foreign` = the live page loads files this build lacks, so the live game came from other
   source: stop and find it. `outside` = a same-origin ref outside the page's folder (wrong `base`).
3. A call that returned an error may still have uploaded files: measure the live page.

## 6. After the publish: every file, not only the page

`/publish` step 4 compares the live `index.html`. Run `live-diff.mjs` again: exit 0 proves every asset, including
stable-named ones (a model or sound kept under one name), is this build. Then open the live URL at phone size
with the console open.
