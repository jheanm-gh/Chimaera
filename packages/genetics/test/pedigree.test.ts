/**
 * Pedigree arithmetic (§1.5, §1.7).
 *
 * Every expected value in this file is a textbook constant that can be
 * hand-computed on paper, which is the only reason to trust the implementation.
 */

import { describe, expect, it } from "vitest";
import { inbreedingPenalty, Pedigree } from "../src/pedigree.js";

/** A0 x B0 -> C, D (full sibs). X0, Y0 are unrelated founders. */
function baseHerd(): Pedigree {
  return new Pedigree()
    .add("A0")
    .add("B0")
    .add("X0")
    .add("Y0")
    .add("C", "A0", "B0")
    .add("D", "A0", "B0");
}

describe("kinship coefficients", () => {
  it("gives 0.5 for a non-inbred individual with itself", () => {
    expect(baseHerd().kinship("C", "C")).toBeCloseTo(0.5, 12);
  });

  it("gives 0 between unrelated founders", () => {
    expect(baseHerd().kinship("A0", "X0")).toBe(0);
  });

  it("gives 0.25 for parent and offspring", () => {
    expect(baseHerd().kinship("A0", "C")).toBeCloseTo(0.25, 12);
  });

  it("gives 0.25 for full siblings", () => {
    expect(baseHerd().kinship("C", "D")).toBeCloseTo(0.25, 12);
  });

  it("gives 0.125 for half siblings", () => {
    const pedigree = baseHerd().add("B1").add("E", "A0", "B1");
    expect(pedigree.kinship("C", "E")).toBeCloseTo(0.125, 12);
  });

  it("gives 0.0625 for first cousins", () => {
    const pedigree = baseHerd().add("G", "X0", "C").add("H", "Y0", "D");
    expect(pedigree.kinship("G", "H")).toBeCloseTo(0.0625, 12);
  });

  it("gives 0.125 for grandparent and grandchild", () => {
    const pedigree = baseHerd().add("G", "X0", "C");
    expect(pedigree.kinship("A0", "G")).toBeCloseTo(0.125, 12);
  });
});

describe("Wright's coefficient of inbreeding", () => {
  it("is 0 for founders and for offspring of unrelated parents", () => {
    const pedigree = baseHerd();
    expect(pedigree.inbreedingCoefficient("A0")).toBe(0);
    expect(pedigree.inbreedingCoefficient("C")).toBe(0);
  });

  it("is 0.25 for the offspring of full siblings", () => {
    const pedigree = baseHerd().add("F1", "C", "D");
    expect(pedigree.inbreedingCoefficient("F1")).toBeCloseTo(0.25, 12);
  });

  it("is 0.25 for a parent-offspring backcross", () => {
    const pedigree = baseHerd().add("BC", "A0", "C");
    expect(pedigree.inbreedingCoefficient("BC")).toBeCloseTo(0.25, 12);
  });

  it("is 0.0625 for the offspring of first cousins", () => {
    const pedigree = baseHerd().add("G", "X0", "C").add("H", "Y0", "D").add("K", "G", "H");
    expect(pedigree.inbreedingCoefficient("K")).toBeCloseTo(0.0625, 12);
  });

  it("follows the published full-sib series over five generations", () => {
    // F_t = (1 + 2 F_{t-1} + F_{t-2}) / 4 -> 0, 0.25, 0.375, 0.5, 0.59375
    const pedigree = new Pedigree().add("s0").add("d0");
    const expected = [0, 0.25, 0.375, 0.5, 0.59375];
    let sire = "s0";
    let dam = "d0";

    for (let generation = 0; generation < expected.length; generation++) {
      const nextSire = `s${generation + 1}`;
      const nextDam = `d${generation + 1}`;
      pedigree.add(nextSire, sire, dam).add(nextDam, sire, dam);
      expect(pedigree.inbreedingCoefficient(nextSire)).toBeCloseTo(expected[generation] as number, 12);
      sire = nextSire;
      dam = nextDam;
    }
  });

  it("projects the F of a pairing before it happens", () => {
    const pedigree = baseHerd();
    expect(pedigree.projectedInbreeding("C", "D")).toBeCloseTo(0.25, 12);
    expect(pedigree.projectedInbreeding("C", "X0")).toBe(0);
  });

  it("refuses to build a cyclic pedigree", () => {
    const pedigree = baseHerd();
    expect(() => pedigree.add("A0", "C", "B0")).toThrow(/cycle/);
    expect(() => pedigree.add("Z", "Z", "B0")).toThrow(/own parent/);
  });

  it("lists ancestors nearest generation first", () => {
    const pedigree = baseHerd().add("G", "X0", "C");
    expect(pedigree.ancestors("G", 1)).toEqual(["X0", "C"]);
    expect(pedigree.ancestors("G")).toEqual(["X0", "C", "A0", "B0"]);
  });
});

describe("inbreeding penalty curve", () => {
  it("does not punish an outcross at all", () => {
    const clear = inbreedingPenalty(0);
    expect(clear.fertilityMultiplier).toBe(1);
    expect(clear.statDepression).toBe(0);
    expect(clear.severity).toBe("clear");
  });

  it("stays gentle through the first few generations of line-breeding", () => {
    // Cousin mating (F = 0.0625) should cost a careful breeder nothing.
    const cousins = inbreedingPenalty(0.0625);
    expect(cousins.fertilityMultiplier).toBe(1);
    expect(cousins.statDepression).toBe(0);

    // Full sibs, generation two: noticeable but entirely survivable.
    const sibs = inbreedingPenalty(0.25);
    expect(sibs.fertilityMultiplier).toBeGreaterThan(0.85);
    expect(sibs.statDepression).toBeLessThan(0.1);
  });

  it("turns hard once a closed line passes generation four", () => {
    const strained = inbreedingPenalty(0.375);
    const failing = inbreedingPenalty(0.5);

    expect(strained.severity).toBe("strained");
    expect(failing.severity).toBe("failing");
    expect(failing.fertilityMultiplier).toBeLessThan(0.6);
    expect(failing.stillbirthChance).toBeGreaterThan(0.3);
    expect(failing.statDepression).toBeGreaterThan(0.2);
  });

  it("is monotonic and interpolates between authored points", () => {
    let previous = inbreedingPenalty(0);
    for (let f = 0.01; f <= 1.0001; f += 0.01) {
      const current = inbreedingPenalty(f);
      expect(current.fertilityMultiplier).toBeLessThanOrEqual(previous.fertilityMultiplier + 1e-12);
      expect(current.stillbirthChance).toBeGreaterThanOrEqual(previous.stillbirthChance - 1e-12);
      expect(current.statDepression).toBeGreaterThanOrEqual(previous.statDepression - 1e-12);
      previous = current;
    }
    // Midpoint of the 0.25 -> 0.375 segment.
    expect(inbreedingPenalty(0.3125).fertilityMultiplier).toBeCloseTo((0.9 + 0.76) / 2, 12);
  });

  it("clamps out-of-range coefficients instead of extrapolating", () => {
    expect(inbreedingPenalty(-1).f).toBe(0);
    expect(inbreedingPenalty(5).f).toBe(1);
  });
});
