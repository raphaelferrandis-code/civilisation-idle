/* eslint-disable */
import { state } from '../core/state.js';
import { toNum } from '../core/num.js';
import {
  CM,
  CM_WONDERS,
  ROAD_E,
  ROAD_N,
  ROAD_S,
  ROAD_W,
  cmHash,
  cmIsBridgeRoad,
  cmWonderSlot,
  cmWonderActive,
  cmWonderExtent,
  WONDER_CLEAR_R,
  roadWidthFor
} from './layout.js';
import { CM_DIRS, cityMapWalkRoadKey, roadStepAllowed, vehicleLaneOffset, drawNamedAgent, riotEraKey } from './agents.js';
import { worldToScreen as isoWorldToScreen } from './iso/projection.js';
import { mapThemeForBand } from '../data/eraThemes.js';
import { plazaPropReady, plazaPropImage, plazaAnimReady, blitPlazaAnim, blitPlazaProp, setPlazaPropOnLoad } from './plazaProps.js';
import { drawPixelMedians, setMedianOnLoad } from './pixelMedian.js';
import { setRoadPavingOnLoad } from './roadPaving.js';

// La dalle de sol des places est cuite dans le cache STATIQUE de la carte
// (cityMapDrawPlazaSurface). Ses tuiles se chargent en asynchrone : dès qu'une
// tuile finit de décoder, on invalide le cache statique pour qu'il se re-cuise
// avec la dalle (sinon le sol reste figé sur la couleur de repli). Cf. le garde
// équivalent du terrain (CM._groundBakeStable).
setPlazaPropOnLoad(() => { if (CM) CM._staticBake = null; });
// Idem pour le terre-plein planté pixel : baké dans le cache STATIQUE (routes non-pixel)
// OU dans le cache SOL (routes pixel, via pixelTerrain) → invalider les DEUX au décodage.
setMedianOnLoad(() => { if (CM) { CM._staticBake = null; CM._groundBake = null; } });
// La chaussée matière-pont (roadPaving) est bakée dans le cache SOL (pixelTerrain) :
// dès qu'une matière de pont est extraite, invalider le cache SOL pour re-cuire les
// routes avec la texture (sinon elles restent sur l'aplat plat de repli).
setRoadPavingOnLoad(() => { if (CM) CM._groundBake = null; });

/* ---- legacy citymap rendering\draw-utils.js ---- */


/* ============================================================================
 * citymap-draw-utils.js - Petits helpers visuels partages par les renderers.
 *   Pas de boucle, pas de listeners, pas de gros rendu de scene.
 * ============================================================================ */

function baseColor() {
  // Couleur de repli neutre pour les tuiles décoratives (habitations).
  return "#8b6914";
}

function cmLitColor(band) {
  return CM.cmLitColorStr || `rgba(255,204,68,0.32)`;
}

// ── Émission lumineuse : halo radial ADDITIF, mis en cache par couleur ──────
// Un seul créateRadialGradient par teinte (sprite offscreen 64px), puis un
// drawImage en "lighter" par point de lumière — une vraie lumière, pas un
// aplat. L'appelant module l'alpha par CM.nightF.
const CM_GLOW_SPRITES = new Map();
function cmGlowSprite(r, g, b) {
  const key = r + "," + g + "," + b;
  let c = CM_GLOW_SPRITES.get(key);
  if (!c) {
    const SZ = 64;
    c = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(SZ, SZ)
      : (() => { const el = document.createElement("canvas"); el.width = SZ; el.height = SZ; return el; })();
    const g2 = c.getContext("2d");
    const grad = g2.createRadialGradient(SZ / 2, SZ / 2, 0, SZ / 2, SZ / 2, SZ / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},0.4)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    g2.fillStyle = grad;
    g2.fillRect(0, 0, SZ, SZ);
    CM_GLOW_SPRITES.set(key, c);
  }
  return c;
}
function cmDrawGlow(ctx, x, y, radius, r, g, b, alpha) {
  if (alpha <= 0.015 || radius < 0.5) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(cmGlowSprite(r, g, b), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prev;
}

function cmRoadPalette(eraIndex, major, ruined) {
  if (ruined) {
    return {
      base: major ? "#29251c" : "#242119",
      core: major ? "#5d5646" : "#4d4739",
      edge: "rgba(32,24,16,0.45)",
      line: "rgba(115,104,82,0.38)",
      detail: "rgba(83,105,58,0.5)",
      track: "rgba(28,22,15,0.65)"
    };
  }
  if (eraIndex >= 18) {
    return {
      base: major ? "#4c4638" : "#443f34",
      core: major ? "#706852" : "#625b49",
      edge: "rgba(34,30,22,0.42)",
      line: "rgba(224,205,142,0.34)",
      detail: "rgba(230,214,160,0.24)",
      track: "rgba(55,43,25,0.35)"
    };
  }
  if (eraIndex >= 14) {
    return {
      base: major ? "#514936" : "#463f31",
      core: major ? "#786b4c" : "#695d45",
      edge: "rgba(43,34,22,0.42)",
      line: "rgba(220,202,120,0.34)",
      detail: "rgba(210,190,130,0.22)",
      track: "rgba(55,43,25,0.38)"
    };
  }
  if (eraIndex >= 11) {
    return {
      base: major ? "#6b5f43" : "#5b5038",
      core: major ? "#817354" : "#706449",
      edge: "rgba(54,43,27,0.38)",
      line: "rgba(218,190,105,0.42)",
      detail: "rgba(228,207,151,0.22)",
      track: "rgba(72,56,34,0.34)"
    };
  }
  if (eraIndex >= 7) {
    return {
      base: major ? "#5c5037" : "#51442e",
      core: major ? "#746342" : "#66573a",
      edge: "rgba(58,47,31,0.36)",
      line: "rgba(185,155,82,0.36)",
      detail: "rgba(214,190,132,0.2)",
      track: "rgba(64,48,29,0.34)"
    };
  }
  if (eraIndex >= 3) {
    return {
      base: major ? "#5a4728" : "#4c3b24",
      core: major ? "#795f38" : "#684f30",
      edge: "rgba(47,37,24,0.34)",
      line: "rgba(132,96,48,0.34)",
      detail: "rgba(176,136,72,0.2)",
      track: "rgba(58,42,23,0.34)"
    };
  }
  return {
    base: "#334020",
    core: major ? "#7a6035" : "#6c5531",
    edge: "rgba(31,39,18,0.34)",
    line: "rgba(125,96,50,0.45)",
    detail: "rgba(108,135,58,0.35)",
    track: "rgba(62,45,24,0.34)"
  };
}

function getRoadVisualStyle(eraIndex, rank, ruined, major) {
  const palette = cmRoadPalette(eraIndex, major || rank === "main", ruined);
  // Hiérarchie viaire lisible d'un coup d'œil : sentier discret (presque un
  // trait) → rue → avenue → boulevard large et pavé. L'écart entre rangs est
  // volontairement marqué — c'est lui qui structure la lecture de la ville.
  // avenue/main sont volontairement larges aux ères modernes : il faut la place
  // pour une coupe divisée (rive | voie | terre-plein | voie | rive) sans déborder
  // de la cellule (< 1 tuile). Sentier/rue restent fins.
  const widthByRank = {
    path: roadWidthFor("path", eraIndex),
    secondary: roadWidthFor("secondary", eraIndex),
    avenue: roadWidthFor("avenue", eraIndex),
    main: roadWidthFor("main", eraIndex)
  };
  const detailRate = rank === "main" ? 5 : rank === "avenue" ? 7 : rank === "secondary" ? 9 : 13;
  return {
    palette,
    width: widthByRank[rank] || widthByRank.secondary,
    detailRate,
    borderStrength: rank === "main" ? 1.2 : rank === "avenue" ? 0.85 : rank === "secondary" ? 0.5 : 0.2
  };
}

/* ---- legacy citymap rendering\ground.js ---- */


/* ============================================================================
 * citymap-render-ground.js - Rendu du fond de carte Canvas.
 *   Sol, masse urbaine, fleuve, foret, vestiges et voile nocturne.
 * ============================================================================ */

const CITY_MAP_GREENS = ["#2d5a1b", "#3a6b22", "#4a7a2a", "#255018", "#1e4010", "#3d7220", "#5a8c2e", "#223d14"];

// ── Arbres pixel-art (objets « map object » PixelLab, vue low top-down) ───────
// Fichier : pixelart/trees/tree-{kind}.png (1 frame 96px, pied du tronc en bas du
// cadre). 5 essences : oak/pine/birch/shrub (vivantes) + dead (déclin/ruine). Le
// PLACEMENT, l'échelle (r) et l'ombre restent procéduraux (cf. cityMapDrawTrees) ;
// seul le dessin de l'arbre devient un sprite. Tirage d'essence par arbre au hash.
// Repli procédural PAR ARBRE si le sprite n'est pas (encore) chargé.
// FILL = hauteur de dessin / r (le cadre 96² est rempli à ~85 %) — réglé au ressenti.
const TREE_FILL = { oak: 3.25, pine: 3.75, birch: 3.5, shrub: 2.25, dead: 3.25 };
const TREE_FOOT = 0.92;   // ligne de sol = cy + r*TREE_FOOT (bas du sprite)
let TREE_SCALE = 1;       // multiplicateur global de taille (réglage live __treeScale)
// Masse forestière : les fourrés denses (≥2 voisins boisés) sont rendus en
// canopées PLATES qui se chevauchent → masse continue (≠ arbres détaillés isolés,
// gardés pour la diversité de la frange/des arbres seuls). 2 teintes au hash.
let CANOPY_SIZE = 1.8;    // diamètre du dôme en tuiles (overlap ⇒ masse)
let CANOPY_LIFT = 0.75;   // remonte le dôme (tuiles) ⇒ place pour les troncs de frange
let TRUNK_LEN = 0.26;     // longueur VISIBLE du tronc de frange (tuiles) — court & trapu
let TRUNK_W = 0.30;       // épaisseur du tronc (tuiles)
let pixelTreesOn = true;  // sprites ON ; OFF ⇒ repli procédural total (__pixelTrees)
let FOREST_SOL_RING = 1;       // anneau de cellules d'herbe mini entre la forêt dense et le VRAI sol (layout.urbanSet)
let FOREST_SOL_MARGIN = 1.12;  // ×rayon du « sol » (REPLI ellipse seulement, si urbanSet absent) : forêt repoussée au-delà
const treeImg = {};
function ensureTree(kind) {
  let c = treeImg[kind];
  if (c) return c;
  c = { img: null, ready: false };
  treeImg[kind] = c;
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => { c.ready = true; };
    im.src = '/pixelart/trees/tree-' + kind + '.png';
    c.img = im;
  }
  return c;
}
const treeReady = (c) => !!c && c.ready && c.img && c.img.naturalWidth > 0;
// Essence d'un arbre : 'dead' prioritaire (déclin), sinon conifère (~1/5 hors
// lisière, comme le procédural), sinon feuillu/buisson. Lisière = plus de buissons.
function treeKindFor(t) {
  if (t.dead) return 'dead';
  if (!t.edge && (t.h % 5) === 0) return 'pine';
  const m = t.h % 4;
  if (t.edge) return m === 0 ? 'shrub' : m === 1 ? 'birch' : 'oak';
  return m === 0 ? 'birch' : m === 1 ? 'shrub' : 'oak';
}
for (const k of ['oak', 'pine', 'birch', 'shrub', 'dead', 'canopy', 'canopy2']) ensureTree(k);  // préchargement
if (typeof window !== 'undefined') {
  window.__treeScale = (m) => { TREE_SCALE = +m || 1; };
  window.__canopy = (size, lift) => { if (size != null) CANOPY_SIZE = +size; if (lift != null) CANOPY_LIFT = +lift; };
  window.__trunk = (len, w) => { if (len != null) TRUNK_LEN = +len; if (w != null) TRUNK_W = +w; };
  window.__pixelTrees = (on) => { pixelTreesOn = on !== false; };
  window.__forestSol = (m) => { FOREST_SOL_MARGIN = (m == null ? 1.12 : +m); CM._staticBake = null; }; // re-bake : ellipse de REPLI (urbanSet absent)
  window.__forestRing = (n) => { FOREST_SOL_RING = (n == null ? 1 : Math.max(0, Math.round(+n))); CM._staticBake = null; }; // re-bake : tampon d'herbe forêt↔sol
}

// Mélange linéaire de deux couleurs [r,g,b] — t=0 → a, t=1 → b.
function cmLerpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

// Sol urbain par ère : terre battue → pavé chaud → pierre claire → asphalte.
// La santé tire vers le brun terne : le brun est un signal de crise, pas
// l'état par défaut d'une grande ville.
function cmUrbanGroundRgb(band, health) {
  // Teinte de sol par époque : centralisée dans eraThemes.js.
  const byBand = mapThemeForBand(band).urbanGround;
  const sick = [62, 50, 30];                   // brun-crotte de crise
  const k = 1 - Math.max(0, Math.min(1, (health - 0.18) / 0.5)); // 0 sain → 1 malade
  return cmLerpRgb(byBand, sick, k * 0.85);
}

function cityMapDrawUrbanMass(layout) {
  if (!layout || layout.counts.eraBand < 2) return;
  const ctx = CM.ctx;
  // Le halo urbain suit le cœur de ville du plan procédural (pas le centre de grille).
  const coreX = layout.plan?.core?.x ?? layout.cx;
  const coreY = layout.plan?.core?.y ?? layout.cy;
  const worldCx = coreX * CM.TILE;
  const worldCy = coreY * CM.TILE;
  const rx = Math.min(layout.gridN * CM.TILE * 0.49, (6 + layout.counts.eraIndex * 3.8 + layout.counts.urbanTier * 7) * CM.TILE);
  const ry = rx * 0.78;
  const sx = (worldCx - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (worldCy - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const [ur, ug, ub] = cmUrbanGroundRgb(layout.counts.eraBand, CM.healthF);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, rx * CM.cam.zoom));
  g.addColorStop(0, `rgba(${ur},${ug},${ub},0.62)`);
  g.addColorStop(0.58, `rgba(${Math.round(ur * 0.8)},${Math.round(ug * 0.8)},${Math.round(ub * 0.8)},0.4)`);
  g.addColorStop(1, "rgba(42,33,20,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx * CM.cam.zoom, ry * CM.cam.zoom, 0, 0, Math.PI * 2);
  ctx.fill();
}

function cityMapDrawGround(layout) {
  const ctx = CM.ctx;
  const tier = layout?.counts?.eraIndex || 0;
  ctx.fillStyle = mapThemeForBand(layout?.counts?.eraBand || 0).wildGround;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (!layout || layout.counts.eraBand <= 1) return;
  const sx = ((layout.plan?.core?.x ?? layout.cx) * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = ((layout.plan?.core?.y ?? layout.cy) * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const radius = (10 + tier * 12) * CM.TILE * CM.cam.zoom;
  const [ur, ug, ub] = cmUrbanGroundRgb(layout.counts.eraBand, CM.healthF);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, radius));
  g.addColorStop(0, `rgba(${ur},${ug},${ub},0.55)`);
  g.addColorStop(0.45, `rgba(${Math.round(ur * 0.78)},${Math.round(ug * 0.78)},${Math.round(ub * 0.78)},0.34)`);
  g.addColorStop(1, "rgba(45,58,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
}

/* ============================================================================
 * Relief en trompe-l'œil — PROTOTYPE (option B)
 *   La carte reste une grille plate vue de dessus. On ne FABRIQUE pas de vraie
 *   altitude : on peint un *hillshade* (ombrage de pente) discret en soft-light
 *   UNIQUEMENT sur le sol sauvage hors du cœur urbain + les berges du fleuve.
 *   La ville (routes droites, bâtiments alignés) reste plate — sinon le relief
 *   peint lirait comme un papier peint sous des objets plats.
 *
 *   Technique : champ de hauteur H(gx,gy) = vallée du fleuve + bruit de collines
 *   (atténué dans la ville). On rend un petit buffer basse résolution (1 texel ≈
 *   TERR_TEXEL px), recalculé seulement quand la caméra/le plan bouge, puis blit
 *   upscalé (lissage bilinéaire = pentes douces) en composite "soft-light".
 *   Curseurs en tête de fonction pour ajuster l'intensité.
 * ============================================================================ */
const CM_TERRAIN = { buf: null, bctx: null, W: 0, H: 0, key: "" };

// Hash entier 2D sans allocation (≠ cmHash qui concatène une chaîne) : sûr en
// boucle chaude sur des milliers de texels par recalcul.
function cmIHash2(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 73856093) ^ Math.imul(iy | 0, 19349663) ^ (seed | 0)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}
// Value-noise 2D lissé (smoothstep) sur réseau entier — ondulations continues.
function cmValueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = cmIHash2(xi, yi, seed),     b = cmIHash2(xi + 1, yi, seed);
  const c = cmIHash2(xi, yi + 1, seed), d = cmIHash2(xi + 1, yi + 1, seed);
  const ab = a + (b - a) * u, cd = c + (d - c) * u;
  return ab + (cd - ab) * v; // 0..1
}

function cityMapDrawTerrain() {
  const L = CM.layout;
  if (!L) return;

  // ── Curseurs (à régler à l'œil) ──────────────────────────────────────────
  const TERR_TEXEL   = 9;    // px écran par texel du buffer (petit = plus net, + cher)
  const HILL_AMP     = 1.35; // amplitude des collines (unités-tuile arbitraires)
  const HILL_BIG     = 9.0;  // taille des grandes ondulations (tuiles)
  const HILL_DETAIL  = 3.3;  // taille du détail (tuiles)
  const VALLEY_AMP   = 1.25; // creux de la vallée du fleuve
  const VALLEY_WIDTH = 6.5;  // largeur du flanc de vallée (tuiles)
  const CONTRAST     = 115;  // écart de gris du hillshade (0..255 autour de 128)
  const STRENGTH     = 0.55; // intensité globale du soft-light (0 = rien)

  const z = CM.cam.zoom, T = CM.TILE;
  const seed = (state && state.mapSeed) ? (state.mapSeed | 0) : 1234567;
  const eraIndex = (L.counts && L.counts.eraIndex) || 0;
  const urbanTier = (L.counts && L.counts.urbanTier) || 0;
  const coreX = (L.plan && L.plan.core ? L.plan.core.x : L.cx);
  const coreY = (L.plan && L.plan.core ? L.plan.core.y : L.cy);
  // Rayon « plat » : on calque sur le halo urbain (cf. cityMapDrawUrbanMass) pour
  // que les collines ne démarrent qu'au-delà de la masse bâtie.
  const flatR = 6 + eraIndex * 3.8 + urbanTier * 7;
  const fadeEnd = flatR + 8;
  const river = L.river;
  const hasRiver = !!(river && river.present);
  const riverYAt = hasRiver && river.riverYAt ? river.riverYAt : null;

  // smoothstep(edge0, edge1, x)
  const ss = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / Math.max(0.0001, e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const hillStrengthAt = (gx, gy) => ss(flatR, fadeEnd, Math.hypot(gx - coreX, gy - coreY));
  const valleyHAt = (gx, gy) => {
    if (!riverYAt) return 0;
    const d = Math.abs(gy - riverYAt(gx));
    return VALLEY_AMP * Math.min(1, d / VALLEY_WIDTH); // 0 au fleuve → plateau au loin
  };
  // Champ de hauteur : vallée (toujours) + collines atténuées dans la ville.
  const heightAt = (gx, gy) => {
    const hs = hillStrengthAt(gx, gy);
    let hills = 0;
    if (hs > 0.001) {
      hills = (cmValueNoise(gx / HILL_BIG, gy / HILL_BIG, seed) * 0.7
        + cmValueNoise(gx / HILL_DETAIL, gy / HILL_DETAIL, seed + 101) * 0.3) * HILL_AMP * hs;
    }
    return valleyHAt(gx, gy) + hills;
  };
  // Présence (alpha) : périphérie (collines) OU proximité du fleuve (vallée).
  const presenceAt = (gx, gy) => {
    const hill = hillStrengthAt(gx, gy);
    let valley = 0;
    if (riverYAt) valley = Math.max(0, 1 - Math.abs(gy - riverYAt(gx)) / (VALLEY_WIDTH + 1.5)) * 0.7;
    return Math.min(1, Math.max(hill, valley));
  };

  // ── Buffer basse résolution (recalcul mis en cache sur la clé caméra/plan) ─
  const W = Math.max(2, Math.ceil(CM.cw / TERR_TEXEL));
  const H = Math.max(2, Math.ceil(CM.ch / TERR_TEXEL));
  const key = `${Math.round(CM.cam.x)}:${Math.round(CM.cam.y)}:${z.toFixed(3)}:${CM.layoutRecomputeAt}:${W}x${H}`;
  if (key !== CM_TERRAIN.key || !CM_TERRAIN.buf) {
    if (!CM_TERRAIN.buf || CM_TERRAIN.W !== W || CM_TERRAIN.H !== H) {
      CM_TERRAIN.buf = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(W, H)
        : (() => { const el = document.createElement("canvas"); el.width = W; el.height = H; return el; })();
      CM_TERRAIN.buf.width = W; CM_TERRAIN.buf.height = H;
      CM_TERRAIN.bctx = CM_TERRAIN.buf.getContext("2d");
      CM_TERRAIN.W = W; CM_TERRAIN.H = H;
    }
    const bctx = CM_TERRAIN.bctx;
    const img = bctx.createImageData(W, H);
    const data = img.data;
    const dd = 0.8; // pas de différence finie pour la pente (tuiles)
    // texel → écran → monde(tuiles)
    const sxPerTexel = CM.cw / W, syPerTexel = CM.ch / H;
    const worldGxAt = (px) => ((px - CM.cw / 2) / z + CM.cam.x) / T;
    const worldGyAt = (py) => ((py - CM.ch / 2) / z + CM.cam.y) / T;
    for (let ty = 0; ty < H; ty += 1) {
      const gy = worldGyAt((ty + 0.5) * syPerTexel);
      for (let tx = 0; tx < W; tx += 1) {
        const gx = worldGxAt((tx + 0.5) * sxPerTexel);
        const a = presenceAt(gx, gy);
        const o = (ty * W + tx) * 4;
        if (a <= 0.003) { data[o + 3] = 0; continue; }
        // Pente : lumière en haut-gauche (cohérent avec les ombres d'arbres/murs).
        const dHdx = heightAt(gx + dd, gy) - heightAt(gx - dd, gy);
        const dHdy = heightAt(gx, gy + dd) - heightAt(gx, gy - dd);
        const shade = dHdx + dHdy; // >0 face à la lumière (clair), <0 ombre
        let grey = 128 + shade * CONTRAST;
        grey = grey < 0 ? 0 : grey > 255 ? 255 : grey;
        data[o] = data[o + 1] = data[o + 2] = grey;
        data[o + 3] = Math.round(a * 255);
      }
    }
    bctx.putImageData(img, 0, 0);
    CM_TERRAIN.key = key;
  }

  // Blit upscalé + lissé (pentes douces) en soft-light : gris 128 = neutre,
  // >128 éclaire le sol, <128 l'assombrit.
  const ctx = CM.ctx;
  const prevOp = ctx.globalCompositeOperation;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = STRENGTH;
  ctx.drawImage(CM_TERRAIN.buf, 0, 0, CM.cw, CM.ch);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prevOp;
  ctx.imageSmoothingEnabled = prevSmooth;
}

// Normale unitaire au sample i du fleuve (perpendiculaire à la tangente locale).
// Helper partagé par le fleuve, le gating des quais et le tracé des quais.
function cmRiverNormalAt(sm, i) {
  const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
  let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1;
  return { nx: -ty / tl, ny: tx / tl };
}

// Gating des quais : pour chaque sample du fleuve et chaque rive (+n / -n), la berge
// est-elle "urbaine" (proche d'une route) ? Calculé UNE fois par layout (clé =
// CM.layoutRecomputeAt), jamais par frame. Sert au tracé (cityMapDrawQuays) ET à
// retirer les roseaux sous le quai (boucle roseaux de cityMapDrawRiver).
// NB : gating PUR (urbain ou non) — la décision de dessiner dépend de l'ère/usure,
// évaluée par frame côté appelant (pas figée dans ce cache).
const QUAY_GATE_LAND = 1.0;   // échantillonnage : ~1 tuile au-delà du bord d'eau
function ensureQuayGate() {
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) { CM.quayGate = null; CM.quayBankCells = null; return; }
  if (CM.quayGate && CM.quayGate.key === CM.layoutRecomputeAt) return;
  const sm = L.river.samples, n0 = sm.length, roadSet = L.roadSet;
  const urbanAt = (px, py) => {
    if (!roadSet) return false;
    const cgx = Math.floor(px), cgy = Math.floor(py);
    for (let dx = -1; dx <= 1; dx += 1)
      for (let dy = -1; dy <= 1; dy += 1)
        if (roadSet.has((cgx + dx) + "," + (cgy + dy))) return true;
    return false;
  };
  const rawPlus = new Uint8Array(n0), rawMinus = new Uint8Array(n0);
  for (let i = 0; i < n0; i += 1) {
    const n = cmRiverNormalAt(sm, i), s = sm[i];
    for (let si = 0; si < 2; si += 1) {
      const side = si ? -1 : 1;
      const ewx = s.x + side * n.nx * s.hw, ewy = s.y + side * n.ny * s.hw;            // bord d'eau peint
      const lndx = ewx + side * n.nx * QUAY_GATE_LAND, lndy = ewy + side * n.ny * QUAY_GATE_LAND; // côté terre
      (si ? rawMinus : rawPlus)[i] = (urbanAt(ewx, ewy) || urbanAt(lndx, lndy)) ? 1 : 0;
    }
  }
  // Lissage : dilatation rayon 1 (continuité) + purge des runs d'un seul sample.
  const smoothSide = (arr) => {
    const d = new Uint8Array(n0);
    for (let i = 0; i < n0; i += 1) d[i] = (arr[i] || (i > 0 && arr[i - 1]) || (i < n0 - 1 && arr[i + 1])) ? 1 : 0;
    let i = 0;
    while (i < n0) {
      if (!d[i]) { i += 1; continue; }
      let j = i; while (j + 1 < n0 && d[j + 1]) j += 1;
      if (j === i) d[i] = 0;   // run d'un seul sample -> off
      i = j + 1;
    }
    return d;
  };
  const plus = smoothSide(rawPlus), minus = smoothSide(rawMinus);
  // Les RIVERAINS (port/moulin) INTERROMPENT le quai sur leur emprise : leur
  // scène pose son propre front d'eau (ponton, roue à aubes) — la promenade
  // passait sous la roue du moulin (vu à la capture iso, vrai aussi en legacy).
  for (const t of (L.tiles || [])) {
    if (t.buildingId !== "river_ports" && t.buildingId !== "water_mills") continue;
    const x0 = t.gx - 0.5, x1 = t.gx + (t.spanX || t.size || 1) + 0.5;
    for (let i = 0; i < n0; i += 1) {
      if (sm[i].x >= x0 && sm[i].x <= x1) { plus[i] = 0; minus[i] = 0; }
    }
  }
  // Cellules couvertes par le quai -> pas de roseaux dessus.
  const bankCells = new Set();
  for (let i = 0; i < n0; i += 1) {
    const n = cmRiverNormalAt(sm, i), s = sm[i];
    for (let si = 0; si < 2; si += 1) {
      if (!(si ? minus : plus)[i]) continue;
      const side = si ? -1 : 1;
      for (const off of [s.hw, s.hw + QUAY_GATE_LAND * 0.5, s.hw + QUAY_GATE_LAND])
        bankCells.add(Math.floor(s.x + side * n.nx * off) + "," + Math.floor(s.y + side * n.ny * off));
    }
  }
  CM.quayGate = { key: CM.layoutRecomputeAt, plus, minus };
  CM.quayBankCells = bankCells;
}

// Réglage molette du BORD de quai (berge maçonnée, cf. drawRun dans cityMapDrawQuays) :
// window.__quayWall({ on, full, heightK, joints, light }). Quai LIVE → pas de rebake.
//   full: true  → berge maçonnée TOUT LE LONG de l'eau (2 rives, sauf port/moulin)
//   full: false → seulement le long des berges URBAINES (proches d'une route)
//   light: 0..1 → éclaircit la pierre (fondu vers le blanc) — dessus + parement + margelle
export const quayWallTune = { on: true, full: true, heightK: 1, joints: true, light: 0.16 };

// Éclaircit une couleur "#rrggbb" en la fondant vers le blanc de `t` (0..1) → "rgb(...)".
// Sert à rendre la berge maçonnée « un peu plus claire » sans retoucher chaque teinte d'ère.
function lightenHex(hex, t) {
  if (!t || typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  const L = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${L((n >> 16) & 255)},${L((n >> 8) & 255)},${L(n & 255)})`;
}

// Quais : berge construite (promenade + lèvre humide) là où la ville borde l'eau.
// Tracé en SUIVANT le ruban lisse (samples + normale), exactement comme le fleuve —
// JAMAIS par cellule (le bankSet diverge du bleu peint dans les courbes => escalier).
// Dessiné live, juste après le fleuve et avant les bateaux/le blit statique
// (ponts/routes/bâtiments le recouvrent donc gratuitement aux croisements).
function cityMapDrawQuays(now) {
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) return;
  const band = L.counts ? (L.counts.eraBand | 0) : 0;
  if (band <= 1) return;                                   // campement primitif : pas de quai
  if (CM.collapseAt || (state.timeWear || 0) > 0.7) return; // fleuve ruiné : pas de quai
  ensureQuayGate();
  const g = CM.quayGate;
  if (!g) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE, sm = L.river.samples, n0 = sm.length;
  const night = CM.nightF || 0;
  const lod = CM.lodActive;          // zoom lointain : strates seules, pas de mobilier/joints

  // Style de quai par ère : promenade qui évolue pierre -> marbre -> béton/fonte ->
  // néon -> énergie cosmique. (Palette cosmique inlinée pour éviter un import croisé.)
  const COSMIC = {
    7: { mid: "#1d5640", core: "#0c241a", glow: "90,240,180" },
    8: { mid: "#4a3a1c", core: "#221808", glow: "255,205,120" },
    9: { mid: "#322a52", core: "#161226", glow: "170,140,255" }
  };
  // Style par ère. `coping`/`wallTop`/`wallBot`/`wallJoint`/`wallTiles` = la BERGE
  // MAÇONNÉE (mur du bord d'eau, cf. drawRun) : margelle claire + parement
  // haut→bas + joints d'assise + hauteur (en tuiles).
  let st;
  if (band <= 4) {                   // pierre (2-3) / marbre (4)
    const marble = band >= 4;
    st = {
      W: 0.7, walk: marble ? "#cdc6b2" : "#a89a78", face: marble ? "#8f8770" : "#6e6044",
      lip: "rgba(0,0,0,0.40)", edge: marble ? "rgba(255,250,235,0.30)" : "rgba(255,240,205,0.20)",
      rail: null, joints: "rgba(0,0,0,0.16)", lamp: "255,214,150", glow: null,
      coping: marble ? "#ece6d6" : "#d8cfb4", wallTop: marble ? "#b3ab92" : "#8a7f60",
      wallBot: marble ? "#6f684f" : "#4e4230", wallJoint: "rgba(0,0,0,0.30)", wallTiles: marble ? 0.70 : 0.66
    };
  } else if (band <= 6) {            // fonte (5) / néon (6)
    const neon = band >= 6;
    st = {
      W: 0.85, walk: neon ? "#6f7480" : "#827a6e", face: neon ? "#3e424c" : "#4f4940",
      lip: "rgba(0,0,0,0.44)", edge: "rgba(222,230,240,0.16)",
      rail: "rgba(16,20,26,0.85)", joints: null, lamp: neon ? "150,225,255" : "255,208,150",
      glow: neon ? "120,220,255" : null,
      coping: neon ? "#8f99a8" : "#9c968c", wallTop: neon ? "#40444e" : "#5f5a52",
      wallBot: neon ? "#202329" : "#302c26", wallJoint: "rgba(0,0,0,0.34)", wallTiles: 0.75
    };
  } else {                           // cosmique 7-9 : quai d'énergie
    const cp = COSMIC[band] || COSMIC[9];
    st = { W: 0.9, walk: cp.mid, face: cp.core, lip: "rgba(0,0,0,0.45)", edge: null, rail: null, joints: null, lamp: cp.glow, glow: cp.glow,
      coping: cp.mid, wallTop: cp.core, wallBot: "#0a0a12", wallJoint: "rgba(0,0,0,0.30)", wallTiles: 0.75 };
  }
  const W = st.W, faceW = W * 0.30;  // bande côté eau (ombre) vs promenade (côté terre)

  // Effilement smoothstep aux deux bouts d'un run (hauteur/largeur -> 0) : fondu DOUX
  // aux interruptions EN VILLE (port/moulin) — retour Raph « c'était plus fluide quand
  // c'était affiné ». Le SPIKE de la source est évité autrement (skip QUAY_END/QUAY_MIN_HW
  // dans le gate + bas-fond à offset CONSTANT), PAS en retirant l'effilement.
  const TAPER = 2;
  // Effilement ASYMÉTRIQUE : on n'effile un bout QUE s'il borde une INTERRUPTION EN
  // VILLE (port/moulin) → fondu DOUX voulu par Raph. Aux bouts bordant une berge
  // NATURELLE (source/embouchure/fleuve étroit), PAS d'effilement → fin carrée nette,
  // pas de POINTE fuyante. `ctaperA/ctaperB` sont posés par drawRun d'après `naturalOff`.
  let ctaperA = true, ctaperB = true, naturalOff = null;
  const tt = (i, a, b) => {
    const dA = ctaperA ? (i - a) : 1e9, dB = ctaperB ? (b - i) : 1e9;
    const t = Math.max(0, Math.min(1, Math.min(dA, dB) / TAPER));
    return t * t * (3 - 2 * t);
  };
  // Point écran à l'offset additif `base` (tapered) du sample i, sur la rive `side`.
  // Projection via le module iso (IDENTITÉ quand CM.iso off) → les quais suivent
  // le ruban dans les DEUX modes ; appelé aussi par drawIsoWorld en Phase 5.
  const pt = (i, side, base, tap) => {
    const s = sm[i], n = cmRiverNormalAt(sm, i), off = s.hw + base * tap;
    const q = isoWorldToScreen((s.x + side * n.nx * off) * T, (s.y + side * n.ny * off) * T);
    return [q.x, q.y];
  };
  const fillStrip = (a, b, side, baseIn, baseOut, col) => {
    ctx.beginPath();
    for (let i = a; i <= b; i += 1) { const p = pt(i, side, baseIn, tt(i, a, b)); if (i === a) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    for (let i = b; i >= a; i -= 1) { const p = pt(i, side, baseOut, tt(i, a, b)); ctx.lineTo(p[0], p[1]); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  const strokeAt = (a, b, side, base, col, lw, additive) => {
    if (!col) return;
    if (additive) { ctx.save(); ctx.globalCompositeOperation = "lighter"; }
    ctx.beginPath();
    for (let i = a; i <= b; i += 1) { const p = pt(i, side, base, tt(i, a, b)); if (i === a) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
    if (additive) ctx.restore();
  };

  const wallOn = quayWallTune.on;
  const drawRun = (a, b, side) => {
    // Effiler un bout SEULEMENT s'il borde une interruption VILLE (port/moulin), pas
    // une berge naturelle (source/étroit) : `naturalOff[a-1|b+1]` distingue les deux.
    ctaperA = a > 0 && naturalOff ? !naturalOff[a - 1] : (a > 0);
    ctaperB = b < n0 - 1 && naturalOff ? !naturalOff[b + 1] : (b < n0 - 1);
    // Pierre éventuellement ÉCLAIRCIE (quayWallTune.light) : dessus + parement + margelle.
    const LT = quayWallTune.light;
    const cWalk = lightenHex(st.walk, LT), cCop = lightenHex(st.coping, LT);
    const cWallTop = lightenHex(st.wallTop, LT), cWallBot = lightenHex(st.wallBot, LT);
    // 1) DESSUS PLAT de la berge (uniforme jusqu'au bord d'eau, offset 0..W).
    fillStrip(a, b, side, 0, W, cWalk);

    // 2) MUR DU BORD (berge maçonnée façon TheoTown). L'axe VERTICAL du monde se
    // projette en Z-écran pur (screen-Y vers le bas) → un parement vertical est un
    // ruban qui "pend" sous la margelle, quelle que soit la rive. Il n'est visible
    // que sur la rive dont l'EAU est DEVANT (plus bas à l'écran) ; l'autre rive
    // n'en montre que la margelle (son parement est occulté par sa promenade).
    // waterBelow(i) : au sample i, l'eau est-elle "devant" (plus bas à l'écran) ?
    // Évalué PAR SAMPLE (robuste aux courbes ET aux longues berges "full") → on ne
    // dessine le parement que sur les sous-tronçons où c'est vrai ; l'autre rive
    // n'a que la margelle (parement occulté par sa propre promenade).
    if (wallOn && !lod) {
      const wh = st.wallTiles * quayWallTune.heightK * T * z;   // hauteur écran du parement
      const N = b - a + 1;
      // wbelow par sample (l'eau est "devant" = plus bas à l'écran) → robuste courbes/full.
      const wbel = new Uint8Array(N);
      for (let i = a; i <= b; i += 1) wbel[i - a] = pt(i, side, -0.3, 1)[1] > pt(i, side, 0.3, 1)[1] ? 1 : 0;
      // Hauteur ÉCRAN du mur par sample (0 hors sous-tronçon waterBelow ; taperée aux bouts).
      const wallH = new Float32Array(N);
      { let i = 0; while (i < N) { if (!wbel[i]) { i += 1; continue; } let j = i; while (j + 1 < N && wbel[j + 1]) j += 1; for (let k = i; k <= j; k += 1) wallH[k] = wh * tt(a + k, a + i, a + j); i = j + 1; } }
      const drawWallSeg = (sa, sb) => {
        // Haut du mur (bord d'eau) + hauteur locale : LIT wallH[] (source de vérité
        // UNIQUE, partagée avec le liseré) — ne PAS recalculer un taper local, sinon
        // mur dessiné et liseré divergent (liseré « fantôme » sous l'eau, vu par Raph).
        const wp = [];
        for (let i = sa; i <= sb; i += 1) { const tp = pt(i, side, 0, 1); wp.push([tp[0], tp[1], wallH[i - a]]); }
        // Parement en 2 assises : haut clair -> bas sombre (lecture de profondeur).
        for (const seg of [[0, 0.5, cWallTop], [0.5, 1, cWallBot]]) {
          ctx.beginPath();
          for (let k = 0; k < wp.length; k += 1) { const p = wp[k], y = p[1] + p[2] * seg[0]; if (k === 0) ctx.moveTo(p[0], y); else ctx.lineTo(p[0], y); }
          for (let k = wp.length - 1; k >= 0; k -= 1) { const p = wp[k]; ctx.lineTo(p[0], p[1] + p[2] * seg[1]); }
          ctx.closePath(); ctx.fillStyle = seg[2]; ctx.fill();
        }
        // Joints d'assise verticaux (tous les ~2 samples, hors bouts effilés).
        if (quayWallTune.joints) {
          ctx.strokeStyle = st.wallJoint; ctx.lineWidth = Math.max(1, z * 0.5);
          for (let k = 0; k < wp.length; k += 2) { const p = wp[k]; if (p[2] < wh * 0.5) continue; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] + p[2]); ctx.stroke(); }
        }
        // Ombre de contact à la BASE du mur (le pied dans l'eau).
        ctx.strokeStyle = "rgba(0,0,0,0.30)"; ctx.lineWidth = Math.max(1, z * 0.8);
        ctx.beginPath();
        for (let k = 0; k < wp.length; k += 1) { const p = wp[k]; if (k === 0) ctx.moveTo(p[0], p[1] + p[2]); else ctx.lineTo(p[0], p[1] + p[2]); }
        ctx.stroke();
      };
      // Murs sur les sous-tronçons waterBelow (au moins 2 samples). Chaque segment
      // est ÉTENDU d'un sample aux bouts (hauteur 0, si dispo) : le polygone se FERME
      // à la pointe au lieu de s'arrêter net un sample avant (le taper met wallH=0
      // pile au bout → sans extension, mur coupé + liseré qui continue seul).
      { let i = 0; while (i < N) { if (!wallH[i]) { i += 1; continue; } let j = i; while (j + 1 < N && wallH[j + 1] > 0) j += 1; if (j > i) drawWallSeg(a + Math.max(0, i - 1), a + Math.min(N - 1, j + 1)); i = j + 1; } }
      // BAS-FOND CLAIR collé au BORD DE L'EAU VISIBLE (retour Raph « il faut qu'il
      // suive le bord de l'eau », pas le quai englouti) : la ligne = le contour BAS
      // du parement DESSINÉ là où il y a un mur (pied = screen-Y + wallH[i], qui
      // remonte au bord du ruban à la pointe), et le bord PEINT du ruban là où il
      // n'y en a pas (wallH=0). AUCUN décalage latéral : l'ancien -inset laissait
      // la ligne flotter DANS l'eau au-delà de la pointe et hors des tronçons à mur.
      // (Le bas-fond de drawIsoRiver reste OFF — waterShoreTune.on=false.)
      const shoreLine = (col, lw) => {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = a; i <= b; i += 1) {
          const p = pt(i, side, 0, 1);
          const y = p[1] + wallH[i - a];      // pied du mur ; bord du ruban si wallH=0
          if (i === a) ctx.moveTo(p[0], y); else ctx.lineTo(p[0], y);
        }
        ctx.stroke();
      };
      shoreLine("rgba(150,184,180,0.50)", Math.max(3, z * 5));    // bas-fond doux (halo)
      shoreLine("rgba(202,224,214,0.62)", Math.max(1, z * 2.2));  // liseré clair AU bord
    }

    // 3) Joints de dalles du DESSUS : ticks perpendiculaires (pierre/marbre).
    if (st.joints && !lod) {
      ctx.strokeStyle = st.joints; ctx.lineWidth = Math.max(1, z * 0.5);
      for (let i = a; i <= b; i += 1) {
        const ta = tt(i, a, b); if (ta < 0.4) continue;
        const p1 = pt(i, side, faceW, ta), p2 = pt(i, side, W, ta);
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      }
    }
    // 4) Côté terre : garde-corps (fonte/néon) sinon liseré clair.
    if (st.rail) strokeAt(a, b, side, W, st.rail, Math.max(1, z * 0.7));
    else strokeAt(a, b, side, W, st.edge, Math.max(1, z * 0.5));
    // 5) MARGELLE : cap clair au bord d'eau = le haut du mur (les deux rives).
    strokeAt(a, b, side, 0, cCop, Math.max(1, z * 1.0));
    // 6) Bord lumineux (néon / énergie cosmique), avivé la nuit.
    if (st.glow) strokeAt(a, b, side, 0, `rgba(${st.glow},${(0.30 + 0.45 * night).toFixed(2)})`, Math.max(1, z * 0.7), true);
    // 7) Lampadaires le long de la promenade ; lueur chaude la nuit.
    if (!lod && st.lamp) {
      for (let i = a; i <= b; i += 1) {
        if (i % 2 !== 0) continue;
        const ta = tt(i, a, b); if (ta < 0.6) continue;
        const p = pt(i, side, W * 0.8, ta), lx = p[0], ly = p[1];
        if (night > 0.25) {
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const r = Math.max(4, z * 1.7), g2 = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
          g2.addColorStop(0, `rgba(${st.lamp},${(0.5 * night).toFixed(2)})`); g2.addColorStop(1, `rgba(${st.lamp},0)`);
          ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        ctx.fillStyle = night > 0.25 ? `rgba(${st.lamp},0.95)` : "rgba(28,24,18,0.8)";
        ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, z * 0.35), 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  // Gate des runs. Par défaut la berge suit le liseré URBAIN (quayGate, proche des
  // routes). En mode `full` (défaut), la berge maçonnée court TOUT LE LONG de l'eau :
  // 1 partout, SAUF sous les riverains (port/moulin) qui posent leur propre front.
  // Copies FRAÎCHES (ne pas muter le quayGate caché) : full = 1 partout, urbain = le gate.
  const plusG = new Uint8Array(n0), minusG = new Uint8Array(n0);
  if (quayWallTune.full) {
    plusG.fill(1); minusG.fill(1);
    for (const t of (L.tiles || [])) {
      if (t.buildingId !== "river_ports" && t.buildingId !== "water_mills") continue;
      const x0 = t.gx - 0.5, x1 = t.gx + (t.spanX || t.size || 1) + 0.5;
      for (let i = 0; i < n0; i += 1) if (sm[i].x >= x0 && sm[i].x <= x1) { plusG[i] = 0; minusG[i] = 0; }
    }
  } else {
    plusG.set(g.plus); minusG.set(g.minus);
  }
  // Pas de quai là où le fleuve est TROP ÉTROIT (début/fin où les 2 berges
  // CONVERGENT) : sinon les murs se rejoignent en une longue POINTE triangulaire
  // (retour Raph « le début du quai ça ne va pas »). Seuil sur la demi-largeur.
  const QUAY_MIN_HW = 1.6, QUAY_END = 3;   // + source/embouchure (premiers/derniers samples) = berge naturelle
  naturalOff = new Uint8Array(n0);          // 1 = gate coupé pour raison NATURELLE (≠ port/moulin) → bout carré
  for (let i = 0; i < n0; i += 1) if (sm[i].hw < QUAY_MIN_HW || i < QUAY_END || i >= n0 - QUAY_END) { plusG[i] = 0; minusG[i] = 0; naturalOff[i] = 1; }
  for (let si = 0; si < 2; si += 1) {
    const side = si ? -1 : 1, gate = si ? minusG : plusG;
    let i = 0;
    while (i < n0) {
      if (!gate[i]) { i += 1; continue; }
      const a = i; while (i + 1 < n0 && gate[i + 1]) i += 1;
      if (i > a) drawRun(a, i, side);   // run d'au moins 2 samples
      i += 1;
    }
  }
}

function cityMapDrawRiver(now) {
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) return;
  ensureQuayGate();   // prêt avant la boucle roseaux (qui s'efface sous le quai)
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const sm = L.river.samples;
  const SX = (gx) => (gx * T - CM.cam.x) * z + CM.cw / 2;
  const SY = (gy) => (gy * T - CM.cam.y) * z + CM.ch / 2;

  const tw = state.timeWear || 0;
  const collapsed = CM.collapseAt ? true : false;
  let edge, mid;
  if (collapsed) { edge = "#0a1a0a"; mid = "#0a1a0a"; }
  else if (tw > 0.7) { edge = "#142a1e"; mid = "#1a3a2a"; }
  else { edge = "#1a2e3a"; mid = "#2c4a5e"; } // eau saine : ardoise bleu-nuit désaturée, accordée à la palette UI (--surface-raised)

  const normalAt = (i) => {
    const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1;
    return { nx: -ty / tl, ny: tx / tl };
  };
  const ribbon = (mult, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < sm.length; i += 1) { const n = normalAt(i); const x = SX(sm[i].x + n.nx * sm[i].hw * mult), y = SY(sm[i].y + n.ny * sm[i].hw * mult); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for (let i = sm.length - 1; i >= 0; i -= 1) { const n = normalAt(i); ctx.lineTo(SX(sm[i].x - n.nx * sm[i].hw * mult), SY(sm[i].y - n.ny * sm[i].hw * mult)); }
    ctx.closePath(); ctx.fill();
  };
  ribbon(1, edge);
  ribbon(0.55, mid);
  // (Filets de courant + étincelles vectoriels RETIRÉS le 2026-07-02 à la
  // demande — même décision que dans pixelRiver.js, le rendu principal.)

  const reedOk = tw < 0.7 && !collapsed;
  const band = L.counts ? (L.counts.eraBand | 0) : 0;
  const quaysActive = band >= 2 && reedOk;   // un quai est tracé là où la berge est urbaine
  for (const k of L.river.banks) {
    if (quaysActive && CM.quayBankCells && CM.quayBankCells.has(k)) continue; // pas de roseaux sous le quai
    const c = k.indexOf(","); const bgx = +k.slice(0, c), bgy = +k.slice(c + 1);
    const px = SX(bgx), py = SY(bgy), ts = T * z;
    if (px < -ts || px > CM.cw || py < -ts || py > CM.ch) continue;
    if (reedOk && (bgx * 7 + bgy * 13) % 3 === 0) {
      const waterBelow = L.river.isWater(bgx, bgy + 1);
      const waterAbove = L.river.isWater(bgx, bgy - 1);
      const baseY = waterBelow ? py + ts * 0.28 : waterAbove ? py + ts * 0.78 : py + ts * 0.54;
      const tipY = waterBelow ? py + ts * 0.08 : waterAbove ? py + ts * 0.96 : py + ts * 0.38;
      ctx.strokeStyle = "rgba(90,138,42,0.72)";
      ctx.lineWidth = Math.max(1, z * 0.75);
      for (let rd = 0; rd < 2; rd += 1) {
        const rx = px + ts * (0.38 + rd * 0.2);
        ctx.beginPath(); ctx.moveTo(rx, baseY); ctx.lineTo(rx + (rd ? 1 : -1) * z, tipY); ctx.stroke();
      }
    }
  }

  if (tw > 0.7 && !collapsed) {
    ctx.fillStyle = "rgba(96,72,32,0.28)";
    for (let i = 0; i < 6; i += 1) { const s0 = sm[Math.floor((i / 6) * (sm.length - 1))]; ctx.beginPath(); ctx.arc(SX(s0.x), SY(s0.y), Math.max(2, 3 * z), 0, Math.PI * 2); ctx.fill(); }
  }
}

function cityMapDrawTrees() {
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const occ = CM.occupied || new Set();
  const rr = CM.riverRow;
  const pad = 2;
  const gx0 = Math.floor((CM.cam.x - CM.cw / 2 / z) / CM.TILE) - pad;
  const gx1 = Math.ceil((CM.cam.x + CM.cw / 2 / z) / CM.TILE) + pad;
  const gy0 = Math.floor((CM.cam.y - CM.ch / 2 / z) / CM.TILE) - pad;
  const gy1 = Math.ceil((CM.cam.y + CM.ch / 2 / z) / CM.TILE) + pad;

  const isRiver = (gx, gy) => gy === rr || gy === rr + 1;
  const nearCity = (gx, gy) =>
    occ.has((gx - 1) + "," + gy) || occ.has((gx + 1) + "," + gy) ||
    occ.has(gx + "," + (gy - 1)) || occ.has(gx + "," + (gy + 1));

  // Forêt repoussée hors du « sol » urbain : on lit le VRAI sol (layout.urbanSet,
  // exactement la zone que peint pixelTerrain) au lieu d'une ellipse approximative
  // → aucun arbre ne pousse sur la terre battue ni sous un bâtiment (l'ancienne
  // ellipse laissait le sol organique déborder par endroits → arbres sur le sol).
  // Marge d'un anneau (FOREST_SOL_RING) : le sol pixel déborde d'~1 cellule via le
  // corner-Wang + tampon d'herbe entre la lisière boisée et la ville.
  const _L = CM.layout;
  const _urban = _L && _L.urbanSet;
  // Repli ellipse (urbanSet absent) : mêmes axes que le halo urbain × marge.
  const solCX = _L?.plan?.core?.x ?? _L?.cx ?? 0;
  const solCY = _L?.plan?.core?.y ?? _L?.cy ?? 0;
  const solRx = _L ? Math.min(_L.gridN * 0.49, 6 + (_L.counts?.eraIndex || 0) * 3.8 + (_L.counts?.urbanTier || 0) * 7) * FOREST_SOL_MARGIN : 0;
  const solRy = solRx * 0.78;
  const onUrbanSol = (gx, gy) => {
    if (_urban) {
      const R = FOREST_SOL_RING;
      for (let oy = -R; oy <= R; oy += 1)
        for (let ox = -R; ox <= R; ox += 1)
          if (_urban.has((gx + ox) + "," + (gy + oy))) return true;
      return false;
    }
    if (!solRx) return false;
    const dx = (gx - solCX) / solRx, dy = (gy - solCY) / solRy;
    return dx * dx + dy * dy < 1;
  };

  // Bruit de densite basse frequence : agglutine les arbres en fourres et
  // menage des trouees, au lieu d'une densite plate.
  const cellNoise = (gx, gy) => {
    const n1 = (cmHash(Math.floor(gx / 5) + "n" + Math.floor(gy / 5)) % 1000) / 1000;
    const n2 = (cmHash(Math.floor(gx / 11) + "m" + Math.floor(gy / 11)) % 1000) / 1000;
    return n1 * 0.6 + n2 * 0.4;
  };
  const hasTree = (gx, gy) => {
    if (isRiver(gx, gy) || occ.has(gx + "," + gy)) return false;
    let thr = cellNoise(gx, gy) * 1.25 - 0.08;   // fourres (haut) / trouees (bas)
    if (nearCity(gx, gy)) thr -= 0.35;            // aere la lisiere de ville
    if ((cmHash(gx + "f" + gy) % 1000) / 1000 >= thr) return false;
    return !onUrbanSol(gx, gy);                    // ...mais jamais sur le sol urbain (sur l'herbe seulement)
  };

  // Nuance une couleur hex par canal : variation de teinte d'un arbre a l'autre.
  const shiftRGB = (hex, dr, dg, db) => {
    const v = parseInt(hex.slice(1), 16);
    const cl = (n) => (n < 0 ? 0 : n > 255 ? 255 : n);
    return "rgb(" + cl((v >> 16) + dr) + "," + cl(((v >> 8) & 255) + dg) + "," + cl((v & 255) + db) + ")";
  };

  // Parametres par arbre (stables, calcules une fois)
  const trees = [];
  // Déclin : au-delà d'un seuil d'usure (ou instabilité totale), une fraction
  // croissante d'arbres bascule sur le sprite « mort » → la forêt se blettit.
  const _wear = state.timeWear || 0;
  const _declineFrac = Math.max(0, Math.min(1, (_wear - 0.55) / 0.35));
  const deadFrac = (state.instability || 0) >= 1 ? Math.max(_declineFrac, 0.85) : _declineFrac;
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      if (!hasTree(gx, gy)) continue;
      const h = cmHash(gx + "f" + gy) % 100;
      const hh = cmHash(gx + "h" + gy);     // hash riche : echelle + jitter
      const hv = cmHash(gx + "v" + gy);     // hash riche : teinte + ombre
      const edge = nearCity(gx, gy);
      // Decalage pseudo-aleatoire dans la case pour casser la grille
      const jx = (((hh >> 3) & 31) - 15) / 90;
      const jy = (((hh >> 11) & 31) - 15) / 90;
      const cx = (gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * z + CM.cw / 2 + jx * s;
      const cy = (gy * CM.TILE + CM.TILE / 2 - CM.cam.y) * z + CM.ch / 2 + jy * s;
      // Echelle par arbre x0.7..x1.4 : casse l'uniformite ("assets eparpilles")
      const scale = 0.7 + ((hh >>> 16) & 1023) / 1023 * 0.7;
      const r = (edge ? s * 0.20 : s * 0.38) * scale;
      // Teinte verte + balance chaude nuancees par arbre (casse la teinte unique)
      const dG = (hv & 15) - 7;
      const dW = ((hv >> 4) & 7) - 3;
      const colBase = shiftRGB(CITY_MAP_GREENS[(h % 4) + 4], dW, dG, -dW);
      const colTop = shiftRGB(CITY_MAP_GREENS[h % 4], dW, dG, -dW);
      // Ombre nuancee (alpha) d'un arbre a l'autre
      const shA = 0.20 + ((hv >> 8) & 7) / 7 * 0.12;
      // Roll d'arbre mort (bits hauts de hv, indépendants de la teinte/ombre)
      const dead = (((hv >>> 12) & 1023) / 1023) < deadFrac;
      // Densité locale : nb de voisins (8) boisés → fourré (masse) vs arbre isolé.
      let nb = 0;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        if ((ox || oy) && hasTree(gx + ox, gy + oy)) nb += 1;
      }
      const mass = !dead && nb >= 2;             // dans un fourré → canopée de masse
      const frontOpen = !hasTree(gx, gy + 1);    // bord avant de la masse (vers le bas)
      const massSkip = nb >= 7 && (h % 3) === 0; // intérieur profond : éclairci (couvert par voisins)
      const canopyKind = (h % 4) === 0 ? 'canopy2' : 'canopy';
      const massSize = s * CANOPY_SIZE * (0.9 + ((hh >>> 20) & 255) / 255 * 0.2);
      // Pied du tronc de frange (et de l'ombre de lisière) = bas du feuillage
      // (~0.34·dôme sous son centre) + longueur visible du tronc.
      const baseY = cy - s * CANOPY_LIFT + massSize * 0.34 + s * TRUNK_LEN;
      trees.push({ cx, cy, r, colBase, colTop, h, edge, shA, dead, mass, frontOpen, massSkip, canopyKind, massSize, baseY });
    }
  }

  // LOD : un seul disque plein par arbre — la forêt reste une masse verte
  // lisible sans payer ombre + tronc + couronne + reflet par arbre.
  if (CM.lodActive) {
    for (const t of trees) {
      ctx.fillStyle = t.colBase;
      ctx.beginPath();
      ctx.arc(t.cx, t.cy - t.r * 0.5, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Passe 1 — ombres au sol. Masse forestière : pas d'ombre par arbre (le sol est
  // caché sous la canopée) ; seulement une ombre de lisière sous le FRONT de la
  // masse. Arbres isolés : ombre portée individuelle (sous le pied du tronc).
  for (const t of trees) {
    if (t.mass) {
      if (!t.frontOpen || t.massSkip) continue;
      ctx.fillStyle = "rgba(16,11,4,0.26)";
      ctx.beginPath();
      ctx.ellipse(t.cx, t.baseY, s * 0.50, s * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // L'ombre se place sous le pied du tronc, décalée à droite
    ctx.fillStyle = "rgba(20,14,6," + t.shA.toFixed(2) + ")";
    ctx.beginPath();
    ctx.ellipse(
      t.cx + t.r * 0.18, t.cy + t.r * 0.80,
      t.r * 0.90, t.r * 0.32,
      0, 0, Math.PI * 2
    );
    ctx.fill();
  }

  // Passe 2 — sprite pixel-art (PixelLab) par arbre ; repli procédural par arbre
  // si le sprite n'est pas (encore) chargé. Géométrie procédurale de repli :
  //   couronne centrée à cy - r*0.50 ; tronc jusqu'à cy + r*0.90.
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;   // pixel art net (pas de lissage à l'échelle)
  for (const t of trees) {
    const r = t.r, cx = t.cx, cy = t.cy;
    if (pixelTreesOn) {
      if (t.mass) {
        // Fourré dense : canopée plate centrée sur la cellule, qui chevauche ses
        // voisines → masse forestière continue (cf. image de réf). Sans ombre.
        const c = ensureTree(t.canopyKind);
        if (treeReady(c)) {
          if (t.massSkip) continue;   // intérieur profond éclairci (couvert par les voisines)
          const dh = t.massSize;
          // Tronc de frange : seules les cellules à sol dégagé devant (frontOpen)
          // montrent un fût ; les troncs intérieurs sont couverts par la canopée
          // d'en face. Tracé du centre de la canopée jusqu'à l'herbe, AVANT la
          // canopée (qui en recouvre le haut) → seul le bas, sous le feuillage, reste.
          if (t.frontOpen) {
            // Fût court & trapu : du cœur de la canopée (recouvert par le feuillage)
            // jusqu'au pied (baseY) ; seul le bas, sous le feuillage, émerge.
            const tt = cy - s * CANOPY_LIFT;   // cœur canopée (recouvert)
            const gY = t.baseY;                // pied du tronc
            const tw = Math.max(2, s * TRUNK_W);
            ctx.fillStyle = "#321f0f";         // brun très sombre (réf)
            ctx.beginPath();
            ctx.moveTo(cx - tw * 0.46, tt);
            ctx.lineTo(cx - tw * 0.56, gY);
            ctx.lineTo(cx + tw * 0.56, gY);
            ctx.lineTo(cx + tw * 0.46, tt);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = "rgba(92,58,28,0.55)";   // reflet flanc gauche
            ctx.fillRect(cx - tw * 0.46, tt, tw * 0.34, gY - tt);
          }
          ctx.drawImage(c.img, cx - dh / 2, cy - s * CANOPY_LIFT - dh / 2, dh, dh);
          continue;
        }
      } else {
        // Arbre isolé : sprite détaillé divers, ancré pied-en-bas.
        const kind = treeKindFor(t);
        // Chênes : sprite RETIRÉ (ne va pas) → ces feuillus repassent au rendu
        // procédural d'origine (les autres essences gardent leur sprite PixelLab).
        if (kind !== 'oak') {
          const c = ensureTree(kind);
          if (treeReady(c)) {
            const dh = r * (TREE_FILL[kind] || 2.4) * TREE_SCALE;
            ctx.drawImage(c.img, cx - dh / 2, cy + r * TREE_FOOT - dh, dh, dh);
            continue;
          }
        }
      }
    }
    // Bits de hash supplementaires : casse la regularite d'un arbre a l'autre.
    const hb = Math.imul(t.h + 7, 2654435761) >>> 0;
    // ~1 arbre sauvage sur 5 (hors lisiere) est un conifere : varie la foret.
    const conifer = !t.edge && (t.h % 5) === 0;

    if (conifer) {
      // ── SAPIN — tiers triangulaires empiles, tronc fin, cime pointue ─────
      const tw = Math.max(1.4, r * 0.12);
      const baseY = cy + r * 0.62;          // pied du feuillage (proche du sol)
      const topY = cy - r * 1.15;           // cime, plus haute qu'un feuillu
      const halfW = r * 0.64;
      ctx.fillStyle = "#3a2207";
      ctx.fillRect(cx - tw / 2, baseY - r * 0.1, tw, r * 0.5);
      ctx.fillStyle = "rgba(110,70,25,0.5)";
      ctx.fillRect(cx - tw / 2, baseY - r * 0.1, tw * 0.4, r * 0.5);
      const tiers = 4;
      for (let i = tiers - 1; i >= 0; i -= 1) {
        const yA = topY + (baseY - topY) * (i / tiers);              // sommet du tier
        const yB = topY + (baseY - topY) * Math.min(1, (i + 1.25) / tiers); // base
        const wH = halfW * ((i + 1) / tiers);
        // Silhouette sombre, decalee bas-droite
        ctx.fillStyle = t.colBase;
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.03, yA);
        ctx.lineTo(cx + wH + r * 0.03, yB);
        ctx.lineTo(cx - wH + r * 0.03, yB);
        ctx.closePath(); ctx.fill();
        // Aiguilles claires par-dessus, decalees haut-gauche
        ctx.fillStyle = t.colTop;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.04, yA);
        ctx.lineTo(cx + wH * 0.82 - r * 0.04, yB);
        ctx.lineTo(cx - wH * 0.82 - r * 0.04, yB);
        ctx.closePath(); ctx.fill();
      }
      // Reflet solaire sur le flanc haut-gauche de la cime
      ctx.fillStyle = "rgba(200,245,150,0.16)";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.05, topY + r * 0.08);
      ctx.lineTo(cx - halfW * 0.4, topY + r * 0.5);
      ctx.lineTo(cx - r * 0.05, topY + r * 0.5);
      ctx.closePath(); ctx.fill();
      continue;
    }

    // ── FEUILLU — tronc evase (parfois fourchu) + couronne a lobes ─────────
    const tw = Math.max(1.5, r * (t.edge ? 0.12 : 0.17));
    const ccy = cy - r * 0.5;               // centre de la couronne
    const trunkTop = ccy + r * 0.2;
    const trunkBot = cy + r * (t.edge ? 0.7 : 0.9);
    // Tronc evase : base plus large que le sommet
    ctx.fillStyle = "#4a2a0c";
    ctx.beginPath();
    ctx.moveTo(cx - tw * 0.5, trunkTop);
    ctx.lineTo(cx - tw * 0.85, trunkBot);
    ctx.lineTo(cx + tw * 0.85, trunkBot);
    ctx.lineTo(cx + tw * 0.5, trunkTop);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(110,65,22,0.55)";
    ctx.fillRect(cx - tw * 0.5, trunkTop, tw * 0.4, trunkBot - trunkTop);
    // Fourche : deux branches montant dans la couronne (grands arbres)
    if (!t.edge) {
      ctx.strokeStyle = "#4a2a0c";
      ctx.lineWidth = Math.max(1, tw * 0.6); ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, trunkTop + r * 0.12);
      ctx.lineTo(cx - r * 0.26, ccy + r * 0.05);
      ctx.moveTo(cx, trunkTop + r * 0.12);
      ctx.lineTo(cx + r * 0.24, ccy);
      ctx.stroke();
      ctx.lineCap = "square";
    }

    // Couronne : grappe de lobes (silhouette « nuage » bosselee).
    // Gabarit en unites de r, autour du centre de couronne (cx, ccy).
    const LB = [
      [0.00, -0.42, 0.50], [-0.46, -0.08, 0.46], [0.46, -0.08, 0.46],
      [-0.26, 0.26, 0.46], [0.28, 0.26, 0.45], [0.00, 0.04, 0.60]
    ];
    // Jitter deterministe par lobe (bits de hb) : chaque arbre est unique.
    const lobe = (k) => {
      const b = (hb >> (k * 3)) & 7;
      const dx = ((b & 1) ? 1 : -1) * ((b & 2) ? 0.05 : 0.02);
      const dy = (b & 4) ? 0.05 : -0.03;
      return [LB[k][0] + dx, LB[k][1] + dy, LB[k][2] * (0.92 + (b & 1) * 0.12)];
    };
    // Passe A — silhouette sombre (lobes agrandis = lisere sombre net)
    ctx.fillStyle = t.colBase;
    for (let k = 0; k < LB.length; k += 1) {
      const [lx, ly, lr] = lobe(k);
      ctx.beginPath();
      ctx.arc(cx + lx * r, ccy + ly * r, lr * r * 1.08, 0, Math.PI * 2);
      ctx.fill();
    }
    // Passe B — corps clair, decale haut-gauche (volume)
    ctx.fillStyle = t.colTop;
    for (let k = 0; k < LB.length; k += 1) {
      const [lx, ly, lr] = lobe(k);
      ctx.beginPath();
      ctx.arc(cx + (lx - 0.05) * r, ccy + (ly - 0.06) * r, lr * r * 0.92, 0, Math.PI * 2);
      ctx.fill();
    }
    // Passe C — reflets solaires sur les lobes hauts-gauches
    ctx.fillStyle = "rgba(205,250,140,0.18)";
    for (const k of [0, 1]) {
      const [lx, ly, lr] = lobe(k);
      ctx.beginPath();
      ctx.arc(cx + (lx - 0.12) * r, ccy + (ly - 0.16) * r, lr * r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.imageSmoothingEnabled = prevSmooth;
}

function cityMapDrawNight(now) {
  const n = CM.nightF;
  // Aube/crépuscule : voile chaud quand la nuit monte ou descend (pic à n=0.5).
  const twilight = 4 * n * (1 - n);
  if (twilight > 0.25) {
    const ctx2 = CM.ctx;
    // L'aube (nuit qui tombe → fausse : phase montante = crépuscule, descendante = aube)
    const dawn = CM.dayRising === false;
    const warmCol = dawn ? "255,170,90" : "255,120,50";
    ctx2.fillStyle = `rgba(${warmCol},${((twilight - 0.25) * 0.16).toFixed(3)})`;
    ctx2.fillRect(0, 0, CM.cw, CM.ch);
  }
  if (n < 0.05) return;
  const ctx = CM.ctx;
  ctx.fillStyle = `rgba(10,16,34,${(n * 0.5).toFixed(3)})`;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (CM.layout && CM.layout.counts && CM.layout.counts.eraBand >= 2) {
    const sx = (CM.layout.cx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
    const sy = (CM.layout.cy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
    const r = (8 + CM.layout.counts.eraIndex * 2.4) * CM.TILE * CM.cam.zoom;
    const warm = mapThemeForBand(CM.layout.counts.eraBand).nightWarm;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, r));
    g.addColorStop(0, `rgba(${warm},${(n * 0.16).toFixed(3)})`);
    g.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = prev;
  }
}


// ── Esplanade des places : DALLE PIXEL tuilée (couche statique) ─────────────
// Une vraie place : dalle pixel-art déclinée par ère, tuilée cellule par cellule
// (variante tirée par cellule) et clippée au contour arrondi. Support des
// sprites de mobilier (cf. cityMapDrawPlazas). Repli = couleur de base pleine.
// Une place est-elle recouverte par l'emprise (nord-biaisée) d'une merveille
// sèche active ? Même patron que cityMapRiotBlocked, mais rectangle dérivé des
// dims MAX du sprite (cmWonderExtent) au lieu d'un disque. era_mega (eau) exclue.
// Empêche sol pavé + fontaine + mobilier + coins de s'afficher sous le monument.
function cityMapPlazaBlockedByWonder(p) {
  if (!CM.layout || !Array.isArray(state.wonders) || !state.wonders.length) return false;
  const N = CM.layout.gridN, ph = p.size / 2;
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const w = CM_WONDERS[wi];
    if (w.id === "era_mega" || !cmWonderActive(w, state)) continue;
    const slot = cmWonderSlot(wi, N, CM.layout.cx, CM.layout.cy);
    const e = cmWonderExtent(w.id);
    // chevauchement AABB place[gx±ph]×[gy±ph] vs emprise (marge +0.5)
    if (Math.abs(p.gx - slot.gx) <= e.halfW + ph + 0.5 &&
        p.gy - ph <= slot.gy + e.south + 0.5 &&
        p.gy + ph >= slot.gy - e.north - 0.5) return true;
  }
  return false;
}

function cityMapDrawPlazaSurface() {
  const L = CM.layout;
  if (!L || !L.plan || !Array.isArray(L.plan.plazas) || !L.plan.plazas.length) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const band = L.counts ? L.counts.eraBand : 0;
  const ruined = CM.frameRuined;
  const dark = "rgba(40,30,16,0.3)";
  for (const p of L.plan.plazas) {
    if (!p.size || p.size < 2) continue;
    if (cityMapPlazaBlockedByWonder(p)) continue; // merveille seule : pas de place dessous
    const seedH = ((p.gx * 73856093) ^ (p.gy * 19349663)) >>> 0;
    const half = Math.floor(p.size / 2);
    const x0 = ((p.gx - half) * T - CM.cam.x) * z + CM.cw / 2;
    const y0 = ((p.gy - half) * T - CM.cam.y) * z + CM.ch / 2;
    const wPx = p.size * T * z, hPx = p.size * T * z;
    if (x0 > CM.cw + wPx || y0 > CM.ch + hPx || x0 + wPx < -wPx || y0 + hPx < -hPx) continue;
    const inset = T * z * 0.06;

    // ── Sol de l'ère : DALLE PIXEL tuilée (une tuile par cellule, variante tirée
    //    par cellule), clippée au contour arrondi. La couleur de base sert de
    //    sous-couche (comble les micro-jointures) et de repli tant que la dalle
    //    n'est pas décodée. ───────────────────────────────────────────────────
    const base = ruined ? "#4a4336"
      : band <= 1 ? "#7c6238"
      : band <= 3 ? "#94815c"
      : band >= 6 ? "#9a958a"
      : "#a08e6e";
    const corner = band <= 1 ? T * z * 0.55 : T * z * 0.3;
    const rrect = () => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0 + inset, y0 + inset, wPx - inset * 2, hPx - inset * 2, corner);
      else ctx.rect(x0 + inset, y0 + inset, wPx - inset * 2, hPx - inset * 2);
    };
    ctx.fillStyle = base; rrect(); ctx.fill();

    const PAVE_N = 2;   // 2 variantes (tonalement proches) → sol lisse, peu de patchwork
    if (plazaPropReady('paving', band, '0')) {
      ctx.save(); rrect(); ctx.clip();
      const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      const sz = Math.ceil(T * z) + 1;   // +1px : pas de couture au scaling fractionnaire
      const gx0 = p.gx - half, gy0 = p.gy - half;
      for (let iy = 0; iy < p.size; iy += 1) {
        for (let ix = 0; ix < p.size; ix += 1) {
          const gx = gx0 + ix, gy = gy0 + iy;
          const vi = ((Math.imul(((((gx * 73856093) ^ (gy * 19349663)) >>> 0) ^ seedH) >>> 0, 2654435761) >>> 0) % PAVE_N);
          const im = plazaPropImage('paving', band, String(vi)) || plazaPropImage('paving', band, '0');
          if (!im) continue;
          const dx = Math.floor((gx * T - CM.cam.x) * z + CM.cw / 2);
          const dy = Math.floor((gy * T - CM.cam.y) * z + CM.ch / 2);
          ctx.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight, dx, dy, sz, sz);
        }
      }
      ctx.imageSmoothingEnabled = prevS;
      ctx.restore();
    }

    // Bordure sombre (détache la place du sol environnant), par-dessus la dalle.
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, T * z * 0.08); rrect(); ctx.stroke();
  }
}

// ── Mobilier de place : bancs TOURNÉS VERS LE CENTRE (sur les bords) + fleurs
//    et buissons SUR LES CONTOURS. Placement pseudo-aléatoire mais STABLE par
//    place (graine seedH → figé entre frames, pas de scintillement). Les coins
//    (drapeaux / lanternes) sont gérés à part dans cityMapDrawPlazas. ─────────
function cityMapDrawPlazaFurniture(ctx, cx, cy, ext, s, band, night, seedH, kind, reserve) {
  const rr = (n) => ((Math.imul(seedH, 2654435761 + n * 131) >>> 0) % 1000) / 1000;

  // Bancs le long des quatre bords, chacun TOURNÉ VERS LE CENTRE via le sprite
  // directionnel du bord (repli : banc non directionnel — 100 % pixel). Le
  // nombre par bord est tiré au sort → places clairsemées ou garnies.
  if (band >= 2) {
    const off = ext * 0.74;      // distance du bord (les angles restent aux coins)
    const benchH = s * 0.9;
    const big = ext > s * 1.2;   // grande place → jusqu'à 2 bancs par bord
    // bord → direction vers laquelle le banc regarde (le centre) :
    //   nord regarde le sud, sud le nord, est l'ouest, ouest l'est.
    const EDGES = [
      { dir: 's', ny: -1, horiz: true },   // bord nord
      { dir: 'n', ny: 1, horiz: true },    // bord sud
      { dir: 'w', nx: 1, horiz: false },   // bord est
      { dir: 'e', nx: -1, horiz: false },  // bord ouest
    ];
    for (let ei = 0; ei < 4; ei += 1) {
      const e = EDGES[ei];
      const roll = rr(ei * 5 + 3);
      const cnt = roll < 0.26 ? 0 : (!big || roll < 0.7) ? 1 : 2;
      const slots = cnt === 2 ? [-0.5, 0.5] : cnt === 1 ? [0] : [];
      for (const a of slots) {
        const along = a * ext * 0.62;
        const bx = e.horiz ? cx + along : cx + e.nx * off;
        const by = (e.horiz ? cy + e.ny * off : cy + along) + s * 0.06;
        // anti-chevauchement : empreinte du banc (orientée) ; on saute si occupé.
        const bhw = e.horiz ? benchH * 0.42 : s * 0.16, bhh = e.horiz ? s * 0.16 : benchH * 0.42;
        if (!reserve(bx, by - benchH * 0.32, bhw, bhh)) continue;
        // sprite directionnel du bord, repli sur le banc non directionnel (pixel).
        if (plazaPropReady('bench', band, e.dir)) blitPlazaProp(ctx, 'bench', band, bx, by, benchH, e.dir);
        else blitPlazaProp(ctx, 'bench', band, bx, by, benchH);
      }
    }
  }

  // Fleurs & buissons sur les CONTOURS : bacs fleuris (planter) et arbustes
  // (bush) semés le long du pourtour, en alternance aléatoire ; les jardins en
  // reçoivent davantage. 100 % pixel (aucun repli vectoriel).
  if (band >= 2) {
    const garden = kind === "jardin";
    const nDecor = (garden ? 4 : 2) + Math.floor(rr(23) * (garden ? 4 : 3));
    const rim = ext * 0.84;      // juste en deçà du bord
    for (let d = 0; d < nDecor; d += 1) {
      const edge = Math.floor(rr(d * 7 + 40) * 4);       // 0=N 1=S 2=E 3=O
      const along = (rr(d * 7 + 41) - 0.5) * 1.5 * ext;  // le long du bord (vers les coins)
      let fx, fy;
      if (edge === 0) { fx = cx + along; fy = cy - rim; }
      else if (edge === 1) { fx = cx + along; fy = cy + rim; }
      else if (edge === 2) { fx = cx + rim; fy = cy + along; }
      else { fx = cx - rim; fy = cy + along; }
      const isBush = rr(d * 7 + 42) < 0.5;
      const dH = isBush ? s * 0.7 : s * 0.72;
      // anti-chevauchement : empreinte du bac/arbuste ; on saute si occupé.
      if (!reserve(fx, fy, dH * 0.4, dH * 0.3)) continue;
      if (isBush) blitPlazaProp(ctx, 'bush', band, fx, fy + s * 0.05, dH);
      else blitPlazaProp(ctx, 'planter', band, fx, fy + s * 0.05, dH);
    }
  }
}

// Eau animée de la fontaine : scintillements + ondes concentriques dessinés en
// GROS PIXELS (fillRect, jamais d'arc/dégradé lisse → reste dans la DA pixel-art),
// teintés par ère. (bx,by) = centre du bassin ; s = taille tuile écran.
function cityMapDrawFountainWater(ctx, bx, by, fh, band, t, seedH) {
  const col = band <= 5 ? "200,230,255" : band === 6 ? "170,235,255"
    : band === 7 ? "150,255,225" : band === 8 ? "255,225,165" : "210,180,255";
  const rx = fh * 0.28, ry = fh * 0.14;              // bassin elliptique (∝ fontaine)
  const px = Math.max(1, Math.round(fh * 0.05));     // « gros pixel »
  const sq = (x, y, a) => { if (a < 0.05) return; ctx.fillStyle = `rgba(${col},${a.toFixed(2)})`; ctx.fillRect(Math.round(x - px / 2), Math.round(y - px / 2), px, px); };
  // Ondes concentriques (2) : pointillé sur l'ellipse, s'estompe en s'élargissant.
  for (let k = 0; k < 2; k += 1) {
    const ph = (t / 1500 + k * 0.5) % 1, r = 0.28 + 0.72 * ph, a = (1 - ph) * 0.4;
    for (let i = 0; i < 12; i += 1) { const g = (i / 12) * Math.PI * 2 + k * 0.4; sq(bx + Math.cos(g) * rx * r, by + Math.sin(g) * ry * r, a); }
  }
  // Scintillements (7) : positions stables (angle d'or), clignotement désynchro.
  for (let i = 0; i < 7; i += 1) {
    const g = i * 2.399, rad = 0.18 + 0.72 * ((i * 0.618) % 1);
    const a = Math.max(0, Math.sin(t / 320 + i * 1.7 + (seedH % 7))) * 0.7;
    sq(bx + Math.cos(g) * rx * rad, by + Math.sin(g) * ry * rad, a);
  }
}

// ── Places publiques : fontaine pixel (eau animée) au centre de CHAQUE place +
//    mobilier (bancs vers le centre, fleurs/buissons sur contours) + coins
//    aléatoires (drapeaux statiques / lanternes qui vacillent). 100 % pixel-art ;
//    seul le SOL pavé reste vectoriel (couche cityMapDrawPlazaSurface). ─────────
function cityMapDrawPlazas(now) {
  const L = CM.layout;
  if (!L || !L.plan || !Array.isArray(L.plan.plazas)) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const band = L.counts ? L.counts.eraBand : 0;
  const night = CM.nightF || 0;
  const t = now || 0;
  const basePid = L.personality ? L.personality.id : "marchande";
  CM._plazaTall = [];   // props tall (fontaine + coins) différés, dessinés entre les 2 passes d'habitants
  for (const p of L.plan.plazas) {
    if (!p.size || p.size < 2) continue;
    if (cityMapPlazaBlockedByWonder(p)) continue; // couvre fontaine + mobilier + coins
    const kind = p.kind || "centrale";
    const seedH = ((p.gx * 73856093) ^ (p.gy * 19349663)) >>> 0;
    // Centre EXACT de la dalle (même convention que cityMapDrawPlazaSurface :
    // origine gx-half, demi-taille floor(size/2)) → la fontaine tombe TOUJOURS au
    // centre, y compris sur les tailles PAIRES (avant : mobilier sur gx+0.5 →
    // décalé d'une demi-tuile par rapport au pavé).
    const half = Math.floor(p.size / 2);
    const cx = (((p.gx - half) + p.size / 2) * T - CM.cam.x) * z + CM.cw / 2;
    const cy = (((p.gy - half) + p.size / 2) * T - CM.cam.y) * z + CM.ch / 2;
    const s = T * z;
    const ext = p.size * s / 2; // demi-étendue de la place à l'écran
    if (cx < -ext * 2 || cy < -ext * 2 || cx > CM.cw + ext * 2 || cy > CM.ch + ext * 2) continue;
    // La place centrale d'une ville militaire est toujours pavoisée (cf. coins).
    const military = kind === "centrale" && basePid === "militaire";
    // Anti-chevauchement : on réserve l'EMPREINTE AU SOL de chaque élément et on
    // ne pose que ce qui ne recouvre pas un déjà-placé — priorité : fontaine
    // (centre) → bancs/décors (mobilier) → coins (drapeaux/lanternes).
    const boxes = [];
    const reserve = (rxx, ryy, hw, hh) => {
      for (let i = 0; i < boxes.length; i += 1) { const b = boxes[i]; if (Math.abs(rxx - b.x) < hw + b.hw && Math.abs(ryy - b.y) < hh + b.hh) return false; }
      boxes.push({ x: rxx, y: ryy, hw, hh }); return true;
    };
    // Props TALL (fontaine centre + drapeaux/lampadaires coins) : on les RÉSERVE ici (le
    // mobilier bas les évite) mais leur DESSIN est DIFFÉRÉ dans CM._plazaTall, consommé par
    // cityMapDrawPlazaTallProps ENTRE les 2 passes d'habitants → Y-SORT devant/derrière (un
    // habitant au sud passe devant, au nord derrière). Cf. CM.fountainCells + plazaPropCells
    // (occulteurs, agents.js). Le mobilier BAS (bancs/bacs) reste dessiné ici (avant agents).
    const fountH = Math.min(s * 1.9, ext * 1.1);
    reserve(cx, cy, fountH * 0.4, fountH * 0.22);      // bassin réservé en premier
    CM._plazaTall.push({ kind: 'fountain', x: cx, y: cy, s, seedH, fountH });
    // Mobilier urbain : bancs (tournés vers le centre) + fleurs/buissons (contours).
    cityMapDrawPlazaFurniture(ctx, cx, cy, ext, s, band, night, seedH, kind, reserve);

    // Coins : tirage STABLE par place → RIEN, DRAPEAUX aux 4 coins, ou LANTERNES
    // aux 4 coins (celles-ci gardent leur halo nocturne ∝ nightF). La place
    // militaire est toujours pavoisée. Chaque coin peut rester nu (variété).
    if (band >= 2) {
      const croll = ((Math.imul(seedH, 2654435761 + 97) >>> 0) % 1000) / 1000;
      const theme = military ? "flag"
        : croll < 0.34 ? "none"
          : croll < 0.67 ? "flag" : "lamp";
      if (theme !== "none") {
        const cd = ext * 0.66;
        let ci = 0;
        for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const skip = ((Math.imul(seedH, 2654435761 + 211 + ci * 17) >>> 0) % 1000) / 1000;
          ci += 1;
          if (skip < 0.16) continue;                     // coin nu occasionnel
          const px = cx + lx * cd, py = cy + ly * cd;
          if (!reserve(px, py - s * 0.2, s * 0.17, s * 0.24)) continue;   // pied libre ?
          // DESSIN DIFFÉRÉ (entre les 2 passes d'habitants → y-sort). La lanterne garde son
          // halo nocturne vacillant, recalculé au dessin (cf. cityMapDrawPlazaTallProps).
          if (theme === "flag") CM._plazaTall.push({ kind: 'flag', x: px, y: py, s });
          else CM._plazaTall.push({ kind: 'lamp', x: px, y: py, s, seedH, ci });
        }
      }
    }
  }
}

// Dessin des props TALL des places (fontaines + drapeaux/lampadaires de coin), DIFFÉRÉ dans
// CM._plazaTall par cityMapDrawPlazas. Appelé ENTRE les 2 passes d'habitants (après
// « derrière », avant les bâtiments) → Y-SORT : un habitant au SUD d'un prop passe devant
// (2e passe), au NORD il passe derrière (1re passe, dessinée avant). Le mobilier BAS (bancs,
// bacs) reste dans cityMapDrawPlazas (avant les agents).
function cityMapDrawPlazaTallProps(now) {
  const list = CM._plazaTall;
  if (!list || !list.length) return;
  const ctx = CM.ctx, L = CM.layout;
  const band = (L && L.counts) ? L.counts.eraBand : 0;
  const night = CM.nightF || 0, t = now || 0;
  for (const it of list) {
    const s = it.s;
    if (it.kind === 'fountain') {
      if (plazaAnimReady('fountain', band)) {
        blitPlazaAnim(ctx, 'fountain', band, it.x, it.y + s * 0.34, it.fountH, t);
      } else if (blitPlazaProp(ctx, 'fountain', band, it.x, it.y + s * 0.34, it.fountH)) {
        cityMapDrawFountainWater(ctx, it.x, it.y + s * 0.34 - it.fountH * 0.2, it.fountH, band, t, it.seedH);
      }
    } else if (it.kind === 'flag') {
      blitPlazaProp(ctx, 'flag', band, it.x, it.y + s * 0.02, s * 1.55);
    } else if (blitPlazaProp(ctx, 'lamppost', band, it.x, it.y + s * 0.12, s * 1.42)) {
      // Lanterne : halo nocturne vacillant (chaud ∝ nightF), recalculé ici.
      const headY = it.y - s * 1.05;
      const flick = 0.82 + 0.18 * Math.sin(t / 240 + it.ci + (it.seedH % 5)) + 0.05 * Math.sin(t / 70);
      cmDrawGlow(ctx, it.x, headY, Math.max(2, s * 0.16), 255, 215, 120, night * 1.1 * flick);
      cmDrawGlow(ctx, it.x, headY, s * 0.62, 255, 195, 90, night * 0.55 * flick);
    }
  }
}

// ── Reflets de la ville sur l'eau (nuit) ───────────────────────────────────
// Traînées de lumière chaude des bâtiments riverains projetées sur l'eau, la
// nuit. Dessinées juste après les quais (avant bateaux/blit statique) et
// CLIPPÉES au ruban du fleuve : la nappe lumineuse reste sur
// l'eau, et ponts/bâtiments recouvrent la base au croisement. Rendu PUR.
// Réutilise quayGate (rives "urbaines") : un reflet ne naît QUE là où la ville
// borde l'eau — donc pile sous les bâtiments riverains, sans donnée nouvelle.
function cityMapDrawCityReflections(now) {
  const night = CM.nightF || 0;
  if (night < 0.2) return;                                   // effet strictement nocturne
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) return;
  const band = L.counts ? (L.counts.eraBand | 0) : 0;
  if (band <= 1) return;                                     // campement : pas de ville riveraine
  if (CM.collapseAt || (state.timeWear || 0) > 0.7) return; // fleuve ruiné : pas de reflet
  ensureQuayGate();
  const g = CM.quayGate;
  if (!g) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE, sm = L.river.samples, n0 = sm.length;
  const t = now || 0;
  const SX = (gx) => (gx * T - CM.cam.x) * z + CM.cw / 2;
  const SY = (gy) => (gy * T - CM.cam.y) * z + CM.ch / 2;

  // Couleur des lumières riveraines selon l'ère (accordée aux lampes de quai) :
  // chaud (pierre/marbre/fonte) -> cyan (néon) -> teinte d'ère (cosmique).
  const glow = band <= 5 ? "255,210,140"
    : band === 6 ? "150,225,255"
      : band === 7 ? "90,240,180" : band === 8 ? "255,205,120" : "170,140,255";

  ctx.save();
  // Clip au ruban du fleuve : les nappes lumineuses restent SUR l'eau,
  // elles ne débordent jamais sur la berge/le quai.
  ctx.beginPath();
  for (let i = 0; i < n0; i += 1) { const n = cmRiverNormalAt(sm, i), s = sm[i]; const x = SX(s.x + n.nx * s.hw), y = SY(s.y + n.ny * s.hw); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  for (let i = n0 - 1; i >= 0; i -= 1) { const n = cmRiverNormalAt(sm, i), s = sm[i]; ctx.lineTo(SX(s.x - n.nx * s.hw), SY(s.y - n.ny * s.hw)); }
  ctx.closePath();
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";                 // lumière additive sur l'eau sombre

  const STRIDE = 2;                                          // une nappe tous les 2 samples
  for (let si = 0; si < 2; si += 1) {
    const side = si ? -1 : 1, gate = si ? g.minus : g.plus;
    for (let i = 0; i < n0; i += STRIDE) {
      if (!gate[i]) continue;
      const s = sm[i], n = cmRiverNormalAt(sm, i);
      // Scintillement lent, désynchronisé d'une nappe à l'autre (eau qui ride).
      const shimmer = 0.45 + 0.55 * Math.sin(t / 1300 + i * 0.9 + si * 2.1);
      const a = night * (0.10 + 0.07 * (i % 3)) * Math.max(0, shimmer);
      if (a < 0.012) continue;
      // Longueur de la traînée qui "respire" ; ancrée côté berge, file vers le centre.
      const reach = s.hw * (0.50 + 0.18 * Math.sin(t / 2000 + i * 0.5));
      const off = s.hw - reach * 0.5;
      const cx = SX(s.x + side * n.nx * off), cy = SY(s.y + side * n.ny * off);
      const RL = Math.max(3, reach * T * z);                 // long axe (le long de la normale)
      if (cx < -RL || cx > CM.cw + RL || cy < -RL || cy > CM.ch + RL) continue;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(Math.atan2(n.ny, n.nx)); ctx.scale(1, 0.42); // étiré vers le centre, fin le long de la rive
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, RL);
      grad.addColorStop(0, `rgba(${glow},${a.toFixed(3)})`);
      grad.addColorStop(1, `rgba(${glow},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, RL, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/* ---- legacy citymap rendering\roads.js ---- */


/* ============================================================================
 * citymap-render-roads.js - Rendu des routes, ponts et lampadaires.
 * ============================================================================ */

function cmRoadConnects(layout, gx, gy) {
  if (!layout || !layout.roadSet || !layout.roadSet.has(gx + "," + gy)) return false;
  if (layout.river && layout.river.isWater && layout.river.isWater(gx, gy)) {
    return cmIsBridgeRoad(layout, gx, gy);
  }
  return true;
}

function cmRoadMask(layout, gx, gy) {
  const road = layout && layout.roadMap && layout.roadMap.get(gx + "," + gy);
  if (road) {
    return {
      n: !!(road.mask & ROAD_N),
      e: !!(road.mask & ROAD_E),
      s: !!(road.mask & ROAD_S),
      w: !!(road.mask & ROAD_W)
    };
  }
  return {
    n: cmRoadConnects(layout, gx, gy - 1),
    e: cmRoadConnects(layout, gx + 1, gy),
    s: cmRoadConnects(layout, gx, gy + 1),
    w: cmRoadConnects(layout, gx - 1, gy)
  };
}

function cityMapDrawRoad(r) {
  // Les cellules de place ne sont pas des chaussées : l'esplanade dallée est
  // dessinée d'un seul tenant par cityMapDrawPlazaSurface.
  if (r.rank === "plaza") return;
  const s = CM.TILE * CM.cam.zoom;
  const sx = (r.gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (r.gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) return;
  const ctx = CM.ctx;
  const layout = CM.layout;
  const eraIndex = CM.frameEraIndex || 0;
  const major = layout && (r.gx === layout.cx || r.gy === layout.cy);
  const ruined = CM.frameRuined || false;
  const roadRank = r.rank || "secondary";
  const roadStyle = getRoadVisualStyle(eraIndex, roadRank, ruined, major);
  const pal = roadStyle.palette;
  if (r.roadSurface === "bridge") return;

  const mask = cmRoadMask(layout, r.gx, r.gy);
  const degree = (mask.n ? 1 : 0) + (mask.e ? 1 : 0) + (mask.s ? 1 : 0) + (mask.w ? 1 : 0);
  // Raccord visuel = praticabilité. Le masque (méta h/v) peut valoir 0 alors que
  // la cellule est marchable par simple adjacence orthogonale (les piétons se
  // déplacent ainsi). On calcule donc les voisins ROUTE orthogonaux pour relier
  // proprement ces cellules au lieu d'un stub centré (l'ancien « point » parasite).
  // Une cellule sans aucun voisin route (vraie orpheline — normalement déjà
  // élaguée par cmBuildRoadGraph) n'est pas dessinée.
  const adjRoad = (gx, gy) => !!(layout && layout.roadSet && layout.roadSet.has(gx + "," + gy));
  const adjN = adjRoad(r.gx, r.gy - 1), adjE = adjRoad(r.gx + 1, r.gy);
  const adjS = adjRoad(r.gx, r.gy + 1), adjW = adjRoad(r.gx - 1, r.gy);
  if (degree === 0 && !(adjN || adjE || adjS || adjW)) return;
  const pathWidth = roadStyle.width;
  const half = s * pathWidth * 0.5;
  const cxp = sx + s / 2, cyp = sy + s / 2;
  const seed = r._seed ?? cmHash(`road:${r.gx}:${r.gy}:${eraIndex}`);

  const shoulder = Math.max(1, s * 0.018 * roadStyle.borderStrength);
  const drawAxis = (color, width, cap = "square") => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width);
    ctx.lineCap = cap;
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (degree === 0) {
      // Pas de connexion par masque : on relie vers les voisins route orthogonaux
      // (cohérence avec le déplacement piéton). Au moins un existe ici (sinon la
      // cellule a été écartée plus haut).
      if (adjN) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy); }
      if (adjS) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s); }
      if (adjW) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx, cyp); }
      if (adjE) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s, cyp); }
    } else {
      if (mask.n) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy); }
      if (mask.s) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s); }
      if (mask.w) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx, cyp); }
      if (mask.e) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s, cyp); }
    }
    ctx.stroke();
  };

  ctx.save();
  drawAxis(pal.edge, half * 2 + shoulder);
  drawAxis(pal.core, half * 2);

  // ── Voies parallèles adjacentes → BOULEVARD : deux routes côte à côte laissaient
  //    une bande de sol entre elles. On COMBLE ce sol (chaque cellule remplit sa moitié
  //    jusqu'à la couture avec la couleur de chaussée) et on glisse un TERRE-PLEIN
  //    végétalisé sur la couture — dès l'ère 0. Le terre-plein n'est peint que côté
  //    dq=+1 (par la cellule "amont") pour ne pas le tracer deux fois.
  const parRoad = (gx, gy, wantH) => { const c = layout && layout.roadMap && layout.roadMap.get(gx + "," + gy); return !!c && (wantH ? !!(c.mask & ROAD_E || c.mask & ROAD_W) : !!(c.mask & ROAD_N || c.mask & ROAD_S)); };
  const isH = !!(mask.e || mask.w), isV = !!(mask.n || mask.s);
  // Deux voies parallèles collées → on COMBLE le sol entre elles avec la chaussée
  // (pal.core). L'ancien liseré de terre-plein PROCÉDURAL (medianCol0) sur la couture
  // a été SUPPRIMÉ : le refuge central est désormais rendu en pixel-art (drawPixelMedians).
  const fuseGap = (dq, horiz) => {
    if (horiz ? !parRoad(r.gx, r.gy + dq, true) : !parRoad(r.gx + dq, r.gy, false)) return;
    if (horiz) {
      const be = cyp + dq * half, bd = cyp + dq * (s / 2);
      ctx.fillStyle = pal.core; ctx.fillRect(sx, Math.min(be, bd), s, Math.abs(bd - be));
    } else {
      const be = cxp + dq * half, bd = cxp + dq * (s / 2);
      ctx.fillStyle = pal.core; ctx.fillRect(Math.min(be, bd), sy, Math.abs(bd - be), s);
    }
  };
  if (isH) { fuseGap(-1, true); fuseGap(1, true); }
  if (isV) { fuseGap(-1, false); fuseGap(1, false); }

  // Grands axes (avenue / boulevard) : leurs marquages — terre-plein, bandes de
  // voie et lignes de rive — sont peints en CONTINU par cityMapDrawRoadMarkings
  // (passe par segments, façon ruban du fleuve), et NON ici cellule par cellule.
  // cityMapDrawRoad ne pose donc que le CORPS de la chaussée pour ces rangs ; les
  // sentiers/rues (path/secondary) gardent leurs marquages d'époque par cellule.
  const bigAxis = roadRank === "main" || roadRank === "avenue";

  const drawPebble = (px, py, rScale, color) => {
    const r = s * rScale;
    if (r < 0.5) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const horizontal = mask.e || mask.w;
  const vertical = mask.n || mask.s;
  const sideSign = seed % 2 ? 1 : -1;
  if (seed % Math.max(3, roadStyle.detailRate - 2) === 0) {
    const px = horizontal ? sx + s * (0.22 + ((seed >> 4) % 44) / 100) : cxp + sideSign * half * (0.62 + ((seed >> 7) % 20) / 100);
    const py = vertical ? sy + s * (0.22 + ((seed >> 5) % 44) / 100) : cyp + sideSign * half * (0.62 + ((seed >> 8) % 20) / 100);
    drawPebble(px, py, 0.018, "rgba(226,200,142,0.32)");
  }
  if (seed % roadStyle.detailRate === 0) {
    ctx.strokeStyle = "rgba(38,30,18,0.18)";
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    if (horizontal) {
      const y = cyp + sideSign * (half + s * 0.035);
      ctx.moveTo(sx + s * 0.18, y);
      ctx.lineTo(sx + s * 0.34, y + sideSign * s * 0.012);
    } else if (vertical) {
      const x = cxp + sideSign * (half + s * 0.035);
      ctx.moveTo(x, sy + s * 0.18);
      ctx.lineTo(x + sideSign * s * 0.012, sy + s * 0.34);
    }
    ctx.stroke();
  }

  if (!bigAxis) {
  ctx.lineWidth = Math.max(1, s * 0.016);
  if (eraIndex < 7) {
    ctx.strokeStyle = pal.track;
    if (mask.e || mask.w) {
      ctx.beginPath(); ctx.moveTo(sx + s * 0.22, cyp - half * 0.28); ctx.lineTo(sx + s * 0.46, cyp - half * 0.24); ctx.stroke();
    }
    if (mask.n || mask.s) {
      ctx.beginPath(); ctx.moveTo(cxp - half * 0.28, sy + s * 0.22); ctx.lineTo(cxp - half * 0.24, sy + s * 0.46); ctx.stroke();
    }
  } else if (eraIndex < 14) {
    if (seed % roadStyle.detailRate === 0) {
      ctx.strokeStyle = pal.detail;
      ctx.beginPath();
      if (mask.e || mask.w) {
        ctx.moveTo(sx + s * 0.28, cyp + ((seed % 2) ? 1 : -1) * half * 0.22);
        ctx.lineTo(sx + s * 0.4, cyp + ((seed % 2) ? 1 : -1) * half * 0.22);
      } else if (mask.n || mask.s) {
        ctx.moveTo(cxp + ((seed % 2) ? 1 : -1) * half * 0.22, sy + s * 0.28);
        ctx.lineTo(cxp + ((seed % 2) ? 1 : -1) * half * 0.22, sy + s * 0.4);
      }
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = Math.max(1, s * 0.014);
    if ((mask.e || mask.w) && major) { ctx.beginPath(); ctx.moveTo(sx + s * 0.26, cyp); ctx.lineTo(sx + s * 0.5, cyp); ctx.stroke(); }
    if ((mask.n || mask.s) && major) { ctx.beginPath(); ctx.moveTo(cxp, sy + s * 0.26); ctx.lineTo(cxp, sy + s * 0.5); ctx.stroke(); }
  }
  }
  ctx.restore();
  ctx.lineJoin = "miter"; // reset explicite — drawAxis pose "round" dans le save block

  if (ruined && seed % 2 === 0) {
    ctx.strokeStyle = "rgba(20,14,9,0.72)";
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(sx + s * 0.2, sy + s * 0.25);
    ctx.lineTo(sx + s * 0.45, sy + s * 0.48);
    ctx.lineTo(sx + s * 0.36, sy + s * 0.8);
    ctx.stroke();
  }

  if (CM.debugRoads) {
    ctx.save();
    ctx.strokeStyle = "rgba(80,220,255,0.9)";
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    if (mask.n) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s * 0.12); }
    if (mask.e) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s * 0.88, cyp); }
    if (mask.s) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s * 0.88); }
    if (mask.w) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s * 0.12, cyp); }
    ctx.stroke();
    ctx.fillStyle = r.roadType === "intersection" ? "rgba(255,90,90,0.9)" : r.roadType === "junction" ? "rgba(255,210,80,0.9)" : "rgba(80,220,255,0.9)";
    ctx.fillRect(cxp - Math.max(1, s * 0.045), cyp - Math.max(1, s * 0.045), Math.max(2, s * 0.09), Math.max(2, s * 0.09));
    ctx.restore();
  }
}

/* ============================================================================
 * Palier 1 — marquages des grands axes en CONTINU (par segments)
 *   cityMapDrawRoad pose le corps de chaque cellule. Les marquages des grands
 *   axes (terre-plein, bandes de voie pointillées, lignes de rive) sont peints
 *   ici, segment par segment, comme un ruban : une seule polyligne court sur tout
 *   le boulevard → pointillés réellement continus (plus de phase qui se réinitialise
 *   par case), terre-plein lisse. Les segments se BRISENT aux vrais croisements de
 *   grands axes (le voisin transversal est lui-même avenue/main) — pas aux petites
 *   rues qui s'y greffent — et ces nœuds reçoivent des lignes d'arrêt propres.
 *   L'extraction des segments est mise en cache par layout (clé layoutRecomputeAt) ;
 *   le rendu vit dans le bake statique (recalculé seulement si caméra/layout change).
 * ============================================================================ */
function ensureRoadRuns() {
  const L = CM.layout;
  if (!L || !L.roadMap) { CM.roadRuns = null; return; }
  if (CM.roadRuns && CM.roadRuns.key === CM.layoutRecomputeAt) return;
  const roadMap = L.roadMap;
  const get = (gx, gy) => roadMap.get(gx + "," + gy);
  const big = (c) => !!(c && (c.rank === "main" || c.rank === "avenue") && c.roadSurface !== "bridge");
  const connH = (c) => !!(c && (c.mask & ROAD_E || c.mask & ROAD_W));
  const connV = (c) => !!(c && (c.mask & ROAD_N || c.mask & ROAD_S));
  // Croisement d'un GRAND axe transversal (et non d'une simple rue) : c'est là —
  // et là seulement — qu'un segment se brise et qu'un nœud apparaît.
  const bigCrossV = (gx, gy, c) =>
    !!((c.mask & ROAD_N && big(get(gx, gy - 1))) || (c.mask & ROAD_S && big(get(gx, gy + 1))));
  const bigCrossH = (gx, gy, c) =>
    !!((c.mask & ROAD_E && big(get(gx + 1, gy))) || (c.mask & ROAD_W && big(get(gx - 1, gy))));

  const hRuns = [], vRuns = [], junctions = [], minorJunctions = [];
  const seenH = new Set(), seenV = new Set();
  const sec = (c) => !!(c && c.rank === "secondary" && c.roadSurface !== "bridge");
  const popcount = (m) => ((m & ROAD_N) ? 1 : 0) + ((m & ROAD_E) ? 1 : 0) + ((m & ROAD_S) ? 1 : 0) + ((m & ROAD_W) ? 1 : 0);
  for (const [key, cell] of roadMap) {
    const ci = key.indexOf(",");
    const gx = +key.slice(0, ci), gy = +key.slice(ci + 1);
    // Petit carrefour de rues (secondary) : croisement réel (degré ≥ 3) avec ≥ 2 bras
    // secondaires. Un sous-ensemble seedé reçoit un passage piéton — pas tous, mais
    // quand même, pour que les quartiers loin du centre en aient aussi.
    if (cell.rank === "secondary" && cell.roadSurface !== "bridge" && popcount(cell.mask) >= 3) {
      let armsMinor = 0;
      if ((cell.mask & ROAD_N) && sec(get(gx, gy - 1))) armsMinor |= ROAD_N;
      if ((cell.mask & ROAD_S) && sec(get(gx, gy + 1))) armsMinor |= ROAD_S;
      if ((cell.mask & ROAD_E) && sec(get(gx + 1, gy))) armsMinor |= ROAD_E;
      if ((cell.mask & ROAD_W) && sec(get(gx - 1, gy))) armsMinor |= ROAD_W;
      if (popcount(armsMinor) >= 2 && cmHash("xwalk:" + gx + ":" + gy) % 3 === 0)
        minorJunctions.push({ gx, gy, mask: armsMinor });
    }
    if (!big(cell)) continue;
    // Segment horizontal : cellules contiguës de même rang, connectées E-O, sans
    // grand axe vertical qui les traverse.
    if (connH(cell) && !bigCrossV(gx, gy, cell) && !seenH.has(key)) {
      let x0 = gx, x1 = gx;
      for (let x = gx - 1; ; x -= 1) { const c = get(x, gy); if (big(c) && c.rank === cell.rank && connH(c) && !bigCrossV(x, gy, c)) x0 = x; else break; }
      for (let x = gx + 1; ; x += 1) { const c = get(x, gy); if (big(c) && c.rank === cell.rank && connH(c) && !bigCrossV(x, gy, c)) x1 = x; else break; }
      for (let x = x0; x <= x1; x += 1) seenH.add(x + "," + gy);
      if (x1 > x0) hRuns.push({ gy, x0, x1, rank: cell.rank });
    }
    // Segment vertical (symétrique).
    if (connV(cell) && !bigCrossH(gx, gy, cell) && !seenV.has(key)) {
      let y0 = gy, y1 = gy;
      for (let y = gy - 1; ; y -= 1) { const c = get(gx, y); if (big(c) && c.rank === cell.rank && connV(c) && !bigCrossH(gx, y, c)) y0 = y; else break; }
      for (let y = gy + 1; ; y += 1) { const c = get(gx, y); if (big(c) && c.rank === cell.rank && connV(c) && !bigCrossH(gx, y, c)) y1 = y; else break; }
      for (let y = y0; y <= y1; y += 1) seenV.add(gx + "," + y);
      if (y1 > y0) vRuns.push({ gx, y0, y1, rank: cell.rank });
    }
    // Nœud : deux grands axes se croisent ici → mobilier de carrefour (passages
    // piétons, lignes d'arrêt, flèches) sur les approches qui mènent à un grand axe.
    if (bigCrossH(gx, gy, cell) && bigCrossV(gx, gy, cell)) {
      const m = cell.mask;
      let armsBig = 0;
      if ((m & ROAD_N) && big(get(gx, gy - 1))) armsBig |= ROAD_N;
      if ((m & ROAD_S) && big(get(gx, gy + 1))) armsBig |= ROAD_S;
      if ((m & ROAD_E) && big(get(gx + 1, gy))) armsBig |= ROAD_E;
      if ((m & ROAD_W) && big(get(gx - 1, gy))) armsBig |= ROAD_W;
      junctions.push({ gx, gy, rank: cell.rank, mask: m, armsBig });
    }
  }
  CM.roadRuns = { key: CM.layoutRecomputeAt, hRuns, vRuns, junctions, minorJunctions };
}

// Largeur de chaussée par rang/ère — alias de la source unique roadWidthFor.
function roadBodyWidth(rank, eraIndex) {
  return roadWidthFor(rank, eraIndex);
}

function cityMapDrawRoadMarkings() {
  const L = CM.layout;
  if (!L || CM.lodActive || CM.frameRuined || CM.collapseAt) return;
  const eraIndex = CM.frameEraIndex || 0;
  if (eraIndex < 7) return;                       // chaussée moderne : pas avant
  ensureRoadRuns();
  const R = CM.roadRuns;
  if (!R) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE, s = T * z;
  const SX = (gx) => (gx * T - CM.cam.x) * z + CM.cw / 2;
  const SY = (gy) => (gy * T - CM.cam.y) * z + CM.ch / 2;
  const painted = eraIndex >= 11;
  const markCol = eraIndex >= 18 ? "rgba(150,225,255,0.6)"       // néon / cosmique
    : painted ? "rgba(232,226,204,0.78)"                          // peinture claire
    : "rgba(214,194,140,0.32)";                                   // liseré pierre discret
  const lw = Math.max(1, s * 0.018);
  const dash = [s * 0.9, s * 0.7];   // tiret continu sur tout le segment (plus de phase par case)
  const night = CM.nightF || 0;
  // Pointillés réfléchissants : la nuit, la peinture rétroéclairée vire au blanc vif
  // (+ un léger halo additif posé séparément). Le bake statique est rebaké par
  // palier de nuit (clé _camKey ~ nightF.toFixed(1)), donc c'est gratuit par frame.
  const reflect = painted && night > 0.2;
  const dashCol = reflect ? `rgba(255,250,232,${(0.82 + 0.16 * night).toFixed(2)})` : markCol;
  const onScreen = (xa, ya, xb, yb) =>
    !(Math.max(xa, xb) < -s || Math.min(xa, xb) > CM.cw + s || Math.max(ya, yb) < -s || Math.min(ya, yb) > CM.ch + s);

  // Passage piéton : zébrures ajourées (// au sens) sur chaque approche du masque
  // `arms`, juste hors de la boîte. Centre laissé vide. Partagé grands axes / petites
  // rues (la largeur `half` s'adapte au rang) ; nombre de barres stable même étroit.
  const DIRS4 = [[ROAD_N, 0, -1], [ROAD_S, 0, 1], [ROAD_E, 1, 0], [ROAD_W, -1, 0]];
  const drawCrosswalk = (cx, cy, arms, half) => {
    const carHalf = half * 0.92;
    const step = Math.max(s * 0.07, (carHalf * 2) / 5);
    ctx.lineCap = "butt"; ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(236,230,208,${(0.5 + 0.32 * night).toFixed(2)})`;
    ctx.lineWidth = Math.max(1, s * 0.045);
    for (const [bit, ox, oy] of DIRS4) {
      if (!(arms & bit)) continue;
      const px = -oy, py = ox;
      for (let t = -carHalf + step * 0.5; t < carHalf; t += step) {
        ctx.beginPath();
        ctx.moveTo(cx + ox * s * 0.54 + px * t, cy + oy * s * 0.54 + py * t);
        ctx.lineTo(cx + ox * s * 0.72 + px * t, cy + oy * s * 0.72 + py * t);
        ctx.stroke();
      }
    }
  };

  // Lampadaires sur le terre-plein des boulevards : poteau sombre vu de dessus +
  // bulbe chaud qui rayonne la nuit. Espacés, sautent les bouts (près des nœuds).
  const drawMedianLamps = (axis, fixed, a0, a1, cen) => {
    if (eraIndex < 11) return;
    for (let c = a0 + 1; c < a1; c += 4) {
      const along = axis === "h" ? SX(c + 0.5) : SY(c + 0.5);
      const lx = axis === "h" ? along : cen;
      const ly = axis === "h" ? cen : along;
      if (lx < -s || lx > CM.cw + s || ly < -s || ly > CM.ch + s) continue;
      if (night > 0.25) cmDrawGlow(ctx, lx, ly, Math.max(3, s * 0.55), 255, 222, 150, 0.42 * night);
      ctx.fillStyle = "rgba(18,16,12,0.85)";
      ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, s * 0.035), 0, Math.PI * 2); ctx.fill();
      if (night > 0.25) {
        ctx.fillStyle = "rgba(255,236,180,0.9)";
        ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, s * 0.05), 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  const drawRun = (axis, fixed, a0, a1, rank) => {
    const half = s * roadBodyWidth(rank, eraIndex) * 0.5;
    const isMain = rank === "main";
    const cen = axis === "h" ? SY(fixed + 0.5) : SX(fixed + 0.5);
    const pa = axis === "h" ? SX(a0) : SY(a0);
    const pb = axis === "h" ? SX(a1 + 1) : SY(a1 + 1);
    if (axis === "h" ? !onScreen(pa, cen, pb, cen) : !onScreen(cen, pa, cen, pb)) return;
    const line = (off, col, width, dashes) => {
      ctx.strokeStyle = col; ctx.lineWidth = width; ctx.setLineDash(dashes || []);
      ctx.beginPath();
      if (axis === "h") { ctx.moveTo(pa, cen + off); ctx.lineTo(pb, cen + off); }
      else { ctx.moveTo(cen + off, pa); ctx.lineTo(cen + off, pb); }
      ctx.stroke();
    };
    // Bande pointillée + halo additif réfléchissant la nuit.
    const laneDash = (off) => {
      if (reflect) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        line(off, `rgba(255,242,205,${(0.16 + 0.24 * night).toFixed(2)})`, lw * 2.4, dash);
        ctx.restore();
      }
      line(off, dashCol, lw, dash);
    };
    const rive = half - Math.max(1, s * 0.03);
    line(-rive, markCol, lw);                       // lignes de rive continues
    line(rive, markCol, lw);
    // Le TERRE-PLEIN (avenue+) est dessiné en CONTINU dans une passe dédiée
    // (depuis L.median), APRÈS les runs — voir plus bas. Ici : rien de plus que
    // les lignes de rive (évite les coupures/carrés aux croisements).
    ctx.setLineDash([]);
  };

  for (const r of R.hRuns) drawRun("h", r.gy, r.x0, r.x1, r.rank);
  for (const r of R.vRuns) drawRun("v", r.gx, r.y0, r.y1, r.rank);

  // ── Terre-plein CONTINU (avenue+), depuis l'entité de layout L.median ────────
  // Ruban lisse le long de chaque segment (traverse les croisements sans coupure) +
  // bandes pointillées de part et d'autre + lampadaires. C'est la couche « décorable »
  // (une passe de décor future n'a qu'à parcourir L.median.medianSet).
  if (L.median && L.median.segments) {
    // Terre-plein (refuge) PIXEL-ART, par-dessous les bandes de voie + lampadaires.
    // L'aplat plat PROCÉDURAL (medianCol) a été SUPPRIMÉ : plus de repli, seul le
    // refuge pixel dessine le terre-plein ; dashes + lampes restent procéduraux.
    drawPixelMedians(CM);
    const mLine = (seg, pa, pb, cen, off, col, width, dashes) => {
      ctx.strokeStyle = col; ctx.lineWidth = width; ctx.setLineDash(dashes || []);
      ctx.beginPath();
      if (seg.axis === "h") { ctx.moveTo(pa, cen + off); ctx.lineTo(pb, cen + off); }
      else { ctx.moveTo(cen + off, pa); ctx.lineTo(cen + off, pb); }
      ctx.stroke();
    };
    for (const seg of L.median.segments) {
      const half = s * roadBodyWidth(seg.rank, eraIndex) * 0.5;
      const cen = seg.axis === "h" ? SY(seg.fixed + 0.5) : SX(seg.fixed + 0.5);
      const pa = seg.axis === "h" ? SX(seg.a0) : SY(seg.a0);
      const pb = seg.axis === "h" ? SX(seg.a1 + 1) : SY(seg.a1 + 1);
      if (seg.axis === "h" ? !onScreen(pa, cen, pb, cen) : !onScreen(cen, pa, cen, pb)) continue;
      if (painted) {                                   // bandes de voie de part et d'autre
        const off = half * (seg.rank === "main" ? 0.5 : 0.42);
        if (reflect) {
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const rc = `rgba(255,242,205,${(0.16 + 0.24 * night).toFixed(2)})`;
          mLine(seg, pa, pb, cen, -off, rc, lw * 2.4, dash); mLine(seg, pa, pb, cen, off, rc, lw * 2.4, dash);
          ctx.restore();
        }
        mLine(seg, pa, pb, cen, -off, dashCol, lw, dash); mLine(seg, pa, pb, cen, off, dashCol, lw, dash);
      }
      drawMedianLamps(seg.axis, seg.fixed, seg.a0, seg.a1, cen);   // lampadaires sur le terre-plein
    }
    ctx.setLineDash([]);
  }

  // Mobilier de carrefour — au BORD du nœud seulement, CENTRE laissé OUVERT (pas de
  // cadre) : passages piétons rayés (ajourés ≠ contour plein), lignes d'arrêt sur la
  // seule moitié ENTRANTE (conduite à droite → jamais un rectangle fermé), flèches au
  // sol pointant vers le carrefour. Passages piétons sur TOUS les carrefours de grands
  // axes (boulevards ET avenues) ; lignes d'arrêt + flèches sur les boulevards seuls.
  if (painted) {
    for (const j of R.junctions) {
      if (j.rank !== "main" && j.rank !== "avenue") continue;
      const cx = SX(j.gx + 0.5), cy = SY(j.gy + 0.5);
      if (cx < -s * 1.6 || cx > CM.cw + s * 1.6 || cy < -s * 1.6 || cy > CM.ch + s * 1.6) continue;
      const half = s * roadBodyWidth(j.rank, eraIndex) * 0.5;   // largeur selon le rang du nœud
      drawCrosswalk(cx, cy, j.armsBig, half);                   // passages piétons (boulevards + avenues)
      if (j.rank !== "main") continue;                          // lignes d'arrêt + flèches : boulevards
      const carHalf = half * 0.92;
      for (const [bit, ox, oy] of DIRS4) {
        if (!(j.armsBig & bit)) continue;
        const px = -oy, py = ox;
        const at = (d, t) => [cx + ox * d + px * t, cy + oy * d + py * t];
        // Ligne d'arrêt : moitié entrante (perp < 0) seulement → pas de cadre.
        ctx.lineCap = "butt"; ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(236,230,208,${(0.5 + 0.32 * night).toFixed(2)})`;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        const sa = at(s * 0.8, -carHalf), sb = at(s * 0.8, -s * 0.02);
        ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
        // Flèche au sol, voie entrante, pointe vers le carrefour.
        const tc = -carHalf * 0.5;
        const tip = at(s * 0.96, tc), tail = at(s * 1.24, tc), hb = at(s * 1.06, tc);
        ctx.fillStyle = `rgba(232,226,204,${(0.55 + 0.22 * night).toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(tip[0], tip[1]);
        ctx.lineTo(hb[0] + px * s * 0.07, hb[1] + py * s * 0.07);
        ctx.lineTo(hb[0] - px * s * 0.07, hb[1] - py * s * 0.07);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); ctx.moveTo(hb[0], hb[1]); ctx.lineTo(tail[0], tail[1]); ctx.stroke();
      }
    }
    // Petits carrefours de rues : passage piéton seul (sous-ensemble seedé).
    const secHalf = s * roadBodyWidth("secondary", eraIndex) * 0.5;
    for (const j of R.minorJunctions) {
      const cx = SX(j.gx + 0.5), cy = SY(j.gy + 0.5);
      if (cx < -s * 1.6 || cx > CM.cw + s * 1.6 || cy < -s * 1.6 || cy > CM.ch + s * 1.6) continue;
      drawCrosswalk(cx, cy, j.mask, secHalf);
    }
    ctx.lineCap = "butt"; ctx.setLineDash([]);
  }
}

// Style de pont par ère : bois → pierre → fer → béton → travée d'énergie.
function bridgeStyleFor(ei) {
  if (ei >= 30) return { kind: "cosmic", deck: "#2a2c3a", rail: "#454a64", post: "#1e2030", line: "rgba(120,205,255,0.55)" };
  if (ei >= 22) return { kind: "concrete", deck: "#8d9097", rail: "#6c7076", post: "#5a5e64", line: "rgba(245,240,225,0.45)" };
  if (ei >= 14) return { kind: "iron", deck: "#595e66", rail: "#3c4048", post: "#2f323a", line: "rgba(18,20,24,0.6)" };
  if (ei >= 6) return { kind: "stone", deck: "#9b9486", rail: "#7c7466", post: "#6b6354", line: "rgba(48,42,34,0.5)" };
  return { kind: "wood", deck: "#a07830", rail: "#6a4a10", post: "#5a3a10", line: "rgba(74,44,12,0.6)" };
}

function cityMapDrawBridgeSpan(sp) {
  const layout = CM.layout;
  if (!layout || !sp || !sp.cells || !sp.cells.length) return;
  const component = sp.cells, exits = sp.exits, vertical = sp.vertical, historic = sp.historic;
  let drawGx0 = sp.gx0, drawGx1 = sp.gx1, drawGy0 = sp.gy0, drawGy1 = sp.gy1;
  if (exits && exits.length) {
    const exXs = exits.map((r) => r.gx), exYs = exits.map((r) => r.gy);
    if (vertical) { drawGy0 = Math.min(drawGy0, ...exYs); drawGy1 = Math.max(drawGy1, ...exYs); }
    else { drawGx0 = Math.min(drawGx0, ...exXs); drawGx1 = Math.max(drawGx1, ...exXs); }
  }
  const s = CM.TILE * CM.cam.zoom;
  const sx = (drawGx0 * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (drawGy0 * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const totalW = (drawGx1 - drawGx0 + 1) * s;
  const totalH = (drawGy1 - drawGy0 + 1) * s;
  if (sx < -totalW - s || sy < -totalH - s || sx > CM.cw + s || sy > CM.ch + s) return;
  const ctx = CM.ctx;
  const ei = layout.counts ? layout.counts.eraIndex : 0;
  const st = bridgeStyleFor(ei);

  const deckFrac = historic ? 0.74 : 0.54;
  const bw = s * deckFrac;
  const bx = vertical ? sx + (totalW - bw) / 2 : sx;
  const by = vertical ? sy : sy + (totalH - bw) / 2;
  const deckW = vertical ? bw : totalW;
  const deckH = vertical ? totalH : bw;

  // Ombre portée sur l'eau. Historique : ombre élargie + piles = pont à arches.
  const shOff = s * 0.06;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(bx + shOff, by + shOff, deckW, deckH);
  if (historic) {
    const ext = s * 0.22;
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    if (vertical) ctx.fillRect(bx - ext, by + shOff, deckW + ext * 2, deckH);
    else ctx.fillRect(bx + shOff, by - ext, deckW, deckH + ext * 2);
    ctx.fillStyle = st.post;
    for (let q = 1; q <= 2; q += 1) {
      if (vertical) { const pierW = bw * 1.34, pierH = s * 0.32, py = by + (deckH * q) / 3 - pierH / 2; ctx.fillRect(bx + (deckW - pierW) / 2, py, pierW, pierH); }
      else { const pierH = bw * 1.34, pierW = s * 0.32, px = bx + (deckW * q) / 3 - pierW / 2; ctx.fillRect(px, by + (deckH - pierH) / 2, pierW, pierH); }
    }
  }

  // Tablier
  ctx.fillStyle = st.deck;
  ctx.fillRect(bx, by, deckW, deckH);

  // Détail de surface selon le matériau.
  if (st.kind === "concrete" || st.kind === "cosmic") {
    ctx.strokeStyle = st.line; ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.setLineDash([s * 0.12, s * 0.12]);
    ctx.beginPath();
    if (vertical) { ctx.moveTo(bx + deckW / 2, by); ctx.lineTo(bx + deckW / 2, by + deckH); }
    else { ctx.moveTo(bx, by + deckH / 2); ctx.lineTo(bx + deckW, by + deckH / 2); }
    ctx.stroke(); ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = st.line; ctx.lineWidth = Math.max(1, s * 0.04);
    const spacing = s * (st.kind === "stone" ? 0.28 : st.kind === "iron" ? 0.5 : 0.18);
    if (vertical) { for (let p = by + spacing * 0.5; p < by + deckH; p += spacing) { ctx.beginPath(); ctx.moveTo(bx, p); ctx.lineTo(bx + deckW, p); ctx.stroke(); } }
    else { for (let p = bx + spacing * 0.5; p < bx + deckW; p += spacing) { ctx.beginPath(); ctx.moveTo(p, by); ctx.lineTo(p, by + deckH); ctx.stroke(); } }
  }

  // Bombement (camber) du pont historique : crête centrale éclairée = « cintré ».
  if (historic) {
    const g = vertical ? ctx.createLinearGradient(bx, 0, bx + deckW, 0) : ctx.createLinearGradient(0, by, 0, by + deckH);
    g.addColorStop(0, "rgba(0,0,0,0.18)"); g.addColorStop(0.5, "rgba(255,245,220,0.20)"); g.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = g; ctx.fillRect(bx, by, deckW, deckH);
    const crownW = Math.max(2, bw * 0.18);
    ctx.fillStyle = "rgba(255,248,228,0.16)";
    if (vertical) ctx.fillRect(bx + (deckW - crownW) / 2, by, crownW, deckH);
    else ctx.fillRect(bx, by + (deckH - crownW) / 2, deckW, crownW);
  }

  // Garde-corps (rampes)
  const railW = Math.max(2, s * (historic ? 0.10 : 0.085));
  ctx.fillStyle = st.rail;
  if (vertical) { ctx.fillRect(bx, by, railW, deckH); ctx.fillRect(bx + deckW - railW, by, railW, deckH); }
  else { ctx.fillRect(bx, by, deckW, railW); ctx.fillRect(bx, by + deckH - railW, deckW, railW); }

  // Liseré : glow néon (cosmic) sinon liseré chaud sur le bord intérieur.
  const hilW = Math.max(1, s * (st.kind === "cosmic" ? 0.03 : 0.022));
  ctx.fillStyle = st.kind === "cosmic" ? st.line : "rgba(255,220,150,0.24)";
  if (vertical) { ctx.fillRect(bx + railW, by, hilW, deckH); ctx.fillRect(bx + deckW - railW - hilW, by, hilW, deckH); }
  else { ctx.fillRect(bx, by + railW, deckW, hilW); ctx.fillRect(bx, by + deckH - railW - hilW, deckW, hilW); }

  // Balustrade (balustres réguliers) : historique + pierre/béton.
  if (historic || st.kind === "stone" || st.kind === "concrete") {
    ctx.fillStyle = "rgba(255,245,225,0.18)";
    const bspc = s * 0.26, bsz = Math.max(1, s * 0.05);
    if (vertical) { for (let p = by + bspc * 0.5; p < by + deckH; p += bspc) { ctx.fillRect(bx + railW * 0.3, p, bsz, bsz); ctx.fillRect(bx + deckW - railW * 0.3 - bsz, p, bsz, bsz); } }
    else { for (let p = bx + bspc * 0.5; p < bx + deckW; p += bspc) { ctx.fillRect(p, by + railW * 0.3, bsz, bsz); ctx.fillRect(p, by + deckH - railW * 0.3 - bsz, bsz, bsz); } }
  }

  // Joint médian (séparateur) pour les ponts non-historiques larges.
  if (!historic) {
    ctx.fillStyle = "rgba(20,14,8,0.30)";
    const jointW = Math.max(1, s * 0.028);
    if (vertical) ctx.fillRect(bx + (deckW - jointW) / 2, by, jointW, deckH);
    else ctx.fillRect(bx, by + (deckH - jointW) / 2, deckW, jointW);
  }

  // Poteaux d'angle (ponts multi-cellules) OU pylônes-monument (historique).
  if (historic) {
    const pyW = Math.max(3, bw * 0.34), pyH = Math.max(4, s * 0.42);
    const pylon = (px, py) => {
      ctx.fillStyle = st.post; ctx.fillRect(px - pyW / 2, py - pyH / 2, pyW, pyH);
      ctx.fillStyle = "rgba(255,245,225,0.20)"; ctx.fillRect(px - pyW / 2, py - pyH / 2, pyW, Math.max(1, pyH * 0.14));
    };
    if (vertical) {
      const lx = bx + railW / 2, rx = bx + deckW - railW / 2;
      pylon(lx, by); pylon(rx, by); pylon(lx, by + deckH); pylon(rx, by + deckH);
    } else {
      const ty = by + railW / 2, byy = by + deckH - railW / 2;
      pylon(bx, ty); pylon(bx, byy); pylon(bx + deckW, ty); pylon(bx + deckW, byy);
    }
  } else if (component.length > 1) {
    const postSize = Math.max(2, s * 0.11);
    ctx.fillStyle = st.post;
    ctx.fillRect(bx, by, postSize, postSize);
    ctx.fillRect(bx + deckW - postSize, by, postSize, postSize);
    ctx.fillRect(bx, by + deckH - postSize, postSize, postSize);
    ctx.fillRect(bx + deckW - postSize, by + deckH - postSize, postSize, postSize);
  }
}

function cityMapDrawBridges() {
  const spans = CM.bridgeSpans;
  if (!CM.layout || !spans || !spans.length) return;
  for (const sp of spans) cityMapDrawBridgeSpan(sp);
}

// Lampes de pont, allumées la nuit. Couche ADDITIVE dessinée APRÈS le voile de
// nuit (sinon assombrie) : lampes le long des rampes, teinte d'ère (chaud → cyan
// → cosmique), plus denses/grandes sur le pont historique. Spans précalculés.
function cityMapDrawBridgeLights(now) {
  const L = CM.layout;
  if (!L || !L.counts || CM.lodActive) return;
  const night = CM.nightF || 0;
  if (night < 0.12) return;
  const spans = CM.bridgeSpans;
  if (!spans || !spans.length) return;
  const ei = L.counts.eraIndex || 0;
  if (ei < 4) return;                                  // pas de lampes avant l'antiquité
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE, s = T * z;
  const col = ei >= 30 ? "170,225,255" : ei >= 24 ? "150,225,255" : "255,205,140";
  const [cr, cg, cb] = col.split(",").map(Number);
  const a = Math.min(1, (night - 0.12) / 0.6);
  const SX = (gx) => (gx * T - CM.cam.x) * z + CM.cw / 2;
  const SY = (gy) => (gy * T - CM.cam.y) * z + CM.ch / 2;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  for (const sp of spans) {
    const hist = sp.historic;
    const edge = ((hist ? 0.74 : 0.54) / 2) * 0.86;    // position de la rampe (fraction tuile)
    const step = hist ? 1 : 2;
    for (let ci = 0; ci < sp.cells.length; ci += step) {
      const c = sp.cells[ci];
      const cx = SX(c.gx + 0.5), cy = SY(c.gy + 0.5);
      if (cx < -s || cx > CM.cw + s || cy < -s || cy > CM.ch + s) continue;
      const flick = 0.85 + 0.15 * Math.sin((now || 0) / 900 + c.gx * 7 + c.gy * 13);
      const al = a * (hist ? 0.95 : 0.7) * flick;
      const r = s * (hist ? 0.42 : 0.32);
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const lx = sp.vertical ? cx + sgn * edge * s : cx;
        const ly = sp.vertical ? cy : cy + sgn * edge * s;
        cmDrawGlow(ctx, lx, ly, r, cr, cg, cb, al * 0.5);
        ctx.fillStyle = `rgba(${col},${(al * 0.9).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, s * 0.05), 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.globalCompositeOperation = prev;
}

function cityMapDrawStreetLights(now) {
  const L = CM.layout;
  if (!L || !L.counts) return;
  // En vue LOD, les mâts de 2px sont du bruit — la couche de lumières
  // nocturnes assure seule l'éclairage vu de haut.
  if (CM.lodActive) return;
  const ei = L.counts.eraIndex;
  if (ei < 7) return;
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const night = CM.nightF || 0;
  const glowA = 0.45 + 0.55 * night;
  // La lanterne classique (style des places) est le look par défaut de la
  // ville ; les variantes futuriste/néon n'arrivent qu'aux ères avancées
  // (~35 ères au total : futuriste vers la métropole, néon en mégalopole).
  const cyberpunk = ei >= 30;
  const futuristic = ei >= 24;
  // Les esplanades ont leurs propres lanternes d'angle (positions fixes) :
  // aucun mât de RUE ne doit tomber sur l'emprise d'une place.
  const plazas = (L.plan && L.plan.plazas) || [];
  const onPlaza = (gx, gy) => {
    for (const p of plazas) {
      const half = Math.floor(p.size / 2);
      if (gx >= p.gx - half - 1 && gx <= p.gx - half + p.size
        && gy >= p.gy - half - 1 && gy <= p.gy - half + p.size) return true;
    }
    return false;
  };

  for (const r of CM.roadList) {
    if (r.rank !== "main" && r.rank !== "avenue") continue;
    if (onPlaza(r.gx, r.gy)) continue;
    const seed = cmHash(`lamp:${r.gx}:${r.gy}`);
    if (seed % 3 !== 0) continue;
    const mask = cmRoadMask(L, r.gx, r.gy);
    const degree = (mask.n ? 1 : 0) + (mask.e ? 1 : 0) + (mask.s ? 1 : 0) + (mask.w ? 1 : 0);
    if (degree >= 3) continue;
    const cxs = (r.gx * CM.TILE + CM.TILE * 0.5 - CM.cam.x) * z + CM.cw / 2;
    const cys = (r.gy * CM.TILE + CM.TILE * 0.5 - CM.cam.y) * z + CM.ch / 2;
    if (cxs < -s * 2 || cys < -s * 2 || cxs > CM.cw + s * 2 || cys > CM.ch + s * 2) continue;
    const isVert = (mask.n || mask.s) && !(mask.e || mask.w);
    const off = s * 0.34;

    for (let side = -1; side <= 1; side += 2) {
      const lx = cxs + (isVert ? side * off : 0);
      const ly = cys + (isVert ? 0 : side * off);
      const t2 = now || 0;

      if (cyberpunk) {
        // Tube néon : éteint (sombre) le jour, couleur + halo ∝ nuit.
        const hue = seed % 2 === 0 ? [50, 210, 255] : [255, 50, 200];
        const pulse = 0.65 + 0.25 * Math.sin(t2 / 500 + r.gx * 0.3 + r.gy * 0.4);
        ctx.strokeStyle = "#28303a"; ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.38); ctx.stroke();
        ctx.strokeStyle = "#1e2630"; ctx.lineWidth = Math.max(1.5, s * 0.03);
        ctx.beginPath(); ctx.moveTo(lx - s * 0.09, ly - s * 0.38); ctx.lineTo(lx + s * 0.09, ly - s * 0.38); ctx.stroke();
        if (night > 0.02) {
          const prev2 = ctx.globalCompositeOperation;
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${(night * pulse).toFixed(2)})`;
          ctx.lineWidth = Math.max(1.5, s * 0.03);
          ctx.beginPath(); ctx.moveTo(lx - s * 0.09, ly - s * 0.38); ctx.lineTo(lx + s * 0.09, ly - s * 0.38); ctx.stroke();
          ctx.globalCompositeOperation = prev2;
          cmDrawGlow(ctx, lx, ly - s * 0.38, s * 0.26, hue[0], hue[1], hue[2], night * pulse * 0.55);
        }
      } else if (futuristic) {
        // Mât moderne : tête sombre le jour, lumière froide ∝ nuit.
        ctx.strokeStyle = "#545e6a"; ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.34); ctx.stroke();
        ctx.strokeStyle = "#606a78"; ctx.lineWidth = Math.max(0.5, s * 0.013);
        ctx.beginPath(); ctx.moveTo(lx, ly - s * 0.34); ctx.lineTo(lx + s * 0.07, ly - s * 0.39); ctx.stroke();
        ctx.fillStyle = "#3a424e";
        ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.39, Math.max(1, s * 0.036), 0, Math.PI * 2); ctx.fill();
        cmDrawGlow(ctx, lx + s * 0.07, ly - s * 0.39, Math.max(2, s * 0.07), 210, 235, 255, night * 1.05);
        cmDrawGlow(ctx, lx + s * 0.07, ly - s * 0.39, s * 0.24, 190, 225, 255, night * 0.5);
      } else {
        // Lanterne classique — exactement le style des lanternes des places :
        // verre sombre le jour, cœur chaud + halo radial ∝ nuit.
        ctx.strokeStyle = "#3c342a"; ctx.lineWidth = Math.max(1, s * 0.045);
        ctx.beginPath(); ctx.moveTo(lx, ly + s * 0.1); ctx.lineTo(lx, ly - s * 0.26); ctx.stroke();
        ctx.fillStyle = "#4a4034";
        ctx.beginPath(); ctx.arc(lx, ly - s * 0.3, Math.max(1.2, s * 0.06), 0, Math.PI * 2); ctx.fill();
        cmDrawGlow(ctx, lx, ly - s * 0.3, Math.max(2, s * 0.1), 255, 215, 120, night * 1.1);
        cmDrawGlow(ctx, lx, ly - s * 0.3, s * 0.36, 255, 195, 90, night * 0.55);
      }
    }
  }
}

/* ---- legacy citymap rendering\agents.js ---- */
/* Moved to agents.js. */

/* ---- legacy citymap rendering\crisis.js ---- */


/* ============================================================================
 * citymap-render-crisis.js - Evenements visuels lies a l'instabilite.
 * ============================================================================ */

const RIOT_WONDER_CLEAR_R = WONDER_CLEAR_R + 2;

function cityMapRiotBlocked(gx, gy) {
  if (!CM.layout || !Array.isArray(state.wonders) || !state.wonders.length) return false;
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const w = CM_WONDERS[wi];
    if (!cmWonderActive(w, state)) continue;
    const slot = cmWonderSlot(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy);
    if (Math.hypot(gx - slot.gx, gy - slot.gy) <= RIOT_WONDER_CLEAR_R) return true;
  }
  return false;
}

function cityMapPickRiotRoadNear(origin, radius) {
  if (!CM.walkRoadList.length) return null;
  const safeRoads = CM.walkRoadList.filter((r) => !cityMapRiotBlocked(r.gx, r.gy));
  if (!safeRoads.length) return null;
  if (!origin) return safeRoads[Math.floor(Math.random() * safeRoads.length)];

  const near = [];
  for (const r of safeRoads) {
    const dist = Math.abs(r.gx - origin.gx) + Math.abs(r.gy - origin.gy);
    if (dist <= radius) near.push(r);
  }
  const pool = near.length ? near : safeRoads;
  return pool[Math.floor(Math.random() * pool.length)];
}

function cityMapRiotGroupCenter(rioters) {
  if (!rioters || !rioters.length) return null;
  let gx = 0, gy = 0;
  for (const p of rioters) {
    gx += p.x / CM.TILE - 0.5;
    gy += p.y / CM.TILE - 0.5;
  }
  return { gx: gx / rioters.length, gy: gy / rioters.length };
}

// Arme brandie d'un émeutier (torche ou fourche), bras levé qui s'agite. Ancrée à
// une main (hx,hy) avec une unité d'échelle u — partagée par le rendu PIXEL (ancré
// au sprite d'habitant) et le repli vectoriel (ancré à la silhouette).
function drawRiotWeapon(ctx, hx, hy, u, weapon, now, phase, pulse) {
  const wave = Math.sin(now / 200 + (phase || 0) * 2) * u * 0.18;
  ctx.strokeStyle = "#6b4a26";
  ctx.lineWidth = Math.max(1, u * 0.18);
  if (weapon === "fork") {
    // Manche de fourche + trois dents métalliques
    const tipX = hx + u * 0.25 + wave, tipY = hy - u * 1.7;
    ctx.beginPath(); ctx.moveTo(hx - u * 0.15, hy + u * 0.5); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = "#aab2bc";
    ctx.lineWidth = Math.max(0.8, u * 0.12);
    for (let d = -1; d <= 1; d += 1) {
      ctx.beginPath();
      ctx.moveTo(tipX + d * u * 0.22, tipY);
      ctx.lineTo(tipX + d * u * 0.22, tipY - u * 0.45);
      ctx.stroke();
    }
  } else {
    // Manche de torche + flamme vacillante et halo chaud
    const tipX = hx + u * 0.2 + wave, tipY = hy - u * 1.2;
    ctx.beginPath(); ctx.moveTo(hx - u * 0.1, hy + u * 0.3); ctx.lineTo(tipX, tipY); ctx.stroke();
    const flick = 0.75 + 0.25 * Math.sin(now / 90 + (phase || 0) * 5);
    ctx.fillStyle = `rgba(255,170,40,${(0.18 * flick).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(tipX, tipY - u * 0.2, u * 0.9 * flick, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,150,40,${(0.65 + 0.3 * pulse).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(tipX, tipY - u * 0.15, u * 0.32 * flick, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,230,120,0.9)";
    ctx.beginPath(); ctx.arc(tipX, tipY - u * 0.12, u * 0.16 * flick, 0, Math.PI * 2); ctx.fill();
  }
}

// Apaisement au clic : retire l'émeutier visé, fait retomber un peu la rupture
// et empêche le groupe de se re-remplir aussitôt (compteur à décroissance).
function cityMapCalmRioterAt(sx, sy) {
  if (!Array.isArray(CM.rioters) || !CM.rioters.length) return false;
  const z = CM.cam.zoom;
  const radius = Math.max(14, 10 * z);
  let bi = -1, bd = Infinity;
  for (let i = 0; i < CM.rioters.length; i += 1) {
    const p = CM.rioters[i];
    // Projection UNIQUE (identité en legacy) : en iso le clic doit viser la
    // position DESSINÉE de l'émeutier, pas son ancien mapping planaire.
    const sp = isoWorldToScreen(p.x, p.y);
    const d = Math.hypot(sp.x - sx, sp.y - sy);
    if (d < radius && d < bd) { bd = d; bi = i; }
  }
  if (bi < 0) return false;
  const p = CM.rioters.splice(bi, 1)[0];
  CM.riotCalmed = (CM.riotCalmed || 0) + 1;
  if (!CM.calmPoofs) CM.calmPoofs = [];
  CM.calmPoofs.push({ x: p.x, y: p.y, t: performance.now() });
  // Geste réel mais modeste : −0.2 pt de Rupture par émeutier apaisé.
  state.instability = Math.max(0, (state.instability || 0) - 0.002);
  return true;
}

// ── SIM d'émeute (partagée legacy + iso) — extraite de drawCrisis ────────────
// Le pipeline ISO l'appelle depuis drawIsoWorld puis dessine les émeutiers comme
// items du TRI PEINTRE (drawIsoLive) ; le legacy garde son rendu planaire dans
// drawCrisis ci-dessous, inchangé. Pose CM.riotDraw = { pts, cx, cy } (émeutiers
// actifs remappés sur route + centre de foule) ou null, consommé par les DEUX.
function updateCrisis(dt, now) {
  if (!CM.layout) return;
  const inst = state.instability || 0;

  if (!CM.rioters) CM.rioters = [];
  // Les émeutes n'éclatent que l'après-midi. La fenêtre est publiée par le
  // point de bascule du cycle (CM.riotWindow, cityMapRuntime) : elle suit
  // l'horloge SIMULÉE — l'option d'affichage Jour/Nuit ne la touche pas — et
  // vaut 23 % du temps réel, la dose de l'ancienne courbe sinus. Ne PAS la
  // re-dériver de CM.dayRising/nightF : ceux-là portent le VISUEL (forçables).
  // En capture (CM.capture), la fenêtre est coupée à la source : les clichés
  // __cityShot sont déterministes, jamais de foule dessus.
  const afternoon = CM.riotWindow === true;
  const baseWant = afternoon && inst > 0.55 && CM.walkRoadList.length ? Math.floor((inst - 0.55) / 0.45 * 36) + 8 : 0;
  // Les apaisements au clic réduisent la foule ; l'effet s'estompe avec le temps
  // (1 émeutier "revient" toutes les ~8 s tant que la tension persiste).
  if ((CM.riotCalmed || 0) > 0) {
    CM.riotCalmDecayT = (CM.riotCalmDecayT || 0) + dt;
    if (CM.riotCalmDecayT >= 8) { CM.riotCalmDecayT = 0; CM.riotCalmed -= 1; }
  }
  const want = baseWant > 0 ? Math.max(0, baseWant - (CM.riotCalmed || 0)) : 0;
  if (want === 0) {
    CM.rioters.length = 0;
    CM.riotGoal = null;
    if (baseWant === 0) { CM.riotCalmed = 0; CM.riotCalmDecayT = 0; }
    CM.riotDraw = null;
  } else {
    const isRoad = (x, y) => CM.walkRoadSet.has(cityMapWalkRoadKey(x, y)) && !cityMapRiotBlocked(x, y);
    const groupCenter = cityMapRiotGroupCenter(CM.rioters);
    if (!CM.riotGoal || !isRoad(CM.riotGoal.gx, CM.riotGoal.gy) || (now - (CM.riotGoalAt || 0)) > 5000) {
      CM.riotGoal = cityMapPickRiotRoadNear(groupCenter || CM.rioters[0], 6 + Math.round(inst * 8));
      CM.riotGoalAt = now;
    }
    const spawnAnchor = groupCenter || CM.riotGoal;
    // Même garde-robe que les habitants : tuniques teintes + teints de peau.
    const RIOT_OUTFITS = ["#9a4d38", "#3f6a8a", "#7a8a3c", "#8a5d9a", "#b08a3a", "#5d7a6a"];
    const RIOT_SKINS = ["#e8c8a0", "#d4a878", "#b88a58", "#8a5c38"];
    while (CM.rioters.length < want) {
      const r = cityMapPickRiotRoadNear(spawnAnchor, 2 + Math.round(inst));
      if (!r) break;
      const n = CM.rioters.length;
      CM.rioters.push({
        gx: r.gx,
        gy: r.gy,
        x: (r.gx + 0.5) * CM.TILE,
        y: (r.gy + 0.5) * CM.TILE,
        tx: (r.gx + 0.5) * CM.TILE,
        ty: (r.gy + 0.5) * CM.TILE,
        dir: -1,
        pauseT: 0,
        speed: 24 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        lane: (Math.random() - 0.5) * CM.TILE * 0.38,
        col: RIOT_OUTFITS[n % RIOT_OUTFITS.length],
        skin: RIOT_SKINS[(n * 7 + 3) % RIOT_SKINS.length],
        weapon: n % 2 === 0 ? "torch" : "fork",
        charType: n % 3 === 0 ? 1 : 0 // émeutiers adultes : ~1/3 de femmes, pas d'enfants
      });
    }
    if (CM.rioters.length > want) CM.rioters.length = want;
    const goal = CM.riotGoal;
    const cohesion = cityMapRiotGroupCenter(CM.rioters) || goal;
    let mx = 0, my = 0;
    const pts = [];
    for (const p of CM.rioters) {
      if (!isRoad(p.gx, p.gy)) {
        const r = cityMapPickRiotRoadNear(cohesion, 6 + Math.round(inst * 4));
        if (!r) continue;
        p.gx = r.gx;
        p.gy = r.gy;
        p.x = (r.gx + 0.5) * CM.TILE;
        p.y = (r.gy + 0.5) * CM.TILE;
        p.tx = p.x;
        p.ty = p.y;
        p.dir = -1;
      }
      if (p.pauseT > 0) {
        p.pauseT -= dt;
      } else {
        const ddx = p.tx - p.x, ddy = p.ty - p.y, dd = Math.hypot(ddx, ddy);
        if (dd < 2.4) {
          if (Math.random() < 0.035) {
            p.pauseT = 0.12 + Math.random() * 0.35;
          } else {
            const rev = p.dir >= 0 ? (p.dir ^ 1) : -1;
            const opts = [];
            for (let i = 0; i < 4; i += 1) {
              const nx = p.gx + CM_DIRS[i][0], ny = p.gy + CM_DIRS[i][1];
              if (isRoad(nx, ny) && roadStepAllowed(p.gx, p.gy, i)) opts.push({ i, nx, ny });
            }
            const pool = opts.filter((o) => o.i !== rev);
            const use = pool.length ? pool : opts;
            let best = use[0], bs = -Infinity;
            const groupDistNow = Math.abs(cohesion.gx - p.gx) + Math.abs(cohesion.gy - p.gy);
            const personalGoal = groupDistNow > 4.5 ? cohesion : goal;
            for (const o of use) {
              const groupDistNext = Math.abs(cohesion.gx - o.nx) + Math.abs(cohesion.gy - o.ny);
              let sc = -(Math.abs(personalGoal.gx - o.nx) + Math.abs(personalGoal.gy - o.ny));
              sc -= groupDistNext * (personalGoal === cohesion ? 0.25 : 0.85);
              if (o.i === p.dir) sc += 1.25;
              sc += Math.random() * 0.9;
              if (sc > bs) {
                bs = sc;
                best = o;
              }
            }
            if (best) {
              p.gx = best.nx;
              p.gy = best.ny;
              p.dir = best.i;
              p.tx = (p.gx + 0.5) * CM.TILE;
              p.ty = (p.gy + 0.5) * CM.TILE;
            }
          }
        } else {
          const sp = p.speed * dt;
          p.x += ddx / dd * sp;
          p.y += ddy / dd * sp;
          // Odomètre de marche (px monde) : anime les bandes diagonales PAR
          // DISTANCE (drawNamedAgentIso) — les pieds accrochent le sol.
          p.walkDist = (p.walkDist || 0) + sp;
        }
      }
      mx += p.x;
      my += p.y;
      pts.push(p);
    }
    // Liste de rendu PARTAGÉE : le legacy la peint ci-dessous (drawCrisis),
    // l'iso la pousse dans le tri peintre (drawIsoLive, items 'riot').
    CM.riotDraw = pts.length ? { pts, cx: mx / pts.length, cy: my / pts.length } : null;
  }
}

// Rendu LEGACY de la crise (planaire) : la sim est déléguée à updateCrisis, le
// dessin est inchangé — halo de foule, émeutiers (sprite d'ère + repli
// vectoriel), anneaux d'apaisement, famine. Le pipeline ISO ne passe pas ici :
// il consomme CM.riotDraw dans le tri peintre (drawIsoLive).
function drawCrisis(dt, now) {
  if (!CM.layout) return;
  updateCrisis(dt, now);
  const ctx = CM.ctx, z = CM.cam.zoom;
  const inst = state.instability || 0;
  const cs = (wx, wy) => ({ x: (wx - CM.cam.x) * z + CM.cw / 2, y: (wy - CM.cam.y) * z + CM.ch / 2 });
  if (CM.riotDraw) {
    const pts = CM.riotDraw.pts;
    {
      const c = cs(CM.riotDraw.cx, CM.riotDraw.cy);
      const pulse = 0.5 + 0.5 * Math.sin(now / 320);
      const R = (1.6 + inst * 1.4) * CM.TILE * z;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(1, R));
      g.addColorStop(0, `rgba(200,40,30,${(0.16 + 0.12 * pulse).toFixed(2)})`);
      g.addColorStop(1, "rgba(200,40,30,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(1, R), 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const laneX = (p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0;
        const laneY = (p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0;
        const wob = Math.sin(now / 170 + (p.phase || 0)) * 0.8;
        const sx = (p.x + laneX - CM.cam.x) * z + CM.cw / 2;
        const sy = (p.y + laneY - CM.cam.y) * z + CM.ch / 2 + wob * z;
        if (sx < -8 || sy < -8 || sx > CM.cw + 8 || sy > CM.ch + 8) continue;

        // ── Même design que les habitants : sprite PIXEL de l'ère + arme brandie ;
        //    repli sur la silhouette vectorielle tant que les sprites ne chargent pas. ──
        const ph = Math.max(1.5, 2.1 * z);
        const walking = p.pauseT <= 0;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath(); ctx.ellipse(sx, sy + ph * 1.35, ph * 0.85, ph * 0.32, 0, 0, Math.PI * 2); ctx.fill();
        const groundY = sy + ph * 1.35;
        // Sprite ÉMEUTIER dédié (arme bakée) selon genre (charType) + arme (torche/outil)
        // ET selon l'ÈRE (riotEraKey) → costume de l'ère, comme les habitants. Repli sur le
        // jeu médiéval de base (non préfixé) tant qu'une ère n'a pas encore ses sprites.
        const rgen = ((p.charType || 0) === 1 ? 'woman' : 'man') + '-' + (p.weapon === 'fork' ? 'fork' : 'torch');
        const rEra = riotEraKey((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0);
        let dim = drawNamedAgent(ctx, sx, groundY, z, 'rioter-' + rEra + rgen, 0.85, p.dir, walking, now, p.phase);
        if (!dim && rEra) dim = drawNamedAgent(ctx, sx, groundY, z, 'rioter-' + rgen, 0.85, p.dir, walking, now, p.phase);
        if (dim) {
          // Flamme bakée ; on n'ajoute qu'un halo chaud additif la NUIT pour les
          // torches (haut du sprite) → la menace nocturne reste lisible.
          if (p.weapon !== "fork" && (CM.nightF || 0) > 0.05) {
            const flick = 0.8 + 0.2 * Math.sin(now / 90 + (p.phase || 0) * 5);
            const gx2 = sx + dim.drawW * 0.18, gy2 = dim.top + dim.drawH * 0.16, gr = Math.max(1, dim.drawW * 0.5 * flick);
            const prevOp = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = "lighter";
            const g2 = ctx.createRadialGradient(gx2, gy2, 0, gx2, gy2, gr);
            g2.addColorStop(0, `rgba(255,180,70,${(0.2 * (CM.nightF || 0) * flick).toFixed(2)})`);
            g2.addColorStop(1, "rgba(255,150,40,0)");
            ctx.fillStyle = g2;
            ctx.beginPath(); ctx.arc(gx2, gy2, gr, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = prevOp;
          }
          continue;
        }
        // ── Repli vectoriel : sprites pas encore chargés ──
        if (ph > 2 && walking) {
          const step = Math.sin(now / 110 + (p.phase || 0) * 3) * ph * 0.45;
          ctx.strokeStyle = "#241a10";
          ctx.lineWidth = Math.max(1, ph * 0.28);
          ctx.beginPath(); ctx.moveTo(sx - ph * 0.12, sy + ph * 0.35); ctx.lineTo(sx - ph * 0.15 + step * 0.5, sy + ph * 1.3); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sx + ph * 0.12, sy + ph * 0.35); ctx.lineTo(sx + ph * 0.15 - step * 0.5, sy + ph * 1.3); ctx.stroke();
        }
        ctx.fillStyle = p.col || "#9a4d38";
        ctx.beginPath();
        ctx.moveTo(sx - ph * 0.62, sy - ph * 0.45);
        ctx.quadraticCurveTo(sx - ph * 0.5, sy + ph * 0.65, sx - ph * 0.3, sy + ph * 0.62);
        ctx.lineTo(sx + ph * 0.3, sy + ph * 0.62);
        ctx.quadraticCurveTo(sx + ph * 0.5, sy + ph * 0.65, sx + ph * 0.62, sy - ph * 0.45);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(sx - ph * 0.5, sy - ph * 0.45, ph, Math.max(0.5, ph * 0.2));
        ctx.fillStyle = p.skin || "#e0b890";
        ctx.beginPath(); ctx.arc(sx, sy - ph * 0.85, ph * 0.5, 0, Math.PI * 2); ctx.fill();
        if (ph > 1.8) drawRiotWeapon(ctx, sx + ph * 0.55, sy - ph * 0.2, ph, p.weapon, now, p.phase, pulse);
      }
    }
  }

  // Anneaux d'apaisement : feedback du clic sur un émeutier (0,7 s).
  if (CM.calmPoofs && CM.calmPoofs.length) {
    for (let i = CM.calmPoofs.length - 1; i >= 0; i -= 1) {
      const e = CM.calmPoofs[i];
      const k = (now - e.t) / 700;
      if (k >= 1) { CM.calmPoofs.splice(i, 1); continue; }
      const c = cs(e.x, e.y);
      const r = (4 + k * 14) * Math.max(0.6, z);
      ctx.strokeStyle = `rgba(150,230,170,${(0.8 * (1 - k)).toFixed(2)})`;
      ctx.lineWidth = Math.max(1, 2 * z * (1 - k));
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  const famine = toNum(state.population) > 60 && toNum(state.food) < toNum(state.population) * 1.1;
  if (famine) {
    const target = CM.layout.tiles.find((t) => t.type === "house");
    if (target) {
      for (let i = 0; i < 10; i += 1) {
        const p = cs((target.gx + 0.5) * CM.TILE + (i + 1) * CM.TILE * 0.5, (target.gy + 0.5) * CM.TILE + Math.sin(i * 1.3) * 3);
        ctx.fillStyle = "rgba(220,200,150,0.85)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, 1.6 * z), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ── Voile de santé : la taille pilote l'échelle, la santé pilote l'ambiance ──
// Santé basse → désaturation + dominante brune (le brun-crotte devient un
// signal de crise). Santé haute → légère vibrance : une grande ville équilibrée
// est éclatante. Appliqué plein écran, avant la nuit.
function cityMapDrawHealthTint() {
  if (!CM.layout) return;
  const h = CM.healthF;
  const ctx = CM.ctx;
  const prev = ctx.globalCompositeOperation;
  if (h < 0.45) {
    const k = Math.min(1, (0.45 - h) / 0.45);
    ctx.globalCompositeOperation = "saturation";
    ctx.fillStyle = `rgba(128,128,128,${(k * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgba(${Math.round(214 - k * 34)},${Math.round(196 - k * 50)},${Math.round(170 - k * 66)},${(k * 0.42).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
  } else if (h > 0.66) {
    const k = Math.min(1, (h - 0.66) / 0.34);
    // Vibrance : la teinte du fond est conservée, seule la saturation monte.
    ctx.globalCompositeOperation = "saturation";
    ctx.fillStyle = `rgba(255,0,0,${(k * 0.12).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = `rgba(186,226,160,${(k * 0.18).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
  }
  ctx.globalCompositeOperation = prev;
}

// ── Tapis de lumières nocturnes ──────────────────────────────────────────────
// Calque additif au-dessus du voile de nuit : fenêtres chaudes sur les
// bâtiments (densité ∝ population, éteintes quand la ville agonise), rangées
// de fenêtres sur les grands districts, phares des véhicules motorisés.
// Tout est seedé par tuile : aucun scintillement non maîtrisé, juste une
// respiration lente par foyer.
function cityMapDrawCityLights(now) {
  const L = CM.layout;
  const n = CM.nightF || 0;
  if (!L || n < 0.1 || !L.counts || L.counts.eraBand < 1) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const seed = (L.mapSeed || 0) >>> 0;
  const health = CM.healthF;
  const ruined = CM.frameRuined;
  // Densité de foyers éclairés : croît avec la population (log) et s'éteint
  // avec la santé — une ville en crise est une ville sombre.
  const pop = toNum(state.population);
  let density = Math.max(0.1, Math.min(0.92, 0.16 + Math.log10(Math.max(1, pop)) * 0.075))
    * (0.35 + health * 0.65);
  if (ruined) density *= 0.22;
  const a = Math.min(1, (n - 0.1) / 0.7); // montée progressive au crépuscule
  const warm = mapThemeForBand(L.counts.eraBand).nightWarm;
  const [wr, wg, wb] = warm.split(",").map(Number);
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";

  // Fenêtres des bâtiments (habitations et moteurs).
  const t9 = now / 5200;
  for (const t of L.tiles) {
    const span = t.size || 1;
    const sx = (t.gx * T - CM.cam.x) * z + CM.cw / 2;
    const sy = (t.gy * T - CM.cam.y) * z + CM.ch / 2;
    const s = T * z * span;
    if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
    const h = (Math.imul(t.gx | 0, 73856093) ^ Math.imul(t.gy | 0, 19349663) ^ seed) >>> 0;
    if ((h % 100) >= density * 100) continue;
    // 1 fenêtre par tuile simple, jusqu'à 4 sur les grandes emprises moteur.
    const nW = span >= 3 ? 4 : span >= 2 ? 2 : 1;
    const ws = Math.max(1, T * z * 0.085);
    // Respiration lente et stable par foyer (pas de scintillement).
    const breathe = 0.8 + 0.2 * Math.sin(t9 + (h % 628) / 100);
    const alpha = a * breathe;
    for (let wi = 0; wi < nW; wi += 1) {
      const hx = (h >> (3 + wi * 5)) % 100, hy = (h >> (5 + wi * 5)) % 100;
      const wx = sx + s * (0.18 + (hx / 100) * 0.6);
      const wy = sy + s * (0.16 + (hy / 100) * 0.55);
      // Halo radial doux (sprite de glow mis en cache) + cœur chaud carré
      // (la fenêtre elle-même) — intensité entièrement pilotée par la nuit.
      cmDrawGlow(ctx, wx + ws / 2, wy + ws / 2, ws * 2.3, wr, wg, wb, alpha * 0.35);
      ctx.fillStyle = `rgba(${warm},${(alpha * 0.6).toFixed(3)})`;
      ctx.fillRect(wx, wy, ws, ws);
    }
  }

  // Phares des véhicules motorisés — ANCIEN tapis lumineux (dessiné par-dessus bâtiments +
  // nuit, d'où le bug de z-order). Désactivé par défaut : les phares sont maintenant dessinés
  // À LA PROFONDEUR du véhicule (drawVehicleHeadlights, agents.js). __headlightDepth(false) le rétablit.
  if (CM.headlightDepth === false && n > 0.3 && Array.isArray(CM.vehicles) && (L.counts.eraIndex || 0) >= 14) {
    const hl = Math.max(1, T * z * 0.06);
    for (const v of CM.vehicles) {
      if (v.type !== "car" && v.type !== "tram") continue;
      if ((v.parkT || 0) > 0 || v.pauseT > 0) continue; // garé/arrêté : phares éteints
      // Même décalage de file que la carrosserie → phares solidaires de la voiture.
      const lo = vehicleLaneOffset(v, T * z);
      const sx = (v.x - CM.cam.x) * z + CM.cw / 2 + lo.x;
      const sy = (v.y - CM.cam.y) * z + CM.ch / 2 + lo.y;
      if (sx < -8 || sy < -8 || sx > CM.cw + 8 || sy > CM.ch + 8) continue;
      // Cap réel du véhicule (vitesse, sinon direction de grille : 0=E 1=W 2=S 3=N).
      let hx = v.tx - v.x, hy = v.ty - v.y;
      const hd = Math.hypot(hx, hy);
      if (hd > 0.5) { hx /= hd; hy /= hd; }
      else { hx = v.dir === 0 ? 1 : v.dir === 1 ? -1 : 0; hy = v.dir === 2 ? 1 : v.dir === 3 ? -1 : 0; }
      const px = -hy, py = hx; // perpendiculaire (écart entre les deux phares)
      const off = T * z * 0.2;
      // Deux phares ronds à l'AVANT + faisceau elliptique orienté devant.
      ctx.fillStyle = `rgba(255,244,210,${(a * 0.75).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx + hx * off + px * hl, sy + hy * off + py * hl, hl * 0.55, 0, Math.PI * 2);
      ctx.arc(sx + hx * off - px * hl, sy + hy * off - py * hl, hl * 0.55, 0, Math.PI * 2);
      ctx.fill();
      // Faisceau : halo radial étiré dans l'axe du véhicule.
      ctx.save();
      ctx.translate(sx + hx * off * 2.6, sy + hy * off * 2.6);
      ctx.rotate(Math.atan2(hy, hx));
      ctx.globalAlpha = a * 0.4;
      ctx.drawImage(cmGlowSprite(255, 238, 180), -hl * 3.4, -hl * 1.8, hl * 6.8, hl * 3.6);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalCompositeOperation = prev;
}

export {
  baseColor,
  cityMapDrawBridges,
  cityMapDrawBridgeLights,
  cityMapDrawGround,
  cityMapDrawTerrain,
  cityMapDrawHealthTint,
  cityMapDrawCityLights,
  cityMapDrawCityReflections,
  cityMapDrawNight,
  cityMapDrawPlazaSurface,
  cityMapDrawPlazas,
  cityMapDrawPlazaTallProps,
  cityMapDrawQuays,
  cityMapDrawRiver,
  ensureQuayGate,
  cityMapDrawRoad,
  cityMapDrawRoadMarkings,
  cityMapDrawStreetLights,
  cityMapDrawTrees,
  cityMapDrawUrbanMass,
  cmLitColor,
  drawCrisis,
  updateCrisis,
  drawRiotWeapon,
  cityMapCalmRioterAt
};
