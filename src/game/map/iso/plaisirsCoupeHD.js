"use strict";
// ── LA COUPE DES PLAISIRS, À LA GRILLE DES FILLES ────────────────────────────
//
// Retour de Raph, 2026-10-03 (soir), sur la coupe à la toise de 10 px : « les
// intérieurs et extérieurs font très cheap et pas pixel art ». Mesuré : la coupe
// s'affichait ~5× quand le sprite d'une fille s'affichait ~1,8× — des murs et des
// meubles aux pixels TROIS FOIS plus gros que les personnages, en aplats, avec des
// traits d'un pixel devenus des barres. Décision (« à la main, grille des filles ») :
//
//   UN PIXEL DE COUPE = UN PIXEL DE FILLE. Une fille fait ~27 px ; une salle 60 px
//   sous plafond, une table 14, un comptoir 16. Les personnages sont blités à
//   l'échelle entière du cadre (plus de redimension bancale : leurs pixels sont
//   égaux entre eux et égaux à ceux du décor).
//
// Et le décor est DESSINÉ : papier peint damassé au motif posé à la main, lambris à
// panneaux biseautés, cimaise et corniche dorées, parquet à chevrons, lustres et
// appliques en grilles de lettres, meubles ombrés en trois ou quatre tons, ombres de
// contact au sol, flaques de lumière TRAMÉES sous chaque lampe — pas un aplat.
//
// Contrat avec la vue (SalleCanvas) :
// { R, F, N, ids, spots, figures, levels, lights, W, H, waterY, roofTop, band,
//   motions, lift, waterHex, skyHex } + `hd` (les mesures propres à cette toise).
// Pilote : le FONTE (bande 5), validé ; puis les dix âges (styleHD).
import { makeRaster } from './isoPixelPaint.js';
import { plaisirsPlan, plaisirsProgramme } from './plaisirsPlan.js';
import { slotRow } from './plaisirsSlotsCoupe.js';
import {
  HD, LH, INK, bayer, mix, h32, painter, sym, piece, palOf, lightPool, FOOT, contactShadow, turnedLeg, BK, SD, FR,
} from './plaisirsHDKit.js';
import { flame } from './plaisirsEraRooms.js';
import { furnishEra } from './plaisirsEraFurnish.js';


// ── LE STYLE DU FONTE : la maison close Belle Époque ─────────────────────────
// Rampes du clair au sombre. La lumière vient du HAUT-GAUCHE (comme la carte).
const FONTE = {
  band: 5, kit: 'fonte',
  wood: ['#b8724a', '#94532f', '#743c22', '#542816', '#36180c'],          // acajou
  gold: ['#fff2b0', '#f0cf6a', '#d2a53e', '#9c7524', '#6d4c25'],
  velvet: ['#f08a7a', '#e0625a', '#c8434a', '#a2303e', '#7a2333', '#521827'],
  felt: ['#4aa070', '#2f7a52', '#22603f', '#16442c'],
  paper: ['#9a4a50', '#82383f', '#6e2a32', '#5c2129', '#48171e'],          // damas bordeaux
  iron: ['#8a909c', '#62676f', '#464b54', '#2f333b', '#1f2228'],
  glass: ['#f2f8fc', '#d4e8f4', '#a8c6dc', '#7898b2', '#506e88'],
  cream: ['#fffaf0', '#f4e8cc', '#e2d0a6', '#c4ae84', '#9a8660'],
  stone: ['#ece4d4', '#d8ccb6', '#bcae94', '#9c8e76', '#7a6e5a'],
  pink: ['#ffd6e4', '#ffb0c8', '#ff8aac', '#d8607e'],
  sky: ['#aab8c4', '#bcc8d0', '#ccd4d6', '#dcdfda', '#e6e4dc'],
  water: ['#6a8ea6', '#5a7e98', '#4a6c86', '#3c5a72', '#304a60'],
  haze: '#a39d96', hazeDark: '#8a847e',
  wall: 'damask', floor: 'parquet', ceil: 'coffer', light: 'gas', top: 'verriere', craft: 'balloon', circ: 'lift',
  found: 'iron', skyline: 'factories', decor: ['window', 'paintingSconces', 'mirror', 'paintingTall'], hall: ['palm', 'statue', 'coat'],
  hat: 'top', letters: true, register: true,
};
// ── LES GRILLES DESSINÉES À LA MAIN ──────────────────────────────────────────
// Le LUSTRE à gaz : chaîne, couronne, six bras en volute, tulipes, pampilles.
const CHANDELIER = sym([
  '............y',
  '............g',
  '............y',
  '............g',
  '...........yG',
  '..........gGH',
  '..zZz..z..yGG',
  '..zZz..g...gG',
  '..yGy..g...yG',
  '...gGggg...gG',
  '....yggGgggGH',
  '...c..yyGGGGG',
  '...b.......yG',
  '...........cG',
  '............b',
]);
// L'APPLIQUE à gaz : rosace, bras, tulipe de verre.
const SCONCE = [
  '...z...',
  '..zZz..',
  '.bBZBb.',
  '.bBzBb.',
  '..bnb..',
  '...G...',
  '..yGy..',
  '...g...',
  '...G...',
  '..gGg..',
  '.yGHGy.',
  '..yGy..',
  '...y...',
];
// La CAISSE ENREGISTREUSE de laiton.
const REGISTER = [
  '..yGGGGy..',
  '..gCkCkg..',
  '.yGGGGGGy.',
  '.gHgGgHgg.',
  'yGgHgGgHgy',
  'gGGGGGGGGg',
  'gyyyyyyyyg',
  'gGgGgGgGgg',
  'yyyyyyyyyy',
];
// Le MIROIR EN CŒUR du boudoir, cadre d'or.
const HEART = [
  '..ggg...ggg..',
  '.gHHGg.gHGGg.',
  'gHKKKGgGKKKGg',
  'gHKKKKGKKKQGg',
  'gGKKKKKKKKQGy',
  '.gGKKKKKKQGy.',
  '..gGKKKKQGy..',
  '...gGKKQGy...',
  '....gGQGy....',
  '.....gGy.....',
  '......y......',
];
// La TULIPE rose de la lampe du boudoir (abat-jour plissé).
const PINKLAMP = [
  '...KKKK...',
  '..KKQKKQ..',
  '.KQKKQKKQ.',
  'KQKKQKKQKQ',
  'OOOOOOOOOO',
  '....yG....',
  '....gG....',
  '....yG....',
  '....gG....',
  '....yG....',
  '...gGGg...',
  '..yGGGGy..',
];
// La BOUTEILLE de champagne dans son seau, et deux coupes.
const CHAMPAGNE = [
  '...M......',
  '...H......',
  '...m......',
  '..mMm.....',
  '..mLm...B.',
  '.IIIII.bBb',
  '.IiIiI..b.',
  '.iIiIi..b.',
  '..iii..bbb',
];
// Le PIANO DROIT du salon : caisse d'acajou, bougeoirs, clavier.
const PIANO = [
  '..z..............z..',
  '..g..............g..',
  '.yGy............yGy.',
  'uvvvvvvvvvvvvvvvvvvu',
  'vwWWWWWWWWWWWWWWWWwv',
  'vwvvvvvvvvvvvvvvvvwv',
  'vwvuuuuvvvvvvuuuuvwv',
  'vwvu..uvvGGvvu..uvwv',
  'vwvuuuuvvvvvvuuuuvwv',
  'vwvvvvvvvvvvvvvvvvwv',
  'UCkCkCCkCkCkCCkCkCCU',
  'UCCCCCCCCCCCCCCCCCCU',
  'uuuuuuuuuuuuuuuuuuuu',
  'vwvvvvvvvvvvvvvvvvwv',
  'vwv.............vwv.',
  'vwv.............vwv.',
  'vwvu...........uvwv.',
  'yGy.............yGy.',
];
// L'ÉTAGÈRE de flacons de la boutique : une rangée de marchandises (posée par
// étage, couleurs tirées).
const BOTTLES = [
  ['.H.', '.R.', 'RPR', 'RRr', 'rrr'],
  ['.H.', '.f.', 'fFf', 'fFf', 'eee'],
  ['G', 'z', 'z', 'x'],
  ['.y.', 'bBb', 'bBb', 'bnb'],
  ['GGG', 'gHg', 'ggg'],
  ['.k.', 'QKQ', 'QKQ', 'OOO'],
];

// ── Le ciel, la rive, l'eau ──────────────────────────────────────────────────
function paintSky(P, S, W, waterY) {
  const n = S.sky.length, bh = waterY / n;
  for (let y = 0; y < waterY; y += 1) {
    const k = Math.min(n - 1, Math.floor(y / bh)), d = (k + 1) * bh - y, t = k < n - 1 && d <= 4 ? (5 - d) / 6 : 0;
    for (let x = 0; x < W; x += 1) P.dith(x, y, S.sky[k], S.sky[Math.min(n - 1, k + 1)], t);
  }
  // Nuages : des amas modelés (clair en haut-gauche, une ombre dessous), pas des ronds.
  for (let k = 0; k < 6; k += 1) {
    const cx = 40 + (h32(k, 5, 1) % (W - 80)), cy = 16 + (h32(k, 5, 2) % 60), n2 = 3 + (h32(k, 3) % 3);
    for (let p = 0; p < n2; p += 1) {
      const px = cx + p * 9 - n2 * 4, r = 5 + (h32(k, p, 4) % 4);
      P.ellipse(px, cy - (p === 1 ? 3 : 0), r + 3, r - 1, (i, j) => (j > r - 4 ? S.sky[1] : i + j < -3 ? '#ffffff' : '#f4f2ee'));
    }
  }
}
// La rive d'en face : la ville industrielle de l'âge, en silhouettes pâlies.
function paintSkyline(P, S, W, waterY) {
  const base = waterY - 2;
  P.rect(0, base - 4, W, 4, '#8e9a86');
  P.hline(0, base - 4, W, '#a2ae98');
  for (let x = 0; x < W;) {
    const k = h32(x, 51, 5);
    const w = 14 + (k % 22), h = 10 + (k % 26);
    P.rect(x, base - 4 - h, w, h, S.haze);
    // Toits en dents de scie, fenêtres claires, cheminées et leur fumée.
    for (let i = 0; i < w; i += 6) for (let j = 0; j < 5; j += 1) P.put(x + i + j, base - 4 - h - (j < 3 ? j : 5 - j), S.hazeDark);
    for (let j = 4; j < h - 2; j += 5) for (let i = 2; i < w - 2; i += 4) P.put(x + i, base - 4 - h + j, '#c4c0b6');
    if (k % 3 !== 1) {
      const cxh = x + 3 + (k % Math.max(1, w - 6));
      P.rect(cxh, base - 4 - h - 18, 3, 18, S.hazeDark);
      P.hline(cxh - 1, base - 4 - h - 18, 5, '#7a746e');
      for (let j = 0; j < 16; j += 1) {
        const sx = cxh + 1 + Math.round(Math.sin(j * 0.5 + k) * 2) + (j >> 2);
        P.put(sx, base - 4 - h - 20 - j, j & 1 ? '#c8c4bc' : '#d6d2ca');
        if (j > 6) P.put(sx + 1, base - 4 - h - 20 - j, '#d6d2ca');
      }
    }
    x += w + 2 + (k % 5);
  }
}
function paintWater(P, S, W, waterY, H) {
  const n = S.water.length, bh = (H - waterY) / n;
  for (let y = waterY; y < H; y += 1) {
    const k = Math.min(n - 1, Math.floor((y - waterY) / bh)), d = (k + 1) * bh - (y - waterY), t = k < n - 1 && d <= 3 ? (4 - d) / 5 : 0;
    for (let x = 0; x < W; x += 1) P.dith(x, y, S.water[k], S.water[Math.min(n - 1, k + 1)], t);
  }
  for (let k = 0; k < 220; k += 1) {
    const y = waterY + 2 + (h32(k, 3, 9) % (H - waterY - 3)), x = h32(k, 5, 9) % W, w = 3 + (h32(k, 7, 9) % 9);
    P.hline(x, y, w, k % 4 === 0 ? '#c8dcea' : S.water[0]);
  }
}

// ── Les matières du salon ────────────────────────────────────────────────────
// Le MUR : corniche dorée à denticules, papier peint damassé (motif dessiné, en
// quinconce), cimaise, lambris d'acajou à panneaux biseautés, plinthe.
// Rend la couleur du pixel (x, y) du mur d'un salon dont le plafond est à y0 et le
// sol à y1.
const DAMASK = [                                          // le motif, 9 × 13
  '....a....',
  '...aba...',
  '..ab.ba..',
  '.a.aba.a.',
  'ab.aba.ba',
  '.a..a..a.',
  '..aabaa..',
  '...aba...',
  '..a.a.a..',
  '.a..a..a.',
  '....a....',
  '...a.a...',
  '....a....',
];
const WAINSCOT = 20, RAIL = 3, CROWN = 5;
function damaskAt(S, x, y, y0, y1) {
  const P = S.paper, Wd = S.wood, G = S.gold;
  const dy = y - y0, up = y1 - y;                          // depuis le plafond / jusqu'au sol
  if (dy < CROWN) {                                        // corniche
    if (dy === 0) return mix(G[4], INK, 0.4);
    if (dy === 1) return G[1];
    if (dy === 2) return (x % 4 < 2) ? G[2] : G[3];          // denticules
    if (dy === 3) return G[3];
    return mix(P[4], INK, 0.3);                              // l'ombre sous la corniche
  }
  if (up <= 3) return up === 1 ? Wd[4] : up === 3 ? Wd[2] : Wd[3];   // plinthe
  if (up <= WAINSCOT) {                                      // lambris
    const top = up === WAINSCOT, px = ((x % 26) + 26) % 26, py = WAINSCOT - up;
    if (top) return Wd[3];
    const inPanel = px >= 3 && px <= 22 && py >= 3 && py <= WAINSCOT - 6;
    if (!inPanel) return (px === 0 || px === 25) ? Wd[3] : Wd[2];
    if (py === 3 || px === 3) return Wd[3];                    // biseau dans l'ombre
    if (py === WAINSCOT - 6 || px === 22) return Wd[1];        // biseau dans la lumière
    if (py === 4 || px === 4) return Wd[1];
    return Wd[2];
  }
  if (up <= WAINSCOT + RAIL) {                               // cimaise
    const r = up - WAINSCOT;
    return r === RAIL ? G[1] : r === 2 ? G[2] : Wd[4];
  }
  // Le papier peint : fond, motif en quinconce, et l'ombre portée sous la corniche.
  const tx = 18, ty = 22, col = Math.floor(x / tx), row = Math.floor((dy + (col & 1) * 11) / ty);
  const mx = ((x % tx) + tx) % tx - 4, my = ((dy + (col & 1) * 11) % ty) - 4;
  void row;
  let c = P[2];
  if (mx >= 0 && mx < 9 && my >= 0 && my < 13) {
    const ch = DAMASK[my][mx];
    if (ch === 'a') c = P[1]; else if (ch === 'b') c = P[0];
  } else if (((x + dy) % 9 === 0) && (x % tx === 0)) c = P[3];
  if (dy === CROWN) c = mix(c, INK, 0.35);
  else if (dy === CROWN + 1) c = mix(c, INK, 0.18);
  return c;
}
// Le PARQUET à chevrons, vu un peu d'en haut (j : 0 au fond … FLOOR-1 au bord).
function parquetAt(S, x, j) {
  const Wd = S.wood;
  if (j === HD.FLOORD - 1) return Wd[4];                    // le chant du plancher
  if (j === HD.FLOORD - 2) return S.gold[3];                // sa baguette de laiton
  if (j < 3) {                                              // le fond, dans l'ombre
    const seam = ((x + j * 3) % 12 + 12) % 12 === 0;
    return seam ? Wd[4] : Wd[3];
  }
  const k = ((x + (j & 6) * 2) % 12 + 12) % 12, dir = Math.floor((x + 400) / 6) & 1;
  const seam = dir ? (k + j * 2) % 6 === 0 : (k - j * 2 + 60) % 6 === 0;
  if (seam) return Wd[3];
  const lane = Math.floor((x + 400) / 6) % 3;
  return lane === 0 ? Wd[1] : Wd[2];
}

function chandelier(P, N, pal, x, y) {                     // y = sous le plafond
  P.spr(x - 12, y, CHANDELIER, pal, false, 'zZ', N);
  P.mark(x, y + 8);
}
function sconce(P, N, pal, x, y) {
  P.spr(x - 3, y, SCONCE, pal, false, 'zZB', N);
  P.mark(x, y + 2);
}

// ── Le décor des murs ────────────────────────────────────────────────────────
// La BAIE sur la ville : arc de fonte, vitre (le ciel du dehors), rideaux de velours
// relevés en embrasses à glands d'or.
function windowBay(P, N, S, x, top, h) {
  // Au village et au Moyen Âge : une baie en plein cintre, ses volets de bois ouverts.
  if (S.kit === 'bois' || S.kit === 'pierre' || S.kit === 'couronne') { shutterWindow(P, S, x, top, h); return; }
  const w = 18, x0 = x - 9, G = S.gold, V = S.velvet, I = S.iron;
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
    const ax = i - 8.5, arc = j < 9 ? Math.sqrt(Math.max(0, 81 - (9 - j) * (9 - j))) : 9;
    if (Math.abs(ax) > arc) continue;
    const edge = Math.abs(ax) > arc - 1.5 || j === h - 1;
    const mull = i === 9 || (j > 9 && (j - 9) % 10 === 0);
    let c = edge || mull ? I[3] : j < h * 0.35 ? S.glass[1] : j < h * 0.7 ? S.glass[2] : S.glass[3];
    if (!edge && !mull && (i + j) % 11 === 0 && j < h * 0.6) c = S.glass[0];   // reflets
    P.put(x0 + i, top + j, c);
  }
  // Le rebord.
  P.hline(x0 - 2, top + h, w + 4, S.stone[1]); P.hline(x0 - 2, top + h + 1, w + 4, S.stone[3]);
  // Les rideaux relevés : pleins en haut, retenus aux deux tiers, évasés au sol.
  for (let j = -3; j < h + 6; j += 1) {
    const t = (j + 3) / (h + 9), cw = Math.round(t < 0.6 ? 6 - t * 5 : 3 + (t - 0.6) * 9);
    for (let i = 0; i < cw; i += 1) {
      const c = i === 0 ? V[1] : (i % 3 === 0 ? V[4] : V[2 + ((i + (j >> 3)) & 1)]);
      P.put(x0 - 4 + i, top + j, c);
      P.put(x0 + w + 3 - i, top + j, i === 0 ? V[3] : c);
    }
  }
  const ty = top + Math.round((h + 9) * 0.6) - 3;
  for (const tx of [x0 - 3, x0 + w + 2]) { P.put(tx, ty, G[1]); P.put(tx, ty + 1, G[2]); P.put(tx, ty + 2, G[3]); }
  // La cantonnière, galon d'or.
  P.rect(x0 - 5, top - 5, w + 10, 3, V[2]); P.hline(x0 - 5, top - 5, w + 10, V[1]);
  for (let i = 0; i < w + 10; i += 1) P.put(x0 - 5 + i, top - 2, i % 2 ? G[1] : G[3]);
  void N;
}
// La baie à VOLETS (Bois, Pierre, Couronne) : tableau de pierre ou de bois, le ciel par
// l'ouverture (au Moyen Âge, un vitrail losangé), deux volets ouverts contre le mur.
function shutterWindow(P, S, x, top, h) {
  const w = 14, x0 = x - 7, Wd = S.wood, St = S.stone, lead = S.kit === 'couronne';
  for (let j = -1; j <= h; j += 1) for (let i = -1; i <= w; i += 1) {
    const arc = j < 7 ? Math.sqrt(Math.max(0, 49 - (7 - j) * (7 - j))) : 7, ax = i - 6.5;
    if (Math.abs(ax) > arc + 1) continue;
    const edge = Math.abs(ax) > arc - 0.5 || j === h || j === -1;
    let c = edge ? (S.kit === 'bois' ? Wd[3] : St[3]) : j < h * 0.45 ? S.sky[1] : S.sky[2];
    if (!edge && lead && (((i + j) % 4 === 0) || ((i - j + 40) % 4 === 0))) c = '#4a4a52';
    if (!edge && lead && c !== '#4a4a52') c = j < h * 0.5 ? '#c8dce8' : '#a8c4d8';
    P.put(x0 + i, top + j, c);
  }
  for (const [sx, s0] of [[x0 - 7, 1], [x0 + w + 1, -1]]) for (let j = 0; j < h - 1; j += 1) for (let i = 0; i < 6; i += 1) {
    const c = (j % 5 === 0) ? Wd[3] : i === (s0 > 0 ? 0 : 5) ? Wd[1] : Wd[2];
    P.put(sx + i, top + 1 + j, (i === 2 || i === 3) && j % 5 === 2 ? Wd[4] : c);
  }
  P.hline(x0 - 2, top + h + 1, w + 4, St[1]); P.hline(x0 - 2, top + h + 2, w + 4, St[3]);
}
// Un TABLEAU dans un cadre doré (paysage, portrait, nature morte).
function painting(P, S, x, y, w, h, k) {
  const G = S.gold;
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
    const e = Math.min(i, j, w - 1 - i, h - 1 - j);
    if (e === 0) P.put(x + i, y + j, i === 0 || j === 0 ? G[1] : G[3]);
    else if (e === 1) P.put(x + i, y + j, i === 1 || j === 1 ? G[2] : G[4]);
  }
  const ix = x + 2, iy = y + 2, iw = w - 4, ih = h - 4;
  const kind = k % 3;
  for (let j = 0; j < ih; j += 1) for (let i = 0; i < iw; i += 1) {
    let c;
    if (kind === 0) {                                       // paysage du soir
      const hz = Math.round(ih * 0.55) + Math.round(Math.sin(i * 0.5 + k) * 1.2);
      c = j < hz ? (j < ih * 0.25 ? '#e8b48a' : '#f2cc96') : (j < hz + 2 ? '#5a7a4a' : '#45603a');
      if (j >= hz && (i + j) % 5 === 0) c = '#6a8a52';
    } else if (kind === 1) {                                 // portrait d'une dame
      const dx = i - iw / 2, dy = j - ih * 0.38;
      c = '#3a2a30';
      if (dx * dx / 4 + dy * dy / 6 < 1.6) c = '#f2c8a4';
      if (j < ih * 0.3 && Math.abs(dx) < 3) c = '#8a3a20';
      if (j > ih * 0.6 && Math.abs(dx) < iw * 0.4) c = '#c8434a';
    } else {                                                 // nature morte : fruits
      c = j > ih * 0.7 ? '#6e4a2a' : '#4a3a3a';
      const fruits = [[0.3, 0.6, '#d8404a'], [0.55, 0.62, '#e8b040'], [0.72, 0.58, '#7aa040']];
      for (const [fx, fy, fc] of fruits) if ((i - iw * fx) ** 2 + (j - ih * fy) ** 2 < 4.5) c = fc;
    }
    P.put(ix + i, iy + j, c);
  }
}
// Le MIROIR ovale au cadre doré.
function ovalMirror(P, S, x, y) {
  const G = S.gold;
  P.ellipse(x, y, 7, 10, (i, j) => {
    const q = (i * i) / 49 + (j * j) / 100;
    if (q > 0.72) return i + j < 0 ? G[1] : q > 0.9 ? G[3] : G[2];
    return i < -2 && j < -2 ? S.glass[0] : (i + j) % 7 === 0 ? S.glass[1] : S.glass[2];
  });
  P.put(x, y - 11, G[1]); P.put(x - 1, y - 11, G[2]); P.put(x + 1, y - 11, G[2]);
}
// L'ENSEIGNE du lieu : plaque émaillée verte, filet d'or, pictogramme.
const ICONS = {
  des: ['CCCCC.....', 'CkCCC.....', 'CCkCC.CCCC', 'CCCkC.CkCC', 'CCCCC.CCCC', '......CCkC', '......CCCC'],
  cartes: ['..CCCC....', '.CCCCCC...', 'CCCCCC1C..', 'CCCC11CC..', '.CCC1CCC..', '..CCCCC...', '...CCC....'],
  tickets: ['CCCCCCCCC.', 'C1C1C1CCC.', 'CCCCCCCkC.', 'C1C1C1CCC.', 'CCCCCCCCC.'],
  boutique: ['...G...', '...G...', '..CCC..', '.CCCCC.', '.C1C1C.', '.CCCCC.', '..CCC..'],
  salon: ['CCCCCCC', '.CzzzC.', '..CzC..', '...C...', '...C...', '..CCC..'],
  boudoir: ['.QQ.QQ.', 'QKQQQQQ', 'QQQQQQQ', '.QQQQQ.', '..QQQ..', '...Q...'],
};
function roomSign(P, N, S, pal, id, x, y) {                // y = sous la corniche
  const ic = ICONS[id];
  if (!ic) return;
  const iw = ic[0].length, ih = ic.length, pw = iw + 8, ph = ih + 6;
  const x0 = Math.round(x - pw / 2), y0 = y + 3;
  P.put(x0 + 2, y, S.gold[3]); P.put(x0 + 2, y + 1, S.gold[2]); P.put(x0 + 2, y + 2, S.gold[3]);
  P.put(x0 + pw - 3, y, S.gold[3]); P.put(x0 + pw - 3, y + 1, S.gold[2]); P.put(x0 + pw - 3, y + 2, S.gold[3]);
  const kit = S.kit || 'fonte';
  const look = kit === 'fonte' ? { bg: ['#2a6a4a', '#1f5a3c'], rim: [S.gold[1], S.gold[3]], ink: null }
    : kit === 'marbre' ? { bg: ['#fbf8f2', '#ece6da'], rim: ['#e8b878', '#9a6a32'], ink: '#5a1a1a' }
      : kit === 'neon' ? { bg: ['#1e1218', '#160c12'], rim: [S.neon, '#a02a66'], ink: S.neon, lit: true }
        : kit === 'cosmic' ? { bg: [mix(S.glow2, INK, 0.55), mix(S.glow2, INK, 0.65)], rim: [S.glow, S.glow2], ink: '#ffffff', lit: true }
          : { bg: [S.wood[1], S.wood[2]], rim: [S.wood[0], S.wood[3]], ink: '#2a1a12' };
  for (let j = 0; j < ph; j += 1) for (let i = 0; i < pw; i += 1) {
    const e = Math.min(i, j, pw - 1 - i, ph - 1 - j);
    const c = e === 0 ? INK : e === 1 ? (i === 1 || j === 1 ? look.rim[0] : look.rim[1]) : (j < 4 ? look.bg[0] : look.bg[1]);
    P.put(x0 + i, y0 + j, c);
    if (look.lit && e === 1) N.put(x0 + i, y0 + j, look.rim[0]);
  }
  // Le pictogramme : peint (bois, marbre), émaillé (Fonte), allumé (Néon, cosmiques).
  const icPal = look.ink ? { ...pal, C: look.ink, Q: look.ink, K: look.ink, 1: kit === 'neon' ? '#ffffff' : '#c83a3a' } : pal;
  P.spr(x0 + 4, y0 + 3, ic, icPal, false, look.lit || kit === 'fonte' ? 'CQK1' : '', N);
  if (kit !== 'fonte' && kit !== 'neon' && kit !== 'cosmic') { P.put(x0 + 1, y0 + 1, S.gold[2]); P.put(x0 + pw - 2, y0 + 1, S.gold[2]); }
}

// ── Le mobilier, à la toise des filles ───────────────────────────────────────
// LA TABLE DE DÉS : rebord matelassé, tapis vert à la ligne de passe, dés, jetons.
function diceTable(F, R, S, x, y) {
  const w = 74, x0 = x - 37, yb = y + FOOT, Wd = S.wood, G = S.gold, Fe = S.felt;
  contactShadow(R, x0 + 2, x0 + w - 3, yb + 1);
  piece(F, x0, yb - 16, w, 17, (P) => {
    P.hline(x0 + 2, yb - 16, w - 4, Wd[1]);                  // le rebord du fond
    P.hline(x0 + 1, yb - 15, w - 2, Wd[2]);
    for (let j = 0; j < 3; j += 1) for (let i = 2; i < w - 2; i += 1) {   // le tapis
      let c = j === 0 ? Fe[2] : Fe[1];
      if (j === 1 && i > 6 && i < w - 6 && i % 3 === 0) c = S.cream[2];   // la ligne de passe
      if (j === 2 && i < 10) c = Fe[0];
      P.put(x0 + i, yb - 14 + j, c);
    }
    // Deux dés, des piles de jetons, le râteau du croupier.
    for (const [dx, pip] of [[-8, 1], [-4, 0]]) { P.rect(x0 + 37 + dx, yb - 14, 2, 2, '#f6efd8'); P.put(x0 + 37 + dx + pip, yb - 14 + pip, INK); }
    [[12, '1', 3], [15, '2', 2], [18, '3', 3], [-22, '4', 2], [-19, '5', 3]].forEach(([dx, ch, n]) => {
      const c = palOf(S)[ch];
      for (let k = 0; k < n; k += 1) { P.put(x0 + 37 + dx, yb - 13 - k, c); P.put(x0 + 38 + dx, yb - 13 - k, k === n - 1 ? '#ffffff' : c); }
    });
    for (let t = 0; t < 9; t += 1) P.put(x0 + 37 - 30 + t, yb - 13 - (t >> 2), Wd[0]);
    // Le rebord avant, matelassé de cuir, et son galon clouté.
    P.hline(x0, yb - 11, w, Wd[0]); P.hline(x0, yb - 10, w, Wd[1]);
    for (let i = 0; i < w; i += 1) P.put(x0 + i, yb - 9, i % 3 === 1 ? G[0] : G[2]);
    // La ceinture, ses panneaux à losange d'or.
    for (let j = 0; j < 5; j += 1) for (let i = 1; i < w - 1; i += 1) {
      const px = (i - 1) % 18, inP = px >= 2 && px <= 15 && j >= 1 && j <= 3;
      let c = j === 4 ? Wd[3] : Wd[2];
      if (inP) c = (j === 1 || px === 2) ? Wd[3] : (j === 3 || px === 15) ? Wd[1] : Wd[2];
      if (inP && px === 9 && j === 2) c = G[1];
      P.put(x0 + i, yb - 8 + j, c);
    }
    for (const lx of [3, 35, 68]) turnedLeg(P, S, x0 + lx, yb - 3, yb);
  });
}
// LA TABLE DE VINGT-ET-UN : demi-lune, accoudoir de cuir, boîte à jetons, sabot.
function cardTable(F, R, S, x, y) {
  const w = 68, x0 = x - 34, yb = y + FOOT, Wd = S.wood, G = S.gold, Fe = S.felt;
  contactShadow(R, x0 + 4, x0 + w - 5, yb + 1);
  piece(F, x0, yb - 15, w, 16, (P) => {
    const rows = [[10, Wd[1]], [6, Fe[2]], [3, Fe[1]], [1, Fe[1]], [0, Fe[0]]];
    rows.forEach(([inset, c], j) => P.hline(x0 + inset, yb - 15 + j, w - inset * 2, c));
    // La boîte à jetons du croupier (au fond), le sabot, les cercles de mise, des cartes.
    for (let i = 0; i < 14; i += 1) { const c = palOf(S)['12345'[Math.floor(i / 3) % 5]]; P.put(x - 7 + i, yb - 14, c); P.put(x - 7 + i, yb - 13, i % 3 === 2 ? Fe[2] : c); }
    P.rect(x + 12, yb - 15, 5, 3, Wd[2]); P.hline(x + 12, yb - 15, 5, Wd[1]); P.put(x + 16, yb - 13, '#f6efd8');
    for (const dx of [-24, -12, 0, 12, 24]) {
      P.put(x + dx - 1, yb - 11, S.cream[2]); P.put(x + dx + 1, yb - 11, S.cream[2]); P.put(x + dx, yb - 12, S.cream[2]);
    }
    for (const [dx, red] of [[-22, 1], [-10, 0], [11, 1], [23, 0]]) { P.rect(x + dx, yb - 13, 2, 2, '#fbf6e8'); P.put(x + dx + 1, yb - 13, red ? '#d8404a' : INK); }
    // L'accoudoir de cuir capitonné, puis la ceinture et son galon.
    for (let i = 0; i < w; i += 1) { P.put(x0 + i, yb - 10, i % 6 === 3 ? '#3a2a2a' : '#5a3a34'); P.put(x0 + i, yb - 9, '#3a2626'); }
    for (let i = 0; i < w; i += 1) P.put(x0 + i, yb - 8, i % 4 === 1 ? G[0] : G[2]);
    for (let j = 0; j < 4; j += 1) P.hline(x0 + 2, yb - 7 + j, w - 4, j === 3 ? Wd[3] : j === 0 ? Wd[1] : Wd[2]);
    for (const lx of [6, w - 9]) turnedLeg(P, S, x0 + lx, yb - 3, yb);
  });
}
// LE COMPTOIR : plateau mouluré, panneaux, galon. `grille` : la grille de laiton du
// guichet, qui monte devant le guichetier (on le voit derrière ses barreaux).
function counter(F, R, S, x, y, w, grille = false) {
  const x0 = Math.round(x - w / 2), yb = y + FOOT, Wd = S.wood, G = S.gold;
  contactShadow(R, x0 + 1, x0 + w - 2, yb + 1);
  const gh = grille ? 11 : 0;
  piece(F, x0 - 1, yb - 17 - gh, w + 2, 18 + gh, (P) => {
    P.hline(x0 - 1, yb - 17, w + 2, Wd[0]); P.hline(x0 - 1, yb - 16, w + 2, Wd[1]); P.hline(x0, yb - 15, w, Wd[3]);
    for (let j = 0; j < 14; j += 1) for (let i = 0; i < w; i += 1) {
      const px = i % 14, inP = px >= 2 && px <= 11 && j >= 2 && j <= 10;
      let c = j >= 12 ? Wd[3] : Wd[2];
      if (inP) c = (j === 2 || px === 2) ? Wd[3] : (j === 10 || px === 11) ? Wd[1] : Wd[2];
      if (j === 0) c = i % 3 === 1 ? G[0] : G[2];
      P.put(x0 + i, yb - 14 + j, c);
    }
    if (grille) {
      const gw = Math.min(w - 6, 30), gx = Math.round(x - gw / 2);
      P.hline(gx - 1, yb - 17 - gh, gw + 2, G[1]); P.hline(gx - 1, yb - 16 - gh, gw + 2, G[3]);
      for (let i = 0; i < gw; i += 3) {
        if (Math.abs(gx + i - x) < 5) continue;               // le guichet ouvert
        P.vline(gx + i, yb - 15 - gh, gh - 1, G[2]); P.put(gx + i, yb - 15 - gh, G[0]);
      }
      P.hline(gx + Math.floor(gw / 2) - 4, yb - 18, 9, G[2]);
    }
  });
}
// LES RAYONNAGES de la boutique : armoire d'acajou à fronton doré, quatre rayons.
function shelves(O, R, S, pal, x, y, w) {
  const x0 = Math.round(x - w / 2), top = y - 44, Wd = S.wood, G = S.gold;
  piece(O, x0, top - 4, w, 46, (P) => {
    // Le fronton.
    for (let i = 0; i < w; i += 1) {
      const a = Math.round(4 - 4 * Math.pow((i - w / 2) / (w / 2), 2));
      for (let j = 0; j <= a; j += 1) P.put(x0 + i, top - j, j === a ? G[1] : G[2]);
    }
    P.rect(x0, top, w, 44, Wd[3]); P.vline(x0, top, 44, Wd[2]); P.vline(x0 + w - 1, top, 44, Wd[4]);
    P.rect(x0 + 3, top + 2, w - 6, 40, '#2a1610');
    for (let r = 0; r < 4; r += 1) {
      const sy = top + 11 + r * 10;
      P.hline(x0 + 2, sy, w - 4, Wd[1]); P.hline(x0 + 2, sy + 1, w - 4, Wd[3]);
      for (let i = 4; i < w - 6;) {
        const b = BOTTLES[h32(i, r, x) % BOTTLES.length], bw = b[0].length;
        if (h32(i, r, 7) % 7 === 0) { i += 3; continue; }
        P.spr(x0 + i, sy - b.length, b, pal);
        i += bw + 1;
      }
    }
    P.hline(x0, top + 43, w, Wd[4]);
  });
}
// LE KIOSQUE de la loterie : auvent festonné, enseigne, planches d'affiches.
function lotteryKiosk(O, S, pal, x, y) {
  const w = 52, x0 = x - 26, top = y - 46, V = S.velvet, G = S.gold, Wd = S.wood;
  piece(O, x0 - 3, top - 2, w + 6, 48, (P) => {
    P.rect(x0, top + 8, w, 38, Wd[2]);
    for (let i = 0; i < w; i += 1) if (i % 8 === 0) P.vline(x0 + i, top + 8, 38, Wd[3]);
    P.rect(x0 + 4, top + 16, w - 8, 22, '#1e1418');                  // le fond du guichet
    // L'enseigne LOTERIE, lettres d'or sur émail vert.
    P.rect(x0 + 2, top + 8, w - 4, 7, S.letters ? '#1f5a3c' : Wd[1]); P.hline(x0 + 2, top + 8, w - 4, G[2]); P.hline(x0 + 2, top + 14, w - 4, G[3]);
    const LETTERS = { L: ['x..', 'x..', 'x..', 'xxx'], O: ['xxx', 'x.x', 'x.x', 'xxx'], T: ['xxx', '.x.', '.x.', '.x.'], E: ['xxx', 'xx.', 'x..', 'xxx'], R: ['xx.', 'x.x', 'xx.', 'x.x'], I: ['x', 'x', 'x', 'x'] };
    let lx = x0 + 6;
    if (S.letters) for (const ch of 'LOTERIE') { const g = LETTERS[ch]; g.forEach((row, j) => [...row].forEach((v, i) => { if (v === 'x') P.put(lx + i, top + 10 + j, G[1]); })); lx += g[0].length + 1; }
    // L'auvent festonné rayé.
    for (let i = -3; i < w + 3; i += 1) {
      const k = Math.floor((i + 3) / 6), s = ((i + 3) % 6) / 6, d = 3 + Math.round(3 * Math.sin(s * Math.PI));
      for (let j = 0; j < d + 4; j += 1) P.put(x0 + i, top + j, j === d + 3 ? (k & 1 ? S.cream[3] : V[4]) : k & 1 ? S.cream[1] : V[2]);
    }
    P.hline(x0 - 3, top - 1, w + 6, G[1]); P.hline(x0 - 3, top, w + 6, G[3]);
    // Les billets épinglés.
    for (const [dx, dy] of [[6, 20], [13, 22], [36, 19], [42, 23]]) { P.rect(x0 + dx, top + dy, 5, 3, '#f6efd8'); P.put(x0 + dx + 1, top + dy + 1, V[2]); P.put(x0 + dx + 3, top + dy + 1, V[2]); }
  });
}
// LE TAMBOUR de loterie : chevalet, cage de laiton hexagonale, boules, manivelle.
function lotteryDrum(O, R, S, x, y) {
  const yb = y + FOOT - 1, G = S.gold, Wd = S.wood;
  contactShadow(R, x - 9, x + 9, yb + 1);
  piece(O, x - 11, yb - 26, 24, 27, (P) => {
    for (let j = 0; j < 12; j += 1) { P.put(x - 8 + (j >> 1), yb - j, Wd[2]); P.put(x - 7 + (j >> 1), yb - j, Wd[1]); P.put(x + 8 - (j >> 1), yb - j, Wd[3]); P.put(x + 7 - (j >> 1), yb - j, Wd[2]); }
    P.hline(x - 6, yb - 4, 13, Wd[2]);
    for (let j = 0; j < 13; j += 1) {
      const half = 9 - Math.abs(j - 6) * 0.5;
      for (let i = -Math.round(half); i <= Math.round(half); i += 1) {
        const edge = Math.abs(i) >= Math.round(half) - 0 || j === 0 || j === 12;
        const bar = i % 3 === 0 || j % 4 === 0;
        P.put(x + i, yb - 25 + j, edge ? G[3] : bar ? (j < 5 ? G[1] : G[2]) : null);
      }
    }
    for (const [dx, dy, c] of [[-4, 8, '#d8404a'], [2, 9, '#f6efd8'], [-1, 10, '#3a6ad8'], [4, 10, '#e8b040'], [-5, 10, '#f6efd8']]) { P.put(x + dx, yb - 25 + dy, c); P.put(x + dx + 1, yb - 25 + dy, c); }
    P.put(x + 10, yb - 19, G[2]); P.put(x + 11, yb - 19, G[2]); P.put(x + 11, yb - 18, G[2]); P.put(x + 11, yb - 17, Wd[1]); P.put(x + 12, yb - 17, Wd[1]);
  });
}
// LA SCÈNE : cadre de scène doré, rideaux de velours en embrasses, toile de fond (un
// jardin la nuit), estrade et feux de rampe.
function stage(O, N, R, S, x0, x1, y0, y) {
  const w = x1 - x0, V = S.velvet, G = S.gold, Wd = S.wood;
  const top = y0 + 6, plat = y - 1;
  // La toile de fond.
  for (let j = top; j < plat; j += 1) for (let i = x0 + 4; i < x1 - 4; i += 1) {
    const t = (j - top) / (plat - top);
    let c = t < 0.5 ? '#2a2448' : t < 0.8 ? '#33305a' : '#28304a';
    const hill = plat - 10 - Math.round(Math.sin((i - x0) * 0.09) * 3 + Math.sin((i - x0) * 0.21) * 2);
    if (j > hill) c = '#1e2a2a';
    if ((i - x0 - Math.round(w * 0.7)) ** 2 + (j - top - 10) ** 2 < 16) c = (i + j) % 3 ? '#f6ecc8' : '#e8dcb0';
    if (h32(i, j, 3) % 97 === 0 && j < hill - 6) c = '#f6ecc8';
    O.put(i, j, c);
  }
  // Les arbres découpés de la toile.
  for (const fx of [0.18, 0.36, 0.84]) {
    const tx = Math.round(x0 + w * fx);
    O.ellipse(tx, plat - 18, 6, 8, (i, j) => (i + j < -4 ? '#2e4440' : '#22343a'));
    O.vline(tx, plat - 10, 9, '#2a2020');
  }
  // L'estrade, son nez d'acajou et ses feux de rampe (des coquilles de laiton).
  piece(R, x0 + 2, plat - 1, w - 4, 8, (P) => {
    P.rect(x0 + 2, plat - 1, w - 4, 2, Wd[1]); P.hline(x0 + 2, plat - 1, w - 4, Wd[0]);
    P.rect(x0 + 2, plat + 1, w - 4, 6, Wd[3]);
    for (let i = x0 + 6; i < x1 - 6; i += 10) { P.rect(i, plat + 2, 4, 2, G[2]); P.hline(i, plat + 2, 4, G[1]); P.put(i + 1, plat + 1, '#ffe9a0'); P.put(i + 2, plat + 1, '#fffbe8'); N.put(i + 1, plat + 1, '#ffe9a0'); N.put(i + 2, plat + 1, '#fffbe8'); }
    for (let i = x0 + 2; i < x1 - 2; i += 1) if (i % 8 === 0) P.vline(i, plat + 4, 3, Wd[4]);
  });
  // Les rideaux relevés : plis (rampe de velours), retenus par une embrasse d'or.
  const ch = plat - top;
  for (let j = 0; j < ch; j += 1) {
    const t = j / ch, cw = Math.max(4, Math.round(w * 0.2 * (t < 0.58 ? 1 - t * 0.85 : 0.5 + (t - 0.58) * 1.1)));
    for (let i = 0; i < cw; i += 1) {
      const fold = (i + Math.round(t * 2)) % 5, c = fold === 0 ? V[4] : fold === 1 ? V[1] : fold === 4 ? V[3] : V[2];
      O.put(x0 + 4 + i, top + j, i === cw - 1 ? V[4] : c);
      O.put(x1 - 5 - i, top + j, i === cw - 1 ? V[5] : c);
    }
  }
  const ty = top + Math.round(ch * 0.58);
  for (const [tx, s] of [[x0 + 4 + Math.round(w * 0.2 * 0.5), 1], [x1 - 5 - Math.round(w * 0.2 * 0.5), -1]]) {
    O.rect(tx - 1, ty - 1, 3, 3, G[1]); O.put(tx, ty + 2, G[2]); O.put(tx, ty + 3, G[2]); O.put(tx - s, ty + 4, G[3]); O.put(tx, ty + 4, G[2]); O.put(tx + s, ty + 4, G[3]);
  }
  // Le cadre de scène : pilastres dorés et lambrequin festonné à franges.
  for (const px of [x0, x1 - 4]) for (let j = y0; j < plat; j += 1) for (let i = 0; i < 4; i += 1) O.put(px + i, j, i === 0 ? G[1] : i === 3 ? G[4] : j % 6 === 0 ? G[3] : G[2]);
  for (let i = x0; i < x1; i += 1) {
    const s = ((i - x0) % 12) / 12, d = 4 + Math.round(4 * Math.sin(s * Math.PI));
    for (let j = 0; j < d + 6; j += 1) O.put(i, y0 + j, j < 3 ? (j === 0 ? G[1] : G[2]) : j === d + 5 ? G[1] : j === d + 4 ? G[3] : V[j < 6 ? 1 : 2]);
  }
}
// LA MÉRIDIENNE de velours, son bois doré.
function chaise(O, R, S, x, y) {
  const yb = y + FOOT - 1, V = S.velvet, G = S.gold;
  contactShadow(R, x - 15, x + 15, yb + 1);
  piece(O, x - 17, yb - 15, 34, 16, (P) => {
    // Le dossier enroulé (à gauche), le coussin, l'accotoir.
    for (let j = 0; j < 12; j += 1) for (let i = 0; i < 6 - Math.max(0, j - 8); i += 1) P.put(x - 16 + i, yb - 14 + j, i === 0 ? V[1] : i > 3 ? V[3] : V[2]);
    P.ellipse(x - 13, yb - 14, 3, 2, (i, j) => (i + j < 0 ? V[1] : V[3]));
    for (let j = 0; j < 4; j += 1) P.hline(x - 11, yb - 8 + j, 27, j === 0 ? V[0] : j === 1 ? V[1] : j === 2 ? V[2] : V[3]);
    for (let i = -10; i < 16; i += 5) P.put(x + i, yb - 6, V[4]);   // capitons
    P.hline(x - 15, yb - 4, 31, G[1]); P.hline(x - 15, yb - 3, 31, G[3]);
    for (const lx of [-14, 13]) { P.vline(x + lx, yb - 2, 3, G[2]); P.put(x + lx + 1, yb, G[3]); }
  });
}
// LE GUÉRIDON au champagne et la LAMPE ROSE.
function champagneTable(O, N, R, S, pal, x, y) {
  const yb = y + FOOT - 1, G = S.gold;
  contactShadow(R, x - 6, x + 6, yb + 1);
  piece(O, x - 7, yb - 12, 14, 13, (P) => {
    P.hline(x - 6, yb - 12, 13, S.stone[0]); P.hline(x - 6, yb - 11, 13, S.stone[2]);
    P.vline(x, yb - 10, 9, G[2]); P.vline(x + 1, yb - 10, 9, G[3]);
    P.hline(x - 4, yb, 10, G[2]); P.put(x - 4, yb - 1, G[1]); P.put(x + 5, yb - 1, G[3]);
  });
  O.spr(x - 9, yb - 21, CHAMPAGNE, pal);
  O.spr(x - 1, yb - 24, PINKLAMP, pal, false, 'KQ', N);
  O.mark(x + 4, yb - 21, '#ff9ab8');
}
// L'ALCÔVE : niche sombre, lit à tête de laiton, lambrequin à franges ; fermée, sa
// TENTURE s'allume par-derrière.
//
// ── LES OMBRES DE LA TENTURE (animées) ───────────────────────────────────────
// Raph, 2026-10-03 : « il faut que ça bouge, l'ombre : soit une fille seule, on voit
// ses formes et elle aguiche avec une jambe qui bouge ; soit quand il y a un homme, une
// petite animation. » Deux scènes en OMBRE CHINOISE, rien d'explicite :
//   · SEULE : de profil, la main derrière la tête, elle lève lentement la jambe ;
//   · À DEUX (quand l'hôtesse a mené son client derrière la tenture) : ils se
//     rapprochent, s'embrassent, elle lève le pied derrière elle, il la renverse.
// Silhouettes construites sur un SQUELETTE (une pose par image), en volumes pleins :
// hanches, taille, buste, tête et chignon, membres effilés. La vue joue les images
// (SalleCanvas), choisit la scène selon le manège, et les peint PAR-DESSUS la nuit.
const SIL = { w: 40, h: 40 };
function silMask() { return new Uint8Array(SIL.w * SIL.h); }
const SOX = SIL.w / 2, SOY = SIL.h - 1;                      // les pieds, au centre en bas
function sFill(m, test, x0, y0, x1, y1) {
  for (let py = Math.max(0, Math.floor(SOY + y0)); py <= Math.min(SIL.h - 1, Math.ceil(SOY + y1)); py += 1) {
    for (let px = Math.max(0, Math.floor(SOX + x0)); px <= Math.min(SIL.w - 1, Math.ceil(SOX + x1)); px += 1) {
      if (test(px + 0.5 - SOX, py + 0.5 - SOY)) m[py * SIL.w + px] = 1;
    }
  }
}
function sDisc(m, [cx, cy], rx, ry) {
  sFill(m, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, cx - rx, cy - ry, cx + rx, cy + ry);
}
// Un membre effilé : segment de rayon `ra` en A à `rb` en B.
function sCap(m, [ax, ay], [bx, by], ra, rb = ra) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  sFill(m, (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    const qx = ax + dx * t - x, qy = ay + dy * t - y;
    return qx * qx + qy * qy <= (ra + (rb - ra) * t) ** 2;
  }, Math.min(ax, bx) - Math.max(ra, rb), Math.min(ay, by) - Math.max(ra, rb), Math.max(ax, bx) + Math.max(ra, rb), Math.max(ay, by) + Math.max(ra, rb));
}
// Le repère du buste : `u` monte le long du dos, `v` va vers l'avant (f = +1 : elle
// regarde à droite). `lean` > 0 : penché en ARRIÈRE.
function frameOf(hip, f, lean) {
  const s = Math.sin(lean), c = Math.cos(lean);
  const u = [-f * s, -c], v = [f * c, -s];
  return (k, fw) => [hip[0] + u[0] * k + v[0] * fw, hip[1] + u[1] * k + v[1] * fw];
}
// ELLE. `leg` : [genou, pied] de la jambe avant, relatifs à la hanche (avant, bas) ;
// `pop` : le pied arrière levé (le baiser) ; `arm` : 'tete' (main derrière la tête),
// 'haut' (les deux bras levés), 'bas' (les mains glissent le long de la jambe avant),
// 'gant' (un bras levé, le bas qui pend de la main), ou un point [x, y] où poser la
// main (la nuque de l'homme). `o.legB` : la jambe arrière [genou, pied] comme `leg`
// (sinon : d'appui, ou levée au baiser) ; `o.cheveux` : 'libres' (le chignon défait).
function woman(m, bx, f, lean, leg, pop, arm, o = {}) {
  const hy = -11.5, hip = [bx, hy], P = frameOf(hip, f, lean);
  // Des courbes EXAGÉRÉES : à 30 px, une silhouette réaliste se lit comme un bâton.
  sDisc(m, P(0.4, -0.6), 4.3, 3.3);                           // les hanches
  sDisc(m, P(0.6, -2.7), 2.8, 2.6);                           // la croupe
  sCap(m, P(1.4, 0.2), P(5.2, 0.4), 3.0, 1.6);                // la taille de guêpe
  sCap(m, P(5.2, 0.4), P(9.4, 0), 1.7, 2.5);
  sDisc(m, P(7.9, 2.7), 2.9, 2.5);                            // la gorge, en avant
  sCap(m, P(10.4, 0.3), P(12.2, 0.6), 0.9);                   // le cou
  sDisc(m, P(14.2, 0.7), 2.3, 2.6);                           // la tête
  sDisc(m, P(14, 3), 0.6, 0.6);                               // le nez
  if (o.cheveux === 'libres') {
    // Le chignon défait : la chevelure tombe jusqu'aux reins.
    sCap(m, P(15.6, -1.4), P(11.4, -2.6), 1.9, 1.7);
    sCap(m, P(11.4, -2.6), P(6.4, -3.4), 1.7, 1.0);
  } else {
    sCap(m, P(15.4, -1.6), P(9.8, -2.9), 1.7, 1.1);           // la chevelure dans le dos
    sDisc(m, P(16.3, -1.2), 1.6, 1.5);                        // le chignon
    sCap(m, P(16.8, -0.2), P(18.6, 1.2), 0.5);                // la plume
  }
  // La jambe d'appui (ou levée derrière, au baiser ; ou posée à la demande).
  let kb, ab, tb;
  if (o.legB) {
    kb = [bx + f * o.legB[0][0], hy + o.legB[0][1]]; ab = [bx + f * o.legB[1][0], hy + o.legB[1][1]];
    tb = o.legB[1][1] > 10 ? [ab[0] + f * 2.3, 0] : [ab[0] + (ab[0] - kb[0]) * 0.35, ab[1] + (ab[1] - kb[1]) * 0.35];
  } else {
    kb = pop ? [bx - f * 2.2, -5.6] : [bx - f * 1.4, -5.6]; ab = pop ? [bx - f * 6, -7.6] : [bx - f * 1.6, -1];
    tb = pop ? [ab[0] - f * 1.6, ab[1] - 1.4] : [ab[0] + f * 2.3, 0];
  }
  sCap(m, [bx - f * 1.2, -10.5], kb, 2.6, 1.4);
  sCap(m, kb, ab, 1.3, 0.8);
  sCap(m, ab, tb, 0.7);
  // La jambe avant.
  const k = [bx + f * leg[0][0], hip[1] + leg[0][1]], a = [bx + f * leg[1][0], hip[1] + leg[1][1]];
  sCap(m, [bx + f * 1.0, -10.5], k, 2.6, 1.4);
  sCap(m, k, a, 1.3, 0.8);
  const toe = leg[1][1] > 10 ? [a[0] + f * 2.3, 0] : [a[0] + (a[0] - k[0]) * 0.35, a[1] + (a[1] - k[1]) * 0.35];
  sCap(m, a, toe, 0.7);
  // Les bras.
  const sh = P(9.6, -0.6);
  if (arm === 'tete') {
    const el = P(13.6, -3.6);
    sCap(m, sh, el, 1.0, 0.8); sCap(m, el, P(15.2, -1.6), 0.8, 0.7);
    const sf = P(9.4, 0.8), hand = [(hip[0] + k[0]) / 2 + f * 0.6, (hip[1] + k[1]) / 2 - 0.6];
    sCap(m, sf, [(sf[0] + hand[0]) / 2 + f * 1.6, (sf[1] + hand[1]) / 2], 0.9, 0.8);
    sCap(m, [(sf[0] + hand[0]) / 2 + f * 1.6, (sf[1] + hand[1]) / 2], hand, 0.8, 0.7);
  } else if (arm === 'haut') {
    // Les deux bras levés au-dessus de la tête, les mains jointes.
    const mains = P(19.6, 0.4);
    for (const [s0, e0] of [[sh, P(15.6, -4.6)], [P(9.4, 0.8), P(15.8, 5.0)]]) { sCap(m, s0, e0, 1.0, 0.8); sCap(m, e0, mains, 0.8, 0.6); }
  } else if (arm === 'bas') {
    // Penchée sur la jambe avant : les deux mains y glissent (le bas qu'on roule).
    const main1 = [(k[0] + a[0]) / 2, (k[1] + a[1]) / 2], main2 = [a[0] - f * 0.4, a[1] - 0.6];
    for (const [s0, hd] of [[sh, main1], [P(9.4, 0.8), main2]]) {
      const el = [(s0[0] + hd[0]) / 2 + f * 0.8, (s0[1] + hd[1]) / 2 + 0.4];
      sCap(m, s0, el, 1.0, 0.8); sCap(m, el, hd, 0.8, 0.6);
    }
  } else if (arm === 'gant') {
    // Un bras levé haut devant elle, le bas qui pend de la main ; l'autre main à la hanche.
    const el = P(12.8, 4.2), hd = P(15.6, 6.4);
    sCap(m, sh, el, 1.0, 0.8); sCap(m, el, hd, 0.8, 0.6);
    const b1 = [hd[0] + f * 1.6, hd[1] + 2.6], b2 = [hd[0] + f * 0.6, hd[1] + 5.4], b3 = [hd[0] + f * 1.8, hd[1] + 7.6];
    sCap(m, hd, b1, 0.5); sCap(m, b1, b2, 0.5, 0.45); sCap(m, b2, b3, 0.45, 0.6);
    const sf = P(9.4, 0.8), hp = P(1.6, 3.4);
    sCap(m, sf, [(sf[0] + hp[0]) / 2 + f * 2.2, (sf[1] + hp[1]) / 2], 0.9, 0.8);
    sCap(m, [(sf[0] + hp[0]) / 2 + f * 2.2, (sf[1] + hp[1]) / 2], hp, 0.8, 0.7);
  } else if (arm) {
    const el = [(sh[0] + arm[0]) / 2, Math.min(sh[1], arm[1]) - 1.5];
    sCap(m, sh, el, 0.9, 0.8); sCap(m, el, arm, 0.8, 0.7);
  }
}
// Le TABOURET où elle pose le pied (le bas qu'on roule) : assise et deux pieds.
function tabouret(m, x, top) {
  sCap(m, [x - 2.6, top], [x + 2.6, top], 0.8);
  for (const d of [-2, 2]) sCap(m, [x + d, top], [x + d * 1.3, 0], 0.5);
}
// LUI : plus grand, épaules larges, haut-de-forme ; ses mains à la taille de sa belle.
function man(m, bx, f, lean, hand, hat = 'top') {
  const hip = [bx, -13.5], P = frameOf(hip, f, lean);
  sCap(m, P(0, -0.3), P(3, 0), 2.7, 2.6);
  sCap(m, P(3, 0), P(10.6, 0.2), 2.9, 3.4);
  sDisc(m, P(10.8, -0.2), 3.5, 1.7);                          // les épaules
  sCap(m, P(11.8, 0.4), P(13.4, 0.6), 1.1);
  sDisc(m, P(15.4, 0.7), 2.4, 2.8);
  sDisc(m, P(15.2, 3.2), 0.6, 0.7);
  if (hat === 'top') {
    sCap(m, P(17.5, -3.6), P(17.5, 3.8), 0.6);                // le bord du chapeau
    sCap(m, P(18, 0.1), P(22.4, 0.1), 2.3, 2.5);              // sa forme
  } else sDisc(m, P(16.6, -0.6), 1.8, 1.6);                  // les cheveux
  for (const d of [-0.9, 0.9]) {                               // les jambes, le pantalon
    const kn = [bx + f * d * 0.4, -6.8], an = [bx + f * d * 0.6, -1];
    sCap(m, [bx + f * d, -12.5], kn, 2.0, 1.5); sCap(m, kn, an, 1.5, 1.1);
    sCap(m, an, [an[0] + f * 3, -0.2], 0.9, 0.8);
  }
  const sh = P(10.6, 1.4), el = [(sh[0] + hand[0]) / 2 + f * 0.4, (sh[1] + hand[1]) / 2 + 1.6];
  sCap(m, sh, el, 1.2, 1.0); sCap(m, el, hand, 1.0, 0.9);
}
// Les jambes avant de la danse lente (genou, pied ; avant, bas — depuis la hanche).
const TEASE = [
  [[1.4, 5.6], [1.6, 10.5]],
  [[2.6, 4.8], [1.8, 9.6]],
  [[4.8, 2.4], [3.8, 7.4]],
  [[6.2, 0.6], [10, -1.6]],
  [[6, -1.8], [9.6, -7.6]],
];
const _shadows = new Map();
export function shadowFrames(hat = 'top') {
  if (_shadows.has(hat)) return _shadows.get(hat);
  // SEULE : la jambe monte, se tend, redescend ; la hanche ondule à peine.
  const solo = TEASE.map((leg, i) => { const m = silMask(); woman(m, -1, 1, 0.04 + (i % 2) * 0.03, leg, false, 'tete'); return m; });
  // À DEUX : rapprochés, le baiser, le pied levé, le renversé.
  const pose = (bw, bm, lw, lm, pop, legI) => {
    const m = silMask();
    const neck = frameOf([bm, -13.5], -1, lm)(12.6, 0.4);
    woman(m, bw, 1, lw, TEASE[legI], pop, [neck[0] - 0.6, neck[1] + 0.4]);
    const waist = frameOf([bw, -11.5], 1, lw)(4.6, -1.4);
    man(m, bm, -1, lm, waist, hat);
    return m;
  };
  const couple = [pose(-6, 6, 0, 0, false, 0), pose(-4.6, 4.6, 0.05, -0.12, false, 0), pose(-4, 3.8, 0.14, -0.24, true, 0), pose(-3.8, 3.6, 0.42, -0.36, false, 1)];
  // LE NUMÉRO BURLESQUE (Raph, 2026-10-04 : « la luxure, pousse l'idée au max » —
  // toujours en ombre chinoise, rien d'explicite) : le pied sur le tabouret, elle roule
  // son bas (penchée, les mains glissent du genou à la cheville), le fait tourner au
  // bout du bras, puis se cambre, bras levés, le chignon défait.
  const surTabouret = [[4.6, 0.6], [5.0, 6.6]];
  const numero = [
    (m) => { tabouret(m, -1 + 5.6, -5); woman(m, -1, 1, -0.32, surTabouret, false, 'bas'); },
    (m) => { tabouret(m, -1 + 5.6, -5); woman(m, -1, 1, -0.5, surTabouret, false, 'bas'); },
    (m) => woman(m, -1, 1, 0.06, TEASE[1], false, 'gant'),
    (m) => woman(m, -1, 1, 0.3, TEASE[0], false, 'haut', { cheveux: 'libres' }),
  ].map((draw) => { const m = silMask(); draw(m); return m; });
  solo.push(...numero);
  // À DEUX, la suite : il passe DERRIÈRE elle, les mains à ses hanches, elle se laisse
  // aller contre lui, un bras à sa nuque ; puis, face à face, elle enroule une jambe
  // autour de lui.
  const derriere = (() => {
    const m = silMask(), bw = 3.2, bm = -3.6, lw = 0.14, lm = -0.16;
    const nuque = frameOf([bm, -13.5], 1, lm)(12.8, 0.6);
    woman(m, bw, 1, lw, TEASE[1], false, nuque, { cheveux: 'libres' });
    man(m, bm, 1, lm, frameOf([bw, -11.5], 1, lw)(0.8, 2.2), hat);
    return m;
  })();
  const enlace = (haut) => {
    const m = silMask(), bw = -3.4, bm = 3.4, lw = 0.2, lm = -0.18;
    const neck = frameOf([bm, -13.5], -1, lm)(12.6, 0.4);
    const jambe = haut ? [[6.0, -1.6], [12.2, 1.4]] : [[4.6, 1.8], [8.6, 5.8]];
    woman(m, bw, 1, lw, jambe, false, [neck[0] - 0.6, neck[1] + 0.4], { cheveux: 'libres' });
    man(m, bm, -1, lm, [bw + jambe[0][0] * 0.8, -11.5 + jambe[0][1] + 0.6], hat);
    return m;
  };
  couple.push(derriere, enlace(false), enlace(true));
  const out = {
    w: SIL.w, h: SIL.h, solo, couple,
    // Seule : la jambe qui monte (0-4), puis le bas roulé (5-6), tourné (7), la cambrure (8).
    soloSeq: [0, 0, 1, 2, 3, 4, 4, 4, 3, 2, 1, 0, 5, 5, 6, 6, 6, 5, 5, 7, 7, 7, 7, 8, 8, 8, 8, 8, 0], soloMs: 230,
    // À deux : l'approche, le baiser, le renversé (0-3), puis derrière elle (4), la jambe
    // enroulée (5-6).
    coupleSeq: [0, 1, 1, 2, 2, 2, 3, 3, 3, 2, 1, 4, 4, 4, 4, 1, 5, 6, 6, 6, 6, 5, 1, 0], coupleMs: 380,
  };
  _shadows.set(hat, out);
  return out;
}
function alcove(O, F, N, R, S, x, y, closed) {
  const V = S.velvet, G = S.gold, top = y - HD.WALLH + 8, w = 50, x0 = x - 25;
  for (let j = top; j < y + 2; j += 1) for (let i = x0; i < x0 + w; i += 1) O.put(i, j, mix(V[5], INK, 0.35 + (j - top) / (y - top) * 0.1));
  // Le lit : tête de laiton, oreillers, drap, couvre-lit.
  piece(O, x - 20, y - 20, 40, 22, (P) => {
    for (let i = 0; i < 9; i += 1) P.vline(x - 19 + i * 2, y - 19 + (i === 0 || i === 8 ? 0 : 3), 16 - (i === 0 || i === 8 ? 0 : 3), i % 4 === 0 ? G[2] : G[1]);
    P.hline(x - 19, y - 19, 17, G[1]); P.hline(x - 18, y - 16, 15, G[2]);
    P.rect(x - 16, y - 10, 9, 4, '#fff0f4'); P.hline(x - 16, y - 10, 9, '#ffffff'); P.put(x - 16, y - 7, '#f0c8d4');
    P.rect(x - 17, y - 6, 36, 2, '#f8eee4');
    P.rect(x - 17, y - 4, 36, 5, V[2]); P.hline(x - 17, y - 4, 36, V[1]); P.hline(x - 17, y, 36, V[4]);
    for (let i = -14; i < 18; i += 6) P.put(x + i, y - 2, V[3]);
  });
  contactShadow(R, x - 18, x + 18, y + 2);
  // Le lambrequin, galon et franges d'or.
  piece(F, x0 - 2, top - 4, w + 4, 8, (P) => {
    P.rect(x0 - 2, top - 4, w + 4, 5, V[2]); P.hline(x0 - 2, top - 4, w + 4, V[1]); P.hline(x0 - 2, top, w + 4, V[4]);
    for (let i = 0; i < w + 4; i += 1) { P.put(x0 - 2 + i, top + 1, i % 2 ? G[1] : G[3]); if (i % 3 === 0) P.put(x0 - 2 + i, top + 2, G[2]); }
  }, { ink: null });
  if (closed) {
    // La TENTURE tirée, jusqu'AU SOL (des souliers dépassaient dessous, 2026-10-03),
    // éclairée par-derrière : elle s'allume la nuit, et les ombres s'y enlacent.
    for (let j = top + 1; j < y + HD.FLOORD - 4; j += 1) for (let i = x0; i < x0 + w; i += 1) {
      const fold = (i - x0) % 6, glow = 1 - Math.abs((i - x) / 25) * 0.5;
      const c = fold === 0 ? '#d8805a' : fold === 3 ? '#ffd0a8' : glow > 0.8 ? '#ffc496' : '#f6ae82';
      F.put(i, j, c); N.put(i, j, c);
    }
    // Les OMBRES qui s'y animent sont peintes par la vue (shadowFrames).
    N.mark(x, y - 18, '#ff9ab8');
  } else {
    // Rideaux relevés en embrasses.
    for (let j = top + 1; j < y + 3; j += 1) {
      const t = (j - top) / (y - top), cw = t < 0.55 ? 7 - Math.round(t * 6) : 3 + Math.round((t - 0.55) * 8);
      for (let i = 0; i < cw; i += 1) {
        const c = V[1 + ((i + 1) % 3)];
        F.put(x0 + i, j, i === cw - 1 ? V[4] : c); F.put(x0 + w - 1 - i, j, i === cw - 1 ? V[5] : c);
      }
    }
  }
}
// LE PARAVENT à trois feuilles peintes (des iris).
function screen3(O, R, S, x, y) {
  const yb = y + FOOT - 1, G = S.gold;
  contactShadow(R, x - 15, x + 15, yb + 1);
  piece(O, x - 16, yb - 32, 33, 33, (P) => {
    for (let k = 0; k < 3; k += 1) {
      const px = x - 16 + k * 11;
      P.rect(px, yb - 32, 11, 32, G[2]); P.vline(px, yb - 32, 32, G[1]); P.vline(px + 10, yb - 32, 32, G[3]);
      P.rect(px + 1, yb - 30, 9, 26, k === 1 ? '#f4e6d0' : '#ecdcc0');
      for (let j = 0; j < 26; j += 1) for (let i = 0; i < 9; i += 1) {
        const stem = i === 4 - (j > 14 ? 1 : 0) && j > 8;
        const petal = (i - 4) ** 2 + (j - 7 - k * 2) ** 2 < 5;
        if (stem) P.put(px + 1 + i, yb - 30 + j, '#5a8a48');
        if (petal) P.put(px + 1 + i, yb - 30 + j, k === 1 ? '#c8608a' : '#8a6ac8');
        if (stem && j % 6 === 0) P.put(px + 1 + i + 1, yb - 30 + j - 1, '#7aaa58');
      }
      P.hline(px, yb - 3, 11, G[3]);
    }
  });
}
// LA PLANTE du hall : un palmier en jardinière de faïence.
function palm(O, R, S, x, y) {
  const yb = y + FOOT - 1;
  contactShadow(R, x - 6, x + 6, yb + 1);
  piece(O, x - 16, yb - 40, 33, 41, (P) => {
    // La jardinière bleue et blanche.
    for (let j = 0; j < 10; j += 1) {
      const half = j < 2 ? 7 : 6 - (j > 6 ? 1 : 0);
      for (let i = -half; i <= half; i += 1) {
        const c = j < 2 ? (i < -3 ? '#ffffff' : '#e4eaf0') : (Math.abs(i) + j) % 4 === 0 ? '#5a7ab8' : i < -2 ? '#f2f6fa' : '#d4dce8';
        P.put(x + i, yb - 9 + j, c);
      }
    }
    // Le stipe, puis les palmes : courbes de deux pixels, folioles en dents.
    for (let j = 0; j < 12; j += 1) { P.put(x, yb - 10 - j, j % 3 ? '#7a5a30' : '#5a3e1e'); P.put(x + 1, yb - 10 - j, '#5a3e1e'); }
    const fronds = [[-1, 0.9, 14], [1, 0.95, 14], [-1, 0.45, 13], [1, 0.4, 13], [-1, 0.15, 10], [1, 0.1, 11], [0, 0, 9]];
    for (const [s, lift, len] of fronds) {
      for (let t = 0; t <= len; t += 1) {
        const u = t / len;
        const fx = s === 0 ? x + 0.5 + u * u * 3 : x + 0.5 + s * t;
        const fy = s === 0 ? yb - 22 - t : yb - 22 - Math.round(lift * 12 * Math.sin(u * Math.PI * 0.75) - u * u * 7);
        const c = u < 0.4 ? '#4a8a3e' : '#62a24e';
        P.put(Math.round(fx), fy, c);
        if (t % 2 === 0 && t > 1) { P.put(Math.round(fx), fy + 1, '#3f7a3a'); P.put(Math.round(fx), fy + 2, u > 0.5 ? '#285428' : '#3f7a3a'); }
        if (t % 2 === 1 && t > 2) P.put(Math.round(fx), fy - 1, '#9ad070');
      }
    }
  });
}
// LA STATUE de bronze sur sa colonne de marbre (une nymphe, bras levé).
function statue(O, R, S, x, y) {
  const yb = y + FOOT - 1, St = S.stone;
  contactShadow(R, x - 6, x + 6, yb + 1);
  piece(O, x - 7, yb - 40, 15, 41, (P) => {
    P.rect(x - 5, yb - 14, 11, 15, St[1]); P.vline(x - 5, yb - 14, 15, St[0]); P.vline(x + 5, yb - 14, 15, St[3]);
    P.hline(x - 6, yb - 15, 13, St[0]); P.hline(x - 6, yb - 14, 13, St[2]); P.hline(x - 6, yb, 13, St[3]);
    for (let j = 0; j < 12; j += 3) P.put(x - 2 + (j % 5), yb - 12 + j, St[2]);
    const B = ['#d8aa66', '#9a6c38', '#5e3e1e'];
    const fig = [
      '....kB....', '...kBb....', '...kbb....', '.B.kbb....', '.Bbbbbb...', '..bbbbbk..', '...bbbbk..', '...bbbs...',
      '...bbbs...', '..bbbbs...', '..bbbbss..', '..bbbbss..', '..bbb.ss..', '..bbb.sss.', '..bb..ss..', '..bb..s...',
      '..bb..s...', '..bb..s...', '.bbb.ss...', '.bbbbsss..', '.sssssss..',
    ];
    P.spr(x - 5, yb - 36, fig, { B: B[0], b: B[1], s: B[2], k: B[0] });
  });
}
// LE VESTIAIRE : portemanteau de bois tourné, chapeaux et manteaux.
function coatRack(O, R, S, x, y) {
  const yb = y + FOOT - 1, Wd = S.wood, V = S.velvet;
  contactShadow(R, x - 5, x + 5, yb + 1);
  piece(O, x - 7, yb - 32, 15, 33, (P) => {
    P.vline(x, yb - 31, 31, Wd[1]); P.vline(x + 1, yb - 31, 31, Wd[3]);
    for (const [dx, dy] of [[-4, 0], [-3, 1], [4, 0], [3, 1], [-1, 1], [2, 1]]) P.put(x + dx, yb + dy - 1, Wd[2]);
    P.hline(x - 4, yb - 29, 10, Wd[2]);
    // Un manteau rouge, un pardessus noir, un haut-de-forme.
    for (let j = 0; j < 16; j += 1) { const ww = 3 + (j >> 2); for (let i = 0; i < ww; i += 1) P.put(x - 2 - i, yb - 28 + j, i === 0 ? V[1] : V[3]); }
    for (let j = 0; j < 13; j += 1) { const ww = 3 + (j >> 2); for (let i = 0; i < ww; i += 1) P.put(x + 3 + i, yb - 28 + j, i === ww - 1 ? '#1a1a22' : '#2e2e3a'); }
    P.rect(x - 2, yb - 32, 6, 4, '#1a1a22'); P.hline(x - 3, yb - 28, 8, '#1a1a22'); P.hline(x - 1, yb - 31, 4, '#3a3a48');
  });
}

// ── La structure : la charpente de fonte, les murs coupés ───────────────────
// Raph, 2026-10-03, avec Fallout Shelter et Oxygen Not Included en référence : chaque
// lieu est une BOÎTE (plafond, murs en fuite, sol en profondeur) posée dans une
// CHARPENTE sombre et épaisse — c'est elle qui découpe la coupe en salles lisibles.
// La matière de la charpente : rondins liés (le Feu), bois équarri chevillé (Bois,
// Pierre, Couronne), entablement de marbre (Marbre), fonte rivetée (Fonte), acier laqué
// à filet de néon (Néon), céramique à couture de lumière (cosmiques) — laque et or au Jade.
function structOf(S) {
  if (S.struct) return S.struct;
  return { 0: 'logs', 1: 'timber', 2: 'timber', 3: 'timber', 4: 'marble' }[S.band] || 'iron';
}
// La couleur d'un pixel de charpente : « u » dans la pièce (0 … n-1, de la face éclairée à
// la face à l'ombre), « v » le long de la pièce (pour le grain, les chevilles, les liens).
function structAt(S, kind, u, n, v) {
  const last = n - 1, W = S.wood;
  switch (kind) {
    case 'logs': {                                          // le rondin, sa ligature de corde
      if ((v % 26) < 3) return u === 0 || u === last ? INK : u < 2 ? '#e8cf98' : (v % 26) === 1 ? '#c8a868' : '#a88848';
      if (u === last) return INK;
      const t = u / last, c = t < 0.2 ? W[1] : t < 0.55 ? W[2] : t < 0.8 ? W[3] : W[4];
      return (v * 3 + u * 7) % 13 === 0 ? W[4] : c;
    }
    case 'timber': {                                        // la poutre équarrie : fil du bois, chevilles
      if (u === last) return INK;
      if (u === 0) return W[1];
      if ((v % 30) === 15 && u === (n >> 1)) return W[4];
      if ((v % 30) === 15 && u === (n >> 1) + 1) return W[1];
      const grain = (v + u * 9 + ((v * 7) % 5)) % 11 === 0;
      return grain ? W[4] : u < 2 ? W[2] : W[3];
    }
    case 'marble': {                                        // l'entablement : larmier clair, denticules, architrave
      const M = S.stone;
      if (u === last) return INK;
      if (u === 0) return M[0];
      if (u === 1) return M[1];
      if (u === 2) return (v % 4 < 2) ? M[1] : M[3];
      return u < last - 1 ? M[2] : M[3];
    }
    case 'steel': {                                         // l'acier laqué noir, ses filets de chrome, un néon
      if (u === last) return INK;
      if (u === 0) return '#c4cad2';
      if (u === (n >> 1)) return S.neon || '#ff6fb5';
      return u < (n >> 1) ? '#2e2e3a' : '#1e1e28';
    }
    case 'ceramic': {                                       // la céramique blanche, la couture de lumière
      if (S.cosmo === 'jade') {                             // au Jade : la laque noire, le filet d'or
        if (u === last) return INK;
        if (u === 0 || u === last - 1) return S.gold[1];
        return (v % 40) < 2 ? '#7a2220' : u < (n >> 1) ? '#3a2226' : '#2a161a';
      }
      if (u === last) return '#4a4a5a';
      if (u === (n >> 1)) return S.glow;
      return u === 0 ? '#ffffff' : u < (n >> 1) ? '#eef1f4' : '#c8cfd8';
    }
    default: return null;
  }
}
// La POUTRE horizontale (rivetée, au Fonte).
function beam(P, S, x0, x1, y, h) {
  const I = S.iron, kind = structOf(S);
  if (kind !== 'iron') {
    for (let x = x0; x < x1; x += 1) for (let j = 0; j < h; j += 1) P.put(x, y + j, structAt(S, kind, j, h, x - x0));
    return;
  }
  for (let x = x0; x < x1; x += 1) for (let j = 0; j < h; j += 1) {
    let c = j === 0 ? I[2] : j === h - 1 ? INK : j === 1 ? I[3] : I[4];
    const mid = Math.floor(h / 2), rv = (x - x0) % 12 === 6;
    if (rv && j === mid) c = I[1];
    else if (rv && j === mid + 1) c = I[3];
    P.put(x, y + j, c);
  }
}
// Le POTEAU entre deux boîtes, percé d'une PORTE au ras du sol (on passe d'une salle à
// l'autre) ; `door` : [haut de la baie, bas] ou null.
function post(P, S, x, w, y0, y1, door) {
  const I = S.iron, G = S.gold, kind = structOf(S);
  for (let y = y0; y < y1; y += 1) for (let i = 0; i < w; i += 1) {
    let c = i === 0 ? I[2] : i === w - 1 ? INK : i === 1 ? I[3] : I[4];
    if (i === Math.floor(w / 2) && (y - y0) % 12 === 6) c = I[1];
    if (kind !== 'iron') c = kind === 'marble' ? (i === 0 ? S.stone[0] : i === w - 1 ? INK : i % 2 ? S.stone[1] : S.stone[2]) : structAt(S, kind, i, w, y - y0);
    P.put(x + i, y, c);
  }
  if (!door) return;
  const [dt, db] = door;
  for (let y = dt; y < db; y += 1) for (let i = 0; i < w; i += 1) {
    const d = y - dt;
    let c = d < 3 ? '#2a1612' : i < 2 ? '#2a1612' : i > w - 3 ? '#3a2018' : '#4a2a1c';
    if (y >= db - 3) c = S.wood[d % 2 ? 3 : 2];                 // le seuil, au niveau du parquet
    P.put(x + i, y, c);
  }
  for (let i = -1; i <= w; i += 1) { P.put(x + i, dt - 1, G[2]); P.put(x + i, dt - 2, G[3]); }
}
// Le MUR COUPÉ de la façade : parement de pierre au dehors, fonte dedans.
function cutWall(P, S, x, y0, y1, side) {
  for (let y = y0; y < y1; y += 1) for (let i = 0; i < HD.WALL; i += 1) {
    const out = side < 0 ? i : HD.WALL - 1 - i;              // 0 = parement extérieur
    let c;
    if (out < 2) c = out === 0 ? S.stone[2] : S.stone[1];
    else c = ((i + y) % 5 === 0) ? S.iron[3] : S.iron[4];
    if (out === HD.WALL - 1) c = INK;
    P.put(x + i, y, c);
  }
}
// Le BALCON de chaque étage, dehors : la poutre déborde, ses PÉTALES (lambrequin rayé)
// et sa guirlande d'ampoules — l'ADN du lieu, vu de la carte.
function balcony(P, N, S, x0, x1, y, side) {
  const V = S.velvet, C = S.cream;
  beam(P, S, Math.min(x0, x1), Math.max(x0, x1), y, HD.STRUCT);
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  for (let x = xa; x < xb; x += 1) {
    const k = Math.floor((x - xa) / 8), s = ((x - xa) % 8) / 8, d = 3 + Math.round(4 * Math.sin(s * Math.PI));
    const pal = k & 1 ? [C[1], C[2], C[3]] : [V[1], V[2], V[4]];
    for (let j = 0; j < d; j += 1) P.put(x, y + HD.STRUCT + j, j === d - 1 ? pal[2] : (s < 0.25 ? pal[0] : pal[1]));
  }
  for (let x = xa + 2; x <= xb - 2; x += 1) {
    const t = ((x - xa) % 20) / 20, sag = Math.round(4 * 4 * t * (1 - t)), yy = y + HD.STRUCT + 6 + sag;
    P.put(x, yy, '#3a2a22');
    if ((x - xa) % 10 === 5) { P.put(x, yy + 1, '#fff2c8'); N.put(x, yy + 1, '#fff2c8'); P.put(x, yy + 2, '#ffd88a'); N.put(x, yy + 2, '#ffd88a'); }
  }
  void side;
}

// ── LA BOÎTE d'un salon ──────────────────────────────────────────────────────
// Plafond à caissons d'acajou vu d'en dessous, murs latéraux en FUITE (le mur du fond
// comprimé et assombri : celui de gauche dans l'ombre, la lumière venant du
// haut-gauche), mur du fond, parquet en profondeur. Rend ses lignes.
function cofferAt(S, x, j) {
  const Wd = S.wood, G = S.gold;
  if (j === 0) return INK;
  if (j === HD.CEIL - 1) return G[2];                       // la corniche du fond
  if (j === HD.CEIL - 2) return G[3];
  const k = ((x % 22) + 22) % 22;
  if (k < 2) return Wd[4];                                  // les solives
  return j < 3 ? mix(Wd[4], Wd[3], 0.4) : Wd[3];
}
function box(P, S, x0, x1, yT, side = HD.SIDE, N = null) {
  const yC = yT + HD.CEIL, yF = yC + HD.WALLH, yB = yF + HD.FLOORD;
  const ax = x0 + side, bx = x1 - side;
  for (let y = yC; y < yF; y += 1) for (let x = ax; x < bx; x += 1) {
    P.put(x, y, wallAt(S, x, y, yC, yF));
    const n = N ? wallNight(S, x, y, yC, yF) : null;
    if (n) N.put(x, y, n);
  }
  for (let j = 0; j < HD.CEIL; j += 1) {
    const l = x0 + Math.round((j * side) / (HD.CEIL - 1)), r = x1 - Math.round((j * side) / (HD.CEIL - 1));
    for (let x = l; x < r; x += 1) P.put(x, yT + j, ceilAt(S, x, j));
  }
  for (let j = 0; j < HD.FLOORD; j += 1) {
    const l = ax - Math.round((j * side) / (HD.FLOORD - 1)), r = bx + Math.round((j * side) / (HD.FLOORD - 1));
    for (let x = l; x < r; x += 1) P.put(x, yF + j, j < 2 ? mix(floorAt(S, x, j), INK, 0.22 - j * 0.1) : floorAt(S, x, j));
  }
  for (let i = 0; i < side; i += 1) {
    const top = yT + Math.round(((i + 1) * (HD.CEIL - 1)) / side), bot = yB - Math.round(((i + 1) * (HD.FLOORD - 1)) / side);
    for (let y = top; y < bot; y += 1) {
      const yy = Math.round(yC + ((y - top) / Math.max(1, bot - top)) * (yF - yC));
      const a = wallAt(S, ax + 4 + i * 2, Math.min(yF - 1, yy), yC, yF);
      P.put(x0 + i, y, mix(a, INK, 0.5 - i * 0.02));
      P.put(x1 - 1 - i, y, mix(a, INK, 0.26 - i * 0.01));
    }
  }
  return { yT, yC, yF, yB, ax, bx, x0, x1 };
}
// LA LUMIÈRE de la boîte : flaques tramées au mur et au sol sous chaque lampe, coins
// sombres (le centre de la salle est la lumière, comme dans les références).
function lightBox(P, B, lamps, tint = '#ffcf8a') {
  for (const L of lamps) {
    lightPool(P, L.x, B.yC + 14, 26, 22, B.ax + 2, B.bx - 3, B.yC + CROWN, B.yF - WAINSCOT - RAIL - 1, tint);
    lightPool(P, L.x, B.yF + Math.round(HD.FLOORD / 2), 34, 6, B.ax - 4, B.bx + 4, B.yF, B.yB - 2, mix(tint, '#ffffff', 0.2));
  }
  const mid = (B.ax + B.bx) / 2, half = (B.bx - B.ax) / 2;
  for (let y = B.yC; y < B.yF; y += 1) for (let x = B.ax; x < B.bx; x += 1) {
    const d = Math.abs(x - mid) / half;
    if (d < 0.72) continue;
    const t = (d - 0.72) / 0.28;
    if (bayer(x, y) < t) P.put(x, y, mix(P.get(x, y), INK, 0.18));
  }
}

// La LUNETTE de laiton sur son trépied.
function telescopeHD(O, R, S, x, y) {
  const yb = y + FOOT - 1, G = S.gold, Wd = S.wood;
  contactShadow(R, x - 6, x + 6, yb + 1);
  piece(O, x - 9, yb - 22, 20, 23, (P) => {
    for (let j = 0; j < 12; j += 1) { P.put(x - (j >> 1), yb - 11 + j, Wd[2]); P.put(x + (j >> 1), yb - 11 + j, Wd[3]); P.put(x, yb - 11 + j, Wd[1]); }
    for (let t = 0; t < 16; t += 1) {
      const px = x - 7 + t, py = yb - 13 - Math.round(t * 0.5);
      P.put(px, py, G[2]); P.put(px, py - 1, t < 10 ? G[1] : G[2]); P.put(px, py + 1, G[3]);
    }
    P.rect(x + 7, yb - 22, 2, 4, G[1]);
  });
}

// ── LES LIEUX ────────────────────────────────────────────────────────────────
// Meuble un lieu (x au centre, y = fond du parquet, w sa largeur, x0r/x1r les bords
// du mur du fond, y0 le haut du mur) et y pose ses habitants : DERRIÈRE la table
// (`back`), sur les côtés, et DEVANT (`front` : peints après l'avant-plan).
function furnish(ctx, id, x, y, w, x0r, x1r, y0, open, seed) {
  // Chaque âge meuble ses salles à son époque (plaisirsEraRooms.js) ; le Fonte, ici.
  if (furnishEra(ctx, id, x, y, w, x0r, x1r, y0, open, seed)) return;
  const { O, F, N, R, S, pal, fig } = ctx;
  const on = id === 'scene' || id === 'salon' ? true : !!open[id];
  const v = (k) => seed * 3 + k;
  switch (id) {
    case 'des': {
      const two = w >= 190, at = two ? [x - Math.round(w / 4), x + Math.round(w / 4)] : [x];
      at.forEach((tx, t) => {
        diceTable(F, R, S, tx, y);
        if (!on) return;
        fig(tx - 6, y + BK, 0, 0, v(t), { back: true, role: 'croupier' });
        fig(tx + 14, y + BK, 2, t & 1, v(t + 1), { back: true });
        if (w >= 130) fig(tx - 30, y + SD, 0, 1 - (t & 1), v(t + 2));
        fig(tx + 33, y + SD, 2, 'g', v(t + 3), { role: 'hotesse' });
        fig(tx - 12, y + FR, 3, 1, v(t + 4), { front: true });
        fig(tx + 9, y + FR, 1, 0, v(t + 5), { front: true });
      });
      break;
    }
    case 'cartes': {
      cardTable(F, R, S, x, y);
      if (!on) break;
      fig(x, y + BK, 0, 'g', v(0), { back: true, role: 'croupière' });
      fig(x - 22, y + FR, 3, 0, v(1), { front: true });
      fig(x + 2, y + FR, 3, 1, v(2), { front: true });
      fig(x + 24, y + FR, 1, 0, v(3), { front: true });
      if (w >= 150) fig(x - 48, y + SD, 0, 1, v(4));
      break;
    }
    case 'tickets': {
      const kx = x - (w >= 150 ? 16 : 0);
      lotteryKiosk(O, S, pal, kx, y);
      counter(F, R, S, kx, y, 40, true);
      if (w >= 140) lotteryDrum(O, R, S, x + Math.round(w / 2) - 22, y);
      if (on) {
        fig(kx, y + BK, 0, 1, v(0), { back: true, role: 'guichetier' });
        fig(kx - 8, y + FR, 1, 0, v(1), { front: true });
        fig(kx + 10, y + FR, 1, 'g', v(2), { front: true });
        if (w >= 150) fig(x + Math.round(w / 2) - 44, y + SD, 2, 0, v(3));
      }
      break;
    }
    case 'boutique': {
      shelves(O, R, S, pal, x, y, Math.min(60, w - 30));
      counter(F, R, S, x, y, Math.min(46, w - 40));
      if (S.register) O.spr(x + 8, y + FOOT - 17 - 9, REGISTER, pal);
      if (on) {
        fig(x - 8, y + BK, 0, 'g', v(0), { back: true, role: 'marchande' });
        fig(x - 16, y + FR, 3, 1, v(1), { front: true });
      }
      break;
    }
    case 'scene': {
      stage(O, N, R, S, x0r, x1r, y0, y);
      const sw = x1r - x0r, nd = sw >= 170 ? 3 : 2;
      for (let k = 0; k < nd; k += 1) fig(Math.round(x + (k - (nd - 1) / 2) * 28), y - 2, k & 1 ? 2 : 0, 'd', k, { role: 'danseuse', phase: k * 0.37 });
      // Le public de dos, sur les CÔTÉS : planté devant l'estrade, il cachait la troupe.
      fig(x - Math.round(sw / 2) + 20, y + FR, 3, 1, v(3), { front: true });
      fig(x + Math.round(sw / 2) - 20, y + FR, 1, 0, v(4), { front: true });
      break;
    }
    case 'salon': {
      const px = x - Math.round(w / 4), bx = x + Math.round(w / 4);
      O.spr(px - 10, y + FOOT - 18, PIANO, pal, false, 'z', N);
      counter(F, R, S, bx, y, 44);
      fig(bx, y + BK, 0, 0, v(0), { back: true, role: 'barman' });
      fig(px + 2, y + SD, 1, 0, v(1), { role: 'pianiste' });
      fig(bx - 10, y + FR, 3, 1, v(2), { front: true });
      fig(px + 22, y + SD, 2, 'g', v(3));
      break;
    }
    case 'boudoir': boudoir(ctx, x, y, w, x0r, x1r, y0, seed); break;
    // La salle des MACHINES à sous (2026-10-03) : la rangée de fonte et de laiton.
    case 'machines': slotRow(ctx, { x, y, w, on, v }, 'fonte'); break;
    default: break;
  }
}
function boudoir(ctx, x, y, w, x0r, x1r, y0, seed) {
  const { O, F, N, R, S, pal, fig } = ctx;
  const wide = w >= 220;
  // L'alcôve fermée (au bout le plus loin de la cage), l'ouverte de l'autre côté.
  const ax = Math.round(x1r) - 30, bx = Math.round(x0r) + 30;
  alcove(O, F, N, R, S, ax, y, true);
  ctx.boudoir = { x: ax, level: ctx.level };
  ctx.show = { x: ax + 1, y: y + 1 };                      // les ombres de la tenture
  if (wide) alcove(O, F, N, R, S, bx, y, false);
  const mid = wide ? Math.round((bx + ax) / 2) : Math.round((x0r + ax) / 2) - 6;
  chaise(O, R, S, mid - 10, y);
  O.spr(mid - 16, y0 + 9, HEART, pal);
  champagneTable(O, N, R, S, pal, mid + 18, y);
  if (wide) screen3(O, R, S, mid + 46, y);
  fig(mid - 8, y + SD, 0, 'g', seed, { role: 'courtisane' });
  fig(mid + 6, y + SD + 1, 2, 0, seed + 3);
  if (wide) fig(bx + 2, y + BK + 1, 0, 'g', seed + 1, { role: 'courtisane' });
}

// ── LE NIVEAU : ses boîtes dans la charpente ─────────────────────────────────
// Les LIEUX à gauche de la cage, le HALL à droite ; entre deux boîtes un poteau percé
// d'une porte. Chaque boîte a son mur, ses lampes, son ornement, son mobilier.
function level(ctx, lv, rooms, open, i, core) {
  const { P, N, S, pal, ids, spots, fig } = ctx;
  const { cx, w, yT } = lv;
  const x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2);
  const ix0 = x0 + HD.WALL, ix1 = x1 - HD.WALL;
  const yF = yT + HD.CEIL + HD.WALLH, yB = yF + HD.FLOORD, door = [yF - 30, yB];
  // Les segments : à gauche de la cage (les lieux), à droite (le hall) ; aux âges des
  // tours, la cage est au centre et les lieux de part et d'autre.
  const L = [ix0, core.x0 - HD.WALLW], Rt = [core.x1 + HD.WALLW, ix1];
  const segs = [];
  // Un hall dès 34 px (un vestibule) : plus étroit, la charpente restait une case noire.
  let hall = Rt[1] - Rt[0] >= 34 ? Rt : null;
  if (core.center) {
    if (rooms.length === 1) { const sd = i & 1 ? [Rt, L] : [L, Rt]; segs.push([sd[0], rooms]); hall = sd[1]; }
    else { const k = Math.ceil(rooms.length / 2); segs.push([L, rooms.slice(0, k)], [Rt, rooms.slice(k)]); hall = null; }
  } else segs.push([L, rooms]);
  // Les poteaux de part et d'autre de la cage.
  if (!core.none && core.x0 - HD.WALLW >= ix0) post(P, S, core.x0 - HD.WALLW, HD.WALLW, yT, yB, door);
  if (!core.none && core.x1 + HD.WALLW <= ix1) post(P, S, core.x1, HD.WALLW, yT, yB, hall || core.center ? door : null);
  const boxes = [];
  segs.forEach(([[s0, s1], list]) => {
    const n = list.length, bw = (s1 - s0 - (n - 1) * HD.WALLW) / n;
    list.forEach((id, r) => {
      const b0 = Math.round(s0 + r * (bw + HD.WALLW)), b1 = Math.round(b0 + bw);
      if (r > 0) post(P, S, b0 - HD.WALLW, HD.WALLW, yT, yB, door);
      boxes.push({ id, b0, b1 });
    });
  });
  if (hall) boxes.push({ id: null, b0: hall[0], b1: hall[1] });
  boxes.forEach(({ id, b0, b1 }, r) => {
    const B = box(P, S, b0, b1, yT, Math.min(HD.SIDE, Math.floor((b1 - b0) / 5)), ctx.WN);
    const bw = B.bx - B.ax, mx = Math.round((B.ax + B.bx) / 2);
    // Les lampes et leur lumière (pas de lustre devant la toile de la scène).
    // Deux lustres dès 110 px, aux cinquièmes : le centre reste à l'enseigne du lieu.
    // Les torches se plantent aux murs (le centre est à l'enseigne) ; les autres pendent.
    const lamps = S.light === 'torch' ? [{ x: B.ax + 9 }, { x: B.bx - 10 }]
      : id === 'scene' ? [] : bw >= 110 ? [{ x: B.ax + Math.round(bw * 0.2) }, { x: B.ax + Math.round(bw * 0.8) }] : [{ x: mx }];
    lightBox(P, B, lamps, S.poolTint);
    // L'ornement du mur, aux places libres.
    const busy = [];
    if (id === 'scene' || id === 'boudoir') busy.push([B.ax, B.bx]);
    else if (id) busy.push([mx - 32, mx + 32]);
    else busy.push([B.ax, B.ax + 22], [B.bx - 22, B.bx]);
    for (const Lm of lamps) busy.push([Lm.x - 14, Lm.x + 14]);
    const slots = [];
    for (let x = B.ax + 14; x <= B.bx - 14; x += 1) {
      if (busy.some(([a, b]) => x + 12 >= a && x - 12 <= b)) continue;
      if (slots.length && x - slots[slots.length - 1] < 30) continue;
      slots.push(x);
    }
    slots.forEach((x, k) => decorPiece(P, N, S, pal, S.decor[(k + i + r) % S.decor.length], x, B.yC, k + i));
    for (const Lm of lamps) lamp(P, N, S, pal, Lm.x, B.yC - 3);
    // L'enseigne du lieu (le kiosque porte la sienne : LOTERIE).
    if (id && id !== 'boudoir' && id !== 'scene' && id !== 'tickets') roomSign(P, N, S, pal, id, mx, B.yC + 2);
    if (id) {
      const before = ctx.snapshot();
      ctx.level = i;
      furnish(ctx, id, mx, B.yF, bw, B.ax, B.bx, B.yC, open, i * 5 + r);
      ctx.claim(before, id);
      for (let y = yT; y < yB; y += 1) for (let x = b0; x < b1; x += 1) if (!ids.get(x, y)) ids.set(x, y, id);
      spots[id] = { x: mx, y: Math.round((B.yC + B.yF) / 2), r: Math.round(Math.min(bw, HD.WALLH) / 2), box: { x0: b0, y0: yT, x1: b1, y1: yB }, level: i };
    } else {
      // Le HALL : un palmier, une statue, le vestiaire ; l'hôtesse qui accueille.
      const H = S.hall, a = B.ax + Math.round(bw * 0.24), b = B.ax + Math.round(bw * 0.76);
      hallPieceHD(H[i % H.length], ctx.O, P, S, bw < 70 ? mx : a, B.yF);
      if (bw >= 70) hallPieceHD(H[(i + 1) % H.length], ctx.O, P, S, b, B.yF);
      if (bw >= 50) fig(Math.round((a + b) / 2), B.yF + SD, i & 1 ? 2 : 0, 'g', i + 1, { role: 'hotesse' });
    }
  });
  // Un PASSANT par niveau, d'une salle à l'autre par les portes ; il s'arrête avant
  // l'alcôve à la tenture (ses souliers dépassaient dessous).
  let wa = ix0 + HD.SIDE + 14, wb = (core.center ? ix1 : core.x0 - HD.WALLW) - HD.SIDE - 14;
  const al = ctx.boudoir && ctx.boudoir.level === i ? ctx.boudoir.x : null;
  if (al != null) { if (al - 32 - wa >= wb - (al + 32)) wb = Math.min(wb, al - 32); else wa = Math.max(wa, al + 32); }
  if (wb - wa >= 120) {
    const s = i * 7 + 2;
    fig(wa + (s * 29) % (wb - wa), yF + 7, 0, i % 2 === 0 ? 'g' : 0, s, { walk: [wa, wb], speed: 12 + (s % 5) });
  }
}

// ── L'ASCENSEUR : une colonne qui traverse les étages ────────────────────────
// La gaine laquée, ses deux rails de laiton et ses câbles ; à chaque étage le seuil
// de la cabine, le CADRAN d'étage au-dessus de la porte, une lampe ; en haut la
// poulie. La CABINE (cuite à part) monte et descend avec ses passagers.
function shaft(ctx, core, levels) {
  const { P, N, S } = ctx;
  const top = levels[levels.length - 1].yT, bot = levels[0].yT + HD.CEIL + HD.WALLH + HD.FLOORD;
  const x0 = core.x0, x1 = core.x1, w = x1 - x0, mid = Math.round((x0 + x1) / 2), G = S.gold, I = S.iron;
  for (let y = top; y < bot; y += 1) for (let x = x0; x < x1; x += 1) {
    const i = x - x0;
    // La gaine : laque verte du Fonte, verre sombre sur la ville au Néon.
    let c = S.circ === 'glasslift' ? (i % 9 === 4 ? mix(S.glass[4], '#1a1e3c', 0.4) : mix(S.glass[4], '#14162a', 0.6)) : (i % 9 === 4 ? '#203029' : '#1a2622');
    if (i < 3) c = mix(c, INK, 0.5 - i * 0.12);
    if (i > w - 3) c = mix(c, INK, 0.3);
    P.put(x, y, c);
  }
  for (const rx of [x0 + 5, x1 - 6]) for (let y = top; y < bot; y += 1) { P.put(rx, y, (y % 8) === 0 ? G[0] : G[2]); P.put(rx + 1, y, G[3]); }
  for (const dx of [-3, 3]) for (let y = top; y < bot; y += 1) P.put(mid + dx, y, y % 6 === 0 ? '#5a5a62' : '#3a3a40');
  levels.forEach((lv, k) => {
    const yF = lv.yT + HD.CEIL + HD.WALLH, stop = yF + 6;
    // Le seuil de laiton et la ferrure de palier.
    P.hline(x0, stop + 1, w, G[1]); P.hline(x0, stop + 2, w, G[3]); P.hline(x0, stop + 3, w, I[4]);
    // Le cadran d'étage, l'aiguille sur le numéro de l'étage.
    const dy = lv.yT + HD.CEIL + 3;
    P.ellipse(mid, dy + 4, 7, 5, (i, j) => (j > 0 ? null : (i * i) / 49 + (j * j) / 25 > 0.6 ? (i < 0 ? G[1] : G[3]) : S.cream[1]));
    const ang = Math.PI * (1 - (k + 0.5) / levels.length);
    for (let t = 1; t < 5; t += 1) P.put(mid + Math.round(Math.cos(ang) * t), dy + 4 - Math.round(Math.sin(ang) * t), INK);
    P.put(mid, dy + 4, G[0]);
    // La lampe de palier.
    const lc = S.circ === 'glasslift' ? S.neon : '#ffd88a';
    P.put(x0 + 3, dy + 1, '#fff2c8'); N.put(x0 + 3, dy + 1, '#fff2c8'); P.put(x0 + 3, dy + 2, lc); N.put(x0 + 3, dy + 2, lc);
    P.mark(x0 + 3, dy + 2, '#ffd88a');
  });
  // La poulie en haut de la gaine.
  P.ellipse(mid, top + 7, 6, 6, (i, j) => (i * i + j * j > 20 ? I[1] : (i === 0 || j === 0 || i === j || i === -j) ? I[2] : I[4]));
  P.put(mid, top + 7, G[1]);
  ctx.lift = { x0, x1, stops: levels.map((lv) => lv.yT + HD.CEIL + HD.WALLH + 6) };
}
// La CABINE, en deux calques (le fond, avant les passagers ; la grille, après) :
// boiseries, plafonnier, arche dorée, grille en accordéon.
function cabinRasters(S) {
  const w = HD.CORE - 6, h = 40, I = S.iron, G = S.gold, Wd = S.wood;
  const B = makeRaster(0, 0, w, h), Fr = makeRaster(0, 0, w, h);
  const b = painter(B), f = painter(Fr);
  b.rect(0, 0, w, h, I[4]);
  for (let j = 4; j < h - 2; j += 1) for (let i = 1; i < w - 1; i += 1) {
    const lower = j > h - 15;
    b.put(i, j, lower ? (i % 6 === 0 ? Wd[3] : Wd[2]) : mix('#f6dca0', '#c89a5a', (Math.abs(i - w / 2) / (w / 2)) * 0.5 + (j / h) * 0.2));
  }
  b.hline(1, h - 15, w - 2, G[1]);
  b.rect(Math.round(w / 2) - 3, 4, 6, 2, '#fffbe8'); b.hline(Math.round(w / 2) - 2, 6, 4, '#ffe9a0');
  for (let i = 0; i < w; i += 1) { const a = Math.round(3 * Math.sin((i / (w - 1)) * Math.PI)); for (let j = 0; j <= a; j += 1) b.put(i, 3 - j, G[j === a ? 1 : 2]); }
  b.hline(0, h - 2, w, Wd[1]); b.hline(0, h - 1, w, I[4]);
  for (let i = 1; i < w - 1; i += 1) for (let j = 5; j < h - 2; j += 1) {
    const u = (i + j) % 6, v = (i - j + 600) % 6;
    if (i % 3 === 1 || u === 0 || v === 0) f.put(i, j, i % 3 === 1 ? G[2] : I[1]);
  }
  for (let i = 0; i < w; i += 1) { const a = Math.round(3 * Math.sin((i / (w - 1)) * Math.PI)); for (let j = 0; j <= a; j += 1) f.put(i, 3 - j, G[j === a ? 1 : 2]); }
  f.hline(0, 4, w, G[3]); f.rect(0, h - 2, w, 2, G[3]); f.vline(0, 0, h, G[1]); f.vline(w - 1, 0, h, G[3]);
  return { back: B, front: Fr, w, h };
}

// LES FONDATIONS : la jetée de fonte — pont de planches sur poutre rivetée, piles
// croisillonnées jusque dans l'eau.
function foundation(P, S, cx, w, deckY, waterY) {
  const x0 = Math.round(cx - w / 2 - 10), x1 = Math.round(cx + w / 2 + 10), I = S.iron, Wd = S.wood;
  for (let x = x0; x < x1; x += 1) {
    P.put(x, deckY, Wd[0]); P.put(x, deckY + 1, Wd[1]); P.put(x, deckY + 2, Wd[3]);
    for (let j = 3; j < 9; j += 1) P.put(x, deckY + j, j === 3 ? I[1] : j === 8 ? INK : I[3]);
    if (x % 9 === 4) P.put(x, deckY + 5, I[0]);
  }
  for (let x = x0 + 4; x < x1 - 4; x += 22) {
    for (let y = deckY + 9; y < waterY + 6; y += 1) { P.put(x, y, I[2]); P.put(x + 1, y, I[3]); P.put(x + 2, y, I[4]); }
    if (x + 22 < x1 - 4) for (let t = 0; t < 22; t += 1) {
      const ya = deckY + 9 + Math.round((t * (waterY - deckY - 9)) / 22), yb2 = waterY - Math.round((t * (waterY - deckY - 9)) / 22);
      P.put(x + 2 + t, ya, I[3]); P.put(x + 2 + t, yb2, I[3]);
    }
  }
}

// ── Le manège de l'hôtesse ───────────────────────────────────────────────────
// Elle prend un client au rez et l'emmène au BOUDOIR par l'ascenseur (on les voit
// monter), ils passent derrière la tenture, puis elle le raccompagne.
function courtship(ctx, levels, core) {
  const B = ctx.boudoir;
  if (!B) return null;
  const L0 = levels[0], LB = levels[B.level], lift = !!ctx.lift;
  const cc = Math.round((core.x0 + core.x1) / 2), L0x1 = Math.round(L0.cx + L0.w / 2) - HD.WALL;
  const home = L0x1 - core.x1 >= 70 ? Math.round((core.x1 + HD.WALLW + L0x1) / 2) + 6 : core.x0 - HD.WALLW - 40;
  const v = 22, ride = 34;
  const fl = (lv) => lv.yT + HD.CEIL + HD.WALLH;
  const y0 = fl(L0) + 7, yB = fl(LB) + 7, cy0 = fl(L0) + 6, cyB = fl(LB) + 6;
  const her = [], him = [], cab = [];
  let t = 0;
  const seg = (dur, a, b, st, cabY) => {
    her.push({ t, x: a[0], y: a[1], ...st });
    him.push({ t, x: b[0], y: b[1], ...st, dir: st.dirHim != null ? st.dirHim : st.dir });
    cab.push({ t, y: cabY });
    t += dur;
  };
  const toR = (xa, xb) => (xb > xa ? 0 : 2);
  const back = (B.level === 0 ? B.x : cc) > home ? -16 : 16;
  const P0 = [[home, y0], [home + back, y0]], face = { dir: back > 0 ? 0 : 2, dirHim: back > 0 ? 2 : 0 };
  if (B.level === 0) {
    const P3 = [[B.x + 4, y0], [B.x - 4, y0]];
    seg(3, ...P0, face, cy0);
    seg(Math.abs(B.x - home) / v, ...P0, { dir: toR(home, B.x), walk: true }, cy0);
    seg(20, ...P3, { dir: 0, hide: true }, cy0);
    seg(Math.abs(B.x - home) / v, ...P3, { dir: toR(B.x, home), walk: true }, cy0);
  } else {
    const P1 = [[cc + 5, cy0], [cc - 5, cy0]], P2 = [[cc + 5, cyB], [cc - 5, cyB]], P3 = [[B.x + 4, yB], [B.x - 4, yB]];
    const rt = Math.abs(y0 - yB) / ride;
    seg(3, ...P0, face, cy0);
    seg(Math.abs(cc - home) / v, ...P0, { dir: toR(home, cc), walk: true }, cy0);
    seg(1, ...P1, { dir: 0 }, cy0);
    seg(rt, ...P1, { dir: 0, hide: !lift }, cy0);
    seg(1, ...P2, { dir: 0 }, cyB);
    seg(Math.abs(B.x - cc) / v, ...P2, { dir: toR(cc, B.x), walk: true }, cyB);
    seg(22, ...P3, { dir: 0, hide: true }, cyB);
    seg(Math.abs(B.x - cc) / v, ...P3, { dir: toR(B.x, cc), walk: true }, cyB);
    seg(1, ...P2, { dir: 0 }, cyB);
    seg(rt, ...P2, { dir: 0, hide: !lift }, cyB);
    seg(1, ...P1, { dir: 0 }, cy0);
    seg(Math.abs(cc - home) / v, ...P1, { dir: toR(cc, home), walk: true }, cy0);
  }
  seg(0, ...P0, face, cy0);
  return {
    period: t,
    tracks: [
      { type: 'g', variant: 0, role: 'hotesse', keys: her },
      { type: 0, variant: 2, role: 'client', keys: him },
    ],
    cabin: lift ? cab : null,
  };
}

// ── LES DIX ÂGES ─────────────────────────────────────────────────────────────
// (2026-10-03 : « c'est bien, go pour les autres âges »). Le pilote Fonte validé
// donne la MÉTHODE (boîtes, charpente sombre, lumière par salle, grille des filles) ;
// chaque âge en donne la MATIÈRE : peaux et rondins du campement, planches et chaume,
// moellons et tuiles, ardoise et tapisseries, marbre et or, laque et néon, céramique et
// lumière. Mêmes clés de rampe que FONTE (clair → sombre), plus les choix de matière :
//   wall / floor / ceil  — les matières de la boîte ;
//   light                — le luminaire (torch, lantern, brazier, wheel, chandelier,
//                          gas, neon, orb) ;
//   top / craft          — la salle sous le toit et l'engin d'Icare ;
//   circ                 — la circulation (none, ladder, stairs, lift, glasslift, beam) ;
//   found, skyline       — les fondations, la rive d'en face ;
//   decor, hall          — l'ornement des murs, le mobilier des halls ;
//   hat, letters, register — le chapeau de l'ombre, l'enseigne écrite, la caisse.
const COSMIC_GLOW = { 7: ['#7affc8', '#2ec88a'], 8: ['#ffe9a0', '#e0b040'], 9: ['#d8b0ff', '#9a6ae0'] };
// Les trois cités cosmiques n'ont pas la même matière : la laque et le jade (la pagode),
// la nacre et la nuit étoilée, la géode d'améthyste.
const COSMO = { 7: 'jade', 8: 'astral', 9: 'cristal' };
const COSMIC_LAMP = { 7: 'paperlantern', 8: 'starorb', 9: 'crystal' };
const COSMIC_DECOR = { 7: ['moonwindow', 'scroll', 'moonwindow', 'scroll'], 8: ['starmap', 'moonphase', 'starmap', 'moonphase'], 9: ['geodeMirror', 'prism', 'geodeMirror', 'prism'] };
const POMPEI = ['#c8443a', '#a83430', '#842624', '#5a1a1a'];
const JADE = ['#c8f0d8', '#96d6b2', '#62b08a', '#3e8466', '#265840'];
const LACQUER = ['#d0503a', '#a8322a', '#7a2220', '#4a1414'];
const NAVY = ['#3e4690', '#2e3472', '#222756', '#181b3e'];
const NACRE = ['#fbf6f8', '#efe4ee', '#dccfe0', '#bfb0c8'];
const AMETH = ['#e8d8ff', '#c4a4f4', '#9a6ee0', '#6c44b4', '#44287a'];
const LILAC = ['#faf8fe', '#eee8f8', '#ddd2f0', '#c4b6e2'];
// L'or des éventails du casino (le « métal » du Néon est le chrome : blanc, il refaisait des barreaux).
const DECO_GOLD = ['#fff2b0', '#f0cf6a', '#d2a53e', '#9c7524', '#6d4c25'];
function styleHD(band) {
  const b = Math.max(0, Math.min(9, band | 0));
  if (b === 5) return FONTE;
  const common = {
    kit: b <= 0 ? 'feu' : b === 1 ? 'bois' : b === 2 ? 'pierre' : b === 3 ? 'couronne' : b === 4 ? 'marbre' : b === 6 ? 'neon' : 'cosmic',
    band: b, pink: FONTE.pink, glass: FONTE.glass, cream: FONTE.cream, velvet: FONTE.velvet, felt: FONTE.felt,
    sky: ['#9fd0ee', '#b4daf0', '#c8e4f2', '#dceef6', '#e8f4f8'],
    water: ['#6a9ab6', '#5a8aa8', '#4a7896', '#3c6682', '#30546c'],
    haze: '#a8b8c4', hazeDark: '#8a9aa8', hat: null, letters: true, register: true,
  };
  if (b === 0) return {
    ...common,
    wood: ['#c08a58', '#9a6a3e', '#7a5030', '#583820', '#3a2414'],
    gold: ['#fff4dc', '#efe0bc', '#d2c09a', '#a8946e', '#7a6a4c'],                // l'os, la corne
    velvet: ['#f0a070', '#d8794c', '#b85a36', '#913f27', '#682e1d', '#4a2014'],   // les peaux teintes
    felt: ['#ecd6a8', '#d2b582', '#ad8f60', '#806740'],
    paper: ['#f0dcb0', '#dec496', '#c8a878', '#a8875a', '#80643e'],
    iron: ['#9a7448', '#7a5a36', '#5e4426', '#422e18', '#2a1c0e'],
    stone: ['#d8d0c0', '#bcb2a0', '#9c9282', '#7c7466', '#5c564c'],
    sky: ['#f0b46a', '#f4c886', '#f6dcaa', '#f8ead0', '#faf2e2'], haze: '#d8b08a', hazeDark: '#b88c66',
    water: ['#5a8aa0', '#4c7a90', '#406a7e', '#365a6c', '#2c4a5a'],
    wall: 'hide', floor: 'logs', ceil: 'tent', light: 'torch', top: 'tent', craft: 'wings', circ: 'none',
    found: 'raft', skyline: 'camp', decor: ['furs', 'antlers', 'furs', 'antlers'], hall: ['totem', 'drum', 'furs'],
    letters: false, register: false,
  };
  if (b === 1) return {
    ...common,
    wood: ['#d8a868', '#b8884c', '#966a36', '#704c24', '#4a3016'],
    gold: ['#f6d898', '#e0b462', '#c08c3e', '#906428', '#62421a'],                // le bronze
    paper: ['#e8c890', '#d0ac70', '#b48e54', '#8e6c3c', '#664c28'],
    iron: ['#8a6a44', '#6a4e30', '#503a22', '#382816', '#24180c'],
    stone: ['#d8d0c0', '#bcb2a0', '#9c9282', '#7c7466', '#5c564c'],
    wall: 'planks', floor: 'planks', ceil: 'rafters', light: 'hornlantern', top: 'thatch', craft: 'wings', circ: 'ladder',
    found: 'piles', skyline: 'huts', decor: ['shield', 'window', 'furs', 'window'], hall: ['barrels', 'amphora', 'plant'],
    letters: false, register: false,
  };
  if (b === 2) return {
    ...common,
    wood: ['#b8824e', '#966838', '#764e28', '#56381a', '#3a240e'],
    gold: ['#f4d890', '#dcb05a', '#b88838', '#8a6224', '#5c4018'],
    paper: ['#f0e4cc', '#dccca8', '#c2ae8a', '#a08c6c', '#7c6a52'],
    iron: ['#b4a488', '#94846a', '#766850', '#584c3a', '#3c3426'],
    stone: ['#f0e4cc', '#dccca8', '#c2ae8a', '#a08c6c', '#7c6a52'],
    wall: 'ashlar', floor: 'flags', ceil: 'beams', light: 'brazier', top: 'tiles', craft: 'wings', circ: 'stairs',
    found: 'stone', skyline: 'town', decor: ['window', 'shield', 'window', 'tapestry'], hall: ['barrels', 'brazier', 'plant'],
    register: false,
  };
  if (b === 3) return {
    ...common,
    wood: ['#a87048', '#8a5634', '#6c4024', '#4e2c16', '#341c0c'],
    gold: FONTE.gold,
    paper: ['#d8d4cc', '#b8b4ac', '#98948c', '#787470', '#58544e'],
    iron: ['#8c8880', '#6e6a64', '#54504c', '#3c3a36', '#262422'],
    stone: ['#d8d4cc', '#b8b4ac', '#98948c', '#787470', '#58544e'],
    wall: 'ashlar', wainscot: true, floor: 'flags', ceil: 'beams', light: 'wheel', top: 'slate', craft: 'wings', circ: 'stairs',
    found: 'stone', skyline: 'castle', decor: ['tapestry', 'window', 'shield', 'window'], hall: ['armor', 'brazier', 'barrels'],
    register: false,
  };
  if (b === 4) return {
    ...common,
    gold: FONTE.gold, wood: FONTE.wood,
    paper: ['#fffaf2', '#f2eadc', '#ded2be', '#c0b29a', '#9c8e78'],
    iron: ['#e6dccb', '#cfc2ad', '#b3a58e', '#938670', '#6e6352'],
    stone: ['#fffaf2', '#f2eadc', '#ded2be', '#c0b29a', '#9c8e78'],
    wall: 'pompei', floor: 'mosaic', ceil: 'marble', light: 'lucerna', top: 'dome', craft: 'wings', circ: 'stairs',
    found: 'stone', skyline: 'temples', decor: ['window', 'fresco', 'window', 'fresco'], hall: ['statue', 'fountain', 'laurel'],
  };
  if (b === 6) return {
    ...common,
    wood: ['#5a5a6a', '#44444f', '#30303a', '#212128', '#141418'],                // la laque noire
    gold: ['#ffffff', '#e2e8f0', '#bac4d0', '#8c98a8', '#5e6878'],                // le chrome
    velvet: ['#ffb0d4', '#ff6fb5', '#e8489a', '#b82a76', '#801c52', '#521236'],
    paper: ['#3a3f6a', '#2e3258', '#242848', '#1c1f38', '#14162a'],
    iron: ['#c4cad2', '#9aa2ad', '#7a828e', '#5a626e', '#3e444e'],
    stone: ['#eef0f2', '#d5d9de', '#b4bac2', '#9aa2ad', '#7a828e'],
    glass: ['#e8f6ff', '#b4dcf4', '#7ab8e0', '#4a8ec0', '#2c6496'],
    sky: ['#7fb6e0', '#9ccbeb', '#bfdcf0', '#dceaf2', '#eef4f8'], neon: '#ff6fb5', neon2: '#5ef0ff', poolTint: '#ffb6dc',
    wall: 'deco', floor: 'carpet', ceil: 'panels', light: 'globe', top: 'neondome', craft: 'glider', circ: 'glasslift',
    found: 'concrete', skyline: 'towers', decor: ['mirrorDeco', 'poster', 'windowCity', 'neonSign'], hall: ['jukebox', 'cigarette', 'palm'],
    hat: 'top', struct: 'steel',
  };
  // 7-9 — les âges cosmiques : céramique blanche, verre et lumière de l'âge.
  const [glow, glow2] = COSMIC_GLOW[b];
  return {
    ...common,
    wood: ['#ffffff', '#eef1f4', '#d4dae2', '#aeb6c2', '#868e9c'],                // la céramique
    gold: [mix(glow, '#ffffff', 0.5), glow, glow2, mix(glow2, INK, 0.35), mix(glow2, INK, 0.6)],
    paper: [mix(glow, '#ffffff', 0.7), mix(glow, '#ffffff', 0.45), glow, glow2, mix(glow2, INK, 0.4)],
    iron: ['#e8ecf2', '#ccd2dc', '#aab2c0', '#86909e', '#646c7a'],
    stone: ['#ffffff', '#eef1f4', '#d4dae2', '#aeb6c2', '#868e9c'],
    glass: [mix(glow, '#ffffff', 0.7), mix(glow, '#ffffff', 0.4), glow, glow2, mix(glow2, INK, 0.4)],
    felt: ['#3a4a6a', '#2a3a52', '#1e2a3e', '#141c2a'],
    sky: ['#2a2f64', '#3a3f7a', '#56589a', '#7a78b8', '#9a96cc'], haze: '#8c8ac0', hazeDark: '#6e6ca8',
    water: ['#5a6aa6', '#4a5a96', '#3e4c84', '#323e70', '#28325c'],
    glow, glow2, neon: glow, poolTint: mix(glow, '#ffffff', 0.3),
    wall: COSMO[b], cosmo: COSMO[b], floor: 'polished', ceil: 'glow', light: COSMIC_LAMP[b], top: 'pagoda', craft: 'lightwings', circ: 'beam', struct: 'ceramic',
    found: 'float', skyline: 'spires', decor: COSMIC_DECOR[b], hall: ['orb', 'plant', 'aquarium'],
  };
}

// ── Les matières de la boîte, âge par âge ────────────────────────────────────
function wallAt(S, x, y, y0, y1) {
  const dy = y - y0, up = y1 - y;
  switch (S.wall) {
    case 'hide': {                                          // peaux tendues entre des perches
      const P = S.paper, Wd = S.wood, px = ((x % 30) + 30) % 30;
      if (px < 3) return px === 0 ? Wd[1] : px === 1 ? Wd[2] : Wd[3];
      if (dy < 4) return dy === 3 ? Wd[3] : (x + dy) % 4 === 0 ? S.gold[2] : Wd[2];
      if (up <= 14) {                                       // la natte de joncs, liée
        if (up === 14 || up === 13) return up === 14 ? Wd[3] : P[1];
        if (((x % 10) + 10) % 10 === 0) return up % 2 ? Wd[3] : Wd[2];   // les liens
        return up % 2 ? (h32(x >> 3, up, 9) % 5 === 0 ? P[3] : P[2]) : P[1];
      }
      if ((dy - 4) % 11 === 0 && x % 3 === 0) return P[4];  // les coutures
      if (h32(x >> 2, y >> 2, 7) % 29 === 0) return P[3];
      return dy < 9 ? P[0] : up < 22 ? P[2] : P[1];
    }
    case 'planks': {                                        // planches debout, sablière, lambris couché
      const Wd = S.wood;
      if (dy < 4) return dy === 0 ? INK : dy === 3 ? Wd[4] : Wd[3];
      if (up <= 3) return Wd[4];
      if (up <= 16) return up === 16 ? Wd[1] : up % 5 === 0 || (x + up * 7) % 37 === 0 ? Wd[4] : Wd[2];
      const k = ((x % 8) + 8) % 8, n = Math.floor(x / 8);
      if (k === 0) return Wd[4];
      if (k === 1) return Wd[1];
      const kn = h32(n, Math.floor(dy / 9), 11) % 13 === 0 && k > 2 && k < 6 && dy % 9 > 3 && dy % 9 < 6;
      if (kn) return Wd[4];
      return h32(n, 3) % 3 === 0 ? mix(Wd[2], Wd[1], 0.4) : Wd[2];
    }
    case 'ashlar': {                                        // moellons en appareil, corniche de pierre
      const St = S.stone;
      if (dy < 5) return dy === 0 ? INK : dy === 1 ? St[1] : dy === 4 ? St[4] : St[2];
      if (S.wainscot && up <= WAINSCOT + RAIL) return damaskAt(S, x, y, y0, y1);
      if (up <= 3) return St[4];
      const row = Math.floor((dy - 5) / 7), off = (row & 1) * 8, bx = (((x + off) % 16) + 16) % 16, by = (dy - 5) % 7;
      if (by === 6 || bx === 0) return St[4];
      if (by === 0 || bx === 1) return St[1];
      return h32(Math.floor((x + off) / 16), row, 3) % 5 === 0 ? St[3] : St[2];
    }
    case 'marble': {                                        // frise grecque, panneaux veinés, soubassement de velours
      const St = S.stone, G = S.gold, V = S.velvet;
      if (dy < 6) {
        if (dy === 0) return INK;
        if (dy === 1 || dy === 5) return G[2];
        const k = ((x % 8) + 8) % 8, r = dy - 2;
        const on = (r === 0 && k < 6) || (r === 1 && (k === 0 || k === 5)) || (r === 2 && (k === 0 || (k >= 3 && k <= 5)));
        return on ? G[1] : V[3];
      }
      if (up <= 3) return St[3];
      if (up <= WAINSCOT) return up === WAINSCOT ? G[2] : (x % 26) < 2 ? V[4] : V[3];
      if (up <= WAINSCOT + RAIL) return up === WAINSCOT + RAIL ? G[1] : G[3];
      const k = ((x % 28) + 28) % 28;
      if (k === 0 || k === 27) return G[2];
      const vein = (x * 3 + dy * 2 + (h32(x >> 3, dy >> 3, 5) % 7)) % 23 === 0;
      return vein ? St[2] : k < 4 ? St[0] : St[1];
    }
    case 'glasswall': {                                     // la baie sur la ville de nuit, meneaux chromés
      const C = S.gold, Gl = S.glass;
      if (dy < 3) return dy === 0 ? INK : C[2];
      if (up <= 3) return S.wood[4];
      if (up <= WAINSCOT) return up === WAINSCOT ? S.neon : x % 12 < 1 ? S.wood[4] : S.wood[3];
      if (up <= WAINSCOT + 2) return C[1];
      const m = ((x % 18) + 18) % 18;
      if (m === 0) return C[1];
      if (m === 1) return C[3];
      const towerH = 8 + (h32(Math.floor(x / 9), 3, 7) % 18), ty = y1 - WAINSCOT - 2 - towerH;
      if (y > ty) return x % 3 === 1 && (y - ty) % 4 === 2 && h32(x, y, 9) % 3 === 0 ? '#ffe9a0' : '#2a3050';
      return mix(mix(Gl[4], '#1a1e3c', 0.5), Gl[3], (dy / (y1 - y0)) * 0.5);
    }
    case 'pompei': {                                        // le rouge de Pompéi : panneaux, filets d'ocre, soubassement noir
      const St = S.stone, G = S.gold, k = ((x % 44) + 44) % 44, top = dy - 6;
      if (dy < 6) {                                           // la frise grecque
        if (dy === 0) return INK;
        if (dy === 1 || dy === 5) return G[2];
        const kk = ((x % 8) + 8) % 8, r = dy - 2;
        const on = (r === 0 && kk < 6) || (r === 1 && (kk === 0 || kk === 5)) || (r === 2 && (kk === 0 || (kk >= 3 && kk <= 5)));
        return on ? G[1] : '#2a1a1a';
      }
      if (up <= 3) return up === 3 ? St[1] : St[3];
      if (up <= WAINSCOT) {                                   // le soubassement noir, ses plaques de marbre feint
        if (up === WAINSCOT) return '#e0b050';
        const pk = ((x % 22) + 22) % 22;
        if (up > 5 && up < WAINSCOT - 3 && pk > 3 && pk < 18) return (x + up) % 7 === 0 ? '#3e8a6a' : '#2e6a52';
        return '#1e1414';
      }
      if (up <= WAINSCOT + 2) return up === WAINSCOT + 2 ? '#1e1414' : '#e0b050';
      // L'entre-panneau noir et son candélabre peint (un trait clair, des volutes).
      if (k < 6) { if (k === 3 && top > 4) return top % 7 === 0 ? '#e0b050' : '#d8c8a0'; if ((k === 2 || k === 4) && top % 7 === 0) return '#d8c8a0'; return '#1e1414'; }
      if (k === 6 || k === 43) return '#e0b050';              // le filet d'ocre du panneau
      if (k === 8 || k === 41 || top === 3) return POMPEI[2];
      // La vignette au milieu du panneau : un oiseau sur une branche, un paysage minuscule.
      const vx = k - 24.5, vy = top - Math.round((y1 - y0 - WAINSCOT - 8) * 0.42);
      if (Math.abs(vx) <= 5 && Math.abs(vy) <= 4) {
        if (Math.abs(vx) === 5 || Math.abs(vy) === 4) return '#e0b050';
        return vy > 1 ? '#7a8a5a' : (vx === 0 && vy === -1) || (vx === 1 && vy === -1) ? '#2a1a1a' : '#e8d8b8';
      }
      return (x * 3 + top * 5) % 29 === 0 ? POMPEI[0] : POMPEI[1];
    }
    case 'deco': {                                          // l'art déco du casino : velours prune, éventails d'or
      const G = DECO_GOLD, up2 = up - WAINSCOT;
      if (dy < 4) return dy === 0 ? INK : dy === 1 ? G[2] : dy === 2 ? S.neon : '#1a0c16';
      if (up <= 3) return up === 3 ? G[1] : up === 2 ? G[2] : G[3];
      if (up <= WAINSCOT) {                                   // la laque noire, filets d'or
        if (up === WAINSCOT) return G[1];
        if (up === WAINSCOT - 3 || up === 6) return '#3a2a34';
        return up > WAINSCOT - 3 ? '#2a1c26' : (x + up * 2) % 31 === 0 ? '#2e2230' : '#1c1218';
      }
      if (up2 <= 3) return up2 === 3 ? G[1] : up2 === 2 ? G[2] : '#2a1c26';    // la cimaise
      const k = ((x % 40) + 40) % 40, top = dy - 4;
      if (k < 3) return k === 0 ? G[1] : k === 1 ? G[2] : G[4];  // le pilastre d'or, modelé
      // L'éventail (soleil levant) au haut de chaque panneau : des rais d'or sur le prune.
      const cx = 21.5, ry = 13, dxx = k - cx, dyy = top;
      const rr = Math.sqrt(dxx * dxx + (dyy * 1.3) * (dyy * 1.3));
      if (rr < ry && dyy >= 0) {
        if (rr < 3) return G[1];
        const ang = Math.atan2(dyy * 1.3, dxx), ray = Math.abs(((ang / Math.PI) * 9) % 1 - 0.5) < 0.16;
        return ray ? (rr < 8 ? G[1] : G[2]) : rr > ry - 1.5 ? G[3] : '#6a2448';
      }
      const t = top / Math.max(1, y1 - y0 - WAINSCOT - 8);
      const base = t < 0.4 ? '#5a1c3c' : t < 0.75 ? '#4c1834' : '#3e142c';
      return (k === 3 || k === 39) ? '#2a0e1e' : (x + dy * 3) % 13 === 0 ? mix(base, '#000000', 0.15) : base;
    }
    case 'jade': {                                          // laque rouge et panneaux de jade aux nuages
      const G = S.gold, k = ((x % 34) + 34) % 34, top = dy - 4;
      if (dy < 4) return dy === 0 ? INK : dy === 1 ? G[1] : dy === 2 ? G[2] : LACQUER[3];
      if (up <= 3) return up === 3 ? LACQUER[2] : LACQUER[3];
      if (k < 4) return k === 0 ? LACQUER[0] : k === 3 ? LACQUER[3] : LACQUER[1];   // la colonne laquée
      if (up <= WAINSCOT) {
        if (up === WAINSCOT) return G[1];
        if (up === WAINSCOT - 1) return G[3];
        const kk = (k - 4) % 10;
        return kk === 0 ? LACQUER[3] : up % 5 === 0 ? LACQUER[3] : LACQUER[2];      // le treillis bas
      }
      // Le panneau de jade : cadre clair inset, nuage stylisé au milieu.
      if (k === 5 || k === 32 || top === 2 || up === WAINSCOT + 2) return JADE[1];
      const h = y1 - y0 - WAINSCOT - 4, ccx = 18.5, ccy = Math.round(h * 0.45);
      const ux = k - ccx, uy = top - ccy;
      const cloud = [[-6, 0, 3], [0, -2, 4], [6, 0, 3], [0, 2, 3]];
      for (const [qx, qy, rr] of cloud) {
        const d = Math.hypot(ux - qx, (uy - qy) * 1.4);
        if (d < rr && d > rr - 1.2) return JADE[0];
      }
      if (Math.abs(uy - 3) < 0.6 && Math.abs(ux) < 9) return JADE[0];
      return top < h * 0.3 ? JADE[2] : top < h * 0.7 ? JADE[3] : mix(JADE[3], JADE[4], 0.5);
    }
    case 'astral': {                                        // la nuit étoilée dans des cadres de nacre
      const G = S.gold, k = ((x % 60) + 60) % 60, top = dy - 4;
      if (dy < 4) return dy === 0 ? INK : dy === 1 ? G[1] : dy === 2 ? NACRE[1] : NAVY[3];
      if (up <= 3) return up === 3 ? NACRE[2] : NACRE[3];
      if (up <= WAINSCOT) {
        if (up === WAINSCOT) return G[1];
        const n = h32(x >> 2, up >> 2, 13) % 3;
        return k < 2 ? NACRE[3] : n === 0 ? NACRE[0] : n === 1 ? NACRE[1] : '#e8eef8';
      }
      if (k < 3) return k === 1 ? NACRE[0] : NACRE[2];            // le cadre de nacre
      if (astralStar(x, top)) return top % 2 ? G[0] : '#ffffff';
      if (astralLine(x, top)) return NAVY[0];
      const t = top / Math.max(1, y1 - y0 - WAINSCOT - 4);
      return t < 0.5 ? NAVY[2] : mix(NAVY[2], NAVY[1], (t - 0.5) * 1.4);
    }
    case 'cristal': {                                       // la géode : panneaux lilas, grappes d'améthyste
      const k = ((x % 32) + 32) % 32, top = dy - 4;
      if (dy < 4) return dy === 0 ? INK : dy === 1 ? AMETH[2] : dy === 2 ? LILAC[0] : LILAC[3];
      if (up <= 3) return up === 3 ? AMETH[3] : AMETH[4];
      if (up <= WAINSCOT) {
        if (up === WAINSCOT) return AMETH[2];
        return k < 2 ? LILAC[3] : up % 6 === 0 ? LILAC[2] : LILAC[1];
      }
      if (k < 3) return k === 1 ? LILAC[0] : AMETH[1];
      const c = geode(x, up - WAINSCOT, top);
      if (c) return c;
      const t = top / Math.max(1, y1 - y0 - WAINSCOT - 4);
      return (x + top * 2) % 17 === 0 ? LILAC[1] : t < 0.5 ? LILAC[2] : mix(LILAC[2], LILAC[3], (t - 0.5));
    }
    case 'crystal': {                                       // panneaux de lumière, fils lumineux
      const Gl = S.glass, W = S.wood;
      if (dy < 3) return dy === 0 ? INK : S.glow;
      if (up <= 3) return W[3];
      if (up <= WAINSCOT) return up === WAINSCOT ? S.glow : W[x % 20 < 1 ? 2 : 1];
      const k = ((x % 16) + 16) % 16;
      if (k === 0) return S.glow;
      return mix(Gl[1], Gl[2], Math.max(0, Math.min(1, dy / (y1 - y0) + (k < 3 ? -0.1 : 0.1))));
    }
    default: return damaskAt(S, x, y, y0, y1);
  }
}
// Les constellations de l'Astral : par panneau de 30 px, cinq étoiles tirées ; des traits
// fins en relient trois (une figure, pas un quadrillage).
const _sky = new Map();
function astralPanel(px) {
  let p = _sky.get(px);
  if (!p) {
    const st = [];
    for (let k = 0; k < 6; k += 1) st.push([px * 30 + 5 + (h32(px, k, 1) % 22), 4 + (h32(px, k, 2) % 22)]);
    p = { st, seg: [[st[0], st[1]], [st[1], st[2]], [st[2], st[3]]] };
    _sky.set(px, p);
  }
  return p;
}
function astralStar(x, top) {
  const p = astralPanel(Math.floor(x / 30));
  return p.st.some(([sx, sy], k) => (sx === x && sy === top) || (k < 2 && Math.abs(sx - x) + Math.abs(sy - top) === 1));
}
function astralLine(x, top) {
  const p = astralPanel(Math.floor(x / 30));
  return p.seg.some(([[ax, ay], [bx, by]]) => {
    if (x < Math.min(ax, bx) || x > Math.max(ax, bx) || top < Math.min(ay, by) - 1 || top > Math.max(ay, by) + 1) return false;
    const t = bx === ax ? 0 : (x - ax) / (bx - ax), yy = ay + (by - ay) * t;
    return Math.abs(yy - top) < 0.5 && (x + top) % 2 === 0;
  });
}
// La géode du Cristal : des cristaux debout sur la cimaise, d'autres pendus à la corniche,
// faces claire (au jour, à gauche) et sombre, pointe blanche.
function geode(x, upW, top) {
  // Une GRAPPE tous les 48 px, au pied d'un panneau sur deux : un grand cristal au
  // milieu, deux petits penchés ; chaque cristal a sa face au jour, son arête, sa face
  // à l'ombre, et une pointe claire.
  void top;
  const cell = Math.floor(x / 48);
  if (h32(cell, 7, 5) % 2) return null;
  const base = cell * 48 + 16 + (h32(cell, 7, 6) % 12);
  for (const [dx, hh, w, lean] of [[0, 16, 3, 0], [-5, 9, 2, -0.35], [5, 11, 2, 0.3]]) {
    if (upW <= 0 || upW > hh) continue;
    const t = upW / hh, cx = base + dx + lean * upW, half = w * (1 - Math.max(0, t - 0.55) / 0.45);
    const u = x - cx;
    if (Math.abs(u) > half + 0.3) continue;
    if (t > 0.86) return '#f6eeff';
    return u < -0.5 ? AMETH[1] : u < 0.5 ? AMETH[2] : AMETH[3];
  }
  return null;
}
// Ce que le mur ALLUME la nuit (fils de lumière, néon de cimaise, fenêtres de la ville).
function wallNight(S, x, y, y0, y1) {
  const up = y1 - y, dy = y - y0;
  // Le néon de corniche du casino ; les étoiles de l'Astral ; les pointes de la géode.
  if (S.wall === 'deco') return dy === 2 ? S.neon : null;
  if (S.wall === 'astral') return dy > 4 && up > WAINSCOT + 3 && ((x % 60) + 60) % 60 >= 3 && astralStar(x, dy - 4) ? '#fff4c8' : null;
  if (S.wall === 'cristal') return null;
  if (S.wall === 'jade') return null;
  if (S.wall === 'glasswall') {
    if (up === WAINSCOT) return S.neon;
    const c = wallAt(S, x, y, y0, y1);
    return c === '#ffe9a0' ? c : null;
  }
  if (S.wall === 'crystal') return (((x % 16) + 16) % 16 === 0 || up === WAINSCOT || y - y0 === 1) ? S.glow : null;
  return null;
}
function floorAt(S, x, j) {
  const n = HD.FLOORD;
  if (j === n - 1) return S.wood[4];
  if (j === n - 2) return S.floor === 'light' ? S.glow : S.floor === 'carpet' ? S.gold[2] : S.gold[3];
  switch (S.floor) {
    case 'logs': { const r = Math.floor(j / 3), k = j % 3; return k === 0 ? S.wood[1] : k === 2 ? S.wood[3] : (x + r * 5) % 23 === 0 ? S.wood[3] : S.wood[2]; }
    case 'planks': { const r = Math.floor(j / 2); if ((x + r * 13) % 29 === 0) return S.wood[4]; return j % 2 === 0 ? S.wood[2] : mix(S.wood[1], S.wood[2], 0.5); }
    case 'flags': { const r = Math.floor(j / 3), off = (r & 1) * 7, k = (((x + off) % 14) + 14) % 14; if (j % 3 === 2 || k === 0) return S.stone[4]; return h32(Math.floor((x + off) / 14), r, 5) % 4 === 0 ? S.stone[2] : S.stone[1]; }
    case 'checker': { const r = Math.floor(j / 3), k = Math.floor((x + 400) / 9); return (k + r) & 1 ? S.stone[0] : '#3a2a2a'; }
    case 'terrazzo': { const r = Math.floor(j / 3), k = Math.floor((x + 400) / 8); return (k + r) & 1 ? '#f4f0f2' : '#1e1e26'; }
    case 'light': { const k = ((x % 12) + 12) % 12; return k === 0 || j % 4 === 3 ? S.glow : S.wood[1]; }
    case 'mosaic': {                                         // la mosaïque : tesselles blanches, une vague noire
      if (j === 4 || j === 5) { const k = (((x + (j === 5 ? 3 : 0)) % 8) + 8) % 8; return k < 4 ? '#2a1e1a' : '#efe6d6'; }
      if (j === 3 || j === 6) return '#2a1e1a';
      return (x + j * 3) % 5 === 0 ? '#ded4c0' : (x * 7 + j) % 11 === 0 ? '#c8443a' : '#f2eadc';
    }
    case 'carpet': {                                         // la moquette de casino : bordeaux, losanges d'or, points canard
      const r = Math.floor(j / 3), off = (r & 1) * 6, m = (((x + off) % 12) + 12) % 12, q = j % 3;
      if ((m === 5 || m === 6) && q === 1) return '#d8a640';
      if ((m === 4 || m === 7) && q === 1) return '#8a2a3a';
      if (m === 0 && q === 0) return '#2a8a8a';
      return q === 2 ? '#4a1222' : '#5e1a2c';
    }
    case 'polished': {                                       // la dalle polie des cités cosmiques, et ses reflets
      const c = S.cosmo, band = ((x - j * 3) % 23 + 23) % 23 < 3;
      if (c === 'jade') { if (j === 3) return S.gold[2]; return band ? JADE[2] : (Math.floor((x + 400) / 16) + (j > 3 ? 1 : 0)) & 1 ? JADE[3] : mix(JADE[3], JADE[4], 0.5); }
      if (c === 'astral') { if (j === 3) return NACRE[1]; if (h32(x, j, 21) % 37 === 0) return S.gold[0]; return band ? NAVY[1] : NAVY[2]; }
      { const k = (((x + (j > 5 ? 6 : 0)) % 12) + 12) % 12; if (k === 0 || j === 5) return LILAC[3]; return band ? LILAC[0] : j < 5 ? LILAC[1] : LILAC[2]; }
    }
    default: return parquetAt(S, x, j);
  }
}
function ceilAt(S, x, j) {
  if (j === 0) return INK;
  switch (S.ceil) {
    case 'tent': return j === HD.CEIL - 1 ? S.wood[2] : (Math.floor((x + 400) / 10) & 1) ? mix(S.velvet[2], INK, 0.25) : mix(S.paper[1], INK, 0.2);
    case 'rafters': return j === HD.CEIL - 1 ? S.wood[3] : x % 16 < 2 ? S.wood[4] : (x + j) % 3 === 0 ? '#b89048' : '#9a7836';
    case 'beams': return j === HD.CEIL - 1 ? S.wood[3] : x % 14 < 3 ? S.wood[3] : mix(S.stone[2], INK, 0.15);
    case 'marble': return j === HD.CEIL - 1 ? S.gold[2] : x % 20 < 2 ? S.gold[3] : x % 20 === 10 && j === 3 ? S.gold[1] : mix(S.stone[2], INK, 0.1);
    case 'panels': return j === HD.CEIL - 2 ? S.neon : j === HD.CEIL - 1 ? S.gold[2] : x % 24 < 1 ? S.gold[3] : S.gold[4];
    case 'glow': return j === HD.CEIL - 2 ? S.glow : j === HD.CEIL - 1 ? S.wood[3] : S.wood[2];
    default: return cofferAt(S, x, j);
  }
}

// ── Les luminaires ───────────────────────────────────────────────────────────
// `y` : sous le plafond. La torche du campement se plante au mur.
function lamp(P, N, S, pal, x, y) {
  const L = (px, py, c) => { P.put(px, py, c); N.put(px, py, c); };
  switch (S.light) {
    case 'gas': case 'chandelier': chandelier(P, N, pal, x, y); return;
    case 'torch': {                                         // la torche dans son anneau de corde
      const ty = y + 16;
      for (let j = 0; j < 12; j += 1) { P.put(x, ty + j, S.wood[1]); P.put(x + 1, ty + j, S.wood[3]); }
      P.rect(x - 1, ty, 4, 3, S.paper[3]); P.hline(x - 1, ty, 4, S.paper[2]);           // la poix
      P.hline(x - 2, ty + 7, 6, S.wood[4]); P.hline(x - 2, ty + 8, 6, S.wood[3]);       // l'anneau
      flame({ N }, P, x, ty - 1, 9);
      return;
    }
    case 'lantern': {                                       // la lanterne de papier rouge
      P.vline(x, y, 5, '#3a2a22');
      for (let j = 0; j < 9; j += 1) {
        const hw = j === 0 || j === 8 ? 2 : j === 1 || j === 7 ? 3 : 4;
        for (let i = -hw; i <= hw; i += 1) {
          const c = j === 0 || j === 8 ? S.gold[2] : i === 0 || Math.abs(i) === 3 ? '#a82a2a' : i < 0 ? '#ff7a52' : '#e8483a';
          P.put(x + i, y + 5 + j, c);
          if (j > 0 && j < 8) N.put(x + i, y + 5 + j, i < 0 ? '#ffb070' : '#ff8a5a');
        }
      }
      P.put(x, y + 14, S.gold[3]); P.put(x, y + 15, '#e8483a');
      P.mark(x, y + 9, '#ff9a6a');
      return;
    }
    case 'brazier': {                                       // la lampe à huile de bronze, à chaînes
      for (let j = 0; j < 8; j += 1) { P.put(x - 4 + (j >> 1), y + j, S.gold[3]); P.put(x + 4 - (j >> 1), y + j, S.gold[3]); }
      P.rect(x - 5, y + 8, 11, 2, S.gold[2]); P.hline(x - 4, y + 10, 9, S.gold[3]); P.hline(x - 6, y + 8, 13, S.gold[1]);
      for (const [dx, dy, c] of [[-3, 7, '#ff9a3a'], [0, 7, '#ffb35c'], [3, 7, '#ff9a3a'], [0, 6, '#ffe9a0'], [-3, 6, '#ffe9a0'], [3, 6, '#ffe9a0']]) L(x + dx, y + dy, c);
      P.mark(x, y + 7, '#ffb070');
      return;
    }
    case 'wheel': {                                         // la roue de bougies, ferrée
      for (let j = 0; j < 6; j += 1) { P.put(x - 7 + j, y + j, S.iron[3]); P.put(x + 7 - j, y + j, S.iron[3]); }
      P.vline(x, y, 6, S.iron[3]);
      P.ellipse(x, y + 7, 10, 2, (i, j) => ((i * i) / 100 + (j * j) / 4 > 0.45 ? (j < 0 ? S.wood[1] : S.wood[3]) : null));
      for (const dx of [-8, -4, 0, 4, 8]) { P.vline(x + dx, y + 3, 3, '#f6efd8'); L(x + dx, y + 2, '#ffe9a0'); L(x + dx, y + 1, '#fffbe8'); }
      P.mark(x, y + 4, '#ffd08a');
      return;
    }
    case 'lucerna': {                                       // la lampe à huile de bronze, pendue à ses chaînes
      for (let j = 0; j < 7; j += 1) { P.put(x - 3 + (j >> 1), y + j, S.gold[3]); P.put(x + 3 - (j >> 1), y + j, S.gold[3]); }
      for (let i = -5; i <= 5; i += 1) { P.put(x + i, y + 7, S.gold[1]); P.put(x + i, y + 8, S.gold[2]); if (Math.abs(i) < 4) P.put(x + i, y + 9, S.gold[3]); }
      P.put(x + 6, y + 7, S.gold[2]); P.put(x - 6, y + 7, S.gold[2]);
      flame({ N }, P, x + 6, y + 6, 4, 2); flame({ N }, P, x - 6, y + 6, 4, 2);
      return;
    }
    case 'globe': {                                         // le globe dépoli du casino, sur sa tige de chrome
      P.vline(x, y, 6, S.gold[2]); P.put(x, y, S.gold[3]);
      P.rect(x - 2, y + 6, 5, 1, S.gold[1]);
      for (let j = -4; j <= 4; j += 1) for (let i = -4; i <= 4; i += 1) {
        if (i * i + j * j > 18) continue;
        const c = i + j < -3 ? '#ffffff' : i + j < 1 ? '#fff0f6' : i + j < 4 ? '#ffd2e6' : '#f0a8c8';
        L(x + i, y + 11 + j, c);
      }
      P.mark(x, y + 11, '#ffc4dc');
      return;
    }
    case 'paperlantern': {                                  // la lanterne de papier rouge du Jade
      P.vline(x, y, 4, S.gold[3]);
      for (let j = 0; j < 11; j += 1) {
        const hw = j === 0 || j === 10 ? 2 : j === 1 || j === 9 ? 4 : 5;
        for (let i = -hw; i <= hw; i += 1) {
          const cap = j === 0 || j === 10;
          const c = cap ? S.gold[1] : Math.abs(i) === 2 || Math.abs(i) === 5 ? '#a82a2a' : i < 0 ? '#ff7a52' : '#e8483a';
          P.put(x + i, y + 4 + j, c);
          if (!cap) N.put(x + i, y + 4 + j, i < -1 ? '#ffd0a0' : i < 2 ? '#ffb070' : '#ff8a5a');
        }
      }
      for (let j = 0; j < 4; j += 1) P.put(x, y + 15 + j, j === 3 ? S.gold[1] : '#e8483a');
      P.mark(x, y + 9, '#ff9a6a');
      return;
    }
    case 'hornlantern': {                                   // la lanterne de bois et de corne du village
      P.vline(x, y, 4, S.wood[3]);
      for (let j = 0; j < 11; j += 1) for (let i = -3; i <= 3; i += 1) {
        const frame = j === 0 || j === 1 || j === 10 || Math.abs(i) === 3;
        const pane = !frame && (i === 0 ? false : true);
        const c = frame ? (j === 0 ? S.wood[1] : S.wood[3]) : pane ? (j < 5 ? '#ffe2a0' : '#f0b860') : S.wood[2];
        P.put(x + i, y + 4 + j, c);
        if (pane) N.put(x + i, y + 4 + j, j < 5 ? '#fff0c0' : '#ffc870');
      }
      P.put(x, y + 3, S.wood[1]); P.hline(x - 1, y + 2, 3, S.wood[2]);
      P.mark(x, y + 9, '#ffc070');
      return;
    }
    case 'starorb': {                                       // l'orbe-étoile de l'Astral, qui flotte
      for (let j = -3; j <= 3; j += 1) for (let i = -3; i <= 3; i += 1) if (i * i + j * j <= 9) L(x + i, y + 10 + j, i + j < -2 ? '#ffffff' : i + j < 2 ? '#fff4c8' : S.glow);
      for (let t = 4; t <= 7; t += 1) { const c = t < 6 ? '#fff4c8' : S.glow2; L(x - t, y + 10, c); L(x + t, y + 10, c); L(x, y + 10 - t, c); L(x, y + 10 + t, c); }
      P.mark(x, y + 10, S.glow);
      return;
    }
    case 'crystal': {                                       // la grappe d'améthyste qui pend, son cœur allumé
      P.vline(x, y, 3, S.iron[3]);
      for (const [dx, len, wd] of [[0, 12, 2], [-4, 8, 1], [4, 9, 1], [-2, 6, 1], [3, 5, 1]]) {
        for (let j = 0; j < len; j += 1) {
          const half = wd * (1 - j / (len + 1)) + 0.4;
          for (let i = -Math.ceil(half); i <= Math.ceil(half); i += 1) {
            if (Math.abs(i) > half) continue;
            const c = j > len - 3 ? '#ffffff' : i < 0 ? '#e8d8ff' : i === 0 ? '#c4a4f4' : '#9a6ee0';
            P.put(x + dx + i, y + 3 + j, c);
            if (j > len * 0.4) N.put(x + dx + i, y + 3 + j, i <= 0 ? '#f4eaff' : '#d8b8ff');
          }
        }
      }
      P.mark(x, y + 10, S.glow);
      return;
    }
    case 'neon': {                                          // l'anneau de néon
      P.vline(x, y, 4, S.gold[3]);
      for (let a = 0; a < 64; a += 1) {
        const t = (a / 64) * Math.PI * 2, px = x + Math.round(Math.cos(t) * 10), py = y + 7 + Math.round(Math.sin(t) * 3);
        L(px, py, a < 32 ? S.neon : mix(S.neon, '#ffffff', 0.3));
      }
      P.mark(x, y + 7, S.neon);
      return;
    }
    default: {                                              // l'orbe de lumière
      for (let j = -3; j <= 3; j += 1) for (let i = -3; i <= 3; i += 1) if (i * i + j * j <= 10) L(x + i, y + 9 + j, i + j < -2 ? '#ffffff' : S.glow);
      for (const [dx, dy] of [[-5, 9], [5, 9], [0, 4], [0, 14]]) N.put(x + dx, y + dy, S.glow2);
      P.mark(x, y + 9, S.glow);
    }
  }
}

// ── L'ornement des murs, âge par âge ─────────────────────────────────────────
function decorPiece(P, N, S, pal, kind, x, yC, k) {
  switch (kind) {
    case 'window': if (S.wall !== 'hide') windowBay(P, N, S, x, yC + 9, 17); return;
    case 'mirror': ovalMirror(P, S, x, yC + 18); return;
    case 'paintingSconces': painting(P, S, x - 10, yC + 8, 20, 14, k); sconce(P, N, pal, x - 16, yC + 9); sconce(P, N, pal, x + 16, yC + 9); return;
    case 'paintingTall': painting(P, S, x - 7, yC + 7, 14, 18, k + 1); return;
    case 'furs': {                                          // une peau tendue sur un cadre de branches
      const V = S.velvet;
      for (let j = 0; j < 16; j += 1) {
        const hw = 6 - Math.abs(j - 7) * 0.4;
        for (let i = -Math.round(hw); i <= Math.round(hw); i += 1) P.put(x + i, yC + 8 + j, (i + j) % 5 === 0 ? V[3] : i < -2 ? V[1] : V[2]);
      }
      for (const [dx, dy] of [[-8, 6], [8, 6], [-8, 25], [8, 25]]) P.put(x + dx, yC + dy, S.wood[3]);
      P.hline(x - 8, yC + 7, 17, S.wood[2]);
      return;
    }
    case 'antlers': {                                       // des bois de cerf, un crâne
      P.rect(x - 2, yC + 12, 5, 5, S.gold[1]); P.put(x - 1, yC + 14, INK); P.put(x + 1, yC + 14, INK);
      for (let t = 0; t < 8; t += 1) { P.put(x - 3 - t, yC + 11 - (t >> 1), S.gold[2]); P.put(x + 3 + t, yC + 11 - (t >> 1), S.gold[2]); }
      for (const dx of [-6, -9, 6, 9]) { P.put(x + dx, yC + 6, S.gold[1]); P.put(x + dx, yC + 7, S.gold[2]); }
      return;
    }
    case 'shield': {                                        // un bouclier peint
      P.ellipse(x, yC + 16, 7, 8, (i, j) => ((i * i) / 49 + (j * j) / 64 > 0.65 ? S.gold[2] : ((i > 0) !== (j > 0)) ? S.velvet[2] : S.cream[1]));
      P.put(x, yC + 16, S.gold[1]);
      return;
    }
    case 'tapestry': {                                      // la tapisserie à la licorne
      const V = S.velvet;
      P.hline(x - 10, yC + 6, 21, S.wood[2]);
      for (let j = 0; j < 22; j += 1) for (let i = -9; i <= 9; i += 1) {
        let c = (i + j) % 9 === 0 ? V[3] : V[2];
        if (Math.abs(i) === 9 || j === 21) c = S.gold[2];
        if ((i - 1) ** 2 + (j - 10) ** 2 < 10) c = S.cream[1];
        P.put(x + i, yC + 7 + j, c);
      }
      for (let i = -9; i <= 9; i += 2) P.put(x + i, yC + 29, S.gold[1]);
      return;
    }
    case 'amphoraNiche': {                                  // la niche et son amphore
      for (let j = 0; j < 22; j += 1) for (let i = -7; i <= 7; i += 1) {
        const arc = j < 7 ? Math.sqrt(49 - (7 - j) ** 2) : 7;
        if (Math.abs(i) > arc) continue;
        P.put(x + i, yC + 7 + j, mix(S.stone[3], INK, 0.3));
      }
      P.ellipse(x, yC + 22, 4, 5, (i) => (i < -1 ? '#d07a4a' : '#a8582e'));
      P.rect(x - 1, yC + 15, 3, 3, '#a8582e'); P.hline(x - 3, yC + 15, 7, '#d07a4a');
      return;
    }
    case 'neonSign': {                                      // une enseigne au néon (cœur, étoile)
      const sh = k & 1 ? ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'] : ['...#...', '..###..', '#######', '.#####.', '.##.##.', '#.....#'];
      sh.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { const c = k & 1 ? S.neon : S.neon2; P.put(x - 3 + i, yC + 12 + j, c); N.put(x - 3 + i, yC + 12 + j, c); } }));
      return;
    }
    case 'mirrorDeco': {                                    // le miroir rond aux rayons d'or
      const G = S.gold;
      for (let t = 0; t < 24; t += 1) {
        const a = (t / 24) * Math.PI * 2, len = t % 2 ? 4 : 6;
        for (let r = 9; r < 9 + len; r += 1) P.put(x + Math.round(Math.cos(a) * r), yC + 18 + Math.round(Math.sin(a) * r * 0.9), r === 8 + len ? G[3] : G[1]);
      }
      P.ellipse(x, yC + 18, 8, 7, (i, j) => ((i * i) / 64 + (j * j) / 49 > 0.75 ? G[2] : i < -2 && j < -2 ? '#e8eef6' : (i + j) % 6 === 0 ? '#b8c4d4' : '#8a96aa'));
      return;
    }
    case 'windowCity': {                                    // une baie sur la ville la nuit, cadre de chrome
      const G = S.gold, w = 22, h = 24, x0 = x - 11, y0 = yC + 6;
      for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
        const e = i === 0 || j === 0 || i === w - 1 || j === h - 1;
        if (e) { P.put(x0 + i, y0 + j, i === 0 || j === 0 ? G[1] : G[3]); continue; }
        const bh = 6 + (h32(Math.floor((x0 + i) / 4), 5, 2) % 13), sky = j < h - bh;
        let c = sky ? (j < 8 ? '#1e2450' : '#2a3168') : '#141834';
        if (!sky && (i % 3 === 1) && (j % 3 === 1) && h32(x0 + i, j, 3) % 3) { c = '#ffd890'; N.put(x0 + i, y0 + j, '#ffe4a8'); }
        if (sky && h32(x0 + i, j, 9) % 41 === 0) c = '#e8ecff';
        P.put(x0 + i, y0 + j, c);
      }
      P.hline(x0 - 2, y0 + h, w + 4, G[2]);
      return;
    }
    case 'fresco': {                                        // un petit tableau de fresque : une danseuse en voiles
      for (let j = 0; j < 18; j += 1) for (let i = -9; i <= 9; i += 1) {
        const e = Math.min(i + 9, 9 - i, j, 17 - j);
        P.put(x + i, yC + 9 + j, e === 0 ? '#1e1414' : e === 1 ? '#e0b050' : j > 14 ? '#6a5a3a' : '#2a1a1a');
      }
      for (const [dx, dy, c] of [[0, 3, '#e8b890'], [0, 4, '#e8b890'], [-1, 5, '#f0e0c8'], [0, 5, '#f0e0c8'], [1, 5, '#f0e0c8'], [-2, 6, '#f0e0c8'], [0, 6, '#f0e0c8'], [2, 6, '#e8b890'], [0, 7, '#f0e0c8'], [-1, 8, '#f0e0c8'], [1, 8, '#f0e0c8'], [-2, 9, '#c8a878'], [2, 9, '#c8a878'], [-3, 7, '#d86a8a'], [3, 5, '#d86a8a'], [4, 4, '#d86a8a']]) P.put(x + dx, yC + 10 + dy, c);
      return;
    }
    case 'moonwindow': {                                    // la fenêtre lune du Jade, son treillis, la brume
      for (let j = -10; j <= 10; j += 1) for (let i = -10; i <= 10; i += 1) {
        const d = Math.sqrt(i * i + j * j);
        if (d > 10) continue;
        let c = d > 8.6 ? (i + j < 0 ? LACQUER[0] : LACQUER[2]) : j < 2 ? mix('#b8e4f0', '#e8f8f4', (j + 8) / 10) : '#7ab89a';
        if (d <= 8.6 && (i % 5 === 0 || j % 5 === 0) && Math.abs(i) + Math.abs(j) > 3) c = LACQUER[1];
        P.put(x + i, yC + 20 + j, c);
      }
      return;
    }
    case 'scroll': {                                        // le rouleau pendu : un bambou à l'encre
      P.hline(x - 6, yC + 7, 13, LACQUER[2]); P.hline(x - 6, yC + 31, 13, LACQUER[2]);
      for (let j = 0; j < 23; j += 1) for (let i = -5; i <= 5; i += 1) P.put(x + i, yC + 8 + j, (i + j) % 13 === 0 ? '#ece4d0' : '#f6f0e0');
      for (let j = 0; j < 19; j += 1) { P.put(x - 1, yC + 10 + j, j % 6 === 0 ? '#1e3a2a' : '#2e5a42'); if (j % 6 === 2) { P.put(x, yC + 9 + j, '#2e5a42'); P.put(x + 1, yC + 8 + j, '#2e5a42'); P.put(x + 2, yC + 8 + j, '#2e5a42'); } }
      P.put(x + 3, yC + 12, '#c83a3a'); P.put(x + 3, yC + 13, '#c83a3a');
      return;
    }
    case 'starmap': {                                       // la carte du ciel : cercles d'or, étoiles
      for (let j = -10; j <= 10; j += 1) for (let i = -10; i <= 10; i += 1) {
        const d = Math.sqrt(i * i + j * j);
        if (d > 10) continue;
        let c = d > 9 ? S.gold[1] : Math.abs(d - 6) < 0.5 || Math.abs(i) < 0.5 || Math.abs(j) < 0.5 ? S.gold[3] : NAVY[2];
        if (h32(i, j, 31) % 13 === 0 && d < 9) { c = '#fff4c8'; N.put(x + i, yC + 20 + j, '#fff4c8'); }
        P.put(x + i, yC + 20 + j, c);
      }
      return;
    }
    case 'moonphase': {                                     // les phases de la lune, en frise
      for (let k = 0; k < 5; k += 1) for (let j = -2; j <= 2; j += 1) for (let i = -2; i <= 2; i += 1) {
        if (i * i + j * j > 5) continue;
        const lit = k === 2 ? true : k < 2 ? i < 2 - k * 2 : i > -2 + (4 - k) * 2 - 2;
        P.put(x - 12 + k * 6 + i, yC + 16 + j, lit ? '#fff4d8' : NAVY[1]);
      }
      return;
    }
    case 'geodeMirror': {                                   // le miroir ovale serti d'améthystes
      P.ellipse(x, yC + 19, 7, 10, (i, j) => ((i * i) / 49 + (j * j) / 100 > 0.72 ? ((i + j) & 1 ? AMETH[1] : AMETH[3]) : i < -2 && j < -2 ? '#ffffff' : (i + j) % 6 === 0 ? LILAC[1] : LILAC[2]));
      for (const [dx, dy] of [[-7, -6], [7, -4], [-6, 7], [6, 8], [0, -11]]) { P.put(x + dx, yC + 19 + dy, '#f6eeff'); P.put(x + dx, yC + 20 + dy, AMETH[2]); }
      return;
    }
    case 'prism': {                                         // le prisme et son arc-en-ciel sur le mur
      for (let j = 0; j < 8; j += 1) for (let i = -j; i <= j; i += 1) P.put(x - 6 + i, yC + 14 + j, i < 0 ? '#ffffff' : LILAC[2]);
      const rb = ['#ff6a6a', '#ffb05a', '#ffe86a', '#6ad88a', '#6ab0ff', '#a86aff'];
      for (let t = 0; t < 14; t += 1) rb.forEach((c, k) => P.put(x - 1 + t, yC + 17 + k + Math.round(t * 0.25), mix(c, LILAC[1], t / 16)));
      return;
    }
    case 'poster': {                                        // une affiche de revue
      P.rect(x - 7, yC + 7, 15, 20, '#1c1216');
      P.rect(x - 6, yC + 8, 13, 18, k % 3 === 0 ? '#e8489a' : '#f0cf6a');
      P.ellipse(x, yC + 15, 3, 4, '#2a2030'); P.rect(x - 2, yC + 19, 5, 5, '#2a2030');
      P.hline(x - 5, yC + 25, 11, '#ffffff');
      return;
    }
    case 'glyph': {                                         // un glyphe de lumière
      for (let j = 0; j < 14; j += 1) { P.put(x, yC + 9 + j, S.glow); N.put(x, yC + 9 + j, S.glow); }
      for (const [dx, dy] of [[-3, 12], [3, 12], [-2, 16], [2, 16], [-4, 20], [4, 20]]) { P.put(x + dx, yC + dy, S.glow2); N.put(x + dx, yC + dy, S.glow2); }
      return;
    }
    default: painting(P, S, x - 10, yC + 8, 20, 14, k); void pal;
  }
}

// ── Le mobilier des halls ────────────────────────────────────────────────────
function hallPieceHD(kind, O, R, S, x, y) {
  const yb = y + FOOT - 1;
  switch (kind) {
    case 'palm': return palm(O, R, S, x, y);
    case 'statue': return statue(O, R, S, x, y);
    case 'coat': return coatRack(O, R, S, x, y);
    case 'totem': {
      contactShadow(R, x - 4, x + 4, yb + 1);
      piece(O, x - 6, yb - 34, 13, 35, (P) => {
        const cols = [S.velvet[2], S.wood[1], S.velvet[3], S.wood[2]];
        for (let j = 0; j < 32; j += 1) P.hline(x - 3, yb - j, 7, cols[Math.floor(j / 8) % 4]);
        for (let k = 0; k < 4; k += 1) { P.put(x - 2, yb - 4 - k * 8, INK); P.put(x + 2, yb - 4 - k * 8, INK); P.hline(x - 1, yb - 2 - k * 8, 3, S.gold[1]); }
        for (let t = 0; t < 5; t += 1) { P.put(x - 4 - t, yb - 31 + (t >> 1), S.gold[1]); P.put(x + 4 + t, yb - 31 + (t >> 1), S.gold[1]); }
      });
      return;
    }
    case 'drum': {
      contactShadow(R, x - 7, x + 7, yb + 1);
      piece(O, x - 8, yb - 14, 17, 15, (P) => {
        P.ellipse(x, yb - 12, 7, 2, S.paper[1]);
        for (let j = 0; j < 11; j += 1) for (let i = -7; i <= 7; i += 1) P.put(x + i, yb - 11 + j, (i + j) % 6 === 0 ? S.gold[2] : i < -3 ? S.velvet[1] : S.velvet[2]);
        P.hline(x - 7, yb, 15, S.wood[3]);
      });
      return;
    }
    case 'furs': {
      contactShadow(R, x - 9, x + 9, yb + 1);
      piece(O, x - 10, yb - 8, 21, 9, (P) => {
        for (let j = 0; j < 8; j += 1) for (let i = -9 + (j < 3 ? 2 : 0); i <= 9 - (j < 3 ? 2 : 0); i += 1) P.put(x + i, yb - 7 + j, (i * 2 + j) % 7 === 0 ? S.velvet[3] : j < 3 ? S.velvet[1] : S.velvet[2]);
      });
      return;
    }
    case 'barrels': {
      contactShadow(R, x - 10, x + 10, yb + 1);
      piece(O, x - 11, yb - 20, 23, 21, (P) => {
        for (const [dx, dy] of [[-5, 0], [5, 0], [0, -10]]) {
          for (let j = 0; j < 10; j += 1) for (let i = -4; i <= 4; i += 1) {
            const c = j === 2 || j === 7 ? S.iron[3] : i < -2 ? S.wood[1] : i > 2 ? S.wood[3] : S.wood[2];
            P.put(x + dx + i, yb + dy - 9 + j, c);
          }
        }
      });
      return;
    }
    case 'amphora': {
      contactShadow(R, x - 5, x + 5, yb + 1);
      piece(O, x - 6, yb - 20, 13, 21, (P) => {
        P.ellipse(x, yb - 8, 5, 7, (i, j) => (i < -2 ? '#e09060' : j > 4 ? '#8a4a24' : '#b8643a'));
        P.rect(x - 1, yb - 18, 3, 4, '#b8643a'); P.hline(x - 3, yb - 18, 7, '#e09060');
        P.put(x - 4, yb - 14, '#8a4a24'); P.put(x + 4, yb - 14, '#8a4a24');
        P.hline(x - 2, yb, 5, '#8a4a24');
        for (let i = -4; i <= 4; i += 2) P.put(x + i, yb - 8, INK);
      });
      return;
    }
    case 'brazier': {
      contactShadow(R, x - 5, x + 5, yb + 1);
      piece(O, x - 7, yb - 22, 15, 23, (P) => {
        for (let j = 0; j < 12; j += 1) { P.put(x - 1 - (j >> 1), yb - 11 + j, S.gold[3]); P.put(x + 1 + (j >> 1), yb - 11 + j, S.gold[3]); }
        P.rect(x - 5, yb - 16, 11, 4, S.gold[2]); P.hline(x - 6, yb - 16, 13, S.gold[1]);
      });
      for (const [dx, dy, c] of [[-2, -17, '#ff9a3a'], [0, -18, '#ffb35c'], [2, -17, '#ff9a3a'], [0, -19, '#ffe9a0'], [-1, -18, '#ffe9a0'], [1, -20, '#fffbe8']]) O.put(x + dx, yb + dy, c);
      O.mark(x, yb - 18, '#ffb070');
      return;
    }
    case 'armor': {
      contactShadow(R, x - 5, x + 5, yb + 1);
      piece(O, x - 7, yb - 32, 15, 33, (P) => {
        const I = S.iron;
        P.rect(x - 3, yb - 31, 7, 6, I[1]); P.hline(x - 2, yb - 28, 5, INK);
        P.rect(x - 5, yb - 24, 11, 10, I[1]); P.vline(x - 5, yb - 24, 10, I[0]); P.vline(x + 5, yb - 24, 10, I[3]);
        P.rect(x - 3, yb - 14, 3, 13, I[2]); P.rect(x + 1, yb - 14, 3, 13, I[2]);
        P.vline(x + 7, yb - 30, 30, S.wood[3]); P.put(x + 7, yb - 31, I[0]);
      });
      return;
    }
    case 'fountain': {
      contactShadow(R, x - 10, x + 10, yb + 1);
      piece(O, x - 11, yb - 24, 23, 25, (P) => {
        const St = S.stone;
        P.rect(x - 10, yb - 5, 21, 5, St[1]); P.hline(x - 10, yb - 5, 21, St[0]); P.hline(x - 9, yb - 4, 19, '#7ab8d8');
        P.rect(x - 1, yb - 16, 3, 11, St[1]); P.rect(x - 5, yb - 17, 11, 2, St[0]);
        for (const [dx, dy] of [[-3, -19], [3, -19], [-5, -20], [5, -20], [0, -21], [0, -23], [-6, -18], [6, -18]]) P.put(x + dx, yb + dy, '#a8d8f0');
      });
      return;
    }
    case 'jukebox': {
      contactShadow(R, x - 7, x + 7, yb + 1);
      piece(O, x - 8, yb - 26, 17, 27, (P) => {
        P.rect(x - 7, yb - 22, 15, 22, '#7a2333');
        P.ellipse(x, yb - 22, 7, 4, (i, j) => (j > 0 ? null : '#a2303e'));
        P.rect(x - 5, yb - 20, 11, 6, '#f0cf6a'); for (let i = -4; i <= 4; i += 2) P.put(x + i, yb - 17, '#c8434a');
        P.rect(x - 5, yb - 11, 11, 8, '#2c2f36'); for (let i = -4; i <= 4; i += 2) P.vline(x + i, yb - 10, 6, '#9aa2ad');
      });
      for (let j = 0; j < 22; j += 1) { O.put(x - 7, yb - 22 + j, S.neon2 || S.neon); O.put(x + 7, yb - 22 + j, S.neon); }
      O.mark(x, yb - 16, S.neon);
      return;
    }
    case 'laurel': {                                        // le laurier taillé, en pot de terre cuite
      contactShadow(R, x - 6, x + 6, yb + 1);
      piece(O, x - 8, yb - 26, 17, 27, (P) => {
        for (let j = 0; j < 8; j += 1) { const hw = 5 - (j > 5 ? 1 : 0); for (let i = -hw; i <= hw; i += 1) P.put(x + i, yb - 7 + j, j === 0 ? '#e09060' : i < -2 ? '#d07a48' : '#a8582e'); }
        P.vline(x, yb - 13, 6, '#6a4a2a');
        for (let j = -7; j <= 7; j += 1) for (let i = -7; i <= 7; i += 1) {
          if (i * i + j * j > 49) continue;
          P.put(x + i, yb - 19 + j, (i * 3 + j * 5) % 7 === 0 ? '#9ad070' : i + j < -3 ? '#62a24e' : i + j > 4 ? '#285428' : '#3f7a3a');
        }
      });
      return;
    }
    case 'cigarette': {                                     // le distributeur de cigarettes, chrome et tirettes
      contactShadow(R, x - 6, x + 6, yb + 1);
      piece(O, x - 7, yb - 30, 15, 31, (P) => {
        P.rect(x - 6, yb - 29, 13, 29, '#7a2333'); P.vline(x - 6, yb - 29, 29, '#a2303e'); P.vline(x + 6, yb - 29, 29, '#521827');
        P.rect(x - 5, yb - 26, 11, 10, '#f4e8d0');
        for (let j = 0; j < 3; j += 1) for (let i = 0; i < 4; i += 1) P.rect(x - 4 + i * 3, yb - 25 + j * 3, 2, 2, ['#d8404a', '#3a6ad8', '#f0cf6a', '#3a9a5a'][(i + j) % 4]);
        for (let i = 0; i < 4; i += 1) { P.rect(x - 5 + i * 3, yb - 13, 2, 3, S.gold[1]); P.put(x - 5 + i * 3, yb - 11, S.gold[3]); }
        P.rect(x - 6, yb - 6, 13, 3, S.gold[2]);
      });
      return;
    }
    case 'arcade': {
      contactShadow(R, x - 6, x + 6, yb + 1);
      piece(O, x - 7, yb - 30, 15, 31, (P) => {
        P.rect(x - 6, yb - 29, 13, 29, '#2a2f64'); P.rect(x - 5, yb - 24, 11, 8, '#1a1a20');
        for (let i = 0; i < 9; i += 1) for (let j = 0; j < 6; j += 1) if ((i + j) & 1) P.put(x - 4 + i, yb - 23 + j, S.neon2 || S.neon);
        P.rect(x - 6, yb - 14, 13, 3, '#3a3f7a'); P.put(x - 2, yb - 13, '#c8434a'); P.put(x + 2, yb - 13, '#f0cf6a');
        P.hline(x - 6, yb - 29, 13, S.neon);
      });
      O.mark(x, yb - 20, S.neon2 || S.neon);
      return;
    }
    case 'orb': {
      contactShadow(R, x - 5, x + 5, yb + 1);
      piece(O, x - 6, yb - 22, 13, 23, (P) => {
        P.rect(x - 3, yb - 6, 7, 6, S.wood[1]); P.hline(x - 4, yb - 6, 9, S.wood[0]);
        P.vline(x, yb - 11, 5, S.wood[2]);
      });
      for (let j = -5; j <= 5; j += 1) for (let i = -5; i <= 5; i += 1) if (i * i + j * j <= 26) O.put(x + i, yb - 17 + j, i + j < -3 ? '#ffffff' : S.glow);
      O.mark(x, yb - 17, S.glow);
      return;
    }
    case 'aquarium': {
      contactShadow(R, x - 11, x + 11, yb + 1);
      piece(O, x - 12, yb - 26, 25, 27, (P) => {
        P.rect(x - 11, yb - 6, 23, 6, S.wood[2]); P.hline(x - 11, yb - 6, 23, S.wood[1]);
        P.rect(x - 11, yb - 25, 23, 19, S.glass[1]);
        P.rect(x - 10, yb - 21, 21, 15, S.glow || '#3f8fb8'); P.hline(x - 10, yb - 21, 21, '#bfe8f8');
        for (const [dx, dy, c] of [[-5, -16, '#ff9a3a'], [-4, -16, '#ff9a3a'], [4, -12, '#f0cf6a'], [5, -12, '#f0cf6a']]) P.put(x + dx, yb + dy, c);
        for (const dx of [-8, 8]) { P.vline(x + dx, yb - 11, 4, '#3f7a3a'); P.put(x + dx + 1, yb - 12, '#5a9a48'); }
      });
      O.mark(x, yb - 15, S.glow || '#7ab8d8');
      return;
    }
    default: {                                             // une fougère en pot
      contactShadow(R, x - 4, x + 4, yb + 1);
      piece(O, x - 9, yb - 20, 19, 21, (P) => {
        P.rect(x - 3, yb - 5, 7, 6, S.wood[2]); P.hline(x - 4, yb - 5, 9, S.wood[1]);
        for (let a = 0; a < 7; a += 1) {
          const t = -Math.PI * (0.15 + (a / 6) * 0.7);
          for (let r = 0; r < 12; r += 1) P.put(x + Math.round(Math.cos(t) * r * 0.8), yb - 6 + Math.round(Math.sin(t) * r) + Math.round((r * r) / 40), r < 4 ? '#3f7a3a' : '#62a24e');
        }
      });
    }
  }
}

// ── LA SALLE SOUS LE TOIT ────────────────────────────────────────────────────
// La coupole (verrière du Fonte, rotonde de marbre, dôme de néon) ou le PIGNON (tente,
// chaume, tuiles, ardoise, flèche de cristal), coupé et vu de l'intérieur ; au milieu,
// l'ENGIN D'ICARE de l'âge : ses ailes de plumes et de cire, le ballon, le deltaplane,
// les ailes de lumière. Rend le haut de la salle.
function topShape(S) { return S.top === 'verriere' || S.top === 'dome' || S.top === 'neondome' ? 'dome' : 'tri'; }
function topRatio(S) { return topShape(S) === 'dome' ? 0.74 : S.top === 'spire' ? 0.95 : S.top === 'pagoda' ? 0.7 : 0.62; }
// La demi-largeur du toit de pagode à la hauteur t (0 au pied, 1 au faîte) : un profil
// creux (raide en haut, évasé en bas) et des coyaux relevés au bord.
const pagodaHalf = (rr, t) => rr * Math.pow(Math.max(0, 1 - t), 1.45) * (1 + 0.12 * Math.max(0, 1 - t / 0.1));
function topRoom(ctx, cx, yBase, wTop, open) {
  const { P, N, S, ids, spots, fig } = ctx;
  const dome = topShape(S) === 'dome';
  const r = Math.min(150, Math.round(wTop * 0.4)), ry = Math.round(r * topRatio(S)), T = 6;
  const I = S.iron, G = S.gold;
  const yF = yBase - HD.FLOORD;
  const before = ctx.snapshot();
  const pagoda = S.top === 'pagoda';
  const inside = (i, j, rr, rry) => (dome ? (i * i) / (rr * rr) + (j * j) / (rry * rry) <= 1 : pagoda ? Math.abs(i) <= pagodaHalf(rr, -j / rry) : Math.abs(i) <= rr * (1 + j / rry));
  // Le sol, en profondeur.
  for (let j = 0; j < HD.FLOORD; j += 1) {
    const half = r - T - HD.SIDE + Math.round((j * HD.SIDE) / (HD.FLOORD - 1));
    for (let i = -half; i < half; i += 1) {
      const c = S.top === 'verriere' || S.top === 'dome' ? ((Math.floor((i + 400) / 6) + Math.floor(j / 3)) & 1 ? S.cream[2] : S.stone[1]) : floorAt(S, cx + i, j);
      P.put(cx + i, yF + j, j === HD.FLOORD - 1 ? S.wood[4] : c);
    }
  }
  // La coque coupée, puis le fond.
  for (let j = -ry; j <= 0; j += 1) for (let i = -r; i <= r; i += 1) {
    if (!inside(i, j, r, ry)) continue;
    const ri = r - T, rj = ry - T;
    let c;
    if (!inside(i, j, ri, rj) || j < -rj) {
      const edge = !inside(i, j, r - 1.5, ry - 1.5);
      c = edge ? (i < 0 ? G[1] : G[3]) : (i + j) % 4 === 0 ? I[3] : I[4];
    } else c = topBack(S, i, j, ri, rj, dome);
    P.put(cx + i, yF + j, c);
    const nc = inside(i, j, ri, rj) ? topBackNight(S, i, j, ri, rj, dome) : null;
    if (nc) N.put(cx + i, yF + j, nc);
  }
  // L'ouverture au faîte (l'oculus, le trou de fumée).
  const oy = yF - ry + T + (dome ? 7 : 12);
  for (let j = -5; j <= 5; j += 1) for (let i = -8; i <= 8; i += 1) {
    const q = (i * i) / 64 + (j * j) / 25;
    if (q > 1) continue;
    P.put(cx + i, oy + j, q > 0.7 ? (i + j < 0 ? G[1] : G[3]) : S.sky[0]);
  }
  // Les rais du jour, du haut-gauche (tramés).
  const ray = S.top === 'neondome' || S.top === 'spire' ? S.glass[0] : '#fff4d8';
  for (let j = -ry + T; j < HD.FLOORD - 1; j += 1) for (let i = -r + T; i < r - T; i += 1) {
    const x = cx + i, y = yF + j;
    if (j < 0 && !inside(i, j, r - T, ry - T)) continue;
    const band = (i - j * 0.7 + 2000) % 46;
    if (band < 9 && bayer(x, y) < 0.5) P.put(x, y, mix(P.get(x, y), ray, 0.18));
  }
  topDecor(ctx, cx, yF, r, ry, T, inside);
  // L'ENGIN D'ICARE, au milieu.
  const by = yF + 5;
  if (S.craft === 'balloon') balloonCraft(ctx, cx, by);
  else if (S.craft === 'glider') gliderCraft(ctx, cx, by);
  else wingsCraft(ctx, cx, by, S.craft === 'lightwings');
  if (open.icare) fig(cx + 22, by + 2, 2, 0, 2, { role: 'aviateur' });
  fig(cx - 34, by + 3, 0, 'g', 7, { role: 'hotesse' });
  ctx.claim(before, 'icare');
  for (let y = yF - ry; y < yBase; y += 1) for (let x = cx - r; x <= cx + r; x += 1) if (!ids.get(x, y)) ids.set(x, y, 'icare');
  spots.icare = { x: cx, y: yF - Math.round(ry * 0.45), r: Math.round(r * 0.6), box: { x0: cx - r + T, y0: yF - ry + T, x1: cx + r - T, y1: yBase }, level: 99 };
  return yF - ry;
}
// Le FOND de la salle sous le toit (i, j : depuis le centre du sol ; ri, rj : l'intérieur).
function topBack(S, i, j, ri, rj, dome) {
  const I = S.iron, G = S.gold;
  if (j > -4) return I[4];                                 // le pied, dans l'ombre
  const top = -j / rj;
  if (dome) {
    const nx = i / ri, ny = j / rj, cosl = Math.sqrt(Math.max(0.0001, 1 - ny * ny));
    const lon = Math.asin(Math.max(-1, Math.min(1, nx / cosl)));
    const rib = Math.abs(((lon / Math.PI) * 9 + 50.5) % 1 - 0.5) > 0.44;
    const ring = (-j) % 13 === 0;
    if (S.top === 'dome') {                                // la rotonde : caissons de marbre, rosaces d'or
      if (rib || ring) return S.stone[3];
      const rose = Math.abs(((lon / Math.PI) * 9 + 50.5) % 1 - 0.5) < 0.12 && (-j) % 13 > 4 && (-j) % 13 < 9;
      if (rose) return G[2];
      return (Math.floor((lon / Math.PI) * 18 + 50) + Math.floor(-j / 13)) % 2 ? S.stone[1] : S.stone[2];
    }
    if (S.top === 'neondome') {                            // le dôme de verre rose sur la nuit
      if (rib || ring) return S.velvet[3];
      return mix('#2a2050', S.velvet[1], 0.15 + top * 0.2);
    }
    let c = top > 0.6 ? S.sky[1] : top > 0.3 ? S.sky[2] : S.sky[3];   // la verrière
    c = mix(c, '#d8ecf6', 0.35);
    if ((i - j * 2 + 400) % 31 < 2 && top > 0.25) c = '#f4fafc';
    if (rib || ring) c = I[top > 0.5 ? 2 : 3];
    return c;
  }
  // Le pignon : les chevrons convergent au faîte.
  const half = S.top === 'pagoda' ? pagodaHalf(ri, top) : ri * (1 + j / rj), u = half ? i / half : 0;
  const rafter = Math.abs((((u + 1) * 5) % 1) - 0.5) > 0.42;
  switch (S.top) {
    case 'tent': return Math.floor((u + 1) * 6) & 1 ? S.velvet[2] : S.paper[1];
    case 'thatch': return rafter ? S.wood[4] : (i + j * 3) % 5 === 0 ? '#8a6a2c' : (i + j) % 3 === 0 ? '#c8a050' : '#a88438';
    case 'tiles': return rafter ? S.wood[3] : (-j) % 5 === 0 ? S.wood[4] : (-j) % 5 === 1 ? '#c86a40' : '#a8502e';
    case 'slate': return rafter ? S.wood[3] : (-j) % 6 === 0 ? S.wood[4] : mix(S.stone[2], INK, 0.1);
    case 'pagoda': {                                        // la charpente de la pagode, vue de dedans
      const ring = (-j) % 14 === 0;
      if (S.cosmo === 'jade') return rafter ? LACQUER[1] : ring ? S.gold[2] : (i + j * 2) % 9 === 0 ? '#2a161a' : '#3a2226';
      if (S.cosmo === 'astral') return rafter || ring ? S.gold[2] : astralStar(i + 400, -j) ? '#fff4c8' : NAVY[2];
      return rafter ? AMETH[2] : ring ? AMETH[1] : top > 0.5 ? LILAC[1] : LILAC[2];
    }
    default: return rafter ? S.glow : mix(S.glass[1], S.glass[2], top);          // la flèche de cristal
  }
}
function topBackNight(S, i, j, ri, rj, dome) {
  if (j > -4) return null;
  if (S.top === 'neondome' && dome) {
    const nx = i / ri, ny = j / rj, cosl = Math.sqrt(Math.max(0.0001, 1 - ny * ny));
    const lon = Math.asin(Math.max(-1, Math.min(1, nx / cosl)));
    return Math.abs(((lon / Math.PI) * 9 + 50.5) % 1 - 0.5) > 0.44 ? S.neon : null;
  }
  if (S.top === 'spire') {
    const half = ri * (1 + j / rj), u = half ? i / half : 0;
    return Math.abs((((u + 1) * 5) % 1) - 0.5) > 0.42 ? S.glow : null;
  }
  if (S.top === 'pagoda' && S.cosmo === 'astral') return astralStar(i + 400, -j) ? '#fff4c8' : null;
  return null;
}
// Ce qui meuble la salle sous le toit, âge par âge.
function topDecor(ctx, cx, yF, r, ry, T, inside) {
  const { P, O, N, S, fig } = ctx;
  const light = S.top === 'spire' || S.top === 'pagoda';
  const green = light ? [S.glow, S.glow2, mix(S.glow2, INK, 0.3), mix(S.glow2, INK, 0.5)] : ['#9ad070', '#62a24e', '#3f7a3a', '#285428'];
  // Un massif sous les verrières, les dômes et la pagode ; sous les pentes de chaume, de
  // tuile et d'ardoise, ce qu'on range au grenier.
  const attic = S.top === 'tent' || S.top === 'thatch' || S.top === 'tiles' || S.top === 'slate';
  if (!attic) {
    // Un massif au pied du fond (fougères, ou plantes de lumière).
    for (let i = -r + T + 4; i < r - T - 4; i += 1) {
      const hgt = 5 + Math.round(3 * Math.abs(Math.sin(i * 0.37)) + 2 * Math.abs(Math.sin(i * 0.13)));
      for (let j = 0; j < hgt; j += 1) {
        const y = yF - 1 - j;
        if (!inside(i, y - yF, r - T, ry - T)) continue;
        const tip = j === hgt - 1;
        if (tip && (i & 1)) continue;
        P.put(cx + i, y, tip ? green[0] : (i + j) % 3 === 0 ? green[2] : j < 2 ? green[3] : green[1]);
      }
    }
  } else {
    // Des peaux et des tonneaux le long du bas des pentes.
    for (const fx of [-0.55, 0.55]) hallPieceHD(S.top === 'tent' ? 'furs' : S.top === 'thatch' ? 'amphora' : 'barrels', O, P, S, cx + Math.round((r - T) * fx), yF);
  }
  // Les lampes pendues sous la voûte.
  for (const fx of [-0.45, 0.45]) {
    const lx = cx + Math.round((r - T) * fx);
    let top = yF;
    while (top > yF - ry && inside(lx - cx, top - 1 - yF, r - T, ry - T)) top -= 1;
    for (let y = top; y < top + 8; y += 1) P.put(lx, y, '#3a2a22');
    lamp(P, N, S, ctx.pal, lx, top + 6);
  }
  fig(cx - 70, yF + 5, 0, 1, 11);
  fig(cx - 58, yF + 6, 2, 'g', 12);
  fig(cx + 62, yF + 6, 2, 0, 13);
  const side = { tent: 'totem', thatch: 'drum', tiles: 'brazier', slate: 'armor', dome: 'statue', spire: 'orb', pagoda: 'orb' }[S.top] || 'palm';
  hallPieceHD(side, O, P, S, cx - r + T + 28, yF);
  hallPieceHD(side, O, P, S, cx + r - T - 28, yF);
  // La lunette de l'astronome, à partir de Rome.
  if (!attic) telescopeHD(O, P, S, cx + r - T - 58, yF + 4);
}
// LE BALLON du Fonte (nacelle d'osier, brûleur, amarres, fuseaux rayés).
function balloonCraft(ctx, cx, by) {
  const { O, N, S } = ctx;
  const I = S.iron;
  piece(O, cx - 26, by - 4, 53, 6, (Q) => {
    Q.rect(cx - 26, by - 3, 53, 3, S.wood[2]); Q.hline(cx - 26, by - 4, 53, S.wood[1]);
    for (let i = -24; i <= 24; i += 8) Q.vline(cx + i, by - 1, 2, S.wood[3]);
  });
  for (const s of [-1, 1]) for (let t = 0; t < 16; t += 1) O.put(cx + s * (7 + t), by - 12 + Math.round(t * 0.55), '#5a4030');
  piece(O, cx - 7, by - 13, 15, 10, (Q) => {
    for (let j = 0; j < 9; j += 1) for (let i = -7; i <= 7; i += 1) Q.put(cx + i, by - 13 + j, j === 0 ? '#e0b878' : (i + j) & 1 ? '#a87a40' : '#8a6030');
  });
  O.rect(cx - 2, by - 17, 5, 4, I[2]);
  for (const [dx, dy, c] of [[0, -18, '#ffb35c'], [1, -18, '#ffe9a0'], [0, -19, '#fffbe8'], [-1, -18, '#ffb35c']]) { O.put(cx + dx, by + dy, c); N.put(cx + dx, by + dy, c); }
  O.mark(cx, by - 20, '#ffb35c');
  for (const dx of [-6, 6]) for (let j = 0; j < 9; j += 1) O.put(cx + dx + Math.round((dx * j) / 18), by - 14 - j, '#3a2a22');
  const ecy = by - 52, erx = 20, ery = 24;
  for (let j = -ery; j <= ery + 6; j += 1) for (let i = -erx; i <= erx; i += 1) {
    const jj = j > 0 ? j * 0.8 : j, q = (i * i) / (erx * erx) + (jj * jj) / (ery * ery);
    const taper = j > ery * 0.45 ? 1 - (j - ery * 0.45) / (ery * 0.95) : 1;
    if (q > 1 || Math.abs(i) > erx * Math.max(0.2, taper)) continue;
    const w0 = erx * Math.max(0.3, Math.sqrt(Math.max(0, 1 - (jj * jj) / (ery * ery))));
    const gore = Math.floor((Math.asin(Math.max(-1, Math.min(1, i / w0))) / Math.PI + 0.5) * 8);
    const L = (-i / erx) * 0.6 - (j / ery) * 0.4;
    const pl = gore & 1 ? [S.cream[0], S.cream[1], S.cream[3]] : [S.velvet[0], S.velvet[2], S.velvet[4]];
    O.put(cx + i, ecy + j, L > 0.35 ? pl[0] : L > -0.25 ? pl[1] : pl[2]);
  }
}
// LES AILES d'Icare sur leur chevalet (plumes et cire), ou ailes de LUMIÈRE.
function wingsCraft(ctx, cx, by, light) {
  const { O, N, S } = ctx;
  if (!light) piece(O, cx - 3, by - 30, 7, 31, (Q) => {
    Q.vline(cx, by - 30, 30, S.wood[2]); Q.vline(cx + 1, by - 30, 30, S.wood[3]);
    Q.hline(cx - 3, by - 1, 7, S.wood[3]);
  });
  const fea = light ? [S.glow, S.glow2, '#ffffff'] : ['#fffaf0', '#e6d4ae', '#f0d080'];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 26; k += 1) {
      const yy = by - 30 - Math.round(Math.sin((k / 26) * Math.PI * 0.8) * 10) + Math.round((k * k) / 60);
      const len = 14 - Math.floor(k / 3);
      for (let j = 0; j < len; j += 1) {
        const c = j === 0 ? fea[2] : k % 3 === 0 ? fea[1] : fea[0];
        O.put(cx + s * (k + 2), yy + j, c);
        if (light) N.put(cx + s * (k + 2), yy + j, c);
      }
    }
  }
  if (light) O.mark(cx, by - 28, S.glow);
}
// LE DELTAPLANE du Néon, sur son rail de lancement.
function gliderCraft(ctx, cx, by) {
  const { O, N, S } = ctx;
  piece(O, cx - 30, by - 6, 61, 7, (Q) => {
    for (let i = -30; i <= 30; i += 1) Q.put(cx + i, by - 4 + Math.round(i * 0.05), S.gold[2]);
    for (let i = -24; i <= 24; i += 12) Q.vline(cx + i, by - 3, 4, S.gold[3]);
  });
  for (let k = 0; k < 34; k += 1) for (const s of [-1, 1]) {
    const yy = by - 26 + Math.round(k * 0.35);
    for (let j = 0; j < 3; j += 1) O.put(cx + s * k, yy + j, Math.floor(k / 5) & 1 ? '#f6ead0' : S.velvet[2]);
  }
  O.vline(cx, by - 26, 18, S.gold[3]);
  for (let k = 0; k < 34; k += 2) { N.put(cx - k, by - 27 + Math.round(k * 0.35), S.neon); N.put(cx + k, by - 27 + Math.round(k * 0.35), S.neon); }
}

// ── LA CIRCULATION ───────────────────────────────────────────────────────────
// Échelle (le bois), escalier tournant (la pierre, le marbre), ascenseur (la fonte, le
// verre du néon), colonne de lumière et son disque (les âges cosmiques).
function circulation(ctx, core, levels) {
  const S = ctx.S;
  if (S.circ === 'none') return;
  if (S.circ === 'lift' || S.circ === 'glasslift') { shaft(ctx, core, levels); return; }
  const { P, N } = ctx;
  const top = levels[levels.length - 1].yT, bot = levels[0].yT + HD.CEIL + HD.WALLH + HD.FLOORD;
  const x0 = core.x0, x1 = core.x1, w = x1 - x0, mid = Math.round((x0 + x1) / 2);
  const back = S.circ === 'beam' ? mix(S.glass[3], INK, 0.55) : S.circ === 'ladder' ? mix(S.wood[4], INK, 0.3) : mix(S.stone[3], INK, 0.45);
  for (let y = top; y < bot; y += 1) for (let x = x0; x < x1; x += 1) {
    const i = x - x0;
    P.put(x, y, i < 3 ? mix(back, INK, 0.4 - i * 0.1) : i > w - 3 ? mix(back, INK, 0.25) : back);
  }
  if (S.circ === 'ladder') {
    for (const rx of [x0 + 9, x1 - 10]) for (let y = top; y < bot; y += 1) { P.put(rx, y, S.wood[1]); P.put(rx + 1, y, S.wood[3]); }
    for (let y = top + 2; y < bot; y += 5) { P.hline(x0 + 10, y, w - 20, S.wood[2]); P.hline(x0 + 10, y + 1, w - 20, S.wood[4]); }
  } else if (S.circ === 'stairs') {
    // La cage : un mur d'appareil dans l'ombre, une meurtrière par étage.
    const St = S.stone, rail = S.kit === 'marbre' ? [S.gold[1], S.gold[3]] : [S.wood[1], S.wood[3]];
    for (let y = top; y < bot; y += 1) for (let x = x0 + 2; x < x1 - 2; x += 1) {
      const row = Math.floor((y - top) / 6), bx = ((x - x0 + (row & 1) * 6) % 12 + 12) % 12;
      P.put(x, y, (y - top) % 6 === 5 || bx === 0 ? mix(St[4], INK, 0.55) : mix(St[3], INK, 0.42));
    }
    const half = Math.round(LH / 2), steps = 8, run = (w - 6) / steps;
    // Une volée : de (xa, ya) à (xb, ya - half), marches pleines jusqu'au limon.
    const flight = (fl, dir) => {
      const xs = dir > 0 ? x0 + 3 : x1 - 3;
      for (let k = 0; k < steps; k += 1) {
        const yTread = fl - Math.round(((k + 1) * half) / steps);
        for (let t = 0; t < Math.ceil(run); t += 1) {
          const x = Math.round(xs + dir * (k * run + t));
          const yLimon = fl - Math.round(((k * run + t) / (w - 6)) * half) + 7;
          for (let y = yTread; y <= yLimon; y += 1) {
            let c = y === yTread ? St[0] : y === yTread + 1 ? St[1] : y >= yLimon - 1 ? St[4] : St[2];
            if (t === 0 && y > yTread) c = St[3];                 // la contremarche, côté ombre
            P.put(x, y, c);
          }
        }
      }
      // La rampe, ses balustres.
      for (let k = 0; k <= (w - 6); k += 1) {
        const x = Math.round(xs + dir * k), yr = fl - Math.round((k / (w - 6)) * half) - 11;
        P.put(x, yr, rail[0]); P.put(x, yr + 1, rail[1]);
        if (k % 4 === 2) for (let y = yr + 2; y < yr + 10; y += 1) P.put(x, y, rail[1]);
      }
    };
    levels.forEach((lv, i) => {
      const fl = lv.yT + HD.CEIL + HD.WALLH + 6;
      // La meurtrière, le palier de l'étage.
      for (let j = 0; j < 9; j += 1) { P.put(x0 + 8, fl - 52 + j, j < 2 ? St[2] : '#9ab8d0'); P.put(x0 + 9, fl - 52 + j, j < 2 ? St[2] : '#c8dcea'); }
      P.rect(x0 + 2, fl + 1, w - 4, 3, St[1]); P.hline(x0 + 2, fl + 1, w - 4, St[0]); P.hline(x0 + 2, fl + 4, w - 4, St[4]);
      if (i === levels.length - 1) return;
      flight(fl, 1);
      P.rect(x1 - 9, fl - half + 1, 6, 3, St[1]); P.hline(x1 - 9, fl - half + 1, 6, St[0]);
      flight(fl - half, -1);
    });
  } else {
    // La COLONNE DE LUMIÈRE : un faisceau lisse, plus clair au cœur (2026-10-03 : tramé
    // en damier, il faisait grillage de prison).
    for (let y = top; y < bot; y += 1) for (let x = x0 + 4; x < x1 - 4; x += 1) {
      const d = Math.abs(x + 0.5 - (x0 + x1) / 2) / ((x1 - x0) / 2 - 4);
      if (d > 1) continue;
      const a = Math.pow(1 - d, 1.6);
      const c = mix(back, d < 0.18 ? '#ffffff' : S.glow, Math.min(1, a * 1.15));
      P.put(x, y, c);
      if (d < 0.55) N.put(x, y, mix(S.glow2, d < 0.18 ? '#ffffff' : S.glow, 1 - d));
    }
    levels.forEach((lv) => {
      const stop = lv.yT + HD.CEIL + HD.WALLH + 6;
      P.ellipse(mid, stop + 2, Math.round(w / 2) - 2, 2, (i, j) => (j < 0 ? S.wood[0] : S.glow2));
    });
    ctx.lift = { x0, x1, stops: levels.map((lv) => lv.yT + HD.CEIL + HD.WALLH + 6) };
  }
}
// La CABINE de chaque âge à ascenseur : la fonte (boiseries, accordéon), le verre du
// néon (chrome, vitres), le disque de lumière des âges cosmiques.
function cabinFor(S) {
  if (S.circ === 'lift') return cabinRasters(S);
  const w = HD.CORE - 6;
  if (S.circ === 'glasslift') {
    const h = 40, B = makeRaster(0, 0, w, h), Fr = makeRaster(0, 0, w, h), b = painter(B), f = painter(Fr);
    b.rect(0, 0, w, h, S.gold[3]);
    for (let j = 2; j < h - 2; j += 1) for (let i = 1; i < w - 1; i += 1) b.put(i, j, mix(S.glass[1], S.glass[2], j / h));
    b.hline(0, 0, w, S.neon); b.hline(0, h - 1, w, S.neon);
    for (let i = 2; i < w - 2; i += 1) if ((i * 3) % 7 === 0) f.vline(i, 3, 6, '#ffffff');
    f.vline(0, 0, h, S.gold[1]); f.vline(w - 1, 0, h, S.gold[3]); f.rect(0, h - 3, w, 3, S.gold[2]); f.hline(0, 0, w, S.neon);
    return { back: B, front: Fr, w, h };
  }
  if (S.circ === 'beam') {
    const h = 6, B = makeRaster(0, 0, w, h), Fr = makeRaster(0, 0, w, h), f = painter(Fr);
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
      const q = ((i - w / 2) / (w / 2)) ** 2 + ((j - 2) / 2.5) ** 2;
      if (q <= 1) f.put(i, j, j < 2 ? '#ffffff' : j < 4 ? S.glow : S.glow2);
    }
    return { back: B, front: Fr, w, h };
  }
  return null;
}

// ── LES FONDATIONS et LA RIVE D'EN FACE, âge par âge ─────────────────────────
function foundationFor(P, S, cx, w, deckY, waterY) {
  const x0 = Math.round(cx - w / 2 - 10), x1 = Math.round(cx + w / 2 + 10), Wd = S.wood, St = S.stone;
  switch (S.found) {
    case 'iron': foundation(P, S, cx, w, deckY, waterY); return;
    case 'raft':
      for (let x = x0; x < x1; x += 1) for (let y = deckY; y < waterY + 3; y += 1) {
        const r = Math.floor((y - deckY) / 4), k = (y - deckY) % 4;
        P.put(x, y, (x + r * 9) % 31 === 0 ? Wd[4] : k === 0 ? Wd[1] : k === 3 ? Wd[4] : Wd[2]);
      }
      return;
    case 'piles':
      for (let x = x0; x < x1; x += 1) { P.put(x, deckY, Wd[0]); P.put(x, deckY + 1, Wd[1]); P.put(x, deckY + 2, Wd[3]); P.put(x, deckY + 3, Wd[4]); }
      for (let x = x0 + 4; x < x1 - 4; x += 16) for (let y = deckY + 4; y < waterY + 6; y += 1) { P.put(x, y, Wd[2]); P.put(x + 1, y, Wd[3]); P.put(x + 2, y, Wd[4]); }
      return;
    case 'concrete':
      for (let x = x0; x < x1; x += 1) for (let j = 0; j < 6; j += 1) P.put(x, deckY + j, j === 0 ? '#e6e9ed' : j === 5 ? INK : j === 3 ? S.neon : '#c4c9cf');
      for (let x = x0 + 6; x < x1 - 6; x += 28) for (let y = deckY + 6; y < waterY + 6; y += 1) { P.rect(x, y, 6, 1, '#9aa2ad'); P.put(x, y, '#c4c9cf'); P.put(x + 5, y, '#7a828e'); }
      return;
    case 'float':
      for (let x = x0; x < x1; x += 1) for (let j = 0; j < 5; j += 1) P.put(x, deckY + j, j === 0 ? '#ffffff' : j === 4 ? S.glow2 : '#eef1f4');
      for (let j = 0; j < waterY - deckY - 6; j += 2) P.hline(Math.round(cx - 4), deckY + 7 + j, 9, j % 4 === 0 ? S.glow : S.glass[1]);
      return;
    default:                                                 // l'îlot maçonné
      for (let y = deckY; y < waterY + 4; y += 1) for (let x = x0 - 2; x < x1 + 2; x += 1) {
        const row = Math.floor((y - deckY) / 5), off = (row & 1) * 6;
        P.put(x, y, (y - deckY) % 5 === 4 || (x + off) % 12 === 0 ? St[4] : y - deckY < 1 ? St[1] : St[3]);
      }
  }
}
function skylineFor(P, S, W, waterY) {
  if (S.skyline === 'factories') { paintSkyline(P, S, W, waterY); return; }
  const base = waterY - 2, haze = S.haze, deep = S.hazeDark;
  P.rect(0, base - 4, W, 4, S.band >= 6 ? '#8f98a6' : '#93a88a');
  for (let x = 0; x < W;) {
    const k = h32(x, S.band, 5);
    let w = 12 + (k % 20), h = 8 + (k % 26);
    switch (S.skyline) {
      case 'camp':
        for (let j = 0; j < 13; j += 1) P.hline(x + j, base - 4 - j, 26 - 2 * j, haze);
        if (k % 3 === 0) for (let j = 0; j < 14; j += 1) P.put(x + 13 + ((j >> 1) & 1), base - 18 - j, '#d8c8b8');
        x += 32; break;
      case 'huts':
        P.rect(x, base - 12, 16, 8, haze); for (let j = 0; j < 8; j += 1) P.hline(x - 2 + j, base - 12 - j, 20 - 2 * j, deep);
        x += 24; break;
      case 'towers':
        h = 26 + (k % 56); w = 12 + (k % 14); P.rect(x, base - 4 - h, w, h, haze);
        for (let j = 5; j < h - 3; j += 5) for (let i = 2; i < w - 2; i += 4) P.put(x + i, base - 4 - h + j, '#d8e4ee');
        x += w + 4; break;
      case 'spires':
        h = 28 + (k % 60);
        for (let j = 0; j < h; j += 1) P.hline(x + Math.floor((j * 6) / h), base - 4 - j, Math.max(1, 12 - Math.floor((j * 12) / h)), j % 11 === 0 ? '#c8c4ff' : haze);
        x += 18; break;
      default:
        P.rect(x, base - 4 - h, w, h, haze);
        for (let j = 0; j < w / 2; j += 1) P.hline(x + j, base - 4 - h - j, w - 2 * j, deep);
        if (S.skyline === 'castle' && k % 3 === 0) { P.rect(x + w, base - 4 - h - 22, 10, h + 22, haze); for (let i = 0; i < 10; i += 3) P.rect(x + w + i, base - 4 - h - 25, 2, 3, haze); }
        if (S.skyline === 'temples' && k % 3 === 0) P.ellipse(x + Math.round(w / 2), base - 4 - h, Math.max(4, Math.round(w / 2) - 1), 7, deep);
        x += w + 2;
    }
  }
}

// ── LA COUPE ─────────────────────────────────────────────────────────────────
// `K` : le kit de l'âge (seule sa bande sert ici) ; `open` : les lieux ouverts.
export function bakeCoupeHD(K, open = {}) {
  const b = K.band | 0;
  const S = styleHD(b);
  const pal = palOf(S);
  const plan = plaisirsPlan(b), prog = plaisirsProgramme(b), L = prog.length;
  const widths = plan.widths.map((w) => Math.round((w * HD.K) / 2) * 2);
  const wMax = Math.max(...widths), wTop = widths[Math.min(L - 1, widths.length - 1)];
  const W = wMax + HD.MARGIN * 2;
  const domeR = Math.min(150, Math.round(wTop * 0.4));
  const ROOF = Math.round(domeR * topRatio(S)) + HD.FLOORD + 8;
  const H = HD.TOP + ROOF + HD.STRUCT + L * LH + 12 + HD.WATER;
  const waterY = H - HD.WATER, deckY = waterY - 12;
  const Rr = makeRaster(0, 0, W, H), Fr = makeRaster(0, 0, W, H), Or = makeRaster(0, 0, W, H), Nr = makeRaster(0, 0, W, H);
  const P = painter(Rr), F = painter(Fr), O = painter(Or), N = painter(Nr);
  // Ce que les MURS allument la nuit (corniche de néon, étoiles…), à part : un meuble posé
  // devant l'éteint (2026-10-03 : les fils lumineux du mur passaient sur la scène).
  const WNr = makeRaster(0, 0, W, H);
  const idb = new Array(W * H).fill(null);
  const ids = { get: (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? idb[y * W + x] : null), set: (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) idb[y * W + x] = v; } };
  const figures = [], spots = {};
  const cx = Math.round(W / 2);
  // Les lampes posées dans n'importe quelle couche marquent leur halo de nuit.
  const lights = [];
  for (const L2 of [P, F, O, N]) L2.marks = lights;
  const fig = (x, y, dir, type, variant, extra = {}) => figures.push({ x, y, dir, type, variant, ...extra });
  const ctx = {
    P, F, O, N, R: P, S, pal, ids, spots, plan, fig, WN: painter(WNr),
    snapshot: () => ({ f: Fr.data.slice(), o: Or.data.slice() }),
    claim: (before, id) => {
      for (let k = 0; k < W * H; k += 1) {
        const q = k * 4;
        if (Fr.data[q + 3] !== before.f[q + 3] || Or.data[q + 3] !== before.o[q + 3]) idb[k] = id;
      }
    },
  };
  paintSky(P, S, W, waterY);
  skylineFor(P, S, W, waterY);
  paintWater(P, S, W, waterY, H);
  foundationFor(P, S, cx, widths[0], deckY, waterY);
  // La cage : contre la façade droite du dernier étage (au centre aux âges des tours).
  const core = plan.center ? { x0: cx - HD.CORE / 2, x1: cx + HD.CORE / 2, center: true } : { x1: Math.round(cx + wTop / 2) - HD.WALL };
  if (!core.center) core.x0 = core.x1 - HD.CORE;
  // Le campement n'a qu'un niveau : pas de cage, les lieux prennent toute la largeur.
  if (S.circ === 'none') { core.x1 = Math.round(cx + wTop / 2) - HD.WALL + HD.WALLW; core.x0 = core.x1; core.none = true; }
  const levels = [];
  let yT = deckY - (HD.CEIL + HD.WALLH + HD.FLOORD);
  for (let i = 0; i < L; i += 1) {
    const w = widths[Math.min(i, widths.length - 1)];
    const x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2), yB = yT + HD.CEIL + HD.WALLH + HD.FLOORD;
    // La charpente du niveau (le fond sombre entre les boîtes), la façade coupée, la
    // poutre au-dessus et son balcon dehors.
    for (let y = yT; y < yB; y += 1) for (let x = x0 + HD.WALL; x < x1 - HD.WALL; x += 1) P.put(x, y, S.iron[4]);
    cutWall(P, S, x0, yT - HD.STRUCT, yB, -1);
    cutWall(P, S, x1 - HD.WALL, yT - HD.STRUCT, yB, 1);
    beam(P, S, x0, x1, yT - HD.STRUCT, HD.STRUCT);
    const over = i === L - 1 ? 10 : 18;
    balcony(P, N, S, x0 - over, x0, yT - HD.STRUCT, -1);
    balcony(P, N, S, x1, x1 + over, yT - HD.STRUCT, 1);
    levels.push({ i, cx, w, yT, y0: yT + HD.CEIL, y1: yT + HD.CEIL + HD.WALLH, rooms: prog[i] });
    level(ctx, { cx, w, yT }, prog[i], open, i, core);
    yT -= LH;
  }
  circulation(ctx, core, levels);
  const motions = courtship(ctx, levels, core);
  // La VERRIÈRE au-dessus du dernier étage : une salle, vue de l'intérieur.
  const apex = topRoom(ctx, cx, levels[L - 1].yT - HD.STRUCT, wTop, open);
  // La nuit des murs, là où rien ne la cache.
  for (let k = 0; k < W * H; k += 1) {
    const q = k * 4;
    if (!WNr.data[q + 3] || Or.data[q + 3] || Fr.data[q + 3] || Nr.data[q + 3]) continue;
    for (let c = 0; c < 4; c += 1) Nr.data[q + c] = WNr.data[q + c];
  }
  // L'encre du mobilier est posée par pièce ; le fond reçoit les meubles du fond.
  for (let k = 0; k < W * H; k += 1) {
    const q = k * 4;
    if (!Or.data[q + 3]) continue;
    Rr.data[q] = Or.data[q]; Rr.data[q + 1] = Or.data[q + 1]; Rr.data[q + 2] = Or.data[q + 2]; Rr.data[q + 3] = 255;
  }
  // Le reflet du bâtiment dans l'eau.
  for (let y = waterY + 1; y < H; y += 1) {
    const sy = waterY - (y - waterY) * 2;
    if (sy < 0 || y % 3 === 0) continue;
    for (let x = 0; x < W; x += 1) {
      if (Math.abs(x - cx) > widths[0] / 2 + 12) continue;
      const sq = (sy * W + x) * 4, dq = (y * W + x) * 4;
      for (let c = 0; c < 3; c += 1) Rr.data[dq + c] = Math.round(Rr.data[dq + c] * 0.6 + Rr.data[sq + c] * 0.4 * 0.7);
    }
  }
  const cab = cabinFor(S);
  return {
    R: Rr, F: Fr, N: Nr, ids: idb, spots, figures, levels, lights, W, H, waterY,
    roofTop: apex - 6, band: b, motions, lift: ctx.lift || null,
    show: ctx.show ? { x: ctx.show.x, y: ctx.show.y, ...shadowFrames(S.hat || 'none') } : null,
    waterHex: S.water[S.water.length - 1], skyHex: S.sky[0],
    // Les mesures de cette toise, pour la vue : 1 px de coupe = 1 px de sprite.
    hd: { spritePx: 1, haloR: 30, wheel: 36, floorH: LH, margin: 60, cabin: cab },
  };
}

// Le style d'un âge, ses matières et ses luminaires, pour la TABLE DE JEU en gros plan
// (plaisirsTableBake.js) : la partie se joue sur la table qu'on voit dans la coupe.
export { styleHD, wallAt, floorAt, lamp, WAINSCOT };
