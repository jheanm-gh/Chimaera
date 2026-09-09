/**
 * The adaptive score (§7).
 *
 * "The ranch theme adds instrument layers as your ranch grows and as species
 * diversity increases — the player literally hears their collection."
 *
 * Layers rather than tracks. Every layer plays the same slow harmonic cycle;
 * what changes is which of them are audible and how loud. That means the music
 * never restarts, never crossfades between arrangements, and never announces
 * that something has changed — it simply is thicker than it was an hour ago,
 * which is the only way this effect works.
 *
 * The thresholds are deliberately far apart. A layer that arrives every time
 * the herd grows by one is a slot machine; a layer that arrives after a real
 * afternoon of work is a reward.
 *
 * Everything here is data. Nothing in this package makes a sound.
 */

export type LayerId =
  | "drone"
  | "pulse"
  | "reeds"
  | "strings"
  | "bells"
  | "voices"
  | "low-brass"
  | "glass";

export interface LayerDef {
  readonly id: LayerId;
  readonly name: string;
  /** Which harmonic of the root this layer sings, and in which octave. */
  readonly degree: number;
  readonly octave: number;
  readonly waveform: "sine" | "triangle" | "sawtooth" | "square";
  readonly attack: number;
  readonly release: number;
  /** Full-volume gain once the layer is in. */
  readonly gain: number;
  readonly reason: string;
}

export const LAYERS: readonly LayerDef[] = [
  {
    id: "drone",
    name: "Fen drone",
    degree: 0,
    octave: -2,
    waveform: "sine",
    attack: 6,
    release: 8,
    gain: 0.5,
    reason: "Always. It is the room.",
  },
  {
    id: "pulse",
    name: "Reed pulse",
    degree: 0,
    octave: -1,
    waveform: "triangle",
    attack: 4,
    release: 6,
    gain: 0.3,
    reason: "A herd worth calling a herd.",
  },
  {
    id: "reeds",
    name: "Reeds",
    degree: 4,
    octave: 0,
    waveform: "triangle",
    attack: 5,
    release: 7,
    gain: 0.26,
    reason: "A second species in the pens.",
  },
  {
    id: "strings",
    name: "Bowed strings",
    degree: 2,
    octave: 0,
    waveform: "sawtooth",
    attack: 8,
    release: 10,
    gain: 0.15,
    reason: "A line deep enough to have a history.",
  },
  {
    id: "bells",
    name: "Bells",
    degree: 7,
    octave: 1,
    waveform: "sine",
    attack: 3,
    release: 9,
    gain: 0.13,
    reason: "Something nobody has recorded before.",
  },
  {
    id: "voices",
    name: "Voices",
    degree: 9,
    octave: 1,
    waveform: "sine",
    attack: 9,
    release: 12,
    gain: 0.11,
    reason: "Four species, and the fen starts to sound populated.",
  },
  {
    id: "low-brass",
    name: "Low brass",
    degree: 0,
    octave: -3,
    waveform: "sawtooth",
    attack: 10,
    release: 14,
    gain: 0.17,
    reason: "Commissions delivered. The station has weight.",
  },
  {
    id: "glass",
    name: "Glass",
    degree: 11,
    octave: 2,
    waveform: "sine",
    attack: 12,
    release: 16,
    gain: 0.08,
    reason: "The whole survey. Very few players will hear this.",
  },
];

/** What the score is allowed to know about a ranch. Nothing else. */
export interface ScoreInput {
  readonly herd: number;
  readonly species: number;
  readonly generations: number;
  readonly chaptersDone: number;
  readonly novelAlleles: number;
  readonly completion: number;
}

export interface ActiveLayer {
  readonly id: LayerId;
  readonly gain: number;
}

/**
 * Which layers are in, and how far.
 *
 * A layer fades in across a band rather than switching on, so growth is heard
 * as a swell rather than as an event. `at` is where the ranch currently sits
 * and `full` is where the layer reaches its own gain.
 */
export function layersFor(input: ScoreInput): ActiveLayer[] {
  const ramp = (at: number, start: number, full: number): number => {
    if (at <= start) return 0;
    if (at >= full) return 1;
    return (at - start) / (full - start);
  };

  const strength: Record<LayerId, number> = {
    drone: 1,
    pulse: ramp(input.herd, 3, 10),
    reeds: ramp(input.species, 1, 2),
    strings: ramp(input.generations, 2, 6),
    bells: ramp(input.novelAlleles, 0, 1),
    voices: ramp(input.species, 3, 5),
    "low-brass": ramp(input.chaptersDone, 2, 6),
    glass: ramp(input.completion, 0.6, 1),
  };

  return LAYERS.filter((layer) => strength[layer.id] > 0.001).map((layer) => ({
    id: layer.id,
    gain: layer.gain * strength[layer.id],
  }));
}

/**
 * The chord cycle, as scale degrees over a slow loop.
 *
 * Four chords, sixteen seconds each: long enough that a player working through
 * a pairing never hears it turn over twice on the same decision.
 */
export const CHORD_SECONDS = 16;
export const ROOT_HZ = 55; // A1

export const PROGRESSION: readonly (readonly number[])[] = [
  [0, 3, 7, 10],
  [0, 3, 7, 14],
  [-2, 2, 5, 9],
  [0, 4, 7, 11],
];

export function chordAt(seconds: number): readonly number[] {
  const index = Math.floor(Math.max(0, seconds) / CHORD_SECONDS) % PROGRESSION.length;
  return PROGRESSION[index] as readonly number[];
}

/** Equal temperament from the root. */
export function hzFor(degree: number, octave: number): number {
  return ROOT_HZ * 2 ** (octave + degree / 12);
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

/**
 * "Battle music tempo scales with battle state."
 *
 * Driven by how much of the field is still standing rather than by who is
 * winning: a fight that is nearly over is urgent whoever is about to lose it,
 * and tying tempo to *your* side would tell the player the result early.
 */
export function battleTempo(input: { readonly totalHp: number; readonly startingHp: number }): number {
  const remaining = input.startingHp <= 0 ? 1 : Math.max(0, Math.min(1, input.totalHp / input.startingHp));
  return Math.round(96 + (1 - remaining) * 68);
}

// ---------------------------------------------------------------------------
// Stingers
// ---------------------------------------------------------------------------

export type StingerId = "hatch" | "mutation" | "novel" | "death" | "chapter" | "ribbon" | "lethal";

export interface StingerNote {
  readonly degree: number;
  readonly octave: number;
  readonly at: number;
  readonly length: number;
  readonly gain: number;
}

export interface Stinger {
  readonly id: StingerId;
  readonly waveform: "sine" | "triangle";
  readonly notes: readonly StingerNote[];
  readonly reverb: number;
}

/**
 * The authored stingers.
 *
 * §7 says "the mutation stinger is the sound players will chase", so the novel
 * one is the only rising figure in the set and the only one that reaches two
 * octaves above the root. Everything else resolves downward or sideways, which
 * is what makes it stand out without being louder.
 */
export const STINGERS: readonly Stinger[] = [
  {
    id: "hatch",
    waveform: "sine",
    reverb: 0.3,
    notes: [
      { degree: 7, octave: 2, at: 0, length: 0.18, gain: 0.5 },
      { degree: 12, octave: 2, at: 0.1, length: 0.3, gain: 0.42 },
    ],
  },
  {
    id: "mutation",
    waveform: "triangle",
    reverb: 0.45,
    notes: [
      { degree: 3, octave: 2, at: 0, length: 0.16, gain: 0.4 },
      { degree: 6, octave: 2, at: 0.09, length: 0.16, gain: 0.4 },
      { degree: 10, octave: 2, at: 0.18, length: 0.4, gain: 0.44 },
    ],
  },
  {
    id: "novel",
    waveform: "sine",
    reverb: 0.7,
    notes: [
      { degree: 0, octave: 2, at: 0, length: 0.2, gain: 0.42 },
      { degree: 7, octave: 2, at: 0.12, length: 0.2, gain: 0.46 },
      { degree: 12, octave: 2, at: 0.24, length: 0.24, gain: 0.5 },
      { degree: 16, octave: 2, at: 0.36, length: 0.28, gain: 0.5 },
      { degree: 19, octave: 3, at: 0.48, length: 0.9, gain: 0.56 },
    ],
  },
  {
    id: "death",
    waveform: "sine",
    reverb: 0.6,
    notes: [
      { degree: 3, octave: 0, at: 0, length: 0.9, gain: 0.36 },
      { degree: -2, octave: 0, at: 0.35, length: 1.2, gain: 0.3 },
    ],
  },
  {
    id: "lethal",
    waveform: "triangle",
    reverb: 0.5,
    notes: [
      { degree: 1, octave: 1, at: 0, length: 0.5, gain: 0.34 },
      { degree: 0, octave: 1, at: 0.22, length: 0.8, gain: 0.3 },
    ],
  },
  {
    id: "chapter",
    waveform: "sine",
    reverb: 0.4,
    notes: [
      { degree: 0, octave: 1, at: 0, length: 0.3, gain: 0.4 },
      { degree: 4, octave: 1, at: 0.14, length: 0.3, gain: 0.4 },
      { degree: 7, octave: 1, at: 0.28, length: 0.6, gain: 0.44 },
      { degree: 12, octave: 1, at: 0.42, length: 0.9, gain: 0.4 },
    ],
  },
  {
    id: "ribbon",
    waveform: "sine",
    reverb: 0.35,
    notes: [
      { degree: 7, octave: 1, at: 0, length: 0.2, gain: 0.36 },
      { degree: 12, octave: 1, at: 0.1, length: 0.5, gain: 0.4 },
    ],
  },
];

const STINGERS_BY_ID = new Map(STINGERS.map((stinger) => [stinger.id, stinger]));

export function stingerById(id: StingerId): Stinger {
  const found = STINGERS_BY_ID.get(id);
  if (!found) throw new Error(`unknown stinger "${id}"`);
  return found;
}
