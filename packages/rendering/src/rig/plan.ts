/**
 * Body plans: one rig, six silhouette families (§6.5).
 *
 * The Quillfen rig proved the approach; six hand-written copies of it would be
 * six places for the same bug. Instead the generators are shared and each
 * species supplies a `BodyPlan` — proportions, a posture, and which trait drives
 * which slot.
 *
 * What keeps this from producing six recolours of one animal is that the plan
 * controls *posture* and *proportion*, not just decoration: a serpentine plan
 * has no limbs and a body eight times longer than it is deep; an upright plan
 * stands the body on end and puts the mass over the feet. The silhouette test
 * then measures whether that worked, pairwise, at 32x32 — and it is the test,
 * not the author, that decides whether two species are distinct.
 */

import type { Rng } from "@chimaera/genetics";
import {
  arcSpine,
  bodyRing,
  clamp01,
  ellipseRing,
  lerp,
  ridgeRing,
  taperedRing,
  v,
} from "../geometry.js";
import type { DetailLevel, Mark, Ring, Vec2 } from "../types.js";

export type Posture = "horizontal" | "upright" | "serpentine" | "spread";
export type LimbKind = "paddle" | "clawed" | "stub" | "long" | "none";
export type TailKind = "fan" | "whip" | "forked" | "stub" | "none";
export type CrownKind = "fronds" | "spines" | "plume" | "membrane" | "none";

export interface BodyPlan {
  readonly species: string;
  /** Long and low, upright, snake, or wide-and-thin. */
  readonly posture: Posture;
  /** Half-length and half-depth of the trunk, in canvas units. */
  readonly bodyRx: number;
  readonly bodyRyTop: readonly [number, number];
  readonly bodyRyBottom: readonly [number, number];
  /** Negative shifts mass toward the tail, positive toward the head. */
  readonly bodyBias: number;
  readonly bodyCentre: Vec2;
  /** Head reach from the neck, and its thickness at the root. */
  readonly headReach: number;
  readonly headThickness: readonly [number, number];
  readonly headLift: number;
  readonly limbPairs: 0 | 1 | 2;
  readonly limbReach: number;
  readonly limbThickness: number;
  readonly tailReach: number;
  readonly tailRoot: number;
  readonly tailLift: number;
  readonly crown: CrownKind;
  readonly crownReach: number;
  readonly crownCount: number;
  /** Which phenotype trait supplies each variable slot for this species. */
  readonly traits: {
    readonly build: string;
    readonly limbs?: string;
    readonly tail?: string;
    readonly crown?: string;
    readonly markings: string;
    readonly display?: string;
    readonly glow?: string;
    readonly sheen?: string;
  };
}

export interface PlanInput {
  readonly plan: BodyPlan;
  readonly detail: DetailLevel;
  /** 0-1 from the species' build locus. */
  readonly build: number;
  /** 0-1 from the vigour ceiling: the size scalar. */
  readonly size: number;
  readonly limbs: string;
  readonly tail: string;
  readonly crown: string;
  readonly markings: string;
  readonly display: string;
  readonly glow: boolean;
  readonly sheen: boolean;
  readonly rng: Rng;
}

export const CANVAS = { width: 240, height: 160 } as const;
export const BASELINE = 138;

function steps(input: PlanInput, full: number): number {
  return input.detail === "thumb" ? Math.max(4, Math.round(full / 2)) : full;
}

function scaleOf(input: PlanInput): number {
  return lerp(0.9, 1.1, clamp01(input.size));
}

export interface Anchors {
  readonly bodyCentre: Vec2;
  readonly neck: Vec2;
  readonly snout: Vec2;
  readonly tailBase: Vec2;
  readonly limbAnchors: readonly Vec2[];
  readonly crownRoot: Vec2;
  readonly eye: Vec2;
}

/**
 * Anchors from the plan.
 *
 * The posture switch is where the six silhouettes actually diverge: it decides
 * whether the head sits ahead of the body, above it, or continues in line with
 * it, and where the limbs meet the ground.
 */
export function anchorsFor(input: PlanInput): Anchors {
  const { plan } = input;
  const scale = scaleOf(input);
  const depth = lerp(0, 6, clamp01(input.build));
  const at = (x: number, y: number): Vec2 =>
    v(120 + (x - 120) * scale, BASELINE - (BASELINE - y) * scale);

  const centre = at(plan.bodyCentre.x, plan.bodyCentre.y - depth * 0.3);
  const upright = plan.posture === "upright";
  const serpentine = plan.posture === "serpentine";

  // The neck sits *inside* the trunk, not on top of it. Anchoring it at the
  // body's outer edge left a gap in the upright plans and the silhouette broke
  // into a head and a body — caught by the connectivity check, not by eye.
  const neck = upright
    ? at(plan.bodyCentre.x + plan.bodyRx * 0.15, plan.bodyCentre.y - plan.bodyRyTop[1] * 0.62)
    : at(plan.bodyCentre.x + plan.bodyRx * 0.7, plan.bodyCentre.y - plan.headLift);
  const snout = upright
    ? at(
        plan.bodyCentre.x + plan.bodyRx * 0.15 + plan.headReach * 0.34,
        plan.bodyCentre.y - plan.bodyRyTop[1] * 0.62 - plan.headReach,
      )
    : at(plan.bodyCentre.x + plan.bodyRx * 0.7 + plan.headReach, plan.bodyCentre.y - plan.headLift * 0.6);

  const limbAnchors: Vec2[] = [];
  if (plan.limbPairs >= 1) limbAnchors.push(at(plan.bodyCentre.x - plan.bodyRx * 0.55, plan.bodyCentre.y + plan.bodyRyBottom[1] * 0.65));
  if (plan.limbPairs >= 2) limbAnchors.push(at(plan.bodyCentre.x + plan.bodyRx * 0.55, plan.bodyCentre.y + plan.bodyRyBottom[1] * 0.6));

  return {
    bodyCentre: centre,
    neck,
    snout,
    tailBase: at(plan.bodyCentre.x - plan.bodyRx * (serpentine ? 0.94 : 0.88), plan.bodyCentre.y + plan.tailLift),
    limbAnchors,
    crownRoot: upright
      ? at(plan.bodyCentre.x + plan.bodyRx * 0.1, plan.bodyCentre.y - plan.bodyRyTop[1] * 0.62 - plan.headReach * 0.7)
      : at(plan.bodyCentre.x + plan.bodyRx * 0.6, plan.bodyCentre.y - plan.bodyRyTop[1] * 0.7),
    eye: upright
      ? at(
          plan.bodyCentre.x + plan.bodyRx * 0.15 + plan.headReach * 0.26,
          plan.bodyCentre.y - plan.bodyRyTop[1] * 0.62 - plan.headReach * 0.72,
        )
      : at(plan.bodyCentre.x + plan.bodyRx * 0.7 + plan.headReach * 0.62, plan.bodyCentre.y - plan.headLift * 0.9 - 4),
  };
}

export function bodyOutline(input: PlanInput, anchors: Anchors): Ring {
  const { plan } = input;
  const scale = scaleOf(input);
  const t = clamp01(input.build);
  if (plan.posture === "serpentine") {
    // A snake has no trunk: the "body" is the first half of a long stroke, so
    // the silhouette reads as one continuous line rather than a lump with ends.
    const spine = arcSpine(
      v(anchors.bodyCentre.x - plan.bodyRx * scale, anchors.bodyCentre.y + 10 * scale),
      v(anchors.bodyCentre.x, anchors.bodyCentre.y - 26 * scale),
      v(anchors.bodyCentre.x + plan.bodyRx * scale, anchors.bodyCentre.y - 2 * scale),
      steps(input, 22),
    );
    const width = lerp(plan.bodyRyTop[0], plan.bodyRyTop[1], t) * scale;
    return taperedRing(spine, (u) => width * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.25))));
  }
  return bodyRing({
    cx: anchors.bodyCentre.x,
    cy: anchors.bodyCentre.y,
    rx: plan.bodyRx * scale,
    ryTop: lerp(plan.bodyRyTop[0], plan.bodyRyTop[1], t) * scale,
    ryBottom: lerp(plan.bodyRyBottom[0], plan.bodyRyBottom[1], t) * scale,
    bias: plan.bodyBias,
    steps: steps(input, 48),
  });
}

export function headShape(input: PlanInput, anchors: Anchors): Ring {
  const scale = scaleOf(input);
  const control = v(
    (anchors.neck.x + anchors.snout.x) / 2,
    (anchors.neck.y + anchors.snout.y) / 2 - 5 * scale,
  );
  const spine = arcSpine(anchors.neck, control, anchors.snout, steps(input, 10));
  const thick = lerp(input.plan.headThickness[0], input.plan.headThickness[1], clamp01(input.build)) * scale;
  return taperedRing(spine, (t) => thick * (1 - 0.7 * t * t));
}

export function tailShape(input: PlanInput, anchors: Anchors): Ring | undefined {
  const { plan } = input;
  if (plan.tailReach <= 0) return undefined;
  const scale = scaleOf(input);
  const base = anchors.tailBase;
  const kind = normaliseTail(input.tail);
  if (kind === "none") return undefined;

  const reach = plan.tailReach * (kind === "stub" ? 0.45 : kind === "whip" ? 1.15 : 1) * scale;
  const tip = v(base.x - reach, base.y - plan.tailLift * scale - (kind === "whip" ? 16 * scale : 4 * scale));
  const spine = arcSpine(base, v(base.x - reach * 0.5, base.y + 4 * scale), tip, steps(input, 14));
  const root = plan.tailRoot * scale;
  switch (kind) {
    case "whip":
      // The taper floor is load-bearing: below ~3.5 units the tip breaks off in
      // the 32x32 silhouette and the creature reads as two objects.
      return taperedRing(spine, (t) => lerp(root, 3.6, t ** 0.8));
    case "forked":
      return taperedRing(spine, (t) => lerp(root, root * 1.3, Math.sin((t * Math.PI) / 2)));
    case "stub":
      return taperedRing(spine, (t) => lerp(root, root * 0.6, t));
    default:
      return taperedRing(spine, (t) => lerp(root, root * 1.45, Math.sin((t * Math.PI) / 2)));
  }
}

function normaliseTail(trait: string): TailKind {
  if (/whip/.test(trait) && /fan|forked/.test(trait)) return "forked";
  if (/whip/.test(trait)) return "whip";
  if (/fork/.test(trait)) return "forked";
  if (/fan|barred|broad/.test(trait)) return "fan";
  if (/stub|short|none|plain|unbanded/.test(trait)) return "stub";
  return "fan";
}

export function limbShapes(input: PlanInput, anchors: Anchors): { rings: Ring[]; claws: Ring[] } {
  const { plan } = input;
  const rings: Ring[] = [];
  const claws: Ring[] = [];
  if (plan.limbPairs === 0) return { rings, claws };
  const scale = scaleOf(input);
  const kind = normaliseLimb(input.limbs);
  if (kind === "none") return { rings, claws };

  for (const [index, anchor] of anchors.limbAnchors.entries()) {
    const forward = index === anchors.limbAnchors.length - 1 ? 1 : -1;
    const reach = plan.limbReach * (kind === "stub" ? 0.45 : kind === "long" ? 1.3 : 1) * scale;
    const foot = v(anchor.x + forward * reach * 0.34, Math.min(BASELINE - 2, anchor.y + reach));
    const spine = arcSpine(anchor, v(anchor.x + forward * reach * 0.1, anchor.y + reach * 0.55), foot, steps(input, 8));
    const width = plan.limbThickness * scale;
    switch (kind) {
      case "clawed":
        rings.push(taperedRing(spine, (t) => lerp(width, width * 0.42, t)));
        for (let c = -1; c <= 1; c++) {
          claws.push([
            v(foot.x, foot.y - 2 * scale),
            v(foot.x + forward * (5 + c * 1.5) * scale, foot.y + (2.5 + Math.abs(c)) * scale),
            v(foot.x + forward * 1.5 * scale, foot.y + 2 * scale),
          ]);
        }
        break;
      case "long":
        rings.push(taperedRing(spine, (t) => lerp(width * 0.8, width * 1.5, t ** 2)));
        break;
      case "stub":
        rings.push(taperedRing(spine, (t) => lerp(width, width * 0.8, t)));
        break;
      default:
        rings.push(taperedRing(spine, (t) => lerp(width, width * 1.45, t ** 1.6)));
    }
  }
  return { rings, claws };
}

function normaliseLimb(trait: string): LimbKind {
  if (/paddle|pad/.test(trait)) return "paddle";
  if (/claw|hook|barb/.test(trait)) return "clawed";
  if (/stub|short|plain|none/.test(trait)) return "stub";
  if (/long/.test(trait)) return "long";
  return "paddle";
}

/**
 * The crown slot: whatever a species wears on its back or head. This is the
 * single biggest contributor to silhouette identity, so it is drawn large.
 */
export function crownShape(input: PlanInput, anchors: Anchors): Ring[] {
  const { plan } = input;
  if (plan.crown === "none" || plan.crownReach <= 0) return [];
  const scale = scaleOf(input);
  const intensity = crownIntensity(input.crown);
  if (intensity <= 0) return [];
  const reach = plan.crownReach * intensity * scale;
  // The actual body top for *this* creature's build, not the plan's maximum.
  // Using the maximum left a ridge floating clear of a lightly built animal,
  // and the connectivity check caught it as a second component. The overlap
  // keeps the base inside the trunk.
  const bodyTop =
    anchors.bodyCentre.y -
    lerp(plan.bodyRyTop[0], plan.bodyRyTop[1], clamp01(input.build)) * scale +
    5 * scale;

  switch (plan.crown) {
    case "fronds": {
      const angles = [-1.32, -0.82, -0.3];
      return angles.map((angle, index) => {
        const root = v(anchors.crownRoot.x - index * 7 * scale, anchors.crownRoot.y + index * 2.5 * scale);
        const tip = v(root.x - Math.cos(angle) * reach * 0.85, root.y + Math.sin(angle) * reach);
        const spine = arcSpine(root, v(root.x + 5 * scale, root.y + Math.sin(angle) * reach * 0.45), tip, steps(input, 8));
        return taperedRing(spine, (t) => (2.4 + 3.6 * Math.sin(Math.PI * t)) * scale);
      });
    }
    case "spines": {
      const start = v(anchors.bodyCentre.x - plan.bodyRx * 0.75 * scale, bodyTop);
      const end = v(anchors.bodyCentre.x + plan.bodyRx * 0.7 * scale, bodyTop - 3);
      const spine = arcSpine(start, v((start.x + end.x) / 2, start.y - 9 * scale), end, steps(input, 20));
      return [ridgeRing(spine, plan.crownCount, reach, 7)];
    }
    case "plume": {
      const root = anchors.crownRoot;
      const spine = arcSpine(root, v(root.x + reach * 0.4, root.y - reach * 0.9), v(root.x + reach * 0.9, root.y - reach * 0.4), steps(input, 12));
      return [ridgeRing(spine, plan.crownCount, reach * 0.55, 3)];
    }
    case "membrane": {
      /**
       * One broad sheet, and it is the whole animal.
       *
       * Not a `taperedRing`: that offsets perpendicular to its spine, so a
       * horizontal spine turns "width" into vertical bulk and the glider came
       * out as a fat lens. A membrane has to be built explicitly wide and
       * explicitly thin, or the species reads as a fatter Quillfen.
       */
      const halfSpan = reach * 1.05 * scale;
      const halfDepth = reach * 0.2 * scale;
      const cx = anchors.bodyCentre.x - halfSpan * 0.08;
      const cy = anchors.bodyCentre.y - halfDepth * 0.15;
      const count = steps(input, 34);
      const ring: Vec2[] = [];
      for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        // Swept back at the tips and slightly cambered along the leading edge.
        const sweep = 1 - 0.42 * cos * cos;
        ring.push(v(cx + halfSpan * cos, cy + halfDepth * sin * sweep - (sin < 0 ? halfDepth * 0.3 * cos : 0)));
      }
      return [ring];
    }
    default:
      return [];
  }
}

function crownIntensity(trait: string): number {
  if (/none|absent|naked|smooth|hidden|unformed|plain|dry/.test(trait)) return 0.28;
  if (/crown|thicket|storm|high|grand|broad|dense|full|potent|endless/.test(trait)) return 1.5;
  if (/quill|low|even|banded|mild|lapped/.test(trait)) return 1;
  return 0.7;
}

export function bellyShape(input: PlanInput, anchors: Anchors): Ring {
  const { plan } = input;
  const scale = scaleOf(input);
  return ellipseRing(
    anchors.bodyCentre.x - plan.bodyRx * 0.08 * scale,
    anchors.bodyCentre.y + lerp(plan.bodyRyBottom[0], plan.bodyRyBottom[1], clamp01(input.build)) * 0.5 * scale,
    plan.bodyRx * 0.72 * scale,
    lerp(plan.bodyRyBottom[0], plan.bodyRyBottom[1], clamp01(input.build)) * 0.45 * scale,
    steps(input, 26),
  );
}

export function glowShape(input: PlanInput, anchors: Anchors): Ring | undefined {
  if (!input.glow) return undefined;
  const scale = scaleOf(input);
  return ellipseRing(
    anchors.bodyCentre.x,
    anchors.bodyCentre.y,
    input.plan.bodyRx * 1.4 * scale,
    input.plan.bodyRyBottom[1] * 1.8 * scale,
    steps(input, 30),
  );
}

/** Markings, placed deterministically from the creature's own seed. */
export function markingMarks(input: PlanInput, anchors: Anchors): Mark[] {
  const marks: Mark[] = [];
  const { plan } = input;
  const scale = scaleOf(input);
  const trait = input.markings;
  const spread = plan.bodyRx * 1.7 * scale;
  const depth = lerp(plan.bodyRyBottom[0], plan.bodyRyBottom[1], clamp01(input.build)) * 1.7 * scale;

  const spotty = /spot|fleck|tick|eyespot|cinder|vein|soot|diamond|barb|pad/.test(trait);
  const banded = /band|ring|ray|collar|mask|lattice|scallop|fringe|hook|thread/.test(trait);
  const veiled = /veil|aurora|nacre|opal|ember-tips|umbral/.test(trait);

  if (spotty) {
    for (let i = 0; i < 11; i++) {
      marks.push({
        shape: {
          kind: "circle",
          c: v(
            anchors.bodyCentre.x + (input.rng.next() - 0.5) * spread,
            anchors.bodyCentre.y + (input.rng.next() - 0.45) * depth,
          ),
          r: (2.4 + input.rng.next() * 3.2) * scale,
        },
        fill: "marking",
        clipToBody: true,
        opacity: 0.85,
        hatch: "dots",
      });
    }
  }
  if (banded) {
    for (let i = 0; i < 5; i++) {
      const x = anchors.bodyCentre.x - spread * 0.42 + (i * spread) / 5.4 + (input.rng.next() - 0.5) * 5;
      const width = (4.5 + input.rng.next() * 4) * scale;
      marks.push({
        shape: {
          kind: "path",
          points: [
            v(x - width, anchors.bodyCentre.y - depth),
            v(x + width, anchors.bodyCentre.y - depth),
            v(x + width * 0.6, anchors.bodyCentre.y + depth),
            v(x - width * 1.2, anchors.bodyCentre.y + depth),
          ],
          closed: true,
          smooth: false,
        },
        fill: "markingAlt",
        clipToBody: true,
        opacity: 0.8,
        hatch: "lines",
      });
    }
  }
  if (veiled) {
    marks.push({
      shape: {
        kind: "path",
        points: ellipseRing(anchors.bodyCentre.x + 6 * scale, anchors.bodyCentre.y - 6 * scale, spread * 0.5, depth * 0.5, steps(input, 28)),
        closed: true,
        smooth: true,
      },
      fill: "markingAlt",
      clipToBody: true,
      opacity: 0.45,
      hatch: "wave",
    });
  }
  return marks;
}
