/**
 * Debug overlay + static gallery — zero dependency.
 *
 * This is not decoration. Two of the lab's worst failures produced arithmetically clean numbers and
 * were only visible as pictures: a keying rule that measured the cream body of a coin pill while the
 * claim meant the whole pill including the coin, and a wood colour that was the same wood as the page
 * behind it, so the "object" grew to the whole region. Neither shows up in a number.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { decode } from './decode.mjs';

/* ---------- minimal PNG writer (also used to synthesise test fixtures) ---------- */
const CRC = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t; })();
function crc32(buf) { let c = ~0; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function writePng(file, w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (1 + w * 3) + 1 + x] = rgb[y * w * 3 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
  return file;
}

/* ---------- drawing ---------- */
function canvasOf(img) { return { w: img.w, h: img.h, rgb: Uint8Array.from(img.rgb) }; }
const put = (c, x, y, col) => {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const q = (y * c.w + x) * 3; c.rgb[q] = col[0]; c.rgb[q + 1] = col[1]; c.rgb[q + 2] = col[2];
};
function rect(c, x0, y0, x1, y1, col, lw = 2) {
  for (let t = 0; t < lw; t++) {
    for (let x = x0; x <= x1; x++) { put(c, x, y0 + t, col); put(c, x, y1 - t, col); }
    for (let y = y0; y <= y1; y++) { put(c, x0 + t, y, col); put(c, x1 - t, y, col); }
  }
}
function fill(c, x0, y0, x1, y1, col) {
  for (let y = Math.max(0, y0); y <= Math.min(c.h - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(c.w - 1, x1); x++) put(c, x, y, col);
}
function vline(c, x, y0, y1, col, lw = 1) { for (let t = 0; t < lw; t++) for (let y = y0; y <= y1; y++) put(c, x + t, y, col); }
function hline(c, y, x0, x1, col, lw = 1) { for (let t = 0; t < lw; t++) for (let x = x0; x <= x1; x++) put(c, x, y + t, col); }
function crosshair(c, x, y, col, r = 6) { hline(c, y, x - r, x + r, col, 2); vline(c, x, y - r, y + r, col, 2); }

const YEL = [255, 214, 0], GRN = [0, 255, 60], RED = [255, 40, 40], CYA = [0, 220, 255], MAG = [255, 0, 200];

/** Render one measurement over its evidence. Layers: region (yellow), selection/geometry (green),
 *  package claim (red), plateau scan (cyan), sample points (magenta). */
export function renderOverlay(rec, { claim = {}, outFile, maxWidth = 620 } = {}) {
  const src = rec?.provenance?.file_path;
  if (!src || !fs.existsSync(src)) return null;
  const img = decode(src);
  const c = canvasOf(img);
  const W = img.w, H = img.h;
  const lw = Math.max(2, Math.round(W / 320));
  const reg = rec.provenance.region;
  const p = rec.primitive;

  if (p === 'runs' && Array.isArray(reg)) {
    const axis = rec.provenance.axis || 'x';
    const other = axis === 'x' ? H : W;
    const i0 = Math.floor(reg[0] * other), i1 = Math.ceil(reg[1] * other);
    if (axis === 'x') rect(c, 0, i0, W - 1, i1, YEL, lw); else rect(c, i0, 0, i1, H - 1, YEL, lw);
    for (const [a, b] of rec.value?.runs_px ?? []) {
      if (axis === 'x') { rect(c, a, i0, b, i1, GRN, lw); crosshair(c, Math.round((a + b) / 2), Math.round((i0 + i1) / 2), MAG); }
      else { rect(c, i0, a, i1, b, GRN, lw); crosshair(c, Math.round((i0 + i1) / 2), Math.round((a + b) / 2), MAG); }
    }
    if (rec.plateau) {                                        // the swept band range, as a rail
      const lo = Math.floor(rec.plateau.lo * other), hi = Math.ceil((rec.plateau.hi + (reg[1] - reg[0])) * other);
      if (axis === 'x') fill(c, 0, lo, Math.round(W * 0.012), hi, CYA);
      else fill(c, lo, 0, hi, Math.round(H * 0.012), CYA);
    }
  } else if (p === 'colour' && rec.debug_px) {
    const { x0, x1, y0, y1 } = rec.debug_px;
    rect(c, x0, y0, x1 - 1, y1 - 1, GRN, lw);
    const sw = Math.max(24, Math.round(W * 0.07));
    const sy = Math.max(0, y0 - sw - 4);
    fill(c, x0, sy, x0 + sw, sy + sw, rec.value);            // measured
    rect(c, x0, sy, x0 + sw, sy + sw, GRN, 2);
    if (Array.isArray(claim.value)) {                        // package claim, beside it
      fill(c, x0 + sw + 6, sy, x0 + 2 * sw + 6, sy + sw, claim.value);
      rect(c, x0 + sw + 6, sy, x0 + 2 * sw + 6, sy + sw, RED, 2);
    }
  } else if (p === 'pitch' && rec.debug_px) {
    const { x0, x1, y0, y1 } = rec.debug_px;
    rect(c, x0, y0, x1 - 1, y1 - 1, YEL, lw);
    const step = rec.value;
    if (rec.provenance.axis === 'y') for (let y = y0; y < y1; y += step) hline(c, y, x0, x1 - 1, CYA, 1);
    else for (let x = x0; x < x1; x += step) vline(c, x, y0, y1 - 1, CYA, 1);
  } else if (p === 'count_fills' && Array.isArray(reg)) {
    const x0 = Math.floor(reg[0] * W), x1 = Math.ceil(reg[1] * W);
    const y0 = Math.floor(reg[2] * H), y1 = Math.ceil(reg[3] * H);
    rect(c, x0, y0, x1 - 1, y1 - 1, YEL, lw);
    const sw = Math.max(22, Math.round(W * 0.05));
    let x = x0;
    for (const col of rec.colours ?? []) { fill(c, x, Math.max(0, y0 - sw - 4), x + sw, Math.max(0, y0 - 4), col.rgb); x += sw + 4; }
  }
  // the package's claimed rect, when the claim carries one
  if (claim.rect_norm) {
    const r = claim.rect_norm;
    rect(c, Math.floor(r.x0 * W), Math.floor(r.y0 * H), Math.ceil(r.x1 * W), Math.ceil(r.y1 * H), RED, lw);
  }
  let { w, h, rgb } = c;
  if (w > maxWidth) {                                        // nearest-neighbour: keeps 1 px edges visible
    const s = maxWidth / w, nw = Math.round(w * s), nh = Math.round(h * s);
    const out = new Uint8Array(nw * nh * 3);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.round(x / s)), sy = Math.min(h - 1, Math.round(y / s));
      const q = (y * nw + x) * 3, p2 = (sy * w + sx) * 3;
      out[q] = rgb[p2]; out[q + 1] = rgb[p2 + 1]; out[q + 2] = rgb[p2 + 2];
    }
    w = nw; h = nh; rgb = out;
  }
  return writePng(outFile, w, h, rgb);
}

/* ---------- static gallery ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const cell = (k, v) => `<div class="k">${esc(k)}</div><div class="v">${v === null || v === undefined ? '<i>—</i>' : esc(typeof v === 'object' ? JSON.stringify(v) : v)}</div>`;

export function buildGallery(cards, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const groups = [['COUNTEREXAMPLES', (c) => c.group === 'COUNTEREXAMPLE'],
                  ['VALID', (c) => c.group !== 'COUNTEREXAMPLE' && c.validity === 'VALID'],
                  ['INVALID_SELECTION', (c) => c.group !== 'COUNTEREXAMPLE' && c.validity === 'INVALID_SELECTION'],
                  ['UNRESOLVED', (c) => c.group !== 'COUNTEREXAMPLE' && c.validity === 'UNRESOLVED'],
                  ['UNSUPPORTED_EVIDENCE', (c) => c.group !== 'COUNTEREXAMPLE' && c.validity === 'UNSUPPORTED_EVIDENCE']];
  const swatch = (v) => Array.isArray(v) && v.length === 3
    ? `<span class="sw" style="background:rgb(${v.join(',')})"></span>rgb(${v.join(',')})` : esc(JSON.stringify(v));
  let html = `<!doctype html><meta charset="utf-8"><title>measurement gallery</title><style>
body{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0;background:#14161a;color:#dfe3e8}
h1{font-size:16px;padding:14px 18px;margin:0;background:#0f1113;border-bottom:1px solid #262a30}
h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;margin:26px 18px 10px;color:#8b95a3}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(430px,1fr));gap:14px;padding:0 18px 20px}
.card{background:#1b1e23;border:1px solid #262a30;border-radius:6px;overflow:hidden}
.card.bad{border-color:#7a2b2b}.card.good{border-color:#2b5f36}
.hd{display:flex;justify-content:space-between;gap:8px;padding:8px 11px;background:#0f1113;border-bottom:1px solid #262a30}
.hd b{color:#fff}.tag{font-size:11px;padding:2px 7px;border-radius:10px;background:#2a2f36}
.tag.VALID{background:#1f4d2c;color:#b7f2c6}.tag.INVALID_SELECTION{background:#5a2323;color:#ffc9c9}
.tag.UNRESOLVED{background:#4d431f;color:#f2e6b7}.tag.UNSUPPORTED_EVIDENCE{background:#33383f}
img{display:block;width:100%;background:#000}
.meta{display:grid;grid-template-columns:150px 1fr;gap:1px 8px;padding:9px 11px;font-size:12px}
.k{color:#7f8996}.v{color:#e6eaef;word-break:break-all}
.sw{display:inline-block;width:13px;height:13px;border:1px solid #555;vertical-align:-2px;margin-right:5px}
.note{padding:8px 11px;color:#f0c674;border-top:1px solid #262a30;font-size:12px}
</style><h1>reference measurement V1 — ${cards.length} card(s) · ${esc(new Date().toISOString())}</h1>`;
  for (const [name, pred] of groups) {
    const cs = cards.filter(pred);
    if (!cs.length) continue;
    html += `<h2>${name} — ${cs.length}</h2><div class="grid">`;
    for (const c of cs) {
      const good = c.verdict === 'EXACT' || c.verdict === 'WITHIN_TOLERANCE';
      html += `<div class="card ${c.group === 'COUNTEREXAMPLE' ? 'bad' : good ? 'good' : ''}">
<div class="hd"><b>${esc(c.claim_id)}</b><span>${esc(c.primitive)}</span><span class="tag ${esc(c.validity)}">${esc(c.validity)}</span></div>
${c.overlay ? `<img src="${esc(c.overlay)}" alt="${esc(c.claim_id)}">` : ''}
<div class="meta">
${cell('what', c.what)}
${cell('package value', Array.isArray(c.package_value) ? swatch(c.package_value) : c.package_value)}
${cell('measured', Array.isArray(c.measured_value) ? swatch(c.measured_value) : c.measured_value)}
${cell('normalized', c.normalized)}${cell('base', c.base_name)}
${cell('delta', c.delta)}${cell('tolerance', c.tolerance)}
${cell('verdict', c.verdict)}
${cell('match_fraction', c.match_fraction)}${cell('selectivity', c.selectivity)}
${cell('plateau', c.plateau)}${cell('regularity', c.regularity)}
${cell('dispersion', c.dispersion)}${cell('colour kind', c.colour_kind)}
${cell('source', c.source_resolution + ' ' + c.codec + (c.lossless ? ' lossless' : ' LOSSY'))}
${cell('provenance', c.provenance)}
</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</div>`;
    }
    html += '</div>';
  }
  const out = path.join(outDir, 'index.html');
  fs.writeFileSync(out, html);
  return out;
}
