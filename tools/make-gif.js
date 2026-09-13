#!/usr/bin/env node
/**
 * make-gif.js — the showcase house as an animated GIF, with no dependencies.
 *
 *   node tools/make-gif.js                 docs/frames/*.svg -> docs/showcase.gif
 *   node tools/make-gif.js --width 900     a different frame width
 *   node tools/make-gif.js --delay 90      hundredths of a second per frame
 *
 * ## Why write an encoder
 *
 * A GIF is the one moving format that plays everywhere it matters — a GitHub
 * README, a forum post, a Discord message, a Reddit thread — without a player,
 * a plugin or a codec argument. The animated SVG next to it is sharper and
 * smaller and will not render in any of those places.
 *
 * There is no image encoder in Node's standard library and this project takes
 * no runtime dependencies, so the pipeline is built out of what is already
 * here: the browser on the machine rasterises each frame (see rasterize.js),
 * `zlib` — which IS in the standard library — inflates the PNGs, and the GIF
 * itself is LZW, which is fifty lines once you have the bit packing right.
 *
 * ## The three parts that are easy to get subtly wrong
 *
 * 1. PNG unfiltering. Each scanline names one of five filters and is decoded
 *    against the *reconstructed* bytes of the line above, not the raw ones.
 * 2. The palette. One GLOBAL table shared by every frame, built from all of
 *    them together — a per-frame palette makes flat areas shimmer between
 *    frames, which on a floor plan looks like the whole drawing is breathing.
 * 3. LZW code width. Codes are emitted least-significant-bit first, and the
 *    width grows when the NEXT code to be assigned would no longer fit. Off by
 *    one in either direction produces a file that some decoders open and others
 *    reject, which is the worst possible failure mode.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const FRAME_DIR = path.join(ROOT, 'docs', 'frames');
const OUT = path.join(ROOT, 'docs', 'showcase.gif');
const { rasterize } = require('./rasterize.js');

/* ------------------------------------------------------------- PNG decode */

/* Returns { width, height, rgba } for the 8-bit truecolour PNGs a browser
 * writes. Palette, greyscale, 16-bit and interlaced images are refused rather
 * than half-handled: nothing in this pipeline produces them, and a decoder that
 * silently mangles an input it does not understand is worse than one that stops. */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error(`${path.basename(file)} is not a PNG`);
  }
  let pos = 8;
  let width = 0; let height = 0; let colorType = -1; let bitDepth = 0; let interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;                                  // len + type + data + CRC
  }
  if (bitDepth !== 8) throw new Error(`${path.basename(file)}: only 8-bit PNG is supported (got ${bitDepth})`);
  if (colorType !== 6 && colorType !== 2) throw new Error(`${path.basename(file)}: only truecolour PNG is supported (got colour type ${colorType})`);
  if (interlace) throw new Error(`${path.basename(file)}: interlaced PNG is not supported`);

  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);                    // the line above, reconstructed
  let rp = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = Buffer.from(raw.subarray(rp, rp + stride));
    rp += stride;
    /* Unfilter in place. `a` is the pixel to the left, `b` the one above, `c`
     * the one above-left — all from RECONSTRUCTED data. */
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      line[i] = v & 0xff;
    }
    prev = line;
    for (let x = 0; x < width; x++) {
      const s = x * channels; const d = (y * width + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
      out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
  }
  return { width, height, rgba: out };
}

/* --------------------------------------------------------------- palette */

/* Median cut over the colours of every frame at once.
 *
 * Flat vector art needs far fewer than 256 colours, but the ones it does need
 * are exact — a floor finish that shifts by one step between frames reads as a
 * flicker across the whole room. Splitting the box with the widest channel at
 * its median keeps the crowded parts of the colour space (the warm greys and
 * the timber tones, here) finely divided and spends nothing on the empty parts.
 */
function buildPalette(frames, maxColours) {
  const samples = [];
  for (const f of frames) {
    /* Every 7th pixel. A 900x685 frame is 616k pixels and the histogram of a
     * drawing this flat is fully described by a fraction of them. */
    for (let i = 0; i < f.rgba.length; i += 4 * 7) {
      samples.push([f.rgba[i], f.rgba[i + 1], f.rgba[i + 2]]);
    }
  }
  let boxes = [samples];
  while (boxes.length < maxColours) {
    /* Split the box with the largest spread on any one channel. A box of a
     * single colour cannot be split, so stop when none can. */
    let bestIdx = -1; let bestSpread = 0; let bestCh = 0;
    boxes.forEach((box, idx) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255; let hi = 0;
        for (const c of box) { if (c[ch] < lo) lo = c[ch]; if (c[ch] > hi) hi = c[ch]; }
        if (hi - lo > bestSpread) { bestSpread = hi - lo; bestIdx = idx; bestCh = ch; }
      }
    });
    if (bestIdx < 0 || bestSpread === 0) break;
    const box = boxes[bestIdx];
    box.sort((p, q) => p[bestCh] - q[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
  }
  const palette = boxes.filter((b) => b.length).map((box) => {
    let r = 0; let g = 0; let b = 0;
    for (const c of box) { r += c[0]; g += c[1]; b += c[2]; }
    return [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
  });
  /* A GIF colour table is a power of two. */
  let size = 2;
  while (size < palette.length) size <<= 1;
  while (palette.length < size) palette.push([0, 0, 0]);
  return palette;
}

/* Nearest palette entry, cached on the top 5 bits of each channel. Without the
 * cache this is 256 comparisons per pixel and the whole job takes minutes. */
function makeMapper(palette) {
  const cache = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key];
    if (hit >= 0) return hit;
    let best = 0; let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const dr = r - p[0]; const dg = g - p[1]; const db = b - p[2];
      /* Weighted to how the eye actually works; an unweighted distance sends
       * warm greys to the nearest blue-grey and the whole plan goes cold. */
      const d = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
      if (d < bestD) { bestD = d; best = i; }
    }
    cache[key] = best;
    return best;
  };
}

/* ------------------------------------------------------------ GIF writer */

class BitWriter {
  constructor() { this.out = []; this.cur = 0; this.bits = 0; }
  /* GIF packs codes least-significant-bit first, across byte boundaries. */
  write(code, size) {
    this.cur |= code << this.bits;
    this.bits += size;
    while (this.bits >= 8) {
      this.out.push(this.cur & 0xff);
      this.cur >>= 8;
      this.bits -= 8;
    }
  }
  flush() { if (this.bits > 0) { this.out.push(this.cur & 0xff); this.cur = 0; this.bits = 0; } }
}

function lzwCompress(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const w = new BitWriter();
  let codeSize = minCodeSize + 1;
  let next = clear + 2;
  let dict = new Map();
  w.write(clear, codeSize);
  let cur = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (cur << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) { cur = found; continue; }
    w.write(cur, codeSize);
    dict.set(key, next++);
    /* Grow when the next code to be ASSIGNED would not fit in the current
     * width. The largest code we can still emit is `next - 1`, so the test is
     * on `next` itself. */
    if (next > (1 << codeSize)) {
      if (codeSize < 12) codeSize++;
      else {
        w.write(clear, codeSize);
        dict = new Map();
        codeSize = minCodeSize + 1;
        next = clear + 2;
      }
    }
    cur = k;
  }
  w.write(cur, codeSize);
  w.write(eoi, codeSize);
  w.flush();
  return w.out;
}

/* Data sub-blocks: at most 255 bytes each, length-prefixed, zero-terminated.
 *
 * Returns a Buffer rather than an array of bytes, and the caller appends it
 * whole. The first version spread the bytes into `push(...)`, which is a
 * function call with two million arguments and dies with "Maximum call stack
 * size exceeded" — on the LAST step of the pipeline, after every frame had
 * already been rasterised and quantised. */
function subBlocks(bytes) {
  const blocks = Math.ceil(bytes.length / 255);
  const out = Buffer.alloc(bytes.length + blocks + 1);
  let w = 0;
  for (let i = 0; i < bytes.length; i += 255) {
    const n = Math.min(255, bytes.length - i);
    out[w++] = n;
    for (let j = 0; j < n; j++) out[w++] = bytes[i + j];
  }
  out[w++] = 0;
  return out.subarray(0, w);
}

function encodeGif(frames, palette, delayCs) {
  const { width, height } = frames[0];
  const bits = Math.max(1, Math.ceil(Math.log2(palette.length)));
  const parts = [];
  let head = [];
  const push = (...b) => { for (const v of b) head.push(v); };
  const u16 = (v) => push(v & 0xff, (v >> 8) & 0xff);
  const seal = () => { if (head.length) { parts.push(Buffer.from(head)); head = []; } };

  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);   // "GIF89a"
  u16(width); u16(height);
  push(0x80 | (bits - 1));                    // global table present, its size
  push(0, 0);                                 // background index, pixel aspect
  for (const c of palette) push(c[0], c[1], c[2]);

  /* Netscape application extension: loop forever. Without it the animation
   * plays exactly once, which on a five-second loop looks like a broken image. */
  push(0x21, 0xff, 0x0b);
  for (const ch of 'NETSCAPE2.0') push(ch.charCodeAt(0));
  push(0x03, 0x01, 0x00, 0x00, 0x00);

  for (const f of frames) {
    push(0x21, 0xf9, 0x04);                   // graphic control extension
    push(0x04);                               // no transparency, restore to bg
    u16(delayCs);
    push(0x00, 0x00);                         // transparent index, terminator
    push(0x2c);                               // image descriptor
    u16(0); u16(0); u16(width); u16(height);
    push(0x00);                               // no local table, not interlaced
    const min = Math.max(2, bits);
    push(min);
    seal();
    parts.push(subBlocks(lzwCompress(f.indices, min)));
  }
  push(0x3b);                                 // trailer
  seal();
  return Buffer.concat(parts);
}

/* ------------------------------------------------------------------ main */

function main() {
  const argv = process.argv.slice(2);
  const arg = (name, dflt) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
  };
  const width = arg('width', 900);
  const delay = arg('delay', 110);
  const colours = arg('colours', 256);

  /* The frames are build output and are gitignored, so on a fresh clone they
   * are simply not there. Write them rather than failing with a missing-file
   * error that the reader then has to translate into a second command. */
  const indexFile = path.join(FRAME_DIR, 'index.json');
  if (!fs.existsSync(indexFile)) {
    console.log('no frames yet — rendering them first');
    require('child_process').execFileSync(process.execPath,
      [path.join(__dirname, 'make-showcase.js'), '--frames'], { stdio: 'inherit' });
  }
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const height = Math.round(width * (index[0].height / index[0].width));
  const work = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fps-gif-'));
  console.log(`${index.length} frames at ${width}x${height}, ${delay / 100}s each`);

  const decoded = [];
  try {
    for (const f of index) {
      const png = path.join(work, f.name.replace(/\.svg$/, '.png'));
      rasterize(path.join(FRAME_DIR, f.name), png, width, height);
      const img = decodePng(png);
      decoded.push(img);
      console.log(`  ${f.name}  ${f.label.padEnd(9)} -> ${img.width}x${img.height}`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  const palette = buildPalette(decoded, colours);
  const map = makeMapper(palette);
  console.log(`palette: ${palette.length} colours`);

  const frames = decoded.map((img) => {
    const indices = new Uint8Array(img.width * img.height);
    for (let p = 0, i = 0; i < img.rgba.length; i += 4, p++) {
      indices[p] = map(img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]);
    }
    return { width: img.width, height: img.height, indices };
  });

  const gif = encodeGif(frames, palette, delay);
  fs.writeFileSync(OUT, gif);
  console.log(`\n${OUT}  ${(gif.length / 1024).toFixed(0)} KB`);
}

module.exports = { decodePng, buildPalette, encodeGif, lzwCompress };

if (require.main === module) main();
