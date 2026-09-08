/**
 * The Quillfen rig.
 *
 * Nine part slots, each driven by named loci (§6.3):
 *
 *   body          BUILD (continuous) + vigour ceiling as a size scalar
 *   head          BUILD
 *   limbs         LIMB       paddle / clawed / stub
 *   tail          TAIL       fan / whip / fan+whip / none
 *   dorsal        DORSAL     quilled / smooth / crowned
 *   crest         CREST      grand / plain / hidden  (sex-limited)
 *   marking layer MARK       spots / bands / both / veil / none
 *   palette       HUE, SAT, BUILD
 *   size scalar   vigour (polygenic)
 *
 * The parts are generated rather than authored so that continuous loci produce
 * continuous variation. Every generator takes explicit anchors, so hand-drawn
 * art can replace any one of them later without disturbing the others.
 *
 * The silhouette (§6.4) is carried by four things: the low broad body, the
 * fanned gill fronds, the dorsal ridge, and the tail. Those four are drawn
 * large and kept distinct on purpose — they are what has to survive being
 * reduced to 32 black pixels.
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

export const CANVAS = { width: 240, height: 150 } as const;
const BASELINE = 128;

/** Step counts scale with detail; shape and proportion never do. */
function steps(input: RigInput, full: number): number {
  return input.detail === "thumb" ? Math.max(4, Math.round(full / 2)) : full;
}

export interface RigInput {
  /** BUILD locus value, 0 slight to 1 heavy. */
  readonly build: number;
  /** Sampling density. Thumbnails halve it; nothing else changes. */
  readonly detail: DetailLevel;
  /** Vigour ceiling normalised to 0-1: the size scalar. */
  readonly size: number;
  readonly dorsal: string;
  readonly limbs: string;
  readonly tail: string;
  readonly markings: string;
  readonly crest: string;
  readonly tusk: string;
  readonly sheen: string;
  readonly lantern: string;
  readonly rng: Rng;
}

export interface Anchors {
  readonly bodyCentre: Vec2;
  readonly neck: Vec2;
  readonly snout: Vec2;
  readonly tailBase: Vec2;
  readonly foreLimb: Vec2;
  readonly hindLimb: Vec2;
  readonly ridgeStart: Vec2;
  readonly ridgeEnd: Vec2;
  readonly gillRoot: Vec2;
  readonly eye: Vec2;
  readonly jaw: Vec2;
}

/** Anchors move with build and size, so every part stays attached. */
export function anchorsFor(input: RigInput): Anchors {
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  const depth = lerp(0, 6, clamp01(input.build));
  const at = (x: number, y: number): Vec2 =>
    v(120 + (x - 120) * scale, BASELINE - (BASELINE - y) * scale);
  return {
    bodyCentre: at(116, 80 - depth * 0.3),
    neck: at(154, 72 - depth * 0.4),
    snout: at(210, 74),
    tailBase: at(62, 82 - depth * 0.2),
    foreLimb: at(146, 96 + depth * 0.4),
    hindLimb: at(90, 98 + depth * 0.4),
    ridgeStart: at(76, 62 - depth * 0.6),
    ridgeEnd: at(154, 56 - depth * 0.6),
    gillRoot: at(158, 60 - depth * 0.4),
    eye: at(188, 66),
    jaw: at(198, 80),
  };
}

export function bodyOutline(input: RigInput, anchors: Anchors): Ring {
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  return bodyRing({
    cx: anchors.bodyCentre.x,
    cy: anchors.bodyCentre.y,
    rx: 54 * scale,
    ryTop: lerp(19, 27, clamp01(input.build)) * scale,
    ryBottom: lerp(23, 38, clamp01(input.build)) * scale,
    // Mass sits toward the tail: this is a creature that sculls, not sprints.
    bias: -0.16,
    steps: steps(input, 48),
  });
}

export function headShape(input: RigInput, anchors: Anchors): Ring {
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  const spine = arcSpine(anchors.neck, v((anchors.neck.x + anchors.snout.x) / 2, anchors.neck.y - 4), anchors.snout, steps(input, 10));
  const thick = lerp(19, 24, clamp01(input.build)) * scale;
  return taperedRing(spine, (t) => thick * (1 - 0.72 * t * t));
}

/** The axolotl signature: three feathered gill fronds sweeping back over the neck. */
export function gillFronds(input: RigInput, anchors: Anchors): Ring[] {
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  // Spread wide and kept narrow: three fronds drawn close together merge into a
  // single fin, and the fronds are the whole reason this animal reads as a
  // neotenic salamander rather than a generic lizard. Each root is offset along
  // the neck as well, so they separate at the base too.
  const angles = [-1.32, -0.82, -0.3];
  return angles.map((angle, index) => {
    const reach = (34 - index * 3) * scale;
    const root = v(anchors.gillRoot.x - index * 7 * scale, anchors.gillRoot.y + index * 2.5 * scale);
    const tip = v(root.x - Math.cos(angle) * reach * 0.85, root.y + Math.sin(angle) * reach);
    const control = v(root.x + 5 * scale, root.y + Math.sin(angle) * reach * 0.45);
    const spine = arcSpine(root, control, tip, steps(input, 8));
    return taperedRing(spine, (t) => (2.4 + 3.6 * Math.sin(Math.PI * t)) * scale);
  });
}

export function dorsalRidge(input: RigInput, anchors: Anchors): Ring {
  const spine = arcSpine(
    anchors.ridgeStart,
    v((anchors.ridgeStart.x + anchors.ridgeEnd.x) / 2, anchors.ridgeStart.y - 10),
    anchors.ridgeEnd,
    steps(input, 20),
  );
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  switch (input.dorsal) {
    case "crowned":
      // A novel allele has to be unmistakable in a 32x32 icon, or discovering
      // one is a line of text rather than a moment. The silhouette test holds
      // the crown to a measurable distance from the common forms.
      return ridgeRing(spine, 9, 38 * scale, 5);
    case "quilled":
      return ridgeRing(spine, 7, 19 * scale, 4);
    default:
      // Smooth still has a ridge; it is just a low continuous fin, drawn by a
      // width profile rather than a sawtooth.
      return taperedRing(spine, (t) => 4 * scale * Math.sin(Math.PI * t) + 1.5);
  }
}

export function tailShape(input: RigInput, anchors: Anchors): Ring {
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  const base = anchors.tailBase;
  switch (input.tail) {
    case "whip": {
      const tip = v(base.x - 58 * scale, base.y - 20 * scale);
      const spine = arcSpine(base, v(base.x - 30 * scale, base.y + 4), tip, steps(input, 14));
      // The taper floor is load-bearing, not cosmetic: below ~3.5 units the tip
      // breaks off in the 32x32 silhouette and the creature reads as two
      // objects. The silhouette test catches it if this ever drifts.
      return taperedRing(spine, (t) => lerp(15, 3.6, t ** 0.8) * scale);
    }
    case "fan+whip": {
      const tip = v(base.x - 62 * scale, base.y - 12 * scale);
      const spine = arcSpine(base, v(base.x - 28 * scale, base.y + 8), tip, steps(input, 16));
      // Broad at the root, whipped at the tip: both alleles visibly present.
      // Same taper floor as the whip, for the same silhouette reason.
      return taperedRing(spine, (t) => lerp(22, 4, t ** 1.7) * scale);
    }
    case "none": {
      const tip = v(base.x - 26 * scale, base.y);
      const spine = arcSpine(base, v(base.x - 14 * scale, base.y + 2), tip, steps(input, 8));
      return taperedRing(spine, (t) => lerp(16, 9, t) * scale);
    }
    default: {
      // fan
      const tip = v(base.x - 48 * scale, base.y - 4 * scale);
      const spine = arcSpine(base, v(base.x - 24 * scale, base.y + 2), tip, steps(input, 14));
      return taperedRing(spine, (t) => lerp(16, 24, Math.sin((t * Math.PI) / 2)) * scale);
    }
  }
}

export function limbShapes(input: RigInput, anchors: Anchors): { rings: Ring[]; claws: Ring[] } {
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  const rings: Ring[] = [];
  const claws: Ring[] = [];

  for (const [index, anchor] of [anchors.hindLimb, anchors.foreLimb].entries()) {
    const forward = index === 1 ? 1 : -1;
    switch (input.limbs) {
      case "stub": {
        const foot = v(anchor.x + forward * 3 * scale, anchor.y + 16 * scale);
        rings.push(taperedRing(arcSpine(anchor, v(anchor.x, anchor.y + 9 * scale), foot, steps(input, 6)), (t) => lerp(9, 7, t) * scale));
        break;
      }
      case "clawed": {
        const foot = v(anchor.x + forward * 9 * scale, BASELINE - 2);
        const spine = arcSpine(anchor, v(anchor.x + forward * 2 * scale, anchor.y + 14 * scale), foot, steps(input, 8));
        rings.push(taperedRing(spine, (t) => lerp(8, 3.2, t) * scale));
        for (let c = -1; c <= 1; c++) {
          const tip = v(foot.x + forward * (5 + c * 1.5) * scale, foot.y + (2.5 + Math.abs(c)) * scale);
          claws.push([
            v(foot.x, foot.y - 2 * scale),
            tip,
            v(foot.x + forward * 1.5 * scale, foot.y + 2 * scale),
          ]);
        }
        break;
      }
      default: {
        // paddle
        const foot = v(anchor.x + forward * 6 * scale, BASELINE - 3);
        const spine = arcSpine(anchor, v(anchor.x + forward * scale, anchor.y + 13 * scale), foot, steps(input, 8));
        rings.push(taperedRing(spine, (t) => lerp(9, 12.5, t ** 1.6) * scale));
        break;
      }
    }
  }
  return { rings, claws };
}

export function crestShape(input: RigInput, anchors: Anchors): Ring | undefined {
  if (input.crest !== "grand") return undefined;
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  const root = v(anchors.neck.x + 12 * scale, anchors.neck.y - 12 * scale);
  const spine = arcSpine(root, v(root.x + 16 * scale, root.y - 20 * scale), v(root.x + 34 * scale, root.y - 6 * scale), steps(input, 12));
  return ridgeRing(spine, 5, 16 * scale, 3);
}

export function tuskShape(input: RigInput, anchors: Anchors): Ring | undefined {
  if (input.tusk !== "tusked") return undefined;
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  return [
    v(anchors.jaw.x - 4 * scale, anchors.jaw.y - 3 * scale),
    v(anchors.jaw.x + 3 * scale, anchors.jaw.y + 11 * scale),
    v(anchors.jaw.x + 5 * scale, anchors.jaw.y - 2 * scale),
  ];
}

/**
 * The marking layer. Positions come from a seeded RNG so a given creature's
 * spots are always in the same place, but two creatures with the same markings
 * genotype are not identical twins.
 */
export function markingMarks(input: RigInput, anchors: Anchors): Mark[] {
  const marks: Mark[] = [];
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  const has = (name: string): boolean => input.markings.split("+").includes(name);

  if (has("spots")) {
    for (let i = 0; i < 11; i++) {
      const x = anchors.bodyCentre.x + (input.rng.next() - 0.5) * 96 * scale;
      const y = anchors.bodyCentre.y + (input.rng.next() - 0.45) * 52 * scale;
      marks.push({
        shape: { kind: "circle", c: v(x, y), r: (2.6 + input.rng.next() * 3.4) * scale },
        fill: "marking",
        clipToBody: true,
        opacity: 0.85,
        hatch: "dots",
      });
    }
  }

  if (has("bands")) {
    for (let i = 0; i < 5; i++) {
      const x = anchors.bodyCentre.x - 42 * scale + i * 21 * scale + (input.rng.next() - 0.5) * 5;
      const width = (5 + input.rng.next() * 4) * scale;
      marks.push({
        shape: {
          kind: "path",
          points: [
            v(x - width, anchors.bodyCentre.y - 40 * scale),
            v(x + width, anchors.bodyCentre.y - 40 * scale),
            v(x + width * 0.6, anchors.bodyCentre.y + 42 * scale),
            v(x - width * 1.2, anchors.bodyCentre.y + 42 * scale),
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

  if (has("veil")) {
    marks.push({
      shape: {
        kind: "path",
        points: ellipseRing(anchors.bodyCentre.x + 6 * scale, anchors.bodyCentre.y - 6 * scale, 46 * scale, 26 * scale, steps(input, 28)),
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

export function bellyShape(input: RigInput, anchors: Anchors): Ring {
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  return ellipseRing(
    anchors.bodyCentre.x - 4 * scale,
    anchors.bodyCentre.y + lerp(12, 20, clamp01(input.build)) * scale,
    40 * scale,
    lerp(11, 17, clamp01(input.build)) * scale,
    steps(input, 26),
  );
}

export function lanternGlow(input: RigInput, anchors: Anchors): Ring | undefined {
  if (input.lantern !== "lantern") return undefined;
  const scale = lerp(0.9, 1.1, clamp01(input.size));
  return ellipseRing(anchors.bodyCentre.x, anchors.bodyCentre.y, 76 * scale, 52 * scale, steps(input, 30));
}

export { BASELINE };
