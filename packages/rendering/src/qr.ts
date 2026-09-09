/**
 * A QR encoder, written here rather than pulled in (§8.1).
 *
 * §8 asks for "a short shareable string and a QR code" as a v1 primitive. The
 * string existed already; this is the picture of it. It is written from the
 * specification rather than taken from a package because the whole project has
 * one runtime dependency budget — zero — and because a QR code is a fixed,
 * finished, forty-year-old format with no maintenance surface: there is nothing
 * to keep up with, and a test can verify it against known-good output.
 *
 * Scope is deliberately narrow, to the smallest thing that encodes a genome
 * code correctly:
 *
 *  - **Byte mode only.** Genome codes are base32 and stud offers are ASCII, and
 *    alphanumeric mode would only save space on the former.
 *  - **Error correction level M**, 15% recovery, which is the level everything
 *    else uses for a reason: enough to survive a phone camera and a fingerprint.
 *  - **Versions 1 to 20**, which reaches 858 bytes at level M — comfortably past
 *    the ~145 characters a stud offer runs to.
 *
 * What comes out is a boolean grid. Drawing it is the caller's problem, which
 * keeps this file free of anything that knows what an SVG is.
 */

export interface QrCode {
  /** Modules per side, including the quiet zone if `quiet` was requested. */
  readonly size: number;
  /** Row-major. `true` is dark. */
  readonly modules: readonly boolean[];
  readonly version: number;
}

export interface QrOptions {
  /** Modules of clear space on every side. The spec says 4; 0 is for tests. */
  readonly quiet?: number;
  /** Force a version rather than picking the smallest that fits. */
  readonly version?: number;
}

const MAX_VERSION = 20;

/**
 * Total codewords by version.
 *
 * The closed form for the module budget is derivable, and deriving it is how
 * you get a QR encoder that is subtly wrong at exactly one version. The spec
 * ships the table; this is the table.
 */
const TOTAL_CODEWORDS: readonly number[] = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
];

/**
 * At EC level M, per version: error-correction codewords per block, and how
 * many blocks there are.
 *
 * Only these two numbers are authored. Data capacity and the short/long block
 * split are *derived* from them — the first draft transcribed all four from a
 * table, got the capacity column two low at every version, and every code it
 * produced failed its own Reed-Solomon syndromes. Two numbers can be checked by
 * hand; four cannot.
 */
const EC_M: readonly (readonly [ec: number, blocks: number])[] = [
  [0, 0], [10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5],
  [30, 5], [22, 8], [22, 9], [24, 9], [24, 10], [28, 10], [28, 11], [26, 13], [26, 14], [26, 16],
];

/** Data codewords available at this version, level M. */
function dataCapacity(version: number): number {
  const [ec, blocks] = EC_M[version] as readonly [number, number];
  return (TOTAL_CODEWORDS[version] ?? 0) - ec * blocks;
}

/**
 * How the data codewords split across blocks.
 *
 * The spec expresses this as two groups; it is simpler and less error-prone to
 * derive it: every block holds at least `floor(data / blocks)`, and the
 * remainder is spread one each over the blocks at the end.
 */
function blockLengths(version: number): number[] {
  const [, blocks] = EC_M[version] as readonly [number, number];
  const data = dataCapacity(version);
  const short = Math.floor(data / blocks);
  const long = data - short * blocks;
  return Array.from({ length: blocks }, (_, i) => (i < blocks - long ? short : short + 1));
}

// ---------------------------------------------------------------------------
// Galois field arithmetic over GF(256), the Reed-Solomon substrate
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] as number;
})();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[(LOG[a] as number) + (LOG[b] as number)] as number;
}

/**
 * The Reed-Solomon generator polynomial of the given degree.
 *
 * `poly[0]` is the *leading* coefficient, matching how `remainder` divides. The
 * first draft built it constant-first, which produces the correct polynomial in
 * the wrong order — every code it made looked structurally perfect and failed
 * its own syndromes, which is exactly the failure a scanner would report as
 * "not a QR code".
 */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    // Multiply by (x + alpha^i).
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] ?? 0) ^ (poly[j] as number);
      next[j + 1] = (next[j + 1] ?? 0) ^ mul(poly[j] as number, EXP[i] as number);
    }
    poly = next;
  }
  return poly;
}

/**
 * Reed-Solomon error-correction codewords for one block.
 *
 * Exported so a test can check it against the specification's own worked
 * example rather than only against this file's inverse. A round-trip through a
 * decoder written by the same author proves self-consistency; a published
 * vector proves correctness.
 */
export function reedSolomon(data: readonly number[], degree: number): number[] {
  return remainder(data, degree);
}

function remainder(data: readonly number[], degree: number): number[] {
  const generator = generatorPoly(degree);
  const buffer = [...data, ...new Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = buffer[i] as number;
    if (factor === 0) continue;
    for (let j = 0; j < generator.length; j++) {
      buffer[i + j] = (buffer[i + j] as number) ^ mul(generator[j] as number, factor);
    }
  }
  return buffer.slice(data.length);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const last = version * 4 + 10;
  const step = version === 32 ? 26 : Math.ceil((last - 6) / (count - 1) / 2) * 2;
  const positions = [6];
  for (let i = count - 1; i > 0; i--) positions.push(last - (i - 1) * step);
  return positions;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function toBytes(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

function pickVersion(byteLength: number, forced?: number): number {
  if (forced !== undefined) return forced;
  for (let version = 1; version <= MAX_VERSION; version++) {
    // Four bits of mode plus eight or sixteen of length: two or three bytes of
    // header, rounded up.
    if (byteLength + (version >= 10 ? 3 : 2) <= dataCapacity(version)) return version;
  }
  throw new Error(`${byteLength} bytes is more than this encoder carries.`);
}

function buildData(text: string, version: number): number[] {
  const bytes = toBytes(text);
  const capacity = dataCapacity(version);
  const lengthBits = version >= 10 ? 16 : 8;

  const bits: number[] = [];
  const push = (value: number, count: number): void => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, lengthBits);
  for (const byte of bytes) push(byte, 8);

  const capacityBits = capacity * 8;
  if (bits.length > capacityBits) throw new Error("That is too long for the chosen version.");
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    codewords.push(byte);
  }
  // Alternating pad bytes, per the spec.
  const pads = [0xec, 0x11];
  let pad = 0;
  while (codewords.length < capacity) codewords.push(pads[pad++ % 2] as number);
  return codewords;
}

function interleave(data: readonly number[], version: number): number[] {
  const [ecPerBlock] = EC_M[version] as readonly [number, number];
  const lengths = blockLengths(version);

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let at = 0;
  for (const length of lengths) {
    const block = data.slice(at, at + length);
    at += length;
    dataBlocks.push(block);
    ecBlocks.push(remainder(block, ecPerBlock));
  }

  const out: number[] = [];
  const longest = Math.max(...dataBlocks.map((block) => block.length));
  for (let i = 0; i < longest; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i] as number);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) out.push(block[i] as number);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

interface Matrix {
  readonly size: number;
  readonly cells: (boolean | undefined)[];
}

function place(matrix: Matrix, x: number, y: number, dark: boolean): void {
  matrix.cells[y * matrix.size + x] = dark;
}

function at(matrix: Matrix, x: number, y: number): boolean | undefined {
  return matrix.cells[y * matrix.size + x];
}

function drawFunctionPatterns(matrix: Matrix, version: number): void {
  const size = matrix.size;
  const finder = (ox: number, oy: number): void => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const px = ox + x;
        const py = oy + y;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        place(matrix, px, py, ring !== 2 && ring <= 3);
      }
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);

  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    place(matrix, i, 6, dark);
    place(matrix, 6, i, dark);
  }

  const positions = alignmentPositions(version);
  for (const cy of positions) {
    for (const cx of positions) {
      // Never over a finder.
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          place(matrix, cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
        }
      }
    }
  }

  // The dark module, which is always dark and always here.
  place(matrix, 8, size - 8, true);

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      place(matrix, a, b, dark);
      place(matrix, b, a, dark);
    }
  }
}

/** The 18-bit version block: six data bits and a (18,6) BCH remainder. */
function versionBits(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  return (version << 12) | (remainder & 0xfff);
}

function reserveFormat(matrix: Matrix): void {
  const size = matrix.size;
  for (let i = 0; i < 9; i++) {
    if (at(matrix, i, 8) === undefined) place(matrix, i, 8, false);
    if (at(matrix, 8, i) === undefined) place(matrix, 8, i, false);
  }
  for (let i = 0; i < 8; i++) {
    if (at(matrix, size - 1 - i, 8) === undefined) place(matrix, size - 1 - i, 8, false);
    if (at(matrix, 8, size - 1 - i) === undefined) place(matrix, 8, size - 1 - i, false);
  }
}

function drawFormat(matrix: Matrix, mask: number): void {
  const size = matrix.size;
  // EC level M is 0b00 in the format bits.
  const data = (0b00 << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const format = (((data << 10) | (remainder & 0x3ff)) ^ 0x5412) & 0x7fff;

  for (let i = 0; i < 15; i++) {
    const dark = ((format >> i) & 1) === 1;
    if (i < 6) place(matrix, 8, i, dark);
    else if (i < 8) place(matrix, 8, i + 1, dark);
    else if (i === 8) place(matrix, 7, 8, dark);
    else place(matrix, 14 - i, 8, dark);

    if (i < 8) place(matrix, size - 1 - i, 8, dark);
    else place(matrix, 8, size - 15 + i, dark);
  }
}

function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function penalty(matrix: Matrix): number {
  const size = matrix.size;
  const dark = (x: number, y: number): boolean => at(matrix, x, y) === true;
  let score = 0;

  // Rule 1: runs of five or more.
  for (let a = 0; a < size; a++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        const current = horizontal ? dark(b, a) : dark(a, b);
        const previous = horizontal ? dark(b - 1, a) : dark(a, b - 1);
        if (current === previous) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Rule 2: 2x2 blocks.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const first = dark(x, y);
      if (first === dark(x + 1, y) && first === dark(x, y + 1) && first === dark(x + 1, y + 1)) score += 3;
    }
  }

  // Rule 3: finder-like patterns.
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const reversed = [...pattern].reverse();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (const shape of [pattern, reversed]) {
        if (x + shape.length <= size && shape.every((want, i) => dark(x + i, y) === want)) score += 40;
        if (y + shape.length <= size && shape.every((want, i) => dark(x, y + i) === want)) score += 40;
      }
    }
  }

  // Rule 4: overall balance.
  let darkCount = 0;
  for (let i = 0; i < size * size; i++) if (matrix.cells[i]) darkCount++;
  const percent = (darkCount * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

// ---------------------------------------------------------------------------
// The whole thing
// ---------------------------------------------------------------------------

export function encodeQr(text: string, options: QrOptions = {}): QrCode {
  const bytes = toBytes(text);
  const version = pickVersion(bytes.length, options.version);
  const size = version * 4 + 17;
  const codewords = interleave(buildData(text, version), version);

  let best: { matrix: Matrix; score: number } | undefined;
  for (let mask = 0; mask < 8; mask++) {
    const matrix: Matrix = { size, cells: new Array<boolean | undefined>(size * size).fill(undefined) };
    drawFunctionPatterns(matrix, version);
    reserveFormat(matrix);

    // Zig-zag, upward then downward, in column pairs from the right.
    //
    // The timing column is *stepped over*, not merely skipped: `right` itself
    // moves from 6 to 5 so that every later pair stays aligned. Computing a
    // shifted column without moving `right` visits column 4 twice and never
    // visits column 6's partner, which produces a matrix that looks correct and
    // decodes to noise.
    let bit = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let step = 0; step < size; step++) {
        const y = upward ? size - 1 - step : step;
        for (const x of [right, right - 1]) {
          if (at(matrix, x, y) !== undefined) continue;
          const byte = codewords[bit >> 3] ?? 0;
          const dark = ((byte >> (7 - (bit & 7))) & 1) === 1;
          place(matrix, x, y, dark !== maskAt(mask, x, y));
          bit++;
        }
      }
      upward = !upward;
    }

    drawFormat(matrix, mask);
    const score = penalty(matrix);
    if (!best || score < best.score) best = { matrix, score };
  }
  if (!best) throw new Error("no mask produced a matrix");

  const quiet = options.quiet ?? 4;
  const outSize = size + quiet * 2;
  const modules = new Array<boolean>(outSize * outSize).fill(false);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      modules[(y + quiet) * outSize + (x + quiet)] = best.matrix.cells[y * size + x] === true;
    }
  }
  return { size: outSize, modules, version };
}

/** The code as an SVG, in the journal's ink on the journal's paper. */
export function qrToSvg(
  code: QrCode,
  options: { readonly pixel?: number; readonly ink?: string; readonly paper?: string; readonly label?: string } = {},
): string {
  const pixel = options.pixel ?? 4;
  const ink = options.ink ?? "#241f1a";
  const paper = options.paper ?? "#f2ece0";
  const side = code.size * pixel;
  const rects: string[] = [];
  // One rect per run of dark modules rather than per module: a version 8 code
  // is 2,209 modules and 2,209 rects is a document nobody's browser enjoys.
  for (let y = 0; y < code.size; y++) {
    let run = 0;
    for (let x = 0; x <= code.size; x++) {
      const dark = x < code.size && code.modules[y * code.size + x] === true;
      if (dark) run++;
      else if (run > 0) {
        rects.push(`<rect x="${(x - run) * pixel}" y="${y * pixel}" width="${run * pixel}" height="${pixel}"/>`);
        run = 0;
      }
    }
  }
  const label = options.label ? `<title>${options.label.replace(/[<&>]/g, "")}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side}" height="${side}" ` +
    `role="img" aria-label="${(options.label ?? "QR code").replace(/[<&>"]/g, "")}" shape-rendering="crispEdges">` +
    `${label}<rect width="${side}" height="${side}" fill="${paper}"/>` +
    `<g fill="${ink}">${rects.join("")}</g></svg>`
  );
}
