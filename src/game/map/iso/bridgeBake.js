"use strict";
// ── LE PONT CUIT — peintre de pixels du pont refait à zéro (docs/PLAN-PONTS.md) ──
//
// Le pont n'est plus une grande image générée puis découpée : il est CONSTRUIT
// pour la travée réelle (longueur, largeur, ligne d'eau, piles) puis peint une
// fois, pixel par pixel, à la résolution du sol (zoom 1 : 1 px d'art = 1 px de
// sol). Trois calques partagent le même cadre :
//   · `deck`  — le tablier, à plat : chaussée + trottoirs ;
//   · `back`  — ce qui se dresse côté AMONT (parapet amont, piédestaux, mâts) ;
//   · `front` — la face AVAL (tympans, arches, piles, corniche), le parapet aval
//     et ce qui se dresse devant (mâts, tours, câbles aval).
// Au tri peintre : tablier, puis `back`, puis les passants, puis `front`.
// S'y ajoutent les PORTES (elles enjambent la route) et les MONUMENTS posés aux
// coins, chacun dans son raster, et `refl`, la source du reflet.
//
// LA GÉOMÉTRIE EST L'ISO EXACT DU JEU. Repère écran au zoom 1 : X = wx − wy,
// Y = (wx + wy)/2 − h (h = altitude, px, vers le haut ; la verticale ne subit
// aucun écrasement). Une face verticale est donc une ÉLÉVATION cisaillée 2:1 —
// une colonne de pixels par pixel monde le long du mur —, un dessus est rempli
// en projetant chaque pixel sur son plan. Les arches tombent où sont les piles,
// pour n'importe quel fleuve, et les bords suivent l'escalier 2:1 des losanges.
//
// Repère du pont : l = longitudinal, t = transverse, aval = t croissant.
// Pont « vertical » (le seul que génère le layout) : wx = t, wy = l.
// Pont « horizontal » : wx = l, wy = t.
//
// LUMIÈRE (haut-gauche, figée) : une face dont la normale va vers +y (écran
// bas-gauche) est ÉCLAIRÉE, vers +x (écran bas-droite) OMBRÉE, un dessus est le
// plus clair. Pour un pont vertical la grande face aval est donc à l'OMBRE —
// c'est elle qui donne le volume, la lumière glisse sur les margelles.
//
// Pur : aucun DOM, aucun CM. Les rasters sont des RGBA ; isoBridge.js les pose
// dans des canvas. Testable en Node.

// ── Raster ───────────────────────────────────────────────────────────────────
export function makeRaster(ox, oy, w, h) {
  return { ox, oy, w, h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) };
}
function put(R, i, j, c) {
  if (i < 0 || j < 0 || i >= R.w || j >= R.h || !c) return;
  const k = (j * R.w + i) * 4;
  R.data[k] = c[0]; R.data[k + 1] = c[1]; R.data[k + 2] = c[2]; R.data[k + 3] = c.length > 3 ? c[3] : 255;
}
export function alphaAt(R, i, j) {
  if (i < 0 || j < 0 || i >= R.w || j >= R.h) return 0;
  return R.data[(j * R.w + i) * 4 + 3];
}

// Couleurs : '#rrggbb' → [r, g, b]. Mémo : les palettes sont relues par pixel.
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
const dim = (c, k) => { const v = rgbOf(c); return [v[0] * k, v[1] * k, v[2] * k]; };

// Hash entier stable (même famille que cmHash, sans dépendance).
export function h32(a, b = 0, c = 0) {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
}
const mod = (a, n) => ((Math.floor(a) % n) + n) % n;

// ── Projection (repère du pont → écran zoom 1) ───────────────────────────────
export function projLT(vertical, l, t, h = 0) {
  const wx = vertical ? t : l, wy = vertical ? l : t;
  return { X: wx - wy, Y: (wx + wy) / 2 - h };
}
// Inverse sur le plan d'altitude h : point écran → (l, t).
function unprojLT(vertical, X, Y, h) {
  const Yh = Y + h;
  const a = Yh + X / 2, b = Yh - X / 2;     // a = wx, b = wy
  return vertical ? { l: b, t: a } : { l: a, t: b };
}

// Normale +t / +l éclairée ? (cf. en-tête : +y éclairée, +x ombrée)
export function litNormal(vertical, axis) {
  // axis 't' : normale +t ; 'l' : normale +l.
  if (axis === 't') return !vertical;        // vertical : +t = +x → ombre
  return vertical;                           // vertical : +l = +y → lumière
}

// Cadre (ox, oy, w, h) d'une boîte (l, t, h) du repère du pont.
function frameOf(v, boxes) {
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (const [l0, l1, t0, t1, h0, h1] of boxes) {
    for (const l of [l0, l1]) for (const t of [t0, t1]) for (const h of [h0, h1]) {
      const p = projLT(v, l, t, h);
      X0 = Math.min(X0, p.X); X1 = Math.max(X1, p.X); Y0 = Math.min(Y0, p.Y); Y1 = Math.max(Y1, p.Y);
    }
  }
  const ox = Math.floor(X0) - 2, oy = Math.floor(Y0) - 2;
  return makeRaster(ox, oy, Math.ceil(X1) - ox + 3, Math.ceil(Y1) - oy + 3);
}

// ── Primitives ───────────────────────────────────────────────────────────────
// MUR vertical : plan « fixed » constant sur l'axe `axis` ('t' → mur le long de l,
// 'l' → mur le long de t), de u0 à u1 sur l'autre axe, altitudes [hLo, hHi).
// tex(u, hv, lit) → couleur ou null (trou). hv = altitude ENTIÈRE du pixel.
export function paintWall(R, vertical, axis, fixed, u0, u1, hLo, hHi, tex) {
  if (!(u1 > u0) || !(hHi > hLo)) return;
  const lit = litNormal(vertical, axis);
  const a = axis === 't' ? projLT(vertical, u0, fixed) : projLT(vertical, fixed, u0);
  const b = axis === 't' ? projLT(vertical, u1, fixed) : projLT(vertical, fixed, u1);
  const i0 = Math.floor(Math.min(a.X, b.X) - R.ox), i1 = Math.ceil(Math.max(a.X, b.X) - R.ox);
  for (let i = i0; i < i1; i += 1) {
    const Xc = R.ox + i + 0.5;
    let u;
    if (axis === 't') u = vertical ? fixed - Xc : Xc + fixed;
    else u = vertical ? Xc + fixed : fixed - Xc;
    if (u < u0 || u >= u1) continue;
    const g = axis === 't' ? projLT(vertical, u, fixed) : projLT(vertical, fixed, u);
    const Yg = g.Y;
    const j0 = Math.floor(Yg - hHi - R.oy), j1 = Math.ceil(Yg - hLo - R.oy);
    for (let j = j0; j <= j1; j += 1) {
      const Yc = R.oy + j + 0.5;
      const hc = Yg - Yc;                       // altitude au centre du pixel
      if (hc < hLo || hc >= hHi) continue;
      const c = tex(u, Math.floor(hc), lit);
      if (c) put(R, i, j, c);
    }
  }
}

// DESSUS plat à l'altitude h sur le rectangle [l0,l1]×[t0,t1]. tex(l, t) → couleur ou null.
export function paintTop(R, vertical, l0, l1, t0, t1, h, tex) {
  if (!(l1 > l0) || !(t1 > t0)) return;
  const cs = [projLT(vertical, l0, t0, h), projLT(vertical, l1, t0, h), projLT(vertical, l1, t1, h), projLT(vertical, l0, t1, h)];
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (const p of cs) { X0 = Math.min(X0, p.X); X1 = Math.max(X1, p.X); Y0 = Math.min(Y0, p.Y); Y1 = Math.max(Y1, p.Y); }
  const i0 = Math.floor(X0 - R.ox), i1 = Math.ceil(X1 - R.ox);
  const j0 = Math.floor(Y0 - R.oy), j1 = Math.ceil(Y1 - R.oy);
  for (let j = j0; j < j1; j += 1) {
    for (let i = i0; i < i1; i += 1) {
      const q = unprojLT(vertical, R.ox + i + 0.5, R.oy + j + 0.5, h);
      if (q.l < l0 || q.l >= l1 || q.t < t0 || q.t >= t1) continue;
      const c = tex(q.l, q.t);
      if (c) put(R, i, j, c);
    }
  }
}

// BOÎTE : ses deux faces visibles (+t et +l) puis son dessus. `faceTex(face, u, hv,
// lit)` pour les faces ('t' / 'l'), `topTex(l, t)` pour le dessus.
export function paintBox(R, vertical, l0, l1, t0, t1, h0, h1, faceTex, topTex) {
  paintWall(R, vertical, 't', t1, l0, l1, h0, h1, (u, hv, lit) => faceTex('t', u, hv, lit));
  paintWall(R, vertical, 'l', l1, t0, t1, h0, h1, (u, hv, lit) => faceTex('l', u, hv, lit));
  if (topTex) paintTop(R, vertical, l0, l1, t0, t1, h1, topTex);
}

// TRAIT d'un point (l, t, h) à un autre, en pixels d'écran (Bresenham) — câbles,
// haubans, jambes de force. La projection étant linéaire, une droite du monde est
// une droite de l'écran.
function paintLine(R, v, a, b, col) {
  const pa = projLT(v, a[0], a[1], a[2]), pb = projLT(v, b[0], b[1], b[2]);
  let x0 = Math.floor(pa.X - R.ox), y0 = Math.floor(pa.Y - R.oy);
  const x1 = Math.floor(pb.X - R.ox), y1 = Math.floor(pb.Y - R.oy);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const c = rgbOf(col);
  for (let guard = 0; guard < 4000; guard += 1) {
    put(R, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// POLYGONE plein en coordonnées ÉCRAN zoom 1 (toits). col(X, Y) → couleur.
function fillPoly(R, pts, col) {
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (const p of pts) { X0 = Math.min(X0, p.X); X1 = Math.max(X1, p.X); Y0 = Math.min(Y0, p.Y); Y1 = Math.max(Y1, p.Y); }
  for (let j = Math.floor(Y0 - R.oy); j < Math.ceil(Y1 - R.oy); j += 1) {
    const Y = R.oy + j + 0.5;
    for (let i = Math.floor(X0 - R.ox); i < Math.ceil(X1 - R.ox); i += 1) {
      const X = R.ox + i + 0.5;
      let inside = false;
      for (let k = 0, m = pts.length - 1; k < pts.length; m = k, k += 1) {
        const a = pts[k], b = pts[m];
        if ((a.Y > Y) !== (b.Y > Y) && X < ((b.X - a.X) * (Y - a.Y)) / (b.Y - a.Y) + a.X) inside = !inside;
      }
      if (inside) put(R, i, j, col(X, Y));
    }
  }
}

// ── Textures ─────────────────────────────────────────────────────────────────
// Rampe de pierre : 0 = reflet … 8 = encre. Une face ÉCLAIRÉE lit la rampe à
// partir de `litBase`, une face à l'OMBRE à partir de `shadeBase`.
function ramp(P, k) { return rgbOf(P.stone[Math.max(0, Math.min(P.stone.length - 1, k))]); }
const shadeOf = (K, lit) => (lit ? K.litBase : K.shadeBase);

// Grand appareil : assises hautes, blocs longs, joints d'UN cran plus sombres
// seulement (à deux crans on lisait de la brique). `K.rough` (pierre brute) :
// blocs plus courts, assises irrégulières, plus de blocs foncés.
export function ashlar(P, u, hv, lit, K, seed = 0) {
  const base = shadeOf(K, lit);
  const course = K.course || 4;
  const row = Math.floor((hv + 1000) / course);
  const inRow = (hv + 1000) - row * course;
  const joint = K.joint != null ? K.joint : 2;
  if (inRow === course - 1) return ramp(P, base + joint);         // joint horizontal (bas d'assise)
  const len = (K.block || 11) + (h32(row, seed, 7) % (K.rough ? 7 : 5)) - (K.rough ? 3 : 0);
  const shift = (h32(row, seed, 3) % len);
  const uu = Math.floor(u) + shift + 4096;
  const col = Math.floor(uu / len);
  if (uu - col * len === 0) return ramp(P, base + joint);         // joint vertical
  const v = h32(row, col, seed) % (K.rough ? 5 : 9);
  let k = base + (v === 0 ? 1 : 0);
  if (inRow === 0 && lit) k -= 1;                                  // arête haute éclairée
  return ramp(P, k);
}

// Bois : fibres (une teinte par planche/pièce, une veine sombre de temps en temps).
function woodTex(P, u, hv, lit, seed = 0) {
  const W = P.wood;
  const k = h32(Math.floor(u / 5), seed, 21) % 5;
  if (h32(Math.floor(u), hv, seed + 3) % 13 === 0) return rgbOf(W[(lit ? 1 : 2) + 1]);
  return rgbOf(W[(lit ? 0 : 1) + (k === 0 ? 1 : 0)]);
}

// CONTOUR : un pixel d'encre là où l'opaque touche le vide (haut, gauche,
// droite) — la même lecture que les bâtiments de la ville, qui ont tous le leur.
// Pas sous l'objet (le pied reste doux sur son sol).
export function outline(R, ink) {
  const { w, h, data } = R;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) src[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  const c = rgbOf(ink);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      if (!src[j * w + i]) continue;
      const up = j > 0 ? src[(j - 1) * w + i] : 0;
      const lf = i > 0 ? src[j * w + i - 1] : 0;
      const rt = i < w - 1 ? src[j * w + i + 1] : 0;
      if (!up || !lf || !rt) put(R, i, j, c);
    }
  }
}

// ── Arches : plein cintre (un centre) ou brisée (deux centres) ───────────────
// Rend { mid, hs (naissance), arcs } — chaque arc { c (abscisse du centre), R }
// vaut pour une moitié (brisée) ou pour toute l'ouverture (plein cintre).
export function archGeom(a, pointed = false) {
  const w = a.l1 - a.l0, mid = (a.l0 + a.l1) / 2;
  if (pointed) {
    const R = w * 0.8;
    const rise = Math.sqrt(R * R - (w / 2 - R) * (w / 2 - R));
    return { mid, w, pointed, hs: a.crown - rise, R, cL: a.l0 + R, cR: a.l1 - R };
  }
  const r = Math.max(1, a.crown - a.spring);
  const R = (w * w / 4 + r * r) / (2 * r);
  return { mid, w, pointed, hs: a.crown - R, R, cL: mid, cR: mid };
}
// Altitude de l'intrados en l (−∞ hors de l'arche).
function intrados(g, l) {
  const c = l < g.mid ? g.cL : g.cR;
  const d = l - c;
  if (Math.abs(d) >= g.R) return -Infinity;
  return g.hs + Math.sqrt(g.R * g.R - d * d);
}
// Distance au centre de l'arc qui porte le point (l, h) (anneau de voussoirs).
function arcDist(g, l, h) {
  const c = l < g.mid ? g.cL : g.cR;
  return { d: Math.hypot(l - c, h - g.hs), ang: Math.atan2(h - g.hs, l - c) };
}

// ── LE PEINTRE DES CALQUES ───────────────────────────────────────────────────
// M = modèle géométrique d'une travée (cf. isoBridge.buildModel), K = kit de
// l'ère (cf. bridgeKits.js), roadTex(l, t) = texture de chaussée ou null.
export function bakeBridge(M, K, roadTex = null) {
  const v = M.vertical;
  const P = K.pal;
  const S = K.superstructure;
  const hTop = Math.max((K.parapet.h || 0) + (K.ped ? K.ped.h + 2 : 0) + 4, S ? (S.mastH || S.towerH || 0) + 6 : 0);
  const hBot = -(M.hq + 4);
  const tMax = M.tDn + (K.pier ? K.pier.cut : 0) + 6, tMin = M.tUp - 6;
  const base = frameOf(v, [[M.dA - 4, M.dB + 4, tMin, tMax, hBot, hTop]]);
  const { ox, oy, w, h } = base;
  const deck = base, back = makeRaster(ox, oy, w, h), front = makeRaster(ox, oy, w, h);
  paintDeck(deck, M, K, P, roadTex);
  paintBack(back, M, K, P);
  paintFront(front, M, K, P);
  // Source du REFLET : la face avant avec les jours d'arches BOUCHÉS en sombre
  // jusqu'à l'eau. Le reflet retourne chaque colonne autour de son pixel opaque
  // le plus bas : bouchée, chaque colonne a pour pied la ligne d'eau (et la voûte
  // se reflète sombre, comme le dessous d'un vrai pont dans la rivière).
  const refl = makeRaster(ox, oy, w, h);
  paintFront(refl, M, K, P, { fillOpen: true });
  // Une pierre à l'ombre, vue dans l'eau, est plus sombre qu'au sec.
  for (let i = 0; i < refl.data.length; i += 4) {
    refl.data[i] *= 0.78; refl.data[i + 1] *= 0.8; refl.data[i + 2] *= 0.84;
  }
  const gates = (M.gates || []).map((g) => bakeGate(M, K, P, g));
  const monuments = (M.monuments || []).map((mo) => bakeMonument(M, K, P, mo));
  return { ox, oy, w, h, deck, back, front, refl, gates, monuments };
}

// ── Tablier ──────────────────────────────────────────────────────────────────
function paintDeck(R, M, K, P, roadTex) {
  const v = M.vertical, D = K.deck;
  const tIn0 = M.tUp + M.pth, tIn1 = M.tDn - M.pth;
  const ww = D.walkW || 0;
  const wood = D.plank || D.log;
  const deckCol = D.col ? rgbOf(D.col) : null;
  const tex = (l, t) => {
    // Hors des parapets (atterrissage) : gabarit de la route seulement ; un
    // platelage de bois, lui, s'arrête avec ses garde-corps.
    if (l < M.pA || l >= M.pB) {
      if (wood) return null;
      if (t < M.c - M.roadHalf || t >= M.c + M.roadHalf) return null;
    }
    if (D.log) {
      // RONDINS en travers : dessus éclairé, flanc, creux d'ombre entre deux.
      const n = D.log, k = Math.floor((l + 4096) / n), r = (l + 4096) - k * n;
      const W = P.wood, tw = h32(k, 5) % 4 === 0 ? 1 : 0;
      return rgbOf(r < 1 ? W[3] : r < 2 ? W[0 + tw] : W[1 + tw]);
    }
    if (D.plank) {
      const n = D.plank, k = Math.floor((l + 4096) / n);
      if ((l + 4096) - k * n < 1) return rgbOf(P.wood[3]);
      const vv = h32(k, 11) % 6;
      // Un clou au bout de chaque planche, côté parapet.
      if ((t < tIn0 + 2 || t > tIn1 - 2) && (l + 4096) - k * n < 2) return rgbOf(P.wood[3]);
      return rgbOf(P.wood[vv === 0 ? 1 : 0]);
    }
    if (roadTex) { const c = roadTex(l, t); if (c) return c; }
    return deckCol;
  };
  paintTop(R, v, M.dA, M.dB, M.tUp, M.tDn, 0, tex);
  // Seuils aux deux bouts : une ligne de pierre en travers (joint de dilatation),
  // ce qui fait du raccord avec la route un DESSIN et non une couture.
  if (D.sill) {
    const sc = rgbOf(D.sill);
    for (const l of [M.pA, M.pB - 2]) {
      paintTop(R, v, l, l + 2, M.c - M.roadHalf, M.c + M.roadHalf, 0, () => sc);
    }
  }
  // TROTTOIRS surélevés d'1 px le long des parapets (entre les culées).
  if (ww > 0) {
    const wc = rgbOf(D.walk), we = rgbOf(D.walkEdge || D.walk), wj = rgbOf(D.walkJoint || D.joint);
    const slab = D.walkSlab || 8;
    const topW = (l) => {
      const k = Math.floor((l + 4096) / slab);
      if ((l + 4096) - k * slab < 1) return wj;
      return wc;
    };
    for (const [t0, t1] of [[tIn0, tIn0 + ww], [tIn1 - ww, tIn1]]) {
      paintBox(R, v, M.pA, M.pB, t0, t1, 0, 1,
        (face) => face === 't' ? we : null, topW);
    }
  }
}

// ── Parapets (communs aux familles) ──────────────────────────────────────────
// Couleurs de garde-corps : métal de l'ère, sinon bois, sinon pierre.
function railCols(P) {
  if (P.rail) return P.rail.map(rgbOf);
  if (P.iron) return [P.iron[0], P.iron[1], P.iron[3]].map(rgbOf);
  if (P.wood) return [P.wood[0], P.wood[1], P.wood[3]].map(rgbOf);
  return [P.stone[2], P.stone[4], P.stone[6]].map(rgbOf);
}
// Texture d'une face de parapet selon son type. u = l, hv = altitude au-dessus
// du tablier. Retourne null pour un JOUR (on voit à travers : balustres, lisses).
function parapetTex(K, P, u, hv, lit) {
  const Q = K.parapet;
  const base = shadeOf(K, lit);
  const H = Q.h;
  const rc = railCols(P);
  if (Q.type === 'balustrade') {
    const plinth = Q.plinth || 2, rail = Q.rail || 2;
    if (hv >= H - rail) return hv === H - 1 ? ramp(P, base - 1) : ramp(P, base);        // main courante
    if (hv < plinth) return hv === plinth - 1 ? ramp(P, base - 1) : ramp(P, base + 1);   // socle
    // Balustres : pas de 4 px, 2 pleins + 2 jours ; ventre élargi au milieu.
    const per = Q.pitch || 4;
    const k = mod(u, per);
    const belly = hv === Math.floor((plinth + H - rail) / 2);
    const mc = rgbOf(lit ? P.marble[0] : P.marble[1]), md = rgbOf(lit ? P.marble[1] : P.marble[2]);
    if (k === 0) return mc;
    if (k === 1) return md;
    if (k === 2 && belly) return rgbOf(P.marble[2]);
    return null;
  }
  if (Q.type === 'wall') {
    // Muret plein, chaperon clair.
    if (hv >= H - 1) return ramp(P, base - 1);
    return ashlar(P, u, hv, lit, K, 5);
  }
  if (Q.type === 'crenel') {
    // Parapet CRÉNELÉ : muret plein, merlons au-dessus (pas `pitch`, moitié plein).
    if (hv < H - 2) return hv === H - 3 ? ramp(P, base - 1) : ashlar(P, u, hv, lit, K, 5);
    const k = mod(u, Q.pitch || 6);
    if (k >= Math.floor((Q.pitch || 6) / 2)) return null;
    return hv === H - 1 ? ramp(P, base - 1) : ramp(P, base);
  }
  if (Q.type === 'rail') {
    // Garde-corps : poteaux + lisse haute + sous-lisse, jours entre.
    const per = Q.pitch || 8;
    const k = mod(u, per);
    if (hv >= H - 1) return lit ? rc[0] : rc[1];
    if (hv === H - 2) return rc[2];
    if (k === 0) return lit ? rc[0] : rc[1];
    if (k === 1) return rc[2];
    if (Q.mid && hv === Math.floor(H / 2)) return rc[1];
    return null;
  }
  if (Q.type === 'rope') {
    // Pieux espacés, corde qui pend entre eux.
    const per = Q.pitch || 12;
    const uu = mod(u, per);
    if (uu === 0) return lit ? rc[0] : rc[1];
    if (uu === 1) return rc[2];
    const x = uu / per;                                   // 0..1 entre deux pieux
    const sag = Math.round((H - 1) - 2.5 * 4 * x * (1 - x));
    if (hv === sag) return rgbOf(P.rope);
    return null;
  }
  if (Q.type === 'lattice') {
    // Garde-corps de FONTE ouvragé : lisses haute et basse, montants, un anneau
    // dans chaque travée.
    const per = Q.pitch || 6;
    const uu = mod(u, per);
    if (hv >= H - 1) return lit ? rc[0] : rc[1];
    if (hv === 0) return rc[1];
    if (uu === 0) return rc[2];
    const d = Math.hypot(uu - per / 2, hv - (H - 1) / 2);
    if (Math.abs(d - Math.min(per, H) * 0.32) < 0.6) return rc[1];
    return null;
  }
  if (Q.type === 'glass') {
    // Verre teinté + lisse lumineuse.
    if (hv >= H - 1) return rgbOf(P.glow || rc[0]);
    if (hv === 0) return rc[1];
    const per = Q.pitch || 16;
    if (mod(u, per) === 0) return rc[1];
    return [...rgbOf(P.glass || '#9fb6c8'), 120];
  }
  return ramp(P, base);
}

function paintParapet(R, M, K, P, side) {
  const v = M.vertical, Q = K.parapet;
  if (!Q || !Q.h) return;
  const up = side === 'up';
  const t0 = up ? M.tUp : M.tDn - M.pth, t1 = up ? M.tUp + M.pth : M.tDn;
  const hh = Q.type === 'crenel' ? Q.h : Q.h;
  // Face visible : amont → sa face INTÉRIEURE (t1, normale +t) ; aval → sa face
  // EXTÉRIEURE (t1 = tDn, normale +t). Toutes deux en t1.
  paintWall(R, v, 't', t1, M.pA, M.pB, 0, hh, (u, hv, lit) => parapetTex(K, P, u, hv, lit));
  // Bout visible (normale +l) du parapet, côté pB.
  const rc = railCols(P);
  const solidEnd = Q.type === 'wall' || Q.type === 'crenel' || Q.type === 'balustrade';
  paintWall(R, v, 'l', M.pB, t0, t1, 0, hh, (u, hv, lit) => solidEnd ? ramp(P, shadeOf(K, lit)) : (lit ? rc[0] : rc[1]));
  // Margelle (dessus).
  if (Q.type === 'rope') return;
  const topC = Q.type === 'balustrade' ? rgbOf(P.marble[0]) : Q.type === 'glass' ? rgbOf(P.glow || rc[0])
    : Q.type === 'rail' || Q.type === 'lattice' ? rc[0] : ramp(P, 1);
  if (Q.type === 'crenel') {
    paintTop(R, v, M.pA, M.pB, t0, t1, Q.h - 2, () => ramp(P, 2));
    paintTop(R, v, M.pA, M.pB, t0, t1, Q.h, (l) => (mod(l, Q.pitch || 6) < Math.floor((Q.pitch || 6) / 2) ? topC : null));
  } else paintTop(R, v, M.pA, M.pB, t0, t1, Q.h, () => topC);
}

// Piédestal carré (dé) sur le parapet, au droit d'une pile ou en tête de pont.
function paintPed(R, M, K, P, pd) {
  const v = M.vertical, E = K.ped;
  if (!E) return;
  const up = pd.side === 'up';
  const half = (pd.end ? E.wEnd || E.w : E.w) / 2;
  const tc = up ? M.tUp + M.pth / 2 : M.tDn - M.pth / 2;
  const tw = M.pth / 2 + (E.over || 1.5);
  const l0 = pd.l - half, l1 = pd.l + half;
  const H = pd.end ? E.hEnd || E.h : E.h;
  const face = (f, u, hv, lit) => {
    const base = shadeOf(K, lit);
    if (hv >= H - 2) return ramp(P, base - (hv === H - 1 ? 1 : 0));        // corniche
    if (hv < 2) return ramp(P, base + 1);                                   // plinthe
    if (E.panel && hv >= 4 && hv <= H - 5) {
      const uu = f === 't' ? u - l0 : u - (tc - tw);
      const span = f === 't' ? l1 - l0 : 2 * tw;
      if (uu >= 1.5 && uu < span - 1.5) return ramp(P, base + 1);           // table creuse
    }
    return ramp(P, base);
  };
  paintBox(R, v, l0, l1, tc - tw, tc + tw, 0, H - 2, face, () => ramp(P, 1));
  // Corniche débordante d'1 px.
  paintBox(R, v, l0 - 1, l1 + 1, tc - tw - 1, tc + tw + 1, H - 2, H, face, () => ramp(P, 0));
}

// ── Calque ARRIÈRE ───────────────────────────────────────────────────────────
function paintBack(R, M, K, P) {
  paintSuper(R, M, K, P, 'up');
  paintParapet(R, M, K, P, 'up');
  for (const pd of M.peds) if (pd.side === 'up') paintPed(R, M, K, P, pd);
}

// ── Calque AVANT ─────────────────────────────────────────────────────────────
function paintFront(R, M, K, P, opts = {}) {
  const F = K.face;
  if (F.type === 'arches') paintArchFace(R, M, K, P, opts);
  else if (F.type === 'trestle') paintTrestle(R, M, K, P);
  else if (F.type === 'ironarch') paintIronArch(R, M, K, P, opts);
  else if (F.type === 'girder') paintGirder(R, M, K, P);
  else if (F.type === 'thin') paintThin(R, M, K, P);
  // Parapet aval par-dessus (il repose sur la corniche).
  paintParapet(R, M, K, P, 'dn');
  for (const pd of M.peds) if (pd.side === 'dn') paintPed(R, M, K, P, pd);
  paintSuper(R, M, K, P, 'dn');
}

// Bande mouillée au pied (eau qui lèche la pierre) : 2 px verdâtres.
function wetBand(P, hv, hq) {
  if (hv < -hq + 1) return rgbOf(P.wet[1]);
  if (hv < -hq + 2) return rgbOf(P.wet[0]);
  return null;
}

// ── Famille 'arches' (pierre : romane, romaine, gothique) ────────────────────
function paintArchFace(R, M, K, P, opts = {}) {
  const v = M.vertical, F = K.face;
  const geos = M.arches.map((a) => ({ a, g: archGeom(a, !!F.pointed) }));
  const ring = F.ring || 3;
  const hq = M.hq;
  const shut = opts.fillOpen ? ramp(P, 7) : null;
  const faceTex = (u, hv, lit) => {
    const base = shadeOf(K, lit);
    // Corniche : cordon clair au ras du tablier, ombre portée juste dessous.
    if (hv >= -1) return ramp(P, base - 2 + (hv === -1 ? 1 : 0));
    if (hv === -2) return ramp(P, base + 3);
    for (const { a, g } of geos) {
      if (u < a.l0 - ring - 1 || u >= a.l1 + ring + 1) continue;
      const hi = intrados(g, u);
      if (u >= a.l0 && u < a.l1 && hv < hi) {
        // JOUR de l'arche : l'eau se voit (ombrée par drawIsoBridgeUnder). Un filet
        // d'intrados sombre juste sous la voûte dit l'épaisseur du pont.
        if (hv >= hi - 1.5 && hv >= g.hs) return ramp(P, 7);
        return shut;
      }
      // Anneau de voussoirs (distance RADIALE au centre de l'arc qui porte le point).
      const { d, ang } = arcDist(g, u, hv + 0.5);
      if (d >= g.R && d < g.R + ring && hv >= g.hs - 1) {
        const nV = Math.max(5, Math.round((Math.PI * g.R) / (F.vous || 4)));
        const q = ang / Math.PI * nV;
        const keyTop = Math.abs(u - g.mid) < 1.5 && hv > (g.hs + g.R * 0.5);
        if (keyTop) return ramp(P, base - 2);                                   // clé
        if (Math.abs(q - Math.round(q)) < 0.16) return ramp(P, base + 3);       // joint rayonnant
        return ramp(P, base - 1 + (d >= g.R + ring - 1 ? 1 : 0));
      }
    }
    const wb = wetBand(P, hv, hq);
    if (wb) return wb;
    return ashlar(P, u, hv, lit, K, 1);
  };
  paintWall(R, v, 't', M.tDn, M.fA, M.fB, -hq, 0, faceTex);
  paintNoses(R, M, K, P);
  // CULÉES : pilastre à chaque bout de la face, là où elle entre dans la berge.
  for (const [a, b] of [[M.fA, M.fA + 5], [M.fB - 5, M.fB]]) {
    paintBox(R, v, a, b, M.tDn, M.tDn + 2, -hq, 0,
      (f, u, hv, lit) => wetBand(P, hv, hq) || ashlar(P, u, hv, lit, K, 13), () => ramp(P, 0));
  }
}

// PILES : avant-bec aval POINTU (triangle en plan) coiffé d'un glacis qui
// descend du parement vers la pointe. Peint en tranches d'un pixel monde le long
// de l, dans l'ordre croissant : la tranche suivante, plus proche, recouvre la
// précédente, et il ne reste à l'écran que les deux pans du nez. Le pan sud
// (vers l'écran bas-gauche) prend la lumière, le pan nord est à l'ombre.
function paintNoses(R, M, K, P) {
  const v = M.vertical, hq = M.hq, Pi = K.pier;
  if (!Pi || !(Pi.cut > 0)) return;
  for (const p of M.piers) {
    const half = Pi.bw / 2;
    const top = Pi.top != null ? Pi.top : -Math.round(hq * 0.45);
    for (let l = Math.floor(p.l - half); l < Math.ceil(p.l + half); l += 1) {
      const lc = l + 0.5;
      const k = 1 - Math.abs(lc - p.l) / half;           // 1 au nez, 0 aux flancs
      if (k <= 0) continue;
      const tip = M.tDn + Pi.cut * k;
      const south = lc > p.l;
      const ridge = Math.abs(lc - p.l) < 0.9;
      paintWall(R, v, 'l', l + 1, M.tDn, tip, -hq, top + 3, (t, hv) => {
        const capH = top + 3 - 3 * ((t - M.tDn) / Math.max(1, Pi.cut));
        if (hv >= capH) return null;
        const base = shadeOf(K, south);
        if (hv >= capH - 1.5) return ramp(P, base - 1);                   // arête du glacis
        const wb = wetBand(P, hv, hq);
        if (wb) return wb;
        if (ridge) return ramp(P, base - 1);                               // arête du nez
        return ashlar(P, (t - M.tDn) + Math.abs(lc - p.l) * 2, hv, south, K, 9);
      });
    }
  }
}

// ── Famille 'trestle' (bois) : palées de pieux, longeron, contreventement ──────
function paintTrestle(R, M, K, P) {
  const v = M.vertical, F = K.face, hq = M.hq, W = P.wood;
  const beamH = F.beam || 3;
  const tF = M.tDn;
  // Longeron sous le platelage, sur toute l'eau.
  paintWall(R, v, 't', tF, M.fA - 2, M.fB + 2, -beamH, 0, (u, hv, lit) =>
    hv === -beamH ? rgbOf(W[3]) : hv === -1 ? rgbOf(W[lit ? 0 : 1]) : woodTex(P, u, hv, lit, 1));
  // Palées : un pieu rond au droit de chaque pile, et aux deux berges.
  const posts = [M.fA + 2, ...M.piers.map((p) => p.l), M.fB - 2];
  const bottom = -beamH;
  const strut = rgbOf(W[2]);
  for (const l of posts) {
    paintBox(R, v, l - 1.5, l + 1.5, tF - 3, tF, -hq, bottom,
      (f, u, hv) => wetBand(P, hv, hq) || rgbOf(W[f === 'l' ? 0 : 1]), () => rgbOf(W[0]));
    // Jambes de force (bois) : du pieu au longeron, en V.
    if (F.knee) {
      paintLine(R, v, [l - 1, tF, bottom - 6], [l - 6, tF, bottom - 1], W[2]);
      paintLine(R, v, [l + 1, tF, bottom - 6], [l + 6, tF, bottom - 1], W[2]);
    }
  }
  // Contreventement en X entre deux palées proches (jamais dans la passe).
  if (F.brace) {
    for (let i = 0; i + 1 < posts.length; i += 1) {
      const a = posts[i], b = posts[i + 1];
      if (b - a > 1.5 * (M.T || 32)) continue;
      paintLine(R, v, [a + 1, tF - 1, bottom - 1], [b - 1, tF - 1, -hq + 3], strut);
      paintLine(R, v, [b - 1, tF - 1, bottom - 1], [a + 1, tF - 1, -hq + 3], strut);
    }
  }
}

// ── Famille 'ironarch' (fonte) : arcs de fonte surbaissés sur piles de pierre ──
// Poutre de rive à filet doré ; sous elle, chaque travée est un ARC de fonte dont
// le tympan est AJOURÉ (montants et anneaux) : on voit l'eau à travers.
function paintIronArch(R, M, K, P, opts = {}) {
  const v = M.vertical, F = K.face, hq = M.hq, I = P.iron.map(rgbOf), G = P.gold.map(rgbOf);
  const gH = F.girder || 4, rib = F.rib || 3;
  const shut = opts.fillOpen ? ramp(P, 7) : null;
  // Arcs : naissance à l'eau, clé juste sous la poutre.
  const geos = M.arches.map((a) => ({ a, g: archGeom({ l0: a.l0, l1: a.l1, crown: -gH - 1, spring: -hq }) }));
  const pierAt = (u) => M.piers.some((p) => Math.abs(u - p.l) <= p.w / 2) || u < M.fA + 4 || u >= M.fB - 4;
  paintWall(R, v, 't', M.tDn, M.fA, M.fB, -hq, 0, (u, hv, lit) => {
    if (hv >= -gH) {                                                       // poutre de rive
      if (hv === -1) return G[lit ? 0 : 1];
      if (hv === -gH) return I[3];
      if (hv === -Math.ceil(gH / 2) && mod(u, 5) === 0) return G[1];        // rivets dorés
      return I[lit ? 1 : 2];
    }
    if (pierAt(u)) return wetBand(P, hv, hq) || ashlar(P, u, hv, lit, K, 3);
    for (const { a, g } of geos) {
      if (u < a.l0 || u >= a.l1) continue;
      const { d } = arcDist(g, u, hv + 0.5);
      if (d >= g.R - rib / 2 && d < g.R + rib / 2) return I[d < g.R ? 2 : 1];   // l'arc
      if (d < g.R - rib / 2) return shut;                                   // sous l'arc : l'eau
      // Tympan ajouré : montants tous les 8 px, un anneau entre deux.
      const k = mod(u - a.l0, 8);
      if (k === 0) return I[2];
      const top = -gH, bot = intrados(g, u) + rib / 2;
      const cy = (top + bot) / 2, r = Math.min(2.6, (top - bot) / 2 - 0.4);
      if (r > 0.8 && Math.abs(Math.hypot(k - 4, hv + 0.5 - cy) - r) < 0.65) return I[1];
      return shut;
    }
    return shut;
  });
  paintNoses(R, M, K, P);
}

// ── Famille 'girder' (béton) : caisson mince sur piles élancées ───────────────
function paintGirder(R, M, K, P) {
  const v = M.vertical, F = K.face, hq = M.hq;
  const gh = F.girder || 6;
  // Piles : colonnes rondes en retrait sous le tablier, chapiteau sous le caisson.
  for (const p of M.piers) {
    const l0 = p.l - p.w / 2, l1 = p.l + p.w / 2, t1 = M.tDn - 4, t0 = M.tDn - 4 - p.w;
    paintBox(R, v, l0, l1, t0, t1, -hq, -gh, (f, u, hv) => {
      if (f === 'l') return wetBand(P, hv, hq) || ramp(P, 3);
      const x = (u - l0) / (l1 - l0);                                       // fût rond
      return wetBand(P, hv, hq) || ramp(P, x < 0.3 ? 2 : x < 0.7 ? 4 : 6);
    }, null);
    paintBox(R, v, l0 - 2, l1 + 2, t0 - 2, M.tDn, -gh - 3, -gh,
      (f, u, hv, lit) => ramp(P, shadeOf(K, lit) - 1), null);
  }
  paintWall(R, v, 't', M.tDn, M.fA - 4, M.fB + 4, -gh, 0, (u, hv, lit) => {
    const base = shadeOf(K, lit);
    if (hv >= -1) return ramp(P, base - 2);                                // nez de dalle
    if (hv === -gh) return ramp(P, base + 3);                              // goutte d'eau
    if (mod(u, 32) === 0) return ramp(P, base + 1);                        // joint de voussoir
    return ramp(P, base - 1);
  });
}

// ── Famille 'thin' (cosmique) : tablier mince bordé d'un filet de lumière ──────
function paintThin(R, M, K, P) {
  const v = M.vertical, gh = K.face.girder || 3;
  paintWall(R, v, 't', M.tDn, M.pA, M.pB, -gh, 0, (u, hv, lit) => {
    if (hv === -gh) return rgbOf(P.glow);
    if (hv >= -1) return ramp(P, shadeOf(K, lit) - 2);
    return ramp(P, shadeOf(K, lit) + 1);
  });
}

// ── SUPERSTRUCTURES : haubans (néon), suspension (cosmique) ───────────────────
// Côté 'up' dans le calque arrière, côté 'dn' dans le calque avant : un mât aval
// passe DEVANT les passants, un mât amont derrière.
function paintSuper(R, M, K, P, side) {
  const S = K.superstructure;
  if (!S) return;
  const v = M.vertical, up = side === 'up';
  const tw = 3;
  const t0 = up ? M.tUp - tw : M.tDn, t1 = up ? M.tUp : M.tDn + tw;
  const tCab = (t0 + t1) / 2;
  const hBase = up ? 0 : -M.hq;
  const Q = K.parapet || { h: 0 };
  const box = (l0, l1, h0, h1, cap) => paintBox(R, v, l0, l1, t0, t1, h0, h1,
    (f, u, hv, lit) => (hv >= h1 - 2 && cap ? rgbOf(cap) : ramp(P, shadeOf(K, lit) - 1 + (f === 't' ? 1 : 0))), () => ramp(P, 0));
  if (S.type === 'stayed') {
    const H = S.mastH, half = (S.mastW || 4) / 2;
    const cable = P.cable || P.stone[1];
    for (const lm of M.masts) {
      // Haubans d'abord (le mât les coiffe) : éventail vers la rive et vers le fleuve.
      const others = M.masts.filter((x) => x !== lm);
      for (let i = 0; i < S.stays; i += 1) {
        const hTop = H - 8 - i * 6;
        for (const dir of [-1, 1]) {
          // Vers le mât voisin : jusqu'à mi-chemin (les deux éventails se rejoignent
          // au milieu, ils ne se croisent pas) ; vers la rive : jusqu'à la culée.
          const nb = others.filter((x) => (x - lm) * dir > 0).sort((a, b) => Math.abs(a - lm) - Math.abs(b - lm))[0];
          const reach = nb != null ? Math.abs(nb - lm) / 2 - 2 : (dir < 0 ? lm - M.pA - 6 : M.pB - 6 - lm);
          const d = 10 + (i + 1) * Math.max(6, (reach - 10) / S.stays);
          const la = lm + dir * Math.min(d, reach);
          paintLine(R, v, [lm, tCab, hTop], [la, tCab, Q.h], cable);
        }
      }
      box(lm - half, lm + half, hBase, H, null);
      if (!up) {
        // Traverse haute du H, d'un mât à l'autre, au-dessus de la chaussée.
        paintBox(R, v, lm - half + 0.5, lm + half - 0.5, M.tUp - tw, M.tDn + tw, H - 14, H - 10,
          (f, u, hv, lit) => ramp(P, shadeOf(K, lit)), () => ramp(P, 1));
      }
    }
  } else if (S.type === 'suspension') {
    const H = S.towerH, [lA, lB] = M.towers;
    const glow = P.glow, low = Q.h + 3, top = H - 3;
    const mid = (lA + lB) / 2, half = (lB - lA) / 2;
    const cab = (l) => low + (top - low) * Math.pow(Math.abs(l - mid) / half, 2);
    // Suspentes, câble porteur, haubans de retenue.
    for (let l = lA + 6; l < lB - 4; l += 6) paintLine(R, v, [l, tCab, Q.h], [l, tCab, cab(l) - 1], P.rail[1]);
    for (let l = lA; l < lB; l += 3) paintLine(R, v, [l, tCab, cab(l)], [Math.min(lB, l + 3), tCab, cab(Math.min(lB, l + 3))], glow);
    paintLine(R, v, [lA, tCab, top], [M.pA + 2, tCab, Q.h], glow);
    paintLine(R, v, [lB, tCab, top], [M.pB - 2, tCab, Q.h], glow);
    for (const lt of [lA, lB]) {
      box(lt - (S.towerW || 3) / 2, lt + (S.towerW || 3) / 2, hBase, H, glow);
      if (!up) {
        paintBox(R, v, lt - 1, lt + 1, M.tUp - tw, M.tDn + tw, H - 8, H - 5,
          (f, u, hv, lit) => ramp(P, shadeOf(K, lit)), () => rgbOf(glow));
      }
    }
  }
}

// ── LES PORTES (elles enjambent la route) ────────────────────────────────────
// Un mur épais perpendiculaire au pont (l ∈ [l0, l1], t ∈ [tA, tB]) percé d'un
// passage au-dessus de la chaussée (t ∈ [o0, o1]). Sa façade visible (normale +l)
// est ÉCLAIRÉE pour un pont vertical, son flanc (+t) à l'ombre. Raster propre.
function bakeGate(M, K, P, g) {
  const v = M.vertical;
  const R = frameOf(v, [[g.l0 - 3, g.l1 + 3, g.tA - 3, g.tB + 3, -2, g.hTop + 2]]);
  if (g.type === 'triumph') gateTriumph(R, M, K, P, g);
  else if (g.type === 'portal') gatePortal(R, M, K, P, g);
  else if (g.type === 'tower') gateTower(R, M, K, P, g);
  else if (g.type === 'ring') gateRing(R, M, K, P, g);
  if (g.type !== 'ring') outline(R, P.stone[7]);
  return { R, g };
}

// ARC DE TRIOMPHE (bande 4) : piles à colonnes engagées, entablement, attique à
// inscription de bronze.
function gateTriumph(R, M, K, P, g) {
  const v = M.vertical;
  const mid = (g.o0 + g.o1) / 2, rad = (g.o1 - g.o0) / 2;
  const archTop = (t) => { const d = t - mid; return Math.abs(d) >= rad ? -Infinity : g.hs + Math.sqrt(rad * rad - d * d); };
  const ring = 2;
  // Colonnes engagées : deux par pile, de part et d'autre.
  const cols = [g.tA + 4, g.o0 - 4, g.o1 + 4, g.tB - 4];
  const marble = (k) => rgbOf(P.marble[Math.max(0, Math.min(P.marble.length - 1, k))]);
  const bronze = (k) => rgbOf((P.bronze || P.marble)[k]);
  // Bandeaux horizontaux communs à la façade et au flanc (entablement, attique).
  const bands = (hv, lit) => {
    const base = shadeOf(K, lit);
    if (hv >= g.hTop - 1) return ramp(P, base - 2);                       // corniche d'attique
    if (hv >= g.hE1) return null;                                          // attique : décidé par l'appelant
    if (hv >= g.hE1 - 2) return hv === g.hE1 - 1 ? marble(0) : ramp(P, base + 2);   // corniche + ombre
    if (hv >= g.hE0 + 2) return ramp(P, base);                             // frise
    if (hv >= g.hE0) return marble(lit ? 0 : 1);                           // architrave
    if (hv < 2) return ramp(P, base + 1);                                  // socle
    return undefined;
  };
  // 1) Paroi intérieure du passage, côté ouest (normale +t, à l'ombre).
  paintWall(R, v, 't', g.o0, g.l0, g.l1, 0, g.hs + 2, (u, hv) => dim(ashlar(P, u, hv, false, K, 31), 0.78));
  // 2) FAÇADE (normale +l).
  paintWall(R, v, 'l', g.l1, g.tA, g.tB, 0, g.hTop, (t, hv, lit) => {
    const base = shadeOf(K, lit);
    const at = archTop(t);
    if (t > g.o0 && t < g.o1 && hv < at) {
      // Le passage — un filet d'ombre sous l'intrados dit l'épaisseur de la porte.
      return hv >= at - 1.5 && hv >= g.hs ? ramp(P, 6) : null;
    }
    const b = bands(hv, lit);
    if (b) return b;
    if (b === null) {
      // ATTIQUE : table d'inscription de marbre, lettres de bronze.
      if (t >= g.o0 + 5 && t < g.o1 - 5 && hv >= g.hE1 + 2 && hv < g.hTop - 3) {
        const row = hv - (g.hE1 + 2);
        if (t < g.o0 + 6 || t >= g.o1 - 6 || row === 0 || hv === g.hTop - 4) return marble(1);
        if ((row === 2 || row === 4) && mod(t, 3) !== 2 && h32(Math.floor(t), row, 77) % 5) return bronze(1);
        return marble(0);
      }
      return ashlar(P, t, hv, lit, K, 23);
    }
    // Anneau de voussoirs + clé.
    if (t > g.o0 - ring && t < g.o1 + ring) {
      const d = Math.hypot(t - mid, hv + 0.5 - g.hs);
      if (hv >= g.hs && d >= rad && d < rad + ring + 1) {
        if (Math.abs(t - mid) < 1.6) return marble(0);                    // clé
        const ang = Math.atan2(hv + 0.5 - g.hs, t - mid);
        const q = ang / Math.PI * 11;
        if (Math.abs(q - Math.round(q)) < 0.14) return ramp(P, base + 2); // joint rayonnant
        return marble(1);
      }
      if (hv >= g.hs && Math.abs(t - mid) < 1.6 && d < rad + ring + 2) return marble(0);
    }
    // Colonnes engagées : fût de marbre modelé, chapiteau élargi sous l'architrave.
    for (const tc of cols) {
      const dx = t - tc;
      if (hv >= g.hE0 - 2 && hv < g.hE0 && Math.abs(dx) < 2.5) return marble(0);   // chapiteau
      if (hv >= 2 && hv < g.hE0 - 2) {
        if (dx >= -1.5 && dx < 1.5) return marble(dx < -0.5 ? 0 : dx < 0.5 ? 1 : 2);
        if (dx >= 1.5 && dx < 2.5) return ramp(P, base + 2);             // ombre portée de la colonne
      }
    }
    return ashlar(P, t, hv, lit, K, 19);
  });
  // 3) FLANC est (normale +t, à l'ombre pour un pont vertical).
  paintWall(R, v, 't', g.tB, g.l0, g.l1, 0, g.hTop, (u, hv, lit) => {
    const b = bands(hv, lit);
    if (b) return b;
    return ashlar(P, u, hv, lit, K, 29);
  });
  // 4) Dessus de l'attique.
  paintTop(R, v, g.l0, g.l1, g.tA, g.tB, g.hTop, () => ramp(P, 1));
}

// PORTAIL DE BOIS (bande 1) : deux poteaux, un linteau, un petit toit à deux pans
// de chaume, une lanterne pendue (posée par isoBridge, elle brûle).
function gatePortal(R, M, K, P, g) {
  const v = M.vertical, W = P.wood, RF = P.roof;
  const lc = (g.l0 + g.l1) / 2;
  const post = (t0, t1) => paintBox(R, v, lc - 1.5, lc + 1.5, t0, t1, 0, g.postH,
    (f, u, hv, lit) => (hv < 2 ? rgbOf(W[3]) : woodTex(P, u, hv, lit, 7)), () => rgbOf(W[0]));
  post(g.tA, g.tA + 3);
  post(g.tB - 3, g.tB);
  // Linteau, sous le toit.
  paintBox(R, v, lc - 2, lc + 2, g.tA - 1, g.tB + 1, g.postH - 4, g.postH,
    (f, u, hv, lit) => woodTex(P, u, hv, lit, 9), () => rgbOf(W[0]));
  // Toit à deux pans : pan avant (éclairé) et pignon est (à l'ombre).
  const e = g.postH, r = e + g.roofH, ov = 7;
  const A = projLT(v, lc + ov, g.tA - 3, e), B = projLT(v, lc + ov, g.tB + 3, e);
  const C = projLT(v, lc - ov, g.tB + 3, e);
  const E = projLT(v, lc, g.tA - 3, r), F = projLT(v, lc, g.tB + 3, r);
  const thatch = (k) => (X, Y) => rgbOf(RF[k + (mod(Y, 3) === 0 ? 1 : 0)]);
  fillPoly(R, [B, C, F], thatch(2));
  fillPoly(R, [A, B, F, E], thatch(0));
  paintLine(R, v, [lc, g.tA - 3, r], [lc, g.tB + 3, r], RF[0]);
}

// TOUR-PORTE FORTIFIÉE (bande 3) : passage en ogive, archères, mâchicoulis,
// créneaux, toit d'ardoise en croupe (la bannière est posée par isoBridge).
function gateTower(R, M, K, P, g) {
  const v = M.vertical, SL = P.slate.map(rgbOf);
  const mid = (g.o0 + g.o1) / 2, w = g.o1 - g.o0;
  const geo = archGeom({ l0: g.o0, l1: g.o1, crown: g.hs + w * 0.62, spring: g.hs }, true);
  const pass = (t) => intrados(geo, t);
  const B = g.bodyH, C = g.crenH;
  const slit = (t, hv) => [(g.tA + g.o0) / 2, (g.o1 + g.tB) / 2].some((c) => Math.abs(t - c) < 0.8) && hv >= 18 && hv < 24;
  const facade = (t, hv, lit) => {
    const base = shadeOf(K, lit);
    if (hv >= B) {                                                         // créneaux
      if (mod(t - g.tA, 6) >= 3) return null;
      return hv === B + C - 1 ? ramp(P, base - 1) : ramp(P, base);
    }
    if (hv >= B - 4) {                                                     // mâchicoulis
      if (hv === B - 1) return ramp(P, base - 1);
      return mod(t - g.tA, 4) === 0 ? ramp(P, base + 1) : ramp(P, 7);
    }
    if (t > g.o0 && t < g.o1 && hv < pass(t)) return hv >= pass(t) - 1.5 && hv >= geo.hs ? ramp(P, 6) : null;
    const { d } = arcDist(geo, t, hv + 0.5);
    if (t > g.o0 - 3 && t < g.o1 + 3 && hv >= geo.hs && d >= geo.R && d < geo.R + 2) return ramp(P, base - 1);
    if (slit(t, hv)) return ramp(P, 8);
    if (hv < 2) return ramp(P, base + 1);
    return ashlar(P, t, hv, lit, K, 41);
  };
  // 1) Paroi intérieure du passage (ouest), dans l'ombre.
  paintWall(R, v, 't', g.o0, g.l0, g.l1, 0, geo.hs + 3, (u, hv) => dim(ashlar(P, u, hv, false, K, 43), 0.75));
  // 2) Chemin de ronde puis TOIT en croupe, en retrait derrière les créneaux.
  paintTop(R, v, g.l0, g.l1, g.tA, g.tB, B, () => ramp(P, 3));
  const e = B + C - 1, rr = (g.l1 - g.l0) / 2 - 1, lc = (g.l0 + g.l1) / 2;
  const a0 = g.tA + 2, a1 = g.tB - 2, l0 = g.l0 + 2, l1 = g.l1 - 2;
  const ridgeA = Math.min(a0 + rr, (a0 + a1) / 2), ridgeB = Math.max(a1 - rr, (a0 + a1) / 2);
  const pa = projLT(v, l1, a0, e), pb = projLT(v, l1, a1, e), pc = projLT(v, l0, a1, e);
  const pe = projLT(v, lc, ridgeA, e + g.roofH), pf = projLT(v, lc, ridgeB, e + g.roofH);
  const slate = (k) => (X, Y) => SL[k + (mod(Y, 3) === 0 ? 1 : 0)];
  fillPoly(R, [pb, pc, pf], slate(2));
  fillPoly(R, [pa, pb, pf, pe], slate(0));
  paintLine(R, v, [lc, ridgeA, e + g.roofH], [lc, ridgeB, e + g.roofH], P.slate[0]);
  // 3) Façade (+l) et flanc (+t).
  paintWall(R, v, 'l', g.l1, g.tA, g.tB, 0, B + C, facade);
  paintWall(R, v, 't', g.tB, g.l0, g.l1, 0, B + C, (u, hv, lit) => {
    const base = shadeOf(K, lit);
    if (hv >= B) return mod(u - g.l0, 6) >= 3 ? null : ramp(P, base);
    if (hv >= B - 4) return hv === B - 1 ? ramp(P, base - 1) : mod(u - g.l0, 4) === 0 ? ramp(P, base + 1) : ramp(P, 7);
    if (hv < 2) return ramp(P, base + 1);
    return ashlar(P, u, hv, lit, K, 47);
  });
  void mid;
}

// ANNEAU DE LUMIÈRE (bandes 7-9) : un arc d'énergie qui enjambe la route, posé
// sur deux socles. L'anneau arrière, plus sombre, lui donne son épaisseur.
function gateRing(R, M, K, P, g) {
  const v = M.vertical, c = (g.tA + g.tB) / 2, rad = (g.tB - g.tA) / 2;
  const glow = rgbOf(P.glow), core = [255, 250, 236];
  const ring = (k) => (t, hv) => {
    const d = Math.hypot(t - c, hv + 0.5);
    if (d < rad - g.band || d >= rad) return null;
    if (k) return dim(glow, 0.55);
    return d >= rad - g.band / 2 - 0.5 && d < rad - g.band / 2 + 0.5 ? core : glow;
  };
  paintWall(R, v, 'l', g.l0 + 1, g.tA, g.tB, 0, rad + 1, ring(1));
  paintWall(R, v, 'l', g.l1, g.tA, g.tB, 0, rad + 1, ring(0));
  for (const t0 of [g.tA - 1, g.tB - 5]) {
    paintBox(R, v, g.l0 - 1, g.l1 + 1, t0, t0 + 6, 0, 3, (f, u, hv, lit) => ramp(P, shadeOf(K, lit)), () => ramp(P, 1));
  }
}

// ── LES MONUMENTS posés aux quatre coins ─────────────────────────────────────
// Boîte [l0, l1] × [t0, t1] posée au sol (ce qui brûle ou trône dessus est un
// objet posé par isoBridge : flamme, statue dorée, lueur).
function bakeMonument(M, K, P, mo) {
  const v = M.vertical;
  const R = frameOf(v, [[mo.l0 - 4, mo.l1 + 4, mo.t0 - 4, mo.t1 + 4, -1, mo.h + 4]]);
  const L0 = mo.l0, L1 = mo.l1, T0 = mo.t0, T1 = mo.t1;
  const lc = (L0 + L1) / 2, tc = (T0 + T1) / 2;
  const stoneFace = (seed) => (f, u, hv, lit) => ashlar(P, u, hv, lit, K, seed);
  if (mo.type === 'totem') {
    // Cairn de pierres sèches au pied, mât peint de bandes, yeux sculptés.
    paintBox(R, v, lc - 3, lc + 3, tc - 3, tc + 3, 0, 3, (f, u, hv, lit) => ramp(P, shadeOf(K, lit) + (h32(Math.floor(u), hv) % 3 === 0 ? 1 : 0)), () => ramp(P, 2));
    const PT = P.paint;
    paintBox(R, v, L0, L1, T0, T1, 0, mo.h, (f, u, hv, lit) => {
      const band = Math.floor(hv / 4);
      if (hv % 4 === 3) return rgbOf(P.wood[3]);
      if (f === 'l' && band % 2 === 1 && hv % 4 === 1 && Math.abs(u - tc) < 1.2) return rgbOf(PT[3]);   // yeux
      const col = band % 3 === 0 ? PT[0] : band % 3 === 1 ? PT[1] : P.wood[0];
      return lit ? rgbOf(col) : dim(col, 0.78);
    }, () => rgbOf(P.wood[0]));
    // Tête du totem : une traverse en ailes, peinte, sous la torche.
    paintBox(R, v, L0 - 2, L1 + 2, T0 - 0.5, T1 + 0.5, mo.h - 4, mo.h - 1, (f, u, hv, lit) => rgbOf(hv === mo.h - 2 ? P.paint[1] : lit ? P.wood[0] : P.wood[2]), () => rgbOf(P.paint[0]));
  } else if (mo.type === 'pillar') {
    paintBox(R, v, L0 - 1, L1 + 1, T0 - 1, T1 + 1, 0, 3, stoneFace(51), () => ramp(P, 1));
    paintBox(R, v, L0, L1, T0, T1, 3, mo.h - 3, stoneFace(53), null);
    paintBox(R, v, L0 - 1, L1 + 1, T0 - 1, T1 + 1, mo.h - 3, mo.h, (f, u, hv, lit) => ramp(P, shadeOf(K, lit) - 1), () => ramp(P, 1));
    paintBox(R, v, L0 + 1.5, L1 - 1.5, T0 + 1.5, T1 - 1.5, mo.h, mo.h + 2, () => ramp(P, 7), () => ramp(P, 8));
  } else if (mo.type === 'pylon') {
    const G = P.gold.map(rgbOf);
    paintBox(R, v, L0 - 2, L1 + 2, T0 - 2, T1 + 2, 0, 4, stoneFace(61), () => ramp(P, 1));
    paintBox(R, v, L0, L1, T0, T1, 4, mo.h - 4, (f, u, hv, lit) => {
      const base = shadeOf(K, lit);
      const span = f === 't' ? [L0, L1] : [T0, T1];
      const inset = u > span[0] + 1.5 && u < span[1] - 1.5;
      if (hv === mo.h - 9 && inset) return G[lit ? 0 : 1];                  // guirlande dorée
      if (inset && hv > 8 && hv < mo.h - 10) return ramp(P, base + 1);      // table creuse
      return ramp(P, base);
    }, null);
    paintBox(R, v, L0 - 1, L1 + 1, T0 - 1, T1 + 1, mo.h - 4, mo.h, (f, u, hv, lit) => (hv === mo.h - 1 ? ramp(P, 0) : ramp(P, shadeOf(K, lit) - 1)), () => ramp(P, 1));
  } else if (mo.type === 'beacon') {
    paintBox(R, v, L0, L1, T0, T1, 0, mo.h, (f, u, hv, lit) => {
      if (hv >= mo.h - 3) return rgbOf(P.led);
      const span = f === 't' ? [L0, L1] : [T0, T1];
      if (Math.abs(u - (span[0] + span[1]) / 2) < 0.6 && hv > 3) return ramp(P, 5);   // rainure
      return ramp(P, shadeOf(K, lit) - 1);
    }, () => rgbOf(P.led));
  }
  if (mo.type !== 'beacon') outline(R, P.stone[7]);
  return { R, mo };
}
