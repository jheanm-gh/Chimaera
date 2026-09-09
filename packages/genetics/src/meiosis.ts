/**
 * Gamete formation: crossover, linkage, and sex-chromosome segregation.
 *
 * ## The recombination model
 *
 * Walking the loci of a chromosome in map order, we read from one parental
 * haplotype and, in each gap, switch source with probability
 *
 *     r = (1 - e^(-2d)) / 2            (Haldane's mapping function, d in Morgans)
 *
 * Haldane's function is chosen over Kosambi's for one concrete reason: it is
 * exactly additive under the recombination composition rule
 * `r_AC = r_AB + r_BC - 2·r_AB·r_BC`. Applying it independently per gap
 * therefore reproduces the *correct* recombination fraction between any two
 * loci, however many loci sit between them — so a test can assert an exact
 * expected value for a 3cM pair and an 84cM pair alike, and the map stays a
 * single honest source of truth. (Kosambi models crossover interference more
 * realistically but is not additive; the extra realism is not worth losing a
 * checkable invariant.)
 *
 * Crossover inducers scale *map distance*, not `r`, which preserves that
 * additivity. Distance is capped so `r` approaches but never exceeds 0.5.
 *
 * ## Sex chromosomes
 *
 * An X and a Y in the same cell are heteromorphic and do not recombine here at
 * all: the gamete takes one intact haplotype. That is what makes X-linked loci
 * pass as a block from dam to son, and it is the whole reason sex linkage
 * reads as a distinct mechanic rather than as slightly odd autosomal
 * inheritance. Two X's in a female recombine normally.
 */

import type { GeneMap } from "./genemap.js";
import type { MutationContext } from "./mutation.js";
import { mutateLocus } from "./mutation.js";
import type { Rng } from "./rng.js";
import type {
  AlleleId,
  ChromosomeId,
  Gamete,
  Genome,
  Haplotype,
  LocusDef,
  LocusId,
  MutationEvent,
} from "./types.js";

/** Haldane's mapping function: genetic distance in Morgans to recombination fraction. */
export function recombinationFraction(morgans: number): number {
  if (morgans <= 0) return 0;
  return 0.5 * (1 - Math.exp(-2 * morgans));
}

export interface MeiosisOptions {
  /**
   * Multiplies map distance. Crossover inducers (§5) raise this to break
   * linkage drag. 1 is unmodified; values below 1 tighten linkage.
   */
  readonly crossoverMultiplier?: number;
  /**
   * Forces which member of a heteromorphic sex-chromosome pair segregates into
   * this gamete. Sex-selection reagents (§5) work by biasing *which sperm
   * succeeds*, not by editing anything, so this is the only place they touch.
   * Ignored on autosomes and on homomorphic pairs.
   */
  readonly forcedSexHaplotype?: "X" | "Y" | undefined;
}

/** Distances beyond this are already indistinguishable from free assortment. */
const MAX_GAP_MORGANS = 5;

export function makeGamete(
  genome: Genome,
  map: GeneMap,
  rng: Rng,
  mutation: MutationContext,
  options: MeiosisOptions = {},
): Gamete {
  const crossoverMultiplier = Math.max(0, options.crossoverMultiplier ?? 1);
  const haplotypes: Record<ChromosomeId, Haplotype> = {};
  const mutations: MutationEvent[] = [];

  for (const chromosome of map.chromosomes) {
    const pair = genome.chromosomes[chromosome.def.id];
    if (!pair) throw new Error(`genome is missing chromosome "${chromosome.def.id}"`);

    const copies = [pair.maternal, pair.paternal] as const;
    const heteromorphic = pair.maternal.kind !== pair.paternal.kind;
    let source = rng.bool(0.5) ? 0 : 1;
    if (heteromorphic && options.forcedSexHaplotype) {
      const forced = copies.findIndex((c) => c.kind === options.forcedSexHaplotype);
      if (forced >= 0) source = forced;
    }
    const genes: Record<LocusId, readonly AlleleId[]> = {};

    for (let i = 0; i < chromosome.loci.length; i++) {
      if (i > 0 && !heteromorphic) {
        const gap = chromosome.gapMorgans[i - 1] as number;
        const scaled = Math.min(gap * crossoverMultiplier, MAX_GAP_MORGANS);
        if (rng.bool(recombinationFraction(scaled))) source = source === 0 ? 1 : 0;
      }
      const locus = chromosome.loci[i] as LocusDef;
      const inherited = (copies[source] as Haplotype).genes[locus.id];
      if (!inherited || inherited.length === 0) continue; // hemizygous / absent on this copy
      genes[locus.id] = mutateLocus(locus, inherited, mutation, rng, mutations);
    }

    haplotypes[chromosome.def.id] = { kind: (copies[source] as Haplotype).kind, genes };
  }

  return { species: genome.species, haplotypes, mutations };
}

/** Fuses an egg and a sperm into a zygote. Maternal copy first, by convention. */
export function fuse(egg: Gamete, sperm: Gamete): Genome {
  if (egg.species !== sperm.species) {
    throw new Error(`cannot fuse gametes from different species (${egg.species} / ${sperm.species})`);
  }
  const chromosomes: Record<ChromosomeId, { maternal: Haplotype; paternal: Haplotype }> = {};
  for (const chromosomeId of Object.keys(egg.haplotypes)) {
    const maternal = egg.haplotypes[chromosomeId];
    const paternal = sperm.haplotypes[chromosomeId];
    if (!maternal || !paternal) throw new Error(`gametes disagree on chromosome "${chromosomeId}"`);
    chromosomes[chromosomeId] = { maternal, paternal };
  }
  return { species: egg.species, chromosomes };
}
