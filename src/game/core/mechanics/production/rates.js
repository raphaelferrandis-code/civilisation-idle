"use strict";

// Orchestrateur de la production : rates() assemble les 5 taux de ressources (en
// Decimal) et l'instabilité à partir des sommes de bâtiments, des multiplicateurs
// globaux, des effets de Mythe/épitaphe et des leviers de crise. Sommet du DAG
// (L2) : consomme pressure, globalMultipliers, buildingOutput, mythEffects,
// crisisLevers. terminalPrepMultiplier reste privé (seul rates l'utilise).
import { state, renderCache } from '../../state.js';
import { Decimal, D, toNum } from '../../num.js';
import {
  ICARE_CLIMB_RUPTURE_HASTE,
  BABEL_RUPTURE_MULT,
  BRAISIERS_DURATION_MS,
  BRAISIERS_FOOD_MULT,
  OR_RUPTURE_CAP,
  isMythEffectActive
} from '../../../data/myths.js';
import { ACTIVE_RUIN_GOLD_PROD_MULT, hasActiveRuin } from '../../../data/activeRuins.js';
import { has, ruinEffectMultiplier } from '../shared.js';
import { cityVitals, pressureBreakdown } from './pressure.js';
import { getBuildingSums } from './buildingOutput.js';
import { globalMultiplier, globalMultiplierDec } from './globalMultipliers.js';
import { crisisProductionMultiplier, theocracyKnowledgeRate } from './crisisLevers.js';
import {
  babelExponentialMult,
  babelExponentialMultDec,
  babelCommonTongueMult,
  hephInfraMult,
  hephPopProdMult,
  epitaphLegacyEffect,
  cadmosStabilityMultiplier,
  cadmosProductionMultiplier
} from './mythEffects.js';

// Multiplicateur de production issu des préparations terminales (malus jusqu'à l'effondrement).
function terminalPrepMultiplier(resource) {
  const tp = state.terminalPreparations;
  if (!tp) return 1;
  if (resource === "infrastructure") return 1 + (tp.infraBonus || 0);
  const malus = resource === "food" ? tp.foodMalus
    : resource === "gold" ? tp.goldMalus
    : resource === "knowledge" ? tp.knowledgeMalus
    : 0;
  return Math.max(0.15, 1 - (malus || 0));
}

// rates() retourne les 5 taux de ressources en Decimal (le tick fait .add) et
// `instability` en number natif (jauge bornée 0-1).
// Deux chemins qui DOIVENT évoluer ensemble :
//   - float : identique bit-à-bit à l'implémentation pré-Decimal tant que tout
//     reste fini (cas de 99,9 % des parties — et garantie golden-master) ;
//   - Decimal : miroir activé dès qu'une valeur déborde ~1.8e308.
export function rates(vitals = cityVitals(), pressure = pressureBreakdown(), forceDecimalPath = false) {
  // forceDecimalPath : séam réservé aux tests de parité — force la branche Decimal
  // sur un état sous le plafond float, pour vérifier qu'elle égale la branche float.
  if (!forceDecimalPath && renderCache._frameRatesVer === renderCache.frameVersion) return renderCache._frameRates;

  const _babelExpMult  = babelExponentialMult();
  const _hephInfraFactor = hephInfraMult();
  // Étouffement de la production de population par les Mythes (Héphaïstos : déclin ;
  // Âge d'Or : plafond). Neutre (×1) hors de ces Mythes.
  const _popSuppressFactor = hephPopProdMult();
  const babelActive = isMythEffectActive("mythe_de_babel");

  const sums = getBuildingSums();
  const baseSumsByCategory = sums.baseSumsByCategory;

  // Facteurs « petits » partagés par les deux chemins (tous bornés).
  // Le Mythe de Prométhée n'a PLUS de bonus de Nourriture (retiré 2026-07-19 :
  // il finançait lui-même la course et rendait le défi trivial). Seuls les
  // Braisiers — l'HÉRITAGE — multiplient encore ce facteur.
  let prometheeFoodMult = 1;
  if (state.prometheeBraisiers) {
    // cycleElapsed >= 0 : sous l'horloge virtuelle d'un versement de clepsydre,
    // un elapsed NÉGATIF (virtual < cycleStartedAt) ne doit pas armer la fenêtre.
    const cycleElapsed = Date.now() - (state.cycleStartedAt || Date.now());
    if (cycleElapsed >= 0 && cycleElapsed < BRAISIERS_DURATION_MS) prometheeFoodMult *= BRAISIERS_FOOD_MULT;
  }
  const _epitaphEffect = epitaphLegacyEffect();
  const _rawInstability = Math.max(0, pressure.total - vitals.instabilityRelief)
    // Vol par paliers : chaque altitude fait grimper la Rupture plus vite — la
    // contrepartie du ×2 de production, pendant le Mythe COMME sous l'Aile.
    * (1 + ((isMythEffectActive("mythe_d_icare") || state.icareHeritage) ? (state.icareAltitude || 0) * ICARE_CLIMB_RUPTURE_HASTE : 0))
    * (babelActive ? BABEL_RUPTURE_MULT : 1)
    * cadmosStabilityMultiplier()
    * _epitaphEffect.ruptureMult;
  const instability = isMythEffectActive("mythe_age_or")
    ? Math.min(OR_RUPTURE_CAP, _rawInstability)
    : _rawInstability;
  const atridesDrain = isMythEffectActive("mythe_atrides") && !state.atridesDrainDisabled;
  const eneeDegraded = isMythEffectActive("mythe_d_enee") && state.eneeDegraded;

  const popF = toNum(state.population);
  const knowF = toNum(state.knowledge);

  // ── Chemin float (rapide et exact sous le plafond float) ────────────────
  if (!forceDecimalPath && !sums.overflow) {
    let pop = 0.04;
    let food = popF * 0.012;
    let gold = Math.max(0, popF - 25) * 0.0015;
    let knowledge = 0;
    let infra = 0;

    for (const [cat, catSums] of Object.entries(baseSumsByCategory)) {
      const babelMult = (babelActive && cat === state.babelCategory) ? _babelExpMult : 1;
      // « La Langue commune » (héritage Babel) : +20 % sur la catégorie déclarée.
      const totalMult = babelMult * babelCommonTongueMult(cat);
      const hephBonus = (_hephInfraFactor > 1 && cat === "infra") ? _hephInfraFactor : 1;

      pop += catSums.pop * totalMult;
      food += catSums.food * totalMult;
      gold += catSums.gold * totalMult;
      knowledge += catSums.knowledge * totalMult;
      infra += catSums.infra * totalMult * hephBonus;
    }

    food *= prometheeFoodMult;

    const mult = globalMultiplier();
    food *= ruinEffectMultiplier("foodMult");
    gold *= ruinEffectMultiplier("goldMult");
    knowledge *= ruinEffectMultiplier("knowledgeMult");
    infra *= ruinEffectMultiplier("infraMult");

    let populationRate = pop * mult * _epitaphEffect.globalMult * vitals.populationMult * ruinEffectMultiplier("populationMult") * crisisProductionMultiplier("population") * _popSuppressFactor;
    let foodRate = food * Math.sqrt(mult) * _epitaphEffect.globalMult * _epitaphEffect.foodMult * vitals.foodMult * crisisProductionMultiplier("food") * terminalPrepMultiplier("food") * cadmosProductionMultiplier("food");
    let goldRate = gold * Math.sqrt(mult) * _epitaphEffect.globalMult * _epitaphEffect.goldMult * (1 + state.buildings.markets * 0.032 + state.buildings.guilds * 0.024) * vitals.goldMult * crisisProductionMultiplier("gold") * terminalPrepMultiplier("gold") * (hasActiveRuin(state, "age_or") ? ACTIVE_RUIN_GOLD_PROD_MULT : 1) * cadmosProductionMultiplier("gold");
    let knowledgeRate = knowledge * mult * _epitaphEffect.globalMult * _epitaphEffect.knowledgeMult * (1 + Math.log10(popF + 10) * 0.05) * vitals.knowledgeMult * crisisProductionMultiplier("knowledge") * terminalPrepMultiplier("knowledge") + theocracyKnowledgeRate();
    let infrastructureRate = infra * mult * _epitaphEffect.globalMult * _epitaphEffect.infraMult * (1 + Math.log10(knowF + 10) * 0.04) * vitals.infraMult * crisisProductionMultiplier("infrastructure") * terminalPrepMultiplier("infrastructure");

    if (atridesDrain) {
      foodRate *= 0.9;
      goldRate *= 0.9;
      knowledgeRate *= 0.9;
      infrastructureRate *= 0.9;
    }
    if (eneeDegraded) {
      foodRate = 0;
      goldRate = 0;
    }

    if (Number.isFinite(populationRate) && Number.isFinite(foodRate) && Number.isFinite(goldRate)
      && Number.isFinite(knowledgeRate) && Number.isFinite(infrastructureRate)) {
      const baseRates = {
        population: new Decimal(populationRate),
        food: new Decimal(foodRate),
        gold: new Decimal(goldRate),
        knowledge: new Decimal(knowledgeRate),
        infrastructure: new Decimal(infrastructureRate),
        instability
      };
      renderCache._frameRates = baseRates;
      renderCache._frameRatesVer = renderCache.frameVersion;
      return baseRates;
    }
  }

  // ── Chemin Decimal (au-delà du plafond float) ────────────────────────────
  const babelExpD = babelExponentialMultDec();
  let popD = new Decimal(0.04);
  let foodD = D(state.population).mul(0.012);
  let goldD = D(state.population).sub(25).max(0).mul(0.0015);
  let knowledgeD = new Decimal(0);
  let infraD = new Decimal(0);

  for (const [cat, catSums] of Object.entries(baseSumsByCategory)) {
    const babelMultD = (babelActive && cat === state.babelCategory) ? babelExpD : new Decimal(1);
    const totalMultD = babelMultD.mul(babelCommonTongueMult(cat));
    const hephBonus = (_hephInfraFactor > 1 && cat === "infra") ? _hephInfraFactor : 1;

    popD = popD.add(D(catSums.pop).mul(totalMultD));
    foodD = foodD.add(D(catSums.food).mul(totalMultD));
    goldD = goldD.add(D(catSums.gold).mul(totalMultD));
    knowledgeD = knowledgeD.add(D(catSums.knowledge).mul(totalMultD));
    infraD = infraD.add(D(catSums.infra).mul(totalMultD).mul(hephBonus));
  }

  foodD = foodD.mul(prometheeFoodMult);

  const multD = globalMultiplierDec();
  const sqrtMultD = multD.sqrt();
  foodD = foodD.mul(ruinEffectMultiplier("foodMult"));
  goldD = goldD.mul(ruinEffectMultiplier("goldMult"));
  knowledgeD = knowledgeD.mul(ruinEffectMultiplier("knowledgeMult"));
  infraD = infraD.mul(ruinEffectMultiplier("infraMult"));

  const theocracyD = has("trait_theocracy") ? D(state.gold).mul(0.01) : new Decimal(0);
  const baseRates = {
    population: popD.mul(multD).mul(_epitaphEffect.globalMult * vitals.populationMult * ruinEffectMultiplier("populationMult") * crisisProductionMultiplier("population") * _popSuppressFactor),
    food: foodD.mul(sqrtMultD).mul(_epitaphEffect.globalMult * _epitaphEffect.foodMult * vitals.foodMult * crisisProductionMultiplier("food") * terminalPrepMultiplier("food") * cadmosProductionMultiplier("food")),
    gold: goldD.mul(sqrtMultD).mul(_epitaphEffect.globalMult * _epitaphEffect.goldMult * (1 + state.buildings.markets * 0.032 + state.buildings.guilds * 0.024) * vitals.goldMult * crisisProductionMultiplier("gold") * terminalPrepMultiplier("gold") * (hasActiveRuin(state, "age_or") ? ACTIVE_RUIN_GOLD_PROD_MULT : 1) * cadmosProductionMultiplier("gold")),
    knowledge: knowledgeD.mul(multD).mul(_epitaphEffect.globalMult * _epitaphEffect.knowledgeMult * (1 + D(state.population).add(10).log10() * 0.05) * vitals.knowledgeMult * crisisProductionMultiplier("knowledge") * terminalPrepMultiplier("knowledge")).add(theocracyD),
    infrastructure: infraD.mul(multD).mul(_epitaphEffect.globalMult * _epitaphEffect.infraMult * (1 + D(state.knowledge).add(10).log10() * 0.04) * vitals.infraMult * crisisProductionMultiplier("infrastructure") * terminalPrepMultiplier("infrastructure")),
    instability
  };

  if (atridesDrain) {
    baseRates.food = baseRates.food.mul(0.9);
    baseRates.gold = baseRates.gold.mul(0.9);
    baseRates.knowledge = baseRates.knowledge.mul(0.9);
    baseRates.infrastructure = baseRates.infrastructure.mul(0.9);
  }
  if (eneeDegraded) {
    baseRates.food = new Decimal(0);
    baseRates.gold = new Decimal(0);
  }

  renderCache._frameRates = baseRates;
  renderCache._frameRatesVer = renderCache.frameVersion;
  return baseRates;
}
