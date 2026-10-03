"use strict";
// ── LE MOBILIER DES ÂGES : chaque salle à son époque ─────────────────────────
//
// Retour de Raph (2026-10-03, nuit), après le déroulé des dix âges : « fais attention
// aux toits et aux entrées, vérifie bien les lumières ; prends bien le temps de
// travailler chaque salle au maximum de tes capacités ». Le déroulé avait gardé le
// MOBILIER du Fonte (tapis vert, kiosque LOTERIE à auvent rayé, flacons, méridienne,
// toile de jardin et feux de rampe) recoloré à chaque âge : au campement, un tapis vert
// et des feux de rampe ; à Rome, une loterie à l'auvent de fête foraine.
//
// Ici, chaque âge meuble ses salles avec ce que son temps connaît :
//   · le FEU (le campement) : dalle de pierre et osselets, souche et cartes de bois,
//     jarre des sorts, claie du troqueur, danse autour du feu sous les peintures de
//     la grotte, couche de fourrures derrière un rabat de peau ;
//   · … (les autres âges suivent, cf. KITS en bas de fichier).
//
// Le Fonte garde le sien (plaisirsCoupeHD.js) : c'est le pilote validé.
//
// Conventions (celles de plaisirsCoupeHD.js) : `y` = la ligne du sol de la salle ; un
// meuble pose ses pieds à `y + FOOT` ; `x0r`/`x1r` : les bords du mur du fond ; `y0` :
// le haut du mur. Couches : `P` (le fond), `O` (derrière les gens), `F` (devant les gens
// du fond), `N` (ce qui s'allume la nuit) ; `mark(x, y, c)` pose un halo de nuit.
import { INK, HD, bayer, mix, h32, piece, contactShadow, FOOT, BK, SD, FR } from './plaisirsHDKit.js';

// ── Rampes communes (clair → sombre) ─────────────────────────────────────────
export const BONE = ['#fbf4e2', '#e8dcc0', '#c8b896', '#a08c6a', '#74634a'];
export const ROCK = ['#d6d0c2', '#b4ad9e', '#918a7c', '#6e685e', '#4c4842'];
export const CLAY = ['#e8a272', '#c97e4c', '#a65f34', '#7d4524', '#562e16'];
export const HIDE = ['#ecd0a2', '#d8b07c', '#bc8f5c', '#93693e', '#664626'];
export const FURB = ['#b88858', '#946a40', '#73502e', '#52381e', '#362412'];     // fourrure brune
export const FURG = ['#d4ccc0', '#b0a89a', '#8a8378', '#665f56', '#46413a'];     // fourrure grise
export const OCHRE = '#a8402a', OCHRE2 = '#cc6a3c', CHAR = '#3a2a22';
export const LEAF = ['#9ad070', '#62a24e', '#3f7a3a', '#285428'];
// La flamme : cœur, jaune, orange, bord.
export const FLAME = ['#fffbe8', '#ffe9a0', '#ffc25c', '#ff9a3a', '#e8602a'];

// ── Primitives ───────────────────────────────────────────────────────────────
// Une FLAMME (goutte), sa base en (cx, by), haute de `h` : peinte dans `L` et dans la
// nuit, avec son halo.
export function flame(ctx, L, cx, by, h, w = Math.max(3, Math.round(h * 0.55)), halo = '#ffb070') {
  const { N } = ctx;
  for (let j = 0; j < h; j += 1) {
    const t = j / h;                                        // 0 en bas … 1 au bout
    const half = (w / 2) * (t < 0.35 ? 0.75 + t * 0.7 : Math.max(0.12, (1 - t) * 1.45));
    for (let i = -Math.ceil(half); i <= Math.ceil(half); i += 1) {
      const d = Math.abs(i + (t > 0.6 ? Math.sin(cx + j) * 0.6 : 0)) / Math.max(0.5, half);
      if (d > 1) continue;
      const k = d < 0.3 && t < 0.55 ? 0 : d < 0.55 && t < 0.75 ? 1 : d < 0.8 ? 2 : t > 0.7 ? 4 : 3;
      L.put(cx + i, by - j, FLAME[k]); N.put(cx + i, by - j, FLAME[k]);
    }
  }
  L.mark(cx, by - Math.round(h * 0.4), halo);
}
// Une BÛCHE vue de face (cylindre couché) : écorce, bout coupé clair.
export function log(L, x0, y, w, r, ramp = FURB) {
  for (let i = 0; i < w; i += 1) for (let j = -r; j <= r; j += 1) {
    const c = j === -r ? ramp[1] : j < 0 ? ramp[2] : j === r ? ramp[4] : ramp[3];
    L.put(x0 + i, y + j, (i * 7 + j * 3) % 11 === 0 ? ramp[4] : c);
  }
  for (let j = -r; j <= r; j += 1) { L.put(x0, y + j, j === 0 ? '#c8a070' : '#e0bc8a'); }
}
// Un AMAS DE FOURRURES (couche, tapis) : bandes de poil aux bords effilochés.
export function furPile(L, x0, y0, w, h, ramps) {
  for (let j = 0; j < h; j += 1) {
    const ramp = ramps[Math.floor((j / h) * ramps.length) % ramps.length];
    for (let i = 0; i < w; i += 1) {
      const edge = j === 0 || ((j % Math.ceil(h / ramps.length)) === 0);
      if ((i === 0 || i === w - 1) && h32(i, j, 3) % 2) continue;
      if (edge && h32(x0 + i, j, 7) % 3 === 0) continue;            // les mèches du bord
      const tuft = (i + j * 3 + (h32(i >> 1, j, 5) & 1)) % 5 === 0;
      L.put(x0 + i, y0 + j, edge ? ramp[0] : tuft ? ramp[3] : i < w * 0.3 ? ramp[1] : ramp[2]);
    }
  }
}
// Une JARRE de terre (silhouette en goutte), incisée en zigzag.
export function jar(L, cx, by, h, r, ramp = CLAY, zig = true) {
  for (let j = 0; j < h; j += 1) {
    const t = j / (h - 1);                                  // 0 = col, 1 = pied
    const half = t < 0.14 ? r * 0.45 : t < 0.22 ? r * 0.38 : r * Math.sin(Math.PI * Math.min(1, (t - 0.12) / 0.92)) * 0.98 + 1;
    for (let i = -Math.round(half); i <= Math.round(half); i += 1) {
      const u = i / Math.max(1, half);
      let c = u < -0.45 ? ramp[0] : u < 0.15 ? ramp[1] : u < 0.6 ? ramp[2] : ramp[3];
      if (t > 0.88) c = ramp[3];
      if (zig && t > 0.35 && t < 0.5 && ((i + j * 2 + 64) % 6 === 0)) c = ramp[4];
      L.put(cx + i, by - h + 1 + j, c);
    }
  }
  L.hline(cx - Math.round(r * 0.5), by - h + 1, Math.round(r) + 1, ramp[0]);  // la lèvre
}
// Une grille de lettres posée telle quelle (`lit` : les lettres qui s'allument la nuit).
export function grid(ctx, L, x, y, rows, pal, lit = null) { L.spr(x, y, rows, pal, false, lit, lit ? ctx.N : null); }

// ── LE FEU : le campement ────────────────────────────────────────────────────
// Les PEINTURES de la grotte, à l'ocre et au charbon, sur la peau du fond de scène.
const CAVE = {
  bison: ['...rrrrr.....', '.rrrrrrrrrr..', 'rrrrrrrrrrrrr', '.rrrrrrrrrrr.', '..rrrrrrrrr..', '..r.r...r.r..', '..r.r...r.r..'],
  deer: ['r.r........', '.r.........', '.rr........', '..rrrrrrr..', '..rrrrrrrr.', '...r.r..r.r', '...r.r..r.r'],
  hand: ['.r.r.r.', '.r.r.r.', '.rrrrrr', 'rrrrrr.', '.rrrrr.', '..rrr..'],
  man: ['..r..', '.rrr.', 'r.r.r', '..r..', '.r.r.', 'r...r'],
  sun: ['..r..', 'r.r.r', '.rrr.', 'rrrrr', '.rrr.', 'r.r.r', '..r..'],
};
function caveArt(L, x0, y0, x1, y1, seed) {
  const kinds = ['bison', 'man', 'deer', 'hand', 'man', 'bison', 'sun', 'hand', 'deer'];
  let x = x0 + 4, k = seed;
  while (x < x1 - 14) {
    const g = CAVE[kinds[k % kinds.length]], gy = y0 + 4 + (h32(k, 3) % Math.max(1, y1 - y0 - 14));
    const col = k % 3 === 1 ? CHAR : OCHRE;
    g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'r') L.put(x + i, gy + j, col); }));
    x += g[0].length + 4 + (h32(k, 7) % 6);
    k += 1;
  }
}
// LA DALLE de pierre sur ses deux blocs (le dolmen du campement), sur une peau.
function slabTable(ctx, x, y, w) {
  const { F, P } = ctx, yb = y + FOOT, x0 = x - Math.round(w / 2);
  // La peau tendue au sol, sous la dalle (poil roux, bord frangé).
  for (let j = 0; j < 4; j += 1) for (let i = -6; i < w + 6; i += 1) {
    if ((i < -4 || i > w + 3) && j === 0) continue;
    P.put(x0 + i, yb - 1 + j, j === 3 && (i & 1) ? HIDE[4] : (i + j) % 5 === 0 ? HIDE[3] : HIDE[2]);
  }
  contactShadow(P, x0 + 2, x0 + w - 3, yb + 1);
  piece(F, x0, yb - 13, w, 14, (Q) => {
    // Les deux blocs, bruts : arrondis, une face au jour.
    for (const bx of [x0 + 5, x0 + w - 16]) for (let j = 0; j < 9; j += 1) for (let i = 0; i < 11; i += 1) {
      if ((j === 0 || j === 8) && (i === 0 || i === 10)) continue;
      Q.put(bx + i, yb - 8 + j, i < 3 ? ROCK[1] : i > 8 ? ROCK[3] : j > 6 ? ROCK[3] : (i * 3 + j * 5) % 13 === 0 ? ROCK[3] : ROCK[2]);
    }
    // La dalle : dessus clair, chant épais, éclats.
    for (let i = 0; i < w; i += 1) {
      const lift = i < 2 || i > w - 3 ? 1 : 0;
      Q.put(x0 + i, yb - 13 + lift, ROCK[0]);
      Q.put(x0 + i, yb - 12, (i * 5) % 17 === 0 ? ROCK[2] : ROCK[1]);
      for (let j = 0; j < 3; j += 1) Q.put(x0 + i, yb - 11 + j, j === 2 ? ROCK[4] : (i * 7 + j) % 9 === 0 ? ROCK[4] : ROCK[3]);
    }
    // Les osselets jetés, une corne à boire, un tas de coquillages (la mise).
    for (const [dx, dy] of [[-12, 0], [-8, 1], [-5, 0], [2, 1], [6, 0]]) { Q.put(x + dx, yb - 13 + dy, BONE[0]); Q.put(x + dx + 1, yb - 13 + dy, BONE[2]); }
    for (let t = 0; t < 7; t += 1) Q.put(x + 14 + t, yb - 14 - (t > 4 ? t - 4 : 0), t < 2 ? BONE[3] : BONE[1]);
    for (const [dx, dy] of [[-22, 0], [-20, 0], [-21, -1], [-18, 0], [-24, 0]]) Q.put(x + dx, yb - 14 + dy, dy ? '#fff6e6' : '#e6d6bc');
  });
}
// LA SOUCHE-TABLE (rondelle de tronc sur sa souche) et ses cartes de bois peintes.
function stumpTable(ctx, x, y, w) {
  const { F, P, S } = ctx, yb = y + FOOT, Wd = S.wood, r = Math.round(w / 2);
  contactShadow(P, x - 9, x + 9, yb + 1);
  piece(F, x - r, yb - 15, w, 16, (Q) => {
    // La souche, ses racines.
    for (let j = 0; j < 9; j += 1) for (let i = -7; i <= 7; i += 1) {
      const root = j > 5 && Math.abs(i) <= 7 + (j - 5);
      if (Math.abs(i) > 6 && !root) continue;
      Q.put(x + i, yb - 8 + j, i < -4 ? FURB[1] : i > 4 ? FURB[3] : (i + 20) % 3 === 0 ? FURB[3] : FURB[2]);
    }
    for (let i = -10; i <= 10; i += 1) Q.put(x + i, yb, Math.abs(i) > 7 ? FURB[3] : FURB[2]);
    // La rondelle : le dessus en ellipse aux cernes, le chant d'écorce.
    for (let j = -3; j <= 3; j += 1) for (let i = -r; i <= r; i += 1) {
      const q = (i * i) / (r * r) + (j * j) / 10;
      if (q > 1) continue;
      const ring = Math.floor(Math.sqrt(q) * 5);
      Q.put(x + i, yb - 13 + j, ring % 2 ? Wd[1] : Wd[0]);
    }
    for (let i = -r; i <= r; i += 1) { const e = Math.round(3 * Math.sqrt(Math.max(0, 1 - (i * i) / (r * r)))); Q.put(x + i, yb - 13 + e + 1, FURB[2]); Q.put(x + i, yb - 13 + e + 2, FURB[3]); }
    // Les cartes de bois : planchettes claires marquées à l'ocre.
    for (const [dx, mark] of [[-11, 0], [-6, 1], [4, 2], [9, 0]]) {
      Q.rect(x + dx, yb - 14, 3, 2, '#e8cfa0'); Q.put(x + dx + 1, yb - 14, mark === 1 ? CHAR : OCHRE);
      if (mark === 2) Q.put(x + dx + 2, yb - 13, OCHRE);
    }
  });
}
// Le TABOURET-BÛCHE (un rondin debout).
function logStool(ctx, x, y) {
  const { O, P } = ctx, yb = y + FOOT - 1;
  contactShadow(P, x - 4, x + 4, yb + 1);
  piece(O, x - 4, yb - 7, 9, 8, (Q) => {
    for (let j = 0; j < 8; j += 1) for (let i = -4; i <= 4; i += 1) Q.put(x + i, yb - 7 + j, j === 0 ? '#e0bc8a' : j === 1 ? '#c8a070' : i < -2 ? FURB[1] : i > 2 ? FURB[3] : FURB[2]);
  });
}
// La JARRE DES SORTS : on y plonge la main pour tirer son caillou ; le trépied aux
// cordelettes nouées (les comptes), les plumes.
function lotJar(ctx, x, y) {
  const { O, P } = ctx, yb = y + FOOT - 1;
  contactShadow(P, x - 9, x + 9, yb + 1);
  piece(O, x - 9, yb - 20, 19, 21, (Q) => {
    jar(Q, x, yb, 20, 9);
    // Les cailloux blancs dans la bouche de la jarre.
    for (const dx of [-2, 0, 2]) Q.put(x + dx, yb - 19, BONE[0]);
  });
  // Le trépied de branches et ses cordelettes nouées.
  const tx = x + 18;
  piece(O, tx - 8, yb - 34, 17, 35, (Q) => {
    for (let j = 0; j < 34; j += 1) { Q.put(tx - Math.round(j * 0.2), yb - 33 + j, FURB[2]); Q.put(tx + Math.round(j * 0.2), yb - 33 + j, FURB[3]); }
    for (let i = -5; i <= 5; i += 1) Q.put(tx + i, yb - 30, FURB[1]);
    for (let k = 0; k < 5; k += 1) {
      const cx = tx - 4 + k * 2, len = 6 + (k % 3) * 3;
      for (let j = 0; j < len; j += 1) Q.put(cx, yb - 29 + j, j % 3 === 2 ? OCHRE : HIDE[1]);
    }
    for (const [dx, c] of [[-6, '#f4f0e8'], [6, '#3a3a40']]) for (let j = 0; j < 5; j += 1) Q.put(tx + dx + (j >> 2), yb - 34 + j, j === 0 ? '#ffffff' : c);
  });
}
// La CLAIE du troqueur : deux perches, une traverse, ce qu'on y pend (peaux, poissons,
// colliers de dents, gourde) ; à terre, la natte, les paniers, les pots.
function barterRack(ctx, x, y, w) {
  const { O, P, S } = ctx, yb = y + FOOT - 1, hw = Math.round(w / 2);
  contactShadow(P, x - hw, x + hw, yb + 1);
  piece(O, x - hw, yb - 40, w, 41, (Q) => {
    // Deux chevalets de perches croisées, la traverse posée dans leurs fourches.
    for (const px of [x - hw + 3, x + hw - 4]) for (let j = 0; j < 38; j += 1) {
      const d = Math.round((j * 3) / 38);
      Q.put(px - 1 + d, yb - 39 + j, FURB[2]); Q.put(px + 1 - d, yb - 39 + j, FURB[3]);
    }
    for (let i = -hw; i < hw; i += 1) { Q.put(x + i, yb - 38, FURB[1]); Q.put(x + i, yb - 37, FURB[3]); }
    // Une peau tendue, une rangée de poissons, un collier de dents, une gourde.
    furPile(Q, x - hw + 4, yb - 35, 12, 14, [FURG, FURG]);
    for (let k = 0; k < 3; k += 1) {
      const fx = x - 4 + k * 5;
      for (let j = 0; j < 9; j += 1) { const hh = j < 2 ? 0 : j > 7 ? 1 : 1; for (let i = -hh; i <= hh; i += 1) Q.put(fx + i, yb - 35 + j, j > 7 ? '#5a7a8a' : i < 0 ? '#c8d8e0' : '#8aa4b4'); }
    }
    for (let t = 0; t <= 12; t += 1) {
      const sag = Math.round(4 * Math.sin((t / 12) * Math.PI));
      Q.put(x + hw - 16 + t, yb - 35 + sag, HIDE[3]);
      if (t % 2 === 0) Q.put(x + hw - 16 + t, yb - 34 + sag, BONE[0]);
    }
    // La natte et la marchandise.
    for (let i = -hw + 7; i < hw - 7; i += 1) { Q.put(x + i, yb, (i & 1) ? S.paper[2] : S.paper[3]); }
    jar(Q, x - hw + 9, yb - 1, 9, 4);
    // Un panier de baies.
    for (let j = 0; j < 5; j += 1) for (let i = -5; i <= 5; i += 1) Q.put(x - 2 + i, yb - 6 + j, j === 0 ? '#c83a3a' : (i + j) % 2 ? '#c8a050' : '#a8823a');
    for (const dx of [-4, -2, 0, 2, 4]) Q.put(x - 2 + dx, yb - 7, '#e05a4a');
    // Un tas de coquillages, une pile de peaux pliées.
    for (const [dx, dy] of [[6, 0], [8, 0], [7, -1], [10, 0]]) Q.put(x + dx, yb - 2 + dy, BONE[0]);
    furPile(Q, x + hw - 14, yb - 5, 10, 4, [FURB]);
  });
}
// LE GRAND FEU de la scène : cercle de pierres, bûches croisées, flammes hautes.
export function campfire(ctx, x, y, big = true) {
  const { O, P } = ctx, yb = y + FOOT - 1, h = big ? 15 : 9;
  // La lueur sur le sol.
  for (let j = 0; j < 4; j += 1) for (let i = -20; i <= 20; i += 1) {
    if (Math.abs(i) > 20 - j * 2 || bayer(x + i, yb + j) > 0.6 - Math.abs(i) / 40) continue;
    P.put(x + i, yb - 1 + j, mix(P.get(x + i, yb - 1 + j), '#ffb35c', 0.35));
  }
  piece(O, x - 11, yb - 6, 23, 7, (Q) => {
    for (let i = -11; i <= 11; i += 2) { Q.put(x + i, yb, ROCK[i < 0 ? 1 : 2]); Q.put(x + i + 1, yb, ROCK[3]); Q.put(x + i, yb - 1, ROCK[1]); }
    for (let t = 0; t < 14; t += 1) { Q.put(x - 7 + t, yb - 1 - (t >> 2), FURB[t < 7 ? 2 : 3]); Q.put(x + 7 - t, yb - 1 - (t >> 2), FURB[t < 7 ? 3 : 2]); }
    for (const dx of [-3, -1, 1, 3]) Q.put(x + dx, yb - 2, '#ff6a2a');
  });
  flame(ctx, O, x - 2, yb - 3, Math.round(h * 0.75));
  flame(ctx, O, x + 2, yb - 3, Math.round(h * 0.65));
  flame(ctx, O, x, yb - 3, h);
}
// Le GRAND TAMBOUR : un fût de bois creusé, debout, la peau tendue dessus, lacée de
// cordes en zigzag jusqu'au pied ; deux baguettes posées contre.
export function drum(ctx, x, y) {
  const { O, P } = ctx, yb = y + FOOT - 1;
  contactShadow(P, x - 6, x + 6, yb + 1);
  piece(O, x - 6, yb - 22, 13, 23, (Q) => {
    for (let j = 0; j < 19; j += 1) {
      const half = 5 - (j > 13 ? 1 : 0) + (j < 2 ? 1 : 0);
      for (let i = -half; i <= half; i += 1) {
        const u = (i + half) / (half * 2);
        let c = u < 0.2 ? FURB[1] : u < 0.6 ? FURB[2] : u < 0.85 ? FURB[3] : FURB[4];
        // Les cordes de laçage : un zigzag clair du bord de la peau au pied.
        const zig = Math.abs(((j + 40) % 8) - 4) - 2;
        if (j > 1 && j < 16 && (i === zig * 2 || i === zig * 2 + 1)) c = HIDE[0];
        if (j === 16 || j === 17) c = u < 0.5 ? HIDE[2] : HIDE[3];          // la ceinture de corde
        Q.put(x + i, yb - 18 + j, c);
      }
    }
    // La peau vue un peu d'en haut : ellipse claire, son bord replié.
    for (let j = -2; j <= 2; j += 1) for (let i = -6; i <= 6; i += 1) if ((i * i) / 36 + (j * j) / 4.4 <= 1) Q.put(x + i, yb - 20 + j, j === 2 ? HIDE[3] : i + j < -3 ? '#f8e4c0' : HIDE[0]);
    // Les deux baguettes, appuyées.
    for (let t = 0; t < 9; t += 1) { Q.put(x + 6 - (t >> 2), yb - 8 - t, BONE[1]); }
  });
}
// Le FEU DE BRAISE en coupelle de pierre (le boudoir, le hall).
export function fireBowl(ctx, x, y) {
  const { O, P } = ctx, yb = y + FOOT - 1;
  contactShadow(P, x - 5, x + 5, yb + 1);
  piece(O, x - 5, yb - 4, 11, 5, (Q) => {
    for (let j = 0; j < 4; j += 1) for (let i = -5 + j; i <= 5 - j; i += 1) Q.put(x + i, yb - 3 + j, j === 0 ? ROCK[1] : i < 0 ? ROCK[2] : ROCK[3]);
  });
  flame(ctx, O, x, yb - 4, 7);
}

// L'ÉQUIPE D'UNE TABLE (tous les âges) : le croupier et un joueur DERRIÈRE, deux joueurs
// AUX BOUTS, l'hôtesse à côté, et au plus un joueur de dos au COIN de la table quand la
// salle est large. Jamais au milieu devant : à 27 px, un joueur cache une table de 13.
export function tableCrew(ctx, r, tx, half, t = 0, girlCroupier = false) {
  const { fig } = ctx, { x, y, w, on, v } = r;
  if (!on) return;
  const inRoom = (px) => Math.abs(px - x) <= w / 2 - 12;
  fig(tx - 5, y + BK, 0, girlCroupier ? 'g' : 0, v(t), { back: true, role: girlCroupier ? 'croupière' : 'croupier' });
  fig(tx + Math.round(half * 0.55), y + BK, 2, 1, v(t + 1), { back: true });
  if (inRoom(tx - half - 9)) fig(tx - half - 9, y + SD, 0, 0, v(t + 2));
  if (inRoom(tx + half + 9)) fig(tx + half + 9, y + SD, 2, 'g', v(t + 3), { role: 'hotesse' });
  if (w >= 150) fig(tx - half + 4, y + FR, 3, 1, v(t + 4), { front: true });
}

// ── Le boudoir, commun à tous les âges ───────────────────────────────────────
// L'ALCÔVE fermée (au bout le plus loin de la cage) : sa TENTURE s'allume par-derrière
// la nuit et les ombres s'y animent (shadowFrames, peintes par la vue) ; l'ouverte de
// l'autre côté quand la salle est large. `A` : l'habit de l'âge —
//   niche (couleur du fond), bed(Q, x, y) (le lit, en pièce), valance(Q, x0, top, w)
//   (le lambrequin), curtain(i, j, x0, w) → couleur de la tenture fermée (allumée),
//   drape (rampe des rideaux relevés), couch / table / wall / extra (le reste).
export function alcoveEra(ctx, x, y, closed, A) {
  const { O, F, N, P } = ctx;
  const top = y - HD.WALLH + 8, w = 50, x0 = x - 25;
  for (let j = top; j < y + 2; j += 1) for (let i = x0; i < x0 + w; i += 1) O.put(i, j, mix(A.niche, INK, 0.3 + ((j - top) / (y - top)) * 0.12));
  piece(O, x - 20, y - 20, 40, 22, (Q) => A.bed(Q, x, y));
  contactShadow(P, x - 18, x + 18, y + 2);
  piece(F, x0 - 2, top - 4, w + 4, 8, (Q) => A.valance(Q, x0 - 2, top - 4, w + 4), { ink: null });
  if (closed) {
    // La tenture tirée jusqu'au sol, éclairée par-derrière.
    for (let j = top + 1; j < y + HD.FLOORD - 4; j += 1) for (let i = x0; i < x0 + w; i += 1) {
      const c = A.curtain(i - x0, j - top, w, x);
      F.put(i, j, c); N.put(i, j, c);
    }
    N.mark(x, y - 18, A.glow || '#ff9ab8');
  } else {
    const V = A.drape;
    for (let j = top + 1; j < y + 3; j += 1) {
      const t = (j - top) / (y - top), cw = t < 0.55 ? 7 - Math.round(t * 6) : 3 + Math.round((t - 0.55) * 8);
      for (let i = 0; i < cw; i += 1) {
        const c = V[1 + ((i + 1) % 3)];
        F.put(x0 + i, j, i === cw - 1 ? V[4] : c); F.put(x0 + w - 1 - i, j, i === cw - 1 ? V[4] : c);
      }
    }
  }
}
export function boudoirRoom(ctx, r, A) {
  const { fig } = ctx, { x0r, x1r, y, w, y0, seed } = r;
  const wide = w >= 220;
  const ax = Math.round(x1r) - 30, bx = Math.round(x0r) + 30;
  alcoveEra(ctx, ax, y, true, A);
  ctx.boudoir = { x: ax, level: ctx.level };
  ctx.show = { x: ax + 1, y: y + 1 };
  if (wide) alcoveEra(ctx, bx, y, false, A);
  const mid = wide ? Math.round((bx + ax) / 2) : Math.round((x0r + ax) / 2) - 6;
  A.couch(ctx, mid - 10, y);
  if (A.wall) A.wall(ctx, mid - 10, y0);
  A.table(ctx, mid + 18, y);
  if (wide && A.extra) A.extra(ctx, mid + 46, y);
  fig(mid - 8, y + SD, 0, 'g', seed, { role: 'courtisane' });
  fig(mid + 6, y + SD + 1, 2, 0, seed + 3);
  if (wide) fig(bx + 2, y + BK + 1, 0, 'g', seed + 1, { role: 'courtisane' });
}

// ── LES GABARITS, habillés par chaque âge ────────────────────────────────────
// LA TABLE : plateau (3 rangs, le fond plus clair), chant (2), ceinture (4), pieds.
// `T` : { h (hauteur, 15), top: [3 teintes], lip: [2], apron: [clair, moyen, sombre],
//   legs: 'trestle' | 'turned' | 'block' | 'lion' | 'pedestal' | 'chrome' | 'float',
//   leg: [clair, moyen, sombre], cloth: { ramp: [4], fringe } (nappe qui tombe),
//   items(Q, x0, yTop, w) : ce qui est posé dessus, glow (la lueur d'une table qui flotte) }.
export function tableEra(ctx, x, y, w, T) {
  const { F, P } = ctx, yb = y + FOOT, x0 = x - Math.round(w / 2), H = T.h || 15, yt = yb - H;
  const L = T.leg || T.apron;
  if (T.legs === 'float') {
    // La lueur sous la table qui flotte, sur le sol.
    for (let j = 0; j < 3; j += 1) for (let i = 4 + j * 3; i < w - 4 - j * 3; i += 1) {
      if (j === 2 && bayer(x0 + i, yb + j) > 0.5) continue;
      P.put(x0 + i, yb - 1 + j, mix(P.get(x0 + i, yb - 1 + j), T.glow || '#ffffff', 0.45 - j * 0.12));
    }
  } else contactShadow(P, x0 + 2, x0 + w - 3, yb + 1);
  piece(F, x0 - 1, yt - 1, w + 2, H + 2, (Q) => {
    const legAt = (lx, lw = 3) => {
      for (let j = yt + 9; j <= yb; j += 1) for (let i = 0; i < lw; i += 1) Q.put(lx + i, j, i === 0 ? L[0] : i === lw - 1 ? L[2] : L[1]);
    };
    switch (T.legs) {
      case 'trestle':                                          // deux chevalets en A, une entretoise
        for (const lx of [x0 + 6, x0 + w - 9]) for (let j = yt + 9; j <= yb; j += 1) {
          const d = Math.round(((j - yt - 9) * 3) / (H - 9));
          Q.put(lx - d, j, L[1]); Q.put(lx - d + 1, j, L[2]); Q.put(lx + 2 + d, j, L[1]); Q.put(lx + 3 + d, j, L[2]);
        }
        Q.hline(x0 + 6, yb - 3, w - 12, L[1]); Q.hline(x0 + 6, yb - 2, w - 12, L[2]);
        break;
      case 'turned':
        for (const lx of [x0 + 3, x0 + w - 6]) for (let j = yt + 9; j <= yb; j += 1) {
          const r = (j - yt) % 4;
          Q.put(lx, j, L[0]); Q.put(lx + 1, j, r === 1 ? L[0] : L[1]); Q.put(lx + 2, j, L[2]);
        }
        break;
      case 'block': legAt(x0 + 2, 5); legAt(x0 + w - 7, 5); break;
      case 'lion':                                             // pieds de marbre en patte de lion
        for (const [lx, s] of [[x0 + 3, 1], [x0 + w - 8, -1]]) {
          for (let j = yt + 9; j <= yb; j += 1) {
            const t = (j - yt - 9) / (H - 9), bulge = Math.round(Math.sin(t * Math.PI) * 1.4 * s);
            for (let i = 0; i < 5; i += 1) Q.put(lx + i + bulge, j, i === 0 ? L[0] : i === 4 ? L[2] : L[1]);
          }
          Q.hline(lx - 1, yb, 7, L[2]); Q.put(lx, yb - 1, L[0]); Q.put(lx + 2, yb - 1, L[0]); Q.put(lx + 4, yb - 1, L[0]);
        }
        break;
      case 'pedestal': {                                       // un fût central, sa base
        const cx = x;
        for (let j = yt + 9; j <= yb; j += 1) for (let i = -2; i <= 2; i += 1) Q.put(cx + i, j, i < -1 ? L[0] : i > 1 ? L[2] : L[1]);
        for (let i = -6; i <= 6; i += 1) { Q.put(cx + i, yb, Math.abs(i) > 4 ? L[2] : L[1]); Q.put(cx + i, yb - 1, Math.abs(i) > 5 ? null : L[0]); }
        break;
      }
      case 'chrome':
        for (const lx of [x0 + 4, x0 + w - 6]) for (let j = yt + 9; j <= yb; j += 1) { Q.put(lx, j, '#f4f6fa'); Q.put(lx + 1, j, '#8a94a4'); }
        Q.hline(x0 + 2, yb, 6, '#c4cad4'); Q.hline(x0 + w - 8, yb, 6, '#c4cad4');
        break;
      default: break;
    }
    // La ceinture (ou la nappe qui tombe).
    if (T.cloth) {
      const C = T.cloth.ramp;
      for (let j = 0; j < 8; j += 1) for (let i = 0; i < w; i += 1) {
        const fold = (i % 7 === 3) ? C[2] : i % 7 === 4 ? C[0] : C[1];
        Q.put(x0 + i, yt + 3 + j, j === 7 ? C[3] : fold);
      }
      if (T.cloth.fringe) for (let i = 0; i < w; i += 2) { Q.put(x0 + i, yt + 11, T.cloth.fringe); }
    } else if (T.legs !== 'float') {
      const A = T.apron;
      for (let j = 0; j < 4; j += 1) for (let i = 1; i < w - 1; i += 1) {
        const px = (i - 1) % 16, inP = T.panels !== false && px >= 2 && px <= 13 && j >= 1 && j <= 2;
        Q.put(x0 + i, yt + 5 + j, j === 3 ? A[2] : inP ? (j === 1 ? A[2] : A[0]) : A[1]);
      }
    } else {
      // Le dessous lumineux de la table qui flotte.
      for (let i = 4; i < w - 4; i += 1) { Q.put(x0 + i, yt + 5, T.glow); if (i > 8 && i < w - 8) Q.put(x0 + i, yt + 6, mix(T.glow, '#ffffff', 0.4)); }
    }
    // Le plateau, son chant.
    const Tp = T.top, Lp = T.lip || [T.apron[0], T.apron[1]];
    for (let i = 0; i < w; i += 1) {
      const inset = i < 1 || i > w - 2 ? 1 : 0;
      Q.put(x0 + i, yt + inset, Tp[0]); Q.put(x0 + i, yt + 1, Tp[1]); Q.put(x0 + i, yt + 2, Tp[2]);
      Q.put(x0 + i, yt + 3, Lp[0]); Q.put(x0 + i, yt + 4, Lp[1]);
    }
    if (T.items) T.items(Q, x0, yt, w);
  });
}
// LE COMPTOIR : plateau, façade, au besoin un dessus à objets. `C` : { top: [2], face:
// [clair, moyen, sombre], style: 'plank' | 'panel' | 'marble' | 'glass' | 'light', items }.
export function counterEra(ctx, x, y, w, C) {
  const { F, P } = ctx, x0 = Math.round(x - w / 2), yb = y + FOOT, A = C.face;
  if (C.style !== 'light') contactShadow(P, x0 + 1, x0 + w - 2, yb + 1);
  piece(F, x0 - 1, yb - 18, w + 2, 19, (Q) => {
    Q.hline(x0 - 1, yb - 17, w + 2, C.top[0]); Q.hline(x0 - 1, yb - 16, w + 2, C.top[1]);
    for (let j = 0; j < 15; j += 1) for (let i = 0; i < w; i += 1) {
      let c = j === 14 ? A[2] : A[1];
      switch (C.style) {
        case 'plank': c = i % 7 === 0 ? A[2] : (i * 3 + j * 11) % 23 === 0 ? A[2] : j === 0 ? A[0] : A[1]; break;
        case 'panel': { const px = i % 14, inP = px >= 2 && px <= 11 && j >= 2 && j <= 11; if (inP) c = j === 2 || px === 2 ? A[2] : j === 11 || px === 11 ? A[0] : A[1]; break; }
        case 'marble': {                                       // la façade d'un thermopolium : plaques de marbres de couleur
          const px = Math.floor(i / 9), kind = h32(px, Math.floor(j / 7), 4) % 4;
          c = ['#e8dcc8', '#c87050', '#5a7a60', '#d8b878'][kind];
          if (i % 9 === 0 || j % 7 === 0) c = A[2];
          if ((i * 7 + j * 3) % 11 === 0) c = mix(c, '#ffffff', 0.3);
          break;
        }
        case 'glass': {                                        // la vitrine éclairée
          if (j < 2 || j > 11 || i < 2 || i > w - 3) c = j < 2 ? A[0] : A[1];
          else c = j < 6 ? '#fff4f8' : '#f6d8e6';
          break;
        }
        case 'light': c = j % 4 === 0 ? C.top[0] : mix(A[1], A[0], j / 15); break;
        default: break;
      }
      Q.put(x0 + i, yb - 15 + j, c);
    }
    if (C.items) C.items(Q, x0, yb - 17, w);
  });
  if (C.style === 'glass') for (let i = x0 + 2; i < x0 + w - 2; i += 1) ctx.N.put(i, yb - 9, '#fff0f6');
}
// LE MEUBLE À ÉTAGÈRES du fond (boutiques) : `K` : { wood: [clair, moyen, sombre, fond],
// rows, crown (fronton : 'arch' | 'flat' | 'none'), item(Q, x, y, r, i) : ce qui est rangé }.
export function shelvesEra(ctx, x, y, w, K) {
  const { O } = ctx, x0 = Math.round(x - w / 2), rows = K.rows || 4, hh = rows * 10 + 4, top = y - hh, Wd = K.wood;
  piece(O, x0, top - 4, w, hh + 4, (Q) => {
    if (K.crown === 'arch') for (let i = 0; i < w; i += 1) { const a = Math.round(4 - 4 * Math.pow((i - w / 2) / (w / 2), 2)); for (let j = 0; j <= a; j += 1) Q.put(x0 + i, top - j, j === a ? Wd[0] : Wd[1]); }
    Q.rect(x0, top, w, hh, Wd[1]); Q.vline(x0, top, hh, Wd[0]); Q.vline(x0 + w - 1, top, hh, Wd[2]);
    Q.rect(x0 + 2, top + 2, w - 4, hh - 4, Wd[3]);
    for (let r = 0; r < rows; r += 1) {
      const sy = top + 11 + r * 10;
      Q.hline(x0 + 2, sy, w - 4, Wd[0]); Q.hline(x0 + 2, sy + 1, w - 4, Wd[2]);
      for (let i = 4; i < w - 5;) { const step = K.item(Q, x0 + i, sy, r, i) || 4; i += step; }
    }
  });
}
// LA SCÈNE : toile de fond (`G.backdrop(O, x0, top, x1, bot)`), estrade, rideaux relevés,
// cadre (`frame` : 'gold' | 'wood' | 'marble' | 'chrome' | 'light'), rampe (`foot` :
// 'oil' | 'candle' | 'bulb' | 'orb'). `G.curtain` : la rampe du velours (6 teintes).
export function stageEra(ctx, r, G) {
  const { O, N, P, fig } = ctx, { x, y, x0r, x1r, y0, v } = r;
  const x0 = x0r, x1 = x1r, w = x1 - x0, V = G.curtain, top = y0 + 6, plat = y - 1;
  G.backdrop(O, x0 + 4, top, x1 - 4, plat);
  // L'estrade et sa rampe.
  const S0 = G.stage;
  piece(P, x0 + 2, plat - 1, w - 4, 8, (Q) => {
    Q.rect(x0 + 2, plat - 1, w - 4, 2, S0[1]); Q.hline(x0 + 2, plat - 1, w - 4, S0[0]);
    Q.rect(x0 + 2, plat + 1, w - 4, 6, S0[2]);
    for (let i = x0 + 2; i < x1 - 2; i += 1) if ((i - x0) % 9 === 0) Q.vline(i, plat + 3, 4, S0[3]);
  });
  for (let i = x0 + 7; i < x1 - 7; i += 11) {
    switch (G.foot) {
      case 'candle': O.put(i, plat - 1, '#f6efd8'); O.put(i, plat - 2, '#f6efd8'); flame(ctx, O, i, plat - 3, 3, 1); break;
      case 'oil': O.hline(i - 1, plat - 1, 4, G.metal || '#c8a050'); O.put(i + 2, plat - 2, G.metal || '#c8a050'); flame(ctx, O, i, plat - 2, 3, 1); break;
      case 'bulb': O.put(i, plat - 1, '#fff2c8'); O.put(i + 1, plat - 1, '#fff2c8'); N.put(i, plat - 1, '#fff6d8'); N.put(i + 1, plat - 1, '#fff6d8'); O.mark(i, plat - 2, '#ffe6a0'); break;
      case 'orb': for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [0, 0]]) { O.put(i + dx, plat + dy - 1, G.glow); N.put(i + dx, plat + dy - 1, G.glow); } O.mark(i, plat - 2, G.glow); break;
      default: break;
    }
  }
  // Les rideaux relevés : plis, embrasse.
  const ch = plat - top;
  for (let j = 0; j < ch; j += 1) {
    const t = j / ch, cw = Math.max(4, Math.round(w * 0.18 * (t < 0.58 ? 1 - t * 0.85 : 0.5 + (t - 0.58) * 1.1)));
    for (let i = 0; i < cw; i += 1) {
      const fold = (i + Math.round(t * 2)) % 5, c = fold === 0 ? V[4] : fold === 1 ? V[1] : fold === 4 ? V[3] : V[2];
      O.put(x0 + 4 + i, top + j, i === cw - 1 ? V[4] : c);
      O.put(x1 - 5 - i, top + j, i === cw - 1 ? V[5] : c);
    }
  }
  const ty = top + Math.round(ch * 0.58), tie = G.tie || '#f0cf6a';
  for (const tx of [x0 + 4 + Math.round(w * 0.09), x1 - 5 - Math.round(w * 0.09)]) { O.rect(tx - 1, ty - 1, 3, 3, tie); O.put(tx, ty + 2, tie); O.put(tx, ty + 3, tie); }
  // Le cadre.
  const Fm = G.frameRamp;
  for (const px of [x0, x1 - 4]) for (let j = y0; j < plat; j += 1) for (let i = 0; i < 4; i += 1) {
    let c = i === 0 ? Fm[0] : i === 3 ? Fm[3] : Fm[(j % 6 === 0) ? 2 : 1];
    if (G.frame === 'marble') c = i === 0 ? Fm[0] : i === 3 ? Fm[2] : (i === 1 || i === 2) && j % 2 ? Fm[1] : Fm[0];   // la colonne cannelée
    if (G.frame === 'chrome' && i === 2 && (j - y0) % 4 === 0) { c = '#fff2c8'; N.put(px + i, j, '#fff6d8'); }      // les ampoules du chapiteau
    O.put(px + i, j, c);
  }
  for (let i = x0; i < x1; i += 1) {
    const s = ((i - x0) % 12) / 12, d = G.frame === 'marble' ? 3 : 4 + Math.round(4 * Math.sin(s * Math.PI));
    for (let j = 0; j < d + 6; j += 1) {
      let c = j < 3 ? (j === 0 ? Fm[0] : Fm[1]) : j === d + 5 ? Fm[0] : j === d + 4 ? Fm[2] : V[j < 6 ? 1 : 2];
      if (G.frame === 'marble') c = j === 0 ? Fm[0] : j < 4 ? ((i - x0) % 4 === 0 && j === 2 ? Fm[2] : Fm[1]) : j < 6 ? Fm[2] : j === d + 5 ? Fm[0] : V[2];
      if (G.frame === 'chrome' && j === 1 && (i - x0) % 4 === 2) { c = '#fff2c8'; N.put(i, y0 + j, '#fff6d8'); }
      O.put(i, y0 + j, c);
    }
  }
  if (G.frame === 'chrome') O.mark(x, y0 + 3, '#ffe6a0');
  if (G.extra) G.extra(ctx, plat);
  // La troupe, le public de dos sur les côtés.
  const nd = G.dancers || (w >= 170 ? 3 : 2), gap = G.gap || 28;
  for (let k = 0; k < nd; k += 1) fig(Math.round(x + (k - (nd - 1) / 2) * gap), y - 2, k & 1 ? 2 : 0, 'd', k, { role: 'danseuse', phase: k * 0.37 });
  fig(x - Math.round(w / 2) + 20, y + FR, 3, 1, v(3), { front: true });
  fig(x + Math.round(w / 2) - 20, y + FR, 1, 0, v(4), { front: true });
}
// ── Petits objets de table (grilles de lettres) ──────────────────────────────
export const ITEM = {
  tankard: { rows: ['ii.', 'IIi', 'IIi', 'Iii'], pal: { I: '#c8ccd2', i: '#8a909a' } },
  goblet: { rows: ['GGg', '.G.', '.g.', 'GGg'], pal: { G: '#f0cf6a', g: '#b08a3a' } },
  cup: { rows: ['CCc', 'Ccc', '.c.'], pal: { C: '#d88a5a', c: '#a65f34' } },
  jug: { rows: ['.C.', 'CCc', 'CCc', 'Ccc', '.c.'], pal: { C: '#d88a5a', c: '#a65f34' } },
  coins: { rows: ['.G.', 'GgG', 'ggg'], pal: { G: '#f0cf6a', g: '#c09040' } },
  bones: { rows: ['B.b.B', '.bB.b'], pal: { B: '#fbf4e2', b: '#c8b896' } },
  krater: { rows: ['CCCCC', '.CcC.', '..c..', '.ccc.'], pal: { C: '#d07a40', c: '#2a1a14' } },
  fruit: { rows: ['.rgo.', 'RRRRR', '.RRR.'], pal: { r: '#d8404a', g: '#7aa040', o: '#e8a040', R: '#c8b090' } },
  martini: { rows: ['BBBBB', '.BoB.', '..B..', '..B..', '.BBB.'], pal: { B: '#e8f4ff', o: '#7aa040' } },
  chips: { rows: ['r.b', 'r.b', 'rgb'], pal: { r: '#d8404a', b: '#3a6ad8', g: '#3a9a5a' } },
};
export function item(Q, name, x, y) { const it = ITEM[name]; Q.spr(x, y - it.rows.length + 1, it.rows, it.pal); }
// Une CHANDELLE sur son bougeoir, allumée.
export function candle(ctx, L, x, y, h = 4) {
  L.vline(x, y - h, h, '#f6efd8'); L.put(x + 1, y - h + 1, '#d8ccb0');
  L.hline(x - 1, y, 3, '#c8a050');
  flame(ctx, L, x, y - h - 1, 3, 1, '#ffc070');
}

// ── LE FEU ───────────────────────────────────────────────────────────────────
const FEU = {
  des(ctx, r) {
    const { x, y, w } = r;
    const two = w >= 190, at = two ? [x - Math.round(w / 4), x + Math.round(w / 4)] : [x];
    at.forEach((tx, t) => {
      slabTable(ctx, tx, y, 50);
      tableCrew(ctx, r, tx, 25, t * 5);
    });
  },
  cartes(ctx, r) {
    const { x, y } = r;
    stumpTable(ctx, x, y, 40);
    logStool(ctx, x - 27, y);
    logStool(ctx, x + 27, y);
    tableCrew(ctx, r, x, 20, 0, true);
  },
  tickets(ctx, r) {
    const { fig, P, N } = ctx, { x, y, w, y0, on, v } = r;
    const kx = x - (w >= 150 ? 18 : 6);
    // Au mur, la peau des comptes : des rangées de bâtons à l'ocre.
    piece(P, kx - 16, y0 + 8, 32, 22, (Q) => {
      for (let j = 0; j < 22; j += 1) for (let i = 0; i < 32; i += 1) {
        const edge = (i < 2 || i > 29) && (j + i) % 3 === 0;
        if (edge) continue;
        Q.put(kx - 16 + i, y0 + 8 + j, (i + j) % 7 === 0 ? HIDE[2] : HIDE[1]);
      }
      for (let row = 0; row < 3; row += 1) for (let k = 0; k < 9; k += 1) {
        const bx = kx - 12 + k * 3 + (k >= 4 ? 1 : 0);
        if (h32(row, k, 4) % 5 === 0) continue;
        for (let j = 0; j < 4; j += 1) Q.put(bx, y0 + 12 + row * 6 + j, row === 1 ? CHAR : OCHRE);
        if (k === 4) for (let t = 0; t < 5; t += 1) Q.put(bx - 4 + t, y0 + 15 + row * 6 - t, OCHRE);
      }
    });
    lotJar(ctx, kx, y);
    void N;
    if (on) {
      fig(kx - 3, y + BK, 0, 0, v(0), { back: true, role: 'guichetier' });
      fig(kx - 20, y + SD, 0, 0, v(1));
      fig(kx + 34, y + SD, 2, 'g', v(2));
      if (w >= 150) fig(kx - 22, y + FR, 1, 1, v(3), { front: true });
    }
  },
  boutique(ctx, r) {
    const { fig } = ctx, { x, y, w, on, v } = r;
    barterRack(ctx, x, y, Math.min(64, w - 26));
    if (on) {
      fig(x - 10, y + BK, 0, 'g', v(0), { back: true, role: 'marchande' });
      fig(x - 18, y + FR, 3, 1, v(1), { front: true });
    }
  },
  scene(ctx, r) {
    const { fig, O } = ctx, { x, y, x0r, x1r, y0, v } = r;
    // La grande peau peinte tendue au fond, entre deux perches.
    const px0 = x0r + 6, px1 = x1r - 6, top = y0 + 5, bot = y - 2;
    for (let j = top; j < bot; j += 1) for (let i = px0; i < px1; i += 1) {
      const sag = Math.round(2 * Math.sin(((i - px0) / (px1 - px0)) * Math.PI));
      if (j < top + sag) continue;
      O.put(i, j, (i * 3 + j * 7) % 23 === 0 ? HIDE[2] : j - top < 4 ? HIDE[0] : HIDE[1]);
    }
    caveArt(O, px0 + 2, top + 4, px1 - 2, bot - 4, ctx.level * 3 + 1);
    for (const px of [px0 - 2, px1]) for (let j = top - 4; j < y + 2; j += 1) { O.put(px, j, FURB[2]); O.put(px + 1, j, FURB[3]); }
    // Les liens de la peau aux perches.
    for (let j = top + 2; j < bot; j += 6) { O.put(px0 - 1, j, HIDE[3]); O.put(px0, j, HIDE[3]); O.put(px1 - 1, j, HIDE[3]); }
    // Le grand feu au milieu, les deux tambours aux bords.
    campfire(ctx, x, y);
    drum(ctx, px0 + 10, y);
    drum(ctx, px1 - 10, y);
    const sw = x1r - x0r, nd = sw >= 170 ? 4 : 2;
    const spots = nd === 4 ? [-48, -24, 24, 48] : [-24, 24];
    spots.forEach((dx, k) => fig(x + dx, y - 1, dx < 0 ? 0 : 2, 'd', k, { role: 'danseuse', phase: k * 0.37 }));
    fig(px0 + 22, y + FR, 3, 1, v(3), { front: true });
    fig(px1 - 22, y + FR, 1, 0, v(4), { front: true });
  },
  boudoir(ctx, r) {
    const { S } = ctx;
    boudoirRoom(ctx, r, {
      niche: HIDE[4],
      bed(Q, x, y) {
        // La couche : des fourrures empilées sur un lit de branchages, un coussin de peau.
        for (let i = -18; i <= 18; i += 1) Q.put(x + i, y + 1, FURB[3]);
        furPile(Q, x - 18, y - 9, 37, 10, [FURB, FURG, S.velvet]);
        furPile(Q, x - 16, y - 13, 9, 4, [HIDE]);
      },
      valance(Q, x0, top, w) {
        for (let i = 0; i < w; i += 1) { Q.put(x0 + i, top, FURB[2]); Q.put(x0 + i, top + 1, FURB[3]); if (i % 4 === 0) { Q.put(x0 + i, top + 2, BONE[1]); Q.put(x0 + i, top + 3, BONE[2]); } }
      },
      curtain(i, j, w) {
        // Le rabat de peau, cousu, éclairé par le feu de dedans.
        const seam = i % 12 === 0 || (j % 14 === 0 && i % 3 === 0);
        const glow = 1 - Math.abs(i - w / 2) / (w / 2);
        return seam ? '#b8743c' : glow > 0.6 ? '#ffd8a0' : glow > 0.25 ? '#f6be80' : '#e8a466';
      },
      glow: '#ffb070',
      drape: [HIDE[0], HIDE[1], HIDE[2], HIDE[3], HIDE[4]],
      couch(c, x, y) {
        // Une couche basse : deux rondins, une peau grise jetée dessus, un coussin roulé.
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 15, x + 15, yb + 1);
        piece(c.O, x - 15, yb - 9, 31, 10, (Q) => {
          for (let i = -15; i <= 15; i += 1) for (let j = 0; j < 3; j += 1) Q.put(x + i, yb - 2 + j, j === 0 ? FURB[1] : j === 2 ? FURB[4] : FURB[2]);
          for (const ex of [-15, 15]) { Q.put(x + ex, yb - 1, '#e0bc8a'); }
          furPile(Q, x - 13, yb - 7, 27, 5, [FURG]);
          for (let j = 0; j < 4; j += 1) for (let i = -3; i <= 3; i += 1) Q.put(x - 12 + i, yb - 9 + j, j === 0 ? HIDE[0] : i < 0 ? HIDE[1] : HIDE[2]);
        });
      },
      wall(c, x, yC) {
        // Deux mains à l'ocre, l'une contre l'autre (le cœur du campement).
        const L = c.P;
        CAVE.hand.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'r') { L.put(x - 8 + i, yC + 12 + j, OCHRE); L.put(x + 8 - i, yC + 12 + j, OCHRE2); } }));
      },
      table(c, x, y) {
        fireBowl(c, x, y);
        // La gourde de vin de baies, appuyée.
        piece(c.O, x + 7, y + FOOT - 10, 6, 9, (Q) => jar(Q, x + 10, y + FOOT - 2, 8, 3, HIDE, false));
      },
      extra(c, x, y) { drum(c, x, y); },
    });
  },
};

export { FEU };
