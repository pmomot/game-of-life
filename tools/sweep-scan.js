/* Sweep: every marked target cell must be alive at least once; the score is
   how many generations that takes. Requiring the *whole board* turned out to
   be a lottery (about 1% of sane attempts), so levels mark a zone instead.

   Solutions are searched over pattern stamps — a glider, a spaceship, an
   R-pentomino and so on — because that is how a player actually plays. The
   result is an honest "best known", not a proven optimum. */
'use strict';
const E = require('./engine');

const RAW = {
  cell:    ['O'],
  blinker: ['OOO'],
  block:   ['OO', 'OO'],
  glider:  ['.O.', '..O', 'OOO'],
  lwss:    ['.O..O', 'O....', 'O...O', 'OOOO.'],
  rpent:   ['.OO', 'OO.', '.O.'],
  acorn:   ['.O.....', '...O...', 'OO..OOO'],
  diehard: ['......O.', 'OO......', '.O...OOO'],
};

const toPts = rows => { const p = []; rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'O') p.push([x, y]); })); return p; };
const rot = pts => { const h = Math.max(...pts.map(p => p[1])); return pts.map(([x, y]) => [h - y, x]); };
const flip = pts => { const w = Math.max(...pts.map(p => p[0])); return pts.map(([x, y]) => [w - x, y]); };
const norm = pts => { const k = pts.map(p => p.join(',')).sort().join(' '); return k; };

const STAMPS = [];
for (const [name, rows] of Object.entries(RAW)) {
  let pts = toPts(rows);
  const seen = new Set();
  for (const base of [pts, flip(pts)])
    for (let r = 0, cur = base; r < 4; r++, cur = rot(cur)) {
      const k = norm(cur);
      if (seen.has(k)) continue;
      seen.add(k);
      STAMPS.push({ name, pts: cur.map(p => p.slice()), size: cur.length });
    }
}

function parseSweep(map) {
  const rows = map.replace(/^\n/, '').replace(/\n$/, '').split('\n');
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const own = new Uint8Array(w * h), rock = new Uint8Array(w * h), target = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x], i = y * w + x;
      if (c === '#') rock[i] = 1;
      else if (c === 'o') own[i] = 2;
      else if (c === '*') target[i] = 1;
      else if (c === '@') { target[i] = 1; own[i] = 2; }
    }
  return { w, h, own, rock, target };
}

/* generations until every target cell has been alive, else 0 */
function runZone(start, lvl, budget = 400) {
  const { w, h, rock, target } = lvl, n = w * h;
  let need = 0;
  for (let i = 0; i < n; i++) if (target[i]) need++;
  const seen = new Uint8Array(n);
  let got = 0;
  const mark = arr => { for (let i = 0; i < n; i++) if (arr[i] && target[i] && !seen[i]) { seen[i] = 1; got++; } };
  mark(start);
  if (got === need) return 1;
  let a = Uint8Array.from(start), b = new Uint8Array(n), p1 = new Uint8Array(n), p2 = new Uint8Array(n);
  for (let g = 1; g <= budget; g++) {
    const { pop } = E.step(a, b, w, h, rock);
    mark(b);
    if (got === need) return g;
    if (pop === 0) return 0;
    let s1 = true, s2 = true;
    for (let i = 0; i < n; i++) { if (b[i] !== a[i]) s1 = false; if (b[i] !== p1[i]) s2 = false; if (!s1 && !s2) break; }
    if (s1 || s2) return 0;
    const t = p2; p2 = p1; p1 = a; a = b; b = t;
  }
  return 0;
}

function searchStamps(lvl, budget, { pairs = false } = {}) {
  const { w, h, own, rock } = lvl;
  const places = [];
  for (const s of STAMPS) {
    if (s.size > budget) continue;
    const sw = Math.max(...s.pts.map(p => p[0])) + 1, sh = Math.max(...s.pts.map(p => p[1])) + 1;
    for (let oy = 0; oy + sh <= h; oy++)
      for (let ox = 0; ox + sw <= w; ox++) {
        const cells = s.pts.map(([x, y]) => (oy + y) * w + (ox + x));
        if (cells.some(i => rock[i] || own[i])) continue;
        places.push({ name: s.name, size: s.size, cells });
      }
  }
  let best = null;
  for (const p of places) {
    const start = Uint8Array.from(own);
    for (const i of p.cells) start[i] = 1;
    const g = runZone(start, lvl);
    if (g && (!best || g < best.gens)) best = { gens: g, used: p.size, what: p.name, cells: p.cells.slice() };
  }
  if (!best && pairs) {
    for (let a = 0; a < places.length; a++)
      for (let b2 = a + 1; b2 < places.length; b2++) {
        const p = places[a], q = places[b2];
        if (p.size + q.size > budget) continue;
        if (p.cells.some(i => q.cells.includes(i))) continue;
        const start = Uint8Array.from(own);
        for (const i of p.cells) start[i] = 1;
        for (const i of q.cells) start[i] = 1;
        const g = runZone(start, lvl);
        if (g && (!best || g < best.gens)) best = { gens: g, used: p.size + q.size, what: p.name + '+' + q.name, cells: [...p.cells, ...q.cells] };
      }
  }
  return { best, places: places.length };
}

module.exports = { parseSweep, runZone, searchStamps, STAMPS };

if (require.main === module) {
  const ARENAS = {
    'diagonal run': { budget: 6, map: `
****............
.****...........
..****..........
...****.........
....****........
.....****.......
......****......
.......****.....
........****....
.........****...
..........****..
...........****.` },
    'the hall': { budget: 10, map: `
................
................
.##############.
.*************..
.*************..
.*************..
.*************..
.##############.
................
................
................
................` },
    'chamber': { budget: 8, map: `
................
..############..
..#**********#..
..#**********#..
..#**********#..
..#**********#..
..#**********#..
..#**********#..
..############..
................
................
................` },
    'narrow band': { budget: 6, map: `
................
................
................
....********....
....********....
....********....
................
................
................
................
................
................` },
  };
  for (const [name, a] of Object.entries(ARENAS)) {
    const lvl = parseSweep(a.map);
    const need = lvl.target.reduce((s, v) => s + v, 0);
    const t = Date.now();
    const r = searchStamps(lvl, a.budget, { pairs: false });
    console.log(`${name.padEnd(14)} ${need} target cells, budget ${a.budget}, ${r.places} stamp placements -> ` +
      (r.best ? `best ${r.best.gens} gens with a ${r.best.what} (${r.best.used} cells)` : 'NO STAMP COVERS IT') + `  (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }
}
