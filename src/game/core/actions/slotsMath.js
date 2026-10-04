"use strict";

// LES MATHÉMATIQUES DE LA MACHINE À SOUS (v2, 2026-10-03 : « 5 rouleaux, joker et Hold &
// Win »). Pur : aucune dépendance au jeu — le moteur (slots.js), le test et l'outil de
// calibrage s'en servent tels quels.
//
// Une vraie machine : CINQ rouleaux figés, TROIS rangées, VINGT lignes. Une ligne paie le
// plus long alignement depuis la GAUCHE (3, 4 ou 5) d'un même symbole, le JOKER le
// remplaçant (il n'est que sur les rouleaux du milieu, comme sur les vraies machines : il
// ne paie jamais seul). Trois déclencheurs comptés N'IMPORTE OÙ dans la fenêtre : les
// ÉTOILES (tours gratuits), les ROUES (la roue), les PIÈCES (le Hold & Win, dès 6).
//
// LE RTP SE CALCULE, IL NE SE SAISIT PAS. 32⁵ arrêts ne s'énumèrent plus (33 millions),
// mais tout se décompose :
//   · chaque rangée d'un rouleau voit la bande entière, uniformément : une LIGNE a donc
//     la même loi quelle qu'elle soit, et ses cinq cases sont indépendantes (un rouleau
//     par case). Son espérance s'énumère sur 10⁵ combinaisons de symboles pondérées —
//     exacte —, et la somme des vingt lignes est vingt fois celle d'une (linéarité) ;
//   · les comptes d'étoiles / de roues / de pièces d'un rouleau se lisent sur ses arrêts,
//     et les rouleaux sont indépendants : la loi du total est une convolution ;
//   · le Hold & Win est une chaîne de Markov (pièces, relances) : programmation dynamique.
// Les bonus se répondent (une roue offre des tours, les tours relancent la roue et le
// Hold & Win) : une équation linéaire les résout. Le GRAND (la cagnotte) est un transfert,
// il n'entre pas dans le RTP de référence (seule l'ENTRÉE de la cagnotte compte).

export const SLOT_ROWS = 3;

// La fenêtre : grid[rouleau][rangée], la rangée 1 étant celle de l'arrêt.
export function windowOf(reels, stops) {
  return reels.map((reel, r) => [0, 1, 2].map((row) => reel[(stops[r] + row - 1 + reel.length) % reel.length]));
}

// Ce que paie une ligne (ses cinq symboles, de gauche à droite).
export function lineWin(syms, pay, wild) {
  const s0 = syms[0];
  if (!pay[s0]) return null;                           // le premier rouleau n'a pas de joker
  let n = 1;
  while (n < syms.length && (syms[n] === s0 || syms[n] === wild)) n += 1;
  const p = pay[s0][n] || 0;
  return p > 0 ? { symbol: s0, count: n, pay: p } : null;
}

// Ce que paie une fenêtre : lignes gagnantes (× la mise), et les trois déclencheurs.
export function evaluate(grid, cfg) {
  const lines = [];
  let pay = 0;
  cfg.lines.forEach((ln, i) => {
    const w = lineWin(ln.map((row, r) => grid[r][row]), cfg.pay, cfg.wild);
    if (w) { lines.push({ line: i, ...w }); pay += w.pay; }
  });
  let stars = 0, wheels = 0, coins = 0;
  const coinCells = [];
  grid.forEach((col, r) => col.forEach((s, row) => {
    if (s === cfg.scatter) stars += 1;
    else if (s === cfg.bonus) wheels += 1;
    else if (s === cfg.coin) { coins += 1; coinCells.push(r * SLOT_ROWS + row); }
  }));
  return {
    lines, pay, stars, wheels, coins, coinCells,
    freeSpins: cfg.freeSpins[Math.min(stars, cfg.reels.length)] || 0,
    wheel: wheels >= cfg.wheelAt,
    holdWin: coins >= cfg.hw.trigger
  };
}

// ── LE HOLD & WIN ────────────────────────────────────────────────────────────────
// Les valeurs des pièces : { v (× la mise), w (poids), jp ('mini' | 'majeur') }.
export function coinMean(hw) {
  const tot = hw.values.reduce((s, c) => s + c.w, 0);
  return hw.values.reduce((s, c) => s + c.v * c.w, 0) / tot;
}
// Espérance du nombre FINAL de pièces partant de k pièces (relances pleines), et la
// probabilité de remplir la grille (le GRAND). Chaque case vide reçoit une pièce avec la
// probabilité `pNew` à chaque relance ; une nouvelle pièce recharge les relances.
export function hwOutlook(k0, hw, cells = 15) {
  const memo = new Map();
  const binom = (n, k) => { let c = 1; for (let i = 0; i < k; i += 1) c = (c * (n - i)) / (i + 1); return c; };
  const go = (k, r) => {
    if (k >= cells) return { coins: cells, full: 1 };
    if (r <= 0) return { coins: k, full: 0 };
    const key = k * 10 + r;
    if (memo.has(key)) return memo.get(key);
    const m = cells - k, p = hw.pNew;
    let coins = 0, full = 0;
    for (let j = 0; j <= m; j += 1) {
      const pj = binom(m, j) * p ** j * (1 - p) ** (m - j);
      const nx = j > 0 ? go(k + j, hw.respins) : go(k, r - 1);
      coins += pj * nx.coins; full += pj * nx.full;
    }
    const out = { coins, full };
    memo.set(key, out);
    return out;
  };
  return go(k0, hw.respins);
}

// ── LES LOIS DES ROULEAUX ────────────────────────────────────────────────────────
// Loi d'un symbole sur une case d'un rouleau (toutes les rangées voient la bande).
function marginals(reels) {
  return reels.map((reel) => {
    const m = {};
    for (const s of reel) m[s] = (m[s] || 0) + 1 / reel.length;
    return m;
  });
}
// Loi du nombre de `sym` dans la fenêtre d'un rouleau (0 à 3), sur ses arrêts.
function countDist(reel, sym) {
  const d = [0, 0, 0, 0];
  for (let s = 0; s < reel.length; s += 1) {
    let c = 0;
    for (let row = 0; row < 3; row += 1) if (reel[(s + row - 1 + reel.length) % reel.length] === sym) c += 1;
    d[c] += 1 / reel.length;
  }
  return d;
}
function convolve(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return out;
}
function totalDist(reels, sym) {
  return reels.map((r) => countDist(r, sym)).reduce((acc, d) => convolve(acc, d), [1]);
}

// L'espérance d'UNE ligne (× la mise) : 10⁵ combinaisons pondérées, exactes.
function oneLineEv(reels, cfg) {
  const M = marginals(reels);
  const syms = M.map((m) => Object.entries(m));
  let ev = 0, hit = 0;
  const rec = (r, chosen, p) => {
    if (r === reels.length) {
      const w = lineWin(chosen, cfg.pay, cfg.wild);
      if (w) { ev += p * w.pay; hit += p; }
      return;
    }
    for (const [s, q] of syms[r]) { chosen[r] = s; rec(r + 1, chosen, p * q); }
  };
  rec(0, new Array(reels.length), 1);
  return { ev, hit };
}

// TOUT le calcul. `flight` : la valeur d'un vol d'Icare offert, en mises (plancher d'edge).
export function slotsOddsOf(cfg, flight = 0) {
  const { reels } = cfg;
  const one = oneLineEv(reels, cfg);
  const L = one.ev * cfg.lines.length;
  // Les déclencheurs.
  const dS = totalDist(reels, cfg.scatter), dW = totalDist(reels, cfg.bonus), dC = totalDist(reels, cfg.coin);
  let pS = 0, fsN = 0;                                    // P(tours), E[tours gagnés]
  dS.forEach((p, n) => { const f = cfg.freeSpins[Math.min(n, reels.length)] || 0; if (f) { pS += p; fsN += p * f; } });
  const pW = dW.reduce((s, p, n) => s + (n >= cfg.wheelAt ? p : 0), 0);
  // Le Hold & Win : la loi des pièces de départ (≥ 6), la valeur attendue.
  const cm = coinMean(cfg.hw);
  let pH = 0, Hcoins = 0, Hfull = 0;
  dC.forEach((p, n) => {
    if (n < cfg.hw.trigger) return;
    const o = hwOutlook(n, cfg.hw);
    pH += p; Hcoins += p * o.coins; Hfull += p * o.full;
  });
  // × la mise : les pièces, et le PLANCHER du GRAND quand les quinze cases se remplissent
  // (payé par la machine ; la part de cagnotte, transfert, reste hors RTP).
  const H = pH > 0 ? (Hcoins / pH) * cm + (Hfull / pH) * (cfg.grandFloor || 0) : 0;
  // Tours gratuits (relances comprises) et roue, qui se répondent :
  //   F = n·(m·L + pW·W + pH·H)    n = E[tours d'une série] = N̄ / (1 − N̄·pS... ) — ici par
  //   tour gratuit, la série s'allonge de fsN tours en moyenne : n = N / (1 − fsN).
  const N = pS > 0 ? fsN / pS : 0;                      // tours d'une série, en moyenne
  const spins = N / (1 - fsN);
  const chest = cfg.chests.reduce((s, v) => s + v, 0) / cfg.chests.length;
  const seg = cfg.wheel.length;
  let c = 0, nT = 0;
  for (const s of cfg.wheel) {
    if (typeof s === 'number') c += s;
    else if (s === 'coffres') c += chest;
    else if (s === 'vol') c += flight;
    else if (s === 'tours') nT += 1;
  }
  c /= seg;
  const d = nT / seg;
  const a = spins * (cfg.freeMult * L + pH * H);
  const bF = spins * pW;
  // La case « tours » de la roue offre une série de wheelSpins tours (pas N).
  const spinsW = cfg.wheelSpins / (1 - fsN);
  const aW = spinsW * (cfg.freeMult * L + pH * H), bW = spinsW * pW;
  const W = (c + d * aW) / (1 - d * bW);
  const F = a + bF * W;
  const rtp = L + pS * F + pW * W + pH * H;
  return {
    L, lineHit: one.hit, pS, pW, pH, spins, F, W, H, Hfull: pH > 0 ? Hfull / pH : 0, rtp,
    parts: { lignes: L, tours: pS * F, roue: pW * W, holdWin: pH * H }
  };
}
