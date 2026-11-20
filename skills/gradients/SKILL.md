---
name: gradients
description: Before a game draws anything that fades — a glow, light rays, a sky, a vignette, a halo, a shadow, ribbon or button shading, a background — draw it as ONE shape with ONE gradient fill (PixiJS v8 FillGradient), never as stacked rings, bands, strips or discs. Includes the code and a source check that finds stacked-shape fades.
---

**Anything that fades is one shape with one gradient fill.** A stack of flat shapes whose alpha or colour steps
from one to the next (rings, bands, strips, discs) shows every step as a visible ring or band on a phone screen,
however many steps there are. This holds for a new game and for a change to a finished one.

## PixiJS v8: `FillGradient`

`FillGradient` is part of `pixi.js` v8 (`import { FillGradient } from 'pixi.js'`). Build the shape first, then fill
it once.

**Radial** (glow, halo, light rays, vignette). Use `textureSpace: 'global'` so the numbers are pixels in the
`Graphics`' own space, centred where the shape is centred:

```ts
const rgba = (a: number) => `rgba(255, 243, 176, ${a})`;
const g = new Graphics();
for (let k = 0; k < 12; k++) {                       // 12 wedges, one path: the loop draws, it does not fill
  const a0 = (k / 12) * Math.PI * 2, a1 = a0 + Math.PI / 18;
  g.moveTo(0, 0).lineTo(Math.cos(a0) * R, Math.sin(a0) * R).lineTo(Math.cos(a1) * R, Math.sin(a1) * R).closePath();
}
g.fill(new FillGradient({
  type: 'radial', textureSpace: 'global',
  center: { x: 0, y: 0 }, innerRadius: 0, outerCenter: { x: 0, y: 0 }, outerRadius: R,
  colorStops: [{ offset: 0, color: rgba(0.8) }, { offset: 0.3, color: rgba(0.56) },
               { offset: 0.6, color: rgba(0.24) }, { offset: 1, color: rgba(0) }],
}));
```

A soft glow is the same gradient on one `g.circle(0, 0, R)`. For an oval glow, add `scale` (the y scale) and
`rotation`. Rotate or scale the `Graphics` to animate it; the gradient moves with it.

**Linear** (sky, background, ribbon or button shading). With the default `textureSpace: 'local'`, `start` and `end`
are fractions of the shape's own box (0 to 1):

```ts
const sky = new FillGradient({
  type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
  colorStops: [{ offset: 0, color: 0x7ec8f2 }, { offset: 0.6, color: 0xbfe6f7 }, { offset: 1, color: 0xfdf3d8 }],
});
bg.rect(0, 0, width, height).fill(sky);
```

- **Make each gradient once and reuse it.** A `FillGradient` owns a texture. Never create one per frame; call
  `destroy()` when its screen goes away. A fade that animates changes the `Graphics`' `alpha`, `scale` or
  `rotation`, not the gradient.
- **Fade to the same colour at alpha 0** (`rgba(r, g, b, 0)`), not to transparent black, or the edge turns grey.
- **Very tight stops** (a thin bright rim) may need `textureSize: 512`; the default is enough for soft fades.
- **Canvas 2D** (a texture painted once): `createRadialGradient` / `createLinearGradient` with `addColorStop`, then
  one `fillRect` or `arc`. The same rule holds: one fill, no stacked shapes.
- **Three.js**: a gradient texture or a shader on one mesh, never stacked translucent planes.
- An older Pixi (v7 and below) has no `FillGradient`. Paint the gradient once on a canvas and use it as a texture.

## Check the source

`check.mjs` sits next to this file. Run it on the game folder after every change that draws something soft, and
before calling the game done:

```sh
node <this skill's dir>/check.mjs <gameDir>      # 0 = no stacked-shape fade; 1 = each one as file:line; 2 = bad input
```

It reports a loop that draws shapes and fills them with an alpha or colour computed from its counter, or that stacks
translucent shapes of growing size on one centre. Replace each one it names with a single shape and a
`FillGradient`, then run it again. Particles, tiles and colours from a palette are not reported.

A loop that really needs separate steps (a trail of distinct dots, a stepped pixel-art sky the art direction asks
for) is waived with a comment on the line above it, with the reason: `// gradient-check: ok pixel-art sky, 4 bands`.
Tell the user about every waiver.

Then look at the result on the built page at phone size: no ring or band should be visible in any fade.
