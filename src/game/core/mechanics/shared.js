"use strict";

// Primitives partagées entre les sous-modules de mechanics. Niveau « leaf » :
// dépend uniquement de l'état, des données et de num — jamais d'un autre
// sous-module mechanics → racine du DAG, aucun cycle possible.
import { state, renderCache } from '../state.js';
import { upgrades } from '../../data/upgrades.js';
import { eras } from '../../data/world.js';
import { isMythEffectActive } from '../../data/myths.js';
import { D } from '../num.js';

export function has(id) {
  return Boolean(state.upgrades[id]);
}

export function hasDoctrine(id) {
  return state.dynastyDoctrine === id;
}

export function isUnlocked(item) {
  if (item.id && item.category && (state.buildings[item.id] || 0) > 0) return true;
  if (item.unlockCycles && state.cycles < item.unlockCycles) return false;
  if (item.unlockBuilding) {
    const have = state.buildings[item.unlockBuilding.id] || 0;
    if (have < item.unlockBuilding.count) return false;
  }
  if (item.group === "ruins" && item.cost?.ruins > 500000000) {
    const minCycles = item.cost.ruins > 50000000000 ? 10 : item.cost.ruins > 5000000000 ? 9 : 8;
    if (state.cycles < minCycles) return false;
  }
  return true;
}

export function totalBuildingCount() {
  return Object.values(state.buildings).reduce((sum, count) => sum + count, 0);
}

function ruinEffects() {
  if (isMythEffectActive("mythe_du_chaos")) return { sums: {}, ownedCount: 0 };

  const signature = Object.keys(state.upgrades)
    .filter((id) => state.upgrades[id])
    .sort()
    .join("|");

  if (renderCache.cachedRuinEffects && renderCache.cachedRuinEffectsSignature === signature) return renderCache.cachedRuinEffects;

  const sums = {};
  let ownedCount = 0;
  for (const upgrade of upgrades) {
    if (upgrade.group !== "ruins" || !has(upgrade.id)) continue;
    ownedCount += 1;
    if (upgrade.effectType) sums[upgrade.effectType] = (sums[upgrade.effectType] || 0) + upgrade.amount;
  }

  renderCache.cachedRuinEffectsSignature = signature;
  renderCache.cachedRuinEffects = { sums, ownedCount };
  return renderCache.cachedRuinEffects;
}

export function ruinEffectSum(type) {
  return ruinEffects().sums[type] || 0;
}

export function ruinEffectMultiplier(type) {
  return 1 + ruinEffectSum(type);
}

// Exporté pour chronicleEngineMultiplier (production.js) ; volontairement NON
// re-exporté par le baril mechanics.js (helper interne au paquet).
export function ownedRuinUpgradeCount() {
  return ruinEffects().ownedCount;
}

export function crisisOpen() {
  return state.instability >= 1 || (state.timeWear || 0) >= 1;
}

export function currentEraIndex() {
  let index = 0;
  const population = D(state.population);
  // Early-exit : les seuils sont croissants, donc dès qu'on est sous l'un d'eux
  // on l'est pour tous les suivants. Indispensable depuis le filet d'ères
  // procédural (eras.length ~ centaines) appelé à chaque tick.
  for (let i = 0; i < eras.length; i += 1) {
    if (population.gte(eras[i].at)) index = i; else break;
  }
  return index;
}

export function nextEraProgress(index) {
  const current = eras[index];
  const next = eras[index + 1];
  if (!next) return 1;
  // Decimal-safe : les seuils d'ères transcendantes (.at) dépassent le domaine
  // float et sont des Decimal → Math.log10/Math.max les coercent (NaN en prod,
  // throw en dev). On passe par Decimal.log10(), qui renvoie un number (le log
  // tient toujours en float), puis on fait l'arithmétique en number.
  const baseLog = D(current.at).max(1).log10();
  const span = D(next.at).log10() - baseLog;
  if (span <= 0) return 1;
  const done = D(state.population).max(D(current.at).max(1)).log10() - baseLog;
  return Math.max(0, Math.min(1, done / span));
}

export function mapStage() {
  const b = state.buildings;
  const cnt = (id) => b[id] || 0;
  if (cnt("imperial_exchanges") >= 1) return 16;
  if (cnt("mint_houses") >= 1 || cnt("public_works") >= 3) return 15;
  if (cnt("water_mills") >= 3) return 14;
  if (cnt("water_mills") >= 1 || cnt("courthouses") >= 3) return 13;
  if (cnt("river_ports") >= 3) return 12;
  if (cnt("river_ports") >= 1 || cnt("bureaucracy") >= 3) return 11;
  if (cnt("irrigated_fields") >= 3) return 10;
  if (cnt("irrigated_fields") >= 1 || cnt("sewers") >= 3) return 9;
  if (cnt("guilds") >= 3) return 8;
  if (cnt("guilds") >= 1 || cnt("aqueducts") >= 3) return 7;
  if (cnt("markets") >= 3) return 6;
  if (cnt("caravans") >= 3 || cnt("markets") >= 1) return 5;
  if (cnt("caravans") >= 1) return 4;
  if (cnt("granaries_city") >= 3) return 3;
  if (cnt("granaries_city") >= 1) return 2;
  if (cnt("foragers") >= 3) return 1;
  return 0;
}
