/**
 * QUILLFEN — the first species, and the one every test in this package is
 * written against.
 *
 *   Ecological inspiration : a neotenic salamander (axolotl) crossed with the
 *                            dorsal quill-ridge of a crested newt.
 *   Personality hook       : stubbornly patient. Picks one spot in the shallows
 *                            and defends it for days against nothing at all.
 *   Home biome             : the Mirefen — slow water, reed shadow, peat light.
 *   Silhouette family      : low and broad, fan-gilled head, quilled dorsal ridge,
 *                            paddle tail. Reads at 32x32 in pure black.
 *
 * ## Why the map is laid out this way
 *
 * Every position here is a gameplay decision, not decoration.
 *
 * - **SPD_A sits 3cM from LANTERN.** The best speed allele in the wild pool
 *   arrives welded to a recessive lethal, and `wildCoupling` guarantees that
 *   founding stock mostly carries them together. A recombination fraction of
 *   ~2.9% means a player who wants fast Quillfen that do not lose a quarter of
 *   their eggs must either get very lucky, screen a lot of offspring, or spend
 *   a crossover inducer. This is the linkage drag the design asks for, and it
 *   is Chapter 3 of the campaign in a single pair of numbers.
 *
 * - **PIG is on a different chromosome from every colour locus it gates.**
 *   Chapter 4 asks the player to find the switch that is hiding their colour
 *   work. If the switch were linked to the colours it masks, the lesson would
 *   be muddied by drag; here it assorts independently and the deduction is
 *   clean.
 *
 * - **DORSAL and TAIL sit 84cM apart on the same chromosome.** Linkage that is
 *   *nearly* free assortment (r = 0.407) teaches that "same chromosome" is not
 *   a binary. It also gives the test suite a second, very different linkage
 *   value to check.
 *
 * - **Speed is partly X-linked (SPD_B).** A son's X-linked speed comes entirely
 *   from his dam, so a stud's speed tells you less about his sons than about
 *   his daughters. This makes pedigree reading pay off in a way that no amount
 *   of phenotype-staring can replace.
 */

import type { SpeciesDef } from "../types.js";

export const QUILLFEN: SpeciesDef = {
  id: "quillfen",
  name: "Quillfen",
  inspiration: "Neotenic salamander (axolotl) with a crested newt's dorsal ridge",
  hook: "Stubbornly patient; defends one patch of shallow water against nothing at all.",
  biome: "Mirefen",

  chromosomes: [
    { id: "C1", name: "Corm", type: "autosome", lengthCm: 100 },
    { id: "C2", name: "Pelt", type: "autosome", lengthCm: 80 },
    { id: "C3", name: "Core", type: "autosome", lengthCm: 60 },
    { id: "S", name: "Strand", type: "sex", lengthCm: 50 },
  ],
  sexChromosome: "S",

  loci: [
    // ---- C1: form and structure -------------------------------------------
    {
      id: "DORSAL",
      name: "Dorsal ridge",
      chromosome: "C1",
      position: 8,
      mode: { kind: "dominance" },
      trait: "dorsal",
      alleles: [
        { id: "D_crown", name: "Crown ridge", dominance: 2, phenotype: "crowned", novel: true, note: "Novel allele slot. The first player to find it names it (§8.2)." },
        { id: "D", name: "Quilled", dominance: 1, phenotype: "quilled", wildFrequency: 0.4 },
        { id: "d", name: "Smooth", dominance: 0, phenotype: "smooth", wildFrequency: 0.6 },
      ],
    },
    {
      id: "BUILD",
      name: "Build",
      chromosome: "C1",
      position: 20,
      mode: { kind: "incomplete_dominance" },
      trait: "build",
      alleles: [
        { id: "Bh", name: "Heavy", value: 1.0, wildFrequency: 0.25 },
        { id: "Bm", name: "Middling", value: 0.5, wildFrequency: 0.35 },
        { id: "Bs", name: "Slight", value: 0.0, wildFrequency: 0.4 },
      ],
    },
    {
      id: "SPD_A",
      name: "Stride (major)",
      chromosome: "C1",
      position: 44,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: [
        { id: "SA2", name: "Long stride", value: 2, wildFrequency: 0.15 },
        { id: "SA1", name: "Even stride", value: 1, wildFrequency: 0.45 },
        { id: "SA0", name: "Short stride", value: 0, wildFrequency: 0.4 },
      ],
    },
    {
      id: "LANTERN",
      name: "Lantern sheen",
      chromosome: "C1",
      position: 47,
      mode: { kind: "dominance" },
      trait: "lantern",
      tags: ["luminance"],
      alleles: [
        {
          id: "LN_star",
          name: "Lantern",
          dominance: 1,
          phenotype: "lantern",
          wildFrequency: 0.04,
          lethal: {
            mode: "recessive",
            stage: "egg",
            reason: "Doubled lantern alleles leave the egg with no working yolk membrane.",
          },
          note: "Lethal #1. Beautiful in the heterozygote, fatal doubled — and welded to SPD_A.",
        },
        { id: "LN_wild", name: "Unlit", dominance: 0, phenotype: "none", wildFrequency: 0.96 },
      ],
    },
    {
      id: "FOC_C",
      name: "Stillness",
      chromosome: "C1",
      position: 60,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: [
        { id: "FC2", name: "Deep stillness", value: 2, wildFrequency: 0.12 },
        { id: "FC1", name: "Stillness", value: 1, wildFrequency: 0.43 },
        { id: "FC0", name: "Restless", value: 0, wildFrequency: 0.45 },
      ],
    },
    {
      id: "LIMB",
      name: "Limb form",
      chromosome: "C1",
      position: 70,
      mode: { kind: "dominance" },
      trait: "limbs",
      alleles: [
        { id: "Lp", name: "Paddle", dominance: 2, phenotype: "paddle", wildFrequency: 0.3 },
        { id: "Lc", name: "Clawed", dominance: 1, phenotype: "clawed", wildFrequency: 0.35 },
        { id: "Ls", name: "Stub", dominance: 0, phenotype: "stub", wildFrequency: 0.35 },
      ],
    },
    {
      id: "TAIL",
      name: "Tail",
      chromosome: "C1",
      position: 92,
      mode: { kind: "codominance" },
      trait: "tail",
      // Deliberately NOT tagged "pattern": tail shape is a part slot in the rig
      // (§6.3), not a marking layer. Only marking-layer loci belong in
      // `Phenotype.marks`, or the renderer would try to stack a tail on a flank.
      alleles: [
        { id: "Tf", name: "Fan", mark: "fan", wildFrequency: 0.4 },
        { id: "Tw", name: "Whip", mark: "whip", wildFrequency: 0.35 },
        { id: "Tn", name: "Plain", mark: null, wildFrequency: 0.25 },
      ],
    },

    // ---- C2: colour and pattern -------------------------------------------
    {
      id: "HUE",
      name: "Hue",
      chromosome: "C2",
      position: 12,
      mode: { kind: "incomplete_dominance" },
      trait: "hue",
      tags: ["pigment"],
      alleles: [
        { id: "H_moss", name: "Moss", value: 0.0, wildFrequency: 0.3 },
        { id: "H_slate", name: "Slate", value: 0.33, wildFrequency: 0.25 },
        { id: "H_rust", name: "Rust", value: 0.66, wildFrequency: 0.25 },
        { id: "H_bloom", name: "Bloom", value: 1.0, wildFrequency: 0.2 },
        { id: "H_aurora", name: "Aurora", value: 0.5, novel: true, note: "Novel allele slot." },
      ],
    },
    {
      id: "SAT",
      name: "Saturation",
      chromosome: "C2",
      position: 30,
      mode: { kind: "incomplete_dominance" },
      trait: "saturation",
      tags: ["pigment"],
      alleles: [
        { id: "S_dull", name: "Muted", value: 0.0, wildFrequency: 0.4 },
        { id: "S_mid", name: "Clear", value: 0.5, wildFrequency: 0.35 },
        { id: "S_vivid", name: "Vivid", value: 1.0, wildFrequency: 0.25 },
      ],
    },
    {
      id: "MARK",
      name: "Markings",
      chromosome: "C2",
      position: 44,
      mode: { kind: "codominance" },
      trait: "markings",
      tags: ["pigment", "pattern"],
      alleles: [
        { id: "Ms", name: "Spotted", mark: "spots", wildFrequency: 0.35 },
        { id: "Mb", name: "Banded", mark: "bands", wildFrequency: 0.3 },
        { id: "Mn", name: "Unmarked", mark: null, wildFrequency: 0.35 },
        { id: "M_veil", name: "Veiled", mark: "veil", novel: true, note: "Novel allele slot." },
      ],
    },
    {
      id: "PRISM",
      name: "Prism edge",
      chromosome: "C2",
      position: 62,
      mode: { kind: "dominance" },
      trait: "sheen",
      tags: ["pigment"],
      alleles: [
        {
          id: "Pr_star",
          name: "Prism",
          dominance: 1,
          phenotype: "prismatic",
          wildFrequency: 0.04,
          lethal: {
            mode: "recessive",
            stage: "egg",
            reason: "Doubled prism alleles crystallise the egg's outer layer before it can breathe.",
          },
          note: "Lethal #2. The prized one. It can never breed true, and the plot asks why (§4.1 ch.5).",
        },
        { id: "Pr_wild", name: "Plain edge", dominance: 0, phenotype: "plain", wildFrequency: 0.96 },
      ],
    },
    {
      id: "VIG_A",
      name: "Constitution (major)",
      chromosome: "C2",
      position: 75,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: [
        { id: "VA2", name: "Hardy", value: 2, wildFrequency: 0.14 },
        { id: "VA1", name: "Sound", value: 1, wildFrequency: 0.44 },
        { id: "VA0", name: "Frail", value: 0, wildFrequency: 0.42 },
      ],
    },

    // ---- C3: constitution, affinity, and the pigment switch ----------------
    {
      id: "PIG",
      name: "Pigment switch",
      chromosome: "C3",
      position: 5,
      mode: { kind: "dominance" },
      trait: "pigmentation",
      alleles: [
        { id: "P", name: "Functional", dominance: 1, phenotype: "pigmented", wildFrequency: 0.75 },
        { id: "p", name: "Null", dominance: 0, phenotype: "albino", wildFrequency: 0.25 },
      ],
    },
    {
      id: "VIG_B",
      name: "Constitution (minor)",
      chromosome: "C3",
      position: 14,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: [
        { id: "VB2", name: "Deep reserve", value: 2, wildFrequency: 0.13 },
        { id: "VB1", name: "Reserve", value: 1, wildFrequency: 0.45 },
        { id: "VB0", name: "Shallow", value: 0, wildFrequency: 0.42 },
      ],
    },
    {
      id: "VIG_C",
      name: "Constitution (trace)",
      chromosome: "C3",
      position: 25,
      mode: { kind: "polygenic" },
      stat: "vigour",
      alleles: [
        { id: "VC2", name: "Thick hide", value: 2, wildFrequency: 0.11 },
        { id: "VC1", name: "Hide", value: 1, wildFrequency: 0.44 },
        { id: "VC0", name: "Thin hide", value: 0, wildFrequency: 0.45 },
      ],
    },
    {
      id: "FOC_A",
      name: "Attention (major)",
      chromosome: "C3",
      position: 33,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: [
        { id: "FA2", name: "Fixed gaze", value: 2, wildFrequency: 0.13 },
        { id: "FA1", name: "Steady gaze", value: 1, wildFrequency: 0.44 },
        { id: "FA0", name: "Wandering", value: 0, wildFrequency: 0.43 },
      ],
    },
    {
      id: "FOC_B",
      name: "Attention (minor)",
      chromosome: "C3",
      position: 40,
      mode: { kind: "polygenic" },
      stat: "focus",
      alleles: [
        { id: "FB2", name: "Patient", value: 2, wildFrequency: 0.12 },
        { id: "FB1", name: "Even", value: 1, wildFrequency: 0.45 },
        { id: "FB0", name: "Skittish", value: 0, wildFrequency: 0.43 },
      ],
    },
    {
      id: "SPD_C",
      name: "Stride (trace)",
      chromosome: "C3",
      position: 48,
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: [
        { id: "SC2", name: "Quick recovery", value: 2, wildFrequency: 0.14 },
        { id: "SC1", name: "Recovery", value: 1, wildFrequency: 0.44 },
        { id: "SC0", name: "Slow recovery", value: 0, wildFrequency: 0.42 },
      ],
    },
    {
      id: "AFFIN",
      name: "Affinity",
      chromosome: "C3",
      position: 55,
      mode: { kind: "codominance" },
      trait: "affinity",
      alleles: [
        { id: "A_mire", name: "Mire", mark: "mire", wildFrequency: 0.4 },
        { id: "A_ember", name: "Ember", mark: "ember", wildFrequency: 0.3 },
        { id: "A_gale", name: "Gale", mark: "gale", wildFrequency: 0.3 },
        { id: "A_umbral", name: "Umbral", mark: "umbral", novel: true, note: "Novel allele slot." },
      ],
    },

    // ---- S: the sex chromosome --------------------------------------------
    {
      id: "TUSK",
      name: "Jaw tusk",
      chromosome: "S",
      position: 5,
      onlyOn: "Y",
      mode: { kind: "dominance" },
      trait: "tusk",
      suppressedPhenotype: "none",
      alleles: [
        { id: "Tk_yes", name: "Tusked", dominance: 1, phenotype: "tusked", wildFrequency: 0.5 },
        { id: "Tk_no", name: "Untusked", dominance: 0, phenotype: "none", wildFrequency: 0.5 },
      ],
    },
    {
      id: "CREST",
      name: "Crest display",
      chromosome: "S",
      position: 15,
      onlyOn: "X",
      mode: { kind: "dominance" },
      trait: "crest",
      // Sex-linked AND sex-limited: females carry it invisibly, which is what
      // makes carrier tracking a real skill rather than a lookup.
      expressedInSex: "male",
      suppressedPhenotype: "hidden",
      alleles: [
        { id: "Cr_grand", name: "Grand crest", dominance: 1, phenotype: "grand", wildFrequency: 0.3 },
        { id: "Cr_plain", name: "Plain crest", dominance: 0, phenotype: "plain", wildFrequency: 0.7 },
      ],
    },
    {
      id: "SPD_B",
      name: "Stride (minor)",
      chromosome: "S",
      position: 40,
      onlyOn: "X",
      mode: { kind: "polygenic" },
      stat: "speed",
      alleles: [
        { id: "SB2", name: "Loose hip", value: 2, wildFrequency: 0.15 },
        { id: "SB1", name: "Hip", value: 1, wildFrequency: 0.45 },
        { id: "SB0", name: "Tight hip", value: 0, wildFrequency: 0.4 },
      ],
    },
  ],

  polygenicTraits: [
    { id: "speed", name: "Speed", loci: ["SPD_A", "SPD_B", "SPD_C"], min: 12, max: 120 },
    { id: "vigour", name: "Vigour", loci: ["VIG_A", "VIG_B", "VIG_C"], min: 15, max: 130 },
    { id: "focus", name: "Focus", loci: ["FOC_A", "FOC_B", "FOC_C"], min: 10, max: 110 },
  ],

  epistasis: [
    {
      id: "albinism",
      name: "Pigment failure",
      gate: "PIG",
      when: { kind: "homozygous", allele: "p" },
      masksTags: ["pigment"],
      setTraits: {
        markings: "unpigmented",
        sheen: "unpigmented",
        hue: "unpigmented",
        saturation: "unpigmented",
      },
      setColour: { h: 24, s: 0.06, l: 0.93 },
    },
  ],

  palette: {
    // A 270-degree arc that never crosses 0, so blended hues stay coherent.
    hue: [70, 340],
    saturation: [0.12, 0.78],
    lightness: [0.3, 0.68],
    hueLocus: "HUE",
    saturationLocus: "SAT",
    lightnessLocus: "BUILD",
  },

  wildCoupling: [
    {
      id: "lantern-drag",
      note: "In wild Mirefen stock the long-stride allele is nearly always carried on the same haplotype as the lantern lethal. Breaking them apart is a multi-generation project.",
      chromosome: "C1",
      ifLocus: "SPD_A",
      ifAllele: "SA2",
      thenLocus: "LANTERN",
      thenAllele: "LN_star",
      coupling: 0.45,
    },
  ],
};
