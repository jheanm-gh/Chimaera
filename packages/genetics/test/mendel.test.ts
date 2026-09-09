/**
 * Mendelian ratio tests (§1.7).
 *
 * Every cross here is one a first-year genetics textbook would set, run at
 * 10,000+ zygotes against the shipping Quillfen gene map. If these drift, the
 * game is lying to the player about the thing it is entirely about.
 */

import { describe, expect, it } from "vitest";
import { expressPhenotype } from "../src/expression.js";
import { genomeFromSpec } from "../src/genome.js";
import { fraction, map, phenotypes, tally, tolerance, zygotes } from "./helpers.js";

const N = 12_000;

describe("simple dominance", () => {
  it("gives 3:1 from a monohybrid cross", () => {
    const sire = genomeFromSpec(map, "male", { DORSAL: ["D", "d"] });
    const dam = genomeFromSpec(map, "female", { DORSAL: ["D", "d"] });
    const counts = tally(phenotypes(zygotes(sire, dam, "mendel:3:1", N)), (p) => p.traits.dorsal as string);

    expect(fraction(counts, "quilled", N)).toBeCloseTo(0.75, 1);
    expect(Math.abs(fraction(counts, "quilled", N) - 0.75)).toBeLessThan(tolerance(0.75, N));
    expect(Math.abs(fraction(counts, "smooth", N) - 0.25)).toBeLessThan(tolerance(0.25, N));
  });

  it("gives 1:1 from a test cross against the recessive", () => {
    const sire = genomeFromSpec(map, "male", { DORSAL: ["D", "d"] });
    const dam = genomeFromSpec(map, "female", { DORSAL: ["d", "d"] });
    const counts = tally(phenotypes(zygotes(sire, dam, "mendel:testcross", N)), (p) => p.traits.dorsal as string);

    expect(Math.abs(fraction(counts, "quilled", N) - 0.5)).toBeLessThan(tolerance(0.5, N));
    expect(Math.abs(fraction(counts, "smooth", N) - 0.5)).toBeLessThan(tolerance(0.5, N));
  });

  it("respects a multi-allele dominance series", () => {
    // Lp > Lc > Ls. A paddle/stub sire crossed to a clawed/stub dam gives
    // 1 paddle/clawed : 1 paddle/stub : 1 clawed/stub : 1 stub/stub
    // => 2 paddle : 1 clawed : 1 stub.
    const sire = genomeFromSpec(map, "male", { LIMB: ["Lp", "Ls"] });
    const dam = genomeFromSpec(map, "female", { LIMB: ["Lc", "Ls"] });
    const counts = tally(phenotypes(zygotes(sire, dam, "mendel:series", N)), (p) => p.traits.limbs as string);

    expect(Math.abs(fraction(counts, "paddle", N) - 0.5)).toBeLessThan(tolerance(0.5, N));
    expect(Math.abs(fraction(counts, "clawed", N) - 0.25)).toBeLessThan(tolerance(0.25, N));
    expect(Math.abs(fraction(counts, "stub", N) - 0.25)).toBeLessThan(tolerance(0.25, N));
  });
});

describe("incomplete dominance", () => {
  it("gives 1:2:1 with a distinct, intermediate heterozygote", () => {
    const sire = genomeFromSpec(map, "male", { BUILD: ["Bh", "Bs"] });
    const dam = genomeFromSpec(map, "female", { BUILD: ["Bh", "Bs"] });
    const results = phenotypes(zygotes(sire, dam, "mendel:1:2:1", N));
    const counts = tally(results, (p) => (p.values.build as number).toFixed(2));

    expect(Math.abs(fraction(counts, "1.00", N) - 0.25)).toBeLessThan(tolerance(0.25, N));
    expect(Math.abs(fraction(counts, "0.50", N) - 0.5)).toBeLessThan(tolerance(0.5, N));
    expect(Math.abs(fraction(counts, "0.00", N) - 0.25)).toBeLessThan(tolerance(0.25, N));
  });

  it("makes the heterozygote indistinguishable from the intermediate homozygote", () => {
    const het = genomeFromSpec(map, "female", { BUILD: ["Bh", "Bs"] });
    const homozygousIntermediate = genomeFromSpec(map, "female", { BUILD: ["Bm", "Bm"] });
    const [a, b] = phenotypes([het, homozygousIntermediate]);

    expect(a?.traits.build).toBe("Middling");
    expect(a?.traits.build).toBe(b?.traits.build);
    expect(a?.values.build).toBe(b?.values.build);
  });
});

describe("co-dominance", () => {
  it("gives 1:2:1 with both marks layered in the heterozygote", () => {
    const sire = genomeFromSpec(map, "male", { TAIL: ["Tf", "Tw"] });
    const dam = genomeFromSpec(map, "female", { TAIL: ["Tf", "Tw"] });
    const counts = tally(phenotypes(zygotes(sire, dam, "mendel:codom", N)), (p) => p.traits.tail as string);

    expect(Math.abs(fraction(counts, "fan", N) - 0.25)).toBeLessThan(tolerance(0.25, N));
    expect(Math.abs(fraction(counts, "fan+whip", N) - 0.5)).toBeLessThan(tolerance(0.5, N));
    expect(Math.abs(fraction(counts, "whip", N) - 0.25)).toBeLessThan(tolerance(0.25, N));
  });

  it("layers co-dominant marking loci into the render list, and nothing else", () => {
    const [pheno] = phenotypes([genomeFromSpec(map, "female", { TAIL: ["Tf", "Tw"], MARK: ["Ms", "Mb"] })]);
    // Both marking alleles stack. The tail is a part slot, not a marking layer.
    expect(pheno?.marks).toEqual(["bands", "spots"]);
    expect(pheno?.traits.tail).toBe("fan+whip");
  });
});

describe("dihybrid cross", () => {
  it("gives 9:3:3:1 for two unlinked loci on different chromosomes", () => {
    // DORSAL is on C1, PIG on C3, so they assort independently.
    const spec = { DORSAL: ["D", "d"] as const, PIG: ["P", "p"] as const };
    const sire = genomeFromSpec(map, "male", spec);
    const dam = genomeFromSpec(map, "female", spec);
    const counts = tally(
      phenotypes(zygotes(sire, dam, "mendel:9:3:3:1", N)),
      (p) => `${p.traits.dorsal}/${p.traits.pigmentation}`,
    );

    expect(Math.abs(fraction(counts, "quilled/pigmented", N) - 9 / 16)).toBeLessThan(tolerance(9 / 16, N));
    expect(Math.abs(fraction(counts, "quilled/albino", N) - 3 / 16)).toBeLessThan(tolerance(3 / 16, N));
    expect(Math.abs(fraction(counts, "smooth/pigmented", N) - 3 / 16)).toBeLessThan(tolerance(3 / 16, N));
    expect(Math.abs(fraction(counts, "smooth/albino", N) - 1 / 16)).toBeLessThan(tolerance(1 / 16, N));
  });
});

describe("epistasis", () => {
  it("gives 9:3:4 when the pigment switch masks the markings locus", () => {
    // Recessive epistasis: p/p hides everything the colour loci did.
    const spec = { PIG: ["P", "p"] as const, MARK: ["Ms", "Mn"] as const };
    const sire = genomeFromSpec(map, "male", spec);
    const dam = genomeFromSpec(map, "female", spec);
    const counts = tally(phenotypes(zygotes(sire, dam, "mendel:9:3:4", N)), (p) =>
      p.traits.pigmentation === "albino" ? "albino" : (p.traits.markings as string),
    );

    expect(Math.abs(fraction(counts, "spots", N) - 9 / 16)).toBeLessThan(tolerance(9 / 16, N));
    expect(Math.abs(fraction(counts, "none", N) - 3 / 16)).toBeLessThan(tolerance(3 / 16, N));
    expect(Math.abs(fraction(counts, "albino", N) - 4 / 16)).toBeLessThan(tolerance(4 / 16, N));
  });

  it("hides every pigment-tagged locus but leaves untagged ones alone", () => {
    const albino = genomeFromSpec(map, "female", {
      PIG: ["p", "p"],
      MARK: ["Ms", "Mb"],
      PRISM: ["Pr_star", "Pr_wild"],
      DORSAL: ["D", "D"],
      LANTERN: ["LN_star", "LN_wild"],
    });
    const [pheno] = phenotypes([albino]);

    expect(pheno?.epistasisActive).toEqual(["albinism"]);
    expect(pheno?.traits.markings).toBe("unpigmented");
    expect(pheno?.traits.sheen).toBe("unpigmented");
    expect(pheno?.marks).toEqual([]);
    // Form and bioluminescence are not pigment, so they still show.
    expect(pheno?.traits.dorsal).toBe("quilled");
    expect(pheno?.traits.lantern).toBe("lantern");
    expect(pheno?.colour).toEqual(map.species.epistasis[0]?.setColour);
  });

  it("leaves the prized prism sheen visible when pigment works", () => {
    const [pheno] = phenotypes([
      genomeFromSpec(map, "female", { PIG: ["P", "p"], PRISM: ["Pr_star", "Pr_wild"] }),
    ]);
    expect(pheno?.traits.sheen).toBe("prismatic");
    expect(pheno?.epistasisActive).toEqual([]);
  });
});

describe("sex determination and sex linkage", () => {
  it("produces a 1:1 sex ratio", () => {
    const sire = genomeFromSpec(map, "male", {});
    const dam = genomeFromSpec(map, "female", {});
    const counts = tally(phenotypes(zygotes(sire, dam, "mendel:sex", N)), (p) => p.sex);

    expect(Math.abs(fraction(counts, "male", N) - 0.5)).toBeLessThan(tolerance(0.5, N));
  });

  it("passes an X-linked, sex-limited crest from dam to son only", () => {
    const dam = genomeFromSpec(map, "female", { CREST: ["Cr_grand", "Cr_plain"] });
    const sire = genomeFromSpec(map, "male", { CREST: ["Cr_plain", null] });
    const results = phenotypes(zygotes(sire, dam, "mendel:sexlinked", N));

    const sons = results.filter((p) => p.sex === "male");
    const daughters = results.filter((p) => p.sex === "female");

    // Sons take their only X from the dam: half get her grand allele.
    const grandSons = sons.filter((p) => p.traits.crest === "grand").length;
    expect(Math.abs(grandSons / sons.length - 0.5)).toBeLessThan(tolerance(0.5, sons.length));

    // Daughters carry it invisibly. That is the whole point of sex limitation.
    expect(daughters.every((p) => p.traits.crest === "hidden")).toBe(true);
  });

  it("puts Y-linked loci in sons and nowhere else", () => {
    const sire = genomeFromSpec(map, "male", { TUSK: [null, "Tk_yes"] });
    const dam = genomeFromSpec(map, "female", {});
    const results = phenotypes(zygotes(sire, dam, "mendel:ylinked", 2000));

    expect(results.filter((p) => p.sex === "male").every((p) => p.traits.tusk === "tusked")).toBe(true);
    expect(results.filter((p) => p.sex === "female").every((p) => p.traits.tusk === "none")).toBe(true);
  });

  it("dosage-compensates X-linked stat loci so males are not born slower", () => {
    // Same X-linked speed allele, one copy in the son and two in the daughter:
    // their speed ceilings must match.
    const son = genomeFromSpec(map, "male", { SPD_B: ["SB2", null], SPD_A: ["SA1", "SA1"], SPD_C: ["SC1", "SC1"] });
    const daughter = genomeFromSpec(map, "female", {
      SPD_B: ["SB2", "SB2"],
      SPD_A: ["SA1", "SA1"],
      SPD_C: ["SC1", "SC1"],
    });
    const [male, female] = phenotypes([son, daughter]);
    expect(male?.stats.speed).toBeCloseTo(female?.stats.speed as number, 10);
  });
});

describe("polygenic stats", () => {
  it("spans the authored range from worst to best genotype", () => {
    const worst = genomeFromSpec(map, "female", { SPD_A: ["SA0", "SA0"], SPD_B: ["SB0", "SB0"], SPD_C: ["SC0", "SC0"] });
    const best = genomeFromSpec(map, "female", { SPD_A: ["SA2", "SA2"], SPD_B: ["SB2", "SB2"], SPD_C: ["SC2", "SC2"] });
    const [low, high] = phenotypes([worst, best]);

    expect(low?.stats.speed).toBeCloseTo(12, 6);
    expect(high?.stats.speed).toBeCloseTo(120, 6);
  });

  it("stacks additively across contributing loci", () => {
    const trait = map.polygenicTrait("speed");
    const step = (trait.max - trait.min) / (trait.rawMax - trait.rawMin);
    const base = genomeFromSpec(map, "female", { SPD_A: ["SA0", "SA0"], SPD_B: ["SB0", "SB0"], SPD_C: ["SC0", "SC0"] });
    const oneStep = genomeFromSpec(map, "female", { SPD_A: ["SA1", "SA0"], SPD_B: ["SB0", "SB0"], SPD_C: ["SC0", "SC0"] });
    const [a, b] = phenotypes([base, oneStep]);

    expect((b?.stats.speed as number) - (a?.stats.speed as number)).toBeCloseTo(step, 6);
  });

  it("does not let a single locus be read off the stat", () => {
    // Two different genotypes, same total: the stat cannot identify either.
    const left = genomeFromSpec(map, "female", { SPD_A: ["SA2", "SA0"], SPD_B: ["SB1", "SB1"], SPD_C: ["SC1", "SC1"] });
    const right = genomeFromSpec(map, "female", { SPD_A: ["SA1", "SA1"], SPD_B: ["SB1", "SB1"], SPD_C: ["SC1", "SC1"] });
    const [a, b] = phenotypes([left, right]);
    expect(a?.stats.speed).toBeCloseTo(b?.stats.speed as number, 10);
  });
});

describe("dominance suppressors", () => {
  it("reveals a hidden recessive without touching the genome", () => {
    const carrier = genomeFromSpec(map, "female", { DORSAL: ["D", "d"] });

    expect(expressPhenotype(carrier, map).traits.dorsal).toBe("quilled");
    expect(expressPhenotype(carrier, map, { suppressDominanceAt: ["DORSAL"] }).traits.dorsal).toBe("smooth");
  });
});
