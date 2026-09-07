/**
 * Reference measurement V1 — four primitives, zero dependency.
 *
 * WHY THIS EXISTS. A reference package's numeric claims were produced by an agent reading pixels by
 * eye and writing the result into a prose provenance line. Across three real packages, 43 of 64
 * quantity claims named no method at all and 33 embedded hand-read coordinates. The numbers were
 * often right; the problem is that a right number and an invented one looked identical.
 *
 * WHAT IT DOES NOT DO. It does not find regions, and it does not judge a claim. The caller (an
 * LLM/VLM, from the evidence it can see) supplies WHAT, an approximate WHERE, and — this one was
 * learned the hard way — AGAINST WHAT: the keying rule that says which colour defines the target.
 * This layer answers HOW MUCH.
 *
 * THE RULE THAT SHAPES THE RETURN VALUE. A measurement must carry the value AND evidence that the
 * ruler was placed correctly. In the lab a WRONG keying rule scored a HIGHER match_fraction than the
 * right one (0.615 vs 0.373) and returned six clean, evenly-spaced runs that were pure fiction. So
 * match_fraction alone is not evidence; `selectivity`, `plateau` and `regularity` are reported
 * beside it, and every one of them exists because a real measurement went wrong without them.
 */
import path from 'node:path';
import { decode, LOSSLESS, UnsupportedEvidence } from './decode.mjs';

export const TOOL_VERSION = 'measure-v1.0.0';
export const VALID = 'VALID';
export const UNRESOLVED = 'UNRESOLVED';
export const INVALID_SELECTION = 'INVALID_SELECTION';
export const UNSUPPORTED_EVIDENCE = 'UNSUPPORTED_EVIDENCE';
/** There is deliberately no FAIL. Disagreement with a claim is the caller's verdict, never ours. */

const round = (v, n = 5) => (v == null || Number.isNaN(v) ? null : Number(v.toFixed(n)));
const median = (xs) => { const a = [...xs].sort((p, q) => p - q); const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const std = (xs) => { if (xs.length < 2) return 0; const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
const cv = (xs) => { const m = mean(xs); return m ? round(std(xs) / m, 4) : null; };

/** Derived from the SOURCE, never chosen: a lossless fill measures to the byte, a 4:2:0 JPEG
 *  measured 6-9 per channel off the same region, so an exact hex is not claimable there. */
function tolerancesFor(img) {
  const lossless = LOSSLESS.has(img.codec);
  return { colour: lossless ? 1 : 10, geom_px: lossless ? 1 : 2, lossless };
}

function baseSpan(img, base, axis) {
  if (base === 'W') return img.w;
  if (base === 'H') return img.h;
  if (base === 'ratio') return 1;
  if (base === undefined || base === null) {
    // Inferring the base from the axis is the unit bug that made a correct 73 px pitch look like a
    // 2x package error, twice. It is refused, not guessed.
    throw new RangeError('base must be declared as "W", "H" or "ratio" — it is never inferred from the axis');
  }
  throw new RangeError(`unknown base ${JSON.stringify(base)}`);
}

function record(primitive, img, extra, opts) {
  const t = tolerancesFor(img);
  return {
    primitive, validity: VALID,
    // `source` describes the ORIGINAL evidence. `decode` describes how these bytes were obtained, and
    // the two are kept apart on purpose: a JPEG handed through a PNG transcode is still a JPEG, and
    // every tolerance below is derived from `source.codec`.
    source: { w: img.w, h: img.h, codec: img.codec, lossless: t.lossless, bytes: img.bytes ?? null },
    decode: img.decode ?? null,
    provenance: { primitive, tool_version: TOOL_VERSION, file: path.basename(img.file),
                  file_path: img.file, region: opts.region ?? null, key: opts.key ?? null,
                  key_tol: opts.key ? (opts.keyTol ?? 22) : null, base: opts.base ?? null,
                  axis: opts.axis ?? null },
    match_fraction: null, selectivity: null, plateau: null, regularity: null, dispersion: null,
    ...extra,
  };
}
function bad(primitive, validity, note, img, opts, extra = {}) {
  const base = img ? record(primitive, img, {}, opts) : {
    primitive, source: null,
    provenance: { primitive, tool_version: TOOL_VERSION, file: opts.file ? path.basename(opts.file) : null,
                  file_path: opts.file ?? null, region: opts.region ?? null, key: opts.key ?? null,
                  base: opts.base ?? null, axis: opts.axis ?? null },
    match_fraction: null, selectivity: null, plateau: null, regularity: null, dispersion: null,
  };
  return { ...base, ...extra, validity, value: null, normalized: null, note };
}

const px = (img, x, y) => { const q = (y * img.w + x) * 3; return [img.rgb[q], img.rgb[q + 1], img.rgb[q + 2]]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const near = (c, k, tol) => Math.abs(c[0] - k[0]) <= tol && Math.abs(c[1] - k[1]) <= tol && Math.abs(c[2] - k[2]) <= tol;

function open(file, primitive, opts) {
  try { return { img: decode(file) }; }
  catch (e) {
    if (e instanceof UnsupportedEvidence) return { err: bad(primitive, UNSUPPORTED_EVIDENCE, e.message, null, { ...opts, file }) };
    throw e;
  }
}

/* ─────────────────────────────── source ─────────────────────────────── */
export function source(file) {
  const o = open(file, 'source', {});
  if (o.err) return o.err;
  const img = o.img, t = tolerancesFor(img);
  return record('source', img, {
    value: { w: img.w, h: img.h }, normalized: null, base_name: 'ratio',
    aspect_hw: round(img.h / img.w, 5), aspect_wh: round(img.w / img.h, 5),
    tolerance: { colour_per_channel: t.colour, geometry_px: t.geom_px,
                 geometry_normalized_W: round(t.geom_px / img.w), geometry_normalized_H: round(t.geom_px / img.h) },
    claimable: (t.lossless ? 'exact values are claimable from this source'
                           : 'lossy source: colour is a FAMILY, not an exact value')
      + (img.decode?.alpha_discarded
        ? ' — and this source carries ALPHA, which is discarded: the RGB of a transparent pixel is not what a viewer sees'
        : ''),
  }, { base: 'ratio' });
}

/* ─────────────────────────────── colour ─────────────────────────────── */
export function colour(file, { rect, key = null, keyTol = 22, base = 'ratio' } = {}) {
  const opts = { region: rect, key, keyTol, base };
  const o = open(file, 'colour', opts);
  if (o.err) return o.err;
  const img = o.img;
  const [fx0, fx1, fy0, fy1] = rect;
  const x0 = Math.max(0, Math.floor(fx0 * img.w)), x1 = Math.min(img.w, Math.ceil(fx1 * img.w));
  const y0 = Math.max(0, Math.floor(fy0 * img.h)), y1 = Math.min(img.h, Math.ceil(fy1 * img.h));
  if (x1 - x0 < 3 || y1 - y0 < 3)
    return bad('colour', UNRESOLVED, `region is ${x1 - x0}x${y1 - y0} px — too small to take a median`, img, opts);
  const R = [], G = [], B = [];
  let matched = 0, total = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const c = px(img, x, y); total++;
    if (key && !near(c, key, keyTol)) continue;
    matched++; R.push(c[0]); G.push(c[1]); B.push(c[2]);
  }
  const mf = key ? round(matched / total, 4) : null;
  if (key && matched < 9)
    return bad('colour', INVALID_SELECTION,
      `keying rule matched ${matched} px in the region — a key that selects nothing is not a measurement`,
      img, opts, { match_fraction: mf });
  const med = [median(R), median(G), median(B)].map(Math.round);
  // A linear-ramp fit separates a gradient from texture: a gradient's residual collapses, a
  // texture's does not. The distinction decides whether a single colour is even the right answer.
  const w = x1 - x0, h = y1 - y0;
  const raw = [], res = [], amp = [];
  for (const ch of [0, 1, 2]) {
    let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sz = 0, sxz = 0, syz = 0, n = 0;
    const vals = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const c = px(img, x, y);
      if (key && !near(c, key, keyTol)) continue;
      const zx = x - x0, zy = y - y0, z = c[ch];
      sxx += zx * zx; syy += zy * zy; sxy += zx * zy; sx += zx; sy += zy; sz += z;
      sxz += zx * z; syz += zy * z; n++; vals.push(z);
    }
    raw.push(std(vals));
    const D = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);
    let a = 0, b = 0, c0 = mean(vals) ?? 0;
    if (Math.abs(D) > 1e-9) {
      a = ((sxz * (syy * n - sy * sy)) - (sxy * (syz * n - sy * sz)) + (sx * (syz * sy - syy * sz))) / D;
      b = ((sxx * (syz * n - sy * sz)) - (sxz * (sxy * n - sy * sx)) + (sx * (sxy * sz - syz * sx))) / D;
      c0 = ((sxx * (syy * sz - sy * syz)) - (sxy * (sxy * sz - sx * syz)) + (sxz * (sxy * sy - syy * sx))) / D;
    }
    let acc = 0, m = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const c = px(img, x, y);
      if (key && !near(c, key, keyTol)) continue;
      const e = c[ch] - (a * (x - x0) + b * (y - y0) + c0); acc += e * e; m++;
    }
    res.push(m ? Math.sqrt(acc / m) : 0);
    amp.push(Math.abs(a * w) + Math.abs(b * h));
  }
  const rawMax = Math.max(...raw), resMax = Math.max(...res), ampMax = Math.max(...amp);
  const kind = rawMax < 4 ? 'SOLID' : (resMax < 0.45 * rawMax && ampMax > 8 ? 'GRADIENT' : 'TEXTURED');
  // The naive answer, kept as a number rather than an argument: a plain histogram peak fragments a
  // smooth region across neighbouring buckets, and this says by how much on THIS region.
  const bins = new Map();
  for (let i = 0; i < R.length; i++) {
    const k = ((R[i] >> 3) << 10) | ((G[i] >> 3) << 5) | (B[i] >> 3);
    bins.set(k, (bins.get(k) || 0) + 1);
  }
  let topK = null, topN = -1;
  for (const [k, n] of bins) if (n > topN) { topN = n; topK = k; }
  const topRGB = [((topK >> 10) & 31) << 3, ((topK >> 5) & 31) << 3, (topK & 31) << 3];
  const t = tolerancesFor(img);
  return record('colour', img, {
    value: med, representative_rgb: med, hex: hex(med), normalized: null, base_name: 'ratio',
    kind, naive_top: topRGB, naive_error: Math.max(...med.map((v, i) => Math.abs(v - topRGB[i]))),
    tolerance: t.colour, match_fraction: mf,
    dispersion: { std: raw.map((v) => round(v, 2)), ramp_residual: res.map((v) => round(v, 2)),
                  ramp_amplitude: amp.map((v) => round(v, 1)) },
    exactness: t.lossless ? 'EXACT_CLAIMABLE' : 'FAMILY_ONLY',
    debug_px: { x0, x1, y0, y1 },
  }, opts);
}

/* ─────────────────────────────── runs ─────────────────────────────── */
export function runs(file, { band, axis = 'x', key = null, keyTol = 22, minFrac = 0.04,
                             bgTol = 26, sweep = 0.10, base } = {}) {
  const opts = { region: band, key, keyTol, base, axis };
  const o = open(file, 'runs', opts);
  if (o.err) return o.err;
  const img = o.img;
  let span, other;
  try { span = baseSpan(img, base, axis); } catch (e) { return bad('runs', INVALID_SELECTION, e.message, img, opts); }
  const along = axis === 'x' ? img.w : img.h;
  other = axis === 'x' ? img.h : img.w;
  // page background, for the keyless mode: the modal colour of the outer margin, which is never the
  // subject. Not a constant, and not an LLM's guess.
  const marg = Math.max(4, Math.round(0.06 * img.w));
  const bgR = [], bgG = [], bgB = [];
  for (let y = 0; y < img.h; y += 3) for (const x of [1, marg, img.w - 1 - marg, img.w - 2]) {
    const c = px(img, x, y); bgR.push(c[0]); bgG.push(c[1]); bgB.push(c[2]);
  }
  const bg = [median(bgR), median(bgG), median(bgB)];

  const scan = (lo, hi) => {
    const i0 = Math.max(0, Math.floor(lo * other)), i1 = Math.min(other, Math.ceil(hi * other));
    if (i1 - i0 < 2) return null;
    const on = new Array(along).fill(false);
    let matched = 0, total = 0;
    for (let a = 0; a < along; a++) {
      let hits = 0, n = 0;
      const vals = [];
      for (let b = i0; b < i1; b++) {
        const c = axis === 'x' ? px(img, a, b) : px(img, b, a);
        n++; total++;
        if (key) { if (near(c, key, keyTol)) { hits++; matched++; } }
        else vals.push(c);
      }
      if (key) on[a] = hits / n > 0.5;
      else {
        const m = [median(vals.map((c) => c[0])), median(vals.map((c) => c[1])), median(vals.map((c) => c[2]))];
        const d = Math.max(Math.abs(m[0] - bg[0]), Math.abs(m[1] - bg[1]), Math.abs(m[2] - bg[2]));
        on[a] = d > bgTol; if (on[a]) matched += n;
      }
    }
    const out = [];
    for (let i = 0; i < along;) {
      if (!on[i]) { i++; continue; }
      let j = i; while (j + 1 < along && on[j + 1]) j++;
      if (j - i + 1 >= minFrac * along) out.push([i, j]);
      i = j + 1;
    }
    return { out, mf: round(matched / Math.max(1, total), 4), i0, i1 };
  };

  const first = scan(band[0], band[1]);
  if (!first) return bad('runs', UNRESOLVED, 'band is thinner than 2 px', img, opts);
  if (!first.out.length)
    return bad('runs', INVALID_SELECTION,
      key ? 'keying rule produced no run in this band — a key that selects nothing is not a measurement'
          : 'nothing in this band differs from the page background',
      img, opts, { match_fraction: first.mf });

  const widths = first.out.map(([a, b]) => (b - a + 1) / span);
  const lefts = first.out.map(([a]) => a);
  const gaps = first.out.slice(1).map(([a], i) => (a - first.out[i][1] - 1) / span);
  const pitches = lefts.slice(1).map((v, i) => v - lefts[i]);

  // PLATEAU. One band is a single point of failure: moving it by 0.04 H once turned a correct 0.1403
  // into 0.1208 and four objects into six. So the band is swept and the stable range reported.
  const h = band[1] - band[0], step = 0.005, ok = [];
  for (let t0 = Math.max(0, band[0] - sweep); t0 <= Math.min(1 - h, band[0] + sweep) + 1e-9; t0 += step) {
    const s = scan(t0, t0 + h);
    if (!s || s.out.length !== first.out.length) continue;
    const w2 = s.out.map(([a, b]) => (b - a + 1) / span);
    if (w2.every((v, i) => Math.abs(v - widths[i]) * span <= 1.5)) ok.push(round(t0, 3));
  }
  const plateau = ok.length ? { lo: Math.min(...ok), hi: Math.max(...ok),
                                width: round(Math.max(...ok) - Math.min(...ok), 3), n_ok: ok.length } : null;
  // SELECTIVITY. A key that fills the band edge to edge is describing the ground, not the object.
  const fillAlong = (first.out[first.out.length - 1][1] - first.out[0][0] + 1) / along;
  const sel = { fill_x: axis === 'x' ? round(fillAlong, 3) : null,
                fill_y: axis === 'y' ? round(fillAlong, 3) : null,
                border_fraction: round((first.out[0][0] === 0 ? 0.5 : 0) +
                                       (first.out[first.out.length - 1][1] === along - 1 ? 0.5 : 0), 3) };
  if (fillAlong > 0.98 && sel.border_fraction >= 1)
    return bad('runs', INVALID_SELECTION,
      'the selection spans the whole band and touches both edges: the key is not selective here',
      img, opts, { match_fraction: first.mf, selectivity: sel });
  const t = tolerancesFor(img);
  return record('runs', img, {
    value: { runs_px: first.out, widths_px: first.out.map(([a, b]) => b - a + 1), lefts_px: lefts,
             pitches_px: pitches, n: first.out.length },
    normalized: { widths: widths.map((v) => round(v)), width_mean: round(mean(widths)),
                  gaps: gaps.map((v) => round(v)), gap_budget: round(gaps.reduce((a, b) => a + b, 0)),
                  pitch_mean: pitches.length ? round(mean(pitches) / span) : null,
                  span_total: round((first.out[first.out.length - 1][1] - first.out[0][0] + 1) / span) },
    base_name: base, n: first.out.length,
    tolerance: round(t.geom_px / span), match_fraction: first.mf, selectivity: sel, plateau,
    // REGULARITY. The wrong key in the lab gave six widths spanning 2.1x while the right key gave
    // five identical ones. This is what separated them; match_fraction pointed the wrong way.
    regularity: { width_cv: cv(widths.map((v) => v * span)), pitch_cv: pitches.length ? cv(pitches) : null },
    dispersion: { width_std_px: round(std(first.out.map(([a, b]) => b - a + 1)), 2) },
  }, opts);
}

/* ─────────────────────────────── pitch ─────────────────────────────── */
/**
 * pitch — the period of a repeat inside `rect`.
 *
 * `expect: [minNorm, maxNorm]` bounds the period as a fraction of the declared base, and it is not a
 * convenience: a real region contains repeats at SEVERAL scales at once. Asked for the pitch of four
 * settings buttons, autocorrelation answered 4 px with a perfectly respectable strength — a real
 * texture inside the panel, and the wrong question. The caller already knows the rough scale ("four
 * buttons down this column"), so the scale is part of the approximate WHERE the caller owes, exactly
 * like the region itself. Without bounds this primitive refuses an ambiguous field rather than
 * picking from it.
 */
export function pitch(file, { rect, axis = 'x', key = null, keyTol = 30, base, expect = null } = {}) {
  const opts = { region: rect, key, keyTol, base, axis, expect };
  const o = open(file, 'pitch', opts);
  if (o.err) return o.err;
  const img = o.img;
  let span;
  try { span = baseSpan(img, base, axis); } catch (e) { return bad('pitch', INVALID_SELECTION, e.message, img, opts); }
  const [fx0, fx1, fy0, fy1] = rect;
  const x0 = Math.max(0, Math.floor(fx0 * img.w)), x1 = Math.min(img.w, Math.ceil(fx1 * img.w));
  const y0 = Math.max(0, Math.floor(fy0 * img.h)), y1 = Math.min(img.h, Math.ceil(fy1 * img.h));
  if (x1 - x0 < 20 || y1 - y0 < 20)
    return bad('pitch', UNRESOLVED, `region ${x1 - x0}x${y1 - y0} px is too small to resolve a repeat`, img, opts);
  const n = axis === 'x' ? x1 - x0 : y1 - y0;
  const prof = new Float64Array(n);
  let matched = 0, total = 0;
  for (let i = 0; i < n; i++) {
    let acc = 0, m = 0;
    const across = axis === 'x' ? [y0, y1] : [x0, x1];
    for (let j = across[0]; j < across[1]; j++) {
      const [xx, yy] = axis === 'x' ? [x0 + i, j] : [j, y0 + i];
      const c = px(img, xx, yy); total++;
      if (key) { if (near(c, key, keyTol)) { acc += 1; matched++; } }
      else {
        const [px2, py2] = axis === 'x' ? [Math.max(x0, x0 + i - 1), j] : [j, Math.max(y0, y0 + i - 1)];
        const d = px(img, px2, py2);
        acc += Math.abs((0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) -
                        (0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]));
      }
      m++;
    }
    prof[i] = m ? acc / m : 0;
  }
  const mu = prof.reduce((a, b) => a + b, 0) / n;
  const v = Array.from(prof, (x) => x - mu);
  const sd = Math.sqrt(v.reduce((a, b) => a + b * b, 0) / n);
  if (sd < 1e-6)
    return bad('pitch', INVALID_SELECTION, 'the profile is flat: nothing repeats in this region',
      img, opts, { match_fraction: key ? round(matched / total, 4) : null });
  const ac = new Float64Array(Math.floor(n / 2));
  for (let k = 0; k < ac.length; k++) {
    let s = 0; for (let i = 0; i + k < n; i++) s += v[i] * v[i + k];
    ac[k] = s;
  }
  const a0 = ac[0] || 1e-9;
  for (let k = 0; k < ac.length; k++) ac[k] /= a0;
  // Candidates are the local maxima of the autocorrelation. Two things decide between them, and both
  // came from real failures: the caller's expected band (a region holds repeats at several scales at
  // once) and the strength floor below (a weak peak is not a pitch). A raw FIRST-peak pick was tried
  // and returns sub-harmonics — half the true period — so the strongest in band wins, not the first.
  const cands = [];
  for (let k = 4; k <= Math.floor(n / 3); k++) if (ac[k] > ac[k - 1] && ac[k] >= ac[k + 1] && ac[k] > 0.10) cands.push(k);
  /** the profile folded at period k, as a mean per phase */
  const fold = (k) => {
    const sum = new Float64Array(k), cnt = new Float64Array(k);
    for (let i = 0; i < n; i++) { sum[i % k] += v[i]; cnt[i % k]++; }
    return Array.from(sum, (t, i) => t / (cnt[i] || 1));
  };
  const residualAt = (k) => {
    const f = fold(k);
    let acc = 0;
    for (let i = 0; i < n; i++) { const e = v[i] - f[i % k]; acc += e * e; }
    return Math.sqrt(acc / n) / (sd || 1e-9);
  };
  let inRange = cands;
  if (expect) {
    const lo = Math.max(2, Math.floor(expect[0] * span)), hi = Math.ceil(expect[1] * span);
    inRange = cands.filter((k) => k >= lo && k <= hi);
    if (!inRange.length)
      return bad('pitch', UNRESOLVED,
        `no repeat found between ${lo} and ${hi} px (the expected band); candidates were [${cands.slice(0, 8)}]`,
        img, opts, { match_fraction: key ? round(matched / total, 4) : null,
                     dispersion: { candidates: cands.slice(0, 12) } });
  }
  let peak = null, rival = null;
  if (inRange.length) {
    // Start from the STRONGEST repeat, then promote only while the halves say the period is doubled.
    peak = inRange.reduce((a, b) => (ac[b] > ac[a] ? b : a), inRange[0]);
    // A rival at a different scale, not harmonically related, means the question was underspecified.
    const related = (a, b) => a % b === 0 || b % a === 0;
    rival = inRange.find((k) => k !== peak && !related(k, peak) && ac[k] >= 0.8 * ac[peak]) ?? null;
  }
  if (peak != null && rival != null && !expect)
    return bad('pitch', UNRESOLVED,
      `two unrelated repeats of similar strength (${peak} px and ${rival} px): pass \`expect\` to say ` +
      `which scale is meant, because this region has more than one`,
      img, opts, { match_fraction: key ? round(matched / total, 4) : null,
                   dispersion: { candidates: cands.slice(0, 12), rival } });
  const best = peak == null ? -1 : ac[peak];
  // No strength THRESHOLD here on purpose. One was tried at 0.35 and no test could justify it: it
  // rejected a correct 26 px grid pitch in one revision and protected nothing in the next. The
  // strength is reported instead, and whether a weak repeat may be called MEASURED is the reference
  // compiler's rule to make, not this layer's. Candidate detection already requires ac > 0.10.
  if (peak == null)
    return bad('pitch', UNRESOLVED, 'no autocorrelation peak above 0.10 — no resolvable repeat here',
      img, opts, { match_fraction: key ? round(matched / total, 4) : null,
                   dispersion: { ac_strength: round(best, 3), candidates: cands.slice(0, 8) } });
  const t = tolerancesFor(img);
  return record('pitch', img, {
    value: peak, normalized: round(peak / span), base_name: base,
    tolerance: round(t.geom_px / span), match_fraction: key ? round(matched / total, 4) : null,
    dispersion: { ac_strength: round(ac[peak], 3), fold_residual: round(residualAt(peak), 4),
                  candidates: cands.slice(0, 8), rival: rival ?? null },
    debug_px: { x0, x1, y0, y1 },
  }, opts);
}

/* ─────────────────── count_fills (optional in V1) ─────────────────── */
export function countFills(file, { rect, minSat = 60, minShare = 0.02, merge = 70, base = 'ratio' } = {}) {
  const opts = { region: rect, base };
  const o = open(file, 'count_fills', opts);
  if (o.err) return o.err;
  const img = o.img;
  const [fx0, fx1, fy0, fy1] = rect;
  // clamped like every other primitive: an out-of-bounds rect otherwise reads `undefined` pixels and
  // can classify them as saturated, returning VALID over numbers that were never in the image.
  const x0 = Math.max(0, Math.floor(fx0 * img.w)), x1 = Math.min(img.w, Math.ceil(fx1 * img.w));
  const y0 = Math.max(0, Math.floor(fy0 * img.h)), y1 = Math.min(img.h, Math.ceil(fy1 * img.h));
  if (x1 - x0 < 1 || y1 - y0 < 1) return bad('count_fills', UNRESOLVED, 'region is empty after clamping', img, opts);
  const bins = new Map();
  let sat = 0, total = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const c = px(img, x, y); total++;
    if (Math.max(...c) - Math.min(...c) <= minSat) continue;
    sat++;
    const k = ((c[0] >> 5) << 10) | ((c[1] >> 5) << 5) | (c[2] >> 5);
    let e = bins.get(k); if (!e) bins.set(k, e = { n: 0, R: [], G: [], B: [] });
    e.n++; if (e.R.length < 4000) { e.R.push(c[0]); e.G.push(c[1]); e.B.push(c[2]); }
  }
  if (sat < 50)
    return bad('count_fills', UNRESOLVED, `only ${sat} saturated px in the region`, img, opts,
      { match_fraction: round(sat / Math.max(1, total), 4) });
  const cols = [];
  for (const e of [...bins.values()].sort((a, b) => b.n - a.n)) {
    if (e.n / sat < minShare) continue;
    const m = [median(e.R), median(e.G), median(e.B)].map(Math.round);
    if (cols.every((p) => Math.max(...m.map((v, i) => Math.abs(v - p.rgb[i]))) > merge))
      cols.push({ rgb: m, hex: hex(m), share: round(e.n / sat, 4) });
  }
  return record('count_fills', img, {
    value: cols.length, normalized: null, base_name: base, colours: cols,
    tolerance: 0, match_fraction: round(sat / total, 4),
    dispersion: { saturated_share: round(sat / total, 4) },
  }, opts);
}
