/**
 * A Breeding Trial solver.
 *
 * It exists to answer one question in CI: is every authored puzzle actually
 * solvable inside its own generation limit? An authored puzzle nobody checked
 * is a puzzle that is unsolvable about a fifth of the time, and the player has
 * no way to tell which fifth — they just conclude the game is broken, and they
 * are right.
 *
 * It is a beam search over generations, not a proof. It plays the real
 * `breed()` through the real gene map, so a "solved" answer is one an actual
 * player could reproduce. A failure is therefore soft evidence — it means *this
 * search* did not find a route — which is why the test runs several seeds
 * before it fails a trial.
 *
 * It is also, deliberately, a decent opponent: the same scoring drives the
 * Rival Ranch ghosts, so the ghosts are animals someone plausibly bred rather
 * than random draws with the numbers turned up.
 */

import type { GeneMap, Genome, Phenotype, Rng } from "@chimaera/genetics";
import { breed, expressPhenotype, geneMapById, sexOf } from "@chimaera/genetics";
import { clauseHolds, trialGenomes } from "./trials.js";
import type { Trial } from "./trials.js";
import type { Creature } from "./types.js";

interface Candidate {
  readonly genome: Genome;
  readonly phenotype: Phenotype;
  readonly sex: "female" | "male";
  readonly generation: number;
  /** Wright's F, tracked approximately: parents' kinship is not modelled here. */
  readonly inbreeding: number;
}

export interface SolveResult {
  readonly solved: boolean;
  readonly generations: number;
  readonly clausesMet: number;
  readonly total: number;
  readonly inbreeding: number;
  /**
   * Offspring the search had to look at.
   *
   * The generation count says whether a trial is *possible*; this says roughly
   * how hard it is, because the solver breeds far more animals per generation
   * than a ten-berth trial ranch can hold. A tier 1 trial that takes four
   * offspring and a tier 5 that takes two hundred are both "one generation".
   */
  readonly offspring: number;
}

export interface SolveOptions {
  /** How many animals survive into the next generation. */
  readonly beam?: number;
  /** Clutches tried per pairing. */
  readonly clutch?: number;
  /** Pairings tried per generation. */
  readonly pairings?: number;
  /**
   * The pair to start from, when it is not the one the trial's spec describes.
   *
   * Daily Genome draws its pair from the wild pool first and then reads the
   * target off it, so its `Trial` carries no spec at all.
   */
  readonly genomes?: { readonly sire: Genome; readonly dam: Genome };
}

/** Scores a candidate the way a competent breeder would: clauses first, then heterozygosity. */
function scoreOf(trial: Trial, candidate: Candidate, map: GeneMap): number {
  const asCreature = { genome: candidate.genome, species: trial.species } as Creature;
  let met = 0;
  for (const clause of trial.target) {
    if (clauseHolds(clause, asCreature, candidate.phenotype, map)) met++;
  }
  // Carrying a needed allele without showing it is progress, so a partial match
  // scores above a total miss and the beam does not throw away the only animal
  // in the pool that has the thing.
  let partial = 0;
  for (const clause of trial.target) {
    if (clause.kind !== "homozygous") continue;
    const genotype = map.hasLocus(clause.locus)
      ? candidate.genome.chromosomes[map.locus(clause.locus).chromosome]
      : undefined;
    if (!genotype) continue;
    const carried =
      genotype.maternal.genes[clause.locus]?.includes(clause.allele) === true ||
      genotype.paternal.genes[clause.locus]?.includes(clause.allele) === true;
    if (carried) partial += 0.5;
  }
  return met * 10 + partial - candidate.inbreeding * 2;
}

export function solveTrial(trial: Trial, rng: Rng, options: SolveOptions = {}): SolveResult {
  const beam = options.beam ?? 14;
  const clutch = options.clutch ?? 5;
  const pairings = options.pairings ?? 16;
  const map = geneMapById(trial.species);
  const { sire, dam } = options.genomes ?? trialGenomes(trial);

  const start: Candidate[] = [sire, dam].map((genome) => ({
    genome,
    phenotype: expressPhenotype(genome, map),
    sex: sexOf(genome, map) === "male" ? "male" : "female",
    generation: 0,
    inbreeding: 0,
  }));

  let pool = start;
  let examined = 0;
  let best: { score: number; candidate: Candidate } = {
    score: Math.max(...start.map((c) => scoreOf(trial, c, map))),
    candidate: start[0] as Candidate,
  };

  for (const candidate of start) {
    const score = scoreOf(trial, candidate, map);
    if (score >= best.score) best = { score, candidate };
  }
  for (let generation = 1; generation <= trial.generations; generation++) {
    const sires = pool.filter((c) => c.sex === "male");
    const dams = pool.filter((c) => c.sex === "female");
    if (sires.length === 0 || dams.length === 0) break;

    const offspring: Candidate[] = [];
    for (let i = 0; i < pairings; i++) {
      const father = sires[i % sires.length] as Candidate;
      const mother = dams[(i * 3 + 1) % dams.length] as Candidate;
      // Related parents cost: the same trade the scoring function prices.
      const relatedness =
        father.generation > 0 && mother.generation > 0 ? 0.25 * Math.min(father.generation, mother.generation) / generation : 0;
      for (let k = 0; k < clutch; k++) {
        const result = breed(father.genome, mother.genome, map, rng, { inbreeding: relatedness });
        if (result.outcome !== "hatched") continue;
        examined++;
        const candidate: Candidate = {
          genome: result.genome,
          phenotype: result.phenotype,
          sex: result.phenotype.sex === "male" ? "male" : "female",
          generation,
          inbreeding: relatedness,
        };
        offspring.push(candidate);
        // Checked as it hatches rather than at the end of the generation, so
        // `offspring` counts what a player would actually have had to look at.
        if (solved(trial, candidate, map)) return report(trial, candidate, map, generation, true, examined);
      }
    }
    if (offspring.length === 0) break;

    for (const candidate of offspring) {
      const score = scoreOf(trial, candidate, map);
      if (score > best.score) best = { score, candidate };
    }

    // Keep the beam, but always keep at least one of each sex or the line ends.
    const ranked = [...offspring].sort((a, b) => scoreOf(trial, b, map) - scoreOf(trial, a, map));
    const kept = ranked.slice(0, beam);
    for (const sex of ["male", "female"] as const) {
      if (!kept.some((c) => c.sex === sex)) {
        const spare = ranked.find((c) => c.sex === sex);
        if (spare) kept.push(spare);
      }
    }
    pool = kept;
  }

  return report(trial, best.candidate, map, trial.generations, false, examined);
}

function solved(trial: Trial, candidate: Candidate, map: GeneMap): boolean {
  // Mirrors `meetsTarget`: the animal the trial hands you is not an answer.
  if (candidate.generation < 1) return false;
  const asCreature = { genome: candidate.genome, species: trial.species } as Creature;
  return trial.target.every((clause) => clauseHolds(clause, asCreature, candidate.phenotype, map));
}

function report(
  trial: Trial,
  candidate: Candidate,
  map: GeneMap,
  generations: number,
  wasSolved: boolean,
  offspring: number,
): SolveResult {
  const asCreature = { genome: candidate.genome, species: trial.species } as Creature;
  const met = trial.target.filter((clause) => clauseHolds(clause, asCreature, candidate.phenotype, map)).length;
  return {
    solved: wasSolved,
    generations,
    clausesMet: met,
    total: trial.target.length,
    inbreeding: candidate.inbreeding,
    offspring,
  };
}
