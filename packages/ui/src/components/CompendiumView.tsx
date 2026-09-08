/**
 * The Compendium (§8.3).
 *
 * Every entry keeps its slot and loses its content until it is found: you can
 * see that there is a fourth allele at this locus, and nothing else. The gap is
 * the thing being chased, and an encyclopaedia that listed the whole gene map
 * on day one would hand the player the answer to every puzzle in it.
 *
 * Naming lives here too (§8.2), because the moment a player wants to name an
 * allele is the moment they are looking at the book it will appear in.
 */

import { canName, checkName, NAME_MAX, speciesEntries, summarise } from "@chimaera/game";
import { useState } from "react";
import type { RanchController } from "../useRanch.js";

export function CompendiumView({ ranch }: { ranch: RanchController }) {
  const compendium = ranch.home.compendium;
  const summary = summarise(compendium);
  const entries = speciesEntries(compendium);
  const [naming, setNaming] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const problem = naming ? (checkName(draft).ok ? undefined : (checkName(draft) as { reason: string }).reason) : undefined;

  return (
    <div className="panel compendium">
      <h2>The Compendium</h2>
      <p className="hint">
        What you have seen, not what exists. Completion counts the whole fen, so it starts near nothing and
        is honest about how much of it you have not met.
      </p>

      <div className="completion">
        <div className="completion-bar">
          <i style={{ width: `${summary.completion * 100}%` }} />
        </div>
        <span className="mono">{(summary.completion * 100).toFixed(1)}% recorded</span>
        <ul className="mono">
          <li>
            species {summary.species.seen}/{summary.species.total}
          </li>
          <li>
            novel alleles {summary.alleles.seen}/{summary.alleles.total}
          </li>
          <li>
            forms {summary.branches.seen}/{summary.branches.total}
          </li>
          <li>
            gates {summary.epistasis.seen}/{summary.epistasis.total}
          </li>
        </ul>
      </div>

      {entries.map((entry) => (
        <section key={entry.id} className={`compendium-species${entry.seen ? "" : " unseen"}`}>
          <h3>
            {entry.name}
            <span className="mono">{entry.biome}</span>
          </h3>
          <p className="hook">{entry.hook}</p>

          <div className="compendium-grid">
            <div>
              <h4>Alleles found in no wild population</h4>
              <ul>
                {entry.alleles.map((allele) => (
                  <li key={allele.id} className={allele.seen ? "found" : ""}>
                    <span className="mono locus">{allele.locusName}</span>
                    <span>{allele.name}</span>
                    {allele.namedBy ? <em>named on day {allele.discoveredOnDay}</em> : null}
                    {allele.seen && canName(ranch.home, allele.key) ? (
                      naming === allele.key ? (
                        <span className="naming">
                          <input
                            type="text"
                            value={draft}
                            maxLength={NAME_MAX}
                            aria-label={`Name for ${allele.locusName}`}
                            onChange={(event) => setDraft(event.target.value)}
                          />
                          <button
                            type="button"
                            disabled={problem !== undefined}
                            onClick={() => {
                              ranch.dispatch({ kind: "nameAllele", allele: allele.key, name: draft });
                              setNaming(undefined);
                              setDraft("");
                            }}
                          >
                            Name it
                          </button>
                          <button type="button" onClick={() => setNaming(undefined)}>
                            Cancel
                          </button>
                          {problem ? <em className="problem">{problem}</em> : null}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="link"
                          onClick={() => {
                            setNaming(allele.key);
                            setDraft("");
                          }}
                        >
                          You found it. Name it.
                        </button>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4>Adult forms</h4>
              <ul>
                {entry.branches.map((branch) => (
                  <li key={branch.id} className={branch.seen ? "found" : ""}>
                    <span>{branch.name}</span>
                    {branch.secret && !branch.seen ? <em>rumoured</em> : null}
                    {branch.seen ? <em>{branch.blurb}</em> : null}
                  </li>
                ))}
              </ul>

              <h4>Gates</h4>
              <ul>
                {entry.gates.map((gate) => (
                  <li key={gate.id} className={gate.seen ? "found" : ""}>
                    <span>{gate.name}</span>
                    {gate.seen ? <em>masks {gate.masks.join(", ")}</em> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
