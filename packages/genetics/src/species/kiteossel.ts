/**
 * KITE-OSSEL — the glider.
 *
 *   Inspiration : a flying squirrel's membrane on a manta's proportions.
 *   Hook        : will not walk anywhere it could instead fall.
 *   Biome       : Galeshore — sea cliffs, updraught, salt wind.
 *   Silhouette  : very wide, very thin; a kite with a head.
 *
 * Signature problem: **the membrane switch produces a flightless morph.** A
 * recessive at MEM turns off the whole wing, and because the membrane loci are
 * also where the pattern lives, a wingless Kite-Ossel is both useless and
 * plain — the player loses the trait and the evidence in the same animal. The
 * only way back is a test cross or a pedigree.
 *
 * Stat archetype: extreme speed, almost no vigour. It wins first or not at all.
 */

import type { SpeciesDef } from "../types.js";
import { blend, dominant, lethal, marking, novelAllele, polySet } from "./kit.js";

export const KITE_OSSEL: SpeciesDef = {
  id: "kiteossel",
  name: "Kite-Ossel",
  inspiration: "Flying squirrel's patagium on the proportions of a manta",
  hook: "Will not walk anywhere it could instead fall.",
  biome: "Galeshore",

  chromosomes: [
    { id: "V", name: "Vane", type: "autosome", lengthCm: 95 },
    { id: "K", name: "Keel", type: "autosome", lengthCm: 60 },
    { id: "T", name: "Tide", type: "autosome", lengthCm: 50 },
    { id: "S", name: "Span", type: "sex", lengthCm: 55 },
  ],
  sexChromosome: "S",

  loci: [
    // --- V: the wing -------------------------------------------------------
    {
      id: "SPAN",
      name: "Membrane span",
      chromosome: "V",
      position: 7,
      mode: { kind: "incomplete_dominance" },
      trait: "span",
      tags: ["membrane"],
      alleles: [
        blend("Sp_broad", "Broad", 1, 0.24),
        blend("Sp_even", "Even", 0.5, 0.4),
        blend("Sp_short", "Short", 0, 0.36),
        novelAllele("Sp_storm", "Stormspan", { value: 1.3 }),
      ],
    },
    {
      id: "SPD_A",
      name: "Glide (major)",
      chromosome: "V",
      position: 36,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SA", ["Knife-edge", "Level", "Slack"], [0.18, 0.44, 0.38]),
    },
    {
      id: "HOLLOW",
      name: "Hollow bone",
      chromosome: "V",
      position: 39,
      mode: { kind: "dominance" },
      trait: "bone",
      alleles: [
        lethal("HB_star", "Hollow", "hollow-boned", 0.07, "Doubled hollow-bone leaves nothing for the membrane to anchor to."),
        dominant("HB_wild", "Sound bone", "sound", 0, 0.93),
      ],
    },
    {
      id: "EDGE",
      name: "Trailing edge",
      chromosome: "V",
      position: 62,
      mode: { kind: "codominance" },
      trait: "edge",
      tags: ["membrane", "pattern"],
      alleles: [
        marking("Ef", "Fringed", "fringe", 0.34),
        marking("Es", "Scalloped", "scallop", 0.3),
        marking("En", "Clean", null, 0.36),
        novelAllele("E_ribbon", "Ribboned", { mark: "ribbon" }),
      ],
    },
    {
      id: "FOC_A",
      name: "Attention (major)",
      chromosome: "V",
      position: 84,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FA", ["Reading the air", "Attentive", "Blind"], [0.14, 0.44, 0.42]),
    },

    // --- K: colour ---------------------------------------------------------
    {
      id: "HUE",
      name: "Hue",
      chromosome: "K",
      position: 8,
      mode: { kind: "incomplete_dominance" },
      trait: "hue",
      tags: ["pigment"],
      alleles: [
        blend("H_slate", "Slate", 0, 0.34),
        blend("H_sea", "Sea", 0.38, 0.28),
        blend("H_dusk", "Dusk", 0.72, 0.22),
        blend("H_shell", "Shell", 1, 0.16),
        novelAllele("H_nacre", "Nacre", { value: 0.6 }),
      ],
    },
    {
      id: "SAT",
      name: "Saturation",
      chromosome: "K",
      position: 22,
      mode: { kind: "incomplete_dominance" },
      trait: "saturation",
      tags: ["pigment"],
      alleles: [blend("S_pale", "Pale", 0, 0.42), blend("S_clear", "Clear", 0.5, 0.34), blend("S_deep", "Deep", 1, 0.24)],
    },
    {
      id: "MARK",
      name: "Membrane pattern",
      chromosome: "K",
      position: 38,
      mode: { kind: "codominance" },
      trait: "markings",
      tags: ["pigment", "membrane", "pattern"],
      alleles: [
        marking("Me", "Eyespotted", "eyespots", 0.3),
        marking("Mr", "Rayed", "rays", 0.34),
        marking("Mn", "Plain", null, 0.36),
        novelAllele("M_aurora", "Aurora", { mark: "aurora" }),
      ],
    },
    {
      id: "SALTBLIND",
      name: "Salt-blindness",
      chromosome: "K",
      position: 41,
      mode: { kind: "dominance" },
      trait: "eye",
      tags: ["pigment"],
      alleles: [
        // Three centimorgans from the membrane pattern locus: the prettiest
        // wings on the coast are carried by birds whose eyes are going.
        lethal("SB_star", "Salt-eye", "salt-eyed", 0.05, "Doubled salt-eye leaves the hatchling blind, and it does not find the updraught."),
        dominant("SB_wild", "Clear eye", "clear", 0, 0.95),
      ],
    },
    {
      id: "AFFIN",
      name: "Affinity",
      chromosome: "K",
      position: 52,
      mode: { kind: "codominance" },
      trait: "affinity",
      alleles: [
        marking("A_gale", "Gale", "gale", 0.52),
        marking("A_mire", "Mire", "mire", 0.26),
        marking("A_ember", "Ember", "ember", 0.22),
        novelAllele("A_umbral", "Umbral", { mark: "umbral" }),
      ],
    },

    // --- T: constitution and the membrane switch ---------------------------
    {
      id: "MEM",
      name: "Membrane switch",
      chromosome: "T",
      position: 4,
      mode: { kind: "dominance" },
      trait: "membrane",
      alleles: [dominant("M", "Functional", "formed", 1, 0.8), dominant("m", "Null", "wingless", 0, 0.2)],
    },
    {
      id: "VIG_A",
      name: "Constitution (major)",
      chromosome: "T",
      position: 14,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VA", ["Wiry", "Light", "Frail"], [0.11, 0.4, 0.49]),
    },
    {
      id: "VIG_B",
      name: "Constitution (minor)",
      chromosome: "T",
      position: 26,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VB", ["Sound", "Light", "Hollow"], [0.11, 0.41, 0.48]),
    },
    {
      id: "TAIL",
      name: "Rudder",
      chromosome: "T",
      position: 40,
      mode: { kind: "dominance" },
      trait: "tail",
      alleles: [
        dominant("Tf", "Forked", "forked", 2, 0.3),
        dominant("Tw", "Whip", "whip", 1, 0.36),
        dominant("Ts", "Stub", "stub", 0, 0.34),
      ],
    },

    // --- S -----------------------------------------------------------------
    {
      id: "CLASP",
      name: "Foot clasp",
      chromosome: "S",
      position: 5,
      onlyOn: "Y",
      mode: { kind: "dominance" },
      trait: "clasp",
      suppressedPhenotype: "none",
      alleles: [dominant("Cl_hooked", "Hooked", "hooked", 1, 0.5), dominant("Cl_flat", "Flat", "flat", 0, 0.5)],
    },
    {
      id: "MASK",
      name: "Face mask",
      chromosome: "S",
      position: 16,
      onlyOn: "X",
      mode: { kind: "dominance" },
      trait: "mask",
      tags: ["pigment"],
      expressedInSex: "male",
      suppressedPhenotype: "hidden",
      alleles: [dominant("Mk_bold", "Bold", "bold", 1, 0.32), dominant("Mk_plain", "Plain", "plain", 0, 0.68)],
    },
    {
      id: "SPD_B",
      name: "Glide (minor)",
      chromosome: "S",
      position: 33,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SB", ["Long wrist", "Wrist", "Short wrist"], [0.17, 0.44, 0.39]),
    },
    {
      id: "FOC_B",
      name: "Attention (minor)",
      chromosome: "S",
      position: 46,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FB", ["Fixed", "Even", "Skittish"], [0.14, 0.43, 0.43]),
    },
    {
      id: "SPD_C",
      name: "Glide (trace)",
      chromosome: "T",
      position: 34,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SC", ["Fine camber", "Camber", "Flat camber"]),
    },
    {
      id: "VIG_C",
      name: "Constitution (trace)",
      chromosome: "K",
      position: 30,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VC", ["Corded", "Sound", "Papery"]),
    },
    {
      id: "FOC_C",
      name: "Attention (trace)",
      chromosome: "V",
      position: 72,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FC", ["Level head", "Head", "Loose head"]),
    },
  ],

  polygenicTraits: [
    { id: "speed", name: "Speed", loci: ["SPD_A", "SPD_B", "SPD_C"], min: 45, max: 180 },
    { id: "vigour", name: "Vigour", loci: ["VIG_A", "VIG_B", "VIG_C"], min: 6, max: 66 },
    { id: "focus", name: "Focus", loci: ["FOC_A", "FOC_B", "FOC_C"], min: 18, max: 108 },
  ],

  epistasis: [
    {
      id: "wingless",
      name: "Wingless morph",
      gate: "MEM",
      when: { kind: "homozygous", allele: "m" },
      // The gate is on Tide; every membrane locus it hides is on Vane or Keel.
      masksTags: ["membrane"],
      setTraits: { span: "absent", edge: "absent", markings: "absent" },
    },
  ],

  palette: {
    hue: [186, 340],
    saturation: [0.08, 0.6],
    lightness: [0.34, 0.74],
    hueLocus: "HUE",
    saturationLocus: "SAT",
    lightnessLocus: "SPAN",
  },

  wildCoupling: [
    {
      id: "salt-drag",
      note: "Eyespotted and rayed membranes both ride beside salt-eye on Keel. The Galeshore's best-looking gliders are the ones going blind.",
      chromosome: "K",
      ifLocus: "MARK",
      ifAllele: "Me",
      thenLocus: "SALTBLIND",
      thenAllele: "SB_star",
      coupling: 0.4,
    },
    {
      id: "hollow-drag",
      note: "The best glide allele in the Galeshore pool sits three centimorgans from hollow-bone. Every fast line on the cliffs is carrying it.",
      chromosome: "V",
      ifLocus: "SPD_A",
      ifAllele: "SA2",
      thenLocus: "HOLLOW",
      thenAllele: "HB_star",
      coupling: 0.55,
    },
  ],
};
