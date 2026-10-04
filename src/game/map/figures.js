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

const CAP = 8192;
let cur = { x: new Float32Array(CAP), y: new Float32Array(CAP), f: new Uint8Array(CAP), n: 0 };
let prev = { x: new Float32Array(CAP), y: new Float32Array(CAP), f: new Uint8Array(CAP), n: 0 };

// Genres de figures (bits de `f`, avec MOVING en bit 0).
export const FIG = { MOVING: 1, STREET: 2, PLAZA: 4, QUAY: 8, PORT: 16, RIOT: 32, SCENE: 64 };

// Début de frame : la frame qui s'achève devient la référence lue par tous.
export function figuresBeginFrame() {
  const t = prev; prev = cur; cur = t; cur.n = 0;
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
  for (let i = 0; i < prev.n; i += 1) {
    if (movingOnly && !(prev.f[i] & FIG.MOVING)) continue;
    const dx = prev.x[i] - x, dy = prev.y[i] - y;
    if (dx * dx + dy * dy < r2) return true;
  }
  return false;
}

export const figCount = () => prev.n;
if (typeof window !== 'undefined') {
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
