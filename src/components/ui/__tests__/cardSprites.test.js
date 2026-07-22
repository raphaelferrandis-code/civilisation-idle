// Les 52 sprites de cartes viennent d'un pack tiers dont les noms de fichiers
// d'origine étaient incohérents (« five heart.png » mais « three hearts.png »).
// Ils ont donc été renommés à la main : une faute de frappe dans un seul nom
// donnerait une carte invisible en pleine main, et seulement pour ce rang.
// Ce test balaie le sabot complet et vérifie que chaque carte a son fichier.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { BLACKJACK_SUITS, RANKS } from '../../../game/core/actions/blackjack.js';
import { cardSrc, cardLabel, CARD_BACK_SRC, CARD_DECK_SRC, CARD_NATIVE, DECK_NATIVE } from '../cardSprites.js';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public');
const onDisk = (src) => path.join(PUBLIC, src.replace(/^\//, ''));

describe('sprites des cartes du Vingt-et-un', () => {
  it('les 52 cartes du sabot ont toutes leur fichier', () => {
    const missing = [];
    for (const suit of BLACKJACK_SUITS) {
      for (const rank of RANKS) {
        const src = cardSrc({ rank, suit });
        if (!existsSync(onDisk(src))) missing.push(src);
      }
    }
    expect(missing).toEqual([]);
    expect(BLACKJACK_SUITS.length * RANKS.length).toBe(52);
  });

  it('deux cartes différentes ne partagent jamais un sprite', () => {
    const seen = new Set();
    for (const suit of BLACKJACK_SUITS) {
      for (const rank of RANKS) seen.add(cardSrc({ rank, suit }));
    }
    expect(seen.size).toBe(52);
  });

  it('le dos existe et sert de repli aux cartes illisibles', () => {
    expect(existsSync(onDisk(CARD_BACK_SRC))).toBe(true);
    // Jamais d'image cassée : une couleur inconnue rend le dos, pas un 404.
    expect(cardSrc({ rank: 'A', suit: 'inconnue' })).toBe(CARD_BACK_SRC);
    expect(cardSrc(null)).toBe(CARD_BACK_SRC);
  });

  it('donne une alternative textuelle lisible à la voix', () => {
    expect(cardLabel({ rank: 'A', suit: 'olive' })).toBe('A♠');
    expect(cardLabel({ rank: '10', suit: 'amphore' })).toBe('10♥');
  });

  // Le rendu CSS est à 64×96 : le double EXACT du natif. Si un jour le pack
  // change de gabarit, ce test rappelle qu'il faut refaire le calcul entier.
  it('le gabarit natif reste celui que le CSS double', () => {
    expect(CARD_NATIVE).toEqual({ w: 32, h: 48 });
  });

  // Le sabot a été RECUIT depuis un fichier agrandi 8 fois. S'il repassait à sa
  // taille livrée, le CSS le doublerait et il écraserait le drap.
  it('le sabot existe et partage l’unité de pixel des cartes', () => {
    expect(existsSync(onDisk(CARD_DECK_SRC))).toBe(true);
    expect(DECK_NATIVE).toEqual({ w: 32, h: 64 });
    expect(DECK_NATIVE.w).toBe(CARD_NATIVE.w);
  });
});
