/**
 * Drawing -> SVG string.
 *
 * Pure string building, no DOM, so it runs in Node for tests, for the gallery
 * tool, and later for lineage certificates (§8.4). React consumes the same
 * `Drawing` directly rather than parsing this output.
 *
 * Closed smooth rings are emitted as Catmull-Rom curves converted to cubic
 * beziers. That is what turns a flattened point ring back into the confident
 * ink line the art direction asks for, without the geometry ever having been
 * stored as curves.
 */

import type { ColourRole, Drawing, HatchPattern, Mark, ResolvedPalette, Ring, Vec2 } from "./types.js";

/**
 * One decimal place. At the sizes these drawings are viewed, the second decimal
 * is invisible and costs about a fifth of the file — which matters when a ranch
 * screen holds hundreds of them.
 */
function n(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function colour(role: ColourRole | undefined, palette: ResolvedPalette): string {
  if (role === undefined) return "none";
  if (role === "none") return "none";
  return palette[role];
}

/**
 * Catmull-Rom through every point, converted to cubic beziers. Tension 0.5 is
 * the standard uniform variant; higher values overshoot on tight rings like
 * gill fronds.
 */
export function smoothClosedPath(points: Ring): string {
  const count = points.length;
  if (count < 3) return polylinePath(points, true);
  const at = (i: number): Vec2 => points[((i % count) + count) % count] as Vec2;
  const parts: string[] = [`M ${n(at(0).x)} ${n(at(0).y)}`];
  for (let i = 0; i < count; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    parts.push(`C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${n(p2.x)} ${n(p2.y)}`);
  }
  return `${parts.join(" ")} Z`;
}

export function polylinePath(points: Ring, closed: boolean): string {
  if (points.length === 0) return "";
  const head = points[0] as Vec2;
  const body = points.slice(1).map((p) => `L ${n(p.x)} ${n(p.y)}`);
  return `M ${n(head.x)} ${n(head.y)} ${body.join(" ")}${closed ? " Z" : ""}`;
}

export function markToPath(mark: Mark): string | undefined {
  if (mark.shape.kind === "circle") return undefined;
  return mark.shape.smooth && mark.shape.closed
    ? smoothClosedPath(mark.shape.points)
    : polylinePath(mark.shape.points, mark.shape.closed);
}

const HATCH_DEFS: Record<Exclude<HatchPattern, "none">, string> = {
  dots: '<circle cx="3" cy="3" r="1.1" />',
  lines: '<path d="M 0 6 L 6 0" stroke-width="1.2" fill="none" />',
  cross: '<path d="M 0 6 L 6 0 M 0 0 L 6 6" stroke-width="1" fill="none" />',
  wave: '<path d="M 0 4 Q 1.5 1, 3 4 T 6 4" stroke-width="1" fill="none" />',
};

export interface SvgOptions {
  /** Rendered pixel size. Defaults to the drawing's own units. */
  readonly width?: number;
  readonly height?: number;
  /**
   * Namespace for this drawing's internal element ids.
   *
   * Load-bearing: SVG ids share the host document's namespace, so a page
   * holding fifty creatures with the same `body-clip` id would clip every
   * creature's markings to the *first* creature's outline. Defaults to a hash
   * of the drawing, which keeps it unique per creature and stable per render.
   */
  readonly idPrefix?: string;
  /** Paper ground and specimen-catalogue frame. */
  readonly journalFrame?: boolean;
  /** Extra classes on the root element, for the React app to hook onto. */
  readonly className?: string;
  /** Accessible label. Required in the app; defaults to the caption here. */
  readonly title?: string;
}

export function toSvg(drawing: Drawing, options: SvgOptions = {}): string {
  const { width = drawing.width, height = drawing.height } = options;
  const prefix = options.idPrefix ?? drawingId(drawing);
  const id = (name: string): string => `${prefix}-${name}`;
  const usedHatches = new Set<Exclude<HatchPattern, "none">>();
  for (const layer of drawing.layers) {
    for (const mark of layer.marks) {
      if (mark.hatch && mark.hatch !== "none") usedHatches.add(mark.hatch);
    }
  }

  const defs: string[] = [
    `<clipPath id="${id("clip")}"><path d="${smoothClosedPath(drawing.bodyOutline)}"/></clipPath>`,
  ];
  if (options.journalFrame !== false) defs.push(grainPattern(id("grain")));
  for (const hatch of usedHatches) {
    defs.push(
      `<pattern id="${id(hatch)}" width="6" height="6" patternUnits="userSpaceOnUse" ` +
        `stroke="${drawing.palette.ink}" fill="${drawing.palette.ink}" opacity="0.5">${HATCH_DEFS[hatch]}</pattern>`,
    );
  }

  const body: string[] = [];
  if (options.journalFrame !== false) {
    body.push(`<rect width="${n(drawing.width)}" height="${n(drawing.height)}" fill="${drawing.palette.paper}"/>`);
    body.push(paperGrain(drawing, id("grain")));
  }

  for (const layer of drawing.layers) {
    const marks = layer.marks.map((mark) => markToSvg(mark, drawing.palette, id)).join("");
    body.push(`<g data-layer="${layer.id}">${marks}</g>`);
  }

  if (options.journalFrame !== false) body.push(journalFrame(drawing));

  const title = options.title ?? `${drawing.caption.species}, ${drawing.caption.sex}: ${drawing.caption.form}`;
  const className = options.className ? ` class="${escapeAttribute(options.className)}"` : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(drawing.width)} ${n(drawing.height)}" ` +
    `width="${n(width)}" height="${n(height)}" role="img" aria-label="${escapeAttribute(title)}"${className}>` +
    `<defs>${defs.join("")}</defs>${body.join("")}</svg>`
  );
}

function markToSvg(mark: Mark, palette: ResolvedPalette, id: (name: string) => string): string {
  const attributes: string[] = [];
  const fill = mark.hatch && mark.hatch !== "none" ? `url(#${id(mark.hatch)})` : colour(mark.fill, palette);
  attributes.push(`fill="${fill}"`);
  if (mark.hatch && mark.hatch !== "none" && mark.fill && mark.fill !== "none") {
    // The hatch sits over a flat fill so the marking still reads as a colour.
    attributes.push(`data-under="${colour(mark.fill, palette)}"`);
  }
  if (mark.stroke) {
    attributes.push(`stroke="${colour(mark.stroke, palette)}"`);
    attributes.push(`stroke-width="${n(mark.strokeWidth ?? 1.5)}"`);
    attributes.push(`stroke-linejoin="round"`);
    attributes.push(`stroke-linecap="round"`);
  }
  if (mark.opacity !== undefined) attributes.push(`opacity="${n(mark.opacity)}"`);
  if (mark.clipToBody) attributes.push(`clip-path="url(#${id("clip")})"`);

  const under =
    mark.hatch && mark.hatch !== "none" && mark.fill && mark.fill !== "none"
      ? shapeElement(
          mark,
          [
            `fill="${colour(mark.fill, palette)}"`,
            mark.clipToBody ? `clip-path="url(#${id("clip")})"` : "",
            mark.opacity !== undefined ? `opacity="${n(mark.opacity)}"` : "",
          ].filter(Boolean),
        )
      : "";

  return under + shapeElement(mark, attributes);
}

function shapeElement(mark: Mark, attributes: readonly string[]): string {
  if (mark.shape.kind === "circle") {
    return `<circle cx="${n(mark.shape.c.x)}" cy="${n(mark.shape.c.y)}" r="${n(mark.shape.r)}" ${attributes.join(" ")}/>`;
  }
  return `<path d="${markToPath(mark)}" ${attributes.join(" ")}/>`;
}

/**
 * Faint speckle so flat fills read as paper rather than as vector flatness.
 *
 * A tiled pattern rather than a few hundred circles: at ranch scale the page
 * holds hundreds of these drawings, and the grain was most of the file.
 */
function grainPattern(id: string): string {
  return (
    `<pattern id="${id}" width="13" height="11" patternUnits="userSpaceOnUse">` +
    '<circle cx="2.5" cy="3" r="0.7"/><circle cx="9" cy="1.5" r="0.55"/>' +
    '<circle cx="6" cy="8" r="0.65"/><circle cx="11.5" cy="7" r="0.5"/></pattern>'
  );
}

function paperGrain(drawing: Drawing, grainId: string): string {
  return (
    `<g fill="${drawing.palette.ink}" opacity="0.06">` +
    `<rect width="${n(drawing.width)}" height="${n(drawing.height)}" fill="url(#${grainId})"/></g>`
  );
}

/** Short, stable, collision-resistant id derived from the drawing itself. */
function drawingId(drawing: Drawing): string {
  let hash = 2166136261;
  const source = `${drawing.palette.coat}${drawing.palette.marking}${drawing.caption.form}${drawing.caption.sex}`;
  for (const point of drawing.bodyOutline) {
    hash = Math.imul(hash ^ Math.round(point.x * 10), 16777619) >>> 0;
    hash = Math.imul(hash ^ Math.round(point.y * 10), 16777619) >>> 0;
  }
  for (let i = 0; i < source.length; i++) {
    hash = Math.imul(hash ^ source.charCodeAt(i), 16777619) >>> 0;
  }
  return `q${hash.toString(36)}`;
}

/** Specimen-catalogue furniture: baseline, measurement ticks, typeset label. */
function journalFrame(drawing: Drawing): string {
  const baseline = drawing.height - 20;
  const ticks: string[] = [];
  const step = (drawing.width - 40) / drawing.caption.lengthUnits;
  for (let i = 0; i <= drawing.caption.lengthUnits; i++) {
    const x = 20 + i * step;
    const tall = i % 5 === 0;
    ticks.push(`<line x1="${n(x)}" y1="${n(baseline)}" x2="${n(x)}" y2="${n(baseline + (tall ? 5 : 2.5))}"/>`);
  }
  const notes = drawing.caption.notes.length > 0 ? ` — ${drawing.caption.notes.join(", ")}` : "";
  const label = escapeText(
    `${drawing.caption.species} · ${drawing.caption.sex === "female" ? "♀" : "♂"} · ${drawing.caption.form}${notes}`,
  );
  return (
    `<g stroke="${drawing.palette.ink}" stroke-width="0.9" opacity="0.55">` +
    `<line x1="20" y1="${n(baseline)}" x2="${n(drawing.width - 20)}" y2="${n(baseline)}"/>${ticks.join("")}</g>` +
    `<text x="20" y="${n(drawing.height - 6)}" font-family="Georgia, 'Iowan Old Style', serif" font-size="7.5" ` +
    `fill="${drawing.palette.ink}" opacity="0.8" letter-spacing="0.3">${label}</text>`
  );
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
