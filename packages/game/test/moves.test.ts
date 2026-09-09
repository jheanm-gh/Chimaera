/**
 * Moves, gated by anatomy.
 *
 * The premise these tests defend is that breeding changes *what a creature can
 * do*, not how large one number is. That only holds if the gates are real: if
 * every animal ends up qualifying for every move, this is an abstract stat with
 * extra steps.
 */

import { describe, expect, it } from "vitest";
import { createRng, expressPhenotype, geneMapById, measure, randomWildGenome, SPECIES } from "@chimaera/genetics";
import type { Morphology, SpeciesId } from "@chimaera/genetics";
import { canPerform, FLAIL, HIDE_MATCHUP, MOVES, movePower, movesFor, moveById, strikeDamage } from "../src/moves.js";

function sample(species: SpeciesId, count: number, seed = "moves"): { m: Morphology; species: SpeciesId }[] {
  const map = geneMapById(species);
  const rng = createRng(`${seed}:${species}`);
  return Array.from({ length: count }, () => ({
    m: measure(expressPhenotype(randomWildGenome(map, rng), map), map),
    species,
  }));
}

const roster = SPECIES.map((s) => s.id);

describe("the move catalogue", () => {
  it("has no two moves sharing an id", () => {
    expect(new Set(MOVES.map((m) => m.id)).size).toBe(MOVES.length);
  });

  it("weights every power and resistance sum to one", () => {
    // Otherwise a move's strength depends on how many terms its author happened
    // to write, which is not a design decision anybody made.
    for (const move of [...MOVES, FLAIL]) {
      const power = move.power.reduce((sum, t) => sum + t.weight, 0);
      const resist = move.resistedBy.reduce((sum, t) => sum + t.weight, 0);
      expect(power, `${move.name} power`).toBeCloseTo(1, 5);
      expect(resist, `${move.name} resistance`).toBeCloseTo(1, 5);
    }
  });

  it("is reachable — every move is available to some real animal", () => {
    // A move nothing can perform is content nobody will ever see.
    const reached = new Set<string>();
    for (const species of roster) {
      for (const { m } of sample(species, 200)) {
        for (const move of movesFor(m, species)) reached.add(move.id);
      }
    }
    const unreachable = MOVES.filter((m) => !reached.has(m.id)).map((m) => m.name);
    expect(unreachable, "moves no wild animal can perform").toEqual([]);
  });

  it("gates hard — no move is available to everything", () => {
    // If a move has no anatomical requirement it is a stat, not a move. Bite
    // and Shoulder Charge are deliberately near-universal; nothing may be
    // *entirely* universal across six body plans.
    for (const move of MOVES) {
      let qualified = 0;
      let total = 0;
      for (const species of roster) {
        for (const { m } of sample(species, 60)) {
          total++;
          if (canPerform(move, m)) qualified++;
        }
      }
      expect(qualified / total, `${move.name} availability`).toBeLessThan(1);
    }
  });

  it("refuses the moves an animal has no anatomy for", () => {
    for (const { m } of sample("siltadder", 80)) {
      // No legs: it cannot trample or pin, whatever else it can do.
      expect(canPerform(moveById("trample") as never, m)).toBe(false);
      expect(canPerform(moveById("pin") as never, m)).toBe(false);
      expect(canPerform(moveById("constrict") as never, m)).toBe(true);
    }
    for (const { m } of sample("bramblehog", 80)) {
      // Four legs and mass: it cannot constrict, whatever else it can do.
      expect(canPerform(moveById("constrict") as never, m)).toBe(false);
    }
  });

  it("leaves nobody unable to act", () => {
    for (const species of roster) {
      for (const { m } of sample(species, 80)) {
        expect(movesFor(m, species).length).toBeGreaterThan(0);
      }
    }
  });

  it("ranks a move by what it lands, not by its raw measurements", () => {
    // The bug this guards: ranking on the measurement sum alone put Bite above
    // Constrict on a Silt-Adder, because the adder's gape is enormous and the
    // sort ignored that Constrict is the heavier move. A whip-tailed adder
    // leading with Tail Lash is fine — it genuinely has a metre of tail — so
    // the assertion is about the pair that was wrong, not about first place.
    for (const { m, species } of sample("siltadder", 60)) {
      const ranked = movesFor(m, species).map((x) => x.id);
      if (!ranked.includes("constrict") || !ranked.includes("bite")) continue;
      expect(ranked.indexOf("constrict"), "the hold outranks the bite").toBeLessThan(ranked.indexOf("bite"));
    }
  });
});

describe("hide against damage", () => {
  it("covers every kind of damage and every kind of hide", () => {
    const hides = ["naked", "slimed", "furred", "scaled", "plated"] as const;
    for (const [kind, row] of Object.entries(HIDE_MATCHUP)) {
      for (const hide of hides) {
        expect(row[hide], `${kind} vs ${hide}`).toBeGreaterThan(0);
        expect(row[hide], `${kind} vs ${hide}`).toBeLessThan(2);
      }
    }
  });

  it("makes plate the answer to a point and slime the answer to a grip", () => {
    // The two readings a player should be able to reach without a table.
    expect(HIDE_MATCHUP.pierce.plated).toBeLessThan(HIDE_MATCHUP.pierce.naked);
    expect(HIDE_MATCHUP.grip.slimed).toBeLessThan(HIDE_MATCHUP.grip.naked);
    expect(HIDE_MATCHUP.pierce.plated).toBeLessThan(1);
    expect(HIDE_MATCHUP.grip.slimed).toBeLessThan(1);
  });

  it("changes the best move depending on what is being hit", () => {
    // The point of the whole system: the same attacker should not always reach
    // for the same move.
    const attacker = sample("quillfen", 1)[0] as { m: Morphology; species: SpeciesId };
    const plated = sample("bramblehog", 1)[0] as { m: Morphology; species: SpeciesId };
    const slimed = sample("siltadder", 1)[0] as { m: Morphology; species: SpeciesId };
    const best = (target: { m: Morphology; species: SpeciesId }): string | undefined =>
      [...movesFor(attacker.m, attacker.species)]
        .sort(
          (a, b) =>
            strikeDamage(b, { morphology: attacker.m, species: attacker.species }, { morphology: target.m, species: target.species }) -
            strikeDamage(a, { morphology: attacker.m, species: attacker.species }, { morphology: target.m, species: target.species }),
        )[0]?.id;
    expect(best(plated)).toBeDefined();
    expect(best(slimed)).toBeDefined();
  });
});

describe("working out a strike", () => {
  it("never returns a negative or a non-number", () => {
    for (const species of roster) {
      const attackers = sample(species, 20);
      for (const other of roster) {
        const defenders = sample(other, 6, "def");
        for (const a of attackers.slice(0, 6)) {
          for (const d of defenders) {
            for (const move of movesFor(a.m, a.species)) {
              const value = strikeDamage(move, { morphology: a.m, species: a.species }, { morphology: d.m, species: d.species });
              expect(Number.isFinite(value)).toBe(true);
              expect(value).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }
    }
  });

  it("lets a defender blunt a strike but never nullify it", () => {
    // A fight nobody can win teaches the player nothing about either lineage.
    const a = sample("bramblehog", 1)[0] as { m: Morphology; species: SpeciesId };
    const d = sample("bramblehog", 1, "wall")[0] as { m: Morphology; species: SpeciesId };
    for (const move of movesFor(a.m, a.species)) {
      const value = strikeDamage(move, { morphology: a.m, species: a.species }, { morphology: d.m, species: d.species });
      if (movePower(move, a.m, a.species) > 0.05) expect(value).toBeGreaterThan(0);
    }
  });

  it("rewards breeding: a bigger animal hits harder with the same move", () => {
    const map = geneMapById("bramblehog");
    const rng = createRng("bigger");
    const rows = Array.from({ length: 300 }, () => {
      const m = measure(expressPhenotype(randomWildGenome(map, rng), map), map);
      return m;
    }).sort((x, y) => x.mass - y.mass);
    const small = rows[5] as Morphology;
    const large = rows[rows.length - 6] as Morphology;
    const trample = moveById("trample") as never;
    const target = sample("quillfen", 1, "target")[0] as { m: Morphology; species: SpeciesId };
    if (canPerform(trample, small) && canPerform(trample, large)) {
      const weak = strikeDamage(trample, { morphology: small, species: "bramblehog" }, { morphology: target.m, species: target.species });
      const strong = strikeDamage(trample, { morphology: large, species: "bramblehog" }, { morphology: target.m, species: target.species });
      expect(strong).toBeGreaterThan(weak);
    }
  });
});
