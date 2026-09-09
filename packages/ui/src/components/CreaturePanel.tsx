import {
  achievement,
  currentStats,
  DIETS,
  evolutionContext,
  HABITATS,
  ITEMS,
  itemById,
  mapOf,
  phenotypeOf,
  previewBranches,
  TRAINING,
  branchesForSpecies,
  EQUIPMENT,
  equipmentById,
  ROLES,
  STANCES,
} from "@chimaera/game";
import type { Creature, DietId, HabitatId, Role, Stance, TrainingId } from "@chimaera/game";
import { certificateFilename, lineageData } from "@chimaera/game";
import { lineageCertificate, renderCreature } from "@chimaera/rendering";
import { genotypeAt } from "@chimaera/genetics";
import type { PaletteMode } from "@chimaera/rendering";
import { useState } from "react";
import { saveFile } from "../download.js";
import type { RanchController } from "../useRanch.js";

import { CreatureFigure } from "./CreatureFigure.js";
import { MovePanel } from "./MovePanel.js";

/**
 * Writes the certificate out as a file.
 *
 * One self-contained SVG: no fonts to fetch, no images to resolve, no script. A
 * certificate has to survive being emailed, printed and opened in five years,
 * and every external reference is one more way for it to arrive blank.
 */
function downloadCertificate(ranch: RanchController, creature: Creature): void {
  const data = lineageData(ranch.state, creature.id, phenotypeOf);
  if (!data) return;
  const svg = lineageCertificate({
    ...data,
    drawing: renderCreature(phenotypeOf(creature), mapOf(creature)),
  });
  saveFile(certificateFilename(data), new Blob([svg], { type: "image/svg+xml" }));
}
import { StatBar } from "./StatBar.js";

interface Props {
  readonly creature: Creature;
  readonly ranch: RanchController;
  readonly mode: PaletteMode;
  readonly onSelectRelative?: (id: string) => void;
}

export function CreaturePanel({ creature, ranch, mode, onSelectRelative }: Props) {
  const [suppressing, setSuppressing] = useState<string[]>([]);
  const [lensLocus, setLensLocus] = useState<string>("DORSAL");
  // Per creature, not per ranch: a station can hold mixed stock, and reading a
  // Silt-Adder's genome through a Quillfen's loci would be nonsense drawn
  // confidently.
  const map = mapOf(creature);
  const phenotype = phenotypeOf(creature);
  const stats = currentStats(creature, phenotype, map);
  const reached = achievement(creature, phenotype, map);
  const context = evolutionContext(creature, phenotype, map);
  const previews = previewBranches(context, creature.species);
  const branch = creature.branch
    ? branchesForSpecies(creature.species).find((b) => b.id === creature.branch)
    : undefined;
  const revealed = new Set(creature.revealed);
  const heldItems = ITEMS.filter(
    (item) => item.effect.kind === "held" && (ranch.state.inventory.items[item.id] ?? 0) > 0,
  );
  const usableItems = ITEMS.filter(
    (item) =>
      (ranch.state.inventory.items[item.id] ?? 0) > 0 &&
      ["reveal", "bond", "lifespan", "suppressDominance"].includes(item.effect.kind),
  );

  const daysLeft = Math.max(0, Math.round(creature.lifespanDays - creature.ageDays));

  return (
    <div className="panel creature-panel">
      <header className="panel-head">
        <div>
          <input
            className="name-input"
            value={creature.name}
            aria-label="Name"
            onChange={(event) => ranch.dispatch({ kind: "rename", id: creature.id, name: event.target.value })}
          />
          <p className="meta">
            {creature.sex === "female" ? "♀" : "♂"} · {creature.stage} · day {Math.round(creature.ageDays)} of{" "}
            {Math.round(creature.lifespanDays)} · generation {creature.generation}
            {creature.origin === "wild" ? " · wild-caught" : ""}
          </p>
        </div>
        <span className={`life-chip life-${creature.stage}`}>{daysLeft}d left</span>
      </header>

      <CreatureFigure creature={creature} mode={mode} width={280} suppressDominanceAt={suppressing} />
      <MovePanel creature={creature} />

      {creature.stage === "egg" ? (
        <p className="note">
          Still in the egg. It will hatch on day {Math.round(creature.acquiredOnDay + 6)}, or it will not.
        </p>
      ) : null}

      <section>
        <h3>What it can become</h3>
        <div className="stats">
          {map.polygenicTraits.map((trait) => (
            <StatBar
              key={trait.id}
              label={trait.name}
              value={stats[trait.id] ?? 0}
              ceiling={phenotype.stats[trait.id] ?? 0}
              min={trait.min}
              max={trait.max}
              fraction={reached[trait.id] ?? 0}
            />
          ))}
        </div>
        <p className="hint">
          The pale bar is the ceiling its genes allow. The solid bar is how close raising has got it.
        </p>
      </section>

      <section>
        <h3>Raising</h3>
        <div className="axes">
          <label>
            <span>Diet</span>
            <select
              value={creature.diet}
              onChange={(e) => ranch.dispatch({ kind: "setDiet", id: creature.id, diet: e.target.value as DietId })}
            >
              {DIETS.map((diet) => (
                <option key={diet.id} value={diet.id}>
                  {diet.name}
                </option>
              ))}
            </select>
            <em>{DIETS.find((d) => d.id === creature.diet)?.blurb}</em>
          </label>
          <label>
            <span>Habitat</span>
            <select
              value={creature.habitat}
              onChange={(e) =>
                ranch.dispatch({ kind: "setHabitat", id: creature.id, habitat: e.target.value as HabitatId })
              }
            >
              {HABITATS.map((habitat) => (
                <option key={habitat.id} value={habitat.id}>
                  {habitat.name}
                </option>
              ))}
            </select>
            <em>{HABITATS.find((h) => h.id === creature.habitat)?.blurb}</em>
          </label>
          <label>
            <span>Training</span>
            <select
              value={creature.training}
              onChange={(e) =>
                ranch.dispatch({ kind: "setTraining", id: creature.id, training: e.target.value as TrainingId })
              }
            >
              {TRAINING.map((training) => (
                <option key={training.id} value={training.id}>
                  {training.name}
                </option>
              ))}
            </select>
            <em>{TRAINING.find((t) => t.id === creature.training)?.blurb}</em>
          </label>
          <label>
            <span>Held item</span>
            <select
              value={creature.heldItem ?? ""}
              onChange={(e) =>
                ranch.dispatch({
                  kind: "holdItem",
                  id: creature.id,
                  item: e.target.value === "" ? undefined : e.target.value,
                })
              }
            >
              <option value="">Nothing</option>
              {heldItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              {creature.heldItem && !heldItems.some((i) => i.id === creature.heldItem) ? (
                <option value={creature.heldItem}>{itemById(creature.heldItem).name}</option>
              ) : null}
            </select>
          </label>
        </div>
        <div className="bond-row">
          <StatBar label="Bond" value={creature.bond} ceiling={100} min={0} max={100} fraction={creature.bond / 100} />
          <button type="button" onClick={() => ranch.dispatch({ kind: "tend", id: creature.id })}>
            Spend a day with it
          </button>
        </div>
      </section>

      <section>
        <h3>In the field</h3>
        <div className="axes">
          <label>
            <span>Role</span>
            <select
              value={creature.role}
              onChange={(e) => ranch.dispatch({ kind: "setRole", id: creature.id, role: e.target.value as Role })}
            >
              {ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <em>{ROLES.find((r) => r.id === creature.role)?.blurb}</em>
          </label>
          <label>
            <span>Stance</span>
            <select
              value={creature.stance}
              onChange={(e) => ranch.dispatch({ kind: "setStance", id: creature.id, stance: e.target.value as Stance })}
            >
              {STANCES.map((stance) => (
                <option key={stance.id} value={stance.id}>
                  {stance.name}
                </option>
              ))}
            </select>
            <em>{STANCES.find((s) => s.id === creature.stance)?.blurb}</em>
          </label>
          {(["harness", "charm"] as const).map((slot) => {
            const worn = creature.equipment.find((id) => equipmentById(id)?.slot === slot);
            const owned = EQUIPMENT.filter(
              (item) => item.slot === slot && (ranch.state.inventory.items[item.id] ?? 0) > 0,
            );
            return (
              <label key={slot}>
                <span>{slot}</span>
                <select
                  value={worn ?? ""}
                  onChange={(e) => {
                    const rest = creature.equipment.filter((id) => equipmentById(id)?.slot !== slot);
                    ranch.dispatch({
                      kind: "setEquipment",
                      id: creature.id,
                      equipment: e.target.value === "" ? rest : [...rest, e.target.value],
                    });
                  }}
                >
                  <option value="">Nothing</option>
                  {owned.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  {worn && !owned.some((i) => i.id === worn) ? (
                    <option value={worn}>{equipmentById(worn)?.name}</option>
                  ) : null}
                </select>
              </label>
            );
          })}
        </div>
        <p className="hint">
          Equipment is capped at a fifth of effective power, always. It cannot make a worse animal into a better one.
        </p>
      </section>

      <section>
        <h3>Adult form</h3>
        {branch ? (
          <div className="branch-taken">
            <strong>{branch.name}</strong>
            <p>{branch.blurb}</p>
          </div>
        ) : (
          <>
            <ul className="branch-list">
              {previews.map((preview) => (
                <li key={preview.id} className={preview.reachable ? "reachable" : ""}>
                  <span className="branch-name">
                    {preview.name}
                    {preview.secret ? " ✦" : ""}
                  </span>
                  <span className="branch-count">
                    {preview.met}/{preview.total || 1}
                  </span>
                  <em>{preview.hint}</em>
                </li>
              ))}
            </ul>
            <p className="hint">
              Which conditions remain is not shown, and will not be. Work it out, or find someone who has.
            </p>
          </>
        )}
      </section>

      <section>
        <h3>What you know</h3>
        <table className="genotype">
          <tbody>
            {map.loci.map((locus) => {
              const known = revealed.has(locus.id);
              const genotype = known ? genotypeAt(creature.genome, locus).join(" / ") : "—";
              const observed =
                locus.mode.kind === "polygenic"
                  ? "contributes to " + (locus.stat ?? "")
                  : (phenotype.traits[locus.trait ?? ""] ?? "—");
              return (
                <tr key={locus.id} className={known ? "known" : "unknown"}>
                  <th scope="row">{locus.name}</th>
                  <td className="observed">{observed}</td>
                  <td className="genotype-cell">{genotype}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="hint">
          {revealed.size === 0
            ? "Nothing has been read yet. Everything in the right column is a deduction waiting to be made — or a lens waiting to be spent."
            : `${revealed.size} of ${map.loci.length} loci read${creature.phaseKnown ? ", phase included" : ""}.`}
        </p>
      </section>

      <section>
        <h3>Tools</h3>
        <div className="tools">
          <label className="lens-pick">
            <span>Read locus</span>
            <select value={lensLocus} onChange={(e) => setLensLocus(e.target.value)}>
              {map.loci.map((locus) => (
                <option key={locus.id} value={locus.id}>
                  {locus.name}
                </option>
              ))}
            </select>
          </label>
          {usableItems.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.blurb}
              onClick={() => {
                if (item.effect.kind === "suppressDominance") {
                  setSuppressing(map.loci.filter((l) => l.mode.kind !== "polygenic").map((l) => l.id));
                }
                ranch.dispatch({
                  kind: "useItem",
                  id: creature.id,
                  item: item.id,
                  ...(item.effect.kind === "reveal" && item.effect.tier === "one" ? { locus: lensLocus } : {}),
                });
              }}
            >
              {item.name} ×{ranch.state.inventory.items[item.id] ?? 0}
            </button>
          ))}
          {suppressing.length > 0 ? (
            <button type="button" className="ghost" onClick={() => setSuppressing([])}>
              Stop suppressing
            </button>
          ) : null}
        </div>
      </section>

      <footer className="panel-foot">
        {creature.sireId || creature.damId ? (
          <p className="parents">
            Out of{" "}
            <button type="button" className="link" onClick={() => creature.damId && onSelectRelative?.(creature.damId)}>
              {nameOf(ranch, creature.damId)}
            </button>{" "}
            by{" "}
            <button type="button" className="link" onClick={() => creature.sireId && onSelectRelative?.(creature.sireId)}>
              {nameOf(ranch, creature.sireId)}
            </button>
            {creature.inbreeding > 0 ? ` · F = ${creature.inbreeding.toFixed(3)}` : ""}
          </p>
        ) : (
          <p className="parents">No recorded parents.</p>
        )}
        <div className="row">
          <button type="button" onClick={() => downloadCertificate(ranch, creature)}>
            Lineage certificate
          </button>
        </div>
        <div className="row">
          <button type="button" onClick={() => ranch.dispatch({ kind: "archive", id: creature.id })}>
            Retire to the Archive
          </button>
          <button type="button" className="danger" onClick={() => ranch.dispatch({ kind: "release", id: creature.id })}>
            Release
          </button>
        </div>
      </footer>
    </div>
  );
}

function nameOf(ranch: RanchController, id: string | undefined): string {
  if (!id) return "unknown";
  return ranch.state.pedigree.find((record) => record.id === id)?.name ?? "unknown";
}
