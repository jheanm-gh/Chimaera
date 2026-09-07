import { GeneMap } from "../genemap.js";
import type { SpeciesDef, SpeciesId } from "../types.js";
import { QUILLFEN } from "./quillfen.js";

export { QUILLFEN };

/**
 * v1 ships six species (§6.5). Five are authored in Phase 5; Quillfen leads
 * because Phases 1-3 need exactly one fully wired gene map to be honest about.
 */
export const SPECIES: readonly SpeciesDef[] = [QUILLFEN];

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
