import { mapOf, movesFor, phenotypeOf } from "@chimaera/game";
import type { Creature } from "@chimaera/game";
import { measure, MEASURE_NAMES, UNITS } from "@chimaera/genetics";
import type { MeasureId } from "@chimaera/genetics";

/**
 * What this animal is, and what that lets it do.
 *
 * The two halves are deliberately next to each other, because they are the same
 * information. The measurements on the left are why the moves on the right
 * exist: a creature with no tusks has no Gore, and the panel puts the cause a
 * centimetre from the effect so the player never has to be told the rule.
 *
 * Laid out as a 2x2 grid of move windows because that is the shape this idiom
 * uses, and because four is how many a player can compare at a glance.
 */

const KIND_LABEL: Record<string, string> = {
  pierce: "Pierce",
  blunt: "Blunt",
  grip: "Grip",
  toxin: "Toxin",
  display: "Nerve",
};

/** The eight, in the order a field note would take them. */
const ORDER: readonly MeasureId[] = ["mass", "length", "limbs", "stride", "hide", "armament", "tail", "acuity"];

export function MovePanel({ creature }: { creature: Creature }) {
  const map = mapOf(creature);
  const body = measure(phenotypeOf(creature), map);
  const moves = movesFor(body, creature.species);

  const reading = (id: MeasureId): string => {
    const value = body[id];
    const unit = UNITS[id];
    // The categorical half of a measurement belongs beside its number: "14mm
    // plated" is one fact about the animal, not two.
    const kind =
      id === "hide" ? ` ${body.hideKind}` : id === "armament" ? ` ${body.armamentKind}` : id === "tail" ? ` ${body.tailKind}` : "";
    if (id === "armament" && body.armamentKind === "none") return "none";
    if (id === "tail" && body.tailKind === "none") return "none";
    return `${value}${unit}${kind}`;
  };

  return (
    <div className="movepanel">
      <h3>Build</h3>
      <dl className="measure-grid">
        {ORDER.map((id) => (
          <div key={id}>
            <dt>{MEASURE_NAMES[id]}</dt>
            <dd className="mono">{reading(id)}</dd>
          </div>
        ))}
      </dl>

      <h3>What it can do</h3>
      <ul className="move-grid">
        {moves.slice(0, 6).map((move) => (
          <li key={move.id} className={`win move-cell k-${move.damage}`}>
            <span className="move-name">{move.name}</span>
            <span className="move-kind">{KIND_LABEL[move.damage] ?? move.damage}</span>
            <span className="move-flavour">{move.flavour}</span>
          </li>
        ))}
      </ul>
      {moves.length > 6 ? <p className="hint">and {moves.length - 6} more</p> : null}
    </div>
  );
}
