/**
 * The six body plans (§6.5).
 *
 * Each is a silhouette family first and a set of numbers second. The comment on
 * each plan states the read it is aiming for; the silhouette test measures
 * whether it got there, pairwise, at 32x32. If two species drift close enough
 * to be confused, that test fails and the numbers here are what change.
 */

import { v } from "../geometry.js";
import type { BodyPlan } from "./plan.js";

/**
 * Long and low: a stroke lying on the water with a fan of gills at one end.
 *
 * Deep-bodied on purpose. The first pass drew it as flat as the Kite-Ossel and
 * the pairwise silhouette test caught them at 9% apart — two wide bars in the
 * Ranch grid. Trunk depth and a taller frond crown are what separates a fen
 * animal from a glider once colour is taken away.
 */
const QUILLFEN: BodyPlan = {
  species: "quillfen",
  posture: "horizontal",
  bodyRx: 46,
  bodyRyTop: [23, 32],
  bodyRyBottom: [27, 43],
  bodyBias: -0.16,
  bodyCentre: v(112, 88),
  headReach: 44,
  headThickness: [19, 24],
  headLift: 10,
  limbPairs: 2,
  limbReach: 32,
  limbThickness: 9,
  tailReach: 44,
  tailRoot: 18,
  tailLift: -4,
  crown: "fronds",
  crownReach: 42,
  crownCount: 3,
  traits: {
    build: "build",
    limbs: "limbs",
    tail: "tail",
    crown: "dorsal",
    markings: "markings",
    display: "crest",
    glow: "lantern",
    sheen: "sheen",
  },
};

/** Upright and round: a ball on legs with a big head and a plume. */
const SALLOWFINCH: BodyPlan = {
  species: "sallowfinch",
  posture: "upright",
  bodyRx: 30,
  bodyRyTop: [30, 40],
  bodyRyBottom: [30, 40],
  bodyBias: 0.1,
  bodyCentre: v(118, 82),
  headReach: 34,
  headThickness: [17, 21],
  headLift: 0,
  limbPairs: 1,
  limbReach: 34,
  limbThickness: 5,
  tailReach: 30,
  tailRoot: 11,
  tailLift: -14,
  crown: "plume",
  crownReach: 26,
  crownCount: 4,
  traits: {
    build: "build",
    limbs: "beak",
    tail: "tail",
    crown: "crest",
    markings: "markings",
    display: "plumage",
  },
};

/** A loaf with a snout: very wide, very low, and covered in spines. */
const BRAMBLEHOG: BodyPlan = {
  species: "bramblehog",
  posture: "horizontal",
  bodyRx: 46,
  bodyRyTop: [30, 40],
  bodyRyBottom: [26, 34],
  bodyBias: -0.05,
  bodyCentre: v(112, 92),
  headReach: 32,
  headThickness: [16, 20],
  headLift: 4,
  limbPairs: 2,
  limbReach: 16,
  limbThickness: 8,
  tailReach: 14,
  tailRoot: 8,
  tailLift: 4,
  crown: "spines",
  crownReach: 30,
  crownCount: 11,
  traits: {
    build: "spines",
    limbs: "snout",
    tail: "plate",
    crown: "spines",
    markings: "markings",
    display: "ruff",
  },
};

/** Very wide, very thin: a kite with a head. The membrane is the animal. */
const KITE_OSSEL: BodyPlan = {
  species: "kiteossel",
  posture: "spread",
  bodyRx: 28,
  bodyRyTop: [11, 15],
  bodyRyBottom: [11, 15],
  bodyBias: 0,
  bodyCentre: v(116, 76),
  headReach: 30,
  headThickness: [11, 14],
  headLift: 2,
  limbPairs: 2,
  // Long dangling limbs. They cost nothing in span and they are the one thing
  // a Silt-Adder can never have, which is what keeps the two strokes apart.
  limbReach: 32,
  limbThickness: 5,
  tailReach: 46,
  tailRoot: 8,
  tailLift: -2,
  crown: "membrane",
  crownReach: 66,
  crownCount: 1,
  traits: {
    build: "span",
    limbs: "clasp",
    tail: "tail",
    crown: "span",
    markings: "markings",
    display: "mask",
  },
};

/** One long stroke: no limbs, no trunk, and a blunt head at the end of it. */
const SILT_ADDER: BodyPlan = {
  species: "siltadder",
  posture: "serpentine",
  bodyRx: 78,
  // A wide range on purpose: coil thickness is one of only two shape levers a
  // limbless animal has, so it has to actually move the outline.
  bodyRyTop: [11, 25],
  bodyRyBottom: [11, 25],
  bodyBias: 0,
  bodyCentre: v(112, 96),
  headReach: 30,
  headThickness: [14, 18],
  headLift: 14,
  limbPairs: 0,
  limbReach: 0,
  limbThickness: 0,
  tailReach: 58,
  tailRoot: 12,
  tailLift: 6,
  crown: "none",
  crownReach: 0,
  crownCount: 0,
  traits: {
    build: "coils",
    tail: "tail",
    markings: "markings",
    display: "venom",
  },
};

/** Standing and long-limbed: a shape hanging, with hands too big for it. */
const ASHEN_LORRIC: BodyPlan = {
  species: "ashenlorric",
  posture: "upright",
  bodyRx: 26,
  bodyRyTop: [26, 34],
  bodyRyBottom: [26, 34],
  bodyBias: -0.06,
  bodyCentre: v(118, 74),
  headReach: 26,
  headThickness: [16, 19],
  headLift: 0,
  limbPairs: 2,
  limbReach: 46,
  limbThickness: 7,
  tailReach: 0,
  tailRoot: 0,
  tailLift: 0,
  crown: "plume",
  crownReach: 20,
  crownCount: 3,
  traits: {
    build: "limbs",
    limbs: "grip",
    crown: "collar",
    markings: "markings",
    display: "collar",
  },
};

export const BODY_PLANS: readonly BodyPlan[] = [
  QUILLFEN,
  SALLOWFINCH,
  BRAMBLEHOG,
  KITE_OSSEL,
  SILT_ADDER,
  ASHEN_LORRIC,
];

const BY_SPECIES = new Map(BODY_PLANS.map((plan) => [plan.species, plan]));

export function planFor(species: string): BodyPlan {
  const found = BY_SPECIES.get(species);
  if (!found) throw new Error(`no body plan for species "${species}"`);
  return found;
}

export function hasPlanFor(species: string): boolean {
  return BY_SPECIES.has(species);
}
