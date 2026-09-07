/**
 * Genome construction, inspection and serialisation.
 *
 * The serialisation format is deliberately compact and versioned from day one:
 * it is the substrate for save files and, later, shareable genome codes and QR
 * trading (§8.1). Adding a version field now costs nothing; retrofitting one
 * after players own creatures they refuse to lose is impossible.
 */

import type { GeneMap } from "./genemap.js";
import type { Rng } from "./rng.js";
import type {
  AlleleId,
  ChromosomeId,
  Genome,
  Haplotype,
  HaplotypeKind,
  LocusDef,
  LocusId,
  Sex,
} from "./types.js";

export const GENOME_FORMAT_VERSION = 1;

/** Sex is derived from the chromosomes, never stored twice. One source of truth. */
export function sexOf(genome: Genome, map: GeneMap): Sex {
  const pair = genome.chromosomes[map.sexChromosome.def.id];
  if (!pair) throw new Error(`genome is missing sex chromosome "${map.sexChromosome.def.id}"`);
  return pair.maternal.kind === "Y" || pair.paternal.kind === "Y" ? "male" : "female";
}

/**
 * All allele copies at a locus, sorted for stable comparison.
 *
 * Length 2 normally, 1 when hemizygous (an X-linked locus in a male), 3+ after
 * a copy-number duplication. Everything downstream must cope with all three.
 */
export function genotypeAt(genome: Genome, locus: LocusDef): AlleleId[] {
  const pair = genome.chromosomes[locus.chromosome];
  if (!pair) return [];
  const out: AlleleId[] = [];
  for (const hap of [pair.maternal, pair.paternal]) {
    const alleles = hap.genes[locus.id];
    if (alleles) out.push(...alleles);
  }
  return out.sort();
}

export function isHomozygousFor(genome: Genome, locus: LocusDef, allele: AlleleId): boolean {
  const genotype = genotypeAt(genome, locus);
  return genotype.length > 0 && genotype.every((a) => a === allele);
}

export function carries(genome: Genome, locus: LocusDef, allele: AlleleId): boolean {
  return genotypeAt(genome, locus).includes(allele);
}

/** Human-readable genotype, e.g. `D/d`. Used by the sim report and debug UI. */
export function genotypeLabel(genome: Genome, locus: LocusDef): string {
  const genotype = genotypeAt(genome, locus);
  return genotype.length === 0 ? "-" : genotype.join("/");
}

function emptyHaplotype(kind: HaplotypeKind): Haplotype {
  return { kind, genes: {} };
}

/**
 * Draws a fresh haplotype from the wild allele pool, then applies the species'
 * coupling rules so that founding populations carry realistic linkage
 * disequilibrium rather than perfectly independent loci.
 */
function wildHaplotype(
  map: GeneMap,
  chromosomeId: ChromosomeId,
  kind: HaplotypeKind,
  rng: Rng,
): Haplotype {
  const chromosome = map.chromosome(chromosomeId);
  const genes: Record<LocusId, AlleleId[]> = {};
  for (const locus of chromosome.loci) {
    if (locus.onlyOn && locus.onlyOn !== kind) continue;
    const pool = map.wildPool(locus.id);
    genes[locus.id] = [rng.weighted(pool.alleles, pool.weights).id];
  }
  for (const rule of map.species.wildCoupling) {
    if (rule.chromosome !== chromosomeId) continue;
    if (genes[rule.ifLocus]?.[0] !== rule.ifAllele) continue;
    if (!genes[rule.thenLocus]) continue;
    if (rng.bool(rule.coupling)) genes[rule.thenLocus] = [rule.thenAllele];
  }
  return { kind, genes };
}

export interface WildGenomeOptions {
  /** Force a sex; omit for a fair coin. */
  readonly sex?: Sex;
}

/** A founder: a creature with no pedigree, drawn from the wild gene pool. */
export function randomWildGenome(map: GeneMap, rng: Rng, options: WildGenomeOptions = {}): Genome {
  const sex = options.sex ?? (rng.bool(0.5) ? "female" : "male");
  const chromosomes: Record<ChromosomeId, { maternal: Haplotype; paternal: Haplotype }> = {};
  for (const chromosome of map.chromosomes) {
    if (chromosome.def.id === map.sexChromosome.def.id) {
      chromosomes[chromosome.def.id] = {
        maternal: wildHaplotype(map, chromosome.def.id, "X", rng),
        paternal: wildHaplotype(map, chromosome.def.id, sex === "male" ? "Y" : "X", rng),
      };
    } else {
      chromosomes[chromosome.def.id] = {
        maternal: wildHaplotype(map, chromosome.def.id, "autosome", rng),
        paternal: wildHaplotype(map, chromosome.def.id, "autosome", rng),
      };
    }
  }
  return { species: map.species.id, chromosomes };
}

/**
 * Builds a genome from an explicit per-locus allele pair. Test fixtures, story
 * set-pieces and Breeding Trial starting stock all need exact genotypes.
 *
 * `spec` maps a locus to `[maternalAllele, paternalAllele]`. A `null` entry
 * means "absent on that copy" (hemizygous). Unlisted loci fall back to the
 * first wild allele on both copies, which keeps fixtures short.
 */
export function genomeFromSpec(
  map: GeneMap,
  sex: Sex,
  spec: Readonly<Record<LocusId, readonly [AlleleId | null, AlleleId | null]>>,
): Genome {
  const chromosomes: Record<ChromosomeId, { maternal: Haplotype; paternal: Haplotype }> = {};
  for (const chromosome of map.chromosomes) {
    const isSex = chromosome.def.id === map.sexChromosome.def.id;
    const maternalKind: HaplotypeKind = isSex ? "X" : "autosome";
    const paternalKind: HaplotypeKind = isSex ? (sex === "male" ? "Y" : "X") : "autosome";
    const maternal: Record<LocusId, AlleleId[]> = {};
    const paternal: Record<LocusId, AlleleId[]> = {};
    for (const locus of chromosome.loci) {
      const provided = spec[locus.id];
      // Default to the *commonest* wild allele. Defaulting to the first one
      // listed would quietly hand every fixture a rare lethal.
      const pool = map.wildPool(locus.id);
      let fallbackIndex = 0;
      for (let i = 1; i < pool.weights.length; i++) {
        if ((pool.weights[i] as number) > (pool.weights[fallbackIndex] as number)) fallbackIndex = i;
      }
      const fallback = pool.alleles[fallbackIndex]?.id;
      const pick = (
        value: AlleleId | null | undefined,
        kind: HaplotypeKind,
        target: Record<LocusId, AlleleId[]>,
      ): void => {
        if (locus.onlyOn && locus.onlyOn !== kind) return;
        if (value === null) return;
        const allele = value ?? fallback;
        if (allele === undefined) return;
        if (!map.hasAllele(locus.id, allele)) {
          throw new Error(`unknown allele "${allele}" at locus "${locus.id}"`);
        }
        target[locus.id] = [allele];
      };
      pick(provided?.[0], maternalKind, maternal);
      pick(provided?.[1], paternalKind, paternal);
    }
    chromosomes[chromosome.def.id] = {
      maternal: { kind: maternalKind, genes: maternal },
      paternal: { kind: paternalKind, genes: paternal },
    };
  }
  return { species: map.species.id, chromosomes };
}

/** Convenience for fixtures: the same genotype on every listed locus. */
export function homozygous(
  map: GeneMap,
  sex: Sex,
  spec: Readonly<Record<LocusId, AlleleId>>,
): Genome {
  const pairs: Record<LocusId, readonly [AlleleId, AlleleId]> = {};
  for (const [locusId, allele] of Object.entries(spec)) pairs[locusId] = [allele, allele];
  return genomeFromSpec(map, sex, pairs);
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

export interface SerialisedGenome {
  readonly v: number;
  readonly sp: string;
  /** chromosome -> [maternalKind, maternalGenes, paternalKind, paternalGenes] */
  readonly c: Readonly<Record<string, [string, Record<string, string[]>, string, Record<string, string[]>]>>;
}

export function serialiseGenome(genome: Genome): SerialisedGenome {
  const c: Record<string, [string, Record<string, string[]>, string, Record<string, string[]>]> = {};
  // Sorted keys so the encoding is byte-stable: signed genome codes depend on it.
  for (const chromosomeId of Object.keys(genome.chromosomes).sort()) {
    const pair = genome.chromosomes[chromosomeId];
    if (!pair) continue;
    c[chromosomeId] = [
      pair.maternal.kind,
      plainGenes(pair.maternal),
      pair.paternal.kind,
      plainGenes(pair.paternal),
    ];
  }
  return { v: GENOME_FORMAT_VERSION, sp: genome.species, c };
}

function plainGenes(hap: Haplotype): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const locusId of Object.keys(hap.genes).sort()) {
    const alleles = hap.genes[locusId];
    if (alleles) out[locusId] = [...alleles];
  }
  return out;
}

export function deserialiseGenome(data: SerialisedGenome): Genome {
  if (data.v !== GENOME_FORMAT_VERSION) {
    throw new Error(`unsupported genome format v${data.v}; expected v${GENOME_FORMAT_VERSION}`);
  }
  const chromosomes: Record<ChromosomeId, { maternal: Haplotype; paternal: Haplotype }> = {};
  for (const [chromosomeId, entry] of Object.entries(data.c)) {
    const [mKind, mGenes, pKind, pGenes] = entry;
    chromosomes[chromosomeId] = {
      maternal: { kind: mKind as HaplotypeKind, genes: mGenes },
      paternal: { kind: pKind as HaplotypeKind, genes: pGenes },
    };
  }
  return { species: data.sp, chromosomes };
}

/** Stable string form. Equal genomes always produce equal strings. */
export function genomeFingerprint(genome: Genome): string {
  return JSON.stringify(serialiseGenome(genome));
}

export { emptyHaplotype };
