/* Bounded Life with cell ownership, matching puzzle.js exactly.
   own[]: 0 dead, 1 the player's lineage, 2 dirt. Rock is inert — nothing is
   ever born on it and it counts as dead. A newborn cell takes the colour held
   by the majority of its three parents (the Immigration rule). */
'use strict';

function step(own, out, w, h, rock) {
  let pop = 0, mine = 0;
  for (let y = 0; y < h; y++) {
    const y0 = y > 0, y1 = y < h - 1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (rock[i]) { out[i] = 0; continue; }
      const x0 = x > 0, x1 = x < w - 1;
      let n = 0, a = 0;
      const t = j => { const v = own[j]; if (v) { n++; if (v === 1) a++; } };
      if (y0) { if (x0) t(i - w - 1); t(i - w); if (x1) t(i - w + 1); }
      if (x0) t(i - 1); if (x1) t(i + 1);
      if (y1) { if (x0) t(i + w - 1); t(i + w); if (x1) t(i + w + 1); }
      const self = own[i];
      let v = 0;
      if (self) { if (n === 2 || n === 3) v = self; }
      else if (n === 3) v = a >= 2 ? 1 : 2;
      out[i] = v;
      if (v) { pop++; if (v === 1) mine++; }
    }
  }
  return { pop, mine };
}

function parse(map) {
  const rows = map.replace(/^\n/, '').replace(/\n$/, '').split('\n');
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const own = new Uint8Array(w * h), rock = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (c === 'o' || c === 'O') own[y * w + x] = 2;
      else if (c === '#') rock[y * w + x] = 1;
    }
  return { w, h, own, rock };
}

const counts = (own, w, h) => {
  let pop = 0, mine = 0;
  for (let i = 0; i < w * h; i++) if (own[i]) { pop++; if (own[i] === 1) mine++; }
  return { pop, mine };
};

/* Clear: every cell dead. Returns the generation it happened on, else 0.
   Bails out early on a still life or a period-2 oscillation. */
function runClear(start, w, h, rock, budget) {
  const n = w * h;
  let a = Uint8Array.from(start), b = new Uint8Array(n), p1 = new Uint8Array(n), p2 = new Uint8Array(n);
  for (let g = 1; g <= budget; g++) {
    const { pop } = step(a, b, w, h, rock);
    if (pop === 0) return g;
    let s1 = true, s2 = true;
    for (let i = 0; i < n; i++) { if (b[i] !== a[i]) s1 = false; if (b[i] !== p1[i]) s2 = false; if (!s1 && !s2) break; }
    if (s1 || s2) return 0;
    const t = p2; p2 = p1; p1 = a; a = b; b = t;
  }
  return 0;
}

/* Hold: clear the board, but the player's lineage must never die out while
   dirt is still alive. Returns the clearing generation, else 0. */
function runHold(start, w, h, rock, budget) {
  const n = w * h;
  let a = Uint8Array.from(start), b = new Uint8Array(n), p1 = new Uint8Array(n), p2 = new Uint8Array(n);
  for (let g = 1; g <= budget; g++) {
    const { pop, mine } = step(a, b, w, h, rock);
    if (pop === 0) return g;
    if (mine === 0) return 0;                 // only dirt left — lost
    let s1 = true, s2 = true;
    for (let i = 0; i < n; i++) { if (b[i] !== a[i]) s1 = false; if (b[i] !== p1[i]) s2 = false; if (!s1 && !s2) break; }
    if (s1 || s2) return 0;
    const t = p2; p2 = p1; p1 = a; a = b; b = t;
  }
  return 0;
}

/* Bloom: how many cells are alive after exactly `gens` generations. */
function runBloom(start, w, h, rock, gens) {
  const n = w * h;
  let a = Uint8Array.from(start), b = new Uint8Array(n);
  let pop = counts(a, w, h).pop, peak = pop;
  for (let g = 1; g <= gens; g++) {
    pop = step(a, b, w, h, rock).pop;
    if (pop > peak) peak = pop;
    const t = a; a = b; b = t;
  }
  return { final: pop, peak };
}

/* Sweep: generations until every non-rock cell has been alive at least once,
   or 0 if that never happens within the budget. */
function runSweep(start, w, h, rock, budget) {
  const n = w * h;
  const target = n - rock.reduce((s, v) => s + v, 0);
  const seen = new Uint8Array(n);
  let covered = 0;
  for (let i = 0; i < n; i++) if (start[i] && !seen[i]) { seen[i] = 1; covered++; }
  if (covered === target) return 1;
  let a = Uint8Array.from(start), b = new Uint8Array(n), p1 = new Uint8Array(n), p2 = new Uint8Array(n);
  for (let g = 1; g <= budget; g++) {
    const { pop } = step(a, b, w, h, rock);
    for (let i = 0; i < n; i++) if (b[i] && !seen[i]) { seen[i] = 1; covered++; }
    if (covered === target) return g;
    if (pop === 0) return 0;
    let s1 = true, s2 = true;
    for (let i = 0; i < n; i++) { if (b[i] !== a[i]) s1 = false; if (b[i] !== p1[i]) s2 = false; if (!s1 && !s2) break; }
    if (s1 || s2) return 0;                    // frozen, coverage can never grow
    const t = p2; p2 = p1; p1 = a; a = b; b = t;
  }
  return 0;
}

const coverageOf = (start, w, h, rock, budget) => {
  const n = w * h, seen = new Uint8Array(n);
  let covered = 0;
  const mark = arr => { for (let i = 0; i < n; i++) if (arr[i] && !seen[i]) { seen[i] = 1; covered++; } };
  mark(start);
  let a = Uint8Array.from(start), b = new Uint8Array(n);
  for (let g = 1; g <= budget; g++) { const { pop } = step(a, b, w, h, rock); mark(b); if (pop === 0) break; const t = a; a = b; b = t; }
  return { covered, target: n - rock.reduce((s, v) => s + v, 0) };
};

module.exports = { step, parse, counts, runClear, runHold, runBloom, runSweep, coverageOf };
