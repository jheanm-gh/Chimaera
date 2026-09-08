import { activeCreatures, currentStats, isFertile, phenotypeOf } from "@chimaera/game";
import type { Creature, GameEvent } from "@chimaera/game";
import type { PaletteMode } from "@chimaera/rendering";
import { useEffect, useState } from "react";
import { CreatureFigure } from "./components/CreatureFigure.js";
import { CreaturePanel } from "./components/CreaturePanel.js";
import { PairingView } from "./components/PairingView.js";
import { PedigreeView } from "./components/PedigreeView.js";
import { VirtualGrid } from "./components/VirtualGrid.js";
import { exportToFile, importFromFile } from "./db.js";
import { map, useRanch } from "./useRanch.js";

type Tab = "ranch" | "pairing" | "pedigree" | "archive" | "journal";

const TABS: { id: Tab; label: string }[] = [
  { id: "ranch", label: "Ranch" },
  { id: "pairing", label: "Pairing" },
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
  const [tab, setTab] = useState<Tab>("ranch");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<PaletteMode>("full");
  const [textScale, setTextScale] = useState(1);

  const creatures = activeCreatures(ranch.state);
  const selected = creatures.find((c) => c.id === selectedId) ?? creatures[0];

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(textScale));
  }, [textScale]);

  useEffect(() => {
    if (!ranch.lastBlocked) return;
    const timer = window.setTimeout(() => ranch.clearBlocked(), 5000);
    return () => window.clearTimeout(timer);
  }, [ranch]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Verdance</span>
          <span className="brand-sub">Mirefen Ranch · seed {ranch.state.seed}</span>
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
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
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

      {ranch.lastBlocked ? (
        <p className="blocked" role="status">
          {ranch.lastBlocked}
        </p>
      ) : null}

      <main className={`layout layout-${tab}`}>
        {tab === "ranch" ? (
          <>
            <section className="herd">
              <VirtualGrid
                items={creatures}
                rowHeight={252}
                minColumnWidth={228}
                gap={14}
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
                    onSelect={() => setSelectedId(creature.id)}
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
  onSelect,
}: {
  creature: Creature;
  mode: PaletteMode;
  selected: boolean;
  onSelect: () => void;
}) {
  const phenotype = phenotypeOf(creature, map);
  const stats = currentStats(creature, phenotype, map);
  return (
    <button type="button" className={`creature-card${selected ? " selected" : ""}`} onClick={onSelect}>
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
    case "blocked":
      return event.reason;
    case "dayPassed":
      return `Day ${event.day}.`;
  }
}
