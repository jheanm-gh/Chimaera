import type { BattleActor, BattlePlayback } from "@chimaera/game";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBattleSprite, subscribe } from "../sprites.js";

/**
 * A fight, watched.
 *
 * The simulation is already over by the time this mounts. `simulateBattle`
 * resolved it, banked the loot and advanced the day, and what arrives here is a
 * timestamped script — which is the only honest way to animate a deterministic
 * game. Nothing on this canvas can change who won; if the scene and the result
 * ever disagreed, the scene would be lying.
 *
 * That also means the player can skip it. A replay you are forced to sit
 * through is a loading screen with a story.
 *
 * Everything is drawn to one canvas at a fixed internal resolution and scaled
 * up with nearest-neighbour, so the whole scene lives on the same pixel grid as
 * the creatures standing in it. A sprite drawn at 2.6x on a CSS-scaled div
 * would be the one blurred thing on screen.
 */

/** Internal resolution. Scaled up whole, never fitted to the element. */
const STAGE = { width: 320, height: 180 } as const;

interface Props {
  readonly playback: BattlePlayback;
  readonly onDone: () => void;
}

interface Hit {
  /** Seconds into the script. */
  readonly at: number;
  readonly by: string;
  readonly target: string;
  readonly damage: number;
  readonly affinity: number;
  readonly remaining: number;
}

/**
 * Where an actor stands, and how big it is drawn.
 *
 * The near side sits low and left and is drawn larger; the far side sits high
 * and right and smaller. That is the whole trick of depth in a flat scene, and
 * it is the arrangement every game in this idiom has used since 1996 because it
 * reads instantly.
 */
function placement(actor: BattleActor, index: number, count: number): { x: number; y: number; scale: number } {
  const near = actor.team === 0;
  const spread = count === 1 ? 0 : (index / (count - 1) - 0.5) * 2;
  return near
    ? { x: 84 + spread * 52, y: 158 + spread * 9, scale: 0.74 }
    : { x: 230 + spread * 42, y: 92 + spread * 7, scale: 0.54 };
}

/**
 * The health boxes, opposite their creature.
 *
 * Far team's bars go top-left, near team's bottom-right — across the diagonal
 * from the animal they describe, so neither ever covers the other.
 */
function barBox(team: 0 | 1, index: number): { x: number; y: number } {
  return team === 0 ? { x: STAGE.width - 126, y: 116 + index * 19 } : { x: 8, y: 8 + index * 19 };
}

export function BattleScene({ playback, onDone }: Props) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);

  const actors = playback.actors;
  const near = actors.filter((a) => a.team === 0);
  const far = actors.filter((a) => a.team === 1);

  // Both sides face the fight. The sprites are drawn facing right by default,
  // so the near team is left alone and the far team is flipped to look back
  // down the sand at it.
  const sprites = new Map(
    actors.map((actor) => [actor.id, getBattleSprite(actor.id, actor.species, actor.genome, actor.team === 1)]),
  );
  const ready = [...sprites.values()].every((sprite) => sprite !== undefined);

  const script = useMemo(() => {
    let hits: Hit[] = [];
    let downs: { at: number; who: string }[] = [];
    let end = 0;
    for (const event of playback.log) {
      if (event.kind === "strike") {
        hits.push({
          at: event.t,
          by: event.by,
          target: event.target,
          damage: event.damage,
          affinity: event.affinity,
          remaining: event.remaining,
        });
      } else if (event.kind === "down") {
        downs.push({ at: event.t, who: event.who });
      } else if (event.kind === "end") {
        end = event.t;
      }
    }
    // The resolver's timestamps span twenty to thirty seconds, which is right
    // for a fight you are *reading* and far too long for one you are watching.
    // Compressed, not resampled: the order and the spacing survive.
    const span = Math.max(end, ...hits.map((h) => h.at), 1);
    const squeeze = Math.min(1, 9 / span);
    hits = hits.map((h) => ({ ...h, at: h.at * squeeze }));
    downs = downs.map((d) => ({ ...d, at: d.at * squeeze }));
    return { hits, downs, end: end * squeeze + 1.1 };
  }, [playback]);

  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;

    const started = performance.now();
    let frame = 0;
    let finished = false;

    // Sprites are painted through a scratch canvas so a hit flash can recolour
    // one without touching the cached pixels every other frame reads.
    const scratch = document.createElement("canvas");
    const scratchContext = scratch.getContext("2d");

    const draw = (): void => {
      const now = (performance.now() - started) / 1000;
      if (!finished && now > script.end) {
        finished = true;
        setDone(true);
      }
      const health = new Map<string, number>(actors.map((a) => [a.id, 1]));
      for (const hit of script.hits) {
        if (hit.at <= now) {
          const actor = actors.find((a) => a.id === hit.target);
          if (actor) health.set(hit.target, Math.max(0, hit.remaining / Math.max(1, actor.maxHp)));
        }
      }

      // --- ground ---------------------------------------------------------
      const sky = context.createLinearGradient(0, 0, 0, STAGE.height);
      sky.addColorStop(0, "#3c4a3a");
      sky.addColorStop(0.62, "#59634a");
      sky.addColorStop(1, "#6d7355");
      context.fillStyle = sky;
      context.fillRect(0, 0, STAGE.width, STAGE.height);

      // Two platforms, one per side. Ellipses rather than a horizon line: the
      // fight reads as happening somewhere, without needing a painted place.
      const platform = (x: number, y: number, rx: number): void => {
        context.fillStyle = "rgba(30,38,26,0.42)";
        context.beginPath();
        context.ellipse(x, y, rx, rx * 0.3, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(126,140,98,0.5)";
        context.beginPath();
        context.ellipse(x, y - 2, rx * 0.94, rx * 0.26, 0, 0, Math.PI * 2);
        context.fill();
      };
      platform(84, 162, 62);
      platform(228, 98, 44);

      // --- combatants -----------------------------------------------------
      const order = [...far, ...near];
      for (const actor of order) {
        const sprite = sprites.get(actor.id);
        if (!sprite || !scratchContext) continue;
        const group = actor.team === 0 ? near : far;
        const spot = placement(actor, group.indexOf(actor), group.length);
        const hp = health.get(actor.id) ?? 1;

        // The most recent hit on this actor drives flash and recoil.
        let recoil = 0;
        let flash = 0;
        for (const hit of script.hits) {
          if (hit.target !== actor.id || hit.at > now) continue;
          const since = now - hit.at;
          if (since < 0.32) {
            recoil = Math.max(recoil, (1 - since / 0.32) * 5);
            flash = Math.max(flash, since < 0.11 ? 1 : 0);
          }
        }
        // And the most recent hit *by* it drives the lunge.
        let lunge = 0;
        for (const hit of script.hits) {
          if (hit.by !== actor.id || hit.at > now) continue;
          const since = now - hit.at + 0.13;
          if (since > 0 && since < 0.3) lunge = Math.sin((since / 0.3) * Math.PI) * 9;
        }

        const downAt = script.downs.find((d) => d.who === actor.id && d.at <= now);
        const fell = downAt ? Math.min(1, (now - downAt.at) / 0.55) : 0;
        if (fell >= 1 && hp <= 0) continue;

        scratch.width = sprite.width;
        scratch.height = sprite.height;
        const image = scratchContext.createImageData(sprite.width, sprite.height);
        image.data.set(sprite.rgba);
        if (flash > 0) {
          // Every lit pixel to white for two frames. The oldest hit cue there
          // is, and still the one that reads fastest.
          for (let i = 3; i < image.data.length; i += 4) {
            if ((image.data[i] as number) === 0) continue;
            image.data[i - 3] = 255;
            image.data[i - 2] = 255;
            image.data[i - 1] = 255;
          }
        }
        scratchContext.putImageData(image, 0, 0);

        const size = Math.round(sprite.width * spot.scale);
        const toward = actor.team === 0 ? 1 : -1;
        const bob = Math.sin(now * 3.1 + spot.x) * 1.4;
        const x = Math.round(spot.x - size / 2 + toward * lunge - toward * recoil);
        const y = Math.round(spot.y - size + bob + fell * 14);

        context.save();
        if (fell > 0) context.globalAlpha = 1 - fell * 0.85;
        context.drawImage(scratch, x, y, size, size);
        context.restore();
      }

      // --- bars -----------------------------------------------------------
      for (const actor of actors) {
        const group = actor.team === 0 ? near : far;
        const index = group.indexOf(actor);
        const hp = health.get(actor.id) ?? 1;
        const box = barBox(actor.team, index);
        context.fillStyle = "rgba(22,26,20,0.86)";
        context.fillRect(box.x, box.y, 118, 16);
        context.strokeStyle = "rgba(220,222,212,0.32)";
        context.lineWidth = 1;
        context.strokeRect(box.x + 0.5, box.y + 0.5, 117, 15);
        context.fillStyle = hp > 0 ? "#dcded4" : "#8b8f84";
        context.font = "7px monospace";
        context.textBaseline = "top";
        context.fillText(actor.name.slice(0, 18), box.x + 4, box.y + 2);
        context.fillStyle = "rgba(0,0,0,0.55)";
        context.fillRect(box.x + 4, box.y + 11, 110, 3);
        // Green, amber, red — the reading a player takes without stopping to
        // read anything.
        context.fillStyle = hp > 0.5 ? "#6f9160" : hp > 0.22 ? "#c08b2c" : "#b4472b";
        context.fillRect(box.x + 4, box.y + 11, Math.round(110 * hp), 3);
      }

      // --- damage numbers -------------------------------------------------
      context.font = "9px monospace";
      context.textAlign = "center";
      for (const hit of script.hits) {
        const since = now - hit.at;
        if (since < 0 || since > 0.85) continue;
        const actor = actors.find((a) => a.id === hit.target);
        if (!actor) continue;
        const group = actor.team === 0 ? near : far;
        const spot = placement(actor, group.indexOf(actor), group.length);
        const rise = since * 22;
        // Just above the animal it happened to, not floating in the sky — and
        // never so high that it climbs into the other side's health boxes.
        const top = Math.max(spot.y - 96 * spot.scale - 6 - rise, actor.team === 0 ? 70 : 4);
        context.globalAlpha = Math.max(0, 1 - since / 0.85);
        // An affinity hit is the genetic lever paying off, so it gets its own
        // colour and its own word.
        context.fillStyle = hit.affinity > 1.05 ? "#ffd76a" : hit.affinity < 0.95 ? "#9ea497" : "#f2ece0";
        context.fillText(`-${Math.round(hit.damage)}`, spot.x, top);
        if (hit.affinity > 1.05) {
          context.font = "7px monospace";
          context.fillText("well matched", spot.x, top - 9);
          context.font = "9px monospace";
        }
        context.globalAlpha = 1;
      }
      context.textAlign = "left";

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [ready, script, actors, near, far, sprites]);

  const won = playback.winner === 0;
  return (
    <div className="battle-scene">
      <div className="battle-stage">
        <canvas ref={canvas} width={STAGE.width} height={STAGE.height} aria-hidden="true" />
        {!ready ? <p className="battle-loading">Setting the sand…</p> : null}
      </div>
      <div className="battle-caption">
        <p role="status">
          {done
            ? won
              ? `Took ${playback.title} in ${playback.rounds} rounds.`
              : `Lost ${playback.title} after ${playback.rounds} rounds.`
            : `${playback.title} — ${playback.rounds} rounds`}
        </p>
        <button type="button" onClick={onDone}>
          {done ? "Done" : "Skip"}
        </button>
      </div>
    </div>
  );
}
