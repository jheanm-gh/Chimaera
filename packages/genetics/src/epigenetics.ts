/**
 * The Lamarckian layer (§1.6).
 *
 * A well-raised creature passes a small, decaying head start to its offspring.
 * The point is to make raising *matter* without ever letting it replace
 * breeding, so the numbers here are deliberately, almost insultingly small —
 * and `maxEpigeneticBonus` is asserted in the test suite to be a fraction of
 * the genetic spread for the same stat. Genes must always dominate outcome. If
 * a later balance pass makes epigenetics feel weak, that is the system working.
 */

import type { StatId } from "./types.js";

/** Per stat, in 0-1: the inherited fraction of the ceiling margin. */
export type EpigeneticMarks = Readonly<Record<StatId, number>>;

export interface EpigeneticConfig {
  /** Share of a parent's own achievement that becomes a heritable mark. */
  readonly heritableFraction: number;
  /** Per-generation survival of an existing mark when not re-earned. */
  readonly decay: number;
  /** Largest head start a mark can grant, as a fraction of the stat ceiling. */
  readonly maxBonusFraction: number;
}

export const DEFAULT_EPIGENETICS: EpigeneticConfig = {
  heritableFraction: 0.12,
  decay: 0.5,
  maxBonusFraction: 0.06,
};

export interface ParentEpigenetics {
  readonly marks: EpigeneticMarks;
  /**
   * How close this parent got to its own ceilings, per stat, in 0-1.
   * 0 means neglected, 1 means raised to the absolute limit of its genome.
   */
  readonly achievement: Readonly<Record<StatId, number>>;
}

/**
 * Marks an egg inherits. Existing parental marks decay; fresh achievement adds
 * a small new contribution. With `decay` at 0.5 an unmaintained line is back to
 * noise inside three generations.
 */
export function deriveOffspringMarks(
  sire: ParentEpigenetics,
  dam: ParentEpigenetics,
  stats: readonly StatId[],
  config: EpigeneticConfig = DEFAULT_EPIGENETICS,
): EpigeneticMarks {
  const out: Record<StatId, number> = {};
  for (const stat of stats) {
    const inherited =
      config.decay * (((sire.marks[stat] ?? 0) + (dam.marks[stat] ?? 0)) / 2);
    const earned =
      config.heritableFraction *
      (((sire.achievement[stat] ?? 0) + (dam.achievement[stat] ?? 0)) / 2);
    out[stat] = clamp01(inherited + earned);
  }
  return out;
}

/**
 * The stat a creature actually fights with: what it achieved through raising,
 * plus its inherited head start, never above the ceiling its genes set.
 */
export function effectiveStat(
  ceiling: number,
  achieved: number,
  mark: number,
  config: EpigeneticConfig = DEFAULT_EPIGENETICS,
): number {
  const bonus = clamp01(mark) * config.maxBonusFraction * ceiling;
  return Math.min(ceiling, achieved + bonus);
}

/** The most epigenetics can ever be worth on a given ceiling. Used by the guard test. */
export function maxEpigeneticBonus(
  ceiling: number,
  config: EpigeneticConfig = DEFAULT_EPIGENETICS,
): number {
  return ceiling * config.maxBonusFraction;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
