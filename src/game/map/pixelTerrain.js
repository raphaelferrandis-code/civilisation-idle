/* eslint-disable */
/* ============================================================================
 * pixelTerrain.js — PROTOTYPE pixel-art (derrière flag pixelTerrainFlag.on)
 *   Couche terrain en TUILES WANG 32px (tilesets PixelLab), à la place du sol
 *   procédural + des routes. Corner-based : chaque tuile = 4 coins (herbe=1 /
 *   route=0). Un sommet de grille est « route » si une de ses 4 cellules
 *   voisines est une route.
 *
 *   HERBE / ROUTE SÉPARÉES (base tiles PixelLab) : l'herbe (G3) est verrouillée
 *   et identique dans tous les tilesets ; seule la ROUTE change. Elle ÉVOLUE
 *   PAR ÈRE : terre (bandes 0–3) → pavé (bandes 4+). Extensible (ROAD_STAGES).
 *
 *   Piloté par métadonnées Wang (public/pixelart/<name>.json) : on bascule de
 *   tileset sans recoder. But : juger en jeu via le harnais __cityShot.
 * ============================================================================ */

import { drawPixelMedians } from './pixelMedian.js';
import { pixelRoadPavingFlag, roadPavingReady, roadPavingTile } from './roadPaving.js';

// upper=herbe=1, lower=route=0 ; clé = NW*8 + NE*4 + SE*2 + SW.
function cornerKey(c) {
  const b = (v) => (v === 'upper' ? 1 : 0);
  return b(c.NW) * 8 + b(c.NE) * 4 + b(c.SE) * 2 + b(c.SW);
}

const cache = {}; // name -> { img, ready, uv:[16][2] }
function ensure(name) {
  let e = cache[name];
  if (e) return e;
  if (typeof Image === 'undefined' || typeof fetch === 'undefined') return null;
  e = { img: null, ready: false, uv: null, edge: null, edgeReady: false };
  cache[name] = e;
  fetch('/pixelart/' + name + '.json')
    .then((r) => r.json())
    .then((meta) => {
      const uv = new Array(16);
      for (const t of meta.tileset_data.tiles) uv[cornerKey(t.corners)] = [t.bounding_box.x, t.bounding_box.y];
      e.uv = uv;
      const img = new Image();
      img.onload = () => { e.ready = true; };
      img.src = '/pixelart/' + name + '.png';
      e.img = img;
      // Couche 3 — BORD herbe→sol (généré par scripts/makeGrassEdge.mjs). Même
      // grille Wang ; absent = on retombe sur sol + route sans frange.
      const edge = new Image();
      edge.onload = () => { e.edgeReady = true; };
      edge.src = '/pixelart/' + name + '.edge.png';
      e.edge = edge;
    })
    .catch(() => { /* tileset absent : retombe sur le procédural */ });
  return e;
}

// UN STYLE DE ROUTE PAR BANDE D'ÈRE (10 bandes). Herbe D2 IDENTIQUE dans tous
// (même base tile PixelLab) ; seule la route évolue avec la civilisation.
const ROAD_STAGES = [
  { maxBand: 0, name: 'roads/band0-feu' },         // terre battue
  { maxBand: 1, name: 'roads/band1-bois' },        // terre + planches
  { maxBand: 2, name: 'roads/band2-pierre' },      // gravier
  { maxBand: 3, name: 'roads/band3-couronne' },    // pavé rustique
  { maxBand: 4, name: 'roads/band4-marbre' },      // dalles claires
  { maxBand: 5, name: 'roads/band5-fonte' },       // pavé industriel
  { maxBand: 6, name: 'roads/band6-singularite' }, // béton
  { maxBand: 7, name: 'roads/band7-noosphere' },   // énergie blanche
  { maxBand: 8, name: 'roads/band8-stellaire' },   // énergie bleue
  { maxBand: 99, name: 'roads/band9-demiurge' }    // néon cosmique
];
function tilesetForBand(band) {
  for (const s of ROAD_STAGES) if (band <= s.maxBand) return s.name;
  return ROAD_STAGES[ROAD_STAGES.length - 1].name;
}

export const pixelTerrainFlag = { on: true };
let override = null; // dev : force un tileset précis (ignore l'ère). null = par ère.

// Dev : __pixelTileset('rcobble') force ; __pixelTileset() ou (null) = retour par ère.
export function setPixelTileset(name) { override = name || null; if (name) ensure(name); }

// Préchargement des étages (10 bandes).
for (const st of ROAD_STAGES) ensure(st.name);

// Couche HERBE : 1 tuile unique (public/pixelart/grass.png), indépendante des
// routes. Éditable une seule fois ; les routes (overlays transparents) par-dessus.
let grassImg = null, grassReady = false;
function ensureGrass() {
  if (grassImg || typeof Image === 'undefined') return;
  grassImg = new Image();
  grassImg.onload = () => { grassReady = true; };
  grassImg.src = '/pixelart/grass.png';
}
ensureGrass();

// Couche RUES (réseau de circulation) : tileset edge-Wang PAR ÈRE
// (public/pixelart/streets-band{0..9}.png), 16 tuiles 4×4. La tuile est choisie par les 4
// voisins ORTHO qui sont aussi des rues (bitmask N=1,E=2,S=4,W=8 ; col = m&3, row = m>>2).
// Surface habillée de l'art PixelLab par ère (makeStreetTiles.mjs). Indépendant du sol :
// posé PAR-DESSUS. Repli sur le placeholder `streets.png` tant qu'une ère n'est pas générée.
export const pixelRoadsFlag = { on: true };
const streetCache = {}; // name -> { img, ready }
function ensureStreet(name) {
  let e = streetCache[name];
  if (e) return e;
  if (typeof Image === 'undefined') return null;
  e = { img: new Image(), ready: false };
  e.img.onload = () => { e.ready = true; };
  e.img.src = '/pixelart/' + name + '.png';
  streetCache[name] = e;
  return e;
}
function streetForBand(band) { return 'streets-band' + Math.max(0, Math.min(9, band | 0)); }
ensureStreet('streets'); // placeholder de repli

// Couleurs de la chaussée, échantillonnées au CENTRE de la tuile PLEINE (mask 15 = croix,
// opaque) du tileset des rues, mises en cache par tileset. `fill` = matière de la route ;
// `edge` = liseré (même teinte assombrie). Les tuiles edge-Wang ont leur bordure BAKÉE sur
// les 4 arêtes → une GRILLE de liserés dans un bloc de routes adjacentes ; on rend donc la
// chaussée en APLAT continu et le liseré n'est tracé QUE contre le non-route (herbe/sol).
function streetRoadColors(ts) {
  if (!ts || !ts.img) return null;
  if (ts._roadCol !== undefined) return ts._roadCol;
  ts._roadCol = null;
  try {
    const img = ts.img, c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const tw = Math.floor(img.width / 4);
    const d = g.getImageData(3 * tw + (tw >> 1), 3 * tw + (tw >> 1), 1, 1).data;
    if (d[3] > 40) ts._roadCol = {
      fill: 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')',
      edge: 'rgb(' + Math.round(d[0] * 0.42) + ',' + Math.round(d[1] * 0.42) + ',' + Math.round(d[2] * 0.42) + ')',
      rgb: [d[0], d[1], d[2]] // matière brute → dérive le ton du trottoir (sidewalkTone)
    };
  } catch (e) { ts._roadCol = null; }
  return ts._roadCol;
}

// ── TROTTOIR : bande claire sur le bord exposé des rues (curb = liseré sombre existant).
//   Rendu DANS la passe bord de drawPixelTerrain (baké, coût nul par frame). La bande
//   n'apparaît qu'au contact du non-route (côtés !n/!s/!e/!w), donc suit tout le réseau et
//   fusionne sans grille interne, exactement comme le liseré qu'elle remplace.
//   Progressif : rien sur terre/bois/gravier (band < minBand), le trottoir arrive quand la
//   ville se pave. Molettes dev via window.__sidewalk / __sidewalkTune (cf. cityMapRuntime).
export const pixelSidewalkFlag = { on: true };
export const sidewalkTune = { widthK: 5, curbK: 1, desat: 0.55, lift: 0.42, minBand: 3 };
const SKIP_SIDEWALK = (band) => (band | 0) < sidewalkTune.minBand;

// Ton du trottoir dérivé de la MATIÈRE de la route : on désature vers son propre gris puis on
// éclaircit vers le blanc → béton clair qui garde la teinte de l'ère (chaud si la route est
// chaude). Zéro asset : cohérent bois→pierre→béton→énergie sans nouveau PNG.
function sidewalkTone(rgb) {
  const lum = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
  const ch = (c) => {
    let v = c + (lum - c) * sidewalkTune.desat;
    v = v + (255 - v) * sidewalkTune.lift;
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return 'rgb(' + ch(rgb[0]) + ',' + ch(rgb[1]) + ',' + ch(rgb[2]) + ')';
}

export function drawPixelTerrain(CM) {
  if (!CM.layout) return false;
  ensureGrass();
  const band = (CM.layout.counts && CM.layout.counts.eraBand) || 0;
  const name = override || tilesetForBand(band);
  const ts = ensure(name);
  if (!grassReady || !ts || !ts.ready || !ts.uv) return false;
  // Rues : tileset de l'ère, repli sur le placeholder tant qu'il n'est pas chargé.
  let streetTs = ensureStreet(streetForBand(band));
  const streetExact = !!(streetTs && streetTs.ready);
  if (!streetExact) streetTs = ensureStreet('streets');
  // Signal pour le CACHE du sol (cityMapRuntime) : tant qu'on dessine avec le
  // tileset de rues de REPLI (ou que la matière-pont de la chaussée n'est pas
  // encore extraite), le rendu va encore changer → ne pas figer le bake.
  CM._groundBakeStable = streetExact && (!pixelRoadPavingFlag.on || roadPavingReady(band));
  const ctx = CM.ctx, L = CM.layout, N = L.gridN, T = CM.TILE, z = CM.cam.zoom;
  const UV = ts.uv, IMG = ts.img;
  // SOL URBAIN : la zone bâtie (organicLimit ∪ routes ∪ emprises), PAS le réseau
  // de rues. Les rues se dessinent par-dessus (routes procédurales, cityMapRuntime).
  const area = L.urbanSet || L.roadSet || new Set();
  const inArea = (x, y) => x >= 0 && y >= 0 && x < N && y < N && area.has(x + ',' + y);
  const v = (vx, vy) =>
    (inArea(vx - 1, vy - 1) || inArea(vx, vy - 1) || inArea(vx - 1, vy) || inArea(vx, vy)) ? 0 : 1;
  // Rues : réseau viaire (cellules). Le masque edge-Wang lit les 4 voisins ORTHO.
  const drawStreets = pixelRoadsFlag.on && streetTs && streetTs.ready && L.roadSet;
  const STREET = streetTs && streetTs.img;
  const roadCol = drawStreets ? streetRoadColors(streetTs) : null; // aplat + liseré procéduraux
  // Chaussée = MATIÈRE DU PONT de l'ère (roadPaving) : un canvas-pattern répété,
  // ANCRÉ AU MONDE (matrice cam) pour que le grain reste collé à la carte au pan.
  // La tuile est opaque → remplace l'aplat roadCol. Repli (flag off / pas prêt /
  // pattern/DOMMatrix non supporté) → aplat plat roadCol inchangé.
  const pav = (drawStreets && pixelRoadPavingFlag.on) ? roadPavingTile(band) : null;
  let pavPat = null;
  if (pav && pav.canvas && CM.ctx.createPattern && typeof DOMMatrix !== 'undefined') {
    pavPat = CM.ctx.createPattern(pav.canvas, 'repeat');
    if (pavPat && pavPat.setTransform) {
      // tuile-px → écran : échelle z (1 px tuile = 1 px monde), origine = monde (0,0).
      pavPat.setTransform(new DOMMatrix([z, 0, 0, z, CM.cw / 2 - CM.cam.x * z, CM.ch / 2 - CM.cam.y * z]));
    } else { pavPat = null; }
  }
  const roadMap = L.roadMap;
  // Les cellules `roadMedian` (sol coincé ENTRE deux routes) sont PAVÉES : traitées comme
  // des rues → l'edge-Wang fusionne le tout en une GRANDE route pleine (plus de « carrés de
  // sol » au milieu, plus de faux carrefours). Exclut déjà les bâtiments (calcul layout).
  const roadMedian = L.roadMedian || null;
  // Les cellules de PLACE (rang "plaza") sont des esplanades dallées, PAS des
  // chaussées : elles sont dans roadSet (marchables, h/v posés) mais doivent être
  // EXCLUES du rendu de rue — sinon la dalle pixel de la place (insérée + coins
  // arrondis, dessinée par-dessus) laisse fuiter la chaussée à ses bords et à ses
  // 4 angles. Miroir du skip `rank === "plaza"` déjà fait côté routes procédurales
  // (cityMapDrawRoad) et rubans median/terre-plein. Exclure aussi la place des
  // VOISINS du masque edge-Wang ferme proprement les rues qui la bordent.
  const isStreet = (x, y) => {
    if (!drawStreets) return false;
    const k = x + ',' + y;
    if (!(L.roadSet.has(k) || (roadMedian && roadMedian.has(k)))) return false;
    const rec = roadMap && roadMap.get(k);
    return !(rec && rec.rank === 'plaza');
  };

  // Trottoir : tons calculés UNE fois (constants sur la frame). Base = matière réelle de la
  // route — pattern-pont (pav.mean) si actif, sinon aplat de l'ère (roadCol.rgb). Curb = le
  // même liseré sombre que d'habitude. null → aucune bande (ère trop tôt, ou couleur absente).
  const sidewalkOn = pixelSidewalkFlag.on && drawStreets && !SKIP_SIDEWALK(band);
  let walkFill = null, curbFill = null;
  if (sidewalkOn) {
    const base = (pavPat && pav) ? pav.mean : (roadCol ? roadCol.rgb : null);
    if (base) {
      walkFill = sidewalkTone(base);
      curbFill = (pavPat && pav) ? pav.edge : roadCol.edge;
    }
  }

  const halfW = (CM.cw / 2) / z, halfH = (CM.ch / 2) / z;
  const gx0 = Math.floor((CM.cam.x - halfW) / T) - 1;
  const gx1 = Math.ceil((CM.cam.x + halfW) / T) + 1;
  const gy0 = Math.floor((CM.cam.y - halfH) / T) - 1;
  const gy1 = Math.ceil((CM.cam.y + halfH) / T) + 1;

  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const sz = Math.ceil(T * z) + 1; // +1px : évite les coutures au scaling fractionnaire
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      const dx = Math.floor((gx * T - CM.cam.x) * z + CM.cw / 2);
      const dy = Math.floor((gy * T - CM.cam.y) * z + CM.ch / 2);
      // Couche 1 — HERBE (tuile unique répétée).
      ctx.drawImage(grassImg, 0, 0, 32, 32, dx, dy, sz, sz);
      // Couche 2 — SOL URBAIN (overlay Wang) + Couche 3 — FRANGE d'herbe.
      // key 15 = tout-herbe (rien à poser) ; key 0 = tout-sol (pas de frange).
      const key = v(gx, gy) * 8 + v(gx + 1, gy) * 4 + v(gx + 1, gy + 1) * 2 + v(gx, gy + 1);
      if (key !== 15) {
        const uv = UV[key];
        if (uv) {
          ctx.drawImage(IMG, uv[0], uv[1], 32, 32, dx, dy, sz, sz);
          if (key !== 0 && ts.edgeReady) ctx.drawImage(ts.edge, uv[0], uv[1], 32, 32, dx, dy, sz, sz);
        }
      }
      // Couche 4 — RUES (edge-Wang) : posée par-dessus, indépendante du sol (donc
      // visible aussi hors de la zone urbaine, ex. une route vers la campagne).
      if (isStreet(gx, gy)) {
        const rec = roadMap && roadMap.get(gx + ',' + gy);
        if (!rec || rec.roadSurface !== 'bridge') { // ponts : laissés au rendu procédural
          const n = isStreet(gx, gy - 1), e = isStreet(gx + 1, gy),
                s = isStreet(gx, gy + 1), w = isStreet(gx - 1, gy);
          if (pavPat || roadCol) {
            // Chaussée PLEINE — MATIÈRE DU PONT (pattern ancré monde) si dispo, sinon
            // APLAT de l'ère (roadCol) — + liseré UNIQUEMENT contre le non-route : les
            // routes adjacentes fusionnent sans grille interne (les tuiles edge-Wang
            // bakent leur bordure sur les 4 arêtes → coutures dans les blocs). Les coins
            // (dont les L intérieurs) se ferment tout seuls : chaque cellule trace ses
            // propres côtés exposés, les bandes voisines se rejoignent au pixel près.
            ctx.fillStyle = pavPat || roadCol.fill;
            ctx.fillRect(dx, dy, sz, sz);
            if (walkFill) {
              // TROTTOIR : bande claire sur chaque côté exposé, puis curb sombre à sa lisière
              // INTÉRIEURE (côté chaussée). On peint TOUTES les bandes d'abord, TOUS les curbs
              // ensuite → aux coins extérieurs les bandes se recouvrent en L et les curbs se
              // croisent proprement, comme le liseré qu'elles remplacent.
              const sw = Math.max(2, Math.round(sz * sidewalkTune.widthK / 32));
              const cb = Math.max(1, Math.round(sz * sidewalkTune.curbK / 32));
              ctx.fillStyle = walkFill;
              if (!n) ctx.fillRect(dx, dy, sz, sw);
              if (!s) ctx.fillRect(dx, dy + sz - sw, sz, sw);
              if (!w) ctx.fillRect(dx, dy, sw, sz);
              if (!e) ctx.fillRect(dx + sz - sw, dy, sw, sz);
              ctx.fillStyle = curbFill;
              if (!n) ctx.fillRect(dx, dy + sw - cb, sz, cb);
              if (!s) ctx.fillRect(dx, dy + sz - sw, sz, cb);
              if (!w) ctx.fillRect(dx + sw - cb, dy, cb, sz);
              if (!e) ctx.fillRect(dx + sz - sw, dy, cb, sz);
            } else {
              // Ère sans trottoir (terre/bois/gravier) : liseré simple — comportement historique.
              const t = Math.max(1, Math.round(sz * 2 / 32));
              ctx.fillStyle = pavPat ? pav.edge : roadCol.edge;
              if (!n) ctx.fillRect(dx, dy, sz, t);
              if (!s) ctx.fillRect(dx, dy + sz - t, sz, t);
              if (!w) ctx.fillRect(dx, dy, t, sz);
              if (!e) ctx.fillRect(dx + sz - t, dy, t, sz);
            }
          } else {
            // Repli (échantillonnage indisponible) : tuiles edge-Wang historiques.
            const m = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
            ctx.drawImage(STREET, (m & 3) * 32, (m >> 2) * 32, 32, 32, dx, dy, sz, sz);
          }
        }
      }
    }
  }

  // ── Terre-plein (refuge central) PIXEL-ART, sur la couture L.terrePlein des
  // boulevards 2 cellules (drawPixelMedians). L'ancien ruban végétalisé PROCÉDURAL
  // (gazon + buissons + fleurs, sur L.median ET L.terrePlein) a été SUPPRIMÉ : plus
  // aucun repli plat, seul le refuge pixel s'affiche. Flag off / asset pas encore
  // décodé → rien (le refuge apparaît au décodage via setMedianOnLoad qui rebake).
  if (drawStreets) drawPixelMedians(CM);

  ctx.imageSmoothingEnabled = prev;
  return true;
}

// Pave la TUILE PLEINE de sol/route de l'ère (UV[0] = 4 coins = route : terre battue
// band0, gravier band2, pavé band4+…) sur un rectangle écran (dx,dy,dw,dh), tuiles de
// taille cellPx. Sert à donner au sol des CHAMPS la matière de l'âge plutôt qu'un brun
// uni (cf. cityEngineSprites irrigated_fields). Renvoie false si le tileset pas chargé
// (l'appelant retombe alors sur un aplat). Indépendant du flag terrain.
export function drawEraGroundFill(ctx, dx, dy, dw, dh, band, cellPx) {
  const ts = ensure(tilesetForBand(band));
  if (!ts || !ts.ready || !ts.uv || !ts.uv[0]) return false;
  const uv = ts.uv[0], img = ts.img;
  const step = Math.max(2, cellPx);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
  for (let y = dy; y < dy + dh; y += step)
    for (let x = dx; x < dx + dw; x += step)
      ctx.drawImage(img, uv[0], uv[1], 32, 32, Math.floor(x), Math.floor(y), Math.ceil(step) + 1, Math.ceil(step) + 1);
  ctx.restore();
  ctx.imageSmoothingEnabled = prev;
  return true;
}
