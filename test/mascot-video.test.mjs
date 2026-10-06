/**
 * skills/mascot-video/pack.py on synthetic green-screen clips: a take that moves passes and packs into pages + a
 * clips JSON whose frames line up; a take that stands still, one cut off by the frame edge and one with no green
 * screen each fail --check; takes of different shapes are refused before anything is decoded.
 *
 * Needs python3 with numpy + Pillow and ffmpeg; without them the tests are skipped, not passed.
 * Run: node --test test/mascot-video.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const PACK = path.resolve(import.meta.dirname, '../skills/mascot-video/pack.py');
const has = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
const ready = has('ffmpeg', ['-version']) && has('python3', ['-c', 'import numpy, PIL']);
const skip = ready ? false : 'needs ffmpeg and python3 with numpy + Pillow';

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
    cx = w * 0.5 + (w * 0.55 * t if motion == 'cut' else 0)
    hy = h * 0.35 - (h * 0.2 * t if motion in ('jump', 'grey') else 0)
    body = (xx - cx) ** 2 + (yy - h * 0.65) ** 2 < (h * 0.18) ** 2
    head = (xx - cx) ** 2 + (yy - hy) ** 2 < (h * 0.1) ** 2
    f[body] = (200, 60, 40); f[head] = (240, 200, 160)
    frames.append(f)
p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', '24',
                    '-i', '-', '-pix_fmt', 'yuv420p', '-crf', '12', out], input=b''.join(x.tobytes() for x in frames))
sys.exit(p.returncode)
`;

const dir = ready ? fs.mkdtempSync(path.join(os.tmpdir(), 'mascot-video-')) : '';
function clip(name, motion, w = 320, h = 320) {
  const out = path.join(dir, `${name}.mp4`);
  if (!fs.existsSync(out)) {
    const r = spawnSync('python3', ['-c', MAKE, out, motion, String(w), String(h)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
  return out;
}
const pack = (...args) => spawnSync('python3', [PACK, ...args], { encoding: 'utf8' });

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

test('takes of different shapes are refused', { skip }, () => {
  const r = pack('--check', `a=${clip('jump', 'jump')}`, `b=${clip('wide', 'jump', 480, 320)}`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /differ in shape/);
});

test('pack writes the idle still, the pages and a clips JSON that describes them', { skip }, () => {
  const out = path.join(dir, 'pack');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'hero_gone_0.webp'), 'a page of a clip that is no longer packed');
  const r = pack('--out', out, '--name', 'hero', '--height', '200', '--page', '1024', `jump=${clip('jump', 'jump')}`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const meta = JSON.parse(fs.readFileSync(path.join(out, 'hero-clips.json'), 'utf8'));
  assert.equal(meta.fh, 200);
  assert.ok(meta.top < meta.feet && meta.feet < meta.fh && meta.cx > 0 && meta.cx < meta.fw);
  const c = meta.clips.jump;
  // the still lead-in and settle are trimmed, and the action ends inside what is kept
  assert.ok(c.n > 10 && c.n < 48, `kept ${c.n} of 48`);
  assert.ok(c.act > 0 && c.act <= c.n / c.fps);
  assert.equal(c.per, c.cols * Math.floor(1024 / meta.fh));
  assert.equal(c.pages, Math.ceil(c.n / c.per));
  const files = fs.readdirSync(out).sort();
  const pages = Array.from({ length: c.pages }, (_, p) => `hero_jump_${p}.webp`);
  assert.deepEqual(files, ['hero-clips.json', ...pages, 'hero_idle.webp'].sort());
});
