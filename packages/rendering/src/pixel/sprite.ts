/**
 * Creature to sprite.
 *
 * Same input as the illustration renderer — a Phenotype and its gene map, never
 * a genome — and the same body plans, so a Quillfen is the same animal in both.
 * What changes is the medium: this draws at 64 pixels, in a fifteen-colour ramp,
 * with hard edges and a lit surface, because that is what makes a creature read
 * as a *character* rather than as a diagram.
 *
 * The order of work matters and is the reason this reads the way it does:
 *
 *   1. lay down MATERIAL — which substance is at each pixel, not which colour
 *   2. compute LIGHT from the finished silhouette, once, for the whole animal
 *   3. resolve COLOUR from (material, light level)
 *
 * Shading after the silhouette is complete is what makes the limbs, crown and
 * trunk look like one creature lit from one direction, instead of like separate
 * shapes that each brought their own gradient.
 */

import { createRng } from "@chimaera/genetics";
import type { GeneMap, Phenotype } from "@chimaera/genetics";
import { resolvePalette } from "../palette.js";
import { phenotypeFingerprint } from "../render.js";
import type { PaletteMode } from "../types.js";
import { planFor } from "../rig/plans.js";
import { measure } from "@chimaera/genetics";
import type { ArmamentKind, HideKind, Morphology } from "@chimaera/genetics";
import type { BodyPlan } from "../rig/plan.js";
import { at, bounds, createBitmap, EMPTY, fillEllipse, fillTaper, fillTriangle, put } from "./bitmap.js";
import type { Bitmap } from "./bitmap.js";
import { RAMP_SIZE, SLOT, spriteRamp } from "./ramp.js";
import { contour, dither, light, occlude } from "./shade.js";

export const SPRITE = { width: 96, height: 96 } as const;

/** What a pixel is made of. Colour is decided later, from this plus the light. */
const MAT = {
  none: 0,
  body: 1,
  belly: 2,
  marking: 3,
  crown: 4,
  glow: 5,
  crownRib: 6,
  keratin: 7,
} as const;

/** Which part a pixel belongs to, so a pose can sway it. */
export const PART = {
  none: 0,
  body: 1,
  head: 2,
  limb: 3,
  tail: 4,
  crown: 5,
} as const;

export interface PixelSprite {
  readonly width: number;
  readonly height: number;
  /** Hex colours; index 0 is transparent. */
  readonly palette: readonly string[];
  /** Palette index per pixel, row-major. */
  readonly pixels: Uint8Array;
  /** Part id per pixel, for animation. */
  readonly parts: Uint8Array;
  /** The row the creature stands on, so a scene can plant it on a platform. */
  readonly baseline: number;
}

export interface SpriteOptions {
  readonly mode?: PaletteMode;
  /** Draw the animal facing left, for the player's side of a battle. */
  readonly flip?: boolean;
}

interface Layout {
  readonly plan: BodyPlan;
  readonly scale: number;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ryTop: number;
  readonly ryBottom: number;
  /** +1 draws the head to the right. */
  readonly facing: number;
  /** How far a serpentine body swings above and below its centre line. */
  readonly wave: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Fit the plan's proportions into the sprite box.
 *
 * The plan's numbers are in illustration units on a canvas twice this wide, so
 * they are scaled by the species' own extent rather than by a constant: a
 * Silt-Adder is eight times longer than it is deep and a Sallowfinch is nearly
 * round, and a shared divisor would leave one of them a smear and the other a
 * dot in the middle of an empty box.
 */
function layoutFor(plan: BodyPlan, build: number, size: number, facing: number): Layout {
  const rxPlan = plan.bodyRx;
  const ryPlan = Math.max(...plan.bodyRyTop, ...plan.bodyRyBottom);
  // Everything that gets drawn, not just the trunk. A membrane sweeps back
  // behind the shoulder and a plume stands above the head; leaving either out
  // of the fit is how a wing ends up clipped by the edge of the paper.
  // A membrane counts for half its reach. Fitting the frame to its full span
  // shrank the animal underneath it to a quarter of the plate — a fish with a
  // sail — because the sail is the longest thing on the species and is also the
  // one part that can sit near the edge without being missed.
  const spanX = rxPlan * 2 + plan.headReach + plan.tailReach + (plan.crown === "membrane" ? plan.crownReach * 0.5 : 0);
  const spanY =
    plan.posture === "upright"
      ? ryPlan * 2 + plan.headReach + plan.crownReach + plan.limbReach
      : plan.posture === "serpentine"
        // A snake's height is its coil, not its girth. Fitting it to girth
        // alone left it lying flat across the frame, and a flat snake is the
        // same icon as a flat glider.
        ? ryPlan * 5.5
        : ryPlan * 2 + plan.crownReach + plan.limbReach;
  // Margin for the outline, which is drawn *outside* the shape, plus headroom
  // for the parts whose reach the spans above can only approximate.
  const margin = 4;
  const scale = Math.min((SPRITE.width - margin * 2) / spanX, (SPRITE.height - margin * 2) / spanY) * 0.9;
  const grow = lerp(0.9, 1.06, clamp01(size));

  // A gliding plan is drawn shallow in the illustration because the wing carries
  // the shape there. At sprite scale that leaves a slab on stilts, so the trunk
  // is given some depth back.
  // Deep enough not to be a slab on stilts, shallow enough not to become the
  // Quillfen — which is low-slung and deep-bodied, and which this sat 9.8%
  // away from when the glider was given the same trunk.
  const depth = plan.posture === "spread" ? 1.28 : 1;
  const rx = rxPlan * scale * grow;
  const ryTop = lerp(plan.bodyRyTop[0], plan.bodyRyTop[1], clamp01(build)) * scale * grow * depth;
  const ryBottom = lerp(plan.bodyRyBottom[0], plan.bodyRyBottom[1], clamp01(build)) * scale * grow * depth;

  // Where the trunk sits depends on what has to fit around it: an upright animal
  // needs headroom above and legroom below, a horizontal one needs nose and tail
  // room either side.
  const cx =
    plan.posture === "upright" || plan.posture === "serpentine"
      ? SPRITE.width / 2
      : SPRITE.width / 2 - facing * (plan.headReach - plan.tailReach) * scale * 0.28;
  const cy =
    plan.posture === "upright"
      ? SPRITE.height * 0.46
      : plan.posture === "spread"
        ? SPRITE.height * 0.46
        : SPRITE.height * 0.54;
  return { plan, scale: scale * grow, cx, cy, rx, ryTop, ryBottom, facing, wave: SPRITE.height * 0.2 };
}

interface Painter {
  readonly material: Bitmap;
  readonly part: Bitmap;
}

function paint(painter: Painter, draw: (target: Bitmap, index: number) => void, mat: number, part: number): void {
  // One pass fills both planes: the material bitmap carries the part bitmap
  // along as its companion, so every pixel written lands in each.
  painter.material.companion = { pixels: painter.part.pixels, index: part };
  draw(painter.material, mat);
  painter.material.companion = undefined;
}

function drawBody(p: Painter, l: Layout): void {
  const { cx, cy, rx, ryTop, ryBottom } = l;
  const bias = l.plan.bodyBias * rx * 0.5 * l.facing;
  paint(
    p,
    (t, i) => {
      // Two half-ellipses so the back and the belly can differ, which is most of
      // what separates a slab-sided fen animal from a round upright one.
      for (let y = Math.floor(cy - ryTop); y <= Math.ceil(cy + ryBottom); y++) {
        const ry = y < cy ? ryTop : ryBottom;
        const dy = (y + 0.5 - cy) / Math.max(1e-6, ry);
        if (dy * dy > 1) continue;
        const half = rx * Math.sqrt(1 - dy * dy);
        for (let x = Math.round(cx + bias - half); x < Math.round(cx + bias + half); x++) put(t, x, y, i);
      }
    },
    MAT.body,
    PART.body,
  );
}

/** The S-curve trunk a serpentine plan has instead of an ellipse. */
function drawSerpent(p: Painter, l: Layout): void {
  const { cx, cy, rx, ryTop, facing, wave } = l;
  const steps = 26;
  paint(
    p,
    (t, i) => {
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const x = cx - facing * rx + facing * rx * 2 * u;
        // A real S, sized to the frame rather than to the animal's girth. A
        // shallow bow at icon size is a bar, and a bar is what every other long
        // species also reduces to.
        const y = cy + Math.sin(u * Math.PI * 2.1 - 0.5) * wave;
        // Thickest a third of the way along, tapering to the tail: a snake's
        // mass is behind the head, not in the middle.
        const thick = ryTop * (0.72 + 0.62 * Math.sin(Math.PI * Math.min(1, u * 1.3)));
        fillEllipse(t, x, y, thick, thick, i);
      }
    },
    MAT.body,
    PART.body,
  );
}

function headAnchor(l: Layout): { x: number; y: number; r: number } {
  const { plan, cx, cy, rx, ryTop, scale, facing } = l;
  const reach = plan.headReach * scale;
  const thick = lerp(plan.headThickness[0], plan.headThickness[1], 0.5) * scale;
  if (plan.posture === "upright") {
    return { x: cx + facing * rx * 0.12, y: cy - ryTop - reach * 0.42, r: thick * 0.62 };
  }
  if (plan.posture === "serpentine") {
    // A viper's head is wider than the neck it sits on; at this scale, without
    // that flare the animal is a tube with an eye painted near one end.
    return { x: cx + facing * (rx * 0.92), y: cy + Math.sin(2.1 * Math.PI - 0.5) * l.wave, r: thick * 1.25 };
  }
  return { x: cx + facing * (rx + reach * 0.36), y: cy - ryTop * 0.42 - plan.headLift * scale * 0.5, r: thick * 0.6 };
}

function drawHead(p: Painter, l: Layout): void {
  const head = headAnchor(l);
  const { cx, cy, rx, ryTop, facing, plan, scale } = l;
  paint(
    p,
    (t, i) => {
      // Neck first, so the head is never a ball floating off the shoulder.
      const neckX = plan.posture === "upright" ? cx + facing * rx * 0.1 : cx + facing * rx * 0.72;
      const neckY = plan.posture === "upright" ? cy - ryTop * 0.7 : cy - ryTop * 0.35;
      fillTaper(t, neckX, neckY, head.x, head.y, head.r * 0.95, head.r * 0.86, i);
      fillEllipse(t, head.x, head.y, head.r * 1.18, head.r, i);
      // A snout: the difference between a face and a bead.
      const snout = plan.headThickness[0] * scale * 0.55;
      fillTaper(t, head.x, head.y + head.r * 0.18, head.x + facing * head.r * 1.5, head.y + head.r * 0.36, head.r * 0.7, snout * 0.5, i);
    },
    MAT.body,
    PART.head,
  );
}

function drawLimbs(p: Painter, l: Layout, kind: string): void {
  const { plan, cx, cy, rx, ryTop, ryBottom, scale, facing } = l;
  if (plan.limbPairs === 0 || kind === "none" || kind === "absent") return;
  const reach =
    plan.limbReach * scale * (kind === "stub" ? 0.5 : kind === "long" ? 1.35 : 1) *
    // The glider's legs are the whole difference between it and the Silt-Adder
    // once colour is gone: two long shapes lying flat, one with an undercarriage
    // and one without. Trimmed for tidiness they took the pair to under four
    // percent apart at icon size, so they keep their reach.
    // Standing tall is the glider's half of the difference: the Quillfen keeps
    // its belly near the ground, this one carries it on legs.
    (plan.posture === "spread" ? 1.2 : 1);
  // Never below two pixels: a one-pixel leg is a whisker, and at this size the
  // difference between an animal and a bug is whether it has legs you can see.
  const thick =
    Math.max(2.2, plan.limbThickness * scale * (kind === "stub" ? 1.15 : kind === "long" ? 0.85 : 1)) *
    (plan.posture === "spread" ? 1.55 : 1);
  const upright = plan.posture === "upright";
  // A single pair is still two legs. Drawing it as one centred strut gave every
  // upright species a pogo stick.
  const legs: readonly number[] = plan.limbPairs === 1 ? [-0.42, 0.42] : [-0.62, 0.58];
  // Standing on end, a second pair of limbs is a pair of arms. Drawn as more
  // legs it made the two upright species read as the same animal — the
  // silhouette test put them three percent apart, which is not a species, it is
  // a recolour. Arms are also the thing that makes an assembled creature look
  // assembled rather than moulded.
  const arms = upright && plan.limbPairs === 2;
  paint(
    p,
    (t, i) => {
      if (arms) {
        for (const side of [-1, 1]) {
          const shoulderX = cx + side * rx * 0.72;
          const shoulderY = cy - ryTop * 0.18;
          // Hung long, with hands too big for the animal — which is the Ashen
          // Lorric's own design note, and the thing that separates it from the
          // other upright species once colour and size are gone.
          const handX = shoulderX + side * reach * 0.58;
          const handY = shoulderY + reach * 0.92;
          fillTaper(t, shoulderX, shoulderY, handX, handY, thick * 0.52, thick * 0.36, i);
          fillEllipse(t, handX, handY, thick * 0.95, thick * 0.82, i);
          // Three fingers on each. At this size they are three pixels, and they
          // are the difference between a hand and a mitten.
          for (let finger = -1; finger <= 1; finger++) {
            fillTaper(
              t,
              handX,
              handY + thick * 0.4,
              handX + side * thick * 0.5 + finger * thick * 0.55,
              handY + thick * 1.5,
              thick * 0.3,
              thick * 0.2,
              i,
            );
          }
        }
      }
      const stance: readonly number[] = arms ? [-0.42, 0.42] : legs;
      for (let pair = 0; pair < stance.length; pair++) {
        const along = stance[pair] as number;
        const hipX = cx + (upright ? along * rx * 0.62 : facing * along * rx);
        const hipY = cy + ryBottom * (upright ? 0.66 : 0.62);
        const footY = hipY + reach;
        // Back legs kick backward, front legs plant forward: two straight
        // struts read as a table, not an animal.
        const swing = upright ? along * reach * 0.22 : facing * (pair === 0 ? -1 : 1) * reach * 0.22;
        fillTaper(t, hipX, hipY, hipX + swing, footY, thick * 0.62, thick * 0.46, i);
        switch (kind) {
          case "paddle":
            fillEllipse(t, hipX + swing + facing * thick * 0.5, footY, thick * 1.15, thick * 0.5, i);
            break;
          case "clawed":
            for (let c = 0; c < 3; c++) {
              const toe = hipX + swing + facing * (c - 1) * thick * 0.7;
              fillTaper(t, hipX + swing, footY - thick * 0.2, toe + facing * thick * 0.7, footY + thick * 0.25, thick * 0.34, thick * 0.2, i);
            }
            break;
          case "long":
            fillTaper(t, hipX + swing, footY, hipX + swing + facing * thick * 1.4, footY + thick * 0.2, thick * 0.34, thick * 0.3, i);
            break;
          default:
            fillEllipse(t, hipX + swing, footY, thick * 0.62, thick * 0.5, i);
        }
      }
    },
    MAT.body,
    PART.limb,
  );
}

function drawTail(p: Painter, l: Layout, kind: string): void {
  const { plan, cx, cy, rx, ryTop, ryBottom, scale, facing } = l;
  void ryTop;
  if (kind === "none" || kind === "absent" || plan.tailReach <= 0) return;
  const reach =
    plan.tailReach * scale * (kind === "stub" ? 0.42 : kind === "whip" ? 1.2 : 1) *
    // An upright animal carries its tail short and low; at full reach it points
    // straight out of the hip and reads as a lance.
    (plan.posture === "upright" ? 0.55 : 1);
  const root = Math.max(2.4, plan.tailRoot * scale * 0.5);
  // A serpent's tail is the far end of the same curve, so it starts where the
  // coil starts and leaves along it. Rooted at the trunk's mid-height like a
  // quadruped's, it came off the side of the coil as a horizontal spike.
  const serpentine = plan.posture === "serpentine";
  const baseX = cx - facing * rx * (serpentine ? 1 : 0.94);
  const baseY = serpentine
    ? cy + Math.sin(-0.5) * l.wave
    : plan.posture === "upright"
      ? cy + ryBottom * 0.35
      : cy - ryTop * 0.1;
  const tipX = baseX - facing * reach;
  const tipY = serpentine
    ? baseY + reach * 0.42
    : baseY - plan.tailLift * scale - (kind === "whip" ? reach * 0.34 : reach * 0.1);
  paint(
    p,
    (t, i) => {
      switch (kind) {
        case "fan":
          fillTaper(t, baseX, baseY, tipX, tipY, root, root * 0.5, i);
          fillTriangle(t, tipX, tipY, tipX - facing * reach * 0.34, tipY - reach * 0.5, tipX - facing * reach * 0.34, tipY + reach * 0.42, i);
          break;
        case "forked":
          fillTaper(t, baseX, baseY, tipX, tipY, root, root * 0.44, i);
          fillTaper(t, tipX, tipY, tipX - facing * reach * 0.36, tipY - reach * 0.34, root * 0.44, root * 0.16, i);
          fillTaper(t, tipX, tipY, tipX - facing * reach * 0.36, tipY + reach * 0.3, root * 0.44, root * 0.16, i);
          break;
        case "whip":
          fillTaper(t, baseX, baseY, (baseX + tipX) / 2, baseY - reach * 0.18, root, root * 0.5, i);
          fillTaper(t, (baseX + tipX) / 2, baseY - reach * 0.18, tipX, tipY, root * 0.5, Math.max(0.6, root * 0.16), i);
          break;
        default:
          fillTaper(t, baseX, baseY, tipX, tipY, root, root * 0.55, i);
      }
    },
    MAT.body,
    PART.tail,
  );
}

/**
 * The thing on the front of the animal.
 *
 * Now that armament is one of the eight measurements, the sprite has to draw
 * it: a stat the player cannot see is a stat with a physical name. Keratin gets
 * its own material so a tusk reads as bone growing out of the animal rather
 * than as more coat.
 */
function drawArmament(p: Painter, l: Layout, kind: ArmamentKind, reachCm: number): void {
  if (kind === "none" || kind === "crest" || kind === "spines" || reachCm <= 0) return;
  const head = headAnchor(l);
  const { facing } = l;
  // The measurement is in centimetres of animal; on the plate it is a fraction
  // of the head, so a big weapon on a small head still fits the frame.
  const reach = Math.min(head.r * 2.6, Math.max(2.5, head.r * 0.5 + reachCm * l.scale * 0.5));
  const thick = Math.max(1.2, head.r * 0.26);

  paint(
    p,
    (t, i) => {
      switch (kind) {
        case "tusks": {
          // Two, from the jaw corner, sweeping forward and up. Drawn as a pair
          // with the far one shorter so the head reads as having depth.
          for (const [side, len] of [
            [1, 1],
            [0.55, 0.78],
          ] as const) {
            const rootX = head.x + facing * head.r * 0.7;
            const rootY = head.y + head.r * (0.4 + (1 - side) * 0.2);
            fillTaper(t, rootX, rootY, rootX + facing * reach * len * 0.8, rootY - reach * len * 0.55, thick * side, thick * 0.28, i);
          }
          break;
        }
        case "horn": {
          // Short, thick, and off the brow. Thin and long it read as an aerial;
          // rooted on the snout it read as a party hat. A horn is a wide base
          // that tapers fast, and the base is what makes it look grown.
          const rootX = head.x + facing * head.r * 0.28;
          const rootY = head.y - head.r * 0.62;
          const rise = Math.min(reach * 0.62, head.r * 1.5);
          fillTaper(t, rootX, rootY, rootX + facing * rise * 0.5, rootY - rise, thick * 2.2, thick * 0.35, i);
          break;
        }
        case "fangs": {
          for (const offset of [0.55, 1.05] as const) {
            const rootX = head.x + facing * head.r * offset;
            fillTaper(t, rootX, head.y + head.r * 0.35, rootX + facing * reach * 0.12, head.y + head.r * 0.35 + reach * 0.55, thick * 0.6, thick * 0.2, i);
          }
          break;
        }
        case "beak": {
          // A hard wedge over the snout, upper mandible only — the lower jaw is
          // the animal's own coat and reads better left alone.
          const tipX = head.x + facing * (head.r * 1.4 + reach * 0.5);
          fillTriangle(t, head.x + facing * head.r * 0.5, head.y - head.r * 0.1, head.x + facing * head.r * 0.5, head.y + head.r * 0.42, tipX, head.y + head.r * 0.2, i);
          break;
        }
        default:
          break;
      }
    },
    MAT.keratin,
    PART.head,
  );
}

function drawCrown(p: Painter, l: Layout, kind: string, display: string): void {
  const { plan, cx, cy, rx, ryTop, scale, facing } = l;
  if (plan.crown === "none" || plan.crownReach <= 0) return;
  // The gate vocabulary the illustration renderer reads means the same here: a
  // suppressed crest is a small crest, not a missing one.
  const suppressed = /naked|absent|none|hidden|smooth|plain/.test(kind) || /naked|absent|none|hidden/.test(display);
  const grand = /grand|bold|full|high|display/.test(display);
  const reach = plan.crownReach * scale * (suppressed ? 0.22 : grand ? 1.15 : 0.8);
  if (reach < 1) return;
  const count = plan.crownCount;
  const topY = cy - ryTop;
  if (plan.crown === "membrane") {
    // Drawn as its own pass so the ribs sit on top of the web rather than
    // being swallowed by it.
    const rootX = cx + facing * rx * 0.28;
    const rootY = topY + 1;
    const tipX = rootX - facing * reach * 0.66;
    const tipY = rootY - reach * 0.6;
    const trailX = rootX - facing * reach * 0.92;
    const trailY = rootY + reach * 0.12;
    const ribs = 4;
    paint(
      p,
      (t, i) => {
        for (let k = 0; k <= ribs; k++) {
          const u = k / ribs;
          const dip = k % 2 === 1 ? 0.88 : 1;
          const x = rootX + (tipX + (trailX - tipX) * u - rootX) * dip;
          const y = rootY + (tipY + (trailY - tipY) * u - rootY) * dip;
          fillTaper(t, rootX, rootY, x, y, Math.max(1.2, reach * 0.05), Math.max(0.8, reach * 0.03), i);
        }
      },
      MAT.crownRib,
      PART.crown,
    );
  }

  paint(
    p,
    (t, i) => {
      switch (plan.crown) {
        case "membrane": {
          // A wing, fanned from the shoulder. A single triangle read as a paper
          // dart taped to the animal's back; what makes a membrane look like a
          // membrane is the scalloped trailing edge between its ribs, and the
          // ribs showing through it.
          const rootX = cx + facing * rx * 0.28;
          const rootY = topY + 1;
          const tipX = rootX - facing * reach * 0.66;
          const tipY = rootY - reach * 0.6;
          const trailX = rootX - facing * reach * 0.92;
          const trailY = rootY + reach * 0.12;
          const ribs = 4;
          const point = (k: number): { x: number; y: number } => {
            const u = k / ribs;
            // Scalloped: every other web dips back toward the root, which is the
            // read of skin stretched between fingers.
            const dip = k % 2 === 1 ? 0.88 : 1;
            return {
              x: rootX + (tipX + (trailX - tipX) * u - rootX) * dip,
              y: rootY + (tipY + (trailY - tipY) * u - rootY) * dip,
            };
          };
          for (let k = 0; k < ribs; k++) {
            const a = point(k);
            const b = point(k + 1);
            fillTriangle(t, rootX, rootY, a.x, a.y, b.x, b.y, i);
          }
          break;
        }
        case "spines": {
          // Sat on a low ridge so the row reads as one crest along the back
          // rather than as loose teeth balanced on a curve.
          for (let s = 0; s < count; s++) {
            const u = count === 1 ? 0.5 : s / (count - 1);
            const x = cx + facing * lerp(-rx * 0.86, rx * 0.76, u);
            const arch = Math.sin(u * Math.PI);
            const h = reach * (0.32 + 0.68 * arch);
            const w = Math.max(1.3, reach * 0.13);
            fillEllipse(t, x, topY + 1, w, Math.max(1.2, reach * 0.1), i);
            fillTriangle(t, x - w, topY + 1, x + w, topY + 1, x + facing * w * 0.5, topY - h, i);
          }
          break;
        }
        case "fronds": {
          // Gills on stalks, swept back and tipped with a bulb. Straight
          // vertical stalks read as aerials; the sweep and the bulb read as
          // something that grew.
          for (let s = 0; s < count; s++) {
            const u = count === 1 ? 0.5 : s / (count - 1);
            const x = cx + facing * lerp(-rx * 0.34, rx * 0.5, u);
            const h = reach * (0.62 + 0.3 * Math.sin(u * Math.PI));
            const tipX = x - facing * h * 0.3;
            const tipY = topY - h * 0.78;
            fillTaper(t, x, topY + 2, tipX, tipY, Math.max(1.3, reach * 0.12), Math.max(1, reach * 0.06), i);
          }
          break;
        }
        case "plume": {
          const head = headAnchor(l);
          for (let s = 0; s < count; s++) {
            const u = count === 1 ? 0.5 : s / (count - 1);
            const spread = (u - 0.5) * 1.5;
            fillTaper(
              t,
              head.x - facing * head.r * 0.3,
              head.y - head.r * 0.7,
              head.x - facing * (head.r * 0.3 + reach * spread * 0.5),
              head.y - head.r * 0.7 - reach * (0.65 + 0.35 * Math.cos(spread)),
              Math.max(0.9, reach * 0.14),
              Math.max(0.6, reach * 0.07),
              i,
            );
          }
          break;
        }
        default:
          break;
      }
    },
    MAT.crown,
    PART.crown,
  );
}

/** The pale underside nearly every animal has, and the thing that sells volume. */
function drawBelly(p: Painter, l: Layout): void {
  const { cx, cy, rx, ryBottom, plan, facing } = l;
  if (plan.posture === "serpentine") return;
  const bias = plan.bodyBias * rx * 0.5 * facing;
  for (let y = Math.floor(cy); y <= Math.ceil(cy + ryBottom); y++) {
    for (let x = Math.floor(cx + bias - rx); x <= Math.ceil(cx + bias + rx); x++) {
      if (p.material.pixels[y * p.material.width + x] !== MAT.body) continue;
      if (p.part.pixels[y * p.part.width + x] !== PART.body) continue;
      const dy = (y - cy) / Math.max(1e-6, ryBottom);
      const dx = (x - cx - bias) / Math.max(1e-6, rx);
      // A parabola, not a horizontal cut. Counter-shading follows the barrel of
      // the animal — high under the ribs, dropping away at both ends — and a
      // straight boundary put a grey rectangle across every flank.
      const boundary = 0.26 + dx * dx * 0.52;
      if (dy <= boundary) continue;
      // Two rows of dither at the edge so the pale underside washes into the
      // coat instead of stopping at a line. A checker is the whole technique.
      const fade = (dy - boundary) * Math.max(1e-6, ryBottom);
      if (fade < 2 && (x + y) % 2 === 0) continue;
      put(p.material, x, y, MAT.belly);
    }
  }
}

/**
 * Markings, clipped to the body.
 *
 * Read from the same trait word the illustration caption prints, so a creature
 * described as "banded" is banded here too — the picture and the label cannot
 * disagree, because they are reading the same string.
 */
function drawMarkings(p: Painter, l: Layout, markings: string, rng: () => number): void {
  const { cx, cy, rx, ryTop, ryBottom, facing } = l;
  const box = bounds(p.material);
  if (!box) return;
  const onBody = (x: number, y: number): boolean => {
    const m = at(p.material, x, y);
    if (m !== MAT.body && m !== MAT.belly) return false;
    // Trunk and head only. Running a band down a leg turned every striped
    // animal into a deckchair.
    const part = at(p.part, x, y);
    return part === PART.body || part === PART.head;
  };
  const mark = (x: number, y: number): void => {
    if (onBody(x, y)) put(p.material, x, y, MAT.marking);
  };
  const has = (word: string): boolean => markings.includes(word);

  if (has("band") || has("barred") || has("stripe")) {
    const bands = 4;
    const width = Math.max(2, Math.round(rx * 0.22));
    for (let b = 0; b < bands; b++) {
      const x0 = Math.round(cx - rx + ((b + 0.6) * (rx * 2)) / bands);
      for (let w = 0; w < width; w++) {
        for (let y = box.y; y < box.y + box.height; y++) mark(x0 + w, y);
      }
    }
  }
  if (has("spot") || has("fleck") || has("dot")) {
    const count = has("fleck") ? 16 : 10;
    const radius = has("fleck") ? 1.1 : 1.8;
    for (let s = 0; s < count; s++) {
      const x = Math.round(cx + (rng() - 0.5) * rx * 1.7);
      const y = Math.round(cy + (rng() - 0.5) * (ryTop + ryBottom) * 1.05);
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          mark(x + dx, y + dy);
        }
      }
    }
  }
  if (has("ring") || has("eyespot")) {
    for (let s = 0; s < 4; s++) {
      const x = Math.round(cx + (rng() - 0.5) * rx * 1.4);
      const y = Math.round(cy + (rng() - 0.5) * (ryTop + ryBottom) * 0.8);
      // Only if the whole ring lands on the animal. A ring half off the edge is
      // not a marking, it is litter next to the sprite.
      let room = true;
      for (let dy = -3; dy <= 3 && room; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (!onBody(x + dx, y + dy)) {
            room = false;
            break;
          }
        }
      }
      if (!room) continue;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const r2 = dx * dx + dy * dy;
          if (r2 <= 9 && r2 >= 3) mark(x + dx, y + dy);
        }
      }
    }
  }
  if (has("diamond")) {
    for (let s = 0; s < 5; s++) {
      const x = Math.round(cx - rx * 0.8 + (s * rx * 1.6) / 4);
      const y = Math.round(cy - ryTop * 0.2);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          mark(x + dx, y + dy);
        }
      }
    }
  }
  if (has("ray") || has("tick")) {
    for (let s = 0; s < 7; s++) {
      const x = Math.round(cx - rx * 0.85 + (s * rx * 1.7) / 6);
      for (let d = 0; d < 4; d++) mark(x, Math.round(cy - ryTop * 0.55 + d));
    }
  }
  if (has("mask")) {
    const head = headAnchor(l);
    for (let y = Math.round(head.y - head.r * 1.2); y <= Math.round(head.y + head.r * 0.5); y++) {
      for (let x = Math.round(head.x - head.r * 1.3); x <= Math.round(head.x + head.r * 1.6); x++) {
        if (at(p.part, x, y) === PART.head && onBody(x, y)) put(p.material, x, y, MAT.marking);
      }
    }
  }
  if (has("collar")) {
    const neckX = cx + facing * rx * 0.66;
    for (let w = 0; w < 3; w++) {
      for (let y = box.y; y < box.y + box.height; y++) mark(Math.round(neckX + facing * w), y);
    }
  }
  if (has("lap") || has("scale")) {
    for (let y = box.y; y < box.y + box.height; y += 3) {
      for (let x = box.x + (y % 6 === 0 ? 0 : 2); x < box.x + box.width; x += 4) mark(x, y);
    }
  }
}

/**
 * Which colour each material takes at each of the six light levels.
 *
 * Materials do not share a ramp because they are not made of the same thing: a
 * marking is pigment sitting *on* the coat and barely changes with the light,
 * while keratin is a hard surface with a sharp specular and almost no midtone.
 */
const RAMPS: Readonly<Record<number, readonly number[]>> = {
  [MAT.body]: [SLOT.specular, SLOT.highlight, SLOT.light, SLOT.base, SLOT.shade, SLOT.core],
  // Deliberately refuses to go as dark as the coat. That is the whole point of
  // counter-shading: the pale underside cancels the shadow the body casts on
  // itself. Letting it follow the light into the core rungs put a dark patch
  // under every animal, which is the opposite of what the marking is for.
  [MAT.belly]: [SLOT.specular, SLOT.belly, SLOT.belly, SLOT.belly, SLOT.bellyShade, SLOT.bellyShade],
  [MAT.marking]: [SLOT.marking, SLOT.marking, SLOT.marking, SLOT.marking, SLOT.markingDark, SLOT.markingDark],
  [MAT.crown]: [
    SLOT.specular,
    SLOT.crownTissue,
    SLOT.crownTissue,
    SLOT.crownTissueDark,
    SLOT.crownTissueDark,
    SLOT.core,
  ],
  [MAT.crownRib]: [
    SLOT.crownTissueDark,
    SLOT.crownTissueDark,
    SLOT.core,
    SLOT.core,
    SLOT.core,
    SLOT.core,
  ],
  [MAT.keratin]: [SLOT.specular, SLOT.keratin, SLOT.keratin, SLOT.keratin, SLOT.keratinShade, SLOT.keratinShade],
  [MAT.glow]: [SLOT.glow, SLOT.glow, SLOT.glow, SLOT.glow, SLOT.glow, SLOT.glow],
};

/**
 * How near each part is to the viewer.
 *
 * Only the ordering matters: it decides which side of a seam gets the occlusion
 * shadow when two parts touch.
 */
function depthOf(part: number): number {
  switch (part) {
    case PART.crown:
      return 0;
    case PART.tail:
      return 1;
    case PART.body:
      return 2;
    case PART.head:
      return 3;
    case PART.limb:
      return 4;
    default:
      return 2;
  }
}

/**
 * Give the hide a material.
 *
 * Until this pass, plate, scale, fur and bare skin were the same flat colour —
 * which meant the single most important defensive measurement in the game was
 * invisible, and every animal read as moulded from one substance. It runs over
 * the composed pixels rather than the material map, because it is decoration on
 * a lit surface and must not disturb the lighting that put it there.
 *
 * Deterministic: no dice. The same animal textures the same way every time, or
 * the sprite cache would hand back two different creatures for one genome.
 */
function texture(
  sprite: Bitmap,
  parts: Bitmap,
  levels: Uint8Array,
  kind: HideKind,
  box: { x: number; y: number; width: number; height: number },
): void {
  // The trunk only. Running plate bands across the skull made the animal read
  // as striped rather than segmented, and fur on a face reads as stubble.
  const onBody = (x: number, y: number): boolean => at(parts, x, y) === PART.body;
  const lit = (x: number, y: number): number => levels[y * sprite.width + x] as number;
  const paintAt = (x: number, y: number, slot: number): void => {
    if (!onBody(x, y)) return;
    if (at(sprite, x, y) === EMPTY) return;
    put(sprite, x, y, slot);
  };

  switch (kind) {
    case "plated": {
      // Bands across the barrel, each with a lit edge above it. Plate reads
      // because light catches the lip of every segment.
      for (let y = box.y + 3; y < box.y + box.height - 2; y += 5) {
        for (let x = box.x; x < box.x + box.width; x++) {
          if (!onBody(x, y)) continue;
          paintAt(x, y, SLOT.shade);
          if (lit(x, y) <= 3) paintAt(x, y - 1, SLOT.light);
        }
      }
      break;
    }
    case "scaled": {
      // An offset lattice — every other row shifted by half a cell, which is
      // what makes a dot grid read as overlapping scales rather than as spots.
      for (let y = box.y + 2; y < box.y + box.height - 1; y += 2) {
        const stagger = ((y - box.y) / 2) % 2 === 0 ? 0 : 2;
        for (let x = box.x + stagger; x < box.x + box.width; x += 4) {
          if (lit(x, y) >= 5) continue;
          paintAt(x, y, SLOT.midshade);
        }
      }
      break;
    }
    case "furred": {
      // Short strokes lying along the body, denser in shadow. Fur has no hard
      // edges, so this deliberately never touches the contour.
      for (let y = box.y + 2; y < box.y + box.height - 2; y += 3) {
        for (let x = box.x + ((y * 3) % 4); x < box.x + box.width; x += 5) {
          const level = lit(x, y);
          if (level <= 1) continue;
          paintAt(x, y, level >= 4 ? SLOT.core : SLOT.midshade);
          paintAt(x, y + 1, level >= 4 ? SLOT.shade : SLOT.base);
        }
      }
      break;
    }
    case "slimed": {
      // Wet things have a hard specular and almost nothing else. A few blobs on
      // the lit side, and the rest left smooth.
      for (let y = box.y + 2; y < box.y + Math.round(box.height * 0.5); y += 3) {
        for (let x = box.x + 2; x < box.x + box.width - 2; x += 7) {
          if (lit(x, y) > 2) continue;
          paintAt(x, y, SLOT.specular);
          paintAt(x + 1, y, SLOT.specular);
        }
      }
      break;
    }
    case "naked": {
      // Bare skin has no grain, but it is not featureless: it takes a broad
      // soft sheen across the top of the barrel, and it creases where it folds.
      // Left genuinely blank it was the one hide that read as unfinished.
      const sheen = box.y + Math.round(box.height * 0.28);
      for (let x = box.x + 2; x < box.x + box.width - 2; x++) {
        if (lit(x, sheen) <= 2) paintAt(x, sheen, SLOT.highlight);
      }
      for (let y = box.y + Math.round(box.height * 0.55); y < box.y + box.height - 2; y += 4) {
        for (let x = box.x + 3; x < box.x + box.width - 3; x += 9) {
          paintAt(x, y, SLOT.midshade);
          paintAt(x + 1, y, SLOT.midshade);
        }
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Slide the drawn content into the middle of the frame, a pixel at a time.
 *
 * Returns the shift, because the face and the lantern are placed from the
 * layout's own coordinates after this runs — and an eye that does not move with
 * the head it belongs to lands on the shoulder.
 */
function recentre(painter: Painter): { dx: number; dy: number } {
  const box = bounds(painter.material);
  if (!box) return { dx: 0, dy: 0 };
  const dx = Math.round((SPRITE.width - box.width) / 2 - box.x);
  const dy = Math.round((SPRITE.height - box.height) / 2 - box.y);
  if (dx === 0 && dy === 0) return { dx, dy };
  for (const plane of [painter.material, painter.part]) {
    const moved = new Uint8Array(plane.pixels.length);
    for (let y = 0; y < SPRITE.height; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= SPRITE.height) continue;
      for (let x = 0; x < SPRITE.width; x++) {
        const tx = x + dx;
        if (tx < 0 || tx >= SPRITE.width) continue;
        moved[ty * SPRITE.width + tx] = plane.pixels[y * SPRITE.width + x] as number;
      }
    }
    plane.pixels.set(moved);
  }
  return { dx, dy };
}

export function renderSprite(phenotype: Phenotype, map: GeneMap, options: SpriteOptions = {}): PixelSprite {
  const plan = planFor(phenotype.species);
  const trait = (key: string | undefined, fallback = "none"): string =>
    key === undefined ? fallback : (phenotype.traits[key] ?? fallback);
  const rng = createRng(phenotypeFingerprint(phenotype));
  const facing = options.flip ? -1 : 1;

  const vigour = map.polygenicTraits.find((t) => t.id === "vigour");
  const size = vigour
    ? clamp01(((phenotype.stats["vigour"] ?? vigour.min) - vigour.min) / Math.max(1e-6, vigour.max - vigour.min))
    : 0.5;
  const layout = layoutFor(plan, phenotype.values[plan.traits.build] ?? 0.5, size, facing);

  // The same measurements combat reads. The sprite draws them, which is the
  // only way "the stat block is the animal" is true rather than a slogan.
  const body: Morphology = measure(phenotype, map);

  const painter: Painter = {
    material: createBitmap(SPRITE.width, SPRITE.height),
    part: createBitmap(SPRITE.width, SPRITE.height),
  };

  // Back to front. The crown goes down before the trunk so a membrane or a
  // frond reads as growing out of the back rather than pasted onto it.
  drawTail(painter, layout, trait(plan.traits.tail, "fan"));
  drawCrown(painter, layout, trait(plan.traits.crown, "even"), trait(plan.traits.display, "none"));
  drawLimbs(painter, layout, trait(plan.traits.limbs, "paddle"));
  if (plan.posture === "serpentine") drawSerpent(painter, layout);
  else drawBody(painter, layout);
  drawHead(painter, layout);
  drawArmament(painter, layout, body.armamentKind, body.armament);
  drawBelly(painter, layout);
  drawMarkings(painter, layout, trait(plan.traits.markings, "none"), () => rng.next());

  // Whatever the fit predicted, the drawing is the authority. Shifting the
  // finished material into the middle of the frame is a pure translation, so it
  // cannot blur a pixel, and it guarantees the outline has somewhere to go.
  const shift = recentre(painter);

  const lit = light(painter.material, MAT.none);
  const levels = lit.levels;
  // Seams before colour: a leg drawn in the same coat as the flank behind it is
  // invisible until the contact between them is darkened.
  occlude(painter.part, levels, depthOf);
  // Dither the band edges before any of it becomes colour.
  dither(painter.material, levels, MAT.none);
  const palette = resolvePalette({
    coat: phenotype.colour,
    hueArc: map.species.palette.hue,
    ...(options.mode ? { mode: options.mode } : {}),
  });
  const ramp = spriteRamp(palette);

  const pixels = new Uint8Array(SPRITE.width * SPRITE.height);
  for (let i = 0; i < pixels.length; i++) {
    const mat = painter.material.pixels[i] as number;
    if (mat === MAT.none) continue;
    const rungs = RAMPS[mat] ?? (RAMPS[MAT.body] as readonly number[]);
    pixels[i] = rungs[levels[i] as number] as number;
  }
  const sprite: Bitmap = { width: SPRITE.width, height: SPRITE.height, pixels };

  // The face goes on after shading. It must not be lit — a shaded eye reads as
  // a smudge — and it is the single feature that decides whether the player
  // sees a creature or a shape.
  //
  // Four marks, and each does a different job: a brow makes the animal *look*
  // at something rather than merely have an eye; the sclera gives the pupil
  // somewhere to sit; the catchlight stops it reading as a hole; the nostril
  // and the mouth line turn the front of the head into a face.
  const head = headAnchor(layout);
  const hx = head.x + shift.dx;
  const hy = head.y + shift.dy;
  const eyeX = Math.round(hx + facing * head.r * 0.4);
  const eyeY = Math.round(hy - head.r * 0.24);
  const eyeR = Math.max(1.6, head.r * 0.36);

  // Brow: one dark stroke above and slightly behind the eye. It is two or three
  // pixels and it does more for the animal's character than anything else here.
  for (let step = -1; step <= 2; step++) {
    const bx = Math.round(eyeX - facing * step * 0.9);
    const by = Math.round(eyeY - eyeR - 0.4 + Math.abs(step) * 0.35);
    if (at(sprite, bx, by) !== EMPTY) put(sprite, bx, by, SLOT.outlineDark);
  }

  fillEllipse(sprite, eyeX, eyeY, eyeR, eyeR, SLOT.eyeWhite);
  fillEllipse(sprite, eyeX + facing * eyeR * 0.26, eyeY + eyeR * 0.14, eyeR * 0.66, eyeR * 0.7, SLOT.eyeDark);
  put(sprite, Math.round(eyeX - facing * eyeR * 0.36), Math.round(eyeY - eyeR * 0.36), SLOT.eyeWhite);

  // Nostril: a single dark pixel near the tip of the snout.
  const snoutX = Math.round(hx + facing * head.r * 1.5);
  const snoutY = Math.round(hy + head.r * 0.16);
  if (at(sprite, snoutX, snoutY) !== EMPTY) put(sprite, snoutX, snoutY, SLOT.outlineDark);

  // Mouth: a line along the underside of the snout, with the corner turned down
  // a pixel so the head stops being a bean.
  const mouthY = Math.round(hy + head.r * 0.56);
  const mouthFrom = Math.round(hx + facing * head.r * 0.22);
  const mouthTo = Math.max(2, Math.round(head.r * 1.35));
  for (let step = 0; step <= mouthTo; step++) {
    const mx = mouthFrom + facing * step;
    const my = mouthY + (step === mouthTo ? 1 : 0);
    const current = at(sprite, mx, my);
    if (current !== EMPTY && current !== SLOT.outlineDark && current !== SLOT.outlineLit) {
      put(sprite, mx, my, SLOT.mouth);
    }
  }

  if (/lantern|glow/.test(trait(plan.traits.glow))) {
    // A lit organ, not a tint: a couple of pixels that ignore the light model.
    const gx = Math.round(layout.cx - facing * layout.rx * 0.2) + shift.dx;
    const gy = Math.round(layout.cy + layout.ryBottom * 0.25) + shift.dy;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 1) continue;
        if (at(sprite, gx + dx, gy + dy) !== EMPTY) put(sprite, gx + dx, gy + dy, SLOT.glow);
      }
    }
  }

  const skin = bounds(painter.material);
  if (skin) texture(sprite, painter.part, levels, body.hideKind, skin);

  // Contour last, and coloured by what it wraps.
  contour(sprite, levels, painter.material, SLOT.outlineDark, SLOT.outlineLit);

  const box = bounds(sprite);
  return {
    width: SPRITE.width,
    height: SPRITE.height,
    palette: ramp.colours.slice(0, RAMP_SIZE),
    pixels: sprite.pixels,
    parts: painter.part.pixels,
    baseline: box ? box.y + box.height : SPRITE.height - 2,
  };
}
