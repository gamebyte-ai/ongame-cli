# Menu icons that move part by part

Can, request 595361 on i_8uifmnam, about Bloom Bounce's bottom menu: make it the standard, so every game's menus
are like this by default. Bloom Bounce's icons are cut into parts (an awning, a wheel, flowers; a roof, a door, a
window light). Each part has its own idle loop, press reaction and staggered pick sequence. That code merged in
gamebyte-ai/bloom-bounce as 26e07511 after a signed PASS (rev-i_8uifmnam, PR 3).

## Where the default menu comes from

A game's bottom menu is `template:gamelabs-shell-bottom-nav` (`BottomTabs.ts`, `BottomNav.ts`). onGame's server
serves it from gamebyte-ai/ongame `core/knowledge/templates/`. This repo holds no template. It ships code into a
game only through skill scripts, run as `node <pluginRoot>/skills/<skill>/<script>.mjs <gameDir>` (credit,
analytics, gradients, mobile-ready).

| option | a fresh game gets it | repos | cost |
|---|---|---|---|
| A. change the server template | after a server deploy; Claude Code and every other agent | ongame | this card cannot push there |
| B. a plugin skill that writes the code into the game, on top of today's template | at once, from this plugin release | ongame-cli | a second file set beside the template |
| C. skill text only: describe the motion, each game writes its own | at once | ongame-cli | every game rewrites a 200-line player; the review found allocation and jump bugs in the first one |

Chosen: B now, A as a follow-up card for gamebyte-ai/ongame. B reuses the reviewed player and works with the
template's `BottomNav` unchanged, so A can fold it in later without breaking a game made with B.

## What ships

`skills/menu-icons/`:

- `SKILL.md`: the rule (every bottom-menu icon moves part by part, by default), how to make the parts, the
  timings, and the checks.
- `shell/partMotion.ts`: Bloom Bounce's part player, from 26e07511. Two changes: the frame loop makes no new
  array or pose (the review noted clips that allocate), and a cut-off clip's ease writes into one reused pose.
- `shell/partRoles.ts`: ready clips by role, so a game names its parts and gets motion without writing curves.
  Roles come from Bloom Bounce's three rigs: `flap` (awning), `hop` (roof), `spin` (wheel, gear), `pop` (flowers,
  bushes), `swing` (door), `glow` (window light, sparkle). The whole icon is two more parts, with Bloom
  Bounce's pick motions: `body` joined at its base (`hop`, `wobble`) and `body-centre` joined at its centre
  (`spin`, 0.56 s where Bloom Bounce's took 0.48 s: picked again mid-turn, it then still turns under 0.4 rad per
  frame at 60 fps).
  `rigFromRoles` staggers the pick sequence in the order the parts are listed.
- `shell/tabIconMotion.ts`: the driver. It takes the template's `BottomNav` and one parted icon and rig per tab.
  A press starts on the tab's `pointerdown`. A pick starts when `nav.active` changes. Idle runs on the clock the
  game already passes to `nav.update`. It throws when a tab has no parted icon, so a tab cannot be left still.
- `apply.mjs <gameDir>`: writes the three files into `src/shell/`. A second run changes nothing. It never
  overwrites a file it did not write (Bloom Bounce has its own `partMotion.ts`).
- `check.mjs <gameDir>`: exit 1 when the game builds a `BottomNav` (or a `BottomTabs` for another renderer)
  and no `TabIconMotion` (or `PartPlayer`). Exit 1 also when the files `apply.mjs` wrote changed or are older.
  It reads a syntax tree with the parser the gradients check already bundles.

`commands/make-game.md`, `skills/phone-layout/SKILL.md` and `skills/phases/polish/SKILL.md` point every bottom
menu at the skill. `/make-game` runs `check.mjs` before a web game is called done, beside the other checks.

## Rules kept from Bloom Bounce

- Every press and pick clip starts and ends at rest. Every idle loop ends where it starts.
- A pick sequence lasts at most 0.8 s; a press 0.3 s. Idle loops last 2 s or more. Unselected tabs idle at 35 %.
- A clip that is cut off eases back from the drawn pose; a cut-off spin finishes forward.
- Calm and the system's reduced-motion setting keep every part at rest.
- Parts change only transforms and alpha, so the bar never repaints for them.
- What a moving part uncovers is drawn (the wall under a roof, a lit room behind a door).

## Failure paths

- `apply.mjs` checks every target before it writes any file. A refused file stops the run with no file written.
- `check.mjs`: a file the parser cannot read is named and the run exits 2, never 0.

## Proof

- `test/menu-icons.test.mjs`: the role clips keep the rules above at 60 fps; the driver plays idle, press and pick
  on a stand-in nav, and throws for a tab with no parts; `apply.mjs` and `check.mjs` on fixture games.
- A fresh game: scaffold it with the CLI (`scaffold_materialize`), add the template's bottom menu
  (`template_get`), follow the skill, build, and record it on a 390x844 phone viewport in Chrome.

## Not in this change

- The server template and the skill copies other agents get (gamebyte-ai/ongame): the follow-up card.
- Unity games: `unity-bottom-nav` is C#. The skill states the same rules for it; the check reads only web games.
