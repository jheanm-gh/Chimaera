/**
 * Starting a new station.
 *
 * The species choice is the first real decision in the game, so it is presented
 * as one: each species leads with the genetic problem it poses rather than with
 * its stat line, because the stat line is not what you will be thinking about
 * in four hours.
 *
 * All six are offered. Gating four of them behind progress would mean shipping
 * content nobody sees, and the difficulty here is a difficulty of *puzzle*, not
 * of numbers — a player who wants to start on the Ashen Lorric's cascade should
 * be allowed to find out what that costs them.
 */

import { POSTINGS } from "@chimaera/game";
import { SPECIES, STARTER_TRIO } from "@chimaera/genetics";
import type { SpeciesId } from "@chimaera/genetics";
import { useState } from "react";
import type { RanchController } from "../useRanch.js";

/** One line on what makes each species a different puzzle. */
const PROBLEM: Readonly<Record<string, string>> = {
  quillfen: "A lethal allele sits three centimorgans from the best speed gene in the fen. You cannot have one without a crossover.",
  sallowfinch: "Almost everything worth having is on the X. Cocks show you their whole hand; hens carry theirs invisibly.",
  bramblehog: "The spines blend, so you can dial them — and a switch on another chromosome can hide the whole result.",
  kiteossel: "A recessive turns the wing off entirely, and the pattern lives in the same place. You lose the trait and the evidence together.",
  siltadder: "Two lethals eleven centimorgans apart, carried on opposite haplotypes. A healthy-looking wild adder is very often a double carrier.",
  ashenlorric: "A two-stage pigment cascade. The test cross that solved everything else gives a contradictory answer here.",
};

export function NewStation({ ranch, onDone }: { ranch: RanchController; onDone: () => void }) {
  const [species, setSpecies] = useState<SpeciesId>(ranch.state.homeSpecies);
  const [seed, setSeed] = useState("");

  return (
    <div className="panel new-station">
      <h2>A new posting</h2>
      <p className="hint">
        Starting again abandons the current station and everything in it. There is no way back to it afterwards —
        export first if you want one.
      </p>

      <fieldset className="species-picker">
        <legend>Species</legend>
        <div className="species-grid">
          {SPECIES.map((entry) => {
            const posting = POSTINGS.find((p) => p.species === entry.id);
            const starter = STARTER_TRIO.includes(entry.id);
            return (
              <label
                key={entry.id}
                className={`species-option${species === entry.id ? " selected" : ""}`}
              >
                <input
                  type="radio"
                  name="species"
                  value={entry.id}
                  checked={species === entry.id}
                  onChange={() => setSpecies(entry.id)}
                />
                <span className="species-head">
                  <strong>{entry.name}</strong>
                  <span className="mono">
                    {posting?.biome}
                    {starter ? " · starter" : ""}
                  </span>
                </span>
                <span className="species-hook">{entry.hook}</span>
                <span className="species-problem">{PROBLEM[entry.id] ?? entry.inspiration}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="setting seed">
        <span>Seed</span>
        <input
          type="text"
          value={seed}
          placeholder="leave blank for a fresh one"
          onChange={(event) => setSeed(event.target.value)}
        />
      </label>

      <div className="new-station-actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            ranch.reset(seed.trim() || randomSeed(), species);
            onDone();
          }}
        >
          Take the posting
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** A seed a player can read back, retype and share — not a timestamp. */
function randomSeed(): string {
  const words = ["reed", "silt", "quill", "lantern", "prism", "fen", "slate", "bloom", "chalk", "gale"];
  const pick = (): string => words[Math.floor(Math.random() * words.length)] as string;
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 900 + 100)}`;
}
