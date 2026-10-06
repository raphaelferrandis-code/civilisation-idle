"use strict";
// ── LE PEINTRE DE BATEAUX — coques construites en volumes, cuites au pixel ──────
// (docs/PLAN-BATEAUX.md §3)
//
// Les bateaux ne sont plus huit images PixelLab qui ne racontent pas le même objet
// d'une vue à l'autre (le mât se déplaçait, la coque changeait de longueur, et il
// fallait recaler les feux face par face). Chaque bateau est CONSTRUIT dans son
// repère par un kit (boatKits.js) — coque, pont, mâts, voiles, rames, cargaison,
// équipage — puis projeté à n'importe quel cap avec l'iso EXACT du jeu :
//
//   repère bateau : a = le long (proue +), c = en travers (TRIBORD +), h = hauteur
//                   au-dessus de l'eau. Unités = px MONDE au zoom 1 (1 tuile = 32).
//   monde         : f = (cos θ, sin θ) l'avant, s = (−sin θ, cos θ) tribord
//                   (face à l'est, la main droite montre le sud : y vers le bas).
//   écran zoom 1  : X = wx − wy, Y = (wx + wy)/2 − h ; profondeur = wx + wy + h.
//
// C'est un peintre à POINTS (« splats ») avec z-buffer : chaque surface est
// échantillonnée plus fin que le pixel, chaque échantillon garde sa normale, le
// plus proche gagne. On échange l'élégance d'un rasteriseur contre une propriété
// qui compte ici : n'importe quelle forme paramétrée (coque galbée, voile gonflée,
// col de cygne) se dessine en trois lignes.
//
// PIXEL-ART, PAS DU RENDU 3D : la lumière (haut-gauche, figée — normale +y
// éclairée, +x ombrée, dessus le plus clair) est QUANTIFIÉE sur la rampe de chaque
// matière ; aucun dégradé, aucun anticrénelage. Un contour d'encre suit la
// silhouette, et un trait plus doux marque où une pièce passe devant une autre —
// la lecture des sprites dessinés à la main.
//
// Le REFLET est cuit dans la même passe : chaque échantillon s'écrit aussi en
// miroir (h → −h). Il est donc géométriquement juste à tous les caps, mât et voile
// compris — ce que le retournement par colonne d'une image ne pouvait pas donner.
//
// Pur : aucun DOM, aucun CM. Rend des rasters RGBA (isoPixelPaint.makeRaster).

// Trois primitives de raster, recopiées du peintre du pont (isoPixelPaint) plutôt
// qu'importées : le kit de bateaux ne dépend ainsi d'aucun chantier voisin.
function makeRaster(ox, oy, w, h) {
  return { ox, oy, w, h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) };
}
const _hex = new Map();
export function rgbOf(c) {
  if (Array.isArray(c)) return c;
  let v = _hex.get(c);
  if (!v) {
    const n = parseInt(String(c).slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _hex.set(c, v);
  }
  return v;
}
// Hash entier stable (même famille que cmHash).
export function h32(a, b = 0, c = 0) {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
}

export const BOAT_DIRS = 32;

const n3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
// Lumière : vers la source (haut-gauche de l'écran). Cf. la règle du pont.
const LIGHT = n3(-0.35, 0.45, 0.82);
// Vers la caméra : le rayon de vue est (1, 1, 1) (un point qui y avance garde son
// pixel et passe devant).
const VIEW = n3(1, 1, 1);

// Cap monde → indice de cuisson, et retour.
export function dirIndex(theta) {
  const k = Math.round(theta / (2 * Math.PI / BOAT_DIRS));
  return ((k % BOAT_DIRS) + BOAT_DIRS) % BOAT_DIRS;
}
export const dirTheta = (k) => (k * 2 * Math.PI) / BOAT_DIRS;

// ── Rampe de matière ──────────────────────────────────────────────────────────
// `ramp` va du plus clair au plus sombre. L'indice est lu sur l'éclairement de
// la normale : dessus ≈ 0, flanc éclairé ≈ 1, flanc à l'ombre ≈ len − 2, creux
// = dernier. `bias` décale (joint, bordé, liseré) sans quitter la rampe.
function shadeIndex(n, len, bias = 0) {
  const d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  const k = Math.round(((0.92 - d) * (len - 1)) / 1.62) + bias;
  return Math.max(0, Math.min(len - 1, k));
}
export function rampRGB(ramp, n, bias = 0) {
  return rgbOf(ramp[shadeIndex(n, ramp.length, bias)]);
}

// ── La scène ──────────────────────────────────────────────────────────────────
// `bounds` = boîte englobante du modèle dans son repère [a0, a1, c0, c1, h0, h1] :
// elle dimensionne les deux rasters (bateau et reflet) avant tout échantillon.
function makeScene(theta, bounds) {
  const fx = Math.cos(theta), fy = Math.sin(theta);
  const sx = -fy, sy = fx;
  const [a0, a1, c0, c1, h0, h1] = bounds;
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity, R0 = Infinity, R1 = -Infinity;
  for (const a of [a0, a1]) for (const c of [c0, c1]) {
    const wx = a * fx + c * sx, wy = a * fy + c * sy;
    const X = wx - wy, b = (wx + wy) / 2;
    X0 = Math.min(X0, X); X1 = Math.max(X1, X);
    Y0 = Math.min(Y0, b - h1); Y1 = Math.max(Y1, b - Math.min(0, h0));
    R0 = Math.min(R0, b); R1 = Math.max(R1, b + h1);
  }
  const ox = Math.floor(X0) - 3, oy = Math.floor(Y0) - 3, roy = Math.floor(R0) - 3;
  const w = Math.ceil(X1) - ox + 4, h = Math.ceil(Y1) - oy + 4, rh = Math.ceil(R1) - roy + 4;
  const S = {
    theta, fx, fy, sx, sy, ox, oy, w, h, roy, rh,
    col: makeRaster(ox, oy, w, h),
    dep: new Float32Array(w * h).fill(-Infinity),
    part: new Uint8Array(w * h),
    hpx: new Float32Array(w * h),
    rcol: makeRaster(ox, roy, w, rh),
    rdep: new Float32Array(w * rh).fill(-Infinity),
    // Pile de repères locaux (personnage tourné sur le pont, rame inclinée…) :
    // chaque entrée = { a, c, h, co, si } — rotation dans le plan (a, c) puis
    // translation. Les primitives écrivent dans le repère du sommet.
    frames: [],
    // Partie courante (sert au trait intérieur : deux pièces qui se recouvrent).
    curPart: 1,
    noReflect: 0,
    // L'équipage : des places, pas des volumes (cf. crewSlot).
    crew: [],
  };
  return S;
}

// Repère local : tout ce qui est dessiné dans `fn` est tourné de `ang` (plan a-c)
// autour de (a, c, h) puis translaté. Les normales suivent.
export function inFrame(S, a, c, h, ang, fn) {
  S.frames.push({ a, c, h, co: Math.cos(ang), si: Math.sin(ang) });
  try { fn(); } finally { S.frames.pop(); }
}
export function asPart(S, id, fn) {
  const prev = S.curPart;
  S.curPart = id;
  try { fn(); } finally { S.curPart = prev; }
}
// Ce qui est sous l'eau ou trop fin pour se refléter proprement (cordages) peut
// s'y soustraire.
export function noReflect(S, fn) {
  S.noReflect += 1;
  try { fn(); } finally { S.noReflect -= 1; }
}

// ── L'ÉQUIPAGE : DES HABITANTS, PAS DES VOLUMES ───────────────────────────────
// Les marins construits en boîtes et en boules se lisaient comme des tonneaux à la
// taille de la carte (Raph, 2026-10-03 : « faut revoir les personnages sur les
// bateaux »). Le kit ne les dessine plus : il dit OÙ ils se tiennent (pied, cap dans
// le repère courant, pose) et le jeu y pose les sprites des HABITANTS de l'ère
// (boatKit.drawCrew) — les mêmes gens que sur le quai, à la même finesse à tous les
// zooms. La cuisson rend pour chacun un MASQUE lu dans le z-buffer : ce qui, du
// bateau, passe devant lui (plat-bord, cargaison, voile) le cache.
// rec = { pose, sink (px d'art enfoncés sous l'appui : assis), id (tirage du dessin) }.
export function crewSlot(S, a, c, h, face, rec) {
  if (S.empty) return;
  let ang = face;
  for (const F of S.frames) ang += Math.atan2(F.si, F.co);
  const q = toBoat(S, [a, c, h]);
  S.crew.push({ ...rec, a: q.a, c: q.c, h: q.h, face: ang });
}

function toBoat(S, p, n) {
  let a = p[0], c = p[1], h = p[2];
  let na = n ? n[0] : 0, nc = n ? n[1] : 0;
  const nh = n ? n[2] : 0;
  for (let k = S.frames.length - 1; k >= 0; k -= 1) {
    const F = S.frames[k];
    const a2 = a * F.co - c * F.si, c2 = a * F.si + c * F.co;
    a = a2 + F.a; c = c2 + F.c; h += F.h;
    if (n) { const na2 = na * F.co - nc * F.si; nc = na * F.si + nc * F.co; na = na2; }
  }
  return { a, c, h, na, nc, nh };
}

// Normale monde d'une normale du repère courant, retournée vers la caméra : une
// surface opaque ne se voit que par sa face tournée vers l'œil, donc ce
// retournement est toujours juste — et il dispense chaque forme d'orienter ses
// paramètres.
function worldNormal(S, q) {
  let x = q.na * S.fx + q.nc * S.sx, y = q.na * S.fy + q.nc * S.sy, z = q.nh;
  if (x * VIEW[0] + y * VIEW[1] + z * VIEW[2] < 0) { x = -x; y = -y; z = -z; }
  return [x, y, z];
}

// L'échantillon. `color` = [r,g,b] déjà résolu, ou fonction(nMonde, hBateau) → rgb.
function emit(S, p, n, color) {
  const q = toBoat(S, p, n);
  if (q.h < -0.05) return;                      // sous la ligne de flottaison
  const wx = q.a * S.fx + q.c * S.sx, wy = q.a * S.fy + q.c * S.sy;
  const base = wx + wy, X = wx - wy;
  const i = Math.floor(X - S.ox);
  if (i < 0 || i >= S.w) return;
  const nw = worldNormal(S, q);
  const rgb = typeof color === 'function' ? color(nw, q.h) : color;
  if (!rgb) return;
  const j = Math.floor(base / 2 - q.h - S.oy);
  const d = base + q.h;
  if (j >= 0 && j < S.h) {
    const k = j * S.w + i;
    if (d > S.dep[k]) {
      S.dep[k] = d; S.part[k] = S.curPart; S.hpx[k] = q.h;
      const o = k * 4;
      S.col.data[o] = rgb[0]; S.col.data[o + 1] = rgb[1]; S.col.data[o + 2] = rgb[2]; S.col.data[o + 3] = 255;
    }
  }
  if (S.noReflect) return;
  const jr = Math.floor(base / 2 + q.h - S.roy);
  const dr = base - q.h;
  if (jr >= 0 && jr < S.rh) {
    const k = jr * S.w + i;
    if (dr > S.rdep[k]) {
      S.rdep[k] = dr;
      const o = k * 4;
      S.rcol.data[o] = rgb[0]; S.rcol.data[o + 1] = rgb[1]; S.rcol.data[o + 2] = rgb[2]; S.rcol.data[o + 3] = 255;
    }
  }
}

// ── Primitives ────────────────────────────────────────────────────────────────
// Surface paramétrée : P(u, v) → [a, c, h] sur [u0,u1]×[v0,v1]. Le pas est réglé
// pour que deux échantillons voisins tombent à moins d'un demi-pixel (le pire cas
// de la projection étire de √2). col(u, v, nMonde, h) → rgb | null (trou).
const STEP = 0.32;
export function surf(S, P, u0, u1, v0, v1, col, opts = {}) {
  // Longueur des côtés pour choisir le nombre d'échantillons.
  const len = (pa, pb) => Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  let lu = 0, lv = 0;
  for (const v of [v0, vm, v1]) {
    let acc = 0, prev = P(u0, v);
    for (let k = 1; k <= 8; k += 1) { const q = P(u0 + ((u1 - u0) * k) / 8, v); acc += len(prev, q); prev = q; }
    lu = Math.max(lu, acc);
  }
  for (const u of [u0, um, u1]) {
    let acc = 0, prev = P(u, v0);
    for (let k = 1; k <= 8; k += 1) { const q = P(u, v0 + ((v1 - v0) * k) / 8); acc += len(prev, q); prev = q; }
    lv = Math.max(lv, acc);
  }
  const nu = Math.max(1, Math.ceil(lu / (opts.step || STEP))), nv = Math.max(1, Math.ceil(lv / (opts.step || STEP)));
  const du = (u1 - u0) / nu, dv = (v1 - v0) / nv;
  const eu = du * 0.5 || 1e-3, ev = dv * 0.5 || 1e-3;
  for (let iu = 0; iu <= nu; iu += 1) {
    const u = u0 + iu * du;
    for (let iv = 0; iv <= nv; iv += 1) {
      const v = v0 + iv * dv;
      const p = P(u, v);
      let n = opts.normal ? opts.normal(u, v, p) : null;
      if (!n) {
        const pu1 = P(Math.min(u1, u + eu), v), pu0 = P(Math.max(u0, u - eu), v);
        const pv1 = P(u, Math.min(v1, v + ev)), pv0 = P(u, Math.max(v0, v - ev));
        const tu = [pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]];
        const tv = [pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]];
        n = n3(tu[1] * tv[2] - tu[2] * tv[1], tu[2] * tv[0] - tu[0] * tv[2], tu[0] * tv[1] - tu[1] * tv[0]);
      }
      emit(S, p, n, (nw, hh) => col(u, v, nw, hh));
    }
  }
}

// Boîte alignée sur le repère courant. col(face, u, v, nMonde) ; face ∈ 'top',
// 'bot', 'a0', 'a1', 'c0', 'c1' ; (u, v) = coordonnées sur la face, en px.
export function box(S, a0, a1, c0, c1, h0, h1, col) {
  const F = (face, P) => surf(S, P, 0, 1, 0, 1, (u, v, nw) => col(face, u, v, nw));
  F('top', (u, v) => [a0 + (a1 - a0) * u, c0 + (c1 - c0) * v, h1]);
  F('a1', (u, v) => [a1, c0 + (c1 - c0) * u, h0 + (h1 - h0) * v]);
  F('a0', (u, v) => [a0, c0 + (c1 - c0) * u, h0 + (h1 - h0) * v]);
  F('c1', (u, v) => [a0 + (a1 - a0) * u, c1, h0 + (h1 - h0) * v]);
  F('c0', (u, v) => [a0 + (a1 - a0) * u, c0, h0 + (h1 - h0) * v]);
}
// Boîte d'une seule matière ombrée.
export function boxRamp(S, a0, a1, c0, c1, h0, h1, ramp, bias = 0) {
  box(S, a0, a1, c0, c1, h0, h1, (f, u, v, nw) => rampRGB(ramp, nw, bias));
}

// Ellipsoïde centré (a, c, h), demi-axes ra, rc, rh. col(nMonde, θ, φ).
export function ellipsoid(S, a, c, h, ra, rc, rh, col, phi0 = -Math.PI / 2) {
  surf(S, (u, v) => [a + ra * Math.cos(v) * Math.cos(u), c + rc * Math.cos(v) * Math.sin(u), h + rh * Math.sin(v)],
    0, Math.PI * 2, phi0, Math.PI / 2,
    (u, v, nw) => col(nw, u, v),
    { normal: (u, v) => n3(Math.cos(v) * Math.cos(u) / ra, Math.cos(v) * Math.sin(u) / rc, Math.sin(v) / rh) });
}

// Tube le long d'une polyligne (mât, vergue, rame, col de cygne). r peut être une
// fonction du paramètre t ∈ [0,1] (effilé).
export function tube(S, pts, r, col) {
  const segs = [];
  let total = 0;
  for (let k = 1; k < pts.length; k += 1) {
    const L = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]);
    segs.push({ p: pts[k - 1], q: pts[k], L, t0: total });
    total += L;
  }
  if (!(total > 0)) return;
  for (const sg of segs) {
    const d = n3(sg.q[0] - sg.p[0], sg.q[1] - sg.p[1], sg.q[2] - sg.p[2]);
    // Deux vecteurs orthogonaux à l'axe.
    const ref = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = n3(d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]);
    const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
    const nL = Math.max(1, Math.ceil(sg.L / STEP));
    for (let i = 0; i <= nL; i += 1) {
      const f = i / nL;
      const t = (sg.t0 + f * sg.L) / total;
      const rr = typeof r === 'function' ? r(t) : r;
      const cx = sg.p[0] + (sg.q[0] - sg.p[0]) * f, cy = sg.p[1] + (sg.q[1] - sg.p[1]) * f, cz = sg.p[2] + (sg.q[2] - sg.p[2]) * f;
      const nA = Math.max(6, Math.ceil((2 * Math.PI * rr) / STEP));
      for (let k = 0; k < nA; k += 1) {
        const an = (k / nA) * Math.PI * 2;
        const ca = Math.cos(an), sa = Math.sin(an);
        const nn = [e1[0] * ca + e2[0] * sa, e1[1] * ca + e2[1] * sa, e1[2] * ca + e2[2] * sa];
        emit(S, [cx + nn[0] * rr, cy + nn[1] * rr, cz + nn[2] * rr], nn, (nw) => col(nw, t));
      }
    }
  }
}

// Trait d'un pixel (cordage) : couleur franche, pas d'ombrage.
export function rope(S, p, q, rgb) {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const n = Math.max(1, Math.ceil(L / 0.3));
  const c = rgbOf(rgb);
  const prev = S.curPart;
  S.curPart = 17;                              // PART.rope : jamais de contour
  for (let i = 0; i <= n; i += 1) {
    const f = i / n;
    emit(S, [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f], [0, 0, 1], c);
  }
  S.curPart = prev;
}

// Corps de révolution vertical (amphore, tonneau debout) : profil [[z, r], …].
export function revolve(S, a, c, h, profile, col) {
  const zMax = profile[profile.length - 1][0];
  const rAt = (z) => {
    for (let k = 1; k < profile.length; k += 1) {
      if (z <= profile[k][0]) {
        const [z0, r0] = profile[k - 1], [z1, r1] = profile[k];
        return r0 + (r1 - r0) * ((z - z0) / Math.max(1e-6, z1 - z0));
      }
    }
    return profile[profile.length - 1][1];
  };
  surf(S, (u, v) => { const r = rAt(v); return [a + r * Math.cos(u), c + r * Math.sin(u), h + v]; },
    0, Math.PI * 2, 0, zMax, (u, v, nw) => col(nw, v / zMax));
  // Le dessus (bouchon / goulot).
  const rt = profile[profile.length - 1][1];
  if (rt > 0.2) surf(S, (u, v) => [a + v * Math.cos(u), c + v * Math.sin(u), h + zMax], 0, Math.PI * 2, 0, rt, (u, v, nw) => col(nw, 1));
}

// ── Finitions : contour, trait intérieur, recadrage ───────────────────────────
// Les pièces FINES (mât, vergue, rames, perche, avirons, cordages) ne portent pas
// de contour : à un ou deux pixels de large, un contour les change en traits
// noirs (vu sur la première planche : la barque ramait avec deux bâtons d'encre).
export const PART = {
  hull: 2, inside: 3, rail: 4, cargo: 6, mast: 8, sail: 9, ornament: 10, cabin: 11,
  bowsprit: 12, steer: 13, eye: 14, oar: 15, yard: 16, rope: 17,
};
const THIN = new Set([PART.mast, PART.steer, PART.oar, PART.yard, PART.rope]);

// CONTOUR d'encre posé À L'EXTÉRIEUR de la silhouette (sur les pixels vides qui la
// bordent), et non sur ses pixels de bord : un homme de trois pixels de large n'a
// pas de pixel à céder à son contour — la planche l'avait réduit à une tache noire.
// Pas de contour SOUS la ligne de flottaison : la coque se pose dans l'eau.
// TRAIT INTÉRIEUR : un pixel dont un voisin appartient à une AUTRE pièce, nettement
// plus loin derrière, est assombri — la voile qui passe devant la coque, la cabine
// devant le pont. Assombri et non encré : à cette taille, de l'encre partout fait
// une grille.
function finish(S, ink, edge = 0.5) {
  const { w, h } = S;
  const D = S.col.data;
  const src = new Uint8Array(w * h);      // 1 = plein, 2 = fin
  for (let k = 0; k < w * h; k += 1) if (D[k * 4 + 3] > 0) src[k] = THIN.has(S.part[k]) ? 2 : 1;
  const inkc = rgbOf(ink);
  const darken = [];
  const outl = [];
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const k = j * w + i;
      if (!src[k]) {
        // Vide : il devient contour s'il touche un plein (pas par le dessous d'une
        // ligne de flottaison).
        const up = j > 0 && src[k - w] === 1 && S.hpx[k - w] > 0.9;
        const dn = j < h - 1 && src[k + w] === 1;
        const lf = i > 0 && src[k - 1] === 1, rt = i < w - 1 && src[k + 1] === 1;
        if (up || dn || lf || rt) outl.push(k);
        continue;
      }
      if (src[k] === 2) continue;
      for (const q of [k - w, k - 1, k + 1, k + w]) {
        if (q < 0 || q >= w * h || !src[q] || src[q] === 2) continue;
        if (S.part[q] !== S.part[k] && S.dep[q] < S.dep[k] - 3) { darken.push(k); break; }
      }
    }
  }
  for (const k of darken) {
    const o = k * 4;
    D[o] = D[o] * (1 - edge) + inkc[0] * edge;
    D[o + 1] = D[o + 1] * (1 - edge) + inkc[1] * edge;
    D[o + 2] = D[o + 2] * (1 - edge) + inkc[2] * edge;
  }
  for (const k of outl) {
    const o = k * 4;
    D[o] = inkc[0]; D[o + 1] = inkc[1]; D[o + 2] = inkc[2]; D[o + 3] = 255;
  }
  // Le contour prend la profondeur de ce qu'il borde : le trait du plat-bord cache
  // les jambes d'un marin comme le plat-bord lui-même (masques de l'équipage).
  for (const k of outl) {
    if (S.dep[k] !== -Infinity) continue;
    let d = -Infinity;
    for (const q of [k - w, k + w, k - 1, k + 1]) if (q >= 0 && q < w * h && src[q] === 1 && S.dep[q] > d) d = S.dep[q];
    S.dep[k] = d;
  }
}

// Masque de chaque marin, en px d'art autour de son pied (repère de l'origine du
// bateau, comme les ancres). Le marin est un PANNEAU vertical : à la rangée y, il est
// à la hauteur hb = base/2 − y, de profondeur base + hb. Un pixel du bateau le cache
// s'il est plus près que lui (au-delà de son épaisseur), et tout ce qui descend sous
// son appui (le pont, le banc du rameur) est DANS la coque.
const CREW_BOX = { left: 11, up: 17, w: 23, h: 21 };
const CREW_THICK = 1.2;
function crewMasks(S) {
  return S.crew.map((cr) => {
    const wx = cr.a * S.fx + cr.c * S.sx, wy = cr.a * S.fy + cr.c * S.sy;
    const base = wx + wy, X = wx - wy, Y = base / 2 - (cr.h - (cr.sink || 0));
    const x0 = Math.floor(X) - CREW_BOX.left, y0 = Math.floor(Y) - CREW_BOX.up;
    const { w, h } = CREW_BOX;
    const mask = new Uint8Array(w * h);
    for (let j = 0; j < h; j += 1) {
      const hb = base / 2 - (y0 + j + 0.5);
      const jj = y0 + j - S.oy;
      for (let i = 0; i < w; i += 1) {
        let m = hb < cr.h - 0.3;
        const ii = x0 + i - S.ox;
        if (!m && jj >= 0 && jj < S.h && ii >= 0 && ii < S.w) m = S.dep[jj * S.w + ii] > base + hb + CREW_THICK;
        mask[j * w + i] = m ? 1 : 0;
      }
    }
    // a, c, h : sa place dans le repère du bateau (lot 5 de PLAN-COMPORTEMENTS : les
    // voyageurs du bac y montent et en descendent à pied, cf. boatScenes).
    return { X, Y, x0, y0, w, h, mask, phi: S.theta + cr.face, pose: cr.pose, id: cr.id | 0, role: cr.role || null, a: cr.a, c: cr.c, ft: cr.h - (cr.sink || 0) };
  });
}

function cropRaster(R) {
  const { w, h, data } = R;
  let i0 = w, i1 = -1, j0 = h, j1 = -1;
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
    if (data[(j * w + i) * 4 + 3] > 0) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
  }
  if (i1 < 0) return makeRaster(R.ox, R.oy, 1, 1);
  const out = makeRaster(R.ox + i0, R.oy + j0, i1 - i0 + 1, j1 - j0 + 1);
  for (let j = j0; j <= j1; j += 1) {
    const s = (j * w + i0) * 4, e = (j * w + i1 + 1) * 4;
    out.data.set(data.subarray(s, e), (j - j0) * out.w * 4);
  }
  return out;
}

// ── La cuisson ────────────────────────────────────────────────────────────────
// model = { bounds, ink, build(S, ctx) } (cf. boatKits.js) ; ctx = { variant,
// anim, state } transmis tel quel au kit. Rend { img, refl, anchors } :
//   img  : le bateau, raster RGBA, origine (ox, oy) = position du point (0,0,0)
//          du repère bateau dans le repère écran zoom 1 ;
//   refl : son reflet, déjà en miroir, même convention (à poser tel quel) ;
//   anchors : points nommés du kit (feux, tête de mât, poupe…) projetés en
//          coordonnées écran zoom 1 relatives à l'origine du bateau.
//   crew : les places de l'équipage et leurs masques (crewSlot, crewMasks).
export function bakeBoat(model, theta, ctx = {}) {
  const S = makeScene(theta, model.bounds);
  // Un bateau À QUAI est VIDE (Raph, 2026-10-02 : « ça ne va pas de voir le pêcheur
  // dans son bateau, ce n'est pas logique ») : l'équipage n'est pas construit.
  S.empty = !!ctx.empty;
  model.build(S, ctx);
  finish(S, model.ink || '#1d1611');
  // Reflet : plus sombre et un peu bleui, comme la pierre du pont dans l'eau.
  const RD = S.rcol.data;
  for (let k = 0; k < RD.length; k += 4) {
    if (!RD[k + 3]) continue;
    RD[k] *= 0.72; RD[k + 1] *= 0.78; RD[k + 2] *= 0.86;
  }
  const anchors = {};
  for (const [name, p] of Object.entries(model.anchors ? model.anchors(ctx) : {})) {
    anchors[name] = projectLocal(theta, p);
  }
  return { img: cropRaster(S.col), refl: cropRaster(S.rcol), anchors, crew: crewMasks(S) };
}

// Point du repère bateau → écran zoom 1 (relatif à l'origine du bateau).
export function projectLocal(theta, p) {
  const fx = Math.cos(theta), fy = Math.sin(theta);
  const wx = p[0] * fx - p[1] * fy, wy = p[0] * fy + p[1] * fx;
  return { X: wx - wy, Y: (wx + wy) / 2 - p[2], wx, wy };
}
