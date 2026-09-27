'use strict';
const fs = require('fs');
const E = require('./engine');
const { best } = require('./search');
const { mapFor } = require('./generate');

const GENS = 40;
const rows = [];
for (let seed = 1; seed <= 90; seed++) {
  const map = mapFor(seed);
  const lvl = E.parse(map);
  const dirt = lvl.own.reduce((s, v) => s + (v === 2 ? 1 : 0), 0);
  if (dirt < 8) continue;
  const base = E.runBloom(lvl.own, lvl.w, lvl.h, lvl.rock, GENS);
  const t = Date.now();
  const top = best(lvl, own => E.runBloom(own, lvl.w, lvl.h, lvl.rock, GENS).final, { maxK: 2, dist: 5 });
  rows.push({ seed, map, dirt, base: base.final, top: top.value, cells: top.cells, used: top.cells.length,
    gain: top.value - base.final, ms: Date.now() - t, w: lvl.w });
}
rows.sort((a, b) => b.gain - a.gain);
console.log(`scanned ${rows.length} boards, ${GENS} generations, up to 2 cells\n`);
console.log('seed   dirt  untouched  best  gain  cells used');
for (const r of rows.slice(0, 20))
  console.log(`${String(r.seed).padStart(4)}  ${String(r.dirt).padStart(5)}  ${String(r.base).padStart(9)}  ${String(r.top).padStart(4)}  ${String(r.gain).padStart(4)}  ${r.used}`);
fs.writeFileSync('bloom-scan.json', JSON.stringify(rows));
console.log(`\nmedian gain ${rows[Math.floor(rows.length / 2)].gain}, worst ${rows[rows.length - 1].gain}`);
