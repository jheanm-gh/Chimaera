/**
 * The one place the app holds mutable state.
 *
 * `@chimaera/game` is a pure reducer, so React's job here is small: hold the
 * current `RanchState`, forward actions to `applyAction`, keep a rolling
 * journal of events, and autosave. Nothing in the UI computes game rules.
 */

import { applyAction, createRanch } from "@chimaera/game";
import type { Action, GameEvent, RanchState } from "@chimaera/game";
import { geneMapFor, QUILLFEN } from "@chimaera/genetics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AUTOSAVE_SLOT, loadFromSlot, saveToSlot } from "./db.js";

export const map = geneMapFor(QUILLFEN);

export interface JournalEntry {
  readonly key: number;
  readonly day: number;
  readonly event: GameEvent;
}

const JOURNAL_LIMIT = 240;

export interface RanchController {
  readonly state: RanchState;
  readonly journal: readonly JournalEntry[];
  readonly ready: boolean;
  readonly lastBlocked: string | undefined;
  dispatch(action: Action): readonly GameEvent[];
  replace(state: RanchState): void;
  reset(seed: string): void;
  clearBlocked(): void;
}

export function useRanch(): RanchController {
  const [state, setState] = useState<RanchState>(() => createRanch(map, { seed: defaultSeed() }));
  const [journal, setJournal] = useState<readonly JournalEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [lastBlocked, setLastBlocked] = useState<string | undefined>(undefined);
  const journalKey = useRef(0);

  // Resume the autosave once, on mount. A browser with storage blocked still
  // plays; it just starts fresh.
  useEffect(() => {
    let cancelled = false;
    loadFromSlot(AUTOSAVE_SLOT)
      .then((saved) => {
        if (!cancelled && saved) setState(saved);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave after the render settles, so a long day-advance does not write
  // mid-frame.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void saveToSlot(AUTOSAVE_SLOT, state).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [state, ready]);

  const record = useCallback((events: readonly GameEvent[], day: number) => {
    const worth = events.filter((event) => event.kind !== "dayPassed");
    const blocked = worth.find((event) => event.kind === "blocked");
    setLastBlocked(blocked?.kind === "blocked" ? blocked.reason : undefined);
    if (worth.length === 0) return;
    setJournal((current) => {
      const added = worth.map((event) => ({ key: journalKey.current++, day, event }));
      return [...added.reverse(), ...current].slice(0, JOURNAL_LIMIT);
    });
  }, []);

  const dispatch = useCallback(
    (action: Action): readonly GameEvent[] => {
      let events: readonly GameEvent[] = [];
      setState((current) => {
        const result = applyAction(current, action, map);
        events = result.events;
        record(result.events, result.state.day);
        return result.state;
      });
      return events;
    },
    [record],
  );

  const replace = useCallback((next: RanchState) => {
    setState(next);
    setJournal([]);
    setLastBlocked(undefined);
  }, []);

  const reset = useCallback(
    (seed: string) => {
      replace(createRanch(map, { seed }));
    },
    [replace],
  );

  return {
    state,
    journal,
    ready,
    lastBlocked,
    dispatch,
    replace,
    reset,
    clearBlocked: useCallback(() => setLastBlocked(undefined), []),
  };
}

function defaultSeed(): string {
  // Not a timestamp: a seed the player can read back, retype and share.
  const words = ["reed", "silt", "quill", "lantern", "prism", "fen", "slate", "bloom"];
  const pick = (): string => words[Math.floor(Math.random() * words.length)] as string;
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 900 + 100)}`;
}
