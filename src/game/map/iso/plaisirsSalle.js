"use strict";
// ── LA SALLE DES PLAISIRS, DESSINÉE PAR LE CODE ──────────────────────────────
//
// Refonte du 2026-10-02 (docs/PLAN-MAISON-DES-PLAISIRS.md § ⭐, phase 2) : Raph a
// choisi « l'intérieur dessiné par le code — la salle devient le lieu vu de près,
// dans la DA de la carte : elle change avec l'âge et les jeux débloqués, des
// habitants aux tables, jour/nuit en même temps que la carte ; on clique les
// tables ». Elle remplace l'illustration fixe (`ui/plaisirs/salle.png`), la même
// au campement qu'à l'âge cosmique.
//
// CE QU'ON VOIT : la grande terrasse du lieu, en gros plan, à l'ÉCHELLE DE LA CARTE
// (un habitant y fait 7-8 px, la vue l'agrandit au pixel près). Au fond le FÛT et
// son premier plateau en PÉTALES — la même ossature que dehors, dans la matière de
// l'âge ; des guirlandes tendues du plateau vers le bord ; une TABLE PAR JEU, chacune
// cliquable au pixel ; la plateforme d'envol d'Icare au-dessus de l'eau ; la scène
// des musiciens ; l'eau du fleuve aux quatre coins (le lieu est au large).
//
// Repère : x est, y sud, h altitude (px), comme le reste de la carte ; le pont de la
// terrasse est à h = 0, l'eau 6 px plus bas. On place les choses en coordonnées
// ÉCRAN au sol (X = x − y, Y = (x + y)/2) : c'est la composition qui compte ici.
//
// Rend { R (fond + objets, opaque), N (calque de nuit), ids (Uint8Array : numéro de
// table par pixel), spots, figures, props } — pur, aucun DOM.
import { rgbOf, h32, outline, makeRaster } from './isoPixelPaint.js';
import { mats, cyl, taper, ring3d, PLANE_H, line, pick, band5, hip } from './wonderBake.js';
import {
  revolve, box, facet, petalValance, pavMat, lit, A_WIN, velvetFold, nightLayer, baysCol, vdiscMask, PLAISIRS_PALETTE,
} from './plaisirsBake.js';

const { VELVET, CANVAS, PAPER, HIDE, OCHRE, NEON_PINK } = PLAISIRS_PALETTE;
const fm = (a, n) => ((a % n) + n) % n;
const TAU = Math.PI * 2;
// Écran au sol → monde.
const W = (X, Y) => [Y + X / 2, Y - X / 2];

// Le cadre cuit (900 × 400 px d'art, de quoi couvrir un écran de 2 560 px à ×5) est plus grand que ce que la vue doit montrer
// à coup sûr — la CONTENT, où sont les tables (352 × 212) : la vue agrandit d'un
// facteur ENTIER qui fait tenir la CONTENT, et le surplus (fleuve, bord de la
// terrasse, haut du fût) remplit le reste du cadre au lieu de bandes vides.
export const SALLE = { ox: -450, oy: -200, w: 900, h: 400 };
// ⚠ Resserrée autour des tables (et du pied du fût) : chaque cran d'agrandissement
// gagné rend tables et habitants plus lisibles ; le reste déborde dans le cadre.
export const SALLE_CONTENT = { x0: -170, x1: 160, y0: -96, y1: 80, cx: -5, cy: -8 };
// Les tables : id (l'ancre de anchors.js), place à l'écran (X, Y au sol).
export const SALLE_TABLES = [
  { id: 'boutique', at: [-126, 2] },
  { id: 'tickets', at: [126, 2] },
  { id: 'scene', at: [0, 10] },
  { id: 'des', at: [-74, 44] },
  { id: 'cartes', at: [74, 44] },
  { id: 'icare', at: [-136, 60] },
];

// L'étage au-dessus de l'auvent : le mur de l'âge percé de fenêtres (allumées la nuit).
function windowed(X, base) {
  return (I, h, a, rho) => {
    const s = fm(a / TAU * 16 + 0.5, 1) - 0.5, v = fm(h - 70, 34);
    if (Math.abs(s) < 0.16 && v > 10 && v < 24) return X.win(0, h, band5(I) <= 2);
    return base(I, h, a, rho);
  };
}
// ── Le style de chaque âge ───────────────────────────────────────────────────
// La matière vient du kit de l'ère (wonderKits.js, la pierre des quais et du pont) ;
// le reste (rouge du lieu, rayures, lanternes) est l'ADN, à toutes les époques.
function styleOf(K, X) {
  const S = styleBase(K, X);
  if (!S.upper) S.upper = S.glassy ? S.wall : windowed(X, S.solid || S.wall);
  return S;
}
function styleBase(K, X) {
  const b = K.band, Wd = K.pal.wood;
  const plank = (x, y) => rgbOf(Wd[fm(y, 6) < 1 ? 2 : h32(Math.floor(x / 15), Math.floor(y / 6), 5) % 5 === 0 ? 1 : 0]);
  // Dallage de pierre : anneaux et joints rayonnants.
  const flag = (x, y) => rgbOf(K.pal.stone[fm(Math.hypot(x, y), 9) < 0.8 || fm(Math.atan2(y, x) * Math.hypot(x, y) / 11, 1) < 0.07 ? 3 : 1]);
  const roul = (n) => (a) => { const k = Math.floor(fm(a / TAU * n, n)); return k === 0 ? '#2f7a52' : (k & 1) ? VELVET[2] : (b >= 5 ? '#2a2a30' : CANVAS[1]); };
  if (b === 0) return {
    floor: plank, inlay: null, rim: Wd[2],
    wall: (I, h, a) => pick((Math.floor(fm(a / TAU * 24, 24)) & 1) ? HIDE : OCHRE, I), glassy: true,
    plateau: (I) => pick(HIDE, I), valPal: [OCHRE, HIDE], light: 'torch', M: pavMat(X, 'wood'), felt: HIDE[1], garland: { pennant: true, cols: [OCHRE[1], HIDE[0]] },
    rail: Wd[2], icare: 'feathers', water: ['#46708a', '#527d97', '#6a93ab'],
  };
  if (b === 1) return {
    floor: plank, inlay: null, rim: Wd[2],
    wall: baysCol(10, 0, 28, (I, h, a, rho) => rgbOf(Wd[Math.min(3, (band5(I) <= 1 ? 0 : 1) + (fm(a * rho, 4) < 1 ? 1 : 0))])),
    solid: (I, h, a, rho) => rgbOf(Wd[Math.min(3, (band5(I) <= 1 ? 0 : 1) + (fm(a * rho, 4) < 1 ? 1 : 0))]),
    plateau: (I) => pick(['#d9b46a', '#b8904c', '#8c6a34', '#5e4422'], I), valPal: [VELVET, CANVAS], light: 'lantern', M: pavMat(X, 'wood'), felt: VELVET[2],
    garland: {}, rail: Wd[2], icare: 'feathers', water: ['#46708a', '#527d97', '#6a93ab'],
  };
  if (b <= 3) return {
    floor: flag, inlay: [96, 106, roul(37)], rim: K.pal.stone[4],
    wall: (() => {
      const bays = baysCol(10, 0, 30, X.stoneL);
      // Couronne : des meurtrières entre les baies.
      return (I, h, a, rho) => (b === 3 && fm(a / TAU * 20 + 0.5, 1) < 0.07 && h > 40 && h < 56 ? X.dark : bays(I, h, a, rho));
    })(),
    solid: X.stoneL,
    plateau: b === 3 ? (I) => pick(['#7d8596', '#5f6676', '#474d5b', '#323642'], I) : X.roofL,
    valPal: b === 3 ? [VELVET, ['#f0cf6a', '#d2a53e', '#9c7524', '#6d4c25', '#4a3418']] : [VELVET, CANVAS],
    light: b === 2 ? 'brazier' : 'lantern', M: pavMat(X, 'stone'), felt: VELVET[2], garland: {}, rail: X.P.metal[1], icare: 'wings', water: ['#4a7590', '#56829c', '#6e98b0'],
    banners: b === 3,
  };
  if (b === 4) return {
    floor: (x, y) => { const r = Math.hypot(x, y), a = Math.atan2(y, x); return X.marble(fm(r, 9) < 0.8 || fm(a * r / 10, 1) < 0.08 ? 1 : 0); },
    inlay: [96, 106, roul(37)], rim: X.P.marble[2] || K.pal.stone[3],
    wall: baysCol(10, 0, 30, X.marbleL), solid: X.marbleL, plateau: X.marbleL, valPal: [VELVET, CANVAS], light: 'brazier', M: pavMat(X), felt: VELVET[2],
    garland: {}, rail: X.P.metal[1], icare: 'wings', water: ['#4c7893', '#58849e', '#7099b1'],
  };
  if (b === 5) {
    const iron = ['#5a5f6a', '#3f434c', '#2c2f36', '#1e2026'];
    return {
      floor: plank, inlay: [96, 106, roul(37)], rim: iron[1],
      wall: baysCol(12, 0, 30, (I, h, a) => (fm(a / TAU * 24, 1) < 0.12 || fm(h, 10) < 1 ? pick(iron, I) : [...pick(K.pal.glassRamp, I).slice(0, 3), A_WIN])),
      glassy: true, plateau: (I) => pick(iron, I), valPal: [VELVET, CANVAS], light: 'gas', M: { L: (I) => pick(iron, I), F: (k) => rgbOf(iron[k]) }, felt: '#2f6e4a',
      garland: { cols: ['#fff6d6', '#ffe6a8', '#b49a64'], wire: '#2c2f36' }, rail: iron[2], icare: 'balloon', water: ['#4a6e86', '#567a92', '#6c90a6'],
    };
  }
  if (b === 6) return {
    floor: (x, y) => rgbOf(fm(Math.hypot(x, y), 10) < 0.8 ? '#c4c9cf' : '#dde1e5'), inlay: [96, 106, roul(37)], rim: '#9aa2ad',
    wall: (I, h, a) => (fm(a / TAU * 28, 1) < 0.12 || fm(h, 12) < 1 ? pick(X.P.metal, I) : [...pick(K.pal.glassRamp, I).slice(0, 3), A_WIN]),
    glassy: true, plateau: (I) => (I > 0.3 ? rgbOf('#dde1e5') : rgbOf('#9aa2ad')), valPal: [VELVET, CANVAS], neon: NEON_PINK[0], light: 'neon', M: pavMat(X, 'metal'), felt: '#2f6e4a',
    garland: { cols: [NEON_PINK[0], '#ffe08a', NEON_PINK[2]] }, rail: X.P.metal[1], icare: 'glider', water: ['#456a84', '#517690', '#6a8ea6'],
  };
  const glow = K.pal.glow, GR = K.pal.glassRamp;
  return {
    floor: (x, y) => rgbOf(fm(Math.hypot(x, y), 10) < 0.8 ? '#cfd6de' : '#eef1f4'), inlay: [96, 106, roul(37)], rim: GR[2],
    wall: (I, h) => (fm(h, 14) < 1.2 ? lit(glow) : [...pick(GR, I).slice(0, 3), A_WIN]),
    glassy: true, plateau: (I) => (I > 0.3 ? rgbOf('#eef1f4') : lit(GR[2])), valPal: [VELVET, CANVAS], neon: glow, light: 'orb', M: pavMat(X, 'crystal'), felt: VELVET[2],
    garland: { cols: [glow, GR[0], GR[2]], wire: GR[2] }, rail: glow, icare: 'light', water: ['#3f6a86', '#4b7692', '#6890aa'],
  };
}

// ── Le pont de la terrasse et l'eau ──────────────────────────────────────────
const DECK = 0, WATER = -6, RT = 150;
function paintGround(R, S) {
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      const Xs = R.ox + i + 0.5, Ys = R.oy + j + 0.5;
      // Le pont (h = 0) : là où le point du sol tombe dans le disque.
      let [x, y] = W(Xs, Ys + DECK);
      const r = Math.hypot(x, y);
      let c;
      if (r <= RT) {
        if (S.inlay && r > S.inlay[0] && r < S.inlay[1]) c = rgbOf(S.inlay[2](Math.atan2(y, x)));
        else if (S.inlay && (Math.abs(r - S.inlay[0]) < 0.8 || Math.abs(r - S.inlay[1]) < 0.8)) c = rgbOf('#d2a53e');
        else c = S.floor(x, y);
        if (r > RT - 2.5) c = rgbOf(S.rim);
      } else {
        // Le flanc du pont (de h = 0 à l'eau), puis l'eau.
        [x, y] = W(Xs, Ys + WATER);
        const rw = Math.hypot(x, y);
        if (rw <= RT) c = rgbOf(S.rim);
        else {
          const g = h32(Math.floor(x / 7), Math.floor(y / 3), 9) % 23 === 0;
          c = rgbOf(S.water[g ? 2 : (Math.floor(y / 5) & 1) ? 1 : 0]);
        }
      }
      const k = (j * R.w + i) * 4;
      R.data[k] = c[0]; R.data[k + 1] = c[1]; R.data[k + 2] = c[2]; R.data[k + 3] = 255;
    }
  }
}

// ── Les tables ───────────────────────────────────────────────────────────────
// Osselets / dés : une table ronde, tapis de l'âge, les os (ou les dés) dessus.
function tableDes(R, X, S, x, y) {
  const M = S.M, ht = 9;
  if (S.light === 'torch') {
    // L'âge du feu : une peau à même le pont, un cercle de pierres, les os.
    revolve(R, x, y, DECK, DECK + 1, cyl(14), (I, h, a, rho, cap) => (cap ? rgbOf(rho > 12 ? OCHRE[2] : HIDE[fm(a * 3, 1) < 0.5 ? 0 : 1]) : rgbOf(HIDE[3])));
    for (let k = 0; k < 9; k += 1) { const a = (k / 9) * TAU; box(R, x + 17 * Math.cos(a) - 1.5, x + 17 * Math.cos(a) + 1.5, y + 17 * Math.sin(a) - 1.5, y + 17 * Math.sin(a) + 1.5, DECK, DECK + 2.5, X.plain(1), X.top(2)); }
    bones(R, x, y, DECK + 1.2, 4);
    return;
  }
  revolve(R, x, y, DECK, DECK + 1.5, cyl(6), M.L);
  revolve(R, x, y, DECK + 1.5, DECK + ht - 2, cyl(2.4), M.L);
  revolve(R, x, y, DECK + ht - 2, DECK + ht, cyl(14), (I, h, a, rho, cap) => {
    if (!cap) return M.L(I);
    if (rho > 12.5) return M.F(0);
    if (S.light === 'neon' || S.light === 'orb') { const k = Math.floor(fm(a / TAU * 18, 18)); return rgbOf(k === 0 ? '#2f7a52' : (k & 1) ? VELVET[1] : '#2a2a30'); }
    return rgbOf(S.felt);
  });
  bones(R, x, y, DECK + ht + 0.2, S.light === 'gas' || S.light === 'neon' || S.light === 'orb' ? 3 : 4, S.light === 'orb');
}
// Les os (âges anciens) ou les dés (âges modernes) : petits pavés blancs.
function bones(R, x, y, h, n, glow = false) {
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * TAU + 0.4, dx = 5 * Math.cos(a), dy = 4 * Math.sin(a);
    box(R, x + dx - 1.2, x + dx + 1.2, y + dy - 1.2, y + dy + 1.2, h, h + 1.6, (f, u, hv, lv) => (glow ? lit(lv ? '#ffffff' : '#c8d6ff') : rgbOf(lv ? '#f6f0e2' : '#cfc6b2')), () => (glow ? lit('#ffffff') : rgbOf('#fffaf0')));
  }
}
// Le vingt-et-un : une table rectangulaire au tapis de l'âge, les cartes, les jetons.
function tableCartes(R, X, S, x, y) {
  const M = S.M, ht = 9, w = 16, d = 10;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) revolve(R, x + sx * (w - 3), y + sy * (d - 3), DECK, DECK + ht - 2, cyl(1.3), M.L);
  box(R, x - w, x + w, y - d, y + d, DECK + ht - 2, DECK + ht, (f, u, hv, lv) => M.F(lv ? 0 : 2), (px, py) => {
    if (Math.abs(px - x) > w - 1.5 || Math.abs(py - y) > d - 1.5) return M.F(0);
    return rgbOf(S.felt);
  });
  // Cartes : cinq petites cartes posées (crème, coin rouge), un sabot.
  const cards = [[-7, -2], [-3, 3], [2, -3], [6, 2], [10, -1]];
  for (const [cx, cy] of cards) {
    box(R, x + cx - 1.6, x + cx + 1.6, y + cy - 2.2, y + cy + 2.2, DECK + ht, DECK + ht + 0.6, () => rgbOf('#efe6cf'),
      (px, py) => (px < x + cx - 0.4 && py < y + cy - 0.8 ? rgbOf(VELVET[1]) : rgbOf('#fbf5e6')));
  }
  if (S.light !== 'torch') {
    // Jetons : trois piles colorées.
    for (const [cx, cy, c] of [[-12, 5, VELVET[1]], [-10, 6, '#2a2a30'], [12, 6, '#f0cf6a']]) revolve(R, x + cx, y + cy, DECK + ht, DECK + ht + 2, cyl(1.3), () => rgbOf(c));
  }
}
// Les tickets : un guichet à comptoir, auvent rayé, rouleaux de tickets.
function tableTickets(R, X, S, x, y) {
  const M = S.M, w = 13, d = 9, H = 22;
  box(R, x - w, x + w, y - d, y + d, DECK, DECK + H, (f, u, hv, lv) => {
    if (f === 'S' && hv > 8 && hv < 16 && Math.abs(u - x) < w - 4) return [...rgbOf(VELVET[4]), A_WIN];   // le guichet
    if (hv === 8) return M.F(0);
    if (hv < 8 && f === 'S') return fm(u, 4) < 1 ? M.F(2) : M.F(1);
    return M.F(lv ? 1 : 2);
  }, () => M.F(0));
  // Comptoir en saillie, tickets dessus.
  box(R, x - w + 2, x + w - 2, y + d, y + d + 4, DECK + 7, DECK + 8.5, (f, u, hv, lv) => M.F(lv ? 0 : 2), (px) => (fm(px, 3) < 1.4 ? rgbOf('#f6efd8') : M.F(0)));
  // Auvent rayé au-dessus du guichet.
  awning(R, S, x - w - 1, x + w + 1, y + d, y + d + 7, DECK + H - 3);
  hip(R, x - w - 1, x + w + 1, y - d - 1, y + d + 1, DECK + H, 8, X.roofL);
}
// Auvent rayé aux couleurs de l'âge (peaux teintes au feu, toile cramoisi/crème ensuite).
function awning(R, S, x0, x1, y0, y1, h) {
  const [A, B] = S.valPal;
  box(R, x0, x1, y0, y1, h, h + 2, (f, u) => rgbOf((Math.floor(u / 3) & 1) ? B[1] : A[1]), (px) => rgbOf((Math.floor(px / 3) & 1) ? B[0] : A[0]));
}
// La boutique : une échoppe aux étagères garnies, auvent rayé.
function tableBoutique(R, X, S, x, y) {
  const M = S.M, w = 15, d = 9, H = 20;
  const goods = ['#d2a53e', '#5a8f7e', VELVET[1], '#7fa2bf', '#e6d4ae'];
  box(R, x - w, x + w, y - d, y + d, DECK, DECK + H, (f, u, hv, lv) => {
    if (f === 'S' && hv > 3 && hv < H - 4 && Math.abs(u - x) < w - 3) {
      if (fm(hv, 5) < 1) return M.F(2);                                             // planche d'étagère
      return rgbOf(goods[h32(Math.floor(u / 2), Math.floor(hv / 5), 3) % goods.length]);
    }
    return M.F(lv ? 1 : 2);
  }, () => M.F(0));
  awning(R, S, x - w - 1, x + w + 1, y + d, y + d + 6, DECK + H - 3);
  hip(R, x - w - 1, x + w + 1, y - d - 1, y + d + 1, DECK + H, 7, X.roofL);
}
// La scène : une estrade ronde, un rideau en fond, deux mâts à fanions.
function tableScene(R, X, S, x, y) {
  const M = S.M;
  // À la Couronne, le GRAND MASQUE d'or (celui du donjon, dehors) couronne la scène.
  if (S.banners) vdiscMask(R, X, x - 6, y - 6, DECK + 46, 9);
  revolve(R, x, y, DECK, DECK + 5, cyl(24), (I, h, a, rho, cap) => (cap ? (fm(rho, 6) < 0.8 ? M.F(1) : M.F(0)) : (h > 3.5 ? rgbOf(VELVET[1]) : M.L(I))));
  // Le rideau, tendu entre deux mâts, à l'arrière de l'estrade.
  for (const s of [-1, 1]) line(R, [x + s * 17, y - s * 17 - 6, DECK + 5], [x + s * 17, y - s * 17 - 6, DECK + 34], X.P.metal[1], 2);
  // Le rideau s'ouvre au milieu (deux pans relevés en embrasse) sur le fond sombre
  // de la scène, et porte un lambrequin festonné sous sa tringle d'or.
  const top = DECK + 32, c0 = x - y;
  facet(R, [[x - 17, y + 11, DECK + 5], [x + 17, y - 23, DECK + 5], [x + 17, y - 23, top], [x - 17, y + 11, top]],
    [x - 6, y - 12, DECK + 18], (I, px, py, ph) => {
      const u = (px - py - c0) / 2;                                  // −17 … 17 le long du rideau
      if (ph > top - 1) return rgbOf('#f0cf6a');                     // la tringle
      const sc = top - 4 + 2 * Math.abs(Math.sin(u * 0.55));
      if (ph > sc) return rgbOf(VELVET[ph > top - 2.5 ? 0 : 1]);     // le lambrequin
      const gap = 1.5 + Math.max(0, top - 6 - ph) * 0.42;            // l'ouverture s'élargit vers le bas
      if (Math.abs(u) < gap) return rgbOf(ph < DECK + 12 ? '#2a1418' : '#1c0e10');
      if (Math.abs(Math.abs(u) - gap) < 1) return rgbOf(VELVET[0]);  // le bord du pan, éclairé
      return velvetFold(I + 0.2, px - py);
    });
}
// Icare : la plateforme d'envol au-dessus de l'eau, et l'engin de l'âge.
function tableIcare(R, X, S, x, y, props) {
  const M = S.M;
  // Le ponton qui sort du pont vers l'eau (vers le sud-ouest).
  box(R, x - 10, x + 4, y - 6, y + 26, DECK - 2, DECK, (f, u, hv, lv) => M.F(lv ? 1 : 2), (px, py) => (fm(py, 4) < 1 ? M.F(2) : M.F(0)));
  for (const [dx, dy] of [[-9, 24], [3, 24]]) revolve(R, x + dx, y + dy, WATER, DECK - 2, cyl(1.4), M.L);
  const cx = x - 3, cy = y + 16;
  if (S.icare === 'balloon') {
    // Le ballon captif, nacelle au ras du ponton, amarré par deux filins.
    const bh = DECK + 40, br = 12;
    line(R, [cx - 6, cy, DECK], [cx - 2, cy, bh - br - 4], '#3a2a22');
    line(R, [cx + 6, cy, DECK], [cx + 2, cy, bh - br - 4], '#3a2a22');
    box(R, cx - 3, cx + 3, cy - 3, cy + 3, bh - br - 8, bh - br - 3, (f, u, hv, lv) => rgbOf(X.P.wood[lv ? 1 : 2]), () => rgbOf(X.P.wood[0]));
    revolve(R, cx, cy, bh - br, bh + br, (h) => Math.sqrt(Math.max(0, br * br - (h - bh) * (h - bh))) * (h < bh ? 0.75 + 0.25 * (h - bh + br) / br : 1),
      (I, h, a) => pick((Math.floor(fm(a / TAU * 12, 12)) & 1) ? CANVAS : VELVET, I));
    return;
  }
  // Un mât, une traverse, les AILES déployées (plumes, toile, voile, lumière).
  line(R, [cx, cy, DECK], [cx, cy, DECK + 26], X.P.metal[2], 2);
  const wy = DECK + 22, span = S.icare === 'glider' ? 17 : 14;
  for (const sgn of [-1, 1]) {
    facet(R, [[cx, cy, wy], [cx + sgn * span, cy - sgn * span, wy + 6], [cx + sgn * (span - 2), cy - sgn * (span - 2), wy], [cx + sgn * 3, cy - sgn * 3, wy - 3]],
      [cx - 2, cy - 2, wy], (I, px, py, ph) => {
        if (S.icare === 'light') return lit(ph > wy + 3 ? '#ffffff' : S.neon || '#bfe8ff');
        if (S.icare === 'glider') return rgbOf((Math.floor((px - py) / 4) & 1) ? CANVAS[0] : VELVET[1]);
        if (S.icare === 'feathers') return rgbOf(fm(px - py, 3) < 1 ? HIDE[2] : ph > wy + 2 ? '#f4efe6' : HIDE[0]);
        return rgbOf(X.P.metal[ph > wy + 3 ? 0 : fm(px - py, 3) < 1 ? 2 : 1]);
      });
  }
  props.push({ prop: 'flag', x: cx, y: cy, h: DECK + 26, poleH: 5, fw: 5, fh: 3 });
}

// ── Les lumières de l'âge (posées au dessin : flammes, globes) ───────────────
function lampAt(R, X, S, x, y, props) {
  const M = S.M;
  if (S.light === 'torch') { line(R, [x, y, DECK], [x, y, DECK + 18], X.P.wood[2], 2); props.push({ prop: 'flame', x, y, h: DECK + 18, small: true }); return; }
  if (S.light === 'brazier') {
    revolve(R, x, y, DECK, DECK + 7, taper(DECK, DECK + 7, 2.4, 4), M.L);
    revolve(R, x, y, DECK + 7, DECK + 9, cyl(5), (I, h, a, rho, cap) => (cap ? rgbOf('#3a2a22') : X.metalL(I)));
    props.push({ prop: 'flame', x, y, h: DECK + 9 });
    return;
  }
  line(R, [x, y, DECK], [x, y, DECK + 20], S.rail, 1);
  const col = S.light === 'gas' ? '#fff2c8' : S.light === 'neon' ? NEON_PINK[0] : S.light === 'orb' ? (S.neon || '#bfe8ff') : PAPER[0];
  revolve(R, x, y, DECK + 19, DECK + 24, (h) => Math.sqrt(Math.max(0, 6.25 - (h - DECK - 21.5) ** 2)), () => lit(col));
  props.push({ prop: 'glow', x, y, h: DECK + 22, col });
}

// ── Les figurants ────────────────────────────────────────────────────────────
// Joueurs et marchands autour des tables : DEVANT ou à côté d'elles seulement (ils
// sont dessinés par-dessus la salle cuite — derrière une table, elle les couvrirait).
// type 0 homme, 1 femme, 2 enfant ; dir : 0 sud-est, 1 nord-ouest, 2 sud-ouest, 3 nord-est.
function figuresFor(open) {
  const f = [];
  const add = (X, Y, dir, type, variant, extra = {}) => { const [x, y] = W(X, Y); f.push({ x, y, h: DECK, dir, type, variant, ...extra }); };
  if (open.des) { add(-90, 54, 3, 0, 0); add(-60, 58, 1, 1, 1); add(-74, 62, 1, 0, 2); }
  if (open.cartes) { add(58, 56, 3, 0, 1); add(88, 56, 1, 1, 0); add(96, 42, 2, 0, 3, { role: 'croupier' }); }
  if (open.tickets) { add(112, 20, 1, 1, 2); }
  if (open.boutique) { add(-110, 20, 1, 0, 1); }
  if (open.scene) { add(-8, 6, 0, 1, 0, { role: 'musicien' }); add(10, 2, 2, 0, 0, { role: 'musicien' }); }
  if (open.icare) { add(-132, 70, 1, 0, 2); }
  // Deux promeneurs qui traversent le premier plan (animés par la vue).
  add(-30, 80, 0, 1, 1, { walk: 1 }); add(34, 84, 2, 0, 1, { walk: -1 });
  return f;
}

// ── La salle ─────────────────────────────────────────────────────────────────
// `open` : { des, tickets, cartes, icare, boutique, scene } — un lieu sans jeu reste
// dessiné (la scène, la boutique avant le premier effondrement) mais n'est pas
// cliquable ; la vue en décide (spotIsOpen).
export function bakeSalle(K, open = {}) {
  const X = mats(K), S = styleOf(K, X), props = [];
  const R = makeRaster(SALLE.ox, SALLE.oy, SALLE.w, SALLE.h);
  paintGround(R, S);
  // Le reste est peint sur un calque d'OBJETS, détouré à l'encre (comme chaque objet
  // de la carte) puis posé sur le pont.
  const O = makeRaster(SALLE.ox, SALLE.oy, SALLE.w, SALLE.h);
  const ids = new Uint8Array(R.w * R.h);
  // Peindre « au nom » d'une table : les pixels qui changent lui appartiennent ;
  // ce qui repasse par-dessus ensuite les lui reprend (id 0).
  const paintAs = (id, fn) => {
    const before = O.data.slice();
    fn();
    for (let k = 0; k < ids.length; k += 1) {
      const q = k * 4;
      if (O.data[q] !== before[q] || O.data[q + 1] !== before[q + 1] || O.data[q + 2] !== before[q + 2] || O.data[q + 3] !== before[q + 3]) ids[k] = id;
    }
  };
  // LE FÛT au fond, qui monte HORS DU CADRE (on est à son pied, on n'en voit pas le
  // sommet), et l'AUVENT de son premier plateau, festonné de pétales — la même
  // ossature que dehors. ⚠ Un plateau entier (dessus compris) faisait un grand disque
  // crème qui mangeait le haut de la salle : on n'en garde que le bord.
  const [fx, fy] = W(0, -64);
  const rF = 74, eH = 62, tH = 65;
  paintAs(0, () => {
    revolve(O, fx, fy, DECK, 220, cyl(rF), (I, h, a, rho) => (h < eH ? S.wall(I, h, a, rho) : S.upper(I, h, a, rho)));
    revolve(O, fx, fy, eH, tH, cyl(rF + 14), (I, h, a, rho, cap) => (cap ? S.plateau(0.9) : S.plateau(I)));
    revolve(O, fx, fy, tH, 220, cyl(rF), (I, h, a, rho) => S.upper(I, h, a, rho));
    petalValance(O, fx, fy, rF + 14.5, eH + 1, 13, 40, { pal: S.valPal, neon: S.neon, trim: X.P.metal[0] });
    if (S.banners) for (const a of [0.55, 0.78, 1.0]) props.push({ prop: 'flag', x: fx + (rF + 12) * Math.cos(a), y: fy + (rF + 12) * Math.sin(a), h: tH, poleH: 8, fw: 7, fh: 5 });
  });
  // Les GUIRLANDES tendues du bord du plateau vers les mâts du pourtour.
  const masts = [[-170, 34], [-112, 78], [-40, 94], [40, 94], [112, 78], [170, 34]].map(([sx, sy]) => W(sx, sy));
  paintAs(0, () => {
    for (let k = 0; k < masts.length; k += 1) {
      const [mx, my] = masts[k];
      const a = Math.atan2(my - fy, mx - fx), ax = fx + (rF + 12) * Math.cos(a), ay = fy + (rF + 12) * Math.sin(a);
      stringLights(O, [ax, ay, eH - 1], [mx, my, DECK + 26], S, k);
    }
  });
  // Les TABLES, du fond vers l'avant.
  const spots = {};
  const table = { boutique: tableBoutique, tickets: tableTickets, scene: tableScene, des: tableDes, cartes: tableCartes, icare: tableIcare };
  SALLE_TABLES.forEach((t, n) => {
    const [x, y] = W(t.at[0], t.at[1]);
    paintAs(n + 1, () => table[t.id](O, X, S, x, y, props));
  });
  // Les MÂTS du pourtour (avec leur lumière) et le garde-corps aux coins.
  paintAs(0, () => {
    for (const [mx, my] of masts) lampAt(O, X, S, mx, my, props);
    ring3d(O, [0, 0, DECK + 5], RT - 2, 1, PLANE_H[0], PLANE_H[1], () => rgbOf(S.rail), 'front');
  });
  outline(O, X.ink);
  // Le calque d'objets, posé sur le pont ; les ids suivent l'encre.
  for (let k = 0; k < ids.length; k += 1) {
    const q = k * 4;
    if (!O.data[q + 3]) { ids[k] = 0; continue; }
    R.data[q] = O.data[q]; R.data[q + 1] = O.data[q + 1]; R.data[q + 2] = O.data[q + 2]; R.data[q + 3] = O.data[q + 3];
  }
  // Les ancres : centre et rayon de l'encre de chaque table (en pixels du cadre).
  SALLE_TABLES.forEach((t, n) => {
    let x0 = R.w, y0 = R.h, x1 = -1, y1 = -1, sx = 0, sy = 0, c = 0;
    for (let k = 0; k < ids.length; k += 1) {
      if (ids[k] !== n + 1) continue;
      const i = k % R.w, j = (k / R.w) | 0;
      if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
      sx += i; sy += j; c += 1;
    }
    if (c) spots[t.id] = { x: Math.round(sx / c), y: Math.round(sy / c), r: Math.round(Math.max(x1 - x0, y1 - y0) / 2) + 3, box: { x0, y0, x1, y1 }, n: n + 1 };
  });
  const N = nightLayer(R, K.pal.night);
  return { R, N, ids, spots, props, figures: figuresFor(open), band: K.band, waterHex: S.water[0] };
}
// Une guirlande en chaînette d'un point haut à un point bas, lanternes de l'âge.
function stringLights(R, a, b, S, seed) {
  const n = 22;
  let prev = null;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n, sag = 7 * 4 * t * (1 - t);
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - sag];
    if (prev) line(R, prev, p, S.garland.wire || '#3a2a22');
    prev = p;
    if (i > 0 && i < n && i % 2 === 0) {
      const cols = S.garland.cols || PAPER;
      lanternGarlandDot(R, p, cols[(i + seed) % 2], !S.garland.pennant);
    }
  }
}
// Une lanterne (2×2, allumée la nuit) ou un fanion (éteint) au fil d'une guirlande.
function lanternGarlandDot(R, p, c, glow) {
  const X = Math.floor(p[0] - p[1] - R.ox), Y = Math.floor((p[0] + p[1]) / 2 - p[2] - R.oy);
  const v = glow ? lit(c) : rgbOf(c);
  const put2 = (i, j, col) => { if (i >= 0 && j >= 0 && i < R.w && j < R.h) { const k = (j * R.w + i) * 4; R.data[k] = col[0]; R.data[k + 1] = col[1]; R.data[k + 2] = col[2]; R.data[k + 3] = col[3] || 255; } };
  put2(X, Y + 1, v); put2(X + 1, Y + 1, v); put2(X, Y + 2, v); put2(X + 1, Y + 2, glow ? lit('#7a2333') : v);
}
