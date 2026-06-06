"use strict";

/* ============================================================================
 * citymap-input.js - Interactions souris de la carte Canvas.
 *   Depend de CM et des helpers camera/projection.
 * ============================================================================ */

function bindCityMapInput(canvas, mapRoot, callbacks = {}) {
  const showHover = callbacks.showHover || function () {};
  const clearHover = callbacks.clearHover || function () {};

  // Zoom molette autour du curseur.
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = cityMapWorldAtScreen(mx, my);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    CM.cam.zoom = Math.max(0.35, Math.min(3.2, CM.cam.zoom * factor));
    const after = cityMapWorldAtScreen(mx, my);
    CM.cam.x += before.x - after.x;
    CM.cam.y += before.y - after.y;
  }, { passive: false });

  canvas.addEventListener("mousemove", (e) => {
    if (CM.drag) {
      clearHover();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    showHover(e.clientX - rect.left, e.clientY - rect.top);
  });
  canvas.addEventListener("mouseleave", clearHover);

  // Glisser pour se deplacer (et distinguer du clic -> gather).
  canvas.addEventListener("mousedown", (e) => {
    CM.drag = { x: e.clientX, y: e.clientY, camx: CM.cam.x, camy: CM.cam.y, moved: 0 };
  });
  window.addEventListener("mousemove", (e) => {
    if (!CM.drag) return;
    const dx = e.clientX - CM.drag.x;
    const dy = e.clientY - CM.drag.y;
    CM.drag.moved += Math.abs(dx) + Math.abs(dy);
    CM.cam.x = CM.drag.camx - dx / CM.cam.zoom;
    CM.cam.y = CM.drag.camy - dy / CM.cam.zoom;
    canvas.style.cursor = "grabbing";
  });
  window.addEventListener("mouseup", () => {
    if (CM.drag && CM.drag.moved > 6) CM.dragged = true;
    CM.drag = null;
    canvas.style.cursor = "grab";
  });

  // Annule le clic -> gather si on vient de glisser.
  if (mapRoot) mapRoot.addEventListener("click", (e) => {
    if (CM.dragged) {
      e.stopImmediatePropagation();
      CM.dragged = false;
    }
  }, true);
}
