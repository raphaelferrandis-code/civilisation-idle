"use strict";
// ── LE CALQUE À L'ÉCHELLE DE L'ART ───────────────────────────────────────────
//
// Un canevas hors-écran où l'on peint à `zoom = 1` — donc à la résolution de
// l'ART, un pixel de dessin pour un pixel de sprite — avant de composer le tout
// à l'échelle courante au nearest. Deux gains d'un coup :
//   · le tracé cesse d'être antialiasé à la résolution de l'ÉCRAN puis cuit
//     ainsi (le défaut que le lot L12 a corrigé sur la voirie) ;
//   · la surface à rastériser tombe à ~1/z² : ce qu'on perd à composer, on le
//     regagne largement à peindre (~10 ms de bake mesurés sur la voirie).
//
// ⚠ IL BASCULE LE REPÈRE DE PROJECTION, ET C'EST TOUT SON PRINCIPE :
// `worldToScreen` lit `CM.cam.zoom`, `CM.cw` et `CM.ch` — on les remplace le
// temps du tracé, puis on les rend. Tout ce qui se dessine entre `begin` et
// `end` doit donc passer par la projection, jamais par une taille d'écran
// mémorisée avant l'appel.
//
// ⚠ SORTI d'isoGroundRoads.js le 2026-08-24 pour être PARTAGÉ avec le bake des
// quais (§4.1 de REPRISE-TRACE-VECTORIEL). Déplacement pur : le corps est repris
// sans une ligne de changée — la voirie ne doit pas bouger d'un pixel.
//
// ⚠ UN SEUL calque pour tout le monde. C'est légitime parce que les deux
// consommateurs sont SYNCHRONES et SÉQUENTIELS (le bake du sol se termine avant
// que celui du quai commence) ; il ne le serait plus si un jour un bake devenait
// incrémental et pouvait s'entrelacer avec un autre.
import { CM } from '../layout.js';

let _layer = null;

export function artLayerBegin(z) {
  const wArt = Math.ceil(CM.cw / z) + 2, hArt = Math.ceil(CM.ch / z) + 2;
  if (!_layer || _layer.w !== wArt || _layer.h !== hArt) {
    const c = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(wArt, hArt) : document.createElement('canvas');
    c.width = wArt; c.height = hArt;
    const cx = c.getContext('2d');
    if (!cx) return null;
    _layer = { c, ctx: cx, w: wArt, h: hArt };
  }
  const lay = _layer;
  lay.ctx.setTransform(1, 0, 0, 1, 0, 0);
  lay.ctx.clearRect(0, 0, lay.w, lay.h);
  // Bascule du repère de projection : worldToScreen lit CM.cam.zoom et CM.cw/ch.
  lay.saved = { zoom: CM.cam.zoom, cw: CM.cw, ch: CM.ch };
  CM.cam.zoom = 1; CM.cw = lay.w; CM.ch = lay.h;
  return lay;
}

export function artLayerEnd(lay, ctx, z) {
  const s = lay.saved;
  CM.cam.zoom = s.zoom; CM.cw = s.cw; CM.ch = s.ch;
  const ox = s.cw / 2 - (lay.w * z) / 2, oy = s.ch / 2 - (lay.h * z) / 2;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lay.c, 0, 0, lay.w, lay.h, ox, oy, lay.w * z, lay.h * z);
  ctx.imageSmoothingEnabled = prev;
}
