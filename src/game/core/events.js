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

import { completeCollapse, promptActiveRuinsForNewCycle } from './actions.js';
import { requestChoiceDialog } from './choiceDialog.js';

import { eras } from '../data/world.js';
import { dynastyNames } from '../data/buildings.js';
import {
  EPITAPH_LEGACIES,
  describeEpitaphLegacy,
  epitaphRuinMultiplier
} from '../data/epitaphs.js';
import { fmt } from './utils.js';
import { D } from './num.js';

export function openChoiceDialog({ title, body, options, mourning = false, variant = "", preventClose = false }) {
  return requestChoiceDialog({ title, body, options, mourning, variant, preventClose });
}

export function collapseCause() {
  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const inequalityWithoutInfra = D(state.gold).gt(D(state.infrastructure).mul(400).add(D(state.population).mul(0.7)).max(500));
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
  const cause = collapseCause();
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const riteBonus = has("rituel_effondrement") ? 1.25 : 1;
  const gainBase = D(gain).mul(riteBonus).round();
  const options = EPITAPH_LEGACIES.map((legacy) => {
    const ruinGain = gainBase.mul(epitaphRuinMultiplier(legacy, cause)).round();
    return {
      label: legacy.label,
      detail: `${fmt(ruinGain)} ruines. ${describeEpitaphLegacy(legacy, cause)}`,
      ruinGain,
      epitaphLegacyId: legacy.id
    };
  });

  const choice = await openChoiceDialog({
    title: `Chute de ${fallenDynasty}`,
    body: `${epitaph}\n\nLes survivants ne choisissent plus seulement combien sauver, mais ce que la prochaine civilisation devra retenir.`,
    mourning: true,
    preventClose: true,
    options
  });
  const chosenLegacy = EPITAPH_LEGACIES.find((legacy) => legacy.id === choice.epitaphLegacyId) || EPITAPH_LEGACIES[0];
  state.nextEpitaphLegacy = {
    id: chosenLegacy.id,
    cause,
    chosenCycle: state.cycles || 0,
    startedAt: Date.now()
  };
  const finalGain = choice.ruinGain ?? gainBase.mul(epitaphRuinMultiplier(chosenLegacy, cause)).round();

  completeCollapse(finalGain, fallenDynasty, epitaph, reason);
  setCollapseInProgress(false);
  await promptActiveRuinsForNewCycle();
  setMourning(false);
  setGamePaused(false);
  save();
  openView("city");
  render();
}
