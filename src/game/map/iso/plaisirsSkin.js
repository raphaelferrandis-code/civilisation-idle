"use strict";
// ── L'HABILLAGE DU LIEU : la matière PixelLab sur la composition du code ──────
//
// Retour de Raph, 2026-10-03 (soir) : « les extérieurs font très cheap et pas pixel
// art ». Mesuré : le lieu cuit par le code était deux fois plus « plat » que les
// sprites de la carte (empilement de cylindres en aplats : un gâteau). Décision :
// PixelLab GUIDÉ PAR NOTRE RENDU — la recette du code (plaisirsBake.js) donne la
// composition (étages du plan, porte, ponton, envol d'Icare), et PixelLab la redessine
// en vrai pixel art (img2img, fidélité 80 : il garde la silhouette, refait la
// matière : pilastres, baies en arc, balustrades, coupole à lanternons).
//
// Le code reste la VÉRITÉ GÉOMÉTRIQUE : l'habillage est posé à l'endroit exact du
// rendu qu'il a remplacé (`at` : son coin dans le raster de la recette), et chaque
// pixel prend la HAUTEUR du pixel du code sous lui — l'ombre au soleil et le reflet
// dans l'eau restent exacts. La nuit se lit sur ses propres vitres (les teintes
// bleues et violettes du verre, que rien d'autre ne porte sur le lieu).
//
// Un âge sans habillage garde le rendu du code.
import { plaisirsMirror } from './plaisirsBake.js';

// `src` : le sprite détouré (public/) ; `at` : son coin haut-gauche dans le REPÈRE DU
// LIEU (X = x − y, Y = (x + y)/2 − h, le pied du fût en 0) — pas dans le raster, dont
// le cadre change avec les jeux ouverts (cf. le recadrage envoyé à PixelLab).
// Retour de Raph (2026-10-03, nuit) : « fais attention aux toits et aux entrées ». Repris
// par retouche PixelLab (edit_image, le reste gardé) : la Couronne a un vrai donjon (un
// seul toit d'ardoise conique, des hourds) au lieu de trois jupes de toit empilées ; la
// Pierre ouvre sa balustrade sur un escalier jusqu'à l'eau ; le Bois pose son escalier sur
// un ponton ; le Marbre perd ses bornes de bronze et gagne un portique à fronton ; le Jade
// (et ses recolorations) pose ses escaliers sur une terrasse sèche, des marches jusqu'à
// l'eau. Les enseignes du Néon sont redessinées à la main (« PLAISIRS », « CLUB »).
// `windows` : un point dans chaque baie (repère de l'image), cf. skinNightPixels.
// `balcony` : où se tient la fille du balcon SUR L'HABILLAGE (repère de l'image) — `foot`
// ses pieds, `h` l'altitude du plancher, `rail` le haut de la balustrade devant elle
// (deux points d'une droite : tout ce qui est dessous, dans sa colonne, passe devant
// elle). Retour de Raph (2026-10-03) : « en haut elles sont du mauvais côté de la
// barrière » — posée d'après le plan du code, elle tombait sur les balustrades que
// PixelLab a redessinées plus hautes (dix pixels pour une fille de huit) et ailleurs.
// `walk` : le tour des promeneuses sur le pont de l'habillage — `r` et `h` le cercle du
// sol, ou `e` une ellipse de l'image (centre, demi-axes : PixelLab a APLATI certains
// ponts, étroits devant et larges sur les côtés) ; `gap` un secteur pris (degrés : 0 à
// droite, 90 à gauche, devant entre les deux) où elles font demi-tour — escaliers,
// marches, kiosque, lanternes. Retour de Raph (2026-10-04) : « elles passent au travers
// des marches ». `door` : l'hôtesse de la porte, sur le seuil (pas sur les marches).

// Le Jade et ses deux recolorations : le balcon d'angle doré en haut de l'escalier de
// gauche, le tour sur l'anneau bas (demi-tour à l'escalier de l'eau), la porte sur la
// terrasse devant la pagode.
const JADE = {
  balcony: { foot: [66, 195], h: 85, rail: [55, 196, 78, 199] },
  walk: { gap: [30, 60] }, door: { foot: [120, 255], h: 37 },
};
const SKINS = {
  // Le feu de camp est sur leur tour : demi-tour de part et d'autre.
  0: { src: '/pixelart/places/plaisirs-feu.png', at: [-75, -63], glass: null, windows: [[95, 66, 8]], walk: { gap: [6, 38] } },
  1: { src: '/pixelart/places/plaisirs-bois.png', at: [-93, -115], glass: null,
    windows: [[110, 72], [109, 114], [82, 74], [78, 110]],
    balcony: { foot: [88, 89], h: 39, rail: [80, 85, 100, 86] },
    walk: { e: [96, 110, 64, 21], h: 10, gap: [85, 125] } },
  2: { src: '/pixelart/places/plaisirs-pierre.png', at: [-102, -133], glass: null,
    windows: [[77, 80], [102, 82], [125, 80], [71, 122], [132, 122], [55, 135], [151, 135]],
    // Le kiosque (resté de l'ancien rendu du code) tient le ponton côté ouest, les deux
    // lanternes et l'escalier le devant : elles vont de la lanterne de droite au kiosque.
    balcony: { foot: [80, 94], h: 54, rail: [70, 90, 100, 91] },
    walk: { e: [102, 122, 64, 20], h: 8, gap: [-8, 175] }, door: { foot: [102, 139], h: 8 } },
  3: { src: '/pixelart/places/plaisirs-couronne.png', at: [-110, -185], glass: null,
    windows: [[87, 85], [110, 86], [132, 85], [85, 142], [110, 142], [136, 142]],
    balcony: { foot: [108, 125], h: 70, rail: [96, 122, 120, 122] },
    walk: { r: 46, h: 10, gap: [20, 75] }, door: { foot: [112, 194], h: 10 } },
  4: { src: '/pixelart/places/plaisirs-marbre.png', at: [-127, -188], glass: [195, 260, 0.18, 0.22, 0.72],
    // Le socle est bordé de marches et le portique en tient tout le devant : elles font
    // les cent pas sur le socle, d'un trépied de bronze à l'autre par l'arrière.
    balcony: { foot: [98, 157], h: 57, rail: [90, 153, 110, 157] },
    walk: { r: 58, h: 10, gap: [8, 82] }, door: { foot: [126, 205], h: 10 } },
  5: { src: '/pixelart/places/plaisirs-fonte.png', at: [-110, -189],
    balcony: { foot: [88, 169], h: 38, rail: [76, 166, 100, 166] },
    walk: { r: 58, gap: [5, 85] }, door: { foot: [110, 201], h: 11 } },
  // `glass` : [teinte min, max, saturation min, valeur min, max] des VITRES qui s'allument
  // la nuit (défaut : le bleu-violet) ; null : pas de vitre (la tente, la maison de bois).
  6: { src: '/pixelart/places/plaisirs-neon.png', at: [-124, -270], glass: [165, 200, 0.3, 0.3, 1],
    signs: [[153, 56, 160, 210], [153, 230, 173, 262]],
    // Pas de balustrade : le toit-terrasse du socle, son rebord bas devant elle.
    balcony: { foot: [84, 208], h: 53, rail: [70, 205, 130, 235] },
    walk: { r: 57 }, door: { foot: [104, 283], h: 12 } },
  // Les trois âges cosmiques partagent la pagode du Jade (même plan) : l'Astral et le
  // Cristal en sont des RECOLORATIONS (le vert-turquoise vers l'or, vers le violet) —
  // PixelLab gardait les toits turquoise de l'image de départ.
  7: { src: '/pixelart/places/plaisirs-jade.png', at: [-122, -273], glass: [140, 185, 0.3, 0.08, 0.42], ...JADE },
  8: { src: '/pixelart/places/plaisirs-astral.png', at: [-122, -273], glass: [30, 55, 0.4, 0.08, 0.42], ...JADE },
  9: { src: '/pixelart/places/plaisirs-cristal.png', at: [-122, -273], glass: [255, 290, 0.3, 0.08, 0.42], ...JADE },
};
// Molette : `__plaisirsSkins[b].balcony = { … }` (ou `.walk`) puis `__plaisirsBakes()`.
if (typeof window !== 'undefined') window.__plaisirsSkins = SKINS;

const _img = new Map();
// L'habillage prêt pour cet âge ({ src, at, img: ImageData }), ou null (pas
// d'habillage, ou pas encore chargé : le chargement part au premier appel).
export function plaisirsSkin(band) {
  const d = SKINS[band | 0];
  if (!d || typeof Image === 'undefined' || typeof document === 'undefined') return null;
  let e = _img.get(band | 0);
  if (!e) {
    e = { ready: false, img: null };
    _img.set(band | 0, e);
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const g = cv.getContext('2d');
      g.drawImage(im, 0, 0);
      e.img = g.getImageData(0, 0, cv.width, cv.height);
      e.ready = true;
    };
    im.src = d.src;
  }
  return e.ready ? { ...d, img: e.img } : null;
}

// Teinte (0-360), saturation, valeur d'un pixel.
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

// LA NUIT d'un habillage, dans son propre repère ({ width, height, data } RGBA) :
//   · les FLAMMES et les AMPOULES (orange, jaune vifs) : torches, feux, guirlandes ;
//   · les VITRES (`glass` : plage de teinte, saturation et valeur du verre de l'âge) ;
//   · les FENÊTRES SOMBRES (`windows` : un point dans chaque baie, posé à la main sur
//     l'habillage ; la tache sombre qui l'entoure s'allume) — la détection automatique
//     allumait les joints du dallage et ratait les baies reliées à leur trait d'encre ;
//   · les ENSEIGNES (`signs` : rectangles où le clair et le rouge vif s'allument).
export function skinNightPixels(img, skin = {}) {
  const w = img.width, h = img.height, src = img.data;
  const N = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  const set = (k, c, a = 255) => { N.data[k * 4] = c[0]; N.data[k * 4 + 1] = c[1]; N.data[k * 4 + 2] = c[2]; N.data[k * 4 + 3] = a; };
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] >= 128;
  const val = (k) => hsv(src[k * 4], src[k * 4 + 1], src[k * 4 + 2])[2];
  const G = skin.glass === undefined ? [195, 325, 0.18, 0.22, 1] : skin.glass;
  for (let k = 0; k < w * h; k += 1) {
    const q = k * 4;
    if (src[q + 3] < 128) continue;
    const [hu, s, v] = hsv(src[q], src[q + 1], src[q + 2]);
    if (hu >= 18 && hu <= 55 && s > 0.55 && v > 0.88) { set(k, [src[q], src[q + 1], src[q + 2]]); continue; }
    if (!G || hu < G[0] || hu > G[1] || s < G[2] || v < G[3] || v > G[4]) continue;
    const pink = !skin.glass && hu > 255, hi = v > 0.62;
    set(k, pink ? (hi ? [255, 214, 228] : [255, 168, 196]) : (hi ? [255, 236, 200] : [255, 206, 150]), s < 0.3 ? 170 : 235);
  }
  // Les baies : depuis chaque point, les pixels voisins à peine plus clairs que lui (le
  // fond de la baie, pas son encadrement), à 9 px au plus ; plus clair en haut.
  for (const [sx, sy, r = 9] of skin.windows || []) {
    if (!op(sx, sy)) continue;
    const k0 = sy * w + sx, v0 = val(k0), lo = v0 - 0.25, hi = Math.min(0.62, v0 + 0.16), seen = new Set([k0]), st = [k0], comp = [];
    while (st.length) {
      const k = st.pop(), x = k % w, y = (k - x) / w;
      comp.push(k);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const n = ny * w + nx;
        if (!op(nx, ny) || seen.has(n) || Math.abs(nx - sx) > r || Math.abs(ny - sy) > r || val(n) > hi || val(n) < lo) continue;
        seen.add(n); st.push(n);
      }
    }
    let y0 = h, y1 = 0;
    for (const k of comp) { const y = Math.floor(k / w); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (const k of comp) { const y = Math.floor(k / w); set(k, y - y0 <= (y1 - y0) * 0.35 ? [255, 226, 160] : [255, 186, 106], 245); }
  }
  for (const [x0, y0, x1, y1] of skin.signs || []) {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      if (!op(x, y)) continue;
      const k = y * w + x, q = k * 4, [hu, s, v] = hsv(src[q], src[q + 1], src[q + 2]);
      if (v > 0.85 && s < 0.35) set(k, [255, 246, 251]);
      else if (s > 0.6 && (hu > 300 || hu < 20)) set(k, [Math.min(255, src[q] + 60), src[q + 1], Math.min(255, src[q + 2] + 30)], v > 0.8 ? 255 : 200);
    }
  }
  return N;
}

// Pose l'habillage sur la sortie d'une recette ({ R, H, D, … }) : rend { R, H, D, N, mirror }
// dans le même cadre que R.
export function applyPlaisirsSkin(out, skin) {
  const R = out.R, H = out.H, img = skin.img, [ax, ay] = skin.at;
  const R2 = { ox: R.ox, oy: R.oy, w: R.w, h: R.h, data: new Uint8ClampedArray(R.data.length) };
  for (let j = 0; j < img.height; j += 1) for (let i = 0; i < img.width; i += 1) {
    const s = (j * img.width + i) * 4;
    if (img.data[s + 3] < 128) continue;
    const x = ax - R.ox + i, y = ay - R.oy + j;
    if (x < 0 || y < 0 || x >= R.w || y >= R.h) continue;
    const k = (y * R.w + x) * 4;
    R2.data[k] = img.data[s]; R2.data[k + 1] = img.data[s + 1]; R2.data[k + 2] = img.data[s + 2]; R2.data[k + 3] = 255;
  }
  // Les HAUTEURS : celle du pixel du code au même endroit ; ailleurs (la silhouette
  // PixelLab déborde un peu), celle du pixel du code le plus proche SOUS lui dans sa
  // colonne, plus l'écart (porté verticalement, comme heightsOf) ; rien dessous : au
  // ras de l'eau.
  // La PROFONDEUR (qui passe devant les filles de la maison) suit la même règle : un
  // pixel porté verticalement garde celle du pixel sous lui ; rien dessous : −∞.
  const H2 = new Float32Array(R.w * R.h), D = out.D, D2 = new Float32Array(R.w * R.h).fill(-Infinity);
  for (let i = 0; i < R.w; i += 1) {
    let lastH = 0, lastJ = -1, lastD = -Infinity;
    for (let j = R.h - 1; j >= 0; j -= 1) {
      const k = j * R.w + i, code = R.data[k * 4 + 3] > 0;
      if (code) { lastH = H[k]; lastJ = j; if (D) lastD = D[k]; }
      if (!R2.data[k * 4 + 3]) continue;
      H2[k] = code ? H[k] : lastJ < 0 ? 0 : lastH + (lastJ - j);
      D2[k] = lastD;
    }
  }
  // LA NUIT (skinNightPixels), reportée dans le cadre de R.
  const N = { ox: R.ox, oy: R.oy, w: R.w, h: R.h, data: new Uint8ClampedArray(R.data.length) };
  const Ns = skinNightPixels(img, skin);
  for (let j = 0; j < img.height; j += 1) for (let i = 0; i < img.width; i += 1) {
    const s = (j * img.width + i) * 4;
    if (!Ns.data[s + 3]) continue;
    const x = ax - R.ox + i, y = ay - R.oy + j;
    if (x < 0 || y < 0 || x >= R.w || y >= R.h) continue;
    const q = (y * R.w + x) * 4;
    for (let c = 0; c < 4; c += 1) N.data[q + c] = Ns.data[s + c];
  }
  // LE BALCON et LA PORTE de l'habillage : les filles (repère du lieu), la balustrade
  // (raster). Un point de l'image et l'altitude de son plancher donnent x et y.
  const onFloor = (foot, hb) => {
    const X = ax + foot[0], s = 2 * (ay + foot[1] + hb);
    return [(s + X) / 2, (s - X) / 2, hb];
  };
  let balcony = null, rail = null;
  if (skin.balcony) {
    const L = skin.balcony.rail;
    balcony = onFloor(skin.balcony.foot, skin.balcony.h);
    rail = [ax - R.ox + L[0], ay - R.oy + L[1], ax - R.ox + L[2], ay - R.oy + L[3]];
  }
  const door = skin.door ? onFloor(skin.door.foot, skin.door.h) : null;
  // Le tour en ELLIPSE de l'image (`e` : centre et demi-axes) → repère du lieu ; `r`
  // équivalent pour la vitesse de marche.
  const wk = skin.walk;
  const walk = !wk ? null : !wk.e ? wk
    : { ...wk, ex: [ax + wk.e[0], ay + wk.e[1], wk.e[2], wk.e[3]], r: wk.e[2] / Math.SQRT2 };
  return { R: R2, H: H2, D: D2, N, mirror: plaisirsMirror(R2, H2), balcony, rail, door, walk };
}
