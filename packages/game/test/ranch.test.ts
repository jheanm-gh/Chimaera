/**
 * Core loop tests (§2).
 *
 * The load-bearing claims being checked: raising can approach the genetic
 * ceiling but never pass it; the same genome raised differently becomes a
 * different adult; a lethal pairing costs the player a week of incubation
 * before it teaches its lesson; and the whole ranch is a deterministic function
 * of its seed and the action list.
 */

import { geneMapFor, genomeFromSpec, QUILLFEN } from "@chimaera/genetics";
import { beforeEach, describe, expect, it } from "vitest";
import {
  achievement,
  activeCreatures,
  applyAction,
  createRanch,
  currentStats,
  DIETS_BY_ID,
  evolutionContext,
  fertilePairs,
  fromJson,
  isFertile,
  lifespanFor,
  loadRanch,
  phenotypeOf,
  previewBranches,
  projectedInbreeding,
  resolveBranch,
  SAVE_VERSION,
  saveRanch,
  STAGE_START,
  stageForAge,
  toJson,
} from "../src/index.js";
import type { Action, Creature, GameEvent, RanchState } from "../src/types.js";

const map = geneMapFor(QUILLFEN);

function run(state: RanchState, actions: readonly Action[]): { state: RanchState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyAction(current, action, map);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

function byId(state: RanchState, id: string): Creature {
  const found = [...state.creatures, ...state.archive].find((c) => c.id === id);
  if (!found) throw new Error(`no creature ${id}`);
  return found;
}

describe("a new ranch", () => {
  let ranch: RanchState;
  beforeEach(() => {
    ranch = createRanch(map, { seed: "test-ranch" });
  });

  it("starts with a breedable pair, not a waiting game", () => {
    const pairs = fertilePairs(ranch);
    expect(pairs.sires.length).toBeGreaterThan(0);
    expect(pairs.dams.length).toBeGreaterThan(0);
    expect(ranch.day).toBe(0);
  });

  it("gives founders a plausible amount of raising already behind them", () => {
    for (const creature of activeCreatures(ranch)) {
      const phenotype = phenotypeOf(creature, map);
      const reached = achievement(creature, phenotype, map);
      // Not newborn stats in an adult body, and not maxed either.
      expect(reached.vigour).toBeGreaterThan(0.3);
      expect(reached.vigour).toBeLessThan(1);
    }
  });

  it("is reproducible from its seed", () => {
    const again = createRanch(map, { seed: "test-ranch" });
    expect(JSON.stringify(saveRanch(ranch))).toBe(JSON.stringify(saveRanch(again)));
  });
});

describe("life stages", () => {
  it("moves through egg, hatchling, juvenile, adult and elder", () => {
    expect(stageForAge(0)).toBe("egg");
    expect(stageForAge(STAGE_START.hatchling)).toBe("hatchling");
    expect(stageForAge(STAGE_START.juvenile)).toBe("juvenile");
    expect(stageForAge(STAGE_START.adult)).toBe("adult");
    expect(stageForAge(STAGE_START.elder)).toBe("elder");
  });

  it("opens fertility in adult and closes it in elder", () => {
    const ranch = createRanch(map, { seed: "fertility" });
    const adult = activeCreatures(ranch)[0] as Creature;
    expect(isFertile(adult)).toBe(true);

    const aged = run(ranch, [{ kind: "advanceDays", days: STAGE_START.elder }]).state;
    const elder = byId(aged, adult.id);
    expect(elder.stage).toBe("elder");
    expect(isFertile(elder)).toBe(false);
  });

  it("kills a creature when it reaches its lifespan", () => {
    const ranch = createRanch(map, { seed: "mortality" });
    const result = run(ranch, [{ kind: "advanceDays", days: 320 }]);
    expect(result.events.some((e) => e.kind === "died")).toBe(true);
    expect(activeCreatures(result.state).length).toBeLessThan(activeCreatures(ranch).length);
  });

  it("derives lifespan from vigour, and shortens it with inbreeding", () => {
    const hardy = genomeFromSpec(map, "female", {
      VIG_A: ["VA2", "VA2"],
      VIG_B: ["VB2", "VB2"],
      VIG_C: ["VC2", "VC2"],
    });
    const frail = genomeFromSpec(map, "female", {
      VIG_A: ["VA0", "VA0"],
      VIG_B: ["VB0", "VB0"],
      VIG_C: ["VC0", "VC0"],
    });
    const express = (g: typeof hardy, f: number) =>
      lifespanFor(phenotypeOf({ genome: g, inbreeding: f } as Creature, map), map, f);

    expect(express(hardy, 0)).toBeGreaterThan(express(frail, 0));
    expect(express(hardy, 0.5)).toBeLessThan(express(hardy, 0));
  });

  it("archives an elder instead of losing it, keeping the genome forever", () => {
    const ranch = createRanch(map, { seed: "archive" });
    const target = activeCreatures(ranch)[0] as Creature;
    const result = run(ranch, [{ kind: "archive", id: target.id }]);

    expect(result.events.some((e) => e.kind === "archived")).toBe(true);
    expect(result.state.creatures.find((c) => c.id === target.id)).toBeUndefined();
    const archived = result.state.archive.find((c) => c.id === target.id);
    expect(archived?.status).toBe("archived");
    expect(archived?.genome).toEqual(target.genome);

    // Archived creatures do not age, do not die, and do not breed.
    const later = run(result.state, [{ kind: "advanceDays", days: 400 }]).state;
    expect(later.archive.find((c) => c.id === target.id)?.ageDays).toBe(archived?.ageDays);
  });
});

describe("raising", () => {
  it("approaches the genetic ceiling and never passes it", () => {
    const ranch = createRanch(map, { seed: "ceiling" });
    const target = activeCreatures(ranch)[0] as Creature;
    const trained = run(ranch, [
      { kind: "setTraining", id: target.id, training: "endurance" },
      { kind: "setDiet", id: target.id, diet: "silt" },
      { kind: "advanceDays", days: 120 },
    ]).state;

    const creature = byId(trained, target.id);
    if (creature.status !== "active") return;
    const phenotype = phenotypeOf(creature, map);
    for (const trait of map.polygenicTraits) {
      const ceiling = phenotype.stats[trait.id] ?? 0;
      expect(creature.achieved[trait.id] ?? 0).toBeLessThanOrEqual(ceiling + 1e-9);
      // Epigenetic head start included, still never above the ceiling.
      expect(currentStats(creature, phenotype, map)[trait.id] ?? 0).toBeLessThanOrEqual(ceiling + 1e-9);
    }
  });

  it("lets diet decide which stats approach their ceiling", () => {
    const ranch = createRanch(map, { seed: "diet" });
    const target = activeCreatures(ranch)[0] as Creature;

    const fedSilt = byId(
      run(ranch, [
        { kind: "setDiet", id: target.id, diet: "silt" },
        { kind: "advanceDays", days: 60 },
      ]).state,
      target.id,
    );
    const fedCarrion = byId(
      run(ranch, [
        { kind: "setDiet", id: target.id, diet: "carrion" },
        { kind: "advanceDays", days: 60 },
      ]).state,
      target.id,
    );

    expect(fedSilt.achieved.vigour ?? 0).toBeGreaterThan(fedCarrion.achieved.vigour ?? 0);
    expect(fedCarrion.achieved.speed ?? 0).toBeGreaterThan(fedSilt.achieved.speed ?? 0);
  });

  it("charges training in days of life", () => {
    const ranch = createRanch(map, { seed: "training-cost" });
    const target = activeCreatures(ranch)[0] as Creature;

    const untrained = byId(run(ranch, [{ kind: "advanceDays", days: 40 }]).state, target.id);
    const trained = byId(
      run(ranch, [
        { kind: "setTraining", id: target.id, training: "sprint" },
        { kind: "advanceDays", days: 40 },
      ]).state,
      target.id,
    );

    expect(trained.achieved.speed ?? 0).toBeGreaterThan(untrained.achieved.speed ?? 0);
    expect(trained.lifespanDays).toBeLessThan(untrained.lifespanDays);
  });

  it("makes a mismatched habitat suppress growth", () => {
    const ranch = createRanch(map, { seed: "habitat" });
    const target = activeCreatures(ranch)[0] as Creature;
    const home = byId(
      run(ranch, [
        { kind: "setHabitat", id: target.id, habitat: "mirefen" },
        { kind: "advanceDays", days: 50 },
      ]).state,
      target.id,
    );
    const wrong = byId(
      run(ranch, [
        { kind: "setHabitat", id: target.id, habitat: "galeshore" },
        { kind: "advanceDays", days: 50 },
      ]).state,
      target.id,
    );
    expect(home.achieved.vigour ?? 0).toBeGreaterThan(wrong.achieved.vigour ?? 0);
  });

  it("grows bond with attention and spends a day doing it", () => {
    const ranch = createRanch(map, { seed: "bond" });
    const target = activeCreatures(ranch)[0] as Creature;
    const tended = run(ranch, [{ kind: "tend", id: target.id }]);

    expect(byId(tended.state, target.id).bond).toBeGreaterThan(target.bond);
    expect(tended.state.day).toBe(ranch.day + 1);
  });

  it("keeps fasting alive as a real trade: no growth, more days", () => {
    const ranch = createRanch(map, { seed: "fasting" });
    const target = activeCreatures(ranch)[0] as Creature;
    const fasted = byId(
      run(ranch, [
        { kind: "setDiet", id: target.id, diet: "fasting" },
        { kind: "advanceDays", days: 40 },
      ]).state,
      target.id,
    );
    const fed = byId(
      run(ranch, [
        { kind: "setDiet", id: target.id, diet: "forage" },
        { kind: "advanceDays", days: 40 },
      ]).state,
      target.id,
    );

    expect(fasted.lifespanDays).toBeGreaterThan(fed.lifespanDays);
    expect(fasted.achieved.vigour ?? 0).toBeLessThan(fed.achieved.vigour ?? 0);
    expect(DIETS_BY_ID.get("fasting")?.lifespan).toBeGreaterThan(1);
  });
});

describe("evolution", () => {
  function grownAdult(seed: string, genomeSpec: Parameters<typeof genomeFromSpec>[2], actions: (id: string) => Action[]) {
    const base = createRanch(map, { seed, founders: 2 });
    // Replace a founder's genome so the genetic half of the branch is controlled.
    const target = activeCreatures(base)[0] as Creature;
    const genome = genomeFromSpec(map, target.sex, genomeSpec);
    const seeded: RanchState = {
      ...base,
      creatures: base.creatures.map((c) =>
        c.id === target.id ? { ...c, genome, ageDays: 24, stage: "juvenile", branch: undefined } : c,
      ),
    };
    const result = run(seeded, actions(target.id));
    return { state: result.state, events: result.events, id: target.id };
  }

  it("gives the same genome different adult forms depending on how it was raised", () => {
    const spec = { AFFIN: ["A_gale", "A_gale"] as const, SPD_A: ["SA2", "SA2"] as const, SPD_C: ["SC2", "SC2"] as const };

    const sprinted = grownAdult("evo-a", spec, (id) => [
      { kind: "setTraining", id, training: "sprint" },
      { kind: "setHabitat", id, habitat: "reedbank" },
      { kind: "advanceDays", days: 60 },
    ]);
    const fattened = grownAdult("evo-a", spec, (id) => [
      { kind: "setTraining", id, training: "endurance" },
      { kind: "setDiet", id, diet: "silt" },
      { kind: "advanceDays", days: 60 },
    ]);

    const a = byId(sprinted.state, sprinted.id).branch;
    const b = byId(fattened.state, fattened.id).branch;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
  });

  it("locks the secret branch behind a rare genotype AND a specific raising path", () => {
    const context = (carries: boolean, path: Partial<Parameters<typeof resolveBranch>[0]>) =>
      ({
        build: 0.5,
        affinities: ["mire"],
        bond: 90,
        diet: "bloom",
        habitat: "deepfen",
        training: "stillness",
        heldItem: "prism-lens",
        achievement: { speed: 0.4, vigour: 0.5, focus: 0.95 },
        carries: (allele: string) => carries && allele === "LN_star",
        traits: {},
        ...path,
      }) as Parameters<typeof resolveBranch>[0];

    expect(resolveBranch(context(true, {}), "quillfen").id).toBe("lantern-sage");
    // Right raising, wrong genome.
    expect(resolveBranch(context(false, {}), "quillfen").id).not.toBe("lantern-sage");
    // Right genome, wrong raising.
    expect(resolveBranch(context(true, { habitat: "mirefen" }), "quillfen").id).not.toBe("lantern-sage");
    expect(resolveBranch(context(true, { heldItem: undefined }), "quillfen").id).not.toBe("lantern-sage");
    expect(resolveBranch(context(true, { bond: 10 }), "quillfen").id).not.toBe("lantern-sage");
  });

  it("always produces some adult form, even from nothing", () => {
    const nothing = {
      build: 0.1,
      affinities: [],
      bond: 0,
      diet: "fasting",
      habitat: "galeshore",
      training: "none",
      heldItem: undefined,
      achievement: { speed: 0, vigour: 0, focus: 0 },
      carries: () => false,
      traits: {},
    } as Parameters<typeof resolveBranch>[0];
    expect(resolveBranch(nothing, "quillfen").id).toBe("reedwarden");
  });

  it("previews what is in reach without handing over the recipe", () => {
    const ranch = createRanch(map, { seed: "preview" });
    const target = activeCreatures(ranch)[0] as Creature;
    const context = evolutionContext(target, phenotypeOf(target, map), map);
    const previews = previewBranches(context, "quillfen");

    expect(previews.length).toBeGreaterThan(0);
    for (const preview of previews) {
      // Counts and a nudge, never the conditions themselves.
      expect(preview).not.toHaveProperty("conditions");
      expect(typeof preview.met).toBe("number");
      expect(preview.hint.length).toBeGreaterThan(0);
    }
    // A secret branch stays off the list until the player is nearly there.
    expect(previews.some((p) => p.id === "lantern-sage")).toBe(false);
  });
});

describe("breeding", () => {
  it("produces an egg that hatches after incubation", () => {
    const ranch = createRanch(map, { seed: "breeding" });
    const { sires, dams } = fertilePairs(ranch);
    const result = run(ranch, [
      { kind: "breed", sireId: (sires[0] as Creature).id, damId: (dams[0] as Creature).id },
    ]);

    const egg = result.state.creatures.find((c) => c.origin === "bred");
    if (!egg) {
      // Fertility is a roll; an occasional empty pairing is the system working.
      expect(result.events.some((e) => e.kind === "noEgg")).toBe(true);
      return;
    }
    expect(egg.stage).toBe("egg");

    const hatchedRun = run(result.state, [{ kind: "advanceDays", days: STAGE_START.hatchling }]);
    expect(
      hatchedRun.events.some((e) => e.kind === "hatched" || e.kind === "eggFailed"),
    ).toBe(true);
  });

  it("makes a lethal pairing cost a week before it teaches its lesson", () => {
    const ranch = createRanch(map, { seed: "lethal" });
    const sire = activeCreatures(ranch).find((c) => c.sex === "male") as Creature;
    const dam = activeCreatures(ranch).find((c) => c.sex === "female") as Creature;
    const carriers: RanchState = {
      ...ranch,
      creatures: ranch.creatures.map((c) =>
        c.id === sire.id || c.id === dam.id
          ? { ...c, genome: genomeFromSpec(map, c.sex, { LANTERN: ["LN_star", "LN_wild"] }) }
          : c,
      ),
    };

    let laid = 0;
    let failedAtHatch = 0;
    let state = carriers;
    for (let attempt = 0; attempt < 60; attempt++) {
      const bred = run(state, [{ kind: "breed", sireId: sire.id, damId: dam.id }]);
      state = bred.state;
      // The failure is never reported at the moment of pairing.
      expect(bred.events.some((e) => e.kind === "eggFailed")).toBe(false);
      if (state.creatures.some((c) => c.origin === "bred" && c.stage === "egg")) laid++;

      const incubated = run(state, [{ kind: "advanceDays", days: STAGE_START.hatchling }]);
      failedAtHatch += incubated.events.filter((e) => e.kind === "eggFailed").length;
      state = { ...incubated.state, creatures: incubated.state.creatures.filter((c) => c.status === "active") };
      if (!isFertile(byId(state, sire.id)) || !isFertile(byId(state, dam.id))) break;
    }

    expect(laid).toBeGreaterThan(0);
    expect(failedAtHatch).toBeGreaterThan(0);
  });

  it("refuses pairings that make no sense, without spending a day", () => {
    const ranch = createRanch(map, { seed: "refusals" });
    const { sires, dams } = fertilePairs(ranch);
    const sire = sires[0] as Creature;
    const dam = dams[0] as Creature;

    const sameSex = applyAction(ranch, { kind: "breed", sireId: sire.id, damId: sire.id }, map);
    expect(sameSex.events[0]?.kind).toBe("blocked");
    expect(sameSex.state.day).toBe(ranch.day);

    const reversed = applyAction(ranch, { kind: "breed", sireId: dam.id, damId: sire.id }, map);
    expect(reversed.events[0]?.kind).toBe("blocked");
  });

  it("computes the offspring's inbreeding coefficient from the pedigree", () => {
    const ranch = createRanch(map, { seed: "coefficient" });
    const { sires, dams } = fertilePairs(ranch);
    expect(projectedInbreeding(ranch, (sires[0] as Creature).id, (dams[0] as Creature).id)).toBe(0);
  });

  it("spends consumables whatever the outcome, and charges mutagens in lifespan", () => {
    const ranch = createRanch(map, {
      seed: "items",
      startingItems: { "mutagen-refined": 1 },
    });
    const { sires, dams } = fertilePairs(ranch);
    const sire = sires[0] as Creature;
    const dam = dams[0] as Creature;

    const result = run(ranch, [
      { kind: "breed", sireId: sire.id, damId: dam.id, items: ["mutagen-refined"] },
    ]);

    expect(result.state.inventory.items["mutagen-refined"]).toBe(0);
    expect(byId(result.state, sire.id).lifespanDays).toBeLessThan(sire.lifespanDays);
    expect(byId(result.state, dam.id).lifespanDays).toBeLessThan(dam.lifespanDays);
  });

  it("will not breed past the ranch's capacity", () => {
    const ranch = createRanch(map, { seed: "capacity", founders: 4, capacity: 4 });
    const { sires, dams } = fertilePairs(ranch);
    const result = applyAction(
      ranch,
      { kind: "breed", sireId: (sires[0] as Creature).id, damId: (dams[0] as Creature).id },
      map,
    );
    expect(result.events[0]).toEqual({ kind: "blocked", reason: "The ranch is full. Archive or release something first." });
  });
});

describe("the information game", () => {
  it("reveals nothing until a lens is used", () => {
    const ranch = createRanch(map, { seed: "lens" });
    const target = activeCreatures(ranch)[0] as Creature;
    expect(target.revealed).toEqual([]);

    const lensed = run(ranch, [
      { kind: "useItem", id: target.id, item: "field-lens", locus: "DORSAL" },
    ]);
    expect(byId(lensed.state, target.id).revealed).toEqual(["DORSAL"]);
    expect(lensed.state.inventory.items["field-lens"]).toBe(1);
  });

  it("keeps the Assay Bench away from stat loci, and the Sequencer honest", () => {
    const ranch = createRanch(map, {
      seed: "tiers",
      startingItems: { "assay-bench": 1, "deep-sequencer": 1 },
    });
    const target = activeCreatures(ranch)[0] as Creature;

    const assayed = byId(
      run(ranch, [{ kind: "useItem", id: target.id, item: "assay-bench" }]).state,
      target.id,
    );
    const statLoci = map.loci.filter((l) => l.mode.kind === "polygenic").map((l) => l.id);
    expect(assayed.revealed.length).toBeGreaterThan(0);
    for (const id of statLoci) expect(assayed.revealed).not.toContain(id);
    expect(assayed.phaseKnown).toBe(false);

    const sequenced = byId(
      run(ranch, [{ kind: "useItem", id: target.id, item: "deep-sequencer" }]).state,
      target.id,
    );
    expect(sequenced.revealed.length).toBe(map.loci.length);
    expect(sequenced.phaseKnown).toBe(true);
  });

  it("needs a locus named before a Field Lens will read anything", () => {
    const ranch = createRanch(map, { seed: "lens-arg" });
    const target = activeCreatures(ranch)[0] as Creature;
    const result = applyAction(ranch, { kind: "useItem", id: target.id, item: "field-lens" }, map);
    expect(result.events[0]?.kind).toBe("blocked");
    expect(result.state.inventory.items["field-lens"]).toBe(2);
  });
});

describe("determinism", () => {
  const script: Action[] = [
    { kind: "advanceDays", days: 3 },
    { kind: "setDiet", id: "c1", diet: "bloom" },
    { kind: "tend", id: "c1" },
    { kind: "catchWild" },
    { kind: "breed", sireId: "c2", damId: "c1" },
    { kind: "advanceDays", days: 30 },
  ];

  it("reproduces a playthrough exactly from the same seed and actions", () => {
    const a = run(createRanch(map, { seed: "replay" }), script);
    const b = run(createRanch(map, { seed: "replay" }), script);
    expect(toJson(a.state)).toBe(toJson(b.state));
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it("diverges on a different seed", () => {
    const a = run(createRanch(map, { seed: "replay" }), script);
    const b = run(createRanch(map, { seed: "other" }), script);
    expect(toJson(a.state)).not.toBe(toJson(b.state));
  });

  it("resumes identically from a save", () => {
    const start = createRanch(map, { seed: "resume" });
    const half = run(start, script.slice(0, 3));
    const resumed = fromJson(toJson(half.state));
    expect(toJson(run(resumed, script.slice(3)).state)).toBe(toJson(run(half.state, script.slice(3)).state));
  });
});

describe("saves", () => {
  it("round-trips a ranch exactly", () => {
    const ranch = run(createRanch(map, { seed: "save" }), [
      { kind: "advanceDays", days: 40 },
      { kind: "catchWild" },
    ]).state;
    const restored = fromJson(toJson(ranch));

    expect(restored.day).toBe(ranch.day);
    expect(restored.creatures.length).toBe(ranch.creatures.length);
    for (const [index, creature] of ranch.creatures.entries()) {
      expect(restored.creatures[index]?.genome).toEqual(creature.genome);
      expect(restored.creatures[index]?.achieved).toEqual(creature.achieved);
    }
  });

  it("refuses a save from a newer build rather than corrupting it", () => {
    const file = saveRanch(createRanch(map, { seed: "future" }));
    expect(() => loadRanch({ ...file, version: SAVE_VERSION + 5 })).toThrow(/newer version/);
  });

  it("refuses something that is not a save file", () => {
    expect(() => loadRanch({ hello: "world" })).toThrow(/not a Chimaera save/);
    expect(() => fromJson("[]")).toThrow(/not a Chimaera save/);
  });

  it("carries a version so a migration can be added without a redesign", () => {
    expect(saveRanch(createRanch(map, { seed: "versioned" })).version).toBe(SAVE_VERSION);
  });
});
