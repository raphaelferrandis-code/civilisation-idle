"use strict";
// ── LE MOBILIER DES ÂGES ANCIENS : le Bois, la Pierre, la Couronne, le Marbre ──
//
// (2026-10-03, nuit — « prends bien le temps de travailler chaque salle ».) Le matériel
// suit celui des jeux (components/ui/plaisirsMaterial.js) : OSSELETS jusqu'à la
// Couronne, dés d'ivoire au Marbre ; cartes de BOIS au Bois et à la Pierre, de
// PARCHEMIN à la Couronne et au Marbre.
//   · le BOIS (le village) : table à tréteaux, tonneau-table, coffre des sorts,
//     étal du marché, estrade de planches, lit clos derrière un rideau de lin ;
//   · la PIERRE (les étuves) : table de chêne et chopes d'étain, la BLANQUE (la loterie
//     d'alors) et son urne, l'épicier et sa balance, la tapisserie au lion, et au
//     boudoir le BAQUET des étuves sous son dais ;
//   · la COURONNE (le château) : nappe verte à franges, gobelets d'or, la LOTERIE DU
//     ROI (billets de parchemin scellés de bleu), le joaillier et son coffre, la scène
//     aux fleurs de lys, le lit à baldaquin ;
//   · le MARBRE (Rome) : table à pattes de lion et dés d'ivoire, l'urne de bronze des
//     sorts, le comptoir d'un THERMOPOLIUM et ses amphores, le front de scène à
//     colonnes, le lit maçonné du lupanar et son rideau rouge.
import { INK, h32, piece, contactShadow, FOOT, BK, SD, FR } from './plaisirsHDKit.js';
import {
  BONE, CLAY, HIDE, FURG, LEAF, flame, furPile, jar, tableCrew, boudoirRoom, tableEra,
  counterEra, shelvesEra, stageEra, item, candle,
} from './plaisirsEraRooms.js';

const OAK = ['#b88454', '#966a40', '#74502e', '#523820', '#38240f'];
const PEWTER = ['#dce0e4', '#aab0b8', '#7c8490', '#565c66'];
const LINEN = ['#f6eedc', '#e6dac0', '#cdbd9c', '#a8977a', '#7e6e56'];
const BRASS = ['#fff0b0', '#f0cf6a', '#c89a3e', '#8e6a26'];
const MARBLE = ['#fbf8f2', '#ece6da', '#d6cebe', '#b4aa98', '#8e8676'];
const POMPEI = ['#c8443a', '#a83430', '#842624', '#5a1a1a'];                 // le rouge de Pompéi
const BRONZE = ['#e8b878', '#c8904a', '#9a6a32', '#6a4620'];

// ── Petits morceaux communs ──────────────────────────────────────────────────
// Le TONNEAU (cerclé), debout. `lid` : un plateau rond posé dessus (la table-tonneau).
function barrel(ctx, L, x, yb, h = 13, r = 6, lid = 0) {
  const W = ctx.S.wood;
  for (let j = 0; j < h; j += 1) {
    const half = r - (j < 2 || j > h - 3 ? 1 : 0);
    for (let i = -half; i <= half; i += 1) {
      const hoop = j === 2 || j === h - 3 || j === Math.floor(h / 2);
      const u = (i + half) / (half * 2);
      L.put(x + i, yb - h + 1 + j, hoop ? (u < 0.4 ? PEWTER[1] : PEWTER[3]) : (i + 20) % 3 === 0 ? W[3] : u < 0.25 ? W[1] : u < 0.7 ? W[2] : W[3]);
    }
  }
  if (lid) {
    for (let j = -2; j <= 2; j += 1) for (let i = -lid; i <= lid; i += 1) if ((i * i) / (lid * lid) + (j * j) / 5 <= 1) L.put(x + i, yb - h - 1 + j, j < 0 ? W[0] : W[1]);
    for (let i = -lid; i <= lid; i += 1) L.put(x + i, yb - h + 2, W[3]);
  }
}
// Le LION dressé (tapisserie de la Pierre) et la FLEUR DE LYS (Couronne).
const LION = ['..gg....', '.gggg...', '.g.gg...', '..ggg.g.', '...gggg.', '..gggg..', '.gggggg.', 'gg.gg.gg', 'g..g...g'];
const LYS = ['..g..', '.ggg.', 'g.g.g', 'ggggg', '..g..', '.g.g.'];
function motif(Q, rows, x, y, c) { rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'g') Q.put(x + i, y + j, c); })); }

// L'équipe d'un comptoir (guichet, boutique) : le marchand derrière, un client de dos au
// coin, un autre sur le côté. Elle ne se montre que jeu ouvert (`crew`,
// plaisirsEraFurnish.js).
function counterCrew(ctx, r, cx, half, girl = false) {
  const { x, y, w, crew: fig, v } = r;
  fig(cx - 3, y + BK, 0, girl ? 'g' : 0, v(0), { back: true, role: girl ? 'marchande' : 'guichetier' });
  if (Math.abs(cx + half + 10 - x) < w / 2 - 10) fig(cx + half + 10, y + SD, 2, 1, v(1));
  if (w >= 140) fig(cx - half + 2, y + FR, 1, 'g', v(2), { front: true });
}

// ── LE BOIS : le village ─────────────────────────────────────────────────────
const BOIS = {
  des(ctx, r) {
    const W = ctx.S.wood, { x, y, w } = r;
    const at = w >= 190 ? [x - Math.round(w / 4), x + Math.round(w / 4)] : [x];
    at.forEach((tx, t) => {
      tableEra(ctx, tx, y, 52, {
        top: [W[0], W[1], W[2]], lip: [W[1], W[3]], apron: [W[1], W[2], W[3]], legs: 'trestle', panels: false,
        items(Q, x0, yt) { item(Q, 'bones', x0 + 18, yt + 1); item(Q, 'cup', x0 + 30, yt + 1); item(Q, 'jug', x0 + 38, yt + 1); item(Q, 'cup', x0 + 8, yt + 1); },
      });
      tableCrew(ctx, r, tx, 26, t * 5);
    });
  },
  cartes(ctx, r) {
    const { F, P } = ctx, { x, y } = r, yb = y + FOOT;
    contactShadow(P, x - 8, x + 8, yb + 1);
    piece(F, x - 18, yb - 17, 37, 18, (Q) => {
      barrel(ctx, Q, x, yb, 13, 7, 18);
      // Les cartes de bois peintes, posées sur le plateau.
      for (const [dx, c] of [[-12, '#c83a3a'], [-6, '#3a6ad8'], [5, '#c83a3a'], [10, '#2a2a30']]) { Q.rect(x + dx, yb - 15, 3, 2, '#e8cfa0'); Q.put(x + dx + 1, yb - 15, c); }
    });
    for (const sx of [x - 27, x + 27]) { contactShadow(P, sx - 4, sx + 4, yb); piece(ctx.O, sx - 4, yb - 8, 9, 9, (Q) => barrel(ctx, Q, sx, yb - 1, 8, 4)); }
    tableCrew(ctx, r, x, 19, 0, true);
  },
  tickets(ctx, r) {
    const { P, S } = ctx, W = S.wood, { x, y, y0, w } = r, kx = x - (w >= 150 ? 14 : 0);
    // Au mur, la planche des marques (des encoches par rangées) et la cloche.
    piece(P, kx - 15, y0 + 9, 30, 18, (Q) => {
      Q.rect(kx - 15, y0 + 9, 30, 18, W[1]);
      for (let j = 0; j < 18; j += 1) Q.put(kx - 15, y0 + 9 + j, W[0]);
      for (let row = 0; row < 3; row += 1) { Q.hline(kx - 13, y0 + 14 + row * 5, 26, W[3]); for (let k = 0; k < 8; k += 1) if (h32(row, k, 6) % 4) Q.vline(kx - 12 + k * 3, y0 + 11 + row * 5, 3, W[4]); }
    });
    for (let j = 0; j < 6; j += 1) for (let i = -2 - (j >> 1); i <= 2 + (j >> 1); i += 1) P.put(kx + 21 + i, y0 + 12 + j, j === 5 ? BRASS[3] : i < 0 ? BRASS[1] : BRASS[2]);
    P.vline(kx + 21, y0 + 8, 4, W[3]);
    counterEra(ctx, kx, y, 40, {
      top: [W[0], W[1]], face: [W[1], W[2], W[3]], style: 'plank',
      items(Q, x0, yt) {
        // Le coffre des sorts (une fente dessus), l'urne de terre.
        Q.rect(x0 + 8, yt - 7, 12, 7, W[2]); Q.hline(x0 + 8, yt - 7, 12, W[0]); Q.hline(x0 + 12, yt - 7, 4, INK); Q.vline(x0 + 19, yt - 6, 6, W[3]);
        jar(Q, x0 + 30, yt, 8, 4);
      },
    });
    counterCrew(ctx, r, kx, 20);
  },
  boutique(ctx, r) {
    const { S, O } = ctx, W = S.wood, { x, y, w } = r, sw = Math.min(56, w - 34);
    shelvesEra(ctx, x, y, sw, {
      wood: [W[1], W[2], W[3], '#3a2414'], rows: 3, crown: 'none',
      item(Q, ix, sy, row, i) {
        const k = h32(i, row, 3) % 3;
        if (k === 0) { jar(Q, ix + 2, sy - 1, 7, 3, CLAY, false); return 6; }
        if (k === 1) { for (let j = 0; j < 4; j += 1) for (let t = 0; t < 6; t += 1) Q.put(ix + t, sy - 4 + j, j === 0 ? '#d8404a' : (t + j) % 2 ? '#c8a050' : '#a8823a'); return 7; }
        for (let t = 0; t < 5; t += 1) { Q.put(ix + t, sy - 2, '#d8a050'); Q.put(ix + t, sy - 1, '#b8803a'); } Q.put(ix + 1, sy - 3, '#e8b868'); Q.put(ix + 3, sy - 3, '#e8b868'); return 6;
      },
    });
    // Les herbes et les saucisses pendues à la poutre, au-dessus de l'étal.
    for (let k = 0; k < 6; k += 1) {
      const hx = x - 24 + k * 10, len = 6 + (k % 3) * 2;
      for (let j = 0; j < len; j += 1) O.put(hx, y - 50 + j, j < 2 ? W[3] : k % 2 ? (j % 3 ? '#a0402a' : '#7a2a1a') : LEAF[(j + k) % 3]);
    }
    counterEra(ctx, x, y, Math.min(48, w - 40), {
      top: [W[0], W[1]], face: [W[1], W[2], W[3]], style: 'plank',
      items(Q, x0, yt) {
        for (let t = 0; t < 3; t += 1) { const bx = x0 + 6 + t * 13; for (let j = 0; j < 4; j += 1) for (let i = 0; i < 9; i += 1) Q.put(bx + i, yt - 4 + j, j === 0 ? ['#d8404a', '#e8b040', '#7aa040'][t] : (i + j) % 2 ? '#c8a050' : '#a8823a'); }
      },
    });
    counterCrew(ctx, r, x, 24, true);
  },
  scene(ctx, r) {
    const W = ctx.S.wood;
    stageEra(ctx, r, {
      curtain: ['#e8a060', '#c87a3a', '#a85e2a', '#86461e', '#643414', '#48240c'], tie: HIDE[0],
      frame: 'wood', frameRamp: [W[0], W[1], W[2], W[3]], stage: [W[0], W[1], W[2], W[3]], foot: 'oil', metal: '#c89a5a',
      backdrop(O, x0, top, x1, bot) {
        // Une toile de lin peinte : le soleil sur les vagues.
        for (let j = top; j < bot; j += 1) for (let i = x0; i < x1; i += 1) {
          const t = (j - top) / (bot - top), wave = Math.sin((i - x0) * 0.3 + Math.floor(t * 6)) > 0.6;
          O.put(i, j, t > 0.62 ? (wave ? '#8ab8c8' : '#5a8aa8') : t > 0.58 ? '#e8b060' : (j + i) % 9 === 0 ? LINEN[2] : LINEN[1]);
        }
        const sx = Math.round((x0 + x1) / 2), sy = top + Math.round((bot - top) * 0.45);
        for (let j = -6; j <= 6; j += 1) for (let i = -6; i <= 6; i += 1) { const d = i * i + j * j; if (d <= 20) O.put(sx + i, sy + j, d < 9 ? '#f0b040' : '#e08a2a'); else if (d <= 36 && (i === 0 || j === 0 || i === j || i === -j)) O.put(sx + i, sy + j, '#e8a040'); }
      },
    });
  },
  boudoir(ctx, r) {
    const { S } = ctx, W = S.wood;
    boudoirRoom(ctx, r, {
      niche: W[4],
      bed(Q, x, y) {
        // Le lit clos : caisse de planches, paillasse, couverture de laine à carreaux.
        Q.rect(x - 18, y - 12, 37, 13, W[2]); Q.hline(x - 18, y - 12, 37, W[1]);
        for (let i = -18; i <= 18; i += 6) Q.vline(x + i, y - 11, 12, W[3]);
        Q.rect(x - 16, y - 9, 33, 3, '#e8cc78'); Q.hline(x - 16, y - 9, 33, '#f4dc90');
        for (let j = 0; j < 4; j += 1) for (let i = -10; i <= 16; i += 1) Q.put(x + i, y - 6 + j, ((i >> 2) + j) & 1 ? '#a8402a' : '#7a2a1a');
        Q.rect(x - 15, y - 11, 6, 3, LINEN[0]);
      },
      valance(Q, x0, top, w) { for (let i = 0; i < w; i += 1) { Q.put(x0 + i, top + 1, W[1]); Q.put(x0 + i, top + 2, W[2]); Q.put(x0 + i, top + 3, W[3]); } },
      curtain(i, j, w) {
        const fold = i % 7, glow = 1 - Math.abs(i - w / 2) / (w / 2);
        return fold === 0 ? '#d8b070' : fold === 3 ? '#fff4d8' : glow > 0.6 ? '#ffe8b8' : glow > 0.25 ? '#f8d8a0' : '#ecc488';
      },
      glow: '#ffd080', drape: LINEN,
      couch(c, x, y) {
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 14, x + 14, yb + 1);
        piece(c.O, x - 14, yb - 9, 29, 10, (Q) => {
          Q.rect(x - 14, yb - 5, 29, 3, W[1]); Q.hline(x - 14, yb - 5, 29, W[0]);
          for (const lx of [-12, 11]) Q.rect(x + lx, yb - 2, 2, 3, W[3]);
          furPile(Q, x - 9, yb - 9, 19, 4, [FURG]);
        });
      },
      wall(c, x, yC) {
        // La couronne de fleurs séchées.
        for (let t = 0; t < 40; t += 1) { const a = (t / 40) * Math.PI * 2, px = x + Math.round(Math.cos(a) * 7), py = yC + 18 + Math.round(Math.sin(a) * 6); c.P.put(px, py, t % 5 === 0 ? '#e8d050' : t % 7 === 0 ? '#d86a8a' : LEAF[t % 2 + 1]); }
      },
      table(c, x, y) {
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 5, x + 5, yb + 1);
        piece(c.O, x - 5, yb - 12, 11, 13, (Q) => { Q.rect(x - 5, yb - 6, 11, 2, W[1]); for (const lx of [-4, 4]) Q.vline(x + lx, yb - 4, 5, W[3]); item(Q, 'jug', x - 3, yb - 7); item(Q, 'cup', x + 1, yb - 7); });
      },
      extra(c, x, y) { const yb = y + FOOT - 1; contactShadow(c.P, x - 6, x + 6, yb + 1); piece(c.O, x - 7, yb - 13, 15, 14, (Q) => barrel(c, Q, x, yb, 13, 6)); },
    });
  },
};

// ── LA PIERRE : les étuves ───────────────────────────────────────────────────
const PIERRE = {
  des(ctx, r) {
    const { x, y, w } = r;
    const at = w >= 190 ? [x - Math.round(w / 4), x + Math.round(w / 4)] : [x];
    at.forEach((tx, t) => {
      tableEra(ctx, tx, y, 54, {
        top: [OAK[0], OAK[1], OAK[2]], lip: [OAK[1], OAK[3]], apron: [OAK[1], OAK[2], OAK[3]], legs: 'block', panels: false, leg: [OAK[1], OAK[2], OAK[3]],
        items(Q, x0, yt) { item(Q, 'bones', x0 + 20, yt + 1); item(Q, 'tankard', x0 + 6, yt + 1); item(Q, 'tankard', x0 + 44, yt + 1); item(Q, 'coins', x0 + 32, yt + 1); },
      });
      candle(ctx, ctx.F, tx - 14, y + FOOT - 15);
      tableCrew(ctx, r, tx, 27, t * 5);
    });
  },
  cartes(ctx, r) {
    const { x, y } = r;
    tableEra(ctx, x, y, 38, {
      top: [OAK[0], OAK[1], OAK[2]], lip: [OAK[1], OAK[3]], apron: [OAK[1], OAK[2], OAK[3]], legs: 'pedestal', leg: [OAK[1], OAK[2], OAK[3]], panels: false,
      items(Q, x0, yt) { for (const [dx, c] of [[6, '#c83a3a'], [11, '#2a2a30'], [24, '#c83a3a'], [29, '#3a6ad8']]) { Q.rect(x0 + dx, yt, 3, 2, '#e8cfa0'); Q.put(x0 + dx + 1, yt, c); } },
    });
    candle(ctx, ctx.F, x, y + FOOT - 15, 5);
    tableCrew(ctx, r, x, 19, 0, true);
  },
  tickets(ctx, r) {
    const { P } = ctx, { x, y, y0, w } = r, kx = x - (w >= 150 ? 14 : 0);
    // La BLANQUE (la loterie d'alors) : les billets épinglés au tableau, l'urne voilée.
    piece(P, kx - 17, y0 + 8, 34, 22, (Q) => {
      Q.rect(kx - 17, y0 + 8, 34, 22, OAK[2]); Q.rect(kx - 15, y0 + 10, 30, 18, OAK[3]);
      for (let k = 0; k < 7; k += 1) { const bx = kx - 14 + (k % 4) * 7 + (k > 3 ? 3 : 0), by = y0 + 11 + (k > 3 ? 9 : 0); Q.rect(bx, by, 5, 7, LINEN[k % 2]); Q.hline(bx + 1, by + 2, 3, '#7a6a5a'); Q.hline(bx + 1, by + 4, 2, '#7a6a5a'); Q.put(bx + 2, by, '#c83a3a'); }
    });
    counterEra(ctx, kx, y, 42, {
      top: [OAK[0], OAK[1]], face: [OAK[1], OAK[2], OAK[3]], style: 'panel',
      items(Q, x0, yt) {
        jar(Q, x0 + 21, yt, 11, 6, CLAY, false);
        for (let i = -5; i <= 5; i += 1) Q.put(x0 + 21 + i, yt - 11 + (Math.abs(i) > 3 ? 1 : 0), Math.abs(i) > 3 ? '#a83a3a' : '#c84a4a');   // le voile
        Q.rect(x0 + 4, yt - 2, 6, 2, LINEN[0]);
      },
    });
    counterCrew(ctx, r, kx, 21);
  },
  boutique(ctx, r) {
    const { x, y, w } = r, sw = Math.min(58, w - 32);
    shelvesEra(ctx, x, y, sw, {
      wood: [OAK[1], OAK[2], OAK[3], '#2a1a10'], rows: 3, crown: 'flat',
      item(Q, ix, sy, row, i) {
        const k = h32(i, row, 5) % 4;
        if (k === 0) { jar(Q, ix + 2, sy - 1, 6, 2, ['#e8e0c8', '#c8bfa0', '#a89c7c', '#7c7058', '#5a5040'], false); return 5; }
        if (k === 1) { for (let j = 0; j < 7; j += 1) for (let t = 0; t < 4; t += 1) Q.put(ix + t, sy - 7 + j, ['#3a6ad8', '#c83a3a', '#3a9a5a'][row % 3]); Q.vline(ix, sy - 7, 7, '#ffffff'); return 6; }   // les coupons d'étoffe
        if (k === 2) { for (let j = 0; j < 5; j += 1) for (let t = 0; t < 5; t += 1) Q.put(ix + t, sy - 5 + j, j === 0 ? ['#e8a030', '#c84a2a', '#8a5a2a'][(i + row) % 3] : (t + j) % 2 ? '#c8b088' : '#a89068'); return 6; }  // les sacs d'épices
        return 3;
      },
    });
    counterEra(ctx, x, y, Math.min(46, w - 40), {
      top: [OAK[0], OAK[1]], face: [OAK[1], OAK[2], OAK[3]], style: 'panel',
      items(Q, x0, yt) {
        // La BALANCE de l'épicier : fléau, deux plateaux.
        const bx = x0 + 30;
        Q.vline(bx, yt - 10, 9, BRASS[2]); Q.hline(bx - 7, yt - 10, 15, BRASS[1]);
        for (const s of [-1, 1]) { Q.vline(bx + s * 6, yt - 9, 4, BRASS[3]); Q.hline(bx + s * 6 - 2, yt - 5, 5, BRASS[1]); }
        Q.put(bx - 6, yt - 6, '#e8a030'); Q.put(bx - 7, yt - 6, '#e8a030');
        Q.hline(bx - 2, yt - 1, 5, BRASS[2]);
      },
    });
    counterCrew(ctx, r, x, 23, true);
  },
  scene(ctx, r) {
    stageEra(ctx, r, {
      curtain: ['#7a9a5a', '#5a7a42', '#466234', '#344a26', '#24341a', '#182412'], tie: BRASS[1],
      frame: 'wood', frameRamp: [OAK[0], OAK[1], OAK[2], OAK[3]], stage: [OAK[0], OAK[1], OAK[2], OAK[3]], foot: 'candle',
      backdrop(O, x0, top, x1, bot) {
        // La TAPISSERIE au lion d'or sur champ de gueules, bordure verte.
        for (let j = top; j < bot; j += 1) for (let i = x0; i < x1; i += 1) {
          const e = Math.min(i - x0, x1 - 1 - i, j - top, bot - 1 - j);
          O.put(i, j, e < 3 ? (e === 1 ? '#e8c060' : '#466234') : (i + j * 2) % 11 === 0 ? '#9a2a2a' : '#b83232');
        }
        const cx = Math.round((x0 + x1) / 2);
        for (let j = 0; j < LION.length; j += 1) for (let i = 0; i < LION[j].length; i += 1) {
          if (LION[j][i] !== 'g') continue;
          for (let a = 0; a < 2; a += 1) for (let b = 0; b < 2; b += 1) O.put(cx - 8 + i * 2 + a, top + 6 + j * 2 + b, '#f0c850');
        }
      },
    });
  },
  boudoir(ctx, r) {
    boudoirRoom(ctx, r, {
      niche: '#3a2a22',
      bed(Q, x, y) {
        // Le lit des étuves : châlit de chêne, drap de lin, traversin.
        Q.rect(x - 18, y - 8, 37, 9, OAK[2]); Q.hline(x - 18, y - 8, 37, OAK[1]);
        Q.rect(x - 18, y - 16, 4, 9, OAK[2]); Q.hline(x - 18, y - 16, 4, OAK[0]);
        Q.rect(x - 14, y - 10, 32, 3, LINEN[0]); Q.rect(x - 13, y - 13, 8, 3, LINEN[1]);
        for (let i = -14; i <= 17; i += 1) Q.put(x + i, y - 7, i % 4 === 0 ? LINEN[3] : LINEN[2]);
      },
      valance(Q, x0, top, w) { for (let i = 0; i < w; i += 1) { Q.put(x0 + i, top + 1, OAK[1]); Q.put(x0 + i, top + 2, OAK[2]); if (i % 5 === 2) Q.put(x0 + i, top + 3, LINEN[1]); } },
      curtain(i, j, w) {
        const fold = i % 8, glow = 1 - Math.abs(i - w / 2) / (w / 2);
        return fold === 0 ? '#d8b878' : fold === 4 ? '#fff6e0' : glow > 0.6 ? '#ffecc0' : glow > 0.25 ? '#fadcaa' : '#eec890';
      },
      glow: '#ffd890', drape: LINEN,
      // LE BAQUET des étuves : cuve de chêne cerclée de fer, l'eau, la vapeur, le dais.
      couch(c, x, y) {
        const yb = y + FOOT - 1, { O, P, N } = c;
        contactShadow(P, x - 15, x + 15, yb + 1);
        piece(O, x - 15, yb - 30, 31, 31, (Q) => {
          // Le dais de lin qui tombe d'un anneau.
          for (let j = 0; j < 18; j += 1) { const hw = 2 + Math.round(j * 0.75); for (let i = -hw; i <= hw; i += 1) if (Math.abs(i) > hw - 2 || j < 3) Q.put(x + i, yb - 30 + j, (i + j) % 4 === 0 ? LINEN[2] : LINEN[1]); }
          Q.rect(x - 2, yb - 31, 5, 2, BRASS[2]);
          // La cuve.
          for (let j = 0; j < 10; j += 1) for (let i = -14; i <= 14; i += 1) {
            if (Math.abs(i) > 14 - (j > 7 ? j - 7 : 0)) continue;
            const hoop = j === 1 || j === 7;
            Q.put(x + i, yb - 9 + j, hoop ? (i < 0 ? PEWTER[1] : PEWTER[3]) : (i + 30) % 5 === 0 ? OAK[3] : i < -9 ? OAK[1] : i > 9 ? OAK[3] : OAK[2]);
          }
          for (let i = -12; i <= 12; i += 1) { Q.put(x + i, yb - 10, '#9ac8d8'); Q.put(x + i, yb - 11, i % 5 === 0 ? '#e8f4f8' : '#7ab0c8'); }
          Q.hline(x - 14, yb - 12, 29, OAK[1]);
        });
        // La vapeur, à peine.
        for (const [dx, dy] of [[-6, -15], [-5, -17], [2, -14], [3, -16], [8, -15]]) { O.put(x + dx, yb + dy, '#ffffff'); N.put(x + dx, yb + dy, '#f0f4f8'); }
      },
      wall(c, x, yC) {
        // Les linges à sécher sur la corde.
        for (let t = 0; t < 30; t += 1) c.P.put(x - 15 + t, yC + 10 + Math.round(2 * Math.sin((t / 30) * Math.PI)), OAK[3]);
        for (const [dx, cc] of [[-10, LINEN[0]], [-1, '#e8d0d8'], [8, LINEN[1]]]) for (let j = 0; j < 8; j += 1) for (let i = 0; i < 6; i += 1) c.P.put(x + dx + i, yC + 12 + j, j === 7 ? LINEN[3] : cc);
      },
      table(c, x, y) {
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 5, x + 5, yb + 1);
        piece(c.O, x - 6, yb - 13, 13, 14, (Q) => {
          Q.rect(x - 6, yb - 6, 13, 2, OAK[1]); for (const lx of [-5, 5]) Q.vline(x + lx, yb - 4, 5, OAK[3]);
          item(Q, 'jug', x - 4, yb - 7); item(Q, 'tankard', x + 1, yb - 7);
          Q.hline(x - 1, yb - 8, 3, '#d8a050');
        });
      },
      extra(c, x, y) { const yb = y + FOOT - 1; contactShadow(c.P, x - 6, x + 6, yb + 1); piece(c.O, x - 7, yb - 13, 15, 14, (Q) => barrel(c, Q, x, yb, 13, 6)); },
    });
  },
};

// ── LA COURONNE : le château ─────────────────────────────────────────────────
const COURONNE = {
  des(ctx, r) {
    const { x, y, w } = r;
    const at = w >= 190 ? [x - Math.round(w / 4), x + Math.round(w / 4)] : [x];
    at.forEach((tx, t) => {
      tableEra(ctx, tx, y, 56, {
        top: ['#3a8a5a', '#2a7048', '#225c3a'], lip: ['#2a7048', '#1a4a2e'], apron: OAK.slice(1), legs: 'block', leg: [OAK[1], OAK[2], OAK[3]],
        cloth: { ramp: ['#3a8a5a', '#2a7048', '#1a4a2e', '#123a22'], fringe: '#e8c060' },
        items(Q, x0, yt) { item(Q, 'bones', x0 + 22, yt + 1); item(Q, 'goblet', x0 + 6, yt + 1); item(Q, 'goblet', x0 + 46, yt + 1); item(Q, 'coins', x0 + 34, yt + 1); item(Q, 'coins', x0 + 13, yt + 1); },
      });
      tableCrew(ctx, r, tx, 28, t * 5);
    });
  },
  cartes(ctx, r) {
    const { x, y } = r;
    tableEra(ctx, x, y, 40, {
      top: ['#c8443a', '#a83430', '#842624'], lip: ['#a83430', '#5a1a1a'], apron: OAK.slice(1), legs: 'block', leg: [OAK[1], OAK[2], OAK[3]],
      cloth: { ramp: ['#c8443a', '#a83430', '#6a1e1e', '#4a1414'], fringe: '#e8c060' },
      items(Q, x0, yt) { for (const [dx, c] of [[6, '#c83a3a'], [11, '#2a2a30'], [26, '#c83a3a'], [31, '#2a2a30']]) { Q.rect(x0 + dx, yt, 3, 2, '#f4e8c8'); Q.put(x0 + dx + 1, yt, c); } },
    });
    // Le chandelier à trois branches, au milieu.
    const F = ctx.F, cy = y + FOOT - 15;
    F.vline(x, cy - 4, 4, BRASS[2]); F.hline(x - 4, cy - 4, 9, BRASS[1]); F.hline(x - 2, cy, 5, BRASS[2]);
    for (const dx of [-4, 0, 4]) candle(ctx, F, x + dx, cy - 5, 3);
    tableCrew(ctx, r, x, 20, 0, true);
  },
  tickets(ctx, r) {
    const { P } = ctx, { x, y, y0, w } = r, kx = x - (w >= 150 ? 14 : 0);
    // LA LOTERIE DU ROI. Au mur, le tableau couronné des BILLETS DE PARCHEMIN, scellés
    // de bleu et liserés d'or — le ticket même qu'on gratte à cet âge (TICKET_LOOK,
    // plaisirsMaterial.js) ; au guichet, la pile de billets, le coffret, l'encrier.
    // (Une roue de fortune occupait la salle : elle menait aux tickets sans en montrer
    // un — retour de Raph du 2026-10-03, « c'est pas logique ».)
    const SEAL = '#2a4a98', INKB = '#3a2a6a';
    const bw = 40, bh = 24, bx0 = kx - bw / 2, by0 = y0 + 10;
    piece(P, bx0 - 1, by0 - 7, bw + 2, bh + 8, (Q) => {
      // La couronne au fronton : trois fleurons, un rubis.
      Q.hline(kx - 6, by0 - 2, 13, BRASS[2]); Q.hline(kx - 6, by0 - 1, 13, BRASS[3]);
      for (const [dx, h] of [[-5, 3], [0, 4], [5, 3]]) for (let j = 0; j < h; j += 1) Q.put(kx + dx, by0 - 3 - j, j === h - 1 ? BRASS[0] : BRASS[1]);
      Q.put(kx, by0 - 2, '#c83a3a');
      // Le cadre de laiton (éclairé en haut à gauche), le fond de chêne.
      Q.rect(bx0, by0, bw, bh, BRASS[2]);
      Q.hline(bx0, by0, bw, BRASS[1]); Q.vline(bx0, by0, bh, BRASS[1]);
      Q.hline(bx0, by0 + bh - 1, bw, BRASS[3]); Q.vline(bx0 + bw - 1, by0, bh, BRASS[3]);
      Q.rect(bx0 + 2, by0 + 2, bw - 4, bh - 4, OAK[3]);
      // Dix billets épinglés : deux lignes d'encre, le sceau bleu, les coins dorés.
      for (let row = 0; row < 2; row += 1) for (let k = 0; k < 5; k += 1) {
        const tx = bx0 + 3 + k * 7, ty = by0 + 3 + row * 10;
        Q.rect(tx, ty, 6, 8, LINEN[0]);
        Q.vline(tx + 5, ty + 1, 7, LINEN[2]); Q.hline(tx + 1, ty + 7, 5, LINEN[2]);
        for (const [cx2, cy2] of [[tx, ty], [tx + 5, ty], [tx, ty + 7], [tx + 5, ty + 7]]) Q.put(cx2, cy2, BRASS[1]);
        Q.hline(tx + 1, ty + 2, 4, INKB); Q.hline(tx + 1, ty + 4, 3, LINEN[3]);
        Q.put(tx + 2, ty + 6, SEAL); Q.put(tx + 3, ty + 6, SEAL);
        Q.put(tx + 2, ty, BRASS[3]);                                   // l'épingle
      }
    });
    // Deux bannières fleurdelisées, de part et d'autre du tableau (si le mur les tient).
    for (const s of [-1, 1]) {
      const fx = kx + s * 30 - 4;
      if (fx < r.x0r + 4 || fx + 9 > r.x1r - 4) continue;
      piece(P, fx, y0 + 6, 9, 20, (Q) => {
        Q.hline(fx, y0 + 6, 9, BRASS[2]);                               // la tringle
        for (let j = 1; j < 19; j += 1) for (let i = 0; i < 9; i += 1) {
          if (j > 15 && Math.abs(i - 4) < j - 15) continue;            // la queue d'aronde
          Q.put(fx + i, y0 + 6 + j, i === 0 ? '#3a5ab8' : i === 8 ? '#16245a' : SEAL);
        }
        motif(Q, LYS, fx + 2, y0 + 10, BRASS[1]);
      });
    }
    counterEra(ctx, kx, y, 44, {
      top: [OAK[0], OAK[1]], face: [OAK[1], OAK[2], OAK[3]], style: 'panel',
      items(Q, x0, yt) {
        // La pile de billets, le sceau du dessus.
        for (let s = 0; s < 3; s += 1) { Q.hline(x0 + 4, yt - 1 - s, 8, s === 2 ? LINEN[0] : LINEN[2 - s]); Q.put(x0 + 11, yt - 1 - s, LINEN[3]); }
        Q.put(x0 + 8, yt - 3, SEAL);
        // Le coffret entrouvert, des billets qui dépassent.
        Q.rect(x0 + 17, yt - 4, 10, 4, OAK[2]); Q.hline(x0 + 17, yt - 4, 10, BRASS[2]); Q.vline(x0 + 26, yt - 4, 4, OAK[3]);
        for (const dx of [19, 21, 23]) { Q.vline(x0 + dx, yt - 7, 3, LINEN[0]); Q.put(x0 + dx + 1, yt - 7, LINEN[2]); }
        Q.put(x0 + 21, yt - 2, BRASS[0]);
        // L'encrier et sa plume.
        Q.rect(x0 + 33, yt - 2, 3, 2, INK); Q.put(x0 + 34, yt - 3, INK);
        for (let j = 0; j < 4; j += 1) Q.put(x0 + 35 + (j >> 1), yt - 4 - j, j === 3 ? LINEN[2] : LINEN[0]);
      },
    });
    counterCrew(ctx, r, kx, 22);
  },
  boutique(ctx, r) {
    const { x, y, w } = r, sw = Math.min(56, w - 34);
    shelvesEra(ctx, x, y, sw, {
      wood: [OAK[1], OAK[2], OAK[3], '#2a1610'], rows: 3, crown: 'arch',
      item(Q, ix, sy, row, i) {
        const k = h32(i, row, 9) % 3;
        if (k === 0) { const c = ['#c83a3a', '#3a6ad8', '#3a9a5a', '#a040c0'][(i + row) % 4]; Q.put(ix + 1, sy - 6, BRASS[2]); Q.rect(ix, sy - 5, 3, 5, c); Q.put(ix, sy - 5, '#ffffff'); return 5; }
        if (k === 1) { Q.rect(ix, sy - 4, 6, 4, OAK[2]); Q.hline(ix, sy - 4, 6, BRASS[1]); Q.put(ix + 2, sy - 2, BRASS[0]); return 7; }      // un coffret
        Q.put(ix + 1, sy - 2, BRASS[1]); Q.put(ix, sy - 1, BRASS[2]); Q.put(ix + 2, sy - 1, BRASS[2]); return 4;
      },
    });
    counterEra(ctx, x, y, Math.min(46, w - 40), {
      top: [OAK[0], OAK[1]], face: [OAK[1], OAK[2], OAK[3]], style: 'panel',
      items(Q, x0, yt) {
        // Le coffre ouvert, débordant d'or ; la couronne sur son coussin.
        Q.rect(x0 + 24, yt - 6, 14, 6, OAK[2]); Q.hline(x0 + 24, yt - 6, 14, BRASS[2]); Q.rect(x0 + 24, yt - 11, 14, 4, OAK[3]); Q.hline(x0 + 24, yt - 11, 14, BRASS[1]);
        for (let i = 0; i < 12; i += 1) Q.put(x0 + 25 + i, yt - 7 - (i % 3 === 1 ? 1 : 0), i % 2 ? BRASS[1] : BRASS[0]);
        Q.rect(x0 + 6, yt - 2, 10, 2, '#a83430');
        for (const [dx, dy] of [[7, -3], [9, -4], [11, -3], [13, -4], [15, -3], [8, -3], [10, -3], [12, -3], [14, -3]]) Q.put(x0 + dx - 1, yt + dy, BRASS[1]);
      },
    });
    counterCrew(ctx, r, x, 23, true);
  },
  scene(ctx, r) {
    stageEra(ctx, r, {
      curtain: ['#5a7ad8', '#3a5ab8', '#2a4498', '#203478', '#16245a', '#0e183e'], tie: BRASS[1],
      frame: 'wood', frameRamp: [OAK[0], OAK[1], OAK[2], OAK[3]], stage: [OAK[0], OAK[1], OAK[2], OAK[3]], foot: 'candle',
      backdrop(O, x0, top, x1, bot) {
        // La toile peinte : le château sur sa colline, le ciel du soir.
        for (let j = top; j < bot; j += 1) for (let i = x0; i < x1; i += 1) {
          const t = (j - top) / (bot - top);
          const hill = bot - 8 - Math.round(Math.sin((i - x0) * 0.05) * 3);
          O.put(i, j, j > hill ? '#4a6a3a' : t < 0.4 ? '#e8a878' : t < 0.7 ? '#f0c898' : '#f4dcb0');
        }
        const cx = Math.round((x0 + x1) / 2), base = bot - 9;
        for (const [dx, tw, th] of [[-10, 6, 14], [0, 10, 10], [10, 6, 14]]) {
          for (let j = 0; j < th; j += 1) for (let i = 0; i < tw; i += 1) O.put(cx + dx - (tw >> 1) + i, base - j, i === 0 ? '#9a8a7a' : '#7a6a5a');
          for (let i = 0; i < tw; i += 2) O.put(cx + dx - (tw >> 1) + i, base - th, '#7a6a5a');
          if (tw === 6) for (let j = 0; j < 5; j += 1) for (let i = -j; i <= j; i += 1) O.put(cx + dx + i, base - th - 5 + j, '#3a4a8a');
        }
        O.put(cx, base - 4, '#ffe9a0'); O.put(cx - 10, base - 8, '#ffe9a0'); O.put(cx + 10, base - 8, '#ffe9a0');
      },
      extra(c) {
        // Deux bannières fleurdelisées au cadre.
        const { O } = c, { x0r, x1r, y0 } = r;
        for (const bx of [x0r + 8, x1r - 16]) {
          for (let j = 0; j < 18; j += 1) for (let i = 0; i < 8; i += 1) { if (j > 14 && Math.abs(i - 3.5) < j - 14) continue; O.put(bx + i, y0 + 10 + j, i === 0 ? '#5a7ad8' : '#3a5ab8'); }
          motif(O, LYS, bx + 1, y0 + 14, BRASS[1]);
        }
      },
    });
  },
  boudoir(ctx, r) {
    boudoirRoom(ctx, r, {
      niche: '#2a1a24',
      bed(Q, x, y) {
        // Le lit à baldaquin : colonnes torses, ciel de lit, courtepointe de brocart.
        for (const px of [x - 19, x + 18]) for (let j = 0; j < 20; j += 1) Q.put(px, y - 19 + j, (j % 3 === 0) ? OAK[0] : OAK[2]);
        Q.rect(x - 17, y - 8, 35, 9, OAK[2]); Q.hline(x - 17, y - 8, 35, OAK[1]);
        Q.rect(x - 16, y - 11, 33, 4, '#a83430'); Q.hline(x - 16, y - 11, 33, '#c8443a');
        for (let i = -15; i <= 16; i += 4) Q.put(x + i, y - 9, BRASS[1]);
        Q.rect(x - 15, y - 14, 8, 3, LINEN[0]); Q.rect(x - 6, y - 14, 7, 3, LINEN[1]);
      },
      valance(Q, x0, top, w) {
        for (let i = 0; i < w; i += 1) { Q.put(x0 + i, top, '#a83430'); Q.put(x0 + i, top + 1, '#842624'); Q.put(x0 + i, top + 2, i % 2 ? BRASS[1] : BRASS[3]); if (i % 6 < 3) Q.put(x0 + i, top + 3, '#a83430'); }
      },
      curtain(i, j, w) {
        // Le brocart rouge, ses fleurs d'or, éclairé par la chandelle de derrière.
        const fold = i % 8, glow = 1 - Math.abs(i - w / 2) / (w / 2), flower = (i % 8 === 4) && (j % 9 === 4);
        if (flower) return '#ffe0a0';
        return fold === 0 ? '#c85840' : fold === 4 ? '#ffb890' : glow > 0.6 ? '#ff9c78' : glow > 0.25 ? '#f08462' : '#d86a50';
      },
      glow: '#ff9a70', drape: ['#e8584a', '#c8443a', '#a83430', '#842624', '#5a1a1a'],
      couch(c, x, y) {
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 14, x + 14, yb + 1);
        piece(c.O, x - 14, yb - 14, 29, 15, (Q) => {
          Q.rect(x - 14, yb - 14, 29, 9, OAK[2]); for (let i = -12; i <= 12; i += 6) Q.rect(x + i - 2, yb - 12, 4, 5, OAK[3]);
          Q.rect(x - 14, yb - 6, 29, 4, '#3a5ab8'); Q.hline(x - 14, yb - 6, 29, '#5a7ad8');
          for (const lx of [-13, 12]) Q.rect(x + lx, yb - 2, 2, 3, OAK[3]);
        });
      },
      wall(c, x, yC) {
        // L'écu au cœur, d'or sur gueules.
        const P = c.P;
        for (let j = 0; j < 16; j += 1) { const hw = j < 10 ? 7 : 7 - (j - 9); for (let i = -hw; i <= hw; i += 1) P.put(x + i, yC + 8 + j, Math.abs(i) === hw || j === 0 ? BRASS[2] : '#a83430'); }
        motif(P, ['.g.g.', 'ggggg', 'ggggg', '.ggg.', '..g..'], x - 2, yC + 13, BRASS[1]);
      },
      table(c, x, y) {
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 6, x + 6, yb + 1);
        piece(c.O, x - 6, yb - 13, 13, 14, (Q) => { Q.rect(x - 6, yb - 7, 13, 2, OAK[1]); Q.vline(x, yb - 5, 6, OAK[2]); Q.hline(x - 3, yb, 7, OAK[3]); item(Q, 'goblet', x - 4, yb - 8); item(Q, 'goblet', x + 2, yb - 8); });
        candle(c, c.O, x + 5, yb - 8, 3);
      },
      extra(c, x, y) {
        // La harpe.
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 5, x + 5, yb + 1);
        piece(c.O, x - 7, yb - 26, 15, 27, (Q) => {
          for (let j = 0; j < 26; j += 1) Q.put(x - 6 + Math.round(j * 0.15), yb - 25 + j, OAK[1]);
          for (let i = 0; i < 12; i += 1) Q.put(x - 6 + i, yb - 25 + Math.round(Math.sin((i / 12) * Math.PI) * 3), OAK[1]);
          for (let j = 0; j < 20; j += 1) Q.put(x + 6, yb - 20 + j, OAK[2]);
          for (let k = 1; k < 6; k += 1) for (let j = 0; j < 18 - k; j += 1) Q.put(x - 5 + k * 2, yb - 21 + k + j, '#f4ecd8');
        });
      },
    });
  },
};

// ── LE MARBRE : Rome ─────────────────────────────────────────────────────────
// Le DÉ d'ivoire vu de dessus (une face lisible), comme ceux du jeu.
function ivoryDie(Q, x, y, n) {
  Q.rect(x, y, 3, 3, '#fbf6e8'); Q.hline(x, y + 3, 3, '#c8b896');
  const pips = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]] }[n] || [[1, 1]];
  for (const [i, j] of pips) Q.put(x + i, y + j, '#2a1a14');
}
const MARBRE = {
  des(ctx, r) {
    const { x, y, w } = r;
    const at = w >= 190 ? [x - Math.round(w / 4), x + Math.round(w / 4)] : [x];
    at.forEach((tx, t) => {
      tableEra(ctx, tx, y, 54, {
        top: [MARBLE[0], MARBLE[1], MARBLE[2]], lip: [MARBLE[2], MARBLE[3]], apron: [MARBLE[1], MARBLE[2], MARBLE[3]], legs: 'lion', leg: [MARBLE[1], MARBLE[2], MARBLE[4]],
        items(Q, x0, yt) {
          ivoryDie(Q, x0 + 22, yt - 2, 3); ivoryDie(Q, x0 + 27, yt - 1, 4);
          // Le fritillus (la tour à dés) de bronze, des sesterces.
          Q.rect(x0 + 8, yt - 7, 5, 8, BRONZE[2]); Q.vline(x0 + 8, yt - 7, 8, BRONZE[1]); Q.hline(x0 + 8, yt - 7, 5, BRONZE[0]);
          item(Q, 'coins', x0 + 40, yt + 1); item(Q, 'coins', x0 + 35, yt + 1);
        },
      });
      tableCrew(ctx, r, tx, 27, t * 5);
    });
  },
  cartes(ctx, r) {
    const { x, y } = r;
    tableEra(ctx, x, y, 40, {
      top: [MARBLE[0], MARBLE[1], MARBLE[2]], lip: [MARBLE[2], MARBLE[3]], apron: [MARBLE[1], MARBLE[2], MARBLE[3]], legs: 'pedestal', leg: [MARBLE[1], MARBLE[2], MARBLE[4]], panels: false,
      items(Q, x0, yt) {
        for (const [dx, c] of [[5, '#c83a3a'], [10, '#2a2a30'], [27, '#c83a3a'], [32, '#2a2a30']]) { Q.rect(x0 + dx, yt, 3, 2, '#f4e8c8'); Q.put(x0 + dx + 1, yt, c); }
        item(Q, 'krater', x0 + 17, yt + 1);
      },
    });
    tableCrew(ctx, r, x, 20, 0, true);
  },
  tickets(ctx, r) {
    const { O, P } = ctx, { x, y, y0, w } = r, kx = x - (w >= 150 ? 14 : 0), yb = y + FOOT - 1;
    // Au mur, la tablette des tessères numérotées, sous sa guirlande de laurier.
    piece(P, kx - 18, y0 + 9, 36, 18, (Q) => {
      Q.rect(kx - 18, y0 + 9, 36, 18, MARBLE[2]); Q.rect(kx - 16, y0 + 11, 32, 14, '#3a2a22');
      for (let k = 0; k < 12; k += 1) { const tx = kx - 15 + (k % 6) * 5, ty = y0 + 12 + Math.floor(k / 6) * 6; Q.rect(tx, ty, 4, 4, BONE[1]); Q.hline(tx + 1, ty + 1, 2, '#5a3a2a'); Q.put(tx + 1, ty + 2, '#5a3a2a'); }
    });
    for (let t = 0; t < 40; t += 1) P.put(kx - 20 + t, y0 + 7 + Math.round(3 * Math.sin((t / 40) * Math.PI)), t % 3 ? LEAF[1] : LEAF[2]);
    // L'urne de bronze (hydrie) sur sa colonne.
    contactShadow(P, kx - 6, kx + 6, yb + 1);
    piece(O, kx - 9, yb - 32, 19, 33, (Q) => {
      Q.rect(kx - 4, yb - 14, 9, 15, MARBLE[1]); Q.vline(kx - 4, yb - 14, 15, MARBLE[0]); Q.vline(kx + 4, yb - 14, 15, MARBLE[3]);
      Q.hline(kx - 6, yb - 15, 13, MARBLE[0]); Q.hline(kx - 6, yb, 13, MARBLE[3]);
      jar(Q, kx, yb - 15, 16, 7, BRONZE.concat(['#4a3014']), false);
      for (const s of [-1, 1]) { Q.put(kx + s * 6, yb - 27, BRONZE[2]); Q.put(kx + s * 7, yb - 26, BRONZE[2]); Q.put(kx + s * 7, yb - 25, BRONZE[3]); }
      for (let i = -3; i <= 3; i += 2) Q.put(kx + i, yb - 22, '#2a1a14');
    });
    counterCrew(ctx, r, kx, 12);
  },
  boutique(ctx, r) {
    const { P } = ctx, { x, y, y0, w } = r;
    // Au mur, le râtelier d'amphores couchées.
    piece(P, x - 26, y0 + 10, 52, 22, (Q) => {
      for (const ry of [y0 + 18, y0 + 30]) { Q.hline(x - 26, ry, 52, OAK[2]); Q.hline(x - 26, ry + 1, 52, OAK[3]); }
      for (let row = 0; row < 2; row += 1) for (let k = 0; k < 5; k += 1) {
        const ax = x - 24 + k * 10, ay = y0 + 13 + row * 12;
        for (let i = 0; i < 9; i += 1) { const hh = i < 2 ? 1 : i > 6 ? 1 : 2; for (let j = -hh; j <= hh; j += 1) Q.put(ax + i, ay + j, j < 0 ? CLAY[0] : j > 0 ? CLAY[2] : CLAY[1]); }
      }
    });
    // Le THERMOPOLIUM : comptoir de maçonnerie plaqué de marbres, les jarres encastrées.
    counterEra(ctx, x, y, Math.min(60, w - 30), {
      top: [MARBLE[0], MARBLE[2]], face: [MARBLE[1], MARBLE[2], MARBLE[4]], style: 'marble',
      items(Q, x0, yt, cw) {
        for (let k = 0; k < 3; k += 1) { const jx = x0 + 10 + k * Math.round((cw - 20) / 2); Q.hline(jx - 3, yt, 7, '#2a1a14'); Q.hline(jx - 2, yt - 1, 5, CLAY[1]); }
        item(Q, 'cup', x0 + cw - 8, yt - 1);
      },
    });
    counterCrew(ctx, r, x, 28, true);
  },
  scene(ctx, r) {
    stageEra(ctx, r, {
      curtain: ['#b85aa8', '#9a3a8a', '#7e2a72', '#621e5a', '#461440', '#300c2c'], tie: BRASS[1],
      frame: 'marble', frameRamp: [MARBLE[0], MARBLE[1], MARBLE[3], MARBLE[4]], stage: [MARBLE[0], MARBLE[1], MARBLE[2], MARBLE[3]], foot: 'oil', metal: BRONZE[1],
      backdrop(O, x0, top, x1, bot) {
        // Le FRONT DE SCÈNE : murs peints, colonnes, niches et leurs statues, la porte royale.
        for (let j = top; j < bot; j += 1) for (let i = x0; i < x1; i += 1) O.put(i, j, j > bot - 6 ? MARBLE[2] : (j - top) % 18 < 2 ? MARBLE[3] : POMPEI[(i + j) % 13 === 0 ? 2 : 1]);
        const cx = Math.round((x0 + x1) / 2), n = 4, span = Math.round((x1 - x0) / (n + 1));
        for (let k = 1; k <= n; k += 1) {
          const px = x0 + k * span;
          for (let j = top + 2; j < bot - 5; j += 1) for (let i = -2; i <= 2; i += 1) O.put(px + i, j, i === -2 ? MARBLE[0] : i === 2 ? MARBLE[3] : (i + 2) % 2 ? MARBLE[2] : MARBLE[1]);
          O.hline(px - 3, top + 1, 7, MARBLE[0]); O.hline(px - 3, bot - 5, 7, MARBLE[3]);
        }
        for (const nx of [x0 + Math.round(span * 1.5), x1 - Math.round(span * 1.5)]) {
          for (let j = 0; j < 14; j += 1) for (let i = -4; i <= 4; i += 1) { const arc = j < 4 ? Math.sqrt(16 - (4 - j) * (4 - j)) : 4; if (Math.abs(i) <= arc) O.put(nx + i, top + 6 + j, '#3a1a1a'); }
          for (let j = 0; j < 11; j += 1) O.hline(nx - (j < 3 ? 1 : 2), top + 8 + j, j < 3 ? 2 : 4, j < 3 ? MARBLE[0] : MARBLE[1]);
        }
        for (let j = 0; j < 16; j += 1) for (let i = -5; i <= 5; i += 1) O.put(cx + i, bot - 6 - j, Math.abs(i) === 5 || j === 15 ? BRASS[2] : '#2a1a14');
      },
    });
  },
  boudoir(ctx, r) {
    boudoirRoom(ctx, r, {
      niche: POMPEI[3],
      bed(Q, x, y) {
        // Le lit maçonné du lupanar : socle enduit, matelas rayé, oreiller.
        Q.rect(x - 18, y - 7, 37, 8, MARBLE[2]); Q.hline(x - 18, y - 7, 37, MARBLE[1]); Q.hline(x - 18, y, 37, MARBLE[3]);
        Q.rect(x - 17, y - 11, 35, 4, '#e8d8b8'); for (let i = -17; i <= 17; i += 3) Q.vline(x + i, y - 11, 4, '#c8a878');
        Q.rect(x - 16, y - 14, 9, 3, LINEN[0]); Q.hline(x - 16, y - 14, 9, '#ffffff');
      },
      valance(Q, x0, top, w) { for (let i = 0; i < w; i += 1) { Q.put(x0 + i, top + 1, BRONZE[1]); Q.put(x0 + i, top + 2, BRONZE[3]); if (i % 4 === 1) Q.put(x0 + i, top + 3, BRONZE[2]); } },
      curtain(i, j, w) {
        // La laine rouge, éclairée par la lampe à huile de derrière.
        const fold = i % 7, glow = 1 - Math.abs(i - w / 2) / (w / 2);
        if (j % 16 === 15) return '#c86040';
        return fold === 0 ? '#c8503a' : fold === 3 ? '#ffb088' : glow > 0.6 ? '#ff9a70' : glow > 0.25 ? '#f07e5a' : '#d8644a';
      },
      glow: '#ff9a68', drape: POMPEI.concat(['#3a1010']),
      couch(c, x, y) {
        // Le LIT DE BANQUET (klinè) : pieds tournés de bronze, coussins.
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 15, x + 15, yb + 1);
        piece(c.O, x - 15, yb - 12, 31, 13, (Q) => {
          for (const lx of [-14, 13]) for (let j = 0; j < 7; j += 1) Q.put(x + lx, yb - 6 + j, j % 3 === 1 ? BRONZE[0] : BRONZE[2]);
          Q.rect(x - 15, yb - 8, 31, 3, OAK[1]); Q.hline(x - 15, yb - 8, 31, OAK[0]);
          Q.rect(x - 14, yb - 10, 29, 2, '#6a3aa8'); Q.hline(x - 14, yb - 10, 29, '#8a5ac8');
          Q.rect(x - 15, yb - 12, 5, 4, '#c8a050'); Q.rect(x + 10, yb - 12, 5, 4, '#c8a050');
        });
      },
      wall(c, x, yC) {
        // La fresque encadrée : une Vénus allongée, vue de loin (une silhouette, rien de plus).
        const P = c.P;
        for (let j = 0; j < 16; j += 1) for (let i = -12; i <= 12; i += 1) {
          const e = Math.min(i + 12, 12 - i, j, 15 - j);
          P.put(x + i, yC + 8 + j, e === 0 ? '#1a1010' : e === 1 ? '#e8c060' : j > 11 ? '#5a3a2a' : '#e8c8a0');
        }
        for (let i = -8; i <= 8; i += 1) P.put(x + i, yC + 18 - Math.round(Math.abs(Math.sin(i * 0.3)) * 2), '#c89070');
        P.rect(x - 9, yC + 15, 3, 3, '#c89070');
      },
      table(c, x, y) {
        // Le guéridon à trois pieds : fruits et vin.
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 6, x + 6, yb + 1);
        piece(c.O, x - 7, yb - 13, 15, 14, (Q) => {
          Q.rect(x - 6, yb - 8, 13, 2, MARBLE[1]); Q.hline(x - 6, yb - 8, 13, MARBLE[0]);
          for (let j = 0; j < 7; j += 1) { Q.put(x - 4 + (j >> 2), yb - 6 + j, BRONZE[2]); Q.put(x + 4 - (j >> 2), yb - 6 + j, BRONZE[2]); Q.put(x, yb - 6 + j, BRONZE[1]); }
          item(Q, 'fruit', x - 5, yb - 9); item(Q, 'cup', x + 2, yb - 9);
        });
      },
      extra(c, x, y) {
        // Le LAMPADAIRE de bronze (lampadarius) et sa lampe à huile.
        const yb = y + FOOT - 1, { O } = c;
        contactShadow(c.P, x - 4, x + 4, yb + 1);
        piece(O, x - 5, yb - 32, 11, 33, (Q) => {
          for (let j = 0; j < 28; j += 1) Q.put(x, yb - 27 + j, j % 6 === 0 ? BRONZE[0] : BRONZE[2]);
          for (let j = 0; j < 4; j += 1) { Q.put(x - 1 - j, yb - 3 + j, BRONZE[2]); Q.put(x + 1 + j, yb - 3 + j, BRONZE[3]); }
          Q.hline(x - 4, yb - 28, 9, BRONZE[1]); Q.hline(x - 2, yb - 29, 5, BRONZE[0]);
        });
        flame(c, O, x + 3, yb - 30, 4, 2);
      },
    });
  },
};

export { BOIS, PIERRE, COURONNE, MARBRE };
