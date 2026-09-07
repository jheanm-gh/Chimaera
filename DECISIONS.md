# DECISIONS

Every non-obvious choice, and why. Kept so the reasoning survives context loss.
Newest phase last. If you disagree with something here, argue with the entry
rather than silently changing the code — most of these are load-bearing.

---

## Phase 1 — Genetics core

### D1. Haldane's mapping function, not Kosambi's

`r = (1 - e^(-2d)) / 2`.

Kosambi models crossover interference more realistically. Haldane is chosen
anyway because it is **exactly additive** under the recombination composition
rule `r_AC = r_AB + r_BC - 2·r_AB·r_BC`. That means applying it independently
per gap during meiosis reproduces the correct recombination fraction between
*any* two loci, however many loci sit between them.

The payoff is a checkable invariant: the map is the single source of truth for
linkage, and `linkage.test.ts` can assert an exact expected value (2.91% at
3cM, 40.68% at 84cM) rather than a hand-waved correlation. Realism we cannot
test is worth less than realism we can.

Consequence: crossover inducers scale **map distance**, not `r`, or additivity
breaks.

### D2. XY sex determination, not ZW

ZW (female-heterogametic, as in birds and reptiles) fits egg-laying creatures
better ecologically and is the less clichéd choice. XY wins because §4.1 makes
the campaign a genetics tutorial, and XY is the system every player already
half-remembers from school. Teaching sex linkage is hard enough without also
inverting which sex is hemizygous.

Revisit if a later species wants ZW as a deliberate point of difference — the
engine stores a `HaplotypeKind` per haplotype and does not care.

### D3. Sex is derived from the genome, never stored

`sexOf(genome, map)` reads whether the sex-chromosome pair contains a Y. One
source of truth, so a save file can never disagree with itself.

### D4. Copy-number variation lives in the haplotype, as an array

`Haplotype.genes` maps a locus to an **array** of alleles, normally of length 1.
A duplication makes it length 2. This is why CNV inherits correctly: the
duplication travels with the haplotype through meiosis, exactly as it would
biologically. A `[maternalAllele, paternalAllele]` scalar model would have made
CNV a special case bolted onto everything downstream.

Absence from the map means genuine absence (an X-linked locus on a Y), which is
how hemizygosity is represented without a sentinel value.

### D5. CNV is a real dosage gain on autosomes, capped at 1.15x

§1.4 asks for "mildly game-breaking in a fun way". Autosomal polygenic loci sum
over every copy, so three copies genuinely beat two. The normalised stat is
clamped to 1.15 of the authored maximum, so a stacked CNV creature is
noticeably special without invalidating the Exhibition and Trials metas that
score against a known range.

### D6. Sex-linked polygenic loci are dosage compensated

Autosomal polygenic loci sum; sex-linked ones use `mean x 2`. Without this,
every male in the game would be systematically slower than every female,
because he carries one copy of `SPD_B` where she carries two — a large,
permanent, invisible penalty no player would ever deduce. Real X-upregulation
does the same job. Asserted in `mendel.test.ts`.

### D7. Inbreeding gets **no** lethal-expression multiplier

§1.5 lists "higher lethal-allele expression" as an inbreeding penalty. It is not
implemented, deliberately. Inbreeding raises homozygosity *mechanically* — the
meiosis being simulated already delivers more doubled-up lethals as F climbs.
An explicit multiplier on top would double-count the same effect, and worse,
would make the Punnett predictor wrong: it computes lethal risk from genotype
probabilities, so a hidden multiplier would silently break the game's most
important information tool.

Fertility loss, stillbirth and stat depression are all implemented as authored,
because those are genuinely separate effects.

### D8. The inbreeding penalty curve is an authored table, interpolated

Tuned so line-breeding is viable roughly 4-6 generations (§1.5). Verified in the
simulation harness: a six-founder closed line bred best-to-best holds together
through generation 4-5, is visibly straining by 6, and collapses at 7. An open
ranch that keeps catching wild stock holds F near 0.01 indefinitely.

No penalty at all below F = 0.0625 — a careful cousin-level breeder should never
be punished for competence.

### D9. Epigenetic bonus capped at 6% of ceiling, not 8%

§1.6 asks for 10-15% heritability with genes always dominating. At 8% of ceiling,
a perfectly maintained epigenetic line was worth slightly *more* than one better
allele at the top of a stat's range. That inverts the design law.

Now: `heritableFraction` 0.12, `decay` 0.5 per generation, `maxBonusFraction`
0.06. `epigenetics.test.ts` asserts, against the live species data, that the
maximum epigenetic bonus is below one allele step for every polygenic stat. Any
future balance pass that breaks the design law fails CI.

### D10. The Punnett predictor takes `ParentKnowledge`, never `Genome`

It is structurally incapable of leaking a hidden genotype, and a test asserts
that two dams with different genotypes but identical appearance produce
byte-identical predictions. This is the difference between an information game
and a UI that pretends to be one.

### D11. Unknowns become ranges, not averages

Each prediction is evaluated under every phased diplotype the player's knowledge
still permits, and reports `{p, min, max}`. A player looking at `0.25` and a
player looking at `0.00 - 0.25` are making different decisions; collapsing the
second into its mean would quietly destroy the reason to buy a lens.

**Phase is part of the uncertainty.** Not knowing whether the fast allele and the
lethal one ride the same haplotype is exactly the linkage-drag problem, and it
shows up as a range from `r/2` to `(1-r)/2` — a factor of thirty.

Hypotheses are capped at 24 per parent (cost is O(k²)); truncation is reported
in `caveats` rather than hidden.

### D12. A living parent cannot be homozygous for a recessive lethal

The predictor prunes those genotypes from its hypothesis set. It is free
information the player already has, and withholding it would make the tool feel
stupid rather than mysterious.

### D13. `Rng.fork(label)` for stream isolation

Subsystems draw from independent substreams derived from a label and the current
state. Without this, adding a battle roll in Phase 4 would shift every breeding
roll that follows it, invalidating every saved Daily Genome seed. Cheap now,
impossible later.

53-bit doubles from two 32-bit draws, so a 2e-6 novel-mutation rate is actually
representable.

### D14. Genome serialisation is versioned from day one

`GENOME_FORMAT_VERSION = 1`, sorted keys, byte-stable output. This is the
substrate for save files and, later, signed shareable genome codes and QR
trading (§8.1). Players will own creatures they refuse to lose.

### D15. `Phenotype.marks` comes only from loci tagged `pattern`

Tail shape is a co-dominant locus, but it is a **part slot** in the modular rig
(§6.3), not a marking layer. Tagging it `pattern` would have had the renderer
stacking a tail across a flank. Its co-dominance still shows in its trait label
(`fan+whip`).

### D16. The epistatic gate sits on a different chromosome from what it masks

`PIG` is on C3; every colour locus it gates is on C2. Chapter 4 asks the player
to find the switch hiding their colour work; if the switch were linked to the
colours, the lesson would be muddied by drag. A species test enforces this for
every future species.

### D17. Fixtures default to the *commonest* wild allele

`genomeFromSpec` fills unlisted loci with the highest-frequency wild allele, not
the first one authored. Defaulting to "first listed" quietly handed every test
fixture a rare recessive lethal.

### D18. Wild populations ship with linkage disequilibrium

`wildCoupling` biases founder haplotypes so that in wild Quillfen the long-stride
allele `SA2` carries the lantern lethal `LN_star` about 45% of the time against a
4% background. Without this, linkage drag would be a mechanic with nothing to
drag: the player would have to *create* the coupling before they could suffer
from it.

### D19. Statistical tolerance is 4 sigma, floored

`tolerance()` in the test helpers. Four sigma puts the per-assertion false-failure
rate near 1 in 16,000, which is what a suite this assertion-dense needs to stay
trustworthy. A flaky genetics suite is worse than no genetics suite.

### D20. One fully authored species in Phase 1

Quillfen carries all seven inheritance modes, both lethals, the epistatic gate,
the sex-linked and sex-limited loci, and the linkage drag. Six species ship in
Phase 5 (§6.5); authoring five more before the engine was proven would have been
five more things to rewrite.

---

## Open arguments with the brief

Recorded rather than acted on, so they can be settled deliberately.

**A1. "Equipment contributes no more than 20% of effective power" plus "no
inputs during the fight" (§3).** Together these leave equipment as nearly the
only lever a player touches in combat. That is consistent with combat being the
fitness function, but it means the 20% must be *deterministic* — if equipment
contributes a variable 0-20%, bulk-simulating 50 fights to evaluate a lineage
(also §3) measures the equipment noise as much as the genes. Recommendation for
Phase 4: equipment contributes a flat, visible percentage, and the hard cap gets
the test the brief asks for.

**A2. "Novel alleles have authored art and an authored name slot" (§1.4) versus
"the first player to discover a novel allele names it" (§8.2).** Both are
implemented as compatible — the engine has authored *slots* with placeholder
names, and `NovelAlleleSource` is injected so the game layer can enforce
first-discovery naming without genetics knowing what a player is. Flagging it
because the slot count is now a content constraint: the number of nameable
discoveries per species is fixed at authoring time, and four per species will
feel thin if the game succeeds.

**A3. Lethal alleles at 4% wild frequency.** High enough that a player meets one
in their first hour, which the campaign needs. It also means roughly 1 in 600
wild-pair eggs fails to a doubled lethal before the player has any idea why.
That is the intended lesson, but it wants a tutorial beat in Chapter 1, not
Chapter 5.
