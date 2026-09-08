/**
 * Breeding Trials (§4): authored puzzles with a generation limit.
 *
 * A trial is its own small ranch. You are given two animals and a specification,
 * and you have a fixed number of generations to produce something that meets
 * it. No wild stock, no expeditions, no way out — the only lever is the pairing,
 * which is the point of the mode.
 *
 * Three deliberate constraints on the authoring:
 *
 *  1. **A starting pair is a spec over a few loci, not a whole genome.** The
 *     rest is drawn from the wild pool with the trial's own seed. That keeps
 *     each puzzle to a few lines, keeps it deterministic, and means the loci a
 *     trial does *not* name are genuinely incidental.
 *  2. **Targets are stated as what you can see**, plus carrier clauses that
 *     require a lens. A target you cannot verify is a target you cannot
 *     deliberately hit.
 *  3. **Every trial is proved solvable by a solver, in a test.** An authored
 *     puzzle nobody checked is a puzzle that is unsolvable about a fifth of the
 *     time, and the player has no way to tell which fifth.
 */

import type { AlleleId, GeneMap, Genome, LocusId, Phenotype, SpeciesId, StatId } from "@chimaera/genetics";
import { geneMapById, genomeFromSpec, genotypeAt } from "@chimaera/genetics";
import { mapOf } from "./bestiary.js";
import type { Creature, RanchState, TrialRecord } from "./types.js";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type TargetClause =
  /** A visible trait. The bread and butter. */
  | { readonly kind: "trait"; readonly trait: string; readonly is: string }
  /** A genetic ceiling. Visible once the animal is grown and measured. */
  | { readonly kind: "stat"; readonly stat: StatId; readonly atLeast: number }
  /** Carries an allele. Needs a lens or a deduction — never free. */
  | { readonly kind: "carries"; readonly locus: LocusId; readonly allele: AlleleId }
  /** Homozygous: the animal breeds true for it. */
  | { readonly kind: "homozygous"; readonly locus: LocusId; readonly allele: AlleleId }
  /** Carries none of the species' lethal alleles. */
  | { readonly kind: "clear" };

export type PairSpec = Readonly<Record<LocusId, readonly [AlleleId | null, AlleleId | null]>>;

export interface Trial {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly species: SpeciesId;
  /** 1 (teaching) to 5 (a project). Used for ordering and for the purse. */
  readonly tier: number;
  readonly sire: PairSpec;
  readonly dam: PairSpec;
  readonly target: readonly TargetClause[];
  readonly generations: number;
  /** What the trial lends you. Trials are not won by shopping. */
  readonly items?: Readonly<Record<string, number>>;
}

/**
 * Live trial state, carried on the trial's own ranch.
 *
 * `kind` distinguishes a Breeding Trial from a Daily Genome run: they share the
 * same closed-ranch rules — a generation cap and no wild stock — and differ in
 * how they are scored and how many attempts you get.
 */
export interface TrialState {
  readonly kind: "trial" | "daily";
  readonly id: string;
  readonly generations: number;
  readonly startedOnDay: number;
}

/**
 * The pair a trial hands you.
 *
 * `genomeFromSpec` fills every unnamed locus with the commonest wild allele, so
 * the pair is identical for every player without needing a seed — and the loci
 * the puzzle does not name really are incidental rather than quietly randomised
 * into a different puzzle each time.
 */
export function trialGenomes(trial: Trial): { sire: Genome; dam: Genome } {
  const map = geneMapById(trial.species);
  return {
    sire: genomeFromSpec(map, "male", trial.sire),
    dam: genomeFromSpec(map, "female", trial.dam),
  };
}

// ---------------------------------------------------------------------------
// Judging a trial
// ---------------------------------------------------------------------------

export function clauseHolds(
  clause: TargetClause,
  creature: Creature,
  phenotype: Phenotype,
  map: GeneMap,
): boolean {
  switch (clause.kind) {
    case "trait":
      return phenotype.traits[clause.trait] === clause.is;
    case "stat":
      return (phenotype.stats[clause.stat] ?? 0) >= clause.atLeast;
    case "carries":
      return map.hasLocus(clause.locus) && genotypeAt(creature.genome, map.locus(clause.locus)).includes(clause.allele);
    case "homozygous": {
      if (!map.hasLocus(clause.locus)) return false;
      const genotype = genotypeAt(creature.genome, map.locus(clause.locus));
      // Two copies, not "every copy present". A cock is hemizygous at an
      // X-linked locus, and reading that as homozygous let him satisfy a
      // breed-true clause by existing — which made three authored trials
      // solvable by looking at the animal you were handed.
      return genotype.length >= 2 && genotype.every((allele) => allele === clause.allele);
    }
    case "clear":
      return !map.loci.some((locus) =>
        locus.alleles.some(
          (allele) => allele.lethal !== undefined && genotypeAt(creature.genome, locus).includes(allele.id),
        ),
      );
  }
}

/**
 * Does this animal answer the trial?
 *
 * It must also be *bred*. Seven of the fifty-four were solvable by one of the
 * two animals the trial hands you — which is not a puzzle, it is a reading
 * comprehension exercise — and a rule is a better fix than editing seven
 * starting pairs and hoping the eighth never happens.
 */
export function meetsTarget(trial: Trial, creature: Creature, phenotype: Phenotype): boolean {
  if (creature.generation < 1) return false;
  const map = mapOf(creature);
  return trial.target.every((clause) => clauseHolds(clause, creature, phenotype, map));
}

/** How many clauses this animal satisfies. Shown live, so progress is legible. */
export function clausesMet(trial: Trial, creature: Creature, phenotype: Phenotype): number {
  const map = mapOf(creature);
  return trial.target.filter((clause) => clauseHolds(clause, creature, phenotype, map)).length;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface TrialScore {
  readonly cleared: boolean;
  readonly generations: number;
  readonly inbreeding: number;
  /** Homozygosity at the target loci: does the answer breed true? */
  readonly purity: number;
  readonly score: number;
}

export const TRIAL_BASE = 1000;

/**
 * Scored on generations used, purity and Wright's F — the brief's three, and
 * they pull against each other on purpose.
 *
 * The fast answer is the inbred one: pair the best two siblings and you fix the
 * trait in three generations with F above 0.25. The clean answer takes longer.
 * A scoring function that did not price both would quietly declare one of them
 * correct, and the mode would stop being about a decision.
 */
export function scoreTrial(trial: Trial, winner: Creature, phenotype: Phenotype, generations: number): TrialScore {
  const map = mapOf(winner);
  const cleared = meetsTarget(trial, winner, phenotype);
  const purity = purityOf(trial, winner, map);
  const spare = Math.max(0, trial.generations - generations);
  const score = cleared
    ? Math.round(
        TRIAL_BASE * (0.5 + 0.35 * trial.tier * 0.2) +
          spare * 140 +
          purity * 260 -
          Math.min(1, winner.inbreeding) * 700,
      )
    : 0;
  return { cleared, generations, inbreeding: winner.inbreeding, purity, score: Math.max(0, score) };
}

/** Fraction of the trial's named loci at which the winner is homozygous. */
export function purityOf(trial: Trial, creature: Creature, map: GeneMap): number {
  const loci = new Set<LocusId>();
  for (const clause of trial.target) {
    if (clause.kind === "carries" || clause.kind === "homozygous") loci.add(clause.locus);
    if (clause.kind === "trait") {
      for (const locus of map.loci) if (locus.trait === clause.trait) loci.add(locus.id);
    }
  }
  if (loci.size === 0) return 0.5;
  let pure = 0;
  for (const id of loci) {
    if (!map.hasLocus(id)) continue;
    const genotype = genotypeAt(creature.genome, map.locus(id));
    if (genotype.length > 0 && genotype.every((allele) => allele === genotype[0])) pure++;
  }
  return pure / loci.size;
}

/** The best animal on the ranch for this trial: cleared first, then purest. */
export function bestEntrant(
  trial: Trial,
  creatures: readonly Creature[],
  phenotypeOf: (creature: Creature) => Phenotype,
): Creature | undefined {
  let best: Creature | undefined;
  let bestKey = -1;
  for (const creature of creatures) {
    if (creature.status !== "active" || creature.stage === "egg") continue;
    if (creature.species !== trial.species) continue;
    const phenotype = phenotypeOf(creature);
    const met = clausesMet(trial, creature, phenotype);
    const key = met * 100 + purityOf(trial, creature, mapOf(creature)) * 10 - creature.inbreeding;
    if (key > bestKey) {
      bestKey = key;
      best = creature;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

/**
 * Scores a trial ranch as it stands.
 *
 * Callable at any point, not only at the end: a player should be able to see
 * what their current best animal would score before deciding whether to spend
 * another generation trying to beat it.
 */
export function completeTrial(
  trial: Trial,
  trialRanch: RanchState,
  phenotypeOf: (creature: Creature) => Phenotype,
): TrialScore | undefined {
  const winner = bestEntrant(trial, trialRanch.creatures, phenotypeOf);
  if (!winner) return undefined;
  const generations = Math.max(
    0,
    ...trialRanch.creatures.filter((c) => c.status !== "dead").map((c) => c.generation),
  );
  return scoreTrial(trial, winner, phenotypeOf(winner), generations);
}

/**
 * Writes a trial result back to the player's own ranch.
 *
 * Best-of: a worse run never overwrites a better one, because a player who
 * replays a cleared trial to show a friend should not lose their record for it.
 * The purse is paid on an improvement only, which is the same rule.
 */
export function recordTrialResult(main: RanchState, trial: Trial, score: TrialScore): RanchState {
  const previous = main.records.trials[trial.id];
  if (previous && previous.score >= score.score) return main;

  const record: TrialRecord = {
    cleared: score.cleared,
    generations: score.generations,
    inbreeding: score.inbreeding,
    score: score.score,
    onDay: main.day,
  };
  const gained = Math.max(0, score.score - (previous?.score ?? 0));
  return {
    ...main,
    inventory: { ...main.inventory, motes: main.inventory.motes + gained },
    records: { ...main.records, trials: { ...main.records.trials, [trial.id]: record } },
  };
}
