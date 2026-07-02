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
      edge: 'rgb(' + Math.round(d[0] * 0.42) + ',' + Math.round(d[1] * 0.42) + ',' + Math.round(d[2] * 0.42) + ')'
    };
  } catch (e) { ts._roadCol = null; }
  return ts._roadCol;
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
  const roadCol = drawStreets ? streetRoadColors(streetTs) : null; // aplat + liseré procéduraux
  const roadMap = L.roadMap;
  // Les cellules `roadMedian` (sol coincé ENTRE deux routes) sont PAVÉES : traitées comme
  // des rues → l'edge-Wang fusionne le tout en une GRANDE route pleine (plus de « carrés de
  // sol » au milieu, plus de faux carrefours). Exclut déjà les bâtiments (calcul layout).
  const roadMedian = L.roadMedian || null;
  const isStreet = (x, y) => drawStreets && (L.roadSet.has(x + ',' + y) || (roadMedian && roadMedian.has(x + ',' + y)));

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
          if (roadCol) {
            // Chaussée PLEINE (couleur du tileset de l'ère) + liseré UNIQUEMENT contre le
            // non-route : les routes adjacentes fusionnent sans grille interne (les tuiles
            // edge-Wang bakent leur bordure sur les 4 arêtes → coutures dans les blocs).
            // Les coins (dont les L intérieurs) se ferment tout seuls : chaque cellule trace
            // ses propres côtés exposés, les bandes voisines se rejoignent au pixel près.
            ctx.fillStyle = roadCol.fill;
            ctx.fillRect(dx, dy, sz, sz);
            const t = Math.max(1, Math.round(sz * 2 / 32));
            ctx.fillStyle = roadCol.edge;
            if (!n) ctx.fillRect(dx, dy, sz, t);
            if (!s) ctx.fillRect(dx, dy + sz - t, sz, t);
            if (!w) ctx.fillRect(dx, dy, t, sz);
            if (!e) ctx.fillRect(dx + sz - t, dy, t, sz);
          } else {
            // Repli (échantillonnage indisponible) : tuiles edge-Wang historiques.
            const m = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
            ctx.drawImage(STREET, (m & 3) * 32, (m >> 2) * 32, 32, 32, dx, dy, sz, sz);
          }
        }
      }
    }
  }

  // ── Terre-plein DÉCORABLE : ruban végétalisé (kerb sombre + gazon + micro-déco
  // déterministe : buissons, fleurs terracotta). Deux sources, calculées en PUR
  // dans layout.js :
  //   • L.median (axes de rang avenue/main) — ruban au CENTRE de la voie, continu
  //     à travers les croisements : c'est la récompense visuelle du palier
  //     « Avenues » (les rangs suivent l'ère, cf. connectorRank) ;
  //   • L.terrePlein — couture entre deux voies EXACTEMENT collées (géométrie rare).
  // Toute déco plus riche (arbres, lampadaires…) itérera ces mêmes entités.
  if (drawStreets && roadCol) {
    const ribbons = [];
    if (Array.isArray(L.terrePlein)) {
      for (const s2 of L.terrePlein) {
        if (s2.axis === 'v') ribbons.push({ v: true, c: (s2.x + 1) * T, a0: s2.y0, a1: s2.y1, id: s2.x * 4 + 1 });
        else ribbons.push({ v: false, c: (s2.y + 1) * T, a0: s2.x0, a1: s2.x1, id: s2.y * 4 + 3 });
      }
    }
    if (L.median && Array.isArray(L.median.segments)) {
      for (const s2 of L.median.segments) {
        ribbons.push({ v: s2.axis === 'v', c: (s2.fixed + 0.5) * T, a0: s2.a0, a1: s2.a1, id: s2.fixed * 4 + (s2.axis === 'v' ? 0 : 2) });
      }
    }
    if (ribbons.length) {
      const gw = Math.max(2, Math.round(sz * 8 / 32));   // largeur du gazon
      const kb = Math.max(1, Math.round(sz * 1 / 32));   // kerb (bordurette)
      const bush = Math.max(2, Math.round(sz * 4 / 32));
      const flw = Math.max(1, Math.round(sz * 2 / 32));
      const h32 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h ^= h >> 13; h = (h * 1274126177) | 0; return (h ^ (h >> 16)) >>> 0; };
      const px = (wx) => Math.floor((wx - CM.cam.x) * z + CM.cw / 2);
      const py = (wy) => Math.floor((wy - CM.cam.y) * z + CM.ch / 2);
      for (const rb of ribbons) {
        const cg = rb.c / T; // colonne/rangée (fractionnaire) du ruban, pour le culling
        if (rb.v) {
          if (cg < gx0 || cg > gx1 + 1 || rb.a1 < gy0 || rb.a0 > gy1) continue;
          const sx = px(rb.c) - (gw >> 1);
          const y0 = py(rb.a0 * T), y1 = py((rb.a1 + 1) * T);
          ctx.fillStyle = roadCol.edge; ctx.fillRect(sx - kb, y0, gw + 2 * kb, y1 - y0);
          ctx.fillStyle = '#586034';    ctx.fillRect(sx, y0 + kb, gw, y1 - y0 - 2 * kb);
          for (let gy = rb.a0; gy <= rb.a1; gy += 1) {
            const h = h32(rb.id, gy);
            const oy = py(gy * T) + ((h >> 8) % Math.max(1, sz - bush));
            if (h % 5 < 2) { ctx.fillStyle = '#3f4a24'; ctx.fillRect(sx + ((gw - bush) >> 1), oy, bush, bush); }
            else if (h % 5 === 2) { ctx.fillStyle = (h & 32) ? '#c96a4a' : '#e8e0cf'; ctx.fillRect(sx + ((gw - flw) >> 1), oy, flw, flw); }
          }
        } else {
          if (cg < gy0 || cg > gy1 + 1 || rb.a1 < gx0 || rb.a0 > gx1) continue;
          const sy = py(rb.c) - (gw >> 1);
          const x0 = px(rb.a0 * T), x1 = px((rb.a1 + 1) * T);
          ctx.fillStyle = roadCol.edge; ctx.fillRect(x0, sy - kb, x1 - x0, gw + 2 * kb);
          ctx.fillStyle = '#586034';    ctx.fillRect(x0 + kb, sy, x1 - x0 - 2 * kb, gw);
          for (let gx = rb.a0; gx <= rb.a1; gx += 1) {
            const h = h32(rb.id, gx);
            const ox = px(gx * T) + ((h >> 8) % Math.max(1, sz - bush));
            if (h % 5 < 2) { ctx.fillStyle = '#3f4a24'; ctx.fillRect(ox, sy + ((gw - bush) >> 1), bush, bush); }
            else if (h % 5 === 2) { ctx.fillStyle = (h & 32) ? '#c96a4a' : '#e8e0cf'; ctx.fillRect(ox, sy + ((gw - flw) >> 1), flw, flw); }
          }
        }
      }
    }
  }

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
