import { CM, initCityMap } from './cityMapRuntime.js';
import { releaseLightLayer } from './lightLayer.js';

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
  CM.drag = null;
  CM.dragged = false;
  if (CM.raf) {
    cancelAnimationFrame(CM.raf);
    CM.raf = null;
  }
  // Le calque de lumière plein écran (12 à 30 Mo) ne survit pas à la carte (MEM-8).
  releaseLightLayer();
}
