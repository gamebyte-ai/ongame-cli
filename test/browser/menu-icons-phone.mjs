#!/usr/bin/env node
/**
 * Plays a built game's bottom menu on a 390x844 phone viewport (touch, DPR 2) and checks that its icons move part
 * by part: they idle, react from the moment a finger lands, play a pick sequence, and rest under Calm. It records a
 * clip of every icon idling, then each tab tapped in turn. Not part of `node --test test/*.test.mjs`: it needs a
 * built game and a browser.
 *
 *   NODE_PATH=<dir with playwright> node test/browser/menu-icons-phone.mjs <dist> <outDir> [--before]
 *
 * The game exposes `window.__menu = { nav, icons }`: the template's BottomNav and the menu-icons TabIconMotion
 * (test/browser/README.md says how to make one). `--before` runs a game whose icons are still one piece: it records
 * the same clip and checks that a still icon draws the same pixels twice, the control for the idle check.
 * CHROME names a Chrome binary when Playwright's own is not installed. Exit 0 = every check passed, 1 = one failed.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const [distArg, outArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const BEFORE = process.argv.includes('--before');
if (!distArg || !outArg) { console.error('usage: node menu-icons-phone.mjs <dist> <outDir> [--before]'); process.exit(2); }
const dist = resolve(distArg), out = resolve(outArg);
mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer((req, res) => {
  const path = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = path.startsWith(dist) && existsSync(path) && statSync(path).isFile() ? path : join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/`;

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`); };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

/** The page, loaded, with each tab's hit centre in CSS pixels. */
async function open(context) {
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => !!window.__menu?.nav, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const centres = await page.evaluate(() => Object.fromEntries(window.__menu.nav.model.snapshot().tabs
    .map((t) => [t.id, { x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height * 0.55, hit: t.hit }])));
  return { page, centres };
}
/** Records each tab's probe every frame from now until `stop`: the largest offset from rest per tab, and what the
 * player said. It starts recording before the input it measures, so a press can never end before it is seen. */
const start = (page) => page.evaluate(() => {
  // selectMs is game time: the sum of frame times, each capped at 100 ms as Pixi's ticker caps the clock the game
  // feeds to icons.update, so a frame the host stalls does not count longer than the game saw it
  const m = window.__menu, ids = m.nav.model.ids, rec = { most: {}, seen: {}, selectMs: 0, on: true };
  for (const id of ids) { rec.most[id] = 0; rec.seen[id] = { tapping: false, selecting: false, idle: 0 }; }
  let last = performance.now();
  const step = () => {
    if (!rec.on) return;
    const now = performance.now(), frame = Math.min(100, now - last);
    last = now;
    for (const id of ids) {
      const p = m.icons.probe(id);
      for (const q of Object.values(p.parts)) {
        const turn = Math.abs(q.rotation) % (2 * Math.PI);
        rec.most[id] = Math.max(rec.most[id], Math.abs(q.x), Math.abs(q.y), Math.min(turn, 2 * Math.PI - turn), Math.abs(q.scaleX - 1), Math.abs(q.scaleY - 1));
      }
      rec.seen[id].tapping ||= p.tapping; rec.seen[id].idle = Math.max(rec.seen[id].idle, p.idle);
      if (p.selecting) { rec.seen[id].selecting = true; rec.selectMs += frame; }
    }
    requestAnimationFrame(step);
  };
  // the press listener runs before any frame, so a press that lands is seen even if frames are slow
  for (const id of ids) m.nav.getChildByLabel(`tab-${id}`).once('pointerdown', () => { if (rec.on) rec.seen[id].tapping ||= m.icons.probe(id).tapping; });
  window.__rec = rec;
  requestAnimationFrame(step);
});
const stop = (page) => page.evaluate(() => {
  const rec = window.__rec; rec.on = false;
  return { most: rec.most, seen: rec.seen, selectMs: rec.selectMs };
});
const sample = async (page, ms) => { await start(page); await page.waitForTimeout(ms); return stop(page); };
const shotOf = (page, c) => page.screenshot({ clip: { x: c.hit.x, y: c.hit.y, width: c.hit.width, height: c.hit.height } });

try {
  // 1. The clip: every icon idling, then each tab tapped in turn.
  const video = await browser.newContext({ ...PHONE, recordVideo: { dir: out, size: { width: 390, height: 844 } } });
  const v = await open(video);
  await v.page.waitForTimeout(2200);
  for (const id of ['shop', 'settings', 'home']) {
    if (!v.centres[id]) continue;
    await v.page.touchscreen.tap(v.centres[id].x, v.centres[id].y);
    await v.page.waitForTimeout(1600);
  }
  await v.page.screenshot({ path: join(out, BEFORE ? 'before.png' : 'after.png') });
  const raw = await v.page.video().path();
  await video.close();
  renameSync(raw, join(out, BEFORE ? 'before.webm' : 'after.webm'));

  // 2. The checks, in a fresh page.
  const context = await browser.newContext(PHONE);
  const { page, centres } = await open(context);
  const home = centres.home;
  const a = await shotOf(page, home);
  await page.waitForTimeout(700);
  const b = await shotOf(page, home);
  if (BEFORE) {
    check('a one-piece icon at rest draws the same pixels 0.7 s apart (the control)', a.equals(b));
  } else {
    check('the selected Home icon draws different pixels 0.7 s apart: it idles', !a.equals(b));
    const idle = await sample(page, 1500);
    check('the selected icon idles part by part at full strength', idle.most.home > 0.02 && idle.seen.home.idle === 1, idle.most.home);
    check('an unselected icon idles at 35 %', Math.abs(idle.seen.shop.idle - 0.35) < 1e-6, idle.seen.shop.idle);
    await page.screenshot({ path: join(out, 'idle.png') });

    // a finger lands on Shop and stays: the press reaction starts before any tap is decided
    const cdp = await context.newCDPSession(page);
    const s = centres.shop;
    await start(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x, y: s.y }] });
    await page.waitForTimeout(160);
    const press = await stop(page);
    await page.screenshot({ path: join(out, 'press.png') });
    check('a press moves the Shop icon\'s parts while the finger is still down', press.seen.shop.tapping && press.most.shop > 0.03, { most: press.most.shop, tapping: press.seen.shop.tapping });
    check('a press alone picks nothing', await page.evaluate(() => window.__menu.nav.active) === 'home');
    await start(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1100);
    const pick = await stop(page);
    check('the tap picks Shop', await page.evaluate(() => window.__menu.nav.active) === 'shop');
    check('the pick plays a part sequence on Shop', pick.seen.shop.selecting && pick.most.shop > 0.2, pick.most.shop);
    check('the pick sequence lasts at most 0.8 s of game time', pick.selectMs > 300 && pick.selectMs <= 820, Math.round(pick.selectMs));

    await page.touchscreen.tap(centres.settings.x, centres.settings.y);
    await page.waitForTimeout(220);
    await page.screenshot({ path: join(out, 'pick.png') });
    await page.waitForTimeout(900);

    await page.evaluate(() => { window.__menu.nav.setReducedMotion(true); window.__menu.icons.setReducedMotion(true); });
    await start(page);
    await page.touchscreen.tap(home.x, home.y);
    await page.waitForTimeout(1200);
    const calm = await stop(page);
    check('Calm keeps every part of every icon at rest, through a tap and a pick',
      Object.values(calm.most).every((m) => m < 1e-9) && !calm.seen.home.selecting, calm.most);
    await page.screenshot({ path: join(out, 'calm.png') });
    await page.evaluate(() => { window.__menu.nav.setReducedMotion(false); window.__menu.icons.setReducedMotion(false); });

    const cost = await page.evaluate(() => {
      const icons = window.__menu.icons, n = 3000, t0 = performance.now();
      for (let i = 0; i < n; i++) icons.update(1 / 60);
      return (performance.now() - t0) / n;
    });
    check('moving every part costs under 0.1 ms per frame', cost < 0.1, `${cost.toFixed(4)} ms`);
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length} checks, ${checks.length - failed} pass, ${failed} fail`);
process.exitCode = failed ? 1 : 0;
