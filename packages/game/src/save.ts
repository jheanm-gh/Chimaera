/**
 * Save format: versioned JSON, with a migration path written on day one (§10).
 *
 * The migration chain exists before there is anything to migrate, deliberately.
 * Players will own creatures they refuse to lose, and the moment a save format
 * ships without a migration hook is the moment the next balance patch becomes
 * unshippable. Adding `migrateTo2` later is then an append, not a redesign.
 *
 * Genomes serialise through the genetics package's own versioned encoder, so
 * the save format and the genome format can move independently.
 */

import { deserialiseGenome, serialiseGenome } from "@chimaera/genetics";
import type { SerialisedGenome } from "@chimaera/genetics";
import { SAVE_VERSION } from "./ranch.js";
import type { Creature, RanchState } from "./types.js";

export interface SaveFile {
  readonly format: "chimaera.ranch";
  readonly version: number;
  /** Written for support and bug reports, never read by the loader. */
  readonly savedAtDay: number;
  readonly state: SerialisedRanch;
}

type SerialisedCreature = Omit<Creature, "genome"> & { readonly genome: SerialisedGenome };
type SerialisedRanch = Omit<RanchState, "creatures" | "archive"> & {
  readonly creatures: readonly SerialisedCreature[];
  readonly archive: readonly SerialisedCreature[];
};

export function saveRanch(state: RanchState): SaveFile {
  return {
    format: "chimaera.ranch",
    version: SAVE_VERSION,
    savedAtDay: state.day,
    state: {
      ...state,
      creatures: state.creatures.map(encodeCreature),
      archive: state.archive.map(encodeCreature),
    },
  };
}

export function loadRanch(file: unknown): RanchState {
  if (!isSaveFile(file)) throw new Error("This is not a Chimaera save file.");
  if (file.version > SAVE_VERSION) {
    throw new Error(
      `This save was written by a newer version of the game (save v${file.version}, this build reads v${SAVE_VERSION}).`,
    );
  }
  const migrated = migrate(file);
  return {
    ...migrated.state,
    creatures: migrated.state.creatures.map(decodeCreature),
    archive: migrated.state.archive.map(decodeCreature),
  };
}

/**
 * Migrations run in order, each taking a save at version N to version N+1.
 * Add to this array; never edit an entry that has shipped.
 */
const MIGRATIONS: readonly ((file: SaveFile) => SaveFile)[] = [
  // v1 -> v2 goes here.
];

function migrate(file: SaveFile): SaveFile {
  let current = file;
  while (current.version < SAVE_VERSION) {
    const step = MIGRATIONS[current.version - 1];
    if (!step) {
      throw new Error(`No migration from save v${current.version}; this save cannot be opened.`);
    }
    current = { ...step(current), version: current.version + 1 };
  }
  return current;
}

function encodeCreature(creature: Creature): SerialisedCreature {
  return { ...creature, genome: serialiseGenome(creature.genome) };
}

function decodeCreature(creature: SerialisedCreature): Creature {
  return { ...creature, genome: deserialiseGenome(creature.genome) };
}

function isSaveFile(value: unknown): value is SaveFile {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.format === "chimaera.ranch" &&
    typeof record.version === "number" &&
    typeof record.state === "object" &&
    record.state !== null
  );
}

export function toJson(state: RanchState): string {
  return JSON.stringify(saveRanch(state));
}

export function fromJson(json: string): RanchState {
  return loadRanch(JSON.parse(json) as unknown);
}

/**
 * A filename a player can recognise a year later. Export/import to file is
 * required by §10, and "ranch.json" in a downloads folder is not a save.
 */
export function suggestedFilename(state: RanchState): string {
  const safeSeed = state.seed.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 24);
  return `chimaera-${safeSeed}-day${state.day}.json`;
}
