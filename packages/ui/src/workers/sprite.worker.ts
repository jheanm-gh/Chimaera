/**
 * Sprite generation, off the main thread.
 *
 * Drawing one creature costs about a millisecond and a half. That is nothing
 * once, and it is a dropped frame when a scroll step reveals eight new cards at
 * the same moment React is reconciling them — which is exactly what happened
 * the first time the sprites went in: twelve long tasks across a sweep of the
 * herd, where the illustration renderer had none.
 *
 * So the main thread never draws a creature. It asks for one and paints the
 * answer. Requests arrive in batches and are answered in batches, because five
 * hundred round trips cost more in message overhead than the drawing does.
 *
 * Only the genome crosses the boundary, never the ranch: a five-hundred
 * creature save is most of a megabyte, and structured-cloning it per request
 * would cost more than the work.
 */

import { expressPhenotype, geneMapById } from "@chimaera/genetics";
import type { Genome, SpeciesId } from "@chimaera/genetics";
import { renderSprite } from "@chimaera/rendering";
import type { PaletteMode } from "@chimaera/rendering";

export interface SpriteJob {
  readonly key: string;
  readonly species: SpeciesId;
  readonly genome: Genome;
  readonly mode: PaletteMode;
  readonly flip: boolean;
  /** Loci to read as recessive for one look, without touching the genome. */
  readonly suppressDominanceAt?: readonly string[];
}

export interface SpriteRequest {
  readonly jobs: readonly SpriteJob[];
}

export interface SpriteResult {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly palette: readonly string[];
  readonly pixels: Uint8Array;
}

export interface SpriteResponse {
  readonly sprites: readonly SpriteResult[];
}

self.onmessage = (event: MessageEvent<SpriteRequest>) => {
  const sprites: SpriteResult[] = [];
  const transfer: ArrayBuffer[] = [];
  for (const job of event.data.jobs) {
    const map = geneMapById(job.species);
    const phenotype = expressPhenotype(
      job.genome,
      map,
      job.suppressDominanceAt?.length ? { suppressDominanceAt: job.suppressDominanceAt } : {},
    );
    const sprite = renderSprite(phenotype, map, { mode: job.mode, ...(job.flip ? { flip: true } : {}) });
    sprites.push({
      key: job.key,
      width: sprite.width,
      height: sprite.height,
      palette: sprite.palette,
      pixels: sprite.pixels,
    });
    transfer.push(sprite.pixels.buffer as ArrayBuffer);
  }
  const response: SpriteResponse = { sprites };
  // Transferred rather than copied: nine kilobytes each, five hundred of them.
  (self as unknown as { postMessage: (m: SpriteResponse, t: ArrayBuffer[]) => void }).postMessage(response, transfer);
};
