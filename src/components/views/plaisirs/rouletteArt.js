// LA ROUE DE LA ROULETTE, PEINTE PAR LE CODE (lot 3 des gains « vrai casino »).
// Vue de la table, en perspective : une ELLIPSE (écrasée de moitié), lumière en haut à
// gauche comme toute la carte. Du bord au centre : la jante d'acajou cerclée de laiton,
// la piste de la bille, la couronne des 37 cases (rouges, noires, le zéro vert, des
// cloisons de laiton), le cône et sa tourelle. Peinte au pixel dans une toile à sa
// propre échelle (l'image est agrandie sans lissage), à chaque image de l'animation.

import { ROULETTE_WHEEL, couleurOf } from '../../../game/core/actions/roulette.js';

export const WHEEL_D = 84;            // diamètre en pixels de la roue
export const WHEEL_SQUASH = 0.56;     // la perspective : la hauteur de l'ellipse
export const WHEEL_H = Math.ceil(WHEEL_D * WHEEL_SQUASH) + 6;
const R = WHEEL_D / 2 - 1;
const N = ROULETTE_WHEEL.length;
const STEP = (Math.PI * 2) / N;

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const C = {
  rimDark: hex('#3a1a10'), rim: hex('#6a2e1a'), rimLight: hex('#9a4a2a'),
  brass: hex('#d8a84a'), brassDark: hex('#8a6420'), brassLight: hex('#ffe08a'),
  track: hex('#c89a5a'), trackDark: hex('#8a6430'),
  rouge: hex('#b8242a'), rougeDark: hex('#7a1418'),
  noir: hex('#22181e'), noirDark: hex('#120c10'),
  vert: hex('#1f8a44'), vertDark: hex('#0e5426'),
  cone: hex('#7a3a20'), coneLight: hex('#a85a30'),
  ball: hex('#fbf6ec'), ballShade: hex('#b8b0a4'),
  ink: hex('#120a08')
};
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));

// L'angle d'une case (son centre) dans le repère de la roue, depuis le zéro.
export function pocketAngle(n) {
  const i = ROULETTE_WHEEL.indexOf(n);
  return (Math.max(0, i) + 0.5) * STEP;
}

// La couronne de la case sous un angle (repère de la roue).
function pocketAt(a) {
  const t = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return ROULETTE_WHEEL[Math.min(N - 1, Math.floor(t / STEP))];
}

// Peint la roue tournée de `wheelAngle`, la bille à l'angle ABSOLU `ballAngle` et au
// rayon relatif `ballR` (1 = le bord ; null : pas de bille), dans `ctx` (WHEEL_D × WHEEL_H).
export function drawWheel(ctx, wheelAngle, ballAngle = null, ballR = 0.86) {
  const W = WHEEL_D, H = WHEEL_H;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const cx = W / 2 - 0.5, cy = (H - 6) / 2;
  const put = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = (y * W + x) * 4;
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = a;
  };
  // L'ombre portée sous la roue (sur le tapis).
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const dx = (x - cx - 2) / R, dy = (y - cy - 4) / (R * WHEEL_SQUASH);
    if (dx * dx + dy * dy <= 1) put(x, y, C.ink, 90);
  }
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const dx = (x - cx) / R, dy = (y - cy) / (R * WHEEL_SQUASH);
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > 1) continue;
    const a = Math.atan2(dy, dx);
    // La lumière vient du haut à gauche : -1 (ombre) à 1 (lumière).
    const lum = -(dx * 0.6 + dy * 0.8) / Math.max(0.2, r || 1);
    let c;
    if (r > 0.93) c = lum > 0.35 ? C.brassLight : lum > -0.4 ? C.brass : C.brassDark;          // le cercle de laiton
    else if (r > 0.82) c = mix(C.rim, lum > 0 ? C.rimLight : C.rimDark, Math.min(1, Math.abs(lum)) * 0.7); // la jante
    else if (r > 0.74) c = mix(C.track, C.trackDark, (1 - lum) * 0.35);                         // la piste
    else if (r > 0.56) {                                                                         // les cases
      const rel = a - wheelAngle;
      const n = pocketAt(rel);
      const t = ((rel % STEP) + STEP) % STEP / STEP;
      if (t < 0.12 || r > 0.725) c = C.brassDark;                                                // les cloisons
      else {
        const col = couleurOf(n);
        const base = C[col], dark = C[col + 'Dark'];
        c = r < 0.6 ? dark : mix(base, dark, lum < 0 ? 0.35 : 0);
      }
    } else if (r > 0.2) {                                                                        // le cône
      const rel = a - wheelAngle;
      const spoke = Math.abs(((rel % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4) > Math.PI / 4 - 0.09;
      c = spoke ? C.brass : mix(C.cone, C.coneLight, Math.max(0, lum) * 0.8);
    } else c = lum > 0 ? C.brassLight : C.brass;                                               // la tourelle
    put(x, y, c);
  }
  // Le contour sombre de l'ellipse.
  for (let i = 0; i < 360; i += 1) {
    const a = (i / 360) * Math.PI * 2;
    put(Math.round(cx + Math.cos(a) * (R + 0.6)), Math.round(cy + Math.sin(a) * (R + 0.6) * WHEEL_SQUASH), C.ink);
  }
  // La bille.
  if (ballAngle != null) {
    const bx = Math.round(cx + Math.cos(ballAngle) * R * ballR);
    const by = Math.round(cy + Math.sin(ballAngle) * R * ballR * WHEEL_SQUASH) - 1;
    put(bx, by, C.ball); put(bx + 1, by, C.ball); put(bx, by + 1, C.ballShade); put(bx + 1, by + 1, C.ballShade);
    put(bx, by - 1, C.ink, 140); put(bx + 1, by - 1, C.ink, 140);
  }
  ctx.putImageData(img, 0, 0);
}

// L'animation d'un tour : rend { wheel, ball, ballR } à l'instant u ∈ [0, 1] pour une
// bille qui doit finir dans la case `n`. La roue tourne dans un sens en ralentissant, la
// bille dans l'autre ; à 60 % elle quitte la piste, à 88 % elle est dans sa case.
export function spinPose(u, n, wheel0 = 0) {
  const e = 1 - Math.pow(1 - Math.min(1, u), 2);
  const wheel = wheel0 + 7.5 * e;
  const lock = 0.88;
  const v = Math.min(1, u / lock);
  const rel = pocketAngle(n) + (Math.PI * 2 * 5 + 1.3) * Math.pow(1 - v, 3);
  const ball = wheel + rel;
  let ballR = 0.86;
  if (u > 0.6) {
    const w = Math.min(1, (u - 0.6) / (lock - 0.6));
    ballR = 0.86 - (0.86 - 0.66) * w + Math.sin(w * Math.PI * 3) * 0.035 * (1 - w);
  }
  return { wheel, ball, ballR };
}
