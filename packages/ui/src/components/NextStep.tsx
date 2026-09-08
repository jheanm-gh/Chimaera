import { campaignFor, chapterProgress } from "@chimaera/game";
import { useState } from "react";
import type { RanchController } from "../useRanch.js";

/**
 * What to do next, on every screen.
 *
 * The campaign always knew what it wanted — the objectives are authored, and
 * the Commission tab has listed them since Phase 5. The problem was that
 * knowing what the board wants is not the same as knowing which of nine tabs to
 * open, and a player who has to discover that by exploring has been handed a
 * puzzle nobody meant to set. This is the fix: the next unmet objective, in
 * front of the player wherever they are, with the button that takes them to
 * where it is done.
 *
 * It says what, never how. That rule is from §4 and it still holds — the lesson
 * only lands if the player works out the cross themselves, so an unmet
 * objective shows the board's request and nothing else.
 *
 * Dismissable, and it stays dismissed until the objective actually changes. A
 * hint that cannot be turned off is a nag, and a player who already knows what
 * they are doing should not have to read it every time they change tab.
 */

const WHERE: Record<string, { tab: "pairing" | "ranch" | "field"; verb: string }> = {
  pairing: { tab: "pairing", verb: "Open the pairing bench" },
  ranch: { tab: "ranch", verb: "Go to the herd" },
  field: { tab: "field", verb: "Head for the field" },
};

interface Props {
  readonly ranch: RanchController;
  readonly onGo: (tab: "pairing" | "ranch" | "field" | "commission") => void;
}

export function NextStep({ ranch, onGo }: Props) {
  const [dismissed, setDismissed] = useState<string | undefined>(undefined);
  const progress = chapterProgress(ranch.state.campaign, campaignFor(ranch.map));
  if (!progress) return null;

  const met = new Set(ranch.state.campaign.met);
  const next = progress.chapter.objectives.find((objective) => !met.has(objective.id));
  if (!next || dismissed === next.id) return null;

  const destination = WHERE[next.where ?? "pairing"] ?? WHERE["pairing"];
  return (
    <aside className="next-step" aria-label="What to do next">
      <div className="next-step-body">
        <p className="next-step-eyebrow mono">
          Chapter {progress.chapter.number} · {progress.chapter.title}
        </p>
        <p className="next-step-task">{next.label}</p>
      </div>
      <div className="next-step-actions">
        <button type="button" className="primary" onClick={() => onGo(destination?.tab ?? "pairing")}>
          {destination?.verb ?? "Open the pairing bench"}
        </button>
        <button type="button" onClick={() => onGo("commission")}>
          Why
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => setDismissed(next.id)}
          aria-label="Hide this hint until the next objective"
        >
          ✕
        </button>
      </div>
    </aside>
  );
}
