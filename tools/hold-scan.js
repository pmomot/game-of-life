'use strict';
const fs = require('fs');
const E = require('./engine');
const { minimal } = require('./search');
const { mapFor } = require('./generate');

global.window = {};
eval(fs.readFileSync(__dirname + '/../levels.js', 'utf8'));

const maps = [];
for (const l of window.LIFE_LEVELS.clear) maps.push({ id: 'clear:' + l.key, map: l.map, par: l.par });
for (let seed = 1; seed <= 140; seed++) maps.push({ id: 'seed:' + seed, map: mapFor(seed) });

const rows = [];
for (const m of maps) {
  const lvl = E.parse(m.map);
  const dirt = lvl.own.reduce((s, v) => s + (v === 2 ? 1 : 0), 0);
  if (dirt < 6 || dirt > 20) continue;
  if (E.runHold(lvl.own, lvl.w, lvl.h, lvl.rock, 400)) continue;     // clears itself
  const t = Date.now();
  const r = minimal(lvl, own => E.runHold(own, lvl.w, lvl.h, lvl.rock, 400), { maxK: 2, dist: 4, cap: 400 });
  if (!r) continue;
  const gens = r.found[0].value;
  rows.push({ id: m.id, map: m.map, k: r.k, count: r.found.length, gens, dirt,
    clearPar: m.par ?? null, cells: r.found[0].cells, w: lvl.w, ms: Date.now() - t });
}
rows.sort((a, b) => a.k - b.k || a.count - b.count);
console.log(`${rows.length} boards solvable at k<=2 with the hold rule\n`);
console.log('tightest:');
for (const r of rows.slice(0, 18))
  console.log(`  ${r.id.padEnd(22)} k=${r.k}  ${String(r.count).padStart(3)} placement(s)  dirt ${String(r.dirt).padStart(2)}  clears in ${String(r.gens).padStart(3)}` +
    (r.clearPar ? `  (plain clear needs ${r.clearPar})` : ''));
console.log('\nroomiest:');
for (const r of rows.slice().sort((a, b) => b.count - a.count).slice(0, 8))
  console.log(`  ${r.id.padEnd(22)} k=${r.k}  ${String(r.count).padStart(3)} placement(s)  dirt ${String(r.dirt).padStart(2)}  clears in ${r.gens}`);
fs.writeFileSync(__dirname + '/hold-scan.json', JSON.stringify(rows));
