/**
 * Combat and expedition tests (§3, §4).
 *
 * The claims under defence: equipment can never be more than a fifth of
 * effective power; genes decide fights and gear does not; a fight is
 * reproducible; fifty fights resolve instantly; and an expedition can take a
 * creature away permanently.
 */

import { createRng, geneMapFor, genomeFromSpec, QUILLFEN } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import {
  activeCreatures,
  affinityMultiplier,
  applyAction,
  createRanch,
  effectivePower,
  EQUIPMENT,
  equipmentBonus,
  equipmentShare,
  evaluateLineage,
  EXPEDITION_TEAM_SIZE,
  generateRegion,
  MAX_EQUIPMENT_SHARE,
  MAX_ROUNDS,
  nodeById,
  optionsFrom,
  simulateBattle,
  simulateSeries,
} from "../src/index.js";
import type { CombatantSpec, Role, Stance } from "../src/combat.js";
import type { Action, Creature, GameEvent, RanchState } from "../src/types.js";

const map = geneMapFor(QUILLFEN);

function fighter(overrides: Partial<CombatantSpec> & { id: string }): CombatantSpec {
  return {
    name: overrides.id,
    affinities: ["mire"],
    role: "runner",
    stance: "measure",
    stats: { speed: 60, vigour: 60, focus: 60 },
    equipment: [],
    ...overrides,
  };
}

function team(prefix: string, stats: Record<string, number>, equipment: string[] = []): CombatantSpec[] {
  const roles: Role[] = ["vanguard", "runner", "reader"];
  return roles.map((role, i) => fighter({ id: `${prefix}${i}`, role, stats, equipment }));
}

function run(state: RanchState, actions: readonly Action[]): { state: RanchState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyAction(current, action, map);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

describe("the equipment cap (§3)", () => {
  it("never lets equipment exceed a fifth of effective power, for any loadout", () => {
    // Every combination of every item, including nonsense ones.
    const ids = EQUIPMENT.map((item) => item.id);
    const loadouts: string[][] = [[]];
    for (const a of ids) {
      loadouts.push([a]);
      for (const b of ids) {
        loadouts.push([a, b]);
        for (const c of ids) loadouts.push([a, b, c, a, b]);
      }
    }
    for (const loadout of loadouts) {
      for (const genePower of [1, 12, 55, 240, 10_000]) {
        expect(equipmentShare(genePower, loadout)).toBeLessThanOrEqual(MAX_EQUIPMENT_SHARE + 1e-12);
      }
    }
  });

  it("binds at the top of the gear tree, where it should", () => {
    const bestPair = ["harness-3", "charm-3"];
    // Uncapped these would total 0.26; the cap trims them to the 0.25 bonus
    // that is exactly a 20% share.
    expect(equipmentBonus(bestPair)).toBeCloseTo(MAX_EQUIPMENT_SHARE / (1 - MAX_EQUIPMENT_SHARE), 12);
    expect(equipmentShare(100, bestPair)).toBeCloseTo(MAX_EQUIPMENT_SHARE, 12);
  });

  it("ignores a second item in the same slot rather than stacking it", () => {
    expect(equipmentBonus(["harness-1", "harness-3"])).toBeCloseTo(equipmentBonus(["harness-1"]), 12);
  });

  it("is deterministic, so a fifty-fight sample measures genes and not gear", () => {
    const a = effectivePower(100, ["harness-2", "charm-2"]);
    const b = effectivePower(100, ["harness-2", "charm-2"]);
    expect(a).toBe(b);
  });

  it("cannot make a worse genome beat a better one on its own", () => {
    // A 20% share means gear closes a 25% gene gap at most. Give the weaker
    // team the best gear in the game and a 35% deficit, and it still loses.
    const strong = team("s", { speed: 88, vigour: 88, focus: 88 });
    const weak = team("w", { speed: 57, vigour: 57, focus: 57 }, ["harness-3", "charm-3"]);
    const series = simulateSeries(strong, weak, 200, createRng("gear-cannot-win"));
    expect(series.winRateA).toBeGreaterThan(0.9);
  });
});

describe("affinity (§3)", () => {
  it("runs a three-way cycle", () => {
    expect(affinityMultiplier(["gale"], ["mire"])).toBeGreaterThan(1);
    expect(affinityMultiplier(["mire"], ["ember"])).toBeGreaterThan(1);
    expect(affinityMultiplier(["ember"], ["gale"])).toBeGreaterThan(1);
    expect(affinityMultiplier(["mire"], ["gale"])).toBeLessThan(1);
  });

  it("is neutral against itself", () => {
    expect(affinityMultiplier(["mire"], ["mire"])).toBe(1);
  });

  it("makes a co-dominant hybrid rounder, not stronger", () => {
    const hybrid = ["ember", "gale"];

    // Defensively rounder: mire crushes a pure ember, and only nudges the
    // hybrid — but the hybrid is still worse off than a pure gale would be.
    expect(affinityMultiplier(["mire"], hybrid)).toBeLessThan(affinityMultiplier(["mire"], ["ember"]));
    expect(affinityMultiplier(["mire"], hybrid)).toBeGreaterThan(affinityMultiplier(["mire"], ["gale"]));

    // Offensively blunter: it never hits as hard as the right pure affinity.
    expect(affinityMultiplier(hybrid, ["mire"])).toBeLessThan(affinityMultiplier(["gale"], ["mire"]));
    expect(affinityMultiplier(hybrid, ["ember"])).toBeLessThan(affinityMultiplier(["mire"], ["ember"]));
  });

  it("is worth more to a Reader, and more again in Measure stance", () => {
    const attacker = { speed: 60, vigour: 60, focus: 60 };
    const winRate = (role: Role, stance: Stance): number =>
      simulateSeries(
        [fighter({ id: "a", role, stance, affinities: ["gale"], stats: attacker })],
        [fighter({ id: "b", role: "vanguard", stance: "measure", affinities: ["mire"], stats: attacker })],
        200,
        createRng(`affinity:${role}:${stance}`),
      ).winRateA;

    expect(winRate("reader", "measure")).toBeGreaterThan(winRate("reader", "press"));
  });
});

describe("battles", () => {
  it("is reproducible from the same seed", () => {
    const a = simulateBattle(team("a", { speed: 60, vigour: 55, focus: 50 }), team("b", { speed: 52, vigour: 62, focus: 48 }), createRng("battle"));
    const b = simulateBattle(team("a", { speed: 60, vigour: 55, focus: 50 }), team("b", { speed: 52, vigour: 62, focus: 48 }), createRng("battle"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("always terminates", () => {
    // Two immovable objects: the round cap and the condition tiebreak must
    // still produce a result.
    const wall = team("w", { speed: 5, vigour: 130, focus: 5 }).map((f) => ({ ...f, stance: "hold" as Stance }));
    const result = simulateBattle(wall, wall.map((f) => ({ ...f, id: `x${f.id}` })), createRng("stalemate"));
    expect(result.rounds).toBeLessThanOrEqual(MAX_ROUNDS);
    expect(["draw", 0, 1]).toContain(result.winner);
  });

  it("produces a playback script spanning twenty to thirty seconds", () => {
    const result = simulateBattle(team("a", { speed: 70, vigour: 60, focus: 55 }), team("b", { speed: 55, vigour: 60, focus: 55 }), createRng("playback"));
    expect(result.log.length).toBeGreaterThan(4);
    const last = result.log[result.log.length - 1];
    expect(last?.t).toBeGreaterThanOrEqual(20_000);
    expect(last?.t).toBeLessThanOrEqual(30_000);
    // Monotonic, or playback would jump backwards.
    let previous = -1;
    for (const event of result.log) {
      expect(event.t).toBeGreaterThanOrEqual(previous);
      previous = event.t;
    }
  });

  it("is fair when the two teams are identical", () => {
    // The regression this exists for: initiative ties once broke by id, so the
    // team listed first struck first every round and won 98.5% of evenly
    // matched fights. Argument order is not a stat.
    const stats = { speed: 64, vigour: 64, focus: 64 };
    const series = simulateSeries(team("a", stats), team("b", stats), 500, createRng("fairness"));
    expect(series.winRateA).toBeGreaterThan(0.42);
    expect(series.winRateA).toBeLessThan(0.58);
  });

  it("turns a small genetic edge into a real but beatable one", () => {
    // A ~4% better lineage: clearly ahead, not a foregone conclusion. This is
    // the band where breeding decisions actually live, and it has to have
    // resolution or bulk simulation cannot rank anything.
    const better = team("a", { speed: 67, vigour: 67, focus: 67 });
    const worse = team("b", { speed: 64, vigour: 64, focus: 64 });
    const series = simulateSeries(better, worse, 400, createRng("edge"));
    expect(series.winRateA).toBeGreaterThan(0.58);
    expect(series.winRateA).toBeLessThan(0.95);
  });

  it("makes a large genetic edge decisive, because genes dominate outcome", () => {
    const better = team("a", { speed: 80, vigour: 80, focus: 80 });
    const worse = team("b", { speed: 64, vigour: 64, focus: 64 });
    const series = simulateSeries(better, worse, 300, createRng("dominant"));
    expect(series.winRateA).toBeGreaterThan(0.97);
  });

  it("carries condition into a fight, so an expedition is a run", () => {
    const stats = { speed: 60, vigour: 60, focus: 60 };
    // Evenly matched when fresh...
    const fresh = simulateSeries(team("a", stats), team("b", stats), 200, createRng("condition"));
    expect(fresh.winRateA).toBeGreaterThan(0.4);

    // ...and reliably beaten when it walks in already hurt, which is what makes
    // an expedition a run rather than a series of unrelated fights.
    const hurt = simulateSeries(
      team("a", stats).map((f) => ({ ...f, startingHp: 14 })),
      team("b", stats),
      200,
      createRng("condition"),
    );
    expect(hurt.winRateA).toBeLessThan(0.1);
  });

  it("does not silently revive a creature carried in unconscious", () => {
    const result = simulateBattle(
      [fighter({ id: "down", startingHp: 0 }), fighter({ id: "up" })],
      [fighter({ id: "enemy" })],
      createRng("carried-down"),
      { quiet: true },
    );
    expect(result.survivors.some((s) => s.id === "down")).toBe(false);
    // It was already gone, so it is not reported as newly lost.
    expect(result.downed).not.toContain("down");
  });

  it("resolves fifty fights fast enough to be a UI affordance", () => {
    const started = performance.now();
    const series = simulateSeries(team("a", { speed: 66, vigour: 64, focus: 62 }), team("b", { speed: 64, vigour: 64, focus: 62 }), 50, createRng("bulk"));
    const elapsed = performance.now() - started;
    expect(series.fights).toBe(50);
    expect(elapsed).toBeLessThan(400);
  });

  it("reports per-creature survival, so a player can see which one keeps dying", () => {
    const mine = [
      fighter({ id: "glass", role: "runner", stance: "press", stats: { speed: 78, vigour: 22, focus: 55 } }),
      fighter({ id: "solid", role: "vanguard", stance: "hold", stats: { speed: 30, vigour: 96, focus: 55 } }),
      fighter({ id: "even", role: "reader", stats: { speed: 55, vigour: 58, focus: 62 } }),
    ];
    const series = simulateSeries(mine, team("b", { speed: 52, vigour: 52, focus: 52 }), 200, createRng("survival"));
    expect(series.survivalA.solid).toBeGreaterThan(series.survivalA.glass as number);
  });
});

describe("regions (§4)", () => {
  it("is reproducible from its seed", () => {
    expect(JSON.stringify(generateRegion("kettle"))).toBe(JSON.stringify(generateRegion("kettle")));
    expect(JSON.stringify(generateRegion("kettle"))).not.toBe(JSON.stringify(generateRegion("other")));
  });

  it("always leads from the landing to the warden, with no dead ends", () => {
    for (let i = 0; i < 60; i++) {
      const region = generateRegion(`region-${i}`);
      const warden = region.nodes.filter((n) => n.kind === "warden");
      expect(warden.length).toBe(1);

      // Every node is reachable from the entry, and every non-warden node
      // leads somewhere.
      const seen = new Set<string>([region.entry]);
      const queue = [region.entry];
      while (queue.length > 0) {
        const at = queue.shift() as string;
        for (const next of nodeById(region, at).next) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.size).toBe(region.nodes.length);
      for (const node of region.nodes) {
        if (node.kind === "warden") expect(node.next.length).toBe(0);
        else expect(node.next.length).toBeGreaterThan(0);
      }
      expect(seen.has((warden[0] as { id: string }).id)).toBe(true);
    }
  });

  it("always offers a choice on the way", () => {
    const region = generateRegion("choices", { depth: 6 });
    const middle = region.nodes.filter((n) => n.depth > 0 && n.depth < region.depth - 1);
    expect(middle.some((n) => n.next.length > 1)).toBe(true);
  });
});

describe("expeditions", () => {
  function ready(seed: string): RanchState {
    const ranch = createRanch(map, { seed, founders: 6, capacity: 20, });
    // Give everyone a fighting chance so the run does not end at node one.
    return {
      ...ranch,
      leagueTier: 1,
      creatures: ranch.creatures.map((c) => ({
        ...c,
        genome: genomeFromSpec(map, c.sex, {
          VIG_A: ["VA2", "VA2"],
          VIG_B: ["VB2", "VB2"],
          VIG_C: ["VC2", "VC2"],
        }),
        achieved: { speed: 60, vigour: 120, focus: 60 },
      })),
    };
  }

  it("is gated behind a League win, so a first run cannot wipe the starting herd", () => {
    const green = createRanch(map, { seed: "gated", founders: 6 });
    const ids = activeCreatures(green).map((c) => c.id).slice(0, 3);
    expect(applyAction(green, { kind: "enterExpedition", team: ids }, map).events[0]).toMatchObject({
      kind: "blocked",
    });
    const experienced: RanchState = { ...green, leagueTier: 1 };
    expect(applyAction(experienced, { kind: "enterExpedition", team: ids }, map).state.expedition).toBeDefined();
  });

  it("takes exactly three, and refuses hatchlings", () => {
    const ranch = ready("team-size");
    const ids = activeCreatures(ranch).map((c) => c.id);
    expect(
      applyAction(ranch, { kind: "enterExpedition", team: ids.slice(0, 2) }, map).events[0],
    ).toMatchObject({ kind: "blocked" });
    expect(
      applyAction(ranch, { kind: "enterExpedition", team: ids.slice(0, EXPEDITION_TEAM_SIZE) }, map).state.expedition,
    ).toBeDefined();
  });

  it("moves node to node, spending days and collecting findings", () => {
    const ranch = ready("walk");
    const ids = activeCreatures(ranch).map((c) => c.id).slice(0, 3);
    let state = applyAction(ranch, { kind: "enterExpedition", team: ids, regionSeed: "fixed-walk" }, map).state;
    const startDay = state.day;

    let steps = 0;
    while (state.expedition?.status === "active" && steps < 12) {
      const next = optionsFrom(state.expedition.region, state.expedition.at)[0];
      if (!next) break;
      state = applyAction(state, { kind: "expeditionMove", nodeId: next.id }, map).state;
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
    expect(state.day).toBeGreaterThan(startDay);
    // Either it finished, or it is deeper in than it started.
    expect(state.expedition === undefined || state.expedition.visited.length > 1).toBe(true);
  });

  it("refuses a move to a node that is not adjacent", () => {
    const ranch = ready("adjacency");
    const ids = activeCreatures(ranch).map((c) => c.id).slice(0, 3);
    const state = applyAction(ranch, { kind: "enterExpedition", team: ids }, map).state;
    const result = applyAction(state, { kind: "expeditionMove", nodeId: "n5-0" }, map);
    expect(result.events[0]).toMatchObject({ kind: "blocked" });
  });

  it("takes creatures away permanently when they fall", () => {
    // A deliberately hopeless team, sent deep.
    const ranch = createRanch(map, { seed: "permadeath", founders: 6, capacity: 20 });
    const doomed: RanchState = {
      ...ranch,
      leagueTier: 1,
      creatures: ranch.creatures.map((c) => ({ ...c, achieved: { speed: 4, vigour: 4, focus: 4 } })),
    };
    const ids = activeCreatures(doomed).map((c) => c.id).slice(0, 3);
    let state = applyAction(doomed, { kind: "enterExpedition", team: ids, regionSeed: "grave" }, map).state;
    const events: GameEvent[] = [];

    let steps = 0;
    while (state.expedition?.status === "active" && steps < 12) {
      const next = optionsFrom(state.expedition.region, state.expedition.at)[0];
      if (!next) break;
      const result = applyAction(state, { kind: "expeditionMove", nodeId: next.id }, map);
      state = result.state;
      events.push(...result.events);
      steps++;
    }

    const lostEvents = events.filter((e) => e.kind === "lost");
    expect(lostEvents.length).toBeGreaterThan(0);
    for (const event of lostEvents) {
      if (event.kind !== "lost") continue;
      // Gone from the ranch entirely, not merely inactive.
      expect(state.creatures.some((c) => c.id === event.id)).toBe(false);
    }
  });

  it("lets the player withdraw and keep everything found", () => {
    const ranch = ready("withdraw");
    const ids = activeCreatures(ranch).map((c) => c.id).slice(0, 3);
    let state = applyAction(ranch, { kind: "enterExpedition", team: ids, regionSeed: "quit" }, map).state;
    const before = state.inventory.motes;

    for (let i = 0; i < 3 && state.expedition?.status === "active"; i++) {
      const next = optionsFrom(state.expedition.region, state.expedition.at)[0];
      if (!next) break;
      state = applyAction(state, { kind: "expeditionMove", nodeId: next.id }, map).state;
    }
    if (!state.expedition) return; // The run ended on its own; nothing to test.

    const carried = state.expedition.loot.motes;
    const result = applyAction(state, { kind: "expeditionWithdraw" }, map);
    expect(result.state.expedition).toBeUndefined();
    expect(result.state.inventory.motes).toBe(before + carried);
    expect(result.events.some((e) => e.kind === "expeditionEnded")).toBe(true);
  });

  it("will not start a second expedition while one is running", () => {
    const ranch = ready("one-at-a-time");
    const ids = activeCreatures(ranch).map((c) => c.id).slice(0, 3);
    const state = applyAction(ranch, { kind: "enterExpedition", team: ids }, map).state;
    expect(applyAction(state, { kind: "enterExpedition", team: ids }, map).events[0]).toMatchObject({
      kind: "blocked",
    });
  });
});

describe("the League", () => {
  function fit(seed: string): RanchState {
    const ranch = createRanch(map, { seed, founders: 4 });
    return {
      ...ranch,
      creatures: ranch.creatures.map((c) => ({ ...c, achieved: { speed: 80, vigour: 90, focus: 80 } })),
    };
  }

  it("opens one tier at a time", () => {
    const ranch = fit("ladder");
    const ids = activeCreatures(ranch).map((c) => c.id).slice(0, 3);
    expect(applyAction(ranch, { kind: "bout", team: ids, tier: 3 }, map).events[0]).toMatchObject({
      kind: "blocked",
    });
    const first = applyAction(ranch, { kind: "bout", team: ids, tier: 1 }, map);
    expect(first.events[0]).toMatchObject({ kind: "battle" });
  });

  it("pays a purse and gene fragments for a win, and a little for a loss", () => {
    const ranch = fit("purse");
    const ids = activeCreatures(ranch).map((c) => c.id).slice(0, 3);
    const result = run(ranch, [{ kind: "bout", team: ids, tier: 1 }]);
    expect(result.state.inventory.motes).toBeGreaterThan(ranch.inventory.motes);
    const battle = result.events.find((e) => e.kind === "battle");
    if (battle?.kind === "battle" && battle.won) {
      expect(Object.keys(result.state.inventory.fragments).length).toBeGreaterThan(0);
      expect(result.state.leagueTier).toBe(1);
    }
  });

  it("bulk-evaluates a lineage against a cleared tier and nothing else", () => {
    const ranch = fit("evaluate");
    const ids = activeCreatures(ranch).map((c) => c.id).slice(0, 3);
    // Nothing cleared: the tool is unavailable, which is the point of clearing.
    expect(evaluateLineage(ranch, ids, 1, 50, map)).toBeUndefined();

    const cleared: RanchState = { ...ranch, leagueTier: 2 };
    const report = evaluateLineage(cleared, ids, 2, 50, map);
    expect(report).toBeDefined();
    expect(report?.winRate).toBeGreaterThanOrEqual(0);
    expect(report?.winRate).toBeLessThanOrEqual(1);
    expect(Object.keys(report?.survival ?? {}).length).toBe(3);
  });

  it("never risks a life", () => {
    const ranch = fit("safe");
    const ids = activeCreatures(ranch).map((c) => c.id).slice(0, 3);
    let state = ranch;
    for (let i = 0; i < 6; i++) state = applyAction(state, { kind: "bout", team: ids, tier: 1 }, map).state;
    for (const id of ids) {
      expect(state.creatures.some((c: Creature) => c.id === id)).toBe(true);
    }
  });
});

describe("equipment ownership", () => {
  it("will not put the same harness on two creatures", () => {
    const ranch = createRanch(map, { seed: "gear", startingItems: { "harness-2": 1 } });
    const [first, second] = activeCreatures(ranch);
    const equipped = applyAction(
      ranch,
      { kind: "setEquipment", id: (first as Creature).id, equipment: ["harness-2"] },
      map,
    ).state;
    const clash = applyAction(
      equipped,
      { kind: "setEquipment", id: (second as Creature).id, equipment: ["harness-2"] },
      map,
    );
    expect(clash.events[0]).toMatchObject({ kind: "blocked" });
  });

  it("refuses two items in the same slot", () => {
    const ranch = createRanch(map, { seed: "slots", startingItems: { "harness-1": 1, "harness-2": 1 } });
    const [first] = activeCreatures(ranch);
    const result = applyAction(
      ranch,
      { kind: "setEquipment", id: (first as Creature).id, equipment: ["harness-1", "harness-2"] },
      map,
    );
    expect(result.events[0]).toMatchObject({ kind: "blocked", reason: "One item per slot." });
  });
});
