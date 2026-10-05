"use strict";
// ── LA PASSE DES REMOUS (iso/waterRipples.js) ────────────────────────────────
// Juste après l'eau (drawIsoRiver, drawIsoRiverLife), AVANT les quais, les ouvrages
// du port, les bateaux et la passe vivante : ce qui se peint ensuite recouvre les
// remous là où il le doit. On peint ce que les ouvrages ont noté à l'image d'avant.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { riverRibbonPath, WATER_FILL } from './isoRiver.js';
import { takeNotedRipples, drawRipples, ripplesShown } from './waterRipples.js';

export function drawIsoRipples(ctx, now) {
  const noted = takeNotedRipples();
  if (!noted.size || CM.lodActive || CM.collapseAt) return;
  const z = CM.cam.zoom, view = { w: CM.cw, h: CM.ch };
  const sm = CM.layout && CM.layout.river && CM.layout.river.samples;
  // D'abord ce qui borde le fleuve, découpé au ruban ; puis le reste (le bassin).
  for (const river of [true, false]) {
    let clipped = false;
    for (const list of noted.values()) {
      for (const e of list) {
        if ((e.clip === 'river') !== river) continue;
        const o = worldToScreen(e.wx || 0, e.wy || 0, e.h || 0);   // (wx, wy) : origine du champ, s'il est local
        // Rien à poser (hors champ, zoom trop large) : pas de découpe au ruban pour
        // lui (audit du 05/10, PERF-56). Les ouvrages notent leurs remous à chaque
        // image, port hors champ compris : le tracé du ruban et son clip étaient payés
        // à chaque image dès qu'un port existait, pour ne rien peindre.
        if (!ripplesShown(e.F, o.x, o.y, z, 0.7, view)) continue;
        if (river && !clipped) {
          if (!sm || sm.length < 2) break;
          ctx.save();
          riverRibbonPath(ctx, sm, CM.TILE);
          ctx.clip(WATER_FILL);
          clipped = true;
        }
        drawRipples(ctx, e.F, o.x, o.y, z, now, 0.7, view);
      }
    }
    if (clipped) ctx.restore();
  }
}
