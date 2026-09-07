#!/usr/bin/env node
/**
 * The measurement contract, on fixtures this file paints itself. No external corpus, no network.
 *
 * Every case below is a failure that actually happened while measuring three real reference packages.
 * The numbers in the comments are from that lab run, so a future reader can tell a designed test from
 * a remembered one.
 *
 *   node test/measurement.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import * as M from '../tools/measure/measure.mjs';
import { writePng } from '../tools/measure/overlay.mjs';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-test-'));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

/** Paint a fixture. `painter(x, y)` returns [r,g,b]. */
function mk(name, w, h, painter) {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = painter(x, y), q = (y * w + x) * 3;
    rgb[q] = c[0]; rgb[q + 1] = c[1]; rgb[q + 2] = c[2];
  }
  return writePng(path.join(DIR, name), w, h, rgb);
}

const BG = [10, 12, 30], SLOT = [124, 72, 50], BAR = [60, 40, 28], WOOD = [212, 155, 92], FILL = [196, 6, 2];

// FIVE identical slots (width 30, pitch 80) on a bar, PLUS irregular decorative patches in the gaps.
// The proportions are chosen to reproduce the lab's trap rather than to be easy: the decor covers MORE
// of the band than the slots do (186 px vs 150), so keying the decor scores the HIGHER match_fraction
// while returning five runs of wildly different widths.
const DECOR = [[30, 79], [110, 134], [190, 207], [270, 314], [350, 397]];   // widths 50,25,18,45,48
const TRAY = mk('tray.png', 400, 200, (x, y) => {
  if (y < 60 || y > 140) return BG;
  if (y >= 60 && y <= 100) {
    const i = Math.floor(x / 80), off = x % 80;
    if (off < 30 && i < 5) return SLOT;
    for (const [a, b] of DECOR) if (x >= a && x <= b) return WOOD;
  }
  return BAR;
});

// a clean repeat, with no decorative noise: this case is about the period, not about robustness
const PLAIN = mk('plain.png', 400, 200, (x, y) => {
  if (y < 60 || y > 140) return BG;
  return (x % 80) < 30 ? SLOT : BAR;
});

/* ── 1 + 3. A wrong keying rule can look MORE confident than the right one ────────────────────────
   Lab: keying the wrong colour scored match_fraction 0.615 against the right key's 0.373, and
   returned six clean runs. match_fraction pointed the wrong way; width_cv was what separated them. */
const right = M.runs(TRAY, { band: [0.30, 0.50], key: SLOT, base: 'W' });
const wrong = M.runs(TRAY, { band: [0.30, 0.50], key: WOOD, keyTol: 22, base: 'W' });
check('the right keying rule measures 5 identical slots',
  right.validity === M.VALID && right.n === 5 && right.regularity.width_cv === 0,
  `n=${right.n} width_cv=${right.regularity?.width_cv}`);
check('a wrong keying rule is NOT separated by match_fraction alone',
  wrong.validity === M.VALID ? wrong.match_fraction >= right.match_fraction : true,
  `wrong mf=${wrong.match_fraction} vs right mf=${right.match_fraction} (this is the trap, not a bug)`);
check('regularity DOES separate it: the wrong key is irregular',
  wrong.validity !== M.VALID ||
  ((wrong.regularity?.width_cv ?? null) !== null && wrong.regularity.width_cv > 0.05 &&
   (right.regularity?.width_cv ?? null) !== null && right.regularity.width_cv < 0.02),
  `wrong width_cv=${wrong.regularity?.width_cv} (right=${right.regularity?.width_cv})`);

/* ── 2. A key that describes the ground, not the object, must not return a number ─────────────────
   Lab: the stitching canvas wood was the same wood as the page behind it, so the keyed region grew
   edge to edge (fill 1.0/1.0, border 0.568) and produced a clean, wrong rectangle. */
const GROUND = mk('ground.png', 300, 200, () => BAR);
const flood = M.runs(GROUND, { band: [0.30, 0.50], key: BAR, base: 'W' });
check('a non-selective key is INVALID_SELECTION, not a measurement',
  flood.validity === M.INVALID_SELECTION,
  `${flood.validity} sel=${JSON.stringify(flood.selectivity)}`);
check('the record says WHY it was rejected', /not selective/.test(flood.note || ''), flood.note);

/* ── 4. The normalization base is declared, never inferred from the axis ──────────────────────────
   Lab: a y-axis pitch divided by H when the claim was a fraction of W made a correct 73 px reading
   look like a 2x package error. Twice. */
const noBase = M.runs(TRAY, { band: [0.30, 0.50], key: SLOT });
check('a missing base is refused rather than guessed',
  noBase.validity === M.INVALID_SELECTION && /base must be declared/.test(noBase.note || ''), noBase.note);
const asW = M.runs(TRAY, { band: [0.30, 0.50], key: SLOT, base: 'W' });
const asH = M.runs(TRAY, { band: [0.30, 0.50], key: SLOT, base: 'H' });
check('the SAME pixels normalize differently under W and H, and each says which',
  asW.validity === M.VALID && asH.validity === M.VALID &&
  asW.normalized.width_mean !== asH.normalized.width_mean && asW.base_name === 'W' && asH.base_name === 'H',
  `W:${asW.normalized?.width_mean} H:${asH.normalized?.width_mean}`);

/* ── 5. A lossy source may not present itself as exact ────────────────────────────────────────────
   Lab: the same flat region measured std 2.6 on PNG and 0.9 on the JPEG frame while the median moved
   5 per channel. Compression LOWERS the variance and RAISES the error, so low std is not confidence. */
const FLAT = mk('flat.png', 120, 120, () => FILL);
const cPng = M.colour(FLAT, { rect: [0.2, 0.8, 0.2, 0.8] });
check('a lossless flat fill is exact-claimable with a 1-per-channel tolerance',
  cPng.exactness === 'EXACT_CLAIMABLE' && cPng.tolerance === 1 && cPng.kind === 'SOLID',
  `${cPng.hex} kind=${cPng.kind} tol=${cPng.tolerance}`);
let jpg = null;
for (const [bin, args] of [['sips', ['-s', 'format', 'jpeg', FLAT, '--out', path.join(DIR, 'flat.jpg')]],
                           ['ffmpeg', ['-loglevel', 'error', '-y', '-i', FLAT, path.join(DIR, 'flat.jpg')]]]) {
  try { execFileSync(bin, args, { stdio: 'ignore' }); if (fs.existsSync(path.join(DIR, 'flat.jpg'))) { jpg = path.join(DIR, 'flat.jpg'); break; } } catch { /* next */ }
}
if (jpg) {
  const cJpg = M.colour(jpg, { rect: [0.2, 0.8, 0.2, 0.8] });
  check('a LOSSY source is never exact-claimable, however low its variance',
    cJpg.validity === M.VALID && cJpg.exactness === 'FAMILY_ONLY' && cJpg.tolerance === 10,
    `${cJpg.hex} exactness=${cJpg.exactness} tol=${cJpg.tolerance} std=${JSON.stringify(cJpg.dispersion.std)}`);
  check('and its source record marks itself lossy',
    M.source(jpg).source.lossless === false && /FAMILY/.test(M.source(jpg).claimable));
}
// A review caught this branch testing the wrong thing: it used to point at a nonexistent .jpg, so it
// asserted missing-file handling and would have passed with no transcode path at all. This file has
// real JPEG magic and garbage after it, so the codec IS recognised and the transcode is what fails.
{
  const bad = path.join(DIR, 'broken.jpg');
  fs.writeFileSync(bad, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x41)]));
  const r = M.colour(bad, { rect: [0.2, 0.8, 0.2, 0.8] });
  check('lossy evidence that cannot be decoded is UNSUPPORTED_EVIDENCE, and says it was the transcode',
    r.validity === M.UNSUPPORTED_EVIDENCE && !/does not exist/.test(r.note || ''),
    `${r.validity}: ${(r.note || '').slice(0, 90)}`);
}

/* ── 5b. A transcode must not launder the source's quality ────────────────────────────────────────
   Decoding a JPEG through PNG bytes internally does not make it lossless. `source` describes the
   ORIGINAL evidence and every tolerance derives from it; `decode` records how the bytes were got. */
if (jpg) {
  const r = M.colour(jpg, { rect: [0.2, 0.8, 0.2, 0.8] });
  check('the ORIGINAL codec survives an internal transcode',
    r.source.codec === 'JPEG' && r.source.lossless === false && r.tolerance === 10,
    `source=${JSON.stringify(r.source)}`);
  check('and the transcode is recorded separately, not hidden',
    r.decode?.transcoded === true && /transcoded/.test(r.decode.path || ''), JSON.stringify(r.decode));
  const png = M.colour(FLAT, { rect: [0.2, 0.8, 0.2, 0.8] });
  check('a native PNG says so and is not marked transcoded',
    png.decode?.transcoded === false && png.source.lossless === true, JSON.stringify(png.decode));
}

/* ── 6. A key that selects nothing is not a measurement ───────────────────────────────────────── */
const nothing = M.colour(TRAY, { rect: [0.05, 0.15, 0.05, 0.15], key: [1, 254, 1] });
check('a key that matches nothing is INVALID_SELECTION, not VALID',
  nothing.validity === M.INVALID_SELECTION && nothing.value === null, `${nothing.validity} mf=${nothing.match_fraction}`);
const nothingRuns = M.runs(TRAY, { band: [0.05, 0.15], key: [1, 254, 1], base: 'W' });
check('the same holds for runs', nothingRuns.validity === M.INVALID_SELECTION, nothingRuns.note);

/* ── 7. A narrow plateau must be visible in the record ────────────────────────────────────────────
   Lab: the msort bottle row was stable over 0.12 H of band offset; the yarn holder row over 0.005.
   Same primitive, different trustworthiness — and only the record can say which. */
const THIN = mk('thin.png', 400, 400, (x, y) => {
  if (y >= 200 && y <= 206) { const i = Math.floor(x / 80); return (x % 80) < 30 && i < 5 ? SLOT : BG; }
  return BG;
});
const thin = M.runs(THIN, { band: [0.50, 0.515], key: SLOT, base: 'W' });
const wide = M.runs(TRAY, { band: [0.30, 0.50], key: SLOT, base: 'W' });
check('a thin feature reports a narrow plateau', thin.validity !== M.VALID || thin.plateau.width <= 0.02,
  `thin=${JSON.stringify(thin.plateau)}`);
check('a tall feature reports a wide one, so the two are distinguishable',
  wide.plateau.width > (thin.plateau?.width ?? 0), `wide=${JSON.stringify(wide.plateau)}`);

/* ── 8. Provenance must be enough to re-run the measurement ──────────────────────────────────── */
const rec = M.runs(TRAY, { band: [0.30, 0.50], key: SLOT, base: 'W' });
const pv = rec.provenance;
const again = M.runs(pv.file_path, { band: pv.region, key: pv.key, keyTol: pv.key_tol, base: pv.base, axis: pv.axis || 'x' });
check('re-running from the provenance record alone reproduces the value',
  JSON.stringify(again.normalized) === JSON.stringify(rec.normalized) && again.validity === rec.validity,
  `${JSON.stringify(rec.normalized.width_mean)} vs ${JSON.stringify(again.normalized.width_mean)}`);
check('provenance carries the tool version', pv.tool_version === M.TOOL_VERSION, pv.tool_version);

/* ── determinism, and the vocabulary itself ──────────────────────────────────────────────────── */
const a1 = M.runs(TRAY, { band: [0.30, 0.50], key: SLOT, base: 'W' });
const a2 = M.runs(TRAY, { band: [0.30, 0.50], key: SLOT, base: 'W' });
const strip = (r) => JSON.stringify(r, (k, v) => (k === 'file_path' ? undefined : v));
check('the same input yields a byte-identical record', strip(a1) === strip(a2));
const all = [right, wrong, flood, cPng, nothing, thin, rec, M.source(TRAY),
             M.pitch(PLAIN, { rect: [0.0, 1.0, 0.30, 0.50], axis: 'x', base: 'W', expect: [0.15, 0.25] }),
             M.countFills(TRAY, { rect: [0.0, 1.0, 0.30, 0.50] })];
check('no primitive ever returns FAIL — judging a claim is not this layer\'s job',
  all.every((r) => [M.VALID, M.UNRESOLVED, M.INVALID_SELECTION, M.UNSUPPORTED_EVIDENCE].includes(r.validity)),
  [...new Set(all.map((r) => r.validity))].join(','));
check('every record carries source, tolerance and provenance',
  all.every((r) => r.provenance && r.provenance.tool_version && (r.validity !== M.VALID || (r.source && r.tolerance !== undefined))));

/* ── the measurable half of the contract that is easy to get wrong ───────────────────────────── */
const pit = M.pitch(PLAIN, { rect: [0.0, 1.0, 0.30, 0.50], axis: 'x', base: 'W', expect: [0.15, 0.25] });
check('pitch finds the FUNDAMENTAL (80 px pitch) on a plain repeat',
  pit.validity === M.VALID && Math.abs(pit.value - 80) <= 2, `pitch=${pit.value} ac=${pit.dispersion?.ac_strength}`);

/* A repeat with a FAINT mid-line, so the strongest early autocorrelation peak sits at HALF the true
   pitch. Lab: this is how a real 73 px liquid pitch came back as 36 and looked like a 2x package
   error. The fundamental only wins if harmonics are scored. */
const HARM = mk('harmonic.png', 480, 200, (x, y) => {
  if (y < 60 || y > 140) return BG;
  const off = x % 60;
  if (off < 3) return [250, 250, 250];        // strong boundary every 60
  if (off >= 30 && off < 33) return [150, 150, 150];   // faint boundary every 30
  return [40, 44, 60];
});
const harm = M.pitch(HARM, { rect: [0.0, 1.0, 0.30, 0.70], axis: 'x', base: 'W', expect: [0.05, 0.15] });
check('pitch resists the SUB-HARMONIC: 60 px, not 30',
  harm.validity === M.VALID && Math.abs(harm.value - 60) <= 2,
  `pitch=${harm.value} (true 60, sub-harmonic 30) ac=${harm.dispersion?.ac_strength}`);
/* A region carries repeats at more than one scale. Lab: asked for the pitch of four settings buttons,
   autocorrelation answered 4 px at a respectable strength — a real texture, the wrong question. With
   the expected band it answers 142 px (the package says 142). Without it, it must refuse. */
// Two UNRELATED repeats in the same rows: a 30 px texture and a 70 px block edge. 30 and 70 share no
// factor, so neither can be dismissed as a harmonic of the other.
const TWO = mk('twoscale.png', 420, 200, (x, y) => {
  if (y < 60 || y > 140) return BG;
  if ((x % 70) < 6) return [250, 250, 250];
  if ((x % 30) < 4) return [170, 170, 170];
  return [40, 44, 60];
});
const ambiguous = M.pitch(TWO, { rect: [0.0, 1.0, 0.30, 0.70], axis: 'x', base: 'W' });
check('two unrelated scales in one region are refused, not chosen between',
  ambiguous.validity === M.UNRESOLVED && /expect/.test(ambiguous.note || ''),
  `${ambiguous.validity}: ${(ambiguous.note || '').slice(0, 90)}`);
const picked = M.pitch(TWO, { rect: [0.0, 1.0, 0.30, 0.70], axis: 'x', base: 'W', expect: [0.14, 0.20] });
check('...and answered once the caller says which scale it means',
  picked.validity === M.VALID && Math.abs(picked.value - 70) <= 3, `pitch=${picked.value}`);
/* Strength is REPORTED, not thresholded here: a floor was tried at 0.35 and rejected a correct 26 px
   grid pitch. Whether a weak repeat may be called MEASURED belongs to the layer above, so every pitch
   record has to carry its own strength for that decision to be possible. */
const NOISY = mk('noisy.png', 400, 200, (x, y) => {
  if (y < 60 || y > 140) return BG;
  const n = ((x * 2654435761 + y * 40503) >>> 0) % 70;
  return [30 + n, 34 + n, 50 + n];
});
const weak = M.pitch(NOISY, { rect: [0.0, 1.0, 0.30, 0.50], axis: 'x', base: 'W', expect: [0.11, 0.14] });
check('a pitch record always carries the strength the layer above must judge',
  weak.validity !== M.VALID || typeof weak.dispersion?.ac_strength === 'number',
  `${weak.validity} ac=${weak.dispersion?.ac_strength}`);

const outOfBand = M.pitch(PLAIN, { rect: [0.0, 1.0, 0.30, 0.50], axis: 'x', base: 'W', expect: [0.60, 0.90] });
check('an expected band with nothing in it is UNRESOLVED and lists what was there',
  outOfBand.validity === M.UNRESOLVED && /candidates were/.test(outOfBand.note || ''), outOfBand.note);

const tiny = M.colour(TRAY, { rect: [0.5, 0.502, 0.5, 0.502] });
check('a region too small to median is UNRESOLVED, not a lucky pixel',
  tiny.validity === M.UNRESOLVED, `${tiny.validity} ${tiny.note ?? ''}`);
const missing = M.runs(path.join(DIR, 'does-not-exist.png'), { band: [0.3, 0.5], base: 'W' });
check('a missing evidence file is UNSUPPORTED_EVIDENCE with the path named',
  missing.validity === M.UNSUPPORTED_EVIDENCE && /does-not-exist/.test(missing.note || ''), missing.note);

/* ── the decoder's own surface: it reads EXTERNALLY acquired material ──────────────────────────────
   A code review pointed out that every fixture above is written by `writePng`, which only emits
   RGB8/filter-0. So the decoder's riskiest paths — the four filters, 16-bit, palette, and every
   malformed shape — could all regress while this file stayed green. These build the bytes by hand. */
const crc32 = (buf) => { let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; }
  return ~c >>> 0; };
function png(chunks) {
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
  for (const [type, data] of chunks) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    parts.push(len, body, crc);
  }
  return Buffer.concat(parts);
}
const ihdr = (w, h, depth, ctype) => { const b = Buffer.alloc(13);
  b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b[8] = depth; b[9] = ctype; return b; };
const put = (name, buf) => { const f = path.join(DIR, name); fs.writeFileSync(f, buf); return f; };

// every filter type, one per row, over a known 4x4 RGB8 image whose true colour is (10,20,30)
{
  const w = 8, h = 8, stride = w * 3;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const ft = y % 5;
    const raw = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) { raw[x * 3] = 10; raw[x * 3 + 1] = 20; raw[x * 3 + 2] = 30; }
    const line = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? raw[i - 3] : 0, b = ft === 0 ? 0 : raw[i], c = i >= 3 ? raw[i - 3] : 0;
      if (ft === 0) line[i] = raw[i];
      else if (ft === 1) line[i] = (raw[i] - a) & 255;
      else if (ft === 2) line[i] = (raw[i] - b) & 255;             // Up: previous row is identical
      else if (ft === 3) line[i] = (raw[i] - ((a + b) >> 1)) & 255;
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
             line[i] = (raw[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    rows.push(Buffer.concat([Buffer.from([ft]), line]));
  }
  const f = put('filters.png', png([['IHDR', ihdr(w, h, 8, 2)], ['IDAT', zlib.deflateSync(Buffer.concat(rows))], ['IEND', Buffer.alloc(0)]]));
  const r = M.colour(f, { rect: [0.1, 0.9, 0.25, 0.95] });
  check('all four PNG filters unfilter to the same known colour',
    r.validity === M.VALID && r.value[0] === 10 && r.value[1] === 20 && r.value[2] === 30,
    `${r.validity} ${r.hex ?? ''}`);
}
// 16-bit RGB: the decoder takes the high byte
{
  const w = 8, h = 8, stride = w * 6;
  const rows = [];
  for (let y = 0; y < h; y++) { const line = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) { line.writeUInt16BE(0x2211, x * 6); line.writeUInt16BE(0x4433, x * 6 + 2); line.writeUInt16BE(0x6655, x * 6 + 4); }
    rows.push(Buffer.concat([Buffer.from([0]), line])); }
  const f = put('sixteen.png', png([['IHDR', ihdr(w, h, 16, 2)], ['IDAT', zlib.deflateSync(Buffer.concat(rows))], ['IEND', Buffer.alloc(0)]]));
  const r = M.colour(f, { rect: [0.0, 1.0, 0.0, 1.0] });
  check('16-bit RGB decodes to the high byte of each channel',
    r.validity === M.VALID && r.value[0] === 0x22 && r.value[1] === 0x44 && r.value[2] === 0x66, `${r.validity} ${r.hex ?? ''}`);
}
// indexed colour, and the two ways it can be malformed
{
  const w = 8, h = 8;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w, 1)]);
  const idat = Buffer.concat(Array.from({ length: h }, () => row));
  const plte = Buffer.from([0, 0, 0, 90, 100, 110]);
  const ok = put('indexed.png', png([['IHDR', ihdr(w, h, 8, 3)], ['PLTE', plte], ['IDAT', zlib.deflateSync(idat)], ['IEND', Buffer.alloc(0)]]));
  const r = M.colour(ok, { rect: [0.0, 1.0, 0.0, 1.0] });
  check('an indexed PNG decodes through its palette',
    r.validity === M.VALID && r.value[0] === 90 && r.value[2] === 110, `${r.validity} ${r.hex ?? ''}`);
  const noPlte = put('nopalette.png', png([['IHDR', ihdr(w, h, 8, 3)], ['IDAT', zlib.deflateSync(idat)], ['IEND', Buffer.alloc(0)]]));
  const r2 = M.colour(noPlte, { rect: [0.0, 1.0, 0.0, 1.0] });
  check('an indexed PNG with NO palette is refused, not crashed or read as black',
    r2.validity === M.UNSUPPORTED_EVIDENCE && /palette|PLTE/i.test(r2.note || ''), `${r2.validity} ${r2.note ?? ''}`);
  const shortPlte = put('shortpalette.png', png([['IHDR', ihdr(w, h, 8, 3)], ['PLTE', Buffer.from([0, 0, 0])], ['IDAT', zlib.deflateSync(idat)], ['IEND', Buffer.alloc(0)]]));
  const r3 = M.colour(shortPlte, { rect: [0.0, 1.0, 0.0, 1.0] });
  check('an index past the end of a short palette is refused, not silently black',
    r3.validity === M.UNSUPPORTED_EVIDENCE, `${r3.validity} ${r3.note ?? ''}`);
}
// a zlib stream that ends mid-image must not become fabricated black pixels
{
  const w = 4, h = 4, stride = w * 3;
  const full = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(stride, 200)])));
  const short = full.subarray(0, full.length - stride);          // one row missing, still valid zlib
  const f = put('truncated.png', png([['IHDR', ihdr(w, h, 8, 2)], ['IDAT', zlib.deflateSync(short)], ['IEND', Buffer.alloc(0)]]));
  const r = M.colour(f, { rect: [0.0, 1.0, 0.0, 1.0] });
  check('a stream that ends mid-image is refused, not padded with invented black',
    r.validity === M.UNSUPPORTED_EVIDENCE && /truncat|short|expected/i.test(r.note || ''), `${r.validity} ${r.note ?? ''}`);
}
// a tiny file that declares an enormous image must not be allocated
{
  const f = put('huge.png', png([['IHDR', ihdr(60000, 60000, 8, 2)], ['IDAT', zlib.deflateSync(Buffer.alloc(16))], ['IEND', Buffer.alloc(0)]]));
  const t0 = Date.now();
  const r = M.colour(f, { rect: [0.0, 1.0, 0.0, 1.0] });
  check('a tiny file declaring a 60000x60000 image is refused quickly, not allocated',
    r.validity === M.UNSUPPORTED_EVIDENCE && Date.now() - t0 < 2000, `${r.validity} in ${Date.now() - t0}ms`);
}
// alpha is discarded by design, so a record must SAY so rather than let RGB pass as visual evidence
{
  const w = 2, h = 2, stride = w * 4;
  const rows = Array.from({ length: h }, () => { const line = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) { line[x * 4] = 5; line[x * 4 + 1] = 6; line[x * 4 + 2] = 7; line[x * 4 + 3] = 0; }
    return Buffer.concat([Buffer.from([0]), line]); });
  const f = put('rgba.png', png([['IHDR', ihdr(w, h, 8, 6)], ['IDAT', zlib.deflateSync(Buffer.concat(rows))], ['IEND', Buffer.alloc(0)]]));
  const r = M.source(f);
  check('an alpha-bearing source declares that its alpha was discarded',
    r.validity === M.VALID && r.decode?.alpha_discarded === true,
    `decode=${JSON.stringify(r.decode)}`);
  check('...and does not present fully transparent RGB as exact visual truth',
    /alpha/i.test(r.claimable || ''), r.claimable);
}
/* ── the front door: untrusted bytes ───────────────────────────────────────────────────────────────
   A third review pass found four more ways externally acquired material could crash or launder a
   number past the guards. They share one cause: a hand-written parser on untrusted input needs its
   inputs validated at the door, not symptom by symptom. */
{
  // a chunk whose declared length runs past the end of the file, and an IHDR that is too short
  const shortIhdr = put('short-ihdr.png', png([['IHDR', Buffer.alloc(9)], ['IEND', Buffer.alloc(0)]]));
  const r1 = M.colour(shortIhdr, { rect: [0, 1, 0, 1] });
  check('an IHDR shorter than 13 bytes is a typed refusal, not a RangeError',
    r1.validity === M.UNSUPPORTED_EVIDENCE, `${r1.validity}: ${(r1.note || '').slice(0, 70)}`);
  const good = png([['IHDR', ihdr(4, 4, 8, 2)], ['IDAT', zlib.deflateSync(Buffer.alloc(4 * (1 + 12)))], ['IEND', Buffer.alloc(0)]]);
  const lying = Buffer.from(good); lying.writeUInt32BE(0x7fffff00, 8 + 8 + 13 + 4);   // IDAT length lies
  const r2 = M.colour(put('lying-chunk.png', lying), { rect: [0, 1, 0, 1] });
  check('a chunk length that runs past the end of the file is a typed refusal',
    r2.validity === M.UNSUPPORTED_EVIDENCE, `${r2.validity}: ${(r2.note || '').slice(0, 70)}`);

  // 1/2/4-bit greyscale is legal PNG but this decoder has no path for it: refuse, do not read garbage
  const grey1 = put('grey1.png', png([['IHDR', ihdr(16, 4, 1, 0)],
    ['IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, 0xff, 0xff]))))],
    ['IEND', Buffer.alloc(0)]]));
  const r3 = M.colour(grey1, { rect: [0, 1, 0, 1] });
  check('sub-byte greyscale is refused rather than decoded as invented black',
    r3.validity === M.UNSUPPORTED_EVIDENCE && /bit depth|sub-byte|greyscale/i.test(r3.note || ''),
    `${r3.validity}: ${(r3.note || '').slice(0, 70)}`);

  // a file far larger than any real screenshot must be refused before it is read into memory
  const huge = path.join(DIR, 'huge-bytes.png');
  const fh = fs.openSync(huge, 'w');
  fs.writeSync(fh, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  fs.ftruncateSync(fh, 200 * 1024 * 1024); fs.closeSync(fh);      // sparse: costs no real disk
  const t0 = Date.now();
  const r4 = M.source(huge);
  check('a 200 MB file is refused on its size, before being read',
    r4.validity === M.UNSUPPORTED_EVIDENCE && /size|bytes|large/i.test(r4.note || '') && Date.now() - t0 < 2000,
    `${r4.validity} in ${Date.now() - t0}ms: ${(r4.note || '').slice(0, 60)}`);
}

/* ── the transcode cache must be keyed by CONTENT ──────────────────────────────────────────────────
   It was keyed by basename + size + floored mtime. Two different files sharing those three reuse the
   first one's decoded PNG, so a measurement can come from the wrong image while provenance names the
   right one — and an opaque cache entry would bypass the alpha abstention entirely. */
if (jpg) {
  const a = path.join(DIR, 'sub-a'); const b = path.join(DIR, 'sub-b');
  fs.mkdirSync(a, { recursive: true }); fs.mkdirSync(b, { recursive: true });
  const A = path.join(a, 'same.jpg'), B = path.join(b, 'same.jpg');
  // two DIFFERENT images, same basename, forced to the same size and mtime
  const mkjpg = (col, out) => { const f2 = mk(`tmp-${col.join('')}.png`, 40, 40, () => col);
    try { execFileSync('sips', ['-s', 'format', 'jpeg', f2, '--out', out], { stdio: 'ignore' }); }
    catch { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', f2, out], { stdio: 'ignore' }); } };
  mkjpg([250, 10, 10], A); mkjpg([10, 10, 250], B);
  const pad = Math.max(fs.statSync(A).size, fs.statSync(B).size);
  for (const f of [A, B]) { const cur = fs.readFileSync(f);
    fs.writeFileSync(f, Buffer.concat([cur, Buffer.alloc(pad - cur.length)])); fs.utimesSync(f, 1e6, 1e6); }
  const ra = M.colour(A, { rect: [0.3, 0.7, 0.3, 0.7] });
  const rb = M.colour(B, { rect: [0.3, 0.7, 0.3, 0.7] });
  check('two different files with the same basename, size and mtime do not share a cache entry',
    ra.validity !== M.VALID || rb.validity !== M.VALID || Math.abs(ra.value[0] - rb.value[0]) > 60,
    `A=${ra.hex ?? ra.validity} B=${rb.hex ?? rb.validity}`);
}

/* ── region and axis inputs are validated, never coerced ────────────────────────────────────────── */
{
  const r1 = M.colour(TRAY, { rect: ['x', 'y', 0, 1] });
  check('a non-numeric rect is refused, not medianed into NaN',
    r1.validity !== M.VALID, `${r1.validity} value=${JSON.stringify(r1.value)}`);
  const r2 = M.runs(TRAY, { band: [0.3, 0.5], axis: 'z', key: SLOT, base: 'W' });
  check('an unknown axis is refused rather than silently treated as y',
    r2.validity !== M.VALID, `${r2.validity}: ${(r2.note || '').slice(0, 60)}`);
  const r3 = M.colour(TRAY, { rect: [0.5, 0.2, 0.1, 0.9] });
  check('a rect whose edges are inverted is refused',
    r3.validity !== M.VALID, `${r3.validity}`);
}

/* ── ALPHA: the contract must ABSTAIN, not infer geometry from an RGB canvas ───────────────────────
   Real generated game assets are transparent PNGs whose SHAPE is carried by alpha. This decoder
   discards alpha by design, so "differs from the page background" is undefined on them — and it was
   measured returning VALID with n=3 and a width of 0.315 W on a real shipped asset, plus #000000 for
   the RGB of fully transparent pixels. Both are the bad path: alpha discarded, RGB canvas measured,
   content geometry inferred, reported VALID. V1 does not promise alpha-aware geometry, so it says so. */
{
  const w = 16, h = 16, stride = w * 4;
  const rows = Array.from({ length: h }, (_, y) => {
    const line = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) {
      const inside = x > 3 && x < 12 && y > 3 && y < 12;         // an opaque square in a clear field
      line[x * 4] = 200; line[x * 4 + 1] = 30; line[x * 4 + 2] = 40;
      line[x * 4 + 3] = inside ? 255 : 0;
    }
    return Buffer.concat([Buffer.from([0]), line]);
  });
  const f = put('shape-in-alpha.png', png([['IHDR', ihdr(w, h, 8, 6)], ['IDAT', zlib.deflateSync(Buffer.concat(rows))], ['IEND', Buffer.alloc(0)]]));
  const g = M.runs(f, { band: [0.3, 0.7], base: 'W' });
  check('runs ABSTAINS on an alpha-bearing source instead of measuring the RGB canvas',
    g.validity === M.UNRESOLVED && /alpha/i.test(g.note || ''), `${g.validity}: ${(g.note || '').slice(0, 80)}`);
  const pt = M.pitch(f, { rect: [0.0, 1.0, 0.0, 1.0], axis: 'x', base: 'W' });
  check('pitch abstains too', pt.validity === M.UNRESOLVED && /alpha/i.test(pt.note || ''), pt.validity);
  const cl = M.colour(f, { rect: [0.0, 1.0, 0.0, 1.0] });
  check('colour abstains rather than returning the RGB of transparent pixels',
    cl.validity === M.UNRESOLVED && /alpha/i.test(cl.note || ''), `${cl.validity} ${cl.hex ?? ''}`);
  const cf = M.countFills(f, { rect: [0.0, 1.0, 0.0, 1.0] });
  check('countFills abstains as well', cf.validity === M.UNRESOLVED, cf.validity);
  // `source` is ABOUT the file, not its pixels, so it still answers — and it names the loss.
  const sc = M.source(f);
  check('source still answers, and names the alpha loss',
    sc.validity === M.VALID && sc.decode.alpha_discarded === true && /alpha/i.test(sc.claimable),
    `${sc.validity} ${sc.claimable?.slice(-60)}`);
  // and the abstention must not spread to opaque sources
  const opaque = M.runs(TRAY, { band: [0.30, 0.50], key: SLOT, base: 'W' });
  check('an opaque source is unaffected by the alpha rule', opaque.validity === M.VALID && opaque.n === 5);
}
// The real thing this protects: a shipped transparent asset used to return a geometry number.
{
  const real = path.join(os.homedir(), 'src/msort-ab/T/public/assets/bottle-glass.png');
  if (fs.existsSync(real)) {
    const g = M.runs(real, { band: [0.4, 0.5], base: 'W' });
    check('the shipped transparent asset no longer yields a geometry number',
      g.validity === M.UNRESOLVED, `${g.validity} width_mean=${g.normalized?.width_mean}`);
  } else console.log('  SKIP  the shipped-asset case needs the corpus');
}

/* ── measurement never carries an EXPECTATION ──────────────────────────────────────────────────────
   Two numbers being deterministically measurable does not make them the same observable. A real
   corpus showed it: comparing an asset manifest's design-intent aspect against the PNG canvas ratio
   FAILS 12 of 31 accepted assets, and against a content bbox 11 of 31. Proving that two observables
   are the same thing is the comparison layer's job, so nothing in this API may look like an expected
   value waiting to be compared. */
{
  const recs = [M.source(TRAY), M.colour(TRAY, { rect: [0.1, 0.2, 0.1, 0.2] }),
                M.runs(TRAY, { band: [0.30, 0.50], key: SLOT, base: 'W' }),
                M.pitch(PLAIN, { rect: [0.0, 1.0, 0.30, 0.50], axis: 'x', base: 'W', expect: [0.15, 0.25] })];
  const forbidden = /expected|declared|target|intent|manifest|pass|fail|verdict|matches/i;
  const bad = [];
  for (const r of recs) for (const k of Object.keys(r)) if (forbidden.test(k)) bad.push(`${r.primitive}.${k}`);
  check('no primitive exposes a field that reads as an expectation or a verdict',
    bad.length === 0, bad.join(', ') || 'none');
}

// countFills must clamp its rect like the other primitives do
{
  const r = M.countFills(TRAY, { rect: [-0.5, 1.9, -0.4, 1.7] });
  check('countFills clamps an out-of-bounds rect instead of reading undefined pixels',
    r.validity !== M.VALID || (Number.isFinite(r.value) && r.colours.every((c) => c.rgb.every(Number.isFinite))),
    `${r.validity} value=${r.value}`);
}

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n  ${failures ? `${failures} FAILURE(S)` : 'the measurement contract holds'}`);
process.exit(failures ? 1 : 0);
