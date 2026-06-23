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
  EPITAPH_LEGACY_DURATION_MS,
  FAVORED_CAUSE_LABELS,
  epitaphLegacyChips,
  epitaphRuinMultiplier
} from '../data/epitaphs.js';
import { fmt } from './utils.js';
import { D } from './num.js';

export function openChoiceDialog({ title, body, options, mourning = false, variant = "", preventClose = false, footnote = "" }) {
  return requestChoiceDialog({ title, body, options, mourning, variant, preventClose, footnote });
}

export function collapseCause() {
  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const inequalityWithoutInfra = D(state.gold).gt(D(state.infrastructure).mul(400).add(D(state.population).mul(0.7)).max(500));
  if ((state.timeWear || 0) >= 1) return "time";
  if (vitals.foodScore < 0.16 || (pressure.scarcity >= pressure.inequality && pressure.scarcity >= pressure.complexity)) return "famine";
  if (inequalityWithoutInfra || pressure.inequality > Math.max(pressure.scarcity, pressure.complexity, pressure.structural)) return "avarice";
  return "rupture";
}

export function generateEpitaph() {
  const era = eras[currentEraIndex()].name;
  const cause = collapseCause();
  if (cause === "time") {
    return "Le temps a effacé ses fondations. Elle s'éteignit doucement, oubliée par l'histoire.";
  }
  if (cause === "famine") {
    return `Ici s'arrête l'Âge ${era}. Détruite par ses propres famines, elle ne laissa que des poteries brisées.`;
  }
  if (cause === "avarice") {
    return `Ici s'arrête l'Âge ${era}. Détruite par l'avarice de ses élites, son opulence fut ensevelie sous les sables.`;
  }
  return `Ici s'arrête l'Âge ${era}. Trop vaste pour se gouverner, elle confondit sa grandeur avec une promesse d'éternité.`;
}

// INVARIANT DE SAUVEGARDE (revue 0.4 §1.3) — NE PAS CASSER : aucune mutation d'état
// survivant à un rechargement ne doit avoir lieu AVANT la résolution du dialogue
// d'épitaphe (`await openChoiceDialog`). La seule mutation autorisée avant est
// `setMourning(true)`, neutralisée par hydrateState (qui force `mourning: false`).
// Conséquence : un F5 pendant le deuil OU le dialogue recharge l'état pré-effondrement
// — la crise est re-proposée et le gain recalculé, jamais une sauvegarde à moitié
// effondrée. Toutes les mutations persistées (`nextEpitaphLegacy`, `completeCollapse`)
// arrivent APRÈS l'await. Défendu par collapse.persistence.test.js : déplacer une
// écriture d'état avant le dialogue fera échouer ce test.
export async function runCollapseSequence(gain, reason) {
  setMourning(true);
  const dynastyIndex = state.dynastyCount % dynastyNames.length;
  const fallenDynasty = dynastyNames[dynastyIndex];
  const epitaph = generateEpitaph();
  const cause = collapseCause();
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const riteBonus = has("rituel_effondrement") ? 1.25 : 1;
  const gainBase = D(gain).mul(riteBonus).round();
  const legacyMinutes = Math.round(EPITAPH_LEGACY_DURATION_MS / 60000);
  const options = EPITAPH_LEGACIES.map((legacy) => {
    const mult = epitaphRuinMultiplier(legacy, cause);
    const ruinGain = gainBase.mul(mult).round();
    const deltaPct = Math.round((mult - 1) * 100);
    const favored = legacy.favoredCause === cause;
    return {
      label: `${legacy.icon} ${legacy.label}`,
      headline: `+${fmt(ruinGain)} ruines`,
      delta: deltaPct
        ? { label: `${deltaPct > 0 ? "+" : "−"}${Math.abs(deltaPct)}% de ruines`, kind: deltaPct > 0 ? "gain" : "cost" }
        : null,
      effects: epitaphLegacyChips(legacy, cause),
      badge: favored ? `⚡ Affinité : ${FAVORED_CAUSE_LABELS[cause] || cause}` : null,
      highlight: favored,
      detail: legacy.tagline,
      ruinGain,
      epitaphLegacyId: legacy.id
    };
  });

  const choice = await openChoiceDialog({
    title: `Chute de ${fallenDynasty}`,
    body: `${epitaph}\n\nLes survivants ne choisissent plus seulement combien sauver, mais ce que la prochaine civilisation devra retenir.`,
    footnote: `Le legs gravé agit pendant les ${legacyMinutes} premières minutes du prochain cycle. L'affinité avec la cause de la chute renforce le legs correspondant.`,
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
