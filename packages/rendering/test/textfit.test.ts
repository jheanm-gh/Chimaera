/**
 * The specimen label has to fit on the specimen plate.
 *
 * This file exists because it did not. The caption was emitted as one
 * unmeasured line of SVG text: about a third of the captions the six species
 * can produce ran past the measuring rule they sit under, and nearly a fifth
 * ran off the edge of the paper and were clipped mid-word by the viewBox.
 * Nothing failed, because nothing was looking.
 */

import { describe, expect, it } from "vitest";
import { createRng, expressPhenotype, geneMapById, randomWildGenome, SPECIES } from "@chimaera/genetics";
import { captionText, CANVAS, fitLines, renderCreature, SAFETY, textWidth, toSvg } from "../src/index.js";

const STYLE = { fontSize: 7.5, letterSpacing: 0.3 } as const;
/** Matches the margins `journalFrame` gives the label. */
const PLATE = CANVAS.width - 32;
const FIT = { ...STYLE, width: PLATE, maxLines: 2 } as const;

/**
 * Widths read out of a browser with `getComputedTextLength`, at this style, for
 * the serif the caption's font stack falls back to. The estimator has no
 * business being trusted on captions if it cannot reproduce these.
 */
const MEASURED: readonly (readonly [string, number])[] = [
  ["Sallowfinch · ♀ · hidden / soft / barred / unpigmented — Soft keratin, Pigment failure, masked display", 339.3],
  ["Bramblehog · ♀ · Even (blend) / long / banded / mask", 178.06],
  ["Silt-Adder · ♂ · even / paddle / whip / diamonds", 160],
  ["Quillfen · ♀ · quilled / stub / fan-whip / spots — luminous", 193.31],
  ["Kite-Ossel · ♂ · Even / hooked / forked / rays — bold display", 203.69],
];

/** Every caption the six species can produce, sampled broadly. */
function everyCaption(count = 400): readonly string[] {
  const rng = createRng("caption-fit");
  const captions: string[] = [];
  for (const { id } of SPECIES) {
    const map = geneMapById(id);
    for (let i = 0; i < count; i++) {
      const phenotype = expressPhenotype(randomWildGenome(map, rng), map);
      captions.push(captionText(renderCreature(phenotype, map).caption));
    }
  }
  return captions;
}

describe("measuring text", () => {
  it("reproduces widths a browser actually rendered", () => {
    for (const [text, truth] of MEASURED) {
      expect(Math.abs(textWidth(text, STYLE) / truth - 1)).toBeLessThan(0.01);
    }
  });

  it("scales with the font size", () => {
    const text = "Quillfen · ♀ · quilled / stub";
    const single = textWidth(text, { fontSize: 10, letterSpacing: 0 });
    expect(textWidth(text, { fontSize: 20, letterSpacing: 0 })).toBeCloseTo(single * 2, 6);
  });

  it("charges for letter-spacing once per character", () => {
    const text = "banded";
    expect(textWidth(text, { fontSize: 7.5, letterSpacing: 1 }) - textWidth(text, { fontSize: 7.5, letterSpacing: 0 })).toBeCloseTo(6, 6);
  });

  it("gives an unknown glyph a plausible width rather than nothing", () => {
    expect(textWidth("\u{1F9EC}", STYLE)).toBeGreaterThan(0);
  });
});

describe("fitting a caption to the plate", () => {
  it("keeps every caption the roster can produce inside the paper", () => {
    for (const caption of everyCaption()) {
      for (const line of fitLines(caption, FIT)) {
        expect(line.textLength ?? textWidth(line.text, STYLE)).toBeLessThanOrEqual(PLATE);
      }
    }
  });

  it("leaves headroom for a wider font than the table was measured against", () => {
    // The estimate is calibrated to the fallback serif. Georgia sets wider, so
    // an unpinned line has to clear the edge with SAFETY to spare.
    for (const caption of everyCaption(150)) {
      for (const line of fitLines(caption, FIT)) {
        if (line.textLength !== undefined) continue;
        expect(textWidth(line.text, STYLE) * SAFETY).toBeLessThanOrEqual(PLATE);
      }
    }
  });

  it("never spends more lines than the plate has", () => {
    for (const caption of everyCaption(150)) expect(fitLines(caption, FIT).length).toBeLessThanOrEqual(2);
  });

  it("loses no words while it still has paper", () => {
    for (const caption of everyCaption(150)) {
      const lines = fitLines(caption, FIT);
      const joined = lines.map((line) => line.text).join(" ");
      if (joined.endsWith("…")) continue;
      expect(joined).toBe(caption);
    }
  });

  it("uses the second line only when the first will not hold the caption", () => {
    const lines = fitLines("Quillfen · ♂ · even / stub", FIT);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe("Quillfen · ♂ · even / stub");
  });

  it("has captions that genuinely do not fit on one line — which is why any of this exists", () => {
    const captions = everyCaption();
    // The old label was one line starting at x=20, so the paper's own edge cut
    // it at 220 units. This is the share that got cut.
    const clipped = captions.filter((caption) => textWidth(caption, STYLE) > 220);
    expect(clipped.length / captions.length).toBeGreaterThan(0.15);
    // And this is the share that ran past the measuring rule it sits under.
    const pastTheRule = captions.filter((caption) => textWidth(caption, STYLE) > 200);
    expect(pastTheRule.length / captions.length).toBeGreaterThan(0.3);
  });

  it("wraps rather than clipping when the caption is long", () => {
    const long = MEASURED[0]?.[0] as string;
    const lines = fitLines(long, FIT);
    expect(lines.length).toBe(2);
    expect(lines.map((line) => line.text).join(" ")).toBe(long);
  });

  it("marks an elision so a truncated label cannot read as a complete one", () => {
    const lines = fitLines("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda", {
      ...STYLE,
      width: 40,
      maxLines: 2,
    });
    expect(lines).toHaveLength(2);
    expect(lines.at(-1)?.text.endsWith("…")).toBe(true);
  });

  it("pins a word too long to break, so the browser condenses it instead of the paper cutting it", () => {
    const lines = fitLines("Pseudopseudohypoparathyroidism", { ...STYLE, width: 30, maxLines: 2 });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textLength).toBeLessThanOrEqual(30);
  });

  it("has nothing to say about an empty caption", () => {
    expect(fitLines("   ", FIT)).toEqual([]);
  });
});

describe("the label on the plate", () => {
  it("emits every caption line as its own text element, inside the viewBox", () => {
    const map = geneMapById("sallowfinch");
    const rng = createRng("label");
    for (let i = 0; i < 200; i++) {
      const phenotype = expressPhenotype(randomWildGenome(map, rng), map);
      const drawing = renderCreature(phenotype, map);
      const svg = toSvg(drawing);
      const lines = fitLines(captionText(drawing.caption), FIT);
      for (const line of lines) {
        // The caption is escaped in the document; compare on the escaped form.
        expect(svg).toContain(line.text.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
      }
      for (const y of [...svg.matchAll(/<text [^>]*y="([\d.]+)"/g)]) {
        expect(Number(y[1])).toBeLessThan(CANVAS.height);
      }
    }
  });

  it("leaves the animal standing on the same line the taller plate or not", () => {
    const map = geneMapById("quillfen");
    const phenotype = expressPhenotype(randomWildGenome(map, createRng("stand")), map);
    const svg = toSvg(renderCreature(phenotype, map));
    // The ground rule is pinned to the creature's feet, not to the paper's edge.
    expect(svg).toContain('<line x1="20" y1="140" x2="220" y2="140"/>');
  });
});
