---
name: menu-icons
description: Before building or changing a game's bottom menu (tab bar), and before calling a game with one done — cut every menu icon into parts that move on their own (an idle loop, a press reaction, a staggered pick), with the shipped part player, role clips and driver for template:shell-bottom-nav, and run the check. This is the default for every bottom menu.
---

**Every bottom-menu icon moves part by part. That is the default for every game with a bottom menu.** A
single-piece icon that only bounces or scales is not done. For example: the Shop stall's awning flaps, its wheel
rolls and its flowers pop one by one; the Home house's roof hops, its door opens on a lit room and its window
lights; the Settings coin's gear spins inside it and a sparkle flashes.

## 1. Add the motion code

Take the bar itself from `template:shell-bottom-nav` (`skills/phone-layout/SKILL.md`). Then, from the game folder:

```sh
node <this skill's dir>/apply.mjs <gameDir>     # writes src/shell/partMotion.ts, partRoles.ts, tabIconMotion.ts
```

A second run changes nothing. It updates a copy it wrote before. It never overwrites a file of the game's own:
it stops, names the file and writes nothing (exit 2). Do not edit the three files; write the game's own clips in
the game's own file (section 3).

## 2. Make each icon from parts

Each icon has **at least two parts that move on their own**, plus the whole icon (`body`). Pick parts a player
reads at 36 px: a roof, a door, a wheel, a lid, a flower, a gem, a sparkle. Make them one of three ways:

- **Drawn in code:** each part is its own `Graphics` or `Sprite` in the icon's container.
- **Generated:** the icon first, then each part as its own transparent image anchored to it
  (`skills/asset-anchor/SKILL.md`: `editOf` the icon). Stack them so at rest they draw the icon.
- **Cut from an existing icon:** a script cuts each part out with its mask and fills what it uncovers. Make it stop
  when the parts at rest differ from the icon by more than 2 of 255 levels in any pixel.

Put each part in a node whose origin is its **joint**: the hinge of a door or an awning, a wheel's axle, a flower's
stem. **Draw what a moving part uncovers**: the wall under a roof, a lit room behind a door, the coin face under a
gear. A light or a sparkle rests at alpha 0.

## 3. Wire it

```ts
import { partedIcon, TabIconMotion } from './shell/tabIconMotion.js';
import { rigFromRoles } from './shell/partRoles.js';

const shop = partedIcon(stallArt, { awning, wheel, rose, tulip });   // nodes inside stallArt
const nav = new BottomNav([
  { id: 'shop', label: 'Shop', icon: () => shop.view },
  { id: 'home', label: 'Home', icon: () => home.view },
], 'home', palette);
const icons = new TabIconMotion(nav, {
  shop: { icon: shop, rig: rigFromRoles('stall', { body: 'wobble', parts: { awning: 'flap', wheel: 'spin', rose: 'pop', tulip: 'pop' } }) },
  home: { icon: home, rig: rigFromRoles('house', { body: 'hop', parts: { roof: 'hop', door: 'swing', light: 'glow' } }) },
});
// every frame, on the shell's unscaled clock:  nav.update(dt); icons.update(dt);
// Calm or prefers-reduced-motion:              nav.setReducedMotion(r); icons.setReducedMotion(r);
// with the shell:                              icons.destroy(); nav.destroy();
```

`TabIconMotion` throws when a tab has no parted icon, when a rig names a part the icon lacks, or when an icon has
fewer than two moving parts. Locked and "coming soon" tabs move too, dimmed by the nav.

| role | for | joint | idle | press | pick |
|---|---|---|---|---|---|
| `flap` | awning, flag, lid edge | top hinge | breathes | dips | flaps |
| `hop` | roof, cap, lifting lid | bottom centre | breathes | squashes | hops and lands |
| `spin` | wheel, gear, fan | centre | rocks | kicks | one full turn |
| `pop` | flower, bush, gem, star | base | sways | squashes | pops, in list order |
| `swing` | door, drawer, cover | hinge side | still | nudges | opens and closes |
| `glow` | window light, sparkle | centre | flashes now and then | flashes | lights up |

The whole icon's pick is `body: 'hop' | 'wobble' | 'turn' | 'none'` (default `hop`). Parts play their pick in
the order they are listed. A part that needs its own curve takes a track of the game's clips instead of a role
(`{ idle, tap, select }`, each `t => pose`, at rest at t = 0 and t = 1).

## 4. Timings and rules

The shipped files keep these:

- A pick sequence lasts 0.76 s (at most 0.8 s); a press 0.3 s. An idle loop lasts 4 s (at least 2 s).
- The selected tab idles at full strength, the others at 35 %. Neighbouring icons idle out of step.
- Every press and pick starts and ends at rest. A cut-off clip eases back from where it is drawn; a cut-off spin
  finishes its turn forward.
- Calm and the system's reduced-motion setting keep every part still.
- Parts change only position, rotation, scale and alpha. The bar never repaints for them.

## 5. Check it

```sh
node <this skill's dir>/check.mjs <gameDir>
```

Exit 0: every bottom menu moves its icons part by part, or the game has no bottom menu. Exit 1: it names the file
and line of a `BottomNav` (or a `BottomTabs` drawn another way) whose icons do not move part by part, or a copy of
the three files that is missing, older or edited; run `apply.mjs` again. Exit 2: a file it could not read, or no
game folder. A `BottomNav` drawn another way passes with the game's own `PartPlayer`; one whose every tab passes
`rig:` (a nav with a part player built in) passes too.

Then look at it on the built game at 390x844. `icons.probe('shop').parts` gives each part's offset from rest.
Show the user a short phone clip: every icon idling, one tapped, one picked.

**Unity:** `template:unity-bottom-nav` is C#. Keep the same parts, roles, timings and rules there; the check reads
only web games.
