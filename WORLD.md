# The Verdance — a world bible

> §8.6: *"Named regions, factions, a written ecology. Even if the story is
> small, write the world large."*

This document is the fiction the game already enforces. Every biome named here
is a place the code can send you; every species' habits are the habits its gene
map actually produces; every faction wants something the mechanics let it have.
Where the fiction and the simulation disagree, the simulation is right and this
file is a bug.

---

## 1. The shape of the world

The Verdance is a wet country of six connected habitats, none of them more than
a few days' walk from the next, and all of them downstream of the same
catastrophe.

Two centuries ago the Verdance was farmed. Not for food — for *forms*. The great
houses bred creatures to specification and traded the specifications, and for
about ninety years it worked spectacularly. Then it stopped, in the way these
things stop: not with a plague but with a slow narrowing, herd after herd, as
every house bred toward the same fashionable animal and quietly discarded
whatever did not serve it.

By the time anyone measured, the wild populations had inherited the bottleneck.
The houses had been releasing their culls into the fen for a century and the fen
had been breeding them back. Nobody poisoned the Verdance. It was *selected*
into a corner, and then abandoned there.

What is left is a landscape that looks healthy and is not. There are animals in
every biome. There are not enough *different* animals in any of them.

**The restoration is the game.** The stations exist to put variation back.

---

## 2. The six biomes

### The Mirefen

Standing water among reed shadow, black to the knee and warmer than it looks.
Home of the **Quillfen**. The oldest of the great houses stood here and the
Mirefen carries the deepest bottleneck: the long-stride allele and the lantern
lethal have travelled together in this population for so long that most fen
keepers assume they are one gene. They are three centimorgans apart.

The Mirefen Station is the usual first posting. It is not the easiest.

### The Deepfen

The same water, deeper and colder, under peat that has not been disturbed in
living memory. Nothing hurries here. Home of the **Silt-Adder**, which is the
only animal in the Verdance that most people would rather not meet and the only
one that has never needed restoring — two lethals in repulsion have kept the
adders' effective population smaller and healthier than anything the houses
managed on purpose.

### The Reedwold

Dry grass to the horizon, seed heads, thorn scrub, and no cover at all. Home of
the **Sallowfinch**. The wold burned three years before the campaign opens and
what came back is not quite what left. Sallowfinch genetics live largely on the
sex chromosome, which means the Reedwold's cocks advertise everything they
carry and its hens carry the future invisibly — a fact the houses never
understood and every good wold-keeper does.

### The Thornbrake

Chalk under bramble tunnels, dry and defended. Home of the **Bramblehog**. The
Thornbrake houses bred for armour and got it, along with two lethals sitting in
the same keratin they were selecting on. A brakekeeper's first lesson is that a
blended trait is not a safe trait.

### The Galeshore

Sea cliffs, updraught, salt wind, and the sound of something very large moving
very quietly. Home of the **Kite-Ossel**. The shore is the one biome the houses
mostly failed at, because a Kite-Ossel that loses its wing loses its pattern in
the same animal — the trait and the evidence go together, and a breeding
programme that cannot see what it is selecting is not a breeding programme.

### The Ashlands

Warm rock, thin soil, standing heat that does not lift at night. Home of the
**Ashen Lorric**. The last biome anyone surveys and the one that has undone the
most careers: its pigment cascade runs through two switches rather than one, so
the test cross that solved every other species returns a contradictory answer
here. Lorric-keepers are unpopular at gatherings because they are always right
and it is always about something tedious.

---

## 3. The six species, as animals

Their genetics are in `packages/genetics/src/species/`; this is what they are
like to be near.

| Species | Reads as | Its problem |
|---|---|---|
| **Quillfen** | A neotenic salamander with a crested newt's ridge, patient and territorial about nothing | A lethal three centimorgans from the best speed allele in the fen |
| **Sallowfinch** | A ground-feeding finch with a quail's body and a thief's habits | Almost everything worth having is on the X |
| **Bramblehog** | A hedgehog wearing a pangolin's plate, entirely certain it is winning | Blended spines behind a keratin switch, and two lethals in the armour |
| **Kite-Ossel** | A flying squirrel's membrane on a manta's proportions | A recessive that removes the wing and the pattern together |
| **Silt-Adder** | A caecilian's body carrying a moray's head | Two lethals in repulsion, so healthy-looking wild stock is often a double carrier |
| **Ashen Lorric** | A tree frog's hands at a sloth's tempo | A two-stage pigment cascade that punishes the habits every other species taught you |

### What eats what

Very little. This is the point of the Verdance and the reason the fiction is a
restoration rather than a hunt: the six are not predators of one another and
never were. They partition the same wet country by *tempo* — the Quillfen holds
still, the Kite-Ossel arrives and leaves, the Lorric takes a week to cross a
room — and the houses' great error was reading that as six ways of solving the
same problem rather than six different problems.

The League and the expeditions are contests, not hunts. Nothing in the Verdance
is trying to eat you and nothing you breed is trying to eat anything.

---

## 4. Factions

### The Restoration Board

Your employer, and the closest thing the Verdance has to a government. Eight
commissioners, none of whom agree, all of whom sign the same commissions. They
are bureaucratic, underfunded, and completely serious: the board is the only
institution that measured the bottleneck before it became visible, and it has
been unpopular ever since for having been right early.

The board pays in motes and in postings. It does not pay well.

### The Houses

What is left of the great breeding houses. Six or seven of them still hold
studbooks going back two hundred years, which makes them simultaneously the
cause of the collapse and the only people with records of what was lost. Most
have adapted; a few are still breeding for fashion and are quietly furious
about being asked to stop.

The Stud Exchange is a house institution. The board tolerates it because it
works.

### The Wardens

Not an organisation — a habit. Wardens keep stations, run their own lines, and
turn up at each other's postings when something has gone wrong. There is no
membership and no leadership, and the only test of whether you are one is
whether other wardens come when you send for them.

You are a warden. This is the job.

### The Shows

The Exhibition circuit, and the oldest continuous institution in the country.
Parish shows, county shows, the National. The judges are conservative,
opinionated, and rotate their standards every season for reasons they will not
explain — which, whatever they intended, is the single thing that has kept the
show ring from narrowing the gene pool the way the houses did. A standard that
changes cannot be bred toward forever.

---

## 5. The calendar

Two clocks run over the Verdance and neither is the player's.

**Show seasons** turn every thirty days. Five standards in rotation, each
wanting something the last one did not.

**Migrations** turn every ninety days. Six of them, one per species, and each
puts something in the wild pool that is not otherwise there. Miss the Crown Run
and the crown ridge goes back to being a mutagen-and-luck proposition until it
comes round again.

Both run on the ranch's own days, not on the wall clock. A warden who plays in
bursts is not punished for it. The one exception is the Daily Genome, which is
keyed to a real date on purpose, because the entire point of it is that everyone
in the world gets the same puzzle on the same morning.

---

## 6. What the world is *for*

Every piece of fiction here exists to make one decision heavier: **which two
animals you put together.**

The bottleneck is the reason outcrossing matters. The biomes are the reason
travelling matters. The houses are the reason there is a stud to borrow. The
board is the reason there is a specification to hit. The shows are the reason a
beautiful animal is worth breeding when a fast one would win more fights.

If a piece of this world ever stops doing that work, it should be cut — the same
rule the code is held to.
