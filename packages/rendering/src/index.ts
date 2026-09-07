/**
 * @chimaera/rendering — genotype to visual, deterministically.
 *
 * Reads a Phenotype and produces drawing data. Never reads a genome, so the
 * picture cannot leak information the player has not earned.
 */

export * from "./types.js";
export * from "./geometry.js";
export * from "./palette.js";
export * from "./render.js";
export * from "./svg.js";
export * from "./silhouette.js";
export * as quillfenRig from "./rig/quillfen.js";
