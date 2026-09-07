#!/usr/bin/env node
/**
 * Replay — run the V1 primitives against the numeric claims of three REAL reference packages and
 * report how many they reproduce. This is a regression report, not a pass/fail gate: refusing a bad
 * selection is a better outcome than producing a number for it, so a lower "reproduced" count can be
 * the healthier result. It exits non-zero only if the harness itself could not run.
 *
 * The corpus lives outside the repository (three A/B experiment directories). When it is absent this
 * skips with a message — the unit suite in test/measurement.test.mjs is the one that must always run.
 *
 *   node test/measurement-replay.mjs [--gallery]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as M from '../tools/measure/measure.mjs';
import { renderOverlay, buildGallery } from '../tools/measure/overlay.mjs';

const HOME = os.homedir();
const M_ = path.join(HOME, 'src/msort-ab/T/evidence/');
const Y_ = path.join(HOME, 'src/yarn-ab/T/evidence/');
const C_ = path.join(HOME, 'src/refpkg-ab/T1/.ref/');
const OUT = path.join(HOME, 'src/refpkg-determinism-audit/out/measurement-gallery');
const GALLERY = process.argv.includes('--gallery');

if (![M_, Y_, C_].every((d) => fs.existsSync(d))) {
  console.log('SKIP: the reference corpus is not on this machine (expected ~/src/{msort-ab,yarn-ab,refpkg-ab})');
  process.exit(0);
}

/* Keying rules: colours this toolchain measured itself, never values invented in prose. */
const K = { red: [196, 6, 2], blue: [22, 22, 191], purple: [95, 30, 142],
            slot: [124, 72, 50], wood: [212, 155, 92], belt: [43, 42, 46] };

/** Each entry is the LLM's half: WHAT, an approximate WHERE, AGAINST WHAT, and the declared base. */
const SPEC = [
 { id: 'MSORT/R-ID-02', what: 'portrait aspect h/w', prim: 'source', pkg: 2.1638, tol: 0.001,
   files: ['shots_05_gameplay_L6_alt.png', 'shots_10_bottles_reference.png', 'frames_l5_clean.jpg'],
   dir: M_, field: 'aspect_hw' },
 { id: 'YARN/R-03', what: 'portrait aspect w/h', prim: 'source', pkg: 0.46223, tol: 0.0005,
   files: ['shot_09-gameplay-full-5of5.png', 'frame_t004s.jpg'], dir: Y_, field: 'aspect_wh' },

 { id: 'MSORT/R-SP-01', what: 'bottle outer width', prim: 'runs', pkg: 0.1396, base: 'W',
   file: M_ + 'shots_05_gameplay_L6_alt.png', band: [0.42, 0.46], pick: 'width_mean' },
 { id: 'MSORT/R-SP-01b', what: 'bottle width, second resolution', prim: 'runs', pkg: 0.1396, base: 'W',
   file: M_ + 'shots_10_bottles_reference.png', band: [0.40, 0.44], pick: 'width_mean' },
 { id: 'MSORT/R-SP-01c', what: 'bottle width, JPEG frame family', prim: 'runs', pkg: 0.1403, base: 'W',
   file: M_ + 'frames_l5_clean.jpg', band: [0.46, 0.50], pick: 'width_mean' },
 { id: 'MSORT/R-SP-02', what: 'row total gap budget', prim: 'runs', pkg: 0.104, tol: 0.004, base: 'W',
   file: M_ + 'shots_05_gameplay_L6_alt.png', band: [0.42, 0.46], pick: 'gap_budget' },
 { id: 'MSORT/R-SP-04', what: 'liquid column width', prim: 'runs', pkg: 0.1234, base: 'W',
   file: M_ + 'shots_05_gameplay_L6_alt.png', band: [0.44, 0.46], key: K.red, pick: 'width_mean' },
 { id: 'MSORT/R-ST-03', what: 'bottles in the top row', prim: 'runs', pkg: 4, tol: 0, base: 'W',
   file: M_ + 'shots_05_gameplay_L6_alt.png', band: [0.42, 0.46], pick: 'n' },
 { id: 'MSORT/R-UI-03', what: 'settings button column pitch', prim: 'runs', pkg: 0.154, tol: 0.003, base: 'W',
   file: M_ + 'shots_08_settings_open.png', band: [0.84, 0.97], axis: 'y', pick: 'pitch_mean' },
 { id: 'YARN/R-17', what: '5 holder slots, width', prim: 'runs', pkg: 0.132, tol: 0.005, base: 'W',
   file: Y_ + 'shot_09-gameplay-full-5of5.png', band: [0.63, 0.70], key: K.slot, pick: 'width_mean' },
 { id: 'YARN/R-17b', what: 'holder slot pitch', prim: 'runs', pkg: 162.25 / 924, tol: 0.002, base: 'W',
   file: Y_ + 'shot_09-gameplay-full-5of5.png', band: [0.63, 0.70], key: K.slot, pick: 'pitch_mean' },
 { id: 'YARN/R-19', what: 'tray ball width', prim: 'runs', pkg: 0.124, tol: 0.006, base: 'W',
   file: Y_ + 'shot_09-gameplay-full-5of5.png', band: [0.745, 0.775], pick: 'width_mean' },
 { id: 'CBJ/S-03', what: 'HUD horizontal extent', prim: 'runs', pkg: 0.973, tol: 0.02, base: 'W',
   file: C_ + 'video/full/t148.png', band: [0.12, 0.15], pick: 'span_total' },

 { id: 'MSORT/R-VI-01a', what: 'liquid red', prim: 'colour', pkg: [196, 6, 2],
   file: M_ + 'shots_05_gameplay_L6_alt.png', rect: [0.19, 0.28, 0.42, 0.45] },
 { id: 'MSORT/R-VI-01b', what: 'liquid blue', prim: 'colour', pkg: [22, 22, 191],
   file: M_ + 'shots_05_gameplay_L6_alt.png', rect: [0.53, 0.63, 0.425, 0.445] },
 { id: 'MSORT/R-VI-01c', what: 'liquid purple', prim: 'colour', pkg: [95, 30, 142],
   file: M_ + 'shots_05_gameplay_L6_alt.png', rect: [0.71, 0.80, 0.42, 0.45] },
 { id: 'MSORT/R-VI-03a', what: 'background navy (flat)', prim: 'colour', pkg: [3, 10, 49],
   file: M_ + 'shots_05_gameplay_L6_alt.png', rect: [0.02, 0.12, 0.30, 0.60], expectKind: 'SOLID' },
 { id: 'MSORT/R-VI-03b', what: 'top-centre glow', prim: 'colour', pkg: [9, 15, 79], tol: 6,
   file: M_ + 'shots_05_gameplay_L6_alt.png', rect: [0.43, 0.56, 0.02, 0.10], expectKind: 'GRADIENT' },
 { id: 'MSORT/R-VI-04', what: 'empty bottle interior == background', prim: 'colour', pkg: [4, 10, 48],
   file: M_ + 'shots_05_gameplay_L6_alt.png', rect: [0.36, 0.43, 0.60, 0.64] },
 { id: 'YARN/R-31', what: 'home ground tiled blue', prim: 'colour', pkg: [74, 93, 163],
   file: Y_ + 'shot_08-home-levelmap.png', rect: [0.06, 0.22, 0.30, 0.35] },
 { id: 'YARN/R-15c', what: 'belt track colour', prim: 'colour', pkg: [43, 42, 46],
   file: Y_ + 'shot_09-gameplay-full-5of5.png', rect: [0.02, 0.065, 0.25, 0.28] },
 { id: 'MSORT/R-VI-01d', what: 'liquid red from the LOSSY frame family', prim: 'colour', pkg: [196, 6, 2],
   file: M_ + 'frames_l5_clean.jpg', rect: [0.03, 0.11, 0.47, 0.49] },

 { id: 'YARN/R-14a', what: 'stitch grid pitch X', prim: 'pitch', pkg: 30.35 / 924, base: 'W',
   file: Y_ + 'shot_09-gameplay-full-5of5.png', rect: [0.103, 0.897, 0.125, 0.534], axis: 'x', expect: [0.02, 0.05] },
 { id: 'YARN/R-14b', what: 'stitch grid pitch Y', prim: 'pitch', pkg: 26.4 / 1999, base: 'H',
   file: Y_ + 'shot_09-gameplay-full-5of5.png', rect: [0.103, 0.897, 0.125, 0.534], axis: 'y', expect: [0.008, 0.02] },
 { id: 'MSORT/R-ST-01', what: 'bottle liquid unit pitch', prim: 'pitch', pkg: 0.0774, tol: 0.003, base: 'W',
   file: M_ + 'shots_05_gameplay_L6_alt.png', rect: [0.175, 0.30, 0.326, 0.468], axis: 'y', expect: [0.05, 0.12] },
 { id: 'MSORT/R-UI-03b', what: 'settings column pitch, by autocorrelation', prim: 'pitch', pkg: 0.154, tol: 0.003, base: 'W',
   file: M_ + 'shots_08_settings_open.png', rect: [0.845, 0.963, 0.13, 0.44], axis: 'y', expect: [0.10, 0.25] },

 { id: 'MSORT/R-PR-01a', what: 'colour count, Levels 1-4 board', prim: 'count_fills', pkg: 3, tol: 0,
   file: M_ + 'frames_l14_start.jpg', rect: [0.10, 0.90, 0.455, 0.485] },
 { id: 'MSORT/R-PR-01b', what: 'colour count, Level 5', prim: 'count_fills', pkg: 4, tol: 0,
   file: M_ + 'frames_l5_clean.jpg', rect: [0.05, 0.95, 0.495, 0.515] },
 { id: 'MSORT/R-PR-01c', what: 'colour count, Level 6', prim: 'count_fills', pkg: 5, tol: 0,
   file: M_ + 'shots_10_bottles_reference.png', rect: [0.10, 0.90, 0.40, 0.43] },
];

/** Deliberately wrong inputs, kept beside the real ones because a measurement that only ever sees
 *  correct instructions has not been tested. */
const COUNTEREXAMPLES = [
 { id: 'CE-1-GOOD/keying', what: 'holder slots, keyed on the colour the code measured', prim: 'runs',
   pkg: 0.132, tol: 0.005, base: 'W', file: Y_ + 'shot_09-gameplay-full-5of5.png',
   band: [0.63, 0.70], key: K.slot, pick: 'width_mean',
   note: 'the control for CE-2: same band, correct key' },
 { id: 'CE-2-BAD/keying', what: 'the SAME band keyed on the wrong colour (the wooden ground)', prim: 'runs',
   pkg: 0.132, tol: 0.005, base: 'W', file: Y_ + 'shot_09-gameplay-full-5of5.png',
   band: [0.63, 0.70], key: K.wood, pick: 'width_mean',
   note: 'returns five clean runs and a HIGHER match_fraction than the correct key. Only width_cv tells them apart.' },
 { id: 'CE-3-BAD/non-selective', what: 'canvas keyed on wood, which is also the page behind it', prim: 'runs',
   pkg: null, base: 'W', file: Y_ + 'shot_09-gameplay-full-5of5.png',
   band: [0.20, 0.50], key: K.wood, pick: 'width_mean',
   note: 'the key is not unique in the image; the selection swallows the whole band' },
 { id: 'CE-4-BAD/band-placement', what: 'the bottle row measured 0.04 H too high', prim: 'runs',
   pkg: 0.1403, base: 'W', file: M_ + 'frames_l5_clean.jpg', band: [0.42, 0.46], pick: 'width_mean',
   note: 'same file and same key as MSORT/R-SP-01c, band moved: 13% error and the wrong object count' },
 { id: 'CE-5-BAD/base', what: 'a y-axis pitch normalized against H when the claim is a fraction of W',
   prim: 'pitch', pkg: 0.0774, base: 'H', file: M_ + 'shots_05_gameplay_L6_alt.png',
   rect: [0.175, 0.30, 0.326, 0.468], axis: 'y', expect: [0.02, 0.06],
   note: 'the pixel count is right and the number is wrong: this is the unit bug, made visible by base_name' },
 { id: 'CE-6-BAD/lossy-exact', what: 'an exact hex asked of a lossy frame', prim: 'colour',
   pkg: [196, 6, 2], file: M_ + 'frames_l5_clean.jpg', rect: [0.03, 0.11, 0.47, 0.49],
   note: 'std can be LOWER than the lossless original while the median has moved: exactness says FAMILY_ONLY' },
];

const measureOne = (s) => {
  if (s.prim === 'source') {
    const vals = s.files.map((f) => M.source(s.dir + f)).filter((r) => r.validity === M.VALID);
    if (!vals.length) return { validity: M.UNSUPPORTED_EVIDENCE, note: 'no file decoded' };
    const v = vals.map((r) => r[s.field]);
    return { ...vals[0], measured: v.reduce((a, b) => a + b, 0) / v.length, spread: Math.max(...v) - Math.min(...v),
             normalized: null, n_files: v.length };
  }
  if (s.prim === 'colour') {
    const r = M.colour(s.file, { rect: s.rect, key: s.key });
    return { ...r, measured: r.value };
  }
  if (s.prim === 'runs') {
    const r = M.runs(s.file, { band: s.band, axis: s.axis || 'x', key: s.key, base: s.base });
    if (r.validity !== M.VALID) return r;
    const n = r.normalized;
    const measured = { width_mean: n.width_mean, gap_budget: n.gap_budget, pitch_mean: n.pitch_mean,
                       span_total: n.span_total, n: r.n }[s.pick];
    return { ...r, measured };
  }
  if (s.prim === 'pitch') {
    const r = M.pitch(s.file, { rect: s.rect, axis: s.axis, base: s.base, expect: s.expect, key: s.key });
    return { ...r, measured: r.normalized };
  }
  if (s.prim === 'count_fills') {
    const r = M.countFills(s.file, { rect: s.rect });
    return { ...r, measured: r.value };
  }
  return { validity: M.UNSUPPORTED_EVIDENCE, note: `no such primitive ${s.prim}` };
};

const deltaOf = (pkg, m) => {
  if (pkg == null || m == null) return null;
  if (Array.isArray(pkg) && Array.isArray(m)) return Math.max(...pkg.map((v, i) => Math.abs(v - m[i])));
  return Math.abs(Number(pkg) - Number(m));
};

const rows = [];
for (const s of [...SPEC, ...COUNTEREXAMPLES.map((c) => ({ ...c, group: 'COUNTEREXAMPLE' }))]) {
  const r = measureOne(s);
  const tol = s.tol !== undefined ? s.tol
            : (s.prim === 'colour' ? (r.tolerance ?? 1) : (typeof r.tolerance === 'number' ? r.tolerance : 0));
  const d = deltaOf(s.pkg, r.measured);
  let verdict;
  if (r.validity === M.UNRESOLVED) verdict = 'UNRESOLVED';
  else if (r.validity === M.INVALID_SELECTION) verdict = 'INVALID_SELECTION';
  else if (r.validity === M.UNSUPPORTED_EVIDENCE) verdict = 'UNSUPPORTED';
  else if (s.pkg == null || d == null) verdict = 'NO_CLAIM';
  else if (d === 0) verdict = 'EXACT';
  else if (d <= tol) verdict = 'WITHIN_TOLERANCE';
  else verdict = 'MEASUREMENT_DISAGREES';        // never "the package is wrong" — that is not ours to say
  if (s.expectKind && r.kind && r.kind !== s.expectKind && verdict.startsWith('EXACT'))
    verdict = 'MEASUREMENT_DISAGREES';
  rows.push({
    claim_id: s.id, what: s.what, primitive: s.prim, group: s.group ?? 'REAL',
    package_value: s.pkg, measured_value: r.measured ?? null,
    normalized: r.normalized ?? null, base_name: r.base_name ?? null,
    delta: d == null ? null : Number(d.toFixed(6)), tolerance: tol,
    validity: r.validity, verdict,
    match_fraction: r.match_fraction ?? null, selectivity: r.selectivity ?? null,
    plateau: r.plateau ?? null, regularity: r.regularity ?? null, dispersion: r.dispersion ?? null,
    colour_kind: r.kind ?? null, exactness: r.exactness ?? null,
    source_resolution: r.source ? `${r.source.w}x${r.source.h}` : '?',
    codec: r.source?.codec ?? '?', lossless: r.source?.lossless ?? null,
    provenance: r.provenance ?? null, note: s.note ?? r.note ?? null, rec: r,
  });
}

const counts = {};
for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
const w = (s, n) => String(s).padEnd(n);
console.log(`\nREPLAY — ${rows.length} measurement(s) over 3 real reference packages\n`);
for (const r of rows) {
  const pk = Array.isArray(r.package_value) ? `[${r.package_value}]` : r.package_value;
  const mv = Array.isArray(r.measured_value) ? `[${r.measured_value}]` : r.measured_value;
  console.log(`  ${w(r.verdict, 22)} ${w(r.claim_id, 20)} ${w(r.primitive, 12)} pkg=${w(pk, 18)} meas=${w(mv, 18)} Δ=${r.delta ?? '—'}`);
}
console.log('\n  ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
const real = rows.filter((r) => r.group === 'REAL');
const good = real.filter((r) => r.verdict === 'EXACT' || r.verdict === 'WITHIN_TOLERANCE');
const scored = real.filter((r) => r.verdict !== 'NO_CLAIM');
console.log(`  reproduced (real claims only): ${good.length}/${scored.length} = ${Math.round(100 * good.length / scored.length)}%`);
const byPrim = {};
for (const r of scored) { byPrim[r.primitive] ??= [0, 0]; byPrim[r.primitive][1]++;
  if (r.verdict === 'EXACT' || r.verdict === 'WITHIN_TOLERANCE') byPrim[r.primitive][0]++; }
console.log('  primitive coverage: ' + Object.entries(byPrim).map(([p, [a, b]]) => `${p} ${a}/${b}`).join(' · '));

if (GALLERY) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'overlay'), { recursive: true });
  for (const r of rows) {
    const claim = { value: Array.isArray(r.package_value) ? r.package_value : null };
    try {
      const p = renderOverlay(r.rec, { claim, outFile: path.join(OUT, 'overlay', `${r.claim_id.replace(/[\/]/g, '_')}.png`) });
      r.overlay = p ? 'overlay/' + path.basename(p) : null;
    } catch (e) { r.overlay = null; r.note = (r.note ? r.note + ' · ' : '') + `overlay failed: ${e.message}`; }
    delete r.rec;
  }
  const idx = buildGallery(rows, OUT);
  fs.writeFileSync(path.join(OUT, 'replay.json'), JSON.stringify(rows, null, 1));
  console.log(`\n  gallery: ${idx}`);
}
