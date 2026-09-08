/**
 * What an animal can do, decided by what it is made of.
 *
 * The old combat had three abstract numbers and no moves at all: two creatures
 * traded a single generic strike until one fell over. Breeding changed how hard
 * that strike hit and nothing else, which made the fitness function a slope with
 * no decisions on it.
 *
 * Here a move has *prerequisites in anatomy*. A creature with no tusks cannot
 * Gore — not "gores weakly", cannot. A limbless one cannot Trample and does not
 * want to: it has a hundred and eighty centimetres of body and Constrict. So
 * breeding does not tune a number, it changes the moveset, and the player can
 * see which way it went by looking at the animal.
 *
 * Every power term and every resistance term names a measurement from
 * `@chimaera/genetics`. There is no combat stat anywhere in this file, because
 * there is no combat stat anywhere in the game.
 */

import { normaliseMeasure } from "@chimaera/genetics";
import type { HideKind, MeasureId, Morphology } from "@chimaera/genetics";
import type { SpeciesId } from "@chimaera/genetics";

/** How a move hurts, which is what the hide has an opinion about. */
export type Damage = "pierce" | "blunt" | "grip" | "toxin" | "display";

/** A term in a power or resistance sum: a measurement and how much it counts. */
export interface Term {
  readonly measure: MeasureId;
  readonly weight: number;
}

/** Anatomy a creature must have before the move is available at all. */
export type Requirement =
  | { readonly kind: "atLeast"; readonly measure: MeasureId; readonly value: number }
  | { readonly kind: "atMost"; readonly measure: MeasureId; readonly value: number }
  | { readonly kind: "armament"; readonly any: readonly Morphology["armamentKind"][] }
  | { readonly kind: "tail"; readonly any: readonly Morphology["tailKind"][] };

export interface Move {
  readonly id: string;
  readonly name: string;
  /** One line, in the naturalist's voice: what the animal is actually doing. */
  readonly flavour: string;
  readonly damage: Damage;
  readonly requires: readonly Requirement[];
  /** Measurements that make it hurt. Weights sum to 1. */
  readonly power: readonly Term[];
  /** Measurements of the *defender* that blunt it. Weights sum to 1. */
  readonly resistedBy: readonly Term[];
  /** Multiplier on the whole thing, for moves that are simply bigger. */
  readonly scale: number;
  /** Chance to land before acuity is taken into account. */
  readonly accuracy: number;
  /**
   * What it costs to throw.
   *
   * Stamina is what stops a creature spamming its best move, and it is the
   * reason a second, cheaper move is worth having.
   */
  readonly effort: number;
}

/**
 * How a hide answers each kind of damage.
 *
 * This is the type chart, and unlike a type chart it is guessable: plate turns
 * a point, slime defeats a grip, bare skin argues with nothing. A player who has
 * never read a table can still work out that stabbing an armoured animal is a
 * poor plan.
 */
export const HIDE_MATCHUP: Readonly<Record<Damage, Readonly<Record<HideKind, number>>>> = {
  pierce: { naked: 1.35, slimed: 1.1, furred: 1.05, scaled: 0.85, plated: 0.55 },
  blunt: { naked: 1.15, slimed: 1.25, furred: 0.85, scaled: 1.0, plated: 0.8 },
  grip: { naked: 1.2, slimed: 0.5, furred: 1.05, scaled: 0.85, plated: 0.7 },
  toxin: { naked: 1.45, slimed: 1.1, furred: 1.0, scaled: 0.75, plated: 0.6 },
  display: { naked: 1.0, slimed: 1.0, furred: 1.0, scaled: 1.0, plated: 1.0 },
};

export const MOVES: readonly Move[] = [
  // --- point-first ------------------------------------------------------
  {
    id: "gore",
    name: "Gore",
    flavour: "Drops the head and drives whatever is on it through the other animal.",
    damage: "pierce",
    requires: [
      { kind: "armament", any: ["tusks", "horn"] },
      { kind: "atLeast", measure: "armament", value: 6 },
    ],
    power: [
      { measure: "armament", weight: 0.55 },
      { measure: "mass", weight: 0.45 },
    ],
    resistedBy: [{ measure: "hide", weight: 1 }],
    scale: 1.25,
    accuracy: 0.85,
    effort: 3,
  },
  {
    id: "quill-rake",
    name: "Quill Rake",
    flavour: "Turns side-on and runs the length of its back along the target.",
    damage: "pierce",
    requires: [
      { kind: "armament", any: ["spines"] },
      { kind: "atLeast", measure: "armament", value: 4 },
    ],
    power: [
      { measure: "armament", weight: 0.5 },
      { measure: "length", weight: 0.3 },
      { measure: "stride", weight: 0.2 },
    ],
    resistedBy: [{ measure: "hide", weight: 1 }],
    scale: 1.05,
    accuracy: 0.92,
    effort: 2,
  },
  {
    id: "beak-jab",
    name: "Beak Jab",
    flavour: "One stroke, aimed, and back out of reach before the answer arrives.",
    damage: "pierce",
    requires: [{ kind: "armament", any: ["beak"] }],
    power: [
      { measure: "armament", weight: 0.4 },
      { measure: "acuity", weight: 0.4 },
      { measure: "stride", weight: 0.2 },
    ],
    resistedBy: [{ measure: "hide", weight: 1 }],
    scale: 0.9,
    accuracy: 0.97,
    effort: 1,
  },

  // --- weight ------------------------------------------------------------
  {
    id: "trample",
    name: "Trample",
    flavour: "Goes over rather than around, and does not look down.",
    damage: "blunt",
    requires: [
      { kind: "atLeast", measure: "limbs", value: 4 },
      { kind: "atLeast", measure: "mass", value: 25 },
    ],
    power: [
      { measure: "mass", weight: 0.7 },
      { measure: "stride", weight: 0.3 },
    ],
    resistedBy: [
      { measure: "mass", weight: 0.55 },
      { measure: "hide", weight: 0.45 },
    ],
    scale: 1.2,
    accuracy: 0.8,
    effort: 3,
  },
  {
    id: "charge",
    name: "Shoulder Charge",
    flavour: "All of it, arriving at once, shoulder first.",
    damage: "blunt",
    requires: [{ kind: "atLeast", measure: "limbs", value: 2 }],
    power: [
      { measure: "mass", weight: 0.5 },
      { measure: "stride", weight: 0.5 },
    ],
    resistedBy: [
      { measure: "mass", weight: 0.6 },
      { measure: "hide", weight: 0.4 },
    ],
    scale: 1,
    accuracy: 0.9,
    effort: 2,
  },
  {
    id: "tail-lash",
    name: "Tail Lash",
    flavour: "The tail arrives from a direction the animal is not looking in.",
    damage: "blunt",
    requires: [
      { kind: "tail", any: ["whip", "forked"] },
      { kind: "atLeast", measure: "tail", value: 20 },
    ],
    power: [
      { measure: "tail", weight: 0.6 },
      { measure: "stride", weight: 0.25 },
      { measure: "mass", weight: 0.15 },
    ],
    resistedBy: [{ measure: "mass", weight: 1 }],
    scale: 1.05,
    accuracy: 0.88,
    effort: 2,
  },
  {
    id: "loom-drop",
    name: "Drop",
    flavour: "Stands up to its full height and stops holding itself there.",
    damage: "blunt",
    requires: [{ kind: "atLeast", measure: "stature", value: 45 }],
    power: [
      { measure: "stature", weight: 0.5 },
      { measure: "mass", weight: 0.5 },
    ],
    resistedBy: [
      { measure: "mass", weight: 0.4 },
      { measure: "hide", weight: 0.6 },
    ],
    scale: 1.15,
    accuracy: 0.78,
    effort: 3,
  },

  // --- hold --------------------------------------------------------------
  {
    id: "bite",
    name: "Bite",
    flavour: "Takes hold of something and declines to let go of it.",
    damage: "grip",
    // Eight centimetres, not four. At four every animal on the roster qualified,
    // which made Bite an abstract stat wearing a move's name. A gape a player
    // has to breed for is a gate; a gape everything already has is not.
    requires: [{ kind: "atLeast", measure: "gape", value: 8 }],
    power: [
      { measure: "gape", weight: 0.55 },
      { measure: "mass", weight: 0.45 },
    ],
    resistedBy: [{ measure: "hide", weight: 1 }],
    scale: 1.05,
    accuracy: 0.9,
    effort: 2,
  },
  {
    id: "constrict",
    name: "Constrict",
    flavour: "Lands two coils and then simply waits, tightening on the exhale.",
    damage: "grip",
    requires: [
      { kind: "atMost", measure: "limbs", value: 0 },
      { kind: "atLeast", measure: "length", value: 120 },
    ],
    power: [
      { measure: "length", weight: 0.55 },
      { measure: "mass", weight: 0.45 },
    ],
    // Crushing does not care how thick the skin is — only how much animal is
    // inside it pushing back.
    resistedBy: [{ measure: "mass", weight: 1 }],
    scale: 1.3,
    accuracy: 0.82,
    effort: 4,
  },
  {
    id: "pin",
    name: "Pin",
    flavour: "Puts a limb on it and keeps it there. Nothing moves for a while.",
    damage: "grip",
    requires: [{ kind: "atLeast", measure: "limbs", value: 4 }],
    power: [
      { measure: "mass", weight: 0.45 },
      { measure: "stature", weight: 0.3 },
      { measure: "gape", weight: 0.25 },
    ],
    resistedBy: [
      { measure: "mass", weight: 0.7 },
      { measure: "stride", weight: 0.3 },
    ],
    scale: 0.85,
    accuracy: 0.86,
    effort: 2,
  },

  // --- chemistry ---------------------------------------------------------
  {
    id: "venom-spur",
    name: "Venom Spur",
    flavour: "A scratch, and then several seconds during which nothing seems wrong.",
    damage: "toxin",
    requires: [{ kind: "atLeast", measure: "venom", value: 1 }],
    power: [
      { measure: "venom", weight: 0.75 },
      { measure: "acuity", weight: 0.25 },
    ],
    // A big animal simply has more blood to dilute it in.
    resistedBy: [{ measure: "mass", weight: 1 }],
    scale: 1.15,
    accuracy: 0.9,
    effort: 3,
  },

  // --- nerve -------------------------------------------------------------
  {
    id: "startle",
    name: "Startle",
    flavour: "Everything it has goes up at once and it becomes twice the animal.",
    damage: "display",
    requires: [{ kind: "atLeast", measure: "display", value: 8 }],
    power: [
      { measure: "display", weight: 0.6 },
      { measure: "stature", weight: 0.4 },
    ],
    resistedBy: [{ measure: "acuity", weight: 1 }],
    scale: 0.7,
    accuracy: 0.95,
    effort: 1,
  },
  {
    id: "dazzle",
    name: "Dazzle",
    flavour: "Lights up. Whatever was about to happen does not.",
    damage: "display",
    requires: [{ kind: "atLeast", measure: "display", value: 4 }],
    power: [
      { measure: "acuity", weight: 0.5 },
      { measure: "display", weight: 0.5 },
    ],
    resistedBy: [{ measure: "acuity", weight: 1 }],
    scale: 0.6,
    accuracy: 1,
    effort: 1,
  },

  // --- distance ----------------------------------------------------------
  {
    id: "glide",
    name: "Break Away",
    flavour: "Opens the membrane and is briefly somewhere else.",
    damage: "display",
    requires: [{ kind: "atLeast", measure: "span", value: 20 }],
    power: [
      { measure: "span", weight: 0.6 },
      { measure: "stride", weight: 0.4 },
    ],
    resistedBy: [{ measure: "acuity", weight: 1 }],
    scale: 0.55,
    accuracy: 1,
    effort: 1,
  },
];

export function moveById(id: string): Move | undefined {
  return MOVES.find((move) => move.id === id);
}

// ---------------------------------------------------------------------------
// Reading a move against an animal
// ---------------------------------------------------------------------------

function valueOf(morphology: Morphology, measure: MeasureId): number {
  return morphology[measure];
}

/** Whether this animal's body allows this move at all. */
export function canPerform(move: Move, morphology: Morphology): boolean {
  return move.requires.every((requirement) => {
    switch (requirement.kind) {
      case "atLeast":
        return valueOf(morphology, requirement.measure) >= requirement.value;
      case "atMost":
        return valueOf(morphology, requirement.measure) <= requirement.value;
      case "armament":
        return requirement.any.includes(morphology.armamentKind);
      case "tail":
        return requirement.any.includes(morphology.tailKind);
    }
  });
}

/**
 * Everything this animal can do, hardest first.
 *
 * A creature with no qualifying anatomy still gets `flail`, because a fight in
 * which one side cannot act is not a fight — but it is deliberately feeble, and
 * seeing it is how a player learns they have bred an animal with no weapons.
 */
export const FLAIL: Move = {
  id: "flail",
  name: "Flail",
  flavour: "Has nothing to fight with, and does it anyway.",
  damage: "blunt",
  requires: [],
  power: [
    { measure: "mass", weight: 0.5 },
    { measure: "stride", weight: 0.5 },
  ],
  resistedBy: [{ measure: "hide", weight: 1 }],
  scale: 0.45,
  accuracy: 0.85,
  effort: 1,
};

export function movesFor(morphology: Morphology, species: SpeciesId): readonly Move[] {
  const available = MOVES.filter((move) => canPerform(move, morphology));
  if (available.length === 0) return [FLAIL];
  // Ranked by what the move actually lands, scale included. Ranking on the raw
  // measurement sum put Bite above Constrict on a Silt-Adder — a big-jawed
  // animal preferring the weaker of its two holds, which is not what the
  // numbers say once the move's own weight is in them.
  const worth = (move: Move): number => movePower(move, morphology, species) * move.scale;
  return [...available].sort((a, b) => worth(b) - worth(a));
}

/**
 * What a move is worth on this animal, 0-1 before scale.
 *
 * Normalised against what the *species* can reach, so a Sallowfinch's six
 * kilograms and a Bramblehog's ninety are both readable as "how much mass, for
 * one of these".
 */
export function movePower(move: Move, morphology: Morphology, species: SpeciesId): number {
  return move.power.reduce(
    (sum, term) => sum + normaliseMeasure(term.measure, valueOf(morphology, term.measure), species) * term.weight,
    0,
  );
}

export function moveResistance(move: Move, morphology: Morphology, species: SpeciesId): number {
  return move.resistedBy.reduce(
    (sum, term) => sum + normaliseMeasure(term.measure, valueOf(morphology, term.measure), species) * term.weight,
    0,
  );
}

/**
 * The damage one animal's move does to another, before the dice.
 *
 * Resistance halves at most. A defender who could reduce a strike to nothing
 * would end every fight in a draw, and a fight nobody can win teaches the
 * player nothing about either lineage.
 */
export function strikeDamage(
  move: Move,
  attacker: { readonly morphology: Morphology; readonly species: SpeciesId },
  defender: { readonly morphology: Morphology; readonly species: SpeciesId },
): number {
  const power = movePower(move, attacker.morphology, attacker.species) * move.scale;
  const resistance = moveResistance(move, defender.morphology, defender.species);
  const matchup = HIDE_MATCHUP[move.damage][defender.morphology.hideKind];
  return Math.max(0, power * (1 - resistance * 0.5) * matchup);
}
