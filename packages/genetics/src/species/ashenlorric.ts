/**
 * ASHEN LORRIC — the climber, and the late-game project.
 *
 *   Inspiration : a tree frog's hands on a sloth's tempo.
 *   Hook        : does everything slowly and correctly, and cannot be hurried.
 *   Biome       : Ashlands — warm rock, thin soil, standing heat.
 *   Silhouette  : upright, long-limbed, huge-handed; a shape hanging.
 *
 * Signature problem: **a two-stage pigment cascade.** The gate at ASH does not
 * hide colour on its own; it hides the *second* switch, and only when both are
 * recessive does the animal go ashen. Players who solved the Quillfen's single
 * switch by test-crossing will find that the same method gives a contradictory
 * answer here, which is the point: this is the species that teaches you the
 * first lesson was a special case.
 *
 * Stat archetype: balanced and high, with a long life. It is also the slowest
 * to raise, so its ceilings are only reachable by a patient breeder.
 */

import type { SpeciesDef } from "../types.js";
import { blend, dominant, lethal, marking, novelAllele, polySet } from "./kit.js";

export const ASHEN_LORRIC: SpeciesDef = {
  id: "ashenlorric",
  name: "Ashen Lorric",
  inspiration: "Tree frog's grasping hands at the tempo of a sloth",
  hook: "Does everything slowly and correctly, and cannot be hurried by anyone.",
  biome: "Ashlands",

  chromosomes: [
    { id: "H", name: "Hand", type: "autosome", lengthCm: 88 },
    { id: "C", name: "Coat", type: "autosome", lengthCm: 72 },
    { id: "E", name: "Ember", type: "autosome", lengthCm: 58 },
    { id: "S", name: "Sinew", type: "sex", lengthCm: 52 },
  ],
  sexChromosome: "S",

  loci: [
    // --- H: limbs ----------------------------------------------------------
    {
      id: "GRIP",
      name: "Grip",
      chromosome: "H",
      position: 7,
      mode: { kind: "codominance" },
      trait: "grip",
      alleles: [
        marking("Gp_pad", "Padded", "pads", 0.36),
        marking("Gp_hook", "Hooked", "hooks", 0.32),
        marking("Gp_plain", "Plain", null, 0.32),
        novelAllele("Gp_barbed", "Barbed", { mark: "barbs" }),
      ],
    },
    {
      id: "LIMB",
      name: "Limb length",
      chromosome: "H",
      position: 24,
      mode: { kind: "incomplete_dominance" },
      trait: "limbs",
      alleles: [
        blend("Lm_long", "Long", 1, 0.3),
        blend("Lm_even", "Even", 0.5, 0.38),
        blend("Lm_short", "Short", 0, 0.32),
      ],
    },
    {
      /**
       * The one locus on this animal that behaves the way a beginner expects.
       *
       * Everything else the Ashen Lorric carries is gated, lethal or blended,
       * which made it the only species with no plain Mendelian locus at all —
       * and therefore the only one on which the campaign's first lesson could
       * not be taught. A late-game species is allowed to be hard; it is not
       * allowed to have no shallow end.
       */
      id: "TOE",
      name: "Toe form",
      chromosome: "H",
      position: 36,
      mode: { kind: "dominance" },
      trait: "toes",
      alleles: [
        dominant("To_splayed", "Splayed", "splayed", 1, 0.62),
        dominant("To_fused", "Fused", "fused", 0, 0.38),
      ],
    },
    {
      id: "VIG_A",
      name: "Constitution (major)",
      chromosome: "H",
      position: 48,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VA", ["Deep", "Sound", "Slight"], [0.15, 0.44, 0.41]),
    },
    {
      id: "EMBERHEART",
      name: "Ember heart",
      chromosome: "H",
      position: 52,
      mode: { kind: "dominance" },
      trait: "heart",
      alleles: [
        lethal("EH_star", "Ember-hearted", "ember-hearted", 0.05, "Doubled ember-heart burns through the yolk before the animal can use it."),
        dominant("EH_wild", "Even-hearted", "even", 0, 0.95),
      ],
    },
    {
      id: "FOC_A",
      name: "Attention (major)",
      chromosome: "H",
      position: 76,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FA", ["Absolute", "Steady", "Adrift"], [0.16, 0.44, 0.4]),
    },

    // --- C: colour, and the second switch ----------------------------------
    {
      id: "HUE",
      name: "Hue",
      chromosome: "C",
      position: 9,
      mode: { kind: "incomplete_dominance" },
      trait: "hue",
      tags: ["pigment"],
      alleles: [
        blend("H_moss", "Moss", 0, 0.3),
        blend("H_clay", "Clay", 0.36, 0.28),
        blend("H_coal", "Coal", 0.7, 0.24),
        blend("H_bloom", "Bloom", 1, 0.18),
        novelAllele("H_opal", "Opal", { value: 0.55 }),
      ],
    },
    {
      id: "SAT",
      name: "Saturation",
      chromosome: "C",
      position: 25,
      mode: { kind: "incomplete_dominance" },
      trait: "saturation",
      tags: ["pigment"],
      alleles: [blend("S_matte", "Matte", 0, 0.4), blend("S_clear", "Clear", 0.5, 0.35), blend("S_deep", "Deep", 1, 0.25)],
    },
    {
      id: "STONELUNG",
      name: "Stone lung",
      chromosome: "C",
      position: 38,
      mode: { kind: "dominance" },
      trait: "lung",
      alleles: [
        lethal("SL_star", "Stone-lunged", "stone-lunged", 0.05, "Doubled stone-lung leaves the hatchling unable to draw the first breath in Ashlands air."),
        dominant("SL_wild", "Open", "open", 0, 0.95),
      ],
    },
    {
      id: "MARK",
      name: "Markings",
      chromosome: "C",
      position: 42,
      mode: { kind: "codominance" },
      trait: "markings",
      tags: ["pigment", "pattern"],
      alleles: [
        marking("Mv", "Veined", "veins", 0.34),
        marking("Ms", "Sooted", "soot", 0.3),
        marking("Mn", "Plain", null, 0.36),
        novelAllele("M_cinder", "Cindered", { mark: "cinders" }),
      ],
    },
    {
      id: "CASCADE",
      name: "Cascade switch",
      chromosome: "C",
      position: 62,
      mode: { kind: "dominance" },
      trait: "cascade",
      alleles: [dominant("Cs", "Carrying", "carrying", 1, 0.66), dominant("cs", "Broken", "broken", 0, 0.34)],
    },

    // --- E: the first switch, affinity, constitution -----------------------
    {
      id: "ASH",
      name: "Ash switch",
      chromosome: "E",
      position: 5,
      mode: { kind: "dominance" },
      trait: "ash",
      alleles: [dominant("As", "Sound", "sound", 1, 0.7), dominant("as", "Ashen", "ashen", 0, 0.3)],
    },
    {
      id: "VIG_B",
      name: "Constitution (minor)",
      chromosome: "E",
      position: 16,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VB", ["Deep reserve", "Reserve", "Shallow"], [0.15, 0.45, 0.4]),
    },
    {
      id: "SPD_A",
      name: "Reach (major)",
      chromosome: "E",
      position: 30,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SA", ["Long reach", "Reach", "Short reach"], [0.14, 0.43, 0.43]),
    },
    {
      id: "AFFIN",
      name: "Affinity",
      chromosome: "E",
      position: 46,
      mode: { kind: "codominance" },
      trait: "affinity",
      alleles: [
        marking("A_ember", "Ember", "ember", 0.5),
        marking("A_mire", "Mire", "mire", 0.26),
        marking("A_gale", "Gale", "gale", 0.24),
        novelAllele("A_umbral", "Umbral", { mark: "umbral" }),
      ],
    },

    // --- S -----------------------------------------------------------------
    {
      id: "THROAT",
      name: "Throat sac",
      chromosome: "S",
      position: 6,
      onlyOn: "Y",
      mode: { kind: "dominance" },
      trait: "throat",
      suppressedPhenotype: "none",
      alleles: [dominant("Th_full", "Full", "full", 1, 0.5), dominant("Th_slight", "Slight", "slight", 0, 0.5)],
    },
    {
      id: "COLLAR",
      name: "Collar",
      chromosome: "S",
      position: 18,
      onlyOn: "X",
      mode: { kind: "dominance" },
      trait: "collar",
      tags: ["pigment"],
      expressedInSex: "male",
      suppressedPhenotype: "hidden",
      alleles: [dominant("Co_broad", "Broad", "broad", 1, 0.3), dominant("Co_none", "None", "none", 0, 0.7)],
    },
    {
      id: "FOC_B",
      name: "Attention (minor)",
      chromosome: "S",
      position: 36,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FB", ["Held", "Steady", "Loose"], [0.16, 0.44, 0.4]),
    },
    {
      id: "SPD_B",
      name: "Reach (minor)",
      chromosome: "S",
      position: 46,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SB", ["Loose shoulder", "Shoulder", "Set shoulder"], [0.14, 0.43, 0.43]),
    },
    {
      id: "SPD_C",
      name: "Reach (trace)",
      chromosome: "H",
      position: 62,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SC", ["Loose wrist", "Wrist", "Set wrist"]),
    },
    {
      id: "VIG_C",
      name: "Constitution (trace)",
      chromosome: "C",
      position: 52,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VC", ["Thick hide", "Hide", "Thin hide"]),
    },
    {
      id: "FOC_C",
      name: "Attention (trace)",
      chromosome: "E",
      position: 38,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FC", ["Unhurried", "Steady", "Hurried"]),
    },
  ],

  polygenicTraits: [
    { id: "speed", name: "Speed", loci: ["SPD_A", "SPD_B", "SPD_C"], min: 22, max: 118 },
    { id: "vigour", name: "Vigour", loci: ["VIG_A", "VIG_B", "VIG_C"], min: 26, max: 142 },
    { id: "focus", name: "Focus", loci: ["FOC_A", "FOC_B", "FOC_C"], min: 26, max: 146 },
  ],

  epistasis: [
    {
      /**
       * Stage one: a broken cascade alone does nothing visible. It only matters
       * in an animal that is also `as/as`, which is what makes the usual
       * single-switch test cross give a contradictory answer here.
       */
      id: "ashen",
      name: "Ashen cascade",
      gate: "ASH",
      when: { kind: "homozygous", allele: "as" },
      also: [{ locus: "CASCADE", when: { kind: "homozygous", allele: "cs" } }],
      masksTags: ["pigment"],
      setTraits: { markings: "ashen", hue: "ashen", saturation: "ashen", collar: "ashen" },
      setColour: { h: 28, s: 0.04, l: 0.72 },
    },
  ],

  palette: {
    hue: [30, 300],
    saturation: [0.1, 0.66],
    lightness: [0.28, 0.66],
    hueLocus: "HUE",
    saturationLocus: "SAT",
    lightnessLocus: "LIMB",
  },

  wildCoupling: [
    {
      id: "emberheart-drag",
      note: "The deepest constitution allele in the Ashlands pool sits four centimorgans from ember-heart. The strongest Lorrics are carrying the thing that kills their clutches.",
      chromosome: "H",
      ifLocus: "VIG_A",
      ifAllele: "VA2",
      thenLocus: "EMBERHEART",
      thenAllele: "EH_star",
      coupling: 0.5,
    },
  ],
};
