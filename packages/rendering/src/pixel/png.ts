/**
 * A PNG encoder, so a sprite is a file rather than a browser-only object.
 *
 * The browser can already encode PNGs — that is what `canvas.toDataURL` does —
 * but the gallery tool, the tests and any future asset export all run in Node,
 * where there is no canvas. Written out rather than pulled in: an encoder for
 * indexed, non-interlaced PNG with stored deflate blocks is about eighty lines,
 * and the alternative is a dependency in a package whose whole point is that it
 * has none.
 *
 * Stored (uncompressed) deflate blocks rather than real compression: a 96x96
 * indexed image is nine kilobytes before compression, these are development and
 * export artefacts rather than shipped assets, and a correct encoder beats a
 * clever one.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Deflate with stored blocks — valid zlib, no compression. */
function zlibStored(data: Uint8Array): Uint8Array {
  const MAX = 65535;
  const blocks = Math.max(1, Math.ceil(data.length / MAX));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  for (let i = 0; i < blocks; i++) {
    const from = i * MAX;
    const size = Math.min(MAX, data.length - from);
    out[at++] = i === blocks - 1 ? 1 : 0;
    out[at++] = size & 0xff;
    out[at++] = (size >> 8) & 0xff;
    out[at++] = ~size & 0xff;
    out[at++] = (~size >> 8) & 0xff;
    out.set(data.subarray(from, from + size), at);
    at += size;
  }
  new DataView(out.buffer).setUint32(at, adler32(data));
  return out;
}

/** `#rrggbb`, `#rgb` or `#rrggbbaa` to bytes. */
function parseHex(hex: string): readonly [number, number, number, number] {
  const value = hex.replace("#", "");
  if (value.length === 8) {
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
      parseInt(value.slice(6, 8), 16),
    ];
  }
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), 255];
}

export interface IndexedImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly palette: readonly string[];
}

/**
 * An indexed PNG, optionally at an integer zoom.
 *
 * Zoom happens here rather than in CSS so an exported sprite is crisp wherever
 * it lands. Nearest-neighbour by construction — every source pixel becomes an
 * exact square of destination pixels, which is the only correct way to scale
 * pixel art.
 */
export function encodePng(image: IndexedImage, zoom = 1): Uint8Array {
  const width = image.width * zoom;
  const height = image.height * zoom;
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 3; // colour type: indexed
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const entries = image.palette.map(parseHex);
  const plte = new Uint8Array(entries.length * 3);
  const trns = new Uint8Array(entries.length);
  entries.forEach((rgba, i) => {
    plte[i * 3] = rgba[0];
    plte[i * 3 + 1] = rgba[1];
    plte[i * 3 + 2] = rgba[2];
    // Index 0 is the sprite's transparent slot by construction.
    trns[i] = i === 0 ? 0 : rgba[3];
  });

  // One filter byte per row, filter type 0: the rows are palette indices, and
  // no PNG filter helps an indexed image that is about to be stored anyway.
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width + 1);
    raw[rowStart] = 0;
    const sourceRow = Math.floor(y / zoom) * image.width;
    for (let x = 0; x < width; x++) {
      raw[rowStart + 1 + x] = image.pixels[sourceRow + Math.floor(x / zoom)] as number;
    }
  }

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", plte),
    chunk("tRNS", trns),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}

/** The same bytes as a `data:` URL, for dropping straight into an `<img>`. */
export function pngDataUrl(image: IndexedImage, zoom = 1): string {
  const bytes = encodePng(image, zoom);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return `data:image/png;base64,${base64}`;
}

/**
 * Sprite pixels as RGBA, ready for `ctx.putImageData`.
 *
 * The browser has no use for a PNG here: encoding one and base64-ing it cost
 * more than drawing the whole animal, and then the browser decoded it straight
 * back to exactly this. PNG stays for anything that has to leave the page —
 * a file, an export, a test fixture.
 */
export function toRgba(image: IndexedImage): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(image.width * image.height * 4);
  const table = image.palette.map(parseHex);
  for (let i = 0; i < image.pixels.length; i++) {
    const index = image.pixels[i] as number;
    if (index === 0) continue;
    const colour = table[index];
    if (!colour) continue;
    const at = i * 4;
    rgba[at] = colour[0];
    rgba[at + 1] = colour[1];
    rgba[at + 2] = colour[2];
    rgba[at + 3] = colour[3];
  }
  return rgba;
}
