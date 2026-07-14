"use strict";
// ── CHANTIER ISO — Phase 1 : renderer du JALON go/no-go ─────────────────────
// Rendu isométrique SÉPARÉ du pipeline legacy (leçon greybox : ne pas infecter
// renderWorld de demi-conversions). Branché dans la frame par `CM.iso` ; le
// legacy reste intact au flag près. Ce renderer réutilise LE MÊME layout et les
// helpers de sprites existants — il ne re-calcule rien côté jeu.
//
// Périmètre Phase 1 (voulu MINCE, on juge le SOL et la LISIBILITÉ) :
//   - sol en losanges flat-shaded (herbe/urbain/place/eau) + routes par matière d'ère ;
//   - habitations posées TELLES QUELLES (sprites actuels, ancrés au coin sud) ;
//   - tuiles moteur/civiques = SOCLE teinté (scènes → Phase 3) ;
//   - arbres = sapin minimal ; habitants = sprites actuels (4 dirs cardinales,
//     re-générés en diagonales en Phase 4) ; véhicules mis à jour mais PAS dessinés ;
//   - PAS de nuit/santé/LOD/lumières/ponts/quais/merveilles ici (Phases 3-5).
// Tuiles PixelLab iso : APRÈS le go (le jalon protège le budget d'art).
import { CM, cmHash, ROAD_E, ROAD_N, ROAD_S, ROAD_W, CM_WONDERS, cmWonderActiveIds, cmWonderSlot, cmForEachWonderCell } from '../layout.js';
import { state } from '../../core/state.js';
import { worldToScreen, visibleCellBounds, depthOf, ISO_X, ISO_Y } from './projection.js';
import { drawPixelHouse, pixelHouseReady } from '../pixelHouses.js';
import { drawEngineSprite } from '../buildingShapes.js';
import { drawWonder } from '../renderBuildings.js';
import { engineStage, propReady, blitProp, propBBox, propImage } from '../cityEngineSprites.js';
import { cityMapDrawQuays, updateCrisis, drawRiotWeapon } from '../renderWorld.js';
import { drawPixelBridges } from '../pixelBridge.js';
import { waterRippleTune } from '../pixelRiver.js';
import {
  updateCitizens, updateVehicles, drawEraAgent, drawEraAgentIso, drawNamedAgent, drawNamedAgentIso,
  drawVehicleHeadlights, drawCitizenThoughts,
  vehicleLaneOffset, ensureVeh, vehReady, VEH_SIZES, VEH_PULL, VEH_PUSH,
  ensureBoat, boatReady, BOAT_SIZES, BOAT_LIFT, ensureDrone, drawDroneRotors,
  ensureVehDiag, vehDiagReady, riotEraKey,
} from '../agents.js';

// ── Palette Phase 1 (flat, calée sur les teintes du rendu actuel) ────────────
const GRASS = [116, 138, 84];        // herbe / nature
const GRASS_WILD = [98, 120, 76];    // hors ville (léger contraste)
const WATER = [74, 98, 109];         // eau ardoise (cf. fleuve)
const PLAZA = [214, 206, 182];       // dallage d'esplanade
// Bas-fond CLAIR le long des rives (drawIsoRiver) : 3 bandes CLAIR (bord) → profond
// (centre). Réglable live via window.__waterShore({ on, w1,w2,w3, a1,a2,a3, c1,c2,c3 }).
export const waterShoreTune = {
  on: false,                                               // OFF : le bas-fond est désormais dessiné
                                                           // par le QUAI (drawRun, renderWorld) pour SUIVRE le
                                                           // pied du mur ; celui-ci restait derrière (ligne d'eau).
  w1: 20, w2: 11, w3: 5,                                    // largeurs (× zoom)
  a1: 0.5, a2: 0.6, a3: 0.72,                               // alphas (bord = plus opaque)
  c1: '128,166,156', c2: '166,198,184', c3: '202,224,214'  // teintes, de la + douce à la + claire
};
// Matière de chaussée par ère (calée sur la progression du jeu) :
// terre battue → pavé de pierre → asphalte industriel → voie sombre futuriste.
// Chaussée LISSE : teinte pleine par ère (la matière se lit à la COULEUR, pas à un
// motif — Raph « route lisse, pas de gros motif »). Choisies pour TRANCHER sur le sol
// de l'ère (route plus sombre/neutre que le sol texturé). Rendu = ruban plat + trottoir
// + marquage, aucune tuile.
function roadTone(band) {
  return band >= 7 ? [62, 68, 84]      // tech — voie bleu-gris sombre
    : band >= 6 ? [74, 74, 78]         // asphalte
      : band >= 4 ? [150, 146, 136]    // pierre — voie dallée claire
        : band >= 2 ? [128, 118, 104]  // pavé — rue grise
          : [138, 118, 90];            // terre — sentier
}
const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// ── Tuiles de SOL PixelLab (post-GO) — /pixelart/iso/<key>.png ────────────────
// Chargées paresseusement ; tant qu'un PNG n'est pas prêt, le losange garde son
// APLAT (repli) → aucune dépendance dure à l'art. bbox mesurée une fois (alpha>16,
// même geste que pixelHouses.contentBBox) : le HAUT du contenu = sommet NORD du
// losange, largeur du contenu → largeur du losange (2·hw). L'épaisseur « thin
// tile » déborde vers le sud : recouverte par les rangées suivantes (le bake
// balaie gy croissant) → lisière naturelle sur les bords sud. Invalide le bake
// sol iso à chaque PNG décodé (sinon l'aplat reste gelé dans le cache).
// wonder → la tuile de PLACE (dallage pixel-art clair) : « une sorte de place en
// pixel » (Raph) pour le parvis des merveilles. Quasi libre d'usage ailleurs
// depuis que les places d'ère affichent leur scène PixelLab.
const ISO_TILE_KEYS = { grass: 'iso-grass', dirt: 'iso-dirt', urban: null, plaza: 'iso-plaza', wonder: 'iso-plaza' };
const isoTileCache = new Map();   // key -> { img, ready, bbox }
function isoTileBBox(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return null;
  let c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  else { c = document.createElement('canvas'); c.width = w; c.height = h; }
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0);
  let data;
  try { data = cx.getImageData(0, 0, w, h).data; } catch { return { x0: 0, y0: 0, w, h }; }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (data[(y * w + x) * 4 + 3] > 16) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, w, h };
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function ensureIsoTileKey(key) {
  if (!key) return null;
  let e = isoTileCache.get(key);
  if (e) return e;
  e = { img: null, ready: false, bbox: null, failed: false };
  isoTileCache.set(key, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      e.bbox = isoTileBBox(im);
      e.ready = !!e.bbox;
      CM._isoGroundBake = null;   // re-bake : remplace l'aplat de repli
    };
    im.onerror = () => { e.failed = true; };   // PNG absent → on garde le repli procédural
    im.src = '/pixelart/iso/' + key + '.png';
    e.img = im;
  }
  return e;
}
function ensureIsoTile(kind) { return ensureIsoTileKey(ISO_TILE_KEYS[kind]); }
// Blit une tuile de sol sur la cellule dont le coin NORD projeté est (nx, ny).
// ⚠ FACE SEULE : on ne prend que le haut 2:1 du contenu (bb.w × bb.w/2) et on
// laisse l'ÉPAISSEUR du « thin tile » de côté — la dessiner peignait un liseré
// sombre au sud de CHAQUE cellule → quadrillage criard sur tout le sol (1er jet).
// Un sol plat doit être une SURFACE continue, pas un empilement de tuiles.
// Renvoie false si pas prête (l'appelant garde l'aplat).
function blitIsoTile(ctx, kind, nx, ny, hw, mirror = false) {
  return blitIsoTileKey(ctx, ISO_TILE_KEYS[kind], nx, ny, hw, mirror);
}
function blitIsoTileKey(ctx, key, nx, ny, hw, mirror = false) {
  const e = ensureIsoTileKey(key);
  if (!e || !e.ready) return false;
  const bb = e.bbox;
  const faceH = Math.max(1, Math.round(bb.w / 2));   // face iso 2:1 du contenu
  const k = (hw * 2) / bb.w;
  const dw = Math.ceil(bb.w * k) + 1;          // +1 px : anti-couture entre losanges
  const dh = Math.ceil(faceH * k) + 1;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (mirror) {
    // Miroir horizontal 1 cellule sur ~2 (hash) : casse la répétition du motif
    // sans 2e asset — légitime pour une FACE de sol (pas d'ombrage directionnel fort).
    ctx.save();
    ctx.translate(Math.round(nx - hw) + dw, Math.round(ny));
    ctx.scale(-1, 1);
    ctx.drawImage(e.img, bb.x0, bb.y0, bb.w, faceH, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(e.img, bb.x0, bb.y0, bb.w, faceH, Math.round(nx - hw), Math.round(ny), dw, dh);
  }
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// Losange d'une cellule à partir de son coin NORD projeté (évite 4 worldToScreen :
// les 4 sommets se déduisent du pas de grille, constant à zoom fixe).
function diamondPath(ctx, nx, ny, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx + hw, ny + hh);
  ctx.lineTo(nx, ny + hh * 2);
  ctx.lineTo(nx - hw, ny + hh);
  ctx.closePath();
}

// Quad monde → écran (la projection est linéaire : un rectangle monde reste un
// parallélogramme écran). Sert aux rubans de chaussée.
function fillWorldQuad(ctx, x0, y0, x1, y1) {
  const a = worldToScreen(x0, y0), b = worldToScreen(x1, y0);
  const c = worldToScreen(x1, y1), d = worldToScreen(x0, y1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}
// Ajoute un quad monde comme SOUS-CHEMIN (sans beginPath/fill) → union de quads
// clippable (ruban de chaussée : pavé central + bras) puis clip + blit de la tuile.
function pathWorldQuad(ctx, x0, y0, x1, y1) {
  const a = worldToScreen(x0, y0), b = worldToScreen(x1, y0);
  const c = worldToScreen(x1, y1), d = worldToScreen(x0, y1);
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

// ── SOL (baké : ~10-30 ms une fois par zoom/marge, blitté ensuite) ────────────
// Les cellules-route ne remplissent PLUS tout leur losange (1er jet : rue aussi
// large qu'un îlot → grille illisible). Comme en legacy : fond de TROTTOIR (ton
// urbain) + RUBAN de chaussée plus étroit le long des connexions (masque E/O/S/N).
const ROAD_BAND = 0.30;   // demi-largeur du ruban (fraction de tuile)

// ── Détail d'herbe : tapis VIVANT (touffes de brins + speckle + fleurs éparses)
// posé DANS le bake du sol, par-dessus la tuile d'herbe (design réfs pixel-art
// validé par Raph 2026-07-12 : brins en V + pâquerettes ; réfs = DESIGN, pas
// couleur). Dispersion en ESPACE-MONDE (hash par cellule UNIQUE → aucune
// répétition de grille) et STRICTEMENT dans notre palette : verts + 2 accents
// clairs RARES (fleurs blanc cassé / cœur jaune). Densité « moyenne ». Réglable
// live : __grassDetail(false) éteint, __grassDetail(1.6) densifie, __grassDetail()
// lit l'état. N'affecte QUE l'herbe (kind==='grass') — sol urbain/champs/place intacts.
// tileAlpha : opacité de la tuile d'herbe PixelLab. La tuile brute est un carpet
// feuillu DENSE (loin des réfs « base verte propre + motifs épars ») → on la
// blende faiblement sur l'aplat GRASS pour une base CALME, et ce sont nos
// touffes/fleurs qui portent le design. mult : densité globale des motifs.
// DA Raph 2026-07-12 (itérée) : base verte UNIE (tileAlpha 0 → pas de tuile qui
// « tile », + aplat herbe forcé v=1 → pas de maillage par cellule) sur laquelle on
// pose des FLEURS assez présentes + des TOUFFES de brins MODÉRÉES (revenues à la
// demande, mais dosées pour ne PAS re-carpetter : « trop de pixels » = l'écueil).
// speckle & wildShade (plaques de prairie) restent des knobs, à 0 par défaut.
const GRASS_DETAIL = { on: true, tileAlpha: 0, flowerP: 0.22, tuftP: 0.45, speckleP: 0, wildShade: 0 };
const GD_BLADE = [66, 100, 46];      // brin foncé
const GD_TIP = [156, 180, 96];       // pointe claire du brin
const GD_SPECK_L = [138, 164, 96];   // speckle vert clair
const GD_SPECK_Y = [198, 208, 126];  // speckle jaune pâle
// Palette de fleurs [pétale, cœur] : pâquerette blanche dominante + accents jaune
// (bouton d'or), rose, rouge/coquelicot, violet, bleuet. Poids par RÉPÉTITION
// (blanc/jaune plus fréquents que les vives) → un pré fleuri, pas des confettis.
const GD_FLOWERS = [
  [[240, 242, 228], [234, 206, 96]],   // blanc (pâquerette)
  [[240, 242, 228], [234, 206, 96]],
  [[240, 242, 228], [234, 206, 96]],
  [[244, 216, 102], [220, 168, 60]],   // jaune (bouton d'or)
  [[244, 216, 102], [220, 168, 60]],
  [[236, 152, 178], [234, 206, 96]],   // rose
  [[224, 104, 96], [234, 206, 96]],    // rouge (coquelicot)
  [[184, 148, 216], [234, 206, 96]],   // violet
  [[150, 176, 226], [234, 206, 96]],   // bleuet
];
function drawGrassDetail(ctx, gx, gy, px, py, hw, hh) {
  const pu = Math.max(1, Math.round(hw * 0.055));    // « pixel » d'art (suit le zoom)
  // Sous-point (fx,fy)∈cellule → écran depuis le coin nord (projection linéaire :
  // Δx world → (hw,hh), Δy world → (−hw,hh)).
  const rect = (sx, sy, w, h, col, a) => {
    ctx.fillStyle = a < 1 ? `rgba(${col[0]},${col[1]},${col[2]},${a})` : `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(sx, sy, w, h);
  };
  const h1 = cmHash('gd:' + gx + ':' + gy);
  const h2 = cmHash('gd2:' + gx + ':' + gy);
  // Speckle (knob speckleP, défaut 0) : 1 point clair/jaune pâle.
  if (GRASS_DETAIL.speckleP > 0 && (h1 & 255) / 255 < GRASS_DETAIL.speckleP) {
    const fx = 0.2 + ((h1 >> 8) & 63) / 63 * 0.6;
    const fy = 0.2 + ((h1 >> 14) & 63) / 63 * 0.6;
    const sx = Math.round(px + (fx - fy) * hw), sy = Math.round(py + (fx + fy) * hh);
    rect(sx, sy, pu, pu, (h1 & 1) ? GD_SPECK_Y : GD_SPECK_L, 0.5);
  }
  // Touffe de brins (knob tuftP, défaut 0) : 2-3 brins verticaux, corps foncé + pointe.
  if (GRASS_DETAIL.tuftP > 0 && (h2 & 255) / 255 < GRASS_DETAIL.tuftP) {
    const fx = 0.28 + ((h2 >> 8) & 31) / 31 * 0.44;
    const fy = 0.30 + ((h2 >> 13) & 31) / 31 * 0.42;
    const bx = Math.round(px + (fx - fy) * hw), by = Math.round(py + (fx + fy) * hh);
    const nB = 2 + ((h2 >> 18) & 1);                 // 2 ou 3 brins
    const bh = Math.max(2 * pu, Math.round(hw * 0.13));
    for (let i = 0; i < nB; i += 1) {
      const bxi = bx + Math.round((i - (nB - 1) / 2) * (pu + 1));
      const jh = bh - ((h2 >> (i * 3)) & 1) * pu;    // hauteur légèrement variée
      rect(bxi, by - jh, pu, jh, GD_BLADE, 1);       // corps du brin
      rect(bxi, by - jh, pu, pu, GD_TIP, 1);         // pointe claire
    }
  }
  // Fleur ÉPARSE (flowerP, le SEUL motif par défaut) : pâquerette = 4 pétales blanc
  // cassé + cœur jaune. « De temps en temps » sur un fond uni.
  if ((cmHash('gf:' + gx + ':' + gy) & 1023) / 1023 < GRASS_DETAIL.flowerP) {
    const fl = GD_FLOWERS[cmHash('fc:' + gx + ':' + gy) % GD_FLOWERS.length];
    const petal = fl[0], core = fl[1];
    const fx = 0.3 + ((h1 >> 20) & 15) / 15 * 0.4;
    const fy = 0.3 + ((h2 >> 20) & 15) / 15 * 0.4;
    const cx = Math.round(px + (fx - fy) * hw), cy = Math.round(py + (fx + fy) * hh);
    rect(cx - pu, cy, pu, pu, petal, 1); rect(cx + pu, cy, pu, pu, petal, 1);
    rect(cx, cy - pu, pu, pu, petal, 1); rect(cx, cy + pu, pu, pu, petal, 1);
    rect(cx, cy, pu, pu, core, 1);
  }
}
if (typeof window !== 'undefined') {
  // Molette de réglage : rebake le sol immédiatement.
  // __grassDetail(false) éteint ; (nombre) = fréquence des fleurs ; ({tileAlpha,
  // flowerP,tuftP,speckleP,wildShade}) = réglage fin. Ex. réactiver les touffes :
  // __grassDetail({ tuftP: 0.25 }).
  window.__grassDetail = (arg) => {
    if (arg === false) GRASS_DETAIL.on = false;
    else if (typeof arg === 'number') { GRASS_DETAIL.on = true; GRASS_DETAIL.flowerP = arg; }
    else if (arg && typeof arg === 'object') { GRASS_DETAIL.on = true; Object.assign(GRASS_DETAIL, arg); }
    else GRASS_DETAIL.on = true;
    CM._isoGroundBake = null;
    return { ...GRASS_DETAIL };
  };
}
// ── Sol urbain : MATIÈRE par âge (terre → pavé → dalles → béton → tech) ───────
// DA Raph 2026-07-12 : sol urbain « différent à chaque ère », CALME MAIS LISIBLE.
// Procédural (pas de tuile → pas de tiling comme l'herbe), posé dans le bake, dans
// NOTRE palette. mat.tone = aplat de base ; le MOTIF (cailloux / joints de pavés /
// joints de dalles / dilatation béton / coutures tech) est tracé PAR-DESSUS, à
// FAIBLE contraste. Les joints suivent les arêtes du losange (= axes monde) → un
// pavage iso naturel, sans concurrencer les bâtiments. 10 âges (ageVisualConfig).
// tile = tuile PixelLab par matière (/pixelart/iso/<tile>.png) ; si le PNG manque,
// repli sur le motif procédural (drawUrbanDetail). type/joint/seam = params du repli.
const URBAN_MATS = [
  { tone: [150, 130, 100], type: 'earth', grav: 0, tile: 'ground-earth' },              // 0 primitif — terre battue
  { tone: [156, 138, 104], type: 'earth', grav: 1, tile: 'ground-earth' },              // 1 agricole — terre + graviers
  { tone: [170, 156, 130], type: 'cobble', joint: 0.16, tile: 'ground-cobble' },        // 2 bourg — pavés irréguliers
  { tone: [158, 152, 138], type: 'cobble', joint: 0.18, tile: 'ground-cobble' },        // 3 fortifié — pavé de pierre
  { tone: [188, 178, 150], type: 'flagstone', joint: 0.16, tile: 'ground-flagstone' },  // 4 impérial — grandes dalles
  { tone: [192, 186, 168], type: 'flagstone', joint: 0.14, tile: 'ground-flagstone' },  // 5 monumental — pierre claire
  { tone: [162, 160, 154], type: 'concrete', joint: 0.12, tile: 'ground-concrete' },    // 6 mégalopole — béton
  { tone: [94, 100, 116], type: 'tech', seam: [116, 196, 208], tile: 'ground-tech' },   // 7 noosphère — dalles tech
  { tone: [86, 94, 116], type: 'tech', seam: [130, 210, 220], tile: 'ground-tech' },    // 8 stellaire
  { tone: [80, 90, 118], type: 'tech', seam: [150, 224, 232], tile: 'ground-tech' },    // 9 démiurge
];
const URBAN_DETAIL = { on: true, mult: 1, band: null, tiles: true };   // band≠null = force ère (preview) ; tiles=false → procédural
function urbanMatFor(band) {
  const b = URBAN_DETAIL.band != null ? URBAN_DETAIL.band : band;
  return URBAN_MATS[Math.max(0, Math.min(URBAN_MATS.length - 1, b | 0))];
}
function drawUrbanDetail(ctx, gx, gy, px, py, hw, hh, mat) {
  const k = URBAN_DETAIL.mult, t = mat.tone;
  const shade = (f) => `rgb(${Math.max(0, Math.min(255, Math.round(t[0] * f)))},${Math.max(0, Math.min(255, Math.round(t[1] * f)))},${Math.max(0, Math.min(255, Math.round(t[2] * f)))})`;
  const N = [px, py], E = [px + hw, py + hh], W = [px - hw, py + hh];
  const seg = (a, b, style, lw) => { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  if (mat.type === 'earth') {
    // cailloux/poussière : quelques points sombres+clairs (gravier ×1 en agricole).
    const pu = Math.max(1, Math.round(hw * 0.05));
    for (let i = 0, n = mat.grav ? 3 : 2; i < n; i += 1) {
      const h = cmHash('ud:' + gx + ':' + gy + ':' + i);
      const fx = 0.2 + ((h >> 3) & 63) / 63 * 0.6, fy = 0.2 + ((h >> 9) & 63) / 63 * 0.6;
      const sx = Math.round(px + (fx - fy) * hw), sy = Math.round(py + (fx + fy) * hh);
      ctx.fillStyle = (h & 1) ? shade(0.86) : shade(1.08);
      ctx.fillRect(sx, sy, pu, pu);
    }
    return;
  }
  // Joints : 2 arêtes du HAUT / cellule → chaque joint interne tracé 1× (l'arête sud
  // d'une cellule = l'arête nord de sa voisine, tracée par celle-ci). Fins & doux.
  const lw = Math.max(1, hw * 0.03);
  if (mat.type === 'cobble') {
    const jl = shade(1 - mat.joint * k);
    seg(N, E, jl, lw); seg(N, W, jl, lw);
    seg([px + 0.5 * hw, py + 0.5 * hh], [px - 0.5 * hw, py + 1.5 * hh], jl, lw);   // médiane monde X (2×2 pavés)
    seg([px - 0.5 * hw, py + 0.5 * hh], [px + 0.5 * hw, py + 1.5 * hh], jl, lw);   // médiane monde Y
    return;
  }
  if (mat.type === 'flagstone') {
    const jl = shade(1 - mat.joint * k);
    seg(N, E, jl, lw); seg(N, W, jl, lw);                                          // 1 dalle par tuile
    return;
  }
  if (mat.type === 'concrete') {
    const jl = shade(1 - mat.joint * k);
    if ((((gx % 3) + 3) % 3) === 0) seg(N, W, jl, lw);                             // joints de dilatation ~1/3
    if ((((gy % 3) + 3) % 3) === 0) seg(N, E, jl, lw);
    if ((cmHash('uc:' + gx + ':' + gy) % 7) === 0) {                              // tache faible éparse
      ctx.fillStyle = 'rgba(40,40,46,0.10)';
      ctx.beginPath(); ctx.ellipse(px, py + hh, hw * 0.42, hh * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  if (mat.type === 'tech') {
    const s = mat.seam, a = (0.22 * k).toFixed(2), lw2 = Math.max(1, hw * 0.025);
    seg(N, E, `rgba(${s[0]},${s[1]},${s[2]},${a})`, lw2);                          // coutures lumineuses
    seg(N, W, `rgba(${s[0]},${s[1]},${s[2]},${a})`, lw2);
    return;
  }
}
if (typeof window !== 'undefined') {
  // Molette sol urbain : __groundMat(false) off ; (nombre)=intensité ; ({band:3})
  // force une ère pour l'aperçu ; ({mult,band}) réglage fin. Rebake immédiat.
  window.__groundMat = (arg) => {
    if (arg === false) URBAN_DETAIL.on = false;
    else if (typeof arg === 'number') { URBAN_DETAIL.on = true; URBAN_DETAIL.mult = arg; }
    else if (arg && typeof arg === 'object') { URBAN_DETAIL.on = true; Object.assign(URBAN_DETAIL, arg); }
    else URBAN_DETAIL.on = true;
    CM._isoGroundBake = null;
    return { ...URBAN_DETAIL };
  };
}
// ── Chaussée : TUILE de route dédiée par âge (clippée au ruban) ──────────────
// Demande Raph : « tuiles de routes dédiées ». Même pipeline que le sol urbain,
// mais la tuile est CLIPPÉE à la forme du ruban (pavé central + bras) → garde les
// rues étroites + trottoirs. Repli = aplat roadTone. PNG /pixelart/iso/<tile>.png.
const ROAD_MATS = [
  { tile: 'road-dirt' },      // 0 primitif — sentier de terre
  { tile: 'road-dirt' },      // 1 agricole
  { tile: 'road-cobble' },    // 2 bourg — rue pavée
  { tile: 'road-cobble' },    // 3 fortifié
  { tile: 'road-stone' },     // 4 impérial — voie dallée
  { tile: 'road-stone' },     // 5 monumental
  { tile: 'road-asphalt' },   // 6 mégalopole — asphalte
  { tile: 'road-tech' },      // 7 noosphère — voie tech
  { tile: 'road-tech' },      // 8 stellaire
  { tile: 'road-tech' },      // 9 démiurge
];
// tiles=false par défaut : route LISSE (ruban plat roadTone) — pas de tuile à gros
// motif. Les tuiles road-* restent dispo via __roadMat({tiles:true}) si un jour besoin.
const ROAD_DETAIL = { on: true, tiles: false, band: null };   // band≠null = force ère (preview)
function roadMatFor(band) {
  const b = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
  return ROAD_MATS[Math.max(0, Math.min(ROAD_MATS.length - 1, b | 0))];
}
if (typeof window !== 'undefined') {
  window.__roadMat = (arg) => {
    if (arg === false) ROAD_DETAIL.on = false;
    else if (arg && typeof arg === 'object') { ROAD_DETAIL.on = true; Object.assign(ROAD_DETAIL, arg); }
    else ROAD_DETAIL.on = true;
    CM._isoGroundBake = null;
    return { ...ROAD_DETAIL };
  };
}
// ── PARVIS DES MERVEILLES : sol dédié de l'emprise (L.wonderGround) ───────────
// Demande Raph 2026-07-13 : la grande zone réservée d'une merveille (dès le
// rang I) doit se LIRE comme une PLACE, pas comme du sol urbain ordinaire — et
// le monument trône en son CENTRE (emprise carrée, cf. cmWonderExtent).
// Dallage = tuile de PLACE pixel-art (iso-plaza, cf. ISO_TILE_KEYS.wonder),
// intemporel quelle que soit l'ère ; repli (PNG pas prêt) = aplat ivoire en
// damier doux + joints de dalles. Sur tout le POURTOUR, marche d'ombre +
// MARGELLE claire (arêtes dont le voisin n'est pas du parvis).
// Réglage live : __wonderGround({ tone, checker, joint, rim }) / (false).
// Défauts calés à la capture (2026-07-13) : base ROSÉE (s'accorde au tuilage
// iso-plaza et tranche sur le sol urbain crème des ères claires) + voile 0.6.
const WONDER_GROUND = { on: true, tone: [219, 199, 181], checker: 0.05, joint: 0.10, rim: 1.10, tileAlpha: 0.6 };
function drawWonderGroundDetail(ctx, gx, gy, px, py, hw, hh, wg, tiled) {
  const shade = (f) => rgb(WONDER_GROUND.tone, f);
  const N = [px, py], E = [px + hw, py + hh], S = [px, py + hh * 2], W = [px - hw, py + hh];
  const seg = (a, b, style, lw) => { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  // Joints de dalles : SEULEMENT en repli procédural (la tuile pixel porte son
  // propre dallage — des joints par-dessus feraient un quadrillage parasite).
  if (!tiled) {
    const jl = shade(1 - WONDER_GROUND.joint), lw = Math.max(1, hw * 0.03);
    seg(N, E, jl, lw); seg(N, W, jl, lw);
  }
  // Pourtour : marche d'ombre (nu extérieur) + margelle claire en retrait. Traits
  // RENTRÉS vers le centre pour survivre au liseré anti-couture des cellules
  // voisines (dessinées après : elles recouvrent l'arête partagée).
  const cx = px, cy = py + hh;
  const inset = (p, k) => [p[0] + (cx - p[0]) * k, p[1] + (cy - p[1]) * k];
  const edges = [
    [gx, gy - 1, N, E], [gx + 1, gy, E, S],   // NE / SE écran
    [gx, gy + 1, S, W], [gx - 1, gy, W, N],   // SO / NO écran
  ];
  for (const [nx, ny, a, b] of edges) {
    if (wg.has(nx + ',' + ny)) continue;
    seg(inset(a, 0.05), inset(b, 0.05), 'rgba(34,30,20,0.25)', Math.max(1, hw * 0.05));
    seg(inset(a, 0.16), inset(b, 0.16), shade(WONDER_GROUND.rim), Math.max(1, hw * 0.09));
  }
}
// Ensemble effectif des cellules-parvis : celui du layout, PLUS l'emprise de la
// merveille en APERÇU (__showWonder force le rendu sans recalcul du plan — le
// parvis suit pour que l'aperçu soit fidèle). Mémoïsé par (layout, id d'aperçu).
function wonderGroundSet(L) {
  const pv = CM.previewWonder;
  if (!pv) return L.wonderGround || null;
  const sig = (CM.layoutRecomputeAt || 0) + ':' + pv.id;
  const cache = CM._pvWonderGround;
  if (cache && cache.sig === sig) return cache.set;
  const set = new Set(L.wonderGround || []);
  const wi = CM_WONDERS.findIndex((w) => w.id === pv.id);
  if (wi >= 0 && pv.id !== 'era_mega' && L.gridN) {
    const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
    cmForEachWonderCell(slot, pv.id, L.gridN, (gx, gy, k) => set.add(k));
  }
  CM._pvWonderGround = { sig, set };
  return set;
}
if (typeof window !== 'undefined') {
  window.__wonderGround = (arg) => {
    if (arg === false) WONDER_GROUND.on = false;
    else if (arg && typeof arg === 'object') { WONDER_GROUND.on = true; Object.assign(WONDER_GROUND, arg); }
    else WONDER_GROUND.on = true;
    CM._isoGroundBake = null;
    return { ...WONDER_GROUND };
  };
}
function drawIsoGround() {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const hw = T * z * ISO_X;            // demi-largeur du losange
  const hh = T * z * ISO_Y;            // demi-hauteur
  const b = visibleCellBounds(hw * 2);
  const band = (L.counts && L.counts.eraBand) | 0;
  const mat = urbanMatFor(band), urb = mat.tone;
  const road = roadTone(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band);   // honore le forçage d'aperçu
  const riverCells = (L.river && L.river.present && L.river.cells) || null;
  const roadMap = L.roadMap;
  const roads = [];                    // cellules-route de la passe (rubans après le fond)
  const wg = WONDER_GROUND.on ? wonderGroundSet(L) : null;   // parvis des merveilles
  ctx.save();
  ctx.lineJoin = 'round';
  for (let gy = b.gy0; gy <= b.gy1; gy += 1) {
    for (let gx = b.gx0; gx <= b.gx1; gx += 1) {
      const key = gx + ',' + gy;
      const isRoad = L.roadSet.has(key);
      const cell = isRoad && roadMap ? roadMap.get(key) : null;
      const isPlaza = !!(cell && cell.rank === 'plaza');       // ⚠ piège places-dans-roadSet
      const isBridge = !!(cell && cell.roadSurface === 'bridge');
      const isWater = !!(riverCells && riverCells.has(key));
      const isUrban = (isRoad && !isBridge) || (L.urbanSet && L.urbanSet.has(key));
      // kind = tuile PixelLab ; tone = repli aplat tant que le PNG n'est pas prêt.
      // L'EAU n'est plus peinte ici : le fleuve est un RUBAN LIVE lissé par-dessus
      // le bake (drawIsoRiver) — le sol sous l'eau reste de l'herbe (berges douces).
      let kind, tone;
      // Quand la SCÈNE de place de l'ère est décodée, la dalle claire disparaît
      // (la scène porte son propre dallage — l'ancienne dalle dépassait autour,
      // retour Raph) : les cellules plaza redeviennent du sol urbain calme.
      const plazaSceneUp = isPlaza && plazaEraForBand(band) && isoArt('plaza-' + plazaEraForBand(band)).ready;
      if (isPlaza && !plazaSceneUp) { kind = 'plaza'; tone = PLAZA; }
      else if (plazaSceneUp) { kind = 'urban'; tone = urb; }
      // Parvis de merveille : l'emprise réservée porte son dallage propre (l'eau
      // garde la priorité — le ruban du fleuve passe dessus, berges douces).
      else if (!isWater && wg && wg.has(key)) { kind = 'wonder'; tone = WONDER_GROUND.tone; }
      else if (isUrban && !isWater) { kind = (L.urbanSet && L.urbanSet.has(key)) ? 'urban' : 'dirt'; tone = urb; }
      else if (!isWater && riverCells && L.river.banks && L.river.banks.has(key) && L.urbanSet
        && (L.urbanSet.has((gx + 1) + ',' + gy) || L.urbanSet.has((gx - 1) + ',' + gy)
          || L.urbanSet.has(gx + ',' + (gy + 1)) || L.urbanSet.has(gx + ',' + (gy - 1)))) {
        // QUAI-LITE : une berge qui touche le tissu urbain se pave (berge bâtie) —
        // esquisse des quais legacy ; le vrai quai par ère viendra avec l'art Phase 5.
        kind = 'urban'; tone = urb;
      } else { kind = 'grass'; tone = GRASS; }   // teinte UNIFORME (couture in-grid/sauvage retirée)
      const p = worldToScreen(gx * T, gy * T);   // coin NORD du losange
      const mir = ((cmHash(key) >>> 3) & 1) === 1;
      // Dosage par matière : l'URBAIN reste un aplat CALME avec un simple GRAIN de
      // texture (alpha faible) — la tuile pleine tapissait la ville d'un motif
      // fissuré qui concurrençait les bâtiments (v2 refusée à la capture). Herbe
      // et place gardent leur tuile pleine (elles portent bien le détail).
      // Urbain : plus de tuile générique (0) — la MATIÈRE par ère (drawUrbanDetail)
      // porte tout le détail. dirt garde son grain, place/reste sa tuile pleine.
      // Parvis : la tuile de place en VOILE dosé (pleine force, son motif écaillé
      // répété sur 15×15 cellules criait — même défaut que la v2 urbaine) ; le
      // damier ivoire de l'aplat reste la base, la tuile n'apporte que le grain pixel.
      const texAlpha = kind === 'urban' ? 0 : kind === 'dirt' ? 0.5
        : kind === 'wonder' ? WONDER_GROUND.tileAlpha
          : kind === 'grass' ? GRASS_DETAIL.tileAlpha : 1;
      const tile = kind ? ensureIsoTile(kind) : null;
      const tileReady = !!(tile && tile.ready);
      if (!tileReady || texAlpha < 1) {
        // Aplat (repli OU sous-couche du grain) : variance douce stable par seed,
        // MODULÉE PAR ÎLOT (blocs ~6×6) — retour Raph « sols très plats » : le
        // patchwork de quartiers casse la grande nappe uniforme.
        const blockV = 0.95 + ((cmHash('blk:' + (gx >> 2) + ':' + (gy >> 2)) % 100) / 100) * 0.1;
        // Herbe = aplat STRICTEMENT uni (v=1) : la variation par cellule dessinait un
        // maillage de losanges visibles (« on voit les cases »). Autres sols inchangés.
        // Parvis = DAMIER régulier 2 teintes (dallage voulu, pas du bruit) : ni
        // variance par cellule ni patchwork d'îlot — une esplanade est dessinée d'un trait.
        const v = kind === 'grass' ? 1
          : kind === 'wonder' ? (((gx + gy) & 1) ? 1 : 1 - WONDER_GROUND.checker)
            : (0.96 + ((cmHash(key) % 100) / 100) * 0.08) * (kind === 'urban' ? blockV : 1);
        ctx.fillStyle = rgb(tone, v);
        diamondPath(ctx, p.x, p.y, hw, hh);
        ctx.fill();
        // Anti-couture : fin liseré de la même couleur par-dessus les bords partagés.
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
        // Usure éparse : petite tache sombre sur ~1 cellule urbaine sur 9 (plaque,
        // regard, réparation) — brise la platitude sans bruit systématique.
        if (kind === 'urban' && !isRoad && (cmHash('wear:' + key) % 9) === 0) {
          ctx.fillStyle = 'rgba(40,38,30,0.14)';
          const wx0 = (gx + 0.3 + ((cmHash('wx:' + key) % 40) / 100)) * T;
          const wy0 = (gy + 0.3 + ((cmHash('wy:' + key) % 40) / 100)) * T;
          const q = worldToScreen(wx0, wy0);
          ctx.beginPath();
          ctx.ellipse(q.x, q.y, hw * 0.3, hh * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (tileReady) {
        if (texAlpha < 1) ctx.globalAlpha = texAlpha;
        blitIsoTile(ctx, kind, p.x, p.y, hw, mir);
        if (texAlpha < 1) ctx.globalAlpha = 1;
      }
      // Herbe : variation de prairie + tapis vivant (touffes/speckle/fleurs) PAR-DESSUS
      // la base. La variation est INDÉPENDANTE de la grille (fini la couture dure
      // in-grid↔sauvage révélée en calmant la tuile) : plaques douces via un hash de
      // bloc ~4 cellules, biaisé clair (nz²) → alpha faible, pas de bord franc.
      if (kind === 'grass') {
        if (GRASS_DETAIL.wildShade > 0) {
          const nz = (cmHash('mead:' + (gx >> 2) + ':' + (gy >> 2)) % 100) / 100;
          const a = GRASS_DETAIL.wildShade * nz * nz;
          if (a > 0.015) {
            ctx.fillStyle = `rgba(26,36,18,${a.toFixed(3)})`;
            diamondPath(ctx, p.x, p.y, hw, hh);
            ctx.fill();
          }
        }
        if (GRASS_DETAIL.on) drawGrassDetail(ctx, gx, gy, p.x, p.y, hw, hh);
      }
      // Sol urbain : tuile PixelLab de l'ère (par-dessus l'aplat, miroir anti-répétition)
      // si le PNG est prêt ; sinon repli sur le motif procédural (joints/cailloux).
      if (kind === 'urban' && URBAN_DETAIL.on) {
        const drew = URBAN_DETAIL.tiles && mat.tile && blitIsoTileKey(ctx, mat.tile, p.x, p.y, hw, mir);
        if (!drew) drawUrbanDetail(ctx, gx, gy, p.x, p.y, hw, hh, mat);
      }
      // Parvis : bordure de pourtour (+ joints de dalles tant que la tuile n'est
      // qu'un voile — elles portent la structure du dallage ; tuile PLEINE = motif à elle).
      if (kind === 'wonder') drawWonderGroundDetail(ctx, gx, gy, p.x, p.y, hw, hh, wg, tileReady && texAlpha >= 1);
      // Les cellules-PONT ne reçoivent ni fond ni ruban ici : leur tablier est
      // dessiné APRÈS le fleuve (drawIsoBridges), au-dessus de l'eau. Le PARVIS
      // non plus : ses routes sont carvées par le plan — le garde ne couvre que la
      // frame transitoire entre __showWonder et le recalcul du layout.
      if (isRoad && !isPlaza && !isBridge && !isWater && !(wg && wg.has(key))) roads.push({ gx, gy, cell });
    }
  }
  // Rubans de chaussée par-dessus le fond : pavé central + un bras vers chaque
  // connexion (rectangles MONDE projetés → parallélogrammes écran continus).
  const rmat = roadMatFor(band);
  for (const r of roads) {
    const cx = (r.gx + 0.5) * T, cy = (r.gy + 0.5) * T;
    const wb = T * ROAD_BAND;
    const mask = r.cell ? (r.cell.mask | 0) : 0;
    const v = 0.97 + ((cmHash('rb:' + r.gx + ',' + r.gy) % 100) / 100) * 0.06;
    // LISERÉ DE TROTTOIR : même géométrie légèrement élargie (cb), en plus sombre, SOUS
    // la dalle → fine bordure qui cerne la chaussée (retour Raph : « remets le liseré »).
    const cb = T * 0.05;
    ctx.fillStyle = rgb(road, 0.62);
    fillWorldQuad(ctx, cx - wb - cb, cy - wb - cb, cx + wb + cb, cy + wb + cb);
    if (mask & ROAD_E) fillWorldQuad(ctx, cx + wb, cy - wb - cb, (r.gx + 1) * T, cy + wb + cb);
    if (mask & ROAD_W) fillWorldQuad(ctx, r.gx * T, cy - wb - cb, cx - wb, cy + wb + cb);
    if (mask & ROAD_S) fillWorldQuad(ctx, cx - wb - cb, cy + wb, cx + wb + cb, (r.gy + 1) * T);
    if (mask & ROAD_N) fillWorldQuad(ctx, cx - wb - cb, r.gy * T, cx + wb + cb, cy - wb);
    // Ruban de chaussée = pavé central + un bras vers chaque connexion (tracé CHEMIN).
    ctx.beginPath();
    pathWorldQuad(ctx, cx - wb, cy - wb, cx + wb, cy + wb);                       // pavé central
    if (mask & ROAD_E) pathWorldQuad(ctx, cx + wb, cy - wb, (r.gx + 1) * T, cy + wb);
    if (mask & ROAD_W) pathWorldQuad(ctx, r.gx * T, cy - wb, cx - wb, cy + wb);
    if (mask & ROAD_S) pathWorldQuad(ctx, cx - wb, cy + wb, cx + wb, (r.gy + 1) * T);
    if (mask & ROAD_N) pathWorldQuad(ctx, cx - wb, r.gy * T, cx + wb, cy - wb);
    const rTile = (ROAD_DETAIL.on && ROAD_DETAIL.tiles && rmat.tile) ? ensureIsoTileKey(rmat.tile) : null;
    if (rTile && rTile.ready) {
      ctx.save(); ctx.clip();
      const rp = worldToScreen(r.gx * T, r.gy * T);
      const rmir = ((cmHash('rr:' + r.gx + ',' + r.gy) >>> 3) & 1) === 1;
      blitIsoTileKey(ctx, rmat.tile, rp.x, rp.y, hw, rmir);
      ctx.restore();
    } else {
      // DALLE LISSE : surface PLEINE de chaussée, teinte par ère (roadTone). Lisse et
      // propre (pas de texture qui transparaît) — la « dalle lisse » demandée par Raph.
      ctx.fillStyle = rgb(road, v);
      ctx.fill();
    }
    // MARQUAGE : UNIQUEMENT le pointillé BLANC d'axe, au milieu des segments droits
    // (Raph : « tirets blancs juste au milieu, pas besoin sur les côtés »), toutes ères.
    const throughH = !!((mask & ROAD_E) && (mask & ROAD_W)), throughV = !!((mask & ROAD_S) && (mask & ROAD_N));
    if (throughH !== throughV) {                 // segment droit à un seul axe
      ctx.fillStyle = 'rgba(246,245,240,0.9)';
      const dl = T / 5, dg = T / 7, dw2 = T * 0.03;   // tiret, trou, demi-largeur
      for (let o = dg / 2; o + dl <= T; o += dl + dg) {
        if (throughH) fillWorldQuad(ctx, r.gx * T + o, cy - dw2, r.gx * T + o + dl, cy + dw2);
        else fillWorldQuad(ctx, cx - dw2, r.gy * T + o, cx + dw2, r.gy * T + o + dl);
      }
    }
  }
  // Terre-plein PLANTÉ des boulevards 2-cellules (couture L.terrePlein) : bande
  // de gazon centrée sur la couture + touffes sombres espacées. Statique → dans
  // le bake. (Le vrai pixel-art planté du legacy viendra avec l'art Phase 5.)
  // Quand les SEGMENTS plantés PixelLab sont décodés, la bande gazon + touffes
  // du bake est SAUTÉE (elle restait visible sous/à côté de l'art — retour Raph).
  // Gazon procédural sauté dès que les pièces 3-slice d'une orientation sont là
  // (le sprite porte sa propre base) — vaut par orientation, mais on coupe la
  // bande dès que l'UNE est prête (les segments de l'autre gardent le repli buisson).
  const medUp = isoArt('median-se-mid').ready || isoArt('median-sw-mid').ready;
  const tp = medUp ? null : L.terrePlein;
  if (tp && tp.length) {
    const wtp = T * 0.2;
    for (const seg of tp) {
      ctx.fillStyle = rgb([96, 118, 66], 1);
      if (seg.axis === 'h') fillWorldQuad(ctx, seg.x0 * T, (seg.y + 1) * T - wtp, (seg.x1 + 1) * T, (seg.y + 1) * T + wtp);
      else fillWorldQuad(ctx, (seg.x + 1) * T - wtp, seg.y0 * T, (seg.x + 1) * T + wtp, (seg.y1 + 1) * T);
      ctx.fillStyle = 'rgba(58,82,44,0.9)';
      if (seg.axis === 'h') {
        const sy = (seg.y + 1) * T;
        for (let x = seg.x0 + 0.5; x <= seg.x1 + 0.5; x += 1.25) {
          const q = worldToScreen(x * T, sy);
          ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(1, z * 2.6), Math.max(1, z * 1.4), 0, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        const sx = (seg.x + 1) * T;
        for (let y = seg.y0 + 0.5; y <= seg.y1 + 0.5; y += 1.25) {
          const q = worldToScreen(sx, y * T);
          ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(1, z * 2.6), Math.max(1, z * 1.4), 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  ctx.restore();
  return true;
}

// ── FLEUVE : ruban lissé LIVE (par-dessus le bake, sous ponts et agents) ─────
// Même philosophie que pixelRiver legacy (Approche A : ruban continu depuis
// L.river.samples, zéro escalier de cellules) mais en projection iso : gauche/
// droite calculées en MONDE (pos ± normale·hw) puis projetées. Dessin LIVE à
// chaque frame (un polygone + liserés + reflets) → l'eau peut s'animer alors
// que le sol reste baké. Bateaux/quais : Phase 5 complète.
function riverRibbonPath(ctx, pts, T) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const o = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    left.push(worldToScreen((p.x + nx * p.hw) * T, (p.y + ny * p.hw) * T));
    right.push(worldToScreen((p.x - nx * p.hw) * T, (p.y - ny * p.hw) * T));
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
}
function drawIsoRiver(now) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  const T = CM.TILE, ctx = CM.ctx, z = CM.cam.zoom;
  const pts = rv.samples;
  // Corps d'eau (ardoise).
  riverRibbonPath(ctx, pts, T);
  ctx.fillStyle = rgb(WATER, 1);
  ctx.fill();
  // BAS-FOND CLAIR le long des rives (façon TheoTown, retour Raph « les bords de
  // l'eau plus clairs ») : l'eau S'ÉCLAIRCIT au bord (peu profond) et fonce vers le
  // centre (profond). Bandes strokées le long du ruban, CLIPPÉES → seule la moitié
  // intérieure reste. Remplace l'ancien liseré SOMBRE. Réglable via waterShoreTune.
  {
    const S = waterShoreTune, len0 = pts.length;
    const nAt = (i) => { const o = pts[Math.max(0, i - 1)], q = pts[Math.min(len0 - 1, i + 1)]; let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; return { nx: -ty / tl, ny: tx / tl }; };
    const shore = (color, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      for (const sgn of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i < len0; i += 1) {
          const p = pts[i], n = nAt(i);
          const w = worldToScreen((p.x + sgn * n.nx * p.hw) * T, (p.y + sgn * n.ny * p.hw) * T);
          if (i === 0) ctx.moveTo(w.x, w.y); else ctx.lineTo(w.x, w.y);
        }
        ctx.stroke();
      }
    };
    if (S.on) {
      ctx.save();
      riverRibbonPath(ctx, pts, T);
      ctx.clip();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      shore(`rgba(${S.c1},${S.a1})`, Math.max(3, z * S.w1));   // bas-fond large et doux
      shore(`rgba(${S.c2},${S.a2})`, Math.max(2, z * S.w2));   // eau peu profonde
      shore(`rgba(${S.c3},${S.a3})`, Math.max(1, z * S.w3));   // liseré clair au bord
      ctx.restore();
    }
  }
  // Vaguelettes animées (inspiré de TheoTown) : nappe DENSE de petits traits clairs
  // couvrant la surface, dont la BRILLANCE court vers l'aval (phase = u·freq − t·speed)
  // → lecture d'un courant vivant (vs virgules éparses = « pas un flow », retour Raph).
  // Partage `waterRippleTune` avec le rendu legacy (pixelRiver). Clippé au ruban.
  const T2 = waterRippleTune;
  if (T2.on && z >= 0.45) {
    ctx.save();
    riverRibbonPath(ctx, pts, T);
    ctx.clip();
    const t = (now || 0) / 1000, len = pts.length;
    const lanes = Math.max(2, T2.lanes | 0);
    const sub = Math.max(1, T2.sub | 0);              // sous-pas le long entre 2 samples (densité)
    const rw = Math.max(3, Math.round(T * z * (T2.dash || 0.2)));  // largeur du reflet horizontal
    const rh = Math.max(1, Math.round(T * z / 22));               // épaisseur
    const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < len - 1; i += 1) {
      const p = pts[i], pn = pts[i + 1];
      for (let li = 0; li < lanes; li += 1) {
        for (let ss = 0; ss < sub; ss += 1) {
          const h = ((i * 131 + li * 977 + ss * 613) >>> 0);
          const along = (ss + (h & 255) / 255) / sub;                        // 0..1 entre i et i+1
          const lat = (li / (lanes - 1) - 0.5) * 1.7 * p.hw + (((h >> 8) & 31) / 31 - 0.5) * 0.5;
          // onde de brillance qui COURT VERS L'AVAL → reflets qui avancent
          const b = Math.sin((i + along) * T2.freq - t * T2.speed + (h & 31) * 0.25);
          if (b < T2.thresh) continue;
          const al = ((b - T2.thresh) / (1 - T2.thresh)) * T2.alpha;
          const cx = p.x + (pn.x - p.x) * along, cy = p.y + (pn.y - p.y) * along;
          const nx = -( (pn.y - p.y) ), ny = (pn.x - p.x);                   // normale (non normée) pour l'écart latéral
          const nl = Math.hypot(nx, ny) || 1;
          const w = worldToScreen((cx + (nx / nl) * lat) * T, (cy + (ny / nl) * lat) * T);
          if (w.x < -T || w.x > CM.cw + T || w.y < -T || w.y > CM.ch + T) continue;
          // reflet = court trait HORIZONTAL écran (surface d'eau plate qui accroche la lumière)
          const jw = rw * (0.6 + (h % 40) / 40 * 0.8);
          ctx.fillStyle = `rgba(${T2.color},${al.toFixed(2)})`;
          ctx.fillRect(Math.round(w.x - jw / 2), Math.round(w.y - rh / 2), Math.round(jw), rh);
        }
      }
    }
    ctx.imageSmoothingEnabled = prevS;
    ctx.restore();
  }
}

// (Brume de rivière RETIRÉE le 2026-07-13 — essayée en nappes puis en voile
// plein, jugée « pas terrible et pas si utile » par Raph. Ne pas re-proposer.)

// ── Art iso dédié (/pixelart/iso/<name>.png) : cache paresseux ───────────────
// Roues de moulin animées (bandes 6 frames) + bateaux par stade (8 rotations).
// Tant qu'un PNG manque, chaque consommateur garde son repli (skew / profil).
const isoArtCache = new Map();
function isoArt(name) {
  let e = isoArtCache.get(name);
  if (e) return e;
  e = { img: null, ready: false, bbox: null };
  isoArtCache.set(name, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      e.img = im; e.ready = true;
      // Le BAKE du sol dépend de l'art décodé (dalle de place remplacée, bande
      // gazon des terre-pleins sautée) → re-bake au décodage.
      CM._isoGroundBake = null;
    };
    // `name` peut porter un cache-buster (`clef?v=2`) : la query passe APRÈS le
    // `.png` dans l'URL. Sert quand un PNG est RÉÉCRIT sur disque (aqueduc : des
    // navigateurs resservaient la 1re version cassée depuis le cache HTTP).
    const qi = name.indexOf('?');
    im.src = '/pixelart/iso/' + (qi < 0 ? name + '.png' : name.slice(0, qi) + '.png' + name.slice(qi));
  }
  return e;
}
// ── AQUEDUC ISO 3-SLICE — /pixelart/iso/aqueduct-iso-<ère>-{start,mid,end}.png ──
// Scènes PixelLab diagonales (3/4 top-down) redressées par CISAILLEMENT calé sur
// la ligne d'eau puis coupées cap/période/cap par scripts/sliceAqueductIso.mjs —
// même découpe en 3 que l'aqueduc legacy (outlet/seg/intake). 4 stades alignés
// sur engineStage : gouttière de bois → arcade romaine → viaduc de fer → canal
// béton ; le cosmique (band 7+) retombe sur le béton en attendant un art dédié.
// h = hauteur écran en TUILES (le viaduc de fer est VOULU plus haut que
// l'arcade). Tant qu'un PNG manque → repli canal plat, aucune dépendance dure.
// AQ_V : version de cache des pièces — À INCRÉMENTER à chaque réécriture des
// PNG (les 1res pièces cassées du 2026-07-13 sont restées collées dans le cache
// HTTP de l'onglet de Raph : arcade minuscule sur fond opaque, « hyper étiré »).
const AQ_V = 4;
const AQ_ISO = [
  { pfx: 'aqueduct-iso-wood', h: 1.15 },
  // Romain v2 (retour Raph « design hyper étiré ») : scène 400px HORIZONTALE
  // (le cisaillement rend la diagonale inutile), 5 GRANDES arches + tours aux
  // bouts, pierre réchauffée (le blanc source fondait dans le quai), pièces
  // start=tour+arche · mid=1 arche · end=tour (coupes non contiguës, cf.
  // sliceAqueductIso endFrac).
  { pfx: 'aqueduct-iso-roman', h: 1.45 },
  { pfx: 'aqueduct-iso-iron', h: 1.75 },
  { pfx: 'aqueduct-iso-modern', h: 1.35 },
];
function isoAqueductPieces(band, eraIdx) {
  const cfgE = AQ_ISO[band >= 7 ? 3 : engineStage(eraIdx)];
  const v = '?v=' + AQ_V;
  const P = { s: isoArt(cfgE.pfx + '-start' + v), m: isoArt(cfgE.pfx + '-mid' + v), e: isoArt(cfgE.pfx + '-end' + v), h: cfgE.h };
  return (P.s.ready && P.m.ready && P.e.ready) ? P : null;
}
// Pose un art iso « AU SOL » : le CONTENU opaque est mis à targetW px de large
// et le COIN BAS de son losange de base tombe un quart sous (px, py) = centre
// du losange visé. Corrige les décalages « ancienne dalle qui dépasse » (Raph) :
// on cale la GÉOMÉTRIE MESURÉE du PNG, pas le canvas brut.
function drawIsoGroundedArt(ctx, e, px, py, targetW) {
  if (!e.bbox) {
    const bpx = isoTileBBox(e.img);
    const w = e.img.naturalWidth || 1, h = e.img.naturalHeight || 1;
    e.bbox = bpx ? { x0f: bpx.x0 / w, y0f: bpx.y0 / h, wf: bpx.w / w, hf: bpx.h / h } : { x0f: 0, y0f: 0, wf: 1, hf: 1 };
  }
  const bb = e.bbox;
  const imgW = e.img.naturalWidth || 1, imgH = e.img.naturalHeight || 1;
  // ⚠ canvases NON carrés depuis la normalisation (normalizeIsoScenes) :
  // la hauteur suit l'ASPECT NATUREL, plus jamais boxH = boxW.
  const boxW = targetW / (bb.wf || 1), boxH = boxW * (imgH / imgW);
  const cxf = bb.x0f + bb.wf / 2, cbf = bb.y0f + bb.hf;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const dx = px - boxW * cxf, dy = py + targetW / 4 - boxH * cbf;
  ctx.drawImage(e.img, dx, dy, boxW, boxH);
  ctx.imageSmoothingEnabled = prev;
  // Géométrie du draw (px écran) : permet de re-projeter un OVERLAY calé sur
  // les pixels source (eau de fontaine animée des places).
  return { x: dx, y: dy, w: boxW, h: boxH };
}
// Arbres pixel iso : tree-1..tree-N (feuillus + conifères, choisis par hash).
const ISO_TREE_VARIANTS = 4;

// ── Forêt sauvage : ceinture d'arbres autour de la ville ─────────────────────
// Le legacy (cityMapDrawTrees) peignait une forêt sur TOUTE l'herbe hors « sol
// urbain » ; en iso ce pipeline est SAUTÉ et drawIsoGround ne pose que l'herbe →
// la ville se retrouvait nue dans une plaine. On replante donc les arbres sur
// l'herbe sauvage (hors urbanSet / route / eau / berge), poussés dans `items` :
// mêmes sprites tree-N et même tri de profondeur que les arbres décoratifs
// (L.trees, tous ⊂ urbanSet → aucun doublon). La liste est STATIQUE dans le
// monde : on la mémoïse par (layout, région visible élargie de WILD_PAD) et on
// ne rebalaie le bruit de placement que si le layout change ou si la caméra sort
// de la région couverte — même idiome que les bakes à marge.
const WILD_PAD = 12;                    // cellules de marge : pan sans reconstruire
function isoWildForest(L, b) {
  const cache = CM._isoWildForest;
  // ':pv…' : le parvis d'une merveille en APERÇU (hors urbanSet, contrairement aux
  // actives) doit chasser les arbres sauvages → la dispersion se refait à l'aller-retour.
  const sig = (CM.layoutRecomputeAt || 0) + ':' + (L.gridN | 0) + ':' + (L.mapSeed || 0)
    + (CM.previewWonder ? ':pv' + CM.previewWonder.id : '');
  if (cache && cache.sig === sig
    && b.gx0 >= cache.gx0 && b.gx1 <= cache.gx1
    && b.gy0 >= cache.gy0 && b.gy1 <= cache.gy1) return cache.list;
  const gx0 = b.gx0 - WILD_PAD, gy0 = b.gy0 - WILD_PAD;
  const gx1 = b.gx1 + WILD_PAD, gy1 = b.gy1 + WILD_PAD;
  const urbanSet = L.urbanSet, roadSet = L.roadSet;
  const riverCells = (L.river && L.river.present && L.river.cells) || null;
  const banks = (L.river && L.river.banks) || null;
  const has = (s, gx, gy) => !!s && s.has(gx + ',' + gy);
  // Emprises des BÂTIMENTS (tuiles du layout) : la forêt sauvage ne pousse PAS
  // dessus. La plupart des emprises sont déjà dans urbanSet, mais le CHAMP (posé
  // sur l'herbe par la voie « ceinture agricole », hors urbanSet/occupiedFoot) y
  // échappait → des arbres sauvages le traversaient, révélés depuis que les
  // empreintes à plat se trient SOUS les objets. On couvre toutes les emprises.
  const buildFoot = new Set();
  for (const t of (L.tiles || [])) {
    const tsx = t.spanX || t.size || 1, tsy = t.spanY || t.size || 1;
    for (let ax = 0; ax < tsx; ax += 1) for (let ay = 0; ay < tsy; ay += 1) buildFoot.add((t.gx + ax) + ',' + (t.gy + ay));
  }
  // Herbe sauvage = ni sol urbain, ni route (les routes de campagne restent nues),
  // ni eau, ni berge (roseaux/quais y vivent déjà), ni emprise de bâtiment, ni
  // PARVIS de merveille (les emprises actives sont déjà urbaines ; celle d'un
  // APERÇU __showWonder ne l'est pas — sans ce garde, des arbres poussaient dessus).
  const wg = WONDER_GROUND.on ? wonderGroundSet(L) : null;
  const isWild = (gx, gy) =>
    !has(urbanSet, gx, gy) && !has(roadSet, gx, gy)
    && !has(riverCells, gx, gy) && !has(banks, gx, gy)
    && !buildFoot.has(gx + ',' + gy) && !has(wg, gx, gy);
  // Aération de lisière : une cellule au contact du bâti reçoit moins d'arbres →
  // clairière douce au bord de la ville (au lieu d'un mur d'arbres), comme le legacy.
  const nearCity = (gx, gy) =>
    has(urbanSet, gx - 1, gy) || has(urbanSet, gx + 1, gy) || has(urbanSet, gx, gy - 1) || has(urbanSet, gx, gy + 1)
    || has(roadSet, gx - 1, gy) || has(roadSet, gx + 1, gy) || has(roadSet, gx, gy - 1) || has(roadSet, gx, gy + 1);
  // Bruit basse fréquence → agglutine les arbres en fourrés et ménage des trouées
  // (repris de cityMapDrawTrees : mêmes fréquences /5 et /11).
  const cellNoise = (gx, gy) => {
    const n1 = (cmHash(Math.floor(gx / 5) + 'n' + Math.floor(gy / 5)) % 1000) / 1000;
    const n2 = (cmHash(Math.floor(gx / 11) + 'm' + Math.floor(gy / 11)) % 1000) / 1000;
    return n1 * 0.6 + n2 * 0.4;
  };
  const list = [];
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      if (!isWild(gx, gy)) continue;
      let thr = cellNoise(gx, gy) * 1.25 - 0.08;       // fourrés (haut) / trouées (bas)
      if (nearCity(gx, gy)) thr -= 0.35;               // aère la lisière
      if ((cmHash(gx + 'f' + gy) % 1000) / 1000 >= thr) continue;
      // Décalage sous-cellule + taille par arbre (hash riche) : casse la grille et
      // l'uniformité — mêmes plages que les arbres décoratifs (r ≈ 0.62..0.96).
      const h = cmHash('wf:' + gx + ':' + gy);
      const jx = ((h % 100) / 100 - 0.5) * 0.6;
      const jy = (((h >> 7) % 100) / 100 - 0.5) * 0.6;
      const r = 0.62 + (h % 30) / 80;
      list.push({ gx, gy, jx, jy, r });
    }
  }
  CM._isoWildForest = { sig, gx0, gy0, gx1, gy1, list };
  return list;
}

// ── PLACE : scène complète par ère (DA validée par Raph 2026-07-12 : fontaine
// monumentale évolutive + parterres fleuris + bancs/réverbères, minérale
// claire, UNE scène PixelLab par grande ère posée sur la dalle) ──────────────
let _isoPlazaCache = { at: -1, box: null };
function isoPlazaBox(L) {
  if (_isoPlazaCache.at === CM.layoutRecomputeAt) return _isoPlazaCache.box;
  // ⚠ Composante CONNEXE de la dalle centrale (flood-fill depuis la cellule
  // médiane), PAS la bbox de toutes les cellules 'plaza' : des cellules plaza
  // isolées existent ailleurs et gonflaient la bbox à la ville entière (scène
  // géante en fond d'écran, vu à la capture).
  const cells = new Set();
  if (L.roadMap) for (const c of L.roadMap.values()) if (c.rank === 'plaza') cells.add(c.gx + ',' + c.gy);
  let box = null;
  if (cells.size) {
    // PLUS GRANDE composante connexe = la vraie place. (Avant : flood depuis la cellule
    // MÉDIANE — si le seed tombait sur une case 'plaza' isolée, box minuscule → scène
    // invisible. Robustifié : on parcourt toutes les composantes, on garde la + grande.)
    const remaining = new Set(cells);
    let best = null;
    while (remaining.size) {
      const start = remaining.values().next().value;
      remaining.delete(start);
      const comp = [start];
      const stack = [start.split(',').map(Number)];
      while (stack.length) {
        const [x, y] = stack.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = (x + dx) + ',' + (y + dy);
          if (remaining.has(k)) { remaining.delete(k); comp.push(k); stack.push([x + dx, y + dy]); }
        }
      }
      if (!best || comp.length > best.length) best = comp;
    }
    let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
    for (const k of best) {
      const [x, y] = k.split(',').map(Number);
      if (x < gx0) gx0 = x; if (x > gx1) gx1 = x;
      if (y < gy0) gy0 = y; if (y > gy1) gy1 = y;
    }
    box = { gx0, gx1, gy0, gy1 };
  }
  _isoPlazaCache = { at: CM.layoutRecomputeAt, box };
  return _isoPlazaCache.box;
}
// Pas de scène aux stades primitifs (cohérence, comme les lampadaires).
const plazaEraForBand = (band) => (band >= 7 ? 'cosmic' : band >= 6 ? 'modern' : band >= 5 ? 'industrial' : band >= 4 ? 'medieval' : band >= 2 ? 'antique' : null);
// ── FONTAINE ANIMÉE : l'eau de la scène de place, bakée en strip 8 frames
// (/pixelart/iso/anim/plaza-fountain-<ère>.png, scripts/fetchFountainAnims.mjs)
// et blittée PAR-DESSUS la scène à l'emplacement exact du crop source. Hors
// eau, chaque frame est VERROUILLÉE sur les pixels de la scène → zéro couture,
// zéro wobble ; le repli (strip absent) est simplement la scène statique.
// Rects en px de la scène SOURCE — miroir exact de FOUNTAIN du script.
// FA_V : version de cache des strips (à incrémenter à chaque réécriture des
// PNG, le cache HTTP ressert sinon l'ancienne version — leçon aqueducs).
const FA_V = 2;
const FOUNTAIN_ANIM = {
  antique: { x: 100, y: 4, w: 108, h: 116 },
  medieval: { x: 110, y: 8, w: 126, h: 128 },
  industrial: { x: 108, y: 26, w: 116, h: 104 },
  modern: { x: 116, y: 26, w: 124, h: 100 },
  cosmic: { x: 92, y: 0, w: 110, h: 128 },
};
// Molette : __fountainAnim({ on, ms }) — ms = durée d'une frame.
// 240 ms (≈4 fps, cycle 1.5-2 s) : à 120 les ondulations « allaient trop
// vite » (retour Raph) ; l'eau de fontaine doit rester paisible.
const FOUNTAIN_TUNE = { on: true, ms: 240 };
if (typeof window !== 'undefined') {
  window.__fountainAnim = (o) => { if (o) Object.assign(FOUNTAIN_TUNE, o); return { ...FOUNTAIN_TUNE }; };
}

// Cap écran (rad, 0 = est, +π/2 = sud/bas) → nom de rotation d'objet PixelLab.
const BOAT_SECTORS = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
function boatSector(angle) {
  const k = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return BOAT_SECTORS[k];
}
// Stades couverts par l'art iso (cosmique : repli legacy/procédural conservé).
const BOAT_ISO = { raft: 1, sail: 1, steam: 1, container: 1 };

// ── BATEAUX : flotte legacy (CM.ships) sur le ruban projeté ──────────────────
// Reprend la recette drawShips (stade par ère, voie latérale, louvoiement,
// sillage additif, coque « toujours droite ») mais TOUT passe par la projection :
// position monde → worldToScreen, inclinaison = tangente PROJETÉE. Escales
// simplifiées (ralentit près d'un quai, pas d'arrêt long). Dessinés APRÈS le
// fleuve et AVANT les ponts → ils passent sous les tabliers.
function drawIsoShips(dt, now) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !CM.ships || !CM.ships.length) return;
  const sm = rv.samples;
  if (!sm || sm.length < 2) return;
  const T = CM.TILE, ctx = CM.ctx, z = CM.cam.zoom, s = T * z;
  const band = (L.counts && L.counts.eraBand) | 0, ei = (L.counts && L.counts.eraIndex) | 0;
  const vstage = band >= 7 ? 'cosmic' : ei >= 30 ? 'container' : ei >= 20 ? 'steam' : ei >= 10 ? 'sail' : 'raft';
  const sizeMul = vstage === 'cosmic' ? (band >= 9 ? 5.6 : band >= 8 ? 4.8 : 4.0)
    : vstage === 'container' ? 3.2 : vstage === 'steam' ? 2.4 : vstage === 'sail' ? 1.8 : 1.36;
  const boatKey = vstage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, band)) : vstage;
  const chr = BOAT_SIZES[vstage] ? ensureBoat(boatKey) : null;
  const docks = CM.shipDocks || [];
  for (const sh of CM.ships) {
    let prox = 0;
    for (const d of docks) { let dd = Math.abs(sh.t - d.t); if (dd > 0.5) dd = 1 - dd; prox = Math.max(prox, Math.max(0, 1 - dd / 0.05)); }
    const moveF = 1 - 0.7 * prox;
    sh.t += sh.dir * sh.speed * moveF * dt;
    if (sh.t > 1) sh.t -= 1; if (sh.t < 0) sh.t += 1;
    const fi = sh.t * (sm.length - 1);
    const i0 = Math.max(0, Math.min(sm.length - 1, Math.floor(fi)));
    const i1 = Math.min(sm.length - 1, i0 + 1);
    const f = fi - i0;
    let cgx = sm[i0].x + (sm[i1].x - sm[i0].x) * f;
    let cgy = sm[i0].y + (sm[i1].y - sm[i0].y) * f;
    // Voie latérale propre + louvoiement (repris du legacy).
    const hw = sm[i0].hw || 2;
    let nx = -(sm[i1].y - sm[i0].y), ny = sm[i1].x - sm[i0].x;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const effSize = (BOAT_SIZES[vstage] || 0.7) * sizeMul;
    // Voie RESSERRÉE (hw×0.78) : dans les coudes, l'interpolation linéaire des
    // samples dérive du ruban lissé → à pleine demi-largeur les coques
    // mordaient la berge près du pont (vu à la capture).
    const laneRoom = Math.max(0, hw * 0.78 - effSize * 0.3 - 0.25);
    const wave = Math.sin((now || 0) / 2600 + (sh.phase || 0)) * 0.12;
    const lateral = ((sh.lane || 0) + wave) * laneRoom;
    cgx += nx * lateral; cgy += ny * lateral;
    const p = worldToScreen(cgx * T, cgy * T);
    if (p.x < -s * 3 || p.x > CM.cw + s * 3 || p.y < -s * 3 || p.y > CM.ch + s * 3) continue;
    // Cap PROJETÉ complet (rad écran), signé par le sens de navigation.
    const a2 = worldToScreen(sm[i0].x * T, sm[i0].y * T);
    const b2 = worldToScreen(sm[i1].x * T, sm[i1].y * T);
    const sgn = sh.dir < 0 ? -1 : 1;
    const heading = Math.atan2(sgn * (b2.y - a2.y), sgn * (b2.x - a2.x));
    const spd01 = Math.max(0, Math.min(1, (sh.speed - 0.008) / 0.012));
    // Sillage additif derrière la poupe + ombre : pivotés au CAP COMPLET (l'eau
    // suit la pente, seul le sprite de coque reste droit).
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(heading);
    {
      const WL = s * (0.85 + spd01 * 0.8) * (0.35 + 0.65 * moveF) * sizeMul * 0.7;
      const foam = vstage === 'cosmic' ? '150,220,255' : '225,238,245';
      const wa = (0.10 + spd01 * 0.10) * moveF;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gt = ctx.createLinearGradient(-s * 0.18 * sizeMul, 0, -WL, 0);
      gt.addColorStop(0, `rgba(${foam},${wa.toFixed(2)})`);
      gt.addColorStop(1, `rgba(${foam},0)`);
      ctx.fillStyle = gt;
      ctx.beginPath();
      ctx.moveTo(-s * 0.18 * sizeMul, -s * 0.045 * sizeMul);
      ctx.lineTo(-WL, -s * 0.02 * sizeMul);
      ctx.lineTo(-WL, s * 0.02 * sizeMul);
      ctx.lineTo(-s * 0.18 * sizeMul, s * 0.045 * sizeMul);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(10,25,35,0.20)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.06 * sizeMul, s * 0.24 * sizeMul, s * 0.08 * sizeMul, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // COQUE : rotation d'objet PixelLab au SECTEUR du cap (8 vues, Phase 5 —
    // fini le profil penché « qui tombe »), sinon repli profil legacy amorti.
    const isoBoat = BOAT_ISO[vstage] ? isoArt('boat-' + vstage + '-' + boatSector(heading)) : null;
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    if (isoBoat && isoBoat.ready) {
      const dw = s * (BOAT_SIZES[vstage] || 0.7) * sizeMul * 1.15;
      const bob = Math.sin((now || 0) / 1600 + (sh.phase || 0)) * s * 0.015;
      ctx.drawImage(isoBoat.img, p.x - dw / 2, p.y - dw * 0.58 + bob, dw, dw);
    } else if (chr && boatReady(chr)) {
      const tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(b2.y - a2.y, Math.abs(b2.x - a2.x) || 1e-6) * 0.45));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(tilt);
      ctx.scale((sh.dir < 0 ? -1 : 1) * sizeMul, sizeMul);
      const bimg = chr.img;
      const bfh = bimg.naturalHeight || bimg.height || 64;
      const bnf = Math.max(1, Math.round((bimg.naturalWidth || bimg.width || bfh) / bfh));
      const bf = bnf > 1 ? Math.floor((now || 0) / 140 + sh.t * 7) % bnf : 0;
      const dw = s * BOAT_SIZES[vstage], dh = dw;
      ctx.drawImage(bimg, bf * bfh, 0, bfh, bfh, -dw / 2, -dh / 2 - dh * BOAT_LIFT, dw, dh);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = prevSm;
  }
}

// ── DRONES : passe aérienne (sprite top-down pivoté au cap projeté) ──────────
function drawIsoDrones(now) {
  if (CM.lodActive) return;
  const T = CM.TILE, z = CM.cam.zoom, s = T * z, ctx = CM.ctx;
  let dchr = null;
  for (const v of CM.vehicles) {
    if (v.type !== 'drone') continue;
    if (!dchr) dchr = ensureDrone();
    const p = worldToScreen(v.x, v.y);
    if (p.x < -s || p.y < -s * 2 || p.x > CM.cw + s || p.y > CM.ch + s) continue;
    const t2 = now || 0;
    const hover = Math.sin(t2 / 380 + v.x * 0.04) * s * 0.04;
    const dScale = CM.droneSize || 0.58;
    // Ombre AU SOL (à la position projetée), drone en altitude au-dessus.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, s * dScale * 0.2, s * dScale * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    if (!(dchr && dchr.ready && dchr.img)) continue;
    const q = worldToScreen(v.tx, v.ty);
    let hx = q.x - p.x, hy = q.y - p.y;
    const hd = Math.hypot(hx, hy);
    if (hd > 0.5) { hx /= hd; hy /= hd; } else { hx = 1; hy = 0; }
    const dsz = s * dScale;
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(p.x, p.y - s * 0.55 + hover);
    ctx.rotate(Math.atan2(hy, hx) + Math.PI / 2);
    ctx.drawImage(dchr.img, -dsz / 2, -dsz / 2, dsz, dsz);
    drawDroneRotors(ctx, dsz, t2, v.x * 0.1);
    ctx.restore();
    ctx.imageSmoothingEnabled = prevSm;
  }
}

// ── NUIT : voile bleu + fenêtres chaudes (halos additifs seedés) ─────────────
// Lit CM.nightF (cycle jour/nuit du runtime, forcé par les captures). Halos
// APRÈS le voile = lumières (même ordre que le legacy). Plafonné pour la perf.
// ── LAMPADAIRES par ère (retour Raph : points lumineux ANCRÉS aux mâts) ──────
// Liste déterministe par layout : cellules-route TRAVERSANTES (pas carrefour,
// pas pont, pas place), 1 sur 3, côté de chaussée par RUE. band ≥ 2 : pas de
// lampadaires aux stades primitifs (cohérence demandée). Sprites
// /pixelart/iso/lamp-{antique|gas|electric|energy}.png, posés au PEINTRE
// (drawIsoLive) ; la nuit, le halo se dessine À LA TÊTE de chaque mât.
let _isoLampCache = { at: -1, lamps: null };
function isoLamps(L, band) {
  if (band < 2 || !L.roadMap) return [];
  if (_isoLampCache.at === CM.layoutRecomputeAt && _isoLampCache.lamps) return _isoLampCache.lamps;
  const lamps = computeIsoLamps(L, CM.TILE);
  _isoLampCache = { at: CM.layoutRecomputeAt, lamps };
  return lamps;
}
// Corps PUR (exporté pour les tests) : positions + PROFONDEUR peintre de chaque mât.
// La clé d'un mât n'est PAS toujours wx+wy de son pied : côté 0.14 (bord nord/ouest
// de chaussée), le mât se dresse DEVANT la façade sud (route horizontale) ou est
// (route verticale) du bâtiment MITOYEN, mais son pied a une profondeur plus PETITE
// que le coin sud de l'empreinte — la clé des socles (cf. drawIsoLive) — donc le
// peintre l'AVALAIT (116 mâts sur 339 en ville band 4). On aligne sa clé juste
// devant ce bâtiment. Côté 0.86 le bâtiment mitoyen est au sud/est du mât → le mât
// est derrière lui, l'ordre naturel wx+wy est déjà le bon.
export function computeIsoLamps(L, T) {
  const lamps = [];
  const solid = isoSolidSouthCorners(L, T);
  for (const c of L.roadMap.values()) {
    if (c.roadSurface === 'bridge' || c.rank === 'plaza') continue;
    const mask = c.mask | 0;
    const thH = !!((mask & ROAD_E) && (mask & ROAD_W));
    const thV = !!((mask & ROAD_S) && (mask & ROAD_N));
    if (thH === thV) continue;                    // carrefour / impasse : pas de mât
    if (((c.gx + c.gy) % 3) !== 0) continue;      // espacement ~3 cellules
    // Côté de chaussée CONSTANT le long d'une même rue (hash par RUE, pas par
    // cellule) : les mâts forment une ligne continue au lieu de zigzaguer.
    // Le mât se plante DANS LE TROTTOIR (les 20% extérieurs de la cellule hors
    // chaussée : ROAD_BAND=0.30 → chaussée = 0.20..0.80) à CURB du bord de cellule.
    // 0.14/0.86 collait le socle au ras de la chaussée → il « dépassait sur la
    // route » (Raph) ; CURB petit recule le socle ET les bras au sec.
    const CURB = LAMP_TUNE.curb;
    const side = (cmHash(thH ? 'lmp:h:' + c.gy : 'lmp:v:' + c.gx) & 1) ? 1 - CURB : CURB;
    const wx = (thH ? c.gx + 0.5 : c.gx + side) * T;
    const wy = (thH ? c.gy + side : c.gy + 0.5) * T;
    let d = wx + wy;
    if (side < 0.5) {
      const bd = solid.get(thH ? c.gx + ':' + (c.gy - 1) : (c.gx - 1) + ':' + c.gy);
      if (bd != null && bd + 1 > d) d = bd + 1;   // +1 px monde : juste devant le socle
    }
    lamps.push({ wx, wy, gx: c.gx, gy: c.gy, d });
  }
  return lamps;
}
// Coin SUD (clé peintre, px monde wx+wy) de chaque cellule couverte par un bâtiment
// DEBOUT. Les empreintes à plat (champs) trient au coin nord comme le sol → exclues ;
// l'aqueduc se rend en TRANCHES par cellule (cf. drawIsoLive) → coin sud LOCAL.
function isoSolidSouthCorners(L, T) {
  const m = new Map();
  for (const t of (L.tiles || [])) {
    const idf = t.buildingId || t.variant || '';
    if (/field|farm|crop|orchard/i.test(idf)) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const aq = /aqueduct/i.test(idf);
    const dSouth = ((t.gx + sx) + (t.gy + sy)) * T;
    for (let ix = 0; ix < sx; ix += 1) {
      const dCell = aq ? ((t.gx + ix + 1) + (t.gy + sy)) * T : dSouth;
      for (let iy = 0; iy < sy; iy += 1) m.set((t.gx + ix) + ':' + (t.gy + iy), dCell);
    }
  }
  return m;
}
const lampEraForBand = (band) => (band >= 7 ? 'energy' : band >= 6 ? 'electric' : band >= 4 ? 'gas' : 'antique');
// v3 = antique & gas refaits en VRAI 3/4 iso high top-down 64×128 (les v2 étaient
// vus DE FACE, retour Raph 2026-07-13) ; electric/energy v2 gardés (mâts ronds,
// invariants à l'angle). Cache-buster : ces PNG sont RÉÉCRITS sur disque → sans
// query, des navigateurs resservent l'ancien depuis le cache HTTP. Incrémenter
// à chaque réécriture.
const LAMP_V = 3;
// Taille & pose des mâts (retour Raph : « trop gros, et n'ont pas de pieds ») :
// h = hauteur VISIBLE en tuiles, mesurée sur le CONTENU opaque du PNG (les 4
// sprites ont 4 à 13 % de marge → même taille apparente aux 4 ères) ; 1.15 les
// faisait culminer à hauteur de maison. Le PIED (centre de masse des dernières
// rangées opaques — le col de cygne electric penche : le pied est à 39 % du
// canvas, pas au centre) se plante PILE sur le point d'ancrage, à même le sol
// (l'ombre de contact elliptique a été essayée puis RETIRÉE, retour Raph).
// headF = hauteur de la tête lumineuse (halo). curb = recul du pied depuis le bord
// de cellule (fraction de tuile) : plante le mât dans le trottoir, hors chaussée.
// Molette : __lampTune({ h, headF, curb }).
const LAMP_TUNE = { h: 0.8, headF: 0.8, curb: 0.05 };
if (typeof window !== 'undefined') {
  window.__lampTune = (o) => { if (o) Object.assign(LAMP_TUNE, o); return { ...LAMP_TUNE }; };
}
// Métriques de pied mémoïsées par sprite (fractions du canvas) — même idiome
// canvas-scan que isoTileBBox, plus le centre de masse des 4 rangées basses.
function lampFootMetrics(e) {
  if (e._foot) return e._foot;
  const img = e.img, w = img && img.naturalWidth, h = img && img.naturalHeight;
  if (!w || !h) return null;
  let c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  else { c = document.createElement('canvas'); c.width = w; c.height = h; }
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0);
  let data = null;
  try { data = cx.getImageData(0, 0, w, h).data; } catch { /* canvas souillé : repli */ }
  let m = { footXf: 0.5, footYf: 0.97, usedHf: 0.92 };
  if (data) {
    let y0 = h, y1 = -1;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 16) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (y1 >= 0) {
      let sx = 0, n = 0;
      for (let y = Math.max(y0, y1 - 3); y <= y1; y += 1) for (let x = 0; x < w; x += 1) {
        if (data[(y * w + x) * 4 + 3] > 16) { sx += x + 0.5; n += 1; }
      }
      m = { footXf: n ? sx / n / w : 0.5, footYf: (y1 + 1) / h, usedHf: (y1 - y0 + 1) / h };
    }
  }
  e._foot = m;
  return m;
}
// Terre-plein : remontée de la bande au-dessus de la couture des deux voies, en
// fraction de sa largeur (0 = à cheval pile). 0.30 la faisait flotter (« décalée
// vers le haut », Raph) : le sprite est déjà centré. Molette : __medianLift(0.1).
// ext = prolongement des bouts (fraction de tuile MONDE de chaque côté) : les
// segments terrePlein s'arrêtent au bord de la cellule-carrefour, laissant un
// vide de chaussée nue avant la transversale (« il manque une légère longueur »,
// Raph) — la bande mord un peu sur la cellule d'intersection sans la traverser.
const MEDIAN_TUNE = { lift: 0.06, ext: 0.32 };
if (typeof window !== 'undefined') {
  window.__medianLift = (v) => { if (typeof v === 'number') MEDIAN_TUNE.lift = v; return MEDIAN_TUNE.lift; };
  window.__medianExt = (v) => { if (typeof v === 'number') MEDIAN_TUNE.ext = v; return MEDIAN_TUNE.ext; };
}
// ── FLAMMES & LUMIÈRES DES LAMPADAIRES (animées) ─────────────────────────────
// Chaque ère a sa/ses source(s) lumineuse(s), repérées en FRACTION du canvas du
// sprite (fx depuis la gauche du sprite dessiné, fy depuis le haut) — mesurées sur
// les pixels chauds des PNG. hx/hy = tête « moyenne » (halo ambiant + flaque au
// sol). style pilote le scintillement ; day = visibilité DIURNE (une torche brûle
// de jour ; le gaz/électrique ne « s'allument » qu'à la nuit). col = teinte RGB.
const LAMP_LIGHTS = {
  antique:  { style: 'fire',   col: '255,186,84',  day: 0.5,  hx: 0.49, hy: 0.13, em: [{ fx: 0.49, fy: 0.12, r: 0.30 }] },
  gas:      { style: 'gas',    col: '255,201,120', day: 0.12, hx: 0.48, hy: 0.20, em: [{ fx: 0.32, fy: 0.20, r: 0.20 }, { fx: 0.635, fy: 0.20, r: 0.20 }] },
  electric: { style: 'steady', col: '240,246,232', day: 0.14, hx: 0.64, hy: 0.19, em: [{ fx: 0.64, fy: 0.19, r: 0.24 }] },
  energy:   { style: 'pulse',  col: '150,230,255', day: 0.45, hx: 0.50, hy: 0.17, em: [{ fx: 0.50, fy: 0.17, r: 0.30 }] },
};
// Réglage live : __lampLight({ on, gain }). gain multiplie toute l'intensité.
const LAMP_LIGHT = { on: true, gain: 1 };
if (typeof window !== 'undefined') {
  window.__lampLight = (o) => { if (o) Object.assign(LAMP_LIGHT, o); return { ...LAMP_LIGHT }; };
}
// Scintillement ∈ [~0.4 .. 1], déterministe (now ms + phase par mât) : feu nerveux
// (somme de sinus déphasés), gaz plus calme, néon = respiration lente, électrique
// = quasi fixe (micro-tremble). Le déterminisme garde les captures reproductibles.
function lampFlicker(style, now, ph) {
  const t = now || 0;
  if (style === 'fire') {
    const a = 0.55 * Math.sin(t * 0.013 + ph) + 0.30 * Math.sin(t * 0.029 + ph * 1.7) + 0.15 * Math.sin(t * 0.047 + ph * 2.3);
    return 0.72 + 0.28 * a;
  }
  if (style === 'gas') {
    const a = 0.7 * Math.sin(t * 0.006 + ph) + 0.3 * Math.sin(t * 0.017 + ph * 1.4);
    return 0.86 + 0.14 * a;
  }
  if (style === 'pulse') return 0.7 + 0.3 * Math.sin(t * 0.0035 + ph);
  return 0.96 + 0.04 * Math.sin(t * 0.02 + ph);   // steady
}
const lampPhase = (lp) => ((lp.gx * 73 + lp.gy * 179) % 628) / 100;
// Glow radial additif (le contexte doit être en composite 'lighter').
function addGlow(ctx, x, y, r, col, alpha) {
  if (alpha <= 0.004 || r < 0.6) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${alpha.toFixed(3)})`);
  g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawIsoNight(now) {
  const n = CM.nightF || 0;
  const ctx = CM.ctx, L = CM.layout;
  // Voile de nuit d'abord (les lumières se dessinent PAR-DESSUS en additif) ; mais
  // la passe de lumière tourne AUSSI de jour (flammes de torche, néon).
  if (n > 0.03) {
    ctx.fillStyle = `rgba(8,11,26,${(0.62 * n).toFixed(2)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
  }
  if (!L || CM.lodActive || !LAMP_LIGHT.on) return;   // pas de sprites-lampes en LOD → pas de lumières
  const T = CM.TILE, z = CM.cam.zoom;
  const b = visibleCellBounds(0);
  const band = (L.counts && L.counts.eraBand) | 0;
  const lamps = isoLamps(L, band);
  if (!lamps.length) return;
  const lig = LAMP_LIGHTS[lampEraForBand(band)] || LAMP_LIGHTS.antique;
  const vis = lig.day + (1 - lig.day) * n;            // visibilité diurne/nocturne de la source
  if (vis <= 0.02) return;
  // Métriques du sprite pour placer les sources sur la tête (mêmes calculs que le peintre).
  const art = isoArt('lamp-' + lampEraForBand(band) + '?v=' + LAMP_V);
  const m = (art.ready && lampFootMetrics(art)) || { footXf: 0.5, footYf: 0.97, usedHf: 0.92 };
  const hpx = T * z * LAMP_TUNE.h / (m.usedHf || 1);
  const wpx = art.ready ? hpx * ((art.img.naturalWidth || 1) / (art.img.naturalHeight || 1)) : hpx * 0.5;
  const gain = LAMP_LIGHT.gain;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let count = 0;
  for (const lp of lamps) {
    if (count > 320) break;
    if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
    count += 1;
    const p = worldToScreen(lp.wx, lp.wy);
    const boxL = p.x - wpx * m.footXf, boxT = p.y - hpx * m.footYf;
    const ph = lampPhase(lp);
    const fl = lampFlicker(lig.style, now, ph);
    // — NUIT : halo ambiant à la tête + flaque au sol (n uniquement), scintillés.
    if (n > 0.03) {
      const hx = boxL + lig.hx * wpx, hy = boxT + lig.hy * hpx;
      addGlow(ctx, hx, hy, Math.max(4, T * z * 0.78) * (0.9 + 0.2 * fl), lig.col, Math.min(0.6, 0.5 * n) * fl * gain);
      const rp = Math.max(4, T * z * 0.8);
      const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rp);
      g2.addColorStop(0, `rgba(${lig.col},${(0.17 * n * fl * gain).toFixed(3)})`);
      g2.addColorStop(1, `rgba(${lig.col},0)`);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rp * 0.8, rp * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // — SOURCE VIVE (jour + nuit) : cœur lumineux scintillant sur chaque flamme/lanterne.
    for (const e of lig.em) {
      let ex = boxL + e.fx * wpx, ey = boxT + e.fy * hpx;
      if (lig.style === 'fire') {              // la flamme ondule : monte quand elle brille, oscille un peu
        ey -= wpx * 0.10 * (fl - 0.72);
        ex += wpx * 0.05 * Math.sin((now || 0) * 0.021 + ph);
      }
      const r = T * z * e.r * (0.8 + 0.35 * fl);
      addGlow(ctx, ex, ey, r, lig.col, Math.min(0.85, 0.62 * vis * fl * gain));
    }
  }
  ctx.restore();
}

// ── PARTICULES D'AMBIANCE (feuilles / lucioles / motes d'énergie) ────────────
// Champ PROCÉDURAL SANS ÉTAT : chaque particule a une position = fonction PURE de
// (now, graine) → aucun tableau qui gonfle, bouclage sans couture, et captures
// REPRODUCTIBLES (même now → même image). Ancré sur la végétation (arbres déco +
// forêt sauvage). Par ère : feuilles qui tombent (jour) + lucioles (nuit) ; à
// l'ère cosmique (band ≥ 7) elles cèdent la place à des MOTES d'énergie montantes.
const AMBIENT = { on: true, leaves: 1, sparks: 1 };
if (typeof window !== 'undefined') {
  window.__ambient = (o) => { if (o) Object.assign(AMBIENT, o); return { ...AMBIENT }; };
}
// Palette de feuilles mortes (ambre/or/rouille + deux verts qui traînent).
const LEAF_COLS = ['196,120,45', '214,158,58', '170,86,38', '150,120,50', '120,150,60'];
const _frac = (x) => x - Math.floor(x);
// Bruit-hash déterministe [0,1) à partir de 2 entiers (graine mât + index particule).
const _rnd = (s, i) => _frac(Math.sin(s * 12.9898 + i * 78.233) * 43758.5453);
// Ancres de végétation visibles (base monde + rayon + graine), plafonnées. Mémoïsé
// par (layout, bornes) : ne se reconstruit qu'au changement de cadrage/plan.
function isoVegAnchors(L, b) {
  const cache = CM._vegAnchors;
  const sig = (CM.layoutRecomputeAt || 0) + ':' + (L.gridN | 0) + ':' + (L.mapSeed || 0)
    + ':' + b.gx0 + ':' + b.gy0 + ':' + b.gx1 + ':' + b.gy1;
  if (cache && cache.sig === sig) return cache.list;
  const T = CM.TILE, list = [];
  const push = (gx, gy, jx, jy, r) => {
    if (gx < b.gx0 || gx > b.gx1 || gy < b.gy0 || gy > b.gy1) return;
    if (list.length >= 260) return;                 // garde-fou perf
    list.push({ wx: (gx + 0.5 + jx) * T, wy: (gy + 0.9 + jy) * T, r: r || 0.7, s: (cmHash('veg:' + gx + ':' + gy) >>> 0) });
  };
  for (const tr of (L.trees || [])) push(tr.gx, tr.gy, 0, 0, tr.r);
  for (const wt of isoVegForestSample(L, b)) push(wt.gx, wt.gy, wt.jx || 0, wt.jy || 0, wt.r);
  CM._vegAnchors = { sig, list };
  return list;
}
// Sous-échantillon de la forêt (1 arbre sur 2) : assez d'ancres pour la vie, sans
// noyer l'écran ni le coût (la forêt peut compter des centaines d'arbres).
function isoVegForestSample(L, b) {
  const full = isoWildForest(L, b);
  if (full.length <= 130) return full;
  const out = [];
  for (let i = 0; i < full.length; i += 2) out.push(full[i]);
  return out;
}

function drawIsoAmbient(now) {
  const L = CM.layout;
  if (!L || CM.lodActive || !AMBIENT.on) return;    // pas de particules en vue d'ensemble
  const ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const band = (L.counts && L.counts.eraBand) | 0;
  const n = CM.nightF || 0;
  const cosmic = band >= 7;
  const b = visibleCellBounds(T * z);
  const anchors = isoVegAnchors(L, b);
  if (!anchors.length) return;
  const t = now || 0;
  const fleck = Math.max(1, Math.round(T * z * 0.05));   // taille d'une feuille (px écran)

  // ── FEUILLES (ères pré-cosmiques, surtout de JOUR) : chute + tangage, fondu aux
  //    deux bouts (naît sous la canopée, disparaît au sol → pas de pop).
  if (!cosmic && AMBIENT.leaves > 0) {
    const dayDim = 1 - 0.65 * n;                         // s'effacent la nuit
    if (dayDim > 0.05) {
      const prevAA = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      for (const a of anchors) {
        if ((a.s % 2) !== 0) continue;                   // ~1 arbre sur 2 perd des feuilles
        const p = worldToScreen(a.wx, a.wy);
        const th = T * z * a.r * 2.7;                    // hauteur du sprite d'arbre
        const topY = p.y - th * 0.78, canW = th * 0.42, fall = th * 1.25;   // tombe JUSQU'AU SOL
        for (let i = 0; i < 2; i += 1) {
          const sd = _rnd(a.s, i), sd2 = _rnd(a.s, i + 9);
          const ph = _frac(t / (3800 + sd * 3200) + sd);
          const fade = Math.sin(ph * Math.PI);
          if (fade < 0.06) continue;
          const ly = topY + ph * fall;
          // dérive latérale NETTE (s'éloigne du tronc en tombant) + léger tangage :
          // la feuille quitte la canopée et se lit sur le sol, pas noyée dans le feuillage.
          const drift = (sd2 < 0.5 ? -1 : 1) * ph * canW * 0.9;
          const lx = p.x + (sd - 0.5) * canW * 0.5 + drift + Math.sin(ph * Math.PI * 3 + sd2 * 6.28) * canW * 0.32;
          ctx.fillStyle = `rgba(${LEAF_COLS[(a.s + i) % LEAF_COLS.length]},${(fade * dayDim * AMBIENT.leaves * 0.9).toFixed(3)})`;
          const tumble = _frac(ph * 5) < 0.5;             // bascule 1×2 / 2×1 → chute qui vrille
          ctx.fillRect(Math.round(lx - fleck / 2), Math.round(ly - fleck / 2),
            tumble ? fleck : Math.max(1, Math.round(fleck * 0.6)),
            tumble ? Math.max(1, Math.round(fleck * 0.6)) : fleck);
        }
      }
      ctx.imageSmoothingEnabled = prevAA;
    }
  }

  // ── LUCIOLES (nuit, ères pré-cosmiques) & MOTES D'ÉNERGIE (cosmique, jour+nuit) :
  //    glows additifs. Lucioles = errance en Lissajous + clignotement ; motes = montée.
  const sparksNight = !cosmic && n > 0.18;
  if ((cosmic || sparksNight) && AMBIENT.sparks > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of anchors) {
      const p = worldToScreen(a.wx, a.wy);
      const th = T * z * a.r * 2.7;
      if (cosmic) {
        if ((a.s % 3) !== 0) continue;                   // ~1/3 des ancres
        for (let i = 0; i < 2; i += 1) {
          const sd = _rnd(a.s, i + 5), sd2 = _rnd(a.s, i + 21);
          const ph = _frac(t / (5000 + sd * 4000) + sd);
          const fade = Math.sin(ph * Math.PI);
          if (fade < 0.05) continue;
          const my = (p.y - th * 0.1) - ph * th * 1.1;   // monte
          const mx = p.x + (sd - 0.5) * th * 0.4 + Math.sin(ph * Math.PI * 2 + sd2 * 6.28) * th * 0.15;
          const col = (a.s + i) & 1 ? '150,230,255' : '200,160,255';   // cyan / magenta
          addGlow(ctx, mx, my, Math.max(2, T * z * 0.09) * (0.8 + 0.4 * fade), col, Math.min(0.7, fade * AMBIENT.sparks * 0.7));
          ctx.fillStyle = `rgba(235,250,255,${(fade * AMBIENT.sparks * 0.85).toFixed(3)})`;
          ctx.fillRect(Math.round(mx), Math.round(my), 1, 1);
        }
      } else {
        if ((a.s % 3) !== 1) continue;                   // ~1/3 des ancres
        const hoverY = p.y - th * 0.4, rx = th * 0.32, ry = th * 0.24;
        for (let i = 0; i < 2; i += 1) {
          const sd = _rnd(a.s, i + 3), sd2 = _rnd(a.s, i + 17);
          const fx = p.x + Math.sin(t * (0.0007 + sd * 0.0006) + sd * 6.28) * rx;
          const fy = hoverY + Math.cos(t * (0.0009 + sd2 * 0.0006) + sd2 * 6.28) * ry;
          // clignotement DOUX (jamais tout à fait éteint) → une nuée qui scintille
          // en permanence, plus lisible qu'un allumage franc trop épars.
          const bl = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.003 + sd * 0.003) + sd2 * 6.28));
          const a2 = bl * n * AMBIENT.sparks;
          if (a2 < 0.03) continue;
          addGlow(ctx, fx, fy, Math.max(3, T * z * 0.14), '190,235,130', Math.min(0.75, a2 * 0.72));
          ctx.fillStyle = `rgba(228,255,180,${(a2 * 0.9).toFixed(3)})`;
          ctx.fillRect(Math.round(fx), Math.round(fy), fleck > 2 ? 2 : 1, fleck > 2 ? 2 : 1);
        }
      }
    }
    ctx.restore();
  }
}

// ── PONT : tablier par ère au-dessus de l'eau (cellules roadSurface 'bridge') ─
// Matière par bande, calquée sur les 5 stades du pont pixel legacy
// (bois → pierre → fer → béton/énergie). Le tablier d'une voie s'étend jusqu'au
// bord mitoyen quand la voie JUMELLE est aussi un pont (double-voie dès band 2)
// → un seul tablier continu, garde-corps seulement sur les bords EXTÉRIEURS.
let _isoBridgeCache = { at: -1, cells: null };
function isoBridgeCells(L) {
  if (_isoBridgeCache.at === CM.layoutRecomputeAt && _isoBridgeCache.cells) return _isoBridgeCache.cells;
  const cells = [];
  for (const c of L.roadMap.values()) if (c.roadSurface === 'bridge') cells.push(c);
  _isoBridgeCache = { at: CM.layoutRecomputeAt, cells };
  return cells;
}
function bridgeTone(band) {
  return band >= 7 ? [104, 110, 128]
    : band >= 5 ? [92, 88, 86]
      : band >= 3 ? [132, 126, 112]
        : [126, 96, 58];
}
// Rejoue un rendu ÉCRAN LEGACY en iso : P_iso = A ∘ P_legacy, avec A l'affine
// écran autour du centre, de colonnes (ISO_X, ISO_Y) et (−ISO_X, ISO_Y). Tout
// art PLAT dessiné par le pipeline legacy (tablier de pont, terre-plein planté)
// se projette ainsi EXACTEMENT sur le plan du sol en losange — zéro re-art.
// ⚠ Réservé à l'art « à plat » : un décor avec verticalité bakée se coucherait.
function withLegacyToIso(ctx, fn) {
  ctx.save();
  ctx.translate(CM.cw / 2, CM.ch / 2);
  ctx.transform(ISO_X, ISO_Y, -ISO_X, ISO_Y, 0, 0);
  ctx.translate(-CM.cw / 2, -CM.ch / 2);
  const out = fn();
  ctx.restore();
  return out;
}

// Polygone MONDE (px) projeté puis rempli — quads non alignés aux axes
// (rampes d'accès des ponts, etc.).
function fillWorldPoly(ctx, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 1) {
    const q = worldToScreen(pts[i][0], pts[i][1]);
    if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();
  ctx.fill();
}

// RAMPES D'ACCÈS (retour Raph : « la jonction pont/routes n'est pas fluide »).
// À chaque bout de travée, un trapèze en matière de CHAUSSÉE qui s'évase de la
// largeur du ruban de route vers la largeur du tablier — l'asphalte « monte »
// sur le pont et couvre la couture dure de la culée. Bordure sombre dessous,
// même grammaire que les rubans de rue. Dessiné APRÈS le tablier (pixel ou
// procédural), AVANT la passe vivante (les véhicules roulent dessus).
function drawBridgeAprons(ctx, band, T) {
  return;   // EMBOUTS RETIRÉS (Raph) : plus de rampe de raccord au début/sortie des ponts.
  /* eslint-disable no-unreachable -- corps CONSERVÉ pour référence (rampes retirées) ; réactivable si les embouts reviennent */
  const spans = CM.bridgeSpans;
  if (!spans || !spans.length) return;
  const road = roadTone(band);
  const wr = T * (ROAD_BAND + 0.05);           // demi-largeur du ruban (avec bordure)
  const deck = bridgeTone(band);
  // Rampe AFFINÉE (retour Raph « trop brute ») : DÉGRADÉ de matière
  // chaussée→tablier le long de l'axe (fini l'aplat qui tranchait), gabarit
  // réduit, fines bordures sombres sur les flancs (grammaire des rubans).
  const drawApron = (outer, inner, cOutL, cOutR, cInL, cInR) => {
    const p0 = worldToScreen(outer[0], outer[1]);   // milieu du bord côté route
    const p1 = worldToScreen(inner[0], inner[1]);   // milieu du bord côté tablier
    const gr = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    gr.addColorStop(0, rgb(road, 0.95));
    gr.addColorStop(1, rgb(deck, 0.95));
    ctx.fillStyle = gr;
    fillWorldPoly(ctx, [cOutL, cInL, cInR, cOutR]);
    // bordures des flancs (liseré sombre fin)
    ctx.strokeStyle = 'rgba(20,20,24,0.4)';
    ctx.lineWidth = 1;
    const qa = worldToScreen(cOutL[0], cOutL[1]), qb = worldToScreen(cInL[0], cInL[1]);
    const qc = worldToScreen(cOutR[0], cOutR[1]), qd = worldToScreen(cInR[0], cInR[1]);
    ctx.beginPath(); ctx.moveTo(qa.x, qa.y); ctx.lineTo(qb.x, qb.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(qc.x, qc.y); ctx.lineTo(qd.x, qd.y); ctx.stroke();
  };
  // ⚠ Le tablier PIXEL s'étend jusqu'aux routes d'atterrissage (drawSpan
  // prolonge ses bornes aux exits) : la rampe se cale sur ces bornes
  // ÉTENDUES, sinon elle coupe le tablier en biais (vu à la capture).
  for (const sp of spans) {
    if (!sp.exits || !sp.exits.length) continue;
    if (!sp.vertical) {
      const cy = (sp.gy0 + (sp.gy1 - sp.gy0 + 1) / 2) * T;
      const wd = ((sp.gy1 - sp.gy0 + 1) / 2) * T * 0.5;    // demi-largeur de CHAUSSÉE du tablier
      const xs = sp.exits.map((r) => r.gx);
      const ex0 = Math.min(sp.gx0, ...xs), ex1 = Math.max(sp.gx1, ...xs) + 1;
      if (ex0 < sp.gx0) {
        const xo = (ex0 - 0.4) * T, xi = (ex0 + 0.6) * T;
        drawApron([xo, cy], [xi, cy], [xo, cy - wr], [xo, cy + wr], [xi, cy - wd], [xi, cy + wd]);
      }
      if (ex1 > sp.gx1 + 1) {
        const xo = (ex1 + 0.4) * T, xi = (ex1 - 0.6) * T;
        drawApron([xo, cy], [xi, cy], [xo, cy - wr], [xo, cy + wr], [xi, cy - wd], [xi, cy + wd]);
      }
    } else {
      const cx = (sp.gx0 + (sp.gx1 - sp.gx0 + 1) / 2) * T;
      const wd = ((sp.gx1 - sp.gx0 + 1) / 2) * T * 0.5;
      const ys = sp.exits.map((r) => r.gy);
      const ey0 = Math.min(sp.gy0, ...ys), ey1 = Math.max(sp.gy1, ...ys) + 1;
      if (ey0 < sp.gy0) {
        const yo = (ey0 - 0.4) * T, yi = (ey0 + 0.6) * T;
        drawApron([cx, yo], [cx, yi], [cx - wr, yo], [cx + wr, yo], [cx - wd, yi], [cx + wd, yi]);
      }
      if (ey1 > sp.gy1 + 1) {
        const yo = (ey1 + 0.4) * T, yi = (ey1 - 0.6) * T;
        drawApron([cx, yo], [cx, yi], [cx - wr, yo], [cx + wr, yo], [cx - wd, yi], [cx + wd, yi]);
      }
    }
  }
  /* eslint-enable no-unreachable */
}

function drawIsoBridges(now) {
  const L = CM.layout;
  const cells = isoBridgeCells(L);
  if (!cells.length) return;
  const T = CM.TILE, ctx = CM.ctx;
  const bandA = (L.counts && L.counts.eraBand) | 0;
  // PONTS : retour au TABLIER PLAT PROJETÉ + rampes (décision Raph 2026-07-12 :
  // les sprites de pont complet, même normalisés en angle, gardent leur
  // PERSPECTIVE interne — re-tournés ils paraissent tordus ; « annule et remet
  // comme avant »). Les sprites bridge-full-* restent sur disque, débranchés.
  if (withLegacyToIso(ctx, () => drawPixelBridges(CM, now))) {
    drawBridgeAprons(ctx, bandA, T);
    return;
  }
  const band = (L.counts && L.counts.eraBand) | 0;
  const tone = bridgeTone(band);
  const isB = (x, y) => { const c = L.roadMap.get(x + ',' + y); return !!(c && c.roadSurface === 'bridge'); };
  const wD = 0.44, wR = 0.07;   // demi-largeur tablier / épaisseur garde-corps (fraction tuile)
  for (const b of cells) {
    const throughH = !!((b.mask & ROAD_E) && (b.mask & ROAD_W));
    const cx = (b.gx + 0.5) * T, cy = (b.gy + 0.5) * T;
    const v = 0.96 + ((cmHash('br:' + b.gx + ',' + b.gy) % 100) / 100) * 0.07;
    ctx.fillStyle = rgb(tone, v);
    if (throughH) {
      // voie jumelle au nord/sud → tablier étendu jusqu'à la couture, rail sauté.
      const twinN = isB(b.gx, b.gy - 1), twinS = isB(b.gx, b.gy + 1);
      const y0 = twinN ? b.gy * T : cy - T * wD, y1 = twinS ? (b.gy + 1) * T : cy + T * wD;
      fillWorldQuad(ctx, b.gx * T, y0, (b.gx + 1) * T, y1);
      ctx.fillStyle = rgb(tone, 0.55);
      if (!twinN) fillWorldQuad(ctx, b.gx * T, y0, (b.gx + 1) * T, y0 + T * wR);
      if (!twinS) fillWorldQuad(ctx, b.gx * T, y1 - T * wR, (b.gx + 1) * T, y1);
    } else {
      const twinW = isB(b.gx - 1, b.gy), twinE = isB(b.gx + 1, b.gy);
      const x0 = twinW ? b.gx * T : cx - T * wD, x1 = twinE ? (b.gx + 1) * T : cx + T * wD;
      fillWorldQuad(ctx, x0, b.gy * T, x1, (b.gy + 1) * T);
      ctx.fillStyle = rgb(tone, 0.55);
      if (!twinW) fillWorldQuad(ctx, x0, b.gy * T, x0 + T * wR, (b.gy + 1) * T);
      if (!twinE) fillWorldQuad(ctx, x1 - T * wR, b.gy * T, x1, (b.gy + 1) * T);
    }
  }
  drawBridgeAprons(ctx, band, T);
}

// ── Drawables triés au peintre (profondeur = wx + wy) ────────────────────────
function drawTreeIso(ctx, sx, sy, h) {
  // Sapin minimal Phase 1 : tronc + 2 étages de feuillage, ombre portée SE.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(sx + h * 0.16, sy, h * 0.30, h * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d4630';
  ctx.fillRect(sx - h * 0.045, sy - h * 0.22, h * 0.09, h * 0.22);
  ctx.fillStyle = '#3f5a35';
  ctx.beginPath(); ctx.moveTo(sx, sy - h); ctx.lineTo(sx + h * 0.34, sy - h * 0.36); ctx.lineTo(sx - h * 0.34, sy - h * 0.36); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a6a3e';
  ctx.beginPath(); ctx.moveTo(sx, sy - h * 0.72); ctx.lineTo(sx + h * 0.42, sy - h * 0.16); ctx.lineTo(sx - h * 0.42, sy - h * 0.16); ctx.closePath(); ctx.fill();
}

// ── Véhicule en iso (Phase 1.5) : corps sprite 4-dirs + attelage/pousseur ────
// Réutilise les briques legacy (ensureVeh, VEH_PULL/PUSH, bandes de marche) mais
// TOUTES les positions passent par la projection : offsets de file/attelage
// calculés en MONDE puis projetés. Drones exclus (tri aérien, plus tard) ;
// vues encore cardinales — les diagonales arrivent avec l'art Phase 4.
const VEH_DIRS = ['east', 'west', 'south', 'north'];
// Corrections d'orientation PAR TYPE (audit visuel des rotations d'objets PixelLab,
// planches .preview-shots/<type>-4views.png, bug vu par Raph « profil d'ouest en
// est ») : le générateur INVERSE les deux vues SUD sur certains objets (voiture,
// char, caravane, tram), et les BRANCARDS de la charrette sont son « avant » pour
// le générateur alors que NOUS la poussons (brancards à l'arrière). Tableau =
// fichier à afficher pour la dir MONDE 0..3 (E,O,S,N → écran SE,NO,SO,NE).
// wagon et barrow sont corrects tels quels (default).
const VEH_DIAG_MAP = {
  default: ['southeast', 'northwest', 'southwest', 'northeast'],
  car: ['southwest', 'northwest', 'southeast', 'northeast'],
  chariot: ['southwest', 'northwest', 'southeast', 'northeast'],
  // caravan : labels devenus VRAIS après la régénération d'animation (le modèle
  // v3 a « redressé » l'orientation, re-audit veh-audit2.png 2026-07-11) → map
  // par défaut. ⚠ RE-AUDITER après toute régénération : les labels bougent.
  tram: ['southwest', 'northwest', 'southeast', 'northeast'],
  cart: ['northwest', 'southwest', 'northeast', 'southeast'],
};
// Pas de roue (fraction de tuile parcourue par frame de bande diagonale) —
// molette __vehStride(0.09) pour caler la vitesse de rotation apparente.
const vehStrideT = { v: 0.09 };
if (typeof window !== 'undefined') window.__vehStride = (x) => { if (x > 0) vehStrideT.v = x; return vehStrideT.v; };

// Bête de trait (cheval/bœuf) en VUE DIAGONALE : bandes veh-{animal}-{diag}.png
// (objets 8-dir PixelLab animés « walking » 6 frames), frame par DISTANCE
// (v.rollDist, même odomètre que les roues). Renvoie false si les bandes ne
// sont pas prêtes → repli sur la bande cardinale legacy (drawNamedAgent).
const DRAFT_DIAG_MAP = { default: ['southeast', 'northwest', 'southwest', 'northeast'] };
function drawDraftIso(ctx, x, yFeet, z, animal, v) {
  const dchr = ensureVehDiag(animal);
  if (!vehDiagReady(dchr)) return false;
  const map = DRAFT_DIAG_MAP[animal] || DRAFT_DIAG_MAP.default;
  const img = dchr.img[map[v.dir]] || dchr.img[map[0]];
  if (!img || !(img.naturalWidth > 0)) return false;
  const fh = img.naturalHeight || 68;
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  const fr = nf > 1 ? Math.floor((v.rollDist || 0) / (CM.TILE * vehStrideT.v)) % nf : 0;
  const s = CM.TILE * z;
  const dh2 = s * 0.78, dw2 = dh2;   // ≈ bêtes legacy (scale 0.72-0.74), l'objet a du vide autour
  ctx.drawImage(img, fr * fh, 0, fh, fh, x - dw2 / 2, yFeet - dh2 * 0.82, dw2, dh2);
  return true;
}

function drawIsoVehicle(ctx, v, now, z) {
  const T = CM.TILE, s = T * z;
  const lo = vehicleLaneOffset(v, T);              // offset en px MONDE (s = TILE)
  const wx = v.x + lo.x, wy = v.y + lo.y;
  const p = worldToScreen(wx, wy);
  if (p.x < -s * 2 || p.y < -s * 2 || p.x > CM.cw + s * 2 || p.y > CM.ch + s * 2) return;
  if (v.type === 'basket') {                       // porteurs de panier (ères anciennes)
    drawNamedAgent(ctx, p.x, p.y, z, v.woman ? 'basket-woman' : 'basket-man', 0.85, v.dir, (v.pauseT || 0) <= 0, now, v.x * 0.02);
    return;
  }
  const size = VEH_SIZES[v.type];
  if (!size) return;                               // type sans sprite (broken_cart…) : rien en iso
  const dh = s * size, dw = dh;
  // VUE DIAGONALE si disponible (rotations d'objets PixelLab, direction-correcte,
  // multi-frames « rolling » quand la bande animée est livrée), sinon repli sur
  // la bande CARDINALE (animée mais orientée écran).
  let img = null, usedDiag = false;
  const dchr = ensureVehDiag(v.type);
  if (vehDiagReady(dchr)) {
    const map = VEH_DIAG_MAP[v.type] || VEH_DIAG_MAP.default;
    img = dchr.img[map[v.dir]] || dchr.img[map[0]];
    usedDiag = true;
  } else {
    const chr = ensureVeh(v.type);
    if (!vehReady(chr)) return;
    // Vues poussées : timon vers l'arrière (échange sud↔nord, comme le legacy).
    const sdir = VEH_PUSH[v.type] ? ['east', 'west', 'north', 'south'][v.dir] : VEH_DIRS[v.dir];
    img = chr.img[sdir] || chr.img.south;
  }
  const fh = img.naturalHeight || img.height || 64;
  const nf = Math.max(1, Math.round((img.naturalWidth || img.width || fh) / fh));
  // Diagonales : frame par DISTANCE parcourue (odomètre v.rollDist — anti-
  // patinage, molette __vehStride en fraction de tuile/frame). Cardinales :
  // cadence temporelle legacy inchangée.
  const fr = nf <= 1 ? 0
    : usedDiag ? Math.floor((v.rollDist || 0) / (T * vehStrideT.v)) % nf
      : Math.floor((now || 0) / 130 + v.x * 0.1) % nf;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const drawBody = () => {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + dh * 0.30, dw * 0.30, dh * 0.085, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(img, fr * fh, 0, fh, fh, p.x - dw / 2, p.y - dh / 2, dw, dh);
  };
  // Attelage : bête(s) de trait DEVANT dans le sens de marche (monde → projeté).
  const pull = VEH_PULL[v.type];
  let drawTeam = null, teamBelow = false;
  if (pull) {
    const D = (pull.dist || 0.44) * T;
    const front = [[D, 0], [-D, 0], [0, D], [0, -D]][v.dir] || [0, 0];
    const ap = worldToScreen(wx + front[0], wy + front[1]);
    teamBelow = ap.y > p.y;
    drawTeam = () => {
      ctx.strokeStyle = 'rgba(38,26,15,0.72)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + (ap.x - p.x) * 0.82, p.y + (ap.y - p.y) * 0.82);
      ctx.stroke();
      // Bête en VUE DIAGONALE (retour Raph : cheval de profil ouest→est) si les
      // bandes sont livrées, sinon bande cardinale legacy.
      if (!drawDraftIso(ctx, ap.x, ap.y + dh * 0.24, z, pull.animal, v)) {
        drawNamedAgent(ctx, ap.x, ap.y + dh * 0.24, z, pull.animal, pull.scale || 0.72, v.dir, true, now, v.x * 0.12);
      }
    };
  }
  // Pousseur : humain de l'ère DERRIÈRE (charrette/brouette).
  let drawPusher = null, pusherBelow = false;
  if (VEH_PUSH[v.type]) {
    const D = 0.34 * T;
    const back = [[-D, 0], [D, 0], [0, -D], [0, D]][v.dir] || [0, 0];
    const pp = worldToScreen(wx + back[0], wy + back[1]);
    pusherBelow = pp.y > p.y;
    drawPusher = () => {
      // Vue diagonale du pousseur (nouvelle DA) si dispo, sinon bande cardinale.
      if (!drawEraAgentIso(ctx, pp.x, pp.y + dh * 0.24, z, v.dir, true, now, v.x * 0.1, 0)) {
        drawEraAgent(ctx, pp.x, pp.y + dh * 0.24, z, v.dir, true, now, v.x * 0.1, 0);
      }
    };
  }
  // Ordre nord → sud (peintre local de la petite scène).
  if (drawTeam && !teamBelow) drawTeam();
  if (drawPusher && !pusherBelow) drawPusher();
  drawBody();
  if (drawTeam && teamBelow) drawTeam();
  if (drawPusher && pusherBelow) drawPusher();
  // Phares (voiture/tram, nuit, ère motorisée) : fonction PARTAGÉE re-projetée
  // (agents.js) — dessinés À LA PROFONDEUR du véhicule, dans son item peintre,
  // comme le legacy (sinon ils brilleraient par-dessus les murs).
  drawVehicleHeadlights(ctx, v);
  ctx.imageSmoothingEnabled = prev;
}

// ── Émeutier en ISO ──────────────────────────────────────────────────────────
// Même recette que le rendu legacy (sprite d'ère + arme bakée, halo de torche
// la nuit, repli silhouette vectorielle) mais positionné par worldToScreen et
// trié au PEINTRE — l'appelant pousse UN item 'riot' par émeutier, clé
// isoUnitDepth aux pieds, offsets de file compris. Vues encore CARDINALES :
// repli assumé du plan (« émeutiers : PLUS TARD ») tant que le batch des
// diagonales est en pause.
function drawIsoRioter(ctx, p, now, z) {
  const laneX = (p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0;
  const laneY = (p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0;
  const sp = worldToScreen(p.x + laneX, p.y + laneY);
  const wob = Math.sin(now / 170 + (p.phase || 0)) * 0.8;
  const sx = sp.x, groundY = sp.y + wob * z;
  if (sx < -24 || groundY < -24 || sx > CM.cw + 24 || groundY > CM.ch + 24) return;
  const ph = Math.max(1.5, 2.1 * z);
  const walking = p.pauseT <= 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(sx, groundY, ph * 0.85, ph * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  const rgen = ((p.charType || 0) === 1 ? 'woman' : 'man') + '-' + (p.weapon === 'fork' ? 'fork' : 'torch');
  const rEra = riotEraKey((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0);
  // BANDES DIAGONALES (DA « Figurine d'époque », batch riotIsoRoster) d'abord :
  // ère puis base médiévale ; repli CARDINAL legacy tant qu'une bande manque.
  // Anim par DISTANCE (p.walkDist, posé par updateCrisis) — anti-patinage.
  const wd = p.walkDist != null ? p.walkDist : null;
  let dim = drawNamedAgentIso(ctx, sx, groundY, z, 'rioter-' + rEra + rgen, 0.85, p.dir, walking, now, p.phase, 1, wd)
    || (rEra ? drawNamedAgentIso(ctx, sx, groundY, z, 'rioter-' + rgen, 0.85, p.dir, walking, now, p.phase, 1, wd) : false);
  if (!dim) dim = drawNamedAgent(ctx, sx, groundY, z, 'rioter-' + rEra + rgen, 0.85, p.dir, walking, now, p.phase);
  if (!dim && rEra) dim = drawNamedAgent(ctx, sx, groundY, z, 'rioter-' + rgen, 0.85, p.dir, walking, now, p.phase);
  if (dim) {
    // Flamme bakée ; halo chaud additif de NUIT sur les torches (cf. legacy).
    if (p.weapon !== 'fork' && (CM.nightF || 0) > 0.05) {
      const flick = 0.8 + 0.2 * Math.sin(now / 90 + (p.phase || 0) * 5);
      const gx2 = sx + dim.drawW * 0.18, gy2 = dim.top + dim.drawH * 0.16, gr = Math.max(1, dim.drawW * 0.5 * flick);
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(gx2, gy2, 0, gx2, gy2, gr);
      g2.addColorStop(0, `rgba(255,180,70,${(0.2 * (CM.nightF || 0) * flick).toFixed(2)})`);
      g2.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(gx2, gy2, gr, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = prevOp;
    }
    return;
  }
  // Repli vectoriel (sprites pas encore décodés) : silhouette du legacy dont le
  // centre de corps est recalé pour poser les pieds sur groundY.
  const syB = groundY - ph * 1.35;
  if (ph > 2 && walking) {
    const step = Math.sin(now / 110 + (p.phase || 0) * 3) * ph * 0.45;
    ctx.strokeStyle = '#241a10';
    ctx.lineWidth = Math.max(1, ph * 0.28);
    ctx.beginPath(); ctx.moveTo(sx - ph * 0.12, syB + ph * 0.35); ctx.lineTo(sx - ph * 0.15 + step * 0.5, syB + ph * 1.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + ph * 0.12, syB + ph * 0.35); ctx.lineTo(sx + ph * 0.15 - step * 0.5, syB + ph * 1.3); ctx.stroke();
  }
  ctx.fillStyle = p.col || '#9a4d38';
  ctx.beginPath();
  ctx.moveTo(sx - ph * 0.62, syB - ph * 0.45);
  ctx.quadraticCurveTo(sx - ph * 0.5, syB + ph * 0.65, sx - ph * 0.3, syB + ph * 0.62);
  ctx.lineTo(sx + ph * 0.3, syB + ph * 0.62);
  ctx.quadraticCurveTo(sx + ph * 0.5, syB + ph * 0.65, sx + ph * 0.62, syB - ph * 0.45);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(sx - ph * 0.5, syB - ph * 0.45, ph, Math.max(0.5, ph * 0.2));
  ctx.fillStyle = p.skin || '#e0b890';
  ctx.beginPath(); ctx.arc(sx, syB - ph * 0.85, ph * 0.5, 0, Math.PI * 2); ctx.fill();
  if (ph > 1.8) drawRiotWeapon(ctx, sx + ph * 0.55, syB - ph * 0.2, ph, p.weapon, now, p.phase, 0.5 + 0.5 * Math.sin(now / 320));
}

// ── SCÈNES MOTEUR legacy posées sur le losange (Phase 3-lite) ────────────────
// Expérience validée à la capture : les scènes de cityEngineSprites (props
// PixelLab transparents + personnages + détails procéduraux) se dessinent dans
// une BOÎTE (x, y, w, h) — on leur donne une boîte CARRÉE ancrée au coin sud du
// losange (même geste que drawPixelHouse). Le contenu carré déborde un peu des
// coins du lot en losange (accepté : la référence fait pareil) ; le sol dur sous
// les scènes est déjà coupé game-wide (DRAW_BUILDING_GROUND=false). Molette
// __isoEngineScenes(false) → retour aux socles ; une scène qui jette est mise en
// quarantaine (socle) pour la session, sans casser la frame.
const isoEngineScenesFlag = { on: true };
if (typeof window !== 'undefined') window.__isoEngineScenes = (on) => { isoEngineScenesFlag.on = on !== false; return isoEngineScenesFlag.on; };
const _isoSceneQuarantine = new Set();   // buildingIds dont la scène a jeté (repli socle)
function drawIsoEngineScene(ctx, t, anchor, spanX, spanY, T, z, hh, now) {
  const id = t.buildingId || t.variant || '?';
  if (_isoSceneQuarantine.has(id)) return false;
  // Scènes DE SOL (champs irrigués, aqueducs…) : elles PEIGNENT leur emprise en
  // repère carré → posées en boîte, elles font une dalle qui déborde du lot (vu à
  // la capture : irrigated_fields 10×6 par-dessus le fleuve). Elles retombent sur
  // le rendu d'emprise iso dédié (parcelle plate à sillons / bloc bas).
  if (/field|farm|crop|orchard|aqueduct/i.test(id)) return false;
  const bw = (spanX + spanY) * T * z * ISO_X * 0.72;
  const bx = anchor.x - bw / 2;
  const by = anchor.y - bw + hh * 0.5;   // bas de boîte ≈ coin sud du lot
  try {
    drawEngineSprite(t, bx, by, bw, bw, now);
    return true;
  } catch (e) {
    _isoSceneQuarantine.add(id);
    if (typeof console !== 'undefined') console.warn('[iso] scène moteur en quarantaine:', id, e);
    return false;
  }
}

// ── RIVERAINS (port fluvial / moulin à eau) posés sur le RUBAN (Phase 5) ─────
// Leur scène legacy suppose l'eau « en bas de la boîte » (repère carré) → posée
// en boîte iso, le bassin flottait à côté du ruban. Ici on DÉCOMPOSE : bâtiment
// (sprite transparent, JAMAIS de procédural — leçon carré brun) sur la berge,
// ponton/roue plongeant vers le SUD monde (garanti par layout : waterSide "S",
// bord sud du lot ≈ centre du fleuve), bateau de l'ère amarré SUR le ruban.
// ⚠ Bord d'eau calé sur le RUBAN (samples), pas le riverSet cellulaire : les
// deux divergent et c'est le ruban qu'on voit.
// Ruban AU DROIT d'une colonne x (cellules) : interpole y/hw entre les deux
// samples qui l'encadrent (le fleuve coule ~ouest→est, x ~monotone ; repli =
// sample le plus proche en x). Le sample « le plus proche du lot » ne suffit
// pas : dans un coude, son bord d'eau n'est pas celui du droit du lot (vu à la
// capture : ponton qui démarrait sur l'herbe).
function ribbonAtX(rv, x) {
  const sm = rv.samples;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < sm.length - 1; i += 1) {
    const a = sm[i], b = sm[i + 1];
    if ((a.x - x) * (b.x - x) <= 0 && Math.abs(b.x - a.x) > 1e-6) {
      const f = (x - a.x) / (b.x - a.x);
      return { y: a.y + (b.y - a.y) * f, hw: (a.hw || 2) + ((b.hw || 2) - (a.hw || 2)) * f, i };
    }
    const d = Math.abs(a.x - x);
    if (d < bd) { bd = d; bi = i; }
  }
  return { y: sm[bi].y, hw: sm[bi].hw || 2, i: bi };
}

// Pose un prop par le BAS DE SON CONTENU opaque : contenu large de cw px, haut
// de ch px, bas du contenu à (bx, by). Les PNG PixelLab embarquent souvent ~25 %
// de vide transparent sous les pieds (vu à la capture : moulin « flottant »
// 90 px au-dessus de sa boîte) → ancrer le PNG brut ment sur la position.
// Renvoie le rectangle ÉCRAN du contenu dessiné {x, y, w, h} (pour attacher des
// pièces au flanc : roue de moulin…). ch omis/null → hauteur à l'ASPECT NATUREL
// du contenu (imposer les deux déforme le sprite : l'aspect du contenu n'est pas
// celui du PNG).
function blitPropAnchored(ctx, name, bx, by, cw, ch) {
  const bb = propBBox(name);
  if (!bb) {
    const hh2 = ch || cw;
    blitProp(ctx, bx - cw / 2, by - hh2, cw, hh2, name, 0.5, 0.5, 1, 1);
    return { x: bx - cw / 2, y: by - hh2, w: cw, h: hh2 };
  }
  const cH = ch || cw * (bb.ch / Math.max(1, bb.cw));
  const boxW = cw / (bb.wf || 1), boxH = cH / (bb.hf || 1);
  const cxf = bb.x0f + bb.wf / 2, cbf = bb.y0f + bb.hf;
  blitProp(ctx, bx - boxW * cxf, by - boxH * cbf, boxW, boxH, name, 0.5, 0.5, 1, 1);
  return { x: bx - cw / 2, y: by - cH, w: cw, h: cH };
}

function drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, ei) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  const isMill = t.buildingId === 'water_mills';
  const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
  // Échelle : 1 « cellule legacy » → px iso (entre la cellule stricte T·z et la
  // pose des maisons ~1.56·T·z) ; jugée à la capture.
  const cpx = T * z * 1.3;
  const ccx = t.gx + spanX / 2;
  const rb = ribbonAtX(rv, ccx);
  const si = rb.i;
  const rhw = rb.hw;
  const yEdge = rb.y - rhw;              // rive NORD du ruban AU DROIT du lot
  // Tailles par ère : mêmes formules que la scène legacy (tout grandit ensemble).
  const vstage = band >= 7 ? 'cosmic' : ei >= 30 ? 'container' : ei >= 20 ? 'steam' : ei >= 10 ? 'sail' : 'raft';
  const sizeMul = vstage === 'cosmic' ? (band >= 9 ? 5.6 : band >= 8 ? 4.8 : 4.0)
    : vstage === 'container' ? 3.2 : vstage === 'steam' ? 2.4 : vstage === 'sail' ? 1.8 : 1.36;

  if (isMill) {
    // ── MOULIN : corps sur la berge + roue à aubes sur le flanc ouest, moitié
    //    basse dans l'eau, qui tourne (blitPropRot = pivot au centroïde opaque).
    const stageHouse = ['mill-prop-house', 'mill-house-stone', 'mill-house-industrial', 'mill-house-hydro'][stage];
    const ckM = 'mill-cosmic-' + band;
    const HOUSE = band >= 7 && propReady(ckM) ? ckM
      : propReady(stageHouse) ? stageHouse : (propReady('mill-prop-house') ? 'mill-prop-house' : null);
    if (!HOUSE) return;                  // sprites pas décodés : rien (pas de procédural)
    const twWc = band >= 7 ? Math.min(spanX * 0.94, 1.1 + sizeMul * 0.42) : [1.5, 1.7, 1.95, 2.2][stage];
    const W = twWc * cpx;
    // Base SUR le bord du ruban (le sprite embarque déjà son pied de berge).
    // Ancrage par le BAS DU CONTENU, hauteur à l'aspect naturel du sprite.
    const base = worldToScreen((ccx + 0.3) * T, (yEdge + 0.05) * T);
    const rect = blitPropAnchored(ctx, HOUSE, base.x, base.y, W);
    // ROUE : sprite iso DÉDIÉ animé (bande « turning » 6 frames, refonte
    // demandée par Raph — le skew d'un sprite de face faisait « bizarre »).
    // Stades : bois (0-1) → fonte (2) → turbine (3 et cosmique).
    const wheelKey = band >= 7 || stage === 3 ? 'turbine' : stage === 2 ? 'metal' : 'wood';
    const wArt = isoArt('mill-wheel-' + wheelKey);
    if (wArt.ready) {
      const im2 = wArt.img;
      const fh2 = im2.naturalHeight || 96;
      const nf2 = Math.max(1, Math.round((im2.naturalWidth || fh2) / fh2));
      const period = wheelKey === 'turbine' ? 90 : wheelKey === 'metal' ? 130 : 160;
      // Frames jouées À L'ENVERS : l'anim PixelLab tourne dans le mauvais sens
      // pour un courant ouest→est (retour Raph).
      const fr2 = nf2 > 1 ? (nf2 - 1) - (Math.floor((now || 0) / period) % nf2) : 0;
      const wpx2 = W * 0.66;
      const hubX = rect.x + wpx2 * 0.22, hubY = base.y - wpx2 * 0.30;
      const prevSm3 = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      // La turbine est bakée avec le plan penché À L'ENVERS des autres stades
      // (grand axe mesuré au PCA : bois +69°, fonte +74°, mais turbine −70°) :
      // elle apparaissait PERPENDICULAIRE au fleuve. Miroir horizontal SUR PLACE
      // (autour du moyeu) pour la rendre PARALLÈLE au fleuve comme bois/fonte.
      if (wheelKey === 'turbine') {
        ctx.save();
        ctx.translate(hubX, hubY);
        ctx.scale(-1, 1);
        ctx.drawImage(im2, fr2 * fh2, 0, fh2, fh2, -wpx2 / 2, -wpx2 / 2, wpx2, wpx2);
        ctx.restore();
      } else {
        ctx.drawImage(im2, fr2 * fh2, 0, fh2, fh2, hubX - wpx2 / 2, hubY - wpx2 / 2, wpx2, wpx2);
      }
      ctx.imageSmoothingEnabled = prevSm3;
      return;
    }
    const stageWheel = band >= 7 ? 'mill-turbine' : ['mill-prop-wheel', 'mill-prop-wheel', 'mill-wheel-metal', 'mill-turbine'][stage];
    const WHEEL = propReady(stageWheel) ? stageWheel : (propReady('mill-prop-wheel') ? 'mill-prop-wheel' : null);
    if (WHEEL) {
      // Roue projetée DANS LE PLAN DU MUR SUD (retour Raph : « sprite de face
      // ça ne va pas »). La face visible côté eau d'un bâtiment iso est le mur
      // SUD (le long de l'axe monde +x) : base écran e1=(+1, +ISO_Y)
      // (horizontale du mur, vers le coin sud) et e2=(0, +1) (verticale). Un
      // cercle dessiné sous cette transform devient l'ELLIPSE correcte, et
      // rotate() tourne DANS le plan du mur (rotation continue conservée).
      // Moyeu adossé au flanc, un peu au-dessus de la base → moitié basse à l'eau.
      const im = propImage(WHEEL);
      if (im && im.naturalWidth > 0) {
        const wpx2 = W * 0.6;
        const wbb = propBBox(WHEEL) || { x0f: 0, y0f: 0, wf: 1, hf: 1 };
        const boxW = wpx2 / (wbb.wf || 1), boxH = wpx2 / (wbb.hf || 1);
        const wAng = -(now || 0) / (stage === 3 || band >= 7 ? 320 : 900);
        const hubX = rect.x + wpx2 * 0.45;
        const hubY = base.y - wpx2 * 0.35;
        const prevSm2 = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.translate(hubX, hubY);
        ctx.transform(1, ISO_Y, 0, 1, 0, 0);
        ctx.rotate(wAng);
        ctx.drawImage(im, -boxW * (wbb.x0f + wbb.wf / 2), -boxH * (wbb.y0f + wbb.hf / 2), boxW, boxH);
        ctx.restore();
        ctx.imageSmoothingEnabled = prevSm2;
      }
    }
    return;
  }

  // ── PORT : ponton PERPENDICULAIRE au fleuve + corps de quai + bateau ────────
  const stageHouse = ['port-prop-house', 'port-house-medieval', 'port-house-industrial', 'port-house-modern'][stage];
  const ckP = 'port-cosmic-' + band;
  const HOUSE = band >= 7 && propReady(ckP) ? ckP
    : propReady(stageHouse) ? stageHouse : (propReady('port-prop-house') ? 'port-prop-house' : null);
  if (!HOUSE) return;
  // PONTON perpendiculaire à la TANGENTE LOCALE du ruban (retour Raph : « les
  // pontons longent le bord de l'eau au lieu d'avancer ») : tronçon ~plat
  // (fleuve O→E monde) → axe N-S monde (NE-SW écran) ; coude raide (|dy/dx|>1)
  // → axe E-W monde, plongeant du côté où l'eau vient (ouest si le fleuve fuit
  // au sud-est, est sinon). Molette : __pontoonAxis = 'auto'|'ns'|'ew'.
  const smR = rv.samples;
  const iA = Math.max(0, rb.i - 2), iB = Math.min(smR.length - 1, rb.i + 2);
  const mRiv = (smR[iB].y - smR[iA].y) / ((smR[iB].x - smR[iA].x) || 1e-6);
  const axisOv = (typeof window !== 'undefined' && window.__pontoonAxis) || 'auto';
  const ewAxis = axisOv === 'ew' || (axisOv !== 'ns' && Math.abs(mRiv) > 1);
  const ewSgn = mRiv > 0 ? -1 : 1;               // côté eau de l'axe E-W
  const dockW = stage === 0 ? 0.72 : Math.min(spanX * 0.5, 0.8 + sizeMul * 0.2);
  // Départ bien SOUS la plateforme du bâtiment (qui le recouvre) : à -0.35 il
  // restait un filet d'eau entre plateforme et ponton à la capture.
  const dockLen = 0.8 + Math.max(1.0, rhw * 0.6);
  const dockY0 = yEdge - 0.8, dockY1 = yEdge - 0.8 + dockLen;
  // Bande E-W : rangée au ras de l'eau au droit du lot — la pente locale fait
  // gagner de la profondeur au fil des cases (m>1 → chaque case avancée plonge
  // d'autant), la pointe finit en pleine eau.
  const dockYew = yEdge + 0.35;
  const dockX0 = ewSgn < 0 ? ccx + 0.8 - dockLen : ccx - 0.8;
  const dockX1 = dockX0 + dockLen;
  // PONTON EN VRAIE VUE ISO (retour Raph : « les pontons sont tout plats ») :
  // objet 8-dir sur pilotis. ⚠ axes MESURÉS au PCA (scratch axisAudit — la note
  // du roster était inversée) : bois ne/sw = NE-SW écran (N-S monde), bois
  // nw/se = NW-SE écran (E-W monde) ; pierre sw = N-S, pierre se = E-W ; béton
  // généré avec une flaque d'eau bakée → REBUT, la pierre sert aussi au 3+.
  // Repli : planches procédurales orientées pareil.
  const pontKey = stage >= 2 ? (ewAxis ? 'pontoon-pierre-se' : 'pontoon-pierre-sw')
    : (ewAxis ? 'pontoon-bois-nw' : 'pontoon-bois-ne');
  const pontArt = isoArt(pontKey);
  if (pontArt.ready) {
    const pd = ewAxis
      ? worldToScreen(((dockX0 + dockX1) / 2) * T, dockYew * T)
      : worldToScreen(ccx * T, ((dockY0 + dockY1) / 2) * T);
    const W3 = dockLen * T * z * 1.35;             // contenu diagonal ~74 % du canvas
    const prevDS = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pontArt.img, pd.x - W3 / 2, pd.y - W3 * 0.55, W3, W3);
    ctx.imageSmoothingEnabled = prevDS;
  } else {
    const deck = stage >= 3 ? [126, 128, 132] : stage === 2 ? [148, 140, 122] : [122, 88, 48];
    ctx.fillStyle = rgb(deck, 1);
    if (ewAxis) {
      fillWorldQuad(ctx, dockX0 * T, (dockYew - dockW / 2) * T, dockX1 * T, (dockYew + dockW / 2) * T);
      ctx.fillStyle = 'rgba(30,20,10,0.28)';
      for (let px = dockX0 + 0.3; px < dockX1 - 0.1; px += 0.34) {
        fillWorldQuad(ctx, px * T, (dockYew - dockW / 2 + 0.04) * T, (px + 0.06) * T, (dockYew + dockW / 2 - 0.04) * T);
      }
      ctx.fillStyle = 'rgba(15,20,25,0.30)';
      fillWorldQuad(ctx, (dockX0 + 0.2) * T, (dockYew + dockW / 2 - 0.07) * T, dockX1 * T, (dockYew + dockW / 2) * T);
    } else {
      fillWorldQuad(ctx, (ccx - dockW / 2) * T, dockY0 * T, (ccx + dockW / 2) * T, dockY1 * T);
      ctx.fillStyle = 'rgba(30,20,10,0.28)';
      for (let py = dockY0 + 0.3; py < dockY1 - 0.1; py += 0.34) {
        fillWorldQuad(ctx, (ccx - dockW / 2 + 0.04) * T, py * T, (ccx + dockW / 2 - 0.04) * T, (py + 0.06) * T);
      }
      ctx.fillStyle = 'rgba(15,20,25,0.30)';
      fillWorldQuad(ctx, (ccx + dockW / 2 - 0.07) * T, (dockY0 + 0.2) * T, (ccx + dockW / 2) * T, dockY1 * T);
    }
  }
  // CORPS de quai sur la berge (recouvre le raccord du ponton).
  const bWc = stage === 0 ? Math.min(1.6, spanX * 0.8) : Math.min(spanX * 1.05, 1.25 + sizeMul * 0.42);
  const W = bWc * cpx;
  // Base qui mord le bord du ruban : le corps de quai s'assoit SUR la rive, sa
  // frange basse (cale/vaguelettes bakées) touche l'eau et recouvre le départ du
  // ponton. Ancrage par le BAS DU CONTENU, hauteur à l'aspect naturel.
  const base = worldToScreen(ccx * T, (yEdge + 0.1) * T);
  blitPropAnchored(ctx, HOUSE, base.x, base.y, W);
  // BATEAU de l'ère amarré au bout du ponton, côté ouest, aligné à la tangente
  // projetée du ruban (même trait que drawIsoShips ; clapot, pas de sillage).
  if (BOAT_SIZES[vstage]) {
    const s = T * z;
    const o = rv.samples[Math.max(0, si - 1)], q = rv.samples[Math.min(rv.samples.length - 1, si + 1)];
    const a2 = worldToScreen(o.x * T, o.y * T), b2 = worldToScreen(q.x * T, q.y * T);
    const effSize = (BOAT_SIZES[vstage] || 0.7) * sizeMul;
    // Amarrage : flanc OUEST du ponton N-S (0.62 : demi-coque + jeu — à 0.4 la
    // poupe mordait les planches) ; flanc SUD près de la pointe pour l'axe E-W.
    const p = ewAxis
      ? worldToScreen(((ewSgn < 0 ? dockX0 : dockX1) - ewSgn * effSize * 0.3) * T, (dockYew + dockW / 2 + effSize * 0.45) * T)
      : worldToScreen((ccx - dockW / 2 - effSize * 0.62) * T, Math.min(rb.y - 0.15, dockY1 - effSize * 0.1) * T);
    const bob = Math.sin((now || 0) / 1400 + ccx) * s * 0.02;
    const heading = Math.atan2(b2.y - a2.y, b2.x - a2.x);
    const isoBoat = BOAT_ISO[vstage] ? isoArt('boat-' + vstage + '-' + boatSector(heading)) : null;
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(10,25,35,0.20)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + s * 0.06 * sizeMul, s * 0.24 * sizeMul, s * 0.08 * sizeMul, 0, 0, Math.PI * 2); ctx.fill();
    if (isoBoat && isoBoat.ready) {
      // Rotation iso au secteur du cap local du ruban (amarré parallèle au quai).
      const dw = s * (BOAT_SIZES[vstage] || 0.7) * sizeMul * 1.15;
      ctx.drawImage(isoBoat.img, p.x - dw / 2, p.y - dw * 0.58 + bob, dw, dw);
    } else {
      const boatKey = vstage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, band)) : vstage;
      const chr = ensureBoat(boatKey);
      if (chr && boatReady(chr)) {
        // Repli profil legacy, tilt amorti comme la flotte.
        const tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(b2.y - a2.y, Math.abs(b2.x - a2.x) || 1e-6) * 0.45));
        ctx.save();
        ctx.translate(p.x, p.y + bob);
        ctx.rotate(tilt);
        ctx.scale(sizeMul, sizeMul);
        const bimg = chr.img;
        const bfh = bimg.naturalHeight || bimg.height || 64;
        const bnf = Math.max(1, Math.round((bimg.naturalWidth || bimg.width || bfh) / bfh));
        const bf = bnf > 1 ? Math.floor((now || 0) / 260) % bnf : 0;
        const dw = s * BOAT_SIZES[vstage], dh = dw;
        ctx.drawImage(bimg, bf * bfh, 0, bfh, bfh, -dw / 2, -dh / 2 - dh * BOAT_LIFT, dw, dh);
        ctx.restore();
      }
    }
    ctx.imageSmoothingEnabled = prevSm;
  }
}

// ── CHAMP iso « façon TheoTown » : patchwork de parcelles cultivées ──────────
// Refonte du champ plat (retour Raph « améliore mes champs », réf TheoTown).
// L'emprise (losange) est PAVÉE de parcelles distinctes, séparées par des allées
// de terre : chacune tire une CULTURE (verts variés / blé doré / jachère brune)
// groupée en clusters 2×2 → parcelles voisines identiques (pas de damier bruité),
// puis porte des SILLONS iso-alignés (rangs diagonaux à l'écran) en corduroy —
// crête claire côté nord-ouest (lumière haut-gauche), vallée sombre côté sud-est.
// Palette + stades calqués sur la scène legacy (cityEngineSprites irrigated_fields)
// → DA cohérente ; 4 stades d'ère (rustique → hydroponie). 100 % espace-monde
// (parallélogrammes projetés) : aucune dépendance sprite, se pose même sur berge.
const FIELD_PAL = [
  { crop: [[74, 110, 42], [60, 94, 34], [90, 114, 50], [106, 122, 48]], ripe: [[154, 134, 54], [138, 122, 48]], fallow: [[106, 79, 44], [92, 69, 38]], fRoll: 4, rRoll: 2 },
  { crop: [[74, 124, 40], [60, 104, 32], [90, 138, 48], [111, 154, 56]], ripe: [[185, 162, 58], [200, 176, 72]], fallow: [[106, 79, 44]], fRoll: 2, rRoll: 3 },
  { crop: [[90, 138, 58], [74, 128, 48], [111, 154, 56], [127, 170, 66]], ripe: [[200, 176, 72], [212, 188, 82], [185, 162, 58]], fallow: [[106, 84, 48]], fRoll: 1, rRoll: 4 },
  { crop: [[63, 154, 85], [70, 168, 95], [82, 176, 106], [74, 168, 96]], ripe: [[127, 184, 74], [111, 176, 64]], fallow: [[58, 106, 82]], fRoll: 1, rRoll: 2 },
];
// Contraste des sillons par nature de parcelle : la jachère nue montre un fort
// corduroy labouré ; la culture verte, de fins rangs (plants) ; le blé mûr, des
// ondulations discrètes. liteW/darkW = largeur (fraction de période) de la crête
// éclairée puis de la vallée sombre ; sp = pas des rangs (tuiles).
const FIELD_FURROW = {
  fallow: { liteW: 0.34, lite: 1.16, darkW: 0.46, dark: 0.60, sp: 0.24 },
  crop: { liteW: 0.16, lite: 1.13, darkW: 0.30, dark: 0.80, sp: 0.26 },
  ripe: { liteW: 0.16, lite: 1.09, darkW: 0.20, dark: 0.86, sp: 0.30 },
};
function drawIsoField(ctx, t, spanX, spanY, band, eraIdx) {
  const T = CM.TILE, gx = t.gx, gy = t.gy;
  const stage = eraIdx < 10 ? 0 : eraIdx < 20 ? 1 : eraIdx < 30 ? 2 : 3;
  const PAL = FIELD_PAL[stage];
  const dirt = stage === 3 ? [98, 108, 116] : [118, 94, 60];   // béton clair / terre battue (allées)
  // Fond d'allées : losange d'emprise en terre — visible dans les marges entre parcelles.
  const q = (x0, y0, x1, y1) => fillWorldQuad(ctx, x0 * T, y0 * T, x1 * T, y1 * T);
  ctx.fillStyle = rgb(dirt, 0.92);
  q(gx, gy, gx + spanX, gy + spanY);
  // Grille de parcelles (~2 tuiles/parcelle, bornée pour le coût de rendu).
  const pcx = Math.max(1, Math.min(5, Math.round(spanX / 2)));
  const pcy = Math.max(1, Math.min(4, Math.round(spanY / 2)));
  const pwx = spanX / pcx, pwy = spanY / pcy;
  const marg = Math.min(0.11, pwx * 0.09, pwy * 0.09);         // allée de terre entre parcelles
  const fhash = (a, b) => ((Math.imul((a + 1) | 0, 73856093) ^ Math.imul((b + 1) | 0, 19349663) ^ Math.imul(stage + 1, 83492791)) >>> 0);
  for (let ri = 0; ri < pcy; ri++) {
    for (let ci = 0; ci < pcx; ci++) {
      const cl = fhash(ci >> 1, ri >> 1);         // cluster 2×2 → parcelles voisines identiques
      const cell = fhash(ci, ri);
      const roll = cl % 12;
      let base, kind;
      if (roll < PAL.fRoll) { base = PAL.fallow[cell % PAL.fallow.length]; kind = 'fallow'; }
      else if (roll < PAL.fRoll + PAL.rRoll) { base = PAL.ripe[(cell >> 2) % PAL.ripe.length]; kind = 'ripe'; }
      else { base = PAL.crop[(cell >> 2) % PAL.crop.length]; kind = 'crop'; }
      const jit = 0.93 + ((cell % 100) / 100) * 0.13;          // léger vibrato de teinte parcelle à parcelle
      const x0 = gx + ci * pwx + marg, x1 = gx + (ci + 1) * pwx - marg;
      const y0 = gy + ri * pwy + marg, y1 = gy + (ri + 1) * pwy - marg;
      ctx.fillStyle = rgb(base, jit);
      q(x0, y0, x1, y1);                                        // corps de parcelle
      // Sillons iso-alignés : sens (le long de X ou de Y) décidé par le cluster.
      const alongY = ((cl >> 4) & 1) === 1;                     // true → rangs à x constant
      const lo = alongY ? x0 : y0, hi = alongY ? x1 : y1;
      const fp = FIELD_FURROW[kind];
      const rows = Math.max(2, Math.round((hi - lo) / fp.sp));
      const period = (hi - lo) / rows;
      for (let k = 0; k < rows; k++) {
        const a = lo + k * period;                             // crête (NO, éclairée) puis vallée (SE, sombre)
        const lb = a + period * fp.liteW, db = Math.min(hi, lb + period * fp.darkW);
        if (alongY) {
          ctx.fillStyle = rgb(base, fp.lite); q(a, y0, lb, y1);
          ctx.fillStyle = rgb(base, fp.dark); q(lb, y0, db, y1);
        } else {
          ctx.fillStyle = rgb(base, fp.lite); q(x0, a, x1, lb);
          ctx.fillStyle = rgb(base, fp.dark); q(x0, lb, x1, db);
        }
      }
      // Relief de planche surélevée : liséré éclairé sur les 2 arêtes HAUTES (nord —
      // lumière haut-gauche) et ombre sur les 2 arêtes BASSES (sud) → chaque parcelle
      // se détache de l'allée et « bombe » légèrement.
      const lip = Math.min(0.05, (x1 - x0) * 0.12, (y1 - y0) * 0.12);
      ctx.fillStyle = rgb(base, 1.28); q(x0, y0, x1, y0 + lip); q(x0, y0, x0 + lip, y1);
      ctx.fillStyle = rgb(base, 0.52); q(x0, y1 - lip, x1, y1); q(x1 - lip, y0, x1, y1);
    }
  }
}

// ── PROFONDEUR DES UNITÉS (habitants / véhicules / émeutiers) ────────────────
// Le tri scalaire wx+wy du peintre suffit entre objets PONCTUELS, mais face à
// une emprise multi-tuiles (clé au COIN SUD, sprite large de 0.78·(sx+sy))
// il AVALE les unités qui longent les faces sud/est : leur somme est plus
// petite que la clé du bâtiment alors qu'elles sont DEVANT son mur (retour
// Raph « pas de cohérence de profondeur », 2026-07-13). Transposition iso des
// fiches frontByPainter du legacy (Phase 2 du plan : « baseY → baseDepth »),
// même recette que la clé précalculée des lampadaires (computeIsoLamps) mais
// appliquée en DYNAMIQUE, aux pieds de chaque unité :
//   - unité au SUD de la base (wy ≥ y1) ou à l'EST du bord (wx ≥ x1), colonne
//     du rect sprite recouverte → clé REMONTÉE juste au-dessus de celle du
//     bâtiment (elle passe devant le mur au lieu d'être mangée) ;
//   - unité DERRIÈRE (nord-ouest, colonne recouverte) → remontée PLAFONNÉE
//     sous la clé de cet occulteur (jamais posée sur son toit — même arbitrage
//     que la passe 1 du peintre legacy : l'occulteur gagne).
// Fiches par cellule (Map partagée par emprise) reconstruites au recompute ;
// empreintes À PLAT (champs, triées au coin nord — jamais occultantes) et
// AQUEDUCS (tranches par tuile, clippées à leur colonne) exclus.
// Molette : window.__isoUnitDepth(false) = retour au tri scalaire brut.
const isoUnitDepthFlag = { on: true };
if (typeof window !== 'undefined') window.__isoUnitDepth = (on) => { isoUnitDepthFlag.on = on !== false; return isoUnitDepthFlag.on; };
let _unitFiches = null, _unitFichesAt = '';
function isoUnitFiches() {
  const L = CM.layout;
  if (!L) return null;
  // Mémo re-clée aussi sur la RÉVÉLATION per-achat : une maison-moteur masquée
  // n'est pas dessinée → elle ne doit ni remonter ni plafonner une unité.
  const memoKey = CM.layoutRecomputeAt + ':' + (CM.engineHomeReveal || 0);
  if (_unitFiches && _unitFichesAt === memoKey) return _unitFiches;
  const T = CM.TILE;
  const m = new Map();
  for (const t of L.tiles) {
    const idf = t.buildingId || t.variant || '';
    if (/field|farm|crop|orchard|aqueduct/i.test(idf)) continue;   // à plat / tranché par tuile
    if (t.type === 'enginehome' && (t.revealIdx || 0) >= (CM.engineHomeReveal || 0)) continue; // pas encore achetée
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const x1 = (t.gx + sx) * T, y1 = (t.gy + sy) * T;
    const rec = {
      key: x1 + y1,                                  // clé peintre du bâtiment (coin sud)
      ax: x1 - y1,                                   // écran-X du coin sud (px monde)
      halfW: (sx + sy) * T * 0.39 + T * 0.45,        // demi-rect sprite (0.78/2) + demi-unité
      x1, y1,
    };
    for (let ay = 0; ay < sy; ay += 1) for (let ax2 = 0; ax2 < sx; ax2 += 1) m.set((t.gx + ax2) * 10000 + (t.gy + ay), rec);
  }
  _unitFiches = m; _unitFichesAt = memoKey;
  return m;
}
// Clé peintre d'une unité au sol dont les PIEDS (contact sol visuel) sont en (wx, wy).
export function isoUnitDepth(wx, wy) {
  const d = wx + wy;
  if (!isoUnitDepthFlag.on) return d;
  const F = isoUnitFiches();
  if (!F) return d;
  const T = CM.TILE, gx = Math.floor(wx / T), gy = Math.floor(wy / T);
  const sxScr = wx - wy;                             // colonne écran (px monde)
  let lift = d, cap = Infinity;
  // Voisinage cy−1..cy+2 (comme frontByPainter) : la rangée +2 porte les
  // occulteurs francs du sud dont la clé doit PLAFONNER la remontée. Une fiche
  // partagée revue par plusieurs cellules est re-testée telle quelle (max/min
  // idempotents — pas de dédup, 12 lectures par unité restent négligeables).
  for (let cy = gy - 1; cy <= gy + 2; cy += 1) {
    for (let cx = gx - 1; cx <= gx + 1; cx += 1) {
      const b = F.get(cx * 10000 + cy);
      if (!b) continue;
      if (Math.abs(sxScr - b.ax) > b.halfW) continue;   // pas de recouvrement de colonne
      if (d >= b.key) continue;                      // déjà dessinée après lui
      if (wy >= b.y1 - T * 0.02 || wx >= b.x1 - T * 0.02) {
        if (b.key + T * 0.02 > lift) lift = b.key + T * 0.02;   // devant : passe au-dessus du mur
      } else if (b.key - T * 0.02 < cap) {
        cap = b.key - T * 0.02;                      // derrière : jamais par-dessus son toit
      }
    }
  }
  const out = lift < cap ? lift : cap;
  return out > d ? out : d;
}

function drawIsoLive(now) {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const hw = T * z * ISO_X, hh = T * z * ISO_Y;
  const b = visibleCellBounds(hw * 2);
  const band = (L.counts && L.counts.eraBand) | 0;
  const eraIdx = (L.counts && L.counts.eraIndex) | 0;
  const items = [];
  // Bâtiments (tuiles du layout) : maisons = sprite existant ; le reste = socle.
  for (const t of L.tiles) {
    // Révélation per-achat (parité legacy drawTile) : une maison-moteur du pool
    // pré-placé pas encore achetée reste MASQUÉE → « 1 achat = 1 bâtiment qui
    // apparaît » vaut aussi en iso (la ville n'est plus en avance sur les achats).
    if (t.type === 'enginehome' && (t.revealIdx || 0) >= (CM.engineHomeReveal || 0)) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const idf = t.buildingId || t.variant || '';
    // AQUEDUC 3-SLICE DEBOUT : la structure (arcade/viaduc) remplace le canal
    // plat dès que les pièces sont décodées. Cull par RECOUVREMENT d'emprise
    // (l'origine d'une 10×1 sort vite de l'écran, la structure restait visible) ;
    // un item PAR TUILE de l'axe, profondeur au coin sud de SA cellule → le tri
    // peintre reste local (un sprite unique de 10 tuiles passerait devant les
    // arbres/piétons du bout opposé). Repli pièces manquantes = canal plat.
    if (/aqueduct/i.test(idf)) {
      if (t.gx + sx < b.gx0 || t.gx > b.gx1 || t.gy + sy < b.gy0 || t.gy > b.gy1) continue;
      const P = isoAqueductPieces(band, eraIdx);
      if (P) {
        for (let ai = 0; ai < sx; ai += 1) {
          items.push({ d: depthOf((t.gx + ai + 1) * T, (t.gy + sy) * T), kind: 'aqSlice', t, i: ai, n: sx, pieces: P });
        }
        continue;
      }
      items.push({ d: depthOf(t.gx * T, t.gy * T), kind: 'tile', t });
      continue;
    }
    if (t.gx < b.gx0 || t.gx > b.gx1 || t.gy < b.gy0 || t.gy > b.gy1) continue;
    // Empreintes À PLAT (champ) = SOL : elles ne se dressent pas → rien
    // ne doit passer DERRIÈRE elles. Profondeur au coin NORD (min wx+wy) et non au
    // coin sud : ainsi tout objet qui les chevauche (arbre/bâtiment/véhicule/piéton,
    // dont le pied a forcément une profondeur ≥ ce coin nord) se trie APRÈS → au-dessus.
    // Un socle (bâtiment volumétrique) garde son ancre au coin SUD (tri par les pieds).
    const flat = /field|farm|crop|orchard/i.test(idf);
    const d = flat ? depthOf(t.gx * T, t.gy * T) : depthOf((t.gx + sx) * T, (t.gy + sy) * T);
    items.push({ d, kind: 'tile', t });
  }
  // Arbres (décor) — assez près de la ville seulement (le bake du sol couvre le
  // reste). AÉRATION (retour Raph « tout est trop collé ») : pas d'arbre décoratif
  // à moins de 1.5 cellule de la place ni à moins de 1 cellule d'un terre-plein
  // (ils chevauchaient la fontaine et les haies).
  const pbT = isoPlazaBox(L);
  const segsT = L.terrePlein || [];
  const treeBlocked = (gx, gy) => {
    if (pbT && gx >= pbT.gx0 - 1.5 && gx <= pbT.gx1 + 1.5 && gy >= pbT.gy0 - 1.5 && gy <= pbT.gy1 + 1.5) return true;
    for (const sg of segsT) {
      if (sg.axis === 'v') {
        if (Math.abs(gx + 0.5 - (sg.x + 1)) < 1.0 && gy >= sg.y0 - 1 && gy <= sg.y1 + 1.5) return true;
      } else if (Math.abs(gy + 0.5 - (sg.y + 1)) < 1.0 && gx >= sg.x0 - 1 && gx <= sg.x1 + 1.5) return true;
    }
    return false;
  };
  for (const tr of (L.trees || [])) {
    if (tr.gx < b.gx0 || tr.gx > b.gx1 || tr.gy < b.gy0 || tr.gy > b.gy1) continue;
    if (treeBlocked(tr.gx, tr.gy)) continue;
    items.push({ d: depthOf((tr.gx + 0.5) * T, (tr.gy + 0.9) * T), kind: 'tree', tr });
  }
  // Forêt sauvage (ceinture autour de la ville, hors sol urbain) — cf. isoWildForest.
  // Culling aux bornes visibles ; le jitter (jx/jy) casse l'alignement sur la grille.
  for (const wt of isoWildForest(L, b)) {
    if (wt.gx < b.gx0 || wt.gx > b.gx1 || wt.gy < b.gy0 || wt.gy > b.gy1) continue;
    if (treeBlocked(wt.gx, wt.gy)) continue;
    items.push({ d: depthOf((wt.gx + 0.5 + wt.jx) * T, (wt.gy + 0.9 + wt.jy) * T), kind: 'tree', tr: wt });
  }
  // PLACE : scène complète de l'ère posée sur la dalle (profondeur au CENTRE :
  // les passants au sud de la fontaine passent devant, ceux au nord derrière).
  {
    const pb = isoPlazaBox(L);
    const pKey = plazaEraForBand(band);
    if (pb && pKey) {
      const pArt = isoArt('plaza-' + pKey);
      if (pArt.ready) {
        const cxw = ((pb.gx0 + pb.gx1 + 1) / 2) * T, cyw = ((pb.gy0 + pb.gy1 + 1) / 2) * T;
        items.push({
          d: depthOf(cxw, cyw), kind: 'plazaScene', wx: cxw, wy: cyw,
          px: pb.gx1 - pb.gx0 + 1, py: pb.gy1 - pb.gy0 + 1, art: pArt, eraKey: pKey,
        });
      }
    }
  }
  // MERVEILLES au TRI PEINTRE : profondeur = pied du monument (ancre drawWonder),
  // comme la scène de place — les badauds ATTROUPÉS au sud du socle passent
  // DEVANT, ceux au nord disparaissent derrière. Remplace l'ancien dessin « après
  // tout » (drawIsoWonders) qui recouvrait la foule du premier plan. La nuit
  // tombe APRÈS la passe vivante : l'éclairage des merveilles ne change pas.
  // Même comptabilité de naissance que le legacy (érection animée, sommeil).
  if (Array.isArray(state.wonders)) {
    const activeW = cmWonderActiveIds(state);
    const pvW = CM.previewWonder;   // aperçu dev (__showWonder) : force le rendu
    for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
      const w = CM_WONDERS[wi];
      if (activeW.has(w.id) || (pvW && pvW.id === w.id)) {
        if (!CM.born['wonder:' + w.id]) CM.born['wonder:' + w.id] = now;
        const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
        items.push({ d: depthOf((slot.gx + 0.5) * T, (slot.gy + 1) * T), kind: 'wonder', w, wi });
      } else if (CM.born['wonder:' + w.id]) {
        delete CM.born['wonder:' + w.id];
      }
    }
  }
  // LAMPADAIRES : mâts de l'ère le long des routes (liste déterministe
  // isoLamps), posés au peintre ; leurs halos de nuit se dessinent dans
  // drawIsoNight à la MÊME position (points lumineux ancrés, retour Raph).
  if (!CM.lodActive) {
    const lampArt = isoArt('lamp-' + lampEraForBand(band) + '?v=' + LAMP_V);
    if (lampArt.ready) {
      for (const lp of isoLamps(L, band)) {
        if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
        // lp.d = clé précalculée (computeIsoLamps) : pied wx+wy, REMONTÉE devant le
        // bâtiment mitoyen quand le mât longe sa façade sud/est (sinon avalé).
        items.push({ d: lp.d, kind: 'lamp', wx: lp.wx, wy: lp.wy, art: lampArt });
      }
    }
  }
  // TERRE-PLEIN RICHE : UNE bande CONTINUE par segment (kind 'medianRun'), rendue
  // en 3-SLICE cap/milieu/cap (cf. rendu) — largeur route, vraie longueur, plus
  // d'empilement. 3 pièces par orientation : median-{se,sw}-{start,mid,end}.
  // Repli buissons épars tant que les pièces ne sont pas décodées.
  if (!CM.lodActive) {
    // UNE seule paire de pièces (SE, jugée « nettement plus jolie » par Raph)
    // sert aux DEUX orientations : le rendu pivote pour rester « dessus en haut »
    // (flip d'angle θ-180 sur l'axe vertical) — plus de médian à l'envers.
    const seP = { s: isoArt('median-se-start'), m: isoArt('median-se-mid'), e: isoArt('median-se-end') };
    const seReady = seP.s.ready && seP.m.ready && seP.e.ready;
    for (const sg of (L.terrePlein || [])) {
      if (sg.axis === 'v') {
        if (sg.x + 1 < b.gx0 - 1 || sg.x + 1 > b.gx1 + 1) continue;
        if (sg.y1 < b.gy0 - 2 || sg.y0 > b.gy1 + 2) continue;
        const wx = (sg.x + 1) * T;
        if (seReady) {
          // APLAT AU SOL : profondeur au coin NORD du segment (− marge : ext,
          // demi-largeur, relief) et non au centre — sinon la bande se dessinait
          // PAR-DESSUS piétons/attelages de la moitié nord (même geste que 'field').
          items.push({ d: depthOf(wx, sg.y0 * T) - T * 1.2, kind: 'medianRun', axis: 'v', wx, y0: sg.y0, y1: sg.y1, pieces: seP });
        } else {
          for (let y = sg.y0 + 0.55; y < sg.y1 + 1; y += 1.15) {
            const jj = ((cmHash('tp:' + sg.x + ':' + Math.round(y * 10)) % 100) / 100);
            items.push({ d: depthOf(wx, (y + 0.06) * T), kind: 'bush', wx, wy: (y + 0.06) * T, r: 0.24 + jj * 0.1, v: 1 + (cmHash('tv:' + sg.x + ':' + Math.round(y * 10)) % 2) });
          }
        }
      } else {
        if (sg.y + 1 < b.gy0 - 1 || sg.y + 1 > b.gy1 + 1) continue;
        if (sg.x1 < b.gx0 - 2 || sg.x0 > b.gx1 + 2) continue;
        const wy = (sg.y + 1) * T;
        if (seReady) {
          // APLAT AU SOL : coin NORD (cf. axe v).
          items.push({ d: depthOf(sg.x0 * T, wy) - T * 1.2, kind: 'medianRun', axis: 'h', wy, x0: sg.x0, x1: sg.x1, pieces: seP });
        } else {
          for (let x = sg.x0 + 0.55; x < sg.x1 + 1; x += 1.15) {
            const jj = ((cmHash('tp:' + Math.round(x * 10) + ':' + sg.y) % 100) / 100);
            items.push({ d: depthOf((x + 0.06) * T, wy), kind: 'bush', wx: (x + 0.06) * T, wy, r: 0.24 + jj * 0.1, v: 1 + (cmHash('tv:' + Math.round(x * 10) + ':' + sg.y) % 2) });
          }
        }
      }
    }
  }
  // Habitants : clé aux PIEDS, remontée devant les murs mitoyens (isoUnitDepth).
  if (!CM.lodActive) {
    for (const p of CM.citizens) {
      if (p._nightHidden) continue;
      items.push({ d: isoUnitDepth(p.x + (p.lox || 0), p.y + (p.loy || 0)), kind: 'cit', p });
    }
    // Véhicules : mêmes règles (drones = passe aérienne, plus tard). La
    // carrosserie est dessinée CENTRÉE sur l'ancre (drawIsoVehicle) : son
    // contact sol VISUEL tombe ~0.30·hauteur plus bas à l'écran → le point de
    // TRI est déplacé à ce contact (+h monde sur chaque axe = +0.60·taille·T
    // de profondeur), sinon un piéton derrière la carrosserie se dessinait
    // par-dessus (z-fight sur ~0.4 tuile, ~0.8 pour le tram).
    for (const v of CM.vehicles) {
      if (v.type === 'drone') continue;
      const lo = vehicleLaneOffset(v, T);
      const h = T * 0.30 * (VEH_SIZES[v.type] || 0);
      items.push({ d: isoUnitDepth(v.x + lo.x + h, v.y + lo.y + h), kind: 'veh', v });
    }
  }
  // ÉMEUTE : émeutiers dans le TRI PEINTRE (clé pieds + offsets de file, comme
  // les habitants) — poussés MÊME au LOD (le signal de crise doit rester
  // visible, parité legacy). La sim tourne dans drawIsoWorld (updateCrisis).
  if (CM.riotDraw) {
    for (const p of CM.riotDraw.pts) {
      const laneX = (p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0;
      const laneY = (p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0;
      items.push({ d: isoUnitDepth(p.x + laneX, p.y + laneY), kind: 'riot', p });
    }
  }
  items.sort((a, bb) => a.d - bb.d);
  // HALO d'émeute : nappe rouge pulsée AU SOL, sous toute la scène vivante (le
  // cercle écran du legacy devient une ellipse iso 2:1). Mêmes rayon et alphas.
  if (CM.riotDraw) {
    const c = worldToScreen(CM.riotDraw.cx, CM.riotDraw.cy);
    const pulse = 0.5 + 0.5 * Math.sin(now / 320);
    const R = Math.max(1, (1.6 + (state.instability || 0) * 1.4) * T * z);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, 0.5);                               // disque couché au sol (losange 2:1)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(200,40,30,${(0.16 + 0.12 * pulse).toFixed(2)})`);
    g.addColorStop(1, 'rgba(200,40,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const prevSmooth = ctx.imageSmoothingEnabled;
  for (const it of items) {
    if (it.kind === 'tile') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      // Ancre = coin SUD de l'empreinte (point monde (gx+spanX, gy+spanY)).
      const anchor = worldToScreen((t.gx + spanX) * T, (t.gy + spanY) * T);
      const isHouse = t.type === 'house' || t.type === 'enginehome';
      // Bâtiment RIVERAIN (port/moulin : l'empreinte mord la berge/l'eau) :
      // scène iso DÉDIÉE (drawIsoRiverside — bâtiment sur berge, ponton/roue vers
      // le ruban, bateau amarré). Ni scène-boîte legacy ni socle : la boîte
      // legacy embarque son eau en repère carré (bassin flottant, vu à la capture).
      // CHAMPS et AQUEDUCS ont un rendu À PLAT dédié (parcelle / canal, plus bas)
      // et DOIVENT s'afficher même si leur emprise mord la berge — l'aqueduc s'y
      // pose EXPRÈS (prise d'eau au bord) : les exclure du cull « mouillé », sinon
      // ils disparaissaient (branchement iso oublié). Seuls les moteurs « en bloc »
      // sont culés au-dessus de l'eau (le port/moulin part en scène riveraine).
      const idFlat = t.buildingId || t.variant || '';
      const isFlatFootprint = /field|farm|crop|orchard|aqueduct/i.test(idFlat);
      if (t.type === 'engine' && !isFlatFootprint) {
        const rc = (L.river && L.river.present && L.river.cells) || null;
        if (rc) {
          let wet = false;
          for (let ax = 0; ax < spanX && !wet; ax += 1) for (let ay = 0; ay < spanY && !wet; ay += 1) {
            if (rc.has((t.gx + ax) + ',' + (t.gy + ay)) || (L.river.banks && L.river.banks.has((t.gx + ax) + ',' + (t.gy + ay)))) wet = true;
          }
          if (wet) {
            if ((t.buildingId === 'river_ports' || t.buildingId === 'water_mills') && isoEngineScenesFlag.on) {
              drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, eraIdx);
            }
            continue;
          }
        }
      }
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;  // largeur allouée au sprite (~78 % du losange)
      if (isHouse && pixelHouseReady(t)) {
        const hpx = wpx;                                    // seul y+h compte (ancre pieds)
        drawPixelHouse(t, anchor.x - wpx / 2, anchor.y - hpx - hh * 0.5, wpx, hpx);
      } else if (t.type === 'engine' && isoEngineScenesFlag.on && drawIsoEngineScene(ctx, t, anchor, spanX, spanY, T, z, hh, now)) {
        // Scène moteur legacy posée sur le losange (Phase 3-lite) — cf. helper.
      } else {
        const id2 = t.buildingId || t.variant || '';
        const n = worldToScreen(t.gx * T, t.gy * T);
        const e = { x: n.x + spanX * hw, y: n.y + spanX * hh };
        const s = { x: n.x + (spanX - spanY) * hw, y: n.y + (spanX + spanY) * hh };
        const w = { x: n.x - spanY * hw, y: n.y + spanY * hh };
        if (/field|farm|crop|orchard/i.test(id2)) {
          // CHAMPS : patchwork de parcelles cultivées façon TheoTown (cf. drawIsoField) —
          // la scène legacy (peinture carrée du sol) ne se pose pas sur le losange.
          drawIsoField(ctx, t, spanX, spanY, band, eraIdx);
          continue;
        }
        if (/aqueduct/i.test(id2)) {
          // AQUEDUC — REPLI canal plat (pièces 3-slice pas encore décodées) : un
          // canal étroit le long de l'axe long de l'emprise. Le rendu nominal =
          // kind 'aqSlice' (arcade/viaduc debout), poussé par la boucle des items.
          const horizA = spanX >= spanY;
          const ax0 = t.gx * T, ay0 = t.gy * T;
          const cxA = (t.gx + spanX / 2) * T, cyA = (t.gy + spanY / 2) * T;
          ctx.fillStyle = rgb([168, 162, 140], 1);
          if (horizA) fillWorldQuad(ctx, ax0, cyA - T * 0.22, ax0 + spanX * T, cyA + T * 0.22);
          else fillWorldQuad(ctx, cxA - T * 0.22, ay0, cxA + T * 0.22, ay0 + spanY * T);
          ctx.fillStyle = rgb([96, 118, 128], 1);   // filet d'eau au centre
          if (horizA) fillWorldQuad(ctx, ax0 + T * 0.1, cyA - T * 0.09, ax0 + spanX * T - T * 0.1, cyA + T * 0.09);
          else fillWorldQuad(ctx, cxA - T * 0.09, ay0 + T * 0.1, cxA + T * 0.09, ay0 + spanY * T - T * 0.1);
          continue;
        }
        // Socle : BLOC iso extrudé (empreinte + 2 murs + toit plat) — repli des
        // scènes en quarantaine / molette __isoEngineScenes(false).
        const c = t.type === 'engine' ? [172, 152, 112] : [150, 142, 120];
        const v = 0.96 + ((cmHash(t.gx + ':' + t.gy) % 100) / 100) * 0.08;
        // Extrusion discrète, plafonnée : les grandes empreintes moteur ne doivent pas
        // écraser les habitations au jalon (leurs scènes arrivent en Phase 3).
        const hgt = hh * 1.1;
        // mur ouest (ombré) puis mur est (plus sombre — lumière haut-gauche), puis toit.
        ctx.fillStyle = rgb(c, 0.78 * v);
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(c, 0.6 * v);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(c, v);
        ctx.beginPath(); ctx.moveTo(n.x, n.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
      }
    } else if (it.kind === 'tree') {
      // ARBRES PIXEL (retour Raph : les sapins-triangles « pas faits
      // correctement du tout ») : sprite PixelLab /pixelart/iso/tree-N.png,
      // variante stable par hash de cellule ; repli = triangle procédural.
      const tr = it.tr;
      const p = worldToScreen((tr.gx + 0.5 + (tr.jx || 0)) * T, (tr.gy + 0.9 + (tr.jy || 0)) * T);
      const tv = 1 + (cmHash('tree:' + tr.gx + ':' + tr.gy) % ISO_TREE_VARIANTS);
      const tArt = isoArt('tree-' + tv);
      if (tArt.ready) {
        const hpx = T * z * (tr.r || 0.7) * 2.7;
        const prevTS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tArt.img, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
        ctx.imageSmoothingEnabled = prevTS;
      } else {
        drawTreeIso(ctx, p.x, p.y, T * z * (tr.r || 0.7) * 1.3);
      }
    } else if (it.kind === 'plazaScene') {
      // Losange de CONTENU mesuré calé pile sur l'emprise de la dalle (le
      // canvas brut décalait la scène — retour Raph).
      const p = worldToScreen(it.wx, it.wy);
      const g = drawIsoGroundedArt(ctx, it.art, p.x, p.y, (it.px + it.py) * T * z * ISO_X * 0.98);
      // EAU DE LA FONTAINE : frame courante du strip re-projetée sur la scène
      // (rect source → géométrie du draw) ; hors eau le strip est identique à
      // la scène (pixels verrouillés) donc l'overlay est invisible à l'arrêt.
      const fa = FOUNTAIN_ANIM[it.eraKey];
      if (fa && FOUNTAIN_TUNE.on && g) {
        const fArt = isoArt('anim/plaza-fountain-' + it.eraKey + '?v=' + FA_V);
        if (fArt.ready) {
          const iw = it.art.img.naturalWidth || 1, ih = it.art.img.naturalHeight || 1;
          const nf = Math.max(1, Math.round((fArt.img.naturalWidth || fa.w) / fa.w));
          const f = Math.floor((now || 0) / FOUNTAIN_TUNE.ms) % nf;
          const prevFS = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(fArt.img, f * fa.w, 0, fa.w, fa.h,
            g.x + fa.x * (g.w / iw), g.y + fa.y * (g.h / ih), fa.w * (g.w / iw), fa.h * (g.h / ih));
          ctx.imageSmoothingEnabled = prevFS;
        }
      }
    } else if (it.kind === 'wonder') {
      // MERVEILLE au tri peintre : drawWonder gère ancre/cull/érection lui-même.
      drawWonder(it.w, it.wi, now);
    } else if (it.kind === 'medianRun') {
      // Bande de terre-plein CONTINUE en 3-SLICE (retour Raph : répéter le sprite
      // ENTIER empilait ses bouts + son arbre). start (cap) → mid (période) ×N →
      // end (cap), posés dans un repère PIVOTÉ sur la couture (angle iso réel de
      // A→B) : le mid tuile sans empilement, largeur = chaussée, longueur de bout
      // en bout. Anti-couture/anti-trou : un nombre ENTIER de mids remplit pile
      // la travée, chacun très légèrement étiré (< 1 période, invisible).
      const P = it.pieces;
      const ext = MEDIAN_TUNE.ext * T;           // prolonge les bouts vers les carrefours (monde)
      let A, B;
      if (it.axis === 'h') { A = worldToScreen(it.x0 * T - ext, it.wy); B = worldToScreen((it.x1 + 1) * T + ext, it.wy); }
      else { A = worldToScreen(it.wx, it.y0 * T - ext); B = worldToScreen(it.wx, (it.y1 + 1) * T + ext); }
      // Garder le DESSUS EN HAUT : si la couture « pointe vers la gauche »
      // (|θ| > 90°, cas de l'axe vertical → bas-gauche), on inverse les deux bouts
      // pour ramener l'angle dans (−90°, 90°] — petite rotation, plus de médian
      // à l'envers, éclairage haut-gauche conservé.
      if (Math.abs(Math.atan2(B.y - A.y, B.x - A.x)) > Math.PI / 2) { const tmp = A; A = B; B = tmp; }
      const Lpx = Math.hypot(B.x - A.x, B.y - A.y);
      const th = Math.atan2(B.y - A.y, B.x - A.x);
      const roadW = T * z * 0.62;               // largeur ≈ chaussée
      const ph = P.s.img.naturalHeight || 1;
      const sc = roadW / ph;
      const wS = (P.s.img.naturalWidth || 1) * sc;
      const wM = (P.m.img.naturalWidth || 1) * sc;
      const wE = (P.e.img.naturalWidth || 1) * sc;
      const lift = roadW * MEDIAN_TUNE.lift;     // léger : la bande reste À CHEVAL sur la couture
      const prevMS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.translate(A.x, A.y);
      ctx.rotate(th);
      ctx.beginPath();
      ctx.rect(-1, -roadW * 3, Lpx + 2, roadW * 6);   // borne la LONGUEUR (bouts nets), large en hauteur pour le relief
      ctx.clip();
      const put = (art, x, w) => ctx.drawImage(art.img, x, -(art.img.naturalHeight || 1) * sc / 2 - lift, w, (art.img.naturalHeight || 1) * sc);
      if (Lpx <= wS + wE) {
        // Filet segments minuscules (caps retaillés ≈ 2×roadW : un run ≥ 3 tuiles
        // n'entre plus ici) : caps compressés au prorata, JAMAIS superposés —
        // l'ancien end posé PAR-DESSUS le start plantait sa coupe brute en plein
        // bout de bande (buisson tranché, sans liseré).
        const k = Lpx / (wS + wE);
        put(P.s, 0, wS * k);
        put(P.e, wS * k, wE * k);
      } else {
        put(P.s, 0, wS);
        const midSpan = Lpx - wS - wE;
        const nMid = Math.max(1, Math.round(midSpan / wM));
        const step = midSpan / nMid;             // remplit PILE : chaque mid étiré à `step` (< 1 période d'écart)
        for (let i = 0; i < nMid; i += 1) put(P.m, wS + i * step, step + 0.6);
        put(P.e, Lpx - wE, wE);
      }
      ctx.restore();
      ctx.imageSmoothingEnabled = prevMS;
    } else if (it.kind === 'aqSlice') {
      // AQUEDUC 3-SLICE debout (bande CONTINUE start → mid ×N étirés → end,
      // nombre entier de mids = remplit PILE) posée par CISAILLEMENT sur l'axe
      // long de l'emprise (toujours X : pose horizontale sanctuarisée dans
      // layout.js). PAS une rotation : x local suit l'axe iso (ux, uy) mais y
      // local RESTE vertical écran — les piles/arches du sprite (cisaillé à plat
      // par sliceAqueductIso, verticales préservées) restent DEBOUT. La rotation
      // couchait piles et arches (« à l'envers », retour Raph) et sa pente
      // approximative faisait onduler la ligne d'eau (« pas droit »).
      // CETTE tranche ne peint que SA tuile (clip [x0,x1] dans le repère local) :
      // le peintre trie chaque tuile par son coin sud, cf. la boucle des items.
      // Échelle par la HAUTEUR d'ère (P.h en tuiles), la période suit l'aspect.
      // Molette live : window.__aqIso = { k: ×hauteur, base: fraction du sprite
      // au-dessus de la ligne d'axe (pieds ~0.86, le reste = ombre portée) }.
      const t2 = it.t, P = it.pieces;
      const spanA = t2.spanX || t2.size || 1;
      const cyA = (t2.gy + 0.5) * T;
      const A = worldToScreen(t2.gx * T, cyA), B = worldToScreen((t2.gx + spanA) * T, cyA);
      const Lpx = Math.hypot(B.x - A.x, B.y - A.y);
      const cfgA = (typeof window !== 'undefined' && window.__aqIso) || {};
      const hM = P.m.img.naturalHeight || 1;
      const sc = T * z * P.h * (cfgA.k || 1) / hM;
      const base = cfgA.base != null ? cfgA.base : 0.86;
      const wS = (P.s.img.naturalWidth || 1) * sc;
      const wMd = (P.m.img.naturalWidth || 1) * sc;
      const wE = (P.e.img.naturalWidth || 1) * sc;
      const x0 = Lpx * it.i / it.n, x1 = Lpx * (it.i + 1) / it.n;
      const prevAS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.transform((B.x - A.x) / Lpx, (B.y - A.y) / Lpx, 0, 1, A.x, A.y);
      ctx.beginPath();
      ctx.rect(x0, -hM * sc * 1.3, x1 - x0, hM * sc * 1.9);
      ctx.clip();
      const putA = (art, x, w) => { const h = (art.img.naturalHeight || 1) * sc; ctx.drawImage(art.img, x, -h * base, w, h); };
      if (Lpx <= wS + wE) {
        putA(P.s, 0, wS);
        putA(P.e, Lpx - wE, wE);
      } else {
        if (wS > x0) putA(P.s, 0, wS);
        const midSpan = Lpx - wS - wE;
        const nMid = Math.max(1, Math.round(midSpan / wMd));
        const step = midSpan / nMid;
        for (let mi = 0; mi < nMid; mi += 1) {
          const mx = wS + mi * step;
          if (mx > x1 || mx + step + 0.6 < x0) continue;
          putA(P.m, mx, step + 0.6);
        }
        if (Lpx - wE < x1) putA(P.e, Lpx - wE, wE);
      }
      ctx.restore();
      ctx.imageSmoothingEnabled = prevAS;
    } else if (it.kind === 'lamp') {
      const p = worldToScreen(it.wx, it.wy);
      const m = lampFootMetrics(it.art) || { footXf: 0.5, footYf: 0.97, usedHf: 0.92 };
      // hauteur cible = CONTENU visible (LAMP_TUNE.h tuiles), pas le canvas.
      const hpx = T * z * LAMP_TUNE.h / (m.usedHf || 1);
      // Largeur au RATIO du PNG (les v3 sont 64×128 : un blit carré les étirerait ×2).
      const wpx = hpx * ((it.art.img.naturalWidth || 1) / (it.art.img.naturalHeight || 1));
      const prevLS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(it.art.img, p.x - wpx * m.footXf, p.y - hpx * m.footYf, wpx, hpx);
      ctx.imageSmoothingEnabled = prevLS;
    } else if (it.kind === 'bush') {
      // Buisson de terre-plein : feuillu réutilisé petit, pied sur la couture.
      const p = worldToScreen(it.wx, it.wy);
      const bArt = isoArt('tree-' + it.v);
      if (bArt.ready) {
        const hpx = T * z * it.r * 2.7;
        const prevBS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bArt.img, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
        ctx.imageSmoothingEnabled = prevBS;
      }
    } else if (it.kind === 'veh') {
      drawIsoVehicle(ctx, it.v, now, z);
    } else if (it.kind === 'riot') {
      drawIsoRioter(ctx, it.p, now, z);
    } else {
      const p = it.p;
      const sp = worldToScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
      const walking = (p.pauseT || 0) <= 0;
      // Vue DIAGONALE (Phase 4) si la bande existe, sinon bande cardinale.
      // p.walkDist = odomètre → animation par DISTANCE (anti-patinage).
      if (!drawEraAgentIso(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0, 1, p.walkDist != null ? p.walkDist : null)) {
        drawEraAgent(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0);
      }
    }
  }
  ctx.imageSmoothingEnabled = prevSmooth;
  // Anneaux d'apaisement (clic sur un émeutier) : anneaux AU SOL projetés en
  // ellipse iso — mêmes minuterie et teinte que le legacy (drawCrisis).
  if (CM.calmPoofs && CM.calmPoofs.length) {
    for (let i = CM.calmPoofs.length - 1; i >= 0; i -= 1) {
      const e = CM.calmPoofs[i];
      const k = (now - e.t) / 700;
      if (k >= 1) { CM.calmPoofs.splice(i, 1); continue; }
      const c = worldToScreen(e.x, e.y);
      const r = (4 + k * 14) * Math.max(0.6, z);
      ctx.strokeStyle = `rgba(150,230,170,${(0.8 * (1 - k)).toFixed(2)})`;
      ctx.lineWidth = Math.max(1, 2 * z * (1 - k));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(1, 0.5);                             // anneau couché au sol (losange 2:1)
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}

// Point d'entrée : rend la frame iso. Renvoie false si layout absent (repli legacy).
// helpers = { bakeMargin, blitMargin } (les caches offscreen du runtime, déjà
// compatibles iso : le pan est projeté dans cityMapBakeMargin/BlitMargin).
export function drawIsoWorld(dt, now, helpers) {
  const L = CM.layout;
  if (!L) return false;
  // Sim : mêmes mises à jour que le pipeline legacy (les agents vivent).
  updateCitizens(dt);
  updateVehicles(dt);
  updateCrisis(dt, now);   // émeute : même sim que le legacy ; rendu via le peintre (drawIsoLive)
  // Fond hors-monde (nature sombre) puis sol baké.
  const ctx = CM.ctx;
  ctx.fillStyle = rgb(GRASS_WILD, 0.9);
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (CM.groundCanvas && helpers) {
    // ':pv…' : l'aperçu __showWonder ajoute son parvis au sol → rebake à l'aller-retour.
    const key = 'iso:' + CM.layoutRecomputeAt + ':' + CM.cam.zoom.toFixed(3) + ':' + ((L.counts && L.counts.eraBand) | 0)
      + (CM.previewWonder ? ':pv' + CM.previewWonder.id : '');
    helpers.bakeMargin(CM.groundCanvas, CM.gctx, '_isoGroundBake', key, drawIsoGround);
    helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');
  } else {
    drawIsoGround();
  }
  // Fleuve LIVE (animé) par-dessus le sol baké → QUAIS par ère (promenade le
  // long du ruban, partagés avec le legacy : cityMapDrawQuays projette via le
  // module iso) → bateaux SUR l'eau → tabliers de pont (les bateaux passent
  // dessous) → scène vivante → drones (passe aérienne) → nuit.
  // Terre-plein : le gazon du bake porte le SOL ; le RELIEF vient de buissons
  // DEBOUT plantés dans la passe vivante (drawIsoLive) — la projection à plat
  // de l'art legacy « couchait » les plantes bakées (retour Raph).
  drawIsoRiver(now);
  cityMapDrawQuays(now);
  drawIsoShips(dt, now);
  drawIsoBridges(now);
  drawIsoLive(now);      // (les merveilles y sont des items du tri peintre)
  drawIsoDrones(now);
  drawIsoNight(now);
  drawIsoAmbient(now);   // feuilles / lucioles / motes — par-dessus le voile de nuit
  // Bulles de pensée (cartouches pixel cliquables) : tout en haut, comme le
  // legacy — la fonction est PARTAGÉE (projection worldToScreen dans agents.js).
  if (!CM.lodActive) drawCitizenThoughts(now);
  return true;
}
