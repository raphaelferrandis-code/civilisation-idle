"use strict";

import {
  state,
  setGamePaused,
  setCollapseInProgress,
  setMourning,
  openView,
  render,
  save
} from './state.js';

import {
  cityVitals,
  pressureBreakdown,
  currentEraIndex,
  has
} from './mechanics.js';

import { completeCollapse } from './actions.js';
import { requestChoiceDialog } from './choiceDialog.js';

import { eras } from '../data/world.js';
import { dynastyNames } from '../data/buildings.js';
import { fmt } from './utils.js';

export function openChoiceDialog({ title, body, options, mourning = false, variant = "", preventClose = false }) {
  return requestChoiceDialog({ title, body, options, mourning, variant, preventClose });
}

export function collapseCause() {
  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const inequalityWithoutInfra = state.gold > Math.max(500, state.infrastructure * 400 + state.population * 0.7);
  if ((state.timeWear || 0) >= 1) return "time";
  if (vitals.foodScore < 0.16 || pressure.scarcity >= pressure.inequality && pressure.scarcity >= pressure.complexity) return "famine";
  if (inequalityWithoutInfra || pressure.inequality > Math.max(pressure.scarcity, pressure.complexity, pressure.structural)) return "avarice";
  return "rupture";
}

export function generateEpitaph() {
  const era = eras[currentEraIndex()].name;
  const cause = collapseCause();
  if (cause === "time") {
    return "Le temps a efface ses fondations. Elle s'eteignit doucement, oubliee par l'histoire.";
  }
  if (cause === "famine") {
    return `Ici s'arrete l'Age ${era}. Detruite par ses propres famines, elle ne laissa que des poteries brisees.`;
  }
  if (cause === "avarice") {
    return `Ici s'arrete l'Age ${era}. Detruite par l'avarice de ses elites, son opulence fut ensevelie sous les sables.`;
  }
  return `Ici s'arrete l'Age ${era}. Trop vaste pour se gouverner, elle confondit sa grandeur avec une promesse d'eternite.`;
}

export async function runCollapseSequence(gain, reason) {
  setMourning(true);
  const dynastyIndex = state.dynastyCount % dynastyNames.length;
  const fallenDynasty = dynastyNames[dynastyIndex];
  const epitaph = generateEpitaph();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  // "Rite de Passage" : +25% ruines de base à chaque effondrement
  const riteBonus = has("rituel_effondrement") ? 1.25 : 1;
  const gainBase    = Math.round(gain * riteBonus);
  const gainPrepare = Math.round(gainBase * 1.2);
  // "Rite de Passage" : sélectionne auto "Préparer la chute" (le dialogue s'ouvre quand même)
  let finalGain;
  if (has("rituel_effondrement")) {
    // Auto-selection visible : on affiche le dialogue avec indication que c'est automatique
    const choice = await openChoiceDialog({
      title: `Chute de ${fallenDynasty}`,
      body: `${epitaph}\n\nLes survivants rassemblent des ruines. Que faire ?`,
      mourning: true,
      preventClose: true,
      options: [
        { label: "Effondrement", detail: `Accepter la chute. ${fmt(gainBase)} ruines (+25% Rite).`, ruinGain: gainBase },
        { label: "Preparer la chute", detail: `Organiser le repli. ${fmt(gainPrepare)} ruines (+25% +20%). Rite actif.`, ruinGain: gainPrepare }
      ]
    });
    finalGain = choice.ruinGain ?? gainPrepare;
  } else {
    const choice = await openChoiceDialog({
      title: `Chute de ${fallenDynasty}`,
      body: `${epitaph}\n\nLes survivants rassemblent des ruines. Que faire ?`,
      mourning: true,
      preventClose: true,
      options: [
        { label: "Effondrement", detail: `Accepter la chute. ${fmt(gainBase)} ruines recoltees.`, ruinGain: gainBase },
        { label: "Preparer la chute", detail: `Organiser le repli, preserver l'essentiel. ${fmt(gainPrepare)} ruines (+20%).`, ruinGain: gainPrepare }
      ]
    });
    finalGain = choice.ruinGain ?? gainBase;
  }
  completeCollapse(finalGain, fallenDynasty, epitaph, reason);
  setMourning(false);
  setCollapseInProgress(false);
  setGamePaused(false);
  save();
  openView("city");
  render();
}
