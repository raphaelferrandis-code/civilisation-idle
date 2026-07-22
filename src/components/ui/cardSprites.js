// Sprites des cartes du Vingt-et-un — pack « Pixel Playing Cards » de Bit Digitalis
// (itch.io, usage commercial autorisé, crédit demandé : cf. l'onglet Crédits des
// Options). 52 PNG de 32×48 px dans public/pixelart/ui/cards, plus le dos noir.
//
// Le moteur (actions/blackjack.js) garde ses quatre « couleurs » antiques comme
// CLÉS — olive, amphore, laurier, chouette — parce qu'elles ne portent aucune
// règle et qu'aucun nom n'est jamais affiché. Seul l'habillage change : ici on
// les rend en couleurs internationales. Rien à migrer, la main en cours est un
// état module éphémère et jamais sauvegardé.
const SUIT_FILE = {
  olive: 'spades',
  amphore: 'hearts',
  laurier: 'diamonds',
  chouette: 'clubs'
};

// Alternative textuelle des cartes (l'image seule ne dit rien à un lecteur d'écran).
const SUIT_GLYPH = { olive: '♠', amphore: '♥', laurier: '♦', chouette: '♣' };

export const CARD_BACK_SRC = '/pixelart/ui/cards/back.png';

// Le sabot posé sur le drap : le paquet face cachée, vu de trois quarts (dessus
// noir + tranche des cartes empilées). Décoratif, il ne compte pas les cartes
// restantes. Le pack le livrait agrandi 8 fois ; il a été ramené à sa taille
// native par teinte dominante de chaque bloc (source de la cuisson dans
// assets/cards-src, hors public).
export const CARD_DECK_SRC = '/pixelart/ui/cards/deck.png';

// Taille NATIVE d'une carte du pack. Le rendu doit être un multiple entier de
// ces valeurs : à facteur fractionnaire le pixel art se hache (cf. la passe sur
// les icônes d'UI écrasées en 16 px).
export const CARD_NATIVE = { w: 32, h: 48 };

// Le sabot partage l'unité de pixel des cartes : même largeur native, donc même
// facteur ×2 au rendu. Deux échelles différentes sur le même drap se verraient.
export const DECK_NATIVE = { w: 32, h: 64 };

// Chemin du sprite d'une carte { rank, suit }. Une clé inconnue rend le dos
// plutôt qu'une image cassée.
export function cardSrc(card) {
  const suit = SUIT_FILE[card?.suit];
  if (!suit || !card?.rank) return CARD_BACK_SRC;
  return `/pixelart/ui/cards/${card.rank}-${suit}.png`;
}

// « A♠ », « 10♥ »… — court, non traduit, lisible à la voix comme à l'écrit.
export function cardLabel(card) {
  const glyph = SUIT_GLYPH[card?.suit] || '';
  return `${card?.rank || ''}${glyph}`;
}
