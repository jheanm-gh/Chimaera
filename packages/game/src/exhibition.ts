/**
 * The Exhibition (§4): a second meta for players who do not want to fight.
 *
 * Judged on the animal alone. Every input here comes from the `Phenotype` and
 * from husbandry — never from a combat stat, and never from the genome. That is
 * not squeamishness: judging on genotype would hand a player information the
 * information game (§1.3) makes them buy, and a show ring that leaks a
 * genotype is a free Deep Sequencer.
 *
 * Four categories, and each one had to be *computable from what is visible*,
 * which ruled out the obvious ones. Symmetry is not judgeable because the rig
 * is symmetric by construction, so a symmetry score would be a constant with
 * extra steps.
 *
 *  - **Standard.** Conformation to a rotating seasonal standard. The one
 *    category the player can chase directly, and the reason the standard
 *    rotates: a herd bred for last season wins nothing this season.
 *  - **Rarity.** How improbable this *appearance* is in the wild population,
 *    computed from the species' own allele frequencies. It is the category that
 *    pays for the hard breeding, and it is honest — a rare coat is rare because
 *    the maths says so, not because a designer tagged it.
 *  - **Coherence.** Whether the animal reads as one animal: a coat sitting
 *    properly inside the species' palette, and a tidy number of marking layers
 *    rather than four fighting each other.
 *  - **Condition.** How close raising got it to its own ceiling. Husbandry, not
 *    genetics and not combat — the category a patient player wins without
 *    breeding anything new at all.
 */

import { expressPhenotype, randomWildGenome } from "@chimaera/genetics";
import type { GeneMap, LocusDef, Phenotype, Rng, StatId } from "@chimaera/genetics";
import { mapOf } from "./bestiary.js";
import { achievement } from "./lifecycle.js";
import type { Creature } from "./types.js";

// ---------------------------------------------------------------------------
// Standards
// ---------------------------------------------------------------------------

export type StandardClause =
  /** A continuous trait near a target. `trait` is resolved per species. */
  | {
      readonly kind: "value";
      readonly slot: "hue" | "saturation" | "build";
      readonly target: number;
      readonly tolerance: number;
      readonly label: string;
    }
  /** How many co-dominant marking layers the judges want to see. */
  | { readonly kind: "marks"; readonly atLeast: number; readonly atMost: number; readonly label: string }
  /** No epistatic gate may be closed: the judges want the colour work visible. */
  | { readonly kind: "unmasked"; readonly label: string };

export interface ShowStandard {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly wants: readonly StandardClause[];
  /** Category weights. Sum to 1, and the sum is asserted by a test. */
  readonly weights: {
    readonly standard: number;
    readonly rarity: number;
    readonly coherence: number;
    readonly condition: number;
  };
}

/**
 * The season's standards, in rotation.
 *
 * Each one weights the four categories differently as well as naming different
 * traits, so "breed for the show" is a different project each season rather
 * than the same project with a different colour swatch.
 */
export const STANDARDS: readonly ShowStandard[] = [
  {
    id: "deep-water",
    name: "The Deep Water Standard",
    blurb: "Dark, unmarked and severe. The judges this season have no patience for decoration.",
    wants: [
      { kind: "value", slot: "hue", target: 0.15, tolerance: 0.3, label: "cold in the coat" },
      { kind: "value", slot: "saturation", target: 0.2, tolerance: 0.35, label: "muted" },
      { kind: "marks", atLeast: 0, atMost: 1, label: "at most one marking layer" },
    ],
    weights: { standard: 0.4, rarity: 0.2, coherence: 0.2, condition: 0.2 },
  },
  {
    id: "high-bloom",
    name: "The High Bloom Standard",
    blurb: "Vivid, layered and loud. Everything the Deep Water judges despise.",
    wants: [
      { kind: "value", slot: "saturation", target: 0.95, tolerance: 0.3, label: "vivid" },
      { kind: "marks", atLeast: 2, atMost: 3, label: "two or three marking layers" },
      { kind: "unmasked", label: "no gate closed over the colour work" },
    ],
    weights: { standard: 0.35, rarity: 0.25, coherence: 0.25, condition: 0.15 },
  },
  {
    id: "old-blood",
    name: "The Old Blood Standard",
    blurb: "Rarity above all. Bring something the survey has not recorded.",
    wants: [{ kind: "unmasked", label: "the coat legible" }],
    weights: { standard: 0.1, rarity: 0.55, coherence: 0.15, condition: 0.2 },
  },
  {
    id: "working-stock",
    name: "The Working Stock Standard",
    blurb: "Condition and coherence. A well-kept ordinary animal beats a badly-kept marvel.",
    wants: [
      { kind: "value", slot: "build", target: 0.75, tolerance: 0.35, label: "heavy through the body" },
      { kind: "marks", atLeast: 1, atMost: 2, label: "one or two marking layers" },
    ],
    weights: { standard: 0.25, rarity: 0.1, coherence: 0.25, condition: 0.4 },
  },
  {
    id: "pale-season",
    name: "The Pale Season Standard",
    blurb: "Light, warm and clean. A difficult standard on a species bred dark.",
    wants: [
      { kind: "value", slot: "hue", target: 0.85, tolerance: 0.3, label: "warm in the coat" },
      { kind: "value", slot: "build", target: 0.2, tolerance: 0.35, label: "slight through the body" },
      { kind: "value", slot: "saturation", target: 0.55, tolerance: 0.4, label: "clear, not vivid" },
    ],
    weights: { standard: 0.45, rarity: 0.2, coherence: 0.2, condition: 0.15 },
  },
];

export const SEASON_DAYS = 30;

/** Which standard is in force. Rotates on a fixed calendar, so it can be planned for. */
export function standardForDay(day: number): ShowStandard {
  const index = Math.floor(Math.max(0, day) / SEASON_DAYS) % STANDARDS.length;
  return STANDARDS[index] as ShowStandard;
}

export function daysLeftInSeason(day: number): number {
  return SEASON_DAYS - (Math.max(0, day) % SEASON_DAYS);
}

// ---------------------------------------------------------------------------
// Judging
// ---------------------------------------------------------------------------

export interface CategoryScore {
  readonly id: "standard" | "rarity" | "coherence" | "condition";
  readonly name: string;
  /** 0-1 before weighting. */
  readonly score: number;
  readonly weight: number;
  /** What the judge wrote. */
  readonly note: string;
}

export interface Scorecard {
  readonly total: number;
  readonly categories: readonly CategoryScore[];
}

/** Which phenotype trait carries a species' hue, saturation and build. */
function slotTrait(map: GeneMap, slot: "hue" | "saturation" | "build"): string | undefined {
  const locusId =
    slot === "hue"
      ? map.species.palette.hueLocus
      : slot === "saturation"
        ? map.species.palette.saturationLocus
        : map.species.palette.lightnessLocus;
  return map.locus(locusId).trait;
}

function slotValue(phenotype: Phenotype, map: GeneMap, slot: "hue" | "saturation" | "build"): number | undefined {
  const trait = slotTrait(map, slot);
  return trait === undefined ? undefined : phenotype.values[trait];
}

/**
 * Wild probability of one locus showing what this animal shows.
 *
 * Enumerates every unordered allele pair, weights it by Hardy-Weinberg from the
 * species' own wild frequencies, and sums the ones that would look the same.
 * Judging the *appearance* rather than the genotype is the point: two animals
 * that look identical are equally rare in the ring, whatever is underneath.
 */
export function phenotypeProbability(locus: LocusDef, shown: string): number {
  const wild = locus.alleles.filter((allele) => (allele.wildFrequency ?? 0) > 0);
  const total = wild.reduce((sum, allele) => sum + (allele.wildFrequency ?? 0), 0);
  if (total <= 0 || wild.length === 0) return 1;

  let probability = 0;
  for (let i = 0; i < wild.length; i++) {
    for (let j = i; j < wild.length; j++) {
      const a = wild[i];
      const b = wild[j];
      if (!a || !b) continue;
      const pa = (a.wildFrequency ?? 0) / total;
      const pb = (b.wildFrequency ?? 0) / total;
      const weight = i === j ? pa * pb : 2 * pa * pb;
      if (appearanceOf(locus, a.id, b.id) === shown) probability += weight;
    }
  }
  return probability;
}

/** What a genotype looks like at one locus, by that locus' own inheritance mode. */
function appearanceOf(locus: LocusDef, first: string, second: string): string | undefined {
  const a = locus.alleles.find((allele) => allele.id === first);
  const b = locus.alleles.find((allele) => allele.id === second);
  if (!a || !b) return undefined;
  switch (locus.mode.kind) {
    case "dominance": {
      const winner = (a.dominance ?? 0) >= (b.dominance ?? 0) ? a : b;
      return winner.phenotype;
    }
    case "codominance": {
      const marks = [a.mark, b.mark].filter((mark): mark is string => Boolean(mark));
      return marks.length === 0 ? "none" : [...new Set(marks)].sort().join("+");
    }
    case "incomplete_dominance": {
      // Matches `expression.ts`: the blend is named for the nearest allele, and
      // anything between two of them is "<name> (blend)".
      const blended = ((a.value ?? 0) + (b.value ?? 0)) / 2;
      let best = locus.alleles[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const allele of locus.alleles) {
        const distance = Math.abs((allele.value ?? 0) - blended);
        if (distance < bestDistance - 1e-12) {
          bestDistance = distance;
          best = allele;
        }
      }
      return best === undefined ? undefined : bestDistance < 1e-9 ? best.name : `${best.name} (blend)`;
    }
    default:
      return undefined;
  }
}

/**
 * Rarity, as surprisal.
 *
 * `-log2 P` over every visible locus, divided by the surprisal of a *typical*
 * animal of the species so that the number means the same thing on a Quillfen
 * and on an Ashen Lorric.
 *
 * The divisor is three times the baseline entropy, not twice. At twice, five
 * percent of ordinary wild animals scored a flat 1.0 — the clamp was doing the
 * judging, and a category called Rarity that a random animal maxes out is not
 * a category. At three times the wild median sits near 0.5 and topping it out
 * takes a genuinely improbable coat.
 */
export function rarityOf(phenotype: Phenotype, map: GeneMap): number {
  const hidden = hiddenLoci(phenotype, map);
  let surprisal = 0;
  let baseline = 0;
  for (const locus of map.loci) {
    if (locus.trait === undefined || locus.mode.kind === "polygenic") continue;
    if (hidden.has(locus.id)) continue;
    const shown = phenotype.traits[locus.trait];
    if (shown === undefined) continue;
    // A locus a sex does not express is not on show. Reading it would score
    // "hidden" as an appearance the wild pool cannot produce, which is how the
    // first version of this made every hen the rarest animal in the county.
    if (locus.suppressedPhenotype !== undefined && shown === locus.suppressedPhenotype) continue;
    const probability = phenotypeProbability(locus, shown);
    // A phenotype the wild pool cannot produce at all — a novel allele showing
    // — is the rarest thing there is, and must not divide by zero.
    surprisal += probability <= 0 ? 12 : -Math.log2(probability);
    baseline += expectedSurprisal(locus);
  }
  if (baseline <= 0) return 0.5;
  return clamp01(surprisal / (baseline * 3));
}

/**
 * Loci an active epistatic gate has switched off.
 *
 * They must not be scored. A masked locus shows a label like "unpigmented" that
 * no wild allele pair produces, so scoring it charged the full novel-allele
 * surprisal *per masked locus* — and an albino, which is a perfectly ordinary
 * one-in-sixteen animal, came out as the rarest thing the judges had ever seen.
 * The gate locus itself is still scored, and a one-in-sixteen coat is worth
 * exactly the four bits it costs.
 */
function hiddenLoci(phenotype: Phenotype, map: GeneMap): Set<string> {
  const hidden = new Set<string>();
  for (const id of phenotype.epistasisActive) {
    const rule = map.species.epistasis.find((r) => r.id === id);
    if (!rule) continue;
    for (const locus of map.loci) {
      if (locus.tags?.some((tag) => rule.masksTags.includes(tag))) hidden.add(locus.id);
      if (locus.trait !== undefined && rule.setTraits?.[locus.trait] !== undefined) hidden.add(locus.id);
    }
  }
  return hidden;
}

/** Shannon entropy of the locus' appearances: what a typical animal costs to describe. */
function expectedSurprisal(locus: LocusDef): number {
  const seen = new Map<string, number>();
  const wild = locus.alleles.filter((allele) => (allele.wildFrequency ?? 0) > 0);
  const total = wild.reduce((sum, allele) => sum + (allele.wildFrequency ?? 0), 0);
  if (total <= 0) return 0;
  for (let i = 0; i < wild.length; i++) {
    for (let j = i; j < wild.length; j++) {
      const a = wild[i];
      const b = wild[j];
      if (!a || !b) continue;
      const pa = (a.wildFrequency ?? 0) / total;
      const pb = (b.wildFrequency ?? 0) / total;
      const weight = i === j ? pa * pb : 2 * pa * pb;
      const shown = appearanceOf(locus, a.id, b.id);
      if (shown !== undefined) seen.set(shown, (seen.get(shown) ?? 0) + weight);
    }
  }
  let entropy = 0;
  for (const probability of seen.values()) {
    if (probability > 0) entropy += probability * -Math.log2(probability);
  }
  return entropy;
}

export function judge(
  creature: Creature,
  phenotype: Phenotype,
  standard: ShowStandard,
): Scorecard {
  const map = mapOf(creature);
  const raw: CategoryScore[] = [
    standardScore(phenotype, map, standard),
    { id: "rarity", name: "Rarity", score: rarityOf(phenotype, map), weight: 0, note: "" },
    coherenceScore(phenotype, map),
    conditionScore(creature, phenotype, map),
  ];
  // Weights live on the standard, not on the scorer, so a season can change
  // what matters without changing what anything means.
  const categories: CategoryScore[] = raw.map((category) => ({
    ...category,
    weight: standard.weights[category.id],
    note: category.note === "" ? noteFor(category.id, category.score) : category.note,
  }));

  const total = categories.reduce((sum, category) => sum + category.score * category.weight, 0);
  return { total, categories };
}

function standardScore(phenotype: Phenotype, map: GeneMap, standard: ShowStandard): CategoryScore {
  if (standard.wants.length === 0) {
    return { id: "standard", name: "Standard", score: 0.5, weight: 0, note: "No clauses this season." };
  }
  const misses: string[] = [];
  let score = 0;
  for (const clause of standard.wants) {
    const part = clauseScore(clause, phenotype, map);
    score += part;
    if (part < 0.5) misses.push(clause.label);
  }
  score /= standard.wants.length;
  return {
    id: "standard",
    name: "Standard",
    score,
    weight: 0,
    note: misses.length === 0 ? "Meets the standard throughout." : `Wanted: ${misses.join("; ")}.`,
  };
}

function clauseScore(clause: StandardClause, phenotype: Phenotype, map: GeneMap): number {
  switch (clause.kind) {
    case "value": {
      const value = slotValue(phenotype, map, clause.slot);
      // A species that does not express this slot cannot be marked down for it.
      if (value === undefined) return 0.5;
      const distance = Math.abs(value - clause.target);
      return clamp01(1 - distance / Math.max(1e-6, clause.tolerance));
    }
    case "marks": {
      const count = phenotype.marks.length;
      if (count >= clause.atLeast && count <= clause.atMost) return 1;
      const off = count < clause.atLeast ? clause.atLeast - count : count - clause.atMost;
      return clamp01(1 - off * 0.45);
    }
    case "unmasked":
      return phenotype.epistasisActive.length === 0 ? 1 : 0;
  }
}

/**
 * Does it read as one animal?
 *
 * A coat sitting inside the species' own palette rather than at an extreme of
 * it, and a tidy number of marking layers. Three or four co-dominant layers
 * fighting each other is exactly the thing a judge calls "busy".
 */
function coherenceScore(phenotype: Phenotype, map: GeneMap): CategoryScore {
  const { saturation, lightness } = map.species.palette;
  const inBand = (value: number, [lo, hi]: readonly [number, number]): number => {
    if (hi <= lo) return 1;
    const t = (value - lo) / (hi - lo);
    // Full marks across the middle, tailing off toward either end of the band.
    return clamp01(1 - Math.abs(t - 0.5) * 1.4);
  };
  const palette = (inBand(phenotype.colour.s, saturation) + inBand(phenotype.colour.l, lightness)) / 2;
  const layers = phenotype.marks.length;
  const tidiness = layers <= 2 ? 1 : clamp01(1 - (layers - 2) * 0.35);
  // A closed gate is not a coat: an animal whose colour work is switched off
  // has nothing for this category to be coherent about.
  const masked = phenotype.epistasisActive.length > 0 ? 0.55 : 1;
  const score = (palette * 0.6 + tidiness * 0.4) * masked;
  return {
    id: "coherence",
    name: "Coherence",
    score,
    weight: 0,
    note:
      layers > 2
        ? "Busy. Too many layers arguing."
        : masked < 1
          ? "The colour work is switched off; there is nothing to judge."
          : "",
  };
}

/** Husbandry: how close raising got this animal to its own ceiling. */
function conditionScore(creature: Creature, phenotype: Phenotype, map: GeneMap): CategoryScore {
  const reached = achievement(creature, phenotype, map);
  const stats: StatId[] = map.polygenicTraits.map((trait) => trait.id);
  const mean = stats.length === 0 ? 0 : stats.reduce((sum, id) => sum + (reached[id] ?? 0), 0) / stats.length;
  return {
    id: "condition",
    name: "Condition",
    score: clamp01(mean),
    weight: 0,
    note: mean < 0.4 ? "Under-conditioned. This animal has not been worked." : "",
  };
}

function noteFor(id: CategoryScore["id"], score: number): string {
  const band = score >= 0.8 ? "excellent" : score >= 0.6 ? "good" : score >= 0.4 ? "fair" : "poor";
  return `${id[0]?.toUpperCase()}${id.slice(1)}: ${band}.`;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

export interface ShowTier {
  readonly tier: number;
  readonly name: string;
  readonly field: number;
  /** How good the rivals are: the fraction of their own ceilings they reach. */
  readonly condition: number;
  /** How hard the rivals were bred toward this standard, 0-1. */
  readonly effort: number;
  readonly purse: number;
  readonly entryFee: number;
}

export const SHOW_TIERS: readonly ShowTier[] = [
  { tier: 0, name: "Parish show", field: 5, condition: 0.45, effort: 0.15, purse: 220, entryFee: 20 },
  { tier: 1, name: "County show", field: 7, condition: 0.62, effort: 0.35, purse: 620, entryFee: 60 },
  { tier: 2, name: "Regional championship", field: 9, condition: 0.76, effort: 0.55, purse: 1500, entryFee: 160 },
  { tier: 3, name: "The National", field: 11, condition: 0.88, effort: 0.75, purse: 3600, entryFee: 400 },
];

export function showTier(tier: number): ShowTier {
  return SHOW_TIERS[Math.max(0, Math.min(SHOW_TIERS.length - 1, Math.floor(tier)))] as ShowTier;
}

export interface ShowEntrant {
  readonly id: string;
  readonly name: string;
  readonly scorecard: Scorecard;
  readonly mine: boolean;
}

export interface ShowResult {
  readonly standard: ShowStandard;
  readonly tier: ShowTier;
  readonly entrants: readonly ShowEntrant[];
  readonly placement: number;
  readonly purse: number;
}

/**
 * A rival, built rather than remembered.
 *
 * Rivals are drawn from the same wild pool the player draws from, then given
 * the tier's condition and — this is the part that makes a show a contest —
 * `effort` many re-draws keeping whichever came closest to the standard. A
 * high-tier field is not a field of better *genes*, it is a field of animals
 * somebody bred for this season on purpose, which is what the player is being
 * asked to beat.
 */
export function buildField(
  map: GeneMap,
  standard: ShowStandard,
  tier: ShowTier,
  rng: Rng,
): { phenotype: Phenotype; condition: number; name: string }[] {
  const rivals: { phenotype: Phenotype; condition: number; name: string }[] = [];
  const tries = 1 + Math.round(tier.effort * 8);
  for (let i = 0; i < tier.field; i++) {
    let best: Phenotype | undefined;
    let bestScore = -1;
    for (let attempt = 0; attempt < tries; attempt++) {
      const phenotype = expressPhenotype(randomWildGenome(map, rng), map);
      const score = standardScore(phenotype, map, standard).score;
      if (score > bestScore) {
        bestScore = score;
        best = phenotype;
      }
    }
    if (!best) continue;
    rivals.push({
      phenotype: best,
      // Condition varies around the tier's level: a field where every rival is
      // conditioned identically is a field the player can solve once.
      condition: clamp01(tier.condition + (rng.next() - 0.5) * 0.22),
      name: `${RIVAL_STABLES[i % RIVAL_STABLES.length]} entry`,
    });
  }
  return rivals;
}

const RIVAL_STABLES = [
  "Hallow Reach",
  "Ninefold",
  "Blackwater",
  "Tussock Hall",
  "Sedgeline",
  "Chalkbourne",
  "Under-Fen",
  "Ashmoor",
  "Coldstream",
  "Wrackpool",
  "Longhithe",
] as const;

/**
 * Judges a rival from its phenotype and a condition number.
 *
 * Rivals have no `Creature` record — they never existed on anyone's ranch — so
 * the three genetics-and-appearance categories are scored exactly as they are
 * for the player and condition is simply the number the tier handed out.
 */
export function judgeRival(
  phenotype: Phenotype,
  map: GeneMap,
  standard: ShowStandard,
  condition: number,
): Scorecard {
  const raw: CategoryScore[] = [
    standardScore(phenotype, map, standard),
    { id: "rarity", name: "Rarity", score: rarityOf(phenotype, map), weight: 0, note: "" },
    coherenceScore(phenotype, map),
    { id: "condition", name: "Condition", score: clamp01(condition), weight: 0, note: "" },
  ];
  const categories = raw.map((category) => ({
    ...category,
    weight: standard.weights[category.id],
    note: category.note === "" ? noteFor(category.id, category.score) : category.note,
  }));
  return { total: categories.reduce((sum, c) => sum + c.score * c.weight, 0), categories };
}

/**
 * Places a field.
 *
 * Ties break toward the rival, deliberately: a dead heat in a show ring goes to
 * the animal that was already there, and a player who wants the ribbon has to
 * actually be better.
 */
export function placeField(entrants: readonly ShowEntrant[]): ShowEntrant[] {
  return [...entrants].sort((a, b) => {
    const difference = b.scorecard.total - a.scorecard.total;
    if (Math.abs(difference) > 1e-9) return difference;
    return a.mine === b.mine ? 0 : a.mine ? 1 : -1;
  });
}

/** The purse, by placing. Fourth and below pays the entry fee back and no more. */
export function purseFor(tier: ShowTier, placement: number): number {
  const share = placement === 1 ? 1 : placement === 2 ? 0.45 : placement === 3 ? 0.22 : 0;
  return Math.round(tier.purse * share) + (share > 0 ? 0 : tier.entryFee);
}
