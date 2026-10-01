// LA PETITE VIE — le socle commun (docs/PLAN-MAQUETTE-VIVANTE.md §9).
//
// Les dessins sont dans vieArt.js (texte, pixel par pixel) ; ce module les cuit en
// canvas, fixe leur TAILLE et les pose au pixel entier. Les couches (eau, oiseaux,
// terre, lumières) n'ont plus qu'à décider OÙ et QUAND.
//
// TROIS RÈGLES, qui sont celles du pixel art et que l'ancienne vie (pavés, ellipses
// lissées, dégradés) ne respectait pas :
//   1. Un pixel d'art = un nombre ENTIER de pixels d'écran (device). Au zoom 1 un
//      pixel d'art vaut un pixel ; il en vaut deux vers le zoom 1,5. Jamais 1,3 :
//      à 5 px de large, une colonne doublée sur quatre déforme la bête.
//   2. Position rabattue sur la grille device (comme snapDev) : la bête avance par
//      pas d'un pixel, elle ne fourmille pas.
//   3. Jamais de rotation : un cap se choisit parmi des images dessinées (regard à
//      droite, miroir pour la gauche).
//
// ⚠ Aucun import d'isoRenderer ni d'isoRiver (cycles ES = zone morte, piège payé
// deux fois sur ce chantier).
import { CM } from '../layout.js';
import { VIE_ART, FISH_SHADOW, decodeRows, ringPixels, haloSprite } from './vieArt.js';

// ── MOLETTE ─────────────────────────────────────────────────────────────────
// __vie({ ... }) règle en direct ; __vie() rend l'état. `on: false` coupe toute la
// petite vie. (L'ANCIENNE vie et son A/B `ancien` sont partis après validation des
// planches par Raph, 2026-10-01.)
// `brume` : null = heure du jour ; un nombre force la densité (captures).
export const VIE = {
  on: true,
  brume: null, brumeK: 1,
  poissons: 1, sauts: 1, pluie: 1, feuilles: 1,
  canards: 1, cygnes: 1, herons: 1, libellules: 1,
  // oiseaux posés (isoVieOiseaux) ; `envol` force la phase de vol en capture (0..1)
  pigeons: 1, mouettes: 1, envol: null,
  pluieForce: null,
  // vent dans les arbres (0 = immobiles) ; `ventForce` impose un vent en capture
  vent: 1, ventForce: null,
  // petite vie de terre (isoVieTerre)
  chiens: 1, chats: 1, papillons: 1, linge: 1,
  // halos de lumière au pixel (addGlow) — false = dégradés lissés d'avant
  halos: true,
  // ombres de nuages (isoVieNuages) ; `nuagesForce` = force du multiply (0,3)
  nuages: 1, nuagesForce: null,
  // drapeaux (isoVieDrapeaux), pigeons des toits (isoVieOiseaux), éclats du soleil
  drapeaux: 1, toits: 1, eclats: 1,
};
// Ce qui a VRAIMENT été peint à la dernière frame, par couche. Une couche qui ne
// dessine rien et une couche qui dessine hors champ donnent la même image ; seuls
// ces compteurs les séparent (leçon de isoRiverLife).
export const vieStats = {};
// `vieWhere` garde les premières positions écran peintes par couche (coin haut-
// gauche du dernier blit) : c'est ce qui permet de cadrer une vérification sur une
// bête de 5 px dans une image de 1600.
export const vieWhere = {};
const _last = { x: 0, y: 0 };
export function vieCount(k, n = 1) {
  vieStats[k] = (vieStats[k] || 0) + n;
  const w = vieWhere[k] || (vieWhere[k] = []);
  if (w.length < 6) w.push([Math.round(_last.x), Math.round(_last.y)]);
}
export function vieResetStats() {
  for (const k in vieStats) vieStats[k] = 0;
  for (const k in vieWhere) vieWhere[k].length = 0;
}
if (typeof window !== 'undefined') {
  window.__vie = (o) => { if (o) Object.assign(VIE, o); return { ...VIE }; };
  window.__vieStats = () => ({ ...vieStats, where: JSON.parse(JSON.stringify(vieWhere)) });
}

// ── TAILLE D'UN PIXEL D'ART ─────────────────────────────────────────────────
// Le grain des maisons (1,135 px par pixel d'art au zoom 1), arrondi à l'entier
// DEVICE. Rendu en px CSS (le contexte est déjà à l'échelle dpr).
export const VIE_GRAIN = 1.135;
export function vieK() {
  const d = CM.dpr || 1, z = (CM.cam && CM.cam.zoom) || 1;
  return Math.max(1, Math.round(VIE_GRAIN * z * d)) / d;
}
// Au loin, la bête d'un pixel devient du bruit (et, rabattue à 1 px minimum, elle
// grossit par rapport aux maisons) : elle s'efface entre 0,62 et 0,5.
export function vieZoomFade() {
  const z = (CM.cam && CM.cam.zoom) || 1;
  return Math.max(0, Math.min(1, (z - 0.5) / 0.12));
}

// ── CUISSON ─────────────────────────────────────────────────────────────────
const _cache = new Map();
function toCanvas(sp) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = sp.w; cv.height = sp.h;
  const c = cv.getContext('2d');
  const im = c.createImageData(sp.w, sp.h);
  im.data.set(sp.data);
  c.putImageData(im, 0, 0);
  return cv;
}
// Image `fi` de la planche `name`, regard à droite (flip = gauche). Rend
// { cv, w, h, foot } ou null.
export function vieSprite(name, fi = 0, flip = false, flipY = false) {
  const key = name + '|' + fi + '|' + (flip ? 1 : 0) + (flipY ? 1 : 0);
  let e = _cache.get(key);
  if (e !== undefined) return e;
  const def = VIE_ART[name];
  e = null;
  if (def) {
    const frames = def.frames;
    const rows = frames[((fi % frames.length) + frames.length) % frames.length];
    const sp = decodeRows(rows, { flip, flipY });
    const cv = toCanvas(sp);
    if (cv) e = { cv, w: sp.w, h: sp.h, foot: def.foot ?? sp.h - 1 };
  }
  _cache.set(key, e);
  return e;
}
export function vieFrames(name) { const d = VIE_ART[name]; return d ? d.frames.length : 0; }
// Ombre de poisson : calibre ('small' | 'big'), pose de queue, et cap par miroirs.
export function fishShadowSprite(size, fi, flip, flipY) {
  const key = 'fish:' + size + '|' + fi + '|' + (flip ? 1 : 0) + (flipY ? 1 : 0);
  let e = _cache.get(key);
  if (e !== undefined) return e;
  const set = FISH_SHADOW[size] || FISH_SHADOW.small;
  const sp = decodeRows(set[fi % set.length], { flip, flipY });
  const cv = toCanvas(sp);
  e = cv ? { cv, w: sp.w, h: sp.h, foot: Math.floor(sp.h / 2) } : null;
  _cache.set(key, e);
  return e;
}
// Anneau couché sur l'eau, de rayon r pixels d'art, blanc (l'alpha au blit).
export function ringSprite(r, rgb = [214, 232, 240]) {
  const rr = Math.max(1, Math.round(r));
  const key = 'ring:' + rr + ':' + rgb.join(',');
  let e = _cache.get(key);
  if (e !== undefined) return e;
  const px = ringPixels(rr);
  const w = rr * 2 + 1, h = Math.ceil(rr * 0.5) * 2 + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  const cx = rr, cy = Math.ceil(rr * 0.5);
  for (const [x, y] of px) {
    const i = ((cy + y) * w + (cx + x)) * 4;
    if (i < 0 || i >= data.length) continue;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
  }
  const cv = toCanvas({ w, h, data });
  e = cv ? { cv, w, h, foot: cy } : null;
  _cache.set(key, e);
  return e;
}
// Cache à part pour les images CALCULÉES (filets de brume) : elles sont nombreuses
// et changent avec l'heure, on borne donc leur nombre.
// Un cache PAR FAMILLE (préfixe de la clé avant « : ») : les halos, nombreux, ne
// doivent pas vider celui des nuages, qui coûtent plusieurs millisecondes à refaire.
const _genCaches = new Map();
export function vieGenerated(key, make) {
  const fam = key.slice(0, key.indexOf(':'));
  let _genCache = _genCaches.get(fam);
  if (!_genCache) _genCaches.set(fam, (_genCache = new Map()));
  let e = _genCache.get(key);
  if (e !== undefined) return e;
  if (_genCache.size > (fam === 'cloud' ? 48 : 240)) _genCache.clear();
  const sp = make();
  const cv = sp ? toCanvas(sp) : null;
  e = cv ? { cv, w: sp.w, h: sp.h, ox: sp.ox || 0, oy: sp.oy || 0 } : null;
  _genCache.set(key, e);
  return e;
}

// ── POSE ────────────────────────────────────────────────────────────────────
// Pose `spr` avec son PIED au point écran (x, y) : centré en x, la rangée `foot`
// posée sur y. k = taille d'un pixel d'art (vieK). Tout est rabattu sur la grille
// device : le coin haut-gauche ET la taille, sinon le sprite fourmille en avançant.
export function vieBlit(ctx, spr, x, y, k, alpha = 1) {
  if (!spr || !spr.cv || alpha <= 0.01) return false;
  const d = CM.dpr || 1, K = Math.round(k * d);
  const W = spr.w * K, H = spr.h * K;
  const X = Math.round(x * d - W / 2), Y = Math.round(y * d) - (spr.foot + 1) * K;
  const cw = CM.cw || 0, ch = CM.ch || 0;
  if (X > cw * d || Y > ch * d || X + W < 0 || Y + H < 0) return false;
  const pa = ctx.globalAlpha, ps = ctx.imageSmoothingEnabled;
  if (alpha < 1) ctx.globalAlpha = pa * alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr.cv, X / d, Y / d, W / d, H / d);
  _last.x = X / d; _last.y = Y / d;
  ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = ps;
  return true;
}
// Pose au COIN (x, y) = coin haut-gauche + ancre interne (ox, oy) de l'image.
// `smooth` : pose LISSÉE (ombres de nuages seulement — une ombre douce, pas un objet).
export function vieBlitAt(ctx, img, x, y, k, alpha = 1, smooth = false) {
  if (!img || !img.cv || alpha <= 0.01) return false;
  const d = CM.dpr || 1, K = Math.round(k * d);
  const W = img.w * K, H = img.h * K;
  const X = Math.round(x * d) - (img.ox || 0) * K, Y = Math.round(y * d) - (img.oy || 0) * K;
  const cw = CM.cw || 0, ch = CM.ch || 0;
  if (X > cw * d || Y > ch * d || X + W < 0 || Y + H < 0) return false;
  const pa = ctx.globalAlpha, ps = ctx.imageSmoothingEnabled;
  if (alpha < 1) ctx.globalAlpha = pa * alpha;
  ctx.imageSmoothingEnabled = !!smooth;
  ctx.drawImage(img.cv, X / d, Y / d, W / d, H / d);
  _last.x = X / d; _last.y = Y / d;
  ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = ps;
  return true;
}
// Un pixel d'art isolé (goutte, éclat) au point (x, y).
export function viePixel(ctx, x, y, k, rgb, alpha = 1) {
  if (alpha <= 0.01) return;
  const d = CM.dpr || 1, K = Math.round(k * d);
  const X = Math.round(x * d - K / 2), Y = Math.round(y * d - K / 2);
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
  ctx.fillRect(X / d, Y / d, K / d, K / d);
}

// Anneau couché sur l'eau CENTRÉ sur (x, y).
export function vieRing(ctx, x, y, rArt, k, alpha, rgb) {
  const r = ringSprite(rArt, rgb);
  if (!r) return false;
  return vieBlit(ctx, r, x, y + k * 0.5, k, alpha);
}

// ── HALO AU PIXEL ───────────────────────────────────────────────────────────
// Remplace le dégradé radial lissé (addGlow, isoStreet) pour les PETITES lueurs
// (rayon ≤ 6 pixels d'art) : même force, trois paliers francs (vieArt.haloSprite). Le rayon est
// arrondi au pixel d'art ENTIER : le scintillement d'une flamme fait donc battre le
// halo d'un pixel, comme dans un jeu en pixel art, au lieu de le faire respirer en
// flou. Rend false si la molette est coupée (l'appelant garde son dégradé).
export function vieHalo(ctx, x, y, r, col, alpha, squash = 1) {
  if (!VIE.on || !VIE.halos) return false;
  if (!(alpha > 0.004) || !(r >= 0.6) || !Number.isFinite(x) || !Number.isFinite(y)) return true;
  const k = vieK(), R = Math.max(1, Math.round(r / k));
  // Grande nappe (réverbère, lanterne) : le dégradé lisse reste plus juste (cf. vieArt).
  if (R > 6) return false;
  const img = vieGenerated('halo:' + R + ':' + col + ':' + squash, () => haloSprite(R, String(col).split(',').map(Number), squash));
  vieBlitAt(ctx, img, x, y, k, Math.min(1, alpha));
  return true;
}

// ── LA BRUME DU MOMENT ──────────────────────────────────────────────────────
// Densité 0..1. `VIE.brume` la force (captures, planches) ; sinon l'heure du cycle
// publiée par le runtime (CM.dayP, null quand le joueur a figé le ciel).
export function vieMistF(mistOfDay) {
  if (VIE.brume != null) return Math.max(0, Math.min(1, +VIE.brume)) * VIE.brumeK;
  if (CM.capture || CM.dayP == null) return 0;
  const seasonK = CM.season === 1 ? 0.85 : CM.season === 2 ? 1.15 : 1;
  return Math.min(1, mistOfDay(CM.dayP) * seasonK) * VIE.brumeK;
}

// ── POSTES OCCUPÉS ──────────────────────────────────────────────────────────
// Où se tiennent en ce moment les volées posées (monde, tuiles) : le héron ne se
// pose pas au milieu des mouettes. Rempli par isoVieOiseaux, lu par isoRiverLife —
// par ce module commun, pour que les deux couches ne s'importent pas l'une l'autre.
export const vieOccupied = [];
export function vieIsOccupied(x, y, r = 1.4) {
  for (const o of vieOccupied) if ((o.x - x) * (o.x - x) + (o.y - y) * (o.y - y) < r * r) return true;
  return false;
}

// ── PASSE AÉRIENNE ──────────────────────────────────────────────────────────
// Ce qui VOLE (héron qui change de poste, pigeons envolés) passe au-dessus du tri
// peintre, comme les drones : dessiné après la ville (isoRenderer, drawVieAir).
const _air = [];
export function registerVieAir(fn) { if (!_air.includes(fn)) _air.push(fn); }
export function drawVieAir(now) {
  if (!VIE.on || CM.lodActive) return;
  for (const fn of _air) {
    try { fn(CM.ctx, now); } catch (e) { if (!CM._vieErr) { CM._vieErr = true; console.warn('vie', e); } }
  }
}

// ── LE VENT DANS LES ARBRES ─────────────────────────────────────────────────
// Réponse de Raph (2026-10-01) : « des arbres qui bougent ». En pixel art, un arbre
// ne se tord pas : sa couronne se DÉCALE d'un texel, par bandes (le haut d'un texel,
// le milieu d'un demi arrondi, le tronc jamais). Décaler d'un TEXEL entier garde
// la grille d'échantillonnage alignée sur celle du bas : pas de fourmillement.
// L'onde traverse la ville dans le sens du vent, si bien qu'une rafale se voit
// PASSER sur la forêt. Brise légère par beau temps (un arbre sur trois bouge, par
// instants), franche quand la météo souffle (CM.windX, CM.gustF).
// Rend null (arbre immobile) ou trois bandes [y0, y1, décalage] en rangées source.
export function vieTreeSway(tr, now, sw, sh, hpx) {
  if (!VIE.on || !(VIE.vent > 0) || CM.lodActive) return null;
  if (hpx / sw < 0.75) return null;                  // texel sous le pixel : rien à décaler
  const wind = VIE.ventForce != null ? +VIE.ventForce : (CM.windX || 0);
  const gust = CM.gustF || 0;
  const A = (0.6 + Math.abs(wind) * 1.3 + gust * 0.8) * VIE.vent;
  const dir = wind >= 0 ? 1 : -1;
  let sd = tr._vieSw;
  if (sd === undefined) sd = tr._vieSw = (((tr.gx * 73856093) ^ (tr.gy * 19349663)) >>> 0) % 1000 / 1000 * 6.28;
  const t = (now || 0) / 1000;
  const ph = (tr.gx * 0.9 + tr.gy * 0.35) * 0.42 * dir - t * 1.2 + sd * 0.35;
  // Penché du côté où le vent pousse, et une oscillation irrégulière par-dessus.
  const s = dir * Math.abs(wind) * 0.55 + Math.sin(ph) * 0.8 + Math.sin(ph * 2.3 + sd) * 0.25;
  const top = Math.round(A * s), mid = Math.round(A * s * 0.45);
  // ⚠ Trois bandes MÊME au repos : un arbre qui passerait d'un blit unique à trois
  // bandes (coupures au pixel entier) se ré-échantillonnerait d'une frame à l'autre
  // et scintillerait au lieu de bouger.
  const c1 = Math.round(sh * 0.34), c2 = Math.round(sh * 0.58);
  return [[0, c1, top], [c1, c2, mid], [c2, sh, 0]];
}

// ── LE HAUT D'UN BÂTIMENT ───────────────────────────────────────────────────
// Ce qui se pose SUR une maison (pigeon de toit) lit la boîte réellement dessinée à
// cette frame (CM._houseBoxes, publiée par le peintre) et son MASQUE d'encre (isoMask :
// jusqu'à 48 × 48 cases) : le haut du rectangle ne suit pas la pente d'un toit.
export function drawnBoxOf(t) {
  const hb = CM._houseBoxes;
  if (!hb) return null;
  for (let i = hb.length - 1; i >= 0; i -= 1) if (hb[i].t === t) return hb[i].b;
  return null;
}
// Haut de l'encre (y écran) à la fraction fx de la largeur ; null si colonne vide.
// ⚠ Fiable pour les HABITATIONS. Pour une scène moteur, l'encre MESURÉE dépasse le
// toit affiché de 15 à 30 px sur certaines scènes : on n'y pose rien (les drapeaux
// des bâtiments publics sont plantés au sol, cf. isoVieDrapeaux).
export function inkTopAt(box, fx) {
  const m = box.mask;
  if (!m) return box.dy;
  const mx = Math.max(0, Math.min(m.w - 1, Math.floor(fx * m.w)));
  for (let my = 0; my < m.h; my += 1) if (m.a[my * m.w + mx]) return box.dy + (my / m.h) * box.dh;
  return null;
}

// ── DRAPEAUX ────────────────────────────────────────────────────────────────
// Réponse de Raph (2026-10-01) : des drapeaux sur les ponts à partir de la pierre,
// sur les bâtiments publics, et quelques-uns le long des quais. UNE seule recette
// pour tous (ponts compris, cf. isoBridge) : tous claquent dans le même vent.
//   · une hampe d'un pixel, un épi doré au sommet ;
//   · un tissu de w × h pixels d'art, côté où souffle le vent (CM.windX ; brise d'ouest
//     par défaut) ; il ondule par colonnes, d'autant plus que le vent forcit, et
//     retombe le long de la hampe quand l'air est calme — jamais tout à fait (un
//     drapeau pendu à plat a l'air mort) ;
//   · trois teintes : `cols` = [fond, ombre, bande].
// (x, y) = pied de la hampe à l'écran ; poleH, w, h en pixels d'art.
export const FLAG_COLS = {
  rouge: ['#b2382d', '#7e2620', '#e2b444'],
  azur: ['#2f5a9e', '#1f3a6a', '#e2b444'],
  vert: ['#3f7a4a', '#2a5232', '#e8dcb0'],
  blanc: ['#ece6d6', '#b9b2a2', '#b2382d'],
  nuit: ['#26304a', '#161c2c', '#d9c46a'],
  ciel: ['#3fb6d6', '#24708a', '#e8f6ff'],
};
const _hexRgb = new Map();
const rgbOf = (h) => {
  let v = _hexRgb.get(h);
  if (!v) { const n = parseInt(String(h).slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _hexRgb.set(h, v); }
  return v;
};
export function drawVieFlag(ctx, x, y, o = {}) {
  const k = o.k || vieK(), d = CM.dpr || 1, K = Math.max(1, Math.round(k * d)) / d;
  const poleH = o.poleH || 14, w = o.w || 6, h = o.h || 4;
  const cols = o.cols || FLAG_COLS.rouge;
  const alpha = o.alpha == null ? 1 : o.alpha;
  if (alpha <= 0.01) return false;
  const X = Math.round(x * d) / d, Y = Math.round(y * d) / d;
  if (X < -60 || X > (CM.cw || 0) + 60 || Y < -60 || Y > (CM.ch || 0) + 120) return false;
  const px = (i, j, rgb) => {
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
    ctx.fillRect(X + i * K, Y - (j + 1) * K, K, K);
  };
  const pole = rgbOf(o.pole || '#4a3a2a');
  for (let j = 0; j < poleH; j += 1) px(0, j, pole);
  px(0, poleH, rgbOf('#e8c45a'));                           // épi doré
  const wind = VIE.ventForce != null ? +VIE.ventForce : (CM.windX || 0);
  const dir = wind < -0.02 ? -1 : 1;
  const s = Math.max(0.3, Math.min(1, Math.abs(wind) * 1.4 + (CM.gustF || 0) * 0.5));
  const t = (o.now || 0) / 1000, seed = o.seed || 0;
  const C0 = rgbOf(cols[0]), C1 = rgbOf(cols[1]), C2 = rgbOf(cols[2]);
  for (let i = 0; i < w; i += 1) {
    // Retombée par calme : la colonne i descend de (1 − s)·i·0,6 pixel ; ondulation
    // qui court de la hampe vers le bout, plus ample au bout et par vent fort.
    const droop = Math.round((1 - s) * i * 0.6);
    const wave = Math.round(Math.sin(t * (5 + 5 * s) - i * 1.1 + seed) * (0.35 + 0.65 * s) * (i / Math.max(1, w - 1)) * 1.2);
    for (let j = 0; j < h; j += 1) {
      if (o.swallow && i === w - 1 && j > 0 && j < h - 1) continue;          // queue d'aronde
      const col = j === Math.floor(h / 2) && h >= 3 ? C2 : (i === w - 1 || j === h - 1) ? C1 : C0;
      const jj = poleH - j - droop + wave;
      px(dir * (i + 1), jj, col);
    }
  }
  return true;
}

// ── ACTEURS DU TRI PEINTRE ──────────────────────────────────────────────────
// Ce qui se tient AU SOL (héron sur le quai, pigeons sur la place, mouettes sur le
// parapet) doit passer derrière la maison qui est devant lui : il entre dans le tri
// du peintre comme un mouton (item 'vie', à sa profondeur). Les couches
// enregistrent un FOURNISSEUR ; la collecte (isoLiveCollect) les appelle une fois
// par frame et pousse un item par acteur { wx, wy, draw(ctx, now) }.
const _providers = [];
export function registerVieActors(fn) { if (!_providers.includes(fn)) _providers.push(fn); }
const _actors = [];
export function vieActors(now) {
  _actors.length = 0;
  if (!VIE.on) return _actors;
  for (const fn of _providers) {
    try { fn(now, _actors); } catch (e) { if (!CM._vieErr) { CM._vieErr = true; console.warn('vie', e); } }
  }
  return _actors;
}
