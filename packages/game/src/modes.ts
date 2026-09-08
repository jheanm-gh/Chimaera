/**
 * Modes, and what opens them (§4).
 *
 * One table, one pure predicate per mode, evaluated against the save. Nothing
 * sets an "unlocked" flag anywhere: a mode is open when the state says it is,
 * which means an imported save, a migrated save and a Legacy run all agree
 * about what the player can do without anybody having to remember to set a
 * bit.
 *
 * The gates are the brief's, with one addition. Expeditions unlock at chapter 2
 * *and* still want a League win, because the League is where a player finds out
 * what their animals can take somewhere that does not keep what it beats. Two
 * gates on the one mode that can permanently delete a creature is deliberate.
 */

import type { RanchState } from "./types.js";

export type ModeId =
  | "campaign"
  | "expedition"
  | "sandbox"
  | "exhibition"
  | "trials"
  | "daily"
  | "legacy"
  | "rival"
  | "exchange";

export interface ModeDef {
  readonly id: ModeId;
  readonly name: string;
  readonly blurb: string;
  /** What the player is told when it is shut. */
  readonly requirement: string;
  readonly isOpen: (state: RanchState) => boolean;
}

/** Chapters completed, as a count. `completed` is append-only and ordered. */
export function chaptersDone(state: RanchState): number {
  return state.campaign.completed.length;
}

export function campaignFinished(state: RanchState): boolean {
  return chaptersDone(state) >= 8;
}

export const MODES: readonly ModeDef[] = [
  {
    id: "campaign",
    name: "Story",
    blurb: "Eight commissions, one genetic concept each. The fen was farmed to a bottleneck; put it back.",
    requirement: "Open from the first day.",
    isOpen: () => true,
  },
  {
    id: "expedition",
    name: "Expedition",
    blurb:
      "Three creatures into unmapped country. Permadeath, and the only way to bring another species home.",
    requirement: "Deliver chapter 2, and win a League bout.",
    isOpen: (state) => chaptersDone(state) >= 2 && state.leagueTier >= 1,
  },
  {
    id: "sandbox",
    name: "The Ranch",
    blurb: "Free breeding, no commissions. Where most of the hours eventually go.",
    requirement: "Deliver chapter 3.",
    isOpen: (state) => chaptersDone(state) >= 3,
  },
  {
    id: "exhibition",
    name: "Exhibition",
    blurb:
      "Judged on the animal alone: conformation to the standard, rarity, colour, and condition. No combat stats at all.",
    // The brief unlocks this on the first novel mutation, which is a discovery
    // rather than a chapter — a player who finds one in hour two has earned the
    // second meta early, and that is the right reward for a discovery.
    requirement: "Find your first novel allele.",
    isOpen: (state) => state.compendium.seenAlleles.length > 0,
  },
  {
    id: "trials",
    name: "Breeding Trials",
    blurb: "Authored puzzles. Breed to a specification inside a generation limit, scored on how cleanly you did it.",
    requirement: "Deliver chapter 4.",
    isOpen: (state) => chaptersDone(state) >= 4,
  },
  {
    id: "daily",
    name: "Daily Genome",
    blurb: "The same starting pair, gene pool and target for everyone, seeded from the date. One attempt.",
    requirement: "Deliver chapter 5.",
    isOpen: (state) => chaptersDone(state) >= 5,
  },
  {
    id: "legacy",
    name: "Legacy",
    blurb: "Begin again carrying one archived ancestor's genome into a new gene pool.",
    requirement: "Finish the story.",
    isOpen: campaignFinished,
  },
  {
    id: "rival",
    name: "Rival Ranch",
    blurb: "Fight snapshots of other stations' teams. Ghost data — nothing live, nothing to lose.",
    requirement: "Finish the story.",
    isOpen: campaignFinished,
  },
  {
    id: "exchange",
    name: "Stud Exchange",
    blurb: "Publish a creature as a stud. Others breed to it; you are paid in what their pairings turn up.",
    requirement: "Finish the story.",
    isOpen: campaignFinished,
  },
];

const BY_ID = new Map(MODES.map((mode) => [mode.id, mode]));

export function modeById(id: ModeId): ModeDef {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown mode "${id}"`);
  return found;
}

export function isOpen(state: RanchState, id: ModeId): boolean {
  return modeById(id).isOpen(state);
}

export function openModes(state: RanchState): ModeId[] {
  return MODES.filter((mode) => mode.isOpen(state)).map((mode) => mode.id);
}
