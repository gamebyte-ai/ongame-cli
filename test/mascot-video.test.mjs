/**
 * skills/mascot-video/pack.py on synthetic green-screen clips: a take that moves passes and packs into pages + a
 * clips JSON whose frames line up; a take that stands still, one cut off by the frame edge, one with no green screen
 * and one whose screen darkens mid-take each fail --check; takes of different shapes and an unsafe --name are refused;
 * a re-pack removes only the pages the last pack listed.
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
