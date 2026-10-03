"use strict";
// ── LA TABLE DE JEU EN GROS PLAN ─────────────────────────────────────────────
//
// Raph (2026-10-03, nuit), sur le vingt-et-un du Jade : « on va revoir le design des
// jeux pour que leurs tables collent à ce qu'on voit, et que le lancement soit plus
// joli que ça » — la partie se jouait dans un panneau de feutre uni, cerné d'un liseré,
// quand la coupe montre, au même âge, une table de cristal qui flotte sous des lanternes.
//
// Ici, la table du jeu est PEINTE comme la coupe (mêmes matières : plaisirsCoupeHD.js
// `styleHD`, `wallAt`, `lamp`), vue de près, depuis la place du joueur :
//   · en haut, le MUR de la salle de l'âge et ses luminaires (lumière en flaques) ;
//   · au milieu, la CROUPIÈRE derrière la table (peinte par la vue : c'est un sprite) ;
//   · le PLATEAU en perspective (plus étroit au fond) : sa matière (peau, planches,
//     chêne, nappe, marbre, tapis vert, feutre de casino, verre de lumière), ses
//     marques (cercles de mise, filet), ce que l'âge y pose ;
//   · le REBORD et la CEINTURE de la table, dans la matière de l'âge.
// Les cartes, les dés, les mises sont posés PAR-DESSUS, par la vue (le DOM du jeu).
//
// Rend { back, front, surf, dealer, spots, W, H } : `back` (le mur) se peint d'abord,
// puis la croupière, puis `front` (la table, transparente au-dessus du plateau).
import { makeRaster } from './isoPixelPaint.js';
import { INK, mix, h32, bayer, painter, palOf, lightPool } from './plaisirsHDKit.js';
import { styleHD, wallAt, floorAt, lamp } from './plaisirsCoupeHD.js';

// ── La matière du plateau, du rebord et de la ceinture, par âge ───────────────
// `top(u, t, x, y)` : la couleur du plateau (u : 0 → 1 de gauche à droite, t : 0 au
// fond → 1 devant) ; `rim` : rampe du rebord avant (clair → sombre) ; `apron(i, j, w)`
// la ceinture ; `line` : la couleur des marques (cercles de mise, filet).
function lookOf(S) {
  const W = S.wood, G = S.gold;
  const grain = (x, y, base, dark, light) => {
    const g = (y * 7 + Math.round(Math.sin(x * 0.06 + y * 0.4) * 3) + 400) % 9;
    return g === 0 ? dark : g === 4 && (x + y) % 3 === 0 ? light : base;
  };
  switch (S.kit) {
    case 'feu': return {                                    // la rondelle de souche, son écorce
      top: (u, t, x, y) => { const r = Math.hypot((u - 0.5) * 2.4, (t - 0.5) * 1.1), ring = (r * 9) % 1; return ring < 0.14 ? W[1] : (x * 3 + y) % 17 === 0 ? W[1] : W[0]; },
      rim: [W[2], W[3], W[4], '#2a1a0e'], apron: (i, j) => ((i + j * 3) % 7 === 0 ? W[4] : (i % 11) < 2 ? W[3] : j < 2 ? W[2] : W[3]),
      line: '#a8402a', spot: 'mat',
    };
    case 'bois': return {                                   // les planches du tonneau-table
      top: (u, t, x, y) => { const row = Math.floor(Math.pow(t, 0.8) * 6); return (Math.pow(t, 0.8) * 6) % 1 < 0.12 ? W[3] : grain(x, y + row * 13, row & 1 ? W[0] : mix(W[0], W[1], 0.5), W[2], W[0]); },
      rim: [W[1], W[2], W[3], W[4]], apron: (i, j) => (j === 2 || j === 7 ? '#8a909a' : (i % 8) === 0 ? W[4] : i % 8 < 3 ? W[2] : W[3]),
      line: '#e6d4ae', spot: 'ring',
    };
    case 'pierre': return {                                 // le chêne épais
      top: (u, t, x, y) => grain(x, y, '#966a40', '#74502e', '#b88454'),
      rim: ['#b88454', '#966a40', '#74502e', '#523820'], apron: (i, j) => (j === 0 ? '#966a40' : (i % 18) < 2 ? '#523820' : '#74502e'),
      line: '#e6d4ae', spot: 'ring',
    };
    case 'couronne': return {                               // la nappe de drap rouge, ses fleurs d'or
      top: (u, t, x, y) => { const fold = Math.sin(x * 0.09) * 0.5 + 0.5; if ((x % 14 === 7) && (y % 9 === 4)) return '#e8c060'; return fold > 0.85 ? '#b83c34' : fold > 0.15 ? '#a83430' : '#982e2c'; },
      rim: ['#e8c060', '#c09040', '#842624', '#5a1a1a'], apron: (i, j) => (j === 8 ? (i % 2 ? '#e8c060' : null) : ((i + Math.round(Math.sin(i * 0.4) * 2)) % 7 < 2 ? '#842624' : '#a83430')),
      line: '#e8c060', spot: 'ring',
    };
    case 'marbre': return {                                 // le marbre veiné, cerclé de bronze
      top: (u, t, x, y) => { const v = (x * 3 + y * 5 + (h32(x >> 3, y >> 2, 5) % 9)) % 37 === 0; return v ? '#c8bea8' : (x + y * 2) % 23 === 0 ? '#fbf8f2' : '#ece6da'; },
      rim: ['#e8b878', '#c8904a', '#9a6a32', '#6a4620'], apron: (i, j) => { const k = ((i % 8) + 8) % 8, r = j - 2; if (j < 2 || j > 6) return j === 0 ? '#fbf8f2' : '#b4aa98'; return (r === 0 && k < 6) || (r === 1 && (k === 0 || k === 5)) || (r === 2 && (k === 0 || (k >= 3 && k <= 5))) ? '#c8904a' : '#ece6da'; },
      line: '#9a6a32', spot: 'ring',
    };
    case 'neon': return {                                   // le feutre de casino, la rambarde de chrome
      top: (u, t, x, y) => { const v = Math.abs(u - 0.5) * 0.4 + t * 0.15; return (x * 7 + y * 3) % 29 === 0 ? '#2a9a64' : v > 0.28 ? '#1a7048' : '#20845a'; },
      rim: ['#ffffff', '#e2e8f0', '#b4bcc6', '#7f8892'], apron: (i, j) => (j === 4 ? S.neon : j < 2 ? '#3a1a12' : (i % 20) < 1 ? '#2a120c' : '#5a2a1e'),
      line: '#f0d050', spot: 'ring',
    };
    case 'cosmic': {                                        // le verre de la cité, sa couture de lumière
      const M = S.cosmo === 'jade' ? ['#e6fff2', '#b8f0d4', '#8fd8b6'] : S.cosmo === 'astral' ? ['#fff8e0', '#ffe9b0', '#e8cc88'] : ['#f8f0ff', '#e2d0ff', '#c8b0f0'];
      return {
        top: (u, t, x, y) => { const streak = ((x - y * 2) % 41 + 41) % 41 < 4; return streak ? '#ffffff' : t < 0.3 ? M[0] : t < 0.7 ? M[1] : M[2]; },
        rim: [S.glow, S.glow2, mix(S.glow2, INK, 0.3), mix(S.glow2, INK, 0.5)], apron: null, glow: S.glow,
        line: S.glow2, spot: 'glow',
      };
    }
    default: return {                                       // le Fonte : tapis vert, accotoir de cuir, galon d'or
      top: (u, t, x, y) => { const v = Math.abs(u - 0.5) * 0.4 + t * 0.15; return (x * 7 + y * 3) % 31 === 0 ? '#4aa070' : v > 0.28 ? '#22603f' : '#2f7a52'; },
      rim: ['#7a4a3a', '#5a3a34', '#3a2626', '#241616'], apron: (i, j) => (j === 0 ? (i % 4 === 1 ? G[0] : G[2]) : (i % 18) < 2 ? W[3] : j < 3 ? W[1] : W[2]),
      line: G[1], spot: 'ring', tufts: true,
    };
  }
}

// La table des DÉS n'est pas toujours celle des cartes (cf. la coupe) : la dalle de pierre
// au campement, la nappe VERTE à franges au château ; le reste suit l'âge.
function lookFor(S, game) {
  const L = lookOf(S);
  if (game === 'des' && S.kit === 'feu') {
    const R = ['#d6d0c2', '#b4ad9e', '#918a7c', '#6e685e', '#4c4842'];
    return { ...L, top: (u, t, x, y) => ((x * 3 + y * 5) % 13 === 0 ? R[2] : (x + y * 2) % 29 === 0 ? R[0] : R[1]), rim: [R[1], R[2], R[3], R[4]], apron: (i, j) => ((i * 7 + j * 3) % 9 === 0 ? R[4] : j < 3 ? R[2] : R[3]) };
  }
  if (game === 'des' && S.kit === 'couronne') {
    return { ...L, top: (u, t, x, y) => { const fold = Math.sin(x * 0.09) * 0.5 + 0.5; return (x % 16 === 8 && y % 10 === 5) ? '#e8c060' : fold > 0.85 ? '#3a8a5a' : fold > 0.15 ? '#2a7048' : '#225c3a'; }, apron: (i, j) => (j === 8 ? (i % 2 ? '#e8c060' : null) : ((i + Math.round(Math.sin(i * 0.4) * 2)) % 7 < 2 ? '#1a4a2e' : '#2a7048')) };
  }
  // Le GUICHET des tickets est un comptoir, pas une table de jeu : pas de feutre. Au
  // château le chêne (pas la nappe), au Fonte l'acajou ciré, au Néon la laque noire
  // filetée de néon.
  if (game === 'tickets' && (S.kit === 'couronne' || S.kit === 'fonte' || S.kit === 'neon')) {
    const W = S.wood;
    if (S.kit === 'neon') return { ...L, top: (u, t, x, y) => ((x - y * 3 + 400) % 37 < 2 ? '#4a4a58' : t < 0.4 ? '#2e2e3a' : '#22222c'), line: S.neon };
    return { ...L, top: (u, t, x, y) => { const g = (y * 7 + Math.round(Math.sin(x * 0.06 + y * 0.4) * 3) + 400) % 9; return g === 0 ? W[3] : g === 4 && (x + y) % 3 === 0 ? W[0] : W[1]; }, line: S.gold[1] };
  }
  return L;
}

// ── La table ─────────────────────────────────────────────────────────────────
// `game` : 'cartes' (vingt-et-un), 'des' (osselets), 'tickets', 'icare'. W × H en pixels
// d'art ; la vue agrandit d'un facteur entier.
// `marks` : les cercles de mise (la phase de mise) ; sans eux, le tapis nu de la partie.
export function bakeTableScene(band, game, W, H, tableH = H, marks = true, nSpots = 3) {
  const S = styleHD(band), pal = palOf(S), L = lookFor(S, game);
  const back = makeRaster(0, 0, W, H), front = makeRaster(0, 0, W, H);
  const P = painter(back), F = painter(front), N = painter(makeRaster(0, 0, W, H));
  const lights = [];
  P.marks = lights; F.marks = lights; N.marks = lights;
  // Le GROS PLAN : la table déborde du cadre à gauche et à droite (on est assis devant),
  // la croupière se tient à mi-hauteur derrière elle.
  const wallH = Math.round(Math.min(H, tableH) * 0.34);
  // Le MUR de la salle (la même matière que dans la coupe), sa corniche en haut.
  for (let y = 0; y < wallH + 4; y += 1) for (let x = 0; x < W; x += 1) P.put(x, y, wallAt(S, x + 1000, y, 0, wallH + 30));
  // Les luminaires et leurs flaques (aux torches : plantées au mur, plus bas).
  const lx = [Math.round(W * 0.16), Math.round(W * 0.84)];
  for (const x of lx) lightPool(P, x, Math.round(wallH * 0.55), Math.round(W * 0.12), Math.round(wallH * 0.6), 0, W - 1, 0, wallH + 3, S.poolTint || '#ffcf8a');
  for (const x of lx) lamp(P, N, S, pal, x, S.light === 'torch' ? -10 : -3);
  // Les coins sombres : la table est la lumière.
  for (let y = 0; y < wallH + 4; y += 1) for (let x = 0; x < W; x += 1) {
    const d = Math.abs(x - W / 2) / (W / 2);
    if (d > 0.8 && bayer(x, y) < (d - 0.8) * 3) P.put(x, y, mix(P.get(x, y), INK, 0.25));
  }

  // Le PLATEAU en perspective : bord du fond (y0) plus étroit que le bord avant (y1).
  const y0 = wallH + 1, rimH = 6, apronH = L.apron ? 10 : 0, y1 = Math.min(H, tableH) - apronH - rimH - 1;
  const inBack = -4, inFront = -10;
  const edge = (y) => { const t = (y - y0) / Math.max(1, y1 - y0); return [Math.round(inBack + (inFront - inBack) * t), Math.round(W - 1 - inBack - (inFront - inBack) * t)]; };
  // Le fond du plateau (2 px de rebord arrière), puis la surface.
  for (let y = y0; y <= y1; y += 1) {
    const [a, b] = edge(y), t = (y - y0) / Math.max(1, y1 - y0);
    for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x += 1) {
      const u = (x - a) / Math.max(1, b - a);
      let c;
      if (y < y0 + 2) c = y === y0 ? L.rim[3] : L.rim[2];                 // le rebord du fond
      else c = L.top(u, t, x, y);
      F.put(x, y, c);
    }
  }
  // L'ombre portée de la croupière et la lumière des lampes sur le plateau.
  for (let y = y0 + 2; y < y0 + 7; y += 1) for (let x = Math.round(W / 2) - 12; x <= Math.round(W / 2) + 12; x += 1) {
    if (bayer(x, y) < 0.6 - (y - y0) * 0.1) F.put(x, y, mix(F.get(x, y), INK, 0.22));
  }
  // Le REBORD AVANT : un boudin modelé (clair dessus, sombre dessous), capitonné au Fonte.
  for (let j = 0; j < rimH; j += 1) for (let x = 0; x < W; x += 1) {
    let c = L.rim[j < 1 ? 0 : j < 3 ? 1 : j < 5 ? 2 : 3];
    if (L.tufts && j === 2 && x % 9 === 4) c = L.rim[3];
    F.put(x, y1 + 1 + j, c);
  }
  // La CEINTURE (ou, aux âges qui flottent, la lueur sous la table).
  if (L.apron) {
    for (let j = 0; j < apronH; j += 1) for (let x = 0; x < W; x += 1) {
      const c = L.apron(x, j, W);
      if (c) F.put(x, y1 + 1 + rimH + j, c);
    }
  } else {
    for (let x = 0; x < W; x += 1) for (let j = 0; j < 3; j += 1) F.put(x, y1 + 1 + rimH + j, mix(L.glow, '#000000', 0.15 + j * 0.25));
  }

  // Le SOL de la salle sous la ceinture (place des boutons quand le cadre est haut).
  const floorTop = y1 + 1 + rimH + (L.apron ? apronH : 3);
  for (let y = floorTop; y < H; y += 1) for (let x = 0; x < W; x += 1) F.put(x, y, mix(floorAt(S, x, Math.min(9, 2 + ((y - floorTop) >> 1))), INK, 0.35 + Math.min(0.3, (y - floorTop) * 0.01)));
  // Les MARQUES du plateau : trois cercles de mise près du bord avant (là où la vue posera
  // les mises), le filet en arc au fond (le croupier distribue au-dessus).
  const spotY = y1 - Math.round((y1 - y0) * 0.3);
  // Les places des mises, réparties sur la largeur (trois au vingt-et-un, quatre rites aux osselets…).
  const gap = nSpots >= 4 ? 0.23 : 0.3;
  const spots = Array.from({ length: nSpots }, (_, k) => Math.round(W / 2 + (k - (nSpots - 1) / 2) * W * gap));
  const ring = (cx, cy, rx, ry, c) => {
    for (let a = 0; a < 96; a += 1) {
      const th = (a / 96) * Math.PI * 2, x = Math.round(cx + Math.cos(th) * rx), y = Math.round(cy + Math.sin(th) * ry);
      F.put(x, y, c);
    }
  };
  for (const sx of marks ? spots : []) {
    if (L.spot === 'mat') {                                // au campement : une peau ronde posée
      for (let j = -4; j <= 4; j += 1) for (let i = -13; i <= 13; i += 1) if ((i * i) / 169 + (j * j) / 16 <= 1) F.put(sx + i, spotY + j, (i + j) % 5 === 0 ? '#93693e' : (i * i) / 169 + (j * j) / 16 > 0.7 ? '#bc8f5c' : '#d8b07c');
    } else if (L.spot === 'glow') {
      ring(sx, spotY, 13, 4, L.line); ring(sx, spotY, 12, 3, mix(L.line, '#ffffff', 0.5));
      N.put(sx, spotY, L.line);
    } else {
      ring(sx, spotY, 13, 4, L.line);
    }
  }
  if (game === 'cartes' && L.spot !== 'mat') {
    // Le filet en arc : la limite du croupier.
    for (let x = Math.round(W * 0.2); x <= Math.round(W * 0.8); x += 1) {
      const u = (x - W / 2) / (W * 0.3), y = Math.round(y0 + (y1 - y0) * 0.42 - (1 - u * u) * (y1 - y0) * 0.12);
      if ((x & 1) === 0) F.put(x, y, mix(L.line, F.get(x, y), 0.25));
    }
  }
  const dealer = { x: Math.round(W / 2), y: y0 + 7 };
  return { back, front, N: N.R, lights, W, H, wallH, surf: { y0, y1, inBack, inFront, bottom: floorTop }, dealer, spots, spotY, band: S.band, kit: S.kit };
}
