/**
 * The Punnett predictor (§1.3).
 *
 * This is the one tool in the game whose *quality* is a function of the
 * player's information rather than their money. Given two parents and whatever
 * the player currently knows about them, it returns the offspring distribution
 * — and where knowledge runs out it returns a range instead of a number.
 *
 * Two rules it must never break:
 *
 *  1. It may only read what the player has actually revealed. It takes
 *     `ParentKnowledge`, not `Genome`, so it is structurally incapable of
 *     leaking a hidden genotype into a prediction.
 *  2. Unknowns become visible uncertainty, never silent averaging. A player
 *     looking at `0.25` and a player looking at `0.06 – 0.50` are making very
 *     different decisions, and hiding the second case behind its mean would
 *     quietly destroy the reason to buy a lens or run a test cross.
 *
 * Linkage is modelled exactly: gametes are enumerated over the target loci with
 * per-gap recombination taken from the map, and *phase* is one of the things
 * the player may not know. Not knowing whether the fast allele and the lethal
 * one sit on the same haplotype is precisely the linkage-drag problem, and it
 * shows up here as a wide range.
 */

import { MASKED } from "./expression.js";
import type { GeneMap } from "./genemap.js";
import { genotypeAt, sexOf } from "./genome.js";
import { recombinationFraction } from "./meiosis.js";
import type {
  AlleleDef,
  AlleleId,
  ChromosomeId,
  Genome,
  LocusDef,
  LocusId,
  Phenotype,
  Sex,
} from "./types.js";

export interface ParentKnowledge {
  readonly sex: Sex;
  /** Always available: this is what the creature looks like. */
  readonly phenotype: Phenotype;
  /**
   * Loci whose genotype the player has actually established — by lens, assay,
   * sequencer, test cross, or pedigree deduction. Sorted allele lists.
   */
  readonly known: Readonly<Record<LocusId, readonly AlleleId[]>>;
  /**
   * Loci whose *phase* is known too, i.e. the player knows which alleles travel
   * together on one haplotype. Only a Deep Sequencer or a careful cross
   * establishes this, and it is what collapses linkage uncertainty.
   */
  readonly phased?: Readonly<Record<ChromosomeId, ReadonlyArray<Readonly<Record<LocusId, AlleleId>>>>>;
}

/** Builds knowledge from a genome, revealing only the named loci. */
export function knowledgeFromGenome(
  genome: Genome,
  map: GeneMap,
  phenotype: Phenotype,
  revealed: readonly LocusId[] = [],
  options: { readonly revealPhase?: boolean } = {},
): ParentKnowledge {
  const known: Record<LocusId, readonly AlleleId[]> = {};
  for (const locusId of revealed) known[locusId] = genotypeAt(genome, map.locus(locusId));

  const knowledge: ParentKnowledge = {
    sex: sexOf(genome, map),
    phenotype,
    known,
  };
  if (!options.revealPhase || revealed.length === 0) return knowledge;

  const phased: Record<ChromosomeId, Array<Record<LocusId, AlleleId>>> = {};
  for (const locusId of revealed) {
    const locus = map.locus(locusId);
    const pair = genome.chromosomes[locus.chromosome];
    if (!pair) continue;
    const slots = (phased[locus.chromosome] ??= [{}, {}]);
    const maternal = pair.maternal.genes[locusId]?.[0];
    const paternal = pair.paternal.genes[locusId]?.[0];
    if (maternal && slots[0]) slots[0][locusId] = maternal;
    if (paternal && slots[1]) slots[1][locusId] = paternal;
  }
  return { ...knowledge, phased };
}

export interface PredictOptions {
  /** Hypotheses kept per parent before truncation. Cost is O(k^2). */
  readonly maxHypothesesPerParent?: number;
  /** Rows kept in the joint table. */
  readonly maxJointRows?: number;
}

export interface Ranged {
  /** Prior-weighted probability across every hypothesis pair. */
  readonly p: number;
  /** Lowest probability under any single hypothesis pair. */
  readonly min: number;
  /** Highest probability under any single hypothesis pair. */
  readonly max: number;
}

export interface LocusPrediction {
  readonly locus: LocusId;
  readonly name: string;
  /** True when both parents' genotypes (and phase, where it matters) are known. */
  readonly certain: boolean;
  readonly genotypes: readonly (Ranged & { readonly genotype: string })[];
  readonly phenotypes: readonly (Ranged & { readonly label: string })[];
}

export interface OffspringPrediction {
  readonly loci: readonly LocusPrediction[];
  readonly joint: readonly (Ranged & { readonly combination: Readonly<Record<LocusId, string>> })[];
  /** Chance the egg fails because a target locus came up homozygous lethal. */
  readonly lethalRisk: Ranged;
  readonly sex: { readonly female: number; readonly male: number };
  /** Everything the prediction cannot see. Show these to the player verbatim. */
  readonly caveats: readonly string[];
  readonly hypotheses: { readonly sire: number; readonly dam: number; readonly truncated: boolean };
}

const MAX_TARGETS = 6;

export function predictOffspring(
  sire: ParentKnowledge,
  dam: ParentKnowledge,
  map: GeneMap,
  targetLoci: readonly LocusId[],
  options: PredictOptions = {},
): OffspringPrediction {
  if (targetLoci.length === 0) throw new Error("predictOffspring needs at least one target locus");
  if (targetLoci.length > MAX_TARGETS) {
    throw new Error(`predictOffspring supports at most ${MAX_TARGETS} loci at once`);
  }
  if (sire.sex !== "male" || dam.sex !== "female") {
    throw new Error("predictOffspring expects a male sire and a female dam");
  }

  const maxHypotheses = options.maxHypothesesPerParent ?? 24;
  const maxJointRows = options.maxJointRows ?? 24;
  const targets = targetLoci.map((id) => map.locus(id));
  const byChromosome = groupByChromosome(targets);

  const sireHypotheses = buildHypotheses(sire, map, byChromosome, maxHypotheses);
  const damHypotheses = buildHypotheses(dam, map, byChromosome, maxHypotheses);
  const caveats: string[] = [];
  collectCaveats(sire, dam, map, targets, sireHypotheses, damHypotheses, caveats);

  const accumulator = new Accumulator(targets);
  for (const sireH of sireHypotheses.list) {
    const sireGametes = gameteDistribution(sireH, map, byChromosome, "male");
    for (const damH of damHypotheses.list) {
      const damGametes = gameteDistribution(damH, map, byChromosome, "female");
      accumulator.observe(sireH.weight * damH.weight, sireGametes, damGametes, map, targets);
    }
  }

  return accumulator.finish(targets, caveats, maxJointRows, {
    sire: sireHypotheses.list.length,
    dam: damHypotheses.list.length,
    truncated: sireHypotheses.truncated || damHypotheses.truncated,
  });
}

// ---------------------------------------------------------------------------
// Hypotheses: every phased diplotype the player's knowledge still permits
// ---------------------------------------------------------------------------

/** One haplotype's alleles at the target loci of one chromosome. */
type HaploSlice = Record<LocusId, AlleleId>;

interface ChromosomeDiplotype {
  readonly chromosome: ChromosomeId;
  readonly a: HaploSlice;
  readonly b: HaploSlice;
  /** True when the parent is male and this is the sex chromosome (X paired with Y). */
  readonly heteromorphic: boolean;
}

interface Hypothesis {
  readonly weight: number;
  readonly groups: readonly ChromosomeDiplotype[];
}

function groupByChromosome(targets: readonly LocusDef[]): Map<ChromosomeId, LocusDef[]> {
  const groups = new Map<ChromosomeId, LocusDef[]>();
  for (const locus of targets) {
    const bucket = groups.get(locus.chromosome);
    if (bucket) bucket.push(locus);
    else groups.set(locus.chromosome, [locus]);
  }
  for (const bucket of groups.values()) bucket.sort((x, y) => x.position - y.position);
  return groups;
}

function buildHypotheses(
  parent: ParentKnowledge,
  map: GeneMap,
  byChromosome: Map<ChromosomeId, LocusDef[]>,
  limit: number,
): { list: Hypothesis[]; truncated: boolean } {
  let combos: Hypothesis[] = [{ weight: 1, groups: [] }];

  for (const [chromosomeId, loci] of byChromosome) {
    const isSexChromosome = chromosomeId === map.sexChromosome.def.id;
    const heteromorphic = isSexChromosome && parent.sex === "male";
    const perLocus = loci.map((locus) => candidateGenotypes(locus, parent, map, heteromorphic));
    const diplotypes = enumerateDiplotypes(chromosomeId, loci, perLocus, heteromorphic, parent);

    const next: Hypothesis[] = [];
    for (const base of combos) {
      for (const diplotype of diplotypes) {
        next.push({
          weight: base.weight * diplotype.weight,
          groups: [...base.groups, diplotype.value],
        });
      }
    }
    combos = next;
  }

  combos.sort((x, y) => y.weight - x.weight);
  const truncated = combos.length > limit;
  const kept = truncated ? combos.slice(0, limit) : combos;
  const total = kept.reduce((sum, h) => sum + h.weight, 0);
  return {
    list: kept.map((h) => ({ ...h, weight: total > 0 ? h.weight / total : 1 / kept.length })),
    truncated,
  };
}

interface Weighted<T> {
  readonly value: T;
  readonly weight: number;
}

/** Unordered genotypes still consistent with what the player can see and knows. */
function candidateGenotypes(
  locus: LocusDef,
  parent: ParentKnowledge,
  map: GeneMap,
  heteromorphic: boolean,
): Weighted<AlleleId[]>[] {
  const known = parent.known[locus.id];
  if (known) return [{ value: [...known].sort(), weight: 1 }];

  const hemizygous = heteromorphic && locus.onlyOn === "X";
  const yLinked = locus.onlyOn === "Y";
  if (yLinked && parent.sex === "female") return [{ value: [], weight: 1 }];

  const pool = map.wildPool(locus.id);
  const total = pool.weights.reduce((a, b) => a + b, 0);
  const freq = (allele: AlleleDef): number => (pool.weights[pool.alleles.indexOf(allele)] ?? 0) / total;

  const observed = locus.trait ? parent.phenotype.traits[locus.trait] : undefined;
  const observedValue = locus.trait ? parent.phenotype.values[locus.trait] : undefined;
  const out: Weighted<AlleleId[]>[] = [];

  if (hemizygous || yLinked) {
    for (const allele of pool.alleles) {
      if (!consistent(locus, [allele], observed, observedValue)) continue;
      out.push({ value: [allele.id], weight: freq(allele) });
    }
  } else {
    for (let i = 0; i < pool.alleles.length; i++) {
      for (let j = i; j < pool.alleles.length; j++) {
        const a = pool.alleles[i] as AlleleDef;
        const b = pool.alleles[j] as AlleleDef;
        if (!consistent(locus, [a, b], observed, observedValue)) continue;
        // Hardy-Weinberg: heterozygotes come in two orderings.
        out.push({ value: [a.id, b.id].sort(), weight: freq(a) * freq(b) * (i === j ? 1 : 2) });
      }
    }
  }

  // A creature that is alive cannot be homozygous for a recessive lethal.
  const viable = out.filter((candidate) => {
    if (candidate.value.length < 2) return true;
    const first = candidate.value[0] as AlleleId;
    if (!candidate.value.every((x) => x === first)) return true;
    return map.allele(locus.id, first).lethal?.mode !== "recessive";
  });

  const usable = viable.length > 0 ? viable : out;
  if (usable.length === 0) {
    throw new Error(`no genotype at "${locus.id}" is consistent with the observed phenotype`);
  }
  return usable;
}

/** Would this genotype produce the phenotype the player is looking at? */
function consistent(
  locus: LocusDef,
  alleles: readonly AlleleDef[],
  observed: string | undefined,
  observedValue: number | undefined,
): boolean {
  // Masked, sex-limited or absent traits tell the player nothing about the locus.
  if (observed === undefined || observed === MASKED || observed === "hidden" || observed === "absent") {
    return true;
  }
  switch (locus.mode.kind) {
    case "polygenic":
      // A stat is a sum across loci: it never identifies a single genotype.
      return true;
    case "dominance": {
      let best = alleles[0] as AlleleDef;
      for (const allele of alleles) {
        if ((allele.dominance ?? 0) > (best.dominance ?? 0)) best = allele;
      }
      return (best.phenotype ?? best.id) === observed;
    }
    case "incomplete_dominance": {
      if (observedValue === undefined) return true;
      const blended = alleles.reduce((sum, a) => sum + (a.value ?? 0), 0) / alleles.length;
      return Math.abs(blended - observedValue) < 1e-9;
    }
    case "codominance": {
      const marks = [...new Set(alleles.map((a) => a.mark).filter((m): m is string => !!m))].sort();
      return (marks.length === 0 ? "none" : marks.join("+")) === observed;
    }
  }
}

/**
 * Turns per-locus genotypes into phased diplotypes.
 *
 * Phase is fixed at the first heterozygous locus (mirror-image phasings give
 * identical gametes, since meiosis starts on a fair coin), which halves the
 * hypothesis space for free.
 */
function enumerateDiplotypes(
  chromosome: ChromosomeId,
  loci: readonly LocusDef[],
  perLocus: readonly Weighted<AlleleId[]>[][],
  heteromorphic: boolean,
  parent: ParentKnowledge,
): Weighted<ChromosomeDiplotype>[] {
  const knownPhase = parent.phased?.[chromosome];
  let states: Weighted<{ a: HaploSlice; b: HaploSlice; sawHet: boolean }>[] = [
    { value: { a: {}, b: {}, sawHet: false }, weight: 1 },
  ];

  for (let i = 0; i < loci.length; i++) {
    const locus = loci[i] as LocusDef;
    const candidates = perLocus[i] as Weighted<AlleleId[]>[];
    const next: Weighted<{ a: HaploSlice; b: HaploSlice; sawHet: boolean }>[] = [];
    for (const state of states) {
      for (const candidate of candidates) {
        const alleles = candidate.value;
        if (alleles.length === 0) continue;
        if (alleles.length === 1) {
          // Hemizygous: the single copy sits on haplotype a (the X), b stays empty.
          next.push({
            value: { a: { ...state.value.a, [locus.id]: alleles[0] as AlleleId }, b: { ...state.value.b }, sawHet: state.value.sawHet },
            weight: state.weight * candidate.weight,
          });
          continue;
        }
        const [first, second] = alleles as [AlleleId, AlleleId];
        if (first === second) {
          next.push({
            value: {
              a: { ...state.value.a, [locus.id]: first },
              b: { ...state.value.b, [locus.id]: second },
              sawHet: state.value.sawHet,
            },
            weight: state.weight * candidate.weight,
          });
          continue;
        }
        const orderings: Array<[AlleleId, AlleleId]> =
          knownPhase !== undefined
            ? phaseFromKnowledge(knownPhase, locus.id, first, second)
            : state.value.sawHet
              ? [
                  [first, second],
                  [second, first],
                ]
              : [[first, second]];
        for (const [onA, onB] of orderings) {
          next.push({
            value: {
              a: { ...state.value.a, [locus.id]: onA },
              b: { ...state.value.b, [locus.id]: onB },
              sawHet: true,
            },
            weight: (state.weight * candidate.weight) / orderings.length,
          });
        }
      }
    }
    states = next;
  }

  return states.map((state) => ({
    value: { chromosome, a: state.value.a, b: state.value.b, heteromorphic },
    weight: state.weight,
  }));
}

function phaseFromKnowledge(
  haplotypes: ReadonlyArray<Readonly<Record<LocusId, AlleleId>>>,
  locusId: LocusId,
  first: AlleleId,
  second: AlleleId,
): Array<[AlleleId, AlleleId]> {
  const onA = haplotypes[0]?.[locusId];
  const onB = haplotypes[1]?.[locusId];
  if (onA && onB && ((onA === first && onB === second) || (onA === second && onB === first))) {
    return [[onA, onB]];
  }
  return [
    [first, second],
    [second, first],
  ];
}

// ---------------------------------------------------------------------------
// Gametes
// ---------------------------------------------------------------------------

interface GameteOutcome {
  readonly alleles: Readonly<Record<LocusId, AlleleId>>;
  /** Which sex chromosome this gamete carries, when the target set involves one. */
  readonly sexKind?: "X" | "Y";
  readonly p: number;
}

function gameteDistribution(
  hypothesis: Hypothesis,
  map: GeneMap,
  byChromosome: Map<ChromosomeId, LocusDef[]>,
  parentSex: Sex,
): GameteOutcome[] {
  let combined: GameteOutcome[] = [{ alleles: {}, p: 1 }];

  for (const group of hypothesis.groups) {
    const loci = byChromosome.get(group.chromosome) as LocusDef[];
    const isSexChromosome = group.chromosome === map.sexChromosome.def.id;
    const local: GameteOutcome[] = [];

    if (isSexChromosome && parentSex === "male") {
      // X and Y do not recombine: the gamete takes one intact copy.
      local.push({ alleles: { ...group.a }, sexKind: "X", p: 0.5 });
      local.push({ alleles: yLinkedOnly(group.b, loci), sexKind: "Y", p: 0.5 });
    } else {
      const paths = enumerateCrossoverPaths(loci);
      for (const path of paths) {
        const alleles: Record<LocusId, AlleleId> = {};
        for (let i = 0; i < loci.length; i++) {
          const locus = loci[i] as LocusDef;
          const slice = (path.sources[i] === 0 ? group.a : group.b) as HaploSlice;
          const allele = slice[locus.id];
          if (allele) alleles[locus.id] = allele;
        }
        local.push(isSexChromosome ? { alleles, sexKind: "X", p: path.p } : { alleles, p: path.p });
      }
    }

    const next: GameteOutcome[] = [];
    for (const base of combined) {
      for (const part of local) {
        next.push({
          alleles: { ...base.alleles, ...part.alleles },
          sexKind: part.sexKind ?? base.sexKind,
          p: base.p * part.p,
        });
      }
    }
    combined = mergeGametes(next);
  }

  return combined;
}

function yLinkedOnly(slice: HaploSlice, loci: readonly LocusDef[]): Record<LocusId, AlleleId> {
  const out: Record<LocusId, AlleleId> = {};
  for (const locus of loci) {
    if (locus.onlyOn !== "Y") continue;
    const allele = slice[locus.id];
    if (allele) out[locus.id] = allele;
  }
  return out;
}

interface CrossoverPath {
  readonly sources: readonly number[];
  readonly p: number;
}

/**
 * Every source pattern across the target loci, with its exact probability.
 *
 * Because Haldane's function is additive under recombination composition, the
 * fraction between two *target* loci is simply Haldane of their map distance,
 * regardless of how many untargeted loci lie between them. That is what lets
 * this stay exact rather than approximate.
 */
function enumerateCrossoverPaths(loci: readonly LocusDef[]): CrossoverPath[] {
  let paths: CrossoverPath[] = [
    { sources: [0], p: 0.5 },
    { sources: [1], p: 0.5 },
  ];
  for (let i = 1; i < loci.length; i++) {
    const morgans =
      ((loci[i] as LocusDef).position - (loci[i - 1] as LocusDef).position) / 100;
    const r = recombinationFraction(morgans);
    const next: CrossoverPath[] = [];
    for (const path of paths) {
      const last = path.sources[path.sources.length - 1] as number;
      next.push({ sources: [...path.sources, last], p: path.p * (1 - r) });
      next.push({ sources: [...path.sources, last === 0 ? 1 : 0], p: path.p * r });
    }
    paths = next;
  }
  return paths;
}

function mergeGametes(gametes: readonly GameteOutcome[]): GameteOutcome[] {
  const merged = new Map<string, GameteOutcome>();
  for (const gamete of gametes) {
    if (gamete.p <= 0) continue;
    const key = `${gamete.sexKind ?? "-"}|${canonicalAlleles(gamete.alleles)}`;
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, p: existing.p + gamete.p } : gamete);
  }
  return [...merged.values()];
}

function canonicalAlleles(alleles: Readonly<Record<LocusId, AlleleId>>): string {
  return Object.keys(alleles)
    .sort()
    .map((k) => `${k}=${alleles[k]}`)
    .join(",");
}

// ---------------------------------------------------------------------------
// Accumulating outcomes into ranged probabilities
// ---------------------------------------------------------------------------

interface Bucket {
  mean: number;
  min: number;
  max: number;
}

class Accumulator {
  private readonly genotypes = new Map<LocusId, Map<string, Bucket>>();
  private readonly phenotypes = new Map<LocusId, Map<string, Bucket>>();
  private readonly joint = new Map<string, Bucket & { combination: Record<LocusId, string> }>();
  private readonly lethal: Bucket = { mean: 0, min: Number.POSITIVE_INFINITY, max: 0 };
  private female = 0;
  private male = 0;
  private pairs = 0;

  constructor(targets: readonly LocusDef[]) {
    for (const locus of targets) {
      this.genotypes.set(locus.id, new Map());
      this.phenotypes.set(locus.id, new Map());
    }
  }

  observe(
    weight: number,
    sireGametes: readonly GameteOutcome[],
    damGametes: readonly GameteOutcome[],
    map: GeneMap,
    targets: readonly LocusDef[],
  ): void {
    this.pairs++;
    const localGenotypes = new Map<LocusId, Map<string, number>>();
    const localPhenotypes = new Map<LocusId, Map<string, number>>();
    const localJoint = new Map<string, { p: number; combination: Record<LocusId, string> }>();
    let localLethal = 0;
    for (const locus of targets) {
      localGenotypes.set(locus.id, new Map());
      localPhenotypes.set(locus.id, new Map());
    }

    for (const sireGamete of sireGametes) {
      for (const damGamete of damGametes) {
        const p = sireGamete.p * damGamete.p;
        if (p <= 0) continue;
        if (sireGamete.sexKind === "Y") this.male += weight * p;
        else if (sireGamete.sexKind === "X") this.female += weight * p;

        const combination: Record<LocusId, string> = {};
        let lethalHere = false;
        for (const locus of targets) {
          const alleles: AlleleId[] = [];
          const fromDam = damGamete.alleles[locus.id];
          const fromSire = sireGamete.alleles[locus.id];
          if (fromDam) alleles.push(fromDam);
          if (fromSire) alleles.push(fromSire);
          alleles.sort();
          const label = alleles.length === 0 ? "-" : alleles.join("/");
          combination[locus.id] = label;
          const bucket = localGenotypes.get(locus.id) as Map<string, number>;
          bucket.set(label, (bucket.get(label) ?? 0) + p);
          const shown = singleLocusPhenotype(map, locus, label);
          const shownBucket = localPhenotypes.get(locus.id) as Map<string, number>;
          shownBucket.set(shown, (shownBucket.get(shown) ?? 0) + p);
          if (alleles.length >= 2) {
            const first = alleles[0] as AlleleId;
            if (
              alleles.every((a) => a === first) &&
              map.allele(locus.id, first).lethal?.mode === "recessive"
            ) {
              lethalHere = true;
            }
          }
        }
        if (lethalHere) localLethal += p;
        const key = canonicalCombination(combination);
        const existing = localJoint.get(key);
        if (existing) existing.p += p;
        else localJoint.set(key, { p, combination });
      }
    }

    // An outcome absent from this pair really did occur with probability zero
    // under this hypothesis, and one seen for the first time was zero under
    // every earlier pair. Both directions matter, or the ranges lie.
    for (const [source, destination] of [
      [localGenotypes, this.genotypes],
      [localPhenotypes, this.phenotypes],
    ] as const) {
      for (const [locusId, counts] of source) {
        const target = destination.get(locusId) as Map<string, Bucket>;
        for (const [label, p] of counts) record(target, label, weight, p, this.pairs);
        for (const label of target.keys()) if (!counts.has(label)) record(target, label, weight, 0, this.pairs);
      }
    }
    for (const [key, entry] of localJoint) {
      const bucket = this.joint.get(key);
      if (bucket) {
        bucket.mean += weight * entry.p;
        bucket.min = Math.min(bucket.min, entry.p);
        bucket.max = Math.max(bucket.max, entry.p);
      } else {
        this.joint.set(key, {
          combination: entry.combination,
          mean: weight * entry.p,
          min: this.pairs > 1 ? 0 : entry.p,
          max: entry.p,
        });
      }
    }
    for (const [key, bucket] of this.joint) {
      if (!localJoint.has(key)) bucket.min = 0;
    }
    this.lethal.mean += weight * localLethal;
    this.lethal.min = Math.min(this.lethal.min, localLethal);
    this.lethal.max = Math.max(this.lethal.max, localLethal);
  }

  finish(
    targets: readonly LocusDef[],
    caveats: readonly string[],
    maxJointRows: number,
    hypotheses: { sire: number; dam: number; truncated: boolean },
  ): OffspringPrediction {
    const loci: LocusPrediction[] = targets.map((locus) => {
      const genotypeBuckets = this.genotypes.get(locus.id) as Map<string, Bucket>;
      const phenotypeBuckets = this.phenotypes.get(locus.id) as Map<string, Bucket>;
      const certain = [...genotypeBuckets.values()].every(
        (bucket) => Math.abs(bucket.max - bucket.min) < 1e-9,
      );
      return {
        locus: locus.id,
        name: locus.name,
        certain,
        genotypes: sortRanged([...genotypeBuckets].map(([genotype, b]) => ({ genotype, ...toRanged(b) }))),
        phenotypes: sortRanged([...phenotypeBuckets].map(([label, b]) => ({ label, ...toRanged(b) }))),
      };
    });

    const joint = [...this.joint.values()]
      .map((bucket) => ({ combination: bucket.combination, ...toRanged(bucket) }))
      .sort((x, y) => y.p - x.p)
      .slice(0, maxJointRows);

    const sexTotal = this.female + this.male;
    return {
      loci,
      joint,
      lethalRisk: toRanged({
        mean: this.lethal.mean,
        min: this.pairs === 0 ? 0 : this.lethal.min,
        max: this.lethal.max,
      }),
      sex:
        sexTotal > 0
          ? { female: this.female / sexTotal, male: this.male / sexTotal }
          : { female: 0.5, male: 0.5 },
      caveats,
      hypotheses,
    };
  }
}

function record(
  target: Map<string, Bucket>,
  label: string,
  weight: number,
  p: number,
  pairsSoFar: number,
): void {
  const bucket = target.get(label);
  if (bucket) {
    bucket.mean += weight * p;
    bucket.min = Math.min(bucket.min, p);
    bucket.max = Math.max(bucket.max, p);
  } else {
    target.set(label, { mean: weight * p, min: pairsSoFar > 1 ? 0 : p, max: p });
  }
}

function toRanged(bucket: Bucket): Ranged {
  return {
    p: clamp01(bucket.mean),
    min: clamp01(Number.isFinite(bucket.min) ? bucket.min : 0),
    max: clamp01(bucket.max),
  };
}

function sortRanged<T extends Ranged>(rows: T[]): T[] {
  return rows.filter((row) => row.max > 1e-12).sort((x, y) => y.p - x.p);
}

function canonicalCombination(combination: Readonly<Record<LocusId, string>>): string {
  return Object.keys(combination)
    .sort()
    .map((k) => `${k}:${combination[k]}`)
    .join("|");
}

/** Expresses one locus in isolation. Epistasis is reported as a caveat instead. */
function singleLocusPhenotype(map: GeneMap, locus: LocusDef, genotype: string): string {
  if (genotype === "-") return locus.suppressedPhenotype ?? "absent";
  const alleles = genotype.split("/").map((id) => map.allele(locus.id, id));
  switch (locus.mode.kind) {
    case "polygenic":
      return `+${alleles.reduce((sum, a) => sum + (a.value ?? 0), 0)}`;
    case "dominance": {
      let best = alleles[0] as AlleleDef;
      for (const allele of alleles) if ((allele.dominance ?? 0) > (best.dominance ?? 0)) best = allele;
      return best.phenotype ?? best.id;
    }
    case "incomplete_dominance": {
      const blended = alleles.reduce((sum, a) => sum + (a.value ?? 0), 0) / alleles.length;
      const exact = alleles.find((a) => Math.abs((a.value ?? 0) - blended) < 1e-9);
      return exact ? exact.name : `blend ${blended.toFixed(2)}`;
    }
    case "codominance": {
      const marks = [...new Set(alleles.map((a) => a.mark).filter((m): m is string => !!m))].sort();
      return marks.length === 0 ? "none" : marks.join("+");
    }
  }
}

function collectCaveats(
  sire: ParentKnowledge,
  dam: ParentKnowledge,
  map: GeneMap,
  targets: readonly LocusDef[],
  sireHypotheses: { list: Hypothesis[]; truncated: boolean },
  damHypotheses: { list: Hypothesis[]; truncated: boolean },
  caveats: string[],
): void {
  const targetIds = new Set(targets.map((locus) => locus.id));

  for (const [label, parent] of [
    ["sire", sire],
    ["dam", dam],
  ] as const) {
    // Only warn where the genotype is genuinely still open. A locus with one
    // consistent genotype has been *deduced*, not guessed — a living creature
    // showing a recessive-lethal trait can only be a heterozygote — and calling
    // that "unknown" would teach the player to distrust an exact answer.
    const open = targets.filter((locus) => {
      if (parent.known[locus.id]) return false;
      const heteromorphic = locus.chromosome === map.sexChromosome.def.id && parent.sex === "male";
      return candidateGenotypes(locus, parent, map, heteromorphic).length > 1;
    });
    if (open.length > 0) {
      caveats.push(
        `${label} genotype not established at ${open.map((l) => l.name).join(", ")} — ranges below span every genotype consistent with its appearance.`,
      );
    }
  }

  for (const rule of map.species.epistasis) {
    const masksATarget = targets.some((locus) =>
      locus.tags?.some((tag) => rule.masksTags.includes(tag)),
    );
    if (!masksATarget) continue;
    const gateUnknown = !sire.known[rule.gate] || !dam.known[rule.gate];
    if (gateUnknown && !targetIds.has(rule.gate)) {
      caveats.push(
        `${map.locus(rule.gate).name} is not in this prediction and its genotype is unknown; ${rule.name} could hide these results entirely.`,
      );
    }
  }

  for (const locus of map.loci) {
    if (targetIds.has(locus.id)) continue;
    if (!locus.alleles.some((allele) => allele.lethal)) continue;
    caveats.push(`Lethal risk shown covers the selected loci only; ${locus.name} is not included.`);
  }

  for (const locus of targets) {
    if (locus.expressedInSex) {
      caveats.push(`${locus.name} only shows in ${locus.expressedInSex}s; the other sex carries it silently.`);
    }
  }

  if (sireHypotheses.truncated || damHypotheses.truncated) {
    caveats.push(
      "Too many genotypes are consistent with these parents; only the most likely were considered, so the true range may be wider.",
    );
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
