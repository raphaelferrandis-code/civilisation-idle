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
import { CM, cmHash, cmCellNoise, cmEngineAtelierFoot, ROAD_E, ROAD_N, ROAD_S, ROAD_W, CM_WONDERS, cmWonderActiveIds, cmWonderSlot, cmForEachWonderCell, treeBandMul, treeCanvasT } from '../layout.js';
import { fp } from '../framePerf.js';
import { state } from '../../core/state.js';
import { worldToScreen, screenToWorld, visibleCellBounds, visibleDiamondBounds, depthOf, panDeltaToScreen, screenDeltaToPan, wonderFootWorld, ISO_X, ISO_Y } from './projection.js';
import { drawPixelHouse, drawPixelHouseOutline, pixelHouseBox, pixelHouseReady } from '../pixelHouses.js';
import { grainTune } from '../spriteScale.js';
import { seasonGrass, seasonWild, seasonTip, seasonFlowerMul, seasonCanopyTint, WINTER } from '../seasonMode.js';
import { drawEngineSprite } from '../buildingShapes.js';
import { drawWonder } from '../renderBuildings.js';

// LA MAISON DES PLAISIRS. Un monument permanent posé en pleine eau, au large :
// il n'a ni rang ni condition, donc rien à voir avec le cache des merveilles
// (indexé id+rang). Un seul fichier, un seul chargement.
// PPT PROPRE, et non celui des merveilles (34). Le sprite a été recadré au ras de
// son encre — la moitié du canevas d'origine était vide —, si bien qu'à 34 il
// n'aurait plus fait que 4,8 tuiles de large contre 6,6 avant recadrage.
// 25 lui rend exactement sa présence : 207 px à l'écran, 6,5 tuiles.
// ⚠ Ce nombre va AVEC les dimensions du PNG : redécouper le sprite sans reprendre
// le PPT le ferait grandir ou rétrécir en silence.
const PLAISIRS_PPT = 25;
let plaisirsArt = null;
function plaisirsSprite() {
  if (!plaisirsArt) {
    plaisirsArt = { img: new Image(), ready: false };
    plaisirsArt.img.onload = () => { plaisirsArt.ready = true; };
    plaisirsArt.img.src = '/pixelart/wonders/plaisirs-t3.png';
  }
  return plaisirsArt.ready ? plaisirsArt : null;
}
// (engineStage n'était importé QUE pour choisir le stade de l'aqueduc-conduite,
//  retiré le 2026-08-05. Les points d'eau ont leur propre échelle d'ère, alignée
//  sur celle des places — cf. waterPointEra.)
import { propReady, blitProp, propBBox } from '../cityEngineSprites.js';
import { drawCachedEngineScene } from '../engineSceneCache.js';
import { engineAnimNow } from '../engineAnim.js';
import { glInit, glBegin, glQuad, glFlush, glGetCanvas } from '../glPainter.js';
import { suspendFlameGlow, paintFlameGlows } from '../flameGlow.js';
// Outil de calibrage des feux de position : n'expose que window.__navCalib et
// ne fait rien tant qu'on ne l'appelle pas (aucun coût en jeu). Il ne nous
// importe RIEN en retour (cycle ES = zone morte) : on lui pousse sa config.
import { configureNavCalib } from './navCalib.js';
// Vie de surface de l'eau. Même contrat que navCalib : il ne nous importe rien
// en retour (cycle ES = zone morte), on lui pousse ce dont il a besoin.
import { configureRiverLife, drawIsoRiverLife } from './isoRiverLife.js';
import { orbitPoint, FLEET_TUNE } from '../riverFleet.js';
import {
  LIGHT_LAYER, beginLightLayer, endLightLayer, suspendLightLayer,
  lightCtx, lightCut, lightCutImage, paintLightLayer,
} from '../lightLayer.js';
import { cityMapDrawQuays, updateCrisis, drawRiotWeapon, ensureQuayGate, quayWallTune, quayGapRuns } from '../renderWorld.js';
import { drawPixelBridges } from '../pixelBridge.js';
import { drawCritterIso } from '../critters.js';
import { drawIsoBridgeUnder, drawIsoBridgeNight, pushIsoBridgeItems, drawIsoBridgeSeg, bridgeBlocks, bridgeLiftScreen, isoBridge3dFlag } from './isoBridge.js';
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
  // personHT : les POINTS D'EAU se cotent au même étalon que le mobilier de
  // place — la hauteur d'un habitant. Cf. § POINTS D'EAU.
  personHT,
  // inkBox : la composition des BANDES de clôture a besoin de la boîte d'encre du
  // panneau. Même mesure que le dessin, jamais une seconde implémentation.
  inkBox,
} from './isoPlaza.js';
// MOBILIER DE TROTTOIR : la POSE vit là-bas (corps pur, testable), le dessin
// reste celui du kit des places. Cf. § MOBILIER DE TROTTOIR plus bas.
import { STREET_PROPS, computeStreetProps } from './isoStreetProps.js';
// CLÔTURES (lot L9) : la RÈGLE de pose et les entrées dérivées d'un layout vivent
// dans un module pur, partagé avec le compteur de `tissuMetrics` — cf. § CLÔTURES.
import { fenceEdges, fenceInputs, FENCE } from '../fenceEdges.js';

// ── Palette Phase 1 (flat, calée sur les teintes du rendu actuel) ────────────
const GRASS = [116, 138, 84];        // herbe / nature (référence = été)
const GRASS_WILD = [98, 120, 76];    // hors ville (léger contraste)
// PALETTE DE SAISON, résolue une fois par frame depuis CM.season. Ces variables
// remplacent GRASS / GRASS_WILD / GD_TIP partout où le SOL est peint : le sol
// étant baké, elles ne sont relues qu'à la recuisson, et la saison figure dans
// la clé du bake. Les constantes ci-dessus restent la référence d'été.
let SEASON_GRASS = GRASS, SEASON_WILD = GRASS_WILD, SEASON_TIP = null, SEASON_FLOWER_MUL = 1;
const WATER = [74, 98, 109];         // eau ardoise (cf. fleuve)
const PLAZA = [214, 206, 182];       // dallage d'esplanade (repli, toutes ères)
// DALLAGE PAR ÈRE — ton d'APLAT de chaque matière, mesuré par fetchGroundTiles.
// Il sert au repli (tuile pas encore décodée) et au LOD lointain, où la tuile
// n'est plus blittée : sans lui, une place changeait de couleur en dézoomant.
// Clé absente : on garde PLAZA.
const PLAZA_ERA_TONE = {
  antique: [219, 204, 185], medieval: [112, 115, 119], industrial: [89, 91, 97],
  modern: [190, 194, 197], cosmic: [233, 223, 211],
};
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
  // SUIT LE CORPS D'EAU (Raph, 2026-07-30). Depuis les coloris pilotés par l'état
  // (cf. WATER_SHEETS), un liseré figé en bleu-gris ardoise jurait franchement sur
  // un fleuve azur ou turquoise : c'est la MÊME eau, en moins profond, donc sa
  // teinte doit venir du même endroit. `follow: false` rend la main aux c1/c2/c3
  // ci-dessous, qui restent le jeu ardoise d'origine (et le repli si la table des
  // coloris ne dit rien).
  follow: true,
  // ÎLES : liseré clair OUI — et l'aller-retour vaut d'être raconté, pour que
  // personne ne le « corrige » en croyant rétablir un choix.
  //   · le matin du 2026-07-30, Raph le fait RETIRER : à ce moment-là le sable et
  //     le bleu tombaient au même endroit, et deux franges concentriques sur un
  //     fuseau étroit faisaient une cible plutôt qu'une berge ;
  //   · le soir, il le redemande — « il faut le liseré clair tout autour de
  //     l'île ». Entre les deux, le rivage de sable s'est posé pour de bon CÔTÉ
  //     TERRE (cf. le drapeau `withIslands` de buildEdges). Les deux ne se
  //     doublent donc plus : le sable dit la grève, le bleu dit le bas-fond, de
  //     part et d'autre de la ligne d'eau — exactement comme sur les berges du
  //     fleuve.
  // Ce n'est pas un avis qui a changé, c'est la scène.
  islands: true,
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
const ISO_TILE_KEYS = { grass: 'iso-grass', dirt: 'iso-dirt', urban: null, plaza: 'iso-plaza', wonder: 'iso-wonder', shingle: 'iso-shingle', sand: 'iso-sand' };
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
  // Galets de rivage : les 4 variantes échelonnent le CALIBRE de la pierre, pas
  // la valeur (écart de luminance 1,9 mesuré) — rien à égaliser, cf. le lot
  // 4dc13d54 dans fetchGroundTiles.mjs.
  'iso-shingle': 4, 'iso-shingle-winter': 4,
  // Sable de rivage : réserve de l'ancien lot road-tech, écart 4,0 entre variantes.
  'iso-sand': 4,
  // Dallage de place PAR ÈRE (Raph 2026-07-30 : « je veux des sprites de dalles,
  // pas de traits »). Appareillage en ARCS — le tracé rayonnant qu'il avait
  // refusé était dessiné à la volée par la place ; ici le rayonnement est CUIT
  // dans la matière, donc il tient à tous les zooms et ne coûte rien au bake.
  // ⚠ le moderne n'en a que TROIS : sa 4e variante constellait la place de taches
  // claires au pan (cf. fetchGroundTiles). Le compte doit suivre les FICHIERS —
  // annoncer 4 ferait demander un PNG absent, et blitIsoTileKey rendrait false
  // sur une cellule sur quatre, qui resterait en aplat au milieu du dallage.
  'iso-plaza-antique': 4, 'iso-plaza-medieval': 4, 'iso-plaza-industrial': 4,
  'iso-plaza-modern': 3, 'iso-plaza-cosmic': 4,
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
// ── LA GRÈVE NE PREND PAS LA NEIGE ───────────────────────────────────────────
// Retour Raph, 2026-07-30 : « laisse le sable même quand il neige sur l'île ».
// Ces deux matières étaient DANS la table ci-dessus, au motif qu'« une plage
// couverte n'a plus de couleur propre » — mais c'est justement l'inverse qui se
// voit en jeu : le rivage est la moitié de l'Aiguille (une île de 4,8 tuiles de
// large bordée de 0,8 de sable), et le voir blanchir efface l'île entière dans
// le blanc du reste. Le vrai argument est physique en plus d'être graphique :
// une grève que le ressac lave douze fois par minute ne tient pas la neige.
// Elles vivent donc à part, et `__beach.snow = true` rend l'ancien comportement.
const ISO_TILE_WINTER_BEACH = {
  'iso-shingle': 'iso-shingle-winter',
  'iso-sand': 'iso-shingle-winter',      // pas de sable enneigé dans le lot
};
// Tuile d'hiver d'une matière, grève comprise. ⚠ Déclarée en `function` et non
// en `const` : elle est appelée depuis blitIsoTileKey, plus haut dans le fichier
// que `BEACH` — une const serait en zone morte au chargement (le piège que
// NAV_STAGES a déjà tendu ici).
function isoWinterTile(key) {
  return ISO_TILE_WINTER[key] || (BEACH.snow ? ISO_TILE_WINTER_BEACH[key] : null);
}
// Ton MOYEN de la grève — aplat de repli du bake, bande de sable, rivage d'île.
// UN seul endroit : ces trois couches se superposent au pixel près, deux règles
// de saison différentes feraient lire la plage en deux matières selon la couche.
function beachTone(mat) {
  if (CM.season === WINTER && BEACH.snow) return SHINGLE_TONE_WINTER;
  return mat === 'sand' ? SAND_TONE : SHINGLE_TONE;
}
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
export const groundTileTune = { rep: 2, insetF: 0.05, exact: true };
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
// (Les enveloppes par `kind` — ensureIsoTile / blitIsoTile — ont disparu le
// 2026-07-30 : depuis que la place résout SA matière par l'ère, le sol passe par
// la clé, et deux transferts sans consommateur ne valaient pas d'être gardés.)
// Matière de dallage de l'ÈRE, ou la générique tant qu'elle n'est pas là.
// ⚠ On exige les QUATRE variantes décodées avant de basculer. Basculer dès la
// première donnerait un sol MI-ÈRE MI-GÉNÉRIQUE le temps des autres décodages :
// blitIsoTileKey rend false sur une variante absente, et ces cellules-là
// resteraient en aplat au milieu du dallage. Chaque décodage invalide DOUCEMENT
// le bake (cf. ensureIsoTileKey), la bascule se fait donc d'elle-même à la
// recuisson suivante — rien à cadencer ici.
export function plazaEraTileKey(era) {
  const k = era && ('iso-plaza-' + era);
  const n = k && ISO_TILE_VARIANTS[k];
  if (!n) return ISO_TILE_KEYS.plaza;
  for (let v = 1; v <= n; v += 1) {
    const e = ensureIsoTileKey(k + '-' + v);
    if (!e || !e.ready) return ISO_TILE_KEYS.plaza;
  }
  return k;
}
// ── LE TROTTOIR EST PEINT EN PIXELS, JAMAIS AU VECTEUR ──────────────────────
// (Raph 2026-08-05 : « je ne veux plus de tracé au vecteur ».)
//
// LE PROBLÈME, dans les termes exacts où il se pose. Le sol est fait de TUILES
// blittées à `k = T·z/32` : un pixel d'art y occupe z pixels de canvas. Les
// couches du trottoir, elles, étaient des `fill()` de quads projetés — donc
// rastérisées à la résolution du CANVAS, avec un bord antialiasé d'UN pixel. À
// zoom 3, la bande était bordée d'un trait trois fois plus fin que le plus petit
// détail de l'art qui l'entoure. C'est ça, « lisse et pas pixel » : pas une
// affaire de couleur, une affaire de RÉSOLUTION.
//
// LA PARADE. On peint toute la passe trottoir dans un calque à l'échelle de
// l'ART (zoom 1 : une cellule y fait 64×32 px, la taille native d'une tuile),
// puis on agrandit ce calque ×z en NEAREST. Chaque pixel tracé devient un bloc
// de z pixels, exactement comme un pixel de tuile — bords en marches, aucun
// demi-ton. Bénéfice second : la matière du trottoir y est blittée à 1:1 exact
// (k = 64/64), donc sans rééchantillonnage du tout.
//
// L'ALIGNEMENT EST EXACT, et c'est ce qui rend la manœuvre sûre : dans le calque
// `sx = (u − u_cam) + wArt/2`, et on le repose en `ox + sx·z` avec
// `ox = cw/2 − wArt·z/2`, ce qui redonne `(u − u_cam)·z + cw/2` — la projection
// du bake, au bit près. Aucun décalage à compenser, aucune dérive au défilement.
//
// COÛT MESURÉ, en alternant pixel/vecteur d'une recuisson à l'autre (le seul
// A/B honnête ici, cf. les pièges de mesure du projet), bake de 346 cellules à
// zoom 3,24 : passe trottoir **0,7 ms en pixels contre 0,4 ms au vecteur**, sur
// ~10 ms de bake total — et le bake ne tourne qu'à la recuisson, pas par frame.
// Le calque fait cw/z × ch/z, soit ~1/z² de surface à rastériser : ce qu'on perd
// à composer, on le regagne à peindre.
let _walkLayer = null;
function walkLayerBegin(z) {
  const wArt = Math.ceil(CM.cw / z) + 2, hArt = Math.ceil(CM.ch / z) + 2;
  if (!_walkLayer || _walkLayer.w !== wArt || _walkLayer.h !== hArt) {
    const c = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(wArt, hArt) : document.createElement('canvas');
    c.width = wArt; c.height = hArt;
    const cx = c.getContext('2d');
    if (!cx) return null;
    _walkLayer = { c, ctx: cx, w: wArt, h: hArt };
  }
  const lay = _walkLayer;
  lay.ctx.setTransform(1, 0, 0, 1, 0, 0);
  lay.ctx.clearRect(0, 0, lay.w, lay.h);
  // Bascule du repère de projection : worldToScreen lit CM.cam.zoom et CM.cw/ch.
  lay.saved = { zoom: CM.cam.zoom, cw: CM.cw, ch: CM.ch };
  CM.cam.zoom = 1; CM.cw = lay.w; CM.ch = lay.h;
  return lay;
}
function walkLayerEnd(lay, ctx, z) {
  const s = lay.saved;
  CM.cam.zoom = s.zoom; CM.cw = s.cw; CM.ch = s.ch;
  const ox = s.cw / 2 - (lay.w * z) / 2, oy = s.ch / 2 - (lay.h * z) / 2;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lay.c, 0, 0, lay.w, lay.h, ox, oy, lay.w * z, lay.h * z);
  ctx.imageSmoothingEnabled = prev;
}
// (Une MATIÈRE DE TROTTOIR a vécu ici — table de tons par bande et résolution
//  de tuile dédiée, avec son art `walk-stone` / `walk-granite`. Retirée le
//  2026-08-05 en même temps que la bande : le sol de ville EST le trottoir, il
//  n'a donc pas de matière propre. Cf. le § LA MARCHE, ET RIEN QUE LA MARCHE,
//  dans la passe route.)
// Blit une tuile de sol sur la cellule dont le coin NORD projeté est (nx, ny).
// ⚠ FACE SEULE, MASQUÉE AU LOSANGE (e.face, cf. isoTileFace) : l'épaisseur du
// « thin tile » ne se contente pas de déborder sous la pointe sud, ses faces
// latérales pendent sous les arêtes SO/SE, donc DANS le rectangle 2:1 — le seul
// recadrage rectangulaire (1er correctif) laissait un liseré clair + un liseré
// sombre sur chaque cellule = quadrillage sur tout le sol.
// Un sol plat doit être une SURFACE continue, pas un empilement de dalles.
// Repli (pixels illisibles) : recadrage rectangulaire historique depuis e.img.
// Renvoie false si pas prête (l'appelant garde l'aplat).
function blitIsoTileKey(ctx, key, nx, ny, hw, mirror = false, h = 0, veil = null) {
  // HIVER : bascule vers la tuile enneigée si elle existe ET est décodée —
  // sinon on garde l'été pour cette recuisson (le décodage la rappellera).
  // (La GRÈVE n'en a pas, sauf `__beach.snow` — cf. ISO_TILE_WINTER_BEACH.)
  const wKey = CM.season === WINTER ? isoWinterTile(key) : null;
  if (wKey) {
    const we = ensureIsoTileKey(isoVariantKey(wKey, h));
    if (we && we.ready) key = wKey;
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
  // S7 — LE BLIT 1:1, QUAND LA GRILLE LE PERMET (docs/PLAN-RENDU-VILLE.md).
  //
  // Le `+1 px` historique est un anti-couture : à zoom fractionnaire le pas de
  // grille (hw en x, hh = hw/2 en y) ne tombe pas sur l'entier, deux losanges
  // voisins chacun arrondi laissent un liseré transparent, et on le recouvre en
  // débordant d'un pixel sur le voisin. Le prix était lourd et invisible : la
  // destination faisait 65×33 pour une source de 64×32 à z = 1, donc le nearest
  // DUPLIQUAIT une colonne et une rangée d'art sur CHAQUE cellule du sol. Tout le
  // reste du fichier promet un blit « pixel pour pixel » (cf. § tuiles natives) ;
  // ici il ne l'était nulle part.
  //
  // Depuis S11 le zoom est quantifié au 1/8, donc hw = 32z et hh = 16z sont
  // ENTIERS et les losanges se joignent exactement : plus de couture à couvrir.
  // On ne s'y fie pas pour autant — la molette `__zoomQuant(0)` rend le zoom
  // continu, et cam.zoom traverse des valeurs fractionnaires PENDANT le
  // glissement (une recuisson nette peut y tomber si le budget de geste
  // l'autorise). Le test porte donc sur la GÉOMÉTRIE COURANTE, pas sur un
  // réglage : `hw` entier et pair ⟺ hw et hh entiers ⟺ grille exacte. Le +1
  // revient tout seul dès qu'elle ne l'est plus.
  // ⚠ Le test porte sur les DEUX dimensions réellement demandées, pas seulement
  // sur hw : une tuile d'herbe à débord (`ov`) a srcH = faceH + ov, et sa hauteur
  // de destination reste fractionnaire à bas zoom même quand la grille est exacte
  // (hw = 4, ov = 3 → dh = 4,375). Elle retombe alors sur le +1, ce qui est le bon
  // choix : à k < 1 on sous-échantillonne de toute façon.
  const dwx = bb.w * k, dhx = srcH * k;
  const whole = (v) => Math.abs(v - Math.round(v)) < 1e-9;
  // `groundTileTune.exact = false` (molette `__groundTile({exact:false})`) rejoue le
  // +1 inconditionnel : c'est l'A/B du lot, et le seul moyen de revoir en une
  // seconde le pixel dupliqué que ce chemin supprime.
  const exact = groundTileTune.exact
    && Number.isInteger(hw) && hw % 2 === 0 && whole(dwx) && whole(dhx);
  const dw = exact ? Math.round(dwx) : Math.ceil(dwx) + 1;
  const dh = exact ? Math.round(dhx) : Math.ceil(dhx) + 1;
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
// Galets de rivage : tons MESURÉS sur les tuiles normalisées (imprimés par
// fetchGroundTiles.mjs). Servent d'aplat de repli le temps que le PNG décode, et
// de teinte au dézoom. `BEACH` est la molette de la plage : window.__beach.
const SHINGLE_TONE = [127, 130, 136];
const SHINGLE_TONE_WINTER = [174, 178, 183];
const SAND_TONE = [221, 195, 158];
export const BEACH = {
  on: true,
  // MATIÈRE du rivage. Raph a d'abord choisi les galets gris sur planche, puis
  // demandé le sable en les voyant en place (2026-07-30) — les deux matières
  // restent cuites, le basculement est un mot : `__beach.mat = 'shingle'`.
  mat: 'sand',
  // La grève prend-elle la neige en hiver ? NON depuis le 2026-07-30 (cf.
  // ISO_TILE_WINTER_BEACH pour le pourquoi). Porte les QUATRE couches d'un coup —
  // cellules bakées, bande de sable, rivage d'île, frange mouillée — parce qu'elles
  // se superposent au pixel près : n'en enneiger que certaines ferait lire la plage
  // en deux matières selon la couche, ce qui est pire que les deux choix francs.
  snow: false,
  // Largeur du rivage d'île, en TUILES depuis le bord de l'ellipse.
  //
  // ⚠ PAS un rayon normalisé : premier jet à 0,62 de rayon, et l'île y passait
  // presque entière aux galets. L'Aiguille fait rx 7,6 pour ry 2,4 — un rayon
  // constant donne une bande de 2,9 tuiles dans le sens du courant et de 0,9 en
  // travers, donc un plateau de gravier avec des mouchoirs d'herbe au milieu au
  // lieu d'une île herbue bordée de galets. La largeur doit être MÉTRIQUE, la
  // même partout, ce qui demande la distance au bord et pas le rayon.
  // ⚠ ET LA LARGEUR SE JUGE AU RAPPORT À L'ÎLE, PAS DANS L'ABSOLU : 1,3 tuile
  // paraissait modeste, mais l'Aiguille ne fait que 4,8 tuiles de LARGE (ry 2,4)
  // — le rivage en mangeait la moitié et se lisait comme une allée de gravier.
  // 0,75 donne un rebord d'une cellule, deux aux pointes du fuseau (la courbure y
  // fait grandir la distance au bord), ce qui est exactement le dessin d'une
  // langue de galets à la pointe d'une île de rivière.
  // Largeur du rivage d'île, en TUILES, mesurée depuis le bord de l'ellipse. C'est
  // un TRAIT le long de la courbe (cf. drawIsoIslandShore) et non des cellules :
  // sur un fuseau de 4,8 tuiles de large, la grille ne peut pas rendre un contour
  // régulier, quelle que soit la règle de classement.
  islandW: 0.8,
  // Bande de sable TEXTURÉE le long des berges du fleuve, côté terre, en tuiles.
  // Elle double les cellules bakées : celles-ci donnent la profondeur vers
  // l'intérieur, la bande donne le bord NET contre l'eau (les cellules, elles,
  // s'arrêtent en escalier). 0 la coupe.
  bankBand: 0.55,
  // ⛔ IL Y AVAIT ICI UN TIRAGE AU SORT SUR LA LARGEUR, RETIRÉ (Raph : « on veut un
  // joli contour identique »). Faire divaguer une lisière marche sur une grande
  // étendue — c'est ce que fait FRONTIER pour la limite ville↔campagne — mais sur
  // un anneau étroit ça ne fabrique pas un rivage irrégulier, ça fabrique des
  // TROUS. Ne pas le réintroduire pour les îles.
  // Rayon d'influence, en tuiles, autour d'un point de berge sans quai : le port
  // ne coupe la maçonnerie que sur 4 samples (≈ 4,5 tuiles), et sa propre emprise
  // en occupe l'essentiel — sans rayon, la grève faisait UNE cellule.
  bankR: 7,
  // Frange MOUILLÉE au ras de l'eau (couche vectorielle, cf. son bloc). Le ton
  // suit la matière : pour les galets c'est la 4e rangée du lot, mesurée à
  // [95,100,106] — des cailloux sombres et luisants ; pour le sable c'est le ton
  // sec assombri, parce que du sable humide est du sable, pas du gris.
  wet: 0.55, wetW: 5,
  wetTone: { sand: '156,132,100', shingle: '95,100,106' },
  wetWinter: '132,140,148',
};
if (typeof window !== 'undefined') window.__beach = BEACH;
// ⛔ IL Y AVAIT ICI DEUX MESURES DE DISTANCE AU BORD DE L'ÎLE, en tuiles, pour
// décider CELLULE PAR CELLULE si elle appartenait au rivage. Les deux sont
// retirées avec l'approche : le contour d'île est désormais TRACÉ le long de son
// ellipse (drawIsoIslandShore). Elles étaient justes — la seconde fermait
// effectivement l'anneau, et un test le prouvait — mais aucune règle par cellule
// ne peut donner une largeur RÉGULIÈRE sur un objet de 4,8 tuiles de large, et
// c'était la demande. Leurs tests partent avec elles : garder des gardes sur du
// code que plus rien n'appelle, c'est de la décoration.
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
// (sprite, saison). Renvoie null en été (sprite d'origine, coût nul) ou tant
// que l'image n'est pas décodée.
//
// ⚠ L'HIVER NE PASSE PLUS PAR LA TEINTE. Elle vaut rgba(178,186,190,0.34) en
// multiply, soit 10 % de valeur en moins : un feuillu lime restait un feuillu
// lime, posé sur un sol enneigé (Raph, 2026-07-31 : « il faut faire les arbres
// enneigés »). La neige est maintenant CUITE dans un sprite `-winter` dérivé du
// sprite d'été (scripts/snowTrees.mjs) — même doctrine que le sol d'hiver, et
// même repli : tant que le PNG n'est pas décodé (ou absent, cf. le .exe hors
// ligne), on retombe sur la teinte, jamais sur du vide.
const _seasonTrees = new Map();
function seasonTree(art, name) {
  const s = CM.season | 0;
  if (s === WINTER) {
    const wa = isoArt(name + '-winter');
    if (wa.ready && wa.img) return wa.img;
  }
  const tint = seasonCanopyTint(s);
  if (!tint || !art.ready || !art.img) return null;
  const key = name + ':' + s;
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
/* ── FRONT DE RUE : le bâtiment cesse de flotter au milieu de son lot (lot L3) ─
 * docs/PLAN-TISSU-URBAIN.md. Un bâtiment est ancré au coin SUD de son emprise et
 * dessiné centré dessus : il flotte au milieu de sa cellule, entouré de sol sur
 * ses quatre côtés. Il n'y a donc aucun MUR DE RUE, et c'est lui qui fait qu'une
 * ville se lit comme une ville : une rue est un couloir entre deux façades, pas
 * une clairière entre deux objets.
 *
 * On pousse donc chaque bâtiment vers LA rue qu'il dessert. Cette face est déjà
 * calculée ailleurs — la passe des allées de seuil la cherche pour poser son
 * trait de la porte à la chaussée — mais elle y était enfouie dans la boucle de
 * dessin. On l'extrait ici : le sprite et son seuil DOIVENT désigner la même
 * façade, sinon le trait sortirait d'un mur aveugle.
 *
 * Priorité S puis E puis O puis N : la porte des sprites regarde la caméra, donc
 * à choisir on ouvre sur la rue que le joueur voit. Ni pont (le seuil plongerait
 * dans l'eau) ni place (déjà dallée). Mémoïsé sur la tuile — les tuiles sont
 * reconstruites à chaque recompute, le cache se périme donc tout seul.
 * ------------------------------------------------------------------------- */
// push 0.14 → 0.19 (Raph, 2026-07-30, sur planche des trois doses). 0,19 n'est pas
// un chiffre rond : c'est TOUTE la place disponible devant une rue ordinaire
// (0,5 − demi-chaussée 0,25 − gap 0,06). Au-delà, le rabotage rendrait la même
// valeur et monter le réglage ne ferait plus rien. Devant une avenue ou un
// boulevard il rabote à 0,11 et 0,08, automatiquement.
export const FRONT = { on: true, push: 0.19, gap: 0.06 };
const FRONT_DIRS = [[0, 1], [1, 0], [-1, 0], [0, -1]];   // S, E, O, N
export function isoBuildingFront(t, roadMap) {
  if (t._front !== undefined) return t._front;
  let out = null;
  if (roadMap) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (const [dx, dy] of FRONT_DIRS) {
      const hits = [];
      for (let ax = 0; ax < sx; ax += 1) {
        for (let ay = 0; ay < sy; ay += 1) {
          const hx = t.gx + ax, hy = t.gy + ay;
          const rc = roadMap.get((hx + dx) + ',' + (hy + dy));
          if (!rc || rc.roadSurface === 'bridge' || rc.rank === 'plaza') continue;
          hits.push([hx, hy, rc]);
        }
      }
      if (!hits.length) continue;
      // Le MILIEU de la façade : une halle de trois cellules a sa porte centrée,
      // pas collée au coin.
      const [hx, hy, rc] = hits[hits.length >> 1];
      out = { dx, dy, hx, hy, rank: rc.rank };
      break;
    }
  }
  t._front = out;
  return out;
}
// Décalage du sprite vers sa façade, en fraction de tuile.
// ⚠ Le poussé est BORNÉ par la largeur de la chaussée d'en face : l'ancre du
// sprite est son point le plus au sud, et la chaussée d'une cellule voisine
// commence à `0,5 − demi-largeur` de son centre. Un poussé fixe qui va bien
// contre une rue (demi-largeur 0,25) plante le bâtiment DANS un boulevard
// (0,36). La borne se calcule, elle ne se règle pas à l'œil.
export function isoFrontOffset(t, roadMap, cfg = FRONT) {
  if (!cfg.on || !cfg.push) return null;
  const f = isoBuildingFront(t, roadMap);
  if (!f) return null;
  const room = 0.5 - isoRoadHalfW(f.rank) - cfg.gap;
  const push = Math.max(0, Math.min(cfg.push, room));
  if (push <= 0) return null;
  return { ox: f.dx * push, oy: f.dy * push };
}
if (typeof window !== 'undefined') {
  // Molette front de rue : __front(false) recentre les bâtiments comme avant ;
  // __front({push,gap}) règle le poussé (push = fraction de tuile vers la rue,
  // gap = marge minimale gardée jusqu'à la chaussée).
  window.__front = (arg) => {
    if (arg === false) FRONT.on = false;
    else if (arg && typeof arg === 'object') { FRONT.on = true; Object.assign(FRONT, arg); }
    else FRONT.on = true;
    if (CM.layout && CM.layout.tiles) for (const t of CM.layout.tiles) delete t._front;
    CM._isoGroundBake = null;   // les allées de seuil vivent dans le bake
    return { ...FRONT };
  };
}
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
// Cette cellule a-t-elle une FAÇADE à desservir ? (les 8 voisines, diagonales
// comprises — cf. le § de la partition du trottoir.) C'est ce qui distingue une
// RUE d'une simple voie de passage : sans bâtiment autour, pas de trottoir, donc
// ni marche, ni bordure, ni mobilier. Mémoïsé par layout comme `builtCells`.
const BUILT_NEAR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export function builtNear(L, gx, gy) {
  const b = builtCells(L);
  if (!b.size) return true;            // pas de bâti connu (tests, plan vide) : on ne prive de rien
  let m = L._builtNear8;
  if (!m) { m = new Map(); L._builtNear8 = m; }
  const k = gx + ',' + gy;
  const hit = m.get(k);
  if (hit !== undefined) return hit;
  let near = false;
  for (const [dx, dy] of BUILT_NEAR8) {
    if (b.has((gx + dx) + ',' + (gy + dy))) { near = true; break; }
  }
  m.set(k, near);
  return near;
}
/* ── COUR ET FRICHE : le lot vide cesse d'être minéral (lot L2) ───────────────
 * docs/PLAN-TISSU-URBAIN.md. Le grief de Raph était « des gros micmacs de
 * routes » ; la mesure (tissuMetrics, lot L0) dit autre chose. Sur une ville de
 * 1 528 bâtiments, band 4 : voirie 30,8 %, bâti 22,0 %, **vide 47,2 %**. Les
 * routes ne sont pas trop nombreuses — c'est le VIDE qui est la plus grande
 * surface de la ville, et comme `kindAt` ne connaissait que urban/grass, ce vide
 * portait exactement la matière minérale d'une cellule bâtie. La ville se lit
 * donc comme une nappe de pierre où les rues ne sont qu'un motif.
 *
 * Le vide n'est pas d'un seul tenant, et c'est ce qui commande la règle. Mesuré
 * par distance au bâti le plus proche : 29 % à une cellule (l'arrière-cour d'un
 * bâtiment), 18 % à deux ou trois, **43 % à cinq et plus** (des étendues que la
 * ville n'a jamais atteintes — `urbanSet` vient d'un RAYON dérivé des compteurs,
 * pas de ce qui est bâti). Une seule matière pour les deux serait un contresens :
 *   d ≤ near  → `urban`  le sol pavé du bâti et de son devant de parcelle
 *   d ≤ far   → `dirt`   la cour de terre battue, l'arrière du lot
 *   au-delà   → `grass`  la friche : la ville n'est pas arrivée là
 * On obtient le dégradé qu'une vraie ville a toujours, et la cité gagne enfin un
 * BORD au lieu de s'étaler en disque minéral jusqu'à la limite des compteurs.
 *
 * ⚠ Aucun de ces deux kinds n'est nouveau : `dirt` et `grass` ont déjà toute
 * leur plomberie (tuile, texAlpha, frange d'herbe, voile). On ne change QUE la
 * cellule à qui on les donne. C'est ce qui rend le lot petit.
 * Réglage live : `__cour(false)` rend la ville minérale d'avant, `__cour({near,
 * far, sidewalk})` déplace les contours.
 * -------------------------------------------------------------------------- */
/* ── v2, 2026-07-30 : QUARTIERS, pas confetti ────────────────────────────────
 * Retour de Raph sur une mégalopole : « on n'a plus de quartier, et le retour des
 * multiples petits carrés de sol entre les routes ». Mesuré sur la ville qui a
 * produit ce retour : **364 taches de cour, médiane 1 cellule, 64 % d'une ou deux
 * cellules**.
 *
 * ⚠ LA CAUSE N'EST PAS CELLE QU'ON CROIT, et je m'y suis trompé une fois avant
 * d'écrire ceci. Ce n'est pas que le seuil « bavait » d'une cellule à l'autre :
 * c'est que **le réseau viaire découpe déjà le sol en petits blocs**. Entre deux
 * rues il n'y a qu'une à quatre cellules. Dès lors, toute matière qui change d'un
 * bloc au bloc voisin se lit comme un carré isolé, même si le champ qui la décide
 * est parfaitement lisse à l'échelle de la cellule. Le confetti est un effet de la
 * TRAME DES RUES, pas du bruit du critère.
 *
 * Corollaire, et c'est lui qui dicte la solution : la matière doit varier À UNE
 * ÉCHELLE PLUS GRANDE QUE LE BLOC. Un critère local — distance au bâti, fermeture
 * morphologique — ne peut pas y arriver, parce qu'il change justement à l'échelle
 * du bloc. (Essayé : une fermeture de rayon 2 sur des bâtiments PONCTUELS les
 * restitue à l'identique, elle ne soude rien. La dilatation ajoute, l'érosion
 * reprend exactement autant.)
 *
 * v2 décide donc sur la DENSITÉ BÂTIE LISSÉE : pour chaque cellule, la part de
 * sol bâti dans un carré de rayon `scale`. Un champ moyenné sur 6 cellules varie
 * lentement, donc deux blocs voisins reçoivent presque toujours la même matière,
 * et les frontières deviennent de grandes courbes — des QUARTIERS. Seuils :
 * au-dessus de `coreDens` c'est le quartier bâti (pavé), au-dessus de `ringDens`
 * son faubourg (terre), en dessous la friche.
 *
 * Une passe finale ABSORBE toute tache plus petite que `minPatch`. Ce n'est pas
 * une ceinture de plus : c'est la seule formulation qui rende le grief de Raph
 * VÉRIFIABLE (« aucune tache en dessous de N »), là où « ça fait moins de
 * confetti » ne se teste pas.
 * -------------------------------------------------------------------------- */
// Les seuils sont calés sur la densité MESURÉE des villes du jeu : une mégalopole
// tourne autour de 8 à 11 % de sol bâti (2 242 emprises sur 21 024 cellules pour
// la dense, 1 713 pour la clairsemée). `coreDens` doit donc mordre un peu en
// dessous de cette moyenne, sinon les bords d'un pâté pourtant dense — dont la
// fenêtre de lissage déborde sur le vide — retomberaient en cour.
export const COUR = { on: true, scale: 6, coreDens: 0.07, ringDens: 0.02, minPatch: 10, sidewalk: true };
const ORTHO4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/**
 * Matière de chaque cellule de sol de ville : `urban` (le quartier), `dirt` (sa
 * couronne de cour), `grass` (la friche). Pure et exportée — c'est elle qui
 * décide de l'aspect de la moitié de la ville, et la garde la mesure en TACHES.
 */
export function courField(urbanSet, builtSet, cfg = COUR) {
  const kind = new Map();
  if (!cfg.on) { for (const k of urbanSet) kind.set(k, 'urban'); return kind; }
  // ── 1. DENSITÉ BÂTIE LISSÉE, par table de sommes préfixées ────────────────
  // Part de sol bâti dans le carré de rayon `scale` autour de chaque cellule.
  // La table de sommes rend le calcul indépendant de `scale` : quatre lectures
  // par cellule, quel que soit le rayon. Sans elle, un rayon 6 coûterait 169
  // lectures par cellule sur 20 000 cellules à chaque recompute.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of urbanSet) {
    const c = k.indexOf(',');
    const gx = +k.slice(0, c), gy = +k.slice(c + 1);
    if (gx < x0) x0 = gx; if (gx > x1) x1 = gx;
    if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
  }
  if (x1 < x0) return kind;
  const scale = Math.max(1, cfg.scale | 0);
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const sum = new Int32Array((W + 1) * (H + 1));
  for (const k of builtSet) {
    const c = k.indexOf(',');
    const gx = +k.slice(0, c) - x0, gy = +k.slice(c + 1) - y0;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
    sum[(gy + 1) * (W + 1) + gx + 1] = 1;
  }
  for (let y = 1; y <= H; y += 1) {
    for (let x = 1; x <= W; x += 1) {
      sum[y * (W + 1) + x] += sum[(y - 1) * (W + 1) + x] + sum[y * (W + 1) + x - 1] - sum[(y - 1) * (W + 1) + x - 1];
    }
  }
  const dens = (gx, gy) => {
    const ax = Math.max(0, gx - x0 - scale), ay = Math.max(0, gy - y0 - scale);
    const bx = Math.min(W - 1, gx - x0 + scale), by = Math.min(H - 1, gy - y0 + scale);
    if (bx < ax || by < ay) return 0;
    const n = sum[(by + 1) * (W + 1) + bx + 1] - sum[ay * (W + 1) + bx + 1]
      - sum[(by + 1) * (W + 1) + ax] + sum[ay * (W + 1) + ax];
    return n / ((bx - ax + 1) * (by - ay + 1));
  };
  // ── 2. SEUILS. Le bâti reste toujours pavé : un quartier d'une seule maison
  //    au milieu des champs garde son sol, on ne repeint pas sous ses murs.
  for (const k of urbanSet) {
    if (builtSet.has(k)) { kind.set(k, 'urban'); continue; }
    const c = k.indexOf(',');
    const d = dens(+k.slice(0, c), +k.slice(c + 1));
    kind.set(k, d >= cfg.coreDens ? 'urban' : d >= cfg.ringDens ? 'dirt' : 'grass');
  }
  // ── 3. ABSORPTION DES MIETTES. Un champ lissé laisse quand même des îlots là
  //    où il frôle un seuil ; ce sont EUX que Raph voit. Toute tache sous
  //    `minPatch` rejoint la matière qui la borde le plus. Le bâti n'est jamais
  //    absorbé.
  const minPatch = Math.max(1, cfg.minPatch | 0);
  if (minPatch > 1) {
    const seen = new Set();
    for (const start of urbanSet) {
      if (seen.has(start)) continue;
      const kd = kind.get(start);
      const comp = [start];
      seen.add(start);
      const bord = new Map();
      for (let i = 0; i < comp.length; i += 1) {
        const c = comp[i].indexOf(',');
        const gx = +comp[i].slice(0, c), gy = +comp[i].slice(c + 1);
        for (const [dx, dy] of ORTHO4) {
          const nk = (gx + dx) + ',' + (gy + dy);
          if (!urbanSet.has(nk)) continue;
          const nkd = kind.get(nk);
          if (nkd === kd) { if (!seen.has(nk)) { seen.add(nk); comp.push(nk); } }
          else bord.set(nkd, (bord.get(nkd) || 0) + 1);
        }
      }
      if (comp.length >= minPatch || !bord.size) continue;
      // …sauf une tache qui porte du bâti : un quartier d'une seule maison reste
      // un quartier, on ne va pas repeindre le sol sous ses murs.
      if (comp.some((k) => builtSet.has(k))) continue;
      let best = null, bestN = -1;
      for (const [nkd, n] of bord) if (n > bestN) { best = nkd; bestN = n; }
      for (const k of comp) kind.set(k, best);
    }
  }
  return kind;
}
// Ton moyen MESURÉ de `iso-dirt` : l'aplat de repli d'une cour doit rester dans
// la famille de la tuile qui le recouvre, sinon le sol saute au décodage du PNG.
// (Avant ce lot, `dirt` retombait sur le ton URBAIN — le kind n'était plus
// produit, personne ne voyait le décalage.)
const DIRT_TONE = [169, 125, 88];
// Champ de matières du sol de ville, mémoïsé sur le layout (les tuiles sont
// reconstruites à chaque recompute, le cache se périme donc tout seul).
function courOf(L) {
  if (!L._courField) L._courField = courField(L.urbanSet || new Set(), builtCells(L));
  return L._courField;
}
if (typeof window !== 'undefined') {
  // Molette cour/friche : __cour(false) rend la nappe minérale d'avant le lot ;
  // __cour({near,ring,minPatch,sidewalk}) règle la morphologie — near = rayon de
  // fermeture (soude les bâtiments d'un même pâté et bouche les trous plus
  // petits que 2·near), ring = largeur de la couronne de cour, minPatch = taille
  // en dessous de laquelle une tache est absorbée. Rebake immédiat.
  window.__cour = (arg) => {
    if (arg === false) COUR.on = false;
    else if (arg && typeof arg === 'object') { COUR.on = true; Object.assign(COUR, arg); }
    else COUR.on = true;
    if (CM.layout) CM.layout._courField = null;
    CM._isoGroundBake = null;
    return { ...COUR };
  };
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
// S2 — DOSE PAR MATIÈRE (docs/PLAN-RENDU-VILLE.md). `tileA` ne s'appliquait qu'à la
// TERRE BATTUE : partout ailleurs la tuile partait à alpha 1, sans qu'aucun réglage
// ne puisse la calmer. Or le grain mesuré des matières de sol est très inégal —
// écart moyen de luminance entre pixels VOISINS, sur les PNG livrés :
//
//   ground-cobble 18,4   ·   iso-grass 16,7   ·   ground-flagstone 6,4
//   iso-dirt 5,8   ·   ground-concrete 4,6   ·   ground-earth 4,4   ·   ground-tech 2,8
//
// Le pavé est 4 à 6 fois plus bruyant que toutes les autres pierres, et c'est la
// matière des bandes 2 et 3 — celles de la capture « brouillon » de Raph.
//
// ⚠ SEUL LE PAVÉ EST DOSÉ, et c'est un ARBITRAGE de Raph (2026-08-05), pas un
// réglage libre : il avait lui-même monté `tileA` de 0,12 à 1 le 2026-07-28 pour que
// les variantes régénérées « s'affichent pleines ». La planche des trois doses
// (`.preview-shots/s2-planche-pave.png`, 1 / 0,6 / 0,35) a tranché sur **0,6** :
// le pavé garde sa matière et cesse de grésiller.
//
//   grain moyen de la frame (écart-type local 8×8) : 40,0 → 36,9 (médiane 38,5 → 33,7)
//   18,0 % des pixels changent, caméra identique — et le masque de différence
//   montre les silhouettes de bâtiments noires au pixel près : SEUL le sol bouge.
//
// ⚠ Doser ne laisse aucun trou parce que l'aplat de ton est peint DESSOUS : pour
// `urban`, `texAlpha` vaut 0, donc la branche de repli peint le losange plein avant
// la tuile. Si ce 0 disparaissait, la dose montrerait le fond du canvas — c'est
// pour ça que la garde le vérifie dans le SOURCE.
//
// Les autres matières restent à 1 : leur grain mesuré est 4 à 6 fois plus bas
// (flagstone 6,4 · concrete 4,6 · earth 4,4 · tech 2,8 contre 18,4 pour le pavé).
// Molette : `__groundMat({ tileAType: { cobble: 1 } })` rejoue l'ancien.
export const URBAN_TILE_A = { earth: null, cobble: 0.6, flagstone: 1, concrete: 1, tech: 1 };
// `null` = suit `tileA` (la terre battue garde son réglage historique partagé).
const urbanTileAlpha = (type) => {
  const v = URBAN_TILE_A[type];
  return v == null ? URBAN_DETAIL.tileA : v;
};
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
    else if (arg && typeof arg === 'object') {
      URBAN_DETAIL.on = true;
      // S2 : `tileAType` va dans SA table, pas dans URBAN_DETAIL — sinon la clé
      // resterait inerte et la molette mentirait en silence.
      const { tileAType, ...rest } = arg;
      if (tileAType && typeof tileAType === 'object') Object.assign(URBAN_TILE_A, tileAType);
      Object.assign(URBAN_DETAIL, rest);
    } else URBAN_DETAIL.on = true;
    CM._isoGroundBake = null;
    return { ...URBAN_DETAIL, tileAType: { ...URBAN_TILE_A } };
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
  // TOUTE la voirie (ourlet, épaulement, trottoir, caniveau, rubans, frange,
  // allées de seuil) est peinte dans le calque à l'échelle de l'ART puis agrandie
  // en NEAREST : plus un seul bord à la résolution de l'écran. false = ancien
  // tracé vectoriel, pour l'A/B.
  pixel: true,
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
// ── TROTTOIRS ISO — LA MARCHE, PAS UNE BANDE ─────────────────────────────────
//历 Historique court, parce qu'il explique la forme actuelle : ce trottoir a
// d'abord été une BANDE construite (bordure claire, dalles au ton de l'ère,
// joints transversaux, liseré de rive), puis une bande TEXTURÉE par un art
// dédié. Raph a tranché autrement le 2026-08-05 : « techniquement il n'y a pas
// de sol mais trottoir et maison, donc pas de sens que le trottoir ait une
// apparence différente du sol. Il faut effectivement la marche mais après bam,
// du sol ». LE SOL DE VILLE *EST* LE TROTTOIR — il n'y a donc rien à peindre
// entre le caniveau et les maisons, seulement une MARCHE à la limite de la rue.
//
// Ce qui reste ici sert à trois choses, et trois seulement :
//   • la GÉOMÉTRIE de rue publiée aux agents et au mobilier (`w`, `curb`) — où
//     marchent les piétons, où se posent bancs et bacs ;
//   • la MARCHE côté rue (`step*`) ;
//   • la continuité du trottoir devant les venelles (`alleyThrough`).
// Les routes de campagne (hors tissu urbain) gardent épaulement + ourlet.
// Réglage live : __sidewalkIso(false | { minBand, w, curb, alleyThrough,
// stepA, stepLight, stepShade }).
const SIDEWALK_ISO = {
  on: true, minBand: 2,
  alleyThrough: true,   // le trottoir passe DEVANT l'entrée des venelles (cf. § plus bas)
  w: 0.22,        // largeur de la bande de marche, depuis la dalle : ne peint plus rien,
                  // mais publie aux agents où marcher et où poser le mobilier
  curb: 0.03,     // recul du nez de bordure au-delà du caniveau
  // LA MARCHE (cf. § dans la passe route) : tranche sombre + nez éclairé, sur le
  // SEUL bord dont la face est tournée vers la caméra. stepA 0 = pas de marche,
  // stepH = hauteur de la tranche en pixels d'art.
  stepA: 0.5, stepH: 2, stepLight: [255, 252, 244], stepShade: [38, 30, 20],
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
  // Résolu UNE FOIS par recuisson : l'ère est celle de la bande, elle ne change
  // pas d'une cellule à l'autre. Résoudre par cellule ferait 4 lectures de cache
  // sur chaque cellule de place pour un verdict identique.
  const plazaKey = plazaEraTileKey(plazaEra);
  const keyOfKind = (k) => (k === 'plaza' ? plazaKey : ISO_TILE_KEYS[k]);
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
  const courK = courOf(L);      // quartier / cour / friche par cellule (cf. COUR)
  const frontierFlips = (gx, gy, isUrban) => frontierFlip(gx, gy, isUrban, urbanLogical, built);
  // ── PLAGE DES BERGES DU FLEUVE (Raph, 2026-07-30 : « il faut générer une
  // plage ») ──────────────────────────────────────────────────────────────────
  // Elle va là où la maçonnerie du quai s'arrête : l'emprise du port (que
  // `ensureQuayGate` coupe exprès), les passages trop étroits pour un mur, les deux
  // extrémités du fleuve. Le pourtour des ÎLES, lui, est TRACÉ (drawIsoIslandShore)
  // et non baké : voir son en-tête, la grille est trop grossière à cette taille.
  //
  // ⚠ POURQUOI UNE MATIÈRE BAKÉE PAR CELLULE SUR LES BERGES. Ce projet a déjà
  // rejeté trois fois une nappe lisse posée sur du pixel art (le grain d'eau, les
  // vaguelettes, les filets de courant) : sur une large étendue, une plage doit
  // être de la MATIÈRE avec du grain, pas un aplat. Le prix est que la cellule est
  // alignée sur la grille, donc le bord EXTÉRIEUR de la plage est en escalier.
  // Ça passe ici, contrairement à la jonction herbe↔ville (7 refus) : le bord
  // INTÉRIEUR, au ras de l'eau, est recouvert par le ruban du fleuve — l'escalier
  // ne touche jamais la ligne d'eau — et un bord sable↔herbe dentelé se lit comme
  // un rivage irrégulier, là où un escalier eau↔terre se lit comme un bug.
  // ⚠ Le gate doit être FRAIS ici : le sol est baké AVANT le fleuve dans la frame,
  // donc personne ne l'a encore calculé au premier passage. Idempotent et caché
  // par layout, l'appel ne coûte rien les fois suivantes.
  ensureQuayGate();
  const beachIsles = (L.river && L.river.islands) || null;
  // ÎLES : toute cellule que l'ellipse touche. Les 4 coins et le centre sont
  // testés, donc les cellules du bord entrent aussi — l'île est pleine, sans trou.
  const beachIslandAt = (gx, gy) => {
    if (!BEACH.on || !beachIsles || !beachIsles.length) return false;
    for (const il of beachIsles) {
      const rx = Math.max(0.001, il.rx), ry = Math.max(0.001, il.ry);
      for (const [px, py] of [[gx, gy], [gx + 1, gy], [gx, gy + 1], [gx + 1, gy + 1], [gx + 0.5, gy + 0.5]]) {
        const dx = px - il.x, dy = py - il.y;
        const al = dx * il.tx + dy * il.ty, cr = -dx * il.ty + dy * il.tx;
        if (Math.hypot(al / rx, cr / ry) <= 1) return true;
      }
    }
    return false;
  };
  const beachBanks = (L.river && L.river.banks) || null;
  // ⚠ LE PORT EST EXEMPTÉ DE L'EXCLUSION DES CELLULES BÂTIES. Retour Raph : « il y
  // a une bande de gazon au port qui coupe la plage en 2 ». Mesuré : sur les 72
  // cellules de berge concernées, 4 étaient écartées comme bâties — et les 4
  // appartiennent au port. Son emprise (4×5) mord la berge en plein milieu de la
  // grève et y laissait l'herbe. Or un port de rivière est un PONTON posé sur le
  // rivage : du sable dessous est juste, et son sprite recouvre les cellules de
  // toute façon. Les autres bâtiments gardent l'exclusion — pas de sable sous une
  // maison — et les ROUTES aussi (une rampe vers le quai reste une rampe).
  const beachPortCells = new Set();
  for (const t of (L.tiles || [])) {
    if (t.buildingId !== 'river_ports') continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) beachPortCells.add((t.gx + ax) + ',' + (t.gy + ay));
  }
  const beachPts = (CM.quayGate && CM.quayGate.gapPts) || null;
  // BERGES : une cellule de `river.banks` — donc qui TOUCHE l'eau par construction,
  // impossible de dériver vers l'intérieur des terres — et proche d'un point où le
  // quai ne trace pas (cf. gapPts dans renderWorld pour les deux formes ratées qui
  // ont mené à celle-ci). Le rayon fait de la coupe de 4 samples du port une
  // grève d'une douzaine de tuiles, assez pour se lire, et fond la plage dans la
  // maçonnerie au lieu de l'arrêter net contre elle.
  const beachBankAt = (gx, gy, key) => {
    if (!BEACH.on || !beachBanks || !beachPts || !beachPts.length) return false;
    if (!beachBanks.has(key)) return false;
    const cx = gx + 0.5, cy = gy + 0.5, r2 = BEACH.bankR * BEACH.bankR;
    for (const p of beachPts) {
      const dx = cx - p.x, dy = cy - p.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  };
  // ÎLES : anneau extérieur de l'ellipse, en coordonnées de l'île (`tx,ty` = le sens
  // du courant). Test ANALYTIQUE, donc exact quelle que soit l'orientation — aucun
  // jeu de cellules à maintenir pour l'île.
  //
  // ⚠ TESTÉ AVANT LE SOL DE VILLE, et c'est indispensable : les cellules de l'île
  // sont dans `urbanSet` (c'est l'emprise de la merveille qui l'a fait naître), donc
  // la branche « sol de ville » les prenait toutes et la plage ne sortait JAMAIS.
  // Mesuré sur l'Aiguille : 60 cellules urbaines sur les 89 de l'ellipse, 0 berge
  // classée. Le parvis d'une merveille (kind 'wonder') garde en revanche la
  // priorité, et les routes aussi — un pont qui traverse l'île reste un pont.
  // ⚠⚠ ON TESTE LA CELLULE ENTIÈRE, PAS SON CENTRE — et sans tirage au sort.
  // Retour Raph : « le contour n'est pas bien fait, on veut un joli contour
  // identique ». La v1 testait le seul centre de la cellule et faisait divaguer la
  // largeur au hasard : sur un fuseau de 4,8 tuiles de large, la grille est trop
  // grossière pour ça et le rivage sortait en POINTILLÉ — des bouts de sable
  // séparés par des bouts d'herbe. Le hasard qui donne une jolie lisière sur une
  // grande étendue (cf. FRONTIER) casse un anneau étroit.
  //
  // On échantillonne donc les 4 coins ET le centre, on garde la distance MINIMALE,
  // et un point hors de l'ellipse compte pour 0 : toute cellule que le bord
  // TRAVERSE entre dans l'anneau. L'anneau est alors FERMÉ par construction —
  // aucune cellule frontière ne peut être sautée — et d'épaisseur régulière.
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
    // ── L'ÎLE EST ENTIÈREMENT EN SABLE ────────────────────────────────────────
    // Demande de Raph (2026-07-30, après l'anneau) : « fais toute l'île en sable ».
    // Toute cellule que l'ellipse touche, pas seulement son pourtour — le test
    // porte sur les 4 coins et le centre, donc les cellules du bord entrent aussi
    // et il ne reste aucun trou. Le contour TRACÉ (drawIsoIslandShore) garde son
    // rôle : lui seul suit la courbe au pixel et lisse l'escalier des cellules
    // sur la ligne d'eau. Priorité AVANT le sol de ville, sans quoi l'emprise de
    // la merveille reprendrait l'île (mesuré : 60 cellules urbaines sur 89).
    else if (!isWater && !isRoad && (!built.has(key) || beachPortCells.has(key))
      && beachIslandAt(gx, gy)) k = BEACH.mat;
    // ── PLAGE SUR LES BERGES DU FLEUVE, AVANT LE SOL DE VILLE ─────────────────
    // ⚠ Cette priorité est le cœur du correctif, et elle a coûté deux essais.
    // Les cellules concernées sont presque toutes dans `urbanSet` : celles de
    // l'ÎLE parce que c'est l'emprise de la merveille qui l'a fait naître (mesuré
    // 60 sur 89), celles du PORT parce que le port et son tissu sont de la ville
    // (mesuré 13 des 59 cellules du trou de quai). Testée après « sol de ville »,
    // la plage ne sortait donc JAMAIS là où Raph la demandait — seulement aux
    // extrémités du fleuve, hors carte. Ce qui garde la priorité : le parvis d'une
    // merveille, les ROUTES (un pont qui traverse l'île reste un pont) et toute
    // cellule BÂTIE — sauf le PORT lui-même, cf. beachPortCells : son emprise
    // mordait la grève en plein milieu et y laissait une bande d'herbe.
    else if (!isWater && !isRoad && (!built.has(key) || beachPortCells.has(key))
      && beachBankAt(gx, gy, key)) k = BEACH.mat;
    // Routes HORS tissu urbain : fond d'HERBE depuis le 2026-07-20 (retour Raph :
    // le fond de cellule 'dirt' — aplat terre + tuile de mottes — dépassait du
    // ruban en « pavé de terre » cranté à la jonction herbe↔sol). Le chemin se
    // lit par sa dalle + ourlet/épaulement CONTINUS ; le kind 'dirt' n'est plus
    // produit mais sa plomberie (texAlpha/fringe) reste, knob de retour facile.
    else if (!isWater && L.urbanSet && L.urbanSet.has(key)) {
      // Sol de ville : pavé près du bâti, cour de terre plus loin, friche au-delà
      // (cf. COUR — c'est ici que la moitié vide de la ville cesse d'être minérale).
      k = courK.get(key) || 'urban';
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
    // Depuis le lot COUR, la limite ville↔campagne n'est plus `urban`↔`grass`
    // mais `dirt`↔`grass` : la friche s'intercale. Faire divaguer l'ANCIENNE
    // couture ne ferait plus rien (les deux matières ne se touchent presque
    // jamais) — c'est le bord de la cour qui doit serpenter, et une cellule
    // reprise à l'herbe revient en TERRE, pas en pavé.
    if (FRONTIER.on && !isRoad && !isWater && (k === 'urban' || k === 'dirt' || k === 'grass')) {
      const cityish = k !== 'grass';
      if (frontierFlips(gx, gy, cityish)) k = cityish ? 'grass' : (COUR.on ? 'dirt' : 'urban');
    }
    // Diagnostic opt-in (globalThis.__beachStats = true) : combien de cellules de
    // chaque matière le bake a classées. Éteint, coût nul (un test de drapeau).
    if (globalThis.__beachStats) {
      const s = globalThis.__beachStatsLast || (globalThis.__beachStatsLast = {});
      s[k] = (s[k] || 0) + 1;
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
      const tone = kind === 'plaza' ? (PLAZA_ERA_TONE[plazaEra] || PLAZA) : kind === 'wonder' ? WONDER_GROUND.tone
        : kind === 'grass' ? SEASON_GRASS : kind === 'dirt' ? DIRT_TONE
          : kind === 'shingle' ? beachTone('shingle')
            : kind === 'sand' ? beachTone('sand') : urb;
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
      const tile = (kind && !HARD) ? ensureIsoTileKey(keyOfKind(kind)) : null;
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
        blitIsoTileKey(ctx, keyOfKind(kind), p.x, p.y, hw, mir, cellH);
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
          // S2 : la dose vaut pour TOUTES les matières, plus seulement la terre.
          // À 1 (défaut de tous les types sauf terre) on repasse à l'identique
          // par le chemin d'origine — aucun globalAlpha posé, aucun coût.
          const ta = urbanTileAlpha(mat.type);
          const jit = mat.type === 'earth' && URBAN_DETAIL.tileJit
            ? smoothNoise(gx, gy, 4, 'peb') * URBAN_DETAIL.tileJit : 0;
          if (ta < 1 || jit) {
            // tileJit reste un knob : s'il est ≠ 0, la modulation repasse par le
            // bruit LISSÉ (voisines quasi égales → jamais de damier par cellule).
            ctx.globalAlpha = Math.min(1, ta + jit);
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
  // `md` = masque de TRACÉ, posé plus bas quand une rue à trottoir refuse de
  // tendre un bras à une venelle (cf. « le trottoir passe devant l'entrée des
  // venelles »). Null partout ailleurs → le masque logique de la cellule.
  const maskOf = (r2) => (r2.md != null ? r2.md : (r2.cell ? (r2.cell.mask | 0) : 0));
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
  // `c` : contexte de destination — la passe TROTTOIR peint dans un calque à la
  // résolution de l'art, pas dans le bake (cf. § LE TROTTOIR EST PEINT EN PIXELS).
  const addRunQuads = (runs, extra, c = ctx) => {
    for (const s of runs.h) {
      const W = T * s.w + extra;
      const cy2 = (s.gy + 0.5) * T;
      pathWorldQuad(c, s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W, cy2 - W,
        s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W, cy2 + W);
    }
    for (const s of runs.v) {
      const W = T * s.w + extra;
      const cx2 = (s.gx + 0.5) * T;
      pathWorldQuad(c, cx2 - W, s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W,
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
    // …et le trottoir s'arrête où la ville s'arrête. Le test portait sur
    // `urbanSet`, un RAYON dérivé des compteurs : une rue traversant des
    // hectares que la ville n'a jamais bâtis y gagnait quand même ses dalles de
    // centre-ville. On demande maintenant au sol : si la cellule est peinte en
    // cour ou en friche (cf. COUR), la rue reprend son ourlet de campagne.
    const inCity = COUR.on && COUR.sidewalk
      ? kindAt(r2.gx, r2.gy) === 'urban'
      : !!(L.urbanSet && L.urbanSet.has(r2.gx + ',' + r2.gy));
    r2.md = null;                        // masque de TRACÉ (cf. juste après)
    // …et il faut QUELQU'UN à desservir. Raph 2026-08-05 : « on peut pas juste
    // faire en sorte que des rues ne soient pas au milieu de nulle part ? ».
    // Mesuré : 11 à 12 % des cellules-route n'ont AUCUN bâtiment sur leurs huit
    // voisines — des voies qui traversent des terrains jamais bâtis. Elles ne
    // peuvent pas être SUPPRIMÉES : elles portent la connexité (un émondage aux
    // points d'articulation n'en a libéré que 7 sur 1901, mesuré). Mais rien ne
    // les oblige à RESSEMBLER à des rues : sans façade, pas de trottoir — donc
    // pas de marche, pas de bordure, pas de mobilier. Elles reprennent l'ourlet
    // de campagne et redeviennent ce qu'elles sont : des voies de passage.
    // ⚠ Le test porte sur les 8 voisines, diagonales comprises : une maison en
    // biais d'un carrefour le borde tout autant, et s'en tenir aux 4 orthogonales
    // dénuderait les cellules d'angle en plein quartier bâti.
    if (swOn && !isPathRank && inCity && builtNear(L, r2.gx, r2.gy)) swRoads.push(r2);
    else shRoads.push(r2);
  }
  // ── LE TROTTOIR PASSE DEVANT L'ENTRÉE DES VENELLES ──────────────────────────
  // Une venelle (rang `path`) n'a pas de trottoir. Là où elle débouchait sur une
  // rue qui en a un, la rue tendait son BRAS de chaussée jusqu'au bord de
  // cellule : le bras traversait la bande claire et la coupait NET. C'est la
  // cause dominante des « bouts de trottoir orphelins » qui s'arrêtent au milieu
  // du pavé — mesuré sur une ville band 3 de 1408 cellules-route : 88 débouchés
  // de venelle contre 11 sorties de ville, soit 16 % des 538 rues à trottoir.
  //
  // En ville, un trottoir ne s'interrompt pas pour une ruelle : il PASSE DEVANT,
  // et c'est la ruelle qui vient buter dessus. On retire donc ce bras du seul
  // TRACÉ (masque `md`) : la connexité LOGIQUE du réseau ne bouge pas d'un iota
  // — `cell.mask` reste intact, les agents continuent d'emprunter la venelle, et
  // la venelle garde son propre bras jusqu'à son bord de cellule, qui vient
  // toucher le bord extérieur du trottoir.
  //
  // GARDE : on ne retire jamais le DERNIER bras (`md` doit rester non nul), sans
  // quoi une rue qui ne dessert que des venelles deviendrait une plaque de
  // trottoir carrée posée dans le pavé, sans chaussée.
  // Molette : __sidewalkIso({ alleyThrough: false }) rejoue l'ancien tracé.
  if (SIDEWALK_ISO.alleyThrough !== false) {
    const isAlley = (x, y) => { const c = roadMap && roadMap.get(x + ',' + y); return !!(c && c.rank === 'path'); };
    for (const r2 of swRoads) {
      const m0 = r2.cell ? (r2.cell.mask | 0) : 0;
      let md = m0;
      if ((md & ROAD_E) && isAlley(r2.gx + 1, r2.gy)) md &= ~ROAD_E;
      if ((md & ROAD_W) && isAlley(r2.gx - 1, r2.gy)) md &= ~ROAD_W;
      if ((md & ROAD_S) && isAlley(r2.gx, r2.gy + 1)) md &= ~ROAD_S;
      if ((md & ROAD_N) && isAlley(r2.gx, r2.gy - 1)) md &= ~ROAD_N;
      r2.md = md !== 0 ? md : m0;
    }
  }
  // Couloirs construits UNE fois par liste, rejoués à chaque passe (les largeurs
  // varient, la topologie non). Union sh ∪ sw = union `roads` : un tronçon qui
  // change de liste au bord urbain aboute ses bras au bord de cellule partagé.
  const shRuns = buildRoadRuns(shRoads), swRuns = buildRoadRuns(swRoads);
  // ── TOUTE LA VOIRIE EST PEINTE EN PIXELS, PLUS UN TRAIT AU VECTEUR ─────────
  // (Raph 2026-08-05, après le trottoir : « oui je veux bien » pour le reste.)
  // Ourlet, épaulement, trottoir, caniveau, rubans de chaussée, frange et allées
  // de seuil passent dans le CALQUE à l'échelle de l'art (cf. § LE TROTTOIR EST
  // PEINT EN PIXELS). Ce sont les mêmes tracés, à la même géométrie : seule la
  // résolution de rastérisation change — et avec elle le bord, qui cesse d'être
  // trois fois plus fin que le pixel de l'art voisin.
  // ⚠ LE CULL DE TRANCHE SE FAIT AVANT LA BASCULE. `ISO_GROUND_SLICE` borne des
  // px écran DU BAKE ; sous le calque, worldToScreen répond dans un autre repère
  // et le test deviendrait faux en silence (cellules peintes hors tranche, ou
  // tranche vide). On fige donc ici la liste des cellules à peindre.
  const roadsVis = [];
  for (const r of roads) {
    if (ISO_GROUND_SLICE.on) {
      const pr = worldToScreen(r.gx * T, r.gy * T);
      if (ISO_GROUND_SLICE.yOn && (pr.y < ISO_GROUND_SLICE.y0 - ISO_GROUND_SLICE.padTop
        || pr.y > ISO_GROUND_SLICE.y1 + ISO_GROUND_SLICE.padBot)) continue;
      if (ISO_GROUND_SLICE.xOn && (pr.x < ISO_GROUND_SLICE.x0 - ISO_GROUND_SLICE.padX
        || pr.x > ISO_GROUND_SLICE.x1 + ISO_GROUND_SLICE.padX)) continue;
    }
    roadsVis.push(r);
  }
  const lay = (ROAD_DETAIL.pixel !== false && roads.length) ? walkLayerBegin(z) : null;
  const sctx = lay ? lay.ctx : ctx;
  const shw = lay ? T * ISO_X : hw;   // demi-largeur du losange DANS le repère de dessin
  const tU1 = PR && performance.now();
  if (shRoads.length) {
    if (ROAD_DETAIL.feather > 0 && ROAD_DETAIL.featherA > 0) {
      sctx.beginPath();
      addRunQuads(shRuns, cbR + T * ROAD_DETAIL.feather, sctx);
      sctx.globalAlpha = ROAD_DETAIL.featherA;
      sctx.fillStyle = shCol;
      sctx.fill();
      sctx.globalAlpha = 1;
    }
    sctx.beginPath();
    addRunQuads(shRuns, cbR, sctx);
    sctx.fillStyle = shCol;
    sctx.fill();
  }
  if (PR) PR.roadsShoulder = performance.now() - tU1;
  const tU2 = PR && performance.now();
  if (swRoads.length) {
    // ── LA MARCHE, ET RIEN QUE LA MARCHE ─────────────────────────────────────
    // Raph 2026-08-05, et c'est la remise à plat qui manquait : « techniquement
    // il n'y a pas de sol mais trottoir et maison, donc pas de sens que le
    // trottoir ait une apparence différente du sol. Il faut effectivement la
    // marche mais après bam, du sol ».
    //
    // Autrement dit : LE SOL DE VILLE *EST* LE TROTTOIR. Ce qui borde une rue
    // n'est pas une bande rapportée, c'est le sol de la ville qui court jusqu'au
    // caniveau — et la seule chose qui les sépare est la MARCHE. Tout ce que la
    // bande portait est donc parti : son aplat, sa matière dédiée (walk-*), son
    // appareillage, son joint de rive. Ce qui reste tient en deux traits d'un
    // pixel d'art, CÔTÉ RUE uniquement :
    //   • NEZ DE BORDURE — arête claire à la limite caniveau ↔ sol, le dessus
    //     de la marche qui prend la lumière ;
    //   • OMBRE PORTÉE — un pixel sombre juste sous ce nez, du seul côté qui
    //     fait face à la caméra : c'est elle qui creuse. Sans elle, l'arête
    //     claire flotte.
    // Côté sol, plus rien : pas de liseré, pas de bord. Bam, du sol.
    //
    // ⚠ La géométrie de rue (SIDEWALK_ISO.w) RESTE : elle ne peint plus rien,
    // mais elle publie toujours aux agents où marchent les piétons et où se
    // pose le mobilier — le long de la rue, sur le sol.
    // Réglage : __sidewalkIso({ stepA, stepLight, stepShade }) ; stepA 0 = plat.
    //
    // TRAIT D'UN PIXEL D'ART, EN ESCALIER 2:1 — la pente exacte de la projection
    // d'un axe monde. Tracé en quad, un trait d'un pixel de large ressort PÂLE :
    // l'antialiasing étale son alpha sur deux pixels et il n'en reste rien. Ici,
    // des `fillRect` entiers, donc un alpha exact et la granularité de l'art.
    // `dy` décale vers le bas (une ombre se pose SOUS l'arête qu'elle creuse) ;
    // le dédoublonnage évite qu'une marche repeinte double son alpha.
    // ⚠⚠ LA MARCHE S'INTERROMPT AUX CROISEMENTS (Raph 2026-08-05 : « attention,
    // ça crée des rues FERMÉES au milieu du sol »). Un bord de run est tracé sur
    // toute sa longueur — donc il passait AU-DESSUS des chaussées
    // perpendiculaires. Les marches se rejoignaient d'un run à l'autre et
    // refermaient un quadrillage continu sur le sol : des cadres, au lieu de
    // rues. Au droit d'une chaussée, le trottoir cède le passage — c'est le
    // passage piéton — et la marche reprend de l'autre côté.
    const roadByKey = new Map();
    for (const r2 of roads) roadByKey.set(r2.gx + ',' + r2.gy, r2);
    const onRoadway = (wx, wy) => {
      const gx = Math.floor(wx / T), gy = Math.floor(wy / T);
      const r2 = roadByKey.get(gx + ',' + gy);
      if (!r2) return false;
      const wb = T * wOf(r2) + T * ROAD_DETAIL.groove;   // chaussée + son caniveau
      const dx = wx - (gx + 0.5) * T, dy2 = wy - (gy + 0.5) * T;
      const ax2 = Math.abs(dx), ay2 = Math.abs(dy2);
      if (ax2 <= wb && ay2 <= wb) return true;           // pavé central
      const m = maskOf(r2);                              // bras RÉELLEMENT tracés
      if (ay2 <= wb && dx > wb && (m & ROAD_E)) return true;
      if (ay2 <= wb && dx < -wb && (m & ROAD_W)) return true;
      if (ax2 <= wb && dy2 > wb && (m & ROAD_S)) return true;
      if (ax2 <= wb && dy2 < -wb && (m & ROAD_N)) return true;
      return false;
    };
    let lastPx = -1e9, lastPy = -1e9;
    const pixelLine = (ax, ay, bx, by, dy = 0) => {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const wx = ax + (bx - ax) * t, wy = ay + (by - ay) * t;
        if (onRoadway(wx, wy)) { lastPx = -1e9; lastPy = -1e9; continue; }
        const p = worldToScreen(wx, wy);
        const px = Math.round(p.x) - 1, py = Math.round(p.y) + dy;
        if (px === lastPx && py === lastPy) continue;
        sctx.fillRect(px, py, 2, 1);
        lastPx = px; lastPy = py;
      }
      lastPx = -1e9; lastPy = -1e9;
    };
    // Les deux bords d'un run, en coordonnées monde — `off` = distance à l'axe,
    // en fraction de tuile ; `side` +1 = le bord qui fait face à la caméra.
    const runEdges = (runs, off, draw) => {
      for (const s of runs.h) {
        const W = T * s.w + T * off;
        const cy2 = (s.gy + 0.5) * T;
        const x0 = s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W;
        const x1 = s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W;
        draw(x0, cy2 - W, x1, cy2 - W, -1);
        draw(x0, cy2 + W, x1, cy2 + W, 1);
      }
      for (const s of runs.v) {
        const W = T * s.w + T * off;
        const cx2 = (s.gx + 0.5) * T;
        const y0 = s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W;
        const y1 = s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W;
        draw(cx2 - W, y0, cx2 - W, y1, -1);
        draw(cx2 + W, y0, cx2 + W, y1, 1);
      }
    };
    if (ROAD_DETAIL.groove > 0 && ROAD_DETAIL.grooveA > 0) {
      sctx.beginPath();
      addRunQuads(swRuns, T * ROAD_DETAIL.groove, sctx);
      sctx.fillStyle = `rgba(40,30,18,${ROAD_DETAIL.grooveA})`;
      sctx.fill();
    }
    // ⚠⚠ LA MARCHE N'A QU'UNE FACE, ET LA PERSPECTIVE DIT LAQUELLE (Raph
    // 2026-08-05 : « on doit respecter la perspective »). La v1 posait le même
    // trait sur les DEUX bords d'une chaussée — nez clair et ombre de part et
    // d'autre — ce qui est géométriquement impossible : la bordure « montait »
    // des deux côtés à la fois.
    //
    // En 3/4, on voit les faces tournées vers +x et +y (celles qui regardent le
    // bas de l'écran). Pour une rue est-ouest, le trottoir NORD présente à la
    // chaussée une face orientée +y : elle est VUE, il faut en dessiner la
    // tranche. Le trottoir SUD, lui, est entre la caméra et la rue ; sa face
    // regarde −y, donc elle est CACHÉE — il n'y a rien à y peindre. Idem sur
    // l'autre axe : trottoir OUEST vu, trottoir EST caché. C'est toujours le
    // bord `side < 0` de `runEdges`.
    //
    // La tranche descend DANS la chaussée (vers le bas de l'écran) : le sol
    // reste à plat, c'est elle seule qui raconte le dénivelé.
    if (!LOD && SIDEWALK_ISO.stepA > 0) {
      const inner = ROAD_DETAIL.groove + SIDEWALK_ISO.curb;   // arête haute de la marche
      const hStep = Math.max(1, SIDEWALK_ISO.stepH | 0);
      sctx.fillStyle = `rgba(${SIDEWALK_ISO.stepShade.join(',')},${SIDEWALK_ISO.stepA})`;
      runEdges(swRuns, inner, (ax, ay, bx, by, side) => {
        if (side >= 0) return;                       // face cachée : on ne peint rien
        for (let d = 1; d <= hStep; d += 1) pixelLine(ax, ay, bx, by, d);
      });
      sctx.fillStyle = `rgba(${SIDEWALK_ISO.stepLight.join(',')},${SIDEWALK_ISO.stepA})`;
      runEdges(swRuns, inner, (ax, ay, bx, by, side) => {
        if (side < 0) pixelLine(ax, ay, bx, by);     // nez éclairé, au sommet de la tranche
      });
    }
  }
  if (PR) PR.roadsSidewalk = performance.now() - tU2;
  const tU3 = PR && performance.now();
  if (shRoads.length && ROAD_DETAIL.groove > 0 && ROAD_DETAIL.grooveA > 0) {
    sctx.beginPath();
    addRunQuads(shRuns, T * ROAD_DETAIL.groove, sctx);
    sctx.fillStyle = `rgba(40,30,18,${ROAD_DETAIL.grooveA})`;
    sctx.fill();
  }
  if (PR) PR.roadsGroove = performance.now() - tU3;
  for (const r of roadsVis) {
    const cx = (r.gx + 0.5) * T, cy = (r.gy + 0.5) * T;
    const wb = T * wOf(r);          // demi-chaussée de LA cellule (hiérarchie par rang)
    const mask = maskOf(r);         // masque de TRACÉ (bras vers venelle retiré)
    // Ton de dalle en variation LISSÉE le long du tracé (le hash par cellule
    // rayait le ruban de bandes — même règle que les sols : rien par cellule).
    const v = 0.97 + smoothNoise(r.gx, r.gy, 4, 'rb') * 0.06;
    // Ruban de chaussée = pavé central + un bras vers chaque connexion (tracé CHEMIN).
    sctx.beginPath();
    pathWorldQuad(sctx, cx - wb, cy - wb, cx + wb, cy + wb);                       // pavé central
    if (mask & ROAD_E) pathWorldQuad(sctx, cx + wb, cy - wb, (r.gx + 1) * T, cy + wb);
    if (mask & ROAD_W) pathWorldQuad(sctx, r.gx * T, cy - wb, cx - wb, cy + wb);
    if (mask & ROAD_S) pathWorldQuad(sctx, cx - wb, cy + wb, cx + wb, (r.gy + 1) * T);
    if (mask & ROAD_N) pathWorldQuad(sctx, cx - wb, r.gy * T, cx + wb, cy - wb);
    const rTile = (ROAD_DETAIL.on && ROAD_DETAIL.tiles && rmat.tile && !HARD) ? ensureIsoTileKey(rmat.tile) : null;
    if (rTile && rTile.ready) {
      sctx.save(); sctx.clip();
      const rp = worldToScreen(r.gx * T, r.gy * T);
      const rH = cmHash('rr:' + r.gx + ',' + r.gy);
      const rmir = ((rH >>> 3) & 1) === 1;
      blitIsoTileKey(sctx, rmat.tile, rp.x, rp.y, shw, rmir, rH, rVeil);
      sctx.restore();
    } else {
      // DALLE LISSE : surface PLEINE de chaussée, teinte par ère (roadTone, qui
      // porte DÉJÀ le voile de lecture). Lisse et propre (pas de texture qui
      // transparaît) — la « dalle lisse » demandée par Raph.
      sctx.fillStyle = rgb(road, v);
      sctx.fill();
    }
    // MARQUAGE : UNIQUEMENT le pointillé BLANC d'axe, au milieu des segments droits
    // (Raph : « tirets blancs juste au milieu, pas besoin sur les côtés »').
    // …et plus « toutes ères » : le marquage routier n'existe qu'à partir de
    // l'asphalte (band ≥ 6) — des tirets d'autoroute sur un sentier de terre
    // étaient précisément « cette route à toutes les ères » (Raph 2026-07-28).
    const markBand = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
    const throughH = !!((mask & ROAD_E) && (mask & ROAD_W)), throughV = !!((mask & ROAD_S) && (mask & ROAD_N));
    if (markBand >= 6 && throughH !== throughV) {   // segment droit à un seul axe
      sctx.fillStyle = 'rgba(246,245,240,0.9)';
      const dl = T / 5, dg = T / 7, dw2 = T * 0.03;   // tiret, trou, demi-largeur
      for (let o = dg / 2; o + dl <= T; o += dl + dg) {
        if (throughH) fillWorldQuad(sctx, r.gx * T + o, cy - dw2, r.gx * T + o + dl, cy + dw2);
        else fillWorldQuad(sctx, cx - dw2, r.gy * T + o, cx + dw2, r.gy * T + o + dl);
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
        let nx2 = (s[4] - s[5]) * shw, ny2 = (s[4] + s[5]) * (shw * ISO_Y / ISO_X);
        const nl2 = Math.hypot(nx2, ny2) || 1;
        nx2 /= nl2; ny2 /= nl2;
        // `puR` est l'unité de pixel des effets : dans le calque, elle vaut déjà
        // le pixel d'art (hw = T), donc les gravillons sortent au bon calibre.
        drawRoadEdgeFringe(sctx, {
          ax: A.x, ay: A.y, bx: B.x, by: B.y, ox: nx2, oy: ny2,
          seed: 'rf:' + r.gx + ',' + r.gy + ':' + s[6],
        }, lay ? Math.max(1, Math.round(shw * 0.055)) : puR, shCol, shCol2, spillCol, rfK);
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
    sctx.globalAlpha = 0.8;
    sctx.fillStyle = shCol;
    sctx.beginPath();
    let alN = 0;
    const allee = (x0, y0, x1, y1) => {
      pathWorldQuad(sctx, x0, y0, x1, y1);
      alN += 1;
      if (alN >= 256) { sctx.fill(); sctx.beginPath(); alN = 0; }
    };
    for (const t2 of L.tiles) {
      const isEng = t2.type === 'engine';
      if (!isEng && t2.type !== 'house' && t2.type !== 'enginehome') continue;
      // Les CHAMPS n'ont pas de seuil : une parcelle se laboure, elle n'a pas
      // de porte (Raph 2026-07-28) — seuls moteurs exclus des allées.
      if (isEng && t2.buildingId === 'irrigated_fields') continue;
      // La façade est résolue par isoBuildingFront (partagée avec le poussé du
      // sprite, cf. FRONT) : le seuil et le bâtiment DOIVENT désigner le même
      // côté, sinon le trait sortirait d'un mur aveugle.
      const f2 = isoBuildingFront(t2, roadMap);
      if (f2) {
        const { dx, dy, hx, hy, rank } = f2;
        const rx = hx + dx, ry = hy + dy;
        const rw = isoRoadHalfW(rank);
        if (dy === 1) allee((hx + 0.5) * T - aw, (hy + 1) * T - tuck, (hx + 0.5) * T + aw, (ry + 0.5 - rw) * T);
        else if (dy === -1) allee((hx + 0.5) * T - aw, (ry + 0.5 + rw) * T, (hx + 0.5) * T + aw, hy * T + tuck);
        else if (dx === 1) allee((hx + 1) * T - tuck, (hy + 0.5) * T - aw, (rx + 0.5 - rw) * T, (hy + 0.5) * T + aw);
        else allee((rx + 0.5 + rw) * T, (hy + 0.5) * T - aw, hx * T + tuck, (hy + 0.5) * T + aw);
      }
    }
    if (alN) sctx.fill();
    sctx.globalAlpha = 1;
  }
  // Le calque de voirie est reposé ICI, à la fin de tout ce qui la compose :
  // agrandi ×z en NEAREST, il rend des bords en marches de la même taille que
  // les pixels des tuiles voisines. Après lui viennent le terre-plein et le
  // reste, qui gardent leur tracé propre.
  if (lay) walkLayerEnd(lay, ctx, z);
  if (PR) PR.allees = performance.now() - tAl;
  // Terre-plein PLANTÉ des boulevards 2-cellules (couture L.terrePlein), façon
  // PLACE : le bake ne porte que le SOL — capsule d'herbe à bouts ronds (prolongée
  // de MEDIAN_TUNE.ext dans les carrefours), ombre portée bas-droite (lumière
  // haut-gauche), liseré de pierre, touffes et fleurs. Les BUISSONS (relief) sont
  // des items du peintre par-dessus, cf. drawIsoLive. La bande sprite 3-slice a
  // été RETIRÉE (« rendu étiré, peu de relief », Raph 2026-08-03).
  const tMd = PR && performance.now();
  const tp = L.terrePlein;
  if (tp && tp.length) {
    const wtp = T * 0.26;                        // demi-largeur monde de la capsule (< refuge agents ±0.34)
    const ext = MEDIAN_TUNE.ext * T;
    // Trace la capsule en MONDE (bouts = demi-cercles échantillonnés) : projetée
    // par worldToScreen, elle s'écrase naturellement en rondelle iso au sol.
    const capsulePath = (ax, ay, bx, by, w) => {
      const dl = Math.hypot(bx - ax, by - ay) || 1;
      const ux = (bx - ax) / dl, uy = (by - ay) / dl, pxw = -uy, pyw = ux;
      ctx.beginPath();
      const N = 7;
      for (let i = 0; i <= N; i += 1) {          // bout A : +perp → −axe → −perp
        const th = Math.PI * (i / N);
        const q = worldToScreen(ax + (pxw * Math.cos(th) - ux * Math.sin(th)) * w, ay + (pyw * Math.cos(th) - uy * Math.sin(th)) * w);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      for (let i = 0; i <= N; i += 1) {          // bout B : −perp → +axe → +perp
        const th = Math.PI * (i / N);
        const q = worldToScreen(bx + (-pxw * Math.cos(th) + ux * Math.sin(th)) * w, by + (-pyw * Math.cos(th) + uy * Math.sin(th)) * w);
        ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
    };
    for (const seg of tp) {
      let ax, ay, bx, by;
      if (seg.axis === 'h') { ax = seg.x0 * T - ext; ay = (seg.y + 1) * T; bx = (seg.x1 + 1) * T + ext; by = ay; }
      else { ax = (seg.x + 1) * T; ay = seg.y0 * T - ext; bx = ax; by = (seg.y1 + 1) * T + ext; }
      // Ombre portée : même capsule décalée bas-droite écran, SOUS le gazon.
      ctx.save();
      ctx.translate(z * 1.4, z * 1.0);
      capsulePath(ax, ay, bx, by, wtp);
      ctx.fillStyle = 'rgba(18,24,12,0.22)';
      ctx.fill();
      ctx.restore();
      capsulePath(ax, ay, bx, by, wtp);
      // Fond uni : REPLI tant que la texture décode, et bouche-trou sous ses
      // pixels de bord. En saison verte : herbe SAISONNIÈRE éclaircie d'un cran
      // (gazon municipal plus frais que le pré). En HIVER : blanc neige — la
      // ville entière est enneigée (tuiles d'herbe hiver), un gazon resté vert
      // jurait au milieu de la neige (retour Raph « l'hiver ne va pas du tout »).
      const winterTP = CM.season === WINTER;
      const lawn = winterTP
        ? [224, 232, 236]
        : [Math.min(255, SEASON_GRASS[0] + 6), Math.min(255, SEASON_GRASS[1] + 12), Math.max(0, SEASON_GRASS[2] - 2)];
      ctx.fillStyle = rgb(lawn, 1);
      ctx.fill();
      // GAZON PixelLab (`median-lawn[-winter]`, tuile vue du dessus — l'hiver est
      // une texture de NEIGE piquée de brins) posé en PATTERN écrasé 2:1 — la
      // perspective du sol iso, comme les tuiles losange — et ANCRÉ AU MONDE
      // (origine = worldToScreen(0,0)) : la texture ne « nage » pas au pan, une
      // répétition couvre une tuile. Même contrat que blitIsoTileKey (la saison
      // en place est gardée tant que la tuile de l'autre décode).
      const lawnArt = isoArt(winterTP ? 'median-lawn-winter' : 'median-lawn');
      let lawnTex = false;
      if (lawnArt.ready) {
        const pat = ctx.createPattern(lawnArt.img, 'repeat');
        if (pat) {
          const s = (T * z) / (lawnArt.img.naturalWidth || 64);
          const o = worldToScreen(0, 0);
          if (pat.setTransform) pat.setTransform(new DOMMatrix([s, 0, 0, s * 0.5, o.x, o.y]));
          capsulePath(ax, ay, bx, by, wtp);
          ctx.fillStyle = pat;
          ctx.fill();
          lawnTex = true;
        }
      }
      ctx.strokeStyle = 'rgba(198,188,154,0.95)'; // liseré pierre (margelle fine)
      ctx.lineWidth = Math.max(1, z * 0.9);
      ctx.stroke();
      const dl = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / dl, uy = (by - ay) / dl;
      const pxw = -uy, pyw = ux;
      const pu = Math.max(1, Math.round(T * z * 0.028));   // pixel d'art (cf. drawGrassDetail)
      const segKey = seg.axis + ':' + (seg.axis === 'h' ? seg.y + ':' + seg.x0 : seg.x + ':' + seg.y0);
      // MOUCHETIS de tonte : REPLI du gazon PixelLab (aplat + points 2 tons)
      // tant que la texture n'est pas décodée — elle porte son propre grain.
      if (!lawnTex) {
        const mowL = rgb([Math.min(255, lawn[0] + 15), Math.min(255, lawn[1] + 15), Math.min(255, lawn[2] + 10)], 1);
        const mowD = rgb([Math.max(0, lawn[0] - 13), Math.max(0, lawn[1] - 11), Math.max(0, lawn[2] - 8)], 1);
        for (let t = wtp * 0.5; t <= dl - wtp * 0.5; t += T * 0.115) {
          for (let kRow = -2; kRow <= 2; kRow += 1) {
            const h = cmHash('tpm:' + segKey + ':' + Math.round(t * 100) + ':' + kRow);
            if ((h & 255) / 255 > 0.52) continue;
            const off = kRow * wtp * 0.36 + (((h >>> 9) % 64) / 64 - 0.5) * wtp * 0.3;
            const jt = (((h >>> 16) % 64) / 64 - 0.5) * T * 0.09;
            const q = worldToScreen(ax + ux * (t + jt) + pxw * off, ay + uy * (t + jt) + pyw * off);
            ctx.fillStyle = (h & 1) ? mowL : mowD;
            ctx.fillRect(Math.round(q.x), Math.round(q.y), pu, pu);
          }
        }
      }
      // PARTERRES DE FLEURS (slots pairs, cf. medianSlots — les impairs portent
      // les buissons du peintre) : sprite PixelLab `flowerbed-1..4` (bac de
      // terre + fleurs denses, robe par hash — planche 1e1aedaa découpée par
      // scripts/sliceFlowerBeds.mjs) ; REPLI procédural (bordure + feuillage +
      // tapis de points) tant que le PNG décode — le bake se recuit tout seul
      // au décodage (invalidation douce d'isoArt).
      for (const sl of medianSlots(seg, T)) {
        if (sl.kind !== 'bed') continue;
        // HIVER : pas de bacs du tout — seuls les buissons enneigés rendent bien
        // (retour Raph ; les bacs de neige recolorés ont été retirés). Le peintre
        // pose alors un buisson sur CES slots aussi, la bande garde son rythme.
        if (winterTP) continue;
        const br = T * (0.18 + ((sl.h >>> 3) % 40) / 730);           // rayon 0.18-0.235 tuile
        const bedArt = isoArt('flowerbed-' + (1 + ((sl.h >>> 8) % 4)));
        if (bedArt.ready) {
          // Largeur écran EXACTE de l'ellipse du disque monde (2√2·c·br, c
          // mesuré par projection) ; le bac « pose » son ovale autour du centre.
          const qc = worldToScreen(sl.wx, sl.wy);
          const cbr = worldToScreen(sl.wx + br, sl.wy).x - qc.x;
          const dw = 2 * Math.SQRT2 * cbr * 1.12;                    // léger bonus : le PNG a sa marge
          const iw = bedArt.img.naturalWidth || 1, ih = bedArt.img.naturalHeight || 1;
          // Été et hiver partagent la MÊME géométrie 3/4 (les bacs d'hiver sont
          // les bacs d'été recolorés par scripts/recolorWinterBeds.mjs — fleurs
          // → paquets de neige à modelé conservé) : ratio naturel du PNG.
          const dh = dw * (ih / iw);
          const prevSm = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(bedArt.img, Math.round(qc.x - dw / 2), Math.round(qc.y + dw * 0.25 - dh), dw, dh);
          ctx.imageSmoothingEnabled = prevSm;
          continue;
        }
        const ring = (rr) => {
          ctx.beginPath();
          for (let i = 0; i <= 14; i += 1) {
            const th = (i / 14) * Math.PI * 2;
            const q = worldToScreen(sl.wx + Math.cos(th) * rr, sl.wy + Math.sin(th) * rr);
            if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
          }
          ctx.closePath();
        };
        ring(br);
        ctx.fillStyle = 'rgb(88,68,50)';                              // terre de plate-bande
        ctx.fill();
        ring(br * 0.84);
        ctx.fillStyle = 'rgb(58,84,44)';                              // feuillage du massif
        ctx.fill();
        const pal = BED_PALETTES[(sl.h >>> 8) % BED_PALETTES.length];
        const step = T * 0.048, rIn = br * 0.8;
        for (let dxw = -rIn; dxw <= rIn; dxw += step) {
          for (let dyw = -rIn; dyw <= rIn; dyw += step) {
            if (dxw * dxw + dyw * dyw > rIn * rIn) continue;
            const h4 = cmHash('tpb:' + segKey + ':' + Math.round(sl.wx + dxw) + ':' + Math.round(sl.wy + dyw));
            if ((h4 & 255) / 255 > 0.80) continue;                    // trouées de feuillage
            const jx = (((h4 >>> 8) % 32) / 32 - 0.5) * step, jy = (((h4 >>> 13) % 32) / 32 - 0.5) * step;
            const q = worldToScreen(sl.wx + dxw + jx, sl.wy + dyw + jy);
            // dominante ×2, accent ×1 → un massif « à robe », pas des confettis
            const ci = (h4 >>> 18) % 4;
            ctx.fillStyle = rgb(pal[ci === 3 ? 2 : ci >> 1], 1);
            const fs = ((h4 >>> 22) % 10) < 3 ? pu + 1 : pu;          // quelques grosses fleurs
            ctx.fillRect(Math.round(q.x - fs / 2), Math.round(q.y - fs / 2), fs, fs);
          }
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
/* ── LE RESSAC : LE FLEUVE MONTE ET REDESCEND LE LONG DE SES BERGES ───────────
 * Demande de Raph (2026-07-30) : « des vagues — pour l'instant juste faire monter
 * et descendre le niveau d'eau partout, légèrement ».
 *
 * ⚠ LA VAGUE EST AU BORD, PAS SUR LA SURFACE — et ce n'est pas une humeur, c'est
 * le seul terrain qui reste. Le milieu du fleuve a déjà refusé trois fois ce
 * qu'on pourrait y poser : le grain procédural (trois calibrages, trois refus),
 * les vaguelettes vectorielles retirées le 2026-07-22 (« enlève les traits blancs
 * du courant, on n'en a plus besoin »), et la bande d'eau elle-même qu'il a fallu
 * CALMER le 2026-07-30 (« le fleuve est trop bruyant »). Y rajouter du mouvement,
 * c'est rouvrir les trois d'un coup. Au BORD, rien n'a jamais été refusé — et
 * c'est là qu'une vague se lit vraiment : ce qu'on reconnaît d'une vague, ce
 * n'est pas sa crête au large, c'est l'eau qui monte sur le sable et redescend.
 *
 * ⚠⚠ L'EAU N'AVANCE QUE, ELLE NE RECULE JAMAIS SOUS SON LIT PEINT. Le sol sous le
 * ruban est BAKÉ, et c'est de l'HERBE (berges douces, cf. drawIsoGround) : une eau
 * qui se retirerait en deçà de son bord habituel découvrirait du vert au ras de
 * l'onde, une fois par seconde, sur toute la longueur du fleuve. On pose donc le
 * lit peint comme MARÉE BASSE et la houle ne fait qu'y ajouter (`hw + amp·u`,
 * u ∈ [0,1]). Avancer ne peut que RECOUVRIR — il n'existe aucun cas où ça
 * découvre quoi que ce soit. C'est ce qui rend l'effet sûr PARTOUT, y compris
 * dans les configurations qu'on n'a pas regardées.
 *
 * Où ça se voit : partout où le ruban borde la terre — campements, plages, îles,
 * emprise du port, extrémités du cours. Sous les QUAIS, la promenade est peinte
 * APRÈS le fleuve, de son bord d'eau jusqu'à 0,7 tuile côté terre (`fillStrip`
 * dans renderWorld) : elle recouvre une avancée qui plafonne à 0,22. Le ressac y
 * est donc simplement invisible, sans un pixel d'eau sur la pierre — rien à
 * masquer, et c'est pour ça qu'il n'y a pas de garde par ère ici.
 *
 * ⚠ PUREMENT f(now), ET C'EST L'INVERSE DE stepWaterPhase — À DESSEIN. La phase de
 * la nappe, elle, DOIT être intégrée parce que sa vitesse suit la météo (cf. ⚠⚠
 * PHASE ACCUMULÉE, et le bug « à l'envers » de juillet). Ici la vitesse est
 * CONSTANTE par construction : l'averse ne touche QUE l'amplitude. Un temps absolu
 * × une vitesse constante ne saute jamais — on garde donc une fonction pure, et
 * une capture (now figé) reste reproductible. Ne JAMAIS faire dépendre `len` ou
 * `period` de la météo sans passer d'abord à une phase intégrée.
 *
 * Molette : window.__waves. `len = 0` retombe sur la MARÉE du premier jet — tout
 * le fleuve monte et descend ensemble, sans onde qui voyage.
 * ------------------------------------------------------------------------- */
export const waveTune = {
  on: true,
  // Avancée MAXIMALE de l'eau au-delà de son lit peint, en TUILES. Se juge contre
  // la bande de sable des berges (BEACH.bankBand = 0,55 tuile) : la vague reste
  // dedans, elle mouille le sable sans jamais atteindre l'herbe.
  amp: 0.22,
  len: 9, period: 3.4,                     // houle principale : longueur d'onde (tuiles), temps de parcours (s)
  len2: 4.3, period2: 2.1, mix2: 0.38,     // seconde houle — sans elle, l'onde bat la mesure comme un métronome
  // Les deux rives ne respirent PAS ensemble : en phase, le fleuve « gonfle » et
  // se dégonfle comme un tuyau au lieu de battre contre chacune de ses berges.
  sidePhase: 1.7,
  rainAmp: 0.7,                            // × amplitude à averse pleine (l'AMPLITUDE seule, jamais la vitesse)
  // Fondu au dézoom : sous 3 px d'écran l'onde ne se lit plus, elle scintille.
  minZoom: 0.3, fullZoom: 0.5,
  // ── SILLAGE D'ÎLE ─────────────────────────────────────────────────────────
  // Une île DIVISE le courant : l'eau s'empile sur la pointe amont et la pointe
  // aval est à l'abri. C'est le seul endroit de la carte où l'eau rencontre un
  // obstacle, donc le seul où elle peut le DIRE. On module l'amplitude du ressac
  // autour du fuseau (0 = île qui respire uniformément, comme une berge).
  wake: 0.75,
  // Écume de proue : l'arc de bas-fond VIF sur la pointe amont, là où l'onde se
  // brise. C'est la partie qu'on VOIT — la modulation d'amplitude, elle, ne vaut
  // que quelques pixels au zoom de jeu. Reste dans la famille admise (un trait au
  // CONTACT de la terre et de l'eau, comme le rivage d'île), et non une nappe
  // posée au milieu du fleuve — celles-là ont été refusées trois fois.
  bow: 1, bowArc: 0.34, bowW: 2.2,         // intensité, demi-ouverture (tours), × largeur du liseré
  // ── LA LAISSE ─────────────────────────────────────────────────────────────
  // Combien de temps le sable garde la trace de l'eau, et en combien de pas on
  // regarde en arrière. `wetMem = 0` recolle la frange à la ligne d'eau, soit
  // exactement le comportement d'avant le 2026-07-30.
  wetMem: 2.2, wetSteps: 8,
};
if (typeof window !== 'undefined') window.__waves = waveTune;

// Hauteur de l'onde en un point, normalisée 0..1 (0 = lit peint, 1 = crête).
// `s` = abscisse curviligne en TUILES, `t` = secondes, `side` = ±1 (la rive).
// Exportée PURE : c'est la forme de l'onde qui se teste, pas le dessin.
export function waveReach(s, t, side = 1, G = waveTune) {
  // len ≤ 0 : le terme spatial disparaît et toute la berge monte en même temps —
  // c'est la MARÉE demandée au départ, gardée comme A/B et non comme un cas mort.
  const ph = side < 0 ? G.sidePhase : 0;
  const sp1 = G.len > 0 ? s / G.len : 0, sp2 = G.len2 > 0 ? s / G.len2 : 0;
  const tp1 = G.period > 0 ? t / G.period : 0, tp2 = G.period2 > 0 ? t / G.period2 : 0;
  const m = Math.max(0, Math.min(1, G.mix2));
  return 0.5 + 0.5 * ((1 - m) * Math.sin(2 * Math.PI * (sp1 - tp1) + ph)
    + m * Math.sin(2 * Math.PI * (sp2 - tp2) + ph * 1.6));
}

// Variante BOUCLÉE, pour le contour d'une île.
//
// ⚠ UN CONTOUR FERMÉ NE TOLÈRE PAS UNE ONDE QUELCONQUE : évaluée sur l'abscisse
// curviligne comme sur les berges, l'onde ne retomberait pas sur sa valeur de
// départ après un tour, et l'île se refermerait sur une MARCHE — une encoche fixe
// dans le rivage, à l'endroit où la polyligne boucle. On arrondit donc chaque
// houle au nombre ENTIER de périodes le plus proche le long du périmètre : le
// motif garde son échelle (à un demi-cran près sur une île de ~30 tuiles de tour)
// et sin(2πk·u) reprend exactement sa valeur en u = 1. `u` = tour parcouru, 0..1.
export function waveReachLoop(u, perim, t, phase = 0, G = waveTune) {
  const k1 = G.len > 0 ? Math.max(1, Math.round(perim / G.len)) : 0;
  const k2 = G.len2 > 0 ? Math.max(1, Math.round(perim / G.len2)) : 0;
  const tp1 = G.period > 0 ? t / G.period : 0, tp2 = G.period2 > 0 ? t / G.period2 : 0;
  const m = Math.max(0, Math.min(1, G.mix2));
  return 0.5 + 0.5 * ((1 - m) * Math.sin(2 * Math.PI * (k1 * u - tp1) + phase)
    + m * Math.sin(2 * Math.PI * (k2 * u - tp2) + phase * 1.6));
}

/* ── LA LAISSE : JUSQU'OÙ L'EAU EST MONTÉE RÉCEMMENT ──────────────────────────
 * Demande de Raph (2026-07-30) : « laisser un liseré sombre quand les vagues
 * reviennent dans l'eau ». C'est la laisse de haute mer — le sable reste mouillé
 * là où l'eau vient de passer, et sèche derrière elle. Jusqu'ici la frange humide
 * était collée à la ligne d'eau, donc elle ne laissait jamais rien : elle montait
 * et redescendait avec la vague au lieu de marquer son passage.
 *
 * ⚠ SANS AUCUN ÉTAT, ET C'EST CE QUI LA REND JUSTE. La hauteur d'eau étant une
 * fonction PURE du temps, « jusqu'où l'eau est montée dans les dernières secondes »
 * se lit en rééchantillonnant l'onde EN ARRIÈRE. Un maximum glissant accumulé
 * frame par frame aurait marché aussi — et aurait rendu les captures dépendantes
 * de leur histoire, avec un séchage qui dérive selon le nombre d'images par
 * seconde. Ici, deux machines au même `now` voient la même laisse.
 *
 * Le terme `− k·h·dry` est le SÉCHAGE. Sans lui, la laisse resterait accrochée à
 * la dernière crête puis retomberait D'UN COUP le jour où celle-ci sort de la
 * fenêtre — un liseré qui saute au lieu de s'effacer. Avec lui elle redescend
 * doucement vers la ligne d'eau. Et comme le pas k = 0 n'est pas amorti, le
 * maximum est toujours ≥ la hauteur du moment : la laisse ne peut jamais passer
 * SOUS l'eau, ce qui la ferait disparaître par le mauvais côté.
 * ------------------------------------------------------------------------- */
export function waveWetReach(s, t, side = 1, G = waveTune) {
  if (!(G.wetMem > 0)) return waveReach(s, t, side, G);
  const n = Math.max(1, G.wetSteps | 0), h = G.wetMem / n, dry = 1 / G.wetMem;
  let best = 0;
  for (let k = 0; k <= n; k += 1) {
    const v = waveReach(s, t - k * h, side, G) - k * h * dry;
    if (v > best) best = v;
  }
  return best;
}

// Même laisse, sur le contour BOUCLÉ d'une île (cf. waveReachLoop).
export function waveWetReachLoop(u, perim, t, phase = 0, G = waveTune) {
  if (!(G.wetMem > 0)) return waveReachLoop(u, perim, t, phase, G);
  const n = Math.max(1, G.wetSteps | 0), h = G.wetMem / n, dry = 1 / G.wetMem;
  let best = 0;
  for (let k = 0; k <= n; k += 1) {
    const v = waveReachLoop(u, perim, t - k * h, phase, G) - k * h * dry;
    if (v > best) best = v;
  }
  return best;
}

// SILLAGE : de combien l'onde est amplifiée ou éteinte au tour d'une île, selon
// l'angle `a` dans le repère du fuseau.
//
// ⚠ `il.tx/ty` pointe vers l'AVAL (il est calculé sur des samples d'indice
// CROISSANT, et la nappe d'eau dérive dans le même sens) : donc a = 0 est la
// pointe aval — celle qui est À L'ABRI — et a = π la pointe amont, où l'eau
// s'empile. Inverser ces deux-là ferait un fleuve qui remonte, et rien à l'écran
// ne le dirait franchement : d'où le rappel ici plutôt qu'un signe nu.
//
// Périodique en `a` par construction (un cosinus), donc le contour d'île se
// referme toujours exactement — cf. waveReachLoop, même exigence.
// Pure et exportée : c'est la forme du sillage qui se teste.
export function islandWakeK(a, G = waveTune) {
  const w = Math.max(0, Math.min(1, G.wake));
  return 1 - w * Math.cos(a);
}

// État de l'onde pour LA frame en cours, posé une seule fois par drawIsoRiver et
// lu par tout ce qui touche au bord de l'eau (ruban, îles, bas-fond, frange
// mouillée, clips de la vie de surface). UNE seule source par frame, et c'est la
// raison d'être de ces variables : si le ruban et le liseré évaluaient chacun leur
// sinus, le moindre écart de `now` entre deux appels décollerait le liseré du bord.
let waveAmp = 0, waveT = 0;
let waveArc = null, waveArcPts = null;      // abscisse curviligne des samples, en tuiles
let waveHwCache = null;                     // demi-largeurs visuelles de la frame

// Abscisse curviligne, cuite une fois par cours d'eau. Clé = l'IDENTITÉ du tableau
// de samples : un recompute de layout en crée un neuf (cf. `const riverSamples =
// []`), donc la comparaison suffit et ne peut pas servir une vieille géométrie —
// là où une clé temporelle (layoutRecomputeAt) aurait tourné pour rien.
function ensureWaveArc(pts) {
  if (waveArcPts === pts && waveArc && waveArc.length === pts.length) return waveArc;
  const a = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i += 1) {
    a[i] = a[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  waveArc = a; waveArcPts = pts;
  return a;
}

// Ouvre la frame : fige l'instant et l'amplitude. Appelée UNE fois, en tête de
// drawIsoRiver — tout ce qui suit dans la frame lit la même onde.
function beginWaveFrame(now, z) {
  const G = waveTune;
  waveT = (now || 0) / 1000;
  // Fleuve MORT pendant l'effondrement : ni tuile, ni grain, ni poisson, ni
  // liseré — donc pas de ressac non plus. (L'USURE, elle, ne coupe plus rien
  // depuis le 2026-07-27 : une cité usée reste une cité.)
  if (!G.on || !(G.amp > 0) || CM.collapseAt) { waveAmp = 0; return; }
  const k = Math.max(0, Math.min(1, (z - G.minZoom) / Math.max(1e-3, G.fullZoom - G.minZoom)));
  const rf = Math.max(0, Math.min(1, RAIN_TUNE.on ? (CM.rainF || 0) : 0));
  waveAmp = G.amp * k * (1 + G.rainAmp * rf);
}

// Demi-largeurs VISUELLES des deux rives pour la frame (lit peint + ressac), ou
// null quand l'onde est éteinte — les appelants retombent alors sur `p.hw` au bit
// près, ce qui garantit « molette off ⇒ exactement l'image d'avant ».
// Les tableaux sont RÉUTILISÉS d'une frame à l'autre : le ruban est reprojeté une
// demi-douzaine de fois par frame, en allouer deux à chaque fois ferait des
// centaines de ko/s de déchets pour un résultat identique.
function waveHalfWidths(pts) {
  if (waveAmp <= 0) return null;
  let c = waveHwCache;
  if (c && c.pts === pts && c.t === waveT && c.amp === waveAmp) return c;
  const n = pts.length;
  if (!c || c.plus.length !== n) {
    c = waveHwCache = {
      pts: null, t: -1, amp: -1,
      plus: new Float64Array(n), minus: new Float64Array(n),
      wetPlus: new Float64Array(n), wetMinus: new Float64Array(n),
    };
  }
  const arc = ensureWaveArc(pts);
  for (let i = 0; i < n; i += 1) {
    const hw = pts[i].hw;
    c.plus[i] = hw + waveAmp * waveReach(arc[i], waveT, 1);
    c.minus[i] = hw + waveAmp * waveReach(arc[i], waveT, -1);
    // La LAISSE : jusqu'où l'eau est montée récemment. Toujours ≥ la ligne d'eau
    // du moment (cf. waveWetReach), donc côté TERRE d'elle par construction.
    c.wetPlus[i] = hw + waveAmp * waveWetReach(arc[i], waveT, 1);
    c.wetMinus[i] = hw + waveAmp * waveWetReach(arc[i], waveT, -1);
  }
  c.pts = pts; c.t = waveT; c.amp = waveAmp;
  return c;
}

// Rives GAUCHE et DROITE du ruban, projetées à l'écran. Extrait de
// riverRibbonPath pour que le pavage de l'eau (drawIsoWaterTiles) puisse borner
// ses colonnes sur la vraie emprise du ruban, et pas sur sa boîte englobante.
// C'est aussi LE goulot du ressac : les sept appels du ruban dans une frame
// passent tous par ici, donc corps d'eau, nappe animée, voile, poissons, vie de
// surface et clips restent collés au bord de l'eau du moment sans un mot de plus.
// `mode` : 'wave' (le bord de l'eau du moment, défaut) ou 'wet' (la LAISSE,
// jusqu'où l'eau est montée récemment). Même vocabulaire que buildEdges et
// islandOutline — c'est ce qui permet de CLIPPER sur la laisse.
function riverRibbonScreen(pts, T, mode = 'wave') {
  const left = [], right = [];
  const wv = waveHalfWidths(pts);
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const o = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const hl = wv ? (mode === 'wet' ? wv.wetPlus[i] : wv.plus[i]) : p.hw;
    const hr = wv ? (mode === 'wet' ? wv.wetMinus[i] : wv.minus[i]) : p.hw;
    left.push(worldToScreen((p.x + nx * hl) * T, (p.y + ny * hl) * T));
    right.push(worldToScreen((p.x - nx * hr) * T, (p.y - ny * hr) * T));
  }
  return { left, right };
}
// Config de la vie de surface. ⚠ Elle passe DEUX FONCTIONS, et c'est ce qui la
// rend sûre ici : `riverRibbonPath` et `precipKind` sont des déclarations de
// fonction, donc hoistées — on peut les référencer avant leur ligne. Une `const`
// (NAV_STAGES l'a montré) serait en zone morte et jetterait au chargement.
configureRiverLife({ ribbonPath: riverRibbonPath, precipKind });

// Chemin du ruban d'eau, ÎLES COMPRISES.
//
// ⚠ Les îles sont des SOUS-CHEMINS SÉPARÉS, et tout consommateur doit donc
// remplir ou clipper en 'evenodd' (cf. WATER_FILL) : en règle nonzero, une île
// tracée dans le même sens que le ruban ne creuserait rien du tout et l'eau
// passerait par-dessus la terre. C'est le seul piège de ce fichier, et il est
// silencieux — l'image est juste « comme avant ».
//
// Le contour d'île est tracé en MONDE puis projeté point par point : une ellipse
// écran serait fausse, la projection iso écrase l'axe vertical de moitié et fait
// tourner les axes avec le cap du fleuve.
const WATER_FILL = 'evenodd';

// Contour d'une île en points ÉCRAN. Tracé en MONDE puis projeté point par
// point : une ellipse écran serait fausse, la projection iso écrase l'axe
// vertical de moitié et fait tourner les axes avec le cap du fleuve.
// Partagé par le chemin d'eau et le bas-fond, pour que la berge de l'île tombe
// exactement sur le bord de l'eau.
// `mode` : quelle des TROIS lignes de l'île tracer.
//   'wave' — le bord de l'eau du moment (le ruban et son clip)
//   'wet'  — la LAISSE, jusqu'où l'eau est montée récemment (frange humide)
//   'base' — le lit peint, fixe (le sable du rivage, qui ne bouge pas)
// Elles se confondent toutes les trois quand l'onde est éteinte.
function islandOutline(il, T, N = 30, mode = 'wave') {
  const out = [];
  // Le ressac fait aussi le tour des îles, en RONGEANT leur contour et jamais en
  // l'élargissant : une île est un TROU dans le ruban, donc « l'eau avance » s'y
  // dit « le trou rétrécit ». Même règle que les berges, même sûreté — l'herbe
  // bakée de l'île se fait recouvrir, jamais découvrir.
  const on = mode !== 'base' && waveAmp > 0;
  const reach = mode === 'wet' ? waveWetReachLoop : waveReachLoop;
  const rMid = (il.rx + il.ry) / 2, perim = 2 * Math.PI * rMid;
  // Phase propre à chaque île (sa position) : sans elle, les deux îles des bras du
  // fleuve battraient à l'unisson, ce qui se remarque tout de suite.
  const ph = on ? (il.x * 0.7 + il.y * 1.3) % (Math.PI * 2) : 0;
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const d = on ? waveAmp * islandWakeK(a) * reach(i / N, perim, waveT, ph) : 0;
    // Retrait MÉTRIQUE sur les deux axes (et non un facteur d'échelle) : l'Aiguille
    // fait rx 7,6 pour ry 2,4, une homothétie y creuserait trois fois plus dans le
    // sens du courant qu'en travers.
    const rx = Math.max(0.25, il.rx - d), ry = Math.max(0.25, il.ry - d);
    const al = Math.cos(a) * rx, cr = Math.sin(a) * ry;
    // Repère de l'île : `al` le long du courant, `cr` en travers.
    out.push(worldToScreen((il.x + al * il.tx - cr * il.ty) * T, (il.y + al * il.ty + cr * il.tx) * T));
  }
  return out;
}
const riverIslands = () => {
  const rv = CM.layout && CM.layout.river;
  return (rv && rv.islands) || null;
};

// `keep` : n'ouvre PAS un chemin neuf, ajoute le ruban à celui en cours. Sert au
// clip « côté TERRE » (rect plein + ruban en evenodd) du liseré de galets humides.
// `mode` : 'wave' (le bord de l'eau du moment) ou 'wet' (la LAISSE). Le second sert
// à BORNER la frange mouillée au terrain que la vague vient de découvrir.
function riverRibbonPath(ctx, pts, T, keep = false, mode = 'wave') {
  const { left, right } = riverRibbonScreen(pts, T, mode);
  if (!keep) ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  const isles = riverIslands();
  if (!isles) return;
  for (const il of isles) {
    const o = islandOutline(il, T, undefined, mode);
    ctx.moveTo(o[0].x, o[0].y);
    for (let i = 1; i < o.length; i += 1) ctx.lineTo(o[i].x, o[i].y);
    ctx.closePath();
  }
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
  ctx.clip(WATER_FILL);
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
  ctx.clip(WATER_FILL);
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
  // ── BANDE CALME (retour Raph 2026-07-30 : « le fleuve est trop bruyant ») ───
  // Les 8 frames du pack ne sont pas une vague qui avance, ce sont huit champs
  // de bruit indépendants : 48,6 % des pixels changent à CHAQUE transition, dont
  // 30,4 points dans le seul CORPS de l'eau, et PAS UN SEUL pixel n'est stable
  // sur le cycle. À worldPx = 2 un pixel de tuile fait ~1 px écran : l'œil ne
  // résout plus les formes, il ne perçoit que le clignotement → neige de télé.
  // Et aucun réglage n'en sort : la distance MINIMALE entre deux frames
  // quelconques est de 33 %, donc ni un fps plus bas ni un sous-ensemble de
  // frames ne calment quoi que ce soit — baisser le fps ne fait que ralentir le
  // bouillonnement, ce qui rend chaque saut plus visible, pas moins.
  //
  // La règle des tutos d'eau pixel art (Slynyrd « Water in Motion », Wolthera
  // « Animating Water Tiles ») : on n'anime PAS toute la surface, on FIGE le
  // corps et on ne fait bouger que les reflets. `scripts/calmWaterTiles.mjs`
  // recompose donc la bande — substrat gelé + seuls les éclats réimprimés,
  // frames réordonnées pour que les reflets se déplacent au lieu de sauter.
  // Mesuré : churn 48,6 % → 10,5 %, ton du fleuve inchangé (dérive 1/1/0).
  // A/B : window.__waterTiles.calm = false rejoue la bande d'origine (brute) —
  // et court-circuite du même coup les coloris d'état (cf. WATER_SHEETS).
  calm: true,
  fade: 1.2,            // secondes de fondu quand le fleuve change de coloris
  // DEUX AMBIANCES, interpolées par CM.rainF (le même signal que l'averse).
  // Retour Raph : sous la pluie l'eau sombre et agitée « c'était très bien », mais
  // il la veut CLAIRE et le clapot LENT par beau temps. `drawIsoRain` ne touche
  // pas l'eau — elle pose rgba(38,46,62) à 0,18 sur TOUT l'écran — donc ce qui
  // avait plu, c'est l'eau ASSOMBRIE : on rejoue ce voile dans le seul clip du
  // ruban, et on l'inverse au beau fixe.
  //   tint > 0 : voile ardoise rgba(38,46,62)  → eau sombre (aspect averse)
  //   tint < 0 : voile pâle rgba(158,184,192)  → eau claire (aspect beau temps)
  // Le pâle EST l'éclat de la tuile elle-même : impossible de dériver hors palette.
  // ⚠⚠ LA DÉRIVE EST LE SECOND BRUIT, ET ON NE LE VOIT QU'À L'ÉCRAN. La bande ne
  // dit que la moitié de l'histoire : la nappe DÉFILE aussi, et un motif à fort
  // contraste translaté d'une fraction de pixel fait BASCULER ses bords d'un ton
  // à l'autre (nearest-neighbor, règle du projet) — un scintillement de bord qui
  // ne se lit dans aucun PNG. Mesuré en jeu à zoom 0,55 sur 46 102 px de fleuve
  // visible, en comptant les pixels qui changent de plus de 20 de luminance en
  // une seconde, fond de scène déduit :
  //   dérive 0,7 → 0,5 → 0,2 → 0 : 26 024 / 10 063 / 7 156 / 4 632 px.
  // À 0,7 px monde/s la nappe met 46 s à parcourir une période : personne n'y lit
  // un sens de courant, mais tout le monde en voit le grésillement. On garde donc
  // juste un souffle de courant au beau fixe, et on met la vraie vitesse sous
  // l'averse — où l'eau DOIT s'agiter, et où Raph l'avait justement trouvée bien.
  fair: { fps: 1.8, drift: 0.2, tint: -0.10 },   // beau temps : claire, clapot posé
  rain: { fps: 4, drift: 1.2, tint: 0.18 },      // averse : sombre et agitée
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
// ── QUATRE CORPS D'EAU, UN PAR ÉTAT DE LA PARTIE ────────────────────────────
// Demande de Raph (2026-07-30) : le fleuve change de coloris selon ce que vit la
// cité — azur quand tout va bien, turquoise quand l'usure monte, bleu pâle en
// hiver, ardoise sous l'averse. Coloris NATIFS du pack (`bakeWaterTiles --native`)
// : ici la teinte EST l'information, la rabattre sur WATER la détruirait — c'est
// l'exception assumée à la règle « la texture ne déplace pas le ton du fleuve ».
//
// Chaque coloris porte TOUT ce qui doit s'accorder à lui, et pas seulement son
// PNG — sinon le fleuve change de couleur en laissant derrière lui un liseré et
// des reflets restés en ardoise (constaté en jeu le 2026-07-30) :
//   `pale`  la teinte la plus CLAIRE de la bande, celle que le voile de beau temps
//           (tint < 0) vient poser. Prise DANS la bande, sinon l'éclat ardoise de
//           l'ancienne planche désature l'azur.
//   `dim`   AJOUTÉ au tint (positif = plus sombre). Retour Raph « l'état normal est
//           un peu trop flashy en jeu » : l'azur natif est nettement plus vif que
//           la carte, et il recevait EN PLUS le voile pâle du beau temps (−0,10),
//           donc on l'éclaircissait encore. `dim` renverse ce voile et pose un
//           soupçon d'ardoise par-dessus. Les autres coloris restent à 0.
//   `shore` les 3 bandes du bas-fond, du halo doux au liseré vif (waterShoreTune).
//   `quay`  le bas-fond que trace le MUR DE QUAI (renderWorld drawRun) dès la
//           bande 2 : sans lui, faire suivre le liseré n'aurait rien changé aux
//           ères qui ont des quais, c'est-à-dire presque toutes.
//   `wash`  la teinte vers laquelle on tire les reflets nocturnes de la ville.
// Exportée : un coloris ajouté sans son accord complet ferait retomber le liseré
// en ardoise sans que rien ne proteste — c'est la table elle-même qu'on teste.
export const WATER_SHEETS = {
  beau: {
    src: '/pixelart/water/river-tiles-calm-azur.png', pale: '207,255,255', dim: 0.14,
    shore: ['96,175,250', '140,212,252', '206,242,255'],
    quay: ['rgba(120,190,235,0.50)', 'rgba(206,238,252,0.62)'], wash: '95,200,250',
  },
  usure: {
    src: '/pixelart/water/river-tiles-calm-turquoise.png', pale: '207,255,255', dim: 0,
    shore: ['74,190,175', '132,222,210', '206,248,242'],
    quay: ['rgba(110,200,188,0.50)', 'rgba(206,244,236,0.62)'], wash: '80,220,205',
  },
  hiver: {
    src: '/pixelart/water/river-tiles-calm-hiver.png', pale: '219,243,243', dim: 0,
    shore: ['140,168,214', '178,202,232', '224,240,248'],
    quay: ['rgba(160,186,214,0.50)', 'rgba(224,238,248,0.62)'], wash: '150,190,225',
  },
  // Ardoise : valeurs HISTORIQUES à l'identique (liseré validé le 2026-07-16,
  // bas-fond de quai d'origine) — ce coloris ne doit rien changer à l'existant.
  pluie: {
    src: '/pixelart/water/river-tiles-calm.png', pale: '158,184,192', dim: 0,
    shore: ['120,160,175', '150,192,205', '190,224,232'],
    quay: ['rgba(150,184,180,0.50)', 'rgba(202,224,214,0.62)'], wash: '150,190,205',
  },
  brute: {
    src: '/pixelart/water/river-tiles.png', pale: '158,184,192', dim: 0,
    shore: ['120,160,175', '150,192,205', '190,224,232'],
    quay: ['rgba(150,184,180,0.50)', 'rgba(202,224,214,0.62)'], wash: '150,190,205',
  },
};
// Molette des coloris : régler à chaud la teinte d'un corps d'eau et de tout ce qui
// s'y accorde, p.ex. `__waterSheets.beau.dim = 0.2` ou `.shore[2] = '210,240,255'`.
// ⚠ Posée APRÈS la table : un `window.x = WATER_SHEETS` écrit plus haut dans le
// module lève un ReferenceError de TDZ à l'import et tue tout le renderer.
if (typeof window !== 'undefined') window.__waterSheets = WATER_SHEETS;
// ── L'EAU SUIT LES ÈRES ─────────────────────────────────────────────────────
// Raph 2026-08-03 : « le fleuve garde le même bleu vif du néolithique à l'ère
// cosmique — au milieu des tours sombres il vire au bleu plastique ». Un cran
// d'ardoise par PALIER de bande, AJOUTÉ au tint comme le `dim` du coloris (même
// canal, mêmes deux chemins de rendu motif/tuiles) : le corps de l'eau se
// rabat, le liseré du bas-fond et le quai gardent leur éclat — c'est le
// contraste voulu d'une eau profonde. États DIRIGÉS, jamais d'interpolation
// libre (la règle des saisons vaut ici aussi). S'additionne uniformément à
// tous les coloris : l'averse reste plus sombre que le beau temps, l'usure
// reste turquoise — les rapports entre humeurs ne bougent pas. En dessous de
// la bande 5, zéro : l'azur validé des ères basses ne change pas d'un pixel.
// Molette : window.__waterEra (p.ex. __waterEra[0] = [9, 0.3]).
export const WATER_ERA_DIM = [
  [9, 0.34],   // cosmique : eau profonde, presque d'encre sous les tours
  [7, 0.22],   // futuriste : nettement rabattue
  [5, 0.10],   // industrielle/moderne : un voile discret
];
export function waterEraDim(band) {
  for (const [b, d] of WATER_ERA_DIM) if (band >= b) return d;
  return 0;
}
if (typeof window !== 'undefined') window.__waterEra = WATER_ERA_DIM;
// PRIORITÉ : averse > hiver > usure > beau fixe. La précipitation et la saison
// habillent TOUTE la scène (sol enneigé, voile de pluie) — un fleuve turquoise au
// milieu d'une carte blanche se lirait comme un bug, alors que l'usure, elle, se
// lit ailleurs (bâtiments, palette). Et l'averse ne peut pas entrer en conflit
// avec l'hiver : en hiver elle tombe en NEIGE (precipKind), donc `snow` coupe la
// branche pluie. Pure et exportée : c'est une table de décision, ça se teste.
export function waterBandKey({ rainF = 0, snow = false, winter = false, ruined = false, calm = true }) {
  if (!calm) return 'brute';
  if (!snow && rainF > 0.3) return 'pluie';
  if (winter) return 'hiver';
  if (ruined) return 'usure';
  return 'beau';
}
// Une entrée PAR BANDE, et non une seule remplacée au basculement : sinon
// chaque aller-retour d'A/B relance un chargement et le fleuve retombe à l'aplat
// le temps du décodage — de quoi faire conclure « la bande calme ne s'affiche
// pas » alors qu'elle n'est simplement pas encore prête. Ici c'est devenu
// indispensable : les coloris s'échangent en cours de partie.
// ⚠ CETTE ENTRÉE NE PORTE QUE L'IMAGE. Elle a d'abord recopié `pale` depuis la
// table, et le jour où `dim` est arrivé la recopie ne l'a pas suivi : le réglage
// existait, les tests passaient, et le rendu lisait `undefined`. Les teintes se
// lisent donc TOUJOURS dans WATER_SHEETS (via wb.cfg), jamais ici.
const waterSheets = new Map();            // clé -> { img, ready, frames }
function waterSheet(key) {
  const cfg = WATER_SHEETS[key] || WATER_SHEETS.pluie;
  let e = waterSheets.get(key);
  if (e) return e;
  if (typeof Image === 'undefined') return null;
  const im = new Image();
  // ⚠ L'entrée est capturée en LOCAL, jamais relue depuis la Map dans le
  // callback : deux chargements peuvent se croiser au basculement.
  e = { img: im, ready: false, frames: null };
  waterSheets.set(key, e);
  im.onload = () => { e.ready = true; };
  im.onerror = () => { e.ready = false; };   // PNG absent → fill WATER nu
  im.src = cfg.src;
  return e;
}
// FONDU ENTRE COLORIS. Un changement sec se verrait claquer sur toute la largeur
// du fleuve d'une frame à l'autre. On intègre donc la transition pas à pas —
// même raison que la phase (cf. ⚠⚠ PHASE ACCUMULÉE) : jamais de fonction du
// temps ABSOLU, sans quoi un changement d'état en plein fondu ferait sauter le
// mélange. Pure et exportée pour la même raison qu'elle : c'est la continuité
// qui compte, pas le dessin.
export function stepWaterBand(prev, t, key, fade) {
  const dt = prev.at < 0 ? 0 : Math.min(0.25, Math.max(0, t - prev.at));
  if (prev.key == null) return { key, from: key, mix: 1, at: t };
  // Nouvel état : on repart de la bande actuellement DOMINANTE. Si un fondu
  // était en cours, sa source est déjà largement recouverte — repartir d'elle
  // rendrait le nouveau fondu invisible.
  if (key !== prev.key) return { key, from: prev.mix < 0.5 ? prev.from : prev.key, mix: 0, at: t };
  return { key, from: prev.from, mix: fade > 0 ? Math.min(1, prev.mix + dt / fade) : 1, at: t };
}
let waterBand = { key: null, from: null, mix: 1, at: -1 };
let waterPreloaded = false;               // déclaré AVANT son lecteur (piège de TDZ)
// ── NAPPE EN MOTIF RÉPÉTÉ ────────────────────────────────────────────────────
// `createPattern` répète TOUTE l'image, pas un rectangle source : la frame
// courante de la bande doit donc vivre dans son propre canvas 16×16. Huit
// frames, cuites une fois pour la session (le contenu ne dépend que du PNG) et
// portées par l'entrée de bande, donc jamais mélangées entre les deux planches.
function waterFrameTile(sheet, fi) {
  const img = sheet.img;
  if (!sheet.frames) sheet.frames = new Array(WATER_FRAMES).fill(null);
  let c = sheet.frames[fi];
  if (c) return c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(WATER_TILE, WATER_TILE);
  else { c = document.createElement('canvas'); c.width = WATER_TILE; c.height = WATER_TILE; }
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, fi * WATER_TILE, 0, WATER_TILE, WATER_TILE, 0, 0, WATER_TILE, WATER_TILE);
  sheet.frames[fi] = c;
  return c;
}

// Coloris courant du fleuve — RÉSOLU UNE FOIS PAR FRAME, au tout début du dessin
// du fleuve, et publié sur CM pour tout ce qui doit s'y accorder (bas-fond du
// quai dans renderWorld, reflets nocturnes). Il ne peut pas vivre dans
// `drawIsoWaterTiles` : cette fonction ne s'exécute pas pendant un effondrement,
// or le liseré, lui, continue de se dessiner — il aurait gardé le coloris d'avant.
// ⚠ À n'appeler QU'UNE FOIS par frame : le fondu s'intègre pas à pas.
function waterBandNow(now) {
  const G = waterTilesTune, t = (now || 0) / 1000;
  // Météo : même signal que l'averse. ⚠ `captureFrame` force rainF à 0
  // (cityMapRuntime) — une mesure faite en capture ne voit JAMAIS le cas pluie.
  const rf0 = Math.max(0, Math.min(1, RAIN_TUNE.on ? (CM.rainF || 0) : 0));
  // EN HIVER l'averse tombe en NEIGE (cf. precipKind) : le ciel se couvre encore
  // un peu, mais un flocon ne CREUSE pas l'eau. On garde donc un tiers de l'effet
  // — sans quoi l'eau se mettait à claquer comme sous l'orage pendant qu'il neige.
  const snow = precipKind(CM.season, rf0) === 'snow';
  const key = waterBandKey({
    rainF: rf0, snow, winter: CM.season === WINTER, ruined: !!CM.frameRuined, calm: G.calm,
  });
  // En capture on force le fondu à son terme : une frame de synthèse doit être
  // reproductible, pas prise au milieu d'un mélange.
  let band;
  if (CM.capture) band = { key, from: key, mix: 1, at: t };
  else { waterBand = stepWaterBand(waterBand, t, key, G.fade); band = waterBand; }
  const cfg = WATER_SHEETS[band.key] || WATER_SHEETS.pluie;
  CM.waterShore = cfg;
  // PRÉCHARGE des autres coloris, une seule fois. Un coloris demandé pour la
  // première fois n'est pas décodé : `drawIsoWaterTiles` sort alors sur « image
  // non prête » et le fleuve retombe à l'aplat ardoise le temps du décodage. Le
  // fondu masque ce trou (l'ancienne bande tient l'écran), mais pas au tout
  // premier passage d'une partie. Quatre PNG de 2,7 ko : autant les tenir prêts.
  if (!waterPreloaded) { waterPreloaded = true; for (const k of Object.keys(WATER_SHEETS)) waterSheet(k); }
  return { band, cfg, rf0, snow, t };
}

function drawIsoWaterTiles(ctx, pts, T, z, now, wb) {
  const G = waterTilesTune;
  const { band, rf0, snow, t } = wb;
  // Diagnostic opt-in (globalThis.__waterSpanStats = true) : dit PAR QUEL
  // garde-fou la nappe est coupée. Éteint, coût nul (un test de drapeau).
  // Hors du bloc de cull, sinon __waterSpanCull = false le rendait muet.
  const sheet = waterSheet(band.key);
  const fromSheet = band.mix < 1 && band.from !== band.key ? waterSheet(band.from) : null;
  const dbg = globalThis.__waterSpanStats
    ? (sortie, extra) => {
      globalThis.__waterSpanStatsLast = {
        sortie, on: G.on, zoom: +z.toFixed(3), minZoom: G.minZoom, strength: G.strength,
        calm: !!G.calm, bande: band.key, depuis: band.from, mix: +band.mix.toFixed(2),
        image: !!sheet && !!sheet.ready, ...extra,
      };
    }
    : null;
  if (!G.on || z < G.minZoom || G.strength <= 0) { if (dbg) dbg('reglage'); return; }
  if (!sheet || !sheet.ready) { if (dbg) dbg('image non prete'); return; }
  const img = sheet.img;
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
  // `dim` du coloris : l'azur natif recevait le voile PÂLE du beau temps, donc on
  // l'éclaircissait encore alors qu'il était déjà trop vif (cf. WATER_SHEETS).
  // + le cran d'ÈRE (WATER_ERA_DIM) : l'eau se rabat aux bandes hautes.
  const tint = mix(G.fair.tint, G.rain.tint) + (wb.cfg.dim || 0)
    + waterEraDim(CM.layout && CM.layout.counts ? CM.layout.counts.eraBand | 0 : 0);
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
    const k = step / WATER_TILE;
    const paint = (sh, alpha) => {
      if (!sh || !sh.ready || alpha <= 0) return false;
      let pat = null;
      try {
        const tile = waterFrameTile(sh, fi);
        if (tile) pat = ctx.createPattern(tile, 'repeat');
      } catch { pat = null; }
      if (!pat) return false;
      pat.setTransform({ a: k, b: 0, c: 0, d: k, e: ox, f: oy });
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pat;
      riverRibbonPath(ctx, pts, T);
      ctx.fill(WATER_FILL);
      return true;
    };
    ctx.save();
    ctx.imageSmoothingEnabled = G.worldPx * z < 1;
    // FONDU : l'ancien coloris à plein, le nouveau par-dessus à `mix`. Le second
    // fill n'existe QUE pendant la transition (une seconde environ) — le reste du
    // temps on reste au fill unique qui avait fait tomber les 18 ms de GPU.
    const fade = !!fromSheet && fromSheet !== sheet;
    if (fade) paint(fromSheet, Math.min(1, G.strength));
    let ok = paint(sheet, Math.min(1, G.strength) * (fade ? band.mix : 1));
    if (!ok && fade) ok = true;               // le nouveau n'est pas décodé : l'ancien tient l'écran
    if (ok) {
      if (dbg) dbg('motif', { step: +step.toFixed(2), ox: +ox.toFixed(1), oy: +oy.toFixed(1), fondu: fade });
      if (tint !== 0) {
        ctx.globalAlpha = 1;
        const a = Math.min(1, Math.abs(tint)).toFixed(3);
        // Le voile clair est l'ÉCLAT DE LA BANDE elle-même : pris ailleurs, il
        // désaturerait l'azur avec le gris de l'ancienne planche ardoise.
        ctx.fillStyle = tint > 0 ? `rgba(38,46,62,${a})` : `rgba(${wb.cfg.pale},${a})`;
        riverRibbonPath(ctx, pts, T);
        ctx.fill(WATER_FILL);
      }
      ctx.restore();
      return;
    }
    ctx.restore();
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
  ctx.clip(WATER_FILL);
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
  // assombrir sous la pluie, éclat de la BANDE COURANTE pour éclaircir au beau
  // fixe (ce repli tuile à tuile ne fait pas de fondu : un seul coloris à la fois).
  if (tint !== 0) {
    ctx.globalAlpha = 1;
    const a = Math.min(1, Math.abs(tint)).toFixed(3);
    ctx.fillStyle = tint > 0 ? `rgba(38,46,62,${a})` : `rgba(${wb.cfg.pale},${a})`;
    riverRibbonPath(ctx, pts, T);
    ctx.fill(WATER_FILL);
  }
  ctx.restore();
  ctx.globalAlpha = prevA;
  ctx.imageSmoothingEnabled = prevS;
}

/* ── MOTIF RÉPÉTABLE DE LA MATIÈRE DE PLAGE ───────────────────────────────────
 * Retour Raph : « tu ne peux pas faire le liseré en texture de sable ? » — oui, et
 * c'est mieux qu'un aplat : le trait cesse d'être un trait, il devient la matière.
 *
 * ⚠ LE PIÈGE EST LA FORME DE LA TUILE. Les tuiles de sol sont des LOSANGES 64×32
 * aux quatre coins transparents : passée telle quelle à `createPattern`, la
 * répétition laisse un trou en losange à chaque angle. On recompose donc un carré
 * PLEIN en dessinant la même tuile cinq fois — au centre, puis décalée d'un
 * demi-pas dans les quatre diagonales : les voisins bouchent exactement les coins.
 * C'est la géométrie du pavage iso, pas une bidouille.
 *
 * Cuit une fois par (matière, saison). Le motif est ensuite posé à l'échelle du
 * zoom et ancré à worldToScreen(0,0), comme la nappe d'eau : la projection iso
 * étant affine, la texture translate exactement avec le monde au pan et au zoom.
 * ------------------------------------------------------------------------- */
let beachPatCache = null;               // { key, canvas }
function beachPatternCanvas() {
  const mat = ISO_TILE_KEYS[BEACH.mat] || 'iso-sand';
  const key = (CM.season === WINTER && isoWinterTile(mat)) || mat;
  if (beachPatCache && beachPatCache.key === key) return beachPatCache.canvas;
  const e = ensureIsoTileKey(isoVariantKey(key, 0));
  if (!e || !e.ready || !e.img) return null;
  const W = 64, H = 32;
  let c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(W, H);
  else { c = document.createElement('canvas'); c.width = W; c.height = H; }
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  for (const [ox, oy] of [[0, 0], [-32, -16], [32, -16], [-32, 16], [32, 16]]) g.drawImage(e.img, ox, oy);
  beachPatCache = { key, canvas: c };
  return c;
}
// Style de tracé de la plage : la texture si elle est décodée, sinon l'aplat au ton
// MESURÉ de la même matière (repli silencieux le temps du décodage).
function beachStrokeStyle(ctx, z) {
  const tone = beachTone(BEACH.mat);
  const canvas = beachPatternCanvas();
  if (canvas) {
    try {
      const pat = ctx.createPattern(canvas, 'repeat');
      if (pat) {
        const a = worldToScreen(0, 0);
        pat.setTransform({ a: z, b: 0, c: 0, d: z, e: a.x, f: a.y });
        return pat;
      }
    } catch { /* motif refusé : on garde l'aplat */ }
  }
  return rgb(tone, 1);
}

/* ── RIVAGE D'ÎLE : UN TRAIT, PAS DES CELLULES ────────────────────────────────
 * Raph, 2026-07-30 : « le contour n'est pas bien fait, on veut un joli contour
 * identique ». Deux essais par cellule ont échoué pour la même raison de fond :
 * l'Aiguille ne fait que 4,8 tuiles de large, donc son pourtour tient dans une à
 * deux cellules — à cette échelle la grille ne peut pas rendre une largeur
 * régulière. Tester le centre de la cellule donnait un POINTILLÉ ; tester la
 * cellule entière fermait bien l'anneau mais son épaisseur sautait de une à trois
 * cellules selon l'orientation locale du bord.
 *
 * On trace donc le contour LE LONG de l'ellipse (islandOutline, la même polyligne
 * que le ruban utilise pour percer son trou), clippé à l'intérieur de l'île, avec
 * une épaisseur DOUBLE : la moitié extérieure tombe dans l'eau et le clip la
 * retire, il reste exactement `islandW` tuiles de sable à l'intérieur, partout
 * pareil. C'est le seul endroit du rivage où un trait est justifié — et c'est
 * assumé : il est au CONTACT de l'eau, pas posé au milieu du sol, et il ne bouge
 * pas (les nappes vectorielles rejetées trois fois sur ce projet étaient toutes
 * animées et posées en plein sol).
 *
 * Le ton est celui MESURÉ de la matière (SAND_TONE / SHINGLE_TONE) : le grain de
 * la tuile est très fin (écart de 4,0 entre variantes), donc un aplat à la même
 * moyenne se lit comme elle à l'échelle d'un rebord d'une tuile.
 * ------------------------------------------------------------------------- */
/* ── L'EAU AUTOUR DU PÊCHEUR : CLAPOTIS, ET SON BANC DE POISSONS ──────────────
 * Raph, 2026-07-30 : « il faut qu'il ait des clapotis autour de lui et un sillage,
 * et à l'arrêt un petit banc de poissons qui tourne autour de son bateau ».
 *
 * Le sillage est rendu par la mécanique d'écume des bateaux (shipVisual, `wake`) ;
 * ici on pose les deux choses que le fleuve seul peut dire : l'eau qui clapote
 * contre la coque, et le banc qui vient tourner quand la ligne est à l'eau.
 *
 * ⚠ DESSINÉ AVANT LES BATEAUX (depuis drawIsoRiver, avec les ombres de poissons)
 * et non avec eux : un poisson passe SOUS la barque. Peint après, le banc lui
 * serait monté dessus — le même défaut de couche que les feuilles sur l'île.
 *
 * Le banc EST la pose : c'est lui qui la rend lisible. Retour de Raph avant celui-
 * ci : « je le vois tourner mais pas s'arrêter » — la barque s'immobilisait bien
 * (35 s toutes les ~90 s, mesuré) mais rien ne le SIGNALAIT à cette taille. Les
 * poissons arrivent et repartent en fondu autour de la pose : on ne voit plus un
 * bateau qui cesse d'avancer, on voit un pêcheur qui a trouvé son coin.
 *
 * Purement f(now) comme les ombres de poissons : aucune sim, aucun état, une
 * capture au même `now` redonne la même scène.
 * ------------------------------------------------------------------------- */
export const FISHER_WATER = {
  on: true, rings: 2, ringR: 0.62, ringA: 0.30, ringP: 2600,   // clapotis : nombre, rayon (tuiles), alpha, période (ms)
  school: 6, schoolR: 0.95, schoolA: 0.38, schoolP: 9000,      // banc : effectif, rayon, alpha, tour complet (ms)
  fade: 3.5,                                                    // s d'arrivée et de départ du banc
};
if (typeof window !== 'undefined') window.__fisherWater = FISHER_WATER;

function drawIsoFisherWater(ctx, T, z, now, wb) {
  const F = FISHER_WATER;
  if (!F.on || CM.lodActive || z < 0.5 || CM.collapseAt) return;
  const ships = CM.ships;
  if (!ships || !ships.length) return;
  const isles = riverIslands();
  const il = isles && isles[0];
  if (!il) return;
  const tone = (wb && wb.cfg && wb.cfg.shore) ? wb.cfg.shore[2] : '206,242,255';
  const t = (now || 0) / 1000;
  for (const sh of ships) {
    if (!sh.orbit) continue;
    const o = orbitPoint(il, sh.orbit.ang);
    const p = worldToScreen(o.x * T, o.y * T);
    const s = T * z;
    if (p.x < -s * 4 || p.x > CM.cw + s * 4 || p.y < -s * 4 || p.y > CM.ch + s * 4) continue;
    ctx.save();
    // Le sol iso est un losange 2:1 : tout ce qui est POSÉ À PLAT sur l'eau se
    // dessine en cercle puis s'écrase de moitié. Un vrai ovale calculé donnerait
    // le même résultat pour plus cher.
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.5);
    // ── CLAPOTIS : l'eau bat contre la coque, à l'arrêt comme en route ────────
    ctx.lineWidth = Math.max(1, z * 0.9);
    for (let i = 0; i < F.rings; i += 1) {
      // Anneaux DÉPHASÉS qui naissent au bordé et s'élargissent en s'effaçant.
      const k = ((t * 1000 / F.ringP) + i / F.rings) % 1;
      const r = s * F.ringR * (0.45 + k * 0.85);
      const a = F.ringA * (1 - k) * (sh.state === 'anchor' ? 1 : 0.55);
      if (a < 0.02) continue;
      ctx.strokeStyle = `rgba(${tone},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    // ── LE BANC : il ne vient QUE quand la ligne est à l'eau ──────────────────
    if (sh.state === 'anchor' && F.school > 0) {
      // Fondu sur la pose : `stateT` décompte le temps restant. Les poissons
      // arrivent, tournent, repartent — un banc qui apparaîtrait d'un coup se
      // lirait comme un défaut d'affichage.
      const reste = Math.max(0, sh.stateT || 0);
      const ecoule = FLEET_TUNE.orbitDwell - reste;
      const g = Math.max(0, Math.min(1, Math.min(ecoule, reste) / F.fade));
      if (g > 0.01) {
        const h0 = (cmHash('school:' + sh.id) >>> 0);
        for (let i = 0; i < F.school; i += 1) {
          const h = (h0 + i * 2654435761) >>> 0;
          // Chacun sa voie et son allure : un banc parfaitement régulier tourne
          // comme un manège, pas comme des poissons.
          const rr = s * F.schoolR * (0.62 + ((h >>> 3) % 100) / 220);
          const spd = 1 + ((h >>> 9) % 100) / 260;
          const ang = (t * 1000 / F.schoolP) * Math.PI * 2 * spd
            + (i / F.school) * Math.PI * 2 + ((h >>> 15) % 100) / 100;
          const fx = Math.cos(ang) * rr, fy = Math.sin(ang) * rr;
          // ⚠ MÊME ÉCHELLE QUE LES POISSONS DU FLEUVE (drawIsoFishShadows :
          // `T·z·0,18`). Le premier jet était à 0,085, soit la moitié — lisible
          // au cadrage serré de la vérif, et rigoureusement invisible au zoom où
          // l'on joue. Un banc qu'il faut zoomer pour voir ne signale aucune pose.
          const L2 = s * 0.15 * (0.8 + ((h >>> 21) % 100) / 250);
          ctx.fillStyle = `rgba(12,26,34,${(F.schoolA * g).toFixed(3)})`;
          // Cap TANGENT au cercle : un poisson qui tourne regarde où il va.
          ctx.save();
          ctx.translate(fx, fy);
          ctx.rotate(ang + Math.PI / 2);
          ctx.beginPath(); ctx.ellipse(0, 0, L2, L2 * 0.4, 0, 0, Math.PI * 2); ctx.fill();
          // Queue qui bat, comme les ombres de poissons du fleuve.
          const wag = Math.sin(t * 6.1 + i) * L2 * 0.3;
          ctx.beginPath(); ctx.ellipse(-L2 * 1.2, wag, L2 * 0.36, L2 * 0.2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }
}

/* ── ÉCUME DE PROUE : LE SILLAGE, MAIS VISIBLE ────────────────────────────────
 * La modulation d'amplitude autour du fuseau (islandWakeK) dit la bonne chose mais
 * ne vaut que quelques pixels au zoom de jeu. Ce qui se VOIT, c'est que l'eau
 * blanchit là où elle se brise : on repasse donc un liseré vif sur le seul arc
 * AMONT. Rien en aval — le calme de l'abri se lit par contraste, sans rien
 * dessiner, ce qui est la moitié gratuite de l'effet.
 *
 * Le trait est du même bois que le rivage d'île, et c'est ce qui le rend
 * admissible : il est AU CONTACT de la terre et de l'eau, pas posé en plein
 * courant. Les trois nappes vectorielles refusées sur ce projet (grain ×3,
 * vaguelettes) étaient toutes au milieu du fleuve.
 *
 * ⚠ PASSE À PART, ET C'EST LE FRUIT D'UN ÉCHEC. Écrite d'abord dans le bloc du
 * bas-fond des berges, elle n'a JAMAIS rien dessiné : ce bloc était alors gardé
 * par `waterShoreTune.islands`, à false à l'époque. Le drapeau est repassé à true
 * depuis, mais la passe RESTE à part, et pour une raison qui ne dépend pas de
 * lui : le sillage n'est pas un liseré de berge. Il ne suit qu'un ARC, il pulse
 * avec la houle, et sous le bloc des berges il hériterait de leurs tronçons de
 * quai et de leur épaisseur. Ne pas l'y replier en voyant le drapeau relevé.
 *
 * Il PULSE avec la houle qui arrive sur la pointe — MÊME valeur d'onde que le
 * contour au même endroit (u = 0,5, soit a = π) : l'écume monte exactement quand
 * l'eau monte. Deux horloges séparées se seraient vues tout de suite.
 * ------------------------------------------------------------------------- */
function drawIsoIslandWake(ctx, pts, T, z, wb) {
  const G = waveTune;
  if (waveAmp <= 0 || !(G.bow > 0) || CM.lodActive) return;
  const isles = riverIslands();
  if (!isles || !isles.length) return;
  const S = waterShoreTune;
  // Teinte du CORPS D'EAU COURANT, comme le reste des liserés : une écume restée
  // ardoise sous un fleuve azur se verrait comme un calque étranger.
  const tone = (S.follow !== false && wb && wb.cfg && wb.cfg.shore) ? wb.cfg.shore[2] : S.c3;
  ctx.save();
  riverRibbonPath(ctx, pts, T);
  ctx.clip(WATER_FILL);                      // la moitié terrestre du trait tombe
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, z * S.w3 * G.bowW);
  for (const il of isles) {
    const path = islandOutline(il, T);
    if (!path || path.length < 3) continue;
    const n = path.length - 1;               // contour FERMÉ : le dernier point = le premier
    const half = Math.max(1, Math.round(n * G.bowArc / 2));
    const mid = Math.round(n / 2);           // a = π, la pointe AMONT (cf. islandWakeK)
    const perim = 2 * Math.PI * ((il.rx + il.ry) / 2);
    const ph = (il.x * 0.7 + il.y * 1.3) % (Math.PI * 2);
    const puls = 0.45 + 0.55 * waveReachLoop(0.5, perim, waveT, ph);
    ctx.strokeStyle = `rgba(${tone},${(S.a3 * G.bow * puls).toFixed(3)})`;
    ctx.beginPath();
    for (let i = mid - half; i <= mid + half; i += 1) {
      const p = path[i];
      if (i === mid - half) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawIsoIslandShore(ctx, T, z) {
  if (!BEACH.on || BEACH.islandW <= 0) return;
  const isles = riverIslands();
  if (!isles || !isles.length) return;
  const w = Math.max(2, BEACH.islandW * T * z * 2);      // ×2 : la moitié part dans l'eau
  ctx.save();
  ctx.imageSmoothingEnabled = false;                     // pixel art NET, règle du projet
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = beachStrokeStyle(ctx, z);
  ctx.lineWidth = w;
  const trace = (path) => {
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
    ctx.closePath();
  };
  for (const il of isles) {
    // DEUX contours, et c'est tout le principe du ressac sur une île : le sable ne
    // bouge pas (il est tracé sur le contour FIXE), c'est l'eau qui le RONGE — le
    // clip, lui, suit le bord d'eau du moment. Tracer le sable sur le contour animé
    // aurait fait glisser tout le rivage avec l'onde : une plage qui respire au
    // lieu d'une eau qui monte. Et le clipper sur le contour fixe aurait repeint du
    // sable par-dessus l'eau montée, effaçant la vague à chaque frame.
    const clipPath = islandOutline(il, T);
    const sandPath = waveAmp > 0 ? islandOutline(il, T, undefined, 'base') : clipPath;
    if (!clipPath || clipPath.length < 3) continue;
    ctx.save();
    trace(clipPath);
    ctx.clip();                                          // le sable reste sur l'île, sous le bord d'eau
    trace(sandPath);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawIsoRiver(now) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  const T = CM.TILE, ctx = CM.ctx, z = CM.cam.zoom;
  const pts = rv.samples;
  // RESSAC : l'instant et l'amplitude de l'onde, figés pour toute la frame. ⚠ À
  // n'appeler QU'ICI et AVANT le premier tracé du ruban : tout ce qui borde l'eau
  // (ruban, îles, bas-fond, sable, vie de surface, reflets) lit cet état-là, et
  // deux évaluations décalées décolleraient le liseré du bord de l'eau.
  beginWaveFrame(now, z);
  // Coloris de l'état AVANT tout dessin : le liseré ci-dessous, le bas-fond du
  // quai (renderWorld) et les reflets nocturnes le lisent tous sur CM.
  const wb = waterBandNow(now);
  // Corps d'eau (ardoise).
  riverRibbonPath(ctx, pts, T);
  ctx.fillStyle = rgb(WATER, 1);
  ctx.fill(WATER_FILL);
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
    drawIsoWaterTiles(ctx, pts, T, z, now, wb);
    drawIsoWaterGrain(ctx, pts, T, z, now);
  }
  // Rivage des îles : par-dessus le sol baké (qui y peint l'herbe ou le sol de la
  // merveille), sous la frange humide qui viendra border l'eau.
  drawIsoIslandShore(ctx, T, z);
  // Sillage : par-dessus le rivage de sable (l'écume est DANS l'eau, elle passe
  // donc devant la grève) et sous la frange humide qui bordera le tout.
  drawIsoIslandWake(ctx, pts, T, z, wb);
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
    // ⚠⚠ L'EXCLUSION ÉTAIT UN BOOLÉEN GLOBAL POUR UN QUAI QUI, LUI, EST LOCAL.
    // Retour Raph 2026-07-30 (capture du port) : « il n'y a plus de quais ni de
    // liseré, ça fait une coupe nette ». Cause : `quayDrawsShore = band > maxB &&
    // !lod` supposait que dès qu'une ère a des quais, le quai dessine le bord de
    // l'eau PARTOUT. Faux. `ensureQuayGate` le COUPE EXPRÈS sur l'emprise du port
    // (« sa scène pose son propre front d'eau »), là où le fleuve est trop étroit
    // pour un mur, et sur les 3 premiers/derniers samples. Mesuré sur une démo
    // d'ère 7 : 4 samples coupés au port (≈ 4,5 tuiles de berge) + 3 à chaque
    // bout — et sur ces tronçons PERSONNE ne dessinait le bord d'eau, ni quai, ni
    // bas-fond, ni roseaux (le rendu iso n'en a pas). Il ne restait que le bord
    // peint du ruban : un pixel. Le trou existait avant les coloris ; une eau
    // ardoise contre une berge grise ne le montrait pas, l'azur l'a révélé.
    //
    // On reprend donc la main TRONÇON PAR TRONÇON, sur le complément exact du
    // masque que le quai va utiliser (publié par ensureQuayGate, cf. quayGapRuns).
    const maxB = S.maxBand != null ? S.maxBand : 1;
    const ruined = !!CM.collapseAt;
    const quayEra = bandW > maxB;
    const tout = [[0, len0 - 1]];
    let runsPlus, runsMinus;
    if (ruined) {
      // Fleuve mort : comportement d'avant à l'identique. L'eau morte n'a ni tuile
      // ni grain, un liseré clair la ferait paraître vivante.
      runsPlus = runsMinus = quayEra ? [] : tout;
    } else if (!quayEra || !quayWallTune.on || (CM.lodActive && S.lodFallback)) {
      // Aucun quai (ère de campement, molette coupée) ou quai qui lâche son
      // bas-fond au dézoom : le ruban porte tout.
      runsPlus = runsMinus = tout;
    } else if (CM.lodActive) {
      runsPlus = runsMinus = [];               // lodFallback coupé : on ne reprend pas la main
    } else {
      ensureQuayGate();
      const g = CM.quayGate;
      runsPlus = quayGapRuns(g && g.drawPlus, len0);
      runsMinus = quayGapRuns(g && g.drawMinus, len0);
    }
    // ÎLES : aucun quai ne les borde, donc rien ne leur dispute le bord de l'eau,
    // et elles entrent d'un seul morceau. Le drapeau `islands` (cf. le réglage)
    // dit s'il faut leur donner le bas-fond bleu — il a fait l'aller-retour en un
    // jour, l'histoire est racontée là-bas.
    const islandsOn = S.islands !== false && (!ruined || !quayEra);
    const shoreOn = S.on && (runsPlus.length > 0 || runsMinus.length > 0 || islandsOn);
    const nAt = (i) => { const o = pts[Math.max(0, i - 1)], q = pts[Math.min(len0 - 1, i + 1)]; let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; return { nx: -ty / tl, ny: tx / tl }; };
    if (shoreOn) {
      // Les deux rives décalées, projetées UNE SEULE FOIS. Avant, chacune des
      // trois bandes rejouait la même projection (nAt + worldToScreen sur tous
      // les échantillons) : six parcours complets du ruban par frame.
      // Chaque bord porte SES tronçons : les deux rives sont découpées par le
      // masque du quai, les îles sont d'un seul morceau.
      // TROIS jeux de rives depuis le RESSAC : le BORD D'EAU DU MOMENT (qui porte
      // le bas-fond — il EST l'eau, il monte avec elle), la LAISSE (jusqu'où l'eau
      // est montée récemment : c'est là que va la frange mouillée, pour qu'elle
      // reste sur le sable quand la vague se retire) et le LIT PEINT, fixe, réservé
      // au SABLE sec. Le sable ne bouge pas :
      // sa bande reste sur le lit peint et c'est le ruban, animé, qui la ronge par
      // son clip quand la vague monte. Coller le sable au bord de l'eau aurait fait
      // glisser toute la plage avec l'onde — une plage qui respire au lieu d'une eau
      // qui monte. Onde éteinte : les deux jeux sont identiques et on n'en bâtit
      // qu'un (`edgesBase = edges`), donc pas un projeté de plus qu'avant.
      const wv = waveHalfWidths(pts);
      // `mode` : 'wave' (bord de l'eau), 'wet' (la LAISSE) ou 'base' (le lit peint).
      // `withIslands` — ⚠ DEUX RÉGLAGES DISTINCTS SE PARTAGEAIENT UN SEUL DRAPEAU.
      // Quand `S.islands` est passé à false pour retirer le BAS-FOND BLEU autour
      // de l'île, il a coupé du même coup la bande de sable et la FRANGE HUMIDE,
      // qui ne sont ni de la même couleur ni du même côté de la ligne d'eau —
      // d'où une île découpée au couteau. Le bas-fond passe donc `islandsOn`, la
      // plage passe `true` en dur.
      // Le drapeau est repassé à true depuis, si bien que les deux chemins
      // coïncident aujourd'hui : NE PAS EN CONCLURE que la séparation est morte.
      // C'est elle qui garantit qu'un futur retrait du bleu ne remmènera pas le
      // sable avec lui. Elle ne se voit que le jour où le drapeau retombe.
      const buildEdges = (mode, withIslands = islandsOn) => {
        const out = [];
        [1, -1].forEach((sgn, si) => {
          const runs = si ? runsMinus : runsPlus;
          if (!runs.length) return;
          const path = [];
          for (let i = 0; i < len0; i += 1) {
            const p = pts[i], n = nAt(i);
            // ⚠ `si = 0` ↔ `sgn = +1` ↔ rive `plus` : même convention de signe que
            // riverRibbonScreen (left = +n). L'inverser décollerait le liseré du
            // bord de l'eau d'un côté sur deux, et seulement quand l'onde est haute.
            const hw = (mode === 'base' || !wv) ? p.hw
              : mode === 'wet' ? (si ? wv.wetMinus[i] : wv.wetPlus[i])
                : (si ? wv.minus[i] : wv.plus[i]);
            path.push(worldToScreen((p.x + sgn * n.nx * hw) * T, (p.y + sgn * n.ny * hw) * T));
          }
          out.push({ path, runs });
        });
        // La BERGE D'UNE ÎLE est une rive comme les autres : elle reçoit le même
        // bas-fond. Sans ça, l'île se découpait au couteau dans l'eau — un ovale
        // posé sur le fleuve au lieu d'une terre qui en émerge. Le clip en
        // 'evenodd' garde la moitié du trait qui tombe dans l'eau, exactement
        // comme pour les rives.
        if (withIslands) {
          for (const il of (riverIslands() || [])) {
            const path = islandOutline(il, T, undefined, mode);
            if (path && path.length > 1) out.push({ path, runs: [[0, path.length - 1]] });
          }
        }
        return out;
      };
      const edges = buildEdges('wave');
      const shore = (color, width, set = edges) => {
        ctx.strokeStyle = color; ctx.lineWidth = width;
        for (const e of set) {
          for (const [a, b] of e.runs) {
            if (b <= a) continue;
            ctx.beginPath();
            ctx.moveTo(e.path[a].x, e.path[a].y);
            for (let i = a + 1; i <= b; i += 1) ctx.lineTo(e.path[i].x, e.path[i].y);
            ctx.stroke();
          }
        }
      };
      ctx.save();
      riverRibbonPath(ctx, pts, T);
      ctx.clip(WATER_FILL);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // A/B utilisable EN PRODUCTION (globalThis.__waterShoreMerge = false),
      // comme __waterSpanCull : la molette __waterShore, elle, est gardée par
      // import.meta.env.DEV et n'existe pas dans le .exe — or c'est justement
      // là que le lag se reproduit. Pour RÉGLER l'aspect (lodW/lodA/lodC),
      // passer par `npm run dev`.
      // Teintes DU CORPS D'EAU COURANT (cf. waterShoreTune.follow) : le bas-fond
      // est la même eau en moins profond, il ne peut pas rester ardoise sous un
      // fleuve azur. Repli sur les c1/c2/c3 du réglage si `follow` est coupé.
      const sc = (S.follow !== false && wb.cfg.shore) ? wb.cfg.shore : [S.c1, S.c2, S.c3];
      if (S.lodMerge && CM.lodActive && globalThis.__waterShoreMerge !== false) {
        // AU DÉZOOM : UN SEUL TRAIT. Les trois bandes (18/10/4,5 × zoom) se
        // réduisent alors à 6,3 / 3,5 / 1,6 px : elles se confondent à l'œil en
        // une seule lisière claire, mais coûtent toujours six traits pleine
        // longueur DANS UN CLIP — et ce, précisément quand le LOD vient de les
        // rallumer (le quai cesse de tracer son bas-fond, cf. quayDrawsShore).
        // On garde donc la lecture du bord clair — demandée « tout le temps »
        // le 2026-07-22 — pour un tiers du tracé. Réglable à chaud :
        // window.__waterShore({ lodMerge, lodW, lodC, lodA }).
        // lodC EST la teinte vive du liseré (= c3) : elle suit donc le coloris
        // comme les trois autres, sinon le dézoom ramènerait l'ardoise.
        const lc = (S.follow !== false && wb.cfg.shore) ? sc[2] : S.lodC;
        shore(`rgba(${lc},${S.lodA})`, Math.max(2, z * S.lodW));
      } else {
        shore(`rgba(${sc[0]},${S.a1})`, Math.max(3, z * S.w1));   // bas-fond large et doux
        shore(`rgba(${sc[1]},${S.a2})`, Math.max(2, z * S.w2));   // eau peu profonde
        shore(`rgba(${sc[2]},${S.a3})`, Math.max(1, z * S.w3));   // liseré clair au bord
      }
      ctx.restore();
      // ── GALETS HUMIDES, CÔTÉ TERRE ──────────────────────────────────────────
      // Ce qui fait lire une plage comme une plage : galets secs → galets MOUILLÉS
      // → eau. La matière sèche est bakée par cellule (kind 'shingle') ; cette
      // frange-ci ne peut pas l'être, parce que c'est exactement au ras de l'eau
      // que l'alignement sur la grille se verrait. Un trait est ici le bon outil :
      // mince, il suit la spline, et il est au CONTACT de l'eau — pas posé au
      // milieu du sol, là où une nappe vectorielle sur du pixel art a déjà été
      // rejetée trois fois.
      //
      // Clip « côté terre » : rectangle plein + le ruban (îles comprises) en
      // evenodd → l'intérieur du fleuve est retiré, l'intérieur des îles rendu.
      // La moitié intérieure du trait tombe donc dans l'eau et disparaît, et il ne
      // reste que la lisière mouillée sur la berge. Même géométrie, mêmes tronçons
      // que le bas-fond : les deux franges se répondent au pixel.
      if (BEACH.on && BEACH.wet > 0 && !CM.lodActive) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, CM.cw, CM.ch);
        riverRibbonPath(ctx, pts, T, true);
        ctx.clip(WATER_FILL);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // Les deux jeux de rives de la PLAGE, bâtis UNE fois. Ils portent les
        // îles même quand le bas-fond bleu ne les porte pas, donc ils ne peuvent
        // pas réutiliser `edges` — mais rien n'oblige à les reconstruire à
        // chaque trait, et le ruban est déjà le goulot de la frame.
        const edgesSand = buildEdges('base', true);
        const edgesWet = wv ? buildEdges('wet', true) : edgesSand;
        // BANDE DE SABLE, en TEXTURE (Raph : « tu ne peux pas faire le liseré en
        // texture de sable ? »). Même géométrie et mêmes tronçons que le bas-fond,
        // mais de l'autre côté de la ligne d'eau : elle suit la spline au pixel, là
        // où les cellules bakées de la berge s'arrêtent en escalier. Les deux se
        // complètent — les cellules donnent la profondeur vers l'intérieur, la
        // bande donne le bord net contre l'eau. Épaisseur DOUBLE : la moitié qui
        // tombe dans le fleuve est retirée par le clip.
        if (BEACH.bankBand > 0) {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          // SUR LE LIT PEINT, pas sur le bord d'eau du moment (cf. les deux jeux de
          // rives plus haut) : la grève est fixe, c'est la vague qui la recouvre.
          // Le clip côté terre, lui, est bien celui du ruban ANIMÉ — d'où la bande
          // qui s'amincit quand l'onde monte et se rouvre quand elle redescend.
          shore(beachStrokeStyle(ctx, z), Math.max(2, BEACH.bankBand * T * z * 2), edgesSand);
          ctx.restore();
        }
        // Frange mouillée : elle suit la MATIÈRE, donc la même règle de neige que
        // le sable sec au-dessus d'elle — sinon la grève reste sable et sa lisière
        // d'eau vire au gris d'hiver, ce qui se lit comme une bande étrangère.
        const wt = (CM.season === WINTER && BEACH.snow) ? BEACH.wetWinter
          : (BEACH.wetTone[BEACH.mat] || BEACH.wetTone.shingle);
        // ── SUR LA LAISSE, ET NON SUR LA LIGNE D'EAU ───────────────────────────
        // Demande de Raph : « laisser un liseré sombre quand les vagues reviennent
        // dans l'eau ». Collée au bord de l'eau, cette frange montait et
        // redescendait AVEC la vague : elle ne marquait donc jamais rien. Posée sur
        // la laisse — jusqu'où l'eau est montée dans les dernières secondes — elle
        // se DÉCROCHE quand l'onde se retire, reste sur le sable, et sèche.
        //
        // Le trait est CENTRÉ sur la laisse et large de `wetW` : à l'échelle où ça
        // se joue (l'écart entre l'eau et la laisse plafonne à ~4 px au zoom de
        // jeu), il couvre le sable mouillé sans qu'on ait besoin d'un polygone
        // entre les deux courbes — lequel coûterait un remplissage de plus par
        // rive pour un résultat indiscernable.
        // Îles COMPRISES (dernier argument) : c'est la frange que Raph veut voir
        // border l'île, et elle est indépendante du bas-fond bleu qu'il a fait
        // retirer — sable mouillé côté terre contre bleu clair côté eau.
        //
        // ── ⚠ BORNÉE PAR LA LAISSE : JAMAIS DEVANT LA VAGUE ────────────────────
        // Retour Raph : « le liseré sombre ne doit pas s'avancer devant la vague,
        // juste être sur le retrait de celle-ci ». Le trait est CENTRÉ sur la
        // laisse, donc sa moitié terrestre débordait au-delà — sur du sable que
        // l'eau n'avait jamais atteint. Il se lisait comme une bande sombre qui
        // PRÉCÈDE l'onde au lieu de marquer ce qu'elle vient de quitter.
        //
        // On ajoute donc un second clip, le ruban de la LAISSE. L'intersection
        // avec le clip côté terre (le ruban de l'eau DU MOMENT) ne laisse
        // exactement que la bande découverte : entre la ligne d'eau et la laisse.
        // Elle s'ouvre quand l'onde se retire, se referme quand l'onde remonte —
        // et disparaît quand l'eau est à son plus haut, ce qui est juste : il n'y
        // a alors plus de sable mouillé à voir.
        //
        // Vaut pour les ÎLES par la même construction : leur contour de laisse est
        // un trou du même chemin, donc l'intersection y donne l'anneau entre les
        // deux lignes. Onde éteinte (`wv` nul), les deux rubans se confondent et
        // le clip viderait tout : on garde alors l'ancien tracé, non borné.
        if (wv) {
          ctx.save();
          riverRibbonPath(ctx, pts, T, false, 'wet');
          ctx.clip(WATER_FILL);
          shore(`rgba(${wt},${BEACH.wet})`, Math.max(2, z * BEACH.wetW), edgesWet);
          ctx.restore();
        } else {
          shore(`rgba(${wt},${BEACH.wet})`, Math.max(2, z * BEACH.wetW), edgesWet);
        }
        ctx.restore();
      }
    }
  }
  // OMBRES DE POISSONS : sous les reflets (dessinées AVANT les vaguelettes).
  drawIsoFishShadows(ctx, rv, T, z, now);
  // Clapotis du pêcheur et son banc : même couche que les poissons du fleuve —
  // sous la surface, donc SOUS les coques (les bateaux passent bien après).
  drawIsoFisherWater(ctx, T, z, now, wb);
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
// ── POINTS D'EAU (ex-aqueducs) ──────────────────────────────────────────────
// 🚫 L'AQUEDUC-STRUCTURE A ÉTÉ RETIRÉ le 2026-08-05, ART COMPRIS. Vivait ici un
// rendu 3-slice (start → mid ×N → end, posé par cisaillement sur l'axe long,
// une tranche par tuile pour le tri peintre) alimenté par 4 stades de PNG.
// Motif : la conduite longeait la berge et puisait dans le fleuve d'à côté
// (« ça n'est pas logique »), et son art avait déjà été refusé 5 fois. Le pavé
// qui fait foi est celui de cmWaterPointCount, dans layout.js — le lire avant
// toute tentative de résurrection.
//
// Le bâtiment se lit désormais en POINTS D'EAU semés dans la ville, et on ne
// dessine RIEN ici : chacun devient un item `plazaProp`, donc c'est le KIT DES
// PLACES qui s'en charge (même art, même ancrage sur l'ENCRE mesurée, même
// ombre douce, même découpe des halos). Un item par point → chacun trie à SA
// profondeur, sans le moindre cas particulier dans le peintre.
//
// L'objet est un PUITS et non une fontaine : la fontaine est la pièce maîtresse
// de la place, la banaliser en la semant partout lui ferait perdre son rang. En
// attendant l'art dédié, LEGACY_PROP fait retomber le puits sur la fontaine du
// kit top-down (cf. isoPlaza.js), era-correcte dans les 5 ères.
//
// Ère : même échelle que les places, PLUS un cran primitif — les places
// n'existent qu'à partir du band 2, mais les aqueducs s'achètent dès le début.
const waterPointEra = (band) => (band >= 7 ? 'cosmic' : band >= 6 ? 'modern'
  : band >= 5 ? 'industrial' : band >= 4 ? 'medieval' : band >= 2 ? 'antique' : 'primitive');
// Hauteur en `p` = MULTIPLES DE LA HAUTEUR D'UN HABITANT, exactement comme le
// mobilier des places — et surtout PAS en tuiles. C'est la règle du kit : ancré
// sur autre chose, un prop ne suit plus quand l'échelle des habitants bouge, et
// la ville se met à enfler à vue d'œil. Repère : l'habitant ≈ 1,70 m, donc 1.15
// ≈ 1,95 m — un puits couvert dont la margelle arrive à la taille.
// 📏 TOUJOURS SOUS LA FONTAINE DE PLACE, qui va de 1.25 à 2.60 p. C'est ce qui
//    garde la hiérarchie : la fontaine est la pièce maîtresse du forum, le puits
//    est un point d'eau de quartier. Les rapprocher les banaliserait tous les deux.
// ⚠ `p` cote l'ENCRE ENTIÈRE du sprite, pas l'objet qu'on a en tête. Le puits
// primitif porte un CHEVALET : son encre monte bien plus haut que sa margelle, et
// le coter comme une margelle l'écraserait au ras du sol. La règle qui a servi ici,
// et la seule à réappliquer si l'art change : `p` = hauteur RÉELLE de l'objet en
// mètres ÷ 1,70. Chaque valeur ci-dessous vient de la silhouette effectivement
// livrée, pas d'une intention.
// 🚫 La suite n'est PAS croissante, et c'est voulu : ce ne sont pas six états d'un
//    même objet qui grandirait, mais six objets différents. Une borne à boire
//    moderne EST plus basse qu'un chevalet de puits médiéval. (C'est la fontaine de
//    place, elle, qui doit croître strictement — cf. RECIPES dans isoPlaza.)
const WATER_POINT_P = {
  primitive: 1.15,    // chevalet : deux montants + traverse       ≈ 1,95 m
  antique: 0.68,      // bassin de rue + pilier à bec              ≈ 1,15 m
  medieval: 0.85,     // margelle + treuil sur montants courts     ≈ 1,45 m
  industrial: 0.94,   // colonne de pompe en fonte sur son socle   ≈ 1,60 m
  modern: 0.62,       // borne à boire, hauteur de taille          ≈ 1,05 m
  cosmic: 0.76,       // monolithe + vasque basse                  ≈ 1,30 m
};
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
// Végétation de l'île (cf. son bloc dans drawIsoLive). `rMin/rMax` sont des rayons
// NORMALISÉS de l'ellipse : le tiers central est laissé à la merveille.
// Molette : window.__islandDeco.
export const ISLAND_DECO = { on: true, count: 9, rMin: 0.5, rMax: 0.88, size: 0.3 };
if (typeof window !== 'undefined') window.__islandDeco = ISLAND_DECO;

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
  // S5 : la définition a migré dans layout.js (`cmCellNoise`) pour que les arbres de
  // VILLE s'en servent aussi — ils étaient tirés au hash par cellule, donc en
  // confettis, alors que la forêt lisait déjà en fourrés grâce à ce même bruit.
  // Une seule définition, un seul grain ; la copie locale a été retirée.
  const cellNoise = cmCellNoise;
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

// ── Pose du sprite de coque, SOURCE UNIQUE ──────────────────────────────────
// Le sprite est dessiné 1,15× plus large que l'unité qui sert aux feux de
// position, et son bord haut est à 0,58 de largeur au-dessus du centre de coque.
// Ces deux nombres sont exportés parce que le calibrage (navCalib.js) doit
// convertir un clic SUR LE SPRITE en (mast, beam) : s'ils divergeaient, l'outil
// mesurerait une chose et le rendu en dessinerait une autre.
export const BOAT_IMG_K = 1.15;
export const BOAT_IMG_TOP = 0.58;

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
// ÉCRÊTAGE DE LA FLOTTE (chantier ÉCHELLE, Lot A — docs/PLAN-ECHELLE.md §A1).
// Historique : container 3.2, cosmique 4.0/4.8/5.6 — le vaisseau bande 9 faisait
// 4,5 tuiles, ~70 % de la masse du plus haut bâtiment : c'est lui qui « rapetissait »
// la ville. Et à 0.7×5.6 = 3,9 tuiles de coque, il ne TENAIT plus dans la passe
// navigable du pont (3,4 tuiles, cf. bridgeTune.passHalf). Table ÉCRÊTÉE mais
// MONOTONE : un cargo ne doit jamais rétrécir en montant d'ère (steam 2.4 →
// container 2.6 → cosmique 2.8/3.0/3.2). Le plus gros fait 0.7×3.2 = 2,24 tuiles
// de coque — pile le gabarit pour lequel la passe a été cotée.
// Le pêcheur ne passe pas par cette table : sa gonflette (sizeMul 1.3, cf.
// shipVisual) est le cas « petite silhouette illisible », pas celui qui écrase
// la ville — et le plaisancier a quitté le fleuve (retrait 2026-07-30).
// Molette live : window.__fleetScale (objet muté, la flotte n'est pas bakée).
const FLEET_SCALE = { raft: 1.36, sail: 1.8, steam: 2.4, container: 2.6, cosmic7: 2.8, cosmic8: 3.0, cosmic9: 3.2 };
if (typeof window !== 'undefined') window.__fleetScale = FLEET_SCALE;
function tradeSizeMul(stage, band) {
  return stage === 'cosmic' ? (band >= 9 ? FLEET_SCALE.cosmic9 : band >= 8 ? FLEET_SCALE.cosmic8 : FLEET_SCALE.cosmic7)
    : FLEET_SCALE[stage] || FLEET_SCALE.raft;
}
// 🚫 LE PLAISANCIER A ÉTÉ RETIRÉ (Raph, 2026-07-30) — ses trois âges (rames,
// voilier, vedette), sa dérive d'une berge à l'autre et son art calibré face par
// face. Le fleuve est plus lisible sans lui : il raconte le TRAVAIL, le port qui
// charge et l'homme qui pêche, et un promeneur y ajoutait du mouvement sans y
// ajouter de sens. Ne pas le reproposer.
// Les sprites (boat-rowboat / dinghy / motorboat) et leur relevé de feux restent
// sur le disque et dans le roster : la génération est payée, le retour arrière ne
// coûterait qu'un budget à rouvrir dans riverFleet.

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

// Ancrage des feux PAR STADE, en fraction de la largeur du sprite (donc
// indépendant du zoom). Une valeur unique pour toute la flotte ne peut pas être
// juste : le mât d'un voilier, la passerelle d'un vapeur et le roof-bar d'une
// vedette ne sont pas à la même hauteur, et les coques n'ont pas la même largeur
// utile dans leur cadre de 85 px.
// QUATRE valeurs, pas deux — chaque feu se pose LIBREMENT sur le sprite :
//   mast  = élévation commune au-dessus du centre de coque (verticale écran) ;
//   beam  = demi-écartement travers, signé (bâbord d'un bord, tribord de l'autre) ;
//   foreP = avance du feu BÂBORD le long de l'axe du bateau ;
//   foreS = avance du feu TRIBORD.
//
// ⚠ Les deux `fore` ont été ajoutés après coup : sans eux, les feux étaient
// cloués sur l'axe central du bateau et le clic de calibrage ne comptait que sa
// hauteur. « Ça ne marche que sur la même ligne du milieu ? » (Raph). Un feu de
// mât et un feu de poupe ne sont pas à la même avance, et sur une coque longue
// comme un porte-conteneurs la différence saute aux yeux.
//
// L'élévation reste VERTICALE à l'écran quand le bateau tourne, tandis que
// `fore` et `beam` suivent le cap : c'est ce qui garde le rouge à gauche du
// marin quelle que soit sa route.
// Se calibre AU CLIC : `__navCalib()`, un clic par feu, n'importe où sur le
// sprite. `__navAnchor(stage, {...})` règle à chaud.
const NAV_ANCHOR_DEFAULT = { mast: 0.30, beam: 0.16, foreP: 0, foreS: 0 };
// (Ni raft ni rowboat : ils ne s'allument pas, cf. NAV_DARK. Leur laisser un
// ancrage aurait entretenu l'idée qu'ils portent des feux.)
// Relevé de Raph au calibreur (2026-07-30), sur la vue de PROFIL. Sert de repli
// pour toute face que NAV_UV ne couvre pas encore.
const NAV_ANCHOR = {
  sail: { mast: 0.487, beam: 0.001, foreP: 0.009, foreS: 0.029 },
  steam: { mast: 0.054, beam: 0.051, foreP: -0.465, foreS: -0.467 },
  container: { mast: 0.136, beam: 0.011, foreP: -0.440, foreS: -0.462 },
  dinghy: { mast: 0.520, beam: 0.001, foreP: 0.014, foreS: 0.029 },
  motorboat: { mast: 0.144, beam: 0.015, foreP: 0.201, foreS: 0.203 },
};
export function navAnchorFor(stage) { return NAV_ANCHOR[stage] || NAV_ANCHOR_DEFAULT; }
if (typeof window !== 'undefined') {
  window.__navAnchor = (stage, o) => {
    if (stage && o) NAV_ANCHOR[stage] = { ...navAnchorFor(stage), ...o };
    return stage ? navAnchorFor(stage) : { ...NAV_ANCHOR };
  };
}

// Coques qui ne portent AUCUN feu. Ce n'est pas un détail de rendu mais une
// règle de monde, et elle a deux motifs distincts :
//   • le pêcheur est à l'ancre, hors des règles de route ;
//   • un radeau de rondins et une barque à rames n'ont rien pour en porter —
//     pas de mât, pas de bord franc, et surtout aucune ère où ça aurait un sens
//     (Raph, 2026-07-29). Un feu de position sur un rafiot primitif faisait
//     mentir toute la ligne du temps que la flotte raconte par ailleurs.
// Clé = le STADE de la coque (raft, sail, rowboat…), pas le métier : c'est la
// coque qui décide, et un même métier en traverse plusieurs.
const NAV_DARK = new Set(['fisher', 'raft', 'rowboat']);
export function boatHasNavLights(stage) { return !NAV_DARK.has(stage); }

// Les stades à CALIBRER, servis au calibreur. Une liste tenue de son côté aurait
// fini par diverger de NAV_DARK — le seuil du vapeur avait déjà pris cette
// pente, recopié à trois endroits. Un test vérifie que tout ce qui est ici
// s'allume vraiment.
// (Plus de dinghy ni de motorboat : le plaisancier est retiré. Les laisser ici
// ferait perdre du temps à calibrer les feux d'un bateau qui ne navigue plus.)
export const NAV_STAGES = ['sail', 'steam', 'container'];

// ── Position des feux PAR FACE ──────────────────────────────────────────────
// Le relevé de profil ci-dessus est projeté mathématiquement sur les 7 autres
// rotations (l'avance suit le cap, l'élévation reste verticale). Ça suppose que
// les 8 vues sont la rotation rigide d'un même objet — ce qu'elles NE SONT PAS :
// PixelLab les redessine une par une, la coque change de longueur apparente, le
// mât se déplace, la cheminée change de côté. « On devrait faire toutes les
// faces des sprites, tu ne crois pas ? » (Raph, 2026-07-30). Oui.
//
// Une face calibrée donne donc directement la position de chaque feu EN
// FRACTION DU SPRITE — plus de projection, plus de trigonométrie, le feu est au
// pixel qu'on a désigné. Les faces absentes retombent sur NAV_ANCHOR : la
// migration peut se faire face par face sans rien casser.
//   NAV_UV[stade][secteur] = { p: [u, v], s: [u, v] }   (p = bâbord, s = tribord)
// Relevé de Raph au calibreur (2026-07-30). Les faces absentes (sail-northeast,
// motorboat-east, et tout le dinghy) retombent sur le profil projeté de
// NAV_ANCHOR — c'est le but du repli, la table n'a pas à être complète.
const NAV_UV = {
  sail: {
    east: { p: [0.506, 0.156], s: [0.524, 0.160] },
    southeast: { p: [0.510, 0.158], s: [0.520, 0.158] },
    south: { p: [0.510, 0.158], s: [0.520, 0.162] },
    southwest: { p: [0.490, 0.164], s: [0.506, 0.162] },
    west: { p: [0.480, 0.240], s: [0.465, 0.217] },
    northwest: { p: [0.302, 0.319], s: [0.653, 0.160] },
    north: { p: [0.255, 0.217], s: [0.757, 0.219] },
  },
  steam: {
    east: { p: [0.096, 0.489], s: [0.094, 0.575] },
    southeast: { p: [0.273, 0.323], s: [0.137, 0.399] },
    south: { p: [0.610, 0.264], s: [0.396, 0.266] },
    southwest: { p: [0.875, 0.397], s: [0.739, 0.317] },
    west: { p: [0.916, 0.570], s: [0.910, 0.491] },
    northwest: { p: [0.688, 0.709], s: [0.863, 0.603] },
    north: { p: [0.380, 0.728], s: [0.641, 0.730] },
    northeast: { p: [0.151, 0.593], s: [0.353, 0.705] },
  },
  container: {
    east: { p: [0.178, 0.313], s: [0.192, 0.315] },
    southeast: { p: [0.822, 0.226], s: [0.645, 0.132] },
    south: { p: [0.369, 0.146], s: [0.643, 0.148] },
    southwest: { p: [0.371, 0.134], s: [0.194, 0.236] },
    west: { p: [0.820, 0.307], s: [0.824, 0.311] },
    northwest: { p: [0.625, 0.489], s: [0.833, 0.374] },
    north: { p: [0.365, 0.487], s: [0.641, 0.481] },
    northeast: { p: [0.196, 0.372], s: [0.388, 0.493] },
  },
  motorboat: {
    southeast: { p: [0.565, 0.570], s: [0.304, 0.438] },
    south: { p: [0.696, 0.515], s: [0.314, 0.507] },
    southwest: { p: [0.582, 0.583], s: [0.306, 0.448] },
    west: { p: [0.327, 0.477], s: [0.327, 0.450] },
    northwest: { p: [0.247, 0.438], s: [0.537, 0.325] },
    north: { p: [0.331, 0.395], s: [0.673, 0.395] },
    northeast: { p: [0.416, 0.360], s: [0.739, 0.460] },
  },
};
export function navUvFor(stage, sector) {
  const f = NAV_UV[stage];
  return (f && f[sector]) || null;
}
// Réglage à chaud, exporté plutôt que posé sur `window` : les tests tournent en
// Node sans DOM et doivent pouvoir régler la table sans passer par un global.
export function setNavUv(stage, sector, o) {
  if (!stage || !sector) return;
  if (o) (NAV_UV[stage] || (NAV_UV[stage] = {}))[sector] = o;
  else if (NAV_UV[stage]) delete NAV_UV[stage][sector];
}
if (typeof window !== 'undefined') {
  window.__navUv = (stage, sector, o) => {
    setNavUv(stage, sector, o);
    return stage ? (NAV_UV[stage] || null) : NAV_UV;
  };
}

// Le calibreur travaille sur le SPRITE : il lui faut la pose exacte de l'image,
// le réglage courant et la liste des stades — sans jamais nous importer en
// retour. ⚠ CET APPEL DOIT RESTER SOUS NAV_STAGES : placé plus haut dans le
// fichier, il lisait la constante avant son initialisation et jetait une TDZ au
// chargement du module (attrapé par les tests). Le même piège que celui qui
// interdit le cycle d'imports, à l'intérieur d'un seul fichier cette fois.
configureNavCalib({
  K: BOAT_IMG_K, TOP: BOAT_IMG_TOP, anchorFor: navAnchorFor,
  stages: NAV_STAGES, sectors: BOAT_SECTORS, uvFor: navUvFor,
});

// Intensité des feux. Le produit par nightF est la garde qui compte :
// `flameGlowAlpha` porte un plancher de JOUR délibéré pour qu'une forge brûle à
// midi, et la première version en héritait. Un feu de position n'a rien à
// signaler de jour. Le 0,62 remplace l'ancien 2,6 — Raph les trouvait trop forts.
export function boatLampMul(nightF, gain) {
  return Math.max(0, nightF || 0) * 0.62 * (gain == null ? 1 : gain);
}

// Battement d'un feu de position : LENT et LÉGER (Raph). Un feu de nav ne
// clignote pas comme un gyrophare — il respire, et c'est ce souffle qui le
// distingue d'un pixel mort collé sur la coque.
//   période ~7,3 s, amplitude ±18 % : sous 10 % l'œil ne voit rien, au-delà de
//   30 % ça se met à clignoter et le bateau ressemble à une balise.
// Deux sinus de périodes premières entre elles plutôt qu'un seul : un battement
// parfaitement régulier s'entend comme une horloge dès qu'on le regarde un peu.
// La phase vient du bateau, sinon toute la flotte respire à l'unisson.
export function boatLampFlicker(now, phase) {
  const t = now || 0, ph = phase || 0;
  const a = 0.62 * Math.sin(t / 1160 + ph) + 0.38 * Math.sin(t / 2870 + ph * 1.7);
  return 1 + 0.18 * a;
}

// Décalages écran des deux feux, en px, depuis le centre de coque.
//
// Repère du bateau projeté : l'axe d'AVANCE suit le cap écran, l'axe TRAVERS
// est sa perpendiculaire (tourner le cap de -90° en repère y-vers-le-bas donne
// la gauche du marin, donc bâbord), et l'ÉLÉVATION reste verticale à l'écran —
// c'est la convention iso : un mât ne se couche pas quand le bateau vire.
//
// `an` = { mast, beam, foreP, foreS } en fraction de dw ; chaque feu a sa propre
// avance, ce qui permet de les poser n'importe où sur la coque et pas seulement
// sur son axe.
export function navLightOffsets(heading, dw, an) {
  const a = an || NAV_ANCHOR_DEFAULT;
  const cx = Math.cos(heading), cy = Math.sin(heading);      // avance
  const tx = Math.sin(heading), ty = -Math.cos(heading);     // travers, vers bâbord
  const lift = -(a.mast || 0) * dw;                          // élévation (écran)
  const b = (a.beam || 0) * dw;
  const fp = (a.foreP || 0) * dw, fs = (a.foreS || 0) * dw;
  return {
    port: { x: fp * cx + b * tx, y: lift + fp * cy + b * ty },
    stbd: { x: fs * cx - b * tx, y: lift + fs * cy - b * ty },
  };
}

// Passe de nuit des bateaux : APRÈS drawIsoNight, comme les lanternes de pont.
// Elle consomme l'ancre écran que drawIsoShips a laissée sur chaque coque —
// `_navAt` la date, sinon une coque sortie du champ garderait sa position de la
// frame d'avant et sèmerait deux pixels au milieu de l'eau.
function drawIsoShipNight(now) {
  const night = CM.nightF || 0;
  if (!NAV_LIGHTS.on || night <= 0.02 || !CM.ships || !CM.ships.length) return;
  const base = boatLampMul(night, NAV_LIGHTS.gain);
  if (base <= 0.01) return;
  const ctx = CM.ctx;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (const sh of CM.ships) {
    if (!sh._nav || sh._navAt !== now || !boatHasNavLights(sh._nav.stage)) continue;
    // Battement propre à CE bateau : sans phase par coque, toute la flotte
    // respirerait au même rythme et l'œil y verrait un clignotant commun.
    const a = base * boatLampFlicker(now, sh.id * 0.7);
    const { x, y, dw, heading, stage, sector } = sh._nav;
    // FACE CALIBRÉE d'abord : la position est lue telle quelle sur le sprite de
    // cette rotation. Sinon, repli sur le relevé de profil projeté au cap.
    const uv = navUvFor(stage, sector);
    let off;
    if (uv) {
      const dwImg = dw * BOAT_IMG_K;
      const at = (c) => ({ x: (c[0] - 0.5) * dwImg, y: (c[1] - BOAT_IMG_TOP) * dwImg });
      off = { port: at(uv.p), stbd: at(uv.s) };
    } else {
      off = navLightOffsets(heading, dw, navAnchorFor(stage));
    }
    const px = Math.max(1, Math.round(dw * 0.045 * NAV_LIGHTS.size));
    for (const [o, col] of [[off.port, NAV_PORT_COL], [off.stbd, NAV_STBD_COL]]) {
      ctx.fillStyle = `rgba(${col},${Math.min(1, a).toFixed(3)})`;
      ctx.fillRect(Math.round(x + o.x - px / 2), Math.round(y + o.y - px / 2), px, px);
    }
  }
  ctx.globalCompositeOperation = prevOp;
}

// Aspect d'un bateau pour la frame : sprite, échelle, et force du sillage. Le
// pêcheur n'en laisse aucun (il est à l'ancre), le plaisancier à peine.
export function shipVisual(kind, band, ei, shipState) {
  // Le pêcheur est le seul bateau qu'on regarde DURER : il tient la même pose
  // 90 s. S'il n'est qu'une tache brune, sa scène ne se lit pas — d'où une
  // échelle plus généreuse que sa taille réelle ne le voudrait.
  //
  // DEUX POSES (Raph) : on ne pêche pas en naviguant. Canne tendue seulement à
  // l'ancre ; en route, la même barque et le même homme, canne rangée. C'est le
  // seul bateau du fleuve dont le sprite dépend de ce qu'il est en train de
  // FAIRE, et c'est ce qui donne à son arrivée et à son départ un sens lisible.
  if (kind === 'fisher') {
    const posed = shipState === 'anchor';
    // ⚠ LE `wake: 0` DATAIT DU TEMPS OÙ LE PÊCHEUR NE BOUGEAIT PAS. Il valait 0
    // dans les deux poses au motif qu'« il est à l'ancre » — vrai du pêcheur qui
    // traverse et se pose 90 s, faux depuis que celui de l'île TOURNE (Raph,
    // 2026-07-30 : « il faut qu'il ait des clapotis autour de lui et un sillage »).
    // À l'arrêt il n'en laisse toujours aucun, et c'est ce contraste qui fait lire
    // la pose : l'écume s'éteint quand il pose sa ligne.
    // Échelle RÉDUITE de 1,75 à 1,3 (Raph, 2026-07-30). La valeur généreuse
    // datait du jour où le pêcheur v1, sombre, se perdait sur l'eau ; la barque
    // claire actuelle se lit très bien plus petite, et une barque de pêche DOIT
    // rester la plus petite chose qui flotte — à 1,75 elle rivalisait avec un
    // vapeur.
    return { key: posed ? 'fisher' : 'fisher-row', sizeMul: 1.3, wake: posed ? 0 : 0.4, stage: 'fisher' };
  }
  const stage = tradeStage(band, ei);
  return { key: stage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, band)) : stage,
    sizeMul: tradeSizeMul(stage, band), wake: 1, stage };
}

// ── ÉVITEMENT DES OBSTACLES PLANTÉS DANS L'EAU ──────────────────────────────
// L'Aiguille Céleste est posée EN PLEIN FLEUVE (c'est un phare, cf.
// cmWetWonderSlot) : les bateaux, qui suivent le ruban, lui rentraient dedans.
//
// La manœuvre se joue sur la seule VOIE TRANSVERSALE, jamais sur `t` : on ne
// dévie pas la route du fleuve, on se range d'un bord. Le bateau choisit le côté
// où il est DÉJÀ, ce qui évite qu'il traverse le monument pour l'éviter — et
// l'écart se creuse progressivement à l'approche plutôt que d'un coup de barre.
//
// `lat` de l'obstacle est signé dans le même repère que `lateral` (tuiles depuis
// l'axe du ruban), donc les deux se comparent directement.
// Molette : __riverDodge({ on, range, clear, gateRange }).
// `gateRange` est plus large que `range` : on se présente à une passe de loin,
// alors qu'on ne s'écarte d'un obstacle qu'en le serrant.
const DODGE = { on: true, range: 0.045, clear: 1.0, gateRange: 0.07 };
if (typeof window !== 'undefined') {
  window.__riverDodge = (o) => { if (o) Object.assign(DODGE, o); return { ...DODGE }; };
}
/* ── UNE ÎLE EST UN OBSTACLE LONG, PAS UN CAILLOU ──────────────────────────────
 * L'Aiguille publie sa position comme un disque de 1,6 (cf. riverObstacles dans
 * cityMapRuntime). Depuis qu'une ÎLE l'entoure — 7,6 × 2,4 tuiles de demi-axes,
 * soit 15 tuiles de long — ce disque ne couvre plus qu'un dixième de ce qu'il faut
 * contourner : les bateaux évitaient le monument et labouraient l'île (Raph,
 * 2026-07-30, « ils passent encore dessus »).
 *
 * On publie donc une CHAÎNE de points le long du grand axe, chacun portant la
 * demi-largeur LOCALE du fuseau : l'ellipse se contourne comme elle est faite et
 * non comme si c'était un rond, et les deux bras du fleuve redeviennent deux
 * vraies passes.
 *
 * ⚠ POURQUOI PAS UN SEUL POINT AU CENTRE, AVEC UN GROS RAYON. Parce que la portée
 * de l'évitement (DODGE.range) est une fraction du fleuve ENTIER : ~22 tuiles à
 * gridN 136, mais seulement 7,8 à gridN 46 — pour une île qui, elle, fait 15
 * tuiles quelle que soit la carte. Un point unique tiendrait sur une grande carte
 * et laisserait les bateaux couper les deux pointes sur une petite, c'est-à-dire
 * le bug d'origine mais seulement pour les joueurs en début de partie. La chaîne
 * ne dépend que de la taille de l'île, donc elle tient partout.
 *
 * Vit ICI et non côté runtime : publier et éviter sont les deux moitiés d'un même
 * contrat (le format {t, lat, r}), et le piège du rayon nul ci-dessous ne se lit
 * que si `riverDodge` est sous les yeux. Pure et exportée — c'est la GÉOMÉTRIE
 * qui se teste, pas le dessin.
 * ------------------------------------------------------------------------- */
export function riverIslandObstacles(islands, sm) {
  const out = [];
  if (!islands || !sm || sm.length < 2) return out;
  const len = sm.length;
  for (const il of islands) {
    // Un point tous les ~ry le long du fuseau : assez serré pour que les zones
    // d'influence se recouvrent franchement, même sur la plus petite carte.
    const n = Math.max(3, Math.ceil((2 * il.rx) / Math.max(0.6, il.ry)));
    for (let k = 0; k <= n; k += 1) {
      const al = -il.rx + 2 * il.rx * (k / n);          // abscisse le long du courant
      const px = il.x + al * il.tx, py = il.y + al * il.ty;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < len; i += 1) {
        const dd = (sm[i].x - px) ** 2 + (sm[i].y - py) ** 2;
        if (dd < bd) { bd = dd; bi = i; }
      }
      const s0 = sm[bi];
      const a = sm[Math.max(0, bi - 1)], b = sm[Math.min(len - 1, bi + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      // Le grand axe de l'île est DROIT alors que le fleuve tourne : `lat` s'écarte
      // de zéro vers les pointes, et c'est exactement ce qu'on veut publier — la
      // chaîne suit l'ÎLE, pas l'axe du courant.
      const lat = (px - s0.x) * nx + (py - s0.y) * ny;
      // Demi-largeur du fuseau EN TRAVERS du courant à cette abscisse.
      // ⚠ PLANCHER À 0,35 ET NON ZÉRO : `riverDodge` lit `o.r || 1.4`, donc un rayon
      // nul aux pointes retomberait EN SILENCE sur le défaut de 1,4 — plus large
      // que l'île n'y est. Un zéro qui se change en gros nombre est le genre de
      // bug qu'on ne voit jamais en relisant le code.
      const u = Math.max(0, 1 - (al / il.rx) ** 2);
      out.push({
        t: bi / Math.max(1, len - 1), lat,
        r: Math.max(0.35, il.ry * Math.sqrt(u)), id: 'island',
      });
    }
  }
  return out;
}

export function riverDodge(lateral, t, effSize, hw, obstacles, gates, memo) {
  const obs = obstacles || CM.riverObstacles;
  const gts = gates || CM.riverGates;
  if (!DODGE.on) return lateral;
  let out = lateral;
  // Groupes d'obstacles frôlés à CETTE frame : sert à oublier le bord choisi
  // une fois l'île doublée (cf. le bloc de mémoire plus bas).
  const vus = memo ? new Set() : null;
  // ── PASSES : le pont n'est franchissable QU'AU MILIEU ──────────────────────
  // La travée centrale est ouverte (isoBridge retire les palées du chenal), mais
  // un bateau qui arrive au ras d'une berge passerait quand même dans la pierre.
  // On le RECENTRE avant l'ouvrage. C'est l'inverse exact d'un obstacle : ici on
  // attire au lieu d'écarter.
  if (gts && gts.length) {
    for (const g of gts) {
      let dt = Math.abs(t - g.t);
      if (dt > 0.5) dt = 1 - dt;
      if (dt > DODGE.gateRange) continue;
      const p = 1 - dt / DODGE.gateRange;
      out += ((g.lat || 0) - out) * (p * p * (3 - 2 * p));
    }
  }
  if (!obs || !obs.length) return out;
  for (const o of obs) {
    let dt = Math.abs(t - o.t);
    if (dt > 0.5) dt = 1 - dt;
    if (dt > DODGE.range) continue;
    // Approche lissée : 0 au bord de la zone, 1 au droit de l'obstacle.
    const p = 1 - dt / DODGE.range;
    const force = p * p * (3 - 2 * p);
    // Dégagement voulu : le rayon de l'obstacle plus la demi-coque, plus une
    // marge. Un bateau large se range donc plus loin qu'une barque.
    const clear = (o.r || 1.4) + effSize * 0.5 + DODGE.clear * 0.5;
    // ⚠ LE BORD SE CHOISIT UNE FOIS, PUIS NE BOUGE PLUS. Recalculé à chaque
    // frame, `out >= o.lat` bascule dès que le LOUVOIEMENT fait passer la coque
    // d'un côté à l'autre de l'axe — et le bateau se téléporte d'un bras de
    // l'île à l'autre au lieu de la contourner (Raph). La bascule est invisible
    // sur un obstacle ponctuel au milieu du fleuve, elle saute aux yeux dès que
    // l'obstacle est une île qu'on longe pendant plusieurs secondes.
    //
    // La mémoire est prise par GROUPE (`o.id`) : l'île publie une chaîne de
    // points qui partagent le même id, donc toute la chaîne s'accorde sur un
    // seul bord — sinon les pointes et le milieu pourraient se contredire.
    const gid = o.id || 'x';
    let side;
    if (memo) {
      vus.add(gid);
      const mem = memo._dodgeSide || (memo._dodgeSide = {});
      if (mem[gid] === undefined) mem[gid] = out >= o.lat ? 1 : -1;
      side = mem[gid];
    } else {
      // Côté déjà pris — et non le plus dégagé : un bateau qui traverserait le
      // monument pour se ranger « du bon côté » serait pire que le défaut.
      side = out >= o.lat ? 1 : -1;
    }
    let cible = o.lat + side * clear;
    // Le contournement reste DANS l'eau : au besoin on passe de l'autre bord
    // plutôt que d'échouer le bateau sur la berge.
    const bord = hw * 0.86 - effSize * 0.3;
    if (Math.abs(cible) > bord) {
      const autre = o.lat - side * clear;
      cible = Math.abs(autre) <= bord ? autre : Math.max(-bord, Math.min(bord, cible));
    }
    // ⚠ UN OBSTACLE ÉCARTE, IL N'ATTIRE JAMAIS. Sans cette borne, `out += (cible -
    // out) · force` RAMÈNE le bateau vers l'obstacle quand il est déjà plus au
    // large que le dégagement demandé. Invisible tant qu'il n'y avait qu'un seul
    // obstacle ponctuel (l'Aiguille) ; fatal dès qu'une ÎLE en publie une chaîne,
    // parce que les points étroits des pointes viennent alors défaire l'écart que
    // le point large du milieu vient d'obtenir — et la coque repasse sur la terre,
    // exactement le défaut qu'on croyait corriger.
    const vise = out + (cible - out) * force;
    out = side > 0 ? Math.max(out, vise) : Math.min(out, vise);
  }
  // L'île doublée, on oublie le bord : au prochain passage le bateau choisira
  // de nouveau selon sa route. Sans cet oubli, un marchand qui a serré à gauche
  // une fois serrerait à gauche pour le restant de sa vie, même arrivé par
  // l'autre bout du fleuve.
  if (memo && memo._dodgeSide) {
    for (const k of Object.keys(memo._dodgeSide)) if (!vus.has(k)) delete memo._dodgeSide[k];
  }
  return out;
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
  // Les aspects sont CONSTANTS sur la frame (même ère pour tous) : on les
  // calcule une fois. Le pêcheur en a deux — canne tendue à l'ancre, rangée en
  // route — d'où ses deux entrées, choisies par bateau selon son état.
  const VIS = {
    trade: shipVisual('trade', band, ei),
    fisherPosed: shipVisual('fisher', band, ei, 'anchor'),
    fisherRow: shipVisual('fisher', band, ei, 'cruise'),
  };
  const docks = CM.shipDocks || [];
  for (const sh of CM.ships) {
    const vis = sh.kind === 'fisher'
      ? (sh.state === 'anchor' ? VIS.fisherPosed : VIS.fisherRow)
      : (VIS[sh.kind] || VIS.trade);
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
    // ── OÙ EST-IL ? DEUX RÉGIMES ────────────────────────────────────────────
    // Presque tous les bateaux vivent sur le RUBAN (position `t` + voie latérale).
    // Le pêcheur de l'île, lui, vit sur son ORBITE : sa position ne se lit pas du
    // tout de la même façon, mais tout ce qui suit (coque, sillage, ombre, nuit)
    // ne connaît que `p` et `heading` — d'où cette bifurcation, et elle seule.
    // `tilt` = l'inclinaison de la COQUE legacy, calée sur la pente ÉCRAN de la
    // route suivie (et non sur le sens de marche : une coque ne se retourne pas
    // quand le bateau fait demi-tour). Calculé dans les deux régimes plutôt que
    // reconstruit depuis `heading`, qui, lui, porte le sens.
    const orbIle = sh.orbit ? (rv.islands || [])[0] : null;
    let p, heading, tilt;
    if (orbIle) {
      const o = orbitPoint(orbIle, sh.orbit.ang);
      p = worldToScreen(o.x * T, o.y * T);
      if (p.x < -s * 3 || p.x > CM.cw + s * 3 || p.y < -s * 3 || p.y > CM.ch + s * 3) continue;
      // Cap = tangente de l'orbite, PROJETÉE (et non l'angle monde) : en iso, une
      // trajectoire circulaire devient une ellipse écrasée de moitié, un cap pris
      // dans le monde ferait naviguer la coque en crabe sur les flancs.
      const da = 0.06 * (sh.orbit.dir < 0 ? -1 : 1);
      const o2 = orbitPoint(orbIle, sh.orbit.ang + da);
      const q = worldToScreen(o2.x * T, o2.y * T);
      heading = Math.atan2(q.y - p.y, q.x - p.x);
      tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(q.y - p.y, Math.abs(q.x - p.x) || 1e-6) * 0.45));
    } else {
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
      // `sh` sert de MÉMOIRE : le bord choisi pour doubler une île y reste
      // accroché tant que le bateau la longe (cf. riverDodge).
      const lateral = riverDodge(((sh.lane || 0) + wave) * laneRoom, sh.t, effSize, hw, null, null, sh);
      cgx += nx * lateral; cgy += ny * lateral;
      p = worldToScreen(cgx * T, cgy * T);
      if (p.x < -s * 3 || p.x > CM.cw + s * 3 || p.y < -s * 3 || p.y > CM.ch + s * 3) continue;
      // Cap PROJETÉ complet (rad écran), signé par le sens de navigation.
      const a2 = worldToScreen(sm[i0].x * T, sm[i0].y * T);
      const b2 = worldToScreen(sm[i1].x * T, sm[i1].y * T);
      const sgn = sh.dir < 0 ? -1 : 1;
      heading = Math.atan2(sgn * (b2.y - a2.y), sgn * (b2.x - a2.x));
      tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(b2.y - a2.y, Math.abs(b2.x - a2.x) || 1e-6) * 0.45));
    }
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
      const dw = s * (BOAT_SIZES[vstage] || 0.7) * sizeMul * BOAT_IMG_K;
      ctx.drawImage(isoBoat.img, p.x - dw / 2, p.y - dw * BOAT_IMG_TOP + bob, dw, dw);
    } else if (sh.kind !== 'trade') {
      // Repli des métiers dont l'art n'est pas encore récolté. SANS lui on ne
      // verrait rien du tout et il serait impossible de régler vitesses, voies
      // et durées avant que les sprites arrivent — or c'est précisément ce
      // réglage-là qui décide si le fleuve est vivant.
      drawIsoBoatStub(ctx, p, s, sizeMul, heading, bob, sh);
    } else if (chr && boatReady(chr)) {
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
    // ⚠ `vis.stage` et NON `vis.key` : la clé porte la POSE (fisher / fisher-row)
    // alors que le stade porte la COQUE. Avec la clé, un pêcheur en route serait
    // passé à côté de la liste des coques sans feux et se serait allumé.
    sh._nav = { x: p.x, y: p.y, dw: s * 0.7 * sizeMul, heading, stage: vis.stage, sector: boatSector(heading) };
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
  // ON N'ÉCLAIRE PAS LE VIDE. Même règle que le trottoir : une voie sans aucune
  // façade sur ses huit voisines n'est pas une rue, et un mât allumé au milieu
  // de rien est le signal le plus visible du défaut — de nuit, c'est même le
  // seul qu'on voie. Filtré ICI et pas dans `computeIsoLamps` : le corps pur
  // reste testable sans layout bâti.
  const lamps = computeIsoLamps(L, CM.TILE)
    .filter((lp) => builtNear(L, lp.gx, lp.gy))
    .concat(plazaLamps);
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
// Mât posé sur la COUTURE d'un terre-plein : il partage la bande avec les slots
// plantés (medianSlots). S'il tombe à moins d'une demi-tuile d'un bac/buisson,
// on le GLISSE le long de l'axe au MILIEU de l'intervalle libre le plus proche
// (à 0.625 T des deux slots voisins) — « les lampadaires dessus j'aime bien
// mais il ne faut pas que ça chevauche les plantes » (Raph 2026-08-03).
// `w` = coordonnée monde LE LONG de l'axe du segment (wx pour h, wy pour v).
function lampSlideClear(seg, T, w) {
  const ext = MEDIAN_TUNE.ext * T;
  const horiz = seg.axis === 'h';
  const a = (horiz ? seg.x0 : seg.y0) * T - ext;
  const len = ((horiz ? seg.x1 - seg.x0 : seg.y1 - seg.y0) + 1) * T + 2 * ext;
  const P = T * 1.25, margin = T * 0.62;
  const t = w - a;
  const nSlots = Math.floor((len - 2 * margin) / P) + 1;
  if (nSlots <= 0) return w;
  const i = Math.max(0, Math.min(nSlots - 1, Math.round((t - margin) / P)));
  const ts = margin + i * P;
  if (Math.abs(t - ts) >= T * 0.5) return w;    // assez loin du slot : rien à faire
  const cand = [];
  if (ts - P / 2 >= T * 0.25) cand.push(ts - P / 2);
  if (ts + P / 2 <= len - T * 0.25) cand.push(ts + P / 2);
  if (!cand.length) return w;
  cand.sort((u, v) => Math.abs(u - t) - Math.abs(v - t));
  return a + cand[0];
}
export function computeIsoLamps(L, T) {
  const lamps = [];
  const solid = isoSolidSouthCorners(L, T);
  // Index des coutures plantées par rangée/colonne, pour repérer en O(1) les
  // mâts qui se plantent SUR une bande de terre-plein.
  const tpH = new Map(), tpV = new Map();
  for (const sg of (L.terrePlein || [])) {
    if (sg.axis === 'h') { if (!tpH.has(sg.y)) tpH.set(sg.y, []); tpH.get(sg.y).push(sg); }
    else { if (!tpV.has(sg.x)) tpV.set(sg.x, []); tpV.get(sg.x).push(sg); }
  }
  for (const c of L.roadMap.values()) {
    if (c.roadSurface === 'bridge' || c.rank === 'plaza') continue;
    const mask = c.mask | 0;
    const thH = !!((mask & ROAD_E) && (mask & ROAD_W));
    const thV = !!((mask & ROAD_S) && (mask & ROAD_N));
    if (thH === thV) continue;                    // carrefour / impasse : pas de mât
    // LES SENTIERS NE S'ÉCLAIRENT PAS (lot L6). Un mât tous les 3 tronçons sur
    // CHAQUE voie, sentiers de desserte compris, revenait à poser une marque
    // régulière sur tout le maillage : le lampadaire soulignait la grille qu'on
    // cherche à effacer, et le rang `path` est de loin le plus nombreux du réseau
    // (147 sentiers contre 462 rues sur la ville de mesure). Une venelle non
    // éclairée est en plus la bonne lecture : on éclaire les rues, pas les
    // arrière-cours. Molette `__lampTune({paths:true})` pour rejouer l'ancien.
    if (!LAMP_TUNE.paths && c.rank === 'path') continue;
    const step = Math.max(1, LAMP_TUNE.step | 0);
    if (((c.gx + c.gy) % step) !== 0) continue;   // espacement le long de la rue
    // Côté de chaussée CONSTANT le long d'une même rue (hash par RUE, pas par
    // cellule) : les mâts forment une ligne continue au lieu de zigzaguer.
    // Le mât se plante DANS LE TROTTOIR (les 20% extérieurs de la cellule hors
    // chaussée : ROAD_BAND=0.30 → chaussée = 0.20..0.80) à CURB du bord de cellule.
    // 0.14/0.86 collait le socle au ras de la chaussée → il « dépassait sur la
    // route » (Raph) ; CURB petit recule le socle ET les bras au sec.
    const CURB = LAMP_TUNE.curb;
    const side = (cmHash(thH ? 'lmp:h:' + c.gy : 'lmp:v:' + c.gx) & 1) ? 1 - CURB : CURB;
    let wx = (thH ? c.gx + 0.5 : c.gx + side) * T;
    let wy = (thH ? c.gy + side : c.gy + 0.5) * T;
    // Ce côté de trottoir est-il la COUTURE d'un terre-plein ? (side ~1 → couture
    // au sud/est de la cellule = seg à c.gy/c.gx ; side ~0 → couture au nord/ouest
    // = seg à c.gy-1/c.gx-1.) Si oui, glisser le mât entre les plantes.
    if (thH) {
      const cy = side > 0.5 ? c.gy : c.gy - 1;
      for (const sg of (tpH.get(cy) || [])) {
        if (c.gx < sg.x0 || c.gx > sg.x1) continue;
        wx = lampSlideClear(sg, T, wx);
        break;
      }
    } else {
      const cx = side > 0.5 ? c.gx : c.gx - 1;
      for (const sg of (tpV.get(cx) || [])) {
        if (c.gy < sg.y0 || c.gy > sg.y1) continue;
        wy = lampSlideClear(sg, T, wy);
        break;
      }
    }
    let d = wx + wy;
    if (side < 0.5) {
      const bd = solid.get(thH ? c.gx + ':' + (c.gy - 1) : (c.gx - 1) + ':' + c.gy);
      if (bd != null && bd + 1 > d) d = bd + 1;   // +1 px monde : juste devant le socle
    }
    lamps.push({ wx, wy, gx: c.gx, gy: c.gy, d });
  }
  return lamps;
}
// ── MOBILIER DE TROTTOIR (bancs, bacs, corbeilles) ───────────────────────────
// La POSE vit dans isoStreetProps.js (corps pur, testable) ; ici on lui donne
// la géométrie de rue et on met le résultat en cache. Les callbacks sont la
// SEULE source de vérité — pas une copie des largeurs — donc régler
// __sidewalkIso({w}) ou la hiérarchie des rangs déplace le mobilier avec le
// trottoir, et un trottoir éteint n'a pas de mobilier orphelin.
let _streetPropCache = { key: '', props: null };
const streetPropEra = (band) => plazaEraForBand(band);
function isoStreetPropsFor(L, band) {
  if (!L || !L.roadMap) return [];
  const key = CM.layoutRecomputeAt + ':' + band + ':' + STREET_PROPS.rev
    + ':' + (SIDEWALK_ISO.on ? 1 : 0) + ':' + SIDEWALK_ISO.w + ':' + SIDEWALK_ISO.curb
    + ':' + (COUR.on ? 1 : 0) + ':' + LAMP_TUNE.step;
  if (_streetPropCache.key === key && _streetPropCache.props) return _streetPropCache.props;
  const T = CM.TILE;
  // Le trottoir DESSINÉ décide : même test que le bake (cellule urbaine dont le
  // sol n'est pas retombé en cour ou en friche), sans quoi on meublerait un
  // chemin de terre.
  const courK = COUR.on && COUR.sidewalk ? courOf(L) : null;
  const props = (SIDEWALK_ISO.on && band >= SIDEWALK_ISO.minBand)
    ? computeStreetProps(L, T, {
      band,
      innerOf: (rank) => isoRoadHalfW(rank) + ROAD_DETAIL.groove + SIDEWALK_ISO.curb,
      outerOf: (rank) => isoRoadHalfW(rank) + SIDEWALK_ISO.w,
      isSidewalk: (gx, gy) => {
        const k = gx + ',' + gy;
        if (!L.urbanSet || !L.urbanSet.has(k)) return false;
        if (courK && (courK.get(k) || 'urban') !== 'urban') return false;
        // Même règle que le trottoir lui-même : pas de façade, pas de mobilier.
        return builtNear(L, gx, gy);
      },
      lamps: isoLamps(L, band),
      solidSouth: isoSolidSouthCorners(L, T),
      isBuilt: (gx, gy) => builtCells(L).has(gx + ',' + gy),
    })
    : [];
  _streetPropCache = { key, props };
  // Diagnostic : le compte ET la liste (le compte seul ne dit pas OÙ, et
  // « il n'y en a pas assez » se tranche en regardant les positions).
  CM._streetProps = props;
  if (typeof window !== 'undefined') window.__streetPropsCount = props.length;
  return props;
}

// ── CLÔTURES (lot L9, docs/PLAN-TISSU-URBAIN.md) ────────────────────────────
// L'art était livré depuis le 2026-07-30 et la règle de pose écrite ET testée
// (`fenceEdges.js`) : il ne manquait que ce branchement. Le compteur exigé par le plan
// est arrivé avant (`__tissu().fences`) et il a levé le doute — 90 arêtes à la
// bande 3, 563 à la bande 7, pour un plafond de 4 000.
//
// ⚠ PASSE VIVANTE, JAMAIS LA CUISSON DU SOL. Une clôture est sur une ARÊTE, donc à
// cheval sur deux cellules, et un décor à cheval cuit dans le sol se fait rogner au
// défilement — c'est le refus tombé sept fois sur la jonction herbe/ville. Poussée
// ici comme les lampadaires, le problème n'existe pas.
//
// ⚠ AUCUNE BRANCHE DE DESSIN À ÉCRIRE. Les PNG vivent dans `iso/plaza/`, donc
// `propImage` les résout depuis (prop `fence`, variant = côté, ère) et
// `drawIsoPlazaProp` les blitte : même art et même tri que les bancs, exactement ce
// que le plan annonçait (« même pipeline que les bancs »).
//
// `p` = hauteur en fraction d'HABITANT, l'étalon du mobilier de place. Un garde-corps
// arrive à la taille — pas un mur, pas une palissade.
// Molette : `__fences(false)` éteint, `__fences({ p: 0.7 })` règle.
// ✅ **ALLUMÉ le 2026-08-06, après la composition en BANDES.** Historique des trois
// étapes, parce que chacune a corrigé la précédente et que le chemin compte :
//
// Étape 1, un panneau par arête : ça ne ferme pas la ligne, et c'est de
// l'arithmétique, pas un réglage.
//   arête de cellule à l'écran : hypot(32, 16) = 35,8 px à zoom 1
//   encre du sprite            : 21 px de large (canvas 34×34, encre 21×31)
// Il restait ~11 px de vide entre deux voisins, et les panneaux se lisaient comme des
// BLOCS DE PIERRE ABANDONNÉS sur le sable — y compris centré sur la plus longue suite
// contiguë (13 arêtes). `minRun` écarte les isolés (92 → 68 poses à 3) sans rien fermer.
//
// Étape 2, RÉPÉTER le panneau le long de l'arête (`per`, calculé) : ✅ visuellement
// c'est LA solution. Le garde-corps devient une ligne continue qui suit la berge,
// exactement ce que le plan décrivait. Et il n'a pas fallu découper le sprite : la
// palissade est faite de planches verticales uniformes, le panneau entier se répète
// sans couture, donc pas de poteau d'about doublé (la crainte du plan).
//
// ⛔ MAIS LE COÛT NE PASSE PAS. Profilé à zoom 1, caméra épinglée sur la berge, A/B
// rejoué dans les deux sens (un seul sens ne prouve rien) :
//   sans clôtures : 56,0 ms puis 53,6 ms rejoué   ·   0 dessinée
//   avec          : 72,3 ms                        ·   955 dessinées
// Soit **+17 ms, ~+30 % de la frame** pour 955 items. (Valeurs absolues gonflées par
// la pane, cf. PERF-CARTE-REPRISE §7 — c'est la PROPORTION qui compte.) La cause est
// mécanique : 7 panneaux par arête, parce que chaque panneau est minuscule.
//
// Étape 3, la DÉCOUPE (intuition de Raph, et la mesure a dit pourquoi) : ne pas
// répéter le panneau AU DESSIN mais composer la ligne UNE FOIS dans un canevas hors
// écran — même geste que l'aqueduc modulaire et que le bake des quais — puis blitter
// UNE bande par arête. Le tri peintre garde sa granularité par cellule.
// ✅ Coût après composition, A/B rejoué TROIS fois, caméra épinglée :
//   sans 78,4 / 71,7 / 65,8 ms   ·   avec 86,7 / 67,2 / 69,9 ms  (108 clôtures)
// Écart moyen +2,6 ms pour une variance de ±8, et un tour sur trois donne les
// clôtures PLUS RAPIDES : c'est dans le bruit. On passe de +17 ms à indétectable.
//
// ⚠ Le parvis des merveilles a été COUPÉ (`FENCE.wonders = false`) : ses arêtes
// qualifient mais tombent en plein pavé ouvert, sans rien à border, et se lisent comme
// des blocs abandonnés. Le quai et la berge bâtie longent l'eau — là c'est une ligne.
//
// `p` = hauteur en fraction d'HABITANT, l'étalon du mobilier de place.
// `minRun` = longueur minimale d'une suite d'arêtes contiguës.
// Molette : `__fences(false)` éteint, `__fences({ p, minRun })` règle.
// ⚠ `minRun` REMIS À 1 le 2026-08-06, quand les quais ont été abandonnés au profit
// des places et des parvis. Il avait été posé à 3 pour écarter les panneaux isolés
// d'une berge ; sur une ENCEINTE il est nocif — un anneau TOURNE, donc chaque côté ne
// fait que 3 ou 4 cellules et le filtre lui coupe les coins. Le laisser à 3 vidait la
// ceinture d'une place de ses angles, et ce qui restait se lisait comme des débris.
export const FENCE_ISO = { on: true, p: 0.62, minRun: 1 };
const NO_FENCES = [];

// ── LA BANDE : `per` panneaux composés UNE FOIS, blittés en UN drawImage ────────
// C'est la « découpe » du plan, et la mesure a dit pourquoi elle est nécessaire :
// répéter le panneau AU DESSIN coûtait +17 ms (955 items, ~+30 % de frame).
// Ici la répétition est cuite dans un canevas hors écran, mis en cache par
// (côté, ère, nombre) — il y en a au plus 4 × 5 × quelques valeurs de `per`.
//
// ⚠ LE SENS DE LA DIAGONALE N'EST PAS LE MÊME DES DEUX CÔTÉS. Une arête n/s avance
// en +x dans le monde, soit (+2, +1) à l'écran ; une arête e/w avance en +y, soit
// (−2, +1). Composer les deux dans le même sens collerait la moitié des clôtures
// à contresens de leur berge.
//
// ⚠ On compose à la RÉSOLUTION NATIVE du sprite (jamais à l'échelle écran) : la bande
// est alors indépendante du zoom, et un seul canevas sert à tous les zooms — sinon on
// recuirait à chaque cran, exactement le point noir du sol.
const _fenceStrips = new Map();
function fenceStrip(side, era, per) {
  const key = side + ':' + era + ':' + per;
  const hit = _fenceStrips.get(key);
  if (hit !== undefined) return hit;
  const art = isoArt('plaza/fence-' + side + '-' + era);
  if (!art.ready || !art.img) return null;            // pas décodé : on NE met pas en cache
  const bb = inkBox(art.img);
  if (!bb || !bb.w || !bb.h) return null;
  const step = bb.w;                                  // les panneaux s'aboutent
  const drop = step * (ISO_Y / ISO_X);                // la marche de la diagonale
  const right = side === 'n' || side === 's';         // sens d'avance à l'écran
  const cw = Math.max(1, Math.round(per * step));
  const ch = Math.max(1, Math.round((per - 1) * drop + bb.h));
  const c = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(cw, ch)
    : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let i = 0; i < per; i += 1) {
    // Le premier panneau est en HAUT de la bande (il est le plus au nord) ; les
    // suivants descendent. Horizontalement ils partent de la gauche pour n/s et de
    // la droite pour e/w.
    const dx = right ? i * step : (cw - bb.w - i * step);
    const dy = i * drop;
    g.drawImage(art.img, bb.x0, bb.y0, bb.w, bb.h, Math.round(dx), Math.round(dy), bb.w, bb.h);
  }
  const rec = { canvas: c, cw, ch, panelH: bb.h, per, right };
  _fenceStrips.set(key, rec);
  return rec;
}
let _fenceCache = { key: '', list: null };
function isoFencesFor(L, band) {
  const era = plazaEraForBand(band);
  if (!L || !FENCE_ISO.on || !FENCE.on || !era) return NO_FENCES;
  const key = CM.layoutRecomputeAt + ':' + band + ':' + FENCE_ISO.p
    + ':' + FENCE_ISO.minRun + ':' + (COUR.on ? 1 : 0) + ':' + FENCE.cap;
  if (_fenceCache.key === key && _fenceCache.list) return _fenceCache.list;
  const T = CM.TILE;
  const hT = personHT() * FENCE_ISO.p;
  const list = [];
  // ⚠ Les entrées viennent de `fenceInputs`, jamais d'un `matOf` local : le compteur
  // et la pose doivent voir la MÊME carte de matières, sinon `__tissu()` annonce un
  // nombre qui n'est pas celui des panneaux dessinés. Une copie a déjà dérivé ici.
  const brutes = fenceEdges(fenceInputs(L));
  // FILTRE DE LIGNE (cf. FENCE_ISO.minRun). Une arête ne se garde que si elle
  // appartient à une suite contiguë assez longue, le long de SON axe : les côtés
  // n/s se suivent en gx à gy fixe, les côtés e/w en gy à gx fixe.
  let edges = brutes;
  if (FENCE_ISO.minRun > 1) {
    const vues = new Set();
    for (const e of brutes) vues.add(e.side + ':' + e.gx + ':' + e.gy);
    const long = (e) => {
      const horiz = e.side === 'n' || e.side === 's';
      let n = 1;
      for (const dir of [-1, 1]) {
        let gx = e.gx, gy = e.gy;
        for (;;) {
          if (horiz) gx += dir; else gy += dir;
          if (!vues.has(e.side + ':' + gx + ':' + gy)) break;
          n += 1;
        }
      }
      return n;
    };
    edges = brutes.filter((e) => long(e) >= FENCE_ISO.minRun);
  }
  // COMBIEN DE PANNEAUX PAR ARÊTE. C'est ici que se joue la continuité, et ça se
  // calcule au lieu de se deviner : une arête de cellule mesure hypot(hw, hh) px à
  // l'écran, un panneau en mesure `hT × T × (largeur d'encre / hauteur d'encre)`.
  // Un seul panneau par arête laissait 11 px de vide — le défaut vu en capture.
  //
  // ⚠ Pas besoin de DÉCOUPER le sprite : la palissade est faite de planches
  // verticales uniformes, donc le panneau entier se répète sans couture visible. La
  // découpe en 3 tranches (comme l'aqueduc) ne servirait qu'à éviter des poteaux
  // d'about répétés — or ce panneau n'en a pas, ses bords sont des planches.
  const FENCE_INK = 21 / 31;                       // encre mesurée sur les 20 PNG
  const edgePx = Math.hypot(T * ISO_X, T * ISO_Y); // longueur d'une arête, à zoom 1
  const panelPx = Math.max(1, hT * T * FENCE_INK);
  const per = Math.max(1, Math.min(10, Math.ceil(edgePx / panelPx)));
  for (const e of edges) {
    // UNE fiche par arête, pas une par panneau : la répétition est CUITE dans la
    // bande (cf. `fenceStrip`). La profondeur se prend au MILIEU de l'arête, plus
    // représentative que son coin, et chaque arête trie donc pour elle-même — le
    // peintre garde sa granularité par cellule.
    const horiz = e.side === 'n' || e.side === 's';
    const sx = e.gx + (e.side === 'e' ? 1 : 0);            // coin de DÉPART de l'arête
    const sy = e.gy + (e.side === 's' ? 1 : 0);
    const mx = (sx + (horiz ? 0.5 : 0)) * T;
    const my = (sy + (horiz ? 0 : 0.5)) * T;
    list.push({
      kind: 'fence', side: e.side, per, hT,
      wx: sx * T, wy: sy * T,                              // ancre = coin de départ
      d: depthOf(mx, my),
    });
  }
  _fenceCache = { key, list };
  CM._fences = list;
  if (typeof window !== 'undefined') window.__fencesCount = list.length;
  return list;
}
if (typeof window !== 'undefined') {
  window.__fences = (arg) => {
    if (arg === false) FENCE_ISO.on = false;
    else if (arg && typeof arg === 'object') { FENCE_ISO.on = true; Object.assign(FENCE_ISO, arg); }
    else FENCE_ISO.on = true;
    _fenceCache = { key: '', list: null };
    return { ...FENCE_ISO, poses: window.__fencesCount | 0, dessinees: CM._fencesDrawn | 0 };
  };
}
// Coin SUD (clé peintre, px monde wx+wy) de chaque cellule couverte par un bâtiment
// DEBOUT. Les empreintes à plat (champs) trient au coin nord comme le sol → exclues.
// (Une exception « aqueduc » vivait ici — la conduite se rendait en TRANCHES, donc
//  coin sud LOCAL par colonne. Devenue un point d'eau 1×1, elle n'a plus de colonnes
//  et retombe sur le cas commun, où dCell vaut exactement dSouth.)
function isoSolidSouthCorners(L, T) {
  const m = new Map();
  for (const t of (L.tiles || [])) {
    const idf = t.buildingId || t.variant || '';
    if (/field|farm|crop|orchard/i.test(idf)) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const dSouth = ((t.gx + sx) + (t.gy + sy)) * T;
    for (let ix = 0; ix < sx; ix += 1) {
      for (let iy = 0; iy < sy; iy += 1) m.set((t.gx + ix) + ':' + (t.gy + iy), dSouth);
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
// step : espacement des mâts en cellules le long d'une rue. paths : un sentier
// s'éclaire-t-il ? (lot L6 de docs/PLAN-TISSU-URBAIN.md — voir computeIsoLamps.)
const LAMP_TUNE = { h: 0.8, headF: 0.8, curb: 0.05, step: 3, paths: false };
if (typeof window !== 'undefined') {
  window.__lampTune = (o) => {
    if (o) Object.assign(LAMP_TUNE, o);
    _isoLampCache = { at: -1, key: '', lamps: null };   // step/paths repeuplent la liste
    return { ...LAMP_TUNE };
  };
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
// Terre-plein « comme la place » (2026-08-03, après rejet de la bande sprite
// 3-slice « étirée, peu de relief ») : le SOL est une capsule d'herbe bakée
// (voir drawIsoGround), les buissons du jeu se posent PAR-DESSUS au peintre.
// ext = ajustement des bouts (fraction de tuile MONDE de chaque côté). Depuis la
// capsule à bouts RONDS, l'arrondi (wtp 0.26) dépasse déjà du segment : l'ancien
// prolongement 0.32 hérité des bouts droits 3-slice envoyait la pointe à 0.58 T
// dans la cellule voisine — elle mordait trottoir et pavé (« pourquoi dépasse-t-il
// sur le sol ? », Raph). ext NÉGATIF = léger retrait : pointe à ~0.21 T, sur le
// trottoir de la transversale, jamais sur sa chaussée ni sur le sol.
const MEDIAN_TUNE = { ext: -0.05 };
if (typeof window !== 'undefined') {
  window.__medianExt = (v) => { if (typeof v === 'number') MEDIAN_TUNE.ext = v; return MEDIAN_TUNE.ext; };
}
// Palettes de PARTERRES du terre-plein (réfs municipales de Raph 2026-08-03) :
// massifs à DOMINANTE (jaune/orange, rouge/rose, lavande, mix) + blanc d'accent,
// tirés par hash de slot — deux parterres voisins n'ont pas la même robe.
const BED_PALETTES = [
  [[244, 216, 102], [232, 168, 72], [240, 242, 228]],   // jaune / orange
  [[224, 104, 96], [236, 152, 178], [240, 242, 228]],   // rouge / rose
  [[184, 148, 216], [150, 132, 220], [240, 242, 228]],  // lavande / violet
  [[244, 216, 102], [224, 104, 96], [184, 148, 216]],   // mix vif
];
// Slots décoratifs du terre-plein : PARTERRE (dessiné au bake) et BUISSON (item
// du peintre) alternés le long de la couture, période fixe. Les deux passes
// lisent CETTE liste — même géométrie, même hash, zéro chevauchement.
function medianSlots(seg, T) {
  const ext = MEDIAN_TUNE.ext * T;
  let ax, ay, ux, uy, len;
  if (seg.axis === 'h') {
    ax = seg.x0 * T - ext; ay = (seg.y + 1) * T;
    ux = 1; uy = 0; len = (seg.x1 + 1) * T + ext - ax;
  } else {
    ax = (seg.x + 1) * T; ay = seg.y0 * T - ext;
    ux = 0; uy = 1; len = (seg.y1 + 1) * T + ext - ay;
  }
  const out = [];
  const P = T * 1.25, margin = T * 0.62;    // 1er slot passé l'arrondi du bout
  const key = seg.axis + ':' + (seg.axis === 'h' ? seg.y + ':' + seg.x0 : seg.x + ':' + seg.y0);
  for (let t = margin, i = 0; t <= len - margin; t += P, i += 1) {
    out.push({ kind: (i & 1) ? 'bush' : 'bed', wx: ax + ux * t, wy: ay + uy * t, h: cmHash('tps:' + key + ':' + i) });
  }
  return out;
}
if (typeof window !== 'undefined') window.__medianSlots = medianSlots;   // sonde dev
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
// `bandMix` : part de la teinte du CORPS D'EAU dans le reflet (Raph, 2026-07-30 —
// « fais suivre les reflets au coloris »). ⚠ Correction d'une erreur que j'avais
// écrite : ces reflets ne sont PAS bleu-gris ardoise, ce sont les LAMPES DE QUAI
// de l'ère (chaud, cyan, vert néon…). Les repeindre entièrement à la couleur de
// l'eau effacerait cette lecture par ère. On les tire donc vers la teinte de
// l'eau sans les y noyer : un reflet sur de l'azur prend un cast bleu, ce qui est
// aussi ce que fait la vraie eau. 0 = lampe pure, 1 = eau pure.
export const cityReflectionTune = { on: true, gain: 1, stride: 2, reach: 1, bandMix: 0.35 };
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
  // Teintes reprises telles quelles du legacy (accordées aux lampes de quai),
  // puis tirées vers la teinte de l'eau courante (cf. bandMix).
  const lamp = band <= 5 ? '255,210,140'
    : band === 6 ? '150,225,255'
      : band === 7 ? '90,240,180' : band === 8 ? '255,205,120' : '170,140,255';
  const glow = (() => {
    const w = CM.waterShore && CM.waterShore.wash;
    const k = Math.max(0, Math.min(1, RT.bandMix != null ? RT.bandMix : 0));
    if (!w || k <= 0) return lamp;
    const a = lamp.split(',').map(Number), b = w.split(',').map(Number);
    return a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',');
  })();
  const nAt = (i) => {
    const o = sm[Math.max(0, i - 1)], q = sm[Math.min(n0 - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1;
    return { nx: -ty / tl, ny: tx / tl };
  };
  ctx.save();
  riverRibbonPath(ctx, sm, T);
  ctx.clip(WATER_FILL);                                                // les nappes restent SUR l'eau
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
        const th = T * z * treeCanvasT(a.r);             // hauteur du sprite d'arbre (suit l'ère)
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
      const th = T * z * treeCanvasT(a.r);
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
  // Dos d'âne du pont sprite : attelages et porteurs montent avec le tablier.
  p.y -= bridgeLiftScreen(wx, wy);
  if (v.type === 'basket') {                       // porteurs de panier (ères anciennes)
    // Le porteur marche sur une route, donc toujours en biais à l'écran : vue
    // DIAGONALE si sa bande est livrée (même contrat que les habitants d'ère,
    // animation par DISTANCE via l'odomètre v.rollDist), sinon repli cardinal.
    const nm = v.woman ? 'basket-woman' : 'basket-man';
    const walking = (v.pauseT || 0) <= 0;
    // 1.24 = compensation des bandes FLAT (ratio perso/canvas 0.50 vs 0.73 avant,
    // cf. tables AGENT_* d'agents.js) — diagonales ET cardinales régénérées 2026-08-03.
    if (!drawNamedAgentIso(ctx, p.x, p.y, z, nm, 1.24, v.dir, walking, now, v.x * 0.02, 1, v.rollDist != null ? v.rollDist : null)) {
      drawNamedAgent(ctx, p.x, p.y, z, nm, 1.24, v.dir, walking, now, v.x * 0.02);
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
  // Skin d'INSTANCE de la flotte moderne (veh-car-sedan-red-…) : tiré au spawn,
  // chargé paresseusement. Tant qu'il n'est pas arrivé — et il arrive une frame
  // ou deux après l'apparition du véhicule — on dessine la bande NUE du type
  // plutôt que rien : `car` a encore sa vieille automobile pour ça.
  let dchr = v.skin ? ensureVehDiag(v.type, v.skin) : null;
  let onSkin = vehDiagReady(dchr);
  if (!onSkin) dchr = ensureVehDiag(v.type);
  if (vehDiagReady(dchr)) {
    // ⚠ LA CORRECTION D'ÉTIQUETAGE SUIT LA BANDE, PAS LE TYPE. VEH_DIAG_MAP
    // rattrape une inversion sud↔sud des rotations PixelLab ; les bandes du pack
    // MinZinn, elles, sont nommées juste. Appliquer la correction `car` à un skin
    // ferait rouler les berlines de travers — et seulement dans deux directions
    // sur quatre, le genre de bug qu'on ne voit qu'en suivant une voiture.
    const map = (onSkin ? VEH_DIAG_MAP.default : VEH_DIAG_MAP[v.type]) || VEH_DIAG_MAP.default;
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
    // ⛔ PAS D'ELLIPSE D'OMBRE SOUS UN VÉHICULE (Raph 2026-08-05) : les sprites
    // portent leur propre ombre de contact, la tache du moteur faisait doublon.
    // Cf. le même retrait dans drawOneVehicle (chemin legacy).
    ctx.drawImage(img, fr * fh, 0, fh, fh, p.x - dw / 2, p.y - dh / 2, dw, dh);
  };
  // Attelage : bête(s) de trait DEVANT dans le sens de marche (monde → projeté).
  const pull = VEH_PULL[v.type];
  let drawTeam = null, teamBelow = false;
  if (pull) {
    const D = (pull.dist || 0.44) * T * VEH_SCALE;
    const front = [[D, 0], [-D, 0], [0, D], [0, -D]][v.dir] || [0, 0];
    const ap = worldToScreen(wx + front[0], wy + front[1]);
    // Dos d'âne : la BÊTE monte aussi, et à SA position — sur la rampe elle
    // précède la carrosserie donc elle est déjà plus haut. Sans ça l'attelage
    // restait au niveau du sol et traversait le tablier (retour Raph : « les
    // animaux ne montent pas dessus »).
    ap.y -= bridgeLiftScreen(wx + front[0], wy + front[1]);
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
    pp.y -= bridgeLiftScreen(wx + back[0], wy + back[1]);   // idem attelage
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
  // Dos d'âne du pont sprite : l'émeute aussi passe par-dessus, pas au travers.
  sp.y -= bridgeLiftScreen(p.x + laneX, p.y + laneY);
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
      g2.addColorStop(0, `rgba(255,120,40,${(0.2 * (CM.nightF || 0) * flick).toFixed(2)})`);
      g2.addColorStop(1, 'rgba(255,90,20,0)');
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
  // Scènes DE SOL (champs irrigués) : elles PEIGNENT leur emprise en repère
  // carré → posées en boîte, elles font une dalle qui déborde du lot (vu à la
  // capture : irrigated_fields 10×6 par-dessus le fleuve). Elles retombent sur
  // le rendu d'emprise iso dédié (parcelle plate à sillons).
  if (/field|farm|crop|orchard/i.test(id)) return false;
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
  // GRAIN G1.2 (PLAN-EGALISATION-GRAIN §4.2) : plancher de densité aux petites
  // empreintes. Un moteur d'empreinte 1 (spanSum 2) dessinait ses portes moitié
  // moins hautes qu'à l'atelier (spanSum 4) — 4 % du corpus en bande, mesuré en
  // G0. On regonfle la boîte VERS la densité atelier, sans jamais la dépasser ;
  // le débord de lot qui en résulte est le pendant du clamp maisons, assumé aux
  // toutes premières empreintes. Molette : __grainFloor (0 = off).
  if (grainTune.on && grainTune.floor > 0 && spanSum > 0 && spanSum < 4) {
    bw *= Math.max(1, Math.min(grainTune.floor * (4 / spanSum), 4 / spanSum));
  }
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
  // ── HORLOGE PROPRE À L'INSTANCE ───────────────────────────────────────────
  // Sans elle, tous les ateliers d'un type jouent la MÊME image au même instant
  // (le `now` de la frame est global) : le quartier bat à l'unisson. Le décalage
  // se pose ici, une fois, et TOUTE la scène en hérite — les ~120 blocs animés
  // des deux fichiers de scènes n'ont rien à savoir. Coût : une multiplication
  // et une addition par scène (graine mémoïsée sur la tuile). cf. engineAnim.js.
  const aNow = engineAnimNow(t, now);
  try {
    // SURVOL : la silhouette se pose AVANT la scène, sinon elle la mange au
    // lieu de la cerner (même geste que les habitations). Elle lit `aNow` comme
    // la scène : un liseré tracé sur une AUTRE image que celle dessinée juste
    // après cernerait une silhouette que le bâtiment n'a pas.
    if (CM.hover && CM.hover.tile === t) drawIsoEngineOutline(t, bx, by, bw, aNow, HOVER_GOLD);
    // SCÈNE CUITE (engineSceneCache) : plans statiques blittés, animé en direct.
    // false = cache indisponible (molette off, échelle hors bornes, cuisson
    // échouée) → dessin direct intégral, comme avant.
    // ⚠ LES DEUX TEMPS sont passés, et ce n'est pas de la coquetterie : `now`
    // sert la CLÉ du cache (son époque est mémoïsée sur la frame — un temps par
    // instance la ferait recalculer par scène, le piège des huit concaténations
    // documenté là-bas), `aNow` ne sert que la passe animée.
    if (!drawCachedEngineScene(ctx, t, bx, by, bw, now, aNow)) {
      drawEngineSprite(t, bx, by, bw, bw, aNow);
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
    // `now` brut et non `aNow` : cette mesure est MÉMOÏSÉE par (id, tier, ère) et
    // partagée par toutes les instances — lui donner un temps par instance ne
    // changerait que l'image sur laquelle tombe la toute première mesure.
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
// empreintes À PLAT (champs, triées au coin nord — jamais occultantes) et POINTS
// D'EAU exclus. Ces derniers restent dehors non par héritage de l'aqueduc mais
// parce qu'un puits est un PROP, pas un bâtiment : le calcul de fiche suppose une
// façade qui occulte, or aucun prop de place (banc, fontaine) n'y figure non plus.
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
    if (/field|farm|crop|orchard|aqueduct/i.test(idf)) continue;   // à plat (champs) / prop (point d'eau)
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
// isoUnitDepthEx renvoie AUSSI `hidden` : vrai quand un occulteur franc au sud plafonne
// l'unité (elle sera dessinée AVANT lui, donc recouverte par son sprite s'il est assez
// haut) — c'est le signal de la passe SILHOUETTE FANTÔME. Objet de sortie PARTAGÉ
// (zéro alloc, ~600 appels/frame) : à consommer immédiatement, ne pas retenir.
const _depthOut = { d: 0, hidden: false };
export function isoUnitDepthEx(wx, wy) {
  const d = wx + wy;
  _depthOut.d = d; _depthOut.hidden = false;
  if (!isoUnitDepthFlag.on) return _depthOut;
  const F = isoUnitFiches();
  if (!F) return _depthOut;
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
  _depthOut.d = out > d ? out : d;
  _depthOut.hidden = cap < Infinity;
  return _depthOut;
}
export function isoUnitDepth(wx, wy) {
  return isoUnitDepthEx(wx, wy).d;
}

// Dessin d'UN habitant du tri peintre (partagé entre la passe normale et la passe
// silhouette fantôme — même rendu, seul globalAlpha diffère).
function drawIsoCitizenItem(ctx, p, now, z) {
  const sp = worldToScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
  // Dos d'âne du pont sprite : le piéton suit le tablier (rampes + plateau).
  sp.y -= bridgeLiftScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
  const walking = (p.pauseT || 0) <= 0;
  // Vue DIAGONALE (Phase 4) si la bande existe, sinon bande cardinale.
  // p.walkDist = odomètre → animation par DISTANCE (anti-patinage).
  if (!drawEraAgentIso(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0, 1, p.walkDist != null ? p.walkDist : null)) {
    drawEraAgent(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0);
  }
}

// Silhouettes fantômes : réglage live. __ghost({ on: false }) coupe, __ghost({ alpha: 0.5 })
// renforce. L'alpha par défaut est volontairement discret — on devine, on ne lit pas.
const GHOST_TUNE = { on: true, alpha: 0.34 };
if (typeof window !== 'undefined') {
  window.__ghost = (o) => { if (o) Object.assign(GHOST_TUNE, o); return { ...GHOST_TUNE }; };
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
// Surcouche plein écran : gouttes tracées en PIXELS et inclinées par le vent
// (cf. rainStreakPixels), position = fonction pure de (phase, index) comme les
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
// rafales, width: 0.6 rend le filet d'un pixel d'avant. `on: false` ne coupe que
// le RIDEAU : le ciel reste chargé et les impacts continuent (c'est le geste
// qu'on fait pour juger les éclats seuls, cf. __splash).
const RAIN_TUNE = { on: true, drops: 1, len: 1, alpha: 1, gust: 1, width: 1 };
if (typeof window !== 'undefined') {
  window.__rain = (o) => {
    if (o) Object.assign(RAIN_TUNE, o);
    return { ...RAIN_TUNE, etampes: rainStamps.size, forges: rainStampBuilds };
  };
}
const RAIN_CAP = 900;
const RAIN_FALL_PX = 900;      // px/s de la goutte la plus LENTE (les autres, jusqu'à ×1,78)
const GUST_DROPS = 0.8;        // rideau de rafale : + 80 % de densité, en FONDU (cf. drawRainVeil)
const GUST_SPEED = 0.5;        // + 50 % de vitesse de chute
const GUST_LEAN = 0.55;        // + 55 % d'inclinaison, plus une poussée plancher
const GUST_KICK = 0.15;        // ...sinon une averse sans vent ne se couche pas du tout
const RAIN_COL = [186, 206, 232];
// ⚠ DEUX RÉGLAGES RETIRÉS avec le passage aux nappes (cf. plus bas) : le rideau
// de rafale ne peut plus être NI plus long (GUST_LEN, +45 %) NI plus clair
// (sa propre teinte) que celui du fond, puisqu'il RÉUTILISE ses nappes. Il garde
// ce qui portait l'effet : la densité en fondu, la vitesse, et l'inclinaison —
// laquelle profite aussi au fond, dont la nappe se reforge sous la bourrasque.

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

// ── LA GOUTTE EST UN PIXEL, PAS UN TRAIT LISSÉ ──────────────────────────────
// Le rideau était le dernier élément ANTICRÉNELÉ de la carte. Un segment
// diagonal posé à coordonnées fractionnaires est étalé par l'anticrénelage sur
// deux colonnes à demi-opacité : la goutte paraît plus FINE et plus PÂLE qu'un
// vrai pixel — c'est ce qui avait fait épaissir le filet le 2026-07-29, un
// pansement sur le lissage. La neige, juste en dessous, est déjà en pixels
// pleins (`fillRect` à coordonnées ARRONDIES) ; la pluie s'y aligne.
//
// ⛔ SURTOUT PAS UN SPRITE DESSINÉ. L'inclinaison n'est pas figée : elle vit
// avec `windX` et enfle sous rafale (cf. gustWind). Un dessin à angle fixe ne se
// recolle qu'en le DÉFORMANT, et une skew sur du pixel rend du flou — soit
// exactement ce qu'on cherche à supprimer. On trace donc la goutte en escalier,
// à l'entier, une fois par rideau, et on la ré-étampe telle quelle.
const RAIN_TAIL = 0.34;          // opacité de la QUEUE : le dégradé fait la goutte, pas la longueur
const RAIN_STAMP_MAX = 64;       // le vent bouge en continu : la table se purge, elle n'enfle pas

// Pixels d'une goutte : escalier de la queue (0,0) vers la tête (dx,dy), pointe
// épaissie, queue effacée. Pur et exporté — c'est la CONTINUITÉ de l'escalier
// qui compte et aucune image ne la montre. ⚠ LE PAS SUIT L'AXE MAJEUR : à vent
// fort dx dépasse dy, et un pixel par LIGNE laisserait alors des trous en
// colonne (cf. le témoin du test).
export function rainStreakPixels(dx, dy, w = 1) {
  const X = Math.round(dx), Y = Math.max(1, Math.round(dy));
  const th = Math.max(1, w | 0);
  const steps = Math.max(Math.abs(X), Math.abs(Y));
  const ox = X < 0 ? -X : 0;                       // la queue n'est pas au bord quand le vent souffle à gauche
  const sw = Math.abs(X) + th, sh = Math.abs(Y) + th;
  const at = new Map();
  for (let s = 0; s <= steps; s += 1) {
    const u = s / steps;
    const a = RAIN_TAIL + (1 - RAIN_TAIL) * u * u;
    const tw = Math.max(1, Math.round(1 + (th - 1) * u));   // la goutte S'ÉFFILE vers l'arrière
    const px = ox + Math.round(X * u), py = Math.round(Y * u);
    for (let bx = 0; bx < tw; bx += 1) {
      for (let by = 0; by < tw; by += 1) {
        const k = (py + by) * sw + (px + bx);
        if (!(at.get(k) >= a)) at.set(k, a);       // la tête l'emporte sur la queue au recouvrement
      }
    }
  }
  const px = [];
  for (const [k, a] of at) px.push({ x: k % sw, y: (k / sw) | 0, a });
  return { w: sw, h: sh, ox, px };
}

// Étampe d'un rideau : un seul dessin pour toutes ses gouttes. Géométrie
// QUANTIFIÉE à 2 px — l'angle et la longueur glissent en continu pendant les
// 480 ms d'attaque de la rafale, sans quoi on reconstruirait une étampe par
// image. À cette taille, 2 px de longueur ne se voient pas tomber.
const rainStamps = new Map();
let rainStampBuilds = 0;          // diagnostic : une étampe neuve coûte un canvas + un putImageData
function rainStamp(dx, dy, w, rgb) {
  const kx = Math.round(dx / 2) * 2, ky = Math.max(2, Math.round(dy / 2) * 2);
  const kw = Math.max(1, w | 0);
  const key = kx + ',' + ky + ',' + kw + ',' + rgb;
  const hit = rainStamps.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  rainStampBuilds += 1;
  const s = rainStreakPixels(kx, ky, kw);
  const cv = document.createElement('canvas');
  cv.width = s.w; cv.height = s.h;
  const c2 = cv.getContext('2d');
  const img = c2.createImageData(s.w, s.h), d = img.data;
  const R = +rgb[0], G = +rgb[1], B = +rgb[2];
  for (let i = 0; i < s.px.length; i += 1) {
    const p = s.px[i], o = (p.y * s.w + p.x) * 4;
    d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = Math.round(p.a * 255);
  }
  c2.putImageData(img, 0, 0);
  const out = { cv, ox: s.ox };
  if (rainStamps.size >= RAIN_STAMP_MAX) rainStamps.clear();
  rainStamps.set(key, out);
  return out;
}

// ── LE RIDEAU DÉFILE, IL NE SE REDESSINE PAS GOUTTE PAR GOUTTE ──────────────
// Étamper les gouttes une à une, c'est UN APPEL DE DESSIN PAR GOUTTE : 617 sur
// la fenêtre de Raph, 1111 sous rafale quand le second rideau s'ajoute. À ~1,5 µs
// l'appel ça fait près de 2 ms, et il l'a senti (« ça ralentit un peu ») alors
// que le profileur de frame ne voyait RIEN — la pane ne compose pas, elle empile
// les commandes sans jamais payer le rendu (cf. la fiche du harnais).
//
// Or les gouttes tombent TOUT DROIT : le vent penche leur FORME, pas leur
// trajectoire (dans le rideau d'avant, x était fixe et seul y avançait). Un
// rideau est donc une NAPPE qui défile, et une nappe se blitte en deux appels.
// Les gouttes sont réparties sur QUATRE nappes de vitesses différentes — c'est
// leur glissement les unes sur les autres qui garde le rideau dispersé ; une
// nappe unique tomberait d'un bloc et ça se verrait. La frame coûte 8 appels au
// lieu de 617, et 16 sous rafale au lieu de 1111.
//
// ⚠ BOUCLAGE EN Y : la nappe se répète tous les H pixels, donc une goutte qui
// déborde en bas doit AUSSI être peinte H plus haut. Sans ça, une bande vide
// large d'une goutte traverse l'écran à chaque tour — une ligne d'horizon qui
// descend, impossible à ne plus voir une fois repérée.
//
// ⚠ COÛT MÉMOIRE : quatre canvas plein écran (~27 Mo sur une grande fenêtre).
// Ils sont LIBÉRÉS dès que l'averse s'arrête — la pluie ne tombe que 12 % du
// cycle, rien ne justifie de les garder au sec.
const RAIN_LANES = 4;
const LANE_SPEED = [1, 1.26, 1.52, 1.78];   // même éventail qu'au temps du (1 + sd2 × 0,78) par goutte
let rainVeil = null;

// Où semer les gouttes d'une nappe, et sur quelle voie. DEUX POSES PAR GOUTTE :
// la sienne, et la même H plus haut — c'est ce doublon qui fait que la nappe se
// raccorde à elle-même quand elle reboucle. Pur et exporté : la couture est
// invisible sur une image fixe, elle ne se trahit qu'en mouvement, et trop tard.
export function rainVeilDraws(n, lw, lh, ox = 0) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const sd = _rnd(i, 1), sd2 = _rnd(i, 2);
    const lane = i % RAIN_LANES;
    const x = Math.round(_frac(sd2 + sd * 0.37) * lw) - ox;
    const y = Math.round(sd * lh);
    out.push({ lane, x, y }, { lane, x, y: y - lh });
  }
  return out;
}

// La nappe pour une géométrie donnée, reforgée seulement quand elle change.
// ⚠ QUANTIFIER, sinon on reforge à CHAQUE IMAGE : sous rafale l'inclinaison et
// la longueur glissent en continu pendant les 480 ms d'attaque. Au pas de 4 px
// une bourrasque coûte cinq reforges au lieu de trente.
function rainVeilFor(n, dx, dy, th, W, H) {
  if (typeof document === 'undefined' || n <= 0) return null;
  const dpr = CM.dpr || 1;
  const kdx = Math.round(dx / 4) * 4, kdy = Math.max(2, Math.round(dy / 4) * 4);
  const kn = n < 24 ? n : Math.round(n / 8) * 8;
  const marge = Math.abs(kdx) + th + 8;
  const lw = W + marge * 2, lh = Math.max(1, H);
  const key = [kn, kdx, kdy, th, lw, lh, dpr].join(',');
  if (rainVeil && rainVeil.key === key) return rainVeil;
  const st = rainStamp(kdx, kdy, th, RAIN_COL);
  if (!st) return null;
  const V = rainVeil && rainVeil.cv.length === RAIN_LANES ? rainVeil
    : { key: '', marge: 0, lw: 0, lh: 0, cv: [], cx: [] };
  const pw = Math.max(1, Math.round(lw * dpr)), ph = Math.max(1, Math.round(lh * dpr));
  for (let l = 0; l < RAIN_LANES; l += 1) {
    let cv = V.cv[l];
    if (!cv) { cv = V.cv[l] = document.createElement('canvas'); V.cx[l] = cv.getContext('2d'); }
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const c2 = V.cx[l];
    if (!c2) return null;
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);   // même repère que CM.ctx : on peint en pixels LOGIQUES
    c2.clearRect(0, 0, lw, lh);
    c2.imageSmoothingEnabled = false;
  }
  // La nappe est plus large que l'écran (les gouttes de bord doivent être
  // ENTIÈRES) : on sème donc au prorata, sans quoi la marge diluerait l'averse.
  const plan = rainVeilDraws(Math.round(kn * (lw / Math.max(1, W))), lw, lh, st.ox);
  for (let i = 0; i < plan.length; i += 1) {
    const d = plan[i];
    V.cx[d.lane].drawImage(st.cv, d.x, d.y);
  }
  V.key = key; V.marge = marge; V.lw = lw; V.lh = lh;
  rainVeil = V;
  return V;
}

// Un rideau = les quatre nappes posées à leur avancement propre. `tour` fait
// tourner l'attribution nappe↔vitesse : le rideau de rafale réutilise les mêmes
// dessins que celui du fond, et sans ce décalage les deux se superposeraient
// EXACTEMENT chaque fois que leurs phases se rejoignent — la bourrasque se
// lirait alors comme un coup d'opacité au lieu d'un surcroît de gouttes.
function drawRainVeil(ctx, V, phase, tour, alpha) {
  if (!(alpha > 0.002)) return;
  ctx.globalAlpha = Math.min(1, alpha);
  for (let l = 0; l < RAIN_LANES; l += 1) {
    const cv = V.cv[(l + tour) % RAIN_LANES];
    const s = Math.round(_frac(phase * LANE_SPEED[l]) * V.lh);   // à l'ENTIER : la nappe reste sur la grille
    ctx.drawImage(cv, -V.marge, s, V.lw, V.lh);
    ctx.drawImage(cv, -V.marge, s - V.lh, V.lw, V.lh);
  }
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
  const kind = precipKind(CM.season, r);
  // Horloge relâchée (l'averse suivante repart à plat) ET nappes rendues : elles
  // pèsent des dizaines de mégaoctets, et le ciel est dégagé 88 % du cycle.
  if (kind === 'none') { rainPhaseAt = -1; rainVeil = null; splashes.length = 0; return; }
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
  // Les impacts D'ABORD : ils sont au SOL, le rideau leur passe devant. Ils sont
  // aussi AVANT la molette du rideau et avant le compte de gouttes — sans quoi
  // `__rain({on:false})` couperait tout et il n'y aurait aucun moyen de juger
  // les éclats seuls, ce qui est précisément le geste qu'on fait pour les régler.
  drawIsoSplashes(now, r, g);
  if (!RAIN_TUNE.on) return;
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
  // ÉPAISSEUR DE LA GOUTTE, en pixels PLEINS — 2 px de tête sous l'averse, 1 px
  // sur une bruine, la rafale ajoutant sa part comme au reste. C'est la même
  // courbe qu'au temps du trait lissé (retour Raph 2026-07-29 : « le filet est un
  // peu trop fin »), sauf qu'elle épaississait alors pour COMPENSER
  // l'anticrénelage ; ici elle dessine vraiment la goutte, et la queue s'affine
  // toute seule dans l'étampe.
  const th = Math.max(1, Math.round((1 + 0.6 * r + 0.35 * g) * RAIN_TUNE.width));
  const lenB = len * (1 + 0.25 * g);
  const V = rainVeilFor(n, wind * lenB * 0.8, lenB, th, W, H);
  if (!V) { ctx.imageSmoothingEnabled = prevAA; return; }
  // L'opacité passe par le CONTEXTE et non par la couleur : l'étampe porte déjà
  // son propre dégradé tête/queue, on ne fait que la doser.
  const prevAlpha = ctx.globalAlpha;
  drawRainVeil(ctx, V, st.phase, 0, 0.42 * r * RAIN_TUNE.alpha);
  // RIDEAU DE RAFALE — les mêmes nappes, repassées plus vite et à une autre
  // attribution de vitesses, dont seule l'OPACITÉ suit la bouffée. La densité
  // doit enfler par FONDU et jamais par le nombre : ajouter des gouttes les
  // ferait NAÎTRE en plein vol (le compte se lit en bout de liste).
  if (g > 0.02) drawRainVeil(ctx, V, st.phase * 1.18, 2, 0.42 * r * g * GUST_DROPS * RAIN_TUNE.alpha);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevAA;
}

// ── IMPACTS AU SOL ──────────────────────────────────────────────────────────
// Ce qui fait lire « il pleut » n'est pas le rideau, c'est ce que la pluie FAIT
// au sol. Trois images : le choc, un anneau qui s'ouvre, un anneau plus large
// qui s'efface.
//
// ⚠ L'ANNEAU EST ISO, jamais un rond. Le sol est un losange vu de trois quarts :
// un cercle posé dessus se lit comme une bille qui flotte au-dessus du pavé.
// Deux fois plus large que haut, comme la tuile.
//
// ⚠ UN POOL, PAS UNE FONCTION DU TEMPS. Tout le reste de l'ambiance est pur en
// (index, temps) — ici c'est impossible : un éclat est ancré au SOL, et une
// position tirée en coordonnées ÉCRAN glisserait sur le pavé dès que Raph
// déplace la carte (un quart de seconde de vie, mais 100 px de dérive sur un
// drag). On garde donc la position MONDE de chaque éclat, et on la reprojette.
//
// ⚠ OÙ ON A LE DROIT DE FRAPPER. La pluie passe APRÈS le peintre : à ce moment
// les bâtiments sont déjà posés, et un éclat n'a plus aucun moyen de passer
// derrière eux. On ne frappe donc que la VOIRIE, et on écarte les points qu'un
// sprite recouvre — sinon l'éclat se pose sur le mur de la maison d'en face.
// La règle n'est pas réinventée : c'est CELLE DU Y-SORT des habitants
// (CM.buildingInfo, cf. agents.js) — base plus SUD, recouvrement de COLONNE,
// et portée du sprite vers le nord. Un test cellulaire « y a-t-il un bâtiment à
// côté ? » se trompe deux fois : il refuse une venelle entière à cause d'une
// scène basse, et il accepte le pied d'une tour.
const SPLASH_TUNE = { on: true, count: 1, size: 1, alpha: 1 };
if (typeof window !== 'undefined') {
  window.__splash = (o) => { if (o) Object.assign(SPLASH_TUNE, o); return { ...SPLASH_TUNE, vivants: splashes.length }; };
}
const SPLASH_LIFE = 260;         // ms de vie de l'ÉCLAT (les trois images)
// ⚠ LA TACHE SURVIT À L'ÉCLAT (demande de Raph). L'eau gicle en un quart de
// seconde, le pavé reste mouillé après — c'est ce décalage qui donne l'averse
// plutôt qu'un clignotement. L'anneau part, le disque sombre s'efface en
// fondu, et l'opacité est CONTINUE au raccord (voir splashPhase).
const SPLASH_WET_TAIL = 900;     // ms de tache seule, après l'anneau (380 était trop court, Raph)
const SPLASH_AREA = 26000;       // px² d'écran par ÉCLAT à pleine averse
// ⚠ La cible compte les éclats VIVANTS, tache comprise : à densité d'anneaux
// constante, allonger la vie multiplie mécaniquement le pool. On la corrige donc
// par le rapport des durées — sans quoi la demande « garder la tache » aurait
// discrètement divisé le nombre d'impacts par deux et demi.
const SPLASH_LIFE_RATIO = (SPLASH_LIFE + SPLASH_WET_TAIL) / SPLASH_LIFE;
const SPLASH_CAP = 200;          // plafond dur : un éclat = un appel de dessin
const SPLASH_TILE_MIN = 18;      // px : sous cette taille de tuile l'éclat n'est que du bruit
const SPLASH_BIRTHS = 6;         // naissances par image : un pool qui se remplit d'un coup pique
// ⚠ ESSAIS PAR NAISSANCE. Le tirage-rejet ne trouve la voirie qu'à hauteur de sa
// PART D'ÉCRAN : sur un village de 70 cellules de route, six essais ne
// remplissaient qu'un dixième du pool (9 éclats pour 82 visés). On insiste — et
// c'est le rejet, pas la cible, qui borne alors la densité : peu de pavé, peu
// d'éclats, ce qui est exactement ce qu'on veut voir.
const SPLASH_TRIES = 14;
const SPLASH_COL = [206, 224, 244];
const SPLASH_WET = [34, 40, 54];   // le pavé MOUILLÉ sous l'anneau, pas une ombre portée
// Cellules d'où un ARBRE peut recouvrir notre pavé : elles sont toutes vers le
// spectateur (+gx, +gy), et le sprite monte d'autant plus loin qu'il est haut.
// Voisinage volontairement LARGE — un rejet de trop est invisible.
const TREE_SHADE = [
  [0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [0, 2], [2, 1], [1, 2],
  [2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3],
];
let splashes = [];
let splashSig = '';

// Cellules portant un arbre (plantés + forêt sauvage visible). Mémoïsé sur la
// LISTE de la forêt elle-même : elle est déjà mise en cache par blocs de 32
// cellules, donc tant que le cadrage ne change pas de bloc, il n'y a rien à
// refaire.
function isoTreeCells(L, b) {
  // ⚠ MÉMOÏSER SUR LES BLOCS, PAS SUR LA LISTE RENDUE. `isoWildForest` refait sa
  // liste dès qu'on l'appelle avec un cadrage qui tombe sur d'autres blocs — et
  // le renderer l'appelle DÉJÀ avec deux marges différentes (drawIsoLive et
  // drawIsoAmbient). Une mémoïsation sur l'identité du tableau reconstruirait
  // donc ces milliers de cellules à chaque image, en silence.
  const at = CM.layoutRecomputeAt || 0;
  const key = at + ':' + Math.floor((b.gx0 - WILD_PAD) / WILD_BLOCK)
    + ':' + Math.floor((b.gx1 + WILD_PAD) / WILD_BLOCK)
    + ':' + Math.floor((b.gy0 - WILD_PAD) / WILD_BLOCK)
    + ':' + Math.floor((b.gy1 + WILD_PAD) / WILD_BLOCK);
  const cache = CM._treeCells;
  if (cache && cache.key === key) return cache.set;
  const wild = isoWildForest(L, b);
  const set = new Set();
  for (const t of (L.trees || [])) set.add(t.gx * 10000 + t.gy);
  for (let i = 0; i < wild.length; i += 1) set.add(wild[i].gx * 10000 + wild[i].gy);
  CM._treeCells = { key, set };
  return set;
}

// Le point monde (wx,wy) peut-il porter un éclat ? `road` = voirie marchable
// (clés gx×10000+gy), `binfo` = fiches peintre des bâtiments (world px).
// Exporté pour le test : une règle d'OCCULTATION ne se voit que sur les rares
// images où elle a échoué, et elle échoue sur un éclat de 5 px qui dure 0,26 s.
export function splashPointOk(road, binfo, trees, wx, wy, T) {
  if (!road) return false;
  const gx = Math.floor(wx / T), gy = Math.floor(wy / T);
  if (!road.has(gx * 10000 + gy)) return false;
  // ⚠ LES ARBRES AUSSI (retour Raph : « il y a des impacts d'eau sur les
  // arbres »). Ils n'ont pas de fiche peintre — leur sprite est simplement HAUT,
  // et la cime d'un arbre planté deux ou trois cellules au sud tombe pile sur le
  // pavé qu'on visait. On les écarte largement plutôt que finement : rater
  // quelques éclats au pied d'un arbre ne se voit pas, un anneau posé sur une
  // canopée se voit tout de suite.
  if (trees) {
    for (let i = 0; i < TREE_SHADE.length; i += 1) {
      const o = TREE_SHADE[i];
      if (trees.has((gx + o[0]) * 10000 + (gy + o[1]))) return false;
    }
  }
  if (!binfo) return true;
  // ⚠ TROIS RANGÉES VERS LE SUD, pas seulement la voisine. Une maison remonte de
  // 2,2 tuiles, mais une TOUR bien plus haut : basée trois rangs plus bas, son
  // sprite recouvre encore notre pavé. Latéralement, en revanche, rien à
  // chercher — une empreinte qui recouvre notre colonne occupe forcément une
  // cellule de notre colonne (les emprises sont rectangulaires).
  for (let d = 1; d <= 3; d += 1) {
    const b = binfo.get(gx * 10000 + (gy + d));
    if (!b) continue;
    if (b.baseY > wy && b.topY <= wy && wx >= b.x0 && wx <= b.x1) return false;
  }
  return true;
}

// Pixels d'un anneau ISO de demi-largeur rx (demi-hauteur = rx/2). `arcs` ne
// garde que les flancs gauche et droit — un anneau qui s'ouvre finit en deux
// virgules, pas en bulle de savon. Pur et exporté.
export function splashRingPixels(rx, arcs = false) {
  const ax = Math.max(1, Math.round(rx));
  // ⚠ ARRONDI VERS LE BAS. Un anneau de 3 px de rayon dont on ARRONDIT la
  // demi-hauteur mesure 7 × 5 px : rapport 1,4, l'œil y lit un rond. À ces
  // tailles le ±1 pixel pèse plus que le rapport visé — dans le doute, plus
  // PLAT, jamais plus rond.
  const ay = Math.max(1, Math.floor(ax / 2));
  const seen = new Set(), px = [];
  const n = Math.max(12, ax * 6);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    if (arcs && Math.abs(c) < 0.42) continue;
    const x = Math.round(c * ax), y = Math.round(Math.sin(a) * ay);
    const k = x + ',' + y;
    if (seen.has(k)) continue;
    seen.add(k); px.push({ x, y });
  }
  return px;
}

// Disque iso PLEIN de demi-largeur rx : le pavé MOUILLÉ à l'intérieur de
// l'anneau. Même ellipse 2:1 que le tour, sinon la tache et l'anneau ne se
// superposent pas.
export function splashDiskPixels(rx) {
  const ax = Math.max(1, Math.round(rx));
  const ay = Math.max(1, Math.floor(ax / 2));
  const px = [];
  for (let y = -ay; y <= ay; y += 1) {
    for (let x = -ax; x <= ax; x += 1) {
      if ((x * x) / (ax * ax) + (y * y) / (ay * ay) <= 1) px.push({ x, y });
    }
  }
  return px;
}

// Opacité PROPRE de la tache, par image. Elle se multiplie par celle du
// contexte (~0,33 à l'instant du raccord), donc ce qui atteint le pavé vaut à
// peine un huitième : monter d'un cran ici ne se lit que d'un poil à l'écran,
// et c'est exactement le geste demandé (Raph, deux fois : la tache, puis « un
// poil plus foncé »). ⚠ MÊME VALEUR aux images 2 et 3 : c'est le raccord.
const WET_A = [0.6, 0.52, 0.4, 0.4];

// Une image d'éclat, en pixels centrés sur le POINT D'IMPACT (0,0). `c` désigne
// la couleur : 0 = l'eau qui gicle (clair), 1 = le sol MOUILLÉ (sombre).
// ⚠ LE SOMBRE EST POUSSÉ EN PREMIER : les pixels suivants écrasent les
// précédents dans l'étampe, et c'est l'anneau clair qui doit gagner sur le bord
// de la tache — l'inverse donnerait un anneau grignoté par endroits.
export function splashFramePixels(frame, unit) {
  const u = Math.max(4, unit);
  if (frame === 0) {
    // Le choc : un noyau ramassé, plus une pointe qui rejaillit. C'est la seule
    // image qui a de la matière claire au centre — les suivantes sont creuses.
    const w = Math.max(1, Math.round(u * 0.035));
    const px = splashDiskPixels(w).map((p) => ({ ...p, a: WET_A[0], c: 1 }));
    for (let x = -w; x <= w; x += 1) px.push({ x, y: 0, a: 1, c: 0 });
    px.push({ x: 0, y: -1, a: 0.7, c: 0 });
    return px;
  }
  if (frame === 1) {
    const rx = Math.max(2, Math.round(u * 0.09));
    const px = splashDiskPixels(rx).map((p) => ({ ...p, a: WET_A[1], c: 1 }));
    for (const p of splashRingPixels(rx)) px.push({ ...p, a: 1, c: 0 });
    // deux gouttelettes qui montent, de part et d'autre : c'est ce qui donne la
    // VERTICALE, sans laquelle l'anneau se lit comme une flaque et non un choc.
    const ry = Math.max(1, Math.round(rx / 2));
    px.push({ x: -rx, y: -ry - 2, a: 0.75, c: 0 }, { x: rx, y: -ry - 2, a: 0.75, c: 0 });
    return px;
  }
  // ⚠ L'ÉCHELLE EST LE PIÈGE. Premier jet à 0,28 tuile : 25 px de large sur une
  // tuile de 42, ça ne se lit plus comme un impact mais comme une FLAQUE. Un
  // éclat de pluie est petit — il est vu de loin, et c'est son nombre qui parle.
  // 0,19 tuile faisait un BOND : l'anneau doublait de largeur d'une image à
  // l'autre et l'éclat « poppait » au lieu de s'ouvrir. Un peu moins d'un tiers
  // de plus, ça se lit comme une onde.
  const rx = Math.max(3, Math.round(u * 0.15));
  // Image 3 : LA TACHE SEULE, quand l'eau est retombée. Même disque, même
  // opacité propre que sous l'anneau — c'est le fondu du contexte qui l'éteint,
  // sinon le raccord se verrait comme un saut (cf. splashPhase).
  if (frame >= 3) return splashDiskPixels(rx).map((p) => ({ ...p, a: WET_A[3], c: 1 }));
  const px = splashDiskPixels(rx).map((p) => ({ ...p, a: WET_A[2], c: 1 }));
  for (const p of splashRingPixels(rx, true)) px.push({ ...p, a: 0.55, c: 0 });
  return px;
}

// Quelle image montrer à `age` ms, et à quelle opacité de contexte. Rend null
// quand l'éclat est éteint. Pur et exporté : le RACCORD entre l'anneau et la
// tache seule est un saut d'opacité si on se trompe, et un saut de 0,55 à 0 sur
// une image, personne ne le voit passer en relisant le code.
export function splashPhase(age) {
  if (!(age >= 0) || age > SPLASH_LIFE + SPLASH_WET_TAIL) return null;
  if (age <= SPLASH_LIFE) {
    const u = age / SPLASH_LIFE;
    return { frame: u < 0.34 ? 0 : (u < 0.67 ? 1 : 2), k: 1 - u * 0.45 };
  }
  // La tache reprend EXACTEMENT l'opacité qu'avait l'éclat à sa dernière image
  // (1 − 0,45 = 0,55), puis s'éteint. C'est ce qui rend le raccord invisible.
  // ⚠ ELLE TIENT AVANT DE PARTIR (1 − v²). En fondu LINÉAIRE elle perd la moitié
  // de son encre à mi-traîne, et à cette opacité-là — un dixième une fois posée
  // sur le pavé — il ne reste rien à voir : on aurait allongé la durée sans rien
  // montrer de plus. La marche du fondu compte autant que sa longueur.
  const v = (age - SPLASH_LIFE) / SPLASH_WET_TAIL;
  return { frame: 3, k: 0.55 * (1 - v * v) };
}

// Étampes des images pour une taille de tuile donnée (le zoom change, l'éclat
// suit — un pixel d'art, jamais un pavé, comme les flocons).
const splashStamps = new Map();
function splashStamp(frame, unit) {
  const key = frame + ':' + unit;
  const hit = splashStamps.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const px = splashFramePixels(frame, unit);
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  for (const p of px) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c2 = cv.getContext('2d');
  const img = c2.createImageData(w, h), d = img.data;
  for (const p of px) {
    const o = ((p.y - y0) * w + (p.x - x0)) * 4;
    const col = p.c === 1 ? SPLASH_WET : SPLASH_COL;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
    d[o + 3] = Math.round((p.a ?? 1) * 255);
  }
  c2.putImageData(img, 0, 0);
  const out = { cv, ox: -x0, oy: -y0 };      // où tombe le point d'impact dans l'étampe
  if (splashStamps.size >= 24) splashStamps.clear();
  splashStamps.set(key, out);
  return out;
}

// Tire un point d'impact sur la voirie VISIBLE. Tirage-rejet en coordonnées
// ÉCRAN : chaque essai tombe forcément dans le cadre, alors qu'un tirage dans la
// boîte de cellules visibles gaspillerait la moitié des coups (le champ est un
// losange dans une boîte carrée).
function splashSpawn(now, essais, trees) {
  const road = CM.walkRoadSet;
  if (!road || !road.size) return null;
  const T = CM.TILE;
  for (let t = 0; t < essais; t += 1) {
    const w = screenToWorld(Math.random() * CM.cw, Math.random() * CM.ch);
    if (!splashPointOk(road, CM.buildingInfo, trees, w.x, w.y, T)) continue;
    return { wx: w.x, wy: w.y, born: now };
  }
  return null;
}

function drawIsoSplashes(now, r, g) {
  if (!SPLASH_TUNE.on || !CM.iso || CM.lodActive) { splashes.length = 0; return; }
  const unit = CM.TILE * CM.cam.zoom;
  const k = CM.ambianceK ?? 1;
  if (k <= 0 || unit < SPLASH_TILE_MIN) { splashes.length = 0; return; }
  // Le plan a changé (achat, émondage) : la route sous un éclat a pu être rasée.
  const sig = String(CM.layoutRecomputeAt || 0);
  if (sig !== splashSig) { splashSig = sig; splashes.length = 0; }
  const cible = Math.min(SPLASH_CAP, Math.round(
    (CM.cw * CM.ch) / SPLASH_AREA * SPLASH_LIFE_RATIO * r * k * (1 + 0.5 * g) * SPLASH_TUNE.count));
  // Même marge que drawIsoLive : on veut la MÊME découpe en blocs que la passe
  // qui dessine réellement les arbres, sinon on en fait naître une troisième.
  const L = CM.layout;
  const trees = L ? isoTreeCells(L, visibleCellBounds(CM.TILE * CM.cam.zoom * ISO_X * 2)) : null;
  // Remplacer sur place plutôt que vider/remplir : la liste ne se réalloue pas,
  // et un éclat mort laisse sa place à un NOUVEAU point d'impact.
  const total = SPLASH_LIFE + SPLASH_WET_TAIL;
  for (let i = splashes.length - 1; i >= 0; i -= 1) {
    if (splashes.length > cible) { splashes.splice(i, 1); continue; }
    if (now - splashes[i].born <= total) continue;
    const s = splashSpawn(now, SPLASH_TRIES, trees);
    if (s) splashes[i] = s; else splashes.splice(i, 1);
  }
  for (let b = 0; b < SPLASH_BIRTHS && splashes.length < cible; b += 1) {
    const s = splashSpawn(now, SPLASH_TRIES, trees);
    if (!s) break;
    s.born = now - Math.random() * total;   // âges dispersés, sinon la volée éclate en chœur
    splashes.push(s);
  }
  const ctx = CM.ctx, prevA = ctx.globalAlpha, prevAA = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const taille = unit * SPLASH_TUNE.size;
  for (let i = 0; i < splashes.length; i += 1) {
    const s = splashes[i];
    const ph = splashPhase(now - s.born);
    if (!ph) continue;
    const st = splashStamp(ph.frame, Math.round(taille));
    if (!st) break;
    const p = worldToScreen(s.wx, s.wy);
    ctx.globalAlpha = Math.min(1, 0.6 * r * ph.k * SPLASH_TUNE.alpha);
    ctx.drawImage(st.cv, Math.round(p.x) - st.ox, Math.round(p.y) - st.oy);
  }
  ctx.globalAlpha = prevA;
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
    // POINT D'EAU (ex-aqueducs) : une cellule, un prop du KIT DES PLACES. On ne
    // pousse qu'un item `plazaProp` — tout le dessin (art d'ère, ancrage sur
    // l'encre, ombre, découpe des halos) est celui des places. Cf. § POINTS
    // D'EAU plus haut ; l'ancienne conduite 3-slice a été retirée avec son art.
    // Cull sur la SEULE cellule : une 1×1 n'a pas le problème d'emprise qui
    // faisait disparaître les champs d'un bloc.
    if (/aqueduct/i.test(idf)) {
      if (t.gx < b.gx0 || t.gx > b.gx1 || t.gy < b.gy0 || t.gy > b.gy1) continue;
      if (!dvVis(t.gx * T, t.gy * T, (t.gx + 1) * T, (t.gy + 1) * T)) continue;
      const wEra = waterPointEra(band);
      const wx = (t.gx + 0.5) * T, wy = (t.gy + 0.5) * T;
      const it = pushItem();
      it.d = depthOf(wx, wy); it.kind = 'plazaProp'; it.eraKey = wEra;
      // `p` résolu ICI et pas à l'import : personHT() suit la molette d'échelle
      // des habitants, et une valeur figée au chargement ne la verrait jamais.
      // noShadow : PAS d'ellipse sombre au pied (refus Raph 2026-08-05, même
      // refus que sous un bâtiment). Le puits pose sa propre ombre portée dans
      // son sprite, lumière en haut à gauche — la doubler d'une flaque noire
      // marquait le contact au lieu de le régler.
      it.art = { prop: 'well', variant: null, wx, wy, noShadow: true,
        hT: personHT() * (WATER_POINT_P[wEra] || 1) };
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
    // FRONT DE RUE : le poussé décale l'ancre du sprite, donc il DOIT décaler sa
    // clé de tri du même geste — sinon un bâtiment avancé de 0,14 tuile vers la
    // rue se dessine devant son voisin mais se trie derrière lui. Une parcelle à
    // plat ne bouge pas (elle n'a pas de porte, cf. les allées de seuil).
    const fo = flat ? null : isoFrontOffset(t, L.roadMap);
    const d = flat ? depthOf(t.gx * T, t.gy * T)
      : depthOf((t.gx + sx + (fo ? fo.ox : 0)) * T, (t.gy + sy + (fo ? fo.oy : 0)) * T);
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
  // Bétail et animaux de rue : un item PAR BÊTE, à sa profondeur — un troupeau
  // trié en bloc verrait ses moutons de devant passer derrière ceux du fond.
  for (const cr of (L.critters || [])) {
    if (cr.gx < b.gx0 || cr.gx > b.gx1 || cr.gy < b.gy0 || cr.gy > b.gy1) continue;
    if (!dvVis(cr.gx * T, cr.gy * T, (cr.gx + 1) * T, (cr.gy + 1) * T)) continue;
    { const it = pushItem(); it.d = depthOf((cr.gx + 0.5 + cr.jx) * T, (cr.gy + 0.5 + cr.jy) * T); it.kind = 'critter'; it.cr = cr; }
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
  // MOBILIER DE TROTTOIR (bancs, bacs, corbeilles) : mêmes items `plazaProp` que
  // la place, donc même art et même tri — seule la POSE est à nous (isoStreetProps).
  // Sauté en LOD : au dézoom un banc fait moins d'un pixel, et ils sont nombreux.
  CM._streetPropsDrawn = 0;   // remis à zéro même quand la passe est sautée (un compteur qui garde son dernier chiffre ment)
  if (!CM.lodActive && STREET_PROPS.on) {
    const sp = isoStreetPropsFor(L, band);
    let nSp = 0;
    // Sous ~2 px de haut, un banc n'est plus qu'un point : on ne le pousse même
    // pas dans le tri. Sans ce seuil, une mégapole en vue large empilait des
    // centaines d'items (mesuré 334) que drawIsoPlazaProp jetait un à un.
    const minH = 2 / (T * CM.cam.zoom);
    for (const rec of sp) {
      if (rec.hT < minH) continue;
      if (!dvVis(rec.wx - T, rec.wy - T, rec.wx + T, rec.wy + T)) continue;
      const it = pushItem();
      it.d = rec.d; it.kind = 'plazaProp'; it.art = rec; it.eraKey = streetPropEra(band);
      nSp += 1;
    }
    CM._streetPropsDrawn = nSp;
  }
  // CLÔTURES : même art, même tri et même seuil que le mobilier ci-dessus (elles
  // sortent du même kit de place). Sautées en LOD pour la même raison — au dézoom un
  // panneau fait moins d'un pixel, et ils sont quelques centaines.
  CM._fencesDrawn = 0;
  if (!CM.lodActive) {
    const fen = isoFencesFor(L, band);
    let nF = 0;
    const minHF = 2 / (T * CM.cam.zoom);
    const fEra = plazaEraForBand(band);
    for (const rec of fen) {
      if (rec.hT < minHF) continue;
      if (!dvVis(rec.wx - T, rec.wy - T, rec.wx + T * 2, rec.wy + T * 2)) continue;
      // La bande est cuite à la demande : tant que le PNG n'est pas décodé, on ne
      // pousse rien (et on ne met rien en cache) — le panneau apparaîtra au décodage.
      const strip = fenceStrip(rec.side, fEra, rec.per);
      if (!strip) continue;
      const it = pushItem();
      it.d = rec.d; it.kind = 'fence'; it.art = strip; it.wx = rec.wx; it.wy = rec.wy;
      it.hT = rec.hT;
      nF += 1;
    }
    CM._fencesDrawn = nF;
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
  // LA MAISON DES PLAISIRS, au tri peintre comme les merveilles : sa profondeur
  // est son PIED, pas son centre — sinon la tour, haute de 11 tuiles, passerait
  // devant des bateaux qui naviguent pourtant en aval d'elle.
  {
    const pl = L.river && L.river.plaisirs;
    if (pl && plaisirsSprite()) items.push({ d: depthOf(pl.x * T, pl.y * T), kind: 'plaisirs', pl });
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
  // TERRE-PLEIN façon PLACE (2026-08-03) : le sol (gazon moucheté + PARTERRES
  // de fleurs) est dans le BAKE ; ici on ne pose que les BUISSONS par-dessus —
  // les slots IMPAIRS de medianSlots (les pairs portent les parterres), petits
  // (r 0.14-0.21, réfs municipales de Raph), légèrement décalés de l'axe, avec
  // ombre d'ancrage au pied (shadow) — fini les buissons « qui volent ».
  if (!CM.lodActive) {
    for (const sg of (L.terrePlein || [])) {
      if (sg.axis === 'v') {
        if (sg.x + 1 < b.gx0 - 1 || sg.x + 1 > b.gx1 + 1) continue;
        if (sg.y1 < b.gy0 - 2 || sg.y0 > b.gy1 + 2) continue;
      } else {
        if (sg.y + 1 < b.gy0 - 1 || sg.y + 1 > b.gy1 + 1) continue;
        if (sg.x1 < b.gx0 - 2 || sg.x0 > b.gx1 + 2) continue;
      }
      // En HIVER, les slots à BAC portent aussi un buisson : les bacs sont
      // retirés du bake (seuls les buissons enneigés rendent bien, retour Raph)
      // et la bande garde son rythme plein — un buisson par ~1.25 tuile.
      const winterBush = CM.season === WINTER;
      for (const sl of medianSlots(sg, T)) {
        if (sl.kind !== 'bush' && !winterBush) continue;
        const po = (((sl.h >>> 5) % 100) / 100 - 0.5) * T * 0.12;   // écart léger à l'axe
        const wx = sg.axis === 'v' ? sl.wx + po : sl.wx;
        const wy = sg.axis === 'v' ? sl.wy : sl.wy + po;
        const jj = ((sl.h >>> 12) % 100) / 100;
        items.push({ d: depthOf(wx, wy), kind: 'bush', wx, wy, r: 0.14 + jj * 0.07, v: 1 + ((sl.h >>> 9) % ISO_BUSH_VARIANTS), shadow: true });
      }
    }
  }
  // ── L'ÎLE QUE PERSONNE N'ENTRETIENT ─────────────────────────────────────────
  // Demande de Raph (2026-07-30), en même temps que le sillage : « peut-être du
  // décor dessus, petit caillou ou autre chose qu'on ait déjà ». Les CAILLOUX
  // n'existent plus : le mode `rocks` a été retiré de sliceCainosPlants avec ses
  // PNG, après deux refus (pierres plates « en tuile » dans l'herbe, puis blocs
  // ronds). On prend donc ce qui reste et qui dit la bonne chose : des BUISSONS.
  //
  // Et ils disent précisément la bonne : l'île est le socle d'une merveille où
  // l'on ne débarque jamais (Raph : « je veux que ça reste une île inaccessible »).
  // De la végétation qui repousse sur le sable, c'est le seul décor qui raconte
  // qu'aucune main ne passe là — un banc, une barrière ou un sentier diraient
  // l'inverse. Aucun sur le tiers central : la merveille y est posée.
  //
  // Placement par HASH de la position de l'île, donc stable d'une frame à l'autre
  // et d'une session à l'autre — un décor qui se retire au hasard chaque recompute
  // scintillerait à chaque recalcul de plan.
  if (!CM.lodActive && ISLAND_DECO.on) {
    for (const il of ((L.river && L.river.islands) || [])) {
      for (let k = 0; k < ISLAND_DECO.count; k += 1) {
        const h = cmHash('ideco:' + Math.round(il.x * 4) + ':' + Math.round(il.y * 4) + ':' + k) >>> 0;
        const a = ((h % 1000) / 1000) * Math.PI * 2;
        // Rayon normalisé tenu vers le BORD : au centre il y a la merveille, et
        // c'est de toute façon le pourtour d'une île de rivière qui se végétalise.
        const rr = ISLAND_DECO.rMin + (((h >>> 10) % 1000) / 1000) * (ISLAND_DECO.rMax - ISLAND_DECO.rMin);
        const al = Math.cos(a) * il.rx * rr, cr = Math.sin(a) * il.ry * rr;
        const wx = (il.x + al * il.tx - cr * il.ty) * T;
        const wy = (il.y + al * il.ty + cr * il.tx) * T;
        const gx = wx / T, gy = wy / T;
        if (gx < b.gx0 - 2 || gx > b.gx1 + 2 || gy < b.gy0 - 2 || gy > b.gy1 + 2) continue;
        items.push({
          d: depthOf(wx, wy), kind: 'bush', wx, wy,
          r: ISLAND_DECO.size * (0.8 + ((h >>> 20) % 100) / 250),
          v: 1 + ((h >>> 27) % ISO_BUSH_VARIANTS),
        });
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
      { const dx = isoUnitDepthEx(pwx, pwy); const it = pushItem(); it.d = dx.d; it.ghost = dx.hidden; it.kind = 'cit'; it.p = p; }
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
      { const dx = isoUnitDepthEx(v.x + lo.x + h, v.y + lo.y + h); const it = pushItem(); it.d = dx.d; it.ghost = dx.hidden; it.kind = 'veh'; it.v = v; }
    }
  }
  // ÉMEUTE : émeutiers dans le TRI PEINTRE (clé pieds + offsets de file, comme
  // les habitants) — poussés MÊME au LOD (le signal de crise doit rester
  // visible, parité legacy). La sim tourne dans drawIsoWorld (updateCrisis).
  if (CM.riotDraw) {
    for (const p of CM.riotDraw.pts) {
      const laneX = (p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0;
      const laneY = (p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0;
      { const dx = isoUnitDepthEx(p.x + laneX, p.y + laneY); items.push({ d: dx.d, ghost: dx.hidden, kind: 'riot', p }); }
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
    treeImgs[tv] = a.ready ? (seasonTree(a, 'tree-' + tv) || a.img) : null;
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
      // Ancre = coin SUD de l'empreinte (point monde (gx+spanX, gy+spanY)),
      // DÉCALÉE vers la façade sur rue (cf. FRONT) : sans ça le bâtiment flotte
      // au milieu de son lot et la rue n'a pas de mur. Le même décalage est
      // appliqué à la clé de tri, plus haut — les deux ne se séparent jamais.
      const fOff = /field|farm|crop|orchard/i.test(t.buildingId || t.variant || '')
        ? null : isoFrontOffset(t, L.roadMap);
      const anchor = worldToScreen((t.gx + spanX + (fOff ? fOff.ox : 0)) * T,
        (t.gy + spanY + (fOff ? fOff.oy : 0)) * T);
      const isHouse = t.type === 'house' || t.type === 'enginehome';
      // Bâtiment RIVERAIN (port : l'empreinte mord la berge/l'eau) : scène iso
      // DÉDIÉE (drawIsoRiverside — bâtiment sur berge, ponton vers le ruban,
      // bateau amarré). Ni scène-boîte legacy ni socle : la boîte legacy
      // embarque son eau en repère carré (bassin flottant, vu à la capture).
      // Les CHAMPS ont un rendu À PLAT dédié (parcelle à sillons, plus bas) et
      // DOIVENT s'afficher même si leur emprise mord la berge : on les exclut du
      // cull « mouillé », sinon ils disparaissaient (branchement iso oublié).
      // Seuls les moteurs « en bloc » sont culés au-dessus de l'eau (le port part
      // en scène riveraine). (Les aqueducs étaient ici aussi, pour la même raison
      // — leur prise d'eau se posait EXPRÈS au bord. Les points d'eau qui les
      //  remplacent ne touchent plus l'eau et n'ont plus rien à y faire.)
      const idFlat = t.buildingId || t.variant || '';
      const isFlatFootprint = /field|farm|crop|orchard/i.test(idFlat);
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
        // (Un repli « canal plat » de l'aqueduc vivait ici : une bande beige et
        //  un filet d'eau bleu le long de l'axe long de l'emprise, dessinés tant
        //  que les pièces 3-slice n'étaient pas décodées. Retiré avec le reste de
        //  la conduite — un point d'eau n'atteint plus jamais ce chemin, il part
        //  en `plazaProp` bien avant, et son repli à lui est le gabarit du kit.)
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
      const tImg0 = treeMemo ? treeImgs[tv] : (() => { const a = isoArt('tree-' + tv); return a.ready ? (seasonTree(a, 'tree-' + tv) || a.img) : null; })();
      if (tImg0) {
        const hpx = T * z * treeCanvasT(tr.r, tr.fixed);
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
        drawTreeIso(ctx, p.x, p.y, T * z * (tr.r || 0.7) * 1.3 * treeBandMul(tr.fixed));
      }
      if (profParts) fp('vif-arbres');
    } else if (it.kind === 'critter') {
      const cr = it.cr;
      const p = worldToScreen((cr.gx + 0.5 + cr.jx) * T, (cr.gy + 0.5 + cr.jy) * T);
      drawCritterIso(ctx, p.x, p.y, T * z, cr, AGENT_SCALE);
    } else if (it.kind === 'plazaProp') {
      // PLACE COMPOSÉE : un prop, à sa taille en TUILES (jamais en fraction de
      // la place). Tout le calcul est dans isoPlaza.js.
      drawIsoPlazaProp(ctx, it.art, it.eraKey, now);
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
    } else if (it.kind === 'plaisirs') {
      const art = plaisirsSprite();
      if (art) {
        const p = worldToScreen(it.pl.x * T, it.pl.y * T);
        const nw = art.img.naturalWidth || 1, nh = art.img.naturalHeight || 1;
        // Hauteur = celle du sprite convertie en tuiles au PPT des merveilles,
        // largeur au ratio du PNG : un blit carré l'écraserait.
        const hpx = T * z * (nh / PLAISIRS_PPT);
        const wpx = hpx * (nw / nh);
        const prevPS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        // Ancré sur le PIED (bas, centré) : le fût plonge dans l'eau au point
        // exact qui a servi à évaser le lit.
        ctx.drawImage(art.img, p.x - wpx / 2, p.y - hpx, wpx, hpx);
        ctx.imageSmoothingEnabled = prevPS;
        // Boîte RÉELLEMENT dessinée, publiée pour le hit-test du clic
        // (cityMapRuntime). Publiée ICI et pas recalculée là-bas : deux
        // projections séparées finissent toujours par diverger, et la zone
        // cliquable se retrouverait à côté de la tour.
        CM._plaisirsBox = { dx: p.x - wpx / 2, dy: p.y - hpx, dw: wpx, dh: hpx };
      }
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
    } else if (it.kind === 'fence') {
      // BANDE DE CLÔTURE (lot L9). `it.wx/wy` est le coin de DÉPART de l'arête, et la
      // bande a été composée pour couvrir exactement une arête de cellule.
      //
      // L'échelle se déduit de la couverture voulue, pas d'un réglage : les `per`
      // panneaux doivent couvrir l'écart écran d'UNE cellule sur l'axe, soit
      // T·ISO_X·z. Le reste (hauteur) suit le ratio du canevas — jamais un blit carré,
      // qui écraserait la bande.
      const st = it.art;
      const p = worldToScreen(it.wx, it.wy);
      const s = (T * ISO_X * z) / st.cw;
      // Le PREMIER panneau doit poser son pied sur le coin de départ : sa base est à
      // `panelH` du haut de la bande. Pour un côté e/w le premier panneau est à
      // DROITE du canevas, donc l'ancre horizontale change avec le sens d'avance.
      const x0 = st.right ? p.x : p.x - st.cw * s;
      const y0 = p.y - st.panelH * s;
      const prevFS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.canvas, Math.round(x0), Math.round(y0),
        Math.round(st.cw * s), Math.round(st.ch * s));
      ctx.imageSmoothingEnabled = prevFS;
    } else if (it.kind === 'bush') {
      // Buisson de terre-plein : feuillu réutilisé petit, pied sur la couture.
      const p = worldToScreen(it.wx, it.wy);
      // Buisson DÉDIÉ (bush-N) ; repli sur le feuillu rapetissé d'avant si le
      // PNG manque. Teinté par la saison comme les arbres — sinon le terre-plein
      // restait vert d'été au milieu d'une avenue en automne.
      // La clé de saison suit l'art RÉELLEMENT dessiné : sur les premières
      // frames le buisson n'est pas encore décodé et on tombe sur l'arbre —
      // une clé fixe aurait figé cet arbre teinté dans le cache pour de bon.
      let bArt = isoArt('bush-' + it.v), bKey = 'bush-' + it.v;
      if (!bArt.ready) { const fv = 1 + (it.v % 2); bArt = isoArt('tree-' + fv); bKey = 'tree-' + fv; }
      if (bArt.ready) {
        const hpx = T * z * treeCanvasT(it.r);
        // Ombre d'ancrage au pied (terre-plein) : sans elle le buisson « vole »
        // au-dessus du gazon (retour Raph 2026-08-03) — l'île garde son rendu nu.
        if (it.shadow) {
          ctx.fillStyle = 'rgba(28,40,22,0.38)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + hpx * 0.01, hpx * 0.30, hpx * 0.115, 0, 0, Math.PI * 2);
          ctx.fill();
        }
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
      drawIsoCitizenItem(ctx, it.p, now, z);
    }
  }
  glCompose();                     // dernière série éventuelle
  if (glOn) {
    globalThis.__glPainterLast = { series: glRuns, sprites: glSprites };
  }
  // ── SILHOUETTES FANTÔMES ────────────────────────────────────────────────────
  // La vie urbaine disparaissait derrière le bâti haut (correct en 3/4, mais on ne
  // voyait plus vivre la ville — Raph 2026-08-03, « à tous les âges »). Toute unité
  // marquée `ghost` par isoUnitDepthEx (un occulteur franc au sud la recouvre) est
  // REDESSINÉE par-dessus le peintre en transparence : on la devine à travers la
  // façade. AVANT endLightLayer pour qu'elle vive sous la même lumière que la scène.
  // Molette : __ghost({ on, alpha }) — alpha 0 = coupé.
  if (GHOST_TUNE.on && GHOST_TUNE.alpha > 0 && !CM.lodActive) {
    const prevGA = ctx.globalAlpha;
    ctx.globalAlpha = GHOST_TUNE.alpha;
    for (const it of items) {
      if (!it.ghost) continue;
      if (it.kind === 'cit') drawIsoCitizenItem(ctx, it.p, now, z);
      else if (it.kind === 'veh') drawIsoVehicle(ctx, it.v, now, z);
      else if (it.kind === 'riot') drawIsoRioter(ctx, it.p, now, z);
    }
    ctx.globalAlpha = prevGA;
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
    // Le masque du quai entre dans la clé (cf. ':qg') et la plage le consomme dans
    // le bake : il doit être résolu AVANT de composer la clé, pas au moment où le
    // fleuve se dessine, bien plus loin dans la frame.
    ensureQuayGate();
    // ':pv…' : l'aperçu __showWonder ajoute son parvis au sol → rebake à l'aller-retour.
    // La SAISON entre dans la clé : elle change l'herbe, les brins et les fleurs,
    // qui sont bakés. Elle ne bouge que par crans très espacés (cf. seasonMode),
    // donc elle ne peut pas déclencher de recuisson en rafale.
    // `keyBase` = la clé SANS le zoom : l'identité de CONTENU. Le cache de crans
    // s'en sert pour reconnaître « même monde, autre échelle » (restore approché).
    const keyPre = 'iso:' + CM.layoutRecomputeAt + ':';
    const keySuf = ':' + ((L.counts && L.counts.eraBand) | 0)
      + ':s' + (CM.season | 0)
      // ⚠ LA PLAGE EST DANS LE SOL BAKÉ (kind 'shingle') : sa géométrie dépend du
      // masque effectif du quai, donc de `quayGate.key` (layout + mode `full`) et
      // de la molette __beach. Sans ces crans, basculer `full` ou couper la plage
      // laissait les galets gelés dans le bake — le piège d'invalidation déjà
      // rencontré trois fois sur ce projet.
      + ':bch' + (BEACH.on ? BEACH.mat + BEACH.islandW + '_' + BEACH.bankR : 'off')
      + ':qg' + ((CM.quayGate && CM.quayGate.key) || '-')
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
  // Vie de SURFACE (iso/isoRiverLife.js) : ronds de pluie, feuilles à la dérive,
  // bouées et nasses, saut de poisson. Ici et pas plus tard : sur l'eau, sous
  // les coques — la pluie crible le fleuve, pas les bateaux.
  drawIsoRiverLife(now);
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
      // ⚠ LE CORPS D'EAU FAIT PARTIE DU TRACÉ DEPUIS 2026-07-30 : le bas-fond au
      // pied du mur prend la teinte du coloris courant (CM.waterShore.quay). Sans
      // cette clé, le quai garde le bas-fond du coloris PRÉCÉDENT jusqu'à ce qu'un
      // autre facteur invalide le bake — c'est-à-dire, en pratique, très longtemps.
      // Le fondu du fleuve, lui, n'entre PAS dans la clé : il recuirait le quai à
      // chaque frame de la transition. Le bas-fond bascule donc d'un coup, sur un
      // trait de 1 à 5 px, pendant que la nappe fond — invisible à l'usage.
      + ':e' + (CM.waterShore ? (CM.waterShore.quay[0] + CM.waterShore.quay[1]) : '-')
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
