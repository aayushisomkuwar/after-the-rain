import './style.css';
import { createBackground } from './src/background.js';
import { Simulation } from './src/simulation.js';
import { Renderer } from './src/renderer.js';
import { HandTracker } from './src/handTracker.js';
import { clamp } from './src/util.js';

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });
const video = document.getElementById('cam');
const downloadLink = document.getElementById('download');

const btnCamera = document.getElementById('btn-camera');
const btnPhoto = document.getElementById('btn-photo');
const btnReset = document.getElementById('btn-reset');
const btnFx = document.getElementById('btn-fx');
const statusEl = document.getElementById('status');
const statusLabel = statusEl.querySelector('.status-label');

let dpr = Math.min(window.devicePixelRatio || 1, 2);
let cssW = window.innerWidth;
let cssH = window.innerHeight;

let sim = new Simulation(cssW, cssH, { dpr, seed: 42 });
let renderer = new Renderer(ctx, sim);
renderer.setBackground(createBackground(cssW, cssH, 7));

let lastT = performance.now();
let rafId = null;
let running = true;

// Pointer (mouse/touch) fallback state.
const pointer = { active: false, x: 0, y: 0, px: 0, py: 0, pt: 0 };

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  sim.resize(cssW, cssH, dpr);
  renderer.setBackground(createBackground(cssW, cssH, 7));
}
window.addEventListener('resize', resize);

// ---- Interaction ----
function interactionAt(x, y, velocity) {
  sim.brushFog(pointer.px, pointer.py, x, y, 34);
  sim.disturb(x, y, velocity);
  renderer.addTrail(x, y, clamp(velocity * 0.4, 0.15, 1));
}

function onPointerDown(e) {
  pointer.active = true;
  const p = pointerFromEvent(e);
  pointer.x = pointer.px = p.x;
  pointer.y = pointer.py = p.y;
  pointer.pt = performance.now();
}
function onPointerMove(e) {
  if (!pointer.active) return;
  const p = pointerFromEvent(e);
  const now = performance.now();
  const dt = Math.max(1, now - pointer.pt);
  const vel = Math.hypot(p.x - pointer.x, p.y - pointer.y) / dt;
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.pt = now;
  interactionAt(p.x, p.y, vel * 1000);
}
function onPointerUp() { pointer.active = false; }

function pointerFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

canvas.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(e); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onPointerMove(e); }, { passive: false });
canvas.addEventListener('touchend', onPointerUp);

// ---- Hand tracking ----
const tracker = new HandTracker(video, canvas, {
  onState: (state) => {
    setStatusState(state);
    if (state === 'active') {
      btnCamera.setAttribute('aria-pressed', 'true');
      btnCamera.querySelector('.ctrl-label').textContent = 'Camera On';
    } else if (state === 'disabled') {
      btnCamera.setAttribute('aria-pressed', 'false');
      btnCamera.querySelector('.ctrl-label').textContent = 'Enable Camera';
    }
  },
  onFinger: (x, y, vel, detected) => {
    if (detected) {
      sim.brushFog(pointer.px, pointer.py, x, y, 36);
      sim.disturb(x, y, vel * 600);
      renderer.addTrail(x, y, clamp(vel * 200, 0.15, 1));
      pointer.px = x;
      pointer.py = y;
    }
  },
  onError: (err) => {
    console.warn('Hand tracking error:', err);
  },
});

btnCamera.addEventListener('click', async () => {
  if (tracker.state === 'active' || tracker.state === 'nohand' || tracker.state === 'loading' || tracker.state === 'requesting') {
    tracker.stop();
  } else {
    await tracker.start();
  }
});

function setStatusState(state) {
  statusEl.dataset.state = state === 'nohand' ? 'nohand' : state === 'error' ? 'error' : state === 'requesting' || state === 'loading' ? 'requesting' : state === 'active' ? 'active' : 'idle';
  const labels = {
    disabled: 'Move your finger over the glass',
    idle: 'Move your finger over the glass',
    requesting: 'Requesting camera permission…',
    loading: 'Loading hand model…',
    active: 'Camera live — trace the glass',
    nohand: 'No hand detected',
    error: 'Camera unavailable — using pointer',
  };
  statusLabel.textContent = labels[state] || labels.idle;
}

// ---- Photo export (canvas only, no UI) ----
btnPhoto.addEventListener('click', () => {
  // Ensure latest frame is drawn before capture.
  renderer.draw(0.016);
  const url = canvas.toDataURL('image/png');
  downloadLink.href = url;
  downloadLink.download = `after-the-rain-${Date.now()}.png`;
  downloadLink.click();
});

// ---- Reset ----
btnReset.addEventListener('click', () => {
  sim.reset();
  renderer.clearInteractionTrail();
  pointer.active = false;
  pointer.px = pointer.x = 0;
  pointer.py = pointer.y = 0;
  renderer.setBackground(createBackground(cssW, cssH, 7));
});

// ---- Lite FX toggle ----
btnFx.addEventListener('click', () => {
  const on = btnFx.getAttribute('aria-pressed') !== 'true';
  btnFx.setAttribute('aria-pressed', String(on));
  sim.liteFx = on;
});

// ---- Main loop ----
function frame(now) {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  sim.update(dt);
  renderer.draw(dt);
}

resize();
setStatusState('disabled');
rafId = requestAnimationFrame(frame);

// Cleanup on page hide.
window.addEventListener('pagehide', () => {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  tracker.stop();
});
