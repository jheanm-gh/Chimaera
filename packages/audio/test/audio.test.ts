/**
 * Voices, the adaptive score and the mixer (§7).
 *
 * The claim worth testing is not "it makes a noise" — nothing in this package
 * makes a noise. It is that a voice is a *phenotype*: reproducible from the
 * same animal forever, audibly different between two animals a player would
 * expect to sound different, and carrying no information the picture does not
 * already carry.
 */

import {
  createRng,
  expressPhenotype,
  geneMapById,
  geneMapFor,
  genomeFromSpec,
  QUILLFEN,
  randomWildGenome,
  SPECIES,
} from "@chimaera/genetics";
import type { Phenotype } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import {
  BUSES,
  battleTempo,
  chordAt,
  CHORD_SECONDS,
  DEFAULT_MIXER,
  gainOf,
  hzFor,
  isSilent,
  LAYERS,
  layersFor,
  PROGRESSION,
  setLevel,
  setMuted,
  STINGERS,
  stingerById,
  voiceDistance,
  voiceFingerprint,
  voiceFor,
} from "../src/index.js";
import type { ScoreInput } from "../src/index.js";

const map = geneMapFor(QUILLFEN);

function wild(seed: string): Phenotype {
  return expressPhenotype(randomWildGenome(map, createRng(seed)), map);
}

describe("a voice is a phenotype", () => {
  it("is the same animal's voice every time", () => {
    const phenotype = wild("same");
    expect(voiceFor(phenotype, map)).toEqual(voiceFor(phenotype, map));
  });

  it("is identical for two animals a player cannot tell apart", () => {
    // Same appearance, different genotype: homozygous dominant and
    // heterozygous at a plain dominance locus.
    const homozygous = expressPhenotype(genomeFromSpec(map, "female", { LIMB: ["Lp", "Lp"] }), map);
    const heterozygous = expressPhenotype(genomeFromSpec(map, "female", { LIMB: ["Lp", "Ls"] }), map);
    expect(voiceFingerprint(heterozygous)).toBe(voiceFingerprint(homozygous));
    expect(voiceFor(heterozygous, map)).toEqual(voiceFor(homozygous, map));
  });

  it("puts a big animal below a small one, by a long way", () => {
    const heavy = expressPhenotype(
      genomeFromSpec(map, "female", {
        BUILD: ["Bh", "Bh"],
        VIG_A: ["VA2", "VA2"],
        VIG_B: ["VB2", "VB2"],
        VIG_C: ["VC2", "VC2"],
      }),
      map,
    );
    const slight = expressPhenotype(
      genomeFromSpec(map, "female", {
        BUILD: ["Bs", "Bs"],
        VIG_A: ["VA0", "VA0"],
        VIG_B: ["VB0", "VB0"],
        VIG_C: ["VC0", "VC0"],
      }),
      map,
    );
    const low = voiceFor(heavy, map).fundamental;
    const high = voiceFor(slight, map).fundamental;
    expect(low).toBeLessThan(high);
    // At least two octaves across the range, or nobody hears it.
    expect(Math.log2(high / low)).toBeGreaterThan(2);
    // And still inside what a small speaker reproduces.
    for (const hz of [low, high]) {
      expect(hz).toBeGreaterThan(60);
      expect(hz).toBeLessThan(1400);
    }
  });

  it("is audibly different across a species' own range", () => {
    // The mapping has to be a channel, not decoration: two animals from
    // opposite ends of the same species must not sound alike.
    for (const species of SPECIES) {
      const speciesMap = geneMapById(species.id);
      const rng = createRng(`voices:${species.id}`);
      const voices = Array.from({ length: 40 }, () =>
        voiceFor(expressPhenotype(randomWildGenome(speciesMap, rng), speciesMap), speciesMap),
      );
      let widest = 0;
      for (let i = 0; i < voices.length; i++) {
        for (let j = i + 1; j < voices.length; j++) {
          const a = voices[i];
          const b = voices[j];
          if (a && b) widest = Math.max(widest, voiceDistance(a, b));
        }
      }
      expect(widest, `${species.name} widest voice difference`).toBeGreaterThan(0.15);
    }
  });

  it("keeps every number finite and sane, for every species", () => {
    for (const species of SPECIES) {
      const speciesMap = geneMapById(species.id);
      const rng = createRng(`sane:${species.id}`);
      for (let i = 0; i < 40; i++) {
        const voice = voiceFor(expressPhenotype(randomWildGenome(speciesMap, rng), speciesMap), speciesMap);
        expect(Number.isFinite(voice.fundamental)).toBe(true);
        expect(voice.duration).toBeGreaterThan(0.1);
        expect(voice.duration).toBeLessThan(2);
        expect(voice.noise).toBeGreaterThanOrEqual(0);
        expect(voice.noise).toBeLessThanOrEqual(1);
        expect(voice.brightness).toBeGreaterThan(400);
        expect(voice.repeats).toBeGreaterThanOrEqual(1);
        expect(voice.envelope.attack).toBeGreaterThan(0);
        for (const partial of voice.partials) {
          expect(Number.isFinite(partial.ratio)).toBe(true);
          expect(partial.gain).toBeGreaterThanOrEqual(0);
        }
        for (const step of voice.contour) {
          expect(step).toBeGreaterThan(0.5);
          expect(step).toBeLessThan(2);
        }
      }
    }
  });

  it("sounds hollow when a gate is shut, which the picture already shows", () => {
    const plain = expressPhenotype(genomeFromSpec(map, "female", { PIG: ["P", "P"] }), map);
    const albino = expressPhenotype(genomeFromSpec(map, "female", { PIG: ["p", "p"] }), map);
    expect(albino.epistasisActive).toContain("albinism");
    expect(voiceFor(albino, map).noise).toBeGreaterThan(voiceFor(plain, map).noise);
  });
});

describe("the adaptive score", () => {
  const bare: ScoreInput = {
    herd: 0,
    species: 1,
    generations: 0,
    chaptersDone: 0,
    novelAlleles: 0,
    completion: 0,
  };

  it("always has the room, and nothing else on day one", () => {
    const layers = layersFor(bare);
    expect(layers.map((layer) => layer.id)).toEqual(["drone"]);
  });

  it("thickens as the ranch grows, and never thins", () => {
    const steps: ScoreInput[] = [
      bare,
      { ...bare, herd: 6 },
      { ...bare, herd: 12, species: 2 },
      { ...bare, herd: 12, species: 2, generations: 4 },
      { ...bare, herd: 20, species: 3, generations: 6, novelAlleles: 1 },
      { ...bare, herd: 24, species: 5, generations: 9, novelAlleles: 2, chaptersDone: 6 },
      { herd: 24, species: 6, generations: 12, novelAlleles: 6, chaptersDone: 8, completion: 1 },
    ];
    let previous = -1;
    for (const step of steps) {
      const count = layersFor(step).length;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    expect(layersFor(steps[steps.length - 1] as ScoreInput)).toHaveLength(LAYERS.length);
  });

  it("swells rather than switching on", () => {
    // Partway through a band the layer is present and quiet. A layer that
    // snapped in would announce itself, which is the one thing this must not do.
    const partial = layersFor({ ...bare, herd: 6 }).find((layer) => layer.id === "pulse");
    const full = layersFor({ ...bare, herd: 40 }).find((layer) => layer.id === "pulse");
    expect(partial).toBeDefined();
    expect(full).toBeDefined();
    expect(partial?.gain ?? 0).toBeGreaterThan(0);
    expect(partial?.gain ?? 0).toBeLessThan(full?.gain ?? 1);
  });

  it("gives every layer a distinct voice and a stated reason", () => {
    expect(new Set(LAYERS.map((layer) => layer.id)).size).toBe(LAYERS.length);
    for (const layer of LAYERS) {
      expect(layer.reason.length).toBeGreaterThan(8);
      expect(layer.gain).toBeGreaterThan(0);
      expect(layer.attack).toBeGreaterThan(1);
    }
  });

  it("cycles four chords slowly enough not to turn over inside one decision", () => {
    expect(CHORD_SECONDS).toBeGreaterThanOrEqual(12);
    expect(chordAt(0)).toEqual(PROGRESSION[0]);
    expect(chordAt(CHORD_SECONDS - 0.01)).toEqual(PROGRESSION[0]);
    expect(chordAt(CHORD_SECONDS)).toEqual(PROGRESSION[1]);
    expect(chordAt(CHORD_SECONDS * PROGRESSION.length)).toEqual(PROGRESSION[0]);
    // Equal temperament, and an octave is an octave.
    expect(hzFor(12, 0) / hzFor(0, 0)).toBeCloseTo(2, 9);
    expect(hzFor(0, 1) / hzFor(0, 0)).toBeCloseTo(2, 9);
  });
});

describe("battle tempo", () => {
  it("rises as the field empties, whoever is losing", () => {
    const start = battleTempo({ totalHp: 100, startingHp: 100 });
    const middle = battleTempo({ totalHp: 50, startingHp: 100 });
    const end = battleTempo({ totalHp: 8, startingHp: 100 });
    expect(middle).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(middle);
    // A tempo nobody can play to is a tempo nobody notices.
    expect(start).toBeGreaterThan(80);
    expect(end).toBeLessThan(180);
    expect(Number.isInteger(end)).toBe(true);
  });

  it("survives a fight that has not started", () => {
    expect(Number.isFinite(battleTempo({ totalHp: 0, startingHp: 0 }))).toBe(true);
  });
});

describe("stingers", () => {
  it("gives the mutation discovery the sound worth chasing", () => {
    const novel = stingerById("novel");
    const others = STINGERS.filter((stinger) => stinger.id !== "novel");
    const top = (id: (typeof STINGERS)[number]) =>
      Math.max(...id.notes.map((note) => note.degree + note.octave * 12));
    // The only figure that climbs, and the one that climbs highest.
    for (const other of others) expect(top(novel)).toBeGreaterThan(top(other));
    const degrees = novel.notes.map((note) => note.degree + note.octave * 12);
    for (let i = 1; i < degrees.length; i++) {
      expect(degrees[i] ?? 0).toBeGreaterThan(degrees[i - 1] ?? 0);
    }
  });

  it("keeps every stinger short and in time", () => {
    for (const stinger of STINGERS) {
      expect(stinger.notes.length).toBeGreaterThan(0);
      const end = Math.max(...stinger.notes.map((note) => note.at + note.length));
      expect(end, stinger.id).toBeLessThan(2);
      for (const note of stinger.notes) {
        expect(note.at).toBeGreaterThanOrEqual(0);
        expect(note.gain).toBeGreaterThan(0);
        expect(note.gain).toBeLessThanOrEqual(0.6);
      }
    }
    expect(new Set(STINGERS.map((stinger) => stinger.id)).size).toBe(STINGERS.length);
    expect(() => stingerById("nope" as never)).toThrow(/unknown stinger/);
  });
});

describe("the mixer", () => {
  it("plays nothing until the player has touched something", () => {
    expect(DEFAULT_MIXER.started).toBe(false);
    for (const bus of BUSES) expect(gainOf(DEFAULT_MIXER, bus.id)).toBe(0);
    const started = { ...DEFAULT_MIXER, started: true };
    for (const bus of BUSES) expect(gainOf(started, bus.id)).toBeGreaterThan(0);
  });

  it("separates the three buses", () => {
    const started = { ...DEFAULT_MIXER, started: true };
    const quiet = setMuted(started, "calls", true);
    expect(gainOf(quiet, "calls")).toBe(0);
    expect(gainOf(quiet, "music")).toBeGreaterThan(0);
    expect(gainOf(quiet, "sfx")).toBeGreaterThan(0);
  });

  it("makes the master mean master", () => {
    const started = { ...DEFAULT_MIXER, started: true };
    expect(isSilent(setMuted(started, "master", true))).toBe(true);
    expect(isSilent(setLevel(started, "master", 0))).toBe(true);
    expect(isSilent(started)).toBe(false);
  });

  it("clamps a level rather than trusting a slider", () => {
    const started = { ...DEFAULT_MIXER, started: true };
    expect(gainOf(setLevel(started, "music", 9), "music")).toBeLessThanOrEqual(1);
    expect(gainOf(setLevel(started, "music", -3), "music")).toBe(0);
  });
});
