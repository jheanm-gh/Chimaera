/**
 * The Web Audio graph.
 *
 * `@chimaera/audio` decides what should be heard; this builds it. Everything
 * here is synthesis — no samples, no files, nothing to load — so the whole
 * soundtrack costs a few kilobytes of code and every creature's call is
 * generated from its own genome at the moment you ask for it.
 *
 * Three rules the browser imposes and one the design does:
 *
 *  1. **Nothing until a gesture.** An `AudioContext` created before the player
 *     has clicked something starts suspended, and browsers are right to insist.
 *     `start()` is called from a real click and nothing before it makes a sound.
 *  2. **Every node is disposable.** Oscillators are one-shot; a call that has
 *     finished is disconnected and forgotten, or a long session accumulates a
 *     thousand dead nodes and the tab starts to stutter.
 *  3. **Ramps, never steps.** Every gain change is a short ramp. A gain set
 *     instantly is a click, and a click is the sound of an amateur.
 *  4. **Silence must be free.** With the mixer muted the layer loop still runs
 *     — the score has to be in the right place when it comes back — but no
 *     oscillator is created, so a muted game costs nothing.
 */

import { chordAt, gainOf, hzFor, LAYERS, layersFor, stingerById } from "@chimaera/audio";
import type { ActiveLayer, BusId, LayerId, MixerState, ScoreInput, StingerId, VoiceSpec } from "@chimaera/audio";

const RAMP = 0.02;

interface LayerVoice {
  readonly osc: OscillatorNode;
  readonly gain: GainNode;
  readonly def: (typeof LAYERS)[number];
}

export class AudioEngine {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private buses: Partial<Record<BusId, GainNode>> = {};
  private layers = new Map<LayerId, LayerVoice>();
  private mixer: MixerState | undefined;
  private startedAt = 0;
  private chordTimer: number | undefined;

  /** True once the browser has actually allowed us to make a sound. */
  get running(): boolean {
    return this.context?.state === "running";
  }

  /**
   * Called from a real user gesture. Safe to call repeatedly.
   *
   * Returns false when the browser has no Web Audio at all, which is a normal
   * thing for a page to survive rather than an error to throw.
   */
  async start(mixer: MixerState): Promise<boolean> {
    const Ctor: typeof AudioContext | undefined =
      typeof window === "undefined"
        ? undefined
        : window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;

    if (!this.context) {
      const context = new Ctor();
      const master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);
      for (const bus of ["music", "sfx", "calls"] as const) {
        const node = context.createGain();
        node.gain.value = 1;
        node.connect(master);
        this.buses[bus] = node;
      }
      this.context = context;
      this.master = master;
      this.startedAt = context.currentTime;
    }
    await this.context.resume().catch(() => undefined);
    this.apply(mixer);
    return this.running;
  }

  /** Applies mixer levels. Cheap enough to call on every render. */
  apply(mixer: MixerState): void {
    this.mixer = mixer;
    const context = this.context;
    if (!context || !this.master) return;
    const now = context.currentTime;
    this.master.gain.setTargetAtTime(mixer.master.muted || !mixer.started ? 0 : mixer.master.level, now, 0.05);
    for (const bus of ["music", "sfx", "calls"] as const) {
      const node = this.buses[bus];
      if (node) node.gain.setTargetAtTime(gainOf(mixer, bus) === 0 ? 0 : mixer[bus].level, now, 0.05);
    }
  }

  /**
   * Brings the score in line with the ranch.
   *
   * Idempotent: called on every state change, and does nothing when the layer
   * set has not moved. Layers fade in and out over their own authored times,
   * which is why growth is heard as a swell rather than as an event.
   */
  setScore(input: ScoreInput): void {
    const context = this.context;
    const bus = this.buses.music;
    if (!context || !bus || !this.mixer) return;
    if (gainOf(this.mixer, "music") === 0) {
      this.stopAllLayers();
      return;
    }

    const wanted = new Map(layersFor(input).map((layer: ActiveLayer) => [layer.id, layer.gain]));
    for (const [id, voice] of this.layers) {
      if (wanted.has(id)) continue;
      const now = context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, voice.def.release / 3);
      voice.osc.stop(now + voice.def.release);
      this.layers.delete(id);
    }

    for (const [id, gain] of wanted) {
      const def = LAYERS.find((layer) => layer.id === id);
      if (!def) continue;
      const existing = this.layers.get(id);
      if (existing) {
        existing.gain.gain.setTargetAtTime(gain, context.currentTime, 1.5);
        continue;
      }
      const osc = context.createOscillator();
      const node = context.createGain();
      osc.type = def.waveform;
      osc.frequency.value = hzFor(def.degree, def.octave);
      node.gain.value = 0;
      osc.connect(node);
      node.connect(bus);
      osc.start();
      node.gain.setTargetAtTime(gain, context.currentTime, def.attack / 3);
      this.layers.set(id, { osc, gain: node, def });
    }

    if (this.chordTimer === undefined && typeof window !== "undefined") {
      // The progression moves the layers' pitches rather than restarting
      // anything, so the music never has a seam.
      this.chordTimer = window.setInterval(() => this.retune(), 1000);
      this.retune();
    }
  }

  private retune(): void {
    const context = this.context;
    if (!context) return;
    const chord = chordAt(context.currentTime - this.startedAt);
    let index = 0;
    for (const voice of this.layers.values()) {
      const step = chord[index % chord.length] ?? 0;
      index++;
      voice.osc.frequency.setTargetAtTime(hzFor(voice.def.degree + step, voice.def.octave), context.currentTime, 2.5);
    }
  }

  private stopAllLayers(): void {
    const context = this.context;
    if (!context) return;
    for (const [id, voice] of this.layers) {
      voice.osc.stop(context.currentTime + 0.05);
      this.layers.delete(id);
    }
  }

  /**
   * Plays one creature's call.
   *
   * Additive synthesis from the spec's partials, through a low-pass at the
   * spec's brightness, with the contour applied to the fundamental. The whole
   * graph is torn down when the call ends.
   */
  play(voice: VoiceSpec): void {
    const context = this.context;
    const bus = this.buses.calls;
    if (!context || !bus || !this.mixer || gainOf(this.mixer, "calls") === 0) return;

    const start = context.currentTime + 0.01;
    for (let repeat = 0; repeat < voice.repeats; repeat++) {
      this.playOnce(voice, bus, start + repeat * (voice.duration + voice.gap));
    }
  }

  private playOnce(voice: VoiceSpec, bus: GainNode, at: number): void {
    const context = this.context;
    if (!context) return;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = voice.brightness;
    filter.Q.value = 0.7;

    const envelope = context.createGain();
    envelope.gain.value = 0;
    filter.connect(envelope);
    envelope.connect(bus);

    const { attack, decay, sustain, release } = voice.envelope;
    const hold = Math.max(0.02, voice.duration - attack - decay - release);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(0.9, at + attack);
    envelope.gain.linearRampToValueAtTime(sustain, at + attack + decay);
    envelope.gain.setValueAtTime(sustain, at + attack + decay + hold);
    envelope.gain.linearRampToValueAtTime(0, at + voice.duration);

    const stopAt = at + voice.duration + 0.05;
    const vibrato = context.createOscillator();
    const vibratoGain = context.createGain();
    vibrato.frequency.value = voice.vibrato.rate;
    vibratoGain.gain.value = voice.fundamental * voice.vibrato.depth;
    vibrato.connect(vibratoGain);
    vibrato.start(at);
    vibrato.stop(stopAt);

    for (const partial of voice.partials) {
      if (partial.gain <= 0.001) continue;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      gain.gain.value = partial.gain;
      // The contour is the shape of the call, and it is most of what makes two
      // animals sound like different animals rather than one animal transposed.
      const step = voice.duration / Math.max(1, voice.contour.length - 1);
      osc.frequency.setValueAtTime(voice.fundamental * partial.ratio * (voice.contour[0] ?? 1), at);
      voice.contour.forEach((multiplier, index) => {
        if (index === 0) return;
        osc.frequency.linearRampToValueAtTime(
          voice.fundamental * partial.ratio * multiplier,
          at + step * index,
        );
      });
      vibratoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(at);
      osc.stop(stopAt);
      osc.onended = () => {
        gain.disconnect();
        osc.disconnect();
      };
    }

    if (voice.noise > 0.01) {
      const breath = context.createBufferSource();
      const length = Math.ceil(context.sampleRate * voice.duration);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      // Pink-ish noise: white through a one-pole smoother, which is closer to
      // breath than white and costs one multiply.
      let previous = 0;
      for (let i = 0; i < length; i++) {
        // Presentation only — never the simulation — so an unseeded source is
        // fine here and nowhere else.
        const white = Math.random() * 2 - 1;
        previous = previous * 0.86 + white * 0.14;
        data[i] = previous * 3;
      }
      breath.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = voice.noise * 0.5;
      breath.connect(gain);
      gain.connect(filter);
      breath.start(at);
      breath.stop(stopAt);
      breath.onended = () => {
        gain.disconnect();
        breath.disconnect();
      };
    }

    window.setTimeout(
      () => {
        envelope.disconnect();
        filter.disconnect();
        vibratoGain.disconnect();
      },
      (stopAt - context.currentTime + 0.2) * 1000,
    );
  }

  /** Plays an authored stinger on the effects bus. */
  sting(id: StingerId): void {
    const context = this.context;
    const bus = this.buses.sfx;
    if (!context || !bus || !this.mixer || gainOf(this.mixer, "sfx") === 0) return;

    const stinger = stingerById(id);
    const start = context.currentTime + 0.01;
    for (const note of stinger.notes) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = stinger.waveform;
      osc.frequency.value = hzFor(note.degree, note.octave);
      const at = start + note.at;
      const end = at + note.length + stinger.reverb;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(note.gain, at + RAMP);
      gain.gain.setValueAtTime(note.gain, at + note.length);
      // The "reverb" is a long release rather than a convolution: a tail is what
      // the ear reads as space, and an impulse response would be a file to load.
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(at);
      osc.stop(end + 0.02);
      osc.onended = () => {
        gain.disconnect();
        osc.disconnect();
      };
    }
  }

  /** Tears everything down. Called when the page goes away. */
  dispose(): void {
    if (this.chordTimer !== undefined && typeof window !== "undefined") {
      window.clearInterval(this.chordTimer);
      this.chordTimer = undefined;
    }
    this.stopAllLayers();
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.master = undefined;
    this.buses = {};
  }
}
