/**
 * Species data integrity.
 *
 * Genetics authoring errors are miserable to debug three thousand offspring
 * deep, so the compiler rejects them up front and this file proves it does.
 * The second half asserts the design invariants the master brief makes binding,
 * so any future species has to satisfy them too.
 */

import { describe, expect, it } from "vitest";
import { GeneMap } from "../src/genemap.js";
import { QUILLFEN } from "../src/species/quillfen.js";
import { SPECIES, geneMapFor } from "../src/species/index.js";
import type { SpeciesDef } from "../src/types.js";
import { map } from "./helpers.js";

function mutate(change: (draft: SpeciesDef) => SpeciesDef): () => GeneMap {
  return () => new GeneMap(change(structuredClone(QUILLFEN) as SpeciesDef));
}

describe("gene map validation", () => {
  it("accepts the shipping species", () => {
    expect(() => new GeneMap(QUILLFEN)).not.toThrow();
  });

  it("rejects two loci at the same map position", () => {
    expect(
      mutate((draft) => ({
        ...draft,
        loci: draft.loci.map((l) => (l.id === "BUILD" ? { ...l, position: 8 } : l)),
      })),
    ).toThrow(/share position/);
  });

  it("rejects a locus positioned off the end of its chromosome", () => {
    expect(
      mutate((draft) => ({
        ...draft,
        loci: draft.loci.map((l) => (l.id === "TAIL" ? { ...l, position: 400 } : l)),
      })),
    ).toThrow(/is off chromosome/);
  });

  it("rejects a sex-linked locus on an autosome and vice versa", () => {
    expect(
      mutate((draft) => ({
        ...draft,
        loci: draft.loci.map((l) => (l.id === "DORSAL" ? { ...l, onlyOn: "X" as const } : l)),
      })),
    ).toThrow(/sex-linked but sits on an autosome/);

    expect(
      mutate((draft) => ({
        ...draft,
        loci: draft.loci.map((l) => (l.id === "CREST" ? { ...l, onlyOn: undefined } : l)),
      })),
    ).toThrow(/must declare onlyOn/);
  });

  it("rejects a dominance allele with no rank or no phenotype label", () => {
    expect(
      mutate((draft) => ({
        ...draft,
        loci: draft.loci.map((l) =>
          l.id === "DORSAL" ? { ...l, alleles: l.alleles.map((a) => ({ ...a, dominance: undefined })) } : l,
        ),
      })),
    ).toThrow(/needs a dominance rank/);
  });

  it("rejects a novel allele that also occurs in the wild", () => {
    expect(
      mutate((draft) => ({
        ...draft,
        loci: draft.loci.map((l) =>
          l.id === "HUE"
            ? { ...l, alleles: l.alleles.map((a) => (a.novel ? { ...a, wildFrequency: 0.1 } : a)) }
            : l,
        ),
      })),
    ).toThrow(/cannot occur in wild stock/);
  });

  it("rejects a polygenic trait outside the 3-5 locus band", () => {
    expect(
      mutate((draft) => ({
        ...draft,
        polygenicTraits: draft.polygenicTraits.map((t) =>
          t.id === "speed" ? { ...t, loci: ["SPD_A", "SPD_C"] } : t,
        ),
      })),
    ).toThrow(/the design calls for 3-5/);
  });

  it("rejects a palette hue range that wraps through zero", () => {
    expect(
      mutate((draft) => ({ ...draft, palette: { ...draft.palette, hue: [340, 70] } })),
    ).toThrow(/must not wrap through 0/);
  });

  it("rejects a coupling rule that spans chromosomes", () => {
    expect(
      mutate((draft) => ({
        ...draft,
        wildCoupling: draft.wildCoupling.map((r) => ({ ...r, thenLocus: "PIG" })),
      })),
    ).toThrow(/spans chromosomes/);
  });

  it("rejects epistasis referencing an unknown allele", () => {
    expect(
      mutate((draft) => ({
        ...draft,
        epistasis: draft.epistasis.map((r) => ({ ...r, when: { kind: "homozygous" as const, allele: "nope" } })),
      })),
    ).toThrow(/unknown allele/);
  });
});

describe("design invariants every species must hold", () => {
  for (const species of SPECIES) {
    describe(species.name, () => {
      const compiled = geneMapFor(species);

      it("implements all seven inheritance modes", () => {
        const modes = new Set(compiled.loci.map((l) => l.mode.kind));
        expect(modes).toContain("dominance");
        expect(modes).toContain("incomplete_dominance");
        expect(modes).toContain("codominance");
        expect(modes).toContain("polygenic");
        expect(species.epistasis.length).toBeGreaterThan(0);
        expect(compiled.loci.some((l) => l.onlyOn === "X")).toBe(true);
        expect(compiled.loci.some((l) => l.expressedInSex)).toBe(true);
        expect(compiled.loci.some((l) => l.alleles.some((a) => a.lethal))).toBe(true);
      });

      it("carries at least two lethal alleles", () => {
        const lethals = compiled.loci.flatMap((l) => l.alleles.filter((a) => a.lethal));
        expect(lethals.length).toBeGreaterThanOrEqual(2);
      });

      it("keeps lethal alleles rare enough to hunt but common enough to meet", () => {
        for (const locus of compiled.loci) {
          for (const allele of locus.alleles) {
            if (!allele.lethal) continue;
            expect(allele.wildFrequency ?? 0).toBeGreaterThan(0);
            expect(allele.wildFrequency ?? 0).toBeLessThan(0.15);
          }
        }
      });

      it("has three chromosomes plus a sex pair", () => {
        expect(compiled.chromosomes.filter((c) => c.def.type === "autosome").length).toBe(3);
        expect(compiled.chromosomes.filter((c) => c.def.type === "sex").length).toBe(1);
      });

      it("has at least two sex-chromosome loci", () => {
        expect(compiled.sexChromosome.loci.length).toBeGreaterThanOrEqual(2);
      });

      it("offers novel allele slots for the discovery hook", () => {
        const novel = compiled.loci.flatMap((l) => l.alleles.filter((a) => a.novel));
        expect(novel.length).toBeGreaterThanOrEqual(3);
      });

      it("gives every locus a wild allele pool that sums sensibly", () => {
        for (const locus of compiled.loci) {
          const pool = compiled.wildPool(locus.id);
          const total = pool.weights.reduce((a, b) => a + b, 0);
          expect(total).toBeCloseTo(1, 6);
          expect(pool.alleles.length).toBeGreaterThanOrEqual(2);
        }
      });

      it("puts at least one tightly linked pair on the map, for drag", () => {
        const tight = compiled.chromosomes.some((chromosome) =>
          chromosome.gapMorgans.some((gap) => gap > 0 && gap <= 0.05),
        );
        expect(tight).toBe(true);
      });

      it("keeps the epistatic gate unlinked from what it masks", () => {
        for (const rule of species.epistasis) {
          const gate = compiled.locus(rule.gate);
          const masked = compiled.loci.filter((l) => l.tags?.some((t) => rule.masksTags.includes(t)));
          expect(masked.length).toBeGreaterThan(0);
          for (const locus of masked) {
            expect(locus.chromosome).not.toBe(gate.chromosome);
          }
        }
      });

      it("constrains the palette so procedural colour cannot turn to mud", () => {
        const [hueLo, hueHi] = species.palette.hue;
        expect(hueHi - hueLo).toBeLessThanOrEqual(300);
        expect(species.palette.saturation[1]).toBeLessThanOrEqual(0.85);
        expect(species.palette.lightness[0]).toBeGreaterThanOrEqual(0.2);
        expect(species.palette.lightness[1]).toBeLessThanOrEqual(0.8);
      });

      it("has the ecology fields the species bible requires", () => {
        expect(species.inspiration.length).toBeGreaterThan(10);
        expect(species.hook.length).toBeGreaterThan(10);
        expect(species.biome.length).toBeGreaterThan(2);
      });
    });
  }
});

describe("gene map lookups", () => {
  it("throws helpfully on unknown ids", () => {
    expect(() => map.locus("NOPE")).toThrow(/unknown locus/);
    expect(() => map.allele("DORSAL", "NOPE")).toThrow(/unknown allele/);
    expect(() => map.polygenicTrait("charisma")).toThrow(/unknown polygenic trait/);
  });

  it("caches compiled maps per species", () => {
    expect(geneMapFor(QUILLFEN)).toBe(geneMapFor(QUILLFEN));
  });

  it("orders loci by map position within each chromosome", () => {
    for (const chromosome of map.chromosomes) {
      const positions = chromosome.loci.map((l) => l.position);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(chromosome.gapMorgans.length).toBe(Math.max(0, chromosome.loci.length - 1));
    }
  });
});
