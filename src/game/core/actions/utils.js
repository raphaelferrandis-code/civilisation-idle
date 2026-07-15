"use strict";

import { state } from '../state.js';
import { currentEraIndex } from '../mechanics.js';
import { eras } from '../../data/world.js';
import { fmt } from '../utils.js';
import { tr } from '../i18n.js';
import { REGUL_LEDGER_MAX, FATIGUE_PER_ACTION } from '../balance.js';
import { pushAnnalsMark } from '../annals.js';

export function log(message) {
  state.history = [...(state.history || []), message].slice(-48);
}

// Registre des édits (onglet Régulation) : chaque acte de régulation y dépose
// une entrée FACTUELLE — id d'action, foyer, effet réellement appliqué — que
// l'UI résout en libellé (les données restent i18n-agnostiques). Persisté (cap
// REGUL_LEDGER_MAX), remis à zéro au cycle. Alimente aussi les marqueurs des
// annales (même geste, deux mémoires : courte = courbe, factuelle = registre).
// entry: { id, kind: soothe|reform|gambleWin|gambleLoss|policyOn|policyOff,
//          foyer?, delta? [0..1], by? (magistrat de l'Intendance) }
export function regulLedgerPush(entry) {
  const row = { t: Date.now(), ...entry };
  state.regulLedger = [...(state.regulLedger || []), row].slice(-REGUL_LEDGER_MAX);
  pushAnnalsMark(entry.kind, entry.id);
}

// Chaque acte de régulation fatigue l'administration (anti-spam) : la fatigue
// monte, redescend dans le tick, réduit l'efficacité et majore les coûts.
// Appelé par crisis.js (édits/réformes) UNIQUEMENT. NB : les PARIS (osselets /
// Icare / temple) NE fatiguent PLUS l'administration depuis le découplage — le
// temple est sa propre économie (d'où l'auto-jeu sans spirale de fatigue).
export function raiseRegulFatigue() {
  state.regulFatigue = Math.min(1, (state.regulFatigue || 0) + FATIGUE_PER_ACTION);
}

export function chronicle(message) {
  const year = cycleYear();
  const era = eras[currentEraIndex()].name;
  log(`An ${fmt(year)}, ${era}: ${message}`);
}

export function cycleYear() {
  const elapsed = Math.max(0, (Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
  return Math.floor(elapsed / 60) + 1;
}

export function chronicleBuilding(building, previousCount, newCount) {
  const amount = newCount - previousCount;
  if (amount <= 0) return;
  
  if (previousCount === 0) {
    if (building.id === "watch") {
      chronicle(`Une milice s'organise sous nos remparts pour assurer la sécurité commune (+${fmt(amount)}).`);
    } else if (building.id === "bureaucracy") {
      chronicle(`Une bureaucratie naissante commence à enregistrer nos lois et décrets (+${fmt(amount)}).`);
    } else if (["foragers", "storytellers", "scribes", "ruin_architects"].includes(building.id)) {
      chronicle(`Les premiers ${tr(building.name).toLowerCase()} offrent leurs services et se joignent à notre destinée (+${fmt(amount)}).`);
    } else {
      chronicle(`Les premiers ${tr(building.name).toLowerCase()} s'élèvent dans nos quartiers (+${fmt(amount)}).`);
    }
  } else if (amount >= 25 || newCount % 25 === 0) {
    if (building.id === "watch") {
      chronicle(`La milice s'étend et compte désormais de nombreuses garnisons (${fmt(newCount)} unités, +${fmt(amount)}).`);
    } else if (building.id === "bureaucracy") {
      chronicle(`L'administration de la cité s'alourdit, comptant plus de fonctionnaires (${fmt(newCount)} unités, +${fmt(amount)}).`);
    } else if (["foragers", "storytellers", "scribes", "ruin_architects"].includes(building.id)) {
      chronicle(`Notre corporation de ${tr(building.name).toLowerCase()} s'agrandit pour atteindre ${fmt(newCount)} membres (+${fmt(amount)}).`);
    } else {
      chronicle(`Le nombre de ${tr(building.name).toLowerCase()} construits atteint désormais ${fmt(newCount)} édifices (+${fmt(amount)}).`);
    }
  }
}

export function resetCyclePeaks() {
  state.cyclePeaks = {
    population: state.population,
    food: state.food,
    gold: state.gold,
    knowledge: state.knowledge,
    infrastructure: state.infrastructure,
    eraIndex: currentEraIndex()
  };
}
