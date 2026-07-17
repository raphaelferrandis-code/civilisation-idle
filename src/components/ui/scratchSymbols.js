// Emblèmes des jeux du temple : symboles des tickets à gratter + « couleurs »
// des cartes du vingt-et-un. PAS de sprites dédiés /pixelart/ui/scratch/ —
// chaque clé moteur (scratch.js / blackjack.js, stable dans les saves) est
// mappée sur une icône pixel-art DÉJÀ en jeu. Le nom du symbole n'est jamais
// affiché : seule la lisibilité/distinction des emblèmes compte.
export const SCRATCH_SYMBOL_SRC = {
  olive: '/pixelart/ui/myths/benediction.png',            // branche d'olivier
  amphore: '/pixelart/ui/faveur/amphore.png',             // l'amphore de la cagnotte
  laurier: '/pixelart/ui/glyphs/couronne.png',            // couronne d'or
  trepied: '/pixelart/ui/glyphs/trophee.png',             // coupe-trépied
  chouette: '/pixelart/ui/ruins/node-oral_tradition.png', // lyre (l'emblème rare)
  venus: '/pixelart/ui/icarus/icarus.png',                // = le vol d'Icare offert
  soleil: '/pixelart/ui/icarus/sun.png',                  // = le soleil de la cagnotte
  tesson: '/pixelart/ui/glyphs/ruines.png'                // débris inerte (remplissage)
};

// Clé inconnue → tesson (jamais d'image cassée).
export function scratchSymbolSrc(name) {
  return SCRATCH_SYMBOL_SRC[name] || SCRATCH_SYMBOL_SRC.tesson;
}
