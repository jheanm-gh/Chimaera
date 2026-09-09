/**
 * Entering a show (§4).
 *
 * Kept apart from `exhibition.ts` — which is pure judging and knows nothing
 * about a ranch — so that the scoring can be reasoned about, tested and reused
 * (a Rival Ranch ghost is judged by the same function) without dragging the
 * reducer in behind it.
 */

import { rngFromState } from "@chimaera/genetics";
import type { Phenotype } from "@chimaera/genetics";
import { mapOf } from "./bestiary.js";
import {
  buildField,
  judge,
  judgeRival,
  placeField,
  purseFor,
  showTier,
  standardForDay,
} from "./exhibition.js";
import type { ShowEntrant, ShowResult } from "./exhibition.js";
import { isOpen } from "./modes.js";
import type { ActionResult, CreatureId, GameEvent, RanchState, Ribbon } from "./types.js";

export function enterShow(
  state: RanchState,
  id: CreatureId,
  tier: number,
  phenotypeOf: (creature: RanchState["creatures"][number]) => Phenotype,
): ActionResult {
  const blocked = (reason: string): ActionResult => ({ state, events: [{ kind: "blocked", reason }] });

  if (!isOpen(state, "exhibition")) {
    return blocked("The show ring is not open to you yet. Find something nobody has recorded first.");
  }
  const creature = state.creatures.find((c) => c.id === id && c.status === "active");
  if (!creature) return blocked("That creature is not on the ranch.");
  if (creature.stage === "egg" || creature.stage === "hatchling") {
    return blocked("Hatchlings are not shown. Wait until it is an animal.");
  }
  if (state.expedition) return blocked("You are out on an expedition.");

  const entry = showTier(tier);
  if (state.inventory.motes < entry.entryFee) {
    return blocked(`The ${entry.name} costs ${entry.entryFee} motes to enter.`);
  }

  const result = runShow(state, id, tier, phenotypeOf);
  if (!result) return blocked("That show could not be judged.");

  const ribbon: Ribbon = {
    day: state.day,
    standard: result.standard.id,
    species: creature.species,
    creatureId: creature.id,
    name: creature.name,
    placement: result.placement,
    field: result.entrants.length,
    score: result.entrants[result.placement - 1]?.scorecard.total ?? 0,
    tier: entry.tier,
  };

  const events: GameEvent[] = [
    {
      kind: "placed",
      id: creature.id,
      name: creature.name,
      placement: result.placement,
      field: result.entrants.length,
      standard: result.standard.name,
      purse: result.purse,
    },
  ];

  return {
    state: {
      ...state,
      rngCursor: state.rngCursor + 1,
      inventory: {
        ...state.inventory,
        motes: state.inventory.motes - entry.entryFee + result.purse,
      },
      records: { ...state.records, ribbons: [...state.records.ribbons, ribbon] },
    },
    events,
  };
}

/**
 * Judges the ring without changing anything.
 *
 * Exported because the show screen shows the player the field *before* they
 * commit the entry fee — not the scores, but the standard, the tier and what
 * their own animal scores against it. A show they cannot preview is a show they
 * cannot breed for.
 */
export function runShow(
  state: RanchState,
  id: CreatureId,
  tier: number,
  phenotypeOf: (creature: RanchState["creatures"][number]) => Phenotype,
): ShowResult | undefined {
  const creature = state.creatures.find((c) => c.id === id);
  if (!creature) return undefined;

  const map = mapOf(creature);
  const standard = standardForDay(state.day);
  const entry = showTier(tier);
  // Seeded from the day and the tier as well as the cursor, so previewing a
  // show and then entering it faces the same field.
  const rng = rngFromState(state.rng).fork(`show:${state.day}:${entry.tier}`);

  const mine: ShowEntrant = {
    id: creature.id,
    name: creature.name,
    scorecard: judge(creature, phenotypeOf(creature), standard),
    mine: true,
  };
  const rivals: ShowEntrant[] = buildField(map, standard, entry, rng).map((rival, index) => ({
    id: `rival-${index}`,
    name: rival.name,
    scorecard: judgeRival(rival.phenotype, map, standard, rival.condition),
    mine: false,
  }));

  const entrants = placeField([mine, ...rivals]);
  const placement = entrants.findIndex((e) => e.mine) + 1;
  return { standard, tier: entry, entrants, placement, purse: purseFor(entry, placement) };
}
