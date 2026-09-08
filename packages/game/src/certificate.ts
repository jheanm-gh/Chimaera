/**
 * The data a lineage certificate needs (§8.4).
 *
 * The picture is drawn by `@chimaera/rendering`; this assembles what goes on
 * it. Kept on this side of the line because it reads a ranch — the pedigree,
 * the achieved stats, which loci the owner has actually established — and the
 * renderer is not allowed to know a ranch exists.
 *
 * What it must not do is print anything the owner has not established. The
 * certificate carries observations plus the loci they paid to read, and the
 * genome travels only inside the QR: a recipient gets the animal, not the
 * answers, and still has to spend their own lenses.
 */

import type { GeneMap, Phenotype } from "@chimaera/genetics";
import { genotypeAt } from "@chimaera/genetics";
import { mapOf } from "./bestiary.js";
import { encodeGenome } from "./codes.js";
import { alleleName } from "./compendium.js";
import { currentStats } from "./lifecycle.js";
import type { Creature, CreatureId, RanchState } from "./types.js";

export interface CertificateAncestor {
  readonly id: string;
  readonly name: string;
  /** "" is the subject; "s" the sire, "d" the dam, "sd" the sire's dam. */
  readonly path: string;
}

export interface LineageData {
  readonly name: string;
  readonly species: string;
  readonly sex: "female" | "male";
  readonly station: string;
  readonly day: number;
  readonly generation: number;
  readonly inbreeding: number;
  readonly branch?: string | undefined;
  readonly stats: readonly { readonly name: string; readonly value: number; readonly ceiling: number }[];
  readonly readLoci: readonly { readonly locus: string; readonly genotype: string }[];
  readonly ancestors: readonly CertificateAncestor[];
  readonly code: string;
}

const GENERATIONS = 4;

export function lineageData(
  state: RanchState,
  id: CreatureId,
  phenotypeOf: (creature: Creature) => Phenotype,
): LineageData | undefined {
  const everyone = [...state.creatures, ...state.archive];
  const creature = everyone.find((c) => c.id === id);
  if (!creature) return undefined;

  const map = mapOf(creature);
  const phenotype = phenotypeOf(creature);
  const stats = currentStats(creature, phenotype, map);

  return {
    name: creature.name,
    species: map.species.name,
    sex: creature.sex === "male" ? "male" : "female",
    station: `${map.species.biome} Station`,
    day: state.day,
    generation: creature.generation,
    inbreeding: creature.inbreeding,
    branch: creature.branch,
    stats: map.polygenicTraits.map((trait) => ({
      name: trait.name,
      value: stats[trait.id] ?? trait.min,
      ceiling: phenotype.stats[trait.id] ?? trait.max,
    })),
    readLoci: establishedLoci(creature, map, state),
    ancestors: ancestryOf(state, creature),
    code: encodeGenome(creature.genome),
  };
}

/**
 * The loci this owner has read, with any novel allele under the name its
 * discoverer gave it (§8.2). A certificate is where a named allele is most
 * likely to be seen by someone who did not find it.
 */
function establishedLoci(
  creature: Creature,
  map: GeneMap,
  state: RanchState,
): { locus: string; genotype: string }[] {
  return [...creature.revealed]
    .filter((locusId) => map.hasLocus(locusId))
    .sort()
    .map((locusId) => {
      const locus = map.locus(locusId);
      const genotype = genotypeAt(creature.genome, locus)
        .map((alleleId) => alleleName(state.compendium, map.species.id, alleleId, map.allele(locusId, alleleId).name))
        .join(" / ");
      return { locus: locus.name, genotype };
    });
}

/**
 * Four generations, walked breadth-first from the pedigree records.
 *
 * The pedigree is the one thing that survives a creature's death, which is why
 * it can reach back past animals that are long gone — and why the certificate
 * prints names rather than drawings for the ancestors.
 */
function ancestryOf(state: RanchState, creature: Creature): CertificateAncestor[] {
  const records = new Map(state.pedigree.map((record) => [record.id, record]));
  const out: CertificateAncestor[] = [];
  const walk = (id: string | undefined, path: string): void => {
    if (id === undefined || path.length > GENERATIONS) return;
    const record = records.get(id);
    if (!record) return;
    if (path.length > 0) out.push({ id, name: record.name, path });
    walk(record.sire, `${path}s`);
    walk(record.dam, `${path}d`);
  };
  walk(creature.id, "");
  return out;
}

/** A filename someone will recognise on their desktop a year from now. */
export function certificateFilename(data: LineageData): string {
  const safe = data.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "creature";
  return `verdance-${safe.toLowerCase()}-day${data.day}.svg`;
}
