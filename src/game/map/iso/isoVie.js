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
import { tableForce, SOUFFLE, FEUILLAGE, forceSouffle, forceFeuillage } from '../../audio/paysage/ventEnveloppes.js';

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
  // vent dans les arbres (0 = immobiles) ; `ventForce` impose un vent en capture ;
  // la rafale avance de `ventVitesse` cases/s ; `reflet` : le revers pâle des feuilles
  // au frisson (0 = jamais). Éteint le 2026-10-06 (les sauts d'un texel « piquaient les
  // yeux »), RALLUMÉ le 2026-10-07 avec le son : la couronne glisse (swaySprite.js) et
  // suit les rafales qu'on entend.
  vent: 1, ventForce: null, ventVitesse: 3, reflet: 0.6,
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
const vieWhere = {};
const _last = { x: 0, y: 0 };
// SONDE ÉTEINTE au chargement, armée par le premier __vieStats() (dev seulement) :
// les compteurs tournaient à chaque frame en prod aussi — une clé et jusqu'à six
// tableaux neufs par couche, depuis ~25 sites — pour une console que le joueur
// n'ouvre jamais (audit du 05/10, MORT-6). Même idiome que `grainProbe`.
export const vieProbe = { on: false };
export function vieCount(k, n = 1) {
  if (!vieProbe.on) return;
  vieStats[k] = (vieStats[k] || 0) + n;
  const w = vieWhere[k] || (vieWhere[k] = []);
  if (w.length < 6) w.push([Math.round(_last.x), Math.round(_last.y)]);
}
export function vieResetStats() {
  if (!vieProbe.on) return;
  for (const k in vieStats) vieStats[k] = 0;
  for (const k in vieWhere) vieWhere[k].length = 0;
}
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__vie = (o) => { if (o) Object.assign(VIE, o); return { ...VIE }; };
  window.__vieStats = () => {
    if (!vieProbe.on) { vieProbe.on = true; console.info('Compteurs de la petite vie armés : relancer __vieStats() après une frame.'); }
    return { ...vieStats, where: JSON.parse(JSON.stringify(vieWhere)) };
  };
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
// ÉVICTION LRU (audit du 2026-10-05, PERF-24) : le cache était VIDÉ d'un bloc au-delà
// de son plafond — la frame suivante recuisait d'un coup tous les nuages à l'écran
// (~30 masques, ~35 ms), et en 4K au zoom 0,6 (60 nuages visibles pour 48 places) il
// se vidait à CHAQUE frame. On évince la plus ancienne entrée, une lecture rajeunit
// la sienne. Le plafond des nuages couvre ce qu'un écran 4K en montre (≤ 96 masques
// de 234 × 117 au plus : ~10 Mo au pire).
const GEN_CAP = { cloud: 96 };
const _genCaches = new Map();
export const vieGeneratedSize = (fam) => (_genCaches.get(fam) || { size: 0 }).size;
export function vieGenerated(key, make) {
  const fam = key.slice(0, key.indexOf(':'));
  let _genCache = _genCaches.get(fam);
  if (!_genCache) _genCaches.set(fam, (_genCache = new Map()));
  let e = _genCache.get(key);
  if (e !== undefined) {
    _genCache.delete(key); _genCache.set(key, e);   // rajeunie : la dernière évincée
    return e;
  }
  const cap = GEN_CAP[fam] || 240;
  while (_genCache.size >= cap) _genCache.delete(_genCache.keys().next().value);
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
// Chaîne `rgba(r,g,b,a)` d'un pixel d'art, EN CACHE (audit du 05/10, PERF-44) : un
// drapeau ou une corde à linge, c'est 40 à 70 fillRect, et bâtir puis faire relire au
// canvas une chaîne neuve par pixel coûtait autant que les fillRect eux-mêmes. Rangée
// par alpha EXACT (la chaîne garde son toFixed(3)), puis par couleur ; une composante
// hors octet entier (jamais vu) repasse par le gabarit. Borné : les fondus font varier
// l'alpha d'une frame à l'autre.
const _rgbaByA = new Map();
export function vieRgba(rgb, alpha) {
  const r = rgb[0], g = rgb[1], b = rgb[2];
  if ((r & 255) !== r || (g & 255) !== g || (b & 255) !== b) return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  let m = _rgbaByA.get(alpha);
  if (!m) {
    if (_rgbaByA.size >= 64) _rgbaByA.clear();
    m = new Map(); m.a = alpha.toFixed(3);
    _rgbaByA.set(alpha, m);
  }
  const key = (r << 16) | (g << 8) | b;
  let s = m.get(key);
  if (s === undefined) { s = `rgba(${r},${g},${b},${m.a})`; m.set(key, s); }
  return s;
}
// Un pixel d'art isolé (goutte, éclat) au point (x, y).
export function viePixel(ctx, x, y, k, rgb, alpha = 1) {
  if (alpha <= 0.01) return;
  const d = CM.dpr || 1, K = Math.round(k * d);
  const X = Math.round(x * d - K / 2), Y = Math.round(y * d - K / 2);
  ctx.fillStyle = vieRgba(rgb, alpha);
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
// Coupée en capture DÉTERMINISTE ; la capture live (« Garder une image ») garde
// la brume de l'heure (audit 2026-10-05, BUG-89).
export function vieMistF(mistOfDay) {
  if (VIE.brume != null) return Math.max(0, Math.min(1, +VIE.brume)) * VIE.brumeK;
  if ((CM.capture && !CM.capture.live) || CM.dayP == null) return 0;
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
// Histoire. Réponse de Raph (2026-10-01) : « des arbres qui bougent ». En pixel art un
// arbre ne se tord pas : sa couronne se DÉCALE par bandes (le haut, le milieu, le tronc
// jamais). Au texel entier, ce décalage SAUTAIT : « pas reposant » quand chaque arbre
// oscillait sur sa phase, puis « ça pique les yeux » même en brise qui passe, et le
// vent fut éteint le 2026-10-06.
// Le son l'a rendu nécessaire (2026-10-07) : « entendre le vent sans voir les arbres
// bouger est problématique ». Raph a retenu trois remèdes :
//   1. l'arbre PLIE et GLISSE : il se courbe depuis son pied (chaque rangée un peu plus
//      que celle du dessous), au huitième de texel, et le sprite composé fond les deux
//      poses voisines de chaque rangée (swaySprite.js) ;
//   2. le REVERS des feuilles : au frisson, une version pâle du feuillage se pose
//      par-dessus, en opacité continue ;
//   3. les rafales VUES sont les rafales ENTENDUES : l'arbre se penche sur l'enveloppe
//      de la boucle du souffle et frissonne sur celle du feuillage
//      (audio/paysage/ventEnveloppes.js). Le paysage sonore publie où en sont ses
//      boucles (CM.ventSon) ; sans lui (son coupé, capture), les mêmes courbes tournent
//      seules.
// La rafale entendue est celle du CENTRE de l'écran (l'oreille) ; elle traverse la carte
// dans le sens du vent à `ventVitesse` cases/s : en amont les arbres se penchent avant,
// en aval après. Par grand vent (|vent| > 1, captures) les arbres restent couchés en
// plus ; sous une averse, la bourrasque (CM.gustF) les couche tous à la fois.
// Rend null (arbre immobile : un blit tel quel) ou la pose du moment, lue aussitôt par
// swaySprite.drawSwaySprite (objet RÉUTILISÉ d'un arbre à l'autre).
const smooth01 = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
// Seuils sur la FORCE des boucles (mesurée : souffle 0,18 au calme, 0,73 au plus fort ;
// feuillage 0,08 à 0,77) : en dessous, l'arbre se tient droit ; entre les deux, il suit
// la courbe entière, pas seulement les crêtes.
// AMPLITUDE : le haut de la couronne au plus fort d'une rafale, en texels. Retour de
// Raph (2026-10-08) : « je ne vois pas de mouvement en jeu ». La première version
// penchait de 0,7 texel au plus, soit moins d'un pixel d'écran au zoom 1 : invisible.
const PENCHE = [0.2, 0.7], FRISSON = [0.3, 0.68], AMPLITUDE = 2.4;
const HEADS = 0.47;                 // l'écart des deux têtes de lecture d'une boucle (mixeur.creerBoucle)
const OFF_RATE = 0.5;               // s/s : le rattrapage de l'horloge du son, sans à-coup
const XREF_RATE = 1.5;              // cases/s : la référence suit le centre de l'écran
const VENT = {
  now: NaN, Ts: null, Tf: null, dir: 1, xRef: null, k: 1,
  offS: [0, HEADS * SOUFFLE.L], offF: [0, HEADS * FEUILLAGE.L],
};
const lut = (T, L, t) => {
  const n = T.length, x = ((((t / L) % 1) + 1) % 1) * n, i = x | 0, f = x - i;
  return T[i % n] + (T[(i + 1) % n] - T[i % n]) * f;
};
const forceAt = (T, L, off, u) => (lut(T, L, u + off[0]) + lut(T, L, u + off[1])) * 0.5;
const wrap = (d, L) => d - L * Math.round(d / L);
// La force du vent, comme le paysage sonore la calcule (paysage.js), sans ses rafales
// tirées au hasard : c'est lui qui les publie quand il joue.
const ventLevel = () => Math.min(1.4, 0.55 + 0.45 * Math.min(1, Math.abs(CM.windX || 0) / 0.7) + 0.35 * (CM.gustF || 0));
// Une fois par image : la direction, la référence, l'horloge du son.
function ventFrame(now) {
  if (VENT.now === now) return VENT;
  const dt = Number.isFinite(VENT.now) ? Math.max(0, Math.min(0.25, (now - VENT.now) / 1000)) : 0;
  VENT.now = now;
  if (!VENT.Ts) { VENT.Ts = tableForce(SOUFFLE, forceSouffle); VENT.Tf = tableForce(FEUILLAGE, forceFeuillage); }
  const wind = VIE.ventForce != null ? +VIE.ventForce : (CM.windX || 0);
  const dir = wind >= 0 ? 1 : -1;
  const T = CM.TILE || 1, cam = CM.cam || { x: 0, y: 0 };
  const xc = ((cam.x / T) * 0.94 + (cam.y / T) * 0.34) * dir;
  if (VENT.xRef == null || dir !== VENT.dir || Math.abs(xc - VENT.xRef) > 25) VENT.xRef = xc;
  else VENT.xRef += Math.max(-XREF_RATE * dt, Math.min(XREF_RATE * dt, xc - VENT.xRef));
  VENT.dir = dir;
  let kT = ventLevel();
  const S = CM.ventSon, t = now / 1000;
  const pn = typeof performance !== 'undefined' ? performance.now() : 0;
  if (S && !(CM.capture && !CM.capture.live) && pn - S.perf < 2500) {
    const el = (pn - S.perf) / 1000;
    syncOff(VENT.offS, S.souffle, el, t, VENT.Ts, SOUFFLE.L, PENCHE[0], dt);
    syncOff(VENT.offF, S.feuillage, el, t, VENT.Tf, FEUILLAGE.L, FRISSON[0], dt);
    if (S.k > 0) kT = S.k;
  }
  if (dt > 0) VENT.k += Math.max(-0.3 * dt, Math.min(0.3 * dt, kT - VENT.k));
  else VENT.k = kT;
  return VENT;
}
// Recale l'horloge visuelle d'une boucle sur celle du son. Au calme (des deux côtés),
// d'un coup : aucun arbre ne bouge, personne ne le voit ; sinon, au plus OFF_RATE s/s.
function syncOff(off, phases, el, t, T, L, calme, dt) {
  if (!phases) return;
  const cible = [wrap(phases[0] + el - t, L), wrap(phases[1] + el - t, L)];
  if (forceAt(T, L, off, t) < calme && forceAt(T, L, cible, t) < calme) { off[0] = cible[0]; off[1] = cible[1]; return; }
  for (let h = 0; h < 2; h += 1) {
    const d = wrap(cible[h] - off[h], L);
    off[h] = wrap(off[h] + Math.max(-OFF_RATE * dt, Math.min(OFF_RATE * dt, d)), L);
  }
}
const _pose = { s: 0, qS: 0, reflet: 0 };   // s : le haut de la couronne, en texels
export function vieTreeSway(tr, now, sw, sh, hpx) {
  if (!VIE.on || !(VIE.vent > 0) || CM.lodActive) return null;
  if (hpx / sw < 0.75) return null;                  // texel sous le pixel : rien à décaler
  const V = ventFrame(now || 0);
  const wind = VIE.ventForce != null ? +VIE.ventForce : (CM.windX || 0);
  const aw = Math.abs(wind), dir = V.dir, gust = CM.gustF || 0;
  let sd = tr._vieSw;
  if (sd === undefined) sd = tr._vieSw = (((tr.gx * 73856093) ^ (tr.gy * 19349663)) >>> 0) % 1000 / 1000;
  // Heure LOCALE de la rafale : sa position le long du vent (les axes des ombres de
  // nuages), à ±0,25 s près par arbre, pour que le front ne soit pas tiré au cordeau.
  const v = Math.max(0.1, +VIE.ventVitesse || 3);
  const x = (tr.gx * 0.94 + tr.gy * 0.34) * dir;
  const u = (now || 0) / 1000 - (x - V.xRef) / v + (sd - 0.5) * 0.5;
  const e = smooth01((forceAt(V.Ts, SOUFFLE.L, V.offS, u) - PENCHE[0]) / (PENCHE[1] - PENCHE[0]));
  const amp = 0.85 + 0.3 * ((sd * 7.31) % 1);        // un arbre plie un peu plus que son voisin
  // La force du vent (0,55 brise … 1,4 tempête) règle l'amplitude de 0,7 à 1,3.
  const kv = 0.7 + 0.6 * Math.max(0, Math.min(1, (V.k - 0.55) / 0.85));
  const s = dir * (e * AMPLITUDE * kv * amp + gust * 1.5 + Math.max(0, aw - 1)) * VIE.vent;
  const ef = smooth01((forceAt(V.Tf, FEUILLAGE.L, V.offF, u) - FRISSON[0]) / (FRISSON[1] - FRISSON[0]));
  const qS = Math.round(s * 8);
  const reflet = Math.round(Math.max(0, Math.min(1, +VIE.reflet || 0)) * ef * 10) / 10;
  if (!qS && !reflet) return null;
  const P = _pose;
  P.qS = qS; P.s = qS / 8; P.reflet = reflet;
  return P;
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
    ctx.fillStyle = vieRgba(rgb, alpha);
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
// MASQUES : un lieu où rien ne se pose (la trémie du métro, isoMetro.js, 2026-10-04 :
// sinon un héron ou un drapeau du quai se tenait au-dessus du vide). fn(wx, wy) → vrai
// = l'acteur n'est pas peint. Enregistré par le module du lieu (pas d'import d'ici :
// isoMetro importe déjà ce module).
const _masks = [];
export function registerVieMask(fn) { if (!_masks.includes(fn)) _masks.push(fn); }
const _actors = [];
export function vieActors(now) {
  _actors.length = 0;
  if (!VIE.on) return _actors;
  for (const fn of _providers) {
    try { fn(now, _actors); } catch (e) { if (!CM._vieErr) { CM._vieErr = true; console.warn('vie', e); } }
  }
  if (_masks.length) {
    let n = 0;
    for (const a of _actors) if (!_masks.some((m) => m(a.wx, a.wy))) _actors[n++] = a;
    _actors.length = n;
  }
  return _actors;
}
