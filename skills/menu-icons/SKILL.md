---
name: menu-icons
description: Before building or changing a game's bottom menu (tab bar), and before calling a game with one done — cut every menu icon into parts that move on their own (an idle loop, a press reaction, a staggered pick), with the shipped part player, role clips and driver for template:shell-bottom-nav, and run the check. This is the default for every bottom menu.
---

**Every bottom-menu icon moves part by part. That is the default for every game with a bottom menu.** A
single-piece icon that only bounces or scales is not done. For example: the Shop stall's awning flaps, its wheel
rolls and its flowers pop one by one; the Home house's roof hops, its door opens on a lit room and its window
lights; the Settings coin's gear spins inside it and a sparkle flashes.

## 1. Add the motion code

Take the bar itself from `template:shell-bottom-nav` (`skills/phone-layout/SKILL.md`). Then run, with the game
folder's path as `<gameDir>`:

```sh
node <this skill's dir>/apply.mjs <gameDir>     # writes src/shell/partMotion.ts, partRoles.ts, tabIconMotion.ts
```

Run it again after a skill update: it replaces the copies it wrote before, and leaves a current copy alone. It
never overwrites a file of the game's own: it stops, names the file and writes nothing (exit 2). Do not edit the three files; write the game's own clips in
the game's own file (section 3).

## 2. Make each icon from parts

Each icon has **at least two parts that move on their own**, plus the whole icon (`body`). Pick parts a player
reads at 36 px: a roof, a door, a wheel, a lid, a flower, a gem, a sparkle. Make them one of three ways:

- **Drawn in code:** each part is its own `Graphics` or `Sprite` in the icon's container.
- **Generated:** the icon first, then each part as its own transparent image anchored to it
  (`skills/asset-anchor/SKILL.md`: `editOf` the icon). Stack them so at rest they draw the icon.
- **Cut from an existing icon:** a script cuts each part out with its mask and fills what it uncovers. Make it stop
  when the parts at rest differ from the icon by more than 2 of 255 levels in any pixel.

Put each part in its own node, and set the node's position to the part's **joint**: the hinge of a door or an
awning, a wheel's axle, a flower's stem. Draw the part around that origin, in the node's own coordinates: a door
hinged on its left is drawn from x = 0 to its width. **Draw what a moving part uncovers**: the wall under a roof, a
lit room behind a door, the coin face under a gear. Set a light's or a sparkle's alpha to 0: that is its rest.

`partedIcon` records the position, rotation, scale and alpha each node has when you call it as that part's rest
pose. So finish placing every node first, then call it.

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

Build the parted icons before the `BottomNav`, because its `icon` factories return their views. In a class, declare
the icons in fields above the nav, and the `TabIconMotion` in a field below it.

`TabIconMotion` throws when a tab has no parted icon, when a rig names a part the icon lacks, or when an icon has
fewer than two moving parts. Every part in the rig counts, a `glow` too; the whole icon does not. Locked and
"coming soon" tabs move too, dimmed by the nav.

| role | for | joint | idle | press | pick |
|---|---|---|---|---|---|
| `flap` | awning, flag, lid edge | top hinge | breathes | dips | flaps |
| `hop` | roof, cap, lifting lid | bottom centre | breathes | squashes | hops and lands |
| `spin` | wheel, gear, fan | centre | rocks | kicks | one full turn |
| `pop` | flower, bush, gem, star | base | sways | squashes | pops, in list order |
| `swing` | door, drawer, cover | hinge side | still | nudges | opens and closes |
| `glow` | window light, sparkle | centre | flashes now and then | flashes | lights up |

The whole icon's pick is `body: 'hop' | 'wobble' | 'spin' | 'none'` (default `hop`). In a pick, `pop` parts play
one after another in the order of the `parts` keys; the longer moves start early and run across the sequence. A part that needs its own curve takes a track of the game's clips instead of a role
(`{ idle, tap, select }`, each at rest at t = 0 and t = 1). Build each clip with `poseClip` from `partRoles.ts`,
which reuses one pose, so the frame loop makes no new object:
`{ select: poseClip((p, t) => { p.y = -2 * Math.sin(Math.PI * t); }) }`.

## 4. Timings and rules

The shipped files keep these:

- A pick sequence lasts 0.76 s (at most 0.8 s); a press 0.3 s. An idle loop lasts 4 s (at least 2 s).
- The selected tab idles at full strength, the others at 35 %. Neighbouring icons idle out of step.
- Every press and pick starts and ends at rest. A cut-off clip eases back from where it is drawn; a cut-off pick's
  spin finishes its turn forward, and a cut-off press goes back to rest.
- Calm and the system's reduced-motion setting keep every part still.
- Parts change only position, rotation, scale and alpha. The bar never repaints for them.

## 5. Check it

```sh
node <this skill's dir>/check.mjs <gameDir>
```

Exit 0: every bottom menu moves its icons part by part, or the game has no bottom menu. Exit 1: it names the file
and line of a `BottomNav` (or a `BottomTabs` drawn another way) whose icons do not move part by part, or a copy of
the three files that is missing, older or edited; run `apply.mjs` again. Exit 2: a file it could not read, or no
game folder. A `TabIconMotion` drives the nav it takes: the `new BottomNav(...)` itself, `this.nav` in the same
class, `nav` in the scope that declares it, or an exported `nav` its file imports. A nav the check cannot follow
(one returned straight from a function) passes when a driver is left over. A `BottomTabs` drawn another way passes with a `PartPlayer` in
the same file; a `BottomNav` whose every tab passes `rig:` (a nav with a part player built in) passes too. The check reads how the code is wired, as a
syntax tree. The parts themselves are checked when `TabIconMotion` starts: it throws, as above.

Then look at it on the built game at 390x844. `icons.probe('shop').parts` gives each part's offset from rest.
Show the user a short phone clip: every icon idling, one tapped, one picked.

**Unity:** `template:unity-bottom-nav` is C#. Keep the same parts, roles, timings and rules there; the check reads
only web games.
