/**
 * Evidence decoder — zero dependency.
 *
 * PNG is decoded here (node's zlib is all it takes), because that is where an EXACT claim can live:
 * a lossless fill measures to the byte. Lossy evidence is transcoded with a tool the pipeline
 * already leans on, and when none is present the caller gets UNSUPPORTED_EVIDENCE rather than a
 * number — a measurement layer that guesses at a codec it cannot read is worse than one that stops.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

export class UnsupportedEvidence extends Error {}

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function codecOf(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'PNG';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'JPEG';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'WEBP';
  return 'UNKNOWN';
}
export const LOSSLESS = new Set(['PNG']);

/** Decode a PNG into {w, h, rgb} where rgb is a Uint8Array of 3 bytes per pixel. */
export function decodePng(buf) {
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  let pal = null, trns = null;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString('ascii');
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'PLTE') pal = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!w || !h) throw new UnsupportedEvidence('PNG has no IHDR');
  if (interlace) throw new UnsupportedEvidence('interlaced (Adam7) PNG is not decoded');
  if (![8, 16].includes(depth) && ctype !== 3) throw new UnsupportedEvidence(`PNG bit depth ${depth} not supported`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new UnsupportedEvidence(`PNG colour type ${ctype} not supported`);
  const bpp = Math.max(1, Math.ceil(channels * depth / 8));
  const stride = Math.ceil(channels * depth * w / 8);
  const out = new Uint8Array(w * h * 3);
  let prev = Buffer.alloc(stride);
  let off = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[off++];
    const line = Buffer.from(raw.subarray(off, off + stride)); off += stride;
    for (let i = 0; i < stride; i++) {                       // unfilter, per the spec
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      if (ft === 1) line[i] = (line[i] + a) & 255;
      else if (ft === 2) line[i] = (line[i] + b) & 255;
      else if (ft === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else if (ft !== 0) throw new UnsupportedEvidence(`PNG filter ${ft} not supported`);
    }
    for (let x = 0; x < w; x++) {
      let r, g, bl;
      if (ctype === 3) {
        const bits = depth, idx = depth === 8 ? line[x]
          : (line[Math.floor(x * bits / 8)] >> (8 - bits - (x * bits) % 8)) & ((1 << bits) - 1);
        r = pal[idx * 3]; g = pal[idx * 3 + 1]; bl = pal[idx * 3 + 2];
      } else if (depth === 8) {
        const o = x * channels;
        if (channels === 1 || channels === 2) r = g = bl = line[o];
        else { r = line[o]; g = line[o + 1]; bl = line[o + 2]; }
      } else {                                               // 16-bit: take the high byte
        const o = x * channels * 2;
        if (channels === 1 || channels === 2) r = g = bl = line[o];
        else { r = line[o]; g = line[o + 2]; bl = line[o + 4]; }
      }
      const q = (y * w + x) * 3;
      out[q] = r; out[q + 1] = g; out[q + 2] = bl;
    }
    prev = line;
  }
  return { w, h, rgb: out };
}

const CACHE = path.join(os.tmpdir(), 'ongame-measure-cache');
function transcodeToPng(file) {
  fs.mkdirSync(CACHE, { recursive: true });
  const st = fs.statSync(file);
  const out = path.join(CACHE, `${path.basename(file)}.${st.size}.${Math.floor(st.mtimeMs)}.png`);
  if (fs.existsSync(out)) return out;
  const tries = [['sips', ['-s', 'format', 'png', file, '--out', out]],
                 ['ffmpeg', ['-loglevel', 'error', '-y', '-i', file, out]]];
  for (const [bin, args] of tries) {
    try { execFileSync(bin, args, { stdio: 'ignore' }); if (fs.existsSync(out)) return out; }
    catch { /* try the next one */ }
  }
  throw new UnsupportedEvidence(
    `${path.basename(file)} is lossy and no transcoder was found (looked for sips, ffmpeg). ` +
    `A measurement layer must not guess at evidence it cannot read.`);
}

/** decode(file) -> {w, h, rgb, codec, lossless, file}. Throws UnsupportedEvidence. */
export function decode(file) {
  const abs = file.startsWith('~') ? path.join(os.homedir(), file.slice(1)) : path.resolve(file);
  if (!fs.existsSync(abs)) throw new UnsupportedEvidence(`evidence file does not exist: ${abs}`);
  const buf = fs.readFileSync(abs);
  const codec = codecOf(buf);
  if (codec === 'PNG') return { ...decodePng(buf), codec, lossless: true, file: abs };
  if (codec === 'UNKNOWN') throw new UnsupportedEvidence(`unrecognised evidence format: ${path.basename(abs)}`);
  const png = transcodeToPng(abs);
  return { ...decodePng(fs.readFileSync(png)), codec, lossless: false, file: abs, via: png };
}
