/**
 * The Compendium (§8.3): an encyclopaedia that fills in as you discover things.
 *
 * Two rules, and the second is the interesting one.
 *
 * **It records what you have *seen*, never what exists.** A locus you have
 * never had a lens on is not in here, and neither is an allele nobody has
 * turned up. That is the same discipline the renderer works under (§1.3): the
 * game does not tell you what you have not earned, and an encyclopaedia that
 * listed every allele in the gene map on day one would hand a player the answer
 * to every puzzle in it.
 *
 * **Completion is computed against the whole roster, not against what you have
 * unlocked.** A percentage that only counts the species you have met would sit
 * near 100% forever and mean nothing. This one starts near zero and is honest
 * about how much fen there is.
 */

import { geneMapById, SPECIES } from "@chimaera/genetics";
import type { AlleleDef, GeneMap, LocusDef, SpeciesId } from "@chimaera/genetics";
import { branchesForSpecies } from "./evolution.js";
import type { Compendium, RanchState } from "./types.js";

/**
 * How a discovered allele is recorded.
 *
 * Qualified by species, because allele ids are only unique *within* a species —
 * `A_umbral` is the novel affinity allele on all six. Recording bare ids meant
 * finding the Quillfen's umbral affinity silently credited the Silt-Adder's
 * too, and the Compendium topped out at 90% with everything found.
 */
export function alleleKey(species: SpeciesId, allele: string): string {
  return `${species}:${allele}`;
}

/** Splits a recorded key. Tolerates a bare id from a save written before v5. */
export function splitAlleleKey(key: string): { species?: SpeciesId; allele: string } {
  const at = key.indexOf(":");
  if (at < 0) return { allele: key };
  return { species: key.slice(0, at) as SpeciesId, allele: key.slice(at + 1) };
}

/**
 * How a discovered epistatic gate is recorded.
 *
 * Qualified for the same reason alleles are: two species both call their
 * pigment gate "albinism", and a bare id credited one discovery to both.
 */
export function gateKey(species: SpeciesId, rule: string): string {
  return `${species}:${rule}`;
}

export interface EntryCount {
  readonly seen: number;
  readonly total: number;
}

export interface CompendiumSummary {
  readonly species: EntryCount;
  readonly alleles: EntryCount;
  readonly branches: EntryCount;
  readonly epistasis: EntryCount;
  /** 0-1 over everything there is to find. */
  readonly completion: number;
}

/** Every allele that can be discovered: the novel ones. Wild stock is not a find. */
export function discoverableAlleles(map: GeneMap): { locus: LocusDef; allele: AlleleDef }[] {
  const out: { locus: LocusDef; allele: AlleleDef }[] = [];
  for (const locus of map.loci) {
    for (const allele of locus.alleles) {
      if (allele.novel) out.push({ locus, allele });
    }
  }
  return out;
}

export function summarise(compendium: Compendium): CompendiumSummary {
  let alleles = 0;
  let branches = 0;
  let epistasis = 0;
  let alleleSeen = 0;
  let gateSeen = 0;
  const seenAlleles = new Set(compendium.seenAlleles);
  const seenGates = new Set(compendium.seenEpistasis);
  for (const species of SPECIES) {
    const map = geneMapById(species.id);
    const discoverable = discoverableAlleles(map);
    alleles += discoverable.length;
    alleleSeen += discoverable.filter(({ allele }) => seenAlleles.has(alleleKey(species.id, allele.id))).length;
    branches += branchesForSpecies(species.id).length;
    epistasis += species.epistasis.length;
    gateSeen += species.epistasis.filter((rule) => seenGates.has(gateKey(species.id, rule.id))).length;
  }

  const counts = {
    species: { seen: new Set(compendium.seenSpecies).size, total: SPECIES.length },
    alleles: { seen: alleleSeen, total: alleles },
    branches: { seen: new Set(compendium.seenBranches).size, total: branches },
    epistasis: { seen: gateSeen, total: epistasis },
  };
  const seen = Object.values(counts).reduce((sum, entry) => sum + Math.min(entry.seen, entry.total), 0);
  const total = Object.values(counts).reduce((sum, entry) => sum + entry.total, 0);
  return { ...counts, completion: total === 0 ? 0 : seen / total };
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface SpeciesEntry {
  readonly id: SpeciesId;
  readonly name: string;
  readonly seen: boolean;
  readonly biome: string;
  readonly hook: string;
  readonly inspiration: string;
  readonly alleles: readonly AlleleEntry[];
  readonly branches: readonly BranchEntry[];
  readonly gates: readonly GateEntry[];
}

export interface AlleleEntry {
  readonly id: string;
  /** The species-qualified key, which is what naming and recording use. */
  readonly key: string;
  readonly locus: string;
  readonly locusName: string;
  readonly seen: boolean;
  /** The authored name, or the one its discoverer gave it. */
  readonly name: string;
  readonly namedBy: boolean;
  readonly discoveredOnDay?: number;
  readonly note?: string;
}

export interface BranchEntry {
  readonly id: string;
  readonly name: string;
  readonly seen: boolean;
  readonly blurb: string;
  readonly secret: boolean;
}

export interface GateEntry {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly seen: boolean;
  readonly masks: readonly string[];
}

/**
 * The book, as the player can currently read it.
 *
 * An unseen entry keeps its slot and loses its content: you can see that there
 * is a fourth allele at this locus, and nothing else. That is the shape that
 * makes a collection feel like a collection rather than a checklist — the gap
 * is the thing you are chasing.
 */
export function speciesEntries(compendium: Compendium): SpeciesEntry[] {
  const seenSpecies = new Set(compendium.seenSpecies);
  const seenAlleles = new Set(compendium.seenAlleles);
  const seenBranches = new Set(compendium.seenBranches);
  const seenGates = new Set(compendium.seenEpistasis);

  return SPECIES.map((species) => {
    const map = geneMapById(species.id);
    const seen = seenSpecies.has(species.id);
    return {
      id: species.id,
      name: seen ? species.name : "—",
      seen,
      biome: seen ? species.biome : "—",
      hook: seen ? species.hook : "Not yet surveyed.",
      inspiration: seen ? species.inspiration : "",
      alleles: discoverableAlleles(map).map(({ locus, allele }): AlleleEntry => {
        const key = alleleKey(species.id, allele.id);
        const named = compendium.namedAlleles[key];
        const found = seenAlleles.has(key);
        return {
          id: allele.id,
          key,
          locus: locus.id,
          locusName: locus.name,
          seen: found,
          name: found ? (named?.name ?? allele.name) : "—",
          namedBy: named !== undefined,
          ...(named?.discoveredOnDay !== undefined ? { discoveredOnDay: named.discoveredOnDay } : {}),
          ...(found && allele.note ? { note: allele.note } : {}),
        };
      }),
      branches: branchesForSpecies(species.id).map((branch): BranchEntry => ({
        id: branch.id,
        name: seenBranches.has(branch.id) ? branch.name : "—",
        seen: seenBranches.has(branch.id),
        blurb: seenBranches.has(branch.id) ? branch.blurb : "Never observed.",
        secret: branch.secret ?? false,
      })),
      gates: species.epistasis.map((rule): GateEntry => {
        const found = seenGates.has(gateKey(species.id, rule.id));
        return {
          id: rule.id,
          key: gateKey(species.id, rule.id),
          name: found ? rule.name : "—",
          seen: found,
          masks: found ? rule.masksTags : [],
        };
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Naming a novel allele (§8.2)
// ---------------------------------------------------------------------------

export const NAME_MAX = 24;

/**
 * Whether this allele is yours to name.
 *
 * The brief's rule is "the first player to discover a novel allele names it".
 * Offline, "first" can only mean "first here" — but the naming is recorded with
 * the day it happened, so a server that later arbitrates between two stations
 * has the evidence it needs and does not have to guess.
 */
export function canName(state: RanchState, key: string): boolean {
  if (!state.compendium.seenAlleles.includes(key)) return false;
  if (state.compendium.namedAlleles[key]) return false;
  const { species, allele: alleleId } = splitAlleleKey(key);
  const candidates = species ? SPECIES.filter((entry) => entry.id === species) : SPECIES;
  return candidates.some((entry) =>
    geneMapById(entry.id).loci.some((locus) =>
      locus.alleles.some((allele) => allele.id === alleleId && allele.novel),
    ),
  );
}

/**
 * Moderation, such as it can be offline.
 *
 * A shipped word list is a losing game and everyone knows it. What this can
 * honestly do is refuse the mechanical abuses — impersonating the game's own
 * voice, unreadable scripts, zero-width characters, shouting, padding — and
 * leave the judgement calls to the server that will eventually exist. Refusals
 * say what is wrong, because a name box that says "invalid" teaches nothing.
 */
export function checkName(name: string): { ok: true; name: string } | { ok: false; reason: string } {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return { ok: false, reason: "A name needs at least one letter." };
  if (trimmed.length > NAME_MAX) return { ok: false, reason: `Names run to ${NAME_MAX} characters.` };
  // Letters, marks and combining characters from any script, plus spaces,
  // hyphens and apostrophes. Not punctuation soup, not emoji, not zero-width.
  if (!/^[\p{L}\p{M}][\p{L}\p{M} '-]*$/u.test(trimmed)) {
    return { ok: false, reason: "Letters, spaces, hyphens and apostrophes only." };
  }
  if (/(.)\1{3,}/u.test(trimmed)) return { ok: false, reason: "That is mostly one letter." };
  if (trimmed === trimmed.toUpperCase() && /\p{Lu}/u.test(trimmed) && trimmed.length > 4) {
    return { ok: false, reason: "Not in capitals." };
  }
  if (/\b(admin|system|official|verdance)\b/i.test(trimmed)) {
    return { ok: false, reason: "That reads as if the station said it." };
  }
  return { ok: true, name: trimmed };
}

export function nameAllele(
  state: RanchState,
  key: string,
  name: string,
): { state: RanchState; error?: string } {
  if (!canName(state, key)) {
    return { state, error: "That is not yours to name." };
  }
  const checked = checkName(name);
  if (!checked.ok) return { state, error: checked.reason };
  return {
    state: {
      ...state,
      compendium: {
        ...state.compendium,
        namedAlleles: {
          ...state.compendium.namedAlleles,
          [key]: { name: checked.name, discoveredOnDay: state.day },
        },
      },
    },
  };
}

/** The display name for an allele, honouring whoever named it. */
export function alleleName(
  compendium: Compendium,
  species: SpeciesId,
  alleleId: string,
  fallback: string,
): string {
  return compendium.namedAlleles[alleleKey(species, alleleId)]?.name ?? fallback;
}
