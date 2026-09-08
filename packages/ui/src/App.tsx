import { activeCreatures, CHAPTER_COUNT, currentStats, isFertile, mapOf, phenotypeOf } from "@chimaera/game";
import type { Creature, GameEvent } from "@chimaera/game";
import { voiceFor } from "@chimaera/audio";
import type { PaletteMode } from "@chimaera/rendering";
import { useEffect, useState } from "react";
import { CommissionView } from "./components/CommissionView.js";
import { CreatureFigure } from "./components/CreatureFigure.js";
import { useAudio } from "./audio/useAudio.js";
import { AudioPanel } from "./components/AudioPanel.js";
import { CompendiumView } from "./components/CompendiumView.js";
import { ModesView } from "./components/ModesView.js";
import { NewStation } from "./components/NewStation.js";
import { CreaturePanel } from "./components/CreaturePanel.js";
import { FieldView } from "./components/FieldView.js";
import { PairingView } from "./components/PairingView.js";
import { PedigreeView } from "./components/PedigreeView.js";
import { VirtualGrid } from "./components/VirtualGrid.js";
import { exportToFile, importFromFile } from "./db.js";
import { useRanch } from "./useRanch.js";

type Tab =
  | "ranch"
  | "pairing"
  | "field"
  | "commission"
  | "modes"
  | "compendium"
  | "pedigree"
  | "archive"
  | "journal";

const TABS: { id: Tab; label: string }[] = [
  { id: "ranch", label: "Ranch" },
  { id: "pairing", label: "Pairing" },
  { id: "field", label: "Field" },
  { id: "commission", label: "Commission" },
  { id: "modes", label: "Modes" },
  { id: "compendium", label: "Compendium" },
  { id: "pedigree", label: "Pedigree" },
  { id: "archive", label: "Archive" },
  { id: "journal", label: "Journal" },
];

const MODES: { id: PaletteMode; label: string }[] = [
  { id: "full", label: "Full colour" },
  { id: "deuteranopia", label: "Deuteranopia" },
  { id: "protanopia", label: "Protanopia" },
  { id: "tritanopia", label: "Tritanopia" },
  { id: "monochrome", label: "Monochrome" },
];

export function App() {
  const ranch = useRanch();
  const audio = useAudio(ranch.state, ranch.journal);
  const [tab, setTab] = useState<Tab>("ranch");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<PaletteMode>("full");
  const [textScale, setTextScale] = useState(1);
  const [newStation, setNewStation] = useState(false);

  const creatures = activeCreatures(ranch.state);
  const selected = creatures.find((c) => c.id === selectedId) ?? creatures[0];

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(textScale));
  }, [textScale]);

  useEffect(() => {
    if (!newStation) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setNewStation(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newStation]);

  useEffect(() => {
    if (!ranch.lastBlocked) return;
    const timer = window.setTimeout(() => ranch.clearBlocked(), 5000);
    return () => window.clearTimeout(timer);
  }, [ranch]);

  return (
    <div className="app">
      {/* Nineteen tab stops between the top of the page and the herd is a wall
          rather than a toolbar. These are the way past it. */}
      <a className="skip" href="#herd">
        Skip to the herd
      </a>
      <a className="skip" href="#sections">
        Skip to the sections
      </a>
      <header className="topbar">
        <div className="brand">
          <h1 className="brand-mark">Verdance</h1>
          <span className="brand-sub">
            {ranch.map.species.biome} Station · {ranch.map.species.name} · seed {ranch.state.seed}
          </span>
        </div>
        <dl className="counters">
          <div>
            <dt>Day</dt>
            <dd>{ranch.state.day}</dd>
          </div>
          <div>
            <dt>Herd</dt>
            <dd>
              {creatures.length}/{ranch.state.capacity}
            </dd>
          </div>
          <div>
            <dt>Fertile</dt>
            <dd>{creatures.filter(isFertile).length}</dd>
          </div>
          <div>
            <dt>Motes</dt>
            <dd>{ranch.state.inventory.motes}</dd>
          </div>
          <div>
            <dt>Chapter</dt>
            <dd>
              {Math.min(ranch.state.campaign.chapter, CHAPTER_COUNT)}/{CHAPTER_COUNT}
            </dd>
          </div>
        </dl>
        <div className="topbar-actions">
          <button type="button" onClick={() => ranch.dispatch({ kind: "advanceDays", days: 1 })}>
            +1 day
          </button>
          <button type="button" onClick={() => ranch.dispatch({ kind: "advanceDays", days: 7 })}>
            +7
          </button>
          <button type="button" onClick={() => ranch.dispatch({ kind: "catchWild" })}>
            Catch wild stock (3d)
          </button>
          <button type="button" onClick={() => setNewStation((open) => !open)}>
            New station
          </button>
        </div>
      </header>

      <nav className="tabs" id="sections" aria-label="Sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={tab === entry.id ? "active" : ""}
            aria-current={tab === entry.id ? "page" : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        <div className="spacer" />
        <label className="setting">
          <span>Vision</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as PaletteMode)}>
            {MODES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="setting">
          <span>Text</span>
          <select value={textScale} onChange={(event) => setTextScale(Number(event.target.value))}>
            <option value={0.9}>Small</option>
            <option value={1}>Normal</option>
            <option value={1.15}>Large</option>
            <option value={1.35}>Larger</option>
          </select>
        </label>
        <AudioPanel audio={audio} />
        <button type="button" onClick={() => exportToFile(ranch.state)}>
          Export
        </button>
        <label className="setting file">
          <span>Import</span>
          <input
            type="file"
            accept="application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                ranch.replace(await importFromFile(file));
              } catch (error) {
                window.alert(error instanceof Error ? error.message : "That file could not be read.");
              }
              event.target.value = "";
            }}
          />
        </label>
      </nav>

      {ranch.side ? (
        <p className="side-banner" role="status">
          <strong>
            {ranch.side.trial?.kind === "daily" ? "Daily Genome" : "Breeding Trial"} in progress
          </strong>
          <span>
            Every screen is working on the trial, not on your station. Generation limit{" "}
            {ranch.side.trial?.generations}.
          </span>
          <button type="button" onClick={() => setTab("modes")}>
            Back to the trial sheet
          </button>
        </p>
      ) : null}

      {ranch.lastBlocked ? (
        <p className="blocked" role="status">
          {ranch.lastBlocked}
        </p>
      ) : null}

      {newStation ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Start a new station">
          <NewStation ranch={ranch} onDone={() => setNewStation(false)} />
        </div>
      ) : null}

      <main className={`layout layout-${tab}`} id="main" tabIndex={-1}>
        {tab === "ranch" ? (
          <>
            <section className="herd" id="herd" aria-label="The herd">
              <VirtualGrid
                items={creatures}
                rowHeight={252}
                minColumnWidth={228}
                gap={14}
                label={`The herd, ${creatures.length} creatures. Arrow keys to move.`}
                activeKey={selected?.id}
                onActivate={(creature) => setSelectedId(creature.id)}
                keyOf={(creature) => creature.id}
                empty={
                  <p className="note">
                    The ranch is empty. Catch wild stock, or start a new line from the Mirefen.
                  </p>
                }
                render={(creature) => (
                  <CreatureCard
                    creature={creature}
                    mode={mode}
                    selected={creature.id === selected?.id}
                    // Roving tabindex: one stop for the whole grid, and the
                    // arrow keys do the rest.
                    tabbable={creature.id === selected?.id || (selected === undefined && creature === creatures[0])}
                    onSelect={() => {
                      setSelectedId(creature.id);
                      // Selecting an animal is how you hear it. Every creature
                      // you breed sounds like itself (§7).
                      audio.play(voiceFor(phenotypeOf(creature), mapOf(creature)));
                    }}
                  />
                )}
              />
            </section>
            <aside className="detail">
              {selected ? (
                <CreaturePanel creature={selected} ranch={ranch} mode={mode} onSelectRelative={setSelectedId} />
              ) : null}
            </aside>
          </>
        ) : null}

        {tab === "pairing" ? <PairingView ranch={ranch} mode={mode} /> : null}

        {tab === "field" ? <FieldView ranch={ranch} /> : null}

        {tab === "commission" ? <CommissionView ranch={ranch} /> : null}

        {tab === "modes" ? <ModesView ranch={ranch} /> : null}

        {tab === "compendium" ? <CompendiumView ranch={ranch} /> : null}

        {tab === "pedigree" ? (
          <PedigreeView state={ranch.state} rootId={selected?.id} onSelect={setSelectedId} />
        ) : null}

        {tab === "archive" ? (
          <div className="panel">
            <h2>The Archive</h2>
            <p className="hint">
              Retired rather than lost. These creatures no longer breed or age, and their genomes are kept forever.
            </p>
            <div className="archive-grid">
              {ranch.state.archive.length === 0 ? (
                <p className="note">Nothing retired yet.</p>
              ) : (
                ranch.state.archive.map((creature) => (
                  <figure key={creature.id} className="archive-card">
                    <CreatureFigure creature={creature} mode={mode} width={200} />
                    <figcaption>
                      <strong>{creature.name}</strong>
                      <span className="mono">
                        gen {creature.generation} · lived {Math.round(creature.ageDays)} days
                      </span>
                    </figcaption>
                  </figure>
                ))
              )}
            </div>
          </div>
        ) : null}

        {tab === "journal" ? (
          <div className="panel">
            <h2>Journal</h2>
            {ranch.journal.length === 0 ? (
              <p className="note">Nothing has happened yet.</p>
            ) : (
              <ol className="journal">
                {ranch.journal.map((entry) => (
                  <li key={entry.key} className={`journal-${entry.event.kind}`}>
                    <span className="mono day">day {entry.day}</span>
                    <span>{describe(entry.event)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function CreatureCard({
  creature,
  mode,
  selected,
  tabbable,
  onSelect,
}: {
  creature: Creature;
  mode: PaletteMode;
  selected: boolean;
  tabbable: boolean;
  onSelect: () => void;
}) {
  const map = mapOf(creature);
  const phenotype = phenotypeOf(creature);
  const stats = currentStats(creature, phenotype, map);
  return (
    <button
      type="button"
      className={`creature-card${selected ? " selected" : ""}`}
      tabIndex={tabbable ? 0 : -1}
      aria-current={selected ? "true" : undefined}
      ref={(node) => {
        // Follow the roving focus, but only when focus is already inside the
        // grid — stealing it on every selection would fight the mouse.
        if (!node || !selected) return;
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.classList.contains("creature-card") && active !== node) {
          node.focus({ preventScroll: true });
        }
      }}
      onClick={onSelect}
    >
      <span className="card-head">
        <span className="card-name">{creature.name}</span>
        <span className="card-sex">{creature.sex === "female" ? "♀" : "♂"}</span>
      </span>
      <CreatureFigure creature={creature} mode={mode} width={210} detail="thumb" />
      <span className="card-foot mono">
        {creature.stage}
        {creature.branch ? ` · ${creature.branch.replace(/-/g, " ")}` : ""}
        {" · "}
        {map.polygenicTraits.map((trait) => (stats[trait.id] ?? 0).toFixed(0)).join("/")}
      </span>
    </button>
  );
}

function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${["th", "st", "nd", "rd"][place % 10] ?? "th"}`;
}

function describe(event: GameEvent): string {
  switch (event.kind) {
    case "hatched":
      return `${event.name} hatched.`;
    case "eggFailed":
      return `An egg failed to hatch. ${event.reason}`;
    case "noEgg":
      return "The pairing produced no egg.";
    case "stageChanged":
      return `A creature became a ${event.stage}.`;
    case "evolved":
      return `It grew into a ${event.branchName}.`;
    case "died":
      return `${event.name} died at ${event.ageDays} days.`;
    case "archived":
      return `${event.name} was retired to the Archive.`;
    case "released":
      return `${event.name} was released back to the fen.`;
    case "mutation":
      return event.novel
        ? `A novel allele appeared: ${event.allele} at ${event.locus}.`
        : `A point mutation at ${event.locus}: ${event.allele}.`;
    case "discovery":
      return `${event.what}. ${event.detail}`;
    case "revealed":
      return `Read ${event.loci.length} loci.`;
    case "caught":
      return `${event.name} was caught in the Mirefen.`;
    case "battle":
      return event.summary;
    case "expeditionEntered":
      return `Put in at ${event.region}.`;
    case "expeditionNode":
      return `${event.node}. ${event.detail}`;
    case "expeditionEnded":
      return event.summary;
    case "lost":
      return `${event.name} was lost at ${event.where}. It is not coming back.`;
    case "blocked":
      return event.reason;
    case "objectiveMet":
      return `Commission met: ${event.label}`;
    case "chapterComplete":
      return `Chapter delivered: ${event.title}. The board pays ${event.motes} motes.`;
    case "dayPassed":
      return `Day ${event.day}.`;
    case "placed":
      return event.placement === 1
        ? `${event.name} won the ${event.standard} — ${event.purse} motes.`
        : `${event.name} placed ${ordinal(event.placement)} of ${event.field} under the ${event.standard}.`;
  }
}
