/* Conway's Game of Life — toroidal (edge-wrapping) world, canvas + typed arrays. */
(() => {
'use strict';

/* ------------------------------------------------------------------ patterns */
// Defined in patterns.js: '.' dead, 'O' alive, stamped centered on the tapped cell.
const PATTERNS = window.LIFE_PATTERNS;

/* -------------------------------------------------------------------- colors */
const COLOR_DEAD = '#0b0e13';
const COLOR_NEW = '#eafff2';   // just born
const COLOR_OLD = '#3fbf78';   // settled
const SETTLE = 14;             // generations to fade from new -> old

function packRGBA(hex) {                       // -> little-endian 0xAABBGGRR
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (255 << 24 | b << 16 | g << 8 | r) >>> 0;
}
const DEAD_U32 = packRGBA(COLOR_DEAD);
const PLAIN_U32 = packRGBA(COLOR_OLD);
const AGE_LUT = (() => {
  const a = parseInt(COLOR_NEW.slice(1), 16), b = parseInt(COLOR_OLD.slice(1), 16);
  const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255;
  const br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = Math.min(i, SETTLE) / SETTLE;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    lut[i] = (255 << 24 | bl << 16 | g << 8 | r) >>> 0;
  }
  return lut;
})();

/* ----------------------------------------------------------------------- dom */
const $ = id => document.getElementById(id);
const stage = $('stage');
const canvas = $('view');
const ctx = canvas.getContext('2d', { alpha: false });
const elGen = $('stat-gen'), elPop = $('stat-pop'), elFps = $('stat-fps'), elSize = $('stat-size');
const elHint = $('hint');

/* --------------------------------------------------------------------- world */
let cols = 0, rows = 0, cellPx = 10, dpr = 1;
let grid, next, ages, colSum;
let population = 0, generation = 0;

// offscreen 1px-per-cell buffer, scaled up on draw — one blit instead of N fillRects
const off = document.createElement('canvas');
const offCtx = off.getContext('2d', { alpha: false });
let imgData = null, buf32 = null;

function allocate(w, h) {
  const oldGrid = grid, oldCols = cols, oldRows = rows;
  cols = w; rows = h;
  const n = w * h;
  grid = new Uint8Array(n);
  next = new Uint8Array(n);
  ages = new Uint8Array(n);
  colSum = new Uint8Array(w);

  if (oldGrid) {                       // keep whatever still fits after a resize
    const cw = Math.min(oldCols, w), ch = Math.min(oldRows, h);
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++)
        grid[y * w + x] = oldGrid[y * oldCols + x];
  }
  population = 0;
  for (let i = 0; i < n; i++) if (grid[i]) population++;

  off.width = w; off.height = h;
  imgData = offCtx.createImageData(w, h);
  buf32 = new Uint32Array(imgData.data.buffer);
  offCtx.imageSmoothingEnabled = false;
}

function layout() {
  const availW = Math.max(120, stage.clientWidth);
  const availH = Math.max(120, stage.clientHeight);
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  // grid spans the full stage width exactly; cell size is nudged to divide it
  const c = Math.max(8, Math.round(availW / cellPx));
  const exact = availW / c;
  const r = Math.max(8, Math.floor(availH / exact));

  const cssW = availW, cssH = r * exact;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.imageSmoothingEnabled = false;

  if (c !== cols || r !== rows) allocate(c, r);
  elSize.textContent = cols + '×' + rows;
  dirty = true;
}

/* ---------------------------------------------------------------- simulation */
// Per row: column sums of the 3 vertically-adjacent cells, then a 3-wide sliding
// window across them. ~5 adds per cell instead of 8, all wrapped on a torus.
function step() {
  const w = cols, h = rows, cur = grid, nxt = next, cs = colSum;
  const withAges = ageColors;
  let pop = 0;

  for (let y = 0; y < h; y++) {
    const rN = (y === 0 ? h - 1 : y - 1) * w;
    const rC = y * w;
    const rS = (y === h - 1 ? 0 : y + 1) * w;

    for (let x = 0; x < w; x++) cs[x] = cur[rN + x] + cur[rC + x] + cur[rS + x];

    let left = cs[w - 1], mid = cs[0], right;
    for (let x = 0; x < w; x++) {
      right = cs[x === w - 1 ? 0 : x + 1];
      const i = rC + x;
      const self = cur[i];
      const n = left + mid + right - self;
      const alive = (n === 3 || (n === 2 && self)) ? 1 : 0;
      nxt[i] = alive;
      pop += alive;
      if (withAges) {
        const a = ages[i];
        ages[i] = alive ? (a < 255 ? a + 1 : 255) : 0;
      }
      left = mid; mid = right;
    }
  }

  const t = grid; grid = next; next = t;
  population = pop;
  generation++;
  dirty = true;
}

/* ------------------------------------------------------------------- drawing */
function render() {
  const n = cols * rows, g = grid, buf = buf32;
  if (ageColors) {
    for (let i = 0; i < n; i++) buf[i] = g[i] ? AGE_LUT[ages[i]] : DEAD_U32;
  } else {
    for (let i = 0; i < n; i++) buf[i] = g[i] ? PLAIN_U32 : DEAD_U32;
  }
  offCtx.putImageData(imgData, 0, 0);
  ctx.drawImage(off, 0, 0, cols, rows, 0, 0, canvas.width, canvas.height);

  const px = canvas.width / cols;
  if (showGrid && px / dpr >= 6) {          // only when cells are big enough to read
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < cols; x++) {
      const gx = Math.round(x * px) + 0.5;
      ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height);
    }
    for (let y = 1; y < rows; y++) {
      const gy = Math.round(y * (canvas.height / rows)) + 0.5;
      ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy);
    }
    ctx.stroke();
  }
}

/* --------------------------------------------------------------------- edits */
function setCell(x, y, v) {
  x = ((x % cols) + cols) % cols;
  y = ((y % rows) + rows) % rows;
  const i = y * cols + x;
  if (grid[i] === v) return;
  grid[i] = v;
  ages[i] = 0;
  population += v ? 1 : -1;
  dirty = true;
}

function stampPattern(p, cx, cy) {
  const { w, h, pts } = p.parsed;
  const ox = cx - (w >> 1), oy = cy - (h >> 1);
  for (let k = 0; k < pts.length; k++) setCell(ox + pts[k][0], oy + pts[k][1], 1);
}

function clearAll() {
  grid.fill(0); ages.fill(0);
  population = 0; generation = 0;
  dirty = true;
}

function randomize(density = 0.28) {
  for (let i = 0, n = cols * rows; i < n; i++) {
    grid[i] = Math.random() < density ? 1 : 0;
    ages[i] = 0;
  }
  population = 0;
  for (let i = 0, n = cols * rows; i < n; i++) if (grid[i]) population++;
  generation = 0;
  dirty = true;
}

/* -------------------------------------------------------------------- input */
const pointers = new Map();   // pointerId -> { mode, lx, ly }
let armedPreset = null;

function cellAt(ev) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - r.left) / (r.width / cols));
  const y = Math.floor((ev.clientY - r.top) / (r.height / rows));
  return [Math.min(cols - 1, Math.max(0, x)), Math.min(rows - 1, Math.max(0, y))];
}

function line(x0, y0, x1, y1, v) {          // Bresenham, so fast drags stay solid
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setCell(x0, y0, v);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  canvas.setPointerCapture(ev.pointerId);
  const [x, y] = cellAt(ev);
  if (armedPreset) { stampPattern(armedPreset, x, y); return; }
  const mode = grid[y * cols + x] ? 0 : 1;   // start on a live cell to erase
  pointers.set(ev.pointerId, { mode, lx: x, ly: y });
  setCell(x, y, mode);
});

canvas.addEventListener('pointermove', ev => {
  const p = pointers.get(ev.pointerId);
  if (!p) return;
  ev.preventDefault();
  let events = ev.getCoalescedEvents ? ev.getCoalescedEvents() : null;
  if (!events || !events.length) events = [ev];   // some browsers hand back an empty list
  for (const e of events) {
    const [x, y] = cellAt(e);
    if (x === p.lx && y === p.ly) continue;
    line(p.lx, p.ly, x, y, p.mode);
    p.lx = x; p.ly = y;
  }
});

const endPointer = ev => pointers.delete(ev.pointerId);
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', ev => ev.preventDefault());

/* ------------------------------------------------------------------ controls */
let running = false, dirty = true;
let ageColors = true, showGrid = true;
let gps = 20;                     // generations per second (122 = uncapped)

const btnPlay = $('btn-play');
function setRunning(v) {
  running = v;
  btnPlay.textContent = v ? '⏸ Pause' : '▶ Play';
  acc = 0; last = performance.now();
}
btnPlay.onclick = () => setRunning(!running);
$('btn-step').onclick = () => { setRunning(false); step(); };
$('btn-clear').onclick = () => clearAll();
$('btn-random').onclick = () => randomize();

const speed = $('speed'), speedOut = $('speed-out');
speed.oninput = () => {
  gps = +speed.value;
  speedOut.textContent = gps > 120 ? 'max' : gps + '/s';
};
const cellsize = $('cellsize'), cellOut = $('cellsize-out');
cellsize.oninput = () => {
  cellPx = +cellsize.value;
  cellOut.textContent = cellPx + 'px';
  layout();
};
$('agecolors').onchange = e => { ageColors = e.target.checked; if (!ageColors) ages.fill(0); dirty = true; };
$('gridlines').onchange = e => { showGrid = e.target.checked; dirty = true; };

const chipBox = $('preset-chips');
PATTERNS.forEach(p => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = p.name;
  b.onclick = () => selectPreset(p === armedPreset ? null : p);
  p.chip = b;
  chipBox.appendChild(b);
});

const DEFAULT_HINT = elHint.textContent;
function selectPreset(p) {
  armedPreset = p;
  PATTERNS.forEach(q => q.chip.classList.toggle('active', q === p));
  elHint.textContent = p
    ? `“${p.name}” armed — tap the grid to place it (tap the chip again or press Esc to draw normally).`
    : DEFAULT_HINT;
}

window.addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT') return;
  const k = ev.key.toLowerCase();
  if (k === ' ' || k === 'spacebar') { ev.preventDefault(); setRunning(!running); }
  else if (k === 's') { setRunning(false); step(); }
  else if (k === 'c') clearAll();
  else if (k === 'r') randomize();
  else if (k === 'escape') selectPreset(null);
});

/* ---------------------------------------------------------------------- loop */
let acc = 0, last = performance.now();
let fpsAvg = 0, statTimer = 0;

function frame(now) {
  const dt = Math.min(now - last, 250);
  last = now;

  if (running) {
    if (gps > 120) {
      step();                                   // uncapped: one gen per frame
    } else {
      acc += dt;
      const interval = 1000 / gps;
      let budget = 8;                           // never stall the frame
      while (acc >= interval && budget-- > 0) { step(); acc -= interval; }
      if (acc > interval * 8) acc = 0;
    }
  }

  if (dirty) { render(); dirty = false; }

  if (dt > 0) fpsAvg = fpsAvg ? fpsAvg * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
  statTimer += dt;
  if (statTimer > 200) {
    statTimer = 0;
    elGen.textContent = generation;
    elPop.textContent = population;
    elFps.textContent = Math.round(fpsAvg);
  }
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------- start */
let resizeTimer = 0;
const onResize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 80);
};
if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

cellPx = window.innerWidth < 720 ? 8 : 10;
cellsize.value = cellPx;
cellOut.textContent = cellPx + 'px';
speedOut.textContent = gps + '/s';
layout();

// a glider gun and a couple of gliders, so there is something moving on load
stampPattern(PATTERNS.find(p => p.name === 'Glider gun'), Math.floor(cols * 0.28), Math.floor(rows * 0.35));
stampPattern(PATTERNS.find(p => p.name === 'Glider'), Math.floor(cols * 0.75), Math.floor(rows * 0.7));
stampPattern(PATTERNS.find(p => p.name === 'Pulsar'), Math.floor(cols * 0.8), Math.floor(rows * 0.25));
setRunning(true);
requestAnimationFrame(frame);
})();
