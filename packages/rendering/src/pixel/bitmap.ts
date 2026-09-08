/**
 * An indexed bitmap, and the primitives that draw into it.
 *
 * Pixel art is not vector art rasterised. Downsampling a smooth ellipse gives
 * grey fringes and a shape that reads as a blur at 64 pixels across; a sprite
 * has to be *drawn* in pixel space, with hard edges and a small palette, or it
 * looks like a photograph of a drawing.
 *
 * So everything here is integer, every edge is a decision, and colour is an
 * index into a ramp rather than a value. Index 0 is always transparent, which
 * makes "is this pixel part of the creature" a single comparison — the question
 * the outline, the shading and the silhouette test all keep asking.
 */

/** Palette index 0. Never drawn. */
export const EMPTY = 0;

export interface Bitmap {
  readonly width: number;
  readonly height: number;
  /** One palette index per pixel, row-major. */
  readonly pixels: Uint8Array;
  /**
   * A second plane written in lockstep with the first.
   *
   * The sprite needs two parallel maps — what a pixel is made of, and which
   * part of the body it belongs to — and drawing every shape twice to fill
   * them cost as much as the rest of the renderer put together. Carrying the
   * companion on the target means one pass fills both.
   */
  companion?: { readonly pixels: Uint8Array; index: number } | undefined;
}

export function createBitmap(width: number, height: number): Bitmap {
  return { width, height, pixels: new Uint8Array(width * height) };
}

export function at(bitmap: Bitmap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return EMPTY;
  return bitmap.pixels[y * bitmap.width + x] as number;
}

export function put(bitmap: Bitmap, x: number, y: number, index: number): void {
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return;
  const i = y * bitmap.width + x;
  bitmap.pixels[i] = index;
  if (bitmap.companion) bitmap.companion.pixels[i] = bitmap.companion.index;
}

/** Draw only where the target is still empty — for laying a part behind another. */
export function putBehind(bitmap: Bitmap, x: number, y: number, index: number): void {
  if (at(bitmap, x, y) !== EMPTY) return;
  put(bitmap, x, y, index);
}

export function clone(bitmap: Bitmap): Bitmap {
  return { width: bitmap.width, height: bitmap.height, pixels: new Uint8Array(bitmap.pixels) };
}

/**
 * A filled ellipse with hard edges.
 *
 * Span-based rather than per-pixel: for each row it solves the ellipse for x and
 * fills between, which guarantees no gaps and no stray pixels at the poles —
 * the two ways a naive `dx*dx/rx*rx + …` test goes wrong at small radii.
 */
export function fillEllipse(bitmap: Bitmap, cx: number, cy: number, rx: number, ry: number, index: number): void {
  if (rx < 0.5 || ry < 0.5) return;
  const top = Math.max(0, Math.ceil(cy - ry));
  const bottom = Math.min(bitmap.height - 1, Math.floor(cy + ry));
  for (let y = top; y <= bottom; y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (dy * dy > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const from = Math.round(cx - half);
    const to = Math.round(cx + half);
    for (let x = from; x < to; x++) put(bitmap, x, y, index);
  }
}

/**
 * A limb, a tail, a neck: a line that changes thickness along its length.
 *
 * Stamped as a run of discs rather than a polygon, because a polygon's diagonal
 * edges alias into staircases of varying step length, while overlapping discs
 * give the even, rounded contour a hand-drawn limb has.
 */
export function fillTaper(
  bitmap: Bitmap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r0: number,
  r1: number,
  index: number,
): void {
  const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillEllipse(bitmap, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t, index);
  }
}

/** A filled triangle, for fins, crests and spines. */
export function fillTriangle(
  bitmap: Bitmap,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  index: number,
): void {
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(bitmap.height - 1, Math.ceil(Math.max(ay, by, cy)));
  const edge = (px: number, py: number, sx: number, sy: number, ex: number, ey: number): number =>
    (px - sx) * (ey - sy) - (py - sy) * (ex - sx);
  const area = edge(cx, cy, ax, ay, bx, by);
  if (Math.abs(area) < 1e-6) return;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(bitmap.width - 1, Math.ceil(Math.max(ax, bx, cx)));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = edge(px, py, ax, ay, bx, by) / area;
      const w1 = edge(px, py, bx, by, cx, cy) / area;
      const w2 = edge(px, py, cx, cy, ax, ay) / area;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) put(bitmap, x, y, index);
    }
  }
}

/**
 * Distance from every filled pixel to the nearest empty one.
 *
 * Two chamfer passes rather than a true Euclidean transform: at this size the
 * difference is invisible and the shading only needs to know "near the edge" or
 * "deep inside". Empty pixels come back as 0.
 */
export function edgeDistance(bitmap: Bitmap): Float32Array {
  const { width, height, pixels } = bitmap;
  const distance = new Float32Array(width * height);
  const FAR = 1e6;
  for (let i = 0; i < pixels.length; i++) distance[i] = pixels[i] === EMPTY ? 0 : FAR;

  // Written out rather than routed through a helper. This runs eight times per
  // pixel over the whole sprite, and at that count the call was costing more
  // than the arithmetic inside it.
  const D = 1.414;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let best = distance[i] as number;
      if (best === 0) continue;
      if (x > 0) {
        const c = (distance[i - 1] as number) + 1;
        if (c < best) best = c;
      }
      if (y > 0) {
        const c = (distance[i - width] as number) + 1;
        if (c < best) best = c;
        if (x > 0) {
          const d = (distance[i - width - 1] as number) + D;
          if (d < best) best = d;
        }
        if (x < width - 1) {
          const d = (distance[i - width + 1] as number) + D;
          if (d < best) best = d;
        }
      }
      distance[i] = best;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let best = distance[i] as number;
      if (best === 0) continue;
      if (x < width - 1) {
        const c = (distance[i + 1] as number) + 1;
        if (c < best) best = c;
      }
      if (y < height - 1) {
        const c = (distance[i + width] as number) + 1;
        if (c < best) best = c;
        if (x < width - 1) {
          const d = (distance[i + width + 1] as number) + D;
          if (d < best) best = d;
        }
        if (x > 0) {
          const d = (distance[i + width - 1] as number) + D;
          if (d < best) best = d;
        }
      }
      distance[i] = best;
    }
  }
  return distance;
}

/**
 * A one-pixel border drawn *outside* the shape.
 *
 * Outside rather than inside because an inside outline eats the silhouette: at
 * 64 pixels a thin tail is two pixels wide, and an inward border leaves nothing
 * of it but the border. This is also why the sprite is drawn a pixel clear of
 * its own bounds.
 */
export function outline(bitmap: Bitmap, index: number): void {
  const { width, height } = bitmap;
  const edges: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (at(bitmap, x, y) !== EMPTY) continue;
      if (
        at(bitmap, x - 1, y) !== EMPTY ||
        at(bitmap, x + 1, y) !== EMPTY ||
        at(bitmap, x, y - 1) !== EMPTY ||
        at(bitmap, x, y + 1) !== EMPTY
      ) {
        edges.push(y * width + x);
      }
    }
  }
  for (const i of edges) bitmap.pixels[i] = index;
}

/** Bounding box of everything drawn, or undefined for an empty bitmap. */
export function bounds(bitmap: Bitmap): { x: number; y: number; width: number; height: number } | undefined {
  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (at(bitmap, x, y) === EMPTY) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return undefined;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
