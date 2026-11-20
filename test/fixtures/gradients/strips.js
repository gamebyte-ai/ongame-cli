// A sky and a vignette faked with strips and rings: gradient-check must report both.
export function sky(g, w, h, lerpColor, top, bottom) {
  const bands = 48;
  for (let i = 0; i < bands; i++) g.rect(0, (h * i) / bands, w, h / bands + 1).fill(lerpColor(top, bottom, i / (bands - 1)));
}

export function vignette(g, cx, cy, r, dark) {
  for (let i = 1; i <= 8; i++) g.circle(cx, cy, r - i * 4).stroke({ color: 0x150a2a, width: 4, alpha: dark * (1 - i / 9) });
}

export function softEllipse(ctx, n) {
  for (let i = 0; i < n; i++) ctx.beginFill(0xffffff, 0.1).drawEllipse(0, 0, 40 + i * 4, 20 + i * 2);
}

export function cssGlow(g) {
  for (let i = 0; i < 10; i++) g.circle(0, 0, 100 - i * 5).fill('rgba(255, 255, 255, 0.05)');
}
