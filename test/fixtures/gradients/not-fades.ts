// Loops that step a fill but are not fades: gradient-check must pass all of them.
import { Graphics } from 'pixi.js';
import * as PIXI from 'pixi.js';

type Puff = { x: number; y: number; r: number; born: number };

export function particles(g: Graphics, puffs: Puff[], t: number): void {
  for (const p of puffs) {                                     // one shape per item
    const age = t - p.born;
    g.circle(p.x, p.y - age * 30, p.r * (1 + age * 2)).fill({ color: 0xfff0d2, alpha: Math.max(0, 0.4 - age) });
  }
  for (let i = 0; i < 26; i++) {                               // sparkles: % and the clock make it per-item data
    const ph = (t * 0.1 + i * 0.137) % 1;
    g.circle(i * 14, 900 * (1 - ph), 3).fill({ color: 0xfff1a8, alpha: Math.sin(ph * Math.PI) });
  }
}

export function tiles(g: Graphics, palette: number[]): void {
  for (let i = 0; i < 20; i++) g.roundRect(i * 40, 0, 36, 36, 6).fill(palette[i % palette.length]);
  for (let i = 0; i < 20; i++) g.roundRect(i * 40, 40, 36, 36, 6).fill({ color: palette[i], alpha: 0.8 });
}

export function buttons(items: { bg: Graphics; on: boolean }[]): void {
  for (let i = 0; i < items.length; i++) {                     // a new object each pass, not a stack
    const b = items[i];
    b.bg.roundRect(-62, -24, 124, 48, 24).fill({ color: 0x264a22, alpha: b.on ? 0.3 : 0.12 });
  }
}

export function lineGlow(g: Graphics, pts: { x: number; y: number }[]): void {
  for (const [color, width, alpha] of [[0xff8a1e, 12, 0.75], [0xfff3c4, 4, 1]] as const) { // two layers
    g.moveTo(pts[0].x, pts[0].y);
    for (const q of pts.slice(1)) g.lineTo(q.x, q.y);
    g.stroke({ color, width, alpha });
  }
}

export function treeRings(g: Graphics, s: number): void {
  for (let i = 1; i <= 8; i++) g.circle(0, 0, s * 0.1 * i).stroke({ width: 1, color: 0x6b3f14 }); // line art
}

export function waived(g: Graphics): void {
  // gradient-check: ok pixel-art sky, the art direction asks for hard bands
  for (let i = 0; i < 6; i++) g.rect(0, i * 40, 400, 40).fill({ color: 0x3060a0, alpha: 1 - i / 6 });
}

export function opaqueRings(g: Graphics, palette: number[], options: Record<number, boolean>): void {
  for (let i = 0; i < 10; i++) g.circle(0, 0, 100 - i * 5).fill({ color: palette[i], alpha: 1 }); // opaque target rings
  for (let i = 0; i < 10; i++) { if (options.hasOwnProperty(i)) g.rect(i * 20, 0, 16, 16).fill(0xffffff); }
}

export function opaqueCss(g: Graphics): void {
  for (let i = 0; i < 10; i++) g.circle(0, 0, 100 - i * 5).fill('rgba(255, 255, 255, 1)');
  for (let i = 0; i < 10; i++) g.circle(0, 0, 100 - i * 5).fill('#ffffffff');
  for (let i = 0; i < 10; i++) g.circle(0, 0, 100 - i * 5).fill('rgb(255 255 255 / 1)');
}

export function canvasTiles(ctx: CanvasRenderingContext2D, palette: string[]): void {
  for (let i = 0; i < 20; i++) { ctx.fillStyle = palette[i % palette.length]; ctx.fillRect(i * 40, 0, 36, 36); }
}

export function pixelColumns(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  for (let i = 0; i < W; i++) { ctx.fillStyle = `rgb(${(i / W) * 255 | 0}, 0, 0)`; ctx.fillRect(i, 0, 1, H); }
}

export function whileQueue(g: Graphics, queue: { x: number; y: number; a: number }[]): void {
  while (queue.length) { const p = queue.pop()!; g.circle(p.x, p.y, 4).fill({ color: 0xffffff, alpha: p.a }); }
}

export function sparksAndOutlines(g: Graphics, sparks: { x: number; y: number; r: number }[]): void {
  for (let i = 0; i < 20; i++) {
    const p = sparks[i];
    g.circle(p.x, p.y, p.r).fill({ color: 0xffffff, alpha: 0.5 });
    g.circle(0, 0, 100 - i).stroke({ width: 1, color: 0xffffff });
  }
}

export function paintDabs(g: Graphics, n: number, colors: (i: number) => number, cx: (i: number) => number): void {
  for (let i = 0; i < n; i++) g.circle(cx(i), 0, 20).fill({ color: colors(i) }); // a colour per tile, like palette[i]
}

export function freshDabs(layer: { addChild(d: unknown): void }, n: number, colorOf: (i: number) => number): void {
  for (let i = 0; i < n; i++) {                                // a new Graphics each pass
    const d = new PIXI.Graphics().circle(0, 0, 20 + i).fill({ color: colorOf(n - i), alpha: 0.5 });
    layer.addChild(d);
  }
}

export function pageDots(g: Graphics, pages: number, cur: number): void {
  for (let i = 0; i < pages; i++) g.circle(i * 24, 0, 6).fill(i === cur ? 0xffffff : 0x667788);
}

export function segmentedBar(g: Graphics, filled: number): void {
  for (let i = 0; i < 10; i++) g.rect(i * 22, 0, 20, 12).fill(i < filled ? 0x6fd36f : 0x2a2a2a);
}

export function widerRings(g: Graphics): void {
  for (let i = 0; i < 10; i++) g.circle(0, 0, 10 + i * 10).stroke({ color: 0xffffff, width: 1 + i }); // one opaque colour: line art
}

export function widerRingsV7(g: Graphics): void {
  for (let i = 0; i < 10; i++) { g.lineStyle(1 + i, 0xffffff, 1); g.drawCircle(0, 0, 10 + i * 10); } // v7: width comes first
}

export function widerRingsLocalStyle(g: Graphics): void {
  for (let i = 0; i < 20; i++) {
    const style = { color: 0xffffff, width: i + 1 };
    g.circle(0, 0, 100 - i * 4).stroke(style);
  }
}

export function ringsBesideFadingLine(rings: Graphics, path: Graphics): void {
  for (let i = 0; i < 20; i++) {                               // the rings and the fading line are two objects
    rings.circle(0, 0, 10 + i * 4).stroke({ color: 0xffffff, width: 1 });
    path.moveTo(i * 20, 0).lineTo(i * 20, 50).stroke({ color: 0xffffff, alpha: i / 20 });
  }
}

export function ringsBesideFadingLineOnOneOwner(layer: { rings: Graphics; path: Graphics }): void {
  for (let i = 0; i < 20; i++) {                               // two Graphics kept on one owner are still two objects
    layer.rings.circle(0, 0, 10 + i * 4).stroke({ color: 0xffffff, width: 1 });
    layer.path.moveTo(i * 20, 0).lineTo(i * 20, 50).stroke({ color: 0xffffff, alpha: i / 20 });
  }
}

export function twoCanvases(a: CanvasRenderingContext2D, b: CanvasRenderingContext2D): void {
  // a's see-through fillStyle does not paint b's rects; b keeps its own opaque fill
  for (let i = 0; i < 20; i++) { a.fillStyle = 'rgba(255,255,255,0.05)'; b.fillRect(0, 0, 100 - i * 4, 100 - i * 4); }
}

export function twoCanvasesOnOneOwner(canvases: { a: CanvasRenderingContext2D; b: CanvasRenderingContext2D }): void {
  for (let i = 0; i < 20; i++) { canvases.a.fillStyle = 'rgba(0,0,0,0.05)'; canvases.b.fillRect(0, 0, 100 - i * 4, 100 - i * 4); }
}

export function canvasTaperedStroke(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 20; i++) {                               // globalAlpha here is the stroke's: a tapered line, line art
    ctx.globalAlpha = i / 20;
    ctx.beginPath(); ctx.moveTo(i * 20, 0); ctx.lineTo(i * 20 + 20, 0); ctx.stroke();
  }
}

export function canvasTaperedStrokeBesideAnotherCanvas(ctx: CanvasRenderingContext2D, other: CanvasRenderingContext2D): void {
  for (let i = 0; i < 20; i++) {                               // the fill is on another context: ctx's alpha is still a stroke's
    ctx.globalAlpha = i / 20;
    ctx.beginPath(); ctx.moveTo(i * 20, 0); ctx.lineTo(i * 20 + 20, 0); ctx.stroke();
    other.fillRect(0, 0, 10, 10);
  }
}

export function ringsBesideFadingLabels(rings: Graphics, ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 20; i++) {                               // the rings and the fading text are two objects
    rings.circle(0, 0, 10 + i * 4).stroke({ color: 0xffffff, width: 1 });
    ctx.globalAlpha = i / 20;
    ctx.fillText('label', i * 20, 0);
  }
}

export function ringsBesideTranslucentLabels(rings: Graphics, ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 20; i++) {
    rings.circle(0, 0, 10 + i * 4);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillText('label', i * 20, 0);
    rings.stroke({ color: 0xffffff, width: 1 });
  }
}

export function opaqueDiscsBesideTranslucentLabels(layer: { discs: CanvasRenderingContext2D; labels: CanvasRenderingContext2D }): void {
  for (let i = 0; i < 20; i++) {
    layer.discs.fillStyle = '#ffffff';
    layer.discs.globalAlpha = 1;
    layer.discs.arc(0, 0, 10 + i * 4, 0, Math.PI * 2);
    layer.labels.fillStyle = 'rgba(255,255,255,0.05)';
    layer.labels.globalAlpha = 0.1;
    layer.labels.fillText('label', i * 20, 0);
    layer.discs.fill();
  }
}

export function outlineBesideLocalNamedAlpha(g: Graphics): void {
  for (let i = 0; i < 20; i++) {                               // `alpha` and `color` are style keys here, not the local
    const alpha = i;
    g.circle(0, 0, 10 + i).stroke({ alpha: 1, color: 0xffffff, width: 2 });
  }
  for (let i = 0; i < 20; i++) {
    const color = i;
    g.circle(0, 0, 10 + i).stroke({ width: 2, color: 0xffffff, alpha: 1 });
  }
}

export function opaqueRectsWithCommentedAlpha(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 20; i++) {
    ctx.globalAlpha = 1 // opaque
    ctx.fillStyle = '#ffffff' /* solid */;
    ctx.fillRect(0, 0, 100 - i * 4, 100 - i * 4);
  }
}
