// Behaviour of the shipped-lessons check scripts on small fixtures: store text, mobile lifecycle, chroma key.
// Exit contract for all three: 0 pass, 1 finding, 2 usage error or nothing readable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, linkSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const run = (script, args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });
const scratch = () => mkdtempSync(join(tmpdir(), 'check-scripts-'));
const CHECK_TEXT = 'skills/store-submit/check-text.mjs';
const MOBILE = 'skills/mobile-ready/check.mjs';
const CHROMA = 'skills/forge-assets/chroma-key.mjs';

// Minimal PNG encoder: one IDAT, filter 0 on every row.
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
};
// pixel(x, y) returns `ch` bytes; colourType 2 = RGB, 6 = RGBA.
function png(w, h, colourType, pixel, extra = []) {
  const ch = { 2: 3, 6: 4 }[colourType];
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colourType;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Buffer.from(pixel(x, y)).copy(raw, y * (w * ch + 1) + 1 + x * ch);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...extra,
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// A 20x20 sprite: magenta plate with a 10x10 green square in the middle.
const plate = () => png(20, 20, 2, (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 15 ? [40, 180, 60] : [255, 0, 255]));

// check-text

test('check-text fails "no data is collected" when an SDK is linked only in android/app/build.gradle', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'store'));
  mkdirSync(join(dir, 'android', 'app'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@capacitor/core': '7.0.0' } }));
  writeFileSync(join(dir, 'android', 'app', 'build.gradle'),
    "dependencies {\n    implementation 'com.google.android.gms:play-services-ads:23.0.0'\n}\n");
  writeFileSync(join(dir, 'store', 'review-notes.txt'), 'No data is collected.\n');
  const res = run(CHECK_TEXT, [dir]);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /AdMob \(android\/app\/build\.gradle\)/);
});

test('check-text ignores an SDK named only in a commented-out native line', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'store'));
  mkdirSync(join(dir, 'android', 'app'), { recursive: true });
  writeFileSync(join(dir, 'android', 'app', 'build.gradle'), "// implementation 'com.google.firebase:firebase-analytics'\n");
  writeFileSync(join(dir, 'store', 'review-notes.txt'), 'No data is collected.\n');
  assert.equal(run(CHECK_TEXT, [dir]).status, 0);
});

test('check-text exits 2 on an empty store folder: nothing readable is not a pass', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'store'));
  const res = run(CHECK_TEXT, [dir]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /nothing readable: no store text under .*store/);
});

test('check-text passes a level count with a WARN', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'store'));
  writeFileSync(join(dir, 'store', 'listing.md'), 'Relax with 48 levels across 4 worlds.\n');
  const res = run(CHECK_TEXT, [dir]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /^WARN level-count /m);
  assert.doesNotMatch(res.stdout, /^FAIL/m);
});

test('check-text exits 2 on a malformed package.json instead of skipping the SDK evidence', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'store'));
  writeFileSync(join(dir, 'store', 'listing.md'), 'A calm puzzle.\n');
  writeFileSync(join(dir, 'package.json'), '{ not json');
  const res = run(CHECK_TEXT, [dir]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /cannot parse package\.json/);
});

// mobile-ready

const mobileGame = (mainTs) => {
  const dir = scratch();
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'index.html'),
    '<meta name="viewport" content="width=device-width, viewport-fit=cover">\n' +
    '<style>body{padding-top:var(--safe-area-inset-top, env(safe-area-inset-top))}</style>\n');
  writeFileSync(join(dir, 'src', 'main.ts'), mainTs);
  return run(MOBILE, [dir]);
};

test('mobile-ready does not pass lifecycle when visibilitychange appears only in a comment', () => {
  const res = mobileGame("// TODO: listen to visibilitychange and pause\nconsole.log('boot');\n");
  assert.match(res.stdout, /^(FAIL|WARN)\s+lifecycle\b/m);
  assert.equal(res.status, 1, 'a comment is not a listener: the lifecycle FAIL stays');
});

test('mobile-ready warns on a lifecycle reference without a listener', () => {
  const res = mobileGame("console.log('state', document.visibilityState);\n");
  assert.equal(res.status, 0, res.stdout);
  assert.match(res.stdout, /^WARN\s+lifecycle\s+Lifecycle reference without a listener/m);
});

test('mobile-ready passes lifecycle with a real visibilitychange listener', () => {
  const res = mobileGame("document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });\n");
  assert.equal(res.status, 0, res.stdout);
  assert.doesNotMatch(res.stdout, /lifecycle/);
});

// chroma-key

test('chroma-key refuses a hard link to the input as output and leaves the input unchanged', () => {
  const dir = scratch();
  const inPath = join(dir, 'in.png'), linkPath = join(dir, 'out.png');
  writeFileSync(inPath, plate());
  linkSync(inPath, linkPath);
  const before = readFileSync(inPath);
  const res = run(CHROMA, ['key', inPath, linkPath]);
  assert.equal(res.status, 2, res.stdout + res.stderr);
  assert.match(res.stderr, /same file/);
  assert.ok(readFileSync(inPath).equals(before));
});

test('chroma-key check counts RGB tRNS pixels as transparent', () => {
  const dir = scratch();
  const trns = Buffer.from([0, 255, 0, 0, 0, 255]); // 16-bit samples: (255, 0, 255)
  const file = join(dir, 'trns.png');
  writeFileSync(file, png(20, 20, 2, (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 15 ? [40, 180, 60] : [255, 0, 255]), [chunk('tRNS', trns)]));
  const res = run(CHROMA, ['check', file]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const stats = JSON.parse(res.stdout.split('\n')[0]);
  assert.equal(stats.transparentPct, 75);
  assert.equal(stats.borderTransparentPct, 100);
});

for (const [label, opts] of [
  ['--hi abc', ['--hi', 'abc']],
  ['--lo 80 --hi 20', ['--lo', '80', '--hi', '20']],
  ['an unknown flag', ['--tolerance', '5']],
  ['a flag with no value', ['--spill']],
  ['an out-of-range value', ['--hi', '300']],
]) {
  test(`chroma-key key exits 2 with usage on ${label}`, () => {
    const dir = scratch();
    writeFileSync(join(dir, 'in.png'), plate());
    const res = run(CHROMA, ['key', join(dir, 'in.png'), join(dir, 'out.png'), ...opts]);
    assert.equal(res.status, 2, res.stdout + res.stderr);
    assert.match(res.stderr, /usage:/);
    assert.ok(!existsSync(join(dir, 'out.png')));
  });
}

test('chroma-key keys a magenta plate, writes the output and leaves the input untouched', () => {
  const dir = scratch();
  const inPath = join(dir, 'in.png'), outPath = join(dir, 'out.png');
  writeFileSync(inPath, plate());
  const before = readFileSync(inPath);
  const res = run(CHROMA, ['key', inPath, outPath]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.ok(readFileSync(inPath).equals(before));
  assert.deepEqual(readdirSync(dir).sort(), ['in.png', 'out.png'], 'no temp file left beside the output');
  const check = run(CHROMA, ['check', outPath]);
  assert.equal(check.status, 0, check.stdout);
  assert.equal(JSON.parse(check.stdout.split('\n')[0]).transparentPct, 75);
});
