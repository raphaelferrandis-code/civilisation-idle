"use strict";

// ── Jalons du Grand Reset ────────────────────────────────────────────────────
// Depuis la suppression de la légitimité/dynastie, chaque Grand Reset se débloque
// non plus en payant une monnaie, mais en atteignant un JALON MARQUANT propre au
// jeu — une échelle « tour des systèmes » à difficulté croissante (GR I → XI).
// Chaque jalon reste MASQUÉ (« ??? ») jusqu'à ce qu'il soit atteint une 1re fois :
// le joueur le DÉCOUVRE, puis peut activer le GR quand il veut (cf. la table des
// Grands Resets, page Effondrement, sous la Doctrine de crise).
//
// Ce module est PUR côté lecture (il lit `state`) et n'importe QUE state + shared
// (has) + les données de l'arbre + num — aucun cycle d'import avec prestige.js.

import { state } from '../state.js';
import { D } from '../num.js';
import { has } from './shared.js';
import { PRESTIGE_TREE } from '../../data/upgrades.js';

// Nombre de Mythes accomplis (inline pour éviter d'importer prestige.js).
function mythCount() {
  return Object.values(state.mythsCompleted || {}).filter(Boolean).length;
}

// Seuils TUNABLES des 11 jalons — l'équilibrage fin viendra dans un second temps.
// GR1 = 10 effondrements et GR2 = 3 merveilles sont fixés (choix de design) ; le
// reste suit l'échelle « tour des systèmes » (Mythes en colonne à 4 crans).
export const GR_MILESTONE_THRESHOLDS = {
  cycles: 10,          // GR1  — effondrements traversés
  wonders: 3,          // GR2  — merveilles érigées
  myths1: 1,           // GR3  — 1er Mythe honoré
  // GR4 — pic de population. Relevé 1e6 → 1e13 (calibrage 2026-07) : à ce stade
  // le pic de cycle dépassait déjà largement le million (jalon pré-rempli) ;
  // 1e13 en fait le mur du mid-game (~1j12 au métronome bot).
  population: 1e13,
  myths2: 5,           // GR6  — Acte I scellé (5 Mythes)
  myths3: 8,           // GR8  — Acte II scellé (8 Mythes)
  // GR9 — 2 capstones de l'Arbre (l'arbre se re-bâtit à chaque époque) ; GR10 —
  // ère 40 (Singularité dépassée). Étirés au calibrage : à ×2^n de multiplicateur,
  // aucun seuil statique ne tient des JOURS — ce sont des ralentisseurs, le vrai
  // pacing tardif humain venant de la difficulté des Mythes d'Acte II/III.
  capstones: 2,
  eraTranscendent: 40,
  myths4: 14           // GR11 — Ragnarök (14 Mythes)
};

const T = GR_MILESTONE_THRESHOLDS;

// L'échelle. `check()` lit le state courant. `system` = le pan de jeu engagé
// (pour l'affichage). Le nom est révélé au joueur SEULEMENT une fois découvert.
export const GRAND_RESET_MILESTONES = [
  {
    gr: 1, id: "premier_crepuscule",
    name: { fr: "Le Premier Crépuscule", en: "The First Dusk" },
    system: { fr: "Effondrement", en: "Collapse" },
    check: () => (state.cycles || 0) >= T.cycles
  },
  {
    gr: 2, id: "premiere_merveille",
    name: { fr: "La Première Merveille", en: "The First Wonder" },
    system: { fr: "Merveilles", en: "Wonders" },
    check: () => (Array.isArray(state.wonders) ? state.wonders.length : 0) >= T.wonders
  },
  {
    gr: 3, id: "premier_pacte",
    name: { fr: "Premier Pacte Mythique", en: "First Mythic Pact" },
    system: { fr: "Mythes", en: "Myths" },
    check: () => mythCount() >= T.myths1
  },
  {
    gr: 4, id: "colonne_million",
    name: { fr: "La Colonne du Million", en: "The Column of the Million" },
    system: { fr: "Population", en: "Population" },
    check: () => D(state.cyclePeaks?.population ?? state.population ?? 0).gte(T.population)
  },
  {
    gr: 5, id: "olympe_prononce",
    name: { fr: "L'Olympe se prononce", en: "Olympus Speaks" },
    system: { fr: "Olympe", en: "Olympus" },
    check: () => state.olympus?.unlockedProfile != null
  },
  {
    gr: 6, id: "acte_i_scelle",
    name: { fr: "Acte I — La Fondation Scellée", en: "Act I — The Foundation Sealed" },
    system: { fr: "Mythes", en: "Myths" },
    check: () => mythCount() >= T.myths2
  },
  {
    gr: 7, id: "jackpot_icare",
    name: { fr: "Le Jackpot d'Icare", en: "Icarus's Jackpot" },
    system: { fr: "Icare", en: "Icarus" },
    check: () => (state.icarusJackpots || 0) >= 1
  },
  {
    gr: 8, id: "acte_ii_scelle",
    name: { fr: "Acte II — La Domination Scellée", en: "Act II — Dominion Sealed" },
    system: { fr: "Mythes", en: "Myths" },
    check: () => mythCount() >= T.myths3
  },
  {
    gr: 9, id: "premiere_couronne",
    name: { fr: "Les Couronnes Jumelles", en: "The Twin Crowns" },
    system: { fr: "Arbre des Ruines", en: "Tree of Ruins" },
    check: () => PRESTIGE_TREE.filter((n) => n.capstone && has(n.id)).length >= T.capstones
  },
  {
    gr: 10, id: "au_dela_singularite",
    name: { fr: "Au-delà de la Singularité", en: "Beyond the Singularity" },
    system: { fr: "Ères", en: "Eras" },
    check: () => (state.bestEraIndex || 0) >= T.eraTranscendent
  },
  {
    gr: 11, id: "regard_ragnarok",
    name: { fr: "Sous le Regard du Ragnarök", en: "Under Ragnarök's Gaze" },
    system: { fr: "Mythes", en: "Myths" },
    check: () => mythCount() >= T.myths4
  }
];

// Le jalon du n-ième Grand Reset (nextCount = grandResetCount + 1).
export function grandResetMilestone(nextCount) {
  return GRAND_RESET_MILESTONES.find((m) => m.gr === nextCount) || null;
}

// Le jalon du n-ième GR est-il atteint ? (undefined au-delà de l'échelle = false).
export function grandResetMilestoneMet(nextCount) {
  const m = grandResetMilestone(nextCount);
  return m ? Boolean(m.check()) : false;
}

// Un jalon est RÉVÉLÉ au joueur si : le GR est déjà accompli (n ≤ grandResetCount),
// OU il a été découvert et latché (state.grRevealed), OU il est atteint à l'instant.
export function isGrandResetMilestoneRevealed(gr) {
  if (gr <= (state.grandResetCount || 0)) return true;
  if (state.grRevealed && state.grRevealed[gr]) return true;
  return grandResetMilestoneMet(gr);
}

// Latch de découverte : appelé au tick. Dès que le jalon du PROCHAIN GR est atteint,
// on le grave dans state.grRevealed (persistant) — il reste révélé même si le signal
// sous-jacent retombe ensuite (ex. les cycles remis à 0 au GR). Retourne l'id du
// jalon fraîchement découvert (pour un retour visuel), ou null.
export function refreshGrandResetReveal() {
  const next = (state.grandResetCount || 0) + 1;
  const m = grandResetMilestone(next);
  if (!m) return null;
  if (!state.grRevealed) state.grRevealed = {};
  if (state.grRevealed[next]) return null;
  if (m.check()) {
    state.grRevealed[next] = true;
    return m.id;
  }
  return null;
}
