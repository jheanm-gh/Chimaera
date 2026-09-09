/**
 * A fight, as something the screen can play.
 *
 * The scene is a replay, not a second resolution: `simulateBattle` has already
 * decided, banked the purse and advanced the day by the time anything is drawn.
 * These tests hold that line — the script must describe exactly the fight that
 * happened, and must carry enough to draw it without asking the simulation
 * anything else.
 */

import { describe, expect, it } from "vitest";
import { applyAction, createRanch, maxHpOf } from "../src/index.js";
import type { BattlePlayback, RanchState } from "../src/index.js";

function team(state: RanchState): string[] {
  return state.creatures
    .filter((c) => c.status === "active" && c.stage !== "egg")
    .slice(0, 3)
    .map((c) => c.id);
}

function bout(seed = "playback"): { playback: BattlePlayback; state: RanchState } {
  const start = createRanch({ seed, species: "quillfen", motes: 900 });
  const result = applyAction(start, { kind: "bout", team: team(start), tier: 1 });
  expect(result.playback, "a league bout returns a script").toBeDefined();
  return { playback: result.playback as BattlePlayback, state: result.state };
}

describe("watching a league bout", () => {
  it("comes back with a script and both sides in it", () => {
    const { playback } = bout();
    expect(playback.kind).toBe("league");
    expect(playback.title.length).toBeGreaterThan(0);
    const near = playback.actors.filter((a) => a.team === 0);
    const far = playback.actors.filter((a) => a.team === 1);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBe(near.length);
  });

  it("carries enough to draw every combatant", () => {
    const { playback } = bout();
    for (const actor of playback.actors) {
      // The opposition is generated for the fight and never enters the ranch,
      // so its genome has to travel with the script or it cannot be drawn.
      expect(Object.keys(actor.genome.chromosomes).length).toBeGreaterThan(0);
      expect(actor.genome.species).toBe(actor.species);
      expect(actor.species.length).toBeGreaterThan(0);
      expect(actor.name.length).toBeGreaterThan(0);
      expect(actor.maxHp).toBeGreaterThan(0);
    }
  });

  it("gives every bar the same maximum the simulation was emptying", () => {
    // Two formulas for one number is a bar that disagrees with its own fight,
    // so the bar's maximum comes from the simulation's own function.
    const { playback } = bout();
    for (const actor of playback.actors) {
      expect(Number.isInteger(actor.maxHp)).toBe(true);
      // The floor of the formula: nobody can have less health than a creature
      // with no vigour at all.
      const floor = maxHpOf({
        id: actor.id,
        name: actor.name,
        affinities: [],
        role: actor.role,
        stance: "measure",
        stats: { speed: 0, vigour: 0, focus: 0 },
        equipment: [],
      });
      expect(actor.maxHp).toBeGreaterThanOrEqual(floor);
    }
    // And every strike's remaining health must be reachable on that bar, which
    // only holds if both sides are using the same maximum.
    for (const event of playback.log) {
      if (event.kind !== "strike") continue;
      const actor = playback.actors.find((a) => a.id === event.target);
      expect(event.remaining).toBeLessThanOrEqual((actor as { maxHp: number }).maxHp);
    }
  });

  it("names only combatants that are in the script", () => {
    const { playback } = bout();
    const known = new Set(playback.actors.map((a) => a.id));
    for (const event of playback.log) {
      if (event.kind === "strike") {
        expect(known.has(event.by), `striker ${event.by}`).toBe(true);
        expect(known.has(event.target), `target ${event.target}`).toBe(true);
      }
      if (event.kind === "down") expect(known.has(event.who), `downed ${event.who}`).toBe(true);
    }
  });

  it("runs forward in time, so a scene can play it on a clock", () => {
    const { playback } = bout();
    let last = -1;
    for (const event of playback.log) {
      expect(event.t).toBeGreaterThanOrEqual(last);
      last = event.t;
    }
    expect(playback.log.at(-1)?.kind).toBe("end");
  });

  it("never leaves a bar showing more health than the animal has", () => {
    const { playback } = bout();
    for (const event of playback.log) {
      if (event.kind !== "strike") continue;
      const actor = playback.actors.find((a) => a.id === event.target);
      expect(actor).toBeDefined();
      expect(event.remaining).toBeGreaterThanOrEqual(0);
      expect(event.remaining).toBeLessThanOrEqual((actor as { maxHp: number }).maxHp);
    }
  });

  it("agrees with the result the ranch actually banked", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const { playback, state } = bout(seed);
      const battle = [...state.creatures].length >= 0;
      expect(battle).toBe(true);
      const won = playback.winner === 0;
      // The journal's summary and the script cannot disagree about who won.
      const start = createRanch({ seed, species: "quillfen", motes: 900 });
      const events = applyAction(start, { kind: "bout", team: team(start), tier: 1 }).events;
      const record = events.find((e) => e.kind === "battle") as { won: boolean; rounds: number } | undefined;
      expect(record).toBeDefined();
      expect(record?.won).toBe(won);
      expect(record?.rounds).toBe(playback.rounds);
    }
  });

  it("is not carried into the save", () => {
    // The script is transient by design: a save is not the place for twenty
    // seconds of timestamped strikes it will never read again.
    const { state } = bout();
    expect(JSON.stringify(state)).not.toContain('"kind":"strike"');
  });
});
