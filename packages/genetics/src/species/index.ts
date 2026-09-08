import { GeneMap } from "../genemap.js";
import type { SpeciesDef, SpeciesId } from "../types.js";
import { ASHEN_LORRIC } from "./ashenlorric.js";
import { BRAMBLEHOG } from "./bramblehog.js";
import { KITE_OSSEL } from "./kiteossel.js";
import { QUILLFEN } from "./quillfen.js";
import { SALLOWFINCH } from "./sallowfinch.js";
import { SILT_ADDER } from "./siltadder.js";

export { ASHEN_LORRIC, BRAMBLEHOG, KITE_OSSEL, QUILLFEN, SALLOWFINCH, SILT_ADDER };
export * from "./kit.js";

/**
 * The six species v1 ships with (§6.5).
 *
 * Quillfen, Sallowfinch and Bramblehog are the starter trio: a swimmer, a
 * singer and a survivor, with three visibly different silhouettes and three
 * different reasons to breed. The other three are the depth — the Kite-Ossel's
 * flightless morph, the Silt-Adder's paired lethals in repulsion, and the Ashen
 * Lorric's two-stage cascade are each a genetics lesson the starters do not
 * teach.
 */
export const SPECIES: readonly SpeciesDef[] = [
  QUILLFEN,
  SALLOWFINCH,
  BRAMBLEHOG,
  KITE_OSSEL,
  SILT_ADDER,
  ASHEN_LORRIC,
];

/** The three the marketing leads with, and the three a new player picks from. */
export const STARTER_TRIO: readonly SpeciesId[] = ["quillfen", "sallowfinch", "bramblehog"];

const maps = new Map<SpeciesId, GeneMap>();

/** Compiled gene maps are cached: validation and indexing run once per species. */
export function geneMapFor(species: SpeciesDef): GeneMap {
  const cached = maps.get(species.id);
  if (cached) return cached;
  const map = new GeneMap(species);
  maps.set(species.id, map);
  return map;
}

export function geneMapById(id: SpeciesId): GeneMap {
  const species = SPECIES.find((s) => s.id === id);
  if (!species) throw new Error(`unknown species "${id}"`);
  return geneMapFor(species);
}

export function speciesById(id: SpeciesId): SpeciesDef {
  const found = SPECIES.find((s) => s.id === id);
  if (!found) throw new Error(`unknown species "${id}"`);
  return found;
}
