/**
 * Compiles an authored `SpeciesDef` into indexed lookup structures, and
 * validates it hard at construction time. Authoring errors in genetics data are
 * miserable to debug once they are three thousand offspring deep, so they are
 * caught here instead.
 */

import type {
  AlleleDef,
  ChromosomeDef,
  ChromosomeId,
  LocusDef,
  LocusId,
  PolygenicTraitDef,
  SpeciesDef,
  StatId,
} from "./types.js";

export interface CompiledChromosome {
  readonly def: ChromosomeDef;
  /** Loci sorted by map position, ascending. */
  readonly loci: readonly LocusDef[];
  /** Genetic distance in Morgans between loci[i] and loci[i + 1]. */
  readonly gapMorgans: readonly number[];
}

export interface CompiledPolygenicTrait extends PolygenicTraitDef {
  /** Sum of allele values for the worst possible genotype. */
  readonly rawMin: number;
  /** Sum of allele values for the best possible genotype. */
  readonly rawMax: number;
}

export class GeneMap {
  readonly species: SpeciesDef;
  readonly chromosomes: readonly CompiledChromosome[];
  readonly sexChromosome: CompiledChromosome;

  private readonly lociById: Map<LocusId, LocusDef>;
  private readonly allelesByLocus: Map<LocusId, Map<string, AlleleDef>>;
  private readonly traitsById: Map<StatId, CompiledPolygenicTrait>;

  constructor(species: SpeciesDef) {
    this.species = species;
    this.lociById = new Map();
    this.allelesByLocus = new Map();

    for (const locus of species.loci) {
      if (this.lociById.has(locus.id)) {
        throw new Error(`${species.id}: duplicate locus id "${locus.id}"`);
      }
      if (locus.alleles.length === 0) {
        throw new Error(`${species.id}: locus "${locus.id}" has no alleles`);
      }
      const byId = new Map<string, AlleleDef>();
      for (const allele of locus.alleles) {
        if (byId.has(allele.id)) {
          throw new Error(`${species.id}: duplicate allele "${allele.id}" at "${locus.id}"`);
        }
        validateAllele(species.id, locus, allele);
        byId.set(allele.id, allele);
      }
      if (locus.mode.kind === "polygenic" && !locus.stat) {
        throw new Error(`${species.id}: polygenic locus "${locus.id}" needs a stat`);
      }
      if (locus.mode.kind !== "polygenic" && !locus.trait) {
        throw new Error(`${species.id}: locus "${locus.id}" needs a trait id`);
      }
      this.lociById.set(locus.id, locus);
      this.allelesByLocus.set(locus.id, byId);
    }

    const byChromosome = new Map<ChromosomeId, LocusDef[]>();
    for (const locus of species.loci) {
      const bucket = byChromosome.get(locus.chromosome);
      if (bucket) bucket.push(locus);
      else byChromosome.set(locus.chromosome, [locus]);
    }

    this.chromosomes = species.chromosomes.map((def) => {
      const loci = (byChromosome.get(def.id) ?? []).slice().sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        // Ties would make gamete assembly order-dependent; forbid them outright.
        throw new Error(
          `${species.id}: loci "${a.id}" and "${b.id}" share position ${a.position} on ${def.id}`,
        );
      });
      for (const locus of loci) {
        if (locus.position < 0 || locus.position > def.lengthCm) {
          throw new Error(
            `${species.id}: locus "${locus.id}" at ${locus.position}cM is off chromosome ${def.id} (${def.lengthCm}cM)`,
          );
        }
        if (locus.onlyOn && def.type !== "sex") {
          throw new Error(`${species.id}: locus "${locus.id}" is sex-linked but sits on an autosome`);
        }
        if (!locus.onlyOn && def.type === "sex") {
          throw new Error(
            `${species.id}: locus "${locus.id}" is on the sex chromosome and must declare onlyOn`,
          );
        }
      }
      const gapMorgans: number[] = [];
      for (let i = 1; i < loci.length; i++) {
        gapMorgans.push(((loci[i] as LocusDef).position - (loci[i - 1] as LocusDef).position) / 100);
      }
      return { def, loci, gapMorgans };
    });

    const sex = this.chromosomes.find((c) => c.def.id === species.sexChromosome);
    if (!sex) throw new Error(`${species.id}: sexChromosome "${species.sexChromosome}" is not defined`);
    if (sex.def.type !== "sex") throw new Error(`${species.id}: "${sex.def.id}" is not typed as a sex chromosome`);
    this.sexChromosome = sex;

    this.traitsById = new Map();
    for (const trait of species.polygenicTraits) {
      if (trait.loci.length < 3 || trait.loci.length > 5) {
        throw new Error(
          `${species.id}: polygenic trait "${trait.id}" has ${trait.loci.length} loci; the design calls for 3-5`,
        );
      }
      let rawMin = 0;
      let rawMax = 0;
      for (const locusId of trait.loci) {
        const locus = this.lociById.get(locusId);
        if (!locus) throw new Error(`${species.id}: trait "${trait.id}" references unknown locus "${locusId}"`);
        if (locus.mode.kind !== "polygenic" || locus.stat !== trait.id) {
          throw new Error(`${species.id}: locus "${locusId}" does not contribute to "${trait.id}"`);
        }
        const wildValues = locus.alleles.filter((a) => !a.novel).map((a) => a.value ?? 0);
        // Diploid: two copies per locus. Hemizygous sex-linked loci are dosage
        // compensated in expression, so they still count as two copies here.
        rawMin += 2 * Math.min(...wildValues);
        rawMax += 2 * Math.max(...wildValues);
      }
      if (rawMax <= rawMin) throw new Error(`${species.id}: trait "${trait.id}" has no genetic range`);
      this.traitsById.set(trait.id, { ...trait, rawMin, rawMax });
    }

    for (const rule of species.epistasis) {
      const gate = this.lociById.get(rule.gate);
      if (!gate) throw new Error(`${species.id}: epistasis "${rule.id}" gates unknown locus "${rule.gate}"`);
      if (!this.allelesByLocus.get(rule.gate)?.has(rule.when.allele)) {
        throw new Error(`${species.id}: epistasis "${rule.id}" references unknown allele "${rule.when.allele}"`);
      }
    }

    for (const key of ["hueLocus", "saturationLocus", "lightnessLocus"] as const) {
      const id = species.palette[key];
      if (!this.lociById.has(id)) {
        throw new Error(`${species.id}: palette.${key} references unknown locus "${id}"`);
      }
    }
    const [hueLo, hueHi] = species.palette.hue;
    if (hueLo >= hueHi) {
      // A wrapping hue arc makes incomplete-dominance blending non-monotone,
      // which is exactly how procedural colour turns to mud (§6.3).
      throw new Error(`${species.id}: palette hue range must not wrap through 0`);
    }

    for (const rule of species.wildCoupling) {
      const a = this.lociById.get(rule.ifLocus);
      const b = this.lociById.get(rule.thenLocus);
      if (!a || !b) throw new Error(`${species.id}: coupling "${rule.id}" references an unknown locus`);
      if (a.chromosome !== rule.chromosome || b.chromosome !== rule.chromosome) {
        throw new Error(`${species.id}: coupling "${rule.id}" spans chromosomes; linkage cannot do that`);
      }
    }
  }

  locus(id: LocusId): LocusDef {
    const found = this.lociById.get(id);
    if (!found) throw new Error(`${this.species.id}: unknown locus "${id}"`);
    return found;
  }

  hasLocus(id: LocusId): boolean {
    return this.lociById.has(id);
  }

  allele(locusId: LocusId, alleleId: string): AlleleDef {
    const found = this.allelesByLocus.get(locusId)?.get(alleleId);
    if (!found) throw new Error(`${this.species.id}: unknown allele "${alleleId}" at locus "${locusId}"`);
    return found;
  }

  hasAllele(locusId: LocusId, alleleId: string): boolean {
    return this.allelesByLocus.get(locusId)?.has(alleleId) ?? false;
  }

  polygenicTrait(id: StatId): CompiledPolygenicTrait {
    const found = this.traitsById.get(id);
    if (!found) throw new Error(`${this.species.id}: unknown polygenic trait "${id}"`);
    return found;
  }

  get polygenicTraits(): readonly CompiledPolygenicTrait[] {
    return [...this.traitsById.values()];
  }

  get loci(): readonly LocusDef[] {
    return this.species.loci;
  }

  chromosome(id: ChromosomeId): CompiledChromosome {
    const found = this.chromosomes.find((c) => c.def.id === id);
    if (!found) throw new Error(`${this.species.id}: unknown chromosome "${id}"`);
    return found;
  }

  /** Alleles that can be drawn from wild stock, with their relative weights. */
  wildPool(locusId: LocusId): { alleles: AlleleDef[]; weights: number[] } {
    const locus = this.locus(locusId);
    const alleles: AlleleDef[] = [];
    const weights: number[] = [];
    for (const allele of locus.alleles) {
      const w = allele.wildFrequency ?? 0;
      if (w > 0) {
        alleles.push(allele);
        weights.push(w);
      }
    }
    if (alleles.length === 0) {
      throw new Error(`${this.species.id}: locus "${locusId}" has no wild alleles`);
    }
    return { alleles, weights };
  }
}

function validateAllele(speciesId: string, locus: LocusDef, allele: AlleleDef): void {
  switch (locus.mode.kind) {
    case "dominance":
      if (allele.dominance === undefined) {
        throw new Error(`${speciesId}: "${allele.id}" at "${locus.id}" needs a dominance rank`);
      }
      if (allele.phenotype === undefined) {
        throw new Error(`${speciesId}: "${allele.id}" at "${locus.id}" needs a phenotype label`);
      }
      break;
    case "incomplete_dominance":
    case "polygenic":
      if (allele.value === undefined) {
        throw new Error(`${speciesId}: "${allele.id}" at "${locus.id}" needs a numeric value`);
      }
      break;
    case "codominance":
      if (allele.mark === undefined) {
        throw new Error(`${speciesId}: "${allele.id}" at "${locus.id}" needs a mark (or null)`);
      }
      break;
  }
  if (allele.novel && (allele.wildFrequency ?? 0) > 0) {
    throw new Error(`${speciesId}: novel allele "${allele.id}" cannot occur in wild stock`);
  }
}
