/* Builds ../levels.js for all four goals. Everything here is re-verified from
   scratch, so the numbers that ship are produced by the same search that
   proves them — never copied from a scan. */
'use strict';
const fs = require('fs');
const E = require('./engine');
const { minimal, best } = require('./search');
const { mapFor } = require('./generate');
const S = require('./solve');
const { parseSweep, searchStamps, runZone } = require('./sweep-scan');
const ARENAS = require('./arenas');

const BUDGET = 400, BLOOM_GENS = 40;

/* ------------------------------------------------------------------- clear */
const CLEAR_FIRST = `
................
................
................
................
................
.......oo.......
.......oo.......
................
................
................
................
................`;

const CLEAR = [
  { map: CLEAR_FIRST, key: 'first-speck', title: 'First speck',  blurb: 'One block of grime. A single cell is enough — find where.' },
  { seed: 325, key: 'loose-change',  title: 'Loose change', blurb: 'Three lumps, and still only one cell needed.' },
  { seed: 258, key: 'bedrock',       title: 'Bedrock',      blurb: 'Rock is inert: nothing lives there and you cannot build on it.' },
  { seed: 404, key: 'odd-pair',      title: 'Odd pair',     blurb: 'This one wants two.' },
  { seed: 642, key: 'quarry',        title: 'Quarry',       blurb: 'Plenty of dirt, plenty of rock, two cells.' },
  { seed: 411, key: 'long-wall',     title: 'Long wall',    blurb: 'Five lumps split by a wall.' },
  { seed: 4,   key: 'bullseye',      title: 'Bullseye',     blurb: 'Two lumps, one cell, one place it can go.' },
  { seed: 64,  key: 'hairline',      title: 'Hairline',     blurb: 'Eight cells of dirt and exactly one answer.' },
  { seed: 60,  key: 'split',         title: 'Split',        blurb: 'The wall separates them. One cell still does both.' },
  { seed: 95,  key: 'housekeeping',  title: 'Housekeeping', blurb: 'Five lumps, eighteen cells of dirt, one cell of yours.' },
  { seed: 66,  key: 'slow-burn',     title: 'Slow burn',    blurb: 'One cell, and well over a hundred generations of fallout.' },
  { seed: 300, key: 'through-wall',  title: 'Through the wall', blurb: 'Two cells. Only one pair in the whole board works.' },
  { seed: 192, key: 'two-of-a-kind', title: 'Two of a kind', blurb: 'Symmetrical, and no kinder for it.' },
];

/* -------------------------------------------------------------------- hold */
const HOLD = [
  { seed: 104, key: 'hold-footing',  title: 'Footing',     blurb: 'Same idea as Clear, one extra rule: your own cells must outlast the dirt.' },
  { seed: 100, key: 'hold-relay',    title: 'Relay',       blurb: 'Your lineage has to carry all the way to the end.' },
  { seed: 258, key: 'hold-bedrock',  title: 'Bedrock again', blurb: 'You have cleared this board before. Now keep a cell of your own alive while you do it.' },
  { seed: 88,  key: 'hold-tenant',   title: 'Tenant',      blurb: 'Stay on the board.' },
  { seed: 73,  key: 'hold-thread',   title: 'By a thread', blurb: 'One pair of cells in the whole board manages it.' },
  { seed: 300, key: 'hold-wall',     title: 'Last one out', blurb: 'Through the wall, and still standing at the end.' },
];

/* ------------------------------------------------------------------- bloom */
const BLOOM = [
  { seed: 64, key: 'bloom-sparks',  title: 'Sparks',     blurb: 'Two cells. Make as much life as you can by generation 40.' },
  { seed: 2,  key: 'bloom-tinder',  title: 'Tinder',     blurb: 'The board barely changes on its own. Light it.' },
  { seed: 25, key: 'bloom-thicket', title: 'Thicket',    blurb: 'Fourteen cells of dirt, sitting still.' },
  { seed: 7,  key: 'bloom-orchard', title: 'Orchard',    blurb: 'Nineteen already alive. Can you triple it?' },
  { seed: 68, key: 'bloom-wildfire', title: 'Wildfire',  blurb: 'The biggest swing on the board — from ten cells to sixty-odd.' },
];

/* ------------------------------------------------------------------- sweep */
const SWEEP = [
  { arena: 'narrow band',   key: 'sweep-band',    title: 'Narrow band',   blurb: 'Every marked cell has to be alive at least once. Fewer generations is better.' },
  { arena: 'chamber',       key: 'sweep-chamber', title: 'The chamber',   blurb: 'A sealed room. Something in there has to touch every square.' },
  { arena: 'diagonal run',  key: 'sweep-diagonal', title: 'Diagonal run', blurb: 'A long slanted stripe, corner to corner.' },
  { arena: 'the long hall', key: 'sweep-hall',    title: 'The long hall', blurb: 'Wide open and too big to fill by hand. Something needs to travel.' },
  { arena: 'pillars',       key: 'sweep-pillars', title: 'Pillars',       blurb: 'Three bays behind stone. One seed cannot reach them all.' },
];

const mapOf = spec => (spec.map || mapFor(spec.seed)).replace(/^\n/, '').replace(/\n$/, '');
const xy = (i, w) => [i % w, Math.floor(i / w)];

/* --------------------------------------------------------------------- run */
const out = { clear: [], hold: [], bloom: [], sweep: [] };

console.log('CLEAR — fewest cells that empty the board (proven minimum)');
for (const spec of CLEAR) {
  const map = mapOf(spec), lvl = S.parse(map);
  if (S.run(lvl.dirt, lvl.w, lvl.h, lvl.rock, BUDGET)) throw new Error(`${spec.key}: clears itself`);
  let r = S.solve(lvl, { maxK: 2, dist: 4, cap: 400, budget: BUDGET });
  if (r.par === null) r = S.solve(lvl, { maxK: 3, dist: 3, cap: 100, budget: BUDGET });
  if (!r.par) throw new Error(`${spec.key}: unsolvable`);
  const board = Uint8Array.from(lvl.dirt);
  for (const c of r.solutions[0]) board[c] = 1;
  const gens = S.run(board, lvl.w, lvl.h, lvl.rock, BUDGET);
  if (!gens) throw new Error(`${spec.key}: stored solution fails`);
  out.clear.push({ key: spec.key, title: spec.title, blurb: spec.blurb, map,
    par: r.par, solutions: r.solutions.length, gens, solution: r.solutions[0].map(i => xy(i, lvl.w)) });
  console.log(`  ${spec.title.padEnd(17)} ${r.par} cell(s), ${String(r.solutions.length).padStart(3)} placement(s), clears in ${gens}`);
}

console.log('\nHOLD — clear it, but your lineage must never die out first (proven minimum)');
for (const spec of HOLD) {
  const map = mapOf(spec), lvl = E.parse(map);
  if (E.runHold(lvl.own, lvl.w, lvl.h, lvl.rock, BUDGET)) throw new Error(`${spec.key}: clears itself`);
  const r = minimal(lvl, own => E.runHold(own, lvl.w, lvl.h, lvl.rock, BUDGET), { maxK: 3, dist: 4, cap: 400 });
  if (!r) throw new Error(`${spec.key}: no hold solution at k<=3`);
  const gens = r.found[0].value;
  out.hold.push({ key: spec.key, title: spec.title, blurb: spec.blurb, map,
    par: r.k, solutions: r.found.length, gens, solution: r.found[0].cells.map(i => xy(i, lvl.w)) });
  console.log(`  ${spec.title.padEnd(17)} ${r.k} cell(s), ${String(r.found.length).padStart(3)} placement(s), clears in ${gens}`);
}

console.log(`\nBLOOM — most cells alive at generation ${BLOOM_GENS} using at most 2 (proven best)`);
for (const spec of BLOOM) {
  const map = mapOf(spec), lvl = E.parse(map);
  const base = E.runBloom(lvl.own, lvl.w, lvl.h, lvl.rock, BLOOM_GENS).final;
  const top = best(lvl, own => E.runBloom(own, lvl.w, lvl.h, lvl.rock, BLOOM_GENS).final, { maxK: 2, dist: 5 });
  if (top.value <= base) throw new Error(`${spec.key}: placement cannot improve on ${base}`);
  out.bloom.push({ key: spec.key, title: spec.title, blurb: spec.blurb, map,
    gensLimit: BLOOM_GENS, budget: 2, untouched: base, par: top.value,
    solution: top.cells.map(i => xy(i, lvl.w)) });
  console.log(`  ${spec.title.padEnd(17)} untouched ${String(base).padStart(2)} -> best ${top.value} with ${top.cells.length} cell(s)`);
}

console.log('\nSWEEP — visit every marked cell, in as few generations as possible (best known)');
for (const spec of SWEEP) {
  const a = ARENAS[spec.arena];
  const map = a.map.replace(/^\n/, '').replace(/\n$/, '');
  const lvl = parseSweep(map);
  const targets = lvl.target.reduce((s, v) => s + v, 0);
  const r = searchStamps(lvl, a.budget, { pairs: !!a.pairs });
  if (!r.best) throw new Error(`${spec.key}: no stamp covers the zone`);
  const check = Uint8Array.from(lvl.own);
  for (const i of r.best.cells) check[i] = 1;
  if (runZone(check, lvl) !== r.best.gens) throw new Error(`${spec.key}: stored solution disagrees`);
  out.sweep.push({ key: spec.key, title: spec.title, blurb: spec.blurb, map,
    budget: a.budget, targets, par: r.best.gens, bestWhat: r.best.what, bestUsed: r.best.used,
    solution: r.best.cells.map(i => xy(i, lvl.w)) });
  console.log(`  ${spec.title.padEnd(17)} ${String(targets).padStart(2)} targets, budget ${String(a.budget).padStart(2)} -> ${r.best.gens} gens via ${r.best.what} (${r.best.used} cells)`);
}

const GOALS = {
  clear: { key: 'clear', name: 'Clear', verb: 'fewest cells', proven: true,
    tagline: 'Empty the board using as few cells of your own as you can.' },
  hold:  { key: 'hold',  name: 'Hold on', verb: 'fewest cells', proven: true,
    tagline: 'Empty the board — but if only dirt is left alive, you have lost.' },
  bloom: { key: 'bloom', name: 'Bloom', verb: 'most alive', proven: true,
    tagline: 'Add up to two cells and grow the board as large as you can by generation 40.' },
  sweep: { key: 'sweep', name: 'Sweep', verb: 'fewest generations', proven: false,
    tagline: 'Every marked cell must be alive at least once. Take as few generations as you can.' },
};

fs.writeFileSync(__dirname + '/../levels.js',
`/* Puzzle levels for all four goals. Generated by tools/emit-challenges.js —
   do not edit by hand.

   clear / hold / bloom targets are exhaustive results: tools/search.js tries
   every placement of k cells near the dirt, so "fewest possible" and "best
   possible" mean exactly that. Sweep targets are the best a search over
   pattern stamps could find, which is an honest best known rather than a
   proof — beating one is a real result.

   Map legend: '.' empty, 'o' dirt, '#' rock, '*' a cell that must be visited. */
window.LIFE_GOALS = ${JSON.stringify(GOALS, null, 2)};
window.LIFE_LEVELS = ${JSON.stringify(out, null, 2)};
`);
console.log(`\nwrote ../levels.js — ${Object.entries(out).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
