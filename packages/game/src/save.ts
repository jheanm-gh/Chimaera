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
import { speciesForBiome } from "./bestiary.js";
import { NEW_CAMPAIGN } from "./campaign.js";
import { SAVE_VERSION } from "./ranch.js";
import { NO_RECORDS } from "./types.js";
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
  // v1 -> v2: the campaign arrived. A v1 ranch has done none of it, so it
  // starts at chapter 1 with everything it has already achieved unrecorded —
  // which is correct: the objectives are re-asked of the state on the next
  // action, and anything that is still true will tick immediately.
  (file) => ({ ...file, state: { ...file.state, campaign: NEW_CAMPAIGN } }),
  // v2 -> v3: the ranch learned it was posted somewhere. Every v2 save was a
  // Quillfen station by construction, and any expedition in progress was in the
  // Mirefen — but read the biome rather than assuming, because a v2 save was
  // free to hold a region generated with any biome string.
  (file) => {
    const state = file.state as unknown as Record<string, unknown>;
    const expedition = state.expedition as { region?: { biome?: string; species?: string } } | undefined;
    const region = expedition?.region;
    return {
      ...file,
      state: {
        ...file.state,
        homeSpecies: "quillfen",
        ...(region
          ? {
              expedition: {
                ...expedition,
                region: { ...region, species: region.species ?? speciesForBiome(region.biome ?? "") ?? "quillfen" },
              },
            }
          : {}),
      } as SerialisedRanch,
    };
  },
  // v3 -> v4: the modes arrived and needed somewhere to keep their results. A
  // v3 ranch has played none of them, which is what an empty record set means.
  (file) => ({ ...file, state: { ...file.state, records: NO_RECORDS } }),
  // v4 -> v5 goes here.
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
