"use strict";
// ── LES RAMES DU MÉTRO — voitures construites en volumes, cuites au pixel ─────
// (docs/PLAN-ETAGES.md, lot 3 — reprise du 2026-10-04)
//
// Retour de Raph (2026-10-04) : « le design du métro est très cheap ». Les rames
// étaient des boîtes de couleur à six pixels de fenêtre, alignées sur l'axe dominant
// (en escalier dans les courbes). Elles passent désormais par le PEINTRE DES BATEAUX
// (boatBake.js) — la main que Raph a validée pour la flotte : volumes échantillonnés,
// lumière haut-gauche quantifiée sur la rampe de chaque matière, contour d'encre.
//
// Une voiture se construit dans son repère (a le long, avant +, c en travers, h en
// hauteur au-dessus du rail ; px monde au zoom 1) et se cuit :
//   · à n'importe quel cap (32, ceux des bateaux) — plus d'escalier dans les courbes ;
//   · PENCHÉE sur la rampe (pente quantifiée au vingtième) ;
//   · COUPÉE au plan d'une bouche de tunnel : la part sous terre n'est pas peinte,
//     la tranche est fermée de noir (on voit la rame entrer dans l'ombre).
//
//   B5 · Fonte   voitures Sprague : caisse verte à filet crème, la voiture du milieu
//                rouge (la première classe), toit gris en anse de panier, trois portes
//                à baie, soufflets, bogies ; fanal unique au fronton de la cabine.
//   B6 · Néon    caisse blanche, bandeau vitré continu, filet et quatre portes bleus,
//                face avant noire et deux phares ; climatiseurs sur le toit.
//   B7-9 · monorail : caisse de nacre profilée à nez arrondis, baie continue teintée,
//                liseré de la lueur de l'ère (jade, or, violet), jupe sur la poutre.
//
// La NUIT, les baies sont cuites allumées (une autre image, même géométrie).
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { bakeBoat, surf, rampRGB, rgbOf, noReflect, asPart, dirIndex, dirTheta, projectLocal } from './boatBake.js';
import { snapDev } from '../blitSnap.js';

// Gabarits (px monde ; 1 tuile = 32).
export const CAR = {
  iron: { Lh: 14, W: 4.6, hb: 3.2, ht: 12.2, crown: 1.5, hOff: 0 },
  mono: { Lh: 14.5, W: 4.4, hb: 1.6, ht: 9.8, crown: 2.0, hOff: 3.5 },
};
// Pas entre deux voitures (centre à centre) : 28 px de caisse + 2 px de soufflets.
export const CAR_PITCH = { iron: 30, mono: 30.5 };

// ── Matières (rampes du plus clair au plus sombre) ───────────────────────────
const tint = (c, g, k) => {
  const b = rgbOf(c), t = rgbOf(g);
  return '#' + [0, 1, 2].map((i) => Math.round(b[i] * (1 - k) + t[i] * k).toString(16).padStart(2, '0')).join('');
};
const DARK = ['#4b4d50', '#3a3c3f', '#2c2e30', '#202123', '#151617'];
const BOGIE = ['#55575a', '#434548', '#333537', '#25272a', '#1a1b1d'];
const LIT = rgbOf('#ffe2a0');            // baies allumées la nuit
const LAMP = rgbOf('#fff4c8');
const TAIL = rgbOf('#e8483a');

const LIVERY = {
  5: {
    kind: 'iron', ink: '#141c17',
    body: ['#6d9c77', '#578a63', '#467553', '#365e41', '#284731', '#1b3123'],
    first: ['#c85e4a', '#b04b3a', '#933c2f', '#742f25', '#55221b', '#3a1712'],
    trim: ['#f1e8cc', '#ddd2b2', '#c3b692', '#a29572'],
    roof: ['#8f948d', '#7a7f78', '#656a64', '#515550', '#3e423d'],
    glass: ['#56717c', '#3f5862', '#2f444c', '#223239'],
    door: null,                           // portes : la caisse, un ton plus sombre
    windows: 'sprague', doors: [-8.6, 0, 8.6], doorW: 1.5, belt: [6.2, 6.9], win: [7.4, 10.6],
    front: 'sprague',
  },
  6: {
    kind: 'iron', ink: '#1a2330',
    body: ['#f7f8f6', '#e6e9e8', '#cfd3d4', '#b2b8bb', '#939a9f', '#737a80'],
    trim: ['#5b8fcb', '#4677b2', '#365f93', '#284873', '#1c3354'],
    roof: ['#d9dcdc', '#c2c6c7', '#a7acae', '#8c9295', '#71777a'],
    glass: ['#3b4a57', '#2c3843', '#212a33', '#171e25'],
    door: ['#5b8fcb', '#4677b2', '#365f93', '#284873', '#1c3354'],
    windows: 'band', doors: [-10.2, -3.4, 3.4, 10.2], doorW: 1.4, belt: [5.6, 6.4], win: [7.3, 10.5],
    front: 'modern',
  },
};
// Monorails : la nacre des maisons cosmiques, une pointe de la lueur de l'ère.
const GLOW = { 7: '#5af0b4', 8: '#ffcd78', 9: '#aa8cff' };
function monoLivery(band) {
  const g = GLOW[band];
  return {
    kind: 'mono', ink: tint('#20242c', g, 0.18),
    body: [tint('#fbfaf8', g, 0.03), tint('#eceaf0', g, 0.06), tint('#d6d3e0', g, 0.09), tint('#bcb8cc', g, 0.12), tint('#9d99b2', g, 0.14), tint('#7c7894', g, 0.16)],
    skirt: [tint('#bcb8cc', g, 0.12), tint('#9d99b2', g, 0.14), tint('#7c7894', g, 0.16), tint('#5d5a76', g, 0.18), tint('#423f58', g, 0.2)],
    glass: [tint('#4a6476', g, 0.26), tint('#3a5163', g, 0.28), tint('#2c4050', g, 0.3), tint('#1f2f3c', g, 0.32)],
    stripe: rgbOf(g),
    windows: 'mono', doors: [-7, 7], doorW: 1.4, win: [5.3, 8.3],
  };
}
export function liveryFor(band) {
  const b = Math.max(5, Math.min(9, band | 0));
  return b >= 7 ? monoLivery(b) : LIVERY[b];
}

// ── Le modèle ────────────────────────────────────────────────────────────────
// ctx = { band, role ('head' | 'mid' | 'tail'), first (voiture de 1re classe),
//         tp (pente, tangente), cut [lo, hi] (part peinte, en a), night }
// Tout ce qui est émis passe par `P2` : cisaillement de pente (h += a·tp + off)
// et coupe (a hors [lo, hi] → rien).
function makeModel(ctx) {
  const V = liveryFor(ctx.band);
  const mono = V.kind === 'mono';
  const G = mono ? CAR.mono : CAR.iron;
  const { Lh, W, ht, crown, hOff } = G;
  const tp = ctx.tp || 0;
  const off = Lh * Math.abs(tp) + hOff + 0.5;
  const [lo, hi] = ctx.cut || [-1e9, 1e9];
  const P2 = (a, c, h) => [a, c, h + a * tp + off];
  const keep = (a) => a >= lo && a <= hi;
  // Surface paramétrée dans le repère de la voiture, avec coupe : fn(u, v) → [a, c, h].
  const S2 = (S, fn, u0, u1, v0, v1, col) => surf(S, (u, v) => { const p = fn(u, v); return P2(p[0], p[1], p[2]); }, u0, u1, v0, v1,
    (u, v, nw, hh) => { const p = fn(u, v); return keep(p[0]) ? col(p[0], p[1], p[2], nw, hh) : null; });
  const BOX = (S, a0, a1, c0, c1, h0, h1, col) => {
    S2(S, (u, v) => [a0 + (a1 - a0) * u, c0 + (c1 - c0) * v, h1], 0, 1, 0, 1, (a, c, h, nw) => col('top', a, c, h, nw));
    for (const cc of [c0, c1]) S2(S, (u, v) => [a0 + (a1 - a0) * u, cc, h0 + (h1 - h0) * v], 0, 1, 0, 1, (a, c, h, nw) => col('side', a, c, h, nw));
    for (const aa of [a0, a1]) S2(S, (u, v) => [aa, c0 + (c1 - c0) * u, h0 + (h1 - h0) * v], 0, 1, 0, 1, (a, c, h, nw) => col('end', a, c, h, nw));
  };
  const glass = (nw) => (ctx.night ? LIT : rampRGB(V.glass, nw));
  const cabFront = ctx.role === 'head', cabRear = ctx.role === 'tail';
  const body = ctx.first && V.first ? V.first : V.body;
  const top = ht + crown + 2 * off + 2;
  return {
    bounds: [-Lh - 3, Lh + 3, -W - 2, W + 2, 0, top], ink: V.ink,
    anchors: () => {
      const A = {};
      const h = mono ? 6.6 : (V.front === 'modern' ? 5.2 : ht + 0.6);
      const cs = mono || V.front === 'modern' ? [-W * 0.62, W * 0.62] : [0];
      cs.forEach((c, i) => {
        if (cabFront) A['lamp' + i] = P2(Lh + 0.6, c, h);
        if (cabRear) A['tail' + i] = P2(-Lh - 0.6, c, h);
      });
      return A;
    },
    build(S) {
      noReflect(S, () => (mono ? buildMono : buildIron)(S, { V, G, ctx, P2, S2, BOX, keep, glass, body, cabFront, cabRear, off, lo, hi }));
    },
  };
}

// ── Voiture de fer (B5-6) ────────────────────────────────────────────────────
function buildIron(S, K) {
  const { V, G, ctx, S2, BOX, glass, body, cabFront, cabRear, lo, hi } = K;
  const { Lh, W, hb, ht, crown } = G;
  const doors = V.doors, dw = V.doorW;
  const inDoor = (a) => doors.some((d) => Math.abs(a - d) <= dw);
  // Travées entre les portes (et les bouts) : des baies de 2,2 px, trumeaux de 1,2.
  const bays = [];
  if (V.windows !== 'band') {
    const stops = [-Lh + 0.9, ...doors.flatMap((d) => [d - dw - 0.5, d + dw + 0.5]), Lh - 0.9];
    for (let k = 0; k + 1 < stops.length; k += 2) {
      const g0 = stops[k], g1 = stops[k + 1], ww = 2.2, pw = 1.2;
      const n = Math.max(1, Math.floor((g1 - g0 + pw) / (ww + pw)));
      const used = n * ww + (n - 1) * pw, x0 = g0 + (g1 - g0 - used) / 2;
      for (let j = 0; j < n; j += 1) bays.push([x0 + j * (ww + pw), x0 + j * (ww + pw) + ww]);
    }
  }
  // Décor d'une face latérale au point (a, h).
  const sidePaint = (a, h, nw) => {
    if (h < hb + 0.7) return rampRGB(V.kind === 'iron' && V.windows === 'band' ? DARK : body, nw, 1);   // brancard / jupe
    if (inDoor(a)) {
      const edge = doors.some((d) => Math.abs(Math.abs(a - d) - dw) < 0.35);
      if (h > V.win[0] + 0.2 && h < V.win[1] - 0.2 && !edge) return glass(nw);
      return rampRGB(V.door || body, nw, edge ? 2 : 1);
    }
    if (h >= V.belt[0] && h <= V.belt[1]) return rampRGB(V.trim, nw);
    if (h > V.win[0] && h < V.win[1]) {
      if (V.windows === 'band') return glass(nw);
      // Sprague : des baies séparées par des trumeaux.
      if (bays.some(([b0, b1]) => a >= b0 && a <= b1)) return glass(nw);
    }
    return rampRGB(body, nw);
  };
  asPart(S, 2, () => {
    // Les deux flancs.
    for (const cc of [-W, W]) S2(S, (u, v) => [u, cc, v], -Lh, Lh, hb, ht, (a, c, h, nw) => sidePaint(a, h, nw));
    // Le toit en anse de panier (gris), faîtage un ton plus clair.
    S2(S, (u, v) => [u, v, ht + crown * (1 - (v / W) * (v / W))], -Lh, Lh, -W, W, (a, c, h, nw) => {
      if (Math.abs(c) > W - 0.5) return rampRGB(V.roof, nw, 1);                      // gouttière
      return rampRGB(V.roof, nw);
    });
  });
  // Les bouts : cabine (fanal, vitres) ou intercirculation (porte, soufflet).
  const endPaint = (cab, rear) => (a, c, h, nw) => {
    const roofH = ht + crown * (1 - (c / W) * (c / W));
    if (h > ht) return rampRGB(V.roof, nw, 1);
    if (h < hb + 0.7) return rampRGB(DARK, nw);
    if (cab) {
      if (V.front === 'modern') {
        if (h > V.win[0] - 0.4 && h < V.win[1] + 0.2 && Math.abs(c) < W - 0.7) return ctx.night ? rgbOf('#1b222a') : rampRGB(V.glass, nw, 1);
        if (h > 4.6 && h < 6.0 && Math.abs(Math.abs(c) - W * 0.62) < 0.7) return rear ? TAIL : LAMP;
        if (h > V.belt[0] - 0.6 && h < V.belt[1] + 0.4) return rampRGB(V.trim, nw);
        return rampRGB(body, nw);
      }
      // Sprague : deux vitres frontales, un fanal au fronton.
      if (h > 8.0 && h < 10.8 && Math.abs(c) > 0.6 && Math.abs(c) < W - 0.7) return glass(nw);
      if (Math.abs(c) < 0.7 && h > ht - 0.9) return rear ? TAIL : LAMP;
      if (h >= V.belt[0] && h <= V.belt[1]) return rampRGB(V.trim, nw);
      return rampRGB(body, nw);
    }
    // Bout d'intercirculation : une porte à vitre au centre.
    if (Math.abs(c) < 1.4) return h > 7.6 && h < 10.4 && Math.abs(c) < 0.9 ? glass(nw) : rampRGB(body, nw, 1);
    void roofH;
    return rampRGB(body, nw);
  };
  asPart(S, 3, () => {
    S2(S, (u, v) => [Lh, u, hb + (ht + crown * (1 - (u / W) * (u / W)) - hb) * v], -W, W, 0, 1, endPaint(cabFront, false));
    S2(S, (u, v) => [-Lh, u, hb + (ht + crown * (1 - (u / W) * (u / W)) - hb) * v], -W, W, 0, 1, endPaint(cabRear, true));
  });
  // Soufflets (aux bouts sans cabine) : étroits, en caoutchouc gris.
  asPart(S, 4, () => {
    if (!cabFront) BOX(S, Lh, Lh + 0.9, -1.7, 1.7, hb + 1.0, ht - 1.0, (f, a, c, h, nw) => rampRGB(DARK, nw));
    if (!cabRear) BOX(S, -Lh - 0.9, -Lh, -1.7, 1.7, hb + 1.0, ht - 1.0, (f, a, c, h, nw) => rampRGB(DARK, nw));
  });
  // Châssis et bogies.
  asPart(S, 6, () => {
    BOX(S, -Lh + 1.6, Lh - 1.6, -W + 0.7, W - 0.7, 1.6, hb, (f, a, c, h, nw) => rampRGB(DARK, nw, 1));
    for (const ab of [-(Lh - 5.6), Lh - 5.6]) {
      BOX(S, ab - 3, ab + 3, -W + 0.3, W - 0.3, 0, 2.3, (f, a, c, h, nw) => {
        if (f === 'side') {
          // deux roues : disques sombres, boîte d'essieu claire
          for (const aw of [ab - 1.7, ab + 1.7]) {
            const r = Math.hypot(a - aw, h - 1.15);
            if (r < 0.45) return rampRGB(BOGIE, nw, -1);
            if (r < 1.2) return rampRGB(BOGIE, nw, 2);
          }
        }
        return rampRGB(BOGIE, nw);
      });
    }
    // Équipement de toit : climatiseurs (Néon) ou ventilateurs (Sprague).
    const roofTop = ht + crown;
    if (V.windows === 'band') {
      for (const ar of [-7.5, 7.5]) BOX(S, ar - 2.4, ar + 2.4, -2.0, 2.0, roofTop - 0.5, roofTop + 0.8, (f, a, c, h, nw) => rampRGB(V.roof, nw, f === 'top' ? (Math.abs(a - ar) < 1.2 ? 2 : 0) : 1));
    }
  });
  closeCut(S, K, -W, W, 0, ht + crown);
  void lo; void hi;
}

// ── Voiture de monorail (B7-9) ───────────────────────────────────────────────
// Caisse en super-ellipse (flancs presque droits, toit arrondi), nez effilé à
// chaque cabine, jupe qui enveloppe la poutre.
function buildMono(S, K) {
  const { V, G, ctx, S2, BOX, glass, cabFront, cabRear } = K;
  const { Lh, W, hb, ht, crown, hOff } = G;
  const hc = (hb + ht) / 2, Hd = (ht - hc), Hu = ht + crown - hc;
  const NOSE = 6;
  // Effilement du nez : 0 dans la caisse, 1 à la pointe.
  const tN = (a) => {
    if (cabFront && a > Lh - NOSE) return (a - (Lh - NOSE)) / NOSE;
    if (cabRear && a < -Lh + NOSE) return (-Lh + NOSE - a) / NOSE;
    return 0;
  };
  const shellAt = (a, th) => {
    const t = tN(a);
    const w = W * (1 - 0.42 * t * t), up = Hu * (1 - 0.62 * t * t), dn = Hd * (1 - 0.25 * t * t);
    const cs = Math.cos(th), sn = Math.sin(th);
    const p = sn > 0 ? 3.2 : 6;
    const c = w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p);
    const h = hc + (sn > 0 ? up : dn) * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p);
    return [a, c, h + hOff];
  };
  const doors = V.doors, dw = V.doorW;
  asPart(S, 2, () => {
    S2(S, (u, v) => shellAt(u, v), -Lh, Lh, -Math.PI, Math.PI, (a, c, h, nw) => {
      const hh = h - hOff, t = tN(a);
      // pare-brise : le haut du nez
      if (t > 0.18 && hh > hc + 0.4 && hh < ht + crown * 0.55) return ctx.night ? rgbOf('#1b222a') : rampRGB(V.glass, nw, 1);
      if (hh > V.win[0] && hh < V.win[1] && t < 0.12) {
        const door = doors.some((d) => Math.abs(Math.abs(a - d) - dw) < 0.3);
        return door ? rampRGB(V.body, nw, 1) : glass(nw);
      }
      if (hh > 4.2 && hh < 4.8) return V.stripe;
      if (hh < hb + 0.9) return rampRGB(V.skirt, nw);
      return rampRGB(V.body, nw, hh < 4.2 ? 1 : 0);
    });
  });
  // Bouts : fermés (cabine : la pointe du nez ; sinon un soufflet).
  const capAt = (a) => S2(S, (u, v) => {
    const q = shellAt(a, v);
    return [a, q[1] * u, hc + hOff + (q[2] - hc - hOff) * u];
  }, 0, 1, -Math.PI, Math.PI, (aa, c, h, nw) => rampRGB(V.body, nw));
  asPart(S, 3, () => { capAt(Lh); capAt(-Lh); });
  asPart(S, 4, () => {
    if (!cabFront) BOX(S, Lh, Lh + 1.0, -1.8, 1.8, hb + 1.2 + hOff, ht - 0.8 + hOff, (f, a, c, h, nw) => rampRGB(V.skirt, nw, 1));
    if (!cabRear) BOX(S, -Lh - 1.0, -Lh, -1.8, 1.8, hb + 1.2 + hOff, ht - 0.8 + hOff, (f, a, c, h, nw) => rampRGB(V.skirt, nw, 1));
  });
  // Jupe : elle enveloppe la poutre (dont le dessus est à h = 0 réel).
  asPart(S, 6, () => {
    BOX(S, -Lh + 2.6, Lh - 2.6, -2.7, 2.7, hOff - 2.6, hOff + hb + 0.2, (f, a, c, h, nw) => rampRGB(V.skirt, nw, 2));
  });
  closeCut(S, K, -W, W, hOff - 2.6, hOff + ht + crown);
}

// La tranche d'une coupe (bouche de tunnel) : un plan noir qui ferme la caisse.
function closeCut(S, K, c0, c1, h0, h1) {
  const { lo, hi, P2 } = K;
  for (const a of [lo, hi]) {
    if (!(Math.abs(a) < 1e8)) continue;
    asPart(S, 5, () => surf(S, (u, v) => P2(a, c0 + (c1 - c0) * u, h0 + (h1 - h0) * v), 0, 1, 0, 1, () => rgbOf('#0b0c0e')));
  }
}

// ── Cache des cuissons ───────────────────────────────────────────────────────
// Clé : bande | rôle | 1re classe | cap (32) | pente (1/20) | coupe (px) | nuit.
// Budget par frame comme la flotte : au-delà, une voiture garde sa dernière image.
export const METRO_CARS = { budget: 4 };
const CACHE_MAX = 700;
const _cache = new Map();
let _frame = -1, _spent = 0;
function toCanvas(R) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, R.w); cv.height = Math.max(1, R.h);
  cv.getContext('2d').putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
  return cv;
}
export const quantPitch = (tp) => Math.max(-9, Math.min(9, Math.round(tp * 20)));
export function bakeMetroCar(spec, now = 0, force = false) {
  const key = spec.band + '|' + spec.role + '|' + (spec.first ? 1 : 0) + '|' + spec.dir + '|' + spec.pq + '|'
    + (spec.cut ? spec.cut[0] + ':' + spec.cut[1] : '-') + '|' + (spec.night ? 1 : 0);
  let e = _cache.get(key);
  if (e) { _cache.delete(key); _cache.set(key, e); return e; }
  if (now !== _frame) { _frame = now; _spent = 0; }
  if (!force && _spent >= METRO_CARS.budget) return null;
  _spent += 1;
  const ctx = { band: spec.band, role: spec.role, first: spec.first, tp: spec.pq / 20, cut: spec.cut, night: spec.night };
  const M = makeModel(ctx);
  const theta = dirTheta(spec.dir);
  const b = bakeBoat(M, theta, ctx);
  const G = liveryFor(spec.band).kind === 'mono' ? CAR.mono : CAR.iron;
  e = { cv: toCanvas(b.img), w: b.img.w, h: b.img.h, ox: b.img.ox, oy: b.img.oy,
    off: G.Lh * Math.abs(ctx.tp) + G.hOff + 0.5, anchors: b.anchors };
  _cache.set(key, e);
  if (_cache.size > CACHE_MAX) _cache.delete(_cache.keys().next().value);
  return e;
}
export function metroCarsClear() { _cache.clear(); }

// Pose une voiture : (wx, wy, wz) = milieu de la voiture au niveau du rail (px monde),
// theta = cap monde. Rend { bx, by, dw, dh, img, lamps: [{x, y, tail}] } ou null.
// `memo` (objet stable par voiture) garde la dernière image quand le budget est épuisé.
export function drawMetroCar(ctx, spec, wx, wy, wz, now, memo = null) {
  let e = bakeMetroCar(spec, now, !memo || !memo._bk);
  if (!e && memo) e = memo._bk;
  if (!e || !e.cv) return null;
  if (memo) memo._bk = e;
  const z = CM.cam.zoom;
  const p = worldToScreen(wx, wy, wz - e.off);
  const bx = snapDev(p.x + e.ox * z), by = snapDev(p.y + e.oy * z);
  const dw = snapDev(e.w * z), dh = snapDev(e.h * z);
  const ps = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(e.cv, bx, by, dw, dh);
  ctx.imageSmoothingEnabled = ps;
  const lamps = [];
  for (const [k, a] of Object.entries(e.anchors || {})) {
    lamps.push({ x: p.x + a.X * z, y: p.y + a.Y * z, tail: k.startsWith('tail') });
  }
  return { bx, by, dw, dh, img: e.cv, lamps, e };
}
export { dirIndex, projectLocal };
