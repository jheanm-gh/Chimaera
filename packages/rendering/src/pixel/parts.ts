/**
 * A creature as a set of named parts.
 *
 * The renderer used to scale every dimension continuously: mass stretched the
 * trunk, vigour grew the whole animal, an armament's length in centimetres
 * became its length in pixels. That produced a different *shape* for every
 * individual, which is the wrong model for this game in two ways.
 *
 * It reads badly — a species with continuously variable proportions has no
 * silhouette of its own, only a cloud of them, and outliers come out
 * misshapen rather than distinctive.
 *
 * And it cannot be drawn by hand. A part that must work at any proportion has
 * to be generated; a part that appears in three known sizes can be drawn once
 * each and dropped in. Modular but not scalable is what makes hand art possible
 * later, and it is how this whole genre has always worked: a Pokémon's sprite
 * does not change with its weight.
 *
 * So dimensions are *stated*, not drawn. A 40kg Bramblehog and a 100kg one
 * share their art and differ in their stat block — but a tusked one and a
 * hornless one are visibly different animals, because that is a different part.
 */

import type { Morphology, Phenotype } from "@chimaera/genetics";
import type { BodyPlan } from "../rig/plan.js";

/** The three trunks every species is drawn in. Nothing between them. */
export type BuildStep = "slight" | "middling" | "heavy";

export type LimbVariant = "none" | "stub" | "paddle" | "clawed" | "long";
export type TailVariant = "none" | "stub" | "fan" | "forked" | "whip";
export type CrownVariant = "none" | "fronds" | "spines" | "plume" | "membrane";
export type ArmamentVariant = "none" | "crest" | "spines" | "tusks" | "horn" | "beak" | "fangs";
export type HideVariant = "naked" | "slimed" | "furred" | "scaled" | "plated";
export type MarkingVariant = "none" | "bands" | "spots" | "rings" | "diamonds" | "ticks" | "mask" | "collar" | "lapped";

/**
 * Everything the renderer needs to draw an animal, as names.
 *
 * No numbers. That is the point: this set is exactly what a parts atlas would
 * have to supply, so the day hand-drawn art arrives it slots in against these
 * names and nothing else has to change.
 */
export interface PartSet {
  readonly species: string;
  readonly build: BuildStep;
  readonly limbs: LimbVariant;
  readonly tail: TailVariant;
  readonly crown: CrownVariant;
  /** How much crown there is: an epistatic gate reduces it without removing it. */
  readonly crownSize: "reduced" | "normal" | "grand";
  readonly armament: ArmamentVariant;
  readonly hide: HideVariant;
  readonly markings: MarkingVariant;
  /** A lit organ. Drawn, but it is a switch rather than a scale. */
  readonly lantern: boolean;
}

/** Continuous value to one of three steps. The only snapping in the renderer. */
export function buildStep(value: number): BuildStep {
  if (value < 0.34) return "slight";
  if (value < 0.67) return "middling";
  return "heavy";
}

/** Proportion multipliers for each step, applied to the plan's own numbers. */
export const BUILD_SCALE: Readonly<Record<BuildStep, { depth: number; length: number }>> = {
  slight: { depth: 0.82, length: 0.94 },
  middling: { depth: 1, length: 1 },
  heavy: { depth: 1.22, length: 1.06 },
};

function pick<T extends string>(said: string, table: readonly (readonly [RegExp, T])[], fallback: T): T {
  for (const [pattern, value] of table) if (pattern.test(said)) return value;
  return fallback;
}

/**
 * Foot shape, not presence.
 *
 * Deliberately has no row that returns "none". The only thing that removes an
 * animal's legs is a body plan with no limb pairs — a trait word cannot
 * amputate. The Kite-Ossel's foot clasp is Y-linked and suppressed in females,
 * so every hen expressed the word "none" for it; read as a limb variant that
 * took the legs off half the species.
 */
const LIMBS: readonly (readonly [RegExp, LimbVariant])[] = [
  [/stub|short|reduced/, "stub"],
  [/paddle|webbed|flipper/, "paddle"],
  [/claw|hook|grip|talon/, "clawed"],
  [/long|stilt|pad/, "long"],
];

const MARKINGS: readonly (readonly [RegExp, MarkingVariant])[] = [
  [/band|barred|stripe/, "bands"],
  [/eyespot|ring/, "rings"],
  [/diamond/, "diamonds"],
  [/spot|fleck|dot/, "spots"],
  [/ray|tick/, "ticks"],
  [/mask/, "mask"],
  [/collar/, "collar"],
  [/lap|scale/, "lapped"],
];

/**
 * Resolve one animal to its parts.
 *
 * Reads the phenotype's own trait words and the morphology's categorical
 * halves — never a measurement. A measurement decides how the animal fights
 * and what its card says; it does not decide what it looks like.
 */
export function partsFor(phenotype: Phenotype, plan: BodyPlan, body: Morphology): PartSet {
  /**
   * The word from *one* locus.
   *
   * Reading the whole trait bag was a real bug and an instructive one: nearly
   * every species has some locus whose expressed phenotype is the string
   * "none" — an unlit lantern, a plain tail — and a limb lookup that searched
   * all of them matched that "none" and took the animal's legs off. A slot is
   * decided by its own locus or by nothing.
   */
  const word = (key: string | undefined): string => (key === undefined ? "" : (phenotype.traits[key] ?? "").toLowerCase());

  const buildValue = phenotype.values[plan.traits.build] ?? 0.5;
  const crownWord = `${word(plan.traits.crown)} ${word(plan.traits.display)}`;
  const suppressed = /naked|absent|none|hidden|smooth|plain/.test(crownWord);
  const grand = /grand|bold|full|high|display|crown/.test(crownWord);

  return {
    species: plan.species,
    build: buildStep(buildValue),
    limbs: plan.limbPairs === 0 ? "none" : pick(word(plan.traits.limbs), LIMBS, "clawed"),
    tail: plan.tailReach <= 0 ? "none" : (body.tailKind as TailVariant),
    crown: plan.crown === "none" ? "none" : (plan.crown as CrownVariant),
    crownSize: suppressed ? "reduced" : grand ? "grand" : "normal",
    armament: body.armamentKind,
    hide: body.hideKind,
    markings: pick(word(plan.traits.markings), MARKINGS, "none"),
    lantern: /lantern|glow|lit/.test(word(plan.traits.glow)),
  };
}

/**
 * Every part the atlas would have to contain.
 *
 * Enumerated rather than described, because the art handoff needs a file list
 * and because a variant nothing can reach is a piece somebody would draw for
 * nothing.
 */
export function partInventory(species: string): readonly string[] {
  const slots: readonly (readonly [string, readonly string[]])[] = [
    ["trunk", ["slight", "middling", "heavy"]],
    ["head", ["default"]],
    ["limb", ["none", "stub", "paddle", "clawed", "long"]],
    ["tail", ["none", "stub", "fan", "forked", "whip"]],
    ["crown", ["none", "fronds", "spines", "plume", "membrane"]],
    ["armament", ["none", "crest", "spines", "tusks", "horn", "beak", "fangs"]],
    ["hide", ["naked", "slimed", "furred", "scaled", "plated"]],
  ];
  const files: string[] = [];
  for (const [slot, variants] of slots) {
    for (const variant of variants) {
      if (variant === "none") continue;
      files.push(`${species}_${slot}_${variant}.png`);
    }
  }
  return files;
}
