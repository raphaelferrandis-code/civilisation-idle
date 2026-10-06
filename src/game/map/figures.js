"use strict";
// ── LE REGISTRE DES FIGURES : qui est où, à la dernière frame ─────────────────
//
// docs/PLAN-COMPORTEMENTS.md (lots 1 et 6). La ville a plusieurs peuples qui ne se
// connaissaient pas : les passants des rues (agents.js), les flâneurs des places
// (iso/plazaFolk.js), les promeneurs des quais (iso/isoQuayWalk.js), les porteurs
// du port, les émeutiers… Les pigeons ne fuyaient que les passants des rues, les
// mouettes laissaient un promeneur leur marcher dessus.
//
// Chaque peuple SIGNALE ici ses figures au moment où il les pousse dans le peintre
// (`noteFig`), et qui veut savoir « y a-t-il quelqu'un près de moi » lit la frame
// PRÉCÉDENTE, complète (`eachFig`) : à l'intérieur d'une frame, l'ordre de collecte
// ferait voir aux uns une liste à moitié remplie.
//
// Positions en px MONDE (le repère de CM.citizens : cellule × CM.TILE), aux pieds.
// Double tampon de tableaux typés : pas une allocation par figure et par frame.
// Pur : n'importe rien, ne dessine rien.
//
// LOT 6 (« un seul peuple ») : les gens des SCÈNES s'y inscrivent aussi (voyageurs du
// bac, laboureurs et moissonneurs, accoudés des ponts), et la frame précédente est
// rangée par CASES de 64 px à la première question (`figNear` parcourait toute la
// liste — un millier de figures — pour chaque pigeon, chaque mouette, chaque héron).
// `figAhead` sert à s'éviter (agents.js : un pas de côté devant quelqu'un) et
// `figFree` à savoir si une place est libre (un fait divers qui veut se poser).

const CAP = 8192;
let cur = { x: new Float32Array(CAP), y: new Float32Array(CAP), f: new Uint8Array(CAP), n: 0 };
let prev = { x: new Float32Array(CAP), y: new Float32Array(CAP), f: new Uint8Array(CAP), n: 0 };

// Genres de figures (bits de `f`, avec MOVING en bit 0).
export const FIG = { MOVING: 1, STREET: 2, PLAZA: 4, QUAY: 8, PORT: 16, RIOT: 32, SCENE: 64 };

// Le rangement par cases de la frame précédente, refait à la première question.
const CELL = 64;
const _head = new Map(), _next = new Int32Array(CAP);
let _stamp = 0, _hashed = -1;
const cellKey = (cx, cy) => (cx + 4096) * 8192 + (cy + 4096);
function ensureHash() {
  if (_hashed === _stamp) return;
  _hashed = _stamp; _head.clear();
  for (let i = 0; i < prev.n; i += 1) {
    const k = cellKey(Math.floor(prev.x[i] / CELL), Math.floor(prev.y[i] / CELL));
    const h = _head.get(k);
    _next[i] = h === undefined ? -1 : h;
    _head.set(k, i);
  }
}
// Visite les figures dont la case touche le carré [x ± r, y ± r] : fn(i) — `true` arrête.
function visit(x, y, r, fn) {
  ensureHash();
  const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL);
  const d0 = Math.floor((y - r) / CELL), d1 = Math.floor((y + r) / CELL);
  for (let cx = c0; cx <= c1; cx += 1) {
    for (let cy = d0; cy <= d1; cy += 1) {
      for (let i = _head.get(cellKey(cx, cy)); i !== undefined && i >= 0; i = _next[i]) if (fn(i) === true) return true;
    }
  }
  return false;
}

// Début de frame : la frame qui s'achève devient la référence lue par tous.
export function figuresBeginFrame() {
  const t = prev; prev = cur; cur = t; cur.n = 0;
  _stamp += 1;
}

// Une figure à (x, y) px monde ; `flags` = FIG.* (dont MOVING si elle marche).
export function noteFig(x, y, flags) {
  if (cur.n >= CAP) return;
  const i = cur.n++;
  cur.x[i] = x; cur.y[i] = y; cur.f[i] = flags;
}

// Parcourt les figures de la frame précédente : fn(x, y, flags) — `true` arrête.
export function eachFig(fn) {
  for (let i = 0; i < prev.n; i += 1) if (fn(prev.x[i], prev.y[i], prev.f[i]) === true) return true;
  return false;
}

// Quelqu'un (qui marche, si `movingOnly`) à moins de `r` px de (x, y) ?
export function figNear(x, y, r, movingOnly = true) {
  const r2 = r * r;
  return visit(x, y, r, (i) => {
    if (movingOnly && !(prev.f[i] & FIG.MOVING)) return false;
    const dx = prev.x[i] - x, dy = prev.y[i] - y;
    return dx * dx + dy * dy < r2;
  });
}

// Personne, même immobile, à moins de `r` px : la place est libre.
export const figFree = (x, y, r) => !figNear(x, y, r, false);

// Quelqu'un DEVANT (ou à côté) ? Depuis (x, y), cap unitaire (hx, hy) : une figure
// entre `back` px derrière et `r` px devant, à moins de `half` px de l'axe. Rend le
// côté où elle se trouve (+1 à droite du cap, −1 à gauche) ou 0. On garde l'écart tant
// que l'autre est À CÔTÉ (back) : relâché dès qu'il n'était plus devant, on lui
// rentrait dedans au moment de le dépasser. Sa propre trace de la frame d'avant (un pas
// derrière soi, à moins de `self` px) ne compte pas.
// (lx, ly) : l'axe passe par (x + lx, y + ly) et non par (x, y) — la FILE d'un passant
// déjà écarté (agents.js) : mesuré depuis l'écart lui-même, le pas de côté sortait
// l'autre du couloir, on revenait, on le revoyait (le tremblement du 2026-10-06). Sa
// propre trace, elle, se cherche toujours autour de (x, y), là où on a été dessiné.
export function figAhead(x, y, hx, hy, r, half, back = 0, self = 2.5, lx = 0, ly = 0) {
  let best = Infinity, side = 0;
  const s2 = self * self, ax = x + lx, ay = y + ly;
  visit(ax, ay, r, (i) => {
    const sx = prev.x[i] - x, sy = prev.y[i] - y;
    if (sx * sx + sy * sy < s2) return false;
    const dx = prev.x[i] - ax, dy = prev.y[i] - ay;
    const d2 = dx * dx + dy * dy;
    if (d2 >= best) return false;
    const a = dx * hx + dy * hy;
    if (a <= -back || a >= r) return false;
    const l = -dx * hy + dy * hx;
    if (Math.abs(l) >= half) return false;
    best = d2; side = l >= 0 ? 1 : -1;
    return false;
  });
  return side;
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__figures = () => {
    const by = {};
    for (let i = 0; i < prev.n; i += 1) {
      const f = prev.f[i];
      const k = Object.keys(FIG).find((n) => n !== 'MOVING' && (f & FIG[n])) || '?';
      by[k] = (by[k] || 0) + 1;
    }
    return { total: prev.n, by };
  };
}
