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
import { isoPlazaBoxes, isoPlazaCompositions } from '../iso/isoPlaza.js';
import { bridgeBlocks } from '../iso/isoBridge.js';

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
  // Les MERVEILLES : leur parvis compte comme bâti (on n'y pose rien, et un monument
  // planté devant une scène la cache — vu en jeu : un pêcheur derrière un temple).
  const WONDER = { type: 'wonder' };
  if (L.wonderGround && L.wonderGround.forEach) L.wonderGround.forEach((k) => { if (!map.has(k)) map.set(k, WONDER); });
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
  const frontClear = (gx, gy, reach, width = 2) => {
    for (let dy = -width; dy <= reach; dy += 1) {
      for (let dx = -width; dx <= reach; dx += 1) {
        if (dx + dy > reach || dx + dy < 1 || Math.abs(dx - dy) > width) continue;
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
      // Les fidèles de devant avancent d'une case vers l'œil : le losange va loin.
      if (full && frontClear(gx, gy, 5, 3)) tier = 0;
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
  // DÉGAGÉ VERS L'AVANT : un bâtiment planté juste devant le seuil (de l'autre côté
  // d'une rue étroite) le cache entièrement — vu en jeu, le poulet de Diogène sous un
  // toit. On préfère les seuils dont l'avant est libre, puis la graine.
  for (const c of ok) c.open = openFront(L, foot, c.gx, c.gy);
  ok.sort((a, b) => (b.open - a.open) || (fdHash(salt + a.gx + ':' + a.gy) - fdHash(salt + b.gx + ':' + b.gy)));
  const c = ok[0];
  // Collé à la façade : 0,3 case dans la cellule de seuil.
  const x = c.face === 1 ? c.gx + 0.3 : c.gx + 0.5;
  const y = c.face === 3 ? c.gy + 0.3 : c.gy + 0.5;
  return { x, y, key: 'door:' + t.gx + ',' + t.gy, type: t.buildingId, t, face: c.face, open: c.open };
}
// Combien l'avant d'une case est dégagé : le CÔNE VERS L'ŒIL — les cases qui se
// dessinent devant elle et dans sa colonne d'écran (dx + dy = 1…prof, |dx − dy| ≤ 1).
// Un bâtiment posé là couvre la scène (vu en jeu : des retrouvailles et un mariage
// entiers sous des toits). Plus profond aux âges des tours : un immeuble cache de loin.
// Rend 0 quand rien ne masque, négatif sinon (−1 par case bâtie, les proches comptent
// double) — plus grand = mieux.
export function coneDepth(band) {
  return band >= 6 ? 6 : band >= 4 ? 4 : 3;
}
// Les arbres de la ville (décor des jardins et des rues) masquent aussi : leur
// couronne monte d'une case et demie (vu en jeu : l'écuelle de Diogène sous un arbre).
let _trees = null;
function treeCells(L) {
  const at = CM.layoutRecomputeAt || 0;
  if (_trees && _trees.at === at && _trees.L === L) return _trees.set;
  const set = new Set();
  for (const tr of (L.trees || [])) set.add(key(tr.gx, tr.gy));
  _trees = { at, L, set };
  return set;
}
function openFront(L, foot, gx, gy, depth = coneDepth((L.counts && L.counts.eraBand) | 0)) {
  const trees = treeCells(L);
  let score = 0;
  for (let s = 1; s <= depth; s += 1) {
    for (let dx = 0; dx <= s; dx += 1) {
      const dy = s - dx;
      if (Math.abs(dx - dy) > 1) continue;
      const k = key(gx + dx, gy + dy);
      if (foot.has(k)) score -= s <= 2 ? 2 : 1;
      else if (s <= 2 && trees.has(k)) score -= 1;
    }
  }
  return score;
}
export function spotOpen(L, x, y) {
  return openFront(L, fdFootprints(L), Math.floor(x), Math.floor(y));
}
// Un seuil pour un type de bâtiment (le premier dans l'ordre de la graine).
export function doorstepForType(L, type, salt = '') {
  const list = engineTilesByType(L).get(type);
  if (!list || !list.length) return null;
  // Le mieux dégagé des bâtiments de ce type (à égalité, la graine).
  let best = null;
  for (const t of list) {
    const d = doorstepOf(L, t, salt);
    if (!d) continue;
    if (!best || d.open > best.open || (d.open === best.open && fdHash(salt + type + d.key) < fdHash(salt + type + best.key))) best = d;
  }
  return best;
}

// ── LE BORD D'UNE PLACE ──────────────────────────────────────────────────────
// Les flâneurs des places (iso/plazaFolk.js) ne S'ARRÊTENT qu'au cœur de la place ;
// la bande du bord ne leur sert qu'à passer (convenu avec leur session). Une scène
// s'y tient donc sans jamais être recouverte par quelqu'un d'arrêté — à distance
// du mobilier (étals, bancs, fontaine) et des réverbères des coins.
let _plz = null;
export function plazaEdgeSpots(L, band) {
  const at = CM.layoutRecomputeAt || 0;
  if (_plz && _plz.at === at && _plz.L === L && _plz.band === band) return _plz.list;
  const T = CM.TILE;
  const boxes = isoPlazaBoxes(L) || [];
  let comps;
  try { comps = isoPlazaCompositions(L, band) || []; } catch { comps = []; }
  const obst = [];
  for (const c of comps) {
    for (const p of (c.props || [])) if (Number.isFinite(p.wx)) obst.push({ x: p.wx / T, y: p.wy / T, r: 0.5 });
    for (const l of (c.lamps || [])) if (Number.isFinite(l.wx)) obst.push({ x: l.wx / T, y: l.wy / T, r: 0.42 });
  }
  const foot = fdFootprints(L);
  const free = (x, y) => obst.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r);
  const out = [];
  boxes.forEach((b, bi) => {
    const cx = (b.gx0 + b.gx1 + 1) / 2, cy = (b.gy0 + b.gy1 + 1) / 2;
    const push = (x, y, face, outside) => {
      if (!free(x, y)) return;
      // Au bord EXTÉRIEUR (côté rue, tourné vers la place) : sur la chaussée, jamais
      // sur une emprise de bâtiment.
      if (outside) {
        const k = key(Math.floor(x), Math.floor(y));
        if (foot.has(k) || !(L.roadSet && L.roadSet.has(k)) || isWet(L, Math.floor(x), Math.floor(y))) return;
      }
      out.push({ x, y, face, key: 'place:' + bi + ':' + x.toFixed(2) + ',' + y.toFixed(2), box: b, cx, cy, main: bi === 0, open: openFront(L, foot, Math.floor(x), Math.floor(y)), h: fdHash('plz:' + bi + ':' + x + ':' + y + ':' + (L.mapSeed || 0)) });
    };
    // La bande intérieure du bord (le passage des flâneurs), puis le trottoir d'en face.
    for (let x = b.gx0; x <= b.gx1; x += 1) {
      push(x + 0.5, b.gy0 + 0.3, 2, false);
      push(x + 0.5, b.gy1 + 0.7, 3, false);
      push(x + 0.5, b.gy0 - 0.25, 2, true);
      push(x + 0.5, b.gy1 + 1.25, 3, true);
    }
    for (let y = b.gy0; y <= b.gy1; y += 1) {
      push(b.gx0 + 0.3, y + 0.5, 0, false);
      push(b.gx1 + 0.7, y + 0.5, 1, false);
      push(b.gx0 - 0.25, y + 0.5, 0, true);
      push(b.gx1 + 1.25, y + 0.5, 1, true);
    }
  });
  // Les places VUES d'abord (rien de bâti devant), puis la place centrale (la plus
  // grande), puis les mieux dégagées ; à la graine dedans.
  const vis = (s) => (s.open >= 0 ? 0 : 1);
  out.sort((a, b) => (vis(a) - vis(b)) || (a.main === b.main ? 0 : a.main ? -1 : 1) || (b.open - a.open) || (a.h - b.h));
  _plz = { at, L, band, list: out };
  return out;
}

// ── UN TRONÇON DE RUE DROIT ──────────────────────────────────────────────────
// Quatre cases de chaussée alignées (hors places) : de quoi marcher à reculons, ou
// faire la queue. { x, y } = le milieu ; (ax, ay) = l'axe ; len en cases.
let _runs = null;
export function roadRunSpots(L, len = 4) {
  const at = CM.layoutRecomputeAt || 0;
  if (_runs && _runs.at === at && _runs.L === L && _runs.len === len) return _runs.list;
  const out = [];
  const rm = L.roadMap;
  // En VILLE seulement : un chemin de campagne file sous la forêt (vu en jeu : une
  // file d'attente sous un arbre), et une place n'est pas une rue.
  const isRoad = (x, y) => {
    const k = key(x, y);
    if (!L.roadSet || !L.roadSet.has(k)) return false;
    if (L.urbanSet && !L.urbanSet.has(k)) return false;
    const c = rm && rm.get(k);
    return !(c && (c.rank === 'plaza' || c.rank === 'path'));
  };
  if (L.roadSet) {
    for (const k of L.roadSet) {
      const c = k.indexOf(',');
      const gx = +k.slice(0, c), gy = +k.slice(c + 1);
      for (const [ax, ay] of [[1, 0], [0, 1]]) {
        // Un départ de tronçon seulement (la case d'avant n'est pas de la rue droite).
        if (isRoad(gx - ax, gy - ay)) continue;
        let n = 0;
        while (n < len + 2 && isRoad(gx + ax * n, gy + ay * n)) n += 1;
        if (n < len) continue;
        const mid = (n - 1) / 2;
        const foot = fdFootprints(L);
        const mx = gx + 0.5 + ax * mid, my = gy + 0.5 + ay * mid;
        out.push({
          x: mx, y: my, ax, ay, len: n, open: openFront(L, foot, Math.floor(mx), Math.floor(my)),
          key: 'rue:' + gx + ',' + gy + ':' + ax, h: fdHash('rue:' + gx + ':' + gy + ':' + ax + ':' + (L.mapSeed || 0)),
        });
      }
    }
  }
  out.sort((a, b) => (b.open - a.open) || (a.h - b.h));
  _runs = { at, L, len, list: out };
  return out;
}

// ── LA BERGE ─────────────────────────────────────────────────────────────────
// Au bord du fleuve, côté terre, là où la ville le longe (une case au plus de la
// vie) : un banc, un pêcheur, des badauds. `face` = la direction MONDE vers l'eau.
let _bank = null;
export function bankSpots(L) {
  const at = CM.layoutRecomputeAt || 0;
  if (_bank && _bank.at === at && _bank.L === L) return _bank.list;
  const out = [];
  const rv = L.river;
  if (rv && rv.present && rv.samples && rv.samples.length > 4) {
    const T = CM.TILE;
    const foot = fdFootprints(L);
    const busy = new Set();
    for (const tr of (L.trees || [])) busy.add(key(tr.gx, tr.gy));
    const sm = rv.samples, N = L.gridN | 0;
    const band = (L.counts && L.counts.eraBand) | 0;
    const quays = band >= 2;
    const g = CM.quayGate;
    for (let i = 2; i < sm.length - 2; i += 2) {
      const q = sm[i], a2 = sm[i - 1], b = sm[i + 1];
      let tx = b.x - a2.x, ty = b.y - a2.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const hw = q.hw || 2;
      for (const side of [-1, 1]) {
        const nx = -ty * side, ny = tx * side;
        // Comme les hérons (iso/isoRiverLife) : sur le quai, un pas en retrait du
        // bord ; sur une berge naturelle, au ras de l'eau.
        const off = quays ? hw + 0.35 : hw + 0.1;
        const x = q.x + nx * off, y = q.y + ny * off;
        if (x < 1 || y < 1 || x > N - 1 || y > N - 1) continue;
        const gx = Math.floor(x), gy = Math.floor(y), k = key(gx, gy);
        if (foot.has(k) || busy.has(k) || busy.has(key(gx + 1, gy + 1)) || busy.has(key(gx + 1, gy)) || busy.has(key(gx, gy + 1))) continue;
        // Ni sur un pont (ni à côté : ses piles et son tablier montent), ni là où le
        // quai est coupé (port, bouts du fleuve).
        if (bridgeBlocks(x * T, y * T, T * 2)) continue;
        if (quays && g && (side > 0 ? g.drawPlus : g.drawMinus) && !(side > 0 ? g.drawPlus : g.drawMinus)[i]) continue;
        // Loin des merveilles (leurs îles et leurs parvis montent haut au-dessus de l'eau).
        if ((L.wonderSlots || []).some((w) => Math.hypot(w.gx - x, w.gy - y) < 5)) continue;
        // En ville ou tout contre (le bord du fleuve sauvage reste aux hérons).
        const urban = L.urbanSet && (L.urbanSet.has(k) || L.urbanSet.has(key(gx + 1, gy)) || L.urbanSet.has(key(gx - 1, gy)) || L.urbanSet.has(key(gx, gy + 1)) || L.urbanSet.has(key(gx, gy - 1)));
        if (!urban) continue;
        // Le point d'EAU de cette berge, de son côté du fil. ⚠ Le lit dessiné garde une
        // bande de vase et de roseaux le long des quais (vu en jeu : l'aileron et le
        // sous-marin posés sur la vase à mi-largeur).
        // Les canards de la petite vie s'y tiennent à moins de hw − 0,75 du fil : on se
        // met un peu plus à l'intérieur, juste au-delà de la vase.
        const lat = Math.max(hw * 0.3, hw - 1.4);
        const wxp = q.x + nx * lat, wyp = q.y + ny * lat;
        const face = Math.abs(nx) > Math.abs(ny) ? (nx < 0 ? 0 : 1) : (ny < 0 ? 2 : 3);
        out.push({ x, y, face, wxd: -nx, wyd: -ny, wxp, wyp, key: 'berge:' + i + ':' + side, open: openFront(L, foot, gx, gy), h: fdHash('berge:' + i + ':' + side + ':' + (L.mapSeed || 0)) });
      }
    }
  }
  out.sort((a2, b) => (b.open - a2.open) || (a2.h - b.h));
  _bank = { at, L, list: out };
  return out;
}

// ── UN ARBRE DE LA VILLE ─────────────────────────────────────────────────────
// Un arbre du décor (L.trees) dont l'avant se voit : on se tient au pied, côté œil.
export function treeSpots(L) {
  const foot = fdFootprints(L);
  const out = [];
  for (const tr of (L.trees || [])) {
    const x = tr.gx + 1.15, y = tr.gy + 1.15;
    const k = key(Math.floor(x), Math.floor(y));
    if (foot.has(k) || isWet(L, Math.floor(x), Math.floor(y))) continue;
    const open = openFront(L, foot, Math.floor(x), Math.floor(y));
    if (open < 0) continue;
    out.push({ x, y, tx: tr.gx + 0.5 + (tr.jx || 0), ty: tr.gy + 0.5 + (tr.jy || 0), r: tr.r || 0.7, key: 'arbre:' + tr.gx + ',' + tr.gy, open, h: fdHash('arbre:' + tr.gx + ':' + tr.gy + ':' + (L.mapSeed || 0)) });
  }
  out.sort((a2, b) => a2.h - b.h);
  return out;
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
