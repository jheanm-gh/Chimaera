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

## Phase 2 — Renderer

### D21. SVG, not canvas

§10 says pick one and stay consistent. SVG wins on three counts that matter
here: the field-journal ink line survives arbitrary scaling, the same output
becomes a printable lineage certificate (§8.4) with no second pipeline, and it
is inspectable in tests as a string. Canvas would win on raw throughput for 500
creatures, but §10 also mandates virtualised lists, so only a few dozen are ever
on screen.

### D22. The renderer emits *data*, not markup or pixels

`renderCreature` returns a `Drawing`. An SVG serialiser and a silhouette
rasteriser both consume it. React will consume it directly rather than parsing
SVG strings. One geometry, three outputs, and no chance of the silhouette test
measuring something different from what the player sees.

### D23. Geometry is stored as flattened point rings, not bezier paths

The SVG serialiser smooths rings back into Catmull-Rom curves; the rasteriser
fills them as polygons. Storing curves instead would have made the silhouette
test require a full curve rasteriser — and a silhouette test nobody can run is
not a test.

### D24. Parts are parametric generators, not static art

§6.3 asks for modular parts with anchor points. Making each part a function of a
few scalars keeps that structure while letting continuous loci (build, size)
produce continuous variation instead of snapping to three authored bodies. Every
generator takes explicit anchors, so hand-drawn art can replace any one of them
without disturbing the others.

### D25. The renderer takes a `Phenotype`, never a `Genome`

Same reasoning as the Punnett predictor (D10), and the same test: two creatures
with different genotypes and identical appearance render byte-identically. The
art cannot leak the information game.

### D26. The silhouette test crops to the creature, and counts 8-connectivity

Fitting the canvas instead of the subject would let a shapeless design pass by
sitting in a large frame. Eight-connectivity rather than four because a thin
diagonal feature — a slanted claw, a whipping tail — occupies diagonally
adjacent pixels at 32x32 and an eye reads that as continuous; four-connectivity
reported detached limbs where none were visible, and satisfying it would have
pushed the art toward fat horizontal shapes.

The test found two real bugs on its first run: a whip tail whose tip broke off
below ~3.5 units of width, and a crowned dorsal ridge (a *novel allele*) that
barely changed the icon at all. Both are fixed in the rig, and both now have
assertions.

### D27. Silhouette distinctness is scaled to allele rarity

A common allele may be a subtle read at icon size — the silhouette carries
species identity, not every genotype. A **novel** allele may not: finding one is
the treasure of a playthrough, and if it does not visibly change the animal in a
32x32 icon then the discovery is a line of text rather than a moment. The test
asserts >3% pixel distance for the novel crown and for a whole part slot
changing, and merely non-zero for a common allele.

### D28. Two pens: a constant journal ink and an adaptive creature outline

A near-black line vanishes against a dark saturated coat, and raising the
species' lightness floor cannot fix it — blue carries only 7% of relative
luminance, so even a mid-lightness blue sits close to black. The journal's
furniture keeps one pen; the creature's linework lifts to a warmer, lighter
sepia when it must, which is what an illustrator does when drawing a dark
specimen.

`OUTLINE_CONTRAST = 2.1` is measured, not chosen: sweeping the whole authored
gene pool against every pen the paper constraint permits, the hardest coat tops
out at 2.194. A bar above that would be unsatisfiable, and a contrast rule the
palette cannot meet is worse than none.

### D29. Marking lightness is searched for, not offset

A fixed offset from the coat clamps at the ends of the lightness range and
silently produces markings nobody can see. The palette steps away from the coat
until contrast clears the bar, then stops.

### D30. Colourblind modes remap the hue *arc*, preserving ordering

Every mode compresses the species' authored arc onto an axis that vision type
retains — blue-to-yellow for deuteranopia and protanopia, teal-to-magenta for
tritanopia. A player who cannot separate moss from rust still sees a consistent
progression, so "this offspring is further along the arc than its dam" survives.
Markings additionally carry a hatch texture, so colour is never the only channel.

### D31. SVG element ids are namespaced per drawing

SVG ids share the host document's namespace. A ranch screen holding fifty
creatures that all defined `body-clip` would clip every creature's markings to
the *first* creature's outline. The id prefix defaults to a hash of the drawing,
so it is unique per creature and stable per render, and a test asserts both that
and that every `url(#...)` reference resolves within its own document.

---

## Phase 3 — Core loop

### D32. State is a value; actions are pure functions

`applyAction(state, action, map) -> { state, events }`. No classes, no
references into the engine, no clock. The state *is* the save file, so a ranch
round-trips through JSON, replays from a seed plus an action list, and could be
handed to a Web Worker without ceremony. React's only job is to hold the current
value and forward actions.

### D33. `rngCursor`, because `fork()` deliberately does not consume

`Rng.fork(label)` leaves the parent stream untouched — that is the whole point
of it (D13), and it is what stops a Phase 4 battle roll from shifting every
breeding roll that follows. The cost is a genuine footgun: forking the same
state twice with the same label returns the same numbers.

This shipped as a bug. Every breeding forked `"breed"` from a stored base state
that never advanced, so **every egg from a given ranch was genetically
identical** — the lethal test failed, which is how it was found. The fix is a
monotonic `rngCursor` on the ranch: rolls fork `label:cursor` and increment it.
The genetics suite now pins fork's non-consuming contract explicitly so nobody
"fixes" it in the other direction.

### D34. A doomed egg fails at hatching, not at pairing

The genetics engine decides lethality at conception. The *player* learns six
days later, when the egg was due. A lethal allele that announces itself at the
moment of pairing teaches nothing; one that costs a week of incubation teaches
the lesson §4.1 chapter 5 is built around. `Creature.doomed` carries the reason
until then.

### D35. Growth is asymptotic toward the ceiling

`achieved += (ceiling - achieved) * rate`, where the rate is the product of the
four raising axes and the life stage. Raising therefore *cannot* exceed genes —
not because a clamp says so, but because the equation has the ceiling as its
limit. That is the design law written as arithmetic.

### D36. Phenotypes are derived and cached, never stored

Storing a phenotype in the save would let it drift from its genome after a
genetics balance patch. A creature whose picture disagrees with its genome is
the worst possible bug in this game, so the field does not exist; `phenotypeOf`
memoises on the genome object instead.

### D37. Evolution previews show counts, never conditions

§2.3 asks for previewable but not guaranteed. The preview gives the branch name,
a nudge, and "3 of 5" — never which three. A secret branch stays off the list
entirely until the player is within one condition of it, or "there is a hidden
fifth form" becomes a permanent checklist item and stops being a secret.

### D38. The migration chain exists before there is anything to migrate

`MIGRATIONS` is an empty array with a comment. Adding `v1 -> v2` later is an
append rather than a redesign, and the loader already refuses a save from a
newer build instead of corrupting it. Players will own creatures they refuse to
lose.

### D39. Virtualised grid, hand-rolled

§10 asks for 500 creatures with no frame drops and every list virtualised.
Measured on the built app with a 500-creature save: **132ms to first paint,
20-32 cards mounted, 3,617 DOM nodes, worst scroll step 30ms.** Mounting all 500
would be hundreds of thousands of nodes.

Two things got it there. Generated SVG is cached across mounts, because
virtualisation unmounts a card on scroll and `useMemo` goes with it. And cards
render at a `"thumb"` detail level that halves ring sampling — a 210px card
cannot show the difference, and five hundred of them can very much feel it.

### D40. The scroll handler reads the event synchronously

React releases a synthetic event when the handler returns, so reading
`event.currentTarget` inside a state updater — which React may run later, during
render — finds `null`. This crashed the whole app mid-scroll on a large ranch,
and was invisible with four creatures. Found by measuring against the §10 target
rather than by playing.

### D41. The app reuses `toSvg` rather than mirroring it in JSX

One serialiser between the ranch screen, the exported plate and the printed
lineage certificate. A parallel JSX renderer would be a second definition of
what a creature looks like, and the two would drift.

---

## Phase 4 — Combat and expeditions

### D42. The equipment cap is stated as a share, not as a bonus

§3 says equipment contributes "no more than 20% of effective power". A bonus `b`
on top of gene power is `b / (1 + b)` of the result, so a 20% *share* is a 25%
*bonus* — two different numbers that are easy to confuse into a cap that does
not cap. `MAX_EQUIPMENT_BONUS` is derived from `MAX_EQUIPMENT_SHARE` rather than
typed in, and a test sweeps every loadout of every item at five power levels and
asserts the share never exceeds 0.2.

The cap binds exactly where it should: two tier-3 pieces total 0.26 and are
trimmed to 0.25. Gear tops out precisely at the point where it stops being the
answer.

### D43. Equipment is deterministic, and A1 is resolved

The open argument from Phase 1 (A1) is settled in favour of a flat, visible
percentage. §3 asks players to bulk-simulate fifty fights to evaluate a lineage;
if equipment contributed a *variable* share, a large part of what those fifty
fights measured would be equipment noise rather than genes. Only the damage roll
and a per-fight condition roll vary.

### D44. Initiative ties are jittered from the seed, never broken by id

Found by calibration, not by playing: with ties broken by id, the team passed
first struck first in every round, and two **identical** teams gave the
first-listed one a **98.5% win rate**. In a three-a-side attrition fight, acting
first is close to decisive. Argument order is not a stat, and this would have
silently decided every League bout and every Rival Ranch match.

### D45. Variance is per-fight, not per-hit

The first fix made fights fair but far too sharp: a 5% better lineage won 99.5%
of four hundred fights. Widening the per-hit roll does not help — a three-a-side
fight lands about fifty blows, so per-hit noise averages almost entirely away,
while attrition *compounds* (lose a creature, lose its actions, lose faster).

The lever that works is correlated, per-fight variance: each creature rolls its
condition once and carries it through the fight. The calibration curve is now

    advantage   0%    2%    5%    10%   15%   25%
    win rate    49%   62%   80%   94%   99%   100%

Genes dominate — a tenth of a stat point is nearly decisive — while the band
where real breeding comparisons live still has enough resolution that sampling
fifty fights tells you something one fight would not.

### D46. Hybrid affinity averages both matchups

The affinity locus is co-dominant, so a hybrid genuinely carries two. Averaging
the matchup across every pair makes a hybrid rounder defensively and blunter
offensively — never fully weak, never fully strong. That is a breeding trade
rather than a strictly better type, which is what keeps the pure affinities worth
breeding for.

### D47. Bulk simulation runs in a Web Worker, and only specs cross the boundary

§10 asks for it off the main thread. A five-hundred creature save is most of a
megabyte, and structured-cloning the ranch per query would cost more than the
simulation it was avoiding. Only the combatant specs and a difficulty go across.
Fifty fights come back in about 20ms.

### D48. Expeditions are gated behind one League win

A first expedition that wipes the starting herd is not a lesson about risk, it
is a lesson about not playing. The League is safe, repeatable and costs nothing
but a day, so it is where a player finds out what their animals can take. §4
gates Expedition at Chapter 2 for the same reason; this is the mechanical
version of that gate.

### D49. Loot is kept on a loss, and withdrawing costs nothing

The run already took a creature. Confiscating the findings as well would only
teach the player not to go out, which breaks the loop the expedition exists to
serve — getting outside blood into a closing herd. The reason to press on to the
warden is that the warden holds the prize, which is a better bargain to offer
than a penalty for stopping.

### D50. Condition carries between nodes

`CombatantSpec.startingHp` makes an expedition a *run* rather than a series of
unrelated fights: damage taken at the third node is still there at the warden,
and a spring gives back 45% and never all of it. A creature carried in already
unconscious is not silently revived, and is not double-counted as newly lost.

---

## Open arguments with the brief

Recorded rather than acted on, so they can be settled deliberately.

**A1. RESOLVED in Phase 4 (D42, D43).** Equipment contributes a flat,
deterministic, hard-capped share, and the cap is asserted by a test that sweeps
every loadout. Original argument follows.

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
