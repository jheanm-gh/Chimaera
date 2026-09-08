/**
 * Which gene map applies to which animal.
 *
 * A ranch holds mixed stock. Every creature carries its own `species`, and its
 * genome only means anything read through that species' map — so resolving the
 * map from the creature, at the point of use, is the only arrangement that
 * cannot silently express a Silt-Adder through a Quillfen's loci.
 *
 * The earlier design threaded one `GeneMap` through the whole reducer. That was
 * fine while one species shipped and became a correctness hazard the moment six
 * did: every call site had to be handed the right map, and nothing checked that
 * it was.
 *
 * Maps are compiled once per species and cached by the genetics package, so
 * calling this in a loop is a lookup, not a validation pass.
 */

import { geneMapById, SPECIES } from "@chimaera/genetics";
import type { GeneMap, SpeciesId } from "@chimaera/genetics";
import type { RanchState } from "./types.js";

export function mapOf(subject: { readonly species: SpeciesId }): GeneMap {
  return geneMapById(subject.species);
}

/**
 * The ranch's own species: what wild stock it catches, and which species the
 * campaign's commissions are written for.
 *
 * A station is a posting. You can keep whatever you bring home, but the fen
 * outside the door is one fen.
 */
export function homeMap(state: RanchState): GeneMap {
  return geneMapById(state.homeSpecies);
}

/**
 * Which species a biome belongs to.
 *
 * One species per biome across the roster, which is what lets an expedition
 * name a place and mean an animal: going to the Galeshore is how you come home
 * with a Kite-Ossel. It is also the whole reason expeditions matter to a closed
 * herd — the only stock the fen outside the station produces is more of what
 * you already have.
 */
const BY_BIOME = new Map(SPECIES.map((species) => [species.biome, species.id]));

export function speciesForBiome(biome: string): SpeciesId | undefined {
  return BY_BIOME.get(biome);
}

export interface Posting {
  readonly biome: string;
  readonly species: SpeciesId;
  readonly name: string;
}

/** Every place there is to go, and what lives there. */
export const POSTINGS: readonly Posting[] = SPECIES.map((species) => ({
  biome: species.biome,
  species: species.id,
  name: species.name,
}));
