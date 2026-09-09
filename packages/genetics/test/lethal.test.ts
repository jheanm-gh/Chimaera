/**
 * Lethal alleles, mutation, and inbreeding at the breeding table (§1.2, §1.4).
 */

import { describe, expect, it } from "vitest";
import { BASE_FERTILITY, breed, carriedLethals } from "../src/breeding.js";
import { genomeFromSpec, genotypeAt } from "../src/genome.js";
import type { MutagenLoad, MutationRates } from "../src/mutation.js";
import { BASELINE_MUTATION, combineMutagens, NO_MUTAGENS } from "../src/mutation.js";
import { createRng } from "../src/rng.js";
import type { BreedResult } from "../src/breeding.js";
import { map, NO_MUTATION, tolerance } from "./helpers.js";

function runBreedings(
  seed: string,
  n: number,
  sireSpec: Parameters<typeof genomeFromSpec>[2],
  damSpec: Parameters<typeof genomeFromSpec>[2],
  options: Parameters<typeof breed>[4] = {},
): BreedResult[] {
  const sire = genomeFromSpec(map, "male", sireSpec);
  const dam = genomeFromSpec(map, "female", damSpec);
  const rng = createRng(seed);
  const results: BreedResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push(breed(sire, dam, map, rng, { mutationRates: NO_MUTATION, ...options }));
  }
  return results;
}

const N = 20_000;

describe("recessive lethal alleles", () => {
  it("kills a quarter of the eggs from two lantern carriers", () => {
    const spec = { LANTERN: ["LN_star", "LN_wild"] as const };
    const results = runBreedings("lethal:lantern", N, spec, spec);
    const eggs = results.filter((r) => r.outcome !== "no-egg");
    const lethal = eggs.filter((r) => r.outcome === "lethal");

    expect(Math.abs(lethal.length / eggs.length - 0.25)).toBeLessThan(tolerance(0.25, eggs.length));
    expect(lethal.every((r) => r.outcome === "lethal" && r.cause.locus === "LANTERN")).toBe(true);
    expect(lethal[0]?.outcome === "lethal" && lethal[0].cause.reason).toMatch(/yolk membrane/);
  });

  it("leaves survivors at 2:1 carrier to clear, so it can never breed true", () => {
    const spec = { LANTERN: ["LN_star", "LN_wild"] as const };
    const survivors = runBreedings("lethal:ratio", N, spec, spec).filter((r) => r.outcome === "hatched");
    const lit = survivors.filter((r) => r.outcome === "hatched" && r.phenotype.traits.lantern === "lantern");

    expect(Math.abs(lit.length / survivors.length - 2 / 3)).toBeLessThan(tolerance(2 / 3, survivors.length));
    // Every visible lantern creature is a heterozygote. There is no other kind.
    expect(
      lit.every((r) => r.outcome === "hatched" && new Set(genotypeAt(r.genome, map.locus("LANTERN"))).size === 2),
    ).toBe(true);
  });

  it("costs nothing when only one parent carries it", () => {
    const results = runBreedings(
      "lethal:single-carrier",
      5_000,
      { LANTERN: ["LN_star", "LN_wild"] },
      { LANTERN: ["LN_wild", "LN_wild"] },
    );
    expect(results.some((r) => r.outcome === "lethal")).toBe(false);
  });

  it("catches the second lethal locus independently", () => {
    const spec = { PRISM: ["Pr_star", "Pr_wild"] as const };
    const results = runBreedings("lethal:prism", N, spec, spec);
    const eggs = results.filter((r) => r.outcome !== "no-egg");
    const lethal = eggs.filter((r) => r.outcome === "lethal");

    expect(Math.abs(lethal.length / eggs.length - 0.25)).toBeLessThan(tolerance(0.25, eggs.length));
    expect(lethal.every((r) => r.outcome === "lethal" && r.cause.locus === "PRISM")).toBe(true);
  });

  it("compounds when a pair carries both lethals", () => {
    const spec = { LANTERN: ["LN_star", "LN_wild"] as const, PRISM: ["Pr_star", "Pr_wild"] as const };
    const results = runBreedings("lethal:both", N, spec, spec);
    const eggs = results.filter((r) => r.outcome !== "no-egg");
    const lethal = eggs.filter((r) => r.outcome === "lethal");

    // 1 - (3/4)^2 = 7/16 of eggs fail.
    expect(Math.abs(lethal.length / eggs.length - 7 / 16)).toBeLessThan(tolerance(7 / 16, eggs.length));
  });

  it("reports carried lethals for the pedigree view without revealing them to the player", () => {
    const carrier = genomeFromSpec(map, "female", {
      LANTERN: ["LN_star", "LN_wild"],
      PRISM: ["Pr_star", "Pr_wild"],
    });
    const clean = genomeFromSpec(map, "female", {});
    expect(carriedLethals(carrier, map).map((l) => l.locus).sort()).toEqual(["LANTERN", "PRISM"]);
    expect(carriedLethals(clean, map)).toEqual([]);
  });
});

describe("fertility and stillbirth", () => {
  it("produces eggs at the base rate for an outcross", () => {
    const results = runBreedings("fert:base", N, {}, {});
    const eggs = results.filter((r) => r.outcome !== "no-egg").length;
    expect(Math.abs(eggs / N - BASE_FERTILITY)).toBeLessThan(tolerance(BASE_FERTILITY, N));
  });

  it("suppresses fertility and raises stillbirth as inbreeding climbs", () => {
    const clear = runBreedings("fert:clear", N, {}, {}, { inbreeding: 0 });
    const failing = runBreedings("fert:failing", N, {}, {}, { inbreeding: 0.5 });

    const eggRate = (rs: BreedResult[]): number => rs.filter((r) => r.outcome !== "no-egg").length / rs.length;
    const stillbirthRate = (rs: BreedResult[]): number => {
      const eggs = rs.filter((r) => r.outcome !== "no-egg");
      return eggs.filter((r) => r.outcome === "stillborn").length / eggs.length;
    };

    expect(eggRate(failing)).toBeLessThan(eggRate(clear) * 0.7);
    expect(stillbirthRate(failing)).toBeGreaterThan(0.25);
    expect(stillbirthRate(clear)).toBeLessThan(0.05);
  });

  it("depresses stat ceilings in an inbred hatchling", () => {
    const outcross = runBreedings("fert:stats-clear", 400, {}, {}, { inbreeding: 0 });
    const inbred = runBreedings("fert:stats-inbred", 400, {}, {}, { inbreeding: 0.5 });
    const meanSpeed = (rs: BreedResult[]): number => {
      const hatched = rs.filter((r) => r.outcome === "hatched");
      return hatched.reduce((sum, r) => sum + (r.outcome === "hatched" ? r.phenotype.stats.speed ?? 0 : 0), 0) / hatched.length;
    };
    expect(meanSpeed(inbred)).toBeLessThan(meanSpeed(outcross) * 0.85);
  });

  it("raises fertility with a tonic without touching anything genetic", () => {
    const results = runBreedings("fert:tonic", N, {}, {}, { fertilityMultiplier: 1.15 });
    const eggs = results.filter((r) => r.outcome !== "no-egg").length / N;
    expect(eggs).toBeGreaterThan(BASE_FERTILITY);
    expect(eggs).toBeLessThanOrEqual(1);
  });

  it("biases offspring sex with a selection reagent, at its stated reliability", () => {
    const results = runBreedings("fert:sexsel", N, {}, {}, {
      sexSelection: { sex: "female", reliability: 0.8 },
    });
    const hatched = results.filter((r) => r.outcome === "hatched");
    const females = hatched.filter((r) => r.outcome === "hatched" && r.phenotype.sex === "female").length;
    // 80% forced female + 20% fair coin = 90% female.
    expect(Math.abs(females / hatched.length - 0.9)).toBeLessThan(tolerance(0.9, hatched.length));
  });
});

describe("mutation", () => {
  const heavyMutagen: MutagenLoad = {
    ...NO_MUTAGENS,
    pointMultiplier: 400,
    novelMultiplier: 4000,
    duplicationMultiplier: 400,
    fertilityMultiplier: 0.7,
    lifespanCostDays: 40,
    extraStillbirthChance: 0.05,
  };

  it("does not mutate at all when rates are zero", () => {
    const results = runBreedings("mut:none", 3_000, {}, {});
    expect(results.every((r) => r.outcome === "no-egg" || r.mutations.length === 0)).toBe(true);
  });

  it("keeps baseline novel mutations rare enough to stay a treasure", () => {
    const rates: MutationRates = BASELINE_MUTATION;
    const results = runBreedings("mut:baseline", 20_000, {}, {}, { mutationRates: rates });
    const all = results.flatMap((r) => (r.outcome === "no-egg" ? [] : r.mutations));
    const novel = all.filter((m) => m.kind === "novel");

    expect(all.length).toBeGreaterThan(0);
    // Roughly 20 loci x 2 gametes x 2e-6: a handful per 20,000 breedings at most.
    expect(novel.length).toBeLessThan(10);
  });

  it("raises every rate under a mutagen, and charges for it", () => {
    const results = runBreedings("mut:heavy", 4_000, {}, {}, {
      mutationRates: BASELINE_MUTATION,
      mutagens: heavyMutagen,
    });
    const all = results.flatMap((r) => (r.outcome === "no-egg" ? [] : r.mutations));

    expect(all.filter((m) => m.kind === "point").length).toBeGreaterThan(0);
    expect(all.filter((m) => m.kind === "novel").length).toBeGreaterThan(0);
    expect(all.filter((m) => m.kind === "duplication").length).toBeGreaterThan(0);

    const eggs = results.filter((r) => r.outcome !== "no-egg").length / results.length;
    expect(eggs).toBeLessThan(BASE_FERTILITY * 0.8);
  });

  it("produces novel alleles that exist in no wild pool", () => {
    const results = runBreedings("mut:novel", 4_000, {}, {}, {
      mutationRates: BASELINE_MUTATION,
      mutagens: heavyMutagen,
    });
    const novel = results.flatMap((r) => (r.outcome === "no-egg" ? [] : r.mutations)).filter((m) => m.kind === "novel");

    expect(novel.length).toBeGreaterThan(0);
    for (const event of novel) {
      const allele = map.allele(event.locus, event.to);
      expect(allele.novel).toBe(true);
      expect(allele.wildFrequency ?? 0).toBe(0);
    }
  });

  it("lets a duplication carry three alleles at one locus", () => {
    const results = runBreedings("mut:cnv", 6_000, {}, {}, {
      mutationRates: { ...BASELINE_MUTATION, duplication: 0.02 },
    });
    const triploid = results.find(
      (r) => r.outcome === "hatched" && map.loci.some((l) => genotypeAt(r.genome, l).length >= 3),
    );
    expect(triploid).toBeDefined();
    if (triploid?.outcome === "hatched") {
      const locus = map.loci.find((l) => genotypeAt(triploid.genome, l).length >= 3);
      expect(genotypeAt(triploid.genome, locus!).length).toBeGreaterThanOrEqual(3);
      // Extra dosage is allowed to overshoot, but only slightly.
      for (const stat of Object.values(triploid.phenotype.stats)) {
        expect(stat).toBeLessThanOrEqual(130 * 1.15 + 1e-9);
      }
    }
  });

  it("combines mutagen loads multiplicatively, costs included", () => {
    const combined = combineMutagens([heavyMutagen, { ...NO_MUTAGENS, pointMultiplier: 2, lifespanCostDays: 10 }]);
    expect(combined.pointMultiplier).toBe(800);
    expect(combined.lifespanCostDays).toBe(50);
    expect(combined.fertilityMultiplier).toBeCloseTo(0.7, 12);
  });
});
