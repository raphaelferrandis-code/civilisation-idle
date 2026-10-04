"use strict";

// LE RANG DE LA MAISON — lot 2 des gains « vrai casino » (2026-10-04,
// docs/PLAN-GAINS-CASINO.md). Comme un vrai casino, la Maison note ce que chaque
// joueur lui rapporte EN THÉORIE (mise × avantage de la Maison) : sa RÉPUTATION. Elle
// lui ouvre ses salles à mesure : chaque titre multiplie par 10 la limite haute des
// tables (actions/maisonTable.js) et offre ses cadeaux (artefacts, automatisations,
// vols offerts), qui ne s'achètent plus.
//
// La réputation est comptée en HEURES DE RECETTES au moment de la mise : à toute ère,
// le même effort de jeu fait le même chemin. Elle ne se perd jamais (effondrement,
// Grand Reset), le titre non plus (state.maisonRank, le plus haut atteint). Les
// cadeaux sont donnés UNE fois, à l'entrée dans le titre ; ce qu'on possédait déjà
// (acheté avant le lot 2, remboursé par la migration 5 → 6) reste à soi.
//
// Seuils, multiplicateurs et cadeaux : MAISON_RANKS (balance.js).

import { state, defaultTempleAuto, isNotifyPaused } from '../state.js';
import { MAISON_RANKS, RANK_GIFT_AUTOS } from '../balance.js';
import { ARTIFACT_NODES, RANK_OF_GIFT } from '../../data/artifacts.js';
import { recettesPerHour, tableLimits, maisonRank } from './maisonTable.js';
import { grantFreeFlight } from './templeFlights.js';
import { chronicle } from './utils.js';
import { fmt } from '../utils.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';

export { maisonRank };

export const RANK_LABELS = {
  habitue: { fr: "Habitué", en: "Regular" },
  familier: { fr: "Familier", en: "Familiar face" },
  notable: { fr: "Notable", en: "Notable" },
  mecene: { fr: "Mécène", en: "Patron" },
  prince: { fr: "Prince de la Maison", en: "Prince of the House" }
};

// Les cadeaux d'un titre, par id de nœud de l'arbre : { colombier: 1, … } (l'index
// du titre qui les offre — data/artifacts.js, partagé avec la Boutique).
export { RANK_OF_GIFT };

export function maisonReputation() {
  const r = Number(state.maisonReputation);
  return Number.isFinite(r) && r > 0 ? r : 0;
}

// Le titre que vaut une réputation (en heures de recettes).
export function rankForReputation(hours) {
  let r = 0;
  for (let i = 1; i < MAISON_RANKS.length; i += 1) {
    if (hours >= MAISON_RANKS[i].threshold) r = i;
  }
  return r;
}

// Où en est le joueur : son titre, le suivant, et la part du chemin parcourue entre
// les deux (1 au dernier titre).
export function rankProgress() {
  const rank = maisonRank();
  const reputation = maisonReputation();
  const next = rank + 1 < MAISON_RANKS.length ? rank + 1 : null;
  const from = MAISON_RANKS[rank].threshold;
  const to = next == null ? null : MAISON_RANKS[next].threshold;
  const frac = next == null ? 1 : Math.max(0, Math.min(1, (reputation - from) / Math.max(1e-9, to - from)));
  return {
    rank, id: MAISON_RANKS[rank].id, mult: MAISON_RANKS[rank].mult,
    next, nextId: next == null ? null : MAISON_RANKS[next].id,
    reputation, from, to, frac
  };
}

// Une mise PAYÉE à une table : la Maison en note l'avantage (la perte théorique), en
// heures de recettes, et ouvre le titre suivant s'il est atteint. `rtp` = le retour
// de la ligne de jeu (celui qui nourrit la cagnotte). Les coups offerts passent 0.
// Rend les heures ajoutées.
export function recordWager(stake, rtp) {
  const s = Number(stake);
  const edge = 1 - Number(rtp);
  if (!(s > 0) || !(edge > 0)) return 0;
  const hours = (s * edge) / Math.max(1e-9, recettesPerHour());
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  state.maisonReputation = maisonReputation() + hours;
  promoteRank();
  return hours;
}

// Monte au titre que vaut la réputation, un à un : chaque titre donne ses cadeaux.
export function promoteRank() {
  const target = rankForReputation(maisonReputation());
  let promoted = 0;
  while (maisonRank() < target) {
    const r = maisonRank() + 1;
    state.maisonRank = r;
    announceRank(r, grantRankGifts(r));
    promoted += 1;
  }
  return promoted;
}

// Les cadeaux d'un titre. Le colombier passe avant les vols : il agrandit leur file.
// Les vols portent la limite de la salle commune. Depuis le 2026-10-04 (« comme les
// applis de casino »), le titre offre aussi une BOURSE : `faveurH` heures de recettes
// au moment du passage. Rend ce qui a été réellement donné (ce qu'on avait déjà ne se
// redonne pas).
export function grantRankGifts(r) {
  const rk = MAISON_RANKS[r];
  if (!rk) return { gifts: [], flights: 0, amount: 0, faveur: 0 };
  const gifts = rk.gifts.filter((id) => giveGift(id));
  const amount = tableLimits().base;
  let flights = 0;
  for (let i = 0; i < (rk.flights || 0); i += 1) {
    if (grantFreeFlight(amount)) flights += 1;
  }
  const faveur = Math.round((rk.faveurH || 0) * recettesPerHour());
  if (faveur > 0) state.faveur = (state.faveur || 0) + faveur;
  return { gifts, flights, amount, faveur };
}

function giveGift(id) {
  const game = RANK_GIFT_AUTOS[id];
  if (game) {
    if (!state.templeAuto) state.templeAuto = defaultTempleAuto();
    const g = state.templeAuto[game];
    if (!g || g.unlocked) return false;
    g.unlocked = true;
    // Offerte À L'ARRÊT : elle jouerait sinon sans qu'on l'ait réglée. On la met en
    // route (et on la règle) depuis la Boutique ou sa flamme du menu.
    g.on = false;
    return true;
  }
  if (!state.templeArtifacts || typeof state.templeArtifacts !== "object") state.templeArtifacts = {};
  if (state.templeArtifacts[id]) return false;
  state.templeArtifacts[id] = true;
  return true;
}

function announceRank(r, given) {
  const rk = MAISON_RANKS[r];
  const label = RANK_LABELS[rk.id].fr;
  const parts = [`les tables montent à ×${rk.mult.toLocaleString("fr-FR")}`];
  if (given.faveur > 0) parts.push(`elle te verse ${fmt(given.faveur)} faveur`);
  const names = given.gifts.map((id) => (ARTIFACT_NODES[id] ? ARTIFACT_NODES[id].label.fr : id));
  if (names.length) parts.push(`elle t'offre ${names.join(", ")}`);
  if (given.flights > 0) parts.push(`${given.flights} vol${given.flights > 1 ? "s" : ""} d'Icare`);
  chronicle(`La Maison des Plaisirs t'élève au rang de ${label} : ${parts.join(" ; ")}.`);
  if (!isNotifyPaused()) pushOutcomeFloat({ label: given.faveur > 0 ? `🎖 ${label} : +${fmt(given.faveur)} faveur` : `🎖 ${label}`, kind: "gain" });
}
