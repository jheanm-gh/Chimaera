/**
 * Drawing model.
 *
 * The renderer produces *data*, not markup and not pixels. Two consumers read
 * it: an SVG serialiser (screen, and later lineage certificates and print), and
 * a silhouette rasteriser (the 32x32 identity test in §6.4). Keeping the
 * geometry in one place means those two can never disagree about what a
 * creature looks like.
 *
 * Every closed outline is stored as a **ring of points**, already flattened.
 * The SVG serialiser smooths those points back into curves; the rasteriser
 * fills them as polygons. One geometric source of truth, two outputs. Storing
 * bezier path strings instead would have made the silhouette test require a
 * full curve rasteriser, and a silhouette test nobody can run is not a test.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type Ring = readonly Vec2[];

export type Shape =
  | { readonly kind: "path"; readonly points: Ring; readonly closed: boolean; readonly smooth: boolean }
  | { readonly kind: "circle"; readonly c: Vec2; readonly r: number };

/** Named colour roles, resolved by the palette. Marks refer to roles, not hex. */
export type ColourRole =
  | "ink"
  | "outline"
  | "coat"
  | "coatShade"
  | "coatLight"
  | "belly"
  | "marking"
  | "markingAlt"
  | "eye"
  | "glow"
  | "paper"
  | "none";

export interface Mark {
  readonly shape: Shape;
  readonly fill?: ColourRole;
  readonly stroke?: ColourRole;
  readonly strokeWidth?: number;
  readonly opacity?: number;
  /** Clip to the body outline, for markings that must not spill off the flank. */
  readonly clipToBody?: boolean;
  /**
   * Excluded from the silhouette raster. Glows, annotation and paper texture
   * are not part of the creature's shape, and §6.4 is a test about shape.
   */
  readonly ghost?: boolean;
  /** Cross-hatch texture id, used so markings stay distinguishable without colour. */
  readonly hatch?: HatchPattern;
}

export type HatchPattern = "none" | "dots" | "lines" | "cross" | "wave";

export interface Layer {
  readonly id: string;
  readonly marks: readonly Mark[];
}

export interface ResolvedPalette {
  /** The journal's pen: frame, ticks, typeset label. Constant. */
  readonly ink: string;
  /**
   * The creature's linework. Normally the same pen, lifted to a warmer, lighter
   * sepia when the coat is too dark for a near-black line to read against it —
   * which is exactly what an illustrator does when drawing a dark specimen.
   */
  readonly outline: string;
  readonly coat: string;
  readonly coatShade: string;
  readonly coatLight: string;
  readonly belly: string;
  readonly marking: string;
  readonly markingAlt: string;
  readonly eye: string;
  readonly glow: string;
  readonly paper: string;
}

export interface Drawing {
  readonly width: number;
  readonly height: number;
  /** Painted back to front. */
  readonly layers: readonly Layer[];
  readonly palette: ResolvedPalette;
  /** The body outline, used for clipping and for the silhouette. */
  readonly bodyOutline: Ring;
  /** Specimen-catalogue caption text, in field-journal style. */
  readonly caption: CaptionData;
}

export interface CaptionData {
  readonly species: string;
  readonly sex: "female" | "male";
  /** Short descriptive line, e.g. "quilled / paddle / spotted". */
  readonly form: string;
  /** Measurement ticks along the baseline, in arbitrary journal units. */
  readonly lengthUnits: number;
  readonly notes: readonly string[];
}

/**
 * Accessibility modes (§10). The entire game is colour-coded genetics, so this
 * matters unusually much: a player who cannot separate the moss and rust hues
 * must still be able to read a pedigree. Every mode keeps hue *ordering*
 * intact and adds texture, rather than merely shifting colours around.
 */
export type PaletteMode = "full" | "deuteranopia" | "protanopia" | "tritanopia" | "monochrome";

/**
 * How finely to sample the parametric geometry.
 *
 * "full" is the plate, the creature panel and anything printed. "thumb" halves
 * the ring resolution for the ranch grid, where a 210px card cannot show the
 * difference and five hundred of them can very much feel it.
 */
export type DetailLevel = "full" | "thumb";

export interface RenderOptions {
  readonly mode?: PaletteMode;
  readonly detail?: DetailLevel;
  /** Overall scale applied to the whole drawing, before the viewBox. */
  readonly scale?: number;
  /** Draw the field-journal frame: baseline, ticks, typeset label. */
  readonly journalFrame?: boolean;
}
