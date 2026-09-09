/**
 * The Compendium, allele naming and lineage certificates (§8.2–§8.4).
 *
 * The discipline being defended is the same one the renderer works under: the
 * game does not show the player what they have not earned. A Compendium that
 * listed the whole gene map on day one would hand out the answer to every
 * puzzle in it, and a certificate that printed a genome would be a free Deep
 * Sequencer for whoever it was mailed to.
 */

import { geneMapById, SPECIES } from "@chimaera/genetics";
import { describe, expect, it } from "vitest";
import {
  alleleKey,
  alleleName,
  gateKey,
  canName,
  checkName,
  discoverableAlleles,
  NAME_MAX,
  nameAllele,
  speciesEntries,
  summarise,
} from "../src/compendium.js";
import { certificateFilename, lineageData } from "../src/certificate.js";
import { branchesForSpecies } from "../src/evolution.js";
import { encodeGenome } from "../src/codes.js";
import { applyAction, createRanch, phenotypeOf } from "../src/ranch.js";
import { loadRanch, saveRanch } from "../src/save.js";
import type { Compendium, RanchState } from "../src/types.js";

const EMPTY: Compendium = {
  seenSpecies: [],
  seenAlleles: [],
  seenBranches: [],
  seenEpistasis: [],
  namedAlleles: {},
};

describe("the Compendium", () => {
  it("starts near nothing and counts the whole fen", () => {
    const empty = summarise(EMPTY);
    expect(empty.completion).toBe(0);
    expect(empty.species.total).toBe(SPECIES.length);
    expect(empty.alleles.total).toBeGreaterThan(20);
    expect(empty.branches.total).toBeGreaterThan(20);
    expect(empty.epistasis.total).toBeGreaterThanOrEqual(SPECIES.length);
  });

  it("reaches exactly one hundred percent when everything is found", () => {
    const everything: Compendium = {
      seenSpecies: SPECIES.map((s) => s.id),
      seenAlleles: SPECIES.flatMap((s) =>
        discoverableAlleles(geneMapById(s.id)).map((e) => alleleKey(s.id, e.allele.id)),
      ),
      seenBranches: SPECIES.flatMap((s) => branchesForSpecies(s.id).map((branch) => branch.id)),
      seenEpistasis: SPECIES.flatMap((s) => s.epistasis.map((rule) => gateKey(s.id, rule.id))),
      namedAlleles: {},
    };
    expect(summarise(everything).completion).toBe(1);

    // And a book with three of the four categories filled is not "nearly done".
    // Adult forms are a third of everything there is to find.
    const withoutForms = summarise({ ...everything, seenBranches: [] });
    expect(withoutForms.completion).toBeGreaterThan(0.4);
    expect(withoutForms.completion).toBeLessThan(0.7);
  });

  it("hides what has not been seen, and keeps its slot", () => {
    const entries = speciesEntries(EMPTY);
    expect(entries).toHaveLength(SPECIES.length);
    for (const entry of entries) {
      expect(entry.seen).toBe(false);
      expect(entry.name).toBe("—");
      expect(entry.biome).toBe("—");
      // The slots are there: you can see there is a fourth allele at this
      // locus, and nothing else. The gap is what is being chased.
      expect(entry.alleles.length).toBeGreaterThan(0);
      for (const allele of entry.alleles) expect(allele.name).toBe("—");
      for (const branch of entry.branches) expect(branch.name).toBe("—");
    }
  });

  it("shows a species once it has been met", () => {
    const seen: Compendium = {
      ...EMPTY,
      seenSpecies: ["quillfen"],
      seenAlleles: [alleleKey("quillfen", "D_crown")],
    };
    const quillfen = speciesEntries(seen).find((entry) => entry.id === "quillfen");
    expect(quillfen?.seen).toBe(true);
    expect(quillfen?.name).toBe("Quillfen");
    expect(quillfen?.alleles.find((a) => a.id === "D_crown")?.seen).toBe(true);
    expect(quillfen?.alleles.find((a) => a.id === "H_aurora")?.name).toBe("—");
    // Another species is still blank.
    expect(speciesEntries(seen).find((entry) => entry.id === "siltadder")?.name).toBe("—");
  });

  it("records a species the moment one is standing in the pens", () => {
    const quillfen = createRanch({ seed: "meet", species: "quillfen" });
    const adder = createRanch({ seed: "meet", species: "siltadder" });
    const guest = adder.creatures[0];
    if (!guest) throw new Error("no guest");
    const mixed: RanchState = { ...quillfen, creatures: [...quillfen.creatures, { ...guest, id: "x1" }] };
    expect(mixed.compendium.seenSpecies).not.toContain("siltadder");
    const after = applyAction(mixed, { kind: "advanceDays", days: 1 });
    expect(after.state.compendium.seenSpecies).toContain("siltadder");
    expect(after.state.compendium.seenSpecies).toContain("quillfen");
  });
});

describe("naming a novel allele", () => {
  function withFind(alleleId: string): RanchState {
    const base = createRanch({ seed: "naming", species: "quillfen" });
    return { ...base, compendium: { ...base.compendium, seenAlleles: [alleleId] } };
  }

  const CROWN = alleleKey("quillfen", "D_crown");

  it("is offered only to whoever found it", () => {
    const state = withFind(CROWN);
    expect(canName(state, CROWN)).toBe(true);
    // Not found.
    expect(canName(state, alleleKey("quillfen", "H_aurora"))).toBe(false);
    // Not novel: wild alleles are not discoveries.
    const wild = alleleKey("quillfen", "D");
    expect(canName({ ...state, compendium: { ...state.compendium, seenAlleles: [wild] } }, wild)).toBe(false);
    // Not twice.
    const named = nameAllele(state, CROWN, "Fenlight").state;
    expect(canName(named, CROWN)).toBe(false);
  });

  it("does not credit six species for one discovery", () => {
    // `A_umbral` is the novel affinity allele on every species. A bare id would
    // mark all six found at once.
    const state = withFind(alleleKey("quillfen", "A_umbral"));
    expect(canName(state, alleleKey("quillfen", "A_umbral"))).toBe(true);
    expect(canName(state, alleleKey("siltadder", "A_umbral"))).toBe(false);
    const entries = speciesEntries(state.compendium);
    expect(entries.find((e) => e.id === "quillfen")?.alleles.find((a) => a.id === "A_umbral")?.seen).toBe(true);
    expect(entries.find((e) => e.id === "siltadder")?.alleles.find((a) => a.id === "A_umbral")?.seen).toBe(false);
  });

  it("records the name and the day, so a server can arbitrate later", () => {
    const state = { ...withFind(CROWN), day: 42 };
    const { state: named, error } = nameAllele(state, CROWN, "  Fen  light ");
    expect(error).toBeUndefined();
    expect(named.compendium.namedAlleles[CROWN]).toEqual({ name: "Fen light", discoveredOnDay: 42 });
    expect(alleleName(named.compendium, "quillfen", "D_crown", "Crown ridge")).toBe("Fen light");
    // An unnamed allele keeps its authored name.
    expect(alleleName(named.compendium, "quillfen", "H_aurora", "Aurora")).toBe("Aurora");
  });

  it("refuses the mechanical abuses and says why", () => {
    const cases: [string, RegExp][] = [
      ["", /at least one letter/i],
      ["x".repeat(NAME_MAX + 1), /characters/i],
      ["!!!", /letters, spaces/i],
      ["aaaaa", /mostly one letter/i],
      ["SHOUTING", /capitals/i],
      ["official name", /station said it/i],
      ["🌱", /letters, spaces/i],
    ];
    for (const [name, pattern] of cases) {
      const result = checkName(name);
      expect(result.ok, `"${name}" should be refused`).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(pattern);
    }
  });

  it("accepts names from any script", () => {
    for (const name of ["Fenlight", "Lumière", "Ясень", "こもれび", "O'Hara's blue", "Sea-glass"]) {
      expect(checkName(name).ok, name).toBe(true);
    }
  });

  it("goes through the reducer and reports its own refusals", () => {
    const state = withFind(CROWN);
    const good = applyAction(state, { kind: "nameAllele", allele: CROWN, name: "Fenlight" });
    expect(good.state.compendium.namedAlleles[CROWN]?.name).toBe("Fenlight");
    expect(good.events[0]).toMatchObject({ kind: "discovery" });

    const bad = applyAction(state, { kind: "nameAllele", allele: CROWN, name: "!!!" });
    expect(bad.events[0]).toMatchObject({ kind: "blocked" });
    expect(bad.state.compendium.namedAlleles[CROWN]).toBeUndefined();
  });
});

describe("lineage certificates", () => {
  function bredRanch(): RanchState {
    let state = createRanch({ seed: "cert", species: "quillfen", startingItems: { "assay-bench": 2 } });
    for (let round = 0; round < 4; round++) {
      const sire = state.creatures.find((c) => c.sex === "male" && c.stage === "adult" && c.status === "active");
      const dams = state.creatures.filter((c) => c.sex === "female" && c.stage === "adult" && c.status === "active");
      const dam = dams[round % Math.max(1, dams.length)];
      if (sire && dam) state = applyAction(state, { kind: "breed", sireId: sire.id, damId: dam.id }).state;
      state = applyAction(state, { kind: "advanceDays", days: 26 }).state;
    }
    return state;
  }

  it("carries observations and the loci that were paid for", () => {
    let state = bredRanch();
    const subject = [...state.creatures].reverse().find((c) => c.sireId && c.stage !== "egg");
    if (!subject) throw new Error("nothing bred");

    const before = lineageData(state, subject.id, phenotypeOf);
    expect(before?.readLoci).toEqual([]);

    state = applyAction(state, { kind: "useItem", id: subject.id, item: "assay-bench" }).state;
    const after = lineageData(state, subject.id, phenotypeOf);
    expect(after?.readLoci.length).toBeGreaterThan(0);
    // Coat and form only: the bench says nothing about stat loci (§1.3).
    expect(after?.readLoci.length).toBeLessThan(geneMapById("quillfen").loci.length);
    expect(after?.ancestors.length).toBeGreaterThan(0);
    expect(after?.stats.length).toBe(geneMapById("quillfen").polygenicTraits.length);
    expect(after?.code).toBe(encodeGenome(subject.genome));
  });

  it("walks four generations of pedigree, sire-first", () => {
    const state = bredRanch();
    const subject = [...state.creatures].reverse().find((c) => c.sireId && c.damId);
    if (!subject) throw new Error("nothing bred");
    const data = lineageData(state, subject.id, phenotypeOf);
    const paths = new Set(data?.ancestors.map((a) => a.path));
    expect(paths.has("s")).toBe(true);
    expect(paths.has("d")).toBe(true);
    for (const path of paths) {
      expect(path.length).toBeGreaterThan(0);
      expect(path.length).toBeLessThanOrEqual(4);
      expect(/^[sd]+$/.test(path)).toBe(true);
    }
  });

  it("uses the discoverer's name for a novel allele", () => {
    let state = bredRanch();
    const subject = state.creatures.find((c) => c.stage !== "egg");
    if (!subject) throw new Error("no creature");
    state = applyAction(state, { kind: "useItem", id: subject.id, item: "assay-bench" }).state;
    state = {
      ...state,
      compendium: {
        ...state.compendium,
        seenAlleles: [alleleKey("quillfen", "D")],
        namedAlleles: { [alleleKey("quillfen", "D")]: { name: "Fenlight", discoveredOnDay: 3 } },
      },
    };
    const data = lineageData(state, subject.id, phenotypeOf);
    const dorsal = data?.readLoci.find((entry) => entry.locus === "Dorsal ridge");
    if (dorsal?.genotype.includes("Quilled") === true) {
      throw new Error("the authored name is still being used over the discoverer's");
    }
  });

  it("names a file someone will recognise a year later", () => {
    const state = bredRanch();
    const subject = state.creatures[0];
    if (!subject) throw new Error("no creature");
    const data = lineageData(state, subject.id, phenotypeOf);
    if (!data) throw new Error("no data");
    const filename = certificateFilename(data);
    expect(filename).toMatch(/^verdance-[a-z0-9-]+-day\d+\.svg$/);
    expect(filename.length).toBeLessThan(64);
  });

  it("returns nothing for a creature that was never here", () => {
    expect(lineageData(bredRanch(), "nobody", phenotypeOf)).toBeUndefined();
  });
});

describe("save migration to v5", () => {
  it("qualifies bare allele and gate ids by the species the player has met", () => {
    const state = createRanch({ seed: "v5", species: "quillfen" });
    const legacy = JSON.parse(JSON.stringify(saveRanch(state))) as {
      version: number;
      state: { compendium: { seenSpecies: string[]; seenAlleles: string[]; seenEpistasis: string[] } };
    };
    legacy.version = 4;
    legacy.state.compendium.seenSpecies = ["quillfen"];
    legacy.state.compendium.seenAlleles = ["D_crown", "A_umbral"];
    legacy.state.compendium.seenEpistasis = ["albinism"];

    const loaded = loadRanch(legacy);
    expect(loaded.compendium.seenAlleles).toContain(alleleKey("quillfen", "D_crown"));
    expect(loaded.compendium.seenAlleles).toContain(alleleKey("quillfen", "A_umbral"));
    // Never credits a species the player has not met, even though every
    // species has an `A_umbral`.
    expect(loaded.compendium.seenAlleles).not.toContain(alleleKey("siltadder", "A_umbral"));
    expect(loaded.compendium.seenEpistasis).toEqual([gateKey("quillfen", "albinism")]);
  });

  it("leaves an already-qualified save alone", () => {
    const state = createRanch({ seed: "v5b", species: "quillfen" });
    const qualified: RanchState = {
      ...state,
      compendium: { ...state.compendium, seenAlleles: [alleleKey("quillfen", "D_crown")] },
    };
    expect(loadRanch(saveRanch(qualified)).compendium.seenAlleles).toEqual([
      alleleKey("quillfen", "D_crown"),
    ]);
  });
});
