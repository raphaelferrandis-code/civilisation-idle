"use strict";

import { state } from '../state.js';
import { currentEraIndex } from '../mechanics.js';
import { eras } from '../../data/world.js';
import { fmt } from '../utils.js';

export function log(message) {
  state.history = [...(state.history || []), message].slice(-48);
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
      chronicle(`Les premiers ${building.name.toLowerCase()} offrent leurs services et se joignent à notre destinée (+${fmt(amount)}).`);
    } else {
      chronicle(`Les premiers ${building.name.toLowerCase()} s'élèvent dans nos quartiers (+${fmt(amount)}).`);
    }
  } else if (amount >= 25 || newCount % 25 === 0) {
    if (building.id === "watch") {
      chronicle(`La milice s'étend et compte désormais de nombreuses garnisons (${fmt(newCount)} unités, +${fmt(amount)}).`);
    } else if (building.id === "bureaucracy") {
      chronicle(`L'administration de la cité s'alourdit, comptant plus de fonctionnaires (${fmt(newCount)} unités, +${fmt(amount)}).`);
    } else if (["foragers", "storytellers", "scribes", "ruin_architects"].includes(building.id)) {
      chronicle(`Notre corporation de ${building.name.toLowerCase()} s'agrandit pour atteindre ${fmt(newCount)} membres (+${fmt(amount)}).`);
    } else {
      chronicle(`Le nombre de ${building.name.toLowerCase()} construits atteint désormais ${fmt(newCount)} édifices (+${fmt(amount)}).`);
    }
  }
}

export function resetCyclePeaks() {
  state.cyclePeaks = {
    population: state.population,
    knowledge: state.knowledge,
    infrastructure: state.infrastructure,
    eraIndex: currentEraIndex()
  };
}
