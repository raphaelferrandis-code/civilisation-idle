"use strict";

// Thèmes diégétiques du bandeau-dépêche (ChronicleTicker) : le "journal" change
// de support avec les ères (tradition orale → argile → presse → flux).
// Module séparé du composant pour préserver le Fast Refresh.
// Aligné sur les 7 époques (eraBandOf) : le support bascule en même temps
// que la peau d'époque de l'UI et l'ambiance de la carte.
import { eraBandOf } from "../../game/data/eraThemes.js";
import { localizeData } from "../../game/core/i18n.js";

const JOURNAL_BY_BAND = [
  { cssClass: "is-oral",          price: { fr: "Gratuit",       en: "Free" },          tradition: { fr: "Tradition Orale",      en: "Oral Tradition" } },
  { cssClass: "is-clay-tablet",   price: { fr: "3 coquillages", en: "3 seashells" },   tradition: { fr: "Argile Gravée",        en: "Engraved Clay" } },
  { cssClass: "is-parchment",     price: { fr: "1 œuf frais",   en: "1 fresh egg" },   tradition: { fr: "Manuscrit",            en: "Manuscript" } },
  { cssClass: "is-scroll",        price: { fr: "2 deniers",     en: "2 deniers" },     tradition: { fr: "Proclamation",         en: "Proclamation" } },
  { cssClass: "is-printed-paper", price: { fr: "5 centimes",    en: "5 cents" },       tradition: { fr: "Gravure Imprimée",     en: "Printed Engraving" } },
  { cssClass: "is-press",         price: { fr: "10 centimes",   en: "10 cents" },      tradition: { fr: "Presse / Ondes",       en: "Press / Airwaves" } },
  { cssClass: "is-cyber-feed",    price: { fr: "0.02 crédit",   en: "0.02 credit" },   tradition: { fr: "Flux Cybernétique",    en: "Cybernetic Feed" } },
  // Époques transcendantes (bands 7–9)
  { cssClass: "is-noosphere",     price: { fr: "une pensée",    en: "a thought" },     tradition: { fr: "Conscience Partagée",  en: "Shared Consciousness" } },
  { cssClass: "is-stellar",       price: { fr: "un photon",     en: "a photon" },      tradition: { fr: "Écho Stellaire",       en: "Stellar Echo" } },
  { cssClass: "is-demiurge",      price: { fr: "néant",         en: "nothing" },       tradition: { fr: "Verbe Premier",        en: "First Word" } }
];

// Le bandeau (masthead) est commun à toutes les ères ; on l'aplatit comme le
// reste. localizeData ne résout une unité { fr, en } que lorsqu'elle est la
// VALEUR d'une clé de parent — d'où l'enveloppe { text: … } plutôt qu'un
// { fr, en } nu (qui resterait inchangé au niveau racine).
const MASTHEAD = { text: { fr: "CHRONIQUE DE L'EFFONDREMENT", en: "CHRONICLE OF THE COLLAPSE" } };

// Fichier de DONNÉES : on aplatit les unités { fr, en } en chaînes de la langue
// courante UNE fois au chargement (cf. localizeData). Les consommateurs lisent
// ensuite theme.price / theme.tradition / theme.masthead comme de simples
// strings — pas de tr() requis côté composant.
localizeData(JOURNAL_BY_BAND);
localizeData(MASTHEAD);

export function getJournalTheme(eraIndex) {
  const theme = JOURNAL_BY_BAND[eraBandOf(eraIndex)] || JOURNAL_BY_BAND[0];
  return { masthead: MASTHEAD.text, ...theme };
}
