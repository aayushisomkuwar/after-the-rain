// Simulation state: droplets + fog clearing mask.
// The fog is stored as a single-channel alpha canvas (fogCanvas). Where it
// is opaque the glass looks frosted; where it is clear the background shows.
// Interactions "erase" fog with a soft brush and disturb droplets.

import { makeRng, rand, clamp, TAU } from './util.js';

const MIN_R = 3;
const MAX_R = 26;

export class Simulation {
  constructor(width, height, opts = {}) {
    this.width = width;
    this.height = height;
    this.dpr = opts.dpr || (window.devicePixelRatio || 1);
    this.liteFx = false;
    this.seed = opts.seed ?? 42;
    this.rng = makeRng(this.seed);
    this.droplets = [];
    this.fogCanvas = null;
    this.fogCtx = null;
    this.fogPatches = [];
    this.reset();
  }

  resize(width, height, dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.initFog();
    this.initDroplets();
  }

  reset() {
    this.rng = makeRng(this.seed);
    this.initFog();
    this.initDroplets();
  }

  initFog() {
    const W = Math.max(1, Math.floor(this.width * this.dpr));
    const H = Math.max(1, Math.floor(this.height * this.dpr));
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = W;
    this.fogCanvas.height = H;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogPatches = [];
    this.regenerateFog();
  }

  regenerateFog() {
    const ctx = this.fogCtx;
    const W = this.fogCanvas.width;
    const H = this.fogCanvas.height;
    const rng = this.rng;
    ctx.clearRect(0, 0, W, H);

    // Irregular soft fog patches forming the condensation.
    const count = Math.floor((W * H) / (90000 / (this.dpr * this.dpr)));
    for (let i = 0; i < count; i++) {
      const x = rand(rng, 0, W);
      const y = rand(rng, 0, H);
      const r = rand(rng, W * 0.04, W * 0.16) * (this.dpr * 0.6 + 0.4);
      const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = rand(rng, 0.12, 0.34);
      patch.addColorStop(0, `rgba(228, 236, 244, ${a})`);
      patch.addColorStop(0.6, `rgba(210, 224, 236, ${a * 0.5})`);
      patch.addColorStop(1, 'rgba(210, 224, 236, 0)');
      ctx.fillStyle = patch;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    this.fogPatches = []; // patches already baked in
  }

  initDroplets() {
    this.droplets = [];
    const area = this.width * this.height;
    const target = Math.min(420, Math.max(90, Math.floor(area / 9000)));
    for (let i = 0; i < target; i++) {
      this.droplets.push(this.spawnDroplet());
    }
  }

  spawnDroplet(x, y, r) {
    const rng = this.rng;
    const radius = r ?? rand(rng, MIN_R, MAX_R);
    return {
      x: x ?? rand(rng, 0, this.width),
      y: y ?? rand(rng, 0, this.height),
      r: radius,
      vx: 0,
      vy: 0,
      mass: radius * radius,
      stuck: true,
      stickTimer: rand(rng, 40, 240),
      trail: [],
      seed: Math.floor(rng() * 1e9),
      hueShift: rand(rng, -0.04, 0.04),
    };
  }

  // Disturb droplets near a point; strength scales with brush velocity.
  disturb(x, y, velocity) {
    const radius = 70 + Math.min(140, velocity * 1.4);
    for (const d of this.droplets) {
      const dx = d.x - x;
      const dy = d.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist < radius) {
        const f = (1 - dist / radius) * (0.6 + velocity * 0.02);
        d.vx += (dx / (dist + 1)) * f * 1.2;
        d.vy += (dy / (dist + 1)) * f * 1.2;
        d.stuck = false;
        d.stickTimer = Math.min(d.stickTimer, 6);
      }
    }
  }

  // Erase fog along a soft brush segment (x0,y0)->(x1,y1).
  brushFog(x0, y0, x1, y1, radius) {
    const ctx = this.fogCtx;
    const dpr = this.dpr;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (radius * 0.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      const px = (x0 + (x1 - x0) * t) * dpr;
      const py = (y0 + (y1 - y0) * t) * dpr;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius * dpr);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.22)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, radius * dpr, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // Slowly regrow fog over time for an evolving feel.
  regrow(dt) {
    if (this.liteFx) return;
    const ctx = this.fogCtx;
    const W = this.fogCanvas.width;
    const H = this.fogCanvas.height;
    const rng = this.rng;
    const n = Math.floor(dt * 4);
    for (let i = 0; i < n; i++) {
      const x = rand(rng, 0, W);
      const y = rand(rng, 0, H);
      const r = rand(rng, W * 0.03, W * 0.08) * (this.dpr * 0.6 + 0.4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = rand(rng, 0.01, 0.05);
      g.addColorStop(0, `rgba(220, 230, 240, ${a})`);
      g.addColorStop(1, 'rgba(220, 230, 240, 0)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  update(dt) {
    const W = this.width;
    const H = this.height;
    const gravity = 0.018;
    const drag = 0.985;

    for (const d of this.droplets) {
      if (d.stuck) {
        d.stickTimer -= dt * 60;
        if (d.stickTimer <= 0) {
          d.stuck = false;
          d.vy = rand(this.rng, 0.2, 0.6);
        }
        continue;
      }
      // Droplets accelerate under gravity, larger ones move faster.
      const massFactor = Math.min(1.6, d.r / 12);
      d.vy += gravity * massFactor * dt * 60;
      d.vx *= drag;
      d.vy *= drag;
      d.x += d.vx * dt * 60;
      d.y += d.vy * dt * 60;

      // Small surface-tension wobble.
      d.vx += Math.sin((d.y + d.seed) * 0.01) * 0.02 * dt * 60;

      // Leave a wet trail.
      if (!this.liteFx && (Math.abs(d.vx) + Math.abs(d.vy)) > 0.6) {
        d.trail.push({ x: d.x, y: d.y, r: d.r * 0.5, a: 0.5 });
        if (d.trail.length > 24) d.trail.shift();
      }
      for (const t of d.trail) t.a *= 0.92;

      // Merge with nearby droplets of similar size.
      if (!this.liteFx) {
        for (const o of this.droplets) {
          if (o === d || o.r <= MIN_R) continue;
          const dx = o.x - d.x;
          const dy = o.y - d.y;
          const dist = Math.hypot(dx, dy);
          if (dist < (o.r + d.r) * 0.7 && d.r < o.r) {
            // absorb d into o
            o.r = Math.min(MAX_R, Math.sqrt(o.r * o.r + d.r * d.r));
            o.mass = o.r * o.r;
            o.vx += d.vx * (d.mass / o.mass);
            o.vy += d.vy * (d.mass / o.mass);
            d.r = 0;
            break;
          }
        }
      }

      // Reset off-screen or consumed droplets.
      if (d.r <= 0 || d.y - d.r > H + 40) {
        Object.assign(d, this.spawnDroplet(rand(this.rng, 0, W), rand(this.rng, -40, -10), rand(this.rng, MIN_R, MAX_R)));
      }
      if (d.x < -d.r) d.x = W + d.r;
      if (d.x > W + d.r) d.x = -d.r;
    }

    this.regrow(dt);
  }
}
