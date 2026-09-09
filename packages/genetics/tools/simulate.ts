/**
 * Phase 1 deliverable: breed a population over 20 generations and print what
 * happened, so the maths can be checked before anything is pretty.
 *
 *   npm run sim                   # default seed
 *   npm run sim -- --seed=mirefen --generations=20
 *
 * Three populations run side by side against the same gene map, because the
 * interesting claims in the design are comparative ones:
 *
 *   OPEN    a ranch that keeps catching wild stock  -> F stays flat, fertility holds
 *   CLOSED  a ranch that never outcrosses           -> F drifts up over ~20 generations
 *   LINE    four founders, best bred to best        -> F climbs fast and the herd fails
 *
 * If the inbreeding engine is doing its job, LINE gets better for four to six
 * generations and then visibly collapses, while OPEN never does. That is the
 * loop that keeps exploration relevant for two hundred hours, and this script
 * is where you can see it before a single pixel exists.
 */

import { breed } from "../src/breeding.js";
import type { BreedResult } from "../src/breeding.js";
import { expressPhenotype } from "../src/expression.js";
import type { GeneMap } from "../src/genemap.js";
import { genotypeAt, randomWildGenome, sexOf } from "../src/genome.js";
import { Pedigree } from "../src/pedigree.js";
import { knowledgeFromGenome, predictOffspring } from "../src/predict.js";
import type { Rng } from "../src/rng.js";
import { createRng } from "../src/rng.js";
import { geneMapFor, QUILLFEN } from "../src/species/index.js";
import type { Genome, MutationEvent, Phenotype, Sex } from "../src/types.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

interface Options {
  seed: string;
  generations: number;
  founders: number;
  capacity: number;
}

function parseOptions(argv: readonly string[]): Options {
  const options: Options = { seed: "mirefen-0001", generations: 20, founders: 40, capacity: 60 };
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (!match) continue;
    const [, key, value] = match as unknown as [string, string, string];
    if (key === "seed") options.seed = value;
    else if (key === "generations") options.generations = Number(value);
    else if (key === "founders") options.founders = Number(value);
    else if (key === "capacity") options.capacity = Number(value);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Population model
// ---------------------------------------------------------------------------

interface Creature {
  readonly id: string;
  readonly genome: Genome;
  readonly phenotype: Phenotype;
  readonly sex: Sex;
  readonly generation: number;
}

interface GenerationReport {
  readonly generation: number;
  readonly population: number;
  readonly meanF: number;
  readonly maxF: number;
  readonly eggRate: number;
  readonly lethalRate: number;
  readonly stillbirthRate: number;
  readonly meanSpeed: number;
  readonly bestSpeed: number;
  readonly freqLantern: number;
  readonly freqFastStride: number;
  readonly couplingRate: number;
  readonly albinoRate: number;
  readonly mutations: readonly MutationEvent[];
}

type Strategy = "open" | "closed" | "line";

class Population {
  readonly reports: GenerationReport[] = [];
  readonly pedigree = new Pedigree();
  private creatures: Creature[] = [];
  private nextId = 0;

  constructor(
    readonly label: string,
    readonly strategy: Strategy,
    private readonly map: GeneMap,
    private readonly rng: Rng,
    founders: number,
    private readonly capacity: number,
  ) {
    // Founders alternate sex. A fair coin on a herd of four can hand you six
    // males and no females, and "the population died because of the sex ratio"
    // is not the failure mode this simulation is trying to show.
    for (let i = 0; i < founders; i++) this.creatures.push(this.founder(i % 2 === 0 ? "female" : "male"));
    this.reports.push(this.report(0, { eggs: 0, hatched: 0, lethal: 0, stillborn: 0 }, []));
  }

  private founder(sex?: Sex): Creature {
    const genome = randomWildGenome(this.map, this.rng, sex ? { sex } : {});
    const id = `${this.label}-${this.nextId++}`;
    this.pedigree.add(id);
    return {
      id,
      genome,
      phenotype: expressPhenotype(genome, this.map),
      sex: sexOf(genome, this.map),
      generation: 0,
    };
  }

  /** One generation: pair up, lay eggs, keep what hatches. Parents do not persist. */
  advance(generation: number): void {
    // An open ranch keeps catching wild stock, so reserve its places up front.
    // (Adding incomers only after breeding filled every slot is how you build a
    // ranch that believes it is outcrossing and is not.)
    const incomers = this.strategy === "open" ? Math.max(1, Math.round(this.capacity * 0.15)) : 0;
    const capacity = this.capacity - incomers;
    const females = this.rng.shuffle(this.creatures.filter((c) => c.sex === "female"));
    const males = this.rng.shuffle(this.creatures.filter((c) => c.sex === "male"));

    if (this.strategy === "line") {
      // Best bred to best, every generation, with no thought for relatedness.
      const bySpeed = (a: Creature, b: Creature): number =>
        (b.phenotype.stats.speed ?? 0) - (a.phenotype.stats.speed ?? 0);
      females.sort(bySpeed);
      males.sort(bySpeed);
    }

    const counts = { eggs: 0, hatched: 0, lethal: 0, stillborn: 0 };
    const mutations: MutationEvent[] = [];
    const offspring: Creature[] = [];
    const pairs = Math.min(females.length, males.length);

    // Round-robin the clutches rather than letting the first pairs fill the
    // ranch. Breeding pair 1 to exhaustion before pair 2 ever lays gives an
    // effective population a fraction of the real one, and the resulting
    // genetic drift would look exactly like an inbreeding bug.
    for (let clutch = 0; clutch < 4 && offspring.length < capacity; clutch++) {
      for (let i = 0; i < pairs && offspring.length < capacity; i++) {
        const dam = females[i] as Creature;
        // A line-breeding ranch keeps going back to its single best stud.
        const sire = (this.strategy === "line" ? males[0] : males[i]) as Creature;
        const f = this.pedigree.projectedInbreeding(sire.id, dam.id);

        const result = breed(sire.genome, dam.genome, this.map, this.rng, { inbreeding: f });
        this.tally(result, counts, mutations);
        if (result.outcome !== "hatched") continue;
        const id = `${this.label}-${this.nextId++}`;
        this.pedigree.add(id, sire.id, dam.id);
        offspring.push({
          id,
          genome: result.genome,
          phenotype: result.phenotype,
          sex: result.phenotype.sex,
          generation,
        });
      }
    }

    for (let i = 0; i < incomers; i++) offspring.push(this.founder(i % 2 === 0 ? "female" : "male"));

    // A population that cannot replace itself is allowed to shrink. That is the
    // failure mode the design wants players to feel, not a bug to paper over.
    this.creatures = offspring.length > 0 ? offspring : [];
    this.reports.push(this.report(generation, counts, mutations));
  }

  private tally(
    result: BreedResult,
    counts: { eggs: number; hatched: number; lethal: number; stillborn: number },
    mutations: MutationEvent[],
  ): void {
    if (result.outcome === "no-egg") return;
    counts.eggs++;
    mutations.push(...result.mutations);
    if (result.outcome === "hatched") counts.hatched++;
    else if (result.outcome === "lethal") counts.lethal++;
    else counts.stillborn++;
  }

  get alive(): readonly Creature[] {
    return this.creatures;
  }

  private report(
    generation: number,
    counts: { eggs: number; hatched: number; lethal: number; stillborn: number },
    mutations: readonly MutationEvent[],
  ): GenerationReport {
    const n = this.creatures.length;
    const attempts = counts.eggs === 0 ? 0 : counts.eggs;
    let sumF = 0;
    let maxF = 0;
    let sumSpeed = 0;
    let bestSpeed = 0;
    let albinos = 0;
    let lanternAlleles = 0;
    let fastAlleles = 0;
    let totalAlleles = 0;
    let fastHaplotypes = 0;
    let fastAndLethal = 0;

    for (const creature of this.creatures) {
      const f = this.pedigree.inbreedingCoefficient(creature.id);
      sumF += f;
      maxF = Math.max(maxF, f);
      const speed = creature.phenotype.stats.speed ?? 0;
      sumSpeed += speed;
      bestSpeed = Math.max(bestSpeed, speed);
      if (creature.phenotype.traits.pigmentation === "albino") albinos++;

      lanternAlleles += genotypeAt(creature.genome, this.map.locus("LANTERN")).filter((a) => a === "LN_star").length;
      fastAlleles += genotypeAt(creature.genome, this.map.locus("SPD_A")).filter((a) => a === "SA2").length;
      totalAlleles += 2;

      const c1 = creature.genome.chromosomes.C1;
      for (const hap of [c1?.maternal, c1?.paternal]) {
        if (hap?.genes.SPD_A?.[0] !== "SA2") continue;
        fastHaplotypes++;
        if (hap.genes.LANTERN?.[0] === "LN_star") fastAndLethal++;
      }
    }

    return {
      generation,
      population: n,
      meanF: n === 0 ? 0 : sumF / n,
      maxF,
      eggRate: attempts === 0 ? 0 : counts.hatched / attempts,
      lethalRate: attempts === 0 ? 0 : counts.lethal / attempts,
      stillbirthRate: attempts === 0 ? 0 : counts.stillborn / attempts,
      meanSpeed: n === 0 ? 0 : sumSpeed / n,
      bestSpeed,
      freqLantern: totalAlleles === 0 ? 0 : lanternAlleles / totalAlleles,
      freqFastStride: totalAlleles === 0 ? 0 : fastAlleles / totalAlleles,
      couplingRate: fastHaplotypes === 0 ? 0 : fastAndLethal / fastHaplotypes,
      albinoRate: n === 0 ? 0 : albinos / n,
      mutations,
    };
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function table(rows: readonly (readonly string[])[]): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row, index) => {
      const line = row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i] as number) : cell.padStart(widths[i] as number))).join("  ");
      return index === 0 ? `${line}\n${"-".repeat(line.length)}` : line;
    })
    .join("\n");
}

function heading(text: string): void {
  console.log(`\n${text}\n${"=".repeat(text.length)}`);
}

function printPopulation(population: Population): void {
  heading(`${population.label}  (${population.strategy})`);
  const rows: string[][] = [
    ["gen", "N", "meanF", "maxF", "hatch", "lethal", "still", "meanSpd", "bestSpd", "LN*", "SA2", "coupled", "albino"],
  ];
  for (const r of population.reports) {
    rows.push([
      String(r.generation),
      String(r.population),
      r.meanF.toFixed(3),
      r.maxF.toFixed(3),
      pct(r.eggRate),
      pct(r.lethalRate),
      pct(r.stillbirthRate),
      r.meanSpeed.toFixed(1),
      r.bestSpeed.toFixed(1),
      pct(r.freqLantern),
      pct(r.freqFastStride),
      pct(r.couplingRate),
      pct(r.albinoRate),
    ]);
  }
  console.log(table(rows));
}

function printPhenotypeDistribution(population: Population, map: GeneMap): void {
  heading(`${population.label}: final phenotype distribution (N = ${population.alive.length})`);
  if (population.alive.length === 0) {
    console.log("  population extinct.");
    return;
  }
  const traits = ["dorsal", "build", "limbs", "tail", "markings", "pigmentation", "sheen", "lantern", "affinity", "crest"];
  for (const trait of traits) {
    const counts = new Map<string, number>();
    for (const creature of population.alive) {
      const value = creature.phenotype.traits[trait] ?? "-";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const parts = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `${label} ${pct(count / population.alive.length)}`)
      .join(", ");
    console.log(`  ${trait.padEnd(13)} ${parts}`);
  }

  for (const stat of map.polygenicTraits) {
    const values = population.alive.map((c) => c.phenotype.stats[stat.id] ?? 0).sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const median = values[Math.floor(values.length / 2)] as number;
    console.log(
      `  ${stat.name.padEnd(13)} min ${(values[0] as number).toFixed(1)}  median ${median.toFixed(1)}  mean ${mean.toFixed(1)}  max ${(values[values.length - 1] as number).toFixed(1)}  (range ${stat.min}-${stat.max})`,
    );
  }
}

function printMutations(populations: readonly Population[]): void {
  heading("Mutation log");
  let total = 0;
  const novel: MutationEvent[] = [];
  for (const population of populations) {
    for (const report of population.reports) {
      total += report.mutations.length;
      novel.push(...report.mutations.filter((m) => m.kind === "novel"));
    }
  }
  console.log(`  ${total} mutation events across all populations.`);
  if (novel.length === 0) {
    console.log("  No novel alleles appeared. At baseline rates that is the expected result —");
    console.log("  they are meant to be the discovery of a playthrough, not of a run.");
  } else {
    for (const event of novel) {
      console.log(`  NOVEL ALLELE  ${event.locus}: ${event.from ?? "?"} -> ${event.to}`);
    }
  }
}

function printPredictorDemo(map: GeneMap, rng: Rng): void {
  heading("Punnett predictor: the same pairing, at three levels of knowledge");

  let sire: Genome;
  let dam: Genome;
  do {
    sire = randomWildGenome(map, rng, { sex: "male" });
  } while (genotypeAt(sire, map.locus("DORSAL")).join("/") !== "D/d");
  do {
    dam = randomWildGenome(map, rng, { sex: "female" });
  } while (genotypeAt(dam, map.locus("DORSAL")).join("/") !== "D/d");

  const sirePheno = expressPhenotype(sire, map);
  const damPheno = expressPhenotype(dam, map);

  const levels = [
    { name: "Tier 0  phenotype only", revealed: [] as string[] },
    { name: "Tier 1  Field Lens on the dam", revealed: ["DORSAL"], damOnly: true },
    { name: "Tier 3  Deep Sequencer on both", revealed: ["DORSAL"] },
  ];

  for (const level of levels) {
    const sireKnowledge = knowledgeFromGenome(sire, map, sirePheno, level.damOnly ? [] : level.revealed);
    const damKnowledge = knowledgeFromGenome(dam, map, damPheno, level.revealed);
    const prediction = predictOffspring(sireKnowledge, damKnowledge, map, ["DORSAL"]);
    const smooth = prediction.loci[0]?.phenotypes.find((p) => p.label === "smooth");
    const range =
      smooth && smooth.max - smooth.min > 1e-9
        ? `${pct(smooth.min)} - ${pct(smooth.max)} (best estimate ${pct(smooth.p)})`
        : `exactly ${pct(smooth?.p ?? 0)}`;
    console.log(`  ${level.name.padEnd(30)} P(smooth offspring) = ${range}`);
  }
  console.log("\n  Both parents are in fact D/d. Only the last line knows that; the first two");
  console.log("  are honest about not knowing, which is the entire information game.");
}

function printVerdict(populations: readonly Population[]): void {
  heading("What to check");
  for (const population of populations) {
    const first = population.reports[1];
    // The last generation that still had animals in it. Reading the literal
    // final row of a collapsed line reports "F 0.000 -> 0.000", which is true
    // of an empty set and says the exact opposite of what happened.
    const alive = [...population.reports].reverse().find((report) => report.population > 0);
    const last = alive ?? (population.reports[population.reports.length - 1] as GenerationReport);
    const died = population.reports.findIndex((report) => report.population === 0);
    console.log(
      `  ${population.label.padEnd(8)} F ${first?.meanF.toFixed(3)} -> ${last.meanF.toFixed(3)}   ` +
        `hatch ${pct(first?.eggRate ?? 0)} -> ${pct(last.eggRate)}   ` +
        `N ${first?.population} -> ${last.population}` +
        (died > 0 ? `   (line died out at generation ${died})` : ""),
    );
  }
  const closed = populations.find((p) => p.strategy === "closed");
  if (closed) {
    const first = closed.reports.find((r) => r.couplingRate > 0);
    const last = [...closed.reports].reverse().find((r) => r.couplingRate > 0);
    console.log(
      `\n  Linkage drag (P(lantern lethal | long stride) on a haplotype): ` +
        `${pct(first?.couplingRate ?? 0)} -> ${pct(last?.couplingRate ?? 0)} over ${closed.reports.length - 1} generations.`,
    );
    console.log("  Recombination at 3cM erodes it slowly. That slowness is the point.");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const map = geneMapFor(QUILLFEN);
  const root = createRng(options.seed);

  console.log(`Verdance — genetics core, Phase 1`);
  console.log(`Species : ${QUILLFEN.name} (${QUILLFEN.inspiration})`);
  console.log(`Seed    : ${options.seed}`);
  console.log(
    `Map     : ${map.chromosomes.length} chromosomes, ${map.loci.length} loci, ` +
      `${map.polygenicTraits.length} polygenic stats, ${QUILLFEN.epistasis.length} epistatic gate(s)`,
  );

  const populations = [
    new Population("OPEN", "open", map, root.fork("open"), options.founders, options.capacity),
    new Population("CLOSED", "closed", map, root.fork("closed"), options.founders, options.capacity),
    // A deliberately small closed line: six founders, everything bred back to
    // the fastest stud. This is the player who never leaves the ranch.
    new Population("LINE", "line", map, root.fork("line"), 6, 16),
  ];

  for (let generation = 1; generation <= options.generations; generation++) {
    for (const population of populations) population.advance(generation);
  }

  for (const population of populations) printPopulation(population);
  for (const population of populations) printPhenotypeDistribution(population, map);
  printMutations(populations);
  printPredictorDemo(map, root.fork("predict-demo"));
  printVerdict(populations);
  console.log("");
}

main();
