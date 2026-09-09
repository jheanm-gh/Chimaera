/**
 * Audio, wired to the game (§7).
 *
 * The engine is imperative and the game is a stream of events, so this is the
 * seam: it watches the ranch, keeps the score's layer set in line with it, and
 * turns each new journal entry into the stinger it deserves.
 *
 * Two things it deliberately does not do. It never starts itself — a browser
 * would refuse and be right to — and it never plays a stinger for an event the
 * player has already seen, which is why the journal's monotonic key is the
 * watermark rather than the event list itself.
 */

import { summarise } from "@chimaera/game";
import type { GameEvent, RanchState } from "@chimaera/game";
import { DEFAULT_MIXER } from "@chimaera/audio";
import type { MixerState, StingerId, VoiceSpec } from "@chimaera/audio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JournalEntry } from "../useRanch.js";
import { AudioEngine } from "./engine.js";

const SETTINGS_KEY = "chimaera:mixer";

export interface AudioController {
  readonly mixer: MixerState;
  readonly running: boolean;
  setMixer(next: MixerState): void;
  /** From a real click. Browsers will not make a sound before one. */
  enable(): void;
  play(voice: VoiceSpec): void;
  sting(id: StingerId): void;
}

/** Which sound an event is worth, if any. Most events are worth silence. */
function stingerFor(event: GameEvent): StingerId | undefined {
  switch (event.kind) {
    case "hatched":
      return "hatch";
    case "mutation":
      return event.novel ? "novel" : "mutation";
    case "eggFailed":
      return "lethal";
    case "died":
    case "lost":
      return "death";
    case "chapterComplete":
      return "chapter";
    case "placed":
      return event.placement <= 3 ? "ribbon" : undefined;
    default:
      return undefined;
  }
}

export function useAudio(state: RanchState, journal: readonly JournalEntry[]): AudioController {
  const engine = useMemo(() => new AudioEngine(), []);
  const [mixer, setMixerState] = useState<MixerState>(() => load());
  const [running, setRunning] = useState(false);
  const watermark = useRef<number>(-1);

  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    engine.apply(mixer);
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...mixer, started: false }));
    } catch {
      // A browser with storage blocked still plays; it just forgets the levels.
    }
  }, [engine, mixer]);

  // The score follows the ranch. Recomputed on every state change and cheap
  // when nothing has moved, because `setScore` is idempotent.
  const summary = summarise(state.compendium);
  const generations = state.creatures.reduce((deepest, creature) => Math.max(deepest, creature.generation), 0);
  useEffect(() => {
    if (!mixer.started) return;
    engine.setScore({
      herd: state.creatures.filter((creature) => creature.status === "active").length,
      species: summary.species.seen,
      generations,
      chaptersDone: state.campaign.completed.length,
      novelAlleles: summary.alleles.seen,
      completion: summary.completion,
    });
  }, [
    engine,
    mixer.started,
    state.creatures,
    state.campaign.completed.length,
    summary.species.seen,
    summary.alleles.seen,
    summary.completion,
    generations,
  ]);

  // Stingers, from the journal rather than from a dispatch return, so a state
  // restored from a save does not replay a hundred hatches on load.
  useEffect(() => {
    if (!mixer.started) return;
    const newest = journal[0];
    if (!newest) return;
    if (watermark.current < 0) {
      watermark.current = newest.key;
      return;
    }
    const fresh = journal.filter((entry) => entry.key > watermark.current);
    watermark.current = newest.key;
    // At most one stinger per batch: a day-advance that hatches four eggs
    // should sound like a morning, not like a fruit machine.
    for (const entry of fresh.reverse()) {
      const id = stingerFor(entry.event);
      if (id) {
        engine.sting(id);
        break;
      }
    }
  }, [engine, journal, mixer.started]);

  const enable = useCallback(() => {
    void engine.start({ ...mixer, started: true }).then((ok) => {
      setRunning(ok);
      if (ok) setMixerState((current) => ({ ...current, started: true }));
    });
  }, [engine, mixer]);

  return {
    mixer,
    running,
    setMixer: setMixerState,
    enable,
    play: useCallback((voice: VoiceSpec) => engine.play(voice), [engine]),
    sting: useCallback((id: StingerId) => engine.sting(id), [engine]),
  };
}

function load(): MixerState {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_MIXER;
    const parsed = JSON.parse(raw) as Partial<MixerState>;
    return { ...DEFAULT_MIXER, ...parsed, started: false };
  } catch {
    return DEFAULT_MIXER;
  }
}
