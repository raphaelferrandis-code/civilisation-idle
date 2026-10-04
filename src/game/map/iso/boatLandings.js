"use strict";
// ── LES PONTONS DU FLEUVE : où l'on monte à bord du bac et de la navette ─────────
// (docs/PLAN-BATEAUX.md §8 ; Raph, 2026-10-04 : « le ponton depuis le quai ça fait
// bizarre, il faut enlever la rambarde à ce niveau-là et faire un escalier » puis « mets
// le ponton vraiment au pied de l'escalier, et oui tu peux le faire pour le passeur »)
//
// Trois façons d'aborder une rive, selon ce qu'on en voit :
//   'stair' — la rive dont on VOIT le mur de quai : le quai pose une volée (isoQuay,
//             volée demandée, garde-corps ouvert) et un ponton FLOTTANT part du bout
//             de son palier d'en bas, collé au mur, de la largeur de l'escalier ;
//   'edge'  — la rive dont le mur est CACHÉ (l'eau derrière la promenade) : une volée y
//             serait invisible (elle s'écrase en une ligne plate, cf. isoQuay) — le
//             garde-corps s'ouvre et le ponton flottant part du bord du quai, vers le large,
//             sans empiéter sur la promenade ;
//   'pier'  — pas de quai (campement, grève) : l'embarcadère sur pieux d'avant.
// Les poses sont en MONDE (tuiles) : un ponton = { x, y (début de son axe), dx, dy (le
// long de l'axe), ax, ay (en travers, vers le large pour 'stair'), len (px d'art) }.

import { ribbonAt } from '../riverFleet.js';
import { projectOnRibbon } from './boatBerths.js';
import { FLOAT_W } from './boatFamilies.js';

// La rive dont on voit le mur de quai à la position t (−1, +1), 0 si le fleuve file
// droit vers l'œil. Même critère que riverFleet.quayHiddenDepth.
export function visibleSide(sm, t) {
  const r = ribbonAt(sm, t);
  return -Math.sign(r.tx - r.ty) || 0;
}

// Ponton au pied d'une volée : `foot` = bout du palier d'en bas, sur la ligne du pied du
// mur (isoQuay.quayWantedFoot), `vis` = sa rive. Il longe le mur dans le sens de la
// volée, son flanc intérieur contre le mur.
export function stairPontoon(sm, foot, vis, len) {
  const pr = projectOnRibbon(sm, foot.x, foot.y);
  const r = ribbonAt(sm, pr.t);
  const al = { x: (foot.dir || 1) * r.tx, y: (foot.dir || 1) * r.ty };
  const o = { x: -vis * r.nx, y: -vis * r.ny };
  const w = FLOAT_W / 2 / 32;
  return { kind: 'stair', x: foot.x + o.x * w, y: foot.y + o.y * w, dx: al.x, dy: al.y, ax: o.x, ay: o.y, len, side: vis };
}

// Ponton au bord d'une rive au mur CACHÉ (l'eau derrière la promenade), perpendiculaire,
// vers le large. L'eau y est aussi bas qu'en face : `wallT` tuiles sous la promenade. Il
// flotte À CE NIVEAU (Raph, 2026-10-04 : « faut respecter la profondeur » — posé au
// niveau de la promenade, il couvrait le bord du quai) : le quai en cache la racine,
// seul ce qui dépasse dans le large se voit (rendu découpé au bord, cf. boatScenes).
// `sink` = son enfoncement (px d'art), `hid` = la part cachée derrière le bord (tuiles,
// même mesure que riverFleet.quayHiddenDepth), `len` = la part cachée + `PONTOON_LEN.edge`
// px visibles. (ex, ey) = le point du bord, pour la découpe.
export function edgePontoon(sm, t, side, wallT = 0) {
  const r = ribbonAt(sm, t);
  const hw = r.hw || 2;
  const o = { x: -side * r.nx, y: -side * r.ny };
  const ex = r.x + r.nx * side * hw, ey = r.y + r.ny * side * hw;
  // OÙ IL SORT DE DERRIÈRE LE BORD, à l'écran : enfoncé de `sink` px, son axe croise la
  // ligne du bord à `a` px de sa racine (la part cachée) et à `b` px le long du bord.
  // Résolu dans l'écran zoom 1 (X = x − y, Y = (x + y)/2) : S(o)·a + (0, sink) = S(u)·b.
  const sink = wallT * 32;
  const Sox = o.x - o.y, Soy = (o.x + o.y) / 2, Sux = r.tx - r.ty, Suy = (r.tx + r.ty) / 2;
  const D = Sux * Soy - Sox * Suy;
  const a = Math.abs(D) > 1e-6 ? Math.max(0, (-Sux * sink) / D) : 0;
  const b = Math.abs(D) > 1e-6 ? (-Sox * sink) / D : 0;
  const hid = a / 32;
  const len = Math.round(a) + PONTOON_LEN.edge;
  return {
    kind: 'edge', x: ex, y: ey, dx: o.x, dy: o.y, ax: r.tx, ay: r.ty, len, side, sink, hid, ex, ey,
    // L'OUVERTURE du garde-corps (« il faut garder une ouverture ») : là où on le voit
    // passer sous le bord, pas au droit de sa racine cachée.
    gx: ex + r.tx * b / 32, gy: ey + r.ty * b / 32,
  };
}

// Un point du ponton : `a` px le long de son axe, `c` px en travers (vers le large pour
// 'stair', vers l'aval pour 'edge').
export function pontoonAt(P, a, c = 0) {
  return { x: P.x + (P.dx * a + P.ax * c) / 32, y: P.y + (P.dy * a + P.ay * c) / 32 };
}

// Où l'on aborde un ponton, sur le ruban : { t, lat } du milieu du bord côté large
// ('stair' : le flanc extérieur ; 'edge' : le bout TEL QU'ON LE VOIT — enfoncé de `sink`,
// il paraît plus près du bord de `hid` tuiles : c'est là qu'un bateau, posé sur l'eau
// du rendu, le touche).
export function pontoonFace(sm, P) {
  const p = P.kind === 'stair' ? pontoonAt(P, P.len / 2, FLOAT_W / 2) : pontoonAt(P, P.len - (P.hid || 0) * 32, 0);
  return projectOnRibbon(sm, p.x, p.y);
}

// Longueurs des pontons (px d'art) : le long du mur, celui du passeur (le bac y aborde
// par l'avant, au milieu) et celui de la navette (elle s'y amarre bord à bord, sa coque
// fait 40 px) ; au bord d'une rive au mur caché, ce qu'on voit du ponton vers le large.
export const PONTOON_LEN = { ferry: 30, shuttle: 44, edge: 22 };
