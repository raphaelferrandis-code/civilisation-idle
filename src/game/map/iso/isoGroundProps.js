// LES OBJETS POSÉS AU SOL — ce qui occupe une cellule sans être un bâtiment.
//
// Extraits d'isoRenderer.js le 2026-08-23 (Q10). Les POINTS D'EAU (ce qui reste de
// l'aqueduc, devenu une pièce 1×1), le blit d'une image POSÉE sur une cellule
// (`drawIsoGroundedArt` : calée sur le sol, pas centrée sur le losange), le nombre
// de variantes d'arbre et de buisson, et le décor semé sur les îles.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, six sortantes. Vérifiée ligne à ligne contre la version
// commitée.
import { cmHash } from '../layout.js';
import { lightCutImage } from '../lightLayer.js';
import { isoTileBBox } from './isoGroundTiles.js';

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
// de la place, la banaliser en la semant partout lui ferait perdre son rang. Il a
// un temps retombé sur la fontaine du kit top-down, faute d'art dédié ; ses six
// `well-<ère>.png` existent depuis, et ce repli a été retiré — d'abord pour lui
// seul, puis avec le kit entier le 2026-08-23 (Q3). Un PNG manquant sort donc
// maintenant un gabarit gris, qui se voit, au lieu d'une fontaine, qui ne se
// voyait pas.
//
// Ère : même échelle que les places, PLUS un cran primitif — les places
// n'existent qu'à partir du band 2, mais les aqueducs s'achètent dès le début.
export const waterPointEra = (band) => (band >= 7 ? 'cosmic' : band >= 6 ? 'modern'
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
export const WATER_POINT_P = {
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
export function drawIsoGroundedArt(ctx, e, px, py, targetW) {
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
// ── LA FAMILLE D'ARBRES (docs/PLAN-VEGETATION.md, lot 1, 2026-10-04) ─────────
// Il n'y avait que TROIS arbres vivants pour toute la forêt (deux feuillus ronds
// lime et un sapin) : des milliers de copies du même rond, un papier peint. La
// famille compte 4 essences × 3 âges et des buissons de lisière, dessinés par
// PixelLab dans une seule main (scripts/installVegetation.mjs, sources brutes et
// choix dans scripts/data/) à la dose B choisie par Raph : couronnes plus sombres
// que le pré, reflets gardés en haut à gauche.
// (Des feuillus du pack Cainos ont été essayés en variantes 5-7 le 2026-07-22 puis
// RETIRÉS — « je n'aime pas les arbres », Raph. Ne pas re-proposer.)
//
// LE GRAIN NE BOUGE PAS. Chaque PNG a son canevas (`px`) : 64 pour un jeune arbre,
// 96 pour un adulte (le canevas historique, celui de treeCanvasT), 104-128 pour un
// grand ou un vieil arbre. Le moteur dessine un canevas de `px` à px/96 de la taille
// de référence (treeSpriteK) : un pixel d'art reste un pixel d'habitation (grainR).
// La variété de taille vient donc des DESSINS, jamais d'un facteur d'échelle — la
// règle posée pour les tentes le 2026-09-29. Le pied de chaque image est à 0,92 du
// canevas et au milieu, comme avant.
//
// Index 1..4 = CONTRAT : les places (`_tv` 1..4, treeFootMetrics), l'île des
// merveilles (ISLE_TREES) et le sapin mort (4) les nomment par leur numéro. tree-1..3
// ont reçu les nouveaux adultes (chêne, chêne rond, sapin) ; tree-4 est inchangé.
// `sp` : essence ('chene', 'bouleau', 'sapin', 'pin', 'buisson', 'mort') ;
// `age` : 0 jeune, 1 adulte, 2 vieux.
// ⚠ `px` = taille RÉELLE du PNG posé (installVegetation agrandit le canevas quand
// l'encre n'y tient pas) — vérifié par vegetationFamily.test.js.
export const TREE_SPRITES = [
  null,
  { name: 'tree-1', sp: 'chene', age: 1, px: 96 },
  { name: 'tree-2', sp: 'chene', age: 1, px: 96 },
  { name: 'tree-3', sp: 'sapin', age: 1, px: 96 },
  { name: 'tree-4', sp: 'mort', age: 1, px: 96 },
  { name: 'tree-chene-a3', sp: 'chene', age: 1, px: 96 },
  { name: 'tree-chene-v1', sp: 'chene', age: 2, px: 128 },
  { name: 'tree-chene-v2', sp: 'chene', age: 2, px: 128 },
  { name: 'tree-chene-v3', sp: 'chene', age: 2, px: 128 },
  { name: 'tree-chene-j1', sp: 'chene', age: 0, px: 64 },
  { name: 'tree-chene-j2', sp: 'chene', age: 0, px: 64 },
  { name: 'tree-chene-j3', sp: 'chene', age: 0, px: 64 },
  { name: 'tree-chene-j4', sp: 'chene', age: 0, px: 64 },
  { name: 'tree-chene-j5', sp: 'chene', age: 0, px: 64 },
  { name: 'tree-bouleau-a1', sp: 'bouleau', age: 1, px: 96 },
  { name: 'tree-bouleau-a2', sp: 'bouleau', age: 1, px: 96 },
  { name: 'tree-bouleau-v1', sp: 'bouleau', age: 2, px: 96 },
  { name: 'tree-bouleau-j1', sp: 'bouleau', age: 0, px: 96 },
  { name: 'tree-bouleau-j2', sp: 'bouleau', age: 0, px: 64 },
  { name: 'tree-sapin-a2', sp: 'sapin', age: 1, px: 104 },
  { name: 'tree-sapin-a3', sp: 'sapin', age: 1, px: 104 },
  { name: 'tree-sapin-v1', sp: 'sapin', age: 2, px: 104 },
  { name: 'tree-sapin-j1', sp: 'sapin', age: 0, px: 64 },
  { name: 'tree-sapin-j2', sp: 'sapin', age: 0, px: 64 },
  { name: 'tree-sapin-j3', sp: 'sapin', age: 0, px: 64 },
  { name: 'tree-sapin-j4', sp: 'sapin', age: 0, px: 64 },
  { name: 'tree-pin-a1', sp: 'pin', age: 1, px: 104 },
  { name: 'tree-pin-a2', sp: 'pin', age: 1, px: 96 },
  { name: 'tree-pin-v1', sp: 'pin', age: 2, px: 104 },
  { name: 'tree-pin-j1', sp: 'pin', age: 0, px: 64 },
  { name: 'tree-pin-j2', sp: 'pin', age: 0, px: 64 },
  { name: 'tree-pin-j3', sp: 'pin', age: 0, px: 64 },
  { name: 'tree-buisson-1', sp: 'buisson', age: 0, px: 48 },
  { name: 'tree-buisson-2', sp: 'buisson', age: 0, px: 48 },
  { name: 'tree-buisson-3', sp: 'buisson', age: 0, px: 64 },
  // Arbres de VILLE par ère (lot 6) — jamais en forêt (cf. CITY_TREES).
  { name: 'tree-cypres-1', sp: 'cypres', age: 1, px: 96 },
  { name: 'tree-cypres-2', sp: 'cypres', age: 1, px: 96 },
  { name: 'tree-cypres-3', sp: 'cypres', age: 1, px: 96 },
  { name: 'tree-pinparasol-1', sp: 'pinparasol', age: 1, px: 104 },
  { name: 'tree-pinparasol-2', sp: 'pinparasol', age: 1, px: 104 },
  { name: 'tree-platane-1', sp: 'platane', age: 1, px: 96 },
  { name: 'tree-platane-2', sp: 'platane', age: 1, px: 104 },
  { name: 'tree-tilleul-1', sp: 'tilleul', age: 1, px: 96 },
  { name: 'tree-tilleul-2', sp: 'tilleul', age: 1, px: 96 },
  { name: 'tree-tilleul-3', sp: 'tilleul', age: 1, px: 96 },
];
export const ISO_TREE_VARIANTS = TREE_SPRITES.length - 1;
// Rapport de taille de dessin d'un arbre à l'arbre de référence (canevas de 96).
export function treeSpriteK(v) { const t = TREE_SPRITES[v]; return t ? t.px / 96 : 1; }
// LE SAPIN MORT (tree-4 : tronc noir, branches grises, mousse pendante) : un
// arbre sur quatre, en toute saison, au milieu des feuillus vifs — il lisait
// comme une forêt malade (constat du 2026-09-29 sur la capture du campement).
// Il ne sort plus qu'en HIVER, où son sprite enneigé passe pour un sapin sous la
// neige, et dans une civilisation EN RUINE (CM.frameRuined) ; le reste du temps
// sa cellule reçoit une des essences vivantes (treeAliveVariant).
export const TREE_DEAD_VARIANT = 4;
// Les arbres VIVANTS de la forêt (ni le sapin mort, ni les buissons réservés à la
// lisière, ni les essences de ville du lot 6).
const FOREST_SP = new Set(['chene', 'bouleau', 'sapin', 'pin']);
export const TREE_LIVING = TREE_SPRITES.map((t, i) => (t && FOREST_SP.has(t.sp) ? i : 0)).filter(Boolean);
// Index des dessins d'une essence à un âge (listes figées au chargement).
export function treeVariantsOf(sp, age) {
  const out = [];
  TREE_SPRITES.forEach((t, i) => { if (t && t.sp === sp && (age == null || t.age === age)) out.push(i); });
  return out;
}
// Les ADULTES : les arbres de ville (L.trees) n'en prennent pas d'autres (lot 2) —
// un vieil arbre de 128 px couvrirait une maison, un jeune se perdrait dans la rue.
export const TREE_ADULTS = TREE_LIVING.filter((i) => TREE_SPRITES[i].age === 1);
// Essence d'une cellule (arbres de ville ; la forêt sauvage décide la sienne à la
// plantation, cf. isoWildForest), stable. Le sapin mort garde sa part historique (un
// tirage sur quatre, même hash qu'avant) ; le reste se tire parmi les adultes.
export function treeBaseVariant(gx, gy) {
  if (cmHash('tree:' + gx + ':' + gy) % 4 === 3) return TREE_DEAD_VARIANT;
  return TREE_ADULTS[cmHash('treeL:' + gx + ':' + gy) % TREE_ADULTS.length];
}
// Essence VIVANTE qui remplace le sapin mort hors hiver et hors ruines : un tirage
// à part, parmi les adultes (jamais TREE_DEAD_VARIANT).
export function treeAliveVariant(gx, gy) { return TREE_ADULTS[cmHash('treeA:' + gx + ':' + gy) % TREE_ADULTS.length]; }
// ── LES ARBRES DE VILLE PAR ÈRE (docs/PLAN-VEGETATION.md, lot 6, 2026-10-04) ──
// La forêt reste tempérée à toutes les ères (réponse Q2 de Raph) ; les arbres plantés
// EN VILLE (L.trees) prennent l'essence de leur époque : tilleuls de la ville médiévale,
// cyprès et pins parasols de la ville de marbre, platanes d'avenue au XIXe et après.
// Poids par essence, par bande (index = eraBand ; null = pas d'arbre de ville : camp et
// village). Les arbres de PLACE (`fixed`, recette cotée) et de l'île gardent tree-1..4.
// Pas de sapin mort en ville : un arbre planté est un arbre soigné.
export const CITY_TREES = [
  null, null,
  [['tilleul', 5], ['chene', 3], ['bouleau', 2]],                       // 2-3 médiéval
  [['tilleul', 5], ['chene', 3], ['bouleau', 2]],
  [['cypres', 4], ['pinparasol', 3], ['tilleul', 2], ['chene', 1]],      // 4 antique
  [['platane', 5], ['tilleul', 3], ['chene', 2]],                       // 5 industriel
  [['platane', 4], ['bouleau', 3], ['tilleul', 2], ['pin', 1]],          // 6 moderne
  [['platane', 3], ['bouleau', 3], ['cypres', 2], ['tilleul', 2]],      // 7+ cosmique
];
const CITY_SP = {};
for (const mix of CITY_TREES) if (mix) for (const [sp] of mix) CITY_SP[sp] = TREE_SPRITES.map((t, i) => (t && t.sp === sp && t.age === 1 ? i : 0)).filter(Boolean);
export function cityTreeVariant(gx, gy, band) {
  const mix = CITY_TREES[Math.max(0, Math.min(band | 0, CITY_TREES.length - 1))];
  if (!mix) return treeAliveVariant(gx, gy);
  let tot = 0;
  for (const [, w] of mix) tot += w;
  let r = cmHash('cityT:' + gx + ':' + gy) % tot;
  let sp = mix[0][0];
  for (const [s, w] of mix) { if (r < w) { sp = s; break; } r -= w; }
  const l = CITY_SP[sp];
  return l[cmHash('cityV:' + gx + ':' + gy) % l.length];
}
// Dessin d'un arbre posé, SANS rien mémoïser (le peintre tient `_tv`) : pour ceux qui
// ont besoin de sa taille avant ou en dehors du dessin (particules d'ambiance). `band` :
// l'ère de la ville, pour un arbre de ville (sans `v`).
export function treeVariantOf(tr, band = 0) { return tr._tv || tr.v || cityTreeVariant(tr.gx, tr.gy, band); }
// Buissons DÉDIÉS bush-1..N (pack Cainos, cf. scripts/sliceCainosPlants.mjs),
// rangés du plus petit au plus grand. Avant, un « buisson » de terre-plein était
// un feuillu rapetissé — donc un tronc d'arbre miniature. Repli sur tree-N si le
// PNG manque (cf. les sprites absents du .exe hors ligne : un art absent ne doit
// rien effacer).
export const ISO_BUSH_VARIANTS = 6;
// Végétation de l'île (cf. son bloc dans drawIsoLive). `rMin/rMax` sont des rayons
// NORMALISÉS de l'ellipse : le tiers central est laissé à la merveille.
// Molette : window.__islandDeco.
export const ISLAND_DECO = { on: true, count: 9, rMin: 0.5, rMax: 0.88, size: 0.3 };
if (typeof window !== 'undefined') window.__islandDeco = ISLAND_DECO;


