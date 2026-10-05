// LA FORÊT SAUVAGE — la ceinture d'arbres autour de la ville.
//
// Extraite d'isoRenderer.js le 2026-08-23 (Q10). Elle décide OÙ l'herbe est
// sauvage : ni sol urbain, ni route, ni eau, ni berge, ni emprise de bâtiment, ni
// parvis de merveille — et y sème des arbres par blocs mémoïsés, pour qu'un pan de
// caméra ne reconstruise pas la ceinture entière.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// 5 sortants, 2 entrants (`WONDER_GROUND`/`wonderGroundSet`, sortis dans
// isoWonderGround.js pour éviter un cycle). Vérifié par comparaison ligne à ligne
// avec la version commitée.
import {
  CM, cmHash, cmCellNoise, TREE_TUNE, TREE_LIFE, treeRadius, treeDensK, treeLifeKeep, treeLifeRange, cmLifeDistance,
} from '../layout.js';
import { WONDER_GROUND, wonderGroundSet } from './isoWonderGround.js';
import { riverEndRays, nearRiverEndRay } from './riverEnds.js';
import { campGroundOn, courOf } from './isoTissu.js';
import { treeVariantsOf } from './isoGroundProps.js';
import { vegHash, vegNoise } from './vegNoise.js';
import { solInvalidate } from './solInvalidate.js';

// Marge des demi-droites qui prolongent le fleuve (riverEnds.js) : les MÊMES
// rayons que les cellules d'eau et de berge du layout — centre de cellule à
// moins de hw + 1,4 d'un sample (layout.js, riverSet/bankSet).
const RIVER_END_BANK = 1.4;

// ── LA FORÊT RECULE DEVANT LA VIE (2026-09-29, cf. TREE_LIFE dans layout.js) ─
// Née au campement, étendue à toutes les ères. Aucun arbre à TREE_LIFE.clear
// cellules ou moins d'une route ou d'une emprise bâtie — et, au camp et au
// village, de la terre battue (campField, isoTissu) —, puis la part
// TREE_LIFE.keep cellule après cellule, la forêt pleine au-delà : une lisière
// qui s'éclaircit au lieu d'un mur d'arbres au ras des façades (l'ancienne
// aération ne retirait que 0,35 de chance à UNE cellule de la ville ; avec des
// arbres au grain des habitations, leur couronne couvrait les maisons du bord).
// Au CAMP et au VILLAGE, l'emprise elle-même redevient forêt hors terre battue :
// leurs arbres de ville sont coupés (layout.js), une seule forêt les replante.
// La clairière a une raison d'être : on y vit, on y coupe son bois. (La 1re
// version gardait toute l'ancienne emprise en pré : une grande prairie vide
// autour d'un petit camp, bordée d'une couronne clairsemée qui ne suivait rien.)
// Distances mémoïsées sur le layout (recalculé à chaque recompute : le cache
// meurt avec lui), sur une grille typée — une Map de clés texte coûtait trop
// cher sur une mégalopole.
function lifeDistFor(L, buildFoot, camp) {
  const key = camp ? '_lifeDistCamp' : '_lifeDist';
  if (L[key]) return L[key];
  const water = (L.river && L.river.cells) || null;
  const roads = [];
  for (const k of (L.roadSet || [])) if (!(water && water.has(k))) roads.push(k);
  const sources = [roads, buildFoot];
  if (camp) {
    const worn = [];
    for (const [k, v] of courOf(L)) if (v === 'urban') worn.push(k);
    sources.push(worn);
  }
  L[key] = cmLifeDistance(L.gridN | 0, sources, treeLifeRange());
  return L[key];
}
// La même distance, pour ceux qui suivent la forêt sans la planter (le sous-bois,
// isoForestFloor.js) ; null quand la règle est coupée hors camp.
export function forestLifeDist(L) {
  const campOn = campGroundOn(L);
  if (!(campOn || TREE_LIFE.on)) return null;
  return lifeDistFor(L, isoBuildFootSet(L), campOn);
}

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
export const WILD_PAD = 12;                    // cellules de marge : pan sans reconstruire
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
export const GL_RUN_MIN = 120;

// Pesée fine de la passe vivante (opt-in : globalThis.__isoProfParts = true) :
// isole les postes procéduraux candidats à la cuisson en texture. Le drapeau se
// lit UNE fois par frame (constante d'import : la molette n'aurait aucun effet
// après chargement).

// Seuil d'éclaircie de la forêt : taille de tuile écran sous laquelle les
// arbres se chevauchent au point qu'en retirer devient invisible (à 11 px, un
// arbre en couvre ~21 et ses voisins mordent dessus).
export const WILD_THIN_UNIT = 14;

export const WILD_BLOCK = 32;                  // cellules par côté de bloc
const WILD_BLOCK_CAP = 512;             // blocs gardés (au-delà : on repart à neuf)

// ── PEUPLEMENTS, ÂGES ET LISIÈRE (docs/PLAN-VEGETATION.md, lot 2, 2026-10-04) ──
// L'essence était tirée au hasard cellule par cellule : feuillus et sapins mêlés
// uniformément partout, aucune sapinière, aucune chênaie, et un bord de bois fait du
// même arbre adulte, juste plus clairsemé. Chaque arbre reçoit maintenant, à la
// plantation, son DESSIN (`v`, cf. TREE_SPRITES) :
//  - l'ESSENCE suit un PEUPLEMENT : un bruit lisse à grande échelle (`standScale`
//    cellules) glisse de la sapinière à la chênaie en passant par la pinède et le
//    bois mêlé (STANDS, mélange interpolé : jamais de frontière nette) ;
//  - l'ÂGE suit la POSITION : jeunes arbres et bouleaux pionniers à la lisière (la
//    distance à la vie de TREE_LIFE) et dans les trouées ; adultes au cœur ; quelques
//    vieux arbres, dans les fourrés denses et, rares, seuls au milieu d'un pré ;
//  - les BUISSONS ferment la lisière, sur des cellules que la lisière laisse vides ;
//  - les TROUÉES sont lisses (bruit interpolé, `holeScale`) et franches (`contrast`) :
//    l'ancien bruit par blocs de 5 et 11 cellules dessinait des clairières carrées.
// Le NOMBRE d'arbres ne monte pas (mesuré au dézoom, cf. le journal du plan) : le
// coût d'une frame suit le nombre d'arbres. Un vieil arbre (canevas de 128) laisse
// libres ses voisins de droite et du dessous.
// Le SAPIN MORT : une part des conifères adultes le devient en hiver et dans les
// ruines (`dead`), au lieu d'un arbre sur quatre pris parmi toutes les essences.
// Molette : __forest(false) rejoue la forêt du lot 1 ; __forest({ standScale, … }).
export const FOREST = {
  on: true, standScale: 17, holeScale: 8, contrast: 1.55,
  young: 0.10, edgeYoung: 0.5, openYoung: 0.35, old: 0.06, loneOld: 0.16,
  pioneer: 0.22, bushP: 0.35, deadP: 0.35,
};
// Composition (chêne, bouleau, sapin, pin) aux ancres du peuplement ; entre deux
// ancres, le mélange est interpolé. La pinède a un PALIER (deux ancres) : posée en un
// seul point, le peuplement ne faisait qu'y passer et aucune pinède ne se formait
// (mesuré, forestStands.test.js).
const STAND_AT = [0, 0.3, 0.46, 0.68, 1];
const STANDS = [
  [0.08, 0.06, 0.76, 0.10],     // sapinière
  [0.12, 0.10, 0.13, 0.65],     // pinède…
  [0.12, 0.10, 0.13, 0.65],     // …jusqu'ici
  [0.55, 0.22, 0.10, 0.13],     // bois mêlé
  [0.82, 0.13, 0.02, 0.03],     // chênaie
];
const SPECIES = ['chene', 'bouleau', 'sapin', 'pin'];
if (typeof window !== 'undefined') {
  window.__forest = (o) => {
    if (o === false) FOREST.on = false;
    else if (o && typeof o === 'object') Object.assign(FOREST, o);
    else FOREST.on = true;
    CM._isoWildForest = null; CM._treeCells = null; CM._vegAnchors = null;
    // Le SOUS-BOIS et l'extinction des fleurs, cuits dans le sol, suivent la densité
    // de la forêt (holeScale, contrast — cf. isoForestFloor) : recuire, sinon le sol
    // gardait l'ancienne forêt sous la nouvelle (audit du 2026-10-05, BUG-100).
    solInvalidate('all');
    return { ...FOREST };
  };
}
// Hachage entier (bien plus rapide que cmHash sur une chaîne : ~10 appels par arbre).
// (vegNoise.js : un module feuille, partagé avec le sol — prés et fleurs.)
const ih = vegHash;
const forestNoise = vegNoise;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Densité de la forêt (0..1, moyenne ~0,5) : trouées lisses et franches.
export function forestDensity(gx, gy, cfg = FOREST) {
  const raw = forestNoise(gx, gy, cfg.holeScale, 1) * 0.6 + forestNoise(gx, gy, cfg.holeScale * 2.1, 2) * 0.4;
  return clamp01(0.5 + (raw - 0.5) * cfg.contrast * 1.6);
}
// Valeur du peuplement (0 sapinière … 1 chênaie) en (gx, gy).
export function forestStand(gx, gy, cfg = FOREST) {
  return clamp01(0.5 + (forestNoise(gx, gy, cfg.standScale, 3) - 0.5) * 2.2);
}
// Essence en (gx, gy) selon le peuplement ; `pion` (0..1) ajoute des bouleaux pionniers.
export function forestSpecies(gx, gy, pion = 0, cfg = FOREST) {
  const n = forestStand(gx, gy, cfg);
  let k = 0;
  while (k < STAND_AT.length - 2 && n > STAND_AT[k + 1]) k += 1;
  const t = (n - STAND_AT[k]) / (STAND_AT[k + 1] - STAND_AT[k]);
  const w = STANDS[k].map((v, i) => v + (STANDS[k + 1][i] - v) * t);
  w[1] += cfg.pioneer * pion;
  let r = ih(gx, gy, 11) * (w[0] + w[1] + w[2] + w[3]);
  for (let i = 0; i < 4; i += 1) { r -= w[i]; if (r < 0) return SPECIES[i]; }
  return SPECIES[3];
}
// Dessins par (essence, âge), figés au chargement.
const VARIANTS = {};
for (const sp of [...SPECIES, 'buisson']) for (const age of [0, 1, 2]) VARIANTS[sp + age] = treeVariantsOf(sp, age);
function pickVariant(sp, age, u) {
  const l = VARIANTS[sp + age].length ? VARIANTS[sp + age] : VARIANTS[sp + 1];
  return l[Math.floor(u * l.length) % l.length];
}

function isoWildForestBlock(L, bx, by, ctx) {
  const gx0 = bx * WILD_BLOCK, gy0 = by * WILD_BLOCK;
  const gx1 = gx0 + WILD_BLOCK - 1, gy1 = gy0 + WILD_BLOCK - 1;
  const { isWild, nearCity, cellNoise, lifeKeep, lifeAt, densK } = ctx;
  const F = FOREST.on;
  const arr = [];
  const shade = new Set();              // cellules laissées libres par un vieil arbre
  const R = TREE_LIFE.clear + TREE_LIFE.keep.length;
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      if (!isWild(gx, gy)) continue;
      const dens = F ? forestDensity(gx, gy) : cellNoise(gx, gy);
      let thr = (dens * 1.25 - 0.08) * densK;               // fourrés (haut) / trouées (bas)
      if (lifeKeep) thr *= lifeKeep(gx, gy);                  // camp : recule devant la vie
      else if (nearCity(gx, gy)) thr -= 0.35;               // aère la lisière
      // Lisière : 1 au premier rang permis par TREE_LIFE, 0 au-delà de sa portée.
      let edgeK = 0;
      if (F) {
        if (lifeAt) {
          const d = lifeAt(gx, gy);
          edgeK = d <= R + 1 ? clamp01(1 - (d - TREE_LIFE.clear - 1) / (TREE_LIFE.keep.length + 1)) : 0;
          if (d <= TREE_LIFE.clear) edgeK = 0;                // la clairière de vie reste nue
        } else if (nearCity(gx, gy)) edgeK = 1;
      }
      const planted = (cmHash(gx + 'f' + gy) % 1000) / 1000 < thr && !shade.has(gx * 65536 + gy);
      if (!planted) {
        // BUISSON de lisière, sur une cellule que la lisière a laissée vide, côté bois.
        if (edgeK > 0 && ih(gx, gy, 13) < FOREST.bushP * edgeK * clamp01(dens * 1.6)) {
          arr.push({
            gx, gy, jx: (ih(gx, gy, 15) - 0.5) * 0.6, jy: (ih(gx, gy, 16) - 0.5) * 0.6,
            r: treeRadius(0), v: pickVariant('buisson', 0, ih(gx, gy, 17)),
          });
        }
        continue;
      }
      // Décalage sous-cellule + taille par arbre (hash riche) : casse la grille et
      // l'uniformité — mêmes plages que les arbres décoratifs (r ≈ 0.62..0.96).
      const h = cmHash('wf:' + gx + ':' + gy);
      const jx = ((h % 100) / 100 - 0.5) * 0.6;
      const jy = (((h >> 7) % 100) / 100 - 0.5) * 0.6;
      const r = treeRadius(h);
      if (!F) { arr.push({ gx, gy, jx, jy, r }); continue; }
      const openK = clamp01((0.45 - dens) / 0.25), denseK = clamp01((dens - 0.6) / 0.25);
      const sp = forestSpecies(gx, gy, Math.max(edgeK, openK));
      const u = ih(gx, gy, 12);
      const pYoung = FOREST.young + FOREST.edgeYoung * edgeK + FOREST.openYoung * openK;
      const pOld = FOREST.old * denseK + (openK > 0.75 && edgeK === 0 ? FOREST.loneOld : 0);
      const age = u < pYoung ? 0 : u > 1 - pOld ? 2 : 1;
      const t = { gx, gy, jx, jy, r, v: pickVariant(sp, age, ih(gx, gy, 14)) };
      if ((sp === 'sapin' || sp === 'pin') && age > 0 && ih(gx, gy, 18) < FOREST.deadP) t.dead = true;
      arr.push(t);
      if (age === 2) { shade.add((gx + 1) * 65536 + gy); shade.add(gx * 65536 + gy + 1); shade.add((gx + 1) * 65536 + gy + 1); }
    }
  }
  return arr;
}

export function isoWildForest(L, b) {
  // ':pv…' : le parvis d'une merveille en APERÇU (hors urbanSet, contrairement aux
  // actives) doit chasser les arbres sauvages → la dispersion se refait à l'aller-retour.
  const sig = (CM.layoutRecomputeAt || 0) + ':' + (L.gridN | 0) + ':' + (L.mapSeed || 0)
    + (CM.previewWonder ? ':pv' + CM.previewWonder.id : '')
    + ':g' + (TREE_TUNE.grainR || 0) + '/' + treeDensK()
    + ':l' + (TREE_LIFE.on ? TREE_LIFE.clear + '/' + TREE_LIFE.keep.join('/') : 'off')
    + ':f' + (FOREST.on ? Object.values(FOREST).join('/') : 'off');
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
  // Le fleuve continue à l'écran au-delà de ses bouts (isoRiver, riverDrawPts) :
  // ses deux demi-droites sont de l'eau et de la berge pour la forêt aussi.
  const endRays = riverCells ? riverEndRays(L.river.samples) : [];
  // Au camp et au village, l'emprise elle-même est plantable, hors terre battue ;
  // partout, la distance à la vie décide du reste (TREE_LIFE).
  const campOn = campGroundOn(L);
  const lifeOn = campOn || TREE_LIFE.on;
  const lifeD = lifeOn ? lifeDistFor(L, buildFoot, campOn) : null;
  const isWild = (gx, gy) =>
    (campOn ? lifeD.at(gx, gy) !== 0 : !has(urbanSet, gx, gy)) && !has(roadSet, gx, gy)
    && !has(riverCells, gx, gy) && !has(banks, gx, gy)
    && !buildFoot.has(gx + ',' + gy) && !has(wg, gx, gy)
    && !(endRays.length && nearRiverEndRay(endRays, gx + 0.5, gy + 0.5, RIVER_END_BANK));
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
  // Part gardée selon la distance à la vie (TREE_LIFE) ; règle coupée
  // (__treeLife(false), hors camp), null — l'aération historique d'une cellule
  // (nearCity) revient.
  const lifeKeep = lifeOn ? (gx, gy) => treeLifeKeep(lifeD.at(gx, gy)) : null;
  const lifeAt = lifeOn ? (gx, gy) => lifeD.at(gx, gy) : null;
  const ctx = { isWild, nearCity, cellNoise, lifeKeep, lifeAt, densK: treeDensK() };
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
