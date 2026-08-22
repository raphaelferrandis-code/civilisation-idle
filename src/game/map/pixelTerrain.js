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

// Préchargement des étages (10 bandes).
for (const st of ROAD_STAGES) ensure(st.name);


// ── TROTTOIR : bande claire sur le bord exposé des rues (curb = liseré sombre existant).
//   Rendu DANS la passe bord de drawPixelTerrain (baké, coût nul par frame). La bande
//   n'apparaît qu'au contact du non-route (côtés !n/!s/!e/!w), donc suit tout le réseau et
//   fusionne sans grille interne, exactement comme le liseré qu'elle remplace.
//   Progressif : rien sur terre/bois/gravier (band < minBand), le trottoir arrive quand la
//   ville se pave. Molettes dev via window.__sidewalk / __sidewalkTune (cf. cityMapRuntime).
export const pixelSidewalkFlag = { on: true };
export const sidewalkTune = { widthK: 5, curbK: 1, desat: 0.55, lift: 0.42, minBand: 3 };

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
