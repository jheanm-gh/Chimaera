/**
 * Mixed stock.
 *
 * A ranch used to be one species because the reducer was handed one gene map.
 * Now every creature carries its own species and the map is resolved from that
 * at the point of use, which is a correctness claim with teeth: express a
 * Silt-Adder's genome through a Quillfen's loci and you get a confident,
 * completely wrong animal.
 *
 * These tests play every species end to end, prove the two species cannot be
 * crossed, and prove that a creature brought home from another biome keeps
 * being what it is.
 */

import { geneMapById, SPECIES } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import { homeMap, mapOf, POSTINGS, speciesForBiome } from "../src/bestiary.js";
import { generateRegion } from "../src/expedition.js";
import { applyAction, createRanch, knownAlleles, phenotypeOf } from "../src/ranch.js";
import { loadRanch, saveRanch } from "../src/save.js";
import type { Action, Creature, RanchState } from "../src/types.js";

function play(state: RanchState, actions: readonly Action[]): RanchState {
  let current = state;
  for (const action of actions) current = applyAction(current, action).state;
  return current;
}

describe("every species can be played", () => {
  for (const species of SPECIES) {
    it(`${species.name} runs a station through breeding, ageing and evolution`, () => {
      let state = createRanch({ seed: `station:${species.id}`, species: species.id });
      expect(state.homeSpecies).toBe(species.id);
      expect(homeMap(state).species.id).toBe(species.id);
      expect(state.creatures.every((c) => c.species === species.id)).toBe(true);

      // Founders express through their own map, and their stats sit inside the
      // species' own declared range — the check that catches a crossed map.
      for (const creature of state.creatures) {
        const phenotype = phenotypeOf(creature);
        expect(phenotype.species).toBe(species.id);
        for (const trait of mapOf(creature).polygenicTraits) {
          const value = phenotype.stats[trait.id] ?? 0;
          expect(value).toBeGreaterThanOrEqual(trait.min);
          expect(value).toBeLessThanOrEqual(trait.max);
        }
      }

      const sire = state.creatures.find((c) => c.sex === "male" && c.stage === "adult");
      const dam = state.creatures.find((c) => c.sex === "female" && c.stage === "adult");
      if (!sire || !dam) throw new Error(`${species.id} founders cannot breed`);

      const before = state.creatures.length;
      state = play(state, [
        { kind: "breed", sireId: sire.id, damId: dam.id },
        { kind: "advanceDays", days: 70 },
      ]);
      expect(state.creatures.length).toBeGreaterThan(before);
      // Something in the herd reached adulthood and took a branch.
      expect(state.creatures.some((c) => c.branch !== undefined)).toBe(true);
      expect(state.creatures.every((c) => c.species === species.id)).toBe(true);
    });
  }
});

describe("species cannot be crossed", () => {
  it("refuses a pairing between two species and says why", () => {
    const quillfen = createRanch({ seed: "cross", species: "quillfen" });
    const adder = createRanch({ seed: "cross", species: "siltadder" });
    const sire = quillfen.creatures.find((c) => c.sex === "male");
    const dam = adder.creatures.find((c) => c.sex === "female");
    if (!sire || !dam) throw new Error("no pair");

    // A ranch holding both, which an expedition is the honest way to reach.
    const mixed: RanchState = { ...quillfen, creatures: [...quillfen.creatures, { ...dam, id: "x1" }] };
    const result = applyAction(mixed, { kind: "breed", sireId: sire.id, damId: "x1" });
    expect(result.events[0]).toMatchObject({ kind: "blocked" });
    expect(result.state.creatures.length).toBe(mixed.creatures.length);
  });

  it("keeps a foreign creature expressing through its own map", () => {
    const quillfen = createRanch({ seed: "mixed", species: "quillfen" });
    const adder = createRanch({ seed: "mixed", species: "siltadder" });
    const guest = adder.creatures[0];
    if (!guest) throw new Error("no guest");
    const mixed: RanchState = { ...quillfen, creatures: [...quillfen.creatures, { ...guest, id: "x1" }] };

    const resident = mixed.creatures[0] as Creature;
    expect(phenotypeOf(resident).species).toBe("quillfen");
    const foreign = mixed.creatures.find((c) => c.id === "x1") as Creature;
    expect(phenotypeOf(foreign).species).toBe("siltadder");
    expect(mapOf(foreign).species.id).toBe("siltadder");

    // Ageing a mixed herd resolves each animal's own map rather than throwing
    // on the first locus the home species does not have.
    const aged = applyAction(mixed, { kind: "advanceDays", days: 30 });
    expect(aged.state.creatures.length).toBe(mixed.creatures.length);
  });

  it("reads known alleles through each creature's own map", () => {
    const quillfen = createRanch({ seed: "known", species: "quillfen" });
    const adder = createRanch({ seed: "known", species: "siltadder" });
    const guest = adder.creatures[0];
    const resident = quillfen.creatures[0];
    if (!guest || !resident) throw new Error("no stock");

    const mixed: RanchState = {
      ...quillfen,
      creatures: [
        { ...resident, revealed: ["DORSAL"] },
        { ...guest, id: "x1", revealed: ["COILS"] },
      ],
    };
    // A locus id from each species. Reading either through the wrong map would
    // throw "unknown locus" rather than returning the wrong answer, which is
    // the failure mode this arrangement is meant to make impossible.
    const known = knownAlleles(mixed);
    expect(known.size).toBeGreaterThan(0);
  });
});

describe("biomes name species", () => {
  it("covers the whole roster, one biome each", () => {
    expect(POSTINGS.length).toBe(SPECIES.length);
    expect(new Set(POSTINGS.map((p) => p.biome)).size).toBe(SPECIES.length);
    for (const species of SPECIES) {
      expect(speciesForBiome(species.biome)).toBe(species.id);
    }
  });

  it("puts the destination's species in the region", () => {
    for (const posting of POSTINGS) {
      const map = geneMapById(posting.species);
      const region = generateRegion("r", { biome: map.species.biome, species: map.species.id });
      expect(region.species).toBe(posting.species);
      expect(speciesForBiome(region.biome)).toBe(posting.species);
    }
  });
});

describe("save migration to v3", () => {
  it("gives a v2 ranch a home species", () => {
    const state = createRanch({ seed: "legacy", species: "quillfen" });
    const legacy = JSON.parse(JSON.stringify(saveRanch(state))) as {
      version: number;
      state: Record<string, unknown>;
    };
    legacy.version = 2;
    delete legacy.state.homeSpecies;

    const loaded = loadRanch(legacy);
    expect(loaded.homeSpecies).toBe("quillfen");
    expect(homeMap(loaded).species.id).toBe("quillfen");
  });

  it("names the species of a region a v2 save was already exploring", () => {
    const state = createRanch({ seed: "legacy-run", species: "quillfen" });
    const region = generateRegion("r", { biome: "Galeshore", species: "kiteossel" });
    const withRun: RanchState = {
      ...state,
      expedition: {
        region,
        team: [],
        at: region.entry,
        visited: [region.entry],
        loot: { motes: 0, items: {}, fragments: {}, specimens: [] },
        status: "active",
        log: [],
        lost: [],
        rngCursor: 0,
      },
    };
    const legacy = JSON.parse(JSON.stringify(saveRanch(withRun))) as {
      version: number;
      state: { homeSpecies?: unknown; expedition?: { region?: { species?: unknown } } };
    };
    legacy.version = 2;
    delete legacy.state.homeSpecies;
    delete legacy.state.expedition?.region?.species;

    // Read back from the biome, not assumed: a v2 save was free to hold a
    // region generated with any biome string.
    expect(loadRanch(legacy).expedition?.region.species).toBe("kiteossel");
  });
});
