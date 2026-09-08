/**
 * Seasonal migrations (§8.5): "rotating limited-time wild gene pools
 * introducing alleles available only that season. The live-ops spine."
 *
 * A season does one thing: for its duration, a particular novel allele turns up
 * in wild stock. Outside it, that allele is reachable only through a mutagen and
 * a great deal of luck. That is the whole mechanic, and it is enough — a player
 * who misses the Aurora season has to either wait a year or earn it the hard
 * way, and both of those are stories.
 *
 * Two decisions worth stating.
 *
 * **Seasons run on the ranch's calendar, not the wall clock.** The simulation
 * has never been allowed to see a `Date` (§2.1: no real-world timers, ever), and
 * a season keyed to the player's own days means someone who plays in bursts is
 * not punished for it. The Daily Genome is the one thing keyed to a real date,
 * and it is keyed to it explicitly.
 *
 * **A season boosts, it does not guarantee.** The featured allele appears at a
 * few percent, which is roughly a wild lethal's frequency — often enough that a
 * season of catching turns one up, rare enough that finding one is still worth
 * telling someone about.
 */

import { randomWildGenome } from "@chimaera/genetics";
import type { AlleleId, GeneMap, Genome, LocusId, Rng, Sex, SpeciesId } from "@chimaera/genetics";

export interface Season {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** Which species the migration touches. The others are unaffected. */
  readonly species: SpeciesId;
  readonly locus: LocusId;
  readonly allele: AlleleId;
  /** Chance per wild animal of carrying one copy. */
  readonly frequency: number;
}

/** A migration runs a quarter of a ranch-year. Named for the mechanic rather
 * than the calendar, because the Exhibition's show seasons rotate on their own
 * shorter clock and two things called `SEASON_DAYS` is one thing too many. */
export const MIGRATION_DAYS = 90;

/**
 * The rotation.
 *
 * One per species, so every species gets a turn and no season is ever "the one
 * for the species nobody plays". Each features that species' most interesting
 * novel allele — the one the Compendium has a hole for.
 */
export const SEASONS: readonly Season[] = [
  {
    id: "crown-run",
    name: "The Crown Run",
    blurb:
      "Something is moving through the deep channels, and a few of the animals coming out of them carry a ridge nobody has recorded.",
    species: "quillfen",
    locus: "DORSAL",
    allele: "D_crown",
    frequency: 0.05,
  },
  {
    id: "ember-tips",
    name: "Ember Tips",
    blurb:
      "The Reedwold burned three years ago and the birds that came back are marked for it. Nobody agrees whether the two facts are related.",
    species: "sallowfinch",
    locus: "MARK",
    allele: "M_ember",
    frequency: 0.05,
  },
  {
    id: "the-thicket",
    name: "The Thicket",
    blurb:
      "A bramble year. The hogs coming down off the chalk are carrying spine densities the survey has no column for.",
    species: "bramblehog",
    locus: "SPINE",
    allele: "Sd_thicket",
    frequency: 0.045,
  },
  {
    id: "stormspan",
    name: "Stormspan",
    blurb:
      "The gales have not stopped for a month, and something out over the water has grown a wing to match them.",
    species: "kiteossel",
    locus: "SPAN",
    allele: "Sp_storm",
    frequency: 0.04,
  },
  {
    id: "threadwater",
    name: "Threadwater",
    blurb:
      "The deep fen has gone very clear. The adders in it have gone very strange, and the pattern runs like thread.",
    species: "siltadder",
    locus: "MARK",
    allele: "M_thread",
    frequency: 0.045,
  },
  {
    id: "the-long-heat",
    name: "The Long Heat",
    blurb:
      "The Ashlands have not cooled since spring. What is coming down off the rock has hands like barbed wire.",
    species: "ashenlorric",
    locus: "GRIP",
    allele: "Gp_barbed",
    frequency: 0.04,
  },
];

/** Which migration is running on this ranch day. */
export function seasonForDay(day: number): Season {
  const index = Math.floor(Math.max(0, day) / MIGRATION_DAYS) % SEASONS.length;
  return SEASONS[index] as Season;
}

export function daysLeftInMigration(day: number): number {
  return MIGRATION_DAYS - (Math.max(0, day) % MIGRATION_DAYS);
}

/**
 * Wild stock, with the season's thumb on the scale.
 *
 * Draws an ordinary wild animal and then, at the season's frequency, writes the
 * featured allele onto one haplotype. Substituting rather than re-rolling keeps
 * the rest of the animal exactly as wild as it would otherwise have been — the
 * season adds one allele to the pool, it does not replace the pool.
 */
export function seasonalWildGenome(
  map: GeneMap,
  rng: Rng,
  day: number,
  options: { readonly sex?: Sex } = {},
): Genome {
  const genome = randomWildGenome(map, rng, options.sex ? { sex: options.sex } : {});
  const season = seasonForDay(day);
  if (season.species !== map.species.id) return genome;
  if (!map.hasLocus(season.locus) || !map.hasAllele(season.locus, season.allele)) return genome;
  if (!rng.bool(season.frequency)) return genome;

  const locus = map.locus(season.locus);
  const pair = genome.chromosomes[locus.chromosome];
  if (!pair) return genome;
  // One copy, on one haplotype. A wild animal carrying two of a novel allele
  // would make the season a giveaway rather than a lead.
  const onMaternal = rng.bool(0.5);
  const side = onMaternal ? pair.maternal : pair.paternal;
  if (side.genes[locus.id] === undefined) return genome;

  const replaced = { ...side, genes: { ...side.genes, [locus.id]: [season.allele] } };
  return {
    ...genome,
    chromosomes: {
      ...genome.chromosomes,
      [locus.chromosome]: onMaternal ? { ...pair, maternal: replaced } : { ...pair, paternal: replaced },
    },
  };
}
