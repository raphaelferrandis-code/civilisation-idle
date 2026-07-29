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
import { CM, cmHash, cmEngineAtelierFoot, ROAD_E, ROAD_N, ROAD_S, ROAD_W, CM_WONDERS, cmWonderActiveIds, cmWonderSlot, cmForEachWonderCell } from '../layout.js';
import { fp } from '../framePerf.js';
import { state } from '../../core/state.js';
import { worldToScreen, visibleCellBounds, visibleDiamondBounds, depthOf, panDeltaToScreen, screenDeltaToPan, wonderFootWorld, ISO_X, ISO_Y } from './projection.js';
import { drawPixelHouse, drawPixelHouseOutline, pixelHouseBox, pixelHouseReady } from '../pixelHouses.js';
import { seasonGrass, seasonWild, seasonTip, seasonFlowerMul, seasonCanopyTint, WINTER } from '../seasonMode.js';
import { drawEngineSprite } from '../buildingShapes.js';
import { drawWonder } from '../renderBuildings.js';
import { engineStage, propReady, blitProp, propBBox } from '../cityEngineSprites.js';
import { drawCachedEngineScene } from '../engineSceneCache.js';
import { glInit, glBegin, glQuad, glFlush, glGetCanvas } from '../glPainter.js';
import { suspendFlameGlow, paintFlameGlows } from '../flameGlow.js';
import {
  LIGHT_LAYER, beginLightLayer, endLightLayer, suspendLightLayer,
  lightCtx, lightCut, lightCutImage, paintLightLayer,
} from '../lightLayer.js';
import { cityMapDrawQuays, updateCrisis, drawRiotWeapon, ensureQuayGate, quayWallTune } from '../renderWorld.js';
import { drawPixelBridges } from '../pixelBridge.js';
import { drawIsoBridgeUnder, drawIsoBridgeNight, pushIsoBridgeItems, drawIsoBridgeSeg, bridgeBlocks, isoBridge3dFlag } from './isoBridge.js';
import {
  updateCitizens, updateVehicles, drawEraAgent, drawEraAgentIso, drawNamedAgent, drawNamedAgentIso,
  drawVehicleHeadlights, drawCitizenThoughts,
  vehicleLaneOffset, ensureVeh, vehReady, VEH_SIZES, VEH_PULL, VEH_PUSH,
  ensureBoat, boatReady, BOAT_SIZES, BOAT_LIFT, ensureDrone, drawDroneRotors,
  ensureVehDiag, vehDiagReady, riotEraKey, AGENT_SCALE, VEH_SCALE,
} from '../agents.js';
// PLACE COMPOSÉE : tout le modèle (rôles des cellules, recettes par ère, tailles
// en tuiles, molette __plaza) vit dans isoPlaza.js. Ici on ne fait que pousser
// ses items dans le tri peintre. Cf. docs/PLACES-ISO-COMPOSEES.md.
import {
  isoPlazaBox, isoPlazaBoxes, plazaEraForBand, isoPlazaItems, isoPlazaLamps,
  isoPlazaKitOn, isoPlazaSceneOn, isoPlazaSceneCoversGround,
  drawIsoPlazaProp, drawIsoPlazaGrid,
} from './isoPlaza.js';

// ── Palette Phase 1 (flat, calée sur les teintes du rendu actuel) ────────────
const GRASS = [116, 138, 84];        // herbe / nature (référence = été)
const GRASS_WILD = [98, 120, 76];    // hors ville (léger contraste)
// PALETTE DE SAISON, résolue une fois par frame depuis CM.season. Ces variables
// remplacent GRASS / GRASS_WILD / GD_TIP partout où le SOL est peint : le sol
// étant baké, elles ne sont relues qu'à la recuisson, et la saison figure dans
// la clé du bake. Les constantes ci-dessus restent la référence d'été.
let SEASON_GRASS = GRASS, SEASON_WILD = GRASS_WILD, SEASON_TIP = null, SEASON_FLOWER_MUL = 1;
const WATER = [74, 98, 109];         // eau ardoise (cf. fleuve)
const PLAZA = [214, 206, 182];       // dallage d'esplanade
// Bas-fond CLAIR le long des rives (drawIsoRiver) : 3 bandes CLAIR (bord) → profond
// (centre), « l'eau est moins profonde au bord » (retour Raph 2026-07-16 :
// « remets un liseré bleu clair sur les bords du fleuve »). Teintes = bleus gris
// CLAIRS de la famille de l'eau ardoise (pas de cyan). Réglable live via
// window.__waterShore({ on, maxBand, w1,w2,w3, a1,a2,a3, c1,c2,c3, lodMerge,lodW,lodA,lodC }).
//
// ⚠ EXCLUSION MUTUELLE AVEC LE QUAI, ET SON TROU. Dès la bande 2 la berge
// maçonnée porte SON propre bas-fond au pied du mur (shoreLine de drawRun) : les
// deux ensemble faisaient deux lignes claires parallèles, d'où `maxBand`. Mais ce
// relais du quai est sous `if (wallOn && !lod)` — il DISPARAÎT au dézoom. Mesuré
// sur les pixels de bord du ruban : bande 1 → 25,3 % de bord clair au repos comme
// en LOD, bande 4 → 12,5 % au repos mais 10,0 % en LOD. Raph veut le liseré
// « tout le temps » (2026-07-22), donc on reprend la main quand le quai lâche :
// `lodFallback` rallume le bas-fond en LOD à toutes les ères. L'exclusion reste
// entière au repos — jamais les deux à la fois, jamais deux lignes parallèles.
export const waterShoreTune = {
  on: true,
  maxBand: 1,                                              // bande d'ère max (au-delà : bas-fond du quai)
  lodFallback: true,                                       // en LOD le quai ne trace rien → on reprend la main
  w1: 18, w2: 10, w3: 4.5,                                 // largeurs (× zoom)
  a1: 0.45, a2: 0.58, a3: 0.75,                            // alphas (bord = plus opaque)
  c1: '120,160,175', c2: '150,192,205', c3: '190,224,232', // bleus clairs, du doux au liseré
  // FUSION AU DÉZOOM (LOD) : les trois bandes tombent alors à 6,3 / 3,5 / 1,6 px
  // et se confondent en une seule lisière à l'œil, tout en coûtant six traits
  // pleine longueur dans un clip. On les remplace par UN trait.
  //
  // ⚠ RÉGLAGE CALÉ À L'ŒIL SUR CAPTURE, pas déduit. Le premier essai prenait la
  // teinte MÉDIANE c2 à 0,62 — comparaison à ×4 sans appel : le liseré clair
  // disparaissait presque. Ce qui porte la lecture du bord, c'est la teinte VIVE
  // c3, pas la moyenne des trois : empilées, les trois bandes culminent à ~0,94
  // d'opacité sur c3 au ras de la rive. Trois essais capturés au même instant
  // figé (10/0,80 · 12/0,70 · 8/0,90), c'est 12/0,70 qui recolle à la référence.
  lodMerge: true,
  lodW: 12,                                                // largeur du trait fusionné (× zoom)
  lodA: 0.70,                                              // opacité
  lodC: '190,224,232'                                      // = c3, la teinte VIVE du liseré
};
// Matière de chaussée par ère (calée sur la progression du jeu) :
// terre battue → pavé de pierre → asphalte industriel → voie sombre futuriste.
// Depuis la regénération des chaussées (2026-07-28), le ruban est REMPLI par la
// tuile road-* de l'ère (ROAD_DETAIL.tiles) : ces tons sont le TON MOYEN MESURÉ
// des tuiles (imprimé par scripts/fetchGroundTiles.mjs) — ils servent d'aplat de
// repli tant que le PNG décode, de teinte LOD, et de base à l'ÉPAULEMENT
// (shoulderMix) : s'ils divergeaient des tuiles, l'accotement jurerait avec sa
// chaussée.
function roadToneRaw(band) {
  return band >= 7 ? [73, 86, 102]     // tech — voie bleu-gris sombre
    : band >= 6 ? [65, 62, 64]         // asphalte
      : band >= 4 ? [128, 116, 100]    // pierre — voie dallée claire
        : band >= 2 ? [108, 104, 92]   // pavé — rue grise
          : [116, 79, 55];             // terre — sentier
}
// Ton EFFECTIF de la chaussée = tuile + VOILE DE LECTURE de l'ère (ROAD_VEIL,
// plus bas). Une seule vérité : l'épaulement, l'aplat de repli et la teinte de
// dézoom suivent ce que la rue montre VRAIMENT — sinon l'accotement d'une rue
// voilée jurerait avec sa propre chaussée, et le réseau se rebrouillerait au
// premier cran de dézoom (là où le ruban n'est plus qu'un aplat).
function roadTone(band) {
  const t = roadToneRaw(band), v = roadVeilFor(band);
  return v ? [0, 1, 2].map((i) => Math.round(t[i] + (v[i] - t[i]) * v[3])) : t;
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
// wonder → `iso-wonder`, MATIÈRE PROPRE au parvis des merveilles depuis le
// 2026-07-28 (Raph : « je veux une génération pixel lab » pour ces sols) :
// MOSAÏQUE ocre et blanche. Il empruntait jusque-là la tuile de place (iso-plaza), au
// point qu'un parvis de merveille et une place de quartier avaient le même sol —
// rien ne disait que le monument était important. Le prompt et les gardes sont
// dans scripts/fetchGroundTiles.mjs.
const ISO_TILE_KEYS = { grass: 'iso-grass', dirt: 'iso-dirt', urban: null, plaza: 'iso-plaza', wonder: 'iso-wonder' };
// VARIANTES par matière — public/pixelart/iso/<clé>-1..N.png (scripts/fetchGroundTiles.mjs).
// Clé absente ou N ≤ 1 : tuile unique <clé>.png, comme avant.
//
// ⚠ POURQUOI DES VARIANTES SONT LÉGITIMES ICI, alors que ce fichier répète que
// « toute variation par CELLULE montre la grille » (cf. l'aplat strictement uni
// de drawIsoGround) : le grief visé par cette règle est une variation de TON.
// Quatre tuiles de valeurs différentes tirées au hasard ne cassent pas la
// répétition — elles dessinent un damier clair/sombre qui SOULIGNE la grille,
// donc pire que la tuile unique qu'elles remplacent. Mesuré sur le 1er lot :
// 24,0 d'écart de luminance moyenne entre les variantes d'herbe (1,1 seulement
// pour le pavé — le défaut dépend de la matière, il se mesure). fetchGroundTiles
// les égalise PAR CANAL avant de les écrire, écart ramené à ~0 : ce qui varie
// d'une cellule à l'autre est alors le DESSIN seul, jamais la valeur ni la
// teinte. La règle tient, la variante passe.
export const ISO_TILE_VARIANTS = {
  'iso-wonder': 4,
  'iso-grass': 4, 'iso-dirt': 4, 'iso-plaza': 4,
  'ground-earth': 4, 'ground-cobble': 4, 'ground-flagstone': 4,
  'ground-concrete': 4, 'ground-tech': 4,
  'road-dirt': 4, 'road-cobble': 4, 'road-stone': 4, 'road-asphalt': 4, 'road-tech': 4,
  'iso-grass-winter': 4, 'ground-earth-winter': 4, 'ground-cobble-winter': 4,
  'ground-flagstone-winter': 4, 'ground-concrete-winter': 4,
};
// Jeu d'HIVER — neige CUITE dans l'art (sprites dédiés demandés par Raph après
// la suppression du liseré/mottes procéduraux qui clignotaient au pan, cf. le
// bloc NEIGE D'HIVER). Résolu au BLIT par CM.season ; la saison fait déjà
// partie de la clé du bake (cityMapRuntime : « elle entre dans la clé du bake du
// sol ») → le cran de saison recuit tout seul, la bascule est gratuite ici.
// Tant que le PNG d'hiver n'est pas décodé, on blitte la tuile d'ÉTÉ (jamais
// d'aplat qui flashe) ; son onload déclenche la recuisson douce habituelle.
// Sans entrée ici (tech, routes, place, dirt sauvage) : la matière reste
// telle quelle en hiver — voulu pour les voies (piétinées/déneigées).
export const ISO_TILE_WINTER = {
  'iso-grass': 'iso-grass-winter',
  'ground-earth': 'ground-earth-winter',
  'ground-cobble': 'ground-cobble-winter',
  'ground-flagstone': 'ground-flagstone-winter',
  'ground-concrete': 'ground-concrete-winter',
};
// Clé de la variante d'une cellule, depuis le hash DÉJÀ calculé par l'appelant
// (celui qui décide aussi le miroir) — pas de second cmHash par cellule.
// ⚠ bits 5-6, JAMAIS le bit faible : sur FNV-1a le bit 0 n'est que la parité de
// l'entrée, et un tirage sur 'gx,gy' y donne un damier (8,5 % de voisins
// identiques au lieu de 50 %) que la répartition globale, restée à 50,0 % pile,
// cache complètement. Exportée pour le test.
export function isoVariantKey(key, h) {
  const n = ISO_TILE_VARIANTS[key] || 0;
  return n > 1 ? key + '-' + (1 + ((h >>> 5) % n)) : key;
}
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
// Face SUPÉRIEURE seule, MASQUÉE AU LOSANGE — canvas construit une fois au décodage.
// ⚠ Pourquoi un masque et pas un simple recadrage (retour Raph 2026-07-22 : « on voit
// encore les bordures de sol ») : les tuiles PixelLab sont des DALLES EN VOLUME (face
// 2:1 + épaisseur). L'épaisseur ne déborde pas seulement SOUS la pointe sud — ses deux
// faces latérales pendent sous les arêtes SO et SE, donc À L'INTÉRIEUR du rectangle
// (bb.w × bb.w/2). Un crop rectangulaire ne peut pas les retirer : elles se reposaient
// sur chaque voisine → liseré clair au SO + liseré sombre au SE de CHAQUE cellule =
// quadrillage sur tout le sol. Seul un masque losange les enlève. Mesuré : ~500 px
// parasites par tuile de 64.
// Tolérance +0.75 px : les losanges voisins se recouvrent d'un cheveu (comme le +1 px
// du blit) → aucun interstice de fond entre cellules, et on reste loin des faces
// latérales (≥ 6 px de haut). Renvoie null si les pixels sont illisibles (canvas
// teinté) → l'appelant retombe sur le recadrage rectangulaire historique.
// Le pixel (x,y) de la face fw×fh est-il DANS le losange de la cellule ?
// Exporté pour le test : c'est la géométrie qui distingue la face du sol des
// faces latérales de la dalle (ces dernières vivent dans les coins bas du
// rectangle, sous les arêtes SO/SE — exactement ce que le masque doit couper).
export function isoFaceKeeps(x, y, fw, fh, tol = 0.75) {
  const cx = fw / 2, cy = fh / 2;
  return Math.abs(x + 0.5 - cx) / cx + Math.abs(y + 0.5 - cy) / cy <= 1 + tol / cx;
}
function isoTileFace(img, bb) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h || !bb) return null;
  const fw = bb.w, fh = Math.max(1, Math.round(bb.w / 2));
  let src, dst;
  try {
    const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0);
    src = cx.getImageData(0, 0, w, h);
    const fc = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(fw, fh) : document.createElement('canvas');
    fc.width = fw; fc.height = fh;
    const fx = fc.getContext('2d', { willReadFrequently: true });
    fx.imageSmoothingEnabled = false;
    dst = fx.createImageData(fw, fh);
    for (let y = 0; y < fh; y += 1) {
      const sy = bb.y0 + y;
      for (let x = 0; x < fw; x += 1) {
        const sx = bb.x0 + x;
        if (sx >= w || sy >= h) continue;
        if (!isoFaceKeeps(x, y, fw, fh)) continue;
        const si = (sy * w + sx) * 4, di = (y * fw + x) * 4;
        dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = src.data[si + 3];
      }
    }
    fx.putImageData(dst, 0, 0);
    return fc;
  } catch { return null; }
}

/* ---------------------------------------------------------------------------
 * ÉCHELLE DU MOTIF DE SOL — « les tuiles sont trop grosses » (Raph 2026-07-25,
 * même diagnostic que l'eau, cf. waterTilesTune).
 *
 * Une tuile = UNE CELLULE : à zoom 1 ses 64 px d'art couvrent les 64 px du
 * losange, donc un pavé de 8 px d'art fait 8 px d'écran sur un lot qui porte une
 * maison entière — des pavés d'un mètre et demi, des dalles de deux. `rep`
 * subdivise la cellule en rep×rep SOUS-LOSANGES qui reçoivent chacun la tuile
 * entière : le motif rétrécit d'autant. La subdivision est EXACTE — les rep²
 * sous-losanges sont l'image d'un découpage régulier du carré monde par une
 * projection AFFINE, ils pavent le losange de cellule sans trou ni chevauchement
 * — donc rien à recoller, et le coût par cellule ne bouge pas : la face répétée
 * est composée UNE FOIS par (tuile, rep), le blit du sol reste un drawImage.
 *
 * ⚠ `insetF` N'EST PAS UN DÉTAIL DE RÉGLAGE. Ces tuiles sont des DALLES EN
 * VOLUME (cf. isoTileFace juste au-dessus) : le pourtour de leur face est un
 * LISERÉ de dalle. À rep=1 ce liseré tombe pile sur l'arête de cellule et se
 * noie dans le recouvrement des voisines ; recopié tel quel dans chaque
 * sous-losange il se retrouve rep fois PAR cellule et dessine un quadrillage
 * diagonal en travers de tout le sol. Vérifié en aperçu hors-jeu avant d'écrire
 * une ligne de moteur : lignes franches à rep 2 comme à rep 3, disparues en
 * échantillonnant l'INTÉRIEUR de la face (losange rétréci de insetF de sa
 * largeur). 5 % = 3 px sur une tuile de 64, 2 px sur une de 48.
 *
 * Réduction en NEAREST (imageSmoothingEnabled=false), pas en moyenne de boîte :
 * la moyenne lisse mieux les joints d'un pixel mais fabrique des teintes entre
 * deux entrées de la palette maître.
 * ------------------------------------------------------------------------- */
// DEPUIS LA REGÉNÉRATION DES TUILES (2026-07-28, sols puis chaussées), toutes
// les tuiles en service sont PLATES et NATIVES en 64×32 (= le losange d'une
// cellule à zoom 1) et COURT-CIRCUITENT le sous-pavage (cf. isoTileIsFlat) pour
// être blittées pixel pour pixel. Le sous-pavage restait un pis-aller : il
// rétrécissait bien le motif, mais en redessinant une fenêtre de 58×29 dans des
// sous-losanges de 33×17 — réduction ×1,757 en NEAREST, ratio NON ENTIER. La
// grille de pixels était détruite : sur le pavé, plus une seule pierre lisible,
// juste un moucheté (vérifié en rendant un pan de 6×6 cellules à l'échelle du
// jeu) ; l'art n'était vu à 1:1 à AUCUN zoom. Le grain fin vient maintenant du
// dessin. rep/insetF restent la molette __groundTile pour toute dalle en volume
// résiduelle (iso-pavement, asset regénéré avec le mauvais outil…) — pour elles
// l'inset reste la condition anti-quadrillage.
export const groundTileTune = { rep: 2, insetF: 0.05 };
// Une tuile PLATE est un PNG 2:1 exact (64×32) : la face EST le losange, rien à
// sous-paver ni à rogner. Les dalles en volume sont carrées (48×48, 64×64 —
// face 2:1 + épaisseur). Exportée pour le test : c'est CE prédicat qui décide
// quelles tuiles échappent au rééchantillonnage destructeur.
export const isoTileIsFlat = (w, h) => w === h * 2;
if (typeof window !== 'undefined') {
  // Molette : __groundTile(1) rejoue l'ancien sol (1 tuile = 1 cellule) ;
  // __groundTile(3) va plus fin ; __groundTile({ insetF: 0.08 }) creuse le liseré.
  window.__groundTile = (arg) => {
    if (typeof arg === 'number') groundTileTune.rep = arg;
    else if (arg && typeof arg === 'object') Object.assign(groundTileTune, arg);
    isoTileCache.forEach((e) => { e.tiled = null; e.veiled = null; });
    CM._isoGroundBake = null;   // le sol est CUIT : sans ça la molette ne se voit pas
    return { ...groundTileTune };
  };
}
// Rectangle (flottant) du sous-losange (i,j) dans une face fw×fh découpée en
// rep×rep. Exporté pour le test : c'est CETTE géométrie qui garantit le pavage
// exact du losange de cellule — si elle dérape, le sol se troue ou se recouvre.
// Fenêtre d'échantillonnage dans la face : on rentre de `ix` px sur les côtés
// pour ne JAMAIS recopier le liseré de la dalle (cf. le ⚠ ci-dessus). ix est
// forcé PAIR pour que iy = ix/2 tombe juste : la fenêtre doit rester en 2:1
// comme la face, sinon les sous-losanges s'écrasent d'un demi-pixel et le motif
// « glisse » d'une sous-tuile à l'autre. Exportée pour le test — recalculer la
// formule dans le test reviendrait à la comparer à elle-même.
export function isoFaceInset(fw, insetF) {
  const ix = 2 * Math.max(1, Math.round((fw * insetF) / 2));
  return { ix, iy: ix / 2 };
}
export function isoSubTileRect(i, j, fw, fh, rep) {
  const sw = fw / rep, sh = fh / rep;
  // Coin NORD du sous-losange : la projection iso d'un pas de sous-cellule,
  // exactement ce que worldToScreen ferait à l'échelle 1/rep (x ∝ i−j, y ∝ i+j).
  return { x: fw / 2 + (i - j) * sw / 2 - sw / 2, y: (i + j) * sh / 2, w: sw, h: sh };
}
// Face d'une cellule pavée de rep×rep copies de `face`. Renvoie `face` tel quel
// à rep ≤ 1 (ou si les pixels sont illisibles) : le sol garde son rendu d'avant.
function isoFaceTiled(face, rep, insetF) {
  const fw = face && face.width, fh = face && face.height;
  if (!fw || !fh || !(rep > 1)) return face;
  try {
    const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(fw, fh) : document.createElement('canvas');
    c.width = fw; c.height = fh;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    const sw = fw / rep, sh = fh / rep;                      // sous-losange (flottant)
    const dw = Math.ceil(sw) + 1, dh = Math.ceil(sh) + 1;    // +1 px : anti-couture interne
    const { ix, iy } = isoFaceInset(fw, insetF);
    const sww = fw - 2 * ix, shh = fh - 2 * iy;
    if (sww < 4 || shh < 2) return face;
    for (let j = 0; j < rep; j += 1) {
      for (let i = 0; i < rep; i += 1) {
        const r = isoSubTileRect(i, j, fw, fh, rep);
        cx.drawImage(face, ix, iy, sww, shh, Math.round(r.x), Math.round(r.y), dw, dh);
      }
    }
    // Le +1 px des sous-tuiles du pourtour sort du losange de cellule : on
    // remasque avec la MÊME géométrie (isoFaceKeeps), sinon la face redevient un
    // rectangle et le quadrillage revient d'un cran plus haut, entre cellules.
    const dat = cx.getImageData(0, 0, fw, fh);
    for (let y = 0; y < fh; y += 1) {
      for (let x = 0; x < fw; x += 1) {
        if (!isoFaceKeeps(x, y, fw, fh)) dat.data[(y * fw + x) * 4 + 3] = 0;
      }
    }
    cx.putImageData(dat, 0, 0);
    return c;
  } catch { return face; }
}
// Face à blitter pour cette tuile, au `rep` courant. Composée paresseusement et
// gardée sur l'entrée de cache : une molette la périme, pas chaque recuisson.
function isoFaceFor(e) {
  const G = groundTileTune;
  const rep = Math.max(1, Math.round(G.rep || 1));
  if (e.flat || rep <= 1 || !e.face) return e.face;   // plate native : toujours 1:1
  if (!e.tiled || e.tiled.rep !== rep || e.tiled.insetF !== G.insetF) {
    e.tiled = { rep, insetF: G.insetF, c: isoFaceTiled(e.face, rep, G.insetF) };
  }
  return e.tiled.c || e.face;
}
// VOILE DE LECTURE cuit dans la face (cf. ROAD_VEIL) : composé UNE FOIS par
// (tuile, voile) et gardé sur l'entrée de cache — coût nul par cellule.
// ⚠ Pourquoi pas un aplat en alpha rempli sur le ruban après le blit, qui aurait
// tenu en deux lignes : le ruban est tracé PAR CELLULE (pavé + bras), et deux
// cellules voisines partagent une arête. Une couche opaque ne le voit pas, une
// couche en ALPHA double-blende le cheveu d'antialiasing du raccord → un
// quadrillage fantôme en travers des rues, précisément ce que les passes-union
// des autres couches (ourlet, gorge, trottoir) existent pour éviter.
// `source-atop` ne peint que les pixels déjà opaques : le masque losange de la
// face est préservé tel quel. Sans face (débord d'herbe, pixels illisibles) on
// rend la face nue — les chaussées sont toutes plates, le cas ne se présente pas.
function isoFaceVeiled(e, veil) {
  const face = isoFaceFor(e);
  if (!face || !veil) return face;
  const sig = veil.join(',') + '|' + groundTileTune.rep + '|' + groundTileTune.insetF;
  if (e.veiled && e.veiled.sig === sig && e.veiled.c) return e.veiled.c;
  try {
    const w = face.width, h = face.height;
    const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(face, 0, 0);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = `rgba(${veil[0]},${veil[1]},${veil[2]},${veil[3]})`;
    cx.fillRect(0, 0, w, h);
    e.veiled = { sig, c };
    return c;
  } catch { return face; }
}

function ensureIsoTileKey(key) {
  if (!key) return null;
  let e = isoTileCache.get(key);
  if (e) return e;
  e = { img: null, ready: false, bbox: null, face: null, tiled: null, veiled: null, failed: false, flat: false, over: 0 };
  isoTileCache.set(key, e);
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => {
      e.flat = isoTileIsFlat(im.naturalWidth, im.naturalHeight);   // 64×32 natif → blit 1:1, jamais de rep
      // DÉBORD EN PERSPECTIVE (herbe) : PNG 64×(32+OV], OV ≤ 12 — les OV lignes
      // au-dessus du losange sont des brins qui doivent recouvrir le voisin du
      // NORD (le bake balaie nord→sud, cette cellule est peinte après lui).
      // Les dalles en volume ne matchent pas (64×64 et 48×48 dépassent w/2+12).
      const ovh = im.naturalHeight - im.naturalWidth / 2;
      e.over = (ovh > 0 && ovh <= 12) ? ovh : 0;
      e.bbox = isoTileBBox(im);
      // Pas de face masquée pour un débord : le masque losange couperait
      // précisément les brins qu'on veut garder — blit brut depuis e.img.
      e.face = e.over ? null : isoTileFace(im, e.bbox);   // face masquée au losange (une fois)
      e.tiled = null;                     // la face répétée se recompose à la demande
      e.veiled = null;                    // …et la face voilée avec elle
      e.ready = !!e.bbox;
      // Invalidation DOUCE : le bake reste re-blittable, la recuisson (chère sur
      // mégapole) est coalescée par drawIsoWorld — une rafale de décodages au
      // chargement ne paie plus une recuisson par sprite. Pas de bake → rien à
      // faire, la 1re recuisson verra la tuile prête.
      if (CM._isoGroundBake) CM._isoGroundBake.soft = true;
    };
    im.onerror = () => { e.failed = true; };   // PNG absent → on garde le repli procédural
    im.src = '/pixelart/iso/' + key + '.png';
    e.img = im;
  }
  return e;
}
function ensureIsoTile(kind) { return ensureIsoTileKey(ISO_TILE_KEYS[kind]); }
// Blit une tuile de sol sur la cellule dont le coin NORD projeté est (nx, ny).
// ⚠ FACE SEULE, MASQUÉE AU LOSANGE (e.face, cf. isoTileFace) : l'épaisseur du
// « thin tile » ne se contente pas de déborder sous la pointe sud, ses faces
// latérales pendent sous les arêtes SO/SE, donc DANS le rectangle 2:1 — le seul
// recadrage rectangulaire (1er correctif) laissait un liseré clair + un liseré
// sombre sur chaque cellule = quadrillage sur tout le sol.
// Un sol plat doit être une SURFACE continue, pas un empilement de dalles.
// Repli (pixels illisibles) : recadrage rectangulaire historique depuis e.img.
// Renvoie false si pas prête (l'appelant garde l'aplat).
function blitIsoTile(ctx, kind, nx, ny, hw, mirror = false, h = 0) {
  return blitIsoTileKey(ctx, ISO_TILE_KEYS[kind], nx, ny, hw, mirror, h);
}
function blitIsoTileKey(ctx, key, nx, ny, hw, mirror = false, h = 0, veil = null) {
  // HIVER : bascule vers la tuile enneigée si elle existe ET est décodée —
  // sinon on garde l'été pour cette recuisson (le décodage la rappellera).
  if (CM.season === WINTER && ISO_TILE_WINTER[key]) {
    const we = ensureIsoTileKey(isoVariantKey(ISO_TILE_WINTER[key], h));
    if (we && we.ready) key = ISO_TILE_WINTER[key];
  }
  const e = ensureIsoTileKey(isoVariantKey(key, h));
  if (!e || !e.ready) return false;
  const bb = e.bbox;
  const faceH = Math.max(1, Math.round(bb.w / 2));   // face iso 2:1 du contenu
  const k = (hw * 2) / bb.w;
  // DÉBORD EN PERSPECTIVE (e.over, herbe) : les `ov` lignes au-dessus du losange
  // sont blittées AU-DESSUS du coin nord (dy remonte d'autant) — le bake balaie
  // nord→sud, elles recouvrent donc le voisin du nord, sol urbain compris :
  // « au sud du sol, l'herbe passe devant ». Borné par bb.h : une variante sans
  // brins hauts ne doit pas étirer son losange.
  const ov = (!e.face && e.over) ? Math.max(0, Math.min(e.over, bb.h - faceH)) : 0;
  const srcH = faceH + ov;
  const dw = Math.ceil(bb.w * k) + 1;          // +1 px : anti-couture entre losanges
  const dh = Math.ceil(srcH * k) + 1;
  const dy = Math.round(ny - ov * k);
  // Source : la face masquée (répétée rep×rep, cf. groundTileTune) si elle a pu
  // être construite, sinon la tuile brute. La face répétée fait la MÊME taille
  // que la simple (bb.w × faceH) — le blit ci-dessous ne change pas d'un iota.
  const face = isoFaceVeiled(e, veil);
  const src = face || e.img;
  const sx = face ? 0 : bb.x0, sy = face ? 0 : bb.y0;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (mirror) {
    // Miroir horizontal 1 cellule sur ~2 (hash) : casse la répétition du motif
    // sans 2e asset — légitime pour une FACE de sol (pas d'ombrage directionnel fort).
    ctx.save();
    ctx.translate(Math.round(nx - hw) + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, sy, bb.w, srcH, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(src, sx, sy, bb.w, srcH, Math.round(nx - hw), dy, dw, dh);
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
// 0.30 → 0.25 le 2026-07-16 (retour Raph « trottoirs plus larges, les voitures
// roulent au milieu ») : chaussée un peu plus étroite → deux VOIES lisibles à
// ±ROAD_BAND/2 du centre (publié aux agents via CM.isoVehLane) et de la place
// pour de vrais trottoirs (SIDEWALK_ISO.w remonté en face).
const ROAD_BAND = 0.25;   // demi-largeur du ruban (fraction de tuile) — rang « secondary »

// HIÉRARCHIE des largeurs (Raph 2026-07-28 : « des petits chemins et des
// grandes routes — là tout fait la même largeur ») : demi-largeur de chaussée
// PAR RANG, en fraction de tuile. `secondary` = l'ancienne largeur unique
// (ROAD_BAND), qui reste la référence des publications scalaires aux agents.
// Budget géométrique : halfW + trottoir (0.22) doit rester ≈ ½ tuile — avenue
// et main débordent un peu sur la cellule voisine (assumé : recouvert par la
// chaussée jumelle côté boulevard, marge d'herbe côté extérieur) ; le mât de
// lampadaire (LAMP_TUNE.curb = 0.05 du bord) reste hors chaussée jusqu'à 0.45.
export const ISO_ROAD_HALFW = { path: 0.16, secondary: ROAD_BAND, avenue: 0.33, main: 0.36 };
export function isoRoadHalfW(rank) {
  const w = ISO_ROAD_HALFW[rank];
  return w != null ? w : ROAD_BAND;
}

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
// meadow : PRÉS — plaques lentes de nuance par bruit LISSÉ (smoothNoise, aucune
// couture de cellule ni de bloc, contrairement à la variance par cellule qui
// dessinait un maillage) ; foncé = herbe grasse, clair = herbe sèche. Dosé bas.
// tileAlpha 0 → 1 (Raph 2026-07-28) : la tuile d'herbe regénérée (4 variantes
// brutes, patchwork voulu) est DESSINÉE — l'ancien 0 datait de la tuile unique
// qui tapissait ; « branche ce que j'ai mis en image ».
// clumpScale (Raph 2026-07-28 : « les grosses touffes dénotent trop ») : les
// touffes Cainos passaient à l'échelle pleine du pixel d'art (~une demi-cellule
// à côté de brins de 2 px) — réduites, pas supprimées ; 0 touffe = clumpP: 0.
const GRASS_DETAIL = { on: true, tileAlpha: 1, flowerP: 0.22, tuftP: 0.45, speckleP: 0, wildShade: 0, meadow: 0.16, clumpP: 0.09, clumpScale: 0.55 };
// Sous-couche des tuiles d'herbe À CREUX (noFill, cf. fetchGroundTiles) : les
// trous entre brins doivent lire comme l'OMBRE sous l'herbe, pas comme le fond
// olive du bake (plus clair que les brins → relief inversé, points clairs).
// = ton moyen mesuré du lot (l'aperçu validé par Raph posait exactement ça).
// La version HIVER suit la tuile enneigée (ton mesuré par fetchGroundTiles).
const GRASS_TILE_UNDER = [42, 85, 39];
const GRASS_TILE_UNDER_WINTER = [126, 143, 137];   // ton mesuré du lot hiver (fetchGroundTiles)
const GD_BLADE = [66, 100, 46];      // brin foncé
const GD_TIP = [156, 180, 96];       // pointe claire du brin (référence = été)
// Décor de sol découpé du pack Cainos (scripts/sliceCainosPlants.mjs), rabattu
// sur la rampe foliage. Les CAILLOUX du même pack ont été dispersés ici puis
// RETIRÉS (Raph, 2026-07-22) — d'abord les pierres plates (« en tuile » dans
// l'herbe), puis les blocs ronds. Ne pas re-proposer de semer des pierres.
const GD_TUFTS = 15;                 // deco/tuft-1..15

// Résout la palette de saison. Appelée en tête de frame : trois lectures de
// table, aucun calcul de couleur — l'interpolation libre est explicitement
// exclue (cf. seasonMode.js), il n'y a donc rien à mélanger.
// Feuillage teinté par saison, cuit à la demande et gardé en cache par
// (variante, saison). Renvoie null en été (sprite d'origine, coût nul) ou tant
// que l'image n'est pas décodée.
const _seasonTrees = new Map();
function seasonTree(art, variant) {
  const s = CM.season | 0;
  const tint = seasonCanopyTint(s);
  if (!tint || !art.ready || !art.img) return null;
  const key = variant + ':' + s;
  const hit = _seasonTrees.get(key);
  if (hit) return hit;
  const w = art.img.naturalWidth || art.img.width;
  const h = art.img.naturalHeight || art.img.height;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(art.img, 0, 0);
  // multiply teinte le feuillage sans toucher aux valeurs ; source-atop garde
  // la silhouette (sans lui, le rectangle entier serait peint).
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(art.img, 0, 0);
  _seasonTrees.set(key, c);
  return c;
}

function refreshSeasonPalette() {
  const s = CM.season | 0;
  SEASON_GRASS = seasonGrass(s);
  SEASON_WILD = seasonWild(s);
  SEASON_TIP = seasonTip(s);
  SEASON_FLOWER_MUL = seasonFlowerMul(s);
}
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
// ⚠ NE PAS « batcher » ces rects par couleur : essayé et MESURÉ le 2026-07-17 →
// aucun gain (154 ms vs 158 ms sur ~30 000 rects). fillRect est un chemin rapide
// de Skia (aucun path construit) — contrairement aux diamondPath des voiles, que
// le remisage par palier fait gagner pour de bon (194 → 102 ms). Le vrai coût
// résiduel ici est la CHAÎNE de style reconstruite par rect, pas l'appel de dessin.
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
      rect(bxi, by - jh, pu, pu, SEASON_TIP || GD_TIP, 1);   // pointe claire
    }
  }
  // Fleur ÉPARSE (flowerP, le SEUL motif par défaut) : pâquerette = 4 pétales blanc
  // cassé + cœur jaune. « De temps en temps » sur un fond uni.
  // La saison module la densité : rien ne fleurit en hiver, le printemps déborde.
  if ((cmHash('gf:' + gx + ':' + gy) & 1023) / 1023 < GRASS_DETAIL.flowerP * SEASON_FLOWER_MUL) {
    const fl = GD_FLOWERS[cmHash('fc:' + gx + ':' + gy) % GD_FLOWERS.length];
    const petal = fl[0], core = fl[1];
    const fx = 0.3 + ((h1 >> 20) & 15) / 15 * 0.4;
    const fy = 0.3 + ((h2 >> 20) & 15) / 15 * 0.4;
    const cx = Math.round(px + (fx - fy) * hw), cy = Math.round(py + (fx + fy) * hh);
    rect(cx - pu, cy, pu, pu, petal, 1); rect(cx + pu, cy, pu, pu, petal, 1);
    rect(cx, cy - pu, pu, pu, petal, 1); rect(cx, cy + pu, pu, pu, petal, 1);
    rect(cx, cy, pu, pu, core, 1);
  }
  // ── TOUFFES et PIERRES (sprites, pack Cainos) ──────────────────────────────
  // Posés à l'échelle du PIXEL D'ART (pu) et pas à une taille en px : c'est ce
  // qui les met à la même résolution apparente que les brins et les pâquerettes
  // tracés juste au-dessus. Dessiné au pixel près, sans lissage — sinon un
  // sprite de 15 px étalé sur 30 devient flou. Ancrés par le BAS-CENTRE (une
  // pierre pose son assise au point, elle ne flotte pas autour).
  // Ils vivent dans le BAKE du sol : coût nul par frame, et ils sont sautés
  // d'office par le bake allégé (pan) comme les autres détails d'herbe.
  const deco = (art, fx, fy, scale = 1) => {
    if (!art.ready || !art.img) return;
    const iw = art.img.naturalWidth || art.img.width || 0;
    const ih = art.img.naturalHeight || art.img.height || 0;
    if (!iw || !ih) return;
    const w = Math.max(1, Math.round(iw * pu * scale)), hgt = Math.max(1, Math.round(ih * pu * scale));
    const sx = Math.round(px + (fx - fy) * hw), sy = Math.round(py + (fx + fy) * hh);
    ctx.drawImage(art.img, sx - (w >> 1), sy - hgt, w, hgt);
  };
  // Touffe d'herbe haute. Densité SÉPARÉE des brins procéduraux (tuftP) : une
  // touffe dessinée fait ~une demi-cellule, à la densité des brins elle
  // re-carpetterait le sol — l'écueil déjà tranché avec Raph le 2026-07-12.
  const h3 = cmHash('gc:' + gx + ':' + gy);
  if (GRASS_DETAIL.clumpP > 0 && (h3 & 1023) / 1023 < GRASS_DETAIL.clumpP) {
    const fx = 0.24 + ((h3 >> 10) & 31) / 31 * 0.52;
    const fy = 0.24 + ((h3 >> 16) & 31) / 31 * 0.52;
    deco(isoArt('deco/tuft-' + (1 + (h3 % GD_TUFTS))), fx, fy, GRASS_DETAIL.clumpScale);
  }
}
if (typeof window !== 'undefined') {
  // Molette de réglage : rebake le sol immédiatement.
  // __grassDetail(false) éteint ; (nombre) = fréquence des fleurs ; ({tileAlpha,
  // flowerP,tuftP,speckleP,wildShade,clumpP}) = réglage fin. Ex. réactiver les
  // brins : __grassDetail({ tuftP: 0.25 }) ; couper les touffes dessinées :
  // __grassDetail({ clumpP: 0 }).
  window.__grassDetail = (arg) => {
    if (arg === false) GRASS_DETAIL.on = false;
    else if (typeof arg === 'number') { GRASS_DETAIL.on = true; GRASS_DETAIL.flowerP = arg; }
    else if (arg && typeof arg === 'object') { GRASS_DETAIL.on = true; Object.assign(GRASS_DETAIL, arg); }
    else GRASS_DETAIL.on = true;
    CM._isoGroundBake = null;
    return { ...GRASS_DETAIL };
  };
}
// ── Bruit de valeur LISSÉ (interp. bilinéaire de hashs de grille, easing cubique)
// en espace cellule : grandes plaques douces SANS couture (ni maillage par cellule
// ni bord de bloc — les deux écueils déjà rencontrés). 0..1, stable par seed.
// Sert au voile de nuance des sols urbains et aux prés de l'herbe (meadow).
function smoothNoise(gx, gy, scale, salt) {
  const x = gx / scale, y = gy / scale;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => (cmHash(salt + ':' + i + ':' + j) % 1000) / 1000;
  return (h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx) * (1 - sy)
    + (h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx) * sy;
}

// ── LISIÈRE QUI DIVAGUE (jonction herbe↔ville, RENDU SEUL) ───────────────────
// Cinq tentatives ont échoué sur cette jonction, et toutes DÉCORAIENT la couture
// en ajoutant un élément SOMBRE le long de la ligne : langues crantées à pointe
// sombre ('teeth' → « ça lit comme des tas »), ourlet sombre continu ('hem' →
// « ça n'a rien changé »), bords rongés + gravillons (ROAD_DETAIL.edgeFringe →
// « ça salissait la route »), contour d'un pack de tuiles Wang (→ traînée grise).
// Ce qui a SURVÉCU est d'une autre famille : dégradé de valeur doux (épaulement,
// gorge, ourlet) ou objet posé à cheval (touffes, fleurs).
//
// Le défaut jamais traité n'est pas la décoration : c'est que la frontière est
// une DROITE. urbanSet est un bloc, donc son bord projette une diagonale au
// cordeau, et décorer une droite ne la rend pas naturelle. Ici on ne décore
// rien : on fait SERPENTER la frontière elle-même, en retournant la matière de
// quelques cellules frontalières — une morsure d'herbe dans le pavé, une langue
// de pavé dans l'herbe. Zéro couleur nouvelle, zéro élément sombre, zéro
// primitive en plus : ce sont les deux aplats existants, sur un bord qui n'est
// plus tiré à la règle. Les touffes et les fleurs de la frange suivent
// automatiquement (grassAt lit kindAt) et ont enfin un bord organique à souligner.
//
// ⚠ RENDU SEUL : urbanSet n'est PAS touché. Le placement des bâtiments, les
// routes et le plan continuent de lire l'emprise logique — une cellule rendue en
// herbe reste constructible côté jeu, et surtout aucune maison ne peut se
// retrouver posée sur l'herbe (cf. le garde d'occupation ci-dessous).
//
// Le bruit est LISSÉ sur ~3 cellules (smoothNoise) et UNIQUE pour les deux sens :
// là où il est haut la ville avance, là où il est bas l'herbe mord. La frontière
// ondule donc de façon cohérente au lieu de moucheter au hasard.
// p : part des cellules frontalières retournées de chaque côté.
// Réglage live : __frontier(false) / ({ p, scale, solo }).
const FRONTIER = { on: true, p: 0.3, scale: 3.2, solo: false };
if (typeof window !== 'undefined') {
  window.__frontier = (arg) => {
    if (arg === false) FRONTIER.on = false;
    else if (arg && typeof arg === 'object') { FRONTIER.on = true; Object.assign(FRONTIER, arg); }
    else FRONTIER.on = true;
    CM._isoGroundBake = null;
    return { ...FRONTIER };
  };
}
// Cellules PORTEUSES d'une emprise bâtie, tous types confondus (L.tiles = la
// source du rendu des bâtiments). Sert de garde : on ne rend jamais en herbe une
// cellule qui porte quelque chose. Cuit une fois par layout — le cache meurt avec
// lui puisqu'un recalcul reconstruit l'objet.
function builtCells(L) {
  if (L._builtCells) return L._builtCells;
  const s = new Set();
  for (const t of (L.tiles || [])) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) {
      for (let ay = 0; ay < sy; ay += 1) s.add((t.gx + ax) + ',' + (t.gy + ay));
    }
  }
  L._builtCells = s;
  return s;
}
// Cette cellule frontalière rend-elle la matière de l'AUTRE côté ? Pure et
// exportée : c'est ici que vit le garde qui empêche une maison de se retrouver
// plantée dans l'herbe, et un garde non testé ne protège rien.
// `urbanLogical` lit le LAYOUT (jamais kindAt, qui appelle ceci — l'inverse
// bouclerait) ; `built` = cellules porteuses d'une emprise (cf. builtCells).
export function frontierFlip(gx, gy, isUrban, urbanLogical, built, cfg = FRONTIER) {
  // LE RENDU ET L'EMPRISE DOIVENT CONCORDER. Des cellules sont peintes en sol de
  // ville SANS appartenir à urbanSet : le « quai-lite » pave toute berge qui
  // touche le tissu urbain. Sans ce garde, elles arrivaient ici avec isUrban=true
  // alors qu'urbanLogical répond false ; le test de bord ci-dessous ne pouvait
  // donc jamais les retenir, et le bruit les rendait en herbe — autrement dit il
  // EFFAÇAIT LES QUAIS (régression signalée par Raph). On ne perturbe que les
  // cellules dont la matière rendue vient bien de l'emprise logique.
  if (urbanLogical(gx, gy) !== isUrban) return false;
  // Seules les cellules DE BORD bougent : à l'intérieur des deux matières, rien
  // ne doit changer (sinon on moucheterait la ville et la plaine de taches).
  if (urbanLogical(gx + 1, gy) === isUrban && urbanLogical(gx - 1, gy) === isUrban
    && urbanLogical(gx, gy + 1) === isUrban && urbanLogical(gx, gy - 1) === isUrban) return false;
  // GARDE : une cellule qui porte un bâtiment garde son sol de ville.
  if (isUrban && built.has(gx + ',' + gy)) return false;
  const past = (x, y) => {
    const n = smoothNoise(x, y, cfg.scale, 'front');
    return isUrban ? n < cfg.p : n > 1 - cfg.p;
  };
  if (!past(gx, gy)) return false;
  // Pas de LOSANGE ISOLÉ : un seul retournement au milieu de l'autre matière se
  // lit comme une tache géométrique (l'écueil de toute valeur « par cellule »).
  // On exige qu'un voisin bascule aussi → les retournements viennent par paquets
  // et le bord ondule au lieu de moucheter. Le bruit étant lissé sur ~3 cellules
  // c'est presque toujours vrai : ça ne coupe que les cas isolés.
  if (cfg.solo) return true;
  return past(gx + 1, gy) || past(gx - 1, gy) || past(gx, gy + 1) || past(gx, gy - 1);
}

// ── FRANGE D'HERBE (jonction herbe↔sol) ──────────────────────────────────────
// L'escalier de losanges FRANC entre l'herbe et le sol urbain était la couture la
// plus dure de la carte. Le long de chaque arête partagée herbe/sol, l'herbe MORD
// désormais sur le sol : langues crantées profondes de 1..3 « pixels » d'art
// (pas pu suivant le zoom, comme le tapis d'herbe), pointe assombrie (ourlet
// d'ombre du gazon), trouées pour respirer, et quelques touffes debout à cheval
// sur la lisière. Haché par cellule+arête → stable au rebake, aucun motif répété.
// Ne s'applique QU'AUX sols urbain/terre (les dallages formels — place, parvis —
// gardent leur bord franc voulu) et pas vers l'eau (le fleuve couvre en live).
// Réglage live : __grassFringe(false) / ({depth,gapP,tuftP,flowerP,dark}).
// mode 'none' depuis le 2026-07-20 : la lisière herbe↔sol est un bord FRANC —
// seuls restent les touffes debout et les fleurs (accents validés). Historique
// des retours Raph, ne pas re-proposer sans demande : langues crantées 'teeth'
// (pointes sombres lisaient en « tas »), puis ourlet continu 'hem' (« ça n'a
// rien changé, enlève-le »). Les deux restent en knob — mais `dark` a été mis à
// 0 en même temps : le look 'teeth' HISTORIQUE se rejoue avec
// __grassFringe({mode:'teeth', dark:1}) (sans dark:1, pointes sans ourlet
// d'ombre = un rendu qui n'a jamais existé) ; 'hem' : __grassFringe({mode:'hem'}).
// mode 'wander' (2026-07-22) : on ne DÉCORE plus la couture, on DÉPLACE le bord.
// Les quatre décorations tentées ('teeth', 'hem', edgeFringe, contour d'un pack
// de tuiles) ont toutes été refusées, et toutes ajoutaient un élément SOMBRE le
// long de la ligne. Ici, aucun pixel nouveau : le long de l'arête, le bord est
// repoussé d'un côté ou de l'autre, et on repeint simplement avec la teinte du
// voisin. Là où le décalage est positif l'herbe avance dans le pavé, là où il
// est négatif le pavé avance dans l'herbe. Zéro couleur ajoutée, zéro ombre.
// Le décalage vient d'un bruit LISSÉ échantillonné en coordonnées MONDE (jamais
// par cellule ni par pas) : il est donc continu d'une cellule à l'autre, sinon
// chaque coin de losange rouvrirait une discontinuité — et c'est précisément la
// grille qu'on cherche à faire disparaître.
// wander = amplitude du décalage en « pixels d'art » ; wanderF = finesse (plus
// haut = ondulation plus serrée). Réglé pour onduler à ~1/5 de cellule, l'échelle
// à laquelle le pack trouvé beau ondulait — et non à la cellule entière.
// (Retombée de touffes côté sol ESSAYÉE puis ANNULÉE le 2026-07-28 — « non, ce
// n'est pas ce que j'ai demandé » : Raph voulait la PERSPECTIVE des tuiles
// d'herbe (leur débord de brins passe DEVANT le sol au nord, cf. le blit à
// débord d'ensureIsoTileKey/blitIsoTileKey), pas des brins ajoutés par la
// frange.)
const GRASS_FRINGE = { on: true, mode: 'wander', depth: 1, gapP: 0.14, tuftP: 0.10, flowerP: 0.08, dark: 0, wander: 2.6, wanderF: 12 };
// ── LISERÉ DE NEIGE (hiver seulement) ────────────────────────────────────────
// ── NEIGE D'HIVER : DANS LES TUILES, plus dans le bake procédural ─────────────
// Le liseré blanc de lisière (2026-07-22) et les mottes procédurales (2026-07-28
// matin) ont été SUPPRIMÉS le 2026-07-28 : « ton procédural clignote à chaque
// mouvement de caméra » (Raph) — tout décor du bake qui traverse une frontière
// de cellule se fait rogner aux coutures du DÉFILEMENT INCRÉMENTAL du sol (une
// bande recuite ne redessine pas ce que la cellule d'à côté faisait déborder
// chez elle) → scintillement au pan. La neige vient désormais des TUILES
// D'HIVER (`ISO_TILE_WINTER`) : neige cuite dans l'art, par cellule, donc
// incrémental-sûre par construction. SNOW_TOP/SNOW_SHADE restent : ce sont les
// teintes des FLOCONS de précipitation (isoSnowFlake), qui vivent en live, pas
// dans le bake.
const SNOW_TOP = [251, 250, 244];    // boneWhite — la neige au soleil
const SNOW_SHADE = [170, 176, 184];  // metalSlate — le creux bleuté
const GF_MID = [102, 126, 72];    // herbe légèrement ombrée (varie le corps des langues)
const GF_DARK = [76, 100, 54];    // pointe sombre : l'ourlet d'ombre de la lisière
function drawGrassFringeEdge(ctx, f, pu, soilTone) {
  const dxE = f.bx - f.ax, dyE = f.by - f.ay;
  const len = Math.hypot(dxE, dyE);
  const steps = Math.max(3, Math.round(len / pu));
  const rect = (x, y, col) => { ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.fillRect(x, y, pu, pu); };
  const mode = GRASS_FRINGE.mode;
  if (mode === 'wander' && soilTone) {
    // BORD DÉPLACÉ (cf. l'en-tête du bloc). Densité ×2 comme 'hem' : sur une
    // diagonale 2:1, un pas par pu laisserait l'escalier à jour entre les carrés.
    const D = GRASS_FRINGE.wander * pu;
    const F = GRASS_FRINGE.wanderF;
    const n2 = Math.max(4, Math.ceil(len / pu) * 2);
    for (let i = 0; i < n2; i += 1) {
      const t = (i + 0.5) / n2;
      // Position MONDE du pas (en cellules) → le bruit est continu de cellule en
      // cellule, donc le bord ondule sans se rompre aux coins des losanges.
      const wx = f.wx0 + (f.wx1 - f.wx0) * t, wy = f.wy0 + (f.wy1 - f.wy0) * t;
      const d = (smoothNoise(wx * F, wy * F, 2.5, 'wan') - 0.5) * 2 * D;
      const ex = f.ax + dxE * t, ey = f.ay + dyE * t;
      const n = Math.round(Math.abs(d) / pu);
      // d > 0 : l'herbe mord dans le sol (sens rentrant) ; d < 0 : l'inverse.
      const sgn = d > 0 ? 1 : -1;
      const col = d > 0 ? SEASON_GRASS : soilTone;
      for (let j = 0; j < n; j += 1) {
        const s = (j + 0.5) * pu * sgn;
        rect(Math.round(ex + f.inx * s - pu / 2), Math.round(ey + f.iny * s - pu / 2), col);
      }
      // (Le LISERÉ DE NEIGE d'hiver qui vivait ici a été SUPPRIMÉ le 2026-07-28 —
      // il clignotait au pan avec le défilement incrémental, cf. le bloc NEIGE
      // D'HIVER plus haut. La neige vient des tuiles ISO_TILE_WINTER.)
    }
  }
  if (mode === 'hem') {
    // TRAIT CONTINU : rangée de pixels d'art SANS trouée qui longe l'arête, à
    // cheval côté sol — pas-de-vis en carrés opaques (pas de stroke anti-aliasé,
    // la lisière reste crispe). Densité ×2 pour un escalier plein sur les
    // diagonales 2:1.
    const n2 = Math.ceil(len / pu) * 2;
    for (let i = 0; i < n2; i += 1) {
      const t = (i + 0.5) / n2;
      rect(Math.round(f.ax + dxE * t + f.inx * 0.5 * pu - pu / 2),
        Math.round(f.ay + dyE * t + f.iny * 0.5 * pu - pu / 2), GF_DARK);
    }
  }
  for (let i = 0; i < steps; i += 1) {
    const h = cmHash(f.seed + ':' + i);
    if ((h & 255) / 255 < GRASS_FRINGE.gapP) continue;         // trouée : la lisière respire
    const t = (i + 0.5) / steps;
    const ex = f.ax + dxE * t, ey = f.ay + dyE * t;
    if (mode === 'teeth') {
      const d = Math.max(1, Math.round((1 + ((h >>> 8) % 3)) * GRASS_FRINGE.depth));
      for (let j = 0; j < d; j += 1) {
        const bx = Math.round(ex + f.inx * (j + 0.5) * pu - pu / 2);
        const by = Math.round(ey + f.iny * (j + 0.5) * pu - pu / 2);
        const col = (j === d - 1 && GRASS_FRINGE.dark) ? GF_DARK
          : (((h >> (10 + j)) & 3) === 0 ? GF_MID : SEASON_GRASS);
        rect(bx, by, col);
      }
    }
    // Touffe debout occasionnelle, à cheval sur la lisière : brins sombres à
    // pointe claire (mêmes tons que le tapis d'herbe → aucun accent nouveau).
    if ((h % 997) / 997 < GRASS_FRINGE.tuftP) {
      const nB = 2 + ((h >> 16) & 1);
      const bh = 2 * pu + ((h >> 17) & 1) * pu;
      for (let k = 0; k < nB; k += 1) {
        const bxi = Math.round(ex + (k - (nB - 1) / 2) * (pu + 1));
        const jh = bh - ((h >> (18 + k)) & 1) * pu;
        ctx.fillStyle = `rgb(${GD_BLADE[0]},${GD_BLADE[1]},${GD_BLADE[2]})`;
        ctx.fillRect(bxi, Math.round(ey - jh), pu, jh);   // corps du brin
        rect(bxi, Math.round(ey - jh), SEASON_TIP || GD_TIP);   // pointe claire
      }
    }
  }
  // FLEURS DE LISIÈRE (retour Raph 2026-07-16 : « rajoute des petites fleurs ») :
  // pâquerettes & accents de la palette du tapis (GD_FLOWERS, blanc/jaune
  // dominants), posés à cheval sur la lisière, surtout côté herbe — une
  // guirlande discrète qui souligne le bord. 2e boucle : dessinées APRÈS les
  // langues pour qu'un pas voisin ne rogne pas leurs pétales.
  const fringeFlowerP = GRASS_FRINGE.flowerP * SEASON_FLOWER_MUL;
  if (fringeFlowerP > 0) {
    for (let i = 0; i < steps; i += 1) {
      const hf = cmHash(f.seed + ':fl:' + i);
      if ((hf & 1023) / 1023 >= fringeFlowerP) continue;
      const t = (i + 0.5) / steps;
      const off = (((hf >> 10) & 3) - 2) * pu;          // −2pu (herbe) .. +1pu (langue)
      const cx = Math.round(f.ax + dxE * t + f.inx * off);
      const cy = Math.round(f.ay + dyE * t + f.iny * off);
      const fl = GD_FLOWERS[(hf >>> 12) % GD_FLOWERS.length];   // ⚠ >>> : un >> signé rendait l'index négatif
      rect(cx - pu, cy, fl[0]); rect(cx + pu, cy, fl[0]);
      rect(cx, cy - pu, fl[0]); rect(cx, cy + pu, fl[0]);
      rect(cx, cy, fl[1]);
    }
  }
}
if (typeof window !== 'undefined') {
  // Frange d'herbe : __grassFringe(false) éteint ; ({depth,gapP,tuftP,flowerP,dark})
  // réglage fin ; sans argument = rallume. Rebake immédiat.
  window.__grassFringe = (arg) => {
    if (arg === false) GRASS_FRINGE.on = false;
    else if (arg && typeof arg === 'object') { GRASS_FRINGE.on = true; Object.assign(GRASS_FRINGE, arg); }
    else GRASS_FRINGE.on = true;
    CM._isoGroundBake = null;
    return { ...GRASS_FRINGE };
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
  // Tons 0-1 = ton moyen MESURÉ de ground-earth (lot 606 dé-liseré, imprimé par
  // fetchGroundTiles) : l'aplat de repli doit rester dans la famille de la tuile
  // qui le recouvre, sinon le sol « saute » quand le PNG décode.
  { tone: [187, 135, 82], type: 'earth', grav: 0, tile: 'ground-earth' },               // 0 primitif — terre battue
  { tone: [187, 135, 82], type: 'earth', grav: 1, tile: 'ground-earth' },               // 1 agricole — terre + graviers
  { tone: [170, 156, 130], type: 'cobble', joint: 0.16, tile: 'ground-cobble' },        // 2 bourg — pavés irréguliers
  { tone: [158, 152, 138], type: 'cobble', joint: 0.18, tile: 'ground-cobble' },        // 3 fortifié — pavé de pierre
  { tone: [188, 178, 150], type: 'flagstone', joint: 0.16, tile: 'ground-flagstone' },  // 4 impérial — grandes dalles
  { tone: [192, 186, 168], type: 'flagstone', joint: 0.14, tile: 'ground-flagstone' },  // 5 monumental — pierre claire
  { tone: [162, 160, 154], type: 'concrete', joint: 0.12, tile: 'ground-concrete' },    // 6 mégalopole — béton
  { tone: [94, 100, 116], type: 'tech', seam: [116, 196, 208], tile: 'ground-tech' },   // 7 noosphère — dalles tech
  { tone: [86, 94, 116], type: 'tech', seam: [130, 210, 220], tile: 'ground-tech' },    // 8 stellaire
  { tone: [80, 90, 118], type: 'tech', seam: [150, 224, 232], tile: 'ground-tech' },    // 9 démiurge
];
// tileA/tileJit : DOSAGE de la tuile de matière « terre » — alpha = tileA +
// bruit LISSÉ × tileJit. Historique des retours Raph : tuile PLEINE = tapis
// criard (2026-07-12), alpha haché PAR CELLULE = damier de losanges, plaques
// par bruit lissé = « tas de terre » épars, et même en dose constante à 0.6
// les mottes lisaient encore comme des tas/« pavés de jonction » (2026-07-20).
// VERDICT FINAL 2026-07-20 : le grief était la FORCE de la trame, pas sa
// répartition → dose CONSTANTE ET FAIBLE (0.12 = simple grain qui vit, zéro
// motte lisible ; validé par captures jour/nuit). tileJit reste un knob.
// noiseAmp : VOILE DE NUANCE par bruit lissé — essayé à 0.3, coupé le
// 2026-07-16 (retour Raph : « retire les plaques grises sur le sol ») ; knob.
// tileA 0.12 → 1 (Raph 2026-07-28) : le 0.12 dosait l'ANCIENNE tuile de terre
// unique (historique ci-dessus, conservé) ; les 4 variantes brutes regénérées
// s'affichent pleines, comme les autres matières.
const URBAN_DETAIL = { on: true, mult: 1, band: null, tiles: true, tileA: 1, tileJit: 0, noiseAmp: 0 };   // band≠null = force ère (preview) ; tiles=false → procédural
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
  // force une ère pour l'aperçu ; ({mult,band,tileA,tileJit,noiseAmp}) réglage fin
  // (tileA/tileJit = dose de la trame terre par cellule ; noiseAmp = voile de
  // nuance en plaques lissées). Rebake immédiat.
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
// tiles=true depuis la REGÉNÉRATION des chaussées (Raph 2026-07-28 : « des
// chemins/routes plutôt que cette route à toutes les ères ») : les road-* sont
// désormais des textures PLATES 64×32 × 4 variantes (fetchGroundTiles.mjs), même
// recette que les sols — le « gros motif » qui avait fait couper les tuiles
// venait des anciennes dalles 48×48 rééchantillonnées. Le ruban reste le MÊME
// (géométrie, épaulement, frange) : seul son remplissage change, clippé au tracé.
// shoulderMix/shoulderV : ÉPAULEMENT (le liseré qui cerne la chaussée) = mélange
// sol↔route un peu assombri, au lieu de la route en sombre — la rue s'assoit dans
// le sol de l'ère au lieu d'avoir l'air tamponnée dessus. mix = part de route
// dans le mélange (0..1), v = assombrissement du résultat.
// edgeFringe : FRANGE DE CHAUSSÉE (jonction route↔sol) — multiplicateur global
// du crantage des bords du ruban. ESSAYÉ à 1 puis COUPÉ le 2026-07-16 (retour
// Raph immédiat : « oula non ça ne va pas du tout » — les bords rongés + les
// gravillons salissaient la route). 0 = bords géométriques nets ; reste un knob.
// groove/grooveA : GORGE — fine ombre de contact qui cerne la dalle (largeur en
// fraction de tuile, alpha) → la rue s'assoit DANS le sol (grammaire « route en
// creux » des rues top-down), sans toucher au bord net de la dalle.
// feather/featherA : OURLET — bande de fondu au-delà de l'épaulement (même teinte
// en alpha) → la jonction épaulement→sol n'a plus de 2e arête dure.
// veilK : multiplicateur global du VOILE DE LECTURE (0 = éteint, cf. ROAD_VEIL).
const ROAD_DETAIL = {
  on: true, tiles: true, band: null, shoulderMix: 0.55, shoulderV: 0.92, edgeFringe: 0,
  groove: 0.03, grooveA: 0.28, feather: 0.05, featherA: 0.4, veilK: 1,
};   // band≠null = force ère (preview)
// ── VOILE DE LECTURE de la chaussée (Raph 2026-07-29 : « les routes de cette ère
// ne se distinguent pas assez du sol des maisons ») ───────────────────────────
// Rien ne garantit qu'une ère tire son sol de lot et sa chaussée de deux familles
// différentes, et au BOURG les deux sortent du même gris : `ground-cobble`
// (gravier fin) et `road-cobble` (pavés moussus) ne sont séparés que par 32 de
// distance RGB mesurée sur les PNG — moitié moins que n'importe quel autre
// couple d'ère (80 à 111). À l'échelle du jeu la rue disparaît dans le sol et
// c'est le TROTTOIR, plus clair, qui dessine seul le réseau : la ville lit comme
// une nappe de pavé rayée de liserés crème.
// Le voile est un ton posé sur la chaussée SEULE, en alpha : chaque pierre de la
// tuile reste lisible, mais la rue devient un pavé usé plus sombre et plus chaud
// — exactement la lecture de l'ère impériale (voie brune sur dalles pâles), la
// seule que personne n'a jamais eu de mal à suivre.
// ⚠ Il ne s'applique QUE là où le couple MESURÉ se confond : les bandes 0-1 (80),
// 4-5 (84), 6 (111) et 7-9 (43) lisent déjà — les voiler n'assombrirait qu'une
// ville qui va bien. Garde sur les PNG : __tests__/isoRoadGroundContrast.test.js.
// Cuit DANS la face de tuile (isoFaceVeiled), jamais posé en aplat par cellule :
// un alpha par cellule marquerait les coutures que les passes-union évitent.
const ROAD_VEIL = [
  null, null,
  [58, 42, 30, 0.30],   // 2 bourg — pavé usé, chaud, contre le gravier gris des lots
  [58, 42, 30, 0.30],   // 3 fortifié
  null, null, null, null, null, null,
];
function roadVeilFor(band) {
  if (!(ROAD_DETAIL.veilK > 0)) return null;
  const v = ROAD_VEIL[Math.max(0, Math.min(ROAD_VEIL.length - 1, band | 0))];
  if (!v) return null;
  return ROAD_DETAIL.veilK === 1 ? v : [v[0], v[1], v[2], Math.min(1, v[3] * ROAD_DETAIL.veilK)];
}
// Couple de surfaces d'une ère, tel que le sol le PEINT (aucun forçage d'aperçu).
// Exporté pour la garde de contraste : elle lit les PNG que ces clés désignent —
// recopier les clés dans le test reviendrait à le comparer à lui-même.
export function isoEraSurface(band) {
  const b = Math.max(0, Math.min(URBAN_MATS.length - 1, band | 0));
  return {
    ground: URBAN_MATS[b].tile,
    road: ROAD_MATS[Math.max(0, Math.min(ROAD_MATS.length - 1, b))].tile,
    veil: ROAD_VEIL[Math.max(0, Math.min(ROAD_VEIL.length - 1, b))],
  };
}
// ── FRANGE DE CHAUSSÉE : même grammaire que la lisière d'herbe, entre la dalle
// et son épaulement — l'épaulement MORD sur le bord du ruban par petits blocs
// (1..2 pu, deux tons), et la matière de la route s'égrène en GRAVILLONS épars
// sur l'épaulement. Le bord parfaitement géométrique faisait « route tamponnée » ;
// cranté, il fait chemin qui vit avec son sol. Intensité PAR ÈRE (roadFringeK) :
// terre battue très effrangée → pavé/dalle un peu → asphalte à peine → tech NETTE
// (une voie high-tech aux bords rongés ne se lit pas). Bake seulement, hash par
// arête+pas (stable, continu de cellule en cellule — rien « par cellule »).
function roadFringeK(band) {
  return band >= 7 ? 0 : band >= 6 ? 0.5 : band >= 2 ? 0.75 : 1;
}
function drawRoadEdgeFringe(ctx, seg, pu, biteCol, biteCol2, spillCol, k) {
  const dxE = seg.bx - seg.ax, dyE = seg.by - seg.ay;
  const len = Math.hypot(dxE, dyE);
  if (len < pu * 2) return;
  const steps = Math.max(2, Math.round(len / pu));
  for (let i = 0; i < steps; i += 1) {
    const h = cmHash(seg.seed + ':' + i);
    const t = (i + 0.5) / steps;
    const ex = seg.ax + dxE * t, ey = seg.ay + dyE * t;
    // Morsure de l'épaulement sur la dalle (vers l'INTÉRIEUR du ruban).
    if ((h & 255) / 255 < 0.6 * k) {
      const d = 1 + ((h >>> 8) % 2);
      for (let j = 0; j < d; j += 1) {
        ctx.fillStyle = ((h >>> (10 + j)) & 1) ? biteCol : biteCol2;
        ctx.fillRect(Math.round(ex - seg.ox * (j + 0.5) * pu - pu / 2), Math.round(ey - seg.oy * (j + 0.5) * pu - pu / 2), pu, pu);
      }
    }
    // Gravillons égrenés vers l'EXTÉRIEUR (sur l'épaulement, un peu au-delà).
    if (((h >>> 16) & 255) / 255 < 0.3 * k) {
      const dOut = 1 + ((h >>> 24) & 1);
      ctx.fillStyle = spillCol;
      ctx.fillRect(Math.round(ex + seg.ox * (dOut + 0.2) * pu - pu / 2), Math.round(ey + seg.oy * (dOut + 0.2) * pu - pu / 2), pu, pu);
    }
  }
}
function roadMatFor(band) {
  const b = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
  return ROAD_MATS[Math.max(0, Math.min(ROAD_MATS.length - 1, b | 0))];
}
if (typeof window !== 'undefined') {
  // Molette chaussée : __roadMat(false) off ; ({tiles,band,shoulderMix,shoulderV,
  // groove,grooveA,feather,featherA,edgeFringe,veilK}) réglage fin (shoulder* =
  // teinte de l'épaulement ; groove* = gorge d'ombre au contact de la dalle ;
  // feather* = ourlet de fondu épaulement→sol ; edgeFringe = crantage rejeté, 0 ;
  // veilK = dose du voile de lecture, 0 rend la rue à sa tuile nue). Rebake immédiat.
  window.__roadMat = (arg) => {
    if (arg === false) ROAD_DETAIL.on = false;
    else if (arg && typeof arg === 'object') { ROAD_DETAIL.on = true; Object.assign(ROAD_DETAIL, arg); }
    else ROAD_DETAIL.on = true;
    syncIsoStreetGeom();   // la gorge participe à la géométrie publiée aux agents
    isoTileCache.forEach((e) => { e.veiled = null; });   // veilK repeint les faces voilées
    CM._isoGroundBake = null;
    return { ...ROAD_DETAIL };
  };
}
// ── TROTTOIRS ISO (« un vrai trottoir », Raph 2026-07-16, dès l'ère bourg) ────
// Sur les cellules-route URBAINES à band ≥ minBand, l'épaulement+ourlet de
// terre cède la place à un trottoir CONSTRUIT : BORDURE claire le long de la
// dalle (la gorge d'ombre reste entre les deux = caniveau), BANDE de dalles
// claires (ton urbain de l'ère éclairci → chaque ère a son trottoir), JOINTS
// transversaux discrets espacés en coordonnées MONDE (continus de cellule en
// cellule), et LISERÉ de joint sombre au raccord avec le sol — un trottoir est
// bâti : bord extérieur NET, pas de fondu. Les routes de campagne (hors
// urbanSet) gardent épaulement + ourlet. Tout en passes-union, rien par cellule.
// Réglage live : __sidewalkIso(false | { minBand, w, curb, joint, slabs, slabA,
// lightK, curbK, jointK }).
const SIDEWALK_ISO = {
  on: true, minBand: 2,
  w: 0.22,        // largeur totale bordure+trottoir (fraction de tuile, depuis la dalle) — 0.18→0.22 avec la chaussée 0.25 (« trottoirs plus larges »)
  curb: 0.03,     // largeur de la bordure claire
  joint: 0.02,    // liseré de joint au raccord trottoir→sol
  slabs: 0.4,     // espacement MONDE des joints transversaux (fraction de tuile)
  slabA: 0.12,    // alpha des joints transversaux (0 = trottoir lisse)
  lightK: 1.10, curbK: 1.12, jointK: 0.78,   // tons dérivés du sol urbain de l'ère
};
// GÉOMÉTRIE DE RUE publiée aux AGENTS (agents.js ne peut pas importer ce module :
// import inverse). Les piétons et véhicules marchent/roulent sur la géométrie que
// le renderer DESSINE — une seule source de vérité, resynchronisée quand une
// molette change la rue. En tuiles (fractions), consommé quand CM.iso est actif :
//   isoVehLane      — centre de voie = demi-chaussée / 2 (conduite à droite) ;
//   isoPedEdge      — milieu de la bande de trottoir (ères à trottoir) ;
//   isoPedEdgeLow   — ligne d'accotement (ères de terre, avant les trottoirs) ;
//   isoPedSpread    — demi-étalement PERSONNEL des piétons dans la bande ;
//   isoSidewalkMinBand — première ère à trottoir.
function syncIsoStreetGeom() {
  const bandW = SIDEWALK_ISO.w - ROAD_DETAIL.groove - SIDEWALK_ISO.curb;   // largeur visible de la bande
  CM.isoVehLane = ROAD_BAND / 2;
  CM.isoPedEdge = ROAD_BAND + ROAD_DETAIL.groove + SIDEWALK_ISO.curb + bandW / 2;
  CM.isoPedEdgeLow = ROAD_BAND + 0.09;
  CM.isoPedSpread = Math.max(0, bandW * 0.3);
  CM.isoSidewalkMinBand = SIDEWALK_ISO.minBand;
  // Variantes PAR RANG (hiérarchie des largeurs) : les agents regardent d'abord
  // le rang de LEUR cellule, et retombent sur les scalaires ci-dessus (rang
  // inconnu, hors-route, saves d'avant la hiérarchie).
  CM.isoVehLaneByRank = {};
  CM.isoPedEdgeByRank = {};
  CM.isoPedEdgeLowByRank = {};
  for (const rk of Object.keys(ISO_ROAD_HALFW)) {
    const w = ISO_ROAD_HALFW[rk];
    CM.isoVehLaneByRank[rk] = w / 2;
    CM.isoPedEdgeByRank[rk] = w + ROAD_DETAIL.groove + SIDEWALK_ISO.curb + bandW / 2;
    CM.isoPedEdgeLowByRank[rk] = w + 0.09;
  }
}
syncIsoStreetGeom();
if (typeof window !== 'undefined') {
  window.__sidewalkIso = (arg) => {
    if (arg === false) SIDEWALK_ISO.on = false;
    else if (arg && typeof arg === 'object') { SIDEWALK_ISO.on = true; Object.assign(SIDEWALK_ISO, arg); }
    else SIDEWALK_ISO.on = true;
    syncIsoStreetGeom();
    CM._isoGroundBake = null;
    return { ...SIDEWALK_ISO };
  };
}

// ── PARVIS DES MERVEILLES : sol dédié de l'emprise (L.wonderGround) ───────────
// Demande Raph 2026-07-13 : la grande zone réservée d'une merveille (dès le
// rang I) doit se LIRE comme une PLACE, pas comme du sol urbain ordinaire — et
// le monument trône en son CENTRE (emprise carrée, cf. cmWonderExtent).
// Base = TUILE `iso-wonder` (MOSAÏQUE ocre et blanche, 4 variantes égalisées)
// posée à plat sur l'aplat de repli. Sur tout le POURTOUR, marche d'ombre +
// MARGELLE claire (arêtes dont le voisin n'est pas du parvis).
// Réglage live : __wonderGround({ tone, pave, joint, rim, tileAlpha }) / (false).
//
// ⚠ TROIS MOTIFS AU PAS DE LA CELLULE RETIRÉS le 2026-07-24 (retour Raph :
// « l'effet carré des plaques au sol »). Le parvis cumulait un damier ±5 % par
// cellule, un joint le long de deux arêtes de CHAQUE losange, et la tuile
// iso-plaza (quatre grandes dalles dessinées) reblittée par cellule avec un
// miroir un coup sur deux. Trois périodes égales à celle de la grille : l'œil
// ne lisait pas un dallage mais des plaques, parce qu'une cellule vaut un LOT
// DE MAISON et qu'un pavé de cette taille n'existe pas.
//
// LA TUILE EST RALLUMÉE le 2026-07-28 (tileAlpha 0 → 1, Raph : « je veux une
// génération pixel lab »), et le grief ci-dessus est traité, pas contourné :
//   • ce n'étaient pas LES tuiles qui plaquaient, c'était CELLE-LÀ — iso-plaza
//     dessinait quatre grandes dalles avec leur liseré, un objet de la taille
//     d'une cellule, donc une période égale à la grille ;
//   • la mosaïque est une texture de TESSELLES (période ~1/16 de cellule) ;
//   • ses 4 variantes sont ÉGALISÉES par canal au fetch (écart de luminance
//     ramené de 8,9 à 0,0) : ce qui change d'une cellule à l'autre est le
//     dessin seul, jamais la valeur — la règle du fichier, à la lettre ;
//   • et ce qui reste de période cellulaire se lit comme un PANNEAU de mosaïque,
//     ce dont un sol d'apparat antique est fait. Vérifié au pan 7×7 avant de
//     câbler (scripts/tilePan.mjs) : c'est LE test du parvis, seul sol du jeu à
//     couvrir un carré plein. Les trois autres matières du lot y ont échoué —
//     le détail des quatre verdicts est dans scripts/fetchGroundTiles.mjs.
//
// `pave`/`joint` : le DALLAGE PROCÉDURAL (drawWonderPaving) est coupé par défaut
// depuis que l'art porte ses propres joints — deux appareillages superposés
// faisaient une trame double. Le tracé reste, `joint` le rallume.
export const WONDER_GROUND = { on: true, tone: [227, 206, 176], pave: 4, joint: 0, rim: 1.10, tileAlpha: 1 };
// DALLAGE : joints d'un appareillage posé dans le repère MONDE, au pas TILE/pave,
// À JOINTS DÉCALÉS (une rangée sur deux glisse d'une demi-dalle). Le décalage est
// ce qui compte : sans lui les joints de bout se réalignent en maille croisée et
// on retombe sur un quadrillage, juste plus fin.
//
// Tout tient DANS le losange de la cellule (les indices de dalle sont absolus,
// `pave` divise la cellule) : pas de clip, coût borné à pave + pave² segments par
// cellule, et le motif ne glisse pas d'un pan à l'autre. Les rangs `dk` et les
// joints `dj` s'arrêtent à div-1 : l'arête SO et l'arête SE appartiennent à la
// cellule suivante, qui trace les siens — chaque joint interne est tracé une fois
// et les lignes se raboutent d'une cellule à l'autre.
export function drawWonderPaving(ctx, gx, gy, px, py, hw, hh) {
  const div = WONDER_GROUND.pave | 0;
  if (div < 1 || !(WONDER_GROUND.joint > 0)) return;
  // Trop loin : sous ~5 px la dalle, la trame vire au gris sale — on rend
  // l'aplat nu, comme le bake allégé rend le sol sans ses détails fins.
  if ((hw * 2) / div < 5) return;
  const ex = hw / div, ey = hh / div;        // pas d'UNE dalle en x monde, projeté
  const sx = (dj, dk) => px + (dj - dk) * ex;
  const sy = (dj, dk) => py + (dj + dk) * ey;
  ctx.beginPath();
  for (let dk = 0; dk < div; dk += 1) {
    // RANG : joint long, continu d'une cellule à la suivante.
    ctx.moveTo(sx(0, dk), sy(0, dk));
    ctx.lineTo(sx(div, dk), sy(div, dk));
    // JOINTS DE BOUT du rang, décalés d'une demi-dalle un rang sur deux. L'indice
    // ABSOLU du rang décide (gy * div + dk), sinon le décalage se remettrait à
    // zéro à chaque cellule et redessinerait la grille qu'on retire.
    const off = ((gy * div + dk) & 1) ? 0.5 : 0;
    for (let dj = 0; dj < div; dj += 1) {
      const a = dj + off;
      ctx.moveTo(sx(a, dk), sy(a, dk));
      ctx.lineTo(sx(a, dk + 1), sy(a, dk + 1));
    }
  }
  ctx.strokeStyle = rgb(WONDER_GROUND.tone, 1 - WONDER_GROUND.joint);
  ctx.lineWidth = Math.max(1, Math.round((hw * 2) / div * 0.045));
  ctx.stroke();
}
function drawWonderGroundDetail(ctx, gx, gy, px, py, hw, hh, wg) {
  const shade = (f) => rgb(WONDER_GROUND.tone, f);
  const N = [px, py], E = [px + hw, py + hh], S = [px, py + hh * 2], W = [px - hw, py + hh];
  const seg = (a, b, style, lw) => { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
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
  // Le RANG entre dans la clé de mémoïsation : __showWonder(id, rang) change
  // l'emprise sans recalculer le plan, et le cache renvoyait l'ancienne taille.
  const sig = (CM.layoutRecomputeAt || 0) + ':' + pv.id + ':' + pv.tier;
  const cache = CM._pvWonderGround;
  if (cache && cache.sig === sig) return cache.set;
  const set = new Set(L.wonderGround || []);
  const wi = CM_WONDERS.findIndex((w) => w.id === pv.id);
  if (wi >= 0 && pv.id !== 'era_mega' && L.gridN) {
    const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
    cmForEachWonderCell(slot, pv.id, L.gridN, (gx, gy, k) => set.add(k), pv.tier);
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
// BAKE ALLÉGÉ (posé par drawIsoWorld le temps d'un geste) : on garde ce qui porte
// la LECTURE de la carte (aplats de sol, rubans de chaussée, marquages) et on saute
// les détails fins — touffes/fleurs/prés, frange d'herbe, textures de tuiles, trame
// de matière urbaine + voile, joints de trottoir, frange de chaussée. ~4× moins
// cher (ils pèsent ~75 % de la recuisson) → un pan hors marge tient en ~1 frame au
// lieu de figer. Le bake plein reprend la main dès l'arrêt (~160 ms).
// DEUX niveaux d'allégé (2026-07-27, retour Raph « sol tout blanc quand la
// caméra bouge ») :
//   - HARD (l'historique) : ni textures ni voiles ni détails — l'aplat. Réservé
//     aux machines où même le light ne tient pas le budget.
//   - LIGHT : garde les TEXTURES de tuiles (urbain/routes/terre) et les VOILES
//     de nuance/prés — ce qui tue l'aplat — et ne sacrifie que les détails fins
//     par cellule (touffes/fleurs, frange d'herbe, joints de trottoir, flancs
//     de chaussée), mesurés comme le vrai gros du coût (herbe 25 ms + frange
//     22,5 ms sur 108 ms à zoom 0,35).
const ISO_GROUND_LOD = { on: false, light: false };
function drawIsoGround() {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const LOD = ISO_GROUND_LOD.on;
  // HARD = l'allégé historique ; en light, les gates marqués !HARD restent actifs.
  const HARD = LOD && !ISO_GROUND_LOD.light;
  const hw = T * z * ISO_X;            // demi-largeur du losange
  const hh = T * z * ISO_Y;            // demi-hauteur
  const b = visibleCellBounds(hw * 2);
  // Profileur opt-in (globalThis.__isoGroundProfile = true) — même idiome que
  // __layoutProfile : coût nul éteint, phases en ms dans __isoGroundProfileLast.
  const PR = globalThis.__isoGroundProfile
    ? { n: 0, flat: 0, tiles: 0, grass: 0, cells: 0, fringe: 0, roads: 0, median: 0, total: 0, t0: performance.now() }
    : null;
  const band = (L.counts && L.counts.eraBand) | 0;
  const mat = urbanMatFor(band), urb = mat.tone;
  const road = roadTone(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band);   // honore le forçage d'aperçu
  const riverCells = (L.river && L.river.present && L.river.cells) || null;
  const roadMap = L.roadMap;
  const roads = [];                    // cellules-route de la passe (rubans après le fond)
  const fringes = [];                  // arêtes herbe↔sol de la passe (frange après le fond)
  const wonderCells = [];              // (gx, gy, px, py) du parvis — dallage + margelle après le fond
  const wg = WONDER_GROUND.on ? wonderGroundSet(L) : null;   // parvis des merveilles
  // Résolution du TYPE de sol par cellule, MÉMOÏSÉE : le même verdict sert au
  // fond ET aux tests de voisinage de la frange d'herbe (aucune divergence
  // possible). kind = tuile PixelLab ; le ton d'aplat s'en déduit. L'EAU n'est
  // pas peinte ici : le fleuve est un RUBAN LIVE lissé par-dessus le bake
  // (drawIsoRiver) — le sol sous l'eau reste de l'herbe (berges douces).
  // Quand la SCÈNE de place de l'ère est décodée, la dalle claire disparaît
  // (la scène porte son propre dallage — l'ancienne dalle dépassait autour,
  // retour Raph) : les cellules plaza redeviennent du sol urbain calme.
  // En place COMPOSÉE (mode par défaut) il n'y a plus d'image qui porte le
  // dallage : la dalle de sol redevient l'esplanade, et le mobilier se pose
  // dessus. D'où le test sur le MODE, pas seulement sur le décodage du PNG.
  const plazaEra = plazaEraForBand(band);
  const plazaSceneReady = !!(plazaEra && isoPlazaSceneCoversGround(band) && isoArt('plaza-' + plazaEra).ready);
  // ⚠ MESURÉ, NE PAS « OPTIMISER » : cette Map est reconstruite à chaque
  // recuisson, donc à chaque cran de zoom, alors que le verdict de kindAt ne
  // dépend NI du zoom NI de la caméra (seulement du layout, du décodage du sprite
  // de place, de l'aperçu de merveille et des molettes __wonderGround/__frontier).
  // La mettre en cache sur l'objet layout — même geste que builtCells(L) juste
  // au-dessus — a été implémenté puis RETIRÉ le 2026-07-24 : cache vérifié
  // effectivement réutilisé (même objet, 27 252 cellules, signature stable sur 4
  // recuissons) et le temps n'a PAS bougé (2326 / 2116 / 1650 / 1971 ms). A/B
  // alterné dans les deux sens : 2029 contre 2066 ms.
  // Le coût de cette boucle est la RASTÉRISATION des losanges (aplat + liseré
  // anti-couture par cellule), pas la classification. Même conclusion que pour les
  // quais : sur cette carte, ce qui coûte est toujours le tracé, jamais le JS.
  const kinds = new Map();
  // ── Décision de la LISIÈRE QUI DIVAGUE, déclarée AVANT kindAt qui l'appelle.
  // (Un const déclaré après son appelant marche tant que l'appel est différé,
  // mais c'est le motif exact qui a déjà produit un TDZ en production ici : on
  // ne le rejoue pas.) Ne lit QUE le layout, jamais kindAt — kindAt l'appelle,
  // l'inverse bouclerait.
  const urbanLogical = (gx, gy) => !!(L.urbanSet && L.urbanSet.has(gx + ',' + gy));
  const built = builtCells(L);
  const frontierFlips = (gx, gy, isUrban) => frontierFlip(gx, gy, isUrban, urbanLogical, built);
  const kindAt = (gx, gy) => {
    const key = gx + ',' + gy;
    const hit = kinds.get(key);
    if (hit !== undefined) return hit;
    let k;
    const isRoad = L.roadSet.has(key);
    const cell = isRoad && roadMap ? roadMap.get(key) : null;
    const isWater = !!(riverCells && riverCells.has(key));
    if (cell && cell.rank === 'plaza') k = plazaSceneReady ? 'urban' : 'plaza';   // ⚠ piège places-dans-roadSet
    // Parvis de merveille : l'emprise réservée porte son dallage propre (l'eau
    // garde la priorité — le ruban du fleuve passe dessus, berges douces).
    else if (!isWater && wg && wg.has(key)) k = 'wonder';
    // Routes HORS tissu urbain : fond d'HERBE depuis le 2026-07-20 (retour Raph :
    // le fond de cellule 'dirt' — aplat terre + tuile de mottes — dépassait du
    // ruban en « pavé de terre » cranté à la jonction herbe↔sol). Le chemin se
    // lit par sa dalle + ourlet/épaulement CONTINUS ; le kind 'dirt' n'est plus
    // produit mais sa plomberie (texAlpha/fringe) reste, knob de retour facile.
    else if (!isWater && L.urbanSet && L.urbanSet.has(key)) {
      k = 'urban';
    } else if (!isWater && riverCells && L.river.banks && L.river.banks.has(key) && L.urbanSet
      && (L.urbanSet.has((gx + 1) + ',' + gy) || L.urbanSet.has((gx - 1) + ',' + gy)
        || L.urbanSet.has(gx + ',' + (gy + 1)) || L.urbanSet.has(gx + ',' + (gy - 1)))) {
      // QUAI-LITE : une berge qui touche le tissu urbain se pave (berge bâtie) —
      // esquisse des quais legacy ; le vrai quai par ère viendra avec l'art Phase 5.
      k = 'urban';
    } else k = 'grass';   // teinte UNIFORME (couture in-grid/sauvage retirée)
    // LISIÈRE QUI DIVAGUE : la frontière ville↔campagne serpente au lieu de
    // suivre l'emprise au cordeau (cf. FRONTIER). Retour de matière SEULEMENT :
    // ni route, ni eau, ni dallage formel, et jamais une cellule bâtie.
    if (FRONTIER.on && !isRoad && !isWater && (k === 'urban' || k === 'grass')) {
      if (frontierFlips(gx, gy, k === 'urban')) k = k === 'urban' ? 'grass' : 'urban';
    }
    kinds.set(key, k);
    return k;
  };
  // Voisin d'herbe « frangeable » : de l'herbe FERME — pas une cellule d'eau
  // (peinte herbe mais recouverte en live par le ruban du fleuve : une frange
  // là-dessous ressortirait sur les quais).
  const grassAt = (gx, gy) => kindAt(gx, gy) === 'grass' && !(riverCells && riverCells.has(gx + ',' + gy));
  // VOILES D'HERBE REMISÉS PAR PALIER D'ALPHA. Les deux voiles (prés clair/foncé,
  // ombre sauvage) faisaient un fill de losange PAR cellule d'herbe : jusqu'à 2 ×
  // ~9 000 fills = 57 % de la recuisson (mesuré). On accumule les losanges par
  // (famille, alpha quantifié au 1/256) et on les vide en fills d'UNION par
  // paquets → une poignée de fills. Losanges DISJOINTS → l'union nonzero rend
  // identique (aucun double-alpha), et le pas d'alpha 1/256 est sous le seuil
  // perceptible sur un voile à alpha ≤ 0,1.
  const VEIL_COL = [[24, 38, 16], [214, 226, 150], [26, 36, 18]];
  const veil = [new Map(), new Map(), new Map()];
  const grassCells = [];               // (gx, gy, px, py) à plat — fleurs différées
  const veilPush = (fam, a, px, py) => {
    const q = Math.min(255, Math.max(1, Math.round(a * 255)));
    const m = veil[fam];
    const arr = m.get(q);
    if (arr) arr.push(px, py); else m.set(q, [px, py]);
  };
  const flushVeils = () => {
    for (let f = 0; f < 3; f += 1) {
      const c = VEIL_COL[f];
      for (const [q, arr] of veil[f]) {
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(q / 255).toFixed(3)})`;
        let n = 0;
        ctx.beginPath();
        for (let i = 0; i < arr.length; i += 2) {
          diamondPath(ctx, arr[i], arr[i + 1], hw, hh);
          n += 1;
          if (n >= 256) { ctx.fill(); ctx.beginPath(); n = 0; }   // bbox locale (cf. joints)
        }
        if (n) ctx.fill();
      }
    }
  };
  ctx.save();
  ctx.lineJoin = 'round';
  // FOND D'HERBE UNIQUE : l'herbe (l'écrasante majorité des cellules — toute la
  // plaine hors ville) n'est plus remplie losange par losange mais en UN fillRect
  // sous tout le viewport (les bornes b projettent toujours un sur-ensemble de
  // l'écran, cf. visibleCellBounds). Les cellules d'herbe sautent leur aplat
  // par cellule ; un fond continu n'a par construction AUCUNE couture entre
  // cellules d'herbe, et les sols urbains repeignent par-dessus (leur liseré
  // anti-couture inchangé). L'eau reste peinte herbe (berges douces, cf. kindAt).
  ctx.fillStyle = rgb(SEASON_GRASS, 1);
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  const tLoop = PR && performance.now();
  // ── CULL ÉCRAN PAR CELLULE ────────────────────────────────────────────────
  // visibleCellBounds rend un RECTANGLE de grille (gx0..gx1, gy0..gy1) : la boîte
  // englobante des 4 coins d'écran projetés en monde. Or en isométrique, un écran
  // rectangulaire se projette en LOSANGE — la boîte englobante d'un losange fait
  // le double de son aire. Compté directement : 49 à 51 % des cellules parcourues
  // sont ENTIÈREMENT hors écran, à tous les zooms (2 006 visibles sur 3 969 à
  // zoom 1 ; 12 124 sur 24 649 à zoom 0,4). La moitié de la recuisson — le poste
  // le plus cher de la carte — était dépensée à classer, remplir et border des
  // losanges que personne ne peut voir.
  // Le test est un rejet précoce, avant kindAt et tout tracé.
  // ⚠ Marge d'une cellule pleine : le losange pend SOUS son coin nord (2*hh) et
  // les tuiles/touffes débordent un peu. Trop serré, on raboterait le bord.
  // A/B : globalThis.__isoCellCull = false rejoue le balayage complet.
  const cullPadX = hw * 2, cullPadY = hh * 4;
  const cullOn = globalThis.__isoCellCull !== false;
  for (let gy = b.gy0; gy <= b.gy1; gy += 1) {
    for (let gx = b.gx0; gx <= b.gx1; gx += 1) {
      const p = worldToScreen(gx * T, gy * T);   // coin NORD du losange
      if (cullOn && (p.x < -cullPadX || p.x > CM.cw + cullPadX
        || p.y < -cullPadY || p.y > CM.ch + cullPadY)) continue;
      // Recuisson en BANDE (tranche horizontale ou bande verticale du
      // défilement) : seules les cellules de la bande travaillent — le clip
      // garantit les pixels, ce test évite le calcul.
      if (ISO_GROUND_SLICE.on) {
        if (ISO_GROUND_SLICE.yOn && (p.y < ISO_GROUND_SLICE.y0 - ISO_GROUND_SLICE.padTop
          || p.y > ISO_GROUND_SLICE.y1 + ISO_GROUND_SLICE.padBot)) continue;
        if (ISO_GROUND_SLICE.xOn && (p.x < ISO_GROUND_SLICE.x0 - ISO_GROUND_SLICE.padX
          || p.x > ISO_GROUND_SLICE.x1 + ISO_GROUND_SLICE.padX)) continue;
      }
      if (PR) PR.n += 1;
      const key = gx + ',' + gy;
      const isRoad = L.roadSet.has(key);
      const cell = isRoad && roadMap ? roadMap.get(key) : null;
      const isPlaza = !!(cell && cell.rank === 'plaza');       // ⚠ piège places-dans-roadSet
      const isBridge = !!(cell && cell.roadSurface === 'bridge');
      const isWater = !!(riverCells && riverCells.has(key));
      const kind = kindAt(gx, gy);
      const tone = kind === 'plaza' ? PLAZA : kind === 'wonder' ? WONDER_GROUND.tone
        : kind === 'grass' ? SEASON_GRASS : urb;
      // UN hash par cellule pour les deux tirages : le miroir (bit 3) et la
      // variante de tuile (bits 5-6, cf. isoVariantKey). Deux cmHash séparés ne
      // coûteraient rien de plus qu'ils ne rapporteraient — mêmes bits, même
      // grille — et ce bake balaie jusqu'à ~9 000 cellules d'herbe.
      const cellH = cmHash(key);
      const mir = ((cellH >>> 3) & 1) === 1;
      // Dosage par matière : l'URBAIN reste un aplat CALME avec un simple GRAIN de
      // texture (alpha faible) — la tuile pleine tapissait la ville d'un motif
      // fissuré qui concurrençait les bâtiments (v2 refusée à la capture). Herbe
      // et place gardent leur tuile pleine (elles portent bien le détail).
      // Urbain : plus de tuile générique (0) — la MATIÈRE par ère (drawUrbanDetail)
      // porte tout le détail. dirt garde son grain, place/parvis/reste leur tuile
      // pleine. Parvis : tileAlpha 1 depuis qu'il a SA matière (iso-wonder) au
      // lieu d'emprunter iso-plaza — cf. WONDER_GROUND pour le pourquoi du retour.
      // dirt 0.5 → 1 (Raph 2026-07-28, même décision que l'herbe) : la tuile de
      // terre regénérée se montre pleine, le voile date de l'ancienne tuile unique.
      const texAlpha = kind === 'urban' ? 0
        : kind === 'wonder' ? WONDER_GROUND.tileAlpha
          : kind === 'grass' ? GRASS_DETAIL.tileAlpha : 1;
      const tile = (kind && !HARD) ? ensureIsoTile(kind) : null;
      const tileReady = !!(tile && tile.ready);
      if (kind !== 'grass' && (!tileReady || texAlpha < 1)) {
        const tF = PR && performance.now();
        // Aplat STRICTEMENT UNI (v=1) pour TOUS les sols : le jitter par cellule,
        // même ±3 %, ressortait en damier de losanges (« il reste des plaques »,
        // Raph 2026-07-16 — même écueil que l'herbe jadis : toute variation par
        // CELLULE montre la grille). La vie vient de motifs CONTINUS (trame de
        // cailloux à densité lissée, frange, fleurs), jamais d'un ton par cellule.
        // PLUS D'EXCEPTION : le parvis portait un damier 2 teintes indexé sur
        // (gx+gy)&1 — un dallage VOULU, mais dessiné au pas de la cellule, donc
        // exactement la faute que le reste du paragraphe interdit. Retiré le
        // 2026-07-24 ; le dallage se lit maintenant aux joints de drawWonderPaving.
        ctx.fillStyle = rgb(tone, 1);
        diamondPath(ctx, p.x, p.y, hw, hh);
        ctx.fill();
        // Anti-couture : fin liseré de la même couleur par-dessus les bords partagés.
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
        // (Usure éparse RETIRÉE le 2026-07-16 — les ellipses sombres, quasi
        // invisibles sous la trame pleine, ressortaient en « plaques grises »
        // depuis que la trame terre est dosée. Retour Raph : les retirer.)
        if (PR) PR.flat += performance.now() - tF;
      }
      // `texAlpha > 0` : à 0 le blit ne peindrait rien mais coûterait plein pot.
      // Le MIROIR était refusé au parvis tant qu'il empruntait iso-plaza : le flip
      // un coup sur deux cassait NET au bord de cellule, parce que le motif était
      // un objet centré (quatre grandes dalles) dont le miroir déplaçait le
      // liseré. Rendu à sa propre matière — une texture continue de petits
      // carreaux, cf. WONDER_GROUND — le parvis reprend le miroir comme toutes
      // les autres : c'est lui qui casse la répétition des 3 variantes.
      if (tileReady && texAlpha > 0) {
        const tT = PR && performance.now();
        // Herbe : aplat d'OMBRE sous la tuile — ses creux (noFill) doivent lire
        // sombre, pas laisser voir le fond olive du bake. Uniforme (aucune
        // valeur par cellule), même geste anti-couture que l'aplat urbain.
        if (kind === 'grass') {
          ctx.fillStyle = rgb(CM.season === WINTER ? GRASS_TILE_UNDER_WINTER : GRASS_TILE_UNDER, 1);
          diamondPath(ctx, p.x, p.y, hw, hh);
          ctx.fill();
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (texAlpha < 1) ctx.globalAlpha = texAlpha;
        blitIsoTile(ctx, kind, p.x, p.y, hw, mir, cellH);
        if (texAlpha < 1) ctx.globalAlpha = 1;
        if (PR) PR.tiles += performance.now() - tT;
      }
      // Herbe : variation de prairie + tapis vivant (touffes/speckle/fleurs) PAR-DESSUS
      // la base. La variation est INDÉPENDANTE de la grille (fini la couture dure
      // in-grid↔sauvage révélée en calmant la tuile) : plaques douces via un hash de
      // bloc ~4 cellules, biaisé clair (nz²) → alpha faible, pas de bord franc.
      if (kind === 'grass' && !HARD) {
        const tG = PR && performance.now();
        // PRÉS (meadow) : plaques lentes foncé/clair par bruit LISSÉ — aucune
        // couture (ni maillage par cellule ni bord de bloc). Foncé = herbe
        // grasse, clair = herbe sèche. __grassDetail({ meadow: 0 }) pour couper.
        // Les deux voiles ne sont PAS peints ici : un fill de losange par cellule
        // d'herbe (jusqu'à 2 × ~9 000) pesait 57 % de la recuisson. On les REMISE
        // par PALIER D'ALPHA (cf. veilBuckets) → une poignée de fills d'union en
        // fin de passe, même rendu (losanges disjoints, alpha quantifié au 1/256
        // — sous le seuil perceptible sur un voile à alpha ≤ 0,1).
        if (GRASS_DETAIL.meadow > 0) {
          const nzm = smoothNoise(gx, gy, 6, 'mead2') - 0.5;
          const am = Math.abs(nzm) * GRASS_DETAIL.meadow;
          // Seuil sur `am` pour les DEUX (le clair sortait déjà à am*0.8) : gate inchangé.
          if (am > 0.012) veilPush(nzm < 0 ? 0 : 1, nzm < 0 ? am : am * 0.8, p.x, p.y);
        }
        if (GRASS_DETAIL.wildShade > 0) {
          const nz = (cmHash('mead:' + (gx >> 2) + ':' + (gy >> 2)) % 100) / 100;
          const a = GRASS_DETAIL.wildShade * nz * nz;
          if (a > 0.015) veilPush(2, a, p.x, p.y);
        }
        // Le tapis vivant (touffes/speckle/fleurs) reste réservé au bake PLEIN :
        // c'est le poste cher de l'herbe — le light garde prés et ombrage.
        if (GRASS_DETAIL.on && !LOD) grassCells.push(gx, gy, p.x, p.y);   // fleurs après les voiles
        if (PR) PR.grass += performance.now() - tG;
      }
      // Sol urbain : tuile PixelLab de l'ère (par-dessus l'aplat, miroir anti-répétition)
      // si le PNG est prêt ; sinon repli sur le motif procédural (joints/cailloux).
      // TERRE BATTUE : la tuile posée PLEINE sur chaque cellule tapissait la ville
      // d'une trame de cailloux répétée — on la DOSE en alpha (tileA), CONSTANT
      // par défaut (retour Raph 2026-07-20 : « continu et pas haché » — les
      // plaques par bruit lissé lisaient comme des tas de terre épars).
      if (kind === 'urban' && URBAN_DETAIL.on && !HARD) {
        let drew = false;
        if (URBAN_DETAIL.tiles && mat.tile) {
          if (mat.type === 'earth') {
            // tileJit reste un knob : s'il est ≠ 0, la modulation repasse par le
            // bruit LISSÉ (voisines quasi égales → jamais de damier par cellule).
            ctx.globalAlpha = Math.min(1, URBAN_DETAIL.tileA
              + (URBAN_DETAIL.tileJit ? smoothNoise(gx, gy, 4, 'peb') * URBAN_DETAIL.tileJit : 0));
            drew = blitIsoTileKey(ctx, mat.tile, p.x, p.y, hw, mir, cellH);
            ctx.globalAlpha = 1;
          } else {
            drew = blitIsoTileKey(ctx, mat.tile, p.x, p.y, hw, mir, cellH);
          }
        }
        if (!drew) drawUrbanDetail(ctx, gx, gy, p.x, p.y, hw, hh, mat);
      }
      // VOILE DE NUANCE (sols urbain/terre) : plaques lentes foncé/clair par
      // bruit lissé, PAR-DESSUS aplat ET trame (sous une tuile opaque il serait
      // invisible) — la grande nappe de terre n'est plus un aplat monotone.
      // __groundMat({ noiseAmp: 0 }) pour couper.
      if ((kind === 'urban' || kind === 'dirt') && URBAN_DETAIL.noiseAmp > 0 && !HARD) {
        const nzv = smoothNoise(gx, gy, 5, 'veil') - 0.5;
        const av = Math.abs(nzv) * URBAN_DETAIL.noiseAmp;
        if (av > 0.012) {
          ctx.fillStyle = nzv < 0 ? `rgba(52,40,26,${av.toFixed(3)})` : `rgba(255,240,212,${(av * 0.85).toFixed(3)})`;
          diamondPath(ctx, p.x, p.y, hw, hh);
          ctx.fill();
        }
      }
      // Parvis : dallage + margelle DIFFÉRÉS après le fond, même raison que la
      // frange d'herbe — les deux mordent sur des arêtes partagées, et la cellule
      // voisine peinte plus tard repasse son liseré anti-couture dessus. Tracés
      // dans la boucle, la moitié des joints internes survivait selon l'ordre de
      // balayage (une lacune qui se lit comme un défaut de dallage).
      if (kind === 'wonder') wonderCells.push(gx, gy, p.x, p.y);
      // Frange d'herbe : mémorise chaque arête sol↔herbe de cette cellule — la
      // frange se dessine APRÈS le fond (elle mord sur des voisins déjà peints,
      // quel que soit l'ordre de balayage). Sols urbain/terre seulement : les
      // dallages formels (place, parvis) gardent leur bord franc voulu.
      if (GRASS_FRINGE.on && !LOD && (kind === 'urban' || kind === 'dirt')) {
        const inL = 1 / Math.hypot(hw, hh);          // vecteur rentrant normalisé (±hw,±hh)
        const ixn = hw * inL, iyn = hh * inL;
        // wx0/wy0→wx1/wy1 : les deux bouts de l'arête en coordonnées MONDE (en
        // cellules). Le mode 'wander' échantillonne son bruit là-dessus, jamais
        // sur la cellule ni sur l'indice du pas : c'est ce qui rend le bord
        // continu d'un losange au suivant au lieu de casser à chaque coin.
        if (grassAt(gx, gy - 1)) fringes.push({ ax: p.x, ay: p.y, bx: p.x + hw, by: p.y + hh, inx: -ixn, iny: iyn, seed: 'gfr:n:' + key, wx0: gx, wy0: gy, wx1: gx + 1, wy1: gy });
        if (grassAt(gx + 1, gy)) fringes.push({ ax: p.x + hw, ay: p.y + hh, bx: p.x, by: p.y + hh * 2, inx: -ixn, iny: -iyn, seed: 'gfr:e:' + key, wx0: gx + 1, wy0: gy, wx1: gx + 1, wy1: gy + 1 });
        if (grassAt(gx, gy + 1)) fringes.push({ ax: p.x - hw, ay: p.y + hh, bx: p.x, by: p.y + hh * 2, inx: ixn, iny: -iyn, seed: 'gfr:s:' + key, wx0: gx, wy0: gy + 1, wx1: gx + 1, wy1: gy + 1 });
        if (grassAt(gx - 1, gy)) fringes.push({ ax: p.x, ay: p.y, bx: p.x - hw, by: p.y + hh, inx: ixn, iny: iyn, seed: 'gfr:w:' + key, wx0: gx, wy0: gy, wx1: gx, wy1: gy + 1 });
      }
      // Les cellules-PONT ne reçoivent ni fond ni ruban ici : leur tablier est
      // dessiné APRÈS le fleuve (drawIsoBridges), au-dessus de l'eau. Le PARVIS
      // non plus : ses routes sont carvées par le plan — le garde ne couvre que la
      // frame transitoire entre __showWonder et le recalcul du layout.
      if (isRoad && !isPlaza && !isBridge && !isWater && !(wg && wg.has(key))) roads.push({ gx, gy, cell });
    }
  }
  if (PR) PR.cells = performance.now() - tLoop;
  // PARVIS : tout le dallage, PUIS toute la margelle. L'ordre compte — la margelle
  // encadre le parvis et doit rester au-dessus des joints, comme avant.
  if (wonderCells.length) {
    for (let i = 0; i < wonderCells.length; i += 4) {
      drawWonderPaving(ctx, wonderCells[i], wonderCells[i + 1], wonderCells[i + 2], wonderCells[i + 3], hw, hh);
    }
    for (let i = 0; i < wonderCells.length; i += 4) {
      drawWonderGroundDetail(ctx, wonderCells[i], wonderCells[i + 1], wonderCells[i + 2], wonderCells[i + 3], hw, hh, wg);
    }
  }
  // Voiles d'herbe puis FLEURS : même ordre qu'avant (voile sous fleur), mais en
  // fills d'union groupés. Les motifs de drawGrassDetail tiennent dans leur
  // cellule → « tous les voiles puis toutes les fleurs » == l'entrelacé par cellule.
  const tV = PR && performance.now();
  flushVeils();
  // Les touffes de drawGrassDetail sont des SPRITES agrandis au pixel d'art :
  // lissage coupé une fois pour toute la passe (le poser par cellule coûterait
  // des centaines d'écritures de propriété pour le même résultat).
  const prevGDS = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < grassCells.length; i += 4) {
    drawGrassDetail(ctx, grassCells[i], grassCells[i + 1], grassCells[i + 2], grassCells[i + 3], hw, hh);
  }
  ctx.imageSmoothingEnabled = prevGDS;
  if (PR) PR.grass += performance.now() - tV;
  // FRANGE D'HERBE : après le fond (les langues mordent sur des cellules déjà
  // peintes), AVANT les rubans de chaussée (la route recouvre ce qui la borde).
  if (fringes.length) {
    const tFr = PR && performance.now();
    const puF = Math.max(1, Math.round(hw * 0.055));
    // urb = teinte du sol de l'ère : le mode 'wander' repeint avec elle quand le
    // bord se déplace vers l'herbe (aucune couleur nouvelle n'est introduite).
    for (const f of fringes) drawGrassFringeEdge(ctx, f, puF, urb);
    if (PR) PR.fringe = performance.now() - tFr;
  }
  // Rubans de chaussée par-dessus le fond : pavé central + un bras vers chaque
  // connexion (rectangles MONDE projetés → parallélogrammes écran continus).
  const tRd = PR && performance.now();
  const rmat = roadMatFor(band);
  const rVeil = roadVeilFor(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band);   // voile de lecture (forçage d'aperçu honoré)
  // Constantes de la passe route : teinte d'ÉPAULEMENT (mélange sol↔route un peu
  // assombri — la rue s'assoit dans le sol au lieu d'avoir l'air tamponnée),
  // tons de la FRANGE de chaussée (morsures = épaulement en 2 valeurs,
  // gravillons = matière de la route) et intensité par ère (forçage d'aperçu honoré).
  const shm = ROAD_DETAIL.shoulderMix, shv = ROAD_DETAIL.shoulderV;
  const shTone = [0, 1, 2].map((i) => Math.round((urb[i] * (1 - shm) + road[i] * shm) * shv));
  const shCol = `rgb(${shTone[0]},${shTone[1]},${shTone[2]})`;
  const shCol2 = `rgb(${Math.round(shTone[0] * 0.9)},${Math.round(shTone[1] * 0.9)},${Math.round(shTone[2] * 0.9)})`;
  const spillCol = rgb(road, 1);
  const rfK = ROAD_DETAIL.on ? ROAD_DETAIL.edgeFringe * roadFringeK(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band) : 0;
  const puR = Math.max(1, Math.round(hw * 0.055));
  const cbR = T * 0.05;
  // COULOIRS FUSIONNÉS : même union que les 5 quads par cellule (pavé + bras
  // selon le masque) mais en bandes MAXIMALES par ligne/colonne — beaucoup moins
  // de sous-chemins, et chaque passe-union (ourlet, épaulement, joint, trottoir,
  // bordure, gorge) rasterise d'autant plus vite (le par-cellule re-projetait
  // ~5 quads × cellule × passe et dominait la recuisson du sol des mégapoles).
  // Un couloir s'étend tant que les cellules sont contiguës ET mutuellement
  // connectées (E↔W / S↔N) ; chaque bout s'arrête au bord de cellule si le bras
  // existe (masque), au bord du pavé sinon — la géométrie des quads à
  // l'identique, donc les couches en alpha ne marquent toujours aucune couture.
  // Les couloirs verticaux de longueur 1 sans bras N/S sont sautés : leur pavé
  // est déjà couvert par le couloir horizontal de la cellule.
  const maskOf = (r2) => (r2.cell ? (r2.cell.mask | 0) : 0);
  // Demi-largeur de chaussée de la cellule (hiérarchie par rang). Un couloir se
  // BRISE au changement de largeur : chaque run est homogène et porte sa `w` —
  // le sentier reste étroit jusqu'au seuil où la voie s'élargit (marche nette,
  // comme une route qui change de gabarit).
  const wOf = (r2) => isoRoadHalfW(r2.cell && r2.cell.rank);
  const buildRoadRuns = (list) => {
    const rows = new Map(), cols = new Map();
    for (const r2 of list) {
      const a = rows.get(r2.gy); if (a) a.push(r2); else rows.set(r2.gy, [r2]);
      const c = cols.get(r2.gx); if (c) c.push(r2); else cols.set(r2.gx, [r2]);
    }
    const h = [], v = [];
    for (const [gy, a] of rows) {
      a.sort((p2, q2) => p2.gx - q2.gx);
      for (let i = 0; i < a.length;) {
        let j = i;
        while (j + 1 < a.length && a[j + 1].gx === a[j].gx + 1
          && (maskOf(a[j]) & ROAD_E) && (maskOf(a[j + 1]) & ROAD_W)
          && wOf(a[j + 1]) === wOf(a[j])) j += 1;
        h.push({ gy, g0: a[i].gx, g1: a[j].gx, s0: !!(maskOf(a[i]) & ROAD_W), s1: !!(maskOf(a[j]) & ROAD_E), w: wOf(a[i]) });
        i = j + 1;
      }
    }
    for (const [gx, c] of cols) {
      c.sort((p2, q2) => p2.gy - q2.gy);
      for (let i = 0; i < c.length;) {
        let j = i;
        while (j + 1 < c.length && c[j + 1].gy === c[j].gy + 1
          && (maskOf(c[j]) & ROAD_S) && (maskOf(c[j + 1]) & ROAD_N)
          && wOf(c[j + 1]) === wOf(c[j])) j += 1;
        const n = !!(maskOf(c[i]) & ROAD_N), s = !!(maskOf(c[j]) & ROAD_S);
        if (j > i || n || s) v.push({ gx, g0: c[i].gy, g1: c[j].gy, s0: n, s1: s, w: wOf(c[i]) });
        i = j + 1;
      }
    }
    return { h, v };
  };
  // Trace les couloirs en sous-chemins du chemin courant. `extra` = sur-largeur
  // de la passe (épaulement, trottoir, gorge…) AJOUTÉE à la demi-chaussée du run.
  const addRunQuads = (runs, extra) => {
    for (const s of runs.h) {
      const W = T * s.w + extra;
      const cy2 = (s.gy + 0.5) * T;
      pathWorldQuad(ctx, s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W, cy2 - W,
        s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W, cy2 + W);
    }
    for (const s of runs.v) {
      const W = T * s.w + extra;
      const cx2 = (s.gx + 0.5) * T;
      pathWorldQuad(ctx, cx2 - W, s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W,
        cx2 + W, s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W);
    }
  };
  // ROUTE EN CREUX (jonction route↔sol) : couches concentriques autour de la
  // dalle, chacune en passe-union. Deux habillages selon le tronçon :
  //   - CAMPAGNE / premières ères (shRoads) : OURLET en fondu → ÉPAULEMENT plein
  //     (le liseré validé) — la terre se dissout dans le sol.
  //   - VILLE dès l'ère bourg (swRoads, band ≥ SIDEWALK_ISO.minBand et cellule
  //     urbaine) : VRAI TROTTOIR construit — joint sombre au raccord du sol →
  //     bande de dalles claires → joints transversaux → BORDURE claire.
  // Dans les deux cas la GORGE sombre au contact de la dalle vient en dernier
  // (route en creux / caniveau). La dalle garde son bord NET (crantage v4
  // rejeté : une route se lit par son bord net). Tout est continu, rien par cellule.
  const bandRoads = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
  const swOn = SIDEWALK_ISO.on && bandRoads >= SIDEWALK_ISO.minBand;
  const swRoads = [], shRoads = [];
  for (const r2 of roads) {
    // Les SENTIERS (rang path) n'ont JAMAIS de trottoir construit : une venelle
    // se lit rustique (ourlet + épaulement), même en plein cœur urbain — le
    // trottoir commence à la vraie rue (Raph 2026-07-28).
    const isPathRank = !!(r2.cell && r2.cell.rank === 'path');
    if (swOn && !isPathRank && L.urbanSet && L.urbanSet.has(r2.gx + ',' + r2.gy)) swRoads.push(r2);
    else shRoads.push(r2);
  }
  // Couloirs construits UNE fois par liste, rejoués à chaque passe (les largeurs
  // varient, la topologie non). Union sh ∪ sw = union `roads` : un tronçon qui
  // change de liste au bord urbain aboute ses bras au bord de cellule partagé.
  const shRuns = buildRoadRuns(shRoads), swRuns = buildRoadRuns(swRoads);
  const tU1 = PR && performance.now();
  if (shRoads.length) {
    if (ROAD_DETAIL.feather > 0 && ROAD_DETAIL.featherA > 0) {
      ctx.beginPath();
      addRunQuads(shRuns, cbR + T * ROAD_DETAIL.feather);
      ctx.globalAlpha = ROAD_DETAIL.featherA;
      ctx.fillStyle = shCol;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    addRunQuads(shRuns, cbR);
    ctx.fillStyle = shCol;
    ctx.fill();
  }
  if (PR) PR.roadsShoulder = performance.now() - tU1;
  const tU2 = PR && performance.now();
  if (swRoads.length) {
    // Tons du trottoir dérivés du sol urbain de l'ère → chaque ère a le sien
    // (bourg sable clair, béton gris clair, tech ardoise éclaircie…).
    const swT = [0, 1, 2].map((i) => Math.min(255, Math.round(urb[i] * SIDEWALK_ISO.lightK + 6)));
    const swCol = `rgb(${swT[0]},${swT[1]},${swT[2]})`;
    const curbCol = `rgb(${Math.min(255, Math.round(swT[0] * SIDEWALK_ISO.curbK))},${Math.min(255, Math.round(swT[1] * SIDEWALK_ISO.curbK))},${Math.min(255, Math.round(swT[2] * SIDEWALK_ISO.curbK))})`;
    const jointCol = `rgb(${Math.round(swT[0] * SIDEWALK_ISO.jointK)},${Math.round(swT[1] * SIDEWALK_ISO.jointK)},${Math.round(swT[2] * SIDEWALK_ISO.jointK)})`;
    ctx.beginPath();
    addRunQuads(swRuns, T * (SIDEWALK_ISO.w + SIDEWALK_ISO.joint));
    ctx.fillStyle = jointCol;
    ctx.fill();
    ctx.beginPath();
    addRunQuads(swRuns, T * SIDEWALK_ISO.w);
    ctx.fillStyle = swCol;
    ctx.fill();
    // Joints transversaux des dalles de trottoir : positions en coordonnées
    // MONDE absolues (modulo l'espacement) → continus de cellule en cellule,
    // sur les BRAS seulement (les paliers de carrefour restent des aprons propres).
    const tTk = PR && performance.now();
    if (SIDEWALK_ISO.slabA > 0 && !LOD) {
      ctx.fillStyle = `rgba(40,32,20,${SIDEWALK_ISO.slabA})`;
      const sp = T * SIDEWALK_ISO.slabs;
      const tw = Math.max(T * 0.012, 0.5 / z);   // ~1 px écran quel que soit le zoom
      // Joints regroupés en fills PAR PAQUETS de quads : un fill par trait coûtait
      // ~35 µs pièce (des milliers sur une mégapole), et UN chemin unique pour
      // tout est pire encore — sa bbox couvre la ville entière et le rasterizer
      // repaie tous les bords à chaque scanline (mesuré ~500 ms). Par paquets de
      // 256, la bbox reste locale (scan ligne à ligne) → quelques ms. Les quads
      // sont DISJOINTS et les paquets les partitionnent : aucun double-alpha.
      ctx.beginPath();
      let tkN = 0;
      const tickQuad = (x0, y0, x1, y1) => {
        pathWorldQuad(ctx, x0, y0, x1, y1);
        tkN += 1;
        if (tkN >= 256) { ctx.fill(); ctx.beginPath(); tkN = 0; }
      };
      for (const r2 of swRoads) {
        const cx2 = (r2.gx + 0.5) * T, cy2 = (r2.gy + 0.5) * T;
        const m2 = r2.cell ? (r2.cell.mask | 0) : 0;
        // Gabarit de la cellule (hiérarchie par rang) : joints calés sur SA chaussée.
        const wbC = T * wOf(r2);
        const swOutC = wbC + T * SIDEWALK_ISO.w;
        const inRC = wbC + T * (ROAD_DETAIL.groove + SIDEWALK_ISO.curb);
        const x0c = r2.gx * T, x1c = (r2.gx + 1) * T, y0c = r2.gy * T, y1c = (r2.gy + 1) * T;
        const tickH = (wx) => {
          tickQuad(wx - tw, cy2 - swOutC, wx + tw, cy2 - inRC);
          tickQuad(wx - tw, cy2 + inRC, wx + tw, cy2 + swOutC);
        };
        const tickV = (wy) => {
          tickQuad(cx2 - swOutC, wy - tw, cx2 - inRC, wy + tw);
          tickQuad(cx2 + inRC, wy - tw, cx2 + swOutC, wy + tw);
        };
        if (m2 & ROAD_E) for (let wx = Math.ceil((cx2 + wbC) / sp) * sp; wx < x1c; wx += sp) tickH(wx);
        if (m2 & ROAD_W) for (let wx = Math.ceil(x0c / sp) * sp; wx < cx2 - wbC; wx += sp) tickH(wx);
        if (m2 & ROAD_S) for (let wy = Math.ceil((cy2 + wbC) / sp) * sp; wy < y1c; wy += sp) tickV(wy);
        if (m2 & ROAD_N) for (let wy = Math.ceil(y0c / sp) * sp; wy < cy2 - wbC; wy += sp) tickV(wy);
      }
      if (tkN) ctx.fill();
    }
    if (PR) PR.roadsTicks = performance.now() - tTk;
    // BORDURE (curb) claire le long de la dalle ; la gorge dessinée juste après
    // pose l'ombre du caniveau entre dalle et bordure.
    ctx.beginPath();
    addRunQuads(swRuns, T * (ROAD_DETAIL.groove + SIDEWALK_ISO.curb));
    ctx.fillStyle = curbCol;
    ctx.fill();
  }
  if (PR) PR.roadsSidewalk = performance.now() - tU2;
  const tU3 = PR && performance.now();
  if (roads.length && ROAD_DETAIL.groove > 0 && ROAD_DETAIL.grooveA > 0) {
    ctx.beginPath();
    addRunQuads(shRuns, T * ROAD_DETAIL.groove);
    addRunQuads(swRuns, T * ROAD_DETAIL.groove);
    ctx.fillStyle = `rgba(40,30,18,${ROAD_DETAIL.grooveA})`;
    ctx.fill();
  }
  if (PR) PR.roadsGroove = performance.now() - tU3;
  for (const r of roads) {
    if (ISO_GROUND_SLICE.on) {
      // Même cull de bande que les cellules (coin nord projeté).
      const pr = worldToScreen(r.gx * T, r.gy * T);
      if (ISO_GROUND_SLICE.yOn && (pr.y < ISO_GROUND_SLICE.y0 - ISO_GROUND_SLICE.padTop
        || pr.y > ISO_GROUND_SLICE.y1 + ISO_GROUND_SLICE.padBot)) continue;
      if (ISO_GROUND_SLICE.xOn && (pr.x < ISO_GROUND_SLICE.x0 - ISO_GROUND_SLICE.padX
        || pr.x > ISO_GROUND_SLICE.x1 + ISO_GROUND_SLICE.padX)) continue;
    }
    const cx = (r.gx + 0.5) * T, cy = (r.gy + 0.5) * T;
    const wb = T * wOf(r);          // demi-chaussée de LA cellule (hiérarchie par rang)
    const mask = r.cell ? (r.cell.mask | 0) : 0;
    // Ton de dalle en variation LISSÉE le long du tracé (le hash par cellule
    // rayait le ruban de bandes — même règle que les sols : rien par cellule).
    const v = 0.97 + smoothNoise(r.gx, r.gy, 4, 'rb') * 0.06;
    // Ruban de chaussée = pavé central + un bras vers chaque connexion (tracé CHEMIN).
    ctx.beginPath();
    pathWorldQuad(ctx, cx - wb, cy - wb, cx + wb, cy + wb);                       // pavé central
    if (mask & ROAD_E) pathWorldQuad(ctx, cx + wb, cy - wb, (r.gx + 1) * T, cy + wb);
    if (mask & ROAD_W) pathWorldQuad(ctx, r.gx * T, cy - wb, cx - wb, cy + wb);
    if (mask & ROAD_S) pathWorldQuad(ctx, cx - wb, cy + wb, cx + wb, (r.gy + 1) * T);
    if (mask & ROAD_N) pathWorldQuad(ctx, cx - wb, r.gy * T, cx + wb, cy - wb);
    const rTile = (ROAD_DETAIL.on && ROAD_DETAIL.tiles && rmat.tile && !HARD) ? ensureIsoTileKey(rmat.tile) : null;
    if (rTile && rTile.ready) {
      ctx.save(); ctx.clip();
      const rp = worldToScreen(r.gx * T, r.gy * T);
      const rH = cmHash('rr:' + r.gx + ',' + r.gy);
      const rmir = ((rH >>> 3) & 1) === 1;
      blitIsoTileKey(ctx, rmat.tile, rp.x, rp.y, hw, rmir, rH, rVeil);
      ctx.restore();
    } else {
      // DALLE LISSE : surface PLEINE de chaussée, teinte par ère (roadTone, qui
      // porte DÉJÀ le voile de lecture). Lisse et propre (pas de texture qui
      // transparaît) — la « dalle lisse » demandée par Raph.
      ctx.fillStyle = rgb(road, v);
      ctx.fill();
    }
    // MARQUAGE : UNIQUEMENT le pointillé BLANC d'axe, au milieu des segments droits
    // (Raph : « tirets blancs juste au milieu, pas besoin sur les côtés »').
    // …et plus « toutes ères » : le marquage routier n'existe qu'à partir de
    // l'asphalte (band ≥ 6) — des tirets d'autoroute sur un sentier de terre
    // étaient précisément « cette route à toutes les ères » (Raph 2026-07-28).
    const markBand = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
    const throughH = !!((mask & ROAD_E) && (mask & ROAD_W)), throughV = !!((mask & ROAD_S) && (mask & ROAD_N));
    if (markBand >= 6 && throughH !== throughV) {   // segment droit à un seul axe
      ctx.fillStyle = 'rgba(246,245,240,0.9)';
      const dl = T / 5, dg = T / 7, dw2 = T * 0.03;   // tiret, trou, demi-largeur
      for (let o = dg / 2; o + dl <= T; o += dl + dg) {
        if (throughH) fillWorldQuad(ctx, r.gx * T + o, cy - dw2, r.gx * T + o + dl, cy + dw2);
        else fillWorldQuad(ctx, cx - dw2, r.gy * T + o, cx + dw2, r.gy * T + o + dl);
      }
    }
    // FRANGE DE CHAUSSÉE : crante chaque bord EXPOSÉ du ruban (flancs des bras +
    // caps du pavé sans connexion — les impasses s'effritent au bout). Un flanc
    // qui fait face à une voie JUMELLE non connectée (boulevard 2-cellules) est
    // SAUTÉ : le terre-plein porte cette couture. Arêtes en MONDE → projetées,
    // normale sortante (ox,oy) monde → écran via (±hw,±hh).
    if (rfK > 0 && !LOD) {
      const x0w = r.gx * T, y0w = r.gy * T, x1w = (r.gx + 1) * T, y1w = (r.gy + 1) * T;
      const roadN2 = L.roadSet.has(r.gx + ',' + (r.gy - 1)), roadS2 = L.roadSet.has(r.gx + ',' + (r.gy + 1));
      const roadE2 = L.roadSet.has((r.gx + 1) + ',' + r.gy), roadW2 = L.roadSet.has((r.gx - 1) + ',' + r.gy);
      const segs = [];
      if (mask & ROAD_E) {
        if (!roadN2 || (mask & ROAD_N)) segs.push([cx + wb, cy - wb, x1w, cy - wb, 0, -1, 'en']);
        if (!roadS2 || (mask & ROAD_S)) segs.push([cx + wb, cy + wb, x1w, cy + wb, 0, 1, 'es']);
      } else segs.push([cx + wb, cy - wb, cx + wb, cy + wb, 1, 0, 'ec']);
      if (mask & ROAD_W) {
        if (!roadN2 || (mask & ROAD_N)) segs.push([x0w, cy - wb, cx - wb, cy - wb, 0, -1, 'wn']);
        if (!roadS2 || (mask & ROAD_S)) segs.push([x0w, cy + wb, cx - wb, cy + wb, 0, 1, 'ws']);
      } else segs.push([cx - wb, cy - wb, cx - wb, cy + wb, -1, 0, 'wc']);
      if (mask & ROAD_S) {
        if (!roadE2 || (mask & ROAD_E)) segs.push([cx + wb, cy + wb, cx + wb, y1w, 1, 0, 'se']);
        if (!roadW2 || (mask & ROAD_W)) segs.push([cx - wb, cy + wb, cx - wb, y1w, -1, 0, 'sw']);
      } else segs.push([cx - wb, cy + wb, cx + wb, cy + wb, 0, 1, 'sc']);
      if (mask & ROAD_N) {
        if (!roadE2 || (mask & ROAD_E)) segs.push([cx + wb, y0w, cx + wb, cy - wb, 1, 0, 'ne']);
        if (!roadW2 || (mask & ROAD_W)) segs.push([cx - wb, y0w, cx - wb, cy - wb, -1, 0, 'nw']);
      } else segs.push([cx - wb, cy - wb, cx + wb, cy - wb, 0, -1, 'nc']);
      for (const s of segs) {
        const A = worldToScreen(s[0], s[1]), B = worldToScreen(s[2], s[3]);
        let nx2 = (s[4] - s[5]) * hw, ny2 = (s[4] + s[5]) * hh;
        const nl2 = Math.hypot(nx2, ny2) || 1;
        nx2 /= nl2; ny2 /= nl2;
        drawRoadEdgeFringe(ctx, {
          ax: A.x, ay: A.y, bx: B.x, by: B.y, ox: nx2, oy: ny2,
          seed: 'rf:' + r.gx + ',' + r.gy + ':' + s[6],
        }, puR, shCol, shCol2, spillCol, rfK);
      }
    }
  }
  if (PR) PR.roads = performance.now() - tRd;
  // ── ALLÉES DE SEUIL : « un léger trait gris de la porte à la route » ────────
  // (Raph 2026-07-28). Chaque HABITATION (house/enginehome) adjacente au réseau
  // reçoit une fine bande de sa façade au bord de la chaussée voisine — priorité
  // aux faces écran (S puis E, puis O/N) : la porte des sprites regarde la
  // caméra. Couleur d'ÉPAULEMENT (déjà calée sol↔route par ère), légèrement
  // translucide → un seuil discret, pas une route. Le départ rentre SOUS la
  // façade (tuck, recouvert par le sprite) pour ne jamais flotter. Statique →
  // bake ; sautée en LOD (illisible au dézoom). Quads batchés par paquets
  // (même idiome que les joints de trottoir : bbox locale, pas de double-alpha).
  const tAl = PR && performance.now();
  if (ROAD_DETAIL.on && !LOD && L.tiles && roadMap) {
    const aw = T * 0.055;                     // demi-largeur du trait
    const tuck = T * 0.16;                    // rentré sous la façade
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = shCol;
    ctx.beginPath();
    let alN = 0;
    const allee = (x0, y0, x1, y1) => {
      pathWorldQuad(ctx, x0, y0, x1, y1);
      alN += 1;
      if (alN >= 256) { ctx.fill(); ctx.beginPath(); alN = 0; }
    };
    const DIRS = [[0, 1], [1, 0], [-1, 0], [0, -1]];   // S, E, O, N
    for (const t2 of L.tiles) {
      const isEng = t2.type === 'engine';
      if (!isEng && t2.type !== 'house' && t2.type !== 'enginehome') continue;
      // Les CHAMPS n'ont pas de seuil : une parcelle se laboure, elle n'a pas
      // de porte (Raph 2026-07-28) — seuls moteurs exclus des allées.
      if (isEng && t2.buildingId === 'irrigated_fields') continue;
      const sx = t2.spanX || t2.size || 1, sy = t2.spanY || t2.size || 1;
      let done = false;
      for (const [dx, dy] of DIRS) {
        if (done) break;
        // Cellules de l'emprise ouvrant sur une route de CE côté ; le seuil se
        // pose au MILIEU de la façade (une halle de 3 cellules a sa porte
        // centrée, pas collée au coin). Ni pont (le seuil plongerait dans
        // l'eau) ni place (déjà toute dallée).
        const hits = [];
        for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) {
          const hx = t2.gx + ax, hy = t2.gy + ay;
          const rc = roadMap.get((hx + dx) + ',' + (hy + dy));
          if (!rc || rc.roadSurface === 'bridge' || rc.rank === 'plaza') continue;
          hits.push([hx, hy, rc]);
        }
        if (!hits.length) continue;
        const [hx, hy, rc] = hits[hits.length >> 1];
        const rx = hx + dx, ry = hy + dy;
        const rw = isoRoadHalfW(rc.rank);
        if (dy === 1) allee((hx + 0.5) * T - aw, (hy + 1) * T - tuck, (hx + 0.5) * T + aw, (ry + 0.5 - rw) * T);
        else if (dy === -1) allee((hx + 0.5) * T - aw, (ry + 0.5 + rw) * T, (hx + 0.5) * T + aw, hy * T + tuck);
        else if (dx === 1) allee((hx + 1) * T - tuck, (hy + 0.5) * T - aw, (rx + 0.5 - rw) * T, (hy + 0.5) * T + aw);
        else allee((rx + 0.5 + rw) * T, (hy + 0.5) * T - aw, hx * T + tuck, (hy + 0.5) * T + aw);
        done = true;
      }
    }
    if (alN) ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (PR) PR.allees = performance.now() - tAl;
  // Terre-plein PLANTÉ des boulevards 2-cellules (couture L.terrePlein) : bande
  // de gazon centrée sur la couture + touffes sombres espacées. Statique → dans
  // le bake. (Le vrai pixel-art planté du legacy viendra avec l'art Phase 5.)
  // Quand les SEGMENTS plantés PixelLab sont décodés, la bande gazon + touffes
  // du bake est SAUTÉE (elle restait visible sous/à côté de l'art — retour Raph).
  // Gazon procédural sauté dès que les pièces 3-slice d'une orientation sont là
  // (le sprite porte sa propre base) — vaut par orientation, mais on coupe la
  // bande dès que l'UNE est prête (les segments de l'autre gardent le repli buisson).
  const tMd = PR && performance.now();
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
  if (PR) {
    PR.median = performance.now() - tMd;
    PR.total = performance.now() - PR.t0;
    delete PR.t0;
    globalThis.__isoGroundProfileLast = PR;
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
// Rives GAUCHE et DROITE du ruban, projetées à l'écran. Extrait de
// riverRibbonPath pour que le pavage de l'eau (drawIsoWaterTiles) puisse borner
// ses colonnes sur la vraie emprise du ruban, et pas sur sa boîte englobante.
function riverRibbonScreen(pts, T) {
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
  return { left, right };
}
function riverRibbonPath(ctx, pts, T) {
  const { left, right } = riverRibbonScreen(pts, T);
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
}
// ── OMBRES DE POISSONS (retour Raph, réf. Animal Crossing) ───────────────────
// Silhouettes sombres fusiformes qui dérivent SOUS la surface : corps + queue
// qui bat, serpentage lent le long du ruban, et un FRÉTILLEMENT périodique
// (anneaux de rides en surface). Purement f(now) — aucune sim, aucun état :
// une capture (now figé) les fige, un même now redonne la même scène, coût ~0.
// Dessinées AVANT les vaguelettes (les reflets clairs passent PAR-DESSUS →
// lecture « sous la surface ») et clippées au ruban. Le fleuve ruiné
// (effondrement/usure) n'a plus de vie. Molette : window.__fishTune
// ({ on, count, alpha, speed, size }) — count = poissons par sample (~0.05).
export const fishTune = { on: true, count: 0.07, alpha: 0.34, speed: 1, size: 1 };
if (typeof window !== 'undefined') window.__fishTune = fishTune;
function drawIsoFishShadows(ctx, rv, T, z, now) {
  if (!fishTune.on || z < 0.5) return;
  // L'Usure ne vide plus le fleuve de ses poissons (Raph, 2026-07-27, même
  // arbitrage que la texture d'eau, les quais et le bas-fond) : une cité usée
  // reste une cité, pas un décor mort. Seul l'effondrement en cours les retire.
  if (CM.collapseAt) return;
  const sm = rv.samples, len = sm.length;
  if (len < 4) return;
  const n = Math.max(3, Math.min(12, Math.round(len * fishTune.count)));
  const t = (now || 0) / 1000;
  ctx.save();
  riverRibbonPath(ctx, sm, T);
  ctx.clip();
  for (let i = 0; i < n; i += 1) {
    // ⚠ cmHash renvoie du SIGNÉ (piège connu) : h forcé en unsigned, sinon les
    // modulos sortent négatifs → tailles négatives (ellipse() jette) et alphas
    // écrasés (poissons invisibles, vu au débogage).
    const h = cmHash('fish:' + i + ':' + (CM.layoutRecomputeAt || 0)) >>> 0;
    const size = (0.55 + ((h >>> 3) % 100) / 100 * 0.9) * fishTune.size;
    const dir = (h & 1) ? 1 : -1;
    // CYCLE nage → arrêt (retour Raph « plus lents, et qu'ils s'arrêtent de
    // temps en temps »), toujours f(now) : dans chaque cycle le poisson GLISSE
    // en ease-in-out (départ et arrêt doux) puis reste posé le reste du cycle
    // — et c'est au début de la pause qu'il frétille (rides, plus bas).
    const P = 12 + (h % 9);                             // période du cycle (s)
    const swimF = 0.58 + ((h >>> 7) % 20) / 100;        // fraction du cycle en nage
    const Ps = P * swimF;
    const tf = t + (((h >>> 15) % 1000) / 1000) * P;    // horloge propre au poisson
    const cyc = tf % P;
    const swimming = cyc < Ps;
    const xw = swimming ? cyc / Ps : 1;
    const easep = xw * xw * (3 - 2 * xw);               // progression 0..1 du cycle courant
    const D = (0.0013 + ((h >>> 9) % 100) / 100 * 0.0016) * P * fishTune.speed; // fraction de ruban / cycle
    const drift = (Math.floor(tf / P) + easep) * D * dir;
    let ft = (((h >>> 5) % 1000) / 1000 + drift) % 1;
    if (ft < 0) ft += 1;
    const fi = ft * (len - 1);
    const i0 = Math.min(len - 2, Math.floor(fi)), f = fi - i0;
    const a = sm[i0], b = sm[i0 + 1];
    const cx = a.x + (b.x - a.x) * f, cy = a.y + (b.y - a.y) * f;
    const hw = (a.hw || 2) + (((b.hw || 2)) - (a.hw || 2)) * f;
    // Voie latérale : ligne personnelle stable + serpentage, bornée DANS le ruban.
    let nx = -(b.y - a.y), ny = (b.x - a.x);
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const latBase = (((h >>> 11) % 100) / 100 - 0.5) * 1.1;
    const lat = (latBase + Math.sin(t * 0.13 + (h % 11)) * 0.16) * Math.max(0, hw - 0.55);
    const p = worldToScreen((cx + nx * lat) * T, (cy + ny * lat) * T);
    if (p.x < -40 || p.x > CM.cw + 40 || p.y < -40 || p.y > CM.ch + 40) continue;
    // Cap écran = tangente projetée (± sens de nage) + ondulation du corps —
    // presque figée à l'arrêt (le poisson se maintient, il ne danse pas).
    const pa = worldToScreen(a.x * T, a.y * T), pb = worldToScreen(b.x * T, b.y * T);
    const ang = Math.atan2((pb.y - pa.y) * dir, (pb.x - pa.x) * dir)
      + Math.sin(t * 1.1 + (h % 13)) * (swimming ? 0.13 : 0.045);
    const L2 = T * z * 0.18 * size;                     // demi-longueur écran du corps
    const al = fishTune.alpha * (0.8 + ((h >>> 13) % 40) / 100);
    ctx.fillStyle = `rgba(12,26,34,${al.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, L2, L2 * 0.38, ang, 0, Math.PI * 2);
    ctx.fill();
    // Queue : petite goutte derrière le corps ; battement ample en nage,
    // lent et discret à l'arrêt.
    const wag = Math.sin(t * (swimming ? 5.2 : 2.1) + (h % 17)) * L2 * (swimming ? 0.22 : 0.09);
    const qx = p.x - Math.cos(ang) * L2 * 1.15 - Math.sin(ang) * wag;
    const qy = p.y - Math.sin(ang) * L2 * 1.15 + Math.cos(ang) * wag;
    ctx.beginPath();
    ctx.ellipse(qx, qy, L2 * 0.34, L2 * 0.18, ang, 0, Math.PI * 2);
    ctx.fill();
    // Frétillement AU DÉBUT DE LA PAUSE (le poisson s'arrête et gobe en
    // surface) : 1-2 anneaux de rides éphémères, couchés au sol (scale 1:0.5).
    if (!swimming) {
      const k = (cyc - Ps) / 1.4;                       // 0..1 sur ~1,4 s de pause
      if (k < 1) {
        const r = (4 + k * 10) * z * (0.7 + size * 0.4);
        ctx.strokeStyle = `rgba(214,236,240,${(0.35 * (1 - k)).toFixed(2)})`;
        ctx.lineWidth = Math.max(1, z * 0.8);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, 0.5);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        if (k > 0.35) { ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

/* ── GRAIN DE SURFACE DE L'EAU ────────────────────────────────────────────────
 * Le corps d'eau était un APLAT (un seul `ctx.fill()` de WATER) : la seule
 * surface non texturée de la carte, alors que sol/routes/bâtiments sont tous en
 * pixel-art. On tile ici un moucheté seamless DANS le clip du ruban.
 *
 * Pourquoi une tuile de bruit et pas un tileset d'eau acheté : le fleuve est un
 * RUBAN spline clippé (zéro escalier, cf. riverRibbonPath) — des tuiles d'eau
 * autotile sont indexées sur des CELLULES et obligeraient à rasteriser le fleuve
 * sur la grille, ce qui réintroduirait pile l'escalier que le ruban supprime.
 * Seule une texture pleine-cadre seamless se branche ici. Si un jour on achète
 * une vraie tuile animée, elle se substitue à `grainTile()` sans toucher au reste.
 *
 * La tuile est TRANSPARENTE au repos (mouchetures claires/sombres seulement) :
 * le ton de l'eau reste porté par le fill de WATER, donc impossible de dériver
 * hors palette.
 *
 * ⚠ ÉCHELLE AVANT CONTRASTE. Première version invisible en jeu : GRAIN_PX valait 2
 * px monde, soit ~1,1 px ÉCRAN au zoom réel (mesuré 0,55) — les octaves fines
 * tombaient sous le pixel et se moyennaient à néant. Un moucheté d'eau doit être
 * porté par les BASSES fréquences (nappes larges de profondeur), pas par du grain
 * fin : d'où le poids massif sur l'octave 4 et un GRAIN_PX qui garde des blocs
 * lisibles à l'écran. Le contraste ne rattrape jamais une échelle sous-pixel.
 *
 * Tiling en espace ÉCRAN mais ancré au monde (worldToScreen(0,0)) : la projection
 * iso étant affine, la nappe translate exactement avec le monde au pan et à la
 * molette. Elle n'est PAS cisaillée sur le plan du sol — invisible pour un
 * moucheté isotrope, et ça préserve le nearest-neighbor (pixels nets).
 * Purement f(now) → une capture reste déterministe. Molette : window.__waterGrain.
 * ------------------------------------------------------------------------- */
// ⛔ COUPÉ PAR DÉFAUT — ÉCHEC ASSUMÉ, NE PAS RALLUMER SANS CHANGER DE PRIMITIVE.
// Trois calibrages, trois refus de Raph, et les deux extrémités du réglage sont
// mauvaises pour la MÊME raison de fond :
//   • grain fin  → tombe sous le pixel écran (1,1 px au zoom réel), invisible ;
//   • grain large → nappes pâles et FLOUES (« un truc bizarre »), du brouillard
//     posé au milieu d'une scène en pixel art net.
// Un champ de bruit n'a pas de STRUCTURE : l'eau a des crêtes, des rides, une
// direction ; le bruit n'a que des taches. Aucun réglage intermédiaire ne sauve
// ça. Ce qui reste utile ici, c'est le HARNAIS (tiling seamless ancré au monde
// dans le clip du ruban + compensation de nuit) : une vraie tuile d'eau animée
// se substitue à `grainTile()` et réutilise tout le reste tel quel.
// L'effet qui MARCHE sur cette eau est ailleurs : drawIsoCityReflections.
export const waterGrainTune = {
  on: false,
  minZoom: 0.5,                  // sous ce zoom le grain est invisible : on ne paie pas
  dark: '10,26,34', light: '196,226,235',
  // Balayage mesuré sur l'encre du canvas (A/B grain on/off, pixels exactement à
  // l'ardoise) : 0,36/0,26 → 6,4 par canal = INVISIBLE en jeu (retour Raph « t'as
  // rien changé »). 0,60/0,45 → 11,5. 0,85/0,65 → 17,3 (~7 %), retenu. Le cran
  // suivant (1/0,85 → 23,1) couvre 99 % et perd le ton de l'ardoise.
  aDark: 0.85, aLight: 0.65,     // opacité des mouchetures (de jour)
  nightBoost: 1,                 // × opacité à nuit pleine, compense le voile (cf. grainTile)
  nightSpread: 0.05,             // rapproche les seuils du milieu la nuit (opacité saturée)
  loDark: 0.44, hiLight: 0.59,   // seuils de quantification (entre les deux = transparent)
  // Deux nappes à vitesses différentes : c'est ce qui casse la lecture « papier
  // peint » d'une tuile unique qui défile. Vitesses en px monde/s vers l'aval.
  layers: [{ speed: 4.5, alpha: 1, lat: 0 }, { speed: 2.0, alpha: 0.55, lat: 0.35 }]
};
if (typeof window !== 'undefined') window.__waterGrain = waterGrainTune;

const GRAIN_SRC = 128;           // taille de la tuile bakée (px monde) = période du motif
const GRAIN_PX = 2;              // taille d'un « pixel » de grain (chunky, pixel-art)
let grainCanvas = null, grainKey = '';

// Bruit de valeur à lattice PÉRIODIQUE (indices modulo n) → la tuile est seamless
// par construction, aucun raccord à masquer.
function grainNoise(n, seed, u, v) {
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const xa = ((x0 % n) + n) % n, ya = ((y0 % n) + n) % n;
  const xb = (xa + 1) % n, yb = (ya + 1) % n;
  const at = (x, y) => ((cmHash('wg:' + seed + ':' + (y * n + x)) >>> 0) % 10000) / 10000;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);   // smoothstep
  const t = at(xa, ya) + (at(xb, ya) - at(xa, ya)) * sx;
  const b = at(xa, yb) + (at(xb, yb) - at(xa, yb)) * sx;
  return t + (b - t) * sy;
}

// Tuile bakée une fois (invalidée seulement si les réglages changent).
function grainTile() {
  const G = waterGrainTune;
  // ⚠ COMPENSATION DE NUIT. Le voile de nuit est peint PAR-DESSUS l'eau et écrase
  // le grain de moitié : mesuré 16,8 d'écart de luminance moyen le jour contre 8,7
  // à nightF=1 — soit un retour sous le seuil du visible pour une ville de nuit.
  // On bake donc des mouchetures plus opaques à mesure que la nuit tombe. Palier de
  // 1/4 : sans quantification la tuile serait recuite à CHAQUE frame du cycle
  // jour/nuit. ⚠ `captureFrame` force le JOUR — une mesure faite via captureFrame
  // ne voit jamais ce cas, c'est le piège qui a fait passer deux calibrages à côté.
  const nf = Math.round(Math.min(1, Math.max(0, CM.nightF || 0)) * 4) / 4;
  const boost = 1 + (G.nightBoost || 0) * nf;
  const aD = Math.min(1, G.aDark * boost), aL = Math.min(1, G.aLight * boost);
  // L'opacité SATURE à 1 : passé nightBoost ≈ 1,5 la monter encore ne fait plus
  // rien. Le seul levier qui reste la nuit est le SEUIL — on rapproche les deux
  // bornes du milieu pour que davantage de pixels reçoivent une moucheture au
  // lieu de rester transparents.
  const spread = (G.nightSpread || 0) * nf;
  const lo = Math.min(0.5, G.loDark + spread), hi = Math.max(0.5, G.hiLight - spread);
  const key = [G.dark, G.light, aD, aL, lo, hi].join('|');
  if (grainCanvas && grainKey === key) return grainCanvas;
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = GRAIN_SRC;
  const c = cv.getContext('2d');
  const img = c.createImageData(GRAIN_SRC, GRAIN_SRC);
  const D = G.dark.split(',').map(Number), Lt = G.light.split(',').map(Number);
  const N = GRAIN_SRC / GRAIN_PX;                       // cellules de grain par côté
  // 3 octaves, poids ÉCRASANT sur la plus basse : l'eau se lit par nappes larges
  // (~1 tuile de jeu = 32 px monde) qui survivent à n'importe quel zoom, pas par
  // du grain fin qui tombe sous le pixel écran et se moyenne à néant.
  const OCT = [[4, 0.70], [8, 0.22], [16, 0.08]];
  for (let cy = 0; cy < N; cy += 1) {
    for (let cx = 0; cx < N; cx += 1) {
      let v = 0;
      for (let o = 0; o < OCT.length; o += 1) {
        const [ln, w] = OCT[o];
        v += grainNoise(ln, o, (cx / N) * ln, (cy / N) * ln) * w;
      }
      let r = 0, g = 0, b = 0, a = 0;
      if (v < lo) { r = D[0]; g = D[1]; b = D[2]; a = aD * (1 - v / lo); }
      else if (v > hi) { r = Lt[0]; g = Lt[1]; b = Lt[2]; a = aL * ((v - hi) / (1 - hi)); }
      if (a <= 0) continue;                              // reste transparent
      const A = Math.round(Math.max(0, Math.min(1, a)) * 255);
      for (let py = 0; py < GRAIN_PX; py += 1) {         // bloc chunky
        for (let px = 0; px < GRAIN_PX; px += 1) {
          const i = (((cy * GRAIN_PX + py) * GRAIN_SRC) + (cx * GRAIN_PX + px)) * 4;
          img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = A;
        }
      }
    }
  }
  c.putImageData(img, 0, 0);
  grainCanvas = cv; grainKey = key;
  return cv;
}

function drawIsoWaterGrain(ctx, pts, T, z, now) {
  const G = waterGrainTune;
  if (!G.on || z < G.minZoom) return;
  const tile = grainTile();
  if (!tile) return;
  const len = pts.length;
  // Boîte écran du fleuve (centres projetés + marge de la demi-largeur max),
  // intersectée au viewport : on ne tile QUE ce qui peut être vu.
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, maxHw = 0;
  for (let i = 0; i < len; i += 1) {
    const p = pts[i], w = worldToScreen(p.x * T, p.y * T);
    if (w.x < bx0) bx0 = w.x; if (w.x > bx1) bx1 = w.x;
    if (w.y < by0) by0 = w.y; if (w.y > by1) by1 = w.y;
    if ((p.hw || 0) > maxHw) maxHw = p.hw || 0;
  }
  const pad = maxHw * T * z * 2 + 4;
  bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad);
  bx1 = Math.min(CM.cw, bx1 + pad); by1 = Math.min(CM.ch, by1 + pad);
  if (bx1 <= bx0 || by1 <= by0) return;
  // Aval en espace écran (tangente globale projetée) → le grain dérive avec le
  // courant, jamais « en travers » du fleuve.
  const pA = worldToScreen(pts[0].x * T, pts[0].y * T);
  const pB = worldToScreen(pts[len - 1].x * T, pts[len - 1].y * T);
  let dx = pB.x - pA.x, dy = pB.y - pA.y;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const anchor = worldToScreen(0, 0);                    // ancrage monde (suit le pan)
  const step = GRAIN_SRC * z;
  const sz = Math.ceil(step) + 1;                        // +1 px : coutures au zoom fractionnaire
  const t = (now || 0) / 1000;
  const prevS = ctx.imageSmoothingEnabled, prevA = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  riverRibbonPath(ctx, pts, T);
  ctx.clip();
  for (const ly of G.layers) {
    const d = t * ly.speed * z;
    const ox = anchor.x + dx * d - dy * d * (ly.lat || 0);
    const oy = anchor.y + dy * d + dx * d * (ly.lat || 0);
    const c0 = Math.floor((bx0 - ox) / step), c1 = Math.ceil((bx1 - ox) / step);
    const r0 = Math.floor((by0 - oy) / step), r1 = Math.ceil((by1 - oy) / step);
    ctx.globalAlpha = ly.alpha;
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        ctx.drawImage(tile, Math.floor(ox + col * step), Math.floor(oy + row * step), sz, sz);
      }
    }
  }
  ctx.restore();
  ctx.globalAlpha = prevA;
  ctx.imageSmoothingEnabled = prevS;
}

/* ---------------------------------------------------------------------------
 * TEXTURE D'EAU ANIMÉE — la primitive qui remplace le grain.
 *
 * Le grain procédural ci-dessus a été refusé trois fois pour une raison de
 * fond : un champ de bruit n'a pas de STRUCTURE, l'eau a des rides et une
 * direction. On blitte donc une vraie tuile pixel-art animée (8 frames), cuite
 * par scripts/bakeWaterTiles.mjs depuis le pack Zro Dfects et REMAPPÉE sur
 * l'ardoise du jeu — la moyenne pondérée de la rampe retombe sur WATER à 3
 * près par canal, donc la texture apporte le relief sans déplacer le ton.
 *
 * ⚠ ÉCHELLE, ET LE PIÈGE EST DANS LES DEUX SENS. Trop petit, le motif tombe
 * sous le pixel écran et se moyenne à néant (c'est ce qui a tué le grain). Mais
 * trop grand, il ne lit plus comme de l'eau : `worldPx` valait 6, soit des
 * pixels d'eau SIX FOIS plus gros que ceux du sol — retour Raph « on a un gros
 * fleuve énervé ». Le bon repère n'est pas un seuil abstrait mais l'ÉCHELLE DU
 * PIXEL D'ART DU JEU : les tuiles de sol iso font 64×64 px d'art pour une
 * cellule, donc à zoom 1 un pixel d'art = un pixel écran = 0,5 px monde.
 * `worldPx = 2` met le pixel d'eau à deux crans de cette référence — assez fin
 * pour appartenir à la même image, assez gros pour survivre au dézoom (1,1 px
 * écran au zoom 0,55). Période 32 px monde = 1 tuile de jeu.
 *
 * Reprend le harnais du grain : tiling en espace écran ancré à worldToScreen(0,0)
 * (la projection iso est affine → la nappe translate exactement avec le monde au
 * pan et au zoom, et le nearest-neighbor est préservé), dans le clip du ruban.
 * La tuile étant OPAQUE, `strength` la mélange au fill WATER : comme sa moyenne
 * EST WATER, baisser strength atténue le relief sans bouger la teinte.
 * Purement f(now) → une capture reste déterministe. Molette : window.__waterTiles.
 * ------------------------------------------------------------------------- */
export const waterTilesTune = {
  on: true,
  minZoom: 0.32,        // sous ce zoom la structure passe sous le pixel : on ne paie pas
  worldPx: 2,           // px MONDE par pixel de tuile (cf. ⚠ ÉCHELLE ci-dessus)
  strength: 1,          // 0..1 — mélange au fill WATER, sans dérive de teinte
  // DEUX AMBIANCES, interpolées par CM.rainF (le même signal que l'averse).
  // Retour Raph : sous la pluie l'eau sombre et agitée « c'était très bien », mais
  // il la veut CLAIRE et le clapot LENT par beau temps. `drawIsoRain` ne touche
  // pas l'eau — elle pose rgba(38,46,62) à 0,18 sur TOUT l'écran — donc ce qui
  // avait plu, c'est l'eau ASSOMBRIE : on rejoue ce voile dans le seul clip du
  // ruban, et on l'inverse au beau fixe.
  //   tint > 0 : voile ardoise rgba(38,46,62)  → eau sombre (aspect averse)
  //   tint < 0 : voile pâle rgba(158,184,192)  → eau claire (aspect beau temps)
  // Le pâle EST l'éclat de la tuile elle-même : impossible de dériver hors palette.
  fair: { fps: 3, drift: 0.7, tint: -0.10 },     // beau temps : claire, clapot posé
  rain: { fps: 7, drift: 2.2, tint: 0.18 },      // averse : sombre et agitée
};
if (typeof window !== 'undefined') window.__waterTiles = waterTilesTune;

const WATER_TILE = 16, WATER_FRAMES = 8;
// ⚠⚠ PHASE ACCUMULÉE — une VITESSE VARIABLE NE SE MULTIPLIE JAMAIS PAR UN TEMPS
// ABSOLU. `Math.floor(t * fps)` avec un fps qui suit la météo saute à chaque
// changement : à t = 1000 s, passer de 2,5 à 7 images/s fait bondir `t * fps` de
// 2500 à 7000, et l'index de frame atterrit n'importe où. Pire, quand l'averse
// FAIBLIT le produit DÉCROÎT → l'animation joue À L'ENVERS (retour Raph
// 2026-07-22 : « quand il pleut c'est accéléré, mais surtout à l'envers, et
// après la pluie ça saccade »). Un premier pansement (`t % period`) n'y changeait
// rien : `period` dépendait elle-même de la vitesse, donc sautait aussi.
// On INTÈGRE donc la phase image par image — continue par construction quelle que
// soit la variation de vitesse — et on la borne par un modulo sur une période
// CONSTANTE (nombre de frames, période SPATIALE en px monde), jamais sur une
// période dérivée de la vitesse.
let waterPhaseFrame = 0, waterPhaseDrift = 0, waterPhaseAt = -1;
// Un pas d'intégration. Exportée PURE pour être testable : c'est la continuité de
// cette fonction sous vitesse variable qui a été le bug, pas le rendu.
export function stepWaterPhase(prev, t, fps, drift, spatial) {
  const dt = prev.at < 0 ? 0 : Math.min(0.25, Math.max(0, t - prev.at));
  const wrap = (v, m) => ((v % m) + m) % m;
  return {
    at: t,
    frame: wrap(prev.frame + dt * fps, WATER_FRAMES),
    drift: wrap(prev.drift + dt * drift, spatial)
  };
}
let waterTilesImg = null;
function waterTilesImage() {
  if (waterTilesImg) return waterTilesImg.ready ? waterTilesImg.img : null;
  if (typeof Image === 'undefined') return null;
  const im = new Image();
  waterTilesImg = { img: im, ready: false };
  im.onload = () => { waterTilesImg.ready = true; };
  im.onerror = () => { waterTilesImg.ready = false; };   // PNG absent → fill WATER nu
  im.src = '/pixelart/water/river-tiles.png';
  return null;
}
// ── NAPPE EN MOTIF RÉPÉTÉ ────────────────────────────────────────────────────
// `createPattern` répète TOUTE l'image, pas un rectangle source : la frame
// courante de la bande doit donc vivre dans son propre canvas 16×16. Huit
// frames, cuites une fois pour la session (le contenu ne dépend que du PNG).
let waterFrameTiles = null;
function waterFrameTile(img, fi) {
  if (!waterFrameTiles) waterFrameTiles = new Array(WATER_FRAMES).fill(null);
  let c = waterFrameTiles[fi];
  if (c) return c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(WATER_TILE, WATER_TILE);
  else { c = document.createElement('canvas'); c.width = WATER_TILE; c.height = WATER_TILE; }
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, fi * WATER_TILE, 0, WATER_TILE, WATER_TILE, 0, 0, WATER_TILE, WATER_TILE);
  waterFrameTiles[fi] = c;
  return c;
}

function drawIsoWaterTiles(ctx, pts, T, z, now) {
  const G = waterTilesTune;
  // Diagnostic opt-in (globalThis.__waterSpanStats = true) : dit PAR QUEL
  // garde-fou la nappe est coupée. Éteint, coût nul (un test de drapeau).
  // Hors du bloc de cull, sinon __waterSpanCull = false le rendait muet.
  const dbg = globalThis.__waterSpanStats
    ? (sortie, extra) => {
      globalThis.__waterSpanStatsLast = {
        sortie, on: G.on, zoom: +z.toFixed(3), minZoom: G.minZoom, strength: G.strength,
        image: !!waterTilesImg && !!waterTilesImg.ready, ...extra,
      };
    }
    : null;
  if (!G.on || z < G.minZoom || G.strength <= 0) { if (dbg) dbg('reglage'); return; }
  const img = waterTilesImage();
  if (!img) { if (dbg) dbg('image non prete'); return; }
  const len = pts.length;
  // Boîte écran du fleuve (mêmes bornes que le grain : on ne tile que le visible).
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, maxHw = 0;
  for (let i = 0; i < len; i += 1) {
    const p = pts[i], w = worldToScreen(p.x * T, p.y * T);
    if (w.x < bx0) bx0 = w.x; if (w.x > bx1) bx1 = w.x;
    if (w.y < by0) by0 = w.y; if (w.y > by1) by1 = w.y;
    if ((p.hw || 0) > maxHw) maxHw = p.hw || 0;
  }
  const pad = maxHw * T * z * 2 + 4;
  bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad);
  bx1 = Math.min(CM.cw, bx1 + pad); by1 = Math.min(CM.ch, by1 + pad);
  if (bx1 <= bx0 || by1 <= by0) { if (dbg) dbg('boite vide', { bx0, by0, bx1, by1, cw: CM.cw, ch: CM.ch }); return; }
  // Aval en espace écran : la nappe dérive avec le courant, jamais en travers.
  const pA = worldToScreen(pts[0].x * T, pts[0].y * T);
  const pB = worldToScreen(pts[len - 1].x * T, pts[len - 1].y * T);
  let dx = pB.x - pA.x, dy = pB.y - pA.y;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const anchor = worldToScreen(0, 0);
  const step = WATER_TILE * G.worldPx * z;               // période à l'écran
  if (step < 2) { if (dbg) dbg('pas trop fin', { step }); return; }
  const sz = Math.ceil(step) + 1;                        // +1 px : coutures au zoom fractionnaire
  const t = (now || 0) / 1000;
  // Météo : même signal que l'averse. ⚠ `captureFrame` force rainF à 0
  // (cityMapRuntime) — une mesure faite en capture ne voit JAMAIS le cas pluie.
  // EN HIVER l'averse tombe en NEIGE (cf. precipKind) : le ciel se couvre encore
  // un peu, mais un flocon ne CREUSE pas l'eau. On garde donc un tiers de l'effet
  // — sans quoi l'eau se mettait à claquer comme sous l'orage pendant qu'il neige.
  const rf0 = Math.max(0, Math.min(1, RAIN_TUNE.on ? (CM.rainF || 0) : 0));
  const snow = precipKind(CM.season, rf0) === 'snow';
  const rf = snow ? rf0 * 0.35 : rf0;
  const mix = (a, b) => a + (b - a) * rf;
  // RAFALE : la bouffée passe SUR l'eau, la surface claque et file le temps
  // qu'elle traverse — c'est là qu'on la voit le mieux, mieux que dans le ciel.
  // Sur le RYTHME et la DÉRIVE seulement : la teinte reste celle de l'averse,
  // sinon la bourrasque assombrirait le ruban hors de sa palette. Sans danger
  // pour la phase, qui est intégrée (cf. ⚠⚠ PHASE ACCUMULÉE) — une vitesse qui
  // bouge est exactement ce qu'elle a été écrite pour absorber.
  const gustK = 1 + 0.35 * (snow ? 0.35 : 1)
    * Math.max(0, Math.min(1, RAIN_TUNE.on ? (CM.gustF || 0) * RAIN_TUNE.gust : 0));
  const fps = mix(G.fair.fps, G.rain.fps) * gustK;
  const drift = mix(G.fair.drift, G.rain.drift) * gustK;
  const tint = mix(G.fair.tint, G.rain.tint);
  // Phase : intégrée en jeu (cf. ⚠⚠ PHASE ACCUMULÉE), analytique en capture.
  // `captureFrame` force rainF à 0 → la vitesse y est CONSTANTE, donc le produit
  // temps × vitesse ne saute pas et reste déterministe, ce qu'exige une capture.
  const spatial = WATER_TILE * G.worldPx;          // période spatiale, CONSTANTE
  let phaseFrame, phaseDrift;
  if (CM.capture) {
    phaseFrame = t * G.fair.fps;
    phaseDrift = t * G.fair.drift;
  } else {
    const st = stepWaterPhase(
      { at: waterPhaseAt, frame: waterPhaseFrame, drift: waterPhaseDrift },
      t, fps, drift, spatial
    );
    waterPhaseAt = st.at; waterPhaseFrame = st.frame; waterPhaseDrift = st.drift;
    phaseFrame = st.frame;
    phaseDrift = st.drift;
  }
  const fi = ((Math.floor(phaseFrame) % WATER_FRAMES) + WATER_FRAMES) % WATER_FRAMES;
  const d = (((phaseDrift % spatial) + spatial) % spatial) * z;
  const ox = anchor.x + dx * d, oy = anchor.y + dy * d;
  // ── UN SEUL FILL, AU LIEU DE MILLIERS DE TUILES SOUS CLIP ───────────────────
  // MESURE 2026-07-28 (build de production, Electron, barrière GPU par
  // getImageData) : au dézoom maximum cette nappe pesait 1 147 drawImage pour
  // 0,19 Mpx — et **18 ms de GPU sur les 33 de la frame**. Cent fois le coût au
  // pixel de tout le reste de la carte : ce n'est pas du remplissage, c'est le
  // `clip()` de forme complexe (le ruban, des centaines de points) que le GPU
  // ré-applique à CHAQUE tuile.
  //
  // Or ce double balayage n'est qu'un pavage régulier : exactement ce qu'un
  // motif répété fait en UN appel, le ruban servant alors de RÉGION DE
  // REMPLISSAGE au lieu de clip. Même réseau de tuiles (origines à ox + k·step),
  // même frame d'animation, même alpha — et plus de coutures, la répétition
  // étant faite par l'échantillonneur au lieu du `+1 px` de recouvrement.
  // Le cull par bandes ci-dessous devient sans objet : rien à écarter quand il
  // n'y a qu'un fill. A/B : globalThis.__waterPattern = false rejoue les tuiles.
  if (globalThis.__waterPattern !== false) {
    // Repli SILENCIEUX sur le pavage tuile à tuile si le motif n'est pas
    // disponible (canvas hors écran refusé, source pas décodable) : la nappe
    // s'affiche toujours, elle coûte seulement plus cher.
    let pat = null;
    try {
      const tile = waterFrameTile(img, fi);
      if (tile) pat = ctx.createPattern(tile, 'repeat');
    } catch { pat = null; }
    if (pat) {
      if (dbg) dbg('motif', { step: +step.toFixed(2), ox: +ox.toFixed(1), oy: +oy.toFixed(1) });
      const k = step / WATER_TILE;
      pat.setTransform({ a: k, b: 0, c: 0, d: k, e: ox, f: oy });
      ctx.save();
      ctx.imageSmoothingEnabled = G.worldPx * z < 1;
      ctx.globalAlpha = Math.min(1, G.strength);
      ctx.fillStyle = pat;
      riverRibbonPath(ctx, pts, T);
      ctx.fill();
      if (tint !== 0) {
        ctx.globalAlpha = 1;
        const a = Math.min(1, Math.abs(tint)).toFixed(3);
        ctx.fillStyle = tint > 0 ? `rgba(38,46,62,${a})` : `rgba(158,184,192,${a})`;
        riverRibbonPath(ctx, pts, T);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
  }
  const c0 = Math.floor((bx0 - ox) / step), c1 = Math.ceil((bx1 - ox) / step);
  const r0 = Math.floor((by0 - oy) / step), r1 = Math.ceil((by1 - oy) / step);
  // ── EMPRISE RÉELLE DU RUBAN, BANDE DE LIGNE PAR BANDE DE LIGNE ──────────────
  // Le pavage balayait la BOÎTE ENGLOBANTE du fleuve. Or un ruban en diagonale
  // n'occupe qu'une fraction de sa boîte : sur une fenêtre de 2005×1369 à zoom
  // 0,35 (pas de 11 px), cela faisait ~22 000 drawImage par frame dont ~85 %
  // étaient intégralement jetés par le clip() — mais seulement APRÈS avoir été
  // envoyés au GPU. Or c'est le GPU qui sature (relevé DevTools sur 13 s de
  // dézoom : piste GPU pleine du début à la fin, thread principal à 35 %).
  //
  // On borne donc les colonnes bande par bande. L'enveloppe est CONSERVATRICE :
  // pour chaque quadrilatère du ruban (entre deux échantillons consécutifs) on
  // marque sa boîte englobante sur toutes les bandes qu'il traverse, élargie
  // d'une bande de chaque côté. C'est un sur-ensemble strict de l'aire clippée,
  // y compris si le fleuve serpente ou repasse sur lui-même — le clip reste seul
  // juge du découpage. Ce filtre ne retire QUE des tuiles déjà invisibles : le
  // rendu est identique au pixel près.
  // A/B : globalThis.__waterSpanCull = false rejoue le balayage complet.
  const nRows = r1 - r0 + 1;
  let spanLo = null, spanHi = null;
  if (nRows > 0 && globalThis.__waterSpanCull !== false) {
    spanLo = new Float64Array(nRows).fill(Infinity);
    spanHi = new Float64Array(nRows).fill(-Infinity);
    const { left: rl, right: rr } = riverRibbonScreen(pts, T);
    for (let i = 1; i < rl.length; i += 1) {
      const x0 = Math.min(rl[i - 1].x, rl[i].x, rr[i - 1].x, rr[i].x);
      const x1 = Math.max(rl[i - 1].x, rl[i].x, rr[i - 1].x, rr[i].x);
      const y0 = Math.min(rl[i - 1].y, rl[i].y, rr[i - 1].y, rr[i].y);
      const y1 = Math.max(rl[i - 1].y, rl[i].y, rr[i - 1].y, rr[i].y);
      let ra = Math.floor((y0 - oy) / step) - r0 - 1;   // −1/+1 : une tuile est
      let rb = Math.floor((y1 - oy) / step) - r0 + 1;   // plus haute qu'une bande
      if (rb < 0 || ra >= nRows) continue;
      if (ra < 0) ra = 0;
      if (rb >= nRows) rb = nRows - 1;
      for (let r = ra; r <= rb; r += 1) {
        if (x0 < spanLo[r]) spanLo[r] = x0;
        if (x1 > spanHi[r]) spanHi[r] = x1;
      }
    }
  }
  // Diagnostic : on est arrivé jusqu'au dessin. Rapporte combien de bandes ont
  // été marquées (0 = le cull écarte tout, donc il est faux) et les bornes qui
  // ont servi. Posé HORS du bloc de cull pour rester lisible même quand
  // __waterSpanCull = false.
  if (dbg) {
    let marked = 0, lo = Infinity, hi = -Infinity;
    if (spanLo) {
      for (let r = 0; r < nRows; r += 1) {
        if (spanHi[r] >= spanLo[r]) { marked += 1; if (spanLo[r] < lo) lo = spanLo[r]; if (spanHi[r] > hi) hi = spanHi[r]; }
      }
    }
    dbg('dessine', {
      cull: !!spanLo, nRows, marked, r0, r1, c0, c1,
      step: +step.toFixed(2), oy: +oy.toFixed(1),
      by0: +by0.toFixed(1), by1: +by1.toFixed(1),
      spanX: marked ? [+lo.toFixed(1), +hi.toFixed(1)] : null,
      cw: CM.cw, ch: CM.ch,
    });
  }
  const prevS = ctx.imageSmoothingEnabled, prevA = ctx.globalAlpha;
  // Nearest-neighbor tant qu'un pixel de tuile couvre au moins un pixel écran
  // (pixel art NET, la règle du projet). En dessous, le nearest SAUTE des pixels
  // et la nappe scintille en défilant : on lisse, ce qui rend au loin une eau
  // douce — exactement ce qu'elle était avant la texture. Le basculement se fait
  // à un zoom où le motif n'est de toute façon plus lisible.
  ctx.imageSmoothingEnabled = G.worldPx * z < 1;
  ctx.save();
  riverRibbonPath(ctx, pts, T);
  ctx.clip();
  ctx.globalAlpha = Math.min(1, G.strength);
  for (let row = r0; row <= r1; row += 1) {
    let cA = c0, cB = c1;
    if (spanLo) {
      const ri = row - r0;
      if (spanHi[ri] < spanLo[ri]) continue;                     // bande hors ruban
      // −1 : une tuile posée à gauche de l'emprise déborde dedans (sz > step).
      cA = Math.max(c0, Math.floor((spanLo[ri] - ox) / step) - 1);
      cB = Math.min(c1, Math.ceil((spanHi[ri] - ox) / step) + 1);
    }
    for (let col = cA; col <= cB; col += 1) {
      ctx.drawImage(img, fi * WATER_TILE, 0, WATER_TILE, WATER_TILE,
        Math.floor(ox + col * step), Math.floor(oy + row * step), sz, sz);
    }
  }
  // Voile de météo, même geste que l'averse mais confiné au ruban : ardoise pour
  // assombrir sous la pluie, éclat de la tuile pour éclaircir au beau fixe.
  if (tint !== 0) {
    ctx.globalAlpha = 1;
    const a = Math.min(1, Math.abs(tint)).toFixed(3);
    ctx.fillStyle = tint > 0 ? `rgba(38,46,62,${a})` : `rgba(158,184,192,${a})`;
    riverRibbonPath(ctx, pts, T);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = prevA;
  ctx.imageSmoothingEnabled = prevS;
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
  // Surface de l'eau, SOUS les liserés de bas-fond (qui portent la lecture du
  // bord) et sous poissons/vaguelettes.
  // La tuile animée porte le relief ; le grain procédural reste là, coupé.
  //
  // ⚠ L'USURE NE COUPE PLUS LA TEXTURE (demande de Raph, 2026-07-27). Avant,
  // au-delà de 70 % d'Usure le fleuve retombait à un aplat ardoise nu — l'idée
  // était « l'eau morte en déclin ». En jeu, à 78 % d'Usure sur une partie
  // avancée, ça se lit comme un bug d'affichage et non comme une intention :
  // le fleuve perd sa matière alors que toute la ville garde la sienne.
  // Seul l'EFFONDREMENT en cours (CM.collapseAt) dénude encore l'eau.
  if (!CM.collapseAt) {
    drawIsoWaterTiles(ctx, pts, T, z, now);
    drawIsoWaterGrain(ctx, pts, T, z, now);
  }
  // BAS-FOND CLAIR le long des rives (façon TheoTown, retour Raph « les bords de
  // l'eau plus clairs ») : l'eau S'ÉCLAIRCIT au bord (peu profond) et fonce vers le
  // centre (profond). Bandes strokées le long du ruban, CLIPPÉES → seule la moitié
  // intérieure reste. Actif aux ÈRES SANS QUAI (band ≤ maxBand) : ensuite la berge
  // maçonnée porte son propre bas-fond au pied du mur. Réglable via waterShoreTune.
  {
    const S = waterShoreTune, len0 = pts.length;
    const bandW = (L.counts && L.counts.eraBand) | 0;
    // Le quai ne trace son bas-fond qu'au REPOS (drawRun : `wallOn && !lod`).
    // Partout ailleurs c'est nous, sinon la rive perd sa lecture pile quand on
    // prend du recul. Fleuve RUINÉ exclu du relais : l'eau morte n'a ni tuile ni
    // grain, lui ajouter un liseré clair la ferait paraître vivante.
    //
    // ⚠ « RUINÉ » NE COUVRE PLUS L'USURE (demande de Raph, 2026-07-27, en même
    // temps que la texture d'eau et le quai). Sans ce changement l'exclusion
    // mutuelle se retournait : le quai revenait à 78 % d'Usure mais `ruined`
    // restait vrai, donc NI le quai NI le fleuve ne traçait le bas-fond, et la
    // rive perdait sa lisière claire alors même que son mur était revenu.
    const maxB = S.maxBand != null ? S.maxBand : 1;
    const ruined = !!CM.collapseAt;
    const quayDrawsShore = bandW > maxB && !CM.lodActive && !ruined;
    const shoreOn = S.on && (S.lodFallback && !ruined ? !quayDrawsShore : bandW <= maxB);
    const nAt = (i) => { const o = pts[Math.max(0, i - 1)], q = pts[Math.min(len0 - 1, i + 1)]; let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; return { nx: -ty / tl, ny: tx / tl }; };
    if (shoreOn) {
      // Les deux rives décalées, projetées UNE SEULE FOIS. Avant, chacune des
      // trois bandes rejouait la même projection (nAt + worldToScreen sur tous
      // les échantillons) : six parcours complets du ruban par frame.
      const edges = [];
      for (const sgn of [1, -1]) {
        const path = [];
        for (let i = 0; i < len0; i += 1) {
          const p = pts[i], n = nAt(i);
          path.push(worldToScreen((p.x + sgn * n.nx * p.hw) * T, (p.y + sgn * n.ny * p.hw) * T));
        }
        edges.push(path);
      }
      const shore = (color, width) => {
        ctx.strokeStyle = color; ctx.lineWidth = width;
        for (const path of edges) {
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
        }
      };
      ctx.save();
      riverRibbonPath(ctx, pts, T);
      ctx.clip();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // A/B utilisable EN PRODUCTION (globalThis.__waterShoreMerge = false),
      // comme __waterSpanCull : la molette __waterShore, elle, est gardée par
      // import.meta.env.DEV et n'existe pas dans le .exe — or c'est justement
      // là que le lag se reproduit. Pour RÉGLER l'aspect (lodW/lodA/lodC),
      // passer par `npm run dev`.
      if (S.lodMerge && CM.lodActive && globalThis.__waterShoreMerge !== false) {
        // AU DÉZOOM : UN SEUL TRAIT. Les trois bandes (18/10/4,5 × zoom) se
        // réduisent alors à 6,3 / 3,5 / 1,6 px : elles se confondent à l'œil en
        // une seule lisière claire, mais coûtent toujours six traits pleine
        // longueur DANS UN CLIP — et ce, précisément quand le LOD vient de les
        // rallumer (le quai cesse de tracer son bas-fond, cf. quayDrawsShore).
        // On garde donc la lecture du bord clair — demandée « tout le temps »
        // le 2026-07-22 — pour un tiers du tracé. Réglable à chaud :
        // window.__waterShore({ lodMerge, lodW, lodC, lodA }).
        shore(`rgba(${S.lodC},${S.lodA})`, Math.max(2, z * S.lodW));
      } else {
        shore(`rgba(${S.c1},${S.a1})`, Math.max(3, z * S.w1));   // bas-fond large et doux
        shore(`rgba(${S.c2},${S.a2})`, Math.max(2, z * S.w2));   // eau peu profonde
        shore(`rgba(${S.c3},${S.a3})`, Math.max(1, z * S.w3));   // liseré clair au bord
      }
      ctx.restore();
    }
  }
  // OMBRES DE POISSONS : sous les reflets (dessinées AVANT les vaguelettes).
  drawIsoFishShadows(ctx, rv, T, z, now);
  // (Vaguelettes animées RETIRÉES le 2026-07-22 — nappe de petits traits clairs
  // rgba(184,214,224) dont la brillance courait vers l'aval. Elles portaient la
  // lecture du courant tant que l'eau était un APLAT ; la tuile animée
  // (drawIsoWaterTiles) porte désormais et la matière et le mouvement, et ces
  // traits vectoriels se voyaient comme un calque étranger posé sur du pixel art
  // — retour Raph « enlève les traits blancs du courant, on n'en a plus besoin ».
  // `waterRippleTune` vit toujours dans pixelRiver.js pour le rendu legacy.)
}

// (Brume de rivière RETIRÉE le 2026-07-13 — essayée en nappes puis en voile
// plein, jugée « pas terrible et pas si utile » par Raph. Ne pas re-proposer.)

// ── Art iso dédié (/pixelart/iso/<name>.png) : cache paresseux ───────────────
// Bateaux par stade (8 rotations). Les bandes mill-wheel-* n'ont plus de
// consommateur depuis la refonte éolienne du moulin (retrait en phase art).
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
      // gazon des terre-pleins sautée) → invalidation DOUCE, recuisson coalescée
      // par drawIsoWorld (cf. isoTile : plus une recuisson par sprite décodé).
      if (CM._isoGroundBake) CM._isoGroundBake.soft = true;
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
  lightCutImage(e.img, dx, dy, boxW, boxH);   // masque les halos déposés derrière (lightLayer.js)
  // Géométrie du draw (px écran) : permet de re-projeter un OVERLAY calé sur
  // les pixels source (eau de fontaine animée des places).
  return { x: dx, y: dy, w: boxW, h: boxH };
}
// Arbres pixel iso : tree-1..tree-N (feuillus + conifères, choisis par hash).
// (Des feuillus du pack Cainos ont été essayés en variantes 5-7 le 2026-07-22 puis
// RETIRÉS — « je n'aime pas les arbres », Raph. Ne pas re-proposer.)
const ISO_TREE_VARIANTS = 4;
// Buissons DÉDIÉS bush-1..N (pack Cainos, cf. scripts/sliceCainosPlants.mjs),
// rangés du plus petit au plus grand. Avant, un « buisson » de terre-plein était
// un feuillu rapetissé — donc un tronc d'arbre miniature. Repli sur tree-N si le
// PNG manque (cf. les sprites absents du .exe hors ligne : un art absent ne doit
// rien effacer).
const ISO_BUSH_VARIANTS = 6;

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
// Emprises des BÂTIMENTS (tuiles du layout) : la forêt sauvage ne pousse PAS
// dessus. La plupart des emprises sont déjà dans urbanSet, mais le CHAMP (posé
// sur l'herbe par la voie « ceinture agricole », hors urbanSet/occupiedFoot) y
// échappait → des arbres sauvages le traversaient, révélés depuis que les
// empreintes à plat se trient SOUS les objets. On couvre toutes les emprises.
//
// ⚠ MÉMOÏSÉ SUR LE LAYOUT, pas sur la vue : ce Set ne dépend que des tuiles,
// alors qu'il était reconstruit à CHAQUE régénération de la forêt — c'est-à-dire
// à chaque franchissement des bornes cachées, donc en plein pan. Mesuré sur une
// ville de 1 151 tuiles : la régénération coûtait 16 ms de surcoût médian
// (pics à 33 ms), les pics de `vif-collecte` relevés sur la machine de jeu.
function isoBuildFootSet(L) {
  const at = CM.layoutRecomputeAt || 0;
  const n = (L.tiles && L.tiles.length) | 0;
  const c = CM._isoBuildFoot;
  if (c && c.at === at && c.n === n) return c.set;
  const set = new Set();
  for (const t of (L.tiles || [])) {
    const tsx = t.spanX || t.size || 1, tsy = t.spanY || t.size || 1;
    for (let ax = 0; ax < tsx; ax += 1) for (let ay = 0; ay < tsy; ay += 1) set.add((t.gx + ax) + ',' + (t.gy + ay));
  }
  CM._isoBuildFoot = { at, n, set };
  return set;
}

// ── FORÊT SAUVAGE PAR BLOCS ──────────────────────────────────────────────────
// La dispersion était mémoïsée sur la ZONE VISIBLE : dès que la vue sortait des
// bornes cachées (donc en plein pan), TOUTE la zone était rebalayée — mesuré
// 14-16 ms de surcoût médian, pics à 33 ms : les pics de `vif-collecte` relevés
// sur la machine de jeu. Le balayage se fait désormais par BLOCS alignés sur la
// grille (invariants par pan, comme les tuiles d'une carte) : franchir une
// frontière ne coûte que le ou les blocs nouvellement entrés, jamais la zone
// entière. La liste concaténée est elle-même mémoïsée tant que l'ensemble des
// blocs visibles ne change pas.
// Longueur minimale d'une série de sprites pour valoir une bascule GL : sous ce
// seuil, la composition (un blit plein écran) coûterait plus que les
// `drawImage` économisés. 120 capture les ceintures forestières et laisse la
// poussière de séries courtes au chemin 2D.
const GL_RUN_MIN = 120;

// Pesée fine de la passe vivante (opt-in : globalThis.__isoProfParts = true) :
// isole les postes procéduraux candidats à la cuisson en texture. Le drapeau se
// lit UNE fois par frame (constante d'import : la molette n'aurait aucun effet
// après chargement).

// Seuil d'éclaircie de la forêt : taille de tuile écran sous laquelle les
// arbres se chevauchent au point qu'en retirer devient invisible (à 11 px, un
// arbre en couvre ~21 et ses voisins mordent dessus).
const WILD_THIN_UNIT = 14;

const WILD_BLOCK = 32;                  // cellules par côté de bloc
const WILD_BLOCK_CAP = 512;             // blocs gardés (au-delà : on repart à neuf)

function isoWildForestBlock(L, bx, by, ctx) {
  const gx0 = bx * WILD_BLOCK, gy0 = by * WILD_BLOCK;
  const gx1 = gx0 + WILD_BLOCK - 1, gy1 = gy0 + WILD_BLOCK - 1;
  const { isWild, nearCity, cellNoise } = ctx;
  const arr = [];
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
      arr.push({ gx, gy, jx, jy, r });
    }
  }
  return arr;
}

function isoWildForest(L, b) {
  // ':pv…' : le parvis d'une merveille en APERÇU (hors urbanSet, contrairement aux
  // actives) doit chasser les arbres sauvages → la dispersion se refait à l'aller-retour.
  const sig = (CM.layoutRecomputeAt || 0) + ':' + (L.gridN | 0) + ':' + (L.mapSeed || 0)
    + (CM.previewWonder ? ':pv' + CM.previewWonder.id : '');
  let st = CM._isoWildForest;
  if (!st || st.sig !== sig || st.blocks.size > WILD_BLOCK_CAP) {
    st = CM._isoWildForest = { sig, blocks: new Map(), list: [], key: '' };
  }
  const bx0 = Math.floor((b.gx0 - WILD_PAD) / WILD_BLOCK);
  const bx1 = Math.floor((b.gx1 + WILD_PAD) / WILD_BLOCK);
  const by0 = Math.floor((b.gy0 - WILD_PAD) / WILD_BLOCK);
  const by1 = Math.floor((b.gy1 + WILD_PAD) / WILD_BLOCK);
  const key = bx0 + ':' + bx1 + ':' + by0 + ':' + by1;
  if (key === st.key) return st.list;   // mêmes blocs visibles → rien à refaire
  const urbanSet = L.urbanSet, roadSet = L.roadSet;
  const riverCells = (L.river && L.river.present && L.river.cells) || null;
  const banks = (L.river && L.river.banks) || null;
  const has = (s, gx, gy) => !!s && s.has(gx + ',' + gy);
  const buildFoot = isoBuildFootSet(L);
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
  const ctx = { isWild, nearCity, cellNoise };
  // Liste RÉUTILISÉE (vidée, jamais réallouée) : elle ne se reconstruit qu'au
  // changement d'ensemble de blocs, et seuls les blocs neufs sont dispersés.
  const list = st.list;
  list.length = 0;
  for (let by = by0; by <= by1; by += 1) {
    for (let bx = bx0; bx <= bx1; bx += 1) {
      const bk = bx + ',' + by;
      let arr = st.blocks.get(bk);
      if (!arr) { arr = isoWildForestBlock(L, bx, by, ctx); st.blocks.set(bk, arr); }
      for (let i = 0; i < arr.length; i += 1) list.push(arr[i]);
    }
  }
  st.key = key;
  return list;
}

// ── PLACE ───────────────────────────────────────────────────────────────────
// `isoPlazaBox` (composante connexe de la dalle) et `plazaEraForBand` ont
// DÉMÉNAGÉ dans isoPlaza.js : la place composée et l'ancienne scène doivent
// lire la MÊME emprise et la MÊME ère, une copie ici les ferait diverger.
// Ce qui reste ci-dessous ne sert qu'au mode 'scene' (__plaza({mode:'scene'})),
// gardé comme référence d'A/B : la scène par ère validée le 2026-07-12
// (fontaine monumentale + parterres + bancs, UNE image posée sur la dalle).
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

// ── Les trois MÉTIERS du fleuve (cf. riverFleet.js) ─────────────────────────
// Le marchand traverse l'Histoire avec le port (radeau → voilier → vapeur →
// porte-conteneurs → vaisseau) ; le plaisancier a ses trois âges à lui ; le
// pêcheur garde sa barque en bois du début à la fin (arbitrage Raph : c'est
// justement ce qui le rend intemporel au milieu d'une ville qui mute).
//
// ⚠ Le seuil du VAPEUR est ei >= 25, pas 20. L'iso avait gardé l'ancienne
// valeur alors que le legacy l'avait corrigée en documentant pourquoi : à 20, un
// vapeur croisait dès la bande Marbre devant des habitants en toge.
export function tradeStage(band, ei) {
  return band >= 7 ? 'cosmic' : ei >= 30 ? 'container' : ei >= 25 ? 'steam' : ei >= 10 ? 'sail' : 'raft';
}
function tradeSizeMul(stage, band) {
  return stage === 'cosmic' ? (band >= 9 ? 5.6 : band >= 8 ? 4.8 : 4.0)
    : stage === 'container' ? 3.2 : stage === 'steam' ? 2.4 : stage === 'sail' ? 1.8 : 1.36;
}
// Plaisance : barque à rames, puis petit voilier, puis vedette à moteur. En ère
// cosmique on garde la vedette — un plaisancier reste un plaisancier, et rien
// ne justifiait un quatrième stade d'art pour un bateau qu'on regarde passer.
// ⚠ Échelles RELEVÉES après la première capture : aux valeurs « réalistes »
// (1,05 / 1,45 / 1,9) la plaisance était illisible. Deux raisons cumulées — les
// coques de barque occupent bien moins de leur cadre 85 px que les gros
// marchands, et à ce zoom une silhouette sous ~40 px n'est plus qu'un grain.
// Ce qui compte n'est pas l'échelle vraie d'une barque mais qu'on RECONNAISSE
// le métier.
const YACHT_STAGES = [
  { key: 'rowboat', sizeMul: 1.4 },
  { key: 'dinghy', sizeMul: 1.7 },
  { key: 'motorboat', sizeMul: 2.0 },
];
function yachtStage(ei) { return ei >= 25 ? YACHT_STAGES[2] : ei >= 10 ? YACHT_STAGES[1] : YACHT_STAGES[0]; }

// Coque de REPLI pour un métier dont l'art n'est pas encore là : une barque en
// bois vue de trois quarts, plus l'attribut qui identifie le métier (canne
// pliée pour le pêcheur, voile pour le plaisancier). Volontairement grossier —
// c'est un échafaudage de réglage, pas une proposition graphique.
function drawIsoBoatStub(ctx, p, s, sizeMul, heading, bob, sh) {
  const fisher = sh.kind === 'fisher';
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.rotate(heading);
  ctx.scale(sizeMul, sizeMul);
  ctx.fillStyle = '#6b4a2c';                       // coque
  ctx.beginPath();
  ctx.moveTo(s * 0.26, 0);
  ctx.lineTo(s * 0.02, -s * 0.09);
  ctx.lineTo(-s * 0.24, -s * 0.05);
  ctx.lineTo(-s * 0.24, s * 0.05);
  ctx.lineTo(s * 0.02, s * 0.09);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8d6740';                       // plat-bord
  ctx.fillRect(-s * 0.2, -s * 0.02, s * 0.4, Math.max(1, s * 0.02));
  if (fisher) {
    ctx.strokeStyle = '#c8b48a';                   // canne tendue vers l'arrière
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(-s * 0.06, -s * 0.02);
    ctx.lineTo(-s * 0.3, -s * 0.16);
    ctx.stroke();
    ctx.fillStyle = '#9c8f7a';                     // le pêcheur, allongé
    ctx.fillRect(-s * 0.1, -s * 0.05, s * 0.2, Math.max(1, s * 0.05));
  } else {
    ctx.fillStyle = '#e6e2d6';                     // voile
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.06);
    ctx.lineTo(0, -s * 0.32);
    ctx.lineTo(s * 0.16, -s * 0.07);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ── FEUX DE NAVIGATION ──────────────────────────────────────────────────────
// Aucun bateau ne lisait `nightF` : la nuit tombée, le fleuve devenait un ruban
// mort pendant que la ville s'allumait.
//
// La première version posait UN fanal ambre avec halo et reflet. Rejeté par
// Raph (2026-07-29) au profit du vrai : un bateau porte DEUX feux de position en
// haut du mât, ROUGE à bâbord et VERT à tribord. Deux points colorés discrets
// racontent mieux « bateau » qu'une belle lueur — et ils donnent gratuitement le
// SENS DE MARCHE, ce que le halo ne faisait pas.
//
// Trois conséquences tenues ici :
//   • plus aucun halo ni reflet — rien que deux pixels ;
//   • intensité franchement baissée (un feu de position balise, il n'éclaire pas) ;
//   • le PÊCHEUR n'en porte aucun : il est à l'ancre, hors des règles de route,
//     et sa scène est celle d'un type tranquille dans le noir.
//
// ⚠ ILS SONT PEINTS DANS UNE PASSE À PART, APRÈS LE VOILE DE NUIT. J'ai d'abord
// cru que supprimer le halo dispensait de la doctrine « jamais de lumière avant
// le voile » — qu'un simple pixel additif y survivrait. Faux, et vérifié à
// l'encre : zéro pixel rouge ou vert dans le PNG de nuit, le voile les avait
// tous mangés. Ce n'est pas le halo qui impose la doctrine, c'est le VOILE, et
// il tombe sur tout ce que la passe vivante a peint.
// La couche de lumière (lightCtx) ne servait pas non plus : elle n'est armée que
// pendant drawIsoLive, et les bateaux sont dessinés AVANT. D'où drawIsoShipNight,
// exactement sur le modèle des lanternes de pont (drawIsoBridgeNight).
// Molette : __navLights({ on, gain, size }).
const NAV_LIGHTS = { on: true, gain: 1, size: 1 };
if (typeof window !== 'undefined') {
  window.__navLights = (o) => { if (o) Object.assign(NAV_LIGHTS, o); return { ...NAV_LIGHTS }; };
}
export const NAV_PORT_COL = '255,60,52';    // bâbord — rouge
export const NAV_STBD_COL = '60,255,110';   // tribord — vert

// Un bateau à l'ancre ne porte pas de feux de route. C'est une règle de métier,
// pas un détail de rendu : le pêcheur DOIT rester noir sur l'eau.
export function boatHasNavLights(kind) { return kind !== 'fisher'; }

// Intensité des feux. Le produit par nightF est la garde qui compte :
// `flameGlowAlpha` porte un plancher de JOUR délibéré pour qu'une forge brûle à
// midi, et la première version en héritait. Un feu de position n'a rien à
// signaler de jour. Le 0,62 remplace l'ancien 2,6 — Raph les trouvait trop forts.
export function boatLampMul(nightF, gain) {
  return Math.max(0, nightF || 0) * 0.62 * (gain == null ? 1 : gain);
}

// Positions écran des deux feux : perpendiculaires au CAP, de part et d'autre.
// En repère écran (y vers le bas), tourner le cap de -90° donne la gauche du
// sens de marche, donc bâbord. Renvoie { port, stbd } en décalages px.
export function navLightOffsets(heading, d) {
  const sx = Math.sin(heading) * d, sy = -Math.cos(heading) * d;
  return { port: { x: sx, y: sy }, stbd: { x: -sx, y: -sy } };
}

// Passe de nuit des bateaux : APRÈS drawIsoNight, comme les lanternes de pont.
// Elle consomme l'ancre écran que drawIsoShips a laissée sur chaque coque —
// `_navAt` la date, sinon une coque sortie du champ garderait sa position de la
// frame d'avant et sèmerait deux pixels au milieu de l'eau.
function drawIsoShipNight(now) {
  const night = CM.nightF || 0;
  if (!NAV_LIGHTS.on || night <= 0.02 || !CM.ships || !CM.ships.length) return;
  const a = boatLampMul(night, NAV_LIGHTS.gain);
  if (a <= 0.01) return;
  const ctx = CM.ctx;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (const sh of CM.ships) {
    if (!sh._nav || sh._navAt !== now || !boatHasNavLights(sh.kind)) continue;
    const { x, y, dw, heading } = sh._nav;
    // « En haut du mât » : au-dessus de la coque, pas sur la flottaison. 0,30 et
    // pas 0,42 — au-delà, les feux se détachent du bateau et flottent dans le
    // vide (les sprites portent beaucoup de transparent au-dessus de la coque).
    const my = y - dw * 0.30;
    const off = navLightOffsets(heading, dw * 0.16);
    const px = Math.max(1, Math.round(dw * 0.045 * NAV_LIGHTS.size));
    for (const [o, col] of [[off.port, NAV_PORT_COL], [off.stbd, NAV_STBD_COL]]) {
      ctx.fillStyle = `rgba(${col},${Math.min(1, a).toFixed(3)})`;
      ctx.fillRect(Math.round(x + o.x - px / 2), Math.round(my + o.y - px / 2), px, px);
    }
  }
  ctx.globalCompositeOperation = prevOp;
}

// Aspect d'un bateau pour la frame : sprite, échelle, et force du sillage. Le
// pêcheur n'en laisse aucun (il est à l'ancre), le plaisancier à peine.
export function shipVisual(kind, band, ei) {
  // Le pêcheur est le seul bateau qu'on regarde DURER : il tient la même pose
  // 90 s. S'il n'est qu'une tache brune, sa scène ne se lit pas — d'où une
  // échelle plus généreuse que sa taille réelle ne le voudrait.
  if (kind === 'fisher') return { key: 'fisher', sizeMul: 1.75, wake: 0, stage: 'fisher' };
  if (kind === 'yacht') {
    const y = yachtStage(ei);
    return { key: y.key, sizeMul: y.sizeMul, wake: 0.35, stage: y.key };
  }
  const stage = tradeStage(band, ei);
  return { key: stage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, band)) : stage,
    sizeMul: tradeSizeMul(stage, band), wake: 1, stage };
}

// ── BATEAUX : flotte legacy (CM.ships) sur le ruban projeté ──────────────────
// Reprend la recette drawShips (stade par ère, voie latérale, louvoiement,
// sillage additif, coque « toujours droite ») mais TOUT passe par la projection :
// position monde → worldToScreen, inclinaison = tangente PROJETÉE. Dessinés
// APRÈS le fleuve et AVANT les ponts → ils passent sous les tabliers.
// NE SIMULE PLUS RIEN : la vie de la flotte (naissance, escale, mort) est
// pilotée par riverFleet.js, appelé une fois par frame par le runtime.
function drawIsoShips(now) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !CM.ships || !CM.ships.length) return;
  const sm = rv.samples;
  if (!sm || sm.length < 2) return;
  const T = CM.TILE, ctx = CM.ctx, z = CM.cam.zoom, s = T * z;
  const band = (L.counts && L.counts.eraBand) | 0, ei = (L.counts && L.counts.eraIndex) | 0;
  // Les trois aspects sont CONSTANTS sur la frame (même ère pour tout le monde) :
  // on les calcule une fois, pas une fois par bateau.
  const VIS = { trade: shipVisual('trade', band, ei), yacht: shipVisual('yacht', band, ei), fisher: shipVisual('fisher', band, ei) };
  const docks = CM.shipDocks || [];
  for (const sh of CM.ships) {
    const vis = VIS[sh.kind] || VIS.trade;
    const vstage = vis.stage, sizeMul = vis.sizeMul;
    // Repli profil legacy : réservé aux stades marchands, seuls à avoir une
    // bande top-down sous /agents/boats/.
    const chr = BOAT_SIZES[vstage] ? ensureBoat(vis.key) : null;
    // La position est SIMULÉE en amont (riverFleet.js, un seul point pour les
    // deux rendus) : ici on ne fait plus que lire. `moveF` ne sert donc qu'à
    // l'écume — un bateau à l'arrêt ne traîne pas de sillage.
    const stopped = sh.state === 'dock' || sh.state === 'anchor';
    let moveF = stopped ? 0 : 1;
    if (!stopped && sh.kind === 'trade' && !sh.done) {
      let prox = 0;
      for (const d of docks) { let dd = Math.abs(sh.t - d.t); if (dd > 0.5) dd = 1 - dd; prox = Math.max(prox, Math.max(0, 1 - dd / 0.05)); }
      moveF = 1 - 0.7 * prox;
    }
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
    // Fondu d'entrée : un bateau naît sur le bord du ruban, qui reste visible en
    // vue dézoomée — sans ce fondu il POPPE au bord de la carte.
    const prevAlpha = ctx.globalAlpha;
    if ((sh.fade || 0) < 1) ctx.globalAlpha = prevAlpha * (sh.fade || 0);
    // Sillage additif derrière la poupe + ombre : pivotés au CAP COMPLET (l'eau
    // suit la pente, seul le sprite de coque reste droit).
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(heading);
    if (vis.wake > 0) {
      const WL = s * (0.85 + spd01 * 0.8) * (0.35 + 0.65 * moveF) * sizeMul * 0.7;
      const foam = vstage === 'cosmic' ? '150,220,255' : '225,238,245';
      // Le sillage dit le MÉTIER autant que la coque : un cargo laboure, un
      // plaisancier effleure, un pêcheur à l'ancre ne trouble rien du tout.
      const wa = (0.10 + spd01 * 0.10) * moveF * vis.wake;
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
    const isoBoat = isoArt('boat-' + vis.key + '-' + boatSector(heading));
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    const bob = Math.sin((now || 0) / 1600 + (sh.phase || 0)) * s * 0.015;
    if (isoBoat && isoBoat.ready) {
      const dw = s * (BOAT_SIZES[vstage] || 0.7) * sizeMul * 1.15;
      ctx.drawImage(isoBoat.img, p.x - dw / 2, p.y - dw * 0.58 + bob, dw, dw);
    } else if (sh.kind !== 'trade') {
      // Repli des métiers dont l'art n'est pas encore récolté. SANS lui on ne
      // verrait rien du tout et il serait impossible de régler vitesses, voies
      // et durées avant que les sprites arrivent — or c'est précisément ce
      // réglage-là qui décide si le fleuve est vivant.
      drawIsoBoatStub(ctx, p, s, sizeMul, heading, bob, sh);
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
    // Ancre écran pour la passe de nuit (drawIsoShipNight) : les feux de
    // position ne peuvent pas être peints ici, le voile passerait dessus.
    sh._nav = { x: p.x, y: p.y, dw: s * 0.7 * sizeMul, heading };
    sh._navAt = now;
    ctx.globalAlpha = prevAlpha;
  }
}

// ── OISEAUX : nuée qui traverse le ciel ─────────────────────────────────────
// Passe AÉRIENNE sur le modèle des drones : position monde → worldToScreen pour
// l'ombre au sol, puis l'oiseau dessiné en altitude au-dessus. Sans cette ombre,
// il flotte hors du monde.
// Sans état : la nuée est une fonction PURE de (now, graine de nuée). Le numéro
// de nuée vient du temps, sa trajectoire d'un hachage de ce numéro → deux
// traversées ne se ressemblent pas, et une capture reste reproductible.
// Trajectoire ancrée sur le CENTRE DE LA VILLE (monde) et non sur l'écran : une
// nuée calée sur le viewport glisserait avec la caméra.
// Molette : __birds({ on, period, cross, size }).
const BIRD_TUNE = { on: true, period: 82000, cross: 15000, size: 1 };
if (typeof window !== 'undefined') {
  window.__birds = (o) => { if (o) Object.assign(BIRD_TUNE, o); return { ...BIRD_TUNE }; };
}
// Ancre de la traversée en cours (cf. drawIsoBirds) : le SEUL état de la couche.
let _birdAnchor = { idx: -1, ax: 0, ay: 0 };

function drawIsoBirds(now) {
  CM._birdsOn = false;
  const L = CM.layout;
  if (!BIRD_TUNE.on || !L || CM.lodActive) return;
  const k = CM.ambianceK ?? 1;
  if (k <= 0) return;
  // Les oiseaux rentrent au crépuscule et ne volent pas en pleine nuit.
  const n = CM.nightF || 0;
  const dayK = n < 0.1 ? 0.75 : n < 0.45 ? 1 : n < 0.7 ? (0.7 - n) / 0.25 : 0;
  if (dayK <= 0.02) return;
  const t = now || 0;
  const T = CM.TILE, z = CM.cam.zoom, ctx = CM.ctx;
  const idx = Math.floor(t / BIRD_TUNE.period);
  const ph = (t % BIRD_TUNE.period) / BIRD_TUNE.cross;   // > 1 = ciel vide, l'essentiel du temps
  if (ph > 1) return;
  const sd = _rnd(idx, 1), sd2 = _rnd(idx, 2), sd3 = _rnd(idx, 3);
  // Ancre de la traversée : la position monde de la CAMÉRA au moment où la nuée
  // décolle, figée pour toute la traversée. Ancrée sur le centre de la ville, la
  // nuée passait presque toujours hors champ (la caméra n'en voit qu'un bout) ;
  // recalculée à chaque frame, elle glisserait avec la caméra. On la fige donc
  // une fois par numéro de nuée.
  if (_birdAnchor.idx !== idx) _birdAnchor = { idx, ax: CM.cam.x, ay: CM.cam.y };
  // Portée = un peu plus large que le champ visible : la nuée entre par un bord
  // et sort par l'autre, quel que soit le zoom.
  const span = (CM.cw / Math.max(0.2, z)) * 1.5;
  const dir = sd2 < 0.5 ? 1 : -1;
  // Décalage latéral MODÉRÉ : trop large, la traversée passe hors du champ et le
  // joueur ne voit jamais rien, ce qui est le défaut par défaut de cette couche.
  const off = (sd3 - 0.5) * span * 0.12;
  const wx = _birdAnchor.ax + dir * (ph - 0.5) * span;
  const wy = _birdAnchor.ay - dir * (ph - 0.5) * span * 0.5 + off;
  const alt = T * z * (2.6 + sd * 1.6);                  // altitude apparente, en px écran
  const count = 5 + Math.floor(sd * 5);                  // nuée de 5 à 9
  // Taille d'un bloc d'oiseau (l'oiseau en fait 3 de large). Plancher à 3 px :
  // au-dessous, la silhouette se perd dans le grain des toits — l'oiseau vole
  // au-dessus d'une ville en pixel art, jamais sur un ciel vide. C'est la même
  // erreur d'échelle que les fenêtres allumées et les premières bouffées de fumée.
  const px = Math.max(3, Math.round(T * z * 0.16 * BIRD_TUNE.size));
  // Fondu aux deux bouts : la nuée entre et sort du champ sans apparaître d'un coup.
  const edge = Math.min(1, Math.min(ph, 1 - ph) / 0.12);
  const a = 0.8 * dayK * k * edge;
  if (a < 0.03) return;
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    // Formation en V : rang i de part et d'autre du chef.
    const rank = Math.ceil(i / 2), side = i % 2 === 0 ? 1 : -1;
    const bwx = wx - dir * rank * T * 0.75;
    const bwy = wy + side * rank * T * 0.62;
    const g = worldToScreen(bwx, bwy);
    if (g.x < -40 || g.x > CM.cw + 40 || g.y < -40 || g.y > CM.ch + alt + 40) continue;
    drawn += 1;
    // Ombre au sol : elle file sur les toits et l'herbe, c'est elle qui pose
    // l'oiseau DANS le monde plutôt qu'au-dessus de l'image.
    ctx.fillStyle = `rgba(0,0,0,${(0.10 * a * 2).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, px * 1.6, px * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Battement : 2 poses alternées, déphasées par individu → la nuée ne bat pas
    // d'un seul homme. Ailes hautes = deux pixels en V, ailes basses = un trait.
    const up = _frac(t / 220 + i * 0.37) < 0.5;
    const by = g.y - alt + Math.sin(t / 700 + i) * T * z * 0.08;
    ctx.fillStyle = `rgba(38,36,42,${a.toFixed(3)})`;
    if (up) {
      ctx.fillRect(Math.round(g.x - px * 1.5), Math.round(by - px), px, px);
      ctx.fillRect(Math.round(g.x + px * 0.5), Math.round(by - px), px, px);
      ctx.fillRect(Math.round(g.x - px * 0.5), Math.round(by), px, px);
    } else {
      ctx.fillRect(Math.round(g.x - px * 1.5), Math.round(by), px * 3, px);
    }
  }
  CM._birdsOn = drawn > 0;
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
    const dScale = (CM.droneSize || 0.58) * VEH_SCALE;   // le drone est un véhicule : même échelle
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

// ── NUIT : voile bleu puis halos des lampadaires ────────────────────────────
// Lit CM.nightF (cycle jour/nuit du runtime, forcé par les captures). Lumières
// APRÈS le voile (même ordre que le legacy). Plafonné pour la perf.
//
// FENÊTRES ALLUMÉES DES HABITATIONS : tentées le 2026-07-22, RETIRÉES. Les
// bâtiments-moteur peignent leurs carreaux dans leurs propres sprites
// (cityEngineSprites, engineSprites) et le repli procédural legacy des maisons
// aussi (buildingShapes) ; en iso les habitations sont des PNG sans lumière, et
// poser les carreaux « au jugé » sur la boîte du sprite les place mal — les
// façades ne sont pas au même endroit d'une variante à l'autre. À reprendre avec
// un CALIBRAGE SPRITE PAR SPRITE (position des ouvertures dans l'art, comme
// lampFootMetrics le fait pour la tête des mâts), pas avec des fractions de
// boîte. Le plafond de dessin devra rester un TIRAGE RÉPARTI : couper « les N
// premières » de l'ordre du layout allume un quartier et laisse le voisin noir.
// ── LAMPADAIRES par ère (retour Raph : points lumineux ANCRÉS aux mâts) ──────
// Liste déterministe par layout : cellules-route TRAVERSANTES (pas carrefour,
// pas pont, pas place), 1 sur 3, côté de chaussée par RUE. band ≥ 2 : pas de
// lampadaires aux stades primitifs (cohérence demandée). Sprites
// /pixelart/iso/lamp-{antique|gas|electric|energy}.png, posés au PEINTRE
// (drawIsoLive) ; la nuit, le halo se dessine À LA TÊTE de chaque mât.
let _isoLampCache = { at: -1, key: '', lamps: null };
function isoLamps(L, band) {
  if (band < 2 || !L.roadMap) return [];
  // Les mâts de la PLACE viennent d'isoPlaza (computeIsoLamps saute les cellules
  // 'plaza' : la place était éclairée par son PNG). Même format → ils héritent
  // des sprites d'ère, des halos, du vacillement et du LOD sans une ligne de
  // plus ici. La clé de cache porte leur nombre : changer __plaza({mode}) ou une
  // recette doit rallumer ou éteindre la place sans recharger la page.
  const plazaLamps = isoPlazaLamps(L, band);
  const key = CM.layoutRecomputeAt + ':' + plazaLamps.length;
  if (_isoLampCache.key === key && _isoLampCache.lamps) return _isoLampCache.lamps;
  const lamps = computeIsoLamps(L, CM.TILE).concat(plazaLamps);
  _isoLampCache = { at: CM.layoutRecomputeAt, key, lamps };
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
//
// ⚠ GARDES ÉCRITES EN NÉGATIF, et ce n'est pas un tic de style : toute
// comparaison avec NaN est FAUSSE, donc `alpha <= 0.004 || r < 0.6` laissait
// passer un rayon NaN jusqu'à createRadialGradient, qui JETTE — frame perdue,
// carte figée. C'est arrivé pour une phase de scintillement calculée sur un
// gx/gy absent. Sous cette forme, NaN ressort ici.
//
// (Remplacer ce dégradé par un disque pré-cuit blité a été mesuré comme un gain
// NUL : 290 dégradés = 0,7 ms de jour, 1 001 = 1,7 ms de nuit, quand un blit
// coûte ~5 µs pièce. Ne pas y retourner — cf. le relevé du profileur de frame.)
function addGlow(ctx, x, y, r, col, alpha) {
  if (!(alpha > 0.004) || !(r >= 0.6) || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${alpha.toFixed(3)})`);
  g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Molette DA du voile de nuit et des transitions : window.__nightVeil({ mulA: .5, … })
// pour ajuster en live. mulCol/mulA = teinte « heure bleue » (multiply), darkCol/darkA
// = voile sombre résiduel, duskCol/dawnCol/warmA = pics chauds de crépuscule/aube.
const NIGHT_VEIL = {
  mulCol: '96,124,224', mulA: 0.58,
  darkCol: '8,11,26', darkA: 0.30,
  duskCol: '255,120,50', dawnCol: '255,170,90', warmA: 0.22
};
if (typeof window !== 'undefined') {
  window.__nightVeil = (o) => { if (o) Object.assign(NIGHT_VEIL, o); return { ...NIGHT_VEIL }; };
}

/* ── REFLETS NOCTURNES DE LA VILLE SUR L'EAU ──────────────────────────────────
 * Portage iso de `cityMapDrawCityReflections` (renderWorld.js), qui existait
 * depuis toujours mais n'était appelé QUE par le chemin legacy
 * (cityMapRuntime.js) — le rendu iso ne l'a jamais eu. Même grammaire que les
 * lanternes de pont (drawIsoBridgeNight) : nappes lumineuses ancrées à la berge
 * urbaine, étirées vers le centre du fleuve, qui scintillent en décalé.
 *
 * POURQUOI ÇA MARCHE LÀ OÙ LE GRAIN ÉCHOUE : c'est de la lumière ADDITIVE
 * (`lighter`) posée APRÈS le voile de nuit, sur une eau que ce même voile vient
 * d'assombrir. Le contraste est donc MAXIMAL exactement là où le moucheté se
 * faisait écraser. Un effet strictement nocturne n'a pas à lutter contre la nuit.
 *
 * ⚠ Ne pas confondre avec les « reflets sous la rive » du pixelRiver legacy,
 * ANNULÉS par Raph le 2026-07-02 : ceux-là étaient un lustrage permanent de la
 * berge, ceux-ci sont les lumières de la ville, la nuit seulement.
 *
 * Seule vraie adaptation : la PROJECTION. Le legacy calcule l'angle de la nappe
 * depuis la normale MONDE (`atan2(n.ny, n.nx)`), ce qui suppose que l'écran
 * conserve les angles — faux en iso. On projette donc DEUX points monde (ancrage
 * à la berge, pointe vers le centre) et on déduit angle et longueur À L'ÉCRAN.
 * ------------------------------------------------------------------------- */
export const cityReflectionTune = { on: true, gain: 1, stride: 2, reach: 1 };
if (typeof window !== 'undefined') window.__cityReflect = cityReflectionTune;
function drawIsoCityReflections(ctx, now) {
  const RT = cityReflectionTune;
  if (!RT.on) return;
  const night = CM.nightF || 0;
  if (night < 0.2) return;                                   // effet strictement nocturne
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples) return;
  const band = L.counts ? (L.counts.eraBand | 0) : 0;
  if (band <= 1) return;                                     // campement : pas de ville riveraine
  // Reflets des bâtiments riverains : l'Usure ne les coupe plus non plus
  // (Raph, 2026-07-27). Seul l'effondrement en cours éteint la surface.
  if (CM.collapseAt) return;
  ensureQuayGate();
  const g = CM.quayGate;
  if (!g) return;
  const sm = rv.samples, n0 = sm.length, T = CM.TILE;
  const t = now || 0;
  // Teintes reprises telles quelles du legacy (accordées aux lampes de quai).
  const glow = band <= 5 ? '255,210,140'
    : band === 6 ? '150,225,255'
      : band === 7 ? '90,240,180' : band === 8 ? '255,205,120' : '170,140,255';
  const nAt = (i) => {
    const o = sm[Math.max(0, i - 1)], q = sm[Math.min(n0 - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1;
    return { nx: -ty / tl, ny: tx / tl };
  };
  ctx.save();
  riverRibbonPath(ctx, sm, T);
  ctx.clip();                                                // les nappes restent SUR l'eau
  ctx.globalCompositeOperation = 'lighter';
  const STRIDE = Math.max(1, RT.stride | 0);
  for (let si = 0; si < 2; si += 1) {
    const side = si ? -1 : 1, gate = si ? g.minus : g.plus;
    if (!gate) continue;
    for (let i = 0; i < n0; i += STRIDE) {
      if (!gate[i]) continue;                                // berge non urbaine : rien à refléter
      const s = sm[i], n = nAt(i);
      const shimmer = 0.45 + 0.55 * Math.sin(t / 1300 + i * 0.9 + si * 2.1);
      const a = night * (0.10 + 0.07 * (i % 3)) * Math.max(0, shimmer) * RT.gain;
      if (a < 0.012) continue;
      const reach = s.hw * (0.50 + 0.18 * Math.sin(t / 2000 + i * 0.5)) * RT.reach;
      const pB = worldToScreen((s.x + side * n.nx * s.hw) * T, (s.y + side * n.ny * s.hw) * T);
      const pT = worldToScreen((s.x + side * n.nx * (s.hw - reach)) * T, (s.y + side * n.ny * (s.hw - reach)) * T);
      const dx = pT.x - pB.x, dy = pT.y - pB.y;
      const RL = Math.max(3, Math.hypot(dx, dy));
      const cx = (pB.x + pT.x) / 2, cy = (pB.y + pT.y) / 2;
      if (cx < -RL || cx > CM.cw + RL || cy < -RL || cy > CM.ch + RL) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(dy, dx));                        // angle ÉCRAN, pas monde
      ctx.scale(1, 0.42);                                    // fin le long de la rive
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

function drawIsoNight(now) {
  const n = CM.nightF || 0;
  const ctx = CM.ctx, L = CM.layout;
  const V = NIGHT_VEIL;
  // Aube/crépuscule (porté du legacy cityMapDrawNight) : voile chaud qui pique à
  // mi-transition (n=0.5) — orange quand la nuit monte, or rosé quand elle se retire.
  const twilight = 4 * n * (1 - n);
  if (twilight > 0.25) {
    const col = CM.dayRising === false ? V.dawnCol : V.duskCol;
    ctx.fillStyle = `rgba(${col},${((twilight - 0.25) * V.warmA).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
  }
  // Nuit « heure bleue » : une passe MULTIPLY teintée décale toute la scène vers
  // le bleu en préservant les contrastes (l'ancien voile plat écrasait les
  // couleurs), puis un voile sombre léger règle la luminosité. Les lumières se
  // dessinent PAR-DESSUS en additif ; la passe de lumière tourne AUSSI de jour
  // (flammes de torche, néon).
  if (n > 0.03) {
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(${V.mulCol},${(V.mulA * n).toFixed(2)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
    ctx.globalCompositeOperation = prevOp;
    ctx.fillStyle = `rgba(${V.darkCol},${(V.darkA * n).toFixed(2)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
  }
  // Reflets de la ville sur l'eau : APRÈS le voile (sinon le multiply les éteint),
  // avant les halos de lampadaires — même ordre additif que le legacy.
  drawIsoCityReflections(ctx, now);
  // Feux de la ville (scènes moteur, braseros des merveilles) : ils ont déposé
  // leur lumière pendant la passe des bâtiments, on la pose ici. AVANT le retour
  // anticipé ci-dessous : un feu brûle aussi de jour et hors LOD-lampes, et une
  // file jamais vidée traînerait d'une frame sur l'autre.
  paintFlameGlows(ctx);
  // Halos des lampadaires : DÉPOSÉS pendant la passe vivante, chacun à la
  // profondeur de son mât, puis posés ici par-dessus le voile — c'est ce
  // détour qui leur fait respecter le tri peintre (cf. lightLayer.js). Le
  // dessin direct ci-dessous n'est plus qu'un REPLI (calque indisponible ou
  // molette __lightOcclusion({on:false})) : il ignore l'occultation.
  if (paintLightLayer(ctx)) return;
  if (!L || CM.lodActive) return;                     // pas de sprites-lampes en LOD → pas de lumières
  const K = isoLampLightFrame(L);
  if (!K) return;
  const b = visibleCellBounds(0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const lp of isoLamps(L, K.band)) {
    if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
    if (!lampLit(lp, K)) continue;
    paintLampGlow(ctx, lp, worldToScreen(lp.wx, lp.wy), K, now);
  }
  ctx.restore();
}

// Constantes d'éclairage des mâts pour LA frame (null = personne n'éclaire) :
// teinte de l'ère, métriques du sprite, visibilité jour/nuit. Extrait de la
// passe de nuit pour servir aux deux chemins — dépôt dans le calque (nominal)
// et dessin direct (repli).
function isoLampLightFrame(L) {
  if (!LAMP_LIGHT.on || CM.lodActive || !L || !L.roadMap) return null;
  const band = (L.counts && L.counts.eraBand) | 0;
  const lig = LAMP_LIGHTS[lampEraForBand(band)] || LAMP_LIGHTS.antique;
  const n = CM.nightF || 0;
  const vis = lig.day + (1 - lig.day) * n;            // visibilité diurne/nocturne de la source
  if (vis <= 0.02) return null;
  // Métriques du sprite pour placer les sources sur la tête (mêmes calculs que le peintre).
  const art = isoArt('lamp-' + lampEraForBand(band) + '?v=' + LAMP_V);
  const m = (art.ready && lampFootMetrics(art)) || { footXf: 0.5, footYf: 0.97, usedHf: 0.92 };
  const unit = CM.TILE * CM.cam.zoom;
  const hpx = unit * LAMP_TUNE.h / (m.usedHf || 1);
  const wpx = art.ready ? hpx * ((art.img.naturalWidth || 1) / (art.img.naturalHeight || 1)) : hpx * 0.5;
  return { band, lig, m, hpx, wpx, vis, n, unit, gain: LAMP_LIGHT.gain, stride: isoLampStride(L, band) };
}

// Plafond de mâts éclairés par frame (garde-fou perf historique) — rendu
// RÉPARTI. Depuis que les halos se déposent dans le tri peintre, « éclairer les
// 320 premiers » n'a plus le même sens : le tri les prend du NORD au SUD, si
// bien que le plafond dessinait une frontière horizontale nette au milieu de la
// ville, moitié haute allumée, moitié basse éteinte (vu au dézoom d'une
// mégapole). On compte donc les mâts VISIBLES et on n'en éclaire qu'un sur k,
// tirés par hash de cellule : stable d'une frame à l'autre (pas de clignotement
// au pan) et réparti sur toute la vue.
const LAMP_LIGHT_CAP = 320;
function isoLampStride(L, band) {
  const b = visibleCellBounds(0);
  let nVis = 0;
  for (const lp of isoLamps(L, band)) {
    if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
    nVis += 1;
  }
  return Math.max(1, Math.ceil(nVis / LAMP_LIGHT_CAP));
}
const lampLit = (lp, K) => K.stride <= 1 || ((cmHash('lmpcap:' + lp.gx + ':' + lp.gy) >>> 0) % K.stride) === 0;

// Emprise ÉCRAN, généreuse, de la lumière d'un mât : nappe de tête, flaque au
// sol et cœurs réunis. Elle décide quels sprites paieront une découpe — la
// majorer coûte quelques découpes de plus, la minorer laisserait de la lumière
// traverser un mur.
function lampGlowBox(p, K) {
  const R = K.unit * 1.05;
  return { x0: p.x - K.wpx - R, y0: p.y - K.hpx * K.m.footYf - R, x1: p.x + K.wpx + R, y1: p.y + R * 0.6 };
}

// Peint le halo d'UN mât sur `pctx` (composite additif déjà posé).
function paintLampGlow(pctx, lp, p, K, now) {
  const { lig, m, hpx, wpx, vis, n, unit, gain } = K;
  const boxL = p.x - wpx * m.footXf, boxT = p.y - hpx * m.footYf;
  const ph = lampPhase(lp);
  const fl = lampFlicker(lig.style, now, ph);
  // — NUIT : halo ambiant à la tête + flaque au sol (n uniquement), scintillés.
  if (n > 0.03) {
    const hx = boxL + lig.hx * wpx, hy = boxT + lig.hy * hpx;
    addGlow(pctx, hx, hy, Math.max(4, unit * 0.78) * (0.9 + 0.2 * fl), lig.col, Math.min(0.6, 0.5 * n) * fl * gain);
    const rp = Math.max(4, unit * 0.8);
    const g2 = pctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rp);
    g2.addColorStop(0, `rgba(${lig.col},${(0.17 * n * fl * gain).toFixed(3)})`);
    g2.addColorStop(1, `rgba(${lig.col},0)`);
    pctx.fillStyle = g2;
    pctx.beginPath();
    pctx.ellipse(p.x, p.y, rp * 0.8, rp * 0.4, 0, 0, Math.PI * 2);
    pctx.fill();
  }
  // — SOURCE VIVE (jour + nuit) : cœur lumineux scintillant sur chaque flamme/lanterne.
  for (const e of lig.em) {
    let ex = boxL + e.fx * wpx, ey = boxT + e.fy * hpx;
    if (lig.style === 'fire') {              // la flamme ondule : monte quand elle brille, oscille un peu
      ey -= wpx * 0.10 * (fl - 0.72);
      ex += wpx * 0.05 * Math.sin((now || 0) * 0.021 + ph);
    }
    const r = unit * e.r * (0.8 + 0.35 * fl);
    addGlow(pctx, ex, ey, r, lig.col, Math.min(0.85, 0.62 * vis * fl * gain));
  }
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
  // Vie de la carte (option joueur) : on retire des ANCRES entières, on ne rend
  // pas toutes les particules translucides — une pluie de fantômes est plus
  // fatigante que moins de feuilles, et le contraste de l'image reste intact.
  const ambK = CM.ambianceK ?? 1;
  if (ambK <= 0) return;
  const thin = (a) => ambK >= 1 || (a.s % 1000) / 1000 < ambK;
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
    // BUDGET DE MOUVEMENT : l'œil ne suit que quelques choses à la fois. Quand
    // une nuée traverse, elle prend la vedette et les feuilles s'effacent un peu,
    // sinon les deux couches se concurrencent et l'image devient agitée.
    const leafK = CM._birdsOn ? 0.55 : 1;
    const dayDim = (1 - 0.65 * n) * leafK;               // s'effacent la nuit
    if (dayDim > 0.05) {
      const prevAA = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      for (const a of anchors) {
        if ((a.s % 2) !== 0) continue;                   // ~1 arbre sur 2 perd des feuilles
        if (!thin(a)) continue;
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
      if (!thin(a)) continue;
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
  // PONT « 3/4 top-down » (chantier relancé 2026-07-16) : tablier dans le plan
  // du sol + verticalité ÉCRAN (face d'épaisseur, piles, parapets) — cf.
  // isoBridge.js. L'ombre se dessine AVANT les bateaux (drawIsoBridgeUnder,
  // cf. drawIsoWorld) ; TOUT LE RESTE (platelage compris) vit au tri peintre
  // (kind 'bridgeSeg') — plus rien à dessiner ici. A/B : __isoBridge3d(false)
  // rebranche les anciens chemins ci-dessous.
  if (isoBridge3dFlag.on) return;
  const T = CM.TILE, ctx = CM.ctx;
  const bandA = (L.counts && L.counts.eraBand) | 0;
  // PONTS (ancien chemin) : TABLIER PLAT PROJETÉ + rampes (décision Raph
  // 2026-07-12 : les sprites de pont complet, même normalisés en angle, gardent
  // leur PERSPECTIVE interne — re-tournés ils paraissent tordus ; « annule et
  // remet comme avant »). Les sprites bridge-full-* restent sur disque, débranchés.
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
// char, caravane, tram). Tableau = fichier à afficher pour la dir MONDE 0..3
// (E,O,S,N → écran SE,NO,SO,NE). Le wagon est correct tel quel (default).
// L'entrée `cart` est partie avec le retrait des véhicules poussés à la main.
const VEH_DIAG_MAP = {
  default: ['southeast', 'northwest', 'southwest', 'northeast'],
  car: ['southwest', 'northwest', 'southeast', 'northeast'],
  chariot: ['southwest', 'northwest', 'southeast', 'northeast'],
  // caravan : labels devenus VRAIS après la régénération d'animation (le modèle
  // v3 a « redressé » l'orientation, re-audit veh-audit2.png 2026-07-11) → map
  // par défaut. ⚠ RE-AUDITER après toute régénération : les labels bougent.
  tram: ['southwest', 'northwest', 'southeast', 'northeast'],
};
// Pas de roue (fraction de tuile parcourue par frame de bande diagonale) : par défaut
// il SUIT VEH_SCALE (0.144 · 0.625 = 0.09, le réglage d'origine à taille pleine) — une
// roue rétrécie couvre moins de sol par tour, sinon elle glisse au lieu de rouler.
// __vehStride(x) impose une valeur fixe (unités finales), __vehStride(0) rend la main
// au suivi automatique. Même contrat que __strideLen pour le pas des piétons.
const vehStrideT = { v: null };
function vehStride() { return vehStrideT.v != null ? vehStrideT.v : 0.144 * VEH_SCALE; }
if (typeof window !== 'undefined') window.__vehStride = (x) => { vehStrideT.v = x > 0 ? x : null; return vehStride(); };

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
  const fr = nf > 1 ? Math.floor((v.rollDist || 0) / (CM.TILE * vehStride())) % nf : 0;
  const s = CM.TILE * z;
  // Hauteur exprimée AVANT AGENT_SCALE, comme les `scale` d'agents (0.975·0.8 = 0.78
  // tuile, l'ancienne valeur en dur) : la bête de trait suit donc la taille des
  // habitants. Plus haut que le 0.72-0.74 legacy parce que l'objet a du vide autour.
  const dh2 = s * 0.975 * AGENT_SCALE, dw2 = dh2;
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
    // Le porteur marche sur une route, donc toujours en biais à l'écran : vue
    // DIAGONALE si sa bande est livrée (même contrat que les habitants d'ère,
    // animation par DISTANCE via l'odomètre v.rollDist), sinon repli cardinal.
    const nm = v.woman ? 'basket-woman' : 'basket-man';
    const walking = (v.pauseT || 0) <= 0;
    if (!drawNamedAgentIso(ctx, p.x, p.y, z, nm, 0.85, v.dir, walking, now, v.x * 0.02, 1, v.rollDist != null ? v.rollDist : null)) {
      drawNamedAgent(ctx, p.x, p.y, z, nm, 0.85, v.dir, walking, now, v.x * 0.02);
    }
    return;
  }
  const size = VEH_SIZES[v.type];
  if (!size) return;                               // type sans sprite (broken_cart…) : rien en iso
  // VEH_SCALE (molette __vehScale) était ignoré ICI : la vue iso dessinait les
  // véhicules à leur taille d'art brute. Il est appliqué à la carrosserie ET aux
  // distances d'attelage plus bas, sinon l'équipage décroche de la carrosserie.
  const dh = s * size * VEH_SCALE, dw = dh;
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
    : usedDiag ? Math.floor((v.rollDist || 0) / (T * vehStride())) % nf
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
    const D = (pull.dist || 0.44) * T * VEH_SCALE;
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
    const D = 0.34 * T * VEH_SCALE;
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
  // Ombre posée au SOL STABLE (sp.y, sans le wobble) : elle ne saute pas avec le
  // corps — seul le sprite bondit dessus (le duo qui bobbait ensemble « volait »).
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(sx, sp.y, ph * 0.85, ph * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  const rgen = ((p.charType || 0) === 1 ? 'woman' : 'man') + '-' + (p.weapon === 'fork' ? 'fork' : 'torch');
  const rEra = riotEraKey((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0);
  // BANDES DIAGONALES (DA « Figurine d'époque », batch riotIsoRoster) d'abord :
  // ère puis base médiévale ; repli CARDINAL legacy tant qu'une bande manque.
  // Anim par DISTANCE (p.walkDist, posé par updateCrisis) — anti-patinage.
  const wd = p.walkDist != null ? p.walkDist : null;
  // groundFeet=true : les PIEDS MESURÉS de la bande touchent groundY — l'ombre
  // (ci-dessus) est posée à ce même point ; sans ça, la marge transparente du
  // roster (~12 % du cadre) suspendait l'émeutier au-dessus de son ombre.
  let dim = drawNamedAgentIso(ctx, sx, groundY, z, 'rioter-' + rEra + rgen, 0.85, p.dir, walking, now, p.phase, 1, wd, true)
    || (rEra ? drawNamedAgentIso(ctx, sx, groundY, z, 'rioter-' + rgen, 0.85, p.dir, walking, now, p.phase, 1, wd, true) : false);
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
// Taille de dessin MAXIMALE d'une halle, en multiples de l'atelier de son type.
// Valeur choisie À L'ŒIL sur captures comparées (foragers 60, band 0, zoom 3.2) :
//   1.35 → panier à la taille d'un atelier : la halle devient INDISCERNABLE, on
//          perd le monument que le modèle « halle + ateliers » promet ;
//   1.7  → panier à hauteur de poitrine : nettement le plus gros du quartier,
//          et encore un objet qu'un humain peut porter. ← retenu
//   2.1  → panier à l'épaule, on repart vers l'absurde ;
//   3    → aucun bornage : la scène s'étire sur toute l'emprise.
// Molette de réglage en live : window.__hallSceneMax.
const HALL_SCENE_MAX_DEFAULT = 1.7;
// ⚠ Le bornage ne vaut QUE pour les ères où la scène est un DIORAMA D'OBJETS
// (campements, paniers, huttes : bandes 0-2). Là, agrandir la scène agrandit un
// panier de fruits, ce qui est absurde. À partir de la pierre (bande 3+), la
// scène EST un bâtiment, terrasse et perron compris dans le sprite : le borner
// rétrécissait le bâtiment ET escamotait son socle — « certains bâtiments n'ont
// plus de sols » (Raph, capture d'une ville band 4 ; halle des guildes mesurée à
// 0,57× et sa terrasse pavée disparue avec elle). Un bâtiment de pierre plus
// grand est simplement un plus grand bâtiment : rien à corriger.
const HALL_SCENE_CAP_MAX_BAND = 2;
const isoEngineScenesFlag = { on: true };
if (typeof window !== 'undefined') window.__isoEngineScenes = (on) => { isoEngineScenesFlag.on = on !== false; return isoEngineScenesFlag.on; };
const _isoSceneQuarantine = new Set();   // buildingIds dont la scène a jeté (repli socle)

// ── SILHOUETTE DORÉE DU MOTEUR SURVOLÉ ──────────────────────────────────────
// Les habitations ont leur liseré depuis A3 (drawPixelHouseOutline) : elles ont
// UNE image, on la décale quatre fois et on remplit en source-in. Un moteur n'en
// a pas une mais une SCÈNE — des props PixelLab blités plus quelques détails
// procéduraux. On la redessine donc HORS ÉCRAN pour obtenir la même chose.
//
// ⚠ CE QUI REND L'ÉCHANGE POSSIBLE : drawEngineSprite ne reçoit pas de contexte,
// il lit CM.ctx une fois en tête ; et cityEngineSprites, lui, reçoit le sien
// d'en haut et ne relit jamais CM.ctx. Échanger CM.ctx le temps du tracé
// redirige donc la scène ENTIÈRE, props compris. Vérifié avant d'écrire.
//
// La scène n'est dessinée QU'UNE FOIS hors écran (elle est chère), et ce sont
// ses quatre copies décalées qui sont bon marché. Ne tourne que pour la tuile
// survolée : au plus un moteur par frame.
// ── EMPRISE RÉELLE D'UNE SCÈNE MOTEUR (encre), en fractions de sa boîte ─────
// ⚠ LA BOÎTE D'UNE SCÈNE EST CARRÉE, de côté égal à la largeur du losange. Or
// un losange iso est deux fois plus large que haut : le carré déborde donc
// ÉNORMÉMENT au-dessus du bâtiment, sur du vide transparent. Publier ce carré
// tel quel au hit-test faisait qu'un moteur volait le survol de ses voisins —
// souris sur la guilde, ce sont les Tribunaux qui s'allumaient. Les habitations
// n'ont jamais eu ce défaut : drawPixelHouse rend une boîte ROGNÉE sur le
// contenu du sprite.
//
// On mesure donc l'encre une fois par espèce de bâtiment, à taille de
// référence, et on met le résultat en cache. Le rendu d'une scène dépend de
// l'identifiant, du palier d'achat et de l'ère : la clé les porte tous.
const ENG_INK_REF = 96;                 // côté de la mesure, assez fin sans coûter
const _engInkCache = new Map();
let _engInkCanvas = null;
function engineInkFrac(t, now) {
  if (typeof document === 'undefined') return null;
  const key = (t.buildingId || t.variant || '?') + ':' + (t.tier || 0)
    + ':' + (CM.layout?.counts?.eraBand ?? 0) + ':' + (CM.layout?.counts?.eraIndex ?? 0);
  const cached = _engInkCache.get(key);
  if (cached) return cached;
  if (!_engInkCanvas) {
    _engInkCanvas = document.createElement('canvas');
    _engInkCanvas.width = ENG_INK_REF; _engInkCanvas.height = ENG_INK_REF;
  }
  const c = _engInkCanvas;
  const cctx = c.getContext('2d', { willReadFrequently: true });
  cctx.clearRect(0, 0, ENG_INK_REF, ENG_INK_REF);
  const prevCtx = CM.ctx;
  CM.ctx = cctx;
  // Mesure hors écran : ni lueur de feu ni découpe de lumière ne doivent en
  // sortir (la scène est dessinée en (0,0) d'un canvas de 96 px).
  suspendFlameGlow(true);
  suspendLightLayer(true);
  try { drawEngineSprite(t, 0, 0, ENG_INK_REF, ENG_INK_REF, now); }
  catch { CM.ctx = prevCtx; suspendFlameGlow(false); suspendLightLayer(false); return null; }
  suspendFlameGlow(false);
  suspendLightLayer(false);
  CM.ctx = prevCtx;

  const d = cctx.getImageData(0, 0, ENG_INK_REF, ENG_INK_REF).data;
  let x0 = ENG_INK_REF, y0 = ENG_INK_REF, x1 = -1, y1 = -1;
  for (let y = 0; y < ENG_INK_REF; y += 1) {
    for (let x = 0; x < ENG_INK_REF; x += 1) {
      if (d[(y * ENG_INK_REF + x) * 4 + 3] < 16) continue;   // quasi transparent
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  // Rien d'encré : props pas encore chargés, ou scène en repli. On ne met RIEN
  // en cache — sinon la première frame, celle où les PNG manquent encore,
  // figerait une emprise fausse pour toute la session.
  if (x1 < x0 || y1 < y0) return null;
  const frac = {
    x0: x0 / ENG_INK_REF,
    y0: y0 / ENG_INK_REF,
    w: (x1 - x0 + 1) / ENG_INK_REF,
    h: (y1 - y0 + 1) / ENG_INK_REF
  };
  _engInkCache.set(key, frac);
  return frac;
}

let _engOutlineA = null, _engOutlineB = null;
function drawIsoEngineOutline(t, bx, by, bw, now, color) {
  if (typeof document === 'undefined') return;
  const p = 1;
  const w = Math.max(1, Math.ceil(bw));
  const cw = w + p * 2;
  if (!_engOutlineA) { _engOutlineA = document.createElement('canvas'); _engOutlineB = document.createElement('canvas'); }
  const a = _engOutlineA, b = _engOutlineB;
  if (a.width < w || a.height < w) { a.width = w; a.height = w; }
  if (b.width < cw || b.height < cw) { b.width = cw; b.height = cw; }
  const actx = a.getContext('2d'), bctx = b.getContext('2d');
  actx.clearRect(0, 0, a.width, a.height);
  bctx.clearRect(0, 0, b.width, b.height);

  const prevCtx = CM.ctx;
  CM.ctx = actx;
  // Les feux ne doivent PAS éclairer pendant cette passe : le remplissage
  // source-in ci-dessous convertit tout pixel non transparent en or, si bien
  // qu'un halo doux deviendrait une auréole autour du bâtiment au lieu d'un
  // liseré net. La silhouette veut la MATIÈRE de la scène, pas sa lumière.
  // Même raison pour la COUCHE DE LUMIÈRE : la scène est redessinée en (0,0),
  // dans un canvas auxiliaire — une découpe partirait à l'autre bout de l'écran.
  suspendFlameGlow(true);
  suspendLightLayer(true);
  try {
    drawEngineSprite(t, 0, 0, w, w, now);
  } catch {
    suspendFlameGlow(false);
    suspendLightLayer(false);
    CM.ctx = prevCtx;
    return;                       // une scène qui jette ne doit pas coûter la frame
  }
  suspendFlameGlow(false);
  suspendLightLayer(false);
  CM.ctx = prevCtx;

  // On ne blitte QUE la zone utile : le canevas est réutilisé et peut être plus
  // grand que la boîte courante (il ne rétrécit jamais).
  for (const [dx, dy] of [[0, p], [p * 2, p], [p, 0], [p, p * 2]]) {
    bctx.drawImage(a, 0, 0, w, w, dx, dy, w, w);
  }
  bctx.globalCompositeOperation = 'source-in';
  bctx.fillStyle = color;
  bctx.fillRect(0, 0, cw, cw);
  bctx.globalCompositeOperation = 'source-over';

  const ctx = CM.ctx;
  const sm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(b, 0, 0, cw, cw, bx - p, by - p, cw, cw);
  ctx.imageSmoothingEnabled = sm;
}

function drawIsoEngineScene(ctx, t, anchor, spanX, spanY, T, z, hh, now) {
  const id = t.buildingId || t.variant || '?';
  if (_isoSceneQuarantine.has(id)) return false;
  // Scènes DE SOL (champs irrigués, aqueducs…) : elles PEIGNENT leur emprise en
  // repère carré → posées en boîte, elles font une dalle qui déborde du lot (vu à
  // la capture : irrigated_fields 10×6 par-dessus le fleuve). Elles retombent sur
  // le rendu d'emprise iso dédié (parcelle plate à sillons / bloc bas).
  if (/field|farm|crop|orchard|aqueduct/i.test(id)) return false;
  // Jalon profileur : clôt la tranche générique du peintre — tout ce qui suit
  // (scène + mesure d'encre) s'impute au poste dédié 'vif-moteurs'. C'est la
  // mesure qui décide du chantier « scènes cuites » (étape 0 du plan).
  fp('vif-peinture');
  // ── Échelle de la scène : BORNÉE, jamais l'emprise brute ────────────────────
  // La halle occupe un grand lot, mais sa scène ne doit pas être celle d'un
  // atelier AGRANDIE : c'est exactement ce qui peignait un panier de fruits plus
  // haut qu'un homme (capture Raph). On borne la taille de dessin à
  // HALL_SCENE_MAX fois celle d'un atelier du MÊME type — l'unité d'échelle de ce
  // type, celle pour laquelle sa scène a été composée. Le lot excédentaire devient
  // une CLAIRIÈRE : un bâtiment important a sa place dégagée autour de lui, il
  // n'est pas un atelier soufflé. Un atelier, lui, remplit son lot → f = 1 → cette
  // branche ne change rien pour lui.
  const spanSum = spanX + spanY;
  const unit = T * z * ISO_X * 0.72;
  const HALL_SCENE_MAX = (typeof window !== 'undefined' && window.__hallSceneMax) || HALL_SCENE_MAX_DEFAULT;
  const sceneBand = CM.layout?.counts?.eraBand ?? 0;
  const capSum = sceneBand <= HALL_SCENE_CAP_MAX_BAND
    ? (cmEngineAtelierFoot(id) || 1) * 2 * HALL_SCENE_MAX
    : Infinity;                                  // bâtiments de pierre : aucun bornage
  let bw = Math.min(spanSum, capSum) * unit;
  const f = spanSum > 0 ? Math.min(spanSum, capSum) / spanSum : 1;
  // Pieds : au coin SUD tant que le bâtiment remplit son lot (comportement
  // historique, inchangé pour les ateliers), ramenés vers le CENTRE du lot à
  // mesure qu'il s'y fait plus petit — sinon la halle se collerait au bord sud de
  // sa clairière au lieu d'y trôner.
  const ctr = worldToScreen((t.gx + spanX / 2) * T, (t.gy + spanY / 2) * T);
  let bx = ctr.x + (anchor.x - ctr.x) * f - bw / 2;
  let by = ctr.y + (anchor.y - ctr.y) * f - bw + hh * 0.5;
  // ── Variation par instance ────────────────────────────────────────────────
  // Les moteurs étaient les SEULES tuiles privées de jitter (renderBuildings le
  // réserve aux maisons via `if (t.type !== "engine")`). Tolérable tant qu'un type
  // ne posait que 13 blocs ; avec 48 ateliers alignés, l'absence de variation
  // donne un damier. Graine stable sur (gx,gy) → invariante entre frames ET entre
  // recomputes. `>>> 0` obligatoire : cmHash est SIGNÉ.
  // La HALLE (groupIndex 1) reste d'aplomb et à l'échelle : c'est le monument du
  // quartier, il ne doit ni pencher ni rapetisser.
  if ((t.groupIndex || 1) > 1) {
    const sd = cmHash(t.gx + ':' + t.gy) >>> 0;
    const k = 0.92 + (sd % 17) / 17 * 0.16;                  // 0.92..1.08
    // Ancrage par le BAS : la boîte se redimensionne sur ses pieds, sinon un
    // atelier réduit flotte au-dessus de son lot.
    by += bw * (1 - k) + ((((sd >> 9) % 5) - 2) * bw * 0.008);
    bx += bw * (1 - k) / 2 + ((((sd >> 5) % 5) - 2) * bw * 0.012);
    bw *= k;
  }
  try {
    // SURVOL : la silhouette se pose AVANT la scène, sinon elle la mange au
    // lieu de la cerner (même geste que les habitations).
    if (CM.hover && CM.hover.tile === t) drawIsoEngineOutline(t, bx, by, bw, now, HOVER_GOLD);
    // SCÈNE CUITE (engineSceneCache) : plans statiques blittés, animé en direct.
    // false = cache indisponible (molette off, échelle hors bornes, cuisson
    // échouée) → dessin direct intégral, comme avant.
    if (!drawCachedEngineScene(ctx, t, bx, by, bw, now)) {
      drawEngineSprite(t, bx, by, bw, bw, now);
    }
    // Rend la boîte publiée à l'appelant pour le hit-test au survol. Sans elle,
    // viser un moteur haut (une école, un temple) retombait sur la cellule
    // projetée sous le curseur, c'est-à-dire celle SITUÉE DERRIÈRE.
    //
    // ⚠ ROGNÉE SUR L'ENCRE, jamais la boîte carrée brute : celle-ci est aussi
    // HAUTE que large alors qu'un losange iso est deux fois plus large que haut,
    // donc elle couvre un large vide au-dessus du bâtiment. Publiée telle
    // quelle, ce vide volait le survol aux voisins — souris sur la guilde,
    // Tribunaux qui s'allument. Repli sur la boîte entière tant que l'encre
    // n'est pas mesurable (props en cours de chargement).
    const ink = engineInkFrac(t, now);
    fp('vif-moteurs');
    return ink
      ? { dx: bx + bw * ink.x0, dy: by + bw * ink.y0, dw: bw * ink.w, dh: bw * ink.h }
      : { dx: bx, dy: by, dw: bw, dh: bw };
  } catch (e) {
    fp('vif-moteurs');
    _isoSceneQuarantine.add(id);
    if (typeof console !== 'undefined') console.warn('[iso] scène moteur en quarantaine:', id, e);
    return false;
  }
}

// ── RIVERAIN (port fluvial, seul depuis la refonte éolienne du moulin) posé
// sur le RUBAN (Phase 5). Sa scène legacy suppose l'eau « en bas de la boîte »
// (repère carré) → posée en boîte iso, le bassin flottait à côté du ruban. Ici
// on DÉCOMPOSE : bâtiment (sprite transparent, JAMAIS de procédural — leçon
// carré brun) sur la berge, ponton plongeant vers le SUD monde (garanti par
// layout : waterSide "S", bord sud du lot ≈ centre du fleuve), bateau de l'ère
// amarré SUR le ruban.
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
// pièces au flanc au besoin). ch omis/null → hauteur à l'ASPECT NATUREL
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

// ── Géométrie du PONTON du port + mouillage du bateau amarré ─────────────────
// Formules extraites de drawIsoRiverside (port) : le bateau amarré est devenu
// un item de tri SÉPARÉ (kind 'portBoat') — dessiné dans la scène riveraine,
// il héritait de la profondeur de l'EMPRISE du bâtiment et passait PAR-DESSUS
// la travée du pont voisin (vu par Raph, band 7). Une seule source de formules
// pour le ponton : la scène ET le mouillage lisent ce helper.
function portDockGeom(t, spanX, T, band, ei, rv) {
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return null;
  const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
  const ccx = t.gx + spanX / 2;
  const rb = ribbonAtX(rv, ccx);
  const yEdge = rb.y - rb.hw;
  const vstage = tradeStage(band, ei);
  const sizeMul = tradeSizeMul(vstage, band);
  const smR = rv.samples;
  const iA = Math.max(0, rb.i - 2), iB = Math.min(smR.length - 1, rb.i + 2);
  const mRiv = (smR[iB].y - smR[iA].y) / ((smR[iB].x - smR[iA].x) || 1e-6);
  const axisOv = (typeof window !== 'undefined' && window.__pontoonAxis) || 'auto';
  const ewAxis = axisOv === 'ew' || (axisOv !== 'ns' && Math.abs(mRiv) > 1);
  const ewSgn = mRiv > 0 ? -1 : 1;               // côté eau de l'axe E-W
  const dockW = stage === 0 ? 0.72 : Math.min(spanX * 0.5, 0.8 + sizeMul * 0.2);
  const dockLen = 0.8 + Math.max(1.0, rb.hw * 0.6);
  const dockY0 = yEdge - 0.8, dockY1 = yEdge - 0.8 + dockLen;
  const dockYew = yEdge + 0.35;
  const dockX0 = ewSgn < 0 ? ccx + 0.8 - dockLen : ccx - 0.8;
  const dockX1 = dockX0 + dockLen;
  return { stage, ccx, rb, si: rb.i, yEdge, vstage, sizeMul, ewAxis, ewSgn, dockW, dockLen, dockY0, dockY1, dockYew, dockX0, dockX1 };
}

// Point d'amarrage (en TUILES monde) : flanc historique du ponton, ou flanc
// opposé si le premier tombe sur l'EMPRISE D'UN PONT (bridgeBlocks — le
// mouillage par défaut posait le bateau sur la travée). Coincé des deux côtés →
// null : pas de bateau plutôt qu'un bateau sur le tablier.
function portMooring(t, spanX, T, band, ei, rv) {
  const G = portDockGeom(t, spanX, T, band, ei, rv);
  if (!G || !BOAT_SIZES[G.vstage]) return null;
  const effSize = (BOAT_SIZES[G.vstage] || 0.7) * G.sizeMul;
  const myNS = Math.min(G.rb.y - 0.15, G.dockY1 - effSize * 0.1);
  const cands = G.ewAxis
    ? [[(G.ewSgn < 0 ? G.dockX0 : G.dockX1) - G.ewSgn * effSize * 0.3, G.dockYew + G.dockW / 2 + effSize * 0.45],
      [(G.ewSgn < 0 ? G.dockX0 : G.dockX1) - G.ewSgn * effSize * 0.3, G.dockYew - G.dockW / 2 - effSize * 0.45]]
    : [[G.ccx - G.dockW / 2 - effSize * 0.62, myNS],
      [G.ccx + G.dockW / 2 + effSize * 0.62, myNS]];
  const margin = (effSize * 0.55 + 0.3) * T;
  for (const [mx, my] of cands) {
    if (!bridgeBlocks(mx * T, my * T, margin)) return { ...G, effSize, mx, my, band };
  }
  return null;
}

// Bateau de l'ère amarré au ponton (ombre + clapot, pas de sillage) — le corps
// du dessin est celui du bloc historique de la scène riveraine, à l'identique.
function drawIsoPortBoat(ctx, moor, now, z, T) {
  const rv = CM.layout && CM.layout.river;
  if (!rv || !rv.samples || rv.samples.length < 2) return;
  const { vstage, sizeMul, si, ccx } = moor;
  const s = T * z;
  const o = rv.samples[Math.max(0, si - 1)], q = rv.samples[Math.min(rv.samples.length - 1, si + 1)];
  const a2 = worldToScreen(o.x * T, o.y * T), b2 = worldToScreen(q.x * T, q.y * T);
  const p = worldToScreen(moor.mx * T, moor.my * T);
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
    const boatKey = vstage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, moor.band)) : vstage;
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

function drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, ei) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
  // Échelle : 1 « cellule legacy » → px iso (entre la cellule stricte T·z et la
  // pose des maisons ~1.56·T·z) ; jugée à la capture.
  const cpx = T * z * 1.3;
  const ccx = t.gx + spanX / 2;
  const rb = ribbonAtX(rv, ccx);
  const rhw = rb.hw;
  const yEdge = rb.y - rhw;              // rive NORD du ruban AU DROIT du lot
  // Tailles par ère : mêmes formules que la scène legacy (tout grandit ensemble).
  const vstage = tradeStage(band, ei);
  const sizeMul = tradeSizeMul(vstage, band);

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
  // Géométrie PARTAGÉE avec le mouillage du bateau (item 'portBoat' du tri) :
  // formules dans portDockGeom, une seule source.
  const G = portDockGeom(t, spanX, T, band, ei, rv);
  if (!G) return;
  const { ewAxis, dockW, dockLen, dockY0, dockY1, dockYew, dockX0, dockX1 } = G;
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
  // (Le BATEAU AMARRÉ n'est plus dessiné ici : item 'portBoat' du tri peintre,
  // poussé par drawIsoLive à SA profondeur — dessiné dans la scène, il héritait
  // de la profondeur de l'emprise du bâtiment et passait PAR-DESSUS la travée
  // du pont voisin. Cf. portMooring/drawIsoPortBoat.)
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

// ── FUMÉE DE CHEMINÉE (habitations) ─────────────────────────────────────────
// Les bâtiments-moteur fument déjà, mais depuis l'INTÉRIEUR de leurs sprites
// (cityEngineSprites, posés par drawIsoEngineScene) : leur fumée est donc déjà
// triée à la profondeur du bâtiment. Les habitations, elles, sont des PNG sans
// cheminée animée. On leur ajoute un item 'smoke' DANS le tri peintre, à la
// profondeur du bâtiment plus un epsilon : ainsi la colonne passe derrière le
// bâtiment situé au nord au lieu d'être collée en surcouche plein écran, ce qui
// détruirait l'illusion de profondeur que tout le reste du rendu paie cher.
// La fumée d'habitation LEGACY (buildingShapes/renderBuildings) est gardée par
// !usePixelHouse et n'est jamais atteinte en iso : ne pas passer par là.
// Molette : __smoke({ on, share, puffs, rise }).
const SMOKE_TUNE = { on: true, share: 7, puffs: 4, rise: 1 };
if (typeof window !== 'undefined') {
  window.__smoke = (o) => { if (o) Object.assign(SMOKE_TUNE, o); return { ...SMOKE_TUNE }; };
}

// Une cheminée ne fume que quand la scène le justifie : à la tombée du jour, la
// nuit, ou sous l'averse (il fait froid et humide). En plein midi dégagé, une
// ville entière qui fume est du bruit.
function smokeSeason() {
  const n = CM.nightF || 0, r = CM.rainF || 0;
  const k = Math.max(n > 0.2 ? (n - 0.2) / 0.5 : 0, r > 0.3 ? (r - 0.3) / 0.5 : 0);
  return Math.min(1, k);
}

function drawIsoSmoke(box, s, now, k) {
  if (!box) return;
  const ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  // Source JUSTE AU-DESSUS du faîte, près de l'axe du sprite. On ne sait pas où
  // est la cheminée dans l'art (ce calibrage par variante reste à faire, cf. la
  // note des fenêtres allumées) : en partant au-dessus du toit plutôt que dessus,
  // la colonne se lit comme « de la fumée au-dessus de cette maison » et non
  // comme une bouffée qui sort du mauvais endroit.
  const ox = box.dx + box.dw * (0.42 + _rnd(s, 11) * 0.16);
  const oy = box.dy - T * z * 0.06;
  const rise = T * z * 1.5 * SMOKE_TUNE.rise;
  const wind = (CM.windX || 0) * 0.6 + 0.12;      // dérive par défaut quand il n'y a pas de vent
  const n = Math.max(1, Math.round(SMOKE_TUNE.puffs));
  const prevAA = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < n; i += 1) {
    const sd = _rnd(s, i + 20);
    const ph = _frac((now || 0) / (2600 + sd * 1800) + sd);
    // Naît dense et net, s'élargit et s'efface en montant : une bouffée qui
    // garderait sa taille lirait comme un sprite qui glisse.
    // Décroissance LINÉAIRE et non quadratique : au carré, la bouffée perdait
    // les trois quarts de son opacité sur le premier quart de sa montée et ne
    // se voyait plus du tout sur fond de nuit.
    const fade = (1 - ph) * 0.8 * k;
    if (fade < 0.02) continue;
    // Une bouffée naît à ~1/8 de tuile et triple en montant. Trop petite, elle
    // se confond avec le grain du sprite ; c'est l'écueil dans lequel sont
    // tombées les fenêtres allumées avant d'être retirées.
    const px = Math.max(2, Math.round(T * z * (0.12 + ph * 0.24)));
    const x = ox + wind * rise * ph + Math.sin(ph * 4 + sd * 6.28) * T * z * 0.06;
    const y = oy - ph * rise;
    ctx.fillStyle = `rgba(206,206,200,${fade.toFixed(3)})`;
    ctx.fillRect(Math.round(x - px / 2), Math.round(y - px / 2), px, px);
  }
  ctx.imageSmoothingEnabled = prevAA;
}

// ── CHEVRON « NOUVEAU BÂTIMENT » (A4) ────────────────────────────────────────
// Quand un achat fait sortir une maison-moteur de terre, le runtime estampille la
// tuile (t._revealPinAt, cf. cityMapRuntime). Ici on pose un chevron doré discret
// au-dessus, item du tri peintre à la profondeur du bâtiment (comme la fumée), le
// temps de REVEAL_PIN_MS. AUCUN recadrage caméra : c'est la moitié « pastille
// seule » de la fiche, le vol amorti reste à A9. Vectoriel comme les halos.
const REVEAL_PIN_MS = 1200;
function drawIsoRevealPin(box, born, now) {
  if (!box) return;
  const age = (now || 0) - born;
  if (age < 0 || age >= REVEAL_PIN_MS) return;
  // Fondu : montée rapide (~130 ms), plateau, chute douce (~360 ms).
  const a = Math.max(0, Math.min(1, Math.min(age / 130, (REVEAL_PIN_MS - age) / 360)));
  if (a <= 0.02) return;
  const ctx = CM.ctx;
  // Taille indexée sur la largeur RÉELLE du sprite (suit le zoom), bornée pour
  // rester discrète et ne pas écraser une petite maison au dézoom.
  const w = Math.max(4, Math.min(11, box.dw * 0.30));   // demi-largeur du chevron
  const h = w * 1.15;                                    // hauteur (pointe vers le bas)
  const bob = Math.sin(age / 130) * (w * 0.18);          // léger flottement
  const cx = Math.round(box.dx + box.dw / 2);
  const topY = Math.round(box.dy - h - w * 0.5 + bob);   // planant au-dessus du toit
  ctx.save();
  ctx.globalAlpha = a;
  // Chevron plein pointant vers le bas (repère « ici ») + liseré sombre pour le
  // détacher des toits clairs.
  ctx.beginPath();
  ctx.moveTo(cx - w, topY);
  ctx.lineTo(cx + w, topY);
  ctx.lineTo(cx, topY + h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,206,84,0.96)';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, w * 0.16);
  ctx.strokeStyle = 'rgba(70,46,8,0.85)';
  ctx.stroke();
  ctx.restore();
}

// ── PRÉCIPITATIONS ──────────────────────────────────────────────────────────
// Surcouche plein écran, JAMAIS un second jeu de sprites : traits d'un pixel
// inclinés par le vent, position = fonction pure de (phase, index) comme les
// particules d'ambiance — aucune goutte n'est un objet qu'on fait vivre. Seule
// la PHASE de chute est portée d'une image à l'autre, et pour une raison
// précise : les rafales font varier la vitesse (cf. stepRainPhase). Lit
// CM.rainF / CM.windX / CM.gustF publiés une fois par frame par le runtime
// (weatherMode.js). L'assombrissement passe par un aplat, et non par un
// filtre canvas, pour préserver les contrastes comme le fait le voile de nuit.
// La brume de rivière retirée le 2026-07-13 n'est PAS ressuscitée ici.
//
// EN HIVER LA MÊME AVERSE TOMBE EN NEIGE (cf. drawIsoSnowfall). Un seul signal
// météo, deux gestes : rien de nouveau n'est publié, donc tout ce qui lit déjà
// la météo (la foule qui rentre, les cheminées qui fument) vaut aussi sous la
// neige. La saison décide de la FORME, jamais de la fréquence.
//
// RAFALES (CM.gustF, cf. weatherMode.js) : l'averse arrive par paquets. Ce que
// la bourrasque ajoute à pleine force est réglé ci-dessous ; à gustF = 0 tout
// retombe EXACTEMENT sur l'averse d'avant.
// Molette : __rain({ on, drops, len, alpha, gust, width }) — gust: 0 coupe les
// rafales, width: 0.6 rend le filet d'un pixel d'avant.
const RAIN_TUNE = { on: true, drops: 1, len: 1, alpha: 1, gust: 1, width: 1 };
if (typeof window !== 'undefined') {
  window.__rain = (o) => { if (o) Object.assign(RAIN_TUNE, o); return { ...RAIN_TUNE }; };
}
const RAIN_CAP = 900;
const RAIN_FALL_PX = 900;      // px/s de la goutte la plus LENTE (les autres, jusqu'à ×1,78)
const GUST_DROPS = 0.8;        // rideau de rafale : + 80 % de gouttes, en FONDU (cf. rainSheet)
const GUST_SPEED = 0.5;        // + 50 % de vitesse de chute
const GUST_LEAN = 0.55;        // + 55 % d'inclinaison, plus une poussée plancher
const GUST_KICK = 0.15;        // ...sinon une averse sans vent ne se couche pas du tout
const GUST_LEN = 0.45;         // traits plus longs : c'est ce qui SE LIT comme de la vitesse

// ⚠ MÊME PIÈGE QUE L'EAU (cf. ⚠⚠ PHASE ACCUMULÉE) : sous rafale la vitesse de
// chute VARIE, et une vitesse variable ne se multiplie JAMAIS par un temps
// absolu — le rideau bondirait à chaque bouffée, et REMONTERAIT pendant qu'elle
// retombe. On intègre donc la descente image par image. Chaque goutte garde son
// facteur de vitesse propre (constant), donc le rideau reste dispersé, et le dt
// est plafonné : un retour d'onglet ne téléporte plus l'averse.
// PAS DE MODULO sur cette phase : la borner ferait sauter le rideau (chaque
// goutte a son facteur, aucune période commune). float64 tient des années à
// ~1,5 écran/s. Exportée pure pour le test : c'est sa CONTINUITÉ qui compte.
let rainPhase = 0, rainPhaseAt = -1;
export function stepRainPhase(prev, t, rate) {
  const dt = prev.at < 0 ? 0 : Math.min(0.25, Math.max(0, t - prev.at));
  return { at: t, phase: prev.phase + dt * rate };
}

// Un rideau de gouttes : positions pures en (index, phase), une seule passe de
// trait pour tout le rideau. Deux rideaux se superposent — celui du fond,
// toujours là, et celui de la rafale, qui n'existe qu'en OPACITÉ.
function rainSheet(ctx, seed, n, phase, W, H, dx, dy, col) {
  ctx.strokeStyle = col;
  ctx.beginPath();
  // Bande de chute élargie en X : avec du vent, les gouttes doivent entrer par le
  // bord au vent, sinon une colonne vide se creuse le long de ce bord.
  const spanX = W + Math.abs(dx) * 2 + 40;
  const x0 = -Math.abs(dx) - 20 + (dx < 0 ? Math.abs(dx) : 0);
  for (let i = 0; i < n; i += 1) {
    const sd = _rnd(seed + i, 1), sd2 = _rnd(seed + i, 2);
    const y = _frac(phase * (1 + sd2 * 0.78) + sd) * (H + dy * 2) - dy;   // gouttes de vitesses variées
    const x = _frac(sd2 + sd * 0.37) * spanX + x0;
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
  }
  ctx.stroke();
}

// Ce qui tombe pour une saison et une intensité données. Exporté pour le test :
// c'est le seul embranchement de la fiche, et il ne se voit sur aucune image.
export function precipKind(season, rainF) {
  if (!(rainF > 0.01)) return 'none';
  return (season | 0) === WINTER ? 'snow' : 'rain';
}

// Inclinaison sous rafale. Le SIGNE du vent est celui de l'averse entière (cf.
// windAt) et n'est JAMAIS touché : une bourrasque couche la pluie, elle ne la
// fait pas tourner sous les yeux du joueur. Seule l'amplitude enfle — plus une
// poussée plancher, sans quoi une averse tirée à vent quasi nul ne montrerait
// ses rafales qu'en densité.
function gustWind(g) {
  const w = CM.windX || 0;
  return w + (w < 0 ? -1 : 1) * (Math.abs(w) * GUST_LEAN + GUST_KICK) * g;
}

function drawIsoRain(now) {
  const r = CM.rainF || 0;
  if (!RAIN_TUNE.on) return;
  const kind = precipKind(CM.season, r);
  if (kind === 'none') { rainPhaseAt = -1; return; }   // horloge relâchée : l'averse suivante repart à plat
  const g = Math.max(0, Math.min(1, (CM.gustF || 0) * RAIN_TUNE.gust));
  if (kind === 'snow') { drawIsoSnowfall(now, r, g); return; }
  const ctx = CM.ctx, W = CM.cw, H = CM.ch;
  // Assombrissement : même geste que NIGHT_VEIL, un aplat ardoise. La bouffée
  // charge le ciel d'un cran au passage, puis le rend.
  ctx.fillStyle = `rgba(38,46,62,${(r * 0.18 * (1 + 0.22 * g)).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  // L'averse est de l'agitation d'ambiance : elle suit le réglage Vie de la carte.
  const k = CM.ambianceK ?? 1;
  if (k <= 0) return;
  const n = Math.min(RAIN_CAP, Math.round((W * H) / 2600 * r * k * RAIN_TUNE.drops));
  if (n <= 0) return;
  // Phase intégrée (cf. stepRainPhase) : c'est ELLE qui accélère sous la rafale.
  // Jamais dans un cliché — `captureFrame` force rainF à 0, donc cette couche ne
  // dessine pas en capture et la phase n'y entre pas.
  const st = stepRainPhase(
    { at: rainPhaseAt, phase: rainPhase }, (now || 0) / 1000,
    (RAIN_FALL_PX / Math.max(1, H)) * (1 + GUST_SPEED * g)
  );
  rainPhaseAt = st.at; rainPhase = st.phase;
  const wind = gustWind(g);
  const len = (10 + 14 * r) * RAIN_TUNE.len;          // px, trait plus long sous l'averse
  const prevAA = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // ÉPAISSEUR DU FILET. Un trait d'un pixel posé à coordonnées fractionnaires est
  // ÉTALÉ par l'anticrénelage sur deux colonnes à demi-opacité : il paraît plus
  // fin ET plus pâle qu'un vrai pixel (retour Raph 2026-07-29 : « le filet est un
  // peu trop fin »). On épaissit donc, et à l'ENTIER — 2 px sous l'averse pleine,
  // 1 px sur une bruine — plutôt que de monter l'opacité, qui aurait donné du
  // gris sale au lieu d'une goutte. La rafale ajoute sa part comme au reste.
  ctx.lineWidth = Math.max(1, Math.round((1 + 0.6 * r + 0.35 * g) * RAIN_TUNE.width));
  const lenB = len * (1 + 0.25 * g);
  rainSheet(ctx, 0, n, st.phase, W, H, wind * lenB * 0.8, lenB,
    `rgba(186,206,232,${(0.30 * r * RAIN_TUNE.alpha).toFixed(3)})`);
  // RIDEAU DE RAFALE — un SECOND jeu de gouttes, de nombre CONSTANT, dont seule
  // l'opacité suit la bouffée. Faire varier le NOMBRE ferait naître des gouttes
  // en plein vol (le compte se lit en bout de liste) : la densité doit enfler par
  // FONDU. Il tombe un peu plus vite et plus long que le fond, ce qui creuse la
  // profondeur au lieu d'épaissir uniformément le rideau.
  if (g > 0.02) {
    const lenG = len * (1 + GUST_LEN * g);
    rainSheet(ctx, 7919, Math.round(n * GUST_DROPS), st.phase * 1.18, W, H,
      wind * lenG * 0.8, lenG,
      `rgba(198,216,238,${(0.30 * r * g * RAIN_TUNE.alpha).toFixed(3)})`);
  }
  ctx.imageSmoothingEnabled = prevAA;
}

// ── NEIGE (hiver) ───────────────────────────────────────────────────────────
// Repeindre la pluie en blanc donne de la pluie blanche. Trois écarts, tous
// nécessaires pour que l'œil lise « neige » :
//   - un CARRÉ, pas un trait. Une goutte se lit à sa TRAÎNÉE, un flocon à sa
//     forme. Deux tailles, la grosse plus rapide et plus opaque : la profondeur
//     vient de ce parallaxe, pas d'un dégradé.
//   - dix fois plus LENT (≈ 100 px/s contre 900 à 1600). C'est la vitesse qui
//     dit « neige » avant même la couleur.
//   - il DÉRIVE : tangage propre au flocon EN PLUS du vent de l'averse. Sans
//     lui, mille carrés descendent en rails et on retombe sur la pluie.
// Le voile est PÂLE et non ardoise : la neige diffuse la lumière au lieu de
// l'éteindre. C'est la règle du liseré au sol (cf. SNOW plus haut), où tout ce
// qui ajoutait du SOMBRE a été refusé.
// AUCUNE ACCUMULATION au sol : le sol est baké et la saison entre dans sa clé
// (cf. seasonMode.js). Faire blanchir la ville pendant l'averse paierait une
// recuisson à chaque cran d'intensité. La neige posée reste le liseré d'hiver.
// Molette : __snowfall({ on, flakes, size, alpha }).
const SNOWFALL_TUNE = { on: true, flakes: 1, size: 1, alpha: 1 };
if (typeof window !== 'undefined') {
  window.__snowfall = (o) => { if (o) Object.assign(SNOWFALL_TUNE, o); return { ...SNOWFALL_TUNE }; };
}
// Calibré à l'écran (1208×611, TILE 32, zoom 1) : ~490 flocons de 3 px et 2 px.
// Les deux crans essayés à côté disent pourquoi c'est ce couple et pas un autre :
// à 140 flocons on ne voit RIEN sur une image fixe, et à 2 px / 1 px le rideau
// se lit comme de la poussière, plus comme de la neige.
const SNOWFALL_CAP = 900;
const SNOWFALL_AREA = 1500;       // px² d'écran par flocon à pleine averse
const SNOWFALL_UNIT = 0.10;       // taille du gros flocon, en fraction de tuile à l'écran
const SNOW_DRIFT = 0.42;          // dérive horizontale par pixel de chute, à plein vent

// Un flocon, position PURE : f(index, temps) → rien à faire vivre entre les
// frames, capture reproductible (même contrat que la pluie). Exporté pour le
// test : la lenteur de la chute et l'absence de colonne vide au bord au vent
// sont deux choses qu'aucune image ne montre.
export function isoSnowFlake(i, t, W, H, wind, unit) {
  // ⚠ QUATRE tirages, et le placement en X a le SIEN. La pluie dérive son x du
  // même hash que sa vitesse ; sur des traits qui traversent l'écran en 0,5 s
  // ça ne se voit pas, mais sur des flocons lents la corrélation x↔vitesse
  // dessine des diagonales creuses dans le rideau.
  const sd = _rnd(i, 1), sd2 = _rnd(i, 2), sd3 = _rnd(i, 3), sd4 = _rnd(i, 4);
  const near = sd3 > 0.62;                            // ~1 flocon sur 3 au premier plan
  const size = near ? Math.max(2, unit) : Math.max(1, Math.round(unit * 0.6));
  const speed = (near ? 118 : 74) + sd2 * 44;         // px/s, flocons de vitesses variées
  const y = _frac((t * speed) / (H * 1000) + sd) * (H + size * 2) - size;
  // Bande de chute en PARALLÉLOGRAMME : la dérive est comptée depuis le MILIEU
  // de l'écran, donc la densité reste la même en haut et en bas. Comptée depuis
  // le haut, tout le vent se payait en flocons hors cadre d'un côté.
  const drift = wind * SNOW_DRIFT;
  const margin = Math.abs(drift) * H * 0.5 + size + 4;
  const x0 = sd4 * (W + margin * 2) - margin;
  const sway = Math.sin(t / (1500 + sd * 1200) + sd2 * 6.283) * (size * 2.2 + 3);
  return { x: x0 + drift * (y - H * 0.5) + sway, y, size, near };
}

// La rafale traverse aussi l'hiver, mais elle s'y dit AUTREMENT : sur un rideau
// qui descend dix fois moins vite, ce qui se lit c'est la POUSSÉE LATÉRALE, pas
// la densité. La bourrasque de neige couche donc les flocons (gustWind) et
// épaissit le rideau par l'opacité — aucun second jeu de flocons, aucun
// changement de vitesse : accélérer la neige la ramènerait vers la pluie, ce que
// toute cette fonction s'emploie à éviter.
function drawIsoSnowfall(now, r, g = 0) {
  const ctx = CM.ctx, W = CM.cw, H = CM.ch;
  // Voile PÂLE : le ciel se couvre et la lumière se diffuse. Le voile ardoise de
  // l'averse donnait, sous la neige, une nuit sale en plein midi.
  ctx.fillStyle = `rgba(206,214,228,${(r * 0.14 * (1 + 0.2 * g)).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  // Comme l'averse, la neige est de l'agitation d'ambiance : elle suit le
  // réglage Vie de la carte.
  const k = CM.ambianceK ?? 1;
  if (!SNOWFALL_TUNE.on || k <= 0) return;
  const n = Math.min(SNOWFALL_CAP, Math.round((W * H) / SNOWFALL_AREA * r * k * SNOWFALL_TUNE.flakes));
  if (n <= 0) return;
  // Taille indexée sur la tuile à l'écran, comme les particules d'ambiance : au
  // dézoom le flocon reste un pixel d'art, il ne devient pas un pavé.
  const unit = Math.max(1, Math.round(CM.TILE * CM.cam.zoom * SNOWFALL_UNIT * SNOWFALL_TUNE.size));
  const wind = gustWind(g);
  const gk = 1 + 0.3 * g;                              // rideau plus dense à l'œil, sans flocon neuf
  const t = now || 0;
  const prevAA = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // Lointain d'abord, premier plan ensuite : la profondeur se joue à l'ordre.
  // Les gros sont MIS DE CÔTÉ au passage plutôt que recalculés — deux fillStyle
  // pour toute la couche, et une seule évaluation par flocon.
  const near = [];
  ctx.fillStyle = `rgba(${SNOW_SHADE[0]},${SNOW_SHADE[1]},${SNOW_SHADE[2]},${(0.44 * r * gk * SNOWFALL_TUNE.alpha).toFixed(3)})`;
  for (let i = 0; i < n; i += 1) {
    const f = isoSnowFlake(i, t, W, H, wind, unit);
    if (f.near) { near.push(Math.round(f.x), Math.round(f.y), f.size); continue; }
    ctx.fillRect(Math.round(f.x), Math.round(f.y), f.size, f.size);
  }
  ctx.fillStyle = `rgba(${SNOW_TOP[0]},${SNOW_TOP[1]},${SNOW_TOP[2]},${(Math.min(1, 0.72 * r * gk) * SNOWFALL_TUNE.alpha).toFixed(3)})`;
  for (let j = 0; j < near.length; j += 3) ctx.fillRect(near[j], near[j + 1], near[j + 2], near[j + 2]);
  ctx.imageSmoothingEnabled = prevAA;
}

// ── SURVOL ──────────────────────────────────────────────────────────────────
// CM.hover (posé par cityMapShowTooltip) porte enfin la tuile et la cellule
// visées : il était écrit deux fois et relu nulle part. On s'en sert pour
// répondre à « qu'est-ce que l'infobulle est en train de décrire ? », par un
// liseré sur la silhouette et un trait sur le losange au sol.
const HOUSE_BOX_CAP = 4000;            // garde-fou mémoire, jamais atteint en jeu
const HOVER_GOLD = 'rgba(232,198,110,0.95)';
const HOVER_CELL = 'rgba(232,198,110,0.7)';

function drawIsoHoverCell(ctx, hw, hh) {
  const h = CM.hover;
  if (!h || !h.cell) return;
  const c = h.cell.split(',');
  const gx = +c[0], gy = +c[1];
  // ⚠ L'EMPREINTE ENTIÈRE, pas une cellule. `cell` porte le coin NORD du lot ;
  // un bâtiment de 2×2 ou 3×2 voyait donc son losange tracé sur la seule case
  // d'origine, celle qui est la PLUS ÉLOIGNÉE à l'écran — on croyait voir « la
  // case derrière le bâtiment s'allumer », alors que c'était bien la sienne,
  // mais réduite à son coin nord. Les habitations tiennent sur une case, d'où
  // un défaut invisible sur elles et criant sur les moteurs.
  const t = h.tile;
  const spanX = (t && (t.spanX || t.size)) || 1;
  const spanY = (t && (t.spanY || t.size)) || 1;
  const T = CM.TILE;
  const n = worldToScreen(gx * T, gy * T);                     // coin nord
  const e = { x: n.x + spanX * hw, y: n.y + spanX * hh };      // est
  const s = { x: n.x + (spanX - spanY) * hw, y: n.y + (spanX + spanY) * hh };
  const w = { x: n.x - spanY * hw, y: n.y + spanY * hh };      // ouest
  ctx.save();
  ctx.strokeStyle = HOVER_CELL;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(n.x, n.y);
  ctx.lineTo(e.x, e.y);
  ctx.lineTo(s.x, s.y);
  ctx.lineTo(w.x, w.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Pool et vue des items du peintre (cf. commentaire dans drawIsoLive) —
// persistants au module : capacité conservée d'une frame à l'autre.
const ISO_ITEM_POOL = [];
const ISO_ITEM_VIEW = [];

function drawIsoLive(now) {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const hw = T * z * ISO_X, hh = T * z * ISO_Y;
  const b = visibleCellBounds(hw * 2);
  // CULL EN LOSANGE, complément de la boîte b : l'écran iso est un losange dont
  // b prend la boîte englobante — ~44 % des tuiles retenues étaient hors écran
  // mais triées ET dessinées quand même (PERF-CARTE-REPRISE §6). Marge basse
  // généreuse (10·hh) : un sprite se dresse depuis sa base, une base sous le
  // bord bas peut encore montrer sa tour. Molette __isoCullOff = 1 pour couper
  // (vérification par paire de captures, recette REPRISE).
  const dv = (typeof window !== 'undefined' && window.__isoCullOff)
    ? null : visibleDiamondBounds(hw * 2, hw * 2 + hh * 10);
  const dvVis = (wx0, wy0, wx1, wy1) => !dv
    || !(wx1 - wy0 < dv.u0 || wx0 - wy1 > dv.u1 || wx1 + wy1 < dv.v0 || wx0 + wy0 > dv.v1);
  // Boîtes des habitations pour le survol (cf. drawIsoWorld). null en LOD.
  const houseBoxes = CM._houseBoxes;
  // Marqueur de cellule AVANT le peintre : il est au sol, donc tout ce qui est
  // debout doit pouvoir passer devant.
  drawIsoHoverCell(ctx, hw, hh);
  // Intensité des fumées de cheminée pour CETTE frame (0 = personne ne fume) :
  // calculée une fois, elle décide aussi si l'on paie la collecte des items.
  const smokeK = SMOKE_TUNE.on ? smokeSeason() * (CM.ambianceK ?? 1) : 0;
  const band = (L.counts && L.counts.eraBand) | 0;
  const eraIdx = (L.counts && L.counts.eraIndex) | 0;
  // POOL D'ITEMS : la collecte fabriquait 3-4 000 littéraux d'objet par frame,
  // jetés au tri suivant — sur la machine de jeu, le ramasse-miettes passait à
  // la caisse d'un coup (pics vif-collecte à 26-39 ms contre 6 de moyenne).
  // Les objets du pool sont RÉUTILISÉS d'une frame à l'autre (forme unique →
  // hidden class stable) ; seule la vue `items` est repartie de zéro. Les refs
  // de la frame précédente restent dans les objets non réutilisés : sans effet
  // (chaque kind relit ses propres champs, posés au push). Les items de pont
  // (pushIsoBridgeItems) restent des littéraux — 30-150 par frame, négligeable.
  const items = ISO_ITEM_VIEW;
  items.length = 0;
  let itemN = 0;
  const pushItem = () => {
    let it = ISO_ITEM_POOL[itemN];
    if (!it) {
      it = ISO_ITEM_POOL[itemN] = {
        d: 0, kind: '', t: null, tr: null, p: null, v: null, w: null, wi: 0,
        moor: null, art: null, eraKey: '', axis: '', wx: 0, wy: 0, gx: 0, gy: 0,
        px: 0, py: 0, x0: 0, x1: 0, y0: 0, y1: 0, r: 0, i: 0, n: 0, pieces: null,
      };
    }
    itemN += 1;
    items.push(it);
    return it;
  };
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
      if (!dvVis(t.gx * T, t.gy * T, (t.gx + sx) * T, (t.gy + sy) * T)) continue;
      const P = isoAqueductPieces(band, eraIdx);
      if (P) {
        for (let ai = 0; ai < sx; ai += 1) {
          const it = pushItem();
          it.d = depthOf((t.gx + ai + 1) * T, (t.gy + sy) * T); it.kind = 'aqSlice';
          it.t = t; it.i = ai; it.n = sx; it.pieces = P;
        }
        continue;
      }
      { const it = pushItem(); it.d = depthOf(t.gx * T, t.gy * T); it.kind = 'tile'; it.t = t; }
      continue;
    }
    // Recouvrement d'EMPRISE (et non la seule cellule d'origine, dont la sortie
    // d'écran faisait disparaître d'un bloc un champ 10×6 encore aux 3/4 visible
    // — G.44 de l'audit), puis test exact contre le losange.
    if (t.gx + sx < b.gx0 || t.gx > b.gx1 || t.gy + sy < b.gy0 || t.gy > b.gy1) continue;
    if (!dvVis(t.gx * T, t.gy * T, (t.gx + sx) * T, (t.gy + sy) * T)) continue;
    // Empreintes À PLAT (champ) = SOL : elles ne se dressent pas → rien
    // ne doit passer DERRIÈRE elles. Profondeur au coin NORD (min wx+wy) et non au
    // coin sud : ainsi tout objet qui les chevauche (arbre/bâtiment/véhicule/piéton,
    // dont le pied a forcément une profondeur ≥ ce coin nord) se trie APRÈS → au-dessus.
    // Un socle (bâtiment volumétrique) garde son ancre au coin SUD (tri par les pieds).
    const flat = /field|farm|crop|orchard/i.test(idf);
    const d = flat ? depthOf(t.gx * T, t.gy * T) : depthOf((t.gx + sx) * T, (t.gy + sy) * T);
    { const it = pushItem(); it.d = d; it.kind = 'tile'; it.t = t; }
    // FUMÉE : item SÉPARÉ, juste derrière son bâtiment dans l'ordre du peintre —
    // elle doit passer sous le voisin situé au nord, pas par-dessus tout.
    if (smokeK > 0 && (t.type === 'house' || t.type === 'enginehome') && pixelHouseReady(t)) {
      if (t._smokeS === undefined) t._smokeS = cmHash('smk:' + t.gx + ':' + t.gy) >>> 0;
      if (t._smokeS % SMOKE_TUNE.share === 0) { const it = pushItem(); it.d = d + 0.001; it.kind = 'smoke'; it.t = t; }
    }
    // CHEVRON « nouveau bâtiment » (A4) : item SÉPARÉ juste au-dessus du sien
    // (profondeur > fumée), le temps de REVEAL_PIN_MS après l'achat. Coupé par le
    // cran « Vie de la carte » comme la fumée ; pixelHouseReady garantit une boîte.
    if (t._revealPinAt && (CM.ambianceK ?? 1) > 0 && now - t._revealPinAt < REVEAL_PIN_MS && pixelHouseReady(t)) {
      items.push({ d: d + 0.002, kind: 'revealpin', t });
    }
    // BATEAU AMARRÉ du port : item SÉPARÉ trié à SA position — dessiné dans la
    // scène riveraine il héritait de la profondeur de l'EMPRISE du bâtiment et
    // passait PAR-DESSUS la travée du pont voisin (retour Raph, band 7).
    // portMooring écarte de plus le mouillage de l'emprise des ponts. Même
    // test « mouillé » que le rendu de la scène (cas riverain du switch).
    if (t.buildingId === 'river_ports' && t.type === 'engine' && isoEngineScenesFlag.on
      && L.river && L.river.present && L.river.cells) {
      let wet = false;
      for (let ax = 0; ax < sx && !wet; ax += 1) for (let ay = 0; ay < sy && !wet; ay += 1) {
        const k = (t.gx + ax) + ',' + (t.gy + ay);
        if (L.river.cells.has(k) || (L.river.banks && L.river.banks.has(k))) wet = true;
      }
      if (wet) {
        const moor = portMooring(t, sx, T, band, eraIdx, L.river);
        if (moor) {
          const hb = T * 0.30 * moor.effSize;   // contact visuel (même geste que les véhicules)
          items.push({ d: isoUnitDepth(moor.mx * T + hb, moor.my * T + hb), kind: 'portBoat', moor });
        }
      }
    }
  }
  // Arbres (décor) — assez près de la ville seulement (le bake du sol couvre le
  // reste). AÉRATION (retour Raph « tout est trop collé ») : pas d'arbre décoratif
  // à moins de 1.5 cellule de la place ni à moins de 1 cellule d'un terre-plein
  // (ils chevauchaient la fontaine et les haies).
  // ⚠ TOUTES les places, pas seulement la centrale : les places de quartier ont
  // droit au même dégagement, sinon un arbre du décor vient chevaucher leur
  // mobilier.
  const pbT = isoPlazaBoxes(L);
  const segsT = L.terrePlein || [];
  const treeBlocked = (gx, gy) => {
    for (const b of pbT) {
      if (gx >= b.gx0 - 1.5 && gx <= b.gx1 + 1.5 && gy >= b.gy0 - 1.5 && gy <= b.gy1 + 1.5) return true;
    }
    for (const sg of segsT) {
      if (sg.axis === 'v') {
        if (Math.abs(gx + 0.5 - (sg.x + 1)) < 1.0 && gy >= sg.y0 - 1 && gy <= sg.y1 + 1.5) return true;
      } else if (Math.abs(gy + 0.5 - (sg.y + 1)) < 1.0 && gx >= sg.x0 - 1 && gx <= sg.x1 + 1.5) return true;
    }
    return false;
  };
  // Emprise des PONTS (étendue « jusqu'au sec ») : aucun arbre/rocher dessus —
  // un rocher du décor mordait la culée au débouché (vu par Raph à la capture).
  for (const tr of (L.trees || [])) {
    if (tr.gx < b.gx0 || tr.gx > b.gx1 || tr.gy < b.gy0 || tr.gy > b.gy1) continue;
    if (!dvVis(tr.gx * T, tr.gy * T, (tr.gx + 1) * T, (tr.gy + 1) * T)) continue;
    if (treeBlocked(tr.gx, tr.gy)) continue;
    if (bridgeBlocks((tr.gx + 0.5) * T, (tr.gy + 0.5) * T, T * 0.45)) continue;
    { const it = pushItem(); it.d = depthOf((tr.gx + 0.5) * T, (tr.gy + 0.9) * T); it.kind = 'tree'; it.tr = tr; }
  }
  // Forêt sauvage (ceinture autour de la ville, hors sol urbain) — cf. isoWildForest.
  // Culling aux bornes visibles ; le jitter (jx/jy) casse l'alignement sur la grille.
  // ÉCLAIRCIE AU DÉZOOM (opt-in, comparaison visuelle en cours) : sous
  // WILD_THIN_UNIT px de tuile, les arbres de la ceinture se chevauchent
  // largement et l'œil ne distingue plus les individus. En sauter une part
  // (choix STABLE par cellule, donc pas de scintillement au pan) libère le
  // premier poste de la frame. Réglage : window.__wildThin = fraction gardée
  // (1 = tout, 0.5 = un sur deux).
  const wildKeep = (typeof window !== 'undefined' && window.__wildThin != null) ? window.__wildThin : 1;
  const wildThinOn = wildKeep < 1 && T * z < WILD_THIN_UNIT;
  for (const wt of isoWildForest(L, b)) {
    if (wt.gx < b.gx0 || wt.gx > b.gx1 || wt.gy < b.gy0 || wt.gy > b.gy1) continue;
    if (!dvVis(wt.gx * T, wt.gy * T, (wt.gx + 1) * T, (wt.gy + 1) * T)) continue;
    if (wildThinOn) {
      // Rang STABLE par arbre (mémoïsé) : le même arbre est gardé ou écarté
      // d'une frame à l'autre — un tirage par frame ferait clignoter la forêt.
      let rk = wt._rk;
      if (rk === undefined) rk = wt._rk = (cmHash('wk:' + wt.gx + ':' + wt.gy) % 1000) / 1000;
      if (rk >= wildKeep) continue;
    }
    if (treeBlocked(wt.gx, wt.gy)) continue;
    if (bridgeBlocks((wt.gx + 0.5 + wt.jx) * T, (wt.gy + 0.5 + wt.jy) * T, T * 0.45)) continue;
    { const it = pushItem(); it.d = depthOf((wt.gx + 0.5 + wt.jx) * T, (wt.gy + 0.9 + wt.jy) * T); it.kind = 'tree'; it.tr = wt; }
  }
  // PLACE. Deux modes, arbitrés par __plaza({mode}) :
  //   'kit'   (défaut) — place COMPOSÉE : un item PAR PROP, chacun trié à SA
  //           profondeur. C'est ce qui permet à un passant de croiser un banc
  //           (la scène unique n'avait qu'une profondeur pour toute la place)
  //           ET aux props de garder leur taille quand la place s'agrandit.
  //   'scene' — l'ancienne image unique, gardée comme référence d'A/B.
  {
    const pb = isoPlazaBox(L);
    const pKey = plazaEraForBand(band);
    if (pb && pKey) {
      if (isoPlazaKitOn(band)) {
        // Culling par une boîte d'UNE cellule autour du pied : un prop monte
        // au-dessus de son point d'ancrage, un test sur le point seul le ferait
        // disparaître au ras du bord haut de l'écran.
        isoPlazaItems(L, band, pushItem, (wx, wy) => dvVis(wx - T, wy - T, wx + T, wy + T));
      } else if (isoPlazaSceneOn(band)) {
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
        // Profondeur au POINT D'APPUI du sprite (wonderFootWorld), la MÊME
        // source que son ancre de dessin : c'est ce point qui décide qui passe
        // devant. Trié sur un autre, le monument recouvre les badauds de
        // l'anneau d'attroupement, qui sont pourtant visiblement devant lui.
        const foot = wonderFootWorld(wi, L.gridN, L.cx, L.cy);
        items.push({ d: depthOf(foot.x, foot.y), kind: 'wonder', w, wi });
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
        if (!dvVis(lp.wx, lp.wy, lp.wx, lp.wy)) continue;
        // lp.d = clé précalculée (computeIsoLamps) : pied wx+wy, REMONTÉE devant le
        // bâtiment mitoyen quand le mât longe sa façade sud/est (sinon avalé).
        // gx/gy suivent le mât jusqu'ici : c'est d'eux que sort la PHASE de
        // scintillement de son halo, déposé dans la foulée du sprite.
        { const it = pushItem(); it.d = lp.d; it.kind = 'lamp'; it.wx = lp.wx; it.wy = lp.wy; it.gx = lp.gx; it.gy = lp.gy; it.art = lampArt; }
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
            items.push({ d: depthOf(wx, (y + 0.06) * T), kind: 'bush', wx, wy: (y + 0.06) * T, r: 0.24 + jj * 0.1, v: 1 + (cmHash('tv:' + sg.x + ':' + Math.round(y * 10)) % ISO_BUSH_VARIANTS) });
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
            items.push({ d: depthOf((x + 0.06) * T, wy), kind: 'bush', wx: (x + 0.06) * T, wy, r: 0.24 + jj * 0.1, v: 1 + (cmHash('tv:' + Math.round(x * 10) + ':' + sg.y) % ISO_BUSH_VARIANTS) });
          }
        }
      }
    }
  }
  // PONTS : platelage + verticalité, segments PAR CELLULE au tri peintre —
  // le platelage au coin nord (tout ce qui le chevauche passe dessus), les
  // parapets devant les jambes des traverseurs, le tout derrière/devant les
  // bâtiments voisins selon la profondeur. Seule l'ombre reste en passe
  // globale (drawIsoBridgeUnder, avant les bateaux). Cf. isoBridge.js.
  pushIsoBridgeItems(items, b);
  // Habitants : clé aux PIEDS, remontée devant les murs mitoyens (isoUnitDepth).
  if (!CM.lodActive) {
    for (const p of CM.citizens) {
      if (p._nightHidden) continue;
      const pwx = p.x + (p.lox || 0), pwy = p.y + (p.loy || 0);
      // Cull écran ABSENT jusqu'ici en iso (le legacy l'avait) : jusqu'à 450
      // piétons hors champ payaient tri + drawImage à chaque frame.
      if (!dvVis(pwx, pwy, pwx, pwy)) continue;
      { const it = pushItem(); it.d = isoUnitDepth(pwx, pwy); it.kind = 'cit'; it.p = p; }
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
      if (!dvVis(v.x + lo.x, v.y + lo.y, v.x + lo.x, v.y + lo.y)) continue;
      const h = T * 0.30 * (VEH_SIZES[v.type] || 0) * VEH_SCALE;
      { const it = pushItem(); it.d = isoUnitDepth(v.x + lo.x + h, v.y + lo.y + h); it.kind = 'veh'; it.v = v; }
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
  fp('vif-collecte');
  items.sort((a, bb) => a.d - bb.d);
  fp('vif-tri');
  // DIAGNOSTIC DE GREFFE (opt-in, coût nul éteint) : composition du lot et
  // surtout nombre d'ALTERNANCES entre items « quad pur » (batchables en GL) et
  // items procéduraux. C'est ce chiffre qui décide de l'architecture du batcher :
  // une alternance = un vidage de lot, donc une composition plein écran.
  if (globalThis.__isoItemStats) {
    const st = { total: items.length, kinds: {}, alternances: 0, quads: 0, proc: 0 };
    let prevQuad = null;
    for (const it of items) {
      st.kinds[it.kind] = (st.kinds[it.kind] || 0) + 1;
      // « Quad pur » : un seul drawImage, sans géométrie vectorielle (cf. la
      // cartographie). Les scènes moteur en deviennent quand le cache est actif.
      const q = it.kind === 'cit' || it.kind === 'tree' || it.kind === 'bush' || it.kind === 'lamp'
        || (it.kind === 'tile' && it.t && (it.t.type === 'house' || it.t.type === 'enginehome'));
      if (q) st.quads += 1; else st.proc += 1;
      if (prevQuad !== null && q !== prevQuad) st.alternances += 1;
      prevQuad = q;
    }
    // Distribution des SÉRIES de quads consécutives : c'est elle qui décide si
    // une composition par série est jouable (peu de séries longues) ou non
    // (poussière de séries courtes).
    const runs = [];
    let cur = 0;
    for (const it of items) {
      const q = it.kind === 'cit' || it.kind === 'tree' || it.kind === 'bush' || it.kind === 'lamp'
        || (it.kind === 'tile' && it.t && (it.t.type === 'house' || it.t.type === 'enginehome'));
      if (q) cur += 1;
      else { if (cur) runs.push(cur); cur = 0; }
    }
    if (cur) runs.push(cur);
    runs.sort((a, b) => b - a);
    st.series = { nombre: runs.length, plusLongues: runs.slice(0, 6), medianeTaille: runs.length ? runs[runs.length >> 1] : 0 };
    st.couvertureTop8 = runs.slice(0, 8).reduce((a, b) => a + b, 0);
    globalThis.__isoItemStatsLast = st;
  }
  // ── GREFFE WebGL DES LONGUES SÉRIES ─────────────────────────────────────────
  // L'ordre du peintre entrelace sprites et procédural : composer à chaque
  // alternance serait ruineux (572 alternances mesurées au dézoom). Mais la
  // distribution est très inégale — au dézoom, DEUX séries (les ceintures
  // forestières nord et sud) portent à elles seules 2 975 des 5 401 sprites.
  // On ne bascule donc en GL que les séries LONGUES : elles partent en un seul
  // appel de dessin, et leur composition tombe à SA PLACE dans la file, donc
  // l'ordre du peintre est rigoureusement conservé. Tout le reste garde le
  // chemin Canvas 2D, inchangé.
  // ⚠ OPT-IN (window.__glPainter = true) — VERDICT MESURÉ du 28/07, poste de dev :
  //  • gain nul (×1,02, dans le bruit) : au dézoom les arbres sont MINUSCULES,
  //    leur `drawImage` coûte déjà presque rien, et la composition du lot mange
  //    ce qu'on économise. Le banc __glBench dit pourtant ×12,7 à 12 000
  //    sprites : le batcher est bon, c'est la MATIÈRE qui manque ici — le vrai
  //    poids de `vif-peinture` est le dessin VECTORIEL (scènes, ponts, champs),
  //    pas les sprites (cf. cartographie : « les blits ne coûtent rien »).
  //  • écart de rééchantillonnage : 3,7 % des pixels (plancher de bruit 0,6 %),
  //    invisible à l'œil mais réel — GL et Canvas 2D ne choisissent pas les
  //    mêmes texels quand un sprite est redimensionné.
  // La bascule redeviendra intéressante quand le procédural sera devenu des
  // sprites (cache de scènes actif, ponts et champs cuits) : la matière sera là.
  // À re-mesurer sur la machine de JEU, dont le GPU sature sur le NOMBRE
  // d'appels — le profil qui, lui, favorise le batcher.
  const profParts = !!globalThis.__isoProfParts;   // pesée fine, cf. plus haut
  // SPRITES D'ARBRE RÉSOLUS UNE FOIS PAR FRAME (et non par arbre). Mesuré à
  // dézoom : les arbres pesaient 12,7 ms sur 34, soit le premier poste de la
  // frame — et l'essentiel n'était pas le blit mais ce qui l'entoure, refait
  // pour CHACUN des 4 648 arbres : un hash de chaîne pour la variante, une
  // recherche de sprite par concaténation, une résolution de teinte
  // saisonnière. Or tout cela ne dépend que de la VARIANTE (4 en tout) : on le
  // résout une fois par frame, et chaque arbre n'a plus qu'à lire son entrée.
  const treeMemo = typeof window === 'undefined' || window.__treeMemo !== false;
  const treeImgs = [];
  for (let tv = 1; tv <= ISO_TREE_VARIANTS; tv += 1) {
    const a = isoArt('tree-' + tv);
    treeImgs[tv] = a.ready ? (seasonTree(a, 't' + tv) || a.img) : null;
  }
  const glWanted = (typeof window !== 'undefined' && window.__glPainter === true) && items.length >= GL_RUN_MIN * 2;
  const glOn = glWanted && glInit();
  let glPending = 0, glRuns = 0, glSprites = 0;
  if (glOn) {
    for (const it of items) it._gl = 0;
    let start = -1;
    for (let i = 0; i <= items.length; i += 1) {
      const it = i < items.length ? items[i] : null;
      // Seuls les kinds à sprite ENTIER et sans géométrie vectorielle sont
      // éligibles : un arbre/buisson = un blit, rien d'autre.
      const q = !!it && (it.kind === 'tree' || it.kind === 'bush');
      if (q) { if (start < 0) start = i; continue; }
      if (start >= 0 && i - start >= GL_RUN_MIN) { for (let k = start; k < i; k += 1) items[k]._gl = 1; glRuns += 1; }
      start = -1;
    }
    if (glRuns) glBegin(CM.cw, CM.ch, CM.dpr || 1);
  }
  // Emprise écran du lot courant : composer PLEIN ÉCRAN coûterait plus cher que
  // les sprites économisés (une ceinture forestière, ce sont des milliers de
  // sprites minuscules — 1,3 Mpx au total — contre 1,5 Mpx par composition
  // plein cadre). On ne recopie donc que le rectangle réellement couvert.
  let gbx0 = 1e9, gby0 = 1e9, gbx1 = -1e9, gby1 = -1e9;
  const glCompose = () => {
    if (!glPending) return;
    glSprites += glFlush();
    const dpr = CM.dpr || 1;
    const x0 = Math.max(0, Math.floor(gbx0)), y0 = Math.max(0, Math.floor(gby0));
    const x1 = Math.min(CM.cw, Math.ceil(gbx1)), y1 = Math.min(CM.ch, Math.ceil(gby1));
    if (x1 > x0 && y1 > y0) {
      const prevS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(glGetCanvas(),
        Math.round(x0 * dpr), Math.round(y0 * dpr), Math.round((x1 - x0) * dpr), Math.round((y1 - y0) * dpr),
        x0, y0, x1 - x0, y1 - y0);
      ctx.imageSmoothingEnabled = prevS;
    }
    glPending = 0;
    gbx0 = 1e9; gby0 = 1e9; gbx1 = -1e9; gby1 = -1e9;
    glBegin(CM.cw, CM.ch, CM.dpr || 1);   // repart d'un cadre vierge
  };
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
  // COUCHE DE LUMIÈRE : armée pour toute la durée du peintre. Les lampes y
  // déposent leur halo à leur place dans le tri, les sprites peints ensuite y
  // découpent leur silhouette. Désarmée juste après la boucle — rien de ce qui
  // suit (oiseaux, drones, voile) n'a de profondeur à faire valoir. Sous une
  // tuile de LIGHT_LAYER.minUnit pixels on y renonce (halos minuscules, découpes
  // innombrables) et la passe de nuit repeint les halos en direct, comme avant.
  const lampK = beginLightLayer(T * z >= LIGHT_LAYER.minUnit) ? isoLampLightFrame(L) : null;
  for (const it of items) {
    // Un item NON basculé doit être peint APRÈS le lot en cours : on compose
    // d'abord, sinon la série GL passerait par-dessus lui.
    if (glPending && !it._gl) glCompose();
    if (it.kind === 'tile') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      // Ancre = coin SUD de l'empreinte (point monde (gx+spanX, gy+spanY)).
      const anchor = worldToScreen((t.gx + spanX) * T, (t.gy + spanY) * T);
      const isHouse = t.type === 'house' || t.type === 'enginehome';
      // Bâtiment RIVERAIN (port : l'empreinte mord la berge/l'eau) : scène iso
      // DÉDIÉE (drawIsoRiverside — bâtiment sur berge, ponton vers le ruban,
      // bateau amarré). Ni scène-boîte legacy ni socle : la boîte legacy
      // embarque son eau en repère carré (bassin flottant, vu à la capture).
      // CHAMPS et AQUEDUCS ont un rendu À PLAT dédié (parcelle / canal, plus bas)
      // et DOIVENT s'afficher même si leur emprise mord la berge — l'aqueduc s'y
      // pose EXPRÈS (prise d'eau au bord) : les exclure du cull « mouillé », sinon
      // ils disparaissaient (branchement iso oublié). Seuls les moteurs « en bloc »
      // sont culés au-dessus de l'eau (le port part en scène riveraine).
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
            if (t.buildingId === 'river_ports' && isoEngineScenesFlag.on) {
              drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, eraIdx);
            }
            continue;
          }
        }
      }
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;  // largeur allouée au sprite (~78 % du losange)
      let engineBox;   // boîte rendue par la scène moteur, publiée pour le survol
      if (isHouse && pixelHouseReady(t)) {
        if (profParts) fp('vif-peinture');
        const hpx = wpx;                                    // seul y+h compte (ancre pieds)
        const hx = anchor.x - wpx / 2, hy = anchor.y - hpx - hh * 0.5;
        // SURVOL : le liseré se dessine AVANT le sprite (blob élargi puis sprite
        // par-dessus), sinon il mange la silhouette au lieu de la cerner.
        if (CM.hover && CM.hover.tile === t) drawPixelHouseOutline(t, hx, hy, wpx, hpx, HOVER_GOLD);
        const box = drawPixelHouse(t, hx, hy, wpx, hpx);
        // Mémorise la boîte réellement dessinée : c'est le seul endroit qui la
        // connaisse. Consommée par le hit-test à la silhouette (cityMapHitTest),
        // qui tourne à la souris, donc sur les boîtes de la dernière frame.
        // Ordre de la liste = ordre du peintre (loin → près) : le hit-test la
        // parcourt à l'envers pour toucher d'abord ce qui est devant.
        if (box && houseBoxes && houseBoxes.length < HOUSE_BOX_CAP) houseBoxes.push({ b: box, t });
        if (profParts) fp('vif-maisons');
      } else if (t.type === 'engine' && isoEngineScenesFlag.on && (engineBox = drawIsoEngineScene(ctx, t, anchor, spanX, spanY, T, z, hh, now))) {
        // Scène moteur legacy posée sur le losange (Phase 3-lite) — cf. helper.
        // ⚠ ON PUBLIE SA BOÎTE, exactement comme les habitations juste au-dessus.
        // Sans ça, un moteur haut (école, temple) n'existait pas pour le
        // hit-test : viser son toit retombait sur la cellule projetée dessous,
        // celle SITUÉE DERRIÈRE, et c'est elle que le losange de survol
        // illuminait — alors que l'infobulle, elle, tombait juste par le repli
        // sur la grille. Symptôme signalé par Raph, capture à l'appui.
        if (houseBoxes && houseBoxes.length < HOUSE_BOX_CAP) houseBoxes.push({ b: engineBox, t });
      } else {
        const id2 = t.buildingId || t.variant || '';
        const n = worldToScreen(t.gx * T, t.gy * T);
        const e = { x: n.x + spanX * hw, y: n.y + spanX * hh };
        const s = { x: n.x + (spanX - spanY) * hw, y: n.y + (spanX + spanY) * hh };
        const w = { x: n.x - spanY * hw, y: n.y + spanY * hh };
        if (/field|farm|crop|orchard/i.test(id2)) {
          // CHAMPS : patchwork de parcelles cultivées façon TheoTown (cf. drawIsoField) —
          // la scène legacy (peinture carrée du sol) ne se pose pas sur le losange.
          if (profParts) fp('vif-peinture');
          drawIsoField(ctx, t, spanX, spanY, band, eraIdx);
          if (profParts) fp('vif-champs');
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
        // Le bloc de repli masque lui aussi les halos déposés derrière lui : sa
        // silhouette est le PRISME (losange du toit + deux murs), tracé d'un trait.
        lightCut(w.x, n.y - hgt, e.x, s.y, (lc) => {
          lc.beginPath();
          lc.moveTo(n.x, n.y - hgt); lc.lineTo(e.x, e.y - hgt); lc.lineTo(e.x, e.y);
          lc.lineTo(s.x, s.y); lc.lineTo(w.x, w.y); lc.lineTo(w.x, w.y - hgt);
          lc.closePath(); lc.fill();
        });
      }
    } else if (it.kind === 'tree') {
      if (profParts) fp('vif-peinture');
      // ARBRES PIXEL (retour Raph : les sapins-triangles « pas faits
      // correctement du tout ») : sprite PixelLab /pixelart/iso/tree-N.png,
      // variante stable par hash de cellule ; repli = triangle procédural.
      const tr = it.tr;
      const p = worldToScreen((tr.gx + 0.5 + (tr.jx || 0)) * T, (tr.gy + 0.9 + (tr.jy || 0)) * T);
      // Variante mémoïsée SUR L'ARBRE : elle ne dépend que de sa cellule, et
      // les objets d'arbre sont persistants (layout, et cache par blocs pour la
      // forêt sauvage) — le hash de chaîne ne se paie donc qu'une fois par arbre
      // et par vie de cache, au lieu d'une fois par arbre et par frame.
      let tv = tr._tv;
      if (tv === undefined || !treeMemo) tv = tr._tv = 1 + (cmHash('tree:' + tr.gx + ':' + tr.gy) % ISO_TREE_VARIANTS);
      // __treeMemo = false : rejoue la résolution par arbre (A/B de la mesure).
      const tImg0 = treeMemo ? treeImgs[tv] : (() => { const a = isoArt('tree-' + tv); return a.ready ? (seasonTree(a, 't' + tv) || a.img) : null; })();
      if (tImg0) {
        const hpx = T * z * (tr.r || 0.7) * 2.7;
        // Feuillage TEINTÉ par la saison : la teinte est cuite une fois par
        // (variante, saison) dans un canvas hors écran, et l'image résolue nous
        // vient de treeImgs (une fois par frame, cf. plus haut).
        const tImg = tImg0;
        const tdx = p.x - hpx / 2, tdy = p.y - hpx * 0.92;
        // Série basculée : le sprite part au batcher (un seul appel de dessin
        // pour toute la série). Refus du batcher (atlas plein, source pas
        // décodée) → chemin 2D, sprite par sprite, comme avant.
        let batched = false;
        if (it._gl) {
          const sw = tImg.naturalWidth || tImg.width | 0, sh = tImg.naturalHeight || tImg.height | 0;
          batched = glQuad(tImg, 0, 0, sw, sh, tdx, tdy, hpx, hpx);
          if (batched) {
            glPending += 1;
            if (tdx < gbx0) gbx0 = tdx; if (tdy < gby0) gby0 = tdy;
            if (tdx + hpx > gbx1) gbx1 = tdx + hpx; if (tdy + hpx > gby1) gby1 = tdy + hpx;
          }
        }
        if (!batched) {
          const prevTS = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tImg, tdx, tdy, hpx, hpx);
          ctx.imageSmoothingEnabled = prevTS;
        }
        // L'occultation du calque de lumière vit dans un AUTRE canvas : elle
        // reste identique quel que soit le pipeline du sprite.
        lightCutImage(tImg, tdx, tdy, hpx, hpx);
      } else {
        drawTreeIso(ctx, p.x, p.y, T * z * (tr.r || 0.7) * 1.3);
      }
      if (profParts) fp('vif-arbres');
    } else if (it.kind === 'plazaProp') {
      // PLACE COMPOSÉE : un prop, à sa taille en TUILES (jamais en fraction de
      // la place). Tout le calcul est dans isoPlaza.js.
      drawIsoPlazaProp(ctx, it.art, it.eraKey);
    } else if (it.kind === 'plazaGrid') {
      drawIsoPlazaGrid(ctx, it.art);     // overlay de travail (__plaza({grid|ruler}))
    } else if (it.kind === 'plazaScene') {
      // Losange de CONTENU mesuré calé pile sur l'emprise de la dalle (le
      // canvas brut décalait la scène — retour Raph).
      const p = worldToScreen(it.wx, it.wy);
      const g = drawIsoGroundedArt(ctx, it.art, p.x, p.y, (it.px + it.py) * T * z * ISO_X * 0.98);
      // EAU DE LA FONTAINE : frame courante du strip re-projetée sur la scène
      // (rect source → géométrie du draw) ; hors eau le strip est identique à
      // la scène (pixels verrouillés) donc l'overlay est invisible à l'arrêt.
      const fa = FOUNTAIN_ANIM[it.eraKey];
      // L'eau de fontaine survit au cran « sobre » : c'est une animation lente,
      // locale et attendue. Seul « aucune » l'arrête, avec le reste.
      if (fa && FOUNTAIN_TUNE.on && g && (CM.ambianceK ?? 1) > 0) {
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
    } else if (it.kind === 'smoke') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      const anchor = worldToScreen((t.gx + spanX) * T, (t.gy + spanY) * T);
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;
      // MÊME appel de géométrie que le dessin du sprite : la source de la fumée
      // se recale donc automatiquement sur tout changement de cadrage du sprite.
      drawIsoSmoke(pixelHouseBox(t, anchor.x - wpx / 2, anchor.y - wpx - hh * 0.5, wpx, wpx), t._smokeS, now, smokeK);
    } else if (it.kind === 'revealpin') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      const anchor = worldToScreen((t.gx + spanX) * T, (t.gy + spanY) * T);
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;
      // MÊME géométrie que le sprite (cf. fumée) → le chevron suit tout recadrage.
      drawIsoRevealPin(pixelHouseBox(t, anchor.x - wpx / 2, anchor.y - wpx - hh * 0.5, wpx, wpx), t._revealPinAt, now);
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
      // HALO DÉPOSÉ ICI, à la profondeur du mât : tout ce que le peintre dessine
      // après lui (donc devant) viendra le découper. Sans ce dépôt en place, le
      // halo se peignait à plat en fin de frame et traversait les façades.
      if (lampK && lampLit(it, lampK)) {
        const bx = lampGlowBox(p, lampK);
        const lc = lightCtx(bx.x0, bx.y0, bx.x1, bx.y1);
        if (lc) paintLampGlow(lc, it, p, lampK, now);
      }
    } else if (it.kind === 'bush') {
      // Buisson de terre-plein : feuillu réutilisé petit, pied sur la couture.
      const p = worldToScreen(it.wx, it.wy);
      // Buisson DÉDIÉ (bush-N) ; repli sur le feuillu rapetissé d'avant si le
      // PNG manque. Teinté par la saison comme les arbres — sinon le terre-plein
      // restait vert d'été au milieu d'une avenue en automne.
      // La clé de saison suit l'art RÉELLEMENT dessiné : sur les premières
      // frames le buisson n'est pas encore décodé et on tombe sur l'arbre —
      // une clé fixe aurait figé cet arbre teinté dans le cache pour de bon.
      let bArt = isoArt('bush-' + it.v), bKey = 'b' + it.v;
      if (!bArt.ready) { const fv = 1 + (it.v % 2); bArt = isoArt('tree-' + fv); bKey = 't' + fv; }
      if (bArt.ready) {
        const hpx = T * z * it.r * 2.7;
        const prevBS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        const bImg = seasonTree(bArt, bKey) || bArt.img;
        ctx.drawImage(bImg, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
        ctx.imageSmoothingEnabled = prevBS;
        lightCutImage(bImg, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
      }
    } else if (it.kind === 'bridgeSeg') {
      // Jalons de pesée (opt-in) : ces deux postes sont les candidats à la
      // cuisson en texture — il faut leur coût RÉEL avant d'y consacrer une
      // séance. Coût nul profileur éteint.
      if (profParts) fp('vif-peinture');
      drawIsoBridgeSeg(ctx, it, now);
      if (profParts) fp('vif-ponts');
    } else if (it.kind === 'portBoat') {
      drawIsoPortBoat(ctx, it.moor, now, z, T);
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
  glCompose();                     // dernière série éventuelle
  if (glOn) {
    globalThis.__glPainterLast = { series: glRuns, sprites: glSprites };
  }
  endLightLayer();
  ctx.imageSmoothingEnabled = prevSmooth;
  fp('vif-peinture');
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

// Délai d'immobilité caméra (ms) avant la recuisson du sol NET après un geste.
// Court = le net revient vite (moins de flou transitoire ressenti au zoom/pan) ;
// trop court rendrait la recuisson plus fréquente entre deux à-coups. 110 ms est
// un compromis net/fluide. Ancienne valeur : 160 ms.
const ISO_SETTLE_MS = 110;
// SECOND palier d'accalmie : délai avant le sol PLEIN (le bake cher). Entre
// ISO_SETTLE_MS et celui-ci, on pose le bake ALLÉGÉ — sol présent et aligné,
// sans touffes ni franges ni textures, ~4× moins cher (cf. la branche de pan).
//
// Pourquoi deux paliers : un dézoom à la molette n'est pas UN geste, c'est une
// SUITE de gestes courts séparés de 200–400 ms. Avec le seul seuil de 110 ms,
// chaque cran retombait au repos et payait une recuisson PLEINE. Mesuré au
// profileur sur 13 s de dézoom (fenêtre 2005×1369) : drawIsoGround 1 197 ms et
// cityMapBakeMargin 1 223 ms, pendant que le thread principal n'était occupé
// qu'à 35 % — c'est le GPU qui saturait, noyé sous les blits par cellule.
// 400 ms couvre l'intervalle entre deux crans : on ne paie plus le sol plein
// qu'une fois, quand le joueur a réellement fini de dézoomer.
const ISO_CRISP_SETTLE_MS = 400;
// Coalescence des invalidations DOUCES (sprite décodé en retard, bm.soft) :
// au chargement d'une mégapole, ~10-20 PNG décodent étalés sur autant de
// frames, et chacun déclenchait une recuisson PLEINE immédiate (caméra
// immobile → settled). Mesuré le 2026-07-27 : 110-190 ms PAR FRAME, 1,6 s de
// gel cumulé pour 12 décodages. Le contenu du bake existant reste VALABLE
// (c'est la définition du soft) : on le re-blitte et on ne recuit qu'une fois
// par fenêtre — la cascade devient au pire 2-3 recuissons.
const ISO_SOFT_BAKE_MIN_MS = 250;
// Budget de l'allégé LIGHT en plein pan : au-delà, on retombe sur l'aplat HARD.
// ~4-5 images à 60 fps — le pan hors marge n'arrive qu'aux franchissements de
// marge, pas à chaque frame, donc l'à-coup reste rare et court.
const ISO_LIGHT_BUDGET_MS = 70;

// ── SOL PLEIN EN TRANCHES (2026-07-27, relevé machine de jeu : la recuisson
// pleine au repos coûtait 110 ms d'un coup — pire frame du joueur une fois le
// gel de layout corrigé). À l'accalmie longue, le plein ne remplace plus le
// light en une frame : il l'écrase BANDE PAR BANDE sur N frames (~coût/N
// chacune). Même caméra, même clé, même géométrie → chaque bande recouvre
// exactement sa part du light, l'œil voit le détail « se poser » en un
// balayage d'une poignée de frames. Les bandes se recouvrent de 2 px vers le
// bas : la bande suivante repeint les lignes de bord où l'antialiasing du clip
// aurait mélangé light et plein (aucune couture). Abandon automatique si la
// caméra, le zoom ou la clé changent en cours de route (le light reste
// affiché, la tranche repart de zéro au prochain repos). La capture (__cityShot)
// garde sa recuisson immédiate — déterminisme du harnais.
// Molettes : __solSlices (nombre de bandes, 0 = désactivé → plein immédiat).
// Budget-cible par bande : le nombre de bandes s'AUTO-CALIBRE sur le coût réel
// de la dernière recuisson pleine (même philosophie que crispAffordable) —
// 110 ms mesurés → 3 bandes, une mégapole à 300 ms → 8.
const SOL_SLICE_BUDGET_MS = 40;
// Bornes de bande génériques : yOn (tranches horizontales — recuisson au repos,
// bande basse/haute du défilement) et xOn (bandes verticales du défilement).
const ISO_GROUND_SLICE = { on: false, yOn: true, y0: 0, y1: 0, padTop: 0, padBot: 0, xOn: false, x0: 0, x1: 0, padX: 0 };
// Cuit UNE bande du canvas de sol (bornes logiques xr/yr, null = tout l'axe)
// au niveau demandé (false = plein, 'light', true = hard) — partagé par les
// tranches du repos et les bandes exposées du défilement. Clip débordant de
// 2 px de chaque côté : la rangée frontière est repeinte à l'identique (même
// grille de rastérisation), l'antialiasing du bord de clip tombe sur des
// pixels identiques — pas de couture.
function bakeGroundStrip(level, xr, yr) {
  const gc = CM.groundCanvas, gctx = CM.gctx, dpr = CM.dpr || 1;
  const M = CM._bakeMargin || 0;
  const mainCtx = CM.ctx, cw0 = CM.cw, ch0 = CM.ch;
  CM.cw = cw0 + 2 * M; CM.ch = ch0 + 2 * M;
  CM.ctx = gctx;
  ISO_GROUND_LOD.on = level !== false;
  ISO_GROUND_LOD.light = level === 'light';
  const hh2 = CM.TILE * CM.cam.zoom * ISO_Y;
  const hw2 = CM.TILE * CM.cam.zoom * ISO_X;
  ISO_GROUND_SLICE.on = true;
  ISO_GROUND_SLICE.yOn = !!yr;
  ISO_GROUND_SLICE.xOn = !!xr;
  if (yr) {
    ISO_GROUND_SLICE.y0 = yr[0]; ISO_GROUND_SLICE.y1 = yr[1];
    ISO_GROUND_SLICE.padTop = hh2 * 5; ISO_GROUND_SLICE.padBot = hh2 * 2;
  }
  if (xr) {
    ISO_GROUND_SLICE.x0 = xr[0]; ISO_GROUND_SLICE.x1 = xr[1];
    ISO_GROUND_SLICE.padX = hw2 * 3;
  }
  gctx.save();
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.beginPath();
  const rx0 = xr ? Math.floor((xr[0] - 2) * dpr) : 0;
  const rx1 = xr ? Math.ceil((xr[1] + 2) * dpr) : gc.width;
  const ry0 = yr ? Math.floor((yr[0] - 2) * dpr) : 0;
  const ry1 = yr ? Math.ceil((yr[1] + 2) * dpr) : gc.height;
  gctx.rect(rx0, ry0, rx1 - rx0, ry1 - ry0);
  gctx.clip();
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  try {
    drawIsoGround();
  } finally {
    gctx.restore();
    ISO_GROUND_SLICE.on = false; ISO_GROUND_SLICE.xOn = false; ISO_GROUND_SLICE.yOn = true;
    ISO_GROUND_LOD.on = false; ISO_GROUND_LOD.light = false;
    CM.ctx = mainCtx; CM.cw = cw0; CM.ch = ch0;
  }
}

// ── DÉFILEMENT INCRÉMENTAL AU PAN. Un franchissement de marge recuisait TOUT
// le canvas (49-84 ms sur la machine de jeu, en allégé qui plus est). Ici :
// auto-copie du canvas décalée d'un nombre ENTIER de pixels device (mode
// 'copy' : ce qui sort disparaît, ce qui entre devient transparent), ré-ancrage
// EXACT de la caméra du bake via screenDeltaToPan (l'inverse de la projection —
// aucune dérive, même après cent franchissements), puis recuisson des SEULES
// bandes exposées, au MÊME niveau de détail que le contenu existant. Le décalage
// entier préserve la grille de rastérisation : bandes et contenu défilé
// s'alignent au pixel près, par construction. Conséquence joueur : le pan reste
// à PLEINE qualité sur toutes les machines — plus de bascule light/aplat.
// Molette : __solScroll = false → l'ancienne recuisson complète.
// Pas de défilement fin : seuil de delta (px logiques) avant de faire glisser
// le canvas — assez grand pour amortir le coût fixe d'une bande, assez petit
// pour que la bande reste minuscule.
const SOL_SCROLL_STEP = 64;
function scrollGroundOnPan(bm, pd, helpers) {
  if (typeof window !== 'undefined' && window.__solScroll === false) return false;
  if (CM.capture) return false;
  const gc = CM.groundCanvas, gctx = CM.gctx, dpr = CM.dpr || 1;
  if (!gc || !gctx) return false;
  // Sécurité : le zoom doit être EXACTEMENT celui du bake (même grille).
  if (bm.zoomB != null && bm.zoomB !== CM.cam.zoom) return false;
  const sdx = Math.round(pd.x * dpr), sdy = Math.round(pd.y * dpr);
  // Fling géant : deux bandes quasi pleines coûteraient plus qu'une recuisson.
  if (Math.abs(sdx) > gc.width * 0.45 || Math.abs(sdy) > gc.height * 0.45) return false;
  // 1) Auto-défilement (blit sur soi, pixels entiers, net).
  gctx.save();
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.imageSmoothingEnabled = false;
  gctx.globalCompositeOperation = 'copy';
  gctx.drawImage(gc, -sdx, -sdy);
  gctx.globalCompositeOperation = 'source-over';
  gctx.restore();
  // 2) Ré-ancrage exact : le monde équivalent du décalage entier copié.
  const dwp = screenDeltaToPan(sdx / dpr, sdy / dpr);
  bm.camX += dwp.x; bm.camY += dwp.y;
  // 3) Bandes exposées, au niveau du contenu en place (un lod reste un lod —
  //    les tranches du repos l'upgraderont, comme avant). ⚠ Dessinées sous la
  //    caméra de l'ANCRE, pas la caméra courante : le canvas vit sur la grille
  //    de son ancre (± un demi-pixel de la caméra réelle) — dessiner les bandes
  //    sous la caméra courante les décalait de ce résidu sous-pixel, et le
  //    mélange de phases miroitait pendant le drag (« frisson », retour Raph).
  const o = String(bm.other || '');
  const level = o.endsWith(':lodl') ? 'light' : o.endsWith(':lod') ? true : false;
  const W = gc.width / dpr, H = gc.height / dpr;
  const camRX = CM.cam.x, camRY = CM.cam.y;
  CM.cam.x = bm.camX; CM.cam.y = bm.camY;
  try {
    if (sdy !== 0) {
      const h = Math.abs(sdy) / dpr;
      bakeGroundStrip(level, null, sdy > 0 ? [H - h, H] : [0, h]);
    }
    if (sdx !== 0) {
      const w = Math.abs(sdx) / dpr;
      bakeGroundStrip(level, sdx > 0 ? [W - w, W] : [0, w], null);
    }
  } finally {
    CM.cam.x = camRX; CM.cam.y = camRY;
  }
  helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');
  return true;
}

let _solSlice = null; // { key, i, n, camX, camY, zoom, ms }
function runGroundSliceStep(key, nowMs, helpers) {
  const M = CM._bakeMargin || 0;
  const N = Math.max(2, Math.min(8,
    (typeof window !== 'undefined' && window.__solSlices)
    || Math.ceil((CM._isoGroundBakeMs || 120) / SOL_SLICE_BUDGET_MS)));
  if (!_solSlice || _solSlice.key !== key || _solSlice.camX !== CM.cam.x
    || _solSlice.camY !== CM.cam.y || _solSlice.zoom !== CM.cam.zoom || _solSlice.n !== N) {
    _solSlice = { key, i: 0, n: N, camX: CM.cam.x, camY: CM.cam.y, zoom: CM.cam.zoom, ms: 0 };
  }
  const t0 = performance.now();
  const fullH = CM.ch + 2 * M;
  const y0 = fullH * _solSlice.i / N;
  const y1 = fullH * (_solSlice.i + 1) / N;
  // Toute la mécanique (gonflage, clip débordant anti-couture, culls) vit dans
  // bakeGroundStrip, partagée avec les bandes du défilement incrémental.
  bakeGroundStrip(false, null, [y0, y1]);
  _solSlice.ms += performance.now() - t0;
  _solSlice.i += 1;
  if (_solSlice.i >= _solSlice.n) {
    CM._isoGroundBake = { camX: _solSlice.camX, camY: _solSlice.camY, other: key };
    CM._isoGroundBake.zoomB = CM.cam.zoom;
    CM._isoGroundBakeMs = _solSlice.ms; // coût plein RÉEL (pilote crispAffordable)
    CM._isoSoftBakeAt = nowMs;
    _solSlice = null;
  }
  helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');
}
// Budget d'une recuisson de sol EN PLEIN GESTE. Au-delà, on préfère le re-blit
// compensé (flou bref) : une image nette qui coûte un tiers de seconde n'est plus
// de la netteté, c'est un gel. 45 ms ≈ trois images à 60 fps — assez pour laisser
// le geste net sur les petites villes, assez bas pour ne jamais figer les grandes.
const ISO_CRISP_BUDGET_MS = 45;

// ── CACHE DU SOL PAR CRAN DE ZOOM ────────────────────────────────────────────
// Demande Raph 2026-07-28 : « le jeu oublie dès qu'on fait un zoom dézoom et
// doit recharger ». Chaque bake PLEIN est photographié, indexé par sa clé
// complète — qui contient le zoom : la molette retombant toujours sur les mêmes
// crans (×1,12 par cran, cf. CAM_FEEL.wheelStep), revenir à un zoom déjà visité
// redevient un HIT exact, sans re-échelle donc sans flou. Restaurer coûte UNE
// copie de canvas (~2-4 ms) au lieu de la remontée aplat → light → tranches →
// plein (~0,5-1 s ressentie). Pré-cuire le monde entier à toutes les échelles ne
// tiendrait pas en mémoire (l'empreinte du seul plancher de zoom se compte en
// dizaines de Mpx) ; ici : N bakes écran+marge (~9 Mo pièce), éviction LRU.
// Invalidation : la clé porte layout/saison/band/preview, et le snapshot purge
// les entrées du layout mort. La capture ignore le cache (déterminisme).
// A/B : globalThis.__groundZoomCache = false.
// Diagnostic : globalThis.__groundZoomCacheStats = { restores, snapshots } —
// lisible en prod (le harnais de mesure n'a pas accès aux hooks dev).
// 8 photos : le cran courant + le plancher + ~5 jalons intermédiaires de la
// pré-cuisson, avec une place de battement (~75 Mo au pire — palier Élevée).
const GROUND_ZOOM_CACHE_MAX = 8;
// `missBase` : un restore a échoué faute d'entrée de la MÊME BASE (la base a
// changé sous le cache — recompute de layout, saison…) ; `purges` : entrées de
// base morte retirées au snapshot. Ensemble ils disent si le cache MEURT plus
// vite qu'il ne sert — le doute que le banc à sim GELÉE ne peut pas lever.
const gzcStats = { restores: 0, snapshots: 0, missBase: 0, purges: 0, prebakes: 0 };
if (typeof globalThis !== 'undefined') globalThis.__groundZoomCacheStats = gzcStats;
// Identité de CONTENU du sol — ce que drawIsoGround consomme réellement.
// La clé du bake vivant porte `layoutRecomputeAt`, un TIMESTAMP : en sim
// VIVANTE il tourne toutes les ~10 s (croissance, automation) et tuait le
// cache alors que le sol n'avait pas bougé d'un pixel (mesuré : 3 purges et
// 1 missBase en 8 s d'idle — retour Raph « ça se recalcule encore en zoom
// dézoom », le banc à sim gelée ne pouvait pas le voir). Le CACHE indexe donc
// par les tailles des ensembles qui dessinent le sol + la graine du monde.
// Deux plans différents à comptes STRICTEMENT égaux partageraient une photo —
// tracés dérivés du seed et des comptes, cas théorique ; et le bake VIVANT se
// recuit de toute façon au recompute : une photo périmée ne survivrait que
// jusqu'au premier repos sur son cran, qui la re-photographie.
// Mémoïsée par RÉFÉRENCE de layout : un calcul par recompute, zéro par frame.
// ── PRÉ-CUISSON EN FOND (v2 du cache — demande Raph : « un chargement au
// début puis plus rien ») : au repos long, une fois l'écran servi, on cuit
// silencieusement les crans de zoom que le joueur ATTEINDRA — le plancher
// d'abord (le dézoom max est le geste réflexe), puis un jalon tous les DEUX
// crans jusqu'au zoom courant (l'approché à ± ½ cran comble les impairs).
// Chaque cran se cuit PAR TRANCHES de ~8 ms sur les frames de repos (même
// mécanique que le sol plein en tranches) vers un canvas tiers : jamais de
// gel, le 60 fps du repos est préservé. Cuire à un AUTRE zoom que l'écran =
// poser CM.cam.zoom le temps d'une tranche (restauré en finally) — la caméra
// ne bouge pas (restful exigé, pré-bake ANNULÉ si elle bouge en cours).
// La photo du plancher est ancrée à la caméra courante : le clamp du vrai
// dézoom recentrera peut-être ailleurs — le défilement incrémental recuira
// alors les seules bandes exposées, et le premier repos re-photographie.
// Diagnostic : __groundZoomCacheStats.prebakes.
let gzcPre = null;   // { base, z, canvas, pctx, i, n, W, H, camX, camY, z0 }
function gzcPrebakeStrip(canvas, pctx, z2, yr) {
  const dpr = CM.dpr || 1;
  const M = CM._bakeMargin || 0;
  const mainCtx = CM.ctx, cw0 = CM.cw, ch0 = CM.ch, z0 = CM.cam.zoom;
  CM.cw = cw0 + 2 * M; CM.ch = ch0 + 2 * M;
  CM.ctx = pctx;
  CM.cam.zoom = z2;
  const hh2 = CM.TILE * z2 * ISO_Y;
  ISO_GROUND_SLICE.on = true;
  ISO_GROUND_SLICE.yOn = true; ISO_GROUND_SLICE.xOn = false;
  ISO_GROUND_SLICE.y0 = yr[0]; ISO_GROUND_SLICE.y1 = yr[1];
  ISO_GROUND_SLICE.padTop = hh2 * 5; ISO_GROUND_SLICE.padBot = hh2 * 2;
  pctx.save();
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.beginPath();
  const ry0 = Math.floor((yr[0] - 2) * dpr), ry1 = Math.ceil((yr[1] + 2) * dpr);
  pctx.rect(0, ry0, canvas.width, ry1 - ry0);
  pctx.clip();
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  try {
    drawIsoGround();
  } finally {
    pctx.restore();
    ISO_GROUND_SLICE.on = false; ISO_GROUND_SLICE.xOn = false; ISO_GROUND_SLICE.yOn = true;
    CM.cam.zoom = z0;
    CM.ctx = mainCtx; CM.cw = cw0; CM.ch = ch0;
  }
}

let gzcSigL = null, gzcSig = '';
function groundContentSig(L) {
  if (L === gzcSigL) return gzcSig;
  gzcSigL = L;
  const n = (x) => (x ? ((x.size != null ? x.size : x.length) | 0) : 0);
  gzcSig = (L.gridN | 0) + '.' + (L.mapSeed | 0)
    + '.' + n(L.roadSet) + '.' + n(L.urbanSet) + '.' + n(L.roadMap)
    + '.' + n(L.meadow) + '.' + n(L.wonderGround)
    + '.' + (L.river && L.river.present ? n(L.river.cells) : 0);
  return gzcSig;
}

// Point d'entrée : rend la frame iso. Renvoie false si layout absent (repli legacy).
// helpers = { bakeMargin, blitMargin } (les caches offscreen du runtime, déjà
// compatibles iso : le pan est projeté dans cityMapBakeMargin/BlitMargin).
// Le renderer JALONNE la frame (fp) mais n'en est pas propriétaire : le relevé
// est ouvert et clos par cityMapRuntime.frame(), qui englobe aussi le préambule.
// Cf. framePerf.js pour le pourquoi.
export function drawIsoWorld(dt, now, helpers) {
  const L = CM.layout;
  if (!L) return false;
  // ── CAMÉRA DE RENDU QUANTIFIÉE AU PIXEL DEVICE ────────────────────────────
  // La physique du geste vit sur une caméra CONTINUE, mais chaque couche
  // dessinée à des positions fractionnaires snappe à sa façon (le sol au blit,
  // chaque sprite à son drawImage) : les phases relatives dérivaient d'une
  // frame à l'autre — « l'image frissonne » au drag/dézoom (retour Raph, encore
  // présent après l'unification du sol seul). Remède canonique du pixel-art :
  // le RENDU entier se fait sous une caméra snappée pour que la projection
  // tombe sur la grille device — toutes les couches partagent LA même grille,
  // le monde avance par pas d'un pixel franc, aucune phase relative ne bouge.
  // (u,v) = axes écran de la projection iso ; l'inverse est exact.
  const camRX = CM.cam.x, camRY = CM.cam.y;
  {
    const z = CM.cam.zoom, dpr = CM.dpr || 1;
    const ku = ISO_X * z * dpr, kv = ISO_Y * z * dpr;
    const u = Math.round((camRX - camRY) * ku) / ku;
    const v = Math.round((camRX + camRY) * kv) / kv;
    CM.cam.x = (u + v) / 2;
    CM.cam.y = (v - u) / 2;
  }
  try {
    return drawIsoWorldInner(dt, now, helpers);
  } finally {
    CM.cam.x = camRX; CM.cam.y = camRY;
  }
}

function drawIsoWorldInner(dt, now, helpers) {
  const L = CM.layout;
  // Boîtes écran des habitations réellement dessinées, collectées par la passe
  // vivante (drawIsoLive) et consommées par le SURVOL : hit-test à la silhouette
  // puis liseré. Remise à zéro ICI, en tête de frame : c'est le seul point qui
  // garantit qu'aucune boîte d'une frame précédente (caméra bougée depuis) ne
  // survit. null en LOD, où l'on ne dessine plus de sprite individuel.
  CM._houseBoxes = CM.lodActive ? null : [];
  // Idem pour les MERVEILLES (publiées par drawWonder) : leur survol se faisait
  // sur un disque au sol, qui rate une merveille qui lève — l'Œil flotte.
  // Jamais null, même en LOD : une merveille reste dessinée sprite par sprite.
  CM._wonderBoxes = [];
  refreshSeasonPalette();
  // Sim : mêmes mises à jour que le pipeline legacy (les agents vivent).
  updateCitizens(dt);
  updateVehicles(dt);
  updateCrisis(dt, now);   // émeute : même sim que le legacy ; rendu via le peintre (drawIsoLive)
  fp('sim-agents');
  // Fond hors-monde (nature sombre) puis sol baké.
  const ctx = CM.ctx;
  ctx.fillStyle = rgb(SEASON_WILD, 0.9);
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (CM.groundCanvas && helpers) {
    // ':pv…' : l'aperçu __showWonder ajoute son parvis au sol → rebake à l'aller-retour.
    // La SAISON entre dans la clé : elle change l'herbe, les brins et les fleurs,
    // qui sont bakés. Elle ne bouge que par crans très espacés (cf. seasonMode),
    // donc elle ne peut pas déclencher de recuisson en rafale.
    // `keyBase` = la clé SANS le zoom : l'identité de CONTENU. Le cache de crans
    // s'en sert pour reconnaître « même monde, autre échelle » (restore approché).
    const keyPre = 'iso:' + CM.layoutRecomputeAt + ':';
    const keySuf = ':' + ((L.counts && L.counts.eraBand) | 0)
      + ':s' + (CM.season | 0)
      + (CM.previewWonder ? ':pv' + CM.previewWonder.id : '');
    const key = keyPre + CM.cam.zoom.toFixed(3) + keySuf;
    // Base du CACHE DE CRANS : identité de contenu (signature du sol), PAS le
    // timestamp de recompute — cf. groundContentSig pour le pourquoi.
    const cacheBase = 'isoC:' + groundContentSig(L) + keySuf;
    // RECUISSON COALESCÉE : recuire le sol coûte des centaines de ms sur une
    // mégapole — on ne le fait JAMAIS pendant un geste. Tant que la clé bouge
    // (zoom en cours) ou que le pan déborde la marge, on re-blitte le bake
    // EXISTANT compensé (échelle zoom/z_bake + delta de pan) : flou bref type
    // carte web, zéro gel. La recuisson (sol NET) arrive dès que la caméra est
    // immobile depuis ISO_SETTLE_MS (ou en capture, déterministe) — délai court
    // pour que le net revienne vite après un zoom/pan, sans recuire en plein geste.
    // `soft` = invalidation DOUCE (sprite décodé en retard) : contenu encore
    // valable → coalescée ici ; `null` reste l'invalidation DURE (canvas
    // effacé/recréé : rien à re-blitter) → recuisson immédiate.
    // ── CACHE DE CRANS : RESTAURATION, EXACTE OU APPROCHÉE ────────────────────
    // EXACTE (même clé, zoom compris) : on repose la photo dans le canvas de
    // travail et la cascade n'y voit qu'un bake valide (sameContent) — blit
    // direct, zéro recuisson. C'est l'atterrissage instantané d'un zoom déjà
    // visité.
    // APPROCHÉE : pendant le GESTE, le zoom GLISSE (cmCameraGlide) par des
    // valeurs intermédiaires qu'aucune clé exacte ne re-matchera jamais — la
    // première version du cache n'avait donc AUCUN hit en geste (mesuré :
    // 1 restore sur tout un aller-retour). On sert alors le cran caché le plus
    // PROCHE en échelle (≤ ½ cran de molette, soit ±5,8 %) comme SOURCE du
    // re-blit compensé : il reste un blit compensé (other garde la clé d'origine
    // de la photo, la cascade compense zoom/zoomB), mais depuis une image du bon
    // voisinage au lieu du bake de départ du geste — quasi net au lieu de flou
    // croissant. Un bake courant déjà plus proche (ou aussi proche) est gardé.
    if (!CM.capture && globalThis.__groundZoomCache !== false) {
      const cur = CM._isoGroundBake;
      if (!(cur && !cur.soft && cur.other === key)) {
        const gc = CM._groundZoomCache;
        if (gc && gc.size) {
          let best = null, bestD = Infinity;
          for (const e of gc.values()) {
            if (e.base !== cacheBase || !e.canvas) continue;
            if (e.canvas.width !== CM.groundCanvas.width || e.canvas.height !== CM.groundCanvas.height) continue;
            const d = Math.abs(Math.log(e.z / CM.cam.zoom));
            if (d < bestD) { bestD = d; best = e; }
          }
          if (!best) gzcStats.missBase += 1;
          // ½ cran de molette (cf. CAM_FEEL.wheelStep = 1,12).
          const HALF_STEP = Math.log(1.12) / 2;
          // Une photo est « exacte » au grain de la clé vivante (zoom à 3
          // décimales) : sous ±0,05 % l'écart d'échelle est sous le pixel.
          const exact = !!best && Math.abs(best.z - CM.cam.zoom) < CM.cam.zoom * 5e-4;
          // Distance d'échelle du bake courant — un lod/soft ne compte pas
          // (une photo PLEINE, même approchée, vaut mieux qu'un allégé exact).
          const curLod = !!cur && (!!cur.soft || !cur.other || cur.other.endsWith(':lod') || cur.other.endsWith(':lodl'));
          const curD = (cur && !curLod && cur.zoomB != null) ? Math.abs(Math.log(cur.zoomB / CM.cam.zoom)) : Infinity;
          // Déjà installé ? (exact : la clé vivante ; approché : le marqueur et
          // SON échelle) — sinon on recopierait la photo à chaque frame.
          const installed = !!cur && (exact
            ? cur.other === key
            : (cur.other === '__zoomcache__' && best && Math.abs((cur.zoomB || 0) - best.z) < 1e-9));
          if (best && bestD <= HALF_STEP && !installed && (exact || bestD < curD - 1e-9)) {
            gc.delete(best.key); gc.set(best.key, best);   // rafraîchit le rang LRU
            const g = CM.gctx;
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.clearRect(0, 0, CM.groundCanvas.width, CM.groundCanvas.height);
            g.drawImage(best.canvas, 0, 0);
            g.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
            // EXACTE → la photo prend la clé VIVANTE COURANTE (pas celle de sa
            // naissance : le timestamp a pu tourner depuis) → sameContent →
            // blit direct. APPROCHÉE → marqueur jamais égal à une clé vivante :
            // la cascade choisit le re-blit compensé depuis cette photo.
            CM._isoGroundBake = exact
              ? { camX: best.camX, camY: best.camY, other: key, zoomB: CM.cam.zoom }
              : { camX: best.camX, camY: best.camY, other: '__zoomcache__', zoomB: best.z };
            gzcStats.restores += 1;
          }
        }
      }
    }
    const bm = CM._isoGroundBake;
    const M = CM._bakeMargin || 0;
    const pd = bm ? panDeltaToScreen(CM.cam.x - bm.camX, CM.cam.y - bm.camY) : null;
    const nowMs = performance.now();
    // ACCALMIE SUR LE MOUVEMENT RÉEL de la caméra — surtout PAS sur la clé : un
    // DRAG ne change pas la clé (zoom et layout fixes), donc une accalmie « clé
    // stable » se croyait au repos en plein geste et recuisait en boucle (retour
    // Raph : « ça rame au drag »).
    if (CM.cam.x !== CM._igX || CM.cam.y !== CM._igY || CM.cam.zoom !== CM._igZ) {
      CM._igX = CM.cam.x; CM._igY = CM.cam.y; CM._igZ = CM.cam.zoom; CM._igMoveAt = nowMs;
    }
    const stillMs = nowMs - (CM._igMoveAt || 0);
    const settled = CM.capture || stillMs > ISO_SETTLE_MS;
    // `restful` = accalmie LONGUE (cf. ISO_CRISP_SETTLE_MS) : elle seule autorise
    // le sol plein. `settled` ne donne plus que le sol allégé.
    const restful = CM.capture || stillMs > ISO_CRISP_SETTLE_MS;
    // Les suffixes ':lod' (allégé HARD) et ':lodl' (allégé LIGHT, textures et
    // voiles gardés) marquent un bake posé pendant un geste : même contenu de
    // base, détails en moins → à remplacer par un bake plein au repos.
    const baseOf = (k) => (k && k.endsWith(':lodl') ? k.slice(0, -5)
      : k && k.endsWith(':lod') ? k.slice(0, -4) : k);
    const sameContent = !!bm && !bm.soft && baseOf(bm.other) === key;
    const inMargin = !!bm && !!M && Math.abs(pd.x) <= M && Math.abs(pd.y) <= M;
    const isLod = !!bm && !!bm.other && (bm.other.endsWith(':lod') || bm.other.endsWith(':lodl'));
    // `level` : false = PLEIN, 'light' = allégé textures/voiles gardés, true =
    // allégé HARD (l'aplat historique, repli des machines lentes).
    const bake = (level) => {
      // Une invalidation douce ne change pas la clé : forcer le mismatch pour que
      // bakeMargin recuise vraiment (sinon le soft collerait pour toujours).
      if (bm && bm.soft) bm.other = '__soft__';
      ISO_GROUND_LOD.on = level !== false;
      ISO_GROUND_LOD.light = level === 'light';
      const t0 = performance.now();
      helpers.bakeMargin(CM.groundCanvas, CM.gctx, '_isoGroundBake',
        key + (level === 'light' ? ':lodl' : level ? ':lod' : ''), drawIsoGround);
      ISO_GROUND_LOD.on = false;
      ISO_GROUND_LOD.light = false;
      // Toute recuisson réelle ouvre la fenêtre de coalescence des softs : un
      // décodage qui arrive 50 ms après un bake frais attendra la fin de fenêtre.
      CM._isoSoftBakeAt = nowMs;
      if (CM._isoGroundBake !== bm) {
        CM._isoGroundBake.zoomB = CM.cam.zoom;  // ancre du stale-blit
        // Coûts RÉELS mesurés : le plein décide du « sol net en plein geste »
        // (crispAffordable), le light décide si le pan hors marge peut se payer
        // les textures (lightAffordable) — auto-calibrants tous les deux.
        const dt = performance.now() - t0;
        if (level === false) { CM._isoGroundBakeMs = dt; CM._isoGroundBakeMsZ = CM.cam.zoom; }
        else if (level === 'light') { CM._isoGroundLightMs = dt; CM._isoGroundLightMsZ = CM.cam.zoom; }
      }
      helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');
    };
    // ── « Sol net pendant le geste » : désormais CONDITIONNÉ AU COÛT MESURÉ ────
    // Le palier « Élevée » recuisait le sol NET à chaque cran de zoom. Arbitrage
    // tenable quand une recuisson coûtait quelques dizaines de ms ; intenable
    // depuis que les villes ont grossi — mesuré sur une ville de 2 058 tuiles :
    // 140 ms à zoom 1, 640 ms à 0,5, **962 ms à 0,35**. Or la clé change à CHAQUE
    // frame d'un geste : on payait donc ~1 s par image, et le dézoom se figeait
    // (signalé par Raph : « le dézoom fait laguer à mort »).
    //
    // Le préréglage ne peut pas trancher seul : il est choisi d'après le nombre de
    // cœurs (16 cœurs → « Élevée » d'office), pas d'après la taille de la ville. On
    // mesure donc la dernière recuisson réelle et on n'insiste que si elle tient
    // dans le budget. Sinon on retombe sur le re-blit compensé — flou bref type
    // carte web, déjà implémenté plus bas — et le sol NET revient dès l'arrêt.
    // Auto-calibrant : la 1re recuisson chère est payée une fois, puis évitée.
    // Molette : window.__crispBudgetMs.
    const crispBudget = (typeof window !== 'undefined' && window.__crispBudgetMs) || ISO_CRISP_BUDGET_MS;
    // PRÉDICTIF, pas seulement rétrospectif (2026-07-28) : la dernière mesure
    // date souvent du zoom de JEU, où le bake est bon marché — au début de chaque
    // geste de DÉZOOM, le budget autorisait donc 2-3 recuissons pleines dont le
    // coût grimpe avec l'aire visible (gels « sol » de 25→68 ms relevés au
    // profil de geste) avant d'apprendre. Or ce coût est ∝ cellules visibles,
    // donc ∝ 1/zoom² : on extrapole la mesure au zoom courant et on coupe AVANT
    // de payer le premier gel. Au zoom de jeu l'estimation vaut la mesure
    // (rapport ≈ 1) : le sol net du palier Élevée y reste entier.
    const crispZ = CM._isoGroundBakeMsZ || CM.cam.zoom;
    const crispEstMs = (CM._isoGroundBakeMs || 0) * Math.max(1, (crispZ / CM.cam.zoom) ** 2);
    const crispAffordable = crispEstMs <= crispBudget;
    // Même prédiction pour le bake ALLÉGÉ : lui n'était budgeté que sur le pan
    // hors marge, alors qu'un GESTE DE MOLETTE réel l'atteint par une autre
    // porte — les crans s'espacent de plus d'ISO_SETTLE_MS (110 ms < cadence
    // humaine), donc chaque cran est « accalmie courte » → bake('light') SANS
    // garde-fou. Au dézoom d'une mégapole ce light coûte ~100 ms : un gel PAR
    // CRAN de molette (profil de geste 2026-07-28 : gels « sol » de 98-134 ms).
    // Sur-budget → aplat HARD transitoire (10-20 ms), textures au repos long —
    // le même arbitrage que le pan hors marge fait depuis toujours.
    const lightZ = CM._isoGroundLightMsZ || CM.cam.zoom;
    const lightEstMs = (CM._isoGroundLightMs || 0) * Math.max(1, (lightZ / CM.cam.zoom) ** 2);
    const lightBudget = (typeof window !== 'undefined' && window.__lightBudgetMs) || ISO_LIGHT_BUDGET_MS;
    if (CM.crispGesture && crispAffordable && !settled && bm && !sameContent) {
      // MAXIMALE : zoom/dézoom en cours → au lieu du re-blit LISSÉ (flou), on
      // recuit le sol NET à l'échelle exacte de la frame (la clé change à chaque
      // cran de zoom, donc on rebake de toute façon : on le fait proprement).
      // Zéro flou ; le geste peut être moins fluide sur très grande ville — c'est
      // l'arbitrage assumé de ce palier. Le pan pur (clé stable) garde son blit
      // translaté fluide via les branches ci-dessous.
      bake(false);
    } else if (sameContent && inMargin && !(restful && isLod)) {
      // `restful` et non `settled` : tant que le joueur enchaîne les crans, on
      // GARDE le bake allégé au lieu de le remplacer par un plein à chaque pause.
      // DÉFILEMENT FIN : sans attendre le franchissement de marge (delta accumulé
      // de 250+ px → bande de ~20 % du canvas → à-coup de 25-50 ms), le canvas
      // glisse dès SOL_SCROLL_STEP px de delta — bandes minuscules (~6 % du
      // canvas), coût lissé en ~5-10 ms tous les quelques frames de drag.
      if (!CM.capture && (Math.abs(pd.x) >= SOL_SCROLL_STEP || Math.abs(pd.y) >= SOL_SCROLL_STEP)
        && scrollGroundOnPan(bm, pd, helpers)) {
        // scrollGroundOnPan a ré-ancré et bliité.
      } else {
        helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');   // rien à faire
      }
    } else if (settled
      // RAFALE DE DÉCODAGES (cascade au chargement) : quand la SEULE raison
      // d'arriver ici est une invalidation douce (clé inchangée, dans la marge),
      // le bake existant est encore valable — on le re-blitte tel quel et on
      // coalesce la recuisson (au plus une par ISO_SOFT_BAKE_MIN_MS, fenêtre
      // rouverte par toute recuisson réelle). La capture reste déterministe :
      // elle recuit toujours tout de suite.
      && (CM.capture || !(bm && bm.soft && baseOf(bm.other) === key && inMargin
           && nowMs - (CM._isoSoftBakeAt || 0) < ISO_SOFT_BAKE_MIN_MS))) {
      // Repos → sol plein, tous les détails.
      //
      // ⚠ TENTÉ PUIS REJETÉ (2026-07-24) : recuire en ALLÉGÉ sous un seuil de zoom,
      // au motif que touffes et franges y passent sous le pixel. Gain réel mesuré
      // −35 % à zoom 0,5 (1 015 → 662 ms) et −42 % à 0,4 (1 345 → 782). Mais la
      // comparaison À L'ŒIL est sans appel : le pavage perd sa texture et devient un
      // APLAT uniforme, marquages compris, et cela se voit dès 0,5 comme à 0,35.
      // On paierait une perte de matière visible pour une saccade qui resterait de
      // ~0,8 s. Le vrai correctif est d'accélérer la boucle par cellule (607 ms des
      // 1 018 à zoom 0,4), pas de retirer du dessin.
      //
      // Ce qui suit ne rouvre PAS ce débat : l'allégé n'est ici que TRANSITOIRE,
      // le temps que le joueur finisse d'enchaîner ses crans (≤ ISO_CRISP_SETTLE_MS),
      // exactement comme la branche de pan hors marge juste dessous. Le sol plein
      // revient dès l'arrêt réel — on ne perd pas de matière, on la retarde.
      // L'accalmie COURTE pose désormais le LIGHT (textures/voiles gardés) : le
      // « sol tout blanc » entre deux crans était le premier reproche visuel.
      if (!restful) {
        bake(lightEstMs <= lightBudget ? 'light' : true);
      } else if (bm && isLod && !CM.capture && baseOf(bm.other) === key && inMargin
        && (typeof window === 'undefined' || window.__solSlices !== 0)) {
        // Repos long avec un LIGHT de la même clé à l'écran : le plein arrive
        // EN TRANCHES (cf. runGroundSliceStep) au lieu d'un gel d'une frame.
        runGroundSliceStep(key, nowMs, helpers);
      } else {
        bake(false);
      }
    } else if (sameContent && !inMargin) {
      // PAN hors marge, même zoom : DÉFILEMENT INCRÉMENTAL — auto-copie du
      // canvas décalée au pixel entier + recuisson des seules bandes exposées,
      // au niveau de détail du contenu en place (pleine qualité conservée sur
      // toutes les machines). Repli sur l'ancienne recuisson complète allégée
      // (light si abordable, sinon aplat — molette __lightBudgetMs) pour les
      // flings géants, la capture ou un zoom intra-cran désaligné.
      if (!scrollGroundOnPan(bm, pd, helpers)) {
        bake(lightEstMs <= lightBudget ? 'light' : true);
      }
    } else if (bm && bm.zoomB != null) {
      // ZOOM en cours : re-blit du bake existant compensé (échelle zoom/z_bake +
      // delta de pan) — flou bref type carte web, zéro gel, net ~160 ms après.
      const s = CM.cam.zoom / bm.zoomB;
      const cx = CM.cw / 2, cy = CM.ch / 2;
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;   // transitoire : lissé vieillit mieux que crénelé
      ctx.drawImage(CM.groundCanvas,
        cx - s * (cx + M) - pd.x, cy - s * (cy + M) - pd.y,
        (CM.cw + 2 * M) * s, (CM.ch + 2 * M) * s);
      ctx.imageSmoothingEnabled = prev;
    } else {
      // Rien à réutiliser (1er bake, canvas effacé) — light lui aussi sous budget.
      bake(restful ? false : (lightEstMs <= lightBudget ? 'light' : true));
    }
    // ── CACHE DE CRANS : SNAPSHOT ─────────────────────────────────────────────
    // Un bake PLEIN vient d'être posé (recuisson, tranches, ou déjà en place) :
    // on le photographie pour son cran. AU REPOS SEULEMENT (`settled`) : pendant
    // un geste au zoom de jeu, le crisp pose un plein par frame de GLIDE — des
    // zooms intermédiaires quelconques qui photographiés pourrissaient le LRU
    // (mesuré : 17 photos dont 14 de crans jamais revisitables). Re-photographie
    // seulement si l'ancre a dérivé de plus d'une demi-marge (les pans au même
    // zoom rafraîchissent la photo, les frames immobiles ne coûtent qu'une
    // comparaison).
    if (!CM.capture && settled && globalThis.__groundZoomCache !== false) {
      const b2 = CM._isoGroundBake;
      if (b2 && !b2.soft && b2.other === key) {
        const gc = CM._groundZoomCache || (CM._groundZoomCache = new Map());
        // La photo vit sous SA clé de cache (contenu + zoom), détachée du
        // timestamp de la clé vivante : elle survit aux recomputes muets.
        const cacheKey = cacheBase + '@' + CM.cam.zoom.toFixed(3);
        let e = gc.get(cacheKey);
        let moved = true;
        if (e) {
          const dse = panDeltaToScreen(b2.camX - e.camX, b2.camY - e.camY);
          moved = Math.abs(dse.x) > M / 2 || Math.abs(dse.y) > M / 2;
        }
        if (moved) {
          const W = CM.groundCanvas.width, H = CM.groundCanvas.height;
          if (e) gc.delete(cacheKey);
          else e = { canvas: null, camX: 0, camY: 0, zoomB: CM.cam.zoom, key: cacheKey, base: cacheBase, z: CM.cam.zoom };
          gc.set(cacheKey, e);
          if (!e.canvas || e.canvas.width !== W || e.canvas.height !== H) {
            if (typeof OffscreenCanvas !== 'undefined') e.canvas = new OffscreenCanvas(W, H);
            else { e.canvas = document.createElement('canvas'); e.canvas.width = W; e.canvas.height = H; }
          }
          const ec = e.canvas.getContext('2d');
          if (ec) {
            ec.setTransform(1, 0, 0, 1, 0, 0);
            ec.clearRect(0, 0, W, H);
            ec.drawImage(CM.groundCanvas, 0, 0);
            e.camX = b2.camX; e.camY = b2.camY;
            e.zoomB = (b2.zoomB != null) ? b2.zoomB : CM.cam.zoom;
            e.key = cacheKey; e.base = cacheBase; e.z = CM.cam.zoom;
            gzcStats.snapshots += 1;
            // Purge : les photos d'un AUTRE contenu de sol (signature ou saison
            // différentes) ne serviront plus — rendre la mémoire tout de suite.
            // Puis éviction LRU.
            for (const [k0, e0] of [...gc.entries()]) if (e0.base !== cacheBase) { gc.delete(k0); gzcStats.purges += 1; }
            while (gc.size > GROUND_ZOOM_CACHE_MAX) gc.delete(gc.keys().next().value);
          } else {
            gc.delete(cacheKey);   // contexte refusé : pas d'entrée fantôme
          }
        }
      }
    }
    // ── CACHE DE CRANS : PRÉ-CUISSON EN FOND ──────────────────────────────────
    // (cf. gzcPrebakeStrip) — une tranche par frame de repos LONG, écran déjà
    // servi en plein ; jamais pendant un aperçu de merveille (sol transitoire)
    // ni pendant les tranches écran (_solSlice) — un seul chantier à la fois.
    // HYSTÉRÉSIS DE CONTENU : en pleine croissance, la signature du sol change
    // réellement toutes les quelques secondes — sans garde-fou la pré-cuisson
    // tournait en tapis roulant (mesuré : 18 pré-cuissons, 14 purgées aussitôt
    // sur 20 s de sim vivante). On attend que le CONTENU soit stable ≥ 3 s.
    if (CM._gzcSigSeen !== cacheBase) { CM._gzcSigSeen = cacheBase; CM._gzcSigAt = nowMs; }
    if (!CM.capture && restful && !CM.previewWonder && _solSlice === null
      && nowMs - (CM._gzcSigAt || 0) > 3000
      && globalThis.__groundZoomCache !== false) {
      const bNow = CM._isoGroundBake;
      if (bNow && !bNow.soft && bNow.other === key) {
        // Annulé si le monde, l'écran ou la caméra ont bougé depuis l'amorce :
        // des tranches cuites sous deux caméras ne se raccordent pas.
        if (gzcPre && (gzcPre.base !== cacheBase || gzcPre.W !== CM.groundCanvas.width
          || gzcPre.H !== CM.groundCanvas.height || gzcPre.camX !== CM.cam.x
          || gzcPre.camY !== CM.cam.y || gzcPre.z0 !== CM.cam.zoom)) gzcPre = null;
        if (!gzcPre) {
          // Prochaine cible : le plancher, puis un jalon tous les DEUX crans
          // sous le zoom courant — la suite que la molette suivra réellement,
          // les crans impairs étant servis par le restore approché (± ½ cran).
          const targets = [0.35];
          for (let zt = CM.cam.zoom / (1.12 * 1.12); zt > 0.35 * 1.06; zt /= (1.12 * 1.12)) targets.push(zt);
          const gcm = CM._groundZoomCache;
          let pick = null;
          for (const t of targets) {
            let has = false;
            if (gcm) {
              for (const e of gcm.values()) {
                if (e.base === cacheBase && Math.abs(Math.log(e.z / t)) < Math.log(1.12) / 4) { has = true; break; }
              }
            }
            if (!has) { pick = t; break; }
          }
          if (pick != null) {
            const W = CM.groundCanvas.width, H = CM.groundCanvas.height;
            let cnv;
            if (typeof OffscreenCanvas !== 'undefined') cnv = new OffscreenCanvas(W, H);
            else { cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H; }
            const pctx = cnv.getContext('2d');
            if (pctx) {
              // Tranches de ~8 ms : coût du cran extrapolé de la dernière
              // recuisson pleine mesurée (∝ 1/zoom², comme crispEstMs).
              const est = (CM._isoGroundBakeMs || 60)
                * Math.max(1, ((CM._isoGroundBakeMsZ || CM.cam.zoom) / pick) ** 2);
              gzcPre = {
                base: cacheBase, z: pick, canvas: cnv, pctx, i: 0,
                n: Math.max(3, Math.min(120, Math.ceil(est / 8))),
                W, H, camX: CM.cam.x, camY: CM.cam.y, z0: CM.cam.zoom,
              };
            }
          }
        }
        if (gzcPre) {
          const fullH = CM.ch + 2 * M;
          gzcPrebakeStrip(gzcPre.canvas, gzcPre.pctx, gzcPre.z,
            [fullH * gzcPre.i / gzcPre.n, fullH * (gzcPre.i + 1) / gzcPre.n]);
          gzcPre.i += 1;
          if (gzcPre.i >= gzcPre.n) {
            const gcm2 = CM._groundZoomCache || (CM._groundZoomCache = new Map());
            const kC = cacheBase + '@' + gzcPre.z.toFixed(3);
            gcm2.delete(kC);
            gcm2.set(kC, {
              canvas: gzcPre.canvas, camX: gzcPre.camX, camY: gzcPre.camY,
              zoomB: gzcPre.z, key: kC, base: cacheBase, z: gzcPre.z,
            });
            gzcStats.prebakes = (gzcStats.prebakes || 0) + 1;
            while (gcm2.size > GROUND_ZOOM_CACHE_MAX) gcm2.delete(gcm2.keys().next().value);
            gzcPre = null;
          }
        }
      }
    }
  } else {
    drawIsoGround();
  }
  fp('sol');
  // Fleuve LIVE (animé) par-dessus le sol baké → QUAIS par ère (promenade le
  // long du ruban, partagés avec le legacy : cityMapDrawQuays projette via le
  // module iso) → SOUS-STRUCTURE des ponts (ombre sur l'eau + piles) → bateaux
  // SUR l'eau (devant les piles quand ils sont au sud, sous le tablier sinon)
  // → tabliers de pont → scène vivante → drones (passe aérienne) → nuit.
  // Terre-plein : le gazon du bake porte le SOL ; le RELIEF vient de buissons
  // DEBOUT plantés dans la passe vivante (drawIsoLive) — la projection à plat
  // de l'art legacy « couchait » les plantes bakées (retour Raph).
  drawIsoRiver(now);
  fp('fleuve');
  // QUAIS BAKÉS. Recensé en direct : ~10 000 lineTo, 1 000 traits et 390 arcs par
  // frame — 90 % de tout le travail de chemins de la carte, pour une promenade
  // qui ne bouge jamais. Même traitement que le sol, qui coûtait ~7 ms/frame avant
  // d'être baké et en coûte 0,1 depuis.
  //
  // La clé porte TOUT ce qui change le tracé. La nuit y est QUANTIFIÉE au dixième :
  // le point de lampe bascule de couleur à 0,25 et `cmDayNightF` est une fonction
  // à plateaux, donc cela ne coûte que quelques recuissons par cycle jour/nuit.
  // Les lueurs (additives) restent EN DIRECT, cf. le mode dans cityMapDrawQuays.
  // A/B : globalThis.__quayBake = false rejoue le tracé en direct (référence).
  if (CM.quayCanvas && helpers && globalThis.__quayBake !== false) {
    const qk = 'q:' + CM.layoutRecomputeAt + ':' + CM.cam.zoom.toFixed(3)
      + ':b' + ((L.counts && L.counts.eraBand) | 0)
      + ':n' + (CM.nightF || 0).toFixed(1)
      + ':l' + (CM.lodActive ? 1 : 0)
      + ':w' + ((state.timeWear || 0) > 0.7 ? 1 : 0)
      + ':c' + (CM.collapseAt ? 1 : 0)
      // La molette __quayWall change le tracé à chaud → elle doit casser la clé.
      + ':t' + (quayWallTune.on ? 1 : 0) + (quayWallTune.full ? 1 : 0)
      + (quayWallTune.joints ? 1 : 0) + quayWallTune.heightK + '_' + quayWallTune.light;
    helpers.bakeMargin(CM.quayCanvas, CM.qctx, '_quayBake', qk, () => cityMapDrawQuays(now, 'base'));
    helpers.blitMargin(CM.quayCanvas, '_quayBake');
    cityMapDrawQuays(now, 'glow');
  } else {
    cityMapDrawQuays(now);
  }
  fp('quais');
  drawIsoBridgeUnder(now);
  fp('ponts-dessous');
  drawIsoShips(now);
  fp('bateaux');
  drawIsoBridges(now);
  fp('ponts');
  drawIsoLive(now);      // (les merveilles y sont des items du tri peintre)
  fp('scene-vivante');
  drawIsoBirds(now);     // nuée : passe aérienne, avant les drones
  drawIsoDrones(now);
  fp('ciel');
  drawIsoNight(now);
  drawIsoBridgeNight(now);   // lanternes de pont : halos + reflets dans l'eau, par-dessus le voile
  drawIsoShipNight(now);     // feux de position rouge/vert — même raison : le voile les mangeait
  fp('nuit');
  drawIsoRain(now);      // averse — après la nuit : la pluie passe DEVANT les halos
  drawIsoAmbient(now);   // feuilles / lucioles / motes — par-dessus le voile de nuit
  fp('meteo-ambiance');
  // Bulles de pensée (cartouches pixel cliquables) : tout en haut, comme le
  // legacy — la fonction est PARTAGÉE (projection worldToScreen dans agents.js).
  if (!CM.lodActive) drawCitizenThoughts(now);
  fp('bulles');
  return true;
}
