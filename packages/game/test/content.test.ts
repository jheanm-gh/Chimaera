/**
 * Content tests: evolution branches, the item catalogue, and the raising axes.
 *
 * This is the file that catches authored data going stale. Branch conditions
 * name allele ids, held items and habitats as *strings*, because they are data;
 * the compiler cannot check a string, so these tests do.
 */

import {
  createRng,
  expressPhenotype,
  geneMapFor,
  genomeFromSpec,
  genotypeAt,
  randomWildGenome,
  SPECIES,
} from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import { BRANCHES_BY_SPECIES } from "../src/branches.js";
import {
  DIETS,
  HABITATS,
  habitatFactor,
  HABITAT_MATCH,
  heldEffect,
  ITEMS,
  itemById,
  TRAINING,
} from "../src/content.js";
import type { EvolutionContext } from "../src/content.js";
import { branchesForSpecies, previewBranches, resolveBranch } from "../src/evolution.js";
import { currentStats, tickCreature } from "../src/lifecycle.js";
import { applyAction, createRanch, phenotypeOf } from "../src/ranch.js";
import type { Creature } from "../src/types.js";

// ---------------------------------------------------------------------------
// Evolution branches (§2.3)
// ---------------------------------------------------------------------------

/** A context that satisfies nothing: the floor branch must still resolve. */
const BARE: EvolutionContext = {
  build: 0.5,
  affinities: [],
  bond: 0,
  diet: "forage",
  habitat: "mirefen",
  training: "none",
  heldItem: undefined,
  achievement: { speed: 0, vigour: 0, focus: 0 },
  carries: () => false,
  traits: {},
};

/**
 * Trait maps this species can actually produce.
 *
 * Branch conditions compare `traits.plumage` against strings like `"bright"`,
 * and nothing in the type system says that string is one the gene map can
 * emit. Rather than reconstructing the labelling rules, sample real genomes and
 * express them: if no animal this species can produce satisfies a branch, the
 * branch is unreachable and the test should say so.
 */
function observedTraits(speciesId: string): Record<string, string>[] {
  const map = geneMapFor(SPECIES.find((s) => s.id === speciesId) ?? SPECIES[0]!);
  const rng = createRng(`traits:${speciesId}`);
  const seen = new Map<string, Record<string, string>>();
  for (let i = 0; i < 400; i++) {
    const traits = expressPhenotype(randomWildGenome(map, rng), map).traits as Record<string, string>;
    seen.set(JSON.stringify(traits), traits);
  }
  // Novel alleles are exactly the ones a secret branch is likely to want, and
  // they never appear in a wild draw.
  for (const locus of map.loci) {
    for (const allele of locus.alleles) {
      if (!allele.novel) continue;
      for (const sex of ["female", "male"] as const) {
        const genome = genomeFromSpec(map, sex, { [locus.id]: [allele.id, allele.id] });
        const traits = expressPhenotype(genome, map).traits as Record<string, string>;
        seen.set(JSON.stringify(traits), traits);
      }
    }
  }
  return [...seen.values()];
}

const MAXIMAL: Omit<EvolutionContext, "traits"> = {
  build: 1,
  affinities: ["mire", "ember", "gale", "umbral"],
  bond: 100,
  diet: "forage",
  habitat: "mirefen",
  training: "none",
  heldItem: undefined,
  achievement: { speed: 1, vigour: 1, focus: 1 },
  carries: () => true,
};

/**
 * Searches the shipped catalogue for a context that satisfies every condition.
 *
 * Conditions are independent predicates over one context, so this fixes the
 * trait map first (the only axis with hundreds of values) and then walks the
 * raising axes greedily, re-checking the whole branch at the end.
 */
function reachableContext(
  conditions: readonly { test: (ctx: EvolutionContext) => boolean }[],
  speciesId: string,
): EvolutionContext | undefined {
  const satisfies = (ctx: EvolutionContext): boolean => conditions.every((c) => c.test(ctx));
  for (const traits of observedTraits(speciesId)) {
    let ctx: EvolutionContext = { ...MAXIMAL, traits };
    for (const condition of conditions) {
      if (condition.test(ctx)) continue;
      const tries: EvolutionContext[] = [
        ...HABITATS.map((habitat) => ({ ...ctx, habitat: habitat.id })),
        ...ITEMS.map((item) => ({ ...ctx, heldItem: item.id })),
        ...DIETS.map((diet) => ({ ...ctx, diet: diet.id })),
        ...TRAINING.map((training) => ({ ...ctx, training: training.id })),
        { ...ctx, build: 0 },
        { ...ctx, affinities: [] },
      ];
      const win = tries.find((candidate) => condition.test(candidate));
      if (win) ctx = win;
    }
    if (satisfies(ctx)) return ctx;
  }
  return undefined;
}

/**
 * Wild animals, expressed, with everything the *genome* decides filled in and
 * everything raising decides left at its best.
 *
 * `carries` answers honestly from the genome, which is the point: a branch that
 * asks for a novel allele must not be satisfiable by a wild draw.
 */
function wildContexts(speciesId: string, count: number): EvolutionContext[] {
  const species = SPECIES.find((s) => s.id === speciesId) ?? SPECIES[0]!;
  const map = geneMapFor(species);
  const buildTrait = map.locus(map.species.palette.lightnessLocus).trait;
  const rng = createRng(`wild:${speciesId}`);
  return Array.from({ length: count }, () => {
    const genome = randomWildGenome(map, rng);
    const phenotype = expressPhenotype(genome, map);
    return {
      ...MAXIMAL,
      build: (buildTrait === undefined ? undefined : phenotype.values[buildTrait]) ?? 0.5,
      affinities: (phenotype.traits.affinity ?? "").split("+").filter(Boolean),
      traits: phenotype.traits as Record<string, string>,
      carries: (allele: string) =>
        map.loci.some((locus) => genotypeAt(genome, locus).includes(allele)),
    };
  });
}

/** The best raising this animal could be given, if any of it satisfies the branch. */
function bestRaising(
  conditions: readonly { test: (ctx: EvolutionContext) => boolean }[],
  base: EvolutionContext,
): EvolutionContext | undefined {
  for (const habitat of HABITATS) {
    for (const diet of DIETS) {
      for (const training of TRAINING) {
        for (const item of [undefined, ...ITEMS.map((i) => i.id)]) {
          const ctx: EvolutionContext = {
            ...base,
            habitat: habitat.id,
            diet: diet.id,
            training: training.id,
            heldItem: item,
          };
          if (conditions.every((condition) => condition.test(ctx))) return ctx;
        }
      }
    }
  }
  return undefined;
}

describe("every species has authored evolution branches", () => {
  for (const species of SPECIES) {
    const branches = branchesForSpecies(species.id);

    it(`${species.name} has three to five branches (§2.3)`, () => {
      expect(branches.length).toBeGreaterThanOrEqual(3);
      expect(branches.length).toBeLessThanOrEqual(5);
      expect(new Set(branches.map((b) => b.id)).size).toBe(branches.length);
      for (const branch of branches) {
        expect(branch.name.length).toBeGreaterThan(2);
        expect(branch.blurb.length).toBeGreaterThan(40);
        expect(branch.hint.length).toBeGreaterThan(10);
      }
    });

    it(`${species.name} ends in an unconditional floor branch`, () => {
      const last = branches[branches.length - 1];
      expect(last?.conditions.length).toBe(0);
      expect(last?.secret).toBeFalsy();
      // Nothing earlier may be unconditional, or it would swallow the list.
      for (const branch of branches.slice(0, -1)) {
        expect(branch.conditions.length).toBeGreaterThan(0);
      }
      expect(resolveBranch(BARE, species.id).id).toBe(last?.id);
    });

    it(`${species.name} hides exactly one branch behind genotype as well as raising`, () => {
      const secrets = branches.filter((b) => b.secret);
      expect(secrets.length).toBe(1);
      const secret = secrets[0];
      if (!secret) throw new Error("no secret branch");
      // The secret is the hardest one.
      for (const other of branches.filter((b) => b !== secret)) {
        expect(secret.conditions.length).toBeGreaterThan(other.conditions.length);
      }

      // And raising alone must not be enough. Give every wild animal perfect
      // bonding, a maxed-out achievement and the best habitat, diet, training
      // and held item the catalogue offers, then count how many can still reach
      // the branch. If most of them can, the "secret" is a checklist and the
      // genotype half of §2.3 is not being enforced.
      const wild = wildContexts(species.id, 120);
      const reachable = wild.filter((base) => bestRaising(secret.conditions, base) !== undefined);
      expect(
        reachable.length / wild.length,
        `${species.id}/${secret.id} is reachable by ${reachable.length}/${wild.length} wild animals on raising alone`,
      ).toBeLessThan(0.4);
    });

    it(`${species.name}'s branch conditions name real alleles`, () => {
      const map = geneMapFor(species);
      const known = new Set(map.loci.flatMap((locus) => locus.alleles.map((allele) => allele.id)));
      const asked: string[] = [];
      for (const branch of branches) {
        for (const condition of branch.conditions) {
          condition.test({
            ...BARE,
            carries: (allele) => {
              asked.push(allele);
              return false;
            },
          });
        }
      }
      for (const allele of asked) {
        expect(known.has(allele), `${species.id} branch asks for allele "${allele}"`).toBe(true);
      }
    });

    it(`${species.name} has no branch that can never fire`, () => {
      // Every branch, not only the secret one: a form authored into the game
      // that no animal can reach is content the player pays for and never sees.
      for (const branch of branches) {
        const context = reachableContext(branch.conditions, species.id);
        expect(context, `${species.id}/${branch.id} is unreachable`).toBeDefined();
        if (!context) continue;
        // And it must actually win the resolution, not be shadowed by an
        // earlier branch that the same animal also satisfies.
        const winner = resolveBranch(context, species.id);
        const winnerIndex = branches.findIndex((b) => b.id === winner.id);
        const ownIndex = branches.findIndex((b) => b.id === branch.id);
        expect(
          winnerIndex,
          `${species.id}/${branch.id} is shadowed by ${winner.id}`,
        ).toBeLessThanOrEqual(ownIndex);
      }
    });

    it(`${species.name}'s secret branch wins when everything lines up`, () => {
      const secret = branches.find((b) => b.secret);
      if (!secret) throw new Error("no secret branch");
      const context = reachableContext(secret.conditions, species.id);
      expect(context, `${species.id}/${secret.id} is unreachable`).toBeDefined();
      // The secret is listed first, so satisfying it must beat everything else.
      if (context) expect(resolveBranch(context, species.id).id).toBe(secret.id);
    });

    it(`${species.name} keeps the secret out of the preview until it is close`, () => {
      const preview = previewBranches(BARE, species.id);
      expect(preview.some((p) => p.secret)).toBe(false);
      expect(previewBranches(BARE, species.id, { revealSecrets: true }).some((p) => p.secret)).toBe(true);
    });
  }

  it("refuses to guess for a species nobody authored", () => {
    expect(() => branchesForSpecies("nonesuch")).toThrow(/no evolution branches/);
  });

  it("gives every species its own branch names", () => {
    const all = Object.values(BRANCHES_BY_SPECIES).flat();
    expect(new Set(all.map((b) => b.id)).size).toBe(all.length);
  });
});

// ---------------------------------------------------------------------------
// Raising axes
// ---------------------------------------------------------------------------

describe("the raising axes cover the roster", () => {
  it("gives every species a habitat that is actually its home", () => {
    for (const species of SPECIES) {
      const home = HABITATS.filter((habitat) => habitat.biome === species.biome);
      expect(home.length, `${species.name} has no home habitat`).toBeGreaterThan(0);
    }
  });

  it("keeps the habitat match ordered: home beats affinity beats neutral beats wrong", () => {
    expect(HABITAT_MATCH.home).toBeGreaterThan(HABITAT_MATCH.affinity);
    expect(HABITAT_MATCH.affinity).toBeGreaterThan(HABITAT_MATCH.neutral);
    expect(HABITAT_MATCH.neutral).toBeGreaterThan(HABITAT_MATCH.wrong);
  });

  it("never lets decor outrank the affinity allele", () => {
    const home = HABITATS.find((h) => h.biome === "Mirefen");
    if (!home) throw new Error("no mirefen habitat");
    const withGene = habitatFactor(home, "Mirefen", [home.affinity]);
    const withoutGene = habitatFactor(home, "Mirefen", []);
    // Decor floors the mismatch at neutral (see `tickCreature`); the best it
    // can ever do is 1, and the gene beats that.
    expect(Math.max(withoutGene, 1)).toBeLessThan(withGene);
  });
});

// ---------------------------------------------------------------------------
// Items (§5)
// ---------------------------------------------------------------------------

describe("the item catalogue", () => {
  it("covers every category the design calls for", () => {
    for (const category of ["breeding", "analysis", "raising", "combat"] as const) {
      if (category === "combat") continue; // combat gear lives in `combat.ts`
      expect(ITEMS.some((item) => item.category === category)).toBe(true);
    }
    const kinds = new Set(ITEMS.map((item) => item.effect.kind));
    for (const kind of ["breeding", "reveal", "bond", "lifespan", "geneSerum", "conditioning", "decor", "trainingGear", "archiveSlots", "held", "suppressDominance"]) {
      expect(kinds.has(kind as never), `no item with effect "${kind}"`).toBe(true);
    }
  });

  it("gives every item a unique id, a price and a description", () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const item of ITEMS) {
      expect(item.cost).toBeGreaterThan(0);
      expect(item.blurb.length).toBeGreaterThan(20);
      expect(itemById(item.id)).toBe(item);
    }
  });

  it("only treats non-consumables as holdable", () => {
    for (const item of ITEMS) {
      const held = heldEffect(item.id);
      if (item.consumable) expect(held).toBeUndefined();
      else expect(held).toBe(item.effect);
    }
  });

  it("prices information by how much of it you get", () => {
    const one = itemById("field-lens").cost;
    const coat = itemById("assay-bench").cost;
    const all = itemById("deep-sequencer").cost;
    expect(coat).toBeGreaterThan(one);
    expect(all).toBeGreaterThan(coat);
  });
});

describe("feed can never beat genes", () => {
  const map = geneMapFor(SPECIES[0] ?? (() => { throw new Error("no species"); })());

  it("closes the gap to the ceiling and stops there", () => {
    let state = createRanch({ species: map.species.id, seed: "feed", startingItems: { "feed-marrow": 12 } });
    const target = state.creatures.find((c) => c.stage !== "egg");
    if (!target) throw new Error("no creature");
    const ceiling = phenotypeOf(target).stats.vigour ?? 0;

    for (let i = 0; i < 12; i++) {
      const result = applyAction(state, { kind: "useItem", id: target.id, item: "feed-marrow" });
      expect(result.events.some((e) => e.kind === "blocked")).toBe(false);
      state = result.state;
    }
    const fed = state.creatures.find((c) => c.id === target.id);
    if (!fed) throw new Error("creature vanished");
    expect(fed.achieved.vigour ?? 0).toBeLessThanOrEqual(ceiling + 1e-9);
    // Twelve doses of a third of the gap each: it should be very close, and
    // never past, which is the whole claim.
    expect(fed.achieved.vigour ?? 0).toBeGreaterThan((target.achieved.vigour ?? 0) + 1);
    expect(currentStats(fed, phenotypeOf(fed), map).vigour ?? 0).toBeLessThanOrEqual(ceiling + 1e-9);
  });
});

describe("held gear changes the cost of raising, not its ceiling", () => {
  const species = SPECIES[0];
  if (!species) throw new Error("no species");
  const map = geneMapFor(species);

  function raise(creature: Creature, days: number): Creature {
    let current = creature;
    const phenotype = expressPhenotype(current.genome, map);
    for (let day = 0; day < days; day++) current = tickCreature(current, phenotype, map).creature;
    return current;
  }

  it("makes training cheaper in days with a rig, and no better in stats", () => {
    const base = createRanch({ species: map.species.id, seed: "gear" }).creatures[0];
    if (!base) throw new Error("no creature");
    const trained: Creature = { ...base, training: "sprint", stage: "adult", ageDays: 60 };
    const bare = raise(trained, 30);
    const rigged = raise({ ...trained, heldItem: "training-rig" }, 30);

    expect(rigged.lifespanDays).toBeGreaterThan(bare.lifespanDays);
    // Growth is untouched: the rig buys years, not speed.
    expect(rigged.achieved.speed).toBeCloseTo(bare.achieved.speed ?? 0, 6);
  });

  it("lets decor undo a mismatch but never grant a bonus", () => {
    const wild = randomWildGenome(map, createRng("decor"));
    const base = createRanch({ species: map.species.id, seed: "decor" }).creatures[0];
    if (!base) throw new Error("no creature");
    const phenotype = expressPhenotype(wild, map);
    const affinities = (phenotype.traits.affinity ?? "").split("+").filter(Boolean);
    // A habitat this animal is genuinely wrong for.
    const wrong = HABITATS.find(
      (habitat) => habitatFactor(habitat, map.species.biome, affinities) === HABITAT_MATCH.wrong,
    );
    if (!wrong) return; // this draw has an affinity for everything; nothing to prove

    // Start well below the ceiling: growth closes a *fraction of the gap*, so
    // an animal already at its ceiling grows identically however it is kept.
    const mismatched: Creature = {
      ...base,
      genome: wild,
      habitat: wrong.id,
      stage: "juvenile",
      ageDays: 30,
      achieved: { speed: 1, vigour: 1, focus: 1 },
    };
    const withDecor: Creature = { ...mismatched, heldItem: "decor-transplant" };
    const a = tickCreature(mismatched, phenotype, map).creature;
    const b = tickCreature(withDecor, phenotype, map).creature;
    expect(b.achieved.vigour ?? 0).toBeGreaterThan(a.achieved.vigour ?? 0);

    // And in a habitat it already matches, decor changes nothing at all.
    const right = HABITATS.find(
      (habitat) => habitatFactor(habitat, map.species.biome, affinities) >= HABITAT_MATCH.neutral,
    );
    if (!right) return;
    const matched: Creature = { ...mismatched, habitat: right.id };
    const plain = tickCreature(matched, phenotype, map).creature;
    const decorated = tickCreature({ ...matched, heldItem: "decor-transplant" }, phenotype, map).creature;
    expect(decorated.achieved.vigour).toBeCloseTo(plain.achieved.vigour ?? 0, 9);
  });
});

describe("the test-cross kit reads a clutch, not an animal", () => {
  const species = SPECIES[0];
  if (!species) throw new Error("no species");
  const map = geneMapFor(species);

  it("reveals the locus on every living offspring at once", () => {
    let state = createRanch({ species: map.species.id, seed: "testcross", startingItems: { "test-cross-kit": 2 } });
    const sire = state.creatures.find((c) => c.sex === "male" && c.stage === "adult");
    const dam = state.creatures.find((c) => c.sex === "female" && c.stage === "adult");
    if (!sire || !dam) throw new Error("no breeding pair");

    for (let i = 0; i < 4; i++) {
      state = applyAction(state, { kind: "breed", sireId: sire.id, damId: dam.id }).state;
    }
    const locus = map.loci[0]?.id;
    if (!locus) throw new Error("no loci");
    state = applyAction(state, { kind: "useItem", id: dam.id, item: "test-cross-kit", locus }).state;

    const children = state.creatures.filter((c) => c.damId === dam.id);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) expect(child.revealed).toContain(locus);
    expect(state.creatures.find((c) => c.id === dam.id)?.revealed).toContain(locus);
    // And nobody else was read for free.
    const unrelated = state.creatures.filter((c) => c.damId !== dam.id && c.id !== dam.id);
    for (const other of unrelated) expect(other.revealed).not.toContain(locus);
  });
});

describe("a pedigree extension buys Archive berths", () => {
  const species = SPECIES[0];
  if (!species) throw new Error("no species");
  const map = geneMapFor(species);

  it("raises the cap permanently and spends the item", () => {
    const state = createRanch({ species: map.species.id, seed: "archive", startingItems: { "pedigree-extension": 1 } });
    const target = state.creatures[0];
    if (!target) throw new Error("no creature");
    const before = state.archiveCapacity;
    const after = applyAction(state, { kind: "useItem", id: target.id, item: "pedigree-extension" });
    expect(after.state.archiveCapacity).toBe(before + 8);
    expect(after.state.inventory.items["pedigree-extension"]).toBe(0);
  });
});
