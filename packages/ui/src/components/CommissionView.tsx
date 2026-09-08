/**
 * The campaign, as the restoration board sees it (§4.1).
 *
 * The chapter shows its premise, its briefing, and its objectives with the met
 * ones ticked. Objectives are never explained *how* — the lesson only lands if
 * the player works out the cross themselves — so an unmet objective shows what
 * the board wants and nothing else. The lesson text appears afterwards, once
 * they have already learned it by doing it.
 */

import { campaignFor, chapterProgress, CHAPTER_COUNT, itemById } from "@chimaera/game";
import type { RanchController } from "../useRanch.js";

export function CommissionView({ ranch }: { ranch: RanchController }) {
  const chapters = campaignFor(ranch.map);
  const progress = chapterProgress(ranch.state.campaign, chapters);
  const met = new Set(ranch.state.campaign.met);

  return (
    <div className="panel commission">
      <h2>The commission</h2>
      <p className="hint">
        The station is a restoration post, not a stud farm. Eight commissions, each one a problem the
        fen itself is posing.
      </p>

      <ol className="chapter-rail" aria-label="Campaign chapters">
        {chapters.map((chapter) => {
          const done = ranch.state.campaign.completed.includes(chapter.id);
          const active = progress?.chapter.id === chapter.id;
          return (
            <li
              key={chapter.id}
              className={`rail-step${done ? " done" : ""}${active ? " active" : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <span className="rail-number mono">{chapter.number}</span>
              <span className="rail-label">{done || active ? chapter.title : "—"}</span>
            </li>
          );
        })}
      </ol>

      {progress ? (
        <article className="chapter">
          <header>
            <p className="eyebrow mono">
              Chapter {progress.chapter.number} of {CHAPTER_COUNT} · {progress.chapter.concept}
            </p>
            <h3>{progress.chapter.title}</h3>
          </header>
          <p className="premise">{progress.chapter.premise}</p>
          <p className="briefing">{progress.chapter.briefing}</p>

          <ul className="objectives">
            {progress.chapter.objectives.map((objective) => {
              const done = met.has(objective.id);
              return (
                <li key={objective.id} className={done ? "done" : ""}>
                  <span className="tick" aria-hidden="true">
                    {done ? "✓" : "○"}
                  </span>
                  <span>
                    <strong>{objective.label}</strong>
                    {done ? <em className="lesson">{objective.lesson}</em> : null}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="reward mono">
            On delivery: {progress.chapter.reward.motes} motes
            {Object.entries(progress.chapter.reward.items).length > 0
              ? ` · ${Object.entries(progress.chapter.reward.items)
                  .map(([id, count]) => `${count}× ${safeName(id)}`)
                  .join(" · ")}`
              : ""}
          </p>
        </article>
      ) : (
        <article className="chapter">
          <header>
            <p className="eyebrow mono">Survey complete</p>
            <h3>The fen can carry on without the station</h3>
          </header>
          <p className="premise">
            Every commission delivered. What is left on the ranch is yours, and what went back into
            the fen is breeding without you.
          </p>
        </article>
      )}

      {ranch.state.campaign.completed.length > 0 ? (
        <section className="delivered">
          <h3>Delivered</h3>
          <ol>
            {chapters
              .filter((chapter) => ranch.state.campaign.completed.includes(chapter.id))
              .map((chapter) => (
                <li key={chapter.id}>
                  <strong>
                    {chapter.number}. {chapter.title}
                  </strong>
                  <span className="mono">{chapter.concept}</span>
                  <p>{chapter.closing}</p>
                </li>
              ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/** Rewards name items by id; a renamed item should not crash the panel. */
function safeName(id: string): string {
  try {
    return itemById(id).name;
  } catch {
    return id;
  }
}
