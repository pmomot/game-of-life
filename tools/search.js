/* Shared exhaustive placement search for the goal modes. */
'use strict';
const E = require('./engine');

function candidates(lvl, dist) {
  const { w, h, own, rock } = lvl;
  const near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (own[y * w + x] !== 2) continue;
      for (let dy = -dist; dy <= dist; dy++)
        for (let dx = -dist; dx <= dist; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (!own[j] && !rock[j]) near[j] = 1;
        }
    }
  const out = [];
  for (let i = 0; i < w * h; i++) if (near[i]) out.push(i);
  return out;
}

/* Every k-subset of the candidate cells, smallest k first, stopping at the
   first k that yields any success. `test(own)` returns truthy on success. */
function minimal(lvl, test, { maxK = 3, dist = 4, cap = 400 } = {}) {
  const cells = candidates(lvl, dist);
  for (let k = 1; k <= maxK; k++) {
    const found = [];
    const rec = (start, depth, chosen) => {
      if (found.length >= cap) return;
      if (depth === k) {
        const own = Uint8Array.from(lvl.own);
        for (const c of chosen) own[c] = 1;
        const r = test(own);
        if (r) found.push({ cells: chosen.slice(), value: r });
        return;
      }
      for (let i = start; i < cells.length; i++) { chosen.push(cells[i]); rec(i + 1, depth + 1, chosen); chosen.pop(); }
    };
    rec(0, 0, []);
    if (found.length) return { k, found, candidates: cells.length };
  }
  return null;
}

/* Every subset of size 1..maxK, scored; returns the best. */
function best(lvl, score, { maxK = 2, dist = 5 } = {}) {
  const cells = candidates(lvl, dist);
  let top = { value: -Infinity, cells: [] };
  for (let k = 1; k <= maxK; k++) {
    const rec = (start, depth, chosen) => {
      if (depth === k) {
        const own = Uint8Array.from(lvl.own);
        for (const c of chosen) own[c] = 1;
        const v = score(own);
        if (v > top.value) top = { value: v, cells: chosen.slice() };
        return;
      }
      for (let i = start; i < cells.length; i++) { chosen.push(cells[i]); rec(i + 1, depth + 1, chosen); chosen.pop(); }
    };
    rec(0, 0, []);
  }
  return { ...top, candidates: cells.length };
}

module.exports = { candidates, minimal, best, E };
