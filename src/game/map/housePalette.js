"use strict";
// ÉCHANGE DE MATIÈRE des sprites d'habitation — le vocabulaire de couleurs qui rend
// 12 archétypes non répétitifs sans dessiner un seul sprite de plus.
//
// POURQUOI UN ÉCHANGE EXACT, PAS UN FILTRE. Les PNG d'habitation sont en palette
// INDEXÉE stricte : 9 à 22 couleurs par sprite, 39 distinctes sur les 12 archétypes
// (mesuré sur les fichiers, pas estimé). Un `ctx.filter = hue-rotate(...)` ferait
// dériver ces couleurs hors de la palette maître, et notamment vers les jaunes qui en
// sont bannis. Une table couleur → couleur ne peut produire QUE ce qu'on y a mis.
//
// PRINCIPE : ÉCHANGE DE RAMPES PAR PAIRES, APPARIÉ À LA MAIN. Les couleurs de l'art
// forment des RAMPES — une même matière déclinée en luminances (l'ombre, le corps, la
// lumière). On échange deux rampes rang pour rang : le plus sombre de la brique devient
// le plus sombre de la pierre, etc. La matière change, la STRUCTURE d'ombrage est
// préservée. Chaque échange est une INVOLUTION (la table porte les deux sens), écrite
// en paires explicites plutôt que compilée depuis un cycle — voir « HISTORIQUE » plus bas,
// c'est la compilation automatique qui avait produit le défaut.
//
// ⚠ CHAQUE ARCHÉTYPE NE REÇOIT QUE LES MATIÈRES QUI LUI VONT (cf. FAMILY). Une tour de
// verre repeinte en terre cuite ne lit pas comme une variation, elle lit comme un bug.
//
// CE QU'ON NE TOUCHE PAS, et pourquoi :
//   - les noirs de contour (#211a1d sur 11 sprites, #0d0b0c) : ils tiennent la
//     silhouette, les repeindre dissout le trait ;
//   - les verts (#5c7d38, #8aa24a, #2c6b51, #4a5f50, #5aa87d) : c'est le feuillage,
//     pas la maçonnerie — un arbre bleu se voit immédiatement ;
//   - la paille (#dfe08a, #b3c840) : le chaume est l'identité de l'ère 1 (hut, tent) ;
//   - le teal (#1f3a44, #356b78, #6fb0b8) : matière d'eau et de verre, pas de mur ;
//   - toute couleur absente de l'échange passe telle quelle.

// ─────────────────────────────────────────────────────────────────────────────────────
// HISTORIQUE — pourquoi ce fichier a été réécrit (2026-07-25)
//
// La version précédente compilait DEUX 3-CYCLES sur {brique, pierre, ardoise} depuis une
// description de rampes. Rendu en jeu : « couleurs criardes, rendu bizarre ». Mesuré sur
// les PNG réels (script pngjs), deux défauts distincts :
//
// 1. LES DEUX CYCLES ENVOYAIENT LES BÂTIMENTS TARDIFS SUR `brique`. cycleA faisait
//    ardoise→brique, cycleB faisait pierre→brique ; or `tower` est à 25 % de #d8cdb4
//    (pierre) et `megablock`/`arcologyhome` sont dominés par l'ardoise. À poids égaux,
//    DEUX TOURS SUR TROIS finissaient en terre cuite — et les rangs hauts de la brique
//    (#c98f5c, #ecc6a8, #f2c2a3) sont les couleurs les plus saturées des 41 de la palette
//    maître, appliquées aux plus grandes surfaces plates de la carte. Chroma moyenne
//    mesurée : arcologyhome 7,1 → 15,2 ; megablock 9,2 → 15,2 ; tower 13,9 → 18,0.
//    Symétriquement les maisons anciennes étaient LAVÉES : courtyard 26,1 → 5,7,
//    longhouse 28,7 → 6,5. L'échange inversait le dégradé de chroma des ères.
//
// 2. LE RANG 5 D'ARDOISE DUPLIQUAIT LE RANG 4 (#aab0b8 deux fois, faute de gris plus
//    clair dans la palette). Comme la compilation écrivait dans une Map, la seconde
//    écriture écrasait la première :
//      - #aab0b8 (verre/béton clair, 9-10 % des tours) partait sur #ecc6a8 au lieu de
//        #c98f5c — un saut de DEUX rangs, droit sur le rose le plus criard ;
//      - dans l'autre sens, #b4a890, #d8cdb4 et #e9e4d6 tombaient TOUS sur #aab0b8 :
//        les deux rangs les plus clairs fusionnaient et la tour perdait sa lumière haute.
//    Le commentaire d'alors justifiait la duplication par « ~360 px concernés » ; ce
//    chiffre ne comptait que le sens brique→ardoise. Le sens retour porte les grandes
//    surfaces et n'avait pas été mesuré.
//
// Correctif : une seule paire d'échange par famille, appariée à la main, et l'ardoise
// traitée pour ce qu'elle est — CINQ tons, pas six.
// ─────────────────────────────────────────────────────────────────────────────────────

// ÉCHANGE CHAUD — brique ↔ pierre (terre cuite ↔ calcaire). Six rangs contre six,
// appariement rang pour rang. Le premier hex de chaque groupe est la CANONIQUE : les
// suivants sont des tons que l'art utilise comme équivalents (2-3 % de luminance
// d'écart) et qui fusionnent volontairement sur elle.
// Mesuré : 43 à 86 % de pixels repeints selon l'archétype, ΔL moyen 6 à 8.
const SWAP_CHAUD = [
  [["#2a1c16"],                                 ["#3a3534"]],
  [["#4a2f22"],                                 ["#4d4338"]],
  [["#6b4530", "#7a4a39", "#8a4c33", "#8c3b2a"], ["#6f6354"]],
  [["#8a5a3d", "#a8704a", "#b06a48"],           ["#8f8475"]],
  [["#c98f5c", "#c98a68", "#cf9068"],           ["#b4a890"]],
  [["#ecc6a8", "#f2c2a3"],                      ["#d8cdb4", "#e9e4d6"]]
];

// ÉCHANGE FROID — ardoise ↔ pierre (gris bleuté ↔ calcaire). L'ardoise n'a que CINQ tons
// dans la palette maître (#15161f → #aab0b8, il n'existe pas de gris froid au-dessus de
// L69). On apparie donc les cinq rangs communs et on laisse le rang le plus clair de la
// pierre (#d8cdb4, #e9e4d6) INCHANGÉ — un orphelin assumé vaut mieux qu'une fusion.
//
// L'appariement DÉCALÉ d'un cran, qui aurait supprimé l'orphelin en haut pour le mettre
// en bas, a été simulé puis écarté : il repeint plus (52-72 %) mais impose un ΔL moyen de
// 14 à 19, c'est-à-dire un bâtiment éclairé autrement que ses voisins. Ici, ΔL 4 à 8.
// Mesuré : 28 à 53 % repeints, chroma stable à +2 près (arcologyhome 7,1 → 8,7 ;
// megablock 9,2 → 11,5 ; tower 13,9 → 15,5 ; stonehouse 10,8 → 10,5).
const SWAP_FROID = [
  [["#15161f"], ["#3a3534"]],
  [["#2c2f36"], ["#4d4338"]],
  [["#4f545e"], ["#6f6354"]],
  [["#7c828c"], ["#8f8475"]],
  [["#aab0b8"], ["#b4a890"]]
];

function hexToInt(h) {
  return parseInt(h.slice(1), 16);
}

// Compile une liste de paires en Map<int source, int cible>, DANS LES DEUX SENS.
// Chaque groupe pointe sur la canonique (premier hex) du groupe d'en face.
export function buildSwap(pairs) {
  const m = new Map();
  for (const [A, B] of pairs) {
    for (const a of A) if (a !== B[0]) m.set(hexToInt(a), hexToInt(B[0]));
    for (const b of B) if (b !== A[0]) m.set(hexToInt(b), hexToInt(A[0]));
  }
  return m;
}

// Les teintes livrées. `map: null` = sprite d'origine, laissé strictement intact.
// Un archétype donné n'en voit JAMAIS que deux : l'origine et celle de sa famille.
export const HOUSE_TINTS = [
  { id: "origine", map: null },
  { id: "calcaire", map: buildSwap(SWAP_CHAUD) },   // brique ↔ pierre
  { id: "ardoise", map: buildSwap(SWAP_FROID) }     // ardoise ↔ pierre
];

// Les paires brutes, exportées pour que le test puisse vérifier l'involution et
// l'injectivité sur la MÊME donnée que le rendu (et pas sur une copie qui dériverait).
export const SWAP_PAIRS = { calcaire: SWAP_CHAUD, ardoise: SWAP_FROID };

// Couleurs que l'échange ne doit JAMAIS toucher, et la raison de chacune. Un ajout de
// rampe distrait qui les avalerait passerait inaperçu à l'œil sur une capture, mais
// dissoudrait le trait ou peindrait un arbre en bleu sur toute la carte.
//
// Vit ICI et non dans le test : deux consommateurs en ont besoin — la garde
// (houseVariants.test.js vérifie qu'aucune teinte ne les repeint) ET l'outil de
// réparation (scripts/snapTintRamp.mjs, qui doit rabattre un contour DÉCALÉ sur son
// noir canonique et surtout pas sur le ton de rampe le plus proche).
export const COULEURS_PROTEGEES = {
  "#211a1d": "noir de contour (11 sprites sur 12)",
  "#0d0b0c": "noir de contour cosmique",
  "#5c7d38": "feuillage", "#8aa24a": "feuillage",
  "#2c6b51": "feuillage", "#4a5f50": "feuillage", "#5aa87d": "feuillage",
  "#dfe08a": "chaume (identité de l'ère 1)", "#b3c840": "chaume",
  "#1f3a44": "teal (eau et verre)", "#356b78": "teal", "#6fb0b8": "teal"
};

// FAMILLE DE MATIÈRE PAR ARCHÉTYPE — assignée sur la matière DOMINANTE mesurée dans
// chaque PNG, pas sur l'ère. C'est la garde qui empêche la tour de verre en terre cuite.
//   chaude  : ≥ 30 % de pixels dans la rampe brique → l'échange brique ↔ pierre lit juste
//             (un quartier où la brique et le calcaire alternent).
//   froide  : ≤ 6 % de brique, dominés par ardoise/pierre → seul l'échange ardoise ↔
//             pierre lit juste (verre/acier contre béton clair).
// Un archétype absent de la table ne reçoit AUCUNE teinte : c'est le défaut sûr, une
// nouvelle variante sortira à l'identique plutôt qu'en couleur fausse.
//
// ⛔ TENT, HUT, LONGHOUSE ET COURTYARD SONT VOLONTAIREMENT ABSENTS (retour Raph,
// 2026-07-25 : « ne rendent pas bien, pas de nécessité de faire des chromas pour eux »).
// Ce sont les quatre habitations vernaculaires, et la terre cuite y est l'IDENTITÉ, pas
// un choix de matière parmi d'autres : le seul échange que leur famille rendait possible
// les faisait passer en calcaire, soit une chute de chroma de 26-30 à 10-16 (mesuré).
// Ce n'est pas de la variation, c'est de la délavure. Les villages d'ère 1 à 3 sont de
// toute façon peu peuplés, la répétition s'y voit peu.
// Ne pas les rajouter sans un NOUVEL échange fait pour eux (cf. « option B », un décalage
// de nuance DANS la rampe terre cuite plutôt qu'un changement de matière).
const FAMILY = {
  townhouse: 1, manor: 1, block: 1, tenement: 1,
  stonehouse: 2, tower: 2, megablock: 2, arcologyhome: 2
};

// ⚠ REBRASSAGE OBLIGATOIRE AVANT DE PRENDRE UN BIT. L'appelant fournit un `cmHash`,
// c'est-à-dire un FNV-1a — dont le multiplieur final (16777619) est IMPAIR. Le bit de
// poids faible du résultat vaut donc la parité des codes de caractères d'entrée, sans
// aucun brassage : sur « hvar:gx:gy », deux tuiles voisines ont des parités opposées.
// Mesuré sur 60×60 tuiles réelles : `hash & 1` donne un DAMIER PARFAIT, 8,5 % de voisins
// identiques au lieu des 50 % attendus — une ville en alternance stricte tuile par tuile.
// Et la répartition globale sort à 50,0 % pile, donc un test de distribution seul ne voit
// rien. Le finaliseur fmix32 de murmur3 remet le voisinage à 50,5 %.
// (L'ancien tirage prenait un `% 3` sur la valeur entière : il touchait assez de bits
// hauts pour échapper au piège, c'est le passage à DEUX états qui l'a ouvert.)
function fmix32(x) {
  let h = x >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

// Tirage d'une teinte pour UN archétype, à partir d'un entier DÉJÀ haché. Deux états
// équiprobables : l'origine, ou l'échange de sa famille. Séparé du hachage lui-même pour
// rester testable sans toucher au rendu.
//
// Poids ÉGAUX. Une variante inconnue rend 0 (origine) — cf. FAMILY.
export function pickHouseTint(seed, variant) {
  const fam = FAMILY[variant] | 0;
  if (!fam) return 0;
  return (fmix32(seed) & 1) ? fam : 0;
}

// Familles exportées pour les tests : la garde « aucune tour en terre cuite » doit se
// lire sur la MÊME table que le rendu.
export const HOUSE_FAMILY = FAMILY;

// ⛔ PAS DE MIROIR HORIZONTAL. Ça paraît être le levier de variation gratuit par
// excellence, et c'en est un sur beaucoup de jeux — pas ici. Les sprites d'habitation
// ont leur ÉCLAIRAGE ET LEUR OMBRE PORTÉE CUITS DANS L'IMAGE, orientés dans un sens
// unique partagé par toute la carte. Retourner un sprite retourne sa lumière : la
// maison se retrouve éclairée du mauvais côté et pose son ombre à l'opposé de ses
// voisines. Le défaut ne saute pas aux yeux sur un sprite isolé, il saute aux yeux
// sur une rue. C'est un levier définitivement fermé, pas une option désactivée.

// Écrit dans `dstData` la version teintée de `srcData`. Passe unique, indexée à plat :
// la teinte ne déplace aucun pixel, elle n'en change que la couleur.
export function applyHouseTint(srcData, dstData, w, h, tintIdx) {
  const tint = HOUSE_TINTS[tintIdx];
  const map = tint ? tint.map : null;
  const n = w * h * 4;
  for (let i = 0; i < n; i += 4) {
    const a = srcData[i + 3];
    dstData[i + 3] = a;
    if (a === 0) { dstData[i] = 0; dstData[i + 1] = 0; dstData[i + 2] = 0; continue; }
    const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2];
    const hit = map ? map.get((r << 16) | (g << 8) | b) : undefined;
    if (hit === undefined) {
      dstData[i] = r; dstData[i + 1] = g; dstData[i + 2] = b;
    } else {
      dstData[i] = (hit >> 16) & 255;
      dstData[i + 1] = (hit >> 8) & 255;
      dstData[i + 2] = hit & 255;
    }
  }
}
