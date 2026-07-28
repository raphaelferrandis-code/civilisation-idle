"use strict";
// Couche pixel-art des HABITATIONS (logements NON achetables de la carte, tuiles
// type:"house"). Miroir de pixelBuildings.js. Le sprite est ANCRÉ PAR LA BASE et
// monte AU-DESSUS de sa tuile selon son ratio : les tours / mega-complexes de late
// game dépassent largement leur emprise → « suivent le nom ». Repli sur le rendu
// procédural (drawHouseShape) si : flag OFF, variante sans sprite, ou pas encore
// chargé. Fichier : /pixelart/houses/<variant>.png  (cf public/pixelart/houses/).
//
// ⚠ Les maisons sont BAKÉES dans le canvas offscreen CM.tileCanvas → à chaque
// chargement de sprite on invalide le bake (CM._tileBake = null) pour forcer un re-bake.
import { CM, cmHash } from './layout.js';
import { pickHouseTint, applyHouseTint, HOUSE_TINTS } from './housePalette.js';
import { lightCutImage } from './lightLayer.js';

export const pixelHousesFlag = { on: true };

// B — VARIATION PAR INSTANCE. Sans elle, les 12 archétypes sont stampés à l'identique
// sur le millier d'habitations d'une grande ville : c'est ça, et non le nombre de
// modèles, qui fait « ville photocopiée ». Le levier est la TEINTE — un échange de
// rampes de matière (cf. housePalette.js), 2 états sur 8 archétypes, 20 aspects en tout.
// Les 4 habitations vernaculaires (tent, hut, longhouse, courtyard) restent à l'identique :
// la terre cuite y est l'identité, aucun échange de matière ne leur va.
//
// C'était 3 états et 36 aspects jusqu'au 2026-07-25 : les archétypes recevaient les
// deux 3-cycles sur {brique, pierre, ardoise}, sans égard pour leur matière. Rendu en
// jeu « criard et bizarre », et pour cause — mesuré, deux tours sur trois finissaient en
// terre cuite et les maisons anciennes en gris. Un archétype ne reçoit plus que la
// matière qui lui va ; le détail et les chiffres sont dans housePalette.js.
//
// Le miroir horizontal a été essayé puis RETIRÉ : l'éclairage et l'ombre portée sont
// cuits dans les sprites, les retourner mettait la maison en contradiction avec ses
// voisines (retour Raph). Voir le bloc d'avertissement dans housePalette.js.
//
// Le tirage doit être déterministe : les habitations sont CUITES dans CM.tileCanvas,
// une variation aléatoire changerait d'aspect à chaque recuisson (zoom, achat, pan).
// Indexé sur gx/gy seuls, donc stable aussi à travers un recalcul de layout.
export const houseVarTune = { on: true };

// Les 12 variantes livrées. Les ères cosmiques (band 7-9) réutilisent les mêmes
// variantes tardives (tower/megablock/arcologyhome, cf. clamp de VARIANTS_HOUSE) :
// pas de gate par bande, on se fie à la variante de la tuile.
const AVAILABLE = new Set([
  "tent", "hut", "longhouse", "courtyard", "townhouse", "stonehouse",
  "manor", "block", "tenement", "tower", "megablock", "arcologyhome"
]);

// Variantes tardives qui reçoivent un SKIN COSMIQUE par bande (7 émeraude / 8 or /
// 9 violet) — cohérence avec les tours-moteur cosmiques (cf. blitCosmicTower). Aux
// ères 35+ elles chargent « <variant>-cosmic-<band>.png » ; partout ailleurs, leur
// sprite de base. Les autres variantes gardent un sprite unique quelle que soit l'ère.
const COSMIC_VARIANTS = new Set(["tower", "megablock", "arcologyhome"]);

// Largeur de contenu (px du PNG) qui remplit ~1 tuile d'emprise. Les autres sprites
// scalent au MÊME facteur → leur taille relative (calibrée sur BUILDING_HEIGHTS à la
// génération) se retrouve à l'écran. Baisser = ville plus imposante ; monter = plus tassée.
// 44 : bâtiments plus grands (les grands réservent leur empreinte multi-tuiles, donc
// pas de retour du chevauchement). Doit rester cohérent avec HOUSE_FOOTPRINT
// (buildingGenerator.js) : les variantes qui dépassent 1 tuile de large y ont une empreinte.
const HOUSE_UNIT = 44;

// A — AJUSTEMENT AU LOT (anti-débordement sur le trottoir/la route). Un sprite dont le
// contenu dépasse la largeur de son empreinte (w = tuile × spanX) est rétréci pour tenir
// dans w × (1 + margin), en scalant UNIFORMÉMENT (garde le ratio, donc ne s'étire pas).
// `margin` = débord latéral toléré. Les grands variants ont l'empreinte (HOUSE_FOOTPRINT)
// pour NE PAS être clampés → ils gardent leur masse. Molettes : __houseFit / __houseFitTune.
export const houseFitTune = { on: true, margin: 0.08 };

const cache = new Map();     // spriteKey -> { img, ready, bbox }
const variants = new Map();  // "spriteKey:tint" -> canvas teinté, RECADRÉ sur la bbox

// Clé de sprite effective. Aux ères cosmiques (eraBand ≥ 7) les variantes tardives
// prennent leur skin de bande « <variant>-cosmic-<band> » (fichiers dédiés) ; partout
// ailleurs le sprite de base « <variant> ». La bande vient de la même source que le
// repli procédural (CM.layout.counts.eraBand).
function spriteKeyFor(variant) {
  const band = (CM.layout?.counts?.eraBand | 0);
  if (band >= 7 && COSMIC_VARIANTS.has(variant)) return variant + "-cosmic-" + Math.min(9, band);
  return variant;
}

// B — Teinte d'une tuile. Déterministe sur (gx, gy).
// ⚠ cmHash rend un entier SIGNÉ : sans `>>> 0` le tirage se biaise silencieusement
// (même piège que le seed de fumée juste à côté).
//
// La teinte dépend de la VARIANTE et pas seulement du hash : chaque archétype n'a droit
// qu'aux matières qui lui vont (cf. FAMILY dans housePalette.js). Sans ce filtre, les
// tours de verre sortaient en terre cuite deux fois sur trois.
//
// Les skins COSMIQUES sont exclus : leur couleur de bande (émeraude 7, or 8, violet 9)
// est un signal de progression assorti aux tours-moteur, la permuter mentirait au joueur.
function houseTintOf(t, key) {
  if (!houseVarTune.on) return 0;
  if (key.indexOf("-cosmic-") >= 0) return 0;
  return pickHouseTint(cmHash("hvar:" + t.gx + ":" + t.gy) >>> 0, t.variant);
}

// B — Canvas d'une teinte, RECADRÉ sur la bbox de contenu et mis en cache. Renvoie null
// pour la teinte d'origine : ce cas emprunte le chemin historique, qui reste ainsi
// strictement inchangé. Cuit une fois par teinte réellement rencontrée ; au pire
// 12 archétypes × 2 teintes non identitaires, quelques Mo.
function variantCanvas(key, tint) {
  if (!tint) return null;
  const vk = key + ":" + tint;
  const hit = variants.get(vk);
  if (hit) return hit;
  const e = cache.get(key);
  // Source pas encore mesurée : ne RIEN mettre en cache, le sprite arrivera plus tard.
  if (!e || !e.ready || !e.bbox) return null;
  const bb = e.bbox;
  const c = document.createElement("canvas");
  c.width = bb.w; c.height = bb.h;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  cx.drawImage(e.img, bb.x0, bb.y0, bb.w, bb.h, 0, 0, bb.w, bb.h);
  let src;
  try { src = cx.getImageData(0, 0, bb.w, bb.h); }
  catch { return null; }                       // garde cross-origin (ne devrait pas arriver)
  const dst = cx.createImageData(bb.w, bb.h);
  applyHouseTint(src.data, dst.data, bb.w, bb.h, tint);
  cx.putImageData(dst, 0, 0);
  variants.set(vk, c);
  return c;
}

function ensure(key) {
  let e = cache.get(key);
  if (e) return e;
  e = { img: new Image(), ready: false, bbox: null };
  e.img.onload = () => {
    e.ready = true;
    e.bbox = contentBBox(e.img);
    // Sprite arrivé (souvent APRÈS le bake) → invalider le bake tuiles pour qu'il REMPLACE le
    // repli procédural baké dès le frame suivant (cf. cmInvalidateBakes). Sans ça, un PNG chargé
    // hors de la fenêtre de naissance laissait le procédural GELÉ jusqu'à un re-bake sans rapport
    // (achat, zoom, pan) — d'où le « flash » persistant de l'ancien sprite à l'achat.
    CM._tileBake = null;
  };
  e.img.src = "/pixelart/houses/" + key + ".png";
  cache.set(key, e);
  return e;
}

// Images d'habitation DÉJÀ décodées — accesseur de DIAGNOSTIC (banc du batcher
// WebGL : il lui faut de vraies sources, aux vraies dimensions). Lecture seule,
// aucun chargement déclenché.
export function pixelHouseImages() {
  const out = [];
  for (const e of cache.values()) if (e.ready && e.img) out.push(e.img);
  return out;
}

// Précharge les sprites d'habitation susceptibles d'apparaître AVANT qu'une tuile ne
// les demande, pour que pixelHouseReady soit déjà vrai à la 1re apparition d'une
// variante → plus de repli procédural VISIBLE (le « flash de l'ancien sprite » à
// l'achat, quand un recompute re-bake pendant que le PNG se charge encore). Le repli
// procédural reste en place comme filet de sécurité — il ne se déclenche juste plus en
// pratique. Idempotent : `ensure` met en cache par clé (un 2e appel ne recharge rien).
// Appelé au MONTAGE de la carte (initCityMap) ET à chaque (re)calcul du layout ; dès la
// bande 5 on précharge aussi les 9 skins cosmiques, pour que l'entrée en ère cosmique
// (band 7+) — y compris une ouverture directe de save late-game ou un saut d'ère
// (prestige/hors-ligne) — soit propre d'emblée, sans dépendre d'un recompute préalable à
// la bonne bande.
export function preloadHouseSprites(band) {
  if (!pixelHousesFlag.on || typeof Image === "undefined") return;
  for (const v of AVAILABLE) ensure(v);
  if ((band | 0) >= 5) {
    for (const v of COSMIC_VARIANTS) for (const b of [7, 8, 9]) ensure(v + "-cosmic-" + b);
  }
}

// BBox du contenu opaque (alpha>16), mesurée UNE fois par sprite via canvas
// offscreen : ancre la base au sol sans dépendre du padding transparent du PNG.
function contentBBox(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return null;
  let c;
  if (typeof OffscreenCanvas !== "undefined") c = new OffscreenCanvas(w, h);
  else { c = document.createElement("canvas"); c.width = w; c.height = h; }
  c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0);
  let data;
  try { data = cx.getImageData(0, 0, w, h).data; }
  catch { return { x0: 0, y0: 0, w, h }; }   // garde cross-origin (ne devrait pas arriver, same-origin)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, w, h };
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// True si un sprite pixel PRÊT existe pour cette tuile → l'appelant saute le
// procédural (corps ET ombre carrée). Déclenche le chargement paresseux.
export function pixelHouseReady(t) {
  if (!pixelHousesFlag.on) return false;
  if ((t.type !== "house" && t.type !== "enginehome") || !AVAILABLE.has(t.variant)) return false;
  const e = ensure(spriteKeyFor(t.variant));
  return !!(e.ready && e.bbox);
}

// GÉOMÉTRIE SEULE du sprite d'une habitation : source dans le PNG + boîte écran
// de destination. Source UNIQUE, partagée par le dessin et par le liseré de
// survol — deux copies de ce clamp au lot finiraient par diverger d'un pixel, et
// un liseré décalé d'un pixel se voit tout de suite.
// (x,y,w,h) = boîte-tuile (≈ carré s×s après inset/sizeVar). Base ancrée au bas
// de la tuile ; largeur = bb.w × k (k = w/HOUSE_UNIT), hauteur au ratio.
function pixelHouseGeom(t, x, y, w, h) {
  const key = spriteKeyFor(t.variant);
  const e = cache.get(key);
  if (!e || !e.ready || !e.bbox) return null;
  const bb = e.bbox;
  // Empreinte multi-tuiles : on scale sur la taille d'UNE tuile (w/span), pas sur
  // toute la boîte → le sprite garde sa taille naturelle et NE grandit PAS avec
  // l'empreinte ; celle-ci ne sert qu'à réserver l'espace (anti-chevauchement).
  const span = t.spanX || t.size || 1;
  const unit = w / span;
  let k = unit / HOUSE_UNIT;                 // facteur commun (suit le zoom via unit≈TILE*zoom)
  // A — clamp au lot : si le sprite dépasse la largeur de son empreinte + marge, on réduit k
  // uniformément (garde le ratio) → il cesse de baver sur le trottoir. `w` = tuile × spanX.
  if (houseFitTune.on) {
    const maxW = w * (1 + houseFitTune.margin);
    if (bb.w * k > maxW) k = maxW / bb.w;
  }
  const dw = Math.max(1, Math.round(bb.w * k));
  const dh = Math.max(1, Math.round(bb.h * k));
  const groundY = y + h;                    // bas de l'empreinte = contact au sol (front)
  const dx = Math.round(x + w / 2 - dw / 2);   // centré horizontalement dans l'empreinte
  const dy = Math.round(groundY - dh);
  // B — teinte de CETTE tuile. Le canvas teinté est déjà recadré sur la bbox, donc sa
  // source part de (0,0) ; la géométrie, elle, ne change pas (la teinte ne déplace
  // aucun pixel). Tout ce qui passe par pixelHouseGeom — dessin, boîte de la fumée,
  // liseré de survol — suit donc automatiquement.
  const vc = variantCanvas(key, houseTintOf(t, key));
  if (vc) return { img: vc, bb: { x0: 0, y0: 0, w: bb.w, h: bb.h }, dx, dy, dw, dh };
  return { img: e.img, bb, dx, dy, dw, dh };
}

// Dessine le sprite. RENVOIE la boîte écran RÉELLEMENT dessinée {dx, dy, dw, dh},
// ou null si le sprite n'est pas prêt. Les appelants s'en servaient comme d'un
// booléen (un objet reste truthy, null reste falsy) ; le survol, lui, a besoin de
// la boîte pour tester la silhouette plutôt que la cellule de sol.
export function drawPixelHouse(t, x, y, w, h) {
  const g = pixelHouseGeom(t, x, y, w, h);
  if (!g) return null;
  const ctx = CM.ctx;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;        // pixel net
  ctx.drawImage(g.img, g.bb.x0, g.bb.y0, g.bb.w, g.bb.h, g.dx, g.dy, g.dw, g.dh);
  ctx.imageSmoothingEnabled = prev;
  // Cette maison est peinte APRÈS les lampes qui se trouvent derrière elle :
  // elle doit donc effacer leur halo là où sa silhouette passe devant (cf.
  // lightLayer.js). Même image, même géométrie → découpe au pixel. No-op quand
  // aucune lumière n'a été déposée dans ce coin de l'écran.
  lightCutImage(g.img, g.dx, g.dy, g.dw, g.dh, g.bb.x0, g.bb.y0, g.bb.w, g.bb.h);
  return { dx: g.dx, dy: g.dy, dw: g.dw, dh: g.dh };
}

// Boîte écran du sprite SANS le dessiner, pour les couches qui doivent se placer
// par rapport à lui AVANT qu'il soit peint — la fumée de cheminée est un item du
// tri peintre, elle doit connaître le haut du toit au moment où on la range dans
// la liste, pas une frame plus tard (la caméra aurait bougé entre-temps).
export function pixelHouseBox(t, x, y, w, h) {
  const g = pixelHouseGeom(t, x, y, w, h);
  return g ? { dx: g.dx, dy: g.dy, dw: g.dw, dh: g.dh } : null;
}

// Canvas de travail du liseré, réutilisé d'une frame à l'autre : une seule
// habitation est survolée à la fois, inutile d'en allouer un par appel.
let _outlineCanvas = null;

// LISERÉ DE SURVOL : silhouette du sprite élargie d'un pixel dans les 4
// directions, teintée à plat, à dessiner AVANT le sprite (qui la recouvre et ne
// laisse dépasser que le contour). Recette pixel-art classique : 4 blits
// décalés, puis 'source-in' pour peindre le blob d'une seule couleur. Pas de
// scale, pas de glow additif : à 1 px et dans la palette, ça reste un repère,
// pas une sélection de jeu de stratégie.
export function drawPixelHouseOutline(t, x, y, w, h, color) {
  const g = pixelHouseGeom(t, x, y, w, h);
  if (!g) return null;
  const p = 1;
  const cw = g.dw + p * 2, ch = g.dh + p * 2;
  if (!_outlineCanvas) _outlineCanvas = document.createElement("canvas");
  const oc = _outlineCanvas;
  if (oc.width < cw || oc.height < ch) { oc.width = cw; oc.height = ch; }
  const octx = oc.getContext("2d");
  octx.clearRect(0, 0, oc.width, oc.height);
  octx.imageSmoothingEnabled = false;
  for (const [ox, oy] of [[0, p], [p * 2, p], [p, 0], [p, p * 2]]) {
    octx.drawImage(g.img, g.bb.x0, g.bb.y0, g.bb.w, g.bb.h, ox, oy, g.dw, g.dh);
  }
  octx.globalCompositeOperation = "source-in";
  octx.fillStyle = color;
  octx.fillRect(0, 0, cw, ch);
  octx.globalCompositeOperation = "source-over";
  const ctx = CM.ctx;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(oc, 0, 0, cw, ch, g.dx - p, g.dy - p, cw, ch);
  ctx.imageSmoothingEnabled = prev;
  return { dx: g.dx, dy: g.dy, dw: g.dw, dh: g.dh };
}

// Hauteur (en TUILES) du sprite d'une variante — pour le Y-SORT « peintre » des agents :
// même math que drawPixelHouse (dh/unit = bb.h/HOUSE_UNIT), donc la portée RÉELLE du
// sprite au-dessus de sa base. null tant que le PNG n'est pas mesuré (l'appelant met
// un défaut). Suit le skin cosmique courant via spriteKeyFor.
export function houseSpriteHeightTiles(variant) {
  const e = cache.get(spriteKeyFor(variant));
  return (e && e.ready && e.bbox) ? e.bbox.h / HOUSE_UNIT : null;
}

// Dev : bascule le rendu pixel des habitations. __pixelHouses(false) → procédural.
if (typeof window !== "undefined") {
  window.__pixelHouses = (on) => {
    pixelHousesFlag.on = on !== false;
    CM._tileBake = null;   // force re-bake pour voir le changement
    return pixelHousesFlag.on;
  };
  // A — clamp au lot : on/off + réglage de la marge de débord toléré. Les deux rebakent
  // les maisons via CM._tileBake=null. Ex. __houseFitTune({ margin: 0.06 }) = plus serré.
  window.__houseFit = (on) => { houseFitTune.on = on !== false; CM._tileBake = null; return houseFitTune.on; };
  window.__houseFitTune = (o = {}) => { Object.assign(houseFitTune, o); CM._tileBake = null; return { ...houseFitTune }; };
  // B — variation par instance. __houseVar(false) = retour aux 12 sprites stampés,
  // l'A/B qui montre ce que la variation apporte.
  window.__houseVar = (on) => { houseVarTune.on = on !== false; CM._tileBake = null; return houseVarTune.on; };
  // Répartition réelle des teintes sur les habitations du layout — pour vérifier d'un
  // coup d'œil que le tirage ne s'est pas effondré sur une seule.
  window.__houseVarStats = () => {
    const tiles = (CM.layout?.tiles || []).filter((t) => t.type === "house" || t.type === "enginehome");
    const out = {};
    for (const t of tiles) {
      const k = HOUSE_TINTS[houseTintOf(t, spriteKeyFor(t.variant))].id;
      out[k] = (out[k] || 0) + 1;
    }
    return { total: tiles.length, ...out };
  };
}
