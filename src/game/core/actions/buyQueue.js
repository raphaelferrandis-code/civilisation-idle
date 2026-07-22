// FILE D'ACHATS PLANIFIÉE (C8). Viser un bâtiment cher, c'est aujourd'hui
// surveiller un compteur : revenir toutes les trente secondes voir si la somme
// est là. La décision est intéressante, la surveillance ne l'est pas. Épingler
// une cible met le jeu au travail — il achète dès que c'est finançable, dans
// l'ordre choisi. Le joueur garde la décision, il perd la ronde.
"use strict";

import { state, buildingById, invalidateRenderCache, BUY_QUEUE_MAX } from '../state.js';
import { isUnlocked } from '../mechanics.js';
import { maxBuyAmount, stepBuyAmount } from '../mechanics/cost.js';
import { isMythEffectActive } from '../../data/myths.js';
import { clamp } from '../utils.js';
import { MAX_BATCH_AMOUNT } from '../balance.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { tr } from '../i18n.js';
import { buyBuildingCore, buyableInMass } from './building.js';

// Le normalizeur de save vit dans state.js, avec les autres : state.js ne peut
// pas importer ce module sans créer un cycle (il est la racine de tout).

// Quantité épinglée, résolue AU MOMENT DE L'ÉPINGLE et figée ensuite. Un mode
// « Max » ou « Palier » gardé vivant ferait acheter, des minutes plus tard, une
// quantité que le joueur n'a jamais vue — la file promet ce qui était écrit sur
// le bouton quand il a cliqué.
export function pinAmountFor(building) {
  const raw = state.buyAmount === "max" ? maxBuyAmount(building)
    : state.buyAmount === "step" ? stepBuyAmount(building)
      : Number(state.buyAmount) || 1;
  return clamp(Math.floor(raw), 1, MAX_BATCH_AMOUNT);
}

export function buyQueue() {
  if (!Array.isArray(state.buyQueue)) state.buyQueue = [];
  return state.buyQueue;
}

// Rang dans la file (1 = prochain achat), 0 si absent.
export function queuePositionOf(id) {
  return buyQueue().findIndex((e) => e.id === id) + 1;
}

// Épinglable ? On réutilise TELLE QUELLE la garde de l'achat de masse : elle
// écarte déjà tout ce qui coûte des Ruines, monnaie de l'arbre permanent, qu'un
// achat automatique ne doit jamais ponctionner.
export function canQueue(building) {
  return !!building && buyableInMass(building);
}

// Épingle / dépingle. Renvoie { queued, full } : `full` dit pourquoi rien ne
// s'est passé, sinon un clic sans effet se lit comme un bouton cassé.
export function toggleBuyQueue(id) {
  const building = buildingById[id];
  if (!canQueue(building)) return { queued: false };
  const q = buyQueue();
  const at = q.findIndex((e) => e.id === id);
  if (at >= 0) {
    q.splice(at, 1);
    invalidateRenderCache("buildings");
    return { queued: false };
  }
  if (q.length >= BUY_QUEUE_MAX) return { queued: false, full: true };
  q.push({ id, amount: pinAmountFor(building) });
  invalidateRenderCache("buildings");
  return { queued: true };
}

export function clearBuyQueue() {
  if (!buyQueue().length) return;
  state.buyQueue = [];
  invalidateRenderCache("buildings");
}

// Résolution : UNE entrée par tick, et seulement la TÊTE. Balayer toute la file
// laisserait la troisième cible, bon marché, se servir en boucle pendant que la
// première, chère, n'accumule jamais rien — l'ordre choisi ne serait plus qu'un
// affichage. Renvoie true si la file a bougé (achat ou entrée périmée).
export function resolveBuyQueue() {
  const q = buyQueue();
  if (!q.length) return false;

  // SISYPHE : bâtir pendant la montée LÂCHE le rocher (building.js). Une file
  // qui achète toute seule ferait perdre au joueur une ascension qu'il pousse à
  // la main, sans qu'il ait rien fait. Au pied (cran 0), on construit librement :
  // c'est le rythme voulu du défi, la file peut donc y travailler.
  if (isMythEffectActive("mythe_de_sisyphe") && (state.sisypheCran || 0) > 0) return false;

  const head = q[0];
  const building = buildingById[head.id];
  // Cible périmée (bâtiment disparu d'un import, verrouillé par un nouveau
  // cycle) : on la retire au lieu de bloquer la file derrière elle à jamais.
  if (!building || !isUnlocked(building)) {
    q.shift();
    invalidateRenderCache("buildings");
    return true;
  }

  // PAS de `silent` malgré la fiche : il coupe aussi la fête de jalon, donc le
  // paiement de l'amélioration « Fêtes de jalon » que le joueur a payée. Un
  // achat par la file doit rapporter exactement ce que rapporte le même achat
  // fait à la main. Le verrou de Babel est déjà appliqué là-dedans : on ne le
  // rejoue pas, on se contente de ne pas boucler sur son refus.
  if (!buyBuildingCore(head.id, { amount: head.amount })) return false;

  q.shift();
  pushOutcomeFloat({
    label: tr({
      fr: `📌 ${tr(building.name)} ×${head.amount}`,
      en: `📌 ${tr(building.name)} ×${head.amount}`
    }),
    kind: "gain"
  });
  invalidateRenderCache("buildings");
  return true;
}
