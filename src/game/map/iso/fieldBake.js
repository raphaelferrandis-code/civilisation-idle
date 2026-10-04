"use strict";
// ── LES CHAMPS CUITS — peints au pixel par le code (docs/PLAN-TERROIR.md, T2) ──
//
// Raph (2026-10-03) : le champ « se lisait comme un tapis posé » — un bloc
// vectoriel quadrillé en parcelles égales, liseré clair/sombre par carré (effet
// carrelage), tracé à la résolution de l'écran au milieu d'une ville en pixels.
// Ici une PARCELLE du terroir est peinte pixel par pixel en iso exact, comme le
// pont et les merveilles, et posée à la grille :
//   · des LANIÈRES de cultures le long du grand côté (largeurs inégales), chacune
//     avec ses rangs d'un pixel (une droite du monde est une diagonale 2:1 nette à
//     l'écran) ;
//   · une CLÔTURE sur les bords — une par limite : le côté nord et ouest de chaque
//     parcelle, plus le sud et l'est quand ils bordent la campagne ;
//   · la RÉCOLTE posée au champ (gerbes, meules, bottes).
// La saison change la récolte (vert au printemps, doré l'été, éteules à
// l'automne, neige l'hiver) — quatre états dirigés, jamais d'interpolation.
//
// UN CHAMP PAR ÈRE (Raph : « go pour toutes les ères ») :
//   0-1 feu, bois  petits lopins, plessis de branches tressées, gerbes
//   2   pierre     lanières, haies vives, meules
//   3   couronne   bocage : haies et arbres de haie
//   4   marbre     murets de pierre sèche, vignes et oliviers
//   5   fonte      grandes pièces, clôtures à lisses, bottes, betteraves
//   6   néon       cercles d'arrosage à pivot sur terre nue
//   7-9 cosmiques  rangs de plantes de lumière sur substrat sombre, piquets de
//                  cristal
//
// Repère LOCAL d'une parcelle : x vers l'est, y vers le sud (px monde), origine
// au coin NORD de la parcelle ; h = altitude (px d'écran). Écran au zoom 1 :
// X = x − y, Y = (x + y)/2 − h.
//
// Pur : aucun DOM, aucun CM. Testable en Node.
import { put, rgbOf, h32, makeRaster } from './isoPixelPaint.js';
import { box, revolve, taper, ballProf, cyl, line, mats, pixelFinish } from './wonderBake.js';

const T = 32;
// Rampe de chaque culture : clair → sombre (4 crans).
const CROP = {
  ble:      ['#e4c56a', '#cfab4f', '#b38e3b', '#8e6e2c'],     // blé mûr
  epeautre: ['#cdb877', '#b49e5f', '#968149', '#746337'],     // épeautre, millet (âges anciens)
  orge:     ['#cfc777', '#b5ae5f', '#958f49', '#737037'],     // orge
  vert:     ['#86b552', '#70a044', '#5a8936', '#466e2b'],     // jeune blé
  labour:   ['#a8815e', '#94704f', '#7f5e42', '#694c35'],     // terre retournée
  pre:      ['#7fae58', '#6a9a49', '#567f3b', '#41662e'],     // pré de fauche
  lin:      ['#94b383', '#7f9f70', '#6a8a5e', '#55704b'],     // lin en fleur
  potager:  ['#7a5a3c', '#664a31', '#523b27', '#3f2d1e'],     // terre du potager
  vigne:    ['#9a7b55', '#86694a', '#6f573d', '#594531'],     // terre de la vigne
  olive:    ['#b9a27a', '#a48e68', '#8c7757', '#736046'],     // terre sèche de l'oliveraie
  bett:     ['#8a6a4a', '#765a3f', '#614a34', '#4c3a29'],     // terre des betteraves
  chaume:   ['#d7bd7c', '#c0a564', '#a1874d', '#7d683a'],     // éteules (après moisson)
  neige:    ['#f2f5f9', '#dfe6ef', '#c6d0dd', '#a9b6c6'],
};
// Assolement par saison : la NATURE de chaque lanière (tirée une fois) devient une
// culture différente selon la saison. `vigne`, `olive`, `bett` gardent leur sol et
// changent de feuillage (cf. cropAt).
const SEASON_CROP = [
  { cereal: 'vert', ancient: 'vert', barley: 'vert', fallow: 'labour', meadow: 'pre', flax: 'lin', garden: 'potager', vine: 'vigne', olive: 'olive', beet: 'labour' },
  { cereal: 'ble', ancient: 'epeautre', barley: 'orge', fallow: 'labour', meadow: 'pre', flax: 'lin', garden: 'potager', vine: 'vigne', olive: 'olive', beet: 'bett' },
  { cereal: 'chaume', ancient: 'chaume', barley: 'chaume', fallow: 'labour', meadow: 'pre', flax: 'labour', garden: 'potager', vine: 'vigne', olive: 'olive', beet: 'bett' },
  { cereal: 'neige', ancient: 'neige', barley: 'neige', fallow: 'neige', meadow: 'neige', flax: 'neige', garden: 'neige', vine: 'neige', olive: 'neige', beet: 'neige' },
];
// Le style de chaque âge.
const STYLES = {
  ancient: { natures: ['ancient', 'ancient', 'ancient', 'fallow', 'meadow', 'garden'], border: 'plessis', stack: 'gerbe', w0: 8, wv: 9 },
  wood:    { natures: ['ancient', 'cereal', 'barley', 'fallow', 'meadow', 'garden'], border: 'plessis', stack: 'gerbe', w0: 9, wv: 12 },
  stone:   { natures: ['cereal', 'cereal', 'cereal', 'barley', 'barley', 'fallow', 'meadow', 'flax', 'garden'], border: 'haie', stack: 'meule', w0: 10, wv: 15 },
  crown:   { natures: ['cereal', 'cereal', 'cereal', 'barley', 'fallow', 'meadow', 'flax', 'garden'], border: 'bocage', stack: 'meule', w0: 10, wv: 15 },
  marble:  { natures: ['cereal', 'cereal', 'vine', 'vine', 'olive', 'fallow', 'meadow'], border: 'muret', stack: 'meule', w0: 12, wv: 14 },
  iron:    { natures: ['cereal', 'cereal', 'cereal', 'barley', 'beet', 'fallow', 'meadow'], border: 'cloture', stack: 'botte', w0: 16, wv: 16 },
  neon:    { natures: ['cereal', 'cereal', 'barley', 'meadow', 'fallow'], border: 'none', stack: 'botte', pivot: true },
  cosmic:  { natures: ['a', 'b', 'c'], border: 'cristal', stack: null, glow: true, w0: 10, wv: 8 },
};
export function fieldStyleKey(band) {
  return band <= 0 ? 'ancient' : band === 1 ? 'wood' : band === 2 ? 'stone' : band === 3 ? 'crown'
    : band === 4 ? 'marble' : band === 5 ? 'iron' : band === 6 ? 'neon' : 'cosmic';
}
// Haie vive : feuillage (clair → sombre) ; l'hiver, branches nues saupoudrées.
const HEDGE = ['#5f8f3e', '#4b7a33', '#3a6329', '#2a4b1f'];
const HEDGE_W = ['#8a8f96', '#6f747b', '#575b61', '#3f4247'];
const WOOD = ['#a47a4c', '#86613a', '#6b4b2b', '#4a321c'];
const INK = '#1d2416';

function frameFor(W, H, top) {
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (const x of [0, W]) for (const y of [0, H]) for (const h of [0, top]) {
    const X = x - y, Y = (x + y) / 2 - h;
    X0 = Math.min(X0, X); X1 = Math.max(X1, X); Y0 = Math.min(Y0, Y); Y1 = Math.max(Y1, Y);
  }
  const ox = Math.floor(X0) - 2, oy = Math.floor(Y0) - 2;
  return makeRaster(ox, oy, Math.ceil(X1) - ox + 3, Math.ceil(Y1) - oy + 3);
}

// Les lanières d'une parcelle : largeurs inégales qui pavent le petit côté,
// chacune avec sa nature. Déterministe (graine).
function stripsOf(span, seed, S) {
  const out = [];
  let a = 0, k = 0;
  const N = S.natures;
  while (a < span - 0.5) {
    let w = S.w0 + (h32(seed, k, 3) % S.wv);
    if (span - (a + w) < S.w0 - 1) w = span - a;               // pas de lanière filiforme au bord
    const n = N[h32(seed, k, 7) % N.length];
    // Deux voisines de même nature se fondent en une : on retire au sort.
    const prev = out.length ? out[out.length - 1].n : null;
    out.push({ a, b: a + w, n: n === prev ? N[h32(seed, k, 11) % N.length] : n, k });
    a += w; k += 1;
  }
  return out;
}

// Couleur du sol cultivé au point (along = position le long des rangs, across =
// en travers, en px monde) pour la culture `c`.
function cropAt(c, along, across, seed, season) {
  const P = CROP[c];
  const rowP = c === 'labour' ? 3 : c === 'potager' || c === 'bett' ? 5 : c === 'vigne' ? 4 : c === 'pre' || c === 'olive' ? 0 : 3;
  const r = rowP ? ((across % rowP) + rowP) % rowP : 0;
  const nz = h32(Math.floor(along), Math.floor(across), seed) % 23;
  switch (c) {
    case 'labour':
      // Sillons forts : crête claire, creux sombre, mottes.
      if (r < 1) return rgbOf(P[3]);
      if (r < 2) return rgbOf(P[nz < 3 ? 2 : 0]);
      return rgbOf(P[nz < 2 ? 2 : 1]);
    case 'potager': {
      // Rangs de choux : des points verts sur terre sombre.
      const cab = r >= 1 && r < 4 && (((Math.floor(along) + Math.floor(across / 5) * 3) % 5) < 3);
      if (cab) return rgbOf((Math.floor(along) + r) % 3 === 0 ? '#9cc56a' : '#6f9f48');
      return rgbOf(P[r < 1 ? 3 : 1]);
    }
    case 'bett': {
      // Betteraves : de larges touffes vert sombre, en rangs.
      const leaf = r >= 1 && r < 4 && ((Math.floor(along / 2) + Math.floor(across / 5)) % 3) !== 0;
      if (leaf) return rgbOf(nz < 6 ? '#5f8f3a' : '#3f6a2a');
      return rgbOf(P[r < 1 ? 3 : 1]);
    }
    case 'vigne': {
      // Rangs de ceps : un liseré de feuillage tous les 4 px (roux à l'automne).
      if (r < 2 && (Math.floor(along) % 3) !== 2) {
        const leaf = season === 2 ? ['#c2783a', '#9b5528'] : season === 0 ? ['#9ccf62', '#7aab49'] : ['#6f9a3c', '#4f7a2c'];
        return rgbOf(leaf[r < 1 ? 0 : 1]);
      }
      return rgbOf(P[nz < 4 ? 2 : 1]);
    }
    case 'olive': {
      // Oliviers en quinconce : de petites boules gris-vert sur terre sèche.
      const gx = ((along % 8) + 8) % 8, row = Math.floor(across / 7), gy = ((across % 7) + 7) % 7;
      const ox = row % 2 ? 4 : 0;
      const dx = ((gx - ox + 8) % 8) - 3, dy = gy - 3;
      if (dx * dx + dy * dy < 5) return rgbOf(dy < 0 ? '#9aa889' : '#6f7d61');
      return rgbOf(P[nz < 5 ? 2 : nz < 12 ? 1 : 0]);
    }
    case 'pre':
      // Pré : vert moucheté, quelques fleurs.
      if (nz === 0) return rgbOf('#f2ecd6');
      if (nz === 1) return rgbOf('#e9c85a');
      return rgbOf(P[nz < 6 ? 2 : nz < 14 ? 1 : 0]);
    case 'lin':
      if (r < 1) return rgbOf(P[3]);
      if (nz < 4) return rgbOf(nz < 2 ? '#8fb2ea' : '#6f93d6');
      return rgbOf(P[r < 2 ? 1 : 0]);
    case 'neige':
      // Neige : les rangs affleurent à peine.
      if (r < 1 && nz < 12) return rgbOf(P[2]);
      return rgbOf(P[nz < 3 ? 1 : 0]);
    default: {
      // Céréales et éteules : rang sombre, épis clairs semés.
      if (r < 1) return rgbOf(P[3]);
      if (r < 2) return rgbOf(P[nz < 5 ? 0 : 1]);
      return rgbOf(P[nz < 3 ? 2 : nz < 9 ? 0 : 1]);
    }
  }
}

// ── Une parcelle ─────────────────────────────────────────────────────────────
// w, h : la parcelle en CASES. opts : { band, K (kit wonderKitForBand), season,
// seed, hedges } ; hedges : { n, w, s, e } → tronçons [u0, u1] (px monde, le long
// du bord) qui portent une clôture. Rend { R, N } (raster, coin nord en (0, 0, 0) ;
// N = calque de nuit des âges cosmiques, ou null).
export function bakeFieldParcel(w, h, opts = {}) {
  const band = opts.band == null ? 2 : opts.band | 0;
  const S = STYLES[fieldStyleKey(band)];
  const season = S.glow ? 1 : opts.season | 0, seed = (opts.seed >>> 0) || 1;
  const K = opts.K || null, X = K ? mats(K) : null;
  const W = w * T, H = h * T;
  const hedges = opts.hedges || { n: [[0, W]], w: [[0, H]], s: [[0, W]], e: [[0, H]] };
  const R = frameFor(W, H, 22);
  const alongX = w >= h;                        // les lanières suivent le grand côté
  const L = alongX ? W : H, Wd = alongX ? H : W;
  const strips = S.pivot ? [] : stripsOf(Wd, seed, S);
  const crops = strips.map((s) => (S.glow ? s.n : SEASON_CROP[season][s.n]));
  const glow = K ? rgbOf(K.pal.glow) : [140, 220, 255];
  // Cercles d'arrosage (néon) : diamètre = petit côté moins le chemin, alignés le
  // long du grand côté, chacun sa culture.
  const circles = [];
  if (S.pivot) {
    const d = Wd - 6, n = Math.max(1, Math.floor((L - 4) / d)), gap = (L - n * d) / (n + 1);
    for (let k = 0; k < n; k += 1) {
      const n2 = S.natures[h32(seed, k, 13) % S.natures.length];
      circles.push({ c: gap + d / 2 + k * (d + gap), r: d / 2, crop: SEASON_CROP[season][n2], k });
    }
  }
  // 1. Le sol cultivé (dessus à h = 0).
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      const Xs = R.ox + i + 0.5, Ys = R.oy + j + 0.5;
      const x = Ys + Xs / 2, y = Ys - Xs / 2;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const along = alongX ? x : y, across = alongX ? y : x;
      if (S.pivot) {
        // Terre nue sablonneuse, chemin de service sur le pourtour, et les disques.
        let col = null;
        for (const ci of circles) {
          const dx = along - ci.c, dy = across - Wd / 2, rr = Math.hypot(dx, dy);
          if (rr >= ci.r) continue;
          // Ornières concentriques des tours du pivot, tous les 7 px.
          if (ci.crop !== 'neige' && rr > 3 && (rr % 7) < 0.9) col = rgbOf(CROP.labour[2]);
          // Rangs CONCENTRIQUES (le semoir suit la rampe) : « le long » = l'arc.
          else col = cropAt(ci.crop, Math.atan2(dy, dx) * ci.r, rr, seed + ci.k * 17, season);
          break;
        }
        if (!col) {
          const edge = Math.min(along, across, L - along, Wd - across) < 3;
          const nz = h32(Math.floor(x), Math.floor(y), seed) % 11;
          col = rgbOf(season === 3 ? CROP.neige[nz < 3 ? 1 : 0] : edge ? (nz < 4 ? '#a7a196' : '#b8b2a6') : (nz < 3 ? '#a68c66' : '#b89f78'));
        }
        put(R, i, j, col);
        continue;
      }
      let si = 0;
      while (si < strips.length - 1 && across >= strips[si].b) si += 1;
      const s = strips[si];
      if (S.glow) {
        // Substrat sombre, rangs de plantes de lumière (une couleur par lanière).
        // Des PLANTS (2 px sur 4) en quinconce d'un rang à l'autre : des tirets
        // alignés lisaient un quadrillage de circuit imprimé, pas une culture.
        const row = Math.floor((across - s.a) / 4), rr = across - s.a - row * 4;
        const nz = h32(Math.floor(along), Math.floor(across), seed) % 9;
        // Le substrat prend la teinte de l'ère, assombrie (un bleu nuit uniforme
        // lisait des panneaux solaires) ; autour de chaque plant, son feuillage.
        const onRow = rr < 1.2, plant = ((Math.floor(along) + row * 2) % 4) < 2;
        const k = s.n === 'a' ? 1 : s.n === 'b' ? 0.82 : 0.66;
        if (onRow && plant) {
          put(R, i, j, [Math.round(glow[0] * k), Math.round(glow[1] * k), Math.round(glow[2] * k), nz < 2 ? 253 : 255]);
        } else if (rr < 2.2 || (onRow && !plant)) {
          put(R, i, j, [Math.round(glow[0] * 0.42 + 14), Math.round(glow[1] * 0.5 + 22), Math.round(glow[2] * 0.4 + 16)]);
        } else {
          const d = nz < 2 ? 0.2 : 0.15;
          put(R, i, j, [Math.round(glow[0] * d + 16), Math.round(glow[1] * d + 26), Math.round(glow[2] * d + 22)]);
        }
        continue;
      }
      // Raie de labour entre deux lanières : un rang de terre nue, plus sombre.
      if (si > 0 && across - s.a < 1.2 && crops[si] !== 'neige') { put(R, i, j, rgbOf(CROP.labour[2])); continue; }
      put(R, i, j, cropAt(crops[si], along, across - s.a, seed + s.k * 31, season));
    }
  }
  // 2. La récolte posée au champ (été, automne) : gerbes, meules, bottes.
  const at = (al, ac) => (alongX ? [al, ac] : [ac, al]);
  if (S.stack && (season === 1 || season === 2)) {
    const P = CROP.ble;
    const straw = (I) => rgbOf(P[I > 0.55 ? 0 : I > 0.3 ? 1 : I > 0.12 ? 2 : 3]);
    const spots = [];
    if (S.pivot) {
      for (const ci of circles) if (ci.crop === 'chaume' || ci.crop === 'ble') spots.push({ al: ci.c, ac: Wd / 2 + ci.r * 0.4, n: 2 });
    } else {
      strips.forEach((s, si) => {
        if (!(s.n === 'cereal' || s.n === 'ancient') || s.b - s.a < 8) return;
        spots.push({ al: L / 2, ac: (s.a + s.b) / 2, n: 1 + (h32(seed, si, 19) % 3), si });
      });
    }
    for (const sp of spots) {
      for (let k = 0; k < sp.n; k += 1) {
        const al = S.pivot ? sp.al + (k - 0.5) * 6 : 10 + ((L - 20) * (k + 0.5)) / sp.n + ((h32(seed, (sp.si || 0) * 7 + k, 23) % 9) - 4);
        const ac = sp.ac + ((h32(seed, (sp.si || 0) * 5 + k, 29) % 5) - 2);
        const [x, y] = at(al, ac);
        if (S.stack === 'meule') revolve(R, x, y, 0, 6, taper(0, 6, 3.2, 0.6), straw);
        else if (S.stack === 'gerbe') {
          for (const [ox, oy] of [[0, 0], [3, 1], [1, 3]]) revolve(R, x + ox, y + oy, 0, 4, taper(0, 4, 1.5, 0.3), straw);
        } else {
          box(R, x - 2.5, x + 2.5, y - 1.5, y + 1.5, 0, 2.5, (f, u, hv, lit) => straw(lit ? 0.45 : 0.15), () => straw(0.75));
        }
      }
    }
  }
  // 3. Pivots d'arrosage (néon) : la rampe de métal, du centre au bord, posée sur
  //    ses tours à roues.
  if (S.pivot) {
    for (const ci of circles) {
      const a = (h32(seed, ci.k, 31) % 628) / 100;
      const c0 = at(ci.c, Wd / 2), c1 = at(ci.c + Math.cos(a) * (ci.r - 1), Wd / 2 + Math.sin(a) * (ci.r - 1));
      revolve(R, c0[0], c0[1], 0, 5, cyl(1.2), () => rgbOf('#9aa3ad'));
      line(R, [c0[0], c0[1], 4], [c1[0], c1[1], 3], '#c8d0d8', 1);
      for (let t = 0.33; t < 1; t += 0.33) {
        const p = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t];
        line(R, [p[0], p[1], 0], [p[0], p[1], 3.5], '#7d8690', 1);
      }
    }
  }
  // 4. Clôtures, du fond vers l'avant (nord, ouest, puis est, sud).
  border(R, S, X, K, season, seed, W, H, hedges);
  pixelFinish(R, INK, { grain: false });
  // Calque de nuit (âges cosmiques) : rangs de lumière et piquets de cristal.
  let N = null;
  if (S.glow) {
    N = { ox: R.ox, oy: R.oy, w: R.w, h: R.h, data: new Uint8ClampedArray(R.data.length) };
    let any = false;
    for (let k = 0; k < R.data.length; k += 4) {
      const a = R.data[k + 3];
      if (a !== 253) continue;
      R.data[k + 3] = 255;
      N.data[k] = R.data[k]; N.data[k + 1] = R.data[k + 1]; N.data[k + 2] = R.data[k + 2]; N.data[k + 3] = 230;
      any = true;
    }
    if (!any) N = null;
  }
  return { R, N };
}

// ── Les clôtures ─────────────────────────────────────────────────────────────
function border(R, S, X, K, season, seed, W, H, hedges) {
  const kind = S.border;
  if (kind === 'none') return;
  const runs = [];
  for (const [a, b] of hedges.n || []) runs.push([true, 0, a, b, 101]);
  for (const [a, b] of hedges.w || []) runs.push([false, 0, a, b, 202]);
  for (const [a, b] of hedges.e || []) runs.push([false, W, a, b, 303]);
  for (const [a, b] of hedges.s || []) runs.push([true, H, a, b, 404]);
  // Une boîte le long du bord : horiz → le long de x (bord y = fixed), sinon de y.
  // Épaisseur `th` prise vers l'INTÉRIEUR de la parcelle.
  const seg = (horiz, fixed, u0, u1, th, h0, h1, face, top) => {
    const f0 = fixed === 0 ? 0 : fixed - th, f1 = fixed === 0 ? th : fixed;
    if (horiz) box(R, u0, u1, f0, f1, h0, h1, face, top);
    else box(R, f0, f1, u0, u1, h0, h1, face, top);
  };
  const pt = (horiz, fixed, u, th) => (horiz ? [u, fixed === 0 ? th / 2 : fixed - th / 2] : [fixed === 0 ? th / 2 : fixed - th / 2, u]);
  const wood = (k) => rgbOf(WOOD[Math.max(0, Math.min(3, k))]);
  for (const [horiz, fixed, a, b, tag] of runs) {
    if (kind === 'haie' || kind === 'bocage') {
      // Haie vive bosselée : tronçons de 3 px à hauteur variable, une trouée de temps
      // en temps ; au bocage, un arbre de haie çà et là.
      const HP = season === 3 ? HEDGE_W : HEDGE;
      const leaf = (I, k) => rgbOf(HP[Math.max(0, Math.min(3, (I > 0.55 ? 0 : I > 0.3 ? 1 : I > 0.14 ? 2 : 3) + k))]);
      for (let u = a, k = 0; u < b; u += 3, k += 1) {
        const hh = 4 + (h32(seed, k, tag) % 3);
        if (h32(seed, k, tag + 5) % 23 === 0) continue;
        const sg = tag + k;
        seg(horiz, fixed, u, Math.min(b, u + 3), 3, 0, hh,
          (f, uu, hv, lit) => leaf(lit ? 0.45 : 0.1, h32(Math.floor(uu), hv, sg) % 7 === 0 ? 1 : 0),
          (x, y) => leaf(0.7, h32(Math.floor(x), Math.floor(y), sg) % 5 === 0 ? 1 : 0));
      }
      if (kind === 'bocage' && (tag === 101 || tag === 202)) {
        for (let u = a + 8, k = 0; u < b - 6; u += 22, k += 1) {
          if (h32(seed, k, tag + 9) % 3 === 0) continue;
          const [x, y] = pt(horiz, fixed, u + (h32(seed, k, tag + 3) % 7), 3);
          revolve(R, x, y, 0, 7, cyl(0.9), () => wood(3));
          revolve(R, x, y, 6, 16, ballProf(11, 4.8), (I) => leaf(I, h32(Math.floor(I * 40), k, 3) % 5 === 0 ? 1 : 0));
        }
      }
    } else if (kind === 'plessis') {
      // Plessis : branches tressées entre des piquets.
      seg(horiz, fixed, a, b, 1.2, 0, 4, (f, uu, hv, lit) => wood((((Math.floor(uu) + hv) & 1) ? 1 : 2) + (lit ? 0 : 1)), () => wood(1));
      for (let u = a + 2; u < b; u += 6) {
        const [x, y] = pt(horiz, fixed, u, 1.2);
        line(R, [x, y, 0], [x, y, 5.5], WOOD[3], 1);
      }
    } else if (kind === 'muret') {
      // Muret de pierre sèche : la pierre brute de l'ère, un chaperon plus clair.
      for (let u = a, k = 0; u < b; u += 6, k += 1) {
        const hh = 3 + (h32(seed, k, tag) % 2) * 0.6;
        seg(horiz, fixed, u, Math.min(b, u + 6), 3, 0, hh, X ? X.rough(tag + k) : (f, uu, hv, lit) => rgbOf(lit ? '#b8b0a2' : '#8e877b'),
          X ? X.top(1) : () => rgbOf('#c9c2b5'));
      }
    } else if (kind === 'cloture') {
      // Clôture à lisses : poteaux tous les 8 px, deux lisses.
      for (let u = a + 1; u < b; u += 8) {
        const [x, y] = pt(horiz, fixed, u, 1);
        box(R, x - 0.6, x + 0.6, y - 0.6, y + 0.6, 0, 6, (f, uu, hv, lit) => wood(lit ? 1 : 3), () => wood(0));
      }
      const [p0x, p0y] = pt(horiz, fixed, a, 1), [p1x, p1y] = pt(horiz, fixed, b, 1);
      line(R, [p0x, p0y, 2.5], [p1x, p1y, 2.5], WOOD[1], 1);
      line(R, [p0x, p0y, 5], [p1x, p1y, 5], WOOD[0], 1);
    } else if (kind === 'cristal') {
      // Piquets de cristal à tête de lumière.
      const glow = K ? rgbOf(K.pal.glow) : [140, 220, 255];
      const glass = K ? K.pal.glassRamp : ['#e0fff2', '#9ff0d0', '#4fc09a', '#22735a'];
      for (let u = a + 2; u < b; u += 10) {
        const [x, y] = pt(horiz, fixed, u, 1);
        box(R, x - 0.7, x + 0.7, y - 0.7, y + 0.7, 0, 5, (f, uu, hv, lit) => (hv >= 4 ? [glow[0], glow[1], glow[2], 253] : rgbOf(glass[lit ? 1 : 2])), () => [glow[0], glow[1], glow[2], 253]);
      }
    }
  }
}
