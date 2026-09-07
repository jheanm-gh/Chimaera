/**
 * The Punnett predictor (§1.3).
 *
 * Two things are being checked. First, that with full information the
 * predictor is exactly right. Second — and this is the design-critical half —
 * that with partial information it widens into an honest range rather than
 * quietly guessing.
 */

import { describe, expect, it } from "vitest";
import { expressPhenotype } from "../src/expression.js";
import { genomeFromSpec } from "../src/genome.js";
import { knowledgeFromGenome, predictOffspring } from "../src/predict.js";
import type { LocusPrediction, OffspringPrediction, ParentKnowledge } from "../src/predict.js";
import { recombinationFraction } from "../src/meiosis.js";
import type { Genome, LocusId } from "../src/types.js";
import { map, phenotypes, tally, zygotes } from "./helpers.js";

function known(genome: Genome, revealed: LocusId[], revealPhase = false): ParentKnowledge {
  return knowledgeFromGenome(genome, map, expressPhenotype(genome, map), revealed, { revealPhase });
}

function observedOnly(genome: Genome): ParentKnowledge {
  return knowledgeFromGenome(genome, map, expressPhenotype(genome, map), []);
}

function locus(prediction: OffspringPrediction, id: LocusId): LocusPrediction {
  const found = prediction.loci.find((l) => l.locus === id);
  if (!found) throw new Error(`no prediction for ${id}`);
  return found;
}

function probabilityOf(entry: LocusPrediction, genotype: string): number {
  return entry.genotypes.find((g) => g.genotype === genotype)?.p ?? 0;
}

function phenotypeProbability(entry: LocusPrediction, label: string): number {
  return entry.phenotypes.find((p) => p.label === label)?.p ?? 0;
}

describe("full information", () => {
  it("reproduces the 3:1 monohybrid ratio exactly", () => {
    const sire = genomeFromSpec(map, "male", { DORSAL: ["D", "d"] });
    const dam = genomeFromSpec(map, "female", { DORSAL: ["D", "d"] });
    const prediction = predictOffspring(known(sire, ["DORSAL"]), known(dam, ["DORSAL"]), map, ["DORSAL"]);
    const dorsal = locus(prediction, "DORSAL");

    expect(dorsal.certain).toBe(true);
    expect(probabilityOf(dorsal, "D/D")).toBeCloseTo(0.25, 12);
    expect(probabilityOf(dorsal, "D/d")).toBeCloseTo(0.5, 12);
    expect(probabilityOf(dorsal, "d/d")).toBeCloseTo(0.25, 12);
    expect(phenotypeProbability(dorsal, "quilled")).toBeCloseTo(0.75, 12);
    expect(phenotypeProbability(dorsal, "smooth")).toBeCloseTo(0.25, 12);

    // Certainty means the range has collapsed to a point.
    for (const row of dorsal.genotypes) expect(row.max - row.min).toBeCloseTo(0, 12);
  });

  it("reproduces a 9:3:3:1 dihybrid across chromosomes", () => {
    const spec = { DORSAL: ["D", "d"] as const, PIG: ["P", "p"] as const };
    const sire = known(genomeFromSpec(map, "male", spec), ["DORSAL", "PIG"]);
    const dam = known(genomeFromSpec(map, "female", spec), ["DORSAL", "PIG"]);
    const prediction = predictOffspring(sire, dam, map, ["DORSAL", "PIG"]);

    const quilledPigmented = prediction.joint
      .filter((row) => row.combination.DORSAL !== "d/d" && row.combination.PIG !== "p/p")
      .reduce((sum, row) => sum + row.p, 0);
    expect(quilledPigmented).toBeCloseTo(9 / 16, 12);
  });

  it("accounts for linkage when phase is known", () => {
    const r = recombinationFraction(0.03);
    const parent = genomeFromSpec(map, "female", {
      SPD_A: ["SA2", "SA0"],
      LANTERN: ["LN_star", "LN_wild"],
    });
    const tester = genomeFromSpec(map, "male", { SPD_A: ["SA0", "SA0"], LANTERN: ["LN_wild", "LN_wild"] });
    const prediction = predictOffspring(
      known(tester, ["SPD_A", "LANTERN"], true),
      known(parent, ["SPD_A", "LANTERN"], true),
      map,
      ["SPD_A", "LANTERN"],
    );

    // A test cross reads recombination straight off the offspring: the fast,
    // lethal-free gamete the player wants appears at exactly r/2.
    const clean = prediction.joint.find(
      (row) => row.combination.SPD_A === "SA0/SA2" && row.combination.LANTERN === "LN_wild/LN_wild",
    );
    expect(clean?.p).toBeCloseTo(r / 2, 10);
    expect(prediction.loci.every((l) => l.certain)).toBe(true);
  });

  it("agrees with a large simulation", () => {
    const sire = genomeFromSpec(map, "male", { DORSAL: ["D", "d"], BUILD: ["Bh", "Bs"], TAIL: ["Tf", "Tw"] });
    const dam = genomeFromSpec(map, "female", { DORSAL: ["D", "d"], BUILD: ["Bm", "Bs"], TAIL: ["Tf", "Tn"] });
    const targets: LocusId[] = ["DORSAL", "BUILD", "TAIL"];
    const prediction = predictOffspring(known(sire, targets, true), known(dam, targets, true), map, targets);

    const n = 40_000;
    const simulated = tally(phenotypes(zygotes(sire, dam, "predict:sim", n)), (p) => p.traits.dorsal as string);

    const dorsal = locus(prediction, "DORSAL");
    expect(Math.abs(phenotypeProbability(dorsal, "quilled") - (simulated.get("quilled") ?? 0) / n)).toBeLessThan(0.01);

    // And the linked pair on C1 matches too, which is the harder check.
    const jointPredicted = prediction.joint
      .filter((row) => row.combination.DORSAL === "D/D" && row.combination.TAIL === "Tf/Tf")
      .reduce((sum, row) => sum + row.p, 0);
    const jointSimulated =
      zygotes(sire, dam, "predict:sim2", n).filter((genome) => {
        const c1 = genome.chromosomes.C1;
        const dorsalAlleles = [c1?.maternal.genes.DORSAL?.[0], c1?.paternal.genes.DORSAL?.[0]];
        const tailAlleles = [c1?.maternal.genes.TAIL?.[0], c1?.paternal.genes.TAIL?.[0]];
        return dorsalAlleles.every((a) => a === "D") && tailAlleles.every((a) => a === "Tf");
      }).length / n;
    expect(Math.abs(jointPredicted - jointSimulated)).toBeLessThan(0.01);
  });

  it("quantifies lethal risk for two known carriers", () => {
    const spec = { LANTERN: ["LN_star", "LN_wild"] as const };
    const prediction = predictOffspring(
      known(genomeFromSpec(map, "male", spec), ["LANTERN"]),
      known(genomeFromSpec(map, "female", spec), ["LANTERN"]),
      map,
      ["LANTERN"],
    );
    expect(prediction.lethalRisk.p).toBeCloseTo(0.25, 12);
    expect(prediction.lethalRisk.min).toBeCloseTo(0.25, 12);
    expect(prediction.lethalRisk.max).toBeCloseTo(0.25, 12);
  });
});

describe("partial information becomes visible uncertainty", () => {
  it("widens into a range when a parent's genotype is unknown", () => {
    // Both parents look quilled. Either could be D/D or D/d, and the answer
    // ranges from "no smooth offspring at all" to "a quarter of them".
    const sire = observedOnly(genomeFromSpec(map, "male", { DORSAL: ["D", "d"] }));
    const dam = observedOnly(genomeFromSpec(map, "female", { DORSAL: ["D", "D"] }));
    const prediction = predictOffspring(sire, dam, map, ["DORSAL"]);
    const dorsal = locus(prediction, "DORSAL");
    const smooth = dorsal.phenotypes.find((p) => p.label === "smooth");

    expect(dorsal.certain).toBe(false);
    expect(smooth?.min).toBeCloseTo(0, 12);
    expect(smooth?.max).toBeCloseTo(0.25, 12);
    expect(smooth?.p).toBeGreaterThan(0);
    expect(smooth?.p).toBeLessThan(0.25);
    expect(prediction.caveats.some((c) => /genotype unknown/.test(c))).toBe(true);
  });

  it("collapses that range once a lens reveals the genotype", () => {
    const sireGenome = genomeFromSpec(map, "male", { DORSAL: ["D", "d"] });
    const damGenome = genomeFromSpec(map, "female", { DORSAL: ["D", "D"] });
    const blind = predictOffspring(observedOnly(sireGenome), observedOnly(damGenome), map, ["DORSAL"]);
    const lensed = predictOffspring(known(sireGenome, ["DORSAL"]), known(damGenome, ["DORSAL"]), map, ["DORSAL"]);

    const spread = (p: OffspringPrediction): number => {
      const entry = locus(p, "DORSAL");
      return Math.max(...entry.genotypes.map((g) => g.max - g.min));
    };
    expect(spread(blind)).toBeGreaterThan(0.2);
    expect(spread(lensed)).toBeCloseTo(0, 12);
    // Buying information is the whole progression axis. It must visibly pay.
    expect(lensed.loci[0]?.certain).toBe(true);
  });

  it("shows unknown phase as uncertainty on a linked pair", () => {
    // Genotypes fully known, phase not. Coupling and repulsion give wildly
    // different answers, and the predictor must say so rather than average.
    const parentGenome = genomeFromSpec(map, "female", {
      SPD_A: ["SA2", "SA0"],
      LANTERN: ["LN_star", "LN_wild"],
    });
    const testerGenome = genomeFromSpec(map, "male", { SPD_A: ["SA0", "SA0"], LANTERN: ["LN_wild", "LN_wild"] });
    const targets: LocusId[] = ["SPD_A", "LANTERN"];

    const unphased = predictOffspring(
      known(testerGenome, targets),
      known(parentGenome, targets),
      map,
      targets,
    );
    const cleanFast = unphased.joint.find(
      (row) => row.combination.SPD_A === "SA0/SA2" && row.combination.LANTERN === "LN_wild/LN_wild",
    );

    const r = recombinationFraction(0.03);
    // Coupling: the wanted gamete is recombinant (r/2). Repulsion: parental ((1-r)/2).
    expect(cleanFast?.min).toBeCloseTo(r / 2, 6);
    expect(cleanFast?.max).toBeCloseTo((1 - r) / 2, 6);
    expect(cleanFast?.max as number).toBeGreaterThan((cleanFast?.min as number) * 10);
  });

  it("warns that an unknown pigment switch could hide the whole prediction", () => {
    const sire = observedOnly(genomeFromSpec(map, "male", { MARK: ["Ms", "Mn"], PIG: ["P", "p"] }));
    const dam = observedOnly(genomeFromSpec(map, "female", { MARK: ["Ms", "Mn"], PIG: ["P", "p"] }));
    const prediction = predictOffspring(sire, dam, map, ["MARK"]);

    expect(prediction.caveats.some((c) => /Pigment switch/.test(c) && /hide/.test(c))).toBe(true);
  });

  it("warns that lethal risk covers only the selected loci", () => {
    const sire = known(genomeFromSpec(map, "male", {}), ["DORSAL"]);
    const dam = known(genomeFromSpec(map, "female", {}), ["DORSAL"]);
    const prediction = predictOffspring(sire, dam, map, ["DORSAL"]);

    expect(prediction.lethalRisk.p).toBe(0);
    expect(prediction.caveats.filter((c) => /Lethal risk shown covers/.test(c)).length).toBe(2);
  });

  it("never leaks a genotype the player has not revealed", () => {
    // Two dams with different hidden genotypes but the same appearance must
    // produce byte-identical predictions.
    const sire = observedOnly(genomeFromSpec(map, "male", { DORSAL: ["D", "d"] }));
    const homozygous = observedOnly(genomeFromSpec(map, "female", { DORSAL: ["D", "D"] }));
    const heterozygous = observedOnly(genomeFromSpec(map, "female", { DORSAL: ["D", "d"] }));

    expect(JSON.stringify(predictOffspring(sire, homozygous, map, ["DORSAL"]))).toBe(
      JSON.stringify(predictOffspring(sire, heterozygous, map, ["DORSAL"])),
    );
  });

  it("rules out genotypes that the parent being alive already excludes", () => {
    // A living creature cannot be homozygous for a recessive lethal, so an
    // unlit parent is LN_wild/LN_wild and a lit one is a carrier. Both follow
    // from the phenotype alone, with no lens at all.
    const lit = observedOnly(genomeFromSpec(map, "male", { LANTERN: ["LN_star", "LN_wild"] }));
    const unlit = observedOnly(genomeFromSpec(map, "female", { LANTERN: ["LN_wild", "LN_wild"] }));
    const prediction = predictOffspring(lit, unlit, map, ["LANTERN"]);

    expect(prediction.lethalRisk.max).toBe(0);
    expect(probabilityOf(locus(prediction, "LANTERN"), "LN_star/LN_wild")).toBeCloseTo(0.5, 12);
  });
});

describe("sex-linked prediction", () => {
  it("predicts crest inheritance separately by sex, and flags the sex limitation", () => {
    const dam = known(genomeFromSpec(map, "female", { CREST: ["Cr_grand", "Cr_plain"] }), ["CREST"]);
    const sire = known(genomeFromSpec(map, "male", { CREST: ["Cr_plain", null] }), ["CREST"]);
    const prediction = predictOffspring(sire, dam, map, ["CREST"]);

    expect(prediction.sex.male).toBeCloseTo(0.5, 12);
    // Sons are hemizygous (one allele), daughters carry two.
    expect(probabilityOf(locus(prediction, "CREST"), "Cr_grand")).toBeCloseTo(0.25, 12);
    expect(probabilityOf(locus(prediction, "CREST"), "Cr_plain")).toBeCloseTo(0.25, 12);
    expect(probabilityOf(locus(prediction, "CREST"), "Cr_grand/Cr_plain")).toBeCloseTo(0.25, 12);
    expect(prediction.caveats.some((c) => /only shows in males/.test(c))).toBe(true);
  });
});

describe("guard rails", () => {
  it("rejects empty and oversized target sets", () => {
    const sire = observedOnly(genomeFromSpec(map, "male", {}));
    const dam = observedOnly(genomeFromSpec(map, "female", {}));
    expect(() => predictOffspring(sire, dam, map, [])).toThrow(/at least one/);
    expect(() =>
      predictOffspring(sire, dam, map, ["DORSAL", "BUILD", "TAIL", "PIG", "MARK", "HUE", "SAT"]),
    ).toThrow(/at most/);
  });

  it("rejects a pairing that is not male and female", () => {
    const dam = observedOnly(genomeFromSpec(map, "female", {}));
    expect(() => predictOffspring(dam, dam, map, ["DORSAL"])).toThrow(/male sire/);
  });

  it("keeps every reported probability a valid distribution", () => {
    const sire = observedOnly(genomeFromSpec(map, "male", { BUILD: ["Bh", "Bs"], MARK: ["Ms", "Mb"] }));
    const dam = observedOnly(genomeFromSpec(map, "female", { BUILD: ["Bm", "Bm"], MARK: ["Ms", "Mn"] }));
    const prediction = predictOffspring(sire, dam, map, ["BUILD", "MARK"]);

    for (const entry of prediction.loci) {
      const total = entry.genotypes.reduce((sum, row) => sum + row.p, 0);
      expect(total).toBeCloseTo(1, 9);
      for (const row of entry.genotypes) {
        expect(row.min).toBeLessThanOrEqual(row.p + 1e-9);
        expect(row.max).toBeGreaterThanOrEqual(row.p - 1e-9);
      }
    }
  });
});
