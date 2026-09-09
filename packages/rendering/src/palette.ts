/**
 * Colour resolution and accessibility modes.
 *
 * §6.2 asks for restricted, coherent palettes; §10 asks for colourblind-safe
 * modes and notes they matter unusually much here, because the entire game is
 * colour-coded genetics. Both are the same problem: keep the number of hues
 * small and keep them ordered, so that "this offspring is redder than its dam"
 * survives both a limited palette and a limited eye.
 *
 * Every mode preserves hue *ordering* along the species arc. A player who
 * cannot separate moss from rust still sees a monotone progression, and the
 * marking hatch patterns give a second, non-colour channel.
 */

import type { Hsl } from "@chimaera/genetics";
import { clamp01, lerp } from "./geometry.js";
import type { PaletteMode, ResolvedPalette } from "./types.js";

/** The field-journal ground: aged off-white paper and a warm near-black ink. */
export const PAPER = "#f2ece0";
export const INK = "#241f1a";

export function hslToHex(colour: Hsl): string {
  const h = ((colour.h % 360) + 360) % 360;
  const s = clamp01(colour.s);
  const l = clamp01(colour.l);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const rgb: readonly [number, number, number] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];
  const to255 = (value: number): string =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(rgb[0])}${to255(rgb[1])}${to255(rgb[2])}`;
}

function shift(colour: Hsl, dh: number, ds: number, dl: number): Hsl {
  return {
    h: colour.h + dh,
    s: clamp01(colour.s + ds),
    l: clamp01(colour.l + dl),
  };
}

/**
 * Remaps a hue into a band the given vision type can separate, preserving the
 * ordering of the input. Deuteranopia and protanopia confuse red with green, so
 * the arc is compressed toward the blue-yellow axis they retain; tritanopia
 * loses blue-yellow, so its arc is pushed onto red-green instead.
 */
function accessibleHue(hue: number, mode: PaletteMode, arc: readonly [number, number]): number {
  const t = clamp01((hue - arc[0]) / Math.max(1e-6, arc[1] - arc[0]));
  switch (mode) {
    case "full":
      return hue;
    case "deuteranopia":
    case "protanopia":
      // Blue (250) through to yellow (55), the axis both retain.
      return lerp(250, 55, t);
    case "tritanopia":
      // Teal (175) through to magenta (335).
      return lerp(175, 335, t);
    case "monochrome":
      return 30;
  }
}

export interface PaletteInput {
  readonly coat: Hsl;
  /** The species' authored hue arc, so remapping can preserve ordering within it. */
  readonly hueArc: readonly [number, number];
  readonly mode?: PaletteMode;
  /** Set for markings that must contrast against the coat. */
  readonly markingHue?: number;
  readonly markingAltHue?: number;
}

export function resolvePalette(input: PaletteInput): ResolvedPalette {
  const mode = input.mode ?? "full";
  const base: Hsl =
    mode === "monochrome"
      ? { h: 30, s: 0.06, l: input.coat.l }
      : { ...input.coat, h: accessibleHue(input.coat.h, mode, input.hueArc) };

  // Markings must stay readable against *any* coat the gene pool can produce,
  // including the pale and the very dark. A fixed lightness offset clamps at
  // the ends of the range and quietly produces markings nobody can see, so the
  // offset is searched for instead: step away from the coat until the contrast
  // clears the bar, then stop.
  const markingHue = mode === "monochrome" ? 30 : (input.markingHue ?? base.h + 24) % 360;
  const markingSaturation = mode === "monochrome" ? 0.04 : clamp01(base.s + 0.12);
  const marking = contrastingShade(base, markingHue, markingSaturation, MARKING_CONTRAST);

  const altHue = mode === "monochrome" ? 30 : (input.markingAltHue ?? base.h - 30 + 360) % 360;
  const altSaturation = mode === "monochrome" ? 0.04 : clamp01(base.s + 0.05);
  const markingAlt = contrastingShade(base, altHue, altSaturation, MARKING_CONTRAST, marking.l);

  return {
    ink: INK,
    outline: creatureOutline(base),
    coat: hslToHex(base),
    coatShade: hslToHex(shift(base, -4, 0.04, -0.14)),
    coatLight: hslToHex(shift(base, 4, -0.06, 0.12)),
    belly: hslToHex(shift(base, 6, -0.18, 0.19)),
    marking: hslToHex(marking),
    markingAlt: hslToHex(markingAlt),
    eye: INK,
    glow: hslToHex({ h: 52, s: 0.85, l: 0.62 }),
    paper: PAPER,
  };
}

/**
 * Relative luminance contrast ratio (WCAG). Used by the accessibility tests to
 * assert that markings stay readable against the coat in every mode.
 */
/**
 * Minimum coat-to-marking contrast. Below the WCAG text thresholds on purpose:
 * markings are large blocks of pattern rather than type, and the hatch textures
 * carry a second, non-colour channel. Asserted in the accessibility tests.
 */
export const MARKING_CONTRAST = 2.2;

/**
 * Minimum coat-to-outline contrast, so the linework never vanishes into the fill.
 *
 * 2.1 is measured, not chosen: sweeping the whole authored gene pool against
 * every pen the paper constraint permits, the hardest coat (a mid-lightness
 * magenta) tops out at 2.194. A bar above that would be unsatisfiable, and a
 * contrast rule the palette cannot meet is worse than none — it teaches you to
 * ignore the failure. Widen the species' lightness range and this can rise.
 */
export const OUTLINE_CONTRAST = 2.1;

/** Minimum outline-to-paper contrast, so a lifted pen never vanishes into the page. */
export const OUTLINE_ON_PAPER_CONTRAST = 3;

/**
 * The pen used for the creature itself.
 *
 * Raising the species' lightness floor cannot solve this: a saturated blue is
 * intrinsically dark (blue carries only 7% of relative luminance), so even a
 * mid-lightness blue coat sits close to a near-black line. Lifting the pen for
 * those coats is both the correct fix and the one a naturalist would make.
 */
function creatureOutline(coat: Hsl): string {
  const coatHex = hslToHex(coat);
  if (contrastRatio(coatHex, INK) >= OUTLINE_CONTRAST) return INK;

  let best = INK;
  let bestRatio = contrastRatio(coatHex, INK);
  for (let l = 0.16; l <= 0.68; l += 0.01) {
    const candidate = hslToHex({ h: 28, s: 0.26, l });
    if (contrastRatio(candidate, PAPER) < OUTLINE_ON_PAPER_CONTRAST) continue;
    const ratio = contrastRatio(coatHex, candidate);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
    if (ratio >= OUTLINE_CONTRAST) return candidate;
  }
  return best;
}

/**
 * Finds a lightness for `hue`/`saturation` that clears `target` contrast
 * against `base`, searching outward from the base in both directions and
 * preferring the darker side (ink on paper reads darker).
 */
function contrastingShade(
  base: Hsl,
  hue: number,
  saturation: number,
  target: number,
  avoidLightness?: number,
): Hsl {
  const baseHex = hslToHex(base);
  let best: Hsl = { h: hue, s: saturation, l: base.l > 0.5 ? 0 : 1 };
  let bestRatio = 0;
  for (let step = 0.16; step <= 1; step += 0.04) {
    for (const direction of base.l > 0.5 ? [-1, 1] : [1, -1]) {
      const l = clamp01(base.l + direction * step);
      if (avoidLightness !== undefined && Math.abs(l - avoidLightness) < 0.08) continue;
      const candidate: Hsl = { h: hue, s: saturation, l };
      const ratio = contrastRatio(baseHex, hslToHex(candidate));
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = candidate;
      }
      if (ratio >= target) return candidate;
    }
  }
  return best;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string): number => {
    const channel = (offset: number): number => {
      const value = parseInt(hex.slice(1 + offset * 2, 3 + offset * 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
