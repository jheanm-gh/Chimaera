/**
 * Lineage certificates (§8.4): "exportable pedigree images for any creature —
 * shareable, printable, gorgeous in the field-journal style."
 *
 * One self-contained SVG per creature: the animal drawn from its genome, four
 * generations of pedigree, what it was raised to, and a QR code carrying the
 * genome so anyone holding the picture can breed to it.
 *
 * Everything is inline. No fonts to fetch, no images to resolve, no script: a
 * certificate has to survive being emailed, printed, dropped into a document
 * and opened in five years, and every external reference is one more way for it
 * to arrive blank.
 *
 * The one thing it must not do is leak what the owner has not established. A
 * certificate prints observations — the drawing, the achieved stats, the
 * pedigree names — plus whatever loci the owner has actually read. It does not
 * print the genome in plain text. The QR carries the genome because breeding to
 * an animal requires it, but reading a QR gives you the animal, not the answers:
 * a recipient still has to spend their own lenses.
 */

import { encodeQr, qrToSvg } from "./qr.js";
import type { Drawing } from "./types.js";
import { toSvg } from "./svg.js";

export interface CertificateAncestor {
  readonly id: string;
  readonly name: string;
  /** Position in the tree: "" is the subject, "s"/"d" the sire and dam, etc. */
  readonly path: string;
}

export interface CertificateInput {
  readonly name: string;
  readonly species: string;
  readonly sex: "female" | "male";
  readonly station: string;
  readonly day: number;
  readonly generation: number;
  readonly inbreeding: number;
  readonly branch?: string | undefined;
  /** Drawn from the phenotype, exactly as the ranch draws it. */
  readonly drawing: Drawing;
  readonly stats: readonly { readonly name: string; readonly value: number; readonly ceiling: number }[];
  /** Loci the owner has established, printed as "NAME: allele/allele". */
  readonly readLoci: readonly { readonly locus: string; readonly genotype: string }[];
  /** Four generations, by path. Missing entries are drawn as rules. */
  readonly ancestors: readonly CertificateAncestor[];
  /** The genome code. Goes into the QR and nowhere else. */
  readonly code: string;
}

const WIDTH = 720;
const HEIGHT = 1020;

/** Where the established-loci block starts. The QR sits to the right of it. */
const LOCI_TOP = 786;

const PAPER = "#f2ece0";
const INK = "#241f1a";
const PENCIL = "#6e6558";
const STAMP = "#a8371f";
const RULE = "rgba(36,31,26,0.18)";

const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The pedigree bracket.
 *
 * Four generations shown as the traditional stacked bracket rather than a tree:
 * it is what a pedigree certificate looks like, it fits a portrait page, and
 * the vertical position of a name is itself information — the closer to the
 * top of its band, the closer to the sire's line.
 */
function pedigreeBlock(ancestors: readonly CertificateAncestor[], x: number, y: number, width: number, height: number): string {
  const byPath = new Map(ancestors.map((entry) => [entry.path, entry]));
  const parts: string[] = [];
  const columns = 4;
  const columnWidth = width / columns;

  for (let generation = 1; generation <= columns; generation++) {
    const count = 2 ** generation;
    const rowHeight = height / count;
    for (let index = 0; index < count; index++) {
      // The path reads sire-first: "s" is the sire, "sd" his dam, and so on.
      let path = "";
      for (let bit = generation - 1; bit >= 0; bit--) path += (index >> bit) & 1 ? "d" : "s";
      const entry = byPath.get(path);
      const cx = x + (generation - 1) * columnWidth;
      const cy = y + index * rowHeight;
      const baseline = cy + rowHeight / 2 + 3;
      parts.push(
        `<line x1="${cx.toFixed(1)}" y1="${(cy + rowHeight).toFixed(1)}" x2="${(cx + columnWidth - 6).toFixed(1)}" y2="${(cy + rowHeight).toFixed(1)}" stroke="${RULE}" stroke-width="0.75"/>`,
      );
      const label = entry ? escape(entry.name) : "—";
      const size = generation <= 2 ? 10 : 8.5;
      parts.push(
        `<text x="${(cx + 3).toFixed(1)}" y="${baseline.toFixed(1)}" font-family="${SERIF}" font-size="${size}" fill="${entry ? INK : PENCIL}">${label}</text>`,
      );
    }
  }
  return parts.join("");
}

export function lineageCertificate(input: CertificateInput): string {
  const drawing = toSvg(input.drawing, { width: 300, height: 200, idPrefix: "cert" });
  // Strip the outer <svg> so it can be nested without a second root element.
  const inner = drawing.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const qr = qrToSvg(encodeQr(input.code, { quiet: 2 }), {
    pixel: 2,
    ink: INK,
    paper: PAPER,
    label: `Genome code for ${input.name}`,
  });
  const qrInner = qr.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const qrSide = Number(/viewBox="0 0 (\d+)/.exec(qr)?.[1] ?? 100);
  // Scaled to a fixed 172-unit block whatever version the code needed, so the
  // layout does not shift when a longer species pushes the QR up a version.
  const qrScale = 172 / Math.max(1, qrSide);

  const stats = input.stats
    .map((stat, index) => {
      const y = 690 + index * 26;
      const fraction = stat.ceiling <= 0 ? 0 : Math.max(0, Math.min(1, stat.value / stat.ceiling));
      return (
        `<text x="52" y="${y}" font-family="${MONO}" font-size="9.5" fill="${PENCIL}" letter-spacing="1.4">${escape(stat.name.toUpperCase())}</text>` +
        `<rect x="150" y="${y - 8}" width="240" height="4" fill="rgba(36,31,26,0.12)"/>` +
        `<rect x="150" y="${y - 8}" width="${(240 * fraction).toFixed(1)}" height="4" fill="${INK}" opacity="0.8"/>` +
        `<text x="404" y="${y}" font-family="${MONO}" font-size="10" fill="${INK}">${stat.value.toFixed(0)} / ${stat.ceiling.toFixed(0)}</text>`
      );
    })
    .join("");

  // Two narrow columns down the left, because the QR owns the right-hand
  // margin. Genotypes are clipped rather than allowed to run under it: a
  // certificate with text disappearing behind a barcode is not printable.
  const clip = (text: string, limit: number): string =>
    text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
  const read =
    input.readLoci.length === 0
      ? `<text x="52" y="${LOCI_TOP}" font-family="${SERIF}" font-size="11" font-style="italic" fill="${PENCIL}">Genotype — not determined.</text>`
      : input.readLoci
          .slice(0, 12)
          .map(
            (entry, index) =>
              `<text x="${52 + (index % 2) * 214}" y="${LOCI_TOP + Math.floor(index / 2) * 17}" font-family="${MONO}" font-size="9" fill="${INK}">${escape(clip(entry.locus, 13))} <tspan fill="${PENCIL}">${escape(clip(entry.genotype, 14))}</tspan></text>`,
          )
          .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Lineage certificate for ${escape(input.name)}, a ${escape(input.species)}">
  <title>Lineage certificate — ${escape(input.name)}</title>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${WIDTH - 36}" height="${HEIGHT - 36}" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.55"/>
  <rect x="26" y="26" width="${WIDTH - 52}" height="${HEIGHT - 52}" fill="none" stroke="${INK}" stroke-width="0.5" opacity="0.35"/>

  <text x="52" y="76" font-family="${MONO}" font-size="10" letter-spacing="3.4" fill="${STAMP}">LINEAGE CERTIFICATE</text>
  <text x="52" y="120" font-family="${SERIF}" font-size="34" fill="${INK}">${escape(input.name)}</text>
  <text x="52" y="146" font-family="${SERIF}" font-size="14" font-style="italic" fill="${PENCIL}">${escape(input.species)} · ${input.sex === "female" ? "♀" : "♂"}${input.branch ? ` · ${escape(input.branch)}` : ""}</text>
  <line x1="52" y1="164" x2="${WIDTH - 52}" y2="164" stroke="${RULE}" stroke-width="1"/>

  <g transform="translate(52 184)">${inner}</g>

  <g transform="translate(400 190)">
    <text x="0" y="0" font-family="${MONO}" font-size="9" letter-spacing="2.2" fill="${PENCIL}">STATION</text>
    <text x="0" y="18" font-family="${SERIF}" font-size="13" fill="${INK}">${escape(input.station)}</text>
    <text x="0" y="46" font-family="${MONO}" font-size="9" letter-spacing="2.2" fill="${PENCIL}">RECORDED</text>
    <text x="0" y="64" font-family="${SERIF}" font-size="13" fill="${INK}">Day ${input.day}</text>
    <text x="0" y="92" font-family="${MONO}" font-size="9" letter-spacing="2.2" fill="${PENCIL}">GENERATION</text>
    <text x="0" y="110" font-family="${SERIF}" font-size="13" fill="${INK}">${input.generation}</text>
    <text x="0" y="138" font-family="${MONO}" font-size="9" letter-spacing="2.2" fill="${PENCIL}">WRIGHT'S F</text>
    <text x="0" y="156" font-family="${SERIF}" font-size="13" fill="${INK}">${input.inbreeding.toFixed(4)}</text>
  </g>

  <text x="52" y="424" font-family="${MONO}" font-size="10" letter-spacing="3" fill="${STAMP}">PEDIGREE</text>
  <line x1="52" y1="436" x2="${WIDTH - 52}" y2="436" stroke="${RULE}" stroke-width="1"/>
  ${pedigreeBlock(input.ancestors, 52, 446, WIDTH - 104, 200)}

  <text x="52" y="674" font-family="${MONO}" font-size="10" letter-spacing="3" fill="${STAMP}">ACHIEVED AGAINST CEILING</text>
  ${stats}

  <text x="52" y="${LOCI_TOP - 16}" font-family="${MONO}" font-size="10" letter-spacing="3" fill="${STAMP}">ESTABLISHED LOCI</text>
  ${read}

  <g transform="translate(${(WIDTH - 52 - qrSide * qrScale).toFixed(1)} ${(LOCI_TOP - 34).toFixed(1)}) scale(${qrScale.toFixed(3)})">${qrInner}</g>
  <text x="52" y="${HEIGHT - 74}" font-family="${SERIF}" font-size="11" font-style="italic" fill="${PENCIL}">Breed to this animal by scanning the code.</text>
  <text x="52" y="${HEIGHT - 56}" font-family="${SERIF}" font-size="11" font-style="italic" fill="${PENCIL}">It carries the genome and none of the answers.</text>
  <text x="52" y="${HEIGHT - 34}" font-family="${MONO}" font-size="8" letter-spacing="1.6" fill="${PENCIL}">VERDANCE · ${escape(input.station.toUpperCase())} · DAY ${input.day}</text>
</svg>`;
}
