"use strict";

// L'Intendance (onglet Régulation) — délégation configurable de la régulation :
// « si la Rupture dépasse X % → lancer telle action d'apaisement ». Chaque
// consigne occupe un SLOT gaté par la progression (ère IV, puis 1 mythe), et
// l'intendance clique COMME LE JOUEUR : mêmes coûts croissants (actionScale),
// même fatigue partagée — elle n'agit jamais sur la CIBLE de Rupture, donc
// l'anti-immortalité est intact (c'est un lisseur de micro-gestion, pas un
// bouclier). Garde-fous anti-verrou, sur le modèle de protocoles_urgence :
// cooldown par consigne + mise en veille quand l'administration est fatiguée.
//
// Les consignes sont de la DOCTRINE : persistées et conservées d'un cycle à
// l'autre (comme crisisDoctrine), contrairement aux politiques actives.

import { state, save, render } from '../state.js';
import {
  crisisCosts,
  crisisOpen,
  regulationContext,
  regulationActionUnlocked
} from '../mechanics.js';
import { canPayCost } from '../utils.js';
import { REGULATION_ACTIONS_BY_ID } from '../../data/regulationActions.js';
import {
  STEWARD_MAX_CLAUSES,
  STEWARD_COOLDOWN_MS,
  STEWARD_FATIGUE_GATE,
  STEWARD_THRESHOLDS
} from '../balance.js';
import { runCrisisAction } from './crisis.js';

// Slots de consigne : chacun se « constitue » à un jalon de progression.
export const STEWARD_SLOT_UNLOCKS = [
  { unlock: (c) => c.bestEra >= 4, unlockLabel: { fr: "Ère IV", en: "Era IV" } },
  { unlock: (c) => c.mythCount >= 1, unlockLabel: { fr: "1 mythe", en: "1 myth" } }
];

export function stewardSlotCount(ctx = regulationContext()) {
  let n = 0;
  for (const slot of STEWARD_SLOT_UNLOCKS) if (slot.unlock(ctx)) n++;
  return Math.min(STEWARD_MAX_CLAUSES, n);
}

// Actions déléguables : les APAISEMENTS seulement — jamais les paris (le risque
// ne se délègue pas) ni les réformes (choix lourd du joueur). Les libellés des
// actions de base vivent ici (partagés StewardPanel/Registre — CrisisActionBar
// garde les siens inline, historiques).
export const BASE_ACTION_LABELS = {
  rationing: { fr: "Rationner", en: "Ration" },
  festivals: { fr: "Jeux civiques", en: "Civic Games" },
  census: { fr: "Recenser", en: "Census" },
  reforms: { fr: "Réformes", en: "Reforms" },
  archiveCrisis: { fr: "Catastrophes", en: "Catastrophes" },
  ancestorCrisis: { fr: "Culte des ancêtres", en: "Ancestor Cult" }
};

const BASE_SOOTHE_IDS = ["rationing", "festivals", "census", "reforms", "archiveCrisis", "ancestorCrisis"];

export function stewardActionAllowed(id, ctx = regulationContext()) {
  if (BASE_SOOTHE_IDS.includes(id)) {
    if (id === "archiveCrisis") return (state.cycles || 0) >= 2;
    if (id === "ancestorCrisis") return (state.cycles || 0) >= 3;
    return true;
  }
  const a = REGULATION_ACTIONS_BY_ID[id];
  return Boolean(a && a.kind === "soothe" && regulationActionUnlocked(id, ctx));
}

// Choix offerts au sélecteur du panneau (ids ; l'UI résout labels/verrous).
export function stewardActionChoices(ctx = regulationContext()) {
  const registry = Object.values(REGULATION_ACTIONS_BY_ID)
    .filter((a) => a.kind === "soothe" && regulationActionUnlocked(a.id, ctx))
    .map((a) => a.id);
  return [...BASE_SOOTHE_IDS.filter((id) => stewardActionAllowed(id, ctx)), ...registry];
}

// Magistrat signataire d'un slot : stable sur le cycle (change à chaque
// civilisation — nouvelle administration). Pur flavor, aucune mécanique.
const MAGISTRATE_NAMES = ["Édith", "Cassia", "Théron", "Livia", "Philéas", "Irène", "Sabina", "Ovide", "Héro", "Cadmée"];
export function stewardMagistrate(slot) {
  return MAGISTRATE_NAMES[(((state.cycles || 0) + slot * 3) % MAGISTRATE_NAMES.length + MAGISTRATE_NAMES.length) % MAGISTRATE_NAMES.length];
}

// Édition d'une consigne depuis le panneau. `enabled` exige une action choisie.
export function setStewardClause(slot, patch = {}) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= STEWARD_MAX_CLAUSES) return;
  const ctx = regulationContext();
  if (slot >= stewardSlotCount(ctx)) return; // slot pas encore constitué
  const clauses = state.stewardClauses || (state.stewardClauses = []);
  while (clauses.length <= slot) clauses.push({ threshold: 0.65, actionId: null, enabled: false, lastAt: 0 });
  const c = clauses[slot];
  if (patch.threshold != null && STEWARD_THRESHOLDS.includes(patch.threshold)) c.threshold = patch.threshold;
  if ("actionId" in patch) {
    c.actionId = patch.actionId && stewardActionAllowed(patch.actionId, ctx) ? patch.actionId : null;
    if (!c.actionId) c.enabled = false;
  }
  if ("enabled" in patch) c.enabled = Boolean(patch.enabled) && Boolean(c.actionId);
  save();
  render();
}

// Évaluation au tick (1 Hz). Une seule intervention par tick : l'intendance
// n'est pas une mitrailleuse, et le cooldown par consigne espace le reste.
export function tickSteward() {
  const clauses = state.stewardClauses;
  if (!Array.isArray(clauses) || !clauses.length) return;
  if (state.crisisLimitAnnounced || crisisOpen()) return; // la crise terminale a ses propres leviers
  if ((state.regulFatigue || 0) > STEWARD_FATIGUE_GATE) return; // l'administration souffle
  const ctx = regulationContext();
  const slots = stewardSlotCount(ctx);
  const now = Date.now();
  const costs = crisisCosts();
  for (let i = 0; i < Math.min(clauses.length, slots); i++) {
    const c = clauses[i];
    if (!c || !c.enabled || !c.actionId) continue;
    if (state.instability < (c.threshold || 0.65)) continue;
    if (now - (c.lastAt || 0) < STEWARD_COOLDOWN_MS) continue;
    if (!stewardActionAllowed(c.actionId, ctx)) continue;
    const cost = costs[c.actionId];
    if (!cost || !canPayCost(cost)) continue;
    c.lastAt = now;
    runCrisisAction(c.actionId, { render: false, by: stewardMagistrate(i) });
    return;
  }
}
