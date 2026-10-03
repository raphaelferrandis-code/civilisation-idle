"use strict";
// ── LE MATÉRIEL DES JEUX, À L'ÂGE DE LA VILLE ─────────────────────────────────
//
// Refonte du 2026-10-02, phase 3 (docs/PLAN-MAISON-DES-PLAISIRS.md § ⭐) : Raph a
// choisi « les jeux refaits, suivant l'âge — la partie se joue SUR la table du
// décor, plus dans une boîte sombre ; le matériel suit l'âge : osselets puis dés
// d'ivoire, cartes de bois puis cartes à jouer, ciel d'Icare de l'époque ; règles
// inchangées ». Ce module ne touche à AUCUNE règle : il rend, pour un âge (bande
// 0-9), le tapis et le rebord de la table, la planche des dés, les cartes et le
// ciel d'Icare. Les scènes de jeu (AuguryStage, BlackjackStage, IcarusStage) le
// lisent ; le reste de leur code ne change pas.
//
// ⛔ Les OS des osselets restent ceux de Raph (`augures/bones/bones.png`, dessinés à
// la main après le refus du procédural, cf. mémoire « osselets-gabarit-aseprite ») :
// ils servent aux âges anciens. Les DÉS des âges suivants sont vus DE DESSUS — une
// seule face lisible : un dé en 3/4 montre trois valeurs à la fois, et « les dés
// n'ont aucun sens » (Raph, deux fois).
// ⛔ Le cadre des boutons et des panneaux ne change pas avec l'âge (peau « nuit
// dorée » unique, arbitrage de Raph sur l'interface) : seul le MATÉRIEL de la table
// suit l'époque.
import { useGameState } from '../../hooks/useGameState.js';
import { eraBandOf } from '../../game/data/eraThemes.js';
import { currentEraIndex } from '../../game/core/mechanics/shared.js';

// L'âge de la Maison des Plaisirs : celui de la ville (molette de dev partagée avec
// la carte et la salle : `__plaisirsTune.band`).
export function plaisirsBandNow() {
  const t = typeof window !== 'undefined' ? window.__plaisirsTune : null;
  return t && t.band != null ? Math.max(0, Math.min(9, t.band | 0)) : eraBandOf(currentEraIndex());
}
export function usePlaisirsBand() {
  return useGameState(() => plaisirsBandNow());
}

// ── Le tapis et le rebord de la table ────────────────────────────────────────
// feutre (haut, bas), rebord (clair, sombre), filet. Lisibilité d'abord : le texte
// du jeu (crème et or) se pose dessus, donc les feutres restent SOMBRES.
const TABLES = [
  { felt: ['#5a3f26', '#3a2818'], rim: ['#8a6440', '#4a321c'], line: '#d8794c', name: 'peau' },
  { felt: ['#5e2230', '#3e1520'], rim: ['#a47a4c', '#5e4026'], line: '#e6d4ae', name: 'drap' },
  { felt: ['#5e2230', '#3e1520'], rim: ['#b8ad98', '#6f6556'], line: '#e6d4ae', name: 'drap' },
  { felt: ['#5a1a28', '#3a1019'], rim: ['#6a6f7c', '#383c47'], line: '#e2b444', name: 'velours' },
  { felt: ['#601c2c', '#3c111c'], rim: ['#e6dfd0', '#a99f8a'], line: '#f0cf6a', name: 'velours' },
  { felt: ['#1f5a3c', '#123826'], rim: ['#6a3420', '#3a1a10'], line: '#d2a53e', name: 'tapis vert' },
  { felt: ['#15603f', '#0b3b28'], rim: ['#b4bcc6', '#5f6772'], line: '#ff6fb5', name: 'tapis de casino' },
  { felt: ['#16303a', '#0b1a22'], rim: ['#7fdcb8', '#2f6f58'], line: '#5af0b4', name: 'lumière' },
  { felt: ['#2c2416', '#17120a'], rim: ['#ffd99a', '#a8762e'], line: '#ffcd78', name: 'lumière' },
  { felt: ['#221a36', '#120d1f'], rim: ['#c9b4ff', '#6a52b8'], line: '#aa8cff', name: 'lumière' },
];
export function tableLook(band) {
  return TABLES[Math.max(0, Math.min(9, band | 0))];
}
// Les variables CSS du tapis, posées sur le calque de la scène (views-plaisirs.css).
export function tableVars(band) {
  const t = tableLook(band);
  return {
    '--table-felt-a': t.felt[0], '--table-felt-b': t.felt[1],
    '--table-rim-a': t.rim[0], '--table-rim-b': t.rim[1], '--table-line': t.line,
  };
}

// ── Petit outillage de pixel ─────────────────────────────────────────────────
const _cache = new Map();
function sheet(key, w, h, paint) {
  if (typeof document === 'undefined') return null;
  let url = _cache.get(key);
  if (url) return url;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  paint((x, y, c, ww = 1, hh = 1) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); }, g);
  url = cv.toDataURL('image/png');
  _cache.set(key, url);
  return url;
}
const h32 = (a, b, c = 0) => {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
};

// ── Les dés (âges 4 et suivants) ─────────────────────────────────────────────
// Planche 192 × 32 (six faces de 32 px, 1 à 6) : MÊME géométrie que les os de
// Raph, pour que la culbute en `steps(6)` et `data-face` marchent tels quels.
const DICE = {
  ivory: { face: '#efe6cf', hi: '#fffaf0', edge: '#c9b896', side: '#a8946e', ink: '#2a1a12', ace: '#a2303e' },
  casino: { face: '#c8303a', hi: '#e85a62', edge: '#9a1f2a', side: '#6e1520', ink: '#fff8ee', ace: '#fff8ee' },
  light: { face: '#e8f7ff', hi: '#ffffff', edge: '#a8d8f0', side: '#5aa6cf', ink: '#2f6a92', ace: '#ff5a8a' },
};
const PIPS = {
  1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};
// null = les os de Raph. Ivoire au marbre et à la fonte, dés de casino au néon,
// dés de lumière aux âges cosmiques (teintés de la lumière de l'ère).
export function diceSheetFor(band, glow) {
  const b = band | 0;
  if (b <= 3) return null;
  const kind = b <= 5 ? 'ivory' : b === 6 ? 'casino' : 'light';
  const P = { ...DICE[kind] };
  // Dés de lumière : le flanc prend la lumière de l'ère, les points une version
  // SOMBRE de cette lumière (dorés sur blanc, ils ne se lisaient pas).
  if (kind === 'light' && glow) {
    const n = parseInt(glow.slice(1), 16), d = (v) => Math.round(v * 0.45).toString(16).padStart(2, '0');
    P.side = glow; P.ink = '#' + d((n >> 16) & 255) + d((n >> 8) & 255) + d(n & 255);
  }
  return sheet('dice:' + kind + ':' + (glow || ''), 192, 32, (px) => {
    for (let f = 1; f <= 6; f += 1) {
      const ox = (f - 1) * 32;
      // Le dé vu de dessus : une face carrée aux coins cassés, un liseré clair en
      // haut à gauche (la lumière du jeu), son flanc avant de 3 px dessous.
      const x0 = ox + 5, y0 = 3, s = 22;
      px(x0 + 1, y0 + s, P.side, s - 2, 3);
      px(x0, y0 + s, P.side, 1, 2); px(x0 + s - 1, y0 + s, P.side, 1, 2);
      px(x0 + 1, y0, P.face, s - 2, s);
      px(x0, y0 + 1, P.face, s, s - 2);
      px(x0 + 1, y0, P.hi, s - 2, 1); px(x0, y0 + 1, P.hi, 1, s - 3);
      px(x0 + 1, y0 + s - 1, P.edge, s - 2, 1); px(x0 + s - 1, y0 + 1, P.edge, 1, s - 2);
      for (const [i, j] of PIPS[f]) {
        const cx = x0 + 4 + i * 6, cy = y0 + 4 + j * 6;
        const big = f === 1;
        px(big ? cx - 1 : cx, big ? cy - 1 : cy, f === 1 ? P.ace : P.ink, big ? 6 : 4, big ? 6 : 4);
      }
    }
  });
}

// ── Les cartes ───────────────────────────────────────────────────────────────
// Cartes de 32 × 48 (comme `ui/cards/*.png`). Bois aux âges du feu, du bois et de la
// pierre ; parchemin à la couronne et au marbre ; les cartes à jouer du jeu
// (sprites existants) à la fonte et au néon ; cristal aux âges cosmiques.
const GLYPH = {
  A: ['010', '101', '111', '101', '101'], J: ['001', '001', '001', '101', '010'], Q: ['010', '101', '101', '110', '011'],
  K: ['101', '110', '100', '110', '101'], 1: ['010', '110', '010', '010', '111'], 0: ['111', '101', '101', '101', '111'],
  2: ['110', '001', '010', '100', '111'], 3: ['110', '001', '010', '001', '110'], 4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '110', '001', '110'], 6: ['011', '100', '110', '101', '010'], 7: ['111', '001', '010', '010', '010'],
  8: ['010', '101', '010', '101', '010'], 9: ['010', '101', '011', '001', '110'],
};
// Enseignes 7 × 7, dessinées à ×2 : à 5 px le pique et le trèfle se confondaient.
const SUIT = {
  hearts: ['0110110', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000'],
  diamonds: ['0001000', '0011100', '0111110', '1111111', '0111110', '0011100', '0001000'],
  clubs: ['0011100', '0011100', '1101011', '1111111', '1101011', '0001000', '0011100'],
  spades: ['0001000', '0011100', '0111110', '1111111', '1111111', '0001000', '0011100'],
};
const RED = new Set(['hearts', 'diamonds']);
// Les enseignes du moteur sont antiques (actions/blackjack.js) ; l'habillage les rend
// en couleurs internationales, comme cardSprites.js.
const SUIT_OF = { olive: 'spades', amphore: 'hearts', laurier: 'diamonds', chouette: 'clubs' };
const CARDSTYLE = {
  wood: { bg: ['#b8875a', '#a47548'], grain: '#8c6038', border: '#5e3e22', red: '#7a2333', black: '#2a1a10', back: ['#8c6038', '#d8794c'] },
  parchment: { bg: ['#ece0bf', '#e0d1a8'], grain: '#cdbb8c', border: '#8c6a34', red: '#a2303e', black: '#2a2018', back: ['#7a2333', '#e2b444'] },
  crystal: { bg: ['#e4f6ff', '#c8eaf8'], grain: '#a8d8f0', border: '#5aa6cf', red: '#c83a6a', black: '#1f4a66', back: ['#1f4a66', '#9fd8f4'] },
};
export function cardStyleFor(band) {
  const b = band | 0;
  return b <= 2 ? 'wood' : b <= 4 ? 'parchment' : b <= 6 ? null : 'crystal';
}
function glyph(px, rows, x, y, c, k = 1) {
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i += 1) if (row[i] === '1') px(x + i * k, y + j * k, c, k, k); });
}
function cardBase(px, S, b) {
  for (let y = 0; y < 48; y += 1) px(1, y, S.bg[(y >> 2) & 1 ? 1 : 0], 30, 1);
  px(0, 1, S.bg[0], 1, 46); px(31, 1, S.bg[0], 1, 46);
  // Fil du bois / fibres du parchemin / reflets du cristal.
  for (let k = 0; k < 18; k += 1) {
    const y = 3 + (h32(k, b, 3) % 42), x = 3 + (h32(k, b, 7) % 20);
    px(x, y, S.grain, 3 + (h32(k, b, 9) % 6), 1);
  }
  px(1, 0, S.border, 30, 1); px(1, 47, S.border, 30, 1); px(0, 1, S.border, 1, 46); px(31, 1, S.border, 1, 46);
}
// Face d'une carte { rank: 'A'|'2'…'10'|'J'|'Q'|'K', suit }, ou null (cartes à jouer).
export function cardFaceFor(band, card) {
  const style = cardStyleFor(band);
  if (!style || !card || !card.rank || !card.suit) return null;
  const S = CARDSTYLE[style], rank = String(card.rank), suit = SUIT_OF[card.suit] || card.suit;
  return sheet('card:' + style + ':' + rank + ':' + suit, 32, 48, (px) => {
    cardBase(px, S, rank.length + suit.length);
    const col = RED.has(suit) ? S.red : S.black;
    // Le rang, en coin (haut gauche) et retourné (bas droit), à ×2 pour la lecture.
    let x = 3;
    for (const ch of rank) { glyph(px, GLYPH[ch] || GLYPH.A, x, 3, col, 2); x += 7; }
    // Le coin opposé est le même rang TOURNÉ DE 180° (lignes ET colonnes
    // inversées) : retourné seulement de haut en bas, une Dame se lisait « 6 ».
    let xr = 29 - rank.length * 7 + 1;
    for (const ch of rank.split('').reverse()) {
      const rot = (GLYPH[ch] || GLYPH.A).slice().reverse().map((row) => row.split('').reverse().join(''));
      glyph(px, rot, xr, 35, col, 2); xr += 7;
    }
    // L'enseigne, grande au centre.
    glyph(px, SUIT[suit] || SUIT.spades, 9, 17, col, 2);
  });
}
// Dos de carte de l'âge, ou null (dos actuel).
export function cardBackFor(band) {
  const style = cardStyleFor(band);
  if (!style) return null;
  const S = CARDSTYLE[style];
  return sheet('back:' + style, 32, 48, (px) => {
    cardBase(px, S, 1);
    px(3, 3, S.back[0], 26, 42);
    for (let y = 0; y < 42; y += 1) for (let x = 0; x < 26; x += 1) {
      if (((x + y) % 6 === 0) || ((x - y + 60) % 6 === 0)) px(3 + x, 3 + y, S.back[1]);
    }
    px(3, 3, S.border, 26, 1); px(3, 44, S.border, 26, 1); px(3, 3, S.border, 1, 42); px(28, 3, S.border, 1, 42);
  });
}

// ── Le ticket à gratter ──────────────────────────────────────────────────────
// (2026-10-03) Les faces de ticket prévues (`ui/scratch/ticket-*.png`) n'ont jamais
// existé : le ticket n'était que neuf symboles posés sur le tapis. Il est peint ici, à
// la matière de l'âge, 80 × 80 (affiché ×4) : un tesson d'argile au campement, une
// planchette au village, un billet de parchemin scellé, une tessère de bronze à Rome,
// le billet imprimé du Fonte, la carte vernie du casino, la carte de cristal. Le métal
// du liseré dit la mise (bronze, argent, or). Neuf alvéoles calées sur la grille de la
// scène : marge 10 px, écart 3 px (`TICKET_GRID`).
export const TICKET_GRID = { pad: '12.5%', gap: '3.75%' };
const METALS = { obole: ['#e8a868', '#b8743a', '#7a4a22'], drachme: ['#f0f2f6', '#b8bec8', '#7a808c'], talent: ['#fff0b0', '#e8c050', '#9a7424'] };
const TICKET_LOOK = [
  { kind: 'shard', paper: ['#d8946a', '#c47e52', '#a8653e'], ink: '#5a2a18', cell: ['#b06a42', '#8a4e2e'] },   // le tesson
  { kind: 'board', paper: ['#d8a868', '#c08c4c', '#9a6a36'], ink: '#4a3016', cell: ['#a87840', '#6e4a22'] },   // la planchette
  { kind: 'parch', paper: ['#f4e8c8', '#e6d4a8', '#cdb682'], ink: '#6a4a2a', cell: ['#e0cc9c', '#a88a5a'], seal: '#a83430' },
  { kind: 'parch', paper: ['#f4e8c8', '#e6d4a8', '#cdb682'], ink: '#3a2a6a', cell: ['#e0cc9c', '#a88a5a'], seal: '#2a4a98', gilt: true },
  { kind: 'plate', paper: ['#d8b070', '#b88a48', '#8a6230'], ink: '#4a3014', cell: ['#9a7036', '#6a4a20'] },   // la tessère
  { kind: 'print', paper: ['#fbf4e2', '#efe2c4', '#d8c49a'], ink: '#a2303e', cell: ['#f4ead2', '#c8a878'] },   // le billet imprimé
  { kind: 'glossy', paper: ['#3a1a3a', '#2a1230', '#1c0c22'], ink: '#ff6fb5', cell: ['#4a2448', '#ff6fb5'] }, // la carte du casino
  { kind: 'crystal', paper: ['#e6fff2', '#b8f0d4', '#8fd8b6'], ink: '#2ec88a', cell: ['#d4fbe8', '#5ad8a0'] },
  { kind: 'crystal', paper: ['#fff8e0', '#ffe9b0', '#e8cc88'], ink: '#c89a30', cell: ['#fff2cc', '#e0b040'] },
  { kind: 'crystal', paper: ['#f8f0ff', '#e2d0ff', '#c8b0f0'], ink: '#9a6ae0', cell: ['#f0e6ff', '#b48ae8'] },
];
export function ticketFace(band, stakeId) {
  const b = Math.max(0, Math.min(9, band | 0)), T = TICKET_LOOK[b], M = METALS[stakeId] || METALS.drachme;
  return sheet('ticket:' + b + ':' + stakeId, 80, 80, (px) => {
    const round = T.kind === 'shard' ? 7 : T.kind === 'crystal' || T.kind === 'glossy' ? 4 : 1;
    const inside = (x, y) => {
      if (T.kind === 'shard') {                          // le tesson : des bords cassés
        const e = Math.min(x, y, 79 - x, 79 - y), n = (Math.sin(x * 0.7) + Math.cos(y * 0.9)) * 1.6 + ((x * 7 + y * 3) % 5) * 0.3;
        return e > 1.5 + n;
      }
      const cx = Math.max(round - x, 0, x - (79 - round)), cy = Math.max(round - y, 0, y - (79 - round));
      return cx * cx + cy * cy <= round * round;
    };
    for (let y = 0; y < 80; y += 1) for (let x = 0; x < 80; x += 1) {
      if (!inside(x, y)) continue;
      const e = Math.min(x, y, 79 - x, 79 - y);
      let c = (y < 26 ? T.paper[0] : y < 58 ? T.paper[1] : T.paper[2]);
      if (T.kind === 'board' && (y * 5 + Math.round(Math.sin(x * 0.12) * 3)) % 7 === 0) c = T.paper[2];
      if (T.kind === 'parch' && (x * 3 + y * 7) % 23 === 0) c = T.paper[2];
      if (T.kind === 'plate' && (x + y) % 11 === 0) c = T.paper[0];
      if (T.kind === 'crystal' && ((x - y + 80) % 29) < 3) c = '#ffffff';
      if (T.kind === 'glossy' && (x * 13 + y * 7) % 53 === 0) c = '#fff2c8';
      // Le liseré de la mise (bronze, argent, or), éclairé en haut à gauche.
      if (e < 2) c = e === 0 ? (x < 40 && y < 40 ? M[1] : M[2]) : M[0];
      if (T.gilt && e === 4 && (x + y) % 2 === 0) c = M[0];
      if (T.kind === 'print' && (e === 4 || e === 6)) c = (x + y) % 4 < 2 ? T.ink : T.paper[0];
      if (T.kind === 'glossy' && e === 3) c = T.ink;
      px(x, y, c);
    }
    // Les neuf alvéoles (marge 10, écart 3, cases de 18).
    for (let r = 0; r < 3; r += 1) for (let k = 0; k < 3; k += 1) {
      const x0 = 10 + k * 21, y0 = 10 + r * 21;
      px(x0, y0, T.cell[1], 18, 18);
      px(x0 + 1, y0 + 1, T.cell[0], 16, 16);
      px(x0 + 1, y0 + 1, T.kind === 'glossy' || T.kind === 'crystal' ? T.cell[1] : T.cell[1], 16, 1);
    }
    // Le sceau du billet de parchemin, le numéro du billet imprimé.
    if (T.seal) { for (let j = -3; j <= 3; j += 1) for (let i = -3; i <= 3; i += 1) if (i * i + j * j <= 10) px(66 + i, 72 + j, j < 0 && i < 0 ? '#e86a5a' : T.seal); }
    if (T.kind === 'print') for (let i = 0; i < 5; i += 1) px(30 + i * 4, 4, T.ink, 2, 3);
  });
}

// ── Le ciel d'Icare ──────────────────────────────────────────────────────────
// Bandes franches (le vrai grain pixel, cf. icarus-crash-game) du sol vers le haut.
const SKIES = {
  feu: ['#3a1a18', '#5a2418', '#7e3418', '#a84a1c', '#cf6a22', '#e88a34', '#f4b45a'],
  antique: ['#3d6b9c', '#4d7fb0', '#5f93c2', '#76a8d2', '#8fbde0', '#acd2ec', '#cfe6f6'],
  fonte: ['#4a4038', '#5c5046', '#706154', '#867464', '#9c8a76', '#b4a28c', '#cdbca2'],
  neon: ['#0a0e26', '#131338', '#201847', '#321d52', '#472253', '#5e2a4f', '#7a3348'],
  cosmique: ['#05060f', '#0a0c1e', '#10132e', '#171a3e', '#1f2350', '#2a2f64', '#363c78'],
};
function skyOf(band) {
  const b = band | 0;
  return b <= 1 ? 'feu' : b <= 4 ? 'antique' : b === 5 ? 'fonte' : b === 6 ? 'neon' : 'cosmique';
}
export function icarusSkyCss(band) {
  const c = SKIES[skyOf(band)], stops = [0, 20, 38, 54, 68, 80, 90, 100];
  const parts = c.map((col, i) => `${col} ${stops[i]}%, ${col} ${stops[i + 1]}%`);
  return `linear-gradient(to top, ${parts.join(', ')})`;
}
// L'aviateur : Icare et ses ailes de cire (le dessin choisi par Raph) jusqu'au
// marbre ; le BALLON à la fonte ; le DELTAPLANE au néon ; Icare de LUMIÈRE ensuite
// (le même dessin, illuminé — c'est la scène qui le traite, cf. `glow`).
export function icarusFlyer(band) {
  const b = band | 0;
  if (b <= 4) return { src: '/pixelart/ui/icarus/icarus.png', glow: false };
  if (b >= 7) return { src: '/pixelart/ui/icarus/icarus.png', glow: true };
  if (b === 5) return { src: balloonSprite(), glow: false };
  return { src: gliderSprite(), glow: false };
}
// Ballon de 64 px : enveloppe à fuseaux cramoisi/crème, nacelle d'osier, filins.
function balloonSprite() {
  return sheet('flyer:balloon', 64, 64, (px) => {
    const cx = 32, cy = 22, r = 17;
    for (let y = -r; y <= r + 6; y += 1) {
      const t = y < 0 ? Math.sqrt(Math.max(0, r * r - y * y)) : r * (1 - (y / (r + 7)) ** 1.6);
      const half = Math.round(t);
      for (let x = -half; x <= half; x += 1) {
        const gore = Math.floor(((Math.atan2(x, Math.sqrt(Math.max(1, half * half - x * x))) + Math.PI) / (Math.PI * 2)) * 10);
        const lit = x < -half * 0.35 && y < r * 0.3;
        const col = gore & 1 ? (lit ? '#fff4dc' : '#e6d4ae') : (lit ? '#e06a5e' : '#c8434a');
        px(cx + x, cy + y, x > half - 2 ? (gore & 1 ? '#a08b66' : '#7a2333') : col);
      }
    }
    for (const dx of [-6, 6]) for (let y = cy + r + 6; y < 52; y += 1) px(cx + Math.round(dx * (1 - (y - cy - r - 6) / 30)), y, '#3a2a22');
    px(cx - 5, 52, '#a47a4c', 10, 6); px(cx - 5, 52, '#c89a5a', 10, 1); px(cx - 5, 57, '#6b4b2b', 10, 1);
  });
}
// Deltaplane de 64 px : aile en V rayée, pilote suspendu au trapèze.
function gliderSprite() {
  return sheet('flyer:glider', 64, 64, (px) => {
    for (let i = 0; i <= 28; i += 1) {
      const y = 24 + Math.round(i * 0.42);
      for (let k = 0; k < 4; k += 1) {
        const col = (Math.floor(i / 4) & 1) ? '#f6ead0' : '#c8434a';
        px(32 - i, y + k, k === 3 ? '#6e1f2b' : col); px(32 + i, y + k, k === 3 ? '#6e1f2b' : col);
      }
    }
    px(31, 22, '#2c2f36', 2, 18);
    px(26, 38, '#2c2f36', 12, 1);
    px(30, 39, '#2b3240', 4, 5); px(31, 36, '#e0b090', 2, 2); px(29, 44, '#2b3240', 2, 4); px(33, 44, '#2b3240', 2, 4);
  });
}
