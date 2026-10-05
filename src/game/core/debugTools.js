"use strict";

// OUTILS DE TRICHE du menu « Mode debug » (DebugDialog.jsx). Ils vivaient dans
// main.js, que tout le jeu importe : ils partaient donc dans le build livré aux
// joueurs, avec le menu qui les appelle (audit du 2026-10-05, DEV-1). Seul
// DebugDialog les importe désormais, et App.jsx ne charge DebugDialog qu'en dev
// (import.meta.env.DEV) : Vite retire ce module du bundle de production.
// ⚠ Ne rien importer d'ici ailleurs que dans DebugDialog.

import { state, render } from './state.js';
import { has, isUnlocked } from './mechanics.js';
import { log } from './actions.js';
import { D } from './num.js';
import { fmt } from './utils.js';
import { upgrades } from '../data/upgrades.js';

export function addDebugRuins(amount) {
  state.ruins = D(state.ruins).add(amount);
  state.cycles = Math.max(state.cycles, 1);
  log(`Debug: +${fmt(amount)} ruines ajoutees.`);
  render();
}

export function addDebugCycles(amount) {
  state.cycles += amount;
  log(`Debug: ${fmt(amount)} cycles ajoutes.`);
  render();
}

export function addDebugResources() {
  state.population = D(state.population).max(1000000);
  state.food = D(state.food).max(10000000000);
  state.gold = D(state.gold).max(10000000000);
  state.knowledge = D(state.knowledge).max(1000000000);
  state.infrastructure = D(state.infrastructure).max(1000000);
  log("Debug: ressources late game injectees.");
  render();
}

export function addDebugFaveur(amount) {
  state.faveur = (state.faveur || 0) + amount;
  log(`Debug: +${fmt(amount)} faveur ajoutee.`);
  render();
}

export function debugBuyEarlyRuins() {
  const affordable = upgrades
    .filter((upgrade) => upgrade.group === "ruins" && upgrade.cost.ruins <= 10000)
    .sort((a, b) => a.cost.ruins - b.cost.ruins);

  for (const upgrade of affordable) {
    const costRuins = upgrade.cost.ruins || 0;
    if (has(upgrade.id) || D(state.ruins).lt(costRuins) || !isUnlocked(upgrade)) continue;
    state.ruins = D(state.ruins).sub(costRuins);
    state.upgrades[upgrade.id] = true;
  }
  log("Debug: achats de ruines de debut appliques quand possible.");
  render();
}
