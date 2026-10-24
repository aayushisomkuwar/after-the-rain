// Draws the composite scene: background -> fog (with cleared mask) ->
// droplets (with highlights, shadows, trails) -> interaction trail glow.
// Renders into the visible canvas each frame.

import { clamp, TAU } from './util.js';

export class Renderer {
  constructor(ctx, simulation) {
    this.ctx = ctx;
    this.sim = simulation;
    this.background = null;
    this.trail = []; // interaction trail glow points
    this.time = 0;
  }

  setBackground(bg) { this.background = bg; }

  clearInteractionTrail() { this.trail = []; }

  addTrail(x, y, strength) {
    this.trail.push({ x, y, a: clamp(strength, 0, 1), r: 18 });
    if (this.trail.length > 60) this.trail.shift();
  }

  draw(dt) {
    this.time += dt;
    const ctx = this.ctx;
    const sim = this.sim;
    const W = sim.width;
    const H = sim.height;
    const dpr = sim.dpr;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 1. Background world.
    if (this.background) {
      ctx.drawImage(this.background, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#3a4a5c';
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Fog overlay (the frost). Use destination-over trick: we draw the
    // fog as a translucent white layer on top, but where the brush cleared
    // it the background shows through. We composite the fog canvas directly.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sim.fogCanvas, 0, 0, sim.fogCanvas.width, sim.fogCanvas.height, 0, 0, W * dpr, H * dpr);
    ctx.restore();

    // 2b. A faint global condensation tint to unify cleared regions.
    // (skipped — handled by fog canvas alpha)

    // 3. Interaction trail glow.
    if (this.trail.length) {
      for (const p of this.trail) {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        grad.addColorStop(0, `rgba(255, 255, 255, ${p.a * 0.18})`);
        grad.addColorStop(0.6, `rgba(220, 235, 250, ${p.a * 0.06})`);
        grad.addColorStop(1, 'rgba(220, 235, 250, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }
      for (const p of this.trail) p.a *= 0.93;
      this.trail = this.trail.filter(p => p.a > 0.03);
    }

    // 4. Droplets.
    for (const d of sim.droplets) {
      if (d.r <= 0) continue;

      // trails (wet streaks behind moving droplets)
      if (!sim.liteFx && d.trail.length) {
        for (const t of d.trail) {
          if (t.a < 0.04) continue;
          const tg = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
          tg.addColorStop(0, `rgba(220, 232, 244, ${t.a * 0.4})`);
          tg.addColorStop(1, 'rgba(220, 232, 244, 0)');
          ctx.fillStyle = tg;
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r, 0, TAU);
          ctx.fill();
        }
      }

      const r = d.r;
      // shadow (subtle dark rim underneath)
      const sh = ctx.createRadialGradient(d.x, d.y + r * 0.25, r * 0.2, d.x, d.y + r * 0.25, r * 1.15);
      sh.addColorStop(0, 'rgba(10, 16, 24, 0)');
      sh.addColorStop(0.7, 'rgba(10, 16, 24, 0.12)');
      sh.addColorStop(1, 'rgba(10, 16, 24, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(d.x, d.y + r * 0.18, r * 1.15, 0, TAU);
      ctx.fill();

      // body — a translucent lens: dark rim, lighter center (refraction)
      const body = ctx.createRadialGradient(d.x - r * 0.3, d.y - r * 0.3, r * 0.1, d.x, d.y, r);
      body.addColorStop(0, 'rgba(232, 240, 250, 0.5)');
      body.addColorStop(0.55, 'rgba(150, 170, 190, 0.22)');
      body.addColorStop(0.85, 'rgba(40, 54, 70, 0.34)');
      body.addColorStop(1, 'rgba(20, 30, 42, 0.5)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, TAU);
      ctx.fill();

      // highlight (specular) upper-left
      const hr = r * 0.42;
      const hx = d.x - r * 0.35;
      const hy = d.y - r * 0.4;
      const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      hl.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      hl.addColorStop(0.6, 'rgba(255, 255, 255, 0.18)');
      hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, TAU);
      ctx.fill();

      // tiny secondary highlight lower-right (rim light)
      if (r > 6) {
        const h2r = r * 0.18;
        const h2x = d.x + r * 0.4;
        const h2y = d.y + r * 0.42;
        const h2 = ctx.createRadialGradient(h2x, h2y, 0, h2x, h2y, h2r);
        h2.addColorStop(0, 'rgba(220, 232, 245, 0.5)');
        h2.addColorStop(1, 'rgba(220, 232, 245, 0)');
        ctx.fillStyle = h2;
        ctx.beginPath();
        ctx.arc(h2x, h2y, h2r, 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
