# Conway's Game of Life

A dependency-free HTML/JS implementation on a **toroidal** world: the grid fills the
screen width, and anything that leaves one edge reappears on the opposite one, so
gliders and spaceships travel forever.

**Live: https://pmomot.github.io/game-of-life/**

Two modes, switchable from the header on either page:

| Mode | Page | What it is |
| --- | --- | --- |
| **Sandbox** | [`index.html`](https://pmomot.github.io/game-of-life/) | Draw, stamp patterns, run the board. |
| **2 players** | [`versus.html`](https://pmomot.github.io/game-of-life/versus.html) | Hot-seat territory game on one device. |
| **Puzzles** | [`puzzle.html`](https://pmomot.github.io/game-of-life/puzzle.html) | Four goals over the same engine: Clear, Hold on, Bloom, Sweep. |

There is no build step and no server — open either file in a browser. The two
`game-of-life*.html` files are self-contained single-file builds of the same
pages, handy for AirDropping to a phone or running offline.

## Sandbox controls

| Action | Desktop | Phone / tablet |
| --- | --- | --- |
| Draw cells | drag with the mouse | drag with a finger |
| Erase cells | drag starting **on a live cell** | same |
| Place a preset | tap a preset chip, then click the grid | tap chip, then tap the grid |
| Play / pause | `space` or the Play button | Play button |
| One generation | `s` or Step | Step button |
| Clear | `c` | Clear button |
| Random fill | `r` | Random button |
| Cancel an armed preset | `esc` or tap the chip again | tap the chip again |

Sliders set the generations-per-second (the top of the range is uncapped — one
generation per animation frame) and the cell size, which changes the resolution of
the world. Multi-touch drawing is supported; each finger paints independently.

## 2 players

Two people share one screen, blue against orange, fighting for the board.

**The automaton is untouched.** Birth and survival are still B3/S23; the only thing
colour decides is who *owns* a newborn cell — the majority of its three parents, the
classic [Immigration](https://conwaylife.com/wiki/Colourised_life) rule. Every known
pattern therefore behaves exactly as it does in the sandbox: your glider gun fires
your gliders, and a glider into their pulsar destroys it the same way it always would.
This is verified by test, not by eye: the alive/dead evolution is identical to
plain Life, cell for cell, over hundreds of generations.

**Defection** (toggleable) is the one added rule: a cell that survives while *every*
neighbour it has belongs to the enemy switches sides. It requires zero friendly
neighbours, so it can never fire inside your own patterns — only where the two
colours meet. That is where the eating happens.

The game layer sits on top of the rules, not inside them:

* **Rounds.** Both players place cells while the board is paused, then it runs for 30
  generations. Twelve rounds; who places first alternates each round.
* **Energy.** One per cell. You collect a flat income each round plus a share of your
  living population, so holding ground pays for the next attack. Patterns cost their
  cell count — a glider is 5, a Gosper gun is 36.
* **Build radius.** You may only place on empty cells near the ones you owned when
  your turn began, shown as a glow. The glow is frozen for the turn, so you cannot
  crawl across the map a cell at a time. Your opening colony goes anywhere on your
  half, and being wiped out gives you the half back to rebuild from.
* **Score** counts your living cells every generation, so durable structures beat a
  last-second splurge. Highest score after twelve rounds wins.

Tap a cell you placed this turn to take it back and get the energy refunded.

## Puzzles

Four goals share one engine: a bounded board where your cells and the dirt are
told apart by colour. Pick a goal from the row of tabs, then a level.

These boards **do not wrap**, unlike the other two modes. On a torus an escaping
glider is immortal, so a board could never be emptied or settle. **Rock** is inert:
nothing lives on it and you cannot build there.

| Goal | You do this | Scored on |
| --- | --- | --- |
| **Clear** | Empty the board. | Cells used |
| **Hold on** | Empty it, but if only dirt is left alive you have lost. | Cells used |
| **Bloom** | Add up to two cells and grow the board by generation 40. | Cells alive |
| **Sweep** | Make every marked square be alive at least once. | Generations |

**Hold on** is the same idea as Clear with one extra rule, and it changes everything:
your own lineage has to outlast the dirt. A colour is inherited by majority of a
newborn's three parents, so your cells can be outvoted and wiped out while the
cascade carries on without you. None of the thirteen Clear answers survive their own
solution — *Bedrock* is cleared by one cell, and that same cell dies at generation 1
when you play the board in Hold on.

**Bloom** is the inverse of Clear: instead of spending as little as possible, you are
looking for the two cells that set the most off. The swing is large — *Tinder* sits
at 10 alive if you leave it alone and reaches 64 with the right pair.

**Sweep** marks a zone that must be visited rather than the whole board. Requiring
every cell of a full board turned out to be a lottery — about 1% of sane attempts
manage it — so levels mark a zone instead. Chaos is usually the tool of choice, but
not always: *The long hall* is swept by a lightweight spaceship in 23 generations,
and *Pillars* needs two different seeds because no single one reaches all three bays.

### Where the targets come from

`tools/` holds the level pipeline, and every number a level ships with is produced
by the search that proves it, never typed in by hand.

* **Clear, Hold on and Bloom are exhaustive.** `tools/search.js` tries every
  placement of one cell, then two, then three near the dirt and simulates each.
  "Fewest possible 1" means no single cell anywhere does better; "best possible 55"
  means no pair reaches 56. Placements far from the dirt cannot matter at these
  sizes: one or two lone cells die immediately, and three make a block or a blinker.
* **Sweep is a best known, not a proof.** `tools/sweep-scan.js` searches gliders,
  spaceships, R-pentominoes and the rest at every position and orientation. Beating
  one of those numbers is a real result, and the game says so when you do.
* `tools/generate.js` scatters still lifes and oscillators on a 16×12 board and
  grades the layouts; that is where most Clear and Hold boards came from. Of 882
  random layouts, 881 were clearable with two cells or fewer, which is why the game
  is about finding the exact square rather than spending more cells.

A browser test replays every stored answer through the game's own simulation and
checks it reproduces the solver's number exactly — all 29 levels across the four
goals agree, cell for cell.

Level numbers show ★ when you matched the target and ✓ when you finished short of it.
Best scores live in `localStorage`; a level solved with **Reveal** is marked as
revealed rather than scored.

## Presets

Glider · LWSS · MWSS · HWSS · Blinker · Toad · Beacon · Pulsar · Pentadecathlon ·
Gosper glider gun · R-pentomino · Acorn · Diehard · Infinite growth

In the sandbox an armed preset stays armed, so you can stamp several copies in a row.

## How it is kept fast

* The board is a flat `Uint8Array` with a second one to write into, swapped each
  generation — no allocation in the hot loop.
* Neighbour counting uses per-row column sums plus a 3-wide sliding window, which
  is ~5 additions per cell instead of 8, with the torus wrap folded into the row
  and column indices.
* In two-player mode the hot loop still counts a plain binary neighbourhood; the
  eight-neighbour *colour* scan runs only for the cells that are actually born, and
  for survivors only while defection is on.
* Puzzle boards are small and bounded, so they use a plain direct neighbour count —
  the sliding window would not pay for itself at 192 cells.
* Rendering writes one `Uint32Array` pixel per cell into an offscreen canvas the
  size of the grid, then blits it scaled with smoothing off — a single `drawImage`
  instead of one `fillRect` per live cell.
* Frames only repaint when something changed, and at capped speeds the simulation
  advances on an accumulator with a per-frame step budget, so a slow frame can
  never snowball.

Measured on a 400×300 board (120k cells): ~0.5 ms per generation in the sandbox and
~0.75 ms with colour and defection. A full-screen 640×313 board at maximum speed
holds the display refresh rate.

## Files

* `index.html` / `app.js` — sandbox
* `versus.html` / `versus.js` — two-player mode
* `puzzle.html` / `puzzle.js` — puzzle modes (all four goals)
* `patterns.js` — pattern library shared by the first two modes
* `levels.js` — generated puzzle levels; edit `tools/`, not this
* `tools/` — the level pipeline: `engine.js` (the shared simulation), `solve.js`
  and `search.js` (exhaustive placement search), `generate.js` (layout scatter),
  `sweep-scan.js` and `arenas.js` (sweep zones), `emit-challenges.js` (writes
  `levels.js`)
* `styles.css` — dark, touch-friendly layout
* `build.py` — regenerates the three single-file builds; run it after editing anything
