"use strict";
// ── LA MAISON DES PLAISIRS EN COUPE ───────────────────────────────────────────
//
// Retour de Raph, 2026-10-03, sur la première salle peinte (une terrasse vue en
// iso, tous les jeux au rez) : « ça fait cheap quand même, il faut améliorer ; et
// rendre le tout plus cohérent — quel intérêt d'avoir un bâtiment de plus en plus
// grand si tout se passe au rez-de-chaussée ? vérifie la cohérence du lieu,
// accentue le côté pixel art ». Puis, au choix de l'angle : « de face, par le code ».
//
// L'intérieur est donc la COUPE DU BÂTIMENT, vue de face, comme une maison de
// poupée : chaque plateau qu'on voit dehors est un SALON dedans, et chaque jeu a son
// étage (PLAISIRS_PROGRAMME, partagé avec la carte). Le radeau du feu n'a qu'un
// pont, la tour du néon en a cinq ; on monte d'étage en étage.
//
// LE PIXEL ART D'ABORD (« accentue le côté pixel art ») : pas de dégradé lisse —
// des bandes franches reliées par un TRAMAGE ordonné (Bayer 4×4) ; un CONTOUR
// d'encre autour de chaque meuble ; la lumière haut-gauche posée en liseré clair
// d'un pixel ; des matières à motif net (planches, moellons, carrelage, papier
// peint, lambris) ; des salons DENSES — un vide uniforme est ce qui faisait cheap.
//
// Couches (la vue les empile) : R = le fond (ciel, rive d'en face, eau, murs du
// fond, sols, plafonds, mobilier du fond) ; les HABITANTS (posés par la vue) ;
// F = l'avant-plan (tables, comptoirs, rampes — ce qui passe DEVANT un joueur) ;
// N = les lumières de nuit. `ids` : le numéro du lieu de chaque pixel (le clic).
//
// Repère : pixels du cadre, x vers la droite, y vers le bas ; la surface de l'eau
// est la ligne WATER_Y. Pur : aucun DOM.
import { makeRaster, outline } from './isoPixelPaint.js';

// ── Le programme des étages (partagé avec l'extérieur) ───────────────────────
// Le NOMBRE DE NIVEAUX suit les plateaux du bâtiment dehors (plaisirsBake.js) ; les
// lieux s'y rangent du bas vers le haut. Icare n'est pas un étage : c'est le TOIT
// (sa plateforme d'envol), au-dessus du dernier niveau.
const LEVELS_BY_BAND = [1, 2, 2, 3, 3, 2, 5, 4, 5, 5];
const PACK = {
  1: [['des', 'boutique', 'cartes', 'tickets', 'scene']],
  2: [['des', 'boutique', 'scene'], ['cartes', 'tickets']],
  3: [['des', 'boutique'], ['cartes', 'scene'], ['tickets']],
  4: [['des', 'boutique'], ['cartes'], ['tickets'], ['scene']],
  5: [['des', 'boutique'], ['cartes'], ['tickets'], ['scene'], ['salon']],
};
export function plaisirsProgramme(band) {
  const b = Math.max(0, Math.min(9, band | 0));
  return PACK[LEVELS_BY_BAND[b]].map((rooms) => rooms.slice());
}

// ── Palette et outillage de pixel ────────────────────────────────────────────
const _hx = new Map();
const hex = (c) => {
  let v = _hx.get(c);
  if (!v) { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _hx.set(c, v); }
  return v;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function painter(R) {
  const P = {
    // Les FOYERS de lumière (appliques, lustres) : la vue y pose les halos de nuit.
    marks: [],
    mark(x, y) { P.marks.push({ x, y }); },
    get(x, y) {
      if (x < 0 || y < 0 || x >= R.w || y >= R.h) return '#000000';
      const k = (y * R.w + x) * 4, m = (v) => v.toString(16).padStart(2, '0');
      return '#' + m(R.data[k]) + m(R.data[k + 1]) + m(R.data[k + 2]);
    },
    put(x, y, c, a = 255) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= R.w || y >= R.h || !c) return;
      const v = typeof c === 'string' ? hex(c) : c, k = (y * R.w + x) * 4;
      R.data[k] = v[0]; R.data[k + 1] = v[1]; R.data[k + 2] = v[2]; R.data[k + 3] = a;
    },
    rect(x, y, w, h, c, a) { for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) P.put(x + i, y + j, c, a); },
    // Deux couleurs mêlées par TRAMAGE ordonné : t ∈ [0, 1] = part de la seconde.
    dith(x, y, c1, c2, t) { P.put(x, y, BAYER[(y & 3) * 4 + (x & 3)] < t * 16 ? c2 : c1); },
    // Bandes FRANCES (ciel, eau) : chaque couleur est un aplat, et seuls les trois
    // rangs avant la bande suivante se trament vers elle — un liseré de transition,
    // pas un brouillard (un fondu sur un tiers de bande faisait du bruit).
    bands(x, y, w, h, cols) {
      const n = cols.length, bh = h / n;
      for (let j = 0; j < h; j += 1) {
        const k = Math.min(n - 1, Math.floor(j / bh)), d = (k + 1) * bh - j;   // rangs avant la bande suivante
        const tt = k < n - 1 && d <= 3 ? (4 - d) / 5 : 0;
        for (let i = 0; i < w; i += 1) P.dith(x + i, y + j, cols[k], cols[Math.min(n - 1, k + 1)], tt);
      }
    },
    hline(x, y, w, c) { P.rect(x, y, w, 1, c); },
    vline(x, y, h, c) { P.rect(x, y, 1, h, c); },
    // Ellipse pleine (dessus de table vu de face, ballon…).
    ellipse(cx, cy, rx, ry, col) {
      for (let j = -ry; j <= ry; j += 1) for (let i = -rx; i <= rx; i += 1) {
        if ((i * i) / (rx * rx + 0.5) + (j * j) / (ry * ry + 0.5) <= 1) P.put(cx + i, cy + j, typeof col === 'function' ? col(i, j) : col);
      }
    },
  };
  return P;
}
// Une teinte entre deux (ombres PLEINES : un rang d'ombre est une couleur, pas un
// damier).
function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2), m = (i) => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0');
  return '#' + m(0) + m(1) + m(2);
}
const h32 = (a, b = 0, c = 0) => {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
};

// ── Le style de chaque âge ───────────────────────────────────────────────────
// Rouge du lieu et rayures (l'ADN), matière de l'âge (kit des merveilles : pierre,
// bois, métal, toit, verre).
const VELVET = ['#e06a5e', '#c8434a', '#a2303e', '#7a2333', '#521827'];
const CREAM = ['#f6ead0', '#e6d4ae', '#c9b38a', '#a08b66'];
const OCHRE = ['#d8794c', '#b85a36', '#913f27', '#682e1d'];
const HIDE = ['#ecd6a8', '#d2b582', '#ad8f60', '#806740'];
const INK = '#1c1216';
function styleOf(K) {
  const b = K.band, P = K.pal;
  const wood = P.wood || ['#a47a4c', '#86613a', '#6b4b2b', '#4a321c'];
  const st = P.stone, metal = P.metal, roof = P.roof, glass = P.glassRamp;
  const base = {
    band: b, wood, stone: st, metal, roof, glass, glow: P.glow, night: P.night,
    petals: [VELVET, CREAM], felt: '#7a2333', feltHi: '#a2303e',
    sky: ['#9fd0ee', '#b9def2', '#d4ebf6', '#e8f4f8'], skyline: 'town', haze: '#b8c9d6',
    water: ['#5d8fae', '#4c7d9c', '#3f6c8a', '#355d78'],
  };
  if (b === 0) return { ...base, sky: ['#f0b46a', '#f4c886', '#f6dcaa', '#f8ead0'], haze: '#d8b08a', skyline: 'camp',
    found: 'raft', wall: 'hide', floor: 'logs', roofKind: 'tent', light: 'torch', petals: [OCHRE, HIDE], felt: HIDE[2], feltHi: HIDE[1], cut: [wood[2], wood[3]] };
  if (b === 1) return { ...base, skyline: 'huts', found: 'piles', wall: 'planks', floor: 'planks', roofKind: 'thatch', light: 'lantern', cut: [wood[2], wood[3]] };
  if (b === 2) return { ...base, skyline: 'town', found: 'stone', wall: 'ashlar', floor: 'flags', roofKind: 'tiles', light: 'brazier', cut: [st[4], st[6]] };
  if (b === 3) return { ...base, skyline: 'castle', found: 'stone', wall: 'ashlar', floor: 'flags', roofKind: 'slate', light: 'lantern', banners: true, petals: [VELVET, ['#f0cf6a', '#d2a53e', '#9c7524', '#6d4c25']], cut: [st[4], st[6]] };
  if (b === 4) return { ...base, skyline: 'temples', found: 'stone', wall: 'marble', floor: 'checker', roofKind: 'dome', light: 'chandelier', cut: [st[3], st[5]] };
  if (b === 5) return { ...base, sky: ['#b8c4cc', '#c9d2d6', '#d8dcd8', '#e4e2d8'], haze: '#a8a29a', skyline: 'factories',
    found: 'iron', wall: 'damask', floor: 'parquet', roofKind: 'glassdome', light: 'gas', felt: '#1f5a3c', feltHi: '#2f7a52', cut: ['#3f434c', '#2c2f36'] };
  if (b === 6) return { ...base, sky: ['#7fb6e0', '#9ccbeb', '#bfdcf0', '#dceaf2'], skyline: 'towers',
    found: 'concrete', wall: 'glasswall', floor: 'terrazzo', roofKind: 'neondome', light: 'neon', neon: '#ff6fb5', felt: '#15603f', feltHi: '#1f7a52', cut: ['#9aa2ad', '#5f6772'] };
  return { ...base, sky: ['#2a2f64', '#3a3f7a', '#56589a', '#7a78b8'], haze: '#8c8ac0', skyline: 'spires',
    found: 'float', wall: 'crystal', floor: 'light', roofKind: 'crystal', light: 'orb', neon: P.glow, felt: '#1b2433', feltHi: '#2a3a52', cut: [glass[2], glass[3]] };
}

// ── Le cadre ─────────────────────────────────────────────────────────────────
// Le cadre est plus LARGE que le bâtiment : ciel, rive et eau remplissent l'écran
// de part et d'autre (la vue ne laisse jamais de bande vide).
export const COUPE = { w: 720, LH: 42, SLAB: 4, WATER_H: 22, ROOF_H: 46, TOP_PAD: 30 };
const WIDTHS = [
  [236], [210, 160], [216, 166], [220, 178, 140], [236, 190, 146], [228, 176],
  [246, 200, 170, 140, 112], [236, 200, 168, 136], [236, 204, 176, 148, 120], [236, 204, 176, 148, 120],
];

// ── Le ciel, la rive d'en face, l'eau ────────────────────────────────────────
function paintSky(P, S, W, waterY) {
  P.bands(0, 0, W, waterY, S.sky);
  // Nuages : amas de pixels clairs, ombrés d'un rang en dessous.
  for (let k = 0; k < 5; k += 1) {
    const cx = 30 + (h32(k, S.band, 1) % (W - 60)), cy = 14 + (h32(k, S.band, 2) % 50), n = 3 + (h32(k, 3) % 3);
    for (let p = 0; p < n; p += 1) {
      const px = cx + p * 7 - n * 3, r = 4 + (h32(k, p, 4) % 3);
      P.ellipse(px, cy, r + 2, r - 1, (i, j) => (j > 0 ? S.sky[1] : '#ffffff'));
    }
  }
  if (S.band >= 7) for (let k = 0; k < 60; k += 1) P.put(h32(k, 9) % W, h32(k, 7) % (waterY - 30), k % 7 === 0 ? '#ffffff' : S.sky[3]);
}
// La rive d'en face et la ville de l'âge, en silhouettes pâlies par la distance.
function paintSkyline(P, S, W, waterY) {
  const base = waterY - 2, haze = S.haze, deep = S.band >= 7 ? '#6e6ca8' : S.band === 5 ? '#8e8880' : '#9fb3c2';
  // La berge : une bande d'herbe et de terre pâlie.
  P.rect(0, base - 3, W, 3, S.band >= 6 ? '#8f98a6' : '#93a88a');
  for (let x = 0; x < W; ) {
    const k = h32(x, S.band, 5);
    let w = 8 + (k % 14), h = 6 + (k % 18);
    const kind = S.skyline;
    if (kind === 'camp') { // tentes coniques et fumées
      for (let j = 0; j < 9; j += 1) P.hline(x + j, base - 3 - j, 18 - 2 * j, haze);
      if (k % 3 === 0) for (let j = 0; j < 10; j += 1) P.put(x + 9 + ((j >> 1) & 1), base - 14 - j, '#d8c8b8');
      x += 22; continue;
    }
    if (kind === 'huts') { P.rect(x, base - 3 - 6, 12, 6, haze); for (let j = 0; j < 6; j += 1) P.hline(x - 1 + j, base - 9 - j, 14 - 2 * j, deep); x += 18; continue; }
    if (kind === 'factories') {
      P.rect(x, base - 3 - h, w, h, haze);
      if (k % 2 === 0) { P.rect(x + 2, base - 3 - h - 14, 3, 14, deep); for (let j = 0; j < 12; j += 1) P.put(x + 3 + (j % 3) - 1, base - 3 - h - 16 - j, '#b4aca2'); }
      for (let i = 0; i < w; i += 4) for (let j = 0; j < 4; j += 1) P.put(x + i + j, base - 3 - h - (j < 2 ? j : 3 - j), deep);
      x += w + 2; continue;
    }
    if (kind === 'towers') { h = 18 + (k % 40); w = 8 + (k % 10); P.rect(x, base - 3 - h, w, h, haze); for (let j = 4; j < h - 2; j += 4) for (let i = 2; i < w - 1; i += 3) P.put(x + i, base - 3 - h + j, '#d8e4ee'); x += w + 3; continue; }
    if (kind === 'spires') { h = 20 + (k % 44); for (let j = 0; j < h; j += 1) P.hline(x + Math.floor(j * 4 / h), base - 3 - j, Math.max(1, 8 - Math.floor(j * 8 / h)), j % 9 === 0 ? '#c8c4ff' : haze); x += 12; continue; }
    // Bourgs, châteaux, temples : maisons à pignon, tours, coupoles.
    P.rect(x, base - 3 - h, w, h, haze);
    for (let j = 0; j < w / 2; j += 1) P.hline(x + j, base - 3 - h - j, w - 2 * j, deep);
    if (kind === 'castle' && k % 3 === 0) { P.rect(x + w, base - 3 - h - 16, 7, h + 16, haze); for (let i = 0; i < 7; i += 2) P.put(x + w + i, base - 3 - h - 17, haze); }
    if (kind === 'temples' && k % 3 === 0) P.ellipse(x + w / 2, base - 3 - h, Math.max(3, w / 2 - 1), 5, deep);
    x += w + 1;
  }
}
function paintWater(P, S, W, waterY, H) {
  P.bands(0, waterY, W, H - waterY, S.water);
  // Moirures : courts traits clairs, plus serrés près de la rive.
  for (let k = 0; k < 120; k += 1) {
    const y = waterY + 2 + (h32(k, 3) % (H - waterY - 2)), x = h32(k, 5) % W, w = 3 + (h32(k, 7) % 7);
    P.hline(x, y, w, k % 5 === 0 ? '#e8f4f8' : S.water[0]);
  }
}

// ── Les matières (fond de salon) ─────────────────────────────────────────────
// Rend la couleur du mur au pixel (x, y) d'un salon dont le plafond est à y0.
function wallAt(S, x, y, y0, h) {
  const t = (y - y0) / h;                                 // 0 plafond … 1 sol
  const W = S.wood, st = S.stone;
  switch (S.wall) {
    case 'hide': return ((x >> 3) & 1) ? (t < 0.15 ? OCHRE[2] : OCHRE[1]) : (t < 0.15 ? HIDE[2] : HIDE[1]);
    case 'planks': return (x % 7 === 0) ? W[3] : (h32(x / 7 | 0, 1) % 5 === 0 ? W[2] : W[1]);
    case 'ashlar': {
      const row = Math.floor((y - y0) / 5), off = (row & 1) * 6;
      if ((y - y0) % 5 === 4 || (x + off) % 12 === 0) return st[5];
      return h32((x + off) / 12 | 0, row, 3) % 4 === 0 ? st[3] : st[2];
    }
    case 'marble': {
      if (t > 0.72) return ((x >> 2) & 1) ? '#7a2333' : '#6e1f2b';            // lambris de velours
      if (t > 0.69) return S.metal[1];                                          // cimaise d'or
      return (h32(x >> 1, y >> 1, 9) % 23 === 0) ? st[2] : st[0];               // marbre veiné
    }
    case 'damask': {
      if (t > 0.7) return ((x % 6) === 0) ? '#3a1a10' : '#5a2a18';             // lambris d'acajou
      if (t > 0.67) return '#d2a53e';
      const m = ((x + ((y >> 3) & 1) * 4) % 8), n = (y - y0) % 8;
      return (m === 4 && (n === 3 || n === 4)) || (n === 4 && (m === 3 || m === 5)) ? '#8a3a40' : '#6e2a32';   // papier peint damassé
    }
    case 'glasswall': {
      if (x % 16 === 0 || (y - y0) % 12 === 0) return S.metal[2];
      return t < 0.5 ? S.glass[2] : S.glass[3];
    }
    case 'crystal': return (x % 14 === 0) ? S.glow : (t < 0.5 ? S.glass[1] : S.glass[2]);
    default: return st[2];
  }
}
function floorAt(S, x, j) {                                // j : 0 (fond) … 3 (bord avant)
  const W = S.wood, st = S.stone;
  switch (S.floor) {
    case 'logs': return j === 3 ? W[3] : ((x % 9) === 0 ? W[3] : W[j < 2 ? 0 : 1]);
    case 'planks': return j === 3 ? W[3] : ((x + j * 3) % 11 === 0 ? W[2] : W[j < 2 ? 0 : 1]);
    case 'flags': return j === 3 ? st[5] : ((x + j * 4) % 10 === 0 ? st[4] : st[j < 2 ? 1 : 2]);
    case 'checker': return j === 3 ? st[4] : ((((x >> 2) + j) & 1) ? '#2a2422' : st[0]);
    case 'parquet': return j === 3 ? '#3a1a10' : (((x >> 2) + j) & 1 ? W[1] : W[2]);
    case 'terrazzo': return j === 3 ? '#9aa2ad' : (h32(x, j, 4) % 7 === 0 ? '#9aa2ad' : '#d5d9de');
    case 'light': return j === 3 ? S.glow : (h32(x, j, 4) % 9 === 0 ? S.glass[1] : '#eef1f4');
    default: return st[1];
  }
}

// ── Le mobilier, de face ─────────────────────────────────────────────────────
// Chaque pièce se peint dans la couche O (fond) ou F (avant), puis le contour
// d'encre de la couche fait le reste.
function stool(P, x, y, S) {                                // y = sol
  P.rect(x - 2, y - 5, 5, 2, S.wood[1]); P.hline(x - 2, y - 5, 5, S.wood[0]);
  P.vline(x - 2, y - 3, 3, S.wood[3]); P.vline(x + 2, y - 3, 3, S.wood[3]);
}
function roundTable(P, x, y, S, dice) {                    // table ronde des osselets
  P.rect(x - 1, y - 7, 3, 7, S.wood[2]); P.rect(x - 4, y - 1, 9, 1, S.wood[3]);
  P.ellipse(x, y - 9, 13, 3, (i, j) => (j < -1 ? S.feltHi : j > 1 ? S.wood[2] : S.felt));
  P.hline(x - 12, y - 7, 25, S.wood[3]);
  if (S.band === 6) {                                       // la roulette du casino
    P.ellipse(x - 2, y - 10, 5, 1, (i) => ((i & 1) ? '#c8303a' : '#1a1a20'));
    P.put(x - 2, y - 10, '#f0cf6a');
  }
  for (let k = 0; k < (dice ? 4 : 3); k += 1) { const dx = -8 + k * 4 + (k & 1); P.rect(x + dx, y - 11 + (k & 1), 2, 1, k === 1 ? '#ffffff' : '#efe6cf'); }
}
function cardTable(P, x, y, S) {
  P.rect(x - 18, y - 9, 37, 3, S.felt);
  P.hline(x - 18, y - 10, 37, S.feltHi);
  P.rect(x - 19, y - 7, 39, 2, S.wood[2]); P.hline(x - 19, y - 7, 39, S.wood[1]);
  for (const lx of [-16, 16]) P.rect(x + lx, y - 5, 2, 5, S.wood[3]);
  // Cartes en éventail et piles de jetons.
  for (let k = 0; k < 4; k += 1) P.rect(x - 6 + k * 3, y - 11 - (k & 1), 2, 2, k === 2 ? '#c8434a' : '#f6efd8');
  for (const [cx, c] of [[-14, '#c8434a'], [-11, '#2a2a30'], [12, '#f0cf6a'], [15, '#5aa6cf']]) {
    for (let h = 0; h < 3; h += 1) P.hline(x + cx, y - 11 - h, 2, h === 2 ? '#ffffff' : c);
  }
}
function counter(P, x, y, w, S, M) {                       // comptoir (guichet, boutique)
  P.rect(x - w / 2, y - 10, w, 10, M[1]);
  P.hline(x - w / 2 - 1, y - 11, w + 2, M[0]); P.hline(x - w / 2 - 1, y - 12, w + 2, M[0]);
  for (let i = 3; i < w - 2; i += 6) P.rect(x - w / 2 + i, y - 8, 4, 6, M[2]);
}
function shelves(P, x, y, w, h, S) {                       // étagères garnies (fond)
  const goods = ['#d2a53e', '#5a8f7e', '#c8434a', '#7fa2bf', '#e6d4ae', '#8c5aa0'];
  P.rect(x - w / 2, y - h, w, h, S.wood[2]);
  for (let r = 0; r < 3; r += 1) {
    const yy = y - h + 2 + r * (h / 3);
    P.hline(x - w / 2, yy + h / 3 - 2, w, S.wood[3]);
    for (let i = 2; i < w - 2; i += 3) {
      const c = goods[h32(i, r, x) % goods.length], gh = 2 + (h32(i, r, 7) % 3);
      P.rect(x - w / 2 + i, yy + h / 3 - 2 - gh, 2, gh, c);
    }
  }
}
function lotteryDrum(P, x, y, S) {                         // tambour de loterie (tickets)
  P.vline(x - 6, y - 12, 12, S.metal[2]); P.vline(x + 6, y - 12, 12, S.metal[2]);
  P.ellipse(x, y - 14, 7, 7, (i, j) => ((i + j) % 3 === 0 ? S.metal[1] : null));
  for (let k = 0; k < 6; k += 1) P.put(x - 3 + (h32(k, 1) % 7), y - 16 + (h32(k, 2) % 5), ['#c8434a', '#f0cf6a', '#5aa6cf'][k % 3]);
}
function stage(P, x, y, w, S, F) {                         // l'estrade et son cadre de scène
  // Le fond de scène sombre, les rideaux relevés, le lambrequin, la rampe.
  const top = y - 34;
  P.rect(x - w / 2 + 4, top + 4, w - 8, 26, '#2a1418');
  for (let j = 0; j < 26; j += 1) {
    const gap = 6 + Math.floor((26 - j) * 0.6);
    for (let i = 0; i < w / 2 - 4 - gap; i += 1) {
      const c = (i % 3 === 0) ? VELVET[3] : VELVET[1 + ((i >> 1) & 1)];
      P.put(x - w / 2 + 4 + i, top + 4 + j, c); P.put(x + w / 2 - 5 - i, top + 4 + j, c);
    }
  }
  for (let i = 0; i < w - 4; i += 1) {
    const sc = 3 + Math.round(2 * Math.abs(Math.sin(i * 0.5)));
    for (let j = 0; j < sc; j += 1) P.put(x - w / 2 + 2 + i, top + 3 + j, j === 0 ? '#f0cf6a' : VELVET[1]);
  }
  P.rect(x - w / 2 + 2, top + 1, w - 4, 2, S.metal[0]);
  // L'estrade (avant-plan) et ses feux de rampe.
  F.rect(x - w / 2, y - 6, w, 6, S.wood[2]); F.hline(x - w / 2, y - 6, w, S.wood[0]);
  for (let i = 4; i < w - 4; i += 8) F.put(x - w / 2 + i, y - 7, '#ffe08a');
}
function sofa(P, x, y, S) {
  P.rect(x - 9, y - 9, 19, 4, VELVET[2]); P.hline(x - 9, y - 9, 19, VELVET[0]);
  P.rect(x - 10, y - 6, 21, 4, VELVET[1]); P.rect(x - 10, y - 2, 2, 2, S.wood[3]); P.rect(x + 9, y - 2, 2, 2, S.wood[3]);
}
function bar(P, F, x, y, w, S) {
  // Le fond : rayonnage de bouteilles et miroir.
  P.rect(x - w / 2, y - 30, w, 18, S.wood[3]);
  for (let r = 0; r < 2; r += 1) for (let i = 2; i < w - 2; i += 3) {
    const c = ['#5a8f7e', '#c8434a', '#d2a53e', '#7fa2bf'][h32(i, r, 3) % 4];
    P.rect(x - w / 2 + i, y - 28 + r * 8, 1, 5, c); P.put(x - w / 2 + i, y - 29 + r * 8, c);
  }
  // Le comptoir (avant-plan).
  F.rect(x - w / 2, y - 10, w, 10, S.wood[2]); F.hline(x - w / 2 - 1, y - 11, w + 2, S.metal[0]);
}

// ── Les lumières du plafond ──────────────────────────────────────────────────
function ceilingLight(P, N, x, y, S) {                     // y = sous le plafond
  const L = (px, py, c) => { P.put(px, py, c); N.put(px, py, c); };
  N.mark(x, y + 5);
  switch (S.light) {
    case 'torch': P.vline(x, y + 4, 8, S.wood[3]); L(x, y + 3, '#ffb35c'); L(x, y + 2, '#ffe9a0'); break;
    case 'brazier': P.vline(x, y, 3, S.metal[2]); P.rect(x - 3, y + 3, 7, 2, S.metal[1]); L(x - 1, y + 2, '#ffb35c'); L(x + 1, y + 2, '#ffb35c'); L(x, y + 1, '#ffe9a0'); break;
    case 'chandelier':
      // Le lustre : chaîne, deux couronnes de bras d'or, sept bougies, pendeloques.
      P.vline(x, y, 4, S.metal[2]);
      P.hline(x - 8, y + 6, 17, S.metal[1]); P.hline(x - 7, y + 7, 15, S.metal[2]); P.hline(x - 5, y + 4, 11, S.metal[0]);
      P.rect(x - 1, y + 4, 3, 5, S.metal[1]); P.put(x, y + 9, S.metal[0]);
      for (const dx of [-8, -5, -2, 2, 5, 8]) { P.put(x + dx, y + 5, '#efe6cf'); L(x + dx, y + 4, '#ffe9a0'); }
      L(x, y + 2, '#ffe9a0');
      for (const dx of [-6, -3, 3, 6]) P.put(x + dx, y + 8, '#cfe6f6');
      break;
    case 'gas': for (const dx of [-5, 5]) { P.vline(x + dx, y, 4, '#2c2f36'); L(x + dx, y + 4, '#fff2c8'); L(x + dx - 1, y + 5, '#fff2c8'); L(x + dx, y + 5, '#ffffff'); L(x + dx + 1, y + 5, '#fff2c8'); } break;
    case 'neon': for (let i = -12; i <= 12; i += 1) L(x + i, y + 1, S.neon); break;
    case 'orb': L(x, y + 4, S.glow); L(x - 1, y + 4, S.glow); L(x, y + 3, '#ffffff'); break;
    default: // lanterne de papier
      P.vline(x, y, 3, '#3a2a22'); for (let j = 0; j < 5; j += 1) for (let i = -2; i <= 2; i += 1) if (Math.abs(i) + (j === 0 || j === 4 ? 1 : 0) < 3) L(x + i, y + 3 + j, j === 2 ? '#ff9a6a' : '#e8483a');
  }
}

// ── Le bâtiment ──────────────────────────────────────────────────────────────
// Une GUIRLANDE de lanternes le long d'un auvent (lumières de nuit).
function garland(P, N, x0, x1, y, S, seed) {
  for (let x = x0; x <= x1; x += 1) {
    const t = ((x - x0) % 16) / 16, sag = Math.round(3 * 4 * t * (1 - t));
    P.put(x, y + sag, '#3a2a22');
    if ((x - x0) % 16 === 8) {
      const c = S.light === 'gas' ? '#fff2c8' : S.light === 'neon' ? S.neon : S.light === 'orb' ? S.glow : ((x + seed) % 32 < 16 ? '#e8483a' : '#ffb35c');
      for (const [i, j] of [[0, 1], [1, 1], [0, 2], [1, 2]]) { P.put(x + i, y + sag + j, c); N.put(x + i, y + sag + j, c); }
    }
  }
}
// Le PLATEAU (dalle) qui déborde des murs, ses pétales et sa guirlande.
function slab(P, N, cx, y, w, S, over, seed) {
  const x0 = Math.round(cx - w / 2 - over), x1 = Math.round(cx + w / 2 + over);
  const sideC = S.cut[0], dark = S.cut[1];
  P.rect(x0, y, x1 - x0, 4, sideC); P.hline(x0, y, x1 - x0, S.band >= 6 ? '#e6e9ed' : S.metal[0]); P.hline(x0, y + 3, x1 - x0, dark);
  if (S.neon) { for (let x = x0; x < x1; x += 1) { P.put(x, y + 2, S.neon); N.put(x, y + 2, S.neon); } }
  // Les PÉTALES : festons rayés pendus sous le bord, aux couleurs de l'âge.
  const petalsAt = (xa, xb) => {
    for (let x = xa; x < xb; x += 1) {
      const k = Math.floor((x - xa) / 6), s = ((x - xa) % 6) / 6, d = 2 + Math.round(3 * Math.sin(s * Math.PI));
      const pal = S.petals[k & 1];
      for (let j = 0; j < d; j += 1) P.put(x, y + 4 + j, j === d - 1 ? pal[2] : pal[j === 0 ? 0 : 1]);
    }
  };
  petalsAt(x0, Math.round(cx - w / 2) + 2);
  petalsAt(Math.round(cx + w / 2) - 2, x1);
  garland(P, N, x0 + 1, Math.round(cx - w / 2) - 1, y + 5, S, seed);
  garland(P, N, Math.round(cx + w / 2) + 1, x1 - 1, y + 5, S, seed + 7);
}

// ── Le décor des murs, propre à chaque âge ───────────────────────────────────
// Ce qui manquait le plus : un mur uni est ce qui fait « cheap ». Chaque âge a
// son ornement, posé dans la moitié HAUTE du mur (le mobilier tient le bas), et
// ses appliques allumées la nuit.
function sconce(P, N, S, x, y) {
  N.mark(x, y + 1);
  const flame = S.light === 'gas' ? '#fff2c8' : S.light === 'neon' ? S.neon : S.light === 'orb' ? S.glow : '#ffb35c';
  P.rect(x - 1, y + 2, 3, 2, S.metal[1]); P.put(x, y + 4, S.metal[2]);
  for (const [dx, dy, c] of [[0, 0, '#ffe9a0'], [0, 1, flame], [-1, 1, flame], [1, 1, flame]]) { P.put(x + dx, y + dy, c); N.put(x + dx, y + dy, c); }
}
function frame(P, S, x, y, w, h, k) {                         // tableau encadré
  P.rect(x, y, w, h, S.metal[1]); P.hline(x, y, w, S.metal[0]); P.vline(x, y, h, S.metal[0]);
  P.hline(x, y + h - 1, w, S.metal[2]); P.vline(x + w - 1, y, h, S.metal[2]);
  const sky = ['#9fd0ee', '#e8c48a', '#c8b4e0'][k % 3], land = ['#6d8a45', '#a3502f', '#5a8f7e'][k % 3];
  P.rect(x + 1, y + 1, w - 2, Math.floor((h - 2) / 2), sky);
  P.rect(x + 1, y + 1 + Math.floor((h - 2) / 2), w - 2, Math.ceil((h - 2) / 2), land);
  P.put(x + 2 + (k % (w - 4)), y + 2, '#fff4dc');
}
function decorWall(P, N, S, x0, x1, y0, y1, lvl) {
  const h = y1 - y0, top = y0 + 4;
  const span = x1 - x0;
  const step = span > 150 ? 30 : 26;
  const slots = [];
  for (let x = x0 + 10; x < x1 - 10; x += step) slots.push(x);
  slots.forEach((x, k) => {
    const odd = (k + lvl) & 1;
    switch (S.wall) {
      case 'hide':                                             // fourrures et bois de cerf
        if (odd) { P.rect(x - 4, top + 2, 8, 9, HIDE[3]); P.rect(x - 3, top + 3, 6, 7, HIDE[2]); P.put(x - 4, top + 11, HIDE[3]); P.put(x + 3, top + 11, HIDE[3]); }
        else { for (let j = 0; j < 5; j += 1) { P.put(x - 2 - j, top + 4 - (j & 1), '#efe6cf'); P.put(x + 2 + j, top + 4 - (j & 1), '#efe6cf'); } P.rect(x - 2, top + 4, 5, 3, '#efe6cf'); }
        break;
      case 'planks':                                           // poutres et boucliers
        P.rect(x - 1, y0, 3, h, S.wood[3]); P.vline(x - 1, y0, h, S.wood[2]);
        if (odd) P.ellipse(x + 13, top + 6, 4, 4, (i, j) => (i * i + j * j < 3 ? '#f0cf6a' : ((i + 10) >> 1) & 1 ? VELVET[1] : CREAM[1]));
        else sconce(P, N, S, x + 13, top + 3);
        break;
      case 'ashlar':                                           // tapisseries et torchères
        if (odd) {
          P.rect(x - 5, top - 2, 11, 16, S.band === 3 ? VELVET[2] : VELVET[1]); P.hline(x - 6, top - 3, 13, S.metal[1]);
          P.rect(x - 4, top, 9, 1, S.metal[0]); for (let j = 0; j < 3; j += 1) P.hline(x - 1 - j + 1, top + 5 + j, 1 + 2 * j - 1, S.metal[0]);
          for (let i = -5; i <= 5; i += 2) P.put(x + i, top + 14, S.metal[1]);
        } else sconce(P, N, S, x, top + 4);
        break;
      case 'marble':                                           // pilastres, tableaux, appliques
        P.rect(x - 2, y0 + 1, 5, h - 1, S.stone[0]); P.vline(x + 2, y0 + 1, h - 1, S.stone[3]); P.vline(x - 2, y0 + 1, h - 1, '#fffaf0');
        P.rect(x - 3, y0 + 1, 7, 2, S.metal[1]); P.rect(x - 3, y1 - 3, 7, 2, S.stone[3]);
        if (x + step < x1 - 6) { if (odd) frame(P, S, x + step / 2 - 6, top + 2, 12, 9, k); else sconce(P, N, S, x + step / 2, top + 4); }
        break;
      case 'damask':                                           // miroirs dorés et becs de gaz
        if (odd) {
          P.ellipse(x, top + 6, 5, 6, (i, j) => (i * i / 25 + j * j / 36 > 0.62 ? S.metal[1] : (i < -1 && j < -1 ? '#e8f0f4' : '#9fb8c8')));
        } else sconce(P, N, S, x, top + 4);
        break;
      case 'glasswall':                                        // enseignes néon des jeux
        if (odd) {
          const sh = [[0, 1, 1, 0, 1, 1, 0], [1, 1, 1, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1, 0], [0, 0, 1, 1, 1, 0, 0], [0, 0, 0, 1, 0, 0, 0]];
          sh.forEach((row, j) => row.forEach((v, i) => { if (v) { P.put(x - 3 + i, top + 3 + j, S.neon); N.put(x - 3 + i, top + 3 + j, S.neon); } }));
        } else { P.rect(x - 4, top + 1, 9, 12, '#1c1216'); P.rect(x - 3, top + 2, 7, 6, ['#c8434a', '#f0cf6a', '#5aa6cf'][k % 3]); P.hline(x - 3, top + 9, 7, '#e6e9ed'); P.hline(x - 3, top + 11, 5, '#9aa2ad'); }
        break;
      default: {                                               // cristal : glyphes de lumière
        for (let j = 0; j < 9; j += 1) { P.put(x, top + 2 + j, S.glow); N.put(x, top + 2 + j, S.glow); }
        P.hline(x - 3, top + 6, 7, S.glow); N.put(x - 3, top + 6, S.glow); N.put(x + 3, top + 6, S.glow);
      }
    }
  });
}

// LA SALLE d'un étage : mur du fond, fenêtres, sol, plafond et lumière, mobilier.
function room(ctx, lv, rooms, open, i) {
  const { P, N, S, ids, spots } = ctx;
  const { cx, y0, y1, w } = lv;                             // y0 = sous le plafond, y1 = sol
  const x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2), h = y1 - y0;
  // Le mur du fond. Ombres PLEINES : deux rangs sous le plafond, deux colonnes
  // aux angles — des teintes, pas un damier.
  const glassy = S.wall === 'glasswall' || S.wall === 'crystal';
  for (let y = y0; y < y1; y += 1) for (let x = x0 + 4; x < x1 - 4; x += 1) {
    // Un mur de VERRE laisse voir ce qu'il y a derrière (le ciel, la ville) : on
    // teinte ce qui est déjà peint là, et on pose les meneaux.
    let c = glassy ? mix(P.get(x, y), S.glass[S.wall === 'crystal' ? 1 : 2], 0.38) : wallAt(S, x, y, y0, h);
    if (glassy && (x % 16 === 0 || (y - y0) % 13 === 0)) c = S.wall === 'crystal' ? S.glow : S.metal[2];
    if (glassy && y - y0 > h - 7) c = wallAt(S, x, y, y0, h);
    const dy = y - y0, dl = x - x0 - 4, dr = x1 - 5 - x;
    if (dy === 0) c = mix(c, INK, 0.5); else if (dy === 1) c = mix(c, INK, 0.28);
    else if (dl === 0 || dr === 0) c = mix(c, INK, 0.32); else if (dl === 1 || dr === 1) c = mix(c, INK, 0.16);
    P.put(x, y, c);
  }
  decorWall(P, N, S, x0 + 4, x1 - 4, y0, y1, i);
  // Le sol, vu un peu d'en haut (4 rangs), et la plinthe.
  for (let j = 0; j < 4; j += 1) for (let x = x0 + 4; x < x1 - 4; x += 1) P.put(x, y1 + j, floorAt(S, x, j));
  P.hline(x0 + 4, y1 - 1, w - 8, mix(wallAt(S, x0 + 8, y1 - 2, y0, h), INK, 0.45));
  // Le plafond : corniche claire, sous-face sombre.
  P.rect(x0 + 4, y0 - 1, w - 8, 1, INK);
  P.hline(x0 + 4, y0, w - 8, mix(S.cut[0], INK, 0.2));
  // LES LIEUX de l'étage, répartis sur sa largeur.
  const n = rooms.length;
  rooms.forEach((id, r) => {
    const rx0 = x0 + 4 + Math.round(((w - 8) * r) / n), rx1 = x0 + 4 + Math.round(((w - 8) * (r + 1)) / n), mx = Math.round((rx0 + rx1) / 2);
    // Cloison entre deux lieux : un pilier de la matière de l'âge.
    if (r > 0) { P.rect(rx0 - 1, y0, 3, h, S.cut[0]); P.vline(rx0 - 1, y0, h, S.cut[1]); }
    ceilingLight(P, N, mx, y0, S);
    // Le TAPIS sous la table (cramoisi, galon d'or, motif en losanges) : il ancre
    // le lieu sur le sol au lieu de le laisser flotter sur un plancher uni.
    if (id !== 'boutique' && id !== 'tickets') {
      const rw = Math.min(48, rx1 - rx0 - 10);
      for (let j = 0; j < 4; j += 1) for (let q = 0; q < rw; q += 1) {
        const xx = Math.round(mx - rw / 2) + q, edge = q === 0 || q === rw - 1 || j === 3;
        P.put(xx, y1 + j, edge ? S.metal[1] : ((q + j * 2) % 6 === 0 ? S.petals[1][1] : VELVET[j < 2 ? 2 : 3]));
      }
    }
    const before = ctx.snapshot();
    furnish(ctx, id, mx, y1, rx1 - rx0, open);
    ctx.claim(before, id);
    for (let y = y0; y < y1 + 4; y += 1) for (let x = rx0; x < rx1; x += 1) if (!ids.get(x, y)) ids.set(x, y, id);
    spots[id] = { x: mx, y: Math.round((y0 + y1) / 2), r: Math.round(Math.min(rx1 - rx0, h) / 2), box: { x0: rx0, y0, x1: rx1, y1: y1 + 3 }, level: i };
  });
}
// Meuble un lieu (x au centre, y au sol, largeur disponible). Rend les figurants.
function furnish(ctx, id, x, y, w, open) {
  const { O, F, S, fig } = ctx;
  const M = S.band >= 5 ? [S.metal[0], S.metal[1], S.metal[2]] : [S.wood[0], S.wood[1], S.wood[2]];
  const on = id === 'scene' ? true : !!open[id];
  switch (id) {
    case 'des':
      roundTable(F, x, y, S, S.band >= 4);
      stool(F, x - 15, y, S); stool(F, x + 15, y, S);
      if (on) { fig(x - 15, y, 0, 0, 0); fig(x + 15, y, 2, 1, 1); fig(x + 4, y - 1, 0, 0, 2, { back: true }); }
      break;
    case 'cartes':
      cardTable(F, x, y, S);
      if (on) { fig(x, y - 2, 0, 0, 1, { back: true, role: 'croupier' }); fig(x - 22, y, 0, 1, 0); fig(x + 22, y, 2, 0, 3); }
      break;
    case 'tickets':
      O.rect(x - 14, y - 30, 29, 18, S.cut[1]);
      for (let i = 0; i < 27; i += 3) O.vline(x - 13 + i, y - 29, 16, S.metal[1]);   // la grille du guichet
      O.rect(x - 4, y - 34, 9, 4, '#efe6cf'); O.rect(x - 3, y - 33, 2, 2, '#c8434a');  // l'enseigne : un ticket
      if (S.band >= 3) lotteryDrum(O, x + 22, y, S);
      counter(F, x, y, Math.min(34, w - 10), S, M);
      if (on) { fig(x, y - 3, 0, 1, 2, { back: true, role: 'guichetier' }); fig(x - 20, y, 3, 0, 1); }
      break;
    case 'boutique':
      shelves(O, x, y - 8, Math.min(32, w - 12), 22, S);
      counter(F, x, y, Math.min(30, w - 14), S, M);
      if (on) fig(x + 4, y - 3, 0, 0, 1, { back: true, role: 'marchand' });
      break;
    case 'scene':
      stage(O, x, y, Math.min(60, w - 6), S, F);
      fig(x - 8, y - 6, 0, 1, 0, { role: 'musicien' }); fig(x + 9, y - 6, 2, 0, 0, { role: 'musicien' });
      break;
    case 'salon':
      sofa(F, x - 14, y, S); bar(O, F, x + 18, y, 26, S);
      fig(x - 18, y - 2, 0, 1, 2); fig(x + 14, y - 1, 2, 0, 1, { back: true });
      break;
    default: break;
  }
}

// ── Les toits et la plateforme d'Icare ───────────────────────────────────────
function roofAndPerch(ctx, cx, y, w, open) {
  const { P, N, S, ids, spots, fig } = ctx;
  const top = y;                                             // y = dessus du dernier plateau
  const R = S.roof || ['#c56a45', '#a3502f', '#7c3a22', '#552616'];
  const before = ctx.snapshot();
  const wr = Math.min(w, 120);
  let apex = top - 30;
  switch (S.roofKind) {
    case 'tent': case 'thatch': case 'tiles': case 'slate': {
      const tiers = S.roofKind === 'slate' ? 3 : 1, cols = S.roofKind === 'tent' ? [OCHRE[1], HIDE[1]] : S.roofKind === 'thatch' ? ['#d9b46a', '#b8904c'] : S.roofKind === 'slate' ? ['#6a7182', '#525867'] : [R[0], R[1]];
      let yy = top, ww = wr;
      for (let t = 0; t < tiers; t += 1) {
        const hh = tiers === 1 ? 32 : 14;
        for (let j = 0; j < hh; j += 1) {
          const half = Math.round((ww / 2) * (1 - j / (hh + (tiers === 1 ? 0 : 6))));
          for (let i = -half; i <= half; i += 1) {
            const stripe = S.roofKind === 'tent' ? ((Math.floor((i + 400) / 6)) & 1) : (j % 3 === 0 ? 1 : 0);
            P.dith(cx + i, yy - j, cols[stripe], '#1c1216', i > half * 0.55 ? 0.25 : 0);
          }
        }
        yy -= hh; ww *= 0.72; apex = yy;
        if (tiers > 1) for (let i = -Math.round(ww / 1.44); i <= Math.round(ww / 1.44); i += 6) P.rect(cx + i, yy + hh - 1, 4, 3, i % 12 === 0 ? VELVET[1] : '#f0cf6a');
      }
      break;
    }
    case 'dome': case 'glassdome': case 'neondome': {
      const r = Math.round(wr / 2.4);
      // Le tambour sous la coupole, percé d'oculi (allumés la nuit).
      const dr = Math.round(r * 0.82);
      P.rect(cx - dr, top - 6, dr * 2 + 1, 6, S.cut[0]); P.hline(cx - dr, top - 6, dr * 2 + 1, S.band >= 6 ? '#e6e9ed' : S.metal[0]);
      for (let ox = -dr + 5; ox <= dr - 5; ox += 8) { P.rect(cx + ox - 1, top - 4, 3, 3, INK); N.put(cx + ox, top - 3, S.night); }
      // La coupole, MODELÉE : la lumière haut-gauche en trois crans tramés, des côtes.
      const ramp = S.roofKind === 'dome' ? [S.metal[0], S.metal[1], S.metal[2], mix(S.metal[2], INK, 0.35)]
        : S.roofKind === 'glassdome' ? [S.glass[0], S.glass[1], S.glass[2], S.glass[3]] : ['#ffc2e0', '#ff8cc6', '#ff3d97', '#b81e66'];
      const ry = Math.round(r * 0.9), ty = top - 6;
      for (let j = -ry; j <= 0; j += 1) for (let i = -r; i <= r; i += 1) {
        const q = (i * i) / (r * r + 0.5) + (j * j) / (ry * ry + 0.5);
        if (q > 1) continue;
        const nx = i / r, ny = j / ry, nz = Math.sqrt(Math.max(0, 1 - q));
        const I = -0.55 * nx - 0.45 * ny + 0.7 * nz;                       // lumière haut-gauche
        const f = I > 0.95 ? 0 : I > 0.7 ? 1 : I > 0.35 ? 2 : 3;
        const fr = I > 0.95 ? 0 : I > 0.7 ? (0.95 - I) / 0.25 : I > 0.35 ? (0.7 - I) / 0.35 : 0;
        let c = BAYER[((ty + j) & 3) * 4 + ((cx + i) & 3)] < (fr > 0.8 ? (fr - 0.8) * 5 : 0) * 16 ? ramp[Math.min(3, f + 1)] : ramp[f];
        const rib = Math.round(Math.asin(Math.max(-1, Math.min(1, nx))) * 7) !== Math.round(Math.asin(Math.max(-1, Math.min(1, (i + 1) / r))) * 7);
        if (rib && j < -1) c = S.roofKind === 'glassdome' ? '#2c2f36' : ramp[Math.min(3, f + 1)];
        if (q > 0.86) c = ramp[3];
        P.put(cx + i, ty + j, c);
      }
      const top2 = ty;
      void top2;
      if (S.roofKind !== 'dome') for (let i = -r; i <= r; i += 1) for (let j = -ry; j <= 0; j += 1) {
        if ((i * i) / (r * r) + (j * j) / (ry * ry) <= 1 && (S.roofKind === 'neondome' ? i % 5 !== 0 : h32(i, j, 3) % 4 === 0)) N.put(cx + i, ty + j, S.roofKind === 'neondome' ? '#ff8cc6' : '#fff2c8', 160);
      }
      apex = ty - ry;
      break;
    }
    default: { // cristal : une flèche de lumière
      for (let j = 0; j < 40; j += 1) { const half = Math.max(1, Math.round(10 * (1 - j / 40))); for (let i = -half; i <= half; i += 1) { const c = i === -half + 1 ? '#ffffff' : (j % 8 === 0 ? S.glow : S.glass[1]); P.put(cx + i, top - j, c); if (j % 8 === 0) N.put(cx + i, top - j, S.glow); } }
      apex = top - 40;
    }
  }
  // LA PLATEFORME D'ENVOL d'Icare, au sommet.
  const py = apex - 2;
  P.rect(cx - 12, py, 25, 2, S.cut[0]); P.hline(cx - 12, py, 25, S.metal[0]);
  for (const dx of [-12, 12]) P.vline(cx + dx, py - 5, 5, S.metal[2]);
  P.hline(cx - 12, py - 5, 25, S.metal[1]);
  if (S.band <= 4 || S.band >= 7) {
    // Les ailes déployées sur leur perchoir (cire et plumes ; lumière aux âges cosmiques).
    P.vline(cx, py - 22, 22, S.metal[2]);
    for (let k = 0; k < 14; k += 1) for (const sg of [-1, 1]) {
      const yy = py - 16 - Math.round(k * 0.5) + (k > 10 ? k - 10 : 0);
      for (let j = 0; j < 5 - Math.floor(k / 4); j += 1) {
        const c = S.band >= 7 ? (j === 0 ? '#ffffff' : S.glow) : (j === 0 ? '#fffaf0' : (k % 3 === 0 ? CREAM[2] : CREAM[0]));
        P.put(cx + sg * (k + 1), yy + j, c);
        if (S.band >= 7) N.put(cx + sg * (k + 1), yy + j, c);
      }
    }
  } else if (S.band === 5) {
    // Le BALLON captif.
    for (const dx of [-5, 5]) P.vline(cx + dx, py - 14, 14, '#3a2a22');
    P.rect(cx - 4, py - 18, 9, 5, S.wood[1]); P.hline(cx - 4, py - 18, 9, S.wood[0]);
    P.ellipse(cx, py - 34, 13, 15, (i, j) => (j > 10 && Math.abs(i) > 8 ? null : ((Math.floor((i + 40) / 4) & 1) ? (i < -4 ? '#fff4dc' : CREAM[1]) : (i < -4 ? '#e06a5e' : VELVET[1]))));
  } else {
    // Le DELTAPLANE sur son rail de lancement.
    for (let k = 0; k < 22; k += 1) for (const sg of [-1, 1]) { P.put(cx + sg * k, py - 18 + Math.round(k * 0.35), (Math.floor(k / 4) & 1) ? '#f6ead0' : '#c8434a'); P.put(cx + sg * k, py - 17 + Math.round(k * 0.35), '#6e1f2b'); }
    P.vline(cx, py - 18, 12, '#2c2f36');
  }
  if (open.icare) fig(cx + 7, py, 2, 0, 2, { role: 'aviateur' });
  ctx.claim(before, 'icare');
  for (let yy = py - 40; yy < py + 2; yy += 1) for (let xx = cx - 24; xx <= cx + 24; xx += 1) if (!ids.get(xx, yy)) ids.set(xx, yy, 'icare');
  spots.icare = { x: cx, y: py - 16, r: 22, box: { x0: cx - 24, y0: py - 40, x1: cx + 24, y1: py + 2 }, level: 99 };
  return py - 40;
}

// ── Les fondations (sur l'eau) ───────────────────────────────────────────────
function foundation(P, S, cx, w, deckY, waterY) {
  const x0 = Math.round(cx - w / 2 - 8), x1 = Math.round(cx + w / 2 + 8);
  switch (S.found) {
    case 'raft': for (let x = x0; x < x1; x += 1) { P.rect(x, deckY, 1, waterY - deckY + 2, (x - x0) % 6 === 0 ? S.wood[3] : S.wood[(x & 1) ? 1 : 2]); } break;
    case 'piles': case 'iron': {
      P.rect(x0, deckY, x1 - x0, 3, S.found === 'iron' ? '#3f434c' : S.wood[2]);
      for (let x = x0 + 3; x < x1 - 2; x += 10) P.rect(x, deckY + 3, 3, waterY - deckY + 4, S.found === 'iron' ? '#2c2f36' : S.wood[3]);
      break;
    }
    case 'concrete': {
      P.rect(x0, deckY, x1 - x0, 4, '#c4c9cf'); P.hline(x0, deckY, x1 - x0, '#e6e9ed');
      for (let x = x0 + 4; x < x1 - 4; x += 14) P.rect(x, deckY + 4, 5, waterY - deckY + 4, '#9aa2ad');
      for (let x = x0; x < x1; x += 1) P.put(x, deckY + 3, S.neon);
      break;
    }
    case 'float': {
      P.rect(x0, deckY, x1 - x0, 3, '#eef1f4');
      for (let x = x0; x < x1; x += 1) P.put(x, deckY + 3, S.glow);
      for (let j = 0; j < waterY - deckY - 4; j += 2) P.hline(Math.round(cx - 3), deckY + 5 + j, 7, j % 4 === 0 ? S.glow : S.glass[1]);
      break;
    }
    default: { // îlot maçonné
      for (let y = deckY; y < waterY + 3; y += 1) for (let x = x0 - 2; x < x1 + 2; x += 1) {
        const row = Math.floor((y - deckY) / 4), off = (row & 1) * 5;
        P.put(x, y, (y - deckY) % 4 === 3 || (x + off) % 10 === 0 ? S.stone[5] : (y - deckY < 1 ? S.stone[1] : S.stone[3]));
      }
    }
  }
}

// ── La coupe ─────────────────────────────────────────────────────────────────
// `open` : { des, cartes, tickets, icare, boutique } (un lieu fermé reste meublé,
// sans joueurs). Rend { R, F, N, ids, spots, figures, props, levels, W, H, waterY }.
export function bakeCoupe(K, open = {}) {
  const S = styleOf(K), b = S.band;
  const prog = plaisirsProgramme(b);
  const L = prog.length, widths = WIDTHS[b];
  const W = COUPE.w, LH = COUPE.LH;
  const H = COUPE.TOP_PAD + COUPE.ROOF_H + 44 + L * LH + (K.band >= 7 ? (L - 1) * 9 : 0) + COUPE.WATER_H + 14;
  const waterY = H - COUPE.WATER_H;
  const R = makeRaster(0, 0, W, H), Fr = makeRaster(0, 0, W, H), Or = makeRaster(0, 0, W, H), Nr = makeRaster(0, 0, W, H);
  const P = painter(R), F = painter(Fr), O = painter(Or), N = painter(Nr);
  const idb = new Array(W * H).fill(null);
  const ids = { get: (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? idb[y * W + x] : null), set: (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) idb[y * W + x] = v; } };
  const figures = [], spots = {};
  const cx = Math.round(W / 2);
  const ctx = {
    P, F, O, N, S, ids, spots,
    fig: (x, y, dir, type, variant, extra = {}) => figures.push({ x, y, dir, type, variant, ...extra }),
    // Les pixels qui changent pendant qu'on meuble un lieu lui appartiennent (le clic).
    snapshot: () => ({ f: Fr.data.slice(), o: Or.data.slice() }),
    claim: (before, id) => {
      for (let k = 0; k < W * H; k += 1) {
        const q = k * 4;
        if (Fr.data[q + 3] !== before.f[q + 3] || Or.data[q + 3] !== before.o[q + 3]) idb[k] = id;
      }
    },
  };
  paintSky(P, S, W, waterY);
  paintSkyline(P, S, W, waterY);
  paintWater(P, S, W, waterY, H);
  // Les NIVEAUX, du bas vers le haut.
  const deckY = waterY - 8;
  foundation(P, S, cx, widths[0], deckY, waterY);
  const levels = [];
  let y1 = deckY - 4;                                       // le sol du rez (dessus de la dalle)
  // Âges COSMIQUES : les plateaux FLOTTENT (comme dehors) — un vide traversé de
  // colonnes de lumière entre deux niveaux, chacun posé sur sa propre dalle.
  const GAP = S.found === 'float' ? 9 : 0;
  for (let i = 0; i < L; i += 1) {
    const w = widths[Math.min(i, widths.length - 1)];
    if (GAP && i > 0) {
      slab(P, N, cx, y1, w, S, 8, i * 31);
      for (const dx of [-w / 2 + 14, 0, w / 2 - 14]) for (let j = 0; j < GAP; j += 1) {
        const xx = Math.round(cx + dx), yy = y1 + 4 + j;
        P.put(xx, yy, j & 1 ? S.glass[1] : S.glow); N.put(xx, yy, S.glow);
      }
    }
    const y0 = y1 - (LH - COUPE.SLAB - 4);                  // sous le plafond
    const x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2);
    // Les murs coupés : l'épaisseur de la matière, en hachures de coupe.
    for (let y = y0 - COUPE.SLAB; y < y1 + 4; y += 1) for (let x = 0; x < 4; x += 1) {
      const c = ((x + y) % 4 === 0) ? S.cut[1] : S.cut[0];
      P.put(x0 + x, y, c); P.put(x1 - 1 - x, y, c);
    }
    levels.push({ i, cx, w, y0, y1, rooms: prog[i] });
    room(ctx, { cx, w, y0, y1 }, prog[i], open, i);
    // Le plafond de cet étage = la dalle du suivant (ou le toit), avec ses pétales.
    const over = i === L - 1 ? 6 : 10;
    slab(P, N, cx, y0 - COUPE.SLAB, w, S, over, i * 13);
    if (S.banners) for (const dx of [-w / 2 - over + 2, w / 2 + over - 3]) { P.vline(Math.round(cx + dx), y0 - 14, 10, '#3a2a22'); P.rect(Math.round(cx + dx) + 1, y0 - 14, 5, 6, VELVET[1]); }
    y1 = y0 - COUPE.SLAB - (i < L - 1 ? GAP : 0);
  }
  // La dalle du rez (le pont) et sa bordure, sur les fondations.
  slab(P, N, cx, deckY - 4, widths[0], S, 10, 99);
  const topY = y1;
  const roofTop = roofAndPerch(ctx, cx, topY, widths[Math.min(L - 1, widths.length - 1)], open);
  // L'ENCRE : contour des meubles du fond et de l'avant-plan, puis le fond reçoit les
  // meubles du fond. L'avant-plan reste à part (il passe devant les joueurs).
  outline(Or, INK); outline(Fr, INK);
  for (let k = 0; k < W * H; k += 1) {
    const q = k * 4;
    if (!Or.data[q + 3]) continue;
    R.data[q] = Or.data[q]; R.data[q + 1] = Or.data[q + 1]; R.data[q + 2] = Or.data[q + 2]; R.data[q + 3] = 255;
  }
  // Le reflet du bâtiment dans l'eau : miroir sous la ligne d'eau, assombri, haché.
  for (let y = waterY + 1; y < H; y += 1) {
    const sy = waterY - (y - waterY) * 2;
    if (sy < 0 || (y % 3 === 0)) continue;
    for (let x = 0; x < W; x += 1) {
      const sq = (sy * W + x) * 4, dq = (y * W + x) * 4;
      const inside = Math.abs(x - cx) < widths[0] / 2 + 10;
      if (!inside) continue;
      for (let c = 0; c < 3; c += 1) R.data[dq + c] = Math.round(R.data[dq + c] * 0.55 + R.data[sq + c] * 0.45 * 0.7);
    }
  }
  const idArr = idb;
  return { R, F: Fr, N: Nr, ids: idArr, spots, figures, levels, lights: N.marks, W, H, waterY, roofTop, band: b, waterHex: S.water[1], skyHex: S.sky[0] };
}
