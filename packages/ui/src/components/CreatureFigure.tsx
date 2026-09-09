import { mapOf } from "@chimaera/game";
import type { Creature } from "@chimaera/game";
import type { DetailLevel, PaletteMode } from "@chimaera/rendering";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { getSprite, subscribe } from "../sprites.js";

interface Props {
  readonly creature: Creature;
  readonly mode: PaletteMode;
  readonly width?: number;
  /** Draw the ground shadow the creature stands on. */
  readonly frame?: boolean;
  readonly detail?: DetailLevel;
  /** Show the recessive form for one observation, without changing the genome. */
  readonly suppressDominanceAt?: readonly string[];
  /** Face left, for the near side of a battle. */
  readonly flip?: boolean;
  /** Hold still — for a fainted animal, or a still frame in a screenshot. */
  readonly still?: boolean;
}

/**
 * The creature, on screen.
 *
 * A sprite rather than a drawing, but the rule that outlived the change of
 * medium is that the renderer reads only the Phenotype — so the picture still
 * cannot leak a genotype the player has not earned.
 *
 * The pixels arrive from a worker and are pushed straight into a canvas. No PNG
 * in between: encoding one and base64-ing it cost half again what drawing the
 * animal did, and the browser only decoded it back to exactly these bytes.
 *
 * The idle bob is CSS. Five hundred creatures each running their own animation
 * frame would be five hundred timers fighting over one main thread; five hundred
 * CSS animations are composited off it. `steps(2)` rather than a smooth
 * translate, because a sprite that slides between pixels stops being pixel art.
 */
export const CreatureFigure = memo(function CreatureFigure({
  creature,
  mode,
  width = 200,
  frame = true,
  suppressDominanceAt,
  flip = false,
  still = false,
}: Props) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  // Re-read the store when the worker answers. The store owns the cache; this
  // is only a nudge to look again.
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);

  const sprite = getSprite(creature, mode, flip, suppressDominanceAt);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !sprite) return;
    const context = element.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, element.width, element.height);
    // Built through the context rather than `new ImageData(...)`: the buffer
    // comes back from a worker transfer, and the constructor's typing insists
    // on an ArrayBuffer it cannot prove this is.
    const image = context.createImageData(sprite.width, sprite.height);
    image.data.set(sprite.rgba);
    context.putImageData(image, 0, 0);
  }, [sprite]);

  // Stagger the bob so a grid of animals does not breathe in unison, which
  // reads as a screensaver rather than as a paddock full of creatures.
  const offset = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < creature.id.length; i++) hash = (hash * 31 + creature.id.charCodeAt(i)) >>> 0;
    return (hash % 900) / 1000;
  }, [creature.id]);

  // The sprite is square, but a creature card is not. Sizing to the box's
  // height rather than its width keeps cards the shape the grid expects.
  const size = Math.round(width * 0.8);
  return (
    <div className="figure sprite-figure" style={{ width, height: size }}>
      {frame ? <div className="sprite-shadow" style={{ width: size * 0.46 }} /> : null}
      <canvas
        ref={canvas}
        className={still ? "sprite-still" : "sprite-idle"}
        width={sprite?.width ?? 96}
        height={sprite?.height ?? 96}
        style={{
          width: size,
          height: size,
          // Nothing to show yet reads better as empty paper than as a flash of
          // a half-painted animal.
          visibility: sprite ? "visible" : "hidden",
          ...(still ? {} : { animationDelay: `${offset}s` }),
        }}
        role="img"
        aria-label={`${creature.name}, ${creature.sex === "female" ? "female" : "male"} ${mapOf(creature).species.name}`}
      />
    </div>
  );
});
