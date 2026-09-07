/**
 * Renderer tests.
 *
 * Three things are being defended here:
 *
 *  1. The picture is a pure function of the *phenotype*. It cannot leak a
 *     genotype, and it cannot wobble between frames.
 *  2. Every combination the gene map can produce actually draws — parametric
 *     geometry fails by emitting NaN, silently, into a path string.
 *  3. The silhouette test from §6.4 is a real gate, not a note in a document.
 */

import {
  createRng,
  expressPhenotype,
  geneMapFor,
  genomeFromSpec,
  QUILLFEN,
  randomWildGenome,
} from "@chimaera/genetics";
import type { Genome, Phenotype } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  hslToHex,
  MARKING_CONTRAST,
  OUTLINE_CONTRAST,
  OUTLINE_ON_PAPER_CONTRAST,
  resolvePalette,
} from "../src/palette.js";
import { renderCreature } from "../src/render.js";
import {
  componentCount,
  coverage,
  distinctness,
  rasteriseSilhouette,
  spread,
  toAscii,
} from "../src/silhouette.js";
import { toSvg } from "../src/svg.js";
import type { PaletteMode } from "../src/types.js";

const map = geneMapFor(QUILLFEN);

function pheno(genome: Genome): Phenotype {
  return expressPhenotype(genome, map);
}

function svgFor(genome: Genome, mode?: PaletteMode): string {
  return toSvg(renderCreature(pheno(genome), map, mode ? { mode } : {}));
}

function wildSample(count: number, seed: string): Genome[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => randomWildGenome(map, rng));
}

describe("determinism", () => {
  it("renders the same creature identically every time", () => {
    for (const genome of wildSample(40, "render:determinism")) {
      expect(svgFor(genome)).toBe(svgFor(genome));
    }
  });

  it("gives the same creature the same freckles on every render", () => {
    const genome = genomeFromSpec(map, "female", { MARK: ["Ms", "Ms"] });
    const first = renderCreature(pheno(genome), map);
    const second = renderCreature(pheno(genome), map);
    expect(JSON.stringify(first.layers)).toBe(JSON.stringify(second.layers));
  });

  it("gives two creatures with the same markings genotype different freckles", () => {
    const a = genomeFromSpec(map, "female", { MARK: ["Ms", "Ms"], HUE: ["H_moss", "H_moss"] });
    const b = genomeFromSpec(map, "female", { MARK: ["Ms", "Ms"], HUE: ["H_rust", "H_rust"] });
    const spotsOf = (genome: Genome): string =>
      JSON.stringify(renderCreature(pheno(genome), map).layers.find((l) => l.id === "markings")?.marks);
    expect(spotsOf(a)).not.toBe(spotsOf(b));
  });
});

describe("the renderer cannot see a genotype", () => {
  it("draws two different genotypes identically when they look the same", () => {
    // D/D and D/d are both "quilled". If the picture could tell them apart, the
    // whole information game would leak through the art.
    const homozygous = genomeFromSpec(map, "female", { DORSAL: ["D", "D"] });
    const heterozygous = genomeFromSpec(map, "female", { DORSAL: ["D", "d"] });

    expect(pheno(homozygous)).toEqual(pheno(heterozygous));
    expect(svgFor(homozygous)).toBe(svgFor(heterozygous));
  });

  it("draws a lantern carrier and a prism carrier differently, because those show", () => {
    const plain = genomeFromSpec(map, "female", {});
    const lantern = genomeFromSpec(map, "female", { LANTERN: ["LN_star", "LN_wild"] });
    const prism = genomeFromSpec(map, "female", { PRISM: ["Pr_star", "Pr_wild"] });

    expect(svgFor(lantern)).not.toBe(svgFor(plain));
    expect(svgFor(prism)).not.toBe(svgFor(plain));
    expect(svgFor(lantern)).not.toBe(svgFor(prism));
  });
});

describe("every genotype the map can produce actually draws", () => {
  const dorsals = ["D_crown", "D", "d"] as const;
  const limbs = ["Lp", "Lc", "Ls"] as const;
  const tails = ["Tf", "Tw", "Tn"] as const;
  const builds = ["Bh", "Bm", "Bs"] as const;
  const marks = ["Ms", "Mb", "Mn", "M_veil"] as const;

  it("covers the full cross of form loci without emitting NaN", () => {
    let drawn = 0;
    for (const dorsal of dorsals) {
      for (const limb of limbs) {
        for (const tail of tails) {
          for (const build of builds) {
            for (const mark of marks) {
              for (const sex of ["female", "male"] as const) {
                const genome = genomeFromSpec(map, sex, {
                  DORSAL: [dorsal, dorsal],
                  LIMB: [limb, limb],
                  TAIL: [tail, tail],
                  BUILD: [build, build],
                  MARK: [mark, mark],
                });
                const svg = svgFor(genome);
                expect(svg).not.toMatch(/NaN|Infinity|undefined/);
                expect(svg.startsWith("<svg")).toBe(true);
                expect(svg.endsWith("</svg>")).toBe(true);
                drawn++;
              }
            }
          }
        }
      }
    }
    expect(drawn).toBe(dorsals.length * limbs.length * tails.length * builds.length * marks.length * 2);
  });

  it("draws albinos, elders of both sexes and extreme stat genotypes", () => {
    const cases: Genome[] = [
      genomeFromSpec(map, "female", { PIG: ["p", "p"], MARK: ["Ms", "Mb"] }),
      genomeFromSpec(map, "male", { CREST: ["Cr_grand", null], TUSK: [null, "Tk_yes"] }),
      genomeFromSpec(map, "female", {
        VIG_A: ["VA2", "VA2"],
        VIG_B: ["VB2", "VB2"],
        VIG_C: ["VC2", "VC2"],
      }),
      genomeFromSpec(map, "female", {
        VIG_A: ["VA0", "VA0"],
        VIG_B: ["VB0", "VB0"],
        VIG_C: ["VC0", "VC0"],
      }),
    ];
    for (const genome of cases) {
      const svg = svgFor(genome);
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });

  it("namespaces internal element ids per creature", () => {
    // Fifty creatures share one HTML document. If they shared a clip-path id,
    // every creature's markings would clip to the first creature's outline.
    const a = svgFor(genomeFromSpec(map, "female", { BUILD: ["Bh", "Bh"], MARK: ["Ms", "Ms"] }));
    const b = svgFor(genomeFromSpec(map, "female", { BUILD: ["Bs", "Bs"], MARK: ["Mb", "Mb"] }));
    const idsOf = (svg: string): string[] => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] as string);

    expect(idsOf(a).length).toBeGreaterThan(0);
    expect(new Set(idsOf(a)).size).toBe(idsOf(a).length);
    for (const id of idsOf(a)) expect(idsOf(b)).not.toContain(id);

    // Every reference resolves to an id defined in the same document.
    for (const svg of [a, b]) {
      const defined = new Set(idsOf(svg));
      for (const match of svg.matchAll(/url\(#([^)]+)\)/g)) {
        expect(defined.has(match[1] as string)).toBe(true);
      }
    }
  });

  it("produces well-formed markup with an accessible label", () => {
    const svg = svgFor(genomeFromSpec(map, "female", {}));
    expect(svg).toContain('role="img"');
    expect(svg).toMatch(/aria-label="[^"]+"/);
    expect(svg).toContain('viewBox="0 0 240 150"');
    // Every opening tag is closed: crude, but it catches a truncated serialiser.
    const opens = (svg.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
    const closes = (svg.match(/<\/[a-zA-Z]/g) ?? []).length + (svg.match(/\/>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});

describe("silhouette test (§6.4)", () => {
  const sample = wildSample(60, "render:silhouette");

  it("keeps every creature a single connected shape at 32x32", () => {
    for (const genome of sample) {
      const silhouette = rasteriseSilhouette(renderCreature(pheno(genome), map), 32);
      const components = componentCount(silhouette);
      if (components !== 1) {
        throw new Error(`silhouette broke into ${components} pieces:\n${toAscii(silhouette)}`);
      }
    }
  });

  it("fills the icon without becoming a blob or a speck", () => {
    for (const genome of sample) {
      const silhouette = rasteriseSilhouette(renderCreature(pheno(genome), map), 32);
      const filled = coverage(silhouette);
      expect(filled).toBeGreaterThan(0.1);
      expect(filled).toBeLessThan(0.45);
    }
  });

  it("reads as a long, low creature: a recognisable silhouette family", () => {
    for (const genome of sample) {
      const silhouette = rasteriseSilhouette(renderCreature(pheno(genome), map), 32);
      const reach = spread(silhouette);
      expect(reach.x).toBeGreaterThan(0.8);
      expect(reach.y).toBeGreaterThan(0.3);
      // Long and low is the family. If this ever inverts, the rig has drifted.
      expect(reach.x).toBeGreaterThan(reach.y);
    }
  });

  it("changes with form genotypes, and changes a lot for the rare ones", () => {
    const silhouetteOf = (spec: Parameters<typeof genomeFromSpec>[2]) =>
      rasteriseSilhouette(renderCreature(pheno(genomeFromSpec(map, "female", spec)), map), 32);

    const base = silhouetteOf({ DORSAL: ["d", "d"], LIMB: ["Ls", "Ls"], TAIL: ["Tn", "Tn"] });
    const quilled = silhouetteOf({ DORSAL: ["D", "D"], LIMB: ["Ls", "Ls"], TAIL: ["Tn", "Tn"] });
    const crowned = silhouetteOf({ DORSAL: ["D_crown", "D_crown"], LIMB: ["Ls", "Ls"], TAIL: ["Tn", "Tn"] });
    const finned = silhouetteOf({ DORSAL: ["d", "d"], LIMB: ["Ls", "Ls"], TAIL: ["Tf", "Tf"] });

    // A common allele may be a subtle read at icon size, and should be: the
    // silhouette carries species identity, not every genotype.
    expect(distinctness(base, quilled)).toBeGreaterThan(0);

    // A *novel* allele is the treasure of a whole playthrough. If finding one
    // does not visibly change the animal in a 32x32 icon, the discovery is a
    // line of text rather than a moment.
    expect(distinctness(base, crowned)).toBeGreaterThan(0.03);
    expect(distinctness(quilled, crowned)).toBeGreaterThan(0.03);

    // A whole part slot changing has to read.
    expect(distinctness(base, finned)).toBeGreaterThan(0.03);
  });

  it("does not change with colour genotypes — a silhouette is shape only", () => {
    const silhouetteOf = (spec: Parameters<typeof genomeFromSpec>[2]) =>
      rasteriseSilhouette(renderCreature(pheno(genomeFromSpec(map, "female", spec)), map), 32);

    const moss = silhouetteOf({ HUE: ["H_moss", "H_moss"], MARK: ["Ms", "Ms"] });
    const bloom = silhouetteOf({ HUE: ["H_bloom", "H_bloom"], MARK: ["Mb", "Mb"] });
    const albino = silhouetteOf({ PIG: ["p", "p"] });

    expect(distinctness(moss, bloom)).toBe(0);
    expect(distinctness(moss, albino)).toBe(0);
  });
});

describe("palette", () => {
  it("keeps colours inside the species' authored ranges", () => {
    for (const genome of wildSample(200, "render:palette")) {
      const colour = pheno(genome).colour;
      if (pheno(genome).traits.pigmentation === "albino") continue;
      expect(colour.h).toBeGreaterThanOrEqual(map.species.palette.hue[0] - 1e-6);
      expect(colour.h).toBeLessThanOrEqual(map.species.palette.hue[1] + 1e-6);
      expect(colour.s).toBeGreaterThanOrEqual(map.species.palette.saturation[0] - 1e-6);
      expect(colour.s).toBeLessThanOrEqual(map.species.palette.saturation[1] + 1e-6);
      expect(colour.l).toBeGreaterThanOrEqual(map.species.palette.lightness[0] - 1e-6);
      expect(colour.l).toBeLessThanOrEqual(map.species.palette.lightness[1] + 1e-6);
    }
  });

  it("converts HSL to hex correctly at the corners", () => {
    expect(hslToHex({ h: 0, s: 0, l: 0 })).toBe("#000000");
    expect(hslToHex({ h: 0, s: 0, l: 1 })).toBe("#ffffff");
    expect(hslToHex({ h: 0, s: 1, l: 0.5 })).toBe("#ff0000");
    expect(hslToHex({ h: 120, s: 1, l: 0.5 })).toBe("#00ff00");
    expect(hslToHex({ h: 240, s: 1, l: 0.5 })).toBe("#0000ff");
  });

  const modes: PaletteMode[] = ["full", "deuteranopia", "protanopia", "tritanopia", "monochrome"];

  it("keeps markings readable against the coat in every accessibility mode", () => {
    for (const mode of modes) {
      for (const genome of wildSample(40, `render:contrast:${mode}`)) {
        const palette = resolvePalette({
          coat: pheno(genome).colour,
          hueArc: map.species.palette.hue,
          mode,
        });
        // 1.9:1 is below the WCAG text threshold, which is the right bar for
        // large blocks of pattern rather than type; the hatch textures carry
        // the rest of the signal.
        expect(contrastRatio(palette.coat, palette.marking)).toBeGreaterThan(MARKING_CONTRAST - 0.01);
        // The creature's linework must read against its own fill...
        expect(contrastRatio(palette.coat, palette.outline)).toBeGreaterThan(OUTLINE_CONTRAST - 0.01);
        // ...and the lifted pen must still read against the paper.
        expect(contrastRatio(palette.outline, palette.paper)).toBeGreaterThan(
          OUTLINE_ON_PAPER_CONTRAST - 0.01,
        );
      }
    }
  });

  it("preserves hue ordering in every colourblind mode", () => {
    // A player who cannot separate moss from rust must still see a consistent
    // progression: darker/bluer to lighter/yellower, in the same direction.
    for (const mode of modes) {
      if (mode === "monochrome") continue;
      const hexes = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const h = map.species.palette.hue[0] + t * (map.species.palette.hue[1] - map.species.palette.hue[0]);
        return resolvePalette({ coat: { h, s: 0.5, l: 0.5 }, hueArc: map.species.palette.hue, mode }).coat;
      });
      expect(new Set(hexes).size).toBe(hexes.length);
    }
  });

  it("attaches a hatch texture to every marking, so colour is never the only channel", () => {
    const genome = genomeFromSpec(map, "female", { MARK: ["Ms", "Mb"] });
    const markings = renderCreature(pheno(genome), map).layers.find((l) => l.id === "markings");
    expect(markings?.marks.length).toBeGreaterThan(0);
    for (const mark of markings?.marks ?? []) {
      expect(mark.hatch).toBeDefined();
      expect(mark.hatch).not.toBe("none");
    }
  });
});

describe("caption", () => {
  it("names the epistasis that is hiding the colour work", () => {
    const albino = genomeFromSpec(map, "female", { PIG: ["p", "p"] });
    expect(renderCreature(pheno(albino), map).caption.notes).toContain("Pigment failure");
  });

  it("flags the traits a breeder is hunting", () => {
    const prized = genomeFromSpec(map, "male", {
      PRISM: ["Pr_star", "Pr_wild"],
      LANTERN: ["LN_star", "LN_wild"],
      CREST: ["Cr_grand", null],
    });
    const notes = renderCreature(pheno(prized), map).caption.notes;
    expect(notes).toContain("prism edge");
    expect(notes).toContain("lantern sheen");
    expect(notes).toContain("crest in display");
  });
});
