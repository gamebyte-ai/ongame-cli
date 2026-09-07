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
import crypto from 'node:crypto';
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
/** A tiny file may DECLARE an enormous image. Refuse before allocating, and cap the inflate: this
 *  decoder reads externally acquired reference material, so a hostile or corrupt header must cost
 *  a rejection, not the process. 80 MPx covers any real screenshot family by a wide margin. */
const MAX_PIXELS = 80e6;
/** and a cap on the FILE, checked by stat before a byte is read: the pixel limit above cannot help if
 *  the process has already died reading a multi-gigabyte file into a Buffer. The largest evidence file
 *  in the corpus this was built for is under 2 MB. */
const MAX_BYTES = 64 * 1024 * 1024;
const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

export function decodePng(buf) {
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  let idatBytes = 0;
  let pal = null, trns = null;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    // A declared length that runs past the end of the file used to hand a short subarray to a reader
    // that assumed it was whole, and the RangeError escaped as a crash instead of a typed refusal.
    if (len > buf.length || p + 12 + len > buf.length) {
      throw new UnsupportedEvidence(`PNG chunk at byte ${p} declares ${len} bytes, past the end of a ${buf.length}-byte file`);
    }
    const type = buf.subarray(p + 4, p + 8).toString('ascii');
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      if (len !== 13) throw new UnsupportedEvidence(`PNG IHDR must be 13 bytes, declares ${len}`);
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'PLTE') pal = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') {
      idatBytes += len;
      if (idatBytes > MAX_BYTES) throw new UnsupportedEvidence(`PNG image data exceeds ${MAX_BYTES} bytes before decompression`);
      idat.push(Buffer.from(data));
    }
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!w || !h) throw new UnsupportedEvidence('PNG has no IHDR');
  if (interlace) throw new UnsupportedEvidence('interlaced (Adam7) PNG is not decoded');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new UnsupportedEvidence(`PNG colour type ${ctype} not supported`);
  if (!DEPTHS[ctype].includes(depth)) {
    throw new UnsupportedEvidence(`PNG bit depth ${depth} is not legal for colour type ${ctype}`);
  }
  // Sub-byte GREYSCALE is legal PNG, and this decoder has no path for it: the pixel loop below only
  // handles 8 and 16 bits outside the palette case, so a 1-bit greyscale image would read the packed
  // byte for the first pixel and `undefined` — which lands as BLACK — for the rest, then report it as
  // measured. Refusing is the honest answer; unpacking it would be a new capability.
  if (ctype !== 3 && depth < 8) {
    throw new UnsupportedEvidence(`${depth}-bit sub-byte greyscale PNG is not decoded here (it would read as invented black)`);
  }
  if (w * h > MAX_PIXELS) {
    throw new UnsupportedEvidence(`PNG declares ${w}x${h} = ${Math.round(w * h / 1e6)} MPx, over the ${MAX_PIXELS / 1e6} MPx limit — refused before allocating`);
  }
  if (ctype === 3 && !pal) throw new UnsupportedEvidence('indexed PNG carries no PLTE palette');
  const bpp = Math.max(1, Math.ceil(channels * depth / 8));
  const stride = Math.ceil(channels * depth * w / 8);
  const expected = h * (1 + stride);
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: expected + 1024 }); }
  catch (e) { throw new UnsupportedEvidence(`PNG image data did not inflate within its declared size: ${e.message}`); }
  // A zlib stream can be perfectly valid and still stop mid-image. Reading past it yields `undefined`,
  // which lands in a Uint8Array as ZERO — a measurement over fabricated black pixels, reported as VALID.
  if (raw.length < expected) {
    throw new UnsupportedEvidence(`PNG image data is truncated: expected ${expected} bytes for ${w}x${h}, inflated ${raw.length}`);
  }
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
        // A short PLTE would otherwise decode out-of-range indexes as black and report it as measured.
        if ((idx + 1) * 3 > pal.length) {
          throw new UnsupportedEvidence(`indexed PNG uses palette index ${idx} but PLTE holds only ${Math.floor(pal.length / 3)} entries`);
        }
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
  // Alpha is deliberately not carried: every primitive here measures colour and geometry of what is
  // DRAWN, and no caller composites. But that has to be visible, or a caller reads the RGB of a fully
  // transparent pixel as visual evidence — so it is reported rather than silently dropped.
  return { w, h, rgb: out, hasAlpha: ctype === 4 || ctype === 6 || !!trns };
}

const CACHE = path.join(os.tmpdir(), 'ongame-measure-cache');
/** Keyed by CONTENT. It used to be basename + size + floored mtime, and two different files sharing
 *  those three reused the first one's decoded PNG: a measurement from the wrong image while the
 *  provenance named the right one — and an opaque cache entry would have slipped past the alpha
 *  abstention. Reproduced with two different colours that returned the same hex. */
function transcodeToPng(file, buf) {
  fs.mkdirSync(CACHE, { recursive: true });
  const digest = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 40);
  const out = path.join(CACHE, `${digest}.png`);
  const marker = out + '.tool';
  if (fs.existsSync(out)) return { png: out, tool: fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : 'cached' };
  const tries = [['sips', ['-s', 'format', 'png', file, '--out', out]],
                 ['ffmpeg', ['-loglevel', 'error', '-y', '-i', file, out]]];
  for (const [bin, args] of tries) {
    try {
      execFileSync(bin, args, { stdio: 'ignore' });
      if (fs.existsSync(out)) {
        if (fs.statSync(out).size > MAX_BYTES) {
          fs.rmSync(out, { force: true });
          throw new UnsupportedEvidence(`the transcode of ${path.basename(file)} came back over ${MAX_BYTES} bytes`);
        }
        fs.writeFileSync(marker, bin); return { png: out, tool: bin };
      }
    } catch { /* try the next one */ }
  }
  throw new UnsupportedEvidence(
    `${path.basename(file)} is lossy and no transcoder was found (looked for sips, ffmpeg). ` +
    `A measurement layer must not guess at evidence it cannot read.`);
}

/** decode(file) -> {w, h, rgb, codec, lossless, file}. Throws UnsupportedEvidence. */
export function decode(file) {
  const abs = file.startsWith('~') ? path.join(os.homedir(), file.slice(1)) : path.resolve(file);
  if (!fs.existsSync(abs)) throw new UnsupportedEvidence(`evidence file does not exist: ${abs}`);
  const size = fs.statSync(abs).size;
  if (size > MAX_BYTES) {
    throw new UnsupportedEvidence(`${path.basename(abs)} is ${Math.round(size / 1e6)} MB, over the ${MAX_BYTES / 1e6} MB evidence limit — refused on its size, before being read`);
  }
  const buf = fs.readFileSync(abs);
  const codec = codecOf(buf);
  if (codec === 'PNG') {
    const d = decodePng(buf);
    return { ...d, codec, lossless: true, file: abs, bytes: buf.length,
             decode: { path: 'native-png', transcoded: false, tool: null, alpha_discarded: d.hasAlpha } };
  }
  if (codec === 'UNKNOWN') throw new UnsupportedEvidence(`unrecognised evidence format: ${path.basename(abs)}`);
  const { png, tool } = transcodeToPng(abs, buf);
  // The ORIGINAL codec is what the measurement is about. Being handed PNG bytes internally does not
  // make a JPEG lossless, and the tolerance downstream is derived from `codec`, never from what the
  // decoder happened to produce. The transcode is recorded so a reader can tell the two apart.
  const d = decodePng(fs.readFileSync(png));
  return { ...d, codec, lossless: false, file: abs, bytes: fs.statSync(abs).size,
           decode: { path: 'transcoded-to-png', transcoded: true, tool, cache: png, alpha_discarded: d.hasAlpha } };
}
