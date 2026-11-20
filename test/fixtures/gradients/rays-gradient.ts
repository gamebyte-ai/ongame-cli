// The same rays and glow, each drawn as one shape with one FillGradient. gradient-check must pass it.
import { FillGradient, Graphics } from 'pixi.js';

const LEN = 280;
const rgba = (a: number) => `rgba(255, 243, 176, ${a})`;
const fade = (r: number) => new FillGradient({
  type: 'radial', textureSpace: 'global',
  center: { x: 0, y: 0 }, innerRadius: 0, outerCenter: { x: 0, y: 0 }, outerRadius: r,
  colorStops: [{ offset: 0, color: rgba(0.5) }, { offset: 0.3, color: rgba(0.3) },
               { offset: 0.6, color: rgba(0.1) }, { offset: 1, color: rgba(0) }],
});

export function drawRays(g: Graphics): void {
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2, a1 = a0 + Math.PI / 18;
    g.moveTo(0, 0).lineTo(Math.cos(a0) * LEN, Math.sin(a0) * LEN).lineTo(Math.cos(a1) * LEN, Math.sin(a1) * LEN).closePath();
  }
  g.fill(fade(LEN));
  const glow = new Graphics().circle(0, 0, 150).fill(fade(150));
  g.addChild(glow);
}
