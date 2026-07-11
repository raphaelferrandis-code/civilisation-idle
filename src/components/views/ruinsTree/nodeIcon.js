"use strict";

// Emblème pixel-art par nœud de ruines. Depuis la Phase D, CHAQUE nœud et
// CHAQUE dogme de l'arbre a son emblème DÉDIÉ : /pixelart/ui/ruins/node-<id>.png
// (64×64, transparent — généré + détouré par scratch/generate-emblems.cjs,
// grammaire v2 : un symbole, formes épaisses, braise ambre sur charbon).
//
// ⚠ Un NOUVEAU nœud dans upgrades.js exige donc son emblème :
//    node scratch/generate-emblems.cjs --missing   (après ajout du sujet au script)
// La planche de contrôle : node scratch/build-emblem-sheet.cjs
//
// Les anciens emblèmes « par famille d'effet » (food.png, gold-keep.png, …)
// restent dans le dossier mais ne sont plus référencés ici.

export function iconFor(upgrade) {
  return upgrade?.id ? `node-${upgrade.id}` : "global";
}
