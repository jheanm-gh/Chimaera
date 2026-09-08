/**
 * The sprite store.
 *
 * One worker, one cache, and a subscription so a card can paint the moment its
 * animal is ready. Everything the UI knows about sprite generation is here; a
 * component only ever asks for a key and gets either a sprite or nothing yet.
 *
 * Requests are coalesced into one batch per frame. Scrolling reveals cards a
 * row at a time, and asking for eight sprites in eight messages costs more in
 * round trips than the drawing does.
 */

import { toRgba } from "@chimaera/rendering";
import type { PaletteMode } from "@chimaera/rendering";
import type { Genome, SpeciesId } from "@chimaera/genetics";
import type { Creature } from "@chimaera/game";
import type { SpriteJob, SpriteRequest, SpriteResponse, SpriteResult } from "./workers/sprite.worker.js";

export interface Sprite {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

const cache = new Map<string, Sprite>();
const pending = new Map<string, SpriteJob>();
const listeners = new Set<() => void>();
/** Bounded: a long session must not accumulate every animal ever displayed. */
const LIMIT = 900;

let worker: Worker | undefined;
let flushing = false;

function ensureWorker(): Worker | undefined {
  if (worker) return worker;
  if (typeof Worker === "undefined") return undefined;
  worker = new Worker(new URL("./workers/sprite.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<SpriteResponse>) => {
    for (const result of event.data.sprites) remember(result);
    for (const listener of listeners) listener();
  };
  return worker;
}

function remember(result: SpriteResult): void {
  cache.set(result.key, {
    width: result.width,
    height: result.height,
    rgba: toRgba({ width: result.width, height: result.height, pixels: result.pixels, palette: result.palette }),
  });
  pending.delete(result.key);
  if (cache.size > LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function flush(): void {
  flushing = false;
  const jobs = [...pending.values()];
  if (jobs.length === 0) return;
  const target = ensureWorker();
  if (!target) return;
  const request: SpriteRequest = { jobs };
  target.postMessage(request);
}

export function spriteKey(
  creature: Creature,
  mode: PaletteMode,
  flip: boolean,
  suppressDominanceAt?: readonly string[],
): string {
  const suppress = suppressDominanceAt?.length ? suppressDominanceAt.join(",") : "";
  return `${creature.id}|${creature.name}|${mode}|${flip ? "L" : "R"}|${suppress}`;
}

/**
 * The sprite for a creature, if it has been drawn.
 *
 * Returns undefined the first time and queues the work; the subscriber is
 * notified when the answer lands. Callers render a placeholder in the gap,
 * which lasts a frame or two.
 */
export function getSprite(
  creature: Creature,
  mode: PaletteMode,
  flip: boolean,
  suppressDominanceAt?: readonly string[],
): Sprite | undefined {
  const key = spriteKey(creature, mode, flip, suppressDominanceAt);
  const hit = cache.get(key);
  if (hit) return hit;
  if (!pending.has(key)) {
    pending.set(key, {
      key,
      species: creature.species,
      genome: creature.genome,
      mode,
      flip,
      ...(suppressDominanceAt?.length ? { suppressDominanceAt } : {}),
    });
    schedule();
  }
  return undefined;
}

/**
 * One batch per turn of the event loop.
 *
 * Coalescing a scrolled-in row into a single message is most of the reason this
 * is not just eight postMessage calls.
 */
function schedule(): void {
  if (flushing) return;
  flushing = true;
  queueMicrotask(() => setTimeout(flush, 0));
}

/**
 * Draw the whole herd before the player asks for it.
 *
 * Scrolling should never wait on a worker round trip, and five hundred animals
 * is under a second of work on a thread nothing else is using. Called once when
 * a ranch loads.
 */
export function prewarm(creatures: readonly Creature[], mode: PaletteMode): void {
  for (const creature of creatures) getSprite(creature, mode, false);
}

/**
 * A sprite for something that is not in the herd.
 *
 * The animals across the sand are generated for the fight and never enter the
 * ranch, so they have a genome and a species but no `Creature` to key on. The
 * cache does not care — it only ever needed a key and a genome.
 */
export function getBattleSprite(
  id: string,
  species: SpeciesId,
  genome: Genome,
  flip: boolean,
  mode: PaletteMode = "full",
): Sprite | undefined {
  const key = `battle:${id}|${mode}|${flip ? "L" : "R"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!pending.has(key)) {
    pending.set(key, { key, species, genome, mode, flip });
    schedule();
  }
  return undefined;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
