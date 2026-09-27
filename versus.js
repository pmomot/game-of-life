/* Two-player Game of Life on a torus.
   The cellular automaton is unmodified B3/S23 — only the colour of a newborn
   cell is decided, by majority of its three parents (the Immigration rule), so
   every pattern behaves exactly as it does in the sandbox. "Defection" is the
   single optional addition and can only fire where the two colours touch. */
(() => {
'use strict';

const PATTERNS = window.LIFE_PATTERNS;

/* ------------------------------------------------------------------- balance */
const ROUNDS = 12;        // rounds in a match
const GENS = 30;          // generations simulated per round
const START_ENERGY = 30;  // opening colony budget
const INCOME = 12;        // energy per round, flat
const POP_DIV = 25;       // plus one per this many living cells...
const POP_CAP = 12;       // ...up to this much
const ENERGY_CAP = 99;
const RADIUS = 8;         // you may build this far from a cell you own

/* -------------------------------------------------------------------- colors */
const DEAD = '#0b0e13';
const SIDES = [
  null,
  { key: 1, name: 'Blue',   base: '#4d9ef0', fresh: '#d8ebff', ui: '#4d9ef0' },
  { key: 2, name: 'Orange', base: '#f0953d', fresh: '#ffe3c4', ui: '#f0953d' },
];
const SETTLE = 14;

const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const pack = ([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const DEAD_U32 = pack(hex(DEAD));
// ages 0..255 for each side, packed into one table: (side - 1) * 256 + age
const LUT = (() => {
  const lut = new Uint32Array(512);
  for (const s of [1, 2]) {
    const fresh = hex(SIDES[s].fresh), base = hex(SIDES[s].base);
    for (let i = 0; i < 256; i++) lut[(s - 1) * 256 + i] = pack(mix(fresh, base, Math.min(i, SETTLE) / SETTLE));
  }
  return lut;
})();
// faint wash showing where the active player may build
const TINT = [0, pack(mix(hex(DEAD), hex(SIDES[1].base), 0.17)), pack(mix(hex(DEAD), hex(SIDES[2].base), 0.17))];

/* ----------------------------------------------------------------------- dom */
const $ = id => document.getElementById(id);
const stage = $('stage'), canvas = $('view'), ctx = canvas.getContext('2d', { alpha: false });
const elTurn = $('turn-label'), elSub = $('turn-sub'), elHint = $('hint'), elDone = $('btn-done');

/* --------------------------------------------------------------------- world */
let cols = 0, rows = 0, cellPx = 10, dpr = 1;
let own, bin, nown, nbin, ages, mask, colSum;
const off = document.createElement('canvas');
const offCtx = off.getContext('2d', { alpha: false });
let imgData = null, buf32 = null;

function allocate(w, h) {
  const oldOwn = own, oc = cols, or_ = rows;
  cols = w; rows = h;
  const n = w * h;
  own = new Uint8Array(n); bin = new Uint8Array(n);
  nown = new Uint8Array(n); nbin = new Uint8Array(n);
  ages = new Uint8Array(n); mask = new Uint8Array(n);
  colSum = new Uint8Array(w);
  if (oldOwn) {                                  // keep what still fits on resize
    const cw = Math.min(oc, w), ch = Math.min(or_, h);
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) own[y * w + x] = oldOwn[y * oc + x];
  }
  for (let i = 0; i < n; i++) bin[i] = own[i] ? 1 : 0;
  countPopulation();
  off.width = w; off.height = h;
  imgData = offCtx.createImageData(w, h);
  buf32 = new Uint32Array(imgData.data.buffer);
}

function layout() {
  const availW = Math.max(120, stage.clientWidth), availH = Math.max(120, stage.clientHeight);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = Math.max(8, Math.round(availW / cellPx));
  const exact = availW / c;
  const r = Math.max(8, Math.floor(availH / exact));
  canvas.style.width = availW + 'px';
  canvas.style.height = r * exact + 'px';
  canvas.width = Math.round(availW * dpr);
  canvas.height = Math.round(r * exact * dpr);
  ctx.imageSmoothingEnabled = false;
  if (c !== cols || r !== rows) {
    allocate(c, r);
    if (phase === 'place') rebuildMask(current);
  }
  dirty = true;
}

/* ---------------------------------------------------------------- simulation */
function step() {
  const w = cols, h = rows, o = own, b = bin, no = nown, nb = nbin, cs = colSum, def = defection;
  let p1 = 0, p2 = 0;

  for (let y = 0; y < h; y++) {
    const rN = (y === 0 ? h - 1 : y - 1) * w, rC = y * w, rS = (y === h - 1 ? 0 : y + 1) * w;
    for (let x = 0; x < w; x++) cs[x] = b[rN + x] + b[rC + x] + b[rS + x];

    let left = cs[w - 1], mid = cs[0], right;
    for (let x = 0; x < w; x++) {
      right = cs[x === w - 1 ? 0 : x + 1];
      const i = rC + x, self = b[i], n = left + mid + right - self;
      let owner = 0;

      if (self) {
        if (n === 2 || n === 3) {
          owner = o[i];
          if (def) {                      // surrounded only by the enemy? switch sides
            const xW = x === 0 ? w - 1 : x - 1, xE = x === w - 1 ? 0 : x + 1, foe = 3 - owner;
            let f = 0;
            if (o[rN + xW] === foe) f++; if (o[rN + x] === foe) f++; if (o[rN + xE] === foe) f++;
            if (o[rC + xW] === foe) f++;                                if (o[rC + xE] === foe) f++;
            if (o[rS + xW] === foe) f++; if (o[rS + x] === foe) f++; if (o[rS + xE] === foe) f++;
            if (f === n) owner = foe;
          }
        }
      } else if (n === 3) {               // born: majority colour of the 3 parents
        const xW = x === 0 ? w - 1 : x - 1, xE = x === w - 1 ? 0 : x + 1;
        let a = 0;
        if (o[rN + xW] === 1) a++; if (o[rN + x] === 1) a++; if (o[rN + xE] === 1) a++;
        if (o[rC + xW] === 1) a++;                              if (o[rC + xE] === 1) a++;
        if (o[rS + xW] === 1) a++; if (o[rS + x] === 1) a++; if (o[rS + xE] === 1) a++;
        owner = a >= 2 ? 1 : 2;
      }

      no[i] = owner; nb[i] = owner ? 1 : 0;
      ages[i] = owner && owner === o[i] ? (ages[i] < 255 ? ages[i] + 1 : 255) : 0;
      if (owner === 1) p1++; else if (owner === 2) p2++;
      left = mid; mid = right;
    }
  }

  let t = own; own = nown; nown = t;
  t = bin; bin = nbin; nbin = t;
  pop[1] = p1; pop[2] = p2;
  score[1] += p1; score[2] += p2;
  dirty = true;
}

function countPopulation() {
  let a = 0, b2 = 0;
  for (let i = 0, n = cols * rows; i < n; i++) { if (own[i] === 1) a++; else if (own[i] === 2) b2++; }
  pop[1] = a; pop[2] = b2;
}

/* ------------------------------------------------------------------- drawing */
function render() {
  const n = cols * rows, o = own, buf = buf32;
  const showMask = phase === 'place';
  const tint = showMask ? TINT[current] : DEAD_U32;
  for (let i = 0; i < n; i++) {
    const v = o[i];
    buf[i] = v ? LUT[(v - 1) * 256 + ages[i]] : (showMask && mask[i] ? tint : DEAD_U32);
  }
  offCtx.putImageData(imgData, 0, 0);
  ctx.drawImage(off, 0, 0, cols, rows, 0, 0, canvas.width, canvas.height);

  const px = canvas.width / cols;
  if (showGrid && px / dpr >= 6) {
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < cols; x++) { const gx = Math.round(x * px) + 0.5; ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); }
    const py = canvas.height / rows;
    for (let y = 1; y < rows; y++) { const gy = Math.round(y * py) + 0.5; ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); }
    ctx.stroke();
  }
}

/* ------------------------------------------------------------ build territory */
// The glow is computed once, at the start of a turn, from the cells the player
// owned then — otherwise each placed cell would extend it and a player could
// crawl across the board a cell at a time.
function rebuildMask(player) {
  mask.fill(0);
  if (halfMode) {
    const half = cols >> 1;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (own[i] === 0 && (player === 1 ? x < half : x >= half)) mask[i] = 1;
      }
  } else {
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if (own[y * cols + x] === player) dilate(x, y);
  }
  dirty = true;
}

function dilate(x, y) {
  for (let dy = -RADIUS; dy <= RADIUS; dy++) {
    const yy = ((y + dy) % rows + rows) % rows;
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      const xx = ((x + dx) % cols + cols) % cols;
      const j = yy * cols + xx;
      if (own[j] === 0) mask[j] = 1;
    }
  }
}

/* --------------------------------------------------------------------- turns */
let phase = 'place';          // 'place' | 'run' | 'over'
let round = 1, current = 1, order = [1, 2], turnIndex = 0, gensLeft = 0;
let halfMode = true;
const energy = [0, START_ENERGY, START_ENERGY];
const pop = [0, 0, 0];
const score = [0, 0, 0];
const placed = new Set();     // indices placed this turn, refundable
let dirty = true, defection = true, showGrid = true, speed = 18;

function startRound() {
  order = round % 2 === 1 ? [1, 2] : [2, 1];
  if (round > 1)
    for (const p of [1, 2])
      energy[p] = Math.min(ENERGY_CAP, energy[p] + INCOME + Math.min(POP_CAP, Math.floor(pop[p] / POP_DIV)));
  turnIndex = 0;
  startTurn(order[0]);
}

function startTurn(p) {
  clearFlash();
  phase = 'place';
  current = p;
  placed.clear();
  selectPreset(null);
  halfMode = round === 1 || pop[p] === 0;
  rebuildMask(p);
  syncUI();
}

function finishTurn() {
  clearFlash();
  turnIndex++;
  if (turnIndex < 2) { startTurn(order[turnIndex]); return; }
  phase = 'run';
  gensLeft = GENS;
  mask.fill(0);
  syncUI();
}

function finishRound() {
  round++;
  if (round > ROUNDS) { phase = 'over'; showResult(); syncUI(); }
  else startRound();
}

function restart() {
  own.fill(0); bin.fill(0); ages.fill(0); mask.fill(0);
  energy[1] = energy[2] = START_ENERGY;
  pop[1] = pop[2] = score[1] = score[2] = 0;
  round = 1;
  $('overlay').classList.add('hidden');
  startRound();
}

/* --------------------------------------------------------------------- edits */
function canPlace(x, y) {
  const i = y * cols + x;
  return own[i] === 0 && mask[i] === 1;
}

function place(x, y) {
  if (energy[current] <= 0) { flash('Out of energy this round.'); return false; }
  const i = y * cols + x;
  if (!canPlace(x, y)) return false;
  own[i] = current; bin[i] = 1; ages[i] = 0;
  pop[current]++; energy[current]--;
  placed.add(i);
  mask[i] = 0;
  dirty = true;
  return true;
}

function unplace(x, y) {
  const i = y * cols + x;
  if (!placed.has(i)) return false;
  own[i] = 0; bin[i] = 0; ages[i] = 0;
  pop[current]--; energy[current]++;
  placed.delete(i);
  mask[i] = 1;
  dirty = true;
  return true;
}

function stamp(p, cx, cy) {
  const { w, h, pts } = p.parsed;
  const ox = cx - (w >> 1), oy = cy - (h >> 1);
  const targets = pts.map(([x, y]) => [((ox + x) % cols + cols) % cols, ((oy + y) % rows + rows) % rows]);
  if (targets.length > energy[current]) { flash(`${p.name} costs ${targets.length} — you have ${energy[current]}.`); return; }
  if (!targets.every(([x, y]) => canPlace(x, y))) {
    flash(halfMode
      ? `No room — the whole ${p.name} must fit on your ${current === 1 ? 'left' : 'right'} half.`
      : `No room — the whole ${p.name} must land inside your glow.`);
    return;
  }
  for (const [x, y] of targets) place(x, y);
  selectPreset(null);
}

/* -------------------------------------------------------------------- input */
const pointers = new Map();
let armedPreset = null;

function cellAt(ev) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - r.left) / (r.width / cols));
  const y = Math.floor((ev.clientY - r.top) / (r.height / rows));
  return [Math.min(cols - 1, Math.max(0, x)), Math.min(rows - 1, Math.max(0, y))];
}

function lineTo(x0, y0, x1, y1, fn) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

canvas.addEventListener('pointerdown', ev => {
  if (phase !== 'place') return;
  ev.preventDefault();
  canvas.setPointerCapture(ev.pointerId);
  const [x, y] = cellAt(ev);
  if (armedPreset) { stamp(armedPreset, x, y); syncUI(); return; }
  const mode = placed.has(y * cols + x) ? 'remove' : 'place';
  if (mode === 'place' && own[y * cols + x] !== 0) {
    flash(own[y * cols + x] === current ? 'That cell is already yours.' : 'You cannot build on enemy cells.');
    return;
  }
  if (mode === 'place' && mask[y * cols + x] === 0) {
    flash(halfMode
      ? `Your ${round === 1 ? 'opening colony' : 'new colony'} must go on your ${current === 1 ? 'left' : 'right'} half.`
      : 'Too far from your colony — build inside the glow.');
    return;
  }
  pointers.set(ev.pointerId, { mode, lx: x, ly: y });
  (mode === 'place' ? place : unplace)(x, y);
  syncUI();
});

canvas.addEventListener('pointermove', ev => {
  const p = pointers.get(ev.pointerId);
  if (!p || phase !== 'place') return;
  ev.preventDefault();
  let evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : null;
  if (!evs || !evs.length) evs = [ev];
  const act = p.mode === 'place' ? place : unplace;
  for (const e of evs) {
    const [x, y] = cellAt(e);
    if (x === p.lx && y === p.ly) continue;
    lineTo(p.lx, p.ly, x, y, act);
    p.lx = x; p.ly = y;
  }
  syncUI();
});

const endPointer = ev => pointers.delete(ev.pointerId);
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', ev => ev.preventDefault());

/* ------------------------------------------------------------------ chrome */
const chipBox = $('preset-chips');
const chips = PATTERNS.map(p => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.innerHTML = `${p.name} <span class="cost">${p.parsed.pts.length}</span>`;
  b.onclick = () => selectPreset(armedPreset === p ? null : p);
  chipBox.appendChild(b);
  return { p, b };
});

function selectPreset(p) {
  armedPreset = p;
  for (const c of chips) c.b.classList.toggle('active', c.p === p);
  if (p) {
    const cost = p.parsed.pts.length;
    flash(cost > energy[current]
      ? `${p.name} costs ${cost} — you only have ${energy[current]}.`
      : `${p.name} armed — tap to place it for ${cost} energy.`);
  } else if (phase === 'place') restoreHint();
}

let flashTimer = 0, flashing = false;
function flash(msg) {
  elHint.textContent = msg;
  flashing = true;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashing = false; restoreHint(); }, 2600);
}
function clearFlash() { flashing = false; clearTimeout(flashTimer); }
function restoreHint() {
  if (flashing) return;              // a message is up; do not talk over it
  if (phase === 'run') elHint.textContent = 'Running the board — patterns collide, colonies trade ground.';
  else if (phase === 'over') elHint.textContent = 'Match over.';
  else if (halfMode) elHint.textContent = `Place anywhere on your ${current === 1 ? 'left' : 'right'} half. Tap a cell again to take it back.`;
  else elHint.textContent = 'Tap empty cells inside your glow to place them. Tap a cell you just placed to take it back.';
}

const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n);

function syncUI() {
  for (const s of [1, 2]) {
    $('pop-' + s).textContent = fmt(pop[s]);
    $('score-' + s).textContent = fmt(score[s]);
    $('energy-' + s).textContent = energy[s];
    $('side-' + s).classList.toggle('acting', phase === 'place' && current === s);
  }
  document.documentElement.style.setProperty('--accent', phase === 'place' ? SIDES[current].ui : '#58d68d');
  document.documentElement.style.setProperty('--accent-ink', phase === 'place' ? '#06131f' : '#06240f');

  if (phase === 'place') {
    elTurn.textContent = `${SIDES[current].name} — ${round === 1 ? 'place your opening colony' : 'place your cells'}`;
    elSub.textContent = `Round ${round} of ${ROUNDS} · ⚡${energy[current]} left`;
    elDone.textContent = turnIndex === 0 ? 'Done ▸' : 'Run 30 gens ▸';
    elDone.disabled = false;
    $('preset-bar').classList.remove('disabled');
  } else if (phase === 'run') {
    elTurn.textContent = 'Running…';
    elSub.textContent = `Round ${round} of ${ROUNDS} · ${gensLeft} generations left`;
    elDone.textContent = 'Skip ▸';
    elDone.disabled = false;
    $('preset-bar').classList.add('disabled');
  } else {
    elTurn.textContent = 'Match over';
    elSub.textContent = `${SIDES[1].name} ${fmt(score[1])} · ${SIDES[2].name} ${fmt(score[2])}`;
    elDone.disabled = true;
    $('preset-bar').classList.add('disabled');
  }
  restoreHint();
}

function showResult() {
  const [a, b] = [score[1], score[2]];
  const win = a === b ? null : (a > b ? SIDES[1] : SIDES[2]);
  $('over-title').textContent = win ? `${win.name} wins` : 'A dead heat';
  $('over-body').textContent =
    `${SIDES[1].name} scored ${fmt(a)} and ended with ${fmt(pop[1])} cells. ` +
    `${SIDES[2].name} scored ${fmt(b)} and ended with ${fmt(pop[2])} cells.`;
  $('overlay').classList.remove('hidden');
}

elDone.onclick = () => {
  if (phase === 'place') finishTurn();
  else if (phase === 'run') { while (gensLeft > 0) { step(); gensLeft--; } finishRound(); }
};
$('btn-restart').onclick = () => { if (phase === 'over' || confirm('Restart the match?')) restart(); };
$('btn-again').onclick = restart;
$('btn-rules').onclick = () => $('rules').classList.remove('hidden');
$('btn-rules-close').onclick = () => $('rules').classList.add('hidden');
$('rules').addEventListener('click', ev => { if (ev.target.id === 'rules') $('rules').classList.add('hidden'); });

const elSpeed = $('speed'), elSpeedOut = $('speed-out');
elSpeed.oninput = () => { speed = +elSpeed.value; elSpeedOut.textContent = speed + '/s'; };
const elCell = $('cellsize'), elCellOut = $('cellsize-out');
elCell.oninput = () => { cellPx = +elCell.value; elCellOut.textContent = cellPx + 'px'; layout(); };
$('defect').onchange = e => { defection = e.target.checked; };
$('gridlines').onchange = e => { showGrid = e.target.checked; dirty = true; };

window.addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT') return;
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); elDone.click(); }
  else if (ev.key === 'Escape') { selectPreset(null); $('rules').classList.add('hidden'); }
});

/* ---------------------------------------------------------------------- loop */
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 250);
  last = now;
  if (phase === 'run') {
    acc += dt;
    const interval = 1000 / speed;
    let budget = 6;
    while (acc >= interval && gensLeft > 0 && budget-- > 0) { step(); gensLeft--; acc -= interval; }
    if (acc > interval * 6) acc = 0;
    syncUI();
    if (gensLeft === 0) finishRound();
  }
  if (dirty) { render(); dirty = false; }
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------- start */
let resizeTimer = 0;
const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 80); };
if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

cellPx = window.innerWidth < 720 ? 9 : 10;
elCell.value = cellPx; elCellOut.textContent = cellPx + 'px';
elSpeedOut.textContent = speed + '/s';
layout();
startRound();
requestAnimationFrame(frame);
})();
