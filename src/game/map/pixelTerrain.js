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

export function drawPixelTerrain(CM) {
  if (!CM.layout) return false;
  ensureGrass();
  const band = (CM.layout.counts && CM.layout.counts.eraBand) || 0;
  const name = override || tilesetForBand(band);
  const ts = ensure(name);
  if (!grassReady || !ts || !ts.ready || !ts.uv) return false;
  // Rues : tileset de l'ère, repli sur le placeholder tant qu'il n'est pas chargé.
  let streetTs = ensureStreet(streetForBand(band));
  if (!streetTs || !streetTs.ready) streetTs = ensureStreet('streets');
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
  const roadMap = L.roadMap;
  const isStreet = (x, y) => drawStreets && L.roadSet.has(x + ',' + y);

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
          const m = (isStreet(gx, gy - 1) ? 1 : 0) | (isStreet(gx + 1, gy) ? 2 : 0)
                  | (isStreet(gx, gy + 1) ? 4 : 0) | (isStreet(gx - 1, gy) ? 8 : 0);
          ctx.drawImage(STREET, (m & 3) * 32, (m >> 2) * 32, 32, 32, dx, dy, sz, sz);
        }
      }
    }
  }
  ctx.imageSmoothingEnabled = prev;
  return true;
}
