/* ============================================================================
 * SCÈNES DES BÂTIMENTS-MOTEUR : props PixelLab (décor par stade d'ère, tour
 * cosmique aux bandes 7-9), humains de scène, bandes animées, paliers de halle,
 * ruines de la Chute. drawCityEngineSprite sert les familles ÉCONOMIQUES ;
 * engineSprites.js sert le savoir et l'infra et s'appuie sur les outils d'ici.
 * Coords normalisées via ox+sw*x / oy+sh*y. Pas de repli procédural (MORT-2) :
 * un décor pas encore décodé ne dessine rien (cf. PROP_KEYS plus bas).
 * ========================================================================== */
import { AGENT_SCALE, agentSetForBand, agentSpecFor, drawNamedAgentIso } from './agents.js';
import { CM } from './layout.js';
import { queueFlameGlow } from './flameGlow.js';
import { lightCutImage } from './lightLayer.js';
import { recDens, grainProbe, palierK, PALIER_SPANSUM, palierHFrac, COSMIC_TOWER_H } from './spriteScale.js';
import { pxProbe, recPx } from './pixelGrid.js';
import { snapDev } from './blitSnap.js';
import { drawSunShadow } from './iso/isoSunShadow.js';
import { drawSmoke } from './iso/boatFx.js';
import { tradeStage } from './iso/isoFleet.js';
import { drawSceneEmissive } from './sceneEmissive.js';
import { drawSceneWindows } from './sceneWindows.js';
import { RUIN_PROPS } from './ruinArt.js';
import { razeImageData } from './ruinRaze.js';
import { engineOrientKey } from './engineOrient.js';

// HALOS DES BÂTIMENTS-MOTEUR (2026-10-01, Raph : « l'allumage de nuit est à fignoler »,
// « les nouveaux bâtiments sont un peu flous »). Chaque scène portait une lueur additive
// qui respire, peinte AVANT le voile de nuit (un multiply bleu) : le JOUR, sa part fixe
// (0,10-0,16) voilait le bâtiment d'une brume claire ; la NUIT, le voile la refroidissait
// en brouillard bleu-blanc autour des bâtiments modernes. Les fenêtres s'allument
// désormais pour de vrai (sceneWindows.js) : la lueur ne garde, la nuit seulement, qu'un
// reste de lumière répandue. `day` = part du jour gardée (0), `night` = part de nuit
// gardée, `cosmic` = halo de bande des scènes cosmiques en nacre, la nuit.
// Molette : __engineHalo({ day, night, cosmic }).
export const ENGINE_HALO = { day: 0, night: 0.4, cosmic: 0.5 };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__engineHalo = (o) => { if (o) Object.assign(ENGINE_HALO, o); return { ...ENGINE_HALO }; };
}
import { snowSprite, snowRoofTune } from './snowRoof.js';
import { WINTER } from './seasonMode.js';

// ── PALIERS DE HALLE (grain, docs/PLAN-EGALISATION-GRAIN.md §5) ─────────────
// Un sprite de scène qui possède une version `<clé>-grand` (manifeste
// PALIER_SPANSUM) la prend AUTOMATIQUEMENT dès que la tuile dessinée est une
// HALLE, c'est-à-dire dès que son lot atteint l'empreinte 3 (spanSum ≥ 6).
// Générique exprès : sans ça il faudrait une branche à la main par sprite, et
// la campagne en compte ~96. Les ateliers (spanSum ≤ 4) ne sont jamais
// concernés, donc un prop de décor ne risque pas d'être substitué.
//
// Le grand est calibré POUR cette boîte : on ignore les fractions du petit et
// on applique sa hauteur de calibrage × palierK (compensation des empreintes
// 4-5), la largeur suivant le ratio NATIF de son canvas — blitProp n'préserve
// pas le ratio, l'oublier étirerait le bâtiment.
//
// COUCHES JUMELÉES. Le stade 0 du Culte des ancêtres est en DEUX couches — le
// cercle de mégalithes (prop statique) et sa flamme (bande animée) — pour que
// les pierres ne gigotent pas. Substituer le seul cercle laisserait la flamme
// à l'échelle ET à la place du petit, donc à côté de son foyer : les deux
// couches n'ont un palier que si les DEUX grands sont chargés, et elles
// partagent alors fractions et canvas (192×160 des deux côtés → même rectangle
// dessiné, sans que le site d'appel ait à le savoir).
const PALIER_SPAN_MIN = 6;
const PALIER_JUMEAU = { 'ancestralcult-back': 'ancestralcult-fire', 'ancestralcult-fire': 'ancestralcult-back' };
let curSpanSum = 0;
// EMPREINTE DU LOT EN COURS (gw+gh), lue par palierImg. À poser AVANT tout blit,
// par CHAQUE entrée du rendu de scène — il y en a deux, et c'est le piège :
// `drawCityEngineSprite` sert les familles ÉCONOMIE, mais les familles SAVOIR et
// INFRA (dont le culte des ancêtres) sont dessinées par `drawEngineSpriteCore`
// (engineSprites.js), qui rend et RETOURNE bien avant sa retombée sur
// drawCityEngineSprite. Sans cet appel, leurs paliers lisaient l'empreinte de la
// tuile PRÉCÉDEMMENT dessinée : un atelier prenait le sprite de halle si une
// halle venait de passer, et l'inverse. Ça ne se voit pas sur une capture — le
// mauvais sprite est un sprite valide, juste à la mauvaise taille.
export function setEngineSpan(gw, gh) { curSpanSum = (gw | 0) + (gh | 0); }
// GRAINE DE L'INSTANCE EN COURS (coordonnées de tuile hachées), lue par blitProp pour
// les bureaux allumés la nuit (sceneWindows.js) : deux bâtiments du même dessin
// n'allument pas les mêmes fenêtres. Même piège que l'empreinte : à poser par CHAQUE
// entrée du rendu de scène.
let curSeed = 0;
export function setEngineSeed(seed) { curSeed = seed >>> 0; }
// Horloge de la scène en cours (ms), lue par blitProp pour ce qui VIT dans les
// scènes peintes (LIVE_LAYERS) : blitProp n'a pas de `now` et sert cent appelants.
let curNow = 0;
export function setEngineNow(now) { curNow = +now || 0; }
// CÔTÉ DE RUE DU LOT EN COURS (S/E/N/W, engineOrient.engineFaceOf), lu par blitProp et
// blitCosmicTower : un décor qui a ses quatre vues prend celle qui regarde la rue. Même
// piège que l'empreinte : à poser par chaque entrée du rendu de scène (null hors scène).
let curFace = null;
export function setEngineFace(face) { curFace = face || null; }
// Chargement PARESSEUX d'un sprite de palier — un grand ne descend du réseau que
// si son palier s'arme (les bandes, elles, seraient sinon préchargées par
// ensureAnim pour tout le monde). Renvoie l'Image prête, ou null tant qu'elle
// ne l'est pas : le petit sert de repli.
function palierAsset(cle) {
  const bande = !!ANIM_BANDS[cle];
  const reg = bande ? animImg : propImg;
  let im = reg[cle];
  if (!im) {
    if (typeof Image === 'undefined') return null;
    im = new Image();
    im.onload = () => { if (bande) animReadyN[cle] = 1; propVersion += 1; };
    im.src = '/pixelart/agents/buildings/' + cle + '.png';
    reg[cle] = im;
    return null;
  }
  return (im.complete && im.naturalWidth > 0) ? im : null;
}
// ── UNE SCÈNE COSMIQUE PAR FAMILLE (2026-10-01, « le meilleur rendu futuriste ») ──
// Aux bandes 7-9, les dix-neuf familles SAVOIR/INFRA se partageaient six images par
// bande (dôme, flèche, halle, temple, arches, ossature — COSMIC_SAVOIR_FAM), toutes
// des TOURS posées à 1,72 hauteur de boîte : la « forêt de flèches identiques » de
// l'audit. Chaque famille reçoit désormais SON bâtiment, dessiné pour sa fonction et
// sa hauteur (cf. scripts/fetchCosmicScene.mjs). Chargement PARESSEUX, comme les
// paliers : une partie ne voit qu'une bande à la fois. Liste EXPLICITE des images
// livrées — en dev, Vite rend 200 sur un fichier absent, et le .exe le compte en
// erreur : on ne demande que ce qui existe (garde : cosmicScenes.test.js).
export const COSMIC_SCENE_KEYS = new Set([
  'cosmic-schools-7', 'cosmic-think_tanks-7', 'cosmic-libraries-7', 'cosmic-observatories-7',
  'cosmic-ministries-7', 'cosmic-scribes-7', 'cosmic-storytellers-7', 'cosmic-academies-7',
  'cosmic-ancestral_cult-7', 'cosmic-universities-7', 'cosmic-printing_houses-7', 'cosmic-archive_grids-7',
  'cosmic-sewers-7', 'cosmic-courthouses-7', 'cosmic-public_works-7', 'cosmic-ruin_architects-7',
  'cosmic-bureaucracy-7', 'cosmic-watch-7', 'cosmic-schools-8', 'cosmic-think_tanks-8',
  'cosmic-libraries-8', 'cosmic-observatories-8', 'cosmic-ministries-8', 'cosmic-scribes-8',
  'cosmic-storytellers-8', 'cosmic-academies-8', 'cosmic-ancestral_cult-8', 'cosmic-universities-8',
  'cosmic-printing_houses-8', 'cosmic-archive_grids-8', 'cosmic-sewers-8', 'cosmic-courthouses-8',
  'cosmic-public_works-8', 'cosmic-ruin_architects-8', 'cosmic-bureaucracy-8', 'cosmic-watch-8',
  'cosmic-schools-9', 'cosmic-think_tanks-9', 'cosmic-libraries-9', 'cosmic-observatories-9',
  'cosmic-ministries-9', 'cosmic-scribes-9', 'cosmic-storytellers-9', 'cosmic-academies-9',
  'cosmic-ancestral_cult-9', 'cosmic-universities-9', 'cosmic-printing_houses-9', 'cosmic-archive_grids-9',
  'cosmic-sewers-9', 'cosmic-courthouses-9', 'cosmic-public_works-9', 'cosmic-ruin_architects-9',
  'cosmic-bureaucracy-9', 'cosmic-watch-9',
]);
// Les scènes du STYLE NACRE (savoir/infra ci-dessus + les familles économie, dont
// l'image `<famille>-cosmic-<bande>` a été redessinée en place). Leur verre s'allume la
// nuit (sceneEmissive.js) et leur halo de jour se fait discret : un nuage de lumière
// jade posé sur un bâtiment blanc en plein midi se lisait comme une brume.
export const COSMIC_PEARL = new Set([
  'market-cosmic-7', 'forager-cosmic-7', 'granary-cosmic-7', 'caravan-cosmic-7',
  'guild-cosmic-7', 'mint-cosmic-7', 'bank-cosmic-7', 'port-cosmic-7',
  'mill-cosmic-7', 'market-cosmic-8', 'forager-cosmic-8', 'granary-cosmic-8',
  'caravan-cosmic-8', 'guild-cosmic-8', 'mint-cosmic-8', 'bank-cosmic-8',
  'port-cosmic-8', 'mill-cosmic-8', 'market-cosmic-9', 'forager-cosmic-9',
  'granary-cosmic-9', 'caravan-cosmic-9', 'guild-cosmic-9', 'mint-cosmic-9',
  'bank-cosmic-9', 'port-cosmic-9', 'mill-cosmic-9',
]);
const isPearl = (k) => COSMIC_PEARL.has(k) || COSMIC_SCENE_KEYS.has(k);
export function cosmicSceneKey(kind, band) {
  const k = 'cosmic-' + kind + '-' + band;
  if (!COSMIC_SCENE_KEYS.has(k)) return null;
  return palierAsset(k) ? k : null;
}
// La VUE TOURNÉE d'un décor vers la rue du lot en cours (après la substitution de
// palier : « <clé>-grand-fr »), si elle existe et qu'elle est chargée ; sinon null, et
// la vue sud-ouest sert de repli le temps qu'elle arrive. Chargement paresseux, dans le
// même registre que les décors (propIm la sert ensuite telle quelle).
function orientImg(p) {
  const cle = engineOrientKey(p, curFace);
  if (!cle) return null;
  let im = propImg[cle];
  if (!im) {
    if (typeof Image === 'undefined') return null;
    im = new Image();
    im.onload = () => { propVersion += 1; };
    im.src = '/pixelart/agents/buildings/' + cle + '.png';
    propImg[cle] = im;
    return null;
  }
  return (im.complete && im.naturalWidth > 0) ? { im, cle } : null;
}
function palierImg(p) {
  if (curSpanSum < PALIER_SPAN_MIN) return null;
  const cle = p + '-grand';
  if (!PALIER_SPANSUM[cle]) return null;               // pas de palier livré
  // Le jumeau est demandé AVANT le test de disponibilité, sans quoi son
  // chargement ne démarrerait qu'à la frame suivante et la substitution
  // attendrait un tour de plus (le repli est correct, mais il dure).
  const jum = PALIER_JUMEAU[p];
  const imJum = jum ? palierAsset(jum + '-grand') : true;
  const im = palierAsset(cle);
  if (!im || !imJum) return null;                      // pas l'une sans l'autre ; le petit sert de repli
  return { im, cle };
}

// Sonde du grain : densité blitée (px écran par px source) normalisée à zoom 1,
// pour __grainAudit — la vérité runtime qui calibrera les paliers de halles.
// Éteinte hors audit (grainProbe, spriteScale.js) : appelée à chaque blitProp.
const recBlitDens = (key, drawH, nat) => {
  if (grainProbe.on && nat > 0) recDens(key, drawH / nat / ((CM.cam && CM.cam.zoom) || 1));
  // Sonde G0 (pixelGrid.js) : la même mesure versée au relevé COMMUN du plan de
  // la grille — une seule ligne pour toutes les scènes moteur, dont l'écart
  // interne (densité « variable ∝ empreinte ») ressort en min/max.
  if (pxProbe.on) recPx('bati · scene', nat, drawH);
};

// ── Taille des HUMAINS de scène = celle des HABITANTS de la carte ────────────
// Les scènes moteur reçoivent une BOÎTE (ox,oy,sw,sh) dont la taille CROÎT avec
// l'emprise du bâtiment (en iso, sh = (spanX+spanY)·CM.TILE·zoom·0.72). Dimensionner
// un humain sur `sh` (l'ancien `sh·hFrac`) le transformait donc en GÉANT sur les gros
// lots — d'où le retour « on dirait des géants ». On les cale désormais sur la TUILE
// écran (CM.TILE·zoom), EXACTEMENT comme les habitants animés (drawEraAgentIso :
// CM.TILE·zoom · scale(≈0.85) · AGENT_SCALE), INDÉPENDAMMENT de la
// boîte. L'ancien `hFrac` (fraction de boîte ≈0.38..0.5) est réinterprété en simple
// multiplicateur RELATIF autour de l'adulte de référence (0.46) → foreground/arrière-plan.
// `k` est exprimé AVANT AGENT_SCALE, exactement comme les `scale` des habitants (0.85
// pour un adulte) : la multiplication par AGENT_SCALE se fait dans sceneHumanH. L'ancien
// 0.68 était le PRODUIT figé (0.85 × 0.8) — il ne suivait donc pas les changements
// d'échelle des habitants (Raph 2026-07-29 : « applique la dif de taille aux humains des
// scènes moteur »). Molette live __sceneHumanScale(0.85 = défaut).
const SCENE_HUMAN = { k: 0.85, ref: 0.46 };
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__sceneHumanScale = (v) => { if (v != null) SCENE_HUMAN.k = +v; return SCENE_HUMAN.k; };
// Hauteur écran cible d'un humain de scène (px), calquée sur un habitant adulte.
// ⚠ C'est la hauteur du CADRE carré, pas celle du bonhomme : stripMetrics cale
// tout perso à SCENE_HUMAN_INK de son cadre. Comparer un objet posé à ses pieds
// à cette valeur-là le fait 37 % trop grand — passer par sceneHumanInkH.
function sceneHumanH(hFrac) {
  const tile = (CM.TILE || 32) * ((CM.cam && CM.cam.zoom) || 1);
  return tile * SCENE_HUMAN.k * AGENT_SCALE * ((hFrac || SCENE_HUMAN.ref) / SCENE_HUMAN.ref);
}
// Part du cadre réellement occupée par un humain de scène : stripMetrics
// RENORMALISE chaque bande à cette fraction (k = INK/ratio), donc la hauteur
// d'encre d'un perso vaut toujours SCENE_HUMAN_INK × sceneHumanH, quelle que
// soit la bande. C'est LA référence contre laquelle se mesure tout objet posé
// au sol à côté de lui (≈ 10 px apparents, cf. scripts/data/sprite-apparent.json).
const SCENE_HUMAN_INK = 0.728;
const sceneHumanInkH = (hFrac) => sceneHumanH(hFrac) * SCENE_HUMAN_INK;
// Ombre de contact d'un humain/mulet, proportionnelle à SA taille (plus à la boîte).
// cx/fy = centre/ligne de pieds en fraction de boîte (comme les blit*) ; wMul élargit
// l'ombre (quadrupèdes).
function sceneHumanShadow(ctx, ox, oy, sw, sh, cx, fy, hFrac, alpha = 0.2, wMul = 1) {
  const dH = sceneHumanH(hFrac);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(ox + sw * cx, oy + sh * fy + dH * 0.03, dH * 0.17 * wMul, dH * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
}

const COSMIC_PAL = {
  7: { core: "#0c241a", mid: "#16442e", glow: "90,240,180", edge: "#3aeca0", lite: "#bdf8de", deep: "#040f0a", deepRGB: "4,15,10" },
  8: { core: "#221808", mid: "#3e2c10", glow: "255,205,120", edge: "#f4c25c", lite: "#ffeaba", deep: "#110a03", deepRGB: "17,10,3" },
  9: { core: "#161226", mid: "#262044", glow: "170,140,255", edge: "#c8aef0", lite: "#ece2ff", deep: "#08060f", deepRGB: "8,6,15" }
};

// ── Cueilleur pixel-art animé (PixelLab) ─────────────────────────────────────
// Le bonhomme du stade 0 des foragers, piloté par le code (navette panier↔buisson),
// comme les piétons d'agents.js. On ne charge QUE les clips réellement utilisés par
// la scène (pas de 404). Bandes /pixelart/agents/forager-<clip>.png, 68px/frame.
// Rien tant que tout n'est pas chargé (MORT-2). Frame carré → pieds
// ancrés à 0.88 du cadre, centré en x. Clips : walk-east/west (navette),
// pick-east (bras tendu dans l'arbre), crouch-south (accroupi au panier).
// Métriques MESURÉES sur la frame 0 d'une bande (cache par Image) :
// - foot : bas de la bbox opaque / fh — les vieilles bandes étaient cadrées pieds à
//   ~0.88, les bandes FLAT 2026-08 centrent le perso (~0.75) ; un ancrage constant
//   ferait flotter l'un ou l'autre. Même logique que agentFootF (agents.js).
// - k : compensation de taille 0.728/ratio — sceneHumanH cible un CANVAS d'habitant
//   historique (perso = 72,8 % du cadre) ; les bandes flat ne logent le perso qu'à
//   ~50 % → sans k il ferait les 2/3 de la taille voulue. Vieille bande (~0.78) → k≈0.93.
const stripMetricsCache = new WeakMap();
function stripMetrics(img) {
  const fallback = { foot: 0.88, k: 1 };
  if (!img || !(img.naturalWidth > 0)) return fallback;
  let m = stripMetricsCache.get(img);
  if (m) return m;
  try {
    const fh = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = fh; cv.height = fh;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, fh, fh, 0, 0, fh, fh);
    const data = g.getImageData(0, 0, fh, fh).data;
    let top = -1, bottom = -1;
    for (let y = 0; y < fh; y += 1) {
      for (let x = 0; x < fh; x += 1) {
        if (data[(y * fh + x) * 4 + 3] > 16) { if (top < 0) top = y; bottom = y; break; }
      }
    }
    const ratio = bottom >= 0 ? (bottom - top + 1) / fh : SCENE_HUMAN_INK;
    m = { foot: bottom >= 0 ? (bottom + 1) / fh : 0.88, k: SCENE_HUMAN_INK / Math.max(0.2, ratio) };
  } catch { m = fallback; }
  stripMetricsCache.set(img, m);
  return m;
}
const stripFootF = (img, fallback = 0.88) => (img && img.naturalWidth > 0 ? stripMetrics(img).foot : fallback);
const FORAGER_FH = 68; // repli si l'image n'est pas décodée (les bandes flat sortent en 56-60)
const FORAGER_CLIPS = { 'walk-east': 6, 'walk-west': 6, 'pick-east': 7, 'crouch-south': 5 };
const foragerImg = {};       // 'clip' -> Image
const foragerHalf = {};      // 'clip' -> bande demi-taille pré-cuite (optionnelle, un essai)
let foragerInit = false, foragerReadyN = 0;
function ensureForager() {
  if (foragerInit || typeof Image === 'undefined') return;
  foragerInit = true;
  for (const clip of Object.keys(FORAGER_CLIPS)) {
    const im = new Image();
    im.onload = () => { foragerReadyN += 1; };
    im.src = '/pixelart/agents/buildings/forager-' + clip + '.png';
    foragerImg[clip] = im;
    const hf = new Image();
    hf.src = '/pixelart/agents/buildings/forager-' + clip + '-half.png';
    foragerHalf[clip] = hf;
  }
}
const foragerReady = () => { ensureForager(); return foragerReadyN >= Object.keys(FORAGER_CLIPS).length; };
// Blit d'une frame : coords en FRACTION de tuile (cx centre, fy = ligne de pieds),
// hFrac = hauteur du cadre en fraction de sh (le perso remplit ~70 % du cadre).
// Taille de frame DÉDUITE de l'image (frames carrées) + coordonnées ENTIÈRES + bascule
// sur la bande -half sous 70 % de la pleine : mêmes règles que drawNamedAgentIso
// (agents.js), sinon le nearest sous-pixel fourmille et le détail se noie au petit zoom.
function blitForager(ctx, ox, oy, sw, sh, cx, fy, clip, frame, hFrac) {
  let img = foragerImg[clip]; if (!img) return;
  let fh = img.naturalHeight || FORAGER_FH;
  const drawH = Math.max(1, Math.round(sceneHumanH(hFrac) * stripMetrics(img).k)), drawW = drawH;
  const half = foragerHalf[clip];
  if (half && half.complete && half.naturalWidth > 0 && drawH <= fh * 0.7) { img = half; fh = half.naturalHeight; }
  const left = Math.round(ox + sw * cx - drawW / 2);
  const top = Math.round(oy + sh * fy - stripFootF(img) * drawH);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, frame * fh, 0, fh, fh, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
}

// ── Paysan des CHAMPS : perso PixelLab dédié (chapeau de paille + fourche) qui
// MARCHE le long du champ. 4 directions, 6 frames, 68px. /pixelart/agents/farmer-<dir>.png.
const FARMER_FH = 68, FARMER_NF = 6; // FH = repli si l'image n'est pas décodée
const FARMER_DIRS = ['south', 'east', 'north', 'west'];
const farmerImg = {};
const farmerHalf = {};
let farmerInit = false, farmerReadyN = 0;
function ensureFarmer() {
  if (farmerInit || typeof Image === 'undefined') return;
  farmerInit = true;
  for (const d of FARMER_DIRS) {
    const im = new Image(); im.onload = () => { farmerReadyN += 1; }; im.src = '/pixelart/agents/inhabitants/farmer-' + d + '.png'; farmerImg[d] = im;
    const hf = new Image(); hf.src = '/pixelart/agents/inhabitants/farmer-' + d + '-half.png'; farmerHalf[d] = hf;
  }
}
const farmerReady = () => { ensureFarmer(); return farmerReadyN >= FARMER_DIRS.length; };
// Mêmes règles que blitForager : frame déduite, coordonnées entières, bascule -half.
function blitFarmer(ctx, ox, oy, sw, sh, cx, fy, dir, frame, hFrac) {
  let im = farmerImg[dir]; if (!im) return;
  let fh = im.naturalHeight || FARMER_FH;
  const drawH = Math.max(1, Math.round(sceneHumanH(hFrac) * stripMetrics(im).k)), drawW = drawH;
  const half = farmerHalf[dir];
  if (half && half.complete && half.naturalWidth > 0 && drawH <= fh * 0.7) { im = half; fh = half.naturalHeight; }
  const left = Math.round(ox + sw * cx - drawW / 2), top = Math.round(oy + sh * fy - stripFootF(im) * drawH);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, frame * fh, 0, fh, fh, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
}

// ── Bateau de l'ÈRE pour un PORT : réutilise les sprites bateau (boat-{vstage}.png,
// mêmes fichiers que drawShips). Bande éventuellement animée (largeur>hauteur).
// Dimensionné en CELLULES (taille constante). Chargement paresseux par stage.
const portBoatImg = {};
function ensurePortBoat(name) {
  let c = portBoatImg[name];
  if (c) return c;
  c = { img: null, ready: false };
  portBoatImg[name] = c;
  if (typeof Image !== 'undefined') { const im = new Image(); im.onload = () => { c.ready = true; }; im.src = '/pixelart/agents/boats/boat-' + name + '.png'; c.img = im; }
  return c;
}
function blitEraBoat(ctx, ox, oy, sw, sh, cx, cy, cells, name, now, gw) {
  const c = ensurePortBoat(name); if (!c || !c.ready || !c.img || !(c.img.naturalWidth > 0)) return false;
  const im = c.img, bfh = im.naturalHeight || 64, bnf = Math.max(1, Math.round((im.naturalWidth || bfh) / bfh));
  const bf = bnf > 1 ? Math.floor((now || 0) / 160) % bnf : 0;
  const dW = cells * (sw / Math.max(1, gw)), dH = dW;
  const bob = Math.sin((now || 0) / 1050) * dH * 0.045;
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, bf * bfh, 0, bfh, bfh, ox + sw * cx - dW / 2, oy + sh * cy - dH / 2 + bob, dW, dH);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// Une navette complète : marche panier→buisson, tend le bras dans l'arbre, revient
// (fruit en main), s'accroupit au panier pour déposer. phase = décalage du 2e cueilleur.
function drawPixelForager(ctx, ox, oy, sw, sh, now, phase, hFrac) {
  const T = 6400;
  const cyc = (((now || 0) / T) + phase) % 1;
  const X_BASKET = 0.26, X_BUSH = 0.56, FY = 0.78;
  const NF = (k) => FORAGER_CLIPS[k];
  let cx, clip, frame, carry = false;
  if (cyc < 0.34) {                                   // marche panier → buisson
    cx = X_BASKET + (X_BUSH - X_BASKET) * (cyc / 0.34);
    clip = 'walk-east'; frame = Math.floor((now || 0) / 150) % NF(clip);
  } else if (cyc < 0.5) {                             // bras tendu dans l'arbre
    cx = X_BUSH; clip = 'pick-east';
    frame = Math.min(NF(clip) - 1, Math.floor((cyc - 0.34) / 0.16 * NF(clip)));
  } else if (cyc < 0.84) {                            // retour (fruit en main)
    cx = X_BUSH + (X_BASKET - X_BUSH) * ((cyc - 0.5) / 0.34);
    clip = 'walk-west'; frame = Math.floor((now || 0) / 150) % NF(clip); carry = true;
  } else {                                            // accroupi au panier
    cx = X_BASKET; clip = 'crouch-south';
    frame = Math.min(NF(clip) - 1, Math.floor((cyc - 0.84) / 0.16 * NF(clip)));
  }
  // Ombre de contact (∝ taille humaine)
  sceneHumanShadow(ctx, ox, oy, sw, sh, cx, FY, hFrac, 0.22);
  blitForager(ctx, ox, oy, sw, sh, cx, FY, clip, frame, hFrac);
  // Petit fruit rapporté, tenu devant (côté ouest) au retour — offsets ∝ taille humaine
  if (carry) {
    const dH = sceneHumanH(hFrac), hx = ox + sw * cx, fyPx = oy + sh * FY;
    ctx.fillStyle = '#c83010';
    ctx.beginPath(); ctx.arc(hx - dH * 0.14, fyPx - dH * 0.40, dH * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,160,0.4)';
    ctx.beginPath(); ctx.arc(hx - dH * 0.155, fyPx - dH * 0.42, dH * 0.018, 0, Math.PI * 2); ctx.fill();
  }
}

// ── LA NAVETTE D'UN HUMAIN DE SCÈNE (docs/PLAN-COMPORTEMENTS.md, lot 5) ──────
// Elle allait au MÉTRONOME : vitesse constante, demi-tour instantané à chaque bout, et
// des pas tirés de l'horloge — les pieds glissaient. Désormais : élan et freinage, une
// halte au bout (cueillir, payer au comptoir), une autre au départ, des allures qui
// changent d'un aller-retour à l'autre, et des pas calés sur la DISTANCE parcourue.
// Rend { cx, dir (+1 vers xB), walking, dist (px marchés depuis le départ), c (rang du
// tour), u (avancement dans le tour) }.
const sceneEase = (x) => x * x * (3 - 2 * x);
function sceneShuttle(now, xA, xB, T, phase, sw) {
  const f = (now || 0) / T + phase, c = Math.floor(f), u = f - c;
  const h = (((Math.imul(c + 1013, 2654435761) >>> 0) % 1000) / 1000);
  const go = 0.34 + 0.08 * h, back = 0.34 + 0.08 * (1 - h);     // part de marche aller / retour
  const stay = (1 - go - back) * (0.45 + 0.3 * h);                 // halte au bout, le reste au départ
  const len = Math.abs(xB - xA) * sw;
  if (u < go) { const s = sceneEase(u / go); return { cx: xA + (xB - xA) * s, dir: 1, walking: true, dist: s * len, c, u }; }
  if (u < go + stay) return { cx: xB, dir: 1, walking: false, dist: len, c, u };
  if (u < go + stay + back) { const s = sceneEase((u - go - stay) / back); return { cx: xB + (xA - xB) * s, dir: -1, walking: true, dist: len * (1 + s), c, u }; }
  const uA = go + stay + back;
  return { cx: xA, dir: -1, walking: false, dist: 2 * len, c, u, tail: (u - uA) / Math.max(1e-6, 1 - uA) };
}
// Le bonhomme de l'ÈRE (aux âges où le chapeau de paille et le panier d'osier n'ont
// plus cours) : un habitant de la ville, à la taille d'un humain de scène.
let _sceneBand = 0;
function drawSceneCitizen(ctx, ox, oy, sw, sh, cx, fy, st, charType, variant, hFrac, now, phase) {
  const spec = agentSpecFor(agentSetForBand(_sceneBand), charType, variant);
  if (!spec) return false;
  const z = (CM.cam && CM.cam.zoom) || 1;
  // Bandes diagonales : sud-est vers la droite de l'écran, sud-ouest vers la gauche.
  const d = drawNamedAgentIso(ctx, Math.round(ox + sw * cx), Math.round(oy + sh * fy), z, spec.name, spec.scale,
    st.dir > 0 === (st.right !== false) ? 0 : 2, st.walking, now, phase, (hFrac || SCENE_HUMAN.ref) / SCENE_HUMAN.ref, st.walking ? st.dist : null, true);
  return !!d;
}

// Paysan RÉUTILISÉ (blitFarmer) en navette entre deux abscisses (xA gauche ↔ xB droite)
// sur la ligne de pieds fy : marche est (aller) puis ouest (retour, petit fruit en main).
// T = période ms ; phase décale un 2e paysan ; hFrac = hauteur humaine PAR CELLULE.
// Sert aux stades 1-2 du cueilleur (verger / serre), à la place du perso caveman du stade 0.
function drawFarmerShuttle(ctx, ox, oy, sw, sh, now, xA, xB, fy, T, phase, hFrac) {
  const st = sceneShuttle(now, xA, xB, T, phase, sw);
  const cx = st.cx;
  const dir = st.dir > 0 ? 'east' : 'west';
  const carry = st.dir < 0;                         // fruit rapporté vers xA
  const frame = st.walking ? Math.floor(st.dist / Math.max(1, sceneHumanH(hFrac) * 0.11)) % FARMER_NF : 0;
  sceneHumanShadow(ctx, ox, oy, sw, sh, cx, fy, hFrac, 0.2);
  // Aux âges industriels et après, l'habitant de l'ère (le chapeau de paille et la
  // fourche y étaient anachroniques).
  if (_sceneBand >= 5) drawSceneCitizen(ctx, ox, oy, sw, sh, cx, fy, { ...st, right: xB > xA }, phase >= 0.5 ? 1 : 0, Math.floor(phase * 7), hFrac, now, phase);
  else blitFarmer(ctx, ox, oy, sw, sh, cx, fy, dir, frame, hFrac);
  if (carry) { // fruit tenu devant, côté ouest — offsets ∝ taille humaine
    const dH = sceneHumanH(hFrac), hx = ox + sw * cx, fyPx = oy + sh * fy;
    ctx.fillStyle = '#c83010';
    ctx.beginPath(); ctx.arc(hx - dH * 0.11, fyPx - dH * 0.42, dH * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,160,0.4)';
    ctx.beginPath(); ctx.arc(hx - dH * 0.125, fyPx - dH * 0.44, dH * 0.018, 0, Math.PI * 2); ctx.fill();
  }
}

// ── Chaland des MARCHÉS : personne au PANIER réutilisée (inhabitant `basket-man`, 4 dir ×
// 6 frames 68px, /pixelart/agents/inhabitants/basket-man-<dir>.png ; panier BAKÉ dans le
// sprite) qui fait la navette bord ↔ comptoir. Même structure que le paysan (blitFarmer).
const BASKET_FH = 68, BASKET_NF = 6; // FH = repli si l'image n'est pas décodée
const BASKET_DIRS = ['south', 'east', 'north', 'west'];
const basketImg = {};
const basketHalf = {};
const basketWImg = {};
const basketWHalf = {};
let basketInit = false, basketReadyN = 0;
function ensureBasket() {
  if (basketInit || typeof Image === 'undefined') return;
  basketInit = true;
  for (const d of BASKET_DIRS) {
    const im = new Image(); im.onload = () => { basketReadyN += 1; }; im.src = '/pixelart/agents/inhabitants/basket-man-' + d + '.png'; basketImg[d] = im;
    const hf = new Image(); hf.src = '/pixelart/agents/inhabitants/basket-man-' + d + '-half.png'; basketHalf[d] = hf;
    const iw = new Image(); iw.src = '/pixelart/agents/inhabitants/basket-woman-' + d + '.png'; basketWImg[d] = iw;
    const hw = new Image(); hw.src = '/pixelart/agents/inhabitants/basket-woman-' + d + '-half.png'; basketWHalf[d] = hw;
  }
}
const basketReady = () => { ensureBasket(); return basketReadyN >= BASKET_DIRS.length; };
// Mêmes règles que blitForager : frame déduite, coordonnées entières, bascule -half.
function blitBasket(ctx, ox, oy, sw, sh, cx, fy, dir, frame, hFrac, woman = false) {
  const wi = woman ? basketWImg[dir] : null;
  const useW = !!(wi && wi.complete && wi.naturalWidth > 0);
  let im = useW ? wi : basketImg[dir]; if (!im) return;
  let fh = im.naturalHeight || BASKET_FH;
  const drawH = Math.max(1, Math.round(sceneHumanH(hFrac) * stripMetrics(im).k)), drawW = drawH;
  const half = useW ? basketWHalf[dir] : basketHalf[dir];
  if (half && half.complete && half.naturalWidth > 0 && drawH <= fh * 0.7) { im = half; fh = half.naturalHeight; }
  const left = Math.round(ox + sw * cx - drawW / 2), top = Math.round(oy + sh * fy - stripFootF(im) * drawH);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, frame * fh, 0, fh, fh, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
}
// Chaland en navette entre xA (bord) et xB (comptoir) sur la ligne de pieds fy ; T période,
// phase décale un 2e chaland. hFrac = hauteur humaine par cellule. (Panier déjà dans le sprite.)
function drawShopperShuttle(ctx, ox, oy, sw, sh, now, xA, xB, fy, T, phase, hFrac) {
  const st = sceneShuttle(now, xA, xB, T, phase, sw);
  const cx = st.cx;
  const dir = (st.dir > 0) === (xB < xA) ? 'west' : 'east';   // va vers le comptoir puis repart
  // UN CLIENT DIFFÉRENT À CHAQUE TOUR : il repart par le bord (xA) où il s'efface, le
  // suivant en arrive — un sur deux est une cliente.
  const tail = st.tail || 0;                          // halte au bord : 0 → 1
  const cl = st.c + (tail > 0.5 ? 1 : 0);              // le suivant arrive à mi-halte
  const woman = ((Math.imul(cl + 7, 2246822519) >>> 0) % 2) === 1;
  const a = st.tail == null ? 1 : Math.abs(1 - 2 * tail);
  const pa = ctx.globalAlpha;
  if (a < 1) ctx.globalAlpha = pa * a;
  sceneHumanShadow(ctx, ox, oy, sw, sh, cx, fy, hFrac, 0.2 * a);
  if (_sceneBand >= 5) drawSceneCitizen(ctx, ox, oy, sw, sh, cx, fy, { ...st, right: xB > xA }, woman ? 1 : 0, ((cl % 3) + 3) % 3, hFrac, now, phase);
  else {
    const frame = st.walking ? Math.floor(st.dist / Math.max(1, sceneHumanH(hFrac) * 0.11)) % BASKET_NF : 0;
    blitBasket(ctx, ox, oy, sw, sh, cx, fy, dir, frame, hFrac, woman);
  }
  ctx.globalAlpha = pa;
}

// Props pixel-art STATIQUES des scènes de moteur (PixelLab). Les éléments dynamiques
// (fruits, sacs…) sont BAKÉS dans le sprite. Clés = nom de fichier dans
// /pixelart/agents/ (cueilleur : -prop-tree/-basket ; entrepôt : granary-prop-silo/-sacks).
// ⚠ PAS DE REPLI PROCÉDURAL (audit du 05/10, MORT-2, décision de Raph) : tant qu'un
// décor n'est pas décodé, sa scène ne dessine RIEN — les ~3 400 lignes de scènes
// vectorielles qui le remplaçaient pendant les premières frames sont retirées. Le
// survol se rabat alors sur la boîte entière (isoEngineScene : « pas d'encre, pas de
// cache »), et le relevé des ruines de la Chute attend les décors en route
// (propsLoading, iso/isoChute.js). Seuls restent les replis PNG → PNG (décor du stade
// 0 le temps que celui de l'ère charge, scène pleine d'un feu le temps que sa bande).
const propImg = {};
// Audit du 05/10 (ASSET-5) : 27 clés retirées, jamais dessinées par un chemin atteignable
// — les modules d'aqueduc (les aqueducs sont posés en puits, isoLiveCollect), les
// parcelles des champs irrigués (isoEngineScene les refuse) et les moulins (isoMill
// les cuit) — avec leurs PNG. Leurs branches ont suivi (MORT-2).
const PROP_KEYS = ['forager-prop-tree', 'forager-prop-basket', 'forager-orchard-tree', 'forager-orchard-crates', 'forager-greenhouse', 'forager-handcart', 'forager-hydro-rack', 'forager-cosmic-7', 'forager-cosmic-8', 'forager-cosmic-9', 'granary-prop-silo', 'granary-hall', 'granary-jars', 'granary-warehouse', 'granary-crates', 'granary-hub', 'granary-cosmic-7', 'granary-cosmic-8', 'granary-cosmic-9', 'caravan-prop-sacks', 'caravan-wagon', 'caravan-truck', 'caravan-pod', 'caravan-cosmic-7', 'caravan-cosmic-8', 'caravan-cosmic-9', 'market-prop-stall', 'market-hall-tent', 'market-macellum', 'market-hall-glass', 'market-plaza-neon', 'market-cosmic-7', 'market-cosmic-8', 'market-cosmic-9', 'guild-prop-lodge', 'guild-house', 'guild-chamber', 'guild-consortium', 'guild-cosmic-7', 'guild-cosmic-8', 'guild-cosmic-9', 'port-prop-house', 'port-house-medieval', 'port-house-industrial', 'port-house-modern', 'port-prop-pontoon', 'port-dock-stone', 'port-dock-modern', 'mint-prop-house', 'mint-prop-forge', 'mint-house-steam', 'mint-house-digital', 'mint-cosmic-7', 'mint-cosmic-8', 'mint-cosmic-9', 'exchange-prop-stall', 'bank-house-renaissance', 'bank-house-neoclassical', 'bank-house-glass', 'bank-cosmic-7', 'bank-cosmic-8', 'bank-cosmic-9', 'storyteller-prop-hut', 'storyteller-hall', 'storyteller-theater', 'storyteller-media', 'scribes-prop-hall', 'scribes-scriptorium', 'scribes-archive', 'scribes-data', 'schools-prop-yard', 'schools-schoolhouse', 'schools-victorian', 'schools-campus', 'academies-prop-yard', 'academies-renaissance', 'academies-institute', 'academies-modern', 'ancestralcult-back', 'ancestralcult-prop', 'cult-shrine', 'cult-mausoleum', 'cult-memorial', 'observatories-prop-dial', 'observatories-tower', 'observatories-dome', 'observatories-array', 'libraries-prop-archive', 'libraries-monastic', 'libraries-grand', 'libraries-modern', 'universities-prop-hall', 'universities-gothic', 'universities-collegiate', 'universities-modern', 'printing-prop-workshop', 'printing-press-shop', 'printing-factory', 'printing-media', 'think-prop-council', 'think-chancellery', 'think-institute', 'think-modern', 'watch-back', 'watch-prop', 'watch-stone', 'watch-industrial', 'watch-modern', 'ministries-council', 'courthouses-lodge', 'bureau-hut', 'works-camp', 'archive-hut', 'ruins-camp', 'ministries-palace', 'ministries-capitol', 'ministries-tower', 'courthouses-tribunal', 'courthouses-neoclassical', 'courthouses-modern', 'bureau-chancery', 'bureau-office', 'bureau-tower', 'works-yard', 'works-industrial', 'works-depot', 'archive-vault', 'archive-records', 'archive-grid', 'sewers-prop', 'sewers-medieval', 'sewers-works', 'sewers-plant', 'ruins-lodge', 'ruins-institute', 'ruins-lab', 'cosmic-dome-7', 'cosmic-dome-8', 'cosmic-dome-9', 'cosmic-spire-7', 'cosmic-spire-8', 'cosmic-spire-9', 'cosmic-hall-7', 'cosmic-hall-8', 'cosmic-hall-9', 'cosmic-temple-7', 'cosmic-temple-8', 'cosmic-temple-9', 'cosmic-arch-7', 'cosmic-arch-8', 'cosmic-arch-9', 'cosmic-frame-7', 'cosmic-frame-8', 'cosmic-frame-9', 'port-cosmic-7', 'port-cosmic-8', 'port-cosmic-9',
  // ── band 4 (Marbre) ROMAIN — 1 sprite classique par bâtiment-moteur (2026-07-12) ──
  'forager-hortus-classical', 'granary-horreum-classical', 'guild-collegium', 'mint-moneta', 'bank-basilica-roman',
  'port-house-classical', 'storyteller-odeon', 'scribes-tabularium', 'schools-ludus', 'academies-athenaeum', 'cult-vesta',
  'observatories-horologium', 'libraries-classical', 'universities-classical', 'printing-scriptorium', 'think-stoa-roman', 'watch-classical',
  'bureau-tabularium', 'courthouses-basilica', 'works-classical', 'ministries-curia', 'archive-tabularium', 'ruins-restoration-roman', 'sewers-classical',
  // Les ateliers des guildes (bande 4) — cf. GUILD_CRAFTS_B4.
  'guild-officina-forge', 'guild-officina-potter', 'guild-officina-dyer'];
// Version des props : bump à CHAQUE décodage d'image. Consommée par la mesure
// d'encre des moteurs (isoEngineScene) et le relevé des ruines de la Chute
// (iso/isoChute.js) — une mesure prise pendant que les PNG chargeaient encore
// serait figée incomplète pour toute la session sinon.
let propVersion = 0;
export const getPropVersion = () => propVersion;

// Chargement À LA DEMANDE, clé par clé, comme palierAsset (audit du 05/10, ASSET-5) :
// le premier dessin d'une scène lançait d'un bloc les 211 décors de TOUTES les ères
// (silhouettes cosmiques dès la bande 0), et chaque décodage de la rafale changeait la
// version des props. Une partie ne voit qu'une bande à la fois. Seules les clés de la
// liste sont demandées (pas de 404 à l'aveugle) ; une clé d'un palier ou d'une scène
// cosmique, chargée par palierAsset, est servie telle quelle. Rend l'Image (même pas
// encore décodée, comme avant), ou null. TOUT lecteur de propImg passe par ici : un
// prop jamais demandé ne se chargerait plus jamais.
// ⚠ Le relevé des ruines de LA CHUTE (iso/isoChute.js) dessine TOUTE la cité, scènes
// jamais vues comprises : leurs décors partent à ce moment-là. Le noir attend donc
// ceux qui sont en route (propsLoading) et refait son relevé à blanc quand il en
// arrive — sans quoi leurs ruines manqueraient à vie au cycle suivant.
const PROP_SET = new Set(PROP_KEYS);
let propLoading = 0;
export const propsLoading = () => propLoading;
function propIm(k) {
  let im = propImg[k];
  if (!im && PROP_SET.has(k) && typeof Image !== 'undefined') {
    im = new Image();
    propLoading += 1;
    im.onload = () => { propLoading -= 1; propVersion += 1; };
    im.onerror = () => { propLoading -= 1; };
    im.src = '/pixelart/agents/buildings/' + k + '.png';
    propImg[k] = im;
  }
  return im || null;
}
const propReady = (k) => { const im = propIm(k); return !!(im && im.complete && im.naturalWidth > 0); };
// Image BRUTE d'un prop (dessin sous transform canvas, impossible via blitProp ; lue
// aussi par les tests du chargement à la demande).
const propImage = (k) => propIm(k);

// SOURCE DE DESSIN d'un prop : sa version enneigée en hiver, son image sinon.
//
// ⚠ Ceci ne remplace QUE la source du drawImage. Toutes les MESURES continuent de
// lire `propImg[k]` : naturalWidth/naturalHeight, propBBox, recBlitDens,
// lightCutImage. C'est volontaire et c'est le contrat de la passe — le canvas
// enneigé a exactement les mêmes dimensions et exactement le même alpha que sa
// source (cf. snowRoof.js), donc aucune de ces mesures n'a de raison de le relire,
// et les faire dépendre d'un canvas cuit ouvrirait la porte à des métriques qui
// changent avec la saison. Un bâtiment ne doit pas se déplacer parce qu'il neige.
//
// Repli sur la source à la moindre fausse note (sprite exclu, canvas indisponible,
// rien à poser) : jamais de vide, jamais de trou dans la scène.
function propArt(k, im) {
  if (CM.season !== WINTER || !snowRoofTune.on) return im;
  return snowSprite(k, im) || im;
}
// ── ALIGNEMENT DU RECTANGLE DE DESTINATION (molette d'A/B, 2026-08-05) ───────
// Les blits de props partaient en FLOTTANTS : `left`, `top`, `drawW`, `drawH`
// tels quels dans drawImage, avec imageSmoothingEnabled=false. Un sprite posé à
// x=10,37 ne tombe alors plus sur la grille de l'écran — chaque pixel de
// destination prend le pixel source qui couvre son centre, donc certains pixels
// source occupent 1 pixel écran et d'autres 2, IRRÉGULIÈREMENT, et le motif se
// redistribue au moindre déplacement de caméra. Le sol, lui, aligne depuis S11
// (cf. isoRenderer § tuiles natives, chemin `exact`) ; ce chemin-ci ne l'a
// jamais fait.
//   0 = état d'origine (flottant)
//   1 = position arrondie, taille intacte
//   2 = position ET taille arrondies à l'entier
//   3 = position arrondie + ÉCHELLE RATIONNELLE (défaut) — voir ci-dessous
//
// ── MODE 3, ET POURQUOI C'EST LUI QUI RÉPARE LE « PAS DROIT » ────────────────
// Arrondir la taille à l'entier ne suffit pas : ce qui salit un sprite réduit,
// ce n'est pas que sa taille soit fractionnaire, c'est que le RAPPORT le soit.
// À l'échelle 0,73 le nearest garde 73 lignes sur 100, mais la ligne sautée
// tombe tantôt au bout de 3 pixels tantôt au bout de 4, sans période : le grain
// part en biais et un trait d'1 px survit ici, disparaît là. À 3/4 exactement,
// il saute une ligne sur quatre, TOUJOURS — même perte d'information, mais
// régulière, donc lisible.
// Le mode 3 rabat donc l'échelle sur la fraction n/d la plus proche avec d ≤ 8 :
// la période du motif ne dépasse jamais 8 px, et l'écart de taille reste sous
// ~1,5 % (invisible, et sans commune mesure avec les 6 % qu'imposerait un jeu de
// fractions plus grossier — ce qui compte ici, c'est de ne PAS déranger
// l'égalisation du grain déjà validée).
// Molette : window.__blitSnap(0|1|2|3).
// ⚠ DÉFAUT = 1, et pas 3, alors que 3 est le mode qui répare vraiment le grain.
// Raison mesurée : le rabattement de TAILLE déplace les sprites de ~2 % (4,8 % au
// pire), et deux systèmes ont été calibrés au pixel sur les tailles actuelles —
// l'ordre de substitution des paliers (`cityEngineSprites.png.test.js` : le grand
// doit être dessiné STRICTEMENT plus petit que le petit étiré, or les deux
// tombent sur 70 px après rabattement) et les foyers de flamme mesurés
// (`flameGlow.test.js` : la lueur se décale de 0,69 px). Passer le défaut à 3
// demande de rejouer ces deux calibrages, pas de desserrer leurs tests.
export const BLIT_SNAP = { mode: 1, stats: null };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__blitSnap = (v) => { if (v != null) BLIT_SNAP.mode = v | 0; return BLIT_SNAP.mode; };
  // Diagnostic : `__blitSnapStats()` arme la collecte, la frame suivante remplit
  // l'histogramme des parties FRACTIONNAIRES de left/top/drawW/drawH. C'est la
  // seule mesure fiable ici — un diff de pixels entre deux clichés ne vaut rien,
  // la recuisson du sol étant coalescée (deux clichés du MÊME réglage diffèrent
  // de ~24 % de la frame, mesuré le 2026-08-05).
  window.__blitSnapStats = () => {
    const s = BLIT_SNAP.stats;
    BLIT_SNAP.stats = { n: 0, pos: new Array(10).fill(0), taille: new Array(10).fill(0), entiers: 0 };
    return s;
  };
}
const frac = (v) => Math.abs(v - Math.round(v));

// PÉRIODE DU MOTIF DE RÉDUCTION. Le nearest fait `src = floor(i × source/dest)` :
// la suite des lignes sautées se répète tous les `dest / pgcd(source, dest)`
// pixels. Réduire 112 en 82 donne une période de 41 — autant dire aucune, le
// grain part en biais. La réduire en 84 donne 3, en 64 donne 4 : régulier, donc
// net. On cherche donc, dans une fenêtre serrée autour de la taille visée,
// l'entier de plus petite période ; à égalité, le plus proche de la cible.
//
// ⚠ La fenêtre est volontairement étroite (±4 % ET ±3 px). L'égalisation du
// grain a été validée sur les tailles actuelles : un rabattement plus large
// gagnerait en netteté ce qu'il casserait en cohérence de portes et fenêtres.
const pgcd = (a, b) => { a = Math.abs(a | 0); b = Math.abs(b | 0); while (b) { const t = a % b; a = b; b = t; } return a || 1; };
function tailleNette(src, cible) {
  if (!(src > 0) || !(cible > 0)) return Math.max(1, Math.round(cible));
  const tol = Math.min(Math.max(1, cible * 0.04), 3);
  const lo = Math.max(1, Math.round(cible - tol)), hi = Math.round(cible + tol);
  let best = Math.max(1, Math.round(cible)), bp = Infinity, bd = Infinity;
  for (let d = lo; d <= hi; d += 1) {
    const per = d / pgcd(src, d);
    const ec = Math.abs(d - cible);
    if (per < bp || (per === bp && ec < bd)) { bp = per; bd = ec; best = d; }
  }
  return best;
}
// Renvoie [left, top, drawW, drawH] alignés selon le mode. La taille est arrondie
// AVANT la position quand les deux le sont, sinon le centrage rouvrirait un demi
// pixel de décalage.
// `ancre` : 'centre' (défaut) ou 'pied'. ⚠ Un prop posé au sol est ancré par le
// BAS de son encre (blitPropGrounded) : recentrer son rectangle le ferait
// léviter ou s'enfoncer d'un pixel, ce qui est exactement le défaut que
// l'ancrage mesuré avait corrigé. Pour lui, c'est la ligne de sol qui ne bouge pas.
// ── S6 — ARRONDIR SUR LA GRILLE **DEVICE**, PAS SUR LA GRILLE CSS ───────────
// Le contexte de la carte est scalé par `dpr` (setTransform(dpr,0,0,dpr,…)), si
// bien qu'un `Math.round` en px CSS tombe sur `dpr` px device : entier à dpr 1
// et 2, mais sur un QUART DE PIXEL à 1,25 et une DEMIE à 1,5 — les deux échelles
// Windows les plus répandues. L'arrondi CSS défaisait donc, sur ces postes, le
// snap de caméra posé juste avant (drawIsoWorld quantifie la caméra au pixel
// device, précisément pour que toutes les couches partagent une grille).
// `snapDev` rabat sur la grille RÉELLE ; à dpr 1 il est l'identité, donc les
// postes déjà nets ne bougent pas d'un pixel.
// ⚠ POSITION SEULEMENT. Les TAILLES restent gouvernées par BLIT_SNAP.mode : leur
// rabattement déplace les sprites de ~2 % et deux calibrages au pixel en
// dépendent (ordre de substitution des paliers, foyers de flamme) — cf. le
// bandeau de BLIT_SNAP, qui explique pourquoi le défaut est 1 et pas 3.
// (`snapDev` : blitSnap.js — le même arrondi que les unités, les habitants et les bateaux.)

function snapRect(left, top, drawW, drawH, srcW, srcH, ancre) {
  const st = BLIT_SNAP.stats;
  if (st) {
    st.n += 1;
    // 0 = pile sur la grille, 0,5 = pile entre deux pixels (le pire cas)
    st.pos[Math.min(9, Math.floor(Math.max(frac(left), frac(top)) * 20))] += 1;
    st.taille[Math.min(9, Math.floor(Math.max(frac(drawW), frac(drawH)) * 20))] += 1;
    if (frac(left) < 0.02 && frac(top) < 0.02 && frac(drawW) < 0.02 && frac(drawH) < 0.02) st.entiers += 1;
  }
  const m = BLIT_SNAP.mode;
  if (!m) return [left, top, drawW, drawH];
  if (m >= 2) {
    // Mode 3 : taille à motif PÉRIODIQUE (le seul qui répare le grain en biais).
    // Mode 2 : simple arrondi entier — gardé pour l'A/B, il isole ce que la
    // périodicité apporte AU-DELÀ de l'alignement.
    const w = m >= 3 && srcW ? tailleNette(srcW, drawW) : Math.max(1, Math.round(drawW));
    const h = m >= 3 && srcH ? tailleNette(srcH, drawH) : Math.max(1, Math.round(drawH));
    // Recentrage sur la boîte D'ORIGINE : le rabattement ne doit pas décaler le
    // bâtiment sur son lot, seulement changer sa grille d'échantillonnage.
    const dy = ancre === 'pied' ? (drawH - h) : (drawH - h) / 2;
    return [snapDev(left + (drawW - w) / 2), snapDev(top + dy), w, h];
  }
  return [snapDev(left), snapDev(top), drawW, drawH];
}

// Enveloppe de TEST du rabattement (la garde S6 verrouille l'invariant de grille,
// pas le corps) : snapRect reste privee, personne ne peut l'appeler par erreur.
export const snapRectForTest = (l, t, w, h, sw, sh, a) => snapRect(l, t, w, h, sw, sh, a);

// ── LA CHUTE : les scènes en RUINE (iso/isoChute.js, docs/PLAN-CHUTE.md) ─────
// Pendant qu'une scène est en ruine, iso/isoChute.js la dessine dans un contexte
// MUET (rien n'en sort) et allume ENGINE_RUIN : chaque BÂTIMENT qu'elle blitte
// (blitProp, tour cosmique) est alors remplacé, sur le contexte réel, par sa RUINE
// dessinée (/pixelart/ruins/props/<clé>.png, clé après substitution « -grand ») ou,
// faute de ruine dessinée, par son sprite ARASÉ. Les gens, les bêtes, les feux et
// les détails peints de la scène partent avec le contexte muet. `rec` (si posé)
// reçoit chaque ruine dessinée : c'est la recette des ruines du cycle suivant.
// `miss` passe à true quand une ruine n'a pas pu être dessinée (image en route) :
// le dessin de la scène n'était pas complet (iso/isoChuteScene.js ne le rejoue pas).
export const ENGINE_RUIN = { on: false, ctx: null, rec: null, miss: false };
const ruinPropImg = {};
const ruinPropCanvas = {};
const ruinPropFailed = {};
// Images de ruine demandées et pas encore arrivées : le relevé du noir les attend
// (iso/isoChute.js), sinon leurs ruines manqueraient à vie au cycle suivant.
let ruinPropLoading = 0;
export const propRuinsLoading = () => ruinPropLoading;
// Image de ruine d'un prop : { src, ox, oy } ([ox, oy] = coin de l'original dans la
// ruine), null tant qu'elle charge. Une ruine dessinée qui ne se charge pas (fichier
// absent ou renommé) bascule sur le repli ARASÉ, comme un prop sans ruine dessinée —
// le bâtiment ne disparaît pas de la scène.
function ruinPropArt(p, im) {
  const off = RUIN_PROPS[p];
  if (off && !ruinPropFailed[p]) {
    let r = ruinPropImg[p];
    if (!r) {
      r = ruinPropImg[p] = new Image();
      ruinPropLoading += 1;
      r.onload = () => { ruinPropLoading -= 1; };
      r.onerror = () => { ruinPropLoading -= 1; ruinPropFailed[p] = true; };
      r.src = '/pixelart/ruins/props/' + p + '.png';
    }
    if (!(r.complete && r.naturalWidth > 0)) return null;
    return { src: propArt('ruine:' + p, r), ox: off[0], oy: off[1], razed: false };
  }
  let c = ruinPropCanvas[p];
  if (c === undefined) {
    // Le sprite d'origine pas encore chargé : on réessaiera (ne pas retenir ce null,
    // la ruine manquerait pour toute la session).
    if (!(typeof document !== 'undefined' && im && im.naturalWidth > 0)) return null;
    c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0);
    // (une tour haute garde un fût cassé plutôt qu'un socle plat)
    try { x.putImageData(razeImageData(x.getImageData(0, 0, c.width, c.height), c.height > c.width * 1.5 ? 0.42 : 0.26), 0, 0); } catch { c = null; }
    ruinPropCanvas[p] = c;
  }
  return c ? { src: c, ox: 0, oy: 0, razed: true } : null;
}
// Dessine la ruine de `p` à la place de son sprite debout posé en (left, top, w, h).
function blitRuin(p, im, left, top, drawW, drawH) {
  const r = ruinPropArt(p, im);
  if (!r || !(im.naturalWidth > 0)) { ENGINE_RUIN.miss = true; return; }
  const kx = drawW / im.naturalWidth, ky = drawH / im.naturalHeight;
  const w = (r.src.naturalWidth || r.src.width) * kx, h = (r.src.naturalHeight || r.src.height) * ky;
  const x = left - r.ox * kx, y = top - r.oy * ky;
  const ctx = ENGINE_RUIN.ctx;
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(r.src, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.imageSmoothingEnabled = prev;
  if (ENGINE_RUIN.rec) ENGINE_RUIN.rec.push({ p, razed: r.razed, x, y, w, h, kx, ky, im, src: r.src });
}
// Toile de ruine d'un prop, pour redessiner une ruine du cycle précédent.
export function propRelicCanvas(p) {
  const im = propIm(p) || palierAsset(p);
  const r = ruinPropArt(p, im && im.naturalWidth > 0 ? im : null);
  return r ? r.src : null;
}

// Blit centré sur (cx,cy) en fraction de tuile, taille wFrac×hFrac de (sw,sh).
function blitProp(ctx, ox, oy, sw, sh, p, cx, cy, wFrac, hFrac) {
  const pal = palierImg(p);
  if (pal) {
    hFrac = palierHFrac(pal.cle) * palierK(PALIER_SPANSUM[pal.cle], curSpanSum);
    wFrac = hFrac * (pal.im.naturalWidth / pal.im.naturalHeight);
    p = pal.cle;
  }
  // Tourné vers la rue : même cadre (Codex garde la toile, le sol et l'échelle du corps).
  const ori = orientImg(p);
  if (ori) p = ori.cle;
  const im = propIm(p); if (!im) return;
  const drawW0 = sw * wFrac, drawH0 = sh * hFrac;
  recBlitDens(p, drawH0, im.naturalHeight);
  const [left, top, drawW, drawH] = snapRect(
    ox + sw * cx - drawW0 / 2, oy + sh * cy - drawH0 / 2, drawW0, drawH0,
    im.naturalWidth, im.naturalHeight);
  if (ENGINE_RUIN.on) { blitRuin(p, im, left, top, drawW, drawH); return; }
  // L'ombre du soleil (iso/isoSunShadow.js), pivot par colonne : le socle dessiné
  // sous un bâtiment n'en projette aucune de visible, le bâtiment oui.
  drawSunShadow(ctx, im, left, top, drawW, drawH, 0, 0, 0, 0, 'column');
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  const fl = liveLayer(p);
  ctx.drawImage(fl && fl.back ? propArt(p + '-back', fl.back) : propArt(p, im), left, top, drawW, drawH);
  if (fl) drawLiveFrame(ctx, fl, im, left, top, drawW, drawH, curNow);
  ctx.imageSmoothingEnabled = prev;
  // Un bâtiment de scène masque les halos déposés DERRIÈRE lui (cf. lightLayer.js).
  lightCutImage(im, left, top, drawW, drawH);
  // La nuit, ses fenêtres s'allument — verre nommé (bande 6) ou fenêtres sombres
  // (médiéval, romain, XIXe), cf. sceneWindows.js.
  drawSceneWindows(ctx, im, p, left, top, drawW, drawH, curSeed);
}

// ── CE QUI VIT DANS LES SCÈNES PEINTES (2026-10-04) ─────────────────────────
// Audit « tout ce qui doit bouger bouge-t-il ? » : des feux et des mécanismes
// étaient PEINTS dans des images fixes — le fil de la flamme éternelle du culte des
// ancêtres dès l'âge du Marbre, les braises de la tour de guet de pierre, les
// lanternes des tours cosmiques ; la roue de la grue romaine des grands travaux, les
// charges des grues cosmiques, les drones, les anneaux et les cristaux en orbite des
// tours de la fin. Seul un halo respirait, et seulement la nuit.
// scripts/sceneLive.mjs cuit, par image, une bande `<clé>-live` (N TIMBRES, rien que
// ce qui bouge) et, quand une pièce a été gommée pour être redessinée ou déplacée, le
// fond `<clé>-back`. blitProp et blitCosmicTower posent le fond au cadre de l'image,
// puis le timbre du moment à sa place `box` ; tant que les couches ne sont pas
// chargées, l'image d'origine sert de repli. Chargement paresseux, liste EXPLICITE des
// fichiers livrés (garde : sceneLive.test.js). Chaque instance a sa phase (graine du
// lot : deux grues voisines ne hissent pas en cadence). Cran d'ambiance « aucune » :
// la première image, figée.
// `box` = [x, y, w, h] du timbre dans l'image (audit du 05/10, ASSET-4, choix A de
// Raph) : la bande portait N images pleine toile où 0 à 28 % bouge — 37,8 Mo décodés
// pour les 24, 3,5 Mo recadrées — et chaque tour animée reposait une seconde image
// plein cadre par-dessus son fond, à chaque frame (en rendu logiciel, un drawImage se
// paie à la surface, vide compris). Le timbre garde un pixel vide autour de ce qui
// bouge : sur GPU, l'échantillon de bord y tombe, et non sur le timbre voisin.
// ⚠ Tenue en double avec TARGETS du script (n, ms, fond, boîte imprimée) : la garde
// confronte les fichiers.
export const LIVE_LAYERS = {
  // Feux
  'cult-vesta': { n: 8, ms: 120, back: true, box: [65, 41, 9, 12] },
  'cult-mausoleum': { n: 8, ms: 120, back: true, box: [13, 44, 6, 10] },
  'cult-memorial': { n: 8, ms: 120, back: true, box: [56, 34, 12, 26] },
  'cult-memorial-grand': { n: 8, ms: 120, back: true, box: [88, 61, 21, 50] },
  'cosmic-ancestral_cult-7': { n: 12, ms: 120, back: false, box: [57, 120, 15, 33] },
  'cosmic-ancestral_cult-8': { n: 12, ms: 120, back: false, box: [55, 139, 17, 21] },
  'watch-stone': { n: 8, ms: 120, back: false, box: [37, 24, 21, 9] },
  'cosmic-watch-7': { n: 12, ms: 120, back: false, box: [55, 75, 19, 14] },
  'cosmic-watch-8': { n: 24, ms: 120, back: false, box: [31, 57, 67, 58] },
  // Mécanismes
  'works-classical': { n: 16, ms: 140, back: false, box: [29, 14, 35, 24] },
  'works-classical-grand': { n: 16, ms: 140, back: false, box: [40, 24, 61, 49] },
  'cosmic-public_works-7': { n: 16, ms: 160, back: true, box: [31, 76, 34, 45] },
  'cosmic-public_works-8': { n: 16, ms: 160, back: true, box: [14, 86, 56, 67] },
  'cosmic-public_works-9': { n: 16, ms: 160, back: true, box: [26, 60, 78, 54] },
  'mint-cosmic-8': { n: 24, ms: 120, back: false, box: [24, 91, 82, 64] },
  'granary-cosmic-8': { n: 24, ms: 120, back: false, box: [34, 87, 68, 27] },
  'cosmic-observatories-8': { n: 24, ms: 120, back: false, box: [9, 130, 72, 29] },
  'mint-cosmic-9': { n: 24, ms: 120, back: true, box: [21, 97, 88, 59] },
  'cosmic-watch-9': { n: 24, ms: 120, back: true, box: [37, 59, 54, 38] },
  'cosmic-observatories-9': { n: 24, ms: 120, back: false, box: [11, 81, 106, 61] },
  // Fumée de l'hôtel des monnaies (stade 1, Moneta du Marbre) : le panache peint
  // devient des bouffées qui montent, dérivent et se défont.
  'mint-prop-house': { n: 20, ms: 150, back: true, box: [31, 0, 12, 14] },
  'mint-prop-house-grand': { n: 20, ms: 150, back: true, box: [61, 0, 20, 23] },
  'mint-moneta': { n: 20, ms: 150, back: true, box: [74, 0, 20, 24] },
  'mint-moneta-grand': { n: 20, ms: 150, back: true, box: [119, 0, 31, 31] },
};
const liveImg = {};
function liveAsset(name) {
  let im = liveImg[name];
  if (!im) {
    if (typeof Image === 'undefined') return null;
    im = new Image();
    im.onload = () => { propVersion += 1; };
    im.src = '/pixelart/agents/buildings/' + name + '.png';
    liveImg[name] = im;
    return null;
  }
  return (im.complete && im.naturalWidth > 0) ? im : null;
}
// Les couches vivantes d'une image, si elles sont TOUTES prêtes ; sinon null (repli).
function liveLayer(key) {
  const L = LIVE_LAYERS[key];
  if (!L) return null;
  const strip = liveAsset(key + '-live');
  const back = L.back ? liveAsset(key + '-back') : null;
  if (!strip || (L.back && !back)) return null;
  return { strip, back, n: L.n, ms: L.ms, box: L.box };
}
// Le timbre du moment, à sa place dans l'image `im` posée en (left, top, drawW, drawH) :
// même transformée source → écran que l'image entière.
function drawLiveFrame(ctx, fl, im, left, top, drawW, drawH, now) {
  const [bx, by, bw, bh] = fl.box;
  const kx = drawW / im.naturalWidth, ky = drawH / im.naturalHeight;
  const f = (CM.ambianceK ?? 1) > 0 ? (Math.floor((now || 0) / fl.ms) + (curSeed % fl.n)) % fl.n : 0;
  ctx.drawImage(fl.strip, f * bw, 0, bw, bh, left + bx * kx, top + by * ky, bw * kx, bh * ky);
}

// TOUR COSMIQUE (âge 35+) — sprite PixelLab HAUT (128×224) blité en GRAND, base ANCRÉE au sol
// de la scène, dépassant largement la boîte (apothéose de fin de jeu qui DOMINE les autres
// bâtiments). Aspect natif préservé (pas d'écrasement). Halo additif qui respire, teinte de bande.
// Réglable en live : window.__cosmicTowerH (hauteur ×boîte) / __cosmicTowerBase (ligne de sol).
function blitCosmicTower(ctx, ox, oy, sw, sh, key, now, band, cp, baseOverride) {
  // La nacre se lit sur la clé d'ORIGINE : la vue tournée est le même bâtiment.
  const pearl = isPearl(key);
  const ori = orientImg(key);
  if (ori) key = ori.cle;
  const im = propIm(key); if (!im || !(im.naturalWidth > 0)) return false;
  const H = (import.meta.env?.DEV && typeof window !== 'undefined' && window.__cosmicTowerH) || COSMIC_TOWER_H;
  const BASE = baseOverride != null ? baseOverride : ((import.meta.env?.DEV && typeof window !== 'undefined' && window.__cosmicTowerBase) || 0.95);
  const drawH = sh * H, drawW = drawH * (im.naturalWidth / im.naturalHeight);
  recBlitDens(key, drawH, im.naturalHeight);
  const cx = ox + sw * 0.5, baseY = oy + sh * BASE; // base PLANTÉE (pas de lévitation → pas d'effet flottant)
  if (ENGINE_RUIN.on) { blitRuin(key, im, cx - drawW / 2, baseY - drawH, drawW, drawH); return true; }
  drawSunShadow(ctx, im, cx - drawW / 2, baseY - drawH, drawW, drawH, 0, 0, 0, 0, 'column');
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  // Neige exclue par défaut sur les tours cosmiques (cf. skipKey dans snowRoof.js) :
  // le passage par propArt existe pour que __snowRoofTune({skipCosmic:false}) veuille
  // dire quelque chose, pas parce qu'on les enneige.
  const fl = liveLayer(key);
  ctx.drawImage(fl && fl.back ? propArt(key + '-back', fl.back) : propArt(key, im), cx - drawW / 2, baseY - drawH, drawW, drawH);
  if (fl) drawLiveFrame(ctx, fl, im, cx - drawW / 2, baseY - drawH, drawW, drawH, now);
  ctx.imageSmoothingEnabled = prev;
  lightCutImage(im, cx - drawW / 2, baseY - drawH, drawW, drawH);
  if (pearl) drawSceneEmissive(im, cx - drawW / 2, baseY - drawH, drawW, drawH, band);
  if (cp && cp.glow) {
    // Nacre : le halo ne vit que la nuit (ENGINE_HALO). Les anciennes tours le gardent plein.
    const nk = pearl ? ENGINE_HALO.day + ENGINE_HALO.cosmic * Math.max(0, Math.min(1, ((CM.nightF || 0) - 0.22) / 0.65)) : 1;
    const a = (0.16 + 0.10 * Math.sin(now / 720 + band)) * nk, gy = baseY - drawH * 0.30;
    // Invisible (la nacre en plein jour : nk = 0), rien à remplir (audit du 05/10,
    // PERF-20) : un disque de rayon sw/2 se composait pour rien à chaque frame (~65 µs
    // la tour en rendu logiciel). Sous 0,005 l'alpha s'écrit « 0.00 » : le même rien.
    if (a > 0.004) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, gy, 0, cx, gy, sw * 0.5);
      g.addColorStop(0, `rgba(${cp.glow},${a.toFixed(2)})`); g.addColorStop(1, `rgba(${cp.glow},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, gy, sw * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  return true;
}

// Prop de PROFIL posé au sol : même cadrage que blitProp mais ancré par le BAS DU
// CONTENU opaque (propBBox) au lieu du centre. Les sprites PixelLab gardent une marge
// transparente sous les roues/pieds : centrés sur cy, ils LÉVITAIENT au-dessus de leur
// halte. fy = ligne de sol en fraction de boîte.
function blitPropGrounded(ctx, ox, oy, sw, sh, p, cx, fy, wFrac, hFrac) {
  const ori = orientImg(p);   // une charrette à l'arrêt se tourne vers la rue, comme un bâtiment
  if (ori) p = ori.cle;
  const im = propIm(p); if (!im || !(im.naturalWidth > 0)) return false;
  const bb = propBBox(p), footF = bb ? bb.y0f + bb.hf : 1;
  const drawW0 = sw * wFrac, drawH0 = sh * hFrac;
  recBlitDens(p, drawH0, im.naturalHeight);
  const [left, top, drawW, drawH] = snapRect(
    ox + sw * cx - drawW0 / 2, oy + sh * fy - footF * drawH0, drawW0, drawH0,
    im.naturalWidth, im.naturalHeight, 'pied');
  drawSunShadow(ctx, im, left, top, drawW, drawH, 0, 0, 0, 0, 'column');
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(propArt(p, im), left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
  lightCutImage(im, left, top, drawW, drawH);
  return true;
}

// ── Petit prop posé au sol dimensionné sur l'HOMME, pas sur la boîte ─────────
// Un panier, une cagette, un tonneau ne se jugent pas contre le lot : ils se
// jugent contre le bonhomme accroupi à côté. Or les humains de scène sont calés
// sur la TUILE (sceneHumanH) depuis 2026-07-29, pendant que blitProp est resté
// en fraction de BOÎTE — laquelle grandit avec l'empreinte, avec le palier et
// avec le jitter d'instance. Un panier à 0,32 de boîte finissait donc à ~1,5
// fois la hauteur d'un homme (retour Raph : « les paniers de fruits sont
// vraiment trop gros »). Le bornage de la boîte des halles avait déjà soigné le
// cas extrême (isoRenderer, « panier plus haut qu'un homme ») sans corriger la
// fraction de base : ici on coupe le lien à la boîte pour de bon.
// hMul = hauteur d'ENCRE visée en fraction de l'ENCRE d'un humain de scène ;
// ancrage par le bas de l'encre sur la ligne de sol fy, comme blitPropGrounded.
// Les deux termes sont donc des hauteurs d'ENCRE : un hMul de 0,5 se relit
// « la moitié du bonhomme », sans avoir à défalquer les marges des PNG.
function blitPropHuman(ctx, ox, oy, sw, sh, p, cx, fy, hMul) {
  const im = propIm(p); if (!im || !(im.naturalWidth > 0)) return false;
  const bb = propBBox(p);
  const inkHF = bb && bb.hf > 0 ? bb.hf : 1;         // part d'encre dans le PNG
  const drawH = sceneHumanInkH() * hMul / inkHF;     // hauteur du PNG ENTIER
  const drawW = drawH * (im.naturalWidth / im.naturalHeight);
  return blitPropGrounded(ctx, ox, oy, sw, sh, p, cx, fy, drawW / sw, drawH / sh);
}

// Hauteur d'ENCRE du panier de récolte, en fraction de celle d'un humain de
// scène : un panier d'osier plein arrive à mi-cuisse, fruits entassés compris.
const BASKET_HF = 0.55;

// Échelle des HALTES de caravane (stades 1-3). Les deux valeurs vont ENSEMBLE : le
// véhicule était cadré à 0.66 de boîte et l'homme à 0.40 de tuile, ce qui rendait le
// bonhomme 1,4× plus HAUT qu'un chariot bâché — invisible tant que le véhicule
// traversait la scène, criant dès qu'il stationne à côté de lui. Toucher l'un sans
// l'autre casse le rapport. (Le rapport physique exact, ~6 m de chariot pour 1,7 m
// d'homme, déborderait la boîte : on garde une échelle de jeu, chariot ≈ 1,1× l'homme.)
const VEH_W = 0.86, VEH_MAN = 0.34;

// NOTE — les bandes animées de véhicules (veh-caravan-*.png) et le mulet qui faisait la
// navette (caravan-mule-east/west.png) ont été retirés, avec leur script de fabrication
// (audit du 05/10, SCRIPT-5) : ils servaient au va-et-vient supprimé, et le cheval de
// trait DÉTACHÉ du timon bougeait par rapport au chariot d'une frame à l'autre. Les
// stades 1-3 posent le prop statique à la halte.

// BBOX du contenu OPAQUE d'un prop (fractions 0..1 du PNG), calculée une fois et
// cachée. Les props PixelLab ont souvent un gros vide transparent sous les pieds
// (~25 % : vu au chantier iso, moulin « flottant » 90 px au-dessus de sa boîte) —
// tout ancrage au sol doit viser le BAS DU CONTENU, pas le bas du PNG.
const propBBoxCache = {};
function propBBox(p) {
  if (propBBoxCache[p]) return propBBoxCache[p];
  const im = propIm(p);
  if (!im || !(im.naturalWidth > 0) || typeof document === 'undefined') return null;
  try {
    const w = im.naturalWidth, h = im.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const bb = x1 < 0 ? { x0f: 0, y0f: 0, wf: 1, hf: 1, cw: w, ch: h }
      : { x0f: x0 / w, y0f: y0 / h, wf: (x1 - x0 + 1) / w, hf: (y1 - y0 + 1) / h, cw: x1 - x0 + 1, ch: y1 - y0 + 1 };
    propBBoxCache[p] = bb; return bb;
  } catch { propBBoxCache[p] = { x0f: 0, y0f: 0, wf: 1, hf: 1, cw: 1, ch: 1 }; return propBBoxCache[p]; }
}

// ── Caravane : la HALTE ──────────────────────────────────────────────────────
// Le va-et-vient d'un mulet (ou d'un véhicule) d'un bord à l'autre de la boîte ne
// marchait pas, pour trois raisons cumulées :
//   1. il GLISSE — le cycle de marche avance de ~5 px de jambes pendant que le sprite
//      parcourt ~40 px d'écran, donc la bête patine au lieu de marcher ;
//   2. il FLOTTE — les blits de scène ancrent les pieds à 0.88 du cadre (mesure du
//      bonhomme Forager) alors que les pieds du mulet sont à 0.78 du sien ;
//   3. rien ne motive le trajet : la boîte fait une tuile, l'aller-retour est un
//      métronome qui attire l'œil sans rien raconter.
// On joue donc une HALTE de caravane : plus RIEN ne traverse la scène, la vie est
// LOCALE — le mulet est couché et lève la tête, le marchand travaille au dépôt.
// Bande /pixelart/agents/buildings/caravan-mule-rest.png (80 px/frame, PixelLab).

// Blit d'une frame de bande carrée ancrée au sol par la fraction de pied MESURÉE du
// sprite (footF), et non par le 0.88 des humains : un sprite couché n'occupe que le bas
// de son cadre et flotterait au-dessus de son ombre.
function blitStripFoot(ctx, im, ox, oy, sw, sh, fw, frame, cx, fy, hFrac, footF) {
  if (!im || !(im.naturalWidth > 0)) return;
  // stripMetrics().k : cf. blitForager — les bandes flat logent le perso à ~50 % du
  // cadre (les anciennes ~78 %) ; la mule et les vieilles bandes donnent k≈0.9-1.
  const drawH = Math.max(1, Math.round(sceneHumanH(hFrac) * stripMetrics(im).k)), drawW = drawH;
  const left = Math.round(ox + sw * cx - drawW / 2), top = Math.round(oy + sh * fy - footF * drawH);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, frame * fw, 0, fw, im.naturalHeight, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
}

// Mulet bâté COUCHÉ qui baisse et relève la tête (bande PixelLab, corps immobile).
const MULE_REST_FW = 80, MULE_REST_NF = 9;
// Fraction de pied MESURÉE sur la bande (bas du ventre / des jambes repliées), identique
// sur les 9 images — le corps ne bouge pas d'un pixel, seule la tête travaille. Le mulet
// couché tient dans le bas de son cadre : ancré au 0.88 des humains, il flotterait.
const MULE_REST_FOOT = 0.713;
let muleRestImg = null, muleRestInit = false;
function ensureMuleRest() {
  if (muleRestInit || typeof Image === 'undefined') return;
  muleRestInit = true;
  const im = new Image();
  im.src = '/pixelart/agents/buildings/caravan-mule-rest.png';
  muleRestImg = im;
}
const muleRestReady = () => { ensureMuleRest(); return !!(muleRestImg && muleRestImg.complete && muleRestImg.naturalWidth > 0); };

// Cycle « tête » : la bande va de la tête HAUTE (image 0, l'animal veille) à la tête
// BASSE (dernières images, il fouille le sol du naseau). On la joue en VA-ET-VIENT
// d'images avec une PAUSE tête haute — un simple modulo ramènerait la tête d'un coup
// en fin de boucle, ce qui CLAQUE. T = période complète (ms).
function muleRestFrame(now, T) {
  const c = ((((now || 0) / T) % 1) + 1) % 1;
  if (c < 0.42) return 0;                                        // il veille, tête haute
  const k = c < 0.71 ? (c - 0.42) / 0.29 : 1 - (c - 0.71) / 0.29; // baisse puis relève
  return Math.min(MULE_REST_NF - 1, Math.floor(k * (MULE_REST_NF - 1) + 0.5));
}

// Marchand accroupi au dépôt : le clip `crouch-south` est une TRANSITION debout→accroupi
// (pas une boucle), joué en va-et-vient il donne « il se penche, travaille, se relève ».
// Les pieds remontent dans le cadre à mesure qu'il se plie (0.824 → 0.706) : sans cette
// table par frame il décollerait du sol au plus bas de son geste.
// Re-mesurée sur le clip FLAT 2026-08 (template picking-up : les pieds restent posés,
// contrairement à l'ancienne transition debout→accroupi qui les remontait).
const CROUCH_FOOT = [0.733, 0.733, 0.733, 0.733, 0.75];
function drawCrouchWorker(ctx, ox, oy, sw, sh, now, cx, fy, T, phase, hFrac) {
  const n = FORAGER_CLIPS['crouch-south'];
  const c = ((((now || 0) / T) + (phase || 0)) % 1 + 1) % 1;
  const k = c < 0.5 ? c * 2 : (1 - c) * 2;
  const f = Math.min(n - 1, Math.floor(k * (n - 1) + 0.5));
  sceneHumanShadow(ctx, ox, oy, sw, sh, cx, fy, hFrac, 0.18);
  const im = foragerImg['crouch-south'];
  blitStripFoot(ctx, im, ox, oy, sw, sh, (im && im.naturalHeight) || FORAGER_FH, f, cx, fy, hFrac, CROUCH_FOOT[f]);
}

// Halte de caravane du stade 0 : dépôt de sacs, mulet couché qui lève la tête,
// marchand accroupi qui charge. Rien ne traverse la boîte.
function drawCaravanHalt(ctx, ox, oy, sw, sh, now) {
  const FY = 0.82, MULE_H = 0.41;
  // Dépôt de sacs (côté droit) — au fond, le mulet et le marchand passent devant.
  if (propReady('caravan-prop-sacks')) {
    blitProp(ctx, ox, oy, sw, sh, 'caravan-prop-sacks', 0.86, 0.73, 0.24 * 64 / 48, 0.24);
  }
  // Mulet couché : ombre de contact large (il repose sur tout son flanc), tête animée.
  sceneHumanShadow(ctx, ox, oy, sw, sh, 0.38, FY, MULE_H, 0.22, 2.4);
  blitStripFoot(ctx, muleRestImg, ox, oy, sw, sh, MULE_REST_FW, muleRestFrame(now, 5200), 0.38, FY, MULE_H, MULE_REST_FOOT);
  // Marchand accroupi au pied du dépôt, dos au mulet (au premier plan, il passe devant).
  if (foragerReady()) drawCrouchWorker(ctx, ox, oy, sw, sh, now, 0.74, FY + 0.04, 3400, 0, VEH_MAN);
}

// ── Bandes animées « feu pixel » (PixelLab animate_object → composite qui FIGE le
// bâtiment, seul le feu bouge). Bande horizontale N×FW, un Image par clé. Le feu
// animé est PIXEL (baké image par image) → il ne « dénote » pas comme un overlay
// procédural. Registry PARTAGÉ (mint forge, conteurs…) ; exporté pour engineSprites.js.
// Repli : prop statique correspondant (la même scène, feu figé), puis rien.
const ANIM_BANDS = {
  'mint-forge-fire': { fw: 96, fh: 80, frames: 7, ms: 130 },
  // `storyteller-fire` retirée le 2026-08-05 : le stade 0 des conteurs est passé
  // d'une veillée au feu de camp à une loge close, sans foyer (le PNG reste sur
  // le disque). Une bande déclarée ici est préchargée, donc laisser l'entrée
  // coûterait un Image inutile par session et ferait mentir la garde des feux.
  'ancestralcult-fire': { fw: 96, fh: 80, frames: 7, ms: 130 },
  // PALIER du stade 0 (spanSum ≥ 6) : la flamme du GRAND cercle. Frame 192×160,
  // soit exactement le DOUBLE du petit — le canvas du palier a été choisi comme
  // ça pour que la flamme s'y transpose au facteur 2 pile — et de même ratio que
  // `ancestralcult-back-grand`, donc les deux couches tombent dans le même
  // rectangle sans que le site d'appel ait à s'en occuper. Pas préchargée
  // (cf. ensureAnim) : qui n'a jamais 25 cultes avant l'ère 10 ne la charge pas.
  'ancestralcult-fire-grand': { fw: 192, fh: 160, frames: 7, ms: 130 },
  // L'eau des aqueducs (`aqueduct-water-*`) retirée le 05/10 (audit ASSET-5) : les
  // aqueducs sont posés en puits (isoLiveCollect) : leurs trois bandes, préchargées
  // à chaque session, n'étaient jamais dessinées.
  'watch-fire': { fw: 80, fh: 96, frames: 7, ms: 130 },
  // ⛔ Les ÉGOUTS n'ont PLUS de bande animée, et n'en veulent pas. Ils ont porté
  // un filet d'eau croupie (`sewers-water`) puis un caniveau à ciel ouvert
  // (`sewers-*-flow`) ; les deux ont été retirés le 2026-08-05 — « c'est vraiment
  // le fait d'avoir de l'eau qui sort qui est bizarre » (Raph). Un égout AVALE :
  // les stations ne montrent qu'un tuyau qui rentre dans le sol, peint en dur par
  // scripts/sewerOutfall.mjs. Rien ne bouge, donc rien à déclarer ici.
};
// FOYERS MESURÉS des bandes de feu — d'où part la lueur, en fraction de la frame.
// Mesure : le bâtiment est FIGÉ dans ces bandes, seul le feu bouge ; le centroïde
// des pixels à la fois CHAUDS (opaques, clairs, r-b > 60) et MOUVANTS (variance
// sur les 7 frames) est donc la flamme elle-même, et rien d'autre — ni le mur
// ocre, ni les étincelles froides. `sig` = rayon quadratique moyen de ce nuage
// (fraction de la LARGEUR de frame) : la lueur suit la taille réelle du foyer.
// Une bande absente de cette table n'éclaire pas.
// Valeurs revérifiées par src/game/map/__tests__/flameGlow.test.js, qui relit
// les PNG : régénérer un sprite en déplaçant son feu casse la garde.
// Les teintes suivent la rampe rouge feu (public/pixelart/fire-ramp.json) : elles
// restent plus chaudes que la flamme elle-même — un feu éclaire orange — mais plus
// rouges que l'ambre d'avant, qui grisait des flammes désormais écarlates.
const ANIM_FIRE_CORES = {
  'mint-forge-fire': { fx: 0.477, fy: 0.443, sig: 0.116, col: '255,134,40' },
  // Refoyer 2026-08-05 : la bande ne porte plus que la FLAMME (la galette de sol
  // et les pierres du foyer y étaient cuites, cf. ancestralcult-back) et elle est
  // assise 3 px plus bas dans le nouveau foyer — le centroïde descend d'autant.
  'ancestralcult-fire': { fx: 0.501, fy: 0.478, sig: 0.069, col: '255,118,30' },
  // Le palier a SON foyer, mesuré comme les autres : même flamme, mais
  // rematérialisée à 1,52× et réassise dans le foyer du grand cercle. `sig`
  // tombe à 0,046 non parce que le feu rétrécit — il fait 32 px de large au lieu
  // de 21 — mais parce qu'il se rapporte à une frame deux fois plus large ; le
  // halo, lui, se calcule sur la largeur DESSINÉE, il garde donc sa taille écran.
  'ancestralcult-fire-grand': { fx: 0.495, fy: 0.483, sig: 0.046, col: '255,118,30' },
  'watch-fire': { fx: 0.514, fy: 0.153, sig: 0.108, col: '255,138,44' },
};
// Rayon du halo = sig × ce facteur : la lumière déborde du foyer (sinon elle se
// confond avec la flamme au lieu de l'entourer).
const FIRE_GLOW_SPREAD = 2.6;
const animImg = {};
let animInit = false;
const animReadyN = {};
function ensureAnim() {
  if (animInit || typeof Image === 'undefined') return;
  animInit = true;
  for (const k of Object.keys(ANIM_BANDS)) {
    if (PALIER_SPANSUM[k]) continue;   // un grand ne descend que si son palier s'arme (palierAsset)
    const im = new Image();
    // La version des props bouge aussi pour une bande : animReady choisit entre
    // deux DESSINS (foyer animé ou prop de repli), et les mesures qui en
    // dépendent (encre des moteurs, relevé des ruines) doivent le savoir.
    im.onload = () => { animReadyN[k] = 1; propVersion += 1; };
    im.src = '/pixelart/agents/buildings/' + k + '.png';
    animImg[k] = im;
  }
}
const animReady = (k) => { ensureAnim(); return animReadyN[k] === 1; };
// Blit de la frame courante d'une bande, centrée sur (cx,cy) en fraction de tuile.
// Si la bande est un FEU (ANIM_FIRE_CORES), son foyer annonce sa lumière : elle
// sera posée par la passe de nuit, PAR-DESSUS le voile (cf. flameGlow.js). Les
// coordonnées sortent de la boîte réellement dessinée — le site d'appel peut donc
// changer cx/cy/échelle sans jamais désaligner la lueur.
function blitAnim(ctx, ox, oy, sw, sh, key, now, cx, cy, wFrac, hFrac) {
  // Palier : même règle générique que blitProp, sur la BANDE cette fois. Le
  // ratio vient de la FRAME (meta.fw/fh) et non du canvas, qui est la bande
  // entière — l'oublier écraserait la flamme de 7×.
  const pal = palierImg(key);
  if (pal) {
    key = pal.cle;
    hFrac = palierHFrac(key) * palierK(PALIER_SPANSUM[key], curSpanSum);
    wFrac = hFrac * (ANIM_BANDS[key].fw / ANIM_BANDS[key].fh);
  }
  const meta = ANIM_BANDS[key], im = animImg[key]; if (!meta || !im) return;
  const frame = Math.floor((now || 0) / meta.ms) % meta.frames;   // ~7.7 fps
  const drawW0 = sw * wFrac, drawH0 = sh * hFrac;
  const [left, top, drawW, drawH] = snapRect(
    ox + sw * cx - drawW0 / 2, oy + sh * cy - drawH0 / 2, drawW0, drawH0,
    meta.fw, meta.fh);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, frame * meta.fw, 0, meta.fw, meta.fh, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
  // Découpe AVANT la lueur du foyer : la bande masque les halos déposés derrière
  // elle, mais surtout pas le sien, qui s'annonce juste après.
  lightCutImage(im, left, top, drawW, drawH, frame * meta.fw, 0, meta.fw, meta.fh);
  const core = ANIM_FIRE_CORES[key];
  if (core) {
    // Phase de scintillement liée à la BANDE et non à l'écran : deux forges
    // battraient de toute façon à l'unisson (la frame se calcule sur `now`, pas
    // par instance), et une phase tirée des coordonnées écran ferait sauter le
    // scintillement au moindre déplacement de caméra.
    queueFlameGlow(left + drawW * core.fx, top + drawH * core.fy,
      drawW * core.sig * FIRE_GLOW_SPREAD, core.col, now, key.length * 0.7, 1);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SOL SOUS LES BÂTIMENTS-MOTEUR — INTERRUPTEUR GLOBAL.
// `false` (demande Raph 2026-07-06 : « il ne faut rien sous les bâtiments ») ⇒ les
// sprites posent directement sur le terrain de la carte, aucune tache de sol dessinée.
// Repasser à `true` pour re-poser les taches de sol douces (chaque site d'appel garde
// ses réglages : position/rayon/teinte/opacité), sans avoir à retrouver les ~15 blocs.
const DRAW_BUILDING_GROUND = false;

// Tache de sol douce : dégradé radial (source-over) qui fond vers transparent, aplati en
// ellipse via scale(y). No-op tant que DRAW_BUILDING_GROUND est false. cyFrac/rFrac/khFrac
// en fraction de tuile ; rgb = "r,g,b" ; a0 = opacité au centre (fond à 0 sur le bord).
function softGround(ctx, ox, oy, sw, sh, cyFrac, rFrac, khFrac, rgb, a0) {
  if (!DRAW_BUILDING_GROUND) return;
  const cxp = ox + sw * 0.5, cyp = oy + sh * cyFrac, R = sw * rFrac, ky = (sh * khFrac) / R;
  ctx.save(); ctx.translate(cxp, cyp); ctx.scale(1, ky); ctx.translate(-cxp, -cyp);
  const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R);
  g.addColorStop(0, `rgba(${rgb},${a0})`); g.addColorStop(0.6, `rgba(${rgb},${(a0 * 0.52).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// Sol cosmique (stades 35+), teinté par l'époque. Même interrupteur que softGround.
function cosmicGround(ctx, ox, oy, sw, sh, cp) {
  softGround(ctx, ox, oy, sw, sh, 0.82, 0.46, 0.2, cp.deepRGB || "6,8,12", 0.55);
}

// Décor cosmique commun aux stades transcendants (ères 35+) : sol doux (cosmicGround)
// + la palette `cp` de l'époque, que la tour PixelLab reçoit pour son halo. (Le
// `glow` qui servait aux silhouettes procédurales de repli est parti avec elles, MORT-2.)
function cosmicBase(ctx, ox, oy, sw, sh, px, band) {
  const cp = COSMIC_PAL[band] || COSMIC_PAL[9];
  cosmicGround(ctx, ox, oy, sw, sh, cp);
  /* ombre de contact retirée */
  return { cp };
}

// Stade d'ère d'un bâtiment-moteur depuis l'eraIndex : 0 primitif/antique · 1 pierre
// (médiéval→classique) · 2 industriel · 3 moderne. Le seuil industriel est à ei25 (= bord
// de bande 5 « Fonte »), aligné sur les époques : la bande 4 « Marbre » reste au stade 1.
// Le cosmique (band≥7) et le sprite romain de la bande 4 sont interceptés en amont par chaque
// bâtiment ; ce helper ne pilote que le dispatch des 4 stades pixel. Source UNIQUE (ex-×29 dupliqué).
function engineStage(ei) { return ei < 10 ? 0 : ei < 25 ? 1 : ei < 30 ? 2 : 3; }

// ── LES ATELIERS DES GUILDES (bande 4) ──────────────────────────────────────
// Raph 2026-10-03 : « le bâtiment des guildes n'est pas bon ». À la bande 4, les 47
// annexes recevaient le COLLÈGE lui-même (portique, fronton, autel) en petit : un
// monument public répété dans toute la ville — les « maisonnettes identiques » déjà
// relevées par l'audit du rendu. La doctrine halle + ateliers (cmEngineInstances) veut
// l'inverse : la monumentalité à la halle, la QUANTITÉ aux ateliers. Le collège reste
// donc la halle ; chaque annexe est l'atelier d'UN métier (forge, potier, teinturier),
// tiré par son rang — trois dessins qui alternent, jamais deux voisins identiques (les
// ateliers sont semés, cf. cmRequestZone). PixelLab 64 px, taille des maisons : même
// grain qu'elles. 0 = pas de métier (halle, autres bâtiments, autres âges).
const GUILD_CRAFTS_B4 = ['guild-officina-forge', 'guild-officina-potter', 'guild-officina-dyer'];
export function engineCraft(t) {
  if ((t.buildingId || t.variant) !== 'guilds' || !((t.groupIndex || 1) > 1)) return 0;
  return 1 + ((t.groupIndex - 2) % GUILD_CRAFTS_B4.length);
}
// Fumée qui monte d'un point du sprite (fractions de boîte) : trois bouffées en boucle,
// le même geste que la fumée du faîte de la maison de guilde.
function guildSmoke(ctx, ox, oy, sw, sh, fx, fy, now, a = 0.26) {
  smokePuffs(ctx, ox + sw * fx, oy + sh * fy, sw, sh, now, a);
}
// Les bouffées elles-mêmes, depuis un point écran (x, y) ; sw/sh = la boîte de la
// scène, qui règle leur taille et leur montée.
function smokePuffs(ctx, x, y, sw, sh, now, a = 0.26) {
  for (let i = 0; i < 3; i++) {
    const t = ((now / 2600) + i / 3) % 1;
    ctx.fillStyle = `rgba(208,198,188,${(a * (1 - t)).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x + sw * (0.05 * t + 0.01 * Math.sin(now / 300 + i)), y - sh * 0.2 * t, sw * (0.016 + 0.035 * t), 0, Math.PI * 2);
    ctx.fill();
  }
}
// FUMÉE DE CHEMINÉE d'un prop de scène (2026-10-04 : la cheminée de l'imprimerie
// industrielle ne fumait pas). Le sommet de la souche est relevé sur le PNG, en
// fraction de l'IMAGE, donc il suit le jumeau « -grand » que blitProp substitue
// sur les grandes emprises — même cadre que blitProp, sans le calage au pixel
// (sans effet sur une bouffée). Mêmes arguments que blitProp, plus `now`. La
// fumée d'USINE des vapeurs (boatFx.drawSmoke : pavés sombres qui pâlissent en
// montant) — les bouffées claires des ateliers disparaissaient sur le pavé gris.
const CHIMNEY_TOPS = {
  'printing-factory': [0.554, 0.125],
  'printing-factory-grand': [0.682, 0.056],
};
export function propChimneySmoke(ctx, ox, oy, sw, sh, p, cx, cy, wFrac, hFrac, now) {
  const pal = palierImg(p);
  if (pal) {
    hFrac = palierHFrac(pal.cle) * palierK(PALIER_SPANSUM[pal.cle], curSpanSum);
    wFrac = hFrac * (pal.im.naturalWidth / pal.im.naturalHeight);
    p = pal.cle;
  }
  // Vue tournée vers la rue : sa souche n'est plus là où le relevé la place.
  if (orientImg(p)) return;
  const pt = CHIMNEY_TOPS[p];
  if (!pt || !propIm(p)) return;
  const w = sw * wFrac, h = sh * hFrac;
  drawSmoke(ctx, { x: ox + sw * cx - w / 2 + w * pt[0], y: oy + sh * cy - h / 2 + h * pt[1] }, now, CM.cam.zoom, curSeed % 997, 0, false);
}
// L'atelier : le dessin, puis ce qui vit — la forge rougeoie et fume, le four du potier
// fume ; la teinturerie, elle, ne bouge pas (ses étoffes sont dans le dessin).
// CADRAGE : le PNG (68 px, pied de l'encre à 2 px du bord) remplit la boîte (×1) — un
// atelier a la carrure d'une maison voisine (à ×0,86 il en paraissait le cadet), et son
// grain (~0,95 px écran par px d'art au zoom 1) est celui des maisons (~0,85-0,9). Centre
// vertical 0,405 : le pied tombe à 0,876 de la boîte, sur le coin sud du lot (la boîte
// descend d'un quart de tuile sous ce coin, cf. drawIsoEngineScene).
// Points de fumée et de lueur relevés sur les PNG, en fractions de la boîte :
// forge — souche de cheminée (33,12), arche du foyer (25,46) ; potier — dôme du four (17,41).
const OFFICINA_CY = 0.405, OFFICINA_F = 1;
const OFFICINA_LIFE = {
  1: { smoke: [0.485, 0.081], glow: [0.368, 0.581] },
  2: { smoke: [0.25, 0.508] },
  3: {},
};
function drawGuildOfficina(ctx, ox, oy, sw, sh, craft, now) {
  blitProp(ctx, ox, oy, sw, sh, GUILD_CRAFTS_B4[craft - 1], 0.5, OFFICINA_CY, OFFICINA_F, OFFICINA_F);
  // La lueur et la fumée sont relevées sur la vue sud-ouest : une vue tournée vers sa rue
  // n'a plus son foyer ni sa souche à ces places-là.
  const life = orientImg(GUILD_CRAFTS_B4[craft - 1]) ? {} : (OFFICINA_LIFE[craft] || {});
  if (life.glow) {
    const nF = Math.max(0, Math.min(1, CM.nightF || 0));
    const gx = ox + sw * life.glow[0], gy = oy + sh * life.glow[1], gr = sw * 0.06;
    const fl = 0.2 + 0.05 * Math.abs(Math.sin(now / 1100)) + nF * 0.2;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g.addColorStop(0, `rgba(255,150,55,${Math.min(0.5, fl).toFixed(2)})`); g.addColorStop(1, "rgba(255,150,55,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (life.smoke) guildSmoke(ctx, ox, oy, sw, sh, life.smoke[0], life.smoke[1], now);
}

function drawCityEngineSprite(context) {
  _sceneBand = (context && context.band) | 0;
  const { ctx, id, tier, litGold, ox, oy, sw, sh, px, strokeRect, now, band = 0, ei = 0, gw = 1, gh = 1, seed = 0, craft = 0 } = context;
  // (Plus de paramètre `pass` : les plans 'back' / 'anim' / 'front' ne servaient que le
  // cache des scènes cuites, retiré à l'audit du 05/10 — MORT-1. Une scène se dessine
  // d'un seul tenant, dans l'ordre de ses appels.)
  setEngineSpan(gw, gh);              // lu par palierImg (substitution de palier)
  setEngineSeed(seed);                // lu par blitProp (bureaux allumés la nuit)
  setEngineNow(now);                  // lu par blitProp (scènes vivantes, LIVE_LAYERS)
  // ── band 4 (Marbre / toges) : sprite ROMAIN classique à la place du stade pierre médiéval. ──
  // Repli AUTOMATIQUE sur le dispatch de stade tant que le PNG n'est pas chargé (propReady=false).
  // port (rive : dock+bateau à préserver), caravans (véhicule) et markets (branche
  // dédiée) sont traités séparément — pas dans cette table. (Les moulins n'ont plus de
  // scène moteur : iso/isoMill.js — MORT-2.)
  const RB4 = { foragers: 'forager-hortus-classical', granaries_city: 'granary-horreum-classical', guilds: 'guild-collegium', mint_houses: 'mint-moneta', imperial_exchanges: 'bank-basilica-roman' };
  // (le palier de halle est posé par blitProp lui-même, cf. palierImg)
  if (band === 4 && craft > 0 && propReady(GUILD_CRAFTS_B4[craft - 1])) { drawGuildOfficina(ctx, ox, oy, sw, sh, craft, now); return true; }
  if (band === 4 && RB4[id] && propReady(RB4[id])) {
    blitProp(ctx, ox, oy, sw, sh, RB4[id], 0.5, 0.46, 0.86, 0.76);
    // Le paysan du verger reste au travail à l'âge du Marbre (2026-10-04 : la ferme
    // romaine était vide pendant cinq ères, entre deux âges où il fait la navette) :
    // des cageots à la porte, devant la maison. Pas sur le « -grand » (une villa
    // sans cour de terre, que blitProp substitue sur les grandes emprises).
    if (id === 'foragers' && farmerReady() && !palierImg(RB4[id])) {
      drawFarmerShuttle(ctx, ox, oy, sw, sh, now, 0.3, 0.5, 0.76, 6400, 0, 0.5);
    }
    return true;
  }
  if (id === "foragers") {
    if (band >= 7) {
      // STADE COSMIQUE (ères 35+) : jardin bioluminescent (Noosphère) → serre
      // orbitale (stellaire) → jardin cristallin (Démiurge), en tour PixelLab ; palette
      // par époque. Rien tant que le décor n'est pas chargé (MORT-2).
      const cp = COSMIC_PAL[band] || COSMIC_PAL[9];
      const ckey = 'forager-cosmic-' + band;
      if (propReady(ckey)) {
        cosmicGround(ctx, ox, oy, sw, sh, cp); // sol doux (no-op, se fond au terrain)
        blitCosmicTower(ctx, ox, oy, sw, sh, ckey, now, band, cp); // TOUR gigantesque (halo intégré, qui respire)
      }
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : cueillette sauvage → verger taillé → serre industrielle →
    // hydroponie néon. tier reste la richesse intra-stade (perso/fruits/cagettes).
    const stage = engineStage(ei);
    if (stage === 0) {
    softGround(ctx, ox, oy, sw, sh, 0.76, 0.52, 0.34, "19,26,9", 0.82); // sol sous le bâtiment (désactivé par défaut)

    // === BUISSON / ARBRE (droite) ===
    const tx = 0.70, ty = 0.60;
    // (chaque pièce de la scène — arbre, panier, cueilleurs — attend son PNG : rien
    // tant qu'il n'est pas chargé, MORT-2.)
    if (propReady('forager-prop-tree')) blitProp(ctx, ox, oy, sw, sh, 'forager-prop-tree', tx, ty - 0.12, 0.74, 0.78);

    // === PANIER — ombre de contact ICI (sous tout) ; le panier lui-même est dessiné
    // APRÈS le perso (plus bas) pour que le cueilleur passe DERRIÈRE le panier. ===
    // bkFy = ligne de sol du panier, un poil DEVANT les pieds du cueilleur (0.78).
    const bkx = 0.2, bkFy = 0.82;
    const bkPix = propReady('forager-prop-basket');
    if (bkPix) {
    // Ombre à la taille du panier dessiné : le sprite se cale sur l'humain (blitPropHuman).
    const bh = sceneHumanInkH() * BASKET_HF;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(ox + sw * bkx, oy + sh * bkFy, bh * 0.52, bh * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    }

    // === PERSONNAGE — navette panier ↔ buisson === (ANIMÉ : navette pilotée par `now`)
    // Pixel-art animé (PixelLab), dessiné une fois ses bandes chargées (foragerReady
    // lance leur chargement).
    if (foragerReady()) {
      drawPixelForager(ctx, ox, oy, sw, sh, now, 0, 0.46);
      if (tier >= 2) drawPixelForager(ctx, ox, oy, sw, sh, now, 0.5, 0.40);
    }

    // === PANIER (corps) — APRÈS le perso → le cueilleur passe DERRIÈRE le panier ===
    if (bkPix) blitPropHuman(ctx, ox, oy, sw, sh, 'forager-prop-basket', bkx, bkFy, BASKET_HF);
    } else if (stage === 1) {
      // ── STADE 1 · VERGER DOMESTIQUÉ — arbre taillé, enclos, échelle, cagettes ──
      // La ville se pave et a des marchés : la récolte s'organise et se stocke.
      // Pixel-art (props PixelLab + paysan réutilisé) ; rien tant que l'arbre n'est pas chargé.
      if (propReady('forager-orchard-tree')) {
        softGround(ctx, ox, oy, sw, sh, 0.78, 0.5, 0.32, "26,34,14", 0.72); // sol (désactivé par défaut)
        // Arbre taillé (échelle + clôture bakées) — droite ; ombre de contact puis prop.
        const otx = 0.64, oty = 0.5;
        /* ombre de contact retirée */
        blitProp(ctx, ox, oy, sw, sh, 'forager-orchard-tree', otx, oty, 0.78, 0.78);
        // Paysan réutilisé : navette cagettes ↔ arbre (2e paysan au tier 2).
        if (farmerReady()) {
          drawFarmerShuttle(ctx, ox, oy, sw, sh, now, 0.28, 0.5, 0.8, 6400, 0, 0.5);
          if (tier >= 2) drawFarmerShuttle(ctx, ox, oy, sw, sh, now, 0.32, 0.46, 0.72, 7200, 0.5, 0.44);
        }
        // Cagettes (gauche) — DEVANT le paysan (il passe derrière) ; ombre puis prop.
        const ocx = 0.2, ocy = 0.72;
        ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.beginPath(); ctx.ellipse(ox + sw * ocx, oy + sh * (ocy + 0.08), sw * 0.14, sh * 0.04, 0, 0, Math.PI * 2); ctx.fill();
        blitProp(ctx, ox, oy, sw, sh, 'forager-orchard-crates', ocx, ocy, 0.34, 0.34);
      }
    } else if (stage === 2) {
      // ── STADE 2 · RÉCOLTE INDUSTRIELLE — châssis de serre vitré, chariot, outils métal ──
      // Brique sombre & métal, faubourgs : la production est mise à l'échelle.
      // Pixel-art (serre + brouette + paysan) ; rien tant que la serre n'est pas chargée.
      if (propReady('forager-greenhouse')) {
        softGround(ctx, ox, oy, sw, sh, 0.8, 0.52, 0.3, "20,26,14", 0.7); // sol (désactivé par défaut)
        // Serre vitrée (centre-droit, 128×96 → large) ; ombre puis prop (aspect ~4:3).
        const ghx = 0.58, ghy = 0.48;
        /* ombre de contact retirée */
        blitProp(ctx, ox, oy, sw, sh, 'forager-greenhouse', ghx, ghy, 0.9, 0.675);
        // Paysan réutilisé : navette brouette ↔ serre.
        if (farmerReady()) {
          drawFarmerShuttle(ctx, ox, oy, sw, sh, now, 0.24, 0.44, 0.84, 6800, 0, 0.48);
          if (tier >= 2) drawFarmerShuttle(ctx, ox, oy, sw, sh, now, 0.3, 0.46, 0.76, 7600, 0.5, 0.42);
        }
        // Brouette (gauche-devant), dessinée APRÈS le paysan ; ombre puis prop.
        const hcx = 0.2, hcy = 0.74;
        ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.beginPath(); ctx.ellipse(ox + sw * hcx, oy + sh * (hcy + 0.06), sw * 0.15, sh * 0.04, 0, 0, Math.PI * 2); ctx.fill();
        blitProp(ctx, ox, oy, sw, sh, 'forager-handcart', hcx, hcy, 0.36, 0.32);
      }
    } else {
      // ── STADE 3 · HYDROPONIE NÉON — rack vertical, fruits lumineux, bras robotisé ──
      // Néon froid, arcologies, automatisation : plus aucun humain, la récolte
      // est entièrement robotisée. Facteur nuit dérivé de litGold (alpha = CM.nightF*0.95).
      const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
      // Pixel-art (rack hydroponique PixelLab + halo) ; rien tant que le rack n'est pas chargé.
      if (propReady('forager-hydro-rack')) {
        const prkH = 0.78 + Math.min(2, tier) * 0.03, prx = 0.52, pry = 0.5;
        softGround(ctx, ox, oy, sw, sh, 0.82, 0.54, 0.3, "16,22,26", 0.6); // dalle (désactivée par défaut)
        px(0.1, 0.74, 0.18, 0.1, "#1a2228"); strokeRect(0.1, 0.74, 0.18, 0.1, "#2c3a44"); // bac récepteur (gauche)
        // Rack (centre, 96×128 → haut) ; taille montante selon le tier.
        /* ombre de contact retirée (retour Raph 2026-08-04 : l'ellipse sous un
           BÂTIMENT le fait flotter — cf. isoRenderer, même refus) */
        blitProp(ctx, ox, oy, sw, sh, 'forager-hydro-rack', prx, pry, prkH * 0.75, prkH);
        // Halo néon additif qui RESPIRE, piloté par la nuit (le prop porte déjà le glow
        // baké) — seule « vie » de la scène désormais (bras robot retiré à la demande).
        if (nF > 0.02) {
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const pulse = nF * ENGINE_HALO.night * (0.26 + 0.08 * Math.sin(now / 900));
          const gg = ctx.createRadialGradient(ox + sw * prx, oy + sh * pry, 0, ox + sw * prx, oy + sh * pry, sw * 0.42);
          gg.addColorStop(0, `rgba(90,230,210,${pulse.toFixed(2)})`); gg.addColorStop(1, "rgba(90,230,210,0)");
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ox + sw * prx, oy + sh * pry, sw * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
    }
    return true;
  }
  if (id === "granaries_city") {
    if (band >= 7) { // silos cosmiques : tour PixelLab + halo qui respire
      const { cp } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      const ckey = 'granary-cosmic-' + band;
      // TOUR gigantesque (halo intégré) ; décor pas encore chargé : rien.
      if (propReady(ckey)) blitCosmicTower(ctx, ox, oy, sw, sh, ckey, now, band, cp);
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : entrepôts sur pilotis → halle de pierre → entrepôt industriel
    // → hub logistique automatisé. tier reste la richesse intra-stade.
    const stage = engineStage(ei);
    if (stage === 0) {
    // ── STADE 0 · GRENIERS — silos sur pilotis, grain doré, oiseau picoreur ──
    // (scène ENTIÈREMENT statique : un silo figé, aucun `now`)
    // Terre battue passée par softGround : la tache était peinte À LA MAIN ici, donc
    // elle survivait à DRAW_BUILDING_GROUND=false et lisait comme une ombre noire.
    softGround(ctx, ox, oy, sw, sh, 0.82, 0.56, 0.3, "36,26,12", 0.82); // sol (désactivé par défaut)
    // UN SEUL grand silo (sprite PixelLab « bien travaillé ») ; rien tant qu'il charge.
    if (propReady('granary-prop-silo')) {
      const hFrac = 0.82;                                  // grand silo portrait (80×96)
      // Pieds posés sur la tache d'ombre (cyp ≈ 0.82) : on ancre la BASE du cadre plus
      // bas (0.92) pour compenser le padding transparent sous le silo dans le sprite.
      blitProp(ctx, ox, oy, sw, sh, 'granary-prop-silo', 0.5, 0.92 - hFrac / 2, hFrac * 80 / 96, hFrac);
    }
    // (entrepôt = un seul silo statique : ni sacs, ni porteur, ni oiseau)
    } else if (stage === 1) {
      // ── STADE 1 · HALLE DE PIERRE — façade à arcade, toit de tuiles, fanion ──
      // La ville se pave et se fortifie : le grain se mesure en jarres, un commis
      // tient le registre. Pierre claire + tuiles (Âge de la Pierre/Couronne).
      // Pixel-art (halle + amphores) ; rien tant que le prop n'est pas chargé.
      if (propReady('granary-hall')) { // scène ENTIÈREMENT statique (aucun `now`)
        softGround(ctx, ox, oy, sw, sh, 0.82, 0.54, 0.28, "30,28,22", 0.68); // sol (désactivé par défaut)
        // Halle de pierre (centre-droit, 112×96) ; ombre + prop.
        const ghx = 0.56, ghy = 0.46;
        /* ombre de contact retirée */
        blitProp(ctx, ox, oy, sw, sh, 'granary-hall', ghx, ghy, 0.82, 0.7);
        // Amphores à grain (gauche-devant) ; ombre + prop.
        const gjx = 0.19, gjy = 0.76;
        ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(ox + sw * gjx, oy + sh * (gjy + 0.05), sw * 0.14, sh * 0.035, 0, 0, Math.PI * 2); ctx.fill();
        blitProp(ctx, ox, oy, sw, sh, 'granary-jars', gjx, gjy, 0.3, 0.24);
      }
    } else if (stage === 2) {
      // ── STADE 2 · ENTREPÔT INDUSTRIEL — brique, charpente fer, palan à poulie ──
      // Mise à l'échelle : un palan hisse des caisses vers la porte de chargement.
      // Brique sombre & métal (Âge du Marbre/Fonte) ; réverbère à gaz la nuit.
      // Pixel-art (entrepôt + caisses ; ses fenêtres s'allument la nuit, cf. sceneWindows.js).
      // Scène ENTIÈREMENT statique (aucun `now`) ; rien tant que le prop n'est pas chargé.
      if (propReady('granary-warehouse')) {
        softGround(ctx, ox, oy, sw, sh, 0.82, 0.54, 0.28, "22,20,18", 0.6); // sol (désactivé par défaut)
        // Entrepôt (centre-droit, 112×96) ; ombre + prop.
        const whx = 0.56, why = 0.46;
        /* ombre de contact retirée */
        blitProp(ctx, ox, oy, sw, sh, 'granary-warehouse', whx, why, 0.82, 0.7);
        // Caisses palettisées (gauche-devant) ; ombre + prop.
        const gcx = 0.2, gcy = 0.75;
        ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.beginPath(); ctx.ellipse(ox + sw * gcx, oy + sh * (gcy + 0.055), sw * 0.14, sh * 0.035, 0, 0, Math.PI * 2); ctx.fill();
        blitProp(ctx, ox, oy, sw, sh, 'granary-crates', gcx, gcy, 0.3, 0.27);
      }
    } else {
      // ── STADE 3 · HUB LOGISTIQUE AUTOMATISÉ — conteneurs, portique robotisé ──
      // Néon froid, plus aucun humain : un portique-navette déplace les palettes
      // le long d'un rail. Halo cyan piloté par la nuit (litGold → CM.nightF).
      const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
      // Pixel-art (hub logistique + halo cyan qui respire la nuit) ; rien tant que le prop charge.
      if (propReady('granary-hub')) {
        const hbx = 0.5, hby = 0.5, hbH = 0.7 + Math.min(2, tier) * 0.03;
        softGround(ctx, ox, oy, sw, sh, 0.82, 0.54, 0.3, "16,22,26", 0.6); // dalle (désactivée par défaut)
        /* ombre de contact retirée (retour Raph 2026-08-04) */
        blitProp(ctx, ox, oy, sw, sh, 'granary-hub', hbx, hby, hbH * 1.333, hbH); // 128×96 → large
        if (nF > 0.02) { // halo cyan qui respire (lit `now`)
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const pulse = nF * ENGINE_HALO.night * (0.24 + 0.08 * Math.sin(now / 900));
          const gg = ctx.createRadialGradient(ox + sw * hbx, oy + sh * hby, 0, ox + sw * hbx, oy + sh * hby, sw * 0.44);
          gg.addColorStop(0, `rgba(90,230,210,${pulse.toFixed(2)})`); gg.addColorStop(1, "rgba(90,230,210,0)");
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ox + sw * hbx, oy + sh * hby, sw * 0.44, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
    }
    return true;
  }
  if (id === "caravans") {
    if (band >= 7) { // PORTAIL DE TRANSIT cosmique : tour PixelLab + halo qui respire
      const { cp } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      const ckey = 'caravan-cosmic-' + band;
      // TOUR gigantesque (halo intégré) ; décor pas encore chargé : rien.
      if (propReady(ckey)) blitCosmicTower(ctx, ox, oy, sw, sh, ckey, now, band, cp);
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : mulet bâté → convoi caravanier pavé → fret industriel à vapeur
    // → logistique autonome néon. tier reste la richesse intra-stade (nombre de
    // bêtes/charrettes/wagons/conteneurs). Lumières via CM.nightF : nF dérivé de
    // litGold (halos additifs).
    const stage = engineStage(ei);
    const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
    if (stage === 0) {
      if (muleRestReady()) {
      // ── STADE 0 · HALTE DE CARAVANE — mulet couché qui lève la tête, marchand au dépôt ──
      // Piste battue passée par softGround : elle était peinte À LA MAIN ici, donc
      // elle survivait à DRAW_BUILDING_GROUND=false et lisait comme une ombre noire.
      softGround(ctx, ox, oy, sw, sh, 0.84, 0.62, 0.2, "36,26,12", 0.72); // piste (désactivée par défaut)
      drawCaravanHalt(ctx, ox, oy, sw, sh, now); // helper ANIMÉ (mulet + marchand + dépôt)
      }
      // (mulet pas encore chargé : rien — le mulet bâté procédural de repli est retiré, MORT-2)
    } else if (stage === 1) {
      // ── STADE 1 · RELAIS DE CONVOI — chariot dételé à la halte, on sangle le fret ──
      // La ville se pave et règne : le commerce s'organise en convois gardés.
      // Le chariot ne fait plus la navette (cf. drawCaravanHalt) : il stationne au dépôt.
      // Bénéfice de côté — le cheval du sprite est DÉTACHÉ du timon ; à l'arrêt ce
      // décalage lit comme une bête dételée, en mouvement il lisait comme un attelage cassé.
      if (propReady('caravan-wagon')) {
        softGround(ctx, ox, oy, sw, sh, 0.7, 0.54, 0.3, "36,31,22", 0.5); // sol/chaussée (désactivé par défaut)
        if (propReady('caravan-prop-sacks')) blitProp(ctx, ox, oy, sw, sh, 'caravan-prop-sacks', 0.88, 0.73, 0.24 * 64 / 48, 0.24); // dépôt réutilisé
        blitPropGrounded(ctx, ox, oy, sw, sh, 'caravan-wagon', 0.42, 0.82, VEH_W, VEH_W * 64 / 112);
        // Charretier accroupi entre le chariot et le dépôt (au premier plan, il passe devant).
        if (foragerReady()) drawCrouchWorker(ctx, ox, oy, sw, sh, now, 0.78, 0.9, 3800, 0.35, VEH_MAN);
      }
    } else if (stage === 2) {
      // ── STADE 2 · DÉPÔT DE FRET — locomobile à l'arrêt sous pression, on charge ──
      // Fonte et vapeur : la marchandise s'entasse au quai, la machine chauffe sur place.
      // Plus de navette (cf. drawCaravanHalt) : la vie vient de la fumée et du manutentionnaire.
      if (propReady('caravan-truck')) {
        const VX = 0.42, VW = VEH_W, VH = VEH_W * 64 / 112, VFY = 0.82;
        softGround(ctx, ox, oy, sw, sh, 0.72, 0.54, 0.3, "24,20,15", 0.5); // sol/chaussée (désactivé par défaut)
        if (propReady('granary-crates')) blitProp(ctx, ox, oy, sw, sh, 'granary-crates', 0.88, 0.73, 0.22, 0.2); // dépôt réutilisé
        blitPropGrounded(ctx, ox, oy, sw, sh, 'caravan-truck', VX, VFY, VW, VH);
        // Fumée : la cheminée est à 0.75 du sprite en x, sa gueule à 0.19 en y (bas du
        // contenu à 0.844) — repérée sur le PNG, pas devinée, sinon le panache flotte à côté.
        const stx = VX + (0.75 - 0.5) * VW, sty = VFY - (0.844 - 0.19) * VH;
        for (let s = 0; s < 3; s++) {
          const sp = ((now / 1500) + s * 0.33) % 1;
          ctx.fillStyle = `rgba(120,116,110,${(0.32 * (1 - sp)).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(ox + sw * (stx + Math.sin(sp * 3) * 0.02), oy + sh * (sty - sp * 0.22), sw * (0.015 + sp * 0.035), 0, Math.PI * 2); ctx.fill();
        }
        // Manutentionnaire accroupi au quai, devant la machine.
        if (foragerReady()) drawCrouchWorker(ctx, ox, oy, sw, sh, now, 0.77, 0.9, 3400, 0.6, VEH_MAN);
      }
    } else {
      // ── STADE 3 · LOGISTIQUE AUTONOME — pod cargo à sustentation néon ──
      // Néon froid, automatisation : plus aucun humain, le fret se charge seul.
      // Pixel-art (pod cargo néon + halo qui respire) ; rien tant que le pod n'est pas chargé. (Pas de bras robot.)
      // Plus de glissade d'un bord à l'autre (cf. drawCaravanHalt) : le pod est À QUAI,
      // soute ouverte. La vie tient au balayage du scanner de chargement et au halo.
      if (propReady('caravan-pod')) {
        const VX = 0.46, VW = VEH_W * 0.94, VH = VEH_W * 0.94 * 64 / 112, VFY = 0.81;
        softGround(ctx, ox, oy, sw, sh, 0.82, 0.54, 0.3, "16,22,26", 0.6); // dalle (désactivée par défaut)
        px(0.04, 0.8, 0.92, 0.02, "#16323a");
        ctx.fillStyle = "#2f8fa0"; ctx.fillRect(ox + sw * 0.04, oy + sh * 0.805, sw * 0.92, Math.max(1, sh * 0.006)); // rail cyan
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(ox + sw * VX, oy + sh * VFY, sw * VW * 0.4, sh * 0.028, 0, 0, Math.PI * 2); ctx.fill();
        blitPropGrounded(ctx, ox, oy, sw, sh, 'caravan-pod', VX, VFY, VW, VH);
        // Scanner + liserés qui pulsent + halo.
        // Faisceau du scanner qui balaie la soute de bout en bout (le pod, lui, ne bouge pas).
        // Borné au CONTENU du sprite (y 0.25..0.781 du PNG) : calé sur le cadre, il dépassait
        // du toit et lisait comme une antenne verte plantée dans le décor.
        const sk = (Math.sin(now / 1900) + 1) / 2, sx = VX + (sk - 0.5) * VW * 0.62;
        const roofY = VFY - (0.781 - 0.25) * VH;
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(120,240,220,0.34)";
        ctx.fillRect(ox + sw * sx - Math.max(1, sw * 0.008), oy + sh * roofY, Math.max(1, sw * 0.016), sh * (VFY - roofY) * 0.82);
        ctx.restore();
        // Pile de conteneurs au quai (le pod n'a plus de dépôt pixel : sans elle la dalle
        // est vide et la scène ne dit plus « logistique »). Liseré cyan qui pulse en décalé.
        for (let s = 0; s < 3; s++) {
          const cy2 = 0.78 - s * 0.055, pulse = 0.5 + 0.5 * Math.sin(now / 900 + s * 1.1);
          ctx.fillStyle = s % 2 ? "#243038" : "#2a3a44"; ctx.fillRect(ox + sw * 0.85, oy + sh * cy2, sw * 0.11, sh * 0.052);
          ctx.fillStyle = `rgba(47,143,160,${(0.55 + 0.45 * pulse).toFixed(2)})`; ctx.fillRect(ox + sw * 0.85, oy + sh * cy2, sw * 0.11, Math.max(1, sh * 0.005));
        }
        if (nF > 0.02) {
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const pulse = nF * ENGINE_HALO.night * (0.24 + 0.08 * Math.sin(now / 240));
          const gg = ctx.createRadialGradient(ox + sw * VX, oy + sh * 0.68, 0, ox + sw * VX, oy + sh * 0.68, sw * 0.34);
          gg.addColorStop(0, `rgba(90,230,210,${pulse.toFixed(2)})`); gg.addColorStop(1, "rgba(90,230,210,0)");
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ox + sw * VX, oy + sh * 0.68, sw * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
    }
    return true;
  }
  if (id === "markets") {
    if (band >= 7) { // NEXUS D'ÉCHANGE cosmique : tour PixelLab + halo qui respire
      const { cp } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      const ckey = 'market-cosmic-' + band;
      // TOUR gigantesque (halo intégré) ; décor pas encore chargé : rien.
      if (propReady(ckey)) blitCosmicTower(ctx, ox, oy, sw, sh, ckey, now, band, cp);
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei 0–34), un tous les 10 âges :
    // troc sur nattes → halle à toile rayée → halles de fonte vitrées →
    // place de commerce néon. Le geste animé reste le transport/échange de
    // marchandises à chaque âge (main-à-main → chaland → diable → drone).
    // tier = richesse intra-stade (étals / marchandises / travées / kiosques).
    const stage = engineStage(ei);
    if (band === 4) {
      // ── STADE CLASSIQUE (band 4 = Marbre, habitants en toge) · MACELLUM À COLONNADE ──
      // Marché romain (prop PixelLab 'market-macellum') + chaland au panier. Rien tant
      // que le prop n'est pas chargé (MORT-2 : le portique procédural de repli est retiré).
      if (propReady('market-macellum')) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.28, "44,36,22", 0.5);
        blitProp(ctx, ox, oy, sw, sh, 'market-macellum', 0.5, 0.44, 0.88, 0.76);
        if (basketReady()) drawShopperShuttle(ctx, ox, oy, sw, sh, now, 0.84, 0.46, 0.82, 5200, 0, 0.46); // chaland au panier
      }
      return true;
    }
    if (stage === 0) {
      // ── STADE 0 · TROC SUR NATTES ──
      // Âge du Feu/Bois : étal de troc sous auvent de peau. Pixel-art = prop PixelLab
      // (étal statique) + cueilleurs RÉUTILISÉS animés (vendeur accroupi + chaland qui
      // s'approche et troque). Rien tant que le prop n'est pas chargé (MORT-2).
      if (propReady('market-prop-stall')) {
        softGround(ctx, ox, oy, sw, sh, 0.73, 0.5, 0.3, "40,28,14", 0.5); // sol (désactivé par défaut)
        // Étal de troc (prop PixelLab) — pièce maîtresse, aspect 96×72 préservé
        blitProp(ctx, ox, oy, sw, sh, 'market-prop-stall', 0.5, 0.46, 0.92, 0.69);
        // Tier 1+ : panier de marchandises latéral (réutilise le prop cueilleur,
        // à la MÊME taille qu'au verger — c'est le même objet, il se cale sur l'homme)
        if (tier >= 1) blitPropHuman(ctx, ox, oy, sw, sh, 'forager-prop-basket', 0.78, 0.88, BASKET_HF);
        if (foragerReady()) { // vendeur + chalands : sprites cadencés par `now`
          // Vendeur accroupi au bord de l'étal (idle lent, face caméra)
          const vf = Math.floor((now || 0) / 280) % FORAGER_CLIPS['crouch-south'];
          sceneHumanShadow(ctx, ox, oy, sw, sh, 0.34, 0.66, 0.42, 0.2);
          blitForager(ctx, ox, oy, sw, sh, 0.34, 0.66, 'crouch-south', vf, 0.42);
          // Chaland : arrive de la droite, troque au plus près, repart
          const cyc0 = ((now || 0) / 4200) % 1;
          const coming = cyc0 < 0.5;
          const k0 = coming ? cyc0 * 2 : (1 - cyc0) * 2;     // 0 (bord) → 1 (étal)
          const cpx = 0.86 - k0 * 0.28;                       // 0.86 → 0.58
          const cdir = coming ? 'west' : 'east';
          const cfr = Math.floor((now || 0) / 150) % FORAGER_CLIPS['walk-' + cdir];
          sceneHumanShadow(ctx, ox, oy, sw, sh, cpx, 0.7, 0.42, 0.2);
          blitForager(ctx, ox, oy, sw, sh, cpx, 0.7, 'walk-' + cdir, cfr, 0.42);
          // Tier 2+ : second chaland qui flâne (gauche, opposition de phase)
          if (tier >= 2) {
            const cyc1 = ((now || 0) / 5200 + 0.5) % 1;
            const coming1 = cyc1 < 0.5;
            const k1 = coming1 ? cyc1 * 2 : (1 - cyc1) * 2;
            const cpx1 = 0.14 + k1 * 0.22;                    // arrive de la gauche
            const cdir1 = coming1 ? 'east' : 'west';
            const cfr1 = Math.floor((now || 0) / 160) % FORAGER_CLIPS['walk-' + cdir1];
            blitForager(ctx, ox, oy, sw, sh, cpx1, 0.84, 'walk-' + cdir1, cfr1, 0.38);
          }
        }
      }
    } else if (stage === 1) {
      // ── STADE 1 · HALLE À TOILE RAYÉE — marché médiéval, comptoir, fanions ──
      // Âge de la Pierre/Couronne : la halle couverte canonique. Le chaland
      // repart du comptoir avec un panier rempli (transport de marchandises).
      // Pixel-art (halle à toile + chaland au panier en navette) ; rien tant que le prop charge.
      if (propReady('market-hall-tent')) {
        softGround(ctx, ox, oy, sw, sh, 0.82, 0.5, 0.26, "40,32,20", 0.5); // sol (désactivé par défaut)
        const mhx = 0.5, mhy = 0.42;
        /* ombre de contact retirée */
        blitProp(ctx, ox, oy, sw, sh, 'market-hall-tent', mhx, mhy, 0.86, 0.74);
        if (basketReady()) { // chaland au panier : navette
          drawShopperShuttle(ctx, ox, oy, sw, sh, now, 0.84, 0.42, 0.82, 5200, 0, 0.5);
          if (tier >= 2) drawShopperShuttle(ctx, ox, oy, sw, sh, now, 0.8, 0.5, 0.74, 6000, 0.5, 0.44);
        }
      }
    } else if (stage === 2) {
      // ── STADE 2 · HALLES DE FONTE VITRÉES — charpente Baltard, verrière ──
      // Âge du Marbre/Fonte : nef vitrée à montants de fonte. Un porteur pousse
      // un diable de caisses qui fait la navette le long de l'allée.
      // Pixel-art (halles vitrées + chaland + verrière éclairée la nuit) ; rien tant que le prop charge.
      if (propReady('market-hall-glass')) {
        const nFw = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
        softGround(ctx, ox, oy, sw, sh, 0.78, 0.54, 0.34, "32,25,15", 0.6); // sol (désactivé par défaut)
        const mhx = 0.5, mhy = 0.44;
        /* ombre de contact retirée */
        blitProp(ctx, ox, oy, sw, sh, 'market-hall-glass', mhx, mhy, 0.86, 0.74); // v2 top-down (112×96)
        if (nFw > 0.02) { // verrière chaude la nuit (vitres bakées + halo additif ; nF seul → statique)
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = `rgba(255,210,140,${(nFw * 0.26).toFixed(2)})`;
          ctx.beginPath(); ctx.ellipse(ox + sw * mhx, oy + sh * mhy, sw * 0.3, sh * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        if (basketReady()) { // chaland au panier en navette
          drawShopperShuttle(ctx, ox, oy, sw, sh, now, 0.84, 0.46, 0.84, 5400, 0, 0.48);
          if (tier >= 2) drawShopperShuttle(ctx, ox, oy, sw, sh, now, 0.78, 0.5, 0.77, 6200, 0.5, 0.42);
        }
      }
    } else {
      // ── STADE 3 · PLACE DE COMMERCE NÉON — kiosques auto, drone, hologramme ──
      // Âge du Néon : dalle sombre, kiosques à liserés cyan et prix défilants,
      // hologramme flottant, drone de livraison qui glisse sur un rail. Lumières
      // additives pilotées par la nuit (litGold → CM.nightF).
      // Pixel-art (place néon : kiosques + hologramme + halo qui respire) ; rien tant que le prop charge.
      if (propReady('market-plaza-neon')) {
        const nFk = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
        const mhx = 0.5, mhy = 0.46;
        softGround(ctx, ox, oy, sw, sh, 0.78, 0.54, 0.34, "16,22,26", 0.6); // dalle (désactivée par défaut)
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(ox + sw * mhx, oy + sh * 0.8, sw * 0.34, sh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
        blitProp(ctx, ox, oy, sw, sh, 'market-plaza-neon', mhx, mhy, 0.86, 0.74);
        if (nFk > 0.02) { // halo qui respire + hologramme : lisent `now`
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const pulse = nFk * ENGINE_HALO.night * (0.22 + 0.08 * Math.sin(now / 700));
          const gg = ctx.createRadialGradient(ox + sw * mhx, oy + sh * mhy, 0, ox + sw * mhx, oy + sh * mhy, sw * 0.42);
          gg.addColorStop(0, `rgba(110,230,240,${pulse.toFixed(2)})`); gg.addColorStop(1, "rgba(110,230,240,0)");
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ox + sw * mhx, oy + sh * mhy, sw * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          // Hologramme de prix flottant (scintille)
          const hy = 0.24 + Math.sin(now / 700) * 0.01;
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = `rgba(120,240,200,${(nFk * 0.5).toFixed(2)})`;
          ctx.fillRect(ox + sw * 0.44, oy + sh * hy, sw * 0.12, sh * 0.03); ctx.restore();
        }
      }
    }
    return true;
  }
  if (id === "guilds") {
    if (band >= 7) { // ASSEMBLEUR cosmique : tour PixelLab + halo/cœur qui pulse
      const { cp } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      const ckey = 'guild-cosmic-' + band;
      // TOUR gigantesque (halo intégré) ; décor pas encore chargé : rien.
      if (propReady(ckey)) blitCosmicTower(ctx, ox, oy, sw, sh, ckey, now, band, cp);
      return true;
    }
    // ── GUILDES — confrérie de métier ─────────────────────────────────
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges, calés sur les eraBand du design ville (ageVisualConfig.js) :
    //   0 atelier de bois → 1 maison de guilde (pans de bois) →
    //   2 chambre des corporations (pierre/fronton) → 3 consortium (verre/néon).
    // Marqueur d'identité constant à chaque ère : emblème de métier doré
    // (roue dentée / marteaux) + bannière ou enseigne. tier reste la richesse
    // intra-stade. nF = facteur nuit dérivé de litGold (même convention que
    // les autres sprites du module, cf. river_ports/markets). Aléa nul :
    // tout est déterministe en now/tier (pas de Math.random dans le rendu).
    const stage = engineStage(ei);
    const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
    if (stage === 0) {
      // ── LE LODGE D'ARTISANS (clos) ──
      // Pixel-art = prop PixelLab (hall clos qui grandit) + animation par-dessus :
      // lueur de forge à la porte + fumée du faîte + artisan RÉUTILISÉ qui livre.
      // Bâtiment CLOS distinct des maisons (cf DA). Rien tant que le prop n'est pas
      // chargé (MORT-2).
      if (propReady('guild-prop-lodge')) {
        softGround(ctx, ox, oy, sw, sh, 0.85, 0.46, 0.24, "38,26,12", 0.45); // sol (désactivé par défaut)
        // Le lodge (prop PixelLab) — aspect 96×96 carré
        blitProp(ctx, ox, oy, sw, sh, 'guild-prop-lodge', 0.5, 0.5, 0.86, 0.86);
        // Lueur de forge à la porte (additive, vacille + monte la nuit)
        const dgx = ox + sw * 0.58, dgy = oy + sh * 0.6;
        // Lueur de forge DOUCE qui « sort » de l'embrasure : clignotement LENT (/1100)
        // et de faible amplitude ; rayon resserré → reste dans la porte/le mur, pas sur la terre.
        const fl = 0.22 + 0.05 * Math.abs(Math.sin((now || 0) / 1100)) + nF * 0.22;
        const gr = sw * 0.065;
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(dgx, dgy, 0, dgx, dgy, gr);
        g.addColorStop(0, `rgba(255,150,55,${Math.min(0.5, fl).toFixed(2)})`);
        g.addColorStop(1, "rgba(255,150,55,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dgx, dgy, gr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        // Fumée du faîte : 3 bouffées qui montent en boucle (dérivent vers la droite)
        for (let i = 0; i < 3; i++) {
          const t = (((now || 0) / 2600) + i / 3) % 1;
          const spx = 0.5 + 0.07 * t + 0.012 * Math.sin((now || 0) / 300 + i);
          const spy = 0.3 - 0.26 * t;
          ctx.fillStyle = `rgba(208,198,188,${(0.28 * (1 - t)).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(ox + sw * spx, oy + sh * spy, sw * (0.022 + 0.05 * t), 0, Math.PI * 2); ctx.fill();
        }
        // (bannière + panier de fruits RETIRÉS — demande Raph : ni drapeaux SVG ni panier sur les guildes)
        // (pas d'artisan animé ici — retiré à la demande de l'utilisateur ; l'anim
        //  vient de la fumée + lueur de porte + bannière au vent)
      }
    } else if (stage === 1) {
      // ── LA MAISON DE GUILDE (bourg → fortifié) : pans de bois, pignon à redans ──
      // Pixel-art (maison de guilde + forge/fumée/bannière) ; rien tant que le prop charge.
      if (propReady('guild-house')) {
        softGround(ctx, ox, oy, sw, sh, 0.85, 0.46, 0.24, "38,26,12", 0.45); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, 'guild-house', 0.5, 0.5, 0.86, 0.86);
        // Lueur de forge à la porte (additive, vacille + monte la nuit)
        { const dgx = ox + sw * 0.56, dgy = oy + sh * 0.64, fl = 0.2 + 0.05 * Math.abs(Math.sin(now / 1100)) + nF * 0.2, gr = sw * 0.06;
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(dgx, dgy, 0, dgx, dgy, gr);
          g.addColorStop(0, `rgba(255,150,55,${Math.min(0.5, fl).toFixed(2)})`); g.addColorStop(1, "rgba(255,150,55,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dgx, dgy, gr, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
        // Fumée du faîte : 3 bouffées qui montent
        for (let i = 0; i < 3; i++) { const t = ((now / 2600) + i / 3) % 1;
          ctx.fillStyle = `rgba(208,198,188,${(0.26 * (1 - t)).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(ox + sw * (0.62 + 0.06 * t + 0.012 * Math.sin(now / 300 + i)), oy + sh * (0.3 - 0.24 * t), sw * (0.02 + 0.045 * t), 0, Math.PI * 2); ctx.fill(); }
        // (bannière RETIRÉE — demande Raph : plus de drapeaux SVG sur les guildes)
      }
    } else if (stage === 2) {
      // ── LA CHAMBRE DES CORPORATIONS (impérial → monumental) : pierre néoclassique ──
      // Pixel-art (chambre des corporations + lueur d'entrée la nuit) ; rien tant que le prop charge.
      if (propReady('guild-chamber')) { // scène ENTIÈREMENT statique (lueur en nF seul, aucun `now`)
        softGround(ctx, ox, oy, sw, sh, 0.85, 0.46, 0.24, "30,28,22", 0.42); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, 'guild-chamber', 0.5, 0.5, 0.86, 0.86);
        // Lueur chaude à l'entrée la nuit (pas de forge : c'est une chambre de pierre)
        if (nF > 0.02) {
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const dgx = ox + sw * 0.5, dgy = oy + sh * 0.66, gr = sw * 0.08;
          const g = ctx.createRadialGradient(dgx, dgy, 0, dgx, dgy, gr);
          g.addColorStop(0, `rgba(255,210,140,${(nF * 0.34).toFixed(2)})`); g.addColorStop(1, "rgba(255,210,140,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dgx, dgy, gr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // (bannière RETIRÉE — demande Raph)
      }
    } else {
      // ── LE CONSORTIUM (mégalopole / singularité) : tour de verre + néon ──
      // Pixel-art (consortium verre/néon + halo cyan qui respire) ; rien tant que le prop charge.
      if (propReady('guild-consortium')) {
        softGround(ctx, ox, oy, sw, sh, 0.78, 0.54, 0.34, "16,22,26", 0.6); // dalle (désactivée par défaut)
        blitProp(ctx, ox, oy, sw, sh, 'guild-consortium', 0.5, 0.5, 0.86, 0.86);
        if (nF > 0.02) { // halo cyan qui respire (néons + emblème holo bakés ; lit `now`)
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const pulse = nF * ENGINE_HALO.night * (0.22 + 0.08 * Math.sin(now / 700));
          const gg = ctx.createRadialGradient(ox + sw * 0.5, oy + sh * 0.5, 0, ox + sw * 0.5, oy + sh * 0.5, sw * 0.42);
          gg.addColorStop(0, `rgba(90,220,255,${pulse.toFixed(2)})`); gg.addColorStop(1, "rgba(90,220,255,0)");
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ox + sw * 0.5, oy + sh * 0.5, sw * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
    }
    return true;
  }
  // (Plus de scène pour les champs irrigués : drawIsoEngineScene refuse les empreintes
  // à plat (/field|farm|crop|orchard/) et les renvoie à leur parcelle iso dédiée. Leur
  // branche et l'arroseur drawFieldSprinkler, jamais atteints, sont retirés — MORT-2.)
  if (id === "river_ports") {
    if (band >= 7) { // GRAND PORT cosmique : halle + conteneurs + ponton ; le VRAI fleuve sert d'eau (pas d'eau fake)
      const cp = COSMIC_PAL[band] || COSMIC_PAL[9];
      // Riverain COSMIQUE = composition SPRITE propre (leçon carré brun : AUCUN fond peint,
      // berge + fleuve naturels dessous). DOCK sprite plongeant vers l'eau, dessiné SOUS le bâtiment.
      const sizeMul = band >= 9 ? 5.6 : band >= 8 ? 4.8 : 4.0;
      const DOCK = propReady('port-dock-modern') ? 'port-dock-modern' : 'port-prop-pontoon';
      blitProp(ctx, ox, oy, sw, sh, DOCK, 0.5, 0.46, Math.min(gw * 0.55, 0.9 + sizeMul * 0.24) / Math.max(1, gw), 2.7 / Math.max(1, gh));
      // Corps du port = TOUR-terminal cosmique (sprite posé sur la berge, ancrage riverain) ;
      // quai + pontons + vaisseaux restent dessinés autour. Rien tant que le sprite manque (MORT-2).
      const pk = 'port-cosmic-' + band;
      if (propReady(pk)) blitCosmicTower(ctx, ox, oy, sw, sh, pk, now, band, cp, (import.meta.env?.DEV && typeof window !== 'undefined' && window.__cosmicRiverBase) || 0.6); // halo qui respire
      // Bateau cosmique de l'ère amarré au bout du dock (sprite, aucun procédural). ANIMÉ (bob + frames).
      blitEraBoat(ctx, ox, oy, sw, sh, 0.5, 0.72, 0.7 * sizeMul, 'cosmic-' + Math.min(9, Math.max(7, band)), now, gw);
      return true;
    }
    // ── PORT FLUVIAL UNIQUE ───────────────────────────────────────────────────
    // Un seul port sur la carte, posé sur la rive nord, bord SUD plaqué sur l'eau
    // (cf. layout.js) : le bas du sprite (y→1) EST la berge, le vrai fleuve est
    // juste en dessous. On compose donc du nord (haut) vers l'eau (bas) :
    //   • corps du bâtiment qui s'étire sur la terre (haut),
    //   • esplanade + PARKING À BATEAUX (designs d'époques passées sur cale),
    //   • pontons qui plongent dans le fleuve + bateau ACTIF à quai.
    // Le PORT change de design tous les 10 âges (stage) ; le BATEAU tous les 2
    // âges (bv = ei/2) — l'actif suit l'ère, le parking conserve les anciens.
    const stage = engineStage(ei);
    // ── PIXEL-ART (stade 0) : remplace le port procédural par des SPRITES TRANSPARENTS
    //    posés sur la tuile NATURELLE (berge + fleuve déjà rendus = base nickel) :
    //    bâtiment vue de-face-de-haut sur la berge + bateau de l'ère dans le fleuve.
    //    AUCUN procédural, aucun fond peint, aucune modif moteur (cf. leçon du carré brun).
    // Bâtiment de quai par STADE (0 = hutte validée ; 1 = entrepôt médiéval ; 2 = dock
    // brique ; 3 = terminal verre/néon). Repli sur la hutte si le prop du stade n'est pas
    // chargé, puis RIEN → JAMAIS de procédural (leçon carré brun : uniquement des sprites
    // transparents sur berge+fleuve naturels ; l'ancien port paramétrique, qui ne servait
    // plus qu'avant le décodage des PNG, est retiré — MORT-2). Le ponton et le bateau de
    // l'ère sont réutilisés tels quels.
    const stageHouse = (band === 4 && propReady('port-house-classical')) ? 'port-house-classical' : ['port-prop-house', 'port-house-medieval', 'port-house-industrial', 'port-house-modern'][stage];
    const PORT_HOUSE = propReady(stageHouse) ? stageHouse : (propReady('port-prop-house') ? 'port-prop-house' : null);
    if (PORT_HOUSE) {
      // Ère du bateau (drawShips) — sert AUSSI à dimensionner bâtiment + dock : TOUT
      // grandit ensemble avec l'ère (radeau → conteneur), pour la cohérence d'échelle.
      // Le stade est celui de la flotte (tradeStage, isoFleet) : les bateaux à quai et
      // ceux du fleuve changent d'époque ensemble (audit du 05/10, STRUCT-12).
      const vstage = tradeStage(band, ei);
      const sizeMul = vstage === 'cosmic' ? (band >= 9 ? 5.6 : band >= 8 ? 4.8 : 4.0)
        : vstage === 'container' ? 3.2 : vstage === 'steam' ? 2.4 : vstage === 'sail' ? 1.8 : 1.36;
      const boatName = vstage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, band)) : vstage;
      // DOCK (dessiné AVANT le bâtiment → le bâtiment recouvre proprement le raccord à la
      // berge) : matériau par ère (bois 0-1 → pierre 2 → béton/métal 3) + LARGEUR qui suit
      // le bateau. Repli sur le ponton bois si le dock du stade n'est pas chargé.
      const stageDock = ['port-prop-pontoon', 'port-prop-pontoon', 'port-dock-stone', 'port-dock-modern'][stage];
      const DOCK = propReady(stageDock) ? stageDock : 'port-prop-pontoon';
      const dockWc = stage === 0 ? 0.82 : Math.min(gw * 0.55, 0.9 + sizeMul * 0.24);
      // Longueur/position : stades 1-3 RALLONGÉS et remontés pour bien relier la base du
      // bâtiment (qui les recouvre en haut) à l'eau. Stade 0 = valeurs validées inchangées.
      const dockLen = stage === 0 ? 1.7 : 2.7;
      const dockCy = stage === 0 ? 0.54 : 0.46;
      blitProp(ctx, ox, oy, sw, sh, DOCK, 0.5, dockCy, dockWc / Math.max(1, gw), dockLen / Math.max(1, gh));
      // BÂTIMENT de quai : GRANDIT avec l'ère (suit le bateau, toujours plus grand que lui).
      // Stade 0 = taille validée inchangée. Base ancrée ~0.4 (raccord dock constant).
      const bWc = stage === 0 ? Math.min(1.5, gw * 0.72) : Math.min(gw * 0.94, 1.25 + sizeMul * 0.42);
      const bhF = bWc / Math.max(1, gh), bwF = bWc / Math.max(1, gw);
      blitProp(ctx, ox, oy, sw, sh, PORT_HOUSE, 0.5, 0.4 - bhF * 0.5, bwF, bhF);
      // Bateau de l'ère amarré au bout du dock. ANIMÉ (bob + frames en `now`).
      blitEraBoat(ctx, ox, oy, sw, sh, 0.5, 0.72, 0.7 * sizeMul, boatName, now, gw);
    }
    return true;
  }
  // (Plus de scène pour les moulins : ils sont cuits par le code — iso/isoMill.js —
  // et cette branche n'était plus atteinte que par la molette __millTune({on:false}).
  // Retirée avec blitPropRot/propPivot, qui ne servaient qu'à elle — MORT-2.)
  if (id === "mint_houses") {
    if (band >= 7) { // CHAMBRE FORTE cosmique : coffre PixelLab + halo qui respire
      const { cp } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      const ckey = 'mint-cosmic-' + band;
      // TOUR gigantesque (halo intégré) ; décor pas encore chargé : rien.
      if (propReady(ckey)) blitCosmicTower(ctx, ox, oy, sw, sh, ckey, now, band, cp);
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : atelier de frappe à la masse → hôtel des monnaies classique →
    // manufacture à vapeur (balancier) → frappe numérique automatisée.
    // tier reste la richesse intra-stade (piles de pièces / cadence / lueur).
    const stage = engineStage(ei);
    if (stage === 0) {
      // ── STADE 0 · ATELIER DE FRAPPE — four à creuset, enclume, coin gravé ──
      // Pixel-art = atelier PixelLab : le BÂTIMENT reste figé, seul le FEU de forge
      // est ANIMÉ (bande de 7 frames, cf. blitForge — feu PIXEL baké, pas d'overlay
      // procédural). Repli : prop statique mint-prop-forge (le MÊME dessin, feu figé),
      // puis rien tant que ni l'un ni l'autre n'est chargé (MORT-2).
      if (animReady('mint-forge-fire') || propReady('mint-prop-forge')) {
        softGround(ctx, ox, oy, sw, sh, 0.83, 0.46, 0.22, "38,26,12", 0.45); // sol (désactivé par défaut)
        // L'atelier (PixelLab) — aspect 96×80 préservé ; feu animé si la bande est prête,
        // sinon prop statique (frame figée équivalente).
        if (animReady('mint-forge-fire')) blitAnim(ctx, ox, oy, sw, sh, 'mint-forge-fire', now, 0.5, 0.53, 0.88, 0.73);
        else blitProp(ctx, ox, oy, sw, sh, 'mint-prop-forge', 0.5, 0.53, 0.88, 0.73);
      }
      return true;
    }
    if (stage === 1) {
    // ── STADE 1 · HÔTEL DES MONNAIES — coffre, balance, monnayeur au marteau ──
    // Pixel-art = prop PixelLab STATIQUE (le BÂTIMENT médiéval — pierre/colombages,
    // toit, fenêtres à barreaux et emblème pièce sont BAKÉS dans le sprite). Aucun
    // overlay procédural (pas de pièces jaunes ni de lueur clignotante — retirés à la
    // demande). Rien tant que le prop n'est pas chargé (MORT-2).
    if (propReady('mint-prop-house')) { // scène ENTIÈREMENT statique
      softGround(ctx, ox, oy, sw, sh, 0.87, 0.46, 0.24, "38,26,12", 0.45); // sol (désactivé par défaut)
      // Le bâtiment (prop PixelLab) — aspect 96×96 carré, calé comme guild-prop-lodge
      blitProp(ctx, ox, oy, sw, sh, 'mint-prop-house', 0.5, 0.5, 0.86, 0.86);
    }
    return true;
    }
    if (stage === 2) {
      // ── STADE 2 · MANUFACTURE À VAPEUR — brique, cheminée, balancier mécanisé ──
      // La frappe s'industrialise : un balancier monétaire entraîné par volant
      // d'inertie bat la monnaie en cadence, la vapeur fume, les pièces défilent.
      // Pixel-art (manufacture PixelLab + fumée + fenêtres chaudes la nuit) ; rien tant que
      // le prop n'est pas chargé (MORT-2).
      if (propReady('mint-house-steam')) {
        softGround(ctx, ox, oy, sw, sh, 0.86, 0.46, 0.22, "28,22,14", 0.5); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, 'mint-house-steam', 0.5, 0.5, 0.86, 0.86);
        // Fumée de la cheminée (le prop porte la cheminée bakée ; bouffées qui montent). ANIMÉE.
        for (let s = 0; s < 3; s++) { const t = ((now / 1500) + s * 0.33) % 1; ctx.fillStyle = `rgba(110,102,94,${(0.3 * (1 - t)).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox + sw * (0.2 + 0.03 * Math.sin(now / 400 + s)), oy + sh * (0.2 - t * 0.2), sw * (0.02 + t * 0.04), 0, Math.PI * 2); ctx.fill(); }
      }
      return true;
    }
    // ── STADE 3 · FRAPPE NUMÉRIQUE — monolithe néon, hologramme, presse robot ──
    // La monnaie devient signal : un bras automatisé estampe des jetons qui
    // glissent sous un hologramme de devise. Lueur cyan/or pilotée par la nuit.
    const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
    // Pixel-art (monolithe néon PixelLab + hologramme pièce + halo cyan) ; rien tant que
    // le prop n'est pas chargé (MORT-2).
    if (!propReady('mint-house-digital')) return true;
    softGround(ctx, ox, oy, sw, sh, 0.82, 0.54, 0.28, "12,16,22", 0.55); // dalle (désactivée par défaut)
    blitProp(ctx, ox, oy, sw, sh, 'mint-house-digital', 0.5, 0.5, 0.86, 0.86);
    if (nF > 0.02) { // halo qui respire + hologramme pivotant : lisent `now`
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const pulse = nF * ENGINE_HALO.night * (0.22 + 0.08 * Math.sin(now / 700));
      const gg = ctx.createRadialGradient(ox + sw * 0.5, oy + sh * 0.5, 0, ox + sw * 0.5, oy + sh * 0.5, sw * 0.42);
      gg.addColorStop(0, `rgba(90,220,230,${pulse.toFixed(2)})`); gg.addColorStop(1, "rgba(90,220,230,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ox + sw * 0.5, oy + sh * 0.5, sw * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // Hologramme de devise pivotant au-dessus du toit (procédural, gardé).
      const hw = Math.abs(Math.cos(now / 700)), hcx = 0.5, hcy = 0.14;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(130,245,225,${(0.5 + nF * 0.4).toFixed(2)})`; ctx.lineWidth = Math.max(1, sw * 0.02);
      ctx.beginPath(); ctx.ellipse(ox + sw * hcx, oy + sh * hcy, sw * (0.012 + 0.05 * hw), sh * 0.06, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(180,250,235,${(0.35 + nF * 0.4).toFixed(2)})`; ctx.font = `${Math.max(6, sw * 0.09)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (hw > 0.4) ctx.fillText("¤", ox + sw * hcx, oy + sh * hcy);
      ctx.restore();
    }
    return true;
  }
  if (id === "imperial_exchanges") {
    if (band >= 7) { // GRAND AXE cosmique : flèche PixelLab haute + halo qui respire
      const { cp } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      const ckey = 'bank-cosmic-' + band;
      // TOUR gigantesque (halo intégré) ; décor pas encore chargé : rien.
      if (propReady(ckey)) blitCosmicTower(ctx, ox, oy, sw, sh, ckey, now, band, cp);
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : comptoir de change à ciel ouvert → banco Renaissance →
    // grande banque néoclassique → bourse de verre & néon.
    // tier reste la richesse intra-stade (piles d'or / vitres / écrans).
    const stage = engineStage(ei);
    if (stage === 0) {
      // ── STADE 0 · COMPTOIR DE CHANGE — table de changeur, trébuchet, abaque ──
      // Pixel-art = prop PixelLab STATIQUE (auvent rouge + table-balance + or + coffre
      // BAKÉS dans le sprite). Rien tant que le prop n'est pas chargé (MORT-2).
      if (propReady('exchange-prop-stall')) { // scène ENTIÈREMENT statique
        softGround(ctx, ox, oy, sw, sh, 0.86, 0.5, 0.24, "38,26,12", 0.45); // sol (désactivé par défaut)
        // Le comptoir (prop PixelLab) — aspect 96×80 préservé
        blitProp(ctx, ox, oy, sw, sh, 'exchange-prop-stall', 0.5, 0.53, 0.88, 0.73);
      }
      return true;
    }
    if (stage === 1) {
      // ── STADE 1 · BANCO RENAISSANCE — palais marchand, banc drapé, grand livre ──
      // « Banco » : le banc drapé de vert où le changeur florentin tient ses
      // comptes. Loggia à arcades, registre et plume, coffre cerclé de fer.
      // Pixel-art (palazzo Renaissance ; ses fenêtres s'allument la nuit, cf. sceneWindows.js).
      // Scène ENTIÈREMENT statique (aucun `now`) ; rien tant que le prop n'est pas chargé.
      if (propReady('bank-house-renaissance')) {
        softGround(ctx, ox, oy, sw, sh, 0.87, 0.46, 0.24, "30,22,12", 0.45); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, 'bank-house-renaissance', 0.5, 0.5, 0.86, 0.86);
      }
      return true;
    }
    if (stage === 2) {
    // ── STADE 2 · GRANDE BANQUE NÉOCLASSIQUE (Banque de France / FMI) ──
    // Composition classique : deux ailes de pierre percées de fenêtres encadrées,
    // un portique central à colonnes creusé d'ombre, grande porte de bronze.
    // Lumière au haut-gauche → faces gauches claires, faces droites ombrées.
    // Pixel-art (banque néoclassique ; ses fenêtres s'allument la nuit, cf. sceneWindows.js).
    // Scène ENTIÈREMENT statique (aucun `now`) ; rien tant que le prop n'est pas chargé.
    if (propReady('bank-house-neoclassical')) {
      softGround(ctx, ox, oy, sw, sh, 0.87, 0.46, 0.24, "30,28,22", 0.42); // sol (désactivé par défaut)
      blitProp(ctx, ox, oy, sw, sh, 'bank-house-neoclassical', 0.5, 0.5, 0.86, 0.86);
    }
    return true;
    }
    // ── STADE 3 · BOURSE DE VERRE — tour-rideau, ticker défilant, chandeliers néon ──
    // « Les fortunes bougent plus vite que les armées » : une tour de verre, un
    // ruban de cotations qui file et un graphique en chandeliers qui monte et
    // chute. Lueur cyan/or pilotée par la nuit (nF dérivé de litGold).
    const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
    // Pixel-art (bourse de verre PixelLab + halo cyan qui respire) ; rien tant que le
    // prop n'est pas chargé (MORT-2).
    if (!propReady('bank-house-glass')) return true;
    softGround(ctx, ox, oy, sw, sh, 0.82, 0.54, 0.26, "12,16,22", 0.55); // parvis (désactivé par défaut)
    blitProp(ctx, ox, oy, sw, sh, 'bank-house-glass', 0.5, 0.5, 0.86, 0.86);
    if (nF > 0.02) { // halo cyan qui respire (lit `now`)
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const pulse = nF * ENGINE_HALO.night * (0.22 + 0.08 * Math.sin(now / 700));
      const gg = ctx.createRadialGradient(ox + sw * 0.5, oy + sh * 0.5, 0, ox + sw * 0.5, oy + sh * 0.5, sw * 0.42);
      gg.addColorStop(0, `rgba(90,220,230,${pulse.toFixed(2)})`); gg.addColorStop(1, "rgba(90,220,230,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ox + sw * 0.5, oy + sh * 0.5, sw * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    return true;
  }
  return false;
}

export { drawCityEngineSprite, engineStage, cosmicBase, cosmicGround, softGround, propReady, blitProp, propBBox, propImage, blitCosmicTower, animReady, blitAnim, ANIM_BANDS, ANIM_FIRE_CORES };
export { tailleNette };   // exporté pour son test : c'est lui qui porte la netteté
export { muleRestFrame, MULE_REST_NF }; // exportés pour le test du cycle de tête (halte de caravane)
