"use strict";

/* ============================================================================
 * idleNarrative.js — Habillage narratif de la reprise après une absence (idle).
 *
 * PUREMENT COSMÉTIQUE : aucune valeur de jeu, aucun équilibrage. Compose une
 * courte dépêche (émise via chronicle() au retour, cf. main.applyOfflineProgress)
 * selon trois axes : la DURÉE d'absence, l'ÂGE de la cité (bande d'ère) et le
 * niveau de RUPTURE — plus un cas spécial quand l'Usure a atteint son terme.
 * ============================================================================ */

import { eraBandOf } from "./eraThemes.js";
import { tr } from "../core/i18n.js";

// Tournure de durée selon le temps réel d'absence (avant plafonnement du cap).
function durationPhrase(seconds) {
  const h = seconds / 3600;
  if (h < 1) return tr({ fr: "Quelques heures à peine", en: "Barely a few hours" });
  if (h < 6) return tr({ fr: "Une demi-journée", en: "Half a day" });
  if (h < 24) return tr({ fr: "Près d'un jour", en: "Nearly a day" });
  if (h < 72) return tr({ fr: "Plusieurs jours", en: "Several days" });
  if (h < 24 * 14) return tr({ fr: "Des semaines entières", en: "Whole weeks" });
  return tr({ fr: "Un âge entier", en: "An entire age" });
}

// Ce qu'est devenue la cité, selon sa bande d'époque (0–9, cf. eraThemes).
const ERA_MOOD = [
  { fr: "le campement s'est étoffé autour de ses feux", en: "the encampment has thickened around its fires" },                  // 0 · Feu
  { fr: "les abris de bois ont gagné du terrain sur la forêt", en: "the timber shelters have gained ground on the forest" },           // 1 · Bois
  { fr: "la pierre claire a poursuivi patiemment son œuvre", en: "the pale stone has patiently pursued its work" },             // 2 · Pierre
  { fr: "la cour et ses bannières ont prospéré sans toi", en: "the court and its banners have prospered without you" },                // 3 · Couronne
  { fr: "le marbre des esplanades a continué de blanchir", en: "the marble of the esplanades has gone on whitening" },             // 4 · Marbre
  { fr: "les fonderies et les gazettes n'ont pas cessé de tourner", en: "the foundries and the gazettes have never ceased to turn" },      // 5 · Fonte
  { fr: "les tours de néon ont veillé sans jamais dormir", en: "the neon towers have kept watch without ever sleeping" },               // 6 · Néon
  { fr: "la noosphère a respiré d'un seul et même souffle", en: "the noosphere has breathed with one single breath" },              // 7 · Noosphère
  { fr: "la cité a essaimé en silence d'étoile en étoile", en: "the city has swarmed in silence from star to star" },               // 8 · Stellaire
  { fr: "la cité a continué de tisser le réel en ton absence", en: "the city has gone on weaving the real in your absence" }            // 9 · Démiurge
];

// Climat social selon la jauge de Rupture laissée derrière soi.
function ruptureClause(instability) {
  if (instability >= 0.85) return tr({ fr: "mais la tension a couvé sous la cendre, prête à rompre", en: "but the tension has smouldered under the ash, ready to break" });
  if (instability >= 0.55) return tr({ fr: "non sans quelques fractures sourdes", en: "not without a few muffled fractures" });
  if (instability >= 0.25) return tr({ fr: "dans un calme précaire", en: "in a precarious calm" });
  return tr({ fr: "dans une paix presque suspecte", en: "in a peace almost suspect" });
}

export function idleResumeNarrative({ elapsedSeconds, eraIndex, instability, terminalUsure, collapses = 0, ruinsGained = null }) {
  const band = eraBandOf(eraIndex);
  const mood = tr(ERA_MOOD[Math.max(0, Math.min(ERA_MOOD.length - 1, band))]);
  const dur = durationPhrase(Math.max(0, elapsedSeconds || 0));
  const rupt = ruptureClause(instability || 0);
  const absence = tr({ fr: " d'absence. ", en: " of absence. " });
  // Farm hors-ligne : la cité a bouclé effondrement → renaissance plusieurs fois.
  if (collapses > 0) {
    const fois = collapses === 1
      ? tr({ fr: "une fois", en: "once" })
      : `${collapses} ${tr({ fr: "fois", en: "times" })}`;
    const ruines = ruinsGained
      ? tr({ fr: ` Tes archivistes ont consigné +${ruinsGained} ruines à ton retour.`, en: ` Your archivists recorded +${ruinsGained} ruins upon your return.` })
      : "";
    return `${dur}${absence}${capitalize(mood)}${tr({ fr: " — mais les cycles n'ont pas dormi : la cité s'est effondrée et relevée ", en: " — but the cycles did not sleep: the city fell and rose again " })}${fois}, ${rupt}.${ruines}`;
  }
  if (terminalUsure) {
    return `${dur}${absence}${capitalize(mood)}, ${rupt}${tr({ fr: " — et le temps, lui, n'a pas attendu : l'usure a tout rattrapé. La cité retient son souffle et attend ta décision.", en: " — and time, for its part, did not wait: the wear caught up with everything. The city holds its breath and awaits your decision." })}`;
  }
  return `${dur}${absence}${tr({ fr: "À ton retour, ", en: "Upon your return, " })}${mood}, ${rupt}.`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
