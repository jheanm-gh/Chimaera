/**
 * Phase 2 deliverable: a plate of 50 randomly generated Quillfen.
 *
 *   npm run gallery                       # writes out/gallery.html
 *   npm run gallery -- --seed=mirefen --count=50
 *
 * Presented as a monograph plate rather than a debug grid, because the thing
 * being checked is whether procedural variation reads as *authentic* (§6.2). A
 * page of specimens mounted on board answers that; a page of floating shapes on
 * white does not.
 *
 * Every card records "genotype — not determined". That is both correct for a
 * specimen catalogue and the design law of the game: the plate shows what can
 * be observed, and nothing else.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  carriedLethals,
  createRng,
  expressPhenotype,
  geneMapFor,
  QUILLFEN,
  randomWildGenome,
} from "@chimaera/genetics";
import type { Genome, Phenotype } from "@chimaera/genetics";
import { renderCreature } from "../src/render.js";
import { coverage, rasteriseSilhouette } from "../src/silhouette.js";
import { toSvg } from "../src/svg.js";
import type { PaletteMode, Silhouette } from "../src/index.js";

const map = geneMapFor(QUILLFEN);

interface Options {
  seed: string;
  count: number;
  out: string;
}

function parseOptions(argv: readonly string[]): Options {
  const options: Options = { seed: "plate-i", count: 50, out: "out/gallery.html" };
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (!match) continue;
    const [, key, value] = match as unknown as [string, string, string];
    if (key === "seed") options.seed = value;
    else if (key === "count") options.count = Number(value);
    else if (key === "out") options.out = value;
  }
  return options;
}

interface Specimen {
  readonly accession: string;
  readonly genome: Genome;
  readonly phenotype: Phenotype;
  readonly svg: string;
  readonly silhouette: Silhouette;
}

function collect(options: Options): Specimen[] {
  const rng = createRng(options.seed);
  const specimens: Specimen[] = [];
  for (let i = 0; i < options.count; i++) {
    const genome = randomWildGenome(map, rng);
    const phenotype = expressPhenotype(genome, map);
    const drawing = renderCreature(phenotype, map);
    specimens.push({
      accession: `MF-${String(i + 1).padStart(4, "0")}`,
      genome,
      phenotype,
      svg: toSvg(drawing, { width: 240, height: 150 }),
      silhouette: rasteriseSilhouette(drawing, 32),
    });
  }
  return specimens;
}

/** The 32x32 identity test, drawn as an actual chip so it can be judged by eye. */
function silhouetteChip(silhouette: Silhouette, pixel = 1.5): string {
  const rects: string[] = [];
  for (let y = 0; y < silhouette.size; y++) {
    for (let x = 0; x < silhouette.size; x++) {
      if (!silhouette.pixels[y * silhouette.size + x]) continue;
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  const side = silhouette.size * pixel;
  return (
    `<svg viewBox="0 0 ${silhouette.size} ${silhouette.size}" width="${side}" height="${side}" ` +
    `role="img" aria-label="Silhouette at 32 by 32 pixels" shape-rendering="crispEdges">` +
    `<g fill="currentColor">${rects.join("")}</g></svg>`
  );
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function specimenCard(specimen: Specimen): string {
  const { phenotype } = specimen;
  const carried = carriedLethals(specimen.genome, map);
  const flags: string[] = [];
  if (phenotype.traits.sheen === "prismatic") flags.push("prism");
  if (phenotype.traits.lantern === "lantern") flags.push("lantern");
  if (phenotype.traits.pigmentation === "albino") flags.push("albino");
  if (phenotype.traits.crest === "grand") flags.push("crest");
  if (phenotype.traits.dorsal === "crowned") flags.push("novel: crown");

  const stats = ["speed", "vigour", "focus"]
    .map((id) => {
      const trait = map.polygenicTrait(id);
      const value = phenotype.stats[id] ?? 0;
      const fraction = (value - trait.min) / (trait.max - trait.min);
      return (
        `<div class="stat"><span class="stat-name">${trait.name.slice(0, 3)}</span>` +
        `<span class="stat-bar"><i style="width:${(fraction * 100).toFixed(0)}%"></i></span>` +
        `<span class="stat-value">${value.toFixed(0)}</span></div>`
      );
    })
    .join("");

  return `<figure class="specimen">
  <div class="specimen-head">
    <span class="accession">${specimen.accession}</span>
    <span class="sex" title="${phenotype.sex}">${phenotype.sex === "female" ? "♀" : "♂"}</span>
    <span class="chip" title="Silhouette test: ${(coverage(specimen.silhouette) * 100).toFixed(0)}% coverage">${silhouetteChip(specimen.silhouette)}</span>
  </div>
  <div class="plate">${specimen.svg}</div>
  <figcaption>
    <p class="form">${escapeHtml(
      [phenotype.traits.dorsal, phenotype.traits.limbs, phenotype.traits.tail, phenotype.traits.markings].join(" · "),
    )}</p>
    <div class="stats">${stats}</div>
    ${flags.length > 0 ? `<p class="flags">${flags.map((f) => `<span>${escapeHtml(f)}</span>`).join("")}</p>` : ""}
    <p class="undetermined">genotype — not determined${carried.length > 0 ? ` · carries ${carried.length} lethal${carried.length > 1 ? "s" : ""}` : ""}</p>
  </figcaption>
</figure>`;
}

function visionStrip(specimen: Specimen): string {
  const modes: { mode: PaletteMode; label: string }[] = [
    { mode: "full", label: "Full colour" },
    { mode: "deuteranopia", label: "Deuteranopia" },
    { mode: "protanopia", label: "Protanopia" },
    { mode: "tritanopia", label: "Tritanopia" },
    { mode: "monochrome", label: "Monochrome" },
  ];
  return modes
    .map(({ mode, label }) => {
      const svg = toSvg(renderCreature(specimen.phenotype, map, { mode }), { width: 240, height: 150 });
      return `<figure class="vision"><div class="plate">${svg}</div><figcaption>${label}</figcaption></figure>`;
    })
    .join("");
}

function page(specimens: Specimen[], options: Options): string {
  const albinos = specimens.filter((s) => s.phenotype.traits.pigmentation === "albino").length;
  const carriers = specimens.filter((s) => carriedLethals(s.genome, map).length > 0).length;
  const meanCoverage =
    specimens.reduce((sum, s) => sum + coverage(s.silhouette), 0) / specimens.length;
  const exemplar = specimens.find((s) => s.phenotype.traits.markings !== "none") ?? (specimens[0] as Specimen);

  return `<title>Mirefen Plate I</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;700&family=Spectral:ital,wght@0,300;0,400;0,500;1,300&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  /* A specimen monograph commits to one visual world: pale mounted cards on a
     dark herbarium board. Every colour is painted explicitly, so the plate
     holds whatever ground the viewer's theme paints behind it. */
  :root {
    --board: #3b4038;
    --board-deep: #2f332c;
    --board-edge: #262a24;
    --card: #f2ece0;
    --ink: #241f1a;
    --pencil: #6e6558;
    --stamp: #a8371f;
    --rule: rgba(220, 222, 212, 0.22);
    --pale: #dcded4;
    --pale-dim: #9ea497;
    --measure: 66ch;
  }

  html { color-scheme: dark; }

  body {
    margin: 0;
    background:
      radial-gradient(120% 80% at 50% -10%, #454b41 0%, var(--board) 45%, var(--board-edge) 100%);
    color: var(--pale);
    font-family: Spectral, Georgia, "Times New Roman", serif;
    font-size: 16px;
    line-height: 1.6;
    padding: clamp(24px, 5vw, 72px) clamp(16px, 4vw, 56px) 96px;
  }

  .sheet { max-width: 1240px; margin: 0 auto; }

  .eyebrow {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--pale-dim);
    margin: 0 0 10px;
  }

  h1 {
    font-family: "Zilla Slab", Georgia, serif;
    font-weight: 700;
    font-size: clamp(34px, 5.5vw, 58px);
    line-height: 1.02;
    letter-spacing: -0.015em;
    margin: 0;
    text-wrap: balance;
    color: #f0f2e8;
  }

  .binomial {
    font-style: italic;
    font-weight: 300;
    color: var(--pale-dim);
    font-size: clamp(15px, 2vw, 19px);
    margin: 10px 0 0;
  }

  .lede {
    max-width: var(--measure);
    font-size: 17px;
    font-weight: 300;
    color: #cfd3c7;
    margin: 22px 0 0;
  }

  .rule { border: 0; border-top: 1px solid var(--rule); margin: 30px 0 0; }

  .ledger {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 2px 28px;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    margin-top: 22px;
  }
  .ledger div { display: flex; flex-direction: column; gap: 3px; padding: 10px 0; }
  .ledger dt, .ledger .k {
    font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--pale-dim);
  }
  .ledger .val { font-size: 17px; color: #f0f2e8; font-weight: 500; }

  h2 {
    font-family: "Zilla Slab", Georgia, serif;
    font-weight: 500;
    font-size: 22px;
    letter-spacing: 0.01em;
    margin: 56px 0 6px;
    color: #eef0e6;
  }
  h2 + p { max-width: var(--measure); color: var(--pale-dim); font-weight: 300; margin: 0 0 22px; font-size: 15px; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
    gap: 20px;
  }

  /* The card is the mount; the SVG brings its own paper, so the two must agree
     on the paper colour exactly or a seam shows at the edge. */
  .specimen {
    margin: 0;
    background: var(--card);
    color: var(--ink);
    border-radius: 2px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.14) inset, 0 6px 18px rgba(0,0,0,0.34);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .specimen-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px 7px;
    border-bottom: 1px solid rgba(36,31,26,0.16);
  }
  .accession {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--stamp);
    font-weight: 500;
  }
  .sex { font-size: 15px; color: var(--ink); line-height: 1; }
  .chip { margin-left: auto; color: var(--ink); display: block; line-height: 0; opacity: 0.9; }

  .plate { line-height: 0; }
  .plate svg { display: block; width: 100%; height: auto; }

  figcaption { padding: 10px 12px 13px; display: flex; flex-direction: column; gap: 8px; }

  .form {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink);
    margin: 0;
  }

  .stats { display: flex; flex-direction: column; gap: 3px; }
  .stat {
    display: grid;
    grid-template-columns: 26px 1fr 26px;
    align-items: center;
    gap: 7px;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: var(--pencil);
  }
  .stat-name { text-transform: uppercase; letter-spacing: 0.1em; }
  .stat-bar { height: 3px; background: rgba(36,31,26,0.14); position: relative; }
  .stat-bar i { position: absolute; inset: 0 auto 0 0; background: var(--ink); opacity: 0.75; }
  .stat-value { text-align: right; color: var(--ink); }

  .flags { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; }
  .flags span {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border: 1px solid var(--stamp);
    color: var(--stamp);
    padding: 1px 5px;
    border-radius: 1px;
  }

  .undetermined {
    font-size: 11px;
    font-style: italic;
    font-weight: 300;
    color: var(--pencil);
    margin: 0;
  }

  .vision-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
  .vision { margin: 0; background: var(--card); border-radius: 2px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.3); }
  .vision figcaption {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--pencil);
    padding: 8px 10px 10px;
  }

  .colophon {
    margin-top: 64px;
    padding-top: 20px;
    border-top: 1px solid var(--rule);
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 11px;
    line-height: 1.9;
    color: var(--pale-dim);
    max-width: var(--measure);
  }
  .colophon b { color: var(--pale); font-weight: 500; }

  @media (prefers-reduced-motion: no-preference) {
    .specimen { transition: transform 140ms ease, box-shadow 140ms ease; }
    .specimen:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(0,0,0,0.42); }
  }
</style>

<div class="sheet">
  <header>
    <p class="eyebrow">Mirefen Survey · Plate I · Phase 2 output</p>
    <h1>Fifty Quillfen, drawn from their genomes</h1>
    <p class="binomial">Quillfen <i>Ambystoma cristata</i> — Mirefen, standing water among reed shadow</p>
    <p class="lede">
      Every animal on this plate was generated from a diploid genome by the same
      deterministic renderer, with no hand-drawn art anywhere in the pipeline.
      Nine part slots — body, head, limbs, tail, dorsal ridge, crest, marking
      layer, palette, size — are driven directly by named loci. Two specimens
      that look identical here have not been proven identical underneath: the
      renderer reads only the phenotype, so a plate can never give away a
      genotype the observer has not earned.
    </p>
    <hr class="rule">
    <dl class="ledger">
      <div><dt class="k">Specimens</dt><dd class="val">${specimens.length}</dd></div>
      <div><dt class="k">Collection seed</dt><dd class="val">${escapeHtml(options.seed)}</dd></div>
      <div><dt class="k">Loci expressed</dt><dd class="val">${map.loci.length}</dd></div>
      <div><dt class="k">Albinistic</dt><dd class="val">${albinos}</dd></div>
      <div><dt class="k">Lethal carriers</dt><dd class="val">${carriers}</dd></div>
      <div><dt class="k">Mean silhouette fill</dt><dd class="val">${(meanCoverage * 100).toFixed(0)}%</dd></div>
    </dl>
  </header>

  <h2>The plate</h2>
  <p>
    Each card carries its accession number, its sex, and its silhouette reduced
    to 32 by 32 pixels — the test that decides whether a creature is a franchise
    or an asset pack. The bars are genetic ceilings, not achieved stats: what
    this animal could become if it were raised perfectly.
  </p>
  <div class="grid">
${specimens.map(specimenCard).join("\n")}
  </div>

  <h2>The same animal, five ways of seeing</h2>
  <p>
    The whole game is colour-coded genetics, so colourblind modes are not a
    courtesy — they decide whether a pedigree is readable at all. Each mode
    remaps the species' hue arc onto an axis that vision type retains, keeping
    the ordering intact, and every marking carries a hatch texture so colour is
    never the only channel.
  </p>
  <div class="vision-strip">
${visionStrip(exemplar)}
  </div>

  <div class="colophon">
    <b>Method.</b> Founders drawn from the wild Mirefen allele pool with a seeded
    xoshiro128** stream; phenotypes expressed through the Phase 1 genetics core;
    parts generated parametrically and flattened to point rings, then smoothed
    to bezier for print and rasterised for the silhouette test.<br>
    <b>Reproduce.</b> npm run gallery -- --seed=${escapeHtml(options.seed)} --count=${specimens.length}<br>
    <b>Note.</b> Genotypes were not determined for any specimen on this plate.
  </div>
</div>`;
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const specimens = collect(options);
  const html = page(specimens, options);
  const target = resolve(process.cwd(), options.out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, "utf8");
  console.log(`Wrote ${specimens.length} specimens to ${target} (${(html.length / 1024).toFixed(0)} KB)`);
}

main();
