/**
 * Pedigree, kinship, and Wright's coefficient of inbreeding.
 *
 * This is the system that keeps exploration relevant for two hundred hours
 * (§1.5). A closed herd gets better for a while and then quietly starts to fail,
 * and the only fix is outside blood — which means going back into the world.
 * Tuning here is therefore a *pacing* decision, not a realism one.
 */

export interface PedigreeNode {
  readonly id: string;
  readonly sire?: string | undefined;
  readonly dam?: string | undefined;
}

export class Pedigree {
  private readonly nodes = new Map<string, PedigreeNode>();
  private readonly depthCache = new Map<string, number>();
  private readonly kinshipCache = new Map<string, number>();

  add(id: string, sire?: string, dam?: string): this {
    if (sire === id || dam === id) throw new Error(`"${id}" cannot be its own parent`);
    if (sire !== undefined && this.isDescendantOf(sire, id)) {
      throw new Error(`adding "${id}" with sire "${sire}" would create a cycle`);
    }
    if (dam !== undefined && this.isDescendantOf(dam, id)) {
      throw new Error(`adding "${id}" with dam "${dam}" would create a cycle`);
    }
    this.nodes.set(id, { id, sire, dam });
    this.depthCache.clear();
    this.kinshipCache.clear();
    return this;
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  get(id: string): PedigreeNode | undefined {
    return this.nodes.get(id);
  }

  get size(): number {
    return this.nodes.size;
  }

  /** Ancestors of `id`, nearest generation first. Free to the player, always (§1.3). */
  ancestors(id: string, generations = Number.POSITIVE_INFINITY): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    let frontier = [id];
    for (let g = 0; g < generations && frontier.length > 0; g++) {
      const next: string[] = [];
      for (const current of frontier) {
        const node = this.nodes.get(current);
        for (const parent of [node?.sire, node?.dam]) {
          if (parent && !seen.has(parent)) {
            seen.add(parent);
            out.push(parent);
            next.push(parent);
          }
        }
      }
      frontier = next;
    }
    return out;
  }

  private isDescendantOf(candidate: string, ancestor: string): boolean {
    if (candidate === ancestor) return true;
    const stack = [candidate];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      const node = this.nodes.get(current);
      for (const parent of [node?.sire, node?.dam]) {
        if (!parent) continue;
        if (parent === ancestor) return true;
        stack.push(parent);
      }
    }
    return false;
  }

  /** Longest path back to a founder. Used to order kinship recursion safely. */
  private depth(id: string): number {
    const cached = this.depthCache.get(id);
    if (cached !== undefined) return cached;
    const node = this.nodes.get(id);
    if (!node || (!node.sire && !node.dam)) {
      this.depthCache.set(id, 0);
      return 0;
    }
    const sireDepth = node.sire ? this.depth(node.sire) : -1;
    const damDepth = node.dam ? this.depth(node.dam) : -1;
    const value = Math.max(sireDepth, damDepth) + 1;
    this.depthCache.set(id, value);
    return value;
  }

  /**
   * Coefficient of kinship f(x, y): the probability that an allele drawn at
   * random from x and one drawn from y at the same locus are identical by
   * descent.
   *
   *   f(x, x) = 0.5 * (1 + F(x))
   *   f(x, y) = 0.5 * (f(sire_x, y) + f(dam_x, y))    expanding the *younger* one
   *
   * Expanding the individual with the greater pedigree depth is what makes the
   * recursion correct: an ancestor always has strictly smaller depth than its
   * descendant, so we never expand an individual through a relative that is
   * itself downstream of it.
   */
  kinship(x: string | undefined, y: string | undefined): number {
    if (!x || !y || !this.nodes.has(x) || !this.nodes.has(y)) return 0;
    const key = x < y ? `${x} ${y}` : `${y} ${x}`;
    const cached = this.kinshipCache.get(key);
    if (cached !== undefined) return cached;

    let result: number;
    if (x === y) {
      const node = this.nodes.get(x) as PedigreeNode;
      result = 0.5 * (1 + this.kinship(node.sire, node.dam));
    } else {
      const [younger, other] = this.depth(x) >= this.depth(y) ? [x, y] : [y, x];
      const node = this.nodes.get(younger) as PedigreeNode;
      result = 0.5 * (this.kinship(node.sire, other) + this.kinship(node.dam, other));
    }
    this.kinshipCache.set(key, result);
    return result;
  }

  /** Wright's F for an existing individual: the kinship of its two parents. */
  inbreedingCoefficient(id: string): number {
    const node = this.nodes.get(id);
    if (!node) return 0;
    return this.kinship(node.sire, node.dam);
  }

  /**
   * Wright's F an offspring of this pairing *would* have — the number the
   * pairing screen shows before the player commits to it.
   */
  projectedInbreeding(sire: string | undefined, dam: string | undefined): number {
    return this.kinship(sire, dam);
  }
}

export interface InbreedingPenalty {
  readonly f: number;
  /** Multiplier on the chance a pairing produces an egg at all. */
  readonly fertilityMultiplier: number;
  /** Chance the egg fails to hatch for non-genetic reasons. */
  readonly stillbirthChance: number;
  /** Fraction shaved off every polygenic ceiling. */
  readonly statDepression: number;
  readonly severity: "clear" | "watch" | "strained" | "failing" | "collapsing";
}

/**
 * Penalty curve, authored as a table and interpolated.
 *
 * Tuned so that line-breeding stays viable for roughly four to six generations
 * before it bites, per §1.5. Repeated full-sib mating reaches F = 0.25 at
 * generation two and 0.5 at generation four, so the curve stays gentle up to
 * 0.25 and turns hard after 0.375. Cousin-level line-breeding drifts up much
 * more slowly and stays comfortable far longer, which is the intended
 * difference between a careful breeder and a careless one.
 *
 * Note that nothing here raises lethal-allele *expression*. It does not need
 * to: inbreeding raises homozygosity mechanically, so doubled-up lethals
 * already emerge from the meiosis being simulated. An explicit multiplier would
 * double-count the same effect and make the Punnett predictor lie.
 */
const PENALTY_TABLE: readonly InbreedingPenalty[] = [
  { f: 0.0, fertilityMultiplier: 1.0, stillbirthChance: 0.02, statDepression: 0.0, severity: "clear" },
  { f: 0.0625, fertilityMultiplier: 1.0, stillbirthChance: 0.025, statDepression: 0.0, severity: "clear" },
  { f: 0.125, fertilityMultiplier: 0.97, stillbirthChance: 0.04, statDepression: 0.02, severity: "watch" },
  { f: 0.25, fertilityMultiplier: 0.9, stillbirthChance: 0.09, statDepression: 0.06, severity: "watch" },
  { f: 0.375, fertilityMultiplier: 0.76, stillbirthChance: 0.18, statDepression: 0.13, severity: "strained" },
  { f: 0.5, fertilityMultiplier: 0.58, stillbirthChance: 0.32, statDepression: 0.22, severity: "failing" },
  { f: 0.75, fertilityMultiplier: 0.3, stillbirthChance: 0.55, statDepression: 0.38, severity: "collapsing" },
  { f: 1.0, fertilityMultiplier: 0.12, stillbirthChance: 0.75, statDepression: 0.5, severity: "collapsing" },
];

export function inbreedingPenalty(f: number): InbreedingPenalty {
  const clamped = f <= 0 ? 0 : f >= 1 ? 1 : f;
  let lower = PENALTY_TABLE[0] as InbreedingPenalty;
  let upper = PENALTY_TABLE[PENALTY_TABLE.length - 1] as InbreedingPenalty;
  for (let i = 1; i < PENALTY_TABLE.length; i++) {
    const candidate = PENALTY_TABLE[i] as InbreedingPenalty;
    if (candidate.f >= clamped) {
      lower = PENALTY_TABLE[i - 1] as InbreedingPenalty;
      upper = candidate;
      break;
    }
  }
  const span = upper.f - lower.f;
  const t = span <= 0 ? 0 : (clamped - lower.f) / span;
  return {
    f: clamped,
    fertilityMultiplier: lerp(lower.fertilityMultiplier, upper.fertilityMultiplier, t),
    stillbirthChance: lerp(lower.stillbirthChance, upper.stillbirthChance, t),
    statDepression: lerp(lower.statDepression, upper.statDepression, t),
    // Severity is a label, not a blend: take the band the value has entered.
    severity: t > 0 ? upper.severity : lower.severity,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
