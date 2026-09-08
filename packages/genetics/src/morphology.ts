/**
 * The animal, measured.
 *
 * A creature's fighting ability used to be three abstract numbers — speed,
 * vigour, focus — that the player could read but never *see*. You bred for
 * "+2 focus" and nothing about the animal in front of you changed. That is the
 * wrong shape for a game whose whole subject is heritable form.
 *
 * So combat reads measurements instead. Mass in kilograms. Tusks in
 * centimetres. Hide in millimetres, and what kind of hide it is. Every number
 * here is something the sprite draws and the player can point at, which means
 * the picture and the stat block are finally the same object.
 *
 * This lives in the genetics package rather than in the game because it is
 * phenotype interpretation, not a combat rule — and because both the renderer
 * and the combat resolver have to agree about how long a tail is. Two readings
 * of one animal is a creature whose picture disagrees with what it can do.
 */

import type { GeneMap } from "./genemap.js";
import type { Phenotype, SpeciesId } from "./types.js";

// ---------------------------------------------------------------------------
// What gets measured
// ---------------------------------------------------------------------------

export type HideKind = "naked" | "slimed" | "furred" | "scaled" | "plated";
export type ArmamentKind = "none" | "spines" | "tusks" | "horn" | "beak";
export type TailKind = "none" | "stub" | "fan" | "whip" | "forked";

export interface Morphology {
  /** Body mass, kilograms. Impact, and resistance to being moved. */
  readonly mass: number;
  /** Nose to tail tip, centimetres. Reach, and what a limbless animal has instead of limbs. */
  readonly length: number;
  /** Shoulder height standing, centimetres. Leverage and vantage. */
  readonly stature: number;
  /** Legs on the ground. Zero for a serpent, two for a biped, four for a quadruped. */
  readonly limbs: number;
  /** Stride, centimetres. How fast it closes, and how well it gets out of the way. */
  readonly stride: number;
  /** Integument depth, millimetres, and what it is made of. */
  readonly hide: number;
  readonly hideKind: HideKind;
  /** Longest point on the animal, centimetres, and what kind of point. */
  readonly armament: number;
  readonly armamentKind: ArmamentKind;
  /** Tail length, centimetres, and its shape. */
  readonly tail: number;
  readonly tailKind: TailKind;
  /** Jaw gape, centimetres. What it can get its mouth around. */
  readonly gape: number;
  /** Sight and hearing together, 0-100. Landing a strike, and seeing one coming. */
  readonly acuity: number;
  /** Toxin strength, 0-100. Zero for almost every animal. */
  readonly venom: number;
  /** Gliding membrane span, centimetres. Zero unless the species has one. */
  readonly span: number;
  /** Display structure, centimetres. Crests, plumes, ruffs — what it threatens with. */
  readonly display: number;
}

export type MeasureId = "mass" | "length" | "stature" | "limbs" | "stride" | "hide" | "armament" | "tail" | "gape" | "acuity" | "venom" | "span" | "display";

/**
 * Reference dimensions for a full-grown wild animal of each species.
 *
 * The genome says how an individual differs from its species; this says what
 * the species is. Without it a Silt-Adder and a Bramblehog with identical
 * alleles would weigh the same, which is not how animals work.
 *
 * `mass` and `length` are the anchors — everything else is expressed as a
 * fraction of them, so changing a species' size moves its whole anatomy
 * together instead of leaving a tiny animal with enormous tusks.
 */
interface SpeciesFrame {
  /** Typical adult mass in kilograms, at middling build. */
  readonly mass: number;
  /** Typical adult length in centimetres, nose to tail root. */
  readonly length: number;
  /** Shoulder height as a fraction of length. */
  readonly stature: number;
  /** Legs, before any allele reduces them. */
  readonly limbs: number;
  /** Hide depth in millimetres at middling build, and the species' material. */
  readonly hide: number;
  readonly hideKind: HideKind;
  /** What the species points at things with, and its length as a fraction of stature. */
  readonly armamentKind: ArmamentKind;
  readonly armament: number;
  /** Jaw gape as a fraction of stature. */
  readonly gape: number;
  /** Whether the species has a gliding membrane, as a fraction of length. */
  readonly span: number;
  /**
   * The continuous value that drives this species' bulk.
   *
   * Every species has exactly one, and they are all named differently because
   * they mean different things: the Quillfen's `build`, the Silt-Adder's
   * `coils`, the Bramblehog's `spines`. Matching on a pattern silently missed
   * two of the six, which left those species at a constant mass — an animal you
   * could not breed larger.
   */
  readonly shape: string;
}

const FRAMES: Readonly<Record<SpeciesId, SpeciesFrame>> = {
  // Long, low, deep-bodied, and built around a fan of gills it can also stab with.
  quillfen: { mass: 34, length: 118, stature: 0.34, limbs: 4, hide: 5, hideKind: "scaled", armamentKind: "spines", armament: 0.42, gape: 0.3, span: 0, shape: "build" },
  // Light, upright, quick; a beak and almost nothing else.
  sallowfinch: { mass: 6, length: 46, stature: 0.82, limbs: 2, hide: 2, hideKind: "furred", armamentKind: "beak", armament: 0.24, gape: 0.26, span: 0, shape: "build" },
  // Heavy, armoured, and covered in the thing it fights with.
  bramblehog: { mass: 62, length: 104, stature: 0.4, limbs: 4, hide: 11, hideKind: "plated", armamentKind: "spines", armament: 0.55, gape: 0.28, span: 0, shape: "spines" },
  // Built to leave: a membrane, long legs, and no mass to speak of.
  kiteossel: { mass: 11, length: 88, stature: 0.52, limbs: 4, hide: 3, hideKind: "naked", armamentKind: "beak", armament: 0.2, gape: 0.24, span: 0.95, shape: "span" },
  // No limbs, all length, and the only species that brings venom as standard.
  siltadder: { mass: 9, length: 186, stature: 0.08, limbs: 0, hide: 4, hideKind: "slimed", armamentKind: "none", armament: 0, gape: 0.9, span: 0, shape: "coils" },
  // Long-limbed, thin-skinned, and reliant on reach and hands.
  ashenlorric: { mass: 28, length: 74, stature: 0.95, limbs: 2, hide: 3, hideKind: "naked", armamentKind: "none", armament: 0, gape: 0.22, span: 0, shape: "limbs" },
};

// ---------------------------------------------------------------------------
// Reading the animal
// ---------------------------------------------------------------------------

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A polygenic stat as a 0-1 position in its own range. */
function normalised(phenotype: Phenotype, map: GeneMap, id: string): number {
  const trait = map.polygenicTraits.find((t) => t.id === id);
  const value = phenotype.stats[id];
  if (!trait || value === undefined) return 0.5;
  return clamp01((value - trait.min) / Math.max(1e-6, trait.max - trait.min));
}

/** Any trait word for this creature, from whichever locus supplies it. */
function words(phenotype: Phenotype): string {
  return Object.values(phenotype.traits).join(" ").toLowerCase();
}

/**
 * Hide follows the coat, which is what the player already sees.
 *
 * A species has a default material, but an allele that visibly changes the
 * surface changes what the surface *is* — a plated animal that expresses a bare
 * coat is genuinely easier to bite.
 */
function hideKindOf(frame: SpeciesFrame, said: string): HideKind {
  if (/naked|bare|unpigmented|hairless/.test(said)) return "naked";
  if (/plate|armour|armor|shield|lapped/.test(said)) return "plated";
  if (/scale|scaled/.test(said)) return "scaled";
  if (/soft|down|fur|pelt|woolly/.test(said)) return "furred";
  if (/slick|slime|mucous/.test(said)) return "slimed";
  return frame.hideKind;
}

function armamentKindOf(frame: SpeciesFrame, said: string): ArmamentKind {
  // A suppressed crest is a suppressed weapon: the epistasis that hides a
  // ridge takes the spines with it, which is exactly the kind of consequence
  // the gate rules are for.
  if (/naked|absent|smooth|hidden|plain/.test(said) && frame.armamentKind === "spines") return "none";
  if (/tusk|fang/.test(said)) return "tusks";
  if (/horn|crown/.test(said)) return "horn";
  if (/quill|spine|barb/.test(said)) return "spines";
  if (/beak|bill|hook/.test(said)) return "beak";
  return frame.armamentKind;
}

function tailKindOf(said: string): TailKind {
  if (/forked/.test(said)) return "forked";
  if (/whip/.test(said)) return "whip";
  if (/fan/.test(said)) return "fan";
  if (/stub|short/.test(said)) return "stub";
  if (/plain|none|absent|smooth/.test(said)) return "none";
  return "none";
}

/**
 * Every measurement, from one phenotype.
 *
 * Deterministic and total: a creature always has a full set, because a combat
 * rule that has to ask "does this animal have a mass" is a combat rule with a
 * branch nobody will maintain.
 */
export function measure(phenotype: Phenotype, map: GeneMap): Morphology {
  const frame = frameFor(phenotype.species);
  const said = words(phenotype);

  // The species' own shape value, by name. It is the strongest lever on size,
  // and it is a real locus rather than anything derived.
  const bulk = clamp01(phenotype.values[frame.shape] ?? 0.5);

  // Two independent size axes so a heavy animal is not automatically a long
  // one: bulk drives mass, and the species' frame drives length.
  const massScale = lerp(0.6, 1.6, bulk);
  const vigour = normalised(phenotype, map, "vigour");
  const lengthScale = lerp(0.84, 1.18, vigour);

  const mass = Math.round(frame.mass * massScale * lerp(0.86, 1.16, vigour) * 10) / 10;
  const length = Math.round(frame.length * lengthScale);
  const stature = Math.round(length * frame.stature * lerp(0.9, 1.1, bulk));

  const limbKind = /stub|absent|none|reduced/.test(said) ? 0.5 : 1;
  const limbs = frame.limbs === 0 ? 0 : Math.round(frame.limbs * (limbKind < 1 && frame.limbs > 2 ? 1 : 1));

  const speed = normalised(phenotype, map, "speed");
  // A stub-limbed animal has the legs but not the stride.
  const strideKind = /stub/.test(said) ? 0.6 : /long|paddle/.test(said) ? 1.15 : 1;
  const stride = Math.round(stature * lerp(0.7, 1.5, speed) * strideKind);

  const hideKind = hideKindOf(frame, said);
  const hide = Math.round(frame.hide * lerp(0.7, 1.45, bulk) * (hideKind === "plated" ? 1.25 : hideKind === "naked" ? 0.55 : 1) * 10) / 10;

  const armamentKind = armamentKindOf(frame, said);
  // A species with no armament of its own can still grow one from an allele —
  // the Ashen Lorric's hooked grip is a beak by any useful definition. Without
  // a fallback proportion those animals got a weapon of length zero, which
  // unlocked the move and then did nothing with it.
  const armamentReach = frame.armament > 0 ? frame.armament : 0.22;
  const armament =
    armamentKind === "none"
      ? 0
      : Math.max(
          1,
          Math.round(stature * armamentReach * lerp(0.6, 1.4, bulk) * (/grand|bold|full|display/.test(said) ? 1.25 : 1)),
        );

  const tailKind = tailKindOf(said);
  const tailReach: Record<TailKind, number> = { none: 0, stub: 0.12, fan: 0.3, forked: 0.38, whip: 0.55 };
  const tail = Math.round(length * (tailReach[tailKind] ?? 0));

  const gape = Math.round(stature * frame.gape * lerp(0.85, 1.2, bulk) * 10) / 10;

  const focus = normalised(phenotype, map, "focus");
  const acuity = Math.round(lerp(18, 96, focus) * (/keen|deep|still/.test(said) ? 1.08 : 1));

  const venom = /venom|toxic|toxin|potent/.test(said) ? Math.round(lerp(30, 92, focus)) : 0;
  const span = frame.span === 0 ? 0 : Math.round(length * frame.span * (/absent|naked|reduced/.test(said) ? 0.25 : 1));
  const display = Math.round(stature * (/grand|bold|full|high|display|crown/.test(said) ? 0.55 : /naked|absent|hidden|plain|smooth/.test(said) ? 0.08 : 0.3));

  return {
    mass,
    length,
    stature,
    limbs,
    stride,
    hide,
    hideKind,
    armament,
    armamentKind,
    tail,
    tailKind,
    gape,
    acuity,
    venom,
    span,
    display,
  };
}

/** Human units, for a stat block that reads like a field measurement. */
export const UNITS: Readonly<Record<MeasureId, string>> = {
  mass: "kg",
  length: "cm",
  stature: "cm",
  limbs: "",
  stride: "cm",
  hide: "mm",
  armament: "cm",
  tail: "cm",
  gape: "cm",
  acuity: "",
  venom: "",
  span: "cm",
  display: "cm",
};

export const MEASURE_NAMES: Readonly<Record<MeasureId, string>> = {
  mass: "Mass",
  length: "Length",
  stature: "Height",
  limbs: "Legs",
  stride: "Stride",
  hide: "Hide",
  armament: "Armament",
  tail: "Tail",
  gape: "Gape",
  acuity: "Acuity",
  venom: "Venom",
  span: "Span",
  display: "Display",
};

/**
 * A measurement as a 0-1 position against what the species can reach.
 *
 * Combat needs comparable numbers — a Sallowfinch's 8kg and a Bramblehog's 90kg
 * cannot both be "heavy" — but the player should still read real units. So the
 * display is absolute and the arithmetic is relative.
 */
export function normaliseMeasure(id: MeasureId, value: number, species: SpeciesId): number {
  const frame = frameFor(species);
  const ceiling: Record<MeasureId, number> = {
    mass: frame.mass * 1.9,
    length: frame.length * 1.2,
    stature: frame.length * frame.stature * 1.3,
    limbs: 4,
    stride: frame.length * frame.stature * 1.6,
    hide: frame.hide * 1.9,
    armament: frame.length * frame.stature * frame.armament * 1.5 || 1,
    tail: frame.length * 0.6 || 1,
    gape: frame.length * frame.stature * frame.gape * 1.3 || 1,
    acuity: 100,
    venom: 100,
    span: frame.length * (frame.span || 1),
    display: frame.length * frame.stature * 0.6 || 1,
  };
  return clamp01(value / Math.max(1e-6, ceiling[id]));
}

/**
 * Every species' reference frame, for tooling and tests.
 *
 * Throws rather than defaulting. A species with no frame is a species with no
 * size, and silently giving it someone else's would produce a creature whose
 * numbers are quietly wrong everywhere they are read.
 */
export function frameFor(species: SpeciesId): Readonly<SpeciesFrame> {
  const frame = FRAMES[species];
  if (!frame) throw new Error(`no reference frame for species "${species}"`);
  return frame;
}
