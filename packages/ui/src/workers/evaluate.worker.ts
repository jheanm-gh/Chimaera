/**
 * Bulk battle simulation, off the main thread (§10).
 *
 * A fifty-fight evaluation is only a few milliseconds, but a player comparing
 * lineages will ask for hundreds, and the answer arriving without the ranch
 * stuttering is the difference between a tool they use and one they avoid.
 *
 * Only the combatant specs cross the boundary, never the ranch: a five-hundred
 * creature save is most of a megabyte, and structured-cloning it per query
 * would cost more than the simulation.
 */

import { simulateBattle, wildOpponents } from "@chimaera/game";
import type { CombatantSpec } from "@chimaera/game";
import { createRng, geneMapFor, QUILLFEN } from "@chimaera/genetics";

export interface EvaluateRequest {
  readonly specs: CombatantSpec[];
  readonly difficulty: number;
  readonly fights: number;
  readonly seed: string;
}

export interface EvaluateResponse {
  readonly winRate: number;
  readonly meanRounds: number;
  readonly survival: Record<string, number>;
  readonly fights: number;
  readonly elapsedMs: number;
}

const map = geneMapFor(QUILLFEN);

self.onmessage = (event: MessageEvent<EvaluateRequest>) => {
  const { specs, difficulty, fights, seed } = event.data;
  const started = performance.now();
  const rng = createRng(seed);
  const survival: Record<string, number> = Object.fromEntries(specs.map((s) => [s.id, 0]));
  let wins = 0;
  let rounds = 0;

  for (let i = 0; i < fights; i++) {
    const theirs = wildOpponents(map, difficulty, specs.length, rng).specs;
    const result = simulateBattle(specs, theirs, rng, { quiet: true });
    if (result.winner === 0) wins++;
    rounds += result.rounds;
    for (const survivor of result.survivors) {
      if (survivor.team === 0) survival[survivor.id] = (survival[survivor.id] ?? 0) + 1;
    }
  }
  for (const id of Object.keys(survival)) survival[id] = (survival[id] ?? 0) / fights;

  const response: EvaluateResponse = {
    winRate: fights === 0 ? 0 : wins / fights,
    meanRounds: fights === 0 ? 0 : rounds / fights,
    survival,
    fights,
    elapsedMs: performance.now() - started,
  };
  self.postMessage(response);
};
