/**
 * Life stages, ageing, and raising (§2.1, §2.2).
 *
 * Time is measured in days and advanced by player actions. There is no clock in
 * this file, no `Date`, and no timer — the design is explicit that the game
 * must not farm push notifications, and the easiest way to keep that promise is
 * to make real time structurally unavailable.
 *
 * Growth is asymptotic toward the genetic ceiling: `achieved` closes on
 * `ceiling` by a daily fraction set by the four raising axes. It follows that
 * raising can never exceed genes, only approach them — which is the design law
 * expressed as an equation rather than as a clamp bolted on afterwards.
 */

import type { GeneMap, Phenotype, StatId } from "@chimaera/genetics";
import { effectiveStat } from "@chimaera/genetics";
import { DIETS_BY_ID, HABITATS_BY_ID, TRAINING_BY_ID, habitatFactor } from "./content.js";
import type { Creature, LifeStage } from "./types.js";

/** Day at which each stage begins. Elder runs to the end of the lifespan. */
export const STAGE_START: Readonly<Record<LifeStage, number>> = {
  egg: 0,
  hatchling: 6,
  juvenile: 22,
  adult: 55,
  elder: 170,
};

export const INCUBATION_DAYS = STAGE_START.hatchling;

export function stageForAge(ageDays: number): LifeStage {
  if (ageDays < STAGE_START.hatchling) return "egg";
  if (ageDays < STAGE_START.juvenile) return "hatchling";
  if (ageDays < STAGE_START.adult) return "juvenile";
  if (ageDays < STAGE_START.elder) return "adult";
  return "elder";
}

/** Fertility opens in Adult and closes in Elder (§2.1). Creatures age out. */
export function isFertile(creature: Creature): boolean {
  return creature.status === "active" && creature.stage === "adult";
}

const LIFESPAN_BASE = 200;
const LIFESPAN_FROM_VIGOUR = 80;
const LIFESPAN_INBREEDING_COST = 70;

/**
 * Lifespan, fixed at hatching from the genome and the pedigree, then spent down
 * by training and mutagens over the creature's life.
 */
export function lifespanFor(phenotype: Phenotype, map: GeneMap, inbreeding: number): number {
  const trait = map.polygenicTrait("vigour");
  const vigour = phenotype.stats.vigour ?? trait.min;
  const normalised = (vigour - trait.min) / (trait.max - trait.min);
  return Math.round(
    LIFESPAN_BASE + normalised * LIFESPAN_FROM_VIGOUR - Math.min(1, Math.max(0, inbreeding)) * LIFESPAN_INBREEDING_COST,
  );
}

/**
 * How fast a stat closes on its ceiling, per day. A hatchling grows quickly; an
 * elder barely at all, which is what makes the fertility window feel like a
 * window rather than a suggestion.
 */
const STAGE_GROWTH: Readonly<Record<LifeStage, number>> = {
  egg: 0,
  hatchling: 1.4,
  juvenile: 1,
  adult: 0.55,
  elder: 0.15,
};

const BASE_GROWTH_RATE = 0.018;

export interface DayOutcome {
  readonly creature: Creature;
  readonly stageChanged: boolean;
  readonly died: boolean;
}

/**
 * Advances one creature by one day: growth, bond, lifespan spend, and stage
 * transition. Evolution is decided by the caller, because a branch is a
 * narrative event and belongs with the events stream.
 */
export function tickCreature(creature: Creature, phenotype: Phenotype, map: GeneMap): DayOutcome {
  if (creature.status !== "active") return { creature, stageChanged: false, died: false };

  const diet = DIETS_BY_ID.get(creature.diet);
  const habitat = HABITATS_BY_ID.get(creature.habitat);
  const training = TRAINING_BY_ID.get(creature.training);
  if (!diet || !habitat || !training) throw new Error(`creature ${creature.id} has an unknown raising axis`);

  const affinities = (phenotype.traits.affinity ?? "").split("+").filter(Boolean);
  const match = habitatFactor(habitat, map.species.biome, affinities);
  const stage = creature.stage;
  const stageRate = STAGE_GROWTH[stage];

  // Training does nothing before juvenile: you cannot drill a hatchling.
  const trainingActive = stage !== "egg" && stage !== "hatchling";
  const achieved: Record<StatId, number> = { ...creature.achieved };

  for (const trait of map.polygenicTraits) {
    const ceiling = phenotype.stats[trait.id] ?? trait.min;
    const current = achieved[trait.id] ?? trait.min * 0.35;
    const rate =
      BASE_GROWTH_RATE *
      stageRate *
      match *
      (diet.growth[trait.id] ?? 1) *
      (habitat.growth[trait.id] ?? 1) *
      (trainingActive ? (training.growth[trait.id] ?? 1) : 1);
    achieved[trait.id] = Math.min(ceiling, current + (ceiling - current) * rate);
  }

  const bondDrift =
    diet.bondPerDay + (trainingActive ? training.bondPerDay : 0) + (match >= 1 ? 0.2 : -0.12);
  const bond = clamp(creature.bond + bondDrift, 0, 100);

  // Lifespan is spent, not merely counted: hard training and rich diets cost
  // days, fasting buys them back.
  const lifespanSpend = (trainingActive ? training.lifespanCostPerDay : 0) + (1 - diet.lifespan);
  const lifespanDays = Math.max(creature.ageDays + 1, creature.lifespanDays - lifespanSpend);

  const ageDays = creature.ageDays + 1;
  const nextStage = stageForAge(ageDays);
  const died = ageDays >= lifespanDays;

  return {
    creature: {
      ...creature,
      ageDays,
      stage: nextStage,
      lifespanDays,
      bond,
      achieved,
      status: died ? "dead" : creature.status,
    },
    stageChanged: nextStage !== stage,
    died,
  };
}

/** Achieved-over-ceiling per stat, 0-1. The input to evolution and to epigenetics. */
export function achievement(
  creature: Creature,
  phenotype: Phenotype,
  map: GeneMap,
): Record<StatId, number> {
  const out: Record<StatId, number> = {};
  for (const trait of map.polygenicTraits) {
    const ceiling = phenotype.stats[trait.id] ?? trait.min;
    const value = creature.achieved[trait.id] ?? 0;
    const floor = trait.min;
    out[trait.id] = ceiling <= floor ? 0 : clamp((value - floor) / (ceiling - floor), 0, 1);
  }
  return out;
}

/**
 * What the creature actually fights and shows with: raised value plus its
 * inherited epigenetic head start, never above the genetic ceiling.
 */
export function currentStats(
  creature: Creature,
  phenotype: Phenotype,
  map: GeneMap,
): Record<StatId, number> {
  const out: Record<StatId, number> = {};
  for (const trait of map.polygenicTraits) {
    const ceiling = phenotype.stats[trait.id] ?? trait.min;
    out[trait.id] = effectiveStat(ceiling, creature.achieved[trait.id] ?? 0, creature.marks[trait.id] ?? 0);
  }
  return out;
}

/** Starting achieved stats for a newly hatched creature: a fraction of ceiling. */
export function newbornStats(phenotype: Phenotype, map: GeneMap): Record<StatId, number> {
  const out: Record<StatId, number> = {};
  for (const trait of map.polygenicTraits) {
    const ceiling = phenotype.stats[trait.id] ?? trait.min;
    out[trait.id] = trait.min + (ceiling - trait.min) * 0.08;
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
