/**
 * Genome-driven vocalisations (§7).
 *
 * "Synthesise each creature's call procedurally: pitch from the size locus,
 * timbre from body-type locus, envelope from temperament. Every creature you
 * breed sounds like itself."
 *
 * This file produces the *specification* for a call — frequencies, harmonics,
 * an envelope, a contour — and never touches Web Audio. Two reasons, and the
 * second is the one that matters. The obvious one is that a pure function is
 * testable headlessly. The real one is that a voice is a phenotype: it has to
 * be reproducible from the same animal forever, comparable between two animals,
 * and inheritable in the sense that a well-bred line *sounds* like a line. None
 * of that survives being tangled up with an audio context.
 *
 * The mapping is deliberately over-driven rather than tasteful. A pitch range
 * of two octaves across a species' vigour range sounds exaggerated in isolation
 * and is exactly right in play, because the player only ever hears one call at
 * a time and has to be able to tell two siblings apart by ear.
 *
 * Like the renderer, this reads a `Phenotype` and never a genome (§1.3). A call
 * that gave away a heterozygote would be a free lens.
 */

import type { GeneMap, Phenotype } from "@chimaera/genetics";
import { createRng } from "@chimaera/genetics";

export interface Partial_ {
  /** Multiple of the fundamental. Non-integer ratios buy inharmonic timbres. */
  readonly ratio: number;
  readonly gain: number;
}

export interface Envelope {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
}

export interface VoiceSpec {
  /** Hz. Low for heavy animals, high for slight ones. */
  readonly fundamental: number;
  readonly partials: readonly Partial_[];
  readonly envelope: Envelope;
  /** Total length in seconds, envelope included. */
  readonly duration: number;
  /** Pitch contour across the call, as multipliers of the fundamental. */
  readonly contour: readonly number[];
  readonly vibrato: { readonly rate: number; readonly depth: number };
  /** Breath: 0 is a pure tone, 1 is mostly noise. */
  readonly noise: number;
  /** Low-pass corner in Hz. Dull animals are dull. */
  readonly brightness: number;
  /** How many times the call repeats, and the gap between repeats. */
  readonly repeats: number;
  readonly gap: number;
}

const A0 = 27.5;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function normalise(phenotype: Phenotype, map: GeneMap, statId: string): number {
  const trait = map.polygenicTraits.find((entry) => entry.id === statId);
  const value = phenotype.stats[statId];
  if (!trait || value === undefined) return 0.5;
  return clamp01((value - trait.min) / (trait.max - trait.min));
}

/** The species' own build trait, 0-1, wherever it happens to be called. */
function buildOf(phenotype: Phenotype, map: GeneMap): number {
  const locus = map.locus(map.species.palette.lightnessLocus);
  const trait = locus.trait;
  return clamp01((trait === undefined ? undefined : phenotype.values[trait]) ?? 0.5);
}

export function voiceFor(phenotype: Phenotype, map: GeneMap): VoiceSpec {
  // Size drives pitch, inversely and steeply: a big animal is two octaves below
  // a small one of the same species. Vigour is the size stat everywhere.
  const size = normalise(phenotype, map, "vigour");
  const build = buildOf(phenotype, map);
  const focus = normalise(phenotype, map, "focus");
  const speed = normalise(phenotype, map, "speed");

  // A2 up to A5 across the whole range, weighted by both mass measures.
  const mass = clamp01(size * 0.65 + build * 0.35);
  const fundamental = A0 * 2 ** (5.2 - mass * 2.6);

  // Timbre from body type. A heavy, blunt animal gets strong low harmonics and
  // an inharmonic third partial; a slight one gets a thin, bright spectrum.
  const partials: Partial_[] = [
    { ratio: 1, gain: 1 },
    { ratio: 2, gain: 0.34 + build * 0.4 },
    { ratio: 2.76 + build * 0.5, gain: 0.1 + build * 0.28 },
    { ratio: 4, gain: 0.16 * (1 - build) + 0.05 },
    { ratio: 5.4, gain: 0.1 * (1 - build) },
  ];

  // Temperament: a focused animal holds a long, steady note; a restless one
  // barks. Speed shortens everything and adds repeats.
  const attack = 0.006 + (1 - speed) * 0.09 + focus * 0.05;
  const sustainLevel = 0.35 + focus * 0.45;
  const duration = 0.28 + focus * 0.7 - speed * 0.12;
  const envelope: Envelope = {
    attack,
    decay: 0.05 + (1 - focus) * 0.12,
    sustain: sustainLevel,
    release: 0.08 + focus * 0.4,
  };

  // A contour, not a flat tone: falling for heavy animals, rising for quick
  // ones. This is most of what makes two calls sound like different creatures.
  const fall = 1 - mass * 0.22;
  const rise = 1 + speed * 0.18;
  const contour = [1, rise, (rise + fall) / 2, fall, fall * (1 - (1 - focus) * 0.1)];

  // Everything below is decoration, and decoration must still be *this*
  // animal's. Seeded from the phenotype so a creature's freckles and its voice
  // come from the same place.
  const rng = createRng(voiceFingerprint(phenotype));

  return {
    fundamental,
    partials,
    envelope,
    duration: Math.max(0.18, duration),
    contour,
    vibrato: {
      rate: 3.6 + speed * 7 + rng.next() * 1.4,
      depth: 0.004 + (1 - focus) * 0.02,
    },
    // Breathier the bigger the animal, and breathier still if its coat work is
    // switched off — an animal with a gate closed sounds hollow, which is a
    // free extra channel for the same information the picture already carries.
    noise: clamp01(0.06 + mass * 0.16 + (phenotype.epistasisActive.length > 0 ? 0.14 : 0)),
    brightness: 900 + (1 - mass) * 5200 + focus * 1400,
    repeats: speed > 0.72 ? 3 : speed > 0.45 ? 2 : 1,
    gap: 0.16 - speed * 0.07,
  };
}

/**
 * Same animal, same voice, forever.
 *
 * Deliberately the *observable* phenotype and nothing else, so two creatures a
 * player cannot tell apart by looking also cannot be told apart by ear.
 */
export function voiceFingerprint(phenotype: Phenotype): string {
  return JSON.stringify([
    phenotype.species,
    phenotype.sex,
    Object.entries(phenotype.traits).sort(),
    Object.entries(phenotype.stats)
      .sort()
      .map(([id, value]: [string, number]) => [id, Math.round(value * 100)]),
    phenotype.epistasisActive,
  ]);
}

/**
 * How different two voices are, 0-1.
 *
 * Used by a test to prove the mapping is actually audible: if two animals at
 * opposite ends of a species' range produce near-identical specs, the voice
 * system is decoration rather than a channel.
 */
export function voiceDistance(a: VoiceSpec, b: VoiceSpec): number {
  const octaves = Math.abs(Math.log2(a.fundamental / b.fundamental)) / 3;
  const envelope =
    (Math.abs(a.envelope.attack - b.envelope.attack) / 0.15 +
      Math.abs(a.envelope.sustain - b.envelope.sustain) +
      Math.abs(a.envelope.release - b.envelope.release) / 0.5) /
    3;
  const timbre =
    a.partials.reduce((sum, partial, index) => sum + Math.abs(partial.gain - (b.partials[index]?.gain ?? 0)), 0) /
    a.partials.length;
  const colour = Math.abs(a.brightness - b.brightness) / 6000;
  return clamp01((octaves + envelope + timbre + colour) / 4);
}
