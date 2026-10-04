// plaisirsGirls.mjs — LES FILLES DE LA MAISON, DESSINÉES À LA MAIN (Maison des Plaisirs).
//
// Retour de Raph (2026-10-03) sur les filles générées par PixelLab : « les yeux ne sont
// pas beaux, la courtisane est illisible ; reprends les sprites sur Aseprite : refais
// les yeux, les animations, et les seins encore plus gros, type push-up ». On ne
// retouche plus une génération image par image : on DESSINE, pièce par pièce.
//
// Un même CORPS (silhouette en sablier, poitrine en push-up), un même VISAGE (yeux nets :
// trait de cils, iris coloré, reflet), et des TENUES posées par-dessus. Les pièces sont
// des grilles de lettres (une lettre = une couleur de la palette du personnage) ; le
// contour noir d'un pixel se pose tout seul autour de chaque pièce, ce qui donne aussi
// les traits intérieurs (le bras devant le corps). L'ANIMATION est un gréement : chaque
// image dit où sont les jambes, les bras, la tête (le pas soulève le corps d'un pixel)
// et le buste (il rebondit d'un pixel, en retard sur le corps).
//
//   node scripts/plaisirsGirls.mjs [--preview=out.png] [--only=cancan]
// Écrit les bandes dans public/pixelart/agents/inhabitants (mêmes noms que les
// personnages PixelLab qu'elles remplacent) et, si Aseprite est là, les sources
// art/plaisirs/<nom>.aseprite (un calque par pièce, une étiquette par animation).
// Les GIGOLOS de la Maison (2026-10-04) passent par le même gréement : section « LES
// GIGOLOS », `--gigolos`, `--preview-gigolos=out.png`.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const OUT = 'public/pixelart/agents/inhabitants';
const SIZE = 32;

// ── Palettes ────────────────────────────────────────────────────────────────
const SKIN = { K: '#1a1018', S: '#f7cfae', s: '#dc9f80', P: '#f29a9a', E: '#24122a', W: '#ffffff', M: '#c42a3a' };
const GIRLS = {
  cancan: { // corset noir, jupons rouges, bas noirs, chignon auburn et plume rouge
    I: '#2e8a5e', H: '#b4502a', h: '#7c2e1a', L: '#e48450', F: '#e8303e', f: '#9a1a2a',
    A: '#2e2434', a: '#16101c', Q: '#5e4a68', R: '#d8303e', r: '#8e1a2a', T: '#ffd2dc', B: '#3c3250', b: '#6e5e8a', G: '#f0c040',
  },
  courtisane: { // satin émeraude fendu, gants noirs, chignon blond
    I: '#3a64c8', H: '#e8b848', h: '#b0802a', L: '#fff0a0', F: '#ff8cc6', f: '#c8508a',
    A: '#1e9a64', a: '#0e5e3c', Q: '#6ee0a8', R: '#1e9a64', r: '#0e5e3c', T: '#6ee0a8', B: '#1a1420', b: '#3a3048', G: '#f0c040',
  },
  chanteuse: { // fourreau cramoisi à paillettes, gants blancs, carré noir, plume blanche
    I: '#8a4ad0', H: '#1e1a24', h: '#0e0a12', L: '#4a4258', F: '#ffffff', f: '#c8c8d8',
    A: '#c42a3a', a: '#7e1426', Q: '#ff7a86', R: '#c42a3a', r: '#7e1426', T: '#ffd0d6', B: '#f4f0f4', b: '#c8c0d0', G: '#ffffff',
  },
};

// ── Le moteur : pièces, contour, composition ────────────────────────────────
const hexRgb = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
// Une pièce : { x, y, rows: [...], flip? } — chaque lettre est une couleur, « . » le vide.
// Contour : `true` (défaut) pose le liseré noir autour de la pièce avant de la remplir.
function stamp(canvas, part, pal, opt = {}) {
  const { x: ox, y: oy, rows } = part;
  const W = rows[0].length, H = rows.length;
  const at = (i, j) => (i >= 0 && j >= 0 && j < H && i < W && rows[j][i] !== '.');
  if (opt.outline !== false) {
    for (let j = -1; j <= H; j += 1) for (let i = -1; i <= W; i += 1) {
      if (at(i, j)) continue;
      if (at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1)) canvas.set(ox + i, oy + j, pal.K);
    }
  }
  for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) {
    const ch = rows[j][i];
    if (ch === '.') continue;
    const c = pal[ch];
    if (!c) throw new Error(`couleur « ${ch} » absente (${part.name || '?'})`);
    canvas.set(ox + i, oy + j, c);
  }
}
function makeCanvas(w = SIZE, h = SIZE) {
  const data = new Uint8ClampedArray(w * h * 4);
  return {
    w, h, data,
    set(x, y, c) { if (x < 0 || y < 0 || x >= w || y >= h) return; const v = hexRgb(c), k = (y * w + x) * 4; data[k] = v[0]; data[k + 1] = v[1]; data[k + 2] = v[2]; data[k + 3] = 255; },
  };
}
// Retourne une image (miroir gauche-droite) : sud-ouest = sud-est retourné.
function mirror(cv) {
  const o = makeCanvas(cv.w, cv.h);
  for (let y = 0; y < cv.h; y += 1) for (let x = 0; x < cv.w; x += 1) {
    const s = (y * cv.w + x) * 4, d = (y * cv.w + (cv.w - 1 - x)) * 4;
    for (let c = 0; c < 4; c += 1) o.data[d + c] = cv.data[s + c];
  }
  return o;
}
function strip(frames) {
  const p = new PNG({ width: SIZE * frames.length, height: SIZE });
  frames.forEach((cv, n) => { for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) { const s = (y * SIZE + x) * 4, d = (y * p.width + n * SIZE + x) * 4; for (let c = 0; c < 4; c += 1) p.data[d + c] = cv.data[s + c]; } });
  return p;
}

// Le CONTOUR de la silhouette entière (le corps est fait de plusieurs pièces sans trait
// entre elles : un trait par pièce rayait le buste de barres noires).
function outlineAll(cv, K) {
  const filled = (x, y) => x >= 0 && y >= 0 && x < cv.w && y < cv.h && cv.data[(y * cv.w + x) * 4 + 3] > 0;
  const ring = [];
  for (let y = 0; y < cv.h; y += 1) for (let x = 0; x < cv.w; x += 1) {
    if (filled(x, y)) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ring.push([x, y]);
  }
  for (const [x, y] of ring) cv.set(x, y, K);
}
SKIN.Z = '#ffe6cf';   // le reflet de la peau (le haut du buste, l'épaule)
SKIN.U = '#c08068';   // le pli sous le sein (plus sombre que l'ombre s)

// ── Les pièces, vue de trois-quarts face (sud-est) ──────────────────────────
// Repère : toile 32 × 32, semelles sur la ligne y = 28 (AGENT_FEET 0,88). La figure
// regarde vers la droite : la masse des cheveux à gauche (l'arrière de la tête), le
// visage à droite, le décolleté décalé vers la droite, le buste lointain qui dépasse.
// La TÊTE : chignon, frange, YEUX NETS — un trait de cils (E E), le blanc et l'iris
// dessous (W I : elle regarde où elle va), les pommettes (P), la bouche (M).
const HEAD_SE = [
  '..HHHH......',
  '.HHLLHH.....',
  '.HHHHHHHHH..',
  'HHLHHHHHHHHH',
  'HHHHHHHhHhHh',
  'HHHHHhSSSSSh',
  'HHHHhSEESEES',
  'HHHhsSWISWIS',
  '.HHhSPSSPSS.',
  '..HhsSSMSS..',
  '...H.sSSs...',
];
// Le cou et les épaules nues (une seule pièce de peau avec le buste : pas de trait).
// (Collés sous le menton : une rangée vide entre la tête et les épaules devenait une
// barre noire au contour.)
// Un rang de plus SOUS le buste : quand il rebondit vers le bas, c'est de la peau qui
// apparaît au-dessus, pas un trou (le contour en faisait un trait noir).
const SHOULDERS_SE = ['.sSSSSs.', 'SZSSSSSS', 'SSSSSSSS'];
// Le BUSTE en push-up : deux rondeurs, la ligne du décolleté (s), un reflet (Z) ; le
// lointain dépasse à droite. Pièce à part : il rebondit.
// Raph : « encore plus gros, type push-up » → douze pixels de large (il déborde des
// épaules) ; il monte presque à la ligne des épaules.
// Raph, 2026-10-04 : « arrondis davantage ses seins, le dessous un peu comme ça » →
// six rangs : des sommets ronds (les reflets Z en haut à gauche), le sillon (s) qui
// finit en pli au centre (U), et le DESSOUS : la peau qui s'arrondit sous chaque
// bonnet (s S S s), puis le pli sous chaque sein (U U). Les hauts posés par-dessus
// cachent ce qu'ils couvrent ; le bandeau laisse voir le dessous.
const BUST_SE = [
  '...ZZSsSZZS.',
  '..ZZSSsSZSSs',
  '.SSSSSsSSSSs',
  '.sSSSSUSSSSs',
  '..sSSs.sSSs.',
  '...UU...UU..',
];
// Le CORSET, posé par-dessus : encolure EN CŒUR (2026-10-04) — un arc de dentelle (T)
// sur chaque bonnet, le V au milieu, les bonnets qui s'arrondissent (a, dessous) avant
// la taille de guêpe. Douze de large comme le buste, posé en x 11, y 15.
const CORSET_SE = [
  '...TT...TT..',
  '.TTAQT.TQATT',
  '.AAAAATAAAAA',
  '..aAAAQAAAa.',
  '...AAAQAAA..',
];
// Les JUPONS du cancan (deux images : l'ourlet ondule, les hanches balancent).
const SKIRT_SE = [
  ['...RRRRRRR...', '..RRrRRRrRRR.', '.RRRRrRRRRrRR', 'TTRTTRTTRTTRT'],
  ['...RRRRRRR...', '..RRRrRRRrRR.', '.RRrRRRRrRRRR', 'TRTTRTTRTTRTT'],
];
// Une jambe (bas noir) et son soulier rouge, pointe à droite.
// Les BRAS, poings sur les hanches (coudes en dehors) : la démarche chaloupée.
const ARM_NEAR = [
  '..SS.',
  '.SS..',
  'SS...',
  'SS...',
  '.SG..',
  '..SSS',
];
const ARM_FAR = [
  '.SS..',
  '..SS.',
  '...SS',
  '...SS',
  '..GS.',
  'SSS..',
];

// Les autres coiffures : le CARRÉ (frange droite, pointes à la mâchoire) et les
// CHEVEUX LONGS (la masse tombe derrière l'épaule : pièce à part, peinte derrière).
const HEAD_SE_BOB = [
  '...HHHHHH...',
  '.HHHHHHHHHH.',
  'HHLHHHHHHHHH',
  'HLHHHHHHHHHH',
  'HHHHhhhhhhhH',
  'HHHHhSSSSSSH',
  'HHHHSEESEESH',
  'HHHhsSWISWIH',
  'HHHhSPSSPSHH',
  'HHHhsSSMSHHH',
  '.HHH.sSSsHH.',
];
const HEAD_SE_LONG = [
  '..HHHHHH....',
  '.HHHHHHHHH..',
  'HHLHHHHHHHH.',
  'HLHHHHHHHHHH',
  'HHHHHHhHhHhH',
  'HHHHhSSSSShH',
  'HHHHSEESEES.',
  'HHHhsSWISWIS',
  'HHHhSPSSPSS.',
  'HHHhsSSMSS..',
  'HHH..sSSs...',
];
const HAIR_BACK_SE = ['HHH.', 'HHH.', 'HhH.', 'HhH.', 'Hh..', 'hH..', 'h...'];
// De dos (vue nord-est) : chignon et nuque dégagée, carré, cheveux longs sur le dos.
const HEAD_NE = [
  '..HHHH......',
  '.HHLLHH.....',
  '.HHHHHHHHH..',
  'HHLHHHHHHHHH',
  'HHHHHHHHHHHH',
  'HHHHHHHHHHHh',
  'HHHHHHHHHHhS',
  'HHHHHHHHHhSS',
  '.HHHHHHHHhS.',
  '..HhSSSHHs..',
  '...sSSSs....',
];
const HEAD_NE_BOB = [
  '...HHHHHH...',
  '.HHHHHHHHHH.',
  'HHLHHHHHHHHH',
  'HLHHHHHHHHHH',
  'HHHHHHHHHHHH',
  'HHHHHHHHHHHh',
  'HHHHHHHHHHhS',
  'HHHHHHHHHhSS',
  'HHHHHHHHHhSH',
  'HHHHHHHHHHHH',
  '.HHHHHHHHHH.',
];
const HAIR_BACK_NE = ['HHHHHHHH', 'HHhHHhHH', 'HhHHHhH.', '.HhHHh..', '..hHh...'];
const HEADS = {
  updo: { se: HEAD_SE, ne: HEAD_NE },
  bob: { se: HEAD_SE_BOB, ne: HEAD_NE_BOB },
  long: { se: HEAD_SE_LONG, ne: HEAD_NE_BOB, backSE: HAIR_BACK_SE, backNE: HAIR_BACK_NE },
};
// Le DOS : épaules et dos nus.
const BACK_NE = ['.sSSSSs.', 'SSSSSSSS', 'SSSSSSSSS', 'sSSSSSSSS'];
const CORSET_NE = ['AAAAAAAAA.', '.AATATAAA.', '..AATAA...', '..ATAAAA..'];

// ── Les HAUTS ────────────────────────────────────────────────────────────────
// corset (dentelle, taille de guêpe) ; corsage (chemise blanche sous un corselet lacé) ;
// bandeau (fourrure, étoffe ou or, sur un ventre nu) ; justaucorps (le corset, et le
// bas échancré haut sur la hanche).
// Depuis le 2026-10-04 (les seins arrondis) : la chemise du corsage fait deux bonnets
// ronds au-dessus du corselet lacé ; le bandeau devient deux bonnets ronds (plus
// étroits en haut et en bas qu'au milieu, le reflet Q en haut à gauche, le dessous
// assombri a), sous lesquels on voit le dessous des seins.
const BODICE_SE = ['...TT...TT..', '.TTTTT.TTTTT', '.AAAQAAQAAAA', '..AAAQQAAAA.', '...AAQQAAA..'];
const BANDEAU_SE = ['..AQAA.AQAA.', '.AQAAAaQAAAA', '.aAAAa.aAAAa'];
const BANDEAU_NE = ['AAAAAAAAA', 'TTTTTTTTT'];
const MIDRIFF = ['.SSSSSSSS.', '..SSSSSS..', '..SSsSSS..', '..SSSSSS..'];
// ── Les BAS ──────────────────────────────────────────────────────────────────
const GOWN_SE = [
  ['...RRRRRRR...', '...RRrRRRRR..', '..RRRRrRRRR..', '..RRRRRrRRR..', '..RRRRRRrRR..', '.RRRRRRRRrRR.', '.RRRRRRRRRrR.', 'RRRRRRRRRRRRR'],
  ['...RRRRRRR...', '..RRRRrRRRR..', '..RRRrRRRRR..', '..RRRRrRRRR..', '..RRRRRrRRR..', '.RRRRRRRrRRR.', '.RRRRRRRRrRR.', '.RRRRRRRRRRRR'],
];
const SLIT_SE = ['B', 'B', 'B', 'Bb', 'Bb'];   // la jambe dans la fente (ses bas, ou sa peau)
const MERMAID_SE = [
  ['...RRRRRRR...', '...RRQRRRR...', '...RRRRQRR...', '....RQRRR....', '....RRRQR....', '...RRRRRRR...', '..RRQRRRRQR..', '.RRRRRQRRRRR.'],
  ['...RRRRRRR...', '...RRRQRRR...', '...RQRRRRR...', '....RRRQR....', '....RQRRR....', '...RRRRRRR...', '..RQRRRRQRR..', 'RRRRRQRRRRRR.'],
];
const FUR_SE = [
  ['...RRRRRRR...', '..RRrRRRrRR..', '.RRRRRrRRRRR.', '.R.RR.RR.RR.R'],
  ['...RRRRRRR...', '..RRRrRRRrR..', '.RRrRRRRRrRR.', 'R.RR.RR.RR.R.'],
];
const MINI_SE = [
  ['...RRRRRRR...', '..RRRRRRRRR..', '..RRrRRRRrR..'],
  ['...RRRRRRR...', '..RRRRRRRRR..', '..RrRRRRrRR..'],
];
const LEOTARD_SE = [['...AAAAAAA...', '....AAQAA....', '.....AAA.....'], ['...AAAAAAA...', '....AAQAA....', '.....AAA.....']];
const SKIRTS = { short: SKIRT_SE, gown: GOWN_SE, mermaid: MERMAID_SE, fur: FUR_SE, mini: MINI_SE, leotard: LEOTARD_SE };
// Où commencent les jambes, selon la longueur du bas (les robes longues ne montrent
// que les souliers).
const LEG_TOP = { short: 24, fur: 24, mini: 23, leotard: 21 };
const legRows = (top, net) => {
  const r = [];
  for (let y = top; y < 28; y += 1) r.push(net ? ((y & 1) ? 'bB' : 'Bb') : (y === top ? 'BB' : 'Bb'));
  r.push('rrr');
  return r;
};
const SHOE = ['rrr'];
// ── Les BRAS ─────────────────────────────────────────────────────────────────
// Poings sur les hanches (nus, bracelet d'or ; ou gants d'opéra) ; levés (la danse).
const ARMS = {
  bare: [ARM_NEAR, ARM_FAR],
  glove: [['..SS.', '.SS..', 'BB...', 'BB...', '.Bb..', '..BBB'], ['.SS..', '..SS.', '...BB', '...BB', '..bB.', 'BBB..']],
  // Les gants « pal » prennent la couleur du haut (A) : bras de justaucorps, manches.
  sleeve: [['..AA.', '.AA..', 'SS...', 'SS...', '.SG..', '..SSS'], ['.AA..', '..AA.', '...SS', '...SS', '..GS.', 'SSS..']],
};
const ARM_LIFT_NEAR = ['..SS.', '.SS..', 'SS...', 'SS...', 'SG...', 'SS...', '.SS..'];
const ARM_LIFT_FAR = ['.SS..', '..SS.', '...SS', '...SS', '...GS', '...SS', '..SS.'];
const ARM_UP_NEAR = ['SS..', 'SS..', '.SS.', '.SS.', '.SS.', '.SG.', '..SS', '..SS', '..SS', '...S'];
const ARM_UP_FAR = ['..SS', '..SS', '.SS.', '.SS.', '.SS.', '.GS.', 'SS..', 'SS..', 'SS..', 'S...'];
// ── Les ACCESSOIRES ──────────────────────────────────────────────────────────
const ACC = {
  plumeRed: { rows: ['FFf'], at: [13, 0] },
  plumePink: { rows: ['fF'], at: [12, 0] },
  plumeBob: { rows: ['.F', 'FF'], at: [18, 0] },
  headdress: { rows: ['F.F.F.F', 'FfFfFfF'], at: [11, 0] },
  laurel: { rows: ['G.G.G.G.G'], at: [11, 3] },
  flower: { rows: ['F', 'f'], at: [19, 2] },
  bones: { rows: ['W.W.W'], at: [13, 14], front: true },
  pearls: { rows: ['WWWWW'], at: [13, 14], front: true },
  strap: { rows: ['..TT', '.TT.', 'TT..'], at: [17, 12], front: true },
  tiara: { rows: ['..f..', '.fFf.'], at: [12, 0] },
};

// ── LA TROUPE, âge par âge ───────────────────────────────────────────────────
// Chaque fille : sa palette (peau commune, puis cheveux H/h/L, iris I, haut A/a/Q/T,
// bas R/r, jambes B/b, souliers r, bijoux G, plume F/f) et son allure : coiffure,
// accessoires, haut, bas, jambes (résille ?), bras, et sa DANSE (battement ou
// ondulation, bras levés) si elle danse sur la scène.
const ROSTER = {
  // 5 — LA FONTE : la maison close Belle Époque (le pilote validé).
  'plaisirs-fonte-cancan': { pal: GIRLS.cancan, head: 'updo', acc: ['plumeRed'], top: 'corset', bottom: 'short', arms: 'bare', dance: 'kick' },
  'plaisirs-fonte-courtisane': { pal: GIRLS.courtisane, head: 'updo', acc: ['plumePink'], top: 'corset', bottom: 'gown', slit: true, arms: 'glove' },
  'plaisirs-fonte-chanteuse': { pal: GIRLS.chanteuse, head: 'bob', acc: ['plumeBob'], top: 'corset', bottom: 'mermaid', arms: 'glove' },
  // 0-1 — LE FEU, LE BOIS : danseuses du foyer, fourrures et os.
  'plaisirs-feu-flamme': { head: 'long', acc: ['bones'], top: 'bandeau', bottom: 'fur', arms: 'bare', dance: 'sway',
    pal: { I: '#c8781e', H: '#c8401e', h: '#7a2410', L: '#f07a3a', F: '#ffd060', f: '#e05020', A: '#9a5a30', a: '#6a3a1c', Q: '#c88a50', T: '#6a3a1c', R: '#9a5a30', r: '#5a361c', B: '#f2c8a4', b: '#d49c7a', G: '#f0c040', W: '#f4ecd8' } },
  'plaisirs-feu-chasseresse': { head: 'long', acc: ['flower'], top: 'bandeau', bottom: 'fur', arms: 'bare',
    pal: { I: '#4a7a3a', H: '#2a1a12', h: '#140c08', L: '#5a3a28', F: '#ffffff', f: '#c8c8c8', A: '#d8a050', a: '#5a3a20', Q: '#f0c070', T: '#5a3a20', R: '#d8a050', r: '#5a3a20', B: '#e8b890', b: '#c08c66', G: '#e8d8b0', W: '#f4ecd8' } },
  'plaisirs-feu-sauvage': { head: 'updo', acc: ['bones'], top: 'bandeau', bottom: 'fur', arms: 'bare',
    pal: { I: '#3a6ac8', H: '#e8c060', h: '#a8802a', L: '#fff0a0', F: '#ffffff', f: '#c8c8c8', A: '#8a8478', a: '#5a564c', Q: '#b4ae9e', T: '#4a463e', R: '#8a8478', r: '#4a463e', B: '#f7cfae', b: '#dc9f80', G: '#e8d8b0', W: '#f4ecd8' } },
  // 2-3 — LA PIERRE, LA COURONNE : la taverne et l'étuve, chemises et corselets lacés.
  'plaisirs-moyen-gigue': { head: 'long', acc: ['flower'], top: 'bodice', bottom: 'short', arms: 'bare', dance: 'kick',
    pal: { I: '#3a8a5e', H: '#a8481e', h: '#6a2a12', L: '#e07a40', F: '#ff6a8a', f: '#c83a5a', A: '#a82a32', a: '#6a1420', Q: '#f0c040', T: '#f8f2e4', R: '#2e6a3a', r: '#1a4224', B: '#f4eee0', b: '#c8bca4', G: '#f0c040', W: '#ffffff' } },
  'plaisirs-moyen-courtisane': { head: 'long', acc: ['flower'], top: 'bodice', bottom: 'gown', slit: true, arms: 'sleeve',
    pal: { I: '#4a6ac8', H: '#f0cc6a', h: '#b08a30', L: '#fff4b0', F: '#ff9ac0', f: '#d0608a', A: '#2e6e3e', a: '#1a4626', Q: '#f0c040', T: '#f8f2e4', R: '#2e6e3e', r: '#1a4626', B: '#f7cfae', b: '#dc9f80', G: '#f0c040', W: '#ffffff' } },
  'plaisirs-moyen-dame': { head: 'updo', acc: ['pearls'], top: 'bodice', bottom: 'gown', arms: 'sleeve',
    pal: { I: '#6a3a9a', H: '#3a2418', h: '#1e120c', L: '#6a4430', F: '#ffffff', f: '#c8c8c8', A: '#3050a0', a: '#1c2e66', Q: '#f0c040', T: '#f8f2e4', R: '#3050a0', r: '#1c2e66', B: '#1a1420', b: '#3a3048', G: '#f0c040', W: '#ffffff' } },
  // 4 — LE MARBRE : la bacchanale, voiles et or.
  'plaisirs-antique-bacchante': { head: 'long', acc: ['laurel'], top: 'bandeau', bottom: 'gown', slit: true, arms: 'bare', dance: 'sway',
    pal: { I: '#2a6a8a', H: '#2a1a14', h: '#140c08', L: '#5a3a2a', F: '#ffffff', f: '#c8c8c8', A: '#e0b040', a: '#9a7020', Q: '#fff0a0', T: '#fff0a0', R: '#7a3a9a', r: '#4a2066', B: '#f7cfae', b: '#dc9f80', G: '#f0c040', W: '#ffffff' } },
  'plaisirs-antique-hetaire': { head: 'updo', acc: ['laurel', 'strap'], top: 'corset', bottom: 'gown', slit: true, arms: 'bare',
    pal: { I: '#3a7a5a', H: '#1e1410', h: '#0e0806', L: '#4a3428', F: '#ffffff', f: '#c8c8c8', A: '#f4eee2', a: '#c8bfae', Q: '#f0c040', T: '#f0c040', R: '#f4eee2', r: '#c8bfae', B: '#f7cfae', b: '#dc9f80', G: '#f0c040', W: '#ffffff' } },
  'plaisirs-antique-danseuse': { head: 'long', acc: ['pearls'], top: 'bandeau', bottom: 'gown', slit: true, arms: 'bare',
    pal: { I: '#4a8a3a', H: '#c8541e', h: '#7a2e10', L: '#f08a4a', F: '#ffffff', f: '#c8c8c8', A: '#e89a30', a: '#a86a18', Q: '#ffd080', T: '#ffd080', R: '#e89a30', r: '#a86a18', B: '#f7cfae', b: '#dc9f80', G: '#f0c040', W: '#ffffff' } },
  // 6 — LE NÉON : la revue, plumes et paillettes.
  'plaisirs-neon-revue': { head: 'updo', acc: ['headdress'], top: 'corset', bottom: 'leotard', net: true, arms: 'bare', dance: 'kick',
    pal: { I: '#c83a8a', H: '#f4d470', h: '#c0a040', L: '#fff8c0', F: '#ffffff', f: '#ff8cc6', A: '#ff4a9a', a: '#b81e66', Q: '#ffc0e0', T: '#ffc0e0', R: '#ff4a9a', r: '#ff4a9a', B: '#2a2030', b: '#7a6a8a', G: '#f0c040', W: '#ffffff' } },
  'plaisirs-neon-cocktail': { head: 'bob', acc: ['pearls'], top: 'corset', bottom: 'mini', arms: 'bare',
    pal: { I: '#3a8ac8', H: '#f0ece0', h: '#b8b0a0', L: '#ffffff', F: '#ffffff', f: '#c8c8c8', A: '#222030', a: '#101018', Q: '#8a80a0', T: '#8a80a0', R: '#222030', r: '#c42a3a', B: '#f7cfae', b: '#dc9f80', G: '#f0c040', W: '#ffffff' } },
  'plaisirs-neon-or': { head: 'long', acc: [], top: 'corset', bottom: 'mermaid', arms: 'glove',
    pal: { I: '#6a4a2a', H: '#5a3420', h: '#2e1a10', L: '#8a5a3a', F: '#ffffff', f: '#c8c8c8', A: '#e0b040', a: '#9a7020', Q: '#fff0a0', T: '#fff0a0', R: '#e0b040', r: '#9a7020', B: '#1a1420', b: '#3a3048', G: '#f0c040', W: '#ffffff' } },
};
// 7-9 — LES ÂGES COSMIQUES : la même troupe, trois lumières (jade, nacre et or, cristal).
const COSMIC = [
  ['jade', { glow: '#7affc8', glow2: '#2ec88a', dark: '#0e3a2e', hair: ['#1e4a3e', '#0e2a22', '#3a8a6a'], iris: '#2ec88a' }],
  ['astral', { glow: '#ffe9a0', glow2: '#e0b040', dark: '#2e2a3e', hair: ['#f4f0e8', '#c8c0b0', '#ffffff'], iris: '#c8a040' }],
  ['cristal', { glow: '#d8b0ff', glow2: '#9a6ae0', dark: '#2a1e48', hair: ['#c8b0f0', '#8a6ac8', '#f0e8ff'], iris: '#9a6ae0' }],
];
for (const [k, c] of COSMIC) {
  // Le bord des bonnets (T) dans la couleur VIVE de l'âge : pâle, il se fondait dans la
  // peau et la fille semblait torse nu.
  const base = { I: c.iris, H: c.hair[0], h: c.hair[1], L: c.hair[2], F: c.glow, f: c.glow2, A: c.dark, a: '#08060c', Q: c.glow, T: c.glow2, R: c.dark, r: c.glow2, B: c.dark, b: c.glow2, G: c.glow, W: '#ffffff' };
  ROSTER[`plaisirs-${k}-lumiere`] = { head: 'long', acc: ['tiara'], top: 'corset', bottom: 'leotard', net: true, arms: 'bare', dance: 'sway', pal: base };
  ROSTER[`plaisirs-${k}-voile`] = { head: 'updo', acc: ['tiara'], top: 'corset', bottom: 'gown', slit: true, arms: 'glove', pal: { ...base, R: c.glow2, r: c.dark, B: '#f7cfae', b: '#dc9f80' } };
  ROSTER[`plaisirs-${k}-eclat`] = { head: 'bob', acc: [], top: 'corset', bottom: 'mini', arms: 'bare', pal: { ...base, R: c.glow2, r: c.glow, B: '#f7cfae', b: '#dc9f80' } };
}

// ── Le gréement d'une image ─────────────────────────────────────────────────
// view : 'se' (trois-quarts face) ou 'ne' (trois-quarts dos) ; sud-ouest et nord-ouest
// sont leurs miroirs. g : bob (le corps monte d'un pixel au passage de la jambe), bust
// (le buste rebondit, en retard), legNear / legFar (décalage x), liftNear / liftFar
// (pied levé), sway (les hanches balancent), skirt (image de l'ourlet), slit (la fente
// s'ouvre), kick (0 au sol, 1 genou levé, 2 battement), lifted (jupons relevés), up
// (bras levés : 'both', 'near', 'far'), blink (les yeux fermés), look (l'iris de
// l'autre côté).
// Le REGARD, sur les rangs de la tête de face : fermés, le trait de cils (E) descend
// sur l'œil (W I) ; tourné, l'iris passe de l'autre côté du blanc.
function eyes(rows, g) {
  if (g.blink) return rows.map((r) => (/[WI]/.test(r) ? r.replace(/[WI]/g, 'E') : r.replace(/E/g, 'S')));
  if (g.look) return rows.map((r) => r.replace(/WI/g, 'IW'));
  return rows;
}
function frame(who, view, g) {
  const R0 = ROSTER[who], pal = { ...SKIN, ...R0.pal }, cv = makeCanvas();
  const b = g.bob || 0, bu = g.bust || 0, sw = g.sway || 0, se = view === 'se';
  const head = HEADS[R0.head], bottom = R0.bottom, legTop = LEG_TOP[bottom];
  let [armN, armF] = ARMS[R0.arms];
  if (g.lifted && (bottom === 'short' || bottom === 'fur')) [armN, armF] = [ARM_LIFT_NEAR, ARM_LIFT_FAR];
  const upN = g.up === 'both' || g.up === 'near', upF = g.up === 'both' || g.up === 'far';
  // Derrière : les cheveux longs, le bras lointain, les jambes ou les souliers.
  if (head.backSE && se) stamp(cv, { x: 9, y: 9 + b, rows: head.backSE, name: 'cheveux' }, pal, { outline: false });
  if (upF) stamp(cv, { x: 20, y: 4 + b, rows: ARM_UP_FAR, name: 'bras-loin' }, pal);
  else stamp(cv, { x: 19, y: 13 + b, rows: armF, name: 'bras-loin' }, pal);
  if (legTop) {
    const rows = legRows(legTop, R0.net);
    const leg = (x, lift, nm) => stamp(cv, { x, y: legTop - (lift ? 1 : 0), rows, name: nm }, pal);
    // Les deux jambes gardent un pixel d'écart : collées, le trait de la proche
    // noircissait la lointaine (des jambes nues sortaient noires).
    if (g.ecart) {
      // Le grand écart : les deux jambes à plat sur les planches, de part et d'autre.
      stamp(cv, { x: 3, y: 27, rows: SPLIT_NEAR, name: 'jambe-près' }, pal);
      stamp(cv, { x: 20, y: 27, rows: SPLIT_FAR, name: 'jambe-loin' }, pal);
    } else {
      leg(17 + (g.legFar || 0) + sw, g.liftFar, 'jambe-loin');
      if (!g.kick) leg(13 + (g.legNear || 0) + sw, g.liftNear, 'jambe-près');
    }
  } else {
    stamp(cv, { x: 18 + (g.legFar || 0), y: 28 - (g.liftFar ? 1 : 0), rows: SHOE, name: 'soulier-loin' }, pal);
    stamp(cv, { x: 14 + (g.legNear || 0), y: 28 - (g.liftNear ? 1 : 0), rows: SHOE, name: 'soulier-près' }, pal);
  }
  // Le corps, d'un seul tenant (pas de trait intérieur).
  const body = [{ x: 12, y: 12 + b, rows: SHOULDERS_SE, name: 'épaules' }];
  if (R0.top === 'bandeau') body.push({ x: 12, y: 16 + b, rows: MIDRIFF, name: 'ventre' });
  if (se) body.push({ x: 11, y: 13 + b + bu, rows: BUST_SE, name: 'buste' });
  else body.push({ x: 12, y: 13 + b, rows: BACK_NE, name: 'dos' });
  if (R0.top === 'bandeau') body.push(se ? { x: 11, y: 14 + b + bu, rows: BANDEAU_SE, name: 'bandeau' } : { x: 12, y: 15 + b, rows: BANDEAU_NE, name: 'bandeau' });
  else body.push(se ? { x: 11, y: 15 + b, rows: R0.top === 'bodice' ? BODICE_SE : CORSET_SE, name: 'corset' } : { x: 12, y: 16 + b, rows: CORSET_NE, name: 'corset' });
  const flip = g.kick === 3 && bottom === 'short';
  const sk = flip ? SKIRT_FLIP : (g.lifted && bottom === 'short' ? SKIRT_LIFT : SKIRTS[bottom])[g.skirt || 0];
  body.push({ x: (bottom === 'short' || bottom === 'fur' || bottom === 'leotard' ? 10 : 9) + sw, y: (flip ? 16 : 20) + b, rows: sk, name: 'bas' });
  if (R0.slit && se && g.slit) body.push({ x: 17 + sw, y: 23 + b, rows: SLIT_SE, name: 'fente' });
  body.push({ x: 10, y: 1 + b, rows: se ? eyes(head.se, g) : head.ne, name: 'tête' });
  if (head.backNE && !se) body.push({ x: 12, y: 11 + b, rows: head.backNE, name: 'cheveux' });
  for (const a of R0.acc) { const A = ACC[a]; if (A.front && !se) continue; body.push({ x: A.at[0], y: A.at[1] + b + (A.front ? bu : 0), rows: A.rows, name: a }); }
  for (const p of body) stamp(cv, p, pal, { outline: false });
  // La jambe LANCÉE du cancan passe devant les jupons (son trait la détache).
  if (g.kick === 3) stamp(cv, { x: 19, y: 10 + b, rows: KICK_LEG_HAUT, name: 'jambe-lancée' }, pal);
  else if (g.kick === 2) stamp(cv, { x: 18, y: 14 + b, rows: KICK_LEG, name: 'jambe-lancée' }, pal);
  else if (g.kick === 1) stamp(cv, { x: 16, y: 21 + b, rows: KNEE_LEG, name: 'genou-levé' }, pal);
  // Devant : le bras proche (son trait le détache du corps).
  if (upN) stamp(cv, { x: 8, y: 4 + b, rows: ARM_UP_NEAR, name: 'bras-près' }, pal);
  else stamp(cv, { x: 9, y: 13 + b, rows: armN, name: 'bras-près' }, pal);
  outlineAll(cv, pal.K);
  return cv;
}
// LA MARCHE en six images : contact, passage, contact de l'autre pied, passage. Le
// buste rebondit d'un pixel à chaque contact ; la fente s'ouvre quand la jambe avance.
const WALK = [
  { legNear: 1, legFar: 0, bob: 0, bust: 1, sway: 0, skirt: 0, slit: true },
  { legNear: 0, legFar: 0, liftFar: true, bob: -1, bust: 1, sway: 0, skirt: 1, slit: true },
  { legNear: -1, legFar: 1, bob: -1, bust: 0, sway: 1, skirt: 0 },
  { legNear: -1, legFar: 1, bob: 0, bust: 1, sway: 1, skirt: 1 },
  { legNear: 0, legFar: 0, liftNear: true, bob: -1, bust: 1, sway: 1, skirt: 0 },
  { legNear: 1, legFar: 0, bob: -1, bust: 0, sway: 0, skirt: 1, slit: true },
];
// LE BATTEMENT (cancan, gigue, revue) : jupons relevés, genou levé, jambe lancée.
const SKIRT_LIFT = [
  ['...RRRRRRR...', '.RRRrRRRrRRR.', 'RRRRRrRRRRrRR', 'TTTTTTTTTTTTT', '.TTTTTTTTTTT.'],
  ['...RRRRRRR...', '.RRrRRRrRRRR.', 'RRRrRRRRrRRRR', 'TTTTTTTTTTTTT', '..TTTTTTTTT..'],
];
const KNEE_LEG = ['BBBBB.', 'BbbbBB', '...BBb', '...BBb', '...rrr'];
const KICK_LEG = ['........rr', '.......BBr', '......BBb.', '.....BBb..', '....BBb...', '...BBb....', '..BBb.....', '.BBb......'];
// LE FRENCH CANCAN (2026-10-04, Raph : « la luxure, pousse l'idée au max » ; le dessin
// de la pose tiré d'une passe PixelLab, retracé ici pour garder le visage et le corps
// des filles) : le GRAND BATTEMENT — la jambe presque droite, la pointe au menton —,
// le jupon RETROUSSÉ sur ses volants (T) du côté de la jambe, et le GRAND ÉCART final,
// les jambes à plat sur les planches, les bras en V.
const KICK_LEG_HAUT = [
  '....rr.',
  '....BBr',
  '...BBb.',
  '...BBb.',
  '..BBb..',
  '..BBb..',
  '..BBb..',
  '.BBb...',
  '.BBb...',
  'BBb....',
  'BBb....',
];
const SKIRT_FLIP = [
  '........TTT..',
  '.......TTRRT.',
  '......TTRRRT.',
  '...RRRTRRRT..',
  '.RRRrRTTTT...',
  'RRRRRrTT.....',
  'TTTTTTT......',
  '.TTTTT.......',
];
const SPLIT_NEAR = ['rBBBBBBBBB', 'rrbbbbbbBB'];
const SPLIT_FAR = ['BBBBBBBBBr', 'BBbbbbbbrr'];
const K_BASE = { lifted: true, bob: 0, bust: 0, skirt: 0 };
const K_GENOU = { lifted: true, kick: 1, bob: -1, bust: 1, skirt: 1 };
const K_LANCE = { lifted: true, kick: 2, bob: -1, bust: -1, skirt: 0 };
const K_HAUT = { lifted: true, kick: 3, bob: -1, bust: -1, skirt: 0 };
const K_ECART = { up: 'both', ecart: true, bob: 5, bust: 1, skirt: 0, lifted: true };
const KICK = [
  K_BASE, K_GENOU, K_LANCE, { ...K_GENOU, bob: 0 },
  { ...K_BASE, legNear: -1, legFar: 1 }, K_GENOU, K_HAUT, K_HAUT,
  { ...K_GENOU, bob: 0 }, K_BASE, K_GENOU, K_LANCE,
  { ...K_GENOU, bob: 0 }, K_ECART, { ...K_ECART, bust: 0 }, K_ECART,
];
// L'ONDULATION (feu, bacchanale, lumière) : bras levés, hanches qui roulent, le buste
// qui rebondit à chaque coup de hanche.
const SWAY = [
  { up: 'both', sway: 0, bust: 0, bob: 0, skirt: 0 },
  { up: 'both', sway: 1, bust: 1, bob: 0, skirt: 1 },
  { up: 'both', sway: 1, bust: 0, bob: -1, skirt: 0 },
  { up: 'near', sway: 0, bust: -1, bob: 0, skirt: 1 },
  { up: 'both', sway: -1, bust: 0, bob: 0, skirt: 0 },
  { up: 'both', sway: -1, bust: 1, bob: 0, skirt: 1 },
  { up: 'both', sway: -1, bust: 0, bob: -1, skirt: 0 },
  { up: 'far', sway: 0, bust: -1, bob: 0, skirt: 1 },
];
const DANCES = { kick: KICK, sway: SWAY };
// LE REPOS DE LA CROUPIÈRE (Raph, 2026-10-04 : « garde toujours la même croupière à
// chaque table et anime-la un peu ») : debout derrière la table, poings sur les
// hanches, elle respire (le buste monte d'UN pixel), cligne des yeux, jette un regard
// de côté. Une image dure 160 ms comme la marche : les poses se répètent pour donner
// le tempo (34 images, 5,4 s la boucle, deux respirations).
// Amplitude réduite (Raph, même jour : « réduis un peu l'amplitude du mouvement ») :
// les épaules et la tête ne montent plus avec le souffle (le buste culminait à deux
// pixels), seul le buste se soulève, un pixel.
const R_N = { bob: 0, bust: 0 }, R_I = { bob: 0, bust: -1 };
const fois = (n, g) => Array.from({ length: n }, () => g);
const REPOS = [
  ...fois(6, R_N), ...fois(7, R_I), ...fois(3, R_N), { ...R_N, blink: true }, ...fois(3, R_N),
  ...fois(7, R_I), ...fois(4, { ...R_N, look: true }), ...fois(3, R_N),
];
// Les croupières : la PREMIÈRE fille de chaque troupe (plaisirsCast, `girls[0]`), la
// même à toutes les tables d'un âge.
const CROUPIERES = [
  'plaisirs-feu-chasseresse', 'plaisirs-moyen-courtisane', 'plaisirs-antique-hetaire', 'plaisirs-fonte-courtisane',
  'plaisirs-neon-cocktail', 'plaisirs-jade-voile', 'plaisirs-astral-voile', 'plaisirs-cristal-voile',
];

// ── LES GIGOLOS DE LA MAISON ────────────────────────────────────────────────
// Raph, 2026-10-04 : « on a fait des filles mais il faut un peu de gigolos aussi (moins,
// plus dans le service) ». Deux par âge, dessinés dans le même gréement que les filles :
// la même tête (yeux nets), la même toise (semelles à y = 28), mais le TORSE large, nu
// sous le gilet, la chemise ouverte ou la toge de son époque, les bras qui balancent.
// Ils SERVENT : le barman, le croupier des dés, le serveur qui passe d'une salle à
// l'autre, son plateau à la main (bande « -plateau »).
// Lettres : peau S s Z U, sourcils et yeux E W I, bouche M, barbe naissante u ; cheveux
// H h L ; haut A a Q (gilet, veste, liseré) ; étoffe claire T t (chemise, toge) ; bas
// R r ; souliers F f ; or et nœud G N ; plateau Y y, verres C, boisson D.
const SKIN_M = {
  K: '#1a1018', S: '#f2c6a0', s: '#d09a78', Z: '#ffe2c8', U: '#b07a5c', E: '#24122a', W: '#ffffff', M: '#a8584e', u: '#c4a088',
  Y: '#d8d8e0', y: '#8a8aa0', C: '#f4f0ff', c: '#c8c8d8', D: '#f0c040', B: '#1e5a3a', G: '#f0c040',
};
// La TÊTE (trois-quarts face) : cheveux courts plaqués, raie sur le côté, l'oreille ;
// les yeux aux mêmes places que ceux des filles, la mâchoire plus carrée.
const HEAD_M = {
  court: {
    se: [
      '..HHHHHH....',
      '.HHLLLLHHH..',
      'HHLHHHHHHHH.',
      'HHHHHHHHHHHh',
      'HHHHHHHHhhHh',
      'HHHHhSSSSSSh',
      'HHHsSSEESEES',
      'HHsSSSWISWIS',
      '.HhSSSSSsSS.',
      '..hSSSSsMS..',
      '...sSSSSs...',
    ],
    ne: [
      '..HHHHHH....',
      '.HHHHHHHHH..',
      'HHHHHHHHHHH.',
      'HHHHHHHHHHHh',
      'HHHHHHHHHHHh',
      'HHHHHHHHHHhS',
      'HHHHHHHHHhSS',
      'HHHHHHHHHsSS',
      '.HHHHHHHhSS.',
      '..sSSSSSSs..',
      '...sSSSSs...',
    ],
  },
  // Les boucles (l'Antiquité, le néon) : le dessus frisé, des mèches sur le front.
  boucle: {
    se: [
      '..HhHhHH....',
      '.HHhHHhHHH..',
      'HhHHLHHhHHH.',
      'HHhHHHhHHhHh',
      'HHHhHHHhHhHh',
      'HHHHhSShSSSh',
      'HHHsSSEESEES',
      'HHsSSSWISWIS',
      '.HhSSSSSsSS.',
      '..hSSSSsMS..',
      '...sSSSSs...',
    ],
    ne: [
      '..HhHhHH....',
      '.HHhHHhHHH..',
      'HhHHhHHhHHH.',
      'HHhHHHhHHhHh',
      'HHHhHHHhHhHh',
      'HhHHhHHhHHhS',
      'HHhHHhHHHhSS',
      'HHHhHHhHHsSS',
      '.HhHHhHHhSS.',
      '..sSSSSSSs..',
      '...sSSSSs...',
    ],
  },
  // Les cheveux longs (le Feu, le Moyen Âge) : la masse tombe derrière la nuque.
  long: {
    se: [
      '..HHHHHH....',
      '.HHLLHHHHH..',
      'HHLHHHHHHHH.',
      'HHHHHHHHHHHh',
      'HHHHHHHHhHHh',
      'HHHHhSSSSSSh',
      'HHHHSSEESEES',
      'HHHhSSWISWIS',
      'HHHhSSSSsSS.',
      'HHH.hSSsMS..',
      'HH..sSSSSs..',
    ],
    ne: [
      '..HHHHHH....',
      '.HHHHHHHHH..',
      'HHHHHHHHHHH.',
      'HHHHHHHHHHHh',
      'HHHHHHHHHHHh',
      'HHHHHHHHHHhS',
      'HHHHHHHHHhSS',
      'HHHHHHHHHhSS',
      'HHHHHHHHHhS.',
      'HHHHHHHHHH..',
      '.HHHHHHHH...',
    ],
    backSE: ['HHH', 'HHh', 'Hh.', 'h..'],
  },
};
// La moustache, la barbe naissante (posées sur la tête de face).
const ACC_M = {
  moustache: { rows: ['HHH'], at: [16, 10] },
  barbe: { rows: ['uu...u', '.uuuu.'], at: [13, 10] },
  laurier: { rows: ['G.G.G.G.G'], at: [11, 3] },
  casquette: { rows: ['..AAAAAA....', '.AAQAAAAAAA.', 'AAAAAAAAAAAa'], at: [10, 0] },
  bandeau: { rows: ['GGGGGGGGGGGG'], at: [10, 4] },
  os: { rows: ['WhWhWhW'], at: [12, 13], front: true },
};
// Le TORSE nu (dix de large, en x 11) : le cou, les épaules, les pectoraux (le reflet Z
// sur le proche, le sillon s, l'ombre U dessous), les abdominaux, la taille.
const TORSO_SE = [
  '...sSSs...',
  '.sZSSSSSs.',
  'sZZSSSsSSs',
  'SZSSSSsSSs',
  'SSUUSsUUSs',
  '.SSSSsSSs.',
  '.sSSsSsSs.',
  '..SSSSSS..',
];
const TORSO_NE = [
  '...sSSs...',
  '.sSSSSSZs.',
  'sSSSSSSZSs',
  'SSsSSSSsSs',
  'SSSsSSsSSs',
  '.SSSsSSSs.',
  '.sSSSsSSs.',
  '..SSSSSS..',
];
// Les HAUTS posés sur le torse (« . » laisse voir la peau).
const TOPS_M = {
  nu: null,
  // Le gilet ouvert sur le torse nu, boutonné bas, le nœud papillon au cou.
  gilet: {
    se: ['..NNnNN...', 'AA......AA', 'AAA....AAA', 'AAAA..AAAA', 'AAAAA.AAAa', '.AAAAQAAA.', '.AAAAQAAA.', '..AAAAAA..'],
    ne: ['..........', 'AAAAAAAAAA', 'AAAAAAAAAA', 'AAAAAAAAAA', 'AAAaAAAAAA', '.AAAaAAAA.', '.AAAAaAAA.', '..AAAAAA..'],
  },
  // Le col blanc et le nœud sur le torse nu (la revue).
  col: {
    se: ['..WNnNW...', '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
    ne: ['..WWWW....', '..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  },
  // La chemise ouverte jusqu'au ventre, lacée (le Moyen Âge, le crooner).
  chemise: {
    se: ['..T....T..', 'TTTT..TTTT', 'TTTt..tTTT', 'TTTTa.tTTt', 'TTTTt.aTTt', '.TTTTtTTT.', '.TTTTtTTT.', '..TTTTTT..'],
    ne: ['..TTTTT...', 'TTTTTTTTTT', 'TTTTTTTTTT', 'TTtTTTTTTT', 'TTTtTTTtTT', '.TTTtTTTT.', '.TTTTtTTT.', '..TTTTTT..'],
  },
  // La toge sur l'épaule lointaine, l'épaule proche nue (l'échanson).
  toge: {
    se: ['......TT..', '.....TTTTt', '....TTTTTt', '...TTtTTTt', '..TTTTtTTt', '.TTTTTTtTt', 'TTTTTTTTtT', 'GGGGGGGGGG'],
    ne: ['..TT......', 'tTTTT.....', 'tTTTTT....', 'tTTTtTT...', 'tTTTTtTT..', 'tTtTTTTTT.', 'TtTTTTTTTT', 'GGGGGGGGGG'],
  },
  // La fourrure jetée sur l'épaule lointaine (le colosse du Feu).
  fourrure: {
    se: ['......RR..', '.....RRRRr', '....RRrRRr', '...RrRRRrR', '..RRRRrRRr', '.R.RrRRR.r', '.....R.r..', '..........'],
    ne: ['..RR......', 'rRRRR.....', 'rRRrRR....', 'RrRRRrR...', 'rRRrRRRR..', 'r.RRRrR.R.', '..r.R.....', '..........'],
  },
  // La veste ouverte des âges de lumière (liseré lumineux Q) sur le torse nu.
  veste: {
    se: ['AA......AA', 'AAQ....QAA', 'AAQ....QAA', 'AAQ....QAA', 'AAQ....QAa', '.AQ....QA.', '.AQ....QA.', '..Q....Q..'],
    ne: ['AAAAAAAAAA', 'AAAAAAAAAA', 'AAAAAAAAAA', 'AAAAaAAAAA', 'AAAAaAAAAa', '.AAAAaAAA.', '.AAAAAaAA.', '..AAAAAA..'],
  },
  // Le harnais de lumière (deux sangles croisées) sur le torse nu.
  harnais: {
    se: ['..........', '.Q......Q.', '..Q....Q..', '...Q..Q...', '....QQ....', '...Q..Q...', '..Q....Q..', '..........'],
    ne: ['..........', '.Q......Q.', '..Q....Q..', '...Q..Q...', '....QQ....', '...Q..Q...', '..Q....Q..', '..........'],
  },
  // La marinière sans manches, ouverte au col, le foulard rouge (l'apache).
  mariniere: {
    se: ['...GGG....', 'TT.GG..TTT', 'AAAA..AAAA', 'TTTT..TTTT', 'AAAAA.AAAA', '.TTTTTTTT.', '.AAAAAAAA.', '..TTTTTT..'],
    ne: ['..........', 'TTTTTTTTTT', 'AAAAAAAAAA', 'TTTTTTTTTT', 'AAAAAAAAAA', '.TTTTTTTT.', '.AAAAAAAA.', '..TTTTTT..'],
  },
  // Le pourpoint de cuir sans manches, lacé (l'écuyer).
  pourpoint: {
    se: ['..........', 'AAA....AAA', 'AAAA..AAAA', 'AAAAQ.AAAA', 'AAAA.QAAAa', '.AAAQ.AAA.', '.AAAAAAAA.', '..AAAAAA..'],
    ne: ['..........', 'AAAAAAAAAA', 'AAAAAAAAAA', 'AAAaAAAAAA', 'AAAAaAAAAa', '.AAAAaAAA.', '.AAAAAaAA.', '..AAAAAA..'],
  },
};
// Les BAS : la ceinture (y 20), les hanches (y 21), puis les jambes (trois de large, un
// écart de deux entre elles) et les souliers (y 28) ; le pagne et la jupe de toge
// laissent les jambes nues.
const BOTTOMS_M = {
  pantalon: { belt: 'aaaaGaaa', hips: 'RRRRRRRR', leg: 'RRr', top: 22 },
  braies: { belt: 'aaaaGaaa', hips: 'RRRRRRRR', leg: 'RRr', top: 22, botte: 24 },
  pagne: { cover: ['RRRRRRRRRR', 'RrRRRrRRrR', 'R.rRR.RrR.'], at: 11, y: 20, leg: 'SSs', top: 23 },
  toge: { cover: ['TTTTTTTTTT', 'TtTTTtTTtT', 'TTtTTTtTTT', '.TTtTTTtT.'], at: 11, y: 20, leg: 'SSs', top: 24 },
};
// Les BRAS, le long du corps : proche (devant le torse, son trait l'en détache) et
// lointain (derrière) ; la main avance ou recule avec le pas. `T` : la manche.
const ARM_M = {
  near: {
    mid: ['.SS.', '.SS.', '.SS.', '.SS.', '.Ss.', '.SS.', '.SS.', '.ss.'],
    fwd: ['.SS.', '.SS.', '.SS.', '..SS', '..Ss', '..SS', '..SS', '..ss'],
    back: ['.SS.', '.SS.', '.SS.', 'SS..', 'Ss..', 'SS..', 'SS..', 'ss..'],
  },
  far: { mid: ['.SS', '.SS', '.SS', '.Ss', '.SS', '.SS', '.SS', '.ss'] },
};
// Le PLATEAU du serveur, porté de la main lointaine à hauteur de poitrine : une
// bouteille (B, sa capsule d'or G) et une coupe (le bord C, la boisson D, le pied c).
// Deux coupes côte à côte faisaient deux yeux ; un pixel de verre se noyait dans le
// contour. Le bras lointain plié dessous.
const TRAY = ['.G.....', '.B..CCC', 'BBB.DDD', 'BBB..c.', 'YYYYYYY', '.yyyyy.'];
const ARM_TRAY = ['.SS...', '.SS...', '.SS...', '.SSs..', '..SSSS', '...sss'];

// Un bras habillé : les `n` premiers rangs passent à la couleur de la manche (`c`, son
// ombre en minuscule), le rang `cuff` devient la manchette blanche.
function sleeveRows(rows, R0) {
  if (!R0.sleeve && R0.cuff == null) return rows;
  const c = R0.sleeve, lo = c ? c.toLowerCase() : null;
  return rows.map((r, j) => {
    if (R0.cuff != null && j === R0.cuff) return r.replace(/[Ss]/g, R0.cuffColor || 'W');
    if (c && j < (R0.sleeveLen || 6)) return r.replace(/S/g, c).replace(/s/g, lo);
    return r;
  });
}
// Les rangs d'une jambe, du haut du bas jusqu'à la cheville (les bottes des braies
// prennent la couleur des souliers), puis le soulier.
function legRowsM(bot) {
  const r = [];
  for (let y = bot.top; y < 28; y += 1) r.push(bot.botte && y >= bot.botte ? 'FFf' : bot.leg);
  r.push('FFF');
  return r;
}
// g : bob, legNear / legFar, liftNear / liftFar (comme les filles), arm ('mid', 'fwd',
// 'back' : la main proche qui balance), tray (le plateau), blink, look.
function frameM(who, view, g) {
  const R0 = ROSTER_M[who], pal = { ...SKIN_M, ...R0.pal }, cv = makeCanvas();
  const b = g.bob || 0, se = view === 'se';
  const head = HEAD_M[R0.head], bot = BOTTOMS_M[R0.bottom], top = TOPS_M[R0.top];
  // Derrière : les cheveux longs, le bras lointain (ou celui du plateau), les jambes.
  if (head.backSE && se) stamp(cv, { x: 9, y: 10 + b, rows: head.backSE, name: 'cheveux' }, pal, { outline: false });
  if (g.tray) stamp(cv, { x: 20, y: 13 + b, rows: sleeveRows(ARM_TRAY, R0), name: 'bras-plateau' }, pal);
  else stamp(cv, { x: 20, y: 13 + b, rows: sleeveRows(ARM_M.far.mid, R0), name: 'bras-loin' }, pal);
  const legs = legRowsM(bot);
  stamp(cv, { x: 17 + (g.legFar || 0), y: bot.top - (g.liftFar ? 1 : 0), rows: legs, name: 'jambe-loin' }, pal);
  stamp(cv, { x: 12 + (g.legNear || 0), y: bot.top - (g.liftNear ? 1 : 0), rows: legs, name: 'jambe-près' }, pal);
  // Le corps, d'un seul tenant : le torse, son haut, le bas, la tête.
  const body = [{ x: 11, y: 12 + b, rows: se ? TORSO_SE : TORSO_NE, name: 'torse' }];
  if (top) body.push({ x: 11, y: 12 + b, rows: se ? top.se : top.ne, name: 'haut' });
  if (bot.cover) body.push({ x: bot.at, y: bot.y + b, rows: bot.cover, name: 'bas' });
  else body.push({ x: 12, y: 20 + b, rows: [bot.belt, bot.hips], name: 'bas' });
  body.push({ x: 10, y: 1 + b, rows: se ? eyes(head.se, g) : head.ne, name: 'tête' });
  for (const a of R0.acc || []) { const A = ACC_M[a]; if (!se && (A.front || a === 'moustache' || a === 'barbe')) continue; body.push({ x: A.at[0], y: A.at[1] + b, rows: A.rows, name: a }); }
  for (const p of body) stamp(cv, p, pal, { outline: false });
  // Devant : le bras proche, qui balance avec le pas ; le plateau et ses verres.
  stamp(cv, { x: 8, y: 13 + b, rows: sleeveRows(ARM_M.near[g.arm || 'mid'], R0), name: 'bras-près' }, pal);
  if (g.tray) stamp(cv, { x: 21, y: 11 + b, rows: TRAY, name: 'plateau' }, pal);
  outlineAll(cv, pal.K);
  return cv;
}
// LA MARCHE en six images (le même pas que les filles) ; la main proche balance à
// contre-jambe.
const WALK_M = [
  { legNear: 1, legFar: 0, bob: 0, arm: 'back' },
  { legNear: 0, legFar: 0, liftFar: true, bob: -1, arm: 'mid' },
  { legNear: -1, legFar: 1, bob: -1, arm: 'fwd' },
  { legNear: -1, legFar: 1, bob: 0, arm: 'fwd' },
  { legNear: 0, legFar: 0, liftNear: true, bob: -1, arm: 'mid' },
  { legNear: 1, legFar: 0, bob: -1, arm: 'back' },
];

// ── LES GIGOLOS, âge par âge ─────────────────────────────────────────────────
// Deux par troupe (plaisirsCast `gigolos`) : le premier sert (le plateau lui va), le
// second tient le bar ou la table des dés. Chacun : sa tête, son haut, son bas, ses
// manches, sa palette (peau comprise quand elle change).
const TAN = { S: '#e0ac80', s: '#b8805c', Z: '#f4caa0', U: '#9a6448', u: '#a07c62' };
const OLIVE = { S: '#e8b88c', s: '#c08c66', Z: '#f8d4b0', U: '#a06a4a', u: '#a88a6a' };
const BRUN = { S: '#a8704a', s: '#7e4e30', Z: '#c88e64', U: '#603820', u: '#6e4a34' };
const ROSTER_M = {
  // 5 — LA FONTE : le garçon de café en gilet sur la peau, l'apache et son foulard rouge.
  'plaisirs-fonte-garcon': { head: 'court', acc: ['moustache'], top: 'gilet', bottom: 'pantalon',
    pal: { H: '#2a1c16', h: '#140c0a', L: '#4a3428', I: '#3a5a8a', A: '#1e1a24', a: '#0e0a12', Q: '#f0c040', N: '#0e0a12', n: '#3a3048', R: '#1e1a24', r: '#0e0a12', G: '#c8a040', F: '#1a1418', f: '#3a3040' } },
  'plaisirs-fonte-apache': { head: 'court', acc: ['casquette'], top: 'mariniere', bottom: 'pantalon',
    pal: { ...TAN, H: '#1a1410', h: '#0a0806', L: '#3a2a20', I: '#4a3a2a', T: '#f4f0e8', A: '#1e2a5a', a: '#c42a3a', Q: '#3a4a8a', G: '#c42a3a', R: '#2a2a34', r: '#14141c', F: '#1a1418', f: '#3a3040', D: '#c42a3a' } },
  // 6 — LE NÉON : le torse nu, le col et le nœud de la revue ; le crooner en satin.
  'plaisirs-neon-chippendale': { head: 'court', acc: [], top: 'col', bottom: 'pantalon', cuff: 5,
    pal: { H: '#f0d070', h: '#b89a40', L: '#fff4b0', I: '#3a8ac8', N: '#0e0a12', n: '#3a3048', R: '#141018', r: '#08060c', a: '#08060c', G: '#f0c040', F: '#0e0a12', f: '#3a3048', D: '#ff4a9a' } },
  'plaisirs-neon-crooner': { head: 'boucle', acc: [], top: 'chemise', bottom: 'pantalon', sleeve: 'T', sleeveLen: 4,
    pal: { ...BRUN, H: '#1a1210', h: '#0a0806', L: '#3a2a20', I: '#6a4a2a', T: '#d82a5a', t: '#9a1a40', a: '#08060c', R: '#141018', r: '#08060c', G: '#f0c040', F: '#0e0a12', f: '#3a3048' } },
  // 0-1 — LE FEU : le pagne de fourrure, le collier d'os, la planche et ses bols.
  'plaisirs-feu-pagne': { head: 'long', acc: ['os'], top: 'nu', bottom: 'pagne',
    pal: { B: '#a8643a', G: '#5a361c', ...TAN, H: '#5a3418', h: '#2e1a0c', L: '#8a5a30', I: '#5a7a3a', R: '#9a5a30', r: '#5a361c', F: '#6a4a2a', f: '#3a2a18', W: '#f4ecd8', Y: '#8a5a30', y: '#5a361c', C: '#c87a4a', c: '#8a5a30', D: '#6a2a1a' } },
  'plaisirs-feu-colosse': { head: 'court', acc: ['barbe', 'os'], top: 'fourrure', bottom: 'pagne',
    pal: { B: '#a8643a', G: '#5a361c', ...BRUN, H: '#1a1008', h: '#0a0604', L: '#3a2414', I: '#6a4a2a', R: '#8a8478', r: '#5a564c', F: '#5a564c', f: '#3a3830', W: '#f4ecd8', Y: '#8a5a30', y: '#5a361c', C: '#c87a4a', c: '#8a5a30', D: '#6a2a1a' } },
  // 2-3 — LA PIERRE, LA COURONNE : le tavernier en chemise lacée ouverte, l'écuyer en
  // pourpoint de cuir sur la peau ; la chope d'étain.
  'plaisirs-moyen-tavernier': { head: 'long', acc: [], top: 'chemise', bottom: 'braies', sleeve: 'T', sleeveLen: 5,
    pal: { H: '#6a3a1a', h: '#3a1e0c', L: '#9a6a3a', I: '#3a6a8a', T: '#f8f2e4', t: '#c8bca4', a: '#5a3a20', R: '#5a3a24', r: '#3a2414', G: '#c8a040', F: '#3a2414', f: '#5a3a24', Y: '#8a5a30', y: '#5a361c', C: '#b8b8c0', c: '#8a8a94', D: '#e0a030' } },
  'plaisirs-moyen-ecuyer': { head: 'court', acc: ['barbe'], top: 'pourpoint', bottom: 'braies',
    pal: { ...TAN, H: '#2a1a10', h: '#140c08', L: '#4a3020', I: '#4a7a3a', A: '#7a4a24', a: '#4a2a12', Q: '#e8d8b0', R: '#2e5a3a', r: '#1a3a24', G: '#c8a040', F: '#3a2414', f: '#5a3a24', Y: '#8a5a30', y: '#5a361c', C: '#b8b8c0', c: '#8a8a94', D: '#9a2a3a' } },
  // 4 — LE MARBRE : l'échanson, la toge sur l'épaule, le laurier, la coupe de vin.
  'plaisirs-antique-echanson': { head: 'boucle', acc: ['laurier'], top: 'toge', bottom: 'toge',
    pal: { ...OLIVE, H: '#2a1a10', h: '#140c08', L: '#4a3020', I: '#3a6a5a', T: '#f4eee2', t: '#c8bfae', G: '#f0c040', F: '#a0602a', f: '#6a3a18', Y: '#f0c040', y: '#9a7020', C: '#f0c040', c: '#c8902a', D: '#7a1a3a', B: '#c87a4a' } },
  // L'athlète : le pagne de lin, le bandeau d'or, un brassard d'or au bras.
  'plaisirs-antique-athlete': { head: 'boucle', acc: ['bandeau'], top: 'nu', bottom: 'pagne', cuff: 1, cuffColor: 'G',
    pal: { ...BRUN, H: '#1a1008', h: '#0a0604', L: '#3a2414', I: '#5a4a2a', R: '#f4eee2', r: '#c8bfae', G: '#f0c040', F: '#a0602a', f: '#6a3a18', Y: '#f0c040', y: '#9a7020', C: '#f0c040', c: '#c8902a', D: '#7a1a3a', B: '#c87a4a' } },
};
// 7-9 — LES ÂGES DE LUMIÈRE : le servant en veste ouverte à liseré lumineux, l'ange au
// harnais de lumière ; le plateau de lumière.
for (const [k, c] of COSMIC) {
  const base = { H: c.hair[0], h: c.hair[1], L: c.hair[2], I: c.iris, A: c.dark, a: '#08060c', Q: c.glow, R: c.dark, r: '#08060c', G: c.glow, F: c.dark, f: c.glow2, Y: c.glow2, y: c.dark, C: '#ffffff', c: c.glow, D: c.glow };
  ROSTER_M[`plaisirs-${k}-servant`] = { head: 'court', acc: [], top: 'veste', bottom: 'pantalon', sleeve: 'A', sleeveLen: 6, cuff: 6, cuffColor: 'Q',
    pal: { ...(k === 'cristal' ? BRUN : k === 'jade' ? TAN : {}), ...base } };
  ROSTER_M[`plaisirs-${k}-ange`] = { head: 'long', acc: [], top: 'harnais', bottom: 'pantalon',
    pal: { ...(k === 'astral' ? BRUN : k === 'cristal' ? {} : OLIVE), ...base, R: c.glow2, r: c.dark } };
}

// ── Aperçu ───────────────────────────────────────────────────────────────────
function preview(out, rowsOfFrames, k = 10) {
  const W = Math.max(...rowsOfFrames.map((r) => r.length)) * (SIZE * k + 6), H = rowsOfFrames.length * (SIZE * k + 6);
  const p = new PNG({ width: W, height: H });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = 226; p.data[i + 1] = 216; p.data[i + 2] = 198; p.data[i + 3] = 255; }
  rowsOfFrames.forEach((row, r) => row.forEach((cv, n) => {
    for (let y = 0; y < SIZE * k; y += 1) for (let x = 0; x < SIZE * k; x += 1) {
      const s = (Math.floor(y / k) * cv.w + Math.floor(x / k)) * 4;
      if (cv.data[s + 3] < 128) continue;
      const d = ((r * (SIZE * k + 6) + y) * W + n * (SIZE * k + 6) + x) * 4;
      p.data[d] = cv.data[s]; p.data[d + 1] = cv.data[s + 1]; p.data[d + 2] = cv.data[s + 2];
    }
  }));
  fs.writeFileSync(out, PNG.sync.write(p));
}


// ── L'export ─────────────────────────────────────────────────────────────────
// Les bandes du jeu ({nom}-{southeast|southwest|northeast|northwest}.png, mêmes noms
// que les personnages PixelLab qu'elles remplacent) ; sud-ouest et nord-ouest sont
// les MIROIRS de sud-est et nord-est. La danse : face seulement (le dos recopie).
// Puis, si Aseprite est installé, une source par fille : art/plaisirs/<nom>.aseprite,
// une étiquette par animation (marche-se, marche-ne, cancan-se).
const ASEPRITE = 'C:/Program Files/Aseprite/Aseprite.exe';
function build(only) {
  const written = [];
  const save = (file, frames) => { fs.writeFileSync(path.join(OUT, file), PNG.sync.write(strip(frames))); written.push(file); };
  const sheets = {};
  for (const n of Object.keys(ROSTER)) {
    if (only && !n.includes(only)) continue;
    const se = WALK.map((g) => frame(n, 'se', g)), ne = WALK.map((g) => frame(n, 'ne', g));
    save(`${n}-southeast.png`, se); save(`${n}-southwest.png`, se.map(mirror));
    save(`${n}-northeast.png`, ne); save(`${n}-northwest.png`, ne.map(mirror));
    sheets[n] = [['marche-se', se], ['marche-ne', ne]];
    const dance = ROSTER[n].dance;
    if (dance) {
      const d = DANCES[dance].map((g) => frame(n, 'se', g));
      for (const [dir, fr] of [['southeast', d], ['southwest', d.map(mirror)], ['northeast', d], ['northwest', d.map(mirror)]]) save(`${n}-danse-${dir}.png`, fr);
      sheets[n].push([`${dance}-se`, d]);
    }
    if (CROUPIERES.includes(n)) sheets[n].push(['repos-se', saveRepos(n, save)]);
  }
  return { written, sheets };
}
// La bande de REPOS d'une croupière ({nom}-repos-{direction}.png), face seulement : le
// dos recopie, comme la danse. Jouée à la table (PlaisirsTable.jsx).
function saveRepos(n, save) {
  const r = REPOS.map((g) => frame(n, 'se', g));
  for (const [dir, fr] of [['southeast', r], ['southwest', r.map(mirror)], ['northeast', r], ['northwest', r.map(mirror)]]) save(`${n}-repos-${dir}.png`, fr);
  return r;
}
// La source Aseprite : les images d'une bande temporaire, rangées en étiquettes.
async function asepriteSources(sheets, calque = 'fille') {
  if (!fs.existsSync(ASEPRITE)) { console.log('Aseprite absent : sources non écrites'); return; }
  const { execFileSync } = await import('node:child_process');
  fs.mkdirSync('art/plaisirs', { recursive: true });
  for (const [who, anims] of Object.entries(sheets)) {
    const all = anims.flatMap(([, fr]) => fr), tmp = path.resolve(`art/plaisirs/.${who}-tmp.png`);
    fs.writeFileSync(tmp, PNG.sync.write(strip(all)));
    const tags = []; let at = 1;
    for (const [name, fr] of anims) { tags.push(`{'${name}',${at},${at + fr.length - 1}}`); at += fr.length; }
    const lua = path.resolve(`art/plaisirs/.${who}.lua`);
    fs.writeFileSync(lua, [
      `local sheet = Image{ fromFile = [[${tmp}]] }`,
      `local n = ${all.length}`,
      `local spr = Sprite(${SIZE}, ${SIZE}, ColorMode.RGB)`,
      `spr.layers[1].name = '${calque}'`,
      `for i = 2, n do spr:newEmptyFrame() end`,
      `for i = 1, n do local img = Image(${SIZE}, ${SIZE}, ColorMode.RGB); img:drawImage(sheet, Point(-(i - 1) * ${SIZE}, 0)); spr:newCel(spr.layers[1], spr.frames[i], img, Point(0, 0)); spr.frames[i].duration = 0.16 end`,
      `for _, t in ipairs({${tags.join(',')}}) do local tag = spr:newTag(t[2], t[3]); tag.name = t[1] end`,
      `spr:saveAs([[${path.resolve(`art/plaisirs/${who}.aseprite`)}]])`,
    ].join('\n'));
    execFileSync(ASEPRITE, ['-b', '--script', lua], { stdio: 'pipe' });
    fs.unlinkSync(lua); fs.unlinkSync(tmp);
    console.log('source', `art/plaisirs/${who}.aseprite`);
  }
}
if (process.argv.includes('--build')) {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7) || null;
  const { written, sheets } = build(only);
  console.log('bandes', written.length);
  await asepriteSources(sheets);
}
// --repos : les SEULES bandes de repos des croupières (les autres bandes ne bougent
// pas) ; --preview-repos=out.png : leurs quatre poses (repos, souffle, yeux fermés,
// regard), une croupière par rang.
if (process.argv.includes('--repos')) {
  const written = [];
  const save = (file, frames) => { fs.writeFileSync(path.join(OUT, file), PNG.sync.write(strip(frames))); written.push(file); };
  for (const n of CROUPIERES) saveRepos(n, save);
  console.log('bandes de repos', written.length);
}
const PREV_REPOS = process.argv.find((a) => a.startsWith('--preview-repos='));
if (PREV_REPOS) {
  const poses = [R_N, R_I, { ...R_N, blink: true }, { ...R_N, look: true }];
  preview(PREV_REPOS.slice(16), CROUPIERES.map((n) => poses.map((g) => frame(n, 'se', g))), 8);
  console.log('aperçu', PREV_REPOS.slice(16));
}

// --preview-danse=out.png : toutes les images de la danse des danseuses du battement.
const PREV_DANSE = process.argv.find((a) => a.startsWith('--preview-danse='));
if (PREV_DANSE) {
  const quoi = (process.argv.find((a) => a.startsWith('--images=')) || '').slice(9);
  const idx = quoi ? quoi.split(',').map(Number) : KICK.map((_, i) => i);
  const rows = Object.keys(ROSTER).filter((n) => ROSTER[n].dance === 'kick').map((n) => idx.map((i) => frame(n, 'se', KICK[i])));
  preview(PREV_DANSE.slice(16), rows, +((process.argv.find((a) => a.startsWith('--k=')) || '').slice(4)) || 6);
  console.log('aperçu danse', PREV_DANSE.slice(16), rows.length);
}

const PREV = process.argv.find((a) => a.startsWith('--preview='));
if (PREV) {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
  const rows = [];
  for (const n of Object.keys(ROSTER)) {
    if (only && !n.includes(only)) continue;
    const r = WALK.slice(0, 3).map((g) => frame(n, 'se', g)).concat([frame(n, 'ne', WALK[0])]);
    if (ROSTER[n].dance) r.push(...DANCES[ROSTER[n].dance].slice(0, 4).map((g) => frame(n, 'se', g)));
    rows.push(r);
  }
  const k = +((process.argv.find((a) => a.startsWith('--k=')) || '').slice(4)) || 5;
  preview(PREV.slice(10), rows, k);
  console.log('aperçu', PREV.slice(10), rows.length);
}

// --gigolos [--only=fonte] : les bandes des gigolos ({nom}-{direction}.png, et
// {nom}-plateau-{direction}.png pour le service), sud-ouest et nord-ouest en miroir,
// puis leurs sources art/plaisirs/<nom>.aseprite. Les demi-bandes ensuite :
//   node scripts/bakeHalfBands.mjs inhabitants <nom> --div=2
if (process.argv.includes('--gigolos')) {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7) || null;
  const written = [], sheets = {};
  const save = (file, frames) => { fs.writeFileSync(path.join(OUT, file), PNG.sync.write(strip(frames))); written.push(file); };
  for (const n of Object.keys(ROSTER_M)) {
    if (only && !n.includes(only)) continue;
    const se = WALK_M.map((g) => frameM(n, 'se', g)), ne = WALK_M.map((g) => frameM(n, 'ne', g));
    const tse = WALK_M.map((g) => frameM(n, 'se', { ...g, tray: true })), tne = WALK_M.map((g) => frameM(n, 'ne', { ...g, tray: true }));
    save(`${n}-southeast.png`, se); save(`${n}-southwest.png`, se.map(mirror));
    save(`${n}-northeast.png`, ne); save(`${n}-northwest.png`, ne.map(mirror));
    save(`${n}-plateau-southeast.png`, tse); save(`${n}-plateau-southwest.png`, tse.map(mirror));
    save(`${n}-plateau-northeast.png`, tne); save(`${n}-plateau-northwest.png`, tne.map(mirror));
    sheets[n] = [['marche-se', se], ['marche-ne', ne], ['plateau-se', tse], ['plateau-ne', tne]];
  }
  console.log('bandes des gigolos', written.length);
  await asepriteSources(sheets, 'gigolo');
}
// --preview-gigolos=out.png : chaque gigolo, trois images de marche, le dos, trois
// images au plateau.
const PREV_M = process.argv.find((a) => a.startsWith('--preview-gigolos='));
if (PREV_M) {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
  const rows = [];
  for (const n of Object.keys(ROSTER_M)) {
    if (only && !n.includes(only)) continue;
    rows.push([
      ...WALK_M.slice(0, 3).map((g) => frameM(n, 'se', g)), frameM(n, 'ne', WALK_M[0]),
      ...WALK_M.slice(0, 3).map((g) => frameM(n, 'se', { ...g, tray: true })), frameM(n, 'ne', { ...WALK_M[0], tray: true }),
    ]);
  }
  preview(PREV_M.slice(18), rows, +((process.argv.find((a) => a.startsWith('--k=')) || '').slice(4)) || 6);
  console.log('aperçu gigolos', PREV_M.slice(18), rows.length);
}
