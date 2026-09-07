/**
 * Small geometry kit for building creature parts.
 *
 * Parts are *parametric generators*, not static path strings. §6.3 asks for
 * modular parts with defined anchor points; making them functions of a few
 * scalars keeps that structure while letting continuous loci (build,
 * size) produce continuous variation instead of snapping to three authored
 * bodies. Hand-drawn art can be swapped in behind the same anchor interface
 * later without touching anything that consumes a `Drawing`.
 */

import type { Ring, Vec2 } from "./types.js";

export function v(x: number, y: number): Vec2 {
  return { x, y };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scaleAbout(point: Vec2, origin: Vec2, factor: number): Vec2 {
  return {
    x: origin.x + (point.x - origin.x) * factor,
    y: origin.y + (point.y - origin.y) * factor,
  };
}

export function scaleRing(ring: Ring, origin: Vec2, factor: number): Ring {
  return ring.map((p) => scaleAbout(p, origin, factor));
}

export function translateRing(ring: Ring, delta: Vec2): Ring {
  return ring.map((p) => add(p, delta));
}

export function mirrorRingX(ring: Ring, axis: number): Ring {
  return ring.map((p) => ({ x: 2 * axis - p.x, y: p.y }));
}

/** A closed ring approximating an ellipse, sampled evenly. */
export function ellipseRing(cx: number, cy: number, rx: number, ry: number, steps = 32): Ring {
  const points: Vec2[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    points.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return points;
}

/**
 * A closed body ring: an ellipse whose upper and lower halves can differ, and
 * whose mass can be pushed toward the head or the tail. This one function
 * covers every build the BUILD locus can produce.
 */
export function bodyRing(options: {
  cx: number;
  cy: number;
  rx: number;
  ryTop: number;
  ryBottom: number;
  /** Negative pushes mass toward the tail, positive toward the head. */
  bias?: number;
  steps?: number;
}): Ring {
  const { cx, cy, rx, ryTop, ryBottom, bias = 0, steps = 48 } = options;
  const points: Vec2[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const ry = sin < 0 ? ryTop : ryBottom;
    // Bias thickens one end by scaling the vertical radius along the x axis.
    const weight = 1 + bias * cos;
    points.push({ x: cx + rx * cos, y: cy + ry * sin * weight });
  }
  return points;
}

/** A tapering limb or tail: a spine walked out, offset either side by a width profile. */
export function taperedRing(
  spine: readonly Vec2[],
  widthAt: (t: number) => number,
): Ring {
  if (spine.length < 2) throw new Error("taperedRing needs at least two spine points");
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < spine.length; i++) {
    const t = i / (spine.length - 1);
    const current = spine[i] as Vec2;
    const previous = (spine[Math.max(0, i - 1)] ?? current) as Vec2;
    const next = (spine[Math.min(spine.length - 1, i + 1)] ?? current) as Vec2;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const w = widthAt(t);
    left.push({ x: current.x + nx * w, y: current.y + ny * w });
    right.push({ x: current.x - nx * w, y: current.y - ny * w });
  }
  return [...left, ...right.reverse()];
}

/** Samples a quadratic curve into a spine, for limbs and tails that bend. */
export function arcSpine(from: Vec2, control: Vec2, to: Vec2, steps = 12): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inverse = 1 - t;
    points.push({
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
      y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
    });
  }
  return points;
}

/**
 * A sawtooth ridge running along the top of a spine. `spikes` controls count,
 * `height` the reach; a height of zero degenerates to the spine itself, which
 * is how a smooth dorsal is drawn by the same generator as a quilled one.
 */
export function ridgeRing(
  spine: readonly Vec2[],
  spikes: number,
  height: number,
  baseWidth: number,
): Ring {
  const upper: Vec2[] = [];
  const lower: Vec2[] = [];
  for (let i = 0; i < spine.length; i++) {
    const point = spine[i] as Vec2;
    lower.push({ x: point.x, y: point.y + baseWidth });
  }
  for (let s = 0; s < spikes; s++) {
    const t = (s + 0.5) / spikes;
    const index = Math.min(spine.length - 1, Math.round(t * (spine.length - 1)));
    const point = spine[index] as Vec2;
    const taper = Math.sin(Math.PI * t) * 0.45 + 0.55;
    const half = ((spine[spine.length - 1] as Vec2).x - (spine[0] as Vec2).x) / (spikes * 2.6);
    upper.push({ x: point.x - half, y: point.y });
    upper.push({ x: point.x, y: point.y - height * taper });
    upper.push({ x: point.x + half, y: point.y });
  }
  if (upper.length === 0) upper.push(...spine);
  return [...upper, ...lower.reverse()];
}

/** Signed area; positive is counter-clockwise in screen coordinates. */
export function ringArea(ring: Ring): number {
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Vec2;
    const b = ring[(i + 1) % ring.length] as Vec2;
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

export function ringBounds(ring: Ring): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of ring) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function pointInRing(point: Vec2, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as Vec2;
    const b = ring[j] as Vec2;
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;
    const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < x) inside = !inside;
  }
  return inside;
}
