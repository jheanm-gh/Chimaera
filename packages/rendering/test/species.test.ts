/**
 * The six-species gate (§6.4).
 *
 * `render.test.ts` proves the rig is sound on one species. This file proves the
 * *roster* is sound: that six body plans built from the same rig still read as
 * six different animals at icon size, that none of them can be pushed into a
 * broken shape by any genotype its gene map allows, and that a species' own
 * signature form alleles change its silhouette rather than only its colour.
 *
 * The distinctness floor is the interesting number. It is not "these look
 * different to me" — it is the fraction of pixels that differ between two
 * species' icons, measured, with a threshold that fails the build.
 */

import { createRng, expressPhenotype, geneMapFor, randomWildGenome, SPECIES } from "@chimaera/genetics";
import type { GeneMap, Phenotype } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import { renderCreature } from "../src/render.js";
import { planFor } from "../src/rig/plans.js";
import {
  componentCount,
  coverage,
  distinctness,
  rasteriseSilhouette,
  spread,
  toAscii,
} from "../src/silhouette.js";
import { toSvg } from "../src/svg.js";

const ICON = 32;

/**
 * A species' median animal: the same seed for every species, so the comparison
 * is between body plans rather than between lucky draws.
 */
function representative(map: GeneMap): Phenotype {
  return expressPhenotype(randomWildGenome(map, createRng(`plate:${map.species.id}`)), map);
}

function iconOf(phenotype: Phenotype, map: GeneMap) {
  return rasteriseSilhouette(renderCreature(phenotype, map), ICON);
}

function wildSample(map: GeneMap, count: number): Phenotype[] {
  const rng = createRng(`sweep:${map.species.id}`);
  return Array.from({ length: count }, () => expressPhenotype(randomWildGenome(map, rng), map));
}

describe("every species has a body plan", () => {
  for (const species of SPECIES) {
    it(`${species.name} draws from its own plan`, () => {
      const plan = planFor(species.id);
      expect(plan.species).toBe(species.id);
      // The plan names which trait drives each slot; a slot naming a trait the
      // species does not have would silently fall back to a default form, and
      // the animal would quietly stop responding to its own genes.
      const traits = new Set(geneMapFor(species).loci.map((locus) => locus.trait));
      for (const [slot, trait] of Object.entries(plan.traits)) {
        if (trait === undefined) continue;
        expect(traits.has(trait), `${species.id}.${slot} -> "${trait}"`).toBe(true);
      }
    });
  }
});

describe("silhouette test across the roster (§6.4)", () => {
  for (const species of SPECIES) {
    const map = geneMapFor(species);

    it(`${species.name} stays one connected shape for any wild genotype`, () => {
      for (const phenotype of wildSample(map, 40)) {
        const icon = iconOf(phenotype, map);
        const pieces = componentCount(icon);
        if (pieces !== 1) {
          throw new Error(`${species.name} broke into ${pieces} pieces:\n${toAscii(icon)}`);
        }
      }
    });

    it(`${species.name} fills its icon without becoming a blob or a speck`, () => {
      for (const phenotype of wildSample(map, 40)) {
        const filled = coverage(iconOf(phenotype, map));
        expect(filled).toBeGreaterThan(0.07);
        expect(filled).toBeLessThan(0.5);
      }
    });

    it(`${species.name} renders to well-formed markup`, () => {
      const svg = toSvg(renderCreature(representative(map), map));
      const opens = (svg.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
      const closes = (svg.match(/<\/[a-zA-Z]/g) ?? []).length + (svg.match(/\/>/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(svg).not.toContain("NaN");
    });
  }
});

describe("the roster is legible at icon size", () => {
  const icons = SPECIES.map((species) => {
    const map = geneMapFor(species);
    return { name: species.name, icon: iconOf(representative(map), map) };
  });

  /**
   * 10% is the floor, not the target. Below it two species are the same
   * postage stamp with different colours, and the Ranch grid — which is where
   * players actually spend their time — stops being readable.
   */
  const FLOOR = 0.1;

  it("keeps every pair of species visibly different", () => {
    const report: string[] = [];
    let worst = { pair: "", value: 1 };
    for (let i = 0; i < icons.length; i++) {
      for (let j = i + 1; j < icons.length; j++) {
        const a = icons[i];
        const b = icons[j];
        if (!a || !b) continue;
        const value = distinctness(a.icon, b.icon);
        report.push(`${a.name} vs ${b.name}: ${(value * 100).toFixed(1)}%`);
        if (value < worst.value) worst = { pair: `${a.name} vs ${b.name}`, value };
      }
    }
    if (worst.value < FLOOR) {
      throw new Error(
        `closest pair ${worst.pair} at ${(worst.value * 100).toFixed(1)}%, floor is ${FLOOR * 100}%\n` +
          report.join("\n"),
      );
    }
  });

  it("gives the roster a spread of proportions rather than one shape in six colours", () => {
    const ratios = icons.map(({ icon }) => {
      const reach = spread(icon);
      return reach.x / Math.max(reach.y, 0.01);
    });
    const lo = Math.min(...ratios);
    const hi = Math.max(...ratios);
    // A serpent and a glider should not have the same aspect ratio.
    expect(hi / lo).toBeGreaterThan(1.6);
  });
});

describe("genes move the silhouette, not only the palette", () => {
  /**
   * Scale is deliberately *not* a signal here: `rasteriseSilhouette` crops to
   * content before it rasterises, so a uniformly larger animal produces the
   * same icon. That is correct — the Ranch grid should read a Bramblehog as a
   * Bramblehog whether it is a big one or a small one — and it means the only
   * thing that can move the icon is form.
   *
   * So the claim under test is about form: within one species, the gene map
   * must be able to produce two animals that are visibly different shapes.
   * A species whose whole range collapses to one icon has no form genetics
   * worth breeding for.
   */
  for (const species of SPECIES) {
    const map = geneMapFor(species);

    it(`${species.name} draws visibly different shapes across its own range`, () => {
      const icons = wildSample(map, 30).map((phenotype) => iconOf(phenotype, map));
      let widest = 0;
      for (let i = 0; i < icons.length; i++) {
        for (let j = i + 1; j < icons.length; j++) {
          const a = icons[i];
          const b = icons[j];
          if (a && b) widest = Math.max(widest, distinctness(a, b));
        }
      }
      expect(widest, `${species.name} widest within-species difference`).toBeGreaterThan(0.08);
    });

    it(`${species.name} keeps colour out of the silhouette`, () => {
      // Two animals identical in form and different in colour must rasterise
      // identically, or the icon is leaking pigment genetics into shape.
      const base = representative(map);
      const repainted: Phenotype = { ...base, colour: { h: 300, s: 0.7, l: 0.35 } };
      expect(distinctness(iconOf(base, map), iconOf(repainted, map))).toBe(0);
    });
  }
});
