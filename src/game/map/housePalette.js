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
// PRINCIPE : PERMUTATION DE RAMPES. Les couleurs de l'art forment des RAMPES — une
// même matière déclinée en 6 luminances (l'ombre, le corps, la lumière). On échange
// les rampes entre elles RANG POUR RANG : le plus sombre de la brique devient le plus
// sombre de la pierre, etc. La matière change, la STRUCTURE d'ombrage est préservée.
//
// Une PERMUTATION, et pas une substitution à sens unique, pour une raison précise :
// les archétypes tardifs (stonehouse, tower, megablock, arcologyhome) sont bâtis en
// pierre et en ardoise, pas en brique. Une table qui ne ferait que « brique → pierre »
// les laisserait presque inchangés et la ville de fin de partie resterait répétitive.
// Une permutation touche forcément chaque sprite, quelle que soit sa matière dominante.
//
// Elle préserve en outre les RANGS : deux rangs distincts ne tombent jamais sur la même
// cible, donc le dégradé garde ses six niveaux et le volume reste lisible. Attention,
// c'est bien une injection sur les RANGS et pas sur les couleurs — plusieurs tons d'un
// même rang (l'art en groupe jusqu'à quatre, à 2-3 % de luminance d'écart) fusionnent
// volontairement sur la canonique de leur rang. Seule exception documentée : le rang 5
// de l'ardoise réutilise le rang 4, faute de gris plus clair dans la palette.
//
// CE QU'ON NE TOUCHE PAS, et pourquoi :
//   - les noirs de contour (#211a1d sur 11 sprites, #0d0b0c) : ils tiennent la
//     silhouette, les repeindre dissout le trait ;
//   - les verts (#5c7d38, #8aa24a, #2c6b51, #4a5f50, #5aa87d) : c'est le feuillage,
//     pas la maçonnerie — un arbre bleu se voit immédiatement ;
//   - la paille (#dfe08a, #b3c840) : le chaume est l'identité de l'ère 1 (hut, tent) ;
//   - le teal (#1f3a44, #356b78, #6fb0b8) : matière d'eau et de verre, pas de mur ;
//   - toute couleur absente des rampes passe telle quelle.

// Les trois RAMPES DE MATIÈRE, du plus sombre au plus clair. Chaque rang liste les
// couleurs de l'art qui lui appartiennent ; la PREMIÈRE de chaque rang est la
// canonique, celle qu'on écrit quand ce rang est une cible. Les rangs sont alignés en
// luminance d'une rampe à l'autre (~13, ~22, ~33, ~45, ~60, ~78) — c'est cet alignement
// qui fait que l'échange ne change pas la lecture du volume.
const RAMPS = {
  // Terre cuite / brique. Rang 2 et 3 groupent des tons que l'art utilise comme
  // équivalents (ils sont à 2-3 % de luminance l'un de l'autre).
  brique: [
    ["#2a1c16"],
    ["#4a2f22"],
    ["#6b4530", "#7a4a39", "#8a4c33", "#8c3b2a"],
    ["#8a5a3d", "#a8704a", "#b06a48"],
    ["#c98f5c", "#c98a68", "#cf9068"],
    ["#ecc6a8", "#f2c2a3"]
  ],
  // Calcaire chaud désaturé.
  pierre: [
    ["#3a3534"],
    ["#4d4338"],
    ["#6f6354"],
    ["#8f8475"],
    ["#b4a890"],
    ["#d8cdb4", "#e9e4d6"]
  ],
  // Gris bleuté. La palette s'arrête à #aab0b8 (l69) : le rang 5 réutilise donc le
  // rang 4 faute de ton plus clair. Les sources concernées (#ecc6a8, #f2c2a3) ne
  // couvrent que ~360 px sur l'ensemble des sprites — la fusion ne se voit pas.
  ardoise: [
    ["#15161f"],
    ["#2c2f36"],
    ["#4f545e"],
    ["#7c828c"],
    ["#aab0b8"],
    ["#aab0b8"]
  ]
};

const RANKS = 6;

function hexToInt(h) {
  return parseInt(h.slice(1), 16);
}

// Compile une permutation de rampes en Map<int source, int cible>.
// `cycle` associe chaque rampe source au nom de sa rampe cible.
function compile(cycle) {
  const m = new Map();
  for (const from of Object.keys(cycle)) {
    const src = RAMPS[from], dst = RAMPS[cycle[from]];
    for (let r = 0; r < RANKS; r += 1) {
      const target = hexToInt(dst[r][0]);          // canonique du rang cible
      for (const hex of src[r]) {
        const key = hexToInt(hex);
        if (key !== target) m.set(key, target);    // une identité n'a rien à faire dans la table
      }
    }
  }
  return m;
}

// Les teintes livrées. `map: null` = sprite d'origine, laissé strictement intact.
// Les deux autres sont les deux 3-cycles possibles sur {brique, pierre, ardoise} —
// il n'y en a pas d'autres, ce qui donne exactement trois états par archétype.
//
// Poids ÉGAUX. L'origine portait initialement un poids double, pour rester l'ancre de
// la direction artistique ; c'était tenable quand le miroir doublait encore le nombre
// d'aspects. Le miroir retiré (cf. plus bas), un poids double remettait une maison sur
// deux à l'identique — soit exactement la répétition qu'on cherche à casser.
export const HOUSE_TINTS = [
  { id: "origine", weight: 1, map: null },
  { id: "cycleA", weight: 1, map: compile({ brique: "pierre", pierre: "ardoise", ardoise: "brique" }) },
  { id: "cycleB", weight: 1, map: compile({ brique: "ardoise", ardoise: "pierre", pierre: "brique" }) }
];

const TOTAL_WEIGHT = HOUSE_TINTS.reduce((a, t) => a + t.weight, 0);

// Tirage pondéré d'une teinte à partir d'un entier DÉJÀ haché. Séparé du hachage
// lui-même pour rester testable sans toucher au rendu.
export function pickHouseTint(seed) {
  let r = (seed >>> 0) % TOTAL_WEIGHT;
  for (let i = 0; i < HOUSE_TINTS.length; i += 1) {
    r -= HOUSE_TINTS[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

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
