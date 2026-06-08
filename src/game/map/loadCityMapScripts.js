import { CM, initCityMap } from './legacyRuntime.js';

export function startCityMapRuntime(canvas, options = {}) {
  resetCityMapRuntime();
  initCityMap(canvas, options);
}

export function resetCityMapRuntime() {
  CM.cleanup?.();
  CM.cleanup = null;
  CM.inited = false;
  CM.canvas = null;
  CM.ctx = null;
  CM.mini = null;
  CM.mctx = null;
  CM.drag = null;
  CM.dragged = false;
  if (CM.raf) {
    cancelAnimationFrame(CM.raf);
    CM.raf = null;
  }
}
