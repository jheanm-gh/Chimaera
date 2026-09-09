/**
 * Genotype -> phenotype.
 *
 * The player sees only what this function returns. Everything else — which
 * allele sits on which haplotype, what a creature carries but does not show —
 * is hidden until they earn it with a lens, a test cross, or a pedigree
 * deduction (§1.3). Keeping that boundary honest is the whole information game,
 * so nothing here leaks a genotype into the result.
 */

import type { GeneMap } from "./genemap.js";
import { genotypeAt, sexOf } from "./genome.js";
import type {
  AlleleDef,
  AlleleId,
  EpistasisCondition,
  EpistasisRule,
  Genome,
  Hsl,
  LocusDef,
  LocusId,
  Phenotype,
  StatId,
  TraitId,
} from "./types.js";

export interface ExpressionOptions {
  /**
   * Stat depression from inbreeding, 0-1 (see `pedigree.ts`). Applied to
   * ceilings, because inbreeding damages what a creature *could* have been,
   * not merely how it was raised.
   */
  readonly inbreedingDepression?: number;
  /**
   * Dominance suppressors (§5) force a recessive to show for one generation.
   * They change what the player can *see*, never the genome — so they belong
   * here in expression and nowhere near meiosis.
   */
  readonly suppressDominanceAt?: readonly string[];
}

/** Label used when an epistatic gate hides a locus the player would otherwise read. */
export const MASKED = "masked";

export function expressPhenotype(
  genome: Genome,
  map: GeneMap,
  options: ExpressionOptions = {},
): Phenotype {
  const sex = sexOf(genome, map);
  const traits: Record<TraitId, string> = {};
  const values: Record<TraitId, number> = {};
  const markSet = new Set<string>();
  const suppressed = new Set(options.suppressDominanceAt ?? []);

  for (const locus of map.loci) {
    if (locus.mode.kind === "polygenic") continue;
    const trait = locus.trait as TraitId;
    const genotype = genotypeAt(genome, locus);

    if (genotype.length === 0) {
      traits[trait] = locus.suppressedPhenotype ?? "absent";
      continue;
    }
    if (locus.expressedInSex && locus.expressedInSex !== sex) {
      traits[trait] = locus.suppressedPhenotype ?? "hidden";
      continue;
    }

    const alleles = genotype.map((id) => map.allele(locus.id, id));
    switch (locus.mode.kind) {
      case "dominance": {
        traits[trait] = expressDominance(alleles, suppressed.has(locus.id));
        break;
      }
      case "incomplete_dominance": {
        const blended = mean(alleles.map((a) => a.value ?? 0));
        values[trait] = blended;
        traits[trait] = nearestAlleleName(locus.alleles, blended);
        break;
      }
      case "codominance": {
        const marks = distinctMarks(alleles);
        traits[trait] = marks.length === 0 ? "none" : marks.join("+");
        if (locus.tags?.includes("pattern")) for (const mark of marks) markSet.add(mark);
        break;
      }
    }
  }

  const stats = computeStats(genome, map, options.inbreedingDepression ?? 0);
  let colour = computeColour(genome, map, values);

  const epistasisActive: string[] = [];
  for (const rule of map.species.epistasis) {
    if (!gateIsOpen(genome, map, rule)) continue;
    epistasisActive.push(rule.id);
    for (const locus of map.loci) {
      if (locus.mode.kind === "polygenic" || !locus.trait) continue;
      if (locus.id === rule.gate) continue;
      if (!locus.tags?.some((tag) => rule.masksTags.includes(tag))) continue;
      traits[locus.trait] = MASKED;
      delete values[locus.trait];
      if (locus.tags?.includes("pattern")) {
        for (const mark of distinctMarks(genotypeAt(genome, locus).map((id) => map.allele(locus.id, id)))) {
          markSet.delete(mark);
        }
      }
    }
    if (rule.setTraits) Object.assign(traits, rule.setTraits);
    if (rule.setColour) colour = rule.setColour;
  }

  return {
    species: genome.species,
    sex,
    traits,
    values,
    marks: [...markSet].sort(),
    stats,
    colour,
    epistasisActive,
  };
}

function expressDominance(alleles: readonly AlleleDef[], suppressDominance: boolean): string {
  // A dominance suppressor inverts the ranking for one observation: the most
  // recessive allele present is what shows. It reveals a carrier without
  // changing a single base of the genome.
  let best = alleles[0] as AlleleDef;
  for (const allele of alleles) {
    const rank = allele.dominance ?? 0;
    const bestRank = best.dominance ?? 0;
    if (suppressDominance ? rank < bestRank : rank > bestRank) best = allele;
  }
  return best.phenotype ?? best.id;
}

function distinctMarks(alleles: readonly AlleleDef[]): string[] {
  const marks = new Set<string>();
  for (const allele of alleles) {
    if (allele.mark) marks.add(allele.mark);
  }
  return [...marks].sort();
}

/**
 * Names a blended value after the nearest authored allele *at the locus*, not
 * merely the ones this creature carries. So a Heavy/Slight heterozygote reads
 * as "Middling" — indistinguishable by eye from a true Middling homozygote,
 * which is exactly the information problem incomplete dominance is here to pose.
 */
function nearestAlleleName(alleles: readonly AlleleDef[], blended: number): string {
  let best = alleles[0] as AlleleDef;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const allele of alleles) {
    const distance = Math.abs((allele.value ?? 0) - blended);
    if (distance < bestDistance - 1e-12) {
      bestDistance = distance;
      best = allele;
    }
  }
  return bestDistance < 1e-9 ? best.name : `${best.name} (blend)`;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

/**
 * Polygenic stat ceilings.
 *
 * Autosomal loci contribute the *sum* over every copy, so a copy-number
 * duplication is a genuine dosage gain — that is the "mildly game-breaking in a
 * fun way" the design asks for, bounded by `MAX_CNV_OVERSHOOT`.
 *
 * Sex-linked loci are dosage compensated instead: a hemizygous male gets the
 * mean of his copies scaled to two, exactly as X-upregulation does biologically.
 * Without this, every male in the game would be systematically slower than
 * every female for reasons no player would ever guess.
 */
const MAX_CNV_OVERSHOOT = 1.15;

function computeStats(genome: Genome, map: GeneMap, depression: number): Record<StatId, number> {
  const stats: Record<StatId, number> = {};
  for (const trait of map.polygenicTraits) {
    let raw = 0;
    for (const locusId of trait.loci) {
      const locus = map.locus(locusId);
      const genotype = genotypeAt(genome, locus);
      if (genotype.length === 0) continue;
      const values = genotype.map((id) => map.allele(locus.id, id).value ?? 0);
      raw += locus.onlyOn ? mean(values) * 2 : values.reduce((a, b) => a + b, 0);
    }
    const normalised = clamp(
      (raw - trait.rawMin) / (trait.rawMax - trait.rawMin),
      0,
      MAX_CNV_OVERSHOOT,
    );
    const ceiling = trait.min + normalised * (trait.max - trait.min);
    stats[trait.id] = ceiling * (1 - clamp(depression, 0, 0.9));
  }
  return stats;
}

function computeColour(
  genome: Genome,
  map: GeneMap,
  values: Readonly<Record<TraitId, number>>,
): Hsl {
  const palette = map.species.palette;
  const read = (locusId: string): number => {
    const locus = map.locus(locusId);
    const trait = locus.trait;
    if (trait && trait in values) return clamp(values[trait] as number, 0, 1);
    const genotype = genotypeAt(genome, locus);
    if (genotype.length === 0) return 0.5;
    return clamp(mean(genotype.map((id) => map.allele(locus.id, id).value ?? 0)), 0, 1);
  };
  const hue = lerp(palette.hue[0], palette.hue[1], read(palette.hueLocus));
  const saturation = lerp(palette.saturation[0], palette.saturation[1], read(palette.saturationLocus));
  // Heavier builds read darker: the lightness axis runs high-to-low.
  const lightness = lerp(palette.lightness[1], palette.lightness[0], read(palette.lightnessLocus));
  return { h: round(hue, 2), s: round(saturation, 4), l: round(lightness, 4) };
}

function gateIsOpen(genome: Genome, map: GeneMap, rule: EpistasisRule): boolean {
  if (!conditionHolds(genome, map, rule.gate, rule.when)) return false;
  for (const extra of rule.also ?? []) {
    if (!conditionHolds(genome, map, extra.locus, extra.when)) return false;
  }
  return true;
}

function conditionHolds(
  genome: Genome,
  map: GeneMap,
  locusId: LocusId,
  when: EpistasisCondition,
): boolean {
  const locus: LocusDef = map.locus(locusId);
  const genotype: AlleleId[] = genotypeAt(genome, locus);
  switch (when.kind) {
    case "homozygous":
      return genotype.length > 0 && genotype.every((a) => a === when.allele);
    case "carries":
      return genotype.includes(when.allele);
    case "lacks":
      return !genotype.includes(when.allele);
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
