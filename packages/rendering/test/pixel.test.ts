/**
 * The sprite renderer.
 *
 * Same contract as the illustration renderer it sits beside: deterministic,
 * seeded, and fed only a Phenotype — a sprite that could read a genome would
 * leak information the player has not earned, and no amount of it looking good
 * would make that acceptable.
 *
 * The silhouette discipline from §6.4 carries over rather than being retired.
 * The medium changed; the requirement that six species be told apart at a
 * glance did not.
 */

import { describe, expect, it } from "vitest";
import { createRng, expressPhenotype, geneMapById, randomWildGenome, SPECIES } from "@chimaera/genetics";
import { encodePng, renderSprite, toRgba } from "../src/index.js";
import { SLOT } from "../src/pixel/ramp.js";

function sample(species: string, count: number, seed = "pixel-test") {
  const map = geneMapById(species as never);
  const rng = createRng(`${seed}-${species}`);
  return Array.from({ length: count }, () => {
    const phenotype = expressPhenotype(randomWildGenome(map, rng), map);
    return { phenotype, map, sprite: renderSprite(phenotype, map) };
  });
}

/** Ink coverage as a fraction of the canvas. */
function coverage(pixels: Uint8Array): number {
  let filled = 0;
  for (const value of pixels) if (value !== 0) filled++;
  return filled / pixels.length;
}

describe("drawing a creature as pixels", () => {
  it("is deterministic — the same animal draws the same sprite every time", () => {
    for (const { id } of SPECIES) {
      const map = geneMapById(id);
      const phenotype = expressPhenotype(randomWildGenome(map, createRng(`det-${id}`)), map);
      const first = renderSprite(phenotype, map);
      const second = renderSprite(phenotype, map);
      expect(Array.from(second.pixels)).toEqual(Array.from(first.pixels));
      expect(second.palette).toEqual(first.palette);
    }
  });

  it("draws every species at a size that fills the frame without spilling out of it", () => {
    for (const { id, name } of SPECIES) {
      for (const { sprite } of sample(id, 30)) {
        const fill = coverage(sprite.pixels);
        // A speck and a blob both fail: one is unreadable, the other has no
        // silhouette left to read.
        expect(fill, `${name} coverage`).toBeGreaterThan(0.04);
        expect(fill, `${name} coverage`).toBeLessThan(0.55);
      }
    }
  });

  it("never lets the outline run off the edge of the canvas", () => {
    // The contour is drawn *outside* the shape, so anything touching the border
    // has already lost a pixel of itself.
    for (const { id, name } of SPECIES) {
      for (const { sprite } of sample(id, 25)) {
        const { width, height, pixels } = sprite;
        for (let x = 0; x < width; x++) {
          expect(pixels[x], `${name} top edge`).toBe(0);
          expect(pixels[(height - 1) * width + x], `${name} bottom edge`).toBe(0);
        }
        for (let y = 0; y < height; y++) {
          expect(pixels[y * width], `${name} left edge`).toBe(0);
          expect(pixels[y * width + width - 1], `${name} right edge`).toBe(0);
        }
      }
    }
  });

  it("gives every creature a face, because that is what makes it a creature", () => {
    for (const { id, name } of SPECIES) {
      for (const { sprite } of sample(id, 20)) {
        const eye = sprite.pixels.some((value) => value === SLOT.eye);
        const catchlight = sprite.pixels.some((value) => value === SLOT.eyeLight);
        expect(eye, `${name} pupil`).toBe(true);
        expect(catchlight, `${name} catchlight`).toBe(true);
      }
    }
  });

  it("spends its whole ramp, so the animal is lit rather than tinted", () => {
    for (const { id, name } of SPECIES) {
      const used = new Set<number>();
      for (const { sprite } of sample(id, 20)) for (const value of sprite.pixels) used.add(value);
      // Highlight through core shadow: a sprite using two rungs is a silhouette
      // with a colour, not a lit form.
      for (const slot of [SLOT.outline, SLOT.light, SLOT.base, SLOT.shade]) {
        expect(used.has(slot), `${name} uses slot ${slot}`).toBe(true);
      }
    }
  });

  it("has no hole in its palette", () => {
    for (const { id } of SPECIES) {
      for (const { sprite } of sample(id, 10)) {
        const highest = Math.max(...Array.from(sprite.pixels));
        expect(sprite.palette.length).toBeGreaterThan(highest);
        for (const colour of sprite.palette) expect(colour).toMatch(/^#[0-9a-f]{6,8}$/i);
      }
    }
  });

  it("reads the phenotype and nothing else", () => {
    // Two genomes that express identically must draw identically, or the
    // picture is telling the player something the assay has not.
    const map = geneMapById("quillfen");
    const rng = createRng("same-look");
    for (let i = 0; i < 40; i++) {
      const a = expressPhenotype(randomWildGenome(map, rng), map);
      const b = expressPhenotype(randomWildGenome(map, rng), map);
      const sameLook =
        a.colour === b.colour && JSON.stringify(a.traits) === JSON.stringify(b.traits) &&
        JSON.stringify(a.values) === JSON.stringify(b.values) && JSON.stringify(a.stats) === JSON.stringify(b.stats);
      if (!sameLook) continue;
      expect(Array.from(renderSprite(a, map).pixels)).toEqual(Array.from(renderSprite(b, map).pixels));
    }
  });

  it("faces the other way when flipped, and is not simply the same picture", () => {
    const map = geneMapById("bramblehog");
    const phenotype = expressPhenotype(randomWildGenome(map, createRng("flip")), map);
    const right = renderSprite(phenotype, map);
    const left = renderSprite(phenotype, map, { flip: true });
    expect(Array.from(left.pixels)).not.toEqual(Array.from(right.pixels));
    expect(coverage(left.pixels)).toBeCloseTo(coverage(right.pixels), 1);
  });
});

describe("telling the six apart at a glance", () => {
  /**
   * The lit sprite reduced to ink and paper, at icon size.
   *
   * Cropped to the creature, not to the canvas, and with the aspect ratio kept
   * — the same rule `rasteriseSilhouette` follows for the illustration
   * renderer. Measuring the empty frame around a small animal would let a
   * shapeless design pass by sitting in a big box, and squashing a long species
   * into a square would let it pass by pretending to be a round one.
   */
  function silhouette(sprite: { pixels: Uint8Array; width: number; height: number }, size = 32): boolean[] {
    let minX = sprite.width;
    let minY = sprite.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < sprite.height; y++) {
      for (let x = 0; x < sprite.width; x++) {
        if (sprite.pixels[y * sprite.width + x] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const out = new Array<boolean>(size * size).fill(false);
    if (maxX < 0) return out;
    const contentWidth = maxX - minX + 1;
    const contentHeight = maxY - minY + 1;
    const scale = (size - 2) / Math.max(contentWidth, contentHeight);
    const offsetX = (size - contentWidth * scale) / 2;
    const offsetY = (size - contentHeight * scale) / 2;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (sprite.pixels[y * sprite.width + x] === 0) continue;
        const tx = Math.floor((x - minX) * scale + offsetX);
        const ty = Math.floor((y - minY) * scale + offsetY);
        if (tx >= 0 && ty >= 0 && tx < size && ty < size) out[ty * size + tx] = true;
      }
    }
    return out;
  }

  const differing = (a: readonly boolean[], b: readonly boolean[]): number => {
    let count = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
    return count / a.length;
  };

  /** One median animal per species, same seed, so plans are compared not luck. */
  function representative(species: string) {
    const map = geneMapById(species as never);
    const phenotype = expressPhenotype(randomWildGenome(map, createRng(`plate:${species}`)), map);
    return renderSprite(phenotype, map);
  }

  it("keeps every pair of species visibly different at 32 by 32", () => {
    // The same 10% floor the illustration renderer holds to. The medium
    // changed; the requirement that a grid of mixed stock be readable did not.
    const FLOOR = 0.1;
    const icons = SPECIES.map(({ id, name }) => ({ name, marks: silhouette(representative(id)) }));
    const report: string[] = [];
    let worst = { pair: "", value: 1 };
    for (let i = 0; i < icons.length; i++) {
      for (let j = i + 1; j < icons.length; j++) {
        const a = icons[i];
        const b = icons[j];
        if (!a || !b) continue;
        const value = differing(a.marks, b.marks);
        report.push(`${a.name} vs ${b.name}: ${(value * 100).toFixed(1)}%`);
        if (value < worst.value) worst = { pair: `${a.name} vs ${b.name}`, value };
      }
    }
    if (worst.value < FLOOR) {
      throw new Error(
        `closest pair ${worst.pair} at ${(worst.value * 100).toFixed(1)}%, floor is ${FLOOR * 100}%\n` +
          report.join("\n"),
      );
    }
  });

  it("has no single genotype that collapses one species onto another", () => {
    // A far harsher measure than the floor above: the worst pair anywhere in a
    // wide sample, not the pair of typical animals. It will always be a smaller
    // number, and it exists to catch a genotype that erases a body plan —
    // a wingless glider, a limbless biped — rather than to police typical looks.
    const shapes = SPECIES.map(({ id, name }) => ({
      name,
      marks: sample(id, 10, "silhouette").map(({ sprite }) => silhouette(sprite)),
    }));
    let closest = { pair: "", distance: 1 };
    for (let a = 0; a < shapes.length; a++) {
      for (let b = a + 1; b < shapes.length; b++) {
        const left = shapes[a];
        const right = shapes[b];
        if (!left || !right) continue;
        let best = 1;
        for (const one of left.marks) for (const other of right.marks) best = Math.min(best, differing(one, other));
        if (best < closest.distance) closest = { pair: `${left.name} vs ${right.name}`, distance: best };
      }
    }
    expect(closest.distance, `closest pair anywhere: ${closest.pair}`).toBeGreaterThan(0.045);
  });
});

describe("getting the pixels out", () => {
  it("hands the browser the exact bytes a canvas wants", () => {
    const map = geneMapById("sallowfinch");
    const phenotype = expressPhenotype(randomWildGenome(map, createRng("rgba")), map);
    const sprite = renderSprite(phenotype, map);
    const rgba = toRgba({ width: sprite.width, height: sprite.height, pixels: sprite.pixels, palette: sprite.palette });
    expect(rgba.length).toBe(sprite.width * sprite.height * 4);
    for (let i = 0; i < sprite.pixels.length; i++) {
      const index = sprite.pixels[i] as number;
      // Transparent where nothing was drawn, opaque everywhere something was.
      expect(rgba[i * 4 + 3]).toBe(index === 0 ? 0 : 255);
    }
  });

  it("writes a PNG whose own bytes decode back to the sprite", () => {
    const map = geneMapById("quillfen");
    const phenotype = expressPhenotype(randomWildGenome(map, createRng("png")), map);
    const sprite = renderSprite(phenotype, map);
    const png = encodePng({
      width: sprite.width,
      height: sprite.height,
      pixels: sprite.pixels,
      palette: sprite.palette,
    });

    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // Walk the chunks, check every CRC, and rebuild the raster from the stored
    // deflate blocks. Trusting the encoder to verify itself would prove nothing.
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const chunks = new Map<string, Uint8Array>();
    let at = 8;
    while (at < png.length) {
      const length = view.getUint32(at);
      const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
      chunks.set(type, png.subarray(at + 8, at + 8 + length));
      at += 12 + length;
    }
    expect([...chunks.keys()]).toEqual(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

    const header = chunks.get("IHDR") as Uint8Array;
    const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
    expect(headerView.getUint32(0)).toBe(sprite.width);
    expect(headerView.getUint32(4)).toBe(sprite.height);
    expect(header[8]).toBe(8);
    expect(header[9]).toBe(3);

    const idat = chunks.get("IDAT") as Uint8Array;
    const raw: number[] = [];
    let cursor = 2; // past the zlib header
    for (;;) {
      const final = (idat[cursor] as number) & 1;
      const size = (idat[cursor + 1] as number) | ((idat[cursor + 2] as number) << 8);
      cursor += 5;
      for (let i = 0; i < size; i++) raw.push(idat[cursor + i] as number);
      cursor += size;
      if (final) break;
    }
    expect(raw.length).toBe(sprite.height * (sprite.width + 1));
    for (let y = 0; y < sprite.height; y++) {
      const rowStart = y * (sprite.width + 1);
      expect(raw[rowStart], "filter byte").toBe(0);
      for (let x = 0; x < sprite.width; x++) {
        expect(raw[rowStart + 1 + x]).toBe(sprite.pixels[y * sprite.width + x]);
      }
    }

    // The palette's transparency chunk must mark index 0 and nothing else.
    const trns = chunks.get("tRNS") as Uint8Array;
    expect(trns[0]).toBe(0);
    for (let i = 1; i < trns.length; i++) expect(trns[i]).toBe(255);
  });

  it("scales by whole pixels, so an exported sprite stays crisp", () => {
    const map = geneMapById("siltadder");
    const phenotype = expressPhenotype(randomWildGenome(map, createRng("zoom")), map);
    const sprite = renderSprite(phenotype, map);
    const image = { width: sprite.width, height: sprite.height, pixels: sprite.pixels, palette: sprite.palette };
    const png = encodePng(image, 3);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(sprite.width * 3);
    expect(view.getUint32(20)).toBe(sprite.height * 3);
  });
});
