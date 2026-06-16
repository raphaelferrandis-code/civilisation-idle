"use strict";

// Coûts des bâtiments (unitaire + lot) et archéologie. Leaf : importe shared.
import { state, buildingById } from '../state.js';
import { buildings } from '../../data/buildings.js';
import { Decimal, D } from '../num.js';
import { clamp, canPayCost } from '../utils.js';
import { isMythEffectActive, SISYPHE_SCALE_REDUCTION } from '../../data/myths.js';
import { ACTIVE_RUIN_FOOD_ENGINE_COST_MULT, hasActiveRuin } from '../../data/activeRuins.js';
import { has, ruinEffectSum, totalBuildingCount } from './shared.js';

// Retourne le facteur de scaling effectif d'un bâtiment.
// Héritage Sisyphe : réduit la croissance du scaling de SISYPHE_SCALE_REDUCTION.
function buildingEffectiveScale(building) {
  if (!state.sisypheHeritage) return building.scale;
  return 1 + (building.scale - 1) * (1 - SISYPHE_SCALE_REDUCTION);
}

function buildingDiscount(building) {
  let discount = 1;
  // -5% par dynastie fondée, plafonné à -60% (sinon trivialise la progression longue)
  if (has("reseau_routes")) discount *= Math.max(0.40, Math.pow(0.95, state.dynastyCount));
  if (has("broken_milestones") && building.category === "city") discount *= 0.94;
  if (has("trait_nomadism")) discount *= 0.7;
  if (building.category === "city") discount *= Math.max(0.35, 1 - ruinEffectSum("cityDiscount"));
  if (building.category === "knowledge") discount *= Math.max(0.35, 1 - ruinEffectSum("knowledgeDiscount"));
  if (has("old_wall_maps") && building.category === "infra") discount *= 0.92;
  if (building.category === "infra") discount *= Math.max(0.35, 1 - ruinEffectSum("infraDiscount"));
  return discount;
}

// Coût unitaire base * scale^count * discount, en Decimal.
// Chemin float tant que le résultat est fini (identique bit-à-bit sous 2^53),
// arithmétique Decimal seulement au-delà de ~1.8e308.
function scaledCost(base, scale, count, discount) {
  const flt = base * Math.pow(scale, count) * discount;
  if (Number.isFinite(flt)) return new Decimal(flt);
  return D(scale).pow(count).mul(base).mul(discount);
}

export function buildingCostAt(building, count) {
  const discount = buildingDiscount(building);
  const scale = buildingEffectiveScale(building);
  const costs = { [building.currency]: scaledCost(building.base, scale, count, discount) };
  if (building.extraCost) {
    for (const [currency, amount] of Object.entries(building.extraCost)) {
      const extra = scaledCost(amount, scale, count, discount);
      costs[currency] = costs[currency] ? costs[currency].add(extra) : extra;
    }
  }
  return costs;
}

export function maxBuyAmount(building) {
  let lo = 0, hi = 500;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (canPayCost(buildingBatchCost(building, mid))) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(1, lo);
}

export function buildingBatchCost(building, amount = state.buyAmount) {
  const resolved = amount === "max" ? 1 : amount;
  const batchSize = clamp(Math.floor(Number(resolved) || 1), 1, 500);
  const count = state.buildings[building.id] || 0;
  // Calcule le discount et le scale effectif une seule fois pour tout le lot
  const discount = buildingDiscount(building);
  const scale    = buildingEffectiveScale(building);
  // Somme fermée de la série géométrique : coûts du palier count à count+batchSize-1.
  // Chemin float tant que le résultat est fini (identique sous 2^53), Decimal au-delà.
  const geomSum = (B, s, n, k) => {
    const flt = s === 1 ? B * k : B * Math.pow(s, n) * (Math.pow(s, k) - 1) / (s - 1);
    if (Number.isFinite(flt)) return new Decimal(flt * discount);
    return s === 1
      ? D(B).mul(k).mul(discount)
      : D(s).pow(n).mul(B).mul(D(s).pow(k).sub(1)).div(s - 1).mul(discount);
  };
  const costs = {};
  const mainSum = geomSum(building.base, scale, count, batchSize);
  costs[building.currency] = costs[building.currency] ? costs[building.currency].add(mainSum) : mainSum;
  if (building.extraCost) {
    for (const [currency, base] of Object.entries(building.extraCost)) {
      const extraSum = geomSum(base, scale, count, batchSize);
      costs[currency] = costs[currency] ? costs[currency].add(extraSum) : extraSum;
    }
  }
  // Mythe de Sisyphe : malédiction cumulative sur tous les coûts
  if (isMythEffectActive("mythe_de_sisyphe") && (state.sisypheMult || 1) > 1) {
    const mult = state.sisypheMult;
    for (const currency of Object.keys(costs)) costs[currency] = costs[currency].mul(mult);
  }
  if (hasActiveRuin(state, "promethee") && building.food > 0) {
    for (const currency of Object.keys(costs)) costs[currency] = costs[currency].mul(ACTIVE_RUIN_FOOD_ENGINE_COST_MULT);
  }
  return costs;
}

export function archaeologyCost() {
  const remembered = Object.values(state.lastCollapsedBuildings || {}).reduce((sum, count) => sum + count, 0);
  return D(state.population).mul(0.12).max(Math.max(25000, remembered * 8500));
}

export function archaeologyCandidates() {
  const entries = Object.entries(state.lastCollapsedBuildings || {})
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ building: buildingById[id], count }))
    .filter((e) => e.building)
    .sort((a, b) => (b.building.base * Math.max(1, b.count)) - (a.building.base * Math.max(1, a.count)));
  const collapsed = entries.map((e) => e.building).slice(0, 5);
  if (collapsed.length >= 3) return collapsed;
  // Compléter avec des bâtiments avancés si peu de collapsed
  const seen = new Set(collapsed.map((b) => b.id));
  const advanced = buildings.filter((b) => (b.base >= 100000 || b.category !== "city") && !seen.has(b.id));
  const seed = Math.max(0, state.cycles * 31 + state.dynastyCount * 17 + totalBuildingCount());
  const extras = [];
  for (let i = 0; extras.length < 5 - collapsed.length && i < advanced.length * 2; i++) {
    const b = advanced[(seed + i * 7) % advanced.length];
    if (b && !extras.find((e) => e.id === b.id)) extras.push(b);
  }
  return [...collapsed, ...extras];
}

export function canExhume() {
  return has("skill_archaeology") && !state.archaeologyUsed && D(state.knowledge).gte(archaeologyCost());
}
