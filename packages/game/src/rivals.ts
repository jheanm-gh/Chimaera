/**
 * Rival Ranch (§4): async PvP against ghosts.
 *
 * "No live netcode, no matchmaking server needed at v1 — ghost data only." A
 * ghost is a team snapshot: three genome codes plus the loadout and the
 * condition each animal was in. Everything needed to fight it is in the
 * snapshot, so a fight is a pure function of two snapshots and a seed, and the
 * same fight resolves identically on both machines without either one talking
 * to the other.
 *
 * Ghosts come from two places. A player exports theirs as text. And the game
 * generates its own, from named stations with seeded stock, so the mode is
 * populated on day one rather than on the day the game has players.
 */

import { createRng, expressPhenotype, geneMapById, randomWildGenome, rngFromState } from "@chimaera/genetics";
import type { Rng, SpeciesId, StatId } from "@chimaera/genetics";
import { mapOf } from "./bestiary.js";
import type { CombatantSpec, Role, Stance } from "./combat.js";
import { simulateBattle } from "./combat.js";
import { decodeGenome, encodeGenome } from "./codes.js";
import { currentStats } from "./lifecycle.js";
import type { Creature } from "./types.js";

export const GHOST_VERSION = 1;

export interface GhostMember {
  readonly name: string;
  readonly code: string;
  readonly role: Role;
  readonly stance: Stance;
  readonly equipment: readonly string[];
  /** Achieved-over-ceiling per stat, 0-1. Husbandry travels with the ghost. */
  readonly condition: Readonly<Record<StatId, number>>;
}

export interface Ghost {
  readonly version: number;
  readonly id: string;
  readonly station: string;
  readonly species: SpeciesId;
  readonly team: readonly GhostMember[];
}

// ---------------------------------------------------------------------------
// Making one
// ---------------------------------------------------------------------------

export function snapshotTeam(
  station: string,
  team: readonly Creature[],
  phenotypeOf: (creature: Creature) => ReturnType<typeof expressPhenotype>,
): Ghost {
  if (team.length === 0) throw new Error("A ghost needs at least one creature.");
  const first = team[0] as Creature;
  return {
    version: GHOST_VERSION,
    id: `${station}-${team.map((c) => c.id).join("-")}`,
    station,
    species: first.species,
    team: team.map((creature) => {
      const map = mapOf(creature);
      const phenotype = phenotypeOf(creature);
      const condition: Record<StatId, number> = {};
      for (const trait of map.polygenicTraits) {
        const ceiling = phenotype.stats[trait.id] ?? trait.max;
        const floor = trait.min;
        const achieved = creature.achieved[trait.id] ?? floor;
        condition[trait.id] = ceiling <= floor ? 0 : clamp01((achieved - floor) / (ceiling - floor));
      }
      return {
        name: creature.name,
        code: encodeGenome(creature.genome),
        role: creature.role,
        stance: creature.stance,
        equipment: [...creature.equipment],
        condition,
      };
    }),
  };
}

/**
 * A ghost member as a combatant.
 *
 * The genome sets the ceilings and the snapshot's condition says how much of
 * them the other player actually reached — so a ghost is beatable by breeding
 * better *or* by raising better, exactly as a live opponent would be.
 */
export function ghostCombatant(member: GhostMember, index: number): CombatantSpec {
  const { genome } = decodeGenome(member.code);
  const map = geneMapById(genome.species);
  const phenotype = expressPhenotype(genome, map);
  const stats: Record<StatId, number> = {};
  for (const trait of map.polygenicTraits) {
    const ceiling = phenotype.stats[trait.id] ?? trait.max;
    stats[trait.id] = trait.min + (ceiling - trait.min) * clamp01(member.condition[trait.id] ?? 0.5);
  }
  return {
    id: `ghost-${index}`,
    name: member.name,
    affinities: (phenotype.traits.affinity ?? "").split("+").filter(Boolean),
    role: member.role,
    stance: member.stance,
    stats,
    equipment: member.equipment,
  };
}

// ---------------------------------------------------------------------------
// The house ghosts
// ---------------------------------------------------------------------------

const STATIONS = [
  "Hallow Reach",
  "Ninefold Station",
  "Blackwater Post",
  "Tussock Hall",
  "Sedgeline",
  "Chalkbourne",
  "Under-Fen",
  "Ashmoor Station",
] as const;

const ROLES: readonly Role[] = ["vanguard", "runner", "reader"];
const STANCES: readonly Stance[] = ["press", "hold", "measure"];

/**
 * Generated opposition, so the mode is populated before the game has players.
 *
 * `strength` is the fraction of its ceilings the station's stock reaches, and
 * `selection` is how many draws it kept the best of — a strong station is one
 * that bred for it, not one whose numbers were multiplied.
 */
export function houseGhost(
  index: number,
  species: SpeciesId,
  options: { readonly strength?: number; readonly selection?: number; readonly seed?: string } = {},
): Ghost {
  const strength = options.strength ?? 0.6;
  const selection = options.selection ?? 3;
  const station = STATIONS[index % STATIONS.length] as string;
  const rng = createRng(options.seed ?? `ghost:${station}:${species}:${strength}`);
  const map = geneMapById(species);

  const team: GhostMember[] = [];
  for (let slot = 0; slot < 3; slot++) {
    let best = randomWildGenome(map, rng);
    let bestPower = -1;
    for (let attempt = 0; attempt < selection; attempt++) {
      const genome = randomWildGenome(map, rng);
      const phenotype = expressPhenotype(genome, map);
      const power = map.polygenicTraits.reduce((sum, trait) => sum + (phenotype.stats[trait.id] ?? 0), 0);
      if (power > bestPower) {
        bestPower = power;
        best = genome;
      }
    }
    const condition: Record<StatId, number> = {};
    for (const trait of map.polygenicTraits) {
      condition[trait.id] = clamp01(strength + (rng.next() - 0.5) * 0.16);
    }
    team.push({
      name: `${station} ${slot + 1}`,
      code: encodeGenome(best),
      role: ROLES[slot % ROLES.length] as Role,
      stance: STANCES[(slot + index) % STANCES.length] as Stance,
      equipment: [],
      condition,
    });
  }

  return { version: GHOST_VERSION, id: `house-${species}-${index}`, station, species, team };
}

// ---------------------------------------------------------------------------
// The fight
// ---------------------------------------------------------------------------

export interface GhostFight {
  readonly won: boolean;
  readonly rounds: number;
  readonly summary: string;
}

/**
 * Fights a ghost. Nothing is at stake but the record.
 *
 * §4 is explicit that this is ghost data, and a ghost cannot be hurt: no
 * permadeath, no condition carried out of the fight, and the same snapshot
 * fights identically every time it is challenged. Rival Ranch is a measuring
 * instrument, not a place to lose an animal.
 */
export function fightGhost(
  ghost: Ghost,
  team: readonly Creature[],
  phenotypeOf: (creature: Creature) => ReturnType<typeof expressPhenotype>,
  rng: Rng,
): GhostFight {
  const mine: CombatantSpec[] = team.map((creature) => {
    const map = mapOf(creature);
    return {
      id: creature.id,
      name: creature.name,
      affinities: (phenotypeOf(creature).traits.affinity ?? "").split("+").filter(Boolean),
      role: creature.role,
      stance: creature.stance,
      stats: currentStats(creature, phenotypeOf(creature), map),
      equipment: creature.equipment,
    };
  });
  const theirs = ghost.team.map((member, index) => ghostCombatant(member, index));
  const result = simulateBattle(mine, theirs, rng, { quiet: true });
  const won = result.winner === 0;
  return {
    won,
    rounds: result.rounds,
    summary: won
      ? `Beat ${ghost.station} in ${result.rounds} rounds.`
      : `${ghost.station} held. ${result.rounds} rounds.`,
  };
}

/** A fresh, reproducible stream for one challenge. */
export function ghostRng(state: { rng: Parameters<typeof rngFromState>[0]; rngCursor: number }, ghostId: string): Rng {
  return rngFromState(state.rng).fork(`ghost:${ghostId}:${state.rngCursor}`);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
