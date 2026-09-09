/**
 * The colours a sprite is allowed to use.
 *
 * The first version built five rungs by sliding one colour's lightness up and
 * down. That is why the animals came out flat: a ramp with no hue rotation
 * reads as one colour at five brightnesses, and the eye takes it for a tinted
 * silhouette rather than a lit form.
 *
 * This is a proper ramp. Nine steps of coat, rotated as it climbs — shadows
 * swing cool and violet, highlights swing warm and yellow — which is the oldest
 * trick in the medium and the reason hand-made sprites look lit. Saturation
 * peaks in the middle and drops at both ends, because a shadow that keeps full
 * chroma reads as coloured plastic and a highlight that keeps it reads as neon.
 *
 * Two outline colours rather than one. A single flat contour all the way round
 * is the loudest amateur tell in pixel art: real linework goes dark where the
 * form turns away from the light and lifts where it turns into it.
 */

import { hslToHex } from "../palette.js";
import type { ResolvedPalette } from "../types.js";

/** Fixed slots, so a pose, a texture pass or an effect can name a rung. */
export const SLOT = {
  empty: 0,
  /** Contour on the shadow side. Nearly black, still carrying the coat's hue. */
  outlineDark: 1,
  /** Contour on the lit side. Lifted, so the light appears to wrap the form. */
  outlineLit: 2,
  specular: 3,
  highlight: 4,
  light: 5,
  base: 6,
  midshade: 7,
  shade: 8,
  core: 9,
  belly: 10,
  bellyShade: 11,
  marking: 12,
  markingDark: 13,
  eyeWhite: 14,
  eyeDark: 15,
  /** Keratin: tusks, horn, beak, claws. Reads as bone, not as coat. */
  keratin: 16,
  keratinShade: 17,
  mouth: 18,
  glow: 19,
  crownTissue: 20,
  crownTissueDark: 21,
} as const;

export type Slot = (typeof SLOT)[keyof typeof SLOT];

/** How many entries a sprite palette has. Index 0 is transparent. */
export const RAMP_SIZE = 22;

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { h, s, l };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * One rung of a ramp.
 *
 * `t` runs 0 at the darkest end to 1 at the lightest. Hue rotates across that
 * span — negative degrees toward blue at the bottom, positive toward yellow at
 * the top — and saturation arches so the extremes desaturate.
 */
function rung(base: Hsl, t: number, options: { rotate?: number; chroma?: number } = {}): string {
  const rotate = options.rotate ?? 34;
  const swing = (t - 0.5) * 2;
  const arch = 1 - Math.abs(swing) * 0.42;
  return hslToHex({
    h: base.h + swing * rotate,
    s: clamp01(base.s * arch * (options.chroma ?? 1) + 0.04),
    l: clamp01(lerp(0.06, 0.9, t)),
  });
}

export interface SpriteRamp {
  readonly colours: readonly string[];
}

export function spriteRamp(palette: ResolvedPalette): SpriteRamp {
  const coat = hexToHsl(palette.coat);
  const marking = hexToHsl(palette.marking);
  const belly = hexToHsl(palette.belly);
  const eye = hexToHsl(palette.eye);

  // Pull the mid-point toward the middle before building the ladder. A coat
  // that is already almost black has nowhere to go downward, and without this
  // it becomes nine identical blacks and reads as a hole in the screen.
  const mid = clamp01(0.25 + coat.l * 0.29);
  const at = (offset: number, options?: { rotate?: number; chroma?: number }): string =>
    rung(coat, clamp01(mid + offset), options);

  const colours = new Array<string>(RAMP_SIZE).fill("#000000");
  colours[SLOT.empty] = "#00000000";

  // Contours. Never neutral black — a grey line detaches the sprite from its
  // own colour and makes it read as a sticker laid on the background.
  colours[SLOT.outlineDark] = at(-0.34, { rotate: 46, chroma: 1.15 });
  colours[SLOT.outlineLit] = at(-0.16, { rotate: 40, chroma: 1.1 });

  colours[SLOT.specular] = at(0.34, { rotate: 26, chroma: 0.55 });
  colours[SLOT.highlight] = at(0.21);
  colours[SLOT.light] = at(0.11);
  colours[SLOT.base] = at(0);
  colours[SLOT.midshade] = at(-0.09);
  colours[SLOT.shade] = at(-0.18);
  colours[SLOT.core] = at(-0.27, { rotate: 46 });

  // The underside is the coat's own hue lifted and slightly warmed, not a
  // foreign grey. Taking it straight from the palette's belly colour left a
  // desaturated slab that read as a hole in the animal.
  const under: Hsl = { h: lerp(belly.h, coat.h, 0.82), s: clamp01(coat.s * 0.7 + 0.06), l: belly.l };
  colours[SLOT.belly] = rung(under, clamp01(mid + 0.2), { rotate: 20 });
  colours[SLOT.bellyShade] = rung(under, clamp01(mid + 0.06), { rotate: 26 });

  // Crown and membrane are the animal's own tissue, so they take the coat's hue
  // nudged aside rather than the marking's. Built from the marking they came
  // out a different colour from the creature they grow on — a grey sail bolted
  // to a purple glider.
  const tissue: Hsl = { h: coat.h + 14, s: clamp01(coat.s * 0.85), l: coat.l };
  colours[SLOT.crownTissue] = rung(tissue, clamp01(mid + 0.14), { rotate: 26 });
  colours[SLOT.crownTissueDark] = rung(tissue, clamp01(mid - 0.14), { rotate: 34 });

  colours[SLOT.marking] = rung(marking, clamp01(marking.l), { rotate: 20, chroma: 1.15 });
  colours[SLOT.markingDark] = rung(marking, clamp01(marking.l - 0.13), { rotate: 30, chroma: 1.1 });

  // The eye is the one place a near-white is allowed to be genuinely bright.
  // Bright, but not the brightest thing on the plate. At near-white the sclera
  // out-shouted the specular on the animal's own back.
  colours[SLOT.eyeWhite] = hslToHex({ h: coat.h, s: 0.08, l: 0.88 });
  colours[SLOT.eyeDark] = rung(eye, clamp01(eye.l * 0.35), { rotate: 24, chroma: 0.9 });

  // Keratin is bone, warm and desaturated, and deliberately near the coat's
  // hue rather than a foreign cream — a tusk grew out of this animal.
  // Bone, not chalk. At near-white a tusk read as a bright spike stuck onto the
  // animal; taken down to the value of a light coat rung it reads as part of it.
  colours[SLOT.keratin] = hslToHex({ h: coat.h * 0.12 + 42, s: 0.16, l: clamp01(mid + 0.26) });
  colours[SLOT.keratinShade] = hslToHex({ h: coat.h * 0.12 + 34, s: 0.22, l: clamp01(mid + 0.02) });

  colours[SLOT.mouth] = at(-0.4, { rotate: 50, chroma: 1.2 });
  colours[SLOT.glow] = palette.glow;
  return { colours };
}

/** The nine coat rungs, darkest first, for anything that needs to walk them. */
export const COAT_RAMP: readonly number[] = [
  SLOT.core,
  SLOT.shade,
  SLOT.midshade,
  SLOT.base,
  SLOT.light,
  SLOT.highlight,
  SLOT.specular,
];
