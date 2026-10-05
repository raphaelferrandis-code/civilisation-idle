"use strict";
// ── LE CHEMIN D'UN PASSANT ───────────────────────────────────────────────────
//
// docs/PLAN-COMPORTEMENTS.md, lot 2 « des trajets qui ont un sens ». Les passants
// n'avaient pas de chemin : à chaque case, le pas qui rapprochait le plus du but, et
// 5 % de chances de changer d'avis. « Va au travail » ne voulait rien dire, un but de
// l'autre côté du fleuve se trouvait par hasard, un partant pouvait rester coincé au
// fond d'une impasse pour toujours.
//
// Ici, trois outils sur le réseau piéton, sans rien connaître de la ville : on leur
// passe une fonction `nb(gx, gy, push)` qui énumère les voisins marchables d'une case
// (push(nx, ny, coût)) — agents.js la fournit (masques de chaussée, parvis, pont).
//   · walkPath     : A* d'une case à une autre (mémoïsé tant que la ville ne change pas)
//   · walkNearest  : la case la plus PROCHE (en marche) qui satisfait un critère
//   · walkComponent: l'îlot du réseau auquel appartient une case (on ne vise jamais
//                    un but d'un autre îlot : il n'y a pas de chemin)
// Et un quatrième, hors réseau : nearestCell, la case d'une liste la plus proche à
// vol d'oiseau (remap d'un passant ou d'un véhicule dont la case a disparu).
// Clés de case : gx·10000 + gy (cityMapWalkRoadKey).

const KEY = (gx, gy) => gx * 10000 + gy;
const MAX_EXPAND = 9000;      // au-delà, on renonce (le repli glouton reprend la main)

// Tas binaire minimal sur (priorité, clé).
function heapPush(h, pri, key) {
  h.p.push(pri); h.k.push(key);
  let i = h.p.length - 1;
  while (i > 0) {
    const j = (i - 1) >> 1;
    if (h.p[j] <= h.p[i]) break;
    [h.p[i], h.p[j]] = [h.p[j], h.p[i]]; [h.k[i], h.k[j]] = [h.k[j], h.k[i]];
    i = j;
  }
}
function heapPop(h) {
  const top = h.k[0];
  const lp = h.p.pop(), lk = h.k.pop();
  if (h.p.length) {
    h.p[0] = lp; h.k[0] = lk;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.p.length && h.p[l] < h.p[m]) m = l;
      if (r < h.p.length && h.p[r] < h.p[m]) m = r;
      if (m === i) break;
      [h.p[i], h.p[m]] = [h.p[m], h.p[i]]; [h.k[i], h.k[m]] = [h.k[m], h.k[i]];
      i = m;
    }
  }
  return top;
}

// Mémoire des chemins, vidée à chaque recalcul de la ville (`stamp` change).
let _stamp = null;
const _paths = new Map();
function fresh(stamp) {
  if (stamp !== _stamp) { _stamp = stamp; _paths.clear(); _comp = null; }
}

// A* de (sx, sy) à (tx, ty). Rend la liste des clés du PREMIER PAS jusqu'au but
// compris ([] si on y est déjà), ou null s'il n'y a pas de chemin. La liste est
// partagée (mémoïsée) : ne pas la modifier.
export function walkPath(sx, sy, tx, ty, nb, stamp) {
  fresh(stamp);
  const s = KEY(sx, sy), t = KEY(tx, ty);
  if (s === t) return [];
  const mk = s + ':' + t;
  if (_paths.has(mk)) return _paths.get(mk);
  const g = new Map([[s, 0]]), from = new Map();
  const open = { p: [], k: [] };
  heapPush(open, Math.abs(tx - sx) + Math.abs(ty - sy), s);
  const closed = new Set();
  let found = false, n = 0;
  while (open.k.length && n < MAX_EXPAND) {
    const cur = heapPop(open);
    if (cur === t) { found = true; break; }
    if (closed.has(cur)) continue;
    closed.add(cur); n += 1;
    const cx = Math.floor(cur / 10000), cy = cur - cx * 10000, gc = g.get(cur);
    nb(cx, cy, (nx, ny, cost) => {
      const k = KEY(nx, ny);
      if (closed.has(k)) return;
      const ng = gc + cost;
      if (ng >= (g.has(k) ? g.get(k) : Infinity)) return;
      g.set(k, ng); from.set(k, cur);
      heapPush(open, ng + Math.abs(tx - nx) + Math.abs(ty - ny), k);
    });
  }
  let out = null;
  if (found) {
    out = [];
    for (let k = t; k !== s; k = from.get(k)) out.push(k);
    out.reverse();
  }
  if (_paths.size > 5000) _paths.clear();
  _paths.set(mk, out);
  return out;
}

// La case la plus proche EN MARCHANT (Dijkstra) qui satisfait `ok(key)`, au plus
// `maxCost` de marche. Rend { key, path } ou null. Pas de mémoire (le critère varie).
export function walkNearest(sx, sy, ok, nb, maxCost = 60) {
  const s = KEY(sx, sy);
  if (ok(s)) return { key: s, path: [] };
  const g = new Map([[s, 0]]), from = new Map(), open = { p: [], k: [] }, closed = new Set();
  heapPush(open, 0, s);
  let n = 0;
  while (open.k.length && n < MAX_EXPAND) {
    const cur = heapPop(open);
    if (closed.has(cur)) continue;
    closed.add(cur); n += 1;
    const gc = g.get(cur);
    if (gc > maxCost) break;
    if (cur !== s && ok(cur)) {
      const path = [];
      for (let k = cur; k !== s; k = from.get(k)) path.push(k);
      path.reverse();
      return { key: cur, path };
    }
    const cx = Math.floor(cur / 10000), cy = cur - cx * 10000;
    nb(cx, cy, (nx, ny, cost) => {
      const k = KEY(nx, ny);
      if (closed.has(k)) return;
      const ng = gc + cost;
      if (ng >= (g.has(k) ? g.get(k) : Infinity)) return;
      g.set(k, ng); from.set(k, cur);
      heapPush(open, ng, k);
    });
  }
  return null;
}

// Îlots du réseau piéton (composantes connexes), calculés une fois par ville.
// `cells` : TOUTES les cases marchables — clés (un Set de CM.walkRoadSet) ou objets
// {gx, gy}. ⚠ Les parvis de merveille n'entrent pas dans walkRoadList : en ne
// numérotant que la liste, le parvis d'une merveille posée sur un ÎLOT du fleuve
// restait « inconnu », donc permis — 270 passants marchaient vers un but sans chemin.
let _comp = null;
export function walkComponent(gx, gy, cells, nb, stamp) {
  fresh(stamp);
  if (!_comp) {
    _comp = new Map();
    let id = 0;
    for (const c of cells) {
      const s = typeof c === 'number' ? c : KEY(c.gx, c.gy);
      if (_comp.has(s)) continue;
      id += 1;
      _comp.set(s, id);
      const stack = [s];
      while (stack.length) {
        const cur = stack.pop();
        const cx = Math.floor(cur / 10000), cy = cur - cx * 10000;
        nb(cx, cy, (nx, ny) => {
          const k = KEY(nx, ny);
          if (!_comp.has(k)) { _comp.set(k, id); stack.push(k); }
        });
      }
    }
  }
  return _comp.get(KEY(gx, gy)) || 0;
}

// ── La case la plus proche À VOL D'OISEAU (audit du 2026-10-05, PERF-43) ──────
// Remap d'un passant ou d'un véhicule dont la case a disparu au recalcul du plan :
// la case {gx, gy} de `list` à la plus petite distance euclidienne, la PREMIÈRE de
// la liste à égalité — exactement ce que rendait le balayage de toute la liste
// qu'elle remplace, payé pour chaque passant déplacé quand un recalcul rasait ou
// décalait beaucoup de rues (banc, 1 000 passants : ~6 ms sur 4 576 cases, 14 à
// 20 ms sur 11 500 ; ~0,5 ms ici, grille comprise). Une grille de seaux de 8×8
// cases bâtie UNE fois par liste (le plan en refait une à chaque recalcul) et une
// recherche par anneaux de seaux autour de la cible, arrêtée dès que l'anneau
// suivant ne peut plus rien offrir d'aussi proche ; un seau plus loin que la
// meilleure case est sauté sans être lu.
// `skip(c)` : cases exclues (l'esplanade, pour un véhicule). Rend null si aucune.
const NEAR_S = 8;                                    // côté d'un seau, en cases
const _nearGrids = new WeakMap();                    // liste → { n, seaux, bornes }
function nearGrid(list) {
  let g = _nearGrids.get(list);
  if (g && g.n === list.length) return g;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const c of list) {
    const bx = Math.floor(c.gx / NEAR_S), by = Math.floor(c.gy / NEAR_S);
    if (bx < bx0) bx0 = bx; if (bx > bx1) bx1 = bx;
    if (by < by0) by0 = by; if (by > by1) by1 = by;
  }
  const W = bx1 - bx0 + 1, H = by1 - by0 + 1, cells = new Array(W * H).fill(null);
  for (let i = 0; i < list.length; i += 1) {
    const s = (Math.floor(list[i].gx / NEAR_S) - bx0) * H + (Math.floor(list[i].gy / NEAR_S) - by0);
    if (cells[s]) cells[s].push(i); else cells[s] = [i];   // indices croissants : l'ordre de la liste
  }
  g = { n: list.length, cells, bx0, by0, bx1, by1, H };
  _nearGrids.set(list, g);
  return g;
}
export function nearestCell(list, gx, gy, skip = null) {
  if (!list || !list.length) return null;
  const g = nearGrid(list);
  const tbx = Math.floor(gx / NEAR_S), tby = Math.floor(gy / NEAR_S);
  // Au-delà de cet anneau, plus aucun seau (cible hors de la grille comprise).
  const span = Math.max(Math.abs(tbx - g.bx0), Math.abs(tbx - g.bx1), Math.abs(tby - g.by0), Math.abs(tby - g.by1));
  let best = -1, bestD = Infinity;
  for (let r = 0; r <= span; r += 1) {
    // Une case d'un seau de l'anneau r est à ≥ (r − 1) seaux de la cible sur un axe :
    // passé ce minorant, rien ne peut battre (ni égaler) la meilleure.
    const lb = (r - 1) * NEAR_S;
    if (r > 1 && lb * lb > bestD) break;
    for (let bx = tbx - r; bx <= tbx + r; bx += 1) {
      if (bx < g.bx0 || bx > g.bx1) continue;
      // Colonnes du bord : tout l'anneau ; colonnes intérieures : ses deux seuls bouts.
      const step = (bx === tbx - r || bx === tbx + r) ? 1 : 2 * r;
      const ex = Math.max(0, bx * NEAR_S - gx, gx - (bx + 1) * NEAR_S);
      for (let by = tby - r; by <= tby + r; by += step) {
        if (by < g.by0 || by > g.by1) continue;
        const idx = g.cells[(bx - g.bx0) * g.H + (by - g.by0)];
        if (!idx) continue;
        // Le seau entier est plus loin que la meilleure : sauté.
        const ey = Math.max(0, by * NEAR_S - gy, gy - (by + 1) * NEAR_S);
        if (ex * ex + ey * ey > bestD) continue;
        for (let q = 0; q < idx.length; q += 1) {
          const i = idx[q], c = list[i];
          const d = (c.gx - gx) * (c.gx - gx) + (c.gy - gy) * (c.gy - gy);
          if (d > bestD || (d === bestD && i > best)) continue;
          if (skip && skip(c)) continue;
          best = i; bestD = d;
        }
      }
    }
  }
  return best >= 0 ? list[best] : null;
}
