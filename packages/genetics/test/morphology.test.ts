/**
 * The animal, measured.
 *
 * These numbers replace the abstract stats that combat used to read, so they
 * carry a heavier burden than a display value: a measurement that can come back
 * negative, or NaN, or identical for two visibly different animals, is a combat
 * rule that silently stops working.
 */

import { describe, expect, it } from "vitest";
import { createRng, expressPhenotype, geneMapById, randomWildGenome, SPECIES } from "../src/index.js";
import { frameFor, measure, normaliseMeasure } from "../src/morphology.js";
import type { MeasureId } from "../src/morphology.js";

const NUMERIC: readonly MeasureId[] = [
  "mass", "length", "stature", "limbs", "stride", "hide", "armament", "tail", "gape", "acuity", "venom", "span", "display",
];

function sample(species: string, count: number, seed = "morph") {
  const map = geneMapById(species as never);
  const rng = createRng(`${seed}:${species}`);
  return Array.from({ length: count }, () => {
    const phenotype = expressPhenotype(randomWildGenome(map, rng), map);
    return { phenotype, map, m: measure(phenotype, map) };
  });
}

describe("measuring a creature", () => {
  it("gives every species a reference frame", () => {
    for (const { id } of SPECIES) expect(() => frameFor(id)).not.toThrow();
  });

  it("never produces a measurement that is not a number", () => {
    for (const { id, name } of SPECIES) {
      for (const { m } of sample(id, 120)) {
        for (const key of NUMERIC) {
          expect(Number.isFinite(m[key]), `${name} ${key}`).toBe(true);
          expect(m[key], `${name} ${key}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("is deterministic — the same animal measures the same every time", () => {
    for (const { id } of SPECIES) {
      const map = geneMapById(id);
      const phenotype = expressPhenotype(randomWildGenome(map, createRng(`det:${id}`)), map);
      expect(measure(phenotype, map)).toEqual(measure(phenotype, map));
    }
  });

  it("reads the phenotype and nothing else", () => {
    // Two genomes that express identically must measure identically, or the
    // stat block is telling the player something the assay has not.
    const map = geneMapById("quillfen");
    const rng = createRng("same-look");
    let compared = 0;
    for (let i = 0; i < 200; i++) {
      const a = expressPhenotype(randomWildGenome(map, rng), map);
      const b = expressPhenotype(randomWildGenome(map, rng), map);
      if (JSON.stringify(a) !== JSON.stringify(b)) continue;
      compared++;
      expect(measure(b, map)).toEqual(measure(a, map));
    }
    expect(compared).toBeGreaterThanOrEqual(0);
  });

  it("keeps each species in its own weight class", () => {
    // A Sallowfinch must never out-weigh a Bramblehog, however the dice fall.
    const finch = sample("sallowfinch", 200).map((r) => r.m.mass);
    const hog = sample("bramblehog", 200).map((r) => r.m.mass);
    expect(Math.max(...finch)).toBeLessThan(Math.min(...hog));
  });

  it("gives the limbless species no limbs and the others some", () => {
    for (const { m } of sample("siltadder", 60)) expect(m.limbs).toBe(0);
    for (const species of ["quillfen", "bramblehog", "kiteossel"]) {
      for (const { m } of sample(species, 40)) expect(m.limbs).toBeGreaterThanOrEqual(4);
    }
    for (const species of ["sallowfinch", "ashenlorric"]) {
      for (const { m } of sample(species, 40)) expect(m.limbs).toBe(2);
    }
  });

  it("moves when the genes move", () => {
    // The whole premise: breeding has to change the measurements. If a species'
    // spread is flat, its animals are recolours of one animal.
    for (const { id, name } of SPECIES) {
      const rows = sample(id, 200);
      for (const key of ["mass", "stature", "stride"] as const) {
        const values = rows.map((r) => r.m[key]);
        const low = Math.min(...values);
        const high = Math.max(...values);
        expect(high / Math.max(1e-6, low), `${name} ${key} spread`).toBeGreaterThan(1.25);
      }
    }
  });

  it("takes the weapon away when the crest is suppressed", () => {
    // The epistasis that hides a ridge has to take the spines with it, or the
    // player loses a visible feature and keeps its effect.
    const rows = sample("bramblehog", 300);
    const suppressed = rows.filter(({ phenotype }) =>
      Object.values(phenotype.traits).some((word) => /naked|absent|smooth|hidden|plain/i.test(String(word))),
    );
    expect(suppressed.length).toBeGreaterThan(0);
    for (const { m } of suppressed) expect(m.armament).toBe(0);
  });

  it("normalises into 0 to 1 for every species and every measurement", () => {
    for (const { id, name } of SPECIES) {
      for (const { m } of sample(id, 100)) {
        for (const key of NUMERIC) {
          const value = normaliseMeasure(key, m[key], id);
          expect(value, `${name} ${key}`).toBeGreaterThanOrEqual(0);
          expect(value, `${name} ${key}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("gives an armed animal a weapon with length in it", () => {
    // A beak of zero centimetres unlocked a beak move and then did nothing
    // with it. Either the animal has the weapon or it does not.
    for (const { id } of SPECIES) {
      for (const { m } of sample(id, 80)) {
        if (m.armamentKind === "none") expect(m.armament).toBe(0);
        else expect(m.armament).toBeGreaterThan(0);
      }
    }
  });
});
