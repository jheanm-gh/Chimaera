/**
 * Legacy / NG+ (§4): "restart the campaign carrying forward one archived
 * ancestor's genome. New wild gene pool, harder trials, new evolution branches
 * unlocked."
 *
 * The carry-forward is the easy half and the interesting half is what "harder"
 * should mean in a breeding game. Multiplying the opposition's numbers would be
 * the wrong answer twice over: it makes combat the difficulty, and combat is
 * the fitness function rather than the game.
 *
 * So a Legacy run is harder in the terms this game is actually about. Each
 * depth starts from **fewer founders and a smaller ranch**, which means the
 * closed-herd problem — the thing the whole inbreeding model exists to create —
 * arrives sooner and bites harder. At depth 3 you begin with a pair and eight
 * berths, and every generation is a decision about what you can afford to keep.
 *
 * The ancestor comes across as a founder with an empty pedigree. That is
 * correct rather than convenient: it is a new population, and the animal you
 * carried in is unrelated to everything in it. It is also the one piece of the
 * previous run that survives, which is the whole point of the mode.
 */

import { geneMapById } from "@chimaera/genetics";
import type { SpeciesId } from "@chimaera/genetics";
import { NEW_CAMPAIGN } from "./campaign.js";
import type { Creature, RanchState } from "./types.js";

export const MAX_LEGACY_DEPTH = 5;

export interface LegacyTerms {
  readonly depth: number;
  readonly founders: number;
  readonly capacity: number;
  readonly motes: number;
  readonly note: string;
}

/**
 * What a run at this depth begins with.
 *
 * Founders fall to two and stop there — a single animal cannot breed and a run
 * that cannot start is not difficulty. Capacity falls with it, so the pressure
 * is on *keeping* as much as on acquiring.
 */
export function legacyTerms(depth: number): LegacyTerms {
  const clamped = Math.max(0, Math.min(MAX_LEGACY_DEPTH, Math.floor(depth)));
  const founders = Math.max(2, 4 - Math.floor(clamped / 2));
  const capacity = Math.max(8, 24 - clamped * 3);
  const motes = Math.max(120, 400 - clamped * 60);
  return {
    depth: clamped,
    founders,
    capacity,
    motes,
    note:
      clamped === 0
        ? "A first posting: four founders and room for twenty-four."
        : `Legacy ${clamped}: ${founders} founders and ${capacity} berths. The bottleneck starts closer.`,
  };
}

export interface LegacyOptions {
  readonly seed: string;
  readonly species: SpeciesId;
  /** The archived animal being carried forward. Its genome, and nothing else. */
  readonly ancestor: Creature;
}

/**
 * Begins a new run carrying one ancestor.
 *
 * The ancestor arrives young and unraised. Carrying its *achieved* stats across
 * would hand the new run a finished animal and quietly delete the raising game
 * for a generation; carrying its genome is the promise the mode makes, and the
 * genome is the part that was earned.
 */
export function startLegacy(
  previous: RanchState,
  options: LegacyOptions,
  createRanch: (input: {
    seed: string;
    species: SpeciesId;
    founders: number;
    capacity: number;
    motes: number;
  }) => RanchState,
): RanchState {
  const depth = previous.records.legacyDepth + 1;
  const terms = legacyTerms(depth);
  const map = geneMapById(options.ancestor.species);

  const base = createRanch({
    seed: options.seed,
    species: options.species,
    founders: terms.founders,
    capacity: terms.capacity,
    motes: terms.motes,
  });

  const carried: Creature = {
    ...options.ancestor,
    id: `c${base.nextId}`,
    status: "active",
    stage: "adult",
    ageDays: 58,
    generation: 0,
    inbreeding: 0,
    sireId: undefined,
    damId: undefined,
    branch: undefined,
    doomed: undefined,
    heldItem: undefined,
    equipment: [],
    bond: 30,
    // Carried over: what the player learned about this animal. Making them buy
    // the same lenses twice would be a tax on remembering.
    revealed: [...options.ancestor.revealed],
    acquiredOnDay: 0,
    origin: "gift",
    name: `${options.ancestor.name} (carried)`,
  };

  return {
    ...base,
    nextId: base.nextId + 1,
    creatures: [...base.creatures, carried],
    pedigree: [...base.pedigree, { id: carried.id, name: carried.name, generation: 0 }],
    campaign: NEW_CAMPAIGN,
    compendium: {
      // The Compendium is knowledge, and knowledge does not reset. It is also
      // the only reason a returning player can tell how much of the new pool is
      // genuinely new.
      ...previous.compendium,
      seenSpecies: [...new Set([...previous.compendium.seenSpecies, options.species, map.species.id])],
    },
    records: {
      ...previous.records,
      legacyDepth: depth,
      // Ribbons, trial records and daily results belong to the player rather
      // than to the run, so they survive. The expedition and the herd do not.
      studs: previous.records.studs,
    },
  };
}

/** Who can be carried: an archived ancestor, because archiving is the choice. */
export function legacyCandidates(state: RanchState): Creature[] {
  return [...state.archive].filter((creature) => creature.status === "archived");
}
