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

export function fractionalStep(g) {
  for (let i = 0; i < 1; i += 0.01) g.rect(0, i * 400, 400, 4).fill({ color: 0xffffff, alpha: i });
}

export function canvasSky(ctx) {
  for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(0, 0, 0, ${i / 40})`; ctx.fillRect(0, i * 10, 400, 10); }
}

export function aliasGlow(owner) {
  for (let i = 0; i < 40; i++) { const g = owner.glow; g.circle(0, 0, 100 - i * 2).fill({ color: 0xffffff, alpha: 0.05 }); }
}

export function whileDiscs(g) {
  let i = 0;
  while (i < 40) { g.circle(0, 0, 100 - i * 2).fill({ color: 0xffffff, alpha: 0.05 }); i++; }
}

export function oneDeclaration(g, positions) {
  for (let i = 0; i < 20; i++) { const t = i / 20, x = positions[i]; g.rect(0, i * 10, 100, 10).fill({ color: 0xffffff, alpha: t }); void x; }
}
