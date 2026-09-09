/**
 * Core data types for the genetics engine.
 *
 * Nothing in this file knows about rendering, saves, or gameplay. A genome is a
 * plain, serialisable value; a species definition is authored data; a phenotype
 * is the read-only result of expressing one against the other.
 */

export type SpeciesId = string;
export type ChromosomeId = string;
export type LocusId = string;
export type AlleleId = string;
export type TraitId = string;
export type StatId = string;

export type Sex = "female" | "male";

/**
 * Which physical chromosome a haplotype is a copy of. Autosomes pair freely;
 * an X and a Y in the same cell are heteromorphic and do not cross over, which
 * is what makes sex linkage behave the way players expect.
 */
export type HaplotypeKind = "autosome" | "X" | "Y";

/**
 * One parental copy of one chromosome.
 *
 * `genes` maps a locus to the alleles carried at that locus *on this copy*.
 * Normally that array has exactly one entry. It holds two after a copy-number
 * duplication event (§1.4), which is why this is an array and not a scalar —
 * duplications must travel with the haplotype through meiosis. A locus absent
 * from the map is genuinely absent from this copy (e.g. an X-linked locus on a
 * Y haplotype), which is how hemizygosity is represented.
 */
export interface Haplotype {
  readonly kind: HaplotypeKind;
  readonly genes: Readonly<Record<LocusId, readonly AlleleId[]>>;
}

export interface ChromosomePair {
  readonly maternal: Haplotype;
  readonly paternal: Haplotype;
}

export interface Genome {
  readonly species: SpeciesId;
  readonly chromosomes: Readonly<Record<ChromosomeId, ChromosomePair>>;
}

/** A haploid cell: one haplotype per chromosome, plus any mutations it acquired. */
export interface Gamete {
  readonly species: SpeciesId;
  readonly haplotypes: Readonly<Record<ChromosomeId, Haplotype>>;
  readonly mutations: readonly MutationEvent[];
}

export type MutationKind = "point" | "novel" | "duplication";

export interface MutationEvent {
  readonly kind: MutationKind;
  readonly locus: LocusId;
  readonly from?: AlleleId;
  readonly to: AlleleId;
}

/** How the alleles at one locus combine into an observable value. */
export type ExpressionMode =
  /** Highest `dominance` rank present wins outright. Supports multi-allele series. */
  | { readonly kind: "dominance" }
  /** Heterozygote blends: the mean of the alleles' `value`s. */
  | { readonly kind: "incomplete_dominance" }
  /** Every distinct allele's `mark` is layered simultaneously. */
  | { readonly kind: "codominance" }
  /** Contributes `value` to a named stat summed across several loci. */
  | { readonly kind: "polygenic" };

export interface LethalSpec {
  /** Only recessive lethals for now: the heterozygote is fine, often prized. */
  readonly mode: "recessive";
  readonly stage: "egg";
  readonly reason: string;
}

export interface AlleleDef {
  readonly id: AlleleId;
  readonly name: string;
  /** Dominance rank for `dominance` mode. Higher masks lower. */
  readonly dominance?: number;
  /** Numeric contribution for `incomplete_dominance` and `polygenic` modes. */
  readonly value?: number;
  /** Visible layer for `codominance` mode. `null` means "contributes nothing". */
  readonly mark?: string | null;
  /** Phenotype label emitted by `dominance` mode. */
  readonly phenotype?: string;
  readonly lethal?: LethalSpec;
  /** True for alleles that exist in no wild population — the treasure (§1.4). */
  readonly novel?: boolean;
  /** Relative weight when drawing wild stock. Omitted or 0 means "never wild". */
  readonly wildFrequency?: number;
  readonly note?: string;
}

export interface LocusDef {
  readonly id: LocusId;
  readonly name: string;
  readonly chromosome: ChromosomeId;
  /** Map position in centimorgans. Distance here *is* linkage strength. */
  readonly position: number;
  readonly mode: ExpressionMode;
  readonly alleles: readonly AlleleDef[];
  /** Output key in `Phenotype.traits` / `Phenotype.values`. */
  readonly trait?: TraitId;
  /** Target stat for `polygenic` mode. */
  readonly stat?: StatId;
  /** Grouping used by epistasis rules ("pigment", "luminance", ...). */
  readonly tags?: readonly string[];
  /** Sex-limited expression: present in both sexes, visible in only one. */
  readonly expressedInSex?: Sex;
  /** Trait label used when sex-limited expression suppresses this locus. */
  readonly suppressedPhenotype?: string;
  /** Restricts the locus to one member of a heteromorphic pair (X- or Y-linked). */
  readonly onlyOn?: Exclude<HaplotypeKind, "autosome">;
}

export interface ChromosomeDef {
  readonly id: ChromosomeId;
  readonly name: string;
  readonly type: "autosome" | "sex";
  readonly lengthCm: number;
}

export interface PolygenicTraitDef {
  readonly id: StatId;
  readonly name: string;
  readonly loci: readonly LocusId[];
  /** Stat value when every contributing allele is the worst available. */
  readonly min: number;
  /** Stat value when every contributing allele is the best available. */
  readonly max: number;
}

export type EpistasisCondition =
  | { readonly kind: "homozygous"; readonly allele: AlleleId }
  | { readonly kind: "carries"; readonly allele: AlleleId }
  | { readonly kind: "lacks"; readonly allele: AlleleId };

/** One locus gating others entirely (§1.2). The albinism switch is the archetype. */
export interface EpistasisRule {
  readonly id: string;
  readonly name: string;
  readonly gate: LocusId;
  readonly when: EpistasisCondition;
  /**
   * Further loci that must *also* satisfy their condition for the gate to
   * close, which is what a multi-stage cascade is.
   *
   * A single switch is the lesson a player learns first; a cascade is the
   * species that teaches them the first lesson was a special case, because the
   * test cross that solved one switch gives a contradictory answer against two.
   */
  readonly also?: readonly { readonly locus: LocusId; readonly when: EpistasisCondition }[];
  /** Loci carrying any of these tags stop expressing while the gate is closed. */
  readonly masksTags: readonly string[];
  readonly setTraits?: Readonly<Record<TraitId, string>>;
  readonly setColour?: Hsl;
}

export interface Hsl {
  /** Degrees, 0–360. */
  readonly h: number;
  /** 0–1. */
  readonly s: number;
  /** 0–1. */
  readonly l: number;
}

/**
 * Species palette bounds. Colour loci produce 0–1 values that are mapped into
 * these ranges, which is what keeps mutated palettes coherent instead of muddy
 * (§6.3). The hue range must not wrap through 0, so blending stays monotone.
 */
export interface PaletteSpec {
  readonly hue: readonly [number, number];
  readonly saturation: readonly [number, number];
  readonly lightness: readonly [number, number];
  readonly hueLocus: LocusId;
  readonly saturationLocus: LocusId;
  readonly lightnessLocus: LocusId;
}

/**
 * Linkage disequilibrium in the founding wild population: the reason the fast
 * allele arrives welded to the lethal one, generation after generation, until
 * the player breaks it (§1.1, "linkage drag").
 */
export interface WildCouplingRule {
  readonly id: string;
  readonly note: string;
  readonly chromosome: ChromosomeId;
  readonly ifLocus: LocusId;
  readonly ifAllele: AlleleId;
  readonly thenLocus: LocusId;
  readonly thenAllele: AlleleId;
  /** P(then | if) on a freshly drawn wild haplotype. */
  readonly coupling: number;
}

export interface SpeciesDef {
  readonly id: SpeciesId;
  readonly name: string;
  /** Real-world ecological inspiration (§6.5). */
  readonly inspiration: string;
  /** One-line personality hook (§6.5). */
  readonly hook: string;
  readonly biome: string;
  readonly chromosomes: readonly ChromosomeDef[];
  readonly sexChromosome: ChromosomeId;
  readonly loci: readonly LocusDef[];
  readonly polygenicTraits: readonly PolygenicTraitDef[];
  readonly epistasis: readonly EpistasisRule[];
  readonly palette: PaletteSpec;
  readonly wildCoupling: readonly WildCouplingRule[];
}

export interface Phenotype {
  readonly species: SpeciesId;
  readonly sex: Sex;
  /** Discrete observable labels, keyed by trait id. */
  readonly traits: Readonly<Record<TraitId, string>>;
  /** Continuous observable values in 0–1, keyed by trait id. */
  readonly values: Readonly<Record<TraitId, number>>;
  /** Layered co-dominant marks, sorted for stable rendering. */
  readonly marks: readonly string[];
  /** Genetic ceilings. Raising decides how close a creature gets (§1.6). */
  readonly stats: Readonly<Record<StatId, number>>;
  readonly colour: Hsl;
  /** Ids of epistasis rules currently firing, for UI and Compendium hints. */
  readonly epistasisActive: readonly string[];
}
