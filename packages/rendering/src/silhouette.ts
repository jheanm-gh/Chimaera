/**
 * The silhouette test (§6.4), made executable.
 *
 * "Every species must be identifiable in pure black at 32x32 pixels. If it
 * fails, redesign it." That is the test that separates franchise creatures from
 * asset-pack creatures, and it is worth nothing as a note in a design document.
 * Here it is a rasteriser and a set of measurements a CI run can fail on.
 *
 * What gets measured:
 *
 *   coverage      how much of the box is filled — a speck or a blob both fail
 *   connectivity  one component, or a limb has floated off the rig
 *   spread        how far the shape reaches across the box in each axis
 *   distinctness  Hamming distance between two silhouettes, for comparing
 *                 species against each other (§6.5's "distinct silhouette
 *                 family" becomes a number, not an opinion)
 */

import { pointInRing } from "./geometry.js";
import type { Drawing, Ring, Vec2 } from "./types.js";

export interface Silhouette {
  readonly size: number;
  /** Row-major, `size * size` booleans. True is ink. */
  readonly pixels: readonly boolean[];
}

/**
 * Rasterises every non-ghost filled shape into a square bitmap.
 *
 * Samples 2x2 per pixel and treats a pixel as filled at half coverage. At 32x32
 * a single-sample rasteriser drops thin features like whip tails entirely,
 * which would make the test pass creatures that a player could not read.
 */
export function rasteriseSilhouette(drawing: Drawing, size = 32): Silhouette {
  const rings: Ring[] = [];
  const circles: { c: Vec2; r: number }[] = [];

  for (const layer of drawing.layers) {
    for (const mark of layer.marks) {
      if (mark.ghost) continue;
      if (!mark.fill || mark.fill === "none") continue;
      // Markings live inside the body; they cannot change its outline.
      if (mark.clipToBody) continue;
      if (mark.shape.kind === "circle") circles.push({ c: mark.shape.c, r: mark.shape.r });
      else if (mark.shape.closed) rings.push(mark.shape.points);
    }
  }

  // Fit the *creature*, not the canvas. A 32x32 icon crops to its subject;
  // measuring the empty paper above a low-slung animal would let a shapeless
  // design pass by sitting in a big frame. Aspect ratio is preserved, so a long
  // creature is never squashed into looking like a round one.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    for (const point of ring) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  for (const circle of circles) {
    minX = Math.min(minX, circle.c.x - circle.r);
    minY = Math.min(minY, circle.c.y - circle.r);
    maxX = Math.max(maxX, circle.c.x + circle.r);
    maxY = Math.max(maxY, circle.c.y + circle.r);
  }
  if (!Number.isFinite(minX)) {
    return { size, pixels: new Array(size * size).fill(false) as boolean[] };
  }

  const margin = 1;
  const contentWidth = Math.max(1e-6, maxX - minX);
  const contentHeight = Math.max(1e-6, maxY - minY);
  const scale = (size - margin * 2) / Math.max(contentWidth, contentHeight);
  const offsetX = (size - contentWidth * scale) / 2 - minX * scale;
  const offsetY = (size - contentHeight * scale) / 2 - minY * scale;

  const pixels: boolean[] = new Array(size * size).fill(false) as boolean[];
  const samples = [0.25, 0.75];


  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (const sy of samples) {
        for (const sx of samples) {
          const point: Vec2 = {
            x: (px + sx - offsetX) / scale,
            y: (py + sy - offsetY) / scale,
          };
          if (rings.some((ring) => pointInRing(point, ring))) {
            hits++;
            continue;
          }
          if (circles.some((circle) => Math.hypot(point.x - circle.c.x, point.y - circle.c.y) <= circle.r)) {
            hits++;
          }
        }
      }
      pixels[py * size + px] = hits >= 2;
    }
  }

  return { size, pixels };
}

export function coverage(silhouette: Silhouette): number {
  return silhouette.pixels.filter(Boolean).length / silhouette.pixels.length;
}

/**
 * Number of separate ink regions, using 8-connectivity.
 *
 * Eight rather than four on purpose: a thin diagonal feature — a slanted claw,
 * a whipping tail — occupies diagonally adjacent pixels at 32x32, and an eye
 * reads that as one continuous line. Four-connectivity would report a detached
 * limb where a player sees none, and the test would then push the art toward
 * fat horizontal shapes to satisfy it.
 */
export function componentCount(silhouette: Silhouette): number {
  const { size, pixels } = silhouette;
  const seen = new Array(size * size).fill(false) as boolean[];
  let components = 0;

  for (let index = 0; index < pixels.length; index++) {
    if (!pixels[index] || seen[index]) continue;
    components++;
    const stack = [index];
    seen[index] = true;
    while (stack.length > 0) {
      const current = stack.pop() as number;
      const x = current % size;
      const y = Math.floor(current / size);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const neighbour = ny * size + nx;
        if (!pixels[neighbour] || seen[neighbour]) continue;
        seen[neighbour] = true;
        stack.push(neighbour);
      }
    }
  }
  return components;
}

/** Fraction of the box the shape spans in each axis. */
export function spread(silhouette: Silhouette): { x: number; y: number } {
  const { size, pixels } = silhouette;
  let minX = size;
  let maxX = -1;
  let minY = size;
  let maxY = -1;
  for (let i = 0; i < pixels.length; i++) {
    if (!pixels[i]) continue;
    const x = i % size;
    const y = Math.floor(i / size);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return { x: 0, y: 0 };
  return { x: (maxX - minX + 1) / size, y: (maxY - minY + 1) / size };
}

/** Fraction of pixels that differ. Two species should be well apart. */
export function distinctness(a: Silhouette, b: Silhouette): number {
  if (a.size !== b.size) throw new Error("silhouettes must be the same size to compare");
  let differing = 0;
  for (let i = 0; i < a.pixels.length; i++) {
    if (a.pixels[i] !== b.pixels[i]) differing++;
  }
  return differing / a.pixels.length;
}

/** ASCII rendering, for eyeballing a failure in a test report. */
export function toAscii(silhouette: Silhouette): string {
  const rows: string[] = [];
  for (let y = 0; y < silhouette.size; y++) {
    let row = "";
    for (let x = 0; x < silhouette.size; x++) row += silhouette.pixels[y * silhouette.size + x] ? "#" : ".";
    rows.push(row);
  }
  return rows.join("\n");
}
