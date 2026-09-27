# Conway's Game of Life

A dependency-free HTML/JS implementation on a **toroidal** world: the grid fills the
screen width, and anything that leaves one edge reappears on the opposite one, so
gliders and spaceships travel forever.

Open `index.html` in a browser — there is no build step and no server needed.

## Controls

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

## Presets

Glider · LWSS · MWSS · HWSS · Blinker · Toad · Beacon · Pulsar · Pentadecathlon ·
Gosper glider gun · R-pentomino · Acorn · Diehard · Infinite growth

An armed preset stays armed, so you can stamp several copies in a row.

## How it is kept fast

* The board is a flat `Uint8Array` with a second one to write into, swapped each
  generation — no allocation in the hot loop.
* Neighbour counting uses per-row column sums plus a 3-wide sliding window, which
  is ~5 additions per cell instead of 8, with the torus wrap folded into the row
  and column indices.
* Rendering writes one `Uint32Array` pixel per cell into an offscreen canvas the
  size of the grid, then blits it scaled with smoothing off — a single `drawImage`
  instead of one `fillRect` per live cell.
* Frames only repaint when something changed, and at capped speeds the simulation
  advances on an accumulator with a per-frame step budget, so a slow frame can
  never snowball.

Measured on a 400×300 board (120k cells): ~0.5 ms per generation, ~230M cell
updates/second. A full-screen 640×313 board at maximum speed holds the display
refresh rate.

## Files

* `index.html` — markup and controls
* `styles.css` — dark, touch-friendly layout
* `app.js` — patterns, simulation, renderer, input
