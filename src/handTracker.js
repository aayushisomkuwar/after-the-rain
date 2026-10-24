// Hand tracking with MediaPipe Tasks Vision HandLandmarker (video mode).
// Loads the wasm + model from CDN, runs detection on the webcam video,
// tracks the index fingertip (landmark 8), smooths coordinates, and maps
// the mirrored image into canvas (CSS) coordinates.
//
// The tracker never throws silently — it reports state through callbacks:
//   onState(state) where state in:
//     'disabled' | 'requesting' | 'loading' | 'active' | 'nohand' | 'error'
//   onFinger(canvasX, canvasY, velocity, detected) per frame when active.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { clamp, smooth } from './util.js';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandTracker {
  constructor(video, canvas, callbacks = {}) {
    this.video = video;
    this.canvas = canvas;
    this.cb = callbacks;
    this.active = false;
    this.landmarker = null;
    this.stream = null;
    this.lastVideoTime = -1;
    this.lastFinger = null; // { x, y, t } in canvas coords
    this.smoothed = { x: 0, y: 0, has: false };
    this.rafId = null;
    this.state = 'disabled';
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.cb.onState?.(s);
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this.setState('requesting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
    } catch (err) {
      this.active = false;
      this.setState('error');
      this.cb.onError?.(err);
      return;
    }

    this.setState('loading');
    try {
      if (!this.landmarker) {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        try {
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 1,
          });
        } catch {
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 1,
          });
        }
      }
    } catch (err) {
      this.stop();
      this.setState('error');
      this.cb.onError?.(err);
      return;
    }

    this.setState('active');
    this.loop();
  }

  stop() {
    this.active = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    this.lastFinger = null;
    this.smoothed.has = false;
    this.setState('disabled');
  }

  loop() {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(() => this.loop());
    const v = this.video;
    if (!v || v.readyState < 2 || !this.landmarker) return;

    const now = performance.now();
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;

    let res;
    try {
      res = this.landmarker.detectForVideo(v, now);
    } catch {
      return;
    }
    const hands = res?.landmarks;
    if (!hands || hands.length === 0) {
      this.setState('nohand');
      this.cb.onFinger?.(0, 0, 0, false);
      return;
    }

    this.setState('active');
    const tip = hands[0][8]; // index fingertip, normalized 0..1
    if (!tip) return;

    // Video is mirrored on display: we mirror X so movement matches.
    const nx = 1 - tip.x; // mirror horizontally
    const ny = tip.y;

    const rect = this.canvas.getBoundingClientRect();
    let cx = nx * rect.width;
    let cy = ny * rect.height;

    // Smooth with EMA.
    if (!this.smoothed.has) {
      this.smoothed.x = cx;
      this.smoothed.y = cy;
      this.smoothed.has = true;
    } else {
      this.smoothed.x = smooth(this.smoothed.x, cx, 0.35);
      this.smoothed.y = smooth(this.smoothed.y, cy, 0.35);
      cx = this.smoothed.x;
      cy = this.smoothed.y;
    }

    // velocity (pixels per ms)
    let vel = 0;
    if (this.lastFinger) {
      const dt = Math.max(1, now - this.lastFinger.t);
      vel = Math.hypot(cx - this.lastFinger.x, cy - this.lastFinger.y) / dt;
    }
    this.lastFinger = { x: cx, y: cy, t: now };

    this.cb.onFinger?.(cx, cy, vel, true);
  }
}
