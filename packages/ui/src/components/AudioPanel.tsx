/**
 * The mixer (§7): "full mute and volume separation for music/SFX/creature
 * calls".
 *
 * Sound is off until the player asks for it. That is partly the browser's rule
 * and mostly good manners — a page that starts making noise on load is a page
 * people close.
 */

import { BUSES, setLevel, setMuted } from "@chimaera/audio";
import type { AudioController } from "../audio/useAudio.js";

export function AudioPanel({ audio }: { audio: AudioController }) {
  if (!audio.mixer.started) {
    return (
      <button type="button" className="setting audio-off" onClick={audio.enable} title="Turn sound on">
        ♪ Sound off
      </button>
    );
  }

  return (
    <details className="setting audio-panel">
      <summary>♪ Sound</summary>
      <div className="audio-buses">
        <Bus
          id="master"
          name="Master"
          blurb="Everything."
          audio={audio}
        />
        {BUSES.map((bus) => (
          <Bus key={bus.id} id={bus.id} name={bus.name} blurb={bus.blurb} audio={audio} />
        ))}
      </div>
    </details>
  );
}

function Bus({
  id,
  name,
  blurb,
  audio,
}: {
  id: "master" | "music" | "sfx" | "calls";
  name: string;
  blurb: string;
  audio: AudioController;
}) {
  const channel = audio.mixer[id];
  return (
    <div className="audio-bus">
      <label>
        <input
          type="checkbox"
          checked={!channel.muted}
          onChange={(event) => audio.setMixer(setMuted(audio.mixer, id, !event.target.checked))}
        />
        <span>{name}</span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={channel.level}
        aria-label={`${name} level`}
        disabled={channel.muted}
        onChange={(event) => audio.setMixer(setLevel(audio.mixer, id, Number(event.target.value)))}
      />
      <span className="mono">{Math.round(channel.level * 100)}</span>
      <em>{blurb}</em>
    </div>
  );
}
