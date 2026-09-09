const fs = require("node:fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, PageBreak,
  LevelFormat, convertInchesToTwip,
} = require("docx");

const W = 9360;                       // Letter, 1" margins
const INK = "1F2318", DIM = "5A6152", ACC = "9C3A1E", LINE = "C9CDBF", HEAD = "E8EAE0";

const P = (text, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 140, before: o.before ?? 0, line: 276 },
  alignment: o.align,
  indent: o.indent,
  border: o.border,
  children: (Array.isArray(text) ? text : [text]).map((t) =>
    typeof t === "string"
      ? new TextRun({ text: t, size: o.size ?? 21, color: o.color ?? INK, font: o.font ?? "Calibri", italics: o.italics, bold: o.bold })
      : t),
});

const B = (t, o = {}) => new TextRun({ text: t, bold: true, size: o.size ?? 21, color: o.color ?? INK, font: "Calibri" });
const T = (t, o = {}) => new TextRun({ text: t, size: o.size ?? 21, color: o.color ?? INK, font: o.font ?? "Calibri", italics: o.italics });
const M = (t) => new TextRun({ text: t, size: 19, font: "Consolas", color: DIM });

const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 380, after: 160 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 260, after: 110 } });

// Contents entries, written out rather than a field: a TOC field renders blank
// until the reader updates it, which most never do.
const TOC1 = (t) => new Paragraph({ spacing: { after: 60, line: 276 }, children: [new TextRun({ text: t, size: 21, bold: true, color: INK, font: "Calibri" })] });
const TOC2 = (t) => new Paragraph({ spacing: { after: 60, line: 276 }, indent: { left: 300 }, children: [new TextRun({ text: t, size: 20, color: DIM, font: "Calibri" })] });

const LI = (children) => new Paragraph({
  numbering: { reference: "dots", level: 0 },
  spacing: { after: 90, line: 276 },
  children: (Array.isArray(children) ? children : [children]).map((t) => (typeof t === "string" ? T(t) : t)),
});

// A quoted request: indented, tinted, with a rule down the left.
const QUOTE = (t) => new Paragraph({
  spacing: { before: 60, after: 110, line: 276 },
  indent: { left: 340 },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACC, space: 12 } },
  children: [new TextRun({ text: t, size: 21, color: INK, font: "Calibri", italics: true })],
});

const cell = (children, width, o = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  shading: o.head ? { type: ShadingType.CLEAR, fill: HEAD, color: "auto" } : undefined,
  margins: { top: 90, bottom: 90, left: 130, right: 130 },
  children: (Array.isArray(children) ? children : [children]).map((c) =>
    typeof c === "string"
      ? new Paragraph({ spacing: { after: 0, line: 250 }, alignment: o.align,
          children: [new TextRun({ text: c, size: 19, bold: o.head || o.bold, color: o.head ? INK : (o.color ?? INK), font: o.font ?? "Calibri" })] })
      : c),
});

const table = (widths, rows) => new Table({
  columnWidths: widths,
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  },
  rows: rows.map((cells, r) => new TableRow({
    tableHeader: r === 0,
    children: cells.map((c, i) => {
      const spec = typeof c === "object" && !Array.isArray(c) && c.text !== undefined ? c : { text: c };
      return cell(spec.text, widths[i], { head: r === 0, align: spec.align, bold: spec.bold, color: spec.color, font: spec.font });
    }),
  })),
});

const SPACER = () => new Paragraph({ spacing: { after: 160 }, children: [] });

// --- the request log -------------------------------------------------------
const REQUESTS = [
  ["01", "See the master prompt attached and start building.",
   [B("Nine phases built against the design bible: "), T("genetics core, renderer, core loop, combat and expeditions, six species and the campaign, the game modes, then polish — audio, Compendium, genome codes, accessibility.")],
   "Phases 1–7 shipped · 11 commits"],
  ["02", "Ensure you do proper quality control after each stage gate.",
   [T("Became the standing process, replacing the brief's own “confirm each phase with me”. It caught, among others: four unsolvable Breeding Trials, seven trials solvable without breeding at all, a Daily Genome solvable 1 time in 60, a QR encoder whose generator polynomial was built backwards, and a specimen label that ran off the paper on a fifth of all creatures.")],
   "Standing instruction"],
  ["03", "If the build has been committed, let me test the app.",
   [T("The build was on a container you cannot reach, so the app was folded into a "), B("single self-contained HTML file"), T(" and published. Both Web Workers are inlined as blobs; the whole game is one 643 KB page with no server.")],
   "Live link · standalone build"],
  ["04", "Give me a desktop shortcut.",
   [T("Shortcut files for Windows, macOS and Linux. "), B("I sent them wrong"), T(" — as chat attachments, which download rather than open — and corrected it with the browser's own “create shortcut” route, which gets the icon and window behaviour right.")],
   "Delivered · corrected after your feedback"],
  ["05", "Commit it.",
   [T("The standalone bundler became "), M("npm run build:standalone"), T(". Making it committable exposed a real bug: Export and the lineage certificate clicked a detached download anchor, which a sandboxed host does not refuse — it silently ignores. The app now looks for a host bridge and falls back to the anchor.")],
   "cf6a897"],
  ["06", "The game is super boring and not intuitive at all… give the app the look and feel of Pokerogue and similar games.",
   [B("First major redirection. "), T("The field-journal art direction the brief specified was coherent and was not a game. Creatures became 96×96 procedural pixel sprites, a real battle scene replaced the text combat readout, and a next-objective banner answered “no direction given”.")],
   "Redirection · Phase 8"],
  ["07", "Something more along the lines of Spore in mind, but in pixel art format.",
   [T("A better fit than Pokémon, because this game's creatures genuinely are assembled from parts. Steered the sprite work toward modular anatomy and expressive faces — which is where the eye and brow work came from.")],
   "Direction set"],
  ["08", "Instead of the typical stats (ATK, DEF, SP ATK…), have physical traits determine the power and effectiveness of moves… Think this through thoroughly.",
   [B("Second major redirection, and the best idea in the project. "), T("Abstract stats were deleted outright. Combat now reads measurements — mass in kilograms, tusks in centimetres, hide in millimetres and what it is made of. The genome already held all of it and was throwing it away.")],
   "Redirection · Phase 9"],
  ["09", "Pause the mechanics… reduce to 8 traits… redo your designs, rate them 1–10, and redo until you can confidently report at least 7.5.",
   [T("Thirteen measurements cut to eight, each one gating a move and visible in the sprite. Sprites rated against a written eight-criterion rubric: "), B("4.4 → 7.8"), T(". Mechanics work paused as instructed.")],
   "8 traits · 7.8 / 10"],
  ["10", "Address real pixel windows, a move menu, a message box… Would it be worthwhile to give me the basic designs so another LLM can render it?",
   [T("Pixel window system, bevelled buttons, pixel type, and a battle message box that narrates from the same script the canvas plays. On the handoff: "), B("yes, but not for shipping sprites"), T(" — an image model makes pictures and this game needs a generator. Three ranked handoffs specced instead.")],
   "UI shell · handoff spec"],
  ["11", "Use this link… Make body parts modular, but not necessarily scalable (dimensions and weights can be stated only).",
   [B("Third redirection, and it unlocked the art pipeline. "), T("Geometry no longer scales continuously; every slot resolves to a named variant. The link itself I could not open — the container's network policy denies Google outright.")],
   "Redirection · modular parts · link blocked"],
  ["12", "Commit. / Give me a project summary document.",
   [T("Nothing was outstanding — the modular parts work had already gone in at "), M("2ad1e4d"), T(". This document is the second half.")],
   "This document"],
];

const doc = new Document({
  creator: "Verdance",
  title: "Verdance Project Record",
  description: "Complete record of scope, requests, build and open questions",
  numbering: {
    config: [{
      reference: "dots",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 200 } } } }],
    }],
  },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 21, color: INK } },
      heading1: { run: { font: "Calibri", size: 30, bold: true, color: INK },
        paragraph: { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACC, space: 6 } } } },
      heading2: { run: { font: "Calibri", size: 24, bold: true, color: INK } },
      heading3: { run: { font: "Calibri", size: 21, bold: true, color: DIM } },
    },
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
    },
    children: [
      // --- cover ---------------------------------------------------------
      P([new TextRun({ text: "VERDANCE · PROJECT RECORD", size: 18, bold: true, color: ACC, font: "Calibri", characterSpacing: 40 })], { after: 260, before: 800 }),
      new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "A genetics-first creature breeding game", size: 46, bold: true, color: INK, font: "Calibri" })] }),
      P([T("Everything scoped, built, amended and asked for, in one place. Built from a design bible over nine phases, then substantially redirected three times. Both the original scope and every redirection are recorded here, including the things that went wrong.", { size: 23, color: DIM })], { after: 300 }),
      P([M("9 September 2026   ·   branch claude/chimaera-project-setup-3ok5lg   ·   head 2ad1e4d")], { after: 340 }),

      table([2600, 6760], [
        ["Item", "Where"],
        ["Playable build", { text: "claude.ai/code/artifact/7b7867a6-b69e-4171-aa85-c816e705c5f4", font: "Consolas" }],
        ["Art handoff spec", { text: "claude.ai/code/artifact/81252fd6-b9a4-4934-a153-0406b4be1a7e", font: "Consolas" }],
        ["Mechanic proposal", { text: "claude.ai/code/artifact/79fa8bf1-6361-46d8-9782-b5730528a9f2", font: "Consolas" }],
        ["Repository", { text: "github.com/jheanm-gh/Chimaera", font: "Consolas" }],
      ]),

      new Paragraph({ children: [new PageBreak()] }),
      P([B("Contents", { size: 26 })], { after: 200 }),
      TOC1("Where it stands"),
      TOC1("The original scope"),
      TOC1("Every request you made"),
      TOC1("The system as built"),
      TOC1("How a creature works now"),
      TOC2("The eight measurements"),
      TOC2("Hide replaces the type chart"),
      TOC1("The art pipeline"),
      TOC1("Content and modes"),
      TOC1("What went wrong, and how it was caught"),
      TOC2("Caught by measuring"),
      TOC2("Caught by looking at a screenshot"),
      TOC2("Two bugs from the same mistake at different depths"),
      TOC2("Mistakes in the process"),
      TOC1("Still open"),
      TOC2("Waiting on you"),
      TOC2("Known gaps"),
      TOC1("Running it"),
      new Paragraph({ children: [new PageBreak()] }),

      // --- where it stands ------------------------------------------------
      H1("Where it stands"),
      table([3200, 1700, 4460], [
        ["Measure", "Value", "Note"],
        ["Lines of code", { text: "33,900", align: AlignmentType.RIGHT }, "Across five packages, excluding tests"],
        ["Tests", { text: "666", align: AlignmentType.RIGHT }, "All passing; 157 suites"],
        ["Commits", { text: "21", align: AlignmentType.RIGHT }, "One at every phase boundary"],
        ["Decisions logged", { text: "101", align: AlignmentType.RIGHT }, "With the argument against each"],
        ["Species", { text: "6", align: AlignmentType.RIGHT }, "Each passing a 32×32 silhouette test"],
        ["Moves", { text: "15", align: AlignmentType.RIGHT }, "Every one gated by anatomy"],
        ["Sprite rating", { text: "7.8 / 10", align: AlignmentType.RIGHT }, "Self-rated against fangame art, from 4.4"],
      ]),
      SPACER(),
      P([T("Working tree clean, gate green: "), M("tsc -b"), T(", "), M("eslint ."), T(", "), M("vitest run"), T(". No pull request opened — none was asked for.")]),

      // --- scope -----------------------------------------------------------
      H1("The original scope"),
      P([T("The brief was a design bible with one governing rule, which every decision since has been tested against:")]),
      QUOTE("If a feature does not create pressure on the breeding decision, it does not ship."),
      P([T("Its binding constraints, all of which were met:")]),
      LI([B("Genetics engine first"), T(" — pure TypeScript, zero UI dependencies, deterministic seeded RNG, and no Math.random anywhere in the simulation. Enforced by a lint rule, not by discipline.")]),
      LI([B("Testing non-negotiable"), T(" — Mendelian ratios, linkage, lethals and inbreeding asserted against theory, not eyeballed.")]),
      LI([B("Life stages, four raising axes, branching evolution"), T(" — diet, habitat, training and held item, each pulling a lineage somewhere different.")]),
      LI([B("Combat as a fitness function"), T(" — equipment capped at 20% of effective power, hard-capped in code and asserted by a test that sweeps every loadout.")]),
      LI([B("Eight campaign chapters"), T(", each teaching exactly one genetic concept, on a conservation-and-restoration theme.")]),
      LI([B("Six species"), T(", each passing a silhouette test in pure black at 32×32.")]),
      LI([B("TypeScript strict, versioned saves, 500 creatures with no frame drops"), T(", virtualised lists, a Web Worker, colourblind-safe palettes, keyboard navigation.")]),
      LI([B("A decisions log"), T(", a commit at every phase boundary, and an instruction to push back when something is wrong.")]),
      P([T("You then made one amendment to the process itself, which shaped everything after it: "), T("“When you are done with phase 1, proceed with the rest of the game/project but ensure you do proper quality control after each stage gate.”", { italics: true }), T(" That replaced the brief's own “confirm each phase with me”, and the quality-control passes it mandated are where a large share of the defects below were caught.")]),

      // --- request log ------------------------------------------------------
      H1("Every request you made"),
      P([T("In order, with what each one actually changed. Three redirected the project substantially.", { color: DIM })]),
      ...REQUESTS.flatMap(([n, said, did, tags]) => [
        new Paragraph({ spacing: { before: 240, after: 40 }, children: [new TextRun({ text: n, size: 19, bold: true, color: ACC, font: "Consolas" })] }),
        QUOTE(said),
        P(did, { after: 60 }),
        P([new TextRun({ text: tags, size: 17, color: DIM, font: "Consolas" })], { after: 60 }),
      ]),

      // --- system ------------------------------------------------------------
      H1("The system as built"),
      P([T("A five-package monorepo with the dependency direction enforced by lint, not convention. Genetics knows nothing about rendering, saves or gameplay.")]),
      table([1500, 1100, 1100, 5660], [
        ["Package", "Source", "Tests", "What it owns"],
        ["genetics", { text: "5,463", align: AlignmentType.RIGHT }, { text: "1,842", align: AlignmentType.RIGHT }, "Meiosis, linkage, epistasis, lethals, mutation, inbreeding, and the eight morphometrics. Runs headless."],
        ["rendering", { text: "4,891", align: AlignmentType.RIGHT }, { text: "1,575", align: AlignmentType.RIGHT }, "Pixel sprites, part resolution, shading, PNG encoder, QR encoder, lineage certificates, silhouette test."],
        ["game", { text: "9,062", align: AlignmentType.RIGHT }, { text: "4,214", align: AlignmentType.RIGHT }, "The pure reducer. Breeding, raising, combat, moves, campaign, modes, saves. State is the save file."],
        ["audio", { text: "595", align: AlignmentType.RIGHT }, { text: "294", align: AlignmentType.RIGHT }, "Genome-driven vocalisations and an adaptive layered score, both as pure data."],
        ["ui", { text: "4,692", align: AlignmentType.RIGHT }, { text: "—", align: AlignmentType.RIGHT }, "React. Computes no game rules. Verified in a real browser rather than by unit test."],
      ]),

      H1("How a creature works now"),
      P([T("The chain runs one way and never doubles back: "), B("genome → phenotype → measurements → moves"), T(", with the sprite reading the phenotype and never the genome. That last rule is why the picture cannot leak a genotype the player has not earned through an assay.")]),
      H2("The eight measurements"),
      table([1700, 1500, 6160], [
        ["Measure", "Unit", "What it decides"],
        ["Mass", "kg", "Impact behind every blunt move; resistance to being moved"],
        ["Length", "cm", "Reach — and for a limbless animal, what it has instead of limbs"],
        ["Limbs", "0 / 2 / 4", "Gates trampling and pinning at one end, constricting at the other"],
        ["Stride", "cm", "Closing speed, striking order, and getting out of the way"],
        ["Hide", "mm + kind", "Depth and material. The single biggest defensive number"],
        ["Armament", "cm + kind", "Tusks, horn, spines, beak, fangs, crest — or nothing at all"],
        ["Tail", "cm + shape", "A whip lashes, a fan balances, a stub does neither"],
        ["Acuity", "0–100", "Sight and hearing together: landing a strike, and seeing one coming"],
      ]),
      SPACER(),
      P([T("Every one gates at least one move and has something the sprite draws. A measurement the player cannot see is a stat with a physical name.", { color: DIM })]),
      H2("Hide replaces the type chart"),
      P([T("Five integuments, four ways to hurt something — and unlike a type chart, it is guessable without reading it. Plate turns a point; slime defeats a grip; bare skin argues with nothing.")]),
      table([4680, 4680], [
        ["Matchup", "Multiplier"],
        ["Plate against a piercing move", { text: "×0.55", align: AlignmentType.RIGHT }],
        ["Slime against a grip", { text: "×0.50", align: AlignmentType.RIGHT }],
        ["Fur against a blunt strike", { text: "×0.85", align: AlignmentType.RIGHT }],
        ["Scale against a piercing move", { text: "×0.85", align: AlignmentType.RIGHT }],
        ["Bare skin against a toxin", { text: "×1.45", align: AlignmentType.RIGHT }],
      ]),
      SPACER(),
      P([T("Moves are "), B("gated by anatomy, not scaled by it"), T(". A creature with no tusks cannot Gore — not “gores weakly”, cannot. A limbless one cannot Trample and does not want to: it has 183 cm of body and Constrict instead. Breeding changes the moveset, and the epistasis that hides a crest now takes the spines with it, so you can see what you lost.")]),

      // --- art ---------------------------------------------------------------
      H1("The art pipeline"),
      P([T("Every creature is drawn procedurally from its genotype — nothing licensed, nothing hand-drawn — which is the only way 500 creatures each get their own sprite. Rated against PokéRogue, Infinite Fusion and RPGMaker fangame art on eight criteria.")]),
      table([2100, 950, 950, 5360], [
        ["Criterion", "First", "Now", "What changed it"],
        ["Silhouette", { text: "6", align: AlignmentType.RIGHT }, { text: "7.5", align: AlignmentType.RIGHT }, "Arms on upright species, drawn armament, coiled serpent"],
        ["Form / volume", { text: "4", align: AlignmentType.RIGHT }, { text: "8", align: AlignmentType.RIGHT }, "Key light plus a ground bounce; counter-shaded belly"],
        ["Outline craft", { text: "3", align: AlignmentType.RIGHT }, { text: "7.5", align: AlignmentType.RIGHT }, "Two contour colours chosen per pixel from the light behind them"],
        ["Colour", { text: "5", align: AlignmentType.RIGHT }, { text: "8", align: AlignmentType.RIGHT }, "Nine-step ramp with hue rotation — cool shadows, warm highlights"],
        ["Texture", { text: "2", align: AlignmentType.RIGHT }, { text: "7.5", align: AlignmentType.RIGHT }, "Plate bands, scale lattice, fur strokes, slime speculars, dithered bands"],
        ["Face", { text: "5", align: AlignmentType.RIGHT }, { text: "8", align: AlignmentType.RIGHT }, "Brow, sclera, pupil, catchlight, nostril, turned mouth"],
        ["Part separation", { text: "3", align: AlignmentType.RIGHT }, { text: "8", align: AlignmentType.RIGHT }, "Occlusion at every seam, read from the part map"],
        ["Species identity", { text: "7", align: AlignmentType.RIGHT }, { text: "8", align: AlignmentType.RIGHT }, "Silhouette test kept at a 10% floor through the medium change"],
        [{ text: "Overall", bold: true }, { text: "4.4", align: AlignmentType.RIGHT, bold: true }, { text: "7.8", align: AlignmentType.RIGHT, bold: true }, "Kite-Ossel ≈6.5 drags it; Bramblehog and Ashen Lorric ≈8.5"],
      ]),
      SPACER(),
      P([B("Modular, not scalable"), T(", as instructed. Every slot resolves to a named variant — three build steps, five limbs, five tails, five crowns in three sizes, seven armaments, five hides. The part set describes an animal's whole appearance and contains no numbers, which makes it exactly the file list a hand-drawn atlas would supply. Mass and length are stated on the card, not drawn.")]),

      H1("Content and modes"),
      LI([B("Six species"), T(" — Quillfen (long, low, scaled), Sallowfinch (small, upright, beaked), Bramblehog (heavy, plated, spined), Kite-Ossel (glider, membrane), Silt-Adder (limbless, venomous), Ashen Lorric (tall biped, long arms).")]),
      LI([B("54 Breeding Trials"), T(" — every one proved solvable in CI by a solver playing the real breed function.")]),
      LI([B("180 Daily Genomes"), T(" — 180 consecutive days proved solvable.")]),
      LI([B("Eight campaign chapters"), T(" — each teaching one genetic concept, derived from the gene map rather than hardcoded.")]),
      LI([B("Fifteen moves"), T(", every one reachable by a real animal and none available to all of them.")]),
      LI([T("Exhibition, Legacy, Rival Ranch, Stud Exchange and the Compendium.")]),

      // --- what went wrong ----------------------------------------------------
      H1("What went wrong, and how it was caught"),
      P([T("Recorded because the pattern matters more than the individual bugs: nearly all of these looked correct in code and were only caught by measuring or by looking.", { color: DIM })]),
      H2("Caught by measuring"),
      LI([B("Four Breeding Trials were unsolvable"), T(" and seven were solvable without breeding at all — found by a beam-search solver that plays the real game.")]),
      LI([B("The Daily Genome was solvable one day in sixty."), T(" Two contradiction classes: asking for a lethal's phenotype alongside a clear result, and shutting an epistatic gate while asking to see what it masks. Now 180 of 180.")]),
      LI([B("Two species had a constant mass"), T(" — each names its shape value differently and a pattern match missed two of six. They were creatures you could not breed larger.")]),
      LI([B("Bite was available to every animal on the roster"), T(", which makes it a stat wearing a move's name. Its gate was raised.")]),
      LI([B("Sprites cost twelve long tasks"), T(" on the 500-creature herd where the old renderer had none. Moved to a worker; back to zero.")]),
      H2("Caught by looking at a screenshot"),
      LI([B("A fifth of all specimen labels ran off the paper"), T(" and were clipped mid-word. No test noticed because nothing was measuring text width.")]),
      LI([B("Thin features came out as dark pipes"), T(" — a stalk is entirely edge, so every pixel of it landed in the shadow rungs.")]),
      LI([B("Bipeds got one centred leg."), T(" Every upright species had a pogo stick.")]),
      LI([B("The battle message box typed one letter and stopped."), T(" The animation effect depended on a Map rebuilt every render, so each state update restarted the loop.")]),
      H2("Two bugs from the same mistake at different depths"),
      P([B("Every legged species lost its legs."), T(" The limb variant was matched against all of a creature's trait words joined together, and nearly every species has some locus whose expressed phenotype is the string “none” — an unlit lantern, a plain tail. The limb table's first row matched it.")]),
      P([B("Then half the Kite-Ossels lost theirs."), T(" Scoped correctly, the species' own limb trait is CLASP — Y-linked, with a suppressed phenotype of “none”, so every female expresses it. But that means “no foot clasp”, not “no legs”: a hen has ordinary feet. The limb table now has no row that can return none at all. Only a body plan with zero limb pairs removes legs, "), T("because a trait word must not be able to amputate.", { italics: true })]),
      H2("Mistakes in the process"),
      LI([T("Sent the desktop shortcuts as chat attachments, which download rather than open.")]),
      LI([T("Built the field-journal art direction faithfully to a spec that produced something that was not a game. Faithful to the brief is not the same as good to play.")]),
      LI([T("Took two rounds of sprite work before identifying that the real gap was the chrome around them, not the art itself.")]),

      // --- open ----------------------------------------------------------------
      H1("Still open"),
      H2("Waiting on you"),
      LI([B("Reference images."), T(" Paste three to five into the chat — those can be seen directly. The Google link is blocked by the container's network policy and cannot be worked around.")]),
      LI([B("The art commission decision."), T(" Recommendation: UI chrome first, then one species' reference sheet as a test before funding a full parts atlas.")]),
      LI([B("Whether to resume the mechanics."), T(" Paused at your instruction.")]),
      H2("Known gaps"),
      LI([T("The move system is built and tested but "), B("not yet wired into the battle resolver"), T(" — that conversion is save-breaking.")]),
      LI([T("The Kite-Ossel is the weakest sprite at roughly 6.5 and drags the roster average.")]),
      LI([T("Ten open arguments with the brief are logged in DECISIONS.md; four have since been resolved, six stand — including that the Stud Exchange and Rival Ranch are honour systems, and that the adaptive score has no composer.")]),
      LI([T("The UI has no unit tests by design; it is verified in a real browser instead.")]),

      new Paragraph({ children: [new PageBreak()] }),

      H1("Running it"),
      P([T("Node with npm workspaces. No database, no server, no account.")]),
      table([3260, 6100], [
        ["Command", "What it does"],
        [{ text: "npm run check", font: "Consolas" }, "Typecheck, lint and 666 tests — the gate before a commit."],
        [{ text: "npm run dev", font: "Consolas" }, "The app with hot reload, run against package sources."],
        [{ text: "npm run build:standalone", font: "Consolas" }, "Folds the game into one file, out/verdance.html."],
        [{ text: "npm run gallery", font: "Consolas" }, "Renders 144 specimens across all six species."],
        [{ text: "npm run sim", font: "Consolas" }, "Open, closed and line-bred herds, inbreeding over generations."],
      ]),
      SPACER(),
      P([T("The full reasoning behind every decision — all 101, with the arguments against each — is in DECISIONS.md in the repository. WORLD.md holds the world bible: six biomes, four factions, two calendars, and the rule that anything not making the breeding decision heavier should be cut.")]),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/tmp/claude-0/-home-user-Chimaera/e46a2cf0-d2a6-5314-9d30-aca46b51baef/scratchpad/Verdance-Project-Record.docx", buf);
  console.log("wrote", buf.length, "bytes");
});
