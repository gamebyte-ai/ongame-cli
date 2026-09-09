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

/** Region and axis are validated, never coerced. `rect: ['x','y',0,1]` used to skip every loop and
 *  return VALID with NaN channels, and `axis: 'z'` was silently treated as the y path while the
 *  provenance said z. Both are selections the caller got wrong, so they are INVALID_SELECTION. */
function badRegion(region, n = 4) {
  if (!Array.isArray(region) || region.length !== n) return `region must be an array of ${n} fractions`;
  if (!region.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return `region ${JSON.stringify(region)} is not made of finite numbers`;
  }
  if (n === 4 && (region[1] <= region[0] || region[3] <= region[2])) {
    return `region ${JSON.stringify(region)} has an inverted or empty edge`;
  }
  if (n === 2 && region[1] <= region[0]) return `band ${JSON.stringify(region)} is inverted or empty`;
  return null;
}
const badAxis = (axis) => (axis === 'x' || axis === 'y' ? null : `axis must be "x" or "y", got ${JSON.stringify(axis)}`);

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

/**
 * A key that matches THIS MUCH of the whole frame is describing the ground, not the object.
 *
 * The existing guards catch a key that matches nothing (`colour`: fewer than 9 px) and a key that
 * fills a band edge to edge (`runs`). Neither catches the case that cost the most: a key which,
 * inside the caller's small rect, looks perfectly selective while matching most of the IMAGE. On one
 * reference frame the cardboard wall itself sat at R-B 123, above the threshold that isolated the
 * candy on other frames, and the resulting "candy" measured 1.0 of frame width. The rect cannot see
 * that; only the frame can.
 */
const BACKGROUND_KEY_SHARE = 0.30;

const px = (img, x, y) => { const q = (y * img.w + x) * 3; return [img.rgb[q], img.rgb[q + 1], img.rgb[q + 2]]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const near = (c, k, tol) => Math.abs(c[0] - k[0]) <= tol && Math.abs(c[1] - k[1]) <= tol && Math.abs(c[2] - k[2]) <= tol;

/** What share of the WHOLE frame this key matches. Sampled on a grid: exactness is not the point. */
function keyCoverage(img, key, keyTol) {
  let hit = 0, n = 0;
  const step = Math.max(1, Math.round(Math.min(img.w, img.h) / 160));
  for (let y = 0; y < img.h; y += step) for (let x = 0; x < img.w; x += step) {
    n++; if (near(px(img, x, y), key, keyTol)) hit++;
  }
  return n ? hit / n : 0;
}

/** See BACKGROUND_KEY_SHARE. Returns a bad() record, or null when the key is selective enough. */
function backgroundKeyGuard(primitive, img, opts, key, keyTol) {
  if (!key) return null;
  const share = keyCoverage(img, key, keyTol);
  if (share <= BACKGROUND_KEY_SHARE) return null;
  return bad(primitive, INVALID_SELECTION,
    `the keying rule matches ${(share * 100).toFixed(0)}% of the whole frame — at that coverage it ` +
    'describes the background, and a region drawn inside it will look selective while measuring the ground',
    img, opts, { selectivity: { frame_coverage: round(share, 4), limit: BACKGROUND_KEY_SHARE } });
}

/** The keyed pixels' bounding box and centroid inside a clamped rect. Shared by scale and track. */
function keyedExtent(img, rect, key, keyTol) {
  const [fx0, fx1, fy0, fy1] = rect;
  const x0 = Math.max(0, Math.floor(fx0 * img.w)), x1 = Math.min(img.w, Math.ceil(fx1 * img.w));
  const y0 = Math.max(0, Math.floor(fy0 * img.h)), y1 = Math.min(img.h, Math.ceil(fy1 * img.h));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let sx = 0, sy = 0, hit = 0, total = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    total++;
    if (!near(px(img, x, y), key, keyTol)) continue;
    hit++; sx += x; sy += y;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!hit) return null;
  return { hit, total, match_fraction: round(hit / Math.max(1, total), 4),
           x0: minX, x1: maxX, y0: minY, y1: maxY,
           w_px: maxX - minX + 1, h_px: maxY - minY + 1,
           cx_px: sx / hit, cy_px: sy / hit };
}

function open(file, primitive, opts) {
  try { return { img: decode(file) }; }
  catch (e) {
    if (e instanceof UnsupportedEvidence) return { err: bad(primitive, UNSUPPORTED_EVIDENCE, e.message, null, { ...opts, file }) };
    throw e;
  }
}

/**
 * ABSTAIN on an alpha-bearing source. This decoder discards alpha by design — every primitive here
 * reads what is DRAWN and no caller composites — but a real generated game asset is a transparent PNG
 * whose SHAPE is carried by alpha, and on one of those "differs from the page background" is not a
 * question with an answer. Measured before this guard: a shipped transparent asset returned VALID with
 * three runs and a width of 0.315 W, and its colour came back #000000 from fully transparent pixels.
 * That is the whole failure this file exists to prevent, arriving through the decoder instead of
 * through a keying rule. V1 does not promise alpha-aware geometry, so it declines rather than infer.
 *
 * `source` is exempt: it describes the FILE, not its pixels, and it is where the loss is announced.
 * Cost on the reference corpus this was built for: none — 0 of 157 evidence files carry alpha.
 */
function alphaGuard(primitive, img, opts) {
  if (!img.decode?.alpha_discarded) return null;
  return bad(primitive, UNRESOLVED,
    'this source carries ALPHA and its alpha is discarded here, so the shape may be carried by ' +
    'transparency rather than by colour — alpha-aware geometry and subject segmentation are out of ' +
    'scope for V1, and inferring them from the RGB canvas would be a measurement of the canvas, not ' +
    'of the subject. Use `source` for the file-level facts.', img, opts);
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
  const rb = badRegion(rect);
  if (rb) return bad('colour', INVALID_SELECTION, rb, null, { ...opts, file });
  const o = open(file, 'colour', opts);
  if (o.err) return o.err;
  const img = o.img;
  const [fx0, fx1, fy0, fy1] = rect;
  const x0 = Math.max(0, Math.floor(fx0 * img.w)), x1 = Math.min(img.w, Math.ceil(fx1 * img.w));
  const y0 = Math.max(0, Math.floor(fy0 * img.h)), y1 = Math.min(img.h, Math.ceil(fy1 * img.h));
  const ag = alphaGuard('colour', img, opts); if (ag) return ag;
  const bg0 = backgroundKeyGuard('colour', img, opts, key, keyTol); if (bg0) return bg0;
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
  const rb = badRegion(band, 2) || badAxis(axis);
  if (rb) return bad('runs', INVALID_SELECTION, rb, null, { ...opts, file });
  const o = open(file, 'runs', opts);
  if (o.err) return o.err;
  const img = o.img;
  const ag = alphaGuard('runs', img, opts); if (ag) return ag;
  const bgk = backgroundKeyGuard('runs', img, opts, key, keyTol); if (bgk) return bgk;
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
  const rb = badRegion(rect) || badAxis(axis);
  if (rb) return bad('pitch', INVALID_SELECTION, rb, null, { ...opts, file });
  const o = open(file, 'pitch', opts);
  if (o.err) return o.err;
  const img = o.img;
  const ag = alphaGuard('pitch', img, opts); if (ag) return ag;
  const bgp = backgroundKeyGuard('pitch', img, opts, key, keyTol); if (bgp) return bgp;
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
export function countFills(file, { rect, minSat = 60, minShare = 0.02, merge = 70, base = 'ratio',
                                   expectAt = null, expectTol = 0.12 } = {}) {
  const opts = { region: rect, base };
  const rb = badRegion(rect);
  if (rb) return bad('count_fills', INVALID_SELECTION, rb, null, { ...opts, file });
  const o = open(file, 'count_fills', opts);
  if (o.err) return o.err;
  const img = o.img;
  const ag = alphaGuard('count_fills', img, opts); if (ag) return ag;
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
    let e = bins.get(k);
    if (!e) bins.set(k, e = { n: 0, R: [], G: [], B: [], minX: x, maxX: x, minY: y, maxY: y, sx: 0, sy: 0 });
    e.n++; e.sx += x; e.sy += y;
    if (x < e.minX) e.minX = x; if (x > e.maxX) e.maxX = x;
    if (y < e.minY) e.minY = y; if (y > e.maxY) e.maxY = y;
    if (e.R.length < 4000) { e.R.push(c[0]); e.G.push(c[1]); e.B.push(c[2]); }
  }
  if (sat < 50)
    return bad('count_fills', UNRESOLVED, `only ${sat} saturated px in the region`, img, opts,
      { match_fraction: round(sat / Math.max(1, total), 4) });
  const cols = [];
  for (const e of [...bins.values()].sort((a, b) => b.n - a.n)) {
    if (e.n / sat < minShare) continue;
    const m = [median(e.R), median(e.G), median(e.B)].map(Math.round);
    if (cols.every((p) => Math.max(...m.map((v, i) => Math.abs(v - p.rgb[i]))) > merge)) {
      // WHERE, not just how much. Ordering by share and returning no position left the caller only
      // one inference available -- "the biggest fill is the object" -- and it is wrong often enough
      // to matter: on one frame the largest light region was a creature's PAIR OF EYES read as its
      // mouth, and on another the largest green region was the level's green WALL read as the
      // creature. Both were caught by eye afterwards, which is not a method.
      cols.push({ rgb: m, hex: hex(m), share: round(e.n / sat, 4),
                  at: { cx: round((e.sx / e.n) / img.w), cy: round((e.sy / e.n) / img.h) },
                  extent: { w: round((e.maxX - e.minX + 1) / img.w), h: round((e.maxY - e.minY + 1) / img.h) },
                  box_px: { x0: e.minX, x1: e.maxX, y0: e.minY, y1: e.maxY } });
    }
  }
  // `expectAt` is the same contract `pitch`'s `expect` already has: the caller knows roughly WHERE
  // the thing it means sits, so an ambiguous field is refused rather than resolved by size.
  let picked = null;
  if (expectAt) {
    if (!Array.isArray(expectAt) || expectAt.length !== 2 ||
        !expectAt.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return bad('count_fills', INVALID_SELECTION,
        'expectAt must be [cx, cy] as fractions of the image', img, opts);
    }
    const hits = cols.filter((c) => Math.abs(c.at.cx - expectAt[0]) <= expectTol &&
                                     Math.abs(c.at.cy - expectAt[1]) <= expectTol);
    if (hits.length !== 1) {
      return bad('count_fills', INVALID_SELECTION,
        `expectAt [${expectAt.join(', ')}] matches ${hits.length} of the ${cols.length} fills within ` +
        `${expectTol} — ${hits.length ? 'the field is ambiguous there' : 'nothing the caller meant is there'}, ` +
        'and picking by size is how the wrong region gets measured',
        img, opts, { colours: cols, expect_at: expectAt, expect_tol: expectTol });
    }
    picked = hits[0];
  }
  return record('count_fills', img, {
    value: cols.length, normalized: null, base_name: base, colours: cols,
    picked, expect_at: expectAt, expect_tol: expectAt ? expectTol : null,
    tolerance: 0, match_fraction: round(sat / total, 4),
    dispersion: { saturated_share: round(sat / total, 4) },
  }, opts);
}

/* ─────────────────────────────── scale ─────────────────────────────── */
/**
 * scale — how many DESIGN px one image px is worth, recovered from an object of known design size.
 *
 * WHY THIS EXISTS. Every other primitive answers in fractions of the image it read, which is the
 * right answer while all the evidence shares one frame. It stops being the right answer the moment a
 * package holds a LANDSCAPE recording and a PORTRAIT store frame of the same game: a rate measured
 * in the recording (px/s) has no fraction-of-width that means anything in the portrait design box.
 * A real package concluded from this that "the reference's distances are not recoverable", and the
 * builder then DERIVED gravity from a beat window instead. The derived value was out by about 4x.
 *
 * It is recoverable. Any object whose design size is already MEASURED in the matching frames turns
 * image px into design px. The anchor that worked was the rope pin: 73 design px across in the
 * portrait frames, 13.0 px across in the recording, so one recording px is 5.6 design px.
 *
 * WHY `crossCheck` IS REQUIRED, not optional. A scale taken from one object is unfalsifiable: if the
 * anchor was mis-keyed, every number downstream is wrong by that factor and nothing in the output
 * says so. So this primitive refuses to answer without a SECOND object of known design size that it
 * did not use to build the scale, and it reports the disagreement. On the run this was written for,
 * the creature came out 249 design px wide through a pin-built scale against 238 and 242 measured
 * directly — 4% apart, which is what made the scale usable.
 */
export function scale(file, { rect, key, keyTol = 22, knownDesignPx, axis = 'x',
                              crossCheck = null, tolerateFrac = 0.10 } = {}) {
  const opts = { region: rect, key, keyTol, base: 'design_px', axis };
  const rb = badRegion(rect) || badAxis(axis);
  if (rb) return bad('scale', INVALID_SELECTION, rb, null, { ...opts, file });
  if (!Array.isArray(key) || key.length !== 3) {
    return bad('scale', INVALID_SELECTION, 'scale needs an explicit key: the anchor is identified by colour, never by being the biggest thing in the rect', null, { ...opts, file });
  }
  if (!(typeof knownDesignPx === 'number' && knownDesignPx > 0)) {
    return bad('scale', INVALID_SELECTION, 'knownDesignPx must be the anchor size already MEASURED in the matching frames', null, { ...opts, file });
  }
  if (!crossCheck) {
    return bad('scale', INVALID_SELECTION,
      'scale refuses to answer without `crossCheck`: a scale built from one object cannot be shown ' +
      'to be wrong, and a mis-keyed anchor silently rescales every number that depends on it',
      null, { ...opts, file });
  }
  const o = open(file, 'scale', opts);
  if (o.err) return o.err;
  const img = o.img;
  const ag = alphaGuard('scale', img, opts); if (ag) return ag;
  const bgs = backgroundKeyGuard('scale', img, opts, key, keyTol); if (bgs) return bgs;

  const ext = keyedExtent(img, rect, key, keyTol);
  if (!ext) return bad('scale', INVALID_SELECTION, 'the anchor key matched nothing in this rect', img, opts);
  const anchorPx = axis === 'x' ? ext.w_px : ext.h_px;
  const t = tolerancesFor(img);
  if (anchorPx <= 2 * t.geom_px) {
    return bad('scale', UNRESOLVED,
      `the anchor measures ${anchorPx} px along ${axis}, within ${t.geom_px} px of the source tolerance — ` +
      'a scale divided out of a feature this small carries its own error into everything downstream',
      img, opts, { match_fraction: ext.match_fraction });
  }
  const designPerPx = knownDesignPx / anchorPx;

  // The cross-check: measure a DIFFERENT object, predict its design size through this scale, and
  // report the disagreement against what the matching frames say it is.
  const ccRb = badRegion(crossCheck.rect);
  if (ccRb) return bad('scale', INVALID_SELECTION, `crossCheck.rect: ${ccRb}`, img, opts);
  if (!Array.isArray(crossCheck.key) || crossCheck.key.length !== 3 ||
      !(typeof crossCheck.knownDesignPx === 'number' && crossCheck.knownDesignPx > 0)) {
    return bad('scale', INVALID_SELECTION, 'crossCheck needs its own key and knownDesignPx', img, opts);
  }
  const ccTol = crossCheck.keyTol ?? keyTol;
  const ccAxis = crossCheck.axis ?? axis;
  if (badAxis(ccAxis)) return bad('scale', INVALID_SELECTION, `crossCheck.axis: ${badAxis(ccAxis)}`, img, opts);
  const ccBg = backgroundKeyGuard('scale', img, opts, crossCheck.key, ccTol); if (ccBg) return ccBg;
  const ccExt = keyedExtent(img, crossCheck.rect, crossCheck.key, ccTol);
  if (!ccExt) return bad('scale', INVALID_SELECTION, 'the crossCheck key matched nothing in its rect', img, opts);
  const ccPx = ccAxis === 'x' ? ccExt.w_px : ccExt.h_px;
  const predicted = ccPx * designPerPx;
  const disagreement = Math.abs(predicted - crossCheck.knownDesignPx) / crossCheck.knownDesignPx;
  const cross = { predicted_design_px: round(predicted, 2), known_design_px: crossCheck.knownDesignPx,
                  measured_px: ccPx, disagreement: round(disagreement, 4), tolerated: tolerateFrac,
                  match_fraction: ccExt.match_fraction };
  if (disagreement > tolerateFrac) {
    return bad('scale', UNRESOLVED,
      `the cross-check disagrees by ${(disagreement * 100).toFixed(1)}%: a second object of known size ` +
      `predicts ${predicted.toFixed(0)} design px against ${crossCheck.knownDesignPx}. One of the two ` +
      'keys is on the wrong object, and the scale is not usable until that is settled',
      img, opts, { cross_check: cross, match_fraction: ext.match_fraction });
  }
  return record('scale', img, {
    value: round(designPerPx, 5), normalized: null, base_name: 'design_px',
    design_per_px: round(designPerPx, 5), anchor_px: anchorPx, anchor_design_px: knownDesignPx,
    cross_check: cross, tolerance: round(designPerPx * t.geom_px / anchorPx, 5),
    match_fraction: ext.match_fraction,
    selectivity: { frame_coverage: round(keyCoverage(img, key, keyTol), 4), limit: BACKGROUND_KEY_SHARE },
    debug_px: { anchor: { x0: ext.x0, x1: ext.x1, y0: ext.y0, y1: ext.y1 },
                cross: { x0: ccExt.x0, x1: ccExt.x1, y0: ccExt.y0, y1: ccExt.y1 } },
  }, opts);
}

/* ─────────────────────────────── track ─────────────────────────────── */
/**
 * track — where one keyed object is, frame by frame.
 *
 * WHY THIS EXISTS. The reference skill asks for the duration and the SHAPE of every state-change
 * animation ("accelerating? settling?"), and for the beat between an action and its payoff. Nothing
 * in this layer could answer that: every primitive reads one still, so those numbers were being
 * hand-read off frames — which is the exact failure this whole layer exists to prevent, arriving
 * through the one question it had no primitive for.
 *
 * It reports per frame, and reports the frames it could NOT resolve rather than closing the gaps:
 * a series with holes is a fact about the evidence, and interpolating them is how a fitted rate
 * starts describing the interpolation instead of the motion.
 *
 * `axis_stability` is the other reason this is a multi-frame primitive. A rotating object's extent
 * along the rotation axis is constant while the other axis is foreshortened by the phase, so a
 * single still cannot tell a SIZE from a PHASE. Measured off three stills of one spinning star,
 * the heights were 82, 82, 83 and the widths were 31, 40, 56 — and the width was read as the
 * star's size, which drew it at 54% of its real one. Here the two coefficients of variation sit
 * side by side, so the unstable axis is visible instead of being averaged into a number.
 */
export function track(files, { rect, key, keyTol = 22, fps = null, minMatch = 0.0002 } = {}) {
  const opts = { region: rect, key, keyTol, base: 'ratio' };
  if (!Array.isArray(files) || !files.length) {
    return bad('track', INVALID_SELECTION, 'track needs an ordered array of frame files', null, opts);
  }
  const rb = badRegion(rect);
  if (rb) return bad('track', INVALID_SELECTION, rb, null, { ...opts, file: files[0] });
  if (!Array.isArray(key) || key.length !== 3) {
    return bad('track', INVALID_SELECTION, 'track needs an explicit key', null, { ...opts, file: files[0] });
  }
  const series = [];
  const missing = [];
  let img0 = null;
  for (let i = 0; i < files.length; i++) {
    const o = open(files[i], 'track', opts);
    if (o.err) { missing.push({ i, file: path.basename(files[i]), why: 'unsupported_evidence' }); continue; }
    const img = o.img;
    if (alphaGuard('track', img, opts)) { missing.push({ i, file: path.basename(files[i]), why: 'alpha_source' }); continue; }
    if (!img0) img0 = img;
    if (img.w !== img0.w || img.h !== img0.h) {
      return bad('track', INVALID_SELECTION,
        `frame ${i} is ${img.w}x${img.h} against ${img0.w}x${img0.h} on the first — a series of mixed ` +
        'sizes cannot share one rect or one scale', img, opts);
    }
    if (backgroundKeyGuard('track', img, opts, key, keyTol)) {
      missing.push({ i, file: path.basename(files[i]), why: 'key_matched_background' }); continue;
    }
    const ext = keyedExtent(img, rect, key, keyTol);
    if (!ext || ext.match_fraction < minMatch) {
      missing.push({ i, file: path.basename(files[i]), why: 'key_matched_nothing' }); continue;
    }
    series.push({ i, t: fps ? round(i / fps, 5) : null, file: path.basename(files[i]),
                  cx: round(ext.cx_px / img.w), cy: round(ext.cy_px / img.h),
                  cx_px: round(ext.cx_px, 2), cy_px: round(ext.cy_px, 2),
                  w_px: ext.w_px, h_px: ext.h_px, match_fraction: ext.match_fraction });
  }
  if (!img0) return bad('track', UNSUPPORTED_EVIDENCE, 'no frame in the series could be decoded', null, opts);
  if (series.length < 2) {
    return bad('track', INVALID_SELECTION,
      `the key resolved in ${series.length} of ${files.length} frames — that is not a series`,
      img0, opts, { resolved: series.length, frames: files.length, missing });
  }
  const ws = series.map((s) => s.w_px), hs = series.map((s) => s.h_px);
  return record('track', img0, {
    value: series.length, normalized: null, base_name: 'ratio',
    frames: files.length, resolved: series.length, fps,
    series, missing,
    // See the note above: the axis a rotation preserves is the axis a size may be measured on.
    axis_stability: { width_cv: cv(ws), height_cv: cv(hs),
                      width_px: { min: Math.min(...ws), max: Math.max(...ws) },
                      height_px: { min: Math.min(...hs), max: Math.max(...hs) } },
    match_fraction: round(mean(series.map((s) => s.match_fraction)), 4),
    dispersion: { resolved_share: round(series.length / files.length, 4) },
  }, opts);
}

/* ─────────────────────────────── rate ─────────────────────────────── */
/**
 * rate — fit a polynomial in time to a tracked series, and say how well it fitted.
 *
 * This is the primitive that turns a series into "accelerating at X". It is pure: it reads a `track`
 * result, never a file, so a caller cannot accidentally fit one thing and cite another.
 *
 * THE RESIDUAL IS THE POINT. A parabola fits a swing, a roll and a fall equally happily and returns
 * a confident second coefficient for all three; only the residual says which of them the caller was
 * actually looking at. On the run this was written for, the accepted windows had a residual under
 * 1 px against a travel of 500+ px, and the same fit over a swinging segment sat an order of
 * magnitude worse — same shape of number, different question answered. So a fit whose residual is
 * large next to the travel is returned UNRESOLVED rather than as a rate.
 */
export function rate(trackResult, { axis = 'y', order = 2, designPerPx = 1, maxResidualFrac = 0.02 } = {}) {
  const opts = { region: null, key: null, base: 'design_px', axis };
  if (badAxis(axis)) return bad('rate', INVALID_SELECTION, badAxis(axis), null, opts);
  if (!trackResult || trackResult.primitive !== 'track') {
    return bad('rate', INVALID_SELECTION, 'rate reads a track() result, so the fit and the citation cannot drift apart', null, opts);
  }
  if (trackResult.validity !== VALID) {
    return bad('rate', trackResult.validity, `the track it was given is ${trackResult.validity}: ${trackResult.note ?? 'no series'}`, null, opts);
  }
  if (!trackResult.fps) {
    return bad('rate', INVALID_SELECTION, 'the track carries no fps, so a per-second rate cannot be stated', null, opts);
  }
  const s = trackResult.series;
  if (!Number.isInteger(order) || order < 1 || order > 3) {
    return bad('rate', INVALID_SELECTION, `order must be 1, 2 or 3, got ${JSON.stringify(order)}`, null, opts);
  }
  if (s.length < order + 2) {
    return bad('rate', UNRESOLVED, `${s.length} resolved frames cannot support an order-${order} fit`, null, opts);
  }
  const t0 = s[0].t;
  const ts = s.map((q) => q.t - t0);
  const ys = s.map((q) => (axis === 'y' ? q.cy_px : q.cx_px) * designPerPx);

  // Normal equations for a least-squares polynomial. Small and explicit beats a dependency here.
  const m = order + 1;
  const A = Array.from({ length: m }, () => new Array(m).fill(0));
  const b = new Array(m).fill(0);
  for (let k = 0; k < ts.length; k++) {
    const pw = [];
    for (let j = 0; j < m; j++) pw.push(ts[k] ** j);
    for (let r = 0; r < m; r++) { for (let c = 0; c < m; c++) A[r][c] += pw[r] * pw[c]; b[r] += pw[r] * ys[k]; }
  }
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) {
      return bad('rate', UNRESOLVED, 'the time samples are degenerate for this order (duplicate or collinear)', null, opts);
    }
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k2 = c; k2 < m; k2++) A[r][k2] -= f * A[c][k2];
      b[r] -= f * b[c];
    }
  }
  const coef = b.map((v, i) => v / A[i][i]);
  let acc = 0;
  for (let k = 0; k < ts.length; k++) {
    let pred = 0;
    for (let j = 0; j < m; j++) pred += coef[j] * ts[k] ** j;
    acc += (pred - ys[k]) ** 2;
  }
  const residual = Math.sqrt(acc / ts.length);
  const travel = Math.max(...ys) - Math.min(...ys);
  const frac = travel > 0 ? residual / travel : Infinity;
  const shaped = {
    order, coefficients: coef.map((v) => round(v, 4)),
    // For order 2 the second derivative is 2*c2, which is the acceleration the caller came for.
    acceleration: order >= 2 ? round(2 * coef[2], 2) : null,
    velocity_at_start: round(coef[1], 2),
    residual_rms: round(residual, 3), travel, residual_frac: round(frac, 5),
    tolerated_residual_frac: maxResidualFrac,
    duration_s: round(ts[ts.length - 1], 4), n: ts.length, design_per_px: designPerPx,
  };
  if (!(frac <= maxResidualFrac)) {
    return bad('rate', UNRESOLVED,
      `the order-${order} fit leaves a residual of ${residual.toFixed(2)} against ${travel.toFixed(0)} of ` +
      'travel: this segment is not that shape, and the coefficient it would report describes the ' +
      'mis-fit rather than the motion', null, opts, { fit: shaped });
  }
  return {
    primitive: 'rate', validity: VALID,
    source: trackResult.source, decode: trackResult.decode,
    provenance: { primitive: 'rate', tool_version: TOOL_VERSION, file: trackResult.provenance.file,
                  file_path: trackResult.provenance.file_path, region: trackResult.provenance.region,
                  key: trackResult.provenance.key, key_tol: trackResult.provenance.key_tol,
                  base: 'design_px', axis, from_track: { frames: trackResult.frames, resolved: trackResult.resolved } },
    value: shaped.acceleration ?? shaped.velocity_at_start,
    normalized: null, base_name: 'design_px', fit: shaped,
    tolerance: round(residual, 3),
    match_fraction: trackResult.match_fraction, selectivity: null,
    plateau: null, regularity: null,
    dispersion: { residual_rms: shaped.residual_rms, residual_frac: shaped.residual_frac },
  };
}
