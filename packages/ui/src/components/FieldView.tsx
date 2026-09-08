import {
  activeCreatures,
  combatantFor,
  EXPEDITION_TEAM_SIZE,
  LEAGUE_TIERS,
  leagueTier,
  nodeById,
  optionsFrom,
} from "@chimaera/game";
import type { RegionNode } from "@chimaera/game";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EvaluateRequest, EvaluateResponse } from "../workers/evaluate.worker.js";
import type { RanchController } from "../useRanch.js";
import { map } from "../useRanch.js";

interface Props {
  readonly ranch: RanchController;
}

/**
 * The Field: the League ladder, bulk lineage evaluation, and expeditions.
 *
 * Combat is the fitness function, so this screen is built to *answer a
 * question* rather than to be exciting. The League is a repeatable measurement;
 * the evaluation panel is the measurement taken fifty times; the expedition is
 * the only place any of it costs a life.
 */
export function FieldView({ ranch }: Props) {
  const creatures = activeCreatures(ranch.state).filter((c) => c.stage !== "egg");
  const [team, setTeam] = useState<string[]>(() => creatures.slice(0, 3).map((c) => c.id));
  const run = ranch.state.expedition;

  const selected = team.filter((id) => creatures.some((c) => c.id === id));
  const toggle = (id: string): void =>
    setTeam((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : current.length >= 3 ? current : [...current, id],
    );

  return (
    <div className="field">
      {run ? (
        <ExpeditionPanel ranch={ranch} />
      ) : (
        <>
          <div className="panel">
            <h2>Your three</h2>
            <p className="hint">
              Set the team, the roles and the stances before you go. Once a fight starts there is nothing to press.
            </p>
            <ul className="team-picker">
              {creatures.map((creature) => (
                <li key={creature.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(creature.id)}
                      onChange={() => toggle(creature.id)}
                    />
                    <span className="team-name">{creature.name}</span>
                    <span className="mono">
                      {creature.role} · {creature.stance}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <LeaguePanel ranch={ranch} team={selected} />
          <EvaluationPanel ranch={ranch} team={selected} />
          <ExpeditionStart ranch={ranch} team={selected} />
        </>
      )}
    </div>
  );
}

function LeaguePanel({ ranch, team }: { ranch: RanchController; team: readonly string[] }) {
  const cleared = ranch.state.leagueTier;
  return (
    <div className="panel">
      <h2>The League</h2>
      <p className="hint">
        Safe, repeatable, and the only honest answer to "am I getting better at this?". Nothing dies here.
      </p>
      <ul className="ladder">
        {LEAGUE_TIERS.map((tier) => {
          const open = tier.tier <= cleared + 1;
          const won = tier.tier <= cleared;
          return (
            <li key={tier.tier} className={won ? "won" : open ? "open" : "locked"}>
              <span className="ladder-name">{tier.name}</span>
              <span className="mono">{tier.purse} motes</span>
              <button
                type="button"
                disabled={!open || team.length === 0}
                onClick={() => ranch.dispatch({ kind: "bout", team, tier: tier.tier })}
              >
                {won ? "Run it again" : "Enter"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** §3's "simulate 50 fights to evaluate a lineage", done off the main thread. */
function EvaluationPanel({ ranch, team }: { ranch: RanchController; team: readonly string[] }) {
  const [tier, setTier] = useState(1);
  const [fights, setFights] = useState(50);
  const [report, setReport] = useState<EvaluateResponse | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | undefined>(undefined);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/evaluate.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<EvaluateResponse>) => {
      setReport(event.data);
      setRunning(false);
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const cleared = ranch.state.leagueTier;
  const names = useMemo(
    () => new Map(activeCreatures(ranch.state).map((c) => [c.id, c.name])),
    [ranch.state],
  );

  const evaluate = (): void => {
    const creatures = activeCreatures(ranch.state).filter((c) => team.includes(c.id));
    if (creatures.length === 0 || !workerRef.current) return;
    setRunning(true);
    setReport(undefined);
    const request: EvaluateRequest = {
      specs: creatures.map((creature) => combatantFor(creature, map)),
      difficulty: leagueTier(tier).difficulty,
      fights,
      seed: `${ranch.state.seed}:evaluate:${ranch.state.day}:${tier}`,
    };
    workerRef.current.postMessage(request);
  };

  return (
    <div className="panel">
      <h2>Evaluate the lineage</h2>
      <p className="hint">
        One fight is an anecdote. Run the matchup many times against a tier you have already cleared, and read the
        win rate instead.
      </p>
      {cleared === 0 ? (
        <p className="note">Clear a League tier first. There is nothing yet to measure against.</p>
      ) : (
        <>
          <div className="evaluate-controls">
            <label>
              <span>Against</span>
              <select value={tier} onChange={(event) => setTier(Number(event.target.value))}>
                {LEAGUE_TIERS.filter((entry) => entry.tier <= cleared).map((entry) => (
                  <option key={entry.tier} value={entry.tier}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Fights</span>
              <select value={fights} onChange={(event) => setFights(Number(event.target.value))}>
                {[50, 200, 1000].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="primary" disabled={running || team.length === 0} onClick={evaluate}>
              {running ? "Running…" : "Simulate"}
            </button>
          </div>

          {report ? (
            <div className="report">
              <div className="report-headline">
                <span className="mono">win rate</span>
                <strong>{(report.winRate * 100).toFixed(1)}%</strong>
                <span className="mono">
                  over {report.fights} fights · {report.meanRounds.toFixed(1)} rounds · {report.elapsedMs.toFixed(0)}ms
                </span>
              </div>
              <ul className="survival">
                {Object.entries(report.survival).map(([id, rate]) => (
                  <li key={id}>
                    <span>{names.get(id) ?? id}</span>
                    <span className="survival-bar">
                      <i style={{ width: `${rate * 100}%` }} />
                    </span>
                    <span className="mono">{(rate * 100).toFixed(0)}% left standing</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ExpeditionStart({ ranch, team }: { ranch: RanchController; team: readonly string[] }) {
  const sized = team.length === EXPEDITION_TEAM_SIZE;
  const blooded = ranch.state.leagueTier >= 1;
  const label = !blooded ? "Win a League bout first" : sized ? "Put in" : `Choose exactly ${EXPEDITION_TEAM_SIZE}`;
  return (
    <div className="panel danger-panel">
      <h2>Expedition</h2>
      <p className="hint">
        Three creatures, a region nobody has mapped, and no way to heal properly until you come home. What falls out
        there does not come back. The wild stock you find is what an inbred herd actually needs.
      </p>
      {!blooded ? (
        <p className="note">
          The League first. Find out what your stock can take somewhere that does not keep what it beats.
        </p>
      ) : null}
      <button
        type="button"
        className="primary"
        disabled={!sized || !blooded}
        onClick={() => ranch.dispatch({ kind: "enterExpedition", team })}
      >
        {label}
      </button>
    </div>
  );
}

function ExpeditionPanel({ ranch }: { ranch: RanchController }) {
  const run = ranch.state.expedition;
  if (!run) return null;
  const here = nodeById(run.region, run.at);
  const options = optionsFrom(run.region, run.at);
  const names = new Map(ranch.state.pedigree.map((r) => [r.id, r.name]));

  return (
    <div className="panel expedition">
      <h2>{run.region.name}</h2>
      <p className="hint">
        {here.name} — {here.blurb}
      </p>

      <div className="expedition-team">
        {run.team.map((member) => (
          <div key={member.id} className="expedition-member">
            <span>{names.get(member.id) ?? member.id}</span>
            <span className="hp-track">
              <i style={{ width: `${(member.hp / member.maxHp) * 100}%` }} />
            </span>
            <span className="mono">
              {member.hp}/{member.maxHp}
            </span>
          </div>
        ))}
        {run.team.length === 0 ? <p className="note">Nobody is left standing.</p> : null}
      </div>

      <RegionMap region={run.region} at={run.at} visited={run.visited} />

      <h3>Where next</h3>
      <div className="expedition-options">
        {options.map((node) => (
          <button key={node.id} type="button" onClick={() => ranch.dispatch({ kind: "expeditionMove", nodeId: node.id })}>
            <strong>{node.name}</strong>
            <span className="mono">{node.kind}</span>
            <em>{node.blurb}</em>
          </button>
        ))}
        {options.length === 0 ? <p className="note">There is nowhere further to go.</p> : null}
      </div>

      <div className="expedition-foot">
        <div className="carried">
          <span className="mono">Carrying</span>
          <span>
            {run.loot.motes} motes ·{" "}
            {Object.values(run.loot.items).reduce((a, b) => a + b, 0)} items ·{" "}
            {Object.values(run.loot.fragments).reduce((a, b) => a + b, 0)} fragments ·{" "}
            {run.loot.specimens.length} specimens
          </span>
        </div>
        <button type="button" onClick={() => ranch.dispatch({ kind: "expeditionWithdraw" })}>
          Turn for home — keep everything
        </button>
      </div>

      <ol className="expedition-log">
        {[...run.log].reverse().map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ol>
    </div>
  );
}

function RegionMap({
  region,
  at,
  visited,
}: {
  region: { readonly depth: number; readonly nodes: readonly RegionNode[] };
  at: string;
  visited: readonly string[];
}) {
  const layers: RegionNode[][] = [];
  for (let depth = 0; depth <= region.depth; depth++) {
    layers.push(region.nodes.filter((node) => node.depth === depth));
  }
  return (
    <div className="region-map" aria-label="Region map">
      {layers.map((layer, depth) => (
        <div key={depth} className="region-layer">
          {layer.map((node) => (
            <span
              key={node.id}
              className={`region-node ${node.id === at ? "here" : visited.includes(node.id) ? "past" : ""} kind-${node.kind}`}
              title={`${node.name} — ${node.kind}`}
            >
              {node.kind === "warden" ? "◆" : node.kind === "encounter" ? "▲" : node.kind === "spring" ? "≈" : "●"}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
