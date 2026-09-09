/**
 * The campaign (§4.1): eight chapters, one genetic concept each.
 *
 * Two decisions shape this file.
 *
 * **The chapters are built from the gene map, not hard-coded against one
 * species.** A chapter that named `DORSAL` and `LN_star` would teach dominance
 * on a Quillfen and nothing at all on a Silt-Adder. Instead each chapter picks
 * its targets out of whatever species the ranch is running — its cleanest
 * dominance locus, its tightest linked pair, its epistatic switch, its lethals
 * — so chapter 4 on an Ashen Lorric genuinely poses the two-stage cascade that
 * chapter 4 on a Quillfen does not. The prose says what the concept is; the map
 * says what the animal is.
 *
 * **Objectives are predicates over the save, and they are sticky.** Nothing
 * here is a quest flag set by a handler somewhere else: an objective is a
 * question asked of `RanchState`, re-asked after every action, and remembered
 * once true. That means a chapter cannot be completed by doing the right thing
 * in the wrong order, cannot be lost when the creature that satisfied it dies,
 * and can be tested without simulating a player.
 *
 * The story is a restoration, not a competition. The fen was farmed to a
 * bottleneck by somebody else; the player's commission is to put working
 * populations back into it. Every chapter is a delivery to the wild, which is
 * why the finale asks for a *pair that breeds true* rather than a champion.
 */

import type {
  AlleleDef,
  AlleleId,
  EpistasisRule,
  GeneMap,
  Genome,
  Haplotype,
  LocusDef,
  Phenotype,
  StatId,
} from "@chimaera/genetics";
import { genotypeAt, recombinationFraction } from "@chimaera/genetics";
import type { Creature, GameEvent, RanchState } from "./types.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type ChapterId = "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c7" | "c8";

export interface CampaignState {
  /** 1-8 while playing; `CHAPTER_COUNT + 1` once the last one is delivered. */
  readonly chapter: number;
  /** Objective ids satisfied, across all chapters. Append-only. */
  readonly met: readonly string[];
  readonly completed: readonly ChapterId[];
}

export const CHAPTER_COUNT = 8;

export const NEW_CAMPAIGN: CampaignState = { chapter: 1, met: [], completed: [] };

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

/**
 * Everything an objective is allowed to look at.
 *
 * The phenotype comes in as a function rather than a table because expressing
 * a genome is not free and most objectives only need one or two creatures. The
 * ranch supplies its cached version.
 */
export interface CampaignView {
  readonly state: RanchState;
  readonly map: GeneMap;
  readonly phenotype: (creature: Creature) => Phenotype;
}

/** The screen where an objective is actually carried out. */
export type ObjectiveScreen = "pairing" | "ranch" | "field";

export interface Objective {
  readonly id: string;
  /** What the commission asks for. Shown before it is met. */
  readonly label: string;
  /** Why it was worth asking. Shown after. */
  readonly lesson: string;
  /**
   * Where the player does this.
   *
   * Knowing what the board wants is not the same as knowing which of nine tabs
   * to open, and a player who has to find that out by exploring has been given
   * a puzzle nobody meant to set. Breeding is the answer often enough to be the
   * default, so only the exceptions say so.
   */
  readonly where?: ObjectiveScreen;
  /**
   * Events from the action just applied. Most objectives ignore them; the ones
   * that cannot (a lethal egg is a moment, not a state) do not.
   */
  readonly test: (view: CampaignView, events: readonly GameEvent[]) => boolean;
}

export interface ChapterReward {
  readonly motes: number;
  readonly items: Readonly<Record<string, number>>;
}

export interface Chapter {
  readonly id: ChapterId;
  readonly number: number;
  readonly title: string;
  /** The one concept. If a chapter needs two, it is two chapters. */
  readonly concept: string;
  readonly premise: string;
  readonly briefing: string;
  readonly closing: string;
  readonly objectives: readonly Objective[];
  readonly reward: ChapterReward;
}

// ---------------------------------------------------------------------------
// Targets: what this species offers each lesson
// ---------------------------------------------------------------------------

export interface LinkedPair {
  readonly near: LocusDef;
  readonly far: LocusDef;
  /** The allele worth having at `near` — the rarest one that is not a lethal. */
  readonly prize: AlleleDef;
  /** The allele it travels with at `far`, and the reason to want them apart. */
  readonly drag: AlleleDef;
  readonly centimorgans: number;
  readonly recombination: number;
}

export interface CampaignTargets {
  readonly dominance: LocusDef;
  readonly dominant: AlleleDef;
  readonly recessive: AlleleDef;
  readonly stat: StatId;
  readonly statMin: number;
  readonly statMax: number;
  readonly linked: LinkedPair;
  readonly epistasis: EpistasisRule;
  readonly gateAllele: AlleleId;
  readonly lethals: readonly { readonly locus: LocusDef; readonly allele: AlleleDef }[];
  readonly novel: readonly { readonly locus: LocusDef; readonly allele: AlleleDef }[];
}

function wildAlleles(locus: LocusDef): AlleleDef[] {
  return locus.alleles.filter((allele) => (allele.wildFrequency ?? 0) > 0);
}

/**
 * A locus whose dominance is legible: two or more wild alleles, a visible
 * trait, autosomal, no lethals, expressed in both sexes, and taking part in no
 * epistatic gate.
 *
 * Chapter 1 has to be teachable in ten minutes. A sex-limited locus that a hen
 * carries invisibly is a *later* lesson; a locus with a lethal in it teaches
 * chapter 5 by accident; and a locus inside a gate teaches chapter 4 by
 * accident, which on the Ashen Lorric would have handed a player the second
 * stage of its cascade as their first ever Punnett square.
 */
function pickDominanceLocus(map: GeneMap): LocusDef {
  const gated = new Set<string>();
  for (const rule of map.species.epistasis) {
    gated.add(rule.gate);
    for (const extra of rule.also ?? []) gated.add(extra.locus);
    for (const locus of map.loci) {
      if (locus.tags?.some((tag) => rule.masksTags.includes(tag))) gated.add(locus.id);
    }
  }
  const candidates = map.loci.filter(
    (locus) =>
      locus.mode.kind === "dominance" &&
      locus.trait !== undefined &&
      locus.onlyOn === undefined &&
      locus.expressedInSex === undefined &&
      !gated.has(locus.id) &&
      locus.alleles.every((allele) => allele.lethal === undefined) &&
      wildAlleles(locus).length >= 2,
  );
  // Most wild alleles first: the more forms it has, the more the recessive is
  // worth deducing. Ties break on authored order, so the choice is stable.
  const best = candidates.sort((a, b) => wildAlleles(b).length - wildAlleles(a).length)[0];
  if (!best) {
    throw new Error(`species "${map.species.id}" has no plain dominance locus for chapter 1`);
  }
  return best;
}

function byDominance(alleles: readonly AlleleDef[]): AlleleDef[] {
  return [...alleles].sort((a, b) => (b.dominance ?? 0) - (a.dominance ?? 0));
}

/**
 * The two loci on one autosome that sit closest together, plus the allele pair
 * that makes the distance matter.
 *
 * "Closest" is the right measure because the chapter's whole claim is that
 * these two genes are not independent. A lethal on the far locus is preferred
 * as the drag when one exists — a linkage lesson lands hardest when the thing
 * you cannot shake off is the thing that kills the clutch.
 */
function pickLinkedPair(map: GeneMap): LinkedPair {
  let best: LinkedPair | undefined;
  for (const chromosome of map.chromosomes) {
    if (chromosome.def.type !== "autosome") continue;
    const loci = chromosome.loci;
    for (let i = 0; i < loci.length; i++) {
      for (let j = i + 1; j < loci.length; j++) {
        const a = loci[i];
        const b = loci[j];
        if (!a || !b) continue;
        const distance = Math.abs(b.position - a.position);
        if (distance < 1) continue;
        const pair = describePair(a, b, distance);
        if (!pair) continue;
        if (!best || better(pair, best)) best = pair;
      }
    }
  }
  if (!best) throw new Error(`species "${map.species.id}" has no linked pair for chapter 3`);
  return best;
}

/** A pair with a lethal drag beats a shorter one without. Then: shorter wins. */
function better(candidate: LinkedPair, incumbent: LinkedPair): boolean {
  const candidateLethal = candidate.drag.lethal !== undefined;
  const incumbentLethal = incumbent.drag.lethal !== undefined;
  if (candidateLethal !== incumbentLethal) return candidateLethal;
  return candidate.centimorgans < incumbent.centimorgans;
}

function describePair(a: LocusDef, b: LocusDef, distance: number): LinkedPair | undefined {
  const forward = orient(a, b, distance);
  const backward = orient(b, a, distance);
  if (!forward) return backward;
  if (!backward) return forward;
  return better(forward, backward) ? forward : backward;
}

/** `near` carries the prize, `far` carries the drag. Both must exist in the wild. */
function orient(near: LocusDef, far: LocusDef, distance: number): LinkedPair | undefined {
  const prize = rarestWild(near, (allele) => allele.lethal === undefined);
  const drag = rarestWild(far, () => true);
  if (!prize || !drag) return undefined;
  return {
    near,
    far,
    prize,
    drag,
    centimorgans: distance,
    recombination: recombinationFraction(distance / 100),
  };
}

function rarestWild(locus: LocusDef, keep: (allele: AlleleDef) => boolean): AlleleDef | undefined {
  const lethal = locus.alleles.find((allele) => allele.lethal !== undefined && keep(allele));
  if (lethal) return lethal;
  return wildAlleles(locus)
    .filter(keep)
    .sort((a, b) => (a.wildFrequency ?? 1) - (b.wildFrequency ?? 1))[0];
}

export function campaignTargets(map: GeneMap): CampaignTargets {
  const dominance = pickDominanceLocus(map);
  const ranked = byDominance(wildAlleles(dominance));
  const dominant = ranked[0];
  const recessive = ranked[ranked.length - 1];
  if (!dominant || !recessive) throw new Error(`locus ${dominance.id} has no wild alleles`);

  // The stat with the most loci behind it: the more loci, the more the bell
  // curve is the point, and the harder it is to fluke.
  const stat = [...map.polygenicTraits].sort((a, b) => b.loci.length - a.loci.length)[0];
  if (!stat) throw new Error(`species "${map.species.id}" has no polygenic trait for chapter 2`);

  const epistasis = map.species.epistasis[0];
  if (!epistasis) throw new Error(`species "${map.species.id}" has no epistasis rule for chapter 4`);

  const lethals: { locus: LocusDef; allele: AlleleDef }[] = [];
  const novel: { locus: LocusDef; allele: AlleleDef }[] = [];
  for (const locus of map.loci) {
    for (const allele of locus.alleles) {
      if (allele.lethal) lethals.push({ locus, allele });
      if (allele.novel) novel.push({ locus, allele });
    }
  }
  if (lethals.length < 2) throw new Error(`species "${map.species.id}" needs two lethals for chapter 5`);
  if (novel.length === 0) throw new Error(`species "${map.species.id}" has no novel allele for chapter 7`);

  return {
    dominance,
    dominant,
    recessive,
    stat: stat.id,
    statMin: stat.min,
    statMax: stat.max,
    linked: pickLinkedPair(map),
    epistasis,
    gateAllele: epistasis.when.allele,
    lethals,
    novel,
  };
}

// ---------------------------------------------------------------------------
// Predicate helpers
// ---------------------------------------------------------------------------

/** Everything that ever drew breath on this ranch and is still on the books. */
function everyone(view: CampaignView): readonly Creature[] {
  return [...view.state.creatures, ...view.state.archive];
}

function living(view: CampaignView): Creature[] {
  return view.state.creatures.filter((c) => c.status === "active" && c.stage !== "egg");
}

function hatched(view: CampaignView): Creature[] {
  return everyone(view).filter((c) => c.stage !== "egg" && !c.doomed);
}

function byId(view: CampaignView, id: string | undefined): Creature | undefined {
  if (id === undefined) return undefined;
  return everyone(view).find((c) => c.id === id);
}

function parentsOf(view: CampaignView, creature: Creature): Creature[] {
  return [byId(view, creature.sireId), byId(view, creature.damId)].filter(
    (c): c is Creature => c !== undefined,
  );
}

function carries(creature: Creature, locus: LocusDef, allele: AlleleId): boolean {
  return genotypeAt(creature.genome, locus).includes(allele);
}

function carriesAnyLethal(creature: Creature, targets: CampaignTargets): boolean {
  return targets.lethals.some(({ locus, allele }) =>
    genotypeAt(creature.genome, locus).includes(allele.id),
  );
}

function carriesNovel(creature: Creature, targets: CampaignTargets): boolean {
  return targets.novel.some(({ locus, allele }) =>
    genotypeAt(creature.genome, locus).includes(allele.id),
  );
}

/** The two haplotypes of one chromosome, or nothing if the genome lacks it. */
function haplotypes(genome: Genome, chromosome: string): readonly Haplotype[] {
  const pair = genome.chromosomes[chromosome];
  return pair ? [pair.maternal, pair.paternal] : [];
}

function alleleOn(haplotype: Haplotype, locus: LocusDef): AlleleId | undefined {
  return haplotype.genes[locus.id]?.[0];
}

/** The allele combinations this genome carries *on single haplotypes*. */
function haplotypeKeys(genome: Genome, pair: LinkedPair): Set<string> {
  const keys = new Set<string>();
  for (const haplotype of haplotypes(genome, pair.near.chromosome)) {
    const near = alleleOn(haplotype, pair.near);
    const far = alleleOn(haplotype, pair.far);
    if (near !== undefined && far !== undefined) keys.add(`${near}|${far}`);
  }
  return keys;
}

/**
 * True when this creature carries a combination on one haplotype that neither
 * parent could have handed it whole.
 *
 * A child's haplotype comes intact from one parent unless it was cut, so a
 * combination no parent carried *is* a crossover — no probability argument
 * required, which is what makes this a fair thing to ask of a player.
 */
function isRecombinant(view: CampaignView, creature: Creature, pair: LinkedPair): boolean {
  const parents = parentsOf(view, creature);
  if (parents.length < 2) return false;
  const parental = new Set<string>();
  for (const parent of parents) for (const key of haplotypeKeys(parent.genome, pair)) parental.add(key);
  for (const key of haplotypeKeys(creature.genome, pair)) {
    if (!parental.has(key)) return true;
  }
  return false;
}

/** A haplotype carrying the prize and free of the drag: the coupling broken. */
function hasCleanHaplotype(creature: Creature, pair: LinkedPair): boolean {
  for (const haplotype of haplotypes(creature.genome, pair.near.chromosome)) {
    if (alleleOn(haplotype, pair.near) === pair.prize.id && alleleOn(haplotype, pair.far) !== pair.drag.id) {
      return true;
    }
  }
  return false;
}

function statOf(view: CampaignView, creature: Creature, stat: StatId): number {
  return view.phenotype(creature).stats[stat] ?? 0;
}

/** A share of the species' range, so a threshold means the same thing for all six. */
function statThreshold(targets: CampaignTargets, share: number): number {
  return targets.statMin + (targets.statMax - targets.statMin) * share;
}

function trait(view: CampaignView, creature: Creature, locus: LocusDef): string | undefined {
  return locus.trait === undefined ? undefined : view.phenotype(creature).traits[locus.trait];
}

function isLethalLocus(targets: CampaignTargets, locusId: string | undefined): boolean {
  return locusId !== undefined && targets.lethals.some(({ locus }) => locus.id === locusId);
}

// ---------------------------------------------------------------------------
// The chapters
// ---------------------------------------------------------------------------

export function buildCampaign(map: GeneMap): readonly Chapter[] {
  const t = campaignTargets(map);
  const species = map.species.name;
  const traitName = t.dominance.name.toLowerCase();

  const chapters: Chapter[] = [
    {
      id: "c1",
      number: 1,
      title: "What the Fen Kept",
      concept: "Simple dominance",
      premise:
        `The station's last warden left four ${species} and a ledger with the last thirty pages torn out. ` +
        `The fen outside is not empty, but it is thin: one form of everything, and that form is the loud one.`,
      briefing:
        `The commission is small and it is not optional. The restoration board wants the ${traitName} ` +
        `they remember — ${t.recessive.name.toLowerCase()} — back in the fen, and every animal you have been ` +
        `left shows ${t.dominant.name.toLowerCase()}. Nobody can tell you which of them is hiding the other form. ` +
        `Pair them until one is honest with you — and if four animals genuinely do not carry it between them, ` +
        `the fen still does. Go and catch some.`,
      closing:
        `A dominant allele is not a common allele — it is a loud one. ${t.recessive.name} was in the herd the ` +
        `whole time, in animals that never showed it, and the only instrument that finds it is a pairing.`,
      objectives: [
        {
          id: "c1-recessive",
          label: `Breed a ${species} showing ${t.recessive.name.toLowerCase()} ${traitName} from two parents that do not`,
          lesson: `Two parents showing ${t.dominant.name.toLowerCase()} can only produce this if both were carriers.`,
          // A wild-caught animal that happens to show it proves nothing and
          // teaches nothing. The lesson is the *cross*, so the cross is what
          // the objective asks for.
          test: (view) =>
            hatched(view).some((c) => {
              if (trait(view, c, t.dominance) !== t.recessive.phenotype) return false;
              const parents = parentsOf(view, c);
              return (
                parents.length === 2 &&
                parents.every((p) => trait(view, p, t.dominance) !== t.recessive.phenotype)
              );
            }),
        },
        {
          id: "c1-carrier",
          where: "ranch",
          label: `Identify a carrier: a ${species} showing ${t.dominant.name.toLowerCase()} that is proven to carry ${t.recessive.name.toLowerCase()}`,
          lesson:
            "A revealed heterozygote is worth more than a homozygote you guessed at, because you can plan with it.",
          test: (view) =>
            living(view).some(
              (c) =>
                c.revealed.includes(t.dominance.id) &&
                trait(view, c, t.dominance) === t.dominant.phenotype &&
                carries(c, t.dominance, t.recessive.id),
            ),
        },
      ],
      reward: { motes: 250, items: { "field-lens": 3 } },
    },

    {
      id: "c2",
      number: 2,
      title: "The Long Average",
      concept: "Polygenic inheritance",
      premise:
        `The board has read your ledger and decided you are a serious person. They would now like a ${species} ` +
        `that can cross the open water at Hallow Reach, which is a question about ${t.stat} and not about looks.`,
      briefing:
        `${capitalise(t.stat)} is not one gene. It is ${map.polygenicTrait(t.stat).loci.length} of them, adding up, ` +
        `and no single pairing will hand you the top of the range. Breed for the average and let the tail come to you: ` +
        `the commission is a ${species} that outruns both of its parents, and then one near the ceiling of what the ` +
        `species can do at all.`,
      closing:
        "Polygenic traits regress to the mean and then, occasionally, do not. A child beyond both parents is not " +
        "luck — it is the one gamete in a hundred that collected the good half of every locus at once. Your job is " +
        "to make that gamete likely.",
      objectives: [
        {
          id: "c2-transgressive",
          label: `Breed a ${species} whose ${t.stat} ceiling exceeds both of its parents'`,
          lesson:
            "Additive loci recombine. Two middling parents hold, between them, the makings of something better than either.",
          test: (view) =>
            hatched(view).some((c) => {
              const parents = parentsOf(view, c);
              if (parents.length < 2) return false;
              const value = statOf(view, c, t.stat);
              return parents.every((p) => value > statOf(view, p, t.stat));
            }),
        },
        {
          id: "c2-ceiling",
          label: `Raise a living ${species} with a ${t.stat} ceiling above ${Math.round(statThreshold(t, 0.72))}`,
          lesson: `The top of the range needs most of the ${map.polygenicTrait(t.stat).loci.length} loci pulling the same way.`,
          test: (view) => living(view).some((c) => statOf(view, c, t.stat) >= statThreshold(t, 0.72)),
        },
      ],
      reward: { motes: 400, items: { "assay-bench": 1, "fertility-tonic": 2 } },
    },

    {
      id: "c3",
      number: 3,
      title: "Travelling Companions",
      concept: "Linkage and crossover",
      premise:
        `Every ${species} in the fen that carries ${t.linked.prize.name} also carries ` +
        `${t.linked.drag.name}, and the board has noticed. They are ${t.linked.centimorgans.toFixed(0)} centimorgans ` +
        `apart on ${map.chromosome(t.linked.near.chromosome).def.name}, which is close enough that the wild population ` +
        `has never bothered to separate them.`,
      briefing:
        `${t.linked.prize.name} at ${t.linked.near.name} and ${t.linked.drag.name} at ${t.linked.far.name} travel ` +
        `together roughly ${((1 - t.linked.recombination) * 100).toFixed(0)} times in a hundred. You cannot select ` +
        `your way out of that; you have to wait for a crossover, or buy one. Deliver a ${species} that carries the ` +
        `first without the second.`,
      closing:
        "Two genes on the same chromosome are not independent, and distance is the only thing that makes them so. " +
        "A crossover inducer does not change which alleles exist — it changes how often the chromosome is cut " +
        "between them, which is the entire trick.",
      objectives: [
        {
          id: "c3-recombinant",
          label: `Breed a ${species} carrying a ${map.chromosome(t.linked.near.chromosome).def.name} haplotype neither parent had`,
          lesson: "A combination no parent carried whole is a crossover. You have watched one happen.",
          test: (view) => hatched(view).some((c) => isRecombinant(view, c, t.linked)),
        },
        {
          id: "c3-uncoupled",
          label: `Raise a living ${species} carrying ${t.linked.prize.name} on a haplotype free of ${t.linked.drag.name}`,
          lesson: `Roughly a ${(t.linked.recombination * 100).toFixed(1)}% chance per gamete. Patience, or a crossover inducer.`,
          test: (view) => living(view).some((c) => hasCleanHaplotype(c, t.linked)),
        },
      ],
      reward: { motes: 500, items: { "crossover-inducer": 2 } },
    },

    {
      id: "c4",
      number: 4,
      title: "The Switch",
      concept: "Epistasis",
      premise:
        `A ${species} has come in from the eastern flats with no pattern on it at all — not pale, not faded, ` +
        `simply absent — and its parents were both ordinary. The board's naturalist has written "sport" in the ` +
        `margin and moved on. She is wrong.`,
      briefing:
        `${t.epistasis.name} is one locus deciding whether others get to speak. Nothing is missing from that ` +
        `animal's genome; a gate is shut in front of it. Produce the shut gate deliberately, and then produce an ` +
        `animal that carries the same allele with the gate open, so the board can see the difference is not the gene.`,
      closing:
        "Epistasis is why a phenotype is not a readout. The masked animal still carries every colour allele it " +
        "ever had, and its offspring will show them the moment the gate opens again.",
      objectives: [
        {
          id: "c4-masked",
          label: `Produce a ${species} showing ${t.epistasis.name.toLowerCase()}`,
          lesson: "The gate is closed. Everything downstream of it has stopped speaking, not stopped existing.",
          test: (view) =>
            hatched(view).some((c) => view.phenotype(c).epistasisActive.includes(t.epistasis.id)),
        },
        {
          id: "c4-carrier",
          label: `Raise a living ${species} carrying the gate allele with the gate open`,
          lesson: "Same allele, visible animal. What changed was the dose, not the gene.",
          test: (view) =>
            living(view).some(
              (c) =>
                carries(c, view.map.locus(t.epistasis.gate), t.gateAllele) &&
                !view.phenotype(c).epistasisActive.includes(t.epistasis.id),
            ),
        },
      ],
      reward: { motes: 650, items: { "dominance-suppressor": 2, "field-lens": 4 } },
    },

    {
      id: "c5",
      number: 5,
      title: "The Cost of a Clutch",
      concept: "Lethal alleles",
      premise:
        `Six eggs in a row have failed at the end of incubation, and the board is asking whether the station ` +
        `should be closed. It should not. The ${species} you have been breeding is carrying something that only ` +
        `hurts when it meets itself.`,
      briefing:
        `${t.lethals.length} recessive lethals are known in this species. Find the one in your herd — the loss ` +
        `will tell you where to look — put a name to a carrier, and then produce a living animal out of that line ` +
        `that carries none of them. The fen does not need the allele gone. It needs you to know who has it.`,
      closing:
        "A recessive lethal survives because the heterozygote is fine, and often better than fine. Culling " +
        "carriers is how a small population loses everything else they were carrying too. Track them instead.",
      objectives: [
        {
          id: "c5-loss",
          label: "Lose an egg to a lethal allele",
          lesson: "It failed at hatching, not at conception — which is why it cost you a week and taught you something.",
          test: (_view, events) =>
            events.some((event) => event.kind === "eggFailed" && isLethalLocus(t, event.locus)),
        },
        {
          id: "c5-identified",
          where: "ranch",
          label: `Prove a living ${species} is a lethal carrier`,
          lesson: "A known carrier is a usable animal. An unknown one is a coin flip on every clutch.",
          test: (view) =>
            living(view).some((c) =>
              t.lethals.some(
                ({ locus, allele }) =>
                  c.revealed.includes(locus.id) && carries(c, locus, allele.id),
              ),
            ),
        },
        {
          id: "c5-cleared",
          label: "Breed a clear offspring from a carrier parent",
          lesson: "Half the gametes of a heterozygote are clean. You did not need to lose the line to lose the allele.",
          test: (view) =>
            living(view).some(
              (c) =>
                !carriesAnyLethal(c, t) &&
                parentsOf(view, c).some((parent) => carriesAnyLethal(parent, t)),
            ),
        },
      ],
      reward: { motes: 800, items: { "deep-sequencer": 1, "test-cross-kit": 2 } },
    },

    {
      id: "c6",
      number: 6,
      title: "Close Kin",
      concept: "Inbreeding and its depression",
      premise:
        `The board wants the Hallow Reach line fixed — the same animal, reliably, generation after generation — ` +
        `and there is exactly one way to fix a trait in a closed herd. It is also the way to ruin one.`,
      briefing:
        "Line-breed until the trait holds, then get out. Wright's F above 0.25 and the herd starts paying in " +
        "fertility, vigour and lifespan, and it does not stop paying when you stop breeding. Concentrate the line, " +
        "keep the herd's average survivable, and then rescue it with an outcross.",
      closing:
        "Inbreeding does not create bad alleles; it only makes the ones already there meet themselves. Four to " +
        "six generations of line-breeding is a tool. The seventh is a decision you cannot take back.",
      objectives: [
        {
          id: "c6-fixed",
          label: `Raise a living ${species} with F above 0.125 and a ${t.stat} ceiling above ${Math.round(statThreshold(t, 0.6))}`,
          lesson: "Line-breeding concentrates what is already there. It concentrated the good half too.",
          test: (view) =>
            living(view).some((c) => c.inbreeding > 0.125 && statOf(view, c, t.stat) >= statThreshold(t, 0.6)),
        },
        {
          id: "c6-herd",
          label: "Hold a herd of six or more with a mean F below 0.2 while a line is running",
          lesson: "The individual is not the population. Both have to survive the project.",
          test: (view) => {
            const herd = living(view);
            if (herd.length < 6) return false;
            if (!herd.some((c) => c.inbreeding > 0.125)) return false;
            const mean = herd.reduce((sum, c) => sum + c.inbreeding, 0) / herd.length;
            return mean < 0.2;
          },
        },
        {
          id: "c6-rescued",
          label: "Outcross the line: a living descendant of the inbred animal with F below 0.03",
          lesson: "One unrelated parent halves F in a single generation. That is the whole rescue.",
          test: (view) =>
            living(view).some(
              (c) => c.inbreeding < 0.03 && parentsOf(view, c).some((parent) => parent.inbreeding > 0.125),
            ),
        },
      ],
      reward: { motes: 1000, items: { "pedigree-extension": 1, "longevity-draught": 2 } },
    },

    {
      id: "c7",
      number: 7,
      title: "Nothing In The Record",
      concept: "Mutation and novel alleles",
      premise:
        `A ${species} has hatched at the station carrying something that is in no survey, no ledger and no wild ` +
        `population on the continent. The board would like to know whether you can do it again, and whether it ` +
        `survives being asked to.`,
      briefing:
        "Novel alleles do not arrive by selection — there is nothing to select. They arrive by mutation, at a rate " +
        "you can raise with a mutagen and a price paid in the parents' years. Find one, then get it into a second " +
        "generation, which is the only part that counts.",
      closing:
        "A novel allele in one animal is a curiosity. A novel allele in its offspring is a population. Mutation " +
        "makes new variation; only breeding keeps it.",
      objectives: [
        {
          id: "c7-novel",
          label: `Obtain a ${species} carrying an allele found in no wild population`,
          lesson: "Mutagens raise the rate. They do not choose the locus, and they cost both parents years.",
          test: (view) => everyone(view).some((c) => carriesNovel(c, t)),
        },
        {
          id: "c7-inherited",
          label: "Pass the novel allele to a second generation",
          lesson: "Half its gametes carry it. Two clutches is usually enough; one is a gamble.",
          test: (view) =>
            everyone(view).some(
              (c) => carriesNovel(c, t) && parentsOf(view, c).some((parent) => carriesNovel(parent, t)),
            ),
        },
      ],
      reward: { motes: 1200, items: { "mutagen-refined": 2 } },
    },

    {
      id: "c8",
      number: 8,
      title: "A Population, Not An Animal",
      concept: "Everything at once",
      premise:
        `The restoration is over when the fen can carry on without the station. That is not a champion. It is a ` +
        `breeding pair that produces the same animal a third time, out of stock healthy enough to keep doing it.`,
      briefing:
        `Deliver a male and a female ${species}, each showing ${t.recessive.name.toLowerCase()} ${traitName}, each ` +
        `with a ${t.stat} ceiling above ${Math.round(statThreshold(t, 0.7))}, each carrying no lethal allele, each ` +
        `with F below 0.0625 — and at least one of them carrying ${t.linked.prize.name} free of ` +
        `${t.linked.drag.name}. Then breed them and show the board a third animal that meets the same standard.`,
      closing:
        "Every constraint on that list fought a different one. That is the game: a genome is not a shopping list, " +
        "and the fen is not restored by the best animal you ever bred. It is restored by the second-best one, twice.",
      objectives: [
        {
          id: "c8-pair",
          label: "Assemble a breeding pair to specification",
          lesson: "Two animals, both to spec, opposite sexes, unrelated enough to pair. That is the hard part.",
          test: (view) => specPair(view, t) !== undefined,
        },
        {
          id: "c8-breeds-true",
          label: "Breed a third animal from that pair meeting the same specification",
          lesson: "The line breeds true. The fen can have it back.",
          test: (view) => {
            const pair = specPair(view, t);
            if (!pair) return false;
            return living(view).some(
              (c) =>
                c.id !== pair.sire.id &&
                c.id !== pair.dam.id &&
                meetsSpec(view, c, t) &&
                ((c.sireId === pair.sire.id && c.damId === pair.dam.id) ||
                  (c.sireId === pair.dam.id && c.damId === pair.sire.id)),
            );
          },
        },
      ],
      reward: { motes: 3000, items: { "prism-lens": 1, "deep-sequencer": 1 } },
    },
  ];

  return chapters;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The finale's standard, applied to one animal. */
function meetsSpec(view: CampaignView, creature: Creature, t: CampaignTargets): boolean {
  return (
    creature.status === "active" &&
    creature.stage !== "egg" &&
    trait(view, creature, t.dominance) === t.recessive.phenotype &&
    statOf(view, creature, t.stat) >= statThreshold(t, 0.7) &&
    !carriesAnyLethal(creature, t) &&
    creature.inbreeding < 0.0625
  );
}

function specPair(
  view: CampaignView,
  t: CampaignTargets,
): { readonly sire: Creature; readonly dam: Creature } | undefined {
  const qualified = living(view).filter((c) => meetsSpec(view, c, t));
  for (const sire of qualified.filter((c) => c.sex === "male")) {
    for (const dam of qualified.filter((c) => c.sex === "female")) {
      if (hasCleanHaplotype(sire, t.linked) || hasCleanHaplotype(dam, t.linked)) return { sire, dam };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

export interface CampaignOutcome {
  readonly campaign: CampaignState;
  /** Granted by the caller, which is the only thing that owns the inventory. */
  readonly reward?: ChapterReward | undefined;
  readonly events: readonly GameEvent[];
}

export function chapterOf(campaign: CampaignState, chapters: readonly Chapter[]): Chapter | undefined {
  return chapters[campaign.chapter - 1];
}

/**
 * Re-ask the active chapter's questions.
 *
 * Only the active chapter is evaluated. A player who happens to satisfy
 * chapter 7 while working through chapter 2 has not learned chapter 7 — and
 * more practically, letting later chapters complete out of order would hand
 * out a Deep Sequencer before the lesson that makes it worth owning.
 */
export function advanceCampaign(
  campaign: CampaignState,
  view: CampaignView,
  events: readonly GameEvent[],
  chapters: readonly Chapter[],
): CampaignOutcome {
  const chapter = chapterOf(campaign, chapters);
  if (!chapter) return { campaign, events: [] };

  const met = new Set(campaign.met);
  const out: GameEvent[] = [];
  for (const objective of chapter.objectives) {
    if (met.has(objective.id)) continue;
    if (!objective.test(view, events)) continue;
    met.add(objective.id);
    out.push({ kind: "objectiveMet", chapter: chapter.id, objective: objective.id, label: objective.label });
  }

  const complete = chapter.objectives.every((objective) => met.has(objective.id));
  if (!complete) {
    return { campaign: { ...campaign, met: [...met] }, events: out };
  }

  out.push({ kind: "chapterComplete", chapter: chapter.id, title: chapter.title, motes: chapter.reward.motes });
  return {
    campaign: {
      chapter: campaign.chapter + 1,
      met: [...met],
      completed: [...campaign.completed, chapter.id],
    },
    reward: chapter.reward,
    events: out,
  };
}

/** Progress for the UI: how far through the active chapter, and which parts. */
export interface ChapterProgress {
  readonly chapter: Chapter;
  readonly done: readonly string[];
  readonly remaining: readonly string[];
}

export function chapterProgress(
  campaign: CampaignState,
  chapters: readonly Chapter[],
): ChapterProgress | undefined {
  const chapter = chapterOf(campaign, chapters);
  if (!chapter) return undefined;
  const met = new Set(campaign.met);
  return {
    chapter,
    done: chapter.objectives.filter((o) => met.has(o.id)).map((o) => o.id),
    remaining: chapter.objectives.filter((o) => !met.has(o.id)).map((o) => o.id),
  };
}
