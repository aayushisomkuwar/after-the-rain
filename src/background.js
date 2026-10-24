// Generates a soft, blurred "world outside the window" on an offscreen
// canvas: muted slate-blue sky, distant warm light glows, soft silhouettes.
// Cached and only regenerated on resize.

import { makeRng, rand, clamp, TAU } from './util.js';

export function createBackground(width, height, seed = 7) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.max(1, Math.floor(width * dpr));
  c.height = Math.max(1, Math.floor(height * dpr));
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);

  const rng = makeRng(seed);

  // Vertical base gradient: cool misty slate to soft silver.
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#3a4a5c');
  g.addColorStop(0.45, '#5b6b7c');
  g.addColorStop(0.75, '#7c8a98');
  g.addColorStop(1, '#9aa6b2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // Warm ambient glow in the lower-center (distant city light).
  const warm = ctx.createRadialGradient(
    width * 0.5, height * 0.78, 0,
    width * 0.5, height * 0.78, Math.max(width, height) * 0.6
  );
  warm.addColorStop(0, 'rgba(242, 217, 168, 0.22)');
  warm.addColorStop(0.35, 'rgba(220, 180, 130, 0.08)');
  warm.addColorStop(1, 'rgba(220, 180, 130, 0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, width, height);

  // Soft distant building silhouettes — two rows, heavily blurred.
  drawSkyline(ctx, width, height, rng, 0.62, 0.18, '#2d3a47', 0.5);
  drawSkyline(ctx, width, height, rng, 0.72, 0.13, '#3c4a58', 0.4);

  // A few pale window-lights dotted among the buildings.
  for (let i = 0; i < 40; i++) {
    const x = rand(rng, 0, width);
    const y = rand(rng, height * 0.5, height * 0.85);
    const r = rand(rng, 6, 16);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warmish = rng() > 0.5;
    const col = warmish ? 'rgba(244, 214, 160, 0.5)' : 'rgba(190, 210, 230, 0.4)';
    glow.addColorStop(0, col);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  // Atmospheric haze band across the middle.
  const haze = ctx.createLinearGradient(0, height * 0.4, 0, height * 0.7);
  haze.addColorStop(0, 'rgba(220, 230, 240, 0)');
  haze.addColorStop(0.5, 'rgba(214, 224, 234, 0.18)');
  haze.addColorStop(1, 'rgba(220, 230, 240, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  // Apply a real blur by drawing onto an offscreen canvas with a blur filter.
  const blurred = document.createElement('canvas');
  blurred.width = c.width;
  blurred.height = c.height;
  const bctx = blurred.getContext('2d');
  bctx.filter = 'blur(' + Math.max(6, Math.min(width, height) * 0.018) + 'px)';
  bctx.drawImage(c, 0, 0);

  // Add a faint vignette so the edges feel like a window frame.
  const vig = bctx.createRadialGradient(
    c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3,
    c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(8, 12, 18, 0.55)');
  bctx.fillStyle = vig;
  bctx.fillRect(0, 0, c.width, c.height);

  return blurred;
}

function drawSkyline(ctx, width, height, rng, baseY, amp, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, height);
  let x = 0;
  const step = Math.max(14, width / 90);
  while (x < width) {
    const w = rand(rng, step * 0.6, step * 1.6);
    const h = height * amp * (0.4 + rng() * 0.8);
    const top = height * baseY - h;
    ctx.lineTo(x, height * baseY);
    ctx.lineTo(x, top);
    ctx.lineTo(x + w, top);
    ctx.lineTo(x + w, height * baseY);
    x += w;
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
