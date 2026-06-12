"use strict";

// Thèmes diégétiques du bandeau-dépêche (ChronicleTicker) : le "journal" change
// de support avec les ères (tradition orale → argile → presse → flux).
// Module séparé du composant pour préserver le Fast Refresh.
export function getJournalTheme(eraIndex) {
  if (eraIndex < 4) {
    return {
      cssClass: "is-oral",
      masthead: "L'ÉCHO DES SOUCHES",
      price: "Gratuit",
      tradition: "Tradition Orale"
    };
  } else if (eraIndex < 9) {
    return {
      cssClass: "is-clay-tablet",
      masthead: "LE DIT DE LA PIERRE",
      price: "3 coquillages",
      tradition: "Argile Gravée"
    };
  } else if (eraIndex < 15) {
    return {
      cssClass: "is-parchment",
      masthead: "LE FEUILLET DU HAMEAU",
      price: "1 œuf frais",
      tradition: "Manuscrit"
    };
  } else if (eraIndex < 21) {
    return {
      cssClass: "is-scroll",
      masthead: "LE HÉRAUT DE LA CITÉ",
      price: "2 deniers",
      tradition: "Proclamation"
    };
  } else if (eraIndex < 27) {
    return {
      cssClass: "is-printed-paper",
      masthead: "LA FEUILLE QUOTIDIENNE",
      price: "5 centimes",
      tradition: "Gazette Imprimée"
    };
  } else if (eraIndex < 32) {
    return {
      cssClass: "is-press",
      masthead: "LA GRANDE DÉPÊCHE",
      price: "10 centimes",
      tradition: "Presse / Ondes"
    };
  } else {
    return {
      cssClass: "is-cyber-feed",
      masthead: "LE SIGNAL",
      price: "0.02 crédit",
      tradition: "Flux Cybernétique"
    };
  }
}
