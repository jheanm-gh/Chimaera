/**
 * The Stud Exchange (§4): "publish a creature as a stud, others breed to it and
 * you receive resources. Social layer without a chat system."
 *
 * A stud offer is a genome code with a name and a fee on it. Breeding to one
 * does not give you the animal — you never own it, you cannot see its pedigree,
 * and you cannot look at loci you have not paid to read. What you get is one
 * gamete's worth of somebody else's work, which is exactly what a stud fee buys
 * in the real thing.
 *
 * Two rules make it a genuine relief valve rather than a shop:
 *
 *  1. **A stud is unrelated by construction.** It has no pedigree on your
 *     ranch, so Wright's F for the pairing is zero — which is the entire reason
 *     a closed herd wants one, and why the fee is worth paying.
 *  2. **The offspring is yours and the stud is not.** You get the animal; the
 *     publisher gets paid. Nothing crosses in the other direction, so there is
 *     no state to reconcile between two players who will never talk.
 */

import { geneMapById, sexOf } from "@chimaera/genetics";
import type { Genome, SpeciesId } from "@chimaera/genetics";
import { decodeGenome, encodeGenome } from "./codes.js";
import type { Creature, RanchState, StudRecord } from "./types.js";

export const STUD_OFFER_VERSION = 1;

export interface StudOffer {
  readonly version: number;
  readonly name: string;
  readonly station: string;
  readonly species: SpeciesId;
  readonly code: string;
  /** What breeding to him costs. Set by whoever published him. */
  readonly fee: number;
  /** Loci the publisher chose to disclose. Everything else stays theirs. */
  readonly disclosed: readonly string[];
}

/**
 * Publishes one of yours.
 *
 * The publisher chooses what to disclose. Disclosing nothing is allowed and is
 * a perfectly good strategy — an undisclosed stud is a gamble, and gambles are
 * cheap. The fee is the publisher's, so the market is theirs to read.
 */
export function publishStud(
  creature: Creature,
  station: string,
  options: { readonly fee?: number; readonly disclose?: readonly string[] } = {},
): StudOffer {
  if (creature.sex !== "male") throw new Error("A stud is a male. Publish a dam through the same exchange one day.");
  return {
    version: STUD_OFFER_VERSION,
    name: creature.name,
    station,
    species: creature.species,
    code: encodeGenome(creature.genome),
    fee: Math.max(0, Math.round(options.fee ?? 200)),
    disclosed: [...(options.disclose ?? creature.revealed)],
  };
}

/** Turns an offer back into something breedable, or explains why it will not. */
export function readStud(offer: StudOffer): { genome: Genome; species: SpeciesId } {
  if (offer.version !== STUD_OFFER_VERSION) {
    throw new Error(`That offer is version ${offer.version}; this build reads version ${STUD_OFFER_VERSION}.`);
  }
  const decoded = decodeGenome(offer.code);
  if (decoded.species !== offer.species) throw new Error("That offer's code does not match the species it claims.");
  const map = geneMapById(decoded.species);
  if (sexOf(decoded.genome, map) !== "male") throw new Error("That offer is not a male.");
  return { genome: decoded.genome, species: decoded.species };
}

/** Serialised for pasting. One line, so it survives every chat window there is. */
export function encodeOffer(offer: StudOffer): string {
  return [
    `stud${offer.version}`,
    offer.species,
    offer.fee,
    encodeURIComponent(offer.station),
    encodeURIComponent(offer.name),
    offer.disclosed.join("."),
    offer.code,
  ].join(":");
}

export function decodeOffer(text: string): StudOffer {
  const parts = text.trim().split(":");
  if (parts.length !== 7 || !parts[0]?.startsWith("stud")) throw new Error("That is not a stud offer.");
  const version = Number(parts[0].slice(4));
  const fee = Number(parts[2]);
  if (!Number.isFinite(version) || !Number.isFinite(fee)) throw new Error("That stud offer is malformed.");
  const offer: StudOffer = {
    version,
    species: parts[1] as SpeciesId,
    fee,
    station: decodeURIComponent(parts[3] ?? ""),
    name: decodeURIComponent(parts[4] ?? ""),
    disclosed: (parts[5] ?? "").split(".").filter(Boolean),
    code: parts[6] ?? "",
  };
  // Fails here rather than at the pairing screen, where a player has already
  // chosen a dam and spent the day.
  readStud(offer);
  return offer;
}

/**
 * Records that one of your studs was used.
 *
 * There is no server, so this is applied when a player tells the game a
 * pairing happened — by pasting back the receipt the other station's game
 * produced. It is an honour system with a paper trail, which is the most a
 * ghost-data social layer can honestly offer.
 */
export function recordStudUse(state: RanchState, code: string, fee: number): RanchState {
  const studs = state.records.studs.map((stud): StudRecord =>
    stud.code === code ? { ...stud, uses: stud.uses + 1, earned: stud.earned + fee } : stud,
  );
  if (!studs.some((stud) => stud.code === code)) return state;
  return {
    ...state,
    inventory: { ...state.inventory, motes: state.inventory.motes + fee },
    records: { ...state.records, studs },
  };
}

export function addPublishedStud(state: RanchState, offer: StudOffer): RanchState {
  if (state.records.studs.some((stud) => stud.code === offer.code)) return state;
  const record: StudRecord = {
    code: offer.code,
    name: offer.name,
    species: offer.species,
    publishedOnDay: state.day,
    uses: 0,
    earned: 0,
  };
  return { ...state, records: { ...state.records, studs: [...state.records.studs, record] } };
}

/** A receipt the other station pastes back, so a use can be claimed. */
export function studReceipt(offer: StudOffer, onDay: number): string {
  return `used:${offer.code.slice(0, 12)}:${offer.fee}:${onDay}`;
}
