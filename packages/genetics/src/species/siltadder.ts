/**
 * SILT-ADDER — the one nobody breeds by accident.
 *
 *   Inspiration : a caecilian's body with a moray's head.
 *   Hook        : has never once been where you last saw it.
 *   Biome       : Deepfen — cold standing water, peat, no light.
 *   Silhouette  : serpentine, limbless, blunt-headed; a long stroke.
 *
 * Signature problem: **two lethals on the same chromosome, in repulsion.**
 * Knot and Clear sit eleven centimorgans apart, and wild stock carries them on
 * opposite haplotypes — so a wild adder is very often a double carrier that
 * looks perfectly healthy, and pairing two of them loses nearly half the
 * clutch. The fix is a test cross, not a lens.
 *
 * Stat archetype: high focus, high speed, no bulk at all.
 */

import type { SpeciesDef } from "../types.js";
import { blend, dominant, lethal, marking, novelAllele, polySet } from "./kit.js";

export const SILT_ADDER: SpeciesDef = {
  id: "siltadder",
  name: "Silt-Adder",
  inspiration: "Caecilian body carrying the blunt head of a moray",
  hook: "Has never once been where you last saw it.",
  biome: "Deepfen",

  chromosomes: [
    { id: "L", name: "Length", type: "autosome", lengthCm: 100 },
    { id: "G", name: "Gloss", type: "autosome", lengthCm: 70 },
    { id: "D", name: "Depth", type: "autosome", lengthCm: 45 },
    { id: "S", name: "Strand", type: "sex", lengthCm: 50 },
  ],
  sexChromosome: "S",

  loci: [
    // --- L: the body, and both lethals -------------------------------------
    {
      id: "COILS",
      name: "Coil count",
      chromosome: "L",
      position: 6,
      mode: { kind: "incomplete_dominance" },
      trait: "coils",
      alleles: [
        blend("Cl_long", "Long", 1, 0.28),
        blend("Cl_even", "Even", 0.5, 0.38),
        blend("Cl_stub", "Short", 0, 0.34),
        novelAllele("Cl_endless", "Endless", { value: 1.3 }),
      ],
    },
    {
      id: "KNOT",
      name: "Knot",
      chromosome: "L",
      position: 34,
      mode: { kind: "dominance" },
      trait: "knot",
      alleles: [
        lethal("KN_star", "Knotted", "knotted", 0.08, "Doubled knot leaves the embryo folded around itself, and it never straightens."),
        dominant("KN_wild", "Straight", "straight", 0, 0.92),
      ],
    },
    {
      id: "SPD_A",
      name: "Stroke (major)",
      chromosome: "L",
      position: 40,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SA", ["Whipping", "Even", "Sluggish"], [0.17, 0.44, 0.39]),
    },
    {
      id: "CLEARBLOOD",
      name: "Clear blood",
      chromosome: "L",
      position: 45,
      mode: { kind: "dominance" },
      trait: "blood",
      alleles: [
        lethal("CB_star", "Clear", "clear-blooded", 0.07, "Doubled clear-blood leaves the hatchling unable to carry oxygen in cold water."),
        dominant("CB_wild", "Dark", "dark", 0, 0.93),
      ],
    },
    {
      id: "FOC_A",
      name: "Attention (major)",
      chromosome: "L",
      position: 78,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FA", ["Unblinking", "Watchful", "Wandering"], [0.18, 0.44, 0.38]),
    },

    // --- G: colour ---------------------------------------------------------
    {
      id: "HUE",
      name: "Hue",
      chromosome: "G",
      position: 10,
      mode: { kind: "incomplete_dominance" },
      trait: "hue",
      tags: ["pigment"],
      alleles: [
        blend("H_peat", "Peat", 0, 0.36),
        blend("H_olive", "Olive", 0.34, 0.26),
        blend("H_wine", "Wine", 0.7, 0.22),
        blend("H_bone", "Bone", 1, 0.16),
        novelAllele("H_oil", "Oilslick", { value: 0.52 }),
      ],
    },
    {
      id: "SAT",
      name: "Saturation",
      chromosome: "G",
      position: 26,
      mode: { kind: "incomplete_dominance" },
      trait: "saturation",
      tags: ["pigment"],
      alleles: [blend("S_flat", "Flat", 0, 0.44), blend("S_clear", "Clear", 0.5, 0.33), blend("S_deep", "Deep", 1, 0.23)],
    },
    {
      id: "MARK",
      name: "Banding",
      chromosome: "G",
      position: 44,
      mode: { kind: "codominance" },
      trait: "markings",
      tags: ["pigment", "pattern"],
      alleles: [
        marking("Mr", "Ringed", "rings", 0.34),
        marking("Md", "Diamond", "diamonds", 0.3),
        marking("Mn", "Unbanded", null, 0.36),
        novelAllele("M_thread", "Threaded", { mark: "thread" }),
      ],
    },
    {
      id: "AFFIN",
      name: "Affinity",
      chromosome: "G",
      position: 60,
      mode: { kind: "codominance" },
      trait: "affinity",
      alleles: [
        marking("A_mire", "Mire", "mire", 0.5),
        marking("A_gale", "Gale", "gale", 0.26),
        marking("A_ember", "Ember", "ember", 0.24),
        novelAllele("A_umbral", "Umbral", { mark: "umbral" }),
      ],
    },

    // --- D: the scale switch and constitution ------------------------------
    {
      id: "SCALE",
      name: "Scale switch",
      chromosome: "D",
      position: 4,
      mode: { kind: "dominance" },
      trait: "scale",
      alleles: [dominant("Sc", "Functional", "scaled", 1, 0.78), dominant("sc", "Null", "smooth", 0, 0.22)],
    },
    {
      id: "VIG_A",
      name: "Constitution (major)",
      chromosome: "D",
      position: 14,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VA", ["Corded", "Sound", "Thin"], [0.12, 0.42, 0.46]),
    },
    {
      id: "VIG_B",
      name: "Constitution (minor)",
      chromosome: "D",
      position: 26,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VB", ["Deep reserve", "Reserve", "Shallow"], [0.11, 0.42, 0.47]),
    },
    {
      id: "HEAD",
      name: "Head form",
      chromosome: "D",
      position: 38,
      mode: { kind: "dominance" },
      trait: "head",
      alleles: [
        dominant("Hd_blunt", "Blunt", "blunt", 2, 0.34),
        dominant("Hd_wedge", "Wedge", "wedge", 1, 0.36),
        dominant("Hd_fine", "Fine", "fine", 0, 0.3),
      ],
    },

    // --- S -----------------------------------------------------------------
    {
      id: "CLASPER",
      name: "Clasper",
      chromosome: "S",
      position: 5,
      onlyOn: "Y",
      mode: { kind: "dominance" },
      trait: "clasper",
      suppressedPhenotype: "none",
      alleles: [dominant("Cp_paired", "Paired", "paired", 1, 0.5), dominant("Cp_single", "Single", "single", 0, 0.5)],
    },
    {
      id: "VENOM",
      name: "Venom",
      chromosome: "S",
      position: 15,
      onlyOn: "X",
      mode: { kind: "dominance" },
      trait: "venom",
      expressedInSex: "female",
      suppressedPhenotype: "hidden",
      alleles: [
        dominant("Vn_potent", "Potent", "potent", 2, 0.2),
        dominant("Vn_mild", "Mild", "mild", 1, 0.38),
        dominant("Vn_none", "Dry", "dry", 0, 0.42),
      ],
    },
    {
      id: "FOC_B",
      name: "Attention (minor)",
      chromosome: "S",
      position: 32,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FB", ["Held", "Steady", "Loose"], [0.16, 0.44, 0.4]),
    },
    {
      id: "SPD_B",
      name: "Stroke (minor)",
      chromosome: "S",
      position: 44,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SB", ["Loose spine", "Spine", "Stiff spine"], [0.16, 0.44, 0.4]),
    },
    {
      id: "SPD_C",
      name: "Stroke (trace)",
      chromosome: "G",
      position: 34,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SC", ["Slick", "Even", "Dragging"]),
    },
    {
      /**
       * The one form gene on a limbless animal.
       *
       * Without it a Silt-Adder's whole range collapsed to a single icon — the
       * pairwise silhouette sweep measured 5% between its most and least
       * extreme wild draws — because coil thickness was the only shape lever it
       * had and cropping normalises thickness away. A species with no form
       * genetics has nothing to breed *for* beyond colour.
       */
      id: "TAILTIP",
      name: "Tail tip",
      chromosome: "L",
      position: 90,
      mode: { kind: "dominance" },
      trait: "tail",
      alleles: [
        dominant("Tt_broad", "Broad", "broad", 2, 0.3),
        dominant("Tt_whip", "Whip", "whip", 1, 0.38),
        dominant("Tt_stub", "Stub", "stub", 0, 0.32),
      ],
    },
    {
      id: "VIG_C",
      name: "Constitution (trace)",
      chromosome: "L",
      position: 60,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VC", ["Dense muscle", "Muscle", "Slack"]),
    },
    {
      id: "FOC_C",
      name: "Attention (trace)",
      chromosome: "D",
      position: 20,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FC", ["Cold patience", "Patience", "Restless"]),
    },
  ],

  polygenicTraits: [
    { id: "speed", name: "Speed", loci: ["SPD_A", "SPD_B", "SPD_C"], min: 35, max: 155 },
    { id: "vigour", name: "Vigour", loci: ["VIG_A", "VIG_B", "VIG_C"], min: 10, max: 74 },
    { id: "focus", name: "Focus", loci: ["FOC_A", "FOC_B", "FOC_C"], min: 30, max: 150 },
  ],

  epistasis: [
    {
      id: "smoothskin",
      name: "Smooth-skin morph",
      gate: "SCALE",
      when: { kind: "homozygous", allele: "sc" },
      masksTags: ["pigment"],
      setTraits: { markings: "smooth", hue: "smooth", saturation: "smooth" },
      setColour: { h: 40, s: 0.05, l: 0.86 },
    },
  ],

  palette: {
    hue: [60, 350],
    saturation: [0.06, 0.58],
    lightness: [0.24, 0.6],
    hueLocus: "HUE",
    saturationLocus: "SAT",
    lightnessLocus: "COILS",
  },

  wildCoupling: [
    {
      id: "knot-clear-repulsion",
      note: "Deepfen adders carry knot and clear-blood on opposite haplotypes. A wild adder is very often a double carrier that looks perfectly well, and two of them lose nearly half a clutch.",
      chromosome: "L",
      ifLocus: "KNOT",
      ifAllele: "KN_star",
      thenLocus: "CLEARBLOOD",
      thenAllele: "CB_wild",
      coupling: 0.85,
    },
  ],
};
