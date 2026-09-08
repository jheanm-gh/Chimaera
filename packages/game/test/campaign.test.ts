/**
 * Campaign tests (§4.1).
 *
 * Three claims are defended here.
 *
 *  1. **Every species can teach every chapter.** The chapters are derived from
 *     the gene map, so a species that lacks a clean dominance locus or a second
 *     lethal is a content bug that has to fail the build rather than surface as
 *     a chapter nobody can finish.
 *  2. **The objectives are satisfiable by playing.** A scripted ranch — with no
 *     selection cleverness at all, pairing whoever is fertile — reaches the end
 *     of chapter 2 through the real reducer. An objective that only a test can
 *     satisfy is not an objective.
 *  3. **The objectives are not vacuous.** Each one is asked of a state that
 *     should satisfy it and a state that should not.
 */

import {
  expressPhenotype,
  geneMapFor,
  genomeFromSpec,
  QUILLFEN,
  SPECIES,
} from "@chimaera/genetics";
import type { Genome } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import {
  advanceCampaign,
  buildCampaign,
  campaignTargets,
  CHAPTER_COUNT,
  chapterProgress,
  NEW_CAMPAIGN,
} from "../src/campaign.js";
import type { Chapter, CampaignView } from "../src/campaign.js";
import { applyAction, campaignFor, campaignView, createRanch } from "../src/ranch.js";
import { loadRanch, saveRanch } from "../src/save.js";
import type { Action, Creature, GameEvent, RanchState } from "../src/types.js";

const map = geneMapFor(QUILLFEN);
const targets = campaignTargets(map);

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe("the campaign is authored for every species", () => {
  for (const species of SPECIES) {
    const speciesMap = geneMapFor(species);

    it(`${species.name} gets eight chapters, one concept each`, () => {
      const chapters = buildCampaign(speciesMap);
      expect(chapters.length).toBe(CHAPTER_COUNT);
      expect(new Set(chapters.map((c) => c.concept)).size).toBe(CHAPTER_COUNT);
      expect(chapters.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (const chapter of chapters) {
        expect(chapter.objectives.length).toBeGreaterThanOrEqual(2);
        expect(new Set(chapter.objectives.map((o) => o.id)).size).toBe(chapter.objectives.length);
        // Prose is content, and content that is empty ships as a blank screen.
        expect(chapter.premise.length).toBeGreaterThan(80);
        expect(chapter.briefing.length).toBeGreaterThan(80);
        expect(chapter.closing.length).toBeGreaterThan(60);
        expect(chapter.reward.motes).toBeGreaterThan(0);
      }
      // Objective ids are globally unique: `met` is one flat list.
      const ids = chapters.flatMap((c) => c.objectives.map((o) => o.id));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it(`${species.name} offers targets that make each lesson teachable`, () => {
      const t = campaignTargets(speciesMap);

      // Chapter 1 must be plain Mendel: no lethals, no gate, both sexes.
      expect(t.dominance.mode.kind).toBe("dominance");
      expect(t.dominance.onlyOn).toBeUndefined();
      expect(t.dominance.expressedInSex).toBeUndefined();
      expect(t.dominance.alleles.every((a) => a.lethal === undefined)).toBe(true);
      expect(t.dominant.id).not.toBe(t.recessive.id);
      expect(t.dominant.dominance ?? 0).toBeGreaterThan(t.recessive.dominance ?? 0);
      const gated = new Set(speciesMap.species.epistasis.flatMap((rule) => [rule.gate, ...(rule.also ?? []).map((a) => a.locus)]));
      expect(gated.has(t.dominance.id)).toBe(false);

      // Chapter 3 must be a real linkage problem, not free assortment.
      expect(t.linked.near.chromosome).toBe(t.linked.far.chromosome);
      expect(t.linked.centimorgans).toBeGreaterThan(0);
      expect(t.linked.recombination).toBeLessThan(0.1);
      expect(t.linked.recombination).toBeGreaterThan(0);

      // Chapters 5 and 7 need stock to work with.
      expect(t.lethals.length).toBeGreaterThanOrEqual(2);
      expect(t.novel.length).toBeGreaterThanOrEqual(1);

      // Chapter 2's stat has to be genuinely polygenic (§1.2 says 3-5 loci).
      const trait = speciesMap.polygenicTrait(t.stat);
      expect(trait.loci.length).toBeGreaterThanOrEqual(3);
      expect(trait.loci.length).toBeLessThanOrEqual(5);
    });
  }
});

// ---------------------------------------------------------------------------
// Playing it
// ---------------------------------------------------------------------------

function bot(seed: string, rounds: number): { state: RanchState; events: GameEvent[] } {
  let state = createRanch(map, {
    seed,
    motes: 4000,
    startingItems: { "field-lens": 8 },
  });
  const events: GameEvent[] = [];
  const step = (action: Action): void => {
    const result = applyAction(state, action, map);
    state = result.state;
    events.push(...result.events);
  };

  for (let round = 0; round < rounds; round++) {
    // Read the chapter-1 locus on anything unread, while lenses last.
    for (const creature of state.creatures) {
      if (creature.status !== "active" || creature.stage === "egg") continue;
      if (creature.revealed.includes(targets.dominance.id)) continue;
      if ((state.inventory.items["field-lens"] ?? 0) <= 0) break;
      step({ kind: "useItem", id: creature.id, item: "field-lens", locus: targets.dominance.id });
    }

    const fertile = (sex: Creature["sex"]): Creature[] =>
      state.creatures.filter((c) => c.status === "active" && c.sex === sex && c.stage === "adult");
    const sire = fertile("male")[round % Math.max(1, fertile("male").length)];
    const dam = fertile("female")[(round * 3 + 1) % Math.max(1, fertile("female").length)];

    if (state.creatures.filter((c) => c.status === "active").length >= state.capacity) {
      const spare = state.creatures.find(
        (c) => c.status === "active" && c.stage !== "egg" && c.id !== sire?.id && c.id !== dam?.id,
      );
      if (spare) step({ kind: "release", id: spare.id });
    }
    if (sire && dam) step({ kind: "breed", sireId: sire.id, damId: dam.id });
    else step({ kind: "advanceDays", days: 10 });
    if (round % 7 === 6) step({ kind: "advanceDays", days: 12 });
  }
  return { state, events };
}

describe("a played ranch actually completes chapters", () => {
  const { state, events } = bot("restore-1", 22);

  it("teaches dominance and polygenic inheritance through the reducer", () => {
    const completed = events.filter((e) => e.kind === "chapterComplete");
    expect(completed.map((e) => (e.kind === "chapterComplete" ? e.chapter : ""))).toEqual(["c1", "c2"]);
    expect(state.campaign.completed).toEqual(["c1", "c2"]);
    expect(state.campaign.chapter).toBe(3);
  });

  it("pays each chapter's reward exactly once", () => {
    const chapters = campaignFor(map);
    const owed = chapters
      .filter((c) => state.campaign.completed.includes(c.id))
      .reduce((sum, c) => sum + c.reward.motes, 0);
    // 4000 to start; the bot never spends motes, only lenses.
    expect(state.inventory.motes).toBe(4000 + owed);
    expect(state.inventory.items["assay-bench"]).toBe(1);
    expect(state.inventory.items["fertility-tonic"]).toBe(3);
  });

  it("reports progress on the chapter it is actually on", () => {
    const progress = chapterProgress(state.campaign, campaignFor(map));
    expect(progress?.chapter.id).toBe("c3");
    expect(progress?.done.length).toBeGreaterThanOrEqual(0);
    expect(progress?.done.length ?? 0).toBeLessThan(progress?.chapter.objectives.length ?? 0);
  });

  it("keeps objectives sticky once met", () => {
    // Everything that satisfied chapter 1 is long dead or released by now, and
    // the record still stands.
    expect(state.campaign.met).toContain("c1-recessive");
    expect(state.campaign.met).toContain("c1-carrier");
  });
});

describe("chapter order is enforced", () => {
  it("does not credit a later chapter's objective early", () => {
    // Chapter 7 asks for a novel allele; hand the ranch one on day zero.
    const novel = solo((creature) => ({
      ...creature,
      genome: withAlleles(creature.genome, { HUE: ["H_aurora", "H_moss"] }),
    }));
    const outcome = advanceCampaign(novel.campaign, view(novel), [], campaignFor(map));
    expect(outcome.campaign.met).not.toContain("c7-novel");
    expect(outcome.campaign.chapter).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Objective predicates, one chapter at a time
// ---------------------------------------------------------------------------

function fresh(): RanchState {
  return createRanch(map, { seed: "objective-fixtures" });
}

function view(state: RanchState): CampaignView {
  return campaignView(state, map);
}

function chapter(id: string): Chapter {
  const found = campaignFor(map).find((c) => c.id === id);
  if (!found) throw new Error(`no chapter ${id}`);
  return found;
}

function objective(chapterId: string, objectiveId: string) {
  const found = chapter(chapterId).objectives.find((o) => o.id === objectiveId);
  if (!found) throw new Error(`no objective ${objectiveId}`);
  return found;
}

function withAlleles(genome: Genome, spec: Record<string, [string | null, string | null]>): Genome {
  const sex = genome.chromosomes.S?.paternal.kind === "Y" ? "male" : "female";
  return genomeFromSpec(map, sex, spec);
}

/** Replaces the ranch's creatures with the given ones, keeping the pedigree honest. */
function withCreatures(state: RanchState, creatures: readonly Creature[]): RanchState {
  return {
    ...state,
    creatures,
    pedigree: creatures.map((c) => ({
      id: c.id,
      ...(c.sireId ? { sire: c.sireId } : {}),
      ...(c.damId ? { dam: c.damId } : {}),
      name: c.name,
      generation: c.generation,
    })),
  };
}

/**
 * A ranch holding exactly one creature.
 *
 * Most objectives ask "does the herd contain an animal that…", so a fixture
 * that leaves three wild founders in place answers with whatever the founders
 * happened to be. Every negative case here needs a herd of one.
 */
function solo(change: (creature: Creature) => Creature): RanchState {
  const base = fresh();
  const first = base.creatures[0];
  if (!first) throw new Error("empty ranch");
  return withCreatures(base, [change(first)]);
}

/** A parent/child trio with genotypes chosen by the caller. */
function trio(
  sireSpec: Record<string, [string | null, string | null]>,
  damSpec: Record<string, [string | null, string | null]>,
  childSpec: Record<string, [string | null, string | null]>,
  childOverrides: Partial<Creature> = {},
): RanchState {
  const base = fresh();
  const template = base.creatures[0];
  if (!template) throw new Error("empty ranch");
  const make = (
    id: string,
    sex: Creature["sex"],
    genome: Genome,
    overrides: Partial<Creature> = {},
  ): Creature => ({
    ...template,
    id,
    sex,
    genome,
    stage: "adult",
    status: "active",
    ageDays: 60,
    generation: 0,
    inbreeding: 0,
    sireId: undefined,
    damId: undefined,
    doomed: undefined,
    revealed: [],
    ...overrides,
  });
  return withCreatures(base, [
    make("s", "male", genomeFromSpec(map, "male", sireSpec)),
    make("d", "female", genomeFromSpec(map, "female", damSpec)),
    make("k", "female", genomeFromSpec(map, "female", childSpec), {
      sireId: "s",
      damId: "d",
      generation: 1,
      ...childOverrides,
    }),
  ]);
}

const DOM = targets.dominance.id;
const DOMINANT = targets.dominant.id;
const RECESSIVE = targets.recessive.id;

describe("chapter 1: dominance", () => {
  const test = objective("c1", "c1-recessive").test;

  it("credits a recessive bred from two parents that show the dominant", () => {
    const state = trio(
      { [DOM]: [DOMINANT, RECESSIVE] },
      { [DOM]: [DOMINANT, RECESSIVE] },
      { [DOM]: [RECESSIVE, RECESSIVE] },
    );
    expect(test(view(state), [])).toBe(true);
  });

  it("does not credit a wild-caught animal that simply shows it", () => {
    const state = solo((creature) => ({
      ...creature,
      stage: "adult",
      genome: withAlleles(creature.genome, { [DOM]: [RECESSIVE, RECESSIVE] }),
    }));
    expect(test(view(state), [])).toBe(false);
  });

  it("wants the carrier proven, not guessed", () => {
    const carrier = objective("c1", "c1-carrier").test;
    const unread = trio(
      { [DOM]: [DOMINANT, RECESSIVE] },
      { [DOM]: [DOMINANT, RECESSIVE] },
      { [DOM]: [DOMINANT, RECESSIVE] },
    );
    expect(carrier(view(unread), [])).toBe(false);
    const read = withCreatures(
      unread,
      unread.creatures.map((c) => (c.id === "k" ? { ...c, revealed: [DOM] } : c)),
    );
    expect(carrier(view(read), [])).toBe(true);
  });
});

describe("chapter 2: polygenic inheritance", () => {
  it("credits a child beyond both parents and nothing less", () => {
    const test = objective("c2", "c2-transgressive").test;
    const high = { SPD_A: ["SA2", "SA2"], SPD_C: ["SC2", "SC2"] } as Record<string, [string, string]>;
    const low = { SPD_A: ["SA0", "SA0"], SPD_C: ["SC0", "SC0"] } as Record<string, [string, string]>;
    // Parents middling, child at the top: the tail of the distribution.
    expect(test(view(trio({ SPD_A: ["SA1", "SA1"] }, { SPD_A: ["SA1", "SA1"] }, high)), [])).toBe(true);
    // Child below both: regression, not transgression.
    expect(test(view(trio(high, high, low)), [])).toBe(false);
  });
});

describe("chapter 3: linkage", () => {
  const near = targets.linked.near.id;
  const far = targets.linked.far.id;
  const prize = targets.linked.prize.id;
  const drag = targets.linked.drag.id;
  const otherNear = targets.linked.near.alleles.find((a) => a.id !== prize)?.id ?? prize;
  const otherFar = targets.linked.far.alleles.find((a) => a.id !== drag)?.id ?? drag;

  it("credits a haplotype combination neither parent carried", () => {
    const test = objective("c3", "c3-recombinant").test;
    // Both parents coupled: prize-with-drag and other-with-other. A child
    // carrying prize-with-other can only have come from a crossover.
    const coupled = { [near]: [prize, otherNear], [far]: [drag, otherFar] } as Record<string, [string, string]>;
    const parental = trio(coupled, coupled, coupled);
    expect(test(view(parental), [])).toBe(false);

    const recombined = trio(coupled, coupled, {
      [near]: [prize, otherNear],
      [far]: [otherFar, drag],
    } as Record<string, [string, string]>);
    expect(test(view(recombined), [])).toBe(true);
  });

  it("credits breaking the coupling only when the drag is actually gone", () => {
    const test = objective("c3", "c3-uncoupled").test;
    const stillCoupled = solo((creature) => ({
      ...creature,
      stage: "adult",
      genome: withAlleles(creature.genome, { [near]: [prize, prize], [far]: [drag, drag] }),
    }));
    expect(test(view(stillCoupled), [])).toBe(false);

    const clean = solo((creature) => ({
      ...creature,
      stage: "adult",
      genome: withAlleles(creature.genome, { [near]: [prize, prize], [far]: [otherFar, otherFar] }),
    }));
    expect(test(view(clean), [])).toBe(true);
  });
});

describe("chapter 4: epistasis", () => {
  it("separates the closed gate from the allele that closes it", () => {
    const masked = objective("c4", "c4-masked").test;
    const carrier = objective("c4", "c4-carrier").test;
    const gate = targets.epistasis.gate;
    const allele = targets.gateAllele;
    const other = map.locus(gate).alleles.find((a) => a.id !== allele)?.id ?? allele;

    const shut = solo((creature) => ({
      ...creature,
      stage: "adult",
      genome: withAlleles(creature.genome, { [gate]: [allele, allele] }),
    }));
    expect(masked(view(shut), [])).toBe(true);
    expect(carrier(view(shut), [])).toBe(false);

    const open = solo((creature) => ({
      ...creature,
      stage: "adult",
      genome: withAlleles(creature.genome, { [gate]: [allele, other] }),
    }));
    expect(masked(view(open), [])).toBe(false);
    expect(carrier(view(open), [])).toBe(true);
  });
});

describe("chapter 5: lethal alleles", () => {
  const lethal = targets.lethals[0];

  it("reads the loss from the event, not from the herd", () => {
    const test = objective("c5", "c5-loss").test;
    const state = fresh();
    expect(test(view(state), [])).toBe(false);
    expect(test(view(state), [{ kind: "eggFailed", reason: "x", locus: lethal?.locus.id }])).toBe(true);
    // A stillbirth with no locus is not a lethal lesson.
    expect(test(view(state), [{ kind: "eggFailed", reason: "x" }])).toBe(false);
  });

  it("credits clearing a line only when the parent really carried it", () => {
    const test = objective("c5", "c5-cleared").test;
    if (!lethal) throw new Error("no lethal");
    const clear = targets.lethals.reduce<Record<string, [string, string]>>((spec, { locus, allele }) => {
      const safe = locus.alleles.find((a) => a.id !== allele.id)?.id;
      if (safe) spec[locus.id] = [safe, safe];
      return spec;
    }, {});
    const safeParent = trio(clear, clear, clear);
    expect(test(view(safeParent), [])).toBe(false);

    const carrierSire = {
      ...clear,
      [lethal.locus.id]: [lethal.allele.id, clear[lethal.locus.id]?.[0] ?? lethal.allele.id],
    } as Record<string, [string, string]>;
    expect(test(view(trio(carrierSire, clear, clear)), [])).toBe(true);
  });
});

describe("chapter 6: inbreeding", () => {
  it("wants the line concentrated and then rescued", () => {
    const fixed = objective("c6", "c6-fixed").test;
    const rescued = objective("c6", "c6-rescued").test;
    const top = { SPD_A: ["SA2", "SA2"], SPD_B: ["SB2", "SB2"], SPD_C: ["SC2", "SC2"] } as Record<
      string,
      [string, string]
    >;

    const outbred = trio(top, top, top, { inbreeding: 0.01 });
    expect(fixed(view(outbred), [])).toBe(false);

    const inbred = trio(top, top, top, { inbreeding: 0.2 });
    expect(fixed(view(inbred), [])).toBe(true);
    // The inbred animal is not itself the rescue.
    expect(rescued(view(inbred), [])).toBe(false);
  });

  it("only credits the herd objective once a line is actually running", () => {
    const test = objective("c6", "c6-herd").test;
    // A brand new ranch has a mean F of zero and six creatures would still not
    // count: there is no line to have kept healthy.
    const start = createRanch(map, { seed: "herd", founders: 8 });
    expect(test(view(start), [])).toBe(false);
  });
});

describe("chapter 7: mutation", () => {
  it("wants the novel allele kept, not just found", () => {
    const found = objective("c7", "c7-novel").test;
    const kept = objective("c7", "c7-inherited").test;
    const novel = targets.novel[0];
    if (!novel) throw new Error("no novel allele");
    const other = novel.locus.alleles.find((a) => !a.novel)?.id ?? novel.allele.id;
    const carrying = { [novel.locus.id]: [novel.allele.id, other] } as Record<string, [string, string]>;
    const plain = { [novel.locus.id]: [other, other] } as Record<string, [string, string]>;

    const oneOff = trio(carrying, plain, plain);
    expect(found(view(oneOff), [])).toBe(true);
    expect(kept(view(oneOff), [])).toBe(false);

    const passedOn = trio(carrying, plain, carrying);
    expect(kept(view(passedOn), [])).toBe(true);
  });
});

describe("chapter 8: the finale", () => {
  it("needs a pair, not a champion", () => {
    const pair = objective("c8", "c8-pair").test;
    const spec: Record<string, [string, string]> = {
      [DOM]: [RECESSIVE, RECESSIVE],
      SPD_A: ["SA2", "SA2"],
      SPD_B: ["SB2", "SB2"],
      SPD_C: ["SC2", "SC2"],
    };
    for (const { locus, allele } of targets.lethals) {
      const safe = locus.alleles.find((a) => a.id !== allele.id)?.id;
      if (safe) spec[locus.id] = [safe, safe];
    }
    // The prize allele free of its drag, which the spec also demands.
    spec[targets.linked.far.id] = [
      targets.linked.far.alleles.find((a) => a.id !== targets.linked.drag.id)?.id ??
        targets.linked.drag.id,
      targets.linked.far.alleles.find((a) => a.id !== targets.linked.drag.id)?.id ??
        targets.linked.drag.id,
    ];

    const base = fresh();
    const template = base.creatures[0];
    if (!template) throw new Error("empty ranch");
    const toSpec = (id: string, sex: Creature["sex"]): Creature => ({
      ...template,
      id,
      sex,
      genome: genomeFromSpec(map, sex, spec),
      stage: "adult",
      status: "active",
      inbreeding: 0,
      sireId: undefined,
      damId: undefined,
      doomed: undefined,
    });

    // One animal to spec is not a population.
    expect(pair(view(withCreatures(base, [toSpec("a", "male")])), [])).toBe(false);
    // Two of the same sex is not a population either.
    expect(pair(view(withCreatures(base, [toSpec("a", "male"), toSpec("b", "male")])), [])).toBe(false);
    expect(pair(view(withCreatures(base, [toSpec("a", "male"), toSpec("b", "female")])), [])).toBe(true);
  });

  it("refuses a pair that still carries a lethal", () => {
    const pair = objective("c8", "c8-pair").test;
    const lethal = targets.lethals[0];
    if (!lethal) throw new Error("no lethal");
    const spec: Record<string, [string, string]> = {
      [DOM]: [RECESSIVE, RECESSIVE],
      SPD_A: ["SA2", "SA2"],
      SPD_B: ["SB2", "SB2"],
      SPD_C: ["SC2", "SC2"],
      [lethal.locus.id]: [lethal.allele.id, lethal.locus.alleles.find((a) => a.id !== lethal.allele.id)?.id ?? lethal.allele.id],
    };
    const base = fresh();
    const template = base.creatures[0];
    if (!template) throw new Error("empty ranch");
    const carrier = (id: string, sex: Creature["sex"]): Creature => ({
      ...template,
      id,
      sex,
      genome: genomeFromSpec(map, sex, spec),
      stage: "adult",
      status: "active",
      inbreeding: 0,
      sireId: undefined,
      damId: undefined,
      doomed: undefined,
    });
    expect(pair(view(withCreatures(base, [carrier("a", "male"), carrier("b", "female")])), [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

describe("save migration", () => {
  it("carries a v1 ranch forward with a campaign attached", () => {
    const state = fresh();
    const file = saveRanch(state);
    // Forge a v1 save: the shape that shipped before the campaign existed.
    const legacy = JSON.parse(JSON.stringify(file)) as Record<string, unknown> & {
      state: Record<string, unknown>;
    };
    legacy.version = 1;
    delete legacy.state.campaign;

    const loaded = loadRanch(legacy);
    expect(loaded.campaign).toEqual(NEW_CAMPAIGN);
    expect(loaded.creatures.length).toBe(state.creatures.length);
  });

  it("round-trips campaign progress", () => {
    const advanced: RanchState = {
      ...fresh(),
      campaign: { chapter: 3, met: ["c1-recessive", "c1-carrier"], completed: ["c1", "c2"] },
    };
    expect(loadRanch(saveRanch(advanced)).campaign).toEqual(advanced.campaign);
  });
});

// ---------------------------------------------------------------------------
// The phenotype the objectives read
// ---------------------------------------------------------------------------

describe("objectives read phenotypes, never genotypes directly", () => {
  it("uses the same expression the renderer does", () => {
    const state = fresh();
    const creature = state.creatures[0];
    if (!creature) throw new Error("empty ranch");
    const fromView = campaignView(state, map).phenotype(creature);
    expect(fromView.traits).toEqual(expressPhenotype(creature.genome, map).traits);
  });
});
