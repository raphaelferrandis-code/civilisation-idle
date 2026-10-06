"use strict";
// ── LE MOULIN À VENT CUIT — construit par le code (docs/PLAN-TERROIR.md, T3) ──
//
// Raph (2026-10-03, capture à l'appui) : les moulins « ne rendent pas bien ». Les
// ailes étaient une image de croix VUE DE FACE qu'on tournait dans le plan de
// l'écran : hors perspective, et une image pixel tournée à un angle quelconque
// casse ses pixels. Ici tout est peint pixel par pixel en iso exact, avec la
// lumière, la pierre et le grain des merveilles et du pont (wonderBake.js,
// wonderKits.js) :
//   · le CORPS est cuit une fois (raster statique) ;
//   · les AILES vivent dans un plan VERTICAL tourné vers le vent, et sont cuites
//     POSE PAR POSE (MILL_FRAMES poses sur la période de symétrie : un quart de
//     tour pour quatre ailes, un tiers pour trois pales). Chaque pose est un
//     dessin net — rien ne tourne au moment du blit.
//
// UN MOULIN PAR ÈRE (Raph : « go pour toutes les ères ») :
//   0-1 feu, bois   moulin PIVOT en bois sur son chevalet, échelle et queue
//   2   pierre      tour de pierre tronconique, calotte de chaume
//   3   couronne    tour CHAULÉE sur soubassement de pierre, calotte d'ardoise
//   4   marbre      moulin HOLLANDAIS : socle octogonal, balcon, fût de roseau
//   5   fonte       tour de BRIQUE, galerie de fer, calotte en bulbe, éventail,
//                   ailes à volets (« patentes »)
//   6   néon        ÉOLIENNE : mât blanc, nacelle, trois pales
//   7-9 cosmiques   pylône de CRISTAL, pales de lumière (couleur de l'ère)
//
// Repère LOCAL : x vers l'est, y vers le sud (px monde), origine au CENTRE de la
// case du moulin ; h = altitude (px d'écran). Écran au zoom 1 : X = x − y,
// Y = (x + y)/2 − h. La case fait T = 32 px monde de côté.
//
// Pur : aucun DOM, aucun CM. Testable en Node.
import { put, rgbOf, h32, makeRaster } from './isoPixelPaint.js';
import {
  revolve, taper, cyl, box, gable, lum, band5, mats, pixelFinish, nightOf, pick, line, ring3d, PLANE_H,
} from './wonderBake.js';

// ── Le vent ──────────────────────────────────────────────────────────────────
// Toutes les ailes du terroir regardent LE MÊME vent (Raph : « tournées vers le
// même vent ») : un plan d'ailes commun, normale horizontale WIND (vers le sud, un
// peu à l'est — face à l'œil, avec ce qu'il faut de biais pour se lire en
// perspective). U = l'horizontale du plan, W = la verticale.
const MILL_WIND = { nx: 0.34, ny: 0.94 };
const WN = Math.hypot(MILL_WIND.nx, MILL_WIND.ny);
const NX = MILL_WIND.nx / WN, NY = MILL_WIND.ny / WN;
const UX = NY, UY = -NX;                       // horizontale du plan des ailes
// Projection écran de U (par unité) : X = UX − UY, Y = (UX + UY)/2.
const USX = UX - UY, USY = (UX + UY) / 2;
// Lumière du plan des ailes (sa face avant regarde +N) : une constante.
const SAIL_I = lum(NX, NY, 0);

// Poses cuites sur une période de symétrie.
export const MILL_FRAMES = 12;

// ── Les modèles ──────────────────────────────────────────────────────────────
// hubH / hubOut : altitude du moyeu et saillie vers le vent ; sailR : rayon des
// ailes ; n : nombre d'ailes ; sails : leur facture.
// La TOISE : l'habitant fait 7-8 px au zoom 1, une porte 8. Un moulin domine sa
// campagne — plus haut qu'une maison, au niveau des grands arbres (premier jet à
// 24 px de tour : un jouet au pied des chênes) — et grandit avec les âges.
const MODELS = {
  post:    { hubH: 30, hubOut: 10.5, sailR: 21, n: 4, sails: 'cloth' },
  tower:   { hubH: 38.5, hubOut: 12.5, sailR: 26, n: 4, sails: 'cloth' },
  white:   { hubH: 42.5, hubOut: 13, sailR: 27, n: 4, sails: 'cloth' },
  smock:   { hubH: 48, hubOut: 11.5, sailR: 30, n: 4, sails: 'cloth' },
  brick:   { hubH: 53, hubOut: 13, sailR: 28, n: 4, sails: 'patent' },
  turbine: { hubH: 66, hubOut: 7.5, sailR: 31, n: 3, sails: 'blades' },
  cosmic:  { hubH: 66, hubOut: 7.5, sailR: 31, n: 3, sails: 'glow' },
};
export function millKind(band) {
  return band <= 1 ? 'post' : band === 2 ? 'tower' : band === 3 ? 'white' : band === 4 ? 'smock'
    : band === 5 ? 'brick' : band === 6 ? 'turbine' : 'cosmic';
}
function millModel(band) { return MODELS[millKind(band)]; }

// Chaume (calottes, toits de grange anciens), toile, enduit à la chaux, plâtre
// blanc des calottes industrielles, acier peint des éoliennes.
const THATCH = ['#c9a462', '#a5813f', '#7b5c2a', '#523b1a'];
const REED = ['#a99a72', '#8c7d58', '#6c6043', '#4d4430'];
const CLOTH = ['#efe4c8', '#dccfae', '#c0b08c', '#9a8a68'];
const LIME = ['#f4f0e6', '#e3ddcf', '#cbc3b2', '#aaa292', '#878071'];
const WHITE = ['#f6f7f8', '#e4e7ea', '#c9ced4', '#a6adb5', '#80878f'];
const SNOW = ['#f4f7fb', '#e3e9f1'];

function kitFor(K, roof) {
  return mats({ ...K, pal: { ...K.pal, roof: roof || THATCH } });
}
// Un toit qui tient la neige l'hiver (dessus et pans au soleil).
function snowy(K, col) {
  if (!K.snow) return col;
  return (I, ...r) => (I > 0.3 ? rgbOf(SNOW[I > 0.55 ? 0 : 1]) : col(I, ...r));
}

// Cadre d'un raster couvrant la boîte [x0,x1]×[y0,y1]×[h0,h1] du repère local.
function frameBox(x0, x1, y0, y1, h0, h1, pad = 2) {
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const h of [h0, h1]) {
    const X = x - y, Y = (x + y) / 2 - h;
    X0 = Math.min(X0, X); X1 = Math.max(X1, X); Y0 = Math.min(Y0, Y); Y1 = Math.max(Y1, Y);
  }
  const ox = Math.floor(X0) - pad, oy = Math.floor(Y0) - pad;
  return makeRaster(ox, oy, Math.ceil(X1) - ox + pad + 1, Math.ceil(Y1) - oy + pad + 1);
}

// ── Le sol du moulin ─────────────────────────────────────────────────────────
// Peint À PART (pas de contour : c'est du sol, pas un volume) et posé sous la tour :
// terre tassée aux âges anciens, mâchefer à la fonte, gravier à l'éolienne, dalle
// sombre aux âges cosmiques.
const GROUNDS = {
  dirt: ['#9a7a52', '#8a6c46', '#7a5e3c', '#6a5032'],
  cinder: ['#8a8076', '#776d64', '#655c54', '#544c45'],
  gravel: ['#b3afa6', '#a19c93', '#8c877e', '#78736b'],
  dark: ['#3b4250', '#323845', '#2a2f3a', '#22262f'],
};
export function bakeMillGround(band, seed = 0) {
  const pal = GROUNDS[band >= 7 ? 'dark' : band === 6 ? 'gravel' : band === 5 ? 'cinder' : 'dirt'];
  const R = frameBox(-20, 20, -20, 20, 0, 0, 1);
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      const X = R.ox + i + 0.5, Y = R.oy + j + 0.5;
      const x = Y + X / 2, y = Y - X / 2;               // sol (h = 0)
      // Une tache ovale qui s'effiloche : rayon modulé par un bruit d'angle.
      const a = Math.atan2(y, x), r = Math.hypot(x, y);
      const edge = 15 + 2.4 * Math.sin(a * 3 + seed) + 1.5 * Math.sin(a * 5 + seed * 2);
      if (r > edge) continue;
      // Bord : un pixel sur deux s'arrête (on fond dans l'herbe, pas de trait).
      if (r > edge - 1.6 && ((i + j) & 1)) continue;
      const n = h32(Math.floor(x), Math.floor(y), 41 + seed) % 9;
      put(R, i, j, rgbOf(pal[n === 0 ? 2 : n === 1 ? 0 : r > edge - 3 ? 2 : 1]));
    }
  }
  return R;
}

// Ouvertures d'un fût de révolution (porte au sud sous les ailes, jours étroits) :
// rend la couleur, ou null pour laisser la matière.
function openings(X, wood, doorH, wins) {
  const doorA = Math.PI / 2 - 0.25;
  return (h, a, rho) => {
    const da = Math.abs(a - doorA) * rho;
    if (h < doorH && da < 2.6) return h > doorH - 1.01 || da > 2.1 ? rgbOf(wood[3]) : rgbOf(wood[da < 0.7 ? 2 : 1]);
    for (const [wa, h0, h1, w] of wins) if (h >= h0 && h < h1 && Math.abs(a - wa) * rho < w) return X.win(0, h, true);
    return null;
  };
}
// Arbre moteur : du corps jusqu'au moyeu, face au vent.
function shaft(R, M, from, col) {
  line(R, [NX * from, NY * from, M.hubH], [NX * M.hubOut, NY * M.hubOut, M.hubH], col, 2);
}

// ── Les corps (statiques) ────────────────────────────────────────────────────
// Rend { R (raster), N (calque de nuit ou null) }.
export function bakeMillTower(K, band = 2) {
  const kind = millKind(band), M = MODELS[kind];
  switch (kind) {
    case 'post': return bakePost(K, M, band);
    case 'white': return bakeWhite(K, M);
    case 'smock': return bakeSmock(K, M);
    case 'brick': return bakeBrick(K, M);
    case 'turbine': return bakeTurbine(K, M, false);
    case 'cosmic': return bakeTurbine(K, M, true);
    default: return bakeStone(K, M);
  }
}

// Bande 2 — la tour de pierre (le pilote validé).
function bakeStone(K, M) {
  const X = kitFor(K), wood = X.P.wood;
  const r0 = 11.5, r1 = 9, H = 34, capR = 10.4, capH = 12;
  const R = frameBox(-r0 - 1, r0 + 1, -r0 - 1, M.hubOut + 3, 0, H + capH + 2);
  const op = openings(X, wood, 9, [[Math.PI / 4 + 0.15, 17, 21, 1.2], [Math.PI / 2 + 0.6, 25, 28, 1]]);
  revolve(R, 0, 0, 0, H, taper(0, H, r0, r1), (I, h, a, rho, cap) => (!cap && a != null && op(h, a, rho)) || X.stoneL(I, h, a, rho, cap));
  // Larmier de bois sous la calotte (la calotte tourne sur ce chemin de roulement).
  revolve(R, 0, 0, H - 0.5, H + 1.5, cyl(r1 + 1.6), (I) => pick(wood, I));
  revolve(R, 0, 0, H + 1.5, H + capH, taper(H + 1.5, H + capH, capR, 0.6), snowy(K, X.roofL));
  shaft(R, M, 3, wood[3]);
  pixelFinish(R, X.ink);
  return { R, N: nightOf(R, X) };
}

// Bandes 0-1 — le moulin PIVOT : une cabane de planches perchée sur un pivot, que
// le meunier tourne face au vent par la queue. Chevalet en croix, jambes de force.
function bakePost(K, M, band) {
  const X = kitFor(K, band === 0 ? THATCH : ['#a8875c', '#8a6c46', '#6a5236', '#4a3824']);
  const W = X.P.wood;
  const R = frameBox(-15, 15, -24, 14, 0, 46);
  const plank = (seed) => (f, u, hv, lit) => {
    const uu = Math.floor(u + 64);
    if (uu % 3 === 0) return rgbOf(W[lit ? 2 : 3]);                       // joint de planches
    const k = h32(Math.floor(uu / 3), seed, 9) % 5 === 0 ? 1 : 0;
    return rgbOf(W[Math.min(3, (lit ? 0 : 1) + k + (band === 0 ? 1 : 0))]);
  };
  const beam = (f, u, hv, lit) => rgbOf(W[lit ? 1 : 3]);
  // Chevalet : deux semelles en croix, quatre jambes de force, le pivot.
  box(R, -13, 13, -1.5, 1.5, 0, 2, beam, () => rgbOf(W[1]));
  box(R, -1.5, 1.5, -13, 13, 0, 2, beam, () => rgbOf(W[1]));
  for (const [ax, ay] of [[-10, 0], [10, 0], [0, -10], [0, 10]]) line(R, [ax, ay, 2], [0, 0, 12], W[3], 2);
  box(R, -1.8, 1.8, -1.8, 1.8, 0, 15, beam, () => rgbOf(W[2]));
  // Queue et échelle, à l'arrière (nord), jusqu'au sol.
  line(R, [-1.5, -10, 16], [-1.5, -21, 1], W[3], 1);
  line(R, [1.5, -10, 16], [1.5, -21, 1], W[3], 1);
  for (let k = 1; k < 6; k += 1) { const t = k / 6; line(R, [-1.5, -10 - 11 * t, 16 - 15 * t], [1.5, -10 - 11 * t, 16 - 15 * t], W[2], 1); }
  line(R, [0, -10, 22], [0, -23, 3], W[3], 2);
  // La cabane, puis son toit à deux pans (pignon au vent).
  box(R, -9, 9, -11, 8, 13, 33, (f, u, hv, lit) => {
    if (f === 'S' && hv >= 22 && hv < 26 && Math.abs(u - 3) < 1.6) return X.win(0, hv, true);
    if (f === 'E' && hv >= 16 && hv < 25 && Math.abs(u + 4) < 2) return rgbOf(W[3]);   // porte du meunier
    return plank(band)(f, u, hv, lit);
  }, null);
  gable(R, -10.2, 10.2, -12.2, 9.2, 33, 9, snowy(K, X.roofL), plank(band + 3), false);
  shaft(R, M, 6, W[3]);
  pixelFinish(R, X.ink);
  return { R, N: nightOf(R, X) };
}

// Bande 3 — la tour CHAULÉE : enduit blanc sur un soubassement de pierre, calotte
// d'ardoise (le toit de la couronne).
function bakeWhite(K, M) {
  const X = kitFor(K, K.pal.roof), wood = X.P.wood;
  const r0 = 12, r1 = 9.5, H = 38, capR = 11, capH = 13;
  const R = frameBox(-r0 - 1, r0 + 1, -r0 - 1, M.hubOut + 3, 0, H + capH + 2);
  const op = openings(X, wood, 9, [[Math.PI / 4 + 0.15, 18, 22, 1.2], [Math.PI / 2 + 0.6, 28, 31, 1], [Math.PI / 4 - 0.5, 28, 31, 1]]);
  revolve(R, 0, 0, 0, H, taper(0, H, r0, r1), (I, h, a, rho, cap) => {
    const o = !cap && a != null && op(h, a, rho);
    if (o) return o;
    if (h < 4) return X.stoneL(I, h, a, rho, cap);                       // soubassement
    const k = band5(I + (((Math.floor(h) + Math.floor((a || 0) * rho)) & 1) ? 0.03 : -0.03));
    return rgbOf(LIME[Math.min(4, k + (h32(Math.floor((a || 0) * rho), Math.floor(h / 2), 3) % 17 === 0 ? 1 : 0))]);
  });
  revolve(R, 0, 0, H - 0.5, H + 1.5, cyl(r1 + 1.8), (I) => pick(wood, I));
  revolve(R, 0, 0, H + 1.5, H + capH, taper(H + 1.5, H + capH, capR, 0.6), snowy(K, X.roofL));
  shaft(R, M, 3, wood[3]);
  pixelFinish(R, X.ink);
  return { R, N: nightOf(R, X) };
}

// Bande 4 — le moulin HOLLANDAIS : socle octogonal de pierre, balcon tout autour
// (le meunier y oriente la calotte et tend la toile), fût octogonal habillé de
// roseau, calotte en carène.
function bakeSmock(K, M) {
  const X = kitFor(K), wood = X.P.wood;
  const R = frameBox(-21, 21, -21, 21, 0, 58);
  const op = openings(X, wood, 9, [[Math.PI / 4 + 0.15, 6, 10, 1.4]]);
  revolve(R, 0, 0, 0, 14, taper(0, 14, 14.5, 13.5), (I, h, a, rho, cap) => (!cap && a != null && op(h, a, rho)) || X.stoneL(I, h, a, rho, cap), 8);
  // Balcon : plancher, garde-corps (moitié arrière avant le fût, avant après).
  // Un débord de 3 px sur le socle (premier jet à 5 : un chapeau de paille).
  revolve(R, 0, 0, 14, 15, cyl(16.5), (I, h, a, rho, cap) => rgbOf(wood[cap ? 0 : 2]));
  const rail = (I) => rgbOf(wood[I > 0.3 ? 1 : 2]);
  ring3d(R, [0, 0, 18], 16, 1, PLANE_H[0], PLANE_H[1], rail, 'back');
  // Fût de roseau, octogonal, avec deux fenêtres.
  const opB = openings(X, wood, 0, [[Math.PI / 2 - 0.2, 24, 28, 1.3], [Math.PI / 4 + 0.3, 34, 37, 1.1]]);
  revolve(R, 0, 0, 15.5, 44, taper(15.5, 44, 12, 7.5), (I, h, a, rho, cap) => {
    const o = !cap && a != null && opB(h, a, rho);
    if (o) return o;
    // Bottes de roseau : des rangs de 3 px, la lèvre de chaque rang au soleil.
    const k = band5(I), inRow = (Math.floor(h) + 999) % 3;
    return rgbOf(REED[Math.min(3, k + (inRow === 0 ? 1 : 0) - (inRow === 2 && k > 0 ? 1 : 0))]);
  }, 8);
  ring3d(R, [0, 0, 18], 16, 1, PLANE_H[0], PLANE_H[1], rail, 'front');
  for (let k = 0; k < 10; k += 1) {
    const a = (k / 10) * Math.PI * 2;
    if (Math.cos(a) + Math.sin(a) < -0.2) continue;                   // poteaux de l'avant
    line(R, [16 * Math.cos(a), 16 * Math.sin(a), 15], [16 * Math.cos(a), 16 * Math.sin(a), 18], wood[2], 1);
  }
  // Calotte en carène : un toit à deux pans court, faîtage au vent.
  gable(R, -7, 7, -8, 8, 44, 7, snowy(K, X.roofL), snowy(K, X.roofL), false);
  shaft(R, M, 6, wood[3]);
  pixelFinish(R, X.ink);
  return { R, N: nightOf(R, X) };
}

// Bande 5 — la tour de BRIQUE de l'âge industriel : galerie de fer, calotte en
// bulbe blanche, éventail (qui tourne seul la calotte face au vent).
function bakeBrick(K, M) {
  const X = kitFor(K), metal = ['#5f656d', '#474c53', '#33373d'];
  const r0 = 13, r1 = 9.5, H = 48;
  const R = frameBox(-r0 - 4, r0 + 4, -r0 - 16, M.hubOut + 3, 0, H + 16);
  const op = openings(X, ['#6b4a2c', '#5a3d24', '#47301c', '#33220f'], 10,
    [[Math.PI / 4 + 0.15, 17, 22, 1.4], [Math.PI / 2 + 0.6, 29, 33, 1.2], [Math.PI / 4 - 0.4, 38, 42, 1.2]]);
  // Galerie de fer à mi-hauteur. ⚠ Ordre : le fût SOUS la galerie, le plancher, puis
  // le fût AU-DESSUS — peint d'un seul tenant, le fût passait derrière le plancher
  // et le plancher se peignait devant le fût (un disque d'ardoise collé au milieu).
  const gallery = (I) => rgbOf(metal[I > 0.35 ? 0 : 1]);
  const prof = taper(0, H, r0, r1);
  const body = (I, h, a, rho, cap) => (!cap && a != null && op(h, a, rho)) || X.stoneL(I, h, a, rho, cap);
  revolve(R, 0, 0, 0, 21.5, prof, body);
  revolve(R, 0, 0, 21.5, 22.3, cyl(14), (I, h, a, rho, cap) => rgbOf(cap ? '#8a9098' : metal[2]));
  ring3d(R, [0, 0, 25], 13.6, 1, PLANE_H[0], PLANE_H[1], gallery, 'back');
  revolve(R, 0, 0, 22.3, H, prof, body);
  ring3d(R, [0, 0, 25], 13.6, 1, PLANE_H[0], PLANE_H[1], gallery, 'front');
  // Calotte en bulbe, épi au sommet.
  revolve(R, 0, 0, H - 0.5, H + 1, cyl(r1 + 1.5), (I) => pick(metal, I));
  revolve(R, 0, 0, H + 1, H + 11, (h) => (r1 + 0.8) * Math.sqrt(Math.max(0, 1 - ((h - H - 1) / 10) ** 2)) * (1 + 0.15 * Math.sin(((h - H - 1) / 10) * Math.PI)),
    (I) => (K.snow && I > 0.3 ? rgbOf(SNOW[0]) : pick(WHITE, I)));
  line(R, [0, 0, H + 10], [0, 0, H + 14], metal[1], 1);
  // L'éventail, à l'arrière : six palettes dans le plan qui contient le vent.
  const c = [-NX * 12, -NY * 12, H + 6];
  line(R, [-NX * 4, -NY * 4, H + 4], c, metal[1], 1);
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    const d = [NX * Math.cos(a) * 4.5, NY * Math.cos(a) * 4.5, Math.sin(a) * 4.5];
    line(R, c, [c[0] + d[0], c[1] + d[1], c[2] + d[2]], k % 2 ? '#e9e9e4' : '#b7bcc2', 1);
  }
  shaft(R, M, 3, metal[2]);
  pixelFinish(R, X.ink);
  return { R, N: nightOf(R, X) };
}

// Bande 6 — l'ÉOLIENNE ; aux âges cosmiques, le même pylône taillé dans le cristal
// de l'ère. Un feu d'aviation rouge (ou la lumière de l'ère) au sommet de la nacelle.
function bakeTurbine(K, M, cosmic) {
  const X = kitFor(K);
  const R = frameBox(-9, 9, -9, 12, 0, 72);
  const RAMP = cosmic ? K.pal.glassRamp : WHITE;
  const tone = (I) => rgbOf(RAMP[Math.min(RAMP.length - 1, band5(I))]);
  box(R, -7, 7, -7, 7, 0, 1.5, (f, u, hv, lit) => rgbOf(cosmic ? K.pal.stone[lit ? 3 : 5] : (lit ? '#a9a59c' : '#86827a')),
    () => rgbOf(cosmic ? K.pal.stone[2] : '#bdb9b0'));
  revolve(R, 0, 0, 1.5, 64, taper(1.5, 64, 3.4, 1.9), (I, h, a, rho) => {
    if (cosmic && Math.floor(h) % 12 === 6) return X.light(K.pal.glow);  // anneaux de lumière
    if (!cosmic && h < 3.5 && Math.abs(a - Math.PI / 2) * rho < 1) return rgbOf('#565b62');   // porte
    return tone(I);
  });
  box(R, -2.4, 2.4, -6, 4.5, 62.5, 67.5, (f, u, hv, lit) => tone(lit ? 0.45 : 0.15), () => tone(0.8));
  // Feu au sommet de la nacelle, marqué pour le calque de nuit (il garde sa couleur).
  const top = [0, -3, 68];
  const L = X.light(cosmic ? K.pal.glow : '#ff3b2e');
  const s = { X: top[0] - top[1], Y: (top[0] + top[1]) / 2 - 69 };
  put(R, Math.floor(s.X - R.ox), Math.floor(s.Y - R.oy), L);
  pixelFinish(R, X.ink);
  return { R, N: nightOf(R, X) };
}

// ── Les ailes (une pose) ─────────────────────────────────────────────────────
// Le plan des ailes passe par le moyeu ; un pixel d'écran se ramène au plan par
// une affinité exacte :
//   u = (X − Xm) / USX ;  w = u·USY − (Y − Ym)
// (u le long de l'horizontale du plan, w vers le haut), puis on tourne de −φ.
//   cloth   quatre vergues, châssis toilé du côté sous le vent
//   patent  quatre ailes à volets (lamelles claires et sombres), cadre gris
//   blades  trois pales effilées, nez de moyeu
//   glow    trois pales de lumière (marquées pour la nuit)
export function bakeMillSails(K, frame, band = 2) {
  const M = millModel(band), r = M.sailR, n = M.n;
  const phi = (frame / MILL_FRAMES) * ((Math.PI * 2) / n);
  const hx = NX * M.hubOut, hy = NY * M.hubOut;
  const Xm = hx - hy, Ym = (hx + hy) / 2 - M.hubH;
  const R = makeRaster(Math.floor(Xm - r * Math.abs(USX) - 3), Math.floor(Ym - r - r * Math.abs(USY) - 3),
    Math.ceil(2 * r * Math.abs(USX)) + 7, Math.ceil(2 * r + 2 * r * Math.abs(USY)) + 7);
  const W = K.pal.wood;
  // La face des ailes regarde le vent, donc l'œil et le soleil : la toile est
  // CLAIRE (un premier jet la prenait au cran de lumière du plan, beige terne —
  // les châssis se lisaient comme des échelles de bois).
  const bI = Math.max(0, band5(SAIL_I) - 2);
  const cloth = (k) => rgbOf(CLOTH[Math.max(0, Math.min(3, bI + k))]);
  const woodC = (k) => rgbOf(W[Math.max(0, Math.min(W.length - 1, 1 + k))]);
  const RAMP = M.sails === 'glow' ? K.pal.glassRamp : WHITE;
  const glowC = rgbOf(K.pal.glow);
  const arms = [];
  for (let k = 0; k < n; k += 1) { const a = phi + (k * Math.PI * 2) / n; arms.push([Math.cos(a), Math.sin(a)]); }
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      const X = R.ox + i + 0.5, Y = R.oy + j + 0.5;
      const u = (X - Xm) / USX, w = u * USY - (Y - Ym);
      if (u * u + w * w > (r + 1) * (r + 1)) continue;
      let col = null;
      for (const [c, s2] of arms) {
        // Repère de l'aile : s le long, q en travers (côté toile q > 0).
        const s = u * c + w * s2, q = -u * s2 + w * c;
        if (s < -0.5 || s > r) continue;
        if (M.sails === 'cloth') {
          if (Math.abs(q) < 0.75) { col = woodC(s > r - 1.5 ? 0 : 1); break; }       // vergue
          const sw = r * 0.3, s0 = r * 0.2;
          if (s >= s0 && s < r - 0.6 && q > 0 && q < sw) {
            // Toile tendue sur le châssis : longeron extérieur en bois, les barreaux
            // ne font qu'une couture plus sombre (tous les 4 px), et la toile se
            // creuse un peu le long de la vergue.
            if (q > sw - 0.9) col = woodC(1);
            else if (((s - s0) % 4.2) < 0.8) col = cloth(2);
            else col = cloth(q < 1.6 ? 1 : 0);
            break;
          }
        } else if (M.sails === 'patent') {
          if (Math.abs(q) < 0.8) { col = rgbOf('#5a5f66'); break; }                  // fouet
          const sw = r * 0.32, s0 = r * 0.16;
          if (s >= s0 && s < r - 0.5 && q > -sw * 0.32 && q < sw) {
            if (q > sw - 0.9 || q < -sw * 0.32 + 0.9 || s > r - 1.4) { col = rgbOf('#6d7278'); break; }
            col = rgbOf(Math.floor((s - s0) / 1.7) % 2 ? '#b7bcc2' : '#e6e6e1');       // volets
            break;
          }
        } else {
          // Pale effilée : bord d'attaque clair, bord de fuite plus sombre.
          if (s < 1.5) continue;
          const hw = 0.7 + 1.7 * (1 - s / r);
          if (q > -0.7 && q < hw) {
            if (M.sails === 'glow' && s > r * 0.35) col = [glowC[0], glowC[1], glowC[2], 253];
            else col = rgbOf(RAMP[q < hw * 0.4 ? 1 : 2]);
            break;
          }
        }
      }
      if (col) put(R, i, j, col);
    }
  }
  // Moyeu (bouton de bois, ou nez de l'éolienne).
  const hubC = M.sails === 'cloth' ? rgbOf(W[3]) : rgbOf(RAMP[1]);
  const big = M.n === 3 ? [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1], [-1, 1], [1, -1], [-2, 0]] : [[0, 0], [-1, 0], [0, -1], [-1, -1]];
  for (const [di, dj] of big) put(R, Math.floor(Xm - R.ox) + di, Math.floor(Ym - R.oy) + dj, hubC);
  pixelFinish(R, K.pal.stone[8], { grain: false });
  return R;
}
// Calque de nuit des ailes de lumière (âges cosmiques) : ce qui est marqué luit.
export function millSailsNight(R, K) {
  return nightOf(R, kitFor(K));
}

// Position de la tour dans le lot de la halle (px monde depuis son centre).
export function millTowerAt(size) {
  const half = (size * 32) / 2;
  return size >= 2 ? { x: -half * 0.3, y: half * 0.25 } : { x: 0, y: 0 };
}

// ── La halle (minoterie) : le moulin et son bâtiment de grain ────────────────
// Instance nº 0 du type, la seule qui grandit : sur 2 ou 3 cases, la tour se double
// d'un bâtiment au NORD-EST, contre elle (derrière la tour et à sa droite : les
// ailes, au sud, ne le cachent pas — premiers jets : au coin du lot, puis à
// l'ouest sous les ailes). Il change avec l'ère :
//   0-3  grange à colombages et torchis (chaume, ardoise à la couronne)
//   4    grange de pierre, tuiles
//   5    minoterie de brique à cheminée
//   6    silos de métal et hangar
//   7-9  silos de cristal cerclés de lumière
export function bakeMillBarn(K, size, band = 2) {
  const T = 32, half = (size * T) / 2;
  const R = frameBox(-half, half, -half, half, 0, 34, 2);
  const t = millTowerAt(size);
  const x0 = t.x + 6, x1 = Math.min(half - 2, x0 + 34);
  const y0 = t.y - 30, y1 = t.y - 10;
  const roofPal = band <= 1 || band === 2 ? THATCH : K.pal.roof;
  const X = kitFor(K, roofPal);
  if (band <= 4) {
    const wallH = 11;
    const tex = band === 4 ? X.stone(7) : (f, u, hv, lit) => {
      // Colombages : poteaux tous les 6 px, sablière en haut.
      if (hv >= wallH - 1 || ((Math.floor(u) % 6) === 0)) return X.wood(lit ? 1 : 2);
      return rgbOf(lit ? '#d9c8a4' : '#b3a07c');                                   // torchis
    };
    const door = (f, u, hv, lit) => (f === 'S' && hv < 7 && Math.abs(u - (x0 + x1) / 2) < 3.5 ? X.wood(3) : tex(f, u, hv, lit));
    box(R, x0, x1, y0, y1, 0, wallH, door, null);
    gable(R, x0 - 1, x1 + 1, y0 - 1, y1 + 1, wallH, 10, snowy(K, X.roofL), snowy(K, X.roofL), true);
  } else if (band === 5) {
    const wallH = 17;
    const win = (f, u, hv, lit) => {
      if (hv >= 5 && hv < 9 && (Math.floor(u + 64) % 7) < 2) return X.win(u, hv, lit);
      if (hv >= 11 && hv < 15 && (Math.floor(u + 64) % 7) < 2) return X.win(u, hv, lit);
      return X.stone(5)(f, u, hv, lit);
    };
    box(R, x0, x1, y0, y1, 0, wallH, win, null);
    gable(R, x0 - 1, x1 + 1, y0 - 1, y1 + 1, wallH, 7, snowy(K, X.roofL), snowy(K, X.roofL), true);
    box(R, x1 - 7, x1 - 3, y0 + 2, y0 + 6, wallH, wallH + 14, X.stone(9), () => rgbOf('#2b2622'));   // cheminée
  } else {
    const cosmic = band >= 7;
    const RAMP = cosmic ? K.pal.glassRamp : ['#d9dde1', '#bfc5cb', '#9ea5ad', '#7c838c'];
    const silo = (cx, cy, r, H) => {
      revolve(R, cx, cy, 0, H, cyl(r), (I, h) => (cosmic && Math.floor(h) % 9 === 4 ? X.light(K.pal.glow)
        : rgbOf(RAMP[Math.min(RAMP.length - 1, band5(I) + (Math.floor(h) % 4 === 0 ? 1 : 0))])));
      revolve(R, cx, cy, H, H + r * 0.7, taper(H, H + r * 0.7, r, 0.8), (I) => (K.snow && I > 0.3 ? rgbOf(SNOW[0]) : rgbOf(RAMP[Math.max(0, band5(I) - 1)])));
    };
    // Hangar bas, puis deux silos devant lui.
    box(R, x0 + 10, x1, y0, y0 + 10, 0, 8, (f, u, hv, lit) => rgbOf(RAMP[lit ? 1 : 2]), () => rgbOf(RAMP[1]));
    silo(x0 + 6, y1 - 6, 6, 24);
    silo(x0 + 19, y1 - 4, 5, 20);
  }
  pixelFinish(R, X.ink);
  return { R, N: nightOf(R, X) };
}
