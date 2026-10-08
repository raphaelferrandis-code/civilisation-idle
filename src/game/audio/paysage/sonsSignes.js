// LES SONS DES SIGNES (docs/PLAN-ECOUTER-PARLER.md, lot 8) : quel son pour quel signe, à
// quel âge. Ce sont des PONCTUELS du paysage (paysage.js les verse dans PONCTUELS) ; la
// carte les dépose au guichet (evenements.js, noteSon) au geste du joueur, là où il se
// fait (paroles/signs.js) : sur le passant pour le vent et la lumière, sur le feu qui
// monte, sur la bête qui crie. La parole n'a pas de son (Raph, 2026-10-08 : « Rien »).
//
//   · le vent, par monde (« par monde », Raph, 2026-10-08) : les feuilles au camp, le
//     linge et les volets en ville, les câbles à la Fonte et au Néon, un souffle sourd aux
//     âges cosmiques ;
//   · la lumière : un petit « aaah » de chœur, à tous les âges ;
//   · le feu, par monde : les brindilles, le brasero, le fourneau ;
//   · la bête : un cri bref, ENREGISTRÉ (src/assets/sons/, les cris que le paysage a déjà).
// Les synthétisés sont rendus par paysageSynthSignes.js.
//
// Niveaux de départ, à régler au banc d'écoute (section « Les signes ») : la sonie
// pondérée de chaque son, mesurée, ramenée un peu au-dessus des ponctuels que Raph a
// réglés (l'envol, le plouf : ≈ −29 dB ; les signes ≈ −26 dB) ; le chœur, « petit », un
// peu en dessous (≈ −28 dB). Les cris : ceux des bêtes semées (SEMES), relevés de 3 dB.
// Mesuré en jeu le 2026-10-08 (zoom 2, sonde pondérée du mixeur) : l'envol −37 dB, la
// cloche du port −26 ; le vent −27, le feu −28, le chœur −29, les cris −27 à −28.
// `ref` / `max` plus larges que les autres ponctuels : le joueur a fait le geste, il
// l'entend où que soit le passant à l'écran (la caméra le suit, citizenFocus.js).
//
// Module-FEUILLE (aucun import) : la carte l'importe sans tirer le directeur.

// `signe` : le banc d'écoute les range à part. `charge` : ils ne se chargent que quand un
// passant est désigné (paysage.js, majCharge), le seul moment où l'on peut lui faire un
// signe ; toujours chargés, ils faisaient passer quatre âges au-dessus de leur budget de
// mémoire (70 Mo, PLAN-AMBIANCE-SONORE § 3.9). Un seul à la fois de chaque, jamais deux
// tirs à moins d'une demi-seconde (un joueur qui clique deux fois).
const SIGNE = { signe: true, charge: 'signe', ref: 8, max: 34, voix: 1, ecartMs: 500 };
// Les cris : ceux qu'on a, les plus brefs d'abord (scripts/sons/catalogue.json).
const CHIEN = ['chienpres-aboie-2', 'chienpres-jappe-1', 'chienpres-jappe-2', 'chienpres-jappe-3'];
const CHAT = ['chat-miaule-1', 'chat-miaule-2', 'chat-miaule-3', 'chat-miaule-4'];
const CHEVRE = ['chevre-bele-3', 'chevre-bele-1', 'chevre-bele-2'];
const VACHE = ['vache-meugle-1', 'vache-meugle-2', 'vache-meugle-3'];

export const PONCTUELS_SIGNES = {
  signeVentCamp: { ...SIGNE, ages: [0, 1], sons: ['signe-vent-camp-1', 'signe-vent-camp-2'], niveau: 0.45 },
  signeVentVille: { ...SIGNE, ages: [2, 4], sons: ['signe-vent-ville-1', 'signe-vent-ville-2'], niveau: 0.28 },
  signeVentFonte: { ...SIGNE, ages: [5, 6], sons: ['signe-vent-fonte-1', 'signe-vent-fonte-2'], niveau: 0.22 },
  signeVentCosmos: { ...SIGNE, ages: [7, 9], sons: ['signe-vent-cosmos-1', 'signe-vent-cosmos-2'], niveau: 0.21 },
  signeLumiere: { ...SIGNE, sons: ['signe-lumiere-1', 'signe-lumiere-2'], niveau: 0.16 },
  signeFeuBois: { ...SIGNE, ages: [0, 1], sons: ['signe-feu-bois-1', 'signe-feu-bois-2'], niveau: 0.23 },
  signeFeuBrasero: { ...SIGNE, ages: [2, 4], sons: ['signe-feu-brasero-1', 'signe-feu-brasero-2'], niveau: 0.22 },
  signeFeuFourneau: { ...SIGNE, ages: [5, 6], sons: ['signe-feu-fourneau-1', 'signe-feu-fourneau-2'], niveau: 0.22 },
  // Le chien, plus bas : un aboiement claque (mesuré en jeu à −22 dB au niveau 0,28, les
  // autres cris vers −27).
  signeChien: { ...SIGNE, ages: [0, 6], enregistres: CHIEN, niveau: 0.18 },
  signeChat: { ...SIGNE, ages: [0, 6], enregistres: CHAT, niveau: 0.17 },
  signeChevre: { ...SIGNE, ages: [0, 6], enregistres: CHEVRE, niveau: 0.2 },
  // Le mouton bêle avec la voix de la chèvre, plus grave (`vitesse`).
  signeMouton: { ...SIGNE, ages: [0, 6], enregistres: CHEVRE, vitesse: 0.86, niveau: 0.2 },
  signeVache: { ...SIGNE, ages: [0, 6], enregistres: VACHE, niveau: 0.22 },
};

// Les mondes (bandes de data/eraThemes.js) : le Feu et le Bois ; de la Pierre au Marbre ;
// la Fonte et le Néon ; les âges cosmiques.
const ventDuMonde = (b) => (b <= 1 ? 'signeVentCamp' : b <= 4 ? 'signeVentVille' : b <= 6 ? 'signeVentFonte' : 'signeVentCosmos');
const feuDuMonde = (b) => (b <= 1 ? 'signeFeuBois' : b <= 4 ? 'signeFeuBrasero' : 'signeFeuFourneau');
const BETES = { dog: 'signeChien', cat: 'signeChat', goat: 'signeChevre', sheep: 'signeMouton', cow: 'signeVache' };

// Le ponctuel du signe `kind` (SIGN_KINDS : 'wind', 'light', 'fire', 'beast') à la bande
// `bande`, devant la bête `bete` (critters.js : 'dog', 'cat'…) ; null s'il n'en a pas.
// Aux âges 7 à 9, ni feu ni bête (paroles/signs.js) : pas de son non plus. PUR.
export function sonDuSigne(kind, bande, bete = null) {
  const b = bande | 0;
  switch (kind) {
    case 'wind': return ventDuMonde(b);
    case 'light': return 'signeLumiere';
    case 'fire': return b <= 6 ? feuDuMonde(b) : null;
    case 'beast': return (b <= 6 && BETES[bete]) || null;
    default: return null;
  }
}
