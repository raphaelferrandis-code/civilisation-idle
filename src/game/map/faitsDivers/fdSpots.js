"use strict";

// LES FAITS DIVERS — où poser une scène (docs/PLAN-FAITS-DIVERS.md).
//
// Chaque type de lieu rend des POSTES (en cellules, flottants) tirés dans la ville
// du moment, triés par une graine stable : deux recherches de suite donnent le même
// ordre, et une scène retrouve sa place après un rechargement.
//   lisiere   l'herbe juste hors de la ville (2 à 5 cases du bâti), dégagée sur un
//             rayon d'une case et demie : ni arbre, ni bête, ni route, ni eau
//   batiment  le seuil d'un bâtiment-moteur : la case de sol devant sa façade (côté
//             sud ou est, celui qu'on voit), jamais SUR la scène moteur elle-même
//             (son encre mesurée dépasse le toit affiché — leçon de la petite vie)
//   foyer     à côté du feu du campement (âges 0-1)
// Les autres lieux (place, berge, pont, toit…) arrivent avec leurs histoires.
import { CM, cmHash } from '../layout.js';
import { isoWildForest } from '../iso/isoWildForest.js';

const key = (x, y) => x + ',' + y;
// Brassage (fmix32) : cmHash de graines voisines sort des valeurs voisines.
const fmix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
export const fdHash = (s) => fmix(cmHash(s) >>> 0);

// Emprises de tous les bâtiments (maisons comprises), mémoïsées sur le layout.
let _foot = null;
export function fdFootprints(L) {
  const at = CM.layoutRecomputeAt || 0, n = (L.tiles && L.tiles.length) | 0;
  if (_foot && _foot.at === at && _foot.n === n && _foot.L === L) return _foot.map;
  const map = new Map();
  for (const t of (L.tiles || [])) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) map.set(key(t.gx + ax, t.gy + ay), t);
  }
  _foot = { at, n, L, map };
  return map;
}
function isWet(L, gx, gy) {
  const rv = L.river;
  if (!rv) return false;
  if (rv.isWater && (rv.isWater(gx, gy) || (rv.isBank && rv.isBank(gx, gy)))) return true;
  const k = key(gx, gy);
  return !!((rv.cells && rv.cells.has && rv.cells.has(k)) || (rv.banks && rv.banks.has && rv.banks.has(k)));
}

// ── LA LISIÈRE ───────────────────────────────────────────────────────────────
// Distance (en cases, 4-voisinage) à la VIE — sol urbain, routes, emprises —,
// bornée à `maxD`. Un balayage en largeur depuis toutes les sources, sur une
// fenêtre qui DÉBORDE la grille de la ville de `pad` cases : au campement la grille
// fait 20 cases et la vie la remplit presque — la lisière est au-delà, dans le
// monde sauvage qui continue tout autour.
function lifeDistance(L, foot, maxD, pad) {
  const N = L.gridN | 0, W = N + 2 * pad;
  const dist = new Int16Array(W * W).fill(-1);
  const q = [];
  const idx = (gx, gy) => {
    const x = gx + pad, y = gy + pad;
    return x < 0 || y < 0 || x >= W || y >= W ? -1 : y * W + x;
  };
  const seed = (gx, gy) => {
    const i = idx(gx, gy);
    if (i < 0 || dist[i] === 0) return;
    dist[i] = 0;
    q.push(i);
  };
  const addSet = (s) => {
    if (!s || !s.forEach) return;
    s.forEach((k) => { const c = k.indexOf(','); seed(+k.slice(0, c), +k.slice(c + 1)); });
  };
  addSet(L.urbanSet);
  addSet(L.roadSet);
  for (const k of foot.keys()) { const c = k.indexOf(','); seed(+k.slice(0, c), +k.slice(c + 1)); }
  for (let h = 0; h < q.length; h += 1) {
    const i = q[h], d = dist[i];
    if (d >= maxD) continue;
    const x0 = i % W, y0 = (i - x0) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      const j = y * W + x;
      if (dist[j] !== -1) continue;
      dist[j] = d + 1;
      q.push(j);
    }
  }
  return { at: (gx, gy) => { const i = idx(gx, gy); return i < 0 ? -1 : dist[i]; } };
}

let _lis = null;
// Postes de lisière : [{ x, y, key }] (centre en cellules), ordre stable.
export function lisiereSpots(L) {
  const at = CM.layoutRecomputeAt || 0;
  if (_lis && _lis.at === at && _lis.L === L) return _lis.list;
  const N = L.gridN | 0, PAD = 8;
  const foot = fdFootprints(L);
  const life = lifeDistance(L, foot, 7, PAD);
  // Ce qui encombre : arbres (décor et forêt sauvage), bêtes, eau, routes, bâti.
  const busy = new Set();
  for (const tr of (L.trees || [])) busy.add(key(tr.gx, tr.gy));
  for (const cr of (L.critters || [])) busy.add(key(cr.gx, cr.gy));
  try {
    // ⚠ isoWildForest mémoïse SA liste sur les bornes demandées : l'appeler ici
    // avec la fenêtre de recherche la refait au prochain tour du peintre (blocs
    // gardés en cache, donc pour quelques microsecondes) — d'où la copie immédiate.
    for (const tr of isoWildForest(L, { gx0: -PAD, gx1: N + PAD - 1, gy0: -PAD, gy1: N + PAD - 1 })) busy.add(key(tr.gx, tr.gy));
  } catch { /* forêt indisponible : on se contente du reste */ }
  const hearth = L.campHearth || null;
  const blocked = (x, y) => {
    const k = key(x, y);
    return busy.has(k) || foot.has(k) || (L.roadSet && L.roadSet.has(k)) || isWet(L, x, y) || life.at(x, y) === 0;
  };
  // DEVANT (plus près de l'œil) : la couronne d'un arbre planté une ou deux cases au
  // sud-est monte par-dessus la scène — vu en jeu, le cercle entier disparaissait
  // sous la forêt. Un losange vers l'avant doit rester sans arbre.
  const frontClear = (gx, gy, reach) => {
    for (let dy = -1; dy <= reach; dy += 1) {
      for (let dx = -1; dx <= reach; dx += 1) {
        if (dx + dy > reach || dx + dy < 1 || Math.abs(dx - dy) > 2) continue;
        if (busy.has(key(gx + dx, gy + dy))) return false;
      }
    }
    return true;
  };
  // Deux paliers : d'abord une vraie clairière (trois cases sur trois, à deux cases
  // au moins de la vie) ; sinon — le campement, dans sa forêt dense — une place en
  // croix au bord même de la clairière du camp, du côté où la vue passe au-dessus du
  // camp (c'est le camp qui est « devant », et il est dégagé).
  const tiers = [[], []];
  for (let gy = 2 - PAD; gy < N + PAD - 2; gy += 1) {
    for (let gx = 2 - PAD; gx < N + PAD - 2; gx += 1) {
      const d = life.at(gx, gy);
      if (d < 1 || d > 5) continue;
      if (hearth && Math.hypot(gx - hearth.gx, gy - hearth.gy) < 5) continue;
      if (blocked(gx, gy) || blocked(gx + 1, gy) || blocked(gx - 1, gy) || blocked(gx, gy + 1) || blocked(gx, gy - 1)) continue;
      const full = d >= 2 && !blocked(gx + 1, gy + 1) && !blocked(gx - 1, gy - 1) && !blocked(gx + 1, gy - 1) && !blocked(gx - 1, gy + 1);
      let tier = -1;
      if (full && frontClear(gx, gy, 4)) tier = 0;
      else if (d <= 4 && frontClear(gx, gy, 3)) tier = 1;
      if (tier < 0) continue;
      tiers[tier].push({ x: gx + 0.5, y: gy + 0.5, key: 'lis:' + gx + ',' + gy, tier, h: fdHash('lis:' + gx + ':' + gy + ':' + (L.mapSeed || 0)) });
    }
  }
  for (const t of tiers) t.sort((a, b) => a.h - b.h);
  const out = tiers[0].concat(tiers[1]);
  _lis = { at, L, list: out };
  return out;
}

// ── LE SEUIL D'UN BÂTIMENT ───────────────────────────────────────────────────
// Les bâtiments-moteur présents, regroupés par type (buildingId).
export function engineTilesByType(L) {
  const by = new Map();
  for (const t of (L.tiles || [])) {
    if (t.type !== 'engine' || !t.buildingId) continue;
    if (!by.has(t.buildingId)) by.set(t.buildingId, []);
    by.get(t.buildingId).push(t);
  }
  return by;
}
// Le poste devant un bâtiment : une case libre au contact de sa façade sud ou est.
// Rend { x, y, key, type, t, face } ou null. `face` = la direction MONDE vers le
// bâtiment (la personne lui tourne le dos ou le regarde, au choix de la scène).
export function doorstepOf(L, t, salt = '') {
  const foot = fdFootprints(L);
  const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
  const cand = [];
  for (let ax = 0; ax < sx; ax += 1) cand.push({ gx: t.gx + ax, gy: t.gy + sy, face: 3 });
  for (let ay = 0; ay < sy; ay += 1) cand.push({ gx: t.gx + sx, gy: t.gy + ay, face: 1 });
  const ok = cand.filter((c) => {
    const k = key(c.gx, c.gy);
    return !foot.has(k) && !isWet(L, c.gx, c.gy) && c.gx > 1 && c.gy > 1 && c.gx < (L.gridN | 0) - 2 && c.gy < (L.gridN | 0) - 2;
  });
  if (!ok.length) return null;
  // Préférence au milieu de la façade, puis à la graine.
  ok.sort((a, b) => fdHash(salt + a.gx + ':' + a.gy) - fdHash(salt + b.gx + ':' + b.gy));
  const c = ok[0];
  // Collé à la façade : 0,3 case dans la cellule de seuil.
  const x = c.face === 1 ? c.gx + 0.3 : c.gx + 0.5;
  const y = c.face === 3 ? c.gy + 0.3 : c.gy + 0.5;
  return { x, y, key: 'door:' + t.gx + ',' + t.gy, type: t.buildingId, t, face: c.face };
}
// Un seuil pour un type de bâtiment (le premier dans l'ordre de la graine).
export function doorstepForType(L, type, salt = '') {
  const list = engineTilesByType(L).get(type);
  if (!list || !list.length) return null;
  const sorted = list.slice().sort((a, b) => fdHash(salt + type + a.gx + ':' + a.gy) - fdHash(salt + type + b.gx + ':' + b.gy));
  for (const t of sorted) {
    const d = doorstepOf(L, t, salt);
    if (d) return d;
  }
  return null;
}

// ── LE FEU DU CAMPEMENT ──────────────────────────────────────────────────────
export function hearthSpot(L) {
  const h = L.campHearth;
  if (!h) return null;
  return { x: h.gx + 1.9, y: h.gy + 1.3, key: 'foyer:' + h.gx + ',' + h.gy, hx: h.gx + 0.5, hy: h.gy + 0.5 };
}

// ── À L'ÉCRAN ? ──────────────────────────────────────────────────────────────
// Le poste (en cellules) est-il dans le champ, marge comprise (px) ?
export function spotOnScreen(sx, sy, margin = 60) {
  return sx > -margin && sy > -margin && sx < (CM.cw || 0) + margin && sy < (CM.ch || 0) + margin;
}
