"use strict";
// ── L'AUTOROUTE DE L'ARTÈRE — le dessin (lot 2 de docs/PLAN-ETAGES.md) ───────
//
// Le PLAN (tracé, profil, échangeur) vient du layout : L.highway, calculé par
// procedural/highwayPlan.js. Ici on le dessine, au grain du sol, comme les ponts :
//   · le TABLIER, découpé en tronçons d'une demi-cellule. Chaque tronçon donne
//     DEUX acteurs au peintre : le dessus (chaussée, marquages, face intérieure des
//     glissières qui regardent ailleurs) trié à son coin ARRIÈRE, et la tranche
//     (face visible, sous-face, glissière extérieure) triée à son coin AVANT —
//     ce qui roule dessus passe entre les deux ;
//   · les PILES en T sur le terre-plein central, les lampadaires, l'OMBRE au sol ;
//   · la CIRCULATION : les vraies voitures de l'ère (drawIsoVehicle, skins de
//     vehSkinFor), posées à la hauteur du tablier. Elles vivent dans
//     highwayTraffic.js (voies, sorties vers les rues, retours par les rampes
//     d'accès) ; ici on ne fait que les dessiner, jusqu'au pied des rampes.
// Tout morceau qui se répète est CUIT (elevPaint) : le tablier droit tient en deux
// images par zoom.
//
// Molette : __highway({ on, cars, lamps, shadow }).
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { drawIsoVehicle } from './isoUnits.js';
import { muteSunShadow } from './isoSunShadow.js';
import { highwayTrafficLanes, h01 } from '../highwayTraffic.js';
import { bankRibbon, loopRibbons, HIGHWAY } from '../procedural/highwayPlan.js';
import { boxShapes, bakeShapes, blitBaked, makeBakeCache, artKdAt, elevGlow as glowAt, segGeo, shadeFace as shade, relTo as rel } from './elevPaint.js';

export const HWY = { on: true, cars: 1, lamps: 1, shadow: 0.55, th: 0.26, ph: 0.1 };

// Matière par ère : chaussée (2 tons), marquages, faces (éclairée / moyenne /
// ombre), sous-face, face intérieure des glissières, piles, contour, et la lueur
// des bandes de rive la nuit (null = aucune).
const MAT = {
  6: { top: ['#55575d', '#5c5e64'], line: 'rgba(236,232,220,0.85)', mid2: 'rgba(240,200,80,0.9)', lit: '#cfccc4', mid: '#aeaaa2', dark: '#86837d', under: '#5d5b57', parIn: '#9a978f', pyl: ['#c4c0b8', '#9e9a92'], out: '#3b3a37', edge: null, lamp: '255,190,110' },
  7: { top: ['#4a5552', '#505b58'], line: 'rgba(226,246,236,0.85)', mid2: 'rgba(120,230,190,0.9)', lit: '#e6f0ea', mid: '#c4d8cd', dark: '#93ab9e', under: '#5e6f66', parIn: '#b5c9be', pyl: ['#e0ece5', '#a9c2b5'], out: '#2d3a33', edge: '150,255,210', lamp: '170,255,220' },
  8: { top: ['#4f4a44', '#56514a'], line: 'rgba(250,240,214,0.85)', mid2: 'rgba(240,196,90,0.9)', lit: '#fbf3dc', mid: '#ead9a8', dark: '#c9ad6a', under: '#7a6a48', parIn: '#e0cfa0', pyl: ['#f6ecd0', '#d6bf86'], out: '#40341c', edge: '255,220,140', lamp: '255,214,140' },
  9: { top: ['#4c4860', '#534f68'], line: 'rgba(240,236,252,0.85)', mid2: 'rgba(180,150,255,0.9)', lit: '#f4f1fb', mid: '#dcd4ee', dark: '#b8acd6', under: '#6c6288', parIn: '#cfc5e6', pyl: ['#efeafa', '#c4b8e0'], out: '#3a3050', edge: '170,140,255', lamp: '200,180,255' },
};
const matFor = (band) => MAT[Math.max(6, Math.min(9, band | 0))];

// ── RUBANS (monde) ───────────────────────────────────────────────────────────
let _ribFor = null, _ribs = [];
function highwayRibbons(H, T) {
  if (!H) return [];
  if (_ribFor === H) return _ribs;
  const out = [];
  for (const b of H.banks) out.push(bankRibbon(H, b));
  const loops = loopRibbons(H);
  for (const r of loops) out.push(r);
  // L'AMORCE DE CHAQUE BOUCLE (retour Raph, 2026-10-06 : « le même problème sur le bras
  // d'insertion et de sortie ») : la boucle déborde du tablier dès son premier point, et
  // ce bout en l'air n'avait pas de face d'about — un trou sur le sol, en triangle. Un
  // tronçon de dessin seul (la circulation ne le connaît pas : ajouté APRÈS les rubans
  // qu'elle indexe), posé sur le tablier en amont, bord extérieur sur le bord du tablier :
  // la bretelle s'en écarte en biseau, comme une voie qui diverge.
  const xm = H.ax + 1, hwDeck = out.length ? out[0].w / 2 : 0.95;
  for (const r of loops) {
    const p0 = r.pts[0], p1 = r.pts[1];
    const west = r.pts[r.pts.length - 1].x < H.ax;
    const back = p1.y > p0.y ? -1 : 1;                   // en amont de la boucle, le long du tablier
    const x = west ? xm - hwDeck + r.w / 2 : xm + hwDeck - r.w / 2;
    out.push({ id: 'gore' + (west ? -1 : 1), pts: [{ x, y: p0.y + back * GORE_LEN, z: p0.z }, { ...p0 }], w: r.w, lanes: [], main: false, gore: true });
  }
  for (const r of out) {
    r.pts = r.pts.map((p) => ({ x: p.x * T, y: p.y * T, z: p.z * T }));
    r.cum = [0];
    for (let i = 1; i < r.pts.length; i += 1) r.cum.push(r.cum[i - 1] + Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].y - r.pts[i - 1].y));
    // Par tronçon : géométrie, et CLÉ DU PEINTRE = le coin avant (sud) de l'emprise,
    // comme un bâtiment. ⚠ Triés au coin ARRIÈRE (premier jet), les tronçons passaient
    // sous les tours situées DERRIÈRE eux (un bâtiment se trie à SON coin sud, plus
    // loin que le coin arrière d'un tablier voisin) : « des bâtiments passent dans
    // l'autoroute » (Raph, 2026-10-02).
    r.geo = []; r.dF = [];
    for (let i = 0; i < r.pts.length - 1; i += 1) {
      const g = segGeo(r.pts[i], r.pts[i + 1], r.w * T);
      r.geo.push(g);
      r.dF.push(Math.max(...[g.AL, g.BL, g.AR, g.BR].map((p) => depthOf(p[0], p[1]))));
    }
    r.clipL = new Array(r.geo.length).fill(FULL);
    r.clipR = new Array(r.geo.length).fill(FULL);
  }
  // LES BRETELLES S'INSÈRENT. ⚠ Le premier jet ôtait la tranche et la glissière d'un
  // tronçon ENTIER (une boucle dès qu'un de ses coins touchait le tablier ; le tablier sur
  // toute la longueur longée, sauf sa tranche) : des marches de blocs au départ de chaque
  // bretelle, la tranche du tablier peinte en travers de la boucle, des bouts de boucle
  // sans face (retour Raph, 2026-10-06). Désormais chaque bord est DÉCOUPÉ au point près :
  //   · une boucle (et son amorce) n'a de tranche et de glissière que hors du tablier ;
  //   · le tablier n'a de tranche et de glissière que là où aucune boucle ne le prolonge
  //     — sa glissière s'ouvre exactement sur la largeur de la bretelle et rejoint celle
  //     de la boucle (« la barrière de l'autoroute coupe le bras d'insertion », Raph).
  const decks = out.filter((r) => r.main), slabs = out.filter((r) => !r.main);
  if (decks.length && slabs.length) {
    const xW = (xm - hwDeck) * T, xE = (xm + hwDeck) * T, eps = 0.5;
    // Hors du tablier : x < xW ou x > xE (une boucle ne longe qu'un bord).
    for (const r of slabs) {
      r.geo.forEach((g, i) => {
        r.clipL[i] = outside(g.AL, g.BL, xW, xE, eps);
        r.clipR[i] = outside(g.AR, g.BR, xW, xE, eps);
      });
    }
    // Couvert : sur le bord du tablier, à l'intérieur d'un tronçon de boucle encore à sa
    // hauteur (les boucles ne descendent qu'une fois écartées).
    const zMin = H.deck * T - 0.35 * T;
    const quads = [];
    for (const r of slabs) r.geo.forEach((g, i) => { if (Math.min(r.pts[i].z, r.pts[i + 1].z) > zMin) quads.push(g); });
    let qy0 = Infinity, qy1 = -Infinity;
    for (const g of quads) for (const p of [g.AL, g.BL, g.AR, g.BR]) { qy0 = Math.min(qy0, p[1]); qy1 = Math.max(qy1, p[1]); }
    const covered = (x, y) => quads.some((g) => inQuad(x, y, g));
    for (const r of decks) {
      r.geo.forEach((g, i) => {
        if (Math.max(g.AL[1], g.BL[1]) < qy0 || Math.min(g.AL[1], g.BL[1]) > qy1) return;
        r.clipL[i] = uncovered(g.AL, g.BL, covered);
        r.clipR[i] = uncovered(g.AR, g.BR, covered);
      });
    }
  }
  _ribFor = H; _ribs = out;
  return out;
}

// ── DÉCOUPE DES BORDS ────────────────────────────────────────────────────────
// Un bord p→q d'un tronçon se dessine sur une liste d'intervalles [t0, t1] de son
// paramètre (FULL : en entier ; [] : pas du tout).
const FULL = [[0, 1]];
const GORE_LEN = 1.1;                                    // amorce d'une boucle, en tuiles
// La partie de p→q hors de la bande xW..xE (px monde), à `eps` près.
function outside(p, q, xW, xE, eps) {
  const dx = q[0] - p[0];
  const half = (lim, keep) => {                          // keep(x) : du bon côté de lim
    const kp = keep(p[0]), kq = keep(q[0]);
    if (kp && kq) return [0, 1];
    if (!kp && !kq) return null;
    const t = Math.abs(dx) < 1e-9 ? 0 : (lim - p[0]) / dx;
    return kp ? [0, t] : [t, 1];
  };
  const w = half(xW - eps, (x) => x < xW - eps), e = half(xE + eps, (x) => x > xE + eps);
  const out = [w, e].filter((iv) => iv && iv[1] - iv[0] > 1e-3);
  return out.length === 1 && out[0][0] === 0 && out[0][1] === 1 ? FULL : out;
}
// Le point (x, y) dans le quadrilatère convexe d'un tronçon (AL, BL, BR, AR).
function inQuad(x, y, g) {
  const P = [g.AL, g.BL, g.BR, g.AR];
  let sg = 0;
  for (let k = 0; k < 4; k += 1) {
    const p = P[k], q = P[(k + 1) & 3];
    const c = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    if (Math.abs(c) < 1e-6) continue;
    const s = c > 0 ? 1 : -1;
    if (!sg) sg = s; else if (s !== sg) return false;
  }
  return true;
}
// Les intervalles de p→q que `covered` ne couvre pas, au demi-pixel monde.
function uncovered(p, q, covered) {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(2, Math.ceil(L * 2));
  const out = [];
  let t0 = null;
  for (let k = 0; k <= n; k += 1) {
    const t = k / n, c = covered(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t);
    if (!c && t0 == null) t0 = t;
    if (c && t0 != null) { out.push([t0, (k - 0.5) / n]); t0 = null; }
  }
  if (t0 != null) out.push([t0, 1]);
  return out.length === 1 && out[0][0] === 0 && out[0][1] === 1 ? FULL : out;
}
const clipSig = (iv) => (iv === FULL ? '' : iv.length ? iv.map(([a, b]) => a.toFixed(3) + '-' + b.toFixed(3)).join('_') : 'x');
// LES JOINTS (retour Raph, 2026-10-06 : « des traits blancs entre les tuiles de
// l'autoroute ») : chaque tronçon est cuit sur SA grille de pixels d'art, ancrée à son
// origine ; deux tronçons voisins ne tombent pas sur la même, et leur bord commun
// laissait un pixel de sol entre eux. Chaque tronçon mord de JOINT px monde en amont,
// sur le précédent (≥ 2 pixels d'art à l'écran, en x comme en y).
const JOINT = 3;
const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
const backOff = (p, g) => [p[0] - g.ux * JOINT, p[1] - g.uy * JOINT, p[2]];
// Face verticale d'un bord p→q, de dz0 à dz1 au-dessus de lui, sur les intervalles
// `iv`, RABATTUE AU SOL : au pied des rampes, la tranche s'enfonçait sous la chaussée en
// blocs clairs (elle s'amincit maintenant jusqu'à zéro).
function edgeFaces(s, a, g, p, q, iv, dz0, dz1, col) {
  for (const [t0, t1] of iv) {
    const P = t0 === 0 ? backOff(p, g) : lerp3(p, q, t0), Q = lerp3(p, q, t1);
    const lo = (c) => Math.max(0, c[2] + dz0), hi = (c) => Math.max(0, c[2] + dz1);
    if (hi(P) - lo(P) < 0.25 && hi(Q) - lo(Q) < 0.25) continue;
    s.push({ poly: [rel(a, [P[0], P[1], hi(P)]), rel(a, [Q[0], Q[1], hi(Q)]), rel(a, [Q[0], Q[1], lo(Q)]), rel(a, [P[0], P[1], lo(P)])], col });
  }
}

function backShapes(M, r, a, b, g, i, T, clipL, clipR) {
  const s = [];
  const ph = HWY.ph * T;
  s.push({ poly: [rel(a, backOff(g.AL, g)), rel(a, g.BL), rel(a, g.BR), rel(a, backOff(g.AR, g))], col: M.top[i % 2] });
  // marquages : rives pleines, tirets entre voies (deux sur quatre), axe central
  const half = r.w / 2;
  const tick = (u, off, col) => {
    const p = [a.x + (b.x - a.x) * u + g.nx * off, a.y + (b.y - a.y) * u + g.ny * off, a.z + (b.z - a.z) * u];
    s.push({ px: rel(a, p), col });
  };
  for (let u = 0; u < 1; u += 0.25) {
    tick(u, half - 0.1 * T, M.line); tick(u, -half + 0.1 * T, M.line);
    if (r.main) {
      if ((i % 2) === 0) { tick(u, 0.49 * T, M.line); tick(u, -0.49 * T, M.line); }
      tick(u, 0.03 * T, M.mid2); tick(u, -0.03 * T, M.mid2);
    }
  }
  // glissières dont la face extérieure regarde AILLEURS : on voit leur face intérieure
  const visL = (g.nx + g.ny) > 0, visR = (-g.nx - g.ny) > 0;
  if (!visL) edgeFaces(s, a, g, g.AL, g.BL, clipL, 0, ph, M.parIn);
  if (!visR) edgeFaces(s, a, g, g.AR, g.BR, clipR, 0, ph, M.parIn);
  return s;
}
// Tranche, sous-face et glissière des bords visibles, sur leurs intervalles (cf.
// DÉCOUPE DES BORDS) : une boucle n'en a pas sur le tablier, le tablier pas là où une
// boucle le prolonge.
function frontShapes(M, g, a, T, clipL, clipR) {
  const s = [];
  const ph = HWY.ph * T, th = HWY.th * T;
  const visL = (g.nx + g.ny) > 0, visR = (-g.nx - g.ny) > 0;
  if (visL) {
    edgeFaces(s, a, g, g.AL, g.BL, clipL, -th, 0, shade(M, g.nx, g.ny));
    edgeFaces(s, a, g, g.AL, g.BL, clipL, -th, -th * 0.72, M.under);
    edgeFaces(s, a, g, g.AL, g.BL, clipL, 0, ph, M.lit);
  }
  if (visR) {
    edgeFaces(s, a, g, g.AR, g.BR, clipR, -th, 0, shade(M, -g.nx, -g.ny));
    edgeFaces(s, a, g, g.AR, g.BR, clipR, -th, -th * 0.72, M.under);
    edgeFaces(s, a, g, g.AR, g.BR, clipR, 0, ph, M.mid);
  }
  return s;
}
function pierShapes(M, r, g, top, T) {
  const big = r.main, c = (big ? 0.16 : 0.1) * T;
  const s = boxShapes(-c, -c, c, c, -top, -(big ? 0.14 : 0.05) * T, null, M.pyl[0], M.pyl[1], M.out);
  if (!big) return s;
  // chevêtre : poutre transversale sous le tablier
  const hw = r.w * 0.42;
  const ax = Math.abs(g.nx) > Math.abs(g.ny);
  if (ax) s.push(...boxShapes(-hw, -0.2 * T, hw, 0.2 * T, -0.18 * T, 0, M.mid, M.lit, M.dark, null));
  else s.push(...boxShapes(-0.2 * T, -hw, 0.2 * T, hw, -0.18 * T, 0, M.mid, M.lit, M.dark, null));
  return s;
}
// Gravats d'une travée tombée : trois blocs de dalle et de pile, de travers.
function rubbleShapes(M, T) {
  return [
    ...boxShapes(-0.45 * T, -0.3 * T, 0.2 * T, 0.25 * T, 0, 0.14 * T, M.top[0], M.mid, M.dark, M.out),
    ...boxShapes(0.05 * T, -0.15 * T, 0.5 * T, 0.35 * T, 0, 0.22 * T, M.lit, M.mid, M.dark, M.out),
    ...boxShapes(-0.2 * T, 0.1 * T, 0.08 * T, 0.42 * T, 0, 0.1 * T, M.pyl[0], M.pyl[1], M.dark, M.out),
  ];
}
function lampShapes(M, T) {
  const s = [];
  // mât plein (des pixels espacés se lisaient en pointillé au fort zoom)
  s.push(...boxShapes(-0.025 * T, -0.025 * T, 0.025 * T, 0.025 * T, 0, 0.62 * T, null, M.out, M.out, null));
  s.push({ px: [-0.06 * T, 0.06 * T, 0.64 * T], col: '#d8d4c8' }, { px: [0, 0, 0.64 * T], col: '#d8d4c8' }, { px: [0.06 * T, -0.06 * T, 0.64 * T], col: '#d8d4c8' });
  return s;
}

const _bakes = makeBakeCache(1600);
// Au zoom de REPOS (elevPaint.getZ) : pendant un glissement de zoom, la dernière
// cuisson de la forme, posée à l'échelle — plus 109 à 139 canvas recuits par frame.
function baked(key, make) {
  const d = CM.dpr || 1;
  return _bakes.getZ(key, d, (z) => bakeShapes(make(), z, d, artKdAt(z, d)));
}
const r1 = (v) => Math.round(v * 10) / 10;

// ── LA CIRCULATION ───────────────────────────────────────────────────────────
// Les voitures des voies (highwayTraffic.js : position, cap et tronçon du ruban tenus
// à jour par la simulation), jusqu'au pied des rampes : c'est là qu'elles passent à la
// flotte des rues, qui les dessine ensuite comme les autres.
function carActors(ribs, T, out, vis) {
  const lanes = highwayTrafficLanes();
  if (!lanes) return;
  for (const l of lanes) {
    const r = ribs[l.ri];
    if (!r) continue;
    const nF = r.dF.length - 1;
    for (const c of l.cars) {
      const x = c.x, y = c.y, z = c.z;
      if (!vis(x, y, z)) continue;
      const v = c.v, hx = c.hx, hy = c.hy;
      const vdir = Math.abs(hx) > Math.abs(hy) ? (hx > 0 ? 0 : 1) : (hy > 0 ? 2 : 3);
      const i = Math.min(nF, c.seg);
      // Clé : après SON tronçon et le suivant (le suivant, plus avant, recouvrirait le
      // bas de la carrosserie), jamais avant le sol qu'elle survole.
      const dCar = Math.max(depthOf(x, y), r.dF[i], r.dF[Math.min(nF, i + 1)]) + 0.05 * T;
      // Au pied d'une rampe (à ras du sol) : une voiture des rues, ombre comprise — celle
      // qu'elle garde en descendant dans la flotte.
      const ground = z < 0.04 * T;
      out.push({ wx: x, wy: y, d: dCar, draw(ctx, nw) {
        v.x = x; v.y = y; v.gx = Math.floor(x / T); v.gy = Math.floor(y / T);
        v.dir = vdir; v.tx = x + hx * T; v.ty = y + hy * T;
        const zz = CM.cam.zoom, nn = CM.nightF || 0;
        // ⚠ PERF (rendu logiciel) : les phares du jeu sont deux arcs et un dégradé radial
        // par véhicule — ×60 voitures sur un tablier, c'était le poste n° 2 de la nuit.
        // On les coupe (parkT > 0 éteint les phares, rien d'autre ne le lit en iso) et on
        // pose deux lueurs au pixel, comme le trafic aérien. (highwayTraffic les rallume
        // en la rendant à la rue.)
        v.parkT = nn > 0.3 ? 1 : 0;
        if (ground) {
          drawIsoVehicle(ctx, v, nw, zz);
        } else {
          ctx.save();
          ctx.translate(0, -Math.round(z * zz * (CM.dpr || 1)) / (CM.dpr || 1));
          // ⚠ Ombre et REFLET coupés (muteSunShadow) : sous la translation, le crochet du
          // reflet lirait la voiture à une fausse hauteur d'écran et la refléterait dans
          // le fleuve ; le tablier porte déjà son ombre.
          try { muteSunShadow(() => drawIsoVehicle(ctx, v, nw, zz)); } finally { ctx.restore(); }
        }
        if (nn > 0.3) {
          const f = worldToScreen(x + hx * 0.22 * T, y + hy * 0.22 * T, z + 0.08 * T);
          const r0 = worldToScreen(x - hx * 0.22 * T, y - hy * 0.22 * T, z + 0.08 * T);
          glowAt(f.x, f.y, 4 * zz / 0.625, '255,244,210', 0.65 * nn);
          glowAt(r0.x, r0.y, 3 * zz / 0.625, '255,70,50', 0.6 * nn);
        }
      } });
    }
  }
}

// ── LES ACTEURS ──────────────────────────────────────────────────────────────
const hwyStats = { segs: 0, cars: 0 };
export function highwayActors(now, out, decay = 0) {
  hwyStats.segs = 0; hwyStats.cars = 0;
  const L = CM.layout;
  if (!HWY.on || !L || !L.highway || CM.lodActive) return;
  const T = CM.TILE, z = CM.cam.zoom, d = CM.dpr || 1;
  const band = (L.counts && L.counts.eraBand) | 0;
  const M = matFor(band);
  const night = (CM.nightF || 0) * (1 - decay);
  const mg = 3 * T * z;
  const vis = (x, y, zz) => {
    const p = worldToScreen(x, y, zz);
    return p.x > -mg && p.x < CM.cw + mg && p.y > -mg && p.y < CM.ch + mg * 2;
  };
  const ribs = highwayRibbons(L.highway, T);
  ribs.forEach((r, ri) => {
    for (let i = 0; i < r.pts.length - 1; i += 1) {
      const a = r.pts[i], b = r.pts[i + 1];
      if (Math.max(a.z, b.z) < 0.03 * T) continue;      // au sol : la rue suffit
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (!vis(mx, my, a.z) && !vis(mx, my, 0)) continue;
      // LA CHUTE (lot 4) : des travées entières tombent, par grappes de 3 tronçons
      // (un tirage par grappe) ; leurs gravats restent au sol, sous le vide.
      if (decay > 0.5 && h01(ri * 977 + Math.floor(i / 3) * 31) < (decay - 0.4) * 1.0) {
        if (i % 3 === 1) out.push({ wx: mx, wy: my, d: depthOf(mx, my), draw(ctx) {
          const bk = baked('ru|' + band, () => rubbleShapes(M, T));
          const s0 = worldToScreen(mx, my, 0);
          blitBaked(ctx, bk, s0.x, s0.y, d);
        } });
        continue;
      }
      hwyStats.segs += 1;
      const g = r.geo[i];
      const clL = r.clipL[i], clR = r.clipR[i];
      // Les CLÉS DE FORME du tronçon et son ombre, gardées sur le plan (audit du 05/10,
      // PERF-54) : elles ne changent qu'avec lui (et la bande, et les molettes d'ombre et
      // d'épaisseur) ; rebâties à chaque frame, elles se rehachaient aussi à chaque
      // lecture du cache. Mêmes textes de clé que la version calculée sur place.
      const kc = r.kc || (r.kc = []);
      let K = kc[i];
      if (!K || K.band !== band) {
        const kGeo = r1(b.x - a.x) + ',' + r1(b.y - a.y) + ',' + r1(a.z) + ',' + r1(b.z - a.z) + '|' + r.w + '|' + (r.main ? 1 : 0) + '|' + clipSig(clL) + '|' + clipSig(clR);
        K = kc[i] = { band, sh: 'sh|' + kGeo, bk: 'bk|' + band + '|' + (i % 2) + '|' + kGeo, fr: 'fr|' + band + '|' + kGeo, sk: null, o: null, q: null, sd: 0, th: null, pi: '', la: '' };
      }
      const dFront = r.dF[i];
      // ombre au sol, décalée vers le bas-droite (soleil haut-gauche) ; pas pour l'amorce
      // d'une boucle, posée sur le tablier (deux ombres l'une sur l'autre foncent le sol)
      if (HWY.shadow > 0 && !r.gore) {
        const sk = HWY.shadow;
        if (K.sk !== sk) {
          const o = { x: a.x + a.z * sk, y: a.y, z: 0 };
          K.q = [g.AL, g.BL, g.BR, g.AR].map((p) => [p[0] + p[2] * sk - o.x, p[1] - o.y, 0]);
          K.sd = Math.min(...K.q.map((p) => depthOf(p[0] + o.x, p[1] + o.y)));
          K.o = o; K.sk = sk;
        }
        const o = K.o, q = K.q, kSh = K.sh;
        out.push({ wx: o.x, wy: o.y, d: K.sd - 0.05 * T, draw(ctx) {
          const bk = baked(kSh, () => [{ poly: q, col: '#141828' }]);
          const p = worldToScreen(o.x, o.y, 0);
          blitBaked(ctx, bk, p.x, p.y, d, 0.16 * (1 - 0.75 * (CM.nightF || 0)));
        } });
      }
      const kBk = K.bk, kFr = K.fr;
      out.push({ wx: mx, wy: my, d: dFront - 0.002 * T, draw(ctx) {
        const bk = baked(kBk, () => backShapes(M, r, a, b, g, i, T, clL, clR));
        const p = worldToScreen(a.x, a.y, a.z);
        blitBaked(ctx, bk, p.x, p.y, d);
      } });
      out.push({ wx: mx, wy: my, d: dFront, draw(ctx) {
        const bk = baked(kFr, () => frontShapes(M, g, a, T, clL, clR));
        const p = worldToScreen(a.x, a.y, a.z);
        blitBaked(ctx, bk, p.x, p.y, d);
        // la nuit, les ères cosmiques allument la rive du tablier
        if (M.edge && night > 0.05) {
          const pb = worldToScreen(b.x, b.y, b.z);
          glowAt((p.x + pb.x) / 2, (p.y + pb.y) / 2 + HWY.th * T * z * 0.5, 3 * z / 0.625, M.edge, 0.35 * night);
        }
      } });
      // piles : sur le terre-plein (tablier principal) toutes les 3 cellules, sous
      // les boucles toutes les 4 tranches
      const every = r.main ? 6 : 4;
      const top = a.z - HWY.th * T;
      if (i % every === 0 && top > 0.35 * T && !r.gore) {
        if (K.th !== HWY.th) { K.th = HWY.th; K.pi = 'pi|' + band + '|' + r1(top) + '|' + (r.main ? 1 : 0) + '|' + (Math.abs(g.nx) > Math.abs(g.ny) ? 1 : 0); }
        const kPi = K.pi;
        // ⚠ AVANT le dessus du tablier : le chevêtre est SOUS la chaussée ; trié à
        // l'aplomb de l'axe, il se peignait par-dessus elle.
        out.push({ wx: a.x, wy: a.y, d: dFront - 0.3 * T, draw(ctx) {
          const bk = baked(kPi, () => pierShapes(M, r, g, top, T));
          const p = worldToScreen(a.x, a.y, top);
          blitBaked(ctx, bk, p.x, p.y, d);
        } });
      }
      // lampadaires sur l'axe du tablier principal, toutes les 2 cellules
      if (HWY.lamps > 0 && r.main && i % 4 === 2 && a.z > 0.5 * T) {
        const kLa = K.la || (K.la = 'la|' + band);
        out.push({ wx: a.x, wy: a.y, d: dFront + 0.01 * T, draw(ctx) {
          const p = worldToScreen(a.x, a.y, a.z);
          blitBaked(ctx, baked(kLa, () => lampShapes(M, T)), p.x, p.y, d);
          if (night > 0.05) {
            const ph = worldToScreen(a.x, a.y, a.z + 0.64 * T);
            glowAt(ph.x, ph.y, 13 * z / 0.625, M.lamp, 0.5 * night);
          }
        } });
      }
    }
  });
  if (HWY.cars > 0 && decay < 0.5) { const n0 = out.length; carActors(ribs, T, out, vis); hwyStats.cars += out.length - n0; }
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  // `cars` règle aussi l'effectif de la circulation (highwayTraffic : 0 vide le tablier).
  window.__highway = (o) => { if (o) { Object.assign(HWY, o); if (o.cars != null) window.__highwayTraffic({ cars: o.cars }); } const L = CM.layout; return { ...HWY, plan: L && L.highway ? { banks: L.highway.banks.map((b) => ({ sign: b.sign, y0: b.y0, len: b.len, s0: b.s0, s1: b.s1, ramp: b.ramp })), interchange: L.highway.interchange, ax: L.highway.ax } : null, stats: { ...hwyStats }, deck: HIGHWAY.deck }; };
}
