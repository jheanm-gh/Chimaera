/**
 * Expeditions (§4): the risk mechanic.
 *
 * Three creatures walk into a procedurally generated region. What dies, stays
 * dead — and that is the whole point. Breeding without loss is a spreadsheet;
 * the expedition is what makes a genome you spent nine generations building
 * feel like something you could lose.
 *
 * The rewards are chosen to feed the breeding loop rather than the combat loop:
 * wild specimens (outside blood for an inbred herd), mutagens, gene fragments,
 * and — deep in — stock carrying alleles the surface pool does not have.
 *
 * A player may withdraw at any node and keep everything they have collected.
 * There is no toll for leaving. The reason to press on is that the warden holds
 * the only thing worth the risk, which is a better bargain to offer a player
 * than a punishment for stopping.
 */

import type { GeneMap, Genome, LocusId, Rng } from "@chimaera/genetics";
import { createRng, expressPhenotype, randomWildGenome } from "@chimaera/genetics";
import type { CombatantSpec, Role, Stance } from "./combat.js";
import type { CreatureId } from "./types.js";

export type NodeKind = "entry" | "encounter" | "forage" | "wild" | "cache" | "spring" | "warden";

export interface RegionNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly depth: number;
  readonly name: string;
  readonly blurb: string;
  /** 0 at the mouth of the region, 1 at the warden. */
  readonly difficulty: number;
  readonly next: readonly string[];
}

export interface Region {
  readonly seed: string;
  readonly name: string;
  readonly biome: string;
  readonly depth: number;
  readonly entry: string;
  readonly nodes: readonly RegionNode[];
}

export interface ExpeditionMember {
  readonly id: CreatureId;
  readonly hp: number;
  readonly maxHp: number;
  readonly role: Role;
  readonly stance: Stance;
  readonly equipment: readonly string[];
}

export interface ExpeditionLoot {
  readonly motes: number;
  readonly items: Readonly<Record<string, number>>;
  readonly fragments: Readonly<Record<LocusId, number>>;
  /** Wild stock caught on the way. Added to the ranch only if you get home. */
  readonly specimens: readonly Genome[];
}

export interface ExpeditionState {
  readonly region: Region;
  readonly team: readonly ExpeditionMember[];
  readonly at: string;
  readonly visited: readonly string[];
  readonly loot: ExpeditionLoot;
  readonly status: "active" | "won" | "lost" | "withdrawn";
  readonly log: readonly string[];
  /** Creatures lost. They are gone from the ranch, not merely unconscious. */
  readonly lost: readonly CreatureId[];
  readonly rngCursor: number;
}

export const DAYS_PER_NODE = 2;
export const EMPTY_LOOT: ExpeditionLoot = { motes: 0, items: {}, fragments: {}, specimens: [] };

// ---------------------------------------------------------------------------
// Region generation
// ---------------------------------------------------------------------------

const REGION_NAMES = [
  "The Drowned Coppice",
  "Blackwater Reach",
  "The Sunken Causeway",
  "Nine Sisters Mire",
  "The Quiet Shallows",
  "Kettlebrake",
] as const;

const NODE_FLAVOUR: Readonly<Record<NodeKind, { names: readonly string[]; blurb: string }>> = {
  entry: { names: ["The landing"], blurb: "Where the punt is tied. You can still turn around." },
  encounter: {
    names: ["A contested channel", "Reed shadow", "A cut bank", "The old weir", "Broken hurdles"],
    blurb: "Something already lives here, and it was here first.",
  },
  forage: {
    names: ["Silt beds", "A drift of shells", "Peat cuttings", "Root tangle"],
    blurb: "Nothing dangerous. Things worth carrying.",
  },
  wild: {
    names: ["A breeding pool", "Shallows full of young", "A basking shelf"],
    blurb: "Wild stock, unrelated to anything you own. This is what an inbred herd needs.",
  },
  cache: {
    names: ["A sunken crate", "An abandoned assay", "A surveyor's cache"],
    blurb: "Somebody came this far before and did not come back for it.",
  },
  spring: {
    names: ["A warm seep", "Clearwater spring", "A sheltered pool"],
    blurb: "Somewhere to rest. Not for long.",
  },
  warden: {
    names: ["The warden's pool"],
    blurb: "Whatever holds this water holds it alone, and has for a long time.",
  },
};

export interface RegionOptions {
  readonly depth?: number;
  readonly biome?: string;
}

/**
 * A layered DAG rather than a maze: the player always moves forward, and always
 * chooses between two or three visible options. Legible risk beats a map.
 */
export function generateRegion(seed: string, options: RegionOptions = {}): Region {
  const rng = createRng(`region:${seed}`);
  const depth = options.depth ?? 6;

  const layers: string[][] = [];
  for (let layer = 0; layer <= depth; layer++) {
    if (layer === 0) layers.push(["n0"]);
    else if (layer === depth) layers.push([`n${layer}-0`]);
    else {
      const width = rng.bool(0.45) ? 3 : 2;
      layers.push(Array.from({ length: width }, (_, i) => `n${layer}-${i}`));
    }
  }

  // Built mutable, frozen on the way out: the coverage pass below needs to add
  // edges after the fact so that no branch can dead-end.
  type Draft = Omit<RegionNode, "next"> & { next: string[] };
  const draft: Draft[] = [];

  for (let layer = 0; layer <= depth; layer++) {
    const ids = layers[layer] as string[];
    const nextIds = (layers[layer + 1] ?? []) as string[];
    for (const [index, id] of ids.entries()) {
      const kind = pickKind(layer, depth, rng);
      const flavour = NODE_FLAVOUR[kind];
      const links = new Set<string>();
      if (nextIds.length > 0) {
        links.add(nextIds[index % nextIds.length] as string);
        // Most nodes should present a genuine choice; a region that is mostly
        // a corridor is a cutscene with extra steps.
        if (rng.bool(0.78) && nextIds.length > 1) {
          links.add(nextIds[(index + 1) % nextIds.length] as string);
        }
      }
      draft.push({
        id,
        kind,
        depth: layer,
        name: rng.pick(flavour.names),
        blurb: flavour.blurb,
        difficulty: depth === 0 ? 0 : layer / depth,
        next: [...links],
      });
    }

    // Every node in the next layer must be reachable, or the region contains
    // rooms the player can see on a map and never walk into.
    for (const nextId of nextIds) {
      if (draft.some((node) => node.depth === layer && node.next.includes(nextId))) continue;
      const donor = draft.find((node) => node.depth === layer);
      if (donor) donor.next.push(nextId);
    }
  }

  return {
    seed,
    name: rng.pick(REGION_NAMES),
    biome: options.biome ?? "Mirefen",
    depth,
    entry: "n0",
    nodes: draft.map((node) => ({ ...node, next: [...node.next] })),
  };
}

function pickKind(layer: number, depth: number, rng: Rng): NodeKind {
  if (layer === 0) return "entry";
  if (layer === depth) return "warden";
  const kinds: NodeKind[] = ["encounter", "encounter", "forage", "wild", "cache", "spring"];
  const weights = [3, 3, 2, 2, 1.5, 1.2];
  return rng.weighted(kinds, weights);
}

export function nodeById(region: Region, id: string): RegionNode {
  const found = region.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`unknown region node "${id}"`);
  return found;
}

export function optionsFrom(region: Region, at: string): RegionNode[] {
  return nodeById(region, at).next.map((id) => nodeById(region, id));
}

// ---------------------------------------------------------------------------
// Opponents
// ---------------------------------------------------------------------------

const OPPONENT_NAMES = ["Resident", "Old holder", "The pale one", "A big female", "Something scarred"] as const;

/**
 * Wild opponents are real creatures: a genome from the wild pool, expressed,
 * and raised to a fraction of its ceiling that rises with depth. Deep water
 * holds better-raised animals, not animals with invented numbers.
 */
export function wildOpponents(
  map: GeneMap,
  difficulty: number,
  count: number,
  rng: Rng,
): { specs: CombatantSpec[]; genomes: Genome[] } {
  const specs: CombatantSpec[] = [];
  const genomes: Genome[] = [];
  const roles: Role[] = ["vanguard", "runner", "reader"];

  for (let i = 0; i < count; i++) {
    const genome = randomWildGenome(map, rng);
    const phenotype = expressPhenotype(genome, map);
    const raised = 0.46 + difficulty * 0.46;
    const stats: Record<string, number> = {};
    for (const trait of map.polygenicTraits) {
      const ceiling = phenotype.stats[trait.id] ?? trait.min;
      stats[trait.id] = trait.min + (ceiling - trait.min) * raised;
    }
    genomes.push(genome);
    specs.push({
      id: `wild-${i}`,
      name: rng.pick(OPPONENT_NAMES),
      affinities: (phenotype.traits.affinity ?? "").split("+").filter(Boolean),
      role: roles[i % roles.length] as Role,
      stance: rng.pick(["press", "hold", "measure"] as Stance[]),
      stats,
      equipment: [],
    });
  }
  return { specs, genomes };
}

// ---------------------------------------------------------------------------
// Loot
// ---------------------------------------------------------------------------

export function mergeLoot(a: ExpeditionLoot, b: Partial<ExpeditionLoot>): ExpeditionLoot {
  const items = { ...a.items };
  for (const [id, count] of Object.entries(b.items ?? {})) items[id] = (items[id] ?? 0) + count;
  const fragments = { ...a.fragments };
  for (const [id, count] of Object.entries(b.fragments ?? {})) fragments[id] = (fragments[id] ?? 0) + count;
  return {
    motes: a.motes + (b.motes ?? 0),
    items,
    fragments,
    specimens: [...a.specimens, ...(b.specimens ?? [])],
  };
}

/** What a node hands over. Deeper is richer, and the warden is the only real prize. */
export function lootFor(node: RegionNode, map: GeneMap, rng: Rng): Partial<ExpeditionLoot> {
  const scale = 0.6 + node.difficulty * 1.6;
  switch (node.kind) {
    case "forage":
      return {
        motes: Math.round((30 + rng.int(40)) * scale),
        fragments: { [rng.pick(map.loci).id]: 1 + rng.int(2) },
      };
    case "cache":
      return {
        motes: Math.round(20 * scale),
        items: { [rng.weighted(["field-lens", "fertility-tonic", "crossover-inducer", "mutagen-crude"], [4, 3, 2, 2])]: 1 },
      };
    case "encounter":
      return {
        motes: Math.round((18 + rng.int(22)) * scale),
        fragments: { [rng.pick(map.loci).id]: 1 },
      };
    case "warden":
      return {
        motes: Math.round(280 * scale),
        items: { "mutagen-refined": 1, "assay-bench": 1 },
        fragments: Object.fromEntries(map.loci.slice(0, 4).map((locus) => [locus.id, 2])),
      };
    default:
      return {};
  }
}
