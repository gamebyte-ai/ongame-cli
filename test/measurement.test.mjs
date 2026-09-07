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
} else {
  const noTool = M.colour(path.join(DIR, 'nope.jpg'), { rect: [0.2, 0.8, 0.2, 0.8] });
  check('with no transcoder present, lossy evidence is UNSUPPORTED_EVIDENCE rather than a number',
    noTool.validity === M.UNSUPPORTED_EVIDENCE, noTool.note);
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

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n  ${failures ? `${failures} FAILURE(S)` : 'the measurement contract holds'}`);
process.exit(failures ? 1 : 0);
