"use strict";

import {
  state,
  defaultAutoScriptRules,
  defaultAutomateRules,
  AUTOMATE_FIELD_BOUNDS,
  invalidateRenderCache,
  render,
  save,
  saveSoon,
  isOfflineSim
} from '../state.js';

import {
  buildingCostAt,
  buildingBatchCost,
  isUnlocked,
  crisisCosts
} from '../mechanics.js';

import { buildings } from '../../data/buildings.js';
import { canPayCost, clamp } from '../utils.js';
import { buyBuildingCore, BUY_ALL_CURRENCIES } from './building.js';
import { tr } from '../i18n.js';
import { D } from '../num.js';
import { collapse, runCrisisAction } from './crisis.js';
import { log, chronicle } from './utils.js';

export function initAutoScriptRules() {
  state.autoScriptRules = defaultAutoScriptRules();
  return state.autoScriptRules;
}

export function getAutoScriptRules() {
  if (!state.autoScriptRules) initAutoScriptRules();
  return state.autoScriptRules;
}

export function toggleAutoScriptRule(id) {
  const rule = getAutoScriptRules().find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  save();
  invalidateRenderCache("all");
  render();
}

export function setAutoScriptThreshold(id, raw) {
  const rule = getAutoScriptRules().find((r) => r.id === id);
  if (!rule) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule.threshold = Math.max(1, Math.min(9999, val));
  save();
  render();
}

export function checkAutoScriptRules() {
  // Pendant la simulation hors-ligne, seul l'Édit effondre (chemin synchrone de
  // simulateAwayCrises) : collapse() y lancerait une séquence async qui pose
  // gamePaused et casse la boucle de sim (même garde que le Bûcher, tick.js).
  if (isOfflineSim()) return;
  for (const rule of getAutoScriptRules()) {
    if (!rule.enabled) continue;
    let triggered = false;
    if (rule.type === "rupture") triggered = state.instability * 100 >= rule.threshold;
    if (rule.type === "usure")   triggered = (state.timeWear || 0) * 100 >= rule.threshold;
    if (rule.type === "time") {
      const elapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
      triggered = elapsed >= rule.threshold;
    }
    if (triggered) {
      log(`Script : "${rule.label} ${rule.threshold}${rule.unit}", effondrement declenche.`);
      collapse("auto_script");
      return;
    }
  }
}

export function initAutomateRules() {
  state.automateRules = defaultAutomateRules();
  return state.automateRules;
}

export function getAutomateRules() {
  if (!state.automateRules) initAutomateRules();
  return state.automateRules;
}

export function toggleAutomate(id) {
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  save();
  invalidateRenderCache("all");
  render();
}

// Champ numérique d'un automate (réserve, débit). Bornes prises dans
// AUTOMATE_FIELD_BOUNDS, la MÊME table que l'hydratation : une valeur acceptée
// ici mais rejetée au rechargement serait un réglage qui s'évapore.
export function setAutomateField(id, field, raw) {
  const bounds = AUTOMATE_FIELD_BOUNDS[field];
  if (!bounds) return;
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule || !(field in rule)) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule[field] = clamp(Math.round(val), bounds[0], bounds[1]);
  // saveSoon : branché sur l'onChange des champs réserve/débit — même motif que
  // setTempleAuto, une save() pleine par frappe est un gaspillage (audit A.8).
  saveSoon();
  render();
}

export function setAutomateThreshold(id, raw) {
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule.threshold = Math.max(1, Math.min(99, val));
  save();
  render();
}

// ── Doctrine de crise (cf. CE-spec-idle-crises.md §A) ────────────────────────
// Setters UI : posture par palier + configuration de l'auto-effondrement.
export function setCrisisPosture(palier, stance) {
  if (!state.crisisDoctrine) return;
  if (!["p25", "p50", "p75"].includes(palier)) return;
  if (!["ask", "stabiliser", "temporiser"].includes(stance)) return;
  state.crisisDoctrine[palier] = stance;
  save();
  invalidateRenderCache("all");
  render();
}

export function setAutoCollapseConfig(patch) {
  const ac = state.crisisDoctrine && state.crisisDoctrine.autoCollapse;
  if (!ac || !patch) return;
  if ("enabled" in patch) ac.enabled = Boolean(patch.enabled);
  if ("trigger" in patch && ["rupture100", "usure", "temps"].includes(patch.trigger)) ac.trigger = patch.trigger;
  if ("usureThreshold" in patch) { const v = parseFloat(patch.usureThreshold); if (!isNaN(v)) ac.usureThreshold = Math.max(0.1, Math.min(1, v)); }
  if ("timeSeconds" in patch) { const v = parseInt(patch.timeSeconds, 10); if (!isNaN(v)) ac.timeSeconds = Math.max(30, Math.min(24 * 3600, v)); }
  if ("prepare" in patch) ac.prepare = Boolean(patch.prepare);
  save();
  invalidateRenderCache("all");
  render();
}

// Le lot d'UN exemplaire laisserait-il au moins `reserve` (fraction du stock
// courant) sur chaque devise dépensée ? Comparaisons en Decimal de bout en bout :
// les stocks dépassent vite le float.
function leavesReserve(building, reserve) {
  const prices = buildingBatchCost(building, 1);
  for (const [currency, price] of Object.entries(prices)) {
    const stock = D(state[currency] || 0);
    if (stock.sub(D(price)).lt(stock.mul(reserve))) return false;
  }
  return true;
}

export function checkAutomateRules() {
  let didBuy = false;
  for (const rule of getAutomateRules()) {
    if (!rule.enabled) continue;
    if (rule.type === "buy_cheapest") {
      const [rMin, rMax] = AUTOMATE_FIELD_BOUNDS.reservePct;
      const [pMin, pMax] = AUTOMATE_FIELD_BOUNDS.perTick;
      const reserve = clamp(Number(rule.reservePct) || 0, rMin, rMax) / 100;
      const perTick = clamp(Math.floor(Number(rule.perTick) || 1), pMin, pMax);
      let bought = 0;
      let lastName = "";
      for (let pass = 0; pass < perTick; pass += 1) {
        const cheapest = buildings
          .filter((b) => b.category === rule.category && isUnlocked(b)
            && BUY_ALL_CURRENCIES.has(b.currency)
            && (!b.extraCost || Object.keys(b.extraCost).every((c) => BUY_ALL_CURRENCIES.has(c))))
          .sort((a, b) => {
            const cA = buildingCostAt(a, state.buildings[a.id] || 0)[a.currency] || 0;
            const cB = buildingCostAt(b, state.buildings[b.id] || 0)[b.currency] || 0;
            return D(cA).cmp(cB);
          })[0];
        if (!cheapest) break;
        // RÉSERVE : ce que l'automate ne touche pas. Sans elle, l'auto-achat
        // vidait la caisse et sabotait les autres branches, donc on le laissait
        // éteint. Testée sur TOUTES les devises du lot, coût principal et
        // extraCost compris, sinon la réserve fuit par la porte de derrière.
        if (reserve > 0 && !leavesReserve(cheapest, reserve)) break;
        // buyBuildingCore paie, incrémente ET applique les contraintes de Mythe
        // (Babel/Sisyphe/Prométhée) + lifetimePurchases — que l'ancien payCost direct
        // contournait ; la garde de devise ci-dessus empêche de drainer les Ruines via
        // ruin_architects (M5). silent : l'automate garde sa propre chronique.
        if (!buyBuildingCore(cheapest.id, { amount: 1, silent: true })) break;
        bought += 1;
        lastName = tr(cheapest.name).toLowerCase();
      }
      if (bought > 0) {
        invalidateRenderCache("buildings");
        didBuy = true;
        // UNE ligne par tick, quel que soit le débit : dix lignes par seconde
        // noieraient la Chronique.
        chronicle(bought === 1
          ? `Les mécanismes automatiques ont discrètement érigé : ${lastName}.`
          : `Les mécanismes automatiques ont discrètement érigé ${bought} bâtiments, jusqu'à : ${lastName}.`);
      }
    }
    if (rule.type === "crisis_action") {
      // Le SEUIL de la règle fait foi (1-99 %), PAS l'ouverture de crise :
      // crisisOpen() exige déjà instability >= 100 %, ce qui rendait le seuil
      // mort (l'automate ne pouvait tirer qu'à 100 % pile). On exclut la crise
      // terminale, où seul l'intendant (force) agit.
      if (state.crisisLimitAnnounced || state.instability * 100 < rule.threshold) continue;
      const costs = crisisCosts();
      // Garde : un actionId absent de crisisCosts() donne `undefined` →
      // canPayCost fait Object.entries(undefined) → throw dans le tick.
      const cost = costs[rule.actionId];
      if (cost && canPayCost(cost)) {
        runCrisisAction(rule.actionId, { render: false });
      }
    }
  }
  if (didBuy) render();
}
