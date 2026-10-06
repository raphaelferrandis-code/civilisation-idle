/* eslint-disable */
import { state, isOfflineSim } from '../core/state.js';
import { seededRng } from '../core/utils.js';
import { toNum } from '../core/num.js';
import { currentEraIndex } from '../core/mechanics.js';
import { WONDERS, WONDER_TIER_NAMES, wonderTierOf } from '../core/mechanics/wonders.js';
import { tr } from '../core/i18n.js';
import { setCaptureVestigeHandler } from './cityMapBridge.js';
import { ensureMapSeed, mixSeed, hashString } from './procedural/seedManager.js';
import { ageConfigFor } from './procedural/ageVisualConfig.js';
import { eraBandOf } from '../data/eraThemes.js';
import { CRITTER_HERD, CRITTER_PETS, CRITTERS_ON } from './critters.js';
import { computeCityPersonality } from './procedural/cityPersonality.js';
import { generateCityPlan } from './procedural/cityPlan.js';
import { generateRoadsGraph, trimDemandlessRoads, dissolveToSkeleton, pruneUnservedRoads } from './procedural/roadGraph.js';
import { decodeRoadMemory, encodeRoadMemory, rankAbove } from './roadMemory.js';
import { CITY_QUARTERS, QUARTER_PLAZA, forSiteCells, hearthOfSite, centralSiteFor, arteryCells, foundSite, gardenNoise, onBelt, gardenShareFor, spreadFor } from './cityQuarters.js';
import { PORT_SITES, BASIN_NORTH_QUAY, oldPortBasinFor, basinCells, tradePortSiteFor, tradeCells } from './portSites.js';
import { ROAD_LINK_WAVE_FRACTION } from '../core/balance.js';
import { createBuildingPlacer, placeCategorySlotted, VARIANTS_HOUSE, houseFootprint } from './procedural/buildingGenerator.js';
import { planIlots, ilotReachFor, ilotMemoryCells } from './ilotLayout.js';
import { ILOT_BANDS, ANNEX_BODIES, annexOwnArt, ROWS } from './ilotArt.js';
import { createWaterModel } from './procedural/waterModel.js';
import { planHighway, interchangeLawns, HIGHWAY } from './procedural/highwayPlan.js';
import { CM_GIVEN, CM_EPITHETS, CM_TRADES, CM_HOUSES, CM_ROLES, CM_STREET_OF, CM_RESIDENCES, cmOfEn } from './cityNaming.js';
import {
  CM_MAP_BUILDINGS,
  CM_KNOWLEDGE_IDS, CM_INFRA_IDS, CM_SLOT_PRIORITIES
} from './cityBuildings.js';
// Taille de tuile et pixels par tuile des merveilles : UNE source, le module d'échelle
// du grain (sans import, donc sans cycle) — les tests lisaient la copie de layout.js
// dans son TEXTE (audit 2026-10-05, TEST-11/TEST-12).
import { TILE_REF, WONDER_PPT } from './spriteScale.js';

/* ---- legacy citymap core\layout.js ---- */


/* ============================================================================
 * citymap-layout.js — Code PUR (sans dépendance navigateur/Canvas).
 *   Contient : constantes, utilitaires, computeCityLayout, et tout ce qui
 *   peut être exécuté en dehors d'un contexte DOM (simulation Node incluse).
 *   Chargé AVANT citymap.js qui contient uniquement initCityMap().
 *
 * Dépendances globales attendues au chargement :
 *   - seededRng()   (utils.js)
 *   - state         (state.js) ; l'ère, par currentEraIndex (mechanics.js)
 * ============================================================================ */

// ── Objet état du canvas (partagé avec citymap.js) ──────────────────────────
const CM = {
  TILE: TILE_REF,
  canvas: null, ctx: null,
  cam: { x: 0, y: 0, zoom: 1 },
  cw: 0, ch: 0, dpr: 1,
  layout: null, layoutSig: "", layoutCoreSig: "", layoutRecomputeAt: 0,
  born: {},
  citizens: [],
  roadSet: new Set(),
  walkRoadList: [],
  walkRoadSet: new Set(),
  tileGrid: null,
  tooltip: null,
  tipTimer: null,
  hover: null,
  dynastyIdx: 0,
  vehicles: [],
  vehicleTypeKey: "",   // âge (bande) des types tirés (cmSyncRoadFleet)
  vehicleSerial: 0,     // numéro du prochain véhicule de la flotte
  citizenSerial: 0,     // numéro du prochain passant (spawnOneCitizen, BUG-58)
  ships: [],
  nightF: 0,
  healthF: 0.6,
  lodActive: false,
  // Vie de la carte (option joueur, cf. ambianceMode.js) : 1 = pleine, 0 = rien
  // ne bouge. Republié à chaque frame par le runtime ; la valeur par défaut sert
  // aux rendus hors boucle (captures, tests) — jamais de couche muette par défaut.
  ambianceK: 1,
  drag: null, dragged: false,
  centered: false,
  inited: false,
  // Lazy-init au besoin dans initCityMap :
  rioters: null,
  riotGoal: null,
  riotGoalAt: 0,
  riotDraw: null,   // { pts, cx, cy } posé par updateCrisis — consommé par les rendus legacy ET iso
  collapseAt: 0,
  raf: null
};
// ── Maisons-MOTEUR pré-posées : LA règle de visibilité ──────────────────────
// Le plan pose d'avance ENGINE_HOME_LOOKAHEAD maisons-moteur (cf. placeDecor
// "enginehome") ; chacune reste MASQUÉE tant que le compteur de révélation
// per-achat (CM.engineHomeReveal, tenu par frame() de cityMapRuntime) n'a pas
// atteint son index de slot. Tout ce qui montre une maison-moteur passe par ici
// — peintre, fiches de profondeur des unités, allées de seuil du sol cuit et
// signature de ses tuiles — sans quoi le sol dessine la porte d'une maison que
// le peintre cache (un trait qui sort du sol nu vers le sentier).
// `reveal` : un autre seuil que le compteur vivant (le cadrage de départ juge
// au moment du recompute, avant tout achat).
export function cmEngineHomeHidden(t, reveal = CM.engineHomeReveal || 0) {
  return t.type === "enginehome" && (t.revealIdx || 0) >= reveal;
}
// ── Constantes de routes ─────────────────────────────────────────────────────
const ROAD_N = 1;
const ROAD_E = 2;
const ROAD_S = 4;
const ROAD_W = 8;

// ── DISTRIBUTION DES RANGS DE ROUTE (chantier « brouillon », 2026-08-05) ─────
// Ce qui décide de la part d'avenues et de boulevards dans une ville. Trois
// sources posent des rangs, et la mesure a désigné la coupable :
//   1. le TRACÉ (roadGraph) — les axes identitaires de l'archétype, posés en
//      `main` : c'est l'identité de la ville, on n'y touche pas ;
//   2. les CONNECTEURS de moteurs — `connector` ci-dessous, LA cause mesurée
//      du brouillon (cf. le § au point d'appel, dans computeCityLayout) ;
//   3. les PROMOTIONS payées (applyRoadWidenings) et l'usage
//      (upgradeTrunkByUsage) — la hiérarchie qui ÉMERGE, celle qu'on veut.
// `connector` : rang d'un corridor de desserte de moteur (cf. le § au point
// d'appel). `trunkUse` : part du bâti qui doit passer par une venelle pour
// qu'elle devienne une RUE (upgradeTrunkByUsage) — c'est le robinet qui fait
// émerger le tronc, et il se règle en regard de `connector` : desservir en
// `path` sans ouvrir ce robinet rend une ville de 66 % de venelles, donc sans
// trottoirs ni mobilier (mesuré).
// Molette : __roadRanks({ connector, trunkUse, wideCap, capMinCells }) — recalcule
// la carte. `__roadRanks({ wideCap: 1 })` rejoue l'ancienne promotion sans plafond,
// c'est l'A/B du lot S1.
// `streetFoot` : emprise (en cellules) à partir de laquelle un moteur mérite une
// RUE plutôt qu'une venelle. 4 = un 2×2.
// `wideCap` (lot S1, docs/PLAN-RENDU-VILLE.md) : part MAXIMALE du réseau que les
// rangs LARGES (avenue + main) peuvent occuper. Mesuré à HEAD sur une ville de
// bande 3 (2 000 à 2 600 cellules de rue), en faisant varier les routes achetées :
//
//   routes achetées :      0        32       128
//   avenue + main :     13,6 %    20,0 %   46,2 %
//
// `applyRoadWidenings` n'avait AUCUN plafond — `for (i < count) promote(runs[0])`,
// et `count` suit les achats sans borne. Un `main` fait 1,20 tuile avec ses
// trottoirs : à 46 % du réseau, deux artères parallèles distantes d'une cellule ne
// laissent plus un pixel de sol non minéral. C'est la nappe grise.
//
// ⚠ Le plafond porte sur avenue ET main ENSEMBLE, pas sur `main` seul : les demi-
// largeurs valent 0,33 et 0,36, donc plafonner `main` seul déplacerait simplement
// la masse d'un rang sans rien gagner à l'écran.
//
// 0,22 n'est pas rond au hasard : le SQUELETTE seul en pose déjà 13,6 % (9,0 de
// main — chaque artère `main` est doublée en deux lignes collées par `runLineWide`,
// c'est le boulevard à terre-plein — et 4,6 d'avenue). Un plafond sous ce plancher
// n'aurait aucun effet sinon de fermer la progression d'entrée de jeu. 0,22 laisse
// 8 points d'élargissements achetables, puis l'échelle se clôt.
//
// `capMinCells` : sous cette taille de réseau, une PART n'a pas de sens — la rue
// unique d'un hameau EST son boulevard. Le plafond ne s'applique qu'au-delà.
export const ROAD_RANKS = {
  connector: "secondary", trunkUse: 0.15, streetFoot: 4,
  wideCap: 0.22, capMinCells: 200,
};

// Serrage de l'emprise de ville — cf. le commentaire de `cityReachBase`.
//
// ⛔ MESURÉ LE 2026-08-06 : CE LEVIER NE PAIE PAS, gardé comme outil d'A/B seulement.
// Sur le sol de ville hors routes, à bâti constant (372 maisons, bande 3) :
//
//   k = 1     5 867 cellules   53,4 % nues   599 arbres
//   k = 0,9   5 279            52,0 %        410
//   k = 0,82  4 830            50,7 %        243
//   k = 0,75  4 219            48,1 %        121
//
// Serrer de 25 % ne gagne que **5 points** de sol nu, et coûte 80 % de la ceinture
// boisée : le bâti gagne exactement ce que la végétation perd, parce que les arbres
// vivaient dans les faubourgs qu'on supprime. La nappe grise n'est donc pas un
// problème d'ÉTALEMENT mais de REMPLISSAGE — à traiter en posant du contenu.
// Molette : `__cityReach(0.85)` ; `__cityReach()` rend la valeur courante.
const CITY_REACH = { k: 1 };
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__cityReach = (v) => {
    if (v != null) CITY_REACH.k = Math.max(0.5, Math.min(1.2, +v || 1));
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return CITY_REACH.k;
  };
}
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__roadRanks = (o) => {
    if (o && typeof o === "object") Object.assign(ROAD_RANKS, o);
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return { ...ROAD_RANKS };
  };
}

// ── ÉCARTEMENT DES INSTANCES D'UN MÊME MÉTIER ────────────────────────────────
// `gap` = distance minimale (en cellules, de centre à centre) entre deux
// bâtiments du même type. Cf. le § PAS DEUX FOIS LE MÊME MÉTIER CÔTE À CÔTE
// dans placeRequest : c'est un filtre d'acceptation, RELÂCHÉ automatiquement
// quand la ville est trop pleine pour l'honorer — jamais un bâtiment acheté ne
// reste au sol à cause de lui. 0 = comportement d'avant.
// `reach` : de combien de cellules on accepte de s'écarter du choix d'origine
// pour honorer le `gap`. C'est une DISTANCE et non un rang de candidate : un
// rang dépendrait de la taille du top-K et casserait l'invariance « le top-K
// élargi pose la même ville ». Au-delà, on sortirait de la zone que la desserte
// sait raccorder et un bâtiment finirait sans rue (les deux mesurés).
// Réglage MESURÉ (part de voisins du même type, band 4, 611 moteurs, 29 types ;
// un mélange parfait donnerait 3,4 %) : gap 0 → 28 %, **gap 5/reach 8 → 14 %**,
// gap 6/reach 12 → 7,9 %, gap 6/reach 16 → 2,7 %.
// ⚠⚠ LES RÉGLAGES PLUS FRANCS SONT MEILLEURS À L'ŒIL ET POURTANT REFUSÉS : dès
// `reach 12`, le glissement sort de la zone que la desserte sait raccorder et
// DEUX contrats du jeu tombent — « aucun bâtiment servable sans rue »
// (roadDesserte.test.js) et « aucun bâtiment planté dans l'herbe »
// (urbanGroundCoversBuildings.test.js). Le curseur n'est pas borné par le goût
// mais par ces contrats : 5/8 est le dernier cran qui les respecte, et il divise
// déjà le groupement par deux. Ne pas le remonter sans relancer la suite.
const ENGINE_SPREAD = { gap: 5, reach: 8 };

// ── LA VILLE PAR ÎLOTS (docs/PLAN-ILOTS.md) ─────────────────────────────────
// Raph 2026-10-04 : « il faut tout refaire le placement des bâtiments, là on a un
// gros brouillon ». Aux bandes listées, la ville n'est plus un réseau de rues
// tracé d'avance puis semé de maisons : c'est une grille d'ÎLOTS ouverts du cœur
// vers l'extérieur à mesure du contenu (ilotLayout.js), maisons en rangée sur le
// pourtour, halles sur un îlot entier, places sur un îlot, cours au milieu.
// Pilote : la bande 4 (grille romaine), puis toutes les bandes de ILOT_BANDS (2 à 9).
// Le premier calcul en mode îlots RÉORGANISE la ville une fois (décision de Raph) ;
// ensuite plus rien ne bouge. Le campement et le village (bandes 0-1) gardent la
// structure de ville (artère, place, quartiers, cf. cityQuarters.js).
// ⛔ Plus de retour au placement d'avant : la molette `__ilots(false)` et tout ce
// qu'elle seule atteignait (percée de l'artère, extensions planifiées, grands
// ensembles, recettes géométriques de roadGraph…) sont partis (audit 2026-10-05,
// MORT-4, choix de Raph).
// Hors des îlots, même en mode îlots : la campagne (champs, moulins) et le fleuve
// (port) gardent leur placement dédié.
const ILOT_OUTSIDE = new Set(["irrigated_fields", "water_mills", "river_ports"]);
const ILOT_OUTSIDE_RE = /:(irrigated_fields|water_mills|river_ports):/;
// Maisons-moteur posées d'AVANCE au-delà de celles déjà révélées (cf. placeDecor
// « enginehome ») — remonté au niveau du module : le plan d'îlots en tient compte
// dans sa demande de lots. ⛔ Ne pas le réduire (cf. mémoire du projet) — exporté pour
// ilotLayout.test.js, qui garde ce plancher (audit 2026-10-05, TEST-12).
export const ENGINE_HOME_LOOKAHEAD = 44;
// Lots de bord en plus pour les GRANDS LOGIS (villa, manoir, grand ensemble 2×2, tour
// 1×2) : un 2×2 posé dans un îlot prend 2 à 3 lots de bord (un angle, ou deux lots et
// la cour), un 1×2 un ou deux. Le tirage des variantes est DÉTERMINISTE par numéro de
// lot (buildingGenerator.chooseVariant, bandes < 7) : on compte donc les grands logis
// exactement, au lieu d'estimer une part (vécu : 24 maisons-moteur sans lot dans une
// cité « rurale » où toutes les villas trouvaient leur place, la part de liste les
// sous-comptait). Aux bandes cosmiques le tirage dépend de la case : moyenne de liste.
// 2,0 lots par 2×2 et 0,9 par 1×2 : mesuré au Néon (516 grands ensembles, 289 tours
// sur 1 100 logis : 83 maisons-moteur sans lot à 1,3 / 0,7, encore une à 1,8 / 0,8). L'excédent, quand des
// tirages 2×2 se replient sur une case, reste en jardins (lots libres, cf. urbanSet).
function ilotBigHomeLots(band, bias, seed, nHouse, nHome) {
  const row = VARIANTS_HOUSE[Math.max(0, Math.min(VARIANTS_HOUSE.length - 1, band | 0))];
  const list = (bias && row[bias]) || row.base;
  const extraOf = list.map((v) => { const [x, y] = houseFootprint(v, band); const a = x * y; return a >= 4 ? 2.0 * (a - 1) / 3 : a === 2 ? 0.9 : 0; });
  if (!extraOf.some(Boolean)) return 0;
  if ((band | 0) >= 7) return Math.round((nHouse + nHome) * extraOf.reduce((u, e) => u + e, 0) / list.length);
  let extra = 0;
  for (const [cat, n] of [["house", nHouse], ["enginehome", nHome]]) {
    for (let k = 0; k < n; k += 1) extra += extraOf[hashString(seed + ":" + cat + ":v" + k) % list.length];
  }
  return Math.round(extra);
}
// LES ATELIERS DANS LA RANGÉE (Raph 2026-10-04 : « avoir plein de fois le même
// bâtiment qui a l'air d'un grand bâtiment rend mal ») : en mode îlots, une
// annexe de bâtiment-moteur n'est plus la scène de sa halle en réduction (22
// petits temples blancs par type, mesuré) mais une BOUTIQUE de la rue — un lot
// d'une case, un corps de maison (`t.body`, dessiné par pixelHouses.js). La
// halle reste le seul monument de son métier. Gardent leur dessin : les ateliers
// des guildes (dessinés pour être semés, cf. GUILD_CRAFTS_B4) et les points d'eau.
// Corps par âge et exceptions : ilotArt.js (ANNEX_BODIES, annexOwnArt).
const ILOT_TUNE = { annexBody: true };
const ilotTownBody = (id, band) => ILOT_TUNE.annexBody && !!ANNEX_BODIES[band | 0] && !annexOwnArt(id, band | 0);
// Une HALLE ne dépasse pas 3×3 dans un îlot 4×4 : à 4×4 elle prend l'îlot entier et sa
// scène (≈ 2 cases de large) trône sur un parvis vide — refusé en v1 (« 25 parvis
// vides »), revu le 2026-10-04 sur les Ministères au dernier palier.
const ILOT_HALL_MAX = 3;
// Version de la fiche d'îlots (cityCore.ilot.v) : 1 = îlots pleins, 2 = îlots qui
// respirent (lots-jardins, cf. ilotLayout ILOT_AIR) — une fiche v1 se replace une
// fois (plus bas, « LA RESPIRATION DES ÎLOTS ») ; 3 = rues du hameau effacées pour de
// bon à la réorganisation (audit 2026-10-05, BUG-13) — une fiche v2 qui les a gardées
// efface une fois ses rues mémorisées (ses maisons, elles, ne bougent pas) ; 4 = grand
// forum (audit 2026-10-05, BUG-63) — une fiche v3 agrandit son forum une fois.
export const ILOT_MEMORY_V = 4;
// Version à partir de laquelle la mémoire des rues d'une ville par îlots est sûre
// (plus de sentiers du hameau à y chercher).
const ILOT_ROADS_V = 3;
// Version à partir de laquelle le forum est né grand (ilotLayout.js, GRAND_FORUM).
const ILOT_FORUM_V = 4;
if (import.meta.env?.DEV && typeof window !== "undefined") {
  // Molette : __annexBody(false) → les annexes reprennent la scène de leur halle.
  window.__annexBody = (on) => {
    if (on != null) ILOT_TUNE.annexBody = on !== false;
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return { ...ILOT_TUNE };
  };
}

// ── LA MAISON DES PLAISIRS PARAÎT AVEC SES JEUX ─────────────────────────────
// Refonte du 2026-10-02 (docs/PLAN-MAISON-DES-PLAISIRS.md, § ⭐) : le lieu est
// désormais construit par le code à TOUS les âges (iso/plaisirsBake.js), du
// radeau du campement à la lévitation. Il se dresse donc le jour où ses premiers
// jeux ouvrent — l'Ère II, celle des osselets et des tickets, qui révèle aussi
// l'onglet Plaisirs (tick.js) —, et non plus à la bande du néon (seuil du
// 2026-09-28, posé faute d'un art pour les premiers âges).
// Lu sur la MEILLEURE ère atteinte : après un effondrement la ville repart au
// campement, mais les jeux restent ouverts, et le lieu avec eux.
// ⚠ Même seuil que `scratchUnlocked` / la table des osselets : plaisirsReveal.test.js
// verrouille l'accord.
export const PLAISIRS_OPEN_ERA = 2;

// ── LE CŒUR DE LA VILLE SORT DE L'EAU ────────────────────────────────────────
// Rayon (en cellules) du disque qui doit être AU SEC autour de plan.core. Cf. le
// bloc « le cœur sort de l'eau » dans computeCityLayout. 2 est le rayon mesuré
// qui tient toujours sur la plus petite carte (N = 20, 150 graines) ; 3 bute sur
// le bord nord dans 13 % des parties neuves.
const CORE_DRY_RADIUS = 2;

// ── FOYER DU CAMPEMENT — validé par Raph le 2026-09-28 ──────────────────────
// Un feu commun au cœur du camp (bande 0), avec de l'art EXISTANT : l'ancien
// foyer des Conteurs (sol sans son livre, `camp-hearth`, + la bande animée
// `storyteller-fire`), retiré d'EUX le 2026-08-05 parce qu'une scène plate ne
// faisait pas un bâtiment. Ici il n'en est pas un : c'est un feu au sol, là où
// les sentiers convergent. Aucune génération (PixelLab expiré). Dessin :
// iso/isoCampHearth.js. Molette : `__campHearth(false)`.
// `lastBand` (2026-09-29, « applique tout ça à toutes les ères ») : le feu reste le
// cœur du VILLAGE de huttes (bande 1) — il s'éteignait au premier changement de
// bande, vers la 11e minute, et le village n'avait plus de centre. À la bande 2,
// la place (plazas) prend le relais.
export const CAMP_HEARTH = { on: true, lastBand: 1 };
if (import.meta.env?.DEV && typeof window !== "undefined") {
  // __campHearth(false) éteint ; __campHearth({ lastBand: 0 }) rejoue le feu du
  // seul campement (A/B du village).
  window.__campHearth = (on) => {
    if (on && typeof on === "object") { CAMP_HEARTH.on = true; Object.assign(CAMP_HEARTH, on); }
    else if (on != null) CAMP_HEARTH.on = !!on;
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return { ...CAMP_HEARTH };
  };
}

// ── LE CAMPEMENT SE LIT COMME UN LIEU (2026-09-29) ──────────────────────────
// Raph : « que tout l'univers soit plus cohérent, et pas juste des éléments
// copiés-collés les uns sur les autres ». Règle « rien sans raison », appliquée
// d'abord au camp de tentes (bande 0, avec son foyer) — l'image des dix
// premières minutes —, puis au village de huttes (bande 1 : feu, sol et forêt,
// cf. ruralLife dans computeCityLayout). Mesuré sur 5 graines avant ce lot : une partie neuve
// montrait 7 tentes et en cachait 21 à 38 ; 3 à 5 des 7 n'avaient aucun
// sentier, et jusqu'à 49 tentes sur 76 à forte population.
//   - PAS DE MAISONS DE RÉSERVE AU CAMP. Les maisons-moteur pré-posées n'y
//     paraissent jamais : le compteur les cache tant que moins de 40 sont
//     posées (cf. engineHomeReveal), soit toute la bande 0. Mais elles
//     recevaient des sentiers, élargissaient la terre battue et barraient le
//     passage — la boucle « qui ne mène nulle part » de la capture de Raph.
//   - LES SENTIERS CONVERGENT SUR LE FEU. Le carré du foyer reste interdit au
//     bâti, mais la desserte le traverse (districtWalk) : traité en obstacle,
//     il emmurait la racine du réseau, qui est au cœur.
//   - LES TENTES SE POSENT AUTOUR DU FEU, anneau par anneau, et jamais collées
//     ni l'une derrière l'autre à l'écran (CAMP_TENT_GAP) — et non plus le
//     long de l'échafaudage de chantier, qui les rangeait en quinconce.
//   - LE SOL ET LA FORÊT SUIVENT LA VIE : terre battue sous les sentiers, les
//     tentes et autour du feu (campField, iso/isoTissu.js), pré ailleurs ; et
//     la forêt reprend tout ce qui n'est pas foulé, en s'éclaircissant à
//     l'approche des traces (iso/isoWildForest.js, CAMP_LIFE_KEEP).
// `ringK` : poids de la distance au feu dans l'ordre de pose ; `jitterK` : part
// du bruit de placement (0 = anneaux parfaits). Molette : `__campLife(false)`
// rejoue l'ancien camp (A/B), `__campLife({ ringK, jitterK })` règle.
export const CAMP_LIFE = { on: true, ringK: 10, jitterK: 1.5 };
// Voisines interdites à une tente : les quatre orthogonales (losanges qui se
// touchent) et la diagonale VERTICALE à l'écran (x+1, y+1) / (x−1, y−1), où une
// tente se dessine juste derrière l'autre. La diagonale horizontale reste
// permise : deux tentes côte à côte, un demi-losange d'écart, c'est un camp.
const CAMP_TENT_GAP = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__campLife = (o) => {
    if (o === false) CAMP_LIFE.on = false;
    else if (o && typeof o === "object") { CAMP_LIFE.on = true; Object.assign(CAMP_LIFE, o); }
    else if (o != null) CAMP_LIFE.on = true;
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return { ...CAMP_LIFE };
  };
}
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__engineSpread = (o) => {
    if (o && typeof o === "object") Object.assign(ENGINE_SPREAD, o);
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return { ...ENGINE_SPREAD };
  };
}

// SOURCE UNIQUE de la largeur de chaussée par rang/ère, partagée par le rendu
// (corps de route + marquages, renderWorld) et les véhicules (décalage de file,
// agents) pour garantir l'alignement. Tout changement de largeur se fait ICI.
function roadWidthFor(rank, eraIndex) {
  if (rank === "main") return eraIndex >= 12 ? 0.84 : eraIndex >= 7 ? 0.66 : 0.5;
  if (rank === "secondary") return eraIndex >= 12 ? 0.32 : eraIndex >= 7 ? 0.28 : 0.24;
  if (rank === "path") return eraIndex >= 7 ? 0.16 : 0.13;
  return eraIndex >= 12 ? 0.58 : eraIndex >= 7 ? 0.48 : 0.38; // avenue
}

// Demi-largeur (en tuiles) du REFUGE CENTRAL PLANTÉ des grands axes ; 0 hors
// avenue/main. SOURCE UNIQUE : le rendu du terre-plein (iso/isoStreet.drawIsoMedians)
// ET le décalage de voie des agents (agents.js) s'y calent → les voies sont de
// chaque côté et PERSONNE ne roule/marche sur le refuge.
function medianHalfFor(rank, eraIndex) {
  return (rank === "avenue" || rank === "main") ? roadWidthFor(rank, eraIndex) * 0.24 : 0;
}

// ── Palettes et données visuelles ────────────────────────────────────────────
// Registre des bâtiments carte → ./cityBuildings.js (données pures extraites).

// Affinité à l'eau d'un bâtiment moteur : où son emprise a le droit de se poser.
//   "dry" (défaut) = jamais sur l'eau ni sur la berge ;
//   "bank"         = peut mordre la berge (quais, moulins, ports) — pool rive ;
//   "near"         = sol sec proche de la rive ;
//   "on"           = se pose SUR l'eau (comme un pont) ;
//   "any"          = indifférent (pool terrestre, eau interdite).
// Sans champ `water`, on retombe sur l'historique : zone "river" ⇒ "bank".
// Une seule fonction à toucher pour qu'une demande « tel objet sur/hors de
// l'eau » devienne une métadonnée dans CM_*_BUILDINGS.
function cmWaterAffinity(meta) {
  if (meta && meta.water) return meta.water;
  return meta && meta.zone === "river" ? "bank" : "dry";
}
// Droits de pose dérivés de l'affinité, consommés par footprintFits.
function cmWaterAllow(affinity) {
  return {
    allowWater: affinity === "on",
    allowBank:  affinity === "on" || affinity === "bank"
  };
}
// Vrai dès qu'un bâtiment cherche la proximité de l'eau (pool + score « rivière »).
function cmWaterAffine(affinity) {
  return affinity === "on" || affinity === "bank" || affinity === "near";
}

// ── Merveilles ───────────────────────────────────────────────────────────────
// La liste (identité, métrique, 5 paliers, et pour la carte icon/slot/reEra) vit
// dans le cœur depuis l'audit du 2026-10-05 (core/mechanics/wonders.js, BUG-12) :
// les rangs s'y gravent au tick, même quand la carte ne tourne pas. Relue ici
// sous son nom historique — même tableau, mêmes objets, même ordre de slots.
const CM_WONDERS = WONDERS;
// ── Réérection progressive ──────────────────────────────────────────────────
// state.wonders / state.wonderTiers = MÉMOIRE PERMANENTE (le rang atteint, jamais
// perdu, survit aux cycles). Mais une merveille débloquée ne se redresse
// PHYSIQUEMENT sur la carte du cycle courant que lorsque la civilisation a
// regrandi jusqu'à l'ère qui la justifie (`reEra`, indexé sur l'ère COURANTE qui,
// elle, repart de zéro à chaque effondrement). La pierre se souvient ; le
// monument attend que la cité soit de nouveau à sa hauteur. C'est ce qui évite le
// « village minuscule cerné de 6 monuments » en début de cycle.
function cmWonderActive(w, s) {
  if (!w || !s || !Array.isArray(s.wonders) || !s.wonders.includes(w.id)) return false;
  const reEra = typeof w.reEra === "number" ? w.reEra : 0;
  return cmEraIndexFor(s) >= reEra;
}
function cmWonderActiveIds(s) {
  const out = new Set();
  if (!s || !Array.isArray(s.wonders)) return out;
  for (const w of CM_WONDERS) if (cmWonderActive(w, s)) out.add(w.id);
  return out;
}
const WONDER_CLEAR_R = 5; // rayon libre (tuiles) — repli pour merveille sans sprite pixel.

// ── Emprise des merveilles pixel-art ─────────────────────────────────────────
// Les sprites pixel-art sont BIEN plus grands que l'ancien art procédural : ils
// s'ancrent au BAS de la tuile du slot et montent vers le NORD (haut de l'écran)
// — cf. drawWonder (renderBuildings.js). L'ancien disque de rayon 5 ne couvrait
// donc pas l'emprise réelle, laissant routes/bâtiments/arbres/props apparaître
// sous/autour du monument. On dérive une emprise rectangulaire NORD-BIAISÉE des
// dimensions natives MAX (tier V) de chaque sprite. era_mega (L'Aiguille) est
// DANS L'EAU : elle est de facto seule, on ne la dégage pas (pont/riverains).
// Depuis le 2026-10-02 les merveilles sont CUITES par le code (iso/wonderBake.js)
// dans le socle (nw / 2·PPT tuiles) et la hauteur (nh / PPT tuiles) que cette table
// donne à chaque rang : les anciens sprites « de face » qui l'ont mesurée sont
// retirés, la table reste le contrat de l'emprise (wonderExtentTier.test vérifie
// que chaque monument cuit y tient). WONDER_PPT (34 px par tuile) vient de
// spriteScale.js (cf. les imports).
// Dimensions de CHAQUE RANG (héritées des sprites retirés).
//
// ⚠ L'emprise se dérivait des dims du rang V pour TOUS les rangs (retour Raph
// 2026-07-24 : « là c'est direct de la taille rang max »). Un era_kingdom rang I
// fait 128×88 et trônait au milieu d'un parvis taillé pour 400×256 : la place
// naissait finie, et la montée en rang ne se voyait que sur le monument. Le rang
// est maintenant porté jusqu'ici (cf. cmWonderExtent) et l'emprise grandit avec
// la pierre — parvis, réserve, carve des routes et socle piéton compris.
const WONDER_SPRITE_TIERS = {
  dynasty1:        [{ nw: 166, nh: 161 }, { nw: 248, nh: 213 }, { nw: 296, nh: 251 }, { nw: 331, nh: 293 }, { nw: 351, nh: 352 }],
  pop1m:           [{ nw: 128, nh: 150 }, { nw: 152, nh: 215 }, { nw: 188, nh: 271 }, { nw: 141, nh: 306 }, { nw: 181, nh: 371 }],
  era_kingdom:     [{ nw: 128, nh:  88 }, { nw: 176, nh: 112 }, { nw: 240, nh: 152 }, { nw: 320, nh: 208 }, { nw: 400, nh: 256 }],
  era_empire:      [{ nw: 172, nh: 156 }, { nw: 204, nh: 187 }, { nw: 267, nh: 248 }, { nw: 303, nh: 265 }, { nw: 399, nh: 344 }],
  era_mega:        [{ nw: 107, nh: 185 }, { nw:  88, nh: 267 }, { nw: 103, nh: 316 }, { nw: 169, nh: 367 }, { nw: 180, nh: 362 }],
  era_singularity: [{ nw:  80, nh:  80 }, { nw: 128, nh: 128 }, { nw: 176, nh: 176 }, { nw: 224, nh: 224 }, { nw: 288, nh: 288 }]
};
// Dims du rang demandé (1..5), rang V par défaut. `tier` non fourni = ancien
// comportement au bit près : les appelants non migrés ne changent pas de rendu.
function cmWonderSpriteDims(id, tier) {
  const arr = WONDER_SPRITE_TIERS[id];
  if (!arr) return null;
  return arr[Math.max(0, Math.min(arr.length - 1, ((tier == null ? 5 : tier) | 0) - 1))];
}
// Emprise au sol en tuiles autour du slot : PARVIS CARRÉ CENTRÉ sur le monument
// (Raph 2026-07-13 : « met les merveilles au centre de la zone »). L'ancienne
// emprise nord-biaisée (nh/34+1 au nord, 2 au sud) collait le monument au bord
// de sa clairière ; on redistribue la même portée également dans les 4 sens —
// côté = max(demi-largeur du sprite, moitié de l'ancienne étendue N+S). Le
// sprite, dessiné en DERNIER, recouvre correctement ce qui dépasse au nord.
function cmWonderExtent(id, tier) {
  const d = cmWonderSpriteDims(id, tier);
  if (!d) return { halfW: WONDER_CLEAR_R, north: WONDER_CLEAR_R, south: WONDER_CLEAR_R };
  const halfW = Math.ceil(d.nw / (2 * WONDER_PPT)) + 1;
  const reach = Math.max(2, Math.ceil((Math.ceil(d.nh / WONDER_PPT) + 3) / 2));
  const r = Math.max(halfW, reach);
  return { halfW: r, north: r, south: r };
}
// Rayon (Chebyshev) du SOCLE au sol autour du slot : cœur NON-MARCHABLE du
// parvis (les badauds tournent autour, jamais dans le monument). Dérivé de la
// demi-largeur native du sprite DU RANG (la base bâtie ≈ moitié de l'envergure) :
// au rang I le monument est étroit, les badauds doivent pouvoir l'approcher.
function cmWonderCoreR(id, tier) {
  const d = cmWonderSpriteDims(id, tier);
  if (!d) return 2;
  return Math.max(2, Math.round(d.nw / (2 * WONDER_PPT) * 0.55));
}
// HAUTEUR du sprite d'un rang, EN TUILES — la même densité que le rendu
// (drawWonder dimensionne à nh/PPT) et que l'emprise (cmWonderExtent). Source
// unique : c'est aussi ce nombre qui pose le monument au milieu de son parvis
// (cf. wonderFootWorld), et un PPT recopié une troisième fois dériverait.
// LARGEUR DU SOCLE, en tuiles de côté : un sprite de face de nw px se pose sur un
// carré dont le losange fait sa largeur à l'écran (2·s par tuile de côté), donc
// nw / (2·PPT). C'est ce carré que wonderFootWorld CENTRE sur le parvis
// (Raph 2026-10-01 : « mieux les centrer sur leur parvis »).
function cmWonderBaseTiles(id, tier) {
  const d = cmWonderSpriteDims(id, tier);
  return d ? d.nw / (2 * WONDER_PPT) : 2;
}
function cmWonderHeightTiles(id, tier) {
  const d = cmWonderSpriteDims(id, tier);
  return d ? d.nh / WONDER_PPT : 4;
}
// Itère les clés "gx,gy" de l'emprise d'un slot (bornées à la grille N×N).
function cmForEachWonderCell(slot, id, N, fn, tier) {
  const { halfW, north, south } = cmWonderExtent(id, tier);
  for (let dy = -north; dy <= south; dy += 1) {
    const gy = slot.gy + dy; if (gy < 0 || gy >= N) continue;
    for (let dx = -halfW; dx <= halfW; dx += 1) {
      const gx = slot.gx + dx; if (gx < 0 || gx >= N) continue;
      fn(gx, gy, gx + "," + gy);
    }
  }
}

// ── Utilitaires purs ─────────────────────────────────────────────────────────
function cmClamp(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }

// FNV-1a 32 bits. `String(text)` est HISSÉ hors de la boucle : il y était appelé
// deux fois PAR CARACTÈRE (condition + charCodeAt), soit 16 conversions pour une
// clé de 8 signes. Anodin à l'unité, mais cmHash est appelé par cellule dans le
// pavage du sol iso (deux fois : 'gd:' et 'gd2:') — relevé au profileur sur un
// dézoom de 13 s, il pesait 285 ms de temps PROPRE, 6,5 % de la frame.
// La valeur rendue est inchangée (cf. houseVariants.test.js, qui verrouille la
// distribution des teintes de maisons sur ce hash exact).
function cmHash(text) {
  const str = String(text);
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function cmPick(list, seed) { return list[seed % list.length]; }

// BRUIT DE BLOC (lot S5, docs/PLAN-RENDU-VILLE.md) — deux échelles de bloc (5 et 11
// cellules) mélangées 0,6/0,4. Rend une valeur [0..1] quasi CONSTANTE entre voisines,
// contrairement à un hash par cellule qui rend du bruit blanc.
//
// C'est la différence entre des BOSQUETS et du poivre-et-sel. La forêt sauvage s'en
// servait déjà — son commentaire dit « agglutine les arbres en fourrés et ménage des
// trouées » — et elle lit en masses, alors que les arbres de VILLE étaient tirés par
// un hash indépendant par cellule (donc en confettis).
//
// ⚠ Il vit ICI et pas dans un module à part : `cmHash` est ici, `isoRenderer` importe
// déjà de ce fichier, et l'inverse serait un cycle. La forêt sauvage l'importe donc
// au lieu d'en garder sa copie — une seule définition, un seul grain.
//
// ⚠ Ne PAS confondre avec une variation par CELLULE : celles-là ont été refusées
// quatre fois (jitter d'aplat, voile en plaques, usure en ellipses, damier de parité).
// Ici on ne peint rien — on module une PROBABILITÉ DE POSE à une échelle plus grande
// que le bloc, ce qui est exactement le geste que la forêt sauvage a déjà validé.
export function cmCellNoise(gx, gy) {
  const n1 = (cmHash(Math.floor(gx / 5) + "n" + Math.floor(gy / 5)) % 1000) / 1000;
  const n2 = (cmHash(Math.floor(gx / 11) + "m" + Math.floor(gy / 11)) % 1000) / 1000;
  return n1 * 0.6 + n2 * 0.4;
}

// Amplitude du regroupement. Le facteur est centré sur 1 en moyenne (`cmCellNoise`
// vaut 0,5 en moyenne), donc le NOMBRE d'arbres est conservé : on redistribue, on ne
// densifie pas — c'était le contrôle du lot, et il passe (1270 → 1246 à amplitude
// 1,9, soit −1,9 %).
//
// ⛔ **DÉFAUT À 0 : ÉTEINT.** Le mécanisme est écrit, testé et réglable, mais son
// effet mesuré sur le champ d'arbres est NÉGLIGEABLE, et je ne livre pas un défaut
// que je ne sais pas justifier. Mesuré en jeu, bande 3, A/B rejoué à l'identique :
//
//   amplitude 0   → 1270 arbres, 62,9 % groupés (≥2 voisins), 15,4 % isolés
//   amplitude 1,9 → 1246 arbres, 61,7 % groupés,               16,6 % isolés
//
// …soit 1,2 point d'écart pour une modulation de probabilité de ×0,05 à ×1,95.
//
// ⚠ ET LA PRÉMISSE DU LOT EST FAUSSE. Le diagnostic disait « hash par cellule, donc
// bruit blanc, donc confettis ». Mesuré : le champ occupe 9,1 % des 13 958 cellules
// éligibles (le résidu n'est PAS mince : 3,77 voisines éligibles sur 4 par arbre,
// donc aucun plafond structurel) — or un tirage indépendant à 9 % donnerait ~4 %
// d'arbres à deux voisins, et on en mesure 62,9 %. Le champ est donc DÉJÀ fortement
// aggloméré par un mécanisme que cette séance n'a pas identifié : soit `trees`
// réunit deux populations (ceinture boisée + arbres de ville), soit la densité
// radiale concentre bien plus que le modèle ne le prédit.
//
// **À faire avant de rallumer** : comprendre ce mécanisme. Tant qu'on ne l'a pas,
// monter l'amplitude ne fait que remuer un champ déjà groupé. La molette est là pour
// ça : `__treeClump(1.3)` puis recompter groupés/isolés.
export const TREE_CLUMP = { amp: 0 };
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__treeClump = (v) => {
    if (v != null) TREE_CLUMP.amp = Math.max(0, Math.min(1.9, +v || 0));
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return TREE_CLUMP.amp;
  };
}
// Facteur multiplicatif à appliquer à une probabilité de pose, de moyenne 1.
export function cmClumpK(gx, gy) {
  const a = TREE_CLUMP.amp;
  if (a <= 0) return 1;
  return (1 - a / 2) + a * cmCellNoise(gx, gy);
}

// Fraction d'ère [0..1] pour le dimensionnement de la ville (densité, portée…).
// Ancrée sur 34 : les ères transcendantes (index dense ≥ 35) saturent à 1 (ville
// maximale). Identique à l'origine pour les ères 0–34.
function cmEraFrac(index) {
  return Math.max(0, Math.min(1, index / 34));
}
// Bande visuelle : source unique de vérité (eraThemes.eraBandOf), ancrée sur 34
// pour les ères 0–34 (couleurs inchangées) + 3 bandes cosmiques 7–9 (mappées par
// tier → les ères « factices » suivent leur palier majeur).
function cmEraBand(index) {
  return eraBandOf(index);
}
// L'ère de la partie EN COURS (currentEraIndex lit l'état global) : l'état passé en
// argument n'y change rien (cf. campHearth.test.js). Le repli qui recomptait les ères
// sur s.population ne servait jamais — l'import est statique (audit du 2026-10-05, MORT-4).
function cmEraIndexFor() {
  return currentEraIndex();
}

function cmEngineTier(count) {
  if (count >= 64) return 3;
  if (count >= 25) return 2;
  if (count >= 10) return 1;
  return 0;
}
function cmEngineFootprint(id, count) {
  const tier = cmEngineTier(count);
  if (id === "imperial_exchanges") return count >= 64 ? 5 : count >= 25 ? 4 : 3;
  if (id === "ministries")         return count >= 64 ? 5 : count >= 25 ? 4 : 3;
  if (id === "universities")       return count >= 64 ? 4 : count >= 25 ? 3 : 2;
  if (id === "think_tanks")        return count >= 64 ? 4 : count >= 25 ? 3 : 2;
  if (id === "aqueducts")          return 1;   // point d'eau : une cellule, toujours
  if (id === "mint_houses")        return tier >= 2 ? 3 : 2;
  if (id === "courthouses"  || id === "archive_grids" || id === "ruin_architects") return tier >= 2 ? 3 : 2;
  if (id === "academies"    || id === "libraries"     || id === "ancestral_cult")  return tier >= 2 ? 3 : 2;
  if (id === "bureaucracy"  || id === "public_works") return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
  if (id === "watch"        || id === "sewers")       return tier >= 2 ? 2 : 1;
  if (id === "printing_houses" || id === "schools")   return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
  if (id === "observatories")   return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
  if (id === "storytellers" || id === "scribes")      return tier >= 2 ? 2 : 1;
  if (id === "river_ports")     return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
  if (id === "irrigated_fields") return tier >= 1 ? 3 : 2;
  return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
}
// ── POINTS D'EAU (ex-aqueducs) ──────────────────────────────────────────────
// L'AQUEDUC-STRUCTURE A ÉTÉ RETIRÉ le 2026-08-05. C'était une conduite linéaire
// (span×1) posée LE LONG DE LA BERGE, prise d'eau au bord : elle puisait donc
// dans le fleuve d'à côté, ce que Raph a fini par refuser (« ça n'est pas
// logique à côté d'une rivière d'en avoir »). Le fleuve étant TOUJOURS présent
// (river.present est en dur), l'absurdité n'était pas accidentelle mais
// systématique. La forme linéaire avait déjà résisté 5 fois : 4 réécritures de
// son art (AQ_V était monté à 4, « design hyper étiré », « arcade minuscule sur
// fond opaque ») et une orientation perpendiculaire essayée puis rejetée.
// 🚫 NE PAS LA RESSUSCITER — ni en longeant la berge, ni en franchissant le
//    fleuve : ce n'est pas le sprite qui a échoué, c'est l'objet. Un aqueduc est
//    de l'infrastructure EN RÉSEAU, or ici ce n'est qu'un compteur d'achats.
//
// Le bâtiment ne change pas d'un iota (nom, coût, effets). Seule sa
// REPRÉSENTATION change : des POINTS D'EAU semés dans la ville, dont le COMPTEUR
// pilote le NOMBRE et jamais la TAILLE — même doctrine que halle + ateliers. Une
// fontaine près d'un fleuve n'étonne personne, il n'y a plus rien à défendre.
// Plafond bien plus bas que celui des ateliers (48) : un point d'eau est un
// repère de quartier, pas un pavé ; au-delà d'une quinzaine ils se marchent
// dessus. Courbe en sqrt, 1 au premier achat.
const CM_WATER_POINT_CAP = 14;
// Écart minimal entre deux points d'eau, en cellules. Environ deux lots de
// maisons : assez pour qu'ils se lisent comme « un par quartier » et jamais comme
// une rangée. Au plafond de 14 sur une ville de rayon ~0,44 N, la contrainte est
// large — elle ne mord que sur les paquets, pas sur le placement.
const CM_WATER_POINT_GAP = 5;
function cmWaterPointCount(level) {
  const n = Math.max(1, Math.floor(level));
  return cmClamp(Math.round(1 + (Math.sqrt(n) - 1) * 1.9), 1, CM_WATER_POINT_CAP);
}
// Zone d'une instance — `meta.zone` pour tout le monde SAUF les points d'eau.
// Chaque zone est un ANNEAU de rayon fixe : toutes les instances posées sur la
// même y tombent, et 14 fontaines à rayon constant dessinent un CERCLE au lieu
// d'être semées. On alterne donc les trois anneaux de la ville (milieu, cœur,
// faubourg) — c'est la répartition qui fait « un point d'eau par quartier ».
// ⚠ La zone retenue est aussi celle STOCKÉE dans le slot : slotCompat la
// recompare pour valider un emplacement mémorisé. Passer par req.zone des deux
// côtés est ce qui garde les deux en phase.
const CM_WATER_POINT_ZONES = ["mid", "center", "edge"];
// ── LES ATELIERS DES GUILDES SONT SEMÉS DANS LA VILLE ────────────────────────
// Raph 2026-10-03, capture de la bande 4 : « les bâtiments sont tous les uns sur
// les autres ». MESURÉ (band 4, 400 guildes → 48 instances) : les 47 ateliers
// tombaient TOUS à moins de 16 cases du centre, 83 % collés à un autre atelier,
// là où les autres métiers du cœur en ont 9 à 43 %. La zone « center » se score
// à la seule distance au centre (le terme angulaire n'y pèse presque rien) et les
// guildes, moteur posé après le savoir et l'infra, ramassaient les dernières cases
// libres autour du cœur civique : un tapis de collèges, l'écartement (ENGINE_SPREAD,
// borné à `reach`) n'avait nulle part où les glisser.
// Le COLLÈGE (instance nº 0, la halle) reste au cœur ; ses ateliers vivent parmi
// les maisons, comme un atelier d'artisan vit dans son quartier. Zone « sown » :
// cible = un angle par instance (régulier) ET un rayon par instance, tiré dans la
// silhouette de la ville (cmSownFrac, puis plan.reachFor dans engineCandidates).
// Rien ne change pour les autres métiers.
// ⚠ Les slots mémorisés des ateliers (zone « center ») sont écartés par slotCompat :
// sur une partie en cours, les ateliers se reposent UNE fois, puis tiennent.
function cmRequestZone(meta, index) {
  if (meta.id === "guilds" && index > 0) return "sown";
  if (meta.id !== "aqueducts") return meta.zone;
  return CM_WATER_POINT_ZONES[index % CM_WATER_POINT_ZONES.length];
}
// Fraction du rayon de ville visée par l'atelier nº `index` d'un type semé. Suite
// de Weyl (pas d'or) : deux ateliers d'indices voisins — donc d'angles voisins —
// ont des rayons éloignés ; la racine répartit à AIRE égale (sans elle, le cœur
// serait plus dense que les faubourgs). Bornes : on laisse le cœur civique aux
// institutions (0,3) et la lisière aux champs et aux entrepôts (0,85).
const CM_SOWN_MIN = 0.3, CM_SOWN_MAX = 0.85;
function cmSownFrac(id, index) {
  const u = ((index * 0.6180339887 + ((cmHash("sown:" + id) >>> 0) % 1000) / 1000) % 1 + 1) % 1;
  return CM_SOWN_MIN + (CM_SOWN_MAX - CM_SOWN_MIN) * Math.sqrt(u);
}
function cmFieldSpan(level) {
  // Ceinture de champs : un bloc unique, plus large que haut, qui grandit avec
  // le niveau. Croissance en sqrt pour ralentir l'expansion en fin de partie.
  const r = Math.sqrt(Math.max(1, Math.floor(level)));
  return { w: cmClamp(2 + Math.floor(r * 1.4), 2, 11), h: cmClamp(2 + Math.floor(r * 0.7), 2, 6) };
}
// ── LE TERROIR (docs/PLAN-TERROIR.md) ───────────────────────────────────────
// Raph 2026-10-03 : le bloc de champs unique se lisait comme un tapis posé. La
// même AIRE (celle de cmFieldSpan, rien ne change pour le jeu) se découpe en 1 à
// 4 PARCELLES de formes différentes — des lanières plutôt que des carrés —, que le
// placement pose jointives : un bout de campagne, pas une dalle. Pur et
// déterministe (niveau + graine) : la même partie redonne les mêmes parcelles.
// La parcelle 0 est la plus grande, couchée le long de X comme l'ancien bloc.
const TERROIR_SHARES = [[1], [0.58, 0.42], [0.42, 0.33, 0.25], [0.34, 0.27, 0.22, 0.17]];
export function cmTerroirParcels(level, seed = 0) {
  const fs = cmFieldSpan(level);
  const A = fs.w * fs.h;
  const K = A < 10 ? 1 : A < 24 ? 2 : A < 42 ? 3 : 4;
  if (K === 1) return [{ w: fs.w, h: fs.h }];
  const out = [];
  for (let i = 0; i < K; i += 1) {
    const a = Math.max(4, Math.round(A * TERROIR_SHARES[K - 1][i]));
    const hsh = cmHash("terroir:" + (seed >>> 0) + ":" + i) >>> 0;
    // Côté court : 2 pour une petite parcelle, 2-3 au-delà, 3 pour la grande —
    // une lanière a un côté court et un côté long (au moins deux de plus),
    // jamais un carré : le carré, c'était la dalle.
    const s = a <= 8 ? 2 : a <= 18 ? 2 + (hsh % 2) : 3;
    const l = cmClamp(Math.max(s + 2, Math.round(a / s)), 2, 10);
    // Couchée le long de X (w = long) ou de Y : la 0 l'est toujours, les autres
    // alternent, avec un tirage pour ne pas faire un damier régulier.
    const alongX = i === 0 || ((i + ((hsh >>> 3) & 1)) & 1) === 0;
    out.push(alongX ? { w: l, h: s } : { w: s, h: l });
  }
  return out;
}
function cmRiverPortSpan(level) {
  // Port fluvial UNIQUE : emprise rectangulaire large le long du fleuve (quai +
  // parking à bateaux) et plus modeste vers la terre. Grandit avec le tier
  // (richesse/population) ; le bord sud reste plaqué sur l'eau, le corps s'étire
  // donc vers la berge. Le ponton du sprite plonge ensuite dans le fleuve.
  const t = cmEngineTier(level);
  // h : profondeur de repli ; la vraie profondeur est dérivée du fleuve à la pose
  // (assez pour atteindre l'eau au sud tout en gardant le dos sur terre, ≥ 3).
  return { w: t >= 3 ? 5 : t >= 2 ? 4 : t >= 1 ? 3 : 2, h: t >= 2 ? 4 : 3 };
}
// ── Densité : COMBIEN de bâtiments de ce type se dressent dans la ville ──────
// ── ARBRES & BUISSONS : côté de canvas PARTAGÉ (chantier ÉCHELLE, Lot A) ─────
// Le facteur 2.7 (côté du canvas carré en tuiles, pour r=1) vivait recopié dans
// SEPT sites : dessin des arbres, repli procédural, buissons de terre-plein,
// particules d'ambiance (×2 — la canopée doit suivre le sprite, sinon feuilles
// et lucioles flottent au-dessus des arbres), recentrage des arbres de place
// (×2 — la margelle est cotée sur ce canvas). Source unique ici.
// `mulMid`/`mulLate` : la végétation SUIT L'ÉCHELLE DE L'ÈRE — un arbre de
// 1,9 tuile à côté d'une hutte est un arbre, à côté d'une arcologie c'est un
// séquoia qui rapetisse toute la ville (docs/PLAN-ECHELLE.md, §A2). Les arbres
// de PLACE sont exempts (`fixed`) : recette et margelle sont cotées pour eux,
// et un parc de poche garde son arbre monumental au milieu des tours.
// Molette : window.__treeScale({ mulLate: 0.5 }) — les arbres ne sont pas bakés.
// ── UN PIXEL D'ARBRE = UN PIXEL DE TENTE (2026-09-29, « une seule main ») ────
// Chaque arbre tirait son rayon au hasard (r = 0,62..0,99) : sa densité variait
// de 0,56 à 0,89 px écran par px d'art et par unité de zoom, quand toute
// habitation est à 1,135 (docs/PLAN-EGALISATION-GRAIN.md) — deux arbres voisins
// n'avaient pas la même taille de pixel, et les pixels d'une tente étaient 1,3 à
// 2 fois plus gros que ceux de l'arbre d'à côté (constat mesuré sur la capture
// du campement de Raph). `grainR` fixe le rayon de TOUS les arbres de forêt et
// de ville au grain des habitations : 96 px d'art × (2 × 0,78 / 44) = 3,40
// tuiles de côté, soit r = 3,40 / 2,7 = 1,26. La variété de taille vient des
// essences elles-mêmes (le feuillu 2 est plus petit que le 1, le sapin plus
// fin), et non plus du hasard — la règle des tentes (tailles variées écartées
// pour la grille de pixels) vaut pour les arbres. `grainDens` replante en proportion :
// des arbres 1,6 fois plus grands (2,5 fois l'aire) à densité égale feraient
// un tapis. Planche du 2026-09-29 : ×0,45 et ×0,6 se lisaient en bois clairsemé
// (les grands arbres se chevauchent dans les fourrés, les trouées s'agrandissent),
// ×1 en tapis dense ; ×0,8 rend une forêt avec ses clairières. MESURÉ (dézoom
// maximal, rendu logiciel, 19 060 arbres visibles avant) : la frame coûte selon
// le NOMBRE d'arbres, pas leur taille — 7,6 ms avant, 7,7 à ×1, 6,4 à ×0,8.
// Molette : __treeScale({ grainR: null }) rejoue les tailles au hasard (A/B).
const TREE_TUNE = { h: 2.7, mulMid: 0.85, mulLate: 0.65, grainR: 1.26, grainDens: 0.8 };
if (import.meta.env?.DEV && typeof window !== "undefined") window.__treeScale = (o = {}) => {
  Object.assign(TREE_TUNE, o);
  // Le rayon et la densité se décident à la pose : on replante.
  if (("grainR" in o || "grainDens" in o) && typeof window.__cityRecompute === "function") window.__cityRecompute();
  return { ...TREE_TUNE };
};
// ── LES ARBRES RECULENT DEVANT LA VIE, À TOUTES LES ÈRES (2026-09-29) ───────
// Règle née au campement (cf. CAMP_LIFE), étendue à toutes les bandes sur la
// demande de Raph (« applique tout ça à toutes les ères ») : un arbre ne pousse
// contre une maison. Depuis qu'il a le grain des habitations (grainR, ×1,6), sa
// couronne couvrait les façades. Deux régimes :
//   - la FORÊT (iso/isoWildForest.js) et, au camp et au village, toute la
//     végétation : aucun arbre à `clear` cellules ou moins (Chebyshev) d'une route
//     ou d'une emprise bâtie, puis la part `keep` cellule après cellule, la
//     pleine densité au-delà — une lisière qui s'éclaircit ;
//   - les ARBRES DE VILLE (L.trees) : aucun à `cityClear` cellule ou moins d'une
//     emprise bâtie ; le bord des rues reste permis (arbres d'alignement, de
//     parc). La règle de la forêt appliquée en ville la vidait : dans un tissu
//     dense, presque chaque cellule libre est à deux pas d'une rue ou d'une
//     maison (bande 3 : 402 → 121 arbres ; celle-ci en garde 276, bande 5 :
//     1 971 → 1 638), alors que Raph avait validé les grands arbres EN VILLE.
// Mesuré avant (villes __demoCity) : arbres de ville collés à une maison ou une
// rue, 15 sur 15 en bande 1, 118/422 en bande 3, 293/1 633 en bande 4, 575/2 586
// en bande 7.
// Molette : __treeLife(false) rejoue les arbres d'avant (hors camp et village,
// dont l'emprise est plantée par la forêt quoi qu'il arrive).
export const TREE_LIFE = { on: true, clear: 2, keep: [0.3, 0.6, 0.85], cityClear: 1 };
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__treeLife = (o) => {
    if (o === false) TREE_LIFE.on = false;
    else if (o && typeof o === "object") { TREE_LIFE.on = true; Object.assign(TREE_LIFE, o); }
    else if (o != null) TREE_LIFE.on = true;
    if (typeof window.__cityRecompute === "function") window.__cityRecompute();
    return { ...TREE_LIFE };
  };
}
// Part des arbres gardés à la distance `d` de la vie (cf. TREE_LIFE).
export function treeLifeKeep(d) {
  if (d <= TREE_LIFE.clear) return 0;
  const i = d - TREE_LIFE.clear - 1;
  return i < TREE_LIFE.keep.length ? TREE_LIFE.keep[i] : 1;
}
// Rayon utile de la règle : au-delà, la distance n'a plus d'effet.
export function treeLifeRange() { return TREE_LIFE.clear + TREE_LIFE.keep.length; }
// Distance de Chebyshev de chaque cellule à la cellule de VIE la plus proche,
// bornée à R (255 au-delà). BFS à 8 voisins sur une grille typée bordée de R —
// la forêt pousse aussi hors de la grille de ville, jusqu'à R cellules de son
// bord. `sources` : itérables de clés "gx,gy". Pur : aucun état, aucun CM.
export function cmLifeDistance(N, sources, R) {
  const W = (N | 0) + 2 * R;
  const d = new Uint8Array(W * W).fill(255);
  const q = new Int32Array(W * W);
  let qn = 0;
  for (const src of sources) {
    for (const k of src) {
      const c = k.indexOf(",");
      const x = +k.slice(0, c) + R, y = +k.slice(c + 1) + R;
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      const i = y * W + x;
      if (d[i] === 0) continue;
      d[i] = 0; q[qn++] = i;
    }
  }
  for (let h = 0; h < qn; h += 1) {
    const i = q[h], di = d[i];
    if (di >= R) continue;
    const x = i % W, y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
      const j = ny * W + nx;
      if (d[j] <= di + 1) continue;
      d[j] = di + 1; q[qn++] = j;
    }
  }
  return {
    at(gx, gy) {
      const x = gx + R, y = gy + R;
      return (x < 0 || y < 0 || x >= W || y >= W) ? 255 : d[y * W + x];
    },
  };
}
// Rayon d'un arbre de forêt ou de ville : le grain commun, ou l'ancien tirage.
function treeRadius(h) { return TREE_TUNE.grainR || (0.62 + (h % 30) / 80); }
// Part des arbres replantés (cf. grainDens) : 1 quand le grain est coupé.
function treeDensK() { return TREE_TUNE.grainR ? TREE_TUNE.grainDens : 1; }
function treeBandMul(fixed) {
  if (fixed) return 1;
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0;
  return band >= 7 ? TREE_TUNE.mulLate : band >= 5 ? TREE_TUNE.mulMid : 1;
}
// Côté du canvas (carré) d'un arbre/buisson en TUILES — r = rayon de recette (~0.7).
function treeCanvasT(r, fixed) { return (r || 0.7) * TREE_TUNE.h * treeBandMul(fixed); }

// Le compteur d'achats pilote le NOMBRE de bâtiments, jamais leur TAILLE. C'est ce
// couplage-là qui produisait les deux défauts majeurs de la carte : des scènes
// étirées sur 3×3 (paniers de fruits hauts comme un homme, cf. capture Raph) et,
// au 10e achat, la DISPARITION de 9 cabanes remplacées par un bloc unique — le
// joueur achetait et la ville rétrécissait. Ici rien ne fusionne jamais.
//   1 pour 1 jusqu'à CM_ENGINE_LIN (« 1 achat = 1 bâtiment » au pied de la lettre),
//   puis en racine pour que la fin de partie reste une ville et pas une grille.
// Continu en CM_ENGINE_LIN (f(12)=12, f(13)=13 : aucune marche).
// Cap = LE curseur de densité : 48 aujourd'hui (~1400 objets carte pleine),
// ~80 vise la mégalopole et demande le placement append-only avant d'être armé.
// Molette : window.__engineDensityCap.
const CM_ENGINE_LIN = 12, CM_ENGINE_K = 2.6, CM_ENGINE_CAP = 48;
// Plafond PROPRE aux moulins (docs/PLAN-TERROIR.md) : la halle + 14 moulins.
const CM_MILL_CAP = 15;
function cmEngineCount(n) {
  if (n <= CM_ENGINE_LIN) return n;
  const cap = (import.meta.env?.DEV && typeof globalThis !== "undefined" && globalThis.__engineDensityCap) || CM_ENGINE_CAP;
  return Math.min(cap, CM_ENGINE_LIN + Math.round(CM_ENGINE_K * (Math.sqrt(n - CM_ENGINE_LIN + 1) - 1)));
}
// Emprise d'un groupe. La HALLE (idx 0) garde la croissance historique — c'est le
// seul objet du type autorisé à devenir monumental. Un ATELIER a une emprise
// CONSTANTE : celle pour laquelle sa scène a été composée (tier 0), bornée à 2
// cellules. Sans cette borne, 48 ministères à 3×3 rendraient à la carte tout le
// terrain que le dé-fusionnement lui fait gagner.
function cmEngineGroupFoot(id, groupLevel, idx) {
  return idx === 0 ? cmEngineFootprint(id, groupLevel) : cmEngineAtelierFoot(id);
}
// Emprise d'un ATELIER de ce type — l'unité d'échelle du type. Exportée : le rendu
// iso s'en sert pour BORNER la taille de dessin de la halle (cf. drawIsoEngineScene).
function cmEngineAtelierFoot(id) { return Math.min(2, cmEngineFootprint(id, 1)); }
function cmEngineInstances(count, id) {
  // Points d'eau : N repères ÉGAUX semés dans la ville — pas de halle, donc pas
  // d'instance nº 0 privilégiée : chacun est un tier 0 d'une seule cellule.
  if (id === "aqueducts") return count > 0 ? new Array(cmWaterPointCount(count)).fill(1) : [];
  // Champs : une seule ceinture agricole qui grandit (pas de tuiles dispersées).
  if (id === "irrigated_fields") return count > 0 ? [Math.floor(count)] : [];
  // Port fluvial : un seul bâtiment riverain qui grandit (pas de quais
  // éparpillés sur la berge). Le moulin, devenu moulin à vent terrestre,
  // suit le régime commun halle + ateliers ci-dessous.
  if (id === "river_ports") return count > 0 ? [Math.floor(count)] : [];
  if (count <= 0) return [];
  // nº 0 = la HALLE : seule instance à porter le compteur ENTIER, donc le tier
  // (scène riche) et l'emprise croissante. Les suivantes sont des ATELIERS de
  // niveau 1 → tier 0 → scène humble à taille fixe. La monumentalité vient de la
  // halle, la quantité des ateliers : un quartier, pas un bloc.
  // MOULINS plafonnés à CM_MILL_CAP (Raph 2026-10-03, devant la planche du
  // terroir : « ça fait beaucoup effectivement, limite à 15 ») — au-delà, la
  // rangée de moulins autour des champs devenait un verger.
  const n = Math.floor(count), out = [n];
  const k = id === "water_mills" ? Math.min(CM_MILL_CAP, cmEngineCount(n)) : cmEngineCount(n);
  for (let i = 1; i < k; i += 1) out.push(1);
  return out;
}

// Signature de la STRUCTURE des blocs-moteur (footprints par groupe et par type).
// Ne change QUE quand un bloc apparaît/grandit (palier) — pas à chaque achat. Permet
// à cityMapRuntime de sauter le recompute complet tant que la structure est stable
// (il rafraîchit juste t.level pour la nappe). Cf. computeCityLayout / drawEngineSprawl.
export function cmEngineGroupSig(s) {
  if (!s || !s.buildings) return "";
  let out = "";
  for (const meta of CM_MAP_BUILDINGS) {
    const lvl = Math.floor(s.buildings[meta.id] || 0);
    if (lvl <= 0) continue;
    out += meta.id + cmEngineInstances(lvl, meta.id).map((g, i) => cmEngineGroupFoot(meta.id, g, i)).join(",") + ";";
  }
  return out;
}

function cmMapSlotKey(cycle, buildingId, index) { return `${cycle || 0}:${buildingId}:${index}`; }
function cmMapSlotPriority(meta) {
  // (Les aqueducs avaient ici une priorité 0 : ils devaient réserver la berge
  //  avant tout le monde. Devenus points d'eau semés dans la ville, ils n'ont
  //  plus rien à réserver et passent avec les autres infra.)
  if (CM_INFRA_IDS.has(meta.id))    return CM_SLOT_PRIORITIES.infra;
  if (CM_KNOWLEDGE_IDS.has(meta.id))return CM_SLOT_PRIORITIES.knowledge;
  return CM_SLOT_PRIORITIES.engine;
}
function cmCityMapSlotsFor(s) {
  if (s.cityMapSlots && typeof s.cityMapSlots === "object" && !Array.isArray(s.cityMapSlots)) return s.cityMapSlots;
  s.cityMapSlots = {};
  return s.cityMapSlots;
}
function cmCitizenName(seed, band) {
  if (band === undefined) {
    band = (typeof state !== "undefined" && state) ? cmEraBand(cmEraIndexFor(state)) : 3;
  }
  const given = cmPick(CM_GIVEN, seed);
  if (band <= 1) return seed % 3 === 0 ? `${given} ${cmPick(CM_EPITHETS, Math.floor(seed / 5))}` : given;
  if (band <= 3) return `${given} ${cmPick(CM_TRADES, Math.floor(seed / 7))}`;
  return `${given} ${cmPick(CM_HOUSES, Math.floor(seed / 7))}`;
}
// Nom de résidence pour l'habitat collectif (immeubles, tours, grands
// ensembles) : « Immeuble populaire des Tilleuls », jamais le nom d'un occupant.
function cmResidenceName(seed) {
  return cmPick(CM_RESIDENCES, seed);
}

// Élision française : « de Aldric » → « d'Aldric ». Les noms composés commencent
// toujours par le prénom, la première lettre suffit à décider.
function cmDeName(name) {
  return (/^[aeiouyàâäéèêëîïôöùûü]/i.test(name) ? "d'" : "de ") + name;
}

// Poids des rangs de voirie (partagé orientation + vocabulaire). La place pèse
// comme un chemin : simple liaison faible, elle porte son propre nom ailleurs.
const CM_RANK_W = { main: 4, avenue: 3, secondary: 2, path: 1, plaza: 1 };

// Orientation d'une cellule de rue (vrai = verticale) d'après sa connectivité
// réelle — le mask (liaisons MUTUELLES posées par buildGraph), pas la simple
// présence d'un voisin : deux rues parallèles collées ne se « touchent » pas
// dans le mask. Chaque axe est noté (rang du meilleur voisin relié, puis nombre
// de liaisons) : au carrefour, la voie la mieux classée impose son orientation —
// la tuile partagée avenue×venelle affiche le nom de l'avenue. Égalité parfaite
// (carrefour symétrique, cellule isolée) : repli sur la position vis-à-vis du
// centre.
function cmRoadCellVertical(L, gx, gy, road) {
  const cx = L ? L.cx : 0, cy = L ? L.cy : 0;
  const rankAt = (x, y) => {
    const e = L && L.roadMap && L.roadMap.get(x + "," + y);
    return e ? (CM_RANK_W[e.rank] || 3) : 1;   // rang inconnu = avenue (repli de roadWidthFor)
  };
  const m = road && road.mask ? road.mask : 0;
  const vN = m & ROAD_N ? rankAt(gx, gy - 1) : 0;
  const vS = m & ROAD_S ? rankAt(gx, gy + 1) : 0;
  const hE = m & ROAD_E ? rankAt(gx + 1, gy) : 0;
  const hW = m & ROAD_W ? rankAt(gx - 1, gy) : 0;
  const vScore = Math.max(vN, vS) * 10 + (vN ? 1 : 0) + (vS ? 1 : 0);
  const hScore = Math.max(hE, hW) * 10 + (hE ? 1 : 0) + (hW ? 1 : 0);
  return vScore !== hScore ? vScore > hScore : Math.abs(gx - cx) >= Math.abs(gy - cy);
}

// Rang d'une LIGNE de rue entière, mémoïsé sur le layout (recréé à chaque
// recompute → le mémo meurt avec lui). Le mot du nom (« Avenue », « Sente »…)
// doit être une propriété de la RUE, pas de la tuile : un axe qui part en main
// au centre et finit en chemin au bord garderait sinon un nom qui change en
// cours de route — exactement le défaut corrigé pour l'orientation.
function cmRoadLineRankW(L, vertical, coord) {
  if (!L || !L.roadMap) return 1;
  let memo = L._lineRankW;
  if (!memo) {
    memo = new Map();
    for (const e of L.roadMap.values()) {
      if (e.rank === "plaza") continue;
      const v = cmRoadCellVertical(L, e.gx, e.gy, e);
      const id = v ? "v" + e.gx : "h" + e.gy;
      const w = CM_RANK_W[e.rank] || 3;
      if ((memo.get(id) || 0) < w) memo.set(id, w);
    }
    L._lineRankW = memo;
  }
  return memo.get((vertical ? "v" : "h") + coord) || 1;
}

// Les MOTS des noms de places et de voies, dans les deux langues (audit I18N-4) :
// le mot générique suit la langue, le complément (« des Tanneurs ») reste un nom
// propre français — en anglais sans son article, et derrière : « Tanneurs
// Street » (cmOfEn). Mêmes listes, même ordre qu'avant : le tirage (cmPick) ne
// bouge pas, les noms français non plus.
const CM_PLAZA_WORDS = {
  marche: [{ fr: "Place du Marché", en: "Market Square" }, { fr: "Halles", en: "Market Hall" }],
  parvis: [{ fr: "Parvis", en: "Forecourt" }, { fr: "Place du Temple", en: "Temple Square" }],
  jardin: [{ fr: "Jardin Public", en: "Public Garden" }, { fr: "Square", en: "Green" }],
  grande: [{ fr: "Grande Place", en: "Grand Square" }, { fr: "Place", en: "Square" }, { fr: "Esplanade", en: "Esplanade" }],
  commune: [{ fr: "Place", en: "Square" }, { fr: "Place Commune", en: "Common" }]
};
const CM_W_AVENUE = { fr: "Avenue", en: "Avenue" }, CM_W_BOULEVARD = { fr: "Boulevard", en: "Boulevard" };
const CM_W_GRANDE_VOIE = { fr: "Grande Voie", en: "Great Road" }, CM_W_RUE = { fr: "Rue", en: "Street" };
const CM_W_RUELLE = { fr: "Ruelle", en: "Alley" }, CM_W_VENELLE = { fr: "Venelle", en: "Lane" };
const CM_STREET_WORDS = {
  w4: { city: [CM_W_AVENUE, CM_W_BOULEVARD], town: [{ fr: "Grand-Rue", en: "High Street" }, CM_W_GRANDE_VOIE] },
  w3: { city: [CM_W_BOULEVARD, { fr: "Cours", en: "Promenade" }], town: [{ fr: "Route", en: "Road" }, CM_W_GRANDE_VOIE] },
  w2: { city: [CM_W_RUE], town: [CM_W_RUE, CM_W_RUELLE] },
  w1: { city: [{ fr: "Passage", en: "Passage" }, CM_W_VENELLE], town: [{ fr: "Sente", en: "Path" }, CM_W_VENELLE, CM_W_RUELLE] }
};
// Nom entier, écrit dans chaque langue (jamais un gabarit partagé).
function cmPlaceName(word, of) {
  return tr({ fr: `${word.fr} ${of}`, en: `${cmOfEn(of)} ${word.en}` });
}

function cmRoadName(gx, gy) {
  const L = CM.layout;
  const cx = L ? L.cx : 0, cy = L ? L.cy : 0;
  const band = (L && L.counts) ? L.counts.eraBand : 2;
  // Les cellules de place portent un nom de place, pas de rue.
  const road = L && L.roadMap && L.roadMap.get(gx + "," + gy);
  if (road && road.rank === "plaza") {
    // Nom stable pour toute la place : basé sur la place la plus proche — celle dont le
    // RECTANGLE contient la case d'abord (`w`, `h` : places des îlots). Au seul centre, le
    // bord d'une grande place (forum 14 × 9, square 9 × 9 ; audit 2026-10-05, BUG-63)
    // prenait le nom de la place voisine, plus proche de lui que son propre centre.
    let pKey = gx + ":" + gy;
    let pKind = "centrale";
    if (L.plan && Array.isArray(L.plan.plazas)) {
      let best = Infinity;
      for (const p of L.plan.plazas) {
        const px0 = p.w ? p.gx - (p.w >> 1) : 0, py0 = p.h ? p.gy - (p.h >> 1) : 0;
        const inR = !!(p.w && p.h) && gx >= px0 && gx < px0 + p.w && gy >= py0 && gy < py0 + p.h;
        const d = inR ? -1 : Math.hypot(gx - p.gx, gy - p.gy);
        if (d < best) { best = d; pKey = p.gx + ":" + p.gy; pKind = p.kind || "centrale"; }
      }
    }
    const kindList = pKind === "marche" ? CM_PLAZA_WORDS.marche
      : pKind === "parvis" ? CM_PLAZA_WORDS.parvis
      : pKind === "jardin" ? CM_PLAZA_WORDS.jardin
      : band >= 4 ? CM_PLAZA_WORDS.grande : CM_PLAZA_WORDS.commune;
    return cmPlaceName(cmPick(kindList, cmHash("pk" + pKey)), cmPick(CM_STREET_OF, cmHash("pof" + pKey)));
  }
  // Une rue = UNE ligne (sa rangée ou sa colonne, choisie par la connectivité
  // réelle — cmRoadCellVertical) : l'ancienne heuristique par position basculait
  // à mi-parcours et la rue changeait de nom à chaque tuile dès que |gx-cx|
  // dépassait |gy-cy|. Le nom entier (mot + complément) ne dépend que de la
  // ligne, donc il tient d'un bout à l'autre.
  const vertical = cmRoadCellVertical(L, gx, gy, road);
  const lineId = vertical ? 1000 + gx : 2000 + gy;
  // « Grande voie » = l'axe qui PASSE par le centre — propriété de la ligne
  // entière, sinon chaque rue devenait « Avenue » sur la seule tuile où elle
  // croise l'axe central.
  const major = vertical ? gx === cx : gy === cy;
  const of = cmPick(CM_STREET_OF, cmHash("of" + lineId));
  // Le MOT du nom suit le RANG de la voie (rang pris sur la ligne entière) :
  // une artère s'appelle Avenue, une venelle Sente — plus de « Avenue » tirée
  // au sort sur un chemin de terre. Deux registres d'époque : bourg (bandes
  // 0-3) et ville moderne (4+).
  const w = major ? 4 : cmRoadLineRankW(L, vertical, vertical ? gx : gy);
  const words = w >= 4 ? CM_STREET_WORDS.w4 : w === 3 ? CM_STREET_WORDS.w3 : w === 2 ? CM_STREET_WORDS.w2 : CM_STREET_WORDS.w1;
  const kindList = band >= 4 ? words.city : words.town;
  return cmPlaceName(cmPick(kindList, cmHash("k" + lineId)), of);
}

// ── Merveilles : slots et vérification ──────────────────────────────────────
function cmBaseWonderSlot(idx, gridN, cx, cy, ringTarget) {
  // Emplacement thématique propre à chaque merveille (angle/anneau dédiés),
  // avec un léger jitter seedé pour que deux parties ne soient pas identiques.
  const w = CM_WONDERS[idx] || CM_WONDERS[0];
  // ⚠ Graine de l'état GLOBAL, pas du `s` passé à computeCityLayout (ce slot est
  // aussi lu hors calcul, par cmWonderSlot) : un plan calculé sur un autre état
  // (tests, aperçus) garde les emplacements de la partie en cours.
  const seed = (typeof state !== "undefined" && state && state.mapSeed) ? state.mapSeed : 0;
  const jit = seed ? (((cmHash(seed + ":wslot:" + w.id) % 100) / 100) - 0.5) * 0.5 : 0;
  const angle = (w.slot ? w.slot.angle : idx * (Math.PI * 2 / CM_WONDERS.length) - Math.PI / 2) + jit;
  // Anneau de base : si la portée urbaine réelle est fournie (calcul du plan), on
  // l'utilise pour que les merveilles suivent le périmètre de la cité au lieu de
  // rester collées à un plafond fixe (34) que les mégalopoles débordent — sinon
  // elles finissent enfouies au cœur dense. À défaut (rendu), repli sur la grille.
  const ringBase = ringTarget && ringTarget > 0
    ? Math.max(WONDER_CLEAR_R + 2, ringTarget)
    : Math.max(WONDER_CLEAR_R + 2, Math.min(Math.round(gridN * 0.3), 34));
  let ring = Math.max(WONDER_CLEAR_R + 2, Math.round(ringBase * (w.slot ? w.slot.ring : 1)));
  // Plafonne (sans jamais réduire les petits anneaux) pour que la position reste
  // dans la grille : center ± ring doit tenir dans [3, gridN-3] (cf. blocked()).
  // Indispensable car ringTarget × ring 1.18 peut dépasser le bord sur les mégalopoles.
  const maxRing = Math.max(WONDER_CLEAR_R + 2, Math.floor(gridN / 2) - 3);
  ring = Math.min(ring, maxRing);
  return { gx: Math.round(cx + Math.cos(angle) * ring), gy: Math.round(cy + Math.sin(angle) * ring) };
}

function cmWonderSlot(idx, gridN, cx, cy) {
  const saved = CM.layout && CM.layout.wonderSlots && CM.layout.wonderSlots[idx];
  if (saved && saved.gridN === gridN && saved.cx === cx && saved.cy === cy) return { gx: saved.gx, gy: saved.gy };
  return cmBaseWonderSlot(idx, gridN, cx, cy);
}

// `fits(gx, gy)` (optionnel, structure de ville) : l'emprise ENTIÈRE du parvis est
// posable — la garde historique ne testait que l'ancre. Avec lui, la recherche
// s'étend plus loin (une ville dense pousse la merveille vers sa lisière).
function cmDryWonderSlot(idx, gridN, cx, cy, riverSet, bankSet, plazas, ringTarget, fits = null) {
  const base = cmBaseWonderSlot(idx, gridN, cx, cy, ringTarget);
  const waterR = Math.max(2, WONDER_CLEAR_R - 1);
  const blocked = (gx, gy) => {
    if (gx < 2 || gy < 2 || gx > gridN - 3 || gy > gridN - 3) return true;
    // Jamais sur une esplanade : les places restent des espaces publics nus.
    if (Array.isArray(plazas)) {
      for (const p of plazas) {
        const half = p.size / 2 + 2.5;
        if (Math.abs(gx - p.gx) <= half && Math.abs(gy - p.gy) <= half) return true;
      }
    }
    for (let dy = -waterR; dy <= waterR; dy += 1) {
      for (let dx = -waterR; dx <= waterR; dx += 1) {
        if (Math.hypot(dx, dy) > waterR) continue;
        const k = (gx + dx) + "," + (gy + dy);
        if ((riverSet && riverSet.has(k)) || (bankSet && bankSet.has(k))) return true;
      }
    }
    return fits ? !fits(gx, gy) : false;
  };
  if (!blocked(base.gx, base.gy)) return { ...base, gridN, cx, cy };

  const angle = idx * (Math.PI * 2 / CM_WONDERS.length) - Math.PI / 2;
  let best = null, bestScore = Infinity;
  for (let radius = 1; radius <= WONDER_CLEAR_R + (fits ? 20 : 8); radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const gx = base.gx + dx, gy = base.gy + dy;
        if (blocked(gx, gy)) continue;
        const outward = -((gx - base.gx) * Math.cos(angle) + (gy - base.gy) * Math.sin(angle)) * 0.18;
        const score = Math.hypot(dx, dy) + outward;
        if (score < bestScore) {
          bestScore = score;
          best = { gx, gy, gridN, cx, cy };
        }
      }
    }
    if (best) return best;
  }
  return { ...base, gridN, cx, cy };
}
// Placement « sur l'eau » (l'Aiguille Céleste = phare) : au lieu d'ÉVITER le
// fleuve, on cale la merveille en PLEIN dessus. On part de sa position
// angulaire, on balaie quelques colonnes autour et on prend le centre du fleuve
// (riverYAt) le plus proche qui soit une vraie cellule d'eau (riverSet), en
// s'écartant du pont historique pour ne pas couper la traversée.
function cmWetWonderSlot(idx, gridN, cx, cy, riverYAt, riverSet, ringTarget, bridgeGx) {
  const base = cmBaseWonderSlot(idx, gridN, cx, cy, ringTarget);
  let best = null, bestScore = Infinity;
  for (let dx = -8; dx <= 8; dx += 1) {
    const gx = base.gx + dx;
    if (gx < 3 || gx > gridN - 3) continue;
    const gy = Math.round(riverYAt(gx));
    if (gy < 3 || gy > gridN - 3) continue;
    if (!riverSet.has(gx + "," + gy)) continue; // doit être en eau profonde (centre)
    const nearBridge = typeof bridgeGx === "number" ? Math.max(0, 5 - Math.abs(gx - bridgeGx)) : 0;
    const score = Math.abs(dx) + Math.abs(gy - base.gy) * 0.15 + nearBridge * 2;
    if (score < bestScore) { bestScore = score; best = { gx, gy }; }
  }
  if (best) return { ...best, gridN, cx, cy };
  // repli : centre du fleuve à la colonne de base
  const gx = Math.max(3, Math.min(gridN - 3, base.gx));
  return { gx, gy: Math.max(3, Math.min(gridN - 3, Math.round(riverYAt(gx)))), gridN, cx, cy };
}
// Érection animée des merveilles. Les RANGS ne sont plus gravés ici (BUG-12 de
// l'audit du 2026-10-05) : le cœur les grave au tick et au seuil de la chute
// (core/actions/wonders.js), carte affichée ou non. La carte compare à chaque
// frame les rangs gravés à ceux qu'elle a déjà vus et anime ce qui a monté —
// y compris pendant qu'elle ne tournait pas (vue Cité démontée, onglet caché) :
// l'érection se joue au retour. Mémoire de MODULE, qui survit aux démontages de
// CityView ; le tout premier relevé ne fait que s'aligner (pas d'érections en
// rafale au chargement d'une partie). Un rang qui baisse (Grand Reset, import)
// est suivi sans animation.
let cmWonderTiersSeen = null;
function cmCheckWonders(now) {
  if (typeof state === "undefined" || !state) return;
  const first = cmWonderTiersSeen === null;
  if (first) cmWonderTiersSeen = {};
  for (const w of CM_WONDERS) {
    const tier = wonderTierOf(state, w.id);
    if (!first && tier > (cmWonderTiersSeen[w.id] || 0)) CM.born["wonder:" + w.id] = now;
    cmWonderTiersSeen[w.id] = tier;
  }
}

// ── Graphe routier ───────────────────────────────────────────────────────────
function cmIsBridgeRoad(layout, gx, gy) {
  const road = layout && layout.roadMap && layout.roadMap.get(gx + "," + gy);
  return !!(road && road.roadSurface === "bridge");
}

function cmBuildRoadGraph(roads, roadSet, roadMeta, river, cx, cy, bridgeLaneW = 1) {
  const key = (gx, gy) => gx + "," + gy;
  const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const isWater = (gx, gy) => !!(river && river.isWater && river.isWater(gx, gy));
  // Pont central (historique) : sa colonne est SANCTUARISÉE — jamais invalidée par
  // la validation « pont droit », jamais émondée par l'élagage de connectivité. Il
  // reste ainsi TOUJOURS présent, même si une rive n'a encore aucun bâtiment (son
  // approche est aussi protégée du trim en amont via le set `demand`, cf. layout).
  // La sanctuarisation couvre les `bridgeLaneW` colonnes du pont (2 en double-voie).
  const protectedBridgeX = river && river.bridge ? Math.round(river.bridge.x) : null;
  const isProtectedBridgeCol = (x) => protectedBridgeX !== null && x >= protectedBridgeX && x < protectedBridgeX + (bridgeLaneW || 1);
  // ── Aucun pont NÉ DE L'ÎLE ────────────────────────────────────────────────
  // L'évasement du lit autour de l'Aiguille peut passer sous une route qui
  // longeait la rive : elle se retrouve « sur l'eau » et devient un tablier.
  // Résultat, un pont que personne n'a demandé, apparu par simple débordement
  // (Raph : « ça a activé la création d'un pont que je ne veux pas »).
  // Toute traversée qui touche la zone de l'île est donc élaguée — sauf le pont
  // historique, qui reste protégé par sa colonne.
  const _isles = (river && river.islands) || null;
  const inIslandZone = (gx, gy) => {
    if (!_isles) return false;
    for (const il of _isles) {
      // Rayon = l'emprise de l'évasement, pas seulement l'île : c'est bien là
      // que le lit a gonflé et donc là que de faux ponts peuvent naître.
      const r = il.rx * 2.1;
      if ((gx + 0.5 - il.x) ** 2 + (gy + 0.5 - il.y) ** 2 < r * r) return true;
    }
    return false;
  };
  const buildGraph = (activeSet) => {
    const isCore  = (gx, gy) => activeSet.has(key(gx, gy));
    const metaAt  = (gx, gy) => {
      const meta = roadMeta && roadMeta.get(key(gx, gy));
      return meta || { h: false, v: false, rank: "path" };
    };
    const allows = (gx, gy, dx, dy) => {
      if (!isCore(gx, gy)) return false;
      const meta = metaAt(gx, gy);
      if (dx !== 0) return !!meta.h;
      if (dy !== 0) return !!meta.v;
      return false;
    };
    const shouldConnect = (gx, gy, dx, dy) => {
      const nx = gx + dx, ny = gy + dy;
      if (!isCore(nx, ny)) return false;
      return allows(gx, gy, dx, dy) && allows(nx, ny, -dx, -dy);
    };
    const roadMap = new Map();
    const out = roads.filter((r) => activeSet.has(key(r.gx, r.gy))).map((r) => {
      const meta = metaAt(r.gx, r.gy);
      let mask = 0;
      if (shouldConnect(r.gx, r.gy,  0, -1)) mask |= ROAD_N;
      if (shouldConnect(r.gx, r.gy,  1,  0)) mask |= ROAD_E;
      if (shouldConnect(r.gx, r.gy,  0,  1)) mask |= ROAD_S;
      if (shouldConnect(r.gx, r.gy, -1,  0)) mask |= ROAD_W;
      const degree = (mask & ROAD_N ? 1 : 0) + (mask & ROAD_E ? 1 : 0) + (mask & ROAD_S ? 1 : 0) + (mask & ROAD_W ? 1 : 0);
      const orientation = meta.h && meta.v ? "intersection" : meta.h ? "horizontal" : meta.v ? "vertical" : "isolated";
      const type = orientation === "intersection" ? (degree >= 4 ? "intersection" : "junction") : "roadCore";
      const roadSurface = isWater(r.gx, r.gy) ? "bridge" : "road";
      const rr = { ...r, mask, orientation, roadType: type, roadSurface, rank: meta.rank || "path" };
      if (meta.pave != null) rr.pave = meta.pave;   // matière de la cellule (mémoire des rues, R4)
      roadMap.set(key(r.gx, r.gy), rr);
      return rr;
    });
    return { roads: out, roadMap };
  };

  const activeSet = new Set(roadSet);
  let graph = buildGraph(activeSet);

  // ── Réparation des COUTURES DE MASQUES (« routes solitaires », 2026-07-16) ──
  // Le réseau est connexe par CELLULES (stitchComponents y veille), mais le rendu
  // et les agents suivent les AXES MUTUELS (shouldConnect → mask) : une ligne qui
  // FINIT contre une route perpendiculaire sans que l'axe de jonction soit posé
  // sur LES DEUX cellules reste soudée pour les garde-fous… et orpheline à
  // l'écran (couture du stitcher, fins de lignes, atterrissages de pont — scan :
  // 44 % des générations synthétiques avaient ≥1 fragment par masques). On
  // promeut donc chaque point de CONTACT entre composantes-masques en vraie
  // jonction en T : l'axe partagé est tamponné des deux côtés, TERRE seulement
  // (l'eau reste v-pure : sémantique de pont droit). Un contact par fragment et
  // par tour, itéré jusqu'à convergence — RELIER plutôt que supprimer, comme la
  // couture amont. Posé AVANT la validation des ponts : un pont dont seul le
  // tampon de rive manquait est repêché au lieu d'être supprimé.
  // Rend le graphe du dernier tour : un tour qui ne tamponne rien laisse roadMeta et
  // activeSet tels quels, son graphe EST celui qu'on reconstruirait (PERF-7 de l'audit
  // du 2026-10-05 : deux buildGraph de ~7 600 rues économisés à chaque plan).
  const repairMaskSeams = (g0) => {
    const DIRS4 = [[ROAD_N, 0, -1], [ROAD_E, 1, 0], [ROAD_S, 0, 1], [ROAD_W, -1, 0]];
    const stamp = (k, axis) => {
      const m = roadMeta.get(k) || { h: false, v: false, rank: "path" };
      if (axis === "h") m.h = true; else m.v = true;
      roadMeta.set(k, m);
    };
    let g = g0;
    for (let guard = 0; guard < 16; guard += 1) {
      if (guard > 0) g = buildGraph(activeSet);
      // Composantes par MASQUES (les arcs mutuels, déjà matérialisés dans mask).
      const compOf = new Map();
      let nComp = 0;
      for (const r of g.roads) {
        const k0 = key(r.gx, r.gy);
        if (compOf.has(k0)) continue;
        const id = nComp;
        nComp += 1;
        const stack = [k0];
        compOf.set(k0, id);
        while (stack.length) {
          const rr = g.roadMap.get(stack.pop());
          for (const [bit, dx, dy] of DIRS4) {
            if (!(rr.mask & bit)) continue;
            const nk = key(rr.gx + dx, rr.gy + dy);
            if (!compOf.has(nk)) { compOf.set(nk, id); stack.push(nk); }
          }
        }
      }
      if (nComp <= 1) return g;
      const sizes = new Array(nComp).fill(0);
      for (const id of compOf.values()) sizes[id] += 1;
      let mainId = 0;
      for (let i = 1; i < nComp; i += 1) if (sizes[i] > sizes[mainId]) mainId = i;
      // Un contact terre↔terre par fragment → jonction en T (axe = direction du contact).
      const done = new Set();
      let stamped = false;
      for (const r of g.roads) {
        const k0 = key(r.gx, r.gy);
        const id = compOf.get(k0);
        if (id === mainId || done.has(id)) continue;
        if (isWater(r.gx, r.gy)) continue;
        for (const [, dx, dy] of DIRS4) {
          const ngx = r.gx + dx, ngy = r.gy + dy;
          const nk = key(ngx, ngy);
          const nid = compOf.get(nk);
          if (nid === undefined || nid === id) continue;
          if (isWater(ngx, ngy)) continue;
          const axis = dx !== 0 ? "h" : "v";
          stamp(k0, axis);
          stamp(nk, axis);
          done.add(id);
          stamped = true;
          break;
        }
      }
      if (!stamped) return g;   // restent des enclaves sans contact terrestre : à l'élagage
    }
    return null;              // 16e tour tamponné : le graphe est à refaire
  };
  graph = repairMaskSeams(graph) || buildGraph(activeSet);

  const bridgeKeys = graph.roads.filter((r) => r.roadSurface === "bridge").map((r) => key(r.gx, r.gy));
  const seen = new Set(), invalid = new Set();
  const dirInfo = [
    { bit: ROAD_N, dx: 0, dy: -1, name: "n" },
    { bit: ROAD_E, dx: 1, dy:  0, name: "e" },
    { bit: ROAD_S, dx: 0, dy:  1, name: "s" },
    { bit: ROAD_W, dx:-1, dy:  0, name: "w" }
  ];
  const oppositeDir = { n: "s", e: "w", s: "n", w: "e" };
  const hasLandRoadBehindExit = (exit) => {
    if (!exit || !exit.to || exit.to.roadSurface !== "road") return false;
    const backToBridge = oppositeDir[exit.name];
    for (const d of dirInfo) {
      if (d.name === backToBridge) continue;
      if (!(exit.to.mask & d.bit)) continue;
      const nr = graph.roadMap.get(key(exit.to.gx + d.dx, exit.to.gy + d.dy));
      if (nr && nr.roadSurface === "road") return true;
    }
    return false;
  };
  const hasExit = (exits, name, predicate) => exits.some((e) => e.name === name && predicate(e) && hasLandRoadBehindExit(e));
  const isStraightBridgeSegment = (component, exits) => {
    if (!component.length) return false;
    const xs = component.map((r) => r.gx), ys = component.map((r) => r.gy);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    let vertical   = minX === maxX && maxY > minY;
    let horizontal = minY === maxY && maxX > minX;
    if (component.length === 1) {
      const mask = component[0].mask;
      vertical   = !!((mask & ROAD_N) && (mask & ROAD_S) && !(mask & (ROAD_E | ROAD_W)));
      horizontal = !!((mask & ROAD_E) && (mask & ROAD_W) && !(mask & (ROAD_N | ROAD_S)));
    }
    if (vertical === horizontal) return false;
    if (vertical) {
      const innerV = component.filter((r) => r.gy !== minY && r.gy !== maxY);
      if (innerV.some((r) => r.mask & (ROAD_E | ROAD_W))) return false;
      return hasExit(exits, "n", (e) => e.from.gy === minY) && hasExit(exits, "s", (e) => e.from.gy === maxY);
    }
    const innerH = component.filter((r) => r.gx !== minX && r.gx !== maxX);
    if (innerH.some((r) => r.mask & (ROAD_N | ROAD_S))) return false;
    return hasExit(exits, "w", (e) => e.from.gx === minX) && hasExit(exits, "e", (e) => e.from.gx === maxX);
  };

  for (const startKey of bridgeKeys) {
    if (seen.has(startKey)) continue;
    const stack = [startKey], component = [], exits = [];
    seen.add(startKey);
    let isProtected = false, nearIsland = false;
    while (stack.length) {
      const k = stack.pop();
      const r = graph.roadMap.get(k);
      if (!r) continue;
      component.push(r);
      if (isProtectedBridgeCol(r.gx)) isProtected = true;
      if (inIslandZone(r.gx, r.gy)) nearIsland = true;
      for (const d of dirInfo) {
        if (!(r.mask & d.bit)) continue;
        const nk = key(r.gx + d.dx, r.gy + d.dy);
        const nr = graph.roadMap.get(nk);
        if (nr && nr.roadSurface === "bridge" && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        else if (nr && nr.roadSurface === "road") exits.push({ name: d.name, from: r, to: nr });
      }
    }
    // Le pont central est exempté : jamais supprimé, même s'il n'atterrit pas encore
    // sur un réseau des deux côtés (rive non bâtie en début de partie).
    if (!isProtected && (nearIsland || !isStraightBridgeSegment(component, exits))) {
      for (const r of component) invalid.add(key(r.gx, r.gy));
    }
  }
  if (invalid.size) {
    for (const k of invalid) activeSet.delete(k);
    graph = buildGraph(activeSet);
  }

  // ── Élagage de connectivité : ne garder que le réseau marchable relié au cœur.
  //    Les piétons se déplacent par adjacence ORTHOGONALE (agents.js) ; tout
  //    fragment terrestre, mini-cluster ou cul-de-sac coupé du cœur est à la fois
  //    un piège (habitant bloqué « au milieu de nulle part ») et un artefact
  //    visuel. On flood-fill depuis la route marchable la plus proche du cœur et
  //    on retire le reste. (Les ponts sans issue terrestre des deux côtés ont
  //    déjà été écartés par la validation ci-dessus.) Le réseau étant généré
  //    depuis le cœur, les composantes hors-cœur sont en pratique de petits
  //    fragments — pas des quartiers légitimes.
  const isBridgeAt = (gx, gy) => {
    const rr = graph.roadMap.get(key(gx, gy));
    return !!(rr && rr.roadSurface === "bridge");
  };
  const walkable = (gx, gy) => {
    const k = key(gx, gy);
    if (!graph.roadMap.has(k)) return false;
    if (river && river.cells && river.cells.has(k)) return isBridgeAt(gx, gy);
    if (river && river.banks && river.banks.has(k)) {
      return ORTHO.some(([dx, dy]) => isBridgeAt(gx + dx, gy + dy));
    }
    return true;
  };
  let seedKey = null, seedD = Infinity;
  for (const r of graph.roads) {
    if (!walkable(r.gx, r.gy)) continue;
    const d = (r.gx - cx) * (r.gx - cx) + (r.gy - cy) * (r.gy - cy);
    if (d < seedD) { seedD = d; seedKey = key(r.gx, r.gy); }
  }
  if (seedKey) {
    const reached = new Set([seedKey]);
    const stack = [seedKey];
    while (stack.length) {
      const k = stack.pop();
      const comma = k.indexOf(",");
      const gx = +k.slice(0, comma), gy = +k.slice(comma + 1);
      for (const [dx, dy] of ORTHO) {
        const ngx = gx + dx, ngy = gy + dy, nk = key(ngx, ngy);
        if (reached.has(nk) || !walkable(ngx, ngy)) continue;
        reached.add(nk);
        stack.push(nk);
      }
    }
    let pruned = false;
    for (const r of graph.roads) {
      // Les travées du pont central (colonnes sanctuarisées) ne sont jamais émondées.
      if (isProtectedBridgeCol(r.gx) && isWater(r.gx, r.gy)) continue;
      if (!reached.has(key(r.gx, r.gy))) { activeSet.delete(key(r.gx, r.gy)); pruned = true; }
    }
    if (pruned) graph = buildGraph(activeSet);
  }
  return { roads: graph.roads, roadMap: graph.roadMap, roadSet: activeSet };
}

function cmIsWalkableRoad(layout, gx, gy) {
  if (!layout || !layout.roadSet || !layout.roadSet.has(gx + "," + gy)) return false;
  const k = gx + "," + gy;
  if (layout.river && layout.river.cells && layout.river.cells.has(k)) return cmIsBridgeRoad(layout, gx, gy);
  if (layout.river && layout.river.banks && layout.river.banks.has(k)) {
    const rm = layout.roadMap;
    return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => {
      const nr = rm && rm.get((gx + dx) + "," + (gy + dy));
      return nr && nr.roadSurface === "bridge";
    });
  }
  return true;
}

// ── Compteurs et disposition ─────────────────────────────────────────────────
function cityCounts(s) {
  const lg = (v) => Math.log10(Math.max(0, v) + 1);
  const eraIndex    = cmEraIndexFor(s);
  const eraFrac     = cmEraFrac(eraIndex);
  const eraBand     = cmEraBand(eraIndex);
  const popDepth    = lg(toNum(s.population));
  const infraDepth  = lg(toNum(s.infrastructure));
  const urbanTier   = cmClamp(eraBand * 1.8 + Math.max(0, infraDepth - 5) * 0.85, 0, 14);
  const lateSurge   = Math.pow(Math.max(0, eraIndex - 12), 2.08);
  // Multiplicateur progressif : village compact (×1) → mégalopole étendue (×2.5)
  const lateScale   = 1 + Math.pow(eraFrac, 2) * 1.5;
  // Remplissage par la population : le plafond de maisons était piloté par le
  // SEUL âge (eraFrac) → une population qui gonfle AU SEIN d'un âge ne densifiait
  // jamais la ville (224 K habitants restaient un camp clairsemé de ~18 toits).
  // On ajoute un terme de pop SATURÉ (popDepth borné à 10) et PONDÉRÉ par
  // l'avancée d'âge (1−eraFrac) : il remplit la ville en early/mid — là où la pop
  // dépasse vite le décor — et s'efface en fin de partie, où l'âge fournit déjà
  // un grand plafond. Purement visuel : n'affecte que le nombre de toits dessinés.
  const popFill     = Math.pow(Math.min(popDepth, 10), 1.45) * (1 - eraFrac * 0.85);
  const houseCap    = Math.round((8 + Math.pow(eraFrac, 1.72) * 650) * lateScale + popFill * 10);
  const districtCap = Math.round(Math.max(0, Math.pow(Math.max(0, eraFrac - 0.34) / 0.66, 1.25) * 50) * lateScale);
  const houses         = cmClamp(2 + Math.pow(popDepth, 1.48) * 4.7 + Math.pow(eraIndex, 1.62) * 3.05 + lateSurge * 4.5, 1, houseCap);
  // ── Terme MOTEUR (« le spawn de bâtiments agrandit la ville ») ──────────────
  // Chaque achat de bâtiment-moteur ajoute de VRAIES maisons (placées SANS
  // chevauchement par le pipeline décor placeDecor→placeCategorySlotted). Basé sur
  // les GROUPES (cmEngineInstances) → invariant dans un palier → n'élargit PAS
  // structSig → AUCUN recompute par clic (croît par lot au palier ; la révélation
  // per-buit vient en Phase 2). Ajouté APRÈS le clamp houseCap (sinon écrêté) et
  // JAMAIS dans enginePressure (sinon double-compte de la pression). Molette __engineHomesK.
  // ⚠ Seule la HALLE traîne des maisons-compagnes. Ce terme existait quand un type
  // ne posait que quelques blocs : les maisons étaient le SEUL signe visible qu'on
  // achetait. Depuis « halle + ateliers », chaque achat pose de VRAIS bâtiments —
  // adosser en plus une maison à chacun des 47 ateliers doublait la population de
  // tuiles, donc la grille N, dont le recompute est ~O(N²). Mesuré à 29 types ×
  // 64 achats : N 128 → 114 et le recompute chute d'autant, pour zéro perte de
  // lecture (les ateliers sont déjà là). Molette __engineHomesK.
  let engineHomes = 0;
  const eK = (import.meta.env?.DEV && typeof globalThis !== "undefined" && globalThis.__engineHomesK) || 0.6;
  for (const meta of CM_MAP_BUILDINGS) {
    const lvl = Math.floor((s.buildings && s.buildings[meta.id]) || 0);
    if (lvl <= 0) continue;
    const inst = cmEngineInstances(lvl, meta.id);
    if (inst.length) engineHomes += Math.round(Math.sqrt(inst[0]) * eK);
  }
  // Les GRANDS ENSEMBLES ne se posent plus (audit 2026-10-05, MORT-4 : ils n'existaient
  // plus que sous `__ilots(false)`, avec leurs anneaux et monuments civiques) ; leur
  // compte reste lu par la foule des passants (cityMapRuntime, cmCitizenTargetFor).
  const megaDistricts  = eraBand < 3 ? 0 : cmClamp(Math.pow(Math.max(0, eraIndex - 7), 1.35) * 1.25 + Math.max(0, popDepth - 6.2) * 2 + Math.max(0, infraDepth - 5.5) * 1.45, 0, districtCap);
  // Quartiers pilotés par les achats : chaque nouveau district (ancre) crée un
  // maillage de routes local → des slots de maisons → la ville S'ÉTEND vraiment (les
  // maisons se posent près des routes ; sans nouveaux quartiers, le placement plafonne
  // et agrandir N ne fait qu'une grille vide). Group-based (via engineHomes) → stable
  // dans un palier. Cappé pour borner le coût de routes-gen/connexion. Molette __engineQK.
  const engineQuarters = Math.min(40, Math.round(engineHomes / ((import.meta.env?.DEV && typeof globalThis !== "undefined" && globalThis.__engineQK) || 55)));
  // `houses` = maisons de POPULATION (toujours affichées). engineHomes est placé
  // SÉPARÉMENT (catégorie 'enginehome') pour être révélé per-buy (cf. computeCityLayout
  // + drawTile). engineHomesRaw = total brut d'achats moteur (Σ niveaux) → sert de
  // compteur de RÉVÉLATION (grandit d'1 par achat, rafraîchi sans recompute).
  let engineHomesRaw = 0;
  for (const meta of CM_MAP_BUILDINGS) engineHomesRaw += Math.floor((s.buildings && s.buildings[meta.id]) || 0);
  // La Maison des Plaisirs se dresse quand ses jeux ouvrent (cf. PLAISIRS_OPEN_ERA).
  const plaisirsOpen = Math.max(eraIndex, (s && s.bestEraIndex) | 0) >= PLAISIRS_OPEN_ERA;
  return { houses, engineHomes, engineHomesRaw, engineQuarters, megaDistricts, urbanTier, eraIndex, eraBand, eraFrac, plaisirsOpen };
}

// ── Connexion des bâtiments au réseau ────────────────────────────────────────
// Trace des rues DEPUIS le réseau existant JUSQU'aux bâtiments qui n'en touchent
// aucune. Deux régimes :
//   - décoratifs (maisons/tentes, non achetés) : reliés GRATUITEMENT (le réseau de
//     base suit la ville) — coût plafonné (sécurité, ils sont déjà ~adjacents) ;
//   - moteurs (achetés) : reliés au BUDGET de tuiles = nb de routes achetées
//     (1 route = 1 tuile de connecteur), du PLUS PROCHE au plus loin.
// Pose les cellules dans roads/roadKey/roadMeta avec les flags h/v pour que
// cmBuildRoadGraph les relie. Renvoie { engineTotal, engineConnected }.
function connectBuildingsToNetwork(o) {
  const { roads, roadKey, roadMeta, tiles, N, riverSet, bankSet, claimed, engineFootprint, occupiedFoot,
    districtWalk } = o;
  const RW = { path: 0, secondary: 1, avenue: 2, main: 3, plaza: 4 };
  const O4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const K = (x, y) => x + "," + y;
  const NN = N * N;
  const inB = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const footCells = (t) => { const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1, out = []; for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) out.push([t.gx + ax, t.gy + ay]); return out; };

  // ── Grilles TYPÉES (perf) ──────────────────────────────────────────────────
  // Cette fonction dominait le layout entier (~65 % du temps, ~2,9 s à gridN 148) :
  // le BFS multi-source utilisait Map/Set de clés "x,y" (concat + hash de string
  // par cellule) et était relancé À CHAQUE bâtiment connecté. On passe la grille
  // en tableaux typés — même parcours, mêmes égalités, mêmes chemins (le hash de
  // layout est identique avant/après), juste sans strings dans le chemin chaud.
  // `blockedG` fusionne les 6 sets d'obstacles (eau/berge/bâti/réservé) en une
  // seule lecture ; `roadG` reflète roadKey pour les cellules DANS la grille.
  const blockedG = new Uint8Array(NN);
  const markSet = (set) => {
    for (const k of set) {
      const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      if (inB(x, y)) blockedG[y * N + x] = 1;
    }
  };
  markSet(riverSet); markSet(bankSet); markSet(claimed); markSet(engineFootprint); markSet(occupiedFoot);
  // Jardins et ceinture verte (structure de ville, lot L8) : la desserte les
  // CONTOURNE. Libres, ils attiraient les sentiers comme n'importe quel terrain
  // vague — mesuré au bourg, 41 % des cases de jardin finissaient en chemin.
  if (o.softBlock) markSet(o.softBlock);
  // ⚠ LES CELLULES DE `districtWalk` SONT TRAVERSABLES par la desserte — un
  // sentier, pas un bâtiment dessus (footprintFits, lui, continue de les refuser) :
  // le carré du foyer du campement, où les sentiers convergent. (Le nom vient des
  // terrains vagues des grands ensembles, partis avec l'ancien placement, MORT-4.)
  // Parvis de merveille et domaine des Plaisirs restent INTERDITS.
  // Déclamé APRÈS claimed (l'ordre annule), AVANT les emprises bâties (ces
  // cellules ne portent jamais de bâtiment, l'ordre est sans effet là-dessus).
  if (districtWalk) {
    for (const k of districtWalk) {
      const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      if (inB(x, y)) blockedG[y * N + x] = 0;
    }
  }
  for (const t of tiles) for (const [x, y] of footCells(t)) if (inB(x, y)) blockedG[y * N + x] = 1;
  const roadG = new Uint8Array(NN);
  for (const k of roadKey) {
    const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
    if (inB(x, y)) roadG[y * N + x] = 1;
  }
  // Une cellule de route peut vivre HORS grille (sortie de carte) : roadG ne la
  // couvre pas, on retombe alors sur le Set (rare, hors du chemin chaud).
  const isRoadAt = (x, y) => (inB(x, y) ? roadG[y * N + x] === 1 : roadKey.has(K(x, y)));
  // Boucles INLINE (pas de footCells) : appelé des millions de fois sur une
  // métropole — l'allocation du tableau d'empreinte dominait la connexion.
  const touchesRoad = (t) => {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) {
      const fx = t.gx + ax, fy = t.gy + ay;
      for (let oi = 0; oi < 4; oi += 1) if (isRoadAt(fx + O4[oi][0], fy + O4[oi][1])) return true;
    }
    return false;
  };

  // Pose (ou complète) une cellule de route avec un flag d'axe + un rang.
  const lay = (x, y, axis, rank) => {
    const k = K(x, y);
    const m = roadMeta.get(k) || { h: false, v: false, rank: "path" };
    if (axis === "h") m.h = true; else m.v = true;
    if ((RW[rank] || 0) > (RW[m.rank] || 0)) m.rank = rank;
    roadMeta.set(k, m);
    if (!roadKey.has(k)) { roadKey.add(k); roads.push({ gx: x, gy: y }); }
    if (inB(x, y)) roadG[y * N + x] = 1;
  };

  // Champ de distance : BFS multi-source depuis TOUTES les routes, sur cases
  // libres. dist/from en Int32Array réutilisés entre itérations (fill = memset).
  // `from` encode le parent : ≥0 = index grille ; ≤ -2 = position HORS grille
  // (source de route en bord de carte), bijection (x+512)*4096+(y+512).
  const dist = new Int32Array(NN), from = new Int32Array(NN);
  let qxA = new Int32Array(0), qyA = new Int32Array(0);
  const encOut = (x, y) => -(2 + (x + 512) * 4096 + (y + 512));
  const computeField = () => {
    dist.fill(-1); from.fill(-1);
    // Capacité garantie : sources (roadKey, y compris hors grille) + cellules
    // libres visitées (< NN). Jamais de drop silencieux.
    const need = NN + roadKey.size + 8;
    if (qxA.length < need) { qxA = new Int32Array(need); qyA = new Int32Array(need); }
    // Sources dans l'ORDRE D'INSERTION de roadKey (comme l'ancienne version : en
    // cas d'égalité de distance, le parent — donc le chemin carved — en dépend).
    let qn = 0;
    for (const k of roadKey) {
      const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      qxA[qn] = x; qyA[qn] = y; qn += 1;
      if (inB(x, y)) dist[y * N + x] = 0;
    }
    for (let qi = 0; qi < qn; qi += 1) {
      const x = qxA[qi], y = qyA[qi];
      const d = inB(x, y) ? dist[y * N + x] : 0;
      const parentEnc = inB(x, y) ? y * N + x : encOut(x, y);
      for (let oi = 0; oi < 4; oi += 1) {
        const nx = x + O4[oi][0], ny = y + O4[oi][1];
        if (!inB(nx, ny)) continue;
        const ni = ny * N + nx;
        if (dist[ni] !== -1 || blockedG[ni] === 1) continue;
        dist[ni] = d + 1; from[ni] = parentEnc;
        qxA[qn] = nx; qyA[qn] = ny; qn += 1;
      }
    }
  };
  const decodeFrom = (v) => {
    if (v >= 0) return [v % N, (v / N) | 0];
    const m = -v - 2;
    return [((m / 4096) | 0) - 512, (m % 4096) - 512];
  };

  // ── MAJ INCRÉMENTALE du champ (perf) ───────────────────────────────────────
  // Après un carve, seules les cellules NOUVELLEMENT routées deviennent sources
  // (dist 0). Ajouter des sources ne peut que FAIRE BAISSER les distances → on
  // relaxe une BFS bornée depuis ces cellules (au lieu de recalculer computeField
  // en entier, O(N²), à chaque bâtiment connecté = le mur O(P·N²) en fin de partie).
  // Le champ reste un arbre de plus courts chemins valide (dist exactes, `from`
  // pointant vers UNE source la plus proche) → plan() reste correct. Déterministe.
  const relaxFrom = (attach, path) => {
    const need = NN + path.length + 8;
    if (qxA.length < need) { qxA = new Int32Array(need); qyA = new Int32Array(need); }
    let rn = 0;
    const seed = (x, y) => { if (!inB(x, y)) return; dist[y * N + x] = 0; qxA[rn] = x; qyA[rn] = y; rn += 1; };
    seed(attach[0], attach[1]);
    for (const [px, py] of path) seed(px, py);
    for (let qi = 0; qi < rn; qi += 1) {
      const x = qxA[qi], y = qyA[qi], d = dist[y * N + x], parentEnc = y * N + x;
      for (let oi = 0; oi < 4; oi += 1) {
        const nx = x + O4[oi][0], ny = y + O4[oi][1];
        if (!inB(nx, ny)) continue;
        const ni = ny * N + nx;
        if (blockedG[ni] === 1) continue;
        if (dist[ni] !== -1 && dist[ni] <= d + 1) continue;  // déjà aussi bon → rien à faire
        dist[ni] = d + 1; from[ni] = parentEnc;
        qxA[rn] = nx; qyA[rn] = ny; rn += 1;
      }
    }
  };

  // Meilleur seuil (case libre adjacente à l'emprise). Le COÛT du raccord est la
  // valeur du champ (dist = longueur du chemin) : la boucle de sélection n'a
  // besoin QUE de lui — remonter le chemin de chaque candidat à chaque itération
  // était le poste dominant de la connexion (O(candidats × longueur) par pose).
  const planCost = (t) => {
    let bx = 0, by = 0, bd = -1;
    const tsx = t.spanX || t.size || 1, tsy = t.spanY || t.size || 1;
    for (let ax = 0; ax < tsx; ax += 1) for (let ay = 0; ay < tsy; ay += 1) {
      const fx = t.gx + ax, fy = t.gy + ay;
      for (let oi = 0; oi < 4; oi += 1) {
        const sx = fx + O4[oi][0], sy = fy + O4[oi][1];
        if (!inB(sx, sy)) continue;
        const si = sy * N + sx;
        if (roadG[si] === 1) continue;
        const d = dist[si]; if (d === -1) continue;
        if (bd === -1 || d < bd) { bd = d; bx = sx; by = sy; }
      }
    }
    return bd === -1 ? null : { x: bx, y: by, d: bd };
  };

  // Chemin remonté jusqu'au réseau — construit UNE fois, pour l'élu seulement.
  const planPath = (best) => {
    const path = []; let cx = best.x, cy = best.y;
    for (let steps = 0; steps <= NN; steps += 1) { // garde-fou absolu
      if (isRoadAt(cx, cy)) break;
      path.push([cx, cy]);
      const enc = inB(cx, cy) ? from[cy * N + cx] : -1;
      if (enc === -1) break;
      const p = decodeFrom(enc); cx = p[0]; cy = p[1];
    }
    const last = path[path.length - 1];
    const lastEnc = inB(last[0], last[1]) ? from[last[1] * N + last[0]] : -1;
    const attach = lastEnc !== -1 ? decodeFrom(lastEnc) : [cx, cy];
    return { path, attach, cost: path.length };
  };

  const carve = (p, rank) => {
    const ordered = [p.attach, ...p.path.slice().reverse()]; // route → ... → seuil
    for (let i = 0; i + 1 < ordered.length; i += 1) {
      const [ax, ay] = ordered[i], [bx, by] = ordered[i + 1], axis = ay === by ? "h" : "v";
      lay(ax, ay, axis, rank); lay(bx, by, axis, rank);
    }
  };

  // ── Redressement : un connecteur se trace en L, pas en escalier ────────────
  // Le chemin remonté du champ BFS est un plus court chemin, mais sa FORME suit
  // l'ordre d'expansion de l'onde : sur corridor long, ça zigzague (le « chemin
  // ivre »). On lui substitue, quand elle est LIBRE, la polyligne à un seul
  // virage de même longueur (grande jambe d'abord : se lit comme un tracé
  // volontaire). Si un obstacle a forcé le détour BFS, on garde le chemin BFS.
  const straighten = (p) => {
    if (p.path.length < 3) return;
    const [ax, ay] = p.path[0];                       // seuil (porte du bâtiment)
    const [bx, by] = p.attach;                        // cellule de route rejointe
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 || dy === 0) return;                 // déjà droit
    if (Math.abs(dx) + Math.abs(dy) !== p.cost) return; // le détour était forcé
    const tryL = (horizFirst) => {
      const out = [];
      let x = ax, y = ay;
      const walk = (tx, ty) => {
        const sx = Math.sign(tx - x), sy = Math.sign(ty - y);
        while (x !== tx || y !== ty) {
          if (!(x === ax && y === ay)) {
            if (!inB(x, y)) return false;
            const i = y * N + x;
            if (blockedG[i] === 1 || roadG[i] === 1) return false;
          }
          out.push([x, y]);
          x += sx; y += sy;
        }
        return true;
      };
      const cornerX = horizFirst ? bx : ax, cornerY = horizFirst ? ay : by;
      if (!walk(cornerX, cornerY) || !walk(bx, by)) return null;
      return out;                                     // seuil → … → dernière avant attach
    };
    const first = Math.abs(dx) >= Math.abs(dy);
    const straightPath = tryL(first) || tryL(!first);
    if (straightPath && straightPath.length === p.path.length) p.path = straightPath;
  };

  // Chantiers de voirie : le budget des MOTEURS se compte en VAGUES — 1
  // chantier payé raccorde les `ceil(manquants × ROAD_LINK_WAVE_FRACTION)`
  // moteurs les plus proches (corridors ENTIERS, min 1). Mesuré : une grande
  // ville a 200 à 650 moteurs non reliés — « 1 chantier = 1 moteur » ne passait
  // pas l'échelle ; en vagues, ~15 chantiers couvrent n'importe quelle ville.
  // Le prix ∝ tuiles de la vague est réglé à l'achat (roadWorkCost).
  let engineWorks = Math.max(0, o.engineWorks | 0);
  let engineWorksUsed = 0;
  let waveLeft = 0;                 // moteurs restant à servir dans la vague ouverte
  const rank = o.connectorRank || "secondary";
  // Plafond de connexion gratuite d'un décoratif (sécurité). En mode DESSERTE
  // (archétype organique, échafaudage dissous), le corridor est la règle et non
  // l'exception : l'appelant passe un plafond à l'échelle du rayon de la ville.
  const MAX_FREE = Math.max(4, o.freeCap | 0);

  // ── UN BÂTIMENT = UNE PORTE SUR RUE ────────────────────────────────────────
  // (Raph 2026-07-29, devant une ville affichée « 100 % relié » avec des
  // dizaines de bâtiments sans rue.) L'unité de desserte est le BÂTIMENT, pas
  // le bloc : compter par bloc — « le pâté touche une rue par un coin, ses 20
  // bâtiments sont servis » — rendait la jauge aveugle (mesuré : 100 % affiché
  // pour 73 % de bâtiments réellement sur rue). Les VENELLES tirées jusqu'à la
  // case libre d'un bâtiment enclavé règlent la quasi-totalité des cas (mesuré :
  // 125 des 163 orphelins ont une case libre ; le reste est muré par
  // construction et sort du dénominateur).
  const served = touchesRoad;

  // Candidats = tuiles PAS ENCORE reliées, maintenus entre itérations (l'ancienne
  // version rescannait TOUTES les tuiles à chaque bâtiment connecté). L'ordre
  // relatif de `tiles` est préservé → mêmes ex æquo, même pick.
  // Champ maintenu INCRÉMENTALEMENT : 1 seule BFS complète, puis relaxFrom après
  // chaque carve (l'ancien recompute complet à chaque itération, et sa molette
  // d'A/B __incrConnect, sont retirés — audit 2026-10-05, DEV-3).
  let pending = tiles.filter((t) => !served(t));
  let guard = tiles.length + 8;
  // La boucle de desserte, en fonction : elle tourne une 2e fois sans les
  // obstacles DOUX (cf. plus bas).
  const runPass = () => {
  // Tout est déjà desservi : le champ ne serait lu par personne (planCost ne vise que
  // les tuiles non desservies, ici et dans l'estimation de la vague) — PERF-7.
  if (!pending.some((t) => !served(t))) return;
  computeField();
  while (guard-- > 0 && pending.length > 0) {
    let pick = null;
    const still = [];
    for (const t of pending) {
      if (served(t)) continue; // reliée (ou bloc relié) par un carve précédent → sort
      still.push(t);
      const isEngine = t.type === "engine";
      const best = planCost(t); if (!best || best.d === 0) continue;
      if (isEngine) { if (waveLeft <= 0 && engineWorksUsed >= engineWorks) continue; }
      else if (best.d > MAX_FREE) continue;
      const rk = (isEngine ? 1e6 : 0) + best.d; // décoratifs d'abord, puis coût croissant
      if (!pick || rk < pick.rk) pick = { t, best, isEngine, rk };
    }
    pending = still;
    if (!pick) break;
    const p = planPath(pick.best);
    straighten(p);
    // Les HABITATIONS sont desservies par des SENTIERS (rang path : étroits, sans
    // trottoir, l'allée de seuil fait le raccord) À TOUTES les ères — seule une
    // venelle très empruntée devient une rue via upgradeTrunkByUsage.
    //
    // Les MOTEURS, eux, se partagent selon leur TAILLE, et c'est une règle
    // urbaine, pas un réglage : une grande halle appelle une rue (livraisons,
    // façade, adresse), un petit atelier se contente d'une venelle. Desservir
    // TOUS les moteurs en rue donnait 49 % de `secondary` — une ville dont la
    // moitié des cellules porte deux trottoirs ; les desservir tous en venelle
    // donnait 66 % de `path` et plus un trottoir nulle part (les deux mesurés
    // band 4). L'emprise tranche, et elle tranche juste.
    const foot = (pick.t.spanX || pick.t.size || 1) * (pick.t.spanY || pick.t.size || 1);
    carve(p, (pick.isEngine && foot >= ROAD_RANKS.streetFoot) ? rank : "path");
    relaxFrom(p.attach, p.path); // MAJ champ (au lieu de recompute complet)
    if (pick.isEngine) {
      if (waveLeft <= 0) {
        // Ouverture d'une vague : sa taille se fige sur les BÂTIMENTS manquants
        // du moment (les carves précédents ont pu en relier au passage).
        engineWorksUsed += 1;
        let rem = 0;
        for (const t of pending) if (t.type === "engine" && !served(t)) rem += 1;
        waveLeft = Math.max(1, Math.ceil(rem * ROAD_LINK_WAVE_FRACTION));
      }
      waveLeft -= 1;
    }
    // RAFALE des raccords à UNE tuile : avec l'échafaudage de perméabilité,
    // l'essentiel de la desserte est un seuil collé au réseau — les carver un
    // par itération faisait O(P²) de re-scans (mesuré : 244 ms de connexion sur
    // une métropole). Posés en rafale dans la même passe : chaque mini-carve
    // est revalidé (planCost) et relaxé, le champ reste exact.
    for (const t of still) {
      if (t === pick.t || t.type === "engine" || served(t)) continue;
      const b1 = planCost(t);
      if (!b1 || b1.d !== 1) continue;
      const p1 = planPath(b1);
      carve(p1, "path");
      relaxFrom(p1.attach, p1.path);
    }
    pending = pending.filter((t) => t !== pick.t || !served(t));
  }
  };
  runPass();
  // OBSTACLES DOUX (jardins, ceinture verte — structure de ville) : contournés
  // quand c'est possible, TRAVERSÉS en dernier recours. Un atelier entouré de
  // jardins restait sinon sans rue alors qu'il a une porte libre (contrat de
  // roadDesserte.test : aucun bâtiment servable sans rue).
  if (o.softBlock && o.softBlock.size && pending.some((t) => !served(t))) {
    for (const k of o.softBlock) {
      const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      if (inB(x, y)) blockedG[y * N + x] = 0;
    }
    // Les emprises bâties restent des obstacles, même posées sur un jardin.
    for (const tt of tiles) for (const [x, y] of footCells(tt)) if (inB(x, y)) blockedG[y * N + x] = 1;
    guard = tiles.length + 8;
    runPass();
  }

  // Prochaine VAGUE proposée (chantiers de voirie) : les B moteurs non reliés
  // les plus proches (B = fraction du manquant), tuiles cumulées estimées sur le
  // champ final — la boutique en tire le prix. null = tout est relié. (Les
  // corridors se raccourcissent entre eux pendant une vraie vague : l'estimation
  // majore un peu, assumé.)
  let nextEngine = null;
  let servableOrphans = 0;
  {
    // Un candidat par BÂTIMENT non relié JOIGNABLE (venelle possible jusqu'à sa
    // case libre) ; les murés par construction n'ont pas de plan et sortent.
    const costs = [];
    for (const t of pending) {
      if (t.type !== "engine" || served(t)) continue;
      const b = planCost(t);
      if (!b || b.d === 0) continue;
      costs.push({ d: b.d, id: t.buildingId || t.variant || null });
    }
    servableOrphans = costs.length;
    if (costs.length) {
      costs.sort((a, b2) => a.d - b2.d);
      const waveN = Math.max(1, Math.ceil(costs.length * ROAD_LINK_WAVE_FRACTION));
      let tilesSum = 0;
      for (let i = 0; i < waveN; i += 1) tilesSum += costs[i].d;
      nextEngine = { tiles: tilesSum, count: waveN, targetId: costs[0].id };
    }
  }

  // Couverture PAR BÂTIMENT : bâtiments achetables ayant une rue à leur porte,
  // sur les bâtiments SERVABLES (reliés + joignables par une venelle). Ceux que
  // leurs voisins murent par construction sortent du dénominateur : les compter
  // rendrait le 100 % (donc le plein bonus) définitivement inatteignable.
  let engineConnected = 0, engineAll = 0;
  for (const t of tiles) if (t.type === "engine") {
    engineAll += 1;
    if (touchesRoad(t)) engineConnected += 1;
  }
  return {
    engineTotal: engineConnected + servableOrphans,
    engineConnected,
    // Total BRUT (murés compris) : sert à DIRE la vérité dans l'encart — la
    // jauge se joue sur les servables (sinon le plein bonus serait hors
    // d'atteinte), mais le joueur qui voit un cœur d'îlot sans rue mérite le
    // chiffre exact plutôt qu'un 100 % qui le contredit.
    engineAll,
    engineWorksUsed,
    nextEngine
  };
}

// ── Usage du réseau : combien de bâtiments passent par chaque cellule ───────
// Arbre BFS sur les cellules de route depuis la racine (cellule la plus proche
// du cœur) ; chaque bâtiment remonte l'arbre depuis sa « porte » (première
// cellule de réseau adjacente à l'emprise), +1 par cellule traversée. Sert au
// TRONC gratuit des hameaux (path → secondary) ET aux ÉLARGISSEMENTS payés
// (chantiers de voirie : secondary → avenue → main).
function computeRoadUsage({ roadKey, tiles, coreX, coreY }) {
  const use = new Map();
  if (!roadKey || roadKey.size === 0) return { use, served: 0 };
  const O4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let root = null, rootD = Infinity;
  for (const k of roadKey) {
    const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
    const d = (x - coreX) * (x - coreX) + (y - coreY) * (y - coreY);
    if (d < rootD) { rootD = d; root = k; }
  }
  const parent = new Map([[root, null]]);
  const q = [root];
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const ci = cur.indexOf(","), x = +cur.slice(0, ci), y = +cur.slice(ci + 1);
    for (const [dx, dy] of O4) {
      const nk = (x + dx) + "," + (y + dy);
      if (roadKey.has(nk) && !parent.has(nk)) { parent.set(nk, cur); q.push(nk); }
    }
  }
  // Comptes par PORTE, puis remontés en ordre BFS inverse (un enfant avant son
  // parent) : O(R), au lieu d'une remontée de l'arbre par bâtiment, O(T × profondeur)
  // — PERF-7 de l'audit du 2026-10-05. Mêmes comptes, et même ordre d'insertion dans
  // `use` : celui où les remontées successives rencontraient chaque cellule (une
  // remontée s'arrête à la première cellule déjà vue — ses ancêtres le sont aussi).
  let served = 0;
  const atDoor = new Map(), firstSeen = [], seen = new Set();
  for (const t of tiles) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    let door = null;
    for (let ax = 0; ax < sx && !door; ax += 1) for (let ay = 0; ay < sy && !door; ay += 1) {
      for (const [dx, dy] of O4) {
        const nk = (t.gx + ax + dx) + "," + (t.gy + ay + dy);
        if (parent.has(nk)) { door = nk; break; }
      }
    }
    if (!door) continue;
    served += 1;
    atDoor.set(door, (atDoor.get(door) || 0) + 1);
    for (let cur = door; cur && !seen.has(cur); cur = parent.get(cur)) { seen.add(cur); firstSeen.push(cur); }
  }
  const sub = new Map();
  for (let i = q.length - 1; i >= 0; i -= 1) {
    const k = q[i], n = (sub.get(k) || 0) + (atDoor.get(k) || 0);
    if (!n) continue;
    sub.set(k, n);
    const p = parent.get(k);
    if (p) sub.set(p, (sub.get(p) || 0) + n);
  }
  for (const k of firstSeen) use.set(k, sub.get(k));
  return { use, served };
}

// ── Hiérarchie par l'usage (mode desserte) ──────────────────────────────────
// Le tronc n'est pas décrété, il ÉMERGE : au-dessus du seuil d'usage, `path`
// passe `secondary` (on ne rétrograde jamais, on ne touche ni avenue/main ni
// plaza) : au rendu, le chemin le plus emprunté s'élargit (roadWidthFor) — la
// grand-voie du hameau vers le pont se lit d'elle-même.
function upgradeTrunkByUsage({ roadKey, roadMeta, tiles, coreX, coreY, usage = null }) {
  const { use, served } = usage || computeRoadUsage({ roadKey, tiles, coreX, coreY });
  // Seuil : « tronc » = une vraie part du bâti passe par là (plancher 4). La
  // part est réglable (ROAD_RANKS.trunkUse) : c'est le robinet qui décide
  // combien de venelles deviennent des rues, donc combien de trottoirs porte la
  // ville. Il se règle EN REGARD de `connector` — les deux forment un couple.
  const T = Math.max(4, Math.ceil(served * ROAD_RANKS.trunkUse));
  for (const [k, n] of use) {
    if (n < T) continue;
    const m = roadMeta.get(k);
    if (m && m.rank === "path") m.rank = "secondary";
  }
}

// ── Élargissements PAYÉS (chantiers de voirie) ──────────────────────────────
// Quand tous les moteurs sont raccordés, chaque chantier suivant promeut le
// TRONÇON le plus emprunté (secondary → avenue → main → AUTOROUTE). Un tronçon
// = run contiguë de cellules de même rang et même axe, hors eau ; score =
// usage cumulé. Anti-PÂTÉ (Raph 2026-07-28, « des masses grises ») : seules de
// vraies ARTÈRES sont promues — longueur ≥ MIN_RUN, et jamais un tronçon dont
// la parallèle immédiate est déjà large (c'est ce qui fusionnait le cœur en
// pâtés). L'échelon final creuse la VOIE JUMELLE d'un boulevard (autoroute
// 2 tuiles, terre-plein sur la couture) sur les cellules libres du côté le plus
// dégagé — un bâtiment interrompt la jumelle, sous 60 % posable pas
// d'autoroute ici. Les deux voies se disqualifient ensuite mutuellement par la
// règle anti-parallèle : l'échelle se clôt d'elle-même. Déterministe : tri
// score desc puis clé, appliqué itérativement. Renvoie { applied, next } —
// next = { tiles, toRank } (toRank "twin" = doubler en autoroute), null si
// plus rien à élargir.
function applyRoadWidenings({ roads, roadKey, roadMeta, usage, riverSet, count, cellFree }) {
  // 6 = au-dessus de la jambe courte d'un axe en escalier (4-7) : les vrais
  // segments d'artère qualifient, les bouts de 3 cellules ne deviennent plus
  // jamais des « boulevards » de poche.
  const MIN_RUN = 6;
  const PROMOTE = { secondary: "avenue", avenue: "main", main: "twin" };
  const WIDE = { avenue: 1, main: 1 };
  const free = typeof cellFree === "function" ? cellFree : () => false;
  const use = usage && usage.use ? usage.use : new Map();
  const K2 = (x, y) => x + "," + y;
  // ── S1 — PLAFOND DES RANGS LARGES (cf. ROAD_RANKS.wideCap) ──────────────────
  // Compteur tenu à jour dans `promote`, jamais recompté : `collectRuns` tourne
  // une fois PAR promotion, et un recompte y serait O(count × réseau).
  const capOn = roadKey.size >= ROAD_RANKS.capMinCells;
  // Fonction et non constante : creuser une voie jumelle AJOUTE des cellules au
  // réseau, donc le dénominateur bouge en cours de boucle.
  const wideMax = () => Math.round(roadKey.size * ROAD_RANKS.wideCap);
  let wideCells = 0;
  if (capOn) for (const m of roadMeta.values()) if (WIDE[m.rank]) wideCells += 1;
  // Cellules qui DEVIENNENT larges si ce run est promu. Une avenue qui passe
  // boulevard n'en ajoute aucune (elle était déjà large) : seuls l'entrée dans la
  // famille large (secondary → avenue) et la voie jumelle creusée en coûtent.
  const wideAdd = (r) => (r.rank === "secondary" ? r.len : r.rank === "main" ? (r.twin ? r.twin.length : 0) : 0);
  const runCellKey = (run, g, s = 0) => run.axis === "h" ? K2(g, run.fixed + s) : K2(run.fixed + s, g);
  // Part du run dont la parallèle immédiate (±1) est déjà avenue/main.
  const parallelWideShare = (run) => {
    let n = 0;
    for (let g = run.g0; g <= run.g1; g += 1) {
      for (const s of [-1, 1]) {
        const m = roadMeta.get(runCellKey(run, g, s));
        if (m && WIDE[m.rank]) { n += 1; break; }
      }
    }
    return n / run.len;
  };
  // Voie jumelle d'un boulevard : cellules posables le long du run, meilleur côté.
  const twinPlan = (run) => {
    const laneCells = (s) => {
      const cells = [];
      for (let g = run.g0; g <= run.g1; g += 1) {
        const x = run.axis === "h" ? g : run.fixed + s;
        const y = run.axis === "h" ? run.fixed + s : g;
        const kk = K2(x, y);
        if (roadKey.has(kk) || (riverSet && riverSet.has(kk)) || !free(x, y)) continue;
        cells.push([x, y]);
      }
      return cells;
    };
    const south = laneCells(1), north = laneCells(-1);
    const best = south.length >= north.length ? south : north;
    if (best.length < Math.ceil(run.len * 0.6)) return null;
    return best;
  };
  const collectRuns = () => {
    const runs = [];
    const seenH = new Set(), seenV = new Set();
    for (const k of roadKey) {
      const m = roadMeta.get(k);
      if (!m || !PROMOTE[m.rank]) continue;
      if (riverSet && riverSet.has(k)) continue;
      const ci = k.indexOf(","), gx = +k.slice(0, ci), gy = +k.slice(ci + 1);
      const sameRank = (x, y) => {
        const kk = x + "," + y;
        if (!roadKey.has(kk) || (riverSet && riverSet.has(kk))) return false;
        const mm = roadMeta.get(kk);
        return !!(mm && mm.rank === m.rank);
      };
      if (m.h && !seenH.has(k)) {
        let x0 = gx, x1 = gx;
        while (sameRank(x0 - 1, gy) && roadMeta.get((x0 - 1) + "," + gy).h) x0 -= 1;
        while (sameRank(x1 + 1, gy) && roadMeta.get((x1 + 1) + "," + gy).h) x1 += 1;
        let score = 0;
        for (let x = x0; x <= x1; x += 1) { seenH.add(x + "," + gy); score += use.get(x + "," + gy) || 0; }
        if (x1 - x0 + 1 >= MIN_RUN) runs.push({ axis: "h", fixed: gy, g0: x0, g1: x1, rank: m.rank, len: x1 - x0 + 1, score });
      }
      if (m.v && !seenV.has(k)) {
        let y0 = gy, y1 = gy;
        while (sameRank(gx, y0 - 1) && roadMeta.get(gx + "," + (y0 - 1)).v) y0 -= 1;
        while (sameRank(gx, y1 + 1) && roadMeta.get(gx + "," + (y1 + 1)).v) y1 += 1;
        let score = 0;
        for (let y = y0; y <= y1; y += 1) { seenV.add(gx + "," + y); score += use.get(gx + "," + y) || 0; }
        if (y1 - y0 + 1 >= MIN_RUN) runs.push({ axis: "v", fixed: gx, g0: y0, g1: y1, rank: m.rank, len: y1 - y0 + 1, score });
      }
    }
    // Éligibilité et prix : anti-parallèle pour tous ; le rang main exige un
    // plan de voie jumelle (tiles = cellules à creuser), les autres montent sur
    // place (tiles = longueur du run).
    const eligible = [];
    for (const r of runs) {
      if (parallelWideShare(r) > 0.3) continue;
      if (r.rank === "main") {
        const twin = twinPlan(r);
        if (!twin) continue;
        const cand = { ...r, twin, tiles: twin.length };
        if (capOn && wideCells + wideAdd(cand) > wideMax()) continue;   // S1
        eligible.push(cand);
      } else {
        if (capOn && wideCells + wideAdd(r) > wideMax()) continue;      // S1
        eligible.push({ ...r, tiles: r.len });
      }
    }
    eligible.sort((a, b) => (b.score - a.score)
      || (a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : 0)
      || (a.fixed - b.fixed) || (a.g0 - b.g0));
    return eligible;
  };
  const promote = (run) => {
    wideCells += wideAdd(run);        // S1 : le budget se consomme ICI, pas au test
    if (run.twin) {
      // Autoroute : la jumelle se CREUSE (nouvelles cellules main, axe du run).
      for (const [x, y] of run.twin) {
        const k = K2(x, y);
        roadKey.add(k);
        roadMeta.set(k, { h: run.axis === "h", v: run.axis === "v", rank: "main" });
        if (roads) roads.push({ gx: x, gy: y });
      }
      return;
    }
    const to = PROMOTE[run.rank];
    for (let g = run.g0; g <= run.g1; g += 1) {
      const k = runCellKey(run, g);
      const m = roadMeta.get(k);
      if (m && m.rank === run.rank) m.rank = to;
    }
  };
  let applied = 0;
  for (let i = 0; i < count; i += 1) {
    const runs = collectRuns();
    if (!runs.length) break;
    promote(runs[0]);
    applied += 1;
  }
  const after = collectRuns();
  const next = after.length
    ? { tiles: after[0].tiles, toRank: after[0].twin ? "twin" : PROMOTE[after[0].rank] }
    : null;
  return { applied, next };
}

// ── Terre-plein central = ENTITÉ décorable ──────────────────────────────────
// Le terre-plein n'est plus peint « en dur » par cellule (→ carrés) : on calcule
// ses SEGMENTS CONTINUS le long de chaque axe pour les routes de rang `avenue`+ ,
// + un `medianSet` de cellules centrales. Continu À TRAVERS les croisements (pas de
// coupure → ruban lisse). Sert au rendu du terre-plein ET, plus tard, à y poser du
// décor (fleurs/arbres/lampadaires) : une passe de décor n'a qu'à parcourir medianSet.
function computeMedianSegments(roadMap) {
  const get = (gx, gy) => roadMap.get(gx + "," + gy);
  const hasMedian = (c) => !!(c && (c.rank === "avenue" || c.rank === "main") && c.roadSurface !== "bridge");
  const connH = (c) => !!(c && (c.mask & ROAD_E || c.mask & ROAD_W));
  const connV = (c) => !!(c && (c.mask & ROAD_N || c.mask & ROAD_S));
  const segments = [], medianSet = new Set(), seenH = new Set(), seenV = new Set();
  for (const [key, cell] of roadMap) {
    if (!hasMedian(cell)) continue;
    const ci = key.indexOf(","), gx = +key.slice(0, ci), gy = +key.slice(ci + 1);
    if (connH(cell) && !seenH.has(key)) {
      let x0 = gx, x1 = gx;
      for (let x = gx - 1; ; x -= 1) { const c = get(x, gy); if (hasMedian(c) && connH(c)) x0 = x; else break; }
      for (let x = gx + 1; ; x += 1) { const c = get(x, gy); if (hasMedian(c) && connH(c)) x1 = x; else break; }
      for (let x = x0; x <= x1; x += 1) { seenH.add(x + "," + gy); medianSet.add(x + "," + gy); }
      if (x1 > x0) segments.push({ axis: "h", fixed: gy, a0: x0, a1: x1, rank: cell.rank });
    }
    if (connV(cell) && !seenV.has(key)) {
      let y0 = gy, y1 = gy;
      for (let y = gy - 1; ; y -= 1) { const c = get(gx, y); if (hasMedian(c) && connV(c)) y0 = y; else break; }
      for (let y = gy + 1; ; y += 1) { const c = get(gx, y); if (hasMedian(c) && connV(c)) y1 = y; else break; }
      for (let y = y0; y <= y1; y += 1) { seenV.add(gx + "," + y); medianSet.add(gx + "," + y); }
      if (y1 > y0) segments.push({ axis: "v", fixed: gx, a0: y0, a1: y1, rank: cell.rank });
    }
  }
  return { segments, medianSet };
}

// ── Terre-plein DÉCORABLE des boulevards (rendu pixel) ──────────────────────
// Deux voies de rang MAIN exactement collées (2 de large, pas 3+) = boulevard :
// un terre-plein se glisse sur la COUTURE entre les deux voies, en runs continus
// (≥ MIN_RUN, sinon miettes). Il s'interrompt naturellement AUX intersections (le
// croisement rend le couloir « plus large que 2 » → la traversée reste dégagée),
// exclut ponts et places, et IGNORE les paires d'autres rangs (dessertes collées
// par accident). Entité PURE exposée en `L.terrePlein` : le rendu (iso/isoStreet)
// ET toute déco future (fleurs/arbres/lampadaires) itèrent ces segments.
//   { axis:"v", x,  y0, y1 } = couture verticale entre les colonnes x et x+1 ;
//   { axis:"h", y,  x0, x1 } = couture horizontale entre les rangées y et y+1.
function computeTerrePleinSegments(roadMap, N) {
  const MIN_RUN = 3;
  const lane = (c) => !!c && c.roadSurface !== "bridge" && c.rank !== "plaza";
  // La PAIRE doit être un boulevard VOULU : seul le rang "main" est tracé en
  // double (runLineWide) — le refuge central est SON mobilier. Sans ce filtre,
  // deux dessertes collées par accident gagnaient un terre-plein en pleine
  // ruelle, en travers des portes (« un terre-plein pour empêcher les gens de
  // sortir de leur maison ?? », Raph 2026-08-03). L'exclusion latérale, elle,
  // reste sur TOUTE route : une 3e voie de n'importe quel rang élargit le couloir.
  const boulevard = (c) => lane(c) && c.rank === "main";
  // Classe de chaque case lue par les deux balayages (x, y ∈ [−1, N+1]), posée une
  // fois depuis roadMap : 1 = voie, 2 = boulevard. Les balayages N² lisaient une clé
  // texte par case et par sens (PERF-7 de l'audit du 2026-10-05) ; mêmes tests.
  const W = N + 3, cls = new Uint8Array(W * W);
  for (const [k, c] of roadMap) {
    const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
    if (x < -1 || y < -1 || x > N + 1 || y > N + 1) continue;
    cls[(y + 1) * W + x + 1] = boulevard(c) ? 2 : lane(c) ? 1 : 0;
  }
  const isBlvd = (x, y) => cls[(y + 1) * W + x + 1] === 2;
  const isLane = (x, y) => cls[(y + 1) * W + x + 1] !== 0;
  const segments = [];
  // Coutures VERTICALES : colonnes x|x+1 en voies, rien en x-1 ni x+2.
  for (let x = 0; x < N - 1; x += 1) {
    let y0 = -1;
    for (let y = 0; y <= N; y += 1) {
      const ok = y < N && isBlvd(x, y) && isBlvd(x + 1, y) && !isLane(x - 1, y) && !isLane(x + 2, y);
      if (ok && y0 < 0) y0 = y;
      else if (!ok && y0 >= 0) { if (y - y0 >= MIN_RUN) segments.push({ axis: "v", x, y0, y1: y - 1 }); y0 = -1; }
    }
  }
  // Coutures HORIZONTALES : rangées y|y+1 en voies, rien en y-1 ni y+2.
  for (let y = 0; y < N - 1; y += 1) {
    let x0 = -1;
    for (let x = 0; x <= N; x += 1) {
      const ok = x < N && isBlvd(x, y) && isBlvd(x, y + 1) && !isLane(x, y - 1) && !isLane(x, y + 2);
      if (ok && x0 < 0) x0 = x;
      else if (!ok && x0 >= 0) { if (x - x0 >= MIN_RUN) segments.push({ axis: "h", y, x0, x1: x - 1 }); x0 = -1; }
    }
  }
  // DÉDOUBLONNAGE des coutures PARALLÈLES ADJACENTES : quand le couloir de 2 se
  // décale d'une colonne/rangée en cours de route, la détection produit DEUX
  // segments voisins dont les plages se chevauchent — deux bandes qui se
  // superposent à l'écran (« pourquoi deux plutôt qu'un long ? », Raph). Priorité
  // au plus LONG ; l'autre est tronqué hors du chevauchement (+1 de respiration),
  // un résidu < MIN_RUN disparaît. L'ordre du tableau d'origine est préservé.
  const segLen = (s) => (s.axis === "v" ? s.y1 - s.y0 : s.x1 - s.x0);
  const byPriority = segments.map((s, i) => ({ s, i })).sort((a, b) => segLen(b.s) - segLen(a.s) || a.i - b.i);
  const kept = [], dead = new Set();
  for (const { s, i } of byPriority) {
    let cur = s;
    for (const k of kept) {
      if (k.axis !== cur.axis) continue;
      if (Math.abs(cur.axis === "v" ? cur.x - k.x : cur.y - k.y) !== 1) continue;
      const a0 = cur.axis === "v" ? cur.y0 : cur.x0, a1 = cur.axis === "v" ? cur.y1 : cur.x1;
      const lo = Math.max(a0, (k.axis === "v" ? k.y0 : k.x0) - 1);
      const hi = Math.min(a1, (k.axis === "v" ? k.y1 : k.x1) + 1);
      if (lo > hi) continue;                       // pas de chevauchement
      const nBefore = lo - a0, nAfter = a1 - hi;   // longueurs restantes de part et d'autre
      if (nBefore >= MIN_RUN && nBefore >= nAfter) { if (cur.axis === "v") cur.y1 = lo - 1; else cur.x1 = lo - 1; }
      else if (nAfter >= MIN_RUN) { if (cur.axis === "v") cur.y0 = hi + 1; else cur.x0 = hi + 1; }
      else { cur = null; break; }
    }
    if (cur) kept.push(cur); else dead.add(i);
  }
  return segments.filter((s, i) => !dead.has(i));
}

// ── Profilage DEV du layout ──────────────────────────────────────────────────
// Activer : `globalThis.__layoutProfile = true` → chaque computeCityLayout
// remplit `globalThis.__layoutProfileLast = { total, <phase>: ms }`. Coût nul
// éteint (un test de booléen par marque). Chantier perf late game de juillet (sa
// passation, à la racine, a été supprimée le 2026-07-18 ; l'état actuel est dans
// docs/PERF-CARTE-REPRISE.md) : le layout gelait 1,4 s (gridN 92) à 4,4 s
// (gridN 148) par recompute.
let _lpT0 = 0, _lpLast = 0, _lpOut = null;
const lpBegin = () => {
  _lpOut = (typeof globalThis !== "undefined" && globalThis.__layoutProfile) ? {} : null;
  if (_lpOut) { _lpT0 = _lpLast = performance.now(); }
};
const lp = (phase) => {
  if (!_lpOut) return;
  const t = performance.now();
  _lpOut[phase] = (_lpOut[phase] || 0) + (t - _lpLast);
  _lpLast = t;
};
const lpEnd = () => {
  if (!_lpOut) return;
  _lpOut.total = performance.now() - _lpT0;
  globalThis.__layoutProfileLast = _lpOut;
  _lpOut = null;
};

// ── Dimension de la grille (pure, sans tracé) ───────────────────────────────
// Sortie de computeCityLayout pour que le relevé du vestige (captureVestige) en
// lise la MÊME grille sans retracer toute la ville : une seule formule, deux lecteurs.
function cityGridDims(s, c, mapSeed) {
  const total = c.houses + (c.engineHomes || 0);   // maisons pop + maisons-moteur (pour dimensionner N)
  // `meta.id` est désormais PASSÉ à cmEngineInstances : sans lui, les 4 singletons
  // (aqueduc, champs, port, moulin) retombaient sur le découpage générique et
  // facturaient à la grille plusieurs blocs pour une structure unique.
  const enginePressure = CM_MAP_BUILDINGS.reduce((sum, meta) => {
    const level = Math.floor((s.buildings && s.buildings[meta.id]) || 0);
    return sum + cmEngineInstances(level, meta.id).reduce((acc, group, i) => acc + Math.max(1, cmEngineGroupFoot(meta.id, group, i) ** 2), 0);
  }, 0);
  // Facteur de packing : village dense (0.27) → mégalopole diffuse (0.13)
  // AÉRATION (cityQuarters, lot L8) : jardins, ceintures vertes, sites de place et
  // voie réservée de l'artère prennent du terrain — la ville en occupe d'autant
  // plus (`spread` agrandit la grille, donc la portée urbaine qui en dérive).
  // Pas au CAMPEMENT : il n'a ni jardins ni ceinture, et sa clairière est validée
  // telle quelle (Raph, 2026-09-28) — l'étalement commence avec le village.
  const spreadK = spreadFor(c.eraBand);
  const packFactor = (0.27 - c.eraFrac * 0.14) / (spreadK * spreadK);
  // Grille minimale selon le nombre de merveilles : chacune réclame un rayon libre,
  // il faut assez d'espace pour les espacer correctement en cercle.
  // Seules les merveilles RÉÉRIGÉES ce cycle (cf. cmWonderActive) réclament de
  // l'espace : un village en début de cycle ne gonfle plus sa grille pour des
  // monuments encore en sommeil.
  const wonderCount = cmWonderActiveIds(s).size;
  const minNWonders = wonderCount >= 5 ? 36 : wonderCount >= 3 ? 30 : wonderCount >= 1 ? 24 : 20;
  let N = minNWonders;
  // Cap de grille : PLAFOND PERF (pas structurel — aucun overflow avant N~46000, index
  // y*N+x en Int32). Débloqué 300 → 360 pour laisser la ville s'étaler avec les achats
  // (terme engineHomes). Le recompute est ~O(N²) : profiler avant de monter plus haut
  // (~2 s à N≈260, ~6 s à N≈420). Molette : window.__nCapOverride.
  // ⚠ PLAFOND SILENCIEUX (audit 2026-10-05, BUG-88) : N atteint 360 vers 1e5 achats par
  // type ; en ville par îlots, c'est ensuite le plafond de 2 000 îlots de planIlots qui
  // bute (ilotLayout.js) — au-delà d'environ 4e5 achats par type, des maisons-moteur
  // achetées ne sont plus posées (12 491 sur 16 845 à 1e6). La carte ne révèle que ce
  // qu'elle a posé (engineHomePlaced) : aucune maison fantôme, mais aucun signal non plus.
  const NCAP = Math.floor((import.meta.env?.DEV && typeof globalThis !== "undefined" && globalThis.__nCapOverride) || 360);
  // (Plus de terme `megaDistricts × 18` : il réservait la place des grands ensembles,
  // qui ne se posent plus — audit 2026-10-05, MORT-4, choix de Raph. Une ville NEUVE
  // est donc plus compacte dès la bande 3 ; une ville existante garde sa grille, qui
  // ne rétrécit jamais, cf. maxN juste en dessous.)
  while (N * N * packFactor < total + enginePressure * 1.35 + 10 && N < NCAP) N += 2;
  // LA GRILLE NE RÉTRÉCIT JAMAIS (mémoire des rues) : rues, slots et sites sont
  // relatifs au centre de grille ; une grille qui reculerait (population qui baisse,
  // étalement qui décroît avec les ères) couperait la ville à ses bords. Le temps d'un
  // cycle seulement : la vallée (crisis.js) ne garde pas maxN, elle en tire la largeur
  // de pose du fleuve (cityCore.riverN, cf. computeCityLayout).
  if (s.cityCore && (s.cityCore.seed >>> 0) === (mapSeed >>> 0)
    && Number.isFinite(s.cityCore.maxN) && s.cityCore.maxN > N) N = Math.min(NCAP, s.cityCore.maxN | 0);
  return { N, total, enginePressure };
}

// Lecture d'un tableau de colonnes (gx arrondi, borné à la grille). Fabrique HORS de
// computeCityLayout (audit 2026-10-05, MEM-4) : sous V8, les fermetures d'une même
// fonction partagent UN contexte, celui de toutes ses variables capturées — riverYAt,
// publiée sur L.river, y retenait cells, claimed, le plan des îlots… (~21 Mo par
// layout, ~50 Mo de plus pendant un recalcul). Ici, elle ne garde que son tableau.
const colLookup = (arr, N) => (gx) => arr[Math.max(0, Math.min(N - 1, Math.round(gx)))];

// ── Génération de la disposition (pure) ─────────────────────────────────────
function computeCityLayout(s) {
  lpBegin();
  const c = cityCounts(s);
  // ── Couche procédurale : seed de partie, personnalité, config d'âge ──────
  const mapSeed = ensureMapSeed(s);
  const personality = computeCityPersonality(mapSeed, s);
  // Fige le profil au premier calcul du cycle, comme l'archétype (plus bas) : un achat
  // ne fait plus basculer toute la ville d'un profil à l'autre (audit 2026-10-05,
  // BUG-15). Une partie en cours fige le sien tel qu'il est à l'ouverture.
  if (s.cityPersonality !== personality.id) s.cityPersonality = personality.id;
  const ageCfg = ageConfigFor(c.eraBand);
  const { N, total, enginePressure } = cityGridDims(s, c, mapSeed);
  const cx = Math.floor(N / 2), cy = Math.floor(N / 2);
  lp("dimension");

  // Rivière fixe — stockée dans state.riverWP, la ville s'étend autour
  const WN = 6;
  // LARGEUR DE POSE DU FLEUVE (audit du 05/10, CHUTE-4, choix B de Raph). Le cours
  // court de cx − 1,8·RN à cx + 1,8·RN : ses abscisses dépendent de la grille. Dans
  // la MÊME VALLÉE (crisis.js), la cité neuve repart de sa grille naturelle — garder la
  // plus grande grille jamais atteinte (maxN) rendait chaque recalcul d'un cycle neuf
  // 15 à 40 fois plus cher, à vie —, mais le fleuve garde la largeur de pose de la cité
  // tombée (cityCore.riverN) : comme les ruines, le cœur et le pont, il reste où il
  // était par rapport au centre de grille. Hors vallée (pas de riverN), RN = N.
  const keptRiverN = s.cityCore && (s.cityCore.seed >>> 0) === (mapSeed >>> 0)
    && s.riverWP && s.riverWP.length === WN && Number.isFinite(s.cityCore.riverN) ? s.cityCore.riverN | 0 : 0;
  const RN = Math.max(N, keptRiverN);
  const xStart = cx - RN * 1.8, xEnd = cx + RN * 1.8;
  let WP;
  if (s.riverWP && s.riverWP.length === WN) {
    WP = s.riverWP.map((p, i) => ({
      x: xStart + (xEnd - xStart) * (i / (WN - 1)),
      y: cy + p.dy
    }));
  } else {
    // Rivière seedée par partie : chaque civilisation a son propre cours d'eau.
    const rrng = seededRng(mixSeed(mapSeed, "river") + 7);
    const bandY = cy + N * (0.16 + rrng() * 0.16);
    WP = [];
    for (let i = 0; i < WN; i += 1) {
      WP.push({ x: xStart + (xEnd - xStart) * (i / (WN - 1)), y: cmClamp(bandY + (rrng() - 0.5) * N * 0.32, cy + N * 0.08, N - 1.5) });
    }
    s.riverWP = WP.map((p) => ({ dy: p.y - cy }));
  }
  const cr = (a, b, c2, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3); };
  // Densité d'échantillonnage proportionnelle à la taille : l'espacement entre
  // samples doit rester << rayon des disques riverSet/bankSet (~hw+1.4), sinon
  // de grands trous s'ouvrent entre samples sur les grandes cartes et le RUBAN
  // PEINT (spline continue) recouvre des cellules classées « sèches » → des
  // bâtiments se posent sous l'eau peinte. Pas de fixe : ~1.5 cellule par pas.
  // (Sur la longueur du COURS, RN : dans la vallée, les mêmes échantillons que la
  // cité tombée.)
  const STEPS = Math.max(12, Math.ceil((RN * 3.6 / (WN - 1)) / 1.5));
  const riverSamples = [];
  for (let i = 0; i < WN - 1; i += 1) {
    const p0 = WP[Math.max(0, i - 1)], p1 = WP[i], p2 = WP[i + 1], p3 = WP[Math.min(WN - 1, i + 2)];
    for (let st = 0; st < STEPS; st += 1) {
      const t = st / STEPS;
      const x = cr(p0.x, p1.x, p2.x, p3.x, t), y = cr(p0.y, p1.y, p2.y, p3.y, t);
      const u = Math.max(0, Math.min(1, (x - xStart) / (xEnd - xStart)));
      riverSamples.push({ x, y, hw: 2.0 + 1.1 * Math.sin(Math.PI * u) });
    }
  }
  riverSamples.push({ x: WP[WN - 1].x, y: WP[WN - 1].y, hw: 2.0 });

  /* ── LE PLAN DE VILLE SE CALCULE ICI, AVANT LA PEINTURE DU LIT ─────────────
   * Il était calculé plus bas, après le fleuve. Il remonte parce que la Maison
   * des Plaisirs doit se poser HORS DE LA VILLE (Raph, 2026-08-22 : « il est
   * toujours dans le rayon de la ville et je ne veux pas ça ») — et « hors de
   * la ville » ne se déduit d'aucune fraction de grille, seulement de
   * `plan.reachFor`, l'emprise urbaine réelle dans une direction donnée.
   *
   * ✅ Le déplacement est SANS RISQUE, et c'est vérifiable : `generateCityPlan`
   * ne touche NI à `corridorAt` NI à `riverYAt` pendant sa construction — les
   * deux ne servent qu'à `finalize()` (cityPlan.js : buildAnchors/buildPlazas),
   * qui reste, lui, à sa place d'origine, une fois le lit peint. Ce qu'on
   * remonte ne dépend que de la graine, des comptes et de la grille.
   *
   * ⚠ Les Sets et les tableaux de colonnes sont DÉCLARÉS ici et REMPLIS plus
   * bas : les fermetures ci-dessous les capturent, et une capture de liaison
   * non encore initialisée est le motif exact qui a déjà coûté une perte de
   * save sur ce fichier (TDZ). Déclarés vides, ils ne peuvent pas mordre.
   * ---------------------------------------------------------------------- */
  const riverSet = new Set(), bankSet = new Set(), nearSet = new Set();
  const riverYByCol = new Array(N), riverHwByCol = new Array(N);
  // ⚠ Par colLookup, jamais par une flèche locale : riverYAt est publiée (MEM-4).
  const riverYAt = colLookup(riverYByCol, N);
  // Demi-largeur visible du ruban au droit d'une colonne (pour caler un riverain
  // sur le bord d'eau RÉELLEMENT peint, pas sur le riverSet euclidien plus large).
  const riverHwAt = colLookup(riverHwByCol, N);

  // SERRAGE DE L'EMPRISE (lot densité, docs/PLAN-RENDU-VILLE.md). Retour Raph
  // 2026-08-06 sur capture : « les grandes surfaces de sol gris ». Mesuré à la bande 3,
  // sur le sol de ville HORS ROUTES : **53,4 % ne porte rien** (3 132 cellules nues
  // contre 2 136 bâties et 599 sous un arbre).
  //
  // La cause est dans la formule ci-dessous : le terme dominant est `N × (0,18 +
  // eraFrac × 0,24)`, donc l'étalement suit la GRILLE et l'ÈRE, pas la quantité de
  // bâti. Le contenu ne remplit qu'une partie de ce qu'on lui alloue.
  //
  // `CITY_REACH.k` serre l'emprise à contenu constant : même nombre de bâtiments sur
  // moins de sol. ⚠ Défaut à 1 tant que la valeur n'est pas arbitrée sur planche —
  // ce réglage change TOUTE la silhouette (squelette routier, ancres de quartier,
  // position relative du fleuve), il ne se grave pas au jugé.
  // Molette : `__cityReach(0.85)`.
  const eraReachBase = Math.max(5, Math.min(N * 0.46, N * (0.18 + c.eraFrac * 0.24) + Math.sqrt(total + enginePressure * 1.1) * 0.25)) * CITY_REACH.k;
  // ── LA VILLE PAR ÎLOTS : sa DEMANDE, et la portée qui en découle ───────────
  // (cf. ILOT_BANDS, docs/PLAN-ILOTS.md.) La ville compacte (décision de Raph) : sa
  // portée suit son contenu — lots de maisons, ateliers, halles —, plus son âge.
  // Les bâtiments posés « au bord de la ville » (merveilles, champs) la suivent.
  // ⚠ Pas la Maison des Plaisirs : sa place a été arbitrée sur la portée d'ÂGE
  // (trois poses refusées), elle garde `eraReachBase`.
  const ilotMode = ILOT_BANDS.includes(c.eraBand | 0);
  let ilotDemand = null;
  if (ilotMode) {
    const bias = personality.buildingBias || {};
    const halls = [], annexes = [];
    let annexLots = 0;
    for (const meta of CM_MAP_BUILDINGS) {
      if (ILOT_OUTSIDE.has(meta.id)) continue;            // champs, moulins, ports : hors des îlots
      const level = Math.floor((s.buildings && s.buildings[meta.id]) || 0);
      if (level <= 0) continue;
      const inst = cmEngineInstances(level, meta.id);
      for (let ei = 0; ei < inst.length; ei += 1) {
        const key = cmMapSlotKey(s.cycles, meta.id, ei);
        // Les points d'eau n'ont pas de halle : tous sont des repères d'une case.
        if (ei === 0 && meta.id !== "aqueducts") { halls.push({ key, zone: meta.zone, id: meta.id, size: Math.min(ILOT_HALL_MAX, cmEngineGroupFoot(meta.id, inst[0], 0)) }); continue; }
        const size = meta.id === "aqueducts" || ilotTownBody(meta.id, c.eraBand) ? 1 : cmEngineAtelierFoot(meta.id);
        annexes.push({ key, id: meta.id, size, zone: meta.zone, index: ei });
        annexLots += size * size;
      }
    }
    // Mêmes comptes que placeDecor (« house », puis « enginehome ») ; les grands
    // logis comptés tirage par tirage (cf. ilotBigHomeLots).
    const nHouse = Math.max(0, Math.round(c.houses * (bias.house || 1)));
    const nHome = (c.engineHomes || 0) + ENGINE_HOME_LOOKAHEAD;
    const lots = nHouse + nHome + ilotBigHomeLots(c.eraBand, personality.variantBias, mapSeed, nHouse, nHome) + annexLots;
    ilotDemand = { lots, halls, annexes };
  }
  const cityReachBase = ilotMode ? ilotReachFor({ lots: ilotDemand.lots, halls: ilotDemand.halls.length }) : eraReachBase;
  // ── Plan de ville procédural : archétype, cœur urbain, quartiers, places ──
  // Corridor du fleuve = eau ∪ berge : les places ne s'y posent jamais (seuls
  // routes/ponts traversent l'eau). Le reste (quartiers, merveilles) l'évite déjà.
  const corridorAt = (gx, gy) => { const k = gx + "," + gy; return riverSet.has(k) || bankSet.has(k); };
  // MÉMOIRE DES RUES (map/roadMemory.js, toutes les bandes depuis le lot L5) : la
  // ville garde son plan ORGANIQUE — les axes d'un autre archétype (grand-rue
  // tirée au cordeau, rayons) se poseraient en travers d'un village déjà bâti.
  // Son identité de bourg vient de son histoire (lot L3), pas d'une recette.
  // (Son interrupteur `__roadMemory({ on: false })`, l'ancien calcul sans mémoire,
  // est parti avec l'ancien placement — audit 2026-10-05, MORT-4.)
  // REPÈRE DES TIRAGES (mémoire des rues) : tout hasard « par cellule » qui
  // décide d'une FORME (lisière, parcs, ordre de pose, arbres) se lit dans le
  // repère du centre de grille — celui des slots et de la mémoire. En coordonnées
  // absolues, la grille qui grandit (cx qui avance) faisait glisser ces motifs sous
  // une ville qui, elle, ne bouge plus.
  const fx0 = cx, fy0 = cy;
  // Au-delà du bourg (bande 3), l'archétype du plan reprend ses droits — sur les
  // ancres et le contour seulement : les rues, ce sont les îlots qui les tracent.
  const organicEra = (c.eraBand | 0) <= 2;
  const plan = generateCityPlan({ seed: mapSeed, counts: c, personality, ageCfg, N, cx, cy, riverYAt, corridorAt,
    forcedArchetype: organicEra ? "scattered" : s.cityArchetype, forceAnyArchetype: organicEra });
  // Fige l'archétype à la 1re génération : la ville garde son plan de rues toute
  // la partie (cœur figé), seuls les faubourgs s'ajoutent. Reset au nouveau cycle.
  if (!s.cityArchetype) s.cityArchetype = plan.archetype;
  plan.reachBase = cityReachBase;

  // ── LE CŒUR ET LE PONT NE BOUGENT PLUS (docs/PLAN-ROUTES.md, lot L1) ──────
  // `generateCityPlan` tire le cœur à `cx + (rng − 0,5)·N·0,16` : il dépend de N,
  // qui grandit avec la ville. Mesuré sur une partie complète : le cœur glissait
  // de (0,5 ; −1,3) à (5,3 ; −12,9) par rapport au centre de grille — le repère
  // des slots de bâtiments. Chaque arrondi faisait sauter d'une case toute la
  // trame ancrée sur le cœur (avenues, anneaux, ancres), et le pont avec lui.
  // On fige donc, à la première génération de la ville, le cœur ET la colonne du
  // pont dans le repère des slots ; une sauvegarde existante fige les siens tels
  // qu'ils sont à l'ouverture (aucun saut à la mise à jour). La seed garde la
  // fiche honnête : une nouvelle ville (effondrement, démo) en refait une.
  const coreFix = (s.cityCore && s.cityCore.seed === (mapSeed >>> 0)) ? s.cityCore : null;
  if (coreFix) { plan.core.x = cx + coreFix.dx; plan.core.y = cy + coreFix.dy; }

  // Pont historique : la traversée la plus proche du cœur urbain. Remonté avec le
  // plan — le slot des Plaisirs a besoin de savoir où NE PAS se poser.
  let riverBridge = riverSamples[0], rbd = Infinity;
  const bridgeAimX = coreFix ? cx + coreFix.bx : plan.core.x + 0.5;
  for (const sp of riverSamples) { const dd = Math.abs(sp.x - bridgeAimX); if (dd < rbd) { rbd = dd; riverBridge = sp; } }
  // Colonne figée : l'échantillon le plus proche dérive d'un pas quand N grandit
  // (les échantillons s'étirent avec la grille), on garde donc sa colonne exacte.
  // Copie, jamais l'échantillon lui-même : il sert à peindre le lit.
  if (coreFix) riverBridge = { ...riverBridge, x: cx + coreFix.bx };

  /* ── LA MAISON DES PLAISIRS : plantée EN PLEINE EAU, au large ──────────────
   * Un monument permanent (il est là dès la première ère, il ne se gagne pas),
   * posé loin en aval pour qu'on le rejoigne en barque au lieu de le croiser.
   *
   * Sa position est FIGÉE (Raph, 2026-08-06) — mais figer des coordonnées de
   * grille le sortirait de l'eau au premier recalcul du cours. On fige donc son
   * ABSCISSE LE LONG DU COURANT, et la traversée se redéduit du lit : le lieu
   * dérive avec le fleuve et reste toujours au milieu de l'eau.
   *
   * ⚠ Et parce que sa place ne dépend PAS de `riverSet` (contrairement à
   * l'Aiguille Céleste), l'évasement se fait ICI, AVANT la peinture des
   * cellules : pas de repasse à faire après coup comme pour `era_mega`.
   * ---------------------------------------------------------------------- */
  /* ⚠⚠ TROIS POSES REFUSÉES AVANT CELLE-CI. Il faut les avoir en tête, elles
   * disent chacune une chose différente :
   *
   *   u = 0,82  (1,15 N)  « c'est vraiment très éloigné »   2026-08-06
   *   u = 0,58  (0,29 N)  « beaucoup trop proche du centre » 2026-08-22
   *   u = 0,62  (0,43 N)  « il est TOUJOURS DANS LE RAYON DE LA VILLE
   *                        et je ne veux pas ça »            2026-08-22
   *
   * Le troisième refus invalide toute la démarche des deux premiers : tant qu'on
   * exprime la place en fraction de GRILLE, on ne dit rien de la VILLE. Or la
   * ville n'occupe pas une fraction fixe de la grille — son emprise dépend de
   * l'ère, de la population et de l'archétype, et elle s'étire jusqu'à ~1,9 fois
   * son rayon nominal dans la direction d'allongement (cityPlan : `reachFor` =
   * `reachBase · (1 + lobes) · ecc`, et `ecc` monte à 1,55 pour un plan linéaire,
   * lequel s'étire justement LE LONG DU FLEUVE). Une carte pouvait donc rester
   * bâtie bien au delà de 0,43 N.
   *
   * ✅ LA RÈGLE EST DONC UNE MARCHE, PAS UNE FORMULE : on remonte le cours vers
   * l'aval, échantillon par échantillon, et on s'arrête au PREMIER qui soit
   * franchement hors de l'emprise urbaine dans SA propre direction :
   *
   *     hypot(sp − cœur)  ≥  reachFor(cœur → sp) · reachMul  +  gap
   *
   * Ça se lit comme la phrase de Raph, ça survit à toutes les ères et à tous les
   * archétypes, et ça ne dépend plus du tout de N.
   *
   * ⚠ `reachFor` est le contour NOMINAL. Le contour réel (organicLimit) lui
   * ajoute encore l'attraction du fleuve (jusqu'à ~3 tuiles), le tirage de
   * quartier et un bruit de bord — d'où `reachMul` ET `gap`, qui absorbent ces
   * débords en plus de la demi-largeur du sprite (3,25 tuiles).
   *
   * ⚠ L'ÉCHELLE DE `u` RESTE UN PIÈGE pour qui relit : le cours ne fait pas la
   * largeur de la carte, il court de `cx − 1,8 N` à `cx + 1,8 N` (xStart/xEnd)
   * pour traverser l'écran à tout zoom. `u = 0,639` est le bord de la grille, pas
   * son milieu. Les bornes ci-dessous sont exprimées ainsi.
   */
  const PLAISIRS = {
    // LA RÈGLE : hors de la ville, avec de la marge. `reachMul` multiplie le
    // contour urbain nominal, `gap` ajoute des tuiles franches par dessus.
    // Molette : `globalThis.__plaisirsFar = 1.6` puis `__cityRecompute()`.
    reachMul: (import.meta.env?.DEV && typeof globalThis !== "undefined" && globalThis.__plaisirsFar) || 1.35,
    gap: 12,        // tuiles franches au delà du contour (dont 3,25 de demi-sprite)
    // ⚠ LA MARCHE PART DU CENTRE, PAS D'UN PLANCHER EN FRACTION DE GRILLE. Un
    // `uMin` de 0,545 avait l'air anodin — il vaut 0,16 N, soit 49 tuiles à
    // N = 300 : sur une grande carte il aurait décidé la place à lui tout seul,
    // et on aurait réintroduit exactement le défaut qu'on vient de corriger.
    // C'est `minBridge` qui protège le centre, en TUILES.
    uMin: 0.5,      // départ de la marche : le milieu du cours (≈ le cœur urbain)
    // ⛔ ET CETTE BORNE FINIT PAR MORDRE, EN TOUTE FIN DE PARTIE. À `eraFrac = 1`
    // le contour nominal atteint 0,46 N, et son étirement le porte à 0,62 N
    // (capital) voire 0,86 N (linéaire) : la marche voudrait alors se poser au
    // delà de 1 N, soit le voisinage exact du 1,15 N déjà refusé. Le conflit est
    // réel — une ville qui couvre la carte ne laisse pas de « dehors » — et on
    // le tranche en faveur du cadrage : le lieu se pose à 0,79 N, à la lisière
    // de la mégalopole. Sur tout le reste de la partie, c'est la marche qui
    // décide. Molette pour arbitrer autrement : `globalThis.__plaisirsFar`.
    uMax: 0.72,     // ⛔ jamais au delà : 0,79 N, on approche du refus de 1,15 N
    minBridge: 12,  // écart minimal à la traversée historique, en tuiles
    // ⚠ MESURÉ, PAS CHOISI AU JUGÉ : au droit du monument le lit évasé fait
    // hw ≈ 5,6 tuiles, et le corridor eau+berge en fait déjà 7 — un domaine de
    // 6 tuiles vivait ENTIÈREMENT dedans et ne réservait donc rien du tout
    // (planche du 2026-08-22 : bâtiment le plus proche à 8,2 tuiles, dû au seul
    // corridor). 8 dégage une vraie frange de berge autour du lieu.
    clear: 8,       // rayon du DOMAINE réservé, en tuiles (ni bâti, ni traversée)
    spread: 2.5,    // demi-largeur gagnée au plus fort de l'évasement, en tuiles
    etale: 14,      // portée de l'évasement le long du cours, en tuiles
    drift: 1.4,     // décalage TRANSVERSAL du lit : c'est lui qui casse la symétrie
    // Rayon d'obstacle pour les bateaux : le PIED (îlot de 2,8 tuiles de rayon
    // depuis la refonte par le code, iso/plaisirsBake.js), plus un peu d'eau.
    r: 3.1
  };
  // La MÉMOIRE DU RÉSEAU, décodée ici — avant le lieu des Plaisirs et le lit : le lieu
  // l'interroge pour ne noyer aucune rue, le lit pour garder ses rues de quai (plus bas),
  // le tracé pour repartir du réseau d'hier (plus bas encore).
  // ⚠ PAS quand la réorganisation en îlots est en attente (plus bas, « LA RÉORGANISATION
  // UNIQUE ») : elle efface les rues du hameau, mais une mémoire déjà décodée les
  // réinjectait dans le tracé et dans memKeep, à vie — 302 cases de rue dans les îlots,
  // 40 maisons-moteur posées sur 101 pendant toute la bande 2 (audit 2026-10-05, BUG-13).
  // Même condition que la réorganisation : fiche absente (ou d'une autre graine).
  const reorgPending = ilotMode && !(coreFix && coreFix.ilot);
  const memDecoded = !reorgPending ? decodeRoadMemory(s.cityRoads, mapSeed, cx, cy) : null;
  // Une fiche d'avant la v3 (cf. ILOT_ROADS_V) a pu garder ces sentiers. Ils se
  // reconnaissent à leur bande de NAISSANCE : une ville par îlots n'a aucune rue née
  // avant la première bande d'îlots, la réorganisation efface tout ce qui précède
  // (mesuré : 0 case sur 5 graines × bandes 2 à 8, ~630 au hameau de la bande 1). Seule
  // une mémoire qui en porte est oubliée (et effacée plus bas) : une ville saine ne voit
  // rien bouger.
  const hamletRoads = !!memDecoded && ilotMode && (coreFix.ilot.v | 0) < ILOT_ROADS_V
    && [...memDecoded.values()].some((mc) => mc.born < ILOT_BANDS[0]);
  const roadMem = hamletRoads ? null : memDecoded;
  let plaisirsSpot = null;
  {
    const last = riverSamples.length - 1;
    const idxOf = (u) => Math.max(0, Math.min(last, Math.round(u * last)));
    const iMin = idxOf(PLAISIRS.uMin), iMax = idxOf(PLAISIRS.uMax);
    // Sens du renflement tiré au sort, mais REBRASSÉ : le bit faible de cmHash
    // vaut la parité de l'entrée, s'en servir tel quel donnerait un damier.
    const h = cmHash("plaisirs:drift:" + (mapSeed || 0)) >>> 0;
    const side = ((h >>> 13) & 1) ? 1 : -1;
    // L'ÉVASEMENT du lit si le lieu se pose sur l'échantillon `si` : pour chaque
    // échantillon touché, son nouvel axe et sa nouvelle demi-largeur. Calculé sans rien
    // toucher — le même calcul sert à ESSAYER une place et à l'appliquer.
    //   - L'élargissement : `hw` gagne `spread` au plus fort, en smoothstep (les rives
    //     s'ouvrent en douceur).
    //   - L'ASYMÉTRIE. Élargir `hw` seul donne un fuseau parfaitement symétrique ; un
    //     vrai élargissement de rivière creuse davantage une rive. On pousse donc aussi
    //     l'AXE du lit en travers du courant. ⚠ Modeste, et pour la même raison que
    //     l'évasement de l'île : un lit trop poussé finit sous une route, qui devient
    //     alors un pont que personne n'a demandé.
    //   ⚠ L'échantillon central se décale lui-même (k = 1) avant que les suivants ne
    //   mesurent leur distance à lui : c'était l'ordre de la boucle d'origine, il est
    //   gardé tel quel (la place du lieu ne bouge pas d'un pixel).
    const evasement = (si) => {
      const s0 = riverSamples[si];
      // Tangente du courant, prise sur deux échantillons de part et d'autre.
      const a = riverSamples[Math.max(0, si - 2)], b = riverSamples[Math.min(last, si + 2)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const c1 = { x: s0.x - side * PLAISIRS.drift * ty, y: s0.y + side * PLAISIRS.drift * tx };
      const out = [];
      for (let j = 0; j <= last; j += 1) {
        const sp = riverSamples[j], c = j <= si ? s0 : c1;
        const d = Math.hypot(sp.x - c.x, sp.y - c.y);
        if (d > PLAISIRS.etale) continue;
        const u = 1 - d / PLAISIRS.etale;
        const k = u * u * (3 - 2 * u);
        out.push({ j, hw: sp.hw + PLAISIRS.spread * k, x: sp.x - side * PLAISIRS.drift * k * ty, y: sp.y + side * PLAISIRS.drift * k * tx });
      }
      return { tx, ty, spot: c1, out };
    };
    // AUCUNE RUE NOYÉE (Raph 2026-10-04 : « vas-y pour les Plaisirs aussi »). Le lieu
    // s'éloigne de la ville à mesure qu'elle grandit, et son évasement (+2,5 cases de
    // demi-largeur, axe poussé de 1,4 sur 14 cases) suit : posé sur une rue déjà là, il
    // la mettrait sous l'eau. Une place dont l'évasement noierait une rue MÉMORISÉE
    // (hors tablier de pont, déjà sur l'eau) est sautée — le lieu prend la suivante,
    // toujours hors de la ville. Mesuré avant ce garde : aucune rue noyée sur 3 graines
    // × 11 passages d'âge ; c'est une assurance, la place ne change que si elle noie.
    const noie = (si) => {
      if (!roadMem) return false;
      const wetBefore = (gx, gy, j) => {
        for (let q = Math.max(0, j - 24); q <= Math.min(last, j + 24); q += 1) {
          const sp = riverSamples[q];
          if (Math.hypot(gx + 0.5 - sp.x, gy + 0.5 - sp.y) <= sp.hw + 0.5) return true;
        }
        return false;
      };
      for (const e of evasement(si).out) {
        const R = e.hw + 0.5;
        for (let gx = Math.floor(e.x - R); gx <= Math.ceil(e.x + R); gx += 1) {
          for (let gy = Math.floor(e.y - R); gy <= Math.ceil(e.y + R); gy += 1) {
            if (!roadMem.has(gx + "," + gy)) continue;
            if (Math.hypot(gx + 0.5 - e.x, gy + 0.5 - e.y) > R) continue;
            if (!wetBefore(gx, gy, e.j)) return true;
          }
        }
      }
      return false;
    };
    // HORS DE LA VILLE, dans la direction de l'échantillon lui-même. `reachFor`
    // est le contour urbain à cet angle — le même que consulte `organicLimit`
    // pour décider si une cellule est constructible : on interroge donc bien la
    // ville, pas une fraction de grille.
    const dehors = (sp) => {
      const dx = sp.x - plan.core.x, dy = sp.y - plan.core.y;
      const contour = plan.reachFor(eraReachBase, Math.atan2(dy, dx));
      return Math.hypot(dx, dy) >= contour * PLAISIRS.reachMul + PLAISIRS.gap;
    };
    // …et jamais sur la traversée historique, qui n'est PAS filtrée ailleurs.
    const loinDuPont = (sp) => Math.abs(sp.x - riverBridge.x) >= PLAISIRS.minBridge;
    let si = iMax;                                  // repli : la borne aval
    for (let i = iMin; i <= iMax; i += 1) {
      if (dehors(riverSamples[i]) && loinDuPont(riverSamples[i]) && !noie(i)) { si = i; break; }
    }
    const { tx, ty, spot, out: evase } = evasement(si);
    for (const e of evase) { const sp = riverSamples[e.j]; sp.hw = e.hw; sp.x = e.x; sp.y = e.y; }
    // `clear` VOYAGE AVEC LE SPOT : le domaine réservé (ni bâti, ni traversée) se
    // lit là où la place se lit, sinon les deux divergeraient au premier réglage.
    plaisirsSpot = {
      x: spot.x, y: spot.y, tx, ty,
      r: PLAISIRS.r, rx: PLAISIRS.r, ry: PLAISIRS.r * 0.6,
      clear: PLAISIRS.clear,
    };
  }

  // PEINTURE DU LIT (les Sets sont déclarés plus haut, avec le plan de ville) :
  // elle vient APRÈS l'évasement des Plaisirs, sans quoi le monument se
  // retrouverait au sec au milieu de son propre élargissement.
  for (const sp of riverSamples) {
    const R = sp.hw;
    for (let gx = Math.floor(sp.x - R - 3); gx <= Math.ceil(sp.x + R + 3); gx += 1) {
      for (let gy = Math.floor(sp.y - R - 3); gy <= Math.ceil(sp.y + R + 3); gy += 1) {
        const d = Math.hypot(gx + 0.5 - sp.x, gy + 0.5 - sp.y);
        const k = gx + "," + gy;
        if (d <= R + 0.5)                               { riverSet.add(k); bankSet.delete(k); nearSet.delete(k); }
        else if (d <= R + 1.4) { if (!riverSet.has(k)) { bankSet.add(k);  nearSet.delete(k); } }
        else if (d <= R + 3.2) { if (!riverSet.has(k) && !bankSet.has(k)) nearSet.add(k); }
      }
    }
  }
  // ── LES RUES DE QUAI TIENNENT LEUR CASE (Raph 2026-10-04 : « corrige les rues du
  // fleuve ») ──────────────────────────────────────────────────────────────────
  // Le lit se recalcule à chaque calcul, abscisses en fraction de la grille : quand la
  // grille grandit avec les achats (N 164 → 170), il s'étire — d'un centième de case au
  // cœur, mais une case de quai posée sur le seuil eau/berge (4,49 contre 4,50)
  // basculait en BERGE. Or une rue sur la berge n'est marchable qu'au pied d'un pont :
  // l'élagage de connexité la retirait (cmBuildRoadGraph, `walkable`), le plan d'îlots
  // aussi (isWet). Une case que porte déjà une rue MÉMORISÉE reste donc de la terre
  // ferme : la berge cède une case, la rue reste. Sauf au PIED D'UN PONT — une case
  // de rive qui touche un tablier (case d'eau portant elle-même une rue) : c'est la
  // berge qui fait d'elle une culée. Une rue de quai, elle, touche l'eau nue. Le dessin
  // du fleuve ne change pas (le ruban suit les échantillons, pas les Sets).
  // (La mémoire du réseau, `roadMem`, est décodée plus haut, avant le lieu des Plaisirs.)
  if (roadMem) {
    const deck = (k) => riverSet.has(k) && roadMem.has(k);
    for (const k of roadMem.keys()) {
      if (!bankSet.has(k)) continue;
      const ci = k.indexOf(","), gx = +k.slice(0, ci), gy = +k.slice(ci + 1);
      if (deck((gx + 1) + "," + gy) || deck((gx - 1) + "," + gy)
        || deck(gx + "," + (gy + 1)) || deck(gx + "," + (gy - 1))) continue;
      bankSet.delete(k);
      nearSet.add(k);
    }
  }
  for (let gx = 0; gx < N; gx += 1) {
    let by = cy + N, bhw = 1.5, bd = Infinity;
    for (const sp of riverSamples) { const dd = Math.abs(sp.x - (gx + 0.5)); if (dd < bd) { bd = dd; by = sp.y; bhw = sp.hw; } }
    riverYByCol[gx] = by; riverHwByCol[gx] = bhw;
  }
  lp("riviere");

  // ── LE CŒUR SORT DE L'EAU (2026-09-28) ─────────────────────────────────────
  // plan.core est tiré dans une bande qui CHEVAUCHE le lit : sur 150 parties
  // neuves, il tombait dans le corridor (eau ou berge) 67 fois (45 %). La cellule
  // la plus proche du cœur étant alors la rive, les tentes du campement
  // s'alignaient le long du fleuve au lieu de former un camp, le sentier du pont
  // au cœur partait dans l'eau, et deux graines coupaient même le camp en deux
  // de part et d'autre du pont. On REMONTE le cœur vers le nord (le fleuve coule
  // au sud du cœur par construction, cf. cityPlan) jusqu'au premier rang où un
  // disque de rayon CORE_DRY_RADIUS est au sec.
  //   - Seul `y` bouge : `x` garde le pont plein sud du cœur (riverBridge, plus
  //     haut, lit core.x) et la marche des Plaisirs n'est pas concernée.
  //   - Posé AVANT finalize, sur l'objet partagé : ancres, places, contour
  //     organique, racine du réseau et ordre des tentes suivent d'eux-mêmes.
  //   - Toutes bandes confondues : un cœur qui ne bougerait qu'au campement
  //     sauterait au passage de la bande 2 et la ville se réorganiserait d'un coup.
  //   - Un cœur déjà au sec ne bouge pas d'un pixel.
  // Molette (A/B) : `globalThis.__coreDryRadius = -1` coupe le déplacement,
  // puis `__cityRecompute()`.
  const coreDryR = (import.meta.env?.DEV && typeof globalThis !== "undefined" && Number.isFinite(globalThis.__coreDryRadius))
    ? globalThis.__coreDryRadius : CORE_DRY_RADIUS;
  if (coreDryR >= 0) {
    const R = coreDryR;
    const wet = (x, y) => {
      for (let dx = -R; dx <= R; dx += 1) {
        for (let dy = -R; dy <= R; dy += 1) {
          if (dx * dx + dy * dy > R * R) continue;
          if (corridorAt(Math.floor(x) + dx, Math.floor(y) + dy)) return true;
        }
      }
      return false;
    };
    if (wet(plan.core.x, plan.core.y)) {
      let y = plan.core.y;
      while (y - 1 >= R + 1 && wet(plan.core.x, y)) y -= 1;
      // Carte trop étroite pour dégager tout le disque : on garde le cœur tiré.
      if (!wet(plan.core.x, y)) plan.core.y = y;
    }
  }
  // Lot L1 : la fiche se fige ICI, une fois le cœur sorti de l'eau — c'est ce
  // cœur-là que la ville gardera. (Figé, il est déjà au sec : le bloc ci-dessus
  // ne le touche plus.)
  if (!coreFix) {
    s.cityCore = {
      seed: mapSeed >>> 0,
      dx: plan.core.x - cx, dy: plan.core.y - cy,
      bx: Math.round(riverBridge.x) - cx,
    };
  }
  if (s.cityCore) s.cityCore.maxN = Math.max(s.cityCore.maxN | 0, N);
  // ── LA RÉORGANISATION UNIQUE (ville par îlots, décision de Raph 2026-10-04) ──
  // Le premier calcul en mode îlots d'une ville efface ce qui la figeait sous
  // l'ancien placement — slots des bâtiments du cycle, rues mémorisées, places de
  // merveilles, quartiers, place centrale — puis pose sa fiche d'îlots. Le cœur et
  // le pont, eux, restent. Ensuite plus rien ne bouge : les îlots s'ajoutent.
  if (ilotMode && s.cityCore && !s.cityCore.ilot) {
    const store = cmCityMapSlotsFor(s), pre = `${s.cycles || 0}:`;
    for (const k of Object.keys(store)) if (k.startsWith(pre)) delete store[k];
    s.cityRoads = null;
    delete s.cityCore.wonders; delete s.cityCore.quarters; delete s.cityCore.central;
    delete s.cityCore.districts; delete s.cityCore.highway;
    s.cityCore.ilot = { v: ILOT_MEMORY_V, blocks: [], plazas: {}, halls: {}, annexes: {} };
  }
  // ── LA RESPIRATION DES ÎLOTS : un second passage, léger (Raph 2026-10-04) ──
  // « Ça ne respire pas, tous les îlots sont complets » → des lots de bord restent en
  // jardin (ilotLayout.js, ILOT_AIR). Une ville déjà bâtie tient tous ses lots, et un
  // lot tenu n'est jamais pris pour jardin : sur décision de Raph, ses MAISONS (slots
  // décoratifs `dec_*` du cycle) se replacent une fois. Îlots, rues, halles, ateliers,
  // merveilles : rien d'autre ne bouge.
  // v3 (audit 2026-10-05, BUG-13) : une fiche v2 a pu garder dans sa mémoire les rues
  // du hameau, en plein îlot (réorganisation faite entre le 04/10 et ce correctif) —
  // reconnues plus haut (`hamletRoads`), ses rues mémorisées s'effacent une fois : les
  // rues d'îlots se reposent depuis `ilot.blocks`, le reste se retrace. Une mémoire
  // saine reste telle quelle, et les maisons ne bougent pas (deux migrations
  // distinctes : passer en v3 ne doit pas rejouer la v2).
  // v4 (audit 2026-10-05, BUG-63) : le forum d'un îlot d'une fiche d'avant s'agrandit
  // une fois en GRAND FORUM (planIlots, `forumGrow`) ; seuls les bâtiments des trois îlots
  // gagnés sont relogés (plus bas, `forumClaim`).
  let ilotForumGrow = false;
  if (ilotMode && s.cityCore && s.cityCore.ilot && (s.cityCore.ilot.v | 0) < ILOT_MEMORY_V) {
    if ((s.cityCore.ilot.v | 0) < 2) {
      const store = cmCityMapSlotsFor(s), pre = `${s.cycles || 0}:dec_`;
      for (const k of Object.keys(store)) if (k.startsWith(pre)) delete store[k];
    }
    if ((s.cityCore.ilot.v | 0) < ILOT_ROADS_V && hamletRoads) s.cityRoads = null;
    if ((s.cityCore.ilot.v | 0) < ILOT_FORUM_V) ilotForumGrow = true;
    s.cityCore.ilot.v = ILOT_MEMORY_V;
  }

  // Quartiers et places : ils demandent le lit PEINT (corridorAt), c'est pour
  // ça que `finalize` reste ici alors que le plan, lui, est calculé plus haut.
  plan.finalize({ reachBase: cityReachBase });
  const quarterAnchors = plan.anchors;

  // ── MÉMOIRE (lots L2-L3) : cellules tenues ─────────────────────────────────
  // Décodée ici, AVANT le tracé : les cellules tenues décident où un site de place
  // a le droit de se fonder, et l'échafaudage ne s'y pose pas.
  // `roadMem` (la mémoire du réseau) est décodée plus haut, avec le lit du fleuve.
  const heldBy = new Map();
  // Cases rendues par les ateliers qui quittent le cœur pour être semés (cf.
  // cmRequestZone) : autant de maisons de la lisière viendront les reprendre,
  // juste avant la pose des maisons (cf. « LES MAISONS REPRENNENT LA PLACE »).
  let sownVacated = 0;
  {
    const store = cmCityMapSlotsFor(s);
    const prefix = `${s.cycles || 0}:`;
    const spanOf = new Map();
    const sownKeys = new Set();
    for (const meta of CM_MAP_BUILDINGS) {
      const level = Math.floor((s.buildings && s.buildings[meta.id]) || 0);
      if (level <= 0) continue;
      const inst = cmEngineInstances(level, meta.id);
      for (let ei = 0; ei < inst.length; ei += 1) {
        const key = cmMapSlotKey(s.cycles, meta.id, ei);
        if (meta.id === "irrigated_fields") { const fsp = cmFieldSpan(level); spanOf.set(key, [fsp.w, fsp.h]); }
        else if (meta.id === "river_ports") spanOf.set(key, [cmRiverPortSpan(level).w, 0]);
        else {
          let z = ilotMode && ei > 0 && ilotTownBody(meta.id, c.eraBand) ? 1 : cmEngineGroupFoot(meta.id, inst[ei], ei);
          if (ilotMode && ei === 0 && !ILOT_OUTSIDE.has(meta.id)) z = Math.min(ILOT_HALL_MAX, z);
          spanOf.set(key, [z, z]);
        }
        if (cmRequestZone(meta, ei) === "sown") sownKeys.add(key);
      }
    }
    // Un atelier mémorisé AVANT d'être semé (slot de zone « center ») sera écarté
    // par slotCompat et reposé ailleurs : sa case ne doit plus lui être tenue, sans
    // quoi elle resterait vide — ni à lui, ni aux maisons qui l'entourent.
    const leaving = (key, slot) => !ilotMode && sownKeys.has(key) && slot.zone !== "sown";   // (îlots : zone « ilot »)
    const hold = (key, slot) => {
      if (leaving(key, slot)) {
        const [sx, sy] = spanOf.get(key) || [1, 1];
        sownVacated += sx * sy;
        return;
      }
      // Le terroir tient ses PARCELLES (docs/PLAN-TERROIR.md), pas la boîte
      // cmFieldSpan de l'ancien bloc unique.
      if (Array.isArray(slot.parcels)) {
        for (const q of slot.parcels) {
          for (let ax = 0; ax < (q[2] | 0); ax += 1) for (let ay = 0; ay < (q[3] | 0); ay += 1) {
            const k = (cx + q[0] + ax) + "," + (cy + q[1] + ay);
            if (!heldBy.has(k)) heldBy.set(k, key);
          }
        }
        return;
      }
      const gx = cx + (Number(slot.dx) || 0);
      let gy = cy + (Number(slot.dy) || 0);
      let [sx, sy] = spanOf.get(key) || [1, 1];
      if (key.includes(":river_ports:")) { sy = Number(slot.sy) || 3; gy -= sy; }   // dy = rangée sud
      for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) {
        const k = (gx + ax) + "," + (gy + ay);
        if (!heldBy.has(k)) heldBy.set(k, key);
      }
    };
    const entries = Object.entries(store).filter(([key]) => key.startsWith(prefix));
    for (const [key, slot] of entries) if (key.includes(":dec_")) hold(key, slot);
    for (const [key, slot] of entries) if (!key.includes(":dec_")) hold(key, slot);
  }

  // Merveilles FIGÉES (cf. plus bas, « les merveilles ne glissent plus ») : leur
  // emprise est connue dès ici, une place neuve ne s'y ouvre jamais.
  const frozenWonderCells = new Set();
  if (s.cityCore && s.cityCore.wonders) {
    const act = cmWonderActiveIds(s);
    CM_WONDERS.forEach((w) => {
      const f = s.cityCore.wonders[w.id];
      if (!f || !act.has(w.id) || w.id === "era_mega") return;
      const tier = Math.max(1, Math.min(5, ((s.wonderTiers && s.wonderTiers[w.id]) | 0) || 1));
      cmForEachWonderCell({ gx: cx + f[0], gy: cy + f[1] }, w.id, N, (gx, gy, k) => frozenWonderCells.add(k), tier);
    });
  }

  // ── LE BASSIN DU VIEUX PORT (docs/PLAN-PORTS.md, lot P3, map/portSites.js) ──
  // Raph, 2026-10-01 : « un port plaisancier type port de Marseille », en VRAI
  // bassin creusé dans la berge, à partir du XIXe (bande 5) — le port de la grève
  // devient le Vieux-Port. Ses cases deviennent de l'EAU ici, avant le modèle
  // d'eau, la structure de ville et le tracé : tout ce qui suit le lit comme le
  // fleuve (ni bâti, ni place, ni rue ; la mémoire des rues abandonne d'elle-même
  // une rue devenue eau). Son anneau de quai rejoint la berge (bankSet).
  // Fondé UNE fois, figé dans cityCore.ports.old (repère du centre de grille).
  // C'est un des rares moments où la ville DÉLOGE (comme l'échangeur de l'autoroute) :
  // les bâtiments posés sur le bassin libèrent leur slot et se reposent ailleurs.
  const portLevel = Math.floor((s.buildings && s.buildings.river_ports) || 0);
  const portsSplit = PORT_SITES.on && !!s.cityCore && portLevel > 0 && (c.eraBand | 0) >= PORT_SITES.splitBand;
  let oldBasin = null, oldBasinQuay = null;
  if (portsSplit) {
    const isWater = (x, y) => riverSet.has(x + "," + y);
    const fixP = s.cityCore.ports || {};
    let b = fixP.old ? { gx: cx + fixP.old.dx, gy: cy + fixP.old.dy, w: fixP.old.w, h: fixP.old.h } : null;
    if (!b) {
      // Le bassin se creuse LÀ OÙ ÉTAIT le port de la grève (son slot), sinon au
      // plus près du cœur ; jamais sur une merveille figée ni sur les Plaisirs.
      const pslot = cmCityMapSlotsFor(s)[cmMapSlotKey(s.cycles, "river_ports", 0)];
      const preferX = pslot ? cx + (Number(pslot.dx) || 0) + cmRiverPortSpan(portLevel).w / 2 : plan.core.x;
      const plx = plaisirsSpot ? plaisirsSpot.x : null, ply = plaisirsSpot ? plaisirsSpot.y : null;
      const plR = plaisirsSpot ? (plaisirsSpot.clear || 0) + 2 : 0;
      b = oldPortBasinFor({
        N, isWater, riverYAt, riverHwAt, preferX, bridgeX: riverBridge.x, arteryAx: Math.round(riverBridge.x),
        free: (x, y) => !frozenWonderCells.has(x + "," + y) && !(plaisirsSpot && Math.hypot(x + 0.5 - plx, y + 0.5 - ply) <= plR),
      });
      if (b) s.cityCore.ports = { ...fixP, old: { dx: b.gx - cx, dy: b.gy - cy, w: b.w, h: b.h } };
    }
    if (b) {
      oldBasin = b;
      const { water: bw, quay: bq } = basinCells(b, isWater);
      for (const [x, y] of bw) { const k = x + "," + y; riverSet.add(k); bankSet.delete(k); nearSet.delete(k); }
      oldBasinQuay = new Set();
      for (const [x, y] of bq) { const k = x + "," + y; if (riverSet.has(k)) continue; bankSet.add(k); nearSet.delete(k); oldBasinQuay.add(k); }
      {
        const store = cmCityMapSlotsFor(s), portKey = cmMapSlotKey(s.cycles, "river_ports", 0), evicted = new Set();
        for (const [x, y] of bw.concat(bq)) { const o = heldBy.get(x + "," + y); if (o && o !== portKey) evicted.add(o); }
        if (evicted.size) {
          for (const [k, o] of Array.from(heldBy)) if (evicted.has(o)) heldBy.delete(k);
          for (const o of evicted) delete store[o];
        }
      }
    }
  }


  // Modèle d'eau : source de vérité unique du « sur l'eau / berge / près / sec ».
  // Construit tôt pour que pose, graphe routier et rendu consultent les mêmes
  // prédicats. Sur-ensemble du contrat river historique → rétro-compatible.
  const water = createWaterModel({
    cells: riverSet, banks: bankSet, near: nearSet,
    samples: riverSamples, bridge: riverBridge, riverYAt, present: true
  });
  const river = water;
  // Le monument des Plaisirs voyage AVEC le modèle d'eau : le rendu y lit sa
  // place, et la flotte en tire son obstacle (cf. CM.riverObstacles). Publié
  // ici, donc après l'évasement du lit — ses coordonnées sont déjà celles du
  // cours corrigé, il ne peut pas se retrouver au sec.
  // ⛔ PUBLIÉ SEULEMENT QUAND SES JEUX SONT OUVERTS (PLAISIRS_OPEN_ERA).
  // On ne masque QUE la publication : la marche, l'évasement du lit et le
  // domaine réservé lisent `plaisirsSpot` et restent les
  // mêmes à toutes les ères — le fleuve ne change pas de forme le jour où le lieu
  // apparaît, aucun pont ne saute, et le terrain est déjà dégagé. Sans
  // `river.plaisirs` : pas d'item au peintre (isoLiveCollect périme la boîte, donc
  // ni clic, ni survol, ni aura, ni faisceaux), et pas d'obstacle FANTÔME pour la
  // flotte (cityMapRuntime) — le pêcheur de l'ère 0 ne contourne plus le vide.
  // Le layout se recalcule à chaque changement d'ère : le lieu paraît au passage
  // de la bande, sans rien d'autre à signer.
  river.plaisirs = c.plaisirsOpen ? plaisirsSpot : null;
  lp("plan-eau");

  // Fonction chaude : appelée pour chaque cellule de la grille + chaque tronçon
  // de route. Boucle simple et hash entier
  // (pas de concaténation de chaînes ni de closure de reduce).
  const riverPullFactor = c.eraBand >= 2 ? 0.55 : 0.2;
  // SORTIE ANTICIPÉE (PERF-7 de l'audit du 2026-10-05 : la boucle des cellules
  // passait ~45 % de son temps ici, surtout pour des cellules loin hors la ville).
  // Chaque terme du seuil a une borne haute — contour ≤ plan.reachMax, fleuve ≤
  // 5,5 × facteur, quartier ≤ max(r × force), frange hachée < 0,9 : une cellule plus
  // loin que leur somme est dehors, quoi que disent atan2, riverYAt et les ancres.
  // Bornes sommées dans l'ordre du seuil et majorées d'un epsilon → même réponse au
  // bit près. Une ancre dont le carré ne contient pas la cellule tire ≤ 0 (force > 0)
  // et ne peut pas battre quarterPull (≥ 0) : on la saute.
  let olQuarterMax = 0;
  for (const q of quarterAnchors) olQuarterMax = Math.max(olQuarterMax, q.r * q.strength);
  const olFar = plan.reachMax(cityReachBase) * (1 + 1e-9) + 5.5 * riverPullFactor + olQuarterMax + 0.9 + 1e-6;
  const organicLimit = (gx, gy, margin = 0) => {
    const px = gx + 0.5, py = gy + 0.5;
    const dx = px - plan.core.x, dy = py - plan.core.y;
    const dist = Math.hypot(dx, dy);
    if (dist > olFar + margin) return false;
    const angle = Math.atan2(dy, dx);
    const riverPull = Math.max(0, 5.5 - Math.abs(py - riverYAt(gx))) * riverPullFactor;
    let quarterPull = 0;
    for (let qi = 0; qi < quarterAnchors.length; qi += 1) {
      const q = quarterAnchors[qi];
      if (Math.abs(px - q.gx) >= q.r || Math.abs(py - q.gy) >= q.r) continue;
      const pull = (q.r - Math.hypot(px - q.gx, py - q.gy)) * q.strength;
      if (pull > quarterPull) quarterPull = pull;
    }
    const h = (Math.imul((gx - fx0) | 0, 73856093) ^ Math.imul((gy - fy0) | 0, 19349663) ^ mapSeed) >>> 0;
    const hashEdge = ((h % 1000) / 1000 - 0.5) * 1.8;
    return dist <= plan.reachFor(cityReachBase, angle) + riverPull + quarterPull + hashEdge + margin;
  };
  const organicScore = (cell) => {
    const dx = cell.gx + 0.5 - plan.core.x, dy = cell.gy + 0.5 - plan.core.y;
    const reach = Math.max(1, plan.reachFor(cityReachBase, Math.atan2(dy, dx)));
    return Math.hypot(dx, dy) / reach;
  };

  // ── LA STRUCTURE DE LA VILLE (docs/PLAN-ROUTES.md, lots L6-L8, map/cityQuarters.js) ──
  // Retour de Raph sur le premier bourg à mémoire : « une vraie grande artère,
  // la place doit se décaler », « les places de quartier doivent trouver leur
  // place », « un poil trop dense ». Tout se décide ICI, avant le tracé, pour que
  // le placement des maisons le respecte dès le campement :
  //   - l'ARTÈRE prolonge le pont tout droit, les maisons la bordent ;
  //   - la PLACE CENTRALE est contre l'artère (le feu du camp en son centre) ;
  //   - chaque QUARTIER est fondé une fois, au bord de la ville du moment, avec
  //     son site réservé (un pré, puis sa place quand l'ère la justifie) ;
  //   - le tout est FIGÉ dans `s.cityCore` (central, quarters).
  // C'est la ville du campement et du village (bandes 0-1) : à partir de la bande 2,
  // la structure — places, artère, jardins — vient des îlots.
  const townOn = !ilotMode;
  // (Mode îlots) les îlots déjà OUVERTS — intérieurs et rues de pourtour, lus dans la
  // mémoire : ce qui se pose avant planIlots (port de commerce, merveille neuve) se
  // tient hors d'eux, sans rogner la ville déjà bâtie.
  const ilotBuilt = ilotMode && s.cityCore ? ilotMemoryCells({ core: plan.core, bx: Math.round(riverBridge.x), memory: s.cityCore.ilot }) : null;
  const townReserve = new Set();   // jamais bâti (sites de place) — passable
  const townGreen = new Set();     // repeint en herbe (prés, jardins, ceintures)
  const townGardens = new Set();   // jardins + ceintures seuls : la desserte les contourne
  const townCenters = [];          // centres des quartiers (ceintures vertes)
  const townSites = [];            // tous les sites (central + quartiers), pour les merveilles
  let centralSite = null, arteryAx = null, arteryRoad = [];
  let tradePort = null;            // terre-plein du port de commerce (lot P2), cf. plus bas
  // Le terre-plein du port de commerce : relu dans cityCore.ports.trade, sinon fondé
  // (cf. LE PORT DE COMMERCE, plus bas). `blocked(k)` : cases en plus à éviter (îlots
  // ouverts). Un terre-plein fondé AVANT la réorganisation peut se trouver sous un
  // bâtiment — on le refonde alors ailleurs.
  const foundTradePort = (blocked) => {
    const plR = plaisirsSpot ? (plaisirsSpot.clear || 0) + PORT_SITES.tradeGap : 0;
    // Ce qu'aucun terre-plein ne recouvre, mémorisé ou neuf : bâtiment posé, merveille
    // figée, quai du bassin, domaine des Plaisirs.
    const clear = (x, y) => {
      const k = x + "," + y;
      if (heldBy.has(k) || frozenWonderCells.has(k)) return false;
      if (oldBasinQuay && oldBasinQuay.has(k)) return false;
      return !(plaisirsSpot && Math.hypot(x + 0.5 - plaisirsSpot.x, y + 0.5 - plaisirsSpot.y) <= plR);
    };
    // Un terre-plein NEUF évite en plus `blocked`.
    const free = (x, y) => clear(x, y) && !blocked(x + "," + y);
    const ft = (s.cityCore.ports || {}).trade;
    let tp = ft ? { x0: cx + ft.dx, len: ft.len, side: ft.side, depth: ft.depth, edge: ft.edge.map((v) => cy + v) } : null;
    // ⚠ La revérification ne lit PAS `blocked` (audit 2026-10-05, BUG-14) : les îlots
    // ouverts de la mémoire (ilotMemoryCells) comptent tout leur pourtour, même là où
    // planIlots ne pose aucune rue — le terre-plein, réservé (tradeHeld), le tient hors
    // des îlots. Un îlot ouvert contre lui faisait refonder le port au calcul suivant :
    // 10 déplacements sur 54 recalculs (6 graines, bandes 5 → 7), jusqu'à 28 cases.
    if (tp && !tradeCells(tp).every(([x, y]) => clear(x, y))) tp = null;
    if (!tp) {
      tp = tradePortSiteFor({
        N, isWater: (x, y) => riverSet.has(x + "," + y), riverYAt, riverHwAt,
        inCity: (x, y) => organicLimit(x, y, PORT_SITES.tradeGap),
        free,
        coreX: plan.core.x, downX: plaisirsSpot ? plaisirsSpot.x : plan.core.x + 1, bridgeX: riverBridge.x, arteryAx: Math.round(riverBridge.x),
      });
      if (tp) s.cityCore.ports = { ...(s.cityCore.ports || {}), trade: { dx: tp.x0 - cx, len: tp.len, side: tp.side, depth: tp.depth, edge: tp.edge.map((v) => v - cy) } };
    }
    return tp;
  };
  if (townOn) {
    const CQ = CITY_QUARTERS;
    const ax = Math.round(riverBridge.x);
    arteryAx = ax;
    const fix = s.cityCore;                                   // posé plus haut (lot L1)
    const siteCells = new Set();
    const markSite = (st) => forSiteCells(st, (x, y) => { siteCells.add(x + "," + y); townReserve.add(x + "," + y); });
    // Posable : dans la grille, au sec, ni bâtiment tenu, ni merveille, ni
    // artère ; et à `gap` cases au moins de tout autre site.
    const siteFree = (st, gap) => {
      const half = Math.floor(st.size / 2);
      for (let dx = -half - gap; dx < st.size - half + gap; dx += 1) {
        for (let dy = -half - gap; dy < st.size - half + gap; dy += 1) {
          const x = st.gx + dx, y = st.gy + dy, k = x + "," + y;
          if (siteCells.has(k)) return false;
          if (dx < -half || dx >= st.size - half || dy < -half || dy >= st.size - half) continue;
          if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) return false;
          if (corridorAt(x, y) || heldBy.has(k) || frozenWonderCells.has(k)) return false;
          if (x === ax || x === ax + 1) return false;
        }
      }
      return true;
    };
    // Place centrale, figée à sa première pose.
    const cf = fix && Array.isArray(fix.central) ? fix.central : null;
    centralSite = cf ? { gx: cx + cf[0], gy: cy + cf[1], size: CQ.centralSize, kind: "centrale" }
      : centralSiteFor({ ax, coreY: plan.core.y, size: CQ.centralSize, free: (st) => siteFree(st, 0) });
    if (!cf && fix) fix.central = [centralSite.gx - cx, centralSite.gy - cy];
    markSite(centralSite);
    townSites.push(centralSite);
    townCenters.push({ x: centralSite.gx, y: centralSite.gy });
    // Quartiers : clé STABLE (bande:index — l'étiquette porte le kind, qui
    // changeait d'une ère à l'autre), position et kind figés à la fondation.
    const qf = { ...((fix && fix.quarters) || {}) };
    const maxR = Math.max(6, Math.min(N / 2 - 3, cityReachBase * 1.6 + 4));
    for (const a of plan.anchors || []) {
      const m = /-(\d+)-(\d+)$/.exec(a.label || "");
      const key = m ? m[1] + ":" + m[2] : String(a.label);
      let f = qf[key];
      if (!f) {
        let st = null;
        if (a.band >= 1) {
          const size = QUARTER_PLAZA[a.kind] ? CQ.plazaSize : CQ.greenSize;
          st = foundSite({ anchor: a, core: plan.core, size, free: (x) => siteFree(x, CQ.siteGap), maxR });
        }
        f = st ? { dx: st.gx - cx, dy: st.gy - cy, kind: a.kind, site: 1 }
          : { dx: Math.round(a.gx) - cx, dy: Math.round(a.gy) - cy, kind: a.kind, site: 0 };
        // Pas de terrain libre aujourd'hui : le quartier n'est PAS figé, il
        // retentera au prochain calcul (la ville aura grandi, la grille aussi).
        if (st || a.band < 1) qf[key] = f;
      }
      a.gx = cx + f.dx; a.gy = cy + f.dy; a.kind = f.kind;
      if (f.site) {
        const st = { gx: a.gx, gy: a.gy, size: QUARTER_PLAZA[f.kind] ? CQ.plazaSize : CQ.greenSize, akind: f.kind };
        markSite(st);
        townSites.push(st);
        townCenters.push({ x: st.gx, y: st.gy });
      }
    }
    if (fix) fix.quarters = qf;
    // Artère : de chaque rive jusqu'à la lisière (+ marge).
    // ⛔ PAS DE 2E VOIE RÉSERVÉE à côté d'elle (essayé puis retiré, 2026-10-01) :
    // une bande libre et traversable le long de l'artère servait de COULOIR aux
    // sentiers du village, qui s'y glissaient en parallèle de la grande rue —
    // d'où des miettes de sol entre les deux chaussées (retour Raph : « ces
    // petits morceaux de sol qui ne sont pas logiques »). Les maisons bordent
    // l'artère des deux côtés.
    arteryRoad = arteryCells({ ax, N, wet: (x, y) => corridorAt(x, y), inCity: (x, y) => organicLimit(x, y, 1.5), margin: CQ.arteryMargin });
    // Places : au campement et au village, un site n'est encore qu'un PRÉ (herbe,
    // aucun bâti) — le site central à partir du village. Les places s'ouvrent au
    // bourg (bande 2, cf. QUARTER_PLAZA), dans la ville par îlots, qui les pose
    // elle-même (ilotLayout.js).
    if ((c.eraBand | 0) === 1) forSiteCells(centralSite, (x, y) => townGreen.add(x + "," + y));
    for (const st of townSites) if (st !== centralSite) forSiteCells(st, (x, y) => townGreen.add(x + "," + y));
    plan.plazas = [];
  }

  // ── LE PORT DE COMMERCE (docs/PLAN-PORTS.md, lot P2, map/portSites.js) ──────
  // Raph, 2026-10-01 : « un port commercial en périphérie de la ville », docks
  // au XIXe puis terminal à conteneurs (Le Havre). Un terre-plein le long d'un
  // tronçon de berge droit, en aval, au bord de la ville du moment — fondé une
  // fois et figé (cityCore.ports.trade), réservé à sa taille MAXIMALE : il grandit
  // avec les Ports achetés sans déloger personne. Jamais sur une cellule tenue.
  // Il garde son placement dédié dans la ville par îlots (PLAN-ILOTS : « champs,
  // moulins et port gardent leur placement dédié ») : hors des îlots ouverts, le
  // cardo (colonne du pont) tenant le rôle de l'artère ; son terrain est réservé
  // (jamais bâti), planIlots le contourne, sa rue d'accès est tracée après les rues
  // d'îlots. (Il naît au XIXe, bande PORT_SITES.splitBand : toujours en îlots.)
  if (ilotMode && portsSplit) {
    const tp = foundTradePort((k) => !!ilotBuilt && ilotBuilt.has(k));
    if (tp) {
      tradePort = tp;
      for (const [x, y] of tradeCells(tp)) townReserve.add(x + "," + y);
    }
  }

  // Les places de la ville par îlots sont posées par les îlots, plus bas. (La mémoire
  // des places hors îlots, `cityRoads.plazas`, ne servait plus qu'à l'ancien placement
  // — partie avec lui, audit 2026-10-05, MORT-4.)
  if (ilotMode) plan.plazas = [];

  // ── Réseau viaire procédural (sentiers, places, pont) ───────────────────────
  // Moteur graphe : réseau connexe par construction (cf. roadGraph.js), recette
  // organique du campement et du village, avec le seul pont historique (tenu à
  // distance de la Maison des Plaisirs par le plancher du slot — cf. § MAISON DES
  // PLAISIRS). Les traversées seedées des ères avancées, et leur garde `bridgeAvoid`,
  // sont parties avec l'ancien placement (audit 2026-10-05, MORT-4).
  // (`fieldAt`, le champ de terrain que les tracés longs lisaient pour sillonner
  //  entre les massifs, est parti avec le relief le 2026-10-06 — audit MORT-14.)
  // En mode îlots, AUCUN réseau tracé d'avance : les rues sont les pourtours des
  // îlots, posés plus bas (une fois les merveilles connues). Le pont central garde
  // ses deux colonnes protégées (cmBuildRoadGraph, carve des merveilles).
  const { roads, roadKey, roadMeta, skeletonKey, bridgeCols } = ilotMode
    ? { roads: [], roadKey: new Set(), roadMeta: new Map(), skeletonKey: null,
      bridgeCols: new Set([Math.round(riverBridge.x), Math.round(riverBridge.x) + 1]) }
    : generateRoadsGraph({
      plan, seed: mapSeed, counts: c, N,
      riverSet, bankSet, riverBridgeX: riverBridge.x, organicLimit,
    });
  lp("routes-tracé");
  // ── LA MÉMOIRE DU RÉSEAU (docs/PLAN-ROUTES.md, lot L2) ─────────────────────
  // Les rues du calcul précédent rejoignent le réseau AVANT le placement : elles
  // entrent dans le SQUELETTE (la dissolution de l'échafaudage ne les touche
  // pas) et dans `memKeep` (aucun émondage ne les touche). Une rue mémorisée que
  // le fleuve recouvre aujourd'hui est abandonnée, sauf sur les colonnes du pont.
  const memKeep = new Set();
  if (roadMem) {
    for (const [k, mc] of roadMem) {
      const ci = k.indexOf(","), gx = +k.slice(0, ci), gy = +k.slice(ci + 1);
      if (gx < 0 || gy < 0 || gx >= N || gy >= N) continue;
      if ((riverSet.has(k) || bankSet.has(k)) && !bridgeCols.has(gx)) continue;
      const m = roadMeta.get(k);
      if (m) {
        m.h = m.h || mc.h; m.v = m.v || mc.v;
        if (rankAbove(mc.rank, m.rank)) m.rank = mc.rank;
      } else {
        roadMeta.set(k, { h: mc.h, v: mc.v, rank: mc.rank });
        roads.push({ gx, gy });
        roadKey.add(k);
      }
      if (skeletonKey) skeletonKey.add(k);
      memKeep.add(k);
    }
  }
  // L'ARTÈRE (lot L6) rejoint le squelette, protégée comme la mémoire. Son rang
  // suit l'ère — sentier du campement, rue du village (au bourg, c'est le cardo des
  // îlots qui prend la suite) — et ne redescend jamais. Une cellule déjà tenue par
  // un bâtiment (save d'avant ce lot) est sautée : on ne déloge pas.
  if (townOn && arteryRoad.length) {
    const aRank = (c.eraBand | 0) >= 1 ? "secondary" : "path";
    for (const q of arteryRoad) {
      const k = q.gx + "," + q.gy;
      if (heldBy.has(k)) continue;
      const m = roadMeta.get(k);
      if (m) { m.v = true; if (rankAbove(aRank, m.rank)) m.rank = aRank; }
      else { roadMeta.set(k, { h: false, v: true, rank: aRank }); roads.push({ gx: q.gx, gy: q.gy }); roadKey.add(k); }
      if (skeletonKey) skeletonKey.add(k);
      memKeep.add(k);
    }
    // LE SENTIER DU FEU : le foyer (centre de la place) rejoint l'artère par une
    // ligne droite — « les sentiers convergent sur le feu ».
    if (centralSite) {
      const h = hearthOfSite(centralSite), step = h.gx < arteryAx ? 1 : -1;
      for (let x = h.gx; x !== arteryAx; x += step) {
        const k = x + "," + h.gy;
        if (heldBy.has(k)) break;
        const m = roadMeta.get(k);
        if (m) m.h = true;
        else { roadMeta.set(k, { h: true, v: false, rank: "path" }); roads.push({ gx: x, gy: h.gy }); roadKey.add(k); }
        if (skeletonKey) skeletonKey.add(k);
        memKeep.add(k);
      }
      const ak = arteryAx + "," + h.gy, am = roadMeta.get(ak);
      if (am) am.h = true;
    }
  }
  // ── LA ROUTE DU PORT DE COMMERCE (docs/PLAN-PORTS.md, lot P2) ───────────────
  // Le terre-plein est en périphérie : aucune rue n'y mène d'elle-même. Patron du
  // sentier du feu : le plus court chemin, sur cases libres (ni eau, ni bâti tenu,
  // ni merveille, ni Plaisirs), du milieu de son arrière jusqu'au réseau stable le
  // plus proche — posé dans memKeep (aucun émondage n'y touche), rang `secondary` :
  // une vraie rue de desserte. La mémoire des rues la garde ensuite.
  // `avoid` : les intérieurs d'îlots, que la rue contourne.
  const routeTradePort = (avoid) => {
    const dirT = tradePort.side === "N" ? 1 : -1, mi = Math.floor(tradePort.len / 2);
    const sx = tradePort.x0 + mi, sy = tradePort.edge[mi] - dirT * tradePort.depth;
    const plR = plaisirsSpot ? (plaisirsSpot.clear || 0) + 1 : 0;
    const okCell = (x, y) => {
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) return false;
      const k = x + "," + y;
      if (riverSet.has(k) || heldBy.has(k) || frozenWonderCells.has(k)) return false;
      if (avoid.has(k)) return false;
      return !(plaisirsSpot && Math.hypot(x + 0.5 - plaisirsSpot.x, y + 0.5 - plaisirsSpot.y) <= plR);
    };
    const par = new Map([[sx + "," + sy, null]]), q = [[sx, sy]];
    let hit = null;
    for (let qi = 0; qi < q.length && qi < 20000 && !hit; qi += 1) {
      const [x, y] = q[qi];
      for (const [dx, dy] of [[0, -dirT], [1, 0], [-1, 0], [0, dirT]]) {
        const nx = x + dx, ny = y + dy, nk = nx + "," + ny;
        if (par.has(nk)) continue;
        // Cible : le réseau STABLE (rues d'îlots, rues mémorisées) — une rue que
        // l'émondage supprimera ensuite laisserait le chemin pendu.
        if (roadKey.has(nk) && memKeep.has(nk)) { par.set(nk, x + "," + y); hit = nk; break; }
        if (!okCell(nx, ny)) continue;
        par.set(nk, x + "," + y); q.push([nx, ny]);
      }
    }
    if (hit) {
      const path = [];
      for (let k = par.get(hit); k; k = par.get(k)) path.push(k);
      const rank = (c.eraBand | 0) >= 5 ? "secondary" : "path";
      const xy = (k) => { const i = k.indexOf(","); return [+k.slice(0, i), +k.slice(i + 1)]; };
      const chain = [hit, ...path];
      for (let i = 1; i < chain.length; i += 1) {
        const k = chain[i], [x, y] = xy(k);
        let h = false, v = false;
        for (const nb of [chain[i - 1], chain[i + 1]]) {
          if (!nb) continue;
          const [ax, ay] = xy(nb);
          if (ay === y && ax !== x) h = true; else if (ax === x && ay !== y) v = true;
        }
        const m = roadMeta.get(k);
        if (m) { m.h = m.h || h; m.v = m.v || v; if (rankAbove(rank, m.rank)) m.rank = rank; }
        else { roadMeta.set(k, { h, v, rank }); roads.push({ gx: x, gy: y }); roadKey.add(k); }
        memKeep.add(k);
      }
      const hm = roadMeta.get(hit), hy = xy(hit)[1], py = xy(chain[1] || hit)[1];
      if (hm) { if (py === hy) hm.h = true; else hm.v = true; }
    }
  };
  // (Elle se trace après les rues d'îlots, cf. plus bas : le port de commerce
  // n'existe que dans la ville par îlots.)
  // (LES EXTENSIONS PLANIFIÉES du lot L5 — le plan géométrique de l'ère tracé sur
  // le terrain neuf autour de la vieille ville — ne servaient plus qu'à l'ancien
  // placement : parties avec lui, audit 2026-10-05, MORT-4.)
  lp("routes-mémoire");

  // ── L'AUTOROUTE DE L'ARTÈRE (docs/PLAN-ETAGES.md, lot 2) ──────────────────
  // À partir de la bande 6, un tablier sur piles couvre l'artère du pont (son
  // dessin : iso/isoHighway.js). Il ne prend AUCUN terrain : il passe au-dessus de
  // la chaussée. Seul l'ÉCHANGEUR en prend — deux pelouses pour ses boucles, au
  // croisement d'une rue transversale, choisies une fois puis FIGÉES dans
  // s.cityCore.highway (repère du centre de grille). Elles entrent dans la réserve
  // de la ville (jamais bâties, repeintes en herbe) ; un bâtiment qui y tenait sa
  // place est relogé, une fois. Elle naît à la bande HIGHWAY.band, donc toujours dans
  // la ville par îlots : son plan se calcule avec les îlots, plus bas (BUG-16).
  let highway = null;

  // Pont central : largeur (2 voies dès la bande 2) + colonne de base. Réutilisés
  // par la carve des merveilles, la protection du trim et cmBuildRoadGraph — le pont
  // sanctuarisé ne doit être effacé par AUCUN d'eux.
  const bridgeLaneW = c.eraBand >= 2 ? 2 : 1;
  const protectedBridgeBx = riverBridge ? Math.round(riverBridge.x) : null;
  const isBridgeSpanCell = (gx, k) => protectedBridgeBx !== null
    && gx >= protectedBridgeBx && gx < protectedBridgeBx + bridgeLaneW && riverSet.has(k);

  // Slots des merveilles : chacune réserve son emplacement pour l'anti-collision
  // de placement (era_mega dans l'eau → brèche du fleuve).
  const builtWonderIds = cmWonderActiveIds(s);
  // L'APERÇU dev (__showWonder) est traité comme ÉRIGÉE par le plan (carve des
  // routes, réserve, parvis, urbanisation) → l'aperçu est fidèle au rendu réel.
  // Runtime seulement : le save n'est jamais touché ; __show/__hideWonder
  // invalident CM.layout pour que ce choix s'applique/se retire aussitôt.
  if (CM.previewWonder && CM_WONDERS.some((w) => w.id === CM.previewWonder.id)) builtWonderIds.add(CM.previewWonder.id);
  // RANG ATTEINT par merveille : c'est lui qui dimensionne l'emprise (parvis,
  // réserve, carve des routes, socle piéton). Résolu UNE fois ici et PUBLIÉ sur
  // le layout (L.wonderTiers) — le runtime et le rendu doivent lire le rang que
  // le PLAN a utilisé, pas relire l'état : `state` peut avoir bougé entre le
  // calcul du plan et la frame, et un désaccord d'un cran ferait déborder le
  // dallage hors des cellules réellement réservées. L'aperçu dev impose le sien.
  const wonderTiers = {};
  for (const w of CM_WONDERS) {
    if (!builtWonderIds.has(w.id)) continue;
    const pv = CM.previewWonder && CM.previewWonder.id === w.id ? CM.previewWonder.tier : null;
    const t = pv != null ? pv : ((s && s.wonderTiers && s.wonderTiers[w.id]) || 1);
    wonderTiers[w.id] = Math.max(1, Math.min(5, t | 0));
  }
  const tierOf = (id) => wonderTiers[id];
  const bridgeGx = riverBridge ? Math.round(riverBridge.x) : undefined;
  // Tant que la place centrale n'est pas ouverte, son SITE compte comme une place
  // pour les merveilles (mémoire des rues, lot L3) : sans ça, la première
  // merveille du campement se posait sur le terrain promis à la place du bourg.
  const wonderPlazas = townOn ? townSites.map((st) => ({ gx: st.gx, gy: st.gy, size: st.size }))
    : (plan.centralSite && !(plan.plazas || []).some((p) => p.kind === "centrale"))
    ? [...(plan.plazas || []), plan.centralSite] : plan.plazas;
  // ⚠ La garde de cmDryWonderSlot ne teste que l'ANCRE de la merveille (marge
  // de 2,5 autour d'une place) ; son parvis, lui, déborde de son rayon r — jusqu'à
  // 5 cases au premier rang. Tant qu'une merveille glissait à chaque ère, ce
  // recouvrement ne durait pas ; figée (cf. juste après), elle encerclait le feu
  // du campement et la place du bourg ne trouvait plus de terrain (vu à la
  // capture, ère 14 : deux parvis autour du foyer, aucune place). On élargit donc
  // chaque place du rayon du parvis de la merveille qu'on pose.
  const plazasFor = (w) => {
    if (!Array.isArray(wonderPlazas)) return wonderPlazas;
    const r = cmWonderExtent(w.id, tierOf(w.id) || 1).halfW;
    return wonderPlazas.map((pz) => ({ ...pz, size: pz.size + Math.max(0, 2 * r - 3) }));
  };
  // ── LES MERVEILLES S'ESPACENT (Raph 2026-10-01 : « davantage les espacer ») ──
  // Avec la structure de ville, le parvis ENTIER d'une merveille neuve doit être
  // libre : ni artère, ni site de place, ni bâtiment déjà posé, et WONDER_GAP
  // cases au moins de tout autre parvis. Les merveilles déjà érigées sont figées
  // (plus bas) ; leur emprise compte dès le départ.
  // En mode îlots aussi (revue du 04/10) : sans cette garde, une merveille neuve
  // (Cathédrale, Œil…) se posait sur les îlots déjà bâtis et en délogeait les
  // maisons et les halles. Là, elle évite en plus les îlots ouverts (ilotBuilt).
  const WONDER_GAP = 4;
  const wonderTaken = new Set(frozenWonderCells);
  const wonderFits = (w) => (gx, gy) => {
    const r = cmWonderExtent(w.id, tierOf(w.id) || 1).halfW;
    for (let dy = -r - WONDER_GAP; dy <= r + WONDER_GAP; dy += 1) {
      for (let dx = -r - WONDER_GAP; dx <= r + WONDER_GAP; dx += 1) {
        const x = gx + dx, y = gy + dy, k = x + "," + y;
        if (wonderTaken.has(k)) return false;
        if (Math.abs(dx) > r || Math.abs(dy) > r) continue;
        if (townReserve.has(k) || heldBy.has(k)) return false;
        if (ilotBuilt && ilotBuilt.has(k)) return false;
        if (arteryAx != null && (x === arteryAx || x === arteryAx + 1)) return false;
      }
    }
    return true;
  };
  const wonderSlots = [];
  CM_WONDERS.forEach((w, wi) => {
    const own = builtWonderIds.has(w.id) && !(s.cityCore && s.cityCore.wonders && s.cityCore.wonders[w.id]);
    const slot = w.id === "era_mega"
      ? cmWetWonderSlot(wi, N, cx, cy, riverYAt, riverSet, cityReachBase, bridgeGx)
      : cmDryWonderSlot(wi, N, cx, cy, riverSet, bankSet, plazasFor(w), cityReachBase, own ? wonderFits(w) : null);
    wonderSlots.push(slot);
    if (builtWonderIds.has(w.id) && w.id !== "era_mega") {
      const f = s.cityCore && s.cityCore.wonders && s.cityCore.wonders[w.id];
      const at = f ? { gx: cx + f[0], gy: cy + f[1] } : slot;
      cmForEachWonderCell(at, w.id, N, (gx, gy, k) => wonderTaken.add(k), tierOf(w.id));
    }
  });
  // ── LES MERVEILLES NE GLISSENT PLUS (mémoire des rues) ──────────────────────
  // Leur anneau suit la portée de la ville (cmBaseWonderSlot) : mesuré, la
  // merveille de la première dynastie s'éloignait d'une à deux cases à CHAQUE
  // ère (de 5 à 15 cases du centre entre les ères 2 et 14), son parvis rasant au
  // passage les maisons et les chemins de la case d'à côté. Une merveille est un
  // monument : elle reste où elle a été érigée, la ville grandit autour.
  if (s.cityCore) {
    const wf = { ...(s.cityCore.wonders || {}) };
    CM_WONDERS.forEach((w, wi) => {
      if (!builtWonderIds.has(w.id) || (CM.previewWonder && CM.previewWonder.id === w.id)) return;
      const f = wf[w.id];
      if (f) wonderSlots[wi] = { ...wonderSlots[wi], gx: cx + f[0], gy: cy + f[1] };
      else wf[w.id] = [wonderSlots[wi].gx - cx, wonderSlots[wi].gy - cy];
    });
    s.cityCore.wonders = wf;
  }

  // ── ÎLE DE L'AIGUILLE : le fleuve se sépare en deux bras ──────────────────
  // Modèle assumé : l'Île de la Cité (Raph, 2026-07-30). La merveille ne se
  // contente plus de tenir au milieu de l'eau — le lit S'ÉVASE autour d'elle et
  // la contourne par deux bras, comme la Seine autour de Notre-Dame.
  //
  // ⚠ L'ORDRE EST LA CLÉ. Le fleuve est tracé bien plus haut, mais le slot de
  // l'Aiguille ne se connaît qu'ICI (il se cherche AVEC riverSet, donc après
  // lui). On creuse donc l'île à cet instant précis : assez tard pour savoir où
  // est la merveille, assez tôt pour que la pose des bâtiments (l. ~1900) et le
  // graphe routier (l. ~2680) voient le fleuve MODIFIÉ. Déplacer ce bloc plus
  // bas planterait des maisons dans les bras neufs.
  //
  // Les Set et le tableau de samples sont passés PAR RÉFÉRENCE au modèle d'eau :
  // les muter ici met à jour `river`/`water` sans avoir à le reconstruire.
  const islands = [];
  {
    const megaIdx = CM_WONDERS.findIndex((w) => w.id === "era_mega");
    const slot = megaIdx >= 0 ? wonderSlots[megaIdx] : null;
    if (slot && builtWonderIds.has("era_mega")) {
      // Sample le plus proche : centre de l'île et repère de sa tangente.
      let bi = 0, bd = Infinity;
      for (let i = 0; i < riverSamples.length; i += 1) {
        const dd = (riverSamples[i].x - slot.gx) ** 2 + (riverSamples[i].y - slot.gy) ** 2;
        if (dd < bd) { bd = dd; bi = i; }
      }
      if (Math.sqrt(bd) <= riverSamples[bi].hw + 1.5) {
        const s0 = riverSamples[bi];
        const a = riverSamples[Math.max(0, bi - 2)], b = riverSamples[Math.min(riverSamples.length - 1, bi + 2)];
        let tx = b.x - a.x, ty = b.y - a.y;
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;   // tangente du courant
        // Île OVALE, allongée DANS LE SENS DU COURANT : une île ronde ferait
        // barrage, un fuseau se laisse contourner — c'est la forme de toutes
        // les îles de rivière, et celle de la Cité.
        // ALLONGÉE (Raph, 2e passe) : 7,6 et non 4,6. Une île de rivière est un
        // fuseau étiré par le courant, pas un œuf ; à 4,6 elle se lisait comme
        // un rond posé au milieu de l'eau.
        const rx = 7.6, ry = 2.4;                                  // demi-axes, en tuiles
        // Le lit s'évase pour loger l'île ET laisser deux vrais bras : sans
        // cela, les bras seraient deux filets d'eau et l'île mangerait le
        // fleuve. La bosse s'étale sur ~1,9 fois la longueur de l'île pour que
        // les rives s'ouvrent en douceur au lieu de faire un renflement carré.
        //
        // ⚠ L'évasement TRANSVERSAL reste MODESTE (ry + 0,8, et non ry + 1,9 du
        // premier jet) : chaque bras garde 3,9 tuiles, largement de quoi passer,
        // mais le fleuve cesse de mordre le terrain alentour. Un lit trop gonflé
        // passait sous une route existante, qui devenait un pont — un ouvrage
        // que personne n'avait demandé, né d'un simple débordement.
        const etale = rx * 1.9;
        for (const sp of riverSamples) {
          const d = Math.hypot(sp.x - s0.x, sp.y - s0.y);
          if (d > etale) continue;
          const u = 1 - d / etale;
          sp.hw += (ry + 0.8) * u * u * (3 - 2 * u);
        }
        islands.push({ x: s0.x, y: s0.y, rx, ry, tx, ty });
        // Le lit ayant changé, on RECALCULE les cellules d'eau autour de l'île,
        // puis on rend l'île à la terre ferme. Elle passe en BERGE et non en
        // sec : c'est bien une rive, et les places comme les merveilles sèches
        // évitent déjà le corridor eau ∪ berge — donc rien ne viendra s'y poser
        // par accident.
        const R = etale + 6;
        for (const sp of riverSamples) {
          if (Math.hypot(sp.x - s0.x, sp.y - s0.y) > R) continue;
          const H = sp.hw;
          for (let gx = Math.floor(sp.x - H - 3); gx <= Math.ceil(sp.x + H + 3); gx += 1) {
            for (let gy = Math.floor(sp.y - H - 3); gy <= Math.ceil(sp.y + H + 3); gy += 1) {
              const d = Math.hypot(gx + 0.5 - sp.x, gy + 0.5 - sp.y);
              const k = gx + "," + gy;
              if (d <= H + 0.5) { riverSet.add(k); bankSet.delete(k); nearSet.delete(k); }
              else if (d <= H + 1.4) { if (!riverSet.has(k)) { bankSet.add(k); nearSet.delete(k); } }
              else if (d <= H + 3.2) { if (!riverSet.has(k) && !bankSet.has(k)) nearSet.add(k); }
            }
          }
        }
        for (let gx = Math.floor(s0.x - rx - 2); gx <= Math.ceil(s0.x + rx + 2); gx += 1) {
          for (let gy = Math.floor(s0.y - rx - 2); gy <= Math.ceil(s0.y + rx + 2); gy += 1) {
            const dx = gx + 0.5 - s0.x, dy = gy + 0.5 - s0.y;
            const along = dx * tx + dy * ty, cross = -dx * ty + dy * tx;
            if ((along / rx) ** 2 + (cross / ry) ** 2 > 1) continue;
            const k = gx + "," + gy;
            riverSet.delete(k);
            bankSet.add(k);
            nearSet.delete(k);
          }
        }
      }
    }
  }
  river.islands = islands;
  water.islands = islands;

  /* ── LE DOMAINE DE LA MAISON DES PLAISIRS ────────────────────────────────────
   * Le monument n'avait AUCUNE emprise réservée — ni `WONDER_CLEAR_R`, ni rien —
   * alors que le plan la réclamait dès la conception (« une emprise pareille
   * demande une zone réservée »). Résultat : la ville venait bâtir au ras de la
   * berge et le lieu cessait de se lire comme un ailleurs.
   *
   * Un disque de `clear` tuiles autour du pied, tenu SÉPARÉ de `reserved` à
   * dessein : `reserved` alimente aussi `demand` (les routes qui le bordent sont
   * protégées de l'émondage) et un domaine qui ATTIRE les routes ferait
   * l'inverse de ce qu'on lui demande. Des gates seulement là où l'on pose
   * quelque chose : îlots (`isReserved`), moteurs (`claimed`), bâti et arbres
   * (la boucle `cells`).
   *
   * ⚠ On ne CARVE aucune route ici. Le précédent est écrit dans la carve des
   * merveilles : `era_mega` en est exemptée parce qu'elle vit sur le fleuve, et
   * couper une travée au bord de l'eau coupe la ville en deux. La seule traversée,
   * le pont historique, est tenue à l'écart en AMONT (la marche, `minBridge`).
   * ------------------------------------------------------------------------ */
  const plaisirsClear = new Set();
  if (plaisirsSpot && plaisirsSpot.clear > 0) {
    const R = plaisirsSpot.clear;
    for (let gx = Math.floor(plaisirsSpot.x - R); gx <= Math.ceil(plaisirsSpot.x + R); gx += 1) {
      for (let gy = Math.floor(plaisirsSpot.y - R); gy <= Math.ceil(plaisirsSpot.y + R); gy += 1) {
        if (Math.hypot(gx + 0.5 - plaisirsSpot.x, gy + 0.5 - plaisirsSpot.y) <= R) plaisirsClear.add(gx + "," + gy);
      }
    }
  }
  // ── LES ÎLOTS (docs/PLAN-ILOTS.md, lot I1) ─────────────────────────────────
  // Posés ICI : assez tard pour connaître le fleuve définitif (bras de l'île) et
  // l'emprise des merveilles, assez tôt pour que tout ce qui suit (carves,
  // cellules, placement, desserte) voie leurs rues comme un réseau ordinaire.
  // Les rues entrent dans `memKeep` : aucun émondage ne touche une rue d'îlot.
  let ilot = null;
  if (ilotMode) {
    const wonderCells = new Set();
    for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
      const w = CM_WONDERS[wi];
      if (!builtWonderIds.has(w.id) || w.id === "era_mega") continue;
      cmForEachWonderCell(wonderSlots[wi], w.id, N, (gx, gy, k) => wonderCells.add(k), tierOf(w.id));
    }
    // La CAMPAGNE déjà posée (champs, moulins, port) tient ses cases : la ville
    // qui grandit l'entoure au lieu de la chasser (mesuré sans ça : 17 champs et
    // moulins passés sur l'autre rive d'un achat à l'autre).
    // Avec une MARGE de 3 cases : un champ qui gagne une case de long à l'achat
    // suivant doit la trouver libre, sinon il se refonde ailleurs (même mesure).
    const ruralCells = new Set();
    for (const [k, ow] of heldBy) {
      if (!ILOT_OUTSIDE_RE.test(ow)) continue;
      const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) ruralCells.add((x + dx) + "," + (y + dy));
    }
    const ruralHeld = (k) => ruralCells.has(k);
    // Le terre-plein du port de commerce, et la rangée juste derrière (sa rue
    // d'accès y part) : ni îlot ni rue d'îlot dessus.
    const tradeHeld = new Set();
    if (tradePort) {
      const dirT = tradePort.side === "N" ? 1 : -1;
      for (const [x, y] of tradeCells(tradePort)) tradeHeld.add(x + "," + y);
      for (let i = 0; i < tradePort.len; i += 1) tradeHeld.add((tradePort.x0 + i) + "," + (tradePort.edge[i] - dirT * tradePort.depth));
    }
    const bxI = Math.round(riverBridge.x);
    // LE GRAND FORUM (audit 2026-10-05, BUG-63) : une fiche d'avant agrandit son forum une
    // fois (`forumGrow`) ; les bâtiments qui tenaient les trois îlots gagnés sont relogés
    // aussitôt (`forumClaim`, evictOn plus bas) — rien d'autre ne bouge.
    const runIlots = (lawn) => {
      const il = runIlots0(lawn);
      if (il.forumClaim && il.forumClaim.length) evictOn(il.forumClaim);
      return il;
    };
    const runIlots0 = (lawn) => planIlots({
      N, cx, cy, core: plan.core, bx: bxI, forumGrow: ilotForumGrow,
      isWet: (x, y) => riverSet.has(x + "," + y),
      isBank: (x, y) => bankSet.has(x + "," + y),
      isReserved: (x, y) => { const k = x + "," + y; return wonderCells.has(k) || plaisirsClear.has(k) || tradeHeld.has(k); },
      isRural: (x, y) => ruralHeld(x + "," + y),
      isHeld: (x, y) => heldBy.has(x + "," + y),
      heldOwner: (x, y) => heldBy.get(x + "," + y) || null,
      isHold: lawn ? (x, y) => lawn.has(x + "," + y) : null,
      demand: ilotDemand,
      memory: s.cityCore && s.cityCore.ilot,
    });
    // ── L'AUTOROUTE DE L'ARTÈRE EN VILLE PAR ÎLOTS (audit 2026-10-05, BUG-16) ──
    // Elle avait disparu en silence des bandes 6 à 9 (son plan n'était calculé que sous
    // `townOn`). Choix A' de Raph : le tablier passe au-dessus du CARDO, qui tient les
    // colonnes de l'artère (bx, bx+1), SANS dégagement de part et d'autre — les rangées
    // des îlots sont déjà reculées derrière le trottoir. Seul l'ÉCHANGEUR prend du
    // terrain : ses pelouses (et un raccord éventuel) sont gardées hors lot par planIlots
    // (`isHold` : mêmes îlots, mêmes rues), et un bâtiment qui y tenait sa place est
    // relogé, une fois. Le croisement est figé dans s.cityCore.highway. Le plan lit les
    // rues d'îlots : la première pose d'un échangeur replanifie donc les îlots avec ses
    // pelouses — une seule fois par ville, le choix figé les donne ensuite d'emblée.
    const hwyOn = HIGHWAY.on && (c.eraBand | 0) >= HIGHWAY.band;
    const highwayOf = (il, fix) => {
      const blockCells = new Set(), plazaCells = new Set(), coreRows = [];
      for (const b of il.blocks) for (const q of b.cells) blockCells.add(q.x + "," + q.y);
      for (const p of il.plazas) {
        for (const q of p.block.cells) plazaCells.add(q.x + "," + q.y);
        if (p.kind === "centrale") for (let y = p.block.y0; y <= p.block.y1; y += 1) coreRows.push(y);
      }
      const inGrid = (x, y) => x >= 1 && y >= 1 && x < N - 1 && y < N - 1;
      const isWet = (x, y) => riverSet.has(x + "," + y) || bankSet.has(x + "," + y);
      // Le cardo du pont jusqu'au forum (rue de départ de planIlots) est de la ville
      // même là où aucun îlot ne le borde encore : un cœur loin du fleuve (mesuré : 100
      // cases, graine 0x51a7c0de) coupait sinon la rive à la première rangée nue.
      const oyI = Math.round(plan.core.y);
      let wTop = -1, wBot = -1;
      for (let y = 0; y < N; y += 1) if (isWet(bxI, y)) { if (wTop < 0) wTop = y; wBot = y; }
      const onSeed = (y) => wTop >= 0 && (oyI < wTop ? y >= oyI && y < wTop : oyI > wBot && y > wBot && y <= oyI);
      return planHighway({
        N, ax: bxI, cx, cy, band: c.eraBand | 0, coreRows, isWet,
        isRoad: (x, y) => il.streets.has(x + "," + y),
        // « Dans la ville » = un îlot ouvert de part et d'autre du cardo à cette hauteur.
        inCity: (x, y) => {
          if (onSeed(y)) return true;
          for (let dy = -1; dy <= 1; dy += 1) for (let dx = -6; dx <= 7; dx += 1) if (blockCells.has((bxI + dx) + "," + (y + dy))) return true;
          return false;
        },
        hard: (x, y) => {
          const k = x + "," + y;
          return !inGrid(x, y) || riverSet.has(k) || bankSet.has(k) || townReserve.has(k) || wonderCells.has(k) || plaisirsClear.has(k)
            || tradeHeld.has(k) || plazaCells.has(k) || ILOT_OUTSIDE_RE.test(heldBy.get(k) || "");
        },
        held: (x, y) => heldBy.has(x + "," + y),
        fix,
      });
    };
    // Pelouses + raccord d'un échangeur, ou null.
    const lawnOf = (H) => H && H.interchange ? new Set([...H.lawn, ...H.pave]) : null;
    const evictOn = (cells) => {
      if (!cells) return;
      const evicted = new Set();
      for (const k of cells) { const o = heldBy.get(k); if (o) evicted.add(o); }
      if (!evicted.size) return;
      const store = cmCityMapSlotsFor(s);
      for (const [k, o] of Array.from(heldBy)) if (evicted.has(o)) heldBy.delete(k);
      for (const o of evicted) delete store[o];
    };
    const hwyFix = hwyOn && s.cityCore && s.cityCore.highway ? s.cityCore.highway : null;
    let hwyLawn = null;
    if (hwyFix && (hwyFix.sign === 1 || hwyFix.sign === -1) && Number.isFinite(hwyFix.dy)) {
      hwyLawn = new Set(interchangeLawns(bxI, cy + hwyFix.dy, hwyFix.sign).map(([x, y]) => x + "," + y));
      evictOn(hwyLawn);
    }
    ilot = runIlots(hwyLawn);
    if (hwyOn) {
      highway = highwayOf(ilot, hwyFix);
      const lawn1 = lawnOf(highway);
      const same = (hwyLawn ? hwyLawn.size : 0) === (lawn1 ? lawn1.size : 0) && (!lawn1 || [...lawn1].every((k) => hwyLawn.has(k)));
      if (!same) {
        hwyLawn = lawn1;
        evictOn(hwyLawn);
        ilot = runIlots(hwyLawn);
        const ic = highway && highway.interchange;
        highway = highwayOf(ilot, ic ? { sign: ic.sign, dy: ic.yc - cy } : null);
      }
      if (highway && highway.interchange) {
        if (s.cityCore) s.cityCore.highway = { sign: highway.interchange.sign, dy: highway.interchange.yc - cy };
        // Les pelouses : jamais bâties, repeintes en herbe ; une rue d'îlot qui les
        // traverse reste une rue (la boucle passe au-dessus).
        for (const k of highway.lawn) { if (ilot.streets.has(k)) continue; townReserve.add(k); townGreen.add(k); }
      }
    }
    if (s.cityCore) s.cityCore.ilot = { v: ILOT_MEMORY_V, ...ilot.memory };
    for (const [k, m] of ilot.streets) {
      const e = roadMeta.get(k);
      if (e) { e.h = e.h || m.h; e.v = e.v || m.v; if (rankAbove(m.rank, e.rank)) e.rank = m.rank; }
      else {
        const ci = k.indexOf(",");
        roadMeta.set(k, { h: m.h, v: m.v, rank: m.rank });
        roads.push({ gx: +k.slice(0, ci), gy: +k.slice(ci + 1) });
        roadKey.add(k);
      }
      memKeep.add(k);
    }
    // Le RACCORD de l'échangeur (la rue transversale prolongée jusqu'au cardo, gardé
    // hors lot plus haut) — vide en pratique : une rue d'îlot touche déjà le cardo.
    if (highway && highway.interchange) {
      for (const k of highway.pave) {
        if (!roadKey.has(k)) { const ci = k.indexOf(","); roadKey.add(k); roads.push({ gx: +k.slice(0, ci), gy: +k.slice(ci + 1) }); roadMeta.set(k, { h: true, v: false, rank: "secondary" }); }
        memKeep.add(k);
      }
    }
    // Places : l'îlot entier devient place (rang `plaza`, comme les places du réseau).
    // `w`, `h` : l'emprise (une grande place n'est pas un carré de `size`, cf. cmRoadName).
    plan.plazas = ilot.plazas.map((p) => ({ gx: p.gx, gy: p.gy, size: p.size, kind: p.kind, w: p.block.x1 - p.block.x0 + 1, h: p.block.y1 - p.block.y0 + 1 }));
    for (const p of ilot.plazas) {
      for (const c2 of p.block.cells) {
        const k = c2.x + "," + c2.y;
        if (!roadKey.has(k)) { roads.push({ gx: c2.x, gy: c2.y }); roadKey.add(k); }
        roadMeta.set(k, { h: true, v: true, rank: "plaza" });
        memKeep.add(k);
      }
    }
    // La rue du port de commerce, maintenant que les rues d'îlots existent : elle
    // rejoint la plus proche sans traverser un îlot.
    if (tradePort) {
      const inner = new Set();
      for (const b of ilot.blocks) for (const c2 of b.cells) inner.add(c2.x + "," + c2.y);
      routeTradePort(inner);
    }
  }
  // FOYER DU CAMPEMENT (cf. CAMP_HEARTH) : la cellule du cœur et ses huit
  // voisines sont gardées de tout bâti et de tout arbre, AVANT la pose — sinon
  // une tente se plantait dans le cercle du feu (1,4 tuile de large). Même
  // geste que le domaine des Plaisirs, mais PAS pour les routes : les sentiers du
  // camp doivent pouvoir converger sur le feu. Le cœur est tenu au sec
  // (CORE_DRY_RADIUS = 2), donc les neuf cellules le sont aussi.
  const hearthCell = ((c.eraBand | 0) <= CAMP_HEARTH.lastBand && CAMP_HEARTH.on)
    ? (centralSite ? hearthOfSite(centralSite) : { gx: Math.floor(plan.core.x), gy: Math.floor(plan.core.y) }) : null;
  const hearthClear = new Set();
  if (hearthCell) {
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) hearthClear.add((hearthCell.gx + dx) + "," + (hearthCell.gy + dy));
  }
  // LE FEU DEVIENT LA PLACE (lot L3) : tant que la place centrale n'est pas
  // ouverte, son site est gardé libre de tout bâti — comme le cercle du feu, qu'il
  // englobe. Au bourg, la place s'ouvre là, sans chasser personne. Les sentiers y
  // passent librement (même statut que le foyer). Une cellule déjà TENUE par un
  // bâtiment (save d'avant ce lot) n'est pas réservée : on ne déloge pas.
  // Structure de ville (lots L6-L8) : les sites de place, même statut.
  for (const k of townReserve) hearthClear.add(k);
  if (!townOn && plan.centralSite && !(plan.plazas || []).some((p) => p.kind === "centrale")) {
    const site = plan.centralSite, half = Math.floor(site.size / 2);
    for (let dx = -half; dx < site.size - half; dx += 1) for (let dy = -half; dy < site.size - half; dy += 1) {
      const k = (site.gx + dx) + "," + (site.gy + dy);
      if (!heldBy.has(k) && !frozenWonderCells.has(k) && !corridorAt(site.gx + dx, site.gy + dy)) hearthClear.add(k);
    }
  }
  // La vie RURALE (cf. CAMP_LIFE) : là où il y a un foyer, camp et village —
  // sentiers qui convergent sur le feu, terre battue et forêt qui suivent la
  // vie. Le CAMP (bande 0) y ajoute ses tentes autour du feu, espacées, et pas de
  // maisons de réserve ; le village de huttes garde son placement le long des
  // chemins (ses ~160 maisons ne tiennent pas dans l'emprise avec les écarts du
  // camp, qui en divisent la capacité par deux).
  const ruralLife = !!hearthCell && CAMP_LIFE.on;
  const campLife = ruralLife && (c.eraBand | 0) === 0;
  // Pas d'habitation sur les TÊTES DU PONT, à toutes les ères : le tablier déborde
  // d'une cellule sur chaque berge et son garde-corps d'une de plus à l'écran ; une
  // tente posée contre l'approche se dessinait dessus, en travers de la sortie du
  // pont (vu à la capture du camp, jusqu'à deux colonnes de côté), et une maison
  // de bourg de même (bande 2).
  const bridgeHeadClear = new Set();
  if (CAMP_LIFE.on && riverBridge) {
    const bx = Math.round(riverBridge.x);
    let wy0 = N, wy1 = -1;
    for (const k of riverSet) {
      const cc = k.indexOf(",");
      const kx = +k.slice(0, cc);
      if (kx < bx || kx >= bx + bridgeLaneW) continue;
      const gy = +k.slice(cc + 1);
      if (gy < wy0) wy0 = gy;
      if (gy > wy1) wy1 = gy;
    }
    if (wy1 >= wy0) {
      for (let gx = bx - 2; gx <= bx + bridgeLaneW + 1; gx += 1) {
        for (let d = 1; d <= 3; d += 1) { bridgeHeadClear.add(gx + "," + (wy0 - d)); bridgeHeadClear.add(gx + "," + (wy1 + d)); }
      }
    }
  }

  // Emprise des merveilles sèches (anti-collision). wonderSlots/builtWonderIds sont
  // calculés plus haut. (Les GRANDS ENSEMBLES civiques — keep, forum, palais,
  // arcologie… — n'existaient plus que sous `__ilots(false)` : partis avec l'ancien
  // placement et leur dessin isoDistricts, audit 2026-10-05, MORT-4. En ville par
  // îlots, les halles des bâtiments achetés tiennent chacune un îlot : c'est déjà la
  // hiérarchie du bâti.)
  const occupiedFoot = new Set();
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const w = CM_WONDERS[wi];
    if (!builtWonderIds.has(w.id) || w.id === "era_mega") continue; // era_mega : dans l'eau
    cmForEachWonderCell(wonderSlots[wi], w.id, N, (gx, gy, k) => occupiedFoot.add(k), tierOf(w.id));
  }

  // Zone réservée (merveilles)
  const reserved = new Set();
  // wonderGround = les cellules d'emprise des MERVEILLES : le rendu du sol y pose
  // un PARVIS dédié, distinct du sol urbain.
  const wonderGround = new Set();
  const wonderPaveR = {};   // demi-côté pavé par merveille (structure de ville)
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const w = CM_WONDERS[wi];
    if (!builtWonderIds.has(w.id) || w.id === "era_mega") continue;
    // PARVIS À LA TAILLE DU SOCLE (structure de ville, Raph 2026-10-01 : « mieux
    // les centrer sur leur parvis »). L'emprise réservée suit toujours la HAUTEUR
    // du sprite (rien ne doit percer derrière lui), mais seule une esplanade autour
    // du SOCLE est pavée — demi-côté = demi-socle + 1,5 case ; le reste de
    // l'emprise est une pelouse (townGreen). Le monument, posé socle centré (cf.
    // wonderFootWorld, L.wonderPaveR), se tient au milieu d'une place à sa mesure
    // au lieu de flotter dans un carré gris taillé pour sa silhouette.
    const paveR = Math.ceil(cmWonderBaseTiles(w.id, tierOf(w.id) || 1) / 2 + 1.5);
    wonderPaveR[w.id] = paveR;
    const sl = wonderSlots[wi];
    cmForEachWonderCell(sl, w.id, N, (gx, gy, k) => {
      reserved.add(k);
      if (Math.max(Math.abs(gx - sl.gx), Math.abs(gy - sl.gy)) <= paveR) wonderGround.add(k);
      else townGreen.add(k);
    }, tierOf(w.id));
  }
  // ── Carve : aucune ROUTE sous l'emprise d'une merveille sèche. Les routes sont
  //    figées avant le calcul des slots ; on retire ici les cellules qui tombent
  //    sous le sprite. Placé AVANT trim + connectBuildings (plus loin) : ceux-ci
  //    recousent le réseau (antenne coupée = feuille émondée ; les bâtiments se
  //    reconnectent par BFS en contournant l'emprise via occupiedFoot). era_mega
  //    épargnée (pont/fleuve). Le sol dégagé est indépendamment géré (reserved →
  //    pas de bâtiment/arbre ; surface de place gatée au rendu).
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const w = CM_WONDERS[wi];
    if (!builtWonderIds.has(w.id) || w.id === "era_mega") continue;
    // Structure de ville : seul le PARVIS PAVÉ est dégagé des routes (la pelouse
    // autour est plate, une rue peut la border ou la traverser), et JAMAIS
    // l'artère. Mesuré : la Colonne, montée au rang 4, étendait son emprise sur le
    // débouché sud du pont — la découpe effaçait l'artère, toute la rive sud se
    // retrouvait coupée du réseau et l'élagage de connexité rasait ses rues.
    const sl = wonderSlots[wi], pr = wonderPaveR[w.id];
    cmForEachWonderCell(sl, w.id, N, (gx, gy, k) => {
      if (isBridgeSpanCell(gx, k)) return; // JAMAIS carver la travée du pont central sanctuarisé
      if (Math.max(Math.abs(gx - sl.gx), Math.abs(gy - sl.gy)) > pr) return;
      if (townOn && arteryAx != null && (gx === arteryAx || gx === arteryAx + 1)) return;
      if (roadKey.has(k)) { roadKey.delete(k); roadMeta.delete(k); }
    }, tierOf(w.id));
  }
  // ── LES BÂTIMENTS DÉJÀ POSÉS TIENNENT LEUR PLACE (lot L2) ───────────────────
  // Mesuré avec la seule mémoire des rues : les rues ne disparaissaient plus,
  // mais à chaque ère la MOITIÉ des bâtiments déménageait (slot refusé : un
  // échafaudage de placement posé dessus, un atelier voisin qui l'avait pris en
  // grossissant…). Chaque déménagement laissait derrière lui un chemin mémorisé
  // qui ne menait plus nulle part, et la ville s'étouffait sous ses propres
  // sentiers (à l'ère 9, 117 maisons posées au lieu de 235). La mémoire des rues
  // n'a de sens que si les bâtiments en ont une aussi.
  //   - chaque slot du cycle TIENT ses cellules : seul son propriétaire peut les
  //     reprendre (`heldBy`, lu par footprintFits) ;
  //   - les maisons d'abord, les moteurs ensuite : un atelier qui grossit et
  //     déborde sur une maison ne la chasse pas, c'est lui qui cherche un lot ;
  //   - l'échafaudage de placement (dissous plus bas de toute façon) ne se pose
  //     jamais sur une cellule tenue.
  for (const k of heldBy.keys()) {
    if (!roadKey.has(k) || memKeep.has(k)) continue;
    const m = roadMeta.get(k);
    if (m && m.rank === "plaza") continue;
    if (riverSet.has(k) || bankSet.has(k)) continue;           // travée/abord de pont
    roadKey.delete(k); roadMeta.delete(k);
    if (skeletonKey) skeletonKey.delete(k);
  }
  // Propriétaire de la pose en cours (cf. heldBy) : posé par placeRequest et par
  // decCellFree, lu par footprintFits. null = pose sans propriétaire.
  let placingOwner = null;
  const heldByOther = (k) => { const o = heldBy.get(k); return !!o && o !== placingOwner; };
  { // compacte `roads` en cohérence avec roadKey (même geste que trimDemandlessRoads)
    const kept = roads.filter((r) => roadKey.has(r.gx + "," + r.gy));
    roads.length = 0; for (const r of kept) roads.push(r);
  }
  lp("reserve");

  // Cellules (bâtissables + arbres)
  // Seuil des jardins : le bruit lissé n'est pas uniforme (moyenne de 4 hachés),
  // sa part sous un seuil s se lit sur la fonction de répartition mesurée
  // (9e4 cellules, grappes de 4) — 20 % ↔ 0,292 ; 25 % ↔ 0,331 ; 30 % ↔ 0,367.
  const gardenThr = 0.292 + (gardenShareFor(c.eraBand) - 0.2) * 0.75;
  const cells = [];
  const quarterScore = (cell) => quarterAnchors.reduce((best, q) => {
    const qd = Math.hypot((cell.gx + 0.5) - q.gx, (cell.gy + 0.5) - q.gy);
    return Math.max(best, Math.max(0, q.r * 1.35 - qd) / Math.max(1, q.r) * q.strength);
  }, 0);
  for (let gx = 0; gx < N; gx += 1) {
    for (let gy = 0; gy < N; gy += 1) {
      // L'emprise d'abord (tests purs, l'ordre ne change rien) : hors la ville, sa
      // sortie anticipée évite la clé texte et les six lectures de Set.
      if (!organicLimit(gx, gy, 0.8)) continue;
      const key = gx + "," + gy;
      if (roadKey.has(key) || riverSet.has(key) || bankSet.has(key) || reserved.has(key)) continue;
      if (plaisirsClear.has(key)) continue;                 // domaine des Plaisirs
      if (hearthClear.has(key)) continue;                   // foyer du campement
      const dx = gx - cx, dy = gy - cy;
      const score = organicScore({ gx, gy });
      const noise = (cmHash("green:" + (gx - fx0) + ":" + (gy - fy0) + ":" + mapSeed) % 100) / 100;
      // Espaces verts/vides : pilotés par la config d'âge et la personnalité
      // (une cité fastueuse garde ses jardins, une mégalopole bétonne tout).
      const parkBase = ageCfg.parkChance * (personality.treeMul || 1);
      // S5 : le clump s'applique APRÈS le clamp — un bosquet a le droit de dépasser
      // 0,45 localement, c'est ce qui en fait une masse. Moyenne 1, donc le NOMBRE de
      // cellules vertes est conservé : elles se regroupent au lieu de s'éparpiller.
      // Enjeu supplémentaire ici : une cellule verte est RETIRÉE du pool bâtissable
      // (`.filter(cc => !cc.green)` juste en dessous), donc un semis en poivre-et-sel
      // PERFORAIT les rangées de maisons une cellule à la fois.
      const parkChance = Math.max(0.05, Math.min(0.45, parkBase * 0.55 + Math.max(0, score - 0.58) * 0.42))
        * cmClumpK(gx - fx0, gy - fy0);
      // JARDINS et CEINTURE VERTE (lot L8, choix de Raph) : à partir du village,
      // des grappes de jardins entre les maisons et une bande d'herbe sur la
      // frontière entre deux quartiers. Ni l'un ni l'autre le long de l'artère :
      // la grand-rue garde ses façades. Déterministe (bruit haché), donc stable.
      let townG = false;
      if (townOn && (c.eraBand | 0) >= 1 && Math.abs(gx - arteryAx - 0.5) > 2) {
        // ⚠ Bruit lu dans le repère du CENTRE DE GRILLE (celui des slots) : en
        // coordonnées absolues, le motif glissait sous les maisons à chaque
        // agrandissement de la grille (mesuré : 84 maisons « dans » un jardin à
        // l'ère 14, dont 16 seulement y étaient nées).
        townG = gardenNoise(gx - cx, gy - cy, mapSeed, CITY_QUARTERS.gardenScale) < gardenThr
          || onBelt(gx, gy, townCenters, CITY_QUARTERS.beltW, CITY_QUARTERS.beltMinD);
        if (townG) { townGreen.add(key); townGardens.add(key); }
      }
      cells.push({ gx, gy, d2: dx * dx + dy * dy, score, green: townG || noise < parkChance });
    }
  }
  // Décore-trie-retire : score calculé une seule fois par cellule (les
  // comparateurs avec boucle d'ancres rendaient le tri quadratique en pratique).
  // Camp (cf. CAMP_LIFE) : pas de « parcs » réservés — le vide d'un camp est
  // déjà l'écart entre les tentes (CAMP_TENT_GAP). Les garder divisait la place
  // disponible par deux une seconde fois.
  const buildable = cells
    .filter((cc) => campLife || !cc.green)
    .map((cc) => ({ cc, s: cc.score * 100 + cc.d2 * 0.012 - quarterScore(cc) * 15 + (cmHash("build:" + (cc.gx - fx0) + ":" + (cc.gy - fy0)) % 17) / 40 }))
    .sort((a, b) => a.s - b.s)
    .map((e) => e.cc);
  lp("cellules");

  const tiles = [], usedKeys = new Set();

  // ── Placement par catégorie : quartiers, rues, places, personnalité ──────
  const placer = createBuildingPlacer({
    cells: buildable, plan, roadKey, counts: c, personality, ageCfg,
    seed: mapSeed, nearSet, N, requireRoad: true,
    // Camp : les tentes se posent autour du feu (cf. CAMP_LIFE).
    campRing: campLife ? { x: hearthCell.gx + 0.5, y: hearthCell.gy + 0.5, ringK: CAMP_LIFE.ringK, jitterK: CAMP_LIFE.jitterK } : null
  });
  // Multiplicateurs de personnalité : une cité agricole a plus de champs,
  // une cité savante plus de lieux de savoir... (bornés par les caps d'ère)
  const biasedCount = (n, mul) => Math.max(0, Math.round(n * (mul || 1)));

  // Emprises moteur (bâtiments achetés) — réservées avant les tuiles décoratives
  const claimed = new Set(), engineFootprint = new Set();
  // `districtWalk` : des cellules tenues À PART — interdites aux bâtiments
  // (claimed), TRAVERSABLES par la desserte (cf. connectBuildingsToNetwork). Le nom
  // vient des grands ensembles, partis (MORT-4) ; il ne reste que le foyer, plus bas.
  const districtWalk = new Set();
  // Même geste pour le domaine des Plaisirs : `footprintFits` ne teste que
  // `claimed`, sans ça un port ou un moulin viendrait se coller au monument.
  for (const k of plaisirsClear) claimed.add(k);
  // Foyer du campement : interdit au bâti, TRAVERSABLE par la desserte — les
  // sentiers convergent sur le feu (cf. CAMP_LIFE). En obstacle, il emmurait la
  // racine du réseau, qui est au cœur.
  for (const k of hearthClear) { claimed.add(k); if (ruralLife) districtWalk.add(k); }
  // L'emprise des merveilles sèches bloque aussi les bâtiments-moteur (aqueducs,
  // champs, ports/moulins, banques, génériques) : footprintFits ne teste que
  // `claimed`. era_mega exclue (riverains de l'Aiguille légitimes sur la berge).
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const w = CM_WONDERS[wi];
    if (!builtWonderIds.has(w.id) || w.id === "era_mega") continue;
    cmForEachWonderCell(wonderSlots[wi], w.id, N, (gx, gy, k) => claimed.add(k), tierOf(w.id));
  }
  const footprintFits = (gx, gy, sizeX, allowBank = false, allowRoad = false, sizeY = sizeX, allowWater = false) => {
    if (gx < 0 || gy < 0 || gx + sizeX > N || gy + sizeY > N) return false;
    for (let ax = 0; ax < sizeX; ax += 1) for (let ay = 0; ay < sizeY; ay += 1) {
      const key = (gx + ax) + "," + (gy + ay);
      if (claimed.has(key) || (!allowRoad && roadKey.has(key))) return false;
      if (heldByOther(key)) return false;
      if (!allowWater && riverSet.has(key)) return false;
      if (!allowBank && bankSet.has(key)) return false;
    }
    return true;
  };
  const claimFootprint = (gx, gy, sizeX, sizeY = sizeX) => {
    for (let ax = 0; ax < sizeX; ax += 1) for (let ay = 0; ay < sizeY; ay += 1) claimed.add((gx + ax) + "," + (gy + ay));
  };
  // PORTE NON-RÉSERVÉE : au moins une cellule du pourtour orthogonal qui ne soit
  // ni réservée (claimed — parvis, foyer, domaine des Plaisirs, emprises déjà
  // posées) ni de l'eau. Une ROUTE compte : c'est un accès. Sans cette garde, un
  // moteur peut se poser TOUTES portes sur un terrain vague réservé — libre à
  // l'œil, interdit à la pioche — et la desserte ne le voit plus jamais : ni
  // carve, ni vague de voirie (roadWorksInfo le croyait « done »). Cas réel :
  // l'académie orpheline du replay `roadDesserte`, exposée quand les routes
  // sillonnantes ont rebattu les placements. La garde vaut AU PLACEMENT : un
  // mur de bâtiments qui se referme APRÈS reste le cas « muré », toléré et lu
  // comme un intérieur d'îlot.
  const hasFreeDoor = (gx, gy, sizeX, sizeY = sizeX) => {
    const ok = (x, y) => x >= 0 && y >= 0 && x < N && y < N
      && !claimed.has(x + "," + y) && !riverSet.has(x + "," + y) && !bankSet.has(x + "," + y);
    for (let ax = 0; ax < sizeX; ax += 1) { if (ok(gx + ax, gy - 1) || ok(gx + ax, gy + sizeY)) return true; }
    for (let ay = 0; ay < sizeY; ay += 1) { if (ok(gx - 1, gy + ay) || ok(gx + sizeX, gy + ay)) return true; }
    return false;
  };
  // Côté (N/S/E/W) par lequel une emprise sizeX×sizeY touche le FLEUVE (cellules
  // d'eau, pas la berge) — sert à orienter le sprite riverain vers le vrai cours
  // d'eau. Renvoie le bord le plus mouillé, ou null si l'emprise ne borde pas
  // l'eau (donc pas un vrai riverain : candidat à rejeter).
  const footprintWaterSide = (gx, gy, sizeX, sizeY) => {
    let n = 0, s = 0, e = 0, w = 0;
    for (let ax = 0; ax < sizeX; ax += 1) {
      if (riverSet.has((gx + ax) + "," + (gy - 1)))     n += 1;
      if (riverSet.has((gx + ax) + "," + (gy + sizeY))) s += 1;
    }
    for (let ay = 0; ay < sizeY; ay += 1) {
      if (riverSet.has((gx - 1) + "," + (gy + ay)))      w += 1;
      if (riverSet.has((gx + sizeX) + "," + (gy + ay)))  e += 1;
    }
    const m = Math.max(n, s, e, w);
    if (m === 0) return null;
    // Égalités tranchées vers le bas (S) : c'est l'orientation native du sprite.
    if (m === s) return "S";
    if (m === n) return "N";
    if (m === e) return "E";
    return "W";
  };
  // Listes de base par pool (recalculées une fois par taille, pas par requête).
  // Le pool dépend de l'affinité à l'eau (on/bank/near → cellules d'eau/rive)
  // OU, à défaut, de la zone terrestre (outside vs buildable).
  const engineBaseCache = new Map();
  const fitsGrid = (cell, size) => cell.gx >= 0 && cell.gy >= 0 && cell.gx + size <= N && cell.gy + size <= N;
  const cellsFromSet = (set, size) => Array.from(set).map((k) => {
    const cma = k.indexOf(",");
    return { gx: +k.slice(0, cma), gy: +k.slice(cma + 1) };
  }).filter((cell) => fitsGrid(cell, size));
  const engineBaseFor = (zone, affinity, size) => {
    const waterAffine = cmWaterAffine(affinity);
    const cacheKey = (waterAffine ? "w:" + affinity : "z:" + zone) + ":" + size;
    let base = engineBaseCache.get(cacheKey);
    if (base) return base;
    if (affinity === "on")        base = cellsFromSet(riverSet, size);
    else if (affinity === "bank") base = cellsFromSet(new Set([...Array.from(nearSet), ...Array.from(bankSet)]), size);
    else if (affinity === "near") base = cellsFromSet(nearSet, size);
    else if (zone === "outside")  base = cells.filter((cell) => fitsGrid(cell, size));
    else                          base = buildable;
    engineBaseCache.set(cacheKey, base);
    return base;
  };
  // ── Géométrie de pool, calculée UNE fois et partagée par les instances ──────
  // Le placement à froid (slots vides = 1er layout d'un cycle) dominait tout :
  // 558 ms sur 756 mesurés au profileur à 29 types × 64 achats, soit 74 % du
  // layout. Cause : engineCandidates refaisait un Math.hypot, un Math.atan2 et
  // deux Math.imul PAR CELLULE, pour CHACUNE des ~700 instances — alors que ces
  // trois grandeurs ne dépendent QUE de la cellule. Le score de toutes les zones
  // terrestres se décompose en `radial(cellule) + poids × écart_angulaire` : seuls
  // l'écart angulaire et le grain dépendent de l'instance.
  //
  // ⚠ L'ORDRE des additions est reproduit à l'identique zone par zone (radB avant
  // ou après le terme angulaire selon la zone, cf. gyFirst). Ce n'est pas du zèle :
  // le score départage des cellules candidates, et réassocier les flottants peut
  // renverser une égalité, donc déplacer un bâtiment. On optimise le COÛT, jamais
  // la disposition.
  const ZONE_W = { center: 1.8, mid: 2.4, caravan: 1.4, edge: 2, outside: 1.2, knowledge: 2, ruin: 1.5 };
  const engineGeoCache = new Map();
  const engineGeoFor = (zone, affinity, size, cacheKey) => {
    let g = engineGeoCache.get(cacheKey);
    if (g) return g;
    const base = engineBaseFor(zone, affinity, size);
    const n = base.length, half = size / 2;
    const ang = new Float64Array(n), radA = new Float64Array(n), radB = new Float64Array(n), h = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      const cell = base[i];
      const px = cell.gx + half, py = cell.gy + half;
      const dist = Math.hypot(px - cx, py - cy);
      ang[i] = Math.atan2(py - cy, px - cx);
      h[i] = Math.imul(cell.gx | 0, 73856093) ^ Math.imul(cell.gy | 0, 19349663);
      // « sown » garde la distance BRUTE : son rayon cible dépend de l'instance
      // (cmSownFrac), l'écart se prend dans engineCandidates.
      if (zone === "center" || zone === "sown") { radA[i] = dist; }
      else if (zone === "mid")       { radA[i] = Math.abs(dist - N * 0.24); }
      else if (zone === "caravan")   { radA[i] = Math.abs(dist - N * 0.38); }
      else if (zone === "edge")      { radA[i] = Math.abs(dist - N * 0.44); radB[i] = Math.max(0, cell.gy - cy) * 0.02; }
      else if (zone === "outside")   { radA[i] = Math.abs(dist - N * 0.48); radB[i] = Math.max(0, cy - cell.gy) * 0.025; }
      else if (zone === "knowledge") { radA[i] = Math.abs(dist - N * 0.28); radB[i] = Math.max(0, cell.gy - cy) * 0.01; }
      else if (zone === "ruin")      { radA[i] = Math.abs(dist - N * 0.4);  radB[i] = Math.max(0, cy - cell.gy) * 0.018; }
      else                           { radA[i] = Math.abs(dist - N * 0.42); }
    }
    // « outside » est la SEULE zone à poser son terme de latitude AVANT le terme
    // angulaire — d'où le drapeau plutôt qu'un ordre unique.
    g = { base, ang, radA, radB, h, w: ZONE_W[zone] ?? 1.8, gyFirst: zone === "outside" };
    engineGeoCache.set(cacheKey, g);
    return g;
  };
  // Tampon de scores RÉUTILISÉ. Il était alloué par appel : à 1204 instances ×
  // ~25 000 cellules en fin de partie, cela faisait ~240 Mo de Float64Array jetés
  // au ramasse-miettes pour un seul layout. Les appels sont synchrones et ne
  // s'imbriquent pas, donc un seul tampon suffit ; on ne lit jamais au-delà de n.
  let _engKeys = null;
  const engineKeyBuf = (n) => {
    if (!_engKeys || _engKeys.length < n) _engKeys = new Float64Array(n);
    return _engKeys;
  };
  // Fonction chaude (une exécution par bâtiment moteur × toutes les cellules) :
  // clés dans un Float64Array + argsort d'indices, jitter par hash entier —
  // pas d'objets temporaires ni de hash de chaîne par cellule.
  const engineCandidates = (zone, affinity, size, id, index = 0, total = 1,
    limit = ((import.meta.env?.DEV && typeof globalThis !== "undefined" && globalThis.__engineTopK) || 1024)) => {
    const _t0 = (typeof globalThis !== "undefined" && globalThis.__layoutProfile) ? performance.now() : 0;
    const waterAffine = cmWaterAffine(affinity);
    const idHash = cmHash(id + ":" + index) >>> 0;
    const angleTarget = (Math.PI * 2 * index) / Math.max(1, total) + (cmHash(id) % 628) / 100;
    // Zone « sown » (cf. cmRequestZone) : la cible est un POINT — rayon propre à
    // l'instance, pris dans la silhouette de la ville dans la direction visée — et
    // le terme angulaire compte en LONGUEUR D'ARC (½ par case), sinon l'atelier
    // glisserait d'une quinzaine de cases le long de son cercle au gré du grain.
    // Écart d'angle replié proprement dans [0, π] : angleTarget dépasse 2π.
    const sown = zone === "sown";
    const sownR = sown ? cmSownFrac(id, index) * plan.reachFor(cityReachBase, angleTarget) : 0;
    const sownW = Math.max(2.4, sownR * 0.5);
    const sownGap = (a) => { let d = (a - angleTarget) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; return d > Math.PI ? Math.PI * 2 - d : d; };
    let base, keys, n;
    // Bascule d'équivalence (A/B) : `globalThis.__engineGeoCache = false` rejoue le
    // scoring d'origine, cellule par cellule. Sert à prouver que le cache produit
    // une ville IDENTIQUE, pas seulement plus vite.
    const legacy = (import.meta.env?.DEV && typeof globalThis !== "undefined" && globalThis.__engineGeoCache === false);
    if (legacy) {
      base = engineBaseFor(zone, affinity, size);
      const half = size / 2;
      n = base.length;
      keys = engineKeyBuf(n);
      for (let i = 0; i < n; i += 1) {
        const cell = base[i];
        const px = cell.gx + half, py = cell.gy + half;
        const dist = Math.hypot(px - cx, py - cy);
        let angular = Math.abs(Math.atan2(py - cy, px - cx) - angleTarget);
        if (angular > Math.PI) angular = Math.PI * 2 - angular;
        const jitter = (((Math.imul(cell.gx | 0, 73856093) ^ Math.imul(cell.gy | 0, 19349663) ^ idHash) >>> 0) % 1000) / 1000;
        let k;
        if (waterAffine || zone === "river") k = Math.abs(py - riverYAt(px)) + Math.abs(px - (cx + (index - total / 2) * 4)) * 0.22;
        else if (zone === "center")    k = dist + angular * 1.8;
        else if (sown)                 k = Math.abs(dist - sownR) + sownGap(Math.atan2(py - cy, px - cx)) * sownW;
        else if (zone === "mid")       k = Math.abs(dist - N * 0.24) + angular * 2.4;
        else if (zone === "caravan")   k = Math.abs(dist - N * 0.38) + angular * 1.4;
        else if (zone === "edge")      k = Math.abs(dist - N * 0.44) + angular * 2 + Math.max(0, cell.gy - cy) * 0.02;
        else if (zone === "outside")   k = Math.abs(dist - N * 0.48) + Math.max(0, cy - cell.gy) * 0.025 + angular * 1.2;
        else if (zone === "knowledge") k = Math.abs(dist - N * 0.28) + angular * 2 + Math.max(0, cell.gy - cy) * 0.01;
        else if (zone === "ruin")      k = Math.abs(dist - N * 0.4) + angular * 1.5 + Math.max(0, cy - cell.gy) * 0.018;
        else                           k = Math.abs(dist - N * 0.42) + angular * 1.8;
        keys[i] = k + jitter;
      }
    } else if (waterAffine || zone === "river") {
      // Riverains : le score dépend de l'INSTANCE (fil du courant + décalage par
      // index) donc rien n'est mutualisable — et ils sont une poignée. Boucle
      // d'origine, inchangée.
      base = engineBaseFor(zone, affinity, size);
      const half = size / 2;
      n = base.length;
      keys = engineKeyBuf(n);
      for (let i = 0; i < n; i += 1) {
        const cell = base[i];
        const px = cell.gx + half, py = cell.gy + half;
        const jitter = (((Math.imul(cell.gx | 0, 73856093) ^ Math.imul(cell.gy | 0, 19349663) ^ idHash) >>> 0) % 1000) / 1000;
        keys[i] = Math.abs(py - riverYAt(px)) + Math.abs(px - (cx + (index - total / 2) * 4)) * 0.22 + jitter;
      }
    } else {
      const g = engineGeoFor(zone, affinity, size, "z:" + zone + ":" + size);
      const ang = g.ang, radA = g.radA, radB = g.radB, gh = g.h, w = g.w, gyFirst = g.gyFirst;
      base = g.base;
      n = base.length;
      keys = engineKeyBuf(n);
      if (sown) {
        for (let i = 0; i < n; i += 1) {
          const jitter = (((gh[i] ^ idHash) >>> 0) % 1000) / 1000;
          keys[i] = Math.abs(radA[i] - sownR) + sownGap(ang[i]) * sownW + jitter;
        }
      } else for (let i = 0; i < n; i += 1) {
        let angular = Math.abs(ang[i] - angleTarget);
        if (angular > Math.PI) angular = Math.PI * 2 - angular;
        const jitter = (((gh[i] ^ idHash) >>> 0) % 1000) / 1000;
        keys[i] = (gyFirst ? radA[i] + radB[i] + angular * w : radA[i] + angular * w + radB[i]) + jitter;
      }
    }
    // Compteurs de diagnostic (uniquement sous __layoutProfile) : appels, cellules
    // scorées, et répartition score/sélection. Sans eux on optimise à l'aveugle.
    const _dbg = (import.meta.env?.DEV && typeof globalThis !== "undefined" && globalThis.__layoutProfile) ? globalThis.__engCand : null;
    if (_dbg) { _dbg.calls += 1; _dbg.cells += n; _dbg.scoreMs += performance.now() - _t0; }
    const _t1 = _dbg ? performance.now() : 0;
    // Sélection top-K (tas max) : on n'a besoin que des ~meilleures cellules,
    // trier les dizaines de milliers d'autres serait du travail perdu.
    const K = Math.min(n, limit);
    if (K === n) {
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i += 1) idx[i] = i;
      idx.sort((a, b) => keys[a] - keys[b]);
      const out = new Array(n);
      for (let i = 0; i < n; i += 1) out[i] = base[idx[i]];
      if (_dbg) { _dbg.heapMs += performance.now() - _t1; _dbg.full += 1; }
      return out;
    }
    const heap = new Uint32Array(K);
    let heapSize = 0;
    const siftUp = (i) => {
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[heap[p]] >= keys[heap[i]]) break;
        const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
      }
    };
    const siftDown = () => {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heapSize && keys[heap[l]] > keys[heap[m]]) m = l;
        if (r < heapSize && keys[heap[r]] > keys[heap[m]]) m = r;
        if (m === i) break;
        const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
      }
    };
    for (let i = 0; i < n; i += 1) {
      if (heapSize < K) { heap[heapSize] = i; heapSize += 1; siftUp(heapSize - 1); }
      else if (keys[i] < keys[heap[0]]) { heap[0] = i; siftDown(); }
    }
    const idx = heap.slice(0, heapSize);
    idx.sort((a, b) => keys[a] - keys[b]);
    const out = new Array(idx.length);
    for (let i = 0; i < idx.length; i += 1) out[i] = base[idx[i]];
    if (_dbg) _dbg.heapMs += performance.now() - _t1;
    return out;
  };

  const slotStore      = cmCityMapSlotsFor(s);
  const cycleSlotPrefix= `${s.cycles || 0}:`;
  const liveSlotKeys   = new Set();
  const requests       = [];
  for (const meta of CM_MAP_BUILDINGS) {
    const level = Math.floor((s.buildings && s.buildings[meta.id]) || 0);
    if (level <= 0) continue;
    const instances = cmEngineInstances(level, meta.id);
    for (let ei = 0; ei < instances.length; ei += 1) {
      const groupLevel = instances[ei];
      requests.push({ meta, level, groupLevel, groupIndex: ei + 1, groupTotal: instances.length, zone: cmRequestZone(meta, ei),
        tier: cmEngineTier(groupLevel), size: cmEngineGroupFoot(meta.id, groupLevel, ei), slotKey: cmMapSlotKey(s.cycles, meta.id, ei) });
    }
  }
  const placedSlotKeys = new Set();
  // Cellules des points d'eau DÉJÀ posés dans ce layout — c'est contre elles que
  // se mesure l'écart minimal (cf. `spaced` plus bas). Accumule sur les DEUX
  // passes (slots mémorisés puis placement neuf) : un point rappelé par son slot
  // compte autant qu'un point fraîchement posé pour repousser les suivants.
  const waterPointCells = [];
  // Centres des instances DÉJÀ posées, par type : c'est contre eux que se mesure
  // l'écart minimal entre deux bâtiments d'un même métier (cf. ENGINE_SPREAD).
  const sameTypeCells = new Map();
  // LE TERROIR posé par la branche des champs (docs/PLAN-TERROIR.md) : ses
  // parcelles, puis — à la demande — les rangées où s'alignent les moulins.
  let terroir = null;
  // Les RANGÉES DE MOULINS, calculées une fois par layout. Rangée r = les cellules
  // à distance de Chebyshev 1 + 2r du terroir (la 2r+2 reste libre : un chemin
  // entre deux rangées), côté CAMPAGNE seulement (dos à la ville). Dans une
  // rangée, une cellule sur deux au plus (jamais deux moulins jointifs, même en
  // diagonale), puis ordonnées depuis le milieu du bord extérieur : les premiers
  // achats tombent au centre de la crête, les suivants s'en écartent tour à tour.
  // Les côtés tournés vers la ville ne viennent qu'en dernier recours.
  const terroirRows = () => {
    if (terroir.rows) return terroir.rows;
    const P = terroir.parcels;
    const dist = (x, y) => {
      let d = Infinity;
      for (const p of P) {
        const ddx = Math.max(p.gx - x, 0, x - (p.gx + p.w - 1)), ddy = Math.max(p.gy - y, 0, y - (p.gy + p.h - 1));
        d = Math.min(d, Math.max(ddx, ddy));
      }
      return d;
    };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ax = 0, ay = 0, aw = 0;
    for (const p of P) {
      x0 = Math.min(x0, p.gx); y0 = Math.min(y0, p.gy); x1 = Math.max(x1, p.gx + p.w); y1 = Math.max(y1, p.gy + p.h);
      ax += (p.gx + p.w / 2) * p.w * p.h; ay += (p.gy + p.h / 2) * p.w * p.h; aw += p.w * p.h;
    }
    const tcx = ax / aw, tcy = ay / aw;
    let ox = tcx - cx, oy = tcy - cy;
    const on = Math.hypot(ox, oy);
    if (on < 1e-6) { ox = 0; oy = -1; } else { ox /= on; oy /= on; }
    const outA = Math.atan2(oy, ox);
    const angGap = (a) => { let g = Math.abs(a - outA); if (g > Math.PI) g = Math.PI * 2 - g; return g; };
    const kept = [];
    const farFrom = (x, y) => kept.every((q) => Math.max(Math.abs(q.gx - x), Math.abs(q.gy - y)) >= 2);
    const rowOf = (r, outer) => {
      const R = 1 + 2 * r, row = [];
      for (let y = y0 - R; y < y1 + R; y += 1) for (let x = x0 - R; x < x1 + R; x += 1) {
        if (x < 0 || y < 0 || x >= N || y >= N || dist(x, y) !== R) continue;
        const vx = x + 0.5 - tcx, vy = y + 0.5 - tcy, vn = Math.hypot(vx, vy) || 1;
        const facing = (vx * ox + vy * oy) / vn;
        if (outer ? facing <= -0.55 : facing > -0.55) continue;
        row.push({ gx: x, gy: y, a: Math.atan2(vy, vx) });
      }
      // Marche le long du bord (angle autour du centre du terroir), une case sur deux.
      row.sort((p, q) => p.a - q.a);
      const pick = [];
      for (const c2 of row) if (farFrom(c2.gx, c2.gy)) { kept.push(c2); pick.push(c2); }
      pick.sort((p, q) => angGap(p.a) - angGap(q.a));
      return pick;
    };
    // Une seule rangée le long de tout le bord campagne (tout sauf la face tournée
    // vers la ville) avant d'en ouvrir une deuxième : deux ou trois rangées serrées d'un même côté faisaient un verger
    // de moulins, pas une crête (vu à la capture, 23 moulins).
    const rows = [];
    for (let r = 0; r < 3; r += 1) rows.push(...rowOf(r, true));
    rows.push(...rowOf(0, false));
    terroir.rows = rows;
    terroir.near = (gx, gy, sz) => {
      let d = Infinity;
      for (let ax2 = 0; ax2 < sz; ax2 += 1) for (let ay2 = 0; ay2 < sz; ay2 += 1) d = Math.min(d, dist(gx + ax2, gy + ay2));
      return d >= 1 && d <= 5;
    };
    terroir.distTo = dist;
    return rows;
  };
  const placeRequest   = (req, preferSavedSlot) => {
    placingOwner = req.slotKey;
    // (Un bloc « aqueduc » vivait ici : structure linéaire span×1 posée le long
    //  de la berge, prise d'eau au bord. Retiré le 2026-08-05 — cf. le pavé de
    //  cmWaterPointCount. Les points d'eau sont des 1×1 ordinaires et passent
    //  désormais par le chemin générique, comme n'importe quel atelier.)
    // ── Champs : le TERROIR — parcelles jointives sur l'anneau agricole ──────
    // (docs/PLAN-TERROIR.md.) Même aire qu'avant, découpée par cmTerroirParcels.
    // La parcelle 0 se pose comme l'ancien bloc unique : tangente à la lisière de
    // la ville. Les suivantes se COLLENT aux précédentes (au moins deux cases de
    // côté commun), en restant sur l'anneau — la campagne s'étend autour du bourg
    // au lieu de faire une dalle. Une tuile par parcelle, toutes RURALES : pas de
    // sol de ville dessous ni autour (cf. urbanSet).
    if (req.meta.id === "irrigated_fields") {
      const plan = cmTerroirParcels(req.level, cmHash(req.slotKey + ":" + mapSeed) >>> 0);
      const slot = slotStore[req.slotKey];
      const ringOf = (w, h) => Math.min(N * 0.46, cityReachBase + Math.max(w, h) / 2 + 1);
      const fitsRect = (p) => footprintFits(p.gx, p.gy, p.w, false, false, p.h);
      const parcels = [];
      const take = (p) => { claimFootprint(p.gx, p.gy, p.w, p.h); parcels.push(p); };
      // 1. Le terroir mémorisé, repris tel quel s'il a le même plan et tient encore.
      if (preferSavedSlot && slot && Array.isArray(slot.parcels) && slot.parcels.length === plan.length
          && slot.parcels.every((q, i) => q[2] === plan[i].w && q[3] === plan[i].h)) {
        const ps = slot.parcels.map((q) => ({ gx: cx + q[0], gy: cy + q[1], w: q[2], h: q[3] }));
        if (ps.every(fitsRect)) for (const p of ps) take(p);
      }
      if (!parcels.length) {
        // 2. L'ancre : la parcelle 0, comme l'ancien bloc (slot puis anneau).
        let w0 = plan[0].w, h0 = plan[0].h, a0 = null;
        if (preferSavedSlot && slot) {
          const sv = { gx: cmClamp(cx + (Number(slot.dx) || 0), 0, N - w0), gy: cmClamp(cy + (Number(slot.dy) || 0), 0, N - h0), w: w0, h: h0 };
          if (fitsRect(sv)) a0 = sv;
        }
        if (!a0) {
          const tryPlace = () => {
            const ring = ringOf(w0, h0);
            const order = cells
              .map((c2) => ({ c2, s: Math.abs(Math.hypot(c2.gx + w0 / 2 - cx, c2.gy + h0 / 2 - cy) - ring) + (cmHash("field:" + c2.gx + ":" + c2.gy) % 1000) / 1000 }))
              .sort((a, b) => a.s - b.s);
            for (const e of order) { const p = { gx: e.c2.gx, gy: e.c2.gy, w: w0, h: h0 }; if (fitsRect(p)) return p; }
            return null;
          };
          a0 = tryPlace();
          // Repli : rétrécir l'ancre si la ville est trop dense pour la loger.
          while (!a0 && (w0 > 2 || h0 > 2)) { w0 = Math.max(2, w0 - 1); h0 = Math.max(2, h0 - 1); a0 = tryPlace(); }
        }
        if (!a0) return false;
        take(a0);
        // 3. Les parcelles suivantes, collées à l'une des précédentes.
        for (let i = 1; i < plan.length; i += 1) {
          let w = plan[i].w, h = plan[i].h, best = null;
          for (let tries = 0; tries < 3 && !best; tries += 1) {
            const ring = ringOf(w, h);
            let bestS = Infinity;
            const consider = (gx, gy, align) => {
              const p = { gx, gy, w, h };
              if (!fitsRect(p)) return;
              const s2 = Math.abs(Math.hypot(gx + w / 2 - cx, gy + h / 2 - cy) - ring)
                + align * 0.12 + ((cmHash("parcel:" + i + ":" + gx + ":" + gy) >>> 0) % 1000) / 2000;
              if (s2 < bestS) { bestS = s2; best = p; }
            };
            for (const q of parcels) {
              const ov = (n1, n2) => Math.min(2, n1, n2);   // côté commun minimal
              for (let gy = q.gy - h + ov(h, q.h); gy <= q.gy + q.h - ov(h, q.h); gy += 1) {
                const al = Math.min(Math.abs(gy - q.gy), Math.abs(gy + h - q.gy - q.h));
                consider(q.gx + q.w, gy, al);   // est
                consider(q.gx - w, gy, al);     // ouest
              }
              for (let gx = q.gx - w + ov(w, q.w); gx <= q.gx + q.w - ov(w, q.w); gx += 1) {
                const al = Math.min(Math.abs(gx - q.gx), Math.abs(gx + w - q.gx - q.w));
                consider(gx, q.gy + q.h, al);   // sud
                consider(gx, q.gy - h, al);     // nord
              }
            }
            if (!best) { if (w >= h) w = Math.max(2, w - 1); else h = Math.max(2, h - 1); }
          }
          if (best) take(best);
        }
      }
      const tcx0 = parcels.reduce((a, p) => a + p.gx + p.w / 2, 0) / parcels.length;
      const tcy0 = parcels.reduce((a, p) => a + p.gy + p.h / 2, 0) / parcels.length;
      parcels.forEach((p, i) => {
        for (let ax = 0; ax < p.w; ax += 1) for (let ay = 0; ay < p.h; ay += 1) {
          engineFootprint.add((p.gx + ax) + "," + (p.gy + ay));
          usedKeys.add((p.gx + ax) + "," + (p.gy + ay));
        }
        const dx = p.gx + p.w / 2 - cx, dy = p.gy + p.h / 2 - cy;
        tiles.push({ gx: p.gx, gy: p.gy, type: "engine", variant: "irrigated_fields", buildingId: "irrigated_fields",
          level: req.level, groupLevel: req.groupLevel,
          groupIndex: 1, groupTotal: 1, tier: req.tier, size: Math.max(p.w, p.h), spanX: p.w, spanY: p.h,
          parcel: i, parcels: parcels.length, rural: true, terroirX: tcx0, terroirY: tcy0,
          key: `engine:irrigated_fields:${i}:${req.slotKey}:${req.tier}`, d2: dx * dx + dy * dy });
      });
      terroir = { parcels };
      slotStore[req.slotKey] = { dx: parcels[0].gx - cx, dy: parcels[0].gy - cy, zone: req.zone, id: req.meta.id,
        parcels: parcels.map((p) => [p.gx - cx, p.gy - cy, p.w, p.h]) };
      liveSlotKeys.add(req.slotKey);
      placedSlotKeys.add(req.slotKey);
      return true;
    }
    // ── Moulins à vent : EN RANGÉE au bord du terroir ─────────────────────────
    // (docs/PLAN-TERROIR.md, choix de Raph : tous les moulins gardés, alignés.)
    // Un moulin vit au vent, au bord de ses champs — pas entre deux maisons. La
    // HALLE (instance nº 0, la minoterie) se pose contre le terroir du côté de la
    // ville ; les ATELIERS prennent, dans l'ordre, les places libres des rangées
    // (cf. terroirRows). Slot de zone « terroir » : les anciens slots « outer »
    // (moulins semés dans le faubourg) ne sont pas repris. Rien ne tient → chemin
    // générique ci-dessous, comme avant.
    if (req.meta.id === "water_mills" && terroir) {
      const sz = req.size;
      const rows = terroirRows();
      const slot = slotStore[req.slotKey];
      const ok = (gx, gy) => footprintFits(gx, gy, sz) && hasFreeDoor(gx, gy, sz, sz);
      let at = null;
      if (preferSavedSlot && slot && slot.zone === "terroir") {
        const sv = { gx: cx + (Number(slot.dx) || 0), gy: cy + (Number(slot.dy) || 0) };
        if (terroir.near(sv.gx, sv.gy, sz) && ok(sv.gx, sv.gy)) at = sv;
      }
      if (!at && req.groupIndex === 1) {
        // La halle : la place qui touche le terroir la plus proche du cœur.
        let bestS = Infinity;
        for (const p of terroir.parcels) {
          for (let gy = p.gy - sz - 1; gy <= p.gy + p.h + 1; gy += 1) {
            for (let gx = p.gx - sz - 1; gx <= p.gx + p.w + 1; gx += 1) {
              let d = Infinity;
              for (let ax = 0; ax < sz; ax += 1) for (let ay = 0; ay < sz; ay += 1) d = Math.min(d, terroir.distTo(gx + ax, gy + ay));
              if (d !== 1) continue;
              const s2 = Math.hypot(gx + sz / 2 - cx, gy + sz / 2 - cy);
              if (s2 < bestS && ok(gx, gy)) { bestS = s2; at = { gx, gy }; }
            }
          }
        }
      }
      if (!at && sz === 1) for (const c2 of rows) if (ok(c2.gx, c2.gy)) { at = c2; break; }
      if (at) {
        claimFootprint(at.gx, at.gy, sz);
        for (let ax = 0; ax < sz; ax += 1) for (let ay = 0; ay < sz; ay += 1) {
          engineFootprint.add((at.gx + ax) + "," + (at.gy + ay));
          usedKeys.add((at.gx + ax) + "," + (at.gy + ay));
        }
        const arr = sameTypeCells.get(req.meta.id), c2 = [at.gx + sz / 2, at.gy + sz / 2];
        if (arr) arr.push(c2); else sameTypeCells.set(req.meta.id, [c2]);
        const dx = at.gx + sz / 2 - cx, dy = at.gy + sz / 2 - cy;
        tiles.push({ gx: at.gx, gy: at.gy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
          level: req.level, groupLevel: req.groupLevel,
          groupIndex: req.groupIndex, groupTotal: req.groupTotal, tier: req.tier, size: sz, rural: true,
          key: `engine:${req.meta.id}:${req.groupIndex - 1}:${req.slotKey}:${req.tier}`, d2: dx * dx + dy * dy });
        slotStore[req.slotKey] = { dx: at.gx - cx, dy: at.gy - cy, zone: "terroir", id: req.meta.id };
        liveSlotKeys.add(req.slotKey);
        placedSlotKeys.add(req.slotKey);
        return true;
      }
    }
    // ── Port fluvial : bâtiment UNIQUE forcé sur la rive ──────────────────────
    // Emprise rectangulaire posée sur la rive nord, bord SUD plaqué contre l'eau
    // VISIBLE (waterSide "S" garanti, jamais de repli N/E/O) : le ponton plonge
    // alors pile dans le fleuve et le corps s'étire derrière sur la berge.
    // Placement déterministe (colonnes triées par proximité au cœur) → stable.
    if (req.meta.id === "river_ports") {
      // ÉPINGLÉ AU BASSIN (lot P3) : dès que le Vieux-Port est creusé, le port EST
      // le bassin et son anneau de quai, plus une rangée de fleuve devant l'entrée
      // (l'emprise « mouille » : la scène riveraine la dessine). Plus de recherche
      // de berge — le slot se recale sur le bassin à chaque calcul.
      if (oldBasin) {
        const gx = oldBasin.gx - 1, gy = oldBasin.gy - BASIN_NORTH_QUAY, sx = oldBasin.w + 2, sy = oldBasin.h + BASIN_NORTH_QUAY + 1;
        claimFootprint(gx, gy, sx, sy);
        for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) {
          engineFootprint.add((gx + ax) + "," + (gy + ay));
          usedKeys.add((gx + ax) + "," + (gy + ay));
        }
        const dxo = gx + sx / 2 - cx, dyo = gy + sy / 2 - cy;
        tiles.push({ gx, gy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
          level: req.level, groupLevel: req.groupLevel,
          groupIndex: 1, groupTotal: 1, tier: req.tier, size: Math.max(sx, sy), spanX: sx, spanY: sy, waterSide: "S",
          oldPort: { gx: oldBasin.gx, gy: oldBasin.gy, w: oldBasin.w, h: oldBasin.h },
          key: `engine:${req.meta.id}:0:${req.slotKey}:${req.tier}`, d2: dxo * dxo + dyo * dyo });
        // LA CAPITAINERIE, sur le quai du fond : sa propre tuile, pour être triée à SA
        // profondeur (celle du bassin est celle de son entrée, au sud — elle serait
        // passée devant les maisons qui la bordent à l'est).
        const ox = oldBasin.gx + Math.floor(oldBasin.w / 2) - 1, oy = oldBasin.gy - BASIN_NORTH_QUAY;
        tiles.push({ gx: ox, gy: oy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
          level: req.level, groupLevel: req.groupLevel,
          groupIndex: 1, groupTotal: 1, tier: req.tier, size: 2, spanX: 2, spanY: BASIN_NORTH_QUAY, waterSide: "S",
          portOffice: { gx: oldBasin.gx, gy: oldBasin.gy, w: oldBasin.w, h: oldBasin.h },
          key: `engine:${req.meta.id}:office:${req.slotKey}:${req.tier}`, d2: dxo * dxo + dyo * dyo });
        slotStore[req.slotKey] = { dx: gx - cx, dy: (gy + sy) - cy, sy, zone: req.zone, id: req.meta.id };
        liveSlotKeys.add(req.slotKey);
        placedSlotKeys.add(req.slotKey);
        return true;
      }
      const rp = cmRiverPortSpan(req.level);
      let spanX = rp.w, spanY = rp.h, placed = null;
      // Rangée nord (dos du bâtiment) hors de l'eau : le corps reste sur terre.
      const northRowDry = (gx, gy, sx) => {
        for (let ax = 0; ax < sx; ax += 1) if (riverSet.has((gx + ax) + "," + gy)) return false;
        return true;
      };
      // Cale le bord SUD de l'emprise sur le CENTRE du fleuve (eau la plus vive),
      // avec une profondeur dérivée de la demi-largeur : le ponton et le bateau
      // tombent en pleine eau, le corps du bâtiment retombe sur la berge au nord.
      const fitOnShore = (gx, sx) => {
        const c = gx + sx / 2;
        const sy = cmClamp(Math.round(riverHwAt(c)) + 2, 3, 5);
        const south = Math.round(riverYAt(c)) - 1;             // bord sud : 1 case avant le centre (port un poil plus haut)
        const gy = south - sy;
        if (gx < 0 || gx + sx > N || gy < 0 || south > N - 1) return null;
        if (!northRowDry(gx, gy, sx)) return null;
        if (!footprintFits(gx, gy, sx, true, false, sy, true)) return null; // dock/eau toléré
        return { gx, gy, sy };
      };
      // DÉGAGEMENT DU PONT : le port ne doit pas se coller à la travée — son
      // PONTON plonge vers le sud et venait se loger sous l'ouvrage, où les
      // deux se recouvrent n'importe comment (retour Raph : « dans le creux du
      // ponton du port, le rendu n'est pas bon »). La marge tient compte de la
      // LARGEUR du port (son ponton part de son milieu) et non plus d'un simple
      // ±2 fixe. ⚠ Appliquée AUSSI au slot mémorisé : c'était le trou — un port
      // enregistré près du pont y restait à chaque recompute, sans contrôle.
      const farFromBridge = (gx, sx) => Math.abs(gx + sx / 2 - riverBridge.x) >= 2.5 + sx / 2;
      const slot = slotStore[req.slotKey];
      if (preferSavedSlot && slot) {
        // dy = rangée SUD (centre du fleuve), sy = profondeur mémorisée.
        const sy = cmClamp(Number(slot.sy) || spanY, 3, 5);
        const sgx = cmClamp(cx + (Number(slot.dx) || 0), 0, N - spanX);
        const sgy = cmClamp(cy + (Number(slot.dy) || 0), 0, N - 1) - sy;
        if (sgy >= 0 && farFromBridge(sgx, spanX) && northRowDry(sgx, sgy, spanX)
          && footprintFits(sgx, sgy, spanX, true, false, sy, true)) { placed = { gx: sgx, gy: sgy }; spanY = sy; }
      }
      if (!placed) {
        const baseX = Math.round(plan.core.x);
        // Repli : rétrécir la largeur si la rive est trop encombrée près du cœur.
        for (const sx of (spanX > 2 ? [spanX, Math.max(2, spanX - 1), 2] : [2])) {
          const cols = [];
          for (let gx = 1; gx <= N - sx - 1; gx += 1) cols.push(gx);
          cols.sort((a, b) => (Math.abs(a + sx / 2 - baseX) - Math.abs(b + sx / 2 - baseX)) || (a - b));
          for (const gx of cols) {
            if (!farFromBridge(gx, sx)) continue;   // laisser la travée du pont libre
            const cand = fitOnShore(gx, sx);
            if (cand) { placed = cand; spanX = sx; spanY = cand.sy; break; }
          }
          if (placed) break;
        }
      }
      if (!placed) return false;
      claimFootprint(placed.gx, placed.gy, spanX, spanY);
      for (let ax = 0; ax < spanX; ax += 1) for (let ay = 0; ay < spanY; ay += 1) {
        engineFootprint.add((placed.gx + ax) + "," + (placed.gy + ay));
        usedKeys.add((placed.gx + ax) + "," + (placed.gy + ay));
      }
      const dx = placed.gx + spanX / 2 - cx, dy = placed.gy + spanY / 2 - cy;
      tiles.push({ gx: placed.gx, gy: placed.gy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
        level: req.level, groupLevel: req.groupLevel,
        groupIndex: 1, groupTotal: 1, tier: req.tier, size: Math.max(spanX, spanY), spanX, spanY, waterSide: "S",
        key: `engine:${req.meta.id}:0:${req.slotKey}:${req.tier}`, d2: dx * dx + dy * dy });
      // dy = rangée sud (centre du fleuve), sy = profondeur, pour rester plaqué.
      slotStore[req.slotKey] = { dx: placed.gx - cx, dy: (placed.gy + spanY) - cy, sy: spanY, zone: req.zone, id: req.meta.id };
      liveSlotKeys.add(req.slotKey);
      placedSlotKeys.add(req.slotKey);
      return true;
    }
    const aff = cmWaterAffinity(req.meta);
    // ── Bâtiments de berge (ports, moulins) ──────────────────────────────────
    // L'emprise se cale au bord du fleuve (sur terre/berge, JAMAIS sur l'eau) et
    // DOIT border l'eau. Le sprite est dessiné « eau en bas » (vue oblique, toit
    // vers le haut) : on PRIORISE donc une pose dont le fleuve est au sud
    // (waterSide "S"), où le sprite tombe juste sans réorientation. À défaut, on
    // accepte un autre bord (rendu natif, toujours à l'endroit — jamais tourné,
    // pour ne pas retourner les toits/coques). waterSide est conservé pour info.
    if (aff === "bank") {
      let bsize = req.size, bplaced = null, bside = null;
      const tryAt = (gx, gy, sz) =>
        footprintFits(gx, gy, sz, true, false, sz, false) ? footprintWaterSide(gx, gy, sz, sz) : null;
      const bslot = slotStore[req.slotKey];
      if (preferSavedSlot && bslot) {
        const sgx = cmClamp(cx + (Number(bslot.dx) || 0), 0, N - bsize);
        const sgy = cmClamp(cy + (Number(bslot.dy) || 0), 0, N - bsize);
        const ws = tryAt(sgx, sgy, bsize);
        if (ws) { bplaced = { gx: sgx, gy: sgy }; bside = ws; }
      }
      if (!bplaced) {
        // Passe 1 : fleuve au sud (orientation native parfaite). Passe 2 : tout bord.
        for (const wantSouth of [true, false]) {
          for (const sz of (bsize > 1 ? [bsize, 1] : [1])) {
            for (const cell of engineCandidates(req.zone, aff, sz, req.meta.id, req.groupIndex - 1, req.groupTotal, Infinity)) {
              const ws = tryAt(cell.gx, cell.gy, sz);
              if (ws && (!wantSouth || ws === "S")) { bplaced = cell; bside = ws; bsize = sz; break; }
            }
            if (bplaced) break;
          }
          if (bplaced) break;
        }
      }
      if (!bplaced) return false;
      claimFootprint(bplaced.gx, bplaced.gy, bsize);
      for (let ax = 0; ax < bsize; ax += 1) for (let ay = 0; ay < bsize; ay += 1) {
        engineFootprint.add((bplaced.gx + ax) + "," + (bplaced.gy + ay));
        usedKeys.add((bplaced.gx + ax) + "," + (bplaced.gy + ay));
      }
      const bdx = bplaced.gx + bsize / 2 - cx, bdy = bplaced.gy + bsize / 2 - cy;
      tiles.push({ gx: bplaced.gx, gy: bplaced.gy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
        level: req.level, groupLevel: req.groupLevel,
        groupIndex: req.groupIndex, groupTotal: req.groupTotal, tier: req.tier, size: bsize, waterSide: bside,
        key: `engine:${req.meta.id}:${req.groupIndex - 1}:${req.slotKey}:${req.tier}`, d2: bdx * bdx + bdy * bdy });
      slotStore[req.slotKey] = { dx: bplaced.gx - cx, dy: bplaced.gy - cy, zone: req.zone, id: req.meta.id };
      liveSlotKeys.add(req.slotKey);
      placedSlotKeys.add(req.slotKey);
      return true;
    }
    let size = req.size, placed = null;
    const { allowWater, allowBank } = cmWaterAllow(aff);
    // ── ÉCART MINIMAL ENTRE POINTS D'EAU ──────────────────────────────────────
    // Les points d'eau sont les seules instances TOUTES identiques et TOUTES d'une
    // cellule : rien dans le score ne les empêche de se coller. Vérifié à l'écran,
    // deux puits jointifs sur quatorze — et deux puits côte à côte se lisent comme
    // une erreur, pas comme un quartier bien desservi. Le terme angulaire ne suffit
    // pas près du cœur, où le tirage « center » tire tout le monde au même point.
    // On impose donc l'écart EN DUR, à l'acceptation de la cellule.
    // ⚠ Passe par `fits` et non par les appels directs à footprintFits : il y a
    // QUATRE chemins d'acceptation ici (slot mémorisé, re-tri local, top-K,
    // élargissements) et n'en garder que certains laisserait la règle fuir par les
    // autres — c'est-à-dire une règle qui tient tant qu'on ne la teste pas.
    const spaced = req.meta.id !== "aqueducts" ? null : (gx, gy) => {
      for (const p of waterPointCells) if (Math.hypot(gx - p[0], gy - p[1]) < CM_WATER_POINT_GAP) return false;
      return true;
    };
    // ── PAS DEUX FOIS LE MÊME MÉTIER CÔTE À CÔTE ──────────────────────────────
    // Raph 2026-08-05 : « c'est bizarre d'avoir toutes les guildes au même
    // endroit (ça vaut pour tous les bâtiments hein) ».
    //
    // MESURÉ, par bâtiment et non par cellule (un 3×3 est son propre voisin huit
    // fois, ce qui gonflait un premier relevé à 60 % pour rien) : un moteur a
    // **23,6 % de voisins du même type** là où 29 types disponibles en
    // donneraient 3,4 %. Sept fois le hasard.
    //
    // LA CAUSE est dans le scoring : `angleTarget = 2π·index/total` range les
    // instances d'un type en COURONNE RÉGULIÈRE sur l'anneau de leur zone. Deux
    // instances consécutives y sont donc systématiquement voisines — chacune a
    // ses deux jumelles de couronne pour compagnes, ce qui donne mécaniquement
    // un quart de voisinage identique. Ce n'est pas un hasard mal tiré, c'est
    // une géométrie qui les colle.
    //
    // LE REMÈDE, sans toucher au scoring (qui porte l'identité des zones : le
    // temple au centre, les entrepôts au bord) : un ÉCART MINIMAL entre deux
    // instances du même type, appliqué comme un filtre d'acceptation — le même
    // mécanisme que les points d'eau juste au-dessus, généralisé. On passe par
    // `fits`, donc les QUATRE chemins d'acceptation le respectent.
    //
    // ⚠ ET IL EST FACULTATIF PAR CONSTRUCTION : si aucune cellule ne satisfait
    // l'écart, `placeRequest` retente SANS lui (cf. `relax` plus bas). Un
    // bâtiment acheté doit toujours se poser — une règle de composition ne peut
    // pas coûter un achat au joueur.
    // Molette : __engineSpread({ gap }) ; 0 = comportement d'avant.
    const sameCells = sameTypeCells.get(req.meta.id);
    const apart = (gx, gy, sz) => {
      if (!(ENGINE_SPREAD.gap > 0) || !sameCells || !sameCells.length) return true;
      const cxr = gx + sz / 2, cyr = gy + sz / 2;
      for (const p of sameCells) if (Math.hypot(cxr - p[0], cyr - p[1]) < ENGINE_SPREAD.gap) return false;
      return true;
    };
    const fits = (gx, gy, sz) =>
      (!spaced || spaced(gx, gy)) && footprintFits(gx, gy, sz, allowBank, false, sz, allowWater)
      // La desserte des moteurs est un invariant ABSOLU (« les routes reliées à
      // TOUS les bâtiments ») : pas de pose sans porte carvable — cf. hasFreeDoor.
      && hasFreeDoor(gx, gy, sz, sz);
    const slot = slotStore[req.slotKey];
    // Un slot hérité d'une autre zone est écarté (ex : slot de moulin RIVERAIN
    // d'avant la refonte éolienne, dy pointé sur le centre du fleuve) : sans ce
    // garde la halle se recollerait au fleuve pour un cycle via le re-tri local.
    const slotCompat = slot && !(slot.zone && slot.zone !== req.zone);
    let fromSlot = false;   // position rappelée d'un slot mémorisé : ne glisse pas
    if (preferSavedSlot && slotCompat) {
      const saved = { gx: cmClamp(cx + (Number(slot.dx) || 0), 0, N - size), gy: cmClamp(cy + (Number(slot.dy) || 0), 0, N - size) };
      if (fits(saved.gx, saved.gy, size)) {
        placed = saved;
      } else {
        // Re-tri local autour du slot sauvegardé (décoré : un score par cellule).
        const slotHash = cmHash(req.slotKey) >>> 0;
        const nearby = engineCandidates(req.zone, aff, size, req.meta.id, req.groupIndex - 1, req.groupTotal)
          .map((cell) => ({ cell, s: Math.hypot(cell.gx - saved.gx, cell.gy - saved.gy) + ((((Math.imul(cell.gx | 0, 73856093) ^ Math.imul(cell.gy | 0, 19349663) ^ slotHash) >>> 0) % 100) / 500) }))
          .sort((a, b) => a.s - b.s)
          .map((e) => e.cell);
        for (const cell of nearby) if (fits(cell.gx, cell.gy, size)) { placed = cell; break; }
      }
      fromSlot = !!placed;
    }
    if (!placed) {
      const candidates = engineCandidates(req.zone, aff, size, req.meta.id, req.groupIndex - 1, req.groupTotal);
      // ⚠⚠ L'ÉCART NE DOIT JAMAIS ÉLOIGNER UN BÂTIMENT DE SA RUE. Sans borne, le
      // contrat « aucun bâtiment servable ne reste sans rue » tombe : la cellule
      // écartée sort de la zone que la desserte sait raccorder avec son budget
      // (mesuré — 1 moteur orphelin, attrapé par roadDesserte.test.js).
      //
      // On procède donc en deux temps, et la borne est une DISTANCE, pas un rang
      // dans la liste : un rang dépendrait de la taille du top-K, et l'invariance
      // « le top-K élargi pose la même ville » sauterait (attrapé par
      // enginePlacementPerf.test.js). Une distance, elle, ne dépend que de la
      // géométrie — les cellules qu'un élargissement ajoute ont un plus mauvais
      // score, donc elles viennent après et ne changent pas le choix.
      //   1. `base` = la première cellule acceptable SANS écart : le choix
      //      d'origine, celui dont on sait qu'il sera desservi ;
      //   2. on ne lui préfère une cellule écartée que si elle est à moins de
      //      `reach` cellules de lui.
      for (const cell of candidates) if (fits(cell.gx, cell.gy, size)) { placed = cell; break; }
      // Top-K saturé (toutes les bonnes cellules déjà prises) : on ÉLARGIT par
      // paliers au lieu de demander la liste complète d'un coup.
      //
      // Ce repli était LE coût du placement à froid. Mesuré en fin de partie
      // (29 types × 300 achats, 20 573 cellules par pool) : 127 replis sur 1327
      // appels, mais 1949 ms des 2318 ms du placement — parce que `Infinity`
      // bascule engineCandidates sur un argsort COMPLET avec comparateur (~300 k
      // comparaisons par appel), là où un top-K passe par un tas et reste ~O(n).
      // Élargir géométriquement garde le tas tant que K < n, et l'ordre des
      // candidats est le même (le top-4096 commence par le top-1024) : la ville
      // posée est identique, seul le chemin pour y arriver change.
      if (!placed) {
        let scanned = candidates.length;
        for (const wider of [2048, 4096, 8192, 16384, 32768, Infinity]) {
          const list = engineCandidates(req.zone, aff, size, req.meta.id, req.groupIndex - 1, req.groupTotal, wider);
          for (let ci = scanned; ci < list.length; ci += 1) {
            const cell = list[ci];
            if (fits(cell.gx, cell.gy, size)) { placed = cell; break; }
          }
          if (placed || list.length <= scanned) break;   // trouvé, ou pool épuisé
          scanned = list.length;
        }
      }
      // Repli taille-1 pour les bâtiments affines à l'eau (rive souvent étroite).
      if (!placed && cmWaterAffine(aff) && size > 1) {
        size = 1;
        for (const cell of engineCandidates(req.zone, aff, 1, req.meta.id, req.groupIndex - 1, req.groupTotal))
          if (fits(cell.gx, cell.gy, 1)) { placed = cell; break; }
      }
    }
    if (!placed) return false;
    // ── ÉCARTEMENT : un AJUSTEMENT LOCAL, appliqué APRÈS le choix ─────────────
    // (cf. § PAS DEUX FOIS LE MÊME MÉTIER.) Le choix ci-dessus est celui d'avant,
    // intact — c'est ce qui rend la manœuvre sûre. On se contente ensuite de
    // GLISSER le bâtiment vers la cellule la plus proche qui respecte l'écart,
    // dans un rayon borné.
    //
    // ⚠⚠ Deux tentatives précédentes ont été jetées, et leurs échecs disent
    // pourquoi cette forme-ci :
    //   • mêler l'écart au filtre `fits` du choix initial faisait sortir un
    //     bâtiment de la zone que la desserte sait raccorder → « aucun bâtiment
    //     servable sans rue » tombait (roadDesserte.test.js) ;
    //   • chercher la cellule écartée en reparcourant `candidates` rendait le
    //     résultat dépendant de la taille du top-K → l'invariance « le top-K
    //     élargi pose la même ville » tombait (enginePlacementPerf.test.js).
    // Un glissement BORNÉ, sur un voisinage géométrique, ne touche ni l'un ni
    // l'autre : la cellule reste à `reach` du choix desservi, et le balayage ne
    // dépend d'aucune liste. S'il ne trouve rien, on garde le choix d'origine —
    // l'écart est une règle de composition, jamais une raison de ne pas poser un
    // bâtiment acheté.
    //
    // ⚠⚠ ET SEULEMENT À LA PREMIÈRE POSE. Un bâtiment rappelé par son slot
    // mémorisé ne glisse JAMAIS : `sameTypeCells` se remplit dans l'ordre du
    // placement, qui n'est pas le même d'un recompute à l'autre (les slots
    // sauvegardés passent avant les poses neuves) — un glissement rejoué ferait
    // donc BOUGER les bâtiments déjà posés, à chaque recalcul de la carte.
    // Attrapé par urbanGroundCoversBuildings.test.js, dont le scénario compare
    // deux calculs successifs : le sol « réduit » sortait plus grand que le sol
    // « large », signe que les positions avaient dérivé entre les deux.
    if (!fromSlot && ENGINE_SPREAD.gap > 0 && !apart(placed.gx, placed.gy, size)) {
      const R = Math.max(0, ENGINE_SPREAD.reach | 0);
      let bestD = Infinity, slid = null;
      for (let dy = -R; dy <= R; dy += 1) {
        for (let dx = -R; dx <= R; dx += 1) {
          const d = Math.hypot(dx, dy);
          if (d > R || d >= bestD) continue;
          const gx = placed.gx + dx, gy = placed.gy + dy;
          if (!apart(gx, gy, size) || !fits(gx, gy, size)) continue;
          slid = { gx, gy }; bestD = d;
        }
      }
      if (slid) placed = slid;
    }
    if (spaced) waterPointCells.push([placed.gx, placed.gy]);
    // Mémorise le CENTRE de l'instance posée : c'est contre lui que se mesure
    // l'écart des suivantes du même type.
    {
      const arr = sameTypeCells.get(req.meta.id);
      const c2 = [placed.gx + size / 2, placed.gy + size / 2];
      if (arr) arr.push(c2); else sameTypeCells.set(req.meta.id, [c2]);
    }
    claimFootprint(placed.gx, placed.gy, size);
    for (let ax = 0; ax < size; ax += 1) for (let ay = 0; ay < size; ay += 1) {
      engineFootprint.add((placed.gx + ax) + "," + (placed.gy + ay));
      usedKeys.add((placed.gx + ax) + "," + (placed.gy + ay));
    }
    const dx = placed.gx + size / 2 - cx, dy = placed.gy + size / 2 - cy;
    tiles.push({ gx: placed.gx, gy: placed.gy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
      level: req.level, groupLevel: req.groupLevel,
      groupIndex: req.groupIndex, groupTotal: req.groupTotal, tier: req.tier, size,
      key: `engine:${req.meta.id}:${req.groupIndex - 1}:${req.slotKey}:${req.tier}`, d2: dx * dx + dy * dy });
    slotStore[req.slotKey] = { dx: placed.gx - cx, dy: placed.gy - cy, zone: req.zone, id: req.meta.id };
    liveSlotKeys.add(req.slotKey);
    placedSlotKeys.add(req.slotKey);
    return true;
  };
  // ── LES ÎLOTS : halles sur leur îlot, ateliers et points d'eau sur leur lot ──
  // (docs/PLAN-ILOTS.md, lot I2.) Le plan (ilotLayout.js) a déjà décidé de tout ;
  // on pose. Une HALLE tient l'angle NORD de son îlot (le haut de l'écran), à sa
  // taille ; des maisons bordent le reste de l'îlot (cf. ilotLayout, hallAt).
  // Ensuite, le temps des bâtiments HORS îlots (champs, moulins, port), les cases
  // d'îlot encore libres sont tenues : un champ ne vient pas s'y étaler.
  const ilotTempClaim = [];
  if (ilot) {
    const tileOf = (req, gx, gy, size) => {
      claimFootprint(gx, gy, size);
      for (let ax = 0; ax < size; ax += 1) for (let ay = 0; ay < size; ay += 1) {
        engineFootprint.add((gx + ax) + "," + (gy + ay));
        usedKeys.add((gx + ax) + "," + (gy + ay));
      }
      const dx = gx + size / 2 - cx, dy = gy + size / 2 - cy;
      tiles.push({ gx, gy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
        level: req.level, groupLevel: req.groupLevel,
        groupIndex: req.groupIndex, groupTotal: req.groupTotal, tier: req.tier, size,
        key: `engine:${req.meta.id}:${req.groupIndex - 1}:${req.slotKey}:${req.tier}`, d2: dx * dx + dy * dy });
      slotStore[req.slotKey] = { dx: gx - cx, dy: gy - cy, zone: "ilot", id: req.meta.id };
      liveSlotKeys.add(req.slotKey);
      placedSlotKeys.add(req.slotKey);
    };
    for (const req of requests) {
      if (ILOT_OUTSIDE.has(req.meta.id)) continue;
      const ha = ilot.hallAt.get(req.slotKey);
      if (ha) { tileOf(req, ha.gx, ha.gy, ha.size); continue; }
      const an = ilot.annexAt.get(req.slotKey);
      if (!an) continue;
      tileOf(req, an.gx, an.gy, an.size);
      if (an.size === 1 && ilotTownBody(req.meta.id, c.eraBand)) {
        const bodies = ANNEX_BODIES[c.eraBand | 0];
        tiles[tiles.length - 1].body = bodies[(cmHash("body:" + req.slotKey) >>> 0) % bodies.length];
      }
    }
    for (const b of ilot.blocks) for (const q of b.cells) {
      const k = q.x + "," + q.y;
      if (!claimed.has(k)) { claimed.add(k); ilotTempClaim.push(k); }
    }
  }
  const savedRequests = requests.slice().sort((a, b) => {
    const pa = cmMapSlotPriority(a.meta), pb = cmMapSlotPriority(b.meta);
    return pa - pb || a.slotKey.localeCompare(b.slotKey);
  });
  const outsideIlots = (req) => !ilot || ILOT_OUTSIDE.has(req.meta.id);
  for (const req of savedRequests) if (slotStore[req.slotKey] && outsideIlots(req)) placeRequest(req, true);
  for (const req of requests)       if (!placedSlotKeys.has(req.slotKey) && outsideIlots(req)) placeRequest(req, false);
  for (const k of ilotTempClaim) claimed.delete(k);
  lp("moteurs");
  // NB: la purge des slots morts est déplacée APRÈS le placement décoratif (qui
  // crée des slots `dec_*`) — sinon, ajoutés après la purge, ils fuiteraient.

  const bias = personality.buildingBias || {};
  // L'AIR DES ÎLOTS (ilotLayout.js) : les lots laissés en jardin ne portent rien —
  // pas même le pan d'un grand logis 2×2 ancré sur le lot voisin.
  const ilotAir = ilot && ilot.air && ilot.air.length ? new Set(ilot.air.map((q) => q.gx + "," + q.gy)) : null;
  // Cellule libre pour un décoratif 1×1 : dans la grille, non occupée, constructible
  // (footprintFits = pas route/eau/berge/réservé), et bordant une rue si requis.
  const decCellFree = (gx, gy, spanX = 1, spanY = spanX, owner = null) => {
    placingOwner = owner;
    if (gx < 0 || gy < 0 || gx + spanX > N || gy + spanY > N) return false;
    for (let ax = 0; ax < spanX; ax += 1) for (let ay = 0; ay < spanY; ay += 1) {
      const k = (gx + ax) + "," + (gy + ay);
      if (usedKeys.has(k) || (ilotAir && ilotAir.has(k))) return false;
    }
    if (!footprintFits(gx, gy, spanX, false, false, spanY)) return false;
    // UNE MAISON QUI REPREND SA PROPRE PLACE (mémoire des rues : la cellule lui
    // est tenue, cf. heldBy) ne repasse pas les règles de COMPOSITION — voie à
    // portée, écart entre tentes : elles valent pour choisir une place, pas pour
    // en chasser un occupant. Mesuré : un atelier qui s'installait à côté d'une
    // tente la faisait déménager, l'écart n'étant plus respecté de SON côté.
    if (owner && heldBy.get(gx + "," + gy) === owner) return true;
    // Ancre proche d'une voie (l'empreinte entière l'est alors aussi).
    if (placer.requireRoad && !placer.nearRoad(gx, gy)) return false;
    // Têtes du pont : aucune habitation, à toutes les ères (cf. bridgeHeadClear).
    if (bridgeHeadClear.size) {
      for (let ax = 0; ax < spanX; ax += 1) for (let ay = 0; ay < spanY; ay += 1) {
        if (bridgeHeadClear.has((gx + ax) + "," + (gy + ay))) return false;
      }
    }
    // Camp : une tente garde ses distances (cf. CAMP_TENT_GAP) — ni losanges
    // qui se touchent, ni tente dessinée juste derrière une autre.
    if (campLife) {
      for (let ax = 0; ax < spanX; ax += 1) for (let ay = 0; ay < spanY; ay += 1) {
        for (const [dx, dy] of CAMP_TENT_GAP) {
          const nx = gx + ax + dx, ny = gy + ay + dy;
          if (nx >= gx && nx < gx + spanX && ny >= gy && ny < gy + spanY) continue;
          if (usedKeys.has(nx + "," + ny)) return false;
        }
      }
    }
    return true;
  };
  const placeDecor = (category, count) => {
    placeCategorySlotted(category, count, {
      // Mode îlots : les lots de bord, îlot par îlot, en rangée (ilotLayout.js).
      ordered: ilot ? ilot.lots : placer.orderedList(category),
      store: slotStore, live: liveSlotKeys,
      cx, cy, N, cycle: s.cycles || 0,
      eraBand: c.eraBand | 0,
      cellFree: decCellFree,
      keepInPlace: true,
      smallVariant: placer.smallVariant,
      chooseVariant: placer.chooseVariant,
      quarterKindAt: placer.quarterKindAt,
      quarterIdAt: placer.quarterIdAt,
      pushTile: (t) => {
        tiles.push(t);
        // Réserve TOUTE l'empreinte (spanX × spanY) : rien d'autre ne se pose dessous.
        const sx = t.spanX || 1, sy = t.spanY || 1;
        for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) usedKeys.add((t.gx + ax) + "," + (t.gy + ay));
      },
      clamp: cmClamp
    });
  };
  const houseCount = biasedCount(c.houses, bias.house);
  // ── LES MAISONS REPRENNENT LA PLACE ─────────────────────────────────────────
  // Une partie en cours dont les ateliers des guildes viennent d'être semés (cf.
  // cmRequestZone) : ils ont quitté le cœur, et les maisons, elles, ne bougent
  // jamais (keepInPlace) — le cœur restait troué de dizaines de lots vides
  // (mesuré, band 4 : 77 % du cœur bâti avant, 64 % après). On libère donc autant
  // de places de maisons qu'il y a de cases rendues, en prenant les plus
  // ÉLOIGNÉES du centre : ces maisons-là repassent par la passe 2, qui comble les
  // meilleures cases libres, donc le cœur. Une seule fois : dès ce calcul, les
  // slots des ateliers portent la zone « sown » et `sownVacated` retombe à 0.
  if (sownVacated > 0) {
    const pre = cycleSlotPrefix + "dec_house:";
    const far = [];
    for (const key of Object.keys(slotStore)) {
      if (!key.startsWith(pre) || !(Number(key.slice(pre.length)) < houseCount)) continue;
      const sl = slotStore[key];
      far.push({ key, d: Math.hypot(Number(sl.dx) || 0, Number(sl.dy) || 0) });
    }
    far.sort((a, b) => b.d - a.d || (a.key < b.key ? -1 : 1));
    for (const e of far.slice(0, sownVacated)) delete slotStore[e.key];
  }
  placeDecor("house", houseCount);
  // Maisons-MOTEUR : pool = engineHomes (palier) + marge LOOKAHEAD (couvre les achats
  // jusqu'au prochain palier), placées SANS chevauchement par le même pipeline. Elles
  // sont RÉVÉLÉES une par une au rendu (drawTile) selon engineHomesRaw → « 1 achat =
  // 1 bâtiment » sans recompute. Chaque tuile porte revealIdx (index de slot).
  // (ENGINE_HOME_LOOKAHEAD vit au niveau du module : le plan d'îlots le compte.)
  // ⚠ Camp : AUCUNE (cf. CAMP_LIFE) — elles n'y paraîtraient jamais, et leurs
  // sentiers et leurs cours, eux, se voyaient.
  placeDecor("enginehome", campLife ? 0 : (c.engineHomes || 0) + ENGINE_HOME_LOOKAHEAD);
  placingOwner = null;   // fin des poses à propriétaire (cf. heldBy)
  // ── LES MAISONS TOURNÉES VERS LEUR RUE (docs/PLAN-ILOTS.md, lot I6) ────────
  // Une maison d'une case posée sur un lot de bord d'îlot reçoit `face`, le côté de
  // sa rue (même ordre que isoBuildingFront : S, E, W, N — le poussé vers la rue et
  // la façade dessinée désignent ainsi le MÊME côté), et `row` : le dessin suit
  // (pixelHouses.js, orientKeyOf). Les ateliers logés dans la rangée (`body`) aussi.
  // LE MÉLANGE (Raph : « il faut un mélange mitoyen et ce qu'on a déjà ») : un côté
  // d'îlot sur deux, tiré par (îlot, côté), et les grands côtés des îlots LONGS des
  // axes sont des RANGÉES MITOYENNES (`terrace`) ; les autres gardent les maisons
  // existantes, tournées. Une unité de rangée dont le mur latéral se voit (le voisin
  // de devant n'est pas une rangée : coin, lot vide, maison isolée) est un BOUT de
  // rangée (`rowEnd`) : une insula, fenêtres sur quatre faces.
  if (ilot) {
    const longSide = (e, face) => {
      const b = ilot.blocks.find((q) => q.i + ":" + q.j === e.block);
      if (!b) return false;
      const wx = b.x1 - b.x0, wy = b.y1 - b.y0;
      return wx > wy ? face === "S" || face === "N" : face === "E" || face === "W";
    };
    const sideMode = new Map();
    const terraceSide = (e, face) => {
      const k = e.block + ":" + face;
      // Une bande sans rangée dessinée (ilotArt.ROWS) garde ses maisons isolées.
      if (!sideMode.has(k)) sideMode.set(k, !!ROWS[c.eraBand | 0] && ((e.long && longSide(e, face)) || ((cmHash("rangee:" + k) >>> 0) & 1) === 0));
      return sideMode.get(k);
    };
    const terraceAt = new Set();
    for (const t of tiles) {
      if ((t.type !== "house" && t.type !== "enginehome" && !t.body) || (t.spanX || 1) !== 1 || (t.spanY || 1) !== 1) continue;
      const e = ilot.lotFace.get(t.gx + "," + t.gy);
      if (!e || !e.faces.length) continue;
      const f = e.faces;
      t.face = f.includes("S") ? "S" : f.includes("E") ? "E" : f.includes("W") ? "W" : "N";
      t.row = 1;
      if (terraceSide(e, t.face)) {
        t.terrace = 1; terraceAt.add(t.gx + "," + t.gy);
        // Le modèle de rangée se tire par CÔTÉ (pixelHouses.rowKeyOf) : un côté, une rangée.
        t.rowSide = cmHash("rangee-modele:" + e.block + ":" + t.face) >>> 0;
      }
    }
    for (const t of tiles) {
      if (!t.terrace) continue;
      const along = t.face === "S" || t.face === "N";
      if (!terraceAt.has(along ? (t.gx + 1) + "," + t.gy : t.gx + "," + (t.gy + 1))) t.rowEnd = 1;
    }
  }

  // Purge des slots morts (moteurs + décoratifs `dec_*`) : ne garde que le cycle
  // courant ET les slots réellement posés cette frame (émonde la frange quand la
  // population baisse, et les slots des cycles précédents).
  for (const key of Object.keys(slotStore)) {
    if (!key.startsWith(cycleSlotPrefix) || !liveSlotKeys.has(key)) delete slotStore[key];
  }
  lp("decor");

  // ── Desserte (archétypes organiques) : dissolution de l'échafaudage ────────
  // L'échafaudage (anneaux d'ancres, escaliers, traverses…) a guidé le placement
  // ci-dessus ; on ne garde que le squelette identitaire (cœur, pont, axes,
  // places) et connectBuildingsToNetwork retracera la desserte réelle : chaque
  // bâtiment rejoint le réseau existant par le plus court chemin → un arbre de
  // sentiers qui mènent quelque part, sans boucle accidentelle. (Le labyrinthe
  // résiduel du motif était immortel : l'émondage ne mange que des feuilles, et
  // une boucle n'en a pas.)
  if (skeletonKey) dissolveToSkeleton({ roads, roadKey, roadMeta, skeletonKey });
  lp("dissolve");

  // ── Trim à la demande : émonde les routes qui ne bordent aucun bâtiment
  //    (approche de pont vers le vide, antennes mortes des secteurs sous-bâtis).
  //    N'enlève que des feuilles → ne coupe aucun axe traversant ni n'isole le
  //    réseau. Posé AVANT cmBuildRoadGraph : un pont devenu inutile perd son
  //    ancrage terrestre et sera écarté par sa validation.
  const demand = new Set(reserved); // les merveilles comptent comme demande
  // Mode desserte : la racine du squelette est sanctuarisée — garantit AU MOINS
  // une source de réseau même si aucun bâtiment ne borde le cœur exact (sans
  // elle, un hameau dégénéré perdrait tout au trim et la desserte n'aurait plus
  // de réseau à rejoindre). ⚠ trimDemandlessRoads protège une cellule si un de
  // ses VOISINS ortho est dans `demand` : pour couvrir la racine elle-même, on
  // sème la cellule ET ses 4 voisines.
  if (skeletonKey) {
    const rx = Math.round(plan.core.x), ry = Math.round(plan.core.y);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) demand.add((rx + dx) + "," + (ry + dy));
  }
  const addFoot = (gx, gy, sx, sy) => {
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) demand.add((gx + ax) + "," + (gy + ay));
  };
  for (const t of tiles) {
    if (t.type === "engine") addFoot(t.gx, t.gy, t.spanX || t.size || 1, t.spanY || t.size || 1);
    else demand.add(t.gx + "," + t.gy);
  }
  // Pont central TOUJOURS présent : on sanctuarise toute sa travée (eau + approches
  // ±3 posées par bridgeCrossing) comme « demande », sinon une rive sans bâtiment
  // fait culer l'approche vers le vide et cmBuildRoadGraph supprime tout le span.
  // Complète l'exemption côté cmBuildRoadGraph (validation + connectivité).
  if (riverBridge) {
    const bx = Math.round(riverBridge.x);
    let by0 = N, by1 = -1;
    for (const k of riverSet) {
      const cc = k.indexOf(",");
      const kx = +k.slice(0, cc);
      if (kx < bx || kx >= bx + bridgeLaneW) continue;  // union sur les colonnes de voie
      const gy = +k.slice(cc + 1);
      if (gy < by0) by0 = gy;
      if (gy > by1) by1 = gy;
    }
    if (by1 >= by0)
      for (let dx = 0; dx < bridgeLaneW; dx += 1)
        for (let gy = Math.max(0, by0 - 3); gy <= Math.min(N - 1, by1 + 3); gy += 1) demand.add((bx + dx) + "," + gy);
  }
  trimDemandlessRoads({ roads, roadKey, roadMeta, demand, keep: memKeep });
  lp("trim");

  // ── Connexion : relie enfin les bâtiments au réseau. Décoratifs gratuits (réseau
  //    de base qui suit la ville) ; moteurs au budget = nb de routes achetées
  //    (1 route = 1 tuile), du plus proche au plus loin. Posé APRÈS le trim pour
  //    que les connecteurs ne soient pas émondés, AVANT cmBuildRoadGraph.
  // Chantiers de voirie RÉALISÉS (state.buildings.roads) : rejoués ici de façon
  // déterministe — d'abord les RACCORDS de moteurs (corridors entiers, du plus
  // proche au plus loin), puis les ÉLARGISSEMENTS des tronçons les plus
  // empruntés. Le compteur reste la seule vérité côté save.
  const roadWorksTotal = Math.floor((s.buildings && s.buildings.roads) || 0);
  // Avec la MÉMOIRE DES RUES, un chantier appliqué l'est pour de bon : ses
  // raccords et ses élargissements sont DANS le réseau mémorisé. Rejouer tous
  // les chantiers payés à chaque calcul les ferait servir deux fois — un raccord
  // gratuit à chaque nouveau moteur, un élargissement de plus à chaque achat.
  // Seuls les chantiers NOUVEAUX (payés depuis le dernier calcul) se dépensent.
  const memWorks = roadMem ? Math.min(roadWorksTotal, (s.cityRoads && s.cityRoads.works) | 0) : 0;
  const memWidened = roadMem ? Math.max(0, (s.cityRoads && s.cityRoads.widened) | 0) : 0;
  const roadWorksFresh = roadWorksTotal - memWorks;
  // ── RANG DES CONNECTEURS DE MOTEURS ────────────────────────────────────────
  // ⚠⚠ C'ÉTAIT ICI, LE « BROUILLON » (Raph 2026-08-05, mesuré). Cette ligne
  // donnait aux corridors de desserte le rang de l'ÈRE — `avenue` dès l'ère 20,
  // `main` dès l'ère 30, par symétrie avec les stades de bâtiment. Or il y a un
  // corridor PAR MOTEUR : à l'échelle où la ville en compte des dizaines, la
  // desserte devenait le réseau, et le réseau devenait une nappe d'avenues.
  //
  // LA MESURE, sur la part de cellules-route par rang (0 puis 40 chantiers, même
  // chiffre : les chantiers n'y étaient pour RIEN) :
  //   band 4 → avenue 40,7 %, main 20,0 %, secondary 9,8 %, path 25,3 %
  //   band 6 → main  44,8 %, avenue 12,7 %, secondary 17,4 %, path 22,8 %
  // Chaque avenue porte une chaussée large, deux trottoirs, leurs bordures,
  // leurs caniveaux et les allées de seuil qui s'y greffent : d'où les stries.
  //
  // LA RÈGLE, désormais : un connecteur est une DESSERTE, pas une artère. Une
  // halle se paie une vraie RUE (`secondary`) — à toutes les ères. Ce que l'ère
  // change, c'est la MATIÈRE de la chaussée (pavé → dalle → asphalte → tech),
  // pas son RANG. La hiérarchie, elle, ÉMERGE comme le veut la doctrine du
  // fichier : par l'usage (upgradeTrunkByUsage) et par les chantiers payés
  // (applyRoadWidenings), qui promeuvent les tronçons réellement empruntés.
  // Les HABITATIONS restent desservies en `path` (venelles sans trottoir).
  // Molette : __roadRanks({ connector: 'avenue' }) rejoue l'ancien comportement.
  const connectorRank = ROAD_RANKS.connector;
  const netCover = connectBuildingsToNetwork({
    roads, roadKey, roadMeta, tiles, N, riverSet, bankSet,
    claimed, districtWalk, engineFootprint, occupiedFoot, engineWorks: roadWorksFresh, connectorRank,
    softBlock: townOn ? townGardens : null,
    // Contrat de base (rappelé par Raph 2026-07-29 : « les routes reliées à
    // TOUS les bâtiments ») : les habitations sont TOUJOURS desservies,
    // gratuitement, quel que soit l'archétype — sur les villes en grille les
    // venelles complètent les mailles (mesuré : 4 % de maisons seules sinon,
    // 75 maisons sans rue sur une mégalopole).
    freeCap: Math.max(12, Math.round(cityReachBase * 2.4))
  });
  // ── Émondage des QUARTIERS DE RUES VIDES (Raph 2026-07-29 : « des carrés 2×2
  //    pas très cohérents, il faudrait que ça n'arrive plus »). Le trim ci-dessus
  //    ne mange que des feuilles ; un quadrillage posé sur de la friche n'en a
  //    aucune, il était immortel. Ici on garde la desserte locale (boucles
  //    comprises) plus l'arbre qui relie chaque porte au cœur, et on coupe le
  //    reste — cf. pruneUnservedRoads pour la preuve de connexité.
  //    ⚠ APRÈS la connexion (les connecteurs frais comptent comme desserte) et
  //    AVANT usage/élargissements : sans quoi on paierait des chantiers sur des
  //    tronçons qu'on s'apprête à supprimer.
  pruneUnservedRoads({
    roads, roadKey, roadMeta, demand,
    coreX: Math.round(plan.core.x), coreY: Math.round(plan.core.y), keep: memKeep
  });
  // …puis on REPASSE l'émondage par feuilles. Couper des boucles en fabrique de
  // nouvelles : là où le quadrillage vide touchait le tissu, la rue conservée par
  // la marge de desserte se termine désormais à deux cellules de la dernière
  // maison, en plein champ (mesuré : 0 cul-de-sac sans rien avant l'émondage,
  // 12 après). Les deux passes sont complémentaires et ne se recouvrent pas :
  // celle-ci ne mange que des feuilles, l'autre ne sait couper que des boucles.
  // Les corridors vers les bâtiments isolés ne risquent rien — leurs cellules
  // sont de degré 2, et leur extrémité touche une emprise, donc la demande.
  trimDemandlessRoads({ roads, roadKey, roadMeta, demand, keep: memKeep });
  lp("prune");
  // Usage du réseau (bâtiments par cellule), calculé UNE fois : sert au tronc
  // gratuit des hameaux ET aux élargissements payés.
  const usage = computeRoadUsage({
    roadKey, tiles,
    coreX: Math.round(plan.core.x), coreY: Math.round(plan.core.y)
  });
  // La hiérarchie ÉMERGE de l'usage : le tronc vers le cœur/pont s'élargit
  // path → secondary selon le nombre de bâtiments qui l'empruntent.
  // ⚠ Cet appel était réservé au mode DESSERTE (`if (skeletonKey)`), donc les
  // archétypes géométriques — grille, radial, damier — n'avaient AUCUN tronc
  // émergent : leurs venelles restaient venelles quoi qu'il s'y passe. Le défaut
  // ne se voyait pas tant que les connecteurs de moteurs arrivaient déjà en
  // avenue (ils masquaient l'absence de hiérarchie sous une nappe de larges) ;
  // depuis qu'ils desservent en `path`, il sautait aux yeux : 66 % de venelles
  // et presque plus une rue (mesuré band 4). L'usage est calculé pour toutes les
  // villes, il n'y a aucune raison de n'en tirer la hiérarchie que pour
  // certaines — le tronc se mérite partout.
  upgradeTrunkByUsage({
    roadKey, roadMeta, tiles,
    coreX: Math.round(plan.core.x), coreY: Math.round(plan.core.y), usage
  });
  // Chantiers restants après les raccords → élargissements payés. `cellFree`
  // rejoue les obstacles des corridors (eau, rives, emprises, réservations) :
  // la voie jumelle d'une autoroute ne se creuse que sur du sol vraiment libre.
  const widenBlocked = new Set();
  for (const t of tiles) {
    const tsx = t.spanX || t.size || 1, tsy = t.spanY || t.size || 1;
    for (let ax = 0; ax < tsx; ax += 1) for (let ay = 0; ay < tsy; ay += 1)
      widenBlocked.add((t.gx + ax) + "," + (t.gy + ay));
  }
  const widenFree = (x, y) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return false;
    const k = x + "," + y;
    return !widenBlocked.has(k) && !bankSet.has(k) && !claimed.has(k)
      && !engineFootprint.has(k) && !occupiedFoot.has(k);
  };
  const widenRes = applyRoadWidenings({
    roads, roadKey, roadMeta, usage, riverSet,
    count: Math.max(0, roadWorksFresh - netCover.engineWorksUsed),
    cellFree: widenFree
  });
  // Prochain chantier proposé + réalisés, déposés sur le layout : le runtime les
  // écrit dans state (roadNext / roadWidened), même canal que roadCoverage.
  const roadWorksInfo = {
    used: netCover.engineWorksUsed,
    widened: memWidened + widenRes.applied,
    next: netCover.nextEngine
      ? { kind: "link", tiles: netCover.nextEngine.tiles, count: netCover.nextEngine.count, targetId: netCover.nextEngine.targetId, toRank: null }
      : widenRes.next
        ? { kind: "widen", tiles: widenRes.next.tiles, count: 1, targetId: null, toRank: widenRes.next.toRank }
        : { kind: "done", tiles: 0, count: 0, targetId: null, toRank: null }
  };
  lp("connexion");

  let maxD2 = 1;
  for (const t of tiles) if (t.d2 > maxD2) maxD2 = t.d2;

  // Végétation : densité pilotée par l'âge (recul du front boisé) et la
  // personnalité (les ruines et cités agricoles laissent la nature revenir).
  const trees = [];
  // Cellules boisées, retenues pour la passe suivante : une bête placée sous une
  // canopée disparaît, et on ne peut pas le savoir en relisant `trees` (une
  // recherche linéaire par cellule sur un millier d'arbres, à chaque plan).
  const treeKey = new Set();
  const maxR  = Math.max(1, Math.hypot(cx, cy));
  const treeMul = ageCfg.treeDensity * (personality.treeMul || 1);
  // Distance aux emprises bâties et réservées (merveilles, grands ensembles),
  // pour la règle des arbres de ville (TREE_LIFE.cityClear). Hors camp et
  // village seulement : leur emprise n'a pas d'arbres de ville (cf. plus bas).
  const cityClear = TREE_LIFE.cityClear | 0;
  const builtD = (!ruralLife && TREE_LIFE.on && cityClear > 0) ? cmLifeDistance(N, [usedKeys, reserved], cityClear) : null;
  for (const cell of cells) {
    const cellKey = cell.gx + "," + cell.gy;
    // Jamais d'arbre SUR une route : `cells` est bâti avant la connexion, or les
    // connecteurs carvés depuis (moteurs + desserte organique) l'ont trouée.
    if (usedKeys.has(cellKey) || roadKey.has(cellKey)) continue;
    // Camp et village (cf. CAMP_LIFE) : AUCUN arbre de ville. Leur emprise est une
    // clairière que la forêt sauvage replante elle-même, en reculant devant la vie
    // (iso/isoWildForest.js, TREE_LIFE) — une seule forêt, un seul semis.
    if (ruralLife) continue;
    // Ville : pas d'arbre contre une maison (TREE_LIFE.cityClear).
    if (builtD && builtD.at(cell.gx, cell.gy) <= cityClear) continue;
    const norm = Math.sqrt(cell.d2) / maxR;
    const hsh  = cmHash((cell.gx - fx0) + "x" + (cell.gy - fy0) + ":" + mapSeed) % 100;
    // S5 : la probabilité radiale est modulée par le BRUIT DE BLOC, de moyenne 1 —
    // des bosquets et des trouées franches au lieu de confettis, à compte conservé.
    // Le hash par cellule reste le tirage (et le rayon de l'arbre) : lui seul casse
    // la grille à l'intérieur d'un bosquet.
    // treeDensK : des arbres au grain des habitations sont plus grands, on en
    // plante d'autant moins (cf. TREE_TUNE.grainR).
    const prob = (20 + norm * 50 + (norm > 0.55 ? 22 : 0)) * treeMul * cmClumpK(cell.gx - fx0, cell.gy - fy0) * treeDensK();
    if (hsh < prob) { trees.push({ gx: cell.gx, gy: cell.gy, r: treeRadius(hsh) }); treeKey.add(cellKey); }
  }
  lp("arbres");

  // Bétail et animaux de rue (sprites FIXES, cf. critters.js). Deux populations
  // qui ne se mélangent pas :
  //
  //   LE BÉTAIL PAÎT AU BORD DES CHAMPS, jamais « à une certaine distance du
  //   centre » : essayé d'abord, et le résultat parlait de lui-même — quatre
  //   moutons plantés sur le pavé au milieu d'un pâté de maisons. Une pâture se
  //   définit par ce qu'il y a À CÔTÉ, pas par un rayon. La référence est donc
  //   l'emprise des champs irrigués : pas de champs, pas de bétail, et la ville
  //   qui construit sa première ferme voit arriver ses moutons.
  //   Il sort par TROUPEAUX : une cellule tirée porte deux à quatre bêtes
  //   dispersées par un jitter. Une bête seule lit comme un bug, un troupeau lit
  //   comme une campagne.
  //
  //   LES ANIMAUX DE RUE se posent au CONTACT du bâti, un par cellule, et
  //   rarement : c'est un détail qu'on découvre, pas un décor.
  //
  // Rien de tout ça une fois la ville passée en régime cosmique (bandes 7+) :
  // on n'élève pas de chèvres dans une mégastructure stellaire.
  //
  // Seulement si CRITTERS_ON (bêtes maison depuis le 2026-10-05, cf. critters.js) :
  // éteint, rien n'est posé — des bêtes invisibles bloqueraient encore leurs cellules
  // (faits divers, chiens et chats de la petite vie). Le placement ne tire que des
  // hachages par cellule, il ne déplace donc rien d'autre du plan.
  const critters = [];
  if (CRITTERS_ON && c.eraBand <= 6) {
    const taken = new Set();
    const free = (gx, gy) => {
      const k = gx + "," + gy;
      return !usedKeys.has(k) && !roadKey.has(k) && !treeKey.has(k) && !riverSet.has(k)
        && !bankSet.has(k) && !reserved.has(k) && !taken.has(k);
    };
    const herd = (gx, gy, h) => {
      taken.add(gx + "," + gy);
      const kind = CRITTER_HERD[(h >>> 10) % CRITTER_HERD.length];
      const n = 2 + ((h >>> 13) % 3);
      for (let i = 0; i < n; i += 1) {
        const hi = cmHash(gx + ":" + gy + ":b" + i);
        critters.push({
          gx, gy,
          jx: ((hi % 100) / 100 - 0.5) * 0.72,
          jy: (((hi >>> 7) % 100) / 100 - 0.5) * 0.72,
          kind, dir: (hi >>> 14) & 3,
        });
      }
    };
    // Anneau de pâture autour de chaque bloc de champs (l'emprise fait spanX×spanY).
    for (const t of tiles) {
      if (t.type !== "engine" || t.buildingId !== "irrigated_fields") continue;
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      for (let gy = t.gy - 2; gy <= t.gy + sy + 1; gy += 1) {
        for (let gx = t.gx - 2; gx <= t.gx + sx + 1; gx += 1) {
          if (gx < 0 || gy < 0 || gx >= N || gy >= N) continue;
          // L'intérieur du bloc est la culture elle-même : on ne broute pas dedans.
          if (gx >= t.gx && gx < t.gx + sx && gy >= t.gy && gy < t.gy + sy) continue;
          if (!free(gx, gy)) continue;
          const h = cmHash("herd:" + gx + "x" + gy + ":" + mapSeed);
          if ((h % 1000) < 190) herd(gx, gy, h);
        }
      }
    }
    // Animal de rue : il lui faut un mur contre lequel se coucher.
    const built = (gx, gy) => usedKeys.has(gx + "," + gy);
    for (const cell of cells) {
      if (!free(cell.gx, cell.gy)) continue;
      if (!(built(cell.gx + 1, cell.gy) || built(cell.gx - 1, cell.gy) || built(cell.gx, cell.gy + 1) || built(cell.gx, cell.gy - 1))) continue;
      const h = cmHash("pet:" + cell.gx + "x" + cell.gy + ":" + mapSeed);
      if ((h % 1000) >= 7) continue;
      taken.add(cell.gx + "," + cell.gy);
      critters.push({
        gx: cell.gx, gy: cell.gy,
        jx: ((h % 100) / 100 - 0.5) * 0.5,
        jy: (((h >>> 7) % 100) / 100 - 0.5) * 0.5,
        kind: CRITTER_PETS[(h >>> 16) % CRITTER_PETS.length], dir: (h >>> 18) & 3,
      });
    }
  }
  lp("bétail");

  // ── LA GRAND-RUE DU BOURG (lot L3) ─────────────────────────────────────────
  // Elle n'est pas tirée au cordeau : c'est le chemin que tout le monde prenait
  // déjà, du pont à la place, qui devient une rue. Plus court chemin SUR LE
  // RÉSEAU, de la place centrale jusqu'au tablier ; ses sentiers passent `secondary`
  // (C'est la ville par îlots, bandes 2 à 9. Les RUES DE QUARTIER du lot L7, qui
  // raccordaient chaque site de place à l'artère au bourg de l'ancien placement,
  // sont parties avec lui — audit 2026-10-05, MORT-4.)
  if (ilotMode) {
    const central = (plan.plazas || []).find((p) => p.kind === "centrale");
    if (central) {
      const half = Math.floor(central.size / 2);
      const par = new Map(), q = [];
      for (let dx = -half; dx < central.size - half; dx += 1) for (let dy = -half; dy < central.size - half; dy += 1) {
        const k = (central.gx + dx) + "," + (central.gy + dy);
        if (roadKey.has(k) && !par.has(k)) { par.set(k, null); q.push(k); }
      }
      let hit = null;
      for (let i = 0; i < q.length && !hit; i += 1) {
        const cur = q[i], ci = cur.indexOf(","), x = +cur.slice(0, ci), y = +cur.slice(ci + 1);
        for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
          const nx = x + dx, ny = y + dy, nk = nx + "," + ny;
          if (par.has(nk) || !roadKey.has(nk)) continue;
          par.set(nk, cur);
          if (riverSet.has(nk) && bridgeCols.has(nx)) { hit = nk; break; }
          q.push(nk);
        }
      }
      for (let k = hit; k; k = par.get(k)) {
        if (riverSet.has(k) || bankSet.has(k)) continue;
        const m = roadMeta.get(k);
        if (m && m.rank === "path") m.rank = "secondary";
      }
    }
  }
  // ── MATIÈRE PAR CELLULE (R4, lots L3-L4) ───────────────────────────────────
  // « Le vieux centre reste ancien » (Raph, 2026-10-01) : une venelle garde la
  // matière de sa naissance ; les ARTÈRES (tout ce qui n'est plus un sentier) et
  // les places sont repavées dans la matière de l'ère. Le rendu lit `pave` par
  // cellule (iso/isoGroundRoads).
  {
    const band = c.eraBand | 0;
    for (const k of roadKey) {
      const m = roadMeta.get(k);
      if (!m) continue;
      const mc = roadMem && roadMem.get(k);
      m.pave = (m.rank !== "path" || !mc) ? band : mc.pave;
      m.born = mc ? mc.born : band;
    }
  }
  const roadGraph = cmBuildRoadGraph(roads, roadKey, roadMeta, river, cx, cy, bridgeLaneW);
  // ── Écriture de la MÉMOIRE (lot L2) : le réseau VALIDÉ de ce calcul devient
  // le point de départ du suivant. Chaque cellule garde sa bande de naissance et
  // de pavage ; une cellule neuve naît et se pave dans la bande courante.
  {
    const band = c.eraBand | 0;
    const out = [];
    for (const r of roadGraph.roads) {
      const k = r.gx + "," + r.gy;
      const m = roadMeta.get(k) || {};
      out.push({ gx: r.gx, gy: r.gy, rank: m.rank || r.rank || "path", h: !!m.h, v: !!m.v,
        born: m.born != null ? m.born : band, pave: m.pave != null ? m.pave : band });
    }
    s.cityRoads = encodeRoadMemory(out, mapSeed, cx, cy, {
      works: memWorks + netCover.engineWorksUsed + widenRes.applied,
      widened: memWidened + widenRes.applied,
      plazas: (plan.plazas || []).map((p) => ({ dx: p.gx - cx, dy: p.gy - cy, size: p.size, kind: p.kind })),
    });
  }
  lp("graphe");
  const median = computeMedianSegments(roadGraph.roadMap);   // terre-plein continu + décorable
  // Refuge planté = mobilier d'avenue : réservé aux âges qui en tracent (band 2+,
  // cf. iso/isoStreet « à partir des avenues »). Avant, un camp/hameau laissait des
  // haies fleuries au milieu de ses pistes dès que deux voies se collaient.
  const terrePlein = ageCfg.roadRanks.avenue ? computeTerrePleinSegments(roadGraph.roadMap, N) : []; // couture des voies collées
  // Cellules de SOL (ni route, ni bâti, ni eau) coincées ENTRE deux routes (route à l'ouest
  // ET à l'est, OU au nord ET au sud) : ce sont les « carrés de sol » qui apparaissent au
  // milieu quand deux routes passent près l'une de l'autre (faux carrefours). On les
  // recense pour les PAVER (drawPixelTerrain les traite comme des rues) → une grande route
  // pleine au lieu d'une grille avec des trous de sol. EXCLUT les emprises bâties.
  const roadMedian = (() => {
    const rset = roadGraph.roadSet, out = new Set(), bf = new Set();
    for (const t of tiles) { const bx = t.spanX || t.size || 1, by = t.spanY || t.size || 1; for (let ax = 0; ax < bx; ax += 1) for (let ay = 0; ay < by; ay += 1) bf.add((t.gx + ax) + "," + (t.gy + ay)); }
    // Routes (1) et combles (2) en grille sur x, y ∈ [−1, N] : le balayage N² ne
    // fabrique plus de clé texte que pour les cases candidates (PERF-7 de l'audit du
    // 2026-10-05) ; hors de la grille, on relit les Sets. Mêmes tests, même ordre.
    const W = N + 2, rG = new Uint8Array(W * W);
    const inG = (x, y) => x >= -1 && y >= -1 && x <= N && y <= N;
    for (const k of rset) {
      const ci = k.indexOf(","), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      if (inG(x, y)) rG[(y + 1) * W + x + 1] = 1;
    }
    const R = (x, y) => (inG(x, y) ? rG[(y + 1) * W + x + 1] === 1 : rset.has(x + "," + y));
    const paved = (x, y) => (inG(x, y) ? rG[(y + 1) * W + x + 1] !== 0 : rset.has(x + "," + y) || out.has(x + "," + y));
    // Plafond de FUSION : un bloc route+comble ne dépasse jamais MAX_FUSED cellules de
    // large → fini les grands aplats gris de routes serrées soudées. Passe greedy
    // déterministe (gy puis gx croissants) : on comble un gap seulement si le run
    // pavé résultant (routes + combles DÉJÀ validés) reste ≤ MAX_FUSED dans l'axe du
    // comble ; sinon on laisse le sol nu → coupe le bloc, ≥1 cellule non-route entre
    // deux paquets de ≤3. Les trous de CARREFOUR (routes des 4 côtés) sont exemptés.
    const MAX_FUSED = 3;
    const runLen = (x, y, dx, dy) => { let n = 0, cx = x + dx, cy = y + dy; while (paved(cx, cy)) { n += 1; cx += dx; cy += dy; } return n; };
    for (let gy = 0; gy < N; gy += 1) for (let gx = 0; gx < N; gx += 1) {
      const hor = R(gx - 1, gy) && R(gx + 1, gy);
      const ver = R(gx, gy - 1) && R(gx, gy + 1);
      if (!hor && !ver) continue;
      const gi = (gy + 1) * W + gx + 1;
      if (rG[gi] === 1) continue;                       // la case est une route
      const k = gx + "," + gy;
      if (bf.has(k) || riverSet.has(k)) continue;
      if (hor && ver) { out.add(k); rG[gi] = 2; continue; }   // trou de carrefour : complète le nœud
      const w = hor ? (1 + runLen(gx, gy, -1, 0) + runLen(gx, gy, 1, 0))
                    : (1 + runLen(gx, gy, 0, -1) + runLen(gx, gy, 0, 1));
      if (w <= MAX_FUSED) { out.add(k); rG[gi] = 2; }
    }
    return out;
  })();
  lp("median");
  // ── Zone urbaine = SOL de la ville (distinct du réseau de rues) ───────────
  // Frontière organique de la cité (organicLimit, petite marge pour englober les
  // rues/bâtis de lisière) ∪ emprises bâties, hors fleuve. PAS le roadSet complet :
  // les routes qui sortent vers la campagne restent sur l'herbe (pas de tentacule).
  // Consommée par le SOL BAKÉ (iso/isoGroundBake) ; les rues se dessinent PAR-DESSUS.
  const urbanSet = new Set();
  if (ilot) {
    // Mode îlots : le sol de ville, ce SONT les îlots ouverts et leurs rues — la
    // ville s'arrête à sa dernière rue, l'herbe commence derrière. Les cours des
    // îlots de maisons sont des jardins (townGreen, repeints en herbe plus bas).
    for (const b of ilot.blocks) for (const q of b.cells) urbanSet.add(q.x + "," + q.y);
    for (const k of roadKey) if (!riverSet.has(k)) urbanSet.add(k);
    for (const q of ilot.courts) townGreen.add(q.gx + "," + q.gy);
    // Les lots restés LIBRES (la réserve pour les grands logis et les achats à venir,
    // cf. ilotBigHomeLots) sont des jardins, pas des dalles nues : comme les cours, ils
    // sortent du sol de ville plus bas, sauf ceux qu'un bâtiment occupe.
    for (const l of ilot.lots) townGreen.add(l.gx + "," + l.gy);
    for (const q of ilot.air) townGreen.add(q.gx + "," + q.gy);   // l'air des îlots
  } else for (let gy = 0; gy < N; gy += 1) for (let gx = 0; gx < N; gx += 1) {
    if (!organicLimit(gx, gy, 1.5)) continue;   // avant la clé texte (sortie anticipée)
    const k = gx + "," + gy;
    if (!riverSet.has(k)) urbanSet.add(k);
  }
  for (const k of occupiedFoot) if (!riverSet.has(k)) urbanSet.add(k);
  // ── Un bâtiment se tient TOUJOURS sur du sol de ville ──────────────────────
  // Le sol urbain venait presque uniquement d'organicLimit, un rayon dérivé des
  // COMPTEURS (cityReachBase ← houses + engineHomes + enginePressure), alors que
  // les bâtiments sont posés par anneaux de zone et, surtout, RELUS depuis
  // `s.cityMapSlots` d'un recompute à l'autre. Les deux peuvent donc diverger :
  // il suffit que le rayon se réduise (moins de maisons-compagnes, population qui
  // baisse, réglage) pour que des bâtiments POSÉS quand la ville était plus large
  // se retrouvent sur l'herbe. Mesuré sur ce cas exact : 239 moteurs sur 2058
  // (12 %) plantés dans l'herbe, alors qu'un recompute à froid n'en montrait que 6.
  // Signalé par Raph sur sa sauvegarde (« certains bâtiments n'ont plus de sols »),
  // invisible sur toutes mes reproductions à froid.
  //
  // On ferme donc la divergence à la SOURCE plutôt qu'en retouchant le rayon :
  // l'emprise de chaque bâtiment, plus une cellule de pourtour, appartient au sol
  // de ville. La marge n'est pas cosmétique — une cellule urbaine ISOLÉE au milieu
  // de l'herbe se lit comme une tache géométrique (même écueil que les losanges
  // isolés de la lisière) ; avec le pourtour, un bâtiment écarté a une COUR.
  // ⚠ SAUF LE TERROIR (docs/PLAN-TERROIR.md) : champs et moulins de rangée sont de
  // la CAMPAGNE. Sous eux, un carré de pavé gris faisait du champ un tapis posé
  // sur une dalle (capture de Raph, 2026-10-03) ; ils dessinent eux-mêmes leur sol.
  for (const t of tiles) {
    if (t.rural) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = -1; ax <= sx; ax += 1) for (let ay = -1; ay <= sy; ay += 1) {
      const gx = t.gx + ax, gy = t.gy + ay;
      if (gx < 0 || gy < 0 || gx >= N || gy >= N) continue;
      const k = gx + "," + gy;
      if (!riverSet.has(k)) urbanSet.add(k);
    }
  }
  // Lot L8 : prés, jardins et ceintures se lisent en HERBE — sortis du sol de
  // ville (sinon le champ de densité les repeignait en pavé, cf. COUR), sauf
  // sous un bâtiment ou une rue.
  if ((townOn || ilot) && townGreen.size) {
    const builtK = new Set();
    for (const t of tiles) {
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) builtK.add((t.gx + ax) + "," + (t.gy + ay));
    }
    for (const k of townGreen) if (!builtK.has(k) && !roadKey.has(k)) urbanSet.delete(k);
  }
  // LE TERROIR se tient dans l'HERBE (docs/PLAN-TERROIR.md) : ses parcelles et deux
  // cases tout autour sortent du sol de ville, sauf sous un bâtiment de ville ou
  // une rue. Sans ça, un champ posé à la lisière gardait un pan de pavé gris
  // contre ses haies (la frontière organique du bourg le traverse).
  {
    const keep = new Set();
    for (const t of tiles) {
      if (t.rural) continue;
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) keep.add((t.gx + ax) + "," + (t.gy + ay));
    }
    for (const t of tiles) {
      if (t.buildingId !== "irrigated_fields" || !t.rural) continue;
      for (let gy = t.gy - 2; gy < t.gy + t.spanY + 2; gy += 1) for (let gx = t.gx - 2; gx < t.gx + t.spanX + 2; gx += 1) {
        const k = gx + "," + gy;
        if (!keep.has(k) && !roadKey.has(k)) urbanSet.delete(k);
      }
    }
  }
  lp("urbain");
  lpEnd();
  // Nombre de maisons-moteur RÉELLEMENT posées (road-limité) → base de la révélation
  // per-buy (on révèle les dernières placées ; le reste apparaît d'emblée).
  const engineHomePlaced = tiles.reduce((n, t) => n + (t.type === "enginehome" ? 1 : 0), 0);
  // Le PORT DE COMMERCE entre au peintre comme le port de la grève : une tuile
  // moteur riveraine du même bâtiment, marquée `tradePort` (scène dédiée,
  // iso/isoTradePort.js). Son emprise = la boîte du terre-plein ; elle touche la
  // berge, donc la scène riveraine la prend. Posée APRÈS tout le reste : ni la
  // pose ni l'urbain ne la comptent, son terrain est déjà réservé (townReserve).
  if (tradePort) {
    const dirT = tradePort.side === "N" ? 1 : -1;
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < tradePort.len; i += 1) {
      const a = tradePort.edge[i], b = tradePort.edge[i] - dirT * (tradePort.depth - 1);
      y0 = Math.min(y0, a, b); y1 = Math.max(y1, a, b);
    }
    const sx = tradePort.len, sy = y1 - y0 + 1;
    tiles.push({ gx: tradePort.x0, gy: y0, type: "engine", variant: "river_ports", buildingId: "river_ports",
      buildingName: { fr: "Port de commerce", en: "Trade Port" }, level: portLevel, groupLevel: portLevel, groupIndex: 2, groupTotal: 2,
      tier: cmEngineTier(portLevel), size: Math.max(sx, sy), spanX: sx, spanY: sy, waterSide: tradePort.side === "N" ? "S" : "N",
      tradePort, key: "engine:river_ports:trade", d2: 0 });
  }
  return {
    engineHomePlaced,
    // Foyer du campement (cf. CAMP_HEARTH) : gardé de tout bâti depuis la
    // pose (hearthClear), il n'a plus qu'à être publié.
    campHearth: hearthCell,
    gridN: N, cx, cy, tiles, urbanSet,
    roads: roadGraph.roads, roadSet: roadGraph.roadSet, roadMap: roadGraph.roadMap, roadMeta,
    trees, critters, maxD2, counts: c, roadCover: netCover, roadWorksInfo, median, roadMedian, terrePlein, river, water, wonderSlots, wonderGround, wonderTiers, wonderPaveR, townGreen: (townOn || ilot) ? townGreen : null, ilotAir: ilot ? ilot.air : null,
    // Les deux ports du XIXe (docs/PLAN-PORTS.md) : le bassin du Vieux-Port
    // { gx, gy, w, h } et le terre-plein de commerce { x0, len, side, depth, edge }.
    ports: (oldBasin || tradePort) ? { old: oldBasin, trade: tradePort } : null,
    // L'autoroute de l'artère (procedural/highwayPlan.js) : tracé, rives, échangeur.
    highway,
    // Exposé au runtime (habitants, véhicules, tooltips, décor de places) :
    plan: { archetype: plan.archetype, core: plan.core, order: plan.order, chaos: plan.chaos, plazas: plan.plazas || [], anchors: plan.anchors || [] },
    personality, ageCfg, mapSeed
  };
}

// ── Vestiges (pur, sans Canvas) ──────────────────────────────────────────────
// Capture un « record de cité morte » compact au moment de l'effondrement. `meta`
// (figée dans crisis.js AVANT le reset : nom/année/ère de la civ qui tombe) est
// fusionnée avec un footprint dérivé du layout — pas de milliers de cellules.
//
// ⚡ RELEVÉ LÉGER (PERF-8 de l'audit du 2026-10-05). Retracer toute la ville coûtait
// 150-250 ms par chute en fin de partie : 28 à 32 s de gel au lancement après une
// nuit hors ligne avec le Phénix calendaire (~170 chutes simulées), ~200 ms à chaque
// chute en ligne. Or le footprint ne demande que la grille et le cœur, et le seul
// effet DURABLE du recalcul sur l'état est la grille qui ne rétrécit jamais
// (cityCore.maxN) : rues, slots, archétype, fiche d'îlots sont effacés par
// completeCollapse dans la foulée. Quand la fiche de cœur de cette graine et le
// fleuve sont déjà posés, on lit donc la grille par cityGridDims et on pousse maxN
// à l'identique, sans tracé. Sinon (sauvegarde sans fiche, fiche d'une autre graine,
// fleuve absent) : le recalcul complet, qui POSE la fiche — c'est elle qui garde la
// cité suivante dans la même vallée (crisis.js) ; les chutes suivantes, elles,
// repassent par le relevé léger. Molette (A/B) : `__vestigeFull = true` force le
// recalcul complet.
function lightVestigeFrame(s) {
  if (import.meta.env?.DEV && typeof globalThis !== "undefined" && globalThis.__vestigeFull) return null;
  const mapSeed = ensureMapSeed(s);
  const fix = s.cityCore;
  if (!fix || fix.seed !== (mapSeed >>> 0) || !Array.isArray(s.riverWP) || s.riverWP.length !== 6) return null;
  const c = cityCounts(s);
  const { N } = cityGridDims(s, c, mapSeed);
  fix.maxN = Math.max(fix.maxN | 0, N);   // = computeCityLayout
  const cx = Math.floor(N / 2), cy = Math.floor(N / 2);
  // Rayon : celui de la ville affichée quand c'est elle qui tombe (en jeu, même
  // graine). Hors ligne, CM.layout est la ville d'AVANT l'absence (même vallée, donc
  // même graine) : on l'estime sur la grille — le bâti le plus lointain tient à ~N/2
  // au campement, ~N/4 en fin de partie (relevé du campement à l'ère 136 : écart
  // ≤ 20 % au rayon tracé ; la nécropole le borne de toute façon, cf. necropolis.js).
  const live = !isOfflineSim() && CM.layout && CM.layout.mapSeed === mapSeed ? CM.layout : null;
  const radius = live && live.maxD2 > 0 ? Math.round(Math.sqrt(live.maxD2)) : Math.round(N * (0.5 - 0.25 * c.eraFrac));
  return { gridN: N, core: { x: cx + (Number(fix.dx) || 0), y: cy + (Number(fix.dy) || 0) }, radius: Math.max(1, radius), eraIndex: c.eraIndex, mapSeed };
}
function captureVestige(meta) {
  if (typeof state === "undefined" || !state) return;
  try {
    let fr = lightVestigeFrame(state);
    if (!fr) {
      const L = computeCityLayout(state);
      if (!L.tiles.length) return;
      fr = {
        gridN: L.gridN,
        core: (L.plan && L.plan.core) ? L.plan.core : { x: L.cx, y: L.cy },
        radius: Math.max(1, Math.round(Math.sqrt(L.maxD2 || 0)) || Math.floor(L.gridN / 4)),
        eraIndex: L.counts ? L.counts.eraIndex : 0,
        mapSeed: L.mapSeed
      };
    }
    if (!Array.isArray(state.vestiges)) state.vestiges = [];
    const m = meta || {};
    const eraIndex = Number.isFinite(m.eraIndex) ? m.eraIndex : fr.eraIndex;
    const eraBand = eraBandOf(eraIndex); // cohérent avec l'eraIndex stocké
    state.vestiges.push({
      cityName: String(m.cityName || ""),
      year: Math.max(1, Math.floor(Number(m.year) || 1)),
      eraIndex, // l'ère par son index seul : un nom serait figé dans une langue (I18N-6)
      eraBand,
      mapSeed: Number(fr.mapSeed != null ? fr.mapSeed : state.mapSeed) || 0,
      cycleIndex: Number.isFinite(m.cycleIndex) ? m.cycleIndex : (state.cycles || 0),
      footprint: { gridN: fr.gridN, cx: Math.round(fr.core.x), cy: Math.round(fr.core.y), radius: fr.radius }
    });
    while (state.vestiges.length > 3) state.vestiges.shift();
  } catch (e) { /* sans effet */ }
}

setCaptureVestigeHandler(captureVestige);

export {
  CM,
  CM_MAP_BUILDINGS,
  CM_ROLES,
  CM_WONDERS,
  ROAD_E,
  ROAD_N,
  ROAD_S,
  ROAD_W,
  roadWidthFor,
  medianHalfFor,
  WONDER_CLEAR_R,
  cityCounts,
  cityGridDims,   // pour ancienPlacementRetire.test.js (la grille sans les grands ensembles)
  cmCitizenName,
  cmCheckWonders,
  cmClamp,
  cmBuildRoadGraph,
  connectBuildingsToNetwork,
  upgradeTrunkByUsage,
  computeRoadUsage,
  applyRoadWidenings,
  cmEngineAtelierFoot,
  cmHash,
  cmIsWalkableRoad,
  cmDeName,
  cmPick,
  cmResidenceName,
  cmRoadName,
  cmWonderSlot,
  cmWonderActiveIds,
  cmWonderExtent,
  cmWonderSpriteDims,
  cmWonderCoreR,
  cmWonderHeightTiles,
  cmWonderBaseTiles,
  cmForEachWonderCell,
  WONDER_TIER_NAMES,
  TREE_TUNE,
  treeBandMul,
  treeCanvasT,
  treeRadius,
  treeDensK,
  computeCityLayout,
  computeTerrePleinSegments
};
