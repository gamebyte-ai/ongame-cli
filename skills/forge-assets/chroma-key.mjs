#!/usr/bin/env node
// Cut a generated sprite out of a flat magenta plate, or check that a "transparent" PNG really has alpha.
// Node built-ins only (zlib for PNG). Reads 8-bit grey/RGB/RGBA/grey-alpha and 1-8 bit palette PNGs, non-interlaced;
// a tRNS chunk makes its palette entries, or its one grey/RGB colour, transparent. 16-bit and interlaced PNGs are
// refused with exit 2.
//
//   node chroma-key.mjs check <in.png>
//     exit 0: a real cut-out — at least 5% of pixels fully transparent (alpha 0) AND at least 25% of the
//     border pixels fully transparent. A sprite on a transparent plate passes both easily; an opaque image
//     with a few stray clear pixels, or a painted checkerboard (looks cut out in a thumbnail, is not),
//     fails. A subject that fills the frame edge to edge can fail the border rule: look at it.
//     exit 1: not a cut-out.
//   node chroma-key.mjs key <in.png> <out.png> [--lo 20] [--hi 70] [--spill 20]
//     score = min(r, b) - g. score >= hi → transparent; score <= lo → kept; between → soft edge.
//     Despill: in every kept pixel with score > 0, r = min(r, g + spill) and b = min(b, g + spill).
//     Only the magenta excess is removed, so reds, oranges and purples survive.
//     lo, hi and spill are 0-255 and lo < hi.
//     exit 0: keyed, <out.png> written (to a temp file beside it, then renamed). exit 1: under 5% of the image keyed
//     (no magenta plate found); nothing is written. <out.png> must not be <in.png>, a link to it, or a hard link.
//   exit 2: usage error, bad option, unreadable file, unsupported PNG, or an output that cannot be written.
import { readFileSync, writeFileSync, realpathSync, existsSync, statSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function fail(msg, code = 2) { process.stderr.write(msg + '\n'); process.exit(code); }
process.on('uncaughtException', (e) => fail(`chroma-key: ${e.code ? `${e.code} ` : ''}${e.message}`));

function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) fail('not a PNG');
  let off = 8, ihdr, plte, trns; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = data; else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data; else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) fail('not a valid PNG: no IHDR chunk');
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), depth = ihdr[8], ct = ihdr[9];
  if (depth === 16) fail('unsupported: 16-bit PNG; re-save it as 8-bit');
  if (ihdr[12] !== 0) fail('interlaced PNG is not supported; re-save it non-interlaced');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!ch) fail(`colour type ${ct} not supported`);
  if (depth !== 8 && !(ct === 3 && depth < 8)) fail(`bit depth ${depth} not supported for colour type ${ct}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil((w * ch * depth) / 8), bpp = Math.max(1, (ch * depth) >> 3);
  const px = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  const out = Buffer.alloc(w * h * 4);
  // Grey (ct 0) and RGB (ct 2) tRNS hold one 16-bit sample per channel: pixels of exactly that colour are clear.
  const key = trns && (ct === 0 || ct === 2) && trns.length >= ch * 2 ? Array.from({ length: ch }, (_, k) => trns.readUInt16BE(k * 2)) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, row = y * stride;
    if (ct === 3) {
      const per = 8 / depth, byte = px[row + Math.floor(x / per)];
      const idx = (byte >> ((per - 1 - (x % per)) * depth)) & ((1 << depth) - 1);
      out[o] = plte[idx * 3]; out[o + 1] = plte[idx * 3 + 1]; out[o + 2] = plte[idx * 3 + 2];
      out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
    } else {
      const i = row + x * ch;
      if (ct === 0 || ct === 4) { out[o] = out[o + 1] = out[o + 2] = px[i]; out[o + 3] = ct === 4 ? px[i + 1] : 255; }
      else { out[o] = px[i]; out[o + 1] = px[i + 1]; out[o + 2] = px[i + 2]; out[o + 3] = ct === 6 ? px[i + 3] : 255; }
      if (key && key.every((v, k) => v === px[i + k])) out[o + 3] = 0;
    }
  }
  return { w, h, rgba: out };
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(b) { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}
function encode({ w, h, rgba }) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const USAGE = 'usage: chroma-key.mjs check <in.png> | key <in.png> <out.png> [--lo 20] [--hi 70] [--spill 20]\n' +
  '  check passes when >= 5% of pixels and >= 25% of border pixels are fully transparent; see the header.';
const [cmd, ...argv] = process.argv.slice(2);
if (!['check', 'key'].includes(cmd)) fail(USAGE);
const pos = [], opts = { lo: 20, hi: 70, spill: 20 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { pos.push(a); continue; }
  const name = a.slice(2);
  if (cmd !== 'key' || !(name in opts)) fail(`unknown option ${a}\n${USAGE}`);
  const raw = argv[++i];
  if (raw === undefined || raw.startsWith('--')) fail(`${a} needs a value\n${USAGE}`);
  const v = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(v) || v < 0 || v > 255) fail(`${a} ${raw}: expected a number from 0 to 255\n${USAGE}`);
  opts[name] = v;
}
if (pos.length !== (cmd === 'key' ? 2 : 1)) fail(USAGE);
if (opts.lo >= opts.hi) fail(`--lo ${opts.lo} must be below --hi ${opts.hi}\n${USAGE}`);
const [inPath, outPath] = pos;
let buf;
try { buf = readFileSync(inPath); } catch (e) { fail(`cannot read ${inPath}: ${e.code === 'ENOENT' ? 'no such file' : e.code || e.message}`); }
if (cmd === 'key') {
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  const same = () => { const a = statSync(inPath), b = statSync(outPath); return a.dev === b.dev && a.ino === b.ino; };
  if (resolve(outPath) === resolve(inPath) || existsSync(outPath) && (real(outPath) === real(inPath) || same())) {
    fail('refused: <out.png> is the same file as <in.png> (same path, symlink or hard link); write to a new path');
  }
}
let img;
try { img = decode(buf); } catch (e) { fail(`cannot decode ${inPath}: ${e.message}`); }
const n = img.w * img.h, d = img.rgba;

if (cmd === 'check') {
  let clear = 0, partial = 0, border = 0, borderClear = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const a = d[(y * img.w + x) * 4 + 3];
    if (a === 0) clear++; else if (a < 255) partial++;
    if (x === 0 || y === 0 || x === img.w - 1 || y === img.h - 1) { border++; if (a === 0) borderClear++; }
  }
  const pct = (v, of = n) => +(100 * v / of).toFixed(2);
  const res = { file: inPath, w: img.w, h: img.h, transparentPct: pct(clear), partialPct: pct(partial),
    opaquePct: pct(n - clear - partial), borderTransparentPct: pct(borderClear, border) };
  console.log(JSON.stringify(res));
  if (clear < n * 0.05 || borderClear < border * 0.25) {
    console.log('FAIL: not a cut-out — under 5% fully transparent pixels or under 25% of the border transparent. ' +
      'The background is probably painted. Regenerate on flat magenta and key it.');
    process.exit(1);
  }
  console.log('OK: the image has real alpha around the subject.');
  process.exit(0);
}

const { lo, hi, spill } = opts;
let keyed = 0, edge = 0, despilled = 0;
for (let o = 0; o < d.length; o += 4) {
  const r = d[o], g = d[o + 1], b = d[o + 2], score = Math.min(r, b) - g;
  if (score >= hi) { d[o + 3] = 0; keyed++; continue; }
  if (score > lo) { d[o + 3] = Math.round(d[o + 3] * (hi - score) / (hi - lo)); edge++; }
  if (score > 0) { d[o] = Math.min(r, g + spill); d[o + 2] = Math.min(b, g + spill); despilled++; }
}
const pct = (v) => +(100 * v / n).toFixed(2);
const ok = keyed >= n * 0.05;
console.log(JSON.stringify({ in: inPath, out: ok ? outPath : null, w: img.w, h: img.h, keyedPct: pct(keyed), edgePct: pct(edge), despilledPct: pct(despilled) }));
if (!ok) { console.log('FAIL: under 5% keyed — no flat magenta plate found; nothing written. Check the prompt asked for one.'); process.exit(1); }
// Temp file in the same directory, then rename: a crash never leaves a half-written <out.png>.
const tmp = join(dirname(resolve(outPath)), `.${basename(outPath)}.${process.pid}.tmp`);
try { writeFileSync(tmp, encode(img), { flag: 'wx' }); renameSync(tmp, outPath); }
catch (e) { try { unlinkSync(tmp); } catch { /* never created */ } fail(`cannot write ${outPath}: ${e.code || e.message}`); }
console.log('OK: keyed. Look at the result on a flat colour, not only its alpha: a wrong despill passes every alpha check.');
