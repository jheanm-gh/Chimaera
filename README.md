# Chimaera — "Verdance" (working title)

A genetics-first creature breeding game. You breed creatures whose appearance
and abilities are generated from a real, simulated genome. Everything else —
combat, exploration, story, economy — exists to give you a reason to breed, a
way to test what you bred, and new genes to breed with.

**The design law:** if a feature does not create pressure on the breeding
decision, it does not ship.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Genetics core + test suite | done |
| 2 | Renderer: genotype to creature image | done |
| 3 | Core loop: breed, hatch, raise, age, die | done |
| 4 | Combat and expeditions | done |
| 5 | Content: six species, evolution, campaign | not started |
| 6 | Modes: Daily Genome, Trials, Exhibition, Legacy | not started |
| 7 | Polish: audio, compendium, genome codes, a11y | not started |

## Layout

```
packages/genetics    pure simulation — zero runtime dependencies, headless
packages/rendering   genotype to drawing data; SVG and silhouette serialisers
packages/game        state, progression, economy — pure, serialisable, no clock
packages/ui          the React app, a thin render layer over packages/game
```

`packages/genetics` is the product. It has no knowledge of rendering, saves, or
gameplay, and an eslint rule forbids it from importing any other package. A
second rule bans `Math.random()` anywhere in the simulation: every draw comes
from an injected seeded RNG, or Daily Genome, replays and shareable genome codes
all quietly break.

## Commands

```bash
npm install
npm test          # the full genetics suite
npm run typecheck
npm run lint
npm run check     # all three
npm run sim       # breed three populations over 20 generations and report
npm run gallery   # write out/gallery.html: a plate of 50 generated creatures
npm run dev       # the game, at http://localhost:5173
npm run build:app # production build of the app
```

`npm run sim` is the Phase 1 deliverable: it runs an open ranch, a closed ranch
and a six-founder line-breeding herd side by side against the same gene map, so
the inbreeding, linkage and lethality maths can be inspected before anything is
pretty.

```bash
npm run sim -- --seed=mirefen --generations=20 --founders=40 --capacity=60
```

## What the genetics engine covers

Diploid, three autosomes plus an XY pair. Linkage and crossover with per-gap
recombination from map distance (Haldane, exactly additive). Simple dominance,
incomplete dominance, co-dominance, polygenic stats, epistasis, sex linkage,
sex-limited expression, and recessive lethal alleles. Point, novel and
copy-number mutation with mutagen loads that always cost something. Wright's
coefficient of inbreeding from the pedigree, with a tuned penalty curve.
Epigenetic inheritance bounded so genes always dominate outcome. And a Punnett
predictor that reasons from what the player *knows*, returning honest ranges
where their information runs out.

## What the renderer covers

Nine part slots — body, head, limbs, tail, dorsal ridge, crest, marking layer,
palette, size — each driven by named loci. Parts are parametric generators, so
continuous loci give continuous variation. The renderer reads a phenotype and
never a genome, so the picture cannot leak information the player has not
earned. Output is drawing data; an SVG serialiser and a silhouette rasteriser
consume it, which makes §6.4's "identifiable in pure black at 32x32" an
executable test rather than a note — it measures coverage, connectivity, spread
and distinctness, and it has already caught two real rig bugs.

Colourblind modes remap the species' hue arc onto an axis each vision type
retains, preserving ordering, and every marking carries a hatch texture so
colour is never the only channel.

## What the core loop covers

Egg to hatchling to juvenile to adult to elder, with fertility opening in
adulthood and closing before death, and an Archive that retires a favourite
instead of losing it. Four raising axes — diet, habitat, training, bond — each
with a genetic interaction, and growth that closes asymptotically on the
ceiling, so raising approaches genes and can never pass them. Branching
evolution decided by genotype plus raising path plus bond plus held item plus
habitat, previewable as counts but never as a recipe.

The ranch screen shows the herd; the pairing screen shows Wright's F for the
pairing you are considering and a Punnett predictor that reads only what you
have actually established, widening into ranges where your knowledge runs out.
The pedigree view is free and always available, because a careful reader should
be able to deduce a genotype without spending a lens.

Saves are versioned JSON in IndexedDB with export and import to file, and a
migration chain that exists before there is anything to migrate.

## Combat, and what it is for

Combat is the fitness function, not the game. A team of three, roles, stances
and equipment are set beforehand; then it resolves with no input possible.
Equipment is capped at a fifth of effective power, deterministically, and a test
sweeps every loadout to prove it. Affinity is a co-dominant locus, so hybrids
average both matchups — rounder defensively, blunter offensively.

Variance is per-fight rather than per-hit, because per-hit noise averages away
over fifty blows and makes win rate a step function of genetic advantage. The
calibrated curve gives a 5% better lineage about 80% and a 10% better one about
94%, so genes dominate while the band real breeding decisions live in still has
resolution worth sampling.

The League is safe and repeatable — it is the scoreboard. Bulk evaluation runs
fifty to a thousand fights in a Web Worker and reports win rate and per-creature
survival, which is how you find out which of your three keeps dying.
Expeditions are the risk: a procedurally generated region, damage that carries
between nodes, and permadeath.

See `DECISIONS.md` for why each of those works the way it does.
