"use strict";

/* ============================================================================
 * citymap-camera.js - Helpers camera/projection pour la carte Canvas.
 *   Depend de CM (citymap-layout.js) et reste sans listeners DOM.
 * ============================================================================ */

function cityMapResizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 600;
  const h = canvas.clientHeight || 320;
  CM.dpr = dpr;
  CM.cw = w;
  CM.ch = h;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  CM.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function cityMapWorldAtScreen(sx, sy) {
  return {
    x: (sx - CM.cw / 2) / CM.cam.zoom + CM.cam.x,
    y: (sy - CM.ch / 2) / CM.cam.zoom + CM.cam.y
  };
}

function cityMapScreenFromWorld(wx, wy) {
  return {
    x: (wx - CM.cam.x) * CM.cam.zoom + CM.cw / 2,
    y: (wy - CM.cam.y) * CM.cam.zoom + CM.ch / 2
  };
}

function cityMapTileScreen(gx, gy, span = 1) {
  const s = CM.TILE * CM.cam.zoom;
  return {
    s,
    x: (gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2,
    y: (gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2,
    w: s * span,
    h: s * span
  };
}

function cityMapCenterCamera(layout) {
  if (!layout) return;
  CM.cam.x = layout.gridN * CM.TILE / 2;
  CM.cam.y = layout.gridN * CM.TILE / 2;
  CM.cam.zoom = Math.max(0.5, Math.min(1.6, CM.cw / (24 * CM.TILE)));
}
