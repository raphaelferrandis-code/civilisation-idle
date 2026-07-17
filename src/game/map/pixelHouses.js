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
import { CM } from './layout.js';

export const pixelHousesFlag = { on: true };

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

const cache = new Map();   // spriteKey -> { img, ready, bbox }

// Clé de sprite effective. Aux ères cosmiques (eraBand ≥ 7) les variantes tardives
// prennent leur skin de bande « <variant>-cosmic-<band> » (fichiers dédiés) ; partout
// ailleurs le sprite de base « <variant> ». La bande vient de la même source que le
// repli procédural (CM.layout.counts.eraBand).
function spriteKeyFor(variant) {
  const band = (CM.layout?.counts?.eraBand | 0);
  if (band >= 7 && COSMIC_VARIANTS.has(variant)) return variant + "-cosmic-" + Math.min(9, band);
  return variant;
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

// Dessine le sprite. (x,y,w,h) = boîte-tuile (≈ carré s×s après inset/sizeVar).
// Base ancrée au bas de la tuile ; largeur = bb.w × k (k = w/HOUSE_UNIT), hauteur au ratio.
export function drawPixelHouse(t, x, y, w, h) {
  const e = cache.get(spriteKeyFor(t.variant));
  if (!e || !e.ready || !e.bbox) return false;
  const bb = e.bbox;
  const ctx = CM.ctx;
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
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;        // pixel net
  ctx.drawImage(e.img, bb.x0, bb.y0, bb.w, bb.h, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = prev;
  return true;
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
}
