/* Searches for good levels on a phone-friendly 16x12 board.
   Scatters a few still lifes and oscillators, solves each layout exhaustively,
   and keeps the ones that are tight — a low par reachable by few placements. */
'use strict';
const { parse, solve, run } = require('./solve');

const W = 16, H = 12;
const SHAPES = {
  block:   [[0,0],[1,0],[0,1],[1,1]],
  blinker: [[0,0],[1,0],[2,0]],
  bar:     [[0,0],[0,1],[0,2]],
  beehive: [[1,0],[2,0],[0,1],[3,1],[1,2],[2,2]],
  loaf:    [[1,0],[2,0],[0,1],[3,1],[1,2],[3,2],[2,3]],
  tub:     [[1,0],[0,1],[2,1],[1,2]],
  boat:    [[0,0],[1,0],[0,1],[2,1],[1,2]],
};
const NAMES = Object.keys(SHAPES);

function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

function layout(seed, count, withRock) {
  const r = rng(seed);
  const cells = Array.from({ length: H }, () => Array(W).fill('.'));
  const occupied = (x, y) => x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || cells[y][x] !== '.';
  let placed = 0;
  for (let attempt = 0; attempt < 200 && placed < count; attempt++) {
    const shape = SHAPES[NAMES[Math.floor(r() * NAMES.length)]];
    const w = Math.max(...shape.map(p => p[0])) + 1, h = Math.max(...shape.map(p => p[1])) + 1;
    const ox = 1 + Math.floor(r() * (W - w - 2)), oy = 1 + Math.floor(r() * (H - h - 2));
    // keep a one-cell margin around each object so they start independent
    let clash = false;
    for (let y = oy - 2; y <= oy + h + 1 && !clash; y++)
      for (let x = ox - 2; x <= ox + w + 1 && !clash; x++)
        if (y >= 0 && y < H && x >= 0 && x < W && cells[y][x] !== '.') clash = true;
    if (clash) continue;
    for (const [dx, dy] of shape) cells[oy + dy][ox + dx] = 'o';
    placed++;
  }
  if (withRock) {
    const vertical = r() < 0.5;
    if (vertical) {
      const x = 2 + Math.floor(r() * (W - 4)), y0 = 1 + Math.floor(r() * 4), len = 4 + Math.floor(r() * 5);
      for (let y = y0; y < Math.min(H - 1, y0 + len); y++) if (cells[y][x] === '.') cells[y][x] = '#';
    } else {
      const y = 2 + Math.floor(r() * (H - 4)), x0 = 1 + Math.floor(r() * 5), len = 5 + Math.floor(r() * 7);
      for (let x = x0; x < Math.min(W - 1, x0 + len); x++) if (cells[y][x] === '.') cells[y][x] = '#';
    }
  }
  return { map: cells.map(r2 => r2.join('')).join('\n'), placed };
}

const paramsFor = seed => ({ count: 2 + (seed % 4), withRock: seed % 3 === 0 });
const mapFor = seed => { const p = paramsFor(seed); return layout(seed, p.count, p.withRock).map; };
module.exports = { layout, paramsFor, mapFor, W, H };

if (require.main === module) search();

function search() {
const found = [];
const t0 = Date.now();
let tested = 0;
for (let seed = 1; seed <= 900; seed++) {
  const { count, withRock } = paramsFor(seed);
  const { map, placed } = layout(seed, count, withRock);
  if (placed < 2) continue;
  const lvl = parse(map);
  if (run(lvl.dirt, lvl.w, lvl.h, lvl.rock, 400)) continue;      // self-clearing, not a puzzle
  tested++;
  const r = solve(lvl, { maxK: 2, dist: 4, cap: 400, budget: 400 });
  if (!r.par) continue;
  const board = Uint8Array.from(lvl.dirt);
  for (const c of r.solutions[0]) board[c] = 1;
  const gens = run(board, lvl.w, lvl.h, lvl.rock, 400);
  const dirt = lvl.dirt.reduce((a, b) => a + b, 0);
  const rocks = lvl.rock.reduce((a, b) => a + b, 0);
  found.push({ seed, map, par: r.par, sols: r.solutions.length, gens, dirt, rocks, objects: placed,
    solution: r.solutions[0].map(i => [i % W, Math.floor(i / W)]) });
}
console.log(`tested ${tested} layouts in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${found.length} solvable at par<=2\n`);

const byTightness = [...found].sort((a, b) => a.par - b.par || a.sols - b.sols);
console.log('tightest par 1 levels:');
byTightness.filter(f => f.par === 1).slice(0, 12).forEach(f =>
  console.log(`  seed ${String(f.seed).padStart(3)}  ${f.sols} solution(s)  dirt ${String(f.dirt).padStart(2)}  rock ${String(f.rocks).padStart(2)}  ${f.objects} objects  clears in ${f.gens}`));
console.log('\ntightest par 2 levels:');
byTightness.filter(f => f.par === 2).slice(0, 12).forEach(f =>
  console.log(`  seed ${String(f.seed).padStart(3)}  ${f.sols} solution(s)  dirt ${String(f.dirt).padStart(2)}  rock ${String(f.rocks).padStart(2)}  ${f.objects} objects  clears in ${f.gens}`));
console.log('\nroomiest par 1 levels (good tutorials):');
[...found].filter(f => f.par === 1).sort((a, b) => b.sols - a.sols).slice(0, 6).forEach(f =>
  console.log(`  seed ${String(f.seed).padStart(3)}  ${f.sols} solution(s)  dirt ${String(f.dirt).padStart(2)}  rock ${String(f.rocks).padStart(2)}  ${f.objects} objects`));
}
