/* Shared pattern library for both modes. Exposes window.LIFE_PATTERNS. */
(() => {
'use strict';

const PATTERNS = [
  { name: 'Glider', cells: `
.O.
..O
OOO` },
  { name: 'LWSS', cells: `
.O..O
O....
O...O
OOOO.` },
  { name: 'MWSS', cells: `
...O..
.O...O
O.....
O....O
OOOOO.` },
  { name: 'HWSS', cells: `
...OO..
.O....O
O......
O.....O
OOOOOO.` },
  { name: 'Blinker', cells: `
OOO` },
  { name: 'Toad', cells: `
.OOO
OOO.` },
  { name: 'Beacon', cells: `
OO..
OO..
..OO
..OO` },
  { name: 'Pulsar', cells: `
..OOO...OOO..
.............
O....O.O....O
O....O.O....O
O....O.O....O
..OOO...OOO..
.............
..OOO...OOO..
O....O.O....O
O....O.O....O
O....O.O....O
.............
..OOO...OOO..` },
  { name: 'Pentadecathlon', cells: `
..O....O..
OO.OOOO.OO
..O....O..` },
  { name: 'Glider gun', cells: `
........................O...........
......................O.O...........
............OO......OO............OO
...........O...O....OO............OO
OO........O.....O...OO..............
OO........O...O.OO....O.O...........
..........O.....O.......O...........
...........O...O....................
............OO......................` },
  { name: 'R-pentomino', cells: `
.OO
OO.
.O.` },
  { name: 'Acorn', cells: `
.O.....
...O...
OO..OOO` },
  { name: 'Diehard', cells: `
......O.
OO......
.O...OOO` },
  { name: 'Infinite 1', cells: `
......O.
....O.OO
....O.O.
....O...
..O.....
O.O.....` },
];

function parsePattern(src) {
  const rows = src.replace(/^\n/, '').split('\n').filter(l => l.length);
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const pts = [];
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++)
      if (rows[y][x] === 'O') pts.push([x, y]);
  return { w, h: rows.length, pts };
}
for (const p of PATTERNS) p.parsed = parsePattern(p.cells);

window.LIFE_PATTERNS = PATTERNS;
})();
