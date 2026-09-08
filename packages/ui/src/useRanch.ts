/**
 * The one place the app holds mutable state.
 *
 * `@chimaera/game` is a pure reducer, so React's job here is small: hold the
 * current `RanchState`, forward actions to `applyAction`, keep a rolling
 * journal of events, and autosave. Nothing in the UI computes game rules.
 */

import { applyAction, createRanch, homeMap } from "@chimaera/game";
import type { Action, GameEvent, RanchState } from "@chimaera/game";
import type { SpeciesId } from "@chimaera/genetics";
import { STARTER_TRIO } from "@chimaera/genetics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AUTOSAVE_SLOT, loadFromSlot, saveToSlot } from "./db.js";

export interface JournalEntry {
  readonly key: number;
  readonly day: number;
  readonly event: GameEvent;
}

const JOURNAL_LIMIT = 240;

export interface RanchController {
  /** Whatever is being played: the station, or a trial running beside it. */
  readonly state: RanchState;
  /** The player's own station. The same object as `state` unless a side run is open. */
  readonly home: RanchState;
  /**
   * A Breeding Trial or a Daily Genome running beside the station.
   *
   * It is a whole `RanchState` rather than a mode flag, so every screen the
   * game already has — pairing, the Punnett predictor, the pedigree — works
   * inside a trial without knowing a trial exists.
   */
  readonly side: RanchState | undefined;
  /** The station's own gene map: the fen outside, and the campaign's species. */
  readonly map: ReturnType<typeof homeMap>;
  readonly journal: readonly JournalEntry[];
  readonly ready: boolean;
  readonly lastBlocked: string | undefined;
  dispatch(action: Action): readonly GameEvent[];
  replace(state: RanchState): void;
  /** Applies a change to the station itself, even while a side run is open. */
  updateHome(change: (state: RanchState) => RanchState): void;
  openSide(state: RanchState): void;
  closeSide(): void;
  reset(seed: string, species: SpeciesId): void;
  clearBlocked(): void;
}

export function useRanch(): RanchController {
  const [state, setState] = useState<RanchState>(() =>
    createRanch({ seed: defaultSeed(), species: STARTER_TRIO[0] ?? "quillfen" }),
  );
  const [side, setSide] = useState<RanchState | undefined>(undefined);
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
      // Always the station. A trial is a side run and does not belong in the
      // slot the player's actual ranch lives in.
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
      const apply = (current: RanchState): RanchState => {
        const result = applyAction(current, action);
        events = result.events;
        record(result.events, result.state.day);
        return result.state;
      };
      // Whichever ranch is on screen is the one the action lands on. A trial is
      // a real ranch, so it takes real actions.
      setSide((current) => (current ? apply(current) : current));
      setState((current) => (sideRef.current ? current : apply(current)));
      return events;
    },
    [record],
  );

  // The dispatcher reads this synchronously, so it must not be state.
  const sideRef = useRef<RanchState | undefined>(undefined);
  sideRef.current = side;

  const replace = useCallback((next: RanchState) => {
    setState(next);
    setSide(undefined);
    setJournal([]);
    setLastBlocked(undefined);
  }, []);

  const reset = useCallback(
    (seed: string, species: SpeciesId) => {
      replace(createRanch({ seed, species }));
    },
    [replace],
  );

  const active = side ?? state;
  return {
    state: active,
    home: state,
    side,
    map: homeMap(active),
    journal,
    ready,
    lastBlocked,
    dispatch,
    replace,
    updateHome: useCallback((change: (current: RanchState) => RanchState) => setState(change), []),
    openSide: useCallback((next: RanchState) => {
      setSide(next);
      setLastBlocked(undefined);
    }, []),
    closeSide: useCallback(() => setSide(undefined), []),
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
