/**
 * @chimaera/genetics — the simulation core.
 *
 * Pure TypeScript, zero runtime dependencies, no knowledge of rendering, saves,
 * or gameplay. Everything in here runs headless in Node, which is the point:
 * the maths has to be verifiable before anything is pretty.
 */

export * from "./types.js";
export * from "./rng.js";
export { GeneMap } from "./genemap.js";
export type { CompiledChromosome, CompiledPolygenicTrait } from "./genemap.js";
export * from "./genome.js";
export * from "./meiosis.js";
export * from "./mutation.js";
export * from "./expression.js";
export * from "./pedigree.js";
export * from "./epigenetics.js";
export * from "./breeding.js";
export * from "./predict.js";
export * from "./species/index.js";
