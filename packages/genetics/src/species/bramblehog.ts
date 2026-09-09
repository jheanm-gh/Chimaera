/**
 * BRAMBLEHOG — starter trio, the one that survives.
 *
 *   Inspiration : a hedgehog wearing a pangolin's overlapping plate.
 *   Hook        : entirely certain it is winning, at all times.
 *   Biome       : Thornbrake — dry scrub, bramble tunnels, chalk.
 *   Silhouette  : round, low, spined; a loaf with a snout.
 *
 * Signature problem: **the spine locus is incompletely dominant and gated.**
 * Spine density blends, so a breeder can dial it — but a keratin switch on
 * another chromosome can hide the whole result, and the two lethals both sit in
 * the armour. A player learns here that a blended trait is not a safe trait.
 *
 * Stat archetype: enormous vigour, dismal speed. It does not need to be fast.
 */

import type { SpeciesDef } from "../types.js";
import { blend, dominant, lethal, marking, novelAllele, polySet } from "./kit.js";

export const BRAMBLEHOG: SpeciesDef = {
  id: "bramblehog",
  name: "Bramblehog",
  inspiration: "Hedgehog build under a pangolin's overlapping plate",
  hook: "Entirely certain it is winning, at all times, regardless of evidence.",
  biome: "Thornbrake",

  chromosomes: [
    { id: "P", name: "Plate", type: "autosome", lengthCm: 85 },
    { id: "R", name: "Rind", type: "autosome", lengthCm: 65 },
    { id: "M", name: "Marrow", type: "autosome", lengthCm: 60 },
    { id: "S", name: "Setline", type: "sex", lengthCm: 45 },
  ],
  sexChromosome: "S",

  loci: [
    // --- P: armour ---------------------------------------------------------
    {
      id: "SPINE",
      name: "Spine density",
      chromosome: "P",
      position: 8,
      mode: { kind: "incomplete_dominance" },
      trait: "spines",
      tags: ["keratin"],
      alleles: [
        blend("Sd_dense", "Dense", 1, 0.26),
        blend("Sd_even", "Even", 0.5, 0.38),
        blend("Sd_sparse", "Sparse", 0, 0.36),
        novelAllele("Sd_thicket", "Thicket", { value: 1.35 }),
      ],
    },
    {
      id: "VIG_A",
      name: "Constitution (major)",
      chromosome: "P",
      position: 30,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VA", ["Boar-built", "Sound", "Slight"], [0.18, 0.44, 0.38]),
    },
    {
      id: "GLASSPINE",
      name: "Glass spine",
      chromosome: "P",
      position: 33,
      mode: { kind: "dominance" },
      trait: "spineQuality",
      tags: ["keratin"],
      alleles: [
        lethal("GS_star", "Glass", "glassy", 0.06, "Doubled glass-spine leaves the kit with no plate at all, and it does not last the night."),
        dominant("GS_wild", "Horn", "horn", 0, 0.94),
      ],
    },
    {
      id: "PLATE",
      name: "Plate form",
      chromosome: "P",
      position: 58,
      mode: { kind: "dominance" },
      trait: "plate",
      tags: ["keratin"],
      alleles: [
        dominant("Pl_lapped", "Lapped", "lapped", 2, 0.28),
        dominant("Pl_banded", "Banded", "banded", 1, 0.4),
        dominant("Pl_smooth", "Smooth", "smooth", 0, 0.32),
      ],
    },
    {
      id: "FOC_A",
      name: "Attention (major)",
      chromosome: "P",
      position: 76,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FA", ["Patient", "Even", "Blunt"], [0.12, 0.42, 0.46]),
    },

    // --- R: colour ---------------------------------------------------------
    {
      id: "HUE",
      name: "Hue",
      chromosome: "R",
      position: 9,
      mode: { kind: "incomplete_dominance" },
      trait: "hue",
      tags: ["pigment"],
      alleles: [
        blend("H_bark", "Bark", 0, 0.34),
        blend("H_chalk", "Chalk", 0.36, 0.26),
        blend("H_rust", "Rust", 0.7, 0.24),
        blend("H_bramble", "Bramble", 1, 0.16),
        novelAllele("H_frost", "Frost", { value: 0.5 }),
      ],
    },
    {
      id: "SAT",
      name: "Saturation",
      chromosome: "R",
      position: 24,
      mode: { kind: "incomplete_dominance" },
      trait: "saturation",
      tags: ["pigment"],
      alleles: [blend("S_dust", "Dusty", 0, 0.44), blend("S_clear", "Clear", 0.5, 0.34), blend("S_deep", "Deep", 1, 0.22)],
    },
    {
      id: "MARK",
      name: "Markings",
      chromosome: "R",
      position: 41,
      mode: { kind: "codominance" },
      trait: "markings",
      tags: ["pigment", "pattern"],
      alleles: [
        marking("Mt", "Ticked", "ticks", 0.36),
        marking("Mm", "Masked", "mask", 0.28),
        marking("Mn", "Plain", null, 0.36),
        novelAllele("M_lattice", "Lattice", { mark: "lattice" }),
      ],
    },
    {
      id: "AFFIN",
      name: "Affinity",
      chromosome: "R",
      position: 56,
      mode: { kind: "codominance" },
      trait: "affinity",
      alleles: [
        marking("A_ember", "Ember", "ember", 0.42),
        marking("A_mire", "Mire", "mire", 0.32),
        marking("A_gale", "Gale", "gale", 0.26),
        novelAllele("A_umbral", "Umbral", { mark: "umbral" }),
      ],
    },

    // --- M: constitution and the keratin switch ----------------------------
    {
      id: "KER",
      name: "Keratin switch",
      chromosome: "M",
      position: 4,
      mode: { kind: "dominance" },
      trait: "keratin",
      alleles: [dominant("K", "Functional", "sound", 1, 0.76), dominant("k", "Null", "naked", 0, 0.24)],
    },
    {
      id: "VIG_B",
      name: "Constitution (minor)",
      chromosome: "M",
      position: 17,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VB", ["Deep reserve", "Reserve", "Shallow"], [0.16, 0.45, 0.39]),
    },
    {
      id: "VIG_C",
      name: "Constitution (trace)",
      chromosome: "M",
      position: 30,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VC", ["Thick hide", "Hide", "Thin hide"], [0.15, 0.44, 0.41]),
    },
    {
      id: "SPD_A",
      name: "Gait",
      chromosome: "M",
      position: 44,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SA", ["Rolling", "Trundling", "Ponderous"], [0.13, 0.42, 0.45]),
    },
    {
      id: "SNOUT",
      name: "Snout",
      chromosome: "M",
      position: 54,
      mode: { kind: "dominance" },
      trait: "snout",
      alleles: [dominant("Sn_long", "Long", "long", 1, 0.4), dominant("Sn_blunt", "Blunt", "blunt", 0, 0.6)],
    },

    // --- S -----------------------------------------------------------------
    {
      id: "MUSK",
      name: "Musk gland",
      chromosome: "S",
      position: 6,
      onlyOn: "Y",
      mode: { kind: "dominance" },
      trait: "musk",
      suppressedPhenotype: "none",
      alleles: [dominant("Mk_strong", "Strong", "strong", 1, 0.5), dominant("Mk_faint", "Faint", "faint", 0, 0.5)],
    },
    {
      id: "RUFF",
      name: "Shoulder ruff",
      chromosome: "S",
      position: 14,
      onlyOn: "X",
      mode: { kind: "dominance" },
      trait: "ruff",
      tags: ["keratin"],
      expressedInSex: "female",
      suppressedPhenotype: "hidden",
      alleles: [dominant("Rf_full", "Full ruff", "full", 1, 0.34), dominant("Rf_none", "No ruff", "none", 0, 0.66)],
    },
    {
      id: "FOC_B",
      name: "Attention (minor)",
      chromosome: "S",
      position: 34,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FB", ["Fixed", "Steady", "Wandering"], [0.14, 0.44, 0.42]),
    },
    {
      id: "CHALKBONE",
      name: "Chalk bone",
      chromosome: "S",
      position: 37,
      onlyOn: "X",
      mode: { kind: "dominance" },
      trait: "bone",
      alleles: [
        lethal("CB_star", "Chalk", "chalk-boned", 0.05, "Doubled chalk-bone leaves the kit unable to carry its own plate."),
        dominant("CB_wild", "Sound bone", "sound", 0, 0.95),
      ],
    },
    {
      id: "SPD_B",
      name: "Gait (minor)",
      chromosome: "P",
      position: 68,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SB", ["Loose hip", "Hip", "Set hip"]),
    },
    {
      id: "SPD_C",
      name: "Gait (trace)",
      chromosome: "R",
      position: 33,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SC", ["Quick recovery", "Recovery", "Slow recovery"]),
    },
    {
      id: "FOC_C",
      name: "Attention (trace)",
      chromosome: "R",
      position: 48,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FC", ["Long memory", "Memory", "Short memory"]),
    },
  ],

  polygenicTraits: [
    { id: "speed", name: "Speed", loci: ["SPD_A", "SPD_B", "SPD_C"], min: 6, max: 62 },
    { id: "vigour", name: "Vigour", loci: ["VIG_A", "VIG_B", "VIG_C"], min: 40, max: 175 },
    { id: "focus", name: "Focus", loci: ["FOC_A", "FOC_B", "FOC_C"], min: 12, max: 92 },
  ],

  epistasis: [
    {
      id: "naked",
      name: "Naked morph",
      gate: "KER",
      when: { kind: "homozygous", allele: "k" },
      // The switch sits on Marrow; every keratin locus it hides is on Plate or
      // the sex chromosome, so nothing it masks is linked to it.
      masksTags: ["keratin"],
      setTraits: { spines: "naked", plate: "naked", spineQuality: "naked", ruff: "naked" },
    },
  ],

  palette: {
    hue: [18, 268],
    saturation: [0.08, 0.62],
    lightness: [0.3, 0.68],
    hueLocus: "HUE",
    saturationLocus: "SAT",
    lightnessLocus: "SPINE",
  },

  wildCoupling: [
    {
      id: "glass-drag",
      note: "In Thornbrake stock the heaviest build allele sits three centimorgans from glass-spine. The biggest hogs in the brake are mostly carrying it.",
      chromosome: "P",
      ifLocus: "VIG_A",
      ifAllele: "VA2",
      thenLocus: "GLASSPINE",
      thenAllele: "GS_star",
      coupling: 0.48,
    },
  ],
};
