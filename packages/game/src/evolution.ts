/**
 * Branching evolution (§2.3).
 *
 * The branch a creature takes is a function of
 *
 *     genotype + dominant raising axis + bond level + item held + habitat
 *
 * evaluated at a stage transition. The same genome raised differently produces
 * a visibly different adult, which is the whole point: it makes raising a real
 * decision without letting it outrank breeding, because the *rare* branches all
 * gate on genotype as well.
 *
 * Preview is deliberately partial. §2.3 asks for "previewable but not
 * guaranteed": the player is told which branches are in reach and how many
 * conditions remain, but never which conditions. That is the difference between
 * a discovery worth a wiki page and a checklist.
 */

import type { GeneMap, Phenotype } from "@chimaera/genetics";
import { genotypeAt } from "@chimaera/genetics";
import { QUILLFEN_BRANCHES } from "./content.js";
import type { EvolutionBranch, EvolutionContext } from "./content.js";
import { achievement } from "./lifecycle.js";
import type { Creature } from "./types.js";

export function branchesForSpecies(speciesId: string): readonly EvolutionBranch[] {
  // Phase 5 adds the other five species. One lookup point, so adding them is
  // a data change rather than a code change.
  if (speciesId === "quillfen") return QUILLFEN_BRANCHES;
  return QUILLFEN_BRANCHES;
}

export function evolutionContext(
  creature: Creature,
  phenotype: Phenotype,
  map: GeneMap,
): EvolutionContext {
  return {
    build: phenotype.values.build ?? 0.5,
    affinities: (phenotype.traits.affinity ?? "").split("+").filter(Boolean),
    bond: creature.bond,
    diet: creature.diet,
    habitat: creature.habitat,
    training: creature.training,
    heldItem: creature.heldItem,
    achievement: achievement(creature, phenotype, map),
    // Reads the genome directly: evolution is biology, not player knowledge.
    // The *preview* is what respects what the player knows.
    carries: (allele) => map.loci.some((locus) => genotypeAt(creature.genome, locus).includes(allele)),
    traits: phenotype.traits,
  };
}

/** The branch this creature takes now. The first fully satisfied branch wins. */
export function resolveBranch(context: EvolutionContext, speciesId: string): EvolutionBranch {
  const branches = branchesForSpecies(speciesId);
  for (const branch of branches) {
    if (branch.conditions.every((condition) => condition.test(context))) return branch;
  }
  // The last branch is authored as the unconditional floor; if a species ever
  // ships without one, that is a data bug worth failing loudly on.
  const fallback = branches[branches.length - 1];
  if (!fallback) throw new Error(`species "${speciesId}" has no evolution branches`);
  return fallback;
}

export interface BranchPreview {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  /** Conditions currently satisfied, out of the total. Never *which* ones. */
  readonly met: number;
  readonly total: number;
  readonly reachable: boolean;
  readonly secret: boolean;
}

/**
 * Which branches are in reach, and roughly how close.
 *
 * A secret branch stays out of the list until the player is genuinely close to
 * it — otherwise "there is a hidden fifth form" becomes a checklist item on
 * every creature screen and stops being a secret.
 */
export function previewBranches(
  context: EvolutionContext,
  speciesId: string,
  options: { readonly revealSecrets?: boolean } = {},
): BranchPreview[] {
  const previews: BranchPreview[] = [];
  for (const branch of branchesForSpecies(speciesId)) {
    const total = branch.conditions.length;
    const met = branch.conditions.filter((condition) => condition.test(context)).length;
    const nearlyThere = total > 0 && met >= total - 1;
    if (branch.secret && !options.revealSecrets && !nearlyThere) continue;
    previews.push({
      id: branch.id,
      name: branch.name,
      hint: branch.hint,
      met,
      total,
      reachable: total === 0 || met === total,
      secret: branch.secret ?? false,
    });
  }
  return previews;
}

/** Evolution triggers at the juvenile-to-adult transition and only once. */
export function shouldEvolve(creature: Creature): boolean {
  return creature.stage === "adult" && creature.branch === undefined;
}
