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
import { recordGrDiscovered } from '../chronicleStats.js';

// Nombre de Mythes accomplis (inline pour éviter d'importer prestige.js).
function mythCount() {
  return Object.values(state.mythsCompleted || {}).filter(Boolean).length;
}

// Seuils TUNABLES des 11 sceaux. Deux sont RELATIFS (indexés sur le nombre de
// sceaux déjà réclamés, = le driver du ×2^n) pour ne jamais devenir triviaux tard
// ni infaisables tôt ; les autres sont robustes par nature (contenu, comptes,
// arbre qui se re-bâtit). Système ORDRE-LIBRE : chaque sceau est indépendant.
export const GR_MILESTONE_THRESHOLDS = {
  cycles: 10,          // GR1  — effondrements traversés
  wonders: 3,          // GR2  — merveilles érigées
  myths1: 1,           // GR3  — 1er Mythe honoré
  // GR4 (RELATIF) — cible pop = populationBase × 10^(sceaux réclamés). À 0 sceau :
  // 1e6 ; à 5 : 1e11 ; à 10 : 1e16. Suit ta puissance → toujours un vrai palier.
  populationBase: 1e6,
  populationDecadePerGr: 1,
  myths2: 5,           // GR6  — Acte I scellé (5 Mythes)
  myths3: 8,           // GR8  — Acte II scellé (8 Mythes)
  capstones: 4,        // GR9  — les 4 capstones (arbre entier ; se re-bâtit au GR)
  // GR10 (RELATIF) — ère cible = eraBase + eraStepPerGr × (sceaux réclamés). À 0 :
  // ère 40 ; à 10 : ère 60. Transcendant de plus en plus profond avec ta puissance.
  eraBase: 40,
  eraStepPerGr: 2,
  myths4: 14           // GR11 — Ragnarök (14 Mythes)
};

const T = GR_MILESTONE_THRESHOLDS;

// Cibles RELATIVES des sceaux GR4/GR10, indexées sur le nombre de sceaux réclamés
// (grandResetCount). Exportées pour l'affichage (le plateau montre « X / cible »).
export function grPopulationTarget() {
  return T.populationBase * Math.pow(10, (state.grandResetCount || 0) * T.populationDecadePerGr);
}
export function grEraTarget() {
  return T.eraBase + T.eraStepPerGr * (state.grandResetCount || 0);
}

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
    system: { fr: "Rayonnement", en: "Radiance" },
    check: () => D(state.cyclePeaks?.population ?? state.population ?? 0).gte(grPopulationTarget())
  },
  {
    gr: 5, id: "olympe_prononce",
    name: { fr: "L'Olympe se prononce", en: "Olympus Speaks" },
    system: { fr: "Olympe", en: "Olympus" },
    check: () => state.olympus?.unlockedProfile != null
  },
  {
    gr: 6, id: "acte_i_scelle",
    name: { fr: "Acte I : La Fondation Scellée", en: "Act I: The Foundation Sealed" },
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
    name: { fr: "Acte II : La Domination Scellée", en: "Act II: Dominion Sealed" },
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
    check: () => (state.bestEraIndex || 0) >= grEraTarget()
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

// Le sceau a-t-il été RÉCLAMÉ (encaissé via un Grand Reset) ?
export function isGrandResetMilestoneClaimed(gr) {
  return Boolean(state.grClaimed && state.grClaimed[gr]);
}

// Un sceau est RÉVÉLÉ si : déjà réclamé, OU découvert/banké (grRevealed latché),
// OU atteint à l'instant. Le médaillon/nom ne s'affichent qu'une fois révélé.
export function isGrandResetMilestoneRevealed(gr) {
  if (isGrandResetMilestoneClaimed(gr)) return true;
  if (state.grRevealed && state.grRevealed[gr]) return true;
  return grandResetMilestoneMet(gr);
}

// Un sceau est RÉCLAMABLE maintenant (ORDRE-LIBRE) : découvert/banké (sa condition
// a été atteinte une fois — banking), pas encore réclamé, et — pour le Ragnarök
// (gr 11) — l'héritage acquis. La condition n'a PAS besoin d'être vraie à l'instant :
// une fois latchée dans grRevealed, le sceau reste réclamable à vie.
export function isGrandResetMilestoneClaimable(gr) {
  if (isGrandResetMilestoneClaimed(gr)) return false;
  if (gr === 11 && !state.ragnarokHeritage) return false;
  return Boolean(state.grRevealed && state.grRevealed[gr]);
}

// Nombre de sceaux réclamables tout de suite (badge/plateau).
export function claimableGrandResetCount() {
  return GRAND_RESET_MILESTONES.filter((m) => isGrandResetMilestoneClaimable(m.gr)).length;
}

// Sceaux effectivement réclamables parmi ceux DEMANDÉS. `gr` accepte un numéro
// ou une liste (le joueur peut cocher plusieurs sceaux prêts et les réclamer
// dans un seul reset). Dédoublonne, jette les inconnus et les non réclamables,
// ordonne par numéro : le lot suit l'ordre des sceaux, pas celui des clics.
export function selectClaimableSeals(gr) {
  const asked = Array.isArray(gr) ? gr : [gr];
  return [...new Set(asked.map(Number))]
    .filter((n) => grandResetMilestone(n) && isGrandResetMilestoneClaimable(n))
    .sort((a, b) => a - b);
}

// Latch de découverte : appelé au tick. LATCHE TOUS les sceaux dont la condition est
// atteinte (plus seulement « le suivant » — le système est ordre-libre). Chaque sceau
// gravé reste réclamable même si le signal sous-jacent retombe (banking). Retourne l'id
// du 1er sceau fraîchement découvert ce tick (retour visuel), ou null.
export function refreshGrandResetReveal() {
  if (!state.grRevealed) state.grRevealed = {};
  let firstNew = null;
  for (const m of GRAND_RESET_MILESTONES) {
    if (state.grRevealed[m.gr]) continue;
    if (m.check()) {
      state.grRevealed[m.gr] = true;
      // Registre de la Chronique : horodatage (horloge à vie), une seule fois.
      recordGrDiscovered(m.gr);
      if (firstNew === null) firstNew = m.id;
    }
  }
  return firstNew;
}
