"use strict";
// ── LE PORT DE COMMERCE : docks au XIXe, terminal à conteneurs ensuite ──────────
// (docs/PLAN-PORTS.md, lot P2)
//
// Demande de Raph (2026-10-01) : « aux ères plus avancées le port devient un
// véritable port commercial, tel que le port du Havre », « un commercial en
// périphérie de la ville ». Le layout fonde le site une fois (map/portSites.js,
// cityCore.ports.trade) : un terre-plein le long d'un tronçon de berge droit, en
// aval, au bord de la ville du moment. Ce module le DESSINE, au pixel, avec le
// moteur de boîtes du ponton (iso/isoBoxBake.js) :
//   · bande 5 — LES DOCKS : quai de pierre, voie ferrée le long du bord, entrepôts
//     de brique alignés derrière, grues à vapeur à flèche, vapeurs à quai ;
//   · bande 6 — LE TERMINAL (Le Havre) : quai de béton à défenses, rails de
//     portique, PORTIQUES à conteneurs dont la flèche avance au-dessus des navires,
//     piles de conteneurs colorées, porte-conteneurs à quai ;
//   · bandes 7-9 — le terminal en nacre de l'ère, liseré lumineux.
// Sa taille suit les Ports achetés : plus de portiques, de piles et de postes.
//
// DEUX CUISSONS, UN NAVIRE ENTRE ELLES : le bas (terre-plein, quai, piles, pieds des
// portiques) est peint, puis les navires à quai, puis le HAUT des portiques (poutres,
// flèches, cabines) : une flèche passe au-dessus d'un navire, jamais dessous.
import { CM } from '../layout.js';
import { quayWallTiles, quayWallTune, quayStyleFor } from '../quaysAndRiot.js';
import { bakeBoxes, blitLayer, paintBakeUnder, h01, mul, mix, hexRgb, FACE_LIGHT, faceLit, anchoredBake, boxesKey, riverKey, shiftBake } from './isoBoxBake.js';
import { drawMooredHull, hullFootprint, riverEdgeAt as edgeAt, riverWaterAt as waterAtW, riverWindow, registerPortProvider, registerPortLamps, quayJoin } from './portBerths.js';
import { queueFlameGlow } from '../flameGlow.js';
import { drawSmoke } from './boatFx.js';
import { traderLen } from './boatKits.js';
import { worldToScreen, depthOf } from './projection.js';

export const TRADE = { on: true, shadow: true, reflect: true, ink: true };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__trade = (o) => {
    if (o === false) TRADE.on = false;
    else if (o === true) TRADE.on = true;
    else if (o && typeof o === 'object') Object.assign(TRADE, o);
    _cache.clear(); _bakes.clear();
    return { ...TRADE };
  };
}

// ── LES PALETTES ─────────────────────────────────────────────────────────────
const PAL = {
  docks: {
    top: [[184, 174, 154], [176, 166, 146], [190, 180, 160]], gap: [142, 134, 118], coping: [214, 206, 188],
    wall: [168, 158, 140], rail: [64, 62, 60], sleeper: [112, 86, 62], bollard: [52, 50, 48], bollardTop: [92, 90, 86],
    brick: [156, 74, 54], brickD: [126, 56, 42], brickL: [178, 96, 70], mortar: [112, 82, 70], window: [38, 34, 48], glass: [92, 112, 134],
    roof: [84, 92, 112], roofD: [62, 68, 86], ridge: [132, 138, 150], door: [96, 64, 44], doorD: [70, 46, 32], cornice: [202, 188, 158],
    crane: [54, 54, 58], cab: [104, 64, 46], chimney: [40, 40, 42], rope: [44, 42, 40],
    goods: [[160, 120, 74], [124, 84, 52], [196, 180, 140]],
  },
  terminal: {
    top: [[172, 172, 166], [166, 166, 160], [178, 178, 172]], gap: [140, 140, 136], coping: [196, 196, 190],
    wall: [150, 150, 146], rail: [78, 80, 84], line: [216, 182, 58], fender: [40, 40, 42], bollard: [46, 48, 52], bollardTop: [86, 88, 92],
    gantry: [52, 98, 168], boom: [52, 98, 168], house: [226, 228, 230], stay: [58, 60, 68], trolley: [70, 72, 80],
    conts: [[178, 62, 50], [56, 98, 162], [62, 132, 82], [214, 142, 54], [150, 152, 154], [226, 226, 220], [122, 52, 62], [58, 142, 152], [202, 182, 62]],
  },
};
function cosmicPal(band) {
  const st = quayStyleFor(band) || {};
  const glow = hexRgb(st.glow) || [120, 230, 200];
  const p = PAL.terminal;
  return {
    ...p,
    top: [[198, 202, 212], [192, 196, 206], [204, 208, 218]], gap: [168, 172, 184], coping: [222, 226, 234], wall: [176, 180, 192],
    line: glow, rail: [120, 126, 140], gantry: [214, 220, 228], boom: [214, 220, 228], house: mix([236, 240, 246], glow, 0.15), stay: [150, 156, 170],
    trolley: [160, 166, 180], conts: p.conts.map((c, i) => mix(c, i % 3 === 0 ? glow : [236, 238, 244], 0.45)), glow,
  };
}

// ── LE PLAN : des boîtes en px monde, en repère « bord du quai » ────────────────
// `u` = distance au bord d'eau vers l'intérieur des terres (négative au-dessus de
// l'eau), x = le long du quai, z = hauteur (le terre-plein à 0, comme le sol).
// `lvlB` = le palier de niveau (tradeGeom) : ce que la cuisson met en cache.
function tradePlan(tp, level, band, T, sm, lvlB = 0) {
  const style = band >= 6 ? 'terminal' : 'docks';
  const P = band >= 7 ? cosmicPal(band) : PAL[style];
  const dir = tp.side === 'N' ? 1 : -1;
  const x0 = tp.x0, x1 = tp.x0 + tp.len;
  // LE BORD DU QUAI SUIT LA BERGE PEINTE, comme le quai du fleuve qu'il prolonge.
  // ⚠ Retour Raph (2026-10-03) : « revoit la jonction quai/port ». Le bord était une
  // droite calée sur le point le plus AVANCÉ de la berge (+0,12) : à l'autre bout, le
  // port débordait de 0,4 tuile dans l'eau, le quai du fleuve reprenait en retrait et
  // le bout du mur restait en vue. `yAt(x)` = le bord sous chaque abscisse (table au
  // 1/8 de tuile : l'ombrage la lit à chaque pixel) ; tout se pose en `u` depuis lui.
  const xa0 = x0 - 4, STEP = 0.125, EDGE_OFF = 0.03;
  const yTab = [];
  for (let x = xa0; x <= x1 + 4 + 1e-6; x += STEP) yTab.push(edgeAt(sm, x, tp.side) + dir * EDGE_OFF);
  const yAt = (x) => {
    const f = Math.max(0, Math.min(yTab.length - 1.001, (x - xa0) / STEP)), i = Math.floor(f);
    return yTab[i] + (yTab[i + 1] - yTab[i]) * (f - i);
  };
  const wh = quayWallTiles(band) * quayWallTune.heightK;
  const low = [], high = [], beacons = [], smokes = [];
  // Une pièce se pose au bord SOUS SON MILIEU (la berge ne bouge que de quelques pixels
  // sur la longueur d'un entrepôt) ; arrondi au pixel d'art.
  const box = (arr, part, ax0, ax1, u0, u1, z0, z1, extra) => {
    const yr = Math.round(yAt((ax0 + ax1) / 2) * T) / T;
    const ya = yr - dir * u0, yb = yr - dir * u1;
    arr.push({ part, X0: ax0 * T, X1: ax1 * T, Y0: Math.min(ya, yb) * T, Y1: Math.max(ya, yb) * T, Z0: z0 * T, Z1: z1 * T, ...extra });
  };
  // Les pièces au ras du bord (terre-plein, mur) se posent par BANDES d'un quart de
  // tuile, chacune à la berge sous elle : la maçonnerie suit la courbe en marches d'un
  // pixel. `back(x)` = profondeur jusqu'au fond de l'emprise réservée (tradeCells).
  const strip = (arr, part, ax0, ax1, u0, back, z0, z1, extra) => {
    for (let x = ax0; x < ax1 - 1e-6; x += 0.25) {
      const xb = Math.min(ax1, x + 0.25);
      box(arr, part, x, xb, u0, typeof back === 'function' ? back((x + xb) / 2) : back, z0, z1, extra);
    }
  };
  const backOf = (x) => {
    const i = Math.max(0, Math.min(tp.len - 1, Math.floor(x - x0)));
    const yBack = dir > 0 ? tp.edge[i] - (tp.depth - 1) : tp.edge[i] + tp.depth;
    return (yAt(x) - yBack) * dir;
  };
  // Terre-plein (au ras du sol) et mur de quai qui pend au-dessus de l'eau.
  strip(low, 'apron', x0, x1, 0, backOf, -0.03, 0, { noShadow: true, noMirror: true });
  strip(low, 'wall', x0, x1, -0.02, 0.06, -wh, 0, { noShadow: true, noMirror: true });
  // RACCORDS avec le quai du fleuve, qui reprend au premier sample hors de la coupure :
  // sans eux, un coin de berge restait entre les deux maçonneries. Ils suivent la berge
  // eux aussi : au point de reprise, les deux bords se rejoignent.
  // De SA rive seulement (N → masque minus, S → plus) : en face du bassin, celle du
  // Vieux-Port lui répondait.
  const join = quayJoin(sm, x0 - 0.5, x1 + 0.5, -dir);
  if (join) {
    // Chevauchement de 0,1 tuile sur le premier segment du quai du fleuve : bord à bord,
    // un trait d'eau d'un pixel restait entre les deux murs.
    for (const [xa, xb] of [[join.xL - 0.1, x0], [x1, join.xR + 0.1]]) {
      if (!(xb - xa > 0.05)) continue;
      strip(low, 'apron', xa, xb, 0, 1, -0.03, 0, { noShadow: true, noMirror: true });
      strip(low, 'wall', xa, xb, -0.02, 0.06, -wh, 0, { noShadow: true, noMirror: true });
    }
  }
  // Bornes d'amarrage le long du bord.
  for (let x = x0 + 0.5; x < x1 - 0.2; x += 1.25) box(low, 'bollard', x, x + 0.09, 0.1, 0.19, 0, 0.09, { noMirror: true });
  const ships = [];
  if (style === 'terminal') {
    // Défenses de caoutchouc sur la face du quai.
    for (let x = x0 + 0.3; x < x1 - 0.2; x += 1.1) box(low, 'fender', x, x + 0.16, -0.07, -0.02, -wh * 0.85, -wh * 0.12, { noMirror: true });
    const nG = level >= 150 ? 4 : level >= 50 ? 3 : 2;
    const usable = tp.len - 2.4;
    for (let k = 0; k < nG; k += 1) {
      const xg = x0 + 1.2 + usable * (k + 0.5) / nG;
      for (const xs of [xg - 0.46, xg + 0.34]) {
        for (const us of [0.22, 1.3]) {
          box(low, 'gantry', xs, xs + 0.12, us, us + 0.12, 0, 1.86);
          box(high, 'gantry', xs, xs + 0.12, us, us + 0.12, 1.86, 1.96);
        }
        box(low, 'gantry', xs, xs + 0.12, 0.22, 1.42, 0.36, 0.46);     // traverse basse
        box(high, 'gantry', xs, xs + 0.12, 0.22, 1.42, 1.86, 2.0);     // longeron haut
      }
      for (const us of [0.22, 1.3]) box(high, 'gantry', xg - 0.46, xg + 0.46, us, us + 0.12, 1.86, 2.0);
      box(high, 'boom', xg - 0.1, xg + 0.1, -2.35, 2.05, 2.0, 2.13);
      box(high, 'house', xg - 0.3, xg + 0.3, 0.72, 1.55, 2.13, 2.44);
      for (const xa of [xg - 0.27, xg + 0.19]) box(high, 'gantry', xa, xa + 0.08, 0.95, 1.05, 2.13, 2.86);
      box(high, 'gantry', xg - 0.27, xg + 0.27, 0.95, 1.05, 2.8, 2.88);
      const stay = (ua, za, ub, zb, n) => {
        for (let i = 0; i < n; i += 1) {
          const t0 = i / n, t1 = (i + 1) / n;
          const u0 = ua + (ub - ua) * t0, u1 = ua + (ub - ua) * t1, z0 = za + (zb - za) * t0, z1 = za + (zb - za) * t1;
          box(high, 'stay', xg - 0.02, xg + 0.02, Math.min(u0, u1), Math.max(u0, u1) + 0.02, Math.min(z0, z1), Math.max(z0, z1) + 0.03, { noMirror: true });
        }
      };
      stay(1.0, 2.86, -2.3, 2.13, 16);
      stay(1.0, 2.86, 2.0, 2.13, 5);
      // Chariot sur la flèche, et un conteneur au bout de ses câbles. Tiré sur le PALIER,
      // pas sur le niveau brut (audit du 2026-10-05, MORT-11) : la cuisson est gardée par
      // palier, et la place du chariot dépendait du niveau à la première cuisson — elle
      // changeait d'une session à l'autre.
      const ut = -0.55 - 0.9 * h01(k, lvlB, 3);
      box(high, 'trolley', xg - 0.13, xg + 0.13, ut - 0.15, ut + 0.15, 1.9, 2.0);
      box(high, 'stay', xg - 0.015, xg + 0.015, ut - 0.01, ut + 0.02, 1.36, 1.9, { noMirror: true });
      box(high, 'stack', xg - 0.26, xg + 0.26, ut - 0.1, ut + 0.1, 1.2, 1.36, { cx: k, cy: 99, hz: 0.16 * T });
      // Feux d'obstacle rouges : au sommet du chevalet et au bout de la flèche.
      beacons.push({ x: xg, y: yAt(xg) - dir * 1.0, z: 2.92 }, { x: xg, y: yAt(xg) + dir * 2.3, z: 2.17 });
    }
    // Piles de conteneurs derrière les portiques.
    const maxH = level >= 120 ? 4 : level >= 40 ? 3 : 2;
    let row = 0;
    for (let u = 1.78; u + 0.21 <= tp.depth - 0.05; u += 0.23) {
      if (row > 0 && row % 4 === 0) u += 0.18;                       // allée
      let col = 0;
      for (let x = x0 + 0.6; x + 0.52 <= x1 - 0.5; x += 0.56) {
        if (col > 0 && col % 5 === 0) x += 0.3;                       // voie de cavalier
        if (x + 0.52 > x1 - 0.5) break;
        const r = h01(col, row, 17);
        const n = r < 0.12 ? 0 : 1 + Math.floor(h01(col, row, 23) * maxH);
        if (n > 0) box(low, 'stack', x, x + 0.52, u, u + 0.21, 0, n * 0.16, { cx: col, cy: row, hz: 0.16 * T });
        col += 1;
      }
      row += 1;
    }
    // Porte-conteneurs à quai, entre les portiques.
    const fp = hullFootprint('container', band);
    const nS = Math.max(1, Math.min(Math.floor(tp.len / (fp.len + 0.7)), level >= 100 ? 3 : level >= 30 ? 2 : 1));
    for (let k = 0; k < nS; k += 1) {
      const xs = x0 + tp.len * (k + 0.5) / nS;
      ships.push({ role: 'container', x: xs, y: yAt(xs) + dir * (fp.beam / 2 + 0.06), z: -wh });
    }
  } else {
    // DOCKS du XIXe : voie ferrée le long du quai (dessinée sur le terre-plein), une
    // rangée d'entrepôts de brique derrière, des grues à vapeur au bord.
    // ⚠ Retour Raph (2026-10-03) : « il manque le côté pixel art » — les entrepôts
    // étaient des pavés à toit plat. Ils deviennent des TRAVÉES À PIGNON, pignons
    // tournés vers le quai (les docks du Havre) : murs jusqu'à l'égout, puis chaque
    // travée coiffée de deux pans en marches d'un pixel (le moteur ne fait que des
    // boîtes droites ; `grp` dit à l'encre que les marches font un seul toit).
    const wu0 = 1.55, wu1 = tp.depth - 0.05;
    let x = x0 + 0.4;
    let k = 0;
    while (x < x1 - 1.6) {
      const len = Math.min(x1 - 0.4 - x, 2.6 + 1.4 * h01(k, 5, 7));
      if (len < 1.4) break;
      const he = 0.72 + 0.16 * h01(k, 9, 3);
      const nb = Math.max(2, Math.round(len / 0.95)), bw = len / nb;
      box(low, 'warehouse', x, x + len, wu0, wu1, 0, he, { wk: k, bw: bw * T });
      for (let j = 0; j < nb; j += 1) {
        const xa = x + j * bw, K = Math.floor(bw * T / 2), rise = 0.95 / T;
        for (let st = 0; st < K; st += 1) {
          box(low, 'roof', xa + st / T, xa + bw - st / T, wu0 - 0.05, wu1 + 0.03, he + st * rise, he + (st + 1) * rise,
            { wk: k, grp: 'r' + k + '.' + j, mid: (xa + bw / 2) * T, top: he + K * rise });
        }
      }
      x += len + 0.55; k += 1;
    }
    const nC = level >= 80 ? 4 : level >= 25 ? 3 : 2;
    for (let i = 0; i < nC; i += 1) {
      const xc = x0 + 1 + (tp.len - 2) * (i + 0.5) / nC;
      const m = 0.1, H = 1.25;
      box(low, 'crane', xc, xc + m, 0.35, 0.35 + m, 0, H);
      box(low, 'cab', xc - 0.12, xc + 0.22, 0.3, 0.62, 0.05, 0.38);
      box(low, 'chimney', xc + 0.12, xc + 0.18, 0.5, 0.56, 0.38, 0.62);
      // La bouche de la cheminée : la grue est à vapeur, elle fume (drawTradePort).
      smokes.push({ x: xc + 0.15, y: Math.round(yAt(xc + 0.15) * T) / T - dir * 0.53, z: 0.62 });
      // Flèche inclinée vers l'eau, en marches, et son hauban.
      const N = 14, tipU = -1.25, tipZ = H * 0.85;
      for (let j = 0; j < N; j += 1) {
        const t0 = j / N, t1 = (j + 1) / N;
        const ua = 0.35 + (tipU - 0.35) * t0, ub = 0.35 + (tipU - 0.35) * t1, za = 0.2 + (tipZ - 0.2) * t0, zb = 0.2 + (tipZ - 0.2) * t1;
        box(high, 'crane', xc + 0.02, xc + 0.08, Math.min(ua, ub), Math.max(ua, ub) + 0.02, Math.min(za, zb), Math.max(za, zb) + 0.07, { grp: 'jib' + i });
        const ra = 0.35 + (tipU - 0.35) * t0, rb = 0.35 + (tipU - 0.35) * t1, sa = H + (tipZ + 0.05 - H) * t0, sb = H + (tipZ + 0.05 - H) * t1;
        box(high, 'rope', xc + 0.035, xc + 0.065, Math.min(ra, rb), Math.max(ra, rb) + 0.02, Math.min(sa, sb), Math.max(sa, sb) + 0.03, { noMirror: true });
      }
      box(high, 'rope', xc + 0.035, xc + 0.065, tipU - 0.01, tipU + 0.02, 0.45, tipZ, { noMirror: true });
      box(high, 'goods', xc - 0.06, xc + 0.16, tipU - 0.1, tipU + 0.1, 0.25, 0.45, { gk: i });
      // Marchandises au pied de la grue.
      for (let j = 0; j < 3; j += 1) {
        const gx = xc + 0.35 + j * 0.24, gh = 0.12 + 0.12 * h01(i, j, 5);
        box(low, 'goods', gx, gx + 0.2, 0.75, 0.97, 0, gh, { gk: i * 3 + j });
      }
    }
    const fp = hullFootprint('steam', band);
    const nS = Math.max(1, Math.min(Math.floor(tp.len / (fp.len + 0.8)), level >= 60 ? 3 : 2));
    for (let k2 = 0; k2 < nS; k2 += 1) {
      const xs = x0 + tp.len * (k2 + 0.5) / nS;
      ships.push({ role: 'steam', x: xs, y: yAt(xs) + dir * (fp.beam / 2 + 0.06), z: -wh });
    }
  }
  cedeQuai(ships, x0, x1, band);
  return { style, P, low, high, ships, beacons, smokes, yAt, yTab, dir, wh: wh * T, x0, x1, depth: tp.depth };
}

// ── LA COULEUR D'UN POINT TOUCHÉ ─────────────────────────────────────────────
// Dessiné comme un sprite : peu de teintes, des motifs au pixel (brique, ardoise,
// dalles, nervures), l'ombre qui bleuit (faceLit) ; contours et arêtes viennent de
// l'encre de la cuisson (isoBoxBake, option `ink`).
// ⚠ Retour Raph (2026-10-03) : « il manque le côté pixel art » — l'ancien ombrage
// multipliait des aplats par la lumière, avec un bruit continu : un rendu 3D lisse.
// GRAIN ANCRÉ AU PORT (PERF-10, cf. isoBoxBake.anchoredBake) : dalles, briques,
// mouchetis et nervures se lisent en (rx, ry), relatifs à l'ancre (OX, OY) ; la
// géométrie (distance au bord `u`, axes des travées) reste en (wx, wy).
function shadeTrade(plan, T, OX = 0, OY = 0) {
  const P = plan.P, dir = plan.dir, yAt = plan.yAt;
  const md = (v, m) => ((v % m) + m) % m;
  // Brique de 6 × 2 au joint d'un pixel, assises décalées, quelques briques plus sombres.
  const brick = (a, h) => {
    const row = Math.floor(h / 3);
    if (h - row * 3 < 1) return P.mortar;
    const off = (row & 1) ? 3 : 0;
    if (md(Math.floor(a) + off, 6) === 0) return P.mortar;
    const r = h01(Math.floor((a + off) / 6), row, 31);
    return r < 0.22 ? P.brickD : r > 0.9 ? P.brickL : P.brick;
  };
  // Grain discret (jamais un bruit continu : il donnait le flou « rendu 3D »).
  const speck = (wx, wy) => { const r = h01(Math.floor(wx), Math.floor(wy), 3); return r < 0.07 ? 0.92 : r > 0.96 ? 1.06 : 1; };
  const inner = (hit, wx, wy, zz) => {
    const bx = hit.bx, face = hit.face, part = bx.part;
    const u = (yAt(wx / T) * T - wy) * dir;                       // distance au bord, px
    const rx = wx - OX, ry = wy - OY;                             // le grain, depuis l'ancre
    const g = speck(rx, ry + zz);
    let col;
    if (part === 'apron') {
      if (face !== 2) return faceLit(P.wall, FACE_LIGHT[face]);
      if (plan.style === 'terminal') {
        const ki = Math.floor(rx / 32), kj = Math.floor(u / 32);
        col = P.top[Math.floor(h01(ki, kj, 4) * P.top.length)];
        // Taches d'huile (en damier : des pixels, pas un dégradé).
        const st = h01(Math.floor(rx / 6), Math.floor(u / 4), 9);
        if (st < 0.06 && ((Math.floor(rx) + Math.floor(u)) & 1)) col = mul(col, 0.86);
        if (md(rx, 32) < 1 || md(u, 32) < 1) col = P.gap;
        // Rails des portiques (deux files), ligne de sécurité jaune au bord, en tirets.
        if (Math.abs(u - 0.28 * T) < 0.8 || Math.abs(u - 1.36 * T) < 0.8) col = P.rail;
        if (u > 0.45 * T && u < 0.45 * T + 1.2 && md(Math.floor(rx / 4), 2) === 0) col = P.line;
        if (u < 1.4) col = P.coping;
        if (P.glow && u > 0.12 * T && u < 0.12 * T + 1) col = P.glow;
      } else {
        // Pavés de 6 × 4 en quinconce.
        const rowp = Math.floor(u / 4), offp = (rowp & 1) ? 3 : 0;
        col = P.top[Math.floor(h01(Math.floor((rx + offp) / 6), rowp, 5) * P.top.length)];
        if (u - rowp * 4 < 1 || md(Math.floor(rx) + offp, 6) === 0) col = P.gap;
        // Voie ferrée : deux rails sur traverses.
        const ur = u - 0.62 * T;
        if (ur > -3 && ur < 6 && md(Math.floor(rx), 3) === 0) col = P.sleeper;
        if (Math.abs(ur + 1) < 0.6 || Math.abs(ur - 4) < 0.6) col = P.rail;
        if (u < 1.4) col = P.coping;
      }
      return mul(col, g);
    }
    if (part === 'wall') {
      if (face === 2) return P.coping;
      col = P.wall;
      if (plan.style === 'docks') {
        const row = Math.floor(-zz / 3.2), off = (row & 1) ? 4 : 0;
        if (((-zz) - row * 3.2) < 0.9 || md(Math.floor(rx) + off, 8) === 0) col = P.gap;
      } else if (md(Math.floor(rx), 16) === 0) col = P.gap;
      if (-zz > plan.wh - 2.2) col = mix(mul(col, 0.6), [58, 76, 56], 0.3);   // pied mouillé
      return faceLit(mul(col, g), FACE_LIGHT[face]);
    }
    if (part === 'bollard') return faceLit(face === 2 ? P.bollardTop : P.bollard, FACE_LIGHT[face]);
    if (part === 'fender') return faceLit(P.fender, FACE_LIGHT[face]);
    if (part === 'stack') {
      const hz = bx.hz || 5, lvl = Math.max(0, Math.floor((zz - 0.01) / hz));
      col = P.conts[Math.floor(h01(bx.cx, bx.cy * 7 + lvl, 29) * P.conts.length)];
      if (face === 2) return faceLit(md(Math.floor(rx), 3) === 0 ? mul(col, 0.9) : col, 1.08);
      if (zz - lvl * hz < 1) col = mul(col, 0.55);                                // jointure entre deux conteneurs
      else if (face === 1 && md(Math.floor(rx), 2) === 0) col = mul(col, 0.84);  // nervures
      else if (face === 0 && md(Math.floor(ry), 3) === 0) col = mul(col, 0.78);  // barres des portes
      return faceLit(col, FACE_LIGHT[face]);
    }
    if (part === 'gantry' || part === 'boom') {
      col = P.gantry;
      if (part === 'boom' && u < -2.1 * T) col = face === 2 ? [230, 230, 228] : [200, 60, 52];   // pointe blanc et rouge
      if (P.glow && part === 'boom' && face !== 2 && bx.Z1 - zz < 1) col = P.glow;
      // Croisillons des jambes : un pixel plus sombre en zigzag.
      if (part === 'gantry' && face !== 2 && bx.Z1 - bx.Z0 > T && md(Math.floor(zz) - Math.floor(face === 1 ? rx : ry) * 2, 6) === 0) col = mul(col, 0.78);
      return faceLit(col, face === 2 ? 1.1 : FACE_LIGHT[face]);
    }
    if (part === 'house') {
      col = P.house;
      if (face !== 2 && zz > bx.Z0 + 0.35 * (bx.Z1 - bx.Z0) && zz < bx.Z0 + 0.6 * (bx.Z1 - bx.Z0) && md(Math.floor(face === 1 ? rx : ry), 4) < 2) col = [70, 96, 120];
      return faceLit(col, FACE_LIGHT[face]);
    }
    if (part === 'trolley') return faceLit(P.trolley, FACE_LIGHT[face]);
    if (part === 'stay' || part === 'rope') return P.stay || P.rope;
    if (part === 'roof') {
      // Le PIGNON (face sud des marches) : brique, un oculus sous le faîte, la rive claire.
      if (face === 1) {
        const ox = wx - bx.mid, dz = bx.top * T - zz;
        const ro = Math.hypot(ox, (dz - 4) * 1.2);
        if (ro < 2.2) return faceLit(ro < 1.2 ? P.glass : P.window, FACE_LIGHT[1]);
        if (wx - bx.X0 < 1.3 || bx.X1 - wx < 1.3) return faceLit(P.cornice, FACE_LIGHT[1]);   // rive, au bout des marches
        return faceLit(brick(wx - bx.mid + 64, zz), FACE_LIGHT[1]);
      }
      // Les PANS : ardoise en rangs parallèles à l'égout, le pan ouest au soleil, l'est
      // à l'ombre ; faîtage clair.
      const ox = wx - bx.mid, east = ox > 0, d = Math.abs(ox);
      if (d < 1.2) return faceLit(P.ridge, east ? 0.86 : 1.04);
      col = md(Math.floor(d), 3) === 0 ? P.roofD : P.roof;
      if (md(Math.floor(d), 3) === 1 && md(Math.floor(ry / 4) + Math.floor(d / 3), 2) === 0) col = mix(col, P.roofD, 0.5);
      return faceLit(mul(col, g), east ? 0.72 : 1.04);
    }
    if (part === 'warehouse') {
      if (face === 2) return faceLit(P.roofD, 1);
      const along = face === 1 ? wx - bx.X0 : wy - bx.Y0, h = zz, top = bx.Z1;
      col = brick(along, h);
      if (h < 3) col = md(Math.floor(along), 8) === 0 ? P.mortar : mul(P.cornice, 0.82);   // soubassement de pierre
      else if (top - h < 2) col = P.cornice;                                                // bandeau sous l'égout
      else if (face === 1 && bx.bw) {
        // Une porte de chargement au milieu de chaque travée, deux fenêtres cintrées autour.
        const ab = md(along, bx.bw), c = ab - bx.bw / 2;
        if (ab < 2) col = mul(P.brickD, 0.9);                                               // pilastre
        else if (Math.abs(c) < 5 && h < 13) col = (Math.abs(c) > 4 || h > 12) ? P.cornice : (md(Math.floor(c), 2) ? P.door : P.doorD);
        else if (h > 6 && h < 13 && Math.abs(Math.abs(c) - 9) < 1.6) col = h > 11.5 ? P.cornice : P.window;
      } else if (face === 0) {
        const wcol = md(along, 8), wrow = md(h, 11);
        if (wcol > 2 && wcol < 6 && wrow > 4 && wrow < 9 && h > 12 && top - h > 4) col = wrow === 8 ? P.cornice : P.window;
      }
      return faceLit(col, FACE_LIGHT[face]);
    }
    if (part === 'crane') return faceLit(face === 2 ? mul(P.crane, 1.3) : P.crane, FACE_LIGHT[face]);
    if (part === 'cab') return faceLit(face === 2 ? [70, 72, 76] : (md(Math.floor(face === 1 ? rx : ry), 4) === 0 ? mul(P.cab, 0.8) : P.cab), FACE_LIGHT[face]);
    if (part === 'chimney') return faceLit(P.chimney, FACE_LIGHT[face]);
    if (part === 'goods') {
      col = P.goods[(bx.gk | 0) % P.goods.length];
      if (face !== 2 && md(Math.floor(zz), 4) === 0) col = mul(col, 0.8);
      return faceLit(col, FACE_LIGHT[face]);
    }
    return faceLit([128, 128, 128], FACE_LIGHT[face]);
  };
  return (hit, wx, wy, zz, mirror) => {
    const c = inner(hit, wx, wy, zz);
    return mirror && hit.face === 2 && c ? mul(c, 0.5) : c;
  };
}

// L'encre de la cuisson (isoBoxBake.inkPass) : les filins n'en prennent pas, le sol
// (terre-plein, mur du quai) n'a pas de contour mais assombrit le pied des objets.
const TRADE_INK = {
  skip: (b) => b.part === 'stay' || b.part === 'rope',
  ground: (b) => b.part === 'apron' || b.part === 'wall',
};

// ── LE CACHE ─────────────────────────────────────────────────────────────────
// `_cache` : par géométrie ABSOLUE (le plan, ses navires et ses feux, à leur place) ;
// `_bakes` : les cuissons par clé RELATIVE à l'ancre du port (PERF-10), gardées d'une
// translation à l'autre. `TRADE_X` : les champs de boîte en abscisse monde, en plus de
// X0/X1 (l'axe d'une travée de toit).
const _cache = new Map();
const _bakes = new Map();
const TRADE_X = ['X0', 'X1', 'mid'];
function tradeGeom(t, band) {
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || !t.tradePort) return null;
  const level = Math.floor(t.level || 0);
  // ⚠ CLÉ = LA GÉOMÉTRIE, pas l'horodatage du layout : celui-ci change à chaque
  // recalcul (un achat peut en déclencher un), et la cuisson coûte quelques centaines
  // de ms — elle se refaisait à chaque fois. Le cache est indexé par la clé, pas par
  // l'objet tuile (un recalcul en fabrique de nouveaux).
  // Le niveau compte par PALIERS (ceux de tradePlan : portiques, piles, postes).
  const tp = t.tradePort, lvlB = [25, 30, 40, 50, 60, 80, 100, 120, 150].filter((v) => level >= v).length;
  const key = (L.mapSeed | 0) + ':' + tp.x0 + ',' + tp.len + ',' + tp.side + ',' + tp.depth + ',' + tp.edge.join('.') + ':' + band + ':' + lvlB
    + ':' + (TRADE.shadow ? 1 : 0) + (TRADE.reflect ? 1 : 0) + (TRADE.ink ? 1 : 0);
  if (_cache.has(key)) return _cache.get(key);
  const T = CM.TILE, sm = rv.samples;
  const plan = tradePlan(tp, level, band, T, sm, lvlB);
  const [j0, j1] = riverWindow(sm, tp.x0 - 4, tp.x0 + tp.len + 4);
  // LA CUISSON ANCRÉE AU PORT (PERF-10, isoBoxBake.anchoredBake) : l'ancre est le coin
  // du site (première colonne, sa rangée de bord). Quand la grille grandit, le port se
  // translate avec la ville : même clé relative, la cuisson se garde, décalée.
  const OX = tp.x0 * T, OY = tp.edge[0] * T;
  const rel = band + ':' + lvlB + ':' + tp.side + ':' + T + ':' + plan.wh + ':' + (TRADE.shadow ? 1 : 0) + (TRADE.reflect ? 1 : 0) + (TRADE.ink ? 1 : 0)
    + '|' + plan.yTab.map((y) => Math.round((y - tp.edge[0]) * 1e4)).join(',')
    + '|' + riverKey(sm, j0, j1, tp.x0, tp.edge[0]) + '|' + boxesKey(plan.low, OX, OY, TRADE_X) + '|' + boxesKey(plan.high, OX, OY, TRADE_X);
  const bk = anchoredBake(_bakes, rel, OX, OY, () => {
    const shade = shadeTrade(plan, T, OX, OY);
    const isWater = (wx, wy) => waterAtW(sm, wx, wy, T, j0, j1);
    const opt = { shade, isWater, shadow: TRADE.shadow, reflect: TRADE.reflect, foam: (b) => b.part === 'gantry' && b.Z0 <= 0.01, ink: TRADE.ink ? TRADE_INK : null, origin: { X: OX, Y: OY } };
    return { low: bakeBoxes(plan.low, opt), high: bakeBoxes(plan.high, opt) };
  }, (v, dX, dY) => ({ low: shiftBake(v.low, dX, dY), high: shiftBake(v.high, dX, dY) }), 3);
  const g = { plan, low: bk.low, high: bk.high };
  if (_cache.size > 4) _cache.clear();
  _cache.set(key, g);
  return g;
}

function tradeTiles(L) {
  const nT = (L.tiles || []).length;
  if (L._tradePorts && L._tradePorts.n === nT) return L._tradePorts.list;
  const list = (L.tiles || []).filter((t) => t.tradePort);
  L._tradePorts = { n: nT, list };
  return list;
}

// Sous les bateaux (passe des quais) : ombres et reflets du terminal.
export function paintTradePortUnder(ctx) {
  if (!TRADE.on) return;
  const L = CM.layout;
  if (!L || CM.collapseAt) return;
  const band = (L.counts && L.counts.eraBand) | 0;
  for (const t of tradeTiles(L)) {
    const g = tradeGeom(t, band);
    if (!g) continue;
    paintBakeUnder(ctx, g.low, { shadow: TRADE.shadow, reflect: TRADE.reflect });
    paintBakeUnder(ctx, g.high, { shadow: TRADE.shadow, reflect: TRADE.reflect });
  }
}

// Le terminal, dans le tri du peintre (scène riveraine de sa tuile).
// `docked(ctx)` : peint les marchands de la flotte qui manœuvrent à son quai (isoPort) —
// à la place des navires-décor dans l'ordre des calques, la flèche des portiques passe
// au-dessus d'eux aussi.
export function drawTradePort(ctx, t, band, ei, now, docked = null) {
  if (!TRADE.on) return;
  const g = tradeGeom(t, band);
  if (!g) return;
  // Navires à quai, cap le long du quai (vers l'est à l'écran : le monde +x), au
  // niveau de l'eau (au pied du mur). Rive nord : ils sont DEVANT le quai (peints
  // après lui) ; rive sud : DERRIÈRE (peints avant, le quai cache leur flanc bas).
  // Le marchand qui vient s'amarrer ou qui repart longe les navires-décor par le large :
  // devant eux rive nord (peint après), derrière eux rive sud (avant).
  const heading = Math.atan2(0.5, 1);
  const ships = () => {
    if (docked && g.plan.dir < 0) docked(ctx);
    for (const sh of g.plan.ships) drawMooredHull(ctx, { role: sh.role, heading, x: sh.x, y: sh.y, z: sh.z, now, band });
    if (docked && g.plan.dir > 0) docked(ctx);
  };
  const B = g.low;
  if (g.plan.dir < 0) ships();
  if (B) blitLayer(ctx, B.body);
  if (g.plan.dir > 0) ships();
  const H = g.high;
  if (H) blitLayer(ctx, H.body);
  const T = CM.TILE, z = CM.cam.zoom;
  g.plan.beacons.forEach((b, i) => {
    const p = worldToScreen(b.x * T, b.y * T, b.z * T);
    queueFlameGlow(p.x, p.y, T * z * 0.2, '255,72,56', now, i * 1.7, 1.8);
  });
  if ((CM.ambianceK ?? 1) > 0) {
    g.plan.smokes.forEach((s, i) => drawSmoke(ctx, worldToScreen(s.x * T, s.y * T, s.z * T), now, z, i * 29 + 7, 0, false));
  }
}

// ── L'ESCALE DE LA FLOTTE (iso/portBerths.js → boatBerths.fleetBerths) ─────────
// ⚠ Audit du 2026-10-05 (BUG-17, MORT-5) : dès la bande 5, plus de ponton au fleuve, et
// le terminal n'offrait aucun poste — les marchands marquaient une pause de 2,5 s en
// plein courant au droit des ports. Il publie son poste LIBRE : la plus longue travée de
// quai entre ses navires-décor (ou entre eux et un bout du quai), où un marchand vient se
// ranger. La flotte (fleetBerths) n'y prend que ce qui loge son plus long marchand — le
// quai plein en cède une (cedeQuai).
const BERTH_GAP = 0.15, BERTH_END = 0.25;   // jeu (tuiles) le long des navires-décor, aux bouts du quai
// Les travées libres [xa, xb] du quai, entre ses navires-décor (rangés d'ouest en est,
// tradePlan) et à ses deux bouts.
function quayGaps(ships, x0, x1, band) {
  const gaps = [];
  let a = x0 + BERTH_END;
  for (const sh of ships) {
    const fp = hullFootprint(sh.role, band);
    gaps.push([a, sh.x - fp.len / 2 - BERTH_GAP]);
    a = sh.x + fp.len / 2 + BERTH_GAP;
  }
  gaps.push([a, x1 - BERTH_END]);
  return gaps;
}
const widest = (gaps) => Math.max(0, ...gaps.map((g) => g[1] - g[0]));
// QUAI PLEIN (décision de Raph du 2026-10-05, BUG-17, option a) : au terminal dès le
// niveau 100 de Ports, aux docks dès 60 sur un quai de 12 tuiles, les navires-décor ne
// laissaient aucune travée au plus long marchand de l'époque — la flotte retombait sur
// la pause de 2,5 s en plein courant. Un navire-décor CÈDE SA PLACE à la flotte : celui
// dont le départ libère la plus longue travée (celui du milieu sur trois ; à égalité, le
// premier d'ouest en est). Au repos, deux navires-décor au lieu de trois (un au lieu de
// deux sur un quai court) ; l'escale existe à tous les niveaux. Un quai qui loge déjà
// le marchand garde tous les siens.
function cedeQuai(ships, x0, x1, band) {
  const need = traderLen(band);
  if (!(need > 0) || !ships.length || widest(quayGaps(ships, x0, x1, band)) >= need) return;
  let drop = -1, w = -1;
  for (let i = 0; i < ships.length; i += 1) {
    const g = widest(quayGaps(ships.filter((_, j) => j !== i), x0, x1, band));
    if (g > w + 1e-6) { w = g; drop = i; }
  }
  if (w >= need) ships.splice(drop, 1);
}
registerPortProvider('commerce', (L) => {
  if (!TRADE.on || !L || !L.counts) return null;
  const band = L.counts.eraBand | 0;
  const out = [];
  for (const t of tradeTiles(L)) {
    const g = tradeGeom(t, band);
    if (!g) continue;
    const pl = g.plan;
    const gaps = quayGaps(pl.ships, pl.x0, pl.x1, band);
    let clear = 0;
    for (const sh of pl.ships) clear = Math.max(clear, hullFootprint(sh.role, band).beam);
    let best = null;
    for (const gp of gaps) if (gp[1] - gp[0] > (best ? best[1] - best[0] : 0)) best = gp;
    if (!best) continue;
    const x = (best[0] + best[1]) / 2;
    out.push({
      id: 'quai:' + t.gx + ',' + t.gy, tile: t.gx + ',' + t.gy, kind: 'commerce', decor: false,
      x, y: pl.yAt(x) + pl.dir * 0.06, heading: Math.atan2(0.5, 1), axis: { x: 1, y: 0 }, out: { x: 0, y: pl.dir },
      maxLen: best[1] - best[0], z: -pl.wh / CM.TILE, clear: clear + 0.08, extent: { x0: pl.x0, x1: pl.x1 },
    });
  }
  return out;
});

// ── LES RÉVERBÈRES DU TERMINAL (iso/portBerths.js → isoStreet.isoLamps) ─────────
// Une file de mâts de l'ère à l'arrière du terre-plein, tous les ~2,2 tuiles.
registerPortLamps('commerce', (L, band) => {
  if (!TRADE.on || !L) return [];
  const T = CM.TILE, out = [];
  for (const t of tradeTiles(L)) {
    const g = tradeGeom(t, band);
    if (!g) continue;
    const pl = g.plan;
    for (let x = pl.x0 + 0.8; x < pl.x1 - 0.4; x += 2.2) {
      const y = pl.yAt(x) - pl.dir * (pl.depth + 0.1);
      const wx = x * T, wy = y * T;
      out.push({ wx, wy, gx: Math.floor(x), gy: Math.floor(y), d: depthOf(wx, wy), s: ((Math.floor(x * 7) * 73856093) ^ (Math.floor(y * 7) * 19349663)) >>> 0 });
    }
  }
  return out;
});
