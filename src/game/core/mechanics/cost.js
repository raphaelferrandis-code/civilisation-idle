"use strict";

// Coûts des bâtiments (unitaire + lot) et archéologie. Leaf : importe shared.
import { state, buildingById } from '../state.js';
import { buildings } from '../../data/buildings.js';
import { Decimal, D } from '../num.js';
import { clamp, canPayCost } from '../utils.js';
import { SISYPHE_SCALE_REDUCTION } from '../../data/myths.js';
import { ACTIVE_RUIN_FOOD_ENGINE_COST_MULT, ACTIVE_RUIN_BABEL_COST_MULT, hasActiveRuin } from '../../data/activeRuins.js';

// Catégorie sur laquelle la cité s'appuie le plus (par nombre de bâtiments).
// Sert au fardeau « Confusion des langues » : il frappe ce qui a été réellement
// construit, et se déplace si le joueur se réoriente.
function dominantBuildingCategory() {
  const parCategorie = {};
  for (const b of buildings) {
    const n = state.buildings[b.id] || 0;
    if (n > 0) parCategorie[b.category] = (parCategorie[b.category] || 0) + n;
  }
  let best = null;
  for (const [cat, n] of Object.entries(parCategorie)) {
    if (!best || n > best.n) best = { cat, n };
  }
  return best ? best.cat : null;
}
import { ENRACINEMENT_COST_MULT, MAX_BUY_HARD_CAP } from '../balance.js';
import { has, ruinEffectSum, totalBuildingCount } from './shared.js';
import { milestoneStepSize } from './production/buildingOutput.js';

// Retourne le facteur de scaling effectif d'un bâtiment.
// Héritage Sisyphe : réduit la croissance du scaling de SISYPHE_SCALE_REDUCTION.
function buildingEffectiveScale(building) {
  if (!state.sisypheHeritage) return building.scale;
  return 1 + (building.scale - 1) * (1 - SISYPHE_SCALE_REDUCTION);
}

// Facteur de coût de construction de l'héritage « Réseau de routes » : -5%
// multiplicatif par effondrement traversé (cycles), plafonné à -60% (mult 0.40).
// Exporté pour que la Boutique affiche EXACTEMENT la remise appliquée ici.
export function reseauRoutesCostMult(cycles) {
  return Math.max(0.40, Math.pow(0.95, cycles || 0));
}

function buildingDiscount(building) {
  let discount = 1;
  // -5% par effondrement traversé (cycles), plafonné à -60% : les anciennes routes
  // se souviennent des chemins d'avant la chute (ex-remise « par dynastie »).
  if (has("reseau_routes")) discount *= reseauRoutesCostMult(state.cycles);
  if (has("trait_nomadism")) discount *= 0.7;
  // Dogme « Enracinement » : fin de l'entretien A2 (tick.js) contre +15 % partout.
  if (has("trait_enracinement")) discount *= ENRACINEMENT_COST_MULT;
  // « Grand cadastre » : les Routes coûtent −25 % (le réseau se densifie).
  if (building.id === "roads" && has("grand_cadastre")) discount *= 0.75;
  if (building.category === "city") discount *= Math.max(0.35, 1 - ruinEffectSum("cityDiscount"));
  if (building.category === "knowledge") discount *= Math.max(0.35, 1 - ruinEffectSum("knowledgeDiscount"));
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
  // « Confusion des langues » est appliquée ICI en plus de buildingBatchCost, parce
  // que c'est cette fonction qui donne le prix AFFICHÉ : un fardeau que le joueur
  // ne voit qu'au moment de payer n'est pas un choix, c'est un piège.
  if (hasActiveRuin(state, "babel") && building.category === dominantBuildingCategory()) {
    for (const currency of Object.keys(costs)) costs[currency] = costs[currency].mul(ACTIVE_RUIN_BABEL_COST_MULT);
  }
  return costs;
}

// Quantité qui amène EXACTEMENT au prochain jalon, jamais au-delà. Sentinelle
// 'step' du mode Palier : la quantité dépend du bâtiment (son compteur), elle ne
// peut donc pas vivre dans `state.buyAmount`, qui est global — même raison que
// pour 'max'. Fonction PURE et sans récursion : buildingBatchCost l'appelle, elle
// ne doit surtout pas rappeler buildingBatchCost.
export function stepBuyAmount(building) {
  const step = milestoneStepSize();
  const count = state.buildings[building.id] || 0;
  return step - (count % step);
}

// Tout ce qui est payable, sans plafond de lot. La dichotomie partait d'un `hi`
// fixé à 500 : le mode Max, vendu par une amélioration, s'arrêtait donc là et
// obligeait à cliquer dix fois sur un bâtiment bon marché en milieu de partie.
// On SONDE d'abord vers le haut en doublant, puis on dichotomie dans le dernier
// intervalle. Les coûts croissant géométriquement, la sonde converge en une
// dizaine de doublements ; buildingBatchCost est en forme fermée, donc chaque
// essai coûte le même prix quel que soit le nombre demandé.
export function maxBuyAmount(building) {
  if (!canPayCost(buildingBatchCost(building, 1))) return 1;
  let lo = 1, hi = 2;
  while (hi < MAX_BUY_HARD_CAP && canPayCost(buildingBatchCost(building, hi))) {
    lo = hi;
    hi *= 2;
  }
  hi = Math.min(hi, MAX_BUY_HARD_CAP);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (canPayCost(buildingBatchCost(building, mid))) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(1, lo);
}

export function buildingBatchCost(building, amount = state.buyAmount) {
  // 'max' vaut 1 ici pour ne pas boucler : maxBuyAmount appelle cette fonction.
  // 'step', lui, se résout sans récursion.
  const resolved = amount === "max" ? 1 : amount === "step" ? stepBuyAmount(building) : amount;
  // Borne HAUTE (et pas MAX_BATCH_AMOUNT) : le mode Max crédite la quantité que
  // maxBuyAmount a trouvée, et c'est ce même appel qui en calcule le prix. Un
  // clamp plus bas ici ferait payer un lot de 500 pour un lot bien plus gros.
  const batchSize = clamp(Math.floor(Number(resolved) || 1), 1, MAX_BUY_HARD_CAP);
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
  // Ruine active « Pente du rocher » : la malédiction cumulative de l'ancien
  // Sisyphe survit dans le fardeau (cf. building.js). Depuis la refonte « la
  // Montée », le Mythe lui-même n'inflate plus les coûts.
  if (hasActiveRuin(state, "sisyphe") && (state.sisypheMult || 1) > 1) {
    const mult = state.sisypheMult;
    for (const currency of Object.keys(costs)) costs[currency] = costs[currency].mul(mult);
  }
  if (hasActiveRuin(state, "promethee") && building.food > 0) {
    for (const currency of Object.keys(costs)) costs[currency] = costs[currency].mul(ACTIVE_RUIN_FOOD_ENGINE_COST_MULT);
  }
  // Ruine active « Confusion des langues » : la catégorie sur laquelle la cité
  // s'appuie le plus devient plus chère. On vise la DOMINANTE (celle qui compte le
  // plus de bâtiments) plutôt qu'une catégorie tirée au sort : le fardeau frappe
  // ainsi ce que le joueur a réellement construit, et se déplace s'il se réoriente.
  if (hasActiveRuin(state, "babel") && building.category === dominantBuildingCategory()) {
    for (const currency of Object.keys(costs)) costs[currency] = costs[currency].mul(ACTIVE_RUIN_BABEL_COST_MULT);
  }
  return costs;
}

export function archaeologyCost() {
  const remembered = Object.values(state.lastCollapsedBuildings || {}).reduce((sum, count) => sum + count, 0);
  const base = D(state.population).mul(0.12).max(Math.max(25000, remembered * 8500));
  // « Chantiers de fouilles » : coût en savoir réduit de moitié.
  return has("chantiers_fouilles") ? base.mul(0.5) : base;
}

// Nombre d'exhumations par cycle : 1 de base (Archéologie), +2 avec les
// « Chantiers de fouilles » (effectType exhumeCharges).
export function exhumeChargesPerCycle() {
  return 1 + ruinEffectSum("exhumeCharges");
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
  const seed = Math.max(0, state.cycles * 31 + (state.grandResetCount || 0) * 17 + totalBuildingCount());
  const extras = [];
  for (let i = 0; extras.length < 5 - collapsed.length && i < advanced.length * 2; i++) {
    const b = advanced[(seed + i * 7) % advanced.length];
    if (b && !extras.find((e) => e.id === b.id)) extras.push(b);
  }
  return [...collapsed, ...extras];
}

export function canExhume() {
  return has("skill_archaeology")
    && (state.archaeologyUses || 0) < exhumeChargesPerCycle()
    && D(state.knowledge).gte(archaeologyCost());
}
