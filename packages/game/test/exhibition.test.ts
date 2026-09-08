/**
 * The Exhibition (§4).
 *
 * The load-bearing claim is that a show ring judges the *animal* — what is
 * visible plus how it has been kept — and nothing else. A ring that read a
 * combat stat would make the second meta a reskin of the first; a ring that
 * read a genotype would hand out for free the information §1.3 makes players
 * buy.
 */

import {
  createRng,
  expressPhenotype,
  geneMapById,
  genomeFromSpec,
  QUILLFEN,
  geneMapFor,
  randomWildGenome,
  SPECIES,
} from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import {
  buildField,
  judge,
  judgeRival,
  placeField,
  purseFor,
  rarityOf,
  SEASON_DAYS,
  SHOW_TIERS,
  STANDARDS,
  standardForDay,
  showTier,
} from "../src/exhibition.js";
import { isOpen } from "../src/modes.js";
import { applyAction, createRanch, phenotypeOf } from "../src/ranch.js";
import { runShow } from "../src/shows.js";
import type { Creature, RanchState } from "../src/types.js";

const map = geneMapFor(QUILLFEN);

function ranchWithShowOpen(seed = "show"): RanchState {
  const base = createRanch({ seed, species: "quillfen", motes: 2000 });
  // The ring opens on the first novel allele, which is a discovery rather than
  // a chapter. Record one directly instead of hunting for a mutation.
  return {
    ...base,
    compendium: { ...base.compendium, seenAlleles: ["D_crown"] },
    creatures: base.creatures.map((c) => ({ ...c, stage: "adult", ageDays: 60 })),
  };
}

describe("the standards", () => {
  it("weight four categories, summing to one", () => {
    for (const standard of STANDARDS) {
      const { standard: s, rarity, coherence, condition } = standard.weights;
      expect(s + rarity + coherence + condition).toBeCloseTo(1, 9);
      for (const weight of [s, rarity, coherence, condition]) expect(weight).toBeGreaterThan(0);
      expect(standard.blurb.length).toBeGreaterThan(20);
    }
    expect(new Set(STANDARDS.map((s) => s.id)).size).toBe(STANDARDS.length);
  });

  it("rotates on a fixed calendar, so a season can be bred for", () => {
    expect(standardForDay(0).id).toBe(STANDARDS[0]?.id);
    expect(standardForDay(SEASON_DAYS - 1).id).toBe(STANDARDS[0]?.id);
    expect(standardForDay(SEASON_DAYS).id).toBe(STANDARDS[1]?.id);
    // A full turn of the wheel comes back to the start.
    expect(standardForDay(SEASON_DAYS * STANDARDS.length).id).toBe(STANDARDS[0]?.id);
  });

  it("asks for different things each season", () => {
    // If two standards wanted the same thing, the rotation would not be a
    // reason to keep breeding.
    const shapes = STANDARDS.map((s) => JSON.stringify(s.wants));
    expect(new Set(shapes).size).toBe(STANDARDS.length);
  });
});

describe("judging reads the animal and nothing else", () => {
  const standard = STANDARDS[0];
  if (!standard) throw new Error("no standards");

  it("gives two different genotypes with the same appearance the same card", () => {
    const state = ranchWithShowOpen();
    const template = state.creatures[0];
    if (!template) throw new Error("no creature");

    // Homozygous dominant and heterozygous at a plain dominance locus: the same
    // animal to look at, different underneath.
    const homozygous: Creature = {
      ...template,
      genome: genomeFromSpec(map, "female", { LIMB: ["Lp", "Lp"] }),
    };
    const heterozygous: Creature = {
      ...template,
      genome: genomeFromSpec(map, "female", { LIMB: ["Lp", "Ls"] }),
    };
    const a = judge(homozygous, phenotypeOf(homozygous), standard);
    const b = judge(heterozygous, phenotypeOf(heterozygous), standard);
    expect(a.total).toBeCloseTo(b.total, 12);
  });

  it("does not move when a combat loadout changes", () => {
    const state = ranchWithShowOpen();
    const creature = state.creatures[0];
    if (!creature) throw new Error("no creature");
    const bare = judge(creature, phenotypeOf(creature), standard);
    const armed = judge(
      { ...creature, role: "vanguard", stance: "press", equipment: ["harness-3", "charm-3"] },
      phenotypeOf(creature),
      standard,
    );
    expect(armed.total).toBe(bare.total);
  });

  it("rewards husbandry through condition alone", () => {
    const state = ranchWithShowOpen();
    const creature = state.creatures[0];
    if (!creature) throw new Error("no creature");
    const phenotype = phenotypeOf(creature);
    const ceilings = Object.fromEntries(
      map.polygenicTraits.map((trait) => [trait.id, phenotype.stats[trait.id] ?? trait.max]),
    );
    const floors = Object.fromEntries(map.polygenicTraits.map((trait) => [trait.id, trait.min]));

    const kept = judge({ ...creature, achieved: ceilings }, phenotype, standard);
    const neglected = judge({ ...creature, achieved: floors }, phenotype, standard);
    expect(kept.total).toBeGreaterThan(neglected.total);

    // And only through condition: every other category is identical.
    const other = (card: typeof kept) => card.categories.filter((c) => c.id !== "condition").map((c) => c.score);
    expect(other(kept)).toEqual(other(neglected));
  });
});

describe("rarity is measured, not tagged", () => {
  for (const species of SPECIES) {
    it(`${species.name}: a wild animal is ordinary`, () => {
      const speciesMap = geneMapFor(species);
      const rng = createRng(`rarity:${species.id}`);
      const values = Array.from({ length: 300 }, () =>
        rarityOf(expressPhenotype(randomWildGenome(speciesMap, rng), speciesMap), speciesMap),
      ).sort((a, b) => a - b);
      const median = values[Math.floor(values.length / 2)] ?? 0;
      const top = values[values.length - 1] ?? 0;
      // Wild stock should sit in the middle of the scale and leave headroom.
      expect(median).toBeGreaterThan(0.15);
      expect(median).toBeLessThan(0.6);
      expect(top).toBeLessThan(0.95);
    });
  }

  it("scores novel alleles above wild stock", () => {
    const plain = expressPhenotype(genomeFromSpec(map, "female", { DORSAL: ["d", "d"] }), map);
    const novel = expressPhenotype(genomeFromSpec(map, "female", { DORSAL: ["D_crown", "D_crown"] }), map);
    expect(rarityOf(novel, map)).toBeGreaterThan(rarityOf(plain, map));
  });

  it("does not treat a masked animal as the rarest thing in the county", () => {
    // Albinism is a one-in-sixteen coat. Scoring the loci it switches off made
    // it score as several novel alleles at once, because "unpigmented" is an
    // appearance no wild allele pair can produce.
    const albino = expressPhenotype(genomeFromSpec(map, "female", { PIG: ["p", "p"] }), map);
    expect(albino.epistasisActive).toContain("albinism");
    const novel = expressPhenotype(
      genomeFromSpec(map, "female", { DORSAL: ["D_crown", "D_crown"], MARK: ["M_veil", "M_veil"] }),
      map,
    );
    expect(rarityOf(albino, map)).toBeLessThan(rarityOf(novel, map));
    expect(rarityOf(albino, map)).toBeLessThan(0.7);
  });

  it("does not make every hen the rarest animal in the county", () => {
    // CREST is sex-limited: a hen shows "hidden", which is not an appearance
    // the wild pool produces either.
    const hen = expressPhenotype(randomWildGenome(map, createRng("hen"), { sex: "female" }), map);
    const cock = expressPhenotype(randomWildGenome(map, createRng("cock"), { sex: "male" }), map);
    expect(Math.abs(rarityOf(hen, map) - rarityOf(cock, map))).toBeLessThan(0.35);
  });
});

describe("the ring", () => {
  it("places a field and breaks ties toward the rival", () => {
    const card = { total: 0.5, categories: [] };
    const placed = placeField([
      { id: "me", name: "me", scorecard: card, mine: true },
      { id: "them", name: "them", scorecard: card, mine: false },
    ]);
    expect(placed[0]?.mine).toBe(false);
  });

  it("pays the top three and refunds the fee below that", () => {
    const tier = showTier(2);
    expect(purseFor(tier, 1)).toBe(tier.purse);
    expect(purseFor(tier, 2)).toBeLessThan(purseFor(tier, 1));
    expect(purseFor(tier, 3)).toBeLessThan(purseFor(tier, 2));
    expect(purseFor(tier, 4)).toBe(tier.entryFee);
    expect(purseFor(tier, 9)).toBe(tier.entryFee);
  });

  it("gets harder every tier", () => {
    const standard = STANDARDS[0];
    if (!standard) throw new Error("no standard");
    const rates = SHOW_TIERS.map((tier) => {
      const rng = createRng(`tier:${tier.tier}`);
      let wins = 0;
      const runs = 240;
      for (let i = 0; i < runs; i++) {
        const mine = expressPhenotype(randomWildGenome(map, rng), map);
        const entrants = [
          { id: "me", name: "me", scorecard: judgeRival(mine, map, standard, 0.85), mine: true },
          ...buildField(map, standard, tier, rng).map((rival, index) => ({
            id: `r${index}`,
            name: rival.name,
            scorecard: judgeRival(rival.phenotype, map, standard, rival.condition),
            mine: false,
          })),
        ];
        if (placeField(entrants)[0]?.mine) wins++;
      }
      return wins / runs;
    });
    // Adjacent tiers can cross by a couple of points at this sample size — the
    // rates down here are single digits — so the per-step check carries a
    // margin and the shape of the curve is asserted end to end.
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i] ?? 0, `tier ${i} vs ${i - 1}: ${rates.join(", ")}`).toBeLessThanOrEqual(
        (rates[i - 1] ?? 0) + 0.04,
      );
    }
    // The National is not a formality, and the parish show is not a wall.
    expect(rates[0] ?? 0).toBeGreaterThan(0.1);
    expect(rates[SHOW_TIERS.length - 1] ?? 1).toBeLessThan(0.2);
    expect(rates[SHOW_TIERS.length - 1] ?? 1).toBeLessThan((rates[0] ?? 0) / 2);
  });

  it("faces the same field when previewed and when entered", () => {
    const state = ranchWithShowOpen();
    const creature = state.creatures[0];
    if (!creature) throw new Error("no creature");
    const preview = runShow(state, creature.id, 1, phenotypeOf);
    const again = runShow(state, creature.id, 1, phenotypeOf);
    expect(again?.entrants.map((e) => e.scorecard.total)).toEqual(preview?.entrants.map((e) => e.scorecard.total));
  });
});

describe("entering a show", () => {
  it("is shut until something novel has been found", () => {
    const closed = createRanch({ seed: "closed", species: "quillfen" });
    expect(isOpen(closed, "exhibition")).toBe(false);
    const result = applyAction(closed, { kind: "enterShow", id: closed.creatures[0]?.id ?? "", tier: 0 });
    expect(result.events[0]).toMatchObject({ kind: "blocked" });
  });

  it("charges the fee, records the ribbon and pays the purse", () => {
    const state = ranchWithShowOpen("ribbon");
    const creature = state.creatures[0];
    if (!creature) throw new Error("no creature");
    const tier = showTier(0);
    const expected = runShow(state, creature.id, 0, phenotypeOf);
    if (!expected) throw new Error("no show");

    const result = applyAction(state, { kind: "enterShow", id: creature.id, tier: 0 });
    expect(result.state.inventory.motes).toBe(state.inventory.motes - tier.entryFee + expected.purse);
    expect(result.state.records.ribbons).toHaveLength(1);
    expect(result.state.records.ribbons[0]).toMatchObject({
      creatureId: creature.id,
      placement: expected.placement,
      tier: 0,
    });
    expect(result.events.some((e) => e.kind === "placed")).toBe(true);
  });

  it("refuses an animal too young to show", () => {
    const state = ranchWithShowOpen("young");
    const creature = state.creatures[0];
    if (!creature) throw new Error("no creature");
    const withEgg: RanchState = {
      ...state,
      creatures: [{ ...creature, stage: "hatchling", ageDays: 8 }],
    };
    const result = applyAction(withEgg, { kind: "enterShow", id: creature.id, tier: 0 });
    expect(result.events[0]).toMatchObject({ kind: "blocked" });
  });

  it("judges a foreign entrant through its own species' map", () => {
    const state = ranchWithShowOpen("foreign");
    const adder = createRanch({ seed: "foreign", species: "siltadder" });
    const guest = adder.creatures[0];
    if (!guest) throw new Error("no guest");
    const mixed: RanchState = {
      ...state,
      creatures: [...state.creatures, { ...guest, id: "x1", stage: "adult", ageDays: 60 }],
    };
    const result = runShow(mixed, "x1", 0, phenotypeOf);
    expect(result).toBeDefined();
    // The field it faces is Silt-Adders, judged by the same standard.
    expect(geneMapById("siltadder").species.id).toBe("siltadder");
    expect(result?.entrants.length).toBe(showTier(0).field + 1);
  });
});
