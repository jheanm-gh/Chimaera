/**
 * Fitting a caption to the plate.
 *
 * The specimen label is the conceit of a field-journal plate, so a label that
 * runs off the edge of the paper is not a cosmetic complaint — it is the plate
 * failing at its one job. SVG has no text wrapping, so the wrapping happens
 * here, before the text reaches the document.
 *
 * The advance table was measured, not guessed: `getComputedTextLength` on each
 * glyph at font-size 7.5 in the serif this stack falls back to, divided by the
 * font size so the numbers scale. Summing it reproduces a real caption's
 * measured width to better than half a percent.
 *
 * A reader whose machine has Georgia gets wider glyphs than the table knows
 * about. Two things cover that: SAFETY pads every estimate when deciding where
 * to break, and any line that still lands near the edge is pinned with
 * `textLength`, which makes the browser fit it whatever the font turns out to
 * be.
 */

/** Advance width per glyph, in ems. Anything absent is a 0.5em em-half. */
const ADVANCE: Readonly<Record<string, number>> = {
  "'": 0.179,
  " ": 0.25,
  ",": 0.25,
  ".": 0.25,
  "/": 0.277,
  i: 0.277,
  j: 0.277,
  l: 0.277,
  t: 0.277,
  "(": 0.333,
  ")": 0.333,
  "-": 0.333,
  "·": 0.333,
  I: 0.333,
  f: 0.333,
  r: 0.333,
  J: 0.39,
  s: 0.39,
  a: 0.444,
  c: 0.444,
  e: 0.444,
  z: 0.444,
  F: 0.556,
  P: 0.556,
  S: 0.556,
  "+": 0.563,
  E: 0.61,
  L: 0.61,
  T: 0.61,
  Z: 0.61,
  B: 0.667,
  C: 0.667,
  R: 0.667,
  A: 0.721,
  D: 0.721,
  G: 0.721,
  H: 0.721,
  K: 0.721,
  N: 0.721,
  O: 0.721,
  Q: 0.721,
  U: 0.721,
  V: 0.721,
  X: 0.721,
  Y: 0.721,
  w: 0.721,
  "♀": 0.75,
  "♂": 0.75,
  m: 0.777,
  M: 0.89,
  W: 0.944,
  "—": 1,
  "…": 1,
};

const DEFAULT_ADVANCE = 0.5;

/**
 * Headroom for a font the table has never met.
 *
 * Georgia — the first choice in the caption's stack — sets wider than the
 * fallback the table was measured against. Padding the estimate by this much
 * when choosing line breaks means a Georgia reader gets the same breaks and
 * still clears the edge.
 */
export const SAFETY = 1.15;

export interface TextStyle {
  readonly fontSize: number;
  readonly letterSpacing: number;
}

/** Estimated rendered width of a run of text, in user units. */
export function textWidth(text: string, style: TextStyle): number {
  let em = 0;
  for (const char of text) em += ADVANCE[char] ?? DEFAULT_ADVANCE;
  return em * style.fontSize + style.letterSpacing * [...text].length;
}

export interface FittedLine {
  readonly text: string;
  /**
   * Present when the line is close enough to the edge that a substituted font
   * could push it over. Emitting it as `textLength` hands the fit to the
   * browser, which knows the real metrics.
   */
  readonly textLength?: number;
}

export interface FitOptions extends TextStyle {
  /** Usable width on the plate, in user units. */
  readonly width: number;
  readonly maxLines: number;
}

/**
 * Wraps at spaces into at most `maxLines`, eliding the tail if it will not fit.
 *
 * Greedy rather than balanced: a specimen label reads as a run-on sentence, and
 * a balanced break would leave the species name floating alone above a full
 * line, which reads as a title it is not.
 */
export function fitLines(text: string, options: FitOptions): readonly FittedLine[] {
  const style: TextStyle = { fontSize: options.fontSize, letterSpacing: options.letterSpacing };
  const budget = options.width / SAFETY;
  const words = text.split(" ").filter((word) => word.length > 0);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && textWidth(candidate, style) > budget) {
      if (lines.length === options.maxLines - 1) {
        // No line left to start. Everything from here has to be elided onto
        // the one we are holding.
        current = elide(current, style, budget);
        break;
      }
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);

  return lines.map((line) => {
    const natural = textWidth(line, style);
    if (natural * SAFETY <= options.width) return { text: line };
    return { text: line, textLength: Math.min(natural, options.width) };
  });
}

/**
 * Marks a truncated label as truncated.
 *
 * A caption that simply stops is a caption the reader trusts and should not;
 * the ellipsis is the difference between "this animal has four traits" and
 * "this animal has four traits that fit on the paper".
 */
function elide(line: string, style: TextStyle, budget: number): string {
  let words = line.split(" ");
  while (words.length > 1 && textWidth(`${words.join(" ")}…`, style) > budget) words = words.slice(0, -1);
  return `${words.join(" ")}…`;
}
