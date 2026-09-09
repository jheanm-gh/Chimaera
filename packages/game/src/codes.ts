/**
 * Genome codes: a whole diploid genome as a string a player can paste.
 *
 * Three modes need one before Phase 7's sharing polish does. Rival Ranch fights
 * snapshots of other stations' teams, and the Stud Exchange lets someone breed
 * to an animal they do not own — neither of which works without a way to hand
 * a genome to a stranger over any channel that carries text.
 *
 * Design constraints, in the order they mattered:
 *
 *  1. **A corrupted code must fail loudly.** A code that decodes into a
 *     *different but valid* genome is the worst outcome: the player breeds to
 *     it, gets an inexplicable result, and concludes the genetics are broken.
 *     Every code carries a checksum over its payload and the decoder refuses
 *     anything that does not match.
 *  2. **Typeable.** Crockford's base32 alphabet: no I, L, O or U, so there is
 *     no 1/l, 0/O confusion and nothing spells anything unfortunate. Decoding
 *     is case-insensitive and forgives hyphens, because people add hyphens.
 *  3. **Versioned.** A leading version symbol, so a code minted today still
 *     announces what it is when the format moves.
 *
 * The code is not a save file and carries no ranch state: a genome, a species
 * and a sex. Everything else about an animal — its name, its raising, what it
 * has achieved — belongs to whoever owns it.
 *
 * One symbol per value, which makes a code about ninety-five characters. A
 * packed format could halve that by dropping the copy-count symbol for the
 * loci that have exactly one copy — but ninety-five and fifty are both "paste
 * it" lengths rather than "read it aloud" lengths, the QR path in Phase 7 does
 * not care either way, and the thing that must never happen here is a decoder
 * quietly producing a *different valid genome*. Forty-four characters is a
 * cheap price for a decoder anyone can follow.
 */

import { geneMapById, SPECIES } from "@chimaera/genetics";
import type { AlleleId, GeneMap, Genome, Haplotype, HaplotypeKind, LocusId, SpeciesId } from "@chimaera/genetics";

export const GENOME_CODE_VERSION = 1;

/** Crockford base32: no I, L, O or U. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const VALUES = new Map([...ALPHABET].map((symbol, index) => [symbol, index]));
/** Crockford's own confusables, folded on the way in. */
const FOLD: Readonly<Record<string, string>> = { I: "1", L: "1", O: "0", U: "V" };

export interface DecodedGenome {
  readonly genome: Genome;
  readonly species: SpeciesId;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export function encodeGenome(genome: Genome): string {
  const map = geneMapById(genome.species);
  const speciesIndex = SPECIES.findIndex((species) => species.id === genome.species);
  if (speciesIndex < 0) throw new Error(`cannot encode unknown species "${genome.species}"`);

  const bytes: number[] = [GENOME_CODE_VERSION, speciesIndex];
  for (const chromosome of map.chromosomes) {
    const pair = genome.chromosomes[chromosome.def.id];
    if (!pair) throw new Error(`genome is missing chromosome ${chromosome.def.id}`);
    for (const haplotype of [pair.maternal, pair.paternal]) {
      bytes.push(kindCode(haplotype.kind));
      for (const locus of chromosome.loci) {
        const alleles = haplotype.genes[locus.id] ?? [];
        // Copy-number variation travels with the haplotype, so the count is
        // part of the payload rather than assumed to be one.
        bytes.push(alleles.length);
        for (const allele of alleles) bytes.push(alleleIndex(locus.id, allele, map));
      }
    }
  }

  const payload = toBase32(bytes);
  return `${payload}${toBase32([checksum(bytes) & 0x1f, (checksum(bytes) >> 5) & 0x1f]).slice(0, 2)}`;
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

export function decodeGenome(code: string): DecodedGenome {
  const symbols = normalise(code);
  if (symbols.length < 6) throw new Error("That is not a genome code — it is too short.");

  const body = symbols.slice(0, -2);
  const tail = symbols.slice(-2);
  const bytes = fromBase32(body);
  if (bytes.length < 2) throw new Error("That genome code is truncated.");

  const expected = toBase32([checksum(bytes) & 0x1f, (checksum(bytes) >> 5) & 0x1f]).slice(0, 2);
  if (tail !== expected) {
    throw new Error("That genome code did not check out. A character is probably wrong.");
  }

  const version = bytes[0] ?? 0;
  if (version !== GENOME_CODE_VERSION) {
    throw new Error(`That code is version ${version}; this build reads version ${GENOME_CODE_VERSION}.`);
  }
  const species = SPECIES[bytes[1] ?? -1]?.id;
  if (!species) throw new Error("That code names a species this build does not have.");

  const map = geneMapById(species);
  const chromosomes: Record<string, { maternal: Haplotype; paternal: Haplotype }> = {};
  let at = 2;

  for (const chromosome of map.chromosomes) {
    const read = (): Haplotype => {
      const kind = kindFromCode(bytes[at++] ?? -1);
      const genes: Record<LocusId, AlleleId[]> = {};
      for (const locus of chromosome.loci) {
        const count = bytes[at++] ?? 0;
        if (count > 4) throw new Error("That genome code is malformed.");
        const alleles: AlleleId[] = [];
        for (let i = 0; i < count; i++) {
          const index = bytes[at++] ?? -1;
          const allele = map.locus(locus.id).alleles[index];
          if (!allele) throw new Error("That genome code names an allele this build does not have.");
          alleles.push(allele.id);
        }
        if (alleles.length > 0) genes[locus.id] = alleles;
      }
      return { kind, genes };
    };
    const maternal = read();
    const paternal = read();
    chromosomes[chromosome.def.id] = { maternal, paternal };
  }

  if (at !== bytes.length) throw new Error("That genome code has trailing data.");
  return { genome: { species, chromosomes }, species, version };
}

/** True when a code parses. For UI validation, where a throw is not wanted. */
export function isGenomeCode(code: string): boolean {
  try {
    decodeGenome(code);
    return true;
  } catch {
    return false;
  }
}

/** Groups a code into fives, which is how people read and retype them. */
export function formatGenomeCode(code: string): string {
  return (code.match(/.{1,5}/g) ?? [code]).join("-");
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function alleleIndex(locusId: LocusId, allele: AlleleId, map: GeneMap): number {
  const index = map.locus(locusId).alleles.findIndex((candidate) => candidate.id === allele);
  if (index < 0) throw new Error(`cannot encode unknown allele "${allele}" at ${locusId}`);
  return index;
}

function kindCode(kind: HaplotypeKind): number {
  return kind === "autosome" ? 0 : kind === "X" ? 1 : 2;
}

function kindFromCode(code: number): HaplotypeKind {
  if (code === 0) return "autosome";
  if (code === 1) return "X";
  if (code === 2) return "Y";
  throw new Error("That genome code is malformed.");
}

/**
 * Five bits per symbol.
 *
 * Every value in the payload is a small integer — a version, a species index, a
 * haplotype kind, an allele count, an allele index — and none of the six gene
 * maps has a locus with more than 32 alleles, so five bits is exact rather than
 * a compromise. A test asserts that, because a seventh species with a
 * thirty-third allele would silently truncate.
 */
function toBase32(bytes: readonly number[]): string {
  let out = "";
  for (const value of bytes) {
    if (value < 0 || value > 31) throw new Error(`value ${value} does not fit a genome code symbol`);
    out += ALPHABET[value];
  }
  return out;
}

function fromBase32(symbols: string): number[] {
  const out: number[] = [];
  for (const symbol of symbols) {
    const value = VALUES.get(symbol);
    if (value === undefined) throw new Error(`"${symbol}" is not a genome code character.`);
    out.push(value);
  }
  return out;
}

function normalise(code: string): string {
  return [...code.toUpperCase().replace(/[\s-]/g, "")].map((symbol) => FOLD[symbol] ?? symbol).join("");
}

/** FNV-1a over the payload. Ten bits of it survive into the code. */
function checksum(bytes: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Signing (§8.1)
// ---------------------------------------------------------------------------

/**
 * The build key.
 *
 * §8.1 asks for codes to be signed "to prevent trivial forgery", and trivial is
 * the operative word. A key that ships inside the client is not a secret, and
 * anyone willing to open the bundle can mint whatever they like — so this is
 * tamper-*evident*, not tamper-proof. It stops the casual edit (nudging a stat,
 * swapping an allele in a pasted offer) and it stops a code mangled in transit
 * from being accepted, which is the whole of what an offline game can honestly
 * claim. When there is a server and a leaderboard worth defending, the same
 * call sites take a real signature without changing shape.
 */
const BUILD_KEY = "verdance/2026/stud-and-ghost";

/**
 * A short keyed tag over a payload.
 *
 * Two independent FNV-1a passes over key-prefixed and key-suffixed copies,
 * mixed. It is not a MAC and does not claim to be one; it is a checksum an
 * editor cannot recompute by eye.
 */
export function signPayload(payload: string): string {
  const forward = fnv(`${BUILD_KEY}|${payload}`);
  const backward = fnv(`${payload}|${BUILD_KEY}`);
  const mixed = (forward ^ Math.imul(backward, 0x9e3779b1)) >>> 0;
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[(mixed >>> (i * 5)) & 0x1f];
  return out;
}

export function verifyPayload(payload: string, tag: string): boolean {
  const expected = signPayload(payload);
  if (tag.length !== expected.length) return false;
  // Constant-time-ish: no early exit, so the comparison leaks nothing useful
  // even though nothing here is worth attacking.
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= (expected.charCodeAt(i) ^ tag.charCodeAt(i)) & 0xff;
  }
  return difference === 0;
}

function fnv(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
