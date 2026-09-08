/**
 * Breeding Trials and Daily Genome (§4).
 *
 * The load-bearing test here is solvability. An authored puzzle nobody checked
 * is unsolvable about a fifth of the time, and a *generated* puzzle nobody
 * checked is unsolvable on a schedule — which for a Daily Genome means a day on
 * which every player in the world fails and no patch can un-ruin it.
 *
 * So: every one of the fifty-four authored trials is solved by a solver playing
 * the real `breed()`, and six months of dailies are too.
 */

import { createRng, geneMapById, genomeFromSpec } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import { dailyKey, dailyPuzzle, dailyScore, dailySpent, recordDailyResult } from "../src/daily.js";
import { applyAction, createRanch, createTrialRanch, phenotypeOf } from "../src/ranch.js";
import { solveTrial } from "../src/solver.js";
import {
  bestEntrant,
  clauseHolds,
  completeTrial,
  meetsTarget,
  purityOf,
  recordTrialResult,
  scoreTrial,
  trialGenomes,
} from "../src/trials.js";
import { TRIALS, trialById, trialsByTier, trialsForSpecies } from "../src/trialset.js";
import type { Creature, RanchState } from "../src/types.js";

describe("the trial set", () => {
  it("is fifty-four puzzles, nine per species, curved across five tiers", () => {
    expect(TRIALS.length).toBe(54);
    expect(new Set(TRIALS.map((t) => t.id)).size).toBe(TRIALS.length);
    for (const species of ["quillfen", "sallowfinch", "bramblehog", "kiteossel", "siltadder", "ashenlorric"] as const) {
      expect(trialsForSpecies(species).length, species).toBe(9);
    }
    for (let tier = 1; tier <= 5; tier++) {
      expect(trialsByTier(tier).length, `tier ${tier}`).toBeGreaterThan(0);
    }
  });

  it("names loci and alleles that exist", () => {
    for (const trial of TRIALS) {
      const map = geneMapById(trial.species);
      for (const spec of [trial.sire, trial.dam]) {
        for (const [locusId, pair] of Object.entries(spec)) {
          expect(map.hasLocus(locusId), `${trial.id}: locus ${locusId}`).toBe(true);
          for (const allele of pair) {
            if (allele === null) continue;
            expect(map.hasAllele(locusId, allele), `${trial.id}: ${locusId}/${allele}`).toBe(true);
          }
        }
      }
      for (const clause of trial.target) {
        if (clause.kind === "carries" || clause.kind === "homozygous") {
          expect(map.hasLocus(clause.locus), `${trial.id}: target locus ${clause.locus}`).toBe(true);
          expect(map.hasAllele(clause.locus, clause.allele), `${trial.id}: ${clause.locus}/${clause.allele}`).toBe(true);
        }
        if (clause.kind === "trait") {
          expect(
            map.loci.some((locus) => locus.trait === clause.trait),
            `${trial.id}: trait ${clause.trait}`,
          ).toBe(true);
        }
        if (clause.kind === "stat") {
          const trait = map.polygenicTraits.find((t) => t.id === clause.stat);
          expect(trait, `${trial.id}: stat ${clause.stat}`).toBeDefined();
          // A floor above the species' own ceiling is not a hard puzzle, it is
          // a broken one.
          expect(clause.atLeast, `${trial.id}: ${clause.stat} floor`).toBeLessThanOrEqual(trait?.max ?? 0);
        }
      }
      expect(trial.generations).toBeGreaterThanOrEqual(2);
      expect(trial.blurb.length).toBeGreaterThan(30);
    }
  });

  it("hands over a breeding pair", () => {
    for (const trial of TRIALS) {
      const map = geneMapById(trial.species);
      const { sire, dam } = trialGenomes(trial);
      expect(sire.species).toBe(trial.species);
      expect(dam.species).toBe(trial.species);
      // A trial whose pair cannot breed is a trial that cannot be started.
      expect(map.sexChromosome).toBeDefined();
    }
  });
});

describe("every authored trial is solvable", () => {
  for (const trial of TRIALS) {
    it(`${trial.id} — ${trial.name}`, () => {
      // Several seeds: the solver is a search, not a proof, so one unlucky
      // stream is not evidence that a puzzle is broken.
      let best = solveTrial(trial, createRng(`solve:${trial.id}:0`));
      for (let seed = 1; seed < 4 && !best.solved; seed++) {
        const attempt = solveTrial(trial, createRng(`solve:${trial.id}:${seed}`));
        if (attempt.solved || attempt.clausesMet > best.clausesMet) best = attempt;
      }
      expect(best.solved, `${trial.id}: met ${best.clausesMet}/${best.total} in ${best.generations}`).toBe(true);
      expect(best.generations).toBeLessThanOrEqual(trial.generations);
      // And not solvable by the animals you were handed.
      expect(best.generations).toBeGreaterThanOrEqual(1);
    });
  }

  it("gets harder as the tier rises", () => {
    // Generations do not separate the tiers — the solver breeds far more per
    // generation than a ten-berth trial ranch can hold — so difficulty is
    // measured as how many offspring the search had to look at.
    const means = [1, 2, 3, 4, 5].map((tier) => {
      const trials = trialsByTier(tier);
      const total = trials.reduce((sum, trial) => {
        let runs = 0;
        for (let seed = 0; seed < 3; seed++) {
          runs += solveTrial(trial, createRng(`curve:${trial.id}:${seed}`)).offspring;
        }
        return sum + runs / 3;
      }, 0);
      return total / Math.max(1, trials.length);
    });
    expect(means[0] ?? 0).toBeLessThan(means[2] ?? 0);
    expect(means[2] ?? 0).toBeLessThan(means[4] ?? 0);
    expect(means[0] ?? 0).toBeLessThan(15);
  });
});

describe("a trial is a closed ranch", () => {
  const trial = trialById("qf-1");

  it("starts with exactly the pair, and the trial's tools", () => {
    const state = createTrialRanch(trial);
    expect(state.creatures).toHaveLength(2);
    expect(state.creatures.every((c) => c.species === trial.species)).toBe(true);
    expect(state.trial?.id).toBe(trial.id);
    expect(state.trial?.generations).toBe(trial.generations);
    expect(state.capacity).toBeLessThanOrEqual(10);
    // Identical for every player: no seed, no wild draw for the unnamed loci.
    const again = createTrialRanch(trial);
    expect(again.creatures.map((c) => c.genome)).toEqual(state.creatures.map((c) => c.genome));
  });

  it("has no fen to catch anything from", () => {
    const state = createTrialRanch(trial);
    const result = applyAction(state, { kind: "catchWild" });
    expect(result.events[0]).toMatchObject({ kind: "blocked" });
    expect(result.state.creatures).toHaveLength(2);
  });

  it("refuses a pairing past the generation limit", () => {
    let state = createTrialRanch(trial);
    // Breed to the limit, then once more.
    for (let generation = 0; generation < trial.generations + 2; generation++) {
      const sire = state.creatures.find((c) => c.sex === "male" && c.stage === "adult" && c.status === "active");
      const dam = state.creatures.find((c) => c.sex === "female" && c.stage === "adult" && c.status === "active");
      if (!sire || !dam) break;
      state = applyAction(state, { kind: "breed", sireId: sire.id, damId: dam.id }).state;
      state = applyAction(state, { kind: "advanceDays", days: 60 }).state;
    }
    const deepest = Math.max(...state.creatures.map((c) => c.generation));
    expect(deepest).toBeLessThanOrEqual(trial.generations);
  });

  it("says nothing about the campaign", () => {
    const state = createTrialRanch(trial);
    expect(state.campaign.completed).toEqual([]);
    // Past the last chapter, so no commission is ever evaluated in here.
    expect(state.campaign.chapter).toBeGreaterThan(8);
  });
});

describe("scoring pulls generations, purity and F against each other", () => {
  const trial = trialById("qf-7");

  /** An animal that genuinely answers qf-7: crown fixed, and bred rather than given. */
  function winner(overrides: Partial<Creature> = {}): Creature {
    const state = createTrialRanch(trial);
    const base = state.creatures[0];
    if (!base) throw new Error("no creature");
    const animal: Creature = {
      ...base,
      generation: 2,
      genome: genomeFromSpec(geneMapById(trial.species), "female", { DORSAL: ["D_crown", "D_crown"] }),
      sex: "female",
      ...overrides,
    };
    if (!meetsTarget(trial, animal, phenotypeOf(animal))) throw new Error("fixture does not answer the trial");
    return animal;
  }

  it("pays for finishing early", () => {
    const animal = winner({});
    const quick = scoreTrial(trial, animal, phenotypeOf(animal), 2);
    const slow = scoreTrial(trial, animal, phenotypeOf(animal), 4);
    expect(quick.score).toBeGreaterThan(slow.score);
  });

  it("charges for inbreeding", () => {
    const clean = winner({ inbreeding: 0 });
    const close = winner({ inbreeding: 0.35 });
    expect(scoreTrial(trial, clean, phenotypeOf(clean), 3).score).toBeGreaterThan(
      scoreTrial(trial, close, phenotypeOf(close), 3).score,
    );
  });

  it("scores nothing for a trial that was not cleared", () => {
    const state = createTrialRanch(trialById("qf-1"));
    const animal = state.creatures[0];
    if (!animal) throw new Error("no creature");
    // Generation 0: the animal you were handed is never the answer.
    expect(meetsTarget(trialById("qf-1"), animal, phenotypeOf(animal))).toBe(false);
    expect(scoreTrial(trialById("qf-1"), animal, phenotypeOf(animal), 0).score).toBe(0);
  });

  it("reads purity from the loci the trial actually named", () => {
    const map = geneMapById(trial.species);
    const state = createTrialRanch(trial);
    const animal = state.creatures[0];
    if (!animal) throw new Error("no creature");
    const value = purityOf(trial, animal, map);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });

  it("does not count a hemizygous cock as breeding true", () => {
    // A sex-linked locus has one copy in the heterogametic sex. Reading that as
    // homozygous let three authored trials be solved by the animal you were
    // handed, on sight.
    const finch = geneMapById("sallowfinch");
    const state = createTrialRanch(trialById("sf-7"));
    const cock = state.creatures.find((c) => c.sex === "male");
    if (!cock) throw new Error("no cock");
    expect(
      clauseHolds({ kind: "homozygous", locus: "CREST", allele: "Cr_high" }, cock, phenotypeOf(cock), finch),
    ).toBe(false);
  });
});

describe("recording a result", () => {
  const trial = trialById("qf-1");

  it("keeps the best run and pays only the improvement", () => {
    const main = createRanch({ seed: "records", species: "quillfen", motes: 100 });
    const good = { cleared: true, generations: 2, inbreeding: 0, purity: 1, score: 900 };
    const worse = { cleared: true, generations: 4, inbreeding: 0.3, purity: 0.5, score: 300 };

    const first = recordTrialResult(main, trial, good);
    expect(first.records.trials[trial.id]?.score).toBe(900);
    expect(first.inventory.motes).toBe(1000);

    const second = recordTrialResult(first, trial, worse);
    expect(second.records.trials[trial.id]?.score).toBe(900);
    expect(second.inventory.motes).toBe(1000);

    const better = recordTrialResult(second, trial, { ...good, score: 1200 });
    expect(better.records.trials[trial.id]?.score).toBe(1200);
    expect(better.inventory.motes).toBe(1300);
  });

  it("scores whatever is standing on the trial ranch", () => {
    const state = createTrialRanch(trial);
    expect(completeTrial(trial, state, phenotypeOf)).toBeDefined();
    expect(bestEntrant(trial, state.creatures, phenotypeOf)).toBeDefined();
  });
});

describe("Daily Genome", () => {
  it("gives everyone the same puzzle for a date", () => {
    const a = dailyPuzzle("2026-04-20");
    const b = dailyPuzzle("2026-04-20");
    expect(b.trial.target).toEqual(a.trial.target);
    expect(b.trial.species).toBe(a.trial.species);
    expect(b.sire).toEqual(a.sire);
    expect(b.dam).toEqual(a.dam);
    expect(dailyPuzzle("2026-04-21").trial.target).not.toEqual(a.trial.target);
  });

  it("keys off the date in UTC", () => {
    expect(dailyKey(new Date("2026-04-20T23:59:59Z"))).toBe("2026-04-20");
    expect(dailyKey(new Date("2026-04-21T00:00:01Z"))).toBe("2026-04-21");
  });

  it("is solvable every day for six months", () => {
    const unsolved: string[] = [];
    for (let day = 0; day < 180; day++) {
      const key = dailyKey(new Date(Date.UTC(2026, 0, 1 + day)));
      const puzzle = dailyPuzzle(key);
      let solved = false;
      for (let seed = 0; seed < 3 && !solved; seed++) {
        solved = solveTrial(puzzle.trial, createRng(`daily:${key}:${seed}`), {
          genomes: { sire: puzzle.sire, dam: puzzle.dam },
        }).solved;
      }
      if (!solved) unsolved.push(`${key} (${puzzle.trial.species}) ${JSON.stringify(puzzle.trial.target)}`);
    }
    expect(unsolved, `unsolvable dailies:\n${unsolved.join("\n")}`).toEqual([]);
  });

  it("never asks for a lethal phenotype and a clean panel at once", () => {
    for (let day = 0; day < 120; day++) {
      const key = dailyKey(new Date(Date.UTC(2026, 0, 1 + day)));
      const puzzle = dailyPuzzle(key);
      const map = geneMapById(puzzle.trial.species);
      const wantsClean = puzzle.trial.target.some((clause) => clause.kind === "clear");
      if (!wantsClean) continue;
      for (const clause of puzzle.trial.target) {
        if (clause.kind !== "trait") continue;
        const lethalLook = map.loci.some((locus) =>
          locus.alleles.some((allele) => allele.lethal && allele.phenotype === clause.is),
        );
        expect(lethalLook, `${key} wants ${clause.is} and a clean panel`).toBe(false);
      }
    }
  });

  it("spends the one attempt and never replaces it", () => {
    const main = createRanch({ seed: "daily", species: "quillfen", motes: 0 });
    const key = "2026-04-20";
    expect(dailySpent(main, key)).toBe(false);

    const record = {
      dateKey: key,
      score: 2400,
      generations: 2,
      inbreeding: 0,
      matched: 3,
      total: 3,
      finished: true,
    };
    const played = recordDailyResult(main, record);
    expect(dailySpent(played, key)).toBe(true);
    expect(played.inventory.motes).toBe(600);

    const again = recordDailyResult(played, { ...record, score: 9999 });
    expect(again.records.daily[key]?.score).toBe(2400);
    expect(again.inventory.motes).toBe(600);
  });

  it("scores a clear above a partial, and a clean clear above an inbred one", () => {
    const base = { limit: 4, purity: 1, matched: 3, total: 3 };
    const clean = dailyScore({ ...base, cleared: true, generations: 2, inbreeding: 0 });
    const inbred = dailyScore({ ...base, cleared: true, generations: 2, inbreeding: 0.4 });
    const slow = dailyScore({ ...base, cleared: true, generations: 4, inbreeding: 0 });
    const partial = dailyScore({ ...base, cleared: false, generations: 4, inbreeding: 0, matched: 2 });

    expect(clean).toBeGreaterThan(inbred);
    expect(clean).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(partial);
    // Integers only: a leaderboard comparing 8123.4000000001 to 8123.4 is a bug
    // report with a scoreboard attached.
    for (const score of [clean, inbred, slow, partial]) expect(Number.isInteger(score)).toBe(true);
  });

  it("runs on a closed ranch of its own", () => {
    const puzzle = dailyPuzzle("2026-04-20");
    const state: RanchState = createTrialRanch(puzzle.trial, {
      genomes: { sire: puzzle.sire, dam: puzzle.dam },
      kind: "daily",
    });
    expect(state.trial?.kind).toBe("daily");
    expect(state.creatures).toHaveLength(2);
    expect(applyAction(state, { kind: "catchWild" }).events[0]).toMatchObject({ kind: "blocked" });
  });
});
