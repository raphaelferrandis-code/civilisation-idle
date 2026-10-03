"use strict";
// ── LE MOBILIER DES ÂGES MODERNES : le Néon, les cités cosmiques ─────────────
//
// (2026-10-03, nuit.) Le NÉON est un casino des années cinquante : table de craps à
// rambarde de chrome, vingt-et-un sous sa lampe verte, rangée de BANDITS MANCHOTS
// (la loterie de l'âge), vitrine éclairée, piano-bar, revue sous un chapiteau
// d'ampoules, lit rond et cœur de néon. Les âges COSMIQUES (jade, astral, cristal)
// font flotter leurs tables sur la lumière : dés et cartes de lumière en suspens,
// globe des sorts, étagères sans montants, harpe de lumière, lit-bulle derrière un
// voile lumineux. La matière suit la cité : laque et jade, nuit et or, améthyste.
import { INK, mix, h32, piece, contactShadow, FOOT, BK, SD, FR } from './plaisirsHDKit.js';
import { tableCrew, boudoirRoom, tableEra, counterEra, shelvesEra, stageEra, item } from './plaisirsEraRooms.js';

const CHROME = ['#ffffff', '#e2e8f0', '#b4bcc6', '#7f8892', '#4e5560'];
const FELT = ['#3aa070', '#2a8a5c', '#1e6e48', '#14523a'];
const LACQ = ['#4a4a58', '#2e2e3a', '#1e1e28', '#121218'];
const PINK = ['#ffe0ee', '#ffb0d4', '#ff6fb5', '#d8408a', '#a02a66'];
const GOLD = ['#fff2b0', '#f0cf6a', '#d2a53e', '#9c7524'];

// ── LE NÉON ──────────────────────────────────────────────────────────────────
// Un BANDIT MANCHOT : coffre de chrome et laque rouge, trois rouleaux, le fronton allumé,
// la manette.
function slotMachine(ctx, x, y, k) {
  const { O, P, N } = ctx, yb = y + FOOT - 1, body = ['#c8343a', '#a02a30', '#781e24'][k % 3] ? ['#c8343a', '#3a5ab8', '#2a8a5c'][k % 3] : '#c8343a';
  contactShadow(P, x - 6, x + 6, yb + 1);
  piece(O, x - 7, yb - 30, 16, 31, (Q) => {
    Q.rect(x - 6, yb - 24, 13, 24, body); Q.vline(x - 6, yb - 24, 24, mix(body, '#ffffff', 0.3)); Q.vline(x + 6, yb - 24, 24, mix(body, '#000000', 0.35));
    // Le fronton arrondi, son néon.
    for (let i = -6; i <= 6; i += 1) { const a = Math.round(3 * Math.sqrt(1 - (i * i) / 49)); for (let j = 0; j <= a; j += 1) Q.put(x + i, yb - 25 - j, j === a ? CHROME[1] : '#fff2c8'); }
    // Les rouleaux : trois fenêtres, un 7, une cerise, une cloche.
    Q.rect(x - 5, yb - 21, 11, 7, CHROME[3]);
    for (let t = 0; t < 3; t += 1) {
      const rx = x - 4 + t * 4;
      Q.rect(rx, yb - 20, 3, 5, '#fbf6e8');
      const sym = (k + t) % 3;
      if (sym === 0) { Q.hline(rx, yb - 19, 3, '#d8404a'); Q.put(rx + 2, yb - 18, '#d8404a'); Q.put(rx + 1, yb - 17, '#d8404a'); }
      else if (sym === 1) { Q.put(rx, yb - 17, '#d8404a'); Q.put(rx + 2, yb - 17, '#d8404a'); Q.put(rx + 1, yb - 19, '#3a8a3a'); }
      else { Q.rect(rx, yb - 18, 3, 2, GOLD[1]); Q.put(rx + 1, yb - 19, GOLD[1]); }
    }
    Q.rect(x - 5, yb - 12, 11, 2, CHROME[2]);                 // la bouche à jetons
    Q.rect(x - 4, yb - 6, 9, 3, CHROME[3]); Q.hline(x - 4, yb - 6, 9, CHROME[1]);
    // La manette, à droite.
    for (let j = 0; j < 9; j += 1) Q.put(x + 8, yb - 22 + j, CHROME[2]);
    Q.rect(x + 7, yb - 24, 3, 3, '#d8404a');
  });
  for (let i = -5; i <= 5; i += 1) N.put(x + i, yb - 26, '#fff2c8');
  for (let t = 0; t < 3; t += 1) N.put(x - 3 + t * 4, yb - 18, '#fff6e0');
  O.mark(x, yb - 24, '#ffe0a0');
}
// Le PIANO À QUEUE noir, couvercle levé.
function grandPiano(ctx, x, y) {
  const { O, P } = ctx, yb = y + FOOT - 1;
  contactShadow(P, x - 16, x + 18, yb + 1);
  piece(O, x - 16, yb - 24, 35, 25, (Q) => {
    // La caisse (vue de face, la courbe à droite), le couvercle levé sur sa béquille.
    for (let i = -16; i <= 18; i += 1) { const hh = i > 6 ? Math.round(6 - (i - 6) * 0.3) : 6; for (let j = 0; j < hh; j += 1) Q.put(x + i, yb - 12 + j, j === 0 ? LACQ[0] : LACQ[2]); }
    for (let t = 0; t < 30; t += 1) { const lx = x - 14 + t, ly = yb - 13 - Math.round(t * 0.35); Q.put(lx, ly, LACQ[0]); Q.put(lx, ly + 1, LACQ[1]); }
    Q.vline(x + 8, yb - 19, 6, CHROME[2]);
    // Le clavier, à gauche.
    Q.rect(x - 16, yb - 9, 8, 2, '#fbf6e8'); for (let i = 0; i < 8; i += 2) Q.put(x - 16 + i, yb - 9, INK);
    // Les pieds, le pupitre.
    for (const lx of [-14, 2, 15]) Q.rect(x + lx, yb - 6, 2, 7, LACQ[1]);
    Q.rect(x - 10, yb - 16, 6, 3, LACQ[1]);
  });
}
const NEON = {
  des(ctx, r) {
    const { x, y, w } = r;
    const at = w >= 190 ? [x - Math.round(w / 4), x + Math.round(w / 4)] : [x];
    at.forEach((tx, t) => {
      // LA TABLE DE CRAPS : rambarde de chrome, tapis vert aux lignes jaunes, dés rouges.
      tableEra(ctx, tx, y, 64, {
        top: [FELT[1], FELT[1], FELT[2]], lip: [CHROME[1], CHROME[3]], apron: ['#7a3a2a', '#5a2a1e', '#3a1a12'], legs: 'block', leg: LACQ.slice(1), h: 16,
        items(Q, x0, yt, ww) {
          for (let i = 6; i < ww - 6; i += 1) { if (i % 2) Q.put(x0 + i, yt + 1, '#f0d050'); }
          for (const dx of [14, ww - 18]) { Q.vline(x0 + dx, yt, 3, '#f0d050'); }
          Q.rect(x0 + 28, yt, 2, 2, '#d8404a'); Q.put(x0 + 28, yt, '#ffffff'); Q.rect(x0 + 32, yt + 1, 2, 2, '#d8404a'); Q.put(x0 + 33, yt + 1, '#ffffff');
          item(Q, 'chips', x0 + 6, yt + 1); item(Q, 'chips', x0 + ww - 10, yt + 1);
          Q.hline(x0, yt - 1, ww, CHROME[0]);
        },
      });
      tableCrew(ctx, r, tx, 32, t * 5);
    });
  },
  cartes(ctx, r) {
    const { x, y, y0, P, N } = { ...r, ...ctx };
    // La LAMPE VERTE basse, pendue au-dessus de la table.
    P.vline(x, y0, 18, CHROME[3]);
    for (let j = 0; j < 4; j += 1) for (let i = -6 - j; i <= 6 + j; i += 1) P.put(x + i, y0 + 18 + j, j === 3 ? '#fff2c8' : j === 0 ? '#3a9a5a' : '#2a7a48');
    for (let i = -8; i <= 8; i += 1) N.put(x + i, y0 + 21, '#fff2c8');
    P.mark(x, y0 + 24, '#fff0c0');
    tableEra(ctx, x, y, 46, {
      top: [FELT[1], FELT[1], FELT[2]], lip: [CHROME[1], CHROME[3]], apron: ['#7a3a2a', '#5a2a1e', '#3a1a12'], legs: 'chrome',
      items(Q, x0, yt, ww) {
        for (let i = 0; i < 12; i += 1) Q.put(x0 + 17 + i, yt, ['#d8404a', '#3a6ad8', '#3a9a5a', '#f0cf6a'][i % 4]);
        for (const [dx, red] of [[5, 1], [11, 0], [ww - 14, 1], [ww - 8, 0]]) { Q.rect(x0 + dx, yt + 1, 2, 2, '#fbf6e8'); Q.put(x0 + dx + 1, yt + 1, red ? '#d8404a' : INK); }
      },
    });
    tableCrew(ctx, r, x, 23, 0, true);
  },
  tickets(ctx, r) {
    const { fig } = ctx, { x, y, w, on, v } = r;
    // La rangée de BANDITS MANCHOTS (la loterie du casino).
    const n = Math.max(2, Math.min(5, Math.floor((w - 30) / 20))), x0 = x - Math.round(((n - 1) * 20) / 2);
    for (let k = 0; k < n; k += 1) slotMachine(ctx, x0 + k * 20, y, k);
    if (!on) return;
    // Les joueurs AUX BOUTS de la rangée (devant, ils cachaient les rouleaux).
    fig(x0 - 17, y + SD, 0, 0, v(0), { role: 'joueur' });
    fig(x0 + (n - 1) * 20 + 17, y + SD, 2, 'g', v(1));
    if (w >= 150) fig(x0 - 34, y + SD, 0, 1, v(2));
  },
  boutique(ctx, r) {
    const { x, y, w, y0 } = r, { P, N } = ctx, sw = Math.min(58, w - 32);
    // L'enseigne au néon BOUTIQUE n'existe pas : un cœur et une étoile au néon suffisent.
    shelvesEra(ctx, x, y, sw, {
      wood: [CHROME[1], CHROME[3], CHROME[4], '#2a1424'], rows: 3, crown: 'flat',
      item(Q, ix, sy, row, i) {
        const k = h32(i, row, 2) % 3;
        if (k === 0) { const c = ['#ff6fb5', '#f0cf6a', '#7ab8e0'][(i + row) % 3]; Q.put(ix + 1, sy - 6, GOLD[1]); Q.rect(ix, sy - 5, 3, 5, c); Q.put(ix, sy - 5, '#ffffff'); return 5; }   // les parfums
        if (k === 1) { Q.rect(ix, sy - 4, 6, 4, ['#ff6fb5', '#3a6ad8', '#f0cf6a'][row % 3]); Q.vline(ix + 3, sy - 4, 4, GOLD[1]); Q.hline(ix, sy - 2, 6, GOLD[1]); return 7; }       // les paquets
        return 3;
      },
    });
    for (let j = 0; j < 6; j += 1) for (let i = -3; i <= 3; i += 1) if (['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'][j][i + 3] === '#') { P.put(x + sw / 2 + 8 + i, y0 + 12 + j, PINK[2]); N.put(x + sw / 2 + 8 + i, y0 + 12 + j, PINK[1]); }
    counterEra(ctx, x, y, Math.min(48, w - 40), { top: [CHROME[1], CHROME[3]], face: [CHROME[2], CHROME[3], CHROME[4]], style: 'glass' });
    const { fig } = ctx;
    if (r.on) {
      fig(x - 3, y + BK, 0, 'g', r.v(0), { back: true, role: 'marchande' });
      fig(x + 34, y + SD, 2, 1, r.v(1));
    }
  },
  scene(ctx, r) {
    stageEra(ctx, r, {
      curtain: PINK.concat(['#701a48']), tie: GOLD[1],
      frame: 'chrome', frameRamp: [CHROME[1], CHROME[2], CHROME[3], CHROME[4]], stage: [LACQ[0], LACQ[1], LACQ[2], LACQ[3]], foot: 'bulb',
      backdrop(O, x0, top, x1, bot) {
        // Le grand escalier de la revue sous un ciel d'étoiles.
        for (let j = top; j < bot; j += 1) for (let i = x0; i < x1; i += 1) O.put(i, j, (h32(i, j, 3) % 61 === 0) ? '#fff2c8' : j - top < (bot - top) * 0.5 ? '#2a1a4a' : '#3a1e5a');
        const cx = Math.round((x0 + x1) / 2);
        for (let s = 0; s < 7; s += 1) { const sw = 14 + s * 6, sy = top + 10 + s * 3; O.hline(cx - (sw >> 1), sy, sw, '#ffe0ee'); O.hline(cx - (sw >> 1), sy + 1, sw, '#c87aa8'); O.hline(cx - (sw >> 1), sy + 2, sw, '#8a3a6a'); }
      },
      extra(c, plat) {
        // Les cônes des projecteurs (tramés), du cintre vers l'estrade.
        const { x, x0r, x1r, y0 } = r;
        for (const sx of [x - 30, x + 30]) for (let j = y0 + 8; j < plat - 2; j += 1) {
          const half = (j - y0) * 0.35;
          for (let i = -Math.round(half); i <= Math.round(half); i += 1) if ((i + j) % 2 === 0 && Math.abs(sx + i - x) < (x1r - x0r) / 2 - 8) c.O.put(sx + i, j, mix(c.O.get(sx + i, j) || '#2a1a4a', '#fff4d8', 0.25));
        }
      },
    });
  },
  salon(ctx, r) {
    const { fig, P, N } = ctx, { x, y, w, y0 } = r;
    const px = x - Math.round(w / 4), bx = x + Math.round(w / 4);
    grandPiano(ctx, px, y);
    // Le mur de bouteilles éclairé par-derrière, l'enseigne BAR au néon.
    piece(P, bx - 24, y0 + 8, 48, 26, (Q) => {
      Q.rect(bx - 24, y0 + 8, 48, 26, '#3a1a2a');
      for (const sy of [y0 + 17, y0 + 26, y0 + 33]) Q.hline(bx - 22, sy, 44, CHROME[2]);
      for (let row = 0; row < 3; row += 1) for (let i = 0; i < 10; i += 1) { const c = ['#7ab8e0', '#f0cf6a', '#c8434a', '#3a9a5a'][(i + row) % 4]; Q.rect(bx - 21 + i * 4, (row === 0 ? y0 + 12 : row === 1 ? y0 + 21 : y0 + 29), 2, 4 + (i % 2), c); }
    });
    for (let i = bx - 22; i < bx + 22; i += 1) N.put(i, y0 + 16, '#ffd0e8');
    const BAR = [['###.', '#..#', '###.', '#..#', '###.'], ['.##.', '#..#', '####', '#..#', '#..#'], ['###.', '#..#', '###.', '#.#.', '#..#']];
    BAR.forEach((g, k) => g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { P.put(bx - 8 + k * 6 + i, y0 + 2 + j, PINK[2]); N.put(bx - 8 + k * 6 + i, y0 + 2 + j, PINK[1]); } })));
    P.mark(bx, y0 + 4, PINK[2]);
    counterEra(ctx, bx, y, 48, {
      top: [CHROME[1], CHROME[3]], face: ['#7a3a2a', '#5a2a1e', '#3a1a12'], style: 'panel',
      items(Q, x0, yt) { item(Q, 'martini', x0 + 8, yt - 1); item(Q, 'martini', x0 + 34, yt - 1); },
    });
    fig(bx, y + BK, 0, 0, r.v(0), { back: true, role: 'barman' });
    fig(px - 8, y + SD, 1, 0, r.v(1), { role: 'pianiste' });
    fig(px + 24, y + SD, 2, 'g', r.v(3));
    fig(bx + 30, y + SD, 2, 1, r.v(2));
  },
  boudoir(ctx, r) {
    boudoirRoom(ctx, r, {
      niche: '#3a1030',
      bed(Q, x, y) {
        // Le lit rond de satin rose, la tête de lit en cœur capitonné.
        for (let j = 0; j < 14; j += 1) for (let i = -14; i <= 14; i += 1) {
          const hx = Math.abs(i) - 7, inH = (j < 7 && hx * hx + (j - 4) * (j - 4) < 50) || (j >= 7 && Math.abs(i) <= 14 - (j - 7) * 2);
          if (inH) Q.put(x + i, y - 22 + j, (i + j) % 5 === 0 ? PINK[4] : PINK[3]);
        }
        for (let j = 0; j < 9; j += 1) for (let i = -18; i <= 18; i += 1) {
          if ((i * i) / 324 + ((j - 4) * (j - 4)) / 20 > 1) continue;
          Q.put(x + i, y - 9 + j, j < 3 ? PINK[1] : j < 6 ? PINK[2] : PINK[3]);
        }
        Q.rect(x - 12, y - 11, 7, 3, '#ffffff'); Q.rect(x + 5, y - 11, 7, 3, PINK[0]);
      },
      valance(Q, x0, top, w) { for (let i = 0; i < w; i += 1) { Q.put(x0 + i, top + 1, CHROME[2]); Q.put(x0 + i, top + 2, PINK[2]); if (i % 3 === 0) Q.put(x0 + i, top + 3, '#fff2c8'); } },
      curtain(i, j, w) {
        // Le satin rose, ses paillettes, éclairé par-derrière.
        const fold = i % 6, glow = 1 - Math.abs(i - w / 2) / (w / 2);
        if (h32(i, j, 17) % 23 === 0) return '#ffffff';
        return fold === 0 ? '#e870a8' : fold === 3 ? '#ffd8ea' : glow > 0.6 ? '#ffc0dc' : glow > 0.25 ? '#ffa8cc' : '#f890bc';
      },
      glow: '#ff9ac8', drape: [PINK[1], PINK[2], PINK[3], PINK[4], '#701a48'],
      couch(c, x, y) {
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 14, x + 14, yb + 1);
        piece(c.O, x - 14, yb - 13, 29, 14, (Q) => {
          for (let j = 0; j < 7; j += 1) for (let i = -14; i <= -8 + j; i += 1) Q.put(x + i, yb - 13 + j, i === -14 ? PINK[1] : PINK[3]);
          Q.rect(x - 14, yb - 6, 29, 4, PINK[2]); Q.hline(x - 14, yb - 6, 29, PINK[1]);
          for (const lx of [-13, 12]) Q.rect(x + lx, yb - 2, 2, 3, CHROME[2]);
        });
      },
      wall(c, x, yC) {
        // Le CŒUR DE NÉON.
        const H = ['.##...##.', '#..#.#..#', '#...#...#', '.#.....#.', '..#...#..', '...#.#...', '....#....'];
        H.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { c.P.put(x - 4 + i, yC + 12 + j, PINK[2]); c.N.put(x - 4 + i, yC + 12 + j, PINK[1]); } }));
        c.P.mark(x, yC + 15, PINK[2]);
      },
      table(c, x, y) {
        const yb = y + FOOT - 1;
        contactShadow(c.P, x - 5, x + 5, yb + 1);
        piece(c.O, x - 6, yb - 13, 13, 14, (Q) => { Q.hline(x - 6, yb - 7, 13, CHROME[1]); Q.vline(x, yb - 6, 6, CHROME[2]); Q.hline(x - 3, yb, 7, CHROME[3]); item(Q, 'martini', x - 2, yb - 8); });
      },
      extra(c, x, y) {
        // La boule à facettes, pendue.
        const { P, N } = c, cy = y - 40;
        P.vline(x, cy - 8, 6, CHROME[3]);
        for (let j = -3; j <= 3; j += 1) for (let i = -3; i <= 3; i += 1) if (i * i + j * j <= 10) { const col = (i + j + 8) % 3 === 0 ? '#ffffff' : (i + j) & 1 ? CHROME[2] : CHROME[3]; P.put(x + i, cy + j, col); if (col === '#ffffff') N.put(x + i, cy + j, '#ffffff'); }
      },
    });
  },
};

// ── LES CITÉS COSMIQUES ──────────────────────────────────────────────────────
// La matière de la cité : un fût (tables, socles), un accent (lisérés), la lumière.
function cosmicMat(S) {
  if (S.cosmo === 'jade') return { body: ['#c8f0d8', '#96d6b2', '#62b08a', '#3e8466'], trim: ['#d0503a', '#a8322a', '#7a2220'], glass: ['#e6fff2', '#b8f0d4'] };
  if (S.cosmo === 'astral') return { body: ['#fbf6f8', '#efe4ee', '#dccfe0', '#bfb0c8'], trim: ['#ffe9a0', '#e0b040', '#9c7524'], glass: ['#fff8e0', '#ffe9b0'] };
  return { body: ['#faf8fe', '#eee8f8', '#ddd2f0', '#c4b6e2'], trim: ['#c4a4f4', '#9a6ee0', '#6c44b4'], glass: ['#f8f0ff', '#e2d0ff'] };
}
// Un DÉ de lumière qui flotte : un cube vu de dessus, cerné de lumière.
function lightDie(ctx, L, x, y, glow) {
  L.rect(x, y, 3, 3, '#ffffff'); L.hline(x, y + 3, 3, glow); L.put(x + 1, y + 1, mix(glow, INK, 0.4));
  ctx.N.rect(x, y, 3, 4, glow);
}
const COSMIC = {
  des(ctx, r) {
    const { S } = ctx, M = cosmicMat(S), { x, y, w } = r;
    const at = w >= 190 ? [x - Math.round(w / 4), x + Math.round(w / 4)] : [x];
    at.forEach((tx, t) => {
      tableEra(ctx, tx, y, 58, {
        top: [M.glass[0], M.glass[1], M.body[1]], lip: [M.trim[0], M.trim[1]], apron: M.body, legs: 'float', glow: S.glow,
        items() {},
      });
      // Les dés de lumière, en suspens au-dessus du plateau.
      lightDie(ctx, ctx.F, tx - 4, y + FOOT - 22, S.glow); lightDie(ctx, ctx.F, tx + 3, y + FOOT - 20, S.glow);
      ctx.F.mark(tx, y + FOOT - 20, S.glow);
      tableCrew(ctx, r, tx, 29, t * 5);
    });
  },
  cartes(ctx, r) {
    const { S, F, N } = ctx, M = cosmicMat(S), { x, y } = r;
    tableEra(ctx, x, y, 44, { top: [M.glass[0], M.glass[1], M.body[1]], lip: [M.trim[0], M.trim[1]], apron: M.body, legs: 'float', glow: S.glow, items() {} });
    // Les cartes de cristal, debout dans l'air, en éventail.
    for (let k = 0; k < 5; k += 1) {
      const cx = x - 10 + k * 5, cy = y + FOOT - 25 + Math.abs(k - 2);
      F.rect(cx, cy, 4, 6, M.glass[0]); F.vline(cx, cy, 6, '#ffffff'); F.hline(cx, cy + 5, 4, S.glow2); F.put(cx + 2, cy + 2, k % 2 ? '#d8404a' : INK);
      N.rect(cx, cy, 4, 6, M.glass[1]);
    }
    F.mark(x, y + FOOT - 22, S.glow);
    tableCrew(ctx, r, x, 22, 0, true);
  },
  tickets(ctx, r) {
    const { S, O, N, P } = ctx, M = cosmicMat(S), { x, y, w } = r, kx = x - (w >= 150 ? 14 : 0), yb = y + FOOT - 1;
    // Le GLOBE DES SORTS : une sphère de lumière sur un socle, les boules en orbite.
    contactShadow(P, kx - 7, kx + 7, yb + 1);
    piece(O, kx - 8, yb - 12, 17, 13, (Q) => {
      for (let j = 0; j < 12; j += 1) { const hw = 3 + (j > 8 ? j - 8 : 0); for (let i = -hw; i <= hw; i += 1) Q.put(kx + i, yb - 11 + j, i < -1 ? M.body[0] : i > 1 ? M.body[3] : M.body[1]); }
      Q.hline(kx - 5, yb - 12, 11, M.trim[0]);
    });
    const cy = yb - 26;
    const { F } = ctx;
    for (let j = -11; j <= 11; j += 1) for (let i = -11; i <= 11; i += 1) {
      const d = Math.sqrt(i * i + j * j);
      if (d > 11) continue;
      const c = d > 10 ? S.glow2 : d > 9 ? S.glow : null;
      if (c) { F.put(kx + i, cy + j, c); N.put(kx + i, cy + j, c); }
    }
    for (const [a, rr, c] of [[0.3, 6, '#ffffff'], [1.9, 7, '#d8404a'], [3.6, 5, '#ffe9a0'], [4.8, 7, '#7ab8e0'], [5.6, 4, '#ffffff']]) {
      const bx = kx + Math.round(Math.cos(a) * rr), by = cy + Math.round(Math.sin(a) * rr * 0.7);
      F.rect(bx, by, 2, 2, c); N.rect(bx, by, 2, 2, c);
    }
    O.mark(kx, cy, S.glow);
    const { fig } = ctx;
    if (r.on) {
      fig(kx - 1, y + BK, 0, 0, r.v(0), { back: true, role: 'guichetier' });
      fig(kx - 22, y + SD, 0, 1, r.v(1));
      fig(kx + 24, y + SD, 2, 'g', r.v(2));
    }
  },
  boutique(ctx, r) {
    const { S, O, N } = ctx, M = cosmicMat(S), { x, y, w } = r, sw = Math.min(60, w - 30);
    // Les étagères sans montants : trois plans de lumière, les objets qui flottent dessus.
    for (let row = 0; row < 3; row += 1) {
      const sy = y - 14 - row * 11;
      for (let i = -sw / 2; i < sw / 2; i += 1) { O.put(x + i, sy, S.glow); N.put(x + i, sy, S.glow); O.put(x + i, sy + 1, mix(S.glow2, INK, 0.2)); }
      for (let k = 0; k < 6; k += 1) {
        const ix = Math.round(x - sw / 2 + 5 + k * ((sw - 10) / 6)), kind = h32(k, row, 4) % 3;
        if (kind === 0) { O.rect(ix, sy - 5, 3, 4, M.glass[0]); O.put(ix + 1, sy - 6, M.trim[0]); }
        else if (kind === 1) { for (let j = 0; j < 4; j += 1) for (let i = -j; i <= j; i += 1) O.put(ix + 1 + i, sy - 5 + j, j === 3 ? M.trim[1] : M.trim[0]); }
        else { O.rect(ix, sy - 3, 4, 2, M.body[1]); O.hline(ix, sy - 3, 4, '#ffffff'); }
      }
    }
    O.mark(x, y - 30, S.glow);
    counterEra(ctx, x, y, Math.min(46, w - 40), { top: [M.glass[0], S.glow], face: [M.body[0], M.body[1], M.body[2]], style: 'light' });
    const { fig } = ctx;
    if (r.on) {
      fig(x - 3, y + BK, 0, 'g', r.v(0), { back: true, role: 'marchande' });
      fig(x + 32, y + SD, 2, 1, r.v(1));
    }
  },
  scene(ctx, r) {
    const { S } = ctx, M = cosmicMat(S);
    stageEra(ctx, r, {
      curtain: [mix(S.glow, '#ffffff', 0.5), S.glow, S.glow2, mix(S.glow2, INK, 0.3), mix(S.glow2, INK, 0.55), mix(S.glow2, INK, 0.7)], tie: M.trim[0],
      frame: 'light', frameRamp: [M.body[0], M.body[1], M.body[2], M.body[3]], stage: [M.body[0], M.body[1], M.body[2], M.body[3]], foot: 'orb', glow: S.glow,
      backdrop(O, x0, top, x1, bot) {
        // L'aurore sur la nuit : des voiles de lumière ondulés.
        for (let j = top; j < bot; j += 1) for (let i = x0; i < x1; i += 1) {
          const t = (j - top) / (bot - top), wave = Math.sin((i - x0) * 0.08 + t * 3) * 0.12;
          const a = Math.max(0, 0.5 - Math.abs(t - 0.4 - wave) * 2.2);
          let c = mix('#141838', S.glow, a);
          if (h32(i, j, 7) % 71 === 0 && t < 0.35) c = '#ffffff';
          O.put(i, j, c);
        }
      },
    });
  },
  salon(ctx, r) {
    const { S, O, N, P, fig } = ctx, M = cosmicMat(S), { x, y, w, y0 } = r;
    const px = x - Math.round(w / 4), bx = x + Math.round(w / 4), yb = y + FOOT - 1;
    // La HARPE DE LUMIÈRE : un arc de cristal, des cordes de lumière.
    contactShadow(P, px - 8, px + 8, yb + 1);
    piece(O, px - 10, yb - 34, 21, 35, (Q) => {
      for (let j = 0; j < 32; j += 1) Q.put(px - 9 + Math.round(Math.sin((j / 32) * Math.PI) * 4), yb - 31 + j, M.trim[0]);
      for (let i = 0; i < 18; i += 1) Q.put(px - 8 + i, yb - 32 + Math.round(Math.sin((i / 18) * Math.PI) * 3), M.trim[1]);
      Q.rect(px - 6, yb - 2, 14, 3, M.body[1]);
    });
    for (let k = 0; k < 6; k += 1) for (let j = 0; j < 26 - k * 2; j += 1) { O.put(px - 4 + k * 2, yb - 28 + k + j, S.glow); N.put(px - 4 + k * 2, yb - 28 + k + j, S.glow); }
    O.mark(px, yb - 16, S.glow);
    // Le bar : bouteilles de lumière sur un plan suspendu.
    for (let i = bx - 22; i < bx + 22; i += 1) { P.put(i, y0 + 20, S.glow); N.put(i, y0 + 20, S.glow); }
    for (let k = 0; k < 9; k += 1) { const c = [S.glow, '#ffffff', M.trim[0]][k % 3]; P.rect(bx - 20 + k * 5, y0 + 14, 2, 6, c); N.rect(bx - 20 + k * 5, y0 + 14, 2, 6, c); }
    counterEra(ctx, bx, y, 48, { top: [M.glass[0], S.glow], face: [M.body[0], M.body[1], M.body[2]], style: 'light' });
    fig(bx, y + BK, 0, 0, r.v(0), { back: true, role: 'barman' });
    fig(px + 14, y + SD, 2, 'g', r.v(3), { role: 'harpiste' });
    fig(bx + 30, y + SD, 2, 1, r.v(2));
  },
  boudoir(ctx, r) {
    const { S } = ctx, M = cosmicMat(S);
    boudoirRoom(ctx, r, {
      niche: mix(S.glow2, INK, 0.75),
      bed(Q, x, y) {
        // Le LIT-BULLE : une coque ovale qui flotte, ses coussins.
        for (let j = 0; j < 12; j += 1) for (let i = -18; i <= 18; i += 1) {
          if ((i * i) / 324 + ((j - 6) * (j - 6)) / 36 > 1) continue;
          Q.put(x + i, y - 14 + j, j < 4 ? M.body[0] : j < 8 ? M.body[1] : M.body[2]);
        }
        Q.rect(x - 13, y - 13, 8, 3, '#ffffff'); Q.rect(x + 4, y - 13, 8, 3, M.glass[1]);
        for (let i = -12; i <= 12; i += 1) Q.put(x + i, y - 2, S.glow);
      },
      valance(Q, x0, top, w) { for (let i = 0; i < w; i += 1) { Q.put(x0 + i, top + 1, M.trim[1]); Q.put(x0 + i, top + 2, S.glow); } },
      curtain(i, j, w) {
        // Le VOILE DE LUMIÈRE : la couleur de la cité, plus claire au milieu.
        const glow = 1 - Math.abs(i - w / 2) / (w / 2), fold = i % 9;
        return fold === 0 ? mix(S.glow, '#ffffff', 0.25) : glow > 0.6 ? mix(S.glow, '#ffffff', 0.65) : glow > 0.25 ? mix(S.glow, '#ffffff', 0.45) : mix(S.glow, '#ffffff', 0.25);
      },
      glow: S.glow, drape: [mix(S.glow, '#ffffff', 0.5), S.glow, S.glow2, mix(S.glow2, INK, 0.3), mix(S.glow2, INK, 0.55)],
      couch(c, x, y) {
        const yb = y + FOOT - 1;
        for (let i = -13; i <= 13; i += 1) c.P.put(x + i, yb, mix(c.P.get(x + i, yb), S.glow, 0.4));
        piece(c.O, x - 14, yb - 10, 29, 8, (Q) => {
          for (let j = 0; j < 7; j += 1) for (let i = -14; i <= 14; i += 1) if ((i * i) / 196 + ((j - 3) * (j - 3)) / 12 <= 1) Q.put(x + i, yb - 10 + j, j < 3 ? M.body[0] : M.body[2]);
        });
      },
      wall(c, x, yC) {
        // Un cœur de lumière.
        const H = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
        H.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { c.P.put(x - 3 + i, yC + 12 + j, S.glow); c.N.put(x - 3 + i, yC + 12 + j, S.glow); } }));
        c.P.mark(x, yC + 15, S.glow);
      },
      table(c, x, y) {
        const yb = y + FOOT - 1;
        for (let i = -5; i <= 5; i += 1) c.P.put(x + i, yb, mix(c.P.get(x + i, yb), S.glow, 0.4));
        piece(c.O, x - 6, yb - 12, 13, 6, (Q) => { Q.hline(x - 6, yb - 8, 13, M.glass[0]); Q.hline(x - 5, yb - 7, 11, S.glow); item(Q, 'martini', x - 2, yb - 9); });
      },
    });
  },
};

export { NEON, COSMIC };
void FR;
