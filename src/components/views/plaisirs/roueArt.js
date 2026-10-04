// LA ROUE DE LA MAISON, PEINTE PAR LE CODE (2026-10-04). Un disque de face, au pixel :
// seize cases rouges et crème (la plus belle en or), séparées de filets de laiton ; la
// jante de laiton cloutée de seize ampoules (elles courent pendant le tour, clignotent
// au gain) ; le moyeu de bois et sa calotte ; le doigt de laiton en haut. La VALEUR de
// chaque case se lit en PIÈCES (plus de pièces, plus de Faveur ; la couronne pour la
// plus belle) : une pièce est ronde, elle reste nette à tout angle — un chiffre tourné
// au pixel ne le serait pas. Lumière en haut à gauche, comme toute la carte.

import { ROUE_SEGMENTS_H } from '../../../game/core/balance.js';

export const ROUE_D = 132;                        // diamètre du disque, en pixels
export const ROUE_W = ROUE_D + 4;                 // la toile : le disque et son ombre
export const ROUE_H = ROUE_D + 14;                // … et le doigt au-dessus
const N = ROUE_SEGMENTS_H.length;
export const ROUE_STEP = (Math.PI * 2) / N;
const CX = ROUE_W / 2 - 0.5;
const CY = 10 + ROUE_D / 2 - 0.5;
const R = ROUE_D / 2 - 1;

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const C = {
  rouge: hex('#b8242a'), rougeDark: hex('#86161c'), rougeLight: hex('#d84a3e'),
  creme: hex('#f0dcae'), cremeDark: hex('#d2b884'), cremeLight: hex('#fff2d0'),
  or: hex('#e2b23e'), orDark: hex('#a8781e'), orLight: hex('#ffe08a'),
  laiton: hex('#d8a84a'), laitonDark: hex('#7a5418'), laitonLight: hex('#ffe9a8'),
  bois: hex('#6a2e1a'), boisDark: hex('#3a1a10'), boisLight: hex('#9a4a2a'),
  ampoule: hex('#fff6c8'), ampouleOff: hex('#8a6a3a'), halo: hex('#ffd860'),
  piece: hex('#f2c94c'), pieceDark: hex('#9a6c14'), pieceLight: hex('#fff3b0'),
  ink: hex('#1a0e08')
};
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));

// Le nombre de pièces d'une case (1 à 7), ou 0 pour la plus belle (la couronne).
const PALIERS = [...new Set(ROUE_SEGMENTS_H)].sort((a, b) => a - b);
const TOP = PALIERS[PALIERS.length - 1];
export function roueCoins(i) {
  const h = ROUE_SEGMENTS_H[i];
  return h >= TOP ? 0 : PALIERS.indexOf(h) + 1;
}

// L'angle de la roue qui amène la case `i` sous le doigt (en haut).
export function roueAngleFor(i) {
  return -i * ROUE_STEP;
}

// La case sous le doigt pour un angle de roue donné.
export function roueIndexAt(angle) {
  const t = ((-angle / ROUE_STEP) % N + N) % N;
  return Math.round(t) % N;
}

// Peint la roue tournée de `angle` (radians ; 0 = la case 0 en haut). `lit` : phase des
// ampoules (entier) ; `glow` : l'index de la case gagnante à faire luire (ou -1).
export function drawRoue(ctx, angle, { lit = 0, glow = -1, allLit = false } = {}) {
  const W = ROUE_W, H = ROUE_H;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const put = (x, y, c, a = 255) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = (y * W + x) * 4;
    if (a < 255 && d[k + 3] > 0) {
      const t = a / 255;
      d[k] = Math.round(d[k] + (c[0] - d[k]) * t);
      d[k + 1] = Math.round(d[k + 1] + (c[1] - d[k + 1]) * t);
      d[k + 2] = Math.round(d[k + 2] + (c[2] - d[k + 2]) * t);
      return;
    }
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = a;
  };

  // L'ombre portée (en bas à droite).
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const dx = x - CX - 2, dy = y - CY - 3;
    if (dx * dx + dy * dy <= R * R) put(x, y, C.ink, 80);
  }

  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const dx = x - CX, dy = y - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r = dist / R;
    if (r > 1) continue;
    const phi = Math.atan2(dy, dx);
    // Lumière haut-gauche : -1 (ombre) → 1 (lumière).
    const lum = -(dx * 0.6 + dy * 0.8) / Math.max(1, dist);
    let c;
    if (r > 0.9) {
      // La jante de laiton.
      c = r > 0.975 ? C.laitonDark : lum > 0.4 ? C.laitonLight : lum > -0.45 ? C.laiton : C.laitonDark;
    } else if (r > 0.27) {
      // Les cases.
      const rel = phi - angle + Math.PI / 2;
      const t = (((rel / ROUE_STEP) + 0.5) % N + N) % N;
      const i = Math.floor(t) % N;
      const edge = Math.min(t - Math.floor(t), 1 - (t - Math.floor(t))) * ROUE_STEP * dist;
      if (edge < 0.9 || r > 0.885) c = C.laitonDark;
      else {
        const top = ROUE_SEGMENTS_H[i] >= TOP;
        const base = top ? C.or : i % 2 === 0 ? C.rouge : C.creme;
        const dark = top ? C.orDark : i % 2 === 0 ? C.rougeDark : C.cremeDark;
        const light = top ? C.orLight : i % 2 === 0 ? C.rougeLight : C.cremeLight;
        c = lum > 0.55 ? mix(base, light, 0.35) : lum < -0.45 ? mix(base, dark, 0.45) : base;
        if (i === glow) c = mix(c, C.ampoule, 0.38);
      }
    } else if (r > 0.22) {
      c = C.laiton;                                            // l'anneau du moyeu
    } else if (r > 0.1) {
      c = lum > 0.2 ? C.boisLight : lum < -0.3 ? C.boisDark : C.bois; // le bois
    } else {
      c = lum > 0 ? C.laitonLight : C.laiton;                  // la calotte
    }
    put(x, y, c);
  }

  // Les ampoules de la jante : une à chaque filet, allumées une sur deux (elles courent).
  for (let i = 0; i < N; i += 1) {
    const a = angle + (i + 0.5) * ROUE_STEP - Math.PI / 2;
    const bx = CX + Math.cos(a) * R * 0.94, by = CY + Math.sin(a) * R * 0.94;
    const on = allLit || ((i + lit) % 2 === 0);
    if (on) for (let oy = -2; oy <= 2; oy += 1) for (let ox = -2; ox <= 2; ox += 1) if (ox * ox + oy * oy <= 4) put(bx + ox, by + oy, C.halo, 90);
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      if (Math.abs(ox) + Math.abs(oy) > 1) continue;
      put(bx + ox, by + oy, on ? C.ampoule : C.ampouleOff);
    }
  }

  // Les pièces de chaque case, empilées du bord vers le moyeu ; la couronne en or.
  const coin = (px, py) => {
    for (let oy = -2; oy <= 2; oy += 1) for (let ox = -2; ox <= 2; ox += 1) {
      const q = ox * ox + oy * oy;
      if (q > 5) continue;
      put(px + ox, py + oy, q >= 4 ? C.pieceDark : (ox + oy < -1 ? C.pieceLight : C.piece));
    }
  };
  for (let i = 0; i < N; i += 1) {
    const a = angle + i * ROUE_STEP - Math.PI / 2;
    const n = roueCoins(i);
    if (n === 0) {
      // La couronne : trois pointes sur un bandeau, au milieu de la case.
      const px = CX + Math.cos(a) * R * 0.66, py = CY + Math.sin(a) * R * 0.66;
      for (let ox = -4; ox <= 4; ox += 1) { put(px + ox, py + 2, C.pieceDark); put(px + ox, py + 1, C.piece); put(px + ox, py, C.piece); }
      for (const ox of [-4, 0, 4]) { put(px + ox, py - 1, C.piece); put(px + ox, py - 2, C.pieceLight); }
      for (const ox of [-3, -1, 1, 3]) put(px + ox, py - 1, C.piece);
      put(px, py - 3, C.rougeLight);
      continue;
    }
    for (let j = 0; j < n; j += 1) {
      const rr = R * (0.8 - j * 0.075);
      coin(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr);
    }
  }

  // Le doigt de laiton, en haut, qui pointe dans la roue.
  const tipY = CY - R + 7;
  for (let y = 0; y <= tipY; y += 1) {
    const half = Math.max(0, Math.round((tipY - y) * 0.42));
    for (let x = -half; x <= half; x += 1) {
      const edge = Math.abs(x) === half || y === 0;
      put(CX + x, y, edge ? C.laitonDark : x < 0 ? C.laitonLight : C.laiton);
    }
  }

  ctx.putImageData(img, 0, 0);
}

// L'animation d'un tour : rend l'angle à l'instant u ∈ [0, 1], de `from` jusqu'à poser
// la case `i` sous le doigt après `tours` tours pleins. Freinage en quartique.
export function spinAngle(u, from, i, tours = 4) {
  const target0 = roueAngleFor(i);
  // L'angle final, au moins `tours` tours plus loin que `from`, aligné sur la case.
  let end = target0 + Math.ceil((from - target0) / (Math.PI * 2)) * Math.PI * 2;
  end += tours * Math.PI * 2;
  const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 4);
  return from + (end - from) * e;
}
