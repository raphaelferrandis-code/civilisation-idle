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

// Tournure de durée selon le temps réel d'absence (avant plafonnement du cap).
function durationPhrase(seconds) {
  const h = seconds / 3600;
  if (h < 1) return "Quelques heures à peine";
  if (h < 6) return "Une demi-journée";
  if (h < 24) return "Près d'un jour";
  if (h < 72) return "Plusieurs jours";
  if (h < 24 * 14) return "Des semaines entières";
  return "Un âge entier";
}

// Ce qu'est devenue la cité, selon sa bande d'époque (0–9, cf. eraThemes).
const ERA_MOOD = [
  "le campement s'est étoffé autour de ses feux",                  // 0 · Feu
  "les abris de bois ont gagné du terrain sur la forêt",           // 1 · Bois
  "la pierre claire a poursuivi patiemment son œuvre",             // 2 · Pierre
  "la cour et ses bannières ont prospéré sans toi",                // 3 · Couronne
  "le marbre des esplanades a continué de blanchir",               // 4 · Marbre
  "les fonderies et les gazettes n'ont pas cessé de tourner",      // 5 · Fonte
  "les tours de néon ont veillé sans jamais dormir",               // 6 · Néon
  "la noosphère a respiré d'un seul et même souffle",              // 7 · Noosphère
  "la cité a essaimé en silence d'étoile en étoile",               // 8 · Stellaire
  "la cité a continué de tisser le réel en ton absence"            // 9 · Démiurge
];

// Climat social selon la jauge de Rupture laissée derrière soi.
function ruptureClause(instability) {
  if (instability >= 0.85) return "mais la tension a couvé sous la cendre, prête à rompre";
  if (instability >= 0.55) return "non sans quelques fractures sourdes";
  if (instability >= 0.25) return "dans un calme précaire";
  return "dans une paix presque suspecte";
}

export function idleResumeNarrative({ elapsedSeconds, eraIndex, instability, terminalUsure, collapses = 0, ruinsGained = null }) {
  const band = eraBandOf(eraIndex);
  const mood = ERA_MOOD[Math.max(0, Math.min(ERA_MOOD.length - 1, band))];
  const dur = durationPhrase(Math.max(0, elapsedSeconds || 0));
  const rupt = ruptureClause(instability || 0);
  // Farm hors-ligne : la cité a bouclé effondrement → renaissance plusieurs fois.
  if (collapses > 0) {
    const fois = collapses === 1 ? "une fois" : `${collapses} fois`;
    const ruines = ruinsGained ? ` Tes archivistes ont consigné +${ruinsGained} ruines à ton retour.` : "";
    return `${dur} d'absence. ${capitalize(mood)} — mais les cycles n'ont pas dormi : la cité s'est effondrée et relevée ${fois}, ${rupt}.${ruines}`;
  }
  if (terminalUsure) {
    return `${dur} d'absence. ${capitalize(mood)}, ${rupt} — et le temps, lui, n'a pas attendu : l'usure a tout rattrapé. La cité retient son souffle et attend ta décision.`;
  }
  return `${dur} d'absence. À ton retour, ${mood}, ${rupt}.`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
