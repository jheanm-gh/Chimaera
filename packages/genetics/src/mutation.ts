/**
 * Mutation: the faucet that keeps a closed gene pool from going stale, and the
 * source of the game's treasure.
 *
 * Three distinct events, deliberately separated because they mean very
 * different things to a player:
 *
 *  - **point** — an allele flips to another allele that already exists in the
 *    wild pool. Common enough to matter over 20 generations, invisible in any
 *    single hatch.
 *  - **novel** — an allele that exists in no wild population anywhere (§1.4).
 *    Rare by three orders of magnitude. This is the mutation stinger, the
 *    Compendium entry, and the thing the discovering player gets to name.
 *  - **duplication** — a locus gains a second copy on one haplotype, so the
 *    creature carries three alleles. Weird, desirable, and slightly broken in
 *    a fun way.
 *
 * Mutagens raise these rates. They must never be free: `MutagenLoad` carries
 * the fertility and lifespan costs alongside the rate multipliers so the two
 * can never drift apart in balancing.
 */

import type { GeneMap } from "./genemap.js";
import type { Rng } from "./rng.js";
import type { AlleleDef, AlleleId, LocusDef, MutationEvent } from "./types.js";

export interface MutationRates {
  /** Per locus, per gamete. */
  readonly point: number;
  readonly novel: number;
  readonly duplication: number;
}

export const BASELINE_MUTATION: MutationRates = {
  point: 1.5e-4,
  novel: 2e-6,
  duplication: 1e-5,
};

/**
 * The combined effect of every mutagen and environmental exposure acting on a
 * breeding pair. Rate multipliers and their costs travel together on purpose.
 */
export interface MutagenLoad {
  readonly pointMultiplier: number;
  readonly novelMultiplier: number;
  readonly duplicationMultiplier: number;
  /** Multiplies the pairing's chance of producing an egg at all. */
  readonly fertilityMultiplier: number;
  /** Days subtracted from each parent's lifespan per breeding. */
  readonly lifespanCostDays: number;
  /** Extra chance the egg fails for reasons unrelated to a lethal genotype. */
  readonly extraStillbirthChance: number;
}

export const NO_MUTAGENS: MutagenLoad = {
  pointMultiplier: 1,
  novelMultiplier: 1,
  duplicationMultiplier: 1,
  fertilityMultiplier: 1,
  lifespanCostDays: 0,
  extraStillbirthChance: 0,
};

export function combineMutagens(loads: readonly MutagenLoad[]): MutagenLoad {
  return loads.reduce<MutagenLoad>(
    (acc, load) => ({
      pointMultiplier: acc.pointMultiplier * load.pointMultiplier,
      novelMultiplier: acc.novelMultiplier * load.novelMultiplier,
      duplicationMultiplier: acc.duplicationMultiplier * load.duplicationMultiplier,
      fertilityMultiplier: acc.fertilityMultiplier * load.fertilityMultiplier,
      lifespanCostDays: acc.lifespanCostDays + load.lifespanCostDays,
      extraStillbirthChance: 1 - (1 - acc.extraStillbirthChance) * (1 - load.extraStillbirthChance),
    }),
    NO_MUTAGENS,
  );
}

/**
 * Decides which novel allele a novel-mutation event produces.
 *
 * Injected rather than hard-coded so the game layer can enforce "first
 * discoverer names it" (§8.2) and keep unallocated slots scarce, without the
 * genetics package knowing anything about players or moderation.
 */
export interface NovelAlleleSource {
  claim(locus: LocusDef, rng: Rng): AlleleDef | undefined;
}

/** Default source: uniform choice among the locus's authored novel alleles. */
export function defaultNovelAlleleSource(): NovelAlleleSource {
  return {
    claim(locus, rng) {
      const candidates = locus.alleles.filter((a) => a.novel);
      return candidates.length === 0 ? undefined : rng.pick(candidates);
    },
  };
}

export interface MutationContext {
  readonly map: GeneMap;
  readonly rates: MutationRates;
  readonly mutagens: MutagenLoad;
  readonly novelSource: NovelAlleleSource;
}

/** Hard ceiling on copies of one locus per haplotype. Three total is the fun; six is nonsense. */
const MAX_COPIES_PER_HAPLOTYPE = 2;

/**
 * Applies mutation to the alleles a gamete just inherited at one locus.
 * Returns the (possibly unchanged) allele list and appends any events.
 */
export function mutateLocus(
  locus: LocusDef,
  inherited: readonly AlleleId[],
  ctx: MutationContext,
  rng: Rng,
  events: MutationEvent[],
): readonly AlleleId[] {
  if (inherited.length === 0) return inherited;
  let result: AlleleId[] | undefined;

  for (let i = 0; i < inherited.length; i++) {
    const current = inherited[i] as AlleleId;

    // Novel first: it is the rarest event, and a locus that just produced a
    // brand new allele should not immediately have it overwritten by a
    // pedestrian point mutation in the same draw.
    if (rng.bool(ctx.rates.novel * ctx.mutagens.novelMultiplier)) {
      const novel = ctx.novelSource.claim(locus, rng);
      if (novel && novel.id !== current) {
        result ??= [...inherited];
        result[i] = novel.id;
        events.push({ kind: "novel", locus: locus.id, from: current, to: novel.id });
        continue;
      }
    }

    if (rng.bool(ctx.rates.point * ctx.mutagens.pointMultiplier)) {
      const replacement = pickPointTarget(ctx.map, locus, current, rng);
      if (replacement) {
        result ??= [...inherited];
        result[i] = replacement;
        events.push({ kind: "point", locus: locus.id, from: current, to: replacement });
      }
    }
  }

  const working = result ?? inherited;
  if (
    working.length < MAX_COPIES_PER_HAPLOTYPE &&
    rng.bool(ctx.rates.duplication * ctx.mutagens.duplicationMultiplier)
  ) {
    const source = working[rng.int(working.length)] as AlleleId;
    const duplicated = [...working, source];
    events.push({ kind: "duplication", locus: locus.id, to: source });
    return duplicated;
  }

  return working;
}

function pickPointTarget(
  map: GeneMap,
  locus: LocusDef,
  current: AlleleId,
  rng: Rng,
): AlleleId | undefined {
  const pool = map.wildPool(locus.id);
  const alleles: AlleleDef[] = [];
  const weights: number[] = [];
  for (let i = 0; i < pool.alleles.length; i++) {
    const allele = pool.alleles[i] as AlleleDef;
    if (allele.id === current) continue;
    alleles.push(allele);
    weights.push(pool.weights[i] as number);
  }
  if (alleles.length === 0) return undefined;
  return rng.weighted(alleles, weights).id;
}
