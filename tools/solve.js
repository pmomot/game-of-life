/* Exhaustive solver for puzzle levels.
   A level is cleared when the board holds no live cells at all, within the
   generation budget. Boards are bounded (no wrap) and may contain rock, where
   nothing can ever live. We search every placement of k empty cells near the
   dirt, smallest k first, so the par a level ships with is a proven minimum
   rather than a guess.

   Placements far from the dirt cannot matter at these sizes: one or two cells
   on their own die immediately, and three make a block or a blinker, so any
   useful placement has to touch the dirt's neighbourhood. */
'use strict';

const BUDGET = 160;

function parse(map) {
  const rows = map.replace(/^\n/, '').replace(/\n$/, '').split('\n');
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const dirt = new Uint8Array(w * h), rock = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (c === 'o' || c === 'O') dirt[y * w + x] = 1;
      else if (c === '#') rock[y * w + x] = 1;
    }
  return { w, h, dirt, rock };
}

/* One bounded generation. Out of bounds counts as dead; rock counts as dead
   and can never hold a cell. */
function stepInto(cur, out, w, h, rock) {
  let pop = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (rock[i]) { out[i] = 0; continue; }
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          n += cur[yy * w + xx];
        }
      }
      const v = n === 3 || (n === 2 && cur[i]) ? 1 : 0;
      out[i] = v;
      pop += v;
    }
  }
  return pop;
}

/* Returns the generation the board emptied on, or 0 if it never did. */
function run(start, w, h, rock, budget = BUDGET) {
  const n = w * h;
  let a = Uint8Array.from(start), b = new Uint8Array(n);
  let prev1 = new Uint8Array(n), prev2 = new Uint8Array(n);
  for (let g = 1; g <= budget; g++) {
    const pop = stepInto(a, b, w, h, rock);
    if (pop === 0) return g;
    // still life or period 2 — it will never clear, stop early
    let same1 = true, same2 = true;
    for (let i = 0; i < n; i++) {
      if (b[i] !== a[i]) same1 = false;
      if (b[i] !== prev1[i]) same2 = false;
      if (!same1 && !same2) break;
    }
    if (same1 || same2) return 0;
    const t = prev2; prev2 = prev1; prev1 = a; a = b; b = t;
  }
  return 0;
}

function candidates(level, dist) {
  const { w, h, dirt, rock } = level;
  const near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!dirt[y * w + x]) continue;
      for (let dy = -dist; dy <= dist; dy++)
        for (let dx = -dist; dx <= dist; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (!dirt[j] && !rock[j]) near[j] = 1;
        }
    }
  const out = [];
  for (let i = 0; i < w * h; i++) if (near[i]) out.push(i);
  return out;
}

/* Smallest k that clears the board, with every solution at that k. */
function solve(level, { maxK = 3, dist = 5, cap = Infinity, budget = BUDGET } = {}) {
  const { w, h, dirt, rock } = level;
  if (run(dirt, w, h, rock, budget)) return { par: 0, solutions: [[]], tried: 1 };

  const cells = candidates(level, dist);
  const board = new Uint8Array(w * h);
  let tried = 0;

  for (let k = 1; k <= maxK; k++) {
    const found = [];
    const idx = new Array(k).fill(0).map((_, i) => i);
    const rec = (start, depth, chosen) => {
      if (found.length >= cap) return;
      if (depth === k) {
        board.set(dirt);
        for (const c of chosen) board[c] = 1;
        tried++;
        if (run(board, w, h, rock, budget)) found.push(chosen.slice());
        return;
      }
      for (let i = start; i < cells.length; i++) {
        chosen.push(cells[i]);
        rec(i + 1, depth + 1, chosen);
        chosen.pop();
      }
    };
    rec(0, 0, []);
    if (found.length) return { par: k, solutions: found, tried, candidates: cells.length };
  }
  return { par: null, solutions: [], tried, candidates: cells.length };
}

module.exports = { parse, solve, run, stepInto, candidates, BUDGET };
