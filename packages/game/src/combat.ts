/**
 * Combat: the fitness function, not the game (§3).
 *
 * It exists to answer "was my breeding good?", so every design choice here is
 * about keeping that answer *legible*:
 *
 *  - **No inputs during a fight.** The player sets a team of three, roles,
 *    stances and equipment, and presses go. There is no twitch skill to
 *    override genetic quality, ever.
 *  - **Equipment is capped at 20% of effective power**, and the cap is
 *    enforced here rather than trusted to content authoring. See
 *    `MAX_EQUIPMENT_SHARE`.
 *  - **Equipment is deterministic.** The brief also wants players to bulk
 *    simulate fifty fights to evaluate a lineage. If equipment contributed a
 *    variable share, half of what those fifty fights measured would be
 *    equipment noise rather than genes. Only the damage roll varies, and it
 *    varies narrowly.
 *  - **Affinity comes from a co-dominant locus**, so hybrids are real: a
 *    creature carrying two affinities averages both matchups. Rounder
 *    defensively, blunter offensively — a genuine breeding trade-off rather
 *    than a strictly better type.
 */

import type { Rng } from "@chimaera/genetics";
import type { StatId } from "@chimaera/genetics";

export type Role = "vanguard" | "runner" | "reader";
export type Stance = "press" | "hold" | "measure";

export const ROLES: readonly { id: Role; name: string; blurb: string }[] = [
  { id: "vanguard", name: "Vanguard", blurb: "Stands in front. Scales with vigour, and is very hard to move." },
  { id: "runner", name: "Runner", blurb: "Acts first and often. Scales with speed, and folds if caught." },
  { id: "reader", name: "Reader", blurb: "Finds the seam. Scales with focus, and doubles what affinity is worth." },
];

export const STANCES: readonly { id: Stance; name: string; blurb: string }[] = [
  { id: "press", name: "Press", blurb: "Hit harder, take more." },
  { id: "hold", name: "Hold", blurb: "Give ground, give up damage, survive." },
  { id: "measure", name: "Measure", blurb: "Even damage, and affinity counts for more." },
];

// ---------------------------------------------------------------------------
// Affinity
// ---------------------------------------------------------------------------

/**
 * A three-way cycle: gale dries the fen, mire drowns the ember, ember runs on
 * the wind. `umbral` is the novel affinity — neutral against everything and
 * never weak, which is what makes finding it worth something without making it
 * strictly dominant.
 */
const BEATS: Readonly<Record<string, string>> = { gale: "mire", mire: "ember", ember: "gale" };

export const AFFINITY_ADVANTAGE = 1.35;
export const AFFINITY_PENALTY = 0.78;

/**
 * Matchup multiplier, averaged across every affinity each side carries.
 *
 * Averaging is what makes a hybrid a trade rather than an upgrade: an
 * ember+gale creature is never fully weak to anything, and never fully strong
 * against anything either.
 */
export function affinityMultiplier(attacker: readonly string[], defender: readonly string[]): number {
  if (attacker.length === 0 || defender.length === 0) return 1;
  let total = 0;
  let pairs = 0;
  for (const a of attacker) {
    for (const d of defender) {
      pairs++;
      if (a === d) total += 1;
      else if (BEATS[a] === d) total += AFFINITY_ADVANTAGE;
      else if (BEATS[d] === a) total += AFFINITY_PENALTY;
      else total += 1;
    }
  }
  return pairs === 0 ? 1 : total / pairs;
}

// ---------------------------------------------------------------------------
// Equipment (§3, §5): two slots, three tiers, deliberately boring
// ---------------------------------------------------------------------------

export type EquipmentSlot = "harness" | "charm";

export interface EquipmentDef {
  readonly id: string;
  readonly name: string;
  readonly slot: EquipmentSlot;
  readonly tier: 1 | 2 | 3;
  readonly blurb: string;
  readonly cost: number;
  /** Flat, deterministic fraction added to gene power before the cap. */
  readonly powerFraction: number;
}

/**
 * The hard cap the brief asks for: equipment may never be more than this share
 * of a creature's *effective* power.
 *
 * Stated as a share of the total rather than as a bonus, because that is what
 * the design says and the two are not the same number. A bonus `b` on top of
 * gene power contributes `b / (1 + b)` of the result, so a 20% share is a 25%
 * bonus — and `MAX_EQUIPMENT_BONUS` is derived from the share rather than
 * typed in, so the two can never drift apart.
 */
export const MAX_EQUIPMENT_SHARE = 0.2;
export const MAX_EQUIPMENT_BONUS = MAX_EQUIPMENT_SHARE / (1 - MAX_EQUIPMENT_SHARE);

export const EQUIPMENT: readonly EquipmentDef[] = [
  { id: "harness-1", name: "Reed harness", slot: "harness", tier: 1, cost: 90, powerFraction: 0.05, blurb: "Woven reed. Barely a harness." },
  { id: "harness-2", name: "Hide harness", slot: "harness", tier: 2, cost: 320, powerFraction: 0.09, blurb: "Cured hide, properly fitted." },
  { id: "harness-3", name: "Slateplate harness", slot: "harness", tier: 3, cost: 900, powerFraction: 0.13, blurb: "Heavy, cold and effective." },
  { id: "charm-1", name: "River pebble", slot: "charm", tier: 1, cost: 90, powerFraction: 0.05, blurb: "It likes carrying it. That is most of the effect." },
  { id: "charm-2", name: "Bound quill", slot: "charm", tier: 2, cost: 320, powerFraction: 0.09, blurb: "A shed quill, bound in waxed thread." },
  { id: "charm-3", name: "Fenglass lens", slot: "charm", tier: 3, cost: 900, powerFraction: 0.13, blurb: "Focuses something. Nobody has explained what." },
];

const EQUIPMENT_BY_ID = new Map(EQUIPMENT.map((item) => [item.id, item]));

export function equipmentById(id: string): EquipmentDef | undefined {
  return EQUIPMENT_BY_ID.get(id);
}

/**
 * The equipment bonus for a loadout, clamped. Two tier-3 pieces would total
 * 0.26 and are cut to 0.25, which is the cap binding exactly where it should:
 * at the top of the gear tree, so that gear is never the answer.
 */
export function equipmentBonus(loadout: readonly string[]): number {
  const bySlot = new Map<EquipmentSlot, EquipmentDef>();
  for (const id of loadout) {
    const item = EQUIPMENT_BY_ID.get(id);
    // Two slots, and only one item each: a second harness is simply ignored.
    if (item && !bySlot.has(item.slot)) bySlot.set(item.slot, item);
  }
  let total = 0;
  for (const item of bySlot.values()) total += item.powerFraction;
  return Math.min(MAX_EQUIPMENT_BONUS, total);
}

/** Gene-and-raising power, lifted by at most `MAX_EQUIPMENT_SHARE` of the result. */
export function effectivePower(genePower: number, loadout: readonly string[]): number {
  return genePower * (1 + equipmentBonus(loadout));
}

/** The share of effective power that came from equipment. Never above the cap. */
export function equipmentShare(genePower: number, loadout: readonly string[]): number {
  if (genePower <= 0) return 0;
  const effective = effectivePower(genePower, loadout);
  return (effective - genePower) / effective;
}

// ---------------------------------------------------------------------------
// Combatants
// ---------------------------------------------------------------------------

export interface CombatantSpec {
  readonly id: string;
  readonly name: string;
  readonly affinities: readonly string[];
  readonly role: Role;
  readonly stance: Stance;
  /** Achieved stats — genotype ceiling filtered through raising (§3). */
  readonly stats: Readonly<Record<StatId, number>>;
  readonly equipment: readonly string[];
  /**
   * Condition carried into the fight. Omitted means fresh.
   *
   * This is what makes an expedition a run rather than a series of unrelated
   * fights: damage taken at the third node is still there at the warden.
   */
  readonly startingHp?: number | undefined;
}

interface Fighter extends CombatantSpec {
  readonly team: 0 | 1;
  hp: number;
  readonly maxHp: number;
  readonly attack: number;
  readonly guard: number;
  readonly initiative: number;
}

const ROLE_WEIGHTS: Readonly<Record<Role, { speed: number; vigour: number; focus: number; hp: number; guard: number; initiative: number }>> = {
  vanguard: { speed: 0.15, vigour: 0.6, focus: 0.25, hp: 1.35, guard: 1.35, initiative: 0.8 },
  runner: { speed: 0.6, vigour: 0.15, focus: 0.25, hp: 0.85, guard: 0.85, initiative: 1.35 },
  reader: { speed: 0.25, vigour: 0.15, focus: 0.6, hp: 1.0, guard: 1.0, initiative: 1.0 },
};

const STANCE_MODS: Readonly<Record<Stance, { dealt: number; taken: number; affinity: number }>> = {
  press: { dealt: 1.2, taken: 1.2, affinity: 1 },
  hold: { dealt: 0.75, taken: 0.7, affinity: 1 },
  // Measure leans on affinity, which is the genetic lever, so it rewards a
  // player who bred for a matchup rather than one who bought better gear.
  measure: { dealt: 1, taken: 1, affinity: 1.4 },
};

function toFighter(spec: CombatantSpec, team: 0 | 1): Fighter {
  const weights = ROLE_WEIGHTS[spec.role];
  const speed = spec.stats.speed ?? 0;
  const vigour = spec.stats.vigour ?? 0;
  const focus = spec.stats.focus ?? 0;
  const genePower = speed * weights.speed + vigour * weights.vigour + focus * weights.focus;
  const attack = effectivePower(genePower, spec.equipment);
  const maxHp = Math.round((36 + vigour * 2.1) * weights.hp);
  const hp = spec.startingHp === undefined ? maxHp : Math.max(0, Math.min(maxHp, Math.round(spec.startingHp)));
  return {
    ...spec,
    team,
    hp,
    maxHp,
    attack,
    guard: effectivePower(vigour * 0.5 + focus * 0.2, spec.equipment) * weights.guard,
    initiative: (speed * 0.8 + focus * 0.2) * weights.initiative,
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type BattleEvent =
  | { readonly kind: "round"; readonly round: number; readonly t: number }
  | {
      readonly kind: "strike";
      readonly t: number;
      readonly by: string;
      readonly target: string;
      readonly damage: number;
      readonly affinity: number;
      readonly remaining: number;
    }
  | { readonly kind: "down"; readonly t: number; readonly who: string }
  | { readonly kind: "end"; readonly t: number; readonly winner: 0 | 1 | "draw"; readonly reason: string };

export interface BattleResult {
  readonly winner: 0 | 1 | "draw";
  readonly rounds: number;
  /** Playback script. Timestamps span roughly 20-30s (§3). */
  readonly log: readonly BattleEvent[];
  readonly survivors: readonly { readonly id: string; readonly team: 0 | 1; readonly hp: number; readonly maxHp: number }[];
  /** Ids of creatures reduced to zero. Expeditions turn this into permadeath. */
  readonly downed: readonly string[];
}

export const MAX_ROUNDS = 30;

/**
 * Damage scale and roll width, tuned together against a calibration sweep.
 *
 * Fights must last long enough that a stat difference *accumulates* rather than
 * being settled by whoever swings first, and the roll must be wide enough that
 * win rate is a smooth function of genetic advantage. If a 2% better lineage
 * wins 100% of fights, bulk simulation cannot rank anything and the fitness
 * function is a step, not a measure. Current curve, 400 fights per point:
 *
 *     advantage   0%    2%    5%    10%   15%   25%
 *     win rate    49%   62%   80%   94%   99%   100%
 *
 * Genes dominate — a tenth of a stat point is nearly decisive — while the band
 * where real breeding comparisons live still has resolution to sample.
 */
const DAMAGE_SCALE = 0.62;
const ROLL_MIN = 0.86;
const ROLL_SPREAD = 0.28;

/**
 * Per-fight condition, rolled once per creature and applied to everything it
 * does that fight.
 *
 * Per-hit noise is the wrong lever: a three-a-side fight lands about fifty
 * blows, so a wide per-hit roll averages almost entirely away and the win rate
 * becomes a step function of genetic advantage — a 5% better lineage won 99.5%
 * of four hundred fights. Attrition compounds (lose a creature, lose its
 * actions, lose faster), so the advantage snowballs no matter how noisy each
 * individual swing is.
 *
 * Correlated, per-fight variance does not average out, which is what leaves
 * room for an upset without making any single swing meaningless. It also reads
 * as something a player recognises: she had an off day.
 */
const FORM_MIN = 0.78;
const FORM_SPREAD = 0.44;
/** Target visual length. Bulk simulation ignores it entirely. */
const TARGET_MS = 24_000;

export interface BattleOptions {
  /** Skip log construction. Bulk runs do not need a playback script. */
  readonly quiet?: boolean;
}

export function simulateBattle(
  teamA: readonly CombatantSpec[],
  teamB: readonly CombatantSpec[],
  rng: Rng,
  options: BattleOptions = {},
): BattleResult {
  if (teamA.length === 0 || teamB.length === 0) throw new Error("both teams need at least one creature");
  const fighters = [...teamA.map((s) => toFighter(s, 0)), ...teamB.map((s) => toFighter(s, 1))];
  // A creature carried in already unconscious does not silently revive.
  const startedDown = new Set(fighters.filter((f) => f.hp <= 0).map((f) => f.id));
  const log: BattleEvent[] = [];
  const quiet = options.quiet ?? false;
  const downed: string[] = [];

  const standing = (team: 0 | 1): Fighter[] => fighters.filter((f) => f.team === team && f.hp > 0);
  let round = 0;
  let winner: 0 | 1 | "draw" = "draw";
  let reason = "Both sides were still standing when the light went.";

  // Initiative is fixed for the fight, but jittered per fight from the seed.
  //
  // Breaking ties by id instead made the team listed first strike first in
  // every round, and in a 3v3 that is decisive: two evenly matched teams gave
  // the first-listed one a 98.5% win rate. Order of arguments is not a stat.
  const jitter = new Map(fighters.map((f) => [f.id, 0.88 + rng.next() * 0.24]));
  const form = new Map(fighters.map((f) => [f.id, FORM_MIN + rng.next() * FORM_SPREAD]));
  const order = [...fighters].sort(
    (a, b) => b.initiative * (jitter.get(b.id) as number) - a.initiative * (jitter.get(a.id) as number),
  );

  while (round < MAX_ROUNDS) {
    round++;
    if (!quiet) log.push({ kind: "round", round, t: 0 });

    for (const actor of order) {
      if (actor.hp <= 0) continue;
      const enemies = standing(actor.team === 0 ? 1 : 0);
      if (enemies.length === 0) break;

      const target = chooseTarget(actor, enemies);
      const stance = STANCE_MODS[actor.stance];
      const targetStance = STANCE_MODS[target.stance];
      const rawAffinity = affinityMultiplier(actor.affinities, target.affinities);
      // Readers double what affinity is worth, and Measure sharpens it further.
      const leverage = (actor.role === "reader" ? 2 : 1) * stance.affinity;
      const affinity = 1 + (rawAffinity - 1) * leverage;

      const targetGuard = target.guard * (form.get(target.id) as number);
      const mitigation = targetGuard / (targetGuard + 55);
      // A narrow roll on purpose: wide variance would drown the genetics under
      // noise and make a fifty-fight sample say nothing.
      const roll = ROLL_MIN + rng.next() * ROLL_SPREAD;
      const damage = Math.max(
        1,
        Math.round(
          actor.attack *
            (form.get(actor.id) as number) *
            DAMAGE_SCALE *
            affinity *
            stance.dealt *
            targetStance.taken *
            (1 - mitigation) *
            roll,
        ),
      );

      target.hp = Math.max(0, target.hp - damage);
      if (!quiet) {
        log.push({
          kind: "strike",
          t: 0,
          by: actor.id,
          target: target.id,
          damage,
          affinity: Math.round(affinity * 100) / 100,
          remaining: target.hp,
        });
      }
      if (target.hp === 0) {
        downed.push(target.id);
        if (!quiet) log.push({ kind: "down", t: 0, who: target.id });
      }
    }

    if (standing(0).length === 0 && standing(1).length === 0) {
      winner = "draw";
      reason = "Both teams went down together.";
      break;
    }
    if (standing(1).length === 0) {
      winner = 0;
      reason = "The other team could not stand.";
      break;
    }
    if (standing(0).length === 0) {
      winner = 1;
      reason = "Your team could not stand.";
      break;
    }
  }

  if (round >= MAX_ROUNDS && winner === "draw") {
    // Time called: the side holding more of its condition takes it.
    const health = (team: 0 | 1): number =>
      fighters.filter((f) => f.team === team).reduce((sum, f) => sum + f.hp / f.maxHp, 0);
    const a = health(0);
    const b = health(1);
    winner = Math.abs(a - b) < 1e-9 ? "draw" : a > b ? 0 : 1;
    reason = winner === "draw" ? "Time called, and nothing separated them." : "Time called on condition.";
  }

  if (!quiet) {
    log.push({ kind: "end", t: 0, winner, reason });
    stampTimestamps(log);
  }

  return {
    winner,
    rounds: round,
    log,
    survivors: fighters
      .filter((f) => f.hp > 0)
      .map((f) => ({ id: f.id, team: f.team, hp: f.hp, maxHp: f.maxHp })),
    downed: downed.filter((id) => !startedDown.has(id)),
  };
}

function chooseTarget(actor: Fighter, enemies: readonly Fighter[]): Fighter {
  const pick = (score: (f: Fighter) => number): Fighter =>
    enemies.reduce((best, f) => (score(f) > score(best) ? f : best), enemies[0] as Fighter);
  switch (actor.role) {
    case "runner":
      // Finish what is already hurt.
      return pick((f) => -f.hp);
    case "vanguard":
      // Take the biggest threat off the board.
      return pick((f) => f.attack);
    case "reader":
      // Attack into the best matchup it can find.
      return pick((f) => affinityMultiplier(actor.affinities, f.affinities));
  }
}

/** Spreads the log across the target visual length (§3: 20-30 seconds). */
function stampTimestamps(log: BattleEvent[]): void {
  const beats = log.length;
  for (let i = 0; i < beats; i++) {
    const entry = log[i] as { t: number };
    entry.t = Math.round((i / Math.max(1, beats - 1)) * TARGET_MS);
  }
}

// ---------------------------------------------------------------------------
// Bulk simulation (§3): fifty fights to evaluate a lineage
// ---------------------------------------------------------------------------

export interface SeriesResult {
  readonly fights: number;
  readonly winsA: number;
  readonly winsB: number;
  readonly draws: number;
  readonly winRateA: number;
  readonly meanRounds: number;
  /** How often each of A's creatures was left standing. */
  readonly survivalA: Readonly<Record<string, number>>;
}

/**
 * Runs a matchup many times and reports the distribution.
 *
 * This is the tool the design asks for explicitly: a late-game player
 * evaluating a lineage does not want one dramatic fight, they want a win rate.
 * Logs are skipped, so a fifty-fight sample is a few milliseconds.
 */
export function simulateSeries(
  teamA: readonly CombatantSpec[],
  teamB: readonly CombatantSpec[],
  fights: number,
  rng: Rng,
): SeriesResult {
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let totalRounds = 0;
  const survivalA: Record<string, number> = {};
  for (const spec of teamA) survivalA[spec.id] = 0;

  for (let i = 0; i < fights; i++) {
    const result = simulateBattle(teamA, teamB, rng, { quiet: true });
    if (result.winner === 0) winsA++;
    else if (result.winner === 1) winsB++;
    else draws++;
    totalRounds += result.rounds;
    for (const survivor of result.survivors) {
      if (survivor.team === 0) survivalA[survivor.id] = (survivalA[survivor.id] ?? 0) + 1;
    }
  }

  for (const id of Object.keys(survivalA)) survivalA[id] = (survivalA[id] ?? 0) / fights;
  return {
    fights,
    winsA,
    winsB,
    draws,
    winRateA: fights === 0 ? 0 : winsA / fights,
    meanRounds: fights === 0 ? 0 : totalRounds / fights,
    survivalA,
  };
}
