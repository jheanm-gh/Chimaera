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
| 2 | Renderer: genotype to creature image | not started |
| 3 | Core loop: breed, hatch, raise, age, die | not started |
| 4 | Combat and expeditions | not started |
| 5 | Content: six species, evolution, campaign | not started |
| 6 | Modes: Daily Genome, Trials, Exhibition, Legacy | not started |
| 7 | Polish: audio, compendium, genome codes, a11y | not started |

## Layout

```
packages/genetics    pure simulation — zero runtime dependencies, headless
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

See `DECISIONS.md` for why each of those works the way it does.
