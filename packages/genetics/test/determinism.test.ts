/**
 * Determinism (§1.7, §10).
 *
 * Daily Genome, shareable genome codes, replays, Breeding Trial scoring and
 * every test above rest on one property: same seed plus same inputs equals same
 * creature, always. This file is the guard on that property.
 */

import { describe, expect, it } from "vitest";
import { breed } from "../src/breeding.js";
import {
  deserialiseGenome,
  genomeFingerprint,
  genomeFromSpec,
  randomWildGenome,
  serialiseGenome,
} from "../src/genome.js";
import { createRng, rngFromState } from "../src/rng.js";
import { map, NO_MUTATION } from "./helpers.js";

describe("seeded RNG", () => {
  it("reproduces an identical stream from the same seed", () => {
    const a = createRng("daily:2026-09-07");
    const b = createRng("daily:2026-09-07");
    const left = Array.from({ length: 500 }, () => a.next());
    const right = Array.from({ length: 500 }, () => b.next());
    expect(left).toEqual(right);
  });

  it("produces a different stream from a different seed", () => {
    const a = createRng("seed-a");
    const b = createRng("seed-b");
    const left = Array.from({ length: 20 }, () => a.next());
    const right = Array.from({ length: 20 }, () => b.next());
    expect(left).not.toEqual(right);
  });

  it("stays inside [0, 1) and looks uniform", () => {
    const rng = createRng("uniformity");
    const buckets = new Array(10).fill(0) as number[];
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      buckets[Math.floor(value * 10)] = (buckets[Math.floor(value * 10)] as number) + 1;
    }
    for (const count of buckets) {
      expect(Math.abs(count / n - 0.1)).toBeLessThan(0.005);
    }
  });

  it("resolves fine-grained probabilities, so rare mutations are reachable", () => {
    // A 32-bit draw could not represent 2e-6 usefully; 53 bits can.
    const rng = createRng("fine-grained");
    let hits = 0;
    const n = 2_000_000;
    for (let i = 0; i < n; i++) if (rng.bool(2e-6)) hits++;
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(20);
  });

  it("gives forked streams that are independent and reproducible", () => {
    const parent = createRng("fork-root");
    parent.next();
    const breeding = parent.fork("breeding");
    const battle = parent.fork("battle");
    // Different labels at the same point in the stream must not collide.
    expect(breeding.next()).not.toBe(battle.next());

    // A fork is reproducible *from its point in the stream*, so replaying the
    // same history and forking with the same label gives the same substream.
    const replay = createRng("fork-root");
    replay.next();
    const original = createRng("fork-root");
    original.next();
    expect(replay.fork("breeding").next()).toBe(original.fork("breeding").next());

    // Forking at a *different* point gives a different substream, which is what
    // keeps a new subsystem from shifting numbers an existing one would draw.
    const later = createRng("fork-root");
    later.next();
    later.next();
    expect(later.fork("breeding").next()).not.toBe(original.fork("breeding").next());
  });

  it("does NOT consume from the parent stream when forking", () => {
    // This is the contract, not an accident. Forking has to leave the parent
    // untouched, or adding a new subsystem's roll would shift every roll that
    // follows it and invalidate every saved seed.
    //
    // The cost is a real footgun: forking the same state twice with the same
    // label gives the same numbers. A caller that wants a fresh substream per
    // call must vary the label itself. (@chimaera/game learned this by
    // shipping a ranch in which every egg was genetically identical.)
    const rng = createRng("no-consume");
    const before = rng.state();
    rng.fork("a");
    rng.fork("b");
    expect(rng.state()).toEqual(before);
    expect(createRng("no-consume").fork("x").next()).toBe(createRng("no-consume").fork("x").next());
  });

  it("restores exactly from a saved state", () => {
    const rng = createRng("save-restore");
    for (let i = 0; i < 37; i++) rng.next();
    const snapshot = rng.state();
    const expected = Array.from({ length: 20 }, () => rng.next());
    expect(Array.from({ length: 20 }, () => rngFromState(snapshot).next())[0]).toBe(expected[0]);

    const restored = rngFromState(snapshot);
    expect(Array.from({ length: 20 }, () => restored.next())).toEqual(expected);
  });

  it("shuffles and picks deterministically", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(createRng("shuffle").shuffle(items)).toEqual(createRng("shuffle").shuffle(items));
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(createRng("pick").pick(items)).toBe(createRng("pick").pick(items));
  });
});

describe("breeding determinism", () => {
  const sire = genomeFromSpec(map, "male", { DORSAL: ["D", "d"], BUILD: ["Bh", "Bs"] });
  const dam = genomeFromSpec(map, "female", { DORSAL: ["D", "d"], MARK: ["Ms", "Mb"] });

  function run(seed: string): string[] {
    const rng = createRng(seed);
    const out: string[] = [];
    for (let i = 0; i < 200; i++) {
      const result = breed(sire, dam, map, rng, { mutationRates: NO_MUTATION });
      out.push(
        result.outcome === "no-egg"
          ? "no-egg"
          : `${result.outcome}:${genomeFingerprint(result.genome)}`,
      );
    }
    return out;
  }

  it("produces identical offspring from the same seed and parents", () => {
    expect(run("breed:alpha")).toEqual(run("breed:alpha"));
  });

  it("produces different offspring from a different seed", () => {
    expect(run("breed:alpha")).not.toEqual(run("breed:beta"));
  });

  it("keeps wild stock generation reproducible", () => {
    const rngA = createRng("wild:mirefen");
    const rngB = createRng("wild:mirefen");
    for (let i = 0; i < 50; i++) {
      expect(genomeFingerprint(randomWildGenome(map, rngA))).toBe(
        genomeFingerprint(randomWildGenome(map, rngB)),
      );
    }
  });
});

describe("genome serialisation", () => {
  it("round-trips exactly", () => {
    const rng = createRng("serialise");
    for (let i = 0; i < 50; i++) {
      const genome = randomWildGenome(map, rng);
      const restored = deserialiseGenome(serialiseGenome(genome));
      expect(genomeFingerprint(restored)).toBe(genomeFingerprint(genome));
    }
  });

  it("is byte-stable regardless of key insertion order", () => {
    const genome = randomWildGenome(map, createRng("stable"));
    const shuffled = {
      species: genome.species,
      chromosomes: Object.fromEntries(Object.entries(genome.chromosomes).reverse()),
    };
    expect(genomeFingerprint(shuffled)).toBe(genomeFingerprint(genome));
  });

  it("carries a version and refuses to read a format it does not know", () => {
    const data = serialiseGenome(randomWildGenome(map, createRng("versioned")));
    expect(data.v).toBe(1);
    expect(() => deserialiseGenome({ ...data, v: 99 })).toThrow(/unsupported genome format/);
  });
});
