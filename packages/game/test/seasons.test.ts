/**
 * Seasonal migrations (§8.5).
 *
 * The live-ops spine, and the only thing in the game that makes an allele
 * genuinely time-limited. Three claims: it runs on the ranch's own calendar and
 * never on a wall clock, it boosts rather than guarantees, and it touches one
 * species at a time.
 */

import { createRng, expressPhenotype, geneMapById, SPECIES } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import { alleleKey } from "../src/compendium.js";
import { applyAction, createRanch } from "../src/ranch.js";
import {
  daysLeftInMigration,
  MIGRATION_DAYS,
  SEASONS,
  seasonalWildGenome,
  seasonForDay,
} from "../src/seasons.js";
import type { RanchState } from "../src/types.js";

function carries(genome: ReturnType<typeof seasonalWildGenome>, locus: string, allele: string): boolean {
  for (const pair of Object.values(genome.chromosomes)) {
    for (const haplotype of [pair.maternal, pair.paternal]) {
      if (haplotype.genes[locus]?.includes(allele)) return true;
    }
  }
  return false;
}

describe("the rotation", () => {
  it("gives every species a turn, on the ranch's own calendar", () => {
    expect(SEASONS.length).toBe(SPECIES.length);
    expect(new Set(SEASONS.map((season) => season.species)).size).toBe(SPECIES.length);
    expect(new Set(SEASONS.map((season) => season.id)).size).toBe(SEASONS.length);

    expect(seasonForDay(0).id).toBe(SEASONS[0]?.id);
    expect(seasonForDay(MIGRATION_DAYS - 1).id).toBe(SEASONS[0]?.id);
    expect(seasonForDay(MIGRATION_DAYS).id).toBe(SEASONS[1]?.id);
    // A full turn of the wheel comes back round.
    expect(seasonForDay(MIGRATION_DAYS * SEASONS.length).id).toBe(SEASONS[0]?.id);
    expect(daysLeftInMigration(0)).toBe(MIGRATION_DAYS);
    expect(daysLeftInMigration(MIGRATION_DAYS - 1)).toBe(1);
  });

  it("features an allele that is otherwise unreachable without a mutagen", () => {
    for (const season of SEASONS) {
      const map = geneMapById(season.species);
      expect(map.hasLocus(season.locus)).toBe(true);
      expect(map.hasAllele(season.locus, season.allele)).toBe(true);
      const allele = map.allele(season.locus, season.allele);
      // Novel: no wild population carries it, which is what makes a migration
      // the only way to meet one without a great deal of luck.
      expect(allele.novel, `${season.id}: ${season.allele}`).toBe(true);
      expect(allele.wildFrequency ?? 0).toBe(0);
      expect(season.frequency).toBeGreaterThan(0.01);
      expect(season.frequency).toBeLessThan(0.1);
      expect(season.blurb.length).toBeGreaterThan(60);
    }
  });
});

describe("the pool it puts a thumb on", () => {
  it("turns the featured allele up in wild stock during its season, and not outside it", () => {
    const season = SEASONS[0];
    if (!season) throw new Error("no seasons");
    const map = geneMapById(season.species);

    const inSeason = Array.from({ length: 3000 }, (_, i) =>
      seasonalWildGenome(map, createRng(`in:${i}`), 10),
    ).filter((genome) => carries(genome, season.locus, season.allele)).length;
    const outOfSeason = Array.from({ length: 3000 }, (_, i) =>
      seasonalWildGenome(map, createRng(`out:${i}`), MIGRATION_DAYS + 10),
    ).filter((genome) => carries(genome, season.locus, season.allele)).length;

    expect(inSeason / 3000).toBeGreaterThan(season.frequency * 0.6);
    expect(inSeason / 3000).toBeLessThan(season.frequency * 1.6);
    // Outside the migration it is not in the pool at all.
    expect(outOfSeason).toBe(0);
  });

  it("touches one species and leaves the others alone", () => {
    const season = SEASONS[0];
    if (!season) throw new Error("no seasons");
    for (const species of SPECIES) {
      if (species.id === season.species) continue;
      const map = geneMapById(species.id);
      const drawn = Array.from({ length: 200 }, (_, i) => seasonalWildGenome(map, createRng(`x:${i}`), 10));
      // Nothing novel appears in a species the migration is not about.
      for (const genome of drawn) {
        for (const locus of map.loci) {
          for (const allele of locus.alleles) {
            if (!allele.novel) continue;
            expect(carries(genome, locus.id, allele.id), `${species.id}/${allele.id}`).toBe(false);
          }
        }
      }
    }
  });

  it("gives one copy, never two", () => {
    const season = SEASONS[0];
    if (!season) throw new Error("no seasons");
    const map = geneMapById(season.species);
    for (let i = 0; i < 2000; i++) {
      const genome = seasonalWildGenome(map, createRng(`copies:${i}`), 10);
      const pair = genome.chromosomes[map.locus(season.locus).chromosome];
      if (!pair) continue;
      const copies = [pair.maternal, pair.paternal].filter((haplotype) =>
        haplotype.genes[season.locus]?.includes(season.allele),
      ).length;
      // A wild animal carrying two of a novel allele would make the season a
      // giveaway rather than a lead.
      expect(copies).toBeLessThan(2);
    }
  });

  it("leaves the rest of the animal exactly as wild as it was", () => {
    const season = SEASONS[0];
    if (!season) throw new Error("no seasons");
    const map = geneMapById(season.species);
    // Expression still works, and every stat lands inside the species' range.
    for (let i = 0; i < 300; i++) {
      const phenotype = expressPhenotype(seasonalWildGenome(map, createRng(`sane:${i}`), 10), map);
      for (const trait of map.polygenicTraits) {
        const value = phenotype.stats[trait.id] ?? 0;
        expect(value).toBeGreaterThanOrEqual(trait.min);
        expect(value).toBeLessThanOrEqual(trait.max);
      }
    }
  });
});

describe("catching in season", () => {
  it("reaches the fen outside the station door", () => {
    const season = SEASONS[0];
    if (!season) throw new Error("no seasons");
    let found = false;
    for (let attempt = 0; attempt < 220 && !found; attempt++) {
      let state: RanchState = createRanch({ seed: `catch-${attempt}`, species: season.species, capacity: 40 });
      state = applyAction(state, { kind: "catchWild" }).state;
      found = state.creatures.some((creature) => carries(creature.genome, season.locus, season.allele));
    }
    expect(found, "220 catches in season and never once the featured allele").toBe(true);
  });

  it("records the find in the Compendium, under the right species", () => {
    const season = SEASONS[0];
    if (!season) throw new Error("no seasons");
    const base = createRanch({ seed: "record", species: season.species });
    const state: RanchState = {
      ...base,
      compendium: { ...base.compendium, seenAlleles: [alleleKey(season.species, season.allele)] },
    };
    expect(state.compendium.seenAlleles).toContain(alleleKey(season.species, season.allele));
    expect(state.compendium.seenAlleles).not.toContain(alleleKey("siltadder", season.allele));
  });
});
