/**
 * skills/mascot-video/pack.py on synthetic green-screen clips: a take that moves passes and packs into pages + a
 * clips JSON whose frames line up; a take that stands still, one cut off by the frame edge, one with no green screen
 * and one whose screen darkens mid-take each fail --check; takes of different shapes and an unsafe --name are refused;
 * a re-pack removes only the pages the last pack listed.
 *
 * skills/mascot-video/player.pixi.ts on a stand-in for pixi.js: a cue on a mascot with no programme ends on the idle
 * still, a hold of 0 moves on to the next clip, and a clip whose page fails to download frees the pages that loaded.
 *
 * The pack tests need python3 with numpy + Pillow and ffmpeg; without them they are skipped, not passed.
 * Run: node --test test/mascot-video.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodeModule from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

const PACK = path.resolve(import.meta.dirname, '../skills/mascot-video/pack.py');
const has = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
const ready = has('ffmpeg', ['-version']) && has('python3', ['-c', 'import numpy, PIL']);
const skip = ready ? false : 'needs ffmpeg and python3 with numpy + Pillow';
// Decoding video is heavy; at low priority it does not starve the other test files' timed subprocesses.
const NICE = has('nice', ['-n', '15', 'true']) ? ['nice', '-n', '15'] : [];
const py = (args) => spawnSync(NICE[0] ?? 'python3', [...NICE.slice(1), ...(NICE.length ? ['python3'] : []), ...args], { encoding: 'utf8' });

// A body (disc) and a head on a flat (0,177,64) screen, 48 frames at 24 fps; `motion` picks what moves.
const MAKE = `
import sys, subprocess, numpy as np
out, motion, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
bg = (60, 60, 60) if motion == 'grey' else (0, 177, 64)
yy, xx = np.mgrid[0:h, 0:w]
frames = []
for i in range(48):
    # a forge take holds the idle pose for a moment at both ends: rest 10 frames, act 28, rest 10
    t = np.sin(np.pi * min(max(i - 10, 0), 27) / 27)
    f = np.empty((h, w, 3), np.uint8); f[:] = bg
    if motion == 'drift' and i >= 24:
        f[:] = (0, 88, 32)  # the screen darkens half way: it stops keying out
    cx = w * 0.5 + (w * 0.55 * t if motion == 'cut' else 0)
    hy = h * 0.35 - (h * 0.2 * t if motion in ('jump', 'grey', 'drift') else 0)
    body = (xx - cx) ** 2 + (yy - h * 0.65) ** 2 < (h * 0.18) ** 2
    head = (xx - cx) ** 2 + (yy - hy) ** 2 < (h * 0.1) ** 2
    f[body] = (200, 60, 40); f[head] = (240, 200, 160)
    frames.append(f)
p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', '24',
                    '-i', '-', '-pix_fmt', 'yuv420p', '-crf', '12', out], input=b''.join(x.tobytes() for x in frames))
sys.exit(p.returncode)
`;

const dir = ready ? fs.mkdtempSync(path.join(os.tmpdir(), 'mascot-video-')) : '';
function clip(name, motion, w = 160, h = 160) {
  const out = path.join(dir, `${name}.mp4`);
  if (!fs.existsSync(out)) {
    const r = py(['-c', MAKE, out, motion, String(w), String(h)]);
    assert.equal(r.status, 0, r.stderr);
  }
  return out;
}
const pack = (...args) => py([PACK, ...args]);

test('a take that moves passes --check and writes nothing', { skip }, () => {
  const r = pack('--check', `jump=${clip('jump', 'jump')}`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /jump .* ok$/m);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => !f.endsWith('.mp4')), []);
});

test('a take that stands still fails --check', { skip }, () => {
  const r = pack('--check', `idle=${clip('still', 'still')}`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /stand still/);
});

test('a take cut off by the frame edge fails --check', { skip }, () => {
  const r = pack('--check', `slide=${clip('cut', 'cut')}`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /frame edge/);
});

test('a take with no green screen fails --check', { skip }, () => {
  const r = pack('--check', `jump=${clip('grey', 'grey')}`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /not a flat green screen/);
});

test('a screen that darkens mid-take fails --check, though its first frame is clean', { skip }, () => {
  const r = pack('--check', `jump=${clip('drift', 'drift')}`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /not a flat green screen/);
});

test('a --name that is not a plain file prefix is refused', { skip }, () => {
  const r = pack('--out', path.join(dir, 'never'), '--name', '../hero', `jump=${clip('jump', 'jump')}`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--name/);
  assert.equal(fs.existsSync(path.join(dir, 'never')), false);
});

test('takes of different shapes are refused', { skip }, () => {
  const r = pack('--check', `a=${clip('jump', 'jump')}`, `b=${clip('wide', 'jump', 240, 160)}`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /differ in shape/);
});

test('pack writes the idle still, the pages and a clips JSON that describes them', { skip }, () => {
  const out = path.join(dir, 'pack');
  // an earlier pack had a second clip; its pages go, the game's own files with the same prefix stay
  assert.equal(pack('--out', out, '--name', 'hero', '--height', '100', '--page', '512',
    `jump=${clip('jump', 'jump')}`, `hop=${clip('jump', 'jump')}`).status, 0);
  assert.ok(fs.existsSync(path.join(out, 'hero_hop_0.webp')));
  fs.writeFileSync(path.join(out, 'hero_portrait.webp'), 'not ours');
  const r = pack('--out', out, '--name', 'hero', '--height', '100', '--page', '512', `jump=${clip('jump', 'jump')}`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const meta = JSON.parse(fs.readFileSync(path.join(out, 'hero-clips.json'), 'utf8'));
  assert.equal(meta.fh, 100);
  assert.ok(meta.top < meta.feet && meta.feet < meta.fh && meta.cx > 0 && meta.cx < meta.fw);
  const c = meta.clips.jump;
  // the still lead-in and settle are trimmed, and the action ends inside what is kept
  assert.ok(c.n > 10 && c.n < 48, `kept ${c.n} of 48`);
  assert.ok(c.act > 0 && c.act <= c.n / c.fps);
  assert.equal(c.per, c.cols * Math.floor(512 / meta.fh));
  assert.equal(c.pages, Math.ceil(c.n / c.per));
  const files = fs.readdirSync(out).sort();
  const pages = Array.from({ length: c.pages }, (_, p) => `hero_jump_${p}.webp`);
  assert.deepEqual(files, ['hero-clips.json', ...pages, 'hero_idle.webp', 'hero_portrait.webp'].sort());
});

// The player imports pixi.js, which this repo does not install: it runs against a stand-in with just what it touches.
// Each Assets.load waits until the test resolves or rejects it.
const PIXI_STUB = `
export class Texture { constructor(o = {}) { Object.assign(this, o); } destroy() { this.destroyed = true; } }
export class Rectangle { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }
class Point { set(x, y = x) { this.x = x; this.y = y; } }
export class Container { children = []; destroyed = false; addChild(...c) { this.children.push(...c); } destroy() { this.destroyed = true; } }
export class Sprite extends Container {
  constructor(texture) { super(); this.texture = texture; this.anchor = new Point(); this.scale = new Point(); this.visible = true; this.alpha = 1; }
}
export const Assets = {
  calls: [], unloaded: [],
  load(url) {
    return new Promise((resolve, reject) => Assets.calls.push({ url,
      resolve: () => resolve(new Texture({ source: { url } })), reject: () => reject(new Error('404 ' + url)) }));
  },
  unload(url) { Assets.unloaded.push(url); return Promise.resolve(); },
};
`;
const { stripTypeScriptTypes } = nodeModule; // not a named import: older nodes lack it, and the tests skip
const tsSkip = typeof stripTypeScriptTypes === 'function' ? false : 'needs a node with module.stripTypeScriptTypes';
const playerDir = tsSkip ? '' : fs.mkdtempSync(path.join(os.tmpdir(), 'mascot-player-'));
after(() => { if (playerDir) fs.rmSync(playerDir, { recursive: true, force: true }); });
async function player() {
  const stub = path.join(playerDir, 'pixi.mjs');
  const out = path.join(playerDir, 'player.mjs');
  if (!fs.existsSync(out)) {
    fs.writeFileSync(stub, PIXI_STUB);
    const ts = fs.readFileSync(path.resolve(import.meta.dirname, '../skills/mascot-video/player.pixi.ts'), 'utf8');
    const js = stripTypeScriptTypes(ts, { mode: 'transform' }).replace("from 'pixi.js'", `from '${pathToFileURL(stub)}'`);
    assert.ok(js.includes(pathToFileURL(stub).href), 'the player no longer imports pixi.js the way this test expects');
    fs.writeFileSync(out, js);
  }
  const [{ Mascot, MascotClips }, PIXI] = await Promise.all([import(pathToFileURL(out)), import(pathToFileURL(stub))]);
  PIXI.Assets.calls.length = 0; PIXI.Assets.unloaded.length = 0;
  return { Mascot, MascotClips, PIXI };
}
// jump: 4 frames at 20 fps on one page (0.2 s); wave: 8 frames on two pages.
const META = { name: 'hero', fw: 10, fh: 10, top: 0, feet: 10, cx: 5, idle: 'idle', clips: {
  jump: { n: 4, fps: 20, act: 0.1, cols: 2, per: 4, pages: 1 }, wave: { n: 8, fps: 20, act: 0.3, cols: 2, per: 4, pages: 2 } } };
const settle = () => new Promise((resolve) => setImmediate(resolve));
const showing = (m) => m.children[1].visible; // the clip's sprite, above the idle still
function playOut(m) { // run the clip on screen to its end
  for (let i = 0; showing(m); i++) { assert.ok(i < 100, 'the clip never ended'); m.update(0.05); }
}

test('a cue on a mascot with no programme plays, then holds the idle still for good', { skip: tsSkip }, async () => {
  const { Mascot, MascotClips, PIXI } = await player();
  const m = new Mascot(new MascotClips(META, 'a/'), 100, new PIXI.Texture(), []);
  m.cue('jump', 0.5);
  PIXI.Assets.calls[0].resolve(); await settle();
  assert.ok(showing(m));
  playOut(m);
  for (let i = 0; i < 40; i++) m.update(0.05); // 2 s, well past the 0.5 s hold
  await settle();
  assert.equal(showing(m), false);
  assert.equal(PIXI.Assets.calls.length, 1);
});

test('a hold of 0, in the programme or on a cue, moves straight on to the next clip', { skip: tsSkip }, async () => {
  const { Mascot, MascotClips, PIXI } = await player();
  const m = new Mascot(new MascotClips(META, 'a/'), 100, new PIXI.Texture(), [{ clip: 'jump', hold: 0 }]);
  PIXI.Assets.calls[0].resolve(); await settle();
  playOut(m);
  m.update(0.05); await settle();
  assert.ok(showing(m), 'the programme stopped after a hold of 0');

  const n = new Mascot(new MascotClips(META, 'b/'), 100, new PIXI.Texture(), [{ clip: 'jump', hold: 60 }]);
  PIXI.Assets.calls[1].resolve(); await settle();
  playOut(n);
  n.cue('jump', 0); await settle();
  playOut(n);
  n.update(0.05); await settle();
  assert.ok(showing(n), 'the programme stopped after cue(clip, 0)');
});

test('a failed download with a hold of 0 waits a second before it tries again', { skip: tsSkip }, async () => {
  const { Mascot, MascotClips, PIXI } = await player();
  const m = new Mascot(new MascotClips(META, 'a/'), 100, new PIXI.Texture(), [{ clip: 'jump', hold: 0 }]);
  PIXI.Assets.calls[0].reject(); await settle();
  for (let i = 0; i < 10; i++) m.update(0.05);
  assert.equal(PIXI.Assets.calls.length, 1, 'retried at once');
  for (let i = 0; i < 12; i++) m.update(0.05);
  assert.equal(PIXI.Assets.calls.length, 2, 'never tried again');
});

test('a clip whose page fails frees the pages that loaded, early or late, but not a newer load of it', { skip: tsSkip }, async () => {
  const { MascotClips, PIXI } = await player();
  const { calls, unloaded } = PIXI.Assets;
  const clips = new MascotClips(META, 'a/');
  let job = clips.load('wave');
  calls[0].resolve(); calls[1].reject();
  await assert.rejects(job, /404 a\/hero_wave_1/);
  assert.deepEqual(unloaded, ['a/hero_wave_0.webp']);

  unloaded.length = 0;
  job = clips.load('wave');
  calls[3].reject(); await settle(); calls[2].resolve(); // the page that loads lands after the failure
  await assert.rejects(job);
  assert.deepEqual(unloaded, ['a/hero_wave_0.webp']);

  unloaded.length = 0;
  const old = clips.load('wave');
  void clips.load('jump').catch(() => undefined); // supersedes it
  const newer = clips.load('wave');
  calls[4].resolve(); calls[5].reject();
  await assert.rejects(old);
  assert.deepEqual(unloaded, [], 'freed pages the newer load of the clip shares');
  calls[7].resolve(); calls[8].resolve();
  assert.equal((await newer).length, 8);
});
