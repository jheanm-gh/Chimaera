/**
 * SALLOWFINCH — starter trio, the one that sings.
 *
 *   Inspiration : a ground-feeding finch crossed with a quail's build.
 *   Hook        : keeps a running inventory of everything it has ever stolen.
 *   Biome       : Reedwold — dry grass, seed heads, thorn scrub.
 *   Silhouette  : upright, round-bodied, short-tailed, big-headed.
 *
 * Signature problem: **almost everything worth having is on the sex
 * chromosome.** Plumage, song and the crest all sit on the X, so a cock shows
 * you his whole hand while a hen carries hers invisibly. Breeding a
 * Sallowfinch line is an exercise in tracking carriers through the female side,
 * and no lens tier makes that unnecessary — a pedigree does.
 *
 * Stat archetype: high focus, middling speed, low vigour. It is a bird that
 * wins by paying attention, and it does not take a hit.
 */

import type { SpeciesDef } from "../types.js";
import { blend, dominant, lethal, marking, novelAllele, polySet } from "./kit.js";

export const SALLOWFINCH: SpeciesDef = {
  id: "sallowfinch",
  name: "Sallowfinch",
  inspiration: "Ground-feeding finch with the heavy body of a quail",
  hook: "Keeps a running inventory of everything it has ever stolen, and checks it.",
  biome: "Reedwold",

  chromosomes: [
    { id: "A", name: "Awn", type: "autosome", lengthCm: 90 },
    { id: "B", name: "Barb", type: "autosome", lengthCm: 70 },
    { id: "C", name: "Chaff", type: "autosome", lengthCm: 55 },
    { id: "S", name: "Sett", type: "sex", lengthCm: 60 },
  ],
  sexChromosome: "S",

  loci: [
    // --- A: form -----------------------------------------------------------
    {
      id: "BEAK",
      name: "Beak",
      chromosome: "A",
      position: 6,
      mode: { kind: "dominance" },
      trait: "beak",
      tags: ["keratin"],
      alleles: [
        novelAllele("BK_sabre", "Sabre beak", { dominance: 3, phenotype: "sabre" }),
        dominant("BK_hook", "Hooked", "hooked", 2, 0.22),
        dominant("BK_cone", "Conical", "conical", 1, 0.46),
        dominant("BK_fine", "Fine", "fine", 0, 0.32),
      ],
    },
    {
      id: "BUILD",
      name: "Build",
      chromosome: "A",
      position: 19,
      mode: { kind: "incomplete_dominance" },
      trait: "build",
      alleles: [blend("Bp", "Plump", 1, 0.3), blend("Bt", "Trim", 0.5, 0.36), blend("Bw", "Wiry", 0, 0.34)],
    },
    {
      id: "FOC_A",
      name: "Attention (major)",
      chromosome: "A",
      position: 41,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FA", ["Watchful", "Attentive", "Vacant"], [0.17, 0.45, 0.38]),
    },
    {
      id: "GLASSWING",
      name: "Glasswing",
      chromosome: "A",
      position: 45,
      mode: { kind: "dominance" },
      trait: "wing",
      alleles: [
        // Four centimorgans from the best attention allele: the smartest wild
        // finches are mostly carriers, and separating the two takes a project.
        lethal("GW_star", "Glasswing", "glasswing", 0.05, "Doubled glasswing leaves the chick with no flight feathers at all."),
        dominant("GW_wild", "Solid", "solid", 0, 0.95),
      ],
    },
    {
      id: "TAIL",
      name: "Tail",
      chromosome: "A",
      position: 74,
      mode: { kind: "dominance" },
      trait: "tail",
      alleles: [dominant("Tb", "Barred", "barred", 1, 0.42), dominant("Ts", "Short", "short", 0, 0.58)],
    },

    // --- B: colour ---------------------------------------------------------
    {
      id: "HUE",
      name: "Hue",
      chromosome: "B",
      position: 10,
      mode: { kind: "incomplete_dominance" },
      trait: "hue",
      tags: ["pigment"],
      alleles: [
        blend("H_straw", "Straw", 0, 0.32),
        blend("H_sorrel", "Sorrel", 0.4, 0.28),
        blend("H_madder", "Madder", 0.72, 0.24),
        blend("H_ink", "Ink", 1, 0.16),
        novelAllele("H_verdigris", "Verdigris", { value: 0.55 }),
      ],
    },
    {
      id: "SAT",
      name: "Saturation",
      chromosome: "B",
      position: 27,
      mode: { kind: "incomplete_dominance" },
      trait: "saturation",
      tags: ["pigment"],
      alleles: [blend("S_dun", "Dun", 0, 0.4), blend("S_clear", "Clear", 0.55, 0.34), blend("S_bright", "Bright", 1, 0.26)],
    },
    {
      id: "MARK",
      name: "Markings",
      chromosome: "B",
      position: 44,
      mode: { kind: "codominance" },
      trait: "markings",
      tags: ["pigment", "pattern"],
      alleles: [
        marking("Mf", "Flecked", "flecks", 0.34),
        marking("Mc", "Collared", "collar", 0.3),
        marking("Mn", "Plain", null, 0.36),
        novelAllele("M_ember", "Ember-tipped", { mark: "ember-tips" }),
      ],
    },
    {
      id: "SPD_A",
      name: "Flight (major)",
      chromosome: "B",
      position: 63,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SA", ["Quick", "Level", "Heavy"], [0.16, 0.44, 0.4]),
    },

    // --- C: constitution and the keratin switch ----------------------------
    {
      id: "KER",
      name: "Keratin switch",
      chromosome: "C",
      position: 5,
      mode: { kind: "dominance" },
      trait: "keratin",
      alleles: [dominant("K", "Functional", "sound", 1, 0.79), dominant("k", "Null", "soft", 0, 0.21)],
    },
    {
      id: "VIG_A",
      name: "Constitution (major)",
      chromosome: "C",
      position: 15,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VA", ["Hardy", "Sound", "Slight"], [0.12, 0.43, 0.45]),
    },
    {
      id: "VIG_B",
      name: "Constitution (minor)",
      chromosome: "C",
      position: 28,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VB", ["Deep-chested", "Sound", "Shallow"], [0.12, 0.44, 0.44]),
    },
    {
      id: "FOC_B",
      name: "Attention (minor)",
      chromosome: "C",
      position: 37,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("FB", ["Steady", "Even", "Flighty"], [0.16, 0.45, 0.39]),
    },
    {
      id: "AFFIN",
      name: "Affinity",
      chromosome: "C",
      position: 50,
      mode: { kind: "codominance" },
      trait: "affinity",
      alleles: [
        marking("A_gale", "Gale", "gale", 0.44),
        marking("A_ember", "Ember", "ember", 0.3),
        marking("A_mire", "Mire", "mire", 0.26),
        novelAllele("A_umbral", "Umbral", { mark: "umbral" }),
      ],
    },

    // --- S: the sex chromosome, which is where this species lives ----------
    {
      id: "SPUR",
      name: "Leg spur",
      chromosome: "S",
      position: 4,
      onlyOn: "Y",
      mode: { kind: "dominance" },
      trait: "spur",
      suppressedPhenotype: "none",
      alleles: [dominant("Sp_yes", "Spurred", "spurred", 1, 0.55), dominant("Sp_no", "Unspurred", "none", 0, 0.45)],
    },
    {
      id: "CREST",
      name: "Crest",
      chromosome: "S",
      position: 12,
      onlyOn: "X",
      mode: { kind: "dominance" },
      trait: "crest",
      expressedInSex: "male",
      suppressedPhenotype: "hidden",
      alleles: [
        dominant("Cr_high", "High crest", "high", 2, 0.22),
        dominant("Cr_low", "Low crest", "low", 1, 0.38),
        dominant("Cr_none", "Uncrested", "none", 0, 0.4),
      ],
    },
    {
      id: "SONG",
      name: "Song",
      chromosome: "S",
      position: 22,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: polySet("SG", ["Full song", "Song", "Silent"], [0.18, 0.42, 0.4]),
    },
    {
      id: "PLUME",
      name: "Plumage",
      chromosome: "S",
      position: 26,
      onlyOn: "X",
      mode: { kind: "dominance" },
      trait: "plumage",
      tags: ["pigment", "keratin"],
      expressedInSex: "male",
      suppressedPhenotype: "hen-feathered",
      alleles: [
        // Four centimorgans from song: the finest singers carry the finest
        // plumage, and both ride the X, so a hen passes them to her sons as a
        // set. Breaking that pairing is the species' long game.
        dominant("Pl_bright", "Bright", "bright", 1, 0.3),
        dominant("Pl_dull", "Hen-like", "dull", 0, 0.7),
      ],
    },
    {
      id: "SPD_B",
      name: "Flight (minor)",
      chromosome: "S",
      position: 48,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SB", ["Long primary", "Primary", "Short primary"], [0.16, 0.44, 0.4]),
    },
    {
      id: "HOLLOW",
      name: "Hollow bone",
      chromosome: "S",
      position: 52,
      onlyOn: "X",
      mode: { kind: "dominance" },
      trait: "bone",
      alleles: [
        lethal("HB_star", "Hollow", "hollow-boned", 0.04, "Doubled hollow-bone leaves the chick unable to hold its own weight."),
        dominant("HB_wild", "Solid bone", "solid", 0, 0.96),
      ],
    },
    {
      id: "SPD_C",
      name: "Flight (trace)",
      chromosome: "C",
      position: 46,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: polySet("SC", ["Light frame", "Frame", "Heavy frame"]),
    },
    {
      id: "VIG_C",
      name: "Constitution (trace)",
      chromosome: "B",
      position: 55,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: polySet("VC", ["Thick down", "Down", "Thin down"]),
    },
  ],

  polygenicTraits: [
    // Fast enough, sharp, and fragile: the archetype in three ranges.
    { id: "speed", name: "Speed", loci: ["SPD_A", "SPD_B", "SPD_C"], min: 20, max: 105 },
    { id: "vigour", name: "Vigour", loci: ["VIG_A", "VIG_B", "VIG_C"], min: 8, max: 78 },
    { id: "focus", name: "Focus", loci: ["FOC_A", "FOC_B", "SONG"], min: 25, max: 145 },
  ],

  epistasis: [
    {
      id: "soft-keratin",
      name: "Soft keratin",
      gate: "KER",
      when: { kind: "homozygous", allele: "k" },
      // Masks both beak and plumage: the switch is on a third chromosome from
      // either, so the deduction is clean.
      masksTags: ["keratin"],
      setTraits: { beak: "soft", plumage: "unformed" },
    },
    {
      id: "albinism",
      name: "Pigment failure",
      gate: "KER",
      when: { kind: "homozygous", allele: "k" },
      masksTags: ["pigment"],
      setTraits: { markings: "unpigmented", hue: "unpigmented", saturation: "unpigmented" },
      setColour: { h: 44, s: 0.08, l: 0.9 },
    },
  ],

  palette: {
    hue: [24, 292],
    saturation: [0.1, 0.72],
    lightness: [0.32, 0.7],
    hueLocus: "HUE",
    saturationLocus: "SAT",
    lightnessLocus: "BUILD",
  },

  wildCoupling: [
    {
      id: "glasswing-drag",
      note: "Wild Reedwold finches carry their best attention allele on the same haplotype as the glasswing lethal. The cleverest birds in the wold are mostly carriers.",
      chromosome: "A",
      ifLocus: "FOC_A",
      ifAllele: "FA2",
      thenLocus: "GLASSWING",
      thenAllele: "GW_star",
      coupling: 0.42,
    },
    {
      id: "plume-song",
      note: "Bright plumage and full song ride the same X. A hen hands her sons both or neither, and prising them apart is the species' long game.",
      chromosome: "S",
      ifLocus: "SONG",
      ifAllele: "SG2",
      thenLocus: "PLUME",
      thenAllele: "Pl_bright",
      coupling: 0.7,
    },
  ],
};
