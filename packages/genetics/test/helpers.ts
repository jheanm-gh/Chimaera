import { expressPhenotype } from "../src/expression.js";
import { GeneMap } from "../src/genemap.js";
import { fuse, makeGamete } from "../src/meiosis.js";
import type { MutationContext, MutationRates } from "../src/mutation.js";
import { defaultNovelAlleleSource, NO_MUTAGENS } from "../src/mutation.js";
import type { Rng } from "../src/rng.js";
import { createRng } from "../src/rng.js";
import { QUILLFEN } from "../src/species/quillfen.js";
import type { Gamete, Genome, LocusId, Phenotype } from "../src/types.js";

export const map = new GeneMap(QUILLFEN);

/** Ratio tests need clean Mendelism: no mutation, no mutagens, no items. */
export const NO_MUTATION: MutationRates = { point: 0, novel: 0, duplication: 0 };

export function mutationContext(rates: MutationRates = NO_MUTATION): MutationContext {
  return { map, rates, mutagens: NO_MUTAGENS, novelSource: defaultNovelAlleleSource() };
}

export function gamete(genome: Genome, rng: Rng, crossoverMultiplier = 1): Gamete {
  return makeGamete(genome, map, rng, mutationContext(), { crossoverMultiplier });
}

/**
 * Zygotes straight from meiosis, bypassing fertility, stillbirth and lethality.
 * Mendelian ratios are statements about *zygotes*; filtering them through
 * survival first is how you accidentally assert the wrong ratio.
 */
export function zygotes(sire: Genome, dam: Genome, seed: string, n: number): Genome[] {
  const rng = createRng(seed);
  const out: Genome[] = [];
  for (let i = 0; i < n; i++) out.push(fuse(gamete(dam, rng), gamete(sire, rng)));
  return out;
}

export function phenotypes(genomes: readonly Genome[]): Phenotype[] {
  return genomes.map((genome) => expressPhenotype(genome, map));
}

export function tally<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export function fraction(counts: Map<string, number>, key: string, total: number): number {
  return (counts.get(key) ?? 0) / total;
}

/**
 * Tolerance for a proportion measured over `n` draws: four standard errors,
 * with a floor so tiny expected proportions do not demand absurd sample sizes.
 * Four sigma keeps the false-failure rate per assertion around 1 in 16,000,
 * which is what a suite this assertion-dense needs to stay trustworthy.
 */
export function tolerance(expected: number, n: number, sigmas = 4): number {
  return Math.max(sigmas * Math.sqrt((expected * (1 - expected)) / n), 0.0015);
}

export function locusIds(...ids: LocusId[]): LocusId[] {
  return ids;
}
