/**
 * QR encoder tests.
 *
 * There is no decoder available offline to check the output against, so this
 * file contains one: the inverse of every step the encoder takes — unmask, read
 * the zig-zag, de-interleave, parse the byte-mode header — plus two checks the
 * inverse cannot fake. The Reed-Solomon syndromes must come out zero, which is
 * exactly what a real scanner computes before it trusts a block; and the format
 * information must survive its own BCH decode back to level M and the mask that
 * was used.
 *
 * A round-trip against a decoder written by the same author is weak evidence on
 * its own. A round-trip whose intermediate values satisfy the spec's own error
 * correction is not.
 */

import { describe, expect, it } from "vitest";
import { encodeQr, qrToSvg, reedSolomon } from "../src/qr.js";
import type { QrCode } from "../src/qr.js";

// ---------------------------------------------------------------------------
// A decoder, for testing only
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

const mul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : (EXP[(LOG[a] as number) + (LOG[b] as number)] as number);

const TOTAL_CODEWORDS = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
];
const EC_M: readonly (readonly [number, number])[] = [
  [0, 0], [10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5],
  [30, 5], [22, 8], [22, 9], [24, 9], [24, 10], [28, 10], [28, 11], [26, 13], [26, 14], [26, 16],
];

function blockLengths(version: number): number[] {
  const [ec, blocks] = EC_M[version] as readonly [number, number];
  const data = (TOTAL_CODEWORDS[version] ?? 0) - ec * blocks;
  const short = Math.floor(data / blocks);
  const long = data - short * blocks;
  return Array.from({ length: blocks }, (_, i) => (i < blocks - long ? short : short + 1));
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const last = version * 4 + 10;
  const step = Math.ceil((last - 6) / (count - 1) / 2) * 2;
  const positions = [6];
  for (let i = count - 1; i > 0; i--) positions.push(last - (i - 1) * step);
  return positions;
}

/** Which modules are function patterns, and therefore not data. */
function functionMask(version: number): boolean[] {
  const size = version * 4 + 17;
  const reserved = new Array<boolean>(size * size).fill(false);
  const set = (x: number, y: number): void => {
    if (x >= 0 && y >= 0 && x < size && y < size) reserved[y * size + x] = true;
  };
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) set(ox + x, oy + y);
  }
  for (let i = 0; i < size; i++) {
    set(i, 6);
    set(6, i);
  }
  const positions = alignmentPositions(version);
  for (const cy of positions) {
    for (const cx of positions) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(cx + x, cy + y);
    }
  }
  for (let i = 0; i < 9; i++) {
    set(i, 8);
    set(8, i);
  }
  for (let i = 0; i < 8; i++) {
    set(size - 1 - i, 8);
    set(8, size - 1 - i);
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      set(a, b);
      set(b, a);
    }
  }
  return reserved;
}

function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

interface Decoded {
  readonly text: string;
  readonly mask: number;
  readonly level: number;
  readonly blocks: readonly number[][];
}

function decodeQr(code: QrCode, quiet: number): Decoded {
  const size = code.version * 4 + 17;
  const dark = (x: number, y: number): boolean => code.modules[(y + quiet) * code.size + (x + quiet)] === true;

  // --- format information, and its BCH check
  let raw = 0;
  for (let i = 0; i < 15; i++) {
    const bit =
      i < 6 ? dark(8, i) : i < 8 ? dark(8, i + 1) : i === 8 ? dark(7, 8) : dark(14 - i, 8);
    if (bit) raw |= 1 << i;
  }
  const unmasked = raw ^ 0x5412;
  let residue = unmasked;
  for (let i = 0; i < 5; i++) {
    if (residue & (1 << (14 - i))) residue ^= 0x537 << (4 - i);
  }
  if (residue !== 0) throw new Error("format information failed its BCH check");
  const level = (unmasked >> 13) & 0b11;
  const mask = (unmasked >> 10) & 0b111;

  // --- data modules, in the zig-zag, unmasked
  const reserved = functionMask(code.version);
  const bits: number[] = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (reserved[y * size + x]) continue;
        bits.push(dark(x, y) !== maskAt(mask, x, y) ? 1 : 0);
      }
    }
    upward = !upward;
  }

  const stream: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    stream.push(byte);
  }

  // --- de-interleave
  const [ecPerBlock, blockCount] = EC_M[code.version] as readonly [number, number];
  const lengths = blockLengths(code.version);

  const dataBlocks: number[][] = lengths.map(() => []);
  let at = 0;
  for (let i = 0; i < Math.max(...lengths); i++) {
    for (let b = 0; b < blockCount; b++) {
      if (i < (lengths[b] as number)) (dataBlocks[b] as number[]).push(stream[at++] as number);
    }
  }
  const ecBlocks: number[][] = lengths.map(() => []);
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < blockCount; b++) (ecBlocks[b] as number[]).push(stream[at++] as number);
  }

  // --- syndromes: what a scanner computes before it trusts a block
  const blocks = dataBlocks.map((block, index) => [...block, ...(ecBlocks[index] as number[])]);
  for (const block of blocks) {
    for (let s = 0; s < ecPerBlock; s++) {
      let value = 0;
      for (const codeword of block) value = mul(value, EXP[s] as number) ^ codeword;
      if (value !== 0) throw new Error(`syndrome ${s} is non-zero: the error correction does not check out`);
    }
  }

  // --- byte mode payload
  const data = dataBlocks.flat();
  const readBits = (offset: number, count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const bit = ((data[(offset + i) >> 3] ?? 0) >> (7 - ((offset + i) & 7))) & 1;
      value = (value << 1) | bit;
    }
    return value;
  };
  const mode = readBits(0, 4);
  if (mode !== 0b0100) throw new Error(`expected byte mode, got ${mode.toString(2)}`);
  const lengthBits = code.version >= 10 ? 16 : 8;
  const length = readBits(4, lengthBits);
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) bytes.push(readBits(4 + lengthBits + i * 8, 8));
  return { text: new TextDecoder().decode(new Uint8Array(bytes)), mask, level, blocks };
}

// ---------------------------------------------------------------------------

describe("Reed-Solomon", () => {
  it("matches the specification's worked example", () => {
    // The standard version 1, level M example. Sixteen data codewords in, ten
    // error-correction codewords out. This is the one check in the file that
    // does not depend on any code written here.
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomon(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("produces codewords whose syndromes vanish", () => {
    for (const degree of [10, 16, 22, 26, 30]) {
      const data = Array.from({ length: 20 }, (_, i) => (i * 37 + degree) & 0xff);
      const block = [...data, ...reedSolomon(data, degree)];
      for (let s = 0; s < degree; s++) {
        let value = 0;
        for (const codeword of block) value = mul(value, EXP[s] as number) ^ codeword;
        expect(value, `degree ${degree}, syndrome ${s}`).toBe(0);
      }
    }
  });
});

describe("the QR encoder", () => {
  const samples = [
    "A",
    "hello",
    "10012111011111110012121111121110012111211120121112111001111111211110",
    "stud1:quillfen:200:Mirefen%20Station:Mudlark::1001111111111121201211101112111121112011111111",
    "https://example.invalid/verdance?g=" + "Z".repeat(180),
  ];

  for (const text of samples) {
    it(`round-trips ${text.length} characters through its own inverse`, () => {
      const code = encodeQr(text, { quiet: 4 });
      const decoded = decodeQr(code, 4);
      expect(decoded.text).toBe(text);
      // Level M is 0b00 in the format bits, and the mask must be one of eight.
      expect(decoded.level).toBe(0b00);
      expect(decoded.mask).toBeGreaterThanOrEqual(0);
      expect(decoded.mask).toBeLessThan(8);
    });
  }

  it("picks the smallest version that fits", () => {
    expect(encodeQr("A").version).toBe(1);
    // 14 bytes is version 1's whole budget at level M, minus the header.
    expect(encodeQr("x".repeat(10)).version).toBe(1);
    expect(encodeQr("x".repeat(40)).version).toBeGreaterThan(1);
    // Longer text never picks a smaller version.
    let previous = 0;
    for (const length of [5, 20, 60, 120, 300, 600]) {
      const version = encodeQr("x".repeat(length)).version;
      expect(version).toBeGreaterThanOrEqual(previous);
      previous = version;
    }
  });

  it("puts the finders, timing and dark module where a scanner looks", () => {
    const code = encodeQr("finders", { quiet: 0 });
    const size = code.size;
    const dark = (x: number, y: number): boolean => code.modules[y * size + x] === true;

    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          expect(dark(ox + x, oy + y), `finder at ${ox},${oy} module ${x},${y}`).toBe(ring !== 2);
        }
      }
    }
    // Timing patterns alternate, starting dark at module 8.
    for (let i = 8; i < size - 8; i++) {
      expect(dark(i, 6)).toBe(i % 2 === 0);
      expect(dark(6, i)).toBe(i % 2 === 0);
    }
    expect(dark(8, size - 8)).toBe(true);
  });

  it("adds the quiet zone the spec asks for", () => {
    const code = encodeQr("quiet", { quiet: 4 });
    const size = code.size;
    for (let i = 0; i < size; i++) {
      for (const [x, y] of [[i, 0], [i, 1], [0, i], [1, i], [i, size - 1], [size - 1, i]] as const) {
        expect(code.modules[y * size + x]).toBe(false);
      }
    }
    expect(encodeQr("quiet", { quiet: 0 }).size).toBe(size - 8);
  });

  it("is deterministic", () => {
    const a = encodeQr("determinism");
    const b = encodeQr("determinism");
    expect(b.modules).toEqual(a.modules);
  });

  it("refuses what it cannot carry rather than truncating", () => {
    expect(() => encodeQr("x".repeat(900))).toThrow(/more than this encoder carries/);
  });

  it("draws as SVG with runs rather than one rect per module", () => {
    const code = encodeQr("svg");
    const svg = qrToSvg(code, { pixel: 3, label: "Genome code" });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Genome code"');
    expect(svg).toContain("shape-rendering=\"crispEdges\"");
    const rects = (svg.match(/<rect/g) ?? []).length;
    const darkModules = code.modules.filter(Boolean).length;
    // One background rect plus one per run: strictly fewer than one per module.
    expect(rects).toBeLessThan(darkModules);
    expect(rects).toBeGreaterThan(1);
    const opens = (svg.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
    const closes = (svg.match(/<\/[a-zA-Z]/g) ?? []).length + (svg.match(/\/>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
