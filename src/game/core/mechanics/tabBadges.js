"use strict";
// PASTILLES D'ATTENTION SUR LES ONGLETS (B10). Le joueur ouvrait les onglets
// « pour vérifier », et ratait quand même un sceau prêt pendant des heures.
//
// CE QUI EST BADGÉ, ET SURTOUT CE QUI NE L'EST PAS. La fiche proposait aussi les
// nœuds de ruines abordables et les marchandises payables ; les deux ont été
// écartés après mesure, parce qu'ils allument la pastille EN PERMANENCE :
//   - un nœud passe « available » dès que les Ruines suffisent, or en milieu de
//     partie plusieurs le sont en continu et le joueur épargne VOLONTAIREMENT
//     pour un capstone — la pastille lui reprocherait sa stratégie ;
//   - la Bénédiction de la Boutique de Faveur est un consommable RACHETABLE :
//     dès qu'il reste de la Faveur, elle ne s'éteint plus ;
//   - le Comptoir dérive de rates(), donc sa valeur bougerait à chaque seconde.
// Ne restent que les deux choses qui sont GRATUITES ou DUES, et qu'on ne peut
// que perdre à ignorer. C'est la règle que la fiche pose elle-même dans son
// paragraphe Risque, appliquée à la lettre.
import { PRESTIGE_DOGMAS } from '../../data/upgrades.js';
import { checkDogmaAvailability } from './upgrades.js';
import { claimableGrandResetCount } from './grandResetMilestones.js';
import { crisisOpen } from './shared.js';

// Dogmes gratuits en attente de choix. On compte les DÉCISIONS, pas les entrées :
// les dogmes vont par paires exclusives (conflictsWith), donc deux disponibles au
// même palier de la même branche valent « un choix à faire », pas deux gains.
export function freeDogmaChoiceCount() {
  const prets = PRESTIGE_DOGMAS.filter((d) => checkDogmaAvailability(d.id) === "available");
  return new Set(prets.map((d) => `${d.branch}:${d.requiredPurchases}`)).size;
}

// { [tabId]: nombre }. Vide pendant une crise ouverte : les onglets sont
// verrouillés, et l'échelle des sceaux n'est même pas rendue à ce moment-là
// (PrestigeView la masque sur crisisOpen, pas sur crisisLimitAnnounced) — une
// pastille y enverrait le joueur sur un écran sans son objet.
export function tabBadgeCounts() {
  if (crisisOpen()) return {};
  const counts = {};
  const sceaux = claimableGrandResetCount();
  if (sceaux > 0) counts.prestige = sceaux;
  const dogmes = freeDogmaChoiceCount();
  if (dogmes > 0) counts.ruinsView = dogmes;
  return counts;
}

// Signature COMPACTE pour l'abonnement React. Une chaîne et non un objet : la
// sidebar ne se re-rend presque jamais (tous ses sélecteurs rendent des valeurs
// quasi constantes), donc l'abonnement est ce qui fait vivre la pastille — pas
// une optimisation. Une chaîne se compare par identité, sans risque d'y glisser
// une valeur non primitive qui casserait le court-circuit.
export function tabBadgeSignature() {
  const counts = tabBadgeCounts();
  return Object.keys(counts).sort().map((k) => `${k}:${counts[k]}`).join("|");
}

export function parseTabBadges(signature) {
  const counts = {};
  if (!signature) return counts;
  for (const part of signature.split("|")) {
    const [id, n] = part.split(":");
    counts[id] = Number(n);
  }
  return counts;
}
