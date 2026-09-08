/**
 * The modes screen (§4).
 *
 * One tab hosting six panels, with the shut ones shown rather than hidden —
 * a mode a player cannot see is a mode they never work toward, and every gate
 * here is a sentence explaining what would open it.
 *
 * The Breeding Trials and the Daily Genome open a *side ranch*: a whole second
 * `RanchState` that the rest of the app operates on unchanged, so pairing, the
 * Punnett predictor and the pedigree all work inside a trial without any screen
 * knowing a trial exists.
 */

import {
  bestEntrant,
  clausesMet,
  completeTrial,
  createTrialRanch,
  dailyKey,
  dailyPuzzle,
  dailyScore,
  dailySpent,
  decodeOffer,
  encodeOffer,
  fightGhost,
  formatGenomeCode,
  ghostRng,
  houseGhost,
  isOpen,
  legacyCandidates,
  legacyTerms,
  MODES,
  publishStud,
  purityOf,
  recordDailyResult,
  recordTrialResult,
  runShow,
  SHOW_TIERS,
  showTier,
  snapshotTeam,
  standardForDay,
  daysLeftInSeason,
  startLegacy,
  TRIALS,
  trialById,
  mapOf,
  addPublishedStud,
  createRanch,
  phenotypeOf,
} from "@chimaera/game";
import type { Creature, Ghost, ModeId, StudOffer, Trial } from "@chimaera/game";
import { SPECIES } from "@chimaera/genetics";
import type { SpeciesId } from "@chimaera/genetics";
import { useEffect, useMemo, useState } from "react";
import type { RanchController } from "../useRanch.js";
import { CreatureFigure } from "./CreatureFigure.js";

export function ModesView({ ranch }: { ranch: RanchController }) {
  const sideMode: ModeId | undefined =
    ranch.side?.trial?.kind === "daily" ? "daily" : ranch.side?.trial ? "trials" : undefined;
  const [mode, setMode] = useState<ModeId>(sideMode ?? "exhibition");

  // Leaving this tab unmounts the panel, so coming back from a trial would
  // otherwise land on whatever the default is while the banner still says a
  // trial is running. A run in progress is where the player wants to be.
  useEffect(() => {
    if (sideMode) setMode(sideMode);
  }, [sideMode]);

  const open = isOpen(ranch.home, mode);

  return (
    <div className="modes">
      <nav className="mode-rail" aria-label="Modes">
        {MODES.filter((entry) => entry.id !== "campaign" && entry.id !== "sandbox").map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`${mode === entry.id ? "active" : ""}${isOpen(ranch.home, entry.id) ? "" : " shut"}`}
            onClick={() => setMode(entry.id)}
          >
            {entry.name}
            {isOpen(ranch.home, entry.id) ? "" : " · shut"}
          </button>
        ))}
      </nav>

      <div className="mode-body">
        {!open ? (
          <div className="panel">
            <h2>{MODES.find((entry) => entry.id === mode)?.name}</h2>
            <p className="hint">{MODES.find((entry) => entry.id === mode)?.blurb}</p>
            <p className="note">{MODES.find((entry) => entry.id === mode)?.requirement}</p>
          </div>
        ) : mode === "exhibition" ? (
          <ExhibitionPanel ranch={ranch} />
        ) : mode === "trials" ? (
          <TrialsPanel ranch={ranch} />
        ) : mode === "daily" ? (
          <DailyPanel ranch={ranch} />
        ) : mode === "rival" ? (
          <RivalPanel ranch={ranch} />
        ) : mode === "exchange" ? (
          <ExchangePanel ranch={ranch} />
        ) : mode === "legacy" ? (
          <LegacyPanel ranch={ranch} />
        ) : (
          <div className="panel">
            <h2>{MODES.find((entry) => entry.id === mode)?.name}</h2>
            <p className="hint">{MODES.find((entry) => entry.id === mode)?.blurb}</p>
            <p className="note">Open. You run this one from the Field.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exhibition
// ---------------------------------------------------------------------------

function ExhibitionPanel({ ranch }: { ranch: RanchController }) {
  const showable = ranch.home.creatures.filter(
    (c) => c.status === "active" && c.stage !== "egg" && c.stage !== "hatchling",
  );
  const [id, setId] = useState<string>(() => showable[0]?.id ?? "");
  const [tier, setTier] = useState(0);
  const chosen = showable.find((c) => c.id === id) ?? showable[0];
  const standard = standardForDay(ranch.home.day);
  const preview = chosen ? runShow(ranch.home, chosen.id, tier, phenotypeOf) : undefined;

  return (
    <div className="panel">
      <h2>Exhibition</h2>
      <p className="hint">
        Judged on the animal alone. No combat stat is read here, and no genotype — two animals that look
        the same score the same.
      </p>

      <div className="season">
        <strong>{standard.name}</strong>
        <p>{standard.blurb}</p>
        <ul className="mono">
          {standard.wants.map((clause) => (
            <li key={clause.label}>{clause.label}</li>
          ))}
        </ul>
        <p className="mono">
          Weights — standard {pct(standard.weights.standard)}, rarity {pct(standard.weights.rarity)}, coherence{" "}
          {pct(standard.weights.coherence)}, condition {pct(standard.weights.condition)}. Season turns in{" "}
          {daysLeftInSeason(ranch.home.day)} days.
        </p>
      </div>

      {showable.length === 0 ? (
        <p className="note">Nothing on the ranch is old enough to show.</p>
      ) : (
        <>
          <div className="show-choosers">
            <label className="setting">
              <span>Entry</span>
              <select value={chosen?.id ?? ""} onChange={(event) => setId(event.target.value)}>
                {showable.map((creature) => (
                  <option key={creature.id} value={creature.id}>
                    {creature.name} — {mapOf(creature).species.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting">
              <span>Ring</span>
              <select value={tier} onChange={(event) => setTier(Number(event.target.value))}>
                {SHOW_TIERS.map((entry) => (
                  <option key={entry.tier} value={entry.tier}>
                    {entry.name} — {entry.entryFee} motes, purse {entry.purse}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {chosen && preview ? (
            <>
              <div className="scorecard">
                <CreatureFigure creature={chosen} mode="full" width={200} />
                <ul>
                  {preview.entrants
                    .find((entrant) => entrant.mine)
                    ?.scorecard.categories.map((category) => (
                      <li key={category.id}>
                        <span className="cat-name">{category.name}</span>
                        <span className="cat-bar">
                          <i style={{ width: `${category.score * 100}%` }} />
                        </span>
                        <span className="mono">
                          {(category.score * 100).toFixed(0)} × {pct(category.weight)}
                        </span>
                        <em>{category.note}</em>
                      </li>
                    ))}
                </ul>
              </div>
              <p className="note">
                Against this field it would place {ordinal(preview.placement)} of {preview.entrants.length}.
                The field is fixed for the day, so this is what you will actually face.
              </p>
              <button
                type="button"
                className="primary"
                disabled={ranch.home.inventory.motes < showTier(tier).entryFee}
                onClick={() => ranch.dispatch({ kind: "enterShow", id: chosen.id, tier })}
              >
                Enter — {showTier(tier).entryFee} motes
              </button>
            </>
          ) : null}
        </>
      )}

      {ranch.home.records.ribbons.length > 0 ? (
        <>
          <h3>Ribbons</h3>
          <ol className="ribbons">
            {[...ranch.home.records.ribbons].reverse().slice(0, 12).map((ribbon, index) => (
              <li key={`${ribbon.day}-${index}`}>
                <span className="mono">day {ribbon.day}</span>
                <strong>{ribbon.name}</strong>
                <span>
                  {ordinal(ribbon.placement)} of {ribbon.field} — {showTier(ribbon.tier).name}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breeding Trials
// ---------------------------------------------------------------------------

function TrialsPanel({ ranch }: { ranch: RanchController }) {
  const [species, setSpecies] = useState<SpeciesId>(ranch.home.homeSpecies);
  const list = TRIALS.filter((trial) => trial.species === species);
  const running = ranch.side?.trial?.kind === "trial" ? trialById(ranch.side.trial.id) : undefined;

  return (
    <div className="panel">
      <h2>Breeding Trials</h2>
      <p className="hint">
        A pair, a specification and a generation limit. No fen to catch anything from, and ten berths —
        every hatch is a decision about what you can afford to let go of.
      </p>

      {running && ranch.side ? (
        <TrialRunning ranch={ranch} trial={running} />
      ) : (
        <>
          <label className="setting">
            <span>Species</span>
            <select value={species} onChange={(event) => setSpecies(event.target.value as SpeciesId)}>
              {SPECIES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>

          <ol className="trial-list">
            {list.map((trial) => {
              const record = ranch.home.records.trials[trial.id];
              return (
                <li key={trial.id} className={record?.cleared ? "cleared" : ""}>
                  <div className="trial-head">
                    <span className="mono tier">T{trial.tier}</span>
                    <strong>{trial.name}</strong>
                    <span className="mono">≤{trial.generations} generations</span>
                    {record ? <span className="mono best">best {record.score}</span> : null}
                  </div>
                  <p>{trial.blurb}</p>
                  <button type="button" onClick={() => ranch.openSide(createTrialRanch(trial))}>
                    {record?.cleared ? "Run again" : "Begin"}
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function TrialRunning({ ranch, trial }: { ranch: RanchController; trial: Trial }) {
  const side = ranch.side;
  if (!side) return null;
  const score = completeTrial(trial, side, phenotypeOf);
  const best = bestEntrant(trial, side.creatures, phenotypeOf);

  return (
    <div className="trial-running">
      <h3>{trial.name}</h3>
      <p>{trial.blurb}</p>
      <ul className="objectives">
        {trial.target.map((clause, index) => (
          <li key={index}>{describeClause(clause)}</li>
        ))}
      </ul>
      <p className="mono">
        Generation limit {trial.generations}. Best so far:{" "}
        {best ? `${best.name}, purity ${(purityOf(trial, best, mapOf(best)) * 100).toFixed(0)}%` : "nothing yet"}.
        {score ? ` Would score ${score.score}.` : ""}
      </p>
      <div className="new-station-actions">
        <button
          type="button"
          className="primary"
          disabled={!score?.cleared}
          onClick={() => {
            if (score) ranch.updateHome((current) => recordTrialResult(current, trial, score));
            ranch.closeSide();
          }}
        >
          {score?.cleared ? `Submit — ${score.score}` : "Not yet cleared"}
        </button>
        <button type="button" onClick={() => ranch.closeSide()}>
          Abandon
        </button>
      </div>
      <p className="hint">Use the Ranch and Pairing screens as usual. They are working on the trial.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily Genome
// ---------------------------------------------------------------------------

function DailyPanel({ ranch }: { ranch: RanchController }) {
  const key = dailyKey(new Date());
  const puzzle = useMemo(() => dailyPuzzle(key), [key]);
  const spent = dailySpent(ranch.home, key);
  const record = ranch.home.records.daily[key];
  const running = ranch.side?.trial?.kind === "daily";
  const score = running && ranch.side ? completeTrial(puzzle.trial, ranch.side, phenotypeOf) : undefined;
  const best = running && ranch.side ? bestEntrant(puzzle.trial, ranch.side.creatures, phenotypeOf) : undefined;

  return (
    <div className="panel">
      <h2>Daily Genome — {key}</h2>
      <p className="hint">
        The same pair, the same pool and the same target as everyone else who opened the game today. One
        attempt, and the puzzle is read off the pair rather than hoped for, so it is always solvable.
      </p>
      <p className="mono">
        {SPECIES.find((s) => s.id === puzzle.trial.species)?.name} · {puzzle.trial.generations} generations
      </p>
      <ul className="objectives">
        {puzzle.trial.target.map((clause, index) => (
          <li key={index}>{describeClause(clause)}</li>
        ))}
      </ul>

      {record ? (
        <p className="note">
          Played. Scored <strong>{record.score}</strong>
          {record.finished ? ` — cleared in ${record.generations} generations.` : " — not cleared."}
        </p>
      ) : running && ranch.side ? (
        <div className="new-station-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              // Count the clauses the best animal actually meets. A partial
              // answer still scores, because a daily nobody clears should not
              // be a day with an empty leaderboard.
              const matched = best ? clausesMet(puzzle.trial, best, phenotypeOf(best)) : 0;
              const value = dailyScore({
                cleared: score?.cleared ?? false,
                generations: score?.generations ?? puzzle.trial.generations,
                limit: puzzle.trial.generations,
                inbreeding: score?.inbreeding ?? 0,
                purity: score?.purity ?? 0,
                matched,
                total: puzzle.trial.target.length,
              });
              ranch.updateHome((current) =>
                recordDailyResult(current, {
                  dateKey: key,
                  score: value,
                  generations: score?.generations ?? puzzle.trial.generations,
                  inbreeding: score?.inbreeding ?? 0,
                  matched,
                  total: puzzle.trial.target.length,
                  finished: score?.cleared ?? false,
                }),
              );
              ranch.closeSide();
            }}
          >
            Submit {score?.cleared ? "— cleared" : "— unfinished"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="primary"
          disabled={spent}
          onClick={() =>
            ranch.openSide(
              createTrialRanch(puzzle.trial, {
                genomes: { sire: puzzle.sire, dam: puzzle.dam },
                kind: "daily",
              }),
            )
          }
        >
          {spent ? "Today's attempt is spent" : "Begin today's attempt"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rival Ranch
// ---------------------------------------------------------------------------

function RivalPanel({ ranch }: { ranch: RanchController }) {
  const [text, setText] = useState("");
  const [imported, setImported] = useState<Ghost | undefined>(undefined);
  const [result, setResult] = useState<string | undefined>(undefined);
  const team = ranch.home.creatures
    .filter((c) => c.status === "active" && c.stage !== "egg" && c.stage !== "hatchling")
    .slice(0, 3);
  const ghosts = useMemo(
    () => [0, 1, 2, 3].map((index) => houseGhost(index, ranch.home.homeSpecies, { strength: 0.5 + index * 0.14, selection: 1 + index * 3 })),
    [ranch.home.homeSpecies],
  );

  const fight = (ghost: Ghost): void => {
    if (team.length === 0) return;
    setResult(fightGhost(ghost, team, phenotypeOf, ghostRng(ranch.home, ghost.id)).summary);
  };

  return (
    <div className="panel">
      <h2>Rival Ranch</h2>
      <p className="hint">
        Snapshots, not opponents. Nothing here can be hurt and nothing can hurt you — a ghost fights
        identically every time it is challenged, which is what makes it a measuring instrument.
      </p>
      {team.length === 0 ? <p className="note">You need something old enough to fight.</p> : null}

      <ol className="ghost-list">
        {ghosts.map((ghost) => (
          <li key={ghost.id}>
            <strong>{ghost.station}</strong>
            <span className="mono">{ghost.team.length} animals</span>
            <button type="button" onClick={() => fight(ghost)} disabled={team.length === 0}>
              Challenge
            </button>
          </li>
        ))}
        {imported ? (
          <li>
            <strong>{imported.station} (imported)</strong>
            <span className="mono">{imported.team.length} animals</span>
            <button type="button" onClick={() => fight(imported)} disabled={team.length === 0}>
              Challenge
            </button>
          </li>
        ) : null}
      </ol>

      {result ? <p className="note">{result}</p> : null}

      <h3>Trade ghosts</h3>
      <textarea
        className="code-box"
        rows={4}
        value={text}
        placeholder="Paste a ghost here, or copy yours out"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="new-station-actions">
        <button
          type="button"
          onClick={() => setText(JSON.stringify(snapshotTeam("My Station", team, phenotypeOf)))}
          disabled={team.length === 0}
        >
          Copy mine out
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              setImported(JSON.parse(text) as Ghost);
              setResult(undefined);
            } catch {
              setResult("That is not a ghost.");
            }
          }}
        >
          Import
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stud Exchange
// ---------------------------------------------------------------------------

function ExchangePanel({ ranch }: { ranch: RanchController }) {
  const sires = ranch.home.creatures.filter((c) => c.status === "active" && c.sex === "male" && c.stage === "adult");
  const dams = ranch.home.creatures.filter((c) => c.status === "active" && c.sex === "female" && c.stage === "adult");
  const [sireId, setSireId] = useState(() => sires[0]?.id ?? "");
  const [damId, setDamId] = useState(() => dams[0]?.id ?? "");
  const [fee, setFee] = useState(200);
  const [text, setText] = useState("");
  const [offer, setOffer] = useState<StudOffer | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const sire = sires.find((c) => c.id === sireId);

  return (
    <div className="panel">
      <h2>Stud Exchange</h2>
      <p className="hint">
        Publish a male as a stud and others breed to him; breed to theirs and you get one gamete's worth of
        somebody else's work. A stud has no pedigree here, so Wright's F for the pairing is zero — which is
        the whole reason a closed herd pays the fee.
      </p>

      <h3>Publish</h3>
      {sires.length === 0 ? (
        <p className="note">No adult males on the ranch.</p>
      ) : (
        <>
          <div className="show-choosers">
            <label className="setting">
              <span>Stud</span>
              <select value={sireId} onChange={(event) => setSireId(event.target.value)}>
                {sires.map((creature) => (
                  <option key={creature.id} value={creature.id}>
                    {creature.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting">
              <span>Fee</span>
              <input
                type="number"
                min={0}
                step={50}
                value={fee}
                onChange={(event) => setFee(Math.max(0, Number(event.target.value)))}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!sire) return;
              const published = publishStud(sire, `${ranch.map.species.biome} Station`, { fee });
              ranch.updateHome((current) => addPublishedStud(current, published));
              setText(encodeOffer(published));
            }}
          >
            Publish and copy out
          </button>
        </>
      )}

      <h3>Breed to a stud</h3>
      <textarea
        className="code-box"
        rows={3}
        value={text}
        placeholder="Paste a stud offer here"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="new-station-actions">
        <button
          type="button"
          onClick={() => {
            try {
              setOffer(decodeOffer(text));
              setError(undefined);
            } catch (problem) {
              setOffer(undefined);
              setError(problem instanceof Error ? problem.message : "That offer could not be read.");
            }
          }}
        >
          Read offer
        </button>
        {offer && dams.length > 0 ? (
          <>
            <label className="setting">
              <span>Dam</span>
              <select value={damId} onChange={(event) => setDamId(event.target.value)}>
                {dams
                  .filter((c) => c.species === offer.species)
                  .map((creature) => (
                    <option key={creature.id} value={creature.id}>
                      {creature.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="primary"
              onClick={() => ranch.dispatch({ kind: "breedToStud", damId, offer })}
            >
              Breed — {offer.fee} motes
            </button>
          </>
        ) : null}
      </div>
      {error ? <p className="note">{error}</p> : null}
      {offer ? (
        <p className="note">
          <strong>{offer.name}</strong> of {offer.station} — {offer.species}, {offer.fee} motes.
          {offer.disclosed.length > 0
            ? ` Disclosed: ${offer.disclosed.join(", ")}.`
            : " Nothing disclosed — this is a gamble."}
        </p>
      ) : null}

      {ranch.home.records.studs.length > 0 ? (
        <>
          <h3>Published</h3>
          <ol className="stud-list">
            {ranch.home.records.studs.map((stud) => (
              <li key={stud.code}>
                <strong>{stud.name}</strong>
                <span className="mono">{formatGenomeCode(stud.code).slice(0, 17)}…</span>
                <span className="mono">
                  {stud.uses} uses · {stud.earned} motes
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy
// ---------------------------------------------------------------------------

function LegacyPanel({ ranch }: { ranch: RanchController }) {
  const candidates = legacyCandidates(ranch.home);
  const [id, setId] = useState(() => candidates[0]?.id ?? "");
  const [species, setSpecies] = useState<SpeciesId>(ranch.home.homeSpecies);
  const ancestor = candidates.find((c) => c.id === id) ?? candidates[0];
  const terms = legacyTerms(ranch.home.records.legacyDepth + 1);

  return (
    <div className="panel">
      <h2>Legacy</h2>
      <p className="hint">
        Begin again carrying one archived ancestor's genome into a new population. Not its raising and not
        its branch — the genome is the part that was earned.
      </p>
      <p className="note">{terms.note}</p>

      {candidates.length === 0 ? (
        <p className="note">Nothing in the Archive. Retire an elder you would not want to lose.</p>
      ) : (
        <>
          <div className="show-choosers">
            <label className="setting">
              <span>Carry</span>
              <select value={ancestor?.id ?? ""} onChange={(event) => setId(event.target.value)}>
                {candidates.map((creature) => (
                  <option key={creature.id} value={creature.id}>
                    {creature.name} — {mapOf(creature).species.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting">
              <span>New posting</span>
              <select value={species} onChange={(event) => setSpecies(event.target.value as SpeciesId)}>
                {SPECIES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {ancestor ? <CreatureFigure creature={ancestor} mode="full" width={200} /> : null}
          <button
            type="button"
            className="primary danger"
            onClick={() => {
              if (!ancestor) return;
              ranch.replace(
                startLegacy(
                  ranch.home,
                  { seed: `legacy-${ranch.home.seed}-${ranch.home.records.legacyDepth + 1}`, species, ancestor },
                  createRanch,
                ),
              );
            }}
          >
            Take the new posting
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function describeClause(clause: Trial["target"][number]): string {
  switch (clause.kind) {
    case "trait":
      return `Show ${clause.is} ${clause.trait}.`;
    case "stat":
      return `A ${clause.stat} ceiling of at least ${clause.atLeast}.`;
    case "carries":
      return `Carry ${clause.allele} at ${clause.locus}.`;
    case "homozygous":
      return `Breed true for ${clause.allele} at ${clause.locus}.`;
    case "clear":
      return "Carry no lethal allele.";
  }
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${["th", "st", "nd", "rd"][place % 10] ?? "th"}`;
}

/** Kept for the type import above; the panels use `Creature` through props. */
export type { Creature, ModeId, Ghost };
