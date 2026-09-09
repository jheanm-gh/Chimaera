/**
 * Genome codes, Rival Ranch, the Stud Exchange and Legacy (§4).
 *
 * These four share one property that matters more than anything else in them:
 * they move a genome between two machines that never talk to each other. The
 * failure that must not happen is a code decoding into a *different but valid*
 * genome — the player breeds to it, gets an inexplicable result, and concludes
 * the genetics are broken. So the corruption tests here are the point of the
 * file, and the rest follows from them.
 */

import {
  createRng,
  expressPhenotype,
  geneMapById,
  geneMapFor,
  randomWildGenome,
  SPECIES,
} from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import {
  decodeGenome,
  encodeGenome,
  formatGenomeCode,
  GENOME_CODE_VERSION,
  isGenomeCode,
} from "../src/codes.js";
import { addPublishedStud, decodeOffer, encodeOffer, publishStud, readStud, recordStudUse } from "../src/exchange.js";
import { legacyCandidates, legacyTerms, MAX_LEGACY_DEPTH, startLegacy } from "../src/legacy.js";
import { applyAction, createRanch, phenotypeOf } from "../src/ranch.js";
import { fightGhost, ghostCombatant, houseGhost, snapshotTeam } from "../src/rivals.js";
import type { Creature, RanchState } from "../src/types.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

describe("genome codes", () => {
  it("round-trips every species", () => {
    const rng = createRng("codes");
    for (const species of SPECIES) {
      const map = geneMapFor(species);
      for (let i = 0; i < 60; i++) {
        const genome = randomWildGenome(map, rng);
        const decoded = decodeGenome(encodeGenome(genome));
        expect(decoded.species).toBe(species.id);
        expect(decoded.genome).toEqual(genome);
        expect(decoded.version).toBe(GENOME_CODE_VERSION);
      }
    }
  });

  it("round-trips a genome carrying a copy-number duplication", () => {
    // CNV travels with the haplotype, so the count is part of the payload
    // rather than assumed to be one.
    const map = geneMapById("quillfen");
    const base = randomWildGenome(map, createRng("cnv"));
    const chromosome = base.chromosomes.C1;
    if (!chromosome) throw new Error("no C1");
    const existing = chromosome.maternal.genes.DORSAL ?? ["d"];
    const duplicated = {
      ...base,
      chromosomes: {
        ...base.chromosomes,
        C1: {
          ...chromosome,
          maternal: {
            ...chromosome.maternal,
            genes: { ...chromosome.maternal.genes, DORSAL: [existing[0] as string, "D"] },
          },
        },
      },
    };
    expect(decodeGenome(encodeGenome(duplicated)).genome).toEqual(duplicated);
  });

  it("rejects every single-character corruption", () => {
    const map = geneMapById("siltadder");
    const code = encodeGenome(randomWildGenome(map, createRng("corrupt")));
    let accepted = 0;
    let rejected = 0;
    for (let index = 0; index < code.length; index++) {
      for (const symbol of ALPHABET) {
        if (code[index] === symbol) continue;
        const damaged = code.slice(0, index) + symbol + code.slice(index + 1);
        if (isGenomeCode(damaged)) accepted++;
        else rejected++;
      }
    }
    expect(rejected).toBeGreaterThan(1000);
    // A code that decodes into a different valid genome is the one outcome
    // that must never happen.
    expect(accepted).toBe(0);
  });

  it("forgives the things people actually do to a code", () => {
    const map = geneMapById("quillfen");
    const code = encodeGenome(randomWildGenome(map, createRng("forgive")));
    for (const variant of [code.toLowerCase(), formatGenomeCode(code), ` ${code} `]) {
      expect(decodeGenome(variant).genome).toEqual(decodeGenome(code).genome);
    }
    // Crockford's confusables fold rather than fail.
    const folded = code.replace(/1/g, "I").replace(/0/g, "O");
    expect(decodeGenome(folded).genome).toEqual(decodeGenome(code).genome);
  });

  it("refuses nonsense with an explanation rather than a stack trace", () => {
    for (const junk of ["", "hello", "AAAA", "!!!!!!!!!!"]) {
      expect(() => decodeGenome(junk)).toThrow();
      expect(isGenomeCode(junk)).toBe(false);
    }
  });

  it("fits every locus into one symbol", () => {
    // Five bits per symbol is exact only while no locus has more than 32
    // alleles. A seventh species with a thirty-third would truncate silently.
    for (const species of SPECIES) {
      for (const locus of geneMapFor(species).loci) {
        expect(locus.alleles.length, `${species.id}/${locus.id}`).toBeLessThanOrEqual(32);
      }
      expect(SPECIES.length).toBeLessThanOrEqual(32);
    }
  });
});

describe("Rival Ranch", () => {
  function team(state: RanchState): Creature[] {
    return state.creatures.slice(0, 3).map((c) => ({ ...c, stage: "adult", ageDays: 60 }));
  }

  it("snapshots a team into something another machine can fight", () => {
    const state = createRanch({ seed: "ghost", species: "quillfen" });
    const ghost = snapshotTeam("My Station", team(state), phenotypeOf);
    expect(ghost.team).toHaveLength(3);
    for (const member of ghost.team) {
      expect(isGenomeCode(member.code)).toBe(true);
      // Condition travels, so a ghost is beatable by raising better as well as
      // by breeding better.
      for (const value of Object.values(member.condition)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    // Round-trips through JSON, which is how it will actually move.
    const moved = JSON.parse(JSON.stringify(ghost)) as typeof ghost;
    expect(ghostCombatant(moved.team[0] as never, 0).stats).toEqual(
      ghostCombatant(ghost.team[0] as never, 0).stats,
    );
  });

  it("resolves the same fight identically every time it is challenged", () => {
    const state = createRanch({ seed: "rival", species: "quillfen" });
    const ghost = houseGhost(0, "quillfen");
    const a = fightGhost(ghost, team(state), phenotypeOf, createRng("fight"));
    const b = fightGhost(ghost, team(state), phenotypeOf, createRng("fight"));
    expect(b).toEqual(a);
  });

  it("cannot hurt anyone", () => {
    // Ghost data. No permadeath, no condition carried out, nothing to lose.
    const state = createRanch({ seed: "safe", species: "quillfen" });
    const before = JSON.stringify(state.creatures);
    fightGhost(houseGhost(1, "quillfen"), team(state), phenotypeOf, createRng("safe"));
    expect(JSON.stringify(state.creatures)).toBe(before);
  });

  it("gets harder as the station gets better", () => {
    const state = createRanch({ seed: "curve", species: "quillfen" });
    const mine = team(state).map((c) => ({
      ...c,
      achieved: Object.fromEntries(
        geneMapById("quillfen").polygenicTraits.map((trait) => [
          trait.id,
          (expressPhenotype(c.genome, geneMapById("quillfen")).stats[trait.id] ?? trait.max) * 0.8,
        ]),
      ),
    }));
    const rate = (strength: number, selection: number): number => {
      let wins = 0;
      const runs = 60;
      for (let i = 0; i < runs; i++) {
        const ghost = houseGhost(i % 8, "quillfen", { strength, selection, seed: `g:${strength}:${i}` });
        if (fightGhost(ghost, mine, phenotypeOf, createRng(`f:${strength}:${i}`)).won) wins++;
      }
      return wins / runs;
    };
    const soft = rate(0.4, 1);
    const hard = rate(0.95, 8);
    expect(soft).toBeGreaterThan(hard);
    expect(soft).toBeGreaterThan(0.4);
  });

  it("populates every species without a single player", () => {
    for (const species of SPECIES) {
      const ghost = houseGhost(2, species.id);
      expect(ghost.species).toBe(species.id);
      expect(ghost.team).toHaveLength(3);
      for (const member of ghost.team) expect(decodeGenome(member.code).species).toBe(species.id);
    }
  });
});

describe("the Stud Exchange", () => {
  function stationWithStud(seed = "stud"): { state: RanchState; sire: Creature } {
    const state = createRanch({ seed, species: "quillfen", motes: 1000 });
    const sire = state.creatures.find((c) => c.sex === "male");
    if (!sire) throw new Error("no sire");
    return { state, sire };
  }

  it("publishes a male and refuses a female", () => {
    const { state, sire } = stationWithStud();
    const offer = publishStud(sire, "Hallow Reach", { fee: 300 });
    expect(offer.species).toBe("quillfen");
    expect(offer.fee).toBe(300);
    expect(readStud(offer).genome).toEqual(sire.genome);

    const dam = state.creatures.find((c) => c.sex === "female");
    if (!dam) throw new Error("no dam");
    expect(() => publishStud(dam, "Hallow Reach")).toThrow(/male/);
  });

  it("survives being pasted into a chat window", () => {
    const { sire } = stationWithStud();
    const offer = publishStud(sire, "Under-Fen", { fee: 250, disclose: ["DORSAL", "LANTERN"] });
    const text = encodeOffer(offer);
    expect(text.includes("\n")).toBe(false);
    const back = decodeOffer(text);
    expect(back).toEqual(offer);
    expect(() => decodeOffer("not an offer")).toThrow();
  });

  it("discloses only what the publisher chose", () => {
    const { sire } = stationWithStud();
    const secretive = publishStud({ ...sire, revealed: ["DORSAL", "LANTERN", "PIG"] }, "Ninefold", {
      disclose: [],
    });
    expect(secretive.disclosed).toEqual([]);
    // And the genome is still in there — the code carries the animal, the
    // disclosure list carries what you are allowed to look at.
    expect(readStud(secretive).genome).toEqual(sire.genome);
  });

  it("breeds a dam to a stud she is unrelated to, for a fee", () => {
    const { sire } = stationWithStud("exchange");
    const offer = publishStud(sire, "Chalkbourne", { fee: 200 });
    // A dam from a different station entirely.
    const other = createRanch({ seed: "other-station", species: "quillfen", motes: 1000 });
    const dam = other.creatures.find((c) => c.sex === "female" && c.stage === "adult");
    if (!dam) throw new Error("no dam");

    const result = applyAction(other, { kind: "breedToStud", damId: dam.id, offer });
    expect(result.events.some((e) => e.kind === "blocked")).toBe(false);
    // The fee is charged whatever the pairing produces. A stud fee is not
    // refunded for a barren season, and neither is a mutagen.
    expect(result.state.inventory.motes).toBe(other.inventory.motes - 200);
    // He is in the pedigree, or every F computed downstream would be wrong.
    expect(result.state.pedigree.some((record) => record.id.startsWith("stud:"))).toBe(true);
    // And he is not on the ranch.
    expect(result.state.creatures.some((c) => c.name.includes("Chalkbourne"))).toBe(false);

    // Fertility is 85%, so find a pairing that took and check the foal.
    let foal: Creature | undefined;
    for (let attempt = 0; attempt < 8 && !foal; attempt++) {
      const station = createRanch({ seed: `other-station-${attempt}`, species: "quillfen", motes: 1000 });
      const her = station.creatures.find((c) => c.sex === "female" && c.stage === "adult");
      if (!her) continue;
      const bred = applyAction(station, { kind: "breedToStud", damId: her.id, offer });
      foal = bred.state.creatures.find((c) => c.damId === her.id);
    }
    expect(foal, "no pairing took in eight attempts").toBeDefined();
    // Unrelated by construction: he has no pedigree on this ranch.
    expect(foal?.inbreeding).toBe(0);
    expect(foal?.sireId?.startsWith("stud:")).toBe(true);
  });

  it("refuses when the fee cannot be paid", () => {
    const { sire } = stationWithStud("broke");
    const offer = publishStud(sire, "Ashmoor", { fee: 5000 });
    const other = createRanch({ seed: "poor", species: "quillfen", motes: 10 });
    const dam = other.creatures.find((c) => c.sex === "female" && c.stage === "adult");
    if (!dam) throw new Error("no dam");
    const result = applyAction(other, { kind: "breedToStud", damId: dam.id, offer });
    expect(result.events[0]).toMatchObject({ kind: "blocked" });
    expect(result.state.inventory.motes).toBe(10);
  });

  it("has no exchange inside a trial", () => {
    const { sire } = stationWithStud("trialstud");
    const offer = publishStud(sire, "Sedgeline", { fee: 10 });
    const state = createRanch({ seed: "t", species: "quillfen", motes: 1000 });
    const inTrial: RanchState = {
      ...state,
      trial: { kind: "trial", id: "qf-1", generations: 3, startedOnDay: 0 },
    };
    const dam = inTrial.creatures.find((c) => c.sex === "female");
    if (!dam) throw new Error("no dam");
    expect(applyAction(inTrial, { kind: "breedToStud", damId: dam.id, offer }).events[0]).toMatchObject({
      kind: "blocked",
    });
  });

  it("pays the publisher when a use is claimed", () => {
    const { state, sire } = stationWithStud("paid");
    const offer = publishStud(sire, "Longhithe", { fee: 180 });
    const listed = addPublishedStud(state, offer);
    expect(listed.records.studs).toHaveLength(1);
    // Listing twice does not duplicate.
    expect(addPublishedStud(listed, offer).records.studs).toHaveLength(1);

    const paid = recordStudUse(listed, offer.code, offer.fee);
    expect(paid.inventory.motes).toBe(state.inventory.motes + 180);
    expect(paid.records.studs[0]?.uses).toBe(1);
    expect(paid.records.studs[0]?.earned).toBe(180);
    // An unknown code pays nobody.
    expect(recordStudUse(paid, "NOTMINE", 999).inventory.motes).toBe(paid.inventory.motes);
  });
});

describe("Legacy", () => {
  it("tightens the bottleneck rather than inflating the opposition", () => {
    const terms = Array.from({ length: MAX_LEGACY_DEPTH + 1 }, (_, depth) => legacyTerms(depth));
    for (let i = 1; i < terms.length; i++) {
      expect(terms[i]?.founders ?? 0).toBeLessThanOrEqual(terms[i - 1]?.founders ?? 0);
      expect(terms[i]?.capacity ?? 0).toBeLessThan(terms[i - 1]?.capacity ?? 0);
    }
    // Never below a breeding pair: a run that cannot start is not difficulty.
    for (const entry of terms) expect(entry.founders).toBeGreaterThanOrEqual(2);
    expect(legacyTerms(99).depth).toBe(MAX_LEGACY_DEPTH);
  });

  it("carries the genome and nothing else", () => {
    const previous: RanchState = (() => {
      const base = createRanch({ seed: "old", species: "quillfen" });
      const elder = base.creatures[0];
      if (!elder) throw new Error("no creature");
      return {
        ...base,
        creatures: base.creatures.slice(1),
        archive: [{ ...elder, status: "archived", bond: 96, branch: "reedwarden", ageDays: 190 }],
        records: { ...base.records, ribbons: [], legacyDepth: 0 },
      };
    })();

    const ancestor = legacyCandidates(previous)[0];
    if (!ancestor) throw new Error("nothing to carry");

    const next = startLegacy(previous, { seed: "new", species: "quillfen", ancestor }, createRanch);
    const carried = next.creatures.find((c) => c.name.includes("carried"));
    expect(carried).toBeDefined();
    expect(carried?.genome).toEqual(ancestor.genome);
    // The genome was earned; the raising was not carried.
    expect(carried?.branch).toBeUndefined();
    expect(carried?.bond).toBeLessThan(ancestor.bond);
    expect(carried?.ageDays).toBeLessThan(ancestor.ageDays);
    expect(carried?.generation).toBe(0);
    expect(next.records.legacyDepth).toBe(1);
    expect(next.campaign.completed).toEqual([]);
    expect(next.creatures.length).toBe(legacyTerms(1).founders + 1);
    expect(next.capacity).toBe(legacyTerms(1).capacity);
  });

  it("keeps what belongs to the player and drops what belonged to the run", () => {
    const base = createRanch({ seed: "keep", species: "quillfen" });
    const elder = base.creatures[0];
    if (!elder) throw new Error("no creature");
    const previous: RanchState = {
      ...base,
      archive: [{ ...elder, status: "archived" }],
      records: {
        ...base.records,
        legacyDepth: 1,
        trials: { "qf-1": { cleared: true, generations: 2, inbreeding: 0, score: 900, onDay: 10 } },
        ribbons: [
          {
            day: 4,
            standard: "deep-water",
            species: "quillfen",
            creatureId: elder.id,
            name: elder.name,
            placement: 1,
            field: 6,
            score: 0.8,
            tier: 0,
          },
        ],
      },
    };
    const ancestor = legacyCandidates(previous)[0];
    if (!ancestor) throw new Error("nothing to carry");
    const next = startLegacy(previous, { seed: "n2", species: "sallowfinch", ancestor }, createRanch);

    expect(next.records.trials["qf-1"]?.score).toBe(900);
    expect(next.records.ribbons).toHaveLength(1);
    expect(next.records.legacyDepth).toBe(2);
    // The herd and the run do not survive.
    expect(next.archive).toEqual([]);
    expect(next.day).toBe(0);
    // The ancestor is a Quillfen on a Sallowfinch station, which is allowed —
    // it is what carrying an animal forward means.
    expect(next.creatures.some((c) => c.species === "quillfen")).toBe(true);
    expect(next.homeSpecies).toBe("sallowfinch");
  });
});
