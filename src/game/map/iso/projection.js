"use strict";
// ── CHANTIER ISO — Phase 1 : LA fonction de projection unique ────────────────
// Décisions verrouillées (Raphaël, 2026-07-10, cf REPRISE-chantier-iso.md) :
// losange 2:1 classique, caméra fixe (pas de rotation), grille/logique/save
// INTACTES — seule la projection monde→écran change.
//
// Règle d'or du chantier : PLUS PERSONNE ne projette à la main. Tout passage
// monde↔écran passe par worldToScreen/screenToWorld ci-dessous, qui répliquent
// exactement l'ancien mapping quand CM.iso est éteint (identité translatée) :
// flag off ⇒ zéro changement de comportement, au bit près.
//
// Géométrie (mode iso), en px monde autour de la caméra (dx=wx−cam.x, dy=wy−cam.y) :
//   sx = (dx − dy) · ISO_X · zoom + cw/2        ISO_X = 1
//   sy = (dx + dy) · ISO_Y · zoom + ch/2        ISO_Y = 0.5
// Une tuile de TILE px monde devient un LOSANGE de 2·TILE de large × TILE de haut
// (TILE=32 → 64×32, le standard). La projection est LINÉAIRE : un pan caméra reste
// une pure translation écran → les bakes offscreen restent valides (offset projeté).
//
// Profondeur du peintre (Phase 2) : depthOf = wx + wy (diagonales SE), remplace wy.
import { CM, cmWonderSlot } from '../layout.js';

export const ISO_X = 1;
export const ISO_Y = 0.5;

// ISO PAR DÉFAUT (Phase 6, goal Raph 2026-07-11) : le losange EST le jeu.
// `__iso(false)` garde le legacy top-down accessible (A/B, secours) et PERSISTE
// le choix (localStorage cmIsoMode) — en Node/tests le stockage est absent et
// les suites fixent CM.iso elles-mêmes.
export const isoFlag = { on: true };
try {
  if (typeof localStorage !== "undefined" && localStorage.getItem("cmIsoMode") === "0") isoFlag.on = false;
} catch { /* stockage indisponible : défaut iso */ }
CM.iso = isoFlag.on;
if (typeof window !== "undefined") {
  window.__iso = (on) => {
    isoFlag.on = on !== false;
    CM.iso = isoFlag.on;
    try { localStorage.setItem("cmIsoMode", isoFlag.on ? "1" : "0"); } catch { /* privé/plein */ }
    // Invalide les bakes (le mapping change) + recadre la caméra proprement.
    CM._groundBake = null; CM._staticBake = null; CM._tileBake = null; CM._isoGroundBake = null;
    CM.centered = false;
    return isoFlag.on;
  };
}

// Monde → écran. Renvoie {x, y} en px écran.
export function worldToScreen(wx, wy) {
  const z = CM.cam.zoom;
  const dx = wx - CM.cam.x, dy = wy - CM.cam.y;
  if (!CM.iso) return { x: dx * z + CM.cw / 2, y: dy * z + CM.ch / 2 };
  return {
    x: (dx - dy) * ISO_X * z + CM.cw / 2,
    y: (dx + dy) * ISO_Y * z + CM.ch / 2,
  };
}

// Écran → monde (inverse exact de worldToScreen).
export function screenToWorld(sx, sy) {
  const z = CM.cam.zoom;
  const ax = (sx - CM.cw / 2) / z, ay = (sy - CM.ch / 2) / z;
  if (!CM.iso) return { x: ax + CM.cam.x, y: ay + CM.cam.y };
  // ax = dx − dy ; ay/ISO_Y = dx + dy
  const b = ay / ISO_Y;
  return { x: (b + ax) / 2 + CM.cam.x, y: (b - ax) / 2 + CM.cam.y };
}

// Delta caméra (monde) → delta écran. Sert aux bakes offscreen (pan = translation).
export function panDeltaToScreen(dwx, dwy) {
  const z = CM.cam.zoom;
  if (!CM.iso) return { x: dwx * z, y: dwy * z };
  return { x: (dwx - dwy) * ISO_X * z, y: (dwx + dwy) * ISO_Y * z };
}

// Delta écran → delta caméra (monde) : inverse de panDeltaToScreen. Sert au drag-pan
// (la souris tire la carte en px écran, la caméra vit en px monde).
export function screenDeltaToPan(dsx, dsy) {
  const z = CM.cam.zoom;
  if (!CM.iso) return { x: dsx / z, y: dsy / z };
  const ax = dsx / (ISO_X * z), b = dsy / (ISO_Y * z);
  return { x: (b + ax) / 2, y: (b - ax) / 2 };
}

// Profondeur du peintre : plus grand = plus « devant » (dessiné après).
export function depthOf(wx, wy) {
  return CM.iso ? wx + wy : wy;
}

// SOURCE UNIQUE de l'ancre écran d'une merveille : centre-BAS de la tuile de son
// slot, projetée. Le sprite reste debout (front-view), seul ce point change de
// projection. Le rendu (drawWonder) ET le survol (cityMapHitTest) doivent lire
// cette fonction : la formule était dupliquée, et la copie du hit-test projetait
// encore à la main façon legacy — donc en iso la zone survolable ne tombait plus
// sur la merveille dessinée. Cf. la règle d'or en tête de ce fichier.
export function wonderAnchor(idx, gridN, cx, cy) {
  const slot = cmWonderSlot(idx, gridN, cx, cy);
  const T = CM.TILE;
  return worldToScreen(slot.gx * T + T / 2, slot.gy * T + T);
}

// Les 4 coins écran du losange de la cellule (gx,gy) (ordre N,E,S,W) + centre.
// En mode legacy, renvoie le carré équivalent (utile pour du debug partagé).
export function tileDiamond(gx, gy) {
  const T = CM.TILE;
  const wx = gx * T, wy = gy * T;
  if (!CM.iso) {
    const a = worldToScreen(wx, wy), c = worldToScreen(wx + T, wy + T);
    return { n: a, e: { x: c.x, y: a.y }, s: c, w: { x: a.x, y: c.y }, c: worldToScreen(wx + T / 2, wy + T / 2) };
  }
  return {
    n: worldToScreen(wx, wy),            // sommet haut (coin nord de la cellule)
    e: worldToScreen(wx + T, wy),        // droite
    s: worldToScreen(wx + T, wy + T),    // bas (coin SUD = ancre des sprites)
    w: worldToScreen(wx, wy + T),        // gauche
    c: worldToScreen(wx + T / 2, wy + T / 2),
  };
}

// BORNES EN LOSANGE du viewport — le complément de visibleCellBounds. En iso,
// l'écran projeté en monde est un LOSANGE dont visibleCellBounds prend la boîte
// englobante : ~2× l'aire, donc ~1,8× trop d'items retenus par le peintre
// (mesuré : 437 tuiles pour 246 visibles à zoom 1, PERF-CARTE-REPRISE §6). Or
// les coordonnées écran sont AFFINES en u = wx − wy (ne dépend que de sx) et
// v = wx + wy (ne dépend que de sy) : le viewport est un simple RECTANGLE dans
// le repère (u, v). Une emprise [wx0..wx1]×[wy0..wy1] se teste alors par
// recouvrement d'intervalles — deux soustractions, quatre comparaisons.
// Marge basse séparée (`marginDownPx`) : les sprites se DRESSENT depuis leur
// base — une base sous le bord bas de l'écran peut encore montrer sa tour.
export function visibleDiamondBounds(marginPx = 0, marginDownPx = 0) {
  if (!CM.iso) return null; // legacy : la boîte englobante est déjà exacte
  const l = screenToWorld(-marginPx, 0), r = screenToWorld(CM.cw + marginPx, 0);
  const t = screenToWorld(0, -marginPx), bo = screenToWorld(0, CM.ch + marginDownPx);
  return { u0: l.x - l.y, u1: r.x - r.y, v0: t.x + t.y, v1: bo.x + bo.y };
}

// Bornes de cellules (gx/gy) couvrant le viewport élargi de `marginPx` — culling
// des boucles de rendu. Passe par screenToWorld des 4 coins (correct dans les 2 modes).
export function visibleCellBounds(marginPx = 0) {
  const T = CM.TILE;
  const corners = [
    screenToWorld(-marginPx, -marginPx),
    screenToWorld(CM.cw + marginPx, -marginPx),
    screenToWorld(-marginPx, CM.ch + marginPx),
    screenToWorld(CM.cw + marginPx, CM.ch + marginPx),
  ];
  let wx0 = Infinity, wy0 = Infinity, wx1 = -Infinity, wy1 = -Infinity;
  for (const c of corners) {
    if (c.x < wx0) wx0 = c.x; if (c.x > wx1) wx1 = c.x;
    if (c.y < wy0) wy0 = c.y; if (c.y > wy1) wy1 = c.y;
  }
  return {
    gx0: Math.floor(wx0 / T) - 1, gy0: Math.floor(wy0 / T) - 1,
    gx1: Math.ceil(wx1 / T) + 1, gy1: Math.ceil(wy1 / T) + 1,
  };
}
