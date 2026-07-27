"use strict";

// Synergies par bâtiment (paliers de jalon) et sommation des sorties de base par
// catégorie, avec bascule float→Decimal en cas de débordement. Feuille du DAG
// production : ne dépend que de state/data/shared/num. `getBuildingSums` est
// consommé par pressure.js et rates.js (exporté pour le paquet, hors API publique).
import { state, renderCache } from '../../state.js';
import { buildings } from '../../../data/buildings.js';
import { fmt } from '../../utils.js';
import { Decimal, D } from '../../num.js';
import { ruinEffectSum } from '../shared.js';

// Pas des jalons de bâtiments : 25 achats par défaut, 20 avec le capstone
// « Ville-Monde » (effectType milestoneStep). Source unique — consommé ici et
// par l'achat (building.js, détection de franchissement + Fêtes de jalon).
export function milestoneStepSize() {
  return Math.max(5, 25 - ruinEffectSum("milestoneStep"));
}

export function buildingOutputMultiplier(building, count) {
  if (count <= 0) return 1;
  const milestone = Math.floor(count / milestoneStepSize());
  if (building.category !== "city") {
    return Math.pow(1.015, count) * Math.pow(1.5, milestone) * (1 + Math.log10(count + 1) * 0.12);
  }
  const continuousGrowth = Math.pow(1.025, count);
  const milestoneGrowth = Math.pow(2, milestone);
  const earlySurge = 1 + Math.log10(count + 1) * 0.18;
  return continuousGrowth * milestoneGrowth * earlySurge;
}

// Miroir Decimal de buildingOutputMultiplier (synergies au-delà du float).
export function buildingOutputMultiplierDec(building, count) {
  if (count <= 0) return new Decimal(1);
  const milestone = Math.floor(count / milestoneStepSize());
  if (building.category !== "city") {
    return Decimal.pow(1.015, count).mul(Decimal.pow(1.5, milestone)).mul(1 + Math.log10(count + 1) * 0.12);
  }
  return Decimal.pow(1.025, count).mul(Decimal.pow(2, milestone)).mul(1 + Math.log10(count + 1) * 0.18);
}

export function buildingMilestoneInfo(building, count) {
  const milestone = Math.floor(count / milestoneStepSize());
  if (milestone <= 0) return null;
  const bonus = building.category === "city" ? Math.pow(2, milestone) : Math.pow(1.5, milestone);
  return {
    milestone,
    bonus,
    label: `x${fmt(bonus)} atteint`
  };
}

// « Rives fécondes » : les moteurs riverains (ports, moulins) produisent plus —
// le fleuve devient une mécanique, pas seulement un décor.
// Exporté depuis B3 : le bilan par bâtiment doit recomposer EXACTEMENT la même
// base que getBuildingSums, et redupliquer cette règle chez lui la ferait dériver.
export function riverEngineFactor(building) {
  if (building.id !== "river_ports" && building.id !== "water_mills") return 1;
  return 1 + ruinEffectSum("riverEngineMult");
}

// Facteur unitaire COMPLET d'un bâtiment : synergie de jalons × Rives fécondes.
// Source UNIQUE consommée par getBuildingSums ET par l'aperçu de la boutique
// (BuildingShop) — l'aperçu recomposait le sien sans riverEngineFactor et
// mentait sur les ports/moulins.
export function buildingUnitFactor(building, count) {
  return buildingOutputMultiplier(building, count) * riverEngineFactor(building);
}

export function getBuildingSums() {
  if (renderCache._buildingSums) return renderCache._buildingSums;

  let positiveInstability = 0;
  let negativeInstability = 0;
  let buildingCount = 0;
  let stabilizerCount = 0; // bâtiments à instabilité négative (égouts, tribunaux…)
  const baseSumsByCategory = {};

  for (const b of buildings) {
    const count = state.buildings[b.id] || 0;
    buildingCount += count;

    if (b.instability > 0) {
      positiveInstability += b.instability * count;
    } else if (b.instability < 0) {
      negativeInstability += b.instability * count;
      stabilizerCount += count;
    }

    if (count > 0) {
      const synergy = buildingUnitFactor(b, count);
      const cat = b.category || "other";
      if (!baseSumsByCategory[cat]) {
        baseSumsByCategory[cat] = { pop: 0, food: 0, gold: 0, knowledge: 0, infra: 0 };
      }
      baseSumsByCategory[cat].pop += (b.pop || 0) * count * synergy;
      baseSumsByCategory[cat].food += (b.food || 0) * count * synergy;
      baseSumsByCategory[cat].gold += (b.gold || 0) * count * synergy;
      baseSumsByCategory[cat].knowledge += (b.knowledge || 0) * count * synergy;
      baseSumsByCategory[cat].infra += (b.infra || 0) * count * synergy;
    }
  }

  // Détection de débordement float : très tard, les synergies exponentielles
  // (1.025^count * 2^paliers) dépassent 1.8e308. On rebascule alors les sommes
  // en Decimal — rates() suivra le chemin Decimal.
  let overflow = false;
  for (const catSums of Object.values(baseSumsByCategory)) {
    if (!Number.isFinite(catSums.pop + catSums.food + catSums.gold + catSums.knowledge + catSums.infra)) {
      overflow = true;
      break;
    }
  }
  if (overflow) {
    for (const b of buildings) {
      const count = state.buildings[b.id] || 0;
      if (count <= 0) continue;
      const cat = b.category || "other";
      const catSums = baseSumsByCategory[cat];
      if (!(catSums.pop instanceof Decimal)) {
        baseSumsByCategory[cat] = { pop: D(0), food: D(0), gold: D(0), knowledge: D(0), infra: D(0) };
      }
      const target = baseSumsByCategory[cat];
      const synergy = buildingOutputMultiplierDec(b, count).mul(riverEngineFactor(b));
      target.pop = target.pop.add(synergy.mul((b.pop || 0) * count));
      target.food = target.food.add(synergy.mul((b.food || 0) * count));
      target.gold = target.gold.add(synergy.mul((b.gold || 0) * count));
      target.knowledge = target.knowledge.add(synergy.mul((b.knowledge || 0) * count));
      target.infra = target.infra.add(synergy.mul((b.infra || 0) * count));
    }
  }

  renderCache._buildingSums = {
    positiveInstability,
    negativeInstability,
    buildingCount,
    stabilizerCount,
    baseSumsByCategory,
    overflow
  };
  return renderCache._buildingSums;
}
