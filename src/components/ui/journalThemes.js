"use strict";

// Thèmes diégétiques du bandeau-dépêche (ChronicleTicker) : le "journal" change
// de support avec les ères (tradition orale → argile → presse → flux).
// Module séparé du composant pour préserver le Fast Refresh.
// Aligné sur les 7 époques (eraBandOf) : le support bascule en même temps
// que la peau d'époque de l'UI et l'ambiance de la carte.
import { eraBandOf } from "../../game/data/eraThemes.js";

const JOURNAL_BY_BAND = [
  { cssClass: "is-oral",          price: "Gratuit",      tradition: "Tradition Orale" },
  { cssClass: "is-clay-tablet",   price: "3 coquillages", tradition: "Argile Gravée" },
  { cssClass: "is-parchment",     price: "1 œuf frais",  tradition: "Manuscrit" },
  { cssClass: "is-scroll",        price: "2 deniers",    tradition: "Proclamation" },
  { cssClass: "is-printed-paper", price: "5 centimes",   tradition: "Gravure Imprimée" },
  { cssClass: "is-press",         price: "10 centimes",  tradition: "Presse / Ondes" },
  { cssClass: "is-cyber-feed",    price: "0.02 crédit",  tradition: "Flux Cybernétique" }
];

export function getJournalTheme(eraIndex) {
  const theme = JOURNAL_BY_BAND[eraBandOf(eraIndex)] || JOURNAL_BY_BAND[0];
  return { masthead: "CHRONIQUE DE L'EFFONDREMENT", ...theme };
}
