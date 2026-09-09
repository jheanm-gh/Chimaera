/**
 * Linkage and recombination (§1.1, §1.7).
 *
 * These assert the exact Haldane values implied by the map positions, not
 * vague correlations. If a designer moves a locus, these numbers move with it
 * — which is the point: the map is the single source of truth for linkage, and
 * this file proves the simulation agrees with it.
 */

import { describe, expect, it } from "vitest";
import { genomeFromSpec, randomWildGenome } from "../src/genome.js";
import { recombinationFraction } from "../src/meiosis.js";
import { createRng } from "../src/rng.js";
import type { AlleleId, Genome, LocusId } from "../src/types.js";
import { gamete, map, tolerance } from "./helpers.js";

const N = 60_000;

/**
 * Fraction of gametes carrying a non-parental combination of two loci, given a
 * parent whose haplotype `a` carries `aAlleles` and haplotype `b` carries
 * `bAlleles`.
 */
function measureRecombination(
  parent: Genome,
  left: LocusId,
  right: LocusId,
  onHaplotypeA: readonly [AlleleId, AlleleId],
  seed: string,
  n = N,
  crossoverMultiplier = 1,
): number {
  const rng = createRng(seed);
  let recombinant = 0;
  const chromosome = map.locus(left).chromosome;
  for (let i = 0; i < n; i++) {
    const g = gamete(parent, rng, crossoverMultiplier);
    const genes = g.haplotypes[chromosome]?.genes;
    const gotLeft = genes?.[left]?.[0];
    const gotRight = genes?.[right]?.[0];
    const fromA = gotLeft === onHaplotypeA[0];
    const rightFromA = gotRight === onHaplotypeA[1];
    if (fromA !== rightFromA) recombinant++;
  }
  return recombinant / n;
}

describe("Haldane mapping", () => {
  it("is additive under recombination composition", () => {
    // r_AC = r_AB + r_BC - 2 r_AB r_BC must equal Haldane(d_AB + d_BC).
    // This property is why per-gap switching reproduces exact map distances.
    for (const [d1, d2] of [
      [0.03, 0.13],
      [0.25, 0.44],
      [0.01, 0.83],
    ]) {
      const r1 = recombinationFraction(d1 as number);
      const r2 = recombinationFraction(d2 as number);
      const composed = r1 + r2 - 2 * r1 * r2;
      expect(composed).toBeCloseTo(recombinationFraction((d1 as number) + (d2 as number)), 12);
    }
  });

  it("approaches free assortment asymptotically and never exceeds it", () => {
    // At any distance a real chromosome could hold, linkage is still detectable.
    expect(recombinationFraction(1)).toBeCloseTo(0.4323, 4);
    expect(recombinationFraction(2)).toBeCloseTo(0.4908, 4);
    expect(recombinationFraction(2)).toBeLessThan(0.5);
    // Far beyond that the exponential underflows to exactly 0.5, which is the
    // correct limit and, importantly, never above it.
    expect(recombinationFraction(50)).toBe(0.5);
    expect(recombinationFraction(0)).toBe(0);
  });
});

describe("tight linkage: the lantern drag", () => {
  const expected = recombinationFraction(0.03); // SPD_A at 44cM, LANTERN at 47cM

  it("keeps the fast allele welded to the lethal at ~2.9%", () => {
    expect(expected).toBeCloseTo(0.0291, 4);

    // Coupling phase: the long-stride allele and the lantern lethal ride the
    // same haplotype, exactly as wild Mirefen stock delivers them.
    const parent = genomeFromSpec(map, "female", {
      SPD_A: ["SA2", "SA0"],
      LANTERN: ["LN_star", "LN_wild"],
    });
    const observed = measureRecombination(parent, "SPD_A", "LANTERN", ["SA2", "LN_star"], "link:tight");

    expect(Math.abs(observed - expected)).toBeLessThan(tolerance(expected, N));
  });

  it("gives the same recombination fraction in repulsion phase", () => {
    // Phase changes which gametes are parental, never how often crossover happens.
    const parent = genomeFromSpec(map, "female", {
      SPD_A: ["SA2", "SA0"],
      LANTERN: ["LN_wild", "LN_star"],
    });
    const observed = measureRecombination(parent, "SPD_A", "LANTERN", ["SA2", "LN_wild"], "link:repulsion");

    expect(Math.abs(observed - expected)).toBeLessThan(tolerance(expected, N));
  });

  it("is broken open by a crossover inducer", () => {
    const parent = genomeFromSpec(map, "female", {
      SPD_A: ["SA2", "SA0"],
      LANTERN: ["LN_star", "LN_wild"],
    });
    const boosted = measureRecombination(parent, "SPD_A", "LANTERN", ["SA2", "LN_star"], "link:inducer", N, 8);
    const boostedExpected = recombinationFraction(0.03 * 8);

    expect(boostedExpected).toBeCloseTo(0.1906, 4);
    expect(Math.abs(boosted - boostedExpected)).toBeLessThan(tolerance(boostedExpected, N));
    // An inducer must actually be worth buying.
    expect(boosted).toBeGreaterThan(expected * 3);
  });
});

describe("loose linkage", () => {
  it("approaches but does not reach free assortment at 84cM", () => {
    const expected = recombinationFraction(0.84); // DORSAL at 8cM, TAIL at 92cM
    expect(expected).toBeCloseTo(0.4068, 4);
    expect(expected).toBeLessThan(0.5);

    const parent = genomeFromSpec(map, "female", { DORSAL: ["D", "d"], TAIL: ["Tf", "Tw"] });
    const observed = measureRecombination(parent, "DORSAL", "TAIL", ["D", "Tf"], "link:loose");

    expect(Math.abs(observed - expected)).toBeLessThan(tolerance(expected, N));
  });

  it("assorts loci on different chromosomes independently", () => {
    const parent = genomeFromSpec(map, "female", { DORSAL: ["D", "d"], PIG: ["P", "p"] });
    const rng = createRng("link:independent");
    let recombinant = 0;
    for (let i = 0; i < N; i++) {
      const g = gamete(parent, rng);
      const fromA = g.haplotypes.C1?.genes.DORSAL?.[0] === "D";
      const pigFromA = g.haplotypes.C3?.genes.PIG?.[0] === "P";
      if (fromA !== pigFromA) recombinant++;
    }
    expect(Math.abs(recombinant / N - 0.5)).toBeLessThan(tolerance(0.5, N));
  });
});

describe("sex chromosome segregation", () => {
  it("never recombines X with Y in a male", () => {
    const sire = genomeFromSpec(map, "male", {
      CREST: ["Cr_grand", null],
      SPD_B: ["SB2", null],
      TUSK: [null, "Tk_yes"],
    });
    const rng = createRng("link:xy");
    let xGametes = 0;
    let yGametes = 0;

    for (let i = 0; i < 20_000; i++) {
      const genes = gamete(sire, rng).haplotypes.S?.genes ?? {};
      const hasX = genes.CREST !== undefined || genes.SPD_B !== undefined;
      const hasY = genes.TUSK !== undefined;
      // A recombinant X/Y gamete would carry both, or neither. Neither happens.
      expect(hasX).not.toBe(hasY);
      if (hasX) {
        xGametes++;
        // The X passes intact: both of its loci travel together, always.
        expect(genes.CREST?.[0]).toBe("Cr_grand");
        expect(genes.SPD_B?.[0]).toBe("SB2");
      } else {
        yGametes++;
      }
    }
    expect(Math.abs(xGametes / (xGametes + yGametes) - 0.5)).toBeLessThan(tolerance(0.5, 20_000));
  });

  it("recombines the two X's of a female normally", () => {
    const expected = recombinationFraction(0.25); // CREST at 15cM, SPD_B at 40cM
    expect(expected).toBeCloseTo(0.1967, 4);

    const dam = genomeFromSpec(map, "female", {
      CREST: ["Cr_grand", "Cr_plain"],
      SPD_B: ["SB2", "SB0"],
    });
    const observed = measureRecombination(dam, "CREST", "SPD_B", ["Cr_grand", "SB2"], "link:xx");

    expect(Math.abs(observed - expected)).toBeLessThan(tolerance(expected, N));
  });
});

describe("wild populations carry linkage disequilibrium", () => {
  it("delivers founder stock with the fast allele already welded to the lethal", () => {
    const rng = createRng("link:wild-ld");
    let fastHaplotypes = 0;
    let fastAndLethal = 0;

    for (let i = 0; i < 20_000; i++) {
      const genome = randomWildGenome(map, rng);
      const pair = genome.chromosomes.C1;
      for (const hap of [pair?.maternal, pair?.paternal]) {
        if (hap?.genes.SPD_A?.[0] !== "SA2") continue;
        fastHaplotypes++;
        if (hap.genes.LANTERN?.[0] === "LN_star") fastAndLethal++;
      }
    }

    const conditional = fastAndLethal / fastHaplotypes;
    // P(lethal | fast) should sit far above the 4% background rate.
    expect(conditional).toBeGreaterThan(0.4);
    expect(conditional).toBeLessThan(0.6);
  });
});
