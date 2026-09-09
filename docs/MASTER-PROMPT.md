# MASTER BUILD PROMPT — "Verdance" (working title)
### A genetics-first creature breeding game

Paste this whole document into Claude Code as the opening prompt. It is the design bible and the build order. Treat every section as binding unless I tell you otherwise in a later prompt.

---

## 0. THE ONE-LINE PITCH

You breed creatures whose appearance and abilities are generated from a real, simulated genome. Everything else in the game — combat, exploration, story, economy — exists to give you a reason to breed, a way to test what you bred, and new genes to breed with.

**The single design law:** if a feature does not create pressure on the breeding decision, it does not ship.

---

## 1. CORE PILLAR: THE GENETICS ENGINE

This is the product. Build it first, build it standalone, and build it with tests. It must be a pure TypeScript module with **zero UI or rendering dependencies**, runnable headless in Node.

### 1.1 Genome structure

- Diploid. Every creature has two alleles per locus, one from each parent.
- Three chromosomes. Loci sit at fixed positions on a chromosome.
- **Linkage and crossover:** during gamete formation, loci that sit close together on the same chromosome tend to inherit together. Implement crossover with a per-gap recombination probability derived from map distance. This produces *linkage drag* — the trait you want arrives welded to a trait you don't, and breaking the linkage takes generations. This is the single best source of long-term player problems in the whole design. Do not cut it.
- Sex chromosomes. At least two sex-linked loci so some traits only express in one sex.

### 1.2 Inheritance modes — implement all of these

| Mode | Effect | Example locus |
|---|---|---|
| Simple dominance | One allele masks the other | Horn presence |
| Incomplete dominance | Heterozygote blends | Body colour hue |
| Co-dominance | Both express simultaneously | Patterning (two marking types layered) |
| Polygenic | 3–5 loci sum to a stat value | Vigour, Speed, Focus |
| Epistasis | One locus gates another entirely | A "pigment switch" locus that, when recessive-homozygous, makes all colour genes invisible → albino |
| Sex-linked | Expression depends on sex | Crest display, certain elemental affinities |
| Lethal alleles | Homozygous recessive = egg fails to hatch | The prized "Prism" allele — beautiful in heterozygote, fatal when doubled |

The lethal allele is a franchise-grade mechanic. Players will chase a trait that can never breed true, forever. Include at least two.

### 1.3 Genotype vs phenotype — the information game

Players see the **phenotype** (what the creature looks like and scores). The **genotype** is hidden. Revealing it is a whole progression axis:

- **Tier 0:** observe phenotype only. Deduce by test-breeding.
- **Tier 1 — Field Lens:** reveals one locus of the player's choosing per creature.
- **Tier 2 — Assay Bench:** reveals all coat/form loci, not stat loci.
- **Tier 3 — Deep Sequencer:** full genotype, late game, expensive per use.
- **Pedigree view:** always available, always free. A family tree that lets a smart player infer genotypes from ancestry without ever buying a lens. Reward the player who thinks.

Build a **Punnett predictor** UI that, given two selected parents and whatever the player currently *knows* about them, shows the probability distribution of offspring outcomes — with unknowns shown as uncertainty ranges, not hidden. The tool is only as good as the player's information. That's the loop.

### 1.4 Mutation

- Baseline point mutation: low rate per gamete, flips an allele to another existing allele in the pool.
- **Novel alleles:** a much rarer event producing an allele that does not exist in any wild population. These are the game's treasure. Each novel allele has authored art and an authored name slot.
- Mutagenic items and environmental exposure raise the rate, at a cost (fertility loss, shortened lifespan, higher lethal risk). Risk/reward, never free.
- Copy-number events: rarely, a locus duplicates, letting a creature carry three alleles. Deeply weird, deeply desirable, mildly game-breaking in a fun way.

### 1.5 Inbreeding

Compute a coefficient of inbreeding (Wright's F) from the pedigree. Above thresholds, apply escalating penalties: reduced fertility, higher stillbirth rate, stat depression, higher lethal-allele expression.

**Purpose:** this forces the player back out into the world to catch wild stock. It is the engine that keeps exploration relevant for 200 hours. Tune it so that pure line-breeding is viable for ~4–6 generations before it hurts.

### 1.6 Epigenetics (the Lamarckian layer)

How you raise a creature affects expression *and* a small heritable fraction:

- Genes set the **ceiling** for each stat. Raising determines how close to the ceiling you get.
- A creature raised well passes a small bonus (say 10–15% of its own achieved-vs-ceiling margin) to offspring as an epigenetic marker that decays over 2–3 generations if not maintained.
- This makes raising matter without letting it replace breeding. Guard the ratio carefully: **genes must always dominate outcome.**

### 1.7 Testing requirement (non-negotiable)

Before any UI exists, write a test suite that:
- Breeds 10,000 pairs and asserts observed phenotype ratios match expected Mendelian ratios within tolerance (3:1, 9:3:3:1, etc.)
- Asserts linkage produces correlated inheritance at the expected recombination frequency
- Asserts inbreeding coefficient calculation against hand-computed pedigrees
- Asserts determinism: same seed + same parents = same offspring, always

Deterministic seeded RNG throughout. No `Math.random()` anywhere in the sim.

---

## 2. LIFE CYCLE, RAISING AND EVOLUTION

### 2.1 Life stages

Egg → Hatchling → Juvenile → Adult → Elder → death.

- Time advances in **days**, ticked by player actions and expeditions, not real-world time. No energy timers, no push-notification farming. Respect the player.
- Fertility window opens in Adult and closes in Elder. Creatures age out. This creates real generational churn and real loss.
- An Elder can be **retired to the Archive** instead of dying: it stops breeding but its genome is permanently preserved and viewable. Emotional off-ramp for a favourite creature.

### 2.2 Raising axes

Four levers, each with a genetic interaction:

1. **Diet** — shifts which polygenic stats approach their ceiling
2. **Habitat** — biome-matched habitats boost expression; mismatched suppress it
3. **Training regimen** — direct stat growth, costs days of life
4. **Bond** — grows with attention, gates evolution branches and combat reliability

### 2.3 Evolution — branching, not linear

Evolution triggers at stage transitions. The branch taken is a function of:

`genotype + dominant raising axis + bond level + item held + habitat`

The same genome, raised differently, produces visibly different adults. Target **3–5 branches per species**, with at least one branch per species that requires a specific rare genotype *and* a specific raising path — a genuine secret worth a wiki page.

Evolution must be **previewable but not guaranteed**: show the player which branches are currently in reach, without telling them the exact recipe.

---

## 3. COMBAT — DELIBERATELY IN THE BACK SEAT

**Combat is the fitness function, not the game.** It exists to answer "was my breeding good?" It must never become the place where player skill overrides genetic quality.

### Rules for combat design

- **Auto-battler.** Player sets a team of three, assigns roles/stances and equipment, presses go, watches. No inputs during the fight. No twitch skill, ever.
- Battles resolve in 20–30 seconds visually, and **instantly in bulk** once the player has cleared that tier. Late-game players simulate 50 fights to evaluate a lineage. Support this explicitly.
- All combat stats derive from genotype (ceiling) and raising (achievement). Equipment contributes **no more than 20% of effective power**. Hard cap this in code and write a test asserting it.
- Type/affinity is itself a genetic trait with its own inheritance, including hybrid affinities from co-dominant loci.
- Combat outcomes feed back into breeding: victories yield **gene fragments**, expedition access, and wild-stock encounters. Combat is a faucet for the breeding economy.

### What combat gives you narratively
The League/Trial structure gives the campaign its spine and its difficulty curve, and it gives the player a legible answer to "am I getting better at genetics?"

---

## 4. GAME MODES AND UNLOCK STRUCTURE

| Mode | Unlocks | Description |
|---|---|---|
| **Story Campaign** | Default | 6–10 hours. Each chapter is a genetics lesson disguised as a plot problem. See §4.1. |
| **Expedition (roguelike)** | Chapter 2 | Take 3 creatures into a procedurally generated region. Permadeath — creatures lost are gone. Rewards: wild specimens, novel alleles, mutagens. The main risk mechanic. |
| **The Ranch (sandbox)** | Chapter 3 | Unlimited free-form breeding, no objectives. Where most hours are eventually spent. |
| **Exhibition / Show** | First novel mutation | Beauty contests judged purely on phenotype — symmetry, rarity, colour coherence, conformation to a rotating standard. Zero combat stats. A complete second meta for players who don't want to fight. |
| **Breeding Trials** | Chapter 4 | Authored puzzles: "produce a creature with traits X, Y, Z in ≤6 generations from this starting pair." Scored on generations used, purity, and inbreeding coefficient. 50+ hand-designed puzzles, difficulty-curved. |
| **Daily Genome** | Chapter 5 | Every player gets the identical starting pair, gene pool and target spec, seeded from the date. One attempt. Global leaderboard. **This is the retention mechanic** — build the seed system to support it from day one. |
| **Legacy / NG+** | Beat story | Restart the campaign carrying forward one archived ancestor's genome. New wild gene pool, harder trials, new evolution branches unlocked. |
| **Async PvP (Rival Ranch)** | Beat story | Fight snapshots of other players' teams. No live netcode, no matchmaking server needed at v1 — ghost data only. |
| **Stud Exchange** | Post-story | Asynchronous sharing: publish a creature as a stud, others breed to it and you receive resources. Social layer without a chat system. |

### 4.1 Campaign structure — genetics taught as plot

Each chapter introduces exactly one genetic concept as a problem the player must solve:

1. **Dominance** — a village needs a creature with a recessive trait that keeps disappearing
2. **Polygenic stats** — a rival wins because their stats stack; you must out-breed, not out-fight
3. **Linkage** — the trait you need is chained to a trait that's killing your creatures
4. **Epistasis** — a locus is hiding all your colour work; find and fix the switch
5. **Lethal alleles** — the region's most beautiful creature can never breed true, and the plot asks why
6. **Inbreeding** — an isolated population is collapsing; restore it with outside stock
7. **Mutation** — engineer a novel allele deliberately, at real cost
8. **Finale** — a breed-to-spec challenge using every concept at once

Write the story around a **conservation-and-restoration** theme rather than a capture-and-compete one. Franchise-durable, culturally safe worldwide, and it makes the ecology fiction do real work.

---

## 5. ITEMS AND EQUIPMENT

Four categories. Combat gear is deliberately the *least* interesting.

**Breeding items** (the good stuff)
- Mutagens (raise mutation rate, cost lifespan)
- Dominance suppressors (force a recessive to express for one generation — doesn't change the genome, changes what you can *see*)
- Fertility tonics, gestation accelerators, sex-selection reagents
- Crossover inducers (raise recombination rate — the tool for breaking linkage drag)
- **Gene serum:** extract one locus from a creature, destroying it permanently, then splice into an egg. Late game. The cost must always hurt.

**Analysis items** — the lens tiers from §1.3, plus test-cross kits and pedigree extensions.

**Raising items** — feeds, habitat decor, training equipment, bond gifts.

**Combat equipment** — 2 slots, 3 tiers, that's it. Under the 20% cap. Keep it boring on purpose.

---

## 6. ART DIRECTION

### 6.1 The core constraint
Art is generated by combining modular parts driven by genotype. The style must therefore **survive arbitrary combination**. That rules out anything rendered, painted or realistic.

### 6.2 The direction: "Naturalist's Field Journal"

- Confident ink linework with visible weight variation, over flat or lightly textured colour fills
- Restricted palette per biome — 6–8 colours plus the creature's genetically-derived hue
- Slight paper grain and off-white background; UI framed like a specimen catalogue with typeset labels, measurement ticks and handwritten annotation
- Creatures drawn as if observed and sketched in the field, not posed for a box cover

Why this works: it's distinctive rather than generic-cute, it makes procedural variation read as *authentic* rather than glitchy, it scales to merchandise and print beautifully, and it visually foregrounds the science without being sterile.

### 6.3 Modular rig

Part slots, each mapped to gene loci: `body` · `head` · `limbs` · `tail` · `dorsal feature` · `horn/crest` · `marking layer` · `palette` · `size scalar`

- Colour is generated in HSL from colour loci so mutations produce *coherent* palettes, never mud. Constrain saturation and lightness ranges per species.
- Every part is an SVG or sprite with defined anchor points. Layer order fixed per species.

### 6.4 The silhouette test
Every species must be identifiable in pure black at 32×32 pixels. If it fails, redesign it. This is the test that separates franchise creatures from asset-pack creatures — it's why a Pikachu silhouette works on a lunchbox.

### 6.5 Species bible
Ship v1 with **6 species**, each with: a name, an ecological real-world inspiration, a one-line personality hook, a distinct silhouette family, a home biome, and 3–5 evolution branches. Design three of them as the marketing "starter trio."

---

## 7. AUDIO

- **Adaptive layered score.** The ranch theme adds instrument layers as your ranch grows and as species diversity increases — the player literally hears their collection.
- **Genome-driven vocalisations.** Synthesise each creature's call procedurally: pitch from the size locus, timbre from body-type locus, envelope from temperament. Every creature you breed sounds like itself. This is cheap to build and enormously effective for attachment.
- Battle music tempo scales with battle state. Egg-hatch and mutation-discovery get authored stingers — the mutation stinger is the sound players will chase.
- Full mute and volume separation for music/SFX/creature calls.

---

## 8. FRANCHISE ARCHITECTURE — build these hooks in from v1

These are cheap now and impossible to retrofit:

1. **Genome codes.** Every creature exports as a short shareable string and a QR code. Import works. This is the trading-card mechanic, the social mechanic and the marketing mechanic in one primitive. Sign codes to prevent trivial forgery.
2. **Community allele naming.** The first player to discover a novel allele names it, subject to moderation. Their name appears for everyone, forever, with attribution. This is the strongest UGC hook available in this genre.
3. **The Compendium.** An in-game encyclopaedia that fills in as you discover species, alleles, evolution branches and interactions. Completion percentage. It doubles as the design document for a future wiki, TCG and art book.
4. **Lineage certificates.** Exportable pedigree images for any creature — shareable, printable, gorgeous in the field-journal style. Free organic marketing.
5. **Seasonal migrations.** Rotating limited-time wild gene pools introducing alleles available only that season. The live-ops spine.
6. **A world bible.** Named regions, factions, a written ecology. Even if the story is small, write the world large.

---

## 9. MONETISATION — design now, implement later

Build the systems so these are *possible*, but ship v1 free and complete.

- **Never sell genetic advantage.** No paid mutagens, no paid rare alleles, no paid lens tiers. The moment genetics is purchasable the game is dead as a competitive and social object.
- Acceptable: cosmetic habitat and ranch decoration, additional ranch/archive capacity, expansion regions with new species, seasonal cosmetic passes, art book and physical merchandise.
- Architect saves and the item system so a purchase flag is trivial to add. Do not add any storefront in v1.

---

## 10. TECHNICAL SPECIFICATION

- **TypeScript**, strict mode. Vite.
- **React** for UI, **canvas or SVG** for creature rendering. Pick one and stay consistent.
- **Monorepo-style module separation**, enforced:
  - `packages/genetics` — pure sim, zero dependencies, fully unit-tested
  - `packages/rendering` — genotype → visual, deterministic
  - `packages/game` — state, progression, economy
  - `packages/ui` — React app
  - The genetics package must never import from any other package.
- **Deterministic seeded RNG** (single injected instance, e.g. a small xoshiro or mulberry32 implementation). No `Math.random()` in `packages/genetics` or `packages/game`. Enforce with a lint rule.
- **Save format:** versioned JSON in IndexedDB, with export/import to file. Write a migration path from v1 on day one. Players will have creatures they refuse to lose.
- **Performance target:** 500 creatures in the ranch with no frame drops. Virtualise all lists. Bulk-simulate battles off the main thread with a Web Worker.
- Accessibility: colourblind-safe palettes selectable, full keyboard navigation, text scaling. The colourblind mode matters unusually much here — the entire game is colour-coded genetics.

---

## 11. BUILD ORDER

Do not skip ahead. Confirm each phase with me before starting the next.

**Phase 1 — Genetics core.** The engine and its test suite. No UI. Output: a Node script that breeds a population over 20 generations and prints phenotype distributions, so we can verify the maths is right before anything is pretty.

**Phase 2 — Renderer.** Genotype → creature image. One species, full modular rig, all loci wired to visuals. Output: a page showing 50 randomly generated creatures of that species.

**Phase 3 — Core loop.** Breed, hatch, raise, age, die. Ranch UI, pedigree view, Punnett predictor. No combat yet. This must already be fun.

**Phase 4 — Combat and expeditions.** Auto-battler, three-creature teams, one procedurally generated expedition region.

**Phase 5 — Content.** Six species, evolution branches, campaign chapters 1–8, item catalogue.

**Phase 6 — Modes.** Daily Genome, Trials, Exhibition, Legacy, Rival Ranch.

**Phase 7 — Polish.** Audio, compendium, genome codes, lineage certificates, save migration, accessibility.

---

## 12. HOW I WANT YOU TO WORK

- Start Phase 1 now. Show me the genome data structure and the inheritance algorithm before writing the rest.
- When a design decision is genuinely ambiguous, propose two options with a recommendation rather than asking an open question.
- Push back if you think something here is wrong. I would rather argue than ship a bad system.
- Keep a `DECISIONS.md` recording every non-obvious choice and why, so the reasoning survives context loss.
- Commit at every phase boundary.
