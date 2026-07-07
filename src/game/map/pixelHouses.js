"use strict";
// Couche pixel-art des HABITATIONS (logements NON achetables de la carte, tuiles
// type:"house"). Miroir de pixelBuildings.js. Le sprite est ANCRÉ PAR LA BASE et
// monte AU-DESSUS de sa tuile selon son ratio : les tours / mega-complexes de late
// game dépassent largement leur emprise → « suivent le nom ». Repli sur le rendu
// procédural (drawHouseShape) si : flag OFF, variante sans sprite, ou pas encore
// chargé. Fichier : /pixelart/houses/<variant>.png  (cf public/pixelart/houses/).
//
// ⚠ Les maisons sont BAKÉES dans le canvas offscreen CM.tileCanvas → à chaque
// chargement de sprite on invalide CM.tileCamKey pour forcer un re-bake.
import { CM } from './layout.js';

export const pixelHousesFlag = { on: true };

// Les 12 variantes livrées. Les ères cosmiques (band 7-9) réutilisent les mêmes
// variantes tardives (tower/megablock/arcologyhome, cf. clamp de VARIANTS_HOUSE) :
// pas de gate par bande, on se fie à la variante de la tuile.
const AVAILABLE = new Set([
  "tent", "hut", "longhouse", "courtyard", "townhouse", "stonehouse",
  "manor", "block", "tenement", "tower", "megablock", "arcologyhome"
]);

// Largeur de contenu (px du PNG) qui remplit ~1 tuile d'emprise. Les autres sprites
// scalent au MÊME facteur → leur taille relative (calibrée sur BUILDING_HEIGHTS à la
// génération) se retrouve à l'écran. Baisser = ville plus imposante ; monter = plus tassée.
// 44 : bâtiments plus grands (les grands réservent leur empreinte multi-tuiles, donc
// pas de retour du chevauchement). Doit rester cohérent avec HOUSE_FOOTPRINT
// (buildingGenerator.js) : les variantes qui dépassent 1 tuile de large y ont une empreinte.
const HOUSE_UNIT = 44;

const cache = new Map();   // variant -> { img, ready, bbox }

function ensure(variant) {
  let e = cache.get(variant);
  if (e) return e;
  e = { img: new Image(), ready: false, bbox: null };
  e.img.onload = () => {
    e.ready = true;
    e.bbox = contentBBox(e.img);
    CM.tileCamKey = "";   // invalide le bake offscreen → re-dessine avec le sprite
  };
  e.img.src = "/pixelart/houses/" + variant + ".png";
  cache.set(variant, e);
  return e;
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
  const e = ensure(t.variant);
  return !!(e.ready && e.bbox);
}

// Dessine le sprite. (x,y,w,h) = boîte-tuile (≈ carré s×s après inset/sizeVar).
// Base ancrée au bas de la tuile ; largeur = bb.w × k (k = w/HOUSE_UNIT), hauteur au ratio.
export function drawPixelHouse(t, x, y, w, h) {
  const e = cache.get(t.variant);
  if (!e || !e.ready || !e.bbox) return false;
  const bb = e.bbox;
  const ctx = CM.ctx;
  // Empreinte multi-tuiles : on scale sur la taille d'UNE tuile (w/span), pas sur
  // toute la boîte → le sprite garde sa taille naturelle et NE grandit PAS avec
  // l'empreinte ; celle-ci ne sert qu'à réserver l'espace (anti-chevauchement).
  const span = t.spanX || t.size || 1;
  const unit = w / span;
  const k = unit / HOUSE_UNIT;              // facteur commun (suit le zoom via unit≈TILE*zoom)
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

// Dev : bascule le rendu pixel des habitations. __pixelHouses(false) → procédural.
if (typeof window !== "undefined") {
  window.__pixelHouses = (on) => {
    pixelHousesFlag.on = on !== false;
    CM.tileCamKey = "";   // force re-bake pour voir le changement
    return pixelHousesFlag.on;
  };
}
