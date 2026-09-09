/**
 * The Breeding Trials themselves (§4): fifty-four authored puzzles.
 *
 * Curved across five tiers, and the curve is a curve of *concept* rather than
 * of arithmetic. A tier 1 trial is one locus and two generations. A tier 5
 * trial asks for a stat floor, a fixed coat, a clean lethal panel and an animal
 * that breeds true, from a pair that cannot supply all of it at once.
 *
 * Nine per species, so every species is a place you can play rather than a
 * place you visit for one puzzle. The starting pairs name only the loci the
 * puzzle turns on; everything else is drawn from that species' wild pool with
 * the trial's own seed, which keeps each entry short and keeps the unnamed loci
 * genuinely incidental.
 *
 * Every one of these is proved solvable by a solver, in a test. An authored
 * puzzle nobody checked is a puzzle that is unsolvable about a fifth of the
 * time, and the player has no way to tell which fifth.
 */

import type { AlleleId, LocusId, SpeciesId, StatId } from "@chimaera/genetics";
import type { PairSpec, TargetClause, Trial } from "./trials.js";

const trait = (name: string, is: string): TargetClause => ({ kind: "trait", trait: name, is });
const stat = (id: StatId, atLeast: number): TargetClause => ({ kind: "stat", stat: id, atLeast });
const carries = (locus: LocusId, allele: AlleleId): TargetClause => ({ kind: "carries", locus, allele });
const homo = (locus: LocusId, allele: AlleleId): TargetClause => ({ kind: "homozygous", locus, allele });
const clear: TargetClause = { kind: "clear" };

function t(
  id: string,
  tier: number,
  species: SpeciesId,
  name: string,
  blurb: string,
  sire: PairSpec,
  dam: PairSpec,
  target: readonly TargetClause[],
  generations: number,
  items?: Readonly<Record<string, number>>,
): Trial {
  return { id, name, blurb, species, tier, sire, dam, target, generations, ...(items ? { items } : {}) };
}

const LENS = { "field-lens": 4 } as const;
const BENCH = { "assay-bench": 2, "field-lens": 4 } as const;
const DEEP = { "deep-sequencer": 1, "assay-bench": 2, "field-lens": 6 } as const;
const CROSSOVER = { "crossover-inducer": 3, "field-lens": 6 } as const;

export const TRIALS: readonly Trial[] = [
  // --- Quillfen ------------------------------------------------------------
  t("qf-1", 1, "quillfen", "Two Carriers",
    "Both of these show quilled. The commission wants smooth. You have two generations.",
    { DORSAL: ["D", "d"] }, { DORSAL: ["D", "d"] },
    [trait("dorsal", "smooth")], 2),
  t("qf-2", 1, "quillfen", "Stub and Paddle",
    "Three alleles at one locus, ranked. Produce the bottom of the rank.",
    { LIMB: ["Lp", "Ls"] }, { LIMB: ["Lc", "Ls"] },
    [trait("limbs", "stub")], 2),
  t("qf-3", 2, "quillfen", "The Middle Ground",
    "Heavy and slight blend. The board wants exactly the middle, and it wants it twice over.",
    { BUILD: ["Bh", "Bm"] }, { BUILD: ["Bs", "Bm"] },
    [trait("build", "Middling"), homo("BUILD", "Bm")], 4, LENS),
  t("qf-4", 2, "quillfen", "Both Layers",
    "Co-dominance shows everything it carries. Show both.",
    { TAIL: ["Tf", "Tn"] }, { TAIL: ["Tw", "Tn"] },
    [trait("tail", "fan+whip")], 3),
  t("qf-5", 3, "quillfen", "The Lantern Drag",
    "The long-stride allele travels with a lethal three centimorgans away. Break them apart.",
    { SPD_A: ["SA2", "SA0"], LANTERN: ["LN_star", "LN_wild"] },
    { SPD_A: ["SA1", "SA0"], LANTERN: ["LN_wild", "LN_wild"] },
    [carries("SPD_A", "SA2"), clear], 4, CROSSOVER),
  t("qf-6", 3, "quillfen", "Open the Gate",
    "A pigment switch is hiding every colour allele in this line. Get the colour back and keep the marking.",
    { PIG: ["p", "p"], MARK: ["Ms", "Ms"] }, { PIG: ["P", "p"], MARK: ["Mb", "Mb"] },
    [trait("pigmentation", "pigmented"), trait("markings", "bands+spots")], 3, LENS),
  t("qf-7", 4, "quillfen", "Breeding True for Crown",
    "One parent carries an allele no wild population has. Fix it, and do not lose the herd doing it.",
    { DORSAL: ["D_crown", "d"] }, { DORSAL: ["d", "d"] },
    [homo("DORSAL", "D_crown")], 4, BENCH),
  t("qf-8", 4, "quillfen", "Clean and Quick",
    "Speed at the top of the range, and not one lethal allele in the animal.",
    { SPD_A: ["SA2", "SA2"], SPD_C: ["SC2", "SC1"], LANTERN: ["LN_star", "LN_wild"] },
    { SPD_A: ["SA2", "SA1"], SPD_C: ["SC2", "SC2"], PRISM: ["Pr_star", "Pr_wild"] },
    [stat("speed", 92), clear], 4, BENCH),
  t("qf-9", 5, "quillfen", "The Warden's Specification",
    "Everything at once, from a pair that cannot supply all of it. Five generations.",
    { DORSAL: ["D_crown", "d"], SPD_A: ["SA2", "SA1"], BUILD: ["Bh", "Bm"], LANTERN: ["LN_star", "LN_wild"] },
    { DORSAL: ["d", "d"], SPD_A: ["SA2", "SA2"], BUILD: ["Bs", "Bm"], PRISM: ["Pr_wild", "Pr_wild"] },
    [trait("dorsal", "crowned"), stat("speed", 84), trait("build", "Middling"), clear], 5, DEEP),

  // --- Sallowfinch ---------------------------------------------------------
  t("sf-1", 1, "sallowfinch", "The Fine Beak",
    "Four alleles, one rank. The bottom of it is what the seed-rows need.",
    { BEAK: ["BK_hook", "BK_fine"] }, { BEAK: ["BK_cone", "BK_fine"] },
    [trait("beak", "fine")], 2),
  t("sf-2", 1, "sallowfinch", "Barred Again",
    "Barred is dominant and both of these are hiding short. Produce short.",
    { TAIL: ["Tb", "Ts"] }, { TAIL: ["Tb", "Ts"] },
    [trait("tail", "short")], 2),
  t("sf-3", 2, "sallowfinch", "Cock in Full Colour",
    "Plumage is on the X. Only a cock will show you what he has.",
    { PLUME: ["Pl_bright", null] }, { PLUME: ["Pl_dull", "Pl_dull"] },
    [trait("plumage", "bright")], 3, LENS),
  t("sf-4", 2, "sallowfinch", "A Hen Who Carries",
    "She will never show it. Prove she has it anyway.",
    { PLUME: ["Pl_bright", null] }, { PLUME: ["Pl_dull", "Pl_dull"] },
    [carries("PLUME", "Pl_bright"), trait("plumage", "hen-feathered")], 3, BENCH),
  t("sf-5", 3, "sallowfinch", "Soft Keratin, Bright Bird",
    "The keratin switch flattens the plumage entirely. Get a bright cock past it.",
    { KER: ["K", "k"], PLUME: ["Pl_bright", null] }, { KER: ["k", "k"], PLUME: ["Pl_dull", "Pl_dull"] },
    [trait("keratin", "sound"), trait("plumage", "bright")], 4, LENS),
  t("sf-6", 3, "sallowfinch", "Two Lethals on the Strand",
    "Glasswing and hollow-bone both sit in this line. Produce a bird carrying neither.",
    { GLASSWING: ["GW_star", "GW_wild"], HOLLOW: ["HB_star", null] },
    { GLASSWING: ["GW_star", "GW_wild"], HOLLOW: ["HB_wild", "HB_star"] },
    [clear, trait("beak", "conical")], 4, BENCH),
  t("sf-7", 4, "sallowfinch", "The High Crest",
    "Three alleles on the X, and the one you want is the rarest. Fix it in a hen.",
    { CREST: ["Cr_high", null] }, { CREST: ["Cr_low", "Cr_none"] },
    [homo("CREST", "Cr_high")], 4, BENCH),
  t("sf-8", 4, "sallowfinch", "Attention at the Ceiling",
    "Focus is what a Sallowfinch wins with. Take it to the top and keep the bird clean.",
    { FOC_A: ["FA2", "FA2"], FOC_B: ["FB2", "FB1"], SONG: ["SG2", null], GLASSWING: ["GW_star", "GW_wild"] },
    { FOC_A: ["FA2", "FA1"], FOC_B: ["FB2", "FB2"], SONG: ["SG2", "SG1"], GLASSWING: ["GW_wild", "GW_wild"] },
    [stat("focus", 128), clear], 4, BENCH),
  t("sf-9", 5, "sallowfinch", "The Ember-Tipped Hen",
    "A novel marking, a high crest, and no lethals. Five generations and a sequencer.",
    { MARK: ["M_ember", "Mn"], CREST: ["Cr_high", null], GLASSWING: ["GW_star", "GW_wild"] },
    { MARK: ["Mf", "Mn"], CREST: ["Cr_low", "Cr_none"], GLASSWING: ["GW_wild", "GW_wild"] },
    [carries("MARK", "M_ember"), homo("CREST", "Cr_high"), clear], 5, DEEP),

  // --- Bramblehog ----------------------------------------------------------
  t("bh-1", 1, "bramblehog", "Blunt Snout",
    "One locus, two alleles, two generations. The gentlest thing in the book.",
    { SNOUT: ["Sn_long", "Sn_blunt"] }, { SNOUT: ["Sn_long", "Sn_blunt"] },
    [trait("snout", "blunt")], 2),
  t("bh-2", 1, "bramblehog", "Smooth Plate",
    "Lapped beats banded beats smooth. Produce the bottom of the rank.",
    { PLATE: ["Pl_lapped", "Pl_smooth"] }, { PLATE: ["Pl_banded", "Pl_smooth"] },
    [trait("plate", "smooth")], 2),
  t("bh-3", 2, "bramblehog", "Dense Thicket",
    "Spine density blends. Take it to the top and hold it there.",
    { SPINE: ["Sd_dense", "Sd_even"] }, { SPINE: ["Sd_dense", "Sd_sparse"] },
    [trait("spines", "Dense"), homo("SPINE", "Sd_dense")], 4, LENS),
  t("bh-4", 2, "bramblehog", "Masked and Ticked",
    "Both marking layers on one animal.",
    { MARK: ["Mt", "Mn"] }, { MARK: ["Mm", "Mn"] },
    [trait("markings", "mask+ticks")], 3),
  t("bh-5", 3, "bramblehog", "Naked Under the Switch",
    "The keratin gate hides the spines entirely. Prove an animal carries dense spines while showing none.",
    { KER: ["k", "k"], SPINE: ["Sd_dense", "Sd_dense"] }, { KER: ["K", "k"], SPINE: ["Sd_sparse", "Sd_even"] },
    [trait("keratin", "naked"), carries("SPINE", "Sd_dense")], 3, BENCH),
  t("bh-6", 3, "bramblehog", "Glass in the Armour",
    "Glassy spine is a lethal that only hurts when it meets itself. Clear the line without losing the plate.",
    { GLASSPINE: ["GS_star", "GS_wild"], PLATE: ["Pl_lapped", "Pl_lapped"] },
    { GLASSPINE: ["GS_star", "GS_wild"], PLATE: ["Pl_lapped", "Pl_banded"] },
    [clear, trait("plate", "lapped")], 4, BENCH),
  t("bh-7", 4, "bramblehog", "Thicket, Fixed",
    "A novel spine allele in one parent. Two copies in the answer.",
    { SPINE: ["Sd_thicket", "Sd_even"] }, { SPINE: ["Sd_even", "Sd_sparse"] },
    [homo("SPINE", "Sd_thicket")], 5, BENCH),
  t("bh-8", 4, "bramblehog", "Nothing Moves It",
    "Vigour at the top of a species built for it, and both lethals gone.",
    { VIG_A: ["VA2", "VA2"], VIG_C: ["VC2", "VC1"], GLASSPINE: ["GS_star", "GS_wild"] },
    { VIG_A: ["VA2", "VA1"], VIG_C: ["VC2", "VC2"], CHALKBONE: ["CB_star", null] },
    [stat("vigour", 145), clear], 4, BENCH),
  t("bh-9", 5, "bramblehog", "The Thornbrake Standard",
    "Dense spines breeding true, lapped plate, a full ruff and a clean panel.",
    { SPINE: ["Sd_dense", "Sd_even"], PLATE: ["Pl_lapped", "Pl_banded"], RUFF: ["Rf_full", null] },
    { SPINE: ["Sd_dense", "Sd_sparse"], PLATE: ["Pl_lapped", "Pl_smooth"], RUFF: ["Rf_none", "Rf_full"] },
    [homo("SPINE", "Sd_dense"), trait("plate", "lapped"), clear], 5, DEEP),

  // --- Kite-Ossel ----------------------------------------------------------
  t("ko-1", 1, "kiteossel", "Wingless",
    "A recessive turns the whole membrane off. Produce one, deliberately.",
    { MEM: ["M", "m"] }, { MEM: ["M", "m"] },
    [trait("membrane", "wingless")], 2),
  t("ko-2", 1, "kiteossel", "The Stub Rudder",
    "Forked beats whip beats stub. Find the bottom.",
    { TAIL: ["Tf", "Ts"] }, { TAIL: ["Tw", "Ts"] },
    [trait("tail", "stub")], 2),
  t("ko-3", 2, "kiteossel", "Broad Span, Fixed",
    "Membrane span blends across three alleles. Fix the widest.",
    { SPAN: ["Sp_broad", "Sp_even"] }, { SPAN: ["Sp_broad", "Sp_short"] },
    [trait("span", "Broad"), homo("SPAN", "Sp_broad")], 4, LENS),
  t("ko-4", 2, "kiteossel", "Fringe and Scallop",
    "Both edge treatments on one wing.",
    { EDGE: ["Ef", "En"] }, { EDGE: ["Es", "En"] },
    [trait("edge", "fringe+scallop")], 3),
  t("ko-5", 3, "kiteossel", "Lost the Trait and the Evidence",
    "A wingless bird shows you nothing about its pattern. Prove one carries rays.",
    { MEM: ["m", "m"], MARK: ["Mr", "Mr"] }, { MEM: ["M", "m"], MARK: ["Me", "Mn"] },
    [trait("membrane", "wingless"), carries("MARK", "Mr")], 3, BENCH),
  t("ko-6", 3, "kiteossel", "Two Lethals on the Cliff",
    "Hollow bone and salt eye. Clear both and keep the span.",
    { HOLLOW: ["HB_star", "HB_wild"], SALTBLIND: ["SB_star", "SB_wild"], SPAN: ["Sp_broad", "Sp_even"] },
    { HOLLOW: ["HB_star", "HB_wild"], SALTBLIND: ["SB_wild", "SB_wild"], SPAN: ["Sp_broad", "Sp_short"] },
    [clear, trait("span", "Broad")], 4, BENCH),
  t("ko-7", 4, "kiteossel", "Stormspan",
    "The novel span allele, two copies, in a bird that can still fly.",
    { SPAN: ["Sp_storm", "Sp_even"], MEM: ["M", "M"] }, { SPAN: ["Sp_even", "Sp_short"], MEM: ["M", "m"] },
    [homo("SPAN", "Sp_storm"), trait("membrane", "formed")], 5, BENCH),
  t("ko-8", 4, "kiteossel", "First or Not At All",
    "Speed at the ceiling of the fastest species on the roster, and nothing lethal in it.",
    { SPD_A: ["SA2", "SA2"], SPD_C: ["SC2", "SC1"], HOLLOW: ["HB_star", "HB_wild"] },
    { SPD_A: ["SA2", "SA1"], SPD_C: ["SC2", "SC2"], SALTBLIND: ["SB_star", "SB_wild"] },
    [stat("speed", 148), clear], 4, BENCH),
  t("ko-9", 5, "kiteossel", "The Galeshore Specification",
    "A flying bird with a fixed broad span, a bold mask and a clean panel. Five generations.",
    { SPAN: ["Sp_broad", "Sp_even"], MASK: ["Mk_bold", null], HOLLOW: ["HB_star", "HB_wild"], MEM: ["M", "m"] },
    { SPAN: ["Sp_broad", "Sp_short"], MASK: ["Mk_plain", "Mk_bold"], HOLLOW: ["HB_wild", "HB_wild"], MEM: ["M", "M"] },
    [homo("SPAN", "Sp_broad"), trait("membrane", "formed"), clear], 5, DEEP),

  // --- Silt-Adder ----------------------------------------------------------
  t("sa-1", 1, "siltadder", "Smooth Skin",
    "One switch, two alleles. Turn the scales off.",
    { SCALE: ["Sc", "sc"] }, { SCALE: ["Sc", "sc"] },
    [trait("scale", "smooth")], 2),
  t("sa-2", 1, "siltadder", "The Fine Head",
    "Blunt beats wedge beats fine. Produce the bottom of the rank.",
    { HEAD: ["Hd_blunt", "Hd_fine"] }, { HEAD: ["Hd_wedge", "Hd_fine"] },
    [trait("head", "fine")], 2),
  t("sa-3", 2, "siltadder", "Endless Coils",
    "Coil count blends. Take it to the top and fix it.",
    { COILS: ["Cl_long", "Cl_even"] }, { COILS: ["Cl_long", "Cl_stub"] },
    [trait("coils", "Long"), homo("COILS", "Cl_long")], 4, LENS),
  t("sa-4", 2, "siltadder", "Rings and Diamonds",
    "Both marking layers, on an animal that is mostly marking.",
    { MARK: ["Mr", "Mn"] }, { MARK: ["Md", "Mn"] },
    [trait("markings", "diamonds+rings")], 3),
  t("sa-5", 3, "siltadder", "In Repulsion",
    "Knot and clear-blood, eleven centimorgans apart, on opposite haplotypes. Clear both.",
    { KNOT: ["KN_star", "KN_wild"], CLEARBLOOD: ["CB_wild", "CB_star"] },
    { KNOT: ["KN_star", "KN_wild"], CLEARBLOOD: ["CB_wild", "CB_star"] },
    [clear], 4, CROSSOVER),
  t("sa-6", 3, "siltadder", "Under the Smooth",
    "The scale switch hides the pattern work. Prove an adder carries diamonds without showing them.",
    { SCALE: ["sc", "sc"], MARK: ["Md", "Md"] }, { SCALE: ["Sc", "sc"], MARK: ["Mr", "Mn"] },
    [trait("scale", "smooth"), carries("MARK", "Md")], 3, BENCH),
  t("sa-7", 4, "siltadder", "Potent",
    "The rarest venom allele on the X, fixed, in an animal carrying no lethal.",
    { VENOM: ["Vn_potent", null], KNOT: ["KN_star", "KN_wild"] },
    { VENOM: ["Vn_mild", "Vn_none"], KNOT: ["KN_wild", "KN_wild"] },
    [homo("VENOM", "Vn_potent"), clear], 5, BENCH),
  t("sa-8", 4, "siltadder", "Nothing Wasted",
    "Focus at the top of the species, and a clean lethal panel out of a line that has both.",
    { FOC_A: ["FA2", "FA2"], FOC_C: ["FC2", "FC1"], KNOT: ["KN_star", "KN_wild"] },
    { FOC_A: ["FA2", "FA1"], FOC_C: ["FC2", "FC2"], CLEARBLOOD: ["CB_star", "CB_wild"] },
    [stat("focus", 124), clear], 4, BENCH),
  t("sa-9", 5, "siltadder", "The Deepfen Specification",
    "A threaded adder, long in the coil, clean of both lethals. Five generations.",
    { MARK: ["M_thread", "Mn"], COILS: ["Cl_long", "Cl_even"], KNOT: ["KN_star", "KN_wild"] },
    { MARK: ["Mr", "Mn"], COILS: ["Cl_long", "Cl_stub"], CLEARBLOOD: ["CB_star", "CB_wild"] },
    [carries("MARK", "M_thread"), homo("COILS", "Cl_long"), clear], 5, DEEP),

  // --- Ashen Lorric --------------------------------------------------------
  t("al-1", 1, "ashenlorric", "Fused Toes",
    "The one locus on this animal that behaves the way a beginner expects.",
    { TOE: ["To_splayed", "To_fused"] }, { TOE: ["To_splayed", "To_fused"] },
    [trait("toes", "fused")], 2),
  t("al-2", 1, "ashenlorric", "Hooks and Pads",
    "Co-dominance. Both grips on one hand.",
    { GRIP: ["Gp_pad", "Gp_plain"] }, { GRIP: ["Gp_hook", "Gp_plain"] },
    [trait("grip", "hooks+pads")], 2),
  t("al-3", 2, "ashenlorric", "Long in the Limb",
    "Limb length blends across three alleles. Fix the longest.",
    { LIMB: ["Lm_long", "Lm_even"] }, { LIMB: ["Lm_long", "Lm_short"] },
    [trait("limbs", "Long"), homo("LIMB", "Lm_long")], 4, LENS),
  t("al-4", 2, "ashenlorric", "Broken Cascade",
    "One half of a two-stage switch, on its own. It should do nothing at all.",
    { CASCADE: ["Cs", "cs"] }, { CASCADE: ["Cs", "cs"] },
    [trait("cascade", "broken"), trait("ash", "sound")], 3, LENS),
  t("al-5", 3, "ashenlorric", "Both Halves",
    "Ashen needs the gate *and* the cascade. Produce it on purpose.",
    { ASH: ["As", "as"], CASCADE: ["Cs", "cs"] }, { ASH: ["As", "as"], CASCADE: ["Cs", "cs"] },
    [trait("ash", "ashen"), trait("cascade", "broken")], 3, BENCH),
  t("al-6", 3, "ashenlorric", "Colour Behind the Ash",
    "Prove an ashen animal is still carrying its colour work underneath.",
    { ASH: ["as", "as"], CASCADE: ["cs", "cs"], MARK: ["Mv", "Mv"] },
    { ASH: ["As", "as"], CASCADE: ["Cs", "cs"], MARK: ["Ms", "Mn"] },
    [trait("ash", "ashen"), carries("MARK", "Mv")], 3, BENCH),
  t("al-7", 4, "ashenlorric", "Barbed",
    "The novel grip allele, two copies, in an animal that is not ashen.",
    { GRIP: ["Gp_barbed", "Gp_plain"], ASH: ["As", "as"] }, { GRIP: ["Gp_pad", "Gp_plain"], ASH: ["As", "As"] },
    [homo("GRIP", "Gp_barbed"), trait("ash", "sound")], 5, BENCH),
  t("al-8", 4, "ashenlorric", "The Long Patient Climb",
    "Vigour and focus both well up, out of a line carrying both lethals.",
    { VIG_A: ["VA2", "VA2"], VIG_B: ["VB2", "VB1"], VIG_C: ["VC2", "VC1"],
      FOC_A: ["FA2", "FA1"], FOC_B: ["FB2", null], FOC_C: ["FC2", "FC1"],
      EMBERHEART: ["EH_star", "EH_wild"] },
    { VIG_A: ["VA2", "VA1"], VIG_B: ["VB2", "VB2"], VIG_C: ["VC2", "VC2"],
      FOC_A: ["FA2", "FA2"], FOC_B: ["FB2", "FB1"], FOC_C: ["FC2", "FC2"],
      STONELUNG: ["SL_star", "SL_wild"] },
    [stat("vigour", 118), stat("focus", 118), clear], 5, BENCH),
  t("al-9", 5, "ashenlorric", "The Ashlands Specification",
    "A broad collar, long limbs breeding true, a clean panel, and the colour work visible.",
    { LIMB: ["Lm_long", "Lm_even"], COLLAR: ["Co_broad", null], ASH: ["As", "as"], EMBERHEART: ["EH_star", "EH_wild"] },
    { LIMB: ["Lm_long", "Lm_short"], COLLAR: ["Co_none", "Co_broad"], ASH: ["As", "As"], EMBERHEART: ["EH_wild", "EH_wild"] },
    [homo("LIMB", "Lm_long"), trait("ash", "sound"), clear], 5, DEEP),
];

const BY_ID = new Map(TRIALS.map((trial) => [trial.id, trial]));

export function trialById(id: string): Trial {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown trial "${id}"`);
  return found;
}

export function trialsForSpecies(species: SpeciesId): Trial[] {
  return TRIALS.filter((trial) => trial.species === species);
}

export function trialsByTier(tier: number): Trial[] {
  return TRIALS.filter((trial) => trial.tier === tier);
}
