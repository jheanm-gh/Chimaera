/**
 * Authored game content: raising axes, evolution branches, and the item
 * catalogue.
 *
 * Kept as data with declarative effects rather than as code, so that the action
 * handlers stay small and so a designer can retune the whole economy without
 * touching a reducer.
 */

import type { StatId } from "@chimaera/genetics";
import type { DietId, HabitatId, TrainingId } from "./types.js";

// ---------------------------------------------------------------------------
// Raising axis 1: diet
// ---------------------------------------------------------------------------

export interface DietDef {
  readonly id: DietId;
  readonly name: string;
  readonly blurb: string;
  /** Per-stat multiplier on how fast the achieved stat closes on its ceiling. */
  readonly growth: Readonly<Record<StatId, number>>;
  /** Multiplier on remaining lifespan accrual. Fasting buys days; rich diets spend them. */
  readonly lifespan: number;
  readonly bondPerDay: number;
}

export const DIETS: readonly DietDef[] = [
  {
    id: "forage",
    name: "Foraged reed shoots",
    blurb: "What a Quillfen would eat if nobody interfered. Even, unspectacular.",
    growth: { speed: 1, vigour: 1, focus: 1 },
    lifespan: 1,
    bondPerDay: 0.15,
  },
  {
    id: "silt",
    name: "Silt and bottom-worms",
    blurb: "Builds mass. The animal gets heavier and slower, and does not mind.",
    growth: { speed: 0.72, vigour: 1.5, focus: 0.9 },
    lifespan: 1.02,
    bondPerDay: 0.1,
  },
  {
    id: "carrion",
    name: "Carrion",
    blurb: "Fast growth, sharp temper, shorter life. The ranch smells.",
    growth: { speed: 1.45, vigour: 0.78, focus: 1.15 },
    lifespan: 0.9,
    bondPerDay: -0.05,
  },
  {
    id: "bloom",
    name: "Fen-bloom nectar",
    blurb: "Expensive and calming. Sharpens attention, does little for the body.",
    growth: { speed: 1.05, vigour: 0.85, focus: 1.55 },
    lifespan: 1.05,
    bondPerDay: 0.35,
  },
  {
    id: "fasting",
    name: "Managed fasting",
    blurb: "Nothing grows. Everything lasts. A tool for holding a line open one more season.",
    growth: { speed: 0.25, vigour: 0.25, focus: 0.35 },
    lifespan: 1.28,
    bondPerDay: -0.1,
  },
];

// ---------------------------------------------------------------------------
// Raising axis 2: habitat
// ---------------------------------------------------------------------------

export interface HabitatDef {
  readonly id: HabitatId;
  readonly name: string;
  readonly blurb: string;
  /** Species whose home biome this is. Matched habitats boost expression (§2.2). */
  readonly biome: string;
  /** Affinity this habitat rewards, tying the habitat axis to a genetic trait. */
  readonly affinity: string;
  readonly growth: Readonly<Record<StatId, number>>;
}

export const HABITATS: readonly HabitatDef[] = [
  {
    id: "mirefen",
    name: "Open mirefen",
    blurb: "Reed shadow and standing water. Home ground.",
    biome: "Mirefen",
    affinity: "mire",
    growth: { speed: 1, vigour: 1.1, focus: 1 },
  },
  {
    id: "deepfen",
    name: "Deep fen",
    blurb: "Dark, still, cold. Nothing hurries here, and attention sharpens.",
    biome: "Mirefen",
    affinity: "mire",
    growth: { speed: 0.85, vigour: 1, focus: 1.35 },
  },
  {
    id: "reedbank",
    name: "Reedbank shallows",
    blurb: "Fast water over gravel. Something to push against.",
    biome: "Mirefen",
    affinity: "gale",
    growth: { speed: 1.3, vigour: 0.95, focus: 0.95 },
  },
  {
    id: "emberpool",
    name: "Emberpool",
    blurb: "Warm mineral springs. Wrong for most Quillfen, and exactly right for a few.",
    biome: "Ashlands",
    affinity: "ember",
    growth: { speed: 1.1, vigour: 1.15, focus: 0.85 },
  },
  {
    id: "galeshore",
    name: "Galeshore",
    blurb: "Wind and spray. Hard living, and it shows in the shoulders.",
    biome: "Coast",
    affinity: "gale",
    growth: { speed: 1.4, vigour: 1.05, focus: 0.75 },
  },
];

/**
 * Habitat match, §2.2: "biome-matched habitats boost expression; mismatched
 * suppress it".
 *
 * The affinity locus is the second, genetic half of the match. A Quillfen with
 * an ember affinity thrives in the Emberpool that would sap its siblings, which
 * makes the affinity locus a *raising* decision as well as a combat one.
 */
export const HABITAT_MATCH = { home: 1.15, affinity: 1.08, neutral: 1, wrong: 0.82 } as const;

export function habitatFactor(habitat: HabitatDef, speciesBiome: string, affinities: readonly string[]): number {
  if (habitat.biome === speciesBiome) {
    return affinities.includes(habitat.affinity) ? HABITAT_MATCH.home : HABITAT_MATCH.neutral;
  }
  return affinities.includes(habitat.affinity) ? HABITAT_MATCH.affinity : HABITAT_MATCH.wrong;
}

// ---------------------------------------------------------------------------
// Raising axis 3: training
// ---------------------------------------------------------------------------

export interface TrainingDef {
  readonly id: TrainingId;
  readonly name: string;
  readonly blurb: string;
  readonly growth: Readonly<Record<StatId, number>>;
  /** Days of life spent per day trained (§2.2). Training is never free. */
  readonly lifespanCostPerDay: number;
  readonly bondPerDay: number;
  /** Training does nothing before this stage. */
  readonly fromStage: "juvenile";
}

export const TRAINING: readonly TrainingDef[] = [
  {
    id: "none",
    name: "Untrained",
    blurb: "Left to its own devices.",
    growth: { speed: 1, vigour: 1, focus: 1 },
    lifespanCostPerDay: 0,
    bondPerDay: 0,
    fromStage: "juvenile",
  },
  {
    id: "sprint",
    name: "Sprint work",
    blurb: "Short bursts against the current. Fast, and expensive in years.",
    growth: { speed: 1.95, vigour: 0.7, focus: 0.7 },
    lifespanCostPerDay: 0.35,
    bondPerDay: 0.1,
    fromStage: "juvenile",
  },
  {
    id: "endurance",
    name: "Endurance swims",
    blurb: "Long, cold, dull. It builds a creature that does not quit.",
    growth: { speed: 0.7, vigour: 1.95, focus: 0.75 },
    lifespanCostPerDay: 0.3,
    bondPerDay: 0.05,
    fromStage: "juvenile",
  },
  {
    id: "stillness",
    name: "Stillness drill",
    blurb: "Hours of nothing, held deliberately. The Quillfen is built for it.",
    growth: { speed: 0.7, vigour: 0.75, focus: 1.95 },
    lifespanCostPerDay: 0.25,
    bondPerDay: 0.3,
    fromStage: "juvenile",
  },
];

// ---------------------------------------------------------------------------
// Evolution branches (§2.3)
// ---------------------------------------------------------------------------

export interface EvolutionContext {
  readonly build: number;
  readonly affinities: readonly string[];
  readonly bond: number;
  readonly diet: DietId;
  readonly habitat: HabitatId;
  readonly training: TrainingId;
  readonly heldItem?: string | undefined;
  /** Achieved-over-ceiling, 0-1, per stat. */
  readonly achievement: Readonly<Record<StatId, number>>;
  readonly carries: (allele: string) => boolean;
  readonly traits: Readonly<Record<string, string>>;
}

export interface BranchCondition {
  readonly label: string;
  readonly test: (ctx: EvolutionContext) => boolean;
}

export interface EvolutionBranch {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly conditions: readonly BranchCondition[];
  /**
   * Shown when the branch is within reach. Deliberately a nudge, not a recipe:
   * §2.3 asks for previewable but not guaranteed.
   */
  readonly hint: string;
  /** Hidden from the preview until discovered once. The wiki-page branch. */
  readonly secret?: boolean;
}

/**
 * Evaluated in order; the first branch whose conditions all hold is taken, so
 * the most demanding branches sit at the top. `reedwarden` is the floor: a
 * creature that meets nothing still becomes something.
 */
export const QUILLFEN_BRANCHES: readonly EvolutionBranch[] = [
  {
    id: "lantern-sage",
    name: "Lantern Sage",
    blurb:
      "It stops moving almost entirely, and begins to glow on a slow cycle that matches nothing in the fen. Fen-keepers navigate by them.",
    secret: true,
    hint: "Something in the deep water responds to this one, and it is not the food.",
    conditions: [
      { label: "carries the lantern allele", test: (c) => c.carries("LN_star") },
      { label: "focus near its ceiling", test: (c) => (c.achievement.focus ?? 0) >= 0.8 },
      { label: "deeply bonded", test: (c) => c.bond >= 80 },
      { label: "raised in the deep fen", test: (c) => c.habitat === "deepfen" },
      { label: "holding a prism lens", test: (c) => c.heldItem === "prism-lens" },
    ],
  },
  {
    id: "ember-kindler",
    name: "Ember Kindler",
    blurb:
      "Warm-water stock. The gills shorten, the hide thickens, and it will sit in water that would kill its siblings.",
    hint: "It keeps returning to the warm end of the pool.",
    conditions: [
      { label: "ember affinity", test: (c) => c.affinities.includes("ember") },
      { label: "well bonded", test: (c) => c.bond >= 60 },
      { label: "raised in the emberpool", test: (c) => c.habitat === "emberpool" },
    ],
  },
  {
    id: "gale-skimmer",
    name: "Gale Skimmer",
    blurb: "Long, light and impatient. It has stopped sculling and started running.",
    hint: "It is faster than a Quillfen has any business being.",
    conditions: [
      { label: "gale affinity", test: (c) => c.affinities.includes("gale") },
      { label: "speed near its ceiling", test: (c) => (c.achievement.speed ?? 0) >= 0.7 },
      { label: "trained for sprint work", test: (c) => c.training === "sprint" },
    ],
  },
  {
    id: "silt-treader",
    name: "Silt Treader",
    blurb: "Heavy, patient, and almost impossible to move. It walks the bottom rather than swimming.",
    hint: "It has put on weight and shows no sign of stopping.",
    conditions: [
      { label: "heavy build", test: (c) => c.build >= 0.6 },
      { label: "vigour well developed", test: (c) => (c.achievement.vigour ?? 0) >= 0.65 },
      { label: "fed on silt", test: (c) => c.diet === "silt" },
    ],
  },
  {
    id: "reedwarden",
    name: "Reedwarden",
    blurb: "The common adult form. Watchful, territorial, and entirely unbothered.",
    hint: "Growing up much as its parents did.",
    conditions: [],
  },
];

// ---------------------------------------------------------------------------
// Items (§5)
// ---------------------------------------------------------------------------

export type ItemCategory = "breeding" | "analysis" | "raising" | "combat";

export type ItemEffect =
  /** Applied at breeding time. */
  | {
      readonly kind: "breeding";
      readonly pointMultiplier?: number;
      readonly novelMultiplier?: number;
      readonly duplicationMultiplier?: number;
      readonly fertilityMultiplier?: number;
      readonly crossoverMultiplier?: number;
      readonly lifespanCostDays?: number;
      readonly extraStillbirthChance?: number;
      readonly sexSelection?: { readonly sex: "female" | "male"; readonly reliability: number };
      readonly incubationMultiplier?: number;
    }
  /** Reveals genotype information (§1.3). */
  | { readonly kind: "reveal"; readonly tier: "one" | "coat" | "all"; readonly phase?: boolean }
  /** Changes what the player can see for one observation, not the genome. */
  | { readonly kind: "suppressDominance" }
  | { readonly kind: "bond"; readonly amount: number }
  | { readonly kind: "lifespan"; readonly days: number }
  /** Extracts one locus from a creature, destroying it permanently (§5). */
  | { readonly kind: "geneSerum" }
  | { readonly kind: "held"; readonly note: string };

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly category: ItemCategory;
  readonly blurb: string;
  readonly cost: number;
  readonly consumable: boolean;
  readonly effect: ItemEffect;
}

export const ITEMS: readonly ItemDef[] = [
  // --- Breeding: the good stuff (§5) -------------------------------------
  {
    id: "mutagen-crude",
    name: "Crude mutagen",
    category: "breeding",
    blurb: "Raises the mutation rate and shortens both parents. Cheap, and it shows.",
    cost: 120,
    consumable: true,
    effect: {
      kind: "breeding",
      pointMultiplier: 80,
      novelMultiplier: 250,
      fertilityMultiplier: 0.85,
      lifespanCostDays: 12,
      extraStillbirthChance: 0.04,
    },
  },
  {
    id: "mutagen-refined",
    name: "Refined mutagen",
    category: "breeding",
    blurb: "The real thing. Novel alleles become genuinely reachable, at a price paid in years.",
    cost: 600,
    consumable: true,
    effect: {
      kind: "breeding",
      pointMultiplier: 140,
      novelMultiplier: 900,
      duplicationMultiplier: 60,
      fertilityMultiplier: 0.7,
      lifespanCostDays: 26,
      extraStillbirthChance: 0.07,
    },
  },
  {
    id: "crossover-inducer",
    name: "Crossover inducer",
    category: "breeding",
    blurb: "Raises recombination. The only reliable tool for prising apart two linked loci.",
    cost: 350,
    consumable: true,
    effect: { kind: "breeding", crossoverMultiplier: 6, fertilityMultiplier: 0.92, lifespanCostDays: 4 },
  },
  {
    id: "fertility-tonic",
    name: "Fertility tonic",
    category: "breeding",
    blurb: "More eggs from a tired or closely related pair. It does nothing for what is in them.",
    cost: 60,
    consumable: true,
    effect: { kind: "breeding", fertilityMultiplier: 1.18 },
  },
  {
    id: "gestation-accelerator",
    name: "Gestation accelerator",
    category: "breeding",
    blurb: "Halves incubation. Useful when you are counting generations, not days.",
    cost: 90,
    consumable: true,
    effect: { kind: "breeding", incubationMultiplier: 0.5 },
  },
  {
    id: "reagent-female",
    name: "Sex-selection reagent (♀)",
    category: "breeding",
    blurb: "Biases which sperm succeeds. Four times in five.",
    cost: 140,
    consumable: true,
    effect: { kind: "breeding", sexSelection: { sex: "female", reliability: 0.8 } },
  },
  {
    id: "reagent-male",
    name: "Sex-selection reagent (♂)",
    category: "breeding",
    blurb: "Biases which sperm succeeds. Four times in five.",
    cost: 140,
    consumable: true,
    effect: { kind: "breeding", sexSelection: { sex: "male", reliability: 0.8 } },
  },
  {
    id: "dominance-suppressor",
    name: "Dominance suppressor",
    category: "breeding",
    blurb:
      "Forces the recessive to show, for one look. It changes nothing about the animal — only what you can see.",
    cost: 200,
    consumable: true,
    effect: { kind: "suppressDominance" },
  },
  {
    id: "gene-serum",
    name: "Gene serum",
    category: "breeding",
    blurb:
      "Extracts one locus from a creature. The creature does not survive it. Late game, and the cost is meant to hurt.",
    cost: 2400,
    consumable: true,
    effect: { kind: "geneSerum" },
  },

  // --- Analysis: the lens tiers (§1.3) ------------------------------------
  {
    id: "field-lens",
    name: "Field Lens",
    category: "analysis",
    blurb: "Reveals one locus of your choosing. Tier 1.",
    cost: 80,
    consumable: true,
    effect: { kind: "reveal", tier: "one" },
  },
  {
    id: "assay-bench",
    name: "Assay Bench",
    category: "analysis",
    blurb: "Reveals every coat and form locus. Says nothing about stats. Tier 2.",
    cost: 450,
    consumable: true,
    effect: { kind: "reveal", tier: "coat" },
  },
  {
    id: "deep-sequencer",
    name: "Deep Sequencer",
    category: "analysis",
    blurb: "The whole genome, phase included. Expensive every single time. Tier 3.",
    cost: 1800,
    consumable: true,
    effect: { kind: "reveal", tier: "all", phase: true },
  },

  // --- Raising -------------------------------------------------------------
  {
    id: "bond-gift",
    name: "Riverstone",
    category: "raising",
    blurb: "A smooth stone of no value whatsoever. They hoard them.",
    cost: 40,
    consumable: true,
    effect: { kind: "bond", amount: 14 },
  },
  {
    id: "longevity-draught",
    name: "Longevity draught",
    category: "raising",
    blurb: "Buys a season. Cannot buy a second one for the same animal without diminishing returns.",
    cost: 500,
    consumable: true,
    effect: { kind: "lifespan", days: 45 },
  },
  {
    id: "prism-lens",
    name: "Prism lens",
    category: "raising",
    blurb: "A held trinket that throws coloured light. Some creatures respond to it. Most do not.",
    cost: 300,
    consumable: false,
    effect: { kind: "held", note: "Held item. Gates at least one evolution branch." },
  },
];

const ITEMS_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

export function itemById(id: string): ItemDef {
  const found = ITEMS_BY_ID.get(id);
  if (!found) throw new Error(`unknown item "${id}"`);
  return found;
}

export function hasItem(id: string): boolean {
  return ITEMS_BY_ID.has(id);
}

export const DIETS_BY_ID = new Map(DIETS.map((d) => [d.id, d]));
export const HABITATS_BY_ID = new Map(HABITATS.map((h) => [h.id, h]));
export const TRAINING_BY_ID = new Map(TRAINING.map((t) => [t.id, t]));
