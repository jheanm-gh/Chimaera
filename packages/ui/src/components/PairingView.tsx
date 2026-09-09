import { fertilePairs, ITEMS, mapOf, phenotypeOf, projectedInbreeding } from "@chimaera/game";
import type { Creature } from "@chimaera/game";
import { inbreedingPenalty, knowledgeFromGenome, predictOffspring } from "@chimaera/genetics";
import type { LocusId, OffspringPrediction } from "@chimaera/genetics";
import type { PaletteMode } from "@chimaera/rendering";
import { useMemo, useState } from "react";
import type { RanchController } from "../useRanch.js";

import { CreatureFigure } from "./CreatureFigure.js";

interface Props {
  readonly ranch: RanchController;
  readonly mode: PaletteMode;
}

export function PairingView({ ranch, mode }: Props) {
  const { sires, dams: allDams } = fertilePairs(ranch.state);
  const [sireId, setSireId] = useState<string>(() => sires[0]?.id ?? "");
  const [damId, setDamId] = useState<string>(() => allDams[0]?.id ?? "");
  const [targets, setTargets] = useState<LocusId[] | undefined>(undefined);
  const [items, setItems] = useState<string[]>([]);

  const sire = sires.find((c) => c.id === sireId) ?? sires[0];
  // Only dams of the sire's species: a cross-species pairing is refused by the
  // reducer, and offering it in the chooser would be an invitation to a
  // rejection message.
  const dams = sire ? allDams.filter((c) => c.species === sire.species) : allDams;
  const dam = dams.find((c) => c.id === damId) ?? dams[0];
  const map = sire ? mapOf(sire) : ranch.map;
  // Two loci to start with, chosen from whatever species this is: the first
  // visible form locus and the first one carrying a lethal, which is the pair a
  // breeder wants on screen before anything else.
  const defaultTargets = useMemo<LocusId[]>(() => {
    const lethal = map.loci.find((locus) => locus.alleles.some((allele) => allele.lethal));
    // A locus that is not the lethal one: on some species the first visible
    // form gene *is* the lethal, and offering the same locus twice would leave
    // the predictor showing one column on a screen built for two.
    const form = map.loci.find(
      (locus) => locus.mode.kind === "dominance" && locus.trait !== undefined && locus.id !== lethal?.id,
    );
    return [lethal?.id, form?.id].filter((id): id is LocusId => id !== undefined);
  }, [map]);
  const chosenTargets = targets ?? defaultTargets;

  const f = sire && dam ? projectedInbreeding(ranch.state, sire.id, dam.id) : 0;
  const penalty = inbreedingPenalty(f);

  const prediction = useMemo<OffspringPrediction | undefined>(() => {
    if (!sire || !dam || chosenTargets.length === 0) return undefined;
    try {
      return predictOffspring(
        knowledgeFromGenome(sire.genome, map, phenotypeOf(sire), sire.revealed, {
          revealPhase: sire.phaseKnown,
        }),
        knowledgeFromGenome(dam.genome, map, phenotypeOf(dam), dam.revealed, {
          revealPhase: dam.phaseKnown,
        }),
        map,
        chosenTargets,
      );
    } catch {
      return undefined;
    }
  }, [sire, dam, map, chosenTargets]);

  const breedingItems = ITEMS.filter(
    (item) => item.effect.kind === "breeding" && (ranch.state.inventory.items[item.id] ?? 0) > 0,
  );

  if (!sire || !dam) {
    return (
      <div className="panel">
        <h2>Pairing</h2>
        <p className="note">
          You need a fertile male and a fertile female. Fertility opens when a creature becomes an adult and closes
          when it becomes an elder — so this is also a warning about the herd you are holding.
        </p>
      </div>
    );
  }

  return (
    <div className="pairing">
      <div className="panel">
        <h2>Pairing</h2>
        <div className="pair-choosers">
          <ParentChooser label="Sire" options={sires} value={sire.id} onChange={setSireId} mode={mode} ranch={ranch} />
          <ParentChooser label="Dam" options={dams} value={dam.id} onChange={setDamId} mode={mode} ranch={ranch} />
        </div>

        <div className={`kinship kinship-${penalty.severity}`}>
          <div>
            <span className="kinship-label">Coefficient of inbreeding</span>
            <strong>F = {f.toFixed(4)}</strong>
          </div>
          <ul>
            <li>fertility ×{penalty.fertilityMultiplier.toFixed(2)}</li>
            <li>stillbirth {(penalty.stillbirthChance * 100).toFixed(0)}%</li>
            <li>stat depression {(penalty.statDepression * 100).toFixed(0)}%</li>
          </ul>
          <p className="severity">{severityCopy(penalty.severity)}</p>
        </div>

        <fieldset className="items">
          <legend>Apply</legend>
          {breedingItems.length === 0 ? <p className="hint">No breeding items in store.</p> : null}
          {breedingItems.map((item) => (
            <label key={item.id} title={item.blurb}>
              <input
                type="checkbox"
                checked={items.includes(item.id)}
                onChange={(event) =>
                  setItems((current) =>
                    event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                  )
                }
              />
              {item.name} ×{ranch.state.inventory.items[item.id] ?? 0}
            </label>
          ))}
        </fieldset>

        <button
          type="button"
          className="primary"
          onClick={() => {
            ranch.dispatch({ kind: "breed", sireId: sire.id, damId: dam.id, items });
            setItems([]);
          }}
        >
          Pair them — one day
        </button>
      </div>

      <div className="panel predictor">
        <h2>Punnett predictor</h2>
        <p className="hint">
          This reads only what you have established about these two. Where your information runs out it gives you a
          range, not a guess.
        </p>

        <fieldset className="target-picker">
          <legend>Loci to predict (up to 6)</legend>
          <div className="target-grid">
            {map.loci.map((locus) => (
              <label key={locus.id}>
                <input
                  type="checkbox"
                  checked={chosenTargets.includes(locus.id)}
                  disabled={!chosenTargets.includes(locus.id) && chosenTargets.length >= 6}
                  onChange={(event) =>
                    setTargets((current) => {
                      const base = current ?? defaultTargets;
                      return event.target.checked
                        ? [...base, locus.id]
                        : base.filter((id) => id !== locus.id);
                    })
                  }
                />
                {locus.name}
              </label>
            ))}
          </div>
        </fieldset>

        {!prediction ? (
          <p className="note">Choose at least one locus.</p>
        ) : (
          <>
            <div className="risk">
              <span>Chance the egg fails to a doubled lethal at these loci</span>
              <strong>{formatRange(prediction.lethalRisk)}</strong>
            </div>

            {prediction.loci.map((entry) => (
              <div key={entry.locus} className="prediction">
                <h3>
                  {entry.name}
                  {entry.certain ? (
                    <span className="tag certain">exact</span>
                  ) : (
                    <span className="tag uncertain">range</span>
                  )}
                </h3>
                <ul className="outcomes">
                  {entry.phenotypes.map((row) => (
                    <li key={row.label}>
                      <span className="outcome-label">{row.label}</span>
                      <span className="outcome-bar">
                        <i style={{ left: `${row.min * 100}%`, width: `${Math.max(1, (row.max - row.min) * 100)}%` }} />
                        <b style={{ left: `${row.p * 100}%` }} />
                      </span>
                      <span className="outcome-value">{formatRange(row)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {prediction.caveats.length > 0 ? (
              <ul className="caveats">
                {prediction.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ParentChooser({
  label,
  options,
  value,
  onChange,
  mode,
  ranch,
}: {
  label: string;
  options: readonly Creature[];
  value: string;
  onChange: (id: string) => void;
  mode: PaletteMode;
  ranch: RanchController;
}) {
  const creature = options.find((c) => c.id === value);
  return (
    <div className="parent">
      <label>
        <span>{label}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} — {option.revealed.length}/{mapOf(option).loci.length} read
            </option>
          ))}
        </select>
      </label>
      {creature ? <CreatureFigure creature={creature} mode={mode} width={220} /> : null}
      {creature ? (
        <p className="hint">
          {creature.revealed.length === 0
            ? "Nothing read. Every prediction below will be a wide range."
            : `${creature.revealed.length} loci read${creature.phaseKnown ? ", phase known" : ", phase unknown"}.`}
        </p>
      ) : null}
      <span className="sr-only">{ranch.state.day}</span>
    </div>
  );
}

function formatRange(row: { p: number; min: number; max: number }): string {
  const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
  return row.max - row.min < 1e-9 ? pct(row.p) : `${pct(row.min)} – ${pct(row.max)}`;
}

function severityCopy(severity: string): string {
  switch (severity) {
    case "clear":
      return "These two are unrelated enough that nothing is at risk.";
    case "watch":
      return "Related. Viable for a few more generations, and worth writing down.";
    case "strained":
      return "The line is closing in on itself. Fertility and vigour are both paying for it.";
    case "failing":
      return "This herd is failing. It needs outside blood, not another pairing.";
    default:
      return "Collapsing. Most eggs will not hatch, and the ones that do will be diminished.";
  }
}
