// End-card light rays faked with stacked shapes: 24 rings of 12 wedges, each ring one flat alpha, and a glow of 12
// stacked discs. On a phone every ring shows as a band. gradient-check must report both loops.
import { Graphics } from 'pixi.js';

export function drawRays(g: Graphics): void {
  const BANDS = 24, LEN = 280;
  for (let b = 0; b < BANDS; b++) {
    const r0 = (LEN * b) / BANDS, r1 = (LEN * (b + 1)) / BANDS;
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2, a1 = a0 + Math.PI / 18;
      g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0).lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1)
        .lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1).lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0).closePath();
    }
    g.fill({ color: 0xfff3b0, alpha: 0.5 * Math.pow(1 - (b + 0.5) / BANDS, 1.4) });
  }
  const glow = new Graphics();
  for (let b = 0; b < 12; b++) glow.circle(0, 0, 150 * (1 - b / 12)).fill({ color: 0xfff3b0, alpha: 0.025 });
  g.addChild(glow);
}
