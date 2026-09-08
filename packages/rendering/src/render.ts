/**
 * Phenotype -> Drawing.
 *
 * The renderer reads a `Phenotype` and nothing else. It has no access to a
 * genome, which makes it structurally impossible for the picture to reveal
 * something the player has not earned (§1.3) — and a test asserts that two
 * creatures with different genotypes but identical phenotypes render
 * byte-identically.
 *
 * The function is pure and deterministic. Where organic variation is wanted
 * (marking placement), the RNG is seeded from the phenotype itself, so a given
 * creature always has the same freckles.
 *
 * Which shape gets drawn comes from the species' `BodyPlan`; which *trait*
 * drives each slot comes from the plan's `traits` map, because a Quillfen's
 * back carries a dorsal ridge and a Sallowfinch's carries a crest, and the rig
 * should not have to know which is which.
 */

import type { GeneMap, Phenotype } from "@chimaera/genetics";
import { createRng } from "@chimaera/genetics";
import { clamp01 } from "./geometry.js";
import { resolvePalette } from "./palette.js";
import * as rig from "./rig/plan.js";
import { planFor } from "./rig/plans.js";
import type { CaptionData, Drawing, Layer, Mark, RenderOptions, Ring } from "./types.js";

/** Stable seed from the visible phenotype. Same creature, same freckles, forever. */
export function phenotypeFingerprint(phenotype: Phenotype): string {
  return JSON.stringify([
    phenotype.species,
    phenotype.sex,
    Object.entries(phenotype.traits).sort(),
    Object.entries(phenotype.values).sort(),
    Object.entries(phenotype.stats)
      .sort()
      .map(([k, value]: [string, number]) => [k, Math.round(value * 1000)]),
    phenotype.marks,
    phenotype.colour,
    phenotype.epistasisActive,
  ]);
}

function normaliseStat(phenotype: Phenotype, map: GeneMap, statId: string): number {
  const trait = map.polygenicTraits.find((t) => t.id === statId);
  const value = phenotype.stats[statId];
  if (!trait || value === undefined) return 0.5;
  return clamp01((value - trait.min) / (trait.max - trait.min));
}

export function renderCreature(
  phenotype: Phenotype,
  map: GeneMap,
  options: RenderOptions = {},
): Drawing {
  const plan = planFor(phenotype.species);
  const trait = (key: string | undefined, fallback = "none"): string =>
    key === undefined ? fallback : (phenotype.traits[key] ?? fallback);

  const input: rig.PlanInput = {
    plan,
    detail: options.detail ?? "full",
    build: phenotype.values[plan.traits.build] ?? 0.5,
    size: normaliseStat(phenotype, map, "vigour"),
    limbs: trait(plan.traits.limbs, "paddle"),
    tail: trait(plan.traits.tail, "fan"),
    // A masked or absent slot still resolves to a trait string; the rig reads
    // words like "naked" and "absent" and draws the reduced form, which is what
    // an epistatic gate should look like from the outside.
    crown: trait(plan.traits.crown, "even"),
    markings: trait(plan.traits.markings, "none"),
    display: trait(plan.traits.display, "none"),
    glow: /lantern|glow/.test(trait(plan.traits.glow)),
    sheen: /prism|iridescent|nacre|opal|aurora/.test(trait(plan.traits.sheen)),
    rng: createRng(phenotypeFingerprint(phenotype)),
  };

  const anchors = rig.anchorsFor(input);
  const body = rig.bodyOutline(input, anchors);
  const palette = resolvePalette({
    coat: phenotype.colour,
    hueArc: map.species.palette.hue,
    ...(options.mode ? { mode: options.mode } : {}),
  });

  const ink = (points: Ring, fill: Mark["fill"], extra: Partial<Mark> = {}): Mark => ({
    shape: { kind: "path", points, closed: true, smooth: true },
    fill,
    stroke: "outline",
    strokeWidth: 1.6,
    ...extra,
  });

  const layers: Layer[] = [];

  const glow = rig.glowShape(input, anchors);
  if (glow) {
    layers.push({
      id: "glow",
      marks: [{ shape: { kind: "path", points: glow, closed: true, smooth: true }, fill: "glow", opacity: 0.3, ghost: true }],
    });
  }

  const tail = rig.tailShape(input, anchors);
  if (tail) layers.push({ id: "tail", marks: [ink(tail, "coatShade")] });

  // The crown sits behind the trunk — a membrane, a ridge or a plume all read
  // better with the body's mass in front of them.
  const crown = rig.crownShape(input, anchors);
  if (crown.length > 0) {
    layers.push({ id: "crown", marks: crown.map((ring) => ink(ring, "coatShade")) });
  }

  const limbs = rig.limbShapes(input, anchors);
  if (limbs.rings.length > 1) {
    layers.push({ id: "limb-hind", marks: [ink(limbs.rings[0] as Ring, "coatShade")] });
  }

  layers.push({ id: "body", marks: [ink(body, "coat")] });
  layers.push({
    id: "belly",
    marks: [
      {
        shape: { kind: "path", points: rig.bellyShape(input, anchors), closed: true, smooth: true },
        fill: "belly",
        clipToBody: true,
        opacity: 0.9,
      },
    ],
  });

  const markings = rig.markingMarks(input, anchors);
  if (markings.length > 0) layers.push({ id: "markings", marks: markings });

  const fore = limbs.rings[limbs.rings.length - 1];
  if (fore) layers.push({ id: "limb-fore", marks: [ink(fore, "coat")] });
  if (limbs.claws.length > 0) {
    layers.push({ id: "claws", marks: limbs.claws.map((claw) => ink(claw, "coatLight", { strokeWidth: 1.1 })) });
  }

  layers.push({ id: "head", marks: [ink(rig.headShape(input, anchors), "coat")] });

  layers.push({
    id: "eye",
    marks: [
      { shape: { kind: "circle", c: anchors.eye, r: 4.4 }, fill: "paper", stroke: "outline", strokeWidth: 1.3 },
      { shape: { kind: "circle", c: anchors.eye, r: 2 }, fill: "eye" },
    ],
  });

  if (input.sheen) {
    // A prism edge is a rim, not a wash: it traces the outline so the sheen
    // reads at thumbnail size, which is where players will actually spot it.
    layers.push({
      id: "sheen",
      marks: [
        {
          shape: { kind: "path", points: body, closed: true, smooth: true },
          fill: "none",
          stroke: "coatLight",
          strokeWidth: 3.4,
          opacity: 0.75,
          ghost: true,
        },
      ],
    });
  }

  return {
    width: rig.CANVAS.width,
    height: rig.CANVAS.height,
    layers,
    palette,
    bodyOutline: body,
    caption: buildCaption(phenotype, map, input),
  };
}

function buildCaption(phenotype: Phenotype, map: GeneMap, input: rig.PlanInput): CaptionData {
  const notes: string[] = [];
  for (const id of phenotype.epistasisActive) {
    const rule = map.species.epistasis.find((r) => r.id === id);
    if (rule) notes.push(rule.name);
  }
  if (input.sheen) notes.push("iridescent");
  if (input.glow) notes.push("luminous");
  if (!["none", "hidden", "plain", "dry"].includes(input.display)) notes.push(`${input.display} display`);

  const parts = [input.crown, input.limbs, input.tail, input.markings].filter(
    (part, index, all) => part !== "none" && all.indexOf(part) === index,
  );

  return {
    species: map.species.name,
    sex: phenotype.sex,
    form: parts.join(" / "),
    lengthUnits: Math.round(30 + normaliseStat(phenotype, map, "vigour") * 22),
    notes,
  };
}
