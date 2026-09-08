import { pedigreeOf } from "@chimaera/game";
import type { CreatureId, RanchState } from "@chimaera/game";
import { useMemo } from "react";

interface Props {
  readonly state: RanchState;
  readonly rootId: CreatureId | undefined;
  readonly onSelect: (id: CreatureId) => void;
}

interface Node {
  readonly id: CreatureId;
  readonly name: string;
  readonly generation: number;
  readonly sire?: CreatureId | undefined;
  readonly dam?: CreatureId | undefined;
}

const DEPTH = 4;

/**
 * The pedigree view: always available, always free (§1.3).
 *
 * This is the tool that rewards the player who thinks. A careful reader can
 * infer genotypes from ancestry without ever buying a lens, so it shows every
 * ancestor it has — including dead and released ones, whose records are kept
 * for exactly this reason — along with each one's coefficient of inbreeding and
 * its kinship to the creature in hand.
 */
export function PedigreeView({ state, rootId, onSelect }: Props) {
  const records = useMemo(() => new Map(state.pedigree.map((r) => [r.id, r as Node])), [state.pedigree]);
  const pedigree = useMemo(() => pedigreeOf(state), [state]);

  if (!rootId || !records.has(rootId)) {
    return (
      <div className="panel">
        <h2>Pedigree</h2>
        <p className="note">Choose a creature on the ranch to trace its line.</p>
      </div>
    );
  }

  const generations: Node[][] = [];
  let frontier: (Node | undefined)[] = [records.get(rootId) as Node];
  for (let depth = 0; depth < DEPTH && frontier.some(Boolean); depth++) {
    generations.push(frontier.filter((n): n is Node => Boolean(n)));
    frontier = frontier.flatMap((node) => [
      node?.dam ? records.get(node.dam) : undefined,
      node?.sire ? records.get(node.sire) : undefined,
    ]);
  }

  const living = new Set(state.creatures.map((c) => c.id));
  const archived = new Set(state.archive.map((c) => c.id));

  return (
    <div className="panel pedigree">
      <h2>Pedigree — {records.get(rootId)?.name}</h2>
      <p className="hint">
        Free, forever. Every ancestor the ranch has ever held is here, alive or not. A careful reader can deduce a
        genotype from this without spending a single lens.
      </p>
      <div className="pedigree-columns">
        {generations.map((generation, depth) => (
          <div key={depth} className="pedigree-column">
            <h3>{depth === 0 ? "This creature" : depth === 1 ? "Parents" : `${depth} generations back`}</h3>
            {generation.map((node) => {
              const f = pedigree.inbreedingCoefficient(node.id);
              const kinship = depth === 0 ? 0.5 : pedigree.kinship(rootId, node.id);
              const status = living.has(node.id) ? "living" : archived.has(node.id) ? "archived" : "gone";
              return (
                <button
                  type="button"
                  key={`${depth}-${node.id}`}
                  className={`pedigree-node ${status}`}
                  onClick={() => onSelect(node.id)}
                >
                  <strong>{node.name}</strong>
                  <span className="mono">
                    F {f.toFixed(3)}
                    {depth > 0 ? ` · kin ${kinship.toFixed(3)}` : ""}
                  </span>
                  <span className="pedigree-status">{status}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
