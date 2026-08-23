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
// de la place, la banaliser en la semant partout lui ferait perdre son rang. En
// attendant l'art dédié, LEGACY_PROP fait retomber le puits sur la fontaine du
// kit top-down (cf. isoPlaza.js), era-correcte dans les 5 ères.
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
// Arbres pixel iso : tree-1..tree-N (feuillus + conifères, choisis par hash).
// (Des feuillus du pack Cainos ont été essayés en variantes 5-7 le 2026-07-22 puis
// RETIRÉS — « je n'aime pas les arbres », Raph. Ne pas re-proposer.)
export const ISO_TREE_VARIANTS = 4;
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


