/**
 * Epigenetics and the "genes must always dominate" guard (§1.6).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EPIGENETICS,
  deriveOffspringMarks,
  effectiveStat,
  maxEpigeneticBonus,
} from "../src/epigenetics.js";
import { map } from "./helpers.js";

const STATS = ["speed", "vigour", "focus"];

const NEGLECTED = { marks: {}, achievement: { speed: 0, vigour: 0, focus: 0 } };
const PERFECT = { marks: {}, achievement: { speed: 1, vigour: 1, focus: 1 } };

describe("epigenetic inheritance", () => {
  it("passes a small fraction of parental achievement to the next generation", () => {
    const marks = deriveOffspringMarks(PERFECT, PERFECT, STATS);
    expect(marks.speed).toBeCloseTo(DEFAULT_EPIGENETICS.heritableFraction, 12);
    expect(marks.speed).toBeLessThan(0.15);
  });

  it("passes nothing from neglected parents", () => {
    expect(deriveOffspringMarks(NEGLECTED, NEGLECTED, STATS).speed).toBe(0);
  });

  it("averages the two parents", () => {
    const marks = deriveOffspringMarks(PERFECT, NEGLECTED, STATS);
    expect(marks.speed).toBeCloseTo(DEFAULT_EPIGENETICS.heritableFraction / 2, 12);
  });

  it("decays to noise within three unmaintained generations", () => {
    let parent = { marks: deriveOffspringMarks(PERFECT, PERFECT, STATS), achievement: NEGLECTED.achievement };
    const start = parent.marks.speed as number;
    for (let generation = 0; generation < 3; generation++) {
      parent = { marks: deriveOffspringMarks(parent, parent, STATS), achievement: NEGLECTED.achievement };
    }
    expect(parent.marks.speed as number).toBeLessThan(start * 0.15);
  });

  it("reaches a bounded plateau when a line is maintained perfectly forever", () => {
    // Fixed point of m' = decay*m + heritable*1 is heritable / (1 - decay).
    let marks = deriveOffspringMarks(PERFECT, PERFECT, STATS);
    for (let generation = 0; generation < 40; generation++) {
      marks = deriveOffspringMarks({ marks, achievement: PERFECT.achievement }, { marks, achievement: PERFECT.achievement }, STATS);
    }
    const plateau = DEFAULT_EPIGENETICS.heritableFraction / (1 - DEFAULT_EPIGENETICS.decay);
    expect(marks.speed as number).toBeCloseTo(plateau, 9);
    expect(marks.speed as number).toBeLessThanOrEqual(1);
  });
});

describe("effective stats", () => {
  it("gives a head start toward the ceiling but never past it", () => {
    expect(effectiveStat(100, 80, 1)).toBeCloseTo(80 + 100 * DEFAULT_EPIGENETICS.maxBonusFraction, 12);
    expect(effectiveStat(100, 100, 1)).toBe(100);
    expect(effectiveStat(100, 98, 1)).toBe(100);
  });

  it("is worth nothing without a mark", () => {
    expect(effectiveStat(100, 70, 0)).toBe(70);
  });
});

describe("genes dominate outcome", () => {
  /**
   * The load-bearing guard. A maxed epigenetic line must never be worth as much
   * as a single better allele, at any point in any stat's range. If a balance
   * pass ever breaks this, breeding stops being the game.
   */
  it("keeps the maximum epigenetic bonus below one allele step for every stat", () => {
    for (const trait of map.polygenicTraits) {
      const alleleStep = (trait.max - trait.min) / (trait.rawMax - trait.rawMin);
      const bonusAtCeiling = maxEpigeneticBonus(trait.max);

      expect(bonusAtCeiling).toBeLessThan(alleleStep);
      expect(bonusAtCeiling / alleleStep).toBeLessThan(0.9);
    }
  });

  it("lets a better genotype raised poorly beat a worse genotype raised perfectly", () => {
    const trait = map.polygenicTrait("speed");
    const alleleStep = (trait.max - trait.min) / (trait.rawMax - trait.rawMin);
    const worseCeiling = 60;
    const betterCeiling = worseCeiling + alleleStep;

    // Worse genome: raised to its absolute limit, with a perfectly maintained
    // epigenetic line behind it.
    const worse = effectiveStat(worseCeiling, worseCeiling, 1);
    // Better genome: raised to only 95% of its ceiling, no inherited marks.
    const better = effectiveStat(betterCeiling, betterCeiling * 0.95, 0);

    expect(better).toBeGreaterThan(worse);
  });

  it("bounds the whole epigenetic axis well under the genetic range", () => {
    for (const trait of map.polygenicTraits) {
      const geneticRange = trait.max - trait.min;
      expect(maxEpigeneticBonus(trait.max) / geneticRange).toBeLessThan(0.1);
    }
  });
});
