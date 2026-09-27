/* Puzzle modes. Four goals over the same engine: bounded Life with cell
   ownership, where your cells and the dirt are told apart by colour.

   Unlike the other two modes these boards do not wrap. A torus would make an
   escaping glider immortal, so a board could never be emptied or settle.

   Targets come from tools/ and are re-checked there on every build: clear,
   hold and bloom are exhaustive results, sweep is a best known. */
(() => {
'use strict';

const GOALS = window.LIFE_GOALS;
const SETS = window.LIFE_LEVELS;
const ORDER = ['clear', 'hold', 'bloom', 'sweep'];
const BUDGET = 400;                  // generations before an attempt is abandoned
const STORE = 'gol-puzzle-best';

/* -------------------------------------------------------------------- paint */
const PALETTE = {
  dead: '#0b0e13',
  rock: '#333c4f',
  target: '#1b4150',                 // a square that still needs visiting
  visited: '#2e6b5f',                // ...and one that has been
  mine: { fresh: '#eafff2', base: '#58d68d' },
  dirt: { fresh: '#f0dcc4', base: '#b0814e' },
};
const SETTLE = 12;
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const pack = ([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const DEAD_U32 = pack(hex(PALETTE.dead)), ROCK_U32 = pack(hex(PALETTE.rock));
const TARGET_U32 = pack(hex(PALETTE.target)), VISITED_U32 = pack(hex(PALETTE.visited));
const LUT = (() => {
  const lut = new Uint32Array(512);
  [PALETTE.mine, PALETTE.dirt].forEach((side, s) => {
    const f = hex(side.fresh), b = hex(side.base);
    for (let i = 0; i < 256; i++) lut[s * 256 + i] = pack(mix(f, b, Math.min(i, SETTLE) / SETTLE));
  });
  return lut;
})();

/* ----------------------------------------------------------------------- dom */
const $ = id => document.getElementById(id);
const stage = $('stage'), canvas = $('view'), ctx = canvas.getContext('2d', { alpha: false });
const elHint = $('hint'), elRun = $('btn-run');

/* --------------------------------------------------------------------- state */
let goalKey = 'clear', level = null, levelIndex = 0;
let cols = 0, rows = 0, cellPx = 10, dpr = 1;
let own, nown, ages, rock, target, seen, prev1, prev2;
let phase = 'edit';                  // 'edit' | 'run' | 'done'
let used = 0, generation = 0, population = 0, mine = 0, covered = 0, needed = 0;
let revealed = false, dirty = true, showGrid = true, speed = 26;
const off = document.createElement('canvas');
const offCtx = off.getContext('2d', { alpha: false });
let imgData = null, buf32 = null;

const goal = () => GOALS[goalKey];
const budgetOf = () => level.budget || 0;                    // 0 = unlimited
const lowerIsBetter = () => goalKey !== 'bloom';
const scoreOf = () => goalKey === 'bloom' ? population : goalKey === 'sweep' ? generation : used;

const best = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
const saveBest = () => { try { localStorage.setItem(STORE, JSON.stringify(best)); } catch { /* private mode */ } };
const bestKey = l => `${goalKey}:${l.key}`;

/* --------------------------------------------------------------------- setup */
function loadLevel(i) {
  clearFlash();
  levelIndex = i;
  level = SETS[goalKey][i];
  const lines = level.map.split('\n');
  rows = lines.length;
  cols = Math.max(...lines.map(l => l.length));
  const n = cols * rows;
  own = new Uint8Array(n); nown = new Uint8Array(n); ages = new Uint8Array(n);
  rock = new Uint8Array(n); target = new Uint8Array(n); seen = new Uint8Array(n);
  prev1 = new Uint8Array(n); prev2 = new Uint8Array(n);
  needed = 0;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < lines[y].length; x++) {
      const c = lines[y][x], j = y * cols + x;
      if (c === 'o' || c === 'O') { own[j] = 2; ages[j] = 255; }
      else if (c === '#') rock[j] = 1;
      else if (c === '*') { target[j] = 1; needed++; }
      else if (c === '@') { target[j] = 1; needed++; own[j] = 2; ages[j] = 255; }
    }
  off.width = cols; off.height = rows;
  imgData = offCtx.createImageData(cols, rows);
  buf32 = new Uint32Array(imgData.data.buffer);

  phase = 'edit'; used = 0; generation = 0; revealed = false; covered = 0;
  countPopulation();
  $('result').classList.add('hidden');
  buildChips();
  applyLabels();
  layout();
  syncUI();
}

const resetLevel = () => loadLevel(levelIndex);

function selectGoal(key) {
  goalKey = key;
  buildGoalChips();
  loadLevel(0);
}

function layout() {
  const availW = Math.max(80, stage.clientWidth - 16), availH = Math.max(80, stage.clientHeight - 16);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cellPx = Math.min(40, Math.max(4, Math.floor(Math.min(availW / cols, availH / rows))));
  canvas.style.width = cols * cellPx + 'px';
  canvas.style.height = rows * cellPx + 'px';
  canvas.width = Math.round(cols * cellPx * dpr);
  canvas.height = Math.round(rows * cellPx * dpr);
  ctx.imageSmoothingEnabled = false;
  dirty = true;
}

/* ---------------------------------------------------------------- simulation */
/* Bounded board: out of bounds counts as dead, rock counts as dead and never
   holds a cell. A newborn takes the colour of the majority of its parents, so
   you can watch your own cells spread through the dirt. */
function step() {
  const w = cols, h = rows, o = own, no = nown;
  let pop = 0, mn = 0;
  for (let y = 0; y < h; y++) {
    const y0 = y > 0, y1 = y < h - 1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (rock[i]) { no[i] = 0; ages[i] = 0; continue; }
      const x0 = x > 0, x1 = x < w - 1;
      let n = 0, a = 0;
      const t = j => { const v = o[j]; if (v) { n++; if (v === 1) a++; } };
      if (y0) { if (x0) t(i - w - 1); t(i - w); if (x1) t(i - w + 1); }
      if (x0) t(i - 1); if (x1) t(i + 1);
      if (y1) { if (x0) t(i + w - 1); t(i + w); if (x1) t(i + w + 1); }
      const self = o[i];
      let v = 0;
      if (self) { if (n === 2 || n === 3) v = self; }
      else if (n === 3) v = a >= 2 ? 1 : 2;
      no[i] = v;
      ages[i] = v && v === self ? (ages[i] < 255 ? ages[i] + 1 : 255) : 0;
      if (v) { pop++; if (v === 1) mn++; }
    }
  }
  const t = own; own = nown; nown = t;
  population = pop; mine = mn;
  generation++;
  dirty = true;
}

function countPopulation() {
  let p = 0, m = 0;
  for (let i = 0, n = cols * rows; i < n; i++) if (own[i]) { p++; if (own[i] === 1) m++; }
  population = p; mine = m;
}

function markSeen() {
  for (let i = 0, n = cols * rows; i < n; i++)
    if (own[i] && target[i] && !seen[i]) { seen[i] = 1; covered++; dirty = true; }
}

const settled = () => {
  const n = cols * rows;
  let s1 = true, s2 = true;
  for (let i = 0; i < n; i++) {
    if (own[i] !== prev1[i]) s1 = false;
    if (own[i] !== prev2[i]) s2 = false;
    if (!s1 && !s2) return false;
  }
  return true;
};

/* -------------------------------------------------------------------- drawing */
function render() {
  const n = cols * rows;
  for (let i = 0; i < n; i++) {
    const v = own[i];
    buf32[i] = v ? LUT[(v - 1) * 256 + ages[i]]
      : rock[i] ? ROCK_U32
      : target[i] ? (seen[i] ? VISITED_U32 : TARGET_U32)
      : DEAD_U32;
  }
  offCtx.putImageData(imgData, 0, 0);
  ctx.drawImage(off, 0, 0, cols, rows, 0, 0, canvas.width, canvas.height);
  const px = canvas.width / cols;
  if (showGrid && px / dpr >= 6) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < cols; x++) { const gx = Math.round(x * px) + 0.5; ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); }
    const py = canvas.height / rows;
    for (let y = 1; y < rows; y++) { const gy = Math.round(y * py) + 0.5; ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); }
    ctx.stroke();
  }
}

/* ---------------------------------------------------------------------- input */
canvas.addEventListener('pointerdown', ev => {
  if (phase !== 'edit') return;
  ev.preventDefault();
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - r.left) / (r.width / cols));
  const y = Math.floor((ev.clientY - r.top) / (r.height / rows));
  if (x < 0 || y < 0 || x >= cols || y >= rows) return;
  const i = y * cols + x;
  if (rock[i]) { flash('Nothing can live on rock.'); return; }
  if (own[i] === 2) { flash('That is dirt — only Life can shift it.'); return; }
  if (own[i] === 1) { own[i] = 0; used--; population--; mine--; }
  else {
    const cap = budgetOf();
    if (cap && used >= cap) { flash(`This level gives you ${cap} cells. Take one back first.`); return; }
    own[i] = 1; ages[i] = 0; used++; population++; mine++;
  }
  dirty = true;
  syncUI();
});
canvas.addEventListener('contextmenu', ev => ev.preventDefault());

/* ----------------------------------------------------------------------- flow */
function startRun() {
  clearFlash();
  if (used === 0) { flash('Add at least one cell first.'); return; }
  phase = 'run';
  generation = 0;
  covered = 0; seen.fill(0);
  if (goalKey === 'sweep') markSeen();
  prev1.set(own); prev2.set(own);
  acc = 0; last = performance.now();
  syncUI();
}

const stopRun = () => { phase = 'edit'; syncUI(); };

/* One generation plus this goal's verdict. The order of these checks mirrors
   tools/engine.js exactly, so the numbers in the game and the numbers the
   solver proved are the same numbers. */
function tick() {
  prev2.set(prev1); prev1.set(own);
  step();
  if (goalKey === 'sweep') markSeen();

  if (goalKey === 'bloom') {
    if (generation >= level.gensLimit) finish(true);
    return;
  }
  if (goalKey === 'sweep') {
    if (covered === needed) return finish(true);
    if (population === 0) return finish(false, `Everything died at generation ${generation} with ${needed - covered} square${needed - covered === 1 ? '' : 's'} never visited.`);
    if (settled()) return finish(false, `The board settled at generation ${generation} with ${needed - covered} square${needed - covered === 1 ? '' : 's'} never visited, so it can never reach them.`);
    if (generation >= BUDGET) return finish(false, `Still going after ${BUDGET} generations, ${needed - covered} square${needed - covered === 1 ? '' : 's'} short.`);
    return;
  }
  if (population === 0) return finish(true);
  if (goalKey === 'hold' && mine === 0)
    return finish(false, `Your last cell died at generation ${generation} and only dirt is left. In this mode that is a loss, even though the board might still have cleared.`);
  if (settled()) return finish(false, `The board settled after ${generation} generations and will never die on its own. Reset and try a different placement.`);
  if (generation >= BUDGET) return finish(false, `Still going after ${BUDGET} generations. Reset and try a different placement.`);
}

function finish(won, reason) {
  clearFlash();
  phase = 'done';
  const par = level.par;
  const score = scoreOf();
  const matched = lowerIsBetter() ? score <= par : score >= par;
  const beat = goalKey === 'sweep' && score < par;

  if (won && !revealed) {
    const k = bestKey(level), prev = best[k];
    if (prev === undefined || (lowerIsBetter() ? score < prev : score > prev)) { best[k] = score; saveBest(); }
  }

  $('result-title').textContent = !won ? (goalKey === 'hold' && reason && reason.startsWith('Your last cell') ? 'Only dirt left' : 'Not clear')
    : revealed ? 'Revealed'
    : beat ? 'A new best'
    : matched ? 'Perfect'
    : 'Done';

  const cells = n => `${n} cell${n === 1 ? '' : 's'}`;
  let body;
  if (!won) body = reason;
  else if (revealed) body = `That is one answer, using ${cells(used)}. Reset and find it yourself to record a score.`;
  else if (goalKey === 'bloom')
    body = matched
      ? `${population} alive at generation ${level.gensLimit}, from ${level.untouched} if you had left it alone. That is the most this board can reach with two cells.`
      : `${population} alive at generation ${level.gensLimit}, up from ${level.untouched} untouched. Two cells can reach ${par}.`;
  else if (goalKey === 'sweep')
    body = beat
      ? `Every square visited in ${generation} generations — better than the ${par} the search found. Nicely done.`
      : matched
        ? `Every square visited in ${generation} generations, matching the best known.`
        : `Every square visited in ${generation} generations, with ${cells(used)}. The best known is ${par}.`;
  else
    body = matched
      ? `Cleared with ${cells(used)} in ${generation} generations, which is the fewest this board can be cleared with. Nothing wasted.`
      : `Cleared with ${cells(used)} in ${generation} generations. It can be done with ${cells(par)}.`;

  $('result-body').textContent = body;
  $('btn-next').disabled = levelIndex >= SETS[goalKey].length - 1;
  $('result').classList.remove('hidden');
  buildChips();
  syncUI();
}

function reveal() {
  resetLevel();
  revealed = true;
  for (const [x, y] of level.solution) {
    const i = y * cols + x;
    if (!own[i] && !rock[i]) { own[i] = 1; ages[i] = 0; used++; population++; mine++; }
  }
  dirty = true;
  flash(`One answer, using ${used} cell${used === 1 ? '' : 's'}. Press Run to watch it.`);
  syncUI();
}

/* --------------------------------------------------------------------- chrome */
function buildGoalChips() {
  const box = $('goal-chips');
  box.innerHTML = '';
  for (const key of ORDER) {
    const g = GOALS[key];
    const b = document.createElement('button');
    b.className = 'chip' + (key === goalKey ? ' active' : '');
    b.textContent = g.name;
    b.title = g.tagline;
    b.onclick = () => selectGoal(key);
    box.appendChild(b);
  }
}

function buildChips() {
  const box = $('level-chips');
  box.innerHTML = '';
  SETS[goalKey].forEach((l, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (i === levelIndex ? ' active' : '');
    const score = best[`${goalKey}:${l.key}`];
    const hit = score !== undefined && (lowerIsBetter() ? score <= l.par : score >= l.par);
    b.textContent = `${i + 1}${score === undefined ? '' : hit ? ' ★' : ' ✓'}`;
    b.title = score === undefined ? l.title : `${l.title} — your best ${score}, target ${l.par}`;
    b.onclick = () => loadLevel(i);
    box.appendChild(b);
  });
}

/* Each goal measures something different, so the header relabels itself. */
function applyLabels() {
  const cap = budgetOf();
  const set = (n, label) => { $('s' + n + 'l').textContent = label; };
  set(0, cap ? `of ${cap} cells used` : 'cells used');
  if (goalKey === 'bloom') { set(1, 'best possible'); set(2, 'alive'); set(3, `of ${level.gensLimit} gen`); }
  else if (goalKey === 'sweep') { set(1, 'best known'); set(2, `of ${needed} visited`); set(3, 'gen'); }
  else { set(1, 'fewest possible'); set(2, 'still alive'); set(3, 'gen'); }
}

let flashTimer = 0, flashing = false;
function flash(msg) {
  elHint.textContent = msg;
  flashing = true;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashing = false; restoreHint(); }, 2800);
}
function clearFlash() { flashing = false; clearTimeout(flashTimer); }

function restoreHint() {
  if (flashing) return;                        // a message is up; do not talk over it
  if (phase === 'run') { elHint.textContent = runningLine(); return; }
  if (phase === 'done') { elHint.textContent = 'Reset to try again, or pick another level.'; return; }
  elHint.textContent = `${level.title} — ${level.blurb} ${aimLine()}`;
}

function runningLine() {
  if (goalKey === 'bloom') return 'Growing — the count that matters is the one at the end.';
  if (goalKey === 'sweep') return 'Sweeping — every marked square has to light up at least once.';
  if (goalKey === 'hold') return 'Running — clear the dirt, and keep a cell of your own alive while you do it.';
  return 'Running — every cell has to go, including yours.';
}

function aimLine() {
  const cap = budgetOf();
  if (goalKey === 'bloom') return `Up to ${cap} cells; the most this board can reach is ${level.par} alive at generation ${level.gensLimit}.`;
  if (goalKey === 'sweep') return `Up to ${cap} cells; the best known is ${level.par} generations.`;
  return `This board can be cleared with ${level.par} cell${level.par === 1 ? '' : 's'} — fewer is impossible.`;
}

function syncUI() {
  $('s0v').textContent = used;
  $('s1v').textContent = level.par;
  $('s2v').textContent = goalKey === 'sweep' ? covered : population;
  $('s3v').textContent = generation;
  $('s0v').parentElement.classList.toggle('over', !!budgetOf() && used > budgetOf());
  elRun.textContent = phase === 'run' ? '⏸ Stop' : '▶ Run';
  elRun.disabled = phase === 'done';
  $('btn-reveal').disabled = phase === 'run';
  $('help-goal').textContent = goal().tagline;
  restoreHint();
}

elRun.onclick = () => (phase === 'run' ? stopRun() : startRun());
$('btn-reset').onclick = resetLevel;
$('btn-reveal').onclick = reveal;
$('btn-retry').onclick = resetLevel;
$('btn-next').onclick = () => loadLevel(Math.min(SETS[goalKey].length - 1, levelIndex + 1));
$('btn-help').onclick = () => $('help').classList.remove('hidden');
$('btn-help-close').onclick = () => $('help').classList.add('hidden');
$('help').addEventListener('click', ev => { if (ev.target.id === 'help') $('help').classList.add('hidden'); });

const elSpeed = $('speed'), elSpeedOut = $('speed-out');
elSpeed.oninput = () => { speed = +elSpeed.value; elSpeedOut.textContent = speed + '/s'; };
$('gridlines').onchange = e => { showGrid = e.target.checked; dirty = true; };

window.addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT') return;
  const k = ev.key.toLowerCase();
  if (k === ' ' || k === 'enter') { ev.preventDefault(); if (phase !== 'done') elRun.click(); }
  else if (k === 'r') resetLevel();
  else if (k === 'escape') { $('help').classList.add('hidden'); $('result').classList.add('hidden'); }
  else if (k === 'n' && phase === 'done') $('btn-next').click();
});

/* ----------------------------------------------------------------------- loop */
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 250);
  last = now;
  if (phase === 'run') {
    acc += dt;
    const interval = 1000 / speed;
    let guard = 6;
    while (acc >= interval && phase === 'run' && guard-- > 0) { tick(); acc -= interval; }
    if (acc > interval * 6) acc = 0;
    syncUI();
  }
  if (dirty) { render(); dirty = false; }
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------------- start */
let resizeTimer = 0;
const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 80); };
if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

elSpeedOut.textContent = speed + '/s';
buildGoalChips();
loadLevel(0);
requestAnimationFrame(frame);
})();
