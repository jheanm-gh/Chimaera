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

## Phase 5 — Content: the roster and the campaign

### D51. The campaign is built from the gene map, not written against one species

§4.1 asks for eight chapters, one genetic concept each. Written against the
Quillfen they would name `DORSAL`, `LN_star` and `PIG` — and teach nothing at
all on a Silt-Adder. `buildCampaign(map)` instead *selects* each chapter's
targets out of whatever species the ranch is running: its cleanest dominance
locus, its tightest linked pair, its epistatic gate, its lethals, its novel
alleles. The prose says what the concept is; the map says what the animal is.

The payoff is that chapter 4 on an Ashen Lorric genuinely poses the two-stage
cascade that chapter 4 on a Quillfen does not, with no second campaign authored.
The cost is that a species which cannot supply a target throws at map-compile
time — which is how the Ashen Lorric's missing plain-dominance locus was found
(D54).

### D52. Objectives are sticky predicates over the save, not quest flags

An objective is a question asked of `RanchState`, re-asked after every action,
and remembered once true. Nothing sets a flag from inside a handler.

Three things follow, and all three are the reason. A chapter cannot be failed by
doing the right thing in the wrong order. An objective is not lost when the
creature that satisfied it dies — which matters enormously in a game where
everything dies. And the whole campaign can be tested without simulating a
player: `campaign.test.ts` asks each objective of a state that should satisfy it
and one that should not.

Only the *active* chapter is evaluated. A player who happens to satisfy chapter
7 while working through chapter 2 has not learned chapter 7, and crediting it
would hand them a Deep Sequencer before the lesson that makes it worth owning.

### D53. Chapter 1 asks for a cross, not for an animal

The first draft of `c1-recessive` was "own a living creature showing the
recessive". A scripted playthrough completed the chapter on **day zero**,
because one of the four founders happened to show it. That satisfies the words
and violates the design law: no pressure was put on any breeding decision.

It now asks for a recessive *bred from two parents that both show the dominant*
— which is the Mendelian lesson stated as a state predicate. The same script now
needs 13 pairings and 38 days.

### D54. Two species were missing a locus, and the tests said so

Both found by content tests rather than by eye.

The **Ashen Lorric** had no plain autosomal dominance locus at all: everything
it carried was gated, lethal or blended, so the campaign's first lesson could
not be taught on it. A late-game species is allowed to be hard; it is not
allowed to have no shallow end. `TOE` was added.

The **Silt-Adder** had no form gene. Coil thickness was its only shape lever,
and the silhouette rasteriser crops to content before rasterising — deliberately,
so the Ranch grid reads a big Bramblehog and a small one as the same animal — so
thickness alone moved its icon by 5% across its entire range. A species with no
form genetics has nothing to breed *for* beyond colour. `TAILTIP` was added, and
the coil range widened.

### D55. The roster is separated by measurement, not by assertion

Six body plans on one rig, and a pairwise silhouette test with a 10% floor. It
failed twice.

The Quillfen and the Kite-Ossel came out 9.1% apart — two wide bars in the Ranch
grid. Deepening the Quillfen's trunk and raising its frond crown took the pair
to 15.1%. Thinning the Kite-Ossel then pushed it into the Silt-Adder at 11.2%,
which was fixed not by making it thinner still but by lengthening its dangling
limbs: the one thing a limbless animal can never have. Closest pair is now 13.3%.

The lesson is the process, not the numbers. Every one of those adjustments was
chosen because a measurement said the roster was failing, and the same
measurement said when it had stopped.

### D56. A secret branch must be unreachable by raising alone, and that is tested

§2.3 asks for branches gated on genotype *and* raising path. Probing which
fields a condition reads turned out to be the wrong test — `affinities` and
`build` are as genetic as `carries`, and a proxy cannot see a number being read.

So the test asks the real question instead: give 120 wild animals of that
species perfect bonding, maxed achievement, and the best habitat, diet, training
and held item in the catalogue, then count how many can still reach the branch.
Fewer than 40% may. A branch most animals can walk into with the right furniture
is a checklist, not a secret.

The same sweep found the Sallowfinch's `hen-quiet` branch gated only on "not
bright plumage", which every hen and most cocks satisfy — making the floor
branch below it unreachable. Five authored forms, four that could ever appear.

### D57. Feed closes a fraction of the remaining gap

Conditioning items had two obvious shapes: add a flat number to the achieved
stat, or close a share of the distance to the ceiling. The first needs a clamp
bolted on to stop it exceeding genes. The second cannot exceed them at all, gets
weaker the better the animal already is, and is the same rule the daily growth
tick already uses. Feed finishes a well-bred creature and cannot rescue a badly
bred one.

Decor is the same argument in the other direction: it floors a mismatched
habitat back to neutral and can never lift a matched one above it, so the
affinity allele remains the only thing that grants a bonus. Furniture is damage
control; genes are advantage.

### D58. The test-cross kit reads the clutch

A "better lens" would have been a fourth information tier and a fifth thing to
save up for. A test cross is not more information about one animal — it is the
*same* reading applied to every offspring at once, which is why the interesting
part is that you must breed before you can use it. One item, one new field on
`ItemEffect`, and a reason to plan two steps ahead.

### D59. The save format moved to v2, and the migration chain earned itself

`campaign` is a required field on `RanchState`, so a v1 save cannot be loaded
without one. The chain written in Phase 3 with an empty array and a comment took
exactly one function to extend, and a test forges a v1 save and loads it — in
the browser as well as in vitest, through the app's own import button.

A migrated v1 ranch starts at chapter 1 with nothing recorded, which is correct:
the objectives are re-asked of the state on the next action, and anything
already true ticks immediately.

---

## Phase 6a — Mixed stock

### D60. The gene map is resolved from the creature, not threaded through the reducer

`applyAction(state, action, map)` became `applyAction(state, action)`. Every
creature already carried its `species`; `mapOf(creature)` now reads the map from
that at the point of use, and `RanchState.homeSpecies` says which fen is outside
the door.

The old arrangement was correct while one species shipped and became a
correctness hazard the moment six did — every call site had to be handed the
right map and nothing checked that it was. Expressing a Silt-Adder's genome
through a Quillfen's loci does not throw; it produces a confident, completely
wrong animal, and then draws it. Resolving from the creature makes that
unrepresentable.

This resolves A4, which was raised at the end of Phase 5 as a Phase 6 problem.
It was cheaper to fix before the mode surface grew, which is exactly why it was
flagged there.

### D61. Cross-species pairings are refused, not fudged

Two species have different chromosome sets and different loci. There is no
hybrid to express and no honest way to invent one, so `breed` refuses the
pairing outright and the Pairing view only offers dams of the sire's species —
a chooser that offers an option the reducer will reject is an invitation to a
rejection message.

### D62. Expeditions are how you get another species

Each of the six biomes belongs to exactly one species, so naming a destination
names an animal: going to the Galeshore is how a Quillfen station comes home
with a Kite-Ossel.

That gives the expedition system a second job beyond risk. §4 wants a Stud
Exchange and an Exhibition, both of which want mixed stock, and this is the
diegetic route to it — you travel for foreign blood rather than buying it from a
menu. It also puts a real cost on the acquisition, since an expedition can take
a creature and not give it back.

The League stays local: whatever mixed stock a station keeps, the animals across
the sand are the home fen's.

### D63. All six species are offered at the start

Gating four species behind progress would mean shipping content most players
never see, and the difficulty difference between them is a difficulty of
*puzzle*, not of numbers. A player who wants to open on the Ashen Lorric's
two-stage cascade should be allowed to find out what that costs them; the
starter trio is marked as such and that is the whole of the guidance.

The picker leads with each species' genetic problem rather than its stat line,
because the stat line is not what anyone will be thinking about four hours in.

---

## Phase 6 — The modes

### D64. A mode is open when the state says it is

One table, one pure predicate per mode, evaluated against the save. Nothing sets
an "unlocked" flag anywhere, which means an imported save, a migrated save and a
Legacy run all agree about what the player can do without anybody having to
remember to set a bit.

Gates are the brief's, with one addition: expeditions want a League win as well
as chapter 2. Two gates on the one mode that can permanently delete a creature
is deliberate.

### D65. The show ring reads the animal, and rarity is measured rather than tagged

§4 asks for judging on "symmetry, rarity, colour coherence, conformation".
Symmetry is not judgeable here — the rig is symmetric by construction, so a
symmetry score would be a constant with extra steps. It is replaced by
*condition*: how close raising got the animal to its own ceiling, which is
husbandry rather than combat and is the category a patient player wins without
breeding anything new.

Rarity is the surprisal of the *appearance* under the species' own wild allele
frequencies, normalised against that species' baseline entropy so the number
means the same thing on a Quillfen and an Ashen Lorric. Nothing is hand-tagged
as rare; a coat is rare because the maths says so.

Calibrating it found two real bugs. Masked loci show labels no wild allele pair
can produce, so each one was charging the full novel-allele surprisal — and an
albino, a one-in-sixteen coat, came out as the rarest thing the judges had ever
seen. A sex-limited locus showing "hidden" did the same to every hen. Both are
now skipped, and the gate locus is scored on its own merits at the four bits it
actually costs.

Judging never reads a genotype. A ring that leaked one would be a free Deep
Sequencer, which would quietly undo the whole information game of §1.3.

### D66. Every authored puzzle is proved solvable, in CI

Fifty-four Breeding Trials, checked by a beam-search solver that plays the real
`breed()` through the real gene map. It found four unsolvable ones — an allele
absent from the pool entirely, a mislabelled suppressed phenotype, a locus that
does not exist on that species, and two stat floors above what the given pair
could reach — and seven that were solvable by one of the two animals the trial
hands you.

The seven were fixed systemically rather than one at a time: an answer must be
*bred*, and a homozygous clause now requires two copies so a hemizygous cock
stops satisfying "breeds true" by existing. A rule beats editing seven starting
pairs and hoping the eighth never happens.

Generations do not separate the tiers — the solver breeds far more per
generation than a ten-berth trial ranch can hold — so difficulty is measured as
offspring examined, which rises 4 / 9 / 24 / 51 / 58 across the five tiers.

### D67. The Daily Genome reads its target off the pair

A generated target the given pair cannot reach is a day on which every player in
the world fails, and there is no patch that can un-ruin it. So the generator
draws the pair first and derives the puzzle from it: an allele both parents
carry can always be fixed, a phenotype one of them shows can always be thrown
again.

Two contradiction classes surfaced and were closed — asking for a lethal's
phenotype alongside a clean panel (showing it *means* carrying it), and fixing
an epistatic gate shut while asking to see what it masks. 180 consecutive days
now solve, and the test walks six months.

### D68. Genome codes fail loudly or not at all

Rival Ranch and the Stud Exchange move a genome between two machines that never
talk. The outcome that must not happen is a code decoding into a *different but
valid* genome: the player breeds to it, gets an inexplicable result, and
concludes the genetics are broken.

Every code carries a checksum, and a test corrupts every character position to
every other symbol — over three thousand mutations — and asserts that not one is
accepted. Crockford's base32 so there is no 1/l or 0/O confusion, and the
decoder folds the confusables and forgives hyphens, because people add hyphens.

A packed format would halve the ninety-five characters. It was not worth it:
ninety-five and fifty are both "paste it" lengths rather than "read it aloud"
lengths, and a decoder anyone can follow is worth forty-four characters.

### D69. A ghost cannot be hurt, and a stud is never yours

Rival Ranch is a measuring instrument. A snapshot fights identically every time
it is challenged, nothing carries out of the fight, and no creature can be lost
— §4 says ghost data, and ghost data has nothing at stake but the record.

The Stud Exchange gives you one gamete's worth of someone else's work and
nothing else. The stud is not on your ranch, has no pedigree there, and
therefore contributes Wright's F of exactly zero — which is the entire reason a
closed herd pays the fee, and the reason the mode is a relief valve rather than
a shop. He does join the pedigree as an unrelated founder, because without a
record his descendants would have a father the kinship maths cannot see and
every F downstream would be quietly wrong.

The fee is charged whether or not the pairing takes. A stud fee is not refunded
for a barren season, and neither is a mutagen.

### D70. Legacy tightens the bottleneck instead of inflating the opposition

§4 asks for "harder trials" on NG+. Multiplying the opposition's numbers would
be wrong twice over: it makes combat the difficulty, and combat is the fitness
function rather than the game.

So each depth starts from fewer founders and a smaller ranch. The closed-herd
problem — the thing the entire inbreeding model exists to create — arrives
sooner and bites harder, and at depth 3 you begin with a pair and eight berths.
Founders never fall below two, because a run that cannot start is not
difficulty.

The ancestor carries its genome and its revealed loci. Not its raising, not its
branch, not its bond: carrying a finished animal across would delete the raising
game for a generation, and the genome is the part that was earned.

### D71. A trial is a whole second ranch, not a mode flag

Breeding Trials and the Daily Genome open a side `RanchState` that the rest of
the app operates on unchanged. Pairing, the Punnett predictor, the pedigree view
and the creature panel all work inside a trial without a single screen knowing a
trial exists.

The closed-ranch rules are enforced in the reducer rather than by convention:
`state.trial` caps generations and refuses wild stock, so a puzzle cannot be
solved by walking to the reedbank and catching the answer.

---

## Phase 7 — Polish

### D72. A voice is a phenotype, so it is data

`@chimaera/audio` produces specifications and never touches Web Audio. The
obvious reason is that a pure function is testable headlessly. The real one is
that §7 asks for "every creature you breed sounds like itself", and that is a
claim about *reproducibility*: the same animal must sound the same forever, two
animals a player cannot tell apart by looking must not be distinguishable by
ear, and a well-bred line has to sound like a line. None of that survives being
tangled up with an audio context.

`Math.random` is banned in `packages/audio` for the same reason it is banned in
genetics and game. The one exception is the breath noise inside the Web Audio
engine, which is presentation and not simulation.

The mapping is deliberately over-driven: two octaves of pitch across a species'
vigour range sounds exaggerated in isolation and is exactly right in play,
because the player hears one call at a time and has to be able to tell two
siblings apart. A test measures it — if the widest voice difference within a
species falls below a threshold, the voice system is decoration rather than a
channel.

### D73. The score is layers, never arrangements

§7 asks for a theme that adds instruments as the ranch grows. Layers over one
slow harmonic cycle, each fading in across a band rather than switching on. The
music never restarts, never crossfades, and never announces that something has
changed — it is simply thicker than it was an hour ago, which is the only way
this effect works.

The thresholds are far apart on purpose. A layer that arrives every time the
herd grows by one is a slot machine.

### D74. Battle tempo tracks the whole field, not your half of it

Tempo rises as the field empties, whoever is losing. Tying it to the player's
side would tell them the result before the fight resolved, which in a mode with
no input during the fight is the only thing the audio could spoil.

### D75. The QR encoder is written here

§8.1 wants a QR code as a v1 primitive. It is written from the specification
rather than pulled in, because the runtime dependency budget is zero and a QR
code is a finished forty-year-old format with no maintenance surface — there is
nothing to keep up with, and a test can check it against known-good output.

There is no decoder available offline, so the test file contains one: the
inverse of every step, plus two things the inverse cannot fake. The
Reed-Solomon syndromes must vanish, which is exactly what a scanner computes
before it trusts a block. And the error-correction codewords are checked
against the specification's own worked example, which is the only check in the
file that does not depend on code written here.

Both of the bugs it found produce a structurally perfect matrix that decodes to
noise: a generator polynomial built constant-first while the division treated
index 0 as leading, and a zig-zag that computed a shifted column at the timing
stripe without moving the loop variable — visiting column 4 twice and column 6's
partner never.

### D76. The Compendium records what you have seen, and ids are not unique

An encyclopaedia that listed the gene map on day one would hand the player the
answer to every puzzle in it, so unseen entries keep their slot and lose their
content. Completion counts the whole roster rather than what has been unlocked,
so it starts near zero and is honest about how much fen there is.

Building it surfaced a modelling bug that had been latent since Phase 5: allele
and epistasis ids are unique *within* a gene map and not across them. `A_umbral`
is the novel affinity allele on all six species and two species both call their
pigment gate "albinism", so one discovery credited several — and the Compendium
topped out at 90% with everything found. Both are now species-qualified, with a
v5 migration that credits only species the player has actually met.

### D77. Offline moderation refuses mechanics, not meanings

§8.2 wants community allele naming "subject to moderation". A shipped word list
is a losing game and everyone knows it. What an offline build can honestly do is
refuse the mechanical abuses — impersonating the station's own voice, unreadable
scripts, zero-width characters, shouting, padding — and say *which*, because a
name box that says "invalid" teaches nothing. Names in any script are welcome.

The name is recorded with the day it was given, so a server that later has to
arbitrate between two stations has the evidence rather than a guess.

### D78. A certificate fetches nothing and prints no genome

§8.4 asks for exportable, printable pedigree images. One self-contained SVG: no
fonts, no images, no script, and a test asserts the only URL in the file is the
SVG namespace. A certificate has to survive being emailed, printed and opened in
five years, and every external reference is one more way for it to arrive blank.

The genome travels only inside the QR. A recipient gets the animal — they can
breed to it — and not the answers: they still have to spend their own lenses.

### D79. Migrations run on the ranch's calendar

§8.5 wants rotating limited-time gene pools as the live-ops spine. They run on
the player's own days rather than the wall clock, because the simulation has
never been allowed to see a `Date` and because someone who plays in bursts
should not be punished for it. The Daily Genome is the single exception and is
keyed to a real date explicitly, since its whole point is that everyone gets the
same puzzle on the same morning.

A migration boosts rather than guarantees: one copy, at a few percent, on one
haplotype. A wild animal carrying two of a novel allele would make the season a
giveaway rather than a lead.

### D80. Five hundred tab stops is a wall, not navigation

The herd grid is one tab stop with a roving focus and arrow keys, which is the
only way five hundred cards are reachable from a keyboard. Two skip links sit
above everything, because nineteen stops between the top of the page and the
first creature is a toolbar you have to get *past*.

Found by measuring rather than by reading the markup: a script walks the tab
order, counts the stops, and looks for controls with no accessible name.

---

## Quality control after Phase 7

### D81. The specimen label is measured, not hoped at

The plate's caption was one line of SVG text with nothing checking its width.
About a third of the captions the six species can produce ran past the measuring
rule they sit under, and nearly a fifth ran off the edge of the paper and were
clipped mid-word by the viewBox — an animal whose label read `hidden / conical /
barred / collar+flecks — hen-f` and stopped. SVG has no text wrapping, so this
was never going to fix itself.

The fix is a measured one. `textfit.ts` carries a per-glyph advance table read
out of a browser with `getComputedTextLength`, which reproduces a real caption's
rendered width to better than half a percent; `journalFrame` wraps on it into two
lines. The plate grew from 240x160 to 240x170 to hold the second line, which
costs the creature nothing — it stands on `BASELINE`, which never moved, and the
silhouette test crops to the animal rather than the paper.

Two things cover a reader whose machine has a font the table has never measured:
every break is chosen against a budget padded by 15%, and any line that still
lands near the edge is pinned with `textLength`, which hands the fit to the
browser. Across the roster nothing needs pinning and nothing elides — the worst
line fills 87% of the paper.

Caught by looking at a screenshot of a 500-creature herd, which is the argument
for taking the screenshot. The regression test asserts the defect as well as the
fix: it measures how many captions *would* have been clipped, so a return to one
line fails loudly rather than quietly.

### D82. Five hundred creatures, measured again at the end

§10's target was re-checked on the finished app rather than on the Phase 3 app
that first met it — with audio running, five species mixed in one herd, and a
bundle three times the size. A mixed herd on purpose: 500 copies of one animal
would let a renderer, a voice table and a Compendium all cheat.

500 creatures reach first paint in 151ms, mount 20 of 500 cards, and hold 3,539
DOM nodes at their widest. A 44-step sweep of the whole herd logs **no long tasks
at all** — not a fast worst frame, but nothing that blocked the main thread for
50ms, which is what dropping a frame actually is. A lap of all nine tabs with the
same herd loaded logs none either. Scroll steps run 18ms median, 30ms worst;
forty arrow-key moves cost 674ms; selecting a card — which expresses a phenotype,
draws it and voices it — costs 21ms.

### D83. One file, and a seam where the host does the saving

`npm run build:standalone` folds the build into a single HTML file: styles and
app inlined, and the expedition worker handed to a classic `Worker` as a blob,
which works because that chunk compiles to a closed IIFE with no imports. It
runs from a file:// URL, a static host, or a page sandbox — no server, no
sibling assets.

The worker reference is found by scanning for a balanced `new Worker(...)`
rather than by matching a pattern: Vite nests it a few `new URL` layers deep,
and parentheses are not a job for a regular expression. If the bundle shape ever
changes the tool fails loudly instead of shipping a page whose expeditions
quietly never return.

Export and the lineage certificate needed a seam. Both built a Blob and clicked
a detached anchor, and a hardened sandbox does not refuse that — it silently
does nothing, which is the worst way for an Export button to behave.
`src/download.ts` now looks for a `window.__verdanceSaveFile` bridge before
falling back to the anchor, and the standalone tool installs one for hosts that
mediate saves themselves. The game learns nothing about any particular host; it
only knows there might be a bridge.

`npm run typecheck` now also runs the UI's own config. It was outside `tsc -b`
— the app is not a composite project — so a type error in the React code could
only be caught by remembering to check it by hand, which is not a gate.

---

## Phase 8 — Sprites

### D84. The field journal was the wrong medium for a game

§6 asked for a naturalist's field journal, and that is what shipped: smooth
vector animals, ink on paper, a typeset specimen label. It is coherent and it
photographs well and it is not a game. Played, it reads as a diagram of a
creature rather than as a creature, and the player told us so.

So the animals are sprites now — 96 by 96, the Gen-5 battle convention, drawn in
a fifteen-colour ramp with hard edges and a lit surface. The reference is Spore
rather than any Pokémon game: creatures visibly *assembled* from parts, because
that is what this game's animals actually are.

Nothing was licensed and nothing was hand-drawn. `pixel/sprite.ts` draws every
creature procedurally from the same Phenotype the illustration renderer reads —
which is what makes five hundred animals affordable, and what keeps the rule
that the picture can never leak a genotype the player has not earned.

The order of work is the reason it reads: lay down *material* (which substance
is at each pixel), compute *light* once over the finished silhouette, then
resolve *colour* from the pair. Shading after the whole animal exists is what
makes the limbs, crown and trunk look like one creature lit from one direction
instead of separate shapes that each brought their own gradient.

### D85. What the first draft got wrong

Worth recording, because each of these looked fine in code and terrible on
screen:

**Thin features came out as dark pipes.** A stalk or a whip tail is *entirely*
edge, so every pixel of it landed in the shadow rungs. The fix measures how
thick the feature is at each pixel — the deepest point nearby, not the depth
here — and lights a slender thing like a slender thing.

**Bipeds got one centred leg**, because a single limb pair was drawn as a single
strut. Every upright species had a pogo stick.

**The eye was one pixel.** Adding a real eye — sclera, pupil, catchlight — and a
mouth line did more for the whole roster than every other change combined. It is
the difference between a shape and a creature, and Spore's animals are legible
for exactly this reason.

**A second limb pair on an upright animal is arms, not more legs.** Drawn as
legs, the two upright species sat 3.3% apart at icon size — which is not two
species, it is one recolour. The Ashen Lorric's own design note says
"long-limbed, with hands too big for it", and drawing that is what separated
them.

**Markings ran down the legs** and bottomed out near black, so a striped animal
was a deckchair and a spotted one looked shot through with holes.

### D86. The silhouette test survives the change of medium

§6.4's rule — six species, pure black, 32 by 32, and it is the measurement that
decides, not the author — is ported rather than retired, at the same 10% floor.
It immediately failed three times and each failure was real: Sallowfinch against
Ashen Lorric (fixed by arms), Kite-Ossel against Silt-Adder (the glider's legs
are the whole difference between it and a snake, so they keep their reach), and
Quillfen against Kite-Ossel (the fen animal is low-slung, so the glider stands
tall). A second, harsher test asks whether any single genotype collapses one
species onto another — a wingless glider, a limbless biped — which the
representative comparison cannot see.

### D87. The main thread never draws a creature

Drawing one costs about a millisecond and a half. That is nothing once, and it
is a dropped frame when a scroll step reveals eight cards while React is
reconciling them. Measured on the 500-creature herd, the first cut of the
sprites produced **twelve long tasks** where the illustration renderer had none,
and scroll steps went from 18ms to 64ms.

Micro-optimising bought back only a fifth of it — the single-pass painter and an
inlined distance transform — so the work moved off the thread entirely.
`sprite.worker.ts` draws, `sprites.ts` caches and coalesces requests into one
batch per frame, and the herd is drawn ahead of the player rather than in front
of them. Back to **zero long tasks**, p50 24ms.

The PNG encoder stayed for anything leaving the page, but the browser never sees
one: encoding a sprite and base64-ing it cost half again what drawing it did,
and the browser only decoded it straight back to the bytes a canvas wanted.

### D88. The fight is watched, not re-run

A battle scene in a deterministic game has one honest shape: the simulation
resolves, and the screen replays what it decided. `simulateBattle` already
emitted a timestamped script — §3 asked for one, spanning twenty to thirty
seconds — and until now the UI threw it away and printed the summary.

So `ActionResult` gained a `playback` field carrying that script plus enough to
draw it: both teams, their genomes, and each bar's maximum. Deliberately *not*
state. The fight is over by the time this exists, and a save is not the place
for twenty seconds of timestamped strikes it will never read again.

Nothing on the canvas can change who won. That is the point, and it is also why
the player can skip it — a replay you are forced to sit through is a loading
screen with a story.

The bar's maximum comes from `maxHpOf`, exported from the resolver rather than
copied into the scene. Two formulas for one number is a bar that disagrees with
the fight it is showing.

### D89. The scene is one canvas on one pixel grid

Everything — ground, platforms, creatures, bars, damage numbers — is drawn to a
single 320x180 canvas and scaled up whole with nearest-neighbour. Compositing
sprites onto CSS-positioned divs would have put the animals on a different pixel
grid from the arena they stand in, and made them the one blurred thing on
screen.

Layout is the arrangement every game in this idiom has used since 1996, because
it reads without being learned: near team low and left and larger, far team high
and right and smaller, and each side's health boxes across the diagonal from its
own animals so neither ever covers the other. The first cut had them on the same
side, which put a bar over the creature it described.

Animation is per-actor and derived from the script rather than authored: a lunge
from the most recent strike *by* an actor, a recoil and a two-frame white flash
from the most recent strike *on* it, and a sink-and-fade on a down. An affinity
hit gets its own colour and the words "well matched", because that is the
genetic lever paying off and it should be visible that it did.

### D90. Knowing what the board wants is not knowing which tab to open

"Not intuitive" turned out to be one specific gap. The campaign has known what
it wants since Phase 5 — the objectives are authored, tested and listed — but
they were listed on the Commission tab, which is the fourth of nine and which a
new player has no reason to open. Everything needed to guide someone was already
in the game and none of it was where they were looking.

`NextStep` puts the next unmet objective under the tab bar on every screen, with
the button that goes where it is done. `Objective` gained a `where` hint for the
handful that are not a pairing; breeding is the answer often enough to be the
default, so only the exceptions say so.

It says *what*, never *how*. That rule is from §4 and it still holds: the lesson
only lands if the player works out the cross themselves, so an unmet objective
shows the board's request and nothing else — the "Why" button opens the
Commission, and the lesson text still only appears after the objective is met.

Dismissable, and it stays dismissed until the objective actually changes. A hint
that cannot be turned off is a nag.

---

## Phase 9 — Anatomy as statline

### D91. Delete the stats

Combat read three abstract numbers — speed, vigour, focus. You bred for "+2
focus" and nothing about the animal in front of you changed, and two creatures
traded one generic strike until one fell over. That is the wrong shape for a
game whose entire subject is heritable form, and it is the single cause of two
complaints that sound separate: the traits are hard to understand, and breeding
feels like a mystery.

Combat now reads *measurements*. Mass in kilograms, tusks in centimetres, hide
in millimetres and what it is made of. Thirteen quantities, every one of them
something the sprite draws and the player can point at.

The genome did not need changing. It was already full of physical things —
`BUILD` is heavy or slight, `LIMB` is paddle or clawed or stub, `TAIL` is fan or
whip — and all of it was being funnelled into three numbers and discarded. The
redesign is not fighting the genome; it is reading it properly for the first
time.

`morphology.ts` lives in the genetics package rather than the game because it is
phenotype interpretation, not a combat rule, and because both the renderer and
the resolver have to agree about how long a tail is. Two readings of one animal
is a creature whose picture disagrees with what it can do.

### D92. A move a creature cannot perform, rather than performs weakly

Each move states anatomy it requires before it exists at all. A creature with no
tusks cannot Gore — not "gores weakly", cannot. A limbless one cannot Trample
and does not want to: it has 183cm of body and Constrict instead.

So breeding does not tune a number, it changes the moveset, and the player can
see which way it went by looking at the animal. The epistasis that hides a
crest now takes the spines with it: you lose a move, and the reason is visible.

Hide replaces the type chart, and unlike a type chart it is guessable — plate
turns a point, slime defeats a grip, bare skin argues with nothing. A player who
has never read the table can still work out that stabbing an armoured animal is
a poor plan.

### D93. Three defects the first cut hid, all caught by measuring

**Two species had a constant mass.** Each species has exactly one continuous
shape value and they are all named differently — `build`, `spines`, `span`,
`coils`, `limbs`. Matching on a pattern silently missed two of the six, leaving
those animals at a fixed weight: creatures you could not breed larger. The frame
now names its own shape value.

**An animal could have a weapon of length zero.** A species with no armament of
its own can still grow one from an allele — the Ashen Lorric's hooked grip is a
beak by any useful definition — and with no fallback proportion those animals
unlocked a beak move and then did nothing with it.

**Bite was available to every animal on the roster.** A move with no gate is an
abstract stat wearing a move's name, so the gape it needs went from four
centimetres to eight. A gape a player has to breed for is a gate; a gape
everything already has is not.

The tests that caught these are the ones worth keeping: every move must be
reachable by some real animal, no move may be available to all of them, and each
species' mass, height and stride must actually spread under breeding.

### D94. Eight measurements, not thirteen

Cut to the set where every survivor gates at least one move *and* has something
the sprite draws: mass, length, limbs, stride, hide, armament, tail, acuity.

The four that went did not vanish so much as move into a slot that already
existed. Venom and a display crest are both *the thing on the front of the
animal*, drawn in the same place as tusks, so they became armament kinds —
`fangs` and `crest` — rather than numbers of their own. Gape folded into mass,
because a big animal has a big jaw and two numbers saying so is one too many.
Height stays as an internal figure the renderer needs to put a head somewhere,
but nothing in combat reads it, so the player never has to learn it.

### D95. What was actually wrong with the sprites

The complaint was that the art is weak, and it was. Rated against fangame
pixel art on eight criteria the first sprites came to 4.4 out of 10, and the
three lowest scores said exactly what to fix: outline craft 3, texture 2, part
separation 3.

The techniques that closed it, in order of how much each was worth:

**A selective contour.** One flat dark line all the way round is the loudest
amateur tell in the medium. Two contour colours, chosen per pixel from the light
level of the body pixel it touches, make the light appear to wrap the form.

**Occlusion at the seams.** A leg drawn in the same coat as the flank behind it
is invisible until the contact between them is darkened. One rung, from the part
map, and the limbs stopped dissolving into the trunk.

**A ramp that rotates.** The first ramp slid one colour's lightness up and down,
which reads as one colour at five brightnesses. Nine steps with hue rotation —
shadows swinging cool, highlights warm — and saturation arching so both ends
desaturate.

**Material.** Plate gets segment bands with a lit lip, scale an offset lattice,
fur short strokes denser in shadow, slime hard speculars, bare skin a broad
sheen and creases. This is the hide measurement made visible, so the most
important defensive number in the game is now something you can see.

**Dithered band edges.** Six flat bands meeting on clean curves is a posterised
gradient, which is what it was. Interleaving adjacent rungs on one parity is
most of what makes a sprite look worked rather than generated.

**A ground bounce.** A weak second light from below stops the whole underside
collapsing into one flat core shadow.

**A face.** Brow, sclera, pupil, catchlight, nostril, and a mouth with the
corner turned down. The brow alone is worth more than it looks: it is the
difference between an animal that has an eye and one that is looking at
something.

Second rating: **7.8**. The Kite-Ossel is the weakest at about 6.5 and drags the
set; the Bramblehog and the Ashen Lorric are around 8.5.

### D96. The heavier renderer stays off the main thread

Texture, dithering and occlusion took a sprite from 1.6ms to 3.5ms. On the main
thread that would have been the twelve-long-task regression all over again. It
is not on the main thread, so the 500-creature herd still measures zero long
tasks at a p50 of 17ms — the worker simply spends longer drawing where nobody
is waiting on it.

### D97. The chrome was the web app showing through

The sprites had been rebuilt twice and the app still did not look like a game,
because everything around them was a web page: rounded cards, blurred drop
shadows, a serif body face, and native `<select>` controls rendering a
platform-styled pill in the middle of a pixel panel.

Four changes, none of them clever:

**A window is four values.** A face, a near-black outer edge, a lit bevel on the
top-left and a shaded one on the bottom-right, drawn with inset shadows.
Everything panel-shaped in the app is built from those, and a `.win-deep`
variant with the bevel reversed reads as pressed into the board rather than
standing on it.

**Buttons invert when pressed.** The bevel flips and the padding shifts a pixel.
It costs four lines and it is most of what makes a control feel like a game's
rather than a form's.

**Hard shadows.** A blurred shadow is the one thing on a pixel screen with no
pixels in it, so cards throw a three-pixel offset block instead.

**Pixel type.** Silkscreen is a true bitmap face and only reads at whole pixel
sizes, so it takes the short labels; Pixelify Sans carries running text, where a
strict bitmap face becomes unreadable at length.

### D98. The box speaks from the same script the canvas plays

A message box that narrated separately from the animation would be a second
source of truth about a fight that has already been decided. It reads the same
compressed log, types out at forty-six characters a second, and is written in
the naturalist's register rather than as a damage readout — "Umber struck Reed
for 17" tells the player more about their breeding than a bare number does.

It also caught a real bug. The scene's clock had to reach React for the box to
follow it, and the moment it did, the text typed one letter and stopped: the
animation effect depended on a `Map` and two arrays rebuilt on every render, so
every state update tore the loop down and restarted it. The sprites are now
looked up inside the effect, where `ready` has already established they are
cached.

### D99. The build panel is the answer to "I don't understand the traits"

The eight measurements and the moves they unlock sit a centimetre apart on the
creature panel, because they are the same information. A creature with no tusks
has no Gore, and putting the cause next to the effect means the player never has
to be told the rule — which is the same reason the sprite had to start drawing
the armament.

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

**A3. RESOLVED in Phase 5 (D51).** Chapter 1 now teaches dominance on a locus
explicitly chosen to contain no lethal, and chapter 5 teaches lethals on
purpose. A player still meets a failed egg early; they now meet the explanation
in the chapter built for it. Original argument follows.

**A3. Lethal alleles at 4% wild frequency.** High enough that a player meets one
in their first hour, which the campaign needs. It also means roughly 1 in 600
wild-pair eggs fails to a doubled lethal before the player has any idea why.
That is the intended lesson, but it wants a tutorial beat in Chapter 1, not
Chapter 5.

**A4. RESOLVED in Phase 6a (D60, D61, D62).** Original argument follows.

**A4. Ranch state is single-species.** `applyAction(state, action, map)` takes
one gene map, so a save holds one species' stock. Six species ship, and each is
played on its own ranch. That is defensible for the campaign — a commission is a
posting, and the eight chapters are the same eight lessons wherever you take
them — but §4 mode ideas like Stud Exchange and Exhibition want mixed stock, and
Phase 6 will need `mapFor(creature)` threaded through breeding, combat and
expeditions. Flagged now because it is a reducer-shaped change, not a UI one,
and it is cheaper before the mode surface grows.

**A5. The Stud Exchange and Rival Ranch are honour systems.** §4 asks for a
social layer with no server, and ghost data delivers that — but a player who
edits a pasted ghost or a stud offer can hand themselves a perfect animal.
Signing would need a key, and a key shipped in the client is not a key. The
current position is that this is a single-player game with a paste box, that
cheating in it costs the cheat and nobody else, and that the correct time to
solve it is when there is a leaderboard worth defending. Flagged so that
decision is deliberate rather than assumed.

**A6. The Daily Genome leaderboard is local.** §4 calls for a global one, which
needs a server, which the brief also says v1 does not have. Scores are computed,
integer, deterministic and stored per date, so a leaderboard is a submission
endpoint away — but there is no endpoint, and a "global leaderboard" that only
ever shows one player would be a worse lie than an honest local best.

**A7. The layered score has no composer.** §7's adaptive score is implemented as
a slow four-chord cycle with eight synthesised layers, which is enough to
demonstrate the mechanic and is not music. The architecture is right — layers
that fade rather than arrangements that swap — and the moment there is a
composer, the same layer table takes samples or stems instead of oscillators
without anything else changing. Flagged so nobody mistakes the placeholder for
the intent.
