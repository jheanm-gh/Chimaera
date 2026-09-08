/**
 * League bouts and expedition runs: the two places combat touches the ranch.
 *
 * A bout is safe and repeatable — the League is the difficulty curve and the
 * legible answer to "am I getting better at genetics?" (§3). An expedition is
 * neither: it costs days, it carries damage between nodes, and what falls there
 * is gone.
 *
 * Both are faucets for the breeding economy rather than ends in themselves.
 * Winning yields gene fragments, motes, mutagens and — the thing that actually
 * matters to a closed herd — unrelated wild stock.
 */

import type { GeneMap, Genome, LocusId, SpeciesId } from "@chimaera/genetics";
import { expressPhenotype, geneMapById, rngFromState, sexOf } from "@chimaera/genetics";
import { mapOf, homeMap, speciesForBiome } from "./bestiary.js";
import type { CombatantSpec, Role } from "./combat.js";
import { maxHpOf, simulateBattle } from "./combat.js";
import type { ExpeditionLoot, ExpeditionMember, ExpeditionState } from "./expedition.js";
import {
  DAYS_PER_NODE,
  EMPTY_LOOT,
  generateRegion,
  lootFor,
  mergeLoot,
  nodeById,
  wildOpponents,
} from "./expedition.js";
import { currentStats } from "./lifecycle.js";
import type { ActionResult, Creature, CreatureId, GameEvent, Inventory, RanchState } from "./types.js";

export const EXPEDITION_TEAM_SIZE = 3;
/** How much of a creature's condition a spring gives back. Never all of it. */
const SPRING_RESTORE = 0.45;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function blocked(state: RanchState, reason: string): ActionResult {
  return { state, events: [{ kind: "blocked", reason }] };
}

/**
 * A creature as a combatant. Stats come from `currentStats` — the genetic
 * ceiling filtered through raising and its epigenetic head start — so combat is
 * reading the breeding, exactly as §3 requires.
 */
export function combatantFor(creature: Creature, startingHp?: number): CombatantSpec {
  const map = mapOf(creature);
  const phenotype = expressPhenotype(creature.genome, map);
  return {
    id: creature.id,
    name: creature.name,
    affinities: (phenotype.traits.affinity ?? "").split("+").filter(Boolean),
    role: creature.role,
    stance: creature.stance,
    stats: currentStats(creature, phenotype, map),
    equipment: creature.equipment,
    ...(startingHp === undefined ? {} : { startingHp }),
  };
}

function grantLoot(inventory: Inventory, loot: ExpeditionLoot): Inventory {
  const items = { ...inventory.items };
  for (const [id, count] of Object.entries(loot.items)) items[id] = (items[id] ?? 0) + count;
  const fragments = { ...inventory.fragments };
  for (const [id, count] of Object.entries(loot.fragments)) fragments[id] = (fragments[id] ?? 0) + count;
  return { motes: inventory.motes + loot.motes, items, fragments };
}

function rollFor(state: RanchState, label: string): { rng: ReturnType<typeof rngFromState>; cursor: number } {
  return {
    rng: rngFromState(state.rng).fork(`${label}:${state.rngCursor}`),
    cursor: state.rngCursor + 1,
  };
}

// ---------------------------------------------------------------------------
// League bouts
// ---------------------------------------------------------------------------

export const LEAGUE_TIERS = [
  { tier: 1, name: "Fenward Novice", difficulty: 0.16, purse: 60 },
  { tier: 2, name: "Reedbank Open", difficulty: 0.32, purse: 120 },
  { tier: 3, name: "Causeway Trial", difficulty: 0.48, purse: 220 },
  { tier: 4, name: "Nine Sisters Cup", difficulty: 0.64, purse: 380 },
  { tier: 5, name: "The Warden's Table", difficulty: 0.82, purse: 640 },
] as const;

export function leagueTier(tier: number): (typeof LEAGUE_TIERS)[number] {
  const found = LEAGUE_TIERS.find((entry) => entry.tier === tier);
  if (!found) throw new Error(`unknown league tier ${tier}`);
  return found;
}

/**
 * One League bout. Costs a day, never a life.
 *
 * The League exists to give the campaign a spine and the player a scoreboard.
 * Losing here should sting and teach; it should not delete a lineage.
 */
export function runBout(
  state: RanchState,
  teamIds: readonly CreatureId[],
  tier: number,
  advance: (state: RanchState, days: number) => ActionResult,
): ActionResult {
  // The League is local. Whatever mixed stock you keep, the animals across the
  // sand are the home fen's.
  const map = homeMap(state);
  if (state.expedition) return blocked(state, "You are out on an expedition.");
  const team = teamIds.map((id) => state.creatures.find((c) => c.id === id && c.status === "active"));
  if (team.some((c) => !c)) return blocked(state, "Some of that team is not on the ranch.");
  if (team.length === 0 || team.length > 3) return blocked(state, "A team is one to three creatures.");
  if (team.some((c) => (c as Creature).stage === "egg")) return blocked(state, "Eggs do not fight.");
  if (tier > state.leagueTier + 1) return blocked(state, "That tier is not open yet. Win the one below it.");

  const entry = leagueTier(tier);
  const { rng, cursor } = rollFor(state, `bout:${tier}`);
  const mine = (team as Creature[]).map((creature) => combatantFor(creature));
  const opposition = wildOpponents(map, entry.difficulty, Math.max(1, mine.length), rng);
  const theirs = opposition.specs;
  const result = simulateBattle(mine, theirs, rng);

  const won = result.winner === 0;
  const purse = won ? entry.purse : Math.round(entry.purse * 0.2);
  const fragments: Record<LocusId, number> = {};
  if (won) {
    for (let i = 0; i < 2 + tier; i++) fragments[rng.pick(map.loci).id] = (fragments[rng.pick(map.loci).id] ?? 0) + 1;
  }

  const events: GameEvent[] = [
    {
      kind: "battle",
      won,
      rounds: result.rounds,
      tier,
      summary: won
        ? `Took ${entry.name} in ${result.rounds} rounds.`
        : `Lost ${entry.name} after ${result.rounds} rounds.`,
    },
  ];

  const afterBout: RanchState = {
    ...state,
    rngCursor: cursor,
    leagueTier: won ? Math.max(state.leagueTier, tier) : state.leagueTier,
    inventory: grantLoot(state.inventory, { ...EMPTY_LOOT, motes: purse, fragments }),
  };
  const advanced = advance(afterBout, 1);
  return {
    state: advanced.state,
    events: [...events, ...advanced.events],
    playback: {
      kind: "league",
      title: entry.name,
      winner: result.winner,
      rounds: result.rounds,
      actors: [
        ...(team as Creature[]).map((creature, index) => ({
          id: (mine[index] as CombatantSpec).id,
          name: creature.name,
          team: 0 as const,
          species: creature.species,
          genome: creature.genome,
          maxHp: maxHpOf(mine[index] as CombatantSpec),
          role: (mine[index] as CombatantSpec).role,
        })),
        ...theirs.map((spec, index) => ({
          id: spec.id,
          name: spec.name,
          team: 1 as const,
          species: map.species.id,
          genome: opposition.genomes[index] as Genome,
          maxHp: maxHpOf(spec),
          role: spec.role,
        })),
      ],
      log: result.log,
    },
  };
}

/**
 * The bulk evaluation the design asks for by name (§3): fifty fights against a
 * cleared tier, resolved instantly, so a player can measure a lineage instead
 * of watching one lucky fight.
 */
export function evaluateLineage(
  state: RanchState,
  teamIds: readonly CreatureId[],
  tier: number,
  fights: number,
): { winRate: number; meanRounds: number; survival: Record<string, number> } | undefined {
  if (tier > state.leagueTier) return undefined;
  const map = homeMap(state);
  const team = teamIds
    .map((id) => state.creatures.find((c) => c.id === id && c.status === "active"))
    .filter((c): c is Creature => Boolean(c));
  if (team.length === 0) return undefined;

  const entry = leagueTier(tier);
  const rng = rngFromState(state.rng).fork(`evaluate:${tier}:${state.rngCursor}`);
  const mine = team.map((creature) => combatantFor(creature));
  let wins = 0;
  let rounds = 0;
  const survival: Record<string, number> = Object.fromEntries(team.map((c) => [c.id, 0]));

  for (let i = 0; i < fights; i++) {
    // Fresh opponents each fight: the question is "how does this lineage do
    // against this tier", not "against this one team".
    const theirs = wildOpponents(map, entry.difficulty, mine.length, rng).specs;
    const result = simulateBattle(mine, theirs, rng, { quiet: true });
    if (result.winner === 0) wins++;
    rounds += result.rounds;
    for (const survivor of result.survivors) {
      if (survivor.team === 0) survival[survivor.id] = (survival[survivor.id] ?? 0) + 1;
    }
  }
  for (const id of Object.keys(survival)) survival[id] = (survival[id] ?? 0) / fights;
  return { winRate: wins / fights, meanRounds: rounds / fights, survival };
}

// ---------------------------------------------------------------------------
// Expeditions
// ---------------------------------------------------------------------------

export function enterExpedition(
  state: RanchState,
  teamIds: readonly CreatureId[],
  regionSeed: string | undefined,
  target?: SpeciesId,
): ActionResult {
  if (state.expedition) return blocked(state, "You are already out.");
  // Gated behind one League win. A first expedition that wipes the starting
  // herd is not a lesson about risk, it is a lesson about not playing; the
  // League is where a player finds out what their animals can take.
  if (state.leagueTier < 1) {
    return blocked(state, "Win a League bout first. Find out what your stock can take before you risk it.");
  }
  if (teamIds.length !== EXPEDITION_TEAM_SIZE) {
    return blocked(state, `An expedition takes exactly ${EXPEDITION_TEAM_SIZE} creatures.`);
  }
  const team = teamIds.map((id) => state.creatures.find((c) => c.id === id && c.status === "active"));
  if (team.some((c) => !c)) return blocked(state, "Some of that team is not on the ranch.");
  if (team.some((c) => (c as Creature).stage === "egg" || (c as Creature).stage === "hatchling")) {
    return blocked(state, "Hatchlings do not go out. They would not come back.");
  }

  // Where you go decides what lives there — and an expedition is the only way
  // to bring another species home, which is what makes a closed herd's problem
  // solvable by travelling rather than by waiting.
  const destination = geneMapById(target ?? state.homeSpecies);
  const { cursor } = rollFor(state, "expedition");
  const seed = regionSeed ?? `${state.seed}:${state.day}:${cursor}`;
  const region = generateRegion(seed, {
    biome: destination.species.biome,
    species: destination.species.id,
  });
  const members: ExpeditionMember[] = (team as Creature[]).map((creature) => {
    const spec = combatantFor(creature);
    const maxHp = hpFor(spec);
    return {
      id: creature.id,
      hp: maxHp,
      maxHp,
      role: creature.role,
      stance: creature.stance,
      equipment: creature.equipment,
    };
  });

  const expedition: ExpeditionState = {
    region,
    team: members,
    at: region.entry,
    visited: [region.entry],
    loot: EMPTY_LOOT,
    status: "active",
    log: [`Put in at ${region.name}.`],
    lost: [],
    rngCursor: 0,
  };

  return {
    state: { ...state, expedition, rngCursor: cursor },
    events: [{ kind: "expeditionEntered", region: region.name }],
  };
}

/** Mirrors the combat module's HP formula so a run's bar matches its fights. */
function hpFor(spec: CombatantSpec): number {
  const weights = { vanguard: 1.35, runner: 0.85, reader: 1 } as const;
  return Math.round((36 + (spec.stats.vigour ?? 0) * 2.1) * weights[spec.role]);
}

export function expeditionMove(
  state: RanchState,
  nodeId: string,
  advance: (state: RanchState, days: number) => ActionResult,
): ActionResult {
  const run = state.expedition;
  if (!run || run.status !== "active") return blocked(state, "You are not out on an expedition.");
  const map = regionMap(run);
  const here = nodeById(run.region, run.at);
  if (!here.next.includes(nodeId)) return blocked(state, "You cannot get there from here.");

  const node = nodeById(run.region, nodeId);
  const rng = rngFromState(state.rng).fork(`expedition:${state.rngCursor}:${run.rngCursor}`);
  const events: GameEvent[] = [];
  const log = [...run.log];
  let team = run.team;
  let loot = run.loot;
  const lost = [...run.lost];
  const removedIds: CreatureId[] = [];

  if (node.kind === "encounter" || node.kind === "warden") {
    const mine: CombatantSpec[] = team.map((member) => {
      const creature = state.creatures.find((c) => c.id === member.id) as Creature;
      return combatantFor(creature, member.hp);
    });
    const count = node.kind === "warden" ? mine.length : Math.max(1, Math.min(mine.length, 1 + rng.int(mine.length)));
    const theirs = wildOpponents(map, node.difficulty, count, rng, state.day).specs;
    const result = simulateBattle(mine, theirs, rng, { quiet: true });

    const survivorHp = new Map(result.survivors.filter((s) => s.team === 0).map((s) => [s.id, s.hp]));
    team = team.map((member) => ({ ...member, hp: survivorHp.get(member.id) ?? 0 }));
    // Permadeath. §4 is explicit: creatures lost are gone.
    const fallen = team.filter((member) => member.hp <= 0);
    for (const member of fallen) {
      const creature = state.creatures.find((c) => c.id === member.id);
      lost.push(member.id);
      removedIds.push(member.id);
      events.push({
        kind: "lost",
        id: member.id,
        name: creature?.name ?? member.id,
        where: `${run.region.name}, ${node.name}`,
      });
      log.push(`${creature?.name ?? "One of the team"} did not come back from ${node.name}.`);
    }
    team = team.filter((member) => member.hp > 0);

    if (result.winner !== 0) {
      log.push(`Driven off at ${node.name}.`);
      const ended: ExpeditionState = {
        ...run,
        team,
        at: nodeId,
        visited: [...run.visited, nodeId],
        loot,
        lost,
        log,
        status: "lost",
        rngCursor: run.rngCursor + 1,
      };
      return finish(state, ended, removedIds, events, advance);
    }
    log.push(`Held ${node.name} in ${result.rounds} rounds.`);
    events.push({ kind: "battle", won: true, rounds: result.rounds, summary: `Held ${node.name}.` });
  }

  if (node.kind === "spring") {
    team = team.map((member) => ({
      ...member,
      hp: Math.min(member.maxHp, Math.round(member.hp + member.maxHp * SPRING_RESTORE)),
    }));
    log.push("Rested, a little.");
  }

  if (node.kind === "wild") {
    const { genomes } = wildOpponents(map, node.difficulty, 1, rng, state.day);
    loot = mergeLoot(loot, { specimens: genomes });
    log.push("Took a wild specimen. Unrelated to anything you own.");
  }

  const gained = lootFor(node, map, rng);
  if (Object.keys(gained).length > 0) loot = mergeLoot(loot, gained);

  events.push({ kind: "expeditionNode", node: node.name, detail: node.blurb });

  const nextRun: ExpeditionState = {
    ...run,
    team,
    at: nodeId,
    visited: [...run.visited, nodeId],
    loot,
    lost,
    log,
    status: node.kind === "warden" ? "won" : team.length === 0 ? "lost" : "active",
    rngCursor: run.rngCursor + 1,
  };

  if (nextRun.status !== "active") return finish(state, nextRun, removedIds, events, advance);

  const moved: RanchState = {
    ...state,
    expedition: nextRun,
    creatures: state.creatures.filter((c) => !removedIds.includes(c.id)),
  };
  const advanced = advance(moved, DAYS_PER_NODE);
  return { state: advanced.state, events: [...events, ...advanced.events] };
}

/**
 * The gene map of whatever lives where the team currently is.
 *
 * A save written before regions named their species is still readable: the
 * biome names it, and failing that the Mirefen is where everyone started.
 */
function regionMap(run: ExpeditionState) {
  return geneMapById(run.region.species ?? speciesForBiome(run.region.biome) ?? "quillfen");
}

export function expeditionWithdraw(
  state: RanchState,
  advance: (state: RanchState, days: number) => ActionResult,
): ActionResult {
  const run = state.expedition;
  if (!run || run.status !== "active") return blocked(state, "You are not out on an expedition.");
  return finish(state, { ...run, status: "withdrawn", log: [...run.log, "Turned for home."] }, [], [], advance);
}

/**
 * Ends a run: bank the loot, add any specimens the ranch has room for, remove
 * the fallen, and go home.
 *
 * Loot is kept on a loss as well as a win. The run already took a creature;
 * taking the findings too would only teach the player not to go out.
 */
function finish(
  state: RanchState,
  run: ExpeditionState,
  removedIds: readonly CreatureId[],
  events: GameEvent[],
  advance: (state: RanchState, days: number) => ActionResult,
): ActionResult {
  const map = regionMap(run);
  let creatures = state.creatures.filter((c) => !removedIds.includes(c.id));
  let pedigree = state.pedigree;
  let nextId = state.nextId;
  const room = state.capacity - creatures.filter((c) => c.status === "active").length;
  const taken = run.loot.specimens.slice(0, Math.max(0, room));

  for (const genome of taken) {
    const id = `c${nextId++}`;
    const phenotype = expressPhenotype(genome, map);
    const name = `Caught at ${run.region.name}`;
    creatures = [
      ...creatures,
      makeCaught(id, genome, name, state.day, map, phenotype.sex === "female" ? "female" : "male"),
    ];
    pedigree = [...pedigree, { id, name, generation: 0 }];
  }

  const summary =
    run.status === "won"
      ? `Cleared ${run.region.name}.`
      : run.status === "lost"
        ? `Driven out of ${run.region.name}.`
        : `Came home from ${run.region.name}.`;

  const home: RanchState = {
    ...state,
    creatures,
    pedigree,
    nextId,
    inventory: grantLoot(state.inventory, run.loot),
    expedition: undefined,
  };

  const advanced = advance(home, DAYS_PER_NODE);
  return {
    state: advanced.state,
    events: [
      ...events,
      { kind: "expeditionEnded", outcome: run.status === "active" ? "withdrawn" : run.status, summary },
      ...advanced.events,
    ],
  };
}

function makeCaught(
  id: CreatureId,
  genome: Genome,
  name: string,
  day: number,
  map: GeneMap,
  _sex: "female" | "male",
): Creature {
  const phenotype = expressPhenotype(genome, map);
  const achieved: Record<string, number> = {};
  for (const trait of map.polygenicTraits) {
    const ceiling = phenotype.stats[trait.id] ?? trait.min;
    achieved[trait.id] = trait.min + (ceiling - trait.min) * 0.55;
  }
  return {
    id,
    species: map.species.id,
    genome,
    name,
    sex: sexOf(genome, map),
    stage: "adult",
    ageDays: 60,
    lifespanDays: 210,
    status: "active",
    generation: 0,
    inbreeding: 0,
    diet: "forage",
    habitat: "mirefen",
    training: "none",
    bond: 8,
    role: "runner" as Role,
    stance: "measure",
    equipment: [],
    achieved,
    marks: {},
    revealed: [],
    phaseKnown: false,
    acquiredOnDay: day,
    origin: "wild",
  };
}
