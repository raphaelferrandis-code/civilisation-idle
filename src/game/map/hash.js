// LES HACHAGES PARTAGÉS DE LA CARTE — une variante EXACTE par famille.
//
// Audit du 05/10 (STRUCT-8) : chaque passe recopiait « son » hash — le finaliseur de
// murmur3 l'était huit fois, à la virgule près. Les copies STRICTEMENT identiques
// importent désormais d'ici ; leur garde, hash.test.js, compare chaque variante à la
// copie d'origine, gelée dans le test, sur des milliers d'entrées.
//
// ⚠ NE JAMAIS CHANGER UN ALGORITHME ICI, ni « unifier » deux familles voisines. Ces
// tirages placent les arbres, teintent les maisons, choisissent les variantes, cadencent
// les passants : un bit de différence redistribue toute la ville. Une copie qui diffère
// d'un `>>> 0`, d'une constante ou d'un Math.imul reste où elle est.
// Copies VOLONTAIRES laissées en place : boatBake.h32 (le kit de bateaux ne dépend
// d'aucun chantier voisin), seedManager.hashString / rngFrom (le générateur de carte
// tourne hors jeu), synth.graine (le son reste pur), cmHash (layout.js) et les FNV-1a
// qui l'évitent pour ne pas boucler sur layout.js (ilotLayout, chuteState).
//
// Module FEUILLE : aucun import. Le chunk de la vue des Plaisirs peut le lire sans
// embarquer une ligne de code de carte.

// Finaliseur de murmur3 (fmix32) : brasse un entier 32 bits, rend un uint32. ⚠ cmHash
// est un FNV-1a dont les bits FAIBLES suivent l'entrée (`cmHash(k) & 1` sur des
// coordonnées donne un DAMIER) : on rebrasse avant d'en tirer quoi que ce soit.
export function fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16; return h >>> 0;
}

// Entier → [0, 1) : décalage du nombre d'or puis deux tours « lowbias32 ». La vie de
// la carte (fleuve, oiseaux, papillons, brume) tire tout de celui-ci.
export function hash01Lowbias(n) {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

// Trois entiers → uint32, famille des grands premiers (374761393 / 668265263). ⚠ Le
// produit est FLOTTANT (pas de Math.imul) : c'est la variante des peintres de pixels
// (pont, champs, moulins, coupe des Plaisirs).
export function h32(a, b = 0, c = 0) {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
}

// Deux entiers → [0, 1), même famille, sans troisième terme (pistes et salle des
// Plaisirs).
export function h01Pair(a, b) {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// (x, y, graine) → [0, 1), même famille mais brassée par Math.imul, et une graine qui
// N'EST PAS tronquée en entier (boîtes cuites des ports et des quais).
export function h01Imul(x, y, s = 0) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + s * 982451653;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
