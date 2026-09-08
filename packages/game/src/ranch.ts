/**
 * The ranch: state, actions, and the day loop.
 *
 * `applyAction(state, action)` is a pure function returning a new state and a
 * list of events. Every creature carries its own species, and the gene map is
 * resolved from that at the point of use (see `bestiary.ts`), so a ranch can
 * hold mixed stock without any call site having to be handed the right map. Nothing here mutates, reads a clock, or touches the
 * network. The RNG state travels inside the ranch, so a save file plus a list
 * of actions reproduces a playthrough exactly — which is what Daily Genome,
 * Trial scoring and bug reports all need.
 */

import type { GeneMap, Genome, LocusId, MutationRates, Phenotype, SpeciesId, StatId } from "@chimaera/genetics";
import {
  BASELINE_MUTATION,
  breed,
  carriedLethals,
  createRng,
  DEFAULT_EPIGENETICS,
  deriveOffspringMarks,
  expressPhenotype,
  geneMapById,
  genotypeAt,
  NO_MUTAGENS,
  Pedigree,
  randomWildGenome,
  rngFromState,
  sexOf,
} from "@chimaera/genetics";
import type { MutagenLoad, Rng } from "@chimaera/genetics";
import { equipmentById } from "./combat.js";
import { mapOf, homeMap } from "./bestiary.js";
import { advanceCampaign, buildCampaign, NEW_CAMPAIGN } from "./campaign.js";
import type { CampaignView, Chapter } from "./campaign.js";
import { itemById } from "./content.js";
import type { ItemDef } from "./content.js";
import { evolutionContext, resolveBranch, shouldEvolve } from "./evolution.js";
import {
  achievement,
  INCUBATION_DAYS,
  isFertile,
  lifespanFor,
  newbornStats,
  stageForAge,
  tickCreature,
} from "./lifecycle.js";
import { enterExpedition, expeditionMove, expeditionWithdraw, runBout } from "./runs.js";
import { enterShow } from "./shows.js";
import { alleleKey, gateKey, nameAllele } from "./compendium.js";
import { readStud } from "./exchange.js";
import type { StudOffer } from "./exchange.js";
import { trialGenomes } from "./trials.js";
import type { Trial } from "./trials.js";
import { NO_RECORDS } from "./types.js";
import type {
  Action,
  ActionResult,
  Creature,
  CreatureId,
  GameEvent,
  RanchState,
} from "./types.js";

/**
 * v2 added `campaign`; v3 added `homeSpecies` and named the species living in
 * an expedition's region; v4 added `records`, where the §4 modes keep their
 * results; v5 qualified recorded alleles by species. The migrations in
 * `save.ts` fill each in, which is the whole reason the chain was written
 * before there was anything to migrate.
 */
export const SAVE_VERSION = 5;

/** Day costs, so that every meaningful action moves the calendar (§2.1). */
export const DAY_COST = { breed: 1, tend: 1, catchWild: 3 } as const;

// ---------------------------------------------------------------------------
// Phenotype cache
// ---------------------------------------------------------------------------

const phenotypeCache = new WeakMap<Genome, Phenotype>();

/**
 * Phenotypes are derived, never stored. Storing them in the save would let the
 * two drift apart after a genetics balance patch, and a creature whose picture
 * disagrees with its genome is the worst possible bug in this game.
 */
export function phenotypeOf(creature: Creature): Phenotype {
  const cached = phenotypeCache.get(creature.genome);
  if (cached) return cached;
  const phenotype = expressPhenotype(creature.genome, mapOf(creature), {
    inbreedingDepression: inbreedingDepressionFor(creature.inbreeding),
  });
  phenotypeCache.set(creature.genome, phenotype);
  return phenotype;
}

function inbreedingDepressionFor(f: number): number {
  // Mirrors the genetics penalty curve without importing its private table.
  return f <= 0.125 ? 0 : Math.min(0.5, (f - 0.125) * 0.45);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const NAME_STEMS = [
  "Alder", "Bittern", "Cress", "Dabble", "Eelgrass", "Fenwick", "Gale", "Harrow",
  "Ivy", "Jetsam", "Kestrel", "Lantern", "Mudlark", "Nettle", "Osier", "Peat",
  "Quill", "Reed", "Sedge", "Tussock", "Umber", "Vetch", "Willow", "Yarrow",
] as const;
const NAME_TAILS = [
  "of the Shallows", "Nine", "the Patient", "Redfoot", "Longshadow", "the Elder",
  "Stonekeeper", "Halfquill", "Duskwatch", "the Younger", "Broadfin", "Slate",
] as const;

function makeName(rng: { pick: <T>(items: readonly T[]) => T; bool: (p: number) => boolean }): string {
  const stem = rng.pick(NAME_STEMS);
  return rng.bool(0.42) ? `${stem} ${rng.pick(NAME_TAILS)}` : stem;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export interface NewRanchOptions {
  readonly seed: string;
  /** The station's posting. Founders and wild stock come from this species. */
  readonly species: SpeciesId;
  readonly founders?: number;
  readonly capacity?: number;
  readonly motes?: number;
  readonly startingItems?: Readonly<Record<string, number>>;
}

export function createRanch(options: NewRanchOptions): RanchState {
  const map = geneMapById(options.species);
  const founders = options.founders ?? 4;
  const rng = createRng(`${options.seed}:founders`);
  const creatures: Creature[] = [];
  const pedigree: RanchState["pedigree"] = [];

  for (let i = 0; i < founders; i++) {
    // Alternate the founding pair's sexes so a new player is never handed a
    // ranch that cannot breed at all.
    const genome = randomWildGenome(map, rng, { sex: i % 2 === 0 ? "female" : "male" });
    const phenotype = expressPhenotype(genome, map);
    const id = `c${i + 1}`;
    creatures.push(
      newCreature({
        id,
        genome,
        phenotype,
        map,
        name: makeName(rng),
        day: 0,
        origin: "wild",
        inbreeding: 0,
        generation: 0,
        // Founders arrive as young adults: the game starts with a decision to
        // make, not with a fortnight of waiting.
        ageDays: 58,
      }),
    );
    (pedigree as { id: string; name: string; generation: number }[]).push({
      id,
      name: creatures[i]?.name ?? id,
      generation: 0,
    });
  }

  return {
    version: SAVE_VERSION,
    seed: options.seed,
    homeSpecies: map.species.id,
    rng: createRng(options.seed).state(),
    rngCursor: 0,
    day: 0,
    nextId: founders + 1,
    creatures,
    archive: [],
    pedigree,
    inventory: {
      motes: options.motes ?? 400,
      items: { "field-lens": 2, "fertility-tonic": 1, ...options.startingItems },
      fragments: {},
    },
    compendium: {
      seenSpecies: [map.species.id],
      seenAlleles: [],
      seenBranches: [],
      seenEpistasis: [],
      namedAlleles: {},
    },
    capacity: options.capacity ?? 24,
    archiveCapacity: 12,
    leagueTier: 0,
    campaign: NEW_CAMPAIGN,
    records: NO_RECORDS,
  };
}

/**
 * A trial's own ranch: the pair, the cap, and nothing else.
 *
 * Small capacity on purpose. A Breeding Trial that lets you keep forty animals
 * is a trial you brute-force; keeping ten means every hatch is a decision about
 * what to let go of, which is the same decision the main game is about.
 */
export function createTrialRanch(
  trial: Trial,
  options: { readonly seed?: string; readonly genomes?: { sire: Genome; dam: Genome }; readonly kind?: "trial" | "daily" } = {},
): RanchState {
  const map = geneMapById(trial.species);
  // Daily Genome hands over the pair directly rather than as a spec: it draws
  // its pair from the wild pool and then reads the target off it, so the pair
  // exists before the puzzle does.
  const { sire, dam } = options.genomes ?? trialGenomes(trial);
  const seed = options.seed ?? `trial:${trial.id}`;
  const base = createRanch({
    seed,
    species: trial.species,
    founders: 0,
    capacity: 10,
    motes: 0,
    ...(trial.items ? { startingItems: trial.items } : {}),
  });

  const creatures = [
    { id: "t1", genome: sire, name: "The sire" },
    { id: "t2", genome: dam, name: "The dam" },
  ].map(({ id, genome, name }) =>
    newCreature({
      id,
      genome,
      phenotype: expressPhenotype(genome, map),
      map,
      name,
      day: 0,
      origin: "gift",
      inbreeding: 0,
      generation: 0,
      ageDays: 58,
    }),
  );

  return {
    ...base,
    nextId: 3,
    creatures,
    pedigree: creatures.map((c) => ({ id: c.id, name: c.name, generation: 0 })),
    // A trial is not a campaign, and the commissions have nothing to say here.
    campaign: { chapter: 9, met: [], completed: [] },
    trial: {
      kind: options.kind ?? "trial",
      id: trial.id,
      generations: trial.generations,
      startedOnDay: 0,
    },
  };
}

interface NewCreatureArgs {
  id: CreatureId;
  genome: Genome;
  phenotype: Phenotype;
  map: GeneMap;
  name: string;
  day: number;
  origin: Creature["origin"];
  inbreeding: number;
  generation: number;
  ageDays?: number;
  sireId?: CreatureId;
  damId?: CreatureId;
  marks?: Readonly<Record<StatId, number>>;
  doomed?: Creature["doomed"];
}

function newCreature(args: NewCreatureArgs): Creature {
  const ageDays = args.ageDays ?? 0;
  const achieved = newbornStats(args.phenotype, args.map);
  const creature: Creature = {
    id: args.id,
    species: args.map.species.id,
    genome: args.genome,
    name: args.name,
    sex: sexOf(args.genome, args.map),
    stage: stageForAge(ageDays),
    ageDays,
    lifespanDays: lifespanFor(args.phenotype, args.map, args.inbreeding),
    status: "active",
    sireId: args.sireId,
    damId: args.damId,
    generation: args.generation,
    inbreeding: args.inbreeding,
    diet: "forage",
    habitat: "mirefen",
    training: "none",
    bond: 20,
    role: "runner",
    stance: "measure",
    equipment: [],
    achieved,
    marks: args.marks ?? {},
    revealed: [],
    phaseKnown: false,
    acquiredOnDay: args.day,
    origin: args.origin,
    doomed: args.doomed,
  };
  // A founder that arrives as an adult has already lived: give it the raising
  // it would plausibly have had, rather than hatchling stats in an adult body.
  return ageDays > 0 ? ageUpFounder(creature, args.phenotype, args.map) : creature;
}

function ageUpFounder(creature: Creature, phenotype: Phenotype, map: GeneMap): Creature {
  let current: Creature = { ...creature, ageDays: 0, stage: "egg" };
  for (let day = 0; day < creature.ageDays; day++) {
    current = tickCreature(current, phenotype, map).creature;
  }
  return { ...current, status: "active" };
}

/**
 * A fresh, reproducible substream for one roll, plus the cursor that must be
 * written back so the next roll gets a different one.
 */
function rollFor(state: RanchState, label: string): { rng: Rng; cursor: number } {
  return {
    rng: rngFromState(state.rng).fork(`${label}:${state.rngCursor}`),
    cursor: state.rngCursor + 1,
  };
}

// ---------------------------------------------------------------------------
// Pedigree
// ---------------------------------------------------------------------------

export function pedigreeOf(state: RanchState): Pedigree {
  const pedigree = new Pedigree();
  // Records are appended in creation order, so parents always precede children
  // and a single pass is enough.
  for (const record of state.pedigree) pedigree.add(record.id, record.sire, record.dam);
  return pedigree;
}

/** Wright's F an offspring of this pairing would carry. Shown before committing. */
export function projectedInbreeding(state: RanchState, sireId: CreatureId, damId: CreatureId): number {
  return pedigreeOf(state).projectedInbreeding(sireId, damId);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * The campaign's chapters, built once per gene map.
 *
 * Chapters are derived from the species (see `campaign.ts`), so they are not a
 * constant — but they are also not per-state, and rebuilding eight chapters on
 * every action would put a species scan in the hot path of the reducer.
 */
const campaignCache = new WeakMap<GeneMap, readonly Chapter[]>();

export function campaignFor(map: GeneMap): readonly Chapter[] {
  const cached = campaignCache.get(map);
  if (cached) return cached;
  const chapters = buildCampaign(map);
  campaignCache.set(map, chapters);
  return chapters;
}

/** Everything the campaign's predicates are allowed to see. */
export function campaignView(state: RanchState): CampaignView {
  return { state, map: homeMap(state), phenotype: phenotypeOf };
}

/**
 * Re-asks the active chapter's objectives after every player action.
 *
 * It runs once, on the outermost action — never on the `advance` calls that
 * breeding and bouts make internally — so a single breed cannot tick an
 * objective twice, and the events land in the same batch the player sees.
 */
function withCampaign(result: ActionResult): ActionResult {
  const outcome = advanceCampaign(
    result.state.campaign,
    campaignView(result.state),
    result.events,
    campaignFor(homeMap(result.state)),
  );
  if (outcome.events.length === 0) return result;

  let inventory = result.state.inventory;
  if (outcome.reward) {
    const items = { ...inventory.items };
    for (const [id, count] of Object.entries(outcome.reward.items)) {
      items[id] = (items[id] ?? 0) + count;
    }
    inventory = { ...inventory, motes: inventory.motes + outcome.reward.motes, items };
  }

  return {
    state: { ...result.state, campaign: outcome.campaign, inventory },
    events: [...result.events, ...outcome.events],
  };
}

export function applyAction(state: RanchState, action: Action): ActionResult {
  return withCampaign(withDiscoveries(dispatch(state, action)));
}

/**
 * Keeps the Compendium honest about what is standing in the pens.
 *
 * Creatures arrive by half a dozen routes — hatching, catching, an expedition,
 * a stud pairing, a Legacy carry — and requiring each one to remember to record
 * the species is how a Compendium ends up disagreeing with the ranch. Sweeping
 * once, centrally, cannot be forgotten.
 */
function withDiscoveries(result: ActionResult): ActionResult {
  const seen = new Set(result.state.compendium.seenSpecies);
  let added = false;
  for (const creature of [...result.state.creatures, ...result.state.archive]) {
    if (!seen.has(creature.species)) {
      seen.add(creature.species);
      added = true;
    }
  }
  if (!added) return result;
  return {
    state: { ...result.state, compendium: { ...result.state.compendium, seenSpecies: [...seen].sort() } },
    events: result.events,
  };
}

function dispatch(state: RanchState, action: Action): ActionResult {
  switch (action.kind) {
    case "advanceDays":
      return advance(state, Math.max(0, Math.floor(action.days)));
    case "breed":
      return doBreed(state, action.sireId, action.damId, action.items ?? []);
    case "breedToStud":
      return doBreedToStud(state, action.damId, action.offer, action.items ?? []);
    case "setDiet":
      return patch(state, action.id, (c) => ({ ...c, diet: action.diet }));
    case "setHabitat":
      return patch(state, action.id, (c) => ({ ...c, habitat: action.habitat }));
    case "setTraining":
      return patch(state, action.id, (c) => ({ ...c, training: action.training }));
    case "rename":
      return renameCreature(state, action.id, action.name);
    case "tend":
      return doTend(state, action.id);
    case "holdItem":
      return doHoldItem(state, action.id, action.item);
    case "useItem":
      return doUseItem(state, action.id, action.item, action.locus);
    case "archive":
      return doArchive(state, action.id);
    case "release":
      return doRelease(state, action.id);
    case "catchWild":
      return doCatchWild(state, action.species);
    case "setRole":
      return patch(state, action.id, (c) => ({ ...c, role: action.role }));
    case "setStance":
      return patch(state, action.id, (c) => ({ ...c, stance: action.stance }));
    case "setEquipment":
      return doSetEquipment(state, action.id, action.equipment);
    case "bout":
      return runBout(state, action.team, action.tier, advance);
    case "enterExpedition":
      return enterExpedition(state, action.team, action.regionSeed, action.species);
    case "expeditionMove":
      return expeditionMove(state, action.nodeId, advance);
    case "expeditionWithdraw":
      return expeditionWithdraw(state, advance);
    case "enterShow":
      return enterShow(state, action.id, action.tier, phenotypeOf);
    case "nameAllele": {
      const named = nameAllele(state, action.allele, action.name);
      return named.error
        ? blocked(state, named.error)
        : {
            state: named.state,
            events: [
              {
                kind: "discovery",
                what: "Named",
                detail: `${action.allele} will be known as "${named.state.compendium.namedAlleles[action.allele]?.name}" from now on.`,
              },
            ],
          };
    }
  }
}

/**
 * Equipment is owned by the ranch, not duplicated: a harness on one creature is
 * not also on another. Anything already worn elsewhere is refused rather than
 * silently cloned.
 */
function doSetEquipment(state: RanchState, id: CreatureId, equipment: readonly string[]): ActionResult {
  const creature = findCreature(state, id);
  if (!creature) return blocked(state, "That creature is not on the ranch.");
  for (const item of equipment) {
    if (!equipmentById(item)) return blocked(state, "That is not a piece of equipment.");
    const owned = state.inventory.items[item] ?? 0;
    const wornElsewhere = state.creatures.filter((c) => c.id !== id && c.equipment.includes(item)).length;
    if (owned - wornElsewhere <= 0) return blocked(state, `Every ${equipmentById(item)?.name} you own is already in use.`);
  }
  const slots = new Set(equipment.map((item) => equipmentById(item)?.slot));
  if (slots.size !== equipment.length) return blocked(state, "One item per slot.");
  return patch(state, id, (c) => ({ ...c, equipment: [...equipment] }));
}

function blocked(state: RanchState, reason: string): ActionResult {
  return { state, events: [{ kind: "blocked", reason }] };
}

function findCreature(state: RanchState, id: CreatureId): Creature | undefined {
  return state.creatures.find((c) => c.id === id && c.status === "active");
}

function patch(state: RanchState, id: CreatureId, change: (c: Creature) => Creature): ActionResult {
  const creature = findCreature(state, id);
  if (!creature) return blocked(state, "That creature is not on the ranch.");
  return {
    state: { ...state, creatures: state.creatures.map((c) => (c.id === id ? change(c) : c)) },
    events: [],
  };
}

function renameCreature(state: RanchState, id: CreatureId, name: string): ActionResult {
  const trimmed = name.trim().slice(0, 40);
  if (trimmed.length === 0) return blocked(state, "A name cannot be empty.");
  const result = patch(state, id, (c) => ({ ...c, name: trimmed }));
  return {
    ...result,
    state: {
      ...result.state,
      pedigree: result.state.pedigree.map((r) => (r.id === id ? { ...r, name: trimmed } : r)),
    },
  };
}

// --- The day loop ----------------------------------------------------------

/**
 * Exported so runs.ts can spend days without importing the reducer back — the
 * two modules would otherwise form a cycle, and the day loop is the one piece
 * both of them genuinely need.
 */
export function advance(state: RanchState, days: number): ActionResult {
  let current = state;
  const events: GameEvent[] = [];

  for (let day = 0; day < days; day++) {
    const creatures: Creature[] = [];
    for (const creature of current.creatures) {
      if (creature.status !== "active") {
        creatures.push(creature);
        continue;
      }
      const map = mapOf(creature);
      const phenotype = phenotypeOf(creature);
      const outcome = tickCreature(creature, phenotype, map);
      let next = outcome.creature;

      // An egg that was never going to develop reveals itself at the end of
      // incubation, not at conception.
      if (creature.stage === "egg" && next.stage !== "egg") {
        if (next.doomed) {
          events.push({
            kind: "eggFailed",
            reason: next.doomed.reason,
            ...(next.doomed.locus ? { locus: next.doomed.locus } : {}),
          });
          creatures.push({ ...next, status: "dead" });
          continue;
        }
        events.push({ kind: "hatched", id: next.id, name: next.name });
      } else if (outcome.stageChanged) {
        events.push({ kind: "stageChanged", id: next.id, stage: next.stage });
      }

      if (shouldEvolve(next)) {
        const branch = resolveBranch(evolutionContext(next, phenotype, map), next.species);
        next = { ...next, branch: branch.id };
        events.push({ kind: "evolved", id: next.id, branch: branch.id, branchName: branch.name });
        current = { ...current, compendium: recordBranch(current.compendium, branch.id) };
      }

      if (outcome.died) {
        events.push({ kind: "died", id: next.id, name: next.name, ageDays: Math.round(next.ageDays) });
      }
      creatures.push(next);
    }

    current = { ...current, day: current.day + 1, creatures };
    events.push({ kind: "dayPassed", day: current.day });
  }

  return { state: current, events };
}

// --- Breeding --------------------------------------------------------------

interface BreedingLoad {
  readonly mutagens: MutagenLoad;
  readonly rates: MutationRates;
  readonly crossoverMultiplier: number;
  readonly fertilityMultiplier: number;
  readonly incubationMultiplier: number;
  readonly sexSelection?: { readonly sex: "female" | "male"; readonly reliability: number };
  readonly lifespanCostDays: number;
}

function loadFromItems(items: readonly ItemDef[]): BreedingLoad {
  let mutagens: MutagenLoad = NO_MUTAGENS;
  let crossoverMultiplier = 1;
  let fertilityMultiplier = 1;
  let incubationMultiplier = 1;
  let lifespanCostDays = 0;
  let sexSelection: BreedingLoad["sexSelection"];

  for (const item of items) {
    if (item.effect.kind !== "breeding") continue;
    const e = item.effect;
    mutagens = {
      pointMultiplier: mutagens.pointMultiplier * (e.pointMultiplier ?? 1),
      novelMultiplier: mutagens.novelMultiplier * (e.novelMultiplier ?? 1),
      duplicationMultiplier: mutagens.duplicationMultiplier * (e.duplicationMultiplier ?? 1),
      fertilityMultiplier: mutagens.fertilityMultiplier * (e.fertilityMultiplier ?? 1),
      lifespanCostDays: mutagens.lifespanCostDays + (e.lifespanCostDays ?? 0),
      extraStillbirthChance:
        1 - (1 - mutagens.extraStillbirthChance) * (1 - (e.extraStillbirthChance ?? 0)),
    };
    crossoverMultiplier *= e.crossoverMultiplier ?? 1;
    fertilityMultiplier *= e.fertilityMultiplier ?? 1;
    incubationMultiplier *= e.incubationMultiplier ?? 1;
    lifespanCostDays += e.lifespanCostDays ?? 0;
    if (e.sexSelection) sexSelection = e.sexSelection;
  }

  return {
    // Fertility is applied once, through the mutagen load: multiplying it in
    // twice would silently double every tonic.
    mutagens: { ...mutagens, fertilityMultiplier: 1 },
    rates: BASELINE_MUTATION,
    crossoverMultiplier,
    fertilityMultiplier: fertilityMultiplier,
    incubationMultiplier,
    ...(sexSelection ? { sexSelection } : {}),
    lifespanCostDays,
  };
}

/**
 * Breeding a dam to a stud published by another station.
 *
 * He is never on the ranch: he arrives as a genome code, joins the pedigree as
 * an unrelated founder, contributes a gamete, and is gone. What you get is one
 * gamete's worth of somebody else's work, which is what a stud fee buys.
 */
function doBreedToStud(
  state: RanchState,
  damId: CreatureId,
  offer: StudOffer,
  itemIds: readonly string[],
): ActionResult {
  const dam = findCreature(state, damId);
  if (!dam) return blocked(state, "That creature is not on the ranch.");
  if (state.trial) return blocked(state, "There is no exchange here. What you were given is what you have.");

  let read: ReturnType<typeof readStud>;
  try {
    read = readStud(offer);
  } catch (error) {
    return blocked(state, error instanceof Error ? error.message : "That stud offer could not be read.");
  }

  const map = geneMapById(read.species);
  const phenotype = expressPhenotype(read.genome, map);
  const stud: Creature = newCreature({
    id: `stud:${offer.code.slice(0, 10)}`,
    genome: read.genome,
    phenotype,
    map,
    name: `${offer.name} of ${offer.station}`,
    day: state.day,
    origin: "gift",
    inbreeding: 0,
    generation: 0,
    ageDays: 60,
  });

  return performBreeding(state, stud, dam, itemIds, { station: offer.station, fee: offer.fee });
}

function doBreed(
  state: RanchState,
  sireId: CreatureId,
  damId: CreatureId,
  itemIds: readonly string[],
): ActionResult {
  const sire = findCreature(state, sireId);
  const dam = findCreature(state, damId);
  if (!sire || !dam) return blocked(state, "Both parents must be on the ranch.");
  if (sire.id === dam.id) return blocked(state, "A creature cannot breed with itself.");
  if (!isFertile(sire)) return blocked(state, "The sire must be an adult. Fertility closes at Elder.");
  return performBreeding(state, sire, dam, itemIds);
}

/**
 * The shared breeding path.
 *
 * Split out because the Stud Exchange breeds a dam to an animal that is not on
 * the ranch and never will be: the sire arrives as a genome code, contributes a
 * gamete, and vanishes. Everything downstream of the pairing — mutation events,
 * epigenetic marks, the lifespan cost of a mutagen, the incubation clock — is
 * the same either way, and duplicating it for the exchange would guarantee the
 * two drifted apart.
 */
function performBreeding(
  state: RanchState,
  sire: Creature,
  dam: Creature,
  itemIds: readonly string[],
  external?: { readonly station: string; readonly fee: number },
): ActionResult {
  const sireId = sire.id;
  const damId = dam.id;
  // Two species, two gene maps, two chromosome sets. There is no hybrid to
  // express and no honest way to invent one, so the pairing is simply refused.
  if (sire.species !== dam.species) {
    return blocked(state, "A Quillfen and a Silt-Adder are not going to produce anything. Pair like with like.");
  }
  const map = mapOf(sire);
  if (sire.sex !== "male" || dam.sex !== "female") return blocked(state, "Pair a male with a female.");
  if (!isFertile(dam)) {
    return blocked(state, "The dam must be an adult. Fertility closes when she becomes an elder.");
  }
  if (state.creatures.filter((c) => c.status === "active").length >= state.capacity) {
    return blocked(state, "The ranch is full. Archive or release something first.");
  }
  if (state.trial) {
    const next = Math.max(sire.generation, dam.generation) + 1;
    if (next > state.trial.generations) {
      return blocked(
        state,
        `That would be generation ${next}. This one runs to ${state.trial.generations}.`,
      );
    }
  }

  for (const id of itemIds) {
    if ((state.inventory.items[id] ?? 0) <= 0) return blocked(state, `You have no ${itemById(id).name}.`);
  }
  const items = itemIds.map(itemById);
  const load = loadFromItems(items);

  if (external && state.inventory.motes < external.fee) {
    return blocked(state, `${external.station} asks ${external.fee} motes for that pairing.`);
  }

  const { rng: breedingRng, cursor } = rollFor(state, "breed");
  // A stud has no pedigree here, so Wright's F is zero by construction — which
  // is the entire reason a closed herd pays the fee.
  const f = external ? 0 : projectedInbreeding(state, sireId, damId);

  const result = breed(sire.genome, dam.genome, map, breedingRng, {
    inbreeding: f,
    mutationRates: load.rates,
    mutagens: load.mutagens,
    crossoverMultiplier: load.crossoverMultiplier,
    fertilityMultiplier: load.fertilityMultiplier,
    ...(load.sexSelection ? { sexSelection: load.sexSelection } : {}),
  });

  // Consumables are spent whatever the outcome. A mutagen does not refund
  // itself because the pairing failed.
  let inventory = state.inventory;
  for (const item of items) {
    if (!item.consumable) continue;
    inventory = {
      ...inventory,
      items: { ...inventory.items, [item.id]: (inventory.items[item.id] ?? 0) - 1 },
    };
  }

  // Both parents pay the lifespan cost of whatever was used on them.
  const cost = load.lifespanCostDays + load.mutagens.lifespanCostDays;
  const withCost = (c: Creature): Creature =>
    cost > 0 ? { ...c, lifespanDays: Math.max(c.ageDays + 1, c.lifespanDays - cost) } : c;

  const events: GameEvent[] = [];
  let creatures = state.creatures.map((c) =>
    c.id === damId || (!external && c.id === sireId) ? withCost(c) : c,
  );
  let nextId = state.nextId;
  // The stud joins the pedigree as an unrelated founder. Without a record his
  // descendants would have a father the kinship maths cannot see, and every F
  // computed downstream would be quietly wrong.
  let pedigree = external ? [...state.pedigree, { id: sireId, name: sire.name, generation: 0 }] : state.pedigree;
  let compendium = state.compendium;
  if (external) inventory = { ...inventory, motes: inventory.motes - external.fee };

  if (result.outcome === "no-egg") {
    events.push({ kind: "noEgg" });
  } else {
    const id = `c${nextId++}`;
    const phenotype = expressPhenotype(result.genome, map, {
      inbreedingDepression: inbreedingDepressionFor(f),
    });
    const sirePhenotype = phenotypeOf(sire);
    const damPhenotype = phenotypeOf(dam);
    const marks = deriveOffspringMarks(
      { marks: sire.marks, achievement: achievement(sire, sirePhenotype, map) },
      { marks: dam.marks, achievement: achievement(dam, damPhenotype, map) },
      map.polygenicTraits.map((t) => t.id),
      DEFAULT_EPIGENETICS,
    );

    const doomed =
      result.outcome === "lethal"
        ? { reason: result.cause.reason, locus: result.cause.locus }
        : result.outcome === "stillborn"
          ? { reason: "The egg did not develop." }
          : undefined;

    const egg = newCreature({
      id,
      genome: result.genome,
      phenotype,
      map,
      name: makeName(breedingRng),
      day: state.day,
      origin: "bred",
      inbreeding: f,
      generation: Math.max(sire.generation, dam.generation) + 1,
      sireId,
      damId,
      marks,
      ...(doomed ? { doomed } : {}),
    });

    creatures = [...creatures, egg];
    pedigree = [...pedigree, { id, sire: sireId, dam: damId, name: egg.name, generation: egg.generation }];

    for (const mutation of result.mutations) {
      const allele = map.allele(mutation.locus, mutation.to);
      events.push({
        kind: "mutation",
        id,
        locus: mutation.locus,
        allele: mutation.to,
        novel: allele.novel ?? false,
      });
      if (allele.novel) {
        events.push({
          kind: "discovery",
          what: "Novel allele",
          detail: `${allele.name} at ${map.locus(mutation.locus).name} — no wild population carries this.`,
        });
      }
      compendium = recordAllele(compendium, map.species.id, mutation.to);
    }
    compendium = recordEpistasisFor(compendium, map.species.id, phenotype.epistasisActive);
  }

  const afterBreed: RanchState = {
    ...state,
    creatures,
    pedigree,
    inventory,
    compendium,
    nextId,
    rngCursor: cursor,
  };

  // Incubation acceleration is applied by aging the egg forward, which keeps
  // one definition of stage thresholds rather than a per-creature multiplier.
  const accelerated =
    load.incubationMultiplier < 1 && afterBreed.creatures.length > state.creatures.length
      ? {
          ...afterBreed,
          creatures: afterBreed.creatures.map((c, index) =>
            index === afterBreed.creatures.length - 1
              ? { ...c, ageDays: INCUBATION_DAYS * (1 - load.incubationMultiplier) }
              : c,
          ),
        }
      : afterBreed;

  const advanced = advance(accelerated, DAY_COST.breed);
  return { state: advanced.state, events: [...events, ...advanced.events] };
}

// --- Care ------------------------------------------------------------------

function doTend(state: RanchState, id: CreatureId): ActionResult {
  const creature = findCreature(state, id);
  if (!creature) return blocked(state, "That creature is not on the ranch.");
  if (creature.stage === "egg") return blocked(state, "There is nothing to tend yet.");

  const tended: RanchState = {
    ...state,
    creatures: state.creatures.map((c) =>
      c.id === id ? { ...c, bond: Math.min(100, c.bond + 9) } : c,
    ),
  };
  return advance(tended, DAY_COST.tend);
}

/** Item effects that make sense carried around rather than consumed. */
const HOLDABLE = new Set(["held", "decor", "trainingGear"]);

function doHoldItem(state: RanchState, id: CreatureId, item: string | undefined): ActionResult {
  const creature = findCreature(state, id);
  if (!creature) return blocked(state, "That creature is not on the ranch.");
  if (item !== undefined) {
    if ((state.inventory.items[item] ?? 0) <= 0) return blocked(state, `You have no ${itemById(item).name}.`);
    if (!HOLDABLE.has(itemById(item).effect.kind)) return blocked(state, "That item cannot be held.");
    const heldElsewhere = state.creatures.some((c) => c.id !== id && c.heldItem === item);
    const spare = (state.inventory.items[item] ?? 0) - state.creatures.filter((c) => c.heldItem === item).length;
    if (heldElsewhere && spare <= 0) return blocked(state, `Every ${itemById(item).name} you own is already held.`);
  }
  return patch(state, id, (c) => ({ ...c, heldItem: item }));
}

function doUseItem(
  state: RanchState,
  id: CreatureId,
  itemId: string,
  locus: LocusId | undefined,
): ActionResult {
  const creature = findCreature(state, id);
  if (!creature) return blocked(state, "That creature is not on the ranch.");
  const map = mapOf(creature);
  if ((state.inventory.items[itemId] ?? 0) <= 0) return blocked(state, `You have no ${itemById(itemId).name}.`);
  const item = itemById(itemId);
  const events: GameEvent[] = [];
  let next = creature;
  let archiveSlots = 0;
  let spreadTo: LocusId | undefined;

  switch (item.effect.kind) {
    case "reveal": {
      const revealed = new Set(creature.revealed);
      if (item.effect.tier === "one") {
        if (!locus || !map.hasLocus(locus)) return blocked(state, "Choose a locus to read.");
        revealed.add(locus);
      } else if (item.effect.tier === "coat") {
        // Tier 2 reads coat and form, and deliberately not stat loci (§1.3).
        for (const l of map.loci) if (l.mode.kind !== "polygenic") revealed.add(l.id);
      } else {
        for (const l of map.loci) revealed.add(l.id);
      }
      next = {
        ...creature,
        revealed: [...revealed].sort(),
        phaseKnown: creature.phaseKnown || (item.effect.phase ?? false),
      };
      events.push({ kind: "revealed", id, loci: [...revealed].sort() });
      // A test cross reads the clutch, not the animal. Its whole value is that
      // you bred first and asked afterwards.
      if (item.effect.spread === "offspring" && locus) {
        spreadTo = locus;
      }
      break;
    }
    case "archiveSlots":
      archiveSlots = item.effect.slots;
      events.push({
        kind: "discovery",
        what: "Archive extended",
        detail: `${item.effect.slots} more berths. The pedigree you can still examine just got longer.`,
      });
      break;
    case "conditioning": {
      const effect = item.effect;
      const phenotype = phenotypeOf(creature);
      const trait = map.polygenicTraits.find((t) => t.id === effect.stat);
      if (!trait) return blocked(state, "This species does not have that stat.");
      if (creature.stage === "egg") return blocked(state, "There is nothing to feed yet.");
      const ceiling = phenotype.stats[trait.id] ?? trait.min;
      const current = creature.achieved[trait.id] ?? trait.min;
      // A fraction of what remains: asymptotic, exactly like every other day of
      // raising, so no amount of feed can pass the genetic ceiling.
      const closed = current + (ceiling - current) * effect.closeFraction;
      next = { ...creature, achieved: { ...creature.achieved, [trait.id]: Math.min(ceiling, closed) } };
      break;
    }
    case "bond":
      next = { ...creature, bond: Math.min(100, creature.bond + item.effect.amount) };
      break;
    case "lifespan":
      next = { ...creature, lifespanDays: creature.lifespanDays + item.effect.days };
      break;
    case "suppressDominance":
      // Purely an observation aid: the UI passes `suppressDominanceAt` to the
      // expression call. Nothing about the creature changes, which is the point.
      events.push({
        kind: "discovery",
        what: "Suppressor applied",
        detail: "Recessive expression shown for this observation only. The genome is unchanged.",
      });
      break;
    default:
      return blocked(state, "That item is not used this way.");
  }

  const offspring =
    spreadTo === undefined
      ? []
      : state.creatures.filter(
          (c) => (c.sireId === id || c.damId === id) && c.species === creature.species,
        );
  if (spreadTo !== undefined) {
    for (const child of offspring) events.push({ kind: "revealed", id: child.id, loci: [spreadTo] });
  }
  const read = new Set(offspring.map((c) => c.id));

  return {
    state: {
      ...state,
      creatures: state.creatures.map((c) => {
        if (c.id === id) return next;
        if (spreadTo === undefined || !read.has(c.id)) return c;
        return { ...c, revealed: [...new Set([...c.revealed, spreadTo])].sort() };
      }),
      archiveCapacity: state.archiveCapacity + archiveSlots,
      inventory: {
        ...state.inventory,
        items: { ...state.inventory.items, [itemId]: (state.inventory.items[itemId] ?? 0) - 1 },
      },
    },
    events,
  };
}

// --- Leaving the ranch -----------------------------------------------------

/**
 * §2.1's emotional off-ramp: an Elder can be retired instead of dying. It stops
 * breeding, but its genome is preserved and viewable forever.
 */
function doArchive(state: RanchState, id: CreatureId): ActionResult {
  const creature = findCreature(state, id);
  if (!creature) return blocked(state, "That creature is not on the ranch.");
  if (state.archive.length >= state.archiveCapacity) return blocked(state, "The Archive is full.");
  const archived: Creature = { ...creature, status: "archived" };
  return {
    state: {
      ...state,
      creatures: state.creatures.filter((c) => c.id !== id),
      archive: [...state.archive, archived],
    },
    events: [{ kind: "archived", id, name: creature.name }],
  };
}

function doRelease(state: RanchState, id: CreatureId): ActionResult {
  const creature = findCreature(state, id);
  if (!creature) return blocked(state, "That creature is not on the ranch.");
  return {
    state: { ...state, creatures: state.creatures.filter((c) => c.id !== id) },
    events: [{ kind: "released", id, name: creature.name }],
  };
}

function doCatchWild(state: RanchState, species?: SpeciesId): ActionResult {
  if (state.trial) {
    return blocked(state, "There is no fen here. What you were given is what you have.");
  }
  if (state.creatures.filter((c) => c.status === "active").length >= state.capacity) {
    return blocked(state, "The ranch is full.");
  }
  // The fen outside the station is the home species' fen. Other stock comes
  // from expeditions and the exchange, not from a walk to the reedbank.
  const map = species === undefined ? homeMap(state) : geneMapById(species);
  const { rng: catchRng, cursor } = rollFor(state, "wild");
  const genome = randomWildGenome(map, catchRng);
  const phenotype = expressPhenotype(genome, map);
  const id = `c${state.nextId}`;
  const creature = newCreature({
    id,
    genome,
    phenotype,
    map,
    name: makeName(catchRng),
    day: state.day,
    origin: "wild",
    inbreeding: 0,
    generation: 0,
    ageDays: 56,
  });

  const caught: RanchState = {
    ...state,
    creatures: [...state.creatures, creature],
    pedigree: [...state.pedigree, { id, name: creature.name, generation: 0 }],
    nextId: state.nextId + 1,
    rngCursor: cursor,
    compendium: recordEpistasisFor(state.compendium, map.species.id, phenotype.epistasisActive),
  };

  const advanced = advance(caught, DAY_COST.catchWild);
  return {
    state: advanced.state,
    events: [{ kind: "caught", id, name: creature.name }, ...advanced.events],
  };
}

// --- Compendium ------------------------------------------------------------

function recordAllele(
  compendium: RanchState["compendium"],
  species: SpeciesId,
  allele: string,
): RanchState["compendium"] {
  // Qualified by species: allele ids are unique within a gene map and not
  // across them, so a bare id would credit six species for one discovery.
  const key = alleleKey(species, allele);
  if (compendium.seenAlleles.includes(key)) return compendium;
  return { ...compendium, seenAlleles: [...compendium.seenAlleles, key].sort() };
}

function recordBranch(compendium: RanchState["compendium"], branch: string): RanchState["compendium"] {
  if (compendium.seenBranches.includes(branch)) return compendium;
  return { ...compendium, seenBranches: [...compendium.seenBranches, branch].sort() };
}

function recordEpistasisFor(
  compendium: RanchState["compendium"],
  species: SpeciesId,
  active: readonly string[],
): RanchState["compendium"] {
  return recordEpistasis(compendium, active.map((rule) => gateKey(species, rule)));
}

function recordEpistasis(
  compendium: RanchState["compendium"],
  active: readonly string[],
): RanchState["compendium"] {
  const merged = new Set([...compendium.seenEpistasis, ...active]);
  return merged.size === compendium.seenEpistasis.length
    ? compendium
    : { ...compendium, seenEpistasis: [...merged].sort() };
}

/**
 * Alleles the player has actually *seen* revealed, across every creature they
 * have owned. The Compendium's completion percentage counts these.
 */
export function knownAlleles(state: RanchState): Set<string> {
  const known = new Set(state.compendium.seenAlleles);
  for (const creature of [...state.creatures, ...state.archive]) {
    for (const locusId of creature.revealed) {
      for (const allele of genotypeAt(creature.genome, mapOf(creature).locus(locusId))) known.add(allele);
    }
  }
  return known;
}

// --- Queries the UI needs --------------------------------------------------

export function activeCreatures(state: RanchState): Creature[] {
  return state.creatures.filter((c) => c.status === "active");
}

export function fertilePairs(state: RanchState): { sires: Creature[]; dams: Creature[] } {
  const active = activeCreatures(state).filter(isFertile);
  return {
    sires: active.filter((c) => c.sex === "male"),
    dams: active.filter((c) => c.sex === "female"),
  };
}

/** Lethal alleles a creature carries. Only reportable for revealed loci. */
export function knownCarriedLethals(creature: Creature): string[] {
  const revealed = new Set(creature.revealed);
  const map = mapOf(creature);
  return carriedLethals(creature.genome, map)
    .filter((hit) => revealed.has(hit.locus))
    .map((hit) => `${map.locus(hit.locus).name}: ${map.allele(hit.locus, hit.allele).name}`);
}
