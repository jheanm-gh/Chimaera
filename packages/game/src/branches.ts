/**
 * Evolution branches for all six species (§2.3).
 *
 * Three to five per species, and at least one per species that needs a specific
 * rare genotype *and* a specific raising path — the branch worth a wiki page.
 *
 * The last branch of each list has no conditions: a creature that meets nothing
 * still becomes something, because "your animal grew up into nothing" is not an
 * outcome any game should ship.
 */

import type { EvolutionBranch } from "./content.js";

const QUILLFEN: readonly EvolutionBranch[] = [
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
    blurb: "Warm-water stock. The gills shorten, the hide thickens, and it will sit in water that would kill its siblings.",
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

const SALLOWFINCH: readonly EvolutionBranch[] = [
  {
    id: "nine-note",
    name: "Nine-Note",
    blurb:
      "A cock that sings a nine-phrase song no other Sallowfinch has been recorded singing. Wild hens cross a valley for it.",
    secret: true,
    hint: "It has started repeating something it did not learn from its parents.",
    conditions: [
      { label: "bright plumage", test: (c) => c.traits.plumage === "bright" },
      { label: "focus at its ceiling", test: (c) => (c.achievement.focus ?? 0) >= 0.85 },
      { label: "very deeply bonded", test: (c) => c.bond >= 85 },
      { label: "drilled in stillness", test: (c) => c.training === "stillness" },
      { label: "raised on nectar", test: (c) => c.diet === "bloom" },
    ],
  },
  {
    id: "thorn-picker",
    name: "Thorn-Picker",
    blurb: "The hooked beak wins. It works the thorn scrub for grubs and takes anything smaller than itself.",
    hint: "It has learned to open things it should not be able to open.",
    conditions: [
      { label: "hooked beak", test: (c) => c.traits.beak === "hooked" || c.traits.beak === "sabre" },
      { label: "fed on carrion", test: (c) => c.diet === "carrion" },
    ],
  },
  {
    id: "wold-runner",
    name: "Wold-Runner",
    blurb: "Barely flies at all any more. It runs the seed rows at a speed that startles people.",
    hint: "It has stopped bothering with the air.",
    conditions: [
      { label: "speed well developed", test: (c) => (c.achievement.speed ?? 0) >= 0.7 },
      { label: "trained for sprint work", test: (c) => c.training === "sprint" },
      { label: "raised in the shallows", test: (c) => c.habitat === "reedbank" },
    ],
  },
  {
    id: "hen-quiet",
    name: "Hen-Quiet",
    blurb: "Dull, silent, and almost impossible to find. Half the wild population, and the half that survives.",
    hint: "It has gone quiet, and it is not ill.",
    // "Not bright" on its own was true of every hen and most cocks, which made
    // the floor branch below unreachable — five authored forms, four that could
    // ever appear. A branch needs something positive to ask for.
    conditions: [
      { label: "hen-feathered", test: (c) => c.traits.plumage !== "bright" },
      { label: "raised in the wold", test: (c) => c.habitat === "reedwold" },
      { label: "settled", test: (c) => c.bond >= 50 },
    ],
  },
  {
    id: "seedwarden",
    name: "Seedwarden",
    blurb: "The common adult form. Loud, greedy and reliable.",
    hint: "Growing up much as its parents did.",
    conditions: [],
  },
];

const BRAMBLEHOG: readonly EvolutionBranch[] = [
  {
    id: "chalk-anchor",
    name: "Chalk Anchor",
    blurb:
      "Plate over plate over plate, fused. It has not moved from its patch of chalk in a season and nothing has made it.",
    secret: true,
    hint: "It has stopped going anywhere, and something about that seems deliberate.",
    conditions: [
      { label: "dense spines", test: (c) => c.build >= 0.8 },
      { label: "lapped plate", test: (c) => c.traits.plate === "lapped" },
      { label: "vigour at its ceiling", test: (c) => (c.achievement.vigour ?? 0) >= 0.85 },
      { label: "fed on silt", test: (c) => c.diet === "silt" },
      { label: "trained for endurance", test: (c) => c.training === "endurance" },
    ],
  },
  {
    id: "ember-basker",
    name: "Ember Basker",
    blurb: "Sits in the hot springs until its plate ticks as it cools. Warm to the touch for hours afterwards.",
    hint: "It has found the warmest stone and will not be moved off it.",
    conditions: [
      { label: "ember affinity", test: (c) => c.affinities.includes("ember") },
      { label: "raised in the emberpool", test: (c) => c.habitat === "emberpool" },
    ],
  },
  {
    id: "bramble-runner",
    name: "Bramble-Runner",
    blurb: "Sparse-spined, light and quick through the tunnels. The other hogs do not approve.",
    hint: "It is much faster than a hog should be, and much less armoured.",
    conditions: [
      { label: "sparse spines", test: (c) => c.build <= 0.3 },
      { label: "speed developed", test: (c) => (c.achievement.speed ?? 0) >= 0.6 },
      { label: "trained for sprint work", test: (c) => c.training === "sprint" },
    ],
  },
  {
    id: "brakewarden",
    name: "Brakewarden",
    blurb: "The common adult form. Unhurried, unbothered, and covered in spines.",
    hint: "Growing up much as its parents did.",
    conditions: [],
  },
];

const KITE_OSSEL: readonly EvolutionBranch[] = [
  {
    id: "stormrider",
    name: "Stormrider",
    blurb:
      "It goes up in weather that grounds everything else, and comes down somewhere nobody expected. Nothing else on the coast does this.",
    secret: true,
    hint: "It watches the weather the way other animals watch food.",
    conditions: [
      { label: "gale affinity", test: (c) => c.affinities.includes("gale") },
      { label: "broad membrane", test: (c) => c.build >= 0.8 },
      { label: "speed at its ceiling", test: (c) => (c.achievement.speed ?? 0) >= 0.85 },
      { label: "raised on the galeshore", test: (c) => c.habitat === "galeshore" },
      { label: "holding a prism lens", test: (c) => c.heldItem === "prism-lens" },
    ],
  },
  {
    id: "cliff-hanger",
    name: "Cliff-Hanger",
    blurb: "Hooked feet, heavy shoulders. It barely glides at all and can hang from anything.",
    hint: "It has stopped launching and started climbing.",
    conditions: [
      { label: "hooked clasp", test: (c) => c.traits.clasp === "hooked" },
      { label: "vigour developed", test: (c) => (c.achievement.vigour ?? 0) >= 0.6 },
      { label: "trained for endurance", test: (c) => c.training === "endurance" },
    ],
  },
  {
    id: "shore-walker",
    name: "Shore-Walker",
    blurb: "The wingless morph, grown up. It walks the tideline, and it is entirely content.",
    hint: "It has made its peace with the ground.",
    conditions: [{ label: "wingless", test: (c) => c.traits.membrane === "wingless" }],
  },
  {
    id: "updraught",
    name: "Updraught",
    blurb: "The common adult form. Spends the morning aloft and the afternoon asleep.",
    hint: "Growing up much as its parents did.",
    conditions: [],
  },
];

const SILT_ADDER: readonly EvolutionBranch[] = [
  {
    id: "deepbinder",
    name: "Deepbinder",
    blurb:
      "Long past the length any adder should reach, and its venom has become something the fen-keepers keep in a locked case.",
    secret: true,
    hint: "It is longer than it was last season, and it was already long.",
    conditions: [
      { label: "potent venom", test: (c) => c.traits.venom === "potent" },
      { label: "very long", test: (c) => c.build >= 0.85 },
      { label: "focus at its ceiling", test: (c) => (c.achievement.focus ?? 0) >= 0.85 },
      { label: "raised in the deep fen", test: (c) => c.habitat === "deepfen" },
      { label: "drilled in stillness", test: (c) => c.training === "stillness" },
    ],
  },
  {
    id: "silt-lurker",
    name: "Silt-Lurker",
    blurb: "Smooth-skinned, colourless, and impossible to see against the bottom. It waits.",
    hint: "You keep losing track of where it is in the tank.",
    conditions: [
      { label: "smooth-skinned", test: (c) => c.traits.scale === "smooth" },
      { label: "raised in the deep fen", test: (c) => c.habitat === "deepfen" },
    ],
  },
  {
    id: "channel-racer",
    name: "Channel-Racer",
    blurb: "It has given up ambush entirely and simply outruns things in open water.",
    hint: "It has stopped waiting for anything.",
    conditions: [
      { label: "speed at its ceiling", test: (c) => (c.achievement.speed ?? 0) >= 0.75 },
      { label: "trained for sprint work", test: (c) => c.training === "sprint" },
    ],
  },
  {
    id: "fenlurk",
    name: "Fenlurk",
    blurb: "The common adult form. Patient, cold, and never quite where you left it.",
    hint: "Growing up much as its parents did.",
    conditions: [],
  },
];

const ASHEN_LORRIC: readonly EvolutionBranch[] = [
  {
    id: "ash-keeper",
    name: "Ash-Keeper",
    blurb:
      "Ashen, enormously long-limbed, and it has begun moving stones into arrangements. Nobody has established why.",
    secret: true,
    hint: "It has started putting things where it wants them.",
    conditions: [
      { label: "ashen", test: (c) => c.traits.ash === "ashen" },
      { label: "long-limbed", test: (c) => c.build >= 0.8 },
      { label: "focus at its ceiling", test: (c) => (c.achievement.focus ?? 0) >= 0.85 },
      { label: "very deeply bonded", test: (c) => c.bond >= 85 },
      { label: "raised in the emberpool", test: (c) => c.habitat === "emberpool" },
    ],
  },
  {
    id: "stone-grip",
    name: "Stone-Grip",
    blurb: "Barbed and padded hands together. It goes up sheer rock at the pace of a slow walk and never falls.",
    hint: "Its hands have changed, and they were already strange.",
    conditions: [
      { label: "hooked or barbed grip", test: (c) => /hooks|barbs/.test(c.traits.grip ?? "") },
      { label: "vigour developed", test: (c) => (c.achievement.vigour ?? 0) >= 0.7 },
      { label: "trained for endurance", test: (c) => c.training === "endurance" },
    ],
  },
  {
    id: "long-quiet",
    name: "Long-Quiet",
    blurb: "It has slowed down further. It will outlive everything else on the ranch, including possibly the ranch.",
    hint: "It has stopped being in a hurry about anything at all.",
    conditions: [
      { label: "fasted", test: (c) => c.diet === "fasting" },
      { label: "focus developed", test: (c) => (c.achievement.focus ?? 0) >= 0.6 },
    ],
  },
  {
    id: "rockwarden",
    name: "Rockwarden",
    blurb: "The common adult form. Slow, deliberate, and entirely unhurried by anyone.",
    hint: "Growing up much as its parents did.",
    conditions: [],
  },
];

export const BRANCHES_BY_SPECIES: Readonly<Record<string, readonly EvolutionBranch[]>> = {
  quillfen: QUILLFEN,
  sallowfinch: SALLOWFINCH,
  bramblehog: BRAMBLEHOG,
  kiteossel: KITE_OSSEL,
  siltadder: SILT_ADDER,
  ashenlorric: ASHEN_LORRIC,
};
