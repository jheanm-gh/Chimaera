/**
 * Deterministic seeded RNG (xoshiro128**), the only source of randomness the
 * simulation is allowed to touch.
 *
 * Two properties matter more than speed or statistical perfection:
 *
 *  - **Reproducibility.** Same seed + same inputs = same creature, forever.
 *    Daily Genome, shareable genome codes, replays and the test suite all rest
 *    on this. An eslint rule bans `Math.random()` in the sim packages.
 *  - **Stream isolation via `fork()`.** Subsystems draw from independent
 *    streams derived from a label, so adding a battle roll or a weather roll
 *    later cannot shift the numbers a breeding roll would have produced. Without
 *    this, every new feature silently invalidates every saved seed.
 */

export interface RngState {
  readonly s: readonly [number, number, number, number];
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** True with probability p. */
  bool(p: number): boolean;
  /** Uniform choice. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Weighted choice. Weights must be non-negative and not all zero. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** Shuffles a copy of the array (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** An independent stream keyed by `label`, reproducible from this point. */
  fork(label: string): Rng;
  /** Snapshot for saves; restore with `rngFromState`. */
  state(): RngState;
}

/** cyrb128: string -> four well-mixed 32-bit seeds. */
function seedFromString(input: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const out: [number, number, number, number] = [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
  // xoshiro is degenerate if the whole state is zero.
  if (out[0] === 0 && out[1] === 0 && out[2] === 0 && out[3] === 0) out[0] = 0x9e3779b9;
  return out;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

class Xoshiro128 implements Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: readonly [number, number, number, number]) {
    this.s0 = seed[0] >>> 0;
    this.s1 = seed[1] >>> 0;
    this.s2 = seed[2] >>> 0;
    this.s3 = seed[3] >>> 0;
  }

  private nextUint32(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  next(): number {
    // 53-bit double from two 32-bit draws: enough precision that low mutation
    // rates (1e-6 and below) are actually reachable.
    const hi = this.nextUint32() >>> 5;
    const lo = this.nextUint32() >>> 6;
    return (hi * 67108864 + lo) / 9007199254740992;
  }

  int(maxExclusive: number): number {
    if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`int() needs a positive bound, got ${maxExclusive}`);
    }
    return Math.floor(this.next() * maxExclusive);
  }

  bool(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("pick() on an empty array");
    return items[this.int(items.length)] as T;
  }

  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0) throw new RangeError("weighted() on an empty array");
    if (items.length !== weights.length) {
      throw new RangeError("weighted() needs one weight per item");
    }
    let total = 0;
    for (const w of weights) {
      if (w < 0) throw new RangeError("weighted() needs non-negative weights");
      total += w;
    }
    if (total <= 0) throw new RangeError("weighted() needs at least one positive weight");
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i] as number;
      if (roll < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = out[i] as T;
      out[i] = out[j] as T;
      out[j] = a;
    }
    return out;
  }

  fork(label: string): Rng {
    // Mix the label into the *current* state so forks are reproducible from a
    // known point in the stream, and two different labels never collide.
    const tag = `${label}:${this.s0}:${this.s1}:${this.s2}:${this.s3}`;
    return new Xoshiro128(seedFromString(tag));
  }

  state(): RngState {
    return { s: [this.s0, this.s1, this.s2, this.s3] };
  }
}

export function createRng(seed: string | number): Rng {
  return new Xoshiro128(seedFromString(typeof seed === "number" ? `n:${seed}` : seed));
}

export function rngFromState(state: RngState): Rng {
  return new Xoshiro128(state.s);
}
