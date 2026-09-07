/**
 * One breeding: two parents in, one egg out — or nothing, or a dead egg.
 *
 * Failure is a first-class outcome here. A lethal allele that quietly produced
 * a healthy creature would be a bug; a lethal allele that returns a *legible*
 * failure the player can learn from is the mechanic (§1.2). Every unhappy
 * outcome therefore names its own cause.
 */

import { expressPhenotype } from "./expression.js";
import type { GeneMap } from "./genemap.js";
import { genotypeAt, sexOf } from "./genome.js";
import { fuse, makeGamete } from "./meiosis.js";
import type { MutagenLoad, MutationContext, MutationRates, NovelAlleleSource } from "./mutation.js";
import { BASELINE_MUTATION, defaultNovelAlleleSource, NO_MUTAGENS } from "./mutation.js";
import type { InbreedingPenalty } from "./pedigree.js";
import { inbreedingPenalty } from "./pedigree.js";
import type { Rng } from "./rng.js";
import type { AlleleId, Genome, LocusId, MutationEvent, Phenotype, Sex } from "./types.js";

/** Chance a fertile, unrelated, unmedicated pairing produces an egg at all. */
export const BASE_FERTILITY = 0.85;

export interface BreedOptions {
  /** Wright's F the offspring would carry. Supply from `Pedigree.projectedInbreeding`. */
  readonly inbreeding?: number;
  readonly mutationRates?: MutationRates;
  readonly mutagens?: MutagenLoad;
  readonly novelSource?: NovelAlleleSource;
  /** Crossover inducers (§5): scales map distance to break linkage drag. */
  readonly crossoverMultiplier?: number;
  /** Fertility tonics. Multiplies the base chance of producing an egg. */
  readonly fertilityMultiplier?: number;
  /** Sex-selection reagent: `reliability` is the chance it takes effect. */
  readonly sexSelection?: { readonly sex: Sex; readonly reliability: number };
}

export interface LethalHit {
  readonly locus: LocusId;
  readonly allele: AlleleId;
  readonly reason: string;
}

export type BreedResult =
  | {
      readonly outcome: "hatched";
      readonly genome: Genome;
      readonly phenotype: Phenotype;
      readonly mutations: readonly MutationEvent[];
      readonly inbreeding: InbreedingPenalty;
    }
  | { readonly outcome: "no-egg"; readonly inbreeding: InbreedingPenalty }
  | {
      readonly outcome: "lethal";
      /** The genome that would have hatched. Kept so the Compendium can teach from it. */
      readonly genome: Genome;
      readonly cause: LethalHit;
      readonly mutations: readonly MutationEvent[];
      readonly inbreeding: InbreedingPenalty;
    }
  | {
      readonly outcome: "stillborn";
      readonly genome: Genome;
      readonly mutations: readonly MutationEvent[];
      readonly inbreeding: InbreedingPenalty;
    };

export function breed(
  sire: Genome,
  dam: Genome,
  map: GeneMap,
  rng: Rng,
  options: BreedOptions = {},
): BreedResult {
  if (sire.species !== map.species.id || dam.species !== map.species.id) {
    throw new Error("both parents must belong to the gene map's species");
  }
  if (sexOf(sire, map) !== "male") throw new Error("sire is not male");
  if (sexOf(dam, map) !== "female") throw new Error("dam is not female");

  const mutagens = options.mutagens ?? NO_MUTAGENS;
  const penalty = inbreedingPenalty(options.inbreeding ?? 0);

  const fertility =
    BASE_FERTILITY *
    penalty.fertilityMultiplier *
    mutagens.fertilityMultiplier *
    (options.fertilityMultiplier ?? 1);
  if (!rng.bool(Math.min(1, fertility))) {
    return { outcome: "no-egg", inbreeding: penalty };
  }

  const mutation: MutationContext = {
    map,
    rates: options.mutationRates ?? BASELINE_MUTATION,
    mutagens,
    novelSource: options.novelSource ?? defaultNovelAlleleSource(),
  };
  const meiosis = { crossoverMultiplier: options.crossoverMultiplier ?? 1 };

  const egg = makeGamete(dam, map, rng, mutation, meiosis);

  // Sex-selection reagents bias which sperm succeeds, not what it carries.
  const selection = options.sexSelection;
  const forcedSexHaplotype =
    selection && rng.bool(selection.reliability)
      ? selection.sex === "male"
        ? ("Y" as const)
        : ("X" as const)
      : undefined;
  const sperm = makeGamete(sire, map, rng, mutation, { ...meiosis, forcedSexHaplotype });

  const genome = fuse(egg, sperm);
  const mutations = [...egg.mutations, ...sperm.mutations];

  const cause = findLethal(genome, map);
  if (cause) {
    return { outcome: "lethal", genome, cause, mutations, inbreeding: penalty };
  }

  const stillbirth = 1 - (1 - penalty.stillbirthChance) * (1 - mutagens.extraStillbirthChance);
  if (rng.bool(stillbirth)) {
    return { outcome: "stillborn", genome, mutations, inbreeding: penalty };
  }

  return {
    outcome: "hatched",
    genome,
    phenotype: expressPhenotype(genome, map, { inbreedingDepression: penalty.statDepression }),
    mutations,
    inbreeding: penalty,
  };
}

/**
 * A recessive lethal kills only when doubled. A single hemizygous copy is not
 * homozygosity, so an X-linked lethal would kill hemizygous males only if it
 * were authored to; the check below deliberately requires two or more copies.
 */
export function findLethal(genome: Genome, map: GeneMap): LethalHit | undefined {
  for (const locus of map.loci) {
    const genotype = genotypeAt(genome, locus);
    if (genotype.length < 2) continue;
    const first = genotype[0] as AlleleId;
    if (!genotype.every((a) => a === first)) continue;
    const allele = map.allele(locus.id, first);
    if (allele.lethal?.mode === "recessive") {
      return { locus: locus.id, allele: first, reason: allele.lethal.reason };
    }
  }
  return undefined;
}

/** Every recessive-lethal allele the creature carries but does not suffer from. */
export function carriedLethals(genome: Genome, map: GeneMap): LethalHit[] {
  const out: LethalHit[] = [];
  for (const locus of map.loci) {
    const genotype = genotypeAt(genome, locus);
    for (const alleleId of new Set(genotype)) {
      const allele = map.allele(locus.id, alleleId);
      if (allele.lethal?.mode === "recessive" && !genotype.every((a) => a === alleleId)) {
        out.push({ locus: locus.id, allele: alleleId, reason: allele.lethal.reason });
      }
    }
  }
  return out;
}
