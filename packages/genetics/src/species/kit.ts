/**
 * Species authoring helpers.
 *
 * Six species (§6.5) means six gene maps, and written longhand each one is four
 * hundred lines of repeated object literals in which a single mistyped
 * frequency hides for a month. These helpers cut an allele to one line.
 *
 * They deliberately do *not* generate a species. Every locus, position and
 * frequency is still authored by hand, because six species that differ only in
 * their allele names would be one species with six coats of paint — and the
 * whole design rests on each having its own linkage problems, its own epistatic
 * switch and its own reasons to breed. The kit removes typing, not decisions.
 *
 * `assertSpeciesInvariants` collects the rules the design makes binding, so a
 * seventh species cannot be added without meeting them.
 */

import type { AlleleDef, LethalSpec, SpeciesDef } from "../types.js";

/** Simple dominance. Higher rank masks lower. */
export function dominant(
  id: string,
  name: string,
  phenotype: string,
  dominance: number,
  wildFrequency?: number,
): AlleleDef {
  return wildFrequency === undefined
    ? { id, name, phenotype, dominance }
    : { id, name, phenotype, dominance, wildFrequency };
}

/** Incomplete dominance. `value` should sit in 0-1; heterozygotes blend. */
export function blend(id: string, name: string, value: number, wildFrequency?: number): AlleleDef {
  return wildFrequency === undefined ? { id, name, value } : { id, name, value, wildFrequency };
}

/** Co-dominance. `mark` is the layer this allele contributes; null contributes none. */
export function marking(
  id: string,
  name: string,
  mark: string | null,
  wildFrequency?: number,
): AlleleDef {
  return wildFrequency === undefined ? { id, name, mark } : { id, name, mark, wildFrequency };
}

/** Polygenic contribution. Three of these per locus, values 0/1/2 by convention. */
export function poly(id: string, name: string, value: number, wildFrequency?: number): AlleleDef {
  return wildFrequency === undefined ? { id, name, value } : { id, name, value, wildFrequency };
}

/**
 * A recessive lethal that is *dominant* for its visible trait: prized in the
 * heterozygote, fatal doubled. Every species carries at least two, and they can
 * never breed true (§1.2).
 */
export function lethal(
  id: string,
  name: string,
  phenotype: string,
  wildFrequency: number,
  reason: string,
): AlleleDef {
  const spec: LethalSpec = { mode: "recessive", stage: "egg", reason };
  return { id, name, phenotype, dominance: 1, wildFrequency, lethal: spec, note: "Lethal when doubled." };
}

/** A novel allele slot: exists in no wild population, named by its discoverer (§8.2). */
export function novelAllele(id: string, name: string, extra: Partial<AlleleDef> = {}): AlleleDef {
  return { id, name, novel: true, note: "Novel allele slot. The first player to find it names it.", ...extra };
}

/** A standard three-allele polygenic set: strong, middling, weak. */
export function polySet(
  prefix: string,
  names: readonly [string, string, string],
  frequencies: readonly [number, number, number] = [0.14, 0.44, 0.42],
): AlleleDef[] {
  return [
    poly(`${prefix}2`, names[0], 2, frequencies[0]),
    poly(`${prefix}1`, names[1], 1, frequencies[1]),
    poly(`${prefix}0`, names[2], 0, frequencies[2]),
  ];
}

/**
 * The design rules §6.5 and §1.2 make binding for every species. Run over each
 * one in the test suite, so a new species cannot ship without them.
 */
export function assertSpeciesInvariants(species: SpeciesDef): string[] {
  const problems: string[] = [];
  const modes = new Set(species.loci.map((l) => l.mode.kind));

  for (const mode of ["dominance", "incomplete_dominance", "codominance", "polygenic"] as const) {
    if (!modes.has(mode)) problems.push(`missing ${mode} locus`);
  }
  if (species.epistasis.length === 0) problems.push("no epistatic gate");
  if (!species.loci.some((l) => l.onlyOn === "X")) problems.push("no X-linked locus");
  if (!species.loci.some((l) => l.expressedInSex)) problems.push("no sex-limited locus");

  const lethals = species.loci.flatMap((l) => l.alleles.filter((a) => a.lethal));
  if (lethals.length < 2) problems.push(`only ${lethals.length} lethal allele(s); the design calls for two`);
  for (const allele of lethals) {
    const frequency = allele.wildFrequency ?? 0;
    if (frequency <= 0 || frequency >= 0.15) {
      problems.push(`lethal "${allele.id}" at wild frequency ${frequency}: must be rare but meetable`);
    }
  }

  const novel = species.loci.flatMap((l) => l.alleles.filter((a) => a.novel));
  if (novel.length < 3) problems.push(`only ${novel.length} novel allele slot(s); the discovery hook needs at least 3`);

  // The gate must not be linked to what it masks, or the lesson is muddied by
  // drag (see DECISIONS D16).
  for (const rule of species.epistasis) {
    const gate = species.loci.find((l) => l.id === rule.gate);
    const masked = species.loci.filter((l) => l.tags?.some((tag) => rule.masksTags.includes(tag)));
    if (masked.length === 0) problems.push(`epistasis "${rule.id}" masks nothing`);
    for (const locus of masked) {
      if (gate && locus.chromosome === gate.chromosome) {
        problems.push(`epistasis "${rule.id}" gates "${locus.id}" on its own chromosome`);
      }
    }
  }

  // At least one tightly linked pair, or the species has no drag to break.
  const tight = species.chromosomes.some((chromosome) => {
    const positions = species.loci
      .filter((l) => l.chromosome === chromosome.id)
      .map((l) => l.position)
      .sort((a, b) => a - b);
    return positions.some((p, i) => i > 0 && p - (positions[i - 1] as number) <= 5);
  });
  if (!tight) problems.push("no tightly linked locus pair: nothing for linkage drag to act on");

  if (species.inspiration.length < 10) problems.push("no ecological inspiration recorded");
  if (species.hook.length < 10) problems.push("no personality hook recorded");

  return problems;
}
