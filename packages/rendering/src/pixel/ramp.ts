/**
 * Turning a creature's colours into a sprite ramp.
 *
 * The illustration palette is tuned for ink on paper: soft, close in value,
 * because a pen drawing carries its form in the linework. A sprite carries its
 * form in the *values*, so the same colours flattened onto 64 pixels read as a
 * single mush. What a sprite needs is a ramp — a small ladder of colours from
 * highlight to core shadow that all sit on one hue path — and it needs the rungs
 * far enough apart to survive being three pixels wide.
 *
 * So the ramp is rebuilt from the coat rather than sampled from the palette:
 * same hue identity, widened value range, and a hue shift along the ladder.
 * Shadows swing toward the blue end and highlights toward the warm end, which is
 * the oldest trick in the medium and the reason hand-made sprites look lit
 * rather than tinted.
 */

import { hslToHex } from "../palette.js";
import type { ResolvedPalette } from "../types.js";

/** Fixed slots, so a pose or an effect can address a rung by name. */
export const SLOT = {
  empty: 0,
  outline: 1,
  highlight: 2,
  light: 3,
  base: 4,
  shade: 5,
  core: 6,
  belly: 7,
  marking: 8,
  markingDark: 9,
  eye: 10,
  eyeLight: 11,
  glow: 12,
  crown: 13,
  crownDark: 14,
} as const;

export type Slot = (typeof SLOT)[keyof typeof SLOT];

/** How many entries a sprite palette has. Index 0 is transparent. */
export const RAMP_SIZE = 15;

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

/**
 * One rung.
 *
 * `warm` above zero pushes the hue toward orange and raises saturation a little;
 * below zero pushes it toward blue. That is what keeps a five-step ramp from
 * looking like the same colour at five brightnesses.
 */
function rung(base: Hsl, lightness: number, warm: number): string {
  return hslToHex({
    h: base.h + warm * 18,
    s: clamp01(base.s * (1 + warm * 0.1) + (warm < 0 ? 0.06 : 0)),
    l: clamp01(lightness),
  });
}

export interface SpriteRamp {
  readonly colours: readonly string[];
}

export function spriteRamp(palette: ResolvedPalette): SpriteRamp {
  const coat = hexToHsl(palette.coat);
  // Very dark and very pale coats have nowhere to go in one direction, so the
  // mid-point is pulled toward the middle before the ladder is built. Without
  // this a black creature is five identical blacks and reads as a hole.
  const mid = clamp01(0.30 + coat.l * 0.42);
  const marking = hexToHsl(palette.marking);
  const belly = hexToHsl(palette.belly);
  const eye = hexToHsl(palette.eye);

  const colours = new Array<string>(RAMP_SIZE).fill("#000000");
  colours[SLOT.empty] = "#00000000";
  // The contour is the coat's own hue taken almost to black, never pure black:
  // a neutral outline detaches the sprite from its colour and reads as a decal.
  colours[SLOT.outline] = rung({ ...coat, s: clamp01(coat.s * 0.9 + 0.15) }, Math.max(0.06, mid - 0.30), -0.7);
  colours[SLOT.highlight] = rung(coat, Math.min(0.94, mid + 0.30), 1);
  colours[SLOT.light] = rung(coat, Math.min(0.88, mid + 0.16), 0.5);
  colours[SLOT.base] = rung(coat, mid, 0);
  colours[SLOT.shade] = rung(coat, Math.max(0.10, mid - 0.15), -0.6);
  colours[SLOT.core] = rung(coat, Math.max(0.06, mid - 0.26), -1);
  colours[SLOT.belly] = rung(belly, Math.min(0.9, mid + 0.20), 0.4);
  colours[SLOT.marking] = rung(marking, clamp01(marking.l), 0.2);
  // Only one rung below the marking, not four. A marking that darkens as far as
  // the coat's core shadow stops reading as a pattern and starts reading as a
  // hole in the animal.
  colours[SLOT.markingDark] = rung(marking, Math.max(0.14, marking.l - 0.11), -0.5);
  colours[SLOT.eye] = rung(eye, Math.max(0.10, eye.l - 0.05), -0.2);
  colours[SLOT.eyeLight] = "#ffffff";
  colours[SLOT.glow] = palette.glow;
  // The crown reads as its own material — keratin, membrane, frond — so it takes
  // a rung off the marking hue rather than the coat's, or it disappears into the
  // back it grows out of.
  colours[SLOT.crown] = rung(marking, clamp01(marking.l * 0.75 + 0.2), 0.3);
  colours[SLOT.crownDark] = rung(marking, Math.max(0.07, marking.l * 0.6), -0.8);
  return { colours };
}
