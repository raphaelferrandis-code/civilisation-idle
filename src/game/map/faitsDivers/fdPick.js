"use strict";

// LES FAITS DIVERS — viser, survoler, ouvrir (docs/PLAN-FAITS-DIVERS.md).
//
// Une scène signale chaque personnage (ou chose : le Feu, la tortue) qu'elle PEINT,
// avec sa boîte à l'écran (noteFait). À chaque frame, la liste remplie à la
// précédente devient la liste visée — même mécanique que la fiche d'habitant
// (citizenFocus.js), écrite à part : ce module ne dépend que de ce qui est commité.
//
// Le clic est écouté AVANT celui de la carte (capture sur le conteneur de la carte,
// qui passe avant les écouteurs du canevas) : sinon un passant qui frôle Nancy
// devant sa porte volerait le clic — la fiche d'habitant aimante à 9 px.
// ⛔ Aucune bulle, aucune icône sur la carte (décision de Raph : discret) : la main
// du curseur et un anneau pâle au sol, comme pour les passants, c'est tout.
import { CM } from '../layout.js';
import { snapZoom } from '../iso/projection.js';

// Marge de visée (px écran) et taille minimale d'une cible : un personnage fait
// 7 px de large au zoom d'ensemble, et il bouge — même réglage que les passants.
const PAD = 9, MIN_HALF_W = 7, MIN_H = 18;
// Cran de zoom visé à l'ouverture quand on regarde de plus loin.
const OPEN_ZOOM = 1.75;

let buf = [], drawn = [];
// Début de frame : ce qui a été peint à la précédente devient la liste visée.
export function fdFrame() {
  drawn = buf;
  buf = [];
}
export function noteFait(target, box) {
  target._box = box;
  if (buf.length < 400) buf.push(target);
}

// La cible la plus proche du point écran, ou null.
function fdPickAt(sx, sy) {
  let best = null, bestD = Infinity, bestY = -Infinity;
  for (const t of drawn) {
    const b = t._box;
    if (!b || !t.app || !t.app.alive) continue;
    const cx = (b.x0 + b.x1) / 2, hw = Math.max(MIN_HALF_W, (b.x1 - b.x0) / 2);
    const x0 = cx - hw, x1 = cx + hw, y1 = b.y1, y0 = Math.min(b.y0, y1 - MIN_H);
    const dx = Math.max(x0 - sx, 0, sx - x1), dy = Math.max(y0 - sy, 0, sy - y1);
    const d = Math.hypot(dx, dy);
    if (d > PAD) continue;
    if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && y1 > bestY)) { best = t; bestD = d; bestY = y1; }
  }
  return best;
}

// ── SURVOL ───────────────────────────────────────────────────────────────────
// La souris est relue à chaque frame (ils bougent, la souris peut rester immobile).
let mouse = null;
let hover = null;
export function fdHoverTick() {
  const next = mouse && !CM.drag ? fdPickAt(mouse.x, mouse.y) : null;
  hover = next;
  // La main sur une cible ; sinon on ne touche à rien (la carte gère son curseur).
  if (next && CM.canvas && !CM.drag) CM.canvas.style.cursor = 'pointer';
}

// ── LA CIBLE OUVERTE ─────────────────────────────────────────────────────────
// `focus` = la cible dont la carte de réplique est ouverte ; `opened` = ce que la
// scène a répondu à l'ouverture ({ who, line, isNew, … }).
let focus = null, opened = null;
const listeners = new Set();
export function onFaitFocus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) {
    try { fn(focus); } catch { /* abonné démonté */ }
  }
}
export const fdFocus = () => focus;
export const fdOpened = () => opened;
export function fdMark(t) {
  if (focus === t) return 2;
  if (hover === t) return 1;
  return 0;
}

function fdOpen(t) {
  if (!t || !t.app) return;
  focus = t;
  opened = t.app.open ? t.app.open(t) : null;
  // La fiche d'habitant (si elle est là) se ferme : une seule plaque à la fois.
  // Elle lit CM.focus à chaque relevé et se replie d'elle-même quand il est vide.
  if (CM.focus) CM.focus = null;
  // La caméra glisse vers la scène, sans la suivre : une scène ne se promène pas.
  if (Number.isFinite(t.wx) && Number.isFinite(t.wy)) {
    CM.camGoal = { x: t.wx, y: t.wy };
    CM.panVel = null;
    const z = CM.zoomGoal ?? (CM.cam ? CM.cam.zoom : 1);
    if (z < OPEN_ZOOM) CM.zoomGoal = snapZoom(OPEN_ZOOM);
  }
  emit();
}
// Re-clic sur la cible déjà ouverte : la scène peut avoir autre chose à dire.
function fdReopen() {
  if (!focus || !focus.app) return;
  opened = focus.app.open ? focus.app.open(focus, true) : opened;
  emit();
}
export function fdClose() {
  if (!focus) return;
  focus = null;
  opened = null;
  emit();
}
// La scène de la cible a quitté la carte : la plaque se ferme.
export function fdFocusCheck() {
  if (focus && (!focus.app || !focus.app.alive)) fdClose();
  // La fiche d'habitant a pris la place : la plaque s'efface.
  if (focus && CM.focus) fdClose();
}

// ── ENTRÉES ──────────────────────────────────────────────────────────────────
// Appelé par bindCityMapInput (cityMapRuntime.js), avec le même AbortController :
// les écouteurs meurent avec la carte.
export function bindFaitsDiversInput(canvas, mapRoot, signal) {
  if (!canvas) return;
  const root = mapRoot && mapRoot.contains && mapRoot.contains(canvas) ? mapRoot : canvas.parentElement;
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // Le survol : sur window, en phase de BULLE — donc après le gestionnaire de la
  // carte, qui repose son curseur à chaque mouvement ; le nôtre a le dernier mot.
  window.addEventListener('mousemove', (e) => {
    mouse = e.target === canvas ? local(e) : null;
    if (mouse && !CM.drag) {
      const t = fdPickAt(mouse.x, mouse.y);
      hover = t;
      if (t) canvas.style.cursor = 'pointer';
    }
  }, { signal, passive: true });
  canvas.addEventListener('mouseleave', () => { mouse = null; hover = null; }, { signal });
  // Le clic : en CAPTURE sur le conteneur, avant ceux du canevas. Un relâché de
  // glisser (CM.dragged) reste à la carte, qui le consomme.
  if (root) {
    root.addEventListener('click', (e) => {
      if (e.target !== canvas || CM.dragged) return;
      const p = local(e);
      const t = fdPickAt(p.x, p.y);
      if (!t) return;
      e.stopPropagation();
      e.preventDefault();
      if (t === focus) fdReopen();
      else fdOpen(t);
    }, { capture: true, signal });
  }
}
