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
// ⚠⚠ ET IL BASCULE AUSSI `CM.ctx`, DEPUIS LE BOGUE DU 2026-08-24. La première
// version ne changeait que la projection : un consommateur qui prend sa cible
// dans `CM.ctx` (c'était le cas de l'ancien tracé du quai, qui la capturait en tête)
// peignait donc SUR L'ÉCRAN avec la géométrie du zoom 1, pendant qu'on composait
// un calque resté vide par-dessus. Symptôme : « les quais bougent au zoom »
// (Raph) — erreur NULLE à z = 1 et croissante en s'en éloignant, jusqu'à 34 px
// mesurés. Le repère de projection et la CIBLE de dessin ne se séparent pas.
//
// ⚠⚠ COROLLAIRE POUR L'APPELANT : capturer la vraie cible AVANT `begin`, et la
// passer à `end`. Écrire `artLayerEnd(lay, CM.ctx, z)` composerait le calque sur
// LUI-MÊME, puisque `CM.ctx` vaut encore le calque au moment de l'évaluation.
//
// ⚠ SORTI d'isoGroundRoads.js le 2026-08-24 pour être PARTAGÉ avec le bake des
// quais (§4.1 de REPRISE-TRACE-VECTORIEL). Déplacement pur : le corps est repris
// sans une ligne de changée — la voirie ne doit pas bouger d'un pixel.
//
// ⚠ UN SEUL calque pour tout le monde. C'est légitime parce que les deux
// consommateurs sont SYNCHRONES et SÉQUENTIELS (le bake du sol se termine avant
// que celui du quai commence) ; il ne le serait plus si un jour un bake devenait
// incrémental et pouvait s'entrelacer avec un autre.
//
// ── L'ANCRE DE PHASE (lot 1 de PLAN-SOL-PYRAMIDE, 2026-09-14) ────────────────
// Le calque est un RASTER à zoom 1 composé à l'échelle z : le pixel k du calque
// couvre les pixels écran [ox + k·z, ox + (k+1)·z). Sur un bake plein écran,
// `ox` est un seul nombre et personne ne voit sa phase. Sur des TUILES, chaque
// tuile a son propre `ox` (il dépend de sa caméra) → la même route rasterisée
// par deux tuiles voisines tombe sur deux grilles décalées d'une fraction de
// pixel → une couture à chaque frontière. `artLayerAnchor(X0, Y0)` donne au
// calque l'origine de la tuile dans l'ESPACE ÉCRAN À CAMÉRA NULLE ; begin/end
// décalent alors le tracé et la composition d'une même fraction φ pour que la
// grille du calque soit ancrée MONDE (φ = D mod z, D = X0 + cw/2 − z·w/2). Sans
// ancre (null, le défaut) : comportement byte-identique à avant.
import { CM } from '../layout.js';
import { ISO_X, ISO_Y } from './projection.js';

let _layer = null;
let _anchor = null;   // { x, y } en px d'espace écran à caméra nulle, ou null

export function artLayerAnchor(x, y) { _anchor = (x == null) ? null : { x, y }; }

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
  // Bascule du repère de projection ET de la cible : worldToScreen lit
  // CM.cam.zoom et CM.cw/ch ; un consommateur peut prendre sa cible dans CM.ctx.
  lay.saved = { zoom: CM.cam.zoom, cw: CM.cw, ch: CM.ch, ctx: CM.ctx, camX: CM.cam.x, camY: CM.cam.y };
  lay.phiX = 0; lay.phiY = 0;
  if (_anchor) {
    // φ = fraction de pixel écran dont la grille du calque déborde de la grille
    // monde ; ε = φ/z en pixels de calque. Le tracé se décale de +ε (caméra
    // reculée de ε), la composition de −φ : le contenu ne bouge pas, sa grille si.
    const Dx = _anchor.x + CM.cw / 2 - z * wArt / 2, Dy = _anchor.y + CM.ch / 2 - z * hArt / 2;
    lay.phiX = Dx - z * Math.floor(Dx / z); lay.phiY = Dy - z * Math.floor(Dy / z);
    const ex = lay.phiX / z, ey = lay.phiY / z;
    // Décalage caméra en MONDE équivalent à (−ex, −ey) en espace écran zoom 1.
    const ax = -ex / ISO_X, ay = -ey / ISO_Y;
    CM.cam.x += (ay + ax) / 2; CM.cam.y += (ay - ax) / 2;
  }
  CM.cam.zoom = 1; CM.cw = lay.w; CM.ch = lay.h; CM.ctx = lay.ctx;
  return lay;
}

export function artLayerEnd(lay, ctx, z) {
  const s = lay.saved;
  CM.cam.zoom = s.zoom; CM.cw = s.cw; CM.ch = s.ch; CM.ctx = s.ctx;
  CM.cam.x = s.camX; CM.cam.y = s.camY;
  const ox = s.cw / 2 - (lay.w * z) / 2 - (lay.phiX || 0), oy = s.ch / 2 - (lay.h * z) / 2 - (lay.phiY || 0);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lay.c, 0, 0, lay.w, lay.h, ox, oy, lay.w * z, lay.h * z);
  ctx.imageSmoothingEnabled = prev;
}
