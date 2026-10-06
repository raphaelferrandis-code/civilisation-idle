"use strict";
// ── LES JETONS DE LA MAISON, DESSINÉS PAR LE CODE ─────────────────────────────
//
// Lot 1 des gains « vrai casino » (2026-10-04, docs/PLAN-GAINS-CASINO.md) : la mise
// est libre, on la pose en JETONS sur le tapis. Un jeton se dessine au pixel, vu en
// 3/4 comme la table (une ellipse et sa tranche), dans la MATIÈRE de l'âge — os et
// coquillage au Feu, bois, terre cuite, bronze à la Couronne, nacre au Marbre, argile
// des casinos à la Fonte, plastique au Néon, plaques de lumière ensuite — et la
// COULEUR de sa valeur, comme dans les vrais casinos (1 ivoire, 5 rouge, 25 vert,
// 100 noir, 500 violet…).
//
// Le pixel du jeton est le pixel de la table (×k, entier) : pas de lissage, un
// contour sombre, une lumière en haut à gauche (cf. la règle d'éclairage de la carte).
import { hex, mix } from '../../../game/map/iso/plaisirsHDKit.js';

const DENOM = ['#ece6d6', '#c8402e', '#2f8f55', '#2a2a33', '#7c43a8', '#e2b13c', '#d8742c', '#3577c8'];

// Matières par âge (bande 0-9) : face, tranche, filet, et la façon de porter la
// couleur de la valeur (`paint` : un rond peint au centre ; `ring` : un anneau ;
// `chip` : le jeton EST de la couleur, avec ses inserts sur la tranche ; `glow` : un
// anneau lumineux sur une plaque sombre).
const MATS = [
  { face: '#d8cbb0', side: '#8f7d5e', rim: '#f1e7cf', ink: '#2a1e14', style: 'paint' },   // Feu : os
  { face: '#9a6a3c', side: '#553820', rim: '#bf8b52', ink: '#24160c', style: 'ring' },    // Bois
  { face: '#b46a42', side: '#683620', rim: '#d48c5c', ink: '#2a140a', style: 'ring' },    // Pierre : terre cuite
  { face: '#b8873a', side: '#694a1c', rim: '#e6bb62', ink: '#2a1c08', style: 'paint' },   // Couronne : bronze
  { face: '#e6ddcc', side: '#a2977f', rim: '#fff7e8', ink: '#3a3226', style: 'ring' },    // Marbre : nacre
  { face: null, side: null, rim: '#f0e8d6', ink: '#1a1010', style: 'chip' },              // Fonte : argile
  { face: null, side: null, rim: '#ffffff', ink: '#120c14', style: 'chip' },              // Néon : plastique
  { face: '#1d1b2c', side: '#0d0c17', rim: null, ink: '#05050a', style: 'glow' },         // cosmiques
  { face: '#211c18', side: '#100c09', rim: null, ink: '#05050a', style: 'glow' },
  { face: '#1e1830', side: '#0e0b19', rim: null, ink: '#05050a', style: 'glow' },
];

// Le jeton : 12 px de large, une face de 6 px de haut, une tranche de 2 px.
const W = 12, FACE_H = 6, THICK = 2;
export const CHIP_ART = { w: W + 2, h: FACE_H + THICK + 2, thick: THICK };

// hex ('#rrggbb' → [r, g, b]) et mix (hex → hex) : l'outillage de pixel des Plaisirs
// (plaisirsHDKit), importé en tête de module au lieu d'être recopié.
function luminance(c) {
  const [r, g, b] = hex(c);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Les spans d'une ellipse de largeur w et de hauteur h : [x0, x1] (inclus) par rangée.
function ellipseRows(w, h) {
  const rows = [];
  for (let r = 0; r < h; r += 1) {
    const y = (r + 0.5) / h * 2 - 1;
    const half = (w / 2) * Math.sqrt(Math.max(0, 1 - y * y));
    const x0 = Math.round(w / 2 - half), x1 = Math.round(w / 2 + half) - 1;
    rows.push([x0, Math.max(x0, x1)]);
  }
  return rows;
}
const FACE = ellipseRows(W, FACE_H);
const INNER = ellipseRows(6, 3);

function px(g, x, y, c) {
  g.fillStyle = c;
  g.fillRect(x, y, 1, 1);
}

// Dessine UN jeton (valeur d'indice `i` dans la série, bande `band`) dans le contexte
// `g`, coin haut-gauche du cadre en (ox, oy).
function drawChip(g, band, i, ox, oy) {
  const m = MATS[Math.max(0, Math.min(9, band | 0))];
  const tier = Math.floor(i / DENOM.length);
  const den = DENOM[((i % DENOM.length) + DENOM.length) % DENOM.length];
  const gold = '#ffd166';
  const face = m.style === 'chip' ? den : m.face;
  const side = m.style === 'chip' ? mix(den, '#000000', 0.42) : m.side;
  const light = luminance(face) > 150;
  const insert = m.style === 'chip' ? (tier > 0 ? gold : (light ? '#7a2a22' : m.rim)) : null;
  const ink = m.ink;
  const x0 = ox + 1, y0 = oy + 1;

  // 1. Le contour : la face et la tranche, épaissies d'un pixel.
  const shape = new Set();
  FACE.forEach(([a, b], r) => {
    for (let x = a; x <= b; x += 1) {
      for (let t = 0; t <= THICK; t += 1) shape.add(`${x},${r + t}`);
    }
  });
  for (const key of shape) {
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (!shape.has(k)) px(g, x0 + x + dx, y0 + y + dy, ink);
    }
  }
  // 2. La tranche (ce qui dépasse sous la face), avec ses inserts pour l'argile.
  FACE.forEach(([a, b], r) => {
    for (let t = 1; t <= THICK; t += 1) {
      for (let x = a; x <= b; x += 1) {
        const covered = FACE[r + t] && x >= FACE[r + t][0] && x <= FACE[r + t][1];
        if (covered) continue;
        const c = insert && (x % 3 === 1) ? mix(insert, '#000000', 0.25) : side;
        px(g, x0 + x, y0 + r + t, c);
      }
    }
  });
  // 3. La face.
  FACE.forEach(([a, b], r) => {
    for (let x = a; x <= b; x += 1) px(g, x0 + x, y0 + r, face);
  });
  // 4. Le filet / les inserts au bord de la face.
  FACE.forEach(([a, b], r) => {
    const edge = [a, b];
    if (r === 0 || r === FACE.length - 1) for (let x = a; x <= b; x += 1) edge.push(x);
    for (const x of edge) {
      let c = null;
      if (m.style === 'chip') c = (x + r) % 3 === 0 ? insert : null;
      else if (m.style === 'glow') c = mix(den, '#ffffff', tier > 0 ? 0.35 : 0.1);
      else if (m.rim && r === 0) c = m.rim;
      if (c) px(g, x0 + x, y0 + r, c);
    }
  });
  // 5. La couleur de la valeur, au centre de la face.
  const cx = x0 + 3, cy = y0 + 1;
  if (m.style === 'paint') {
    INNER.forEach(([a, b], r) => { for (let x = a + 1; x <= b - 1; x += 1) px(g, cx + x, cy + r, den); });
  } else if (m.style === 'ring' || m.style === 'glow') {
    INNER.forEach(([a, b], r) => {
      for (let x = a; x <= b; x += 1) {
        const border = x === a || x === b || r === 0 || r === INNER.length - 1;
        if (border) px(g, cx + x, cy + r, den);
      }
    });
    if (m.style === 'glow') px(g, cx + 2, cy + 1, mix(den, '#ffffff', 0.5));
  } else {
    // L'argile : un anneau clair, le centre de la couleur un ton plus sombre.
    INNER.forEach(([a, b], r) => {
      for (let x = a; x <= b; x += 1) {
        const border = x === a || x === b || r === 0 || r === INNER.length - 1;
        px(g, cx + x, cy + r, border ? (tier > 0 ? gold : m.rim) : mix(den, '#000000', 0.15));
      }
    });
  }
  // 6. La lumière, en haut à gauche.
  const [a0] = FACE[1];
  px(g, x0 + a0 + 1, y0 + 1, mix(face, '#ffffff', 0.45));
  if (tier > 0 && m.style !== 'chip') px(g, x0 + FACE[0][1], y0, gold);
}

const cache = new Map();
function canvasOf(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

// L'URL d'un jeton seul (le râtelier). Mise en cache par âge et valeur.
export function chipUrl(band, i) {
  const key = `c:${band}:${i}`;
  let url = cache.get(key);
  if (!url) {
    const cv = canvasOf(CHIP_ART.w, CHIP_ART.h);
    drawChip(cv.getContext('2d'), band, i, 0, 0);
    url = cv.toDataURL();
    cache.set(key, url);
  }
  return url;
}

// Une PILE de jetons (indices du bas vers le haut), décalés d'un pas de tranche.
// Rend { url, w, h } en pixels d'art.
export const PILE_STEP = THICK;
export function pileImage(band, indices) {
  const n = indices.length;
  const key = `p:${band}:${indices.join('.')}`;
  let out = cache.get(key);
  if (!out) {
    const w = CHIP_ART.w, h = CHIP_ART.h + Math.max(0, n - 1) * PILE_STEP;
    const cv = canvasOf(w, h);
    const g = cv.getContext('2d');
    indices.forEach((i, j) => drawChip(g, band, i, 0, h - CHIP_ART.h - j * PILE_STEP));
    out = { url: cv.toDataURL(), w, h };
    cache.set(key, out);
  }
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return out;
}
