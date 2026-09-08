/**
 * Game state.
 *
 * Two rules shape everything in this package:
 *
 *  1. **State is a plain, serialisable value.** No class instances, no
 *     references into the genetics engine, no functions. It is the save file.
 *     A ranch can be JSON round-tripped, diffed, replayed and handed to a Web
 *     Worker without ceremony.
 *  2. **Actions are pure.** `(state, action) -> { state, events }`. The RNG
 *     state lives *inside* the ranch, so the whole game is a deterministic
 *     function of its seed and the player's inputs — which is what makes Daily
 *     Genome, replays and Trial scoring possible at all (§4).
 *
 * Time advances in days, ticked by player actions (§2.1). There are no
 * real-world timers anywhere in this package, and there never will be.
 */

import type { EpigeneticMarks, Genome, LocusId, RngState, Sex, SpeciesId, StatId } from "@chimaera/genetics";
import type { CampaignState } from "./campaign.js";
import type { Role, Stance } from "./combat.js";
import type { ExpeditionState } from "./expedition.js";

export type CreatureId = string;

/** §2.1. Fertility opens in Adult and closes in Elder. Creatures age out. */
export type LifeStage = "egg" | "hatchling" | "juvenile" | "adult" | "elder";

export type CreatureStatus = "active" | "archived" | "dead";

/** §2.2, the four raising axes. Each has a genetic interaction. */
export type DietId = "forage" | "silt" | "carrion" | "bloom" | "fasting";
export type HabitatId =
  | "mirefen"
  | "deepfen"
  | "reedbank"
  | "emberpool"
  | "galeshore"
  | "reedwold"
  | "thornbrake";
export type TrainingId = "none" | "sprint" | "endurance" | "stillness";

export interface Creature {
  readonly id: CreatureId;
  readonly species: SpeciesId;
  readonly genome: Genome;
  readonly name: string;
  readonly sex: Sex;
  readonly stage: LifeStage;
  readonly ageDays: number;
  /** Death comes at this age unless the creature is archived first. */
  readonly lifespanDays: number;
  readonly status: CreatureStatus;

  readonly sireId?: CreatureId | undefined;
  readonly damId?: CreatureId | undefined;
  readonly generation: number;
  /** Wright's F, computed at conception and stored — the pedigree can only grow. */
  readonly inbreeding: number;

  readonly diet: DietId;
  readonly habitat: HabitatId;
  readonly training: TrainingId;
  /** 0-100. Grows with attention; gates evolution branches (§2.2). */
  readonly bond: number;
  readonly heldItem?: string | undefined;

  /** Combat loadout (§3). Set before a fight; no input is possible during one. */
  readonly role: Role;
  readonly stance: Stance;
  /** Two slots. Capped at 20% of effective power, enforced in `combat.ts`. */
  readonly equipment: readonly string[];

  /**
   * Achieved stats. Genes set the ceiling in the phenotype; these are how close
   * this individual actually got (§1.6).
   */
  readonly achieved: Readonly<Record<StatId, number>>;
  readonly marks: EpigeneticMarks;

  /** Which evolution branch this creature took, once it has taken one. */
  readonly branch?: string | undefined;

  /**
   * Loci the player has revealed, by lens tier or deduction (§1.3). This is
   * *knowledge*, not biology, so it lives on the game record and never on the
   * genome.
   */
  readonly revealed: readonly LocusId[];
  /** True once a Deep Sequencer has established which alleles travel together. */
  readonly phaseKnown: boolean;

  /** Day the creature entered the ranch, for the journal. */
  readonly acquiredOnDay: number;
  readonly origin: "wild" | "bred" | "gift";

  /**
   * Set on an egg that will not hatch, and revealed when incubation ends.
   *
   * The failure is decided at conception — that is what the genetics engine
   * says — but the player learns it six days later, when the egg was due. A
   * lethal allele that announces itself at the moment of pairing teaches
   * nothing; one that costs you a week of waiting teaches the lesson §4.1
   * chapter 5 is built around.
   */
  readonly doomed?: { readonly reason: string; readonly locus?: LocusId } | undefined;
}

export interface Inventory {
  /** Currency. Earned from trials, shows and expeditions. */
  readonly motes: number;
  /** Consumables and tools, by item id. */
  readonly items: Readonly<Record<string, number>>;
  /**
   * Gene fragments, per locus. Combat and expeditions are a faucet for these
   * (§3), and they are what a gene serum is built from.
   */
  readonly fragments: Readonly<Record<LocusId, number>>;
}

/** The Compendium's raw data (§8.3). Fills in as the player discovers things. */
export interface Compendium {
  readonly seenSpecies: readonly SpeciesId[];
  readonly seenAlleles: readonly string[];
  readonly seenBranches: readonly string[];
  readonly seenEpistasis: readonly string[];
  /** Novel alleles and who named them. The UGC hook (§8.2). */
  readonly namedAlleles: Readonly<Record<string, { readonly name: string; readonly discoveredOnDay: number }>>;
}

export interface PedigreeRecord {
  readonly id: CreatureId;
  readonly sire?: CreatureId | undefined;
  readonly dam?: CreatureId | undefined;
  /** Kept after death so an ancestor can still be reasoned about. */
  readonly name: string;
  readonly generation: number;
}

export interface RanchState {
  readonly version: number;
  readonly seed: string;
  /**
   * The ranch's base random stream. It never advances.
   *
   * `Rng.fork(label)` is deliberately *non-consuming* — that is the whole
   * reason it exists, so that adding a battle roll in a later phase cannot
   * shift the numbers a breeding roll would have produced. The consequence is
   * that the caller must supply the variation, which is what `rngCursor` is
   * for: every action that rolls forks `label:cursor` and increments it.
   * Forking the same state twice with the same label gives the same numbers,
   * and finding that out by shipping a ranch where every egg was identical is
   * how this field came to exist.
   */
  readonly rng: RngState;
  /** Monotonic. Names the substream for the next roll. Never decreases. */
  readonly rngCursor: number;
  readonly day: number;
  readonly nextId: number;

  readonly creatures: readonly Creature[];
  /** Elders retired instead of dying. Genome preserved, breeding over (§2.1). */
  readonly archive: readonly Creature[];
  /** Every creature that ever existed, for pedigree maths. */
  readonly pedigree: readonly PedigreeRecord[];

  readonly inventory: Inventory;
  readonly compendium: Compendium;
  /** Ranch capacity. Expandable, and one of the few honest monetisation hooks (§9). */
  readonly capacity: number;
  readonly archiveCapacity: number;

  /** An expedition in progress. Absent when the player is at home. */
  readonly expedition?: ExpeditionState | undefined;
  /** Highest League tier cleared. Cleared tiers can be bulk-simulated (§3). */
  readonly leagueTier: number;

  /**
   * Campaign progress (§4.1).
   *
   * It lives in the save rather than beside it because every objective is a
   * question asked of this state: keeping the answers anywhere else would let a
   * restored save disagree with its own ledger.
   */
  readonly campaign: CampaignState;
}

// ---------------------------------------------------------------------------
// Actions and events
// ---------------------------------------------------------------------------

export type Action =
  | { readonly kind: "advanceDays"; readonly days: number }
  | {
      readonly kind: "breed";
      readonly sireId: CreatureId;
      readonly damId: CreatureId;
      readonly items?: readonly string[];
    }
  | { readonly kind: "setDiet"; readonly id: CreatureId; readonly diet: DietId }
  | { readonly kind: "setHabitat"; readonly id: CreatureId; readonly habitat: HabitatId }
  | { readonly kind: "setTraining"; readonly id: CreatureId; readonly training: TrainingId }
  | { readonly kind: "tend"; readonly id: CreatureId }
  | { readonly kind: "holdItem"; readonly id: CreatureId; readonly item: string | undefined }
  | { readonly kind: "useItem"; readonly id: CreatureId; readonly item: string; readonly locus?: LocusId }
  | { readonly kind: "rename"; readonly id: CreatureId; readonly name: string }
  | { readonly kind: "archive"; readonly id: CreatureId }
  | { readonly kind: "release"; readonly id: CreatureId }
  | { readonly kind: "catchWild"; readonly species?: SpeciesId }
  | { readonly kind: "setRole"; readonly id: CreatureId; readonly role: Role }
  | { readonly kind: "setStance"; readonly id: CreatureId; readonly stance: Stance }
  | { readonly kind: "setEquipment"; readonly id: CreatureId; readonly equipment: readonly string[] }
  | { readonly kind: "bout"; readonly team: readonly CreatureId[]; readonly tier: number }
  | { readonly kind: "enterExpedition"; readonly team: readonly CreatureId[]; readonly regionSeed?: string }
  | { readonly kind: "expeditionMove"; readonly nodeId: string }
  | { readonly kind: "expeditionWithdraw" };

export type GameEvent =
  | { readonly kind: "dayPassed"; readonly day: number }
  | { readonly kind: "hatched"; readonly id: CreatureId; readonly name: string }
  | { readonly kind: "eggFailed"; readonly reason: string; readonly locus?: LocusId }
  | { readonly kind: "noEgg" }
  | { readonly kind: "stageChanged"; readonly id: CreatureId; readonly stage: LifeStage }
  | { readonly kind: "evolved"; readonly id: CreatureId; readonly branch: string; readonly branchName: string }
  | { readonly kind: "died"; readonly id: CreatureId; readonly name: string; readonly ageDays: number }
  | { readonly kind: "archived"; readonly id: CreatureId; readonly name: string }
  | { readonly kind: "released"; readonly id: CreatureId; readonly name: string }
  | { readonly kind: "mutation"; readonly id: CreatureId; readonly locus: LocusId; readonly allele: string; readonly novel: boolean }
  | { readonly kind: "discovery"; readonly what: string; readonly detail: string }
  | { readonly kind: "revealed"; readonly id: CreatureId; readonly loci: readonly LocusId[] }
  | { readonly kind: "caught"; readonly id: CreatureId; readonly name: string }
  | { readonly kind: "blocked"; readonly reason: string }
  | {
      readonly kind: "battle";
      readonly won: boolean;
      readonly rounds: number;
      readonly summary: string;
      readonly tier?: number;
    }
  | { readonly kind: "expeditionEntered"; readonly region: string }
  | { readonly kind: "expeditionNode"; readonly node: string; readonly detail: string }
  | { readonly kind: "expeditionEnded"; readonly outcome: "won" | "lost" | "withdrawn"; readonly summary: string }
  | { readonly kind: "lost"; readonly id: CreatureId; readonly name: string; readonly where: string }
  | {
      readonly kind: "objectiveMet";
      readonly chapter: string;
      readonly objective: string;
      readonly label: string;
    }
  | {
      readonly kind: "chapterComplete";
      readonly chapter: string;
      readonly title: string;
      readonly motes: number;
    };

export interface ActionResult {
  readonly state: RanchState;
  readonly events: readonly GameEvent[];
}
