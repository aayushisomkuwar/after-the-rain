// Small deterministic-ish utilities used across the engine.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Mulberry32: tiny seeded PRNG so the scene is deterministic on reset.
export function makeRng(seed = 1234) {
  let s = seed >>> 0;
  return function rng() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rand(rng, a, b) { return a + (b - a) * rng(); }
export function randInt(rng, a, b) { return Math.floor(rand(rng, a, b + 1)); }

// Exponential moving average for smoothing noisy fingertip data.
export function smooth(value, target, factor) {
  return value + (target - value) * factor;
}
