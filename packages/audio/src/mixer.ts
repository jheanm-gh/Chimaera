/**
 * The mixer's shape (§7): "full mute and volume separation for music/SFX/
 * creature calls".
 *
 * Three buses, each independently muted and levelled, plus a master. Kept here
 * as data so the settings can be saved, tested and reasoned about without an
 * audio context — and so "muted" means one thing everywhere rather than being
 * re-implemented per call site.
 */

export type BusId = "music" | "sfx" | "calls";

export interface BusState {
  readonly level: number;
  readonly muted: boolean;
}

export interface MixerState {
  readonly master: BusState;
  readonly music: BusState;
  readonly sfx: BusState;
  readonly calls: BusState;
  /** Nothing plays at all until the player has interacted; browsers insist. */
  readonly started: boolean;
}

export const DEFAULT_MIXER: MixerState = {
  master: { level: 0.7, muted: false },
  music: { level: 0.55, muted: false },
  sfx: { level: 0.8, muted: false },
  calls: { level: 0.9, muted: false },
  started: false,
};

export const BUSES: readonly { readonly id: BusId; readonly name: string; readonly blurb: string }[] = [
  { id: "music", name: "Music", blurb: "The ranch theme and its layers." },
  { id: "sfx", name: "Effects", blurb: "Hatches, mutations, ribbons, losses." },
  { id: "calls", name: "Creature calls", blurb: "What your animals sound like." },
];

/**
 * The gain a bus should actually run at.
 *
 * Muting anything mutes everything under it, and a muted master silences the
 * lot — expressed once, here, rather than checked at every call site where it
 * would eventually be forgotten.
 */
export function gainOf(mixer: MixerState, bus: BusId): number {
  if (!mixer.started) return 0;
  if (mixer.master.muted) return 0;
  const channel = mixer[bus];
  if (channel.muted) return 0;
  return clamp01(mixer.master.level) * clamp01(channel.level);
}

export function setLevel(mixer: MixerState, bus: BusId | "master", level: number): MixerState {
  return { ...mixer, [bus]: { ...mixer[bus], level: clamp01(level) } };
}

export function setMuted(mixer: MixerState, bus: BusId | "master", muted: boolean): MixerState {
  return { ...mixer, [bus]: { ...mixer[bus], muted } };
}

export function isSilent(mixer: MixerState): boolean {
  return (["music", "sfx", "calls"] as const).every((bus) => gainOf(mixer, bus) === 0);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
