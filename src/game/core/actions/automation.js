"use strict";

import {
  state,
  defaultAutoScriptRules,
  defaultAutomateRules,
  invalidateRenderCache,
  render,
  save
} from '../state.js';

import {
  buildingCostAt,
  buildingBatchCost,
  isUnlocked,
  crisisOpen,
  crisisCosts
} from '../mechanics.js';

import { buildings } from '../../data/buildings.js';
import { canPayCost, payCost } from '../utils.js';
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
      log(`Script : "${rule.label} ${rule.threshold}${rule.unit}" — effondrement declenche.`);
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

export function setAutomateThreshold(id, raw) {
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule.threshold = Math.max(1, Math.min(99, val));
  save();
  render();
}

export function checkAutomateRules() {
  let didBuy = false;
  for (const rule of getAutomateRules()) {
    if (!rule.enabled) continue;
    if (rule.type === "buy_cheapest") {
      const cheapest = buildings
        .filter((b) => b.category === rule.category && isUnlocked(b))
        .sort((a, b) => {
          const cA = buildingCostAt(a, state.buildings[a.id] || 0)[a.currency] || 0;
          const cB = buildingCostAt(b, state.buildings[b.id] || 0)[b.currency] || 0;
          return D(cA).cmp(cB);
        })[0];
      if (cheapest) {
        const cost = buildingBatchCost(cheapest, 1);
        if (canPayCost(cost)) {
          payCost(cost);
          state.buildings[cheapest.id] = (state.buildings[cheapest.id] || 0) + 1;
          invalidateRenderCache("buildings");
          didBuy = true;
          chronicle(`Les mécanismes automatiques ont discrètement érigé : ${cheapest.name.toLowerCase()}.`);
        }
      }
    }
    if (rule.type === "crisis_action") {
      if (!crisisOpen()) continue;
      if (state.instability * 100 >= rule.threshold) {
        const costs = crisisCosts();
        if (canPayCost(costs[rule.actionId])) {
          runCrisisAction(rule.actionId, { render: false });
        }
      }
    }
  }
  if (didBuy) render();
}
