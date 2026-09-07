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
 * (spot placement), the RNG is seeded from the phenotype itself, so a given
 * creature always has the same freckles.
 */

import type { GeneMap, Phenotype } from "@chimaera/genetics";
import { createRng } from "@chimaera/genetics";
import { clamp01 } from "./geometry.js";
import { resolvePalette } from "./palette.js";
import * as rig from "./rig/quillfen.js";
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
  const input: rig.RigInput = {
    build: phenotype.values.build ?? 0.5,
    size: normaliseStat(phenotype, map, "vigour"),
    dorsal: phenotype.traits.dorsal ?? "smooth",
    limbs: phenotype.traits.limbs ?? "stub",
    tail: phenotype.traits.tail ?? "none",
    // An albino's markings read as "unpigmented": the layer is present in the
    // genome and simply has nothing to show, which is what epistasis means.
    markings: phenotype.traits.markings === "unpigmented" ? "none" : (phenotype.traits.markings ?? "none"),
    crest: phenotype.traits.crest ?? "hidden",
    tusk: phenotype.traits.tusk ?? "none",
    sheen: phenotype.traits.sheen ?? "plain",
    lantern: phenotype.traits.lantern ?? "none",
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

  const glow = rig.lanternGlow(input, anchors);
  if (glow) {
    layers.push({
      id: "glow",
      marks: [
        {
          shape: { kind: "path", points: glow, closed: true, smooth: true },
          fill: "glow",
          opacity: 0.3,
          ghost: true,
        },
      ],
    });
  }

  layers.push({ id: "tail", marks: [ink(rig.tailShape(input, anchors), "coatShade")] });
  layers.push({ id: "dorsal", marks: [ink(rig.dorsalRidge(input, anchors), "coatShade")] });

  const limbs = rig.limbShapes(input, anchors);
  const hind = limbs.rings[0];
  const fore = limbs.rings[1];
  if (hind) layers.push({ id: "limb-hind", marks: [ink(hind, "coatShade")] });

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

  if (fore) layers.push({ id: "limb-fore", marks: [ink(fore, "coat")] });
  if (limbs.claws.length > 0) {
    layers.push({
      id: "claws",
      marks: limbs.claws.map((claw) => ink(claw, "coatLight", { strokeWidth: 1.1 })),
    });
  }

  layers.push({
    id: "gills",
    marks: rig.gillFronds(input, anchors).map((frond) => ink(frond, "coatLight", { strokeWidth: 1.3 })),
  });
  layers.push({ id: "head", marks: [ink(rig.headShape(input, anchors), "coat")] });

  const crest = rig.crestShape(input, anchors);
  if (crest) layers.push({ id: "crest", marks: [ink(crest, "coatLight")] });

  const tusk = rig.tuskShape(input, anchors);
  if (tusk) layers.push({ id: "tusk", marks: [ink(tusk, "coatLight", { strokeWidth: 1.1 })] });

  layers.push({
    id: "eye",
    marks: [
      { shape: { kind: "circle", c: anchors.eye, r: 4.6 }, fill: "paper", stroke: "outline", strokeWidth: 1.3 },
      { shape: { kind: "circle", c: anchors.eye, r: 2.1 }, fill: "eye" },
    ],
  });

  if (input.sheen === "prismatic") {
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

function buildCaption(phenotype: Phenotype, map: GeneMap, input: rig.RigInput): CaptionData {
  const notes: string[] = [];
  if (phenotype.epistasisActive.length > 0) {
    for (const id of phenotype.epistasisActive) {
      const rule = map.species.epistasis.find((r) => r.id === id);
      if (rule) notes.push(rule.name);
    }
  }
  if (input.sheen === "prismatic") notes.push("prism edge");
  if (input.lantern === "lantern") notes.push("lantern sheen");
  if (input.crest === "grand") notes.push("crest in display");

  return {
    species: map.species.name,
    sex: phenotype.sex,
    form: [input.dorsal, input.limbs, input.tail, input.markings].join(" / "),
    lengthUnits: Math.round(30 + normaliseStat(phenotype, map, "vigour") * 22),
    notes,
  };
}
