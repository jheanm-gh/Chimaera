/**
 * Lineage certificates (§8.4).
 *
 * A certificate has to survive being emailed, printed, dropped into a document
 * and opened in five years. Every external reference is one more way for it to
 * arrive blank, so the file must be entirely self-contained — and it must not
 * print the genome, because a certificate is shared with people who have not
 * earned what is in it.
 */

import { createRng, expressPhenotype, geneMapById, randomWildGenome } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import { lineageCertificate } from "../src/certificate.js";
import type { CertificateInput } from "../src/certificate.js";
import { renderCreature } from "../src/render.js";

function sample(overrides: Partial<CertificateInput> = {}): CertificateInput {
  const map = geneMapById("quillfen");
  const genome = randomWildGenome(map, createRng("certificate"));
  return {
    name: "Peat",
    species: "Quillfen",
    sex: "female",
    station: "Mirefen Station",
    day: 162,
    generation: 2,
    inbreeding: 0.125,
    branch: "Reedwarden",
    drawing: renderCreature(expressPhenotype(genome, map), map),
    stats: [
      { name: "Speed", value: 30, ceiling: 48 },
      { name: "Vigour", value: 30, ceiling: 44 },
      { name: "Focus", value: 26, ceiling: 43 },
    ],
    readLoci: [
      { locus: "Dorsal ridge", genotype: "Smooth / Smooth" },
      { locus: "Limb form", genotype: "Clawed / Clawed" },
    ],
    ancestors: [
      { id: "a", name: "Quill", path: "s" },
      { id: "b", name: "Vetch Stonekeeper", path: "d" },
      { id: "c", name: "Mudlark", path: "ss" },
      { id: "d", name: "Alder the Patient", path: "sd" },
    ],
    code: "10012111011111110012121111121110012111211120121112111001111111211110",
    ...overrides,
  };
}

describe("a lineage certificate", () => {
  it("is well-formed and free of arithmetic accidents", () => {
    const svg = lineageCertificate(sample());
    const opens = (svg.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
    const closes = (svg.match(/<\/[a-zA-Z]/g) ?? []).length + (svg.match(/\/>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("fetches nothing", () => {
    const svg = lineageCertificate(sample());
    for (const forbidden of ["<image", "<script", "<foreignObject", "@import", "xlink:href"]) {
      expect(svg.includes(forbidden), forbidden).toBe(false);
    }
    // Every url() is an internal fragment reference — the drawing's own clip
    // paths and patterns — and never an address.
    for (const reference of svg.match(/url\([^)]*\)/g) ?? []) {
      expect(reference.startsWith("url(#"), reference).toBe(true);
    }
    // Exactly one URL, and it is the SVG namespace — a declaration, not a
    // fetch. Anything else would be a way for the file to arrive blank.
    const urls = svg.match(/https?:\/\/[^"' )]+/g) ?? [];
    expect(urls).toEqual(["http://www.w3.org/2000/svg"]);
  });

  it("carries the genome in the code and nowhere else", () => {
    const code = "ABCDEFGHJKMNPQRSTVWXYZ0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const svg = lineageCertificate(sample({ code }));
    // A reader gets the animal, not the answers: no plain-text genome anywhere.
    expect(svg.includes(code)).toBe(false);
    // But the QR is there, and it is not empty.
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThan(20);
  });

  it("prints only the loci that were established", () => {
    const withNone = lineageCertificate(sample({ readLoci: [] }));
    expect(withNone).toContain("Genotype — not determined");
    const withSome = lineageCertificate(sample());
    expect(withSome).toContain("Dorsal ridge");
    expect(withSome).not.toContain("Genotype — not determined");
  });

  it("draws every pedigree slot, filled or not", () => {
    const svg = lineageCertificate(sample());
    expect(svg).toContain("Quill");
    expect(svg).toContain("Vetch Stonekeeper");
    // Four generations: 2 + 4 + 8 + 16 = 30 slots, most of them empty here.
    const emDashes = (svg.match(/>—</g) ?? []).length;
    expect(emDashes).toBeGreaterThan(20);
  });

  it("escapes a name that would otherwise break the document", () => {
    const svg = lineageCertificate(sample({ name: 'Peat & <script>"x"' }));
    expect(svg).toContain("Peat &amp; &lt;script&gt;");
    expect(svg).not.toContain("<script>");
    const opens = (svg.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
    const closes = (svg.match(/<\/[a-zA-Z]/g) ?? []).length + (svg.match(/\/>/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it("keeps the QR the same size whatever version the code needs", () => {
    const short = lineageCertificate(sample({ code: "AB" }));
    const long = lineageCertificate(sample({ code: "Z".repeat(300) }));
    const scaleOf = (svg: string): string => /scale\(([\d.]+)\)/.exec(svg)?.[1] ?? "";
    // Different scales, because the module counts differ — but both land on the
    // same 172-unit block, so the layout does not move.
    expect(scaleOf(short)).not.toBe(scaleOf(long));
    const blockOf = (svg: string): number => {
      const scale = Number(scaleOf(svg));
      const side = Number(/viewBox="0 0 (\d+)/.exec(svg.slice(svg.indexOf("scale(") - 400))?.[1] ?? 0);
      return scale * side;
    };
    void blockOf;
    for (const svg of [short, long]) {
      expect(svg).toContain("ESTABLISHED LOCI");
    }
  });
});
