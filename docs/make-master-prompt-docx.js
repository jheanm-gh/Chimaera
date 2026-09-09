// Renders the original master build prompt as a Word document, matching the
// project record's typography so the two read as a set. Content is taken
// verbatim from the uploaded markdown; only its formatting is interpreted.
const fs = require("node:fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, PageBreak,
  LevelFormat,
} = require("docx");

const SRC = "/root/.claude/uploads/e46a2cf0-d2a6-5314-9d30-aca46b51baef/460a0e24-chimaeramasterprompt.md";
const OUT = "/tmp/claude-0/-home-user-Chimaera/e46a2cf0-d2a6-5314-9d30-aca46b51baef/scratchpad/Verdance-Master-Prompt.docx";

const W = 9360;
const INK = "1F2318", DIM = "5A6152", ACC = "9C3A1E", LINE = "C9CDBF", HEAD = "E8EAE0";

// --- inline markdown: **bold**, *italic*, `code` ---------------------------
function runs(md, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m;
  const plain = (t) => { if (t) out.push(new TextRun({ text: t, size: base.size ?? 21, color: base.color ?? INK, font: "Calibri", italics: base.italics })); };
  while ((m = re.exec(md)) !== null) {
    plain(md.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, size: base.size ?? 21, color: base.color ?? INK, font: "Calibri" }));
    else if (tok.startsWith("`")) out.push(new TextRun({ text: tok.slice(1, -1), size: (base.size ?? 21) - 2, color: DIM, font: "Consolas" }));
    else out.push(new TextRun({ text: tok.slice(1, -1), italics: true, size: base.size ?? 21, color: base.color ?? INK, font: "Calibri" }));
    last = m.index + tok.length;
  }
  plain(md.slice(last));
  return out.length ? out : [new TextRun({ text: "", size: 21, font: "Calibri" })];
}

const P = (md, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 140, before: o.before ?? 0, line: 276 },
  indent: o.indent, alignment: o.align,
  children: runs(md, o),
});

const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 380, after: 160 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 280, after: 110 } });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, spacing: { before: 220, after: 90 }, children: runs(t, { size: 21 }) });

const LI = (md, level = 0) => new Paragraph({
  numbering: { reference: "dots", level },
  spacing: { after: 90, line: 276 },
  children: runs(md),
});
const NLI = (md, level, instance) => new Paragraph({
  numbering: { reference: "steps", level, instance },
  spacing: { after: 90, line: 276 },
  children: runs(md),
});

const cell = (md, width, head) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  shading: head ? { type: ShadingType.CLEAR, fill: HEAD, color: "auto" } : undefined,
  margins: { top: 90, bottom: 90, left: 130, right: 130 },
  children: [new Paragraph({
    spacing: { after: 0, line: 250 },
    children: head
      ? [new TextRun({ text: md.replace(/\*\*/g, ""), size: 19, bold: true, color: INK, font: "Calibri" })]
      : runs(md, { size: 19 }),
  })],
});

const mkTable = (widths, rows) => new Table({
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
    children: cells.map((c, i) => cell(c, widths[i], r === 0)),
  })),
});

// Column widths proportional to what each column actually holds, with a floor
// wide enough that no column is narrow enough to break words mid-syllable.
const MIN_COL = 1500;
function widthsFor(cols, rows) {
  const weight = [];
  for (let c = 0; c < cols; c++) {
    const lens = rows.map((r) => (r[c] || "").replace(/\*\*|`/g, "").length);
    // Bias toward the longest cell, but not so far that one outlier owns the table.
    weight.push(Math.max(...lens) * 0.6 + (lens.reduce((a, b) => a + b, 0) / lens.length) * 0.4);
  }
  const total = weight.reduce((a, b) => a + b, 0);
  let out = weight.map((w) => Math.round((w / total) * W));
  // Raise anything under the floor, then take the difference back from the
  // widest columns so the row still sums to the full text width.
  const floored = out.map((w) => Math.max(w, MIN_COL));
  let debt = floored.reduce((a, b) => a + b, 0) - W;
  out = floored.slice();
  while (debt > 0) {
    const widest = out.indexOf(Math.max(...out));
    const take = Math.min(debt, out[widest] - MIN_COL);
    if (take <= 0) break;
    out[widest] -= take;
    debt -= take;
  }
  out[out.length - 1] += W - out.reduce((a, b) => a + b, 0);   // absorb rounding
  return out;
}

// --- markdown walk ---------------------------------------------------------
const lines = fs.readFileSync(SRC, "utf8").split("\n");
const body = [];
// The title, subtitle and the "paste this document" instruction are carried by
// the cover; the body starts at the first numbered section.
let i = lines.findIndex((l) => l.startsWith("## "));
let listInstance = 0, lastWasNumbered = false;

while (i < lines.length) {
  const raw = lines[i];
  const line = raw.trimEnd();

  if (!line.trim()) { i++; continue; }   // a blank line alone does not end a list

  const numberedHere = /^\s*\d+\.\s+/.test(line);
  if (!numberedHere) lastWasNumbered = false;

  if (line.startsWith("### ")) { body.push(H3(line.slice(4))); i++; continue; }
  if (line.startsWith("## ")) { body.push(H1(line.slice(3))); i++; continue; }

  if (/^---+$/.test(line.trim())) { i++; continue; }   // rules are carried by the heading style

  // pipe table
  if (line.trim().startsWith("|")) {
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) {
      const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
      i++;
    }
    const cols = Math.max(...rows.map((r) => r.length));
    rows.forEach((r) => { while (r.length < cols) r.push(""); });
    body.push(mkTable(widthsFor(cols, rows), rows));
    body.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    continue;
  }

  // bullets, with one level of nesting
  const bullet = line.match(/^(\s*)-\s+(.*)$/);
  if (bullet) { body.push(LI(bullet[2], bullet[1].length >= 2 ? 1 : 0)); i++; continue; }

  const numbered = line.match(/^(\s*)\d+\.\s+(.*)$/);
  if (numbered) {
    if (!lastWasNumbered) listInstance++;          // a new list restarts at 1
    body.push(NLI(numbered[2], numbered[1].length >= 2 ? 1 : 0, listInstance));
    lastWasNumbered = true;
    i++; continue;
  }

  // a lone `code` line is a formula in this document
  if (/^`[^`]+`$/.test(line.trim())) {
    body.push(new Paragraph({
      spacing: { before: 60, after: 160, line: 276 },
      indent: { left: 340 },
      children: [new TextRun({ text: line.trim().slice(1, -1), size: 20, color: ACC, font: "Consolas" })],
    }));
    i++; continue;
  }

  body.push(P(line));
  i++;
}

const doc = new Document({
  creator: "Verdance",
  title: "Verdance — Master Build Prompt",
  description: "The original design bible, as supplied at the start of the project.",
  numbering: {
    config: [
      { reference: "dots", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 220 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 740, hanging: 220 } } } },
      ] },
      { reference: "steps", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 500, hanging: 320 } } } },
        { level: 1, format: LevelFormat.DECIMAL, text: "%2.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 840, hanging: 320 } } } },
      ] },
    ],
  },
  styles: {
    default: {
      heading1: { run: { size: 30, bold: true, color: INK, font: "Calibri" },
        paragraph: { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACC, space: 6 } } } },
      heading2: { run: { size: 24, bold: true, color: INK, font: "Calibri" } },
      heading3: { run: { size: 21, bold: true, color: INK, font: "Calibri" } },
    },
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    children: [
      // --- cover ---
      new Paragraph({ spacing: { before: 1800, after: 120 },
        children: [new TextRun({ text: "V E R D A N C E   ·   M A S T E R   B U I L D   P R O M P T", size: 19, bold: true, color: ACC, font: "Calibri" })] }),
      new Paragraph({ spacing: { after: 160 },
        children: [new TextRun({ text: "The design bible, as supplied", size: 44, bold: true, color: INK, font: "Calibri" })] }),
      P("The opening prompt for the project, reproduced exactly as given — every section, table and instruction, with only the formatting interpreted for print. This is the document the whole build was measured against.", { color: DIM, after: 200 }),
      new Paragraph({ spacing: { after: 400 },
        children: [new TextRun({ text: "A genetics-first creature breeding game  ·  12 sections  ·  7 build phases", size: 19, color: DIM, font: "Consolas" })] }),
      P("Paste this whole document into Claude Code as the opening prompt. It is the design bible and the build order. Treat every section as binding unless I tell you otherwise in a later prompt.", { italics: true, color: DIM }),
      new Paragraph({ children: [new PageBreak()] }),
      ...body,
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", buf.length, "bytes"); });
