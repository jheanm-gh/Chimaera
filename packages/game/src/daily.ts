/**
 * Daily Genome (§4): the same pair, the same pool and the same target for
 * everyone, seeded from the date. One attempt.
 *
 * The brief calls this the retention mechanic and says to build the seed system
 * to support it from day one, which is why `Math.random` has been banned from
 * the simulation since the first commit and why the RNG state travels inside
 * the save. Nothing here needed new machinery; it needed the machinery to have
 * been right.
 *
 * **The puzzle is derived from the pair, not hoped for.** A generated target
 * that the given pair cannot reach is a day on which every player in the world
 * fails, and there is no patch that can un-ruin it. So the generator draws the
 * pair first and then reads the target *off* it: an allele both parents carry
 * can always be fixed, and a phenotype one of them can throw can always be
 * thrown again. Difficulty comes from how many such clauses are stacked and how
 * few generations are allowed, not from hoping.
 */

import type { AlleleId, GeneMap, Genome, LocusDef, SpeciesId } from "@chimaera/genetics";
import { createRng, expressPhenotype, geneMapById, randomWildGenome, SPECIES } from "@chimaera/genetics";
import type { TargetClause, Trial } from "./trials.js";
import type { DailyRecord, RanchState } from "./types.js";

/** `YYYY-MM-DD` in UTC. The one place a date is allowed anywhere near the sim. */
export function dailyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface DailyPuzzle {
  readonly key: string;
  readonly trial: Trial;
  readonly sire: Genome;
  readonly dam: Genome;
}

const DAILY_GENERATIONS = 4;

export function dailyPuzzle(key: string): DailyPuzzle {
  const rng = createRng(`daily:${key}`);
  const speciesId: SpeciesId = rng.pick(SPECIES).id;
  const map = geneMapById(speciesId);

  const sire = randomWildGenome(map, rng, { sex: "male" });
  const dam = randomWildGenome(map, rng, { sex: "female" });

  return {
    key,
    sire,
    dam,
    trial: {
      id: `daily-${key}`,
      name: `Daily Genome — ${key}`,
      blurb:
        "The same pair, the same pool and the same target as everyone else who opened the game today. One attempt.",
      species: speciesId,
      tier: 3,
      // The pair is handed over as genomes, so the spec is not used to build it.
      sire: {},
      dam: {},
      target: targetFor(map, sire, dam, rng),
      generations: DAILY_GENERATIONS,
      items: { "field-lens": 4, "assay-bench": 1 },
    },
  };
}

/**
 * Reads a target off the pair.
 *
 * Two or three clauses: fix an allele both parents carry (always reachable,
 * and the one that costs generations), show a phenotype the pair can throw, and
 * — when there is a lethal in the pair — come out clean.
 */
function targetFor(map: GeneMap, sire: Genome, dam: Genome, rng: ReturnType<typeof createRng>): TargetClause[] {
  const clauses: TargetClause[] = [];
  const shared = sharedAlleles(map, sire, dam);

  // A locus where both carry the same allele: fixing it is always possible and
  // takes at least one cross, usually two.
  const fixable = shared.filter(({ allele }) => allele.rare);
  const pick = fixable.length > 0 ? rng.pick(fixable) : shared.length > 0 ? rng.pick(shared) : undefined;
  if (pick) clauses.push({ kind: "homozygous", locus: pick.locus.id, allele: pick.allele.id });

  // A visible trait one of them already shows, at a *different* locus, so the
  // two clauses do not collapse into one.
  const visible = visibleTraits(map, sire, dam).filter((entry) => entry.locus.id !== pick?.locus.id);
  if (visible.length > 0) {
    const chosen = rng.pick(visible);
    clauses.push({ kind: "trait", trait: chosen.trait, is: chosen.shown });
  }

  // And if there is a lethal anywhere in the pair, coming out clean is the
  // third clause. It is free when there is not, which is why it is conditional.
  if (carriesLethal(map, sire) || carriesLethal(map, dam)) clauses.push({ kind: "clear" });

  return clauses.length > 0 ? clauses : [{ kind: "clear" }];
}

interface SharedAllele {
  readonly locus: LocusDef;
  readonly allele: { readonly id: AlleleId; readonly rare: boolean };
}

function sharedAlleles(map: GeneMap, sire: Genome, dam: Genome): SharedAllele[] {
  const gates = gateLoci(map);
  const out: SharedAllele[] = [];
  for (const locus of map.loci) {
    if (locus.mode.kind === "polygenic") continue;
    // Autosomes only: fixing an X-linked allele needs two copies, which a cock
    // cannot supply and a hen can only get from a father who shows it.
    if (locus.onlyOn !== undefined) continue;
    // Never an epistatic gate. Fixing the recessive at a gate closes it, and a
    // closed gate silences whatever the second clause was asking to see — a
    // target that contradicts itself, on a day nobody can patch.
    if (gates.has(locus.id)) continue;
    const his = allelesAt(sire, locus);
    const hers = allelesAt(dam, locus);
    for (const id of his) {
      if (!hers.has(id)) continue;
      const allele = locus.alleles.find((a) => a.id === id);
      if (!allele) continue;
      // A lethal is never a fixing target: the homozygote does not hatch.
      if (allele.lethal) continue;
      out.push({ locus, allele: { id, rare: (allele.wildFrequency ?? 1) < 0.35 } });
    }
  }
  return out;
}

function visibleTraits(map: GeneMap, sire: Genome, dam: Genome): { locus: LocusDef; trait: string; shown: string }[] {
  const out: { locus: LocusDef; trait: string; shown: string }[] = [];
  for (const genome of [sire, dam]) {
    const phenotype = expressPhenotype(genome, map);
    for (const locus of map.loci) {
      if (locus.trait === undefined || locus.mode.kind === "polygenic") continue;
      if (locus.onlyOn !== undefined) continue;
      const shown = phenotype.traits[locus.trait];
      if (shown === undefined || shown === locus.suppressedPhenotype) continue;
      // Never a phenotype that only a lethal allele produces. Showing it means
      // carrying it, and the third clause asks the animal to be clean — the
      // two together are unsatisfiable, which is the worst thing a generated
      // puzzle can be.
      if (locus.alleles.some((allele) => allele.lethal && allele.phenotype === shown)) continue;
      out.push({ locus, trait: locus.trait, shown });
    }
  }
  return out;
}

/** Loci that gate others, plus the loci a cascade needs alongside them. */
function gateLoci(map: GeneMap): Set<string> {
  const gates = new Set<string>();
  for (const rule of map.species.epistasis) {
    gates.add(rule.gate);
    for (const extra of rule.also ?? []) gates.add(extra.locus);
  }
  return gates;
}

function allelesAt(genome: Genome, locus: LocusDef): Set<AlleleId> {
  const pair = genome.chromosomes[locus.chromosome];
  const found = new Set<AlleleId>();
  if (!pair) return found;
  for (const haplotype of [pair.maternal, pair.paternal]) {
    for (const allele of haplotype.genes[locus.id] ?? []) found.add(allele);
  }
  return found;
}

function carriesLethal(map: GeneMap, genome: Genome): boolean {
  for (const locus of map.loci) {
    const carried = allelesAt(genome, locus);
    for (const allele of locus.alleles) {
      if (allele.lethal && carried.has(allele.id)) return true;
    }
  }
  return false;
}

/**
 * Leaderboard score.
 *
 * Deliberately a small integer with no floating point in it: a leaderboard that
 * compares 8123.4000000001 to 8123.4 is a leaderboard with a bug report
 * attached.
 */
export function dailyScore(input: {
  readonly cleared: boolean;
  readonly generations: number;
  readonly limit: number;
  readonly inbreeding: number;
  readonly purity: number;
  readonly matched: number;
  readonly total: number;
}): number {
  if (!input.cleared) {
    // A partial answer still scores, because a daily nobody clears should not
    // be a day with an empty leaderboard.
    return Math.round((input.matched / Math.max(1, input.total)) * 900);
  }
  const spare = Math.max(0, input.limit - input.generations);
  return Math.round(
    2000 + spare * 450 + input.purity * 600 - Math.min(1, Math.max(0, input.inbreeding)) * 1400,
  );
}

/**
 * Writes a Daily Genome result back to the player's ranch.
 *
 * One attempt: the record is written the first time and never replaced. That is
 * the whole shape of the mode — a daily you can retry until you like the answer
 * is a daily with no leaderboard worth reading.
 */
export function recordDailyResult(main: RanchState, record: DailyRecord): RanchState {
  if (main.records.daily[record.dateKey]) return main;
  return {
    ...main,
    inventory: { ...main.inventory, motes: main.inventory.motes + Math.round(record.score / 4) },
    records: { ...main.records, daily: { ...main.records.daily, [record.dateKey]: record } },
  };
}

/** Whether today's attempt has already been spent. */
export function dailySpent(main: RanchState, key: string): boolean {
  return main.records.daily[key] !== undefined;
}
