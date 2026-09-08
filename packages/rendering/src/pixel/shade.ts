/**
 * Turning a flat silhouette into a lit body.
 *
 * Three passes, in this order, and the order is the whole thing:
 *
 *   1. LIGHT — six levels over the finished silhouette, from one key light.
 *   2. OCCLUSION — darken where one part of the animal sits against another.
 *   3. CONTOUR — a selective outline whose colour follows the light.
 *
 * The first version did only the first of these, with five levels and a single
 * flat contour, and the result was the complaint: creatures that read as tinted
 * shapes rather than as bodies. Occlusion is what separates a leg from the
 * flank behind it, and a contour that goes dark in shadow and lifts in light is
 * the single loudest difference between amateur and professional pixel art.
 */

import { at, EMPTY } from "./bitmap.js";
import type { Bitmap } from "./bitmap.js";
import { edgeDistance } from "./bitmap.js";

/** Six rungs: 0 is the specular kiss, 5 is core shadow. */
export const LEVELS = 6;

/** Up and slightly left, and every pass agrees about it. */
export const KEY_LIGHT = { x: -0.5, y: -0.87 } as const;

/** Ground bounce: weak, from below and to the right of the key. */
export const BOUNCE = { x: 0.42, y: 0.91 } as const;

export interface LitSurface {
  /** Light level per pixel, 0 (brightest) to 5 (darkest). */
  readonly levels: Uint8Array;
  /** Distance to the nearest empty pixel, for anything that needs thickness. */
  readonly distance: Float32Array;
}

/**
 * Light, computed once over the finished silhouette.
 *
 * The surface normal comes from the gradient of the distance field, which for a
 * filled shape points inward from the nearest edge — so its negation is the
 * direction the surface faces. Lambert against the key light gives the value.
 *
 * The depth term flattens the middle of the animal toward the base tone so the
 * ramp gets spent on the edges, where form actually reads. Without it a big
 * flank is a smooth gradient, which at ninety-six pixels is mud.
 */
export function light(material: Bitmap, empty = 0): LitSurface {
  const distance = edgeDistance(material);
  const { width, height, pixels } = material;
  const levels = new Uint8Array(width * height);
  const d = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return distance[y * width + x] as number;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (pixels[i] === empty) continue;
      const gx = d(x + 1, y) - d(x - 1, y);
      const gy = d(x, y + 1) - d(x, y - 1);
      const len = Math.hypot(gx, gy);
      const nx = len < 1e-6 ? 0 : -gx / len;
      const ny = len < 1e-6 ? 0 : -gy / len;
      const lambert = nx * KEY_LIGHT.x + ny * KEY_LIGHT.y;
      // A weak, cool second light from below and behind — the ground throwing
      // some of the key back up at the animal. It is the difference between a
      // form lit in a void and one standing somewhere: without it the whole
      // underside collapses into one flat core shadow.
      const bounce = Math.max(0, nx * BOUNCE.x + ny * BOUNCE.y) * 0.22;
      const here = distance[i] as number;
      const depth = Math.min(1, here / 5.5);
      const value = 0.5 + lambert * 0.5 * (1 - depth * 0.5) + bounce;

      // Deliberately mean at the top. A specular that fires on a tenth of the
      // body is not a highlight, it is a bleach — the first cut spent the two
      // brightest rungs on most of every animal and they all came out pale.
      let level =
        value > 0.93 ? 0 : value > 0.79 ? 1 : value > 0.6 ? 2 : value > 0.44 ? 3 : value > 0.28 ? 4 : 5;

      // A stalk, a whip tail or a thin leg is entirely edge, so every pixel of
      // it lands in the shadow rungs and the whole feature comes out as a dark
      // pipe. Measuring how thick the feature is *here* — the deepest point
      // nearby, not the depth at this pixel — lets a slender part be lit like
      // the slender thing it is. Only asked where the answer can change
      // anything: most of the animal is already in a light rung, and scanning a
      // neighbourhood around all of it cost more than the rest of the renderer.
      if (level >= 4 && here < 2.6) {
        let thickness = here;
        for (let ny = -2; ny <= 2 && thickness < 2.6; ny++) {
          for (let nx = -2; nx <= 2; nx++) {
            const nearby = d(x + nx, y + ny);
            if (nearby > thickness) thickness = nearby;
          }
        }
        if (thickness < 2.6) level = value > 0.5 ? 2 : 3;
      }
      levels[i] = level;
    }
  }
  return { levels, distance };
}

/**
 * Break the seams between light bands with a checker.
 *
 * Six flat bands of colour meeting along clean curves is the look of a
 * gradient posterised by a filter, which is exactly what it is. Dithering the
 * boundary — one rung interleaved with the next on alternating pixels — is the
 * oldest texture in the medium, and it is most of what makes a hand-made sprite
 * look worked rather than generated.
 *
 * Only between *adjacent* rungs, and only on one parity, so it reads as a
 * transition rather than as noise.
 */
export function dither(material: Bitmap, levels: Uint8Array, empty = 0): void {
  const { width, height, pixels } = material;
  const next = new Uint8Array(levels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (pixels[i] === empty) continue;
      if ((x + y) % 2 !== 0) continue;
      const mine = levels[i] as number;
      let darker = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        if (pixels[py * width + px] === empty) continue;
        if ((levels[py * width + px] as number) === mine + 1) darker = true;
      }
      if (darker) next[i] = Math.min(LEVELS - 1, mine + 1);
    }
  }
  levels.set(next);
}

/**
 * Darken where the animal sits against itself.
 *
 * A leg crossing a flank, a jaw over a neck, a tail root against a haunch: in
 * life those seams are the darkest places on the body, and in a sprite they are
 * the only thing that stops the limbs dissolving into the trunk. Reads the part
 * map rather than the material map, because a leg and the body it covers are
 * made of the same stuff and differ only in which part they belong to.
 *
 * The near part is darkened on its *far* side and the far part on the seam, so
 * the contact reads as one in front of the other rather than as a drawn line.
 */
export function occlude(parts: Bitmap, levels: Uint8Array, depthOf: (part: number) => number): void {
  const { width, height, pixels } = parts;
  const bumped = new Uint8Array(levels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const here = pixels[i] as number;
      if (here === EMPTY) continue;
      const mine = depthOf(here);
      // Four neighbours is enough and keeps the seam a clean one pixel wide.
      let behind = false;
      for (const [nx, ny] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const other = at(parts, x + nx, y + ny);
        if (other === EMPTY || other === here) continue;
        if (depthOf(other) < mine) behind = true;
      }
      if (behind) bumped[i] = 1;
    }
  }
  for (let i = 0; i < levels.length; i++) {
    // One rung, not two. A seam darkened by two reads as a drawn line rather
    // than as one part sitting in front of another.
    if (bumped[i]) levels[i] = Math.min(5, (levels[i] as number) + 1);
  }
}

/**
 * A one-pixel contour outside the shape, coloured by what it is wrapping.
 *
 * Outside rather than inside because an inward border eats the silhouette: at
 * this size a thin tail is two pixels wide and an inside line leaves nothing of
 * it but the line.
 *
 * The colour is the point. A contour that is one flat dark value all the way
 * round is the loudest amateur tell there is; taking it from the light level of
 * the pixel it touches makes the light appear to wrap the form, and costs one
 * lookup per edge pixel.
 */
export function contour(
  target: Bitmap,
  levels: Uint8Array,
  material: Bitmap,
  darkSlot: number,
  litSlot: number,
): void {
  const { width, height } = target;
  const edges: { i: number; slot: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (at(material, x, y) !== EMPTY) continue;
      let brightest = 9;
      for (const [nx, ny] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const px = x + nx;
        const py = y + ny;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        if (at(material, px, py) === EMPTY) continue;
        const level = levels[py * width + px] as number;
        if (level < brightest) brightest = level;
      }
      if (brightest === 9) continue;
      edges.push({ i: y * width + x, slot: brightest <= 1 ? litSlot : darkSlot });
    }
  }
  // Collected first, applied after: writing as we go would let a contour pixel
  // become a neighbour of the next one and grow the line to two pixels.
  for (const edge of edges) target.pixels[edge.i] = edge.slot;
}
