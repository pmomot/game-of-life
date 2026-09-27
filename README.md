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
| **Puzzles** | [`puzzle.html`](https://pmomot.github.io/game-of-life/puzzle.html) | Clear a dirty board with as few cells as you can. |

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

A board starts covered in dirt. Add as few cells of your own as you can, press Run,
and let ordinary Life rules do the rest. You win when **nothing** is left alive —
your own cells have to die too.

These boards are **bounded**, unlike the other two modes. On a torus a glider that
escapes is immortal, so the board could never empty; with walls, debris falls off the
edge, which is usually what you want. **Rock** is inert: nothing lives on it and you
cannot build there. An attempt fails when the board settles into something that will
never die, or is still going after 400 generations.

### "Fewest possible" is proven, not a guess

`tools/solve.js` searches *every* placement of one cell, then two, then three, near
the dirt, and simulates each to see whether the board empties. A level only ships
with the smallest k that works — the number the game shows as "fewest possible" —
along with how many placements at that k succeed, the honest measure of how tight
it is. Placements far from the dirt cannot matter at
these sizes: one or two lone cells die immediately and three make a block or a
blinker, so anything useful has to touch the dirt's neighbourhood.

`tools/generate.js` scatters still lifes and oscillators on a 16×12 board, solves
each layout, and reports the tightest — that is where most of the levels came from.
Of 882 random layouts, 881 were solvable with two cells or fewer, so the game is
about finding the exact square rather than spending more cells.

The thirteen levels run from *First speck* (one cell, sixteen placements work) to
*Two of a kind* (two cells, exactly one pair in the whole board works). Seven of
them have a single solution. A level number shows ★ when you cleared it with the
fewest possible cells and ✓ when you cleared it with more. Best scores are kept in `localStorage`; a level solved with
**Reveal** is marked as revealed rather than scored.

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
* `puzzle.html` / `puzzle.js` — puzzle mode
* `patterns.js` — pattern library shared by the first two modes
* `levels.js` — generated puzzle levels; edit `tools/`, not this
* `tools/solve.js`, `tools/generate.js`, `tools/emit.js` — the level pipeline
* `styles.css` — dark, touch-friendly layout
* `build.py` — regenerates the three single-file builds; run it after editing anything
