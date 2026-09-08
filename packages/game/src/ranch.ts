/**
 * The ranch: state, actions, and the day loop.
 *
 * `applyAction(state, action, map)` is a pure function returning a new state
 * and a list of events. Nothing here mutates, reads a clock, or touches the
 * network. The RNG state travels inside the ranch, so a save file plus a list
 * of actions reproduces a playthrough exactly — which is what Daily Genome,
 * Trial scoring and bug reports all need.
 */

import type { GeneMap, Genome, LocusId, MutationRates, Phenotype, StatId } from "@chimaera/genetics";
import {
  BASELINE_MUTATION,
  breed,
  carriedLethals,
  createRng,
  DEFAULT_EPIGENETICS,
  deriveOffspringMarks,
  expressPhenotype,
  genotypeAt,
  NO_MUTAGENS,
  Pedigree,
  randomWildGenome,
  rngFromState,
  sexOf,
} from "@chimaera/genetics";
import type { MutagenLoad, Rng } from "@chimaera/genetics";
import { equipmentById } from "./combat.js";
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
import type {
  Action,
  ActionResult,
  Creature,
  CreatureId,
  GameEvent,
  RanchState,
} from "./types.js";

/**
 * v2 added `campaign`. The migration in `save.ts` fills it in, which is the
 * whole reason the migration chain was written before there was anything to
 * migrate.
 */
export const SAVE_VERSION = 2;

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
export function phenotypeOf(creature: Creature, map: GeneMap): Phenotype {
  const cached = phenotypeCache.get(creature.genome);
  if (cached) return cached;
  const phenotype = expressPhenotype(creature.genome, map, {
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
  readonly founders?: number;
  readonly capacity?: number;
  readonly motes?: number;
  readonly startingItems?: Readonly<Record<string, number>>;
}

export function createRanch(map: GeneMap, options: NewRanchOptions): RanchState {
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
export function campaignView(state: RanchState, map: GeneMap): CampaignView {
  return { state, map, phenotype: (creature) => phenotypeOf(creature, map) };
}

/**
 * Re-asks the active chapter's objectives after every player action.
 *
 * It runs once, on the outermost action — never on the `advance` calls that
 * breeding and bouts make internally — so a single breed cannot tick an
 * objective twice, and the events land in the same batch the player sees.
 */
function withCampaign(result: ActionResult, map: GeneMap): ActionResult {
  const outcome = advanceCampaign(
    result.state.campaign,
    campaignView(result.state, map),
    result.events,
    campaignFor(map),
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

export function applyAction(state: RanchState, action: Action, map: GeneMap): ActionResult {
  return withCampaign(dispatch(state, action, map), map);
}

function dispatch(state: RanchState, action: Action, map: GeneMap): ActionResult {
  switch (action.kind) {
    case "advanceDays":
      return advance(state, Math.max(0, Math.floor(action.days)), map);
    case "breed":
      return doBreed(state, action.sireId, action.damId, action.items ?? [], map);
    case "setDiet":
      return patch(state, action.id, (c) => ({ ...c, diet: action.diet }));
    case "setHabitat":
      return patch(state, action.id, (c) => ({ ...c, habitat: action.habitat }));
    case "setTraining":
      return patch(state, action.id, (c) => ({ ...c, training: action.training }));
    case "rename":
      return renameCreature(state, action.id, action.name);
    case "tend":
      return doTend(state, action.id, map);
    case "holdItem":
      return doHoldItem(state, action.id, action.item);
    case "useItem":
      return doUseItem(state, action.id, action.item, action.locus, map);
    case "archive":
      return doArchive(state, action.id);
    case "release":
      return doRelease(state, action.id);
    case "catchWild":
      return doCatchWild(state, map);
    case "setRole":
      return patch(state, action.id, (c) => ({ ...c, role: action.role }));
    case "setStance":
      return patch(state, action.id, (c) => ({ ...c, stance: action.stance }));
    case "setEquipment":
      return doSetEquipment(state, action.id, action.equipment);
    case "bout":
      return runBout(state, action.team, action.tier, map, advance);
    case "enterExpedition":
      return enterExpedition(state, action.team, action.regionSeed, map);
    case "expeditionMove":
      return expeditionMove(state, action.nodeId, map, advance);
    case "expeditionWithdraw":
      return expeditionWithdraw(state, map, advance);
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
export function advance(state: RanchState, days: number, map: GeneMap): ActionResult {
  let current = state;
  const events: GameEvent[] = [];

  for (let day = 0; day < days; day++) {
    const creatures: Creature[] = [];
    for (const creature of current.creatures) {
      if (creature.status !== "active") {
        creatures.push(creature);
        continue;
      }
      const phenotype = phenotypeOf(creature, map);
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

function doBreed(
  state: RanchState,
  sireId: CreatureId,
  damId: CreatureId,
  itemIds: readonly string[],
  map: GeneMap,
): ActionResult {
  const sire = findCreature(state, sireId);
  const dam = findCreature(state, damId);
  if (!sire || !dam) return blocked(state, "Both parents must be on the ranch.");
  if (sire.id === dam.id) return blocked(state, "A creature cannot breed with itself.");
  if (sire.sex !== "male" || dam.sex !== "female") return blocked(state, "Pair a male with a female.");
  if (!isFertile(sire) || !isFertile(dam)) {
    return blocked(state, "Both parents must be adults. Fertility closes when they become elders.");
  }
  if (state.creatures.filter((c) => c.status === "active").length >= state.capacity) {
    return blocked(state, "The ranch is full. Archive or release something first.");
  }

  for (const id of itemIds) {
    if ((state.inventory.items[id] ?? 0) <= 0) return blocked(state, `You have no ${itemById(id).name}.`);
  }
  const items = itemIds.map(itemById);
  const load = loadFromItems(items);

  const { rng: breedingRng, cursor } = rollFor(state, "breed");
  const f = projectedInbreeding(state, sireId, damId);

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
  let creatures = state.creatures.map((c) => (c.id === sireId || c.id === damId ? withCost(c) : c));
  let nextId = state.nextId;
  let pedigree = state.pedigree;
  let compendium = state.compendium;

  if (result.outcome === "no-egg") {
    events.push({ kind: "noEgg" });
  } else {
    const id = `c${nextId++}`;
    const phenotype = expressPhenotype(result.genome, map, {
      inbreedingDepression: inbreedingDepressionFor(f),
    });
    const sirePhenotype = phenotypeOf(sire, map);
    const damPhenotype = phenotypeOf(dam, map);
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
      compendium = recordAllele(compendium, mutation.to);
    }
    compendium = recordEpistasis(compendium, phenotype.epistasisActive);
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

  const advanced = advance(accelerated, DAY_COST.breed, map);
  return { state: advanced.state, events: [...events, ...advanced.events] };
}

// --- Care ------------------------------------------------------------------

function doTend(state: RanchState, id: CreatureId, map: GeneMap): ActionResult {
  const creature = findCreature(state, id);
  if (!creature) return blocked(state, "That creature is not on the ranch.");
  if (creature.stage === "egg") return blocked(state, "There is nothing to tend yet.");

  const tended: RanchState = {
    ...state,
    creatures: state.creatures.map((c) =>
      c.id === id ? { ...c, bond: Math.min(100, c.bond + 9) } : c,
    ),
  };
  return advance(tended, DAY_COST.tend, map);
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
  map: GeneMap,
): ActionResult {
  const creature = findCreature(state, id);
  if (!creature) return blocked(state, "That creature is not on the ranch.");
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
      const phenotype = phenotypeOf(creature, map);
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

  const offspring = spreadTo === undefined ? [] : state.creatures.filter((c) => c.sireId === id || c.damId === id);
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

function doCatchWild(state: RanchState, map: GeneMap): ActionResult {
  if (state.creatures.filter((c) => c.status === "active").length >= state.capacity) {
    return blocked(state, "The ranch is full.");
  }
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
    compendium: recordEpistasis(state.compendium, phenotype.epistasisActive),
  };

  const advanced = advance(caught, DAY_COST.catchWild, map);
  return {
    state: advanced.state,
    events: [{ kind: "caught", id, name: creature.name }, ...advanced.events],
  };
}

// --- Compendium ------------------------------------------------------------

function recordAllele(compendium: RanchState["compendium"], allele: string): RanchState["compendium"] {
  if (compendium.seenAlleles.includes(allele)) return compendium;
  return { ...compendium, seenAlleles: [...compendium.seenAlleles, allele].sort() };
}

function recordBranch(compendium: RanchState["compendium"], branch: string): RanchState["compendium"] {
  if (compendium.seenBranches.includes(branch)) return compendium;
  return { ...compendium, seenBranches: [...compendium.seenBranches, branch].sort() };
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
export function knownAlleles(state: RanchState, map: GeneMap): Set<string> {
  const known = new Set(state.compendium.seenAlleles);
  for (const creature of [...state.creatures, ...state.archive]) {
    for (const locusId of creature.revealed) {
      for (const allele of genotypeAt(creature.genome, map.locus(locusId))) known.add(allele);
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
export function knownCarriedLethals(creature: Creature, map: GeneMap): string[] {
  const revealed = new Set(creature.revealed);
  return carriedLethals(creature.genome, map)
    .filter((hit) => revealed.has(hit.locus))
    .map((hit) => `${map.locus(hit.locus).name}: ${map.allele(hit.locus, hit.allele).name}`);
}
